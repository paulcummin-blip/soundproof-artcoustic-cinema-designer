import test from "node:test";
import assert from "node:assert/strict";
import {
  buildThresholdReconciliationPlan,
  turnoverRewardKey,
  validateEntitlementContract,
} from "../base44/shared/turnoverRewardReconciliationAuthority.js";

const DEALER_A = "b9d453e8-3386-4294-bd99-7ad2d80120b2";
const DEALER_B = "9b84388e-c17b-4760-9e8a-d81676c65ca8";
const ACCOUNT_A = "sound-proof-account-a";

function contract(dealers) {
  return {
    contract_version: 1,
    calendar_year: 2026,
    calculated_at: "2026-08-24T02:00:00.000Z",
    dealers,
  };
}

function dealer(id, thresholds) {
  return {
    dealer_account_id: id,
    earned_thresholds_gbp: thresholds,
    credits_per_threshold: 5,
  };
}

test("validates and deterministically sorts the minimal entitlement contract", () => {
  const result = validateEntitlementContract(contract([
    dealer(DEALER_A, [10000, 20000]),
    dealer(DEALER_B, []),
  ]), 2026);

  assert.deepEqual(result.dealers.map((row) => row.dealer_account_id), [DEALER_B, DEALER_A]);
  assert.deepEqual(Object.keys(result.dealers[0]).sort(), [
    "credits_per_threshold",
    "dealer_account_id",
    "earned_thresholds_gbp",
  ]);
});

test("rejects sensitive or unexpected dealer fields", () => {
  assert.throws(() => validateEntitlementContract(contract([
    { ...dealer(DEALER_A, [10000]), current_turnover_gbp: 19999 },
  ]), 2026), /unsupported fields/);
});

test("rejects duplicate stable dealer identifiers", () => {
  assert.throws(() => validateEntitlementContract(contract([
    dealer(DEALER_A, [10000]),
    dealer(DEALER_A, [10000]),
  ]), 2026), /duplicate dealer/);
});

test("rejects malformed, gapped, or wrong-year entitlement contracts", () => {
  assert.throws(() => validateEntitlementContract(contract([
    dealer(DEALER_A, [10000, 30000]),
  ]), 2026), /contiguous/);

  assert.throws(() => validateEntitlementContract({
    ...contract([dealer(DEALER_A, [])]),
    calendar_year: 2025,
  }, 2026), /year mismatch/);
});

test("first reconciliation awards every missing threshold once", () => {
  const actions = buildThresholdReconciliationPlan({
    accountId: ACCOUNT_A,
    calendarYear: 2026,
    earnedThresholds: [10000, 20000],
    ledgerEntries: [],
  });

  assert.deepEqual(actions.map((a) => [a.kind, a.threshold, a.delta]), [
    ["AWARD", 10000, 5],
    ["AWARD", 20000, 5],
  ]);
  assert.equal(actions[0].idempotency_key, turnoverRewardKey(ACCOUNT_A, 2026, 10000));
});

test("repeating the same reconciliation produces no duplicate rewards", () => {
  const key = turnoverRewardKey(ACCOUNT_A, 2026, 10000);
  const actions = buildThresholdReconciliationPlan({
    accountId: ACCOUNT_A,
    calendarYear: 2026,
    earnedThresholds: [10000],
    ledgerEntries: [{
      id: "reward-1",
      idempotency_key: key,
      transaction_type: "UK_TURNOVER_REWARD",
      delta: 5,
      created_date: "2026-01-01T00:00:00.000Z",
    }],
  });

  assert.deepEqual(actions, []);
});

test("falling entitlement creates an explicit reversal without touching project activations", () => {
  const key = turnoverRewardKey(ACCOUNT_A, 2026, 20000);
  const ledgerEntries = [
    {
      id: "reward-2",
      idempotency_key: key,
      transaction_type: "UK_TURNOVER_REWARD",
      delta: 5,
      created_date: "2026-02-01T00:00:00.000Z",
    },
    {
      id: "completed-project",
      idempotency_key: "activation:completed-project",
      transaction_type: "PROJECT_ACTIVATION",
      delta: -1,
      created_date: "2026-02-02T00:00:00.000Z",
    },
  ];

  const actions = buildThresholdReconciliationPlan({
    accountId: ACCOUNT_A,
    calendarYear: 2026,
    earnedThresholds: [],
    ledgerEntries,
  });

  assert.equal(actions.length, 1);
  assert.deepEqual(actions[0], {
    kind: "REVERSE",
    threshold: 20000,
    delta: -5,
    idempotency_key: `${key}:reversal:reward-2`,
    reversal_of: "reward-2",
    previous_event_id: "reward-2",
  });
  assert.equal(ledgerEntries[1].transaction_type, "PROJECT_ACTIVATION");
});

test("a threshold can be re-earned after reversal without duplicating the original key", () => {
  const key = turnoverRewardKey(ACCOUNT_A, 2026, 10000);
  const ledgerEntries = [
    {
      id: "reward-1",
      idempotency_key: key,
      transaction_type: "UK_TURNOVER_REWARD",
      delta: 5,
      created_date: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "reversal-1",
      idempotency_key: `${key}:reversal:reward-1`,
      transaction_type: "REVERSAL",
      delta: -5,
      reversal_of: "reward-1",
      created_date: "2026-02-01T00:00:00.000Z",
    },
  ];

  const actions = buildThresholdReconciliationPlan({
    accountId: ACCOUNT_A,
    calendarYear: 2026,
    earnedThresholds: [10000],
    ledgerEntries,
  });

  assert.equal(actions.length, 1);
  assert.equal(actions[0].kind, "REINSTATE");
  assert.equal(actions[0].delta, 5);
  assert.equal(actions[0].idempotency_key, `${key}:regrant:reversal-1`);
});

test("fails closed when a threshold ledger net is inconsistent", () => {
  const key = turnoverRewardKey(ACCOUNT_A, 2026, 10000);
  assert.throws(() => buildThresholdReconciliationPlan({
    accountId: ACCOUNT_A,
    calendarYear: 2026,
    earnedThresholds: [10000],
    ledgerEntries: [
      { id: "a", idempotency_key: key, delta: 5 },
      { id: "b", idempotency_key: `${key}:duplicate`, delta: 5 },
    ],
  }), /inconsistent ledger net/);
});
