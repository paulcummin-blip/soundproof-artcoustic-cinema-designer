// p17-fresh-evidence-basis.test.mjs
// ---------------------------------------------------------------------------
// P17 "fresh evidence labelled legacy" — producer / reader mismatch.
//
// SYMPTOM: a project with current speaker geometry and a freshly calculated
// coverage-window P17 result was displayed as "Graded on the earlier variance
// basis", a stale 1.5 dB value remained visible, and the Project Report stayed
// Waiting / "RP22 Assessment not yet complete".
//
// ROOT CAUSE: buildP17SeatMetric (the producer that shapes the per-seat P17
// metric stored into seatHudById and frozen in the published engineering
// summary) read p17Data.windowLevel into `level` but DROPPED `windowLevel`,
// `windowLevelNumber` and `windowCause` from its output. The reader
// resolveRowBasis (in p17SeatEvidenceAuthority.js) decides the basis purely
// from `p17.windowLevel`: present + L1-L4 → coverage_window; absent →
// earlier_variance_basis. So every fresh coverage-window result, once saved
// and re-read, was mislabelled as the legacy variance basis.
//
// FIX: buildP17SeatMetric now carries windowLevel / windowLevelNumber /
// windowCause through to its output verbatim. The stored/published metric
// carries the basis marker, so the reader recognises fresh coverage-window
// evidence. Thresholds, maths and grading are unchanged.
//
// Run: node --import ./test/_alias-register.mjs test/p17-fresh-evidence-basis.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildP17SeatMetric } from "@/components/utils/rp22/buildP17SeatMetric";
import {
  buildP17SeatEvidenceRows,
  p17MetricsFromEngineeringSummary,
} from "@/components/utils/rp22/p17SeatEvidenceAuthority";
import { formatP17WindowResult, P17_EVIDENCE_TYPE } from "@/components/utils/rp22/p17CoverageWindows";
import { assessEngineeringReportCompleteness, isEngineeringReportComplete } from "@/components/engineering/engineeringReportCompleteness";
import { publicationSectionReport } from "@/components/engineering/publicationGateCore";

// ── Helpers ──────────────────────────────────────────────────────────────

const SEAT_IDS = ["seat-r1-c1", "seat-r1-c2", "seat-r2-c1"];

/** A fresh engine per-seat P17 result (coverage-window basis). */
function freshEngineP17({ level = "L4", cause = "within_l4_window", lossDb = 1.5 } = {}) {
  const levelNumber = Number(String(level).replace(/^L/, ""));
  return {
    p17Db: lossDb,
    windowLevel: level,
    windowLevelNumber: levelNumber,
    windows: { l4Deg: 24, l3Deg: 35, l2Deg: 41, usableDb: 4, evidenceType: P17_EVIDENCE_TYPE.ESTIMATED },
    evidenceType: P17_EVIDENCE_TYPE.ESTIMATED,
    cause,
    worstRole: "SL",
    worstAngleDeg: 20,
    worstLossDb: lossDb,
    rawVarianceDb: 1.5, // legacy read-only diagnostic still carried
    perSpeaker: [
      {
        role: "SL",
        model: "artcoustic-sp-2-8",
        angleDeg: 20,
        windowLevel: level,
        windowLevelNumber: levelNumber,
        windowCause: cause,
        windows: { l4Deg: 24, l3Deg: 35, l2Deg: 41 },
        evidenceType: P17_EVIDENCE_TYPE.ESTIMATED,
      },
    ],
    p17HasNaAngles: false,
  };
}

/** A legacy saved per-seat P17 result (no windowLevel — pre-fix producer shape). */
function legacySavedP17({ lossDb = 1.5 } = {}) {
  // The pre-fix buildP17SeatMetric output: `level` present, `windowLevel` absent.
  return {
    value: lossDb,
    formatted: formatP17WindowResult("L4"),
    level: "L4",
    windows: { l4Deg: 24, l3Deg: 35, l2Deg: 41 },
    evidenceType: P17_EVIDENCE_TYPE.ESTIMATED,
    cause: "within_l4_window",
    rawVarianceDb: 1.5,
    perSpeaker: [],
    p17HasNaAngles: false,
  };
}

const seats = SEAT_IDS.map((id) => ({ id, label: id }));

function rowsFor(p17BySeatId) {
  return buildP17SeatEvidenceRows({ seats, p17BySeatId });
}

// ── 1. Producer carries the basis marker ──────────────────────────────────

test("1. fresh buildP17SeatMetric writes windowLevel / windowLevelNumber / windowCause", () => {
  const metric = buildP17SeatMetric(freshEngineP17({ level: "L4", cause: "within_l4_window" }));
  assert.equal(metric.level, "L4");
  assert.equal(metric.windowLevel, "L4", "windowLevel must be carried through for resolveRowBasis");
  assert.equal(metric.windowLevelNumber, 4);
  assert.equal(metric.windowCause, "within_l4_window");
  assert.equal(metric.evidenceType, P17_EVIDENCE_TYPE.ESTIMATED);
});

test("2. fresh P17 metric is recognised as coverage_window by the reader", () => {
  const p17BySeatId = Object.fromEntries(
    SEAT_IDS.map((id) => [id, buildP17SeatMetric(freshEngineP17({ level: "L4" }))]),
  );
  const rows = rowsFor(p17BySeatId);
  for (const row of rows) {
    assert.equal(row.basis, "coverage_window");
    assert.equal(row.windowLevel, "L4");
    assert.equal(row.windowCauseLabel, "Within 1.5 dB window");
    assert.doesNotMatch(row.windowCauseLabel, /earlier variance/i);
  }
});

// ── 3. Fresh P17 never receives the legacy warning ────────────────────────

test("3. fresh coverage-window P17 never shows 'Graded on the earlier variance basis'", () => {
  const p17BySeatId = Object.fromEntries(
    SEAT_IDS.map((id) => [id, buildP17SeatMetric(freshEngineP17({ level: "L3", cause: "within_l3_window" }))]),
  );
  const rows = rowsFor(p17BySeatId);
  for (const row of rows) {
    assert.equal(row.basis, "coverage_window");
    assert.doesNotMatch(row.windowCauseLabel, /earlier variance/i);
  }
});

// ── 4. Legacy basis is honestly recognised as legacy ──────────────────────

test("4. a saved metric with no windowLevel is recognised as earlier_variance_basis", () => {
  const p17BySeatId = Object.fromEntries(
    SEAT_IDS.map((id) => [id, legacySavedP17()]),
  );
  const rows = rowsFor(p17BySeatId);
  for (const row of rows) {
    assert.equal(row.basis, "earlier_variance_basis");
    assert.equal(row.windowLevel, null);
    assert.match(row.windowCauseLabel, /earlier variance/i);
  }
});

// ── 5. Recalculation replaces legacy authority ────────────────────────────

test("5. recalculation (fresh producer) replaces legacy authority with coverage_window", () => {
  // before recalc: legacy saved metric
  const before = rowsFor(Object.fromEntries(SEAT_IDS.map((id) => [id, legacySavedP17()])));
  for (const row of before) assert.equal(row.basis, "earlier_variance_basis");

  // after recalc: fresh producer output
  const after = rowsFor(Object.fromEntries(SEAT_IDS.map((id) => [id, buildP17SeatMetric(freshEngineP17({ level: "L4" }))])));
  for (const row of after) {
    assert.equal(row.basis, "coverage_window");
    assert.equal(row.windowLevel, "L4");
    assert.doesNotMatch(row.windowCauseLabel, /earlier variance/i);
  }
});

// ── 6. Close/reopen preserves the current basis (save → publish → reopen) ─

test("6. close/reopen: published seatHudById round-trips the coverage_window marker", () => {
  // The published engineering summary freezes seatHudById verbatim. Simulate:
  // build metric → place into seatHudById → p17MetricsFromEngineeringSummary → rows.
  const liveMetrics = Object.fromEntries(
    SEAT_IDS.map((id) => [id, buildP17SeatMetric(freshEngineP17({ level: "L4" }))]),
  );
  const seatHudById = Object.fromEntries(
    SEAT_IDS.map((id) => [id, { rp22: { p17: liveMetrics[id] } }]),
  );
  const engineeringSummary = { seatHudById };
  // Reopen: read back from the (frozen) published summary.
  const reopened = p17MetricsFromEngineeringSummary(engineeringSummary);
  const rows = rowsFor(reopened);
  for (const row of rows) {
    assert.equal(row.basis, "coverage_window");
    assert.equal(row.windowLevel, "L4");
    assert.doesNotMatch(row.windowCauseLabel, /earlier variance/i);
  }
});

// ── 7. Geometry change invalidates and recalculates ──────────────────────

test("7. geometry change: windowLevel moves with the recalculated grade", () => {
  const before = buildP17SeatMetric(freshEngineP17({ level: "L4", cause: "within_l4_window", lossDb: 1.5 }));
  // Overhead moved further off-axis → seat falls in the 3 dB window.
  const after = buildP17SeatMetric(freshEngineP17({ level: "L3", cause: "within_l3_window", lossDb: 3.0 }));
  assert.notEqual(before.level, after.level);
  assert.equal(after.windowLevel, "L3");
  assert.equal(after.windowCause, "within_l3_window");
  const rowsAfter = rowsFor({ "seat-r1-c1": after });
  assert.equal(rowsAfter[0].basis, "coverage_window");
  assert.equal(rowsAfter[0].windowLevel, "L3");
});

// ── 8. Old 1.5 dB variance figure is not authoritative after current calc ─

test("8. old 1.5 dB variance is diagnostic only, not the displayed grade", () => {
  const metric = buildP17SeatMetric(freshEngineP17({ level: "L4", lossDb: 1.5 }));
  // The grade is the coverage-window result, not the raw variance.
  assert.equal(metric.level, "L4");
  assert.equal(metric.formatted, "≤1.5 dB window");
  // rawVarianceDb is still carried as a read-only diagnostic, but the basis
  // marker says coverage_window, so the reader never presents it as the grade.
  assert.equal(metric.rawVarianceDb, 1.5);
  assert.equal(metric.windowLevel, "L4");
  const rows = rowsFor({ "seat-r1-c1": metric });
  assert.equal(rows[0].basis, "coverage_window");
  assert.doesNotMatch(rows[0].windowCauseLabel, /earlier variance/i);
});

// ── 9 & 10. Current P17 PASS (L4) and worst (L1) are terminal ─────────────

test("9. current P17 L4 result is terminal (scored, level present)", () => {
  const metric = buildP17SeatMetric(freshEngineP17({ level: "L4" }));
  assert.ok(metric.level, "L4 result carries a level");
  assert.equal(metric.windowLevel, "L4");
});

test("10. current P17 L1 (outside usable coverage) is terminal, not missing", () => {
  // P17 is a design guide: L1 = outside the usable coverage window. It is the
  // lowest grade, still a terminal scored result (P17 has no FAIL state).
  const metric = buildP17SeatMetric(freshEngineP17({ level: "L1", cause: "outside_usable_window", lossDb: 5 }));
  assert.equal(metric.level, "L1");
  assert.equal(metric.windowLevel, "L1");
  assert.equal(metric.windowCause, "outside_usable_window");
});

// ── 11. Missing inputs remain incomplete ──────────────────────────────────

test("11. missing P17 evidence is reported as missing, not legacy", () => {
  // Producer: a seat with no gradeable channel produces a missing-evidence metric.
  // The basis-marker fields are absent (not a grade), so a missing metric is never
  // itself misread as a coverage-window grade.
  const metric = buildP17SeatMetric(null);
  assert.equal(metric.evidenceType, "missing");
  assert.equal(metric.level, "—");
  assert.ok(!metric.windowLevel, "missing metric carries no window basis");

  // Reader: in production a missing P17 is an ABSENT p17 key in seatHudById
  // (buildSeatHudSnapshot only writes `data.rp22['p17']` when a metric exists),
  // so p17MetricsFromEngineeringSummary omits the seat and the reader sees no
  // P17 for it — the real missing-state representation, not a present
  // missing-shape object (which the reader would treat as evidence-available).
  const rows = rowsFor({ "seat-r1-c1": null });
  assert.equal(rows[0].basis, "none");
  assert.equal(rows[0].evidenceAvailable, false);
  assert.equal(rows[0].evidenceType, P17_EVIDENCE_TYPE.MISSING);
});

// ── 12. Project Report readiness succeeds with current terminal P17 ───────

const seatRows = (level = "L4") => Object.fromEntries(
  SEAT_IDS.map((seatId) => [seatId, { state: "scored", level }]),
);

function completeSummary({ p17SeatLevel = "L4" } = {}) {
  const parameterAuthority = {};
  const seatScoped = ["p1", "p4", "p5", "p6", "p9", "p10", "p16", "p17"];
  for (let i = 1; i <= 21; i += 1) {
    const key = `p${i}`;
    if (key === "p17") {
      parameterAuthority[key] = { state: "scored", scope: "seat", level: null, seats: seatRows(p17SeatLevel) };
    } else if (seatScoped.includes(key)) {
      parameterAuthority[key] = { state: "scored", scope: "seat", level: null, seats: seatRows() };
    } else {
      parameterAuthority[key] = { state: "scored", scope: "room", level: "L4" };
    }
  }
  // project.seatIds is the real production seat-id authority the completeness
  // gate reads (falling back to Object.keys(seatHudById)). Without it, every
  // seat-scoped scored parameter hits the empty-seatIds incomplete branch.
  return { parameterAuthority, project: { seatIds: SEAT_IDS.slice() } };
}

/**
 * A production-shaped Published Engineering publication, matching the shape
 * publicationSectionReport reads: identity, timestamps, engine versions, the
 * engineering_summary (parameterAuthority, designRating, seatPriorityFingerprint,
 * viewing, roomResultsByParameter), the report_snapshot (analysisResult,
 * seatingPositions, placedSpeakers, priceData, report_project) and provenance.
 * Every section publicationSectionReport checks is populated.
 */
function completePublication({ p17SeatLevel = "L4" } = {}) {
  const parameterAuthority = {};
  for (let i = 1; i <= 21; i += 1) {
    parameterAuthority[`p${i}`] = { state: "scored", scope: "room", level: p17SeatLevel };
  }
  return {
    engineering_fingerprint: "fp-test",
    published_at: "2026-01-01T00:00:00.000Z",
    engine_version: "v1",
    rp22_version: "v1",
    algorithm_version: "v1",
    engineering_summary: {
      parameterAuthority,
      designRating: { rating: { value: p17SeatLevel } },
      seatPriorityFingerprint: "seat-fp-test",
      viewing: { angleDeg: 36 },
      roomResultsByParameter: {
        12: { value: 90 }, 13: { value: 90 },
        14: { value: 90 }, 18: { value: 90 }, 19: { value: 90 },
      },
    },
    report_snapshot: {
      analysisResult: { p1: {} },
      seatingPositions: [{ id: "seat-r1-c1" }],
      placedSpeakers: [{ role: "FL" }],
      priceData: { total: 1 },
      report_project: { roomDims: { widthM: 4, lengthM: 6 }, screen_size: 120 },
    },
    provenance: { source: "test" },
  };
}

test("12a. current terminal P17 → assessment complete", () => {
  const summary = completeSummary({ p17SeatLevel: "L4" });
  const assessment = assessEngineeringReportCompleteness(summary);
  assert.equal(assessment.complete, true);
  assert.equal(isEngineeringReportComplete(summary), true);
});

test("12b. current terminal P17 → publication ready → Project Report ready", () => {
  // publicationSectionReport reads a Published Engineering publication, not a
  // bare engineering summary. A production-shaped publication carries identity,
  // timestamps, engine versions, the engineering_summary, the report_snapshot
  // and provenance — every section the gate audits.
  const publication = completePublication({ p17SeatLevel: "L4" });
  const report = publicationSectionReport(publication);
  assert.equal(report.complete, true, `missing: ${report.missing.map((m) => m.key).join(", ")}`);
});

test("12c. current terminal P17 at L1 (worst coverage) still completes assessment", () => {
  const summary = completeSummary({ p17SeatLevel: "L1" });
  const assessment = assessEngineeringReportCompleteness(summary);
  assert.equal(assessment.complete, true);
  assert.equal(isEngineeringReportComplete(summary), true);
});

test("12d. missing P17 (no seat rows) leaves assessment incomplete", () => {
  const summary = completeSummary({ p17SeatLevel: "L4" });
  summary.parameterAuthority.p17 = { state: "provisional", scope: "seat", level: null, seats: {} };
  const assessment = assessEngineeringReportCompleteness(summary);
  assert.equal(assessment.complete, false);
});