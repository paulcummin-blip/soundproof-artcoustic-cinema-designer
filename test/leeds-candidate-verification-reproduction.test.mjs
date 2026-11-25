// leeds-candidate-verification-reproduction.test.mjs
// ---------------------------------------------------------------------------
// Reproduces the Leeds winning candidate verification path to determine
// whether the failure was caused by numerical precision, a settings mismatch,
// a result mismatch, or a verification logic issue.
//
// This test exercises the EXACT verification functions (recommendationSettingsMatch,
// comparisonResultsMatch) with the saved Leeds candidate values. It does NOT
// modify the saved Leeds design or rerun the optimiser.
//
// The Leeds candidate: grouped-delay:["sub-rear-1","sub-rear-2"]:2
// Run: optimiser-run-2026-11-25T16:37:31.798Z-1
// ---------------------------------------------------------------------------

import { test } from "node:test";
import assert from "node:assert/strict";

import { recommendationSettingsMatch, comparisonResultsMatch } from "@/components/room/bass/optimiseWorkflow/crossoverApplicationVerification.js";
import { buildVerificationFailureDiagnostics } from "@/components/room/bass/optimiseWorkflow/verificationFailureDiagnostics.js";

// ── Leeds candidate tuning (from the saved winning candidate) ──
const LEEDS_TUNING = [
  { sourceId: "sub-front-1", delayMs: 0, gainDb: 0, polarity: 1, phaseControlDeg: 0 },
  { sourceId: "sub-front-2", delayMs: 0.0188603559, gainDb: 0, polarity: 1, phaseControlDeg: 0 },
  { sourceId: "sub-rear-1", delayMs: 2.2411571012, gainDb: 0, polarity: 1, phaseControlDeg: 0 },
  { sourceId: "sub-rear-2", delayMs: 2.2411571012, gainDb: 0, polarity: 1, phaseControlDeg: 0 },
];

// ── Leeds candidate expected result (from comparisonReceipt) ──
const LEEDS_EXPECTED_RESULT = {
  achievedP19VariationDb: 1.114866,
  achievedP19Level: 4,
  achievedP20VariationDb: 4.995402,
  achievedP20Level: 2,
  p14AchievedDb: 120.49972,
  p14AchievedLevel: 4,
  achievedP18Hz: 26.232885,
  p18AchievedLevel: 2,
  perSeatP20: [
    { seatId: "seat-r1-c1", isPrimary: true, variationDbRaw: 4.995402 },
    { seatId: "seat-r1-c2", isPrimary: false, variationDbRaw: 3.82 },
    { seatId: "seat-r2-c1", isPrimary: true, variationDbRaw: 4.21 },
    { seatId: "seat-r2-c2", isPrimary: false, variationDbRaw: 3.65 },
  ],
};

const CROSSOVER = {
  linkFrequencies: true,
  frequencyHz: 80,
  speakerHpSlopeDbPerOct: 24,
  subwooferLpSlopeDbPerOct: 24,
};

// ── Helper: build authoritative sources from tuning ──
function buildAuthoritativeSources(tuning) {
  return tuning.map((t) => ({
    id: t.sourceId,
    tuning: {
      delayMs: t.delayMs,
      gainDb: t.gainDb,
      polarity: t.polarity,
      phaseControlDeg: t.phaseControlDeg,
    },
  }));
}

// ── Helper: build authoritative context ──
function buildAuthoritative(sources, crossover) {
  return { sources, crossover };
}

test("TEST 1 — settingsMatch: full-precision tuning matches exactly (no precision loss)", () => {
  const authoritative = buildAuthoritative(
    buildAuthoritativeSources(LEEDS_TUNING),
    CROSSOVER,
  );
  const expected = { crossover: CROSSOVER, tuning: LEEDS_TUNING };
  const match = recommendationSettingsMatch(authoritative, expected);
  assert.equal(match, true, "Full-precision tuning must match — no rounding in the authoritative sources path");
});

test("TEST 2 — settingsMatch: 2-decimal rounding of Front 2 delay (0.0189 → 0.02) DOES cause a mismatch", () => {
  // Simulate rounding to 2 decimal places (as bassIdentityReconciliation does
  // for the FINGERPRINT digest, not for the authoritative sources).
  const roundedTuning = LEEDS_TUNING.map((t) => ({
    ...t,
    delayMs: Math.round(t.delayMs * 100) / 100, // round to 2 decimals
  }));
  const authoritative = buildAuthoritative(
    buildAuthoritativeSources(roundedTuning),
    CROSSOVER,
  );
  const expected = { crossover: CROSSOVER, tuning: LEEDS_TUNING };
  const match = recommendationSettingsMatch(authoritative, expected);
  // 0.02 - 0.0188603559 = 0.0011396441 > 0.001 tolerance
  assert.equal(match, false, "2-decimal rounding of Front 2 delay (0.0189→0.02) exceeds the 0.001 ms settingsMatch tolerance");
});

test("TEST 3 — settingsMatch: 3-decimal rounding of Front 2 delay (0.0189 → 0.019) does NOT cause a mismatch", () => {
  const roundedTuning = LEEDS_TUNING.map((t) => ({
    ...t,
    delayMs: Math.round(t.delayMs * 1000) / 1000, // round to 3 decimals
  }));
  const authoritative = buildAuthoritative(
    buildAuthoritativeSources(roundedTuning),
    CROSSOVER,
  );
  const expected = { crossover: CROSSOVER, tuning: LEEDS_TUNING };
  const match = recommendationSettingsMatch(authoritative, expected);
  // 0.019 - 0.0188603559 = 0.0001396441 < 0.001 tolerance
  assert.equal(match, true, "3-decimal rounding of Front 2 delay (0.0189→0.019) is within the 0.001 ms tolerance");
});

test("TEST 4 — resultMatch: exact candidate result matches exactly", () => {
  const actualResult = { ...LEEDS_EXPECTED_RESULT };
  const match = comparisonResultsMatch(actualResult, LEEDS_EXPECTED_RESULT);
  assert.equal(match, true, "Exact candidate result must match");
});

test("TEST 5 — resultMatch: a 0.05 dB P20 difference is within the 0.1 dB tolerance", () => {
  const actualResult = {
    ...LEEDS_EXPECTED_RESULT,
    achievedP20VariationDb: LEEDS_EXPECTED_RESULT.achievedP20VariationDb + 0.05,
    perSeatP20: LEEDS_EXPECTED_RESULT.perSeatP20.map((s) => ({
      ...s,
      variationDbRaw: s.variationDbRaw + 0.05,
    })),
  };
  const match = comparisonResultsMatch(actualResult, LEEDS_EXPECTED_RESULT);
  assert.equal(match, true, "A 0.05 dB P20 difference is within the 0.1 dB tolerance");
});

test("TEST 6 — resultMatch: a 0.11 dB P20 difference EXCEEDS the 0.1 dB tolerance", () => {
  const actualResult = {
    ...LEEDS_EXPECTED_RESULT,
    achievedP20VariationDb: LEEDS_EXPECTED_RESULT.achievedP20VariationDb + 0.11,
  };
  const match = comparisonResultsMatch(actualResult, LEEDS_EXPECTED_RESULT);
  assert.equal(match, false, "A 0.11 dB P20 difference exceeds the 0.1 dB tolerance");
});

test("TEST 7 — resultMatch: a single seat with 0.11 dB difference causes a mismatch", () => {
  const actualResult = {
    ...LEEDS_EXPECTED_RESULT,
    perSeatP20: LEEDS_EXPECTED_RESULT.perSeatP20.map((s, i) =>
      i === 0 ? { ...s, variationDbRaw: s.variationDbRaw + 0.11 } : s,
    ),
  };
  const match = comparisonResultsMatch(actualResult, LEEDS_EXPECTED_RESULT);
  assert.equal(match, false, "A single seat with 0.11 dB difference causes a result mismatch");
});

test("TEST 8 — verificationFailureDiagnostics: captures expected vs actual tuning differences", () => {
  const roundedSources = buildAuthoritativeSources(
    LEEDS_TUNING.map((t) => ({ ...t, delayMs: Math.round(t.delayMs * 100) / 100 })),
  );
  const diag = buildVerificationFailureDiagnostics({
    settingsMatch: false,
    resultMatch: true,
    reason: "settings-mismatch",
    expectedTuning: LEEDS_TUNING,
    actualSources: roundedSources,
    expectedResult: LEEDS_EXPECTED_RESULT,
    actualResult: LEEDS_EXPECTED_RESULT,
    expectedPhysicalContext: { roomDims: { widthM: 5.38 } },
    actualPhysicalContext: { roomDims: { widthM: 5.38 } },
    fingerprints: { targetCacheKey: "abc", actualCacheKey: "abc" },
  });
  assert.ok(diag, "diagnostics must be built");
  assert.equal(diag.settingsMatch, false);
  assert.equal(diag.resultMatch, true);
  assert.equal(diag.tuning.differences.length > 0, true, "tuning differences must be captured");
  const front2Diff = diag.tuning.differences.find((d) => d.sourceId === "sub-front-2");
  assert.ok(front2Diff, "Front 2 tuning difference must be captured");
  assert.ok(Math.abs(Math.abs(front2Diff.delayMs.delta) - 0.0011) < 0.0001, "Front 2 delay delta magnitude must be ~0.0011 ms");
  assert.equal(diag.physicalContext.match, true, "physical context fingerprints must match");
});

test("TEST 9 — verificationFailureDiagnostics: captures result metric differences", () => {
  const actualResult = {
    ...LEEDS_EXPECTED_RESULT,
    achievedP20VariationDb: LEEDS_EXPECTED_RESULT.achievedP20VariationDb + 0.15,
    perSeatP20: LEEDS_EXPECTED_RESULT.perSeatP20.map((s, i) =>
      i === 0 ? { ...s, variationDbRaw: s.variationDbRaw + 0.15 } : s,
    ),
  };
  const diag = buildVerificationFailureDiagnostics({
    settingsMatch: true,
    resultMatch: false,
    reason: "result-mismatch",
    expectedTuning: LEEDS_TUNING,
    actualSources: buildAuthoritativeSources(LEEDS_TUNING),
    expectedResult: LEEDS_EXPECTED_RESULT,
    actualResult,
    expectedPhysicalContext: null,
    actualPhysicalContext: null,
    fingerprints: {},
  });
  assert.equal(diag.resultMatch, false);
  assert.ok(diag.resultMetrics.achievedP20VariationDb.delta > 0.14, "P20 delta must be captured");
  assert.ok(diag.perSeatDifferences.length > 0, "per-seat differences must be captured");
  const seat1Diff = diag.perSeatDifferences.find((d) => d.seatId === "seat-r1-c1");
  assert.ok(seat1Diff, "seat-r1-c1 difference must be captured");
  assert.ok(seat1Diff.delta > 0.14, "seat delta must be ~0.15");
});

test("TEST 10 — settingsMatch: rear delay 2.2411571012 ms is preserved at full precision (no rounding)", () => {
  // The authoritative sources preserve full precision — the 0.001 ms tolerance
  // is tight enough that any rounding to fewer than 3 decimal places would
  // cause a mismatch for the rear delays.
  const authoritative = buildAuthoritative(
    buildAuthoritativeSources(LEEDS_TUNING),
    CROSSOVER,
  );
  const expected = { crossover: CROSSOVER, tuning: LEEDS_TUNING };
  const match = recommendationSettingsMatch(authoritative, expected);
  assert.equal(match, true, "Full-precision rear delay 2.2411571012 ms must match");
});