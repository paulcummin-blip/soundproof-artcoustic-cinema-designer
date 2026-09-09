// p10-fail-presentation.test.mjs
// Focused regression tests for the confirmed P10 FAIL presentation defect.
//
// CONFIRMED DEFECT:
//   Two Yarm rear outer seats calculated 14.11 dB → 14 dB / FAIL.
//   The canonical P10 level is numeric 0.
//   The presentation path treated numeric 0 as falsy (via `|| "—"`) and
//   replaced the valid calculated FAIL level with "—".
//
// FIX:
//   A new normalizeLevelForDisplay helper converts numeric 0 to "FAIL"
//   before it reaches any `|| "—"` pattern. The helper is applied at all
//   seat-level display call sites.
//
// These tests prove:
//   1. numeric 0 renders FAIL
//   2. null/undefined remain NOT CALCULATED (—)
//   3. numeric 1–4 render L1–L4
//   4. string levels ("L1", "FAIL", "N/A") pass through unchanged
//   5. empty string and "—" render —
//   6. The `|| "—"` pattern (old bug) treats 0 as falsy
//   7. The `normalizeLevelForDisplay` pattern (fix) treats 0 as FAIL

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { normalizeLevelForDisplay } from "@/components/utils/rp22LevelDisplay";

describe("P10 FAIL Presentation — Defect 2", () => {
  test("1. numeric 0 renders FAIL", () => {
    assert.equal(normalizeLevelForDisplay(0), "FAIL");
  });

  test("2. null remains NOT CALCULATED (—)", () => {
    assert.equal(normalizeLevelForDisplay(null), "—");
  });

  test("3. undefined remains NOT CALCULATED (—)", () => {
    assert.equal(normalizeLevelForDisplay(undefined), "—");
  });

  test("4. numeric 1–4 render L1–L4", () => {
    assert.equal(normalizeLevelForDisplay(1), "L1");
    assert.equal(normalizeLevelForDisplay(2), "L2");
    assert.equal(normalizeLevelForDisplay(3), "L3");
    assert.equal(normalizeLevelForDisplay(4), "L4");
  });

  test("5. string L1–L4 pass through unchanged", () => {
    assert.equal(normalizeLevelForDisplay("L1"), "L1");
    assert.equal(normalizeLevelForDisplay("L2"), "L2");
    assert.equal(normalizeLevelForDisplay("L3"), "L3");
    assert.equal(normalizeLevelForDisplay("L4"), "L4");
  });

  test("6. string FAIL passes through unchanged", () => {
    assert.equal(normalizeLevelForDisplay("FAIL"), "FAIL");
  });

  test("7. string N/A passes through unchanged", () => {
    assert.equal(normalizeLevelForDisplay("N/A"), "N/A");
  });

  test("8. empty string renders —", () => {
    assert.equal(normalizeLevelForDisplay(""), "—");
  });

  test("9. string — renders —", () => {
    assert.equal(normalizeLevelForDisplay("—"), "—");
    assert.equal(normalizeLevelForDisplay("-"), "—");
  });

  test("10. The old `|| '—'` pattern treats 0 as falsy (bug reproduction)", () => {
    // This is the old bug: `0 || "—"` evaluates to "—" because 0 is falsy
    const oldPattern = (level) => level || "—";
    assert.equal(oldPattern(0), "—", "Old pattern: 0 || '—' should give '—' (the bug)");
    assert.equal(oldPattern(1), 1, "Old pattern: 1 || '—' should give 1 (works for L1)");
    assert.equal(oldPattern(null), "—", "Old pattern: null || '—' should give '—' (correct)");
  });

  test("11. The new `normalizeLevelForDisplay` pattern treats 0 as FAIL (fix)", () => {
    // This is the fix: normalizeLevelForDisplay(0) returns "FAIL"
    assert.equal(normalizeLevelForDisplay(0), "FAIL", "New pattern: 0 should give 'FAIL'");
    assert.equal(normalizeLevelForDisplay(1), "L1", "New pattern: 1 should give 'L1'");
    assert.equal(normalizeLevelForDisplay(null), "—", "New pattern: null should give '—'");
  });

  test("12. Yarm-style 14 dB / FAIL scenario renders FAIL", () => {
    // The Yarm audit found two rear outer seats with 14.11 dB → level 0 (FAIL)
    // The old `|| "—"` pattern would display "—" instead of "FAIL"
    const yarmLevel = 0; // gradeP10 returns 0 for > 12 dB
    assert.equal(yarmLevel || "—", "—", "Old pattern would show — for Yarm FAIL");
    assert.equal(normalizeLevelForDisplay(yarmLevel), "FAIL", "New pattern shows FAIL for Yarm");
  });
});