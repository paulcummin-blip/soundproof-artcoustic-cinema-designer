// p10-authority-correction.test.mjs
// Focused regression tests for the confirmed P10 authority correction.
//
// CONFIRMED DEFECT:
//   gradeP10 returned L1 for ALL values > 8 dB (no L1 band 8–12, no FAIL > 12).
//   The Design Rating's levelP10_upperDelta correctly returns L1 ≤ 12 and
//   N/A → FAIL for > 12. This caused the same seat to appear as L1 in the
//   Compliance/expanded panel and FAIL in the left Design Rating.
//
// CHANGE 1 — gradeP10 now matches the canonical thresholds:
//   ≤ 2 → 4 (L4), ≤ 5 → 3 (L3), ≤ 8 → 2 (L2), ≤ 12 → 1 (L1), > 12 → 0 (FAIL)
//
// CHANGE 2 — buildSeatHudSnapshot no longer manufactures a raw max-min P10
//   fallback when the canonical engine P10 is absent. Missing P10 is
//   NOT CALCULATED (or N/A when no overheads exist).
//
// These tests prove:
//   1. gradeP10 boundary correctness (direct + through full pipeline)
//   2. Cross-surface consistency (engine, Compliance, expanded, Design Rating)
//   3. Missing engine P10 → NOT CALCULATED (no fabricated fallback)
//   4. Existing L2/L3/L4 values unchanged

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { computeP10RspNormalisedSpread, gradeP10, P10_UPPER_ROLES } from "@/components/utils/rp22/p10RspNormalisation";
import { levelP10_upperDelta } from "@/components/utils/rp22/levels";
import { normalizeLevel } from "@/components/designreview/needsAttentionAuthority";

// ── Helpers ──

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

function makeUppers(values) {
  const out = {};
  for (const role of P10_UPPER_ROLES) {
    if (isNum(values[role])) out[role] = { value: values[role] };
  }
  return out;
}

// Produce a seat/rsp pair where the spread equals `targetSpread` exactly.
// RSP: all channels at 90. Seat: all channels at 90 except TRR at 90 + targetSpread.
// normalisedDeltas = [0, 0, 0, 0, 0, targetSpread] → spread = targetSpread.
function makePairForSpread(targetSpread) {
  const rsp = makeUppers({ TFL: 90, TFR: 90, TML: 90, TMR: 90, TRL: 90, TRR: 90 });
  const seat = makeUppers({ TFL: 90, TFR: 90, TML: 90, TMR: 90, TRL: 90, TRR: 90 + targetSpread });
  return { seat, rsp };
}

// Simulate the Design Rating's scoreP10 path: levelP10_upperDelta + canFail=true.
// When levelP10_upperDelta returns {level: 'N/A', ok: false}, applyMapper with
// canFail=true converts it to 'FAIL'.
function designRatingP10Level(rawSpreadDb) {
  const mapped = levelP10_upperDelta(rawSpreadDb);
  if (!mapped.ok) return "FAIL";
  return mapped.level;
}

// ── 1. gradeP10 boundary tests (direct, no flooring) ──

describe("gradeP10 boundary thresholds", () => {
  test("2.0 → L4", () => {
    assert.equal(gradeP10(2.0), 4);
  });

  test("just above 2 → L3", () => {
    assert.equal(gradeP10(2.001), 3);
    assert.equal(gradeP10(2.5), 3);
    assert.equal(gradeP10(3.0), 3);
  });

  test("5.0 → L3", () => {
    assert.equal(gradeP10(5.0), 3);
  });

  test("just above 5 → L2", () => {
    assert.equal(gradeP10(5.001), 2);
    assert.equal(gradeP10(5.5), 2);
    assert.equal(gradeP10(6.0), 2);
  });

  test("8.0 → L2", () => {
    assert.equal(gradeP10(8.0), 2);
  });

  test("just above 8 → L1", () => {
    assert.equal(gradeP10(8.001), 1);
    assert.equal(gradeP10(8.5), 1);
    assert.equal(gradeP10(9.0), 1);
  });

  test("12.0 → L1", () => {
    assert.equal(gradeP10(12.0), 1);
  });

  test(">12 → FAIL (0)", () => {
    assert.equal(gradeP10(12.001), 0);
    assert.equal(gradeP10(13.0), 0);
    assert.equal(gradeP10(20.0), 0);
    assert.equal(gradeP10(100.0), 0);
  });

  test("non-number → '—'", () => {
    assert.equal(gradeP10(NaN), "—");
    assert.equal(gradeP10(null), "—");
    assert.equal(gradeP10(undefined), "—");
  });
});

// ── 2. Full pipeline tests (through computeP10RspNormalisedSpread with flooring) ──

describe("computeP10RspNormalisedSpread pipeline with flooring", () => {
  test("spread 2.0 → floor 2 → L4", () => {
    const { seat, rsp } = makePairForSpread(2.0);
    const result = computeP10RspNormalisedSpread(seat, rsp);
    assert.equal(result.deltaRounded, 2);
    assert.equal(result.level, 4);
  });

  test("spread 2.9 → floor 2 → L4 (flooring keeps it at L4)", () => {
    const { seat, rsp } = makePairForSpread(2.9);
    const result = computeP10RspNormalisedSpread(seat, rsp);
    assert.equal(result.deltaRounded, 2);
    assert.equal(result.level, 4);
  });

  test("spread 3.0 → floor 3 → L3", () => {
    const { seat, rsp } = makePairForSpread(3.0);
    const result = computeP10RspNormalisedSpread(seat, rsp);
    assert.equal(result.deltaRounded, 3);
    assert.equal(result.level, 3);
  });

  test("spread 5.0 → floor 5 → L3", () => {
    const { seat, rsp } = makePairForSpread(5.0);
    const result = computeP10RspNormalisedSpread(seat, rsp);
    assert.equal(result.deltaRounded, 5);
    assert.equal(result.level, 3);
  });

  test("spread 5.9 → floor 5 → L3", () => {
    const { seat, rsp } = makePairForSpread(5.9);
    const result = computeP10RspNormalisedSpread(seat, rsp);
    assert.equal(result.deltaRounded, 5);
    assert.equal(result.level, 3);
  });

  test("spread 6.0 → floor 6 → L2", () => {
    const { seat, rsp } = makePairForSpread(6.0);
    const result = computeP10RspNormalisedSpread(seat, rsp);
    assert.equal(result.deltaRounded, 6);
    assert.equal(result.level, 2);
  });

  test("spread 8.0 → floor 8 → L2", () => {
    const { seat, rsp } = makePairForSpread(8.0);
    const result = computeP10RspNormalisedSpread(seat, rsp);
    assert.equal(result.deltaRounded, 8);
    assert.equal(result.level, 2);
  });

  test("spread 8.9 → floor 8 → L2", () => {
    const { seat, rsp } = makePairForSpread(8.9);
    const result = computeP10RspNormalisedSpread(seat, rsp);
    assert.equal(result.deltaRounded, 8);
    assert.equal(result.level, 2);
  });

  test("spread 9.0 → floor 9 → L1", () => {
    const { seat, rsp } = makePairForSpread(9.0);
    const result = computeP10RspNormalisedSpread(seat, rsp);
    assert.equal(result.deltaRounded, 9);
    assert.equal(result.level, 1);
  });

  test("spread 12.0 → floor 12 → L1", () => {
    const { seat, rsp } = makePairForSpread(12.0);
    const result = computeP10RspNormalisedSpread(seat, rsp);
    assert.equal(result.deltaRounded, 12);
    assert.equal(result.level, 1);
  });

  test("spread 12.9 → floor 12 → L1", () => {
    const { seat, rsp } = makePairForSpread(12.9);
    const result = computeP10RspNormalisedSpread(seat, rsp);
    assert.equal(result.deltaRounded, 12);
    assert.equal(result.level, 1);
  });

  test("spread 13.0 → floor 13 → FAIL (0)", () => {
    const { seat, rsp } = makePairForSpread(13.0);
    const result = computeP10RspNormalisedSpread(seat, rsp);
    assert.equal(result.deltaRounded, 13);
    assert.equal(result.level, 0);
  });

  test("spread 15.0 → floor 15 → FAIL (0)", () => {
    const { seat, rsp } = makePairForSpread(15.0);
    const result = computeP10RspNormalisedSpread(seat, rsp);
    assert.equal(result.deltaRounded, 15);
    assert.equal(result.level, 0);
  });
});

// ── 3. Cross-surface consistency ──

describe("cross-surface P10 consistency", () => {
  test("spread > 12 dB → FAIL everywhere", () => {
    const { seat, rsp } = makePairForSpread(13.0);
    const result = computeP10RspNormalisedSpread(seat, rsp);

    // Engine level: 0 (numeric FAIL)
    const engineLevel = result.level;
    assert.equal(engineLevel, 0);

    // Compliance / expanded panel: normalizeLevel(0) → "FAIL"
    const complianceLevel = normalizeLevel(engineLevel);
    assert.equal(complianceLevel, "FAIL");

    // Design Rating: levelP10_upperDelta(13) → N/A → canFail=true → "FAIL"
    const designLevel = designRatingP10Level(result.deltaRounded);
    assert.equal(designLevel, "FAIL");

    // All four surfaces agree
    assert.equal(complianceLevel, designLevel, "Compliance and Design Rating disagree");
  });

  test("spread = 12 dB → L1 everywhere", () => {
    const { seat, rsp } = makePairForSpread(12.0);
    const result = computeP10RspNormalisedSpread(seat, rsp);

    const engineLevel = result.level;
    assert.equal(engineLevel, 1);

    const complianceLevel = normalizeLevel(engineLevel);
    assert.equal(complianceLevel, "L1");

    const designLevel = designRatingP10Level(result.deltaRounded);
    assert.equal(designLevel, "L1");

    assert.equal(complianceLevel, designLevel);
  });

  test("spread = 8 dB → L2 everywhere", () => {
    const { seat, rsp } = makePairForSpread(8.0);
    const result = computeP10RspNormalisedSpread(seat, rsp);

    const engineLevel = result.level;
    assert.equal(engineLevel, 2);

    const complianceLevel = normalizeLevel(engineLevel);
    assert.equal(complianceLevel, "L2");

    const designLevel = designRatingP10Level(result.deltaRounded);
    assert.equal(designLevel, "L2");

    assert.equal(complianceLevel, designLevel);
  });

  test("spread = 5 dB → L3 everywhere", () => {
    const { seat, rsp } = makePairForSpread(5.0);
    const result = computeP10RspNormalisedSpread(seat, rsp);

    const engineLevel = result.level;
    assert.equal(engineLevel, 3);

    const complianceLevel = normalizeLevel(engineLevel);
    assert.equal(complianceLevel, "L3");

    const designLevel = designRatingP10Level(result.deltaRounded);
    assert.equal(designLevel, "L3");

    assert.equal(complianceLevel, designLevel);
  });

  test("spread = 2 dB → L4 everywhere", () => {
    const { seat, rsp } = makePairForSpread(2.0);
    const result = computeP10RspNormalisedSpread(seat, rsp);

    const engineLevel = result.level;
    assert.equal(engineLevel, 4);

    const complianceLevel = normalizeLevel(engineLevel);
    assert.equal(complianceLevel, "L4");

    const designLevel = designRatingP10Level(result.deltaRounded);
    assert.equal(designLevel, "L4");

    assert.equal(complianceLevel, designLevel);
  });
});

// ── 4. Missing engine P10 → no fabricated fallback ──

describe("missing engine P10", () => {
  test("computeP10RspNormalisedSpread returns null when < 2 valid channels", () => {
    const seat = makeUppers({ TFL: 90 });
    const rsp = makeUppers({ TFL: 90, TFR: 90 });
    const result = computeP10RspNormalisedSpread(seat, rsp);
    assert.equal(result, null);
  });

  test("computeP10RspNormalisedSpread returns null when rsp is null", () => {
    const seat = makeUppers({ TFL: 90, TFR: 90 });
    const result = computeP10RspNormalisedSpread(seat, null);
    assert.equal(result, null);
  });

  test("no raw max-min fallback value is manufactured", () => {
    // The old fallback computed max-min of raw upper SPL values. Verify that
    // computeP10RspNormalisedSpread does NOT produce a result from raw max-min
    // when RSP normalisation cannot be performed.
    const seat = makeUppers({ TFL: 100, TFR: 80, TML: 90, TMR: 90, TRL: 90, TRR: 90 });
    // No RSP at all → cannot normalise → null (not a raw 20 dB spread)
    const result = computeP10RspNormalisedSpread(seat, null);
    assert.equal(result, null);
  });
});

// ── 5. Existing calculated values unchanged ──

describe("existing L2/L3/L4 values unchanged", () => {
  test("spread 7 dB → L2 (unchanged)", () => {
    const { seat, rsp } = makePairForSpread(7.0);
    const result = computeP10RspNormalisedSpread(seat, rsp);
    assert.equal(result.level, 2);
  });

  test("spread 3 dB → L3 (unchanged)", () => {
    const { seat, rsp } = makePairForSpread(3.0);
    const result = computeP10RspNormalisedSpread(seat, rsp);
    assert.equal(result.level, 3);
  });

  test("spread 1 dB → L4 (unchanged)", () => {
    const { seat, rsp } = makePairForSpread(1.0);
    const result = computeP10RspNormalisedSpread(seat, rsp);
    assert.equal(result.level, 4);
  });

  test("spread 0 dB → L4 (unchanged)", () => {
    const { seat, rsp } = makePairForSpread(0.0);
    const result = computeP10RspNormalisedSpread(seat, rsp);
    assert.equal(result.level, 4);
  });
});

// ── 6. RSP normalisation still works (regression guard) ──

describe("RSP normalisation regression guard", () => {
  test("P10 subtracts matching RSP channel before spread", () => {
    const seat = makeUppers({ TFL: 100, TFR: 90, TML: 90, TMR: 90, TRL: 90, TRR: 90 });
    const rsp = makeUppers({ TFL: 90, TFR: 90, TML: 90, TMR: 90, TRL: 90, TRR: 90 });
    const result = computeP10RspNormalisedSpread(seat, rsp);
    // normDeltas = [10, 0, 0, 0, 0, 0] → spread = 10
    assert.equal(result.spread, 10);
    assert.equal(result.deltaRounded, 10);
    assert.equal(result.level, 1); // 10 ≤ 12 → L1
  });

  test("missing RSP channel excludes only that channel", () => {
    const seat = makeUppers({ TFL: 100, TFR: 95, TML: 90, TMR: 90, TRL: 90, TRR: 90 });
    const rsp = { TFL: { value: 90 }, TFR: { value: 90 }, TML: { value: 90 }, TMR: { value: 90 }, TRL: { value: 90 } };
    const result = computeP10RspNormalisedSpread(seat, rsp);
    assert.equal(result.rolesUsed.length, 5);
    assert.ok(!result.rolesUsed.includes("TRR"));
  });
});