import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acquireCreationLock, releaseCreationLock, STALE_LOCK_MS } from '../base44/shared/projectCreationLock.js';

// Mock service whose Account.updateMany emulates the platform's single-record
// conditional update (recheck conditions at write time; return `updated` count).
function makeMockService({ holder = null, heldAt = null } = {}) {
  const state = { holder, heldAt, calls: [] };
  const service = {
    entities: {
      Account: {
        async updateMany(query, update) {
          state.calls.push({ query, update });
          const q = query || {};
          // Stale reclaim: creation_lock_held_at { $lt: threshold }
          if (q.creation_lock_held_at && q.creation_lock_held_at.$lt) {
            if (state.holder !== null && state.heldAt &&
                new Date(state.heldAt).getTime() < new Date(q.creation_lock_held_at.$lt).getTime()) {
              state.holder = null;
              state.heldAt = null;
              return { updated: 1, success: true, has_more: false };
            }
            return { updated: 0, success: true, has_more: false };
          }
          // CAS acquire: creation_lock_holder === null
          if ('creation_lock_holder' in q && q.creation_lock_holder === null) {
            if (state.holder === null) {
              const set = update?.$set || {};
              state.holder = set.creation_lock_holder;
              state.heldAt = set.creation_lock_held_at;
              return { updated: 1, success: true, has_more: false };
            }
            return { updated: 0, success: true, has_more: false };
          }
          // Release: creation_lock_holder === token
          if ('creation_lock_holder' in q && q.creation_lock_holder !== null) {
            if (state.holder === q.creation_lock_holder) {
              state.holder = null;
              state.heldAt = null;
              return { updated: 1, success: true, has_more: false };
            }
            return { updated: 0, success: true, has_more: false };
          }
          return { updated: 0, success: true, has_more: false };
        },
      },
    },
  };
  return { service, state };
}

test('acquire returns acquired:true and stamps a unique holder token when free', async () => {
  const { service, state } = makeMockService({});
  const lock = await acquireCreationLock(service, 'acc-1');
  assert.equal(lock.acquired, true);
  assert.ok(typeof lock.token === 'string' && lock.token.length > 0);
  assert.equal(state.holder, lock.token);
  assert.equal(state.heldAt, lock.heldAt);
});

test('a second concurrent acquire (holder already set) returns LOCK_BUSY', async () => {
  const { service } = makeMockService({});
  const first = await acquireCreationLock(service, 'acc-1');
  const second = await acquireCreationLock(service, 'acc-1');
  assert.equal(first.acquired, true);
  assert.equal(second.acquired, false);
  assert.equal(second.reason, 'LOCK_BUSY');
  assert.equal(second.token, null);
});

test('release frees the lock so a new acquire succeeds', async () => {
  const { service, state } = makeMockService({});
  const lock = await acquireCreationLock(service, 'acc-1');
  await releaseCreationLock(service, 'acc-1', lock.token);
  assert.equal(state.holder, null);
  const again = await acquireCreationLock(service, 'acc-1');
  assert.equal(again.acquired, true);
  assert.notEqual(again.token, lock.token);
});

test('release with the wrong token does NOT free someone elses lock', async () => {
  const { service, state } = makeMockService({});
  const lock = await acquireCreationLock(service, 'acc-1');
  await releaseCreationLock(service, 'acc-1', 'not-the-token');
  assert.equal(state.holder, lock.token);
  const again = await acquireCreationLock(service, 'acc-1');
  assert.equal(again.acquired, false);
});

test('a stale lock (held > 30s ago) is reclaimed by a new acquire', async () => {
  const staleHeldAt = new Date(Date.now() - (STALE_LOCK_MS + 5000)).toISOString();
  const { service, state } = makeMockService({ holder: 'old-token', heldAt: staleHeldAt });
  const lock = await acquireCreationLock(service, 'acc-1');
  assert.equal(lock.acquired, true);
  assert.equal(state.holder, lock.token);
  assert.notEqual(state.holder, 'old-token');
});

test('a fresh lock is NOT reclaimed (held < 30s ago)', async () => {
  const freshHeldAt = new Date(Date.now() - 1000).toISOString();
  const { service } = makeMockService({ holder: 'fresh-token', heldAt: freshHeldAt });
  const lock = await acquireCreationLock(service, 'acc-1');
  assert.equal(lock.acquired, false);
  assert.equal(lock.reason, 'LOCK_BUSY');
});

test('no account id returns NO_ACCOUNT without touching the store', async () => {
  const noop = { entities: { Account: { async updateMany() { return { updated: 0 }; } } } };
  const lock = await acquireCreationLock(noop, '');
  assert.equal(lock.acquired, false);
  assert.equal(lock.reason, 'NO_ACCOUNT');
});

test('updateMany throwing surfaces a LOCK_ERROR rather than silently proceeding', async () => {
  const broken = { entities: { Account: { async updateMany() { throw new Error('boom'); } } } };
  const lock = await acquireCreationLock(broken, 'acc-1');
  assert.equal(lock.acquired, false);
  assert.equal(lock.reason, 'LOCK_ERROR');
});