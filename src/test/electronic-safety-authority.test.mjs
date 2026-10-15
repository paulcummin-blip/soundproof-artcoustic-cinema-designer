// electronic-safety-authority.test.mjs
// ---------------------------------------------------------------------------
// THE AUTOMATIC ELECTRONIC DECISION — the six mandated cases, the priority
// order, the one canonical tolerance, and the timing instrumentation.
//
// What is proved here:
//
//   SAFE ADOPTION    a candidate that improves something without worsening a
//                    Primary seat, a protected metric or a Secondary seat is
//                    adopted automatically — including a continuous improvement
//                    inside the same RP22 grade, and including an improvement far
//                    smaller than the old 1 dB action threshold.
//   STRICT PROTECT   a Primary seat worsening beyond the canonical tolerance is
//                    refused, even when the overall result improves and the
//                    improvement is much larger than the damage.
//   SECONDARY        a Secondary seat worsening materially is refused; a
//                    Secondary worsening inside materiality is not.
//   NOISE            a floating-point-only difference is treated as equal, and
//                    the baseline is kept.
//   PRIORITY         among safe candidates the order is Primary seats, then
//                    overall P19/P20, then Secondary seats — deterministically.
//   PHYSICAL OUT     the authority reads no coordinate, seating position,
//                    quantity or model, and never consults the 1 dB materiality
//                    gate.
//   TIMING           the ledger measures named stages and counts, and the
//                    aggregator reads the engine's EXISTING telemetry into the
//                    budget's own named stages.
//
// No acoustic maths, no grading, no optimiser ranking and no apply logic is
// touched by any assertion here.
// ---------------------------------------------------------------------------

import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ELECTRONIC_COMPARISON_TOLERANCE_DB,
  ELECTRONIC_COMPARISON_TOLERANCE_JUSTIFICATION,
  SECONDARY_MATERIAL_REGRESSION_DB,
} from "../components/room/bass/electronicSafety/electronicComparisonTolerance.js";
import {
  ELECTRONIC_SAFETY_REASON,
  ELECTRONIC_SAFETY_VERDICT,
  classifyElectronicCandidate,
  compareElectronicPriority,
  selectBestAutoSafeElectronicCandidate,
} from "../components/room/bass/electronicSafety/electronicCandidateSafetyAuthority.js";
import {
  ELECTRONIC_TIMING_COUNTER,
  ELECTRONIC_TIMING_STAGE,
  buildElectronicTimingRows,
  createElectronicTimingLedger,
  formatTimingDuration,
  summariseElectronicStageBreakdown,
} from "../components/room/bass/electronicSafety/electronicTimingLedger.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(HERE, "..", rel), "utf8");
const SAFETY = "components/room/bass/electronicSafety";

function seat(seatId, { isPrimary = true, level = 1, variationDbRaw = 9.4 } = {}) {
  return { seatId, isPrimary, level, variationDbRaw };
}

function result({
  candidateId = "candidate",
  p19Level = 4,
  p19Db = 3.4,
  p20Level = 1,
  p20Db = 15.4,
  p14Level = 2,
  p14Db = 117,
  p18Level = 3,
  p18Hz = 25,
  requestedP14Pass = true,
  seats = [seat("seat-r1-c1"), seat("seat-r1-c2"), seat("seat-r2-c1", { isPrimary: false, level: 2, variationDbRaw: 8 })],
} = {}) {
  return {
    candidateId,
    achievedP19Level: p19Level,
    achievedP19VariationDb: p19Db,
    achievedP20Level: p20Level,
    achievedP20VariationDb: p20Db,
    p14AchievedLevel: p14Level,
    p14AchievedDb: p14Db,
    p18AchievedLevel: p18Level,
    achievedP18Hz: p18Hz,
    requestedP14Pass,
    perSeatP19: [],
    perSeatP20: seats,
  };
}

const BARTON_BASELINE = result({ candidateId: "current" });

describe("THE ONE CANONICAL TOLERANCE", () => {
  it("is a single named figure, in its own authority", () => {
    assert.equal(ELECTRONIC_COMPARISON_TOLERANCE_DB, 0.05);
    assert.equal(SECONDARY_MATERIAL_REGRESSION_DB, 1.0);
  });

  it("states what it is, and what it is deliberately not", () => {
    const text = ELECTRONIC_COMPARISON_TOLERANCE_JUSTIFICATION;
    assert.match(text, /floating-point noise/);
    assert.match(text, /0\.2-0\.5 dB/);
    assert.match(text, /not the RP22 display floor/);
    assert.match(text, /not the Stage-2 physical-placement tolerance/);
    assert.match(text, /not the 1 dB materiality figure/);
  });

  it("needs no other tolerance: the authority imports only this one", () => {
    const source = read(`${SAFETY}/electronicCandidateSafetyAuthority.js`);
    assert.ok(source.includes("ELECTRONIC_COMPARISON_TOLERANCE_DB"), "the canonical tolerance is read");
    assert.ok(!/0\.15|0\.1\b|1e-8/.test(source), "no other tolerance figure appears in the authority");
  });
});

describe("TEST 1 — same grade, better continuous result, nothing worse", () => {
  const candidate = result({ candidateId: "delay", p20Db: 12.2 });

  it("is adopted automatically", () => {
    const decision = classifyElectronicCandidate({ baseline: BARTON_BASELINE, candidate });
    assert.equal(decision.verdict, ELECTRONIC_SAFETY_VERDICT.AUTO_SAFE);
    assert.equal(decision.autoSafe, true);
    assert.deepEqual(decision.reasons, []);
  });

  it("reports the aggregate P20 improvement it measured", () => {
    const decision = classifyElectronicCandidate({ baseline: BARTON_BASELINE, candidate });
    const p20 = decision.improvements.find((row) => row.parameter === "P20" && row.scope === "aggregate");
    assert.equal(p20.kind, "deviation-improved");
    assert.equal(p20.gainDb, 3.2);
  });
});

describe("TEST 2 — a Primary seat worsens beyond tolerance", () => {
  const candidate = result({
    candidateId: "delay",
    p20Db: 12.2,
    seats: [
      seat("seat-r1-c1", { variationDbRaw: 9.4 }),
      seat("seat-r1-c2", { variationDbRaw: 9.9 }),
      seat("seat-r2-c1", { isPrimary: false, level: 2, variationDbRaw: 8 }),
    ],
  });

  it("is refused, whatever the overall result does", () => {
    const decision = classifyElectronicCandidate({ baseline: BARTON_BASELINE, candidate });
    assert.equal(decision.verdict, ELECTRONIC_SAFETY_VERDICT.REJECTED);
    assert.equal(decision.reasonCode, ELECTRONIC_SAFETY_REASON.PRIMARY_SEAT_REGRESSION);
    assert.ok(decision.improvements.length > 0, "the overall result did improve");
    const reason = decision.reasons[0];
    assert.equal(reason.seats[0].seatId, "seat-r1-c2");
    assert.equal(reason.seats[0].kind, "same-level-raw-regression");
    assert.equal(reason.seats[0].rawDeltaDb, 0.5);
  });

  it("refuses a Primary grade drop too", () => {
    const dropped = result({
      candidateId: "delay",
      p20Db: 12.2,
      seats: [
        seat("seat-r1-c1", { level: 1 }),
        seat("seat-r1-c2", { level: 0 }),
        seat("seat-r2-c1", { isPrimary: false, level: 2, variationDbRaw: 8 }),
      ],
    });
    const decision = classifyElectronicCandidate({ baseline: BARTON_BASELINE, candidate: dropped });
    assert.equal(decision.verdict, ELECTRONIC_SAFETY_VERDICT.REJECTED);
    assert.equal(decision.reasons[0].seats[0].kind, "level-drop");
  });

  it("is not outvoted by a much larger improvement", () => {
    const big = result({ candidateId: "delay", p20Db: 4.0, seats: [
      seat("seat-r1-c1", { variationDbRaw: 9.4 }),
      seat("seat-r1-c2", { variationDbRaw: 10.9 }),
      seat("seat-r2-c1", { isPrimary: false, level: 2, variationDbRaw: 8 }),
    ] });
    const decision = classifyElectronicCandidate({ baseline: BARTON_BASELINE, candidate: big });
    assert.equal(decision.verdict, ELECTRONIC_SAFETY_VERDICT.REJECTED);
  });
});

describe("TEST 3 — a Secondary seat worsens materially", () => {
  const candidate = result({
    candidateId: "delay",
    p20Db: 11.0,
    seats: [
      seat("seat-r1-c1", { variationDbRaw: 8.0 }),
      seat("seat-r1-c2", { variationDbRaw: 8.2 }),
      seat("seat-r2-c1", { isPrimary: false, level: 2, variationDbRaw: 9.8 }),
    ],
  });

  it("is refused automatic adoption", () => {
    const decision = classifyElectronicCandidate({ baseline: BARTON_BASELINE, candidate });
    assert.equal(decision.verdict, ELECTRONIC_SAFETY_VERDICT.REJECTED);
    assert.equal(decision.reasonCode, ELECTRONIC_SAFETY_REASON.SECONDARY_SEAT_REGRESSION);
    assert.equal(decision.reasons[0].seats[0].seatId, "seat-r2-c1");
  });

  it("accepts a Secondary worsening inside materiality when the result improves", () => {
    const inside = result({
      candidateId: "delay",
      p20Db: 12.2,
      seats: [
        seat("seat-r1-c1", { variationDbRaw: 9.4 }),
        seat("seat-r1-c2", { variationDbRaw: 9.4 }),
        seat("seat-r2-c1", { isPrimary: false, level: 2, variationDbRaw: 8.3 }),
      ],
    });
    const decision = classifyElectronicCandidate({ baseline: BARTON_BASELINE, candidate: inside });
    assert.equal(decision.verdict, ELECTRONIC_SAFETY_VERDICT.AUTO_SAFE);
  });
});

describe("TEST 4 — P19 improves, P20 unchanged, no seat worsens", () => {
  const candidate = result({ candidateId: "phase", p19Db: 1.2 });

  it("is adopted automatically on the P19 improvement alone", () => {
    const decision = classifyElectronicCandidate({ baseline: BARTON_BASELINE, candidate });
    assert.equal(decision.verdict, ELECTRONIC_SAFETY_VERDICT.AUTO_SAFE);
    const p19 = decision.improvements.find((row) => row.parameter === "P19" && row.kind === "deviation-improved");
    assert.equal(p19.scope, "aggregate");
    assert.equal(p19.gainDb, 2.2);
  });

  it("states a P19 grade gain as a level gain", () => {
    const graded = result({ candidateId: "phase", p19Level: 4, p19Db: 1.2 });
    const decision = classifyElectronicCandidate({
      baseline: result({ candidateId: "current", p19Level: 3 }),
      candidate: graded,
    });
    const p19 = decision.improvements.find((row) => row.parameter === "P19");
    assert.equal(p19.kind, "level-gain");
    assert.equal(p19.fromLevel, 3);
    assert.equal(p19.toLevel, 4);
  });
});

describe("TEST 5 — a floating-point-only difference", () => {
  const candidate = result({
    candidateId: "gain",
    p20Db: 15.397,
    seats: [
      seat("seat-r1-c1", { variationDbRaw: 9.401 }),
      seat("seat-r1-c2", { variationDbRaw: 9.396 }),
      seat("seat-r2-c1", { isPrimary: false, level: 2, variationDbRaw: 8.002 }),
    ],
  });

  it("is treated as equal, so nothing is improved and nothing is refused", () => {
    const decision = classifyElectronicCandidate({ baseline: BARTON_BASELINE, candidate });
    assert.equal(decision.verdict, ELECTRONIC_SAFETY_VERDICT.NO_IMPROVEMENT);
    assert.equal(decision.reasonCode, ELECTRONIC_SAFETY_REASON.NO_IMPROVEMENT);
    assert.deepEqual(decision.improvements, []);
    assert.ok(
      decision.reasons.every((reason) => reason.code === ELECTRONIC_SAFETY_REASON.NO_IMPROVEMENT),
      "noise is never a regression either",
    );
  });

  it("keeps the installed tuning", () => {
    const selection = selectBestAutoSafeElectronicCandidate({ baseline: BARTON_BASELINE, candidates: [candidate] });
    assert.equal(selection.winner, null);
    assert.equal(selection.keptBaseline, true);
  });
});

describe("TEST 6 — no safe candidate beats the baseline", () => {
  it("keeps the baseline and states why each candidate was excluded", () => {
    const unsafe = result({ candidateId: "polarity", p20Db: 12.2, seats: [
      seat("seat-r1-c1", { level: 0 }),
      seat("seat-r1-c2", { variationDbRaw: 9.4 }),
      seat("seat-r2-c1", { isPrimary: false, level: 2, variationDbRaw: 8 }),
    ] });
    const flat = result({ candidateId: "gain" });
    const selection = selectBestAutoSafeElectronicCandidate({
      baseline: BARTON_BASELINE,
      candidates: [unsafe, flat],
    });
    assert.equal(selection.winner, null);
    assert.equal(selection.keptBaseline, true);
    assert.deepEqual(selection.safe, []);
    assert.deepEqual(
      selection.excluded.map((entry) => entry.verdict),
      [ELECTRONIC_SAFETY_VERDICT.REJECTED, ELECTRONIC_SAFETY_VERDICT.NO_IMPROVEMENT],
    );
  });

  it("refuses a candidate whose canonical seat evidence is not there", () => {
    const noSeats = { ...result({ candidateId: "delay" }), perSeatP20: [] };
    const decision = classifyElectronicCandidate({ baseline: BARTON_BASELINE, candidate: noSeats });
    assert.equal(decision.verdict, ELECTRONIC_SAFETY_VERDICT.INVALID);
    assert.equal(decision.reasonCode, ELECTRONIC_SAFETY_REASON.MISSING_CANONICAL_EVIDENCE);
  });
});

describe("PROTECTED METRICS — beyond the seats", () => {
  it("refuses a capability (P14) grade drop", () => {
    const decision = classifyElectronicCandidate({
      baseline: BARTON_BASELINE,
      candidate: result({ candidateId: "gain", p20Db: 12.2, p14Level: 1 }),
    });
    assert.equal(decision.verdict, ELECTRONIC_SAFETY_VERDICT.REJECTED);
    assert.equal(decision.reasonCode, ELECTRONIC_SAFETY_REASON.PROTECTED_METRIC_REGRESSION);
    assert.equal(decision.reasons[0].metrics[0].parameter, "P14");
  });

  it("refuses a lost output pass", () => {
    const decision = classifyElectronicCandidate({
      baseline: BARTON_BASELINE,
      candidate: result({ candidateId: "gain", p20Db: 12.2, requestedP14Pass: false }),
    });
    assert.equal(decision.verdict, ELECTRONIC_SAFETY_VERDICT.REJECTED);
    assert.equal(decision.reasons[0].metrics[0].parameter, "output");
  });
});

describe("THE 1 DB ACTION THRESHOLD IS NOT CONSULTED", () => {
  it("adopts a safe 0.4 dB improvement the old threshold would have refused", () => {
    const decision = classifyElectronicCandidate({
      baseline: BARTON_BASELINE,
      candidate: result({ candidateId: "delay", p20Db: 15.0 }),
    });
    assert.equal(decision.verdict, ELECTRONIC_SAFETY_VERDICT.AUTO_SAFE);
    assert.equal(decision.improvements[0].gainDb, 0.4);
  });

  it("does not import, or restate, the materiality gate or its figures", () => {
    const source = read(`${SAFETY}/electronicCandidateSafetyAuthority.js`);
    assert.ok(!source.includes("materialityGate"), "the approval workflow's gate is not consulted");
    assert.ok(!source.includes("isMaterialImprovement"), "materiality decides nothing here");
  });
});

describe("PRIORITY AMONG SAFE CANDIDATES", () => {
  const primaryBetter = result({
    candidateId: "a",
    p20Db: 13.0,
    seats: [
      seat("seat-r1-c1", { variationDbRaw: 8.0 }),
      seat("seat-r1-c2", { variationDbRaw: 8.2 }),
      seat("seat-r2-c1", { isPrimary: false, level: 2, variationDbRaw: 8 }),
    ],
  });
  const overallBetter = result({
    candidateId: "b",
    p20Db: 11.0,
    seats: [
      seat("seat-r1-c1", { variationDbRaw: 9.0 }),
      seat("seat-r1-c2", { variationDbRaw: 9.2 }),
      seat("seat-r2-c1", { isPrimary: false, level: 2, variationDbRaw: 8 }),
    ],
  });

  it("prefers the better Primary-seat result over the better overall figure", () => {
    const selection = selectBestAutoSafeElectronicCandidate({
      baseline: BARTON_BASELINE,
      candidates: [overallBetter, primaryBetter],
    });
    assert.equal(selection.safe.length, 2);
    assert.equal(selection.winner.candidateId, "a");
  });

  it("is deterministic and tolerance-aware", () => {
    assert.ok(compareElectronicPriority(primaryBetter, overallBetter) < 0);
    assert.ok(compareElectronicPriority(overallBetter, primaryBetter) > 0);
    assert.equal(compareElectronicPriority(primaryBetter, primaryBetter), 0);
  });

  it("orders the tuple Primary, then overall, then Secondary", () => {
    const source = read(`${SAFETY}/electronicCandidateSafetyAuthority.js`);
    const tuple = source.slice(source.indexOf("export function buildElectronicPriorityTuple"));
    const primaryAt = tuple.indexOf("worstDeviation(primary)");
    const overallAt = tuple.indexOf("a.p19Level");
    const secondaryAt = tuple.indexOf("worstDeviation(secondary)");
    assert.ok(primaryAt > -1 && overallAt > primaryAt, "Primary seats are compared first");
    assert.ok(secondaryAt > overallAt, "Secondary seats are compared last");
  });
});

describe("PHYSICAL CHANGES ARE OUT OF SCOPE FOR THIS AUTHORITY", () => {
  it("reads no coordinate, seating position, quantity or model", () => {
    const source = read(`${SAFETY}/electronicCandidateSafetyAuthority.js`);
    for (const forbidden of ["coordinates", "seatingPositions", "position", "quantity", "modelKey"]) {
      assert.ok(!source.includes(forbidden), `the authority never reads ${forbidden}`);
    }
  });
});

describe("TIMING — the stage ledger", () => {
  it("measures named stages, and states an unmeasured stage as unmeasured", () => {
    let clock = 0;
    const ledger = createElectronicTimingLedger({ clock: () => clock });
    ledger.begin(ELECTRONIC_TIMING_STAGE.TRANSFER_PREPARATION);
    clock = 1200;
    ledger.end(ELECTRONIC_TIMING_STAGE.TRANSFER_PREPARATION);
    ledger.add(ELECTRONIC_TIMING_STAGE.DELAY_SCREENING, 480);
    ledger.count(ELECTRONIC_TIMING_COUNTER.WORKER_CALLS, 3);
    ledger.recordTransferLookup("hit");
    ledger.recordTransferLookup("miss");
    ledger.recordCanonicalConfirmation();
    clock = 5000;

    const report = ledger.report();
    assert.equal(report.totalWallClockMs, 5000);
    const preparation = report.stages.find((stage) => stage.key === ELECTRONIC_TIMING_STAGE.TRANSFER_PREPARATION);
    assert.equal(preparation.durationMs, 1200);
    assert.equal(preparation.measured, true);
    assert.ok(report.unmeasuredStages.includes(ELECTRONIC_TIMING_STAGE.P19_P20));
    assert.equal(report.counters[ELECTRONIC_TIMING_COUNTER.WORKER_CALLS], 3);
    assert.equal(report.counters[ELECTRONIC_TIMING_COUNTER.TRANSFER_CACHE_HITS], 1);
    assert.equal(report.counters[ELECTRONIC_TIMING_COUNTER.TRANSFER_CACHE_MISSES], 1);
    assert.equal(report.counters[ELECTRONIC_TIMING_COUNTER.CANONICAL_CONFIRMATIONS], 1);
  });

  it("formats a duration in words", () => {
    assert.equal(formatTimingDuration(840), "840 ms");
    assert.equal(formatTimingDuration(36800), "36.80 s");
    assert.equal(formatTimingDuration(null), null);
  });
});

describe("TIMING — the aggregator over the engine's existing telemetry", () => {
  const runtimeMetrics = {
    totalWallClockMs: 36800,
    currentReused: true,
    stage2TransfersReused: 2,
    fullTransferReuseHits: 1,
    workerCalls: [
      { phase: "placement", candidateId: "current", durationMs: 4200 },
      { phase: "grouped-phase", candidateId: "phase-current", durationMs: 900 },
      { phase: "grouped-delay", candidateId: "calibration-current", durationMs: 700 },
      { phase: "grouped-gain", candidateId: "gain-current", durationMs: 600 },
      { phase: "grouped-delay", candidateId: "combined-retune-delay", durationMs: 500 },
      { phase: "confirmation", candidateId: "delay:0", durationMs: 3100 },
      { phase: "confirmation", candidateId: "delay:1", durationMs: 2900 },
    ],
    transferOperations: [
      { candidateId: "current", lookup: "hit" },
      { candidateId: "sym-inward-100", lookup: "miss" },
    ],
  };

  it("reads the existing records into the budget's own named stages", () => {
    const breakdown = summariseElectronicStageBreakdown({ runtimeMetrics });
    assert.equal(breakdown.totalWallClockMs, 36800);
    assert.equal(breakdown.stages[ELECTRONIC_TIMING_STAGE.TRANSFER_ACQUISITION], 4200);
    assert.equal(breakdown.stages[ELECTRONIC_TIMING_STAGE.PHASE_POLARITY_SCREENING], 900);
    assert.equal(breakdown.stages[ELECTRONIC_TIMING_STAGE.DELAY_SCREENING], 700);
    assert.equal(breakdown.stages[ELECTRONIC_TIMING_STAGE.GAIN_SCREENING], 600);
    assert.equal(breakdown.stages[ELECTRONIC_TIMING_STAGE.COMBINED_SCREENING], 500);
    assert.equal(breakdown.stages[ELECTRONIC_TIMING_STAGE.CANONICAL_CONFIRMATIONS], 6000);
  });

  it("counts worker calls, confirmations and transfer-cache hits and misses", () => {
    const breakdown = summariseElectronicStageBreakdown({ runtimeMetrics });
    assert.equal(breakdown.workerCallCount, 7);
    assert.equal(breakdown.canonicalConfirmationCount, 2);
    assert.equal(breakdown.transferCache.hits, 3);
    assert.equal(breakdown.transferCache.misses, 1);
  });

  it("states the stages the engine does not publish as unmeasured, never as zero", () => {
    const breakdown = summariseElectronicStageBreakdown({ runtimeMetrics });
    assert.ok(breakdown.unmeasuredStages.includes(ELECTRONIC_TIMING_STAGE.BASELINE_EVALUATION));
    assert.ok(breakdown.unmeasuredStages.includes(ELECTRONIC_TIMING_STAGE.FINAL_SELECTION));
    const rows = buildElectronicTimingRows(breakdown);
    assert.ok(rows.some((row) => row.label === "Total wall time" && row.value === "36.80 s"));
    assert.ok(!rows.some((row) => row.label === "Final candidate selection"));
  });

  it("returns nothing rather than a fabricated breakdown when there is no telemetry", () => {
    assert.equal(summariseElectronicStageBreakdown({ runtimeMetrics: null }), null);
  });
});