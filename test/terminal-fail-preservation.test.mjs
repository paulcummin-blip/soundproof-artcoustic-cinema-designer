// terminal-fail-preservation.test.mjs
// ---------------------------------------------------------------------------
// A calculated FAIL is a COMPLETE engineering result, not a missing one.
//
// Regression for the Case C defect: a finite beyond-L1 P6 result was graded
// { level: 'N/A', ok: false } by the bounded RP22 level mappers — the SAME
// return they use for non-finite / missing input. applyMapper (in
// artcousticSystemDesignRating.js) could not tell a genuine calculated FAIL
// from missing data, so it returned { level: null, provisional: true }.
// scoreSeatParam then state:"provisional" → parameterAuthority state
// "provisional" → assessEngineeringReportCompleteness treated the parameter
// as non-terminal → assessment blocked → publication blocked → Project
// Report readiness blocked.
//
// The fix: the four bounded mappers (P4, P6, P10, P16) now return
// { level: 'FAIL', ok: false } for the finite beyond-L1 case. Threshold
// boundaries and maths are unchanged — only the outcome label is corrected.
// applyMapper's existing canFail branch already recognises 'FAIL' (and
// rejects 'N/A'), so a calculated failure stays terminal.
//
// Run: node --import ./test/_alias-register.mjs test/terminal-fail-preservation.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  levelP4_screenDelta,
  levelP6_surDelta,
  levelP10_upperDelta,
  levelP16_screenFR,
} from "@/components/utils/rp22/levels";
import { buildArtcousticDesignRatingAuthority } from "@/components/report/technical/artcousticSystemDesignRating";
import { assessEngineeringReportCompleteness, isEngineeringReportComplete } from "@/components/engineering/engineeringReportCompleteness";
import { publicationSectionReport } from "@/components/engineering/publicationGateCore";

// ── Helpers ──────────────────────────────────────────────────────────────

const SEAT_IDS = ["seat-r1-c1", "seat-r1-c2", "seat-r2-c1", "seat-r2-c2", "seat-r2-c3"];
const SEAT_SCOPED_KEYS = ["p1", "p4", "p5", "p6", "p9", "p10", "p16", "p17", "p19", "p20"];

const seatRows = (level = "L4") => Object.fromEntries(
  SEAT_IDS.map((seatId) => [seatId, { state: "scored", level }]),
);

/**
 * A complete RP22 summary where every required parameter is terminal.
 * `p6SeatLevel` lets a caller place a genuine calculated FAIL on every P6 seat
 * while the rest of the assessment stays fully calculated.
 */
function completeSummary({ p6SeatLevel = "L4", p4SeatLevel = "L4" } = {}) {
  const parameterAuthority = {};
  for (let i = 1; i <= 21; i += 1) {
    const key = `p${i}`;
    const seatScoped = ["p1", "p4", "p5", "p6", "p9", "p10", "p16", "p17"].includes(key);
    if (key === "p6") {
      parameterAuthority[key] = { state: "scored", scope: "seat", level: null, seats: seatRows(p6SeatLevel) };
    } else if (key === "p4") {
      parameterAuthority[key] = { state: "scored", scope: "seat", level: null, seats: seatRows(p4SeatLevel) };
    } else if (seatScoped) {
      parameterAuthority[key] = { state: "scored", scope: "seat", level: null, seats: seatRows() };
    } else {
      parameterAuthority[key] = { state: "scored", scope: "room", level: "L4", seats: null };
    }
  }
  parameterAuthority.screen = { state: "scored", scope: "seat", level: null, seats: seatRows() };
  return {
    parameterAuthority,
    project: { seatIds: SEAT_IDS },
    seatHudById: Object.fromEntries(SEAT_IDS.map((seatId) => [seatId, {}])),
    roomResultsByParameter: {
      12: { state: "scored", status: "scored", level: "L4", value: 105 },
      13: { state: "scored", status: "scored", level: "L4", value: 105 },
      14: { state: "scored", status: "scored", level: "L1", value: 109 },
      18: { state: "scored", status: "scored", level: "L2", value: 22 },
      19: { state: "scored", status: "complete", level: "L4", value: 0.952, isAuthoritative: true },
      20: { state: "scored", status: "scored", level: "L4", value: 1.0 },
    },
    bassAuthorityCurrent: true,
  };
}

/** A minimal publication wrapping a complete summary, for the gate section report. */
function publicationFromSummary(summary) {
  return {
    engineering_fingerprint: "eng:test:fail-preserved",
    published_at: "2026-11-03T00:00:00.000Z",
    engine_version: "v1",
    rp22_version: "v1",
    algorithm_version: "v1",
    engineering_summary: {
      ...summary,
      designRating: { rating: { overall: 0.8 } },
      seatPriorityFingerprint: "seat-fp-test",
      viewing: { angleDeg: 38 },
    },
    report_snapshot: {
      analysisResult: { p6: { level: summary.parameterAuthority.p6.seats["seat-r1-c1"].level } },
      priceData: { total: 1 },
      seatingPositions: SEAT_IDS.map((id) => ({ id })),
      placedSpeakers: [{ role: "FL" }],
      report_project: { roomDims: { widthM: 4.5, lengthM: 6.0 }, screen_size: 120 },
    },
    provenance: { engineeringFingerprint: "eng:test:fail-preserved" },
  };
}

// ===========================================================================
// 1. STATE CHAIN — P6 finite beyond-L1 → terminal FAIL, not provisional
// ===========================================================================

test("P6 state chain: levelP6_surDelta(15) → { level: 'FAIL', ok: false }", () => {
  const result = levelP6_surDelta(15);
  assert.equal(result.level, "FAIL");
  assert.equal(result.ok, false);
});

test("P6 state chain: applyMapper via scoreSeatParam → state 'scored', level 'FAIL'", () => {
  const authority = buildArtcousticDesignRatingAuthority({
    seats: [{ id: "s1", priority: "primary" }],
    p6: { s1: 15 }, // finite beyond-L1 → genuine FAIL
  });
  const seat = authority.parameters.p6.seats.s1;
  assert.equal(seat.state, "scored");
  assert.equal(seat.level, "FAIL");
  assert.notEqual(seat.state, "provisional");
  // Parameter-level state is "scored" because at least one seat is scored.
  assert.equal(authority.parameters.p6.state, "scored");
});

test("P6 state chain: parameterAuthority carries level 'FAIL' on the seat", () => {
  const authority = buildArtcousticDesignRatingAuthority({
    seats: [{ id: "s1", priority: "primary" }],
    p6: { s1: 15 },
  });
  assert.equal(authority.parameters.p6.seats.s1.level, "FAIL");
  assert.equal(authority.parameters.p6.seats.s1.state, "scored");
});

test("P6 state chain: assessEngineeringReportCompleteness → complete with a terminal P6 FAIL", () => {
  const summary = completeSummary({ p6SeatLevel: "FAIL" });
  const gate = assessEngineeringReportCompleteness(summary);
  assert.equal(gate.complete, true, `expected complete, missing=${gate.missingParameterKeys.join(",")}`);
  assert.equal(isEngineeringReportComplete(summary), true);
});

test("P6 state chain: publicationSectionReport rp22_parameters ok with a terminal P6 FAIL", () => {
  const summary = completeSummary({ p6SeatLevel: "FAIL" });
  const report = publicationSectionReport(publicationFromSummary(summary));
  const rp22 = report.items.find((i) => i.key === "rp22_parameters");
  assert.equal(rp22.ok, true);
});

// ===========================================================================
// 2. P6 PASS / FAIL / MISSING
// ===========================================================================

test("P6 PASS: finite in-range value → terminal scored, not provisional", () => {
  const authority = buildArtcousticDesignRatingAuthority({
    seats: [{ id: "s1", priority: "primary" }],
    p6: { s1: 3 }, // ≤ 4 → L3
  });
  const seat = authority.parameters.p6.seats.s1;
  assert.equal(seat.state, "scored");
  assert.equal(seat.level, "L3");
  assert.notEqual(seat.state, "provisional");
});

test("P6 FAIL: finite beyond-L1 value → level FAIL, terminal scored, not provisional", () => {
  const authority = buildArtcousticDesignRatingAuthority({
    seats: [{ id: "s1", priority: "primary" }],
    p6: { s1: 15 },
  });
  const seat = authority.parameters.p6.seats.s1;
  assert.equal(seat.level, "FAIL");
  assert.equal(seat.state, "scored");
  assert.notEqual(seat.state, "provisional");
  // Assessment remains complete.
  const gate = assessEngineeringReportCompleteness(completeSummary({ p6SeatLevel: "FAIL" }));
  assert.equal(gate.complete, true);
});

test("P6 MISSING: non-finite input → provisional, assessment incomplete", () => {
  const authority = buildArtcousticDesignRatingAuthority({
    seats: [{ id: "s1", priority: "primary" }],
    p6: { s1: NaN },
  });
  const seat = authority.parameters.p6.seats.s1;
  assert.equal(seat.state, "provisional");
  assert.equal(seat.level, null);
  // An assessment whose P6 seat is provisional is incomplete.
  const summary = completeSummary();
  summary.parameterAuthority.p6.seats["seat-r1-c1"] = { state: "provisional", level: null };
  const gate = assessEngineeringReportCompleteness(summary);
  assert.equal(gate.complete, false);
  assert.ok(gate.incompleteSeatParameterKeys.includes("p6"));
});

// ===========================================================================
// 3. FULL ASSESSMENT WITH TERMINAL FAIL → complete + publishable
// ===========================================================================

test("Full RP22 assessment with a terminal P6 FAIL → assessment completeness PASS", () => {
  const gate = assessEngineeringReportCompleteness(completeSummary({ p6SeatLevel: "FAIL" }));
  assert.equal(gate.complete, true);
  assert.equal(gate.reason, null);
});

test("Full RP22 assessment with a terminal P6 FAIL → publication section PASS", () => {
  const report = publicationSectionReport(publicationFromSummary(completeSummary({ p6SeatLevel: "FAIL" })));
  assert.equal(report.complete, true);
});

// ===========================================================================
// 4. PROJECT REPORT readiness from that published assessment
// ===========================================================================

test("Project Report readiness PASS from an assessment with a terminal P6 FAIL", () => {
  const summary = completeSummary({ p6SeatLevel: "FAIL" });
  assert.equal(isEngineeringReportComplete(summary), true);
});

// ===========================================================================
// 5. REPORT HONESTY — the FAIL result is shown, not hidden / N/A / omitted / L1
// ===========================================================================

test("Report honesty: P6 seat retains level 'FAIL' (not N/A, not null, not L1)", () => {
  const authority = buildArtcousticDesignRatingAuthority({
    seats: [{ id: "s1", priority: "primary" }],
    p6: { s1: 15 },
  });
  const seat = authority.parameters.p6.seats.s1;
  assert.equal(seat.level, "FAIL");
  assert.notEqual(seat.level, "N/A");
  assert.notEqual(seat.level, null);
  assert.notEqual(seat.level, "L1");
  assert.equal(seat.state, "scored");
  // The parameter is present (not omitted).
  assert.ok(authority.parameters.p6);
  assert.ok(authority.parameters.p6.seats.s1);
});

test("Report honesty: the published summary keeps the P6 FAIL on every seat", () => {
  const summary = completeSummary({ p6SeatLevel: "FAIL" });
  for (const seatId of SEAT_IDS) {
    assert.equal(summary.parameterAuthority.p6.seats[seatId].level, "FAIL");
    assert.equal(summary.parameterAuthority.p6.seats[seatId].state, "scored");
  }
});

// ===========================================================================
// 6. THRESHOLD REGRESSION — boundaries identical; only beyond-L1 label changes
// ===========================================================================

test("P6 thresholds unchanged: 2/4/6/10 boundaries; beyond 10 → FAIL (was N/A)", () => {
  assert.deepEqual(levelP6_surDelta(2), { level: "L4", ok: true });
  assert.deepEqual(levelP6_surDelta(4), { level: "L3", ok: true });
  assert.deepEqual(levelP6_surDelta(6), { level: "L2", ok: true });
  assert.deepEqual(levelP6_surDelta(10), { level: "L1", ok: true });
  assert.deepEqual(levelP6_surDelta(11), { level: "FAIL", ok: false });
  assert.deepEqual(levelP6_surDelta(NaN), { level: "N/A", ok: false });
});

test("P4 thresholds unchanged: 2/4/5/6 boundaries; beyond 6 → FAIL (was N/A)", () => {
  assert.deepEqual(levelP4_screenDelta(2), { level: "L4", ok: true });
  assert.deepEqual(levelP4_screenDelta(4), { level: "L3", ok: true });
  assert.deepEqual(levelP4_screenDelta(5), { level: "L2", ok: true });
  assert.deepEqual(levelP4_screenDelta(6), { level: "L1", ok: true });
  assert.deepEqual(levelP4_screenDelta(7), { level: "FAIL", ok: false });
  assert.deepEqual(levelP4_screenDelta(NaN), { level: "N/A", ok: false });
});

test("P10 thresholds unchanged: 2/5/8/12 boundaries; beyond 12 → FAIL (was N/A)", () => {
  assert.deepEqual(levelP10_upperDelta(2), { level: "L4", ok: true });
  assert.deepEqual(levelP10_upperDelta(5), { level: "L3", ok: true });
  assert.deepEqual(levelP10_upperDelta(8), { level: "L2", ok: true });
  assert.deepEqual(levelP10_upperDelta(12), { level: "L1", ok: true });
  assert.deepEqual(levelP10_upperDelta(13), { level: "FAIL", ok: false });
  assert.deepEqual(levelP10_upperDelta(NaN), { level: "N/A", ok: false });
});

test("P16 thresholds unchanged: 1.5/3.0/5.0 boundaries; beyond 5 → FAIL (was N/A)", () => {
  assert.deepEqual(levelP16_screenFR(1.5), { level: "L4", ok: true });
  assert.deepEqual(levelP16_screenFR(3.0), { level: "L2", ok: true });
  assert.deepEqual(levelP16_screenFR(5.0), { level: "L1", ok: true });
  assert.deepEqual(levelP16_screenFR(5.1), { level: "FAIL", ok: false });
  assert.deepEqual(levelP16_screenFR(NaN), { level: "N/A", ok: false });
});

// ===========================================================================
// 7. THE FOUR SHARED MAPPERS — PASS / FINITE-FAIL / MISSING
// ===========================================================================

test("P4 mapper: passing → L4; finite failing → FAIL terminal; missing → N/A provisional", () => {
  assert.equal(levelP4_screenDelta(1).level, "L4");
  const fail = buildArtcousticDesignRatingAuthority({ seats: [{ id: "s1", priority: "primary" }], p4: { s1: 7 } });
  assert.equal(fail.parameters.p4.seats.s1.state, "scored");
  assert.equal(fail.parameters.p4.seats.s1.level, "FAIL");
  const missing = buildArtcousticDesignRatingAuthority({ seats: [{ id: "s1", priority: "primary" }], p4: { s1: NaN } });
  assert.equal(missing.parameters.p4.seats.s1.state, "provisional");
  assert.equal(missing.parameters.p4.seats.s1.level, null);
});

test("P6 mapper: passing → L4; finite failing → FAIL terminal; missing → N/A provisional", () => {
  assert.equal(levelP6_surDelta(1).level, "L4");
  const fail = buildArtcousticDesignRatingAuthority({ seats: [{ id: "s1", priority: "primary" }], p6: { s1: 15 } });
  assert.equal(fail.parameters.p6.seats.s1.state, "scored");
  assert.equal(fail.parameters.p6.seats.s1.level, "FAIL");
  const missing = buildArtcousticDesignRatingAuthority({ seats: [{ id: "s1", priority: "primary" }], p6: { s1: NaN } });
  assert.equal(missing.parameters.p6.seats.s1.state, "provisional");
  assert.equal(missing.parameters.p6.seats.s1.level, null);
});

test("P10 mapper: passing → L4; finite failing → FAIL terminal; missing → N/A provisional", () => {
  assert.equal(levelP10_upperDelta(1).level, "L4");
  const fail = buildArtcousticDesignRatingAuthority({ seats: [{ id: "s1", priority: "primary" }], p10: { s1: 13 } });
  assert.equal(fail.parameters.p10.seats.s1.state, "scored");
  assert.equal(fail.parameters.p10.seats.s1.level, "FAIL");
  const missing = buildArtcousticDesignRatingAuthority({ seats: [{ id: "s1", priority: "primary" }], p10: { s1: NaN } });
  assert.equal(missing.parameters.p10.seats.s1.state, "provisional");
  assert.equal(missing.parameters.p10.seats.s1.level, null);
});

test("P16 mapper: passing → L4; finite failing → FAIL terminal; missing → N/A provisional", () => {
  assert.equal(levelP16_screenFR(1).level, "L4");
  const fail = buildArtcousticDesignRatingAuthority({ seats: [{ id: "s1", priority: "primary" }], p16: { s1: 6 } });
  assert.equal(fail.parameters.p16.seats.s1.state, "scored");
  assert.equal(fail.parameters.p16.seats.s1.level, "FAIL");
  const missing = buildArtcousticDesignRatingAuthority({ seats: [{ id: "s1", priority: "primary" }], p16: { s1: NaN } });
  assert.equal(missing.parameters.p16.seats.s1.state, "provisional");
  assert.equal(missing.parameters.p16.seats.s1.level, null);
});

// ===========================================================================
// 8. SEAT-SCOPED AGGREGATION — FAIL seats + scored seats → parameter terminal
// ===========================================================================

test("P6 seat aggregation: one FAIL seat + one L4 seat → parameter terminal, not provisional", () => {
  const authority = buildArtcousticDesignRatingAuthority({
    seats: [
      { id: "s1", priority: "primary" },
      { id: "s2", priority: "primary" },
    ],
    p6: { s1: 15, s2: 1 }, // s1 FAIL, s2 L4
  });
  assert.equal(authority.parameters.p6.state, "scored");
  assert.equal(authority.parameters.p6.seats.s1.state, "scored");
  assert.equal(authority.parameters.p6.seats.s1.level, "FAIL");
  assert.equal(authority.parameters.p6.seats.s2.state, "scored");
  assert.equal(authority.parameters.p6.seats.s2.level, "L4");
  // A complete summary with one FAIL P6 seat and the rest L4 is still complete.
  const summary = completeSummary({ p6SeatLevel: "L4" });
  summary.parameterAuthority.p6.seats["seat-r1-c1"] = { state: "scored", level: "FAIL" };
  const gate = assessEngineeringReportCompleteness(summary);
  assert.equal(gate.complete, true);
});

test("P4 seat aggregation: one FAIL seat + one L4 seat → parameter terminal", () => {
  const authority = buildArtcousticDesignRatingAuthority({
    seats: [
      { id: "s1", priority: "primary" },
      { id: "s2", priority: "primary" },
    ],
    p4: { s1: 7, s2: 1 }, // s1 FAIL, s2 L4
  });
  assert.equal(authority.parameters.p4.state, "scored");
  assert.equal(authority.parameters.p4.seats.s1.level, "FAIL");
  assert.equal(authority.parameters.p4.seats.s2.level, "L4");
});

// ===========================================================================
// 9. CASE C RETEST — P6 stays a calculated failure; assessment / publication /
//    report readiness all PASS. The design is not changed to make P6 pass.
// ===========================================================================

test("Case C: P6 preserved as a calculated FAIL (not provisional)", () => {
  // Case C condition: a finite beyond-L1 P6 spread that is a legitimate fail.
  const authority = buildArtcousticDesignRatingAuthority({
    seats: SEAT_IDS.map((id) => ({ id, priority: "primary" })),
    p6: Object.fromEntries(SEAT_IDS.map((id) => [id, 13])), // 13 dB spread → FAIL
  });
  for (const seatId of SEAT_IDS) {
    assert.equal(authority.parameters.p6.seats[seatId].level, "FAIL");
    assert.equal(authority.parameters.p6.seats[seatId].state, "scored");
  }
  assert.equal(authority.parameters.p6.state, "scored");
});

test("Case C: assessment complete with P6 FAIL on every seat", () => {
  const gate = assessEngineeringReportCompleteness(completeSummary({ p6SeatLevel: "FAIL" }));
  assert.equal(gate.complete, true);
  assert.equal(gate.reason, null);
});

test("Case C: publication allowed with P6 FAIL", () => {
  const report = publicationSectionReport(publicationFromSummary(completeSummary({ p6SeatLevel: "FAIL" })));
  assert.equal(report.complete, true);
});

test("Case C: Project Report ready with P6 FAIL", () => {
  assert.equal(isEngineeringReportComplete(completeSummary({ p6SeatLevel: "FAIL" })), true);
});

test("Case C: FAIL displayed honestly — every P6 seat shows FAIL, not N/A/L1/null", () => {
  const summary = completeSummary({ p6SeatLevel: "FAIL" });
  for (const seatId of SEAT_IDS) {
    const seat = summary.parameterAuthority.p6.seats[seatId];
    assert.equal(seat.level, "FAIL");
    assert.equal(seat.state, "scored");
    assert.notEqual(seat.level, "N/A");
    assert.notEqual(seat.level, "L1");
    assert.notEqual(seat.level, null);
  }
});

test("Case C: thresholds unchanged — P6 boundary at 10 dB intact", () => {
  assert.deepEqual(levelP6_surDelta(10), { level: "L1", ok: true });
  assert.deepEqual(levelP6_surDelta(11), { level: "FAIL", ok: false });
});