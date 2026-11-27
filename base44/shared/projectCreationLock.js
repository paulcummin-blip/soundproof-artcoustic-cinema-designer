/**
 * projectCreationLock.js (shared)
 * --------------------------------
 * Per-account serialized Professional Project creation.
 *
 * Base44 entities have no unique constraints and writes are not transactional.
 * The only atomic primitive the platform provides is a single-record conditional
 * updateMany whose query names one record id and rechecks the other conditions at
 * write time. This module uses that primitive as a per-account mutex on the
 * Account record itself (creation_lock_holder + creation_lock_held_at).
 *
 * NO AUTOMATIC TIME-BASED TAKEOVER (deliberate):
 * A lock is never reclaimed merely because it has been held for a fixed duration.
 * A creation that runs longer than any threshold keeps its lock; a second request
 * for the same account receives LOCK_BUSY until the first releases. Reclaiming a
 * lock that a still-running request holds can permit overlapping creation and
 * duplicate credit deductions, so it is not permitted.
 *
 * A lock left held by a crashed request blocks further creation for that account
 * until an administrator explicitly force-releases it (forceReleaseCreationLock,
 * the reconciliation path). This blocked-creation failure is preferred over any
 * risk of duplicate charges.
 *
 * creation_lock_holder: null matches accounts where the field is absent (the
 * Account RLS already relies on null-matching-absent), so existing accounts are
 * lockable without migration.
 */

function newToken() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch { /* fall through */ }
  return `lock-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Acquire the per-account creation lock.
 * Returns { acquired: true, token, heldAt } or { acquired: false, token: null, reason }.
 */
export async function acquireCreationLock(service, accountId, { now = Date.now() } = {}) {
  if (!accountId) return { acquired: false, token: null, reason: 'NO_ACCOUNT' };

  const token = newToken();
  const nowIso = new Date(now).toISOString();

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

/**
 * Administrator-only forced release of a stuck lock (crashed request). Does NOT
 * reclaim based on age. Callers must verify no creation is in flight before
 * invoking (e.g. inspect ProjectCreationReceipt). Clears the exact held token
 * so a concurrent legitimate release cannot be clobbered. Returns true if a
 * holder was cleared.
 */
export async function forceReleaseCreationLock(service, accountId) {
  if (!accountId) return false;
  const state = await readCreationLockState(service, accountId);
  if (!state.held || !state.holder) return false;
  try {
    const result = await service.entities.Account.updateMany(
      { id: accountId, creation_lock_holder: state.holder },
      { $set: { creation_lock_holder: null, creation_lock_held_at: null } },
    );
    return !!(result && typeof result.updated === 'number' && result.updated === 1);
  } catch {
    return false;
  }
}

/**
 * Read-only diagnostic: is the lock currently held, and by whom/when.
 */
export async function readCreationLockState(service, accountId) {
  if (!accountId) return { held: false, holder: null, heldAt: null };
  try {
    const rows = await service.entities.Account.filter({ id: accountId });
    const account = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    return {
      held: !!(account?.creation_lock_holder),
      holder: account?.creation_lock_holder || null,
      heldAt: account?.creation_lock_held_at || null,
    };
  } catch {
    return { held: false, holder: null, heldAt: null };
  }
}

/**
 * runUnderActivationLock — the shared per-account lock runner with uncertain
 * write-outcome tracking. Used by both Portal activation/renewal/term-start and
 * account-user management, so the release decision is identical everywhere.
 *
 * The runner acquires the per-account lock, runs `work(ctx)`, and releases the
 * lock unless a protected write was left uncertain. `ctx` exposes:
 *   - markWriteUncertain(): call immediately before a protected write.
 *   - clearWriteUncertain(): call once the write's outcome is definitively
 *     known — a successful return, or a confirmed zero-row conditional update.
 * A throw between mark and clear leaves the write uncertain, so the lock is
 * retained for reconciliation. A read or validation failure before any mark,
 * or after a clear, releases the lock. Exact owner-token matching is
 * preserved on release. `options.busy()` is returned when the lock is held.
 */
export async function runUnderActivationLock(service, accountId, work, options = {}) {
  const lock = await acquireCreationLock(service, accountId);
  if (!lock.acquired) {
    return options.busy ? options.busy() : { ok: false, error: 'ACCOUNT_OPERATION_BUSY' };
  }
  let release = true;
  let writeUncertain = false;
  const ctx = {
    markWriteUncertain: () => { writeUncertain = true; },
    clearWriteUncertain: () => { writeUncertain = false; },
  };
  try {
    return await work(ctx);
  } catch (error) {
    if (writeUncertain) release = false;
    throw error;
  } finally {
    if (release) await releaseCreationLock(service, accountId, lock.token);
  }
}