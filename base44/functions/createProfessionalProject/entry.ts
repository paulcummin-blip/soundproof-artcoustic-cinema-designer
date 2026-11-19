import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { getAvailableCapacity, findActivationEntry } from '../../shared/capacityAuthority.js';
import { findEffectivePromotion } from '../../shared/promotionAuthority.js';
import { assertCapability, resolveAccountAccess } from '../../shared/accountAccessAuthority.js';
import { associateDealerIdentityCore } from '../../shared/dealerIdentityAssociation.js';
import { acquireCreationLock, releaseCreationLock } from '../../shared/projectCreationLock.js';
import {
  findExistingReceipt,
  createPendingReceipt,
  completeReceipt,
  deleteReceipt,
} from '../../shared/projectCreationIdempotency.js';

/**
 * Trusted backend authority for Professional Project creation.
 *
 * Safeguards (credit & promotion integrity):
 *   1. Fail-closed eligibility: a failed Account or Promotion lookup returns
 *      ELIGIBILITY_CHECK_FAILED and creates NO project, promotion usage or
 *      ledger deduction. Only a successful lookup that confirms no applicable
 *      promotion proceeds to normal capacity charging.
 *   2. Request idempotency: an optional client `request_id` (UUID) makes a
 *      repeated request return its original result. A PENDING receipt
 *      reserves the request so a retry during an in-flight creation backs
 *      off (CREATION_BUSY) instead of creating a second project.
 *   3. Per-account serialized creation: a single-record conditional
 *      updateMany on the Account (creation_lock_holder: null -> token)
 *      serializes creation per account, so two simultaneous requests with one
 *      remaining credit cannot both succeed. This is per-account
 *      serialization, NOT a global exactly-once guarantee.
 *
 * Flow:
 *   Authenticated dealer requests project creation
 *     → Backend resolves authenticated user
 *     → Backend resolves authoritative User.account_id (NOT client-supplied)
 *     → Reject if account_id missing (ACCOUNT_NOT_LINKED)
 *     → FAIL-CLOSED Account + Promotion eligibility lookup
 *     → Acquire per-account creation lock
 *     → Replay idempotency receipt if present
 *     → Calculate available capacity (or free under an active promotion)
 *     → Create Professional Project (commercial_tier=PROFESSIONAL)
 *     → Append PROJECT_ACTIVATION -1 ledger entry (idempotent) OR PromotionUsage
 *     → Complete idempotency receipt
 *     → Release lock (finally)
 *     → On ledger failure, compensate by deleting the Project
 *
 * The client cannot supply an arbitrary account_id. Admins keep the existing
 * internal-project bypass (no lock, no capacity, no receipt).
 */

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ status: 'ACCOUNT_NOT_LINKED', error: 'Unauthorized' }, { status: 401 });

    // Revalidate the current provider access token before any dealer project
    // or capacity/promotion write. Central admins keep the internal workflow.
    if (user.role !== 'admin') {
      const association = await associateDealerIdentityCore(base44, user.id);
      if (association?.resolved !== true) {
        return Response.json({
          status: 'DEALER_NOT_LINKED',
          reason: association?.reason || 'DEALER_IDENTITY_UNRESOLVED',
          message: 'Unable to verify your Dealer Account. Please launch Sound Proof from your Partner Portal.'
        }, { status: 403 });
      }
    }

    const accessContext = await resolveAccountAccess(base44, user);
    try {
      assertCapability(accessContext, 'soundProof');
    } catch {
      return Response.json({
        status: 'FORBIDDEN',
        message: 'Sound Proof access is not enabled for this login.'
      }, { status: 403 });
    }

    // ── 1. Resolve authoritative account_id from the authenticated user ──
    const userRecords = await base44.asServiceRole.entities.User.filter({ id: user.id });
    const authoritativeUser = (Array.isArray(userRecords) && userRecords.length > 0) ? userRecords[0] : null;
    const accountId = authoritativeUser?.account_id || null;
    const dealerAccountId = authoritativeUser?.dealer_account_id || null;
    const dealerName = authoritativeUser?.dealer_name || null;
    const userRole = authoritativeUser?.role || user?.role || 'user';
    const isAdmin = userRole === 'admin';

    if (!isAdmin && (!accountId || accountId === '')) {
      return Response.json({
        status: 'ACCOUNT_NOT_LINKED',
        message: 'Your user account is not linked to an organisation. Contact your administrator.'
      }, { status: 403 });
    }

    if (!isAdmin && (!dealerAccountId || dealerAccountId === '')) {
      return Response.json({
        status: 'DEALER_NOT_LINKED',
        message: 'Unable to determine your Dealer Account. Please launch Sound Proof from your Partner Portal.'
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

    const suppliedDims = (body.room_length != null && Number.isFinite(Number(body.room_length)))
      || (body.room_width != null && Number.isFinite(Number(body.room_width)))
      || (body.room_height != null && Number.isFinite(Number(body.room_height)));

    const projectFields = {
      name: projectName,
      client_name: body.client_name || '',
      project_reference: body.project_reference || '',
      project_status: body.project_status || 'Prospective',
      room_length: body.room_length ?? null,
      room_width: body.room_width ?? null,
      room_height: body.room_height ?? null,
      dolby_config: body.dolby_config || null,
      target_spl: body.target_spl ?? null,
      amplifier_power: body.amplifier_power ?? null,
      notes: body.notes || '',
      acoustic_treatment_enabled: body.acoustic_treatment_enabled ?? false,
      room_dimensions_edited: !!suppliedDims,
      document_workflow: 'v2',
    };

    // ── 3a. Admin bypass: unrestricted internal/support use ──
    if (isAdmin) {
      let adminProject = null;
      try {
        adminProject = await base44.asServiceRole.entities.Project.create({
          ...projectFields,
          account_id: accountId || null,
          dealer_account_id: dealerAccountId || null,
          dealer_name: dealerName || null,
          commercial_tier: 'INTERNAL',
          lifecycle_status: 'Draft',
        });
      } catch (createErr) {
        return Response.json({
          status: 'CREATION_FAILED',
          message: 'Unable to create the project. Please try again.'
        }, { status: 500 });
      }
      return Response.json({
        status: 'SUCCESS',
        project: adminProject,
        capacity_before: null,
        capacity_after: null,
        ledger_entry: null
      }, { status: 201 });
    }

    // ── 3b. Eligibility: Account lookup — FAIL CLOSED ──
    // If we cannot read the account, we cannot determine promotion eligibility,
    // so we must NOT proceed to charge a token.
    let account = null;
    try {
      const accountRecords = await base44.asServiceRole.entities.Account.filter({ id: accountId });
      account = (Array.isArray(accountRecords) && accountRecords.length > 0) ? accountRecords[0] : null;
    } catch (acctErr) {
      return Response.json({
        status: 'ELIGIBILITY_CHECK_FAILED',
        message: 'Unable to verify account eligibility. Please try again.'
      }, { status: 503 });
    }
    if (!account) {
      return Response.json({
        status: 'ELIGIBILITY_CHECK_FAILED',
        message: 'Account not found.'
      }, { status: 403 });
    }

    const accountIsActive = account.status === 'active';

    // ── 3c. Eligibility: Promotion lookup — FAIL CLOSED ──
    // If we cannot check promotion eligibility, we must NOT charge a token:
    // the dealer may be entitled to a free promotional project.
    let effectivePromotion = null;
    if (accountIsActive) {
      try {
        effectivePromotion = await findEffectivePromotion(base44.asServiceRole, account);
      } catch (promoErr) {
        return Response.json({
          status: 'ELIGIBILITY_CHECK_FAILED',
          message: 'Unable to verify promotion eligibility. Please try again.'
        }, { status: 503 });
      }
    }

    // ── 3d. Request idempotency + per-account serialized creation ──
    const requestId = (typeof body.request_id === 'string' && body.request_id.trim())
      ? body.request_id.trim()
      : null;
    const service = base44.asServiceRole;
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    const lock = await acquireCreationLock(service, accountId, { now: nowMs });
    if (!lock.acquired) {
      return Response.json({
        status: 'CREATION_BUSY',
        message: 'A project creation for this account is already in progress. Please retry shortly.'
      }, { status: 409 });
    }

    try {
      // Idempotency: replay a completed request, or detect an in-flight one.
      if (requestId) {
        const existing = await findExistingReceipt(service, accountId, requestId);
        if (existing) {
          if (existing.status === 'COMPLETED' && existing.response_payload) {
            return Response.json(existing.response_payload, { status: 201 });
          }
          // PENDING — another request is mid-flight.
          return Response.json({
            status: 'CREATION_BUSY',
            message: 'A project creation for this account is already in progress. Please retry shortly.'
          }, { status: 409 });
        }
        // Reserve the request before any Project/Ledger write (crash-safe).
        await createPendingReceipt(service, accountId, requestId, nowIso);
      }

      const discardPending = async () => {
        if (!requestId) return;
        try {
          const r = await findExistingReceipt(service, accountId, requestId);
          if (r) await deleteReceipt(service, r.id);
        } catch { /* best-effort */ }
      };

      const finishReceipt = async (payload, extras) => {
        if (!requestId) return;
        try {
          const r = await findExistingReceipt(service, accountId, requestId);
          if (r) {
            await completeReceipt(service, r.id, {
              project_id: extras?.project_id || null,
              promotion_id: extras?.promotion_id || null,
              ledger_entry_id: extras?.ledger_entry_id || null,
              response_payload: payload,
            }, new Date().toISOString());
          }
        } catch { /* best-effort */ }
      };

      // ── 4a. PROMOTIONAL PATH: free project, no capacity consumption ──
      if (effectivePromotion && effectivePromotion.promotion_type === 'UNLIMITED_PRO_PROJECTS') {
        const promoNowIso = new Date().toISOString();

        let promoProject = null;
        try {
          promoProject = await service.entities.Project.create({
            ...projectFields,
            account_id: accountId,
            dealer_account_id: dealerAccountId,
            dealer_name: dealerName,
            commercial_tier: 'PROFESSIONAL',
            commercial_source: 'PROMOTION',
            promotion_id: effectivePromotion.id,
            professional_activated_date: promoNowIso,
            activation_ledger_entry_id: null,
            lifecycle_status: 'Draft',
          });
        } catch (createErr) {
          await discardPending();
          return Response.json({
            status: 'CREATION_FAILED',
            message: 'Unable to create the project. Please try again.'
          }, { status: 500 });
        }

        // Create exactly one PromotionUsage row (idempotent by project_id)
        let usageEntry = null;
        let usageError = null;
        try {
          const existingUsage = await service.entities.PromotionUsage.filter({ project_id: promoProject.id });
          if (Array.isArray(existingUsage) && existingUsage.length > 0) {
            usageEntry = existingUsage[0];
          } else {
            usageEntry = await service.entities.PromotionUsage.create({
              promotion_id: effectivePromotion.id,
              account_id: accountId,
              project_id: promoProject.id,
              promotion_type: 'UNLIMITED_PRO_PROJECTS',
              used_at: promoNowIso,
            });
          }
        } catch (err) {
          usageError = err;
        }

        // Failure safety: if PromotionUsage failed, rollback the project
        if (usageError || !usageEntry) {
          try {
            await service.entities.Project.delete(promoProject.id);
          } catch (_rollbackErr) {
            await discardPending();
            return Response.json({
              status: 'CREATION_FAILED',
              message: 'Project creation failed during promotion tracking. Please contact support.',
              project_id: promoProject.id,
              rollback: 'FAILED — orphan promotional project may exist',
              detail: 'PromotionUsage creation failed and project rollback also failed.'
            }, { status: 500 });
          }
          await discardPending();
          return Response.json({
            status: 'CREATION_FAILED',
            message: 'Project creation failed during promotion tracking. No capacity was consumed.',
            rollback: 'SUCCESS — project deleted'
          }, { status: 500 });
        }

        const promoSuccessPayload = {
          status: 'SUCCESS',
          project: promoProject,
          promotion: { id: effectivePromotion.id, promotion_type: 'UNLIMITED_PRO_PROJECTS' },
          capacity_before: null,
          capacity_after: null,
          ledger_entry: null
        };
        await finishReceipt(promoSuccessPayload, { project_id: promoProject.id, promotion_id: effectivePromotion.id });
        return Response.json(promoSuccessPayload, { status: 201 });
      }

      // ── 4b. CAPACITY PATH: check available capacity from ledger SUM ──
      const available = await getAvailableCapacity(service, accountId);
      if (available <= 0) {
        await discardPending();
        return Response.json({
          status: 'OUT_OF_CAPACITY',
          message: 'No Professional Project capacity available. Contact your distributor or administrator.',
          available_capacity: available
        }, { status: 403 });
      }

      // ── 5. Create the Professional Project ──
      let project = null;
      try {
        project = await service.entities.Project.create({
          ...projectFields,
          account_id: accountId,
          dealer_account_id: dealerAccountId,
          dealer_name: dealerName,
          commercial_tier: 'PROFESSIONAL',
          professional_activated_date: nowIso,
          commercial_source: 'PILOT',
          lifecycle_status: 'Draft',
        });
      } catch (createErr) {
        await discardPending();
        return Response.json({
          status: 'CREATION_FAILED',
          message: 'Unable to create the project. Please try again.'
        }, { status: 500 });
      }

      // ── 6. Append PROJECT_ACTIVATION -1 ledger entry (idempotent) ──
      const idempotencyKey = `activation:${project.id}`;
      let ledgerEntry = null;
      let ledgerError = null;

      try {
        const existing = await findActivationEntry(service, project.id);
        if (existing) {
          ledgerEntry = existing;
        } else {
          ledgerEntry = await service.entities.CapacityLedger.create({
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

      // ── 7. Failure safety: compensate if ledger creation failed ──
      if (ledgerError || !ledgerEntry) {
        try {
          await service.entities.Project.delete(project.id);
        } catch (_rollbackErr) {
          await discardPending();
          return Response.json({
            status: 'CREATION_FAILED',
            message: 'Project creation failed during activation. Please contact support.',
            project_id: project.id,
            rollback: 'FAILED — orphan project may exist',
            detail: 'Ledger creation failed and project rollback also failed.'
          }, { status: 500 });
        }
        await discardPending();
        return Response.json({
          status: 'CREATION_FAILED',
          message: 'Project creation failed during activation. No capacity was consumed.',
          rollback: 'SUCCESS — project deleted'
        }, { status: 500 });
      }

      // ── 8. Link activation_ledger_entry_id on the Project ──
      try {
        await service.entities.Project.update(project.id, {
          activation_ledger_entry_id: ledgerEntry.id
        });
      } catch (_linkErr) {
        // Non-fatal: the ledger idempotency_key is the real authority.
      }

      // ── 9. Return SUCCESS ──
      const remaining = await getAvailableCapacity(service, accountId);
      const capacitySuccessPayload = {
        status: 'SUCCESS',
        project: project,
        capacity_before: available,
        capacity_after: remaining,
        ledger_entry: {
          id: ledgerEntry.id,
          transaction_type: ledgerEntry.transaction_type,
          delta: ledgerEntry.delta,
          idempotency_key: ledgerEntry.idempotency_key
        }
      };
      await finishReceipt(capacitySuccessPayload, { project_id: project.id, ledger_entry_id: ledgerEntry.id });
      return Response.json(capacitySuccessPayload, { status: 201 });

    } finally {
      await releaseCreationLock(service, accountId, lock.token);
    }

  } catch (error) {
    return Response.json({
      status: 'CREATION_FAILED',
      message: 'An unexpected error occurred. Please try again.'
    }, { status: 500 });
  }
}