import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { getAvailableCapacity, findActivationEntry } from '../../shared/capacityAuthority.js';
import { findEffectivePromotion } from '../../shared/promotionAuthority.js';
import { assertCapability, resolveAccountAccess } from '../../shared/accountAccessAuthority.js';
import { associateMemberDealerIdentityCore } from '../../shared/dealerIdentityAssociation.js';
import { acquireCreationLock, releaseCreationLock } from '../../shared/projectCreationLock.js';
import {
  findExistingReceipt,
  createPendingReceipt,
  completeReceipt,
  deleteReceipt,
  updateReceiptStage,
} from '../../shared/projectCreationIdempotency.js';
import { reconcilePendingReceipt } from '../../shared/projectCreationRecovery.js';

/**
 * Trusted backend authority for Professional Project creation.
 *
 * Safeguards (credit & promotion integrity):
 *   1. Fail-closed eligibility: a failed Account or Promotion lookup returns
 *      ELIGIBILITY_CHECK_FAILED and creates NO project, promotion usage or
 *      ledger deduction.
 *   2. Per-account serialized creation: a single-record conditional updateMany
 *      on the Account (creation_lock_holder: null -> token) serializes creation
 *      per account. There is NO time-based lock takeover: a lock held by a
 *      still-running or crashed request stays held until released or
 *      admin force-released, so two simultaneous requests with one remaining
 *      credit cannot both succeed. A crashed lock blocks creation (safe) until
 *      reconciled via the reconcileProjectCreation admin function.
 *   3. Request idempotency + crash recovery: a client request_id (UUID) makes a
 *      repeated request return its original result. The receipt records the
 *      creation stage and object ids as they are confirmed. An interrupted
 *      (non-COMPLETED) receipt is RECONCILED against the real
 *      Project/Ledger/Usage state on retry — never blindly replayed or deleted.
 *      A receipt is never deleted merely because a write returned an error
 *      (it may have committed); no automatic refund is ever issued without
 *      confirming the original transaction. The only confirmed no-write exit
 *      that deletes the receipt is OUT_OF_CAPACITY (read-only).
 *
 * This is per-account serialization with crash recovery, NOT a global
 * exactly-once guarantee. Exactly-once charging has not been demonstrated by
 * available platform operations and is not claimed.
 *
 * The client cannot supply an arbitrary account_id. Admins keep the existing
 * internal-project bypass (no lock, no capacity, no receipt).
 */

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ status: 'ACCOUNT_NOT_LINKED', error: 'Unauthorized' }, { status: 401 });

    const accessContext = await resolveAccountAccess(base44, user);
    try {
      assertCapability(accessContext, 'soundProof');
    } catch {
      return Response.json({
        status: 'FORBIDDEN',
        message: 'Sound Proof access is not enabled for this login.'
      }, { status: 403 });
    }

    // Accepted membership establishes the user's company relationship. The
    // existing server-owned company mapping supplies immutable dealer identity.
    let dealerIdentity = null;
    if (!accessContext.isMasterAdmin) {
      const association = await associateMemberDealerIdentityCore(base44, user.id, accessContext);
      if (association?.resolved !== true) {
        return Response.json({
          status: 'DEALER_NOT_LINKED',
          reason: association?.reason || 'DEALER_IDENTITY_UNRESOLVED',
          message: 'Your Sound Proof membership could not be matched to its verified dealer company. Contact Sound Proof support.'
        }, { status: 403 });
      }
      dealerIdentity = association.identity;
    }

    // ── 1. Resolve authoritative account_id from the authenticated user ──
    const userRecords = await base44.asServiceRole.entities.User.filter({ id: user.id });
    const authoritativeUser = (Array.isArray(userRecords) && userRecords.length > 0) ? userRecords[0] : null;
    const accountId = authoritativeUser?.account_id || null;
    const dealerAccountId = dealerIdentity?.dealer_account_id || authoritativeUser?.dealer_account_id || null;
    const dealerName = dealerIdentity?.dealer_name || authoritativeUser?.dealer_name || null;
    const userRole = authoritativeUser?.role || user?.role || 'user';
    const isAdmin = userRole === 'admin';

    if (!isAdmin && (!accountId || accountId !== accessContext.account?.id)) {
      return Response.json({
        status: 'ACCOUNT_NOT_LINKED',
        message: 'Your user account is not linked to an organisation. Contact your administrator.'
      }, { status: 403 });
    }

    if (!isAdmin && (!dealerAccountId || dealerAccountId === '')) {
      return Response.json({
        status: 'DEALER_NOT_LINKED',
        message: 'Unable to determine your Dealer Account. Please launch Sound Proof from your ******.'
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
    const creationPath = (effectivePromotion && effectivePromotion.promotion_type === 'UNLIMITED_PRO_PROJECTS')
      ? 'promotion'
      : 'capacity';

    const lock = await acquireCreationLock(service, accountId, { now: nowMs });
    if (!lock.acquired) {
      return Response.json({
        status: 'CREATION_BUSY',
        message: 'A project creation for this account is already in progress. Please retry shortly.'
      }, { status: 409 });
    }

    try {
      // Reconcile any interrupted prior request with the same id, against the
      // real Project/Ledger/Usage state. Never create a duplicate here.
      if (requestId) {
        const existing = await findExistingReceipt(service, accountId, requestId);
        if (existing) {
          if (existing.status === 'COMPLETED' && existing.response_payload) {
            return Response.json(existing.response_payload, { status: 201 });
          }
          const recovered = await reconcilePendingReceipt(service, existing, { accountName: projectName });
          if (recovered.outcome === 'replay' || recovered.outcome === 'resumed_to_completion') {
            return Response.json(recovered.responsePayload, { status: 201 });
          }
          if (recovered.outcome === 'restart') {
            // Confirmed no committed write for this request — safe to create fresh.
            await deleteReceipt(service, existing.id);
          } else {
            // reconciling — a write may have committed; do not duplicate.
            return Response.json({
              status: 'CREATION_RECONCILING',
              message: 'A previous creation for this request could not be confirmed. Please retry with a new request id, or contact support if it persists.',
              reason: recovered.reason || 'UNCERTAIN',
              project_id: existing.project_id || null,
            }, { status: 409 });
          }
        }
        // Reserve a PENDING receipt before any Project/Ledger write (crash-safe).
        await createPendingReceipt(service, accountId, requestId, nowIso, creationPath);
      }

      // Stage + object-id tracking on the receipt (crash recovery).
      const setStage = async (patch) => {
        if (!requestId) return;
        try {
          const r = await findExistingReceipt(service, accountId, requestId);
          if (r) await updateReceiptStage(service, r.id, patch);
        } catch { /* best-effort: stage is for recovery only */ }
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
      const findUsage = async (pid) => {
        try {
          const rows = await service.entities.PromotionUsage.filter({ project_id: pid });
          return (Array.isArray(rows) && rows.length > 0) ? rows[0] : null;
        } catch { return null; }
      };

      // ── 4a. PROMOTIONAL PATH: free project, no capacity consumption ──
      if (creationPath === 'promotion') {
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
        } catch (_createErr) {
          // Uncertain: the create may have committed without returning an id.
          // Retain the receipt as RECONCILING; never create a duplicate.
          await setStage({ stage: 'RECONCILING' });
          return Response.json({
            status: 'CREATION_RECONCILING',
            message: 'Project creation could not be confirmed. Please retry with a new request id, or contact support if it persists.',
            reason: 'PROJECT_CREATE_UNCERTAIN',
          }, { status: 409 });
        }
        await setStage({ stage: 'PROJECT_CREATED', project_id: promoProject.id, promotion_id: effectivePromotion.id });

        // PromotionUsage — idempotent by project_id.
        let usageEntry = await findUsage(promoProject.id);
        if (!usageEntry) {
          try {
            usageEntry = await service.entities.PromotionUsage.create({
              promotion_id: effectivePromotion.id,
              account_id: accountId,
              project_id: promoProject.id,
              promotion_type: 'UNLIMITED_PRO_PROJECTS',
              used_at: new Date().toISOString(),
            });
          } catch (_usageErr) {
            // Usage may have committed or not. The project exists (id known), so
            // a retry with the same request id reconciles and creates the usage
            // if missing. Do NOT delete the project or the receipt, and do NOT
            // issue an automatic refund.
            return Response.json({
              status: 'CREATION_FAILED',
              message: 'Project created but promotion tracking could not be confirmed. Retry the same request to complete it.',
              recoverable: true,
              project_id: promoProject.id,
            }, { status: 500 });
          }
        }
        await setStage({ stage: 'USAGE_CREATED' });

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
        // Confirmed no-write failure: safe to discard the receipt and allow retry.
        if (requestId) {
          try {
            const r = await findExistingReceipt(service, accountId, requestId);
            if (r) await deleteReceipt(service, r.id);
          } catch { /* best-effort */ }
        }
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
      } catch (_createErr) {
        // Uncertain: the create may have committed without returning an id.
        await setStage({ stage: 'RECONCILING' });
        return Response.json({
          status: 'CREATION_RECONCILING',
          message: 'Project creation could not be confirmed. Please retry with a new request id, or contact support if it persists.',
          reason: 'PROJECT_CREATE_UNCERTAIN',
        }, { status: 409 });
      }
      await setStage({ stage: 'PROJECT_CREATED', project_id: project.id });

      // ── 6. Append PROJECT_ACTIVATION -1 ledger entry (idempotent) ──
      let ledgerEntry = await findActivationEntry(service, project.id);
      if (!ledgerEntry) {
        try {
          ledgerEntry = await service.entities.CapacityLedger.create({
            account_id: accountId,
            transaction_type: 'PROJECT_ACTIVATION',
            delta: -1,
            idempotency_key: `activation:${project.id}`,
            source_system: 'SOUND_PROOF',
            source_ref: { project_id: project.id },
            reason: `Project activation: ${projectName}`
          });
        } catch (_ledgerErr) {
          // The ledger may have committed or not. The project exists (id known),
          // so a retry with the same request id reconciles and creates the
          // ledger if missing. Do NOT delete the project or issue an automatic
          // refund without confirming the original transaction.
          return Response.json({
            status: 'CREATION_FAILED',
            message: 'Project created but activation could not be confirmed. Retry the same request to complete it.',
            recoverable: true,
            project_id: project.id,
          }, { status: 500 });
        }
      }
      await setStage({ stage: 'LEDGER_CREATED', ledger_entry_id: ledgerEntry.id });

      // ── 7. Link activation_ledger_entry_id on the Project (non-fatal) ──
      try {
        await service.entities.Project.update(project.id, {
          activation_ledger_entry_id: ledgerEntry.id
        });
      } catch (_linkErr) {
        // Non-fatal: the ledger idempotency_key is the real authority.
      }

      // ── 8. Return SUCCESS ──
      const remaining = await getAvailableCapacity(service, accountId);
      const capacitySuccessPayload = {
        status: 'SUCCESS',
        project,
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
