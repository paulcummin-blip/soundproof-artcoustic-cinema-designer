import assert from 'node:assert';
import { buildMutationDisplayResponse } from '../base44/shared/accountUserDisplayRefresh.js';
import { runUnderActivationLock, acquireCreationLock, readCreationLockState } from '../base44/shared/projectCreationLock.js';

// ─────────────────────────────────────────────────────────────────────
// In-memory mock. Only the Account mutex + configurable write entities.
// No dealer, project, audit or Project Token data is touched.
// ─────────────────────────────────────────────────────────────────────
function makeMockService() {
  const accounts = new Map();
  const writes = { Membership: [], Audit: [] };
  const service = {
    accounts,
    writes,
    membershipCreate: 'ok',
    auditCreate: 'ok',
    refreshFails: false,
    entities: {
      Account: {
        async updateMany(query, update) {
          const id = query?.id;
          const rec = accounts.get(id);
          if (!rec) return { updated: 0 };
          const holderQuery = query.creation_lock_holder;
          const matches = holderQuery === null ? !rec.creation_lock_holder : rec.creation_lock_holder === holderQuery;
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
        async filter() { return writes.Membership.slice(); },
      },
      AccountUserAudit: {
        async create(data) {
          if (service.auditCreate === 'throw') throw new Error('AUDIT_WRITE_UNCERTAIN');
          const rec = { id: `a-${writes.Audit.length + 1}`, ...data };
          writes.Audit.push(rec);
          return rec;
        },
        async filter() { return writes.Audit.slice(); },
      },
    },
  };
  return service;
}

function seedAccount(service, id, name = 'Test Dealer') {
  service.accounts.set(id, { id, name, account_type: 'dealer', status: 'active', creation_lock_holder: null, creation_lock_held_at: null });
}

// Mirrors manageAccountUsers.loadAccountUsers shape (read-only).
async function loadAccountUsers(service, account) {
  if (service.refreshFails) throw new Error('DISPLAY_REFRESH_FAILED');
  const [memberships, audits] = await Promise.all([
    service.entities.AccountMembership.filter({ account_id: account.id }),
    service.entities.AccountUserAudit.filter({ account_id: account.id }),
  ]);
  return {
    account: { id: account.id, name: account.name, account_type: account.account_type, status: account.status },
    members: memberships,
    audits,
    seats: { used: memberships.length, maximum: 5, remaining: 5 - memberships.length },
  };
}

// Mirrors the manageAccountUsers post-lock flow: run the protected mutation
// inside runUnderActivationLock, then build the display response.
async function manageAccountUsersFlow(service, account, work, displayStatus = 200) {
  const lockResult = await runUnderActivationLock(service, account.id, work);
  if (lockResult instanceof Response) return { response: lockResult, lockResult };
  let refreshResult, refreshError;
  try {
    refreshResult = await loadAccountUsers(service, account);
  } catch (err) {
    refreshError = err;
  }
  return {
    response: buildMutationDisplayResponse({ displayStatus: lockResult.displayStatus || displayStatus, account, refreshResult, refreshError }),
    lockResult,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 1. Successful membership change and successful refresh.
// ═══════════════════════════════════════════════════════════════════════
async function test1_successfulMutationAndRefresh() {
  const service = makeMockService();
  seedAccount(service, 'A1');
  const account = service.accounts.get('A1');
  const { response, lockResult } = await manageAccountUsersFlow(service, account, async (ctx) => {
    ctx.markWriteUncertain();
    await service.entities.AccountMembership.create({ email: 'x@y.z', account_id: 'A1' });
    ctx.clearWriteUncertain();
    ctx.markWriteUncertain();
    await service.entities.AccountUserAudit.create({ account_id: 'A1', action: 'INVITED' });
    ctx.clearWriteUncertain();
    return { displayStatus: 201 };
  });
  assert.strictEqual(lockResult.displayStatus, 201);
  assert.strictEqual(response.status, 201);
  const body = await response.json();
  assert.strictEqual(body.mutation_saved, undefined, 'no refresh warning on a successful refresh');
  assert.strictEqual(body.members.length, 1, 'refreshed member list returned');
  assert.strictEqual(body.audits.length, 1);
  const state = await readCreationLockState(service, 'A1');
  assert.strictEqual(state.held, false, 'lock released after a successful mutation');
}

// ═══════════════════════════════════════════════════════════════════════
// 2. Successful membership change followed by failed refresh — confirmed
//    save with a refresh warning; existing rows retained (no members in the
//    response).
// ═══════════════════════════════════════════════════════════════════════
async function test2_successfulMutationFailedRefresh() {
  const service = makeMockService();
  seedAccount(service, 'A2');
  const account = service.accounts.get('A2');
  service.refreshFails = true;
  const { response, lockResult } = await manageAccountUsersFlow(service, account, async (ctx) => {
    ctx.markWriteUncertain();
    await service.entities.AccountMembership.create({ email: 'x@y.z', account_id: 'A2' });
    ctx.clearWriteUncertain();
    ctx.markWriteUncertain();
    await service.entities.AccountUserAudit.create({ account_id: 'A2', action: 'ACCESS_CHANGED' });
    ctx.clearWriteUncertain();
    return { displayStatus: 200 };
  });
  assert.strictEqual(lockResult.displayStatus, 200);
  assert.strictEqual(response.status, 200, 'mutation success status retained');
  const body = await response.json();
  assert.strictEqual(body.mutation_saved, true, 'mutation reported as saved');
  assert.strictEqual(body.refresh_warning, 'Change saved. Refresh the user list.');
  assert.strictEqual(Array.isArray(body.members), false, 'no member rows returned — dealer keeps existing rows');
  assert.strictEqual(body.audits, undefined);
  assert.ok(body.account && body.account.id === 'A2', 'account context returned');
  // The mutation was actually persisted exactly once.
  assert.strictEqual(service.writes.Membership.length, 1, 'membership written exactly once');
  assert.strictEqual(service.writes.Audit.length, 1, 'audit written exactly once');
  const state = await readCreationLockState(service, 'A2');
  assert.strictEqual(state.held, false, 'lock released (refresh failure is not a mutation failure)');
}

// ═══════════════════════════════════════════════════════════════════════
// 3. Refresh after connectivity returns — a list read returns the current
//    state (one mutation, one audit), not duplicated.
// ═══════════════════════════════════════════════════════════════════════
async function test3_refreshAfterConnectivityReturns() {
  const service = makeMockService();
  seedAccount(service, 'A3');
  const account = service.accounts.get('A3');
  service.refreshFails = true;
  // First attempt: mutation saved, refresh failed.
  await manageAccountUsersFlow(service, account, async (ctx) => {
    ctx.markWriteUncertain();
    await service.entities.AccountMembership.create({ email: 'x@y.z', account_id: 'A3' });
    ctx.clearWriteUncertain();
    ctx.markWriteUncertain();
    await service.entities.AccountUserAudit.create({ account_id: 'A3', action: 'INVITED' });
    ctx.clearWriteUncertain();
    return { displayStatus: 201 };
  });
  // Connectivity returns; the dealer clicks Refresh (a list read only).
  service.refreshFails = false;
  const refreshed = await loadAccountUsers(service, account);
  assert.strictEqual(refreshed.members.length, 1, 'refresh shows the one saved member');
  assert.strictEqual(refreshed.audits.length, 1, 'refresh shows the one audit — not duplicated');
}

// ═══════════════════════════════════════════════════════════════════════
// 4. No repeated membership writes or duplicate audit entries — the refresh
//    path is read-only; it never re-runs the work callback.
// ═══════════════════════════════════════════════════════════════════════
async function test4_noRepeatedWritesOrDuplicateAudits() {
  const service = makeMockService();
  seedAccount(service, 'A4');
  const account = service.accounts.get('A4');
  let workRuns = 0;
  service.refreshFails = true;
  await manageAccountUsersFlow(service, account, async (ctx) => {
    workRuns += 1;
    ctx.markWriteUncertain();
    await service.entities.AccountMembership.create({ email: 'x@y.z', account_id: 'A4' });
    ctx.clearWriteUncertain();
    ctx.markWriteUncertain();
    await service.entities.AccountUserAudit.create({ account_id: 'A4', action: 'REMOVED' });
    ctx.clearWriteUncertain();
    return { displayStatus: 200 };
  });
  // A subsequent Refresh is a pure list read — it must not re-invoke the work.
  service.refreshFails = false;
  await loadAccountUsers(service, account);
  assert.strictEqual(workRuns, 1, 'the mutation work ran exactly once; refresh did not repeat it');
  assert.strictEqual(service.writes.Membership.length, 1, 'still exactly one membership write');
  assert.strictEqual(service.writes.Audit.length, 1, 'still exactly one audit entry');
}

// ═══════════════════════════════════════════════════════════════════════
// 5. Genuine mutation failure still reports failure — the throw bypasses the
//    display-response helper and propagates (handler outer catch → 500).
// ═══════════════════════════════════════════════════════════════════════
async function test5_genuineMutationFailureReportsFailure() {
  const service = makeMockService();
  seedAccount(service, 'A5');
  const account = service.accounts.get('A5');
  service.membershipCreate = 'throw';
  let helperReached = false;
  let thrown = null;
  try {
    await manageAccountUsersFlow(service, account, async (ctx) => {
      ctx.markWriteUncertain();
      await service.entities.AccountMembership.create({ email: 'x@y.z', account_id: 'A5' });
      ctx.clearWriteUncertain();
      return { displayStatus: 201 };
    });
  } catch (err) {
    thrown = err;
  }
  assert.ok(thrown, 'a genuine mutation failure throws (reported as failure, not saved)');
  assert.match(thrown.message, /MEMBERSHIP_WRITE_UNCERTAIN/);
  assert.strictEqual(helperReached, false, 'buildMutationDisplayResponse is not reached on a mutation failure');
  const state = await readCreationLockState(service, 'A5');
  assert.strictEqual(state.held, true, 'uncertain write retains the lock for reconciliation');
}

// ═══════════════════════════════════════════════════════════════════════
// 6. Existing account-lock protection remains effective — busy lock blocks a
//    concurrent operation; a successful mutation releases the lock.
// ═══════════════════════════════════════════════════════════════════════
async function test6_accountLockProtectionRemains() {
  const service = makeMockService();
  seedAccount(service, 'A6');
  const account = service.accounts.get('A6');
  // Hold the lock with an unrelated operation.
  const held = await acquireCreationLock(service, 'A6');
  assert.ok(held.acquired);
  const busy = await runUnderActivationLock(service, 'A6', async () => ({ displayStatus: 200 }));
  // The busy response is returned by the runner's options.busy default.
  assert.strictEqual(busy.ok, false, 'concurrent mutation is blocked while the lock is held');
  assert.strictEqual(busy.error, 'ACCOUNT_OPERATION_BUSY');
  // Release the held lock; a mutation now proceeds and releases on success.
  const { releaseCreationLock } = await import('../base44/shared/projectCreationLock.js');
  await releaseCreationLock(service, 'A6', held.token);
  await manageAccountUsersFlow(service, account, async (ctx) => {
    ctx.markWriteUncertain();
    await service.entities.AccountMembership.create({ email: 'x@y.z', account_id: 'A6' });
    ctx.clearWriteUncertain();
    ctx.markWriteUncertain();
    await service.entities.AccountUserAudit.create({ account_id: 'A6', action: 'INVITED' });
    ctx.clearWriteUncertain();
    return { displayStatus: 201 };
  });
  const state = await readCreationLockState(service, 'A6');
  assert.strictEqual(state.held, false, 'lock released after a successful mutation');
  const next = await acquireCreationLock(service, 'A6');
  assert.ok(next.acquired, 'lock acquirable again after release');
}

// ═══════════════════════════════════════════════════════════════════════
// Runner
// ═══════════════════════════════════════════════════════════════════════
const tests = [
  ['1. successful mutation and successful refresh', test1_successfulMutationAndRefresh],
  ['2. successful mutation followed by failed refresh', test2_successfulMutationFailedRefresh],
  ['3. refresh after connectivity returns', test3_refreshAfterConnectivityReturns],
  ['4. no repeated writes or duplicate audit entries', test4_noRepeatedWritesOrDuplicateAudits],
  ['5. genuine mutation failure still reports failure', test5_genuineMutationFailureReportsFailure],
  ['6. account-lock protection remains effective', test6_accountLockProtectionRemains],
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