// test/adi-limiting-factor-priority.test.mjs
//
// Focused checks for the ADI diagnosis priority and the ADI applied state.
//
//   1. ADI PRIORITY ORDER — capability → severe seat consistency → severe
//      reference-seat response → genuinely missed extension → polish. A
//      genuinely missed extension target must NOT preempt a severe P19/P20
//      failure.
//   2. ONE-SUB GUIDANCE — a single failing subwoofer is reported as an
//      uncontrolled reference-seat response, with placement / delay / polarity
//      / gain guidance ahead of EQ.
//   3. TWO-SUB GUIDANCE — a severe pair interaction (P19 and P20 both severe)
//      is reported as a pair-placement problem, never as EQ.
//   4. FOUR-SUB GUIDANCE — a remaining seat-to-seat limitation is reported as
//      the array not yet being optimised for seat consistency.
//   5. NO FALSE EXTENSION DIAGNOSIS — an achieved L2 extension target produces
//      no extension failure, and the mild-polish path cannot reintroduce one.
//   6. NO FALSE APPLIED STATE — APPLIED only with real applied provenance,
//      a current design, no waiting action, and a complete evaluation. APPLIED
//      and an available Apply action are mutually exclusive.
//
// These are pure-module tests: no React, no stores, no bass maths. No RP22
// threshold, grading rule, optimiser or P18 authority is modified by them.
//
// Run: node --import ./test/_alias-register.mjs test/adi-limiting-factor-priority.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";

import { identifyLimitingFactor } from "@/components/recommendationEngine/bassLimitingFactorAuthority";
import { buildDiagnosisCopy } from "@/components/recommendationEngine/recommendationDiagnosisCopy";
import { PROBLEM_TYPE } from "@/components/recommendationEngine/recommendationTypes";
import { inferPhysicalCause } from "@/components/recommendationEngine/recommendationPhysicalCause";
import { ADI_OUTCOME } from "@/components/adi/adiConstants";
import {
  resolveAdiAppliedState,
  ADI_APPLIED_STATE,
} from "@/components/adi/adiAppliedStateAuthority";
import {
  APPLIED_CALIBRATION_SOURCE,
  APPLIED_CALIBRATION_STATUS,
} from "@/components/room/bass/appliedCalibrationAuthority/appliedCalibrationAuthority";

// ── Evidence fixtures (canonical ADI evidence shape) ──────────────────────

function seat(seatId, variationDbRaw, level, isPrimary = false) {
  return { seatId, isPrimary, variationDbRaw, level, worstFrequencyHz: 63 };
}

const ONE_SUB = {
  p14AchievedDb: 110,
  achievedP18Hz: 24,
  perSeatP19: [seat("S1", 6.2, "L1", true)],
  perSeatP20: [seat("S1", 0, "L4", true)],
  p19Aggregate: { value: 6.2, level: "L1" },
  p20Aggregate: { value: 0, level: "L4" },
};

const TWO_SUB = {
  p14AchievedDb: 115,
  achievedP18Hz: 24,
  perSeatP19: [seat("S1", 6.9, "L1", true), seat("S2", 5.2, "L1")],
  perSeatP20: [seat("S1", 7.5, "L1", true), seat("S2", 12.7, "L1")],
  p19Aggregate: { value: 6.9, level: "L1" },
  p20Aggregate: { value: 12.7, level: "L1" },
};

const FOUR_SUB = {
  p14AchievedDb: 115,
  achievedP18Hz: 23,
  perSeatP19: [
    seat("S1", 2.4, "L3", true),
    seat("S2", 2.0, "L4"),
    seat("S3", 1.8, "L4"),
    seat("S4", 2.2, "L3"),
  ],
  perSeatP20: [
    seat("S1", 8.4, "L1", true),
    seat("S2", 10.2, "L1"),
    seat("S3", 9.1, "L1"),
    seat("S4", 12.1, "L1"),
  ],
  p19Aggregate: { value: 2.4, level: "L3" },
  p20Aggregate: { value: 12.1, level: "L1" },
};

const HEALTHY = {
  p14AchievedDb: 115,
  achievedP18Hz: 23,
  perSeatP19: [seat("S1", 2.0, "L4", true)],
  perSeatP20: [seat("S1", 3.5, "L3", true), seat("S2", 2.5, "L4")],
  p19Aggregate: { value: 2.0, level: "L4" },
  p20Aggregate: { value: 3.5, level: "L3" },
};

const EQ_FIRST = "Apply the recommended equalisation";

function diagnosis(evidence, objectives, context) {
  const problem = identifyLimitingFactor(evidence, objectives, context);
  const copy = buildDiagnosisCopy(problem, context);
  const cause = inferPhysicalCause(problem, null, context);
  return { problem, copy, cause, text: [problem?.description, cause?.description, copy?.why, copy?.action, copy?.remainingLimitation].join(" | ") };
}

// ── 1. ADI PRIORITY ORDER ────────────────────────────────────────────────

test("ADI priority order: severe pair interaction leads a genuinely missed extension target", () => {
  // P14 met (115 = target), P18 L4 target (18 Hz, minimum basis) genuinely
  // missed at 24 Hz, P19 severe (6.9 dB) and P20 severe (12.7 dB).
  const { problem } = diagnosis(
    TWO_SUB,
    { p14TargetDb: 115, p14Level: 4, p18TargetBasis: "minimum" },
    { subwooferCount: 2 },
  );
  assert.equal(problem.severity.extension.targetMissed, true, "L4 extension target is genuinely missed");
  assert.equal(problem.severity.seatConsistency.severe, true, "P20 is severe");
  assert.equal(problem.severity.responseSmoothness.severe, true, "P19 is severe");
  assert.equal(problem.type, PROBLEM_TYPE.MULTI_SUB_INTERACTION, "the interaction leads, not extension");
});

test("ADI priority order: hard target failure leads every other limitation", () => {
  const { problem } = diagnosis(
    { ...TWO_SUB, p14AchievedDb: 100 },
    { p14TargetDb: 115, p14Level: 4, p18TargetBasis: "minimum" },
    { subwooferCount: 2 },
  );
  assert.equal(problem.type, PROBLEM_TYPE.CAPABILITY, "capability leads");
});

test("ADI priority order: severe seat consistency leads a severe reference-seat response", () => {
  const { problem } = diagnosis(
    { ...TWO_SUB, perSeatP19: [seat("S1", 4.2, "L2", true), seat("S2", 3.0, "L3")], p19Aggregate: { value: 4.2, level: "L2" } },
    { p14TargetDb: 115, p14Level: 4, p18TargetBasis: "minimum" },
    { subwooferCount: 4 },
  );
  assert.equal(problem.type, PROBLEM_TYPE.SEAT_CONSISTENCY, "seat consistency leads");
});

test("ADI priority order: a genuinely missed extension target still diagnoses extension", () => {
  const { problem } = diagnosis(
    { ...HEALTHY, achievedP18Hz: 35 },
    { p14TargetDb: 115, p14Level: 2, p18TargetBasis: "minimum" },
    { subwooferCount: 2 },
  );
  assert.equal(problem.type, PROBLEM_TYPE.EXTENSION, "extension is the remaining limitation");
});

// ── 2. ONE-SUB GUIDANCE ──────────────────────────────────────────────────

test("one sub: failing reference-seat response is reported as uncontrolled, never as EQ", () => {
  const { problem, copy, text } = diagnosis(
    ONE_SUB,
    { p14TargetDb: 110, p14Level: 2, p18TargetBasis: "minimum" },
    { subwooferCount: 1 },
  );
  assert.equal(problem.type, PROBLEM_TYPE.RESPONSE_SMOOTHNESS);
  assert.match(copy.assessment, /reference-seat response is not currently controlled/);
  assert.match(copy.action, /delay, polarity or gain/);
  assert.match(copy.remainingLimitation, /alternative subwoofer position/);
  assert.equal(text.includes(EQ_FIRST), false, "EQ is never the leading recommendation");
});

// ── 3. TWO-SUB GUIDANCE ──────────────────────────────────────────────────

test("two subs: a severe pair interaction is reported as a placement problem", () => {
  const { problem, copy, text } = diagnosis(
    TWO_SUB,
    { p14TargetDb: 115, p14Level: 4, p18TargetBasis: "minimum" },
    { subwooferCount: 2 },
  );
  assert.equal(problem.type, PROBLEM_TYPE.MULTI_SUB_INTERACTION);
  assert.match(copy.why, /pair placement is interacting poorly with the room/);
  assert.match(copy.action, /moving one sub/);
  assert.match(copy.remainingLimitation, /Worst seat deviation is 12\.7 dB/);
  assert.equal(text.includes(EQ_FIRST), false, "EQ is never the leading recommendation");
  assert.equal(text.includes("extension is the limiting factor"), false, "no false extension claim");
});

// ── 4. FOUR-SUB GUIDANCE ─────────────────────────────────────────────────

test("four subs: a remaining seat-to-seat limitation is reported as array optimisation", () => {
  const { problem, copy, text } = diagnosis(
    FOUR_SUB,
    { p14TargetDb: 115, p14Level: 2, p18TargetBasis: "minimum" },
    { subwooferCount: 4 },
  );
  assert.equal(problem.type, PROBLEM_TYPE.SEAT_CONSISTENCY);
  assert.match(copy.assessment, /Seat-to-seat consistency remains the limiting factor/);
  assert.match(copy.why, /Four subs have improved output, extension and reference-seat smoothness, but the array is not yet optimised for seat-to-seat consistency/);
  assert.match(copy.action, /front\/rear timing, gain and polarity/);
  assert.match(copy.remainingLimitation, /strong output and extension/);
  assert.equal(text.includes(EQ_FIRST), false, "EQ is never the leading recommendation");
});

// ── 5. NO FALSE EXTENSION DIAGNOSIS ──────────────────────────────────────

test("no false extension: an achieved L2 extension target is never reported as a miss", () => {
  const { problem, text } = diagnosis(
    FOUR_SUB,
    { p14TargetDb: 115, p14Level: 2, p18TargetBasis: "minimum" },
    { subwooferCount: 4 },
  );
  assert.equal(problem.severity.extension.achievedGrade, 2, "23 Hz is L2 on the minimum basis");
  assert.equal(problem.severity.extension.targetMissed, false, "the selected L2 target is achieved");
  assert.notEqual(problem.type, PROBLEM_TYPE.EXTENSION);
  assert.equal(text.includes("Low-frequency extension is the limiting factor"), false);
  assert.equal(/reaches only|target is 30/.test(text), false);
});

test("no false extension: the mild-polish path cannot reintroduce an extension diagnosis", () => {
  // Healthy enough for no severity flag; the legacy polish detector must not
  // fire an extension diagnosis from a target the design already achieves.
  const { problem } = diagnosis(
    HEALTHY,
    { p14TargetDb: 115, p14Level: 2, p18TargetBasis: "minimum", p18TargetHz: 30 },
    { subwooferCount: 2 },
  );
  assert.notEqual(problem.type, PROBLEM_TYPE.EXTENSION);
});

// ── 6. NO FALSE APPLIED STATE ────────────────────────────────────────────

const OPTIMISER_AUTHORITY = {
  source: APPLIED_CALIBRATION_SOURCE.OPTIMISER,
  status: APPLIED_CALIBRATION_STATUS.CURRENT,
  candidateId: "cand-1",
  recommendationId: "rec-1",
  values: [{ id: "sub-1", delayMs: 3.2, gainDb: -1.5, polarity: 1 }],
};

test("applied state: a run that applied calibration values shows APPLIED", () => {
  const state = resolveAdiAppliedState({
    outcome: ADI_OUTCOME.RECOMMENDATION,
    hasRecommendation: true,
    recommendationAction: "Apply the recommended equalisation.",
    applyActionAvailable: false,
    workflowApplied: { delay: true, gain: true },
  });
  assert.equal(state.state, ADI_APPLIED_STATE.APPLIED);
  assert.equal(state.showAppliedBadge, true);
});

test("applied state: APPLIED is mutually exclusive with an available Apply action", () => {
  const state = resolveAdiAppliedState({
    outcome: ADI_OUTCOME.RECOMMENDATION,
    hasRecommendation: true,
    recommendationAction: "Move the subwoofers 300 mm backward.",
    applyActionAvailable: true,
    appliedStage: "placement",
    workflowApplied: { delay: true, gain: true },
    appliedCalibration: OPTIMISER_AUTHORITY,
    appliedCalibrationIsStale: false,
    appliedCalibrationIsInDesign: true,
  });
  assert.notEqual(state.state, ADI_APPLIED_STATE.APPLIED, "an available Apply action forbids APPLIED");
  assert.equal(state.showAppliedBadge, false);
});

test("applied state: a persisted optimiser calibration that is still in the design shows APPLIED", () => {
  const state = resolveAdiAppliedState({
    outcome: ADI_OUTCOME.RECOMMENDATION,
    hasRecommendation: true,
    recommendationAction: "Apply the recommended equalisation.",
    applyActionAvailable: false,
    appliedCalibration: OPTIMISER_AUTHORITY,
    appliedCalibrationIsStale: false,
    appliedCalibrationIsInDesign: true,
  });
  assert.equal(state.state, ADI_APPLIED_STATE.APPLIED);
});

test("applied state: a stale persisted calibration never shows APPLIED", () => {
  const state = resolveAdiAppliedState({
    outcome: ADI_OUTCOME.RECOMMENDATION,
    hasRecommendation: true,
    recommendationAction: "Apply the recommended equalisation.",
    applyActionAvailable: false,
    appliedCalibration: OPTIMISER_AUTHORITY,
    appliedCalibrationIsStale: true,
    appliedCalibrationIsInDesign: false,
  });
  assert.equal(state.showAppliedBadge, false);
});

test("applied state: a manual user edit never shows APPLIED", () => {
  const state = resolveAdiAppliedState({
    outcome: ADI_OUTCOME.RECOMMENDATION,
    hasRecommendation: true,
    recommendationAction: "",
    applyActionAvailable: false,
    appliedCalibration: {
      source: APPLIED_CALIBRATION_SOURCE.MANUAL,
      status: APPLIED_CALIBRATION_STATUS.USER_MODIFIED,
      values: [{ id: "sub-1", delayMs: 1, gainDb: 0, polarity: 1 }],
    },
    appliedCalibrationIsStale: false,
    appliedCalibrationIsInDesign: true,
  });
  assert.equal(state.showAppliedBadge, false);
});

test("applied state: an incomplete evaluation never shows APPLIED", () => {
  const state = resolveAdiAppliedState({
    outcome: ADI_OUTCOME.INCOMPLETE,
    hasRecommendation: false,
    workflowApplied: { delay: true },
  });
  assert.equal(state.state, ADI_APPLIED_STATE.EVALUATION_INCOMPLETE);
  assert.equal(state.showAppliedBadge, false);
});

test("applied state: an unachievable target never shows APPLIED", () => {
  const state = resolveAdiAppliedState({
    outcome: ADI_OUTCOME.TARGET_NOT_ACHIEVED,
    hasRecommendation: false,
  });
  assert.equal(state.state, ADI_APPLIED_STATE.ACTION_NEEDED);
  assert.equal(state.showAppliedBadge, false);
});

test("applied state: a global trim alone is not a specific applied recommendation", () => {
  const state = resolveAdiAppliedState({
    outcome: ADI_OUTCOME.RECOMMENDATION,
    hasRecommendation: true,
    recommendationAction: "Apply the recommended equalisation.",
    applyActionAvailable: false,
    workflowApplied: { globalBassTrim: true },
  });
  assert.notEqual(state.state, ADI_APPLIED_STATE.APPLIED);
  assert.equal(state.showAppliedBadge, false);
});