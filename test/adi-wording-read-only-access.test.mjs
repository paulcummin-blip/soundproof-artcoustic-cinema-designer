/**
 * Sound Proof — authorisation for the ADI editorial action.
 *
 * What is proved here:
 *   - the ADI editorial action resolves account access by READING ALONE, through a
 *     door that carries reads and no write method at all;
 *   - the decision it reaches is the SAME decision the shared resolver reaches, for
 *     every representative case: a master administrator, an unauthenticated caller, a
 *     dealer on their own project, a dealer on another dealer's project, a project
 *     whose account does not match the caller, a seat that was removed or suspended,
 *     an ambiguous assignment, an invited login binding on first use, and a verified
 *     Partner Portal session;
 *   - nothing the shared resolver persists is persisted on the read-only path, while
 *     the shared resolver's own bookkeeping is untouched: it still stamps the seat and
 *     the login and records its audit row, so every other caller is unchanged;
 *   - the one case where the shared resolver writes a record BEFORE it decides — a
 *     legacy login holding an account but no seat — is mirrored on the read-only path
 *     in memory: the identical decision, with nothing created.
 *
 * The provider bridge is stubbed, the stores are in memory, and the read-only claim is
 * proved twice: the production read-only door records and refuses every write that is
 * attempted, and the recording store is asserted to have seen none.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveAccountAccess } from '../base44/shared/accountAccessAuthority.js';
import {
  ACCOUNT_READ_SURFACE,
  readOnlyAccountEntities,
  resolveAccountAccessReadOnly,
} from '../base44/shared/accountAccessReadOnly.js';
import { readOnlyEntities } from '../base44/shared/reportDesignIntent/readOnlyEntities.js';
import { loadOwnedProject } from '../base44/shared/publishedEngineeringRead.js';
import {
  PILOT_EXTERNAL_SUBJECT,
  PILOT_PARTNER_PROFILE_ID,
  PILOT_SOUND_PROOF_ACCOUNT_ID,
  PORTAL_SOURCE,
  PORTAL_TARGET,
} from '../base44/shared/pilotPortalConstants.js';

// ── The store: in memory, and it records every write it is asked for ──

function createEntities(store, writes) {
  let nextId = 1;
  return new Proxy({}, {
    get(_target, entityName) {
      const rows = store[entityName] ||= [];
      return {
        async filter(query) {
          return rows.filter((row) =>
            Object.entries(query).every(([key, value]) => row[key] === value)
          );
        },
        async get(id) {
          const row = rows.find((item) => item.id === id);
          return row ? { ...row } : null;
        },
        async update(id, patch) {
          writes.push({ entity: String(entityName), method: 'update' });
          const row = rows.find((item) => item.id === id);
          if (!row) throw new Error(`Missing ${String(entityName)} ${id}`);
          Object.assign(row, patch);
          return { ...row };
        },
        async create(data) {
          writes.push({ entity: String(entityName), method: 'create' });
          const row = { id: `new-${nextId++}`, ...data };
          rows.push(row);
          return { ...row };
        },
      };
    },
  });
}

function makeBase44(entities) {
  return {
    asServiceRole: {
      entities,
      sso: { getIdToken: async () => ({ id_token: 'portal-id-token' }) },
    },
  };
}

/** The bridge, stubbed: the pinned pilot account may exist outside the portal. */
function stubPortalBridge(binding) {
  const previousFetch = globalThis.fetch;
  const hadDeno = Object.prototype.hasOwnProperty.call(globalThis, 'Deno');
  const previousDeno = globalThis.Deno;
  globalThis.Deno = {
    env: {
      get: (key) => (key === 'PARTNER_PORTAL_BRIDGE_URL' ? 'https://bridge.example.test' : undefined),
    },
  };
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ ok: true, binding }),
  });
  return () => {
    globalThis.fetch = previousFetch;
    if (hadDeno) globalThis.Deno = previousDeno;
    else delete globalThis.Deno;
  };
}

/** The decision, and only the decision: what the two resolvers must agree on. */
function decision(context) {
  return {
    allowed: context?.allowed ?? false,
    reason: context?.reason ?? null,
    isMasterAdmin: context?.isMasterAdmin ?? false,
    isAccountAdmin: context?.isAccountAdmin ?? false,
    accessLevel: context?.accessLevel ?? null,
    capabilities: context?.capabilities ?? null,
    login: context?.user
      ? {
        account_id: context.user.account_id ?? null,
        account_role: context.user.account_role ?? null,
        access_level: context.user.access_level ?? null,
        app_role: context.user.app_role ?? null,
      }
      : null,
    account: context?.account
      ? { id: context.account.id, name: context.account.name, status: context.account.status }
      : null,
    membership: context?.membership
      ? {
        status: context.membership.status,
        is_account_admin: context.membership.is_account_admin,
        access_level: context.membership.access_level,
      }
      : null,
  };
}

/**
 * The same case, run twice against two fresh copies of the same records: once through
 * the shared resolver, once through the read-only path. The read-only side reads
 * through the production read-only door, so any write it attempts is recorded and
 * refused rather than silently allowed.
 */
async function runCase({ seed, sessionUser, projectId = null, binding = null }) {
  const oldStore = structuredClone(seed);
  const oldWrites = [];
  const oldEntities = createEntities(oldStore, oldWrites);
  const restoreOld = stubPortalBridge(binding);
  let oldContext;
  let oldOwnership = null;
  try {
    oldContext = await resolveAccountAccess(makeBase44(oldEntities), sessionUser);
    if (projectId) oldOwnership = await ownershipVerdict(oldEntities, projectId, oldContext);
  } finally {
    restoreOld();
  }

  const newStore = structuredClone(seed);
  const newWrites = [];
  const newEntities = createEntities(newStore, newWrites);
  const guarded = readOnlyEntities(newEntities);
  const restoreNew = stubPortalBridge(binding);
  let newContext;
  let newOwnership = null;
  try {
    newContext = await resolveAccountAccessReadOnly({
      base44: makeBase44(newEntities),
      entities: readOnlyAccountEntities(guarded.entities),
      sessionUser,
    });
    if (projectId) newOwnership = await ownershipVerdict(guarded.entities, projectId, newContext);
  } finally {
    restoreNew();
  }

  return {
    oldContext,
    newContext,
    oldOwnership,
    newOwnership,
    oldWrites,
    newWrites,
    attempts: guarded.attempts,
    oldStore,
    newStore,
  };
}

/** Ownership, decided by the project read every caller shares. */
async function ownershipVerdict(entities, projectId, access) {
  try {
    const result = await loadOwnedProject({ entities }, projectId, access);
    return { ok: true, account: result.projectAccountId };
  } catch (error) {
    return { ok: false, code: error?.code || error?.message || 'UNKNOWN' };
  }
}

/** The two resolvers agree, and the read-only one wrote nothing. */
function assertSameDecision(outcome) {
  assert.deepEqual(decision(outcome.newContext), decision(outcome.oldContext));
  assert.deepEqual(outcome.newWrites, [], 'the read-only path persisted nothing');
  assert.deepEqual(outcome.attempts, [], 'the read-only path attempted no write');
}

// ── Fixtures ──

const DEALER_ACCOUNT_ID = 'account-1';

function cleanSeatSeed() {
  return {
    User: [{
      id: 'user-1',
      email: 'designer@example.com',
      role: 'user',
      account_id: DEALER_ACCOUNT_ID,
      account_role: 'account_user',
      access_level: 'FULL_ACCESS',
      app_role: 'Designer Pro',
    }],
    Account: [{ id: DEALER_ACCOUNT_ID, name: 'Dealer One', status: 'active' }],
    AccountMembership: [{
      id: 'seat-1',
      user_id: 'user-1',
      email: 'designer@example.com',
      full_name: null,
      account_id: DEALER_ACCOUNT_ID,
      membership_role: 'full_access',
      access_level: 'FULL_ACCESS',
      is_account_admin: false,
      status: 'active',
      accepted_at: '2026-01-01T00:00:00.000Z',
    }],
  };
}

const OWN_PROJECT = { id: 'project-1', name: 'Own Cinema', account_id: DEALER_ACCOUNT_ID };
const OTHER_PROJECT = { id: 'project-2', name: 'Someone Else', account_id: 'account-2' };

function pilotSeed() {
  const future = new Date(Date.now() + 3_600_000).toISOString();
  return {
    User: [{
      id: 'user-1',
      email: 'pilot@example.com',
      role: 'user',
      account_id: PILOT_SOUND_PROOF_ACCOUNT_ID,
      account_role: 'account_user',
      access_level: 'FULL_ACCESS',
      app_role: 'Designer Pro',
    }],
    Account: [{ id: PILOT_SOUND_PROOF_ACCOUNT_ID, name: 'Pilot Dealer', status: 'active' }],
    AccountMembership: [{
      id: 'seat-1',
      user_id: 'user-1',
      email: 'pilot@example.com',
      full_name: null,
      account_id: PILOT_SOUND_PROOF_ACCOUNT_ID,
      membership_role: 'full_access',
      access_level: 'FULL_ACCESS',
      is_account_admin: false,
      status: 'active',
      accepted_at: '2026-01-01T00:00:00.000Z',
    }],
    ExternalAccountLink: [{
      id: 'link-1',
      account_id: PILOT_SOUND_PROOF_ACCOUNT_ID,
      source_system: PORTAL_SOURCE,
      partner_user_id: PILOT_EXTERNAL_SUBJECT,
      external_account_name: 'Pilot Dealer',
      active: true,
    }],
    PortalIdentity: [{
      id: 'identity-1',
      base44_user_id: 'user-1',
      target: PORTAL_TARGET,
      portal_session_id: 'session-1',
      external_subject: PILOT_EXTERNAL_SUBJECT,
      partner_profile_id: PILOT_PARTNER_PROFILE_ID,
      account_id: PILOT_SOUND_PROOF_ACCOUNT_ID,
      account_name: 'Pilot Dealer',
      binding_expires_at: future,
    }],
  };
}

function pilotBinding(overrides = {}) {
  return {
    target: PORTAL_TARGET,
    external_subject: PILOT_EXTERNAL_SUBJECT,
    portal_session_id: 'session-1',
    partner_profile_id: PILOT_PARTNER_PROFILE_ID,
    account_name: 'Pilot Dealer',
    binding_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    ...overrides,
  };
}

// ── The door ──

test('the door the ADI action resolves through carries reads and no write', () => {
  const door = readOnlyAccountEntities(createEntities({}, []));
  assert.deepEqual(Object.keys(door).sort(), Object.keys(ACCOUNT_READ_SURFACE).sort());
  for (const [name, methods] of Object.entries(ACCOUNT_READ_SURFACE)) {
    assert.deepEqual(Object.keys(door[name]).sort(), [...methods].sort());
    for (const method of ['create', 'update', 'delete', 'bulkCreate', 'bulkUpdate', 'deleteMany']) {
      assert.equal(door[name][method], undefined, `${name}.${method} is not on the door`);
    }
  }
});

// ── The representative cases ──

test('an unauthenticated caller is denied by both resolvers', async () => {
  const outcome = await runCase({ seed: cleanSeatSeed(), sessionUser: null });
  assertSameDecision(outcome);
  assert.equal(outcome.newContext.allowed, false);
  assert.equal(outcome.newContext.reason, 'UNAUTHENTICATED');
});

test('a master administrator is allowed by both, with every capability', async () => {
  const outcome = await runCase({ seed: {}, sessionUser: { id: 'admin-1', role: 'admin' } });
  assertSameDecision(outcome);
  assert.equal(outcome.newContext.allowed, true);
  assert.equal(outcome.newContext.isMasterAdmin, true);
  assert.deepEqual(outcome.newContext.capabilities, {
    soundProof: true,
    priceList: true,
    commercial: true,
    manageUsers: true,
    masterAdmin: true,
  });
});

test('a dealer on their own project is allowed identically, and owns it in both runs', async () => {
  const outcome = await runCase({
    seed: { ...cleanSeatSeed(), Project: [OWN_PROJECT, OTHER_PROJECT] },
    sessionUser: { id: 'user-1', role: 'user' },
    projectId: OWN_PROJECT.id,
  });
  assertSameDecision(outcome);
  assert.equal(outcome.newContext.allowed, true);
  assert.equal(outcome.newContext.accessLevel, 'FULL_ACCESS');
  assert.deepEqual(outcome.newOwnership, { ok: true, account: DEALER_ACCOUNT_ID });
  assert.deepEqual(outcome.newOwnership, outcome.oldOwnership);
});

test('a dealer on another dealer\'s project is judged identically by both', async () => {
  const outcome = await runCase({
    seed: { ...cleanSeatSeed(), Project: [OWN_PROJECT, OTHER_PROJECT] },
    sessionUser: { id: 'user-1', role: 'user' },
    projectId: OTHER_PROJECT.id,
  });
  assertSameDecision(outcome);
  // The seat is fine and their own account is fine: the project is not theirs.
  assert.equal(outcome.newContext.allowed, true);
  assert.deepEqual(outcome.newOwnership, { ok: false, code: 'FORBIDDEN' });
  assert.deepEqual(outcome.newOwnership, outcome.oldOwnership);
});

test('a project whose account does not match the caller is refused identically', async () => {
  const accountless = { id: 'project-3', name: 'Internal Project', account_id: null };
  const outcome = await runCase({
    seed: { ...cleanSeatSeed(), Project: [accountless] },
    sessionUser: { id: 'user-1', role: 'user' },
    projectId: accountless.id,
  });
  assertSameDecision(outcome);
  assert.deepEqual(outcome.newOwnership, { ok: false, code: 'FORBIDDEN' });
  assert.deepEqual(outcome.newOwnership, outcome.oldOwnership);
});

test('a removed seat and a suspended seat are both refused identically', async () => {
  for (const status of ['removed', 'suspended']) {
    const seed = cleanSeatSeed();
    seed.AccountMembership[0].status = status;
    const outcome = await runCase({ seed, sessionUser: { id: 'user-1', role: 'user' } });
    assertSameDecision(outcome);
    assert.equal(outcome.newContext.allowed, false);
    assert.equal(outcome.newContext.reason, 'MEMBERSHIP_INACTIVE');
  }
});

test('an ambiguous assignment is refused identically', async () => {
  const seed = {
    User: [{ id: 'user-1', email: 'designer@example.com', role: 'user', account_role: 'account_user' }],
    Account: [
      { id: 'account-1', name: 'Dealer One', status: 'active' },
      { id: 'account-2', name: 'Dealer Two', status: 'active' },
    ],
    AccountMembership: [
      { id: 'seat-1', user_id: 'user-1', email: 'designer@example.com', account_id: 'account-1', status: 'pending' },
      { id: 'seat-2', user_id: 'user-1', email: 'designer@example.com', account_id: 'account-2', status: 'pending' },
    ],
  };
  const outcome = await runCase({ seed, sessionUser: { id: 'user-1', role: 'user' } });
  assertSameDecision(outcome);
  assert.equal(outcome.newContext.allowed, false);
  assert.equal(outcome.newContext.reason, 'MEMBERSHIP_AMBIGUOUS');
});

test('an invited login binding on first use is allowed identically, and only the shared resolver persists it', async () => {
  const seed = {
    User: [{ id: 'user-1', email: 'Designer@Example.com', role: 'user', account_role: 'account_user' }],
    Account: [{ id: DEALER_ACCOUNT_ID, name: 'Dealer One', status: 'active' }],
    AccountMembership: [{
      id: 'seat-1',
      email: 'designer@example.com',
      account_id: DEALER_ACCOUNT_ID,
      membership_role: 'sound_proof_only',
      access_level: 'SOUND_PROOF_ONLY',
      is_account_admin: false,
      status: 'pending',
    }],
    AccountUserAudit: [],
  };
  const outcome = await runCase({ seed, sessionUser: { id: 'user-1', role: 'user' } });

  assertSameDecision(outcome);
  assert.equal(outcome.newContext.allowed, true);
  assert.equal(outcome.newContext.accessLevel, 'SOUND_PROOF_ONLY');
  assert.equal(outcome.newContext.capabilities.priceList, false);

  // The shared resolver keeps the account's books, exactly as before…
  assert.ok(outcome.oldWrites.length > 0, 'the shared resolver still stamps the seat and the login');
  assert.equal(outcome.oldStore.User[0].account_id, DEALER_ACCOUNT_ID);
  assert.equal(outcome.oldStore.AccountMembership[0].status, 'active');
  assert.equal(outcome.oldStore.AccountUserAudit[0].action, 'INVITATION_ACCEPTED');

  // …and the ADI path reaches the same decision having changed nothing.
  assert.deepEqual(outcome.newWrites, []);
  assert.equal(outcome.newStore.User[0].account_id, undefined);
  assert.equal(outcome.newStore.AccountMembership[0].status, 'pending');
  assert.deepEqual(outcome.newStore.AccountUserAudit || [], []);
});

test('a legacy login with an account and no seat is allowed identically, with no seat created', async () => {
  const seed = {
    User: [{
      id: 'user-1',
      email: 'legacy@example.com',
      role: 'user',
      account_id: DEALER_ACCOUNT_ID,
      account_role: 'account_user',
      access_level: 'FULL_ACCESS',
    }],
    Account: [{ id: DEALER_ACCOUNT_ID, name: 'Dealer One', status: 'active' }],
    AccountMembership: [],
    AccountUserAudit: [],
  };
  const outcome = await runCase({ seed, sessionUser: { id: 'user-1', role: 'user' } });

  // The one case where the shared resolver writes a record BEFORE it decides: the seat
  // it would create is mirrored in memory, so the decision is the identical one.
  assertSameDecision(outcome);
  assert.equal(outcome.newContext.allowed, true);
  assert.equal(outcome.newContext.isAccountAdmin, true);
  assert.equal(outcome.newContext.accessLevel, 'FULL_ACCESS');

  assert.equal(outcome.oldStore.AccountMembership.length, 1, 'the shared resolver bootstrapped the seat');
  assert.equal(outcome.newStore.AccountMembership.length, 0, 'the ADI path created no seat');
  assert.deepEqual(outcome.newWrites, []);
});

test('a verified Partner Portal session is allowed identically, and only the shared resolver refreshes it', async () => {
  const outcome = await runCase({
    seed: pilotSeed(),
    sessionUser: { id: 'user-1', role: 'user' },
    binding: pilotBinding(),
  });
  assertSameDecision(outcome);
  assert.equal(outcome.newContext.allowed, true);
  assert.equal(outcome.newContext.account.id, PILOT_SOUND_PROOF_ACCOUNT_ID);
  // The gate's bookkeeping is the shared resolver's, and it is unchanged.
  assert.ok(outcome.oldWrites.length > 0, 'the shared resolver still refreshes the verified identity');
  assert.deepEqual(outcome.newWrites, []);
});

test('a Partner Portal session that no longer verifies is refused identically', async () => {
  const outcome = await runCase({
    seed: pilotSeed(),
    sessionUser: { id: 'user-1', role: 'user' },
    binding: pilotBinding({ portal_session_id: 'session-old' }),
  });
  assertSameDecision(outcome);
  assert.equal(outcome.newContext.allowed, false);
  assert.equal(outcome.newContext.reason, 'PORTAL_SESSION_REJECTED');
  assert.deepEqual(outcome.newWrites, []);
});

test('a pilot login with no bound portal identity is refused identically', async () => {
  const seed = pilotSeed();
  seed.PortalIdentity = [];
  const outcome = await runCase({
    seed,
    sessionUser: { id: 'user-1', role: 'user' },
    binding: pilotBinding(),
  });
  assertSameDecision(outcome);
  assert.equal(outcome.newContext.allowed, false);
  assert.equal(outcome.newContext.reason, 'PORTAL_IDENTITY_NOT_BOUND');
});