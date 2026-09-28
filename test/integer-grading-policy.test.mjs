// test/integer-grading-policy.test.mjs
//
// Formal proof tests for the Sound Proof integer grading policy.
//
// Policy:
//   - Lower-is-better (P19/P20/P18 deviation/tolerance): FLOOR before display and grading.
//   - Higher-is-better (P14/SPL/output capability): CEIL before display and grading.
//
// Run: node --import ./test/_alias-register.mjs test/integer-grading-policy.test.mjs

import test from "node:test";
import assert from "node:assert/strict";

import { floorBassDeviation, gradeP19, gradeP20 } from "@/components/utils/rp22/bassGradingAuthority";
import { gradeP14Minimum, gradeP14Recommended, gradeP14ForBasis } from "@/components/utils/p14CapabilityAuthority";
import { ceilSplDisplayValue, formatSplDisplay } from "@/components/utils/splDisplayFormatter";
import { resolveRp22DesignValue } from "@/components/utils/rp22/resolveRp22DesignValue";

// ── LOWER-IS-BETTER FLOOR TESTS (P19 / P20) ──────────────────────────────

test("P19 floor: 2.884 dB grades as 2 dB", () => {
  assert.equal(floorBassDeviation(2.884), 2);
  assert.equal(gradeP19(2.884), 4); // floored 2 → L4
});

test("P19 floor: 3.483 dB grades as 3 dB", () => {
  assert.equal(floorBassDeviation(3.483), 3);
  assert.equal(gradeP19(3.483), 3); // floored 3 → L3
});

test("P19 floor: 4.954 dB grades as 4 dB", () => {
  assert.equal(floorBassDeviation(4.954), 4);
  assert.equal(gradeP19(4.954), 2); // floored 4 → L2
});

test("P19 floor: 5.000 dB grades as 5 dB (stays at 5 until it reaches 5.000)", () => {
  assert.equal(floorBassDeviation(5.000), 5);
  assert.equal(gradeP19(5.000), 1); // floored 5 → L1
});

test("P19 floor: 4.999 stays at 4 dB", () => {
  assert.equal(floorBassDeviation(4.999), 4);
  assert.equal(gradeP19(4.999), 2); // floored 4 → L2
});

test("P20 floor: 2.884 dB grades as 2 dB", () => {
  assert.equal(floorBassDeviation(2.884), 2);
  assert.equal(gradeP20(2.884), 4); // floored 2 → L4
});

test("P20 floor: 3.483 dB grades as 3 dB", () => {
  assert.equal(floorBassDeviation(3.483), 3);
  assert.equal(gradeP20(3.483), 3); // floored 3 → L3
});

test("P20 floor: 4.954 dB grades as 4 dB", () => {
  assert.equal(floorBassDeviation(4.954), 4);
  assert.equal(gradeP20(4.954), 2); // floored 4 → L2
});

test("P20 floor: 5.000 dB grades as 5 dB", () => {
  assert.equal(floorBassDeviation(5.000), 5);
  assert.equal(gradeP20(5.000), 1); // floored 5 → L1
});

// ── P14 / SPL CEIL TESTS (higher-is-better) ─────────────────────────────

test("P14 ceil: 110.000 remains 110 dB", () => {
  assert.equal(ceilSplDisplayValue(110.000), 110);
  assert.equal(gradeP14Minimum(110.000), 1); // 110 >= 109 → L1
});

test("P14 ceil: 110.001 becomes 111 dB", () => {
  assert.equal(ceilSplDisplayValue(110.001), 111);
  assert.equal(gradeP14Minimum(110.001), 1); // ceiled 111 >= 109 → L1
});

test("P14 ceil: 110.4 becomes 111 dB", () => {
  assert.equal(ceilSplDisplayValue(110.4), 111);
  assert.equal(gradeP14Minimum(110.4), 1); // ceiled 111 >= 109 → L1
});

test("P14 ceil: 110.9 becomes 111 dB", () => {
  assert.equal(ceilSplDisplayValue(110.9), 111);
  assert.equal(gradeP14Minimum(110.9), 1); // ceiled 111 >= 109 → L1
});

test("P14 ceil: 108.999 becomes 109 dB (crosses L1 threshold)", () => {
  assert.equal(ceilSplDisplayValue(108.999), 109);
  assert.equal(gradeP14Minimum(108.999), 1); // ceiled 109 >= 109 → L1 (was FAIL without ceil)
});

test("P14 ceil: 108.000 remains 108 dB (stays FAIL)", () => {
  assert.equal(ceilSplDisplayValue(108.000), 108);
  assert.equal(gradeP14Minimum(108.000), 0); // 108 < 109 → FAIL
});

test("P14 recommended ceil: 113.999 becomes 114 dB (crosses L1 threshold)", () => {
  assert.equal(ceilSplDisplayValue(113.999), 114);
  assert.equal(gradeP14Recommended(113.999), 1); // ceiled 114 >= 114 → L1
});

test("P14 recommended ceil: 113.000 remains 113 dB (stays FAIL)", () => {
  assert.equal(ceilSplDisplayValue(113.000), 113);
  assert.equal(gradeP14Recommended(113.000), 0); // 113 < 114 → FAIL
});

test("formatSplDisplay ceils fractional SPL", () => {
  assert.equal(formatSplDisplay(110.4), "111 dBC");
  assert.equal(formatSplDisplay(110.9), "111 dBC");
  assert.equal(formatSplDisplay(110.000), "110 dBC");
});

// ── resolveRp22DesignValue consistency ───────────────────────────────────

test("resolveRp22DesignValue floors P19 (lower-is-better)", () => {
  assert.equal(resolveRp22DesignValue(19, 2.884), 2);
  assert.equal(resolveRp22DesignValue(19, 4.954), 4);
  assert.equal(resolveRp22DesignValue(19, 5.000), 5);
});

test("resolveRp22DesignValue floors P20 (lower-is-better)", () => {
  assert.equal(resolveRp22DesignValue(20, 2.884), 2);
  assert.equal(resolveRp22DesignValue(20, 4.954), 4);
  assert.equal(resolveRp22DesignValue(20, 5.000), 5);
});

test("resolveRp22DesignValue floors P18 Hz (lower-is-better)", () => {
  assert.equal(resolveRp22DesignValue(18, 22.884), 22);
  assert.equal(resolveRp22DesignValue(18, 22.000), 22);
});

test("resolveRp22DesignValue ceils P14 (higher-is-better)", () => {
  assert.equal(resolveRp22DesignValue(14, 110.000), 110);
  assert.equal(resolveRp22DesignValue(14, 110.001), 111);
  assert.equal(resolveRp22DesignValue(14, 110.4), 111);
  assert.equal(resolveRp22DesignValue(14, 110.9), 111);
});

test("resolveRp22DesignValue ceils P12/P13 (higher-is-better)", () => {
  assert.equal(resolveRp22DesignValue(12, 100.4), 101);
  assert.equal(resolveRp22DesignValue(13, 100.9), 101);
});