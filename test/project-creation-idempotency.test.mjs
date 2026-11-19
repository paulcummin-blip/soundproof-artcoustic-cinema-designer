import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findExistingReceipt,
  createPendingReceipt,
  completeReceipt,
  deleteReceipt,
  updateReceiptStage,
  markReceiptReconciling,
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

test('createPendingReceipt stores PENDING with stage PENDING and creation_path', async () => {
  const { service } = mockReceiptStore();
  await createPendingReceipt(service, 'acc-1', 'rq-1', '2026-01-01T00:00:00Z', 'promotion');
  const r = await findExistingReceipt(service, 'acc-1', 'rq-1');
  assert.equal(r.status, 'PENDING');
  assert.equal(r.stage, 'PENDING');
  assert.equal(r.creation_path, 'promotion');
  assert.equal(r.request_id, 'rq-1');
});

test('createPendingReceipt defaults creation_path to capacity', async () => {
  const { service } = mockReceiptStore();
  await createPendingReceipt(service, 'acc-1', 'rq-1', '2026-01-01T00:00:00Z');
  const r = await findExistingReceipt(service, 'acc-1', 'rq-1');
  assert.equal(r.creation_path, 'capacity');
});

test('completeReceipt marks COMPLETED with stage COMPLETED and stores the replayable payload', async () => {
  const { service } = mockReceiptStore();
  const pending = await createPendingReceipt(service, 'acc-1', 'rq-1', '2026-01-01T00:00:00Z', 'capacity');
  await completeReceipt(service, pending.id, {
    project_id: 'proj-1',
    promotion_id: null,
    ledger_entry_id: 'led-1',
    response_payload: { status: 'SUCCESS', project: { id: 'proj-1' } },
  }, '2026-01-01T00:00:01Z');
  const r = await findExistingReceipt(service, 'acc-1', 'rq-1');
  assert.equal(r.status, 'COMPLETED');
  assert.equal(r.stage, 'COMPLETED');
  assert.equal(r.project_id, 'proj-1');
  assert.equal(r.ledger_entry_id, 'led-1');
  assert.deepEqual(r.response_payload, { status: 'SUCCESS', project: { id: 'proj-1' } });
  assert.equal(r.completed_at, '2026-01-01T00:00:01Z');
});

test('updateReceiptStage persists stage and object ids for crash recovery', async () => {
  const { service } = mockReceiptStore();
  const pending = await createPendingReceipt(service, 'acc-1', 'rq-1', '2026-01-01T00:00:00Z', 'capacity');
  await updateReceiptStage(service, pending.id, { stage: 'PROJECT_CREATED', project_id: 'proj-9' });
  await updateReceiptStage(service, pending.id, { stage: 'LEDGER_CREATED', ledger_entry_id: 'led-9' });
  const r = await findExistingReceipt(service, 'acc-1', 'rq-1');
  assert.equal(r.stage, 'LEDGER_CREATED');
  assert.equal(r.project_id, 'proj-9');
  assert.equal(r.ledger_entry_id, 'led-9');
  assert.equal(r.status, 'PENDING');
});

test('markReceiptReconciling sets stage RECONCILING', async () => {
  const { service } = mockReceiptStore();
  const pending = await createPendingReceipt(service, 'acc-1', 'rq-1', '2026-01-01T00:00:00Z', 'capacity');
  await markReceiptReconciling(service, pending.id);
  const r = await findExistingReceipt(service, 'acc-1', 'rq-1');
  assert.equal(r.stage, 'RECONCILING');
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
  await assert.doesNotReject(() => deleteReceipt(service, 'nope'));
  await assert.rejects(() => completeReceipt(service, 'nope', { response_payload: {} }, '2026-01-01T00:00:00Z'));
});