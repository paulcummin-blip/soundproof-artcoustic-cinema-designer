// calibration-held-reason.test.mjs
// ---------------------------------------------------------------------------
// The reason shown for a calibration improvement that was held.
//
// The case this exists for is the live Jooced run: a front-pair gain trim of
// −2.5 dB improved the overall P20 by 1.2855 dB (10.1458 → 8.8603 dB) and was
// still refused, with the sentence "Not applied because it does not clear the
// 1 dB action threshold." — a threshold the change clears on the record's own
// figures. The run held it on its seat-level criterion, and the candidate-level
// seat results behind that criterion were not retained, so the seat's own before
// and after cannot be read back.
//
// What is verified here:
//   • a stored sentence that names a threshold its own figures clear is NOT
//     repeated: the reason shown is that the required seat-level improvement
//     could not be verified from the available results
//   • no seat — and no "no seat clears the rule" — is claimed without the seat
//     values, and no measurement is invented
//   • a genuinely sub-threshold hold keeps its own sentence (no over-triggering),
//     including a real 0.96 dB improvement whose one-decimal delta reads as 1.0
//   • a verified seat-level refusal, and its figure-bearing Held detail, pass
//     through untouched
//
// The values are the saved record's own, read from the persisted run evidence.
// Nothing is recalculated here.
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";

import {
  NOT_APPLIED_SEAT_SUMMARY,
  NOT_APPLIED_SEAT_UNVERIFIED_SUMMARY,
  NOT_APPLIED_THRESHOLD_SUMMARY,
} from "../src/components/room/bass/optimiseWorkflow/adiCalibrationAutoApplyAuthority.js";
import {
  CALIBRATION_EVIDENCE_RESULT,
  CALIBRATION_EVIDENCE_STATUS,
  calibrationOutcomeLabel,
  describeCalibrationLever,
} from "../src/components/room/bass/optimiserPlan/optimiserCalibrationEvidence.js";

/** The saved gain lever of the live Jooced run, verbatim. */
const savedGainLever = () => ({
  lever: "gain",
  label: "Gain",
  tested: true,
  evidenceStatus: CALIBRATION_EVIDENCE_STATUS.RETAINED,
  candidateCount: 4,
  bestCandidate: {
    candidateId: 'gain:grouped-gain:["sub-front-1","sub-front-2"]:-2.5',
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
    // No candidate-level seat result was retained with this run.
    limitingSeatId: null,
    limitingFrequencyHz: null,
    adjustmentDb: -2.5,
  },
  result: CALIBRATION_EVIDENCE_RESULT.IMPROVEMENT_NOT_APPLIED,
  reason: null,
  scope: null,
  decision: "none",
  decisionReason: "calibration-improvement-not-material",
  notAppliedReason: "Not applied because it does not clear the 1 dB action threshold.",
  notAppliedDetailReason: null,
});

describe("the live held gain trim states what can be verified, and nothing more", () => {
  const record = savedGainLever();

  it("never repeats a threshold the record's own figures clear", () => {
    const reason = calibrationOutcomeLabel(record);
    expect(reason).toBe(NOT_APPLIED_SEAT_UNVERIFIED_SUMMARY);
    expect(reason).not.toMatch(/1 dB action threshold/);
    expect(reason).not.toMatch(/1 dB seat-level rule/);
    expect(reason).toMatch(/could not be verified from the available results/);
    // The sentence the saved record carried is gone from every rendered line.
    const line = describeCalibrationLever(record);
    expect(line).not.toMatch(/1 dB action threshold/);
    expect(line).toContain(NOT_APPLIED_SEAT_UNVERIFIED_SUMMARY);
  });

  it("claims no seat failed, and names no seat at all", () => {
    const reason = calibrationOutcomeLabel(record);
    expect(reason).not.toMatch(/no primary seat clears/);
    expect(reason).not.toMatch(/limiting seat (improves|did not)/);
    expect(reason).not.toMatch(/Row \d|Seat \d|seat-r\d-c\d/);
  });

  it("keeps the designer line free of figures and the detail evidence-bound", () => {
    const summary = calibrationOutcomeLabel(record);
    expect(summary).not.toMatch(/\d/);
    const detail = describeCalibrationLever(record);
    // The run's own measured improvement is stated; no seat value is invented.
    expect(detail).toMatch(/P20/);
  });

  it("still shows the improvement the run actually measured", () => {
    const line = describeCalibrationLever(record);
    // The card's own whole-number form of 10.1458 → 8.8603 dB. Full precision
    // stays in the record; the surface reports whole dB.
    expect(line).toMatch(/P20 ±10 dB → ±8 dB/);
    expect(line).toMatch(/-?2\.5 dB/);
  });
});

describe("the reconciliation is narrow: it only fires on a sentence its own figures contradict", () => {
  const withFigures = (p20Before, p20After, p20DeltaDb, stored) => ({
    ...savedGainLever(),
    bestCandidate: { ...savedGainLever().bestCandidate, p20Before, p20After, p20DeltaDb },
    notAppliedReason: stored,
  });

  it("keeps a genuine sub-threshold hold exactly as stored", () => {
    const genuine = withFigures(6.0, 5.95, -0.05, NOT_APPLIED_THRESHOLD_SUMMARY);
    expect(calibrationOutcomeLabel(genuine)).toBe(NOT_APPLIED_THRESHOLD_SUMMARY);
  });

  it("does not read a 0.96 dB improvement as clearing the threshold", () => {
    // The stored one-decimal delta of a 0.96 dB change is −1.0, which would look
    // like it clears the rule. The before → after pair is what decides.
    const borderline = withFigures(6.0, 5.04, -1.0, NOT_APPLIED_THRESHOLD_SUMMARY);
    expect(calibrationOutcomeLabel(borderline)).toBe(NOT_APPLIED_THRESHOLD_SUMMARY);
  });

  it("leaves a verified seat-level refusal, and its figures, untouched", () => {
    const verified = {
      ...savedGainLever(),
      notAppliedReason: NOT_APPLIED_SEAT_SUMMARY,
      notAppliedDetailReason:
        "Not applied because no primary seat clears the 1 dB seat-level rule: the limiting primary seat Row 2 · Seat 2 improves by 0.3 dB, while the overall P20 figure improves by 1.3 dB.",
    };
    expect(calibrationOutcomeLabel(verified)).toBe(NOT_APPLIED_SEAT_SUMMARY);
  });
});