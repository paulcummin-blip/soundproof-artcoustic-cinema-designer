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
import fs from "node:fs";
import {
  ADI_BEST_IMPROVEMENT_LABEL,
  ADI_CALIBRATION_KIND,
  ADI_CALIBRATION_NOT_TESTED_SENTENCE,
  ADI_CALIBRATION_TESTED_SENTENCE,
  ADI_DESIGN_NOT_APPLIED,
  ADI_NO_CALIBRATION_IMPROVEMENT,
  ADI_NO_DESIGN_CHANGE_APPLIED,
  ADI_NO_SAFE_CALIBRATION_IMPROVEMENT,
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
import { resolveBestCalibrationResult } from "../components/room/bass/optimiserPlan/bestCalibrationResult.js";
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
  ADI_NO_SAFE_CALIBRATION_IMPROVEMENT,
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
    expect(ADI_NO_CALIBRATION_IMPROVEMENT).toBe("No useful adjustment-only improvement was found.");
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
  it("keeps the detailed proof inside a collapsed Engineer details block", () => {
    const journey = fs.readFileSync(
      new URL("../components/room/bass/optimiserPlan/AdiOptimisationJourney.jsx", import.meta.url),
      "utf8",
    );
    const openTag = journey.match(/<details[^>]*data-adi-engineer-details="true"[^>]*>/)?.[0] || "";
    expect(openTag).not.toBe("");
    // Collapsed by default: the disclosure carries no `open` attribute.
    expect(openTag).not.toMatch(/\bopen\b/);

    const start = journey.indexOf(openTag);
    // The candidate-level proof — calibration evidence per lever and the tested
    // options table — renders inside that disclosure, not in the default panel.
    expect(journey.indexOf("<AdiCalibrationEvidenceBlock", start)).toBeGreaterThan(start);
    expect(journey.indexOf("<AdiTestedOptionsTable", start)).toBeGreaterThan(start);
  });

  it("claims tested-with-no-improvement only when the record proves it", () => {
    expect(resolveCalibrationSectionKind({ evaluated: true, evidenceRetained: true }))
      .toBe(ADI_CALIBRATION_KIND.TESTED);
    expect(resolveCalibrationSectionKind({ evaluated: true, evidenceRetained: false }))
      .toBe(ADI_CALIBRATION_KIND.EVIDENCE_MISSING);
  });

  it("asks for the re-test when the evidence is missing", () => {
    expect(CALIBRATION_EVIDENCE_MISSING_MESSAGE).toMatch(/was not retained for this run/i);
    expect(CALIBRATION_EVIDENCE_MISSING_MESSAGE).toMatch(/Re-run calibration/i);
    expect(CALIBRATION_EVIDENCE_MISSING_MESSAGE).toMatch(/delay, gain and polarity/i);
    // It states what was kept, never that the system failed or that a lever was
    // left unevaluated.
    expect(CALIBRATION_EVIDENCE_MISSING_MESSAGE).not.toMatch(/not available|not evaluated|not tested|failure|error|failed/i);
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
    // The published current P20 matches the state the evaluation ran on, so the
    // run's own before → after pair is the pair the designer is shown.
    currentP20Deviation: GENESIS_BASELINE.p20VariationDb,
    currentP20Level: GENESIS_BASELINE.p20Level,
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

describe("a calibration result that makes P20 worse never leads the panel", () => {
  // The state this guards: the current result is P20 L1 ±10.8 dB, and the
  // candidate ADI's own decision named took it to L1 ±20.4 dB — a material
  // worsening, held rather than applied.
  const heldWorseningDecision = {
    decision: "hold",
    reason: "trade-off-larger-than-the-improvement",
    candidateId: "gain-candidate",
    selected: { candidateId: "gain-candidate" },
    settings: [{ key: "gain:sub-a", setting: "Gain trim" }],
    before: { p19: { level: 4, deviationDb: 0.9 }, p20: { level: 1, deviationDb: 10.8 } },
    after: { p19: { level: 4, deviationDb: 1.1 }, p20: { level: 1, deviationDb: 20.4 } },
  };

  const appliedImprovingDecision = {
    decision: "applied",
    reason: "improves-one-objective-without-damaging-the-other",
    candidateId: "delay-candidate",
    selected: { candidateId: "delay-candidate" },
    settings: [{ key: "delay:sub-a", setting: "Delay" }],
    before: { p19: { level: 4, deviationDb: 1 }, p20: { level: 1, deviationDb: 27.4 } },
    after: { p19: { level: 4, deviationDb: 1 }, p20: { level: 1, deviationDb: 10.8 } },
  };

  it("recognises the worsening from the decision's own canonical values", () => {
    const result = resolveBestCalibrationResult({ decision: heldWorseningDecision });
    expect(result.worsensP20).toBe(true);
    expect(result.mainPanelSuppressed).toBe(true);
    // The values are still readable — in Engineer details, never dropped.
    expect(result.valuesStatement).toContain("P20 L1 / 10.8 dB → L1 / 20.4 dB");
  });

  it("states no safe calibration improvement instead of that candidate", () => {
    const result = resolveBestCalibrationResult({ decision: heldWorseningDecision });
    expect(ADI_NO_SAFE_CALIBRATION_IMPROVEMENT)
      .toBe("No safe adjustment was found.");
    expect(result.mainPanelCopy).toEqual({
      tested: ADI_CALIBRATION_TESTED_SENTENCE,
      sentence: ADI_NO_SAFE_CALIBRATION_IMPROVEMENT,
    });
  });

  it("still leads with a result ADI applied", () => {
    const result = resolveBestCalibrationResult({ decision: appliedImprovingDecision });
    expect(result.worsensP20).toBe(false);
    expect(result.mainPanelSuppressed).toBe(false);
    expect(result.mainPanelCopy).toBeNull();
    expect(result.headline).toBe("Best calibration result: Delay only");
    expect(result.stateLabel).toBe("Applied");
  });

  it("keeps the held candidate and its values in the collapsed Engineer details block", () => {
    const journey = fs.readFileSync(
      new URL("../components/room/bass/optimiserPlan/AdiOptimisationJourney.jsx", import.meta.url),
      "utf8",
    );
    const openTag = journey.match(/<details[^>]*data-adi-engineer-details="true"[^>]*>/)?.[0] || "";
    const start = journey.indexOf(openTag);
    expect(start).toBeGreaterThan(-1);
    expect(journey.indexOf("data-adi-calibration-candidate-proof", start)).toBeGreaterThan(start);
  });
});