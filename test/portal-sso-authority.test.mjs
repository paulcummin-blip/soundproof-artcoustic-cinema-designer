import test from 'node:test';
import assert from 'node:assert/strict';
import {
  consumePilotPortalLaunch,
  PILOT_EXTERNAL_SUBJECT,
  PILOT_SOUND_PROOF_ACCOUNT_ID,
  resolvePilotPortalMapping,
  validatePilotPortalAccessIfRequired,
} from '../base44/shared/portalSsoAuthority.js';

function matches(row, query) {
  return Object.entries(query).every(([key, value]) => row?.[key] === value);
}

function memoryEntity(rows) {
  return {
    rows,
    async filter(query) {
      return rows.filter((row) => matches(row, query)).map((row) => ({ ...row }));
    },
    async update(id, patch) {
      const row = rows.find((item) => item.id === id);
      if (!row) throw new Error('missing row');
      Object.assign(row, patch);
      return { ...row };
    },
    async create(data) {
      const row = { id: `created-${rows.length + 1}`, ...data };
      rows.push(row);
      return { ...row };
    },
  };
}

function fixture() {
  const link = {
    id: 'link-1',
    account_id: PILOT_SOUND_PROOF_ACCOUNT_ID,
    source_system: 'ARTCOUSTIC_PARTNER_PORTAL',
    partner_user_id: PILOT_EXTERNAL_SUBJECT,
    external_account_name: 'iCubed Home Cinema',
    active: true,
  };
  const account = {
    id: PILOT_SOUND_PROOF_ACCOUNT_ID,
    name: 'iCubed Home Cinema',
    status: 'active',
  };
  const membership = {
    id: 'membership-1',
    account_id: PILOT_SOUND_PROOF_ACCOUNT_ID,
    user_id: 'base44-user-1',
    status: 'pending',
    is_account_admin: true,
    access_level: 'FULL_ACCESS',
  };
  const rows = {
    links: [link],
    accounts: [account],
    memberships: [membership],
    identities: [],
  };
  const service = {
    entities: {
      ExternalAccountLink: memoryEntity(rows.links),
      Account: memoryEntity(rows.accounts),
      AccountMembership: memoryEntity(rows.memberships),
      PortalIdentity: memoryEntity(rows.identities),
    },
  };
  const base44 = {
    asServiceRole: {
      ...service,
      sso: {
        async getIdToken() {
          return { id_token: 'verified-provider-id-token' };
        },
      },
    },
  };
  return { base44, service, rows, account };
}

function bridgeBinding(overrides = {}) {
  return {
    target: 'SOUND_PROOF',
    user_id: PILOT_EXTERNAL_SUBJECT,
    session_id: 'portal-session-1',
    profile_id: '42b93780-c13e-40c6-bac3-991c2bcfc938',
    account_name: 'iCubed Home Cinema',
    expires_at: '2035-01-01T00:00:00.000Z',
    ...overrides,
  };
}

test('non-pilot Sound Proof accounts retain their existing access path', async () => {
  const result = await resolvePilotPortalMapping({ entities: {} }, 'another-account');
  assert.deepEqual(result, { required: false, allowed: true, link: null });
});

test('the pilot requires one exact UUID-to-account link', async () => {
  const { service, rows } = fixture();
  const ok = await resolvePilotPortalMapping(service, PILOT_SOUND_PROOF_ACCOUNT_ID);
  assert.equal(ok.required, true);
  assert.equal(ok.allowed, true);
  assert.equal(ok.link.partner_user_id, PILOT_EXTERNAL_SUBJECT);

  rows.links.push({ ...rows.links[0], id: 'link-2', account_id: 'other-account' });
  const duplicate = await resolvePilotPortalMapping(service, PILOT_SOUND_PROOF_ACCOUNT_ID);
  assert.equal(duplicate.allowed, false);
  assert.equal(duplicate.reason, 'PORTAL_MAPPING_AMBIGUOUS');
});

test('consume stores no raw binding secret and requires the pre-assigned Base44 user seat', async (t) => {
  const { base44, rows } = fixture();
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (_url, request) => {
    const body = JSON.parse(request.body);
    assert.equal(body.action, 'consume');
    assert.equal(body.target, 'SOUND_PROOF');
    return new Response(JSON.stringify({ ok: true, binding: bridgeBinding() }), { status: 200 });
  };

  const result = await consumePilotPortalLaunch(
    base44,
    { id: 'base44-user-1' },
    'A'.repeat(43),
  );
  assert.equal(result.ok, true);
  assert.equal(rows.identities.length, 1);
  assert.equal(rows.identities[0].external_subject, PILOT_EXTERNAL_SUBJECT);
  assert.equal(rows.identities[0].account_id, PILOT_SOUND_PROOF_ACCOUNT_ID);
  assert.equal('binding_secret' in rows.identities[0], false);

  rows.memberships[0].user_id = 'different-user';
  await assert.rejects(
    () => consumePilotPortalLaunch(base44, { id: 'base44-user-1' }, 'B'.repeat(43)),
    /PORTAL_ACCOUNT_ASSIGNMENT_REQUIRED/,
  );
});

test('ongoing access revalidates the live portal session and canonical name', async (t) => {
  const { base44, rows, account } = fixture();
  rows.identities.push({
    id: 'identity-1',
    base44_user_id: 'base44-user-1',
    external_subject: PILOT_EXTERNAL_SUBJECT,
    portal_session_id: 'portal-session-1',
    partner_profile_id: '42b93780-c13e-40c6-bac3-991c2bcfc938',
    account_id: PILOT_SOUND_PROOF_ACCOUNT_ID,
    account_name: 'Old Name',
    target: 'SOUND_PROOF',
  });

  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (_url, request) => {
    const body = JSON.parse(request.body);
    assert.deepEqual(body, {
      action: 'validate_session',
      portal_session_id: 'portal-session-1',
      target: 'SOUND_PROOF',
    });
    return new Response(JSON.stringify({
      ok: true,
      binding: bridgeBinding({ account_name: 'iCubed Home Cinema Ltd' }),
    }), { status: 200 });
  };

  const result = await validatePilotPortalAccessIfRequired(
    base44,
    { id: 'base44-user-1' },
    account,
  );
  assert.equal(result.allowed, true);
  assert.equal(account.name, 'iCubed Home Cinema Ltd');
  assert.equal(rows.links[0].external_account_name, 'iCubed Home Cinema Ltd');
  assert.equal(rows.identities[0].account_name, 'iCubed Home Cinema Ltd');
});

test('foreign, tampered or revoked portal sessions fail closed', async (t) => {
  const { base44, rows, account } = fixture();
  rows.identities.push({
    id: 'identity-1',
    base44_user_id: 'base44-user-1',
    external_subject: PILOT_EXTERNAL_SUBJECT,
    portal_session_id: 'portal-session-1',
    partner_profile_id: '42b93780-c13e-40c6-bac3-991c2bcfc938',
    account_id: PILOT_SOUND_PROOF_ACCOUNT_ID,
    account_name: 'iCubed Home Cinema',
    target: 'SOUND_PROOF',
  });

  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async () => new Response(JSON.stringify({
    ok: true,
    binding: bridgeBinding({ user_id: 'foreign-user' }),
  }), { status: 200 });
  const foreign = await validatePilotPortalAccessIfRequired(
    base44,
    { id: 'base44-user-1' },
    account,
  );
  assert.equal(foreign.allowed, false);

  globalThis.fetch = async () =>
    new Response(JSON.stringify({ ok: false, error: 'session revoked' }), { status: 401 });
  const revoked = await validatePilotPortalAccessIfRequired(
    base44,
    { id: 'base44-user-1' },
    account,
  );
  assert.equal(revoked.allowed, false);
  assert.equal(revoked.reason, 'PORTAL_SESSION_REJECTED');
});
