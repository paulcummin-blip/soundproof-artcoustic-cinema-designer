// adi-panel-client-clarity.test.mjs
// ---------------------------------------------------------------------------
// The Bass Optimisation panel is client-facing. This suite guards the contract
// the panel must keep:
//
//   • the MAIN panel copy carries no debug vocabulary — no proxy, fingerprint,
//     canonical, materiality or candidate-ledger wording
//   • the calibration claim is evidence-backed: the missing-evidence sentence is
//     stated instead whenever the saved record did not keep the search's result
//   • the missing-evidence sentence asks for the re-test, and Engineer details
//     states the same fact in its own words
//   • a design recommendation states the move and the P20 it predicts, and says
//     it has not been applied
//
// Presentation only: no bass maths, no scoring and no optimiser behaviour is
// exercised or changed here.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import {
  ADI_BEST_IMPROVEMENT_LABEL,
  ADI_CALIBRATION_KIND,
  ADI_CALIBRATION_NOT_TESTED_SENTENCE,
  ADI_CALIBRATION_TESTED_SENTENCE,
  ADI_DESIGN_NOT_APPLIED,
  ADI_NO_CALIBRATION_IMPROVEMENT,
  ADI_NO_DESIGN_CHANGE_APPLIED,
  ADI_PANEL_FINDING,
  ADI_PANEL_TITLE,
  ADI_PREDICTED_RESULT_LABEL,
  ADI_SECTION_TITLE,
  ADI_TESTED_NOTHING,
  buildAdiTestedGroups,
  resolveAdiPanelFinding,
  resolveCalibrationSectionKind,
} from "../components/room/bass/optimiserPlan/adiPanelSections.js";
import {
  CALIBRATION_EVIDENCE_MISSING_DETAIL,
  CALIBRATION_EVIDENCE_MISSING_MESSAGE,
  CALIBRATION_TRADE_OFF_MESSAGE,
} from "../components/room/bass/optimiserPlan/optimiserCalibrationEvidence.js";
import { ADI_ROW_STATUS } from "../components/room/bass/optimiserPlan/optimiserFamilyLedgerRows.js";
import { buildAdiDesignerSummary } from "../components/room/bass/optimiserPlan/adiDesignerSummary.js";
import { OPTIMISER_PRESENTATION_STATE } from "../components/room/bass/optimiserPlan/resolveOptimiserPresentationState.js";

/**
 * Every sentence the main (non-collapsed) panel can print. Engineer details are
 * deliberately absent: candidate ids, counts, fingerprints and rejection reasons
 * are allowed there and nowhere else.
 */
const MAIN_PANEL_COPY = [
  ADI_PANEL_TITLE,
  ...Object.values(ADI_PANEL_FINDING),
  ADI_CALIBRATION_TESTED_SENTENCE,
  ADI_NO_CALIBRATION_IMPROVEMENT,
  ADI_CALIBRATION_NOT_TESTED_SENTENCE,
  ADI_DESIGN_NOT_APPLIED,
  ADI_NO_DESIGN_CHANGE_APPLIED,
  ADI_TESTED_NOTHING,
  ADI_BEST_IMPROVEMENT_LABEL,
  ADI_PREDICTED_RESULT_LABEL,
  ...Object.values(ADI_SECTION_TITLE),
  ...Object.values(ADI_ROW_STATUS),
  CALIBRATION_EVIDENCE_MISSING_MESSAGE,
  CALIBRATION_TRADE_OFF_MESSAGE,
];

const DEBUG_TERMS = [
  /proxy/i,
  /fingerprint/i,
  /canonical/i,
  /materiality/i,
  /ledger/i,
  /\bcandidate\b/i,
  /\bweighting\b/i,
];

/** The seating recommendation exactly as the Genesis AV run saved it. */
const GENESIS_BASELINE = { p20VariationDb: 27.385358618586395, p20Level: 1, p19Level: 4 };

const GENESIS_SEATING_LEVER = {
  lever: "seating",
  evaluated: true,
  practical: true,
  changes: [{ kind: "seating", seatingOffsetMm: 300 }],
  seating: { movementLabel: "Move the seating 300 mm away from the screen", wholeBlockMoved: true },
  validation: { destinationsValid: true, basis: "checked by the optimiser" },
  reason: "Severe null reduced by 14 dB",
  effect: {
    p20VariationDb: 13.355385805925678,
    p19VariationDb: 0.5891787357793845,
    p20DeltaDb: -14.03,
    p19DeltaDb: -0.03,
    p20LevelBefore: 1,
    p20LevelAfter: 1,
    p19LevelBefore: 4,
    p19LevelAfter: 4,
    p14DeltaDb: -0.08,
    p18DeltaHz: 0,
    worstSeatId: "seat-r1-c1",
    worstFrequencyHz: 140.65892265831016,
  },
};

const genesisPlanView = (extra = {}) => ({
  status: "current",
  baseline: GENESIS_BASELINE,
  baselineParity: { status: "MATCH" },
  individualEffectsEvaluated: true,
  levers: [GENESIS_SEATING_LEVER],
  ...extra,
});

describe("the main panel stays client-readable", () => {
  it("carries no debug vocabulary anywhere in its own copy", () => {
    MAIN_PANEL_COPY.forEach((line) => {
      DEBUG_TERMS.forEach((term) => {
        expect(line).not.toMatch(term);
      });
    });
  });

  it("leads with the design decision when the improvement is physical", () => {
    expect(ADI_PANEL_FINDING.TESTED_NO_CALIBRATION).toMatch(/physical design change/i);
    // The calibration section states the tested levers and their outcome, so the
    // finding never repeats the no-improvement sentence.
    expect(ADI_PANEL_FINDING.TESTED_NO_CALIBRATION)
      .not.toMatch(/no useful calibration-only improvement/i);
  });

  it("states the tested levers and the no-improvement outcome in the section's own words", () => {
    expect(ADI_CALIBRATION_TESTED_SENTENCE).toBe("ADI tested delay, gain and polarity.");
    expect(ADI_NO_CALIBRATION_IMPROVEMENT).toBe("No useful calibration-only improvement was found.");
  });

  it("keeps the per-family outcome text out of the compact tested list", () => {
    const rows = [
      { key: "delay", label: "Delay", status: ADI_ROW_STATUS.TESTED, outcome: "some long reason" },
      { key: "seating", label: "Seating", status: ADI_ROW_STATUS.LAST_RESORT, outcome: "policy text" },
      { key: "absorption", label: "Low-frequency absorption", status: ADI_ROW_STATUS.RECOMMENDED, outcome: "review the front wall", advice: true },
    ];
    const { calibration, design } = buildAdiTestedGroups(rows);
    expect(calibration.map((row) => row.key)).toEqual(["delay"]);
    expect(calibration[0].note).toBeNull();
    // Only advice carries its note in the compact view.
    expect(design.map((row) => row.note)).toEqual([null, "review the front wall"]);
  });
});

describe("the calibration claim is evidence-backed", () => {
  it("claims tested-with-no-improvement only when the record proves it", () => {
    expect(resolveCalibrationSectionKind({ evaluated: true, evidenceRetained: true }))
      .toBe(ADI_CALIBRATION_KIND.TESTED);
    expect(resolveCalibrationSectionKind({ evaluated: true, evidenceRetained: false }))
      .toBe(ADI_CALIBRATION_KIND.EVIDENCE_MISSING);
  });

  it("asks for the re-test when the evidence is missing", () => {
    expect(CALIBRATION_EVIDENCE_MISSING_MESSAGE).toMatch(/not available for this run/i);
    expect(CALIBRATION_EVIDENCE_MISSING_MESSAGE).toMatch(/Re-test calibration/i);
    expect(CALIBRATION_EVIDENCE_MISSING_MESSAGE).toMatch(/delay, gain and polarity/i);
  });

  it("never states the no-improvement claim when the evidence is missing", () => {
    const finding = resolveAdiPanelFinding({
      evaluated: true,
      designRecommended: true,
      calibrationEvidenceRetained: false,
    });
    expect(finding).toBe(CALIBRATION_EVIDENCE_MISSING_MESSAGE);
    expect(finding).not.toMatch(/no useful calibration-only improvement/i);
    expect(resolveAdiPanelFinding({
      evaluated: true,
      designRecommended: false,
      calibrationEvidenceRetained: false,
    })).toBe(CALIBRATION_EVIDENCE_MISSING_MESSAGE);
  });

  it("states the same fact in Engineer details in its own words", () => {
    expect(CALIBRATION_EVIDENCE_MISSING_DETAIL)
      .toBe("Saved optimiser evidence did not include the calibration candidate summary.");
    expect(CALIBRATION_EVIDENCE_MISSING_DETAIL).not.toBe(CALIBRATION_EVIDENCE_MISSING_MESSAGE);
  });
});

describe("the design recommendation is clear about the move and the result", () => {
  const summary = buildAdiDesignerSummary({
    planView: genesisPlanView(),
    presentation: { state: OPTIMISER_PRESENTATION_STATE.PLAN_AVAILABLE },
  });

  it("names the seating move as the best improvement found", () => {
    expect(summary.recommendedLever).toBe("seating");
    expect(summary.seatingRecommendation?.movementLabel)
      .toBe("Move the seating 300 mm away from the screen");
    expect(summary.seatingRecommendation?.wholeBlockMoved).toBe(true);
  });

  it("states the P20 it predicts, in whole dB, with the improvement beside it", () => {
    expect(summary.seatingRecommendation?.p20Before).toBe("±27 dB");
    expect(summary.seatingRecommendation?.p20After).toBe("±13 dB");
    expect(summary.seatingRecommendation?.p20ImprovementDb).toBe(14);
  });

  it("keeps the applied/not-applied statement the panel actually prints", () => {
    expect(ADI_DESIGN_NOT_APPLIED)
      .toBe("This requires a physical design change, so ADI has not applied it.");
  });
});