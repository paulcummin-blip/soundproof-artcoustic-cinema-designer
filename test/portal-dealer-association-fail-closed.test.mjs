import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { associateDealerIdentityCore } from '../base44/shared/dealerIdentityAssociation.js';
import { consumePilotPortalLaunch, PILOT_EXTERNAL_SUBJECT, PILOT_SOUND_PROOF_ACCOUNT_ID } from '../base44/shared/portalSsoAuthority.js';

const DEALER_ID = '11111111-2222-4333-8444-555555555555';
const ENDPOINT = 'https://identity.example/functions/v1/dealer-identity-resolve';

function fixture() {
  const user = { id: 'base44-user-1', email: 'dealer@example.com', role: 'user', account_id: PILOT_SOUND_PROOF_ACCOUNT_ID };
  const rows = {
    users: [user],
    memberships: [{ id: 'membership-1', account_id: user.account_id, email: user.email, user_id: null, status: 'pending', membership_role: 'dealer_admin', access_level: 'FULL_ACCESS', is_account_admin: true }],
    identities: [],
    links: [{ id: 'link-1', account_id: user.account_id, source_system: 'ARTCOUSTIC_PARTNER_PORTAL', partner_user_id: PILOT_EXTERNAL_SUBJECT, active: true }],
    accounts: [{ id: user.account_id, name: 'Example Cinema', status: 'active' }],
    projects: [],
    usages: [],
  };
  const writes = [];
  const entity = (name, data) => ({
    async filter(query) {
      return data.filter(row => Object.entries(query).every(([key, value]) => row[key] === value)).map(row => ({ ...row }));
    },
    async update(id, patch) {
      writes.push({ name, action: 'update', patch });
      const row = data.find(row => row.id === id);
      if (!row) throw new Error('MISSING_ROW');
      Object.assign(row, patch);
      return { ...row };
    },
    async create(dataToCreate) {
      writes.push({ name, action: 'create', data: dataToCreate });
      const row = { id: name + '-' + (data.length + 1), ...dataToCreate };
      data.push(row);
      return { ...row };
    },
  });
  const base44 = {
    auth: { async me() { return { ...user }; } },
    asServiceRole: {
      sso: {
        async getAccessToken() { return { access_token: 'provider-access-token' }; },
        async getIdToken() { return 'provider-id-token'; },
      },
      entities: {
        User: entity('User', rows.users),
        AccountMembership: entity('AccountMembership', rows.memberships),
        PortalIdentity: entity('PortalIdentity', rows.identities),
        ExternalAccountLink: entity('ExternalAccountLink', rows.links),
        Account: entity('Account', rows.accounts),
        Project: entity('Project', rows.projects),
        PromotionUsage: entity('PromotionUsage', rows.usages),
      },
    },
  };
  return { base44, rows, writes, user };
}

function setup(t, identity = {}) {
  const previousFetch = globalThis.fetch;
  const previousDeno = globalThis.Deno;
  t.after(() => { globalThis.fetch = previousFetch; globalThis.Deno = previousDeno; });
  globalThis.Deno = { env: { get(name) { return name === 'PARTNER_PORTAL_DEALER_IDENTITY_URL' ? ENDPOINT : undefined; } } };
  globalThis.fetch = async () => new Response(JSON.stringify({
    dealer_account_id: DEALER_ID,
    dealer_name: 'Example Cinema',
    organisation_type: 'dealer',
    status: 'active',
    identity_version: 1,
    ...identity,
  }), { status: 200 });
}

function projectHandler(base44, onAccess = () => {}) {
  const source = readFileSync(new URL('../base44/functions/createProfessionalProject/entry.ts', import.meta.url), 'utf8')
    .replace(/^import .*$/gm, '')
    .replace('export default async function(req)', 'return async function(req)');
  return new Function(
    'createClientFromRequest', 'getAvailableCapacity', 'findActivationEntry',
    'findEffectivePromotion', 'assertCapability', 'resolveAccountAccess',
    'associateDealerIdentityCore', source,
  )(
    () => base44,
    async () => { throw new Error('CAPACITY_MUST_NOT_BE_USED'); },
    async () => null,
    async () => ({ id: 'promotion-1', promotion_type: 'UNLIMITED_PRO_PROJECTS' }),
    context => { assert.equal(context.allowed, true); },
    async () => { onAccess(); return { allowed: true, capabilities: { soundProof: true } }; },
    associateDealerIdentityCore,
  );
}

const projectRequest = name => new Request('https://soundproof.example/functions/createProfessionalProject', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ name, account_id: 'foreign-tenant', dealer_account_id: 'untrusted-browser-value', dealer_name: 'Untrusted name' }),
});

test('missing provider access token never calls identity service or writes an association', async t => {
  setup(t);
  const { base44, writes, user } = fixture();
  base44.asServiceRole.sso.getAccessToken = async () => ({});
  globalThis.fetch = async () => { throw new Error('MUST_NOT_FETCH'); };
  assert.deepEqual(await associateDealerIdentityCore(base44, user.id), { resolved: false, reason: 'NO_PORTAL_TOKEN' });
  assert.equal(writes.length, 0);
});

test('a rejected provider access token never writes an association', async t => {
  setup(t);
  const { base44, writes, user } = fixture();
  globalThis.fetch = async () => new Response('{}', { status: 401 });
  assert.equal((await associateDealerIdentityCore(base44, user.id)).resolved, false);
  assert.equal(writes.length, 0);
});

test('repeat association validates immutable stored dealer ID and name without duplicate writes', async t => {
  setup(t);
  const { base44, writes, user } = fixture();
  assert.equal((await associateDealerIdentityCore(base44, user.id)).association, 'NEWLY_LINKED');
  globalThis.fetch = async () => new Response(JSON.stringify({
    dealer_account_id: DEALER_ID, dealer_name: 'Changed display name',
    organisation_type: 'dealer', status: 'active', identity_version: 1,
  }), { status: 200 });
  assert.equal((await associateDealerIdentityCore(base44, user.id)).association, 'VALIDATED');
  assert.equal(writes.length, 1);
  assert.equal(user.dealer_account_id, DEALER_ID);
  assert.equal(user.dealer_name, 'Example Cinema');
});

test('a conflicting dealer identity fails closed and does not silently relink', async t => {
  setup(t);
  const { base44, writes, user } = fixture();
  user.dealer_account_id = '99999999-2222-4333-8444-555555555555';
  assert.equal((await associateDealerIdentityCore(base44, user.id)).reason, 'DEALER_IDENTITY_MISMATCH');
  assert.equal(writes.length, 0);
});

test('launch association failures cannot claim membership or create PortalIdentity', async t => {
  setup(t);
  globalThis.fetch = async () => new Response(JSON.stringify({
    ok: true, binding: {
      target: 'SOUND_PROOF', user_id: PILOT_EXTERNAL_SUBJECT,
      session_id: 'session-1', profile_id: '42b93780-c13e-40c6-bac3-991c2bcfc938',
      account_name: 'Example Cinema', expires_at: '2035-01-01T00:00:00.000Z',
    },
  }), { status: 200 });
  for (const reason of ['NO_PORTAL_TOKEN', 'DEALER_IDENTITY_MISMATCH', 'DEALER_IDENTITY_HTTP_401']) {
    const { base44, writes, rows, user } = fixture();
    await assert.rejects(() => consumePilotPortalLaunch(base44, user, 'A'.repeat(43), {
      bridgeUrl: 'https://bridge.example/functions/v1/launch',
      associateDealerIdentity: async () => ({ resolved: false, reason }),
    }), error => error.message === reason);
    assert.equal(writes.length, 0);
    assert.equal(rows.memberships[0].user_id, null);
    assert.equal(rows.identities.length, 0);
  }
  const { base44, user } = fixture();
  await assert.rejects(() => consumePilotPortalLaunch(base44, user, 'A'.repeat(43), {
    bridgeUrl: 'https://bridge.example/functions/v1/launch',
  }), /DEALER_ASSOCIATION_REQUIRED/);
});

test('stored dealer fields do not permit project creation without a current valid token', async t => {
  setup(t);
  for (const rejected of [false, true]) {
    const { base44, rows, writes, user } = fixture();
    user.dealer_account_id = DEALER_ID;
    user.dealer_name = 'Example Cinema';
    if (rejected) globalThis.fetch = async () => new Response('{}', { status: 401 });
    else base44.asServiceRole.sso.getAccessToken = async () => ({});
    let accessCalls = 0;
    const response = await projectHandler(base44, () => { accessCalls++; })(projectRequest('Must not exist'));
    assert.equal(response.status, 403);
    assert.equal((await response.json()).status, 'DEALER_NOT_LINKED');
    assert.equal(accessCalls, 0);
    assert.equal(rows.projects.length, 0);
    assert.equal(writes.length, 0);
  }
});

test('two guarded project creations use the same server-authoritative dealer stamp', async t => {
  setup(t);
  const { base44, rows } = fixture();
  for (const name of ['OIDC validation one', 'OIDC validation two']) {
    const response = await projectHandler(base44)(projectRequest(name));
    assert.equal(response.status, 201);
    const result = await response.json();
    assert.equal(result.project.account_id, PILOT_SOUND_PROOF_ACCOUNT_ID);
    assert.equal(result.project.dealer_account_id, DEALER_ID);
    assert.equal(result.project.dealer_name, 'Example Cinema');
  }
  assert.equal(rows.projects.length, 2);
  assert.notEqual(rows.projects[0].id, rows.projects[1].id);
});

test('central administrators retain the internal project workflow without a Portal token', async t => {
  setup(t);
  const { base44, rows, user } = fixture();
  user.role = 'admin';
  base44.asServiceRole.sso.getAccessToken = async () => { throw new Error('MUST_NOT_REQUIRE_PORTAL'); };
  const response = await projectHandler(base44)(projectRequest('Internal support'));
  assert.equal(response.status, 201);
  assert.equal(rows.projects[0].commercial_tier, 'INTERNAL');
});
