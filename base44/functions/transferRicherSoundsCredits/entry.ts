import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import {
  resolveRicherSoundsAdminContext,
  resolveRicherSoundsMasterAccount,
  RICHER_SOUNDS_DEALER_GROUP,
} from '../../shared/richerSoundsAdminAuthority.js';
import { getCapacityLedgerEntries } from '../../shared/capacityAuthority.js';

/**
 * transferRicherSoundsCredits — durable, auditable credit transfer between
 * the Custom Install - 93 master account and a Richer Sounds branch.
 *
 * Actions:
 *   transfer — 93 → branch (93 members and master admins).
 *   reverse  — branch → 93, reversing a prior forward transfer (master admin only).
 *
 * The transfer is NOT atomic: Base44 writes are not transactional. A durable
 * CreditTransfer record tracks state, and both CapacityLedger legs carry
 * idempotency keys so a retry with the same transfer_id cannot duplicate a
 * leg. A partial write (source debited, destination not credited) is recorded
 * as state=partial and surfaced for master-admin reconciliation.
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const sessionUser = await base44.auth.me().catch((e) =>
      e?.status === 401 ? null : Promise.reject(e),
    );
    if (!sessionUser) {
      return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    }

    const ctx = await resolveRicherSoundsAdminContext(base44, sessionUser);
    if (!ctx.allowed) {
      return Response.json({ error: ctx.reason || 'FORBIDDEN' }, { status: 403 });
    }

    let body = {};
    try { body = await req.json(); } catch { body = {}; }
    const action = String(body.action || 'transfer');
    const service = base44.asServiceRole;
    const now = new Date().toISOString();

    if (action === 'reverse') {
      // Reclaim is a shared RS administration control: the Custom Install - 93
      // administrator (an active 93 member) and Sound Proof master admins can
      // reverse a prior forward transfer to reclaim unused allocated tokens.
      return await reverseTransfer(service, base44, ctx, body, now);
    }

    if (action !== 'transfer') {
      return Response.json({ error: 'INVALID_ACTION' }, { status: 400 });
    }

    // ---- forward transfer: 93 → branch ----
    const amount = Math.round(Number(body.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      return Response.json({ error: 'INVALID_AMOUNT', message: 'Enter a positive whole number of credits.' }, { status: 400 });
    }
    const destinationAccountId = String(body.destination_account_id || '').trim();
    const note = body.note ? String(body.note).trim().slice(0, 280) : null;

    const master = await resolveRicherSoundsMasterAccount(service);
    if (!master) {
      return Response.json({ error: 'MASTER_NOT_FOUND', message: 'The Custom Install - 93 master account could not be resolved.' }, { status: 409 });
    }
    if (!destinationAccountId) {
      return Response.json({ error: 'DESTINATION_REQUIRED' }, { status: 400 });
    }
    if (destinationAccountId === master.accountId) {
      return Response.json({ error: 'CANNOT_TRANSFER_TO_SELF', message: 'Choose a branch, not the 93 account.' }, { status: 400 });
    }

    const destAccounts = await service.entities.Account.filter({ id: destinationAccountId });
    const destAccount = Array.isArray(destAccounts) && destAccounts.length > 0 ? destAccounts[0] : null;
    if (!destAccount) {
      return Response.json({ error: 'DESTINATION_NOT_FOUND' }, { status: 404 });
    }
    if (destAccount.dealer_group !== RICHER_SOUNDS_DEALER_GROUP) {
      return Response.json({ error: 'NOT_RICHER_SOUNDS', message: 'The destination is not a Richer Sounds account.' }, { status: 400 });
    }
    if (destAccount.soundproof_eligible !== true) {
      return Response.json({ error: 'BRANCH_NOT_ELIGIBLE', message: 'Paul has not approved this branch for Sound Proof yet.' }, { status: 409 });
    }

    const sourceEntries = await getCapacityLedgerEntries(service, master.accountId);
    const sourceAvailable = sourceEntries.reduce((sum, e) => sum + Number(e.delta), 0);
    if (sourceAvailable < amount) {
      return Response.json({ error: 'INSUFFICIENT_CREDITS', message: `93 has ${sourceAvailable} available credits.` }, { status: 409 });
    }

    const transferId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const transfer = await service.entities.CreditTransfer.create({
      transfer_id: transferId,
      direction: 'forward',
      source_account_id: master.accountId,
      source_account_name: master.account.name,
      destination_account_id: destinationAccountId,
      destination_account_name: destAccount.name,
      amount,
      actor_user_id: ctx.actorUser?.id || 'system',
      actor_email: ctx.actorUser?.email || 'system',
      actor_is_master_admin: ctx.isMasterAdmin === true,
      note,
      state: 'pending',
      source_leg_id: null,
      destination_leg_id: null,
      created_at: now,
      completed_at: null,
    });

    // Write the source debit leg. Idempotency key prevents duplication on retry.
    let sourceLeg = await findLeg(service, `rs_transfer:${transferId}:SOURCE`);
    if (!sourceLeg) {
      sourceLeg = await service.entities.CapacityLedger.create({
        account_id: master.accountId,
        transaction_type: 'RICHER_SOUNDS_TRANSFER',
        delta: -amount,
        idempotency_key: `rs_transfer:${transferId}:SOURCE`,
        transfer_id: transferId,
        source_system: 'SOUND_PROOF',
        source_ref: { transfer_id: transferId, source_account_id: master.accountId, destination_account_id: destinationAccountId },
        reason: `Richer Sounds transfer to ${destAccount.name}`,
      });
    }

    // Write the destination credit leg. If this throws, the transfer is partial.
    let destinationLeg = null;
    let partial = false;
    try {
      destinationLeg = await findLeg(service, `rs_transfer:${transferId}:TARGET`);
      if (!destinationLeg) {
        destinationLeg = await service.entities.CapacityLedger.create({
          account_id: destinationAccountId,
          transaction_type: 'RICHER_SOUNDS_TRANSFER',
          delta: amount,
          idempotency_key: `rs_transfer:${transferId}:TARGET`,
          transfer_id: transferId,
          source_system: 'SOUND_PROOF',
          source_ref: { transfer_id: transferId, source_account_id: master.accountId, destination_account_id: destinationAccountId },
          reason: `Richer Sounds transfer from ${master.account.name}`,
        });
      }
    } catch (e) {
      partial = true;
    }

    const updated = await service.entities.CreditTransfer.update(transfer.id, {
      source_leg_id: sourceLeg?.id || null,
      destination_leg_id: destinationLeg?.id || null,
      state: partial ? 'partial' : 'completed',
      completed_at: partial ? null : now,
    });

    // Record the allocation in the append-only audit trail. The CreditTransfer
    // + CapacityLedger legs are the commercial authority; this audit entry is
    // best-effort and never blocks a successful transfer.
    if (!partial) {
      try {
        await service.entities.AccountUserAudit.create({
          account_id: destinationAccountId,
          actor_user_id: ctx.actorUser?.id || 'system',
          actor_email: ctx.actorUser?.email || 'system',
          action: 'RS_ALLOCATION_MADE',
          target_email: destAccount.contact_email || null,
          before_access_level: null,
          after_access_level: null,
          occurred_at: now,
          details: {
            actor_is_master_admin: ctx.isMasterAdmin === true,
            actor_is_rs_delegated_admin: ctx.isMasterAdmin !== true,
            master_account_id: master.accountId,
            amount,
            transfer_id: transferId,
            note,
          },
        });
      } catch { /* audit is best-effort */ }
    }

    return Response.json({
      transfer_id: transferId,
      state: updated.state,
      amount,
      source_account_id: master.accountId,
      destination_account_id: destinationAccountId,
      partial,
    }, { status: partial ? 207 : 200 });
  } catch (error) {
    return Response.json({ error: 'TRANSFER_FAILED', message: error?.message || 'Unable to transfer credits.' }, { status: 500 });
  }
}

async function findLeg(service, idempotencyKey) {
  const rows = await service.entities.CapacityLedger.filter({ idempotency_key: idempotencyKey });
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

async function reverseTransfer(service, base44, ctx, body, now) {
  const originalTransferId = String(body.transfer_id || '').trim();
  if (!originalTransferId) {
    return Response.json({ error: 'TRANSFER_ID_REQUIRED' }, { status: 400 });
  }
  const originalRows = await service.entities.CreditTransfer.filter({ transfer_id: originalTransferId });
  const original = Array.isArray(originalRows) && originalRows[0];
  if (!original) {
    return Response.json({ error: 'TRANSFER_NOT_FOUND' }, { status: 404 });
  }
  if (original.direction !== 'forward' || original.state !== 'completed') {
    return Response.json({ error: 'NOT_REVERSIBLE', message: 'Only a completed forward transfer can be reversed.' }, { status: 409 });
  }
  if (original.reversal_of) {
    return Response.json({ error: 'ALREADY_REVERSED' }, { status: 409 });
  }

  const reverseId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const note = body.note ? String(body.note).trim().slice(0, 280) : `Reversal of ${originalTransferId}`;

  // Verify both accounts still exist and are Richer Sounds.
  const [srcAccounts, destAccounts] = await Promise.all([
    service.entities.Account.filter({ id: original.destination_account_id }),
    service.entities.Account.filter({ id: original.source_account_id }),
  ]);
  const branchAccount = Array.isArray(srcAccounts) ? srcAccounts[0] : null;
  const masterAccount = Array.isArray(destAccounts) ? destAccounts[0] : null;
  if (!branchAccount || !masterAccount) {
    return Response.json({ error: 'ACCOUNT_MISSING' }, { status: 404 });
  }

  const transfer = await service.entities.CreditTransfer.create({
    transfer_id: reverseId,
    direction: 'reverse',
    source_account_id: original.destination_account_id,
    source_account_name: original.destination_account_name,
    destination_account_id: original.source_account_id,
    destination_account_name: original.source_account_name,
    amount: original.amount,
    actor_user_id: ctx.actorUser?.id || 'system',
    actor_email: ctx.actorUser?.email || 'system',
    actor_is_master_admin: true,
    note,
    state: 'pending',
    created_at: now,
    completed_at: null,
    reversal_of: originalTransferId,
  });

  // Branch debit
  let sourceLeg = await findLeg(service, `rs_transfer:${reverseId}:SOURCE`);
  if (!sourceLeg) {
    sourceLeg = await service.entities.CapacityLedger.create({
      account_id: original.destination_account_id,
      transaction_type: 'RICHER_SOUNDS_TRANSFER',
      delta: -original.amount,
      idempotency_key: `rs_transfer:${reverseId}:SOURCE`,
      transfer_id: reverseId,
      source_system: 'SOUND_PROOF',
      source_ref: { transfer_id: reverseId, reversal_of: originalTransferId, source_account_id: original.destination_account_id, destination_account_id: original.source_account_id },
      reason: `Reversal: return credits to ${original.source_account_name}`,
    });
  }

  let destinationLeg = null;
  let partial = false;
  try {
    destinationLeg = await findLeg(service, `rs_transfer:${reverseId}:TARGET`);
    if (!destinationLeg) {
      destinationLeg = await service.entities.CapacityLedger.create({
        account_id: original.source_account_id,
        transaction_type: 'RICHER_SOUNDS_TRANSFER',
        delta: original.amount,
        idempotency_key: `rs_transfer:${reverseId}:TARGET`,
        transfer_id: reverseId,
        source_system: 'SOUND_PROOF',
        source_ref: { transfer_id: reverseId, reversal_of: originalTransferId, source_account_id: original.destination_account_id, destination_account_id: original.source_account_id },
        reason: `Reversal: return credits from ${original.destination_account_name}`,
      });
    }
  } catch (e) {
    partial = true;
  }

  await service.entities.CreditTransfer.update(transfer.id, {
    source_leg_id: sourceLeg?.id || null,
    destination_leg_id: destinationLeg?.id || null,
    state: partial ? 'partial' : 'completed',
    completed_at: partial ? null : now,
  });

  if (!partial) {
    await service.entities.CreditTransfer.update(original.id, { state: 'reversed' });
  }

  // Record the reclamation in the append-only audit trail.
  if (!partial) {
    try {
      await service.entities.AccountUserAudit.create({
        account_id: original.destination_account_id,
        actor_user_id: ctx.actorUser?.id || 'system',
        actor_email: ctx.actorUser?.email || 'system',
        action: 'RS_ALLOCATION_RECLAIMED',
        target_email: branchAccount.contact_email || null,
        before_access_level: null,
        after_access_level: null,
        occurred_at: now,
        details: {
          actor_is_master_admin: ctx.isMasterAdmin === true,
          actor_is_rs_delegated_admin: ctx.isMasterAdmin !== true,
          master_account_id: original.source_account_id,
          amount: original.amount,
          transfer_id: reverseId,
          reclaim_of: originalTransferId,
          note,
        },
      });
    } catch { /* audit is best-effort */ }
  }

  return Response.json({
    transfer_id: reverseId,
    reversed_transfer_id: originalTransferId,
    state: partial ? 'partial' : 'completed',
    amount: original.amount,
    partial,
  }, { status: partial ? 207 : 200 });
}