// test/graph-p19-value-parity.test.mjs
//
// Regression test for the P0 graph/P19 numerical parity gate.
//
// After the fix, the finalOptimisedBassResponse carries the aligned RSP and
// seat curves from the canonical authority. The P19/P20 value parity check in
// buildCanonicalCompletedBassMetricAuthority recomputes P19/P20 from those
// exact final curves and rejects publication when the recomputed values do not
// match the published values.
//
// Run: node --import ./test/_alias-register.mjs test/graph-p19-value-parity.test.mjs

import test from "node:test";
import assert from "node:assert/strict";

import { computeCorrectableP19Diagnostic, computeOfficialP20Assessment } from "@/components/utils/bassAuthoritativeAssessment";
import { buildFinalOptimisedBassResponse, applyAuthorityToCanonicalResult } from "@/components/room/bass/finalOptimisedBassResponse";

// ── Helpers ──────────────────────────────────────────────────────────────

function makeCurve(splFn, n = 360) {
  const curve = [];
  const minF = 15, maxF = 200;
  for (let i = 0; i < n; i++) {
    const f = minF * Math.pow(maxF / minF, i / (n - 1));
    curve.push({ frequency: f, spl: splFn(f) });
  }
  return curve;
}

// Build a minimal candidate that buildFinalOptimisedBassResponse can consume.
function makeCandidate({ finalPostEq, perSeatPostEq = [], maximumAfterEq, target, p19Db, p20Db }) {
  return {
    candidateId: "bass-candidate:test",
    designEqFitProfile: "deterministic",
    finalPostEqCurve: finalPostEq,
    perSeatPostEqCurves: perSeatPostEq,
    maximumSplCurveAfterEq: maximumAfterEq,
    maximumSplCurveBeforeEq: maximumAfterEq,
    rawResponseCurve: finalPostEq,
    combinedEqCurve: [],
    correctionCurve: [],
    rawCorrectionCurve: [],
    generatedFilterBank: [],
    productionHouseCurveTarget: target,
    canonicalHouseCurveShape: target,
    practicalCalibrationTarget: target,
    canonicalVerticalOffsetDb: 100,
    operatingLevelOffsetDb: 0,
    realisticGlobalTrimDb: 0,
    selectedOperatingOutputDb: 112,
    achievedP14Db: 115,
    achievedP14Level: 2,
    achievedP18FrequencyHz: 30,
    achievedP18Level: 1,
    achievedP19VariationDb: p19Db,
    achievedP19Level: p19Db <= 2 ? 4 : p19Db <= 3 ? 3 : p19Db <= 4 ? 2 : p19Db <= 5 ? 1 : 0,
    officialP19WorstFrequencyHz: 50,
    achievedP20VariationDb: p20Db,
    achievedP20Level: p20Db <= 2 ? 4 : p20Db <= 3 ? 3 : p20Db <= 4 ? 2 : 1,
    worstP20SeatId: "seat-1",
    perSeatP20Results: [{ seatId: "seat-1", variationDbRaw: p20Db, level: p20Db <= 2 ? 4 : p20Db <= 3 ? 3 : p20Db <= 4 ? 2 : 1, worstFrequencyHz: 50 }],
    protectedNullRegions: [],
    capabilityLimitedRegions: [],
    assessmentStartHz: 30,
    assessmentEndHz: 120,
    correctionStartHz: 20,
    correctionEndHz: 200,
    postEqCurveSignature: "sig",
    filterBankSignature: "(none)",
    correctionCurveSignature: "curve:empty",
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────

test("applyAuthorityToCanonicalResult carries aligned curves into the graph response", () => {
  // The candidate has an unaligned finalPostEq at 95 dB. The authority aligns
  // it to 97 dB (+2 dB trim). The graph must show the aligned curve.
  const target = makeCurve(() => 100);
  const unaligned = makeCurve(() => 95);
  const aligned = makeCurve(() => 97);
  const maximumAfterEq = makeCurve(() => 120);
  const candidate = makeCandidate({
    finalPostEq: unaligned, maximumAfterEq, target, p19Db: 5, p20Db: 3,
  });
  const optimisationResult = { selectedCandidate: candidate };
  const canonicalResult = buildFinalOptimisedBassResponse({ optimisationResult });

  // Simulate the authority overlay: the authority produces alignedPostEqRsp.
  const authorityBearingCandidate = {
    ...candidate,
    alignedPostEqRsp: aligned,
    alignedPostEqSeatResponses: [],
    globalLevelAlignment: { recommendedTrimDb: 2, aligned: true, alignedP19Db: 3, originalP19Db: 5 },
    achievedP19VariationDb: 3,
    achievedP19Level: 3,
    officialP19WorstFrequencyHz: 50,
    assessmentStartHz: 30,
    assessmentEndHz: 120,
  };
  const finalResponse = applyAuthorityToCanonicalResult(canonicalResult, authorityBearingCandidate);

  // The graph curve (canonicalPostEqRsp) must be the ALIGNED curve, not the
  // original unaligned candidate.finalPostEqCurve.
  const graphCurve = finalResponse.canonicalPostEqRsp;
  const graphValueAt50 = graphCurve.find((p) => p.frequency > 49 && p.frequency < 51)?.spl;
  assert.ok(Math.abs(graphValueAt50 - 97) < 0.5,
    `graph should show aligned ~97 dB, got ${graphValueAt50}`);
});

test("P19 recomputed from the graph curve matches the published value when handoff is correct", () => {
  // When the graph curve is the aligned curve, recomputing P19 from it must
  // match the published achievedP19VariationDb.
  const target = makeCurve(() => 100);
  // A response 3 dB below target → P19 = 3 dB.
  const aligned = makeCurve(() => 97);
  const candidate = makeCandidate({
    finalPostEq: aligned, target, p19Db: 3, p20Db: 2,
  });
  const optimisationResult = { selectedCandidate: candidate };
  const canonicalResult = buildFinalOptimisedBassResponse({ optimisationResult });

  // Authority with aligned = same as finalPostEq (no additional trim).
  const authorityBearingCandidate = {
    ...candidate,
    alignedPostEqRsp: aligned,
    alignedPostEqSeatResponses: [],
    globalLevelAlignment: { recommendedTrimDb: 0, aligned: false },
    achievedP19VariationDb: 3,
    achievedP19Level: 3,
    officialP19WorstFrequencyHz: 50,
    assessmentStartHz: 30,
    assessmentEndHz: 120,
  };
  const finalResponse = applyAuthorityToCanonicalResult(canonicalResult, authorityBearingCandidate);

  const recomputed = computeCorrectableP19Diagnostic({
    rspPostEqCurve: finalResponse.canonicalPostEqRsp,
    canonicalTargetCurve: finalResponse.canonicalTargetCurve,
    assessmentStartHz: finalResponse.assessmentStartHz,
    assessmentEndHz: finalResponse.assessmentEndHz,
    protectedNullRegions: finalResponse.protectedNullRegions,
  });
  assert.ok(Math.abs(recomputed.variationDbRaw - finalResponse.achievedP19VariationDb) < 0.01,
    `P19 parity: recomputed=${recomputed.variationDbRaw?.toFixed(4)}, published=${finalResponse.achievedP19VariationDb?.toFixed(4)}`);
});

test("P19 parity detects a graph/metric split (unaligned graph vs aligned metric)", () => {
  // Simulate the old bug: the graph shows the unaligned curve (95 dB) while
  // P19 was scored from the aligned curve (97 dB). Recomputing P19 from the
  // graph curve must NOT match the published P19.
  const target = makeCurve(() => 100);
  const unaligned = makeCurve(() => 95);
  const aligned = makeCurve(() => 97);

  // P19 from the aligned curve (97 vs 100 target → 3 dB deviation).
  const p19FromAligned = computeCorrectableP19Diagnostic({
    rspPostEqCurve: aligned, canonicalTargetCurve: target,
    assessmentStartHz: 30, assessmentEndHz: 120, protectedNullRegions: [],
  });

  // P19 from the unaligned graph curve (95 vs 100 target → 5 dB deviation).
  const p19FromGraph = computeCorrectableP19Diagnostic({
    rspPostEqCurve: unaligned, canonicalTargetCurve: target,
    assessmentStartHz: 30, assessmentEndHz: 120, protectedNullRegions: [],
  });

  assert.ok(Math.abs(p19FromAligned.variationDbRaw - p19FromGraph.variationDbRaw) > 1,
    `P19 should differ between aligned (${p19FromAligned.variationDbRaw}) and unaligned (${p19FromGraph.variationDbRaw})`);
});