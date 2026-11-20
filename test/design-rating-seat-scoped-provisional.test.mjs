// design-rating-seat-scoped-provisional.test.mjs
// Regression: seat-scoped parameter state must be "scored" when at least one
// seat has a genuine calculated grade. Provisional and N/A seats are skipped
// INDIVIDUALLY inside calculateRoomDesignRatingCore — they never cause the
// whole parameter to be excluded.
//
// CONFIRMED DEFECT:
//   buildArtcousticDesignRatingAuthority classified seat-scope parameters as
//   "provisional" if ANY seat (across the entire project) was provisional.
//   calculateRoomDesignRatingCore then short-circuited at the parameter level
//   before the seat-level loop could skip provisional/N/A seats individually.
//   Result: P20 was excluded from ALL scoped ratings whenever a single
//   secondary seat was not calculated, while p20SeatAuthority.primary.floor
//   still reported the calculated floor — a mixed-revision symptom.
//
// FIX:
//   paramState = allNa ? "na" : hasScored ? "scored" : "provisional"
//   The existing seat-level loop in calculateRoomDesignRatingCore already
//   skips provisional and N/A seats individually — that logic is unchanged.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  buildArtcousticDesignRatingAuthority,
  calculateScopedRoomDesignRating,
} from "@/components/report/technical/artcousticSystemDesignRating";

// ── Helpers ──

function getContribution(scopedRating, key) {
  return (scopedRating?.contributions || []).find((c) => c.key === key) || null;
}

// ═══════════════════════════════════════════════════════════════
// TEST 1: Mixed calculated/provisional — OOHAV acceptance
// Primary seats L3+L3, Secondary seats provisional.
// P20 must be SCORED; Primary scope L3; Secondary scope no P20.
// ═══════════════════════════════════════════════════════════════

test("Mixed calculated/provisional: P20 scored, Primary L3, Secondary no P20", () => {
  const seats = [
    { id: "p1", priority: "primary" },
    { id: "p2", priority: "primary" },
    { id: "s1", priority: "secondary" },
    { id: "s2", priority: "secondary" },
    { id: "s3", priority: "secondary" },
  ];
  const input = {
    seats,
    p20: {
      p1: { verified: true, authoritativeLevel: "L3" },
      p2: { verified: true, authoritativeLevel: "L3" },
      s1: null,
      s2: null,
      s3: null,
    },
  };

  const authority = buildArtcousticDesignRatingAuthority(input);

  // Parameter-level state must be "scored" (at least one scored seat)
  assert.equal(authority.parameters.p20.state, "scored",
    "P20 paramState must be SCORED when primary seats are scored");

  // Primary scope: P20 present with L3
  const primaryScoped = calculateScopedRoomDesignRating(authority, ["p1", "p2"]);
  const p20Primary = getContribution(primaryScoped, "p20");
  assert.ok(p20Primary, "P20 must be present in Primary scope contributions");
  assert.equal(p20Primary.resultLevel, "L3",
    "P20 Primary resultLevel must be L3");

  // Secondary scope: P20 absent (all provisional seats skipped individually)
  const secondaryScoped = calculateScopedRoomDesignRating(authority, ["s1", "s2", "s3"]);
  const p20Secondary = getContribution(secondaryScoped, "p20");
  assert.equal(p20Secondary, null,
    "P20 must NOT be present in Secondary scope (all seats provisional)");
});

// ═══════════════════════════════════════════════════════════════
// TEST 2: One scored seat among scored/provisional/N-A
// seat1=L2, seat2=provisional, seat3=N/A (uses P10 which supports N/A)
// ═══════════════════════════════════════════════════════════════

test("One scored seat: paramState SCORED, scope-seat1 L2, scope-seat2/seat3 no contrib", () => {
  const seats = [
    { id: "seat1" },
    { id: "seat2" },
    { id: "seat3" },
  ];
  // P10 supports N/A (no upper speakers). rawValue 7 dB → L2 (≤8).
  const input = {
    seats,
    p10: {
      seat1: { rawValue: 7 },
      seat2: null,
      seat3: "na",
    },
  };

  const authority = buildArtcousticDesignRatingAuthority(input);

  // Parameter-level state must be "scored" (seat1 is scored)
  assert.equal(authority.parameters.p10.state, "scored",
    "P10 paramState must be SCORED when at least one seat is scored");

  // Scope with seat1 only: P10 present with L2
  const scope1 = calculateScopedRoomDesignRating(authority, ["seat1"]);
  const p10s1 = getContribution(scope1, "p10");
  assert.ok(p10s1, "P10 must be present in scope-seat1");
  assert.equal(p10s1.resultLevel, "L2",
    "P10 scope-seat1 resultLevel must be L2");

  // Scope with seat2 only: P10 absent (provisional seat skipped individually)
  const scope2 = calculateScopedRoomDesignRating(authority, ["seat2"]);
  const p10s2 = getContribution(scope2, "p10");
  assert.equal(p10s2, null,
    "P10 must NOT be present in scope-seat2 (provisional seat skipped)");

  // Scope with seat3 only: P10 absent (N/A seat skipped individually)
  const scope3 = calculateScopedRoomDesignRating(authority, ["seat3"]);
  const p10s3 = getContribution(scope3, "p10");
  assert.equal(p10s3, null,
    "P10 must NOT be present in scope-seat3 (N/A seat skipped)");
});

// ═══════════════════════════════════════════════════════════════
// TEST 3: All provisional — paramState PROVISIONAL, no published grade
// ═══════════════════════════════════════════════════════════════

test("All provisional: paramState PROVISIONAL, no contribution", () => {
  const seats = [{ id: "s1" }, { id: "s2" }];
  const input = {
    seats,
    p20: { s1: null, s2: null },
  };

  const authority = buildArtcousticDesignRatingAuthority(input);

  assert.equal(authority.parameters.p20.state, "provisional",
    "P20 paramState must be PROVISIONAL when all seats are provisional");

  const scoped = calculateScopedRoomDesignRating(authority, ["s1", "s2"]);
  const p20 = getContribution(scoped, "p20");
  assert.equal(p20, null, "P20 must NOT contribute when all seats provisional");
});

// ═══════════════════════════════════════════════════════════════
// TEST 4: All N/A — paramState N/A (not provisional, not scored)
// ═══════════════════════════════════════════════════════════════

test("All N/A: paramState NA, no contribution", () => {
  const seats = [{ id: "s1" }, { id: "s2" }];
  const input = {
    seats,
    p10: { s1: "na", s2: "na" },
  };

  const authority = buildArtcousticDesignRatingAuthority(input);

  assert.equal(authority.parameters.p10.state, "na",
    "P10 paramState must be NA when all seats are N/A");

  const scoped = calculateScopedRoomDesignRating(authority, ["s1", "s2"]);
  const p10 = getContribution(scoped, "p10");
  assert.equal(p10, null, "P10 must NOT contribute when all seats N/A");
});

// ═══════════════════════════════════════════════════════════════
// TEST 5: P20 raw values remain irrelevant — authoritativeLevel is the authority
// Supply contradictory rawValue; published grade must come from authoritativeLevel.
// ═══════════════════════════════════════════════════════════════

test("P20 raw values irrelevant: authoritativeLevel governs, not rawValue", () => {
  const seats = [{ id: "s1" }, { id: "s2" }];
  // authoritativeLevel L3 but rawValue 999 (would imply terrible deviation).
  // The grade must remain L3 — rawValue is diagnostic only.
  const input = {
    seats,
    p20: {
      s1: { verified: true, authoritativeLevel: "L3", rawValue: 999 },
      s2: { verified: true, authoritativeLevel: "L3", rawValue: -50 },
    },
  };

  const authority = buildArtcousticDesignRatingAuthority(input);
  assert.equal(authority.parameters.p20.state, "scored",
    "P20 must be SCORED with verified authoritative levels");

  const scoped = calculateScopedRoomDesignRating(authority, ["s1", "s2"]);
  const p20 = getContribution(scoped, "p20");
  assert.ok(p20, "P20 must contribute");
  assert.equal(p20.resultLevel, "L3",
    "P20 resultLevel must be L3 from authoritativeLevel, not re-graded from rawValue");

  // Seat-level grades must match authoritativeLevel, not rawValue
  assert.equal(authority.parameters.p20.seats.s1.level, "L3",
    "Seat s1 level must be L3 (authoritativeLevel), not re-graded from rawValue 999");
  assert.equal(authority.parameters.p20.seats.s2.level, "L3",
    "Seat s2 level must be L3 (authoritativeLevel), not re-graded from rawValue -50");
});

// ═══════════════════════════════════════════════════════════════
// TEST 6: Generic audit — P5 and P9 also benefit from the fix
// Verifies the correction is not a P20-only special case.
// ═══════════════════════════════════════════════════════════════

test("Generic: P5 scored/provisional mix → SCORED, provisional seat skipped", () => {
  const seats = [{ id: "a" }, { id: "b" }];
  // P5 surround spacing. rawValue 45° → L4 (≤50).
  const input = {
    seats,
    p5: {
      a: { rawValue: 45 },
      b: null, // provisional
    },
  };

  const authority = buildArtcousticDesignRatingAuthority(input);
  assert.equal(authority.parameters.p5.state, "scored",
    "P5 paramState must be SCORED when at least one seat is scored");

  const scopeA = calculateScopedRoomDesignRating(authority, ["a"]);
  const p5a = getContribution(scopeA, "p5");
  assert.ok(p5a, "P5 must be present in scope-a");
  assert.equal(p5a.resultLevel, "L4", "P5 scope-a resultLevel must be L4");

  const scopeB = calculateScopedRoomDesignRating(authority, ["b"]);
  const p5b = getContribution(scopeB, "p5");
  assert.equal(p5b, null,
    "P5 must NOT be present in scope-b (provisional seat skipped individually)");
});

test("Generic: P9 scored/na mix → SCORED, N/A seat skipped", () => {
  const seats = [{ id: "a" }, { id: "b" }];
  // P9 upper spacing. rawValue 55° → L3 (≤60).
  const input = {
    seats,
    p9: {
      a: { rawValue: 55 },
      b: "na", // no upper speakers at this seat
    },
  };

  const authority = buildArtcousticDesignRatingAuthority(input);
  assert.equal(authority.parameters.p9.state, "scored",
    "P9 paramState must be SCORED when at least one seat is scored");

  const scopeA = calculateScopedRoomDesignRating(authority, ["a"]);
  const p9a = getContribution(scopeA, "p9");
  assert.ok(p9a, "P9 must be present in scope-a");

  const scopeB = calculateScopedRoomDesignRating(authority, ["b"]);
  const p9b = getContribution(scopeB, "p9");
  assert.equal(p9b, null,
    "P9 must NOT be present in scope-b (N/A seat skipped individually)");
});

// ═══════════════════════════════════════════════════════════════
// TEST 7: FAIL grade is a genuine scored seat, not provisional
// A FAIL P20 seat must be scored (included), not excluded as provisional.
// ═══════════════════════════════════════════════════════════════

test("FAIL P20 seat is scored (not provisional): contributes FAIL to scope", () => {
  const seats = [{ id: "s1" }, { id: "s2" }];
  const input = {
    seats,
    p20: {
      s1: { verified: true, authoritativeLevel: "FAIL" },
      s2: { verified: true, authoritativeLevel: "L3" },
    },
  };

  const authority = buildArtcousticDesignRatingAuthority(input);
  assert.equal(authority.parameters.p20.state, "scored",
    "P20 paramState must be SCORED when seats have verified grades (including FAIL)");

  const scoped = calculateScopedRoomDesignRating(authority, ["s1", "s2"]);
  const p20 = getContribution(scoped, "p20");
  assert.ok(p20, "P20 must contribute when seats are scored (including FAIL)");
  // Highest valid group level is L3; the individual FAIL remains intact.
  assert.equal(p20.resultLevel, "L3");
  assert.equal(authority.parameters.p20.seats.s1.level, "FAIL");
});