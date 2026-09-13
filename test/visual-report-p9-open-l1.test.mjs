/**
 * visual-report-p9-open-l1.test.mjs
 * ---------------------------------
 * Regression tests for Visual Report P9 (RP22 Parameter 9 — Overhead
 * speaker spacing) open-ended L1 behaviour.
 *
 * P9 thresholds: L4 <= 50°, L3 <= 60°, L2 <= 80°, >80° = L1 (open-ended).
 * P9 has NO separate numeric L1 threshold. A valid numeric P9 result must
 * never become FAIL simply because the angle exceeds 80°.
 *
 * These tests prove:
 *   1. The selector maps engine levels 1-4 to L1-L4 (never FAIL for level 1).
 *   2. The full threshold boundary cases produce correct levels.
 *   3. The Visual Report consumes the same level as the main app.
 *   4. FAIL colour is not used for valid P9 L1 results.
 *
 * Run: node --test test/visual-report-p9-open-l1.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { selectClientP9Overhead } from "../src/components/report/client/selectClientP9Overhead.js";
import { getSeatGradeColors } from "../src/components/report/client/visualReportSeatStyle.js";
import { resolveGradeToken, RP22_GRADE_TOKENS } from "../src/components/utils/rp22Colors.jsx";

// ── Helpers ──────────────────────────────────────────────────────────────

function makeSeat(id, x, y) {
  return { id, x, y };
}

function makeAnalysisResult(perSeat) {
  return { perSeatRp22: perSeat };
}

function makeP9Param(level, degrees) {
  return { level, value: degrees, applicable: true, status: "ok" };
}

function runP9(analysisResult, seats) {
  return selectClientP9Overhead({ analysisResult, seatingPositions: seats });
}

// ── Tests ──────────────────────────────────────────────────────────────────

test("P9 threshold boundaries: 49°→L4, 50°→L4, 51°→L3, 60°→L3, 61°→L2, 80°→L2, 81°→L1, 95°→L1, 120°→L1", () => {
  const cases = [
    { degrees: 49,  want: "L4" },
    { degrees: 50,  want: "L4" },
    { degrees: 51,  want: "L3" },
    { degrees: 60,  want: "L3" },
    { degrees: 61,  want: "L2" },
    { degrees: 80,  want: "L2" },
    { degrees: 81,  want: "L1" },
    { degrees: 95,  want: "L1" },
    { degrees: 120, want: "L1" },
  ];

  for (const c of cases) {
    // Engine produces numeric level for each threshold band.
    // level 4 = <=50°, 3 = <=60°, 2 = <=80°, 1 = >80°
    const engineLevel =
      c.degrees <= 50 ? 4 :
      c.degrees <= 60 ? 3 :
      c.degrees <= 80 ? 2 : 1;

    const seat = makeSeat("s1", 2, 4);
    const result = runP9(
      makeAnalysisResult({ s1: { rp22: { 9: makeP9Param(engineLevel, c.degrees) } } }),
      [seat],
    );

    assert.equal(result.seats.length, 1, `degrees=${c.degrees}: seat count`);
    assert.equal(result.seats[0].p9Level, c.want, `degrees=${c.degrees}: level`);
    assert.equal(result.seats[0].p9Degrees, c.degrees, `degrees=${c.degrees}: degrees preserved`);
    assert.equal(result.seats[0].applicable, true, `degrees=${c.degrees}: applicable`);
  }
});

test("P9 level 1 (engine numeric 1) is never mapped to FAIL", () => {
  for (const degrees of [81, 90, 95, 100, 120, 179, 180]) {
    const seat = makeSeat("s1", 2, 4);
    const result = runP9(
      makeAnalysisResult({ s1: { rp22: { 9: makeP9Param(1, degrees) } } }),
      [seat],
    );
    assert.equal(result.seats[0].p9Level, "L1", `degrees=${degrees}: must be L1 not FAIL`);
    assert.notEqual(result.seats[0].p9Level, "FAIL", `degrees=${degrees}: must not be FAIL`);
  }
});

test("P9 95° = L1 (the reported live example)", () => {
  const seat = makeSeat("s1", 2, 4);
  const result = runP9(
    makeAnalysisResult({ s1: { rp22: { 9: makeP9Param(1, 95) } } }),
    [seat],
  );
  assert.equal(result.seats[0].p9Level, "L1");
  assert.equal(result.seats[0].p9Degrees, 95);
});

test("P9 all-seats-L1 summary says 'All seats achieve L1 overhead speaker spacing.'", () => {
  const seats = [makeSeat("s1", 1, 4), makeSeat("s2", 2, 4), makeSeat("s3", 3, 4)];
  const perSeat = {};
  for (const s of seats) {
    perSeat[s.id] = { rp22: { 9: makeP9Param(1, 95) } };
  }
  const result = runP9(makeAnalysisResult(perSeat), seats);
  assert.equal(result.summary, "All seats achieve L1 overhead speaker spacing.");
  assert.ok(!result.summary.includes("FAIL"), "summary must not contain FAIL");
});

test("P9 L1 uses canonical L1 colour, not FAIL red", () => {
  const l1Colors = getSeatGradeColors("L1");
  const failColors = getSeatGradeColors("FAIL");

  // L1 must NOT be solid (FAIL is solid)
  assert.equal(l1Colors.isFail, false, "L1 must not be marked as fail");
  assert.equal(failColors.isFail, true, "FAIL must be marked as fail");

  // L1 fill must differ from FAIL fill
  assert.notEqual(l1Colors.fill, failColors.fill, "L1 and FAIL fills must differ");
  // L1 must use the warm bronze/clay token, not deep burgundy-brown
  assert.equal(l1Colors.fill, RP22_GRADE_TOKENS.L1.bg, "L1 fill must be canonical L1 bg");
  assert.equal(l1Colors.border, RP22_GRADE_TOKENS.L1.border, "L1 border must be canonical L1 border");
  assert.equal(l1Colors.text, RP22_GRADE_TOKENS.L1.text, "L1 text must be canonical L1 text");
});

test("P9 resolveGradeToken maps numeric 1 to L1 (not FAIL)", () => {
  const r = resolveGradeToken(1);
  assert.equal(r.key, "L1");
  assert.equal(r.label, "L1");
  assert.notEqual(r.key, "FAIL");
});

test("P9 Visual Report consumes the same level as the main app (engine level 1 → L1)", () => {
  // The main app / compliance report reads the engine's perSeatRp22[seat].rp22[9].level
  // and displays it via resolveGradeToken. The Visual Report selector must
  // produce the SAME level string.
  const seat = makeSeat("s1", 2, 4);
  const result = runP9(
    makeAnalysisResult({ s1: { rp22: { 9: makeP9Param(1, 95) } } }),
    [seat],
  );

  // What the main app would show
  const mainAppLevel = resolveGradeToken(1).label;
  // What the visual report shows
  const visualReportLevel = result.seats[0].p9Level;

  assert.equal(visualReportLevel, mainAppLevel, "Visual Report level must match main app level");
  assert.equal(visualReportLevel, "L1");
});

test("P9 five-seat all-L1 fixture: L1 / L1 / L1 / L1 / L1", () => {
  const seats = [
    makeSeat("s1", 1, 3),
    makeSeat("s2", 2, 3),
    makeSeat("s3", 3, 3),
    makeSeat("s4", 1.5, 5),
    makeSeat("s5", 2.5, 5),
  ];
  const perSeat = {};
  for (const s of seats) {
    perSeat[s.id] = { rp22: { 9: makeP9Param(1, 95) }, isPrimary: s.id === "s2" };
  }
  const result = runP9(makeAnalysisResult(perSeat), seats);

  assert.equal(result.seats.length, 5);
  for (const seat of result.seats) {
    assert.equal(seat.p9Level, "L1", `seat ${seat.id} must be L1`);
    assert.notEqual(seat.p9Level, "FAIL", `seat ${seat.id} must not be FAIL`);
  }
  assert.equal(result.summary, "All seats achieve L1 overhead speaker spacing.");
  assert.equal(result.counts.L1, 5);
  assert.equal(result.counts.FAIL, undefined);
});

test("P9 genuine FAIL (engine explicit) is still handled", () => {
  // If the engine explicitly produces "FAIL" (not numeric 1), it should still
  // display as FAIL. This is distinct from numeric level 1 (open-ended L1).
  const seat = makeSeat("s1", 2, 4);
  const result = runP9(
    makeAnalysisResult({ s1: { rp22: { 9: makeP9Param("FAIL", null) } } }),
    [seat],
  );
  assert.equal(result.seats[0].p9Level, "FAIL");
});

test("P9 mixed levels: L4/L3/L2/L1 all coexist without false FAIL", () => {
  const seats = [
    makeSeat("s1", 1, 3),
    makeSeat("s2", 2, 3),
    makeSeat("s3", 3, 3),
    makeSeat("s4", 2, 5),
  ];
  const perSeat = {
    s1: { rp22: { 9: makeP9Param(4, 45) } },   // L4
    s2: { rp22: { 9: makeP9Param(3, 55) } },   // L3
    s3: { rp22: { 9: makeP9Param(2, 70) } },   // L2
    s4: { rp22: { 9: makeP9Param(1, 95) } },   // L1
  };
  const result = runP9(makeAnalysisResult(perSeat), seats);

  assert.equal(result.seats[0].p9Level, "L4");
  assert.equal(result.seats[1].p9Level, "L3");
  assert.equal(result.seats[2].p9Level, "L2");
  assert.equal(result.seats[3].p9Level, "L1");
  assert.equal(result.counts.FAIL, undefined, "no false FAIL");
});