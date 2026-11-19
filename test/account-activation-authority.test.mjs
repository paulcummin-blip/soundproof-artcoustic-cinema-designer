import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getFirstActivatedAt,
  recordAccountActivation,
  ACTIVATION_AUDIT_ACTIONS,
} from '../base44/shared/accountActivationAuthority.js';

function mockAudit(rows) {
  return {
    entities: {
      AccountUserAudit: {
        async filter(q) {
          return rows.filter((r) =>
            (!q.account_id || r.account_id === q.account_id) &&
            (!q.action || !q.action.$in || q.action.$in.includes(r.action))
          );
        },
        async create(data) {
          return { id: 'au-new', ...data };
        },
      },
    },
  };
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

test('getFirstActivatedAt returns the earliest activation event timestamp', async () => {
  const service = mockAudit([
    { account_id: 'a1', action: 'SOUNDPROOF_RENEWED', occurred_at: '2026-03-01T00:00:00Z' },
    { account_id: 'a1', action: 'SOUNDPROOF_TERM_STARTED', occurred_at: '2026-01-01T00:00:00Z' },
    { account_id: 'a1', action: 'SOUNDPROOF_ENABLE', occurred_at: '2026-02-01T00:00:00Z' },
  ]);
  const d = await getFirstActivatedAt(service, 'a1');
  assert.equal(new Date(d).getTime(), new Date('2026-01-01T00:00:00Z').getTime());
});

test('renewal and restore do not change the first-activation date', async () => {
  const service = mockAudit([
    { account_id: 'a1', action: 'SOUNDPROOF_TERM_STARTED', occurred_at: '2026-01-01T00:00:00Z' },
    { account_id: 'a1', action: 'SOUNDPROOF_RENEWED', occurred_at: '2026-06-01T00:00:00Z' },
    { account_id: 'a1', action: 'SOUNDPROOF_RESTORE', occurred_at: '2026-07-01T00:00:00Z' },
    { account_id: 'a1', action: 'SOUNDPROOF_SUSPEND', occurred_at: '2026-04-01T00:00:00Z' },
  ]);
  const d = await getFirstActivatedAt(service, 'a1');
  assert.equal(new Date(d).getTime(), new Date('2026-01-01T00:00:00Z').getTime());
});

test('accounts with only non-activation events return null', async () => {
  const service = mockAudit([
    { account_id: 'a1', action: 'SOUNDPROOF_RENEWED', occurred_at: '2026-01-01T00:00:00Z' },
    { account_id: 'a1', action: 'USER_LOGIN_RECORDED', occurred_at: '2026-01-02T00:00:00Z' },
  ]);
  const d = await getFirstActivatedAt(service, 'a1');
  assert.equal(d, null);
});

test('an account with no audit rows returns null', async () => {
  const service = mockAudit([]);
  const d = await getFirstActivatedAt(service, 'a1');
  assert.equal(d, null);
});

test('no account id returns null', async () => {
  const service = mockAudit([]);
  const d = await getFirstActivatedAt(service, '');
  assert.equal(d, null);
});

test('a filter error returns null rather than throwing (read-only authority)', async () => {
  const service = {
    entities: {
      AccountUserAudit: {
        async filter() { throw new Error('db down'); },
      },
    },
  };
  const d = await getFirstActivatedAt(service, 'a1');
  assert.equal(d, null);
});

test('recordAccountActivation writes a canonical activation event', async () => {
  let created = null;
  const service = {
    entities: {
      AccountUserAudit: {
        async create(data) { created = data; return { id: 'au-1', ...data }; },
      },
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
  const service = {
    entities: { AccountUserAudit: { async create() {} } },
  };
  await assert.rejects(() =>
    recordAccountActivation(service, {
      accountId: 'a1',
      actorUserId: 'u1',
      actorEmail: 'u@x.com',
      action: 'SOUNDPROOF_RENEWED',
    })
  );
});