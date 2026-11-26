import assert from 'node:assert';
import {
  acquireCreationLock,
  releaseCreationLock,
  forceReleaseCreationLock,
  readCreationLockState,
} from '../base44/shared/projectCreationLock.js';

// ─────────────────────────────────────────────────────────────────────
// In-memory Account store mocking the platform entity layer. Only the
// Account mutex fields (creation_lock_holder / creation_lock_held_at) are
// modelled; no dealer, membership, project or Project Token data is touched.
// ─────────────────────────────────────────────────────────────────────
function makeMockService() {
  const accounts = new Map();
  const service = {
    accounts,
    entities: {
      Account: {
        async updateMany(query, update) {
          const id = query?.id;
          const rec = accounts.get(id);
          if (!rec) return { updated: 0 };
          const holderQuery = query.creation_lock_holder;
          const matches =
            holderQuery === null
              ? !rec.creation_lock_holder
              : rec.creation_lock_holder === holderQuery;
          if (!matches) return { updated: 0 };
          const set = (update && update.$set) || {};
          for (const [k, v] of Object.entries(set)) rec[k] = v;
          return { updated: 1 };
        },
        async filter(query) {
          const id = query?.id;
          const rec = accounts.get(id);
          return rec ? [{ ...rec }] : [];
        },
      },
    },
  };
  return service;
}

function seedAccount(service, id) {
  service.accounts.set(id, {
    id,
    creation_lock_holder: null,
    creation_lock_held_at: null,
  });
}

// Replicates the corrected withActivationLock / manageAccountUsers release
// decision: release on a failed read or pre-write validation; retain only
// when a protected write was attempted and may have committed without a
// confirmed outcome. The real lock primitives (acquireCreationLock /
// releaseCreationLock) back this, so the token-matched release semantics
// are exercised end-to-end against the in-memory mutex.
async function simulateLockDecision(service, accountId, work) {
  const lock = await acquireCreationLock(service, accountId);
  if (!lock.acquired) return { ok: false, error: 'ACCOUNT_OPERATION_BUSY' };
  let release = true;
  let writeStarted = false;
  const ctx = { markWriteStarted: () => { writeStarted = true; } };
  try {
    const rows = await service.entities.Account.filter({ id: accountId });
    if (!Array.isArray(rows) || rows.length !== 1) return { ok: false, error: 'ACCOUNT_NOT_FOUND' };
    return await work(rows[0], ctx);
  } catch (error) {
    if (writeStarted) release = false;
    throw error;
  } finally {
    if (release) await releaseCreationLock(service, accountId, lock.token);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 1. Failed initial read (before any write) releases the lock
// ═══════════════════════════════════════════════════════════════════════
function testFailedPreWorkReadReleases() {
  const service = makeMockService();
  seedAccount(service, 'A1');
  service.entities.Account.filter = async () => { throw new Error('ACCOUNT_READ_FAILED'); };
  let workReached = false;
  return assert
    .rejects(
      simulateLockDecision(service, 'A1', async () => { workReached = true; return { ok: true }; }),
      /ACCOUNT_READ_FAILED/,
    )
    .then(async () => {
      assert.strictEqual(workReached, false, 'work must not run when the pre-work read fails');
      const state = await readCreationLockState(service, 'A1');
      assert.strictEqual(state.held, false, 'lock released after failed pre-work read');
      const lock2 = await acquireCreationLock(service, 'A1');
      assert.ok(lock2.acquired, 'project creation can proceed after a safely released lock');
    });
}

// ═══════════════════════════════════════════════════════════════════════
// 2. In-work failure before any write releases the lock
// ═══════════════════════════════════════════════════════════════════════
async function testInWorkPreWriteFailureReleases() {
  const service = makeMockService();
  seedAccount(service, 'A2');
  let workReached = false;
  await assert.rejects(
    simulateLockDecision(service, 'A2', async () => {
      workReached = true;
      throw new Error('VALIDATION_READ_FAILED');
    }),
    /VALIDATION_READ_FAILED/,
  );
  assert.ok(workReached, 'work was reached');
  const state = await readCreationLockState(service, 'A2');
  assert.strictEqual(state.held, false, 'lock released after in-work pre-write failure');
  const lock2 = await acquireCreationLock(service, 'A2');
  assert.ok(lock2.acquired, 'lock acquirable again after released read failure');
}

// ═══════════════════════════════════════════════════════════════════════
// 3. Uncertain write outcome retains the lock
// ═══════════════════════════════════════════════════════════════════════
async function testUncertainWriteRetains() {
  const service = makeMockService();
  seedAccount(service, 'A3');
  await assert.rejects(
    simulateLockDecision(service, 'A3', async (_account, ctx) => {
      ctx.markWriteStarted();
      throw new Error('WRITE_UNCERTAIN');
    }),
    /WRITE_UNCERTAIN/,
  );
  const state = await readCreationLockState(service, 'A3');
  assert.strictEqual(state.held, true, 'lock retained after an uncertain write');
  const lock2 = await acquireCreationLock(service, 'A3');
  assert.strictEqual(lock2.acquired, false, 'concurrent acquire is blocked while retained');
  assert.strictEqual(lock2.reason, 'LOCK_BUSY');
}

// ═══════════════════════════════════════════════════════════════════════
// 4. Successful operation releases the lock
// ═══════════════════════════════════════════════════════════════════════
async function testSuccessfulOperationReleases() {
  const service = makeMockService();
  seedAccount(service, 'A4');
  const result = await simulateLockDecision(service, 'A4', async (_account, ctx) => {
    ctx.markWriteStarted();
    return { ok: true };
  });
  assert.strictEqual(result.ok, true);
  const state = await readCreationLockState(service, 'A4');
  assert.strictEqual(state.held, false, 'lock released after a successful operation');
  const lock2 = await acquireCreationLock(service, 'A4');
  assert.ok(lock2.acquired, 'lock acquirable after successful release');
}

// ═══════════════════════════════════════════════════════════════════════
// 5. An incorrect owner token cannot release another operation's lock
// ═══════════════════════════════════════════════════════════════════════
async function testIncorrectTokenCannotRelease() {
  const service = makeMockService();
  seedAccount(service, 'A5');
  const lock1 = await acquireCreationLock(service, 'A5');
  assert.ok(lock1.acquired);
  await releaseCreationLock(service, 'A5', 'not-the-owner-token');
  const state = await readCreationLockState(service, 'A5');
  assert.strictEqual(state.held, true, 'wrong token does not release the held lock');
  const lock2 = await acquireCreationLock(service, 'A5');
  assert.strictEqual(lock2.acquired, false, 'concurrent acquire still blocked after wrong-token release');
  await releaseCreationLock(service, 'A5', lock1.token);
  const lock3 = await acquireCreationLock(service, 'A5');
  assert.ok(lock3.acquired, 'correct owner token releases the lock');
}

// ═══════════════════════════════════════════════════════════════════════
// 6. Different dealer accounts remain independent
// ═══════════════════════════════════════════════════════════════════════
async function testAccountsAreIndependent() {
  const service = makeMockService();
  seedAccount(service, 'A6');
  seedAccount(service, 'B6');
  const lockA = await acquireCreationLock(service, 'A6');
  const lockB = await acquireCreationLock(service, 'B6');
  assert.ok(lockA.acquired && lockB.acquired, 'two accounts can both hold their own lock');
  const lockA2 = await acquireCreationLock(service, 'A6');
  assert.strictEqual(lockA2.acquired, false, 'account A remains locked while held');
  const lockB2 = await acquireCreationLock(service, 'B6');
  assert.strictEqual(lockB2.acquired, false, 'account B remains locked while held');
  await releaseCreationLock(service, 'B6', lockB.token);
  const lockB3 = await acquireCreationLock(service, 'B6');
  assert.ok(lockB3.acquired, 'account B is acquirable after release while A stays locked');
}

// ═══════════════════════════════════════════════════════════════════════
// 7. Administrator force-release clears a retained lock
// ═══════════════════════════════════════════════════════════════════════
async function testForceReleaseClearsHeldLock() {
  const service = makeMockService();
  seedAccount(service, 'A7');
  const lock = await acquireCreationLock(service, 'A7');
  assert.ok(lock.acquired);
  const released = await forceReleaseCreationLock(service, 'A7');
  assert.ok(released, 'force-release clears the held lock');
  const lock2 = await acquireCreationLock(service, 'A7');
  assert.ok(lock2.acquired, 'lock acquirable after force-release');
  await releaseCreationLock(service, 'A7', lock2.token);
  const releasedAgain = await forceReleaseCreationLock(service, 'A7');
  assert.strictEqual(releasedAgain, false, 'force-release is a no-op when nothing is held');
}

// ═══════════════════════════════════════════════════════════════════════
// Runner
// ═══════════════════════════════════════════════════════════════════════
const tests = [
  ['failed pre-work read releases the lock', testFailedPreWorkReadReleases],
  ['in-work pre-write failure releases the lock', testInWorkPreWriteFailureReleases],
  ['uncertain write retains the lock', testUncertainWriteRetains],
  ['successful operation releases the lock', testSuccessfulOperationReleases],
  ['incorrect owner token cannot release another lock', testIncorrectTokenCannotRelease],
  ['different accounts remain independent', testAccountsAreIndependent],
  ['force-release clears a held lock', testForceReleaseClearsHeldLock],
];

let failures = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log(`  ok  - ${name}`);
  } catch (err) {
    failures += 1;
    console.error(`  FAIL - ${name}`);
    console.error(err);
  }
}

if (failures > 0) {
  console.error(`\n${failures} acceptance test(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${tests.length} acceptance tests passed.`);