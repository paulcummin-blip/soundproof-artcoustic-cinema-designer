// Per-Seat Product-Limit Attenuation — Anti-Cheat / Physical Tests (A–J)
//
// Tests that the common RSP product-limit attenuation mapping:
//   A. Two seats with different room transfer retain that difference
//   B. Two coincident seats remain coincident
//   C. A seat 11 mm from RSP remains near-identical to RSP
//   D. Common attenuation never increases seat SPL
//   E. Seat result never exceeds its own capability ceiling
//   F. Where RSP product envelope does not bind: attenuation = 0, seat unchanged
//   G. Where RSP product envelope binds by 5 dB: every seat loses 5 dB
//   H. P20 differences are preserved when same attenuation applied to RSP and seats
//   I. RSP final response remains unchanged (RSP path still uses absolute envelope)
//   J. Attenuation is never negative (never boosts)
//
// Run: node --import ./test/_alias-register.mjs --test test/per-seat-product-limit-attenuation.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildProductLimitAttenuationCurve,
  interpolateAttenuationDb,
  applyProductLimitAttenuation,
} from "../src/components/utils/canonicalBassOptimiser.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function curveFromPoints(points) {
  return points.map(([frequency, spl]) => ({ frequency, spl }));
}

const RSP_GRID = [15, 15.44, 20, 25, 31.5, 40, 50, 63, 80, 100, 120];

// RSP before product envelope (after trim, EQ, physical max clamp).
// At 15 Hz the response is high (105 dB); the product envelope will pull it down.
const RSP_BEFORE = curveFromPoints([
  [15, 105.0], [15.44, 104.8], [20, 103.0], [25, 102.0],
  [31.5, 101.0], [40, 100.5], [50, 100.0], [63, 100.0],
  [80, 100.0], [100, 100.0], [120, 100.0],
]);

// RSP after product envelope — 5 dB loss at 15 and 15.44 Hz, 0 elsewhere.
const RSP_AFTER = curveFromPoints([
  [15, 100.0], [15.44, 99.8], [20, 103.0], [25, 102.0],
  [31.5, 101.0], [40, 100.5], [50, 100.0], [63, 100.0],
  [80, 100.0], [100, 100.0], [120, 100.0],
]);

// Two seats with DIFFERENT room transfer at 15 Hz.
// Seat A: 106 dB (room gain). Seat B: 103 dB (room loss).
// Both are above the RSP envelope ceiling (100 dB) at 15 Hz.
const SEAT_A = curveFromPoints([
  [15, 106.0], [15.44, 105.8], [20, 103.5], [25, 102.5],
  [31.5, 101.5], [40, 100.8], [50, 100.2], [63, 100.1],
  [80, 100.0], [100, 100.0], [120, 100.0],
]);
const SEAT_B = curveFromPoints([
  [15, 103.0], [15.44, 102.8], [20, 102.5], [25, 101.5],
  [31.5, 100.5], [40, 100.2], [50, 99.8], [63, 99.9],
  [80, 100.0], [100, 100.0], [120, 100.0],
]);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("A: two seats with different room transfer retain that difference", () => {
  const attenuation = buildProductLimitAttenuationCurve(RSP_BEFORE, RSP_AFTER);
  const seatAFinal = applyProductLimitAttenuation(SEAT_A, attenuation);
  const seatBFinal = applyProductLimitAttenuation(SEAT_B, attenuation);
  const a15 = seatAFinal.find((p) => p.frequency === 15).spl;
  const b15 = seatBFinal.find((p) => p.frequency === 15).spl;
  // Both lose 5 dB, so the 3 dB difference is preserved.
  assert.equal(a15, 101.0, "seat A at 15 Hz = 106 - 5 = 101");
  assert.equal(b15, 98.0, "seat B at 15 Hz = 103 - 5 = 98");
  assert.equal(a15 - b15, 3.0, "3 dB room-transfer difference preserved");
});

test("B: two coincident seats remain coincident", () => {
  const attenuation = buildProductLimitAttenuationCurve(RSP_BEFORE, RSP_AFTER);
  const seatA = applyProductLimitAttenuation(SEAT_A, attenuation);
  const seatACopy = applyProductLimitAttenuation(SEAT_A, attenuation);
  for (let i = 0; i < seatA.length; i++) {
    assert.equal(seatA[i].spl, seatACopy[i].spl, `coincident seats identical at ${seatA[i].frequency} Hz`);
  }
});

test("C: a seat 11 mm from RSP remains near-identical to RSP", () => {
  // A seat 11 mm from RSP has essentially the same room transfer.
  // Build a near-RSP seat that differs from RSP_BEFORE by <0.1 dB everywhere.
  const nearRspSeat = RSP_BEFORE.map((p) => ({ frequency: p.frequency, spl: p.spl + 0.02 }));
  const attenuation = buildProductLimitAttenuationCurve(RSP_BEFORE, RSP_AFTER);
  const seatFinal = applyProductLimitAttenuation(nearRspSeat, attenuation);
  // RSP final = RSP_AFTER. Seat final = (RSP_BEFORE + 0.02) - attenuation.
  // attenuation(15) = 5, so seat = 105.02 - 5 = 100.02. RSP after = 100.0.
  // Difference = 0.02 dB — near-identical.
  const seat15 = seatFinal.find((p) => p.frequency === 15).spl;
  const rsp15 = RSP_AFTER.find((p) => p.frequency === 15).spl;
  assert.ok(Math.abs(seat15 - rsp15) < 0.1, `near-RSP seat within 0.1 dB of RSP at 15 Hz (delta=${(seat15 - rsp15).toFixed(4)})`);
});

test("D: common attenuation never increases seat SPL", () => {
  const attenuation = buildProductLimitAttenuationCurve(RSP_BEFORE, RSP_AFTER);
  const seatFinal = applyProductLimitAttenuation(SEAT_A, attenuation);
  for (let i = 0; i < SEAT_A.length; i++) {
    assert.ok(seatFinal[i].spl <= SEAT_A[i].spl + 1e-9,
      `seat SPL not increased at ${SEAT_A[i].frequency} Hz (before=${SEAT_A[i].spl}, after=${seatFinal[i].spl})`);
  }
});

test("E: seat result never exceeds its own capability ceiling", () => {
  // Seat capability ceiling = seat's own max SPL curve (e.g. 106 at 15 Hz).
  // After attenuation, seat = 101, which is <= 106.
  const attenuation = buildProductLimitAttenuationCurve(RSP_BEFORE, RSP_AFTER);
  const seatFinal = applyProductLimitAttenuation(SEAT_A, attenuation);
  const seatMaxSpl = curveFromPoints([
    [15, 106.0], [15.44, 105.8], [20, 103.5], [25, 102.5],
    [31.5, 101.5], [40, 100.8], [50, 100.2], [63, 100.1],
    [80, 100.0], [100, 100.0], [120, 100.0],
  ]);
  for (let i = 0; i < seatFinal.length; i++) {
    assert.ok(seatFinal[i].spl <= seatMaxSpl[i].spl + 1e-9,
      `seat <= capability at ${seatFinal[i].frequency} Hz (final=${seatFinal[i].spl}, max=${seatMaxSpl[i].spl})`);
  }
});

test("F: where RSP product envelope does not bind, attenuation = 0 and seat unchanged", () => {
  // Build RSP before/after where the envelope does NOT bind at 40–120 Hz.
  const attenuation = buildProductLimitAttenuationCurve(RSP_BEFORE, RSP_AFTER);
  const seatFinal = applyProductLimitAttenuation(SEAT_A, attenuation);
  for (const point of seatFinal) {
    if (point.frequency >= 40) {
      const original = SEAT_A.find((p) => p.frequency === point.frequency).spl;
      assert.equal(point.spl, original, `seat unchanged at ${point.frequency} Hz (no envelope binding)`);
    }
  }
});

test("G: where RSP product envelope binds by 5 dB, every seat loses 5 dB (not clamps to same absolute SPL)", () => {
  const attenuation = buildProductLimitAttenuationCurve(RSP_BEFORE, RSP_AFTER);
  const att15 = interpolateAttenuationDb(attenuation, 15);
  assert.equal(att15, 5.0, "attenuation at 15 Hz = 5 dB");
  const seatAFinal = applyProductLimitAttenuation(SEAT_A, attenuation);
  const seatBFinal = applyProductLimitAttenuation(SEAT_B, attenuation);
  const a15 = seatAFinal.find((p) => p.frequency === 15).spl;
  const b15 = seatBFinal.find((p) => p.frequency === 15).spl;
  // Both lose 5 dB, but they are NOT clamped to the same absolute SPL.
  assert.equal(a15, 101.0, "seat A loses 5 dB: 106 - 5 = 101");
  assert.equal(b15, 98.0, "seat B loses 5 dB: 103 - 5 = 98");
  assert.notEqual(a15, b15, "seats are NOT clamped to the same absolute SPL");
});

test("H: P20 differences preserved when same attenuation applied to RSP and seat curves", () => {
  const attenuation = buildProductLimitAttenuationCurve(RSP_BEFORE, RSP_AFTER);
  const rspFinal = RSP_AFTER; // RSP path unchanged
  const seatAFinal = applyProductLimitAttenuation(SEAT_A, attenuation);
  // P20 = |seat - RSP|. At 15 Hz: |101 - 100| = 1.0 dB.
  // Before the fix (shared absolute clamp), both would be 100 → P20 = 0 (artefact).
  const p20_15 = Math.abs(seatAFinal.find((p) => p.frequency === 15).spl - rspFinal.find((p) => p.frequency === 15).spl);
  assert.equal(p20_15, 1.0, "P20 at 15 Hz = 1.0 dB (room-transfer difference preserved, not zeroed)");
  // At 40 Hz (no binding): seat = 100.8, RSP = 100.5, P20 = 0.3 dB.
  const p20_40 = Math.abs(seatAFinal.find((p) => p.frequency === 40).spl - rspFinal.find((p) => p.frequency === 40).spl);
  assert.ok(Math.abs(p20_40 - 0.3) < 1e-6, `P20 at 40 Hz ≈ 0.3 dB (unchanged region, got ${p20_40})`);
});

test("I: RSP final response remains unchanged (RSP path still uses absolute envelope)", () => {
  // The RSP final curve is RSP_AFTER — it is NOT recomputed via attenuation.
  // This test documents that the RSP path is independent of the per-seat fix.
  const attenuation = buildProductLimitAttenuationCurve(RSP_BEFORE, RSP_AFTER);
  // The attenuation is DERIVED from the RSP path, not applied to it.
  // RSP final = RSP_AFTER (the absolute envelope clamp result).
  const rspFinal = RSP_AFTER;
  const rsp15 = rspFinal.find((p) => p.frequency === 15).spl;
  assert.equal(rsp15, 100.0, "RSP final at 15 Hz = 100 (absolute envelope clamp, unchanged)");
  // Attenuation is a diagnostic derived FROM this; it does not feed back.
  assert.equal(attenuation.find((p) => p.frequency === 15).attenuationDb, 5.0);
});

test("J: attenuation is never negative (never boosts)", () => {
  // Build a case where RSP_AFTER > RSP_BEFORE at some frequency (shouldn't happen
  // in production, but the helper must clamp to 0).
  const weirdBefore = curveFromPoints([[15, 100.0], [20, 100.0]]);
  const weirdAfter = curveFromPoints([[15, 103.0], [20, 100.0]]);
  const attenuation = buildProductLimitAttenuationCurve(weirdBefore, weirdAfter);
  for (const point of attenuation) {
    assert.ok(point.attenuationDb >= 0, `attenuation >= 0 at ${point.frequency} Hz (got ${point.attenuationDb})`);
    assert.equal(point.attenuationDb, 0, `no boost at ${point.frequency} Hz`);
  }
});

test("interpolateAttenuationDb returns 0 outside RSP grid range", () => {
  const attenuation = buildProductLimitAttenuationCurve(RSP_BEFORE, RSP_AFTER);
  assert.equal(interpolateAttenuationDb(attenuation, 10), 0, "below grid → 0");
  assert.equal(interpolateAttenuationDb(attenuation, 200), 0, "above grid → 0");
  assert.equal(interpolateAttenuationDb(attenuation, 15), 5.0, "at 15 Hz → 5 dB");
  assert.equal(interpolateAttenuationDb(attenuation, 20), 0, "at 20 Hz → 0 (no binding)");
});

test("interpolateAttenuationDb interpolates linearly between grid points", () => {
  // Build a curve with 3 dB at 15 Hz and 0 dB at 20 Hz.
  const att = [{ frequency: 15, attenuationDb: 3 }, { frequency: 20, attenuationDb: 0 }];
  // At 17.5 Hz (midpoint): 1.5 dB.
  assert.equal(interpolateAttenuationDb(att, 17.5), 1.5, "midpoint interpolation");
});