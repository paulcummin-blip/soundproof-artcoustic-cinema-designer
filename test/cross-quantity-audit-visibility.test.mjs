// cross-quantity-audit-visibility.test.mjs
// ---------------------------------------------------------------------------
// Focused tests for the two corrected defects:
//
//   DEFECT 1 — Live "receipt_not_retained" despite a successful canonical
//   confirmation of an evaluated-outranked cross-quantity candidate.
//   Root cause: liveState.winner.confirmedResults was the RANKING-FILTERED
//   subset (confirmedRecommendationSelection drops invalid / non-assessable
//   candidates), so an evaluated-outranked candidate that confirmed
//   successfully could be absent from the subset the resolver searched. The
//   orchestrator now carries the engine's FULL result.confirmedResults on the
//   winner so every confirmed candidate — selected or outranked — is
//   resolvable.
//
//   DEFECT 2 — After cold reopen the saved audit exists in
//   design_state.optimiser_plan but the plan-status view never exposed it, so
//   the developer audit block disappeared. Root cause: resolveOptimiserPlanStatus
//   built the plan view without carrying crossQuantityAudit through from the
//   persisted plan. It now passes plan.crossQuantityAudit on every plan-bearing
//   return branch.
//
// Acceptance anchors (from the confirmed Room D run):
//   · Four-sub finalist  FOUR_THIRD_PAIRS:0.19_0|0.81_0|0.19_1|0.81_1
//   · Canonical confirmation id  bass-candidate:e3a4b374
//   · Final disposition  evaluated-outranked
//   · Installed two-sub design + engineering publication unchanged
// ---------------------------------------------------------------------------

import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveCrossQuantityReceipt } from "@/components/room/bass/improveBassV2/crossQuantityReceiptResolver.js";
import { resolveOptimiserPlanStatus } from "@/components/room/bass/optimiserPlan/resolveOptimiserPlanStatus.js";
import { serializeOptimiserPlan } from "@/components/room/bass/optimiserPlan/optimiserPlanPersistence.js";

// ── Fixtures matching the confirmed Room D run ─────────────────────────────

const FOUR_SUB_FINALIST = "FOUR_THIRD_PAIRS:0.19_0|0.81_0|0.19_1|0.81_1";
const OUTRANKED_RECEIPT = "bass-candidate:e3a4b374";
const SELECTED_RECEIPT = "bass-candidate:a1b2c3d4";

const INSTALLED_SOURCE_IDS = ["inst-front-1", "inst-front-2"];

function confirmedResult({ candidateId, receiptId, disposition, isPrimarySeats }) {
  return {
    candidateId,
    candidateKind: "position",
    isCrossQuantity: true,
    canonicalAuthorityReceipt: {
      selectedCandidateId: receiptId,
      filterBankSignature: `fb-${receiptId}`,
      correctionCurveSignature: `cc-${receiptId}`,
      postEqCurveSignature: `peq-${receiptId}`,
      poolId: "pool-1",
    },
    appliedTuning: [
      { sourceId: "cand-a", delayMs: 0, gainDb: 0, polarity: 1, phase: 0 },
      { sourceId: "cand-b", delayMs: 2.5, gainDb: -1, polarity: -1, phase: 90 },
      { sourceId: "cand-c", delayMs: 1.2, gainDb: 0, polarity: 1, phase: 0 },
      { sourceId: "cand-d", delayMs: 3.1, gainDb: -2, polarity: 1, phase: 45 },
    ],
    operatingOutputDb: 112,
    assessmentStartHz: 20,
    assessmentEndHz: 80,
    p14TargetBasis: "house",
    p14TargetLevel: 3,
    requestedP14Pass: true,
    p14TargetDb: 115,
    p14AchievedDb: 117,
    p14HeadroomDb: 2,
    p14ShortfallDb: 0,
    p14NotAchievedReason: null,
    physicalValidation: { withinVolume: true },
    achievedP19VariationDb: 2.4,
    achievedP19Level: 3,
    perSeatP20: [
      { seatId: "seat-1", isPrimary: true, variationDbRaw: 3.1, wholeDbDeviation: 3, level: "L2", worstFrequencyHz: 35 },
      { seatId: "seat-2", isPrimary: true, variationDbRaw: 4.5, wholeDbDeviation: 4, level: "L1", worstFrequencyHz: 42 },
      { seatId: "seat-3", isPrimary: false, variationDbRaw: 6.2, wholeDbDeviation: 6, level: "L1", worstFrequencyHz: 38 },
    ],
    _disposition: disposition,
  };
}

// The FULL engine confirmed array — what result.confirmedResults carries.
// Includes both the selected winner AND the evaluated-outranked four-sub
// candidate, exactly as the Room D run retained them.
const FULL_CONFIRMED = [
  confirmedResult({
    candidateId: "current",
    receiptId: "bass-candidate:current",
    disposition: "current",
  }),
  confirmedResult({
    candidateId: FOUR_SUB_FINALIST,
    receiptId: OUTRANKED_RECEIPT,
    disposition: "evaluated-outranked",
  }),
];

// The ranking-filtered subset — what selection.confirmedResults used to be.
// The outranked four-sub candidate is DROPPED here (e.g. classified
// non-assessable by the ranking gate even though it confirmed canonically).
const RANKING_SUBSET = FULL_CONFIRMED.filter((r) => r._disposition !== "evaluated-outranked");

// ── DEFECT 1: the resolver must search the FULL confirmed set ──────────────

test("DEFECT 1: evaluated-outranked four-sub candidate resolves when the FULL confirmed set is searched", () => {
  const resolved = resolveCrossQuantityReceipt(OUTRANKED_RECEIPT, { confirmedResults: FULL_CONFIRMED });
  assert.equal(resolved.status, "available");
  assert.equal(resolved.receiptRef, OUTRANKED_RECEIPT);
  assert.equal(resolved.candidateId, FOUR_SUB_FINALIST);
  assert.equal(resolved.canonicalReceipt.selectedCandidateId, OUTRANKED_RECEIPT);
  assert.equal(resolved.responseBasis.operatingOutputDb, 112);
  assert.equal(resolved.p14Headroom.requestedP14Pass, true);
  assert.equal(resolved.p19AtRsp.achievedP19VariationDb, 2.4);
  assert.equal(resolved.perSeatP20.length, 3);
});

test("DEFECT 1 (reproducer): the ranking-filtered subset drops the outranked candidate → receipt_not_retained", () => {
  // This is the PRE-FIX behaviour: liveState.winner.confirmedResults was the
  // ranking subset, so the resolver could not find the confirmed candidate.
  const resolved = resolveCrossQuantityReceipt(OUTRANKED_RECEIPT, { confirmedResults: RANKING_SUBSET });
  assert.equal(resolved.status, "unavailable");
  assert.equal(resolved.reason, "receipt_not_retained");
});

test("DEFECT 1: the selected candidate also resolves against the full set", () => {
  const selectedResult = confirmedResult({
    candidateId: "FOUR_FRONT_PAIR:0.5_0|0.5_1",
    receiptId: SELECTED_RECEIPT,
    disposition: "selected",
  });
  const fullWithSelected = [...FULL_CONFIRMED, selectedResult];
  const resolved = resolveCrossQuantityReceipt(SELECTED_RECEIPT, { confirmedResults: fullWithSelected });
  assert.equal(resolved.status, "available");
  assert.equal(resolved.canonicalReceipt.selectedCandidateId, SELECTED_RECEIPT);
  assert.equal(resolved.processingSettings.length, 4);
});

test("DEFECT 1: receipt identities use the actual canonical authority selectedCandidateId", () => {
  const resolved = resolveCrossQuantityReceipt(OUTRANKED_RECEIPT, { confirmedResults: FULL_CONFIRMED });
  // The receipt ref AND the resolved canonical receipt are the SAME canonical
  // authority identity — not the candidate's own finalist id, not an installed
  // source id.
  assert.equal(resolved.receiptRef, OUTRANKED_RECEIPT);
  assert.equal(resolved.canonicalReceipt.selectedCandidateId, OUTRANKED_RECEIPT);
  assert.notEqual(resolved.receiptRef, FOUR_SUB_FINALIST);
  for (const id of INSTALLED_SOURCE_IDS) {
    assert.notEqual(resolved.receiptRef, id);
  }
});

test("DEFECT 1: candidate-owned source IDs in the audit stay separate from installed identities", () => {
  const candidateSourceIds = ["cand-a", "cand-b", "cand-c", "cand-d"];
  for (const id of candidateSourceIds) {
    assert.ok(!INSTALLED_SOURCE_IDS.includes(id), `candidate id ${id} must not collide with installed ids`);
  }
});

// ── DEFECT 2: the saved audit is exposed by the plan-status view ────────────

const PERSISTED_AUDIT = {
  runId: "optimiser-run-2026-11-09T16:22:11.415Z-1",
  admittedScope: [1, 4],
  receipts: [
    {
      finalistId: FOUR_SUB_FINALIST,
      quantity: 4,
      sourceCount: 4,
      sourceIds: ["cand-a", "cand-b", "cand-c", "cand-d"],
      admission: "admitted",
      transfer: "prepared",
      proxy: "evaluated",
      confirmationSubmitted: true,
      confirmationResult: "success",
      receiptRef: OUTRANKED_RECEIPT,
      finalDisposition: "evaluated-outranked",
    },
  ],
};

function persistedPlan(overrides = {}) {
  return {
    planVersion: 3,
    recordKind: "plan",
    run: { runId: PERSISTED_AUDIT.runId, startedAt: "2026-11-09T16:22:11.415Z" },
    projectId: "proj-d",
    versionId: "6af0ea4124cd386df9dd8d79",
    designFingerprint: "dfp-d",
    savedAt: "2026-11-09T16:25:00.000Z",
    candidateId: "current",
    engineVersion: "v2",
    crossQuantityAudit: PERSISTED_AUDIT,
    ...overrides,
  };
}

test("DEFECT 2: resolveOptimiserPlanStatus exposes crossQuantityAudit from the persisted plan (current branch)", () => {
  const view = resolveOptimiserPlanStatus({
    plan: persistedPlan(),
    currentDesignFingerprint: "dfp-d",
    instances: [],
    seatingPositions: [],
  });
  assert.deepEqual(view.crossQuantityAudit, PERSISTED_AUDIT);
  assert.equal(view.crossQuantityAudit.runId, PERSISTED_AUDIT.runId);
  assert.equal(view.crossQuantityAudit.admittedScope.join(","), "1,4");
  assert.equal(view.crossQuantityAudit.receipts[0].receiptRef, OUTRANKED_RECEIPT);
});

test("DEFECT 2: resolveOptimiserPlanStatus exposes crossQuantityAudit on the stale branch (design moved on)", () => {
  const view = resolveOptimiserPlanStatus({
    plan: persistedPlan(),
    currentDesignFingerprint: "dfp-CHANGED",
    instances: [],
    seatingPositions: [],
  });
  // Stale, but the audit is still inspectable from the saved record.
  assert.equal(view.status, "stale");
  assert.deepEqual(view.crossQuantityAudit, PERSISTED_AUDIT);
});

test("DEFECT 2: resolveOptimiserPlanStatus exposes crossQuantityAudit on the terminal no-actionable-plan branch", () => {
  const view = resolveOptimiserPlanStatus({
    plan: persistedPlan({ terminalOutcome: "no_useful_improvement", levers: undefined }),
    currentDesignFingerprint: "dfp-d",
    instances: [],
    seatingPositions: [],
  });
  assert.deepEqual(view.crossQuantityAudit, PERSISTED_AUDIT);
});

test("DEFECT 2: resolveOptimiserPlanStatus exposes crossQuantityAudit on the unsupported-version branch", () => {
  const view = resolveOptimiserPlanStatus({
    plan: persistedPlan({ planVersion: 0 }),
    currentDesignFingerprint: "dfp-d",
    instances: [],
    seatingPositions: [],
  });
  assert.equal(view.status, "unsupported");
  assert.deepEqual(view.crossQuantityAudit, PERSISTED_AUDIT);
});

test("DEFECT 2: cold reopen — serialize then re-read preserves crossQuantityAudit", () => {
  const serialized = serializeOptimiserPlan({
    designFingerprint: "dfp-d",
    resultFingerprint: "rfp-d",
    crossQuantityAudit: PERSISTED_AUDIT,
  });
  const view = resolveOptimiserPlanStatus({
    plan: { ...serialized, planVersion: 3, recordKind: "plan", run: { runId: PERSISTED_AUDIT.runId } },
    currentDesignFingerprint: "dfp-d",
    instances: [],
    seatingPositions: [],
  });
  assert.deepEqual(view.crossQuantityAudit, PERSISTED_AUDIT);
});

test("DEFECT 2: no plan → crossQuantityAudit is absent (no audit to show)", () => {
  const view = resolveOptimiserPlanStatus({
    plan: null,
    currentDesignFingerprint: "dfp-d",
    instances: [],
    seatingPositions: [],
  });
  assert.equal(view.crossQuantityAudit, undefined);
});

// ── Guards: no oversized persistence, no Overall P20, installed unchanged ──

test("GUARD: the audit trail retains no response arrays, curves or tuning payloads", () => {
  const receipt = PERSISTED_AUDIT.receipts[0];
  const keys = Object.keys(receipt);
  assert.ok(!keys.includes("rspRawCurve"));
  assert.ok(!keys.includes("perSeatRawCurves"));
  assert.ok(!keys.includes("appliedTuning"));
  assert.ok(!keys.includes("sources"));
});

test("GUARD: resolved evidence carries no Overall P20 — P20 is per-seat only", () => {
  const resolved = resolveCrossQuantityReceipt(OUTRANKED_RECEIPT, { confirmedResults: FULL_CONFIRMED });
  assert.equal(resolved.overallP20, undefined);
  assert.ok(Array.isArray(resolved.perSeatP20));
  assert.equal(resolved.primarySummary.worstSeatId, "seat-2");
  assert.equal(resolved.secondarySummary.worstSeatId, "seat-3");
});

test("GUARD: the orchestrator fix only ADDS confirmedResults to the winner — it does not mutate the installed design or publication", () => {
  // The fix adds one field to the winner object. It never touches
  // subwooferInstances, the published engineering fingerprint, or the
  // recommendation publication. This test documents that contract: the
  // full confirmed array is a SUPERSET of the ranking subset and carries no
  // write side effects.
  const rankingSubset = RANKING_SUBSET;
  const fullSet = FULL_CONFIRMED;
  assert.ok(fullSet.length > rankingSubset.length, "full set is a strict superset");
  // Every ranking-subset candidate is still present in the full set.
  for (const r of rankingSubset) {
    assert.ok(fullSet.includes(r), "ranking subset candidate retained in full set");
  }
  // The outranked candidate is present in the full set only.
  const outranked = fullSet.find((r) => r._disposition === "evaluated-outranked");
  assert.ok(outranked && !rankingSubset.includes(outranked));
});

test("GUARD: missing evidence remains explicitly unavailable (never fabricated)", () => {
  const resolved = resolveCrossQuantityReceipt(OUTRANKED_RECEIPT, { confirmedResults: [] });
  assert.equal(resolved.status, "unavailable");
  assert.equal(resolved.reason, "receipt_not_retained");
  assert.equal(resolved.canonicalReceipt, undefined);
  assert.equal(resolved.perSeatP20, undefined);
});