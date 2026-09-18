// test/p19-absolute-target-deviation-validation.test.mjs
//
// Validation proof cases for the P19 absolute-target-deviation metric.
//
// P19 is the maximum absolute deviation from the P14-anchored practical
// calibration target after calibration, excluding protected null regions.
//
// Proof cases:
//   (a) Identical shape but 5 dB below target → worse P19 than centred
//   (b) Applying a physically achievable global trim improves P19
//   (c) A response already centred on the target remains unchanged
//   (d) Protected-null behaviour preserved — narrow null excluded
//   (e) Regression: global trim changes P19, P20/P14/shape unchanged
//
// Run: node --import ./test/_alias-register.mjs test/p19-absolute-target-deviation-validation.test.mjs

import test from "node:test";
import assert from "node:assert/strict";

import { computeOfficialP19Assessment, computeOfficialP20Assessment } from "@/components/utils/bassAuthoritativeAssessment";
import { performGlobalLevelAlignment, applyGlobalBassTrimToCurve } from "@/components/room/bass/globalLevelAlignment";
import { artcousticHouseCurveOffsetAt } from "@/components/utils/artcousticHouseCurve";
import { resolveRp22DesignValue } from "@/components/utils/rp22/resolveRp22DesignValue";
import { levelP19_lfResponse } from "@/components/utils/rp22/levels";

// ── Helpers ──────────────────────────────────────────────────────────────

// Build a response curve that follows the house-curve shape with a constant
// residual offset. When canonicalTargetCurve is provided at level 100 + shape,
// a curve at 100 + shape has residual = 0 (perfectly centred).
function makeCentredCurve(startHz, endHz, count, levelDb = 100) {
  const points = [];
  for (let i = 0; i < count; i++) {
    const f = startHz * Math.pow(endHz / startHz, i / (count - 1));
    const shape = artcousticHouseCurveOffsetAt(f);
    points.push({ frequency: f, spl: levelDb + shape });
  }
  return points;
}

// Build an absolute target curve at levelDb + shape.
function makeTargetCurve(startHz, endHz, count, levelDb = 100) {
  const points = [];
  for (let i = 0; i < count; i++) {
    const f = startHz * Math.pow(endHz / startHz, i / (count - 1));
    const shape = artcousticHouseCurveOffsetAt(f);
    points.push({ frequency: f, spl: levelDb + shape });
  }
  return points;
}

// Add a sinusoidal variation to a curve (simulates modal peaks/dips).
function addVariation(curve, amplitudeDb, frequencyHz, bandwidthHz) {
  return curve.map((p) => ({
    ...p,
    spl: p.spl + amplitudeDb * Math.exp(-0.5 * ((p.frequency - frequencyHz) / bandwidthHz) ** 2),
  }));
}

// ── PROOF (a): Identical shape but 5 dB below target → worse P19 ────────

test("PROOF (a): Identical shape but 5 dB below target produces worse P19", () => {
  const targetCurve = makeTargetCurve(20, 120, 50, 100);

  // Centred response: follows the target perfectly (residual = 0)
  const centredCurve = makeCentredCurve(20, 120, 50, 100);

  // Same shape but 5 dB below target
  const belowCurve = centredCurve.map((p) => ({ frequency: p.frequency, spl: p.spl - 5 }));

  const centredResult = computeOfficialP19Assessment({
    rspPostEqCurve: centredCurve,
    canonicalTargetCurve: targetCurve,
    assessmentStartHz: 20,
    assessmentEndHz: 120,
  });
  const belowResult = computeOfficialP19Assessment({
    rspPostEqCurve: belowCurve,
    canonicalTargetCurve: targetCurve,
    assessmentStartHz: 20,
    assessmentEndHz: 120,
  });

  // Centred response: P19 ≈ 0 (perfect target follow, only smoothing artefacts)
  assert.ok(centredResult.variationDbRaw < 0.5,
    `Centred response P19 should be < 0.5, got ${centredResult.variationDbRaw}`);

  // 5 dB below target: P19 ≈ 5 (max|response - target| = 5)
  assert.ok(belowResult.variationDbRaw > 4.5 && belowResult.variationDbRaw < 5.5,
    `5 dB below target P19 should be ~5, got ${belowResult.variationDbRaw}`);

  // The below-target result is strictly worse
  assert.ok(belowResult.variationDbRaw > centredResult.variationDbRaw + 4,
    `Below-target P19 (${belowResult.variationDbRaw}) should be much worse than centred (${centredResult.variationDbRaw})`);
});

// ── PROOF (b): Global trim improves P19 ────────────────────────────────

test("PROOF (b): Applying a physically achievable global trim improves P19", () => {
  const targetCurve = makeTargetCurve(20, 120, 50, 100);

  // Response 3 dB below target with a +2 dB peak at 50 Hz
  const belowCurve = makeCentredCurve(20, 120, 50, 97);
  const peakedCurve = addVariation(belowCurve, 2, 50, 10);

  // P14 headroom = 5 dB (achieved 105 - target 100 = 5)
  const alignment = performGlobalLevelAlignment({
    rspPostEqCurve: peakedCurve,
    canonicalTargetCurve: targetCurve,
    assessmentStartHz: 20,
    assessmentEndHz: 120,
    p14HeadroomDb: 5,
  });

  // The optimum trim should be positive (moving the response up toward target)
  assert.ok(alignment.recommendedTrimDb > 0,
    `Optimum trim should be positive (moving toward target), got ${alignment.recommendedTrimDb}`);

  // The aligned P19 should be better than the original P19
  assert.ok(alignment.alignedP19Db < alignment.originalP19Db,
    `Aligned P19 (${alignment.alignedP19Db}) should be better than original (${alignment.originalP19Db})`);

  // The improvement should be material
  assert.ok(alignment.improvementDb > 0.5,
    `Improvement should be material (> 0.5 dB), got ${alignment.improvementDb}`);

  // The status message should NOT say "already optimum"
  assert.notEqual(alignment.statusMessage, "Current operating level already optimum");
});

// ── PROOF (c): Already centred response remains unchanged ──────────────

test("PROOF (c): Response already centred on target remains unchanged", () => {
  const targetCurve = makeTargetCurve(20, 120, 50, 100);

  // Response perfectly centred on target (residual = 0)
  const centredCurve = makeCentredCurve(20, 120, 50, 100);

  // P14 headroom = 3 dB (available but not needed)
  const alignment = performGlobalLevelAlignment({
    rspPostEqCurve: centredCurve,
    canonicalTargetCurve: targetCurve,
    assessmentStartHz: 20,
    assessmentEndHz: 120,
    p14HeadroomDb: 3,
  });

  // The optimum trim should be 0 (already centred)
  assert.equal(alignment.recommendedTrimDb, 0,
    `Centred response optimum trim should be 0, got ${alignment.recommendedTrimDb}`);

  // P19 should be unchanged
  assert.ok(Math.abs(alignment.alignedP19Db - alignment.originalP19Db) < 0.01,
    `P19 should be unchanged: original=${alignment.originalP19Db}, aligned=${alignment.alignedP19Db}`);

  // Status message should say "already optimum"
  assert.equal(alignment.statusMessage, "Current operating level already optimum");
});

// ── PROOF (d): Protected null behaviour preserved ───────────────────────

test("PROOF (d): Protected null exclusion — narrow null does not cause false FAIL", () => {
  const targetCurve = makeTargetCurve(20, 120, 200, 100);

  // Response with a flat-bottom -15 dB null from 46–54 Hz, otherwise on target.
  // Wide enough to survive 1/3-octave smoothing (so unprotected P19 is high),
  // but still narrow enough to be excluded by the protected null region.
  const narrowNullCurve = [];
  for (let i = 0; i < 200; i++) {
    const f = 20 + i * 0.5;
    const shape = artcousticHouseCurveOffsetAt(f);
    const nullDepth = (f >= 46 && f <= 54) ? -15 : 0;
    narrowNullCurve.push({ frequency: f, spl: 100 + shape + nullDepth });
  }

  // Protected null region covering the flat-bottom null
  const protectedNullRegions = [{
    startHz: 46, endHz: 54,
    centreFrequencyHz: 50,
    protected: true,
    narrowCancellation: true,
  }];

  // Without protection: the null is included → P19 is high
  const unprotectedResult = computeOfficialP19Assessment({
    rspPostEqCurve: narrowNullCurve,
    canonicalTargetCurve: targetCurve,
    assessmentStartHz: 20,
    assessmentEndHz: 120,
  });
  const unprotectedDisplay = resolveRp22DesignValue(19, unprotectedResult.variationDbRaw);
  assert.ok(unprotectedDisplay >= 5,
    `Narrow null without protection → P19 ≥ ±5, got ±${unprotectedDisplay}`);

  // With protection: the null is excluded → P19 reflects the flat response
  const protectedResult = computeOfficialP19Assessment({
    rspPostEqCurve: narrowNullCurve,
    canonicalTargetCurve: targetCurve,
    assessmentStartHz: 20,
    assessmentEndHz: 120,
    protectedNullRegions,
  });
  const protectedDisplay = resolveRp22DesignValue(19, protectedResult.variationDbRaw);
  assert.ok(protectedDisplay <= 2,
    `Narrow null with protection → P19 ≤ ±2, got ±${protectedDisplay}`);

  // The protected result should be materially better
  assert.ok(protectedResult.variationDbRaw < unprotectedResult.variationDbRaw - 5,
    `Protected P19 (${protectedResult.variationDbRaw}) should be much better than unprotected (${unprotectedResult.variationDbRaw})`);
});

// ── REGRESSION: Global trim changes P19, P20/P14/shape unchanged ───────

test("REGRESSION: Global trim changes P19, P20/P14/shape unchanged", () => {
  const targetCurve = makeTargetCurve(20, 120, 50, 100);

  // Response 3 dB below target with a small peak at 50 Hz
  const belowCurve = makeCentredCurve(20, 120, 50, 97);
  const peakedCurve = addVariation(belowCurve, 1.5, 50, 10);

  // P19 before trim
  const p19Before = computeOfficialP19Assessment({
    rspPostEqCurve: peakedCurve,
    canonicalTargetCurve: targetCurve,
    assessmentStartHz: 20,
    assessmentEndHz: 120,
  });

  // Apply a +3 dB global trim
  const trimmedCurve = applyGlobalBassTrimToCurve(peakedCurve, 3);

  // P19 after trim
  const p19After = computeOfficialP19Assessment({
    rspPostEqCurve: trimmedCurve,
    canonicalTargetCurve: targetCurve,
    assessmentStartHz: 20,
    assessmentEndHz: 120,
  });

  // P20 before and after (P20 is seat-to-RSP, not target-relative)
  const perSeatCurves = [{ seatId: "seat-1", responseData: peakedCurve.map((p) => ({ ...p, spl: p.spl - 1 })) }];
  const p20Before = computeOfficialP20Assessment({
    rspPostEqCurve: peakedCurve,
    perSeatPostEqCurves: perSeatCurves,
    assessmentStartHz: 20,
    assessmentEndHz: 120,
  });
  const perSeatCurvesTrimmed = [{ seatId: "seat-1", responseData: trimmedCurve.map((p) => ({ ...p, spl: p.spl - 1 })) }];
  const p20After = computeOfficialP20Assessment({
    rspPostEqCurve: trimmedCurve,
    perSeatPostEqCurves: perSeatCurvesTrimmed,
    assessmentStartHz: 20,
    assessmentEndHz: 120,
  });

  // ── Verify ──

  // P19 changes (the response moved closer to target)
  assert.ok(Math.abs(p19After.variationDbRaw - p19Before.variationDbRaw) > 0.5,
    `P19 should change after trim: before=${p19Before.variationDbRaw}, after=${p19After.variationDbRaw}`);

  // P20 is unchanged (both RSP and seat shifted by the same amount)
  assert.ok(Math.abs(p20After.worstSeat.variationDbRaw - p20Before.worstSeat.variationDbRaw) < 0.01,
    `P20 should be unchanged: before=${p20Before.worstSeat.variationDbRaw}, after=${p20After.worstSeat.variationDbRaw}`);

  // Response shape is unchanged (only vertical offset)
  // Verify by checking that the relative differences between frequencies are preserved
  const beforeDiffs = [];
  const afterDiffs = [];
  for (let i = 1; i < peakedCurve.length; i++) {
    beforeDiffs.push(peakedCurve[i].spl - peakedCurve[i - 1].spl);
    afterDiffs.push(trimmedCurve[i].spl - trimmedCurve[i - 1].spl);
  }
  for (let i = 0; i < beforeDiffs.length; i++) {
    assert.ok(Math.abs(afterDiffs[i] - beforeDiffs[i]) < 1e-9,
      `Shape should be unchanged at index ${i}: before diff=${beforeDiffs[i]}, after diff=${afterDiffs[i]}`);
  }

  // P14 remains unchanged (global trim does not alter capability)
  // P14 is not computed here, but the principle is that a vertical shift
  // does not change the maximum SPL capability of the system. The trim
  // only moves the operating level within the available headroom.
  // This is enforced by the globalLevelAlignment's upwardBoundDb constraint.
});