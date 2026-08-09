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

  // P18 verified, worse than L1 (30 Hz — above 30 = worse)
  const b9 = buildArtcousticDesignRatingAuthority({ seats: SEAT_LIST, p18: { rawValue: 35, verified: true } });
  checks.push(["P18 35Hz verified→FAIL", getRoomLevel(b9, "p18") === "FAIL"]);

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
  checks.push(["Room provisional", rating.hasProvisional === true]);
  // P4 weight=5 should NOT be in assessedWeight
  checks.push(["P4 excluded from assessed", rating.assessedWeight === 0 || !rating.assessedWeight >= 5]);
  // P4 IS in applicableWeight (provisional but applicable)
  checks.push(["P4 in applicableWeight", rating.applicableWeight >= 5]);

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
  // Status PROVISIONAL (P8/P15/P21 excluded)
  checks.push(["Status PROVISIONAL", rating.status === "PROVISIONAL"]);
  // Coverage < 100%
  checks.push(["Coverage < 100%", rating.coveragePercent < 100]);
  // Coverage ≈ 93.39% (113 assessed / 121 applicable)
  checks.push(["Coverage ≈ 93.39%", approx(rating.coveragePercent, 93.39, 0.5)]);
  // applicableWeight includes excluded (121 = 113 + 8)
  checks.push(["applicableWeight=121", rating.applicableWeight === 121]);
  // assessedWeight excludes P8/P15/P21 (113)
  checks.push(["assessedWeight=113", rating.assessedWeight === 113]);
  // Not COMPLETE
  checks.push(["Not COMPLETE", rating.status !== "COMPLETE"]);

  const failed = checks.filter(([, v]) => !v).map(([label]) => label);
  return makeResult("S: Assumption coverage", failed.length === 0, `Failed: ${failed.join(", ")}`);
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
  ];
  const allPassed = fixtures.every((f) => f.passed);
  return { allPassed, results: fixtures };
}