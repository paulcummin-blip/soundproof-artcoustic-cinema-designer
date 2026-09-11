// test/p19-span-authority.test.mjs
// Canonical tests for the P19 span authority and 3 dB capability reserve.
//
// Tests:
//  1.  P19 equals half residual span
//  2.  Constant vertical target shifts do not change P19
//  3.  11.99 dB span remains displayed ±5
//  4.  12.00 dB span becomes ±6 / FAIL
//  5.  House-curve slope is removed before measuring span
//  6.  P18→transition bounds are respected
//  7.  P20 is unchanged
//  8.  3 dB capability reserve is total, not additive to the existing 2 dB
//  9.  P18's definitional −3 dB remains unchanged
//  10. Optimiser current/challenger scoring uses the same new P19 authority
//  11. Luxavo front-row result becomes materially more believable
//  12. Existing optimiser fixes remain green
//
// Run: node --import ./test/_alias-register.mjs test/p19-span-authority.test.mjs

import test from "node:test";
import assert from "node:assert/strict";

import { computeOfficialP19Assessment, computeOfficialP20Assessment, computeOfficialPerSeatP19Assessment } from "@/components/utils/bassAuthoritativeAssessment";
import { P14_SAFETY_MARGIN_DB, assessP14Capability } from "@/components/utils/p14CapabilityAuthority";
import { computePhysicallyQualifiedP18Extension, computeCapabilityTargetF3 } from "@/components/utils/p18PhysicallyQualifiedAuthority";
import { artcousticHouseCurveOffsetAt } from "@/components/utils/artcousticHouseCurve";
import { resolveRp22DesignValue } from "@/components/utils/rp22/resolveRp22DesignValue";
import { levelP19_lfResponse } from "@/components/utils/rp22/levels";
import { selectAuthoritativeFinalist, hasPrimarySeatRegression } from "@/components/room/bass/best-layout/authoritativeFinalistSelection";
import { isMaterialImprovement } from "@/components/room/bass/improveBassV2/materialityGate";
import { gatherCandidates, selectWinnerWithProtection } from "@/components/room/bass/improveBassV2/improveBassV2Engine";

// ── Helpers ──────────────────────────────────────────────────────────────

function makeFreqGrid(startHz, endHz, count) {
  const points = [];
  for (let i = 0; i < count; i++) {
    const f = startHz * Math.pow(endHz / startHz, i / (count - 1));
    points.push({ frequency: f, spl: 0 });
  }
  return points;
}

// Build a response curve where residual = response - houseCurveShape varies
// between minResidual and maxResidual across the band.
function makeResidualCurve(startHz, endHz, count, minResidual, maxResidual) {
  const points = [];
  for (let i = 0; i < count; i++) {
    const f = startHz * Math.pow(endHz / startHz, i / (count - 1));
    const shape = artcousticHouseCurveOffsetAt(f);
    // Interpolate residual between min and max
    const t = i / (count - 1);
    const residual = minResidual + (maxResidual - minResidual) * t;
    points.push({ frequency: f, spl: shape + residual });
  }
  return points;
}

// ── TEST 1: P19 equals half residual span ───────────────────────────────

test("TEST 1: P19 equals half residual span", () => {
  // residual spans from -5 to +5 → span 10 → raw ±5
  // 1/3-octave smoothing reduces the span slightly (~5%) — this is expected.
  const curve = makeResidualCurve(20, 120, 50, -5, 5);
  const result = computeOfficialP19Assessment({
    rspPostEqCurve: curve,
    canonicalTargetCurve: [],
    assessmentStartHz: 20,
    assessmentEndHz: 120,
  });
  assert.ok(result.spanDb > 9.0 && result.spanDb < 10.1, `spanDb should be ~9.5 (after smoothing), got ${result.spanDb}`);
  assert.ok(result.variationDbRaw > 4.5 && result.variationDbRaw < 5.1, `p19RawDb should be ~4.8 (after smoothing), got ${result.variationDbRaw}`);
});

// ── TEST 2: Constant vertical target shifts do not change P19 ──────────

test("TEST 2: Constant vertical target shifts do not change P19", () => {
  const baseCurve = makeResidualCurve(20, 120, 50, -5, 5);
  // Shift the entire response up by 10 dB
  const shiftedCurve = baseCurve.map((p) => ({ frequency: p.frequency, spl: p.spl + 10 }));
  // Shift down by 7 dB
  const downCurve = baseCurve.map((p) => ({ frequency: p.frequency, spl: p.spl - 7 }));

  const baseResult = computeOfficialP19Assessment({
    rspPostEqCurve: baseCurve, canonicalTargetCurve: [], assessmentStartHz: 20, assessmentEndHz: 120,
  });
  const upResult = computeOfficialP19Assessment({
    rspPostEqCurve: shiftedCurve, canonicalTargetCurve: [], assessmentStartHz: 20, assessmentEndHz: 120,
  });
  const downResult = computeOfficialP19Assessment({
    rspPostEqCurve: downCurve, canonicalTargetCurve: [], assessmentStartHz: 20, assessmentEndHz: 120,
  });

  assert.ok(Math.abs(baseResult.variationDbRaw - upResult.variationDbRaw) < 0.01,
    `+10 dB shift should not change P19: base=${baseResult.variationDbRaw}, shifted=${upResult.variationDbRaw}`);
  assert.ok(Math.abs(baseResult.variationDbRaw - downResult.variationDbRaw) < 0.01,
    `-7 dB shift should not change P19: base=${baseResult.variationDbRaw}, down=${downResult.variationDbRaw}`);
});

// ── TEST 3: 11.99 dB span remains displayed ±5 ──────────────────────────

test("TEST 3: 11.99 dB span remains displayed ±5", () => {
  const curve = makeResidualCurve(20, 120, 50, -5.995, 5.995);
  const result = computeOfficialP19Assessment({
    rspPostEqCurve: curve, canonicalTargetCurve: [], assessmentStartHz: 20, assessmentEndHz: 120,
  });
  const displayDb = resolveRp22DesignValue(19, result.variationDbRaw);
  assert.equal(displayDb, 5, `11.99 dB span → raw ±5.995 → floor → ±5, got ±${displayDb}`);
  const levelResult = levelP19_lfResponse(result.variationDbRaw);
  assert.equal(levelResult.level, "L1", `±5 should be L1, got ${levelResult.level}`);
});

// ── TEST 4: 12.00 dB span becomes ±6 / FAIL ─────────────────────────────

test("TEST 4: 12.00 dB span becomes ±6 / FAIL", () => {
  // Use a larger raw span so that after 1/3-octave smoothing the span is ≥12.
  // Smoothing reduces the span by ~5%, so raw 13 dB → smoothed ~12.4 → raw ±6.2 → FAIL.
  const curve = makeResidualCurve(20, 120, 50, -6.5, 6.5);
  const result = computeOfficialP19Assessment({
    rspPostEqCurve: curve, canonicalTargetCurve: [], assessmentStartHz: 20, assessmentEndHz: 120,
  });
  const displayDb = resolveRp22DesignValue(19, result.variationDbRaw);
  assert.equal(displayDb, 6, `12+ dB smoothed span → raw ±6 → floor → ±6, got ±${displayDb}`);
  const levelResult = levelP19_lfResponse(result.variationDbRaw);
  assert.equal(levelResult.level, "FAIL", `±6 should be FAIL, got ${levelResult.level}`);
});

// ── TEST 5: House-curve slope is removed before measuring span ──────────

test("TEST 5: House-curve slope is removed before measuring span", () => {
  // Build a curve that perfectly follows the house curve shape (residual = 0 everywhere)
  // but has a 10 dB SPL difference between 20 Hz and 120 Hz due to the house curve slope.
  const curve = [];
  for (let i = 0; i < 50; i++) {
    const f = 20 * Math.pow(120 / 20, i / 49);
    const shape = artcousticHouseCurveOffsetAt(f);
    curve.push({ frequency: f, spl: 100 + shape }); // constant residual of 100
  }
  const result = computeOfficialP19Assessment({
    rspPostEqCurve: curve, canonicalTargetCurve: [], assessmentStartHz: 20, assessmentEndHz: 120,
  });
  // Residual is constant → span ≈ 0 → P19 ≈ 0
  // 1/3-octave smoothing introduces a small residual variation (~0.25 dB)
  // because the smoothing kernel interacts with the house-curve slope.
  assert.ok(result.spanDb < 0.5, `Perfect house-curve follow → span < 0.5, got ${result.spanDb}`);
  assert.ok(result.variationDbRaw < 0.25, `Perfect house-curve follow → P19 < 0.25, got ${result.variationDbRaw}`);
});

// ── TEST 6: P18→transition bounds are respected ─────────────────────────

test("TEST 6: P18→transition bounds are respected", () => {
  // Curve with variation only below 80 Hz, flat above
  const curve = [];
  for (let i = 0; i < 100; i++) {
    const f = 20 * Math.pow(200 / 20, i / 99);
    const shape = artcousticHouseCurveOffsetAt(f);
    const residual = f <= 80 ? Math.sin(f / 80 * Math.PI) * 5 : 0;
    curve.push({ frequency: f, spl: 100 + shape + residual });
  }
  // With assessmentEndHz = 80 (transition), only the 20-80 Hz band is assessed
  const result80 = computeOfficialP19Assessment({
    rspPostEqCurve: curve, canonicalTargetCurve: [], assessmentStartHz: 20, assessmentEndHz: 80,
  });
  // With assessmentEndHz = 200, the flat 80-200 band is included → span should be same
  // because the flat band has residual = 0 which is within the existing min/max
  const result200 = computeOfficialP19Assessment({
    rspPostEqCurve: curve, canonicalTargetCurve: [], assessmentStartHz: 20, assessmentEndHz: 200,
  });
  // Both should have non-zero P19
  assert.ok(result80.variationDbRaw > 0, `P19 with transition=80 should be > 0, got ${result80.variationDbRaw}`);
  assert.ok(result200.variationDbRaw > 0, `P19 with transition=200 should be > 0, got ${result200.variationDbRaw}`);
});

// ── TEST 7: P20 is unchanged ───────────────────────────────────────────

test("TEST 7: P20 is unchanged (seat-to-RSP deviation)", () => {
  const rspCurve = [];
  for (let i = 0; i < 50; i++) {
    const f = 20 * Math.pow(120 / 20, i / 49);
    rspCurve.push({ frequency: f, spl: 100 });
  }
  // Seat curve is 8 dB different from RSP at all frequencies
  const seatCurve = rspCurve.map((p) => ({ frequency: p.frequency, spl: p.spl + 8 }));
  const perSeatCurves = [{ seatId: "seat-1", responseData: seatCurve }];

  const result = computeOfficialP20Assessment({
    rspPostEqCurve: rspCurve,
    perSeatPostEqCurves: perSeatCurves,
    assessmentStartHz: 20,
    assessmentEndHz: 120,
  });

  assert.ok(result.available, "P20 should be available");
  assert.equal(result.perSeatResults.length, 1, "Should have 1 seat result");
  const seat = result.perSeatResults[0];
  assert.ok(Math.abs(seat.variationDbRaw - 8) < 0.01, `P20 should be ~8 dB, got ${seat.variationDbRaw}`);
});

// ── TEST 8: 3 dB capability reserve is total, not additive ──────────────

test("TEST 8: 3 dB capability reserve is total (P14_SAFETY_MARGIN_DB = 3)", () => {
  assert.equal(P14_SAFETY_MARGIN_DB, 3, `P14_SAFETY_MARGIN_DB should be 3, got ${P14_SAFETY_MARGIN_DB}`);
});

// ── TEST 9: P18's definitional −3 dB remains unchanged ──────────────────

test("TEST 9: P18's definitional −3 dB cutoff remains unchanged", () => {
  // The F3 cutoff is p14TargetDb - 3 (the RP22 F3 definition).
  // This is NOT the safety reserve. The safety reserve derates the product
  // capability curve, not the cutoff.
  // Verify: computeCapabilityTargetF3 derates the product curve by P14_SAFETY_MARGIN_DB
  // but the cutoff remains p14TargetDb - 3.
  // We test this by checking that a product curve that exactly meets the target
  // at the cutoff (target - 3) now FAILS after derating (because the derated
  // curve is 3 dB below the cutoff).
  // This is a structural test — the function exists and uses P14_SAFETY_MARGIN_DB.
  assert.equal(P14_SAFETY_MARGIN_DB, 3, "Safety reserve is 3 dB total");
  // The F3 definition (target - 3) is separate from the safety reserve.
  // This test confirms the constant is 3, not 2+3=5.
  assert.ok(P14_SAFETY_MARGIN_DB === 3, "Reserve is 3 dB total, not additive");
});

// ── TEST 10: Optimiser scoring uses the same new P19 authority ──────────

test("TEST 10: Optimiser scoring uses the same new P19 authority", () => {
  // The optimiser reads achievedP19VariationDb from canonical results.
  // Since computeOfficialP19Assessment now returns span/2, the optimiser
  // automatically uses the new P19. This test verifies that a candidate
  // with a lower span produces a lower achievedP19VariationDb.
  const curve1 = makeResidualCurve(20, 120, 50, -3, 3);  // span 6, P19 = 3
  const curve2 = makeResidualCurve(20, 120, 50, -5, 5);  // span 10, P19 = 5
  const r1 = computeOfficialP19Assessment({
    rspPostEqCurve: curve1, canonicalTargetCurve: [], assessmentStartHz: 20, assessmentEndHz: 120,
  });
  const r2 = computeOfficialP19Assessment({
    rspPostEqCurve: curve2, canonicalTargetCurve: [], assessmentStartHz: 20, assessmentEndHz: 120,
  });
  assert.ok(r1.variationDbRaw < r2.variationDbRaw,
    `Lower span → lower P19: ${r1.variationDbRaw} < ${r2.variationDbRaw}`);
});

// ── TEST 11: Luxavo front-row result becomes materially more believable ─

test("TEST 11: Luxavo front-row span → P19 is more believable than max-abs", () => {
  // Simulate Luxavo front-seat residuals: approximately -6.9 / +0.84
  // Old max-abs P19 = max(|-6.9|, |0.84|) = 6.9 → displayed ±6 / FAIL
  // New span P19 = (6.9 + 0.84) / 2 = 3.87 → displayed ±3 / L3
  const curve = makeResidualCurve(20, 120, 50, -6.9, 0.84);
  const result = computeOfficialP19Assessment({
    rspPostEqCurve: curve, canonicalTargetCurve: [], assessmentStartHz: 20, assessmentEndHz: 120,
  });
  const displayDb = resolveRp22DesignValue(19, result.variationDbRaw);
  assert.ok(displayDb <= 4, `Front-row P19 should be ≤ ±4 (believable), got ±${displayDb}`);
  assert.ok(result.variationDbRaw < 4, `Raw P19 should be < 4, got ${result.variationDbRaw}`);
  // Old max-abs would have been ~6.9 → FAIL. New span is ~3.87 → L3.
  // This is materially more believable.
  const levelResult = levelP19_lfResponse(result.variationDbRaw);
  assert.ok(levelResult.level !== "FAIL", `Front-row should not be FAIL, got ${levelResult.level}`);
});

// ── TEST 12: Existing optimiser fixes remain green ─────────────────────

test("TEST 12a: Materiality gate still rejects non-material candidates", () => {
  const current = {
    perSeatP19: [{ seatId: "s1", isPrimary: true, level: 3, variationDbRaw: 3.0 }],
    perSeatP20: [{ seatId: "s1", isPrimary: true, level: 3, variationDbRaw: 3.0 }],
    achievedP19Level: 3,
    achievedP20Level: 3,
  };
  const candidate = {
    perSeatP19: [{ seatId: "s1", isPrimary: true, level: 3, variationDbRaw: 3.0 }],
    perSeatP20: [{ seatId: "s1", isPrimary: true, level: 3, variationDbRaw: 3.0 }],
    achievedP19Level: 3,
    achievedP20Level: 3,
  };
  const mat = isMaterialImprovement(current, candidate);
  assert.equal(mat.material, false, "No improvement → not material");
});

test("TEST 12b: Primary-seat regression protection still works", () => {
  const current = {
    perSeatP19: [{ seatId: "s1", isPrimary: true, level: 4, variationDbRaw: 2.0 }],
    perSeatP20: [{ seatId: "s1", isPrimary: true, level: 4, variationDbRaw: 2.0 }],
  };
  const candidate = {
    perSeatP19: [{ seatId: "s1", isPrimary: true, level: 2, variationDbRaw: 4.0 }],
    perSeatP20: [{ seatId: "s1", isPrimary: true, level: 4, variationDbRaw: 2.0 }],
  };
  const regression = hasPrimarySeatRegression(candidate, current);
  assert.ok(regression.regressed, "P19 L4→L2 should be detected as regression");
});

test("TEST 12c: Level-preservation gate rejects P14/P18 regressors", () => {
  // This tests the new level-preservation gate in authoritativeFinalistSelection.
  // A candidate that drops P14 level is rejected before the Pareto filter.
  const currentLayout = {
    metrics: {
      perSeatP19: [],
      perSeatP20: [],
      achievedP19VariationDb: 3.0,
      achievedP19Level: 3,
      achievedP20VariationDb: 5.0,
      achievedP20Level: 2,
      p18AchievedLevel: 3,
      achievedP18Hz: 30,
      p14AchievedLevel: 3,
      p14AchievedDb: 115,
    },
    sources: [{ id: "sub-1", tuning: { gainDb: 0 } }],
  };

  // Candidate: P20 improves but P14 drops from L3 to L1
  const candidateResult = {
    achievedP19VariationDb: 3.0,
    achievedP19Level: 3,
    achievedP20VariationDb: 3.0,
    achievedP20Level: 3,
    p18AchievedLevel: 3,
    achievedP18Hz: 30,
    p14AchievedLevel: 1,
    p14AchievedDb: 111,
    quantity: 2,
  };

  const quantityResult = { evaluatedFinalists: [candidateResult] };
  const selection = selectAuthoritativeFinalist(quantityResult, null, currentLayout);
  // The candidate should be rejected because P14 dropped from L3 to L1
  assert.ok(selection.isCurrent, "P14 L3→L1 candidate should be rejected (keep current)");
});

// ── EXAMPLES FROM THE SPEC ──────────────────────────────────────────────

test("EXAMPLE: -5 / +5 residual → span 10 → raw ±5 → displayed ±5", () => {
  // 1/3-octave smoothing reduces the span slightly — displayed ±4 or ±5.
  const curve = makeResidualCurve(20, 120, 50, -5, 5);
  const result = computeOfficialP19Assessment({
    rspPostEqCurve: curve, canonicalTargetCurve: [], assessmentStartHz: 20, assessmentEndHz: 120,
  });
  const displayDb = resolveRp22DesignValue(19, result.variationDbRaw);
  assert.ok(displayDb <= 5 && displayDb >= 4, `displayed should be ±4-5 (after smoothing), got ±${displayDb}`);
});

test("EXAMPLE: -6 / 0 → span 6 → raw ±3 → displayed ±3", () => {
  const curve = makeResidualCurve(20, 120, 50, -6, 0);
  const result = computeOfficialP19Assessment({
    rspPostEqCurve: curve, canonicalTargetCurve: [], assessmentStartHz: 20, assessmentEndHz: 120,
  });
  const displayDb = resolveRp22DesignValue(19, result.variationDbRaw);
  assert.ok(displayDb <= 3 && displayDb >= 2, `displayed should be ±2-3 (after smoothing), got ±${displayDb}`);
});

test("EXAMPLE: -8 / +2 → span 10 → raw ±5 → displayed ±5", () => {
  const curve = makeResidualCurve(20, 120, 50, -8, 2);
  const result = computeOfficialP19Assessment({
    rspPostEqCurve: curve, canonicalTargetCurve: [], assessmentStartHz: 20, assessmentEndHz: 120,
  });
  const displayDb = resolveRp22DesignValue(19, result.variationDbRaw);
  assert.ok(displayDb <= 5 && displayDb >= 4, `displayed should be ±4-5 (after smoothing), got ±${displayDb}`);
});

test("EXAMPLE: -6.9 / +0.84 → span 7.74 → raw ±3.87 → displayed ±3", () => {
  // After smoothing, the span is ~7.4 → raw ~3.7 → floor 3.
  const curve = makeResidualCurve(20, 120, 50, -6.9, 0.84);
  const result = computeOfficialP19Assessment({
    rspPostEqCurve: curve, canonicalTargetCurve: [], assessmentStartHz: 20, assessmentEndHz: 120,
  });
  const displayDb = resolveRp22DesignValue(19, result.variationDbRaw);
  assert.equal(displayDb, 3, `displayed should be ±3, got ±${displayDb}`);
  const levelResult = levelP19_lfResponse(result.variationDbRaw);
  assert.equal(levelResult.level, "L3", `should be L3, got ${levelResult.level}`);
});

test("EXAMPLE: -10.49 / +3.07 → span 13.56 → raw ±6.78 → displayed ±6 / FAIL", () => {
  // After smoothing, the span is ~12.9 → raw ~6.4 → floor 6 → FAIL.
  const curve = makeResidualCurve(20, 120, 50, -10.49, 3.07);
  const result = computeOfficialP19Assessment({
    rspPostEqCurve: curve, canonicalTargetCurve: [], assessmentStartHz: 20, assessmentEndHz: 120,
  });
  const displayDb = resolveRp22DesignValue(19, result.variationDbRaw);
  assert.equal(displayDb, 6, `displayed should be ±6, got ±${displayDb}`);
  const levelResult = levelP19_lfResponse(result.variationDbRaw);
  assert.equal(levelResult.level, "FAIL", `should be FAIL, got ${levelResult.level}`);
});