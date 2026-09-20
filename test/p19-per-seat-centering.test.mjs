// test/p19-per-seat-centering.test.mjs
//
// Regression tests for per-seat P19 target centering.
//
// Per-seat P19 centers the residual (response − canonical target) analytically
// so P19 measures response-SHAPE deviation (minimax ±), not absolute-level error.
//
// The raw primitive evaluateP19AbsoluteTargetDeviation is UNCHANGED — it still
// computes one-sided max|residual| for the RSP path and the fitter. Only the
 * per-seat canonical path (computeOfficialPerSeatP19Assessment) applies centering.
//
// Run: node --import ./test/_alias-register.mjs test/p19-per-seat-centering.test.mjs

import test from "node:test";
import assert from "node:assert/strict";

import { computeOfficialP19Assessment, computeOfficialP20Assessment, computeOfficialPerSeatP19Assessment } from "@/components/utils/bassAuthoritativeAssessment";
import { evaluateP19AbsoluteTargetDeviation, centerResidualForP19Assessment } from "@/components/utils/p19AbsoluteTargetDeviation";
import { levelP19_lfResponse } from "@/components/utils/rp22/levels";
import { resolveRp22DesignValue } from "@/components/utils/rp22/resolveRp22DesignValue";
import { artcousticHouseCurveOffsetAt } from "@/components/utils/artcousticHouseCurve";

// ── Helpers ──────────────────────────────────────────────────────────────

function makeFreqGrid(startHz, endHz, count) {
  const points = [];
  for (let i = 0; i < count; i++) {
    const f = startHz * Math.pow(endHz / startHz, i / (count - 1));
    points.push({ frequency: f, spl: 0 });
  }
  return points;
}

// Build a response curve where residual = response - target varies between
// minResidual and maxResidual across the band. Target is flat at levelDb.
function makeResidualCurveAgainstFlatTarget(startHz, endHz, count, minResidual, maxResidual, levelDb = 100) {
  const points = [];
  for (let i = 0; i < count; i++) {
    const f = startHz * Math.pow(endHz / startHz, i / (count - 1));
    const t = i / (count - 1);
    const residual = minResidual + (maxResidual - minResidual) * t;
    points.push({ frequency: f, spl: levelDb + residual });
  }
  return points;
}

function makeFlatTarget(startHz, endHz, count, levelDb = 100) {
  const points = [];
  for (let i = 0; i < count; i++) {
    const f = startHz * Math.pow(endHz / startHz, i / (count - 1));
    points.push({ frequency: f, spl: levelDb });
  }
  return points;
}

// Build a response curve that follows the house-curve shape with a residual
// ramp from minResidual to maxResidual.
function makeResidualCurveAgainstHouseTarget(startHz, endHz, count, minResidual, maxResidual, levelDb = 100) {
  const points = [];
  for (let i = 0; i < count; i++) {
    const f = startHz * Math.pow(endHz / startHz, i / (count - 1));
    const shape = artcousticHouseCurveOffsetAt(f);
    const t = i / (count - 1);
    const residual = minResidual + (maxResidual - minResidual) * t;
    points.push({ frequency: f, spl: levelDb + shape + residual });
  }
  return points;
}

function makeHouseTarget(startHz, endHz, count, levelDb = 100) {
  const points = [];
  for (let i = 0; i < count; i++) {
    const f = startHz * Math.pow(endHz / startHz, i / (count - 1));
    points.push({ frequency: f, spl: levelDb + artcousticHouseCurveOffsetAt(f) });
  }
  return points;
}

// ── TEST A: flat target, residuals +2 / -6 → centered ±4 ──────────────────

test("TEST A: flat target, residuals +2 / -6 → centered result ±4", () => {
  // Response residual spans from -6 to +2 against a flat target.
  // One-sided max|residual| = 6 → FAIL.
  // Centered: (2 - (-6)) / 2 = 4 → L2.
  const target = makeFlatTarget(20, 120, 50, 100);
  const curve = makeResidualCurveAgainstFlatTarget(20, 120, 50, -6, 2, 100);
  const perSeat = [{ seatId: "R1S2", responseData: curve }];

  const results = computeOfficialPerSeatP19Assessment({
    perSeatPostEqCurves: perSeat,
    canonicalTargetCurve: target,
    assessmentStartHz: 20,
    assessmentEndHz: 120,
  });

  assert.equal(results.length, 1, "should have 1 seat result");
  const seat = results[0];
  const displayDb = resolveRp22DesignValue(19, seat.variationDbRaw);
  assert.ok(displayDb === 4,
    `centered P19 should display ±4 (L2), got ±${displayDb}`);
  const levelResult = levelP19_lfResponse(seat.variationDbRaw);
  assert.equal(levelResult.level, "L2",
    `centered P19 should be L2, got ${levelResult.level}`);
  // centeringDb = -(2 + (-6)) / 2 = -(-4)/2 = 2
  assert.ok(Math.abs(seat.centeringDb - 2) < 0.05,
    `centeringDb should be ~+2 dB, got ${seat.centeringDb}`);
});

// ── TEST B: sloped target → centre response-minus-target residual ─────────

test("TEST B: sloped (house-curve) target → centre residual, NOT raw SPL span", () => {
  // Response follows the house-curve shape exactly (residual = 0) plus a
  // ramp from -6 to +2. Raw SPL span includes the house-curve slope, but
  // the residual span is only 8 dB → centered ±4.
  const target = makeHouseTarget(20, 120, 50, 100);
  const curve = makeResidualCurveAgainstHouseTarget(20, 120, 50, -6, 2, 100);
  const perSeat = [{ seatId: "R1S2", responseData: curve }];

  const results = computeOfficialPerSeatP19Assessment({
    perSeatPostEqCurves: perSeat,
    canonicalTargetCurve: target,
    assessmentStartHz: 20,
    assessmentEndHz: 120,
  });

  const seat = results[0];
  const displayDb = resolveRp22DesignValue(19, seat.variationDbRaw);
  assert.ok(displayDb === 4,
    `centered P19 against sloped target should display ±4, got ±${displayDb}`);
  assert.equal(levelP19_lfResponse(seat.variationDbRaw).level, "L2",
    `should be L2, got ${levelP19_lfResponse(seat.variationDbRaw).level}`);
});

// ── TEST C: constant +3 dB vertical shift → same centered P19 ─────────────

test("TEST C: constant +3 dB vertical shift of seat curve → same centered P19", () => {
  const target = makeFlatTarget(20, 120, 50, 100);
  const baseCurve = makeResidualCurveAgainstFlatTarget(20, 120, 50, -6, 2, 100);
  const shiftedCurve = baseCurve.map((p) => ({ frequency: p.frequency, spl: p.spl + 3 }));

  const baseResults = computeOfficialPerSeatP19Assessment({
    perSeatPostEqCurves: [{ seatId: "s1", responseData: baseCurve }],
    canonicalTargetCurve: target,
    assessmentStartHz: 20,
    assessmentEndHz: 120,
  });
  const shiftedResults = computeOfficialPerSeatP19Assessment({
    perSeatPostEqCurves: [{ seatId: "s1", responseData: shiftedCurve }],
    canonicalTargetCurve: target,
    assessmentStartHz: 20,
    assessmentEndHz: 120,
  });

  assert.ok(
    Math.abs(baseResults[0].variationDbRaw - shiftedResults[0].variationDbRaw) < 0.01,
    `constant shift should not change centered P19: base=${baseResults[0].variationDbRaw}, shifted=${shiftedResults[0].variationDbRaw}`,
  );
  assert.equal(baseResults[0].level, shiftedResults[0].level,
    "level should be unchanged by constant shift");
});

// ── TEST D: response-shape change → P19 changes ──────────────────────────

test("TEST D: response-shape change → P19 changes", () => {
  const target = makeFlatTarget(20, 120, 50, 100);
  const smallSpan = makeResidualCurveAgainstFlatTarget(20, 120, 50, -2, 2, 100);
  const largeSpan = makeResidualCurveAgainstFlatTarget(20, 120, 50, -6, 2, 100);

  const smallResults = computeOfficialPerSeatP19Assessment({
    perSeatPostEqCurves: [{ seatId: "s1", responseData: smallSpan }],
    canonicalTargetCurve: target,
    assessmentStartHz: 20,
    assessmentEndHz: 120,
  });
  const largeResults = computeOfficialPerSeatP19Assessment({
    perSeatPostEqCurves: [{ seatId: "s1", responseData: largeSpan }],
    canonicalTargetCurve: target,
    assessmentStartHz: 20,
    assessmentEndHz: 120,
  });

  assert.ok(smallResults[0].variationDbRaw < largeResults[0].variationDbRaw,
    `larger residual span → larger centered P19: small=${smallResults[0].variationDbRaw}, large=${largeResults[0].variationDbRaw}`);
});

// ── TEST E: RSP P19 unchanged ─────────────────────────────────────────────

test("TEST E: RSP P19 unchanged (still one-sided max-abs via computeOfficialP19Assessment)", () => {
  // The RSP path uses computeOfficialP19Assessment which calls the raw
  // primitive evaluateP19AbsoluteTargetDeviation — NOT centered.
  // A -6/+2 residual → max|residual| = 6 → FAIL (one-sided, unchanged).
  const target = makeFlatTarget(20, 120, 50, 100);
  const curve = makeResidualCurveAgainstFlatTarget(20, 120, 50, -6, 2, 100);

  const rspResult = computeOfficialP19Assessment({
    rspPostEqCurve: curve,
    canonicalTargetCurve: target,
    assessmentStartHz: 20,
    assessmentEndHz: 120,
  });

  const displayDb = resolveRp22DesignValue(19, rspResult.variationDbRaw);
  assert.ok(displayDb >= 5,
    `RSP P19 should still be one-sided (≥ ±5 / FAIL), got ±${displayDb}`);
  assert.equal(levelP19_lfResponse(rspResult.variationDbRaw).level, "FAIL",
    `RSP P19 should be FAIL (one-sided unchanged), got ${levelP19_lfResponse(rspResult.variationDbRaw).level}`);
});

// ── TEST F: P20 unchanged ─────────────────────────────────────────────────

test("TEST F: P20 unchanged (seat-to-RSP, not target-relative)", () => {
  const rspCurve = makeFlatTarget(20, 120, 50, 100);
  // Seat is 8 dB above RSP at all frequencies
  const seatCurve = rspCurve.map((p) => ({ frequency: p.frequency, spl: p.spl + 8 }));

  const p20 = computeOfficialP20Assessment({
    rspPostEqCurve: rspCurve,
    perSeatPostEqCurves: [{ seatId: "s1", responseData: seatCurve }],
    assessmentStartHz: 20,
    assessmentEndHz: 120,
  });

  assert.ok(p20.available, "P20 should be available");
  assert.ok(Math.abs(p20.worstSeat.variationDbRaw - 8) < 0.01,
    `P20 should be ~8 dB (seat-to-RSP), got ${p20.worstSeat.variationDbRaw}`);
});

// ── TEST G: protected null does not affect centering ──────────────────────

test("TEST G: protected null does not affect centering", () => {
  const target = makeFlatTarget(20, 120, 200, 100);
  // Response: residual ramp from -4 to +4, with a -15 dB narrow null at 50 Hz.
  const curve = [];
  for (let i = 0; i < 200; i++) {
    const f = 20 + i * 0.5;
    const t = i / 199;
    const residual = -4 + 8 * t;
    const nullDepth = (f >= 46 && f <= 54) ? -15 : 0;
    curve.push({ frequency: f, spl: 100 + residual + nullDepth });
  }
  const protectedNullRegions = [{
    startHz: 46, endHz: 54,
    centreFrequencyHz: 50,
    protected: true,
    narrowCancellation: true,
  }];

  const withoutProtection = computeOfficialPerSeatP19Assessment({
    perSeatPostEqCurves: [{ seatId: "s1", responseData: curve }],
    canonicalTargetCurve: target,
    assessmentStartHz: 20,
    assessmentEndHz: 120,
  });
  const withProtection = computeOfficialPerSeatP19Assessment({
    perSeatPostEqCurves: [{ seatId: "s1", responseData: curve }],
    canonicalTargetCurve: target,
    assessmentStartHz: 20,
    assessmentEndHz: 120,
    protectedNullRegions,
  });

  // Without protection: the null inflates the residual span → larger P19.
  // With protection: the null is excluded → centered P19 ≈ ±4 (the ramp span).
  const protectedDisplay = resolveRp22DesignValue(19, withProtection[0].variationDbRaw);
  const unprotectedDisplay = resolveRp22DesignValue(19, withoutProtection[0].variationDbRaw);
  assert.ok(protectedDisplay <= 5,
    `protected null should not inflate centered P19 (≤ ±5), got ±${protectedDisplay}`);
  assert.ok(unprotectedDisplay > protectedDisplay,
    `unprotected should be worse than protected: unprotected=${unprotectedDisplay}, protected=${protectedDisplay}`);
});

// ── TEST H: worst frequency comes from centered residual ─────────────────

test("TEST H: worst frequency comes from centered residual", () => {
  // Residual ramp from -6 to +2. centeringDb = +2.
  // Centered: -6+2=-4 (abs 4), +2+2=+4 (abs 4). Both extremes are the worst.
  // The worst frequency should be at one of the extreme residual frequencies.
  const target = makeFlatTarget(20, 120, 50, 100);
  const curve = makeResidualCurveAgainstFlatTarget(20, 120, 50, -6, 2, 100);

  const results = computeOfficialPerSeatP19Assessment({
    perSeatPostEqCurves: [{ seatId: "s1", responseData: curve }],
    canonicalTargetCurve: target,
    assessmentStartHz: 20,
    assessmentEndHz: 120,
  });

  const seat = results[0];
  assert.ok(seat.worstFrequencyHz != null, "worst frequency should be populated");
  // The worst frequency should NOT be at the midpoint (where residual ≈ -2,
  // centered ≈ 0). It should be at one of the band extremes.
  const midpointFreq = 20 * Math.sqrt(120 / 20); // geometric midpoint
  assert.ok(
    Math.abs(seat.worstFrequencyHz - 20) < 1 || Math.abs(seat.worstFrequencyHz - 120) < 1,
    `worst frequency should be at a band extreme (20 or 120 Hz), got ${seat.worstFrequencyHz}`,
  );
});

// ── TEST I: R1S2 fixture no longer reports old one-sided FAIL ─────────────

test("TEST I: R1S2-style fixture (8 dB span, offset) → centered L2, not one-sided FAIL", () => {
  // Simulates the R1S2 case: ~8.2 dB residual span with a seat-specific offset.
  // Residual from -6 to +2.2 (span 8.2, one-sided max = 6 → FAIL).
  // Centered: (2.2 - (-6)) / 2 = 4.1 → floor 4 → L2.
  const target = makeFlatTarget(20, 120, 50, 100);
  const curve = makeResidualCurveAgainstFlatTarget(20, 120, 50, -6, 2.2, 100);

  const results = computeOfficialPerSeatP19Assessment({
    perSeatPostEqCurves: [{ seatId: "R1S2", responseData: curve }],
    canonicalTargetCurve: target,
    assessmentStartHz: 20,
    assessmentEndHz: 120,
  });

  const seat = results[0];
  const displayDb = resolveRp22DesignValue(19, seat.variationDbRaw);
  assert.ok(displayDb === 4,
    `R1S2-style fixture should display ±4 (L2) after centering, got ±${displayDb}`);
  assert.equal(levelP19_lfResponse(seat.variationDbRaw).level, "L2",
    `R1S2-style fixture should be L2, got ${levelP19_lfResponse(seat.variationDbRaw).level}`);
  // Confirm the old one-sided path would have been FAIL
  const rawResult = evaluateP19AbsoluteTargetDeviation({
    rspPostEqCurve: curve,
    canonicalTargetCurve: target,
    assessmentStartHz: 20,
    assessmentEndHz: 120,
  });
  const rawDisplay = resolveRp22DesignValue(19, rawResult.variationDbRaw);
  assert.ok(rawDisplay >= 5,
    `raw one-sided should still be ≥ ±5 (FAIL), got ±${rawDisplay}`);
});

// ── TEST J: downstream seat summaries consume corrected canonical P19 ────

test("TEST J: perSeatP19Results from computeOfficialPerSeatP19Assessment carry centered values", () => {
  // Verifies that the canonical per-seat P19 function returns centered
  // variationDbRaw, level, worstFrequencyHz, and centeringDb — the fields
  // downstream consumers (Design Rating, Compliance, Visual Report, etc.)
  // read. No consumer should reconstruct a one-sided value.
  const target = makeFlatTarget(20, 120, 50, 100);
  const curve = makeResidualCurveAgainstFlatTarget(20, 120, 50, -6, 2, 100);

  const results = computeOfficialPerSeatP19Assessment({
    perSeatPostEqCurves: [{ seatId: "R1S2", responseData: curve }],
    canonicalTargetCurve: target,
    assessmentStartHz: 20,
    assessmentEndHz: 120,
  });

  const seat = results[0];
  assert.ok(Number.isFinite(seat.variationDbRaw), "variationDbRaw should be finite");
  assert.ok(Number.isFinite(seat.level), "level should be finite");
  assert.ok(Number.isFinite(seat.worstFrequencyHz), "worstFrequencyHz should be finite");
  assert.ok(Number.isFinite(seat.centeringDb), "centeringDb should be finite (diagnostic)");
  assert.ok(seat.variationDbRaw < 5,
    `centered variationDbRaw should be < 5 (not FAIL), got ${seat.variationDbRaw}`);
});

// ── TEST: centerResidualForP19Assessment helper directly ──────────────────

test("HELPER: centerResidualForP19Assessment computes minimax centering", () => {
  // Build a residual curve manually: residuals from -6 to +2
  const residualCurve = [];
  for (let i = 0; i < 10; i++) {
    const f = 20 + i * 10;
    const r = -6 + (8 * i) / 9;
    residualCurve.push({ frequency: f, residualDb: r, protected: false });
  }

  const centered = centerResidualForP19Assessment(residualCurve);
  assert.ok(centered, "should return a result");
  assert.ok(Math.abs(centered.maxResidualDb - 2) < 0.01, `maxResidual ~2, got ${centered.maxResidualDb}`);
  assert.ok(Math.abs(centered.minResidualDb - (-6)) < 0.01, `minResidual ~-6, got ${centered.minResidualDb}`);
  assert.ok(Math.abs(centered.centeringDb - 2) < 0.01, `centeringDb ~+2, got ${centered.centeringDb}`);
  assert.ok(Math.abs(centered.variationDbRaw - 4) < 0.01, `variationDbRaw ~4, got ${centered.variationDbRaw}`);
});

test("HELPER: centerResidualForP19Assessment excludes protected points", () => {
  // Residuals: -4 to +4, but with a -15 dB protected null at 50 Hz
  const residualCurve = [];
  for (let i = 0; i < 20; i++) {
    const f = 20 + i * 5;
    const t = i / 19;
    const r = -4 + 8 * t;
    const isProtected = f >= 46 && f <= 54;
    const finalR = isProtected ? r - 15 : r;
    residualCurve.push({ frequency: f, residualDb: finalR, protected: isProtected });
  }

  const centered = centerResidualForP19Assessment(residualCurve);
  // Protected points excluded → max ~+4, min ~-4 → centered ±4
  assert.ok(Math.abs(centered.variationDbRaw - 4) < 0.01,
    `protected excluded → centered ±4, got ${centered.variationDbRaw}`);
  assert.ok(Math.abs(centered.maxResidualDb - 4) < 0.01,
    `maxResidual should be +4 (protected excluded), got ${centered.maxResidualDb}`);
  assert.ok(Math.abs(centered.minResidualDb - (-4)) < 0.01,
    `minResidual should be -4 (protected excluded), got ${centered.minResidualDb}`);
});