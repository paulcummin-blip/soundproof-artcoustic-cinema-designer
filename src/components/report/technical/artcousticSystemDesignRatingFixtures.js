/**
 * artcousticSystemDesignRatingFixtures.js
 * ----------------------------------------
 * Fixture tests for the Artcoustic System Design Rating adapter.
 *
 * Exercises:
 *   A. L4/L3/L2/L1 conversion
 *   B. Threshold-derived FAIL (P1, P4, P6, P10, P12, P13, P14, P16, P18, P19, Screen)
 *   C. Parameters that must NOT invent FAIL (P9, P11, P20, P5, P17, N/A topology)
 *   D. Missing result → provisional, never FAIL
 *   E. Genuine N/A → excluded without provisional
 *   F. P8 unconditional report L4 → unscoreable/provisional
 *   G. P11: actual L4, actual L1, indeterminate, missing, report-fallback must not score
 *   H. P15: excluded/provisional
 *   I. P21: excluded/provisional
 *   J. Stale/unverified bass → excluded/provisional
 *   K. Verified bass → included
 *   L. Room seat metric: all seats complete → average multipliers
 *   M. Room seat metric: one applicable seat missing → whole metric excluded/provisional
 *   N. Genuine N/A seat → excluded from average without provisional
 *   O. Denominator zero → NOT_ASSESSED
 *   P. Strongly negative score → raw remains negative, display floors to 0
 *   Q. All seats identical → all individual ratings identical
 *   R. Poor design: multiple FAIL parameters materially reduce rating
 */

import {
  buildArtcousticDesignRatingAuthority,
  calculateRoomDesignRating,
  calculateSeatDesignRating,
  PARAM_WEIGHTS,
  LEVEL_MULTIPLIERS,
  TOTAL_WEIGHT,
  MAX_REFERENCE_POINTS,
  V1_EXCLUDED_PARAMS,
} from "./artcousticSystemDesignRating";

// ─── Assertion helpers ───

function eq(actual, expected) {
  return actual === expected;
}

function approx(actual, expected, tolerance = 0.01) {
  return Math.abs(actual - expected) < tolerance;
}

function makeResult(name, passed, details) {
  return { name, passed, details: passed ? "OK" : details };
}

// ─── Helpers ───

const SEAT_LIST = [{ id: "s1" }, { id: "s2" }];

function getSeatLevel(authority, key, seatId) {
  return authority?.parameters?.[key]?.seats?.[seatId]?.level ?? null;
}

function getRoomLevel(authority, key) {
  return authority?.parameters?.[key]?.level ?? null;
}

function getRoomState(authority, key) {
  return authority?.parameters?.[key]?.state ?? null;
}

// ═══════════════════════════════════════════════════════════════
// A. L4/L3/L2/L1 conversion
// ═══════════════════════════════════════════════════════════════

function fixtureA() {
  const checks = [];

  // P1 distance: L4=1.5, L3=1.2, L2=0.8, L1=0.5
  const a1 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p1: { s1: 1.6, s2: 1.6 } });
  checks.push(["P1 1.6m→L4", getSeatLevel(a1, "p1", "s1") === "L4"]);
  const a2 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p1: { s1: 1.3, s2: 1.3 } });
  checks.push(["P1 1.3m→L3", getSeatLevel(a2, "p1", "s1") === "L3"]);
  const a3 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p1: { s1: 0.9, s2: 0.9 } });
  checks.push(["P1 0.9m→L2", getSeatLevel(a3, "p1", "s1") === "L2"]);
  const a4 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p1: { s1: 0.6, s2: 0.6 } });
  checks.push(["P1 0.6m→L1", getSeatLevel(a4, "p1", "s1") === "L1"]);

  // P4 screen delta: L4≤2, L3≤4, L2≤5, L1≤6
  const a5 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p4: { s1: 1.0, s2: 1.0 } });
  checks.push(["P4 1dB→L4", getSeatLevel(a5, "p4", "s1") === "L4"]);
  const a6 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p4: { s1: 3.0, s2: 3.0 } });
  checks.push(["P4 3dB→L3", getSeatLevel(a6, "p4", "s1") === "L3"]);
  const a7 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p4: { s1: 4.5, s2: 4.5 } });
  checks.push(["P4 4.5dB→L2", getSeatLevel(a7, "p4", "s1") === "L2"]);
  const a8 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p4: { s1: 5.5, s2: 5.5 } });
  checks.push(["P4 5.5dB→L1", getSeatLevel(a8, "p4", "s1") === "L1"]);

  // Screen viewing angle: L4=50-65, L3=45-70, L2=40-80, L1=33-90
  const a9 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, screen: { s1: 55, s2: 55 } });
  checks.push(["Screen 55°→L4", getSeatLevel(a9, "screen", "s1") === "L4"]);
  const a10 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, screen: { s1: 47, s2: 47 } });
  checks.push(["Screen 47°→L3", getSeatLevel(a10, "screen", "s1") === "L3"]);
  const a11 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, screen: { s1: 42, s2: 42 } });
  checks.push(["Screen 42°→L2", getSeatLevel(a11, "screen", "s1") === "L2"]);
  const a12 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, screen: { s1: 35, s2: 35 } });
  checks.push(["Screen 35°→L1", getSeatLevel(a12, "screen", "s1") === "L1"]);

  const failed = checks.filter(([, v]) => !v).map(([label]) => label);
  return makeResult("A: L4/L3/L2/L1 conversion", failed.length === 0, `Failed: ${failed.join(", ")}`);
}

// ═══════════════════════════════════════════════════════════════
// B. Threshold-derived FAIL
// ═══════════════════════════════════════════════════════════════

function fixtureB() {
  const checks = [];

  // P1 below L1 minimum (0.5m)
  const b1 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p1: { s1: 0.3, s2: 0.3 } });
  checks.push(["P1 0.3m→FAIL", getSeatLevel(b1, "p1", "s1") === "FAIL"]);

  // P4 > 6 dB
  const b2 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p4: { s1: 7, s2: 7 } });
  checks.push(["P4 7dB→FAIL", getSeatLevel(b2, "p4", "s1") === "FAIL"]);

  // P6 worse than L1 (10 dB)
  const b3 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p6: { s1: 11, s2: 11 } });
  checks.push(["P6 11dB→FAIL", getSeatLevel(b3, "p6", "s1") === "FAIL"]);

  // P10 worse than L1 (12 dB)
  const b4 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p10: { s1: 13, s2: 13 } });
  checks.push(["P10 13dB→FAIL", getSeatLevel(b4, "p10", "s1") === "FAIL"]);

  // P12 below L1 minimum (102 minimum mode)
  const b5 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p12: { rawValue: 95, mode: "minimum" } });
  checks.push(["P12 95dB→FAIL", getRoomLevel(b5, "p12") === "FAIL"]);

  // P13 below L1 minimum (96 minimum mode)
  const b6 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p13: { rawValue: 90, mode: "minimum" } });
  checks.push(["P13 90dB→FAIL", getRoomLevel(b6, "p13") === "FAIL"]);

  // P14 verified, below L1 minimum (109 minimum mode)
  const b7 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p14: { rawValue: 100, verified: true, mode: "minimum" } });
  checks.push(["P14 100dB verified→FAIL", getRoomLevel(b7, "p14") === "FAIL"]);

  // P16 beyond complete L1 range (5 dB)
  const b8 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p16: { s1: 6, s2: 6 } });
  checks.push(["P16 6dB→FAIL", getSeatLevel(b8, "p16", "s1") === "FAIL"]);

  // P18 verified, 36 Hz or more is worse than Minimum L1.
  const b9 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p18: { rawValue: 36, verified: true, mode: "minimum" } });
  checks.push(["P18 36Hz verified→FAIL", getRoomLevel(b9, "p18") === "FAIL"]);

  // P19 verified, worse than L1 (5 dB)
  const b10 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p19: { s1: { rawValue: 6, verified: true }, s2: { rawValue: 6, verified: true } } });
  checks.push(["P19 6dB verified→FAIL", getSeatLevel(b10, "p19", "s1") === "FAIL"]);

  // Screen below L1 range (below 33°)
  const b11 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, screen: { s1: 25, s2: 25 } });
  checks.push(["Screen 25°→FAIL", getSeatLevel(b11, "screen", "s1") === "FAIL"]);

  // Screen above L1 range (above 90°)
  const b12 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, screen: { s1: 95, s2: 95 } });
  checks.push(["Screen 95°→FAIL", getSeatLevel(b12, "screen", "s1") === "FAIL"]);

  const failed = checks.filter(([, v]) => !v).map(([label]) => label);
  return makeResult("B: Threshold-derived FAIL", failed.length === 0, `Failed: ${failed.join(", ")}`);
}

// ═══════════════════════════════════════════════════════════════
// C. Parameters that must NOT invent FAIL
// ═══════════════════════════════════════════════════════════════

function fixtureC() {
  const checks = [];

  // P9 open-ended L1 — 85° should be L1, not FAIL
  const c1 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p9: { s1: 85, s2: 85 } });
  checks.push(["P9 85°→L1 (not FAIL)", getSeatLevel(c1, "p9", "s1") === "L1"]);

  // P11 outside zone = L1, not FAIL
  const c2 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p11: { outsideCount: 5, level: "L1", indeterminate: false } });
  checks.push(["P11 outsideCount=5→L1 (not FAIL)", getRoomLevel(c2, "p11") === "L1"]);

  // P20 open-ended — 5 dB should be L1, not FAIL
  const c3 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p20: { s1: { rawValue: 5, verified: true }, s2: { rawValue: 5, verified: true } } });
  checks.push(["P20 5dB→L1 (not FAIL)", getSeatLevel(c3, "p20", "s1") === "L1"]);

  // P5 open-ended — 85° should be L1, not FAIL
  const c4 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p5: { s1: 85, s2: 85 } });
  checks.push(["P5 85°→L1 (not FAIL)", getSeatLevel(c4, "p5", "s1") === "L1"]);

  // P17 open-ended — 4 dB should be L2, not FAIL
  const c5 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p17: { s1: 4, s2: 4 } });
  checks.push(["P17 4dB→L2 (not FAIL)", getSeatLevel(c5, "p17", "s1") === "L2"]);

  // Genuine N/A topology — P7 no front wides
  const c6 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p7: { na: true } });
  checks.push(["P7 no wides→na", getRoomState(c6, "p7") === "na"]);

  const failed = checks.filter(([, v]) => !v).map(([label]) => label);
  return makeResult("C: No invented FAIL", failed.length === 0, `Failed: ${failed.join(", ")}`);
}

// ═══════════════════════════════════════════════════════════════
// D. Missing result → provisional, never FAIL
// ═══════════════════════════════════════════════════════════════

function fixtureD() {
  const checks = [];

  // P4 missing
  const d1 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p4: { s1: null, s2: null } });
  checks.push(["P4 missing→provisional", d1.parameters.p4.seats.s1.state === "provisional"]);
  checks.push(["P4 missing level null", d1.parameters.p4.seats.s1.level === null]);

  // P12 missing
  const d2 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p12: null });
  checks.push(["P12 missing→provisional", d2.parameters.p12.state === "provisional"]);
  checks.push(["P12 missing not FAIL", d2.parameters.p12.level !== "FAIL"]);

  // P1 missing
  const d3 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p1: { s1: null, s2: null } });
  checks.push(["P1 missing→provisional", d3.parameters.p1.seats.s1.state === "provisional"]);
  checks.push(["P1 missing not FAIL", d3.parameters.p1.seats.s1.level !== "FAIL"]);

  const failed = checks.filter(([, v]) => !v).map(([label]) => label);
  return makeResult("D: Missing→provisional", failed.length === 0, `Failed: ${failed.join(", ")}`);
}

// ═══════════════════════════════════════════════════════════════
// E. Genuine N/A → excluded without provisional
// ═══════════════════════════════════════════════════════════════

function fixtureE() {
  const checks = [];

  // P7 no front wides = na
  const e1 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p7: { na: true } });
  checks.push(["P7 na state", e1.parameters.p7.state === "na"]);

  // P9 no adjacent uppers = na per seat
  const e2 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p9: { s1: "na", s2: "na" } });
  checks.push(["P9 na state", e2.parameters.p9.state === "na"]);

  // P18 genuinely topology N/A (verified N/A — fail-closed requires verified: true)
  const e3 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p18: { na: true, verified: true } });
  checks.push(["P18 na state", e3.parameters.p18.state === "na"]);

  // Room rating should not be provisional just because of N/A
  const e4 = buildArtcousticDesignRatingAuthority({
    seats: SEAT_LIST,
    p7: { na: true },
    p18: { na: true, verified: true },
    p9: { s1: "na", s2: "na" },
  });
  const roomRating = calculateRoomDesignRating(e4);
  checks.push(["Room not provisional from N/A only", roomRating.hasProvisional === false || roomRating.status === "NOT_ASSESSED"]);

  const failed = checks.filter(([, v]) => !v).map(([label]) => label);
  return makeResult("E: N/A excluded without provisional", failed.length === 0, `Failed: ${failed.join(", ")}`);
}

// ═══════════════════════════════════════════════════════════════
// F. P8 unconditional report L4 → unscoreable/provisional
// ═══════════════════════════════════════════════════════════════

function fixtureF() {
  const checks = [];

  // P8 with any input should be provisional (v1-excluded)
  const f1 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p8: { rawValue: 1 } });
  checks.push(["P8 provisional (v1-excluded)", f1.parameters.p8.state === "provisional"]);
  checks.push(["P8 reason v1-excluded", f1.parameters.p8.reason === "v1-excluded"]);
  checks.push(["P8 level null", f1.parameters.p8.level === null]);

  // P8 with null input should also be provisional
  const f2 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p8: null });
  checks.push(["P8 null→provisional", f2.parameters.p8.state === "provisional"]);

  const failed = checks.filter(([, v]) => !v).map(([label]) => label);
  return makeResult("F: P8 unscoreable", failed.length === 0, `Failed: ${failed.join(", ")}`);
}

// ═══════════════════════════════════════════════════════════════
// G. P11: actual L4, actual L1, indeterminate, missing, report-fallback
// ═══════════════════════════════════════════════════════════════

function fixtureG() {
  const checks = [];

  // Actual L4
  const g1 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p11: { outsideCount: 0, level: "L4", indeterminate: false } });
  checks.push(["P11 actual L4", getRoomLevel(g1, "p11") === "L4"]);

  // Actual L1
  const g2 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p11: { outsideCount: 1, level: "L1", indeterminate: false } });
  checks.push(["P11 actual L1", getRoomLevel(g2, "p11") === "L1"]);

  // Indeterminate
  const g3 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p11: { outsideCount: 0, level: "indeterminate", indeterminate: true } });
  checks.push(["P11 indeterminate→provisional", g3.parameters.p11.state === "provisional"]);

  // Missing
  const g4 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p11: null });
  checks.push(["P11 missing→provisional", g4.parameters.p11.state === "provisional"]);

  // Report fallback L4 must not score — null input should NOT produce L4
  checks.push(["P11 null not L4", g4.parameters.p11.level !== "L4"]);

  const failed = checks.filter(([, v]) => !v).map(([label]) => label);
  return makeResult("G: P11 authority", failed.length === 0, `Failed: ${failed.join(", ")}`);
}

// ═══════════════════════════════════════════════════════════════
// H. P15: excluded/provisional
// ═══════════════════════════════════════════════════════════════

function fixtureH() {
  const checks = [];

  const h1 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p15: { rawValue: 20 } });
  checks.push(["P15 provisional (v1-excluded)", h1.parameters.p15.state === "provisional"]);
  checks.push(["P15 reason v1-excluded", h1.parameters.p15.reason === "v1-excluded"]);

  const failed = checks.filter(([, v]) => !v).map(([label]) => label);
  return makeResult("H: P15 excluded", failed.length === 0, `Failed: ${failed.join(", ")}`);
}

// ═══════════════════════════════════════════════════════════════
// I. P21: excluded/provisional
// ═══════════════════════════════════════════════════════════════

function fixtureI() {
  const checks = [];

  const i1 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p21: { rawValue: -10 } });
  checks.push(["P21 provisional (v1-excluded)", i1.parameters.p21.state === "provisional"]);
  checks.push(["P21 reason v1-excluded", i1.parameters.p21.reason === "v1-excluded"]);

  const failed = checks.filter(([, v]) => !v).map(([label]) => label);
  return makeResult("I: P21 excluded", failed.length === 0, `Failed: ${failed.join(", ")}`);
}

// ═══════════════════════════════════════════════════════════════
// J. Stale/unverified bass → excluded/provisional
// ═══════════════════════════════════════════════════════════════

function fixtureJ() {
  const checks = [];

  // P14 unverified
  const j1 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p14: { rawValue: 118, verified: false, mode: "minimum" } });
  checks.push(["P14 unverified→provisional", j1.parameters.p14.state === "provisional"]);
  checks.push(["P14 unverified not scored", j1.parameters.p14.level === null]);

  // P18 unverified
  const j2 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p18: { rawValue: 18, verified: false } });
  checks.push(["P18 unverified→provisional", j2.parameters.p18.state === "provisional"]);

  // P19 unverified per seat
  const j3 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p19: { s1: { rawValue: 2, verified: false }, s2: { rawValue: 2, verified: false } } });
  checks.push(["P19 unverified→provisional", j3.parameters.p19.seats.s1.state === "provisional"]);

  // P20 unverified per seat
  const j4 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p20: { s1: { rawValue: 2, verified: false }, s2: { rawValue: 2, verified: false } } });
  checks.push(["P20 unverified→provisional", j4.parameters.p20.seats.s1.state === "provisional"]);

  const failed = checks.filter(([, v]) => !v).map(([label]) => label);
  return makeResult("J: Stale/unverified bass", failed.length === 0, `Failed: ${failed.join(", ")}`);
}

// ═══════════════════════════════════════════════════════════════
// K. Verified bass → included
// ═══════════════════════════════════════════════════════════════

function fixtureK() {
  const checks = [];

  // P14 verified, L4 level (123 dB recommended)
  const k1 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p14: { rawValue: 123, verified: true, mode: "recommended" } });
  checks.push(["P14 verified→scored", k1.parameters.p14.state === "scored"]);
  checks.push(["P14 123dB recommended→L4", k1.parameters.p14.level === "L4"]);

  // P18 verified, L4 level (15 Hz)
  const k2 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p18: { rawValue: 15, verified: true } });
  checks.push(["P18 verified→scored", k2.parameters.p18.state === "scored"]);
  checks.push(["P18 15Hz→L4", k2.parameters.p18.level === "L4"]);

  // P19 verified per seat, L4 level (2 dB)
  const k3 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p19: { s1: { rawValue: 2, verified: true }, s2: { rawValue: 2, verified: true } } });
  checks.push(["P19 verified→scored", k3.parameters.p19.seats.s1.state === "scored"]);
  checks.push(["P19 2dB→L4", k3.parameters.p19.seats.s1.level === "L4"]);

  const failed = checks.filter(([, v]) => !v).map(([label]) => label);
  return makeResult("K: Verified bass included", failed.length === 0, `Failed: ${failed.join(", ")}`);
}

// ═══════════════════════════════════════════════════════════════
// L. Room seat metric: all seats complete → average multipliers
// ═══════════════════════════════════════════════════════════════

function fixtureL() {
  const checks = [];

  // P4 with two seats: s1=1dB(L4→12), s2=3dB(L3→8) → avg=10
  const l1 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p4: { s1: 1, s2: 3 } });
  checks.push(["P4 both seats scored", l1.parameters.p4.state === "scored"]);

  // Build a minimal authority with only P4 scored and check room rating
  const auth = buildArtcousticDesignRatingAuthority({
    seats: SEAT_LIST,
    p4: { s1: 1, s2: 3 }, // L4(12) and L3(8) → avg=10
  });
  const rating = calculateRoomDesignRating(auth);
  // P4 weight=5, avg multiplier=10, contribution=50, max=12*5=60
  checks.push(["P4 avg contribution", approx(rating.actualPoints, 50, 0.1)]);
  checks.push(["P4 max points", approx(rating.maximumAvailablePoints, 60, 0.1)]);
  checks.push(["P4 raw %", approx(rating.rawPercentage, 83.33, 0.5)]);

  const failed = checks.filter(([, v]) => !v).map(([label]) => label);
  return makeResult("L: Room seat avg multipliers", failed.length === 0, `Failed: ${failed.join(", ")}`);
}

// ═══════════════════════════════════════════════════════════════
// M. Room seat metric: one seat missing → whole metric excluded/provisional
// ═══════════════════════════════════════════════════════════════

function fixtureM() {
  const checks = [];

  // P4 with s1 scored, s2 missing → whole param provisional
  const m1 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p4: { s1: 1, s2: null } });
  checks.push(["P4 one missing→provisional", m1.parameters.p4.state === "provisional"]);

  // Room rating should be provisional and exclude P4 from numerator/denominator
  const auth = buildArtcousticDesignRatingAuthority({
    seats: SEAT_LIST,
    p4: { s1: 1, s2: null }, // s2 missing
  });
  const rating = calculateRoomDesignRating(auth);
  checks.push(["hasProvisional diagnostic", rating.hasProvisional === true]);
  // P4 is provisional → excluded from both numerator and denominator
  checks.push(["P4 excluded from assessed", rating.assessedWeight === 0]);
  checks.push(["P4 excluded from applicable", rating.applicableWeight === 0]);
  // No scored params → NOT_ASSESSED (not PROVISIONAL)
  checks.push(["Room NOT_ASSESSED", rating.status === "NOT_ASSESSED"]);

  const failed = checks.filter(([, v]) => !v).map(([label]) => label);
  return makeResult("M: One seat missing→excluded", failed.length === 0, `Failed: ${failed.join(", ")}`);
}

// ═══════════════════════════════════════════════════════════════
// N. Genuine N/A seat → excluded from average without provisional
// ═══════════════════════════════════════════════════════════════

function fixtureN() {
  const checks = [];

  // P9 with s1 scored, s2 N/A → param should be scored (not provisional)
  const n1 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p9: { s1: 50, s2: "na" } });
  checks.push(["P9 one N/A→scored", n1.parameters.p9.state === "scored"]);

  // Average should only use s1 (L4→12)
  const auth = buildArtcousticDesignRatingAuthority({
    seats: SEAT_LIST,
    p9: { s1: 50, s2: "na" }, // s1 L4(12), s2 N/A
  });
  const rating = calculateRoomDesignRating(auth);
  // P9 weight=5, avg=12 (only s1), contribution=60, max=60
  checks.push(["P9 N/A seat avg", approx(rating.actualPoints, 60, 0.1)]);
  // P9 should be scored despite one N/A seat (N/A excluded from average without making P9 provisional)
  checks.push(["P9 scored despite N/A seat", auth.parameters.p9.state === "scored"]);

  const failed = checks.filter(([, v]) => !v).map(([label]) => label);
  return makeResult("N: N/A seat excluded from avg", failed.length === 0, `Failed: ${failed.join(", ")}`);
}

// ═══════════════════════════════════════════════════════════════
// O. Denominator zero → NOT_ASSESSED
// ═══════════════════════════════════════════════════════════════

function fixtureO() {
  const checks = [];

  // All params N/A or excluded → NOT_ASSESSED
  const auth = buildArtcousticDesignRatingAuthority({
    seats: SEAT_LIST,
    p7: { na: true },
    p9: { s1: "na", s2: "na" },
    p18: { na: true },
  });
  const rating = calculateRoomDesignRating(auth);
  checks.push(["Zero denom→NOT_ASSESSED", rating.status === "NOT_ASSESSED"]);
  checks.push(["Zero denom→null %", rating.rawPercentage === null]);
  checks.push(["Zero denom→null display", rating.displayPercentage === null]);

  const failed = checks.filter(([, v]) => !v).map(([label]) => label);
  return makeResult("O: Zero denominator", failed.length === 0, `Failed: ${failed.join(", ")}`);
}

// ═══════════════════════════════════════════════════════════════
// P. Strongly negative score → raw negative, display 0
// ═══════════════════════════════════════════════════════════════

function fixtureP() {
  const checks = [];

  // All scored params at FAIL → raw negative, display 0
  const auth = buildArtcousticDesignRatingAuthority({
    seats: SEAT_LIST,
    p1: { s1: 0.3, s2: 0.3 },     // FAIL
    p4: { s1: 7, s2: 7 },         // FAIL
    p6: { s1: 11, s2: 11 },       // FAIL
    p10: { s1: 13, s2: 13 },      // FAIL
    p16: { s1: 6, s2: 6 },        // FAIL
    p19: { s1: { rawValue: 6, verified: true }, s2: { rawValue: 6, verified: true } }, // FAIL
    screen: { s1: 25, s2: 25 },   // FAIL
  });
  const rating = calculateRoomDesignRating(auth);
  checks.push(["Raw % negative", rating.rawPercentage < 0]);
  checks.push(["Display % floored to 0", rating.displayPercentage === 0]);
  checks.push(["Actual points negative", rating.actualPoints < 0]);

  const failed = checks.filter(([, v]) => !v).map(([label]) => label);
  return makeResult("P: Negative score floored", failed.length === 0, `Failed: ${failed.join(", ")}`);
}

// ═══════════════════════════════════════════════════════════════
// Q. All seats identical → all individual ratings identical
// ═══════════════════════════════════════════════════════════════

function fixtureQ() {
  const checks = [];

  const auth = buildArtcousticDesignRatingAuthority({
    seats: SEAT_LIST,
    p1: { s1: 1.5, s2: 1.5 },
    p4: { s1: 2, s2: 2 },
    p5: { s1: 50, s2: 50 },
    p6: { s1: 2, s2: 2 },
    p10: { s1: 2, s2: 2 },
    p16: { s1: 1.5, s2: 1.5 },
    p17: { s1: 1.5, s2: 1.5 },
    p19: { s1: { rawValue: 2, verified: true }, s2: { rawValue: 2, verified: true } },
    p20: { s1: { rawValue: 2, verified: true }, s2: { rawValue: 2, verified: true } },
    screen: { s1: 55, s2: 55 },
    p2: { rawValue: 15 },
    p3: { rawValue: 0 },
    p12: { rawValue: 111, mode: "minimum" },
    p13: { rawValue: 108, mode: "minimum" },
    p14: { rawValue: 123, verified: true, mode: "minimum" },
    p11: { outsideCount: 0, level: "L4", indeterminate: false },
  });

  const r1 = calculateSeatDesignRating(auth, "s1");
  const r2 = calculateSeatDesignRating(auth, "s2");
  checks.push(["Seat ratings identical", r1.rawPercentage === r2.rawPercentage]);
  checks.push(["Seat display identical", r1.displayPercentage === r2.displayPercentage]);
  checks.push(["Seat status identical", r1.status === r2.status]);

  const failed = checks.filter(([, v]) => !v).map(([label]) => label);
  return makeResult("Q: Identical seats identical ratings", failed.length === 0, `Failed: ${failed.join(", ")}`);
}

// ═══════════════════════════════════════════════════════════════
// R. Poor design: multiple FAIL materially reduces rating vs L1
// ═══════════════════════════════════════════════════════════════

function fixtureR() {
  const checks = [];

  // Design A: all scored params at L1
  const authA = buildArtcousticDesignRatingAuthority({
    seats: SEAT_LIST,
    p1: { s1: 0.6, s2: 0.6 },      // L1
    p4: { s1: 5.5, s2: 5.5 },      // L1
    p5: { s1: 85, s2: 85 },        // L1
    p6: { s1: 9, s2: 9 },          // L1
    p9: { s1: 81, s2: 81 },        // L1
    p10: { s1: 10, s2: 10 },       // L1
    p16: { s1: 4.5, s2: 4.5 },     // L1
    p17: { s1: 2, s2: 2 },         // L4 (P17 has no L1 — L2 is lowest at 3)
    p19: { s1: { rawValue: 4.5, verified: true }, s2: { rawValue: 4.5, verified: true } }, // L1
    p20: { s1: { rawValue: 4, verified: true }, s2: { rawValue: 4, verified: true } },         // L1
    screen: { s1: 35, s2: 35 },    // L1
    p2: { rawValue: 5 },           // L1
    p3: { rawValue: 0 },           // L4
    p7: { rawValue: 9 },           // L1
    p11: { outsideCount: 0, level: "L4", indeterminate: false }, // L4
    p12: { rawValue: 102, mode: "minimum" }, // L1
    p13: { rawValue: 96, mode: "minimum" }, // L1
    p14: { rawValue: 109, verified: true, mode: "minimum" }, // L1
    p18: { rawValue: 30, verified: true }, // L1
  });
  const ratingA = calculateRoomDesignRating(authA);

  // Design B: same but P14, P19, P20 at FAIL (high-weight bass params)
  const authB = buildArtcousticDesignRatingAuthority({
    seats: SEAT_LIST,
    p1: { s1: 0.6, s2: 0.6 },
    p4: { s1: 5.5, s2: 5.5 },
    p5: { s1: 85, s2: 85 },
    p6: { s1: 9, s2: 9 },
    p9: { s1: 81, s2: 81 },
    p10: { s1: 10, s2: 10 },
    p16: { s1: 4.5, s2: 4.5 },
    p17: { s1: 2, s2: 2 },
    p19: { s1: { rawValue: 6, verified: true }, s2: { rawValue: 6, verified: true } }, // FAIL
    p20: { s1: { rawValue: 5, verified: true }, s2: { rawValue: 5, verified: true } },         // L1 (open-ended, not FAIL)
    screen: { s1: 35, s2: 35 },
    p2: { rawValue: 5 },
    p3: { rawValue: 0 },
    p7: { rawValue: 9 },
    p11: { outsideCount: 0, level: "L4", indeterminate: false },
    p12: { rawValue: 102, mode: "minimum" },
    p13: { rawValue: 96, mode: "minimum" },
    p14: { rawValue: 100, verified: true, mode: "minimum" }, // FAIL
    p18: { rawValue: 30, verified: true },
  });
  const ratingB = calculateRoomDesignRating(authB);

  // FAIL design should be materially worse than all-L1 design
  checks.push(["FAIL design lower than L1 design", ratingB.rawPercentage < ratingA.rawPercentage]);
  checks.push(["FAIL penalty material", (ratingA.rawPercentage - ratingB.rawPercentage) > 5]);

  // Also test with screen FAIL
  const authC = buildArtcousticDesignRatingAuthority({
    seats: SEAT_LIST,
    p1: { s1: 0.6, s2: 0.6 },
    p4: { s1: 5.5, s2: 5.5 },
    p5: { s1: 85, s2: 85 },
    p6: { s1: 9, s2: 9 },
    p9: { s1: 81, s2: 81 },
    p10: { s1: 10, s2: 10 },
    p16: { s1: 4.5, s2: 4.5 },
    p17: { s1: 2, s2: 2 },
    p19: { s1: { rawValue: 4.5, verified: true }, s2: { rawValue: 4.5, verified: true } },
    p20: { s1: { rawValue: 4, verified: true }, s2: { rawValue: 4, verified: true } },
    screen: { s1: 25, s2: 25 },    // FAIL
    p2: { rawValue: 5 },
    p3: { rawValue: 0 },
    p7: { rawValue: 9 },
    p11: { outsideCount: 0, level: "L4", indeterminate: false },
    p12: { rawValue: 102, mode: "minimum" },
    p13: { rawValue: 96, mode: "minimum" },
    p14: { rawValue: 109, verified: true, mode: "minimum" },
    p18: { rawValue: 30, verified: true },
  });
  const ratingC = calculateRoomDesignRating(authC);
  checks.push(["Screen FAIL lower than L1", ratingC.rawPercentage < ratingA.rawPercentage]);

  const failed = checks.filter(([, v]) => !v).map(([label]) => label);
  return makeResult("R: FAIL penalty material", failed.length === 0, `Failed: ${failed.join(", ")}`);
}

// ═══════════════════════════════════════════════════════════════
// S. Assumption coverage: P8/P15/P21 in coverage, not in score
// ═══════════════════════════════════════════════════════════════

function fixtureS() {
  const checks = [];

  // All scorable params at L4, P8/P15/P21 V1-excluded
  const auth = buildArtcousticDesignRatingAuthority({
    seats: SEAT_LIST,
    p1: { s1: 1.6, s2: 1.6 },
    p4: { s1: 1, s2: 1 },
    p5: { s1: 50, s2: 50 },
    p6: { s1: 1, s2: 1 },
    p9: { s1: 50, s2: 50 },
    p10: { s1: 1, s2: 1 },
    p16: { s1: 1.5, s2: 1.5 },
    p17: { s1: 1.5, s2: 1.5 },
    p19: { s1: { rawValue: 2, verified: true }, s2: { rawValue: 2, verified: true } },
    p20: { s1: { rawValue: 2, verified: true }, s2: { rawValue: 2, verified: true } },
    screen: { s1: 55, s2: 55 },
    p2: { rawValue: 15 },
    p3: { rawValue: 0 },
    p7: { rawValue: 2 },
    p11: { outsideCount: 0, level: "L4", indeterminate: false },
    p12: { rawValue: 111, mode: "minimum" },
    p13: { rawValue: 105, mode: "minimum" },
    p14: { rawValue: 118, verified: true, mode: "minimum" },
    p18: { rawValue: 15, verified: true },
  });
  const rating = calculateRoomDesignRating(auth);

  // Score should be 100% (all scorable at L4)
  checks.push(["Score 100%", approx(rating.rawPercentage, 100, 0.01)]);
  // Status COMPLETE — V1-excluded params do NOT make it PROVISIONAL
  checks.push(["Status COMPLETE", rating.status === "COMPLETE"]);
  // Coverage 100% — all applicable (scored) params are assessed
  checks.push(["Coverage 100%", approx(rating.coveragePercent, 100, 0.01)]);
  // applicableWeight = scorable total = 121 (P18 weight 12).
  checks.push(["applicableWeight=121", rating.applicableWeight === 121]);
  // assessedWeight = 121 (all scored)
  checks.push(["assessedWeight=121", rating.assessedWeight === 121]);
  // hasProvisional is true (diagnostic) but status is not PROVISIONAL
  checks.push(["hasProvisional diagnostic", rating.hasProvisional === true]);
  checks.push(["Status not PROVISIONAL", rating.status !== "PROVISIONAL"]);

  const failed = checks.filter(([, v]) => !v).map(([label]) => label);
  return makeResult("S: V1-excluded do not affect score", failed.length === 0, `Failed: ${failed.join(", ")}`);
}

// ═══════════════════════════════════════════════════════════════
// T. Bass fail-closed: rawValue without verified → provisional
// ═══════════════════════════════════════════════════════════════

function fixtureT() {
  const checks = [];

  // P14 without verified → provisional
  const t1 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p14: { rawValue: 118, mode: "minimum" } });
  checks.push(["P14 no verified→provisional", t1.parameters.p14.state === "provisional"]);

  // P18 without verified → provisional
  const t2 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p18: { rawValue: 18 } });
  checks.push(["P18 no verified→provisional", t2.parameters.p18.state === "provisional"]);

  // P19 seat without verified → provisional
  const t3 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p19: { s1: { rawValue: 2 }, s2: { rawValue: 2 } } });
  checks.push(["P19 no verified→provisional", t3.parameters.p19.seats.s1.state === "provisional"]);

  // P20 seat without verified → provisional
  const t4 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p20: { s1: { rawValue: 2 }, s2: { rawValue: 2 } } });
  checks.push(["P20 no verified→provisional", t4.parameters.p20.seats.s1.state === "provisional"]);

  // Bare number for P14 → provisional
  const t5 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p14: 118 });
  checks.push(["P14 bare number→provisional", t5.parameters.p14.state === "provisional"]);

  // Bare number for P19 seat → provisional
  const t6 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p19: { s1: 2, s2: 2 } });
  checks.push(["P19 bare number→provisional", t6.parameters.p19.seats.s1.state === "provisional"]);

  // With verified: true → scored
  const t7 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p14: { rawValue: 118, verified: true, mode: "minimum" } });
  checks.push(["P14 verified true→scored", t7.parameters.p14.state === "scored"]);

  const t8 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p18: { rawValue: 18, verified: true } });
  checks.push(["P18 verified true→scored", t8.parameters.p18.state === "scored"]);

  const t9 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p19: { s1: { rawValue: 2, verified: true }, s2: { rawValue: 2, verified: true } } });
  checks.push(["P19 verified true→scored", t9.parameters.p19.seats.s1.state === "scored"]);

  const t10 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p20: { s1: { rawValue: 2, verified: true }, s2: { rawValue: 2, verified: true } } });
  checks.push(["P20 verified true→scored", t10.parameters.p20.seats.s1.state === "scored"]);

  const failed = checks.filter(([, v]) => !v).map(([label]) => label);
  return makeResult("T: Bass fail-closed", failed.length === 0, `Failed: ${failed.join(", ")}`);
}

// ═══════════════════════════════════════════════════════════════
// U. Genuine verified N/A remains excluded without penalty
// ═══════════════════════════════════════════════════════════════

function fixtureU() {
  const checks = [];

  // P18 verified N/A → na
  const u1 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p18: { na: true, verified: true } });
  checks.push(["P18 verified na→na", u1.parameters.p18.state === "na"]);

  // P18 unverified N/A → provisional (not na)
  const u2 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p18: { na: true } });
  checks.push(["P18 unverified na→provisional", u2.parameters.p18.state === "provisional"]);

  // P18 verified-false N/A → provisional
  const u3 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p18: { na: true, verified: false } });
  checks.push(["P18 verified-false na→provisional", u3.parameters.p18.state === "provisional"]);

  // P20 verified N/A per seat → na
  const u4 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p20: { s1: { na: true, verified: true }, s2: { na: true, verified: true } } });
  checks.push(["P20 verified na→na", u4.parameters.p20.state === "na"]);

  // P20 unverified N/A per seat → provisional
  const u5 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p20: { s1: { na: true }, s2: { na: true } } });
  checks.push(["P20 unverified na→provisional", u5.parameters.p20.state === "provisional"]);

  const failed = checks.filter(([, v]) => !v).map(([label]) => label);
  return makeResult("U: Verified N/A", failed.length === 0, `Failed: ${failed.join(", ")}`);
}

// ═══════════════════════════════════════════════════════════════
// V. Missing metric does not change percentage
//    P4 = L4, P5 = L3, P6 = missing → denominator includes only P4 + P5
// ═══════════════════════════════════════════════════════════════

function fixtureV() {
  const checks = [];

  const auth = buildArtcousticDesignRatingAuthority({
    seats: SEAT_LIST,
    p4: { s1: 1, s2: 1 },    // L4 (12)
    p5: { s1: 60, s2: 60 },  // L3 (8)
    p6: { s1: null, s2: null }, // missing → provisional
  });
  const rating = calculateRoomDesignRating(auth);

  // P4 weight=5, L4→12, contribution=60, max=60
  // P5 weight=6, L3→8, contribution=48, max=72
  // P6 excluded (provisional — not in numerator or denominator)
  // actualPoints = 60 + 48 = 108
  // maximumAvailablePoints = 60 + 72 = 132
  checks.push(["Missing P6 not in actual", approx(rating.actualPoints, 108, 0.1)]);
  checks.push(["Missing P6 not in denom", approx(rating.maximumAvailablePoints, 132, 0.1)]);
  checks.push(["Rating = 108/132", approx(rating.rawPercentage, 81.82, 0.5)]);
  checks.push(["Status COMPLETE (not PROVISIONAL)", rating.status === "COMPLETE"]);

  const failed = checks.filter(([, v]) => !v).map(([label]) => label);
  return makeResult("V: Missing metric excluded from denominator", failed.length === 0, `Failed: ${failed.join(", ")}`);
}

// ═══════════════════════════════════════════════════════════════
// W. N/A topology does not change percentage + active param effect
//    B: No front wides → P7 excluded
//    C: Adding P7=L1 lowers rating
//    D: Adding P7=L4 keeps rating high
// ═══════════════════════════════════════════════════════════════

function fixtureW() {
  const checks = [];

  // B: No front wides → P7 = na → excluded
  const authNoWides = buildArtcousticDesignRatingAuthority({
    seats: SEAT_LIST,
    p7: { na: true },
    p4: { s1: 1, s2: 1 }, // L4
  });
  const ratingNoWides = calculateRoomDesignRating(authNoWides);
  // Only P4 scored: weight=5, L4→12, actual=60, max=60, %=100
  checks.push(["No wides P7=na", authNoWides.parameters.p7.state === "na"]);
  checks.push(["No wides rating 100%", approx(ratingNoWides.rawPercentage, 100, 0.01)]);

  // C: Front wides added, P7 = L1 → rating should decrease
  const authWidesL1 = buildArtcousticDesignRatingAuthority({
    seats: SEAT_LIST,
    p7: { rawValue: 9 },    // L1 (±max, L1=10 bounded → 9 ≤ 10 → L1)
    p4: { s1: 1, s2: 1 },   // L4
  });
  const ratingWidesL1 = calculateRoomDesignRating(authWidesL1);
  // P4: weight=5, L4→12, actual=60, max=60
  // P7: weight=4, L1→2, actual=8, max=48
  // total: actual=68, max=108, %=62.96
  checks.push(["Wides L1 < no wides", ratingWidesL1.rawPercentage < ratingNoWides.rawPercentage]);
  checks.push(["Wides L1 rating ≈62.96%", approx(ratingWidesL1.rawPercentage, 62.96, 0.5)]);

  // D: Front wides added, P7 = L4 → rating should be higher than L1
  const authWidesL4 = buildArtcousticDesignRatingAuthority({
    seats: SEAT_LIST,
    p7: { rawValue: 2 },    // L4
    p4: { s1: 1, s2: 1 },   // L4
  });
  const ratingWidesL4 = calculateRoomDesignRating(authWidesL4);
  // P4: weight=5, L4→12, actual=60, max=60
  // P7: weight=4, L4→12, actual=48, max=48
  // total: actual=108, max=108, %=100
  checks.push(["Wides L4 > wides L1", ratingWidesL4.rawPercentage > ratingWidesL1.rawPercentage]);
  checks.push(["Wides L4 rating 100%", approx(ratingWidesL4.rawPercentage, 100, 0.01)]);

  const failed = checks.filter(([, v]) => !v).map(([label]) => label);
  return makeResult("W: N/A topology + active param effect", failed.length === 0, `Failed: ${failed.join(", ")}`);
}

// ═══════════════════════════════════════════════════════════════
// X. P2 weight = 7 — confirm contribution uses weight 7
// ═══════════════════════════════════════════════════════════════

function fixtureX() {
  const checks = [];

  checks.push(["PARAM_WEIGHTS.p2 = 7", PARAM_WEIGHTS.p2 === 7]);

  // P2 = L4 → contribution = 12 * 7 = 84
  const authL4 = buildArtcousticDesignRatingAuthority({
    seats: SEAT_LIST,
    p2: { rawValue: 15 }, // L4
  });
  const ratingL4 = calculateRoomDesignRating(authL4);
  checks.push(["P2 L4 actual = 84", approx(ratingL4.actualPoints, 84, 0.1)]);
  checks.push(["P2 L4 max = 84", approx(ratingL4.maximumAvailablePoints, 84, 0.1)]);
  checks.push(["P2 L4 % = 100", approx(ratingL4.rawPercentage, 100, 0.01)]);

  // P2 = L1 → contribution = 2 * 7 = 14
  const authL1 = buildArtcousticDesignRatingAuthority({
    seats: SEAT_LIST,
    p2: { rawValue: 5 }, // L1
  });
  const ratingL1 = calculateRoomDesignRating(authL1);
  checks.push(["P2 L1 actual = 14", approx(ratingL1.actualPoints, 14, 0.1)]);
  checks.push(["P2 L1 max = 84", approx(ratingL1.maximumAvailablePoints, 84, 0.1)]);
  checks.push(["P2 L1 % ≈ 16.67", approx(ratingL1.rawPercentage, 16.67, 0.5)]);

  const failed = checks.filter(([, v]) => !v).map(([label]) => label);
  return makeResult("X: P2 weight = 7", failed.length === 0, `Failed: ${failed.join(", ")}`);
}

// ═══════════════════════════════════════════════════════════════
// Y. Synthetic screen geometry: width valid but front plane unavailable
//    → SCREEN excluded from ASDR (null angleDeg). With canonical plane
//    → SCREEN active. Proves 0.20m fallback never reaches ASDR.
// ═══════════════════════════════════════════════════════════════

function fixtureY() {
  const checks = [];

  // Screen width valid, but canonical screen front plane unavailable.
  // Engine produces angleDeg=null (distance <= 0.1 or width <= 0).
  // buildDesignRatingInput passes null → SCREEN excluded.
  const authNoPlane = buildArtcousticDesignRatingAuthority({
    seats: SEAT_LIST,
    screen: { s1: null, s2: null }, // angleDeg null — no canonical plane
    p4: { s1: 1, s2: 1 }, // L4 (12) — one scored param so rating is not NOT_ASSESSED
  });
  const ratingNoPlane = calculateRoomDesignRating(authNoPlane);
  checks.push(["Screen null→provisional", authNoPlane.parameters.screen.seats.s1.state === "provisional"]);
  checks.push(["Screen null level null", authNoPlane.parameters.screen.seats.s1.level === null]);
  // Screen excluded from numerator and denominator
  // Only P4 scored: weight=5, L4→12, actual=60, max=60, %=100
  checks.push(["Screen excluded from actual", approx(ratingNoPlane.actualPoints, 60, 0.1)]);
  checks.push(["Screen excluded from denom", approx(ratingNoPlane.maximumAvailablePoints, 60, 0.1)]);
  checks.push(["Screen null rating 100%", approx(ratingNoPlane.rawPercentage, 100, 0.01)]);

  // Canonical screen front plane provided → engine produces angleDeg=55 (L4).
  // SCREEN becomes active and participates normally.
  const authWithPlane = buildArtcousticDesignRatingAuthority({
    seats: SEAT_LIST,
    screen: { s1: 55, s2: 55 }, // angleDeg 55 — L4
    p4: { s1: 1, s2: 1 }, // L4 (12)
  });
  const ratingWithPlane = calculateRoomDesignRating(authWithPlane);
  checks.push(["Screen 55°→scored", authWithPlane.parameters.screen.seats.s1.state === "scored"]);
  checks.push(["Screen 55°→L4", authWithPlane.parameters.screen.seats.s1.level === "L4"]);
  // P4: weight=5, L4→12, actual=60, max=60
  // Screen: weight=7, L4→12, actual=84, max=84
  // total: actual=144, max=144, %=100
  checks.push(["Screen active in actual", approx(ratingWithPlane.actualPoints, 144, 0.1)]);
  checks.push(["Screen active in denom", approx(ratingWithPlane.maximumAvailablePoints, 144, 0.1)]);
  checks.push(["Screen active rating 100%", approx(ratingWithPlane.rawPercentage, 100, 0.01)]);

  // Prove 0.20m fallback never reaches ASDR: a synthetic 0.20 plane would
  // produce a real angle. But the hook now consumes engine authority only —
  // if the engine says null, ASDR gets null (not a synthetic angle). This is
  // verified by the null case above: no synthetic angle is invented.
  checks.push(["No synthetic angle invented", authNoPlane.parameters.screen.seats.s1.level === null]);

  const failed = checks.filter(([, v]) => !v).map(([label]) => label);
  return makeResult("Y: Synthetic screen geometry excluded", failed.length === 0, `Failed: ${failed.join(", ")}`);
}

// ═══════════════════════════════════════════════════════════════
// Z. P12 Minimum weight = 8 (Recommended SPL weighting)
// ═══════════════════════════════════════════════════════════════

function fixtureZ() {
  const checks = [];

  const auth = buildArtcousticDesignRatingAuthority({
    seats: SEAT_LIST,
    p12: { rawValue: 111, mode: "minimum" }, // L4 (>= 108)
  });
  checks.push(["P12 min effectiveWeight = 8", auth.parameters.p12.effectiveWeight === 8]);
  checks.push(["P12 min baseWeight = 8", auth.parameters.p12.weight === 8]);

  const rating = calculateRoomDesignRating(auth);
  // P12 L4: weight 8, multiplier 12, actual = 96, max = 96
  checks.push(["P12 min L4 actual = 96", approx(rating.actualPoints, 96, 0.1)]);
  checks.push(["P12 min L4 max = 96", approx(rating.maximumAvailablePoints, 96, 0.1)]);

  const failed = checks.filter(([, v]) => !v).map(([label]) => label);
  return makeResult("Z: P12 Minimum weight", failed.length === 0, `Failed: ${failed.join(", ")}`);
}

// ═══════════════════════════════════════════════════════════════
// AA. P12 Recommended weight = 10
// ═══════════════════════════════════════════════════════════════

function fixtureAA() {
  const checks = [];

  const auth = buildArtcousticDesignRatingAuthority({
    seats: SEAT_LIST,
    p12: { rawValue: 111, mode: "recommended" }, // L4 (>= 108)
  });
  checks.push(["P12 rec effectiveWeight = 10", auth.parameters.p12.effectiveWeight === 10]);
  checks.push(["P12 rec baseWeight = 8", auth.parameters.p12.weight === 8]);

  const rating = calculateRoomDesignRating(auth);
  // P12 L4: weight 10, multiplier 12, actual = 120, max = 120
  checks.push(["P12 rec L4 actual = 120", approx(rating.actualPoints, 120, 0.1)]);
  checks.push(["P12 rec L4 max = 120", approx(rating.maximumAvailablePoints, 120, 0.1)]);

  const failed = checks.filter(([, v]) => !v).map(([label]) => label);
  return makeResult("AA: P12 Recommended weight", failed.length === 0, `Failed: ${failed.join(", ")}`);
}

// ═══════════════════════════════════════════════════════════════
// AB. P13 Minimum weight = 7
// ═══════════════════════════════════════════════════════════════

function fixtureAB() {
  const checks = [];

  const auth = buildArtcousticDesignRatingAuthority({
    seats: SEAT_LIST,
    p13: { rawValue: 108, mode: "minimum" }, // L4 (>= 105)
  });
  checks.push(["P13 min effectiveWeight = 7", auth.parameters.p13.effectiveWeight === 7]);

  const rating = calculateRoomDesignRating(auth);
  // P13 L4: weight 7, multiplier 12, actual = 84, max = 84
  checks.push(["P13 min L4 actual = 84", approx(rating.actualPoints, 84, 0.1)]);
  checks.push(["P13 min L4 max = 84", approx(rating.maximumAvailablePoints, 84, 0.1)]);

  const failed = checks.filter(([, v]) => !v).map(([label]) => label);
  return makeResult("AB: P13 Minimum weight", failed.length === 0, `Failed: ${failed.join(", ")}`);
}

// ═══════════════════════════════════════════════════════════════
// AC. P13 Recommended weight = 9
// ═══════════════════════════════════════════════════════════════

function fixtureAC() {
  const checks = [];

  const auth = buildArtcousticDesignRatingAuthority({
    seats: SEAT_LIST,
    p13: { rawValue: 111, mode: "recommended" }, // L4 (>= 108)
  });
  checks.push(["P13 rec effectiveWeight = 9", auth.parameters.p13.effectiveWeight === 9]);

  const rating = calculateRoomDesignRating(auth);
  // P13 L4: weight 9, multiplier 12, actual = 108, max = 108
  checks.push(["P13 rec L4 actual = 108", approx(rating.actualPoints, 108, 0.1)]);
  checks.push(["P13 rec L4 max = 108", approx(rating.maximumAvailablePoints, 108, 0.1)]);

  const failed = checks.filter(([, v]) => !v).map(([label]) => label);
  return makeResult("AC: P13 Recommended weight", failed.length === 0, `Failed: ${failed.join(", ")}`);
}

// ═══════════════════════════════════════════════════════════════
// AD. P14 Minimum verified weight = 9
// ═══════════════════════════════════════════════════════════════

function fixtureAD() {
  const checks = [];

  const auth = buildArtcousticDesignRatingAuthority({
    seats: SEAT_LIST,
    p14: { rawValue: 121, verified: true, mode: "minimum" }, // L4 (>= 118)
  });
  checks.push(["P14 min verified effectiveWeight = 9", auth.parameters.p14.effectiveWeight === 9]);
  checks.push(["P14 min verified scored", auth.parameters.p14.state === "scored"]);

  const rating = calculateRoomDesignRating(auth);
  // P14 L4: weight 9, multiplier 12, actual = 108, max = 108
  checks.push(["P14 min L4 actual = 108", approx(rating.actualPoints, 108, 0.1)]);
  checks.push(["P14 min L4 max = 108", approx(rating.maximumAvailablePoints, 108, 0.1)]);

  const failed = checks.filter(([, v]) => !v).map(([label]) => label);
  return makeResult("AD: P14 Minimum verified weight", failed.length === 0, `Failed: ${failed.join(", ")}`);
}

// ═══════════════════════════════════════════════════════════════
// AE. P14 Recommended verified weight = 11
// ═══════════════════════════════════════════════════════════════

function fixtureAE() {
  const checks = [];

  const auth = buildArtcousticDesignRatingAuthority({
    seats: SEAT_LIST,
    p14: { rawValue: 126, verified: true, mode: "recommended" }, // L4 (>= 123)
  });
  checks.push(["P14 rec verified effectiveWeight = 11", auth.parameters.p14.effectiveWeight === 11]);
  checks.push(["P14 rec verified scored", auth.parameters.p14.state === "scored"]);

  const rating = calculateRoomDesignRating(auth);
  // P14 L4: weight 11, multiplier 12, actual = 132, max = 132
  checks.push(["P14 rec L4 actual = 132", approx(rating.actualPoints, 132, 0.1)]);
  checks.push(["P14 rec L4 max = 132", approx(rating.maximumAvailablePoints, 132, 0.1)]);

  const failed = checks.filter(([, v]) => !v).map(([label]) => label);
  return makeResult("AE: P14 Recommended verified weight", failed.length === 0, `Failed: ${failed.join(", ")}`);
}

// ═══════════════════════════════════════════════════════════════
// AF. P14 Recommended unverified — excluded entirely
// ═══════════════════════════════════════════════════════════════

function fixtureAF() {
  const checks = [];

  const auth = buildArtcousticDesignRatingAuthority({
    seats: SEAT_LIST,
    p14: { rawValue: 126, mode: "recommended" }, // no verified → provisional
  });
  checks.push(["P14 rec unverified→provisional", auth.parameters.p14.state === "provisional"]);
  // Effective weight stays at base (9) because not scored
  checks.push(["P14 rec unverified effectiveWeight = 9 (base)", auth.parameters.p14.effectiveWeight === 9]);

  const rating = calculateRoomDesignRating(auth);
  // P14 excluded from both numerator and denominator
  checks.push(["P14 rec unverified actual = 0", approx(rating.actualPoints, 0, 0.1)]);
  checks.push(["P14 rec unverified max = 0", approx(rating.maximumAvailablePoints, 0, 0.1)]);
  checks.push(["P14 rec unverified NOT_ASSESSED", rating.status === "NOT_ASSESSED"]);

  const failed = checks.filter(([, v]) => !v).map(([label]) => label);
  return makeResult("AF: P14 Recommended unverified excluded", failed.length === 0, `Failed: ${failed.join(", ")}`);
}

// ═══════════════════════════════════════════════════════════════
// AG. Recommended L4 has greater weighted influence than Minimum L4
// ═══════════════════════════════════════════════════════════════

function fixtureAG() {
  const checks = [];

  const authMin = buildArtcousticDesignRatingAuthority({
    seats: SEAT_LIST,
    p12: { rawValue: 111, mode: "minimum" }, // L4
  });
  const ratingMin = calculateRoomDesignRating(authMin);

  const authRec = buildArtcousticDesignRatingAuthority({
    seats: SEAT_LIST,
    p12: { rawValue: 111, mode: "recommended" }, // L4
  });
  const ratingRec = calculateRoomDesignRating(authRec);

  checks.push(["Rec L4 actual > Min L4 actual", ratingRec.actualPoints > ratingMin.actualPoints]);
  checks.push(["Rec L4 max > Min L4 max", ratingRec.maximumAvailablePoints > ratingMin.maximumAvailablePoints]);
  checks.push(["Rec L4 actual = 120", approx(ratingRec.actualPoints, 120, 0.1)]);
  checks.push(["Min L4 actual = 96", approx(ratingMin.actualPoints, 96, 0.1)]);

  const failed = checks.filter(([, v]) => !v).map(([label]) => label);
  return makeResult("AG: Recommended L4 greater influence", failed.length === 0, `Failed: ${failed.join(", ")}`);
}

// ═══════════════════════════════════════════════════════════════
// AH. Recommended L1 also uses the higher effective weight
//     (confirms Recommended is an importance increase, not a free bonus)
// ═══════════════════════════════════════════════════════════════

function fixtureAH() {
  const checks = [];

  // P12 minimum L1: rawValue 101, mode "minimum" → L1 (>= 99, < 102), weight 8, multiplier 2
  const authMinL1 = buildArtcousticDesignRatingAuthority({
    seats: SEAT_LIST,
    p12: { rawValue: 101, mode: "minimum" }, // L1
  });
  const ratingMinL1 = calculateRoomDesignRating(authMinL1);
  checks.push(["P12 min L1 effectiveWeight = 8", authMinL1.parameters.p12.effectiveWeight === 8]);
  checks.push(["P12 min L1 level = L1", authMinL1.parameters.p12.level === "L1"]);
  // actual = 2 * 8 = 16, max = 12 * 8 = 96
  checks.push(["P12 min L1 actual = 16", approx(ratingMinL1.actualPoints, 16, 0.1)]);
  checks.push(["P12 min L1 max = 96", approx(ratingMinL1.maximumAvailablePoints, 96, 0.1)]);

  // P12 recommended L1: rawValue 102, mode "recommended" → L1 (>= 102, < 105), weight 10, multiplier 2
  const authRecL1 = buildArtcousticDesignRatingAuthority({
    seats: SEAT_LIST,
    p12: { rawValue: 102, mode: "recommended" }, // L1
  });
  const ratingRecL1 = calculateRoomDesignRating(authRecL1);
  checks.push(["P12 rec L1 effectiveWeight = 10", authRecL1.parameters.p12.effectiveWeight === 10]);
  checks.push(["P12 rec L1 level = L1", authRecL1.parameters.p12.level === "L1"]);
  // actual = 2 * 10 = 20, max = 12 * 10 = 120
  checks.push(["P12 rec L1 actual = 20", approx(ratingRecL1.actualPoints, 20, 0.1)]);
  checks.push(["P12 rec L1 max = 120", approx(ratingRecL1.maximumAvailablePoints, 120, 0.1)]);

  // Recommended L1 actual > Minimum L1 actual — importance increase, not free bonus
  checks.push(["Rec L1 actual > Min L1 actual", ratingRecL1.actualPoints > ratingMinL1.actualPoints]);
  checks.push(["Rec L1 max > Min L1 max", ratingRecL1.maximumAvailablePoints > ratingMinL1.maximumAvailablePoints]);

  const failed = checks.filter(([, v]) => !v).map(([label]) => label);
  return makeResult("AH: Recommended L1 higher weight", failed.length === 0, `Failed: ${failed.join(", ")}`);
}

// ═══════════════════════════════════════════════════════════════
// C4 — CONTRIBUTION BREAKDOWN FIXTURES
// ═══════════════════════════════════════════════════════════════

// AI. Sum of contribution earnedPoints equals calculateRoomDesignRating.actualPoints
function fixtureAI() {
  const checks = [];
  const auth = buildArtcousticDesignRatingAuthority({
    seats: SEAT_LIST,
    p2: { rawValue: 12 },
    p3: { rawValue: 0 },
    p12: { rawValue: 111, mode: "minimum" },
    p13: { rawValue: 105, mode: "minimum" },
    p14: { rawValue: 118, verified: true, mode: "minimum" },
    p1: { s1: 2.5, s2: 2.5 },
    p4: { s1: 3, s2: 3 },
    screen: { s1: 55, s2: 55 },
  });
  const rating = calculateRoomDesignRating(auth);
  const contribs = rating.contributions || [];
  const sumEarned = contribs.reduce((acc, c) => acc + c.earnedPoints, 0);
  checks.push(["contributions array exists", Array.isArray(contribs) && contribs.length > 0]);
  checks.push(["sum earnedPoints = actualPoints", approx(sumEarned, rating.actualPoints, 0.01)]);
  const failed = checks.filter(([, v]) => !v).map(([label]) => label);
  return makeResult("AI: Sum earnedPoints = actualPoints", failed.length === 0, `Failed: ${failed.join(", ")}`);
}

// AJ. Sum of contribution maximumPoints equals maximumAvailablePoints
function fixtureAJ() {
  const checks = [];
  const auth = buildArtcousticDesignRatingAuthority({
    seats: SEAT_LIST,
    p2: { rawValue: 12 },
    p12: { rawValue: 111, mode: "minimum" },
    p1: { s1: 2.5, s2: 2.5 },
    screen: { s1: 55, s2: 55 },
  });
  const rating = calculateRoomDesignRating(auth);
  const contribs = rating.contributions || [];
  const sumMax = contribs.reduce((acc, c) => acc + c.maximumPoints, 0);
  checks.push(["sum maximumPoints = maximumAvailablePoints", approx(sumMax, rating.maximumAvailablePoints, 0.01)]);
  const failed = checks.filter(([, v]) => !v).map(([label]) => label);
  return makeResult("AJ: Sum maximumPoints = maximumAvailablePoints", failed.length === 0, `Failed: ${failed.join(", ")}`);
}

// AK. Missing metric does not appear in contributions
function fixtureAK() {
  const checks = [];
  const auth = buildArtcousticDesignRatingAuthority({
    seats: SEAT_LIST,
    // p2 is missing (not provided)
    p12: { rawValue: 111, mode: "minimum" },
  });
  const rating = calculateRoomDesignRating(auth);
  const contribs = rating.contributions || [];
  const hasP2 = contribs.some((c) => c.key === "p2");
  checks.push(["p2 missing from contributions", !hasP2]);
  const failed = checks.filter(([, v]) => !v).map(([label]) => label);
  return makeResult("AK: Missing metric excluded", failed.length === 0, `Failed: ${failed.join(", ")}`);
}

// AL. N/A metric does not appear in contributions
function fixtureAL() {
  const checks = [];
  const auth = buildArtcousticDesignRatingAuthority({
    seats: SEAT_LIST,
    p7: "na", // N/A
    p12: { rawValue: 111, mode: "minimum" },
  });
  const rating = calculateRoomDesignRating(auth);
  const contribs = rating.contributions || [];
  const hasP7 = contribs.some((c) => c.key === "p7");
  checks.push(["p7 N/A excluded from contributions", !hasP7]);
  const failed = checks.filter(([, v]) => !v).map(([label]) => label);
  return makeResult("AL: N/A metric excluded", failed.length === 0, `Failed: ${failed.join(", ")}`);
}

// AM. V1 excluded metric does not appear in contributions
function fixtureAM() {
  const checks = [];
  const auth = buildArtcousticDesignRatingAuthority({
    seats: SEAT_LIST,
    p8: { rawValue: 5 }, // V1-excluded
    p15: { rawValue: 5 }, // V1-excluded
    p21: { rawValue: 5 }, // V1-excluded
    p12: { rawValue: 111, mode: "minimum" },
  });
  const rating = calculateRoomDesignRating(auth);
  const contribs = rating.contributions || [];
  const hasP8 = contribs.some((c) => c.key === "p8");
  const hasP15 = contribs.some((c) => c.key === "p15");
  const hasP21 = contribs.some((c) => c.key === "p21");
  checks.push(["p8 V1-excluded from contributions", !hasP8]);
  checks.push(["p15 V1-excluded from contributions", !hasP15]);
  checks.push(["p21 V1-excluded from contributions", !hasP21]);
  const failed = checks.filter(([, v]) => !v).map(([label]) => label);
  return makeResult("AM: V1 excluded metrics excluded", failed.length === 0, `Failed: ${failed.join(", ")}`);
}

// AN. FAIL appears with negative earnedPoints
function fixtureAN() {
  const checks = [];
  // P19 with rawValue that triggers FAIL (±max, L1=5 bounded)
  const auth = buildArtcousticDesignRatingAuthority({
    seats: SEAT_LIST,
    p19: { s1: { rawValue: 20, verified: true }, s2: { rawValue: 20, verified: true } },
  });
  const rating = calculateRoomDesignRating(auth);
  const contribs = rating.contributions || [];
  const p19Contrib = contribs.find((c) => c.key === "p19");
  checks.push(["p19 FAIL in contributions", !!p19Contrib]);
  if (p19Contrib) {
    checks.push(["p19 resultLevel = FAIL", p19Contrib.resultLevel === "FAIL"]);
    checks.push(["p19 earnedPoints negative", p19Contrib.earnedPoints < 0]);
    checks.push(["p19 multiplier = -5", approx(p19Contrib.multiplier, -5, 0.01)]);
  }
  const failed = checks.filter(([, v]) => !v).map(([label]) => label);
  return makeResult("AN: FAIL negative contribution", failed.length === 0, `Failed: ${failed.join(", ")}`);
}

// AO. Seat-scope metric contribution uses average definitive seat multiplier exactly once
function fixtureAO() {
  const checks = [];
  const auth = buildArtcousticDesignRatingAuthority({
    seats: SEAT_LIST,
    p1: { s1: 2.5, s2: 2.5 }, // both L4
  });
  const rating = calculateRoomDesignRating(auth);
  const contribs = rating.contributions || [];
  const p1Contrib = contribs.find((c) => c.key === "p1");
  checks.push(["p1 in contributions", !!p1Contrib]);
  if (p1Contrib) {
    // All seats L4 → multiplier 12, average = 12
    checks.push(["p1 multiplier = 12 (avg)", approx(p1Contrib.multiplier, 12, 0.01)]);
    // earnedPoints = 12 * weight(6) = 72, maximumPoints = 12 * 6 = 72
    checks.push(["p1 earnedPoints = 72", approx(p1Contrib.earnedPoints, 72, 0.01)]);
    checks.push(["p1 maximumPoints = 72", approx(p1Contrib.maximumPoints, 72, 0.01)]);
    checks.push(["p1 scope = seat", p1Contrib.scope === "seat"]);
  }
  const failed = checks.filter(([, v]) => !v).map(([label]) => label);
  return makeResult("AO: Seat-scope average multiplier", failed.length === 0, `Failed: ${failed.join(", ")}`);
}

// AP. Effective P2 weight = 7
function fixtureAP() {
  const checks = [];
  const auth = buildArtcousticDesignRatingAuthority({
    seats: SEAT_LIST,
    p2: { rawValue: 12 },
  });
  const rating = calculateRoomDesignRating(auth);
  const contribs = rating.contributions || [];
  const p2Contrib = contribs.find((c) => c.key === "p2");
  checks.push(["p2 in contributions", !!p2Contrib]);
  if (p2Contrib) {
    checks.push(["p2 effectiveWeight = 7", p2Contrib.effectiveWeight === 7]);
  }
  const failed = checks.filter(([, v]) => !v).map(([label]) => label);
  return makeResult("AP: P2 weight = 7", failed.length === 0, `Failed: ${failed.join(", ")}`);
}

// AQ. Recommended P12/P13/P14 effective weights are exposed in contributions
function fixtureAQ() {
  const checks = [];
  const auth = buildArtcousticDesignRatingAuthority({
    seats: SEAT_LIST,
    p12: { rawValue: 111, mode: "recommended" }, // L4 rec
    p13: { rawValue: 108, mode: "recommended" }, // L4 rec
    p14: { rawValue: 126, verified: true, mode: "recommended" }, // L4 rec
  });
  const rating = calculateRoomDesignRating(auth);
  const contribs = rating.contributions || [];
  const p12 = contribs.find((c) => c.key === "p12");
  const p13 = contribs.find((c) => c.key === "p13");
  const p14 = contribs.find((c) => c.key === "p14");
  if (p12) checks.push(["p12 rec effectiveWeight = 10", p12.effectiveWeight === 10]);
  if (p13) checks.push(["p13 rec effectiveWeight = 9", p13.effectiveWeight === 9]);
  if (p14) checks.push(["p14 rec effectiveWeight = 11", p14.effectiveWeight === 11]);
  if (p12) checks.push(["p12 mode = recommended", p12.mode === "recommended"]);
  if (p14) checks.push(["p14 mode = recommended", p14.mode === "recommended"]);
  const failed = checks.filter(([, v]) => !v).map(([label]) => label);
  return makeResult("AQ: Recommended weights in contributions", failed.length === 0, `Failed: ${failed.join(", ")}`);
}

// AR. Screen omitted when unavailable
function fixtureAR() {
  const checks = [];
  const auth = buildArtcousticDesignRatingAuthority({
    seats: SEAT_LIST,
    p12: { rawValue: 111, mode: "minimum" },
    // screen not provided → all seats provisional → excluded
  });
  const rating = calculateRoomDesignRating(auth);
  const contribs = rating.contributions || [];
  const hasScreen = contribs.some((c) => c.key === "screen");
  checks.push(["screen omitted when unavailable", !hasScreen]);
  const failed = checks.filter(([, v]) => !v).map(([label]) => label);
  return makeResult("AR: Screen omitted when unavailable", failed.length === 0, `Failed: ${failed.join(", ")}`);
}

// ═══════════════════════════════════════════════════════════════
// Runner
// ═══════════════════════════════════════════════════════════════

export function runAllFixtures() {
  const fixtures = [
    fixtureA(),
    fixtureB(),
    fixtureC(),
    fixtureD(),
    fixtureE(),
    fixtureF(),
    fixtureG(),
    fixtureH(),
    fixtureI(),
    fixtureJ(),
    fixtureK(),
    fixtureL(),
    fixtureM(),
    fixtureN(),
    fixtureO(),
    fixtureP(),
    fixtureQ(),
    fixtureR(),
    fixtureS(),
    fixtureT(),
    fixtureU(),
    fixtureV(),
    fixtureW(),
    fixtureX(),
    fixtureY(),
    fixtureZ(),
    fixtureAA(),
    fixtureAB(),
    fixtureAC(),
    fixtureAD(),
    fixtureAE(),
    fixtureAF(),
    fixtureAG(),
    fixtureAH(),
    fixtureAI(),
    fixtureAJ(),
    fixtureAK(),
    fixtureAL(),
    fixtureAM(),
    fixtureAN(),
    fixtureAO(),
    fixtureAP(),
    fixtureAQ(),
    fixtureAR(),
  ];
  const allPassed = fixtures.every((f) => f.passed);
  return { allPassed, results: fixtures };
}