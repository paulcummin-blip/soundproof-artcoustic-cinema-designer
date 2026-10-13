// calibration-held-reason.test.mjs
// ---------------------------------------------------------------------------
// HOW a useful calibration improvement that was NOT applied is presented.
//
// The case this exists for is the live Jooced run: a front-pair gain trim of
// −2.5 dB improved the overall P20 by 1.2855 dB (10.1458 → 8.8603 dB) with both
// displayed levels unchanged (P20 L1, P19 L4), and the run held it on its
// seat-level criterion. What it showed the designer was:
//
//   "Not applied because it does not clear the 1 dB action threshold."
//
// — a threshold the record's own figures clear, and no indication that a useful
// adjustment had been found at all.
//
// What is verified here, from the saved record's own values:
//   • the improvement is presented as a SUGGESTION: what to change, what it
//     improves, and what the RP22 level becomes
//   • the exact improvement (1.29 dB) is never restated as "2 dB"
//   • no threshold arithmetic and no seat claim leads the designer's line
//   • the one disadvantage is stated once, after the benefit
//   • a genuinely sub-threshold hold, and a meaningful regression, are NOT
//     suggestions and keep their own reason
//   • the suggestion is stated once — the lever list keeps the refusals only
//
// Nothing here calculates an acoustic value: every figure is the saved record's.
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";

import {
  CALIBRATION_APPLY_DECISION,
  CALIBRATION_APPLY_REASON,
  NOT_APPLIED_SEAT_SUMMARY,
} from "../components/room/bass/optimiseWorkflow/adiCalibrationAutoApplyAuthority.js";
import {
  CALIBRATION_SUGGESTION_NOTE,
  describeCalibrationSuggestion,
} from "../components/room/bass/optimiseWorkflow/adiCalibrationSuggestion.js";
import {
  MATERIALITY_DISPOSITION,
  classifyCalibrationDisposition,
} from "../components/room/bass/improveBassV2/materialityGate.js";
import {
  CALIBRATION_EVIDENCE_RESULT,
  CALIBRATION_EVIDENCE_STATUS,
  CALIBRATION_SUGGESTION_STATE,
  calibrationOutcomeLabel,
  calibrationSuggestion,
  resolveCalibrationEvidenceState,
} from "../components/room/bass/optimiserPlan/optimiserCalibrationEvidence.js";

/** The one designer line this feature must produce, word for word. */
const PREFERRED_COPY =
  "Suggested improvement: reduce the front subwoofer level by 2.5 dB. "
  + "This improves predicted overall bass consistency, with displayed P20 variation reducing from 10 dB to 8 dB. "
  + "The RP22 level remains L1.";

/** The saved gain lever of the live Jooced run, verbatim. */
const savedGainLever = () => ({
  lever: "gain",
  label: "Gain",
  tested: true,
  evidenceStatus: CALIBRATION_EVIDENCE_STATUS.RETAINED,
  candidateCount: 4,
  grouping: {
    status: "eligible",
    reason: "No useful improvement found.",
    groups: [
      { id: "A", label: "Front pair", role: null },
      { id: "B", label: "Rear pair", role: null },
    ],
  },
  bestCandidate: {
    candidateId: 'gain:grouped-gain:["sub-front-1","sub-front-2"]:-2.5',
    adjustmentDb: -2.5,
    p19Before: 0.8394027885794486,
    p19After: 0.8387303307951584,
    p19LevelBefore: 4,
    p19LevelAfter: 4,
    p20Before: 10.145817163909001,
    p20After: 8.8602947594255,
    p20LevelBefore: 1,
    p20LevelAfter: 1,
    p19DeltaDb: 0,
    p20DeltaDb: -1.29,
    limitingSeatId: null,
    limitingFrequencyHz: null,
    perSeatP20: null,
  },
  result: CALIBRATION_EVIDENCE_RESULT.IMPROVEMENT_NOT_APPLIED,
  reason: "No useful improvement found.",
  scope: null,
  decision: "none",
  decisionReason: "calibration-improvement-not-material",
  notAppliedReason: "Not applied because it does not clear the 1 dB action threshold.",
  notAppliedDetailReason: null,
});

/** A lever whose own search proved nothing useful. */
const noImprovementLever = (lever, label) => ({
  lever,
  label,
  tested: true,
  evidenceStatus: CALIBRATION_EVIDENCE_STATUS.RETAINED,
  candidateCount: 3,
  grouping: null,
  bestCandidate: {
    candidateId: `${lever}:1`, p19Before: 0.83, p19After: 0.84,
    p19LevelBefore: 4, p19LevelAfter: 4,
    p20Before: 6.02, p20After: 6.0,
    p20LevelBefore: 1, p20LevelAfter: 1,
    p19DeltaDb: 0.01, p20DeltaDb: -0.02,
  },
  result: CALIBRATION_EVIDENCE_RESULT.NO_USEFUL_IMPROVEMENT,
  reason: null,
  scope: null,
});

describe("the live held gain trim reads as a suggestion, not as a failed optimisation", () => {
  const record = savedGainLever();
  const suggestion = calibrationSuggestion(record);

  it("states the adjustment, the improvement and the level, in that order", () => {
    expect(suggestion).toBeTruthy();
    expect(suggestion.summary).toBe(PREFERRED_COPY);
  });

  it("replaces the refusal state with the suggestion state", () => {
    expect(calibrationOutcomeLabel(record)).toBe(CALIBRATION_SUGGESTION_STATE);
    expect(calibrationOutcomeLabel(record)).not.toMatch(/1 dB action threshold/);
    expect(calibrationOutcomeLabel(record)).not.toMatch(/seat-level rule/);
  });

  it("never restates the measured 1.29 dB as 2 dB", () => {
    // The exact measurement is stated, from the record's own before → after pair.
    expect(suggestion.detail).toContain("improves by 1.29 dB");
    expect(suggestion.summary).not.toMatch(/\b2 dB\b/);
    expect(suggestion.summary).not.toMatch(/\b1\.29 dB\b/);
  });

  it("keeps threshold arithmetic and seat talk out of the designer's line", () => {
    expect(suggestion.summary).not.toMatch(/threshold|seat-level|1 dB/);
    expect(suggestion.summary).not.toMatch(/seat/i);
  });

  it("keeps the diagnostic evidence in Engineer details, not in the designer's line", () => {
    // The designer's line states what to do with the suggestion, and nothing else.
    expect(suggestion.note).toBe(CALIBRATION_SUGGESTION_NOTE);
    expect(suggestion.note).not.toMatch(/seat|threshold|dB/i);
    // The missing seat-level confirmation is stated where the evidence belongs.
    expect(suggestion.detail).toMatch(/seat-level confirmation this needs was not retained/);
    // No seat is claimed to have failed: this run retained no seat values.
    expect(suggestion.detail).not.toMatch(/no primary seat clears/);
    expect(suggestion.summary).not.toMatch(/Row \d|Seat \d/);
  });

  it("keeps the exact figures and thresholds for Engineer details", () => {
    expect(suggestion.detail).toContain("10.15 dB → 8.86 dB");
    expect(suggestion.detail).toMatch(/seat-level 1 dB, material damage 1 dB/);
  });
});

describe("the classification is narrow: only a useful, regression-free improvement is a suggestion", () => {
  const held = (overrides) => ({
    ...savedGainLever(),
    ...overrides,
    bestCandidate: { ...savedGainLever().bestCandidate, ...(overrides.bestCandidate || {}) },
  });

  it("keeps a genuine sub-threshold hold exactly as it was", () => {
    const genuine = held({ bestCandidate: { p20Before: 6.0, p20After: 5.95, p20DeltaDb: -0.05 } });
    expect(calibrationSuggestion(genuine)).toBeNull();
    // A change that really is under the figure keeps the sentence that says so.
    expect(calibrationOutcomeLabel(genuine)).toMatch(/does not clear the 1 dB action threshold/);
  });

  it("does not read a 0.96 dB improvement as clearing the figure", () => {
    const borderline = held({ bestCandidate: { p20Before: 6.0, p20After: 5.04, p20DeltaDb: -1.0 } });
    expect(calibrationSuggestion(borderline)).toBeNull();
    expect(calibrationOutcomeLabel(borderline)).toMatch(/does not clear the 1 dB action threshold/);
  });

  it("never turns a displayed level drop into a suggestion", () => {
    const dropped = held({ bestCandidate: { p20LevelBefore: 2, p20LevelAfter: 1 } });
    expect(calibrationSuggestion(dropped)).toBeNull();
  });

  it("never turns a regression or a hand-set calibration into a suggestion", () => {
    const regressed = held({ notAppliedReason: "Not applied because a primary seat would regress." });
    expect(calibrationSuggestion(regressed)).toBeNull();
    expect(calibrationOutcomeLabel(regressed)).toBe("Not applied because a primary seat would regress.");

    const handSet = held({ notAppliedReason: "Not applied because the current calibration was set by hand and is not overwritten automatically." });
    expect(calibrationSuggestion(handSet)).toBeNull();

    const traded = held({ notAppliedReason: "Not applied because it worsens P20 materially — a trade-off for you to approve." });
    expect(calibrationSuggestion(traded)).toBeNull();
  });

  it("keeps the old seat-level refusal for a record that really was held on it", () => {
    const seatHeld = held({ notAppliedReason: NOT_APPLIED_SEAT_SUMMARY, bestCandidate: { p20Before: 6.0, p20After: 5.6, p20DeltaDb: -0.4 } });
    expect(calibrationSuggestion(seatHeld)).toBeNull();
    expect(calibrationOutcomeLabel(seatHeld)).toBe(NOT_APPLIED_SEAT_SUMMARY);
  });
});

describe("a verified seat figure states its own disadvantage", () => {
  const suggestion = describeCalibrationSuggestion({
    lever: "gain",
    groupWord: "front",
    gainDb: -2.5,
    before: { p20: { level: 1, deviationDb: 10.145817163909001 }, p19: { level: 4, deviationDb: 0.8394027885794486 } },
    after: { p20: { level: 1, deviationDb: 8.8602947594255 }, p19: { level: 4, deviationDb: 0.8387303307951584 } },
    improvementDb: 1.2855224044835012,
    seatImprovementDb: 0.2,
    seatThresholdDb: 1,
  });

  it("states the same designer line", () => {
    expect(suggestion.summary).toBe(PREFERRED_COPY);
  });

  it("states the seat figure it was held against, in Engineer details", () => {
    expect(suggestion.detail).toMatch(/The limiting primary seat improves by 0\.2 dB, under the 1 dB seat-level figure\./);
    expect(suggestion.note).toBe(CALIBRATION_SUGGESTION_NOTE);
  });
});

describe("the four decision states stay distinguishable", () => {
  it("names a suggestion, a worthless change and a regression differently", () => {
    const dispositions = Object.values(MATERIALITY_DISPOSITION);
    expect(new Set(dispositions).size).toBe(dispositions.length);
    expect(classifyCalibrationDisposition({ improvementDb: 1.2855 }).disposition)
      .toBe(MATERIALITY_DISPOSITION.IMPROVEMENT_WORTH_CONSIDERING);
    expect(classifyCalibrationDisposition({ improvementDb: 0.2 }).disposition)
      .toBe(MATERIALITY_DISPOSITION.NO_WORTHWHILE_IMPROVEMENT);
    expect(classifyCalibrationDisposition({ improvementDb: 5, meaningfulRegression: true }).disposition)
      .toBe(MATERIALITY_DISPOSITION.MEANINGFUL_REGRESSION);
    expect(classifyCalibrationDisposition({ improvementDb: 5, levelDropped: true }).disposition)
      .toBe(MATERIALITY_DISPOSITION.MEANINGFUL_REGRESSION);
  });

  it("records the suggestion as its own decision reason", () => {
    expect(CALIBRATION_APPLY_REASON.IMPROVEMENT_WORTH_CONSIDERING)
      .toBe("calibration-improvement-worth-considering");
  });

  it("gives each of the four decision states its own reason and its own outcome", () => {
    // applied · worth considering · no worthwhile improvement · rejected for a regression
    const applied = [CALIBRATION_APPLY_DECISION.APPLIED, CALIBRATION_APPLY_REASON.IMPROVES_ONE_WITHOUT_DAMAGE];
    const suggestion = [CALIBRATION_APPLY_DECISION.NONE, CALIBRATION_APPLY_REASON.IMPROVEMENT_WORTH_CONSIDERING];
    const notWorthwhile = [CALIBRATION_APPLY_DECISION.NONE, CALIBRATION_APPLY_REASON.NOT_MATERIAL];
    const rejected = [CALIBRATION_APPLY_DECISION.HOLD, CALIBRATION_APPLY_REASON.PRIMARY_SEAT_REGRESSION];
    // No two states share a reason: the reason alone identifies the state.
    expect(new Set([applied[1], suggestion[1], notWorthwhile[1], rejected[1]]).size).toBe(4);
    // Only the applied state claims a change ADI made on its own authority.
    expect(applied[0]).toBe("applied");
    expect(suggestion[0]).toBe("none");
    expect(notWorthwhile[0]).toBe("none");
    expect(rejected[0]).toBe("hold");
  });
});

describe("the suggestion is stated once", () => {
  const evidence = {
    levers: {
      delay: noImprovementLever("delay", "Delay"),
      gain: savedGainLever(),
      polarity: noImprovementLever("polarity", "Polarity"),
    },
  };
  const state = resolveCalibrationEvidenceState(evidence);

  it("carries the suggestion as its own line", () => {
    expect(state.suggestionLines).toHaveLength(1);
    expect(state.suggestionLines[0].lever).toBe("gain");
    expect(state.suggestionLines[0].text).toBe(PREFERRED_COPY);
    expect(state.improvementWorthConsidering).toBe(true);
  });

  it("does not repeat it among the lever lines or the held refusals", () => {
    expect(state.leverLines.map((line) => line.lever)).not.toContain("gain");
    expect(state.heldLines).toHaveLength(0);
  });

  it("still states the levers that found nothing useful", () => {
    expect(state.leverLines.map((line) => line.lever)).toEqual(["delay", "polarity"]);
    expect(state.noImprovementProven).toBe(false);
  });
});