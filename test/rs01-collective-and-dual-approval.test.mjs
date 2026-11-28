import { describe, it, expect } from "vitest";
import {
  isRsDualApprovalSatisfied,
  rsApprovalState,
  isOrdinaryRicherSoundsStore,
  isRicherSoundsCentralAdministrator,
  normaliseRsApprovalStatus,
  RS_APPROVAL_STATES,
} from "../base44/shared/rsApprovalAuthority.js";
import {
  buildThresholdReconciliationPlan,
  TURNOVER_REWARD_RULE,
} from "../base44/shared/turnoverRewardReconciliationAuthority.js";

const MASTER_ID = "master-93-id";
const ORDINARY_ID = "branch-24-id";

function rsAccount(overrides = {}) {
  return {
    id: ORDINARY_ID,
    dealer_group: "RICHER_SOUNDS",
    soundproof_eligible: true,
    rs_approval_status: RS_APPROVAL_STATES.AWAITING,
    ...overrides,
  };
}

describe("RS-01 dual approval gate", () => {
  it("passes for a non-RS dealer group regardless of rs_approval_status", () => {
    const premium = { id: "p1", dealer_group: "PREMIUM_PARTNER", soundproof_eligible: true, rs_approval_status: null };
    expect(isRsDualApprovalSatisfied(premium, MASTER_ID)).toBe(true);
    expect(rsApprovalState(premium, MASTER_ID)).toBeNull();
  });

  it("exempts Custom Install - 93 from the RS approval dimension", () => {
    const master = { id: MASTER_ID, dealer_group: "RICHER_SOUNDS", soundproof_eligible: true, rs_approval_status: null };
    expect(isRicherSoundsCentralAdministrator(MASTER_ID, MASTER_ID)).toBe(true);
    expect(isOrdinaryRicherSoundsStore(master, MASTER_ID)).toBe(false);
    expect(isRsDualApprovalSatisfied(master, MASTER_ID)).toBe(true);
    expect(rsApprovalState(master, MASTER_ID)).toBeNull();
  });

  it("requires BOTH eligibility and RS approval for an ordinary RS store", () => {
    expect(isRsDualApprovalSatisfied(rsAccount({ rs_approval_status: RS_APPROVAL_STATES.APPROVED }), MASTER_ID)).toBe(true);
    expect(isRsDualApprovalSatisfied(rsAccount({ rs_approval_status: RS_APPROVAL_STATES.AWAITING }), MASTER_ID)).toBe(false);
    expect(isRsDualApprovalSatisfied(rsAccount({ rs_approval_status: RS_APPROVAL_STATES.SUSPENDED }), MASTER_ID)).toBe(false);
    // Missing rs_approval_status reads as awaiting (honest default, never promoted)
    expect(isRsDualApprovalSatisfied(rsAccount({ rs_approval_status: null }), MASTER_ID)).toBe(false);
    // Eligibility missing fails even when RS approved
    expect(isRsDualApprovalSatisfied(rsAccount({ soundproof_eligible: false, rs_approval_status: RS_APPROVAL_STATES.APPROVED }), MASTER_ID)).toBe(false);
  });

  it("normalises a missing value to awaiting, never to approved", () => {
    expect(normaliseRsApprovalStatus(undefined)).toBe(RS_APPROVAL_STATES.AWAITING);
    expect(normaliseRsApprovalStatus(null)).toBe(RS_APPROVAL_STATES.AWAITING);
    expect(normaliseRsApprovalStatus("")).toBe(RS_APPROVAL_STATES.AWAITING);
    expect(normaliseRsApprovalStatus("approved")).toBe(RS_APPROVAL_STATES.APPROVED);
    expect(normaliseRsApprovalStatus("SUSPENDED")).toBe(RS_APPROVAL_STATES.SUSPENDED);
  });

  it("derives the three RS approval display states for an ordinary store", () => {
    expect(rsApprovalState(rsAccount({ rs_approval_status: RS_APPROVAL_STATES.APPROVED }), MASTER_ID)).toEqual({ label: "RS Approved", tone: "ok", status: "approved" });
    expect(rsApprovalState(rsAccount({ rs_approval_status: RS_APPROVAL_STATES.AWAITING }), MASTER_ID).tone).toBe("warn");
    expect(rsApprovalState(rsAccount({ rs_approval_status: RS_APPROVAL_STATES.SUSPENDED }), MASTER_ID).tone).toBe("danger");
  });
});

describe("RS-01 collective turnover reward", () => {
  const step = TURNOVER_REWARD_RULE.thresholdStepGbp;
  const credits = TURNOVER_REWARD_RULE.creditsPerThreshold;

  it("applies the £10,000 / 5-token rule", () => {
    expect(step).toBe(10000);
    expect(credits).toBe(5);
  });

  it("maps a collective sum to contiguous £10k milestones (the 93 award plan)", () => {
    // 53 stores summing £25,000 of qualifying turnover -> 2 milestones (£10k, £20k)
    const collectiveSum = 25000;
    const earnedThresholds = [];
    for (let t = step; t <= Math.floor(collectiveSum / step) * step; t += step) earnedThresholds.push(t);
    expect(earnedThresholds).toEqual([10000, 20000]);

    const plan = buildThresholdReconciliationPlan({
      accountId: MASTER_ID,
      calendarYear: 2026,
      earnedThresholds,
      ledgerEntries: [],
    });
    // Empty ledger -> both earned thresholds are AWARD (+5 each), no reversals.
    expect(plan).toHaveLength(2);
    expect(plan.every((a) => a.kind === "AWARD" && a.delta === credits)).toBe(true);
    expect(plan.map((a) => a.threshold)).toEqual([10000, 20000]);
  });

  it("is idempotent: a second reconciliation against the just-awarded ledger awards nothing", () => {
    const earnedThresholds = [10000, 20000];
    // Simulate the ledger the first plan would have produced.
    const awarded = [
      { id: "e1", account_id: MASTER_ID, transaction_type: "UK_TURNOVER_REWARD", delta: credits, idempotency_key: `uk_turnover:${MASTER_ID}:2026:10000`, created_date: "2026-01-01T00:00:00Z" },
      { id: "e2", account_id: MASTER_ID, transaction_type: "UK_TURNOVER_REWARD", delta: credits, idempotency_key: `uk_turnover:${MASTER_ID}:2026:20000`, created_date: "2026-01-01T00:00:01Z" },
    ];
    const plan = buildThresholdReconciliationPlan({
      accountId: MASTER_ID,
      calendarYear: 2026,
      earnedThresholds,
      ledgerEntries: awarded,
    });
    expect(plan).toHaveLength(0);
  });

  it("reverses a milestone when the collective sum drops below it", () => {
    // Previously awarded £10k + £20k; collective sum now £15,000 -> only £10k earned.
    const awarded = [
      { id: "e1", account_id: MASTER_ID, transaction_type: "UK_TURNOVER_REWARD", delta: credits, idempotency_key: `uk_turnover:${MASTER_ID}:2026:10000`, created_date: "2026-01-01T00:00:00Z" },
      { id: "e2", account_id: MASTER_ID, transaction_type: "UK_TURNOVER_REWARD", delta: credits, idempotency_key: `uk_turnover:${MASTER_ID}:2026:20000`, created_date: "2026-01-01T00:00:01Z" },
    ];
    const plan = buildThresholdReconciliationPlan({
      accountId: MASTER_ID,
      calendarYear: 2026,
      earnedThresholds: [10000], // £20k no longer earned collectively
      ledgerEntries: awarded,
    });
    expect(plan).toHaveLength(1);
    expect(plan[0].kind).toBe("REVERSE");
    expect(plan[0].threshold).toBe(20000);
    expect(plan[0].delta).toBe(-credits);
    expect(plan[0].reversal_of).toBe("e2");
  });
});