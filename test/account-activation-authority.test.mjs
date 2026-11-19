import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getFirstActivatedAt,
  setFirstActivatedAtIfUnset,
  recordAccountActivation,
  ACTIVATION_AUDIT_ACTIONS,
} from '../base44/shared/accountActivationAuthority.js';

// Mock Account store emulating the platform's conditional updateMany.
function mockAccountStore({ first_activated_at = null } = {}) {
  const state = { first_activated_at, calls: [] };
  const service = {
    entities: {
      Account: {
        async filter(q) {
          if (q?.id && q.id !== 'a1') return [];
          return [{ id: 'a1', first_activated_at: state.first_activated_at }];
        },
        async updateMany(query, update) {
          state.calls.push({ query, update });
          const q = query || {};
          const matchesNull = ('first_activated_at' in q) && q.first_activated_at === null && state.first_activated_at == null;
          const matchesExists = q.first_activated_at && q.first_activated_at.$exists === false && state.first_activated_at == null;
          if (matchesNull || matchesExists) {
            state.first_activated_at = update?.$set?.first_activated_at || state.first_activated_at;
            return { updated: 1, success: true, has_more: false };
          }
          return { updated: 0, success: true, has_more: false };
        },
      },
      AccountUserAudit: {
        async filter() { return []; },
        async create(data) { return { id: 'au-new', ...data }; },
      },
    },
  };
  return { service, state };
}

test('ACTIVATION_AUDIT_ACTIONS lists the three canonical activation events', () => {
  assert.ok(ACTIVATION_AUDIT_ACTIONS.includes('SOUNDPROOF_TERM_STARTED'));
  assert.ok(ACTIVATION_AUDIT_ACTIONS.includes('SOUNDPROOF_ENABLE'));
  assert.ok(ACTIVATION_AUDIT_ACTIONS.includes('PORTAL_IDENTITY_CLAIMED'));
  // Renewal, suspend and restore must NOT be activation events.
  assert.ok(!ACTIVATION_AUDIT_ACTIONS.includes('SOUNDPROOF_RENEWED'));
  assert.ok(!ACTIVATION_AUDIT_ACTIONS.includes('SOUNDPROOF_SUSPEND'));
  assert.ok(!ACTIVATION_AUDIT_ACTIONS.includes('SOUNDPROOF_RESTORE'));
});

test('getFirstActivatedAt returns the field value when set', async () => {
  const { service } = mockAccountStore({ first_activated_at: '2026-01-01T00:00:00.000Z' });
  const d = await getFirstActivatedAt(service, 'a1');
  assert.equal(d, '2026-01-01T00:00:00.000Z');
});

test('getFirstActivatedAt returns null when the field is null — existing accounts stay unknown (no audit inference)', async () => {
  const { service } = mockAccountStore({ first_activated_at: null });
  const d = await getFirstActivatedAt(service, 'a1');
  assert.equal(d, null);
});

test('getFirstActivatedAt returns null on a filter error (read-only authority)', async () => {
  const service = { entities: { Account: { async filter() { throw new Error('db down'); } } } };
  const d = await getFirstActivatedAt(service, 'a1');
  assert.equal(d, null);
});

test('no account id returns null', async () => {
  const { service } = mockAccountStore();
  const d = await getFirstActivatedAt(service, '');
  assert.equal(d, null);
});

test('setFirstActivatedAtIfUnset sets the field when null and returns the timestamp', async () => {
  const { service, state } = mockAccountStore({ first_activated_at: null });
  const ts = '2026-01-01T00:00:00.000Z';
  const out = await setFirstActivatedAtIfUnset(service, 'a1', ts);
  assert.equal(out, ts);
  assert.equal(state.first_activated_at, ts);
});

test('setFirstActivatedAtIfUnset is write-once: a later call does not overwrite (renew/restore safe)', async () => {
  const first = '2026-01-01T00:00:00.000Z';
  const { service, state } = mockAccountStore({ first_activated_at: first });
  // Simulate a renewal/restore trying to set a different date: the field is
  // already set, so the conditional update matches nothing and returns null.
  const out = await setFirstActivatedAtIfUnset(service, 'a1', '2026-06-01T00:00:00.000Z');
  assert.equal(out, null);
  assert.equal(state.first_activated_at, first);
});

test('recordAccountActivation writes a canonical activation event', async () => {
  let created = null;
  const service = {
    entities: {
      AccountUserAudit: { async create(data) { created = data; return { id: 'au-1', ...data }; } },
    },
  };
  await recordAccountActivation(service, {
    accountId: 'a1',
    actorUserId: 'u1',
    actorEmail: 'admin@x.com',
    action: 'SOUNDPROOF_ENABLE',
    occurredAt: '2026-01-01T00:00:00Z',
    targetEmail: 'dealer@x.com',
    details: { source: 'admin-enable' },
  });
  assert.equal(created.action, 'SOUNDPROOF_ENABLE');
  assert.equal(created.account_id, 'a1');
  assert.equal(created.target_email, 'dealer@x.com');
  assert.equal(created.occurred_at, '2026-01-01T00:00:00Z');
  assert.deepEqual(created.details, { source: 'admin-enable' });
});

test('recordAccountActivation rejects a non-activation action', async () => {
  const service = { entities: { AccountUserAudit: { async create() {} } } };
  await assert.rejects(() =>
    recordAccountActivation(service, {
      accountId: 'a1', actorUserId: 'u1', actorEmail: 'u@x.com', action: 'SOUNDPROOF_RENEWED',
    })
  );
});