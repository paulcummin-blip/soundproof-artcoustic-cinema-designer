import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { getAvailableCapacity, findActivationEntry } from '../../shared/capacityAuthority.js';

/**
 * B3A Trusted backend authority for Professional Project creation.
 *
 * Flow:
 *   Authenticated dealer requests project creation
 *     → Backend resolves authenticated user
 *     → Backend resolves authoritative User.account_id (NOT client-supplied)
 *     → Reject if account_id missing (ACCOUNT_NOT_LINKED)
 *     → Calculate available capacity from CapacityLedger SUM
 *     → Reject if capacity <= 0 (OUT_OF_CAPACITY)
 *     → Create Professional Project (commercial_tier=PROFESSIONAL)
 *     → Append PROJECT_ACTIVATION -1 ledger entry (idempotent)
 *     → Link activation_ledger_entry_id on Project
 *     → If ledger creation fails, compensate by deleting the Project (CREATION_FAILED)
 *
 * The client cannot supply an arbitrary account_id — it is always derived
 * from the authenticated user's record.
 *
 * Returns controlled states: SUCCESS, OUT_OF_CAPACITY, ACCOUNT_NOT_LINKED, CREATION_FAILED.
 */

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ status: 'ACCOUNT_NOT_LINKED', error: 'Unauthorized' }, { status: 401 });

    // ── 1. Resolve authoritative account_id from the authenticated user ──
    // Re-fetch as service role to get the authoritative account_id field
    // (user from auth.me() may not include custom data fields depending on token).
    const userRecords = await base44.asServiceRole.entities.User.filter({ id: user.id });
    const authoritativeUser = (Array.isArray(userRecords) && userRecords.length > 0) ? userRecords[0] : null;
    const accountId = authoritativeUser?.account_id || null;

    if (!accountId || accountId === '') {
      return Response.json({
        status: 'ACCOUNT_NOT_LINKED',
        message: 'Your user account is not linked to an organisation. Contact your administrator.'
      }, { status: 403 });
    }

    // ── 2. Parse project creation payload ──
    let body = {};
    try {
      body = await req.json();
    } catch (_e) {
      body = {};
    }
    const projectName = (body.name && String(body.name).trim()) || 'Untitled Professional Project';

    // ── 3. Check available capacity from ledger SUM ──
    const available = await getAvailableCapacity(base44.asServiceRole, accountId);
    if (available <= 0) {
      return Response.json({
        status: 'OUT_OF_CAPACITY',
        message: 'No Professional Project capacity available. Contact your distributor or administrator.',
        available_capacity: available
      }, { status: 403 });
    }

    // ── 4. Create the Professional Project ──
    const nowIso = new Date().toISOString();
    let project = null;
    try {
      project = await base44.asServiceRole.entities.Project.create({
        name: projectName,
        account_id: accountId,
        commercial_tier: 'PROFESSIONAL',
        professional_activated_date: nowIso,
        commercial_source: 'PILOT',
        lifecycle_status: 'Draft',
        project_status: 'Prospective'
      });
    } catch (createErr) {
      return Response.json({
        status: 'CREATION_FAILED',
        message: 'Unable to create the project. Please try again.'
      }, { status: 500 });
    }

    // ── 5. Append PROJECT_ACTIVATION -1 ledger entry (idempotent) ──
    const idempotencyKey = `activation:${project.id}`;
    let ledgerEntry = null;
    let ledgerError = null;

    try {
      // Idempotency guard: check if an activation entry already exists for this project.
      const existing = await findActivationEntry(base44.asServiceRole, project.id);
      if (existing) {
        ledgerEntry = existing;
      } else {
        ledgerEntry = await base44.asServiceRole.entities.CapacityLedger.create({
          account_id: accountId,
          transaction_type: 'PROJECT_ACTIVATION',
          delta: -1,
          idempotency_key: idempotencyKey,
          source_system: 'SOUND_PROOF',
          source_ref: { project_id: project.id },
          reason: `Project activation: ${projectName}`
        });
      }
    } catch (err) {
      ledgerError = err;
    }

    // ── 6. Failure safety: compensate if ledger creation failed ──
    if (ledgerError || !ledgerEntry) {
      // Rollback: delete the project to avoid orphaned project without activation.
      try {
        await base44.asServiceRole.entities.Project.delete(project.id);
      } catch (_rollbackErr) {
        // Best-effort rollback; the project remains but is unactivated.
        // This is a critical state — surfaced in the response for admin review.
        return Response.json({
          status: 'CREATION_FAILED',
          message: 'Project creation failed during activation. Please contact support.',
          project_id: project.id,
          rollback: 'FAILED — orphan project may exist',
          detail: 'Ledger creation failed and project rollback also failed.'
        }, { status: 500 });
      }
      return Response.json({
        status: 'CREATION_FAILED',
        message: 'Project creation failed during activation. No capacity was consumed.',
        rollback: 'SUCCESS — project deleted'
      }, { status: 500 });
    }

    // ── 7. Link activation_ledger_entry_id on the Project ──
    try {
      await base44.asServiceRole.entities.Project.update(project.id, {
        activation_ledger_entry_id: ledgerEntry.id
      });
    } catch (_linkErr) {
      // Non-fatal: the ledger entry exists and the project exists.
      // The link is a convenience field; the ledger idempotency_key is the real authority.
      // We still return SUCCESS since capacity was correctly consumed.
    }

    // ── 8. Return SUCCESS ──
    const remaining = await getAvailableCapacity(base44.asServiceRole, accountId);
    return Response.json({
      status: 'SUCCESS',
      project: {
        id: project.id,
        name: project.name,
        account_id: project.account_id,
        commercial_tier: 'PROFESSIONAL',
        professional_activated_date: nowIso,
        commercial_source: 'PILOT',
        activation_ledger_entry_id: ledgerEntry.id
      },
      capacity_before: available,
      capacity_after: remaining,
      ledger_entry: {
        id: ledgerEntry.id,
        transaction_type: ledgerEntry.transaction_type,
        delta: ledgerEntry.delta,
        idempotency_key: ledgerEntry.idempotency_key
      }
    }, { status: 201 });

  } catch (error) {
    return Response.json({
      status: 'CREATION_FAILED',
      message: 'An unexpected error occurred. Please try again.'
    }, { status: 500 });
  }
}