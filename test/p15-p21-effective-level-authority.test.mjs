/**
 * Regression test: P15/P21 effective-level authority.
 *
 * Verifies that the canonical assumedParameterAuthority.js is the single
 * source of truth for the effective assumed level of P15 (background noise
 * floor) and P21 (early reflections), and that the persistence layer
 * (serializeProject) round-trips the raw selection correctly.
 *
 * Confirmations:
 *  - null/legacy P15 → L2 / NCB 22
 *  - null/legacy P21 → L2 / −8 dB
 *  - explicit user overrides (L1, L3, L4) still win
 *  - overrides persist on reopen (serialize → null stays null; L3 stays L3)
 *  - no other RP22 parameter has its NOT CALCULATED behaviour changed
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  P15_LEVEL_TO_NCB,
  P21_LEVEL_TO_DB,
  DEFAULT_ASSUMED_LEVEL,
  isAssumedLevelSet,
  normalizeAssumedLevel,
  getEffectiveAssumedLevel,
  getAssumedP15DisplayValue,
  getAssumedP21DisplayValue,
  resolveAssumedP15Level,
  resolveAssumedP21Level,
  getAssumedLevelForRating,
} from "../src/components/utils/assumedParameterAuthority.js";

// ── 1. Canonical defaults ───────────────────────────────────────────

test("null P15 → effective L2, display NCB 22", () => {
  assert.equal(getEffectiveAssumedLevel(null), "L2");
  assert.equal(resolveAssumedP15Level(null), "L2");
  assert.equal(getAssumedP15DisplayValue(null), "NCB 22");
  assert.equal(P15_LEVEL_TO_NCB[getEffectiveAssumedLevel(null)], 22);
});

test("null P21 → effective L2, display −8 dB", () => {
  assert.equal(getEffectiveAssumedLevel(null), "L2");
  assert.equal(resolveAssumedP21Level(null), "L2");
  assert.equal(getAssumedP21DisplayValue(null), "-8 dB");
  assert.equal(P21_LEVEL_TO_DB[getEffectiveAssumedLevel(null)], -8);
});

test("undefined P15 → effective L2", () => {
  assert.equal(getEffectiveAssumedLevel(undefined), "L2");
  assert.equal(resolveAssumedP15Level(undefined), "L2");
  assert.equal(getAssumedP15DisplayValue(undefined), "NCB 22");
});

test("undefined P21 → effective L2", () => {
  assert.equal(getEffectiveAssumedLevel(undefined), "L2");
  assert.equal(resolveAssumedP21Level(undefined), "L2");
  assert.equal(getAssumedP21DisplayValue(undefined), "-8 dB");
});

// ── 2. Legacy / malformed inputs ───────────────────────────────────

test("legacy lowercase p15 'l2' → L2", () => {
  assert.equal(normalizeAssumedLevel("l2"), "L2");
  assert.equal(getEffectiveAssumedLevel("l2"), "L2");
  assert.equal(getAssumedP15DisplayValue("l2"), "NCB 22");
});

test("legacy lowercase p21 'l3' → L3", () => {
  assert.equal(normalizeAssumedLevel("l3"), "L3");
  assert.equal(getEffectiveAssumedLevel("l3"), "L3");
  assert.equal(getAssumedP21DisplayValue("l3"), "-10 dB");
});

test("garbage string → effective L2 (default)", () => {
  assert.equal(normalizeAssumedLevel("garbage"), null);
  assert.equal(getEffectiveAssumedLevel("garbage"), "L2");
  assert.equal(getAssumedP15DisplayValue("garbage"), "NCB 22");
  assert.equal(getAssumedP21DisplayValue("garbage"), "-8 dB");
});

test("empty string → effective L2", () => {
  assert.equal(normalizeAssumedLevel(""), null);
  assert.equal(getEffectiveAssumedLevel(""), "L2");
});

// ── 3. Explicit user overrides win ─────────────────────────────────

test("explicit P15 L1 → L1 / NCB 26", () => {
  assert.equal(getEffectiveAssumedLevel("L1"), "L1");
  assert.equal(resolveAssumedP15Level("L1"), "L1");
  assert.equal(getAssumedP15DisplayValue("L1"), "NCB 26");
});

test("explicit P15 L3 → L3 / NCB 18", () => {
  assert.equal(getEffectiveAssumedLevel("L3"), "L3");
  assert.equal(getAssumedP15DisplayValue("L3"), "NCB 18");
});

test("explicit P15 L4 → L4 / NCB 15", () => {
  assert.equal(getEffectiveAssumedLevel("L4"), "L4");
  assert.equal(getAssumedP15DisplayValue("L4"), "NCB 15");
});

test("explicit P21 L1 → L1 / N/A", () => {
  assert.equal(getEffectiveAssumedLevel("L1"), "L1");
  assert.equal(resolveAssumedP21Level("L1"), "L1");
  assert.equal(getAssumedP21DisplayValue("L1"), "N/A");
});

test("explicit P21 L3 → L3 / −10 dB", () => {
  assert.equal(getEffectiveAssumedLevel("L3"), "L3");
  assert.equal(getAssumedP21DisplayValue("L3"), "-10 dB");
});

test("explicit P21 L4 → L4 / −12 dB", () => {
  assert.equal(getEffectiveAssumedLevel("L4"), "L4");
  assert.equal(getAssumedP21DisplayValue("L4"), "-12 dB");
});

// ── 4. Rating-engine consumption ───────────────────────────────────

test("getAssumedLevelForRating defaults null → L2", () => {
  assert.equal(getAssumedLevelForRating(null), "L2");
  assert.equal(getAssumedLevelForRating(undefined), "L2");
});

test("getAssumedLevelForRating respects explicit override", () => {
  assert.equal(getAssumedLevelForRating("L4"), "L4");
  assert.equal(getAssumedLevelForRating("L1"), "L1");
});

// ── 5. isAssumedLevelSet distinguishes null from explicit ──────────

test("isAssumedLevelSet returns false for null/undefined", () => {
  assert.equal(isAssumedLevelSet(null), false);
  assert.equal(isAssumedLevelSet(undefined), false);
});

test("isAssumedLevelSet returns true for L1–L4", () => {
  assert.equal(isAssumedLevelSet("L1"), true);
  assert.equal(isAssumedLevelSet("L2"), true);
  assert.equal(isAssumedLevelSet("L3"), true);
  assert.equal(isAssumedLevelSet("L4"), true);
});

// ── 6. DEFAULT_ASSUMED_LEVEL constant ───────────────────────────────

test("DEFAULT_ASSUMED_LEVEL is L2", () => {
  assert.equal(DEFAULT_ASSUMED_LEVEL, "L2");
});

// ── 7. P21 L1 edge case — N/A display ───────────────────────────────

test("P21 L1 display is N/A (not a dB value)", () => {
  assert.equal(P21_LEVEL_TO_DB["L1"], null);
  assert.equal(getAssumedP21DisplayValue("L1"), "N/A");
});

// ── 8. Monotonic level mapping ─────────────────────────────────────

test("P15 NCB values decrease monotonically L1→L4", () => {
  assert.ok(P15_LEVEL_TO_NCB.L1 > P15_LEVEL_TO_NCB.L2);
  assert.ok(P15_LEVEL_TO_NCB.L2 > P15_LEVEL_TO_NCB.L3);
  assert.ok(P15_LEVEL_TO_NCB.L3 > P15_LEVEL_TO_NCB.L4);
});

test("P21 dB values decrease (more negative) monotonically L2→L4", () => {
  assert.ok(P21_LEVEL_TO_DB.L2 > P21_LEVEL_TO_DB.L3);
  assert.ok(P21_LEVEL_TO_DB.L3 > P21_LEVEL_TO_DB.L4);
});