/**
 * accountActivationAuthority.js (shared)
 * --------------------------------------
 * Canonical account first-activation timestamp.
 *
 * Activation of a Sound Proof account happens from several paths:
 *   - admin enable (manageSoundProofAccess → SOUNDPROOF_ENABLE)
 *   - Portal first verified user claim (accountAccessAuthority →
 *     startSoundProofTermOnFirstClaim → SOUNDPROOF_TERM_STARTED)
 *   - Portal identity claim (pilotSeatClaimAuthority → PORTAL_IDENTITY_CLAIMED)
 *
 * Each writes an append-only AccountUserAudit row. The canonical first
 * activation date for an account is the chronologically-earliest occurred_at
 * among these activation actions. Renewal (SOUNDPROOF_RENEWED), suspend
 * (SOUNDPROOF_SUSPEND) and restore (SOUNDPROOF_RESTORE) write DIFFERENT
 * actions, so they never alter this first-activation date — which is what
 * makes the audit trail a durable first-activation authority without any
 * mutable timestamp field on the Account.
 *
 * AccountUserAudit is update:false / delete:false (append-only), so the
 * earliest activation event cannot be overwritten.
 */

export const ACTIVATION_AUDIT_ACTIONS = [
  'SOUNDPROOF_TERM_STARTED',
  'SOUNDPROOF_ENABLE',
  'PORTAL_IDENTITY_CLAIMED',
];

/**
 * Returns the canonical first-activation timestamp (ISO string) for an
 * account, or null if the account has never been activated.
 */
export async function getFirstActivatedAt(service, accountId) {
  if (!accountId) return null;
  let rows;
  try {
    rows = await service.entities.AccountUserAudit.filter({
      account_id: accountId,
      action: { $in: ACTIVATION_AUDIT_ACTIONS },
    });
  } catch {
    return null;
  }
  const arr = Array.isArray(rows) ? rows : [];
  const times = arr
    .map((r) => (r?.occurred_at ? new Date(r.occurred_at).getTime() : NaN))
    .filter((t) => Number.isFinite(t));
  if (times.length === 0) return null;
  return new Date(Math.min(...times)).toISOString();
}

/**
 * Write one canonical activation audit event with a consistent shape.
 * Future activation paths should call this instead of inlining their own
 * AccountUserAudit.create, so every activation is recorded uniformly.
 * `action` must be one of ACTIVATION_AUDIT_ACTIONS.
 */
export async function recordAccountActivation(service, {
  accountId,
  actorUserId,
  actorEmail,
  action,
  occurredAt,
  details,
  targetEmail,
}) {
  if (!ACTIVATION_AUDIT_ACTIONS.includes(action)) {
    throw new Error(`Unknown activation action: ${action}`);
  }
  return service.entities.AccountUserAudit.create({
    account_id: accountId,
    actor_user_id: actorUserId,
    actor_email: actorEmail,
    action,
    target_user_id: null,
    target_email: targetEmail || actorEmail || '',
    occurred_at: occurredAt || new Date().toISOString(),
    details: details || {},
  });
}