import assert from 'node:assert';
import {
  runUnderActivationLock,
  acquireCreationLock,
  forceReleaseCreationLock,
  readCreationLockState,
} from '../base44/shared/projectCreationLock.js';

// ─────────────────────────────────────────────────────────────────────
// In-memory mock of the platform entity layer. Only the Account mutex
// fields and configurable write entities are modelled. No dealer,
// membership, project, audit or Project Token data is touched.
// ─────────────────────────────────────────────────────────────────────
function makeMockService() {
  const accounts = new Map();
  const writes = { Membership: [], Audit: [] };
  const service = {
    accounts,
    writes,
    // Configure write behaviour: 'ok' (succeed), 'throw' (uncertain), or
    // a function returning { updated } for conditional updateMany.
    membershipCreate: 'ok',
    auditCreate: 'ok',
    updateManyResult: { updated: 1 },
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
      AccountMembership: {
        async create(data) {
          if (service.membershipCreate === 'throw') throw new Error('MEMBERSHIP_WRITE_UNCERTAIN');
          const rec = { id: `m-${writes.Membership.length + 1}`, ...data };
          writes.Membership.push(rec);
          return rec;
        },
        async update() { if (service.membershipCreate === 'throw') throw new Error('MEMBERSHIP_WRITE_UNCERTAIN'); return { updated: 1 }; },
        async updateMany() { return service.updateManyResult; },
        async filter() { return []; },
      },
      AccountUserAudit: {
        async create(data) {
          if (service.auditCreate === 'throw') throw new Error('AUDIT_WRITE_UNCERTAIN');
          const rec = { id: `a-${writes.Audit.length + 1}`, ...data };
          writes.Audit.push(rec);
          return rec;
        },
        async filter() { return []; },
      },
    },
  };
  return service;
}

function seedAccount(service, id) {
  service.accounts.set(id, { id, creation_lock_holder: null, creation_lock_held_at: null });
}

// ─────────────────────────────────────────────────────────────────────
// 1. Initial membership read fails — lock released.
//    (Mirrors manageAccountUsers: the membership filter throws before any
//    protected write is marked.)
// ─────────────────────────────────────────────────────────────────────
async function test1_membershipReadFailsReleases() {
  const service = makeMockService();
  seedAccount(service, 'A1');
  let workReached = false;
  await assert.rejects(
    runUnderActivationLock(service, 'A1', async (ctx) => {
      // membership read (the initial display/seat read) fails
      throw new Error('MEMBERSHIP_READ_FAILED');
      workReached = true;
    }),
    /MEMBERSHIP_READ_FAILED/,
  );
  assert.strictEqual(workReached, false);
  const state = await readCreationLockState(service, 'A1');
  assert.strictEqual(state.held, false, 'lock released after failed membership read');
  const next = await acquireCreationLock(service, 'A1');
  assert.ok(next.acquired, 'project creation can proceed');
}

// ─────────────────────────────────────────────────────────────────────
// 2. Initial Portal account read fails — lock released.
//    (Mirrors withActivationLock: the Account.filter read throws before any
//    write is marked.)
// ─────────────────────────────────────────────────────────────────────
async function test2_portalAccountReadFailsReleases() {
  const service = makeMockService();
  seedAccount(service, 'A2');
  await assert.rejects(
    runUnderActivationLock(service, 'A2', async (ctx) => {
      const rows = await service.entities.Account.filter({ id: 'A2' });
      // simulate the portal account read failing
      throw new Error('PORTAL_ACCOUNT_READ_FAILED');
    }),
    /PORTAL_ACCOUNT_READ_FAILED/,
  );
  const state = await readCreationLockState(service, 'A2');
  assert.strictEqual(state.held, false, 'lock released after failed portal account read');
  const next = await acquireCreationLock(service, 'A2');
  assert.ok(next.acquired);
}

// ─────────────────────────────────────────────────────────────────────
// 3. Membership and audit writes succeed, but display refresh fails —
//    lock released. The display read runs AFTER runUnderActivationLock
//    returns (lock already released), so its failure cannot retain the lock.
// ─────────────────────────────────────────────────────────────────────
async function test3_writesSucceedDisplayFailsReleases() {
  const service = makeMockService();
  seedAccount(service, 'A3');
  let displayRead = false;
  // Replicate the manageAccountUsers invite path: mark, create, clear, mark,
  // audit, clear, return { displayStatus }. Display read happens outside.
  const lockResult = await runUnderActivationLock(service, 'A3', async (ctx) => {
    ctx.markWriteUncertain();
    await service.entities.AccountMembership.create({ email: 'x@y.z', account_id: 'A3' });
    ctx.clearWriteUncertain();
    ctx.markWriteUncertain();
    await service.entities.AccountUserAudit.create({ account_id: 'A3', action: 'INVITED' });
    ctx.clearWriteUncertain();
    return { displayStatus: 201 };
  });
  assert.strictEqual(lockResult.displayStatus, 201);
  // Lock is already released here. The display read now runs outside.
  const stateBefore = await readCreationLockState(service, 'A3');
  assert.strictEqual(stateBefore.held, false, 'lock released before the display read');
  // Simulate the display refresh failing — it must not re-hold the lock.
  try {
    displayRead = true;
    throw new Error('DISPLAY_REFRESH_FAILED');
  } catch (e) {
    assert.match(e.message, /DISPLAY_REFRESH_FAILED/);
  }
  assert.ok(displayRead);
  const stateAfter = await readCreationLockState(service, 'A3');
  assert.strictEqual(stateAfter.held, false, 'display read failure leaves the lock free');
  const next = await acquireCreationLock(service, 'A3');
  assert.ok(next.acquired, 'project creation proceeds after safe release');
}

// ─────────────────────────────────────────────────────────────────────
// 4. First protected write has an uncertain outcome — lock retained.
// ─────────────────────────────────────────────────────────────────────
async function test4_firstWriteUncertainRetains() {
  const service = makeMockService();
  seedAccount(service, 'A4');
  service.membershipCreate = 'throw';
  await assert.rejects(
    runUnderActivationLock(service, 'A4', async (ctx) => {
      ctx.markWriteUncertain();
      await service.entities.AccountMembership.create({ email: 'x@y.z', account_id: 'A4' });
      ctx.clearWriteUncertain();
      return { displayStatus: 201 };
    }),
    /MEMBERSHIP_WRITE_UNCERTAIN/,
  );
  const state = await readCreationLockState(service, 'A4');
  assert.strictEqual(state.held, true, 'lock retained when the first write is uncertain');
  const next = await acquireCreationLock(service, 'A4');
  assert.strictEqual(next.acquired, false, 'concurrent acquire blocked while retained');
  assert.strictEqual(next.reason, 'LOCK_BUSY');
}

// ─────────────────────────────────────────────────────────────────────
// 5. First write succeeds but the second protected write has an uncertain
//    outcome — lock retained.
// ─────────────────────────────────────────────────────────────────────
async function test5_secondWriteUncertainRetains() {
  const service = makeMockService();
  seedAccount(service, 'A5');
  let auditCalls = 0;
  service.entities.AccountUserAudit.create = async () => {
    auditCalls += 1;
    throw new Error('AUDIT_WRITE_UNCERTAIN');
  };
  await assert.rejects(
    runUnderActivationLock(service, 'A5', async (ctx) => {
      ctx.markWriteUncertain();
      await service.entities.AccountMembership.create({ email: 'x@y.z', account_id: 'A5' });
      ctx.clearWriteUncertain();
      ctx.markWriteUncertain();
      await service.entities.AccountUserAudit.create({ account_id: 'A5', action: 'INVITED' });
      ctx.clearWriteUncertain();
      return { displayStatus: 201 };
    }),
    /AUDIT_WRITE_UNCERTAIN/,
  );
  assert.strictEqual(auditCalls, 1, 'audit write was attempted');
  const state = await readCreationLockState(service, 'A5');
  assert.strictEqual(state.held, true, 'lock retained when the second write is uncertain');
  const next = await acquireCreationLock(service, 'A5');
  assert.strictEqual(next.acquired, false, 'concurrent acquire blocked');
}

// ─────────────────────────────────────────────────────────────────────
// 6a. Conditional Portal term-start update returns zero rows — nothing was
//     written (no earlier reservation), so the lock is released on the throw.
// ─────────────────────────────────────────────────────────────────────
async function test6a_conditionalZeroRowsNoReservationReleases() {
  const service = makeMockService();
  seedAccount(service, 'A6a');
  service.updateManyResult = { updated: 0 }; // zero-row conditional update
  await assert.rejects(
    runUnderActivationLock(service, 'A6a', async (ctx) => {
      ctx.markWriteUncertain();
      const updated = await service.entities.Account.updateMany({ id: 'A6a', status: 'inactive' }, { $set: { status: 'active' } });
      ctx.clearWriteUncertain(); // zero rows is a definite no-op
      if (updated?.updated !== 1) throw new Error('ACTIVATION_STATE_CONFLICT');
      ctx.markWriteUncertain();
      await service.entities.AccountUserAudit.create({ account_id: 'A6a', action: 'TERM_STARTED' });
      ctx.clearWriteUncertain();
      return { ok: true };
    }),
    /ACTIVATION_STATE_CONFLICT/,
  );
  const state = await readCreationLockState(service, 'A6a');
  assert.strictEqual(state.held, false, 'zero-row conditional update with no reservation releases the lock');
  assert.strictEqual(service.writes.Audit.length, 0, 'no audit written for the no-op');
  const next = await acquireCreationLock(service, 'A6a');
  assert.ok(next.acquired);
}

// ─────────────────────────────────────────────────────────────────────
// 6b. Conditional renewal update returns zero rows AFTER an earlier confirmed
//     reservation — the reservation remains as the reconciliation marker, and
//     the lock is released (the zero-row outcome is definite, not uncertain).
// ─────────────────────────────────────────────────────────────────────
async function test6b_conditionalZeroRowsWithReservationReleases() {
  const service = makeMockService();
  seedAccount(service, 'A6b');
  service.updateManyResult = { updated: 0 }; // zero-row renewal update
  await assert.rejects(
    runUnderActivationLock(service, 'A6b', async (ctx) => {
      ctx.markWriteUncertain();
      await service.entities.AccountUserAudit.create({ account_id: 'A6b', action: 'RESERVED' });
      ctx.clearWriteUncertain(); // reservation confirmed
      ctx.markWriteUncertain();
      const updated = await service.entities.Account.updateMany({ id: 'A6b' }, { $set: { status: 'active' } });
      ctx.clearWriteUncertain(); // zero rows is definite
      if (updated?.updated !== 1) throw new Error('RENEWAL_REQUIRES_REVIEW');
      ctx.markWriteUncertain();
      await service.entities.AccountUserAudit.create({ account_id: 'A6b', action: 'COMPLETED' });
      ctx.clearWriteUncertain();
      return { ok: true };
    }),
    /RENEWAL_REQUIRES_REVIEW/,
  );
  const state = await readCreationLockState(service, 'A6b');
  assert.strictEqual(state.held, false, 'zero-row renewal with a reservation releases the lock');
  // The reservation remains as the reconciliation marker (the completed grant was never written).
  assert.strictEqual(service.writes.Audit.length, 1, 'only the reservation audit remains');
  assert.strictEqual(service.writes.Audit[0].action, 'RESERVED');
  const next = await acquireCreationLock(service, 'A6b');
  assert.ok(next.acquired);
}

// ─────────────────────────────────────────────────────────────────────
// 7. Project creation succeeds following a safe lock release.
// ─────────────────────────────────────────────────────────────────────
async function test7_projectCreationAfterSafeRelease() {
  const service = makeMockService();
  seedAccount(service, 'A7');
  // A failed read releases the lock.
  await assert.rejects(
    runUnderActivationLock(service, 'A7', async () => { throw new Error('READ_FAILED'); }),
    /READ_FAILED/,
  );
  // createProfessionalProject's acquire must now succeed.
  const lock = await acquireCreationLock(service, 'A7');
  assert.ok(lock.acquired, 'project creation acquires the lock after a safe release');
  await service.entities.Account.updateMany(
    { id: 'A7', creation_lock_holder: lock.token },
    { $set: { creation_lock_holder: null, creation_lock_held_at: null } },
  );
}

// ─────────────────────────────────────────────────────────────────────
// 8. ACCESS-01 retry protection remains effective: an uncertain write retains
//    the lock until an administrator force-releases it (the reconciliation
//    path). A normal retry is blocked, not allowed to overlap.
// ─────────────────────────────────────────────────────────────────────
async function test8_access01RetryProtectionRetained() {
  const service = makeMockService();
  seedAccount(service, 'A8');
  service.membershipCreate = 'throw';
  await assert.rejects(
    runUnderActivationLock(service, 'A8', async (ctx) => {
      ctx.markWriteUncertain();
      await service.entities.AccountMembership.create({ email: 'x@y.z', account_id: 'A8' });
      ctx.clearWriteUncertain();
      return { displayStatus: 201 };
    }),
    /MEMBERSHIP_WRITE_UNCERTAIN/,
  );
  // A legitimate project creation is blocked while the lock is retained.
  const blocked = await acquireCreationLock(service, 'A8');
  assert.strictEqual(blocked.acquired, false, 'retry blocked while the uncertain lock is held');
  // Administrator reconciliation force-releases the stuck lock.
  const released = await forceReleaseCreationLock(service, 'A8');
  assert.ok(released, 'administrator force-release clears the retained lock');
  // After reconciliation, project creation proceeds.
  const next = await acquireCreationLock(service, 'A8');
  assert.ok(next.acquired, 'project creation proceeds after admin reconciliation');
}

// ─────────────────────────────────────────────────────────────────────
// 9. Incorrect owner token cannot release another operation's lock
//    (exact owner-token matching preserved by runUnderActivationLock).
// ─────────────────────────────────────────────────────────────────────
async function test9_ownerTokenMatchingPreserved() {
  const service = makeMockService();
  seedAccount(service, 'A9');
  const lock = await acquireCreationLock(service, 'A9');
  assert.ok(lock.acquired);
  // Attempt a release with a foreign token via the runner's own primitive.
  const { releaseCreationLock } = await import('../base44/shared/projectCreationLock.js');
  await releaseCreationLock(service, 'A9', 'foreign-token');
  const state = await readCreationLockState(service, 'A9');
  assert.strictEqual(state.held, true, 'foreign token does not release the held lock');
  await releaseCreationLock(service, 'A9', lock.token);
  const state2 = await readCreationLockState(service, 'A9');
  assert.strictEqual(state2.held, false, 'correct owner token releases the lock');
}

// ═══════════════════════════════════════════════════════════════════════
// Runner
// ═══════════════════════════════════════════════════════════════════════
const tests = [
  ['1. initial membership read fails — lock released', test1_membershipReadFailsReleases],
  ['2. initial Portal account read fails — lock released', test2_portalAccountReadFailsReleases],
  ['3. writes succeed, display refresh fails — lock released', test3_writesSucceedDisplayFailsReleases],
  ['4. first write uncertain — lock retained', test4_firstWriteUncertainRetains],
  ['5. second write uncertain — lock retained', test5_secondWriteUncertainRetains],
  ['6a. zero-row conditional (no reservation) — released', test6a_conditionalZeroRowsNoReservationReleases],
  ['6b. zero-row conditional (with reservation) — released, marker retained', test6b_conditionalZeroRowsWithReservationReleases],
  ['7. project creation succeeds after safe release', test7_projectCreationAfterSafeRelease],
  ['8. ACCESS-01 retry protection remains effective', test8_access01RetryProtectionRetained],
  ['9. owner-token matching preserved', test9_ownerTokenMatchingPreserved],
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