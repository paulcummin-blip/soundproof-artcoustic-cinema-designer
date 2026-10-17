import test from 'node:test';
import assert from 'node:assert/strict';
import { claimPilotPortalAdministratorSeat } from '../base44/shared/pilotSeatClaimAuthority.js';
import {
  PILOT_EXTERNAL_SUBJECT,
  PILOT_PARTNER_PROFILE_ID,
  PILOT_SOUND_PROOF_ACCOUNT_ID,
  PORTAL_SOURCE,
  PORTAL_TARGET,
} from '../base44/shared/pilotPortalConstants.js';

const USER_ID = 'verified-pilot-user';

function entity(rows, writes) {
  return {
    async filter(query) {
      return rows.filter(row => Object.entries(query).every(([key, value]) => row[key] === value))
        .map(row => ({ ...row }));
    },
    async update(id, patch) {
      writes.push({ type: 'update', id, patch });
      const row = rows.find(item => item.id === id);
      if (!row) throw new Error('missing fixture row');
      Object.assign(row, patch);
      return { ...row };
    },
    async create(data) {
      writes.push({ type: 'create', data });
      const row = { id: `audit-${rows.length + 1}`, ...data };
      rows.push(row);
      return { ...row };
    },
  };
}

function fixture(status = 'active', seatUserId = USER_ID) {
  const writes = [];
  const rows = {
    users: [{ id: USER_ID, email: 'pilot@example.com', is_verified: true,
      account_id: PILOT_SOUND_PROOF_ACCOUNT_ID, dealer_name: 'iCubed Home Cinema' }],
    accounts: [{ id: PILOT_SOUND_PROOF_ACCOUNT_ID, status: 'active' }],
    memberships: [{ id: 'pilot-seat', account_id: PILOT_SOUND_PROOF_ACCOUNT_ID,
      user_id: seatUserId, status, is_account_admin: true,
      membership_role: 'dealer_admin', access_level: 'FULL_ACCESS' }],
    identities: [],
    audits: [],
  };
  const service = { entities: {
    User: entity(rows.users, writes),
    Account: entity(rows.accounts, writes),
    AccountMembership: entity(rows.memberships, writes),
    PortalIdentity: entity(rows.identities, writes),
    AccountUserAudit: entity(rows.audits, writes),
  } };
  const base44User = { id: USER_ID, email: 'pilot@example.com' };
  const binding = { target: PORTAL_TARGET, user_id: PILOT_EXTERNAL_SUBJECT,
    profile_id: PILOT_PARTNER_PROFILE_ID, session_id: 'verified-session',
    account_name: 'iCubed Home Cinema', expires_at: '2035-01-01T00:00:00.000Z' };
  const link = { account_id: PILOT_SOUND_PROOF_ACCOUNT_ID, source_system: PORTAL_SOURCE,
    active: true, partner_user_id: PILOT_EXTERNAL_SUBJECT };
  return { service, base44User, binding, link, rows, writes };
}

test('verified repeat launch reuses the same active pilot seat with no duplicate writes', async () => {
  const f = fixture();
  const result = await claimPilotPortalAdministratorSeat(f);
  assert.equal(result.claimed, false);
  assert.equal(result.membership.id, 'pilot-seat');
  assert.deepEqual(f.writes, []);
  assert.equal(f.rows.memberships.length, 1);
});

test('pending first claim becomes active; subsequent launch is idempotent', async () => {
  const f = fixture('pending', null);
  const first = await claimPilotPortalAdministratorSeat(f);
  assert.equal(first.claimed, true);
  assert.equal(f.rows.memberships[0].user_id, USER_ID);
  assert.equal(f.rows.memberships[0].status, 'active');
  assert.equal(f.rows.audits.length, 1);
  const writeCount = f.writes.length;
  const second = await claimPilotPortalAdministratorSeat(f);
  assert.equal(second.claimed, false);
  assert.equal(f.writes.length, writeCount);
  assert.equal(f.rows.audits.length, 1);
});

test('foreign active pilot seat remains blocked without any writes', async () => {
  const f = fixture('active', 'different-user');
  await assert.rejects(() => claimPilotPortalAdministratorSeat(f),
    /PORTAL_MEMBERSHIP_ALREADY_CLAIMED/);
  assert.deepEqual(f.writes, []);
});

test('ambiguous administrator seats remain blocked without any writes', async () => {
  const f = fixture();
  f.rows.memberships.push({ ...f.rows.memberships[0], id: 'second-seat' });
  await assert.rejects(() => claimPilotPortalAdministratorSeat(f),
    /PORTAL_MEMBERSHIP_AMBIGUOUS/);
  assert.deepEqual(f.writes, []);
});

test('expired verified binding remains blocked before seat reuse', async () => {
  const f = fixture();
  f.binding.expires_at = '2020-01-01T00:00:00.000Z';
  await assert.rejects(() => claimPilotPortalAdministratorSeat(f),
    /PORTAL_BINDING_EXPIRED/);
  assert.deepEqual(f.writes, []);
});