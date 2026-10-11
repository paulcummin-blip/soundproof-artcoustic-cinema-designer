/**
 * adi-combined-calibration-result.test.mjs
 * ---------------------------------------------------------------------------
 * The rule under test: the Bass Optimisation panel must say whether the
 * calibration result ADI's own decision names came from ONE isolated lever
 * (delay only, gain only) or from levers retuned TOGETHER, and it must keep the
 * combined result as evidence of its own.
 *
 * Every value asserted here is read from the run's own decision and evidence.
 * The resolver evaluates nothing, scores nothing and changes no threshold.
 */

import { describe, expect, it } from "vitest";
import {
  CALIBRATION_EVIDENCE_STATUS,
  buildCalibrationEvidence,
  combinedCalibrationEvidence,
  describeCombinedCalibration,
} from "../components/room/bass/optimiserPlan/optimiserCalibrationEvidence.js";
import {
  formatCalibrationComposition,
  resolveBestCalibrationResult,
} from "../components/room/bass/optimiserPlan/bestCalibrationResult.js";

const baseline = {
  candidateId: "current",
  achievedP19VariationDb: 0.6226806962877447,
  achievedP19Level: 4,
  achievedP20VariationDb: 27.385358618586395,
  achievedP20Level: 1,
  perSeatP20: [{ seatId: "seat-r1-c1", variationDbRaw: 27 }],
};

/** The Genesis AV "Original Design" decision, exactly as the saved run recorded it. */
const genesisDecision = {
  decision: "applied",
  reason: "improves-one-objective-without-damaging-the-other",
  objective: "practical",
  candidateId: 'grouped-delay:["sub-front-1","sub-front-2"]:3',
  selected: { lever: "delay", candidateId: 'grouped-delay:["sub-front-1","sub-front-2"]:3' },
  before: { p19: { level: 4, deviationDb: 0.6226806962877447 }, p20: { level: 1, deviationDb: 27.385358618586395 } },
  after: { p19: { level: 4, deviationDb: 0.5904156562212108 }, p20: { level: 1, deviationDb: 10.821203787888379 } },
  settings: [
    { key: "delay:sub-front-1", setting: "Delay" },
    { key: "delay:sub-front-2", setting: "Delay" },
  ],
  perLever: {
    delay: { applied: true, statement: null },
    gain: {
      applied: false,
      reason: "stronger-calibration-candidate-selected",
      statement: "Not applied because the delay candidate gives the stronger calibration improvement.",
    },
    polarity: null,
    phase: null,
  },
};

/** A combined retune that retuned phase, delay and gain on one geometry. */
const combinedSelection = {
  currentResult: baseline,
  combinedDiagnostics: { status: "completed", tested: 3, confirmed: 3, valid: 1, invalid: 2 },
  combinedResult: {
    candidateId: "combined-calibration",
    candidateOrigin: "combined",
    achievedP19VariationDb: 0.51,
    achievedP19Level: 4,
    achievedP20VariationDb: 9.4,
    achievedP20Level: 1,
    combinedFrom: { calibrationOnly: true, phaseRetuned: true, delayRetuned: true, gainRetuned: true },
  },
  combinedMaterial: { material: true, reason: "Worst-seat deviation improved" },
};

describe("the calibration composition is named in the panel's own words", () => {
  it("labels one lever as 'only', and several as a combined result", () => {
    expect(formatCalibrationComposition(["delay"])).toBe("Delay only");
    expect(formatCalibrationComposition(["gain"])).toBe("Gain only");
    expect(formatCalibrationComposition(["delay", "gain"])).toBe("Delay + gain");
    expect(formatCalibrationComposition(["phase", "delay", "gain"])).toBe("Phase + delay + gain");
    expect(formatCalibrationComposition([])).toBeNull();
  });

  it("states the Genesis result as delay only, with gain held and the reason", () => {
    const result = resolveBestCalibrationResult({ decision: genesisDecision, evidence: null });
    expect(result.label).toBe("Delay only");
    expect(result.headline).toBe("Best calibration result: Delay only");
    expect(result.stateLabel).toBe("Applied");
    expect(result.statement).toBe("ADI applied the delay adjustment.");
    expect(result.heldSentence)
      .toBe("Gain was tested, but the delay adjustment gave the stronger calibration improvement.");
    expect(result.settingsChanged).toEqual(["Delay"]);
    expect(result.valuesStatement).toContain("P20");
    expect(result.valuesStatement).toContain("P20 L1 / 27.4 dB → L1 / 10.8 dB");
  });

  it("states a combined result as combined when that is the result applied", () => {
    const result = resolveBestCalibrationResult({
      decision: {
        decision: "applied",
        candidateId: "combined-calibration",
        selected: { lever: "polarity", candidateId: "combined-calibration" },
        settings: [
          { key: "delay:sub-a", setting: "Delay" },
          { key: "gain:sub-b", setting: "Gain trim" },
        ],
        perLever: { polarity: { applied: true, statement: null } },
      },
      evidence: {
        combined: {
          evidenceStatus: CALIBRATION_EVIDENCE_STATUS.RETAINED,
          bestCandidate: { candidateId: "combined-calibration" },
        },
      },
    });
    expect(result.label).toBe("Delay + gain");
    expect(result.appliedIsCombined).toBe(true);
    expect(result.statement).toBe("ADI applied the combined delay and gain adjustment.");
  });

  it("claims nothing when no result was applied or held", () => {
    expect(resolveBestCalibrationResult({ decision: null })).toBeNull();
    expect(resolveBestCalibrationResult({ decision: { decision: "none" } })).toBeNull();
  });
});

describe("the combined result is kept as its own evidence", () => {
  it("records the combined result with the levers it retuned and what came of it", () => {
    const evidence = buildCalibrationEvidence({ selection: combinedSelection });
    const combined = combinedCalibrationEvidence(evidence);
    expect(combined).not.toBeNull();
    expect(combined.bestCandidate.candidateId).toBe("combined-calibration");
    expect(combined.bestCandidate.phaseRetuned).toBe(true);
    expect(combined.bestCandidate.delayRetuned).toBe(true);
    expect(combined.bestCandidate.gainRetuned).toBe(true);
    expect(combined.candidateCounts.confirmed).toBe(3);
    expect(describeCombinedCalibration(combined)).toContain("P20");
    // No isolated lever was searched in this run, so nothing is claimed for one.
    expect(evidence.levers.delay.evidenceStatus).toBe(CALIBRATION_EVIDENCE_STATUS.MISSING);
  });

  it("states plainly when the combined search ran and confirmed nothing", () => {
    const evidence = buildCalibrationEvidence({
      selection: {
        currentResult: baseline,
        calibrationDiagnostics: { retained: 2, confirmed: 2, options: [] },
        combinedDiagnostics: { status: "no_improvement", tested: 3, confirmed: 0, valid: 0, invalid: 0 },
      },
    });
    const combined = combinedCalibrationEvidence(evidence);
    expect(combined.tested).toBe(true);
    expect(combined.bestCandidate).toBeNull();
    expect(combined.reason).toMatch(/no combined calibration candidate was confirmed/i);
  });

  it("keeps an older saved record honest: no combined result is claimed for it", () => {
    const evidence = buildCalibrationEvidence({
      selection: {
        currentResult: baseline,
        calibrationDiagnostics: { retained: 1, confirmed: 1, options: [] },
      },
    });
    expect(combinedCalibrationEvidence(evidence)).toBeNull();
    const result = resolveBestCalibrationResult({ decision: genesisDecision, evidence });
    expect(result.label).toBe("Delay only");
    expect(result.combinedCandidateId).toBeNull();
  });
});