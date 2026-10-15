// Acceptance tests for the reported defect:
//
//   "No usable recommendation was confirmed because the evaluation did not
//    complete" / "the current design could not be validated"
//
// while the optimiser itself displayed the published Current result and had
// confirmed a better attempt.
//
// Product rules under test:
//   1. A published Current that matches the live design IS the comparison
//      baseline. It is never required to be rediscovered as a candidate.
//   2. A candidate does NOT need to cross an RP22 level boundary to be valuable:
//      P20 ±15 dB · L1 -> P20 ±11 dB · L1 is a real improvement.
//   3. One status authority words every searched lever, and "not applicable"
//      never means "tested, nothing useful found".
import { describe, it, expect } from "vitest";
import { isMaterialImprovement, MATERIALITY_RULE } from "../components/room/bass/improveBassV2/materialityGate.js";
import { gradeP20FromRaw } from "../components/room/bass/completedBassResultPersistence.js";
import {
  ADI_LEVER_STATUS,
  resolveAdiLeverStatus,
} from "../components/room/bass/optimiserPlan/adiLeverStatusAuthority.js";

const seat = (id, raw) => ({
  seatId: id,
  isPrimary: true,
  level: gradeP20FromRaw(raw),
  variationDbRaw: raw,
  worstFrequencyHz: 97.33,
});

/** A result carrying the canonical aggregate P19 headline and per-seat P20. */
const result = (raws, aggregateRaw, p19Db = 0.79) => ({
  perSeatP20: raws.map(([id, raw]) => seat(id, raw)),
  perSeatP19: [],
  achievedP20VariationDb: aggregateRaw,
  achievedP20Level: gradeP20FromRaw(aggregateRaw),
  achievedP19VariationDb: p19Db,
  achievedP19Level: 4,
});

describe("a confirmed improvement is recognised without a level crossing", () => {
  const current = result([["seat-r1-c1", 15.11], ["seat-r1-c2", 14.8], ["seat-r2-c1", 13.2]], 15.1072);
  const candidate = result([["seat-r1-c1", 11.0], ["seat-r1-c2", 10.6], ["seat-r2-c1", 10.9]], 11.0);

  it("grades both the published Current and the better attempt as L1", () => {
    expect(current.achievedP20Level).toBe(1);
    expect(candidate.achievedP20Level).toBe(1);
  });

  it("treats the improvement as material and never discards it for being L1 -> L1", () => {
    const verdict = isMaterialImprovement(current, candidate);
    expect(verdict.material).toBe(true);
    expect(verdict.rule).toBe(MATERIALITY_RULE.P20_AGGREGATE_IMPROVED);
    expect(verdict.details.levelHeld).toBe(true);
    expect(verdict.details.improvement).toBeCloseTo(4.1, 1);
  });

  it("states the improvement in the designer's own words", () => {
    const verdict = isMaterialImprovement(current, candidate);
    expect(verdict.reason).toMatch(/seat-to-seat consistency improved/i);
    expect(verdict.reason).toMatch(/without changing the achieved level/i);
  });

  it("still refuses an improvement smaller than the 1 dB action figure", () => {
    const marginal = result([["seat-r1-c1", 14.6], ["seat-r1-c2", 14.2], ["seat-r2-c1", 12.9]], 14.6);
    const verdict = isMaterialImprovement(current, marginal);
    expect(verdict.material).toBe(false);
  });

  it("still refuses a candidate that worsens a required metric", () => {
    const worse = result([["seat-r1-c1", 12.0], ["seat-r1-c2", 11.0], ["seat-r2-c1", 10.5]], 12.0, 3.4);
    const verdict = isMaterialImprovement(current, worse);
    // P20 improves, but the aggregate RSP P19 worsens materially: this is never
    // stated as a plain improvement on seat-to-seat consistency.
    expect(verdict.material).toBe(false);
    expect(verdict.rule).not.toBe(MATERIALITY_RULE.P20_AGGREGATE_IMPROVED);
  });
});

describe("one gain status, in the exact states", () => {
  const GAIN_GROUPING_REASON = "Grouped gain search supports one, two or four active sources.";

  it("reports NOT TESTED for a lever no pass reached", () => {
    expect(resolveAdiLeverStatus({ tested: false }).label).toBe("NOT TESTED");
  });

  it("reports NOT APPLICABLE with the real reason, never as a bare claim", () => {
    const state = resolveAdiLeverStatus({ applicable: false, notApplicableReason: GAIN_GROUPING_REASON });
    expect(state.status).toBe(ADI_LEVER_STATUS.NOT_APPLICABLE);
    expect(state.label).toBe(`NOT APPLICABLE — ${GAIN_GROUPING_REASON}`);
  });

  it("never reports NOT APPLICABLE without a real reason", () => {
    const state = resolveAdiLeverStatus({ applicable: false, notApplicableReason: null });
    expect(state.notApplicable).toBe(false);
    expect(state.label).toBe("NOT TESTED");
  });

  it("reports TESTED — NO IMPROVEMENT for a tested lever that found nothing useful", () => {
    const state = resolveAdiLeverStatus({ tested: true, candidateCount: 4, confirmed: false });
    expect(state.status).toBe(ADI_LEVER_STATUS.TESTED_NO_IMPROVEMENT);
    expect(state.label).toBe("TESTED — NO IMPROVEMENT");
    expect(state.notApplicable).toBe(false);
  });

  it("distinguishes a confirmed improvement that was not selected", () => {
    expect(resolveAdiLeverStatus({ tested: true, confirmed: true, selected: false }).label)
      .toBe("TESTED — NOT SELECTED");
  });

  it("reports IMPROVEMENT FOUND when the confirmed improvement is the one taken", () => {
    expect(resolveAdiLeverStatus({ tested: true, confirmed: true, selected: true }).label)
      .toBe("IMPROVEMENT FOUND");
  });
});