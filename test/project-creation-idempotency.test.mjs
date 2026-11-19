import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findExistingReceipt,
  createPendingReceipt,
  completeReceipt,
  deleteReceipt,
} from '../base44/shared/projectCreationIdempotency.js';

function mockReceiptStore() {
  const store = new Map();
  let idc = 1;
  const service = {
    entities: {
      ProjectCreationReceipt: {
        async filter(q) {
          const out = [];
          for (const v of store.values()) {
            if (v.account_id === q.account_id && v.request_id === q.request_id) out.push(v);
          }
          return out;
        },
        async create(data) {
          const id = `r${idc++}`;
          const rec = { id, ...data };
          store.set(id, rec);
          return rec;
        },
        async update(id, patch) {
          const rec = store.get(id);
          if (!rec) throw new Error('not found');
          Object.assign(rec, patch);
          return rec;
        },
        async delete(id) {
          store.delete(id);
        },
      },
    },
  };
  return { service, store };
}

test('findExistingReceipt returns null when none exists', async () => {
  const { service } = mockReceiptStore();
  const r = await findExistingReceipt(service, 'acc-1', 'rq-1');
  assert.equal(r, null);
});

test('createPendingReceipt then find returns a PENDING receipt', async () => {
  const { service } = mockReceiptStore();
  await createPendingReceipt(service, 'acc-1', 'rq-1', '2026-01-01T00:00:00Z');
  const r = await findExistingReceipt(service, 'acc-1', 'rq-1');
  assert.equal(r.status, 'PENDING');
  assert.equal(r.request_id, 'rq-1');
});

test('completeReceipt marks COMPLETED and stores the replayable payload', async () => {
  const { service } = mockReceiptStore();
  const pending = await createPendingReceipt(service, 'acc-1', 'rq-1', '2026-01-01T00:00:00Z');
  await completeReceipt(service, pending.id, {
    project_id: 'proj-1',
    promotion_id: null,
    ledger_entry_id: 'led-1',
    response_payload: { status: 'SUCCESS', project: { id: 'proj-1' } },
  }, '2026-01-01T00:00:01Z');
  const r = await findExistingReceipt(service, 'acc-1', 'rq-1');
  assert.equal(r.status, 'COMPLETED');
  assert.equal(r.project_id, 'proj-1');
  assert.equal(r.ledger_entry_id, 'led-1');
  assert.deepEqual(r.response_payload, { status: 'SUCCESS', project: { id: 'proj-1' } });
  assert.equal(r.completed_at, '2026-01-01T00:00:01Z');
});

test('a COMPLETED receipt is distinct per (account, request_id)', async () => {
  const { service } = mockReceiptStore();
  const p = await createPendingReceipt(service, 'acc-1', 'rq-1', '2026-01-01T00:00:00Z');
  await completeReceipt(service, p.id, { response_payload: { status: 'SUCCESS' } }, '2026-01-01T00:00:01Z');
  const other = await findExistingReceipt(service, 'acc-1', 'rq-2');
  assert.equal(other, null);
  const sameAccountOtherRequest = await findExistingReceipt(service, 'acc-2', 'rq-1');
  assert.equal(sameAccountOtherRequest, null);
});

test('deleteReceipt removes it so find returns null (retry can proceed fresh)', async () => {
  const { service } = mockReceiptStore();
  const p = await createPendingReceipt(service, 'acc-1', 'rq-1', '2026-01-01T00:00:00Z');
  await deleteReceipt(service, p.id);
  const r = await findExistingReceipt(service, 'acc-1', 'rq-1');
  assert.equal(r, null);
});

test('deleteReceipt is a no-op on a missing id (never throws); completeReceipt throws on a missing id and call sites guard it', async () => {
  const { service } = mockReceiptStore();
  // deleteReceipt swallows errors internally, so a missing id is safe.
  await assert.doesNotReject(() => deleteReceipt(service, 'nope'));
  // completeReceipt surfaces a missing-record error; the createProfessionalProject
  // call sites only invoke it after a successful findExistingReceipt and wrap
  // it in try/catch, so the throw is acceptable and never reaches the dealer.
  await assert.rejects(() => completeReceipt(service, 'nope', { response_payload: {} }, '2026-01-01T00:00:00Z'));
});