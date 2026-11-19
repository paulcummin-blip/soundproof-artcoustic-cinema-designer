/**
 * accountActivationAuthority.js (shared)
 * --------------------------------------
 * Canonical account first-activation timestamp.
 *
 * The authoritative first-activation date is the write-once Account.first_activated_at
 * field. It is set ONLY on the first confirmed Sound Proof account activation:
 *   - admin enable (manageSoundProofAccess → SOUNDPROOF_ENABLE)
 *   - Portal first verified user claim that starts the 90-day term
 *     (accountAccessAuthority → startSoundProofTermOnFirstClaim → SOUNDPROOF_TERM_STARTED)
 *
 * It is NEVER set, and never changed, by:
 *   - renewal (SOUNDPROOF_RENEWED)
 *   - suspend (SOUNDPROOF_SUSPEND)
 *   - restore (SOUNDPROOF_RESTORE)
 *   - an identity claim alone (PORTAL_IDENTITY_CLAIMED) — a claim records identity
 *     binding, not the start of the 90-day term, so it must not establish activation.
 *
 * Existing accounts without reliable historical evidence retain an unknown
 * (null) first-activation date: getFirstActivatedAt returns the field value only
 * and does NOT infer a date from the audit trail, so historical gaps are honest
 * rather than guessed. The three-month introductory promotion is NOT granted
 * from this date yet.
 *
 * AccountUserAudit remains the append-only audit trail (update:false / delete:false);
 * the audit actions are recorded for every activation-related event, but the
 * canonical date lives on the Account field.
 */

export const ACTIVATION_AUDIT_ACTIONS = [
  'SOUNDPROOF_TERM_STARTED',
  'SOUNDPROOF_ENABLE',
  'PORTAL_IDENTITY_CLAIMED',
];

/**
 * Returns the canonical first-activation timestamp (ISO string) from the
 * Account.first_activated_at field, or null if the account has never been
 * activated (or has no reliable historical evidence). Never infers from audit.
 */
export async function getFirstActivatedAt(service, accountId) {
  if (!accountId) return null;
  try {
    const rows = await service.entities.Account.filter({ id: accountId });
    const account = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    return account?.first_activated_at || null;
  } catch {
    return null;
  }
}

/**
 * Write-once setter for the canonical first-activation timestamp. Sets the
 * field only if it is currently null/absent, using a single-record conditional
 * updateMany so a concurrent activation cannot overwrite an existing date.
 * Returns the timestamp on success, or null if the field was already set or
 * the update could not be applied.
 */
export async function setFirstActivatedAtIfUnset(service, accountId, nowIso) {
  if (!accountId || !nowIso) return null;
  // null matches accounts where the field is absent (platform convention, same
  // as the Account RLS relies on for account_id).
  try {
    const r = await service.entities.Account.updateMany(
      { id: accountId, first_activated_at: null },
      { $set: { first_activated_at: nowIso } },
    );
    if (r && typeof r.updated === 'number' && r.updated === 1) return nowIso;
  } catch { /* fall through to fallback */ }
  // Fallback for the absent-field case if null did not match.
  try {
    const r = await service.entities.Account.updateMany(
      { id: accountId, first_activated_at: { $exists: false } },
      { $set: { first_activated_at: nowIso } },
    );
    if (r && typeof r.updated === 'number' && r.updated === 1) return nowIso;
  } catch { /* fall through */ }
  return null;
}

/**
 * Write one canonical activation audit event with a consistent shape. Future
 * activation paths should call this instead of inlining their own
 * AccountUserAudit.create, so every activation is recorded uniformly.
 * `action` must be one of ACTIVATION_AUDIT_ACTIONS. Note: writing the audit
 * event does NOT by itself set first_activated_at — the caller must also call
 * setFirstActivatedAtIfUnset where appropriate (enable / term start only).
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