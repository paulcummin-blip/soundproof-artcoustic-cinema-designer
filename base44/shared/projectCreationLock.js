/**
 * projectCreationLock.js (shared)
 * --------------------------------
 * Per-account serialized Professional Project creation.
 *
 * Base44 entities have no unique constraints and writes are not transactional,
 * so the balance-read → project-create → ledger-append sequence in
 * createProfessionalProject is not atomic. The only atomic primitive the
 * platform provides is a single-record conditional `updateMany` whose query
 * names one record's `id` and rechecks the other conditions at write time
 * (confirmed: it returns `updated`, the number of records updated).
 *
 * This module uses that primitive as a per-account mutex on the Account record
 * itself (two internal fields, creation_lock_holder + creation_lock_held_at).
 * Exactly one concurrent request per account can flip holder: null → token;
 * the rest get LOCK_BUSY and must retry. Because creation for one account is
 * now serialized, the non-atomic sequence cannot interleave, so two
 * simultaneous requests with one remaining credit can no longer both succeed.
 *
 * This is per-account serialization, NOT a global exactly-once guarantee: a
 * crashed request can leave a stale lock (reclaimed after 30s) and a crashed
 * creation can leave a PENDING receipt (handled by the idempotency module).
 *
 * `creation_lock_holder: null` matches accounts where the field is absent
 * (the Account RLS already relies on null-matching-absent for account_id), so
 * existing accounts that predate this field are lockable without migration.
 */

const STALE_LOCK_MS = 30 * 1000;

function newToken() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch { /* fall through */ }
  return `lock-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Acquire the per-account creation lock.
 * Returns { acquired: true, token, heldAt } or
 *         { acquired: false, token: null, reason }.
 */
export async function acquireCreationLock(service, accountId, { now = Date.now() } = {}) {
  if (!accountId) return { acquired: false, token: null, reason: 'NO_ACCOUNT' };

  const token = newToken();
  const nowIso = new Date(now).toISOString();
  const staleIso = new Date(now - STALE_LOCK_MS).toISOString();

  // Best-effort reclaim of a lock held by a crashed request.
  try {
    await service.entities.Account.updateMany(
      { id: accountId, creation_lock_held_at: { $lt: staleIso } },
      { $set: { creation_lock_holder: null, creation_lock_held_at: null } },
    );
  } catch { /* non-fatal: a busy lock simply won't be reclaimed this round */ }

  // Atomic compare-and-set on the single Account record.
  try {
    const result = await service.entities.Account.updateMany(
      { id: accountId, creation_lock_holder: null },
      { $set: { creation_lock_holder: token, creation_lock_held_at: nowIso } },
    );
    if (result && typeof result.updated === 'number' && result.updated === 1) {
      return { acquired: true, token, heldAt: nowIso };
    }
    return { acquired: false, token: null, reason: 'LOCK_BUSY' };
  } catch (err) {
    return { acquired: false, token: null, reason: 'LOCK_ERROR', error: err?.message || String(err) };
  }
}

/**
 * Release the lock, but only if this caller still holds it (holder === token).
 * Best-effort: a release failure never blocks the response.
 */
export async function releaseCreationLock(service, accountId, token) {
  if (!accountId || !token) return;
  try {
    await service.entities.Account.updateMany(
      { id: accountId, creation_lock_holder: token },
      { $set: { creation_lock_holder: null, creation_lock_held_at: null } },
    );
  } catch { /* best-effort */ }
}

export { STALE_LOCK_MS };