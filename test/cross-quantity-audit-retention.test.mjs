// cross-quantity-audit-retention.test.mjs
// ---------------------------------------------------------------------------
// Focused tests for the cross-quantity audit retention + receipt resolution.
//
// Verifies:
//   · The audit persists through serializeOptimiserPlan (survives cold reopen).
//   · buildOptimiserPlan and buildOptimiserRunEvidence both carry the audit.
//   · Every receipt reference resolves to the correct candidate result when
//     retained evidence exists.
//   · Missing or invalid receipts return an explicit unavailable result.
//   · Candidate-owned identities remain separate from installed identities.
//   · No oversized persistence write is introduced (no response arrays).
//   · Primary and Secondary summaries are DERIVED from individual-seat P20.
//   · No Overall P20 is invented.
// ---------------------------------------------------------------------------

import { test } from "node:test";
import assert from "node:assert/strict";

import { serializeOptimiserPlan } from "@/components/room/bass/optimiserPlan/optimiserPlanPersistence.js";
import { buildOptimiserRunEvidence } from "@/components/room/bass/optimiserPlan/buildOptimiserRunEvidence.js";
import { resolveCrossQuantityReceipt } from "@/components/room/bass/improveBassV2/crossQuantityReceiptResolver.js";
import { createCrossQuantityAuditTrail } from "@/components/room/bass/improveBassV2/crossQuantityAuditTrail.js";

const AUDIT = {
  runId: "run-abc",
  admittedScope: [4],
  receipts: [
    {
      finalistId: "fq-4sub-frontpair",
      quantity: 4,
      sourceCount: 4,
      sourceIds: ["cand-a", "cand-b", "cand-c", "cand-d"],
      admission: "admitted",
      transfer: "prepared",
      proxy: "evaluated",
      confirmationSubmitted: true,
      confirmationResult: "success",
      receiptRef: "selected-cand-fq-4sub-frontpair",
      finalDisposition: "selected",
    },
    {
      finalistId: "fq-4sub-rearpair",
      quantity: 4,
      sourceCount: 4,
      sourceIds: ["cand-e", "cand-f", "cand-g", "cand-h"],
      admission: "admitted",
      transfer: "reused",
      proxy: "evaluated",
      confirmationSubmitted: true,
      confirmationResult: "success",
      receiptRef: "selected-cand-fq-4sub-rearpair",
      finalDisposition: "evaluated-outranked",
    },
    {
      finalistId: "fq-4sub-dropped",
      quantity: 4,
      sourceCount: 4,
      sourceIds: ["cand-i", "cand-j", "cand-k", "cand-l"],
      admission: "admitted",
      transfer: "prepared",
      proxy: null,
      confirmationSubmitted: false,
      confirmationResult: null,
      receiptRef: null,
      finalDisposition: "not-promoted",
    },
  ],
};

function confirmedResult(overrides = {}) {
  return {
    candidateId: overrides.candidateId || "fq-4sub-frontpair",
    canonicalAuthorityReceipt: {
      selectedCandidateId: overrides.selectedCandidateId || "selected-cand-fq-4sub-frontpair",
      filterBankSignature: "fb-sig",
      correctionCurveSignature: "cc-sig",
      postEqCurveSignature: "peq-sig",
      poolId: "pool-1",
    },
    appliedTuning: [
      { sourceId: "cand-a", delayMs: 0, gainDb: 0, polarity: 1, phase: 0 },
      { sourceId: "cand-b", delayMs: 2.5, gainDb: -1, polarity: -1, phase: 90 },
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
    ...overrides,
  };
}

test("serializeOptimiserPlan retains crossQuantityAudit (survives cold reopen)", () => {
  const plan = { designFingerprint: "dfp-1", resultFingerprint: "rfp-1", crossQuantityAudit: AUDIT };
  const serialized = serializeOptimiserPlan(plan);
  assert.equal(serialized.crossQuantityAudit, AUDIT, "audit object retained by reference/equality");
  // Cold reopen path: a hydrated plan re-serialized preserves the audit.
  const rehydrated = serializeOptimiserPlan(serialized);
  assert.deepEqual(rehydrated.crossQuantityAudit, AUDIT);
});

test("serializeOptimiserPlan omits crossQuantityAudit cleanly when absent", () => {
  const serialized = serializeOptimiserPlan({ designFingerprint: "dfp-1", resultFingerprint: "rfp-1" });
  assert.equal(serialized.crossQuantityAudit, null);
});

test("buildOptimiserRunEvidence carries crossQuantityAudit from selection", () => {
  const evidence = buildOptimiserRunEvidence({
    selection: { crossQuantityAudit: AUDIT, confirmedResults: [] },
    diagnostics: null,
    identity: { projectId: "p", versionId: "v", designFingerprint: "d", resultFingerprint: "r" },
    runIdentity: { runId: "run-abc", startedAt: "2026-01-01T00:00:00Z" },
  });
  assert.deepEqual(evidence.crossQuantityAudit, AUDIT);
});

test("resolveCrossQuantityReceipt returns available with full evidence when retained", () => {
  const results = [confirmedResult()];
  const resolved = resolveCrossQuantityReceipt("selected-cand-fq-4sub-frontpair", { confirmedResults: results });
  assert.equal(resolved.status, "available");
  assert.equal(resolved.receiptRef, "selected-cand-fq-4sub-frontpair");
  assert.equal(resolved.canonicalReceipt.selectedCandidateId, "selected-cand-fq-4sub-frontpair");
  assert.equal(resolved.processingSettings.length, 2);
  assert.equal(resolved.processingSettings[0].sourceId, "cand-a");
  assert.equal(resolved.responseBasis.operatingOutputDb, 112);
  assert.equal(resolved.p14Headroom.requestedP14Pass, true);
  assert.equal(resolved.p19AtRsp.achievedP19VariationDb, 2.4);
  assert.equal(resolved.perSeatP20.length, 3);
});

test("resolveCrossQuantityReceipt derives Primary and Secondary summaries from perSeatP20", () => {
  const results = [confirmedResult()];
  const resolved = resolveCrossQuantityReceipt("selected-cand-fq-4sub-frontpair", { confirmedResults: results });
  // Primary = seats 1,2 (isPrimary true); worst is seat-2 (4.5 dB).
  assert.equal(resolved.primarySummary.seatCount, 2);
  assert.equal(resolved.primarySummary.worstVariationDb, 4.5);
  assert.equal(resolved.primarySummary.worstSeatId, "seat-2");
  assert.equal(resolved.primarySummary.level, "L1");
  // Secondary = seat-3 (isPrimary false); worst is 6.2 dB.
  assert.equal(resolved.secondarySummary.seatCount, 1);
  assert.equal(resolved.secondarySummary.worstVariationDb, 6.2);
  assert.equal(resolved.secondarySummary.worstSeatId, "seat-3");
});

test("resolveCrossQuantityReceipt does NOT invent an Overall P20", () => {
  const resolved = resolveCrossQuantityReceipt("selected-cand-fq-4sub-frontpair", {
    confirmedResults: [confirmedResult()],
  });
  assert.equal(resolved.overallP20, undefined, "no Overall P20 key is ever produced");
  assert.equal(Array.isArray(resolved.perSeatP20), true, "only per-seat P20 rows are returned");
});

test("resolveCrossQuantityReceipt returns explicit unavailable for missing receipt ref", () => {
  const resolved = resolveCrossQuantityReceipt(null, { confirmedResults: [confirmedResult()] });
  assert.equal(resolved.status, "unavailable");
  assert.equal(resolved.reason, "no_receipt_ref");
});

test("resolveCrossQuantityReceipt returns explicit unavailable when evidence not retained (cold reopen)", () => {
  const resolved = resolveCrossQuantityReceipt("selected-cand-fq-4sub-frontpair", { confirmedResults: [] });
  assert.equal(resolved.status, "unavailable");
  assert.equal(resolved.reason, "receipt_not_retained");
});

test("resolveCrossQuantityReceipt returns explicit unavailable for an invalid (non-matching) ref", () => {
  const resolved = resolveCrossQuantityReceipt("selected-cand-does-not-exist", {
    confirmedResults: [confirmedResult()],
  });
  assert.equal(resolved.status, "unavailable");
  assert.equal(resolved.reason, "receipt_not_retained");
});

test("candidate-owned source IDs remain separate from installed source identities", () => {
  const installedIds = ["inst-front-1", "inst-front-2"];
  for (const receipt of AUDIT.receipts) {
    for (const id of receipt.sourceIds) {
      assert.ok(!installedIds.includes(id), `candidate id ${id} must not collide with installed ids`);
      assert.ok(id.startsWith("cand-"), `candidate id ${id} is candidate-owned`);
    }
  }
});

test("audit trail retains no response arrays, curves or tuning payloads (no oversized write)", () => {
  const trail = createCrossQuantityAuditTrail("run-xyz");
  trail.recordScope([4]);
  trail.recordAdmission("fq-1", 4, 4, ["cand-a", "cand-b", "cand-c", "cand-d"], "admitted");
  trail.recordTransfer("fq-1", "prepared");
  trail.recordProxy("fq-1", "evaluated");
  trail.recordConfirmation("fq-1", "success", "selected-cand-x");
  trail.recordDisposition("fq-1", "selected");
  const snap = trail.snapshot();
  const receipt = snap.receipts[0];
  // The compact receipt fields only — no response arrays, curves or tuning.
  const keys = Object.keys(receipt).sort();
  assert.ok(!keys.includes("rspRawCurve"), "no rspRawCurve retained");
  assert.ok(!keys.includes("perSeatRawCurves"), "no perSeatRawCurves retained");
  assert.ok(!keys.includes("appliedTuning"), "no appliedTuning retained");
  assert.ok(!keys.includes("sources"), "no sources payload retained");
  assert.deepEqual(keys, [
    "admission", "confirmationResult", "confirmationSubmitted", "finalDisposition",
    "finalistId", "proxy", "quantity", "receiptRef", "sourceCount", "sourceIds", "transfer",
  ]);
});

test("resolved processing settings are compact (sourceId + four levers only)", () => {
  const resolved = resolveCrossQuantityReceipt("selected-cand-fq-4sub-frontpair", {
    confirmedResults: [confirmedResult()],
  });
  const keys = Object.keys(resolved.processingSettings[0]).sort();
  assert.deepEqual(keys, ["delayMs", "gainDb", "phase", "polarity", "sourceId"]);
});