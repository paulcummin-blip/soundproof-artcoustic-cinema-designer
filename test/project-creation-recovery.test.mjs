import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcilePendingReceipt } from '../base44/shared/projectCreationRecovery.js';

// Mock service with Project, CapacityLedger, PromotionUsage and ProjectCreationReceipt.
function makeService({ project = null, ledger = null, usage = null, ledgerCreateThrows = false, usageCreateThrows = false, capacity = 1 } = {}) {
  const state = { project, ledger, usage, ledgerCreateThrows, usageCreateThrows, capacity, receiptUpdates: [] };
  const service = {
    entities: {
      Project: {
        async filter(q) { return q?.id && state.project?.id === q.id ? [state.project] : []; },
        async update() { return state.project; },
      },
      CapacityLedger: {
        async filter(q) {
          if (q?.idempotency_key && state.ledger?.idempotency_key === q.idempotency_key) return [state.ledger];
          return [];
        },
        async create(data) {
          if (state.ledgerCreateThrows) throw new Error('ledger boom');
          state.ledger = { id: 'led-new', ...data };
          return state.ledger;
        },
      },
      PromotionUsage: {
        async filter(q) { return q?.project_id && state.usage?.project_id === q.project_id ? [state.usage] : []; },
        async create(data) {
          if (state.usageCreateThrows) throw new Error('usage boom');
          state.usage = { id: 'usg-new', ...data };
          return state.usage;
        },
      },
      ProjectCreationReceipt: {
        async update(id, patch) { state.receiptUpdates.push({ id, patch }); return { id, ...patch }; },
      },
    },
  };
  return { service, state };
}

function receipt(overrides = {}) {
  return {
    id: 'rec-1',
    account_id: 'acc-1',
    request_id: 'rq-1',
    status: 'PENDING',
    stage: 'PENDING',
    creation_path: 'capacity',
    project_id: null,
    promotion_id: null,
    ledger_entry_id: null,
    response_payload: null,
    ...overrides,
  };
}

// ── COMPLETED ───────────────────────────────────────────────────────────
test('a COMPLETED receipt replays its stored payload', async () => {
  const { service } = makeService();
  const r = receipt({ status: 'COMPLETED', response_payload: { status: 'SUCCESS', project: { id: 'p1' } } });
  const out = await reconcilePendingReceipt(service, r, {});
  assert.equal(out.outcome, 'replay');
  assert.deepEqual(out.responsePayload, { status: 'SUCCESS', project: { id: 'p1' } });
});

// ── Capacity path: PROJECT_CREATED + ledger exists → resumed ────────────
test('capacity: PROJECT_CREATED with the ledger already present resumes to completion', async () => {
  const project = { id: 'p1', name: 'Cinema' };
  const ledger = { id: 'l1', transaction_type: 'PROJECT_ACTIVATION', delta: -1, idempotency_key: 'activation:p1' };
  const { service } = makeService({ project, ledger, capacity: 0 });
  const r = receipt({ stage: 'PROJECT_CREATED', project_id: 'p1' });
  const out = await reconcilePendingReceipt(service, r, {});
  assert.equal(out.outcome, 'resumed_to_completion');
  assert.equal(out.responsePayload.status, 'SUCCESS');
  assert.equal(out.responsePayload.project.id, 'p1');
  assert.equal(out.responsePayload.ledger_entry.id, 'l1');
});

test('capacity: PROJECT_CREATED with no ledger creates it (idempotent) and resumes', async () => {
  const project = { id: 'p1', name: 'Cinema' };
  const { service, state } = makeService({ project, capacity: 0 });
  const r = receipt({ stage: 'PROJECT_CREATED', project_id: 'p1' });
  const out = await reconcilePendingReceipt(service, r, {});
  assert.equal(out.outcome, 'resumed_to_completion');
  assert.ok(state.ledger, 'ledger was created on recovery');
  assert.equal(state.ledger.idempotency_key, 'activation:p1');
  assert.equal(state.ledger.delta, -1);
});

test('capacity: ledger create throws on recovery → reconciling (no duplicate)', async () => {
  const project = { id: 'p1', name: 'Cinema' };
  const { service, state } = makeService({ project, ledgerCreateThrows: true });
  const r = receipt({ stage: 'PROJECT_CREATED', project_id: 'p1' });
  const out = await reconcilePendingReceipt(service, r, {});
  assert.equal(out.outcome, 'reconciling');
  assert.equal(out.reason, 'LEDGER_CREATE_FAILED');
  assert.equal(state.receiptUpdates[0]?.patch.stage, 'RECONCILING');
});

test('capacity: project missing and no ledger → restart (safe to create fresh)', async () => {
  const { service } = makeService({ project: null });
  const r = receipt({ stage: 'PROJECT_CREATED', project_id: 'p-missing' });
  const out = await reconcilePendingReceipt(service, r, {});
  assert.equal(out.outcome, 'restart');
  assert.equal(out.reason, 'PROJECT_MISSING_NO_LEDGER');
});

test('capacity: project missing but ledger exists → reconciling (charge may have happened)', async () => {
  const ledger = { id: 'l1', delta: -1, idempotency_key: 'activation:p-missing' };
  const { service } = makeService({ project: null, ledger });
  const r = receipt({ stage: 'PROJECT_CREATED', project_id: 'p-missing' });
  const out = await reconcilePendingReceipt(service, r, {});
  assert.equal(out.outcome, 'reconciling');
  assert.equal(out.reason, 'PROJECT_MISSING_LEDGER_EXISTS');
});

// ── Promotional path ────────────────────────────────────────────────────
test('promo: USAGE_CREATED with usage present resumes to completion', async () => {
  const project = { id: 'p1', name: 'Cinema' };
  const usage = { id: 'u1', project_id: 'p1' };
  const { service } = makeService({ project, usage });
  const r = receipt({ stage: 'USAGE_CREATED', creation_path: 'promotion', project_id: 'p1', promotion_id: 'promo-1' });
  const out = await reconcilePendingReceipt(service, r, {});
  assert.equal(out.outcome, 'resumed_to_completion');
  assert.equal(out.responsePayload.promotion.id, 'promo-1');
  assert.equal(out.responsePayload.ledger_entry, null);
});

test('promo: PROJECT_CREATED (promo path) with no usage creates it and resumes', async () => {
  const project = { id: 'p1', name: 'Cinema' };
  const { service, state } = makeService({ project });
  const r = receipt({ stage: 'PROJECT_CREATED', creation_path: 'promotion', project_id: 'p1', promotion_id: 'promo-1' });
  const out = await reconcilePendingReceipt(service, r, {});
  assert.equal(out.outcome, 'resumed_to_completion');
  assert.ok(state.usage, 'usage was created on recovery');
  assert.equal(state.usage.project_id, 'p1');
});

test('promo: usage create throws on recovery → reconciling (no duplicate)', async () => {
  const project = { id: 'p1', name: 'Cinema' };
  const { service, state } = makeService({ project, usageCreateThrows: true });
  const r = receipt({ stage: 'PROJECT_CREATED', creation_path: 'promotion', project_id: 'p1', promotion_id: 'promo-1' });
  const out = await reconcilePendingReceipt(service, r, {});
  assert.equal(out.outcome, 'reconciling');
  assert.equal(out.reason, 'USAGE_CREATE_FAILED');
  assert.equal(state.receiptUpdates[0]?.patch.stage, 'RECONCILING');
});

test('promo: project missing and no usage → restart', async () => {
  const { service } = makeService({ project: null });
  const r = receipt({ stage: 'PROJECT_CREATED', creation_path: 'promotion', project_id: 'p-missing', promotion_id: 'promo-1' });
  const out = await reconcilePendingReceipt(service, r, {});
  assert.equal(out.outcome, 'restart');
  assert.equal(out.reason, 'PROJECT_MISSING_NO_USAGE');
});

// ── PENDING with no project id (project.create may have committed) ──────
test('PENDING with no project_id → reconciling (project.create may have committed)', async () => {
  const { service, state } = makeService({});
  const r = receipt({ stage: 'PENDING', project_id: null });
  const out = await reconcilePendingReceipt(service, r, {});
  assert.equal(out.outcome, 'reconciling');
  assert.equal(out.reason, 'UNCERTAIN_PRE_PROJECT_CREATE');
  assert.equal(state.receiptUpdates[0]?.patch.stage, 'RECONCILING');
});

test('a null receipt restarts', async () => {
  const { service } = makeService();
  const out = await reconcilePendingReceipt(service, null, {});
  assert.equal(out.outcome, 'restart');
});