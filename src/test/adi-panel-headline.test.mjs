// adi-panel-headline.test.mjs
// ---------------------------------------------------------------------------
// The Bass Optimisation panel states a DECISION, not a calculation. This suite
// guards that contract:
//
//   • ONE status per state — applied · improvement to consider · rejected for
//     regression — and never "Applied" for settings that are not in the design
//   • ONE adjustment, ONE figure-free benefit and ONE comparison, whose two
//     values come from the same evaluation
//   • P20 comparisons keep the displayed whole-dB (floored) convention, and the
//     rounded difference is never restated as the exact calculated gain
//   • the copy removed from the main view ("ADI applied safe calibration
//     settings", "Best calibration result", "ADI Applied Bass Calibration",
//     "Current result"/"Best result found") appears in no headline
//   • every technical block is rendered inside the collapsed Engineer details,
//     so the evidence is kept and the main panel stays readable
//
// Presentation only: no bass maths, no acceptance rule and no optimiser
// behaviour is exercised or changed here.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  ADI_PANEL_BENEFIT,
  ADI_PANEL_STATUS,
  p20VariationText,
  resolveAdiPanelHeadline,
} from "../components/room/bass/optimiserPlan/adiPanelHeadline.js";
import { ADI_CALIBRATION_KIND } from "../components/room/bass/optimiserPlan/adiPanelSections.js";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const JOURNEY = "components/room/bass/optimiserPlan/AdiOptimisationJourney.jsx";
const SUMMARY = "components/room/bass/optimiserPlan/AdiPanelSummary.jsx";

/** The canonical before → after of the live applied-calibration case. */
const APPLIED_DELAY = Object.freeze({
  decision: "applied",
  reason: "best-balanced-candidate-improves-the-overall-result",
  statement:
    "ADI applied the balanced acoustic-delay candidate. Rear subwoofer group delay offset +6.2 ms — rear group later than the front group.",
  settings: [
    { key: "delay:sub-a", setting: "Delay", label: "Sub 1 (front)", from: "0 ms", to: "6.2 ms", group: "front" },
  ],
  before: { p19: { level: 4, deviationDb: 1.2 }, p20: { level: 1, deviationDb: 27.385358618586395 } },
  after: { p19: { level: 4, deviationDb: 1.1 }, p20: { level: 1, deviationDb: 10.8 } },
  improvement: { p19Improved: false, p20Improved: true, p20DeltaDb: 16.6 },
  damage: { p19Damaged: false, p20Damaged: false, any: false },
});

const RELATIVE_DELAY = Object.freeze({
  statement: "Rear sub group +6.2 ms relative to the front group",
});

const HELD_SUGGESTION = Object.freeze({
  decision: "none",
  reason: "calibration-improvement-worth-considering",
  statement: "Suggested improvement: reduce the front subwoofer level by 2.5 dB.",
  suggestionNote: "Review before applying.",
  settings: [
    { key: "gain:sub-a", setting: "Gain trim", label: "Sub 1 (front)", from: "+0 dB", to: "−2.5 dB", group: "front" },
  ],
  before: { p19: { level: 4, deviationDb: 1.2 }, p20: { level: 1, deviationDb: 10.15 } },
  after: { p19: { level: 4, deviationDb: 1.2 }, p20: { level: 1, deviationDb: 8.86 } },
  improvement: { p19Improved: false, p20Improved: true, p20DeltaDb: 1.29 },
  damage: { p19Damaged: false, p20Damaged: false, any: false },
});

const REGRESSION_HOLD = Object.freeze({
  decision: "hold",
  reason: "primary-seat-regressed",
  statement:
    "The balanced acoustic-delay candidate regresses P20 at seat-r1-c1 by 1.5 dB. This is a trade-off, so it has not been applied — your approval is required.",
  settings: [
    { key: "gain:sub-a", setting: "Gain trim", label: "Sub 1 (front)", from: "+0 dB", to: "−2.5 dB", group: "front" },
  ],
  before: { p19: { level: 4, deviationDb: 1.2 }, p20: { level: 1, deviationDb: 10.8 } },
  after: { p19: { level: 4, deviationDb: 1.2 }, p20: { level: 1, deviationDb: 20.4 } },
  improvement: { p19Improved: false, p20Improved: false, p20DeltaDb: -9.6 },
  damage: { p19Damaged: false, p20Damaged: true, any: true },
});

const TRADE_OFF_REVIEW = Object.freeze({
  decision: "hold",
  reason: "trade-off-useful-but-under-the-three-times-rule",
  statement: "A calibration change was confirmed but carries a trade-off under the 3:1 rule.",
  tradeOff: { decision: "review_required", ratio: 17 },
  settings: [
    { key: "delay:sub-a", setting: "Delay", label: "Sub 1 (front)", from: "0 ms", to: "2 ms", group: "front" },
  ],
  before: { p19: { level: 4, deviationDb: 1.2 }, p20: { level: 1, deviationDb: 27.4 } },
  after: { p19: { level: 4, deviationDb: 2.1 }, p20: { level: 1, deviationDb: 11.0 } },
  improvement: { p19Improved: false, p20Improved: true, p20DeltaDb: 16.4 },
  damage: { p19Damaged: true, p20Damaged: false, any: true },
});

const SEATING_RECOMMENDATION = Object.freeze({
  recommendation: "Move the seating 300 mm away from the screen",
  recommendedRow: {
    lever: "seating",
    evaluated: true,
    effect: { p20VariationDb: 13.355385805925678, p20LevelAfter: 1, p19DeltaDb: -0.03 },
  },
  baseline: { p20VariationDb: 27.385358618586395, p20Level: 1 },
});

const BANNED_IN_MAIN = [
  "ADI applied safe calibration settings",
  "Best calibration result",
  "ADI Applied Bass Calibration",
  "Best result found",
  "Current result",
  "acoustic calculation",
  "proxy",
  "fingerprint",
  "candidate",
];

const headlineCopy = (headline) => [headline.adjustment, headline.benefit, headline.comparison].filter(Boolean);

describe("one status, from the decision — never from a wish", () => {
  it("states Applied only for settings that are really in the design", () => {
    const applied = resolveAdiPanelHeadline({
      calibrationKind: ADI_CALIBRATION_KIND.APPLIED,
      calibrationDecision: APPLIED_DELAY,
      relativeDelay: RELATIVE_DELAY,
    });
    expect(applied.statusLabel).toBe(ADI_PANEL_STATUS.APPLIED);

    // A held decision is never Applied, whatever it improved.
    const held = resolveAdiPanelHeadline({
      calibrationKind: ADI_CALIBRATION_KIND.HELD,
      calibrationDecision: HELD_SUGGESTION,
      calibrationSuggested: true,
    });
    expect(held.statusLabel).not.toBe(ADI_PANEL_STATUS.APPLIED);
  });

  it("states Improvement to consider for a useful but unapplied change", () => {
    const headline = resolveAdiPanelHeadline({
      calibrationKind: ADI_CALIBRATION_KIND.TESTED,
      calibrationDecision: HELD_SUGGESTION,
      calibrationSuggested: true,
    });
    expect(headline.statusLabel).toBe(ADI_PANEL_STATUS.CONSIDER);
    expect(headline.adjustment).toBe("Reduce the front subwoofer level by 2.5 dB");
  });

  it("states Rejected — regression for a change refused for a regression", () => {
    const headline = resolveAdiPanelHeadline({
      calibrationKind: ADI_CALIBRATION_KIND.HELD,
      calibrationDecision: REGRESSION_HOLD,
    });
    expect(headline.statusLabel).toBe(ADI_PANEL_STATUS.REJECTED);
    // The refusal is the rule that held the change — no figure and no candidate
    // id, and never the engine's own diagnostic sentence.
    expect(headline.benefit).toBe("Not applied because a primary seat would regress.");
    expect(headline.benefit).not.toBe(REGRESSION_HOLD.statement);
    expect(headline.comparison).toBe("P20 variation: ±10 dB → ±20 dB · L1");
  });

  it("names a trade-off instead of claiming a plain win", () => {
    const headline = resolveAdiPanelHeadline({
      calibrationDecision: TRADE_OFF_REVIEW,
      calibrationSuggested: true,
    });
    expect(headline.statusLabel).toBe(ADI_PANEL_STATUS.CONSIDER);
    expect(headline.benefit).toBe(ADI_PANEL_BENEFIT.TRADE_OFF);
  });

  it("leaves the engine's own state to the panel when no decision exists", () => {
    const headline = resolveAdiPanelHeadline({
      calibrationKind: ADI_CALIBRATION_KIND.TESTED,
      finding: "ADI tested calibration and design options. No useful improvement was found.",
    });
    expect(headline.statusLabel).toBeNull();
    expect(headline.adjustment).toBeNull();
    expect(headline.comparison).toBeNull();
    expect(headline.benefit).toBe(
      "ADI tested calibration and design options. No useful improvement was found.",
    );
  });

  it("offers nothing while a run is in progress or the result is stale", () => {
    const running = resolveAdiPanelHeadline({ isRunning: true, calibrationDecision: APPLIED_DELAY });
    expect(running).toMatchObject({ kind: "running", adjustment: null, comparison: null });
    const stale = resolveAdiPanelHeadline({ stale: true, calibrationDecision: APPLIED_DELAY });
    expect(stale).toMatchObject({ kind: "state", adjustment: null, comparison: null });
  });
});

describe("one comparison, from one evaluation", () => {
  it("keeps the displayed whole-dB convention and never restates the difference", () => {
    const headline = resolveAdiPanelHeadline({
      calibrationKind: ADI_CALIBRATION_KIND.APPLIED,
      calibrationDecision: APPLIED_DELAY,
      relativeDelay: RELATIVE_DELAY,
    });
    // 27.385 → ±27 dB and 10.8 → ±10 dB: floored, as every surface displays them.
    expect(headline.comparison).toBe("P20 variation: ±27 dB → ±10 dB · L1");
    expect(headline.comparison).not.toMatch(/improvement|gain/i);
  });

  it("states the evaluated result alone when the evaluation ran on another state", () => {
    const headline = resolveAdiPanelHeadline({
      ...SEATING_RECOMMENDATION,
      currentP20: { runBaselineDiffers: true, runBaselineDeviation: "±8 dB" },
    });
    expect(headline.comparison).toBe("P20 variation: ±13 dB · L1");
    expect(headline.comparison).not.toContain("→");
  });

  it("pairs baseline and result when they belong to the same state", () => {
    const headline = resolveAdiPanelHeadline({
      ...SEATING_RECOMMENDATION,
      currentP20: { runBaselineDiffers: false },
    });
    expect(headline.adjustment).toBe(SEATING_RECOMMENDATION.recommendation);
    expect(headline.comparison).toBe("P20 variation: ±27 dB → ±13 dB · L1");
    expect(headline.benefit).toBe(ADI_PANEL_BENEFIT.P20);
    expect(headline.statusLabel).toBe(ADI_PANEL_STATUS.CONSIDER);
  });

  it("states applied calibration already in the design from its own recorded groups", () => {
    const headline = resolveAdiPanelHeadline({
      calibrationKind: ADI_CALIBRATION_KIND.PERSISTED,
      appliedCalibration: { values: [{ id: "sub-a", delayMs: 6.2 }] },
      relativeDelay: RELATIVE_DELAY,
    });
    expect(headline.statusLabel).toBe(ADI_PANEL_STATUS.APPLIED);
    expect(headline.adjustment).toBe(RELATIVE_DELAY.statement);
  });

  it("formats a single available value without claiming a pair", () => {
    expect(p20VariationText(null, { deviationDb: 8.4, level: 1 })).toBe("P20 variation: ±8 dB · L1");
    expect(p20VariationText({ deviationDb: 8.4, level: 1 }, null)).toBe("P20 variation: ±8 dB · L1");
    expect(p20VariationText(null, null)).toBeNull();
  });
});

describe("the copy removed from the main view reaches no headline", () => {
  const headlines = [
    resolveAdiPanelHeadline({
      calibrationKind: ADI_CALIBRATION_KIND.APPLIED,
      calibrationDecision: APPLIED_DELAY,
      relativeDelay: RELATIVE_DELAY,
    }),
    resolveAdiPanelHeadline({ calibrationDecision: HELD_SUGGESTION, calibrationSuggested: true }),
    resolveAdiPanelHeadline({ calibrationDecision: REGRESSION_HOLD }),
    resolveAdiPanelHeadline({ calibrationDecision: TRADE_OFF_REVIEW, calibrationSuggested: true }),
    resolveAdiPanelHeadline({ ...SEATING_RECOMMENDATION, currentP20: { runBaselineDiffers: false } }),
  ];

  it("carries no removed label and no debug vocabulary", () => {
    headlines.forEach((headline) => {
      headlineCopy(headline).forEach((line) => {
        BANNED_IN_MAIN.forEach((banned) => {
          expect(line.toLowerCase()).not.toContain(banned.toLowerCase());
        });
      });
    });
  });

  it("states at most one adjustment, one benefit and one comparison", () => {
    headlines.forEach((headline) => {
      expect(headlineCopy(headline).length).toBeLessThanOrEqual(3);
    });
  });
});

describe("the panel renders the decision first and the evidence in the disclosure", () => {
  const journey = read(JOURNEY);
  const summary = read(SUMMARY);
  const detailsAt = journey.indexOf('data-adi-engineer-details="true"');
  const mainPanel = journey.slice(0, detailsAt);

  it("keeps one status: the decision's own, or the engine state", () => {
    expect(mainPanel).toContain("{headline.statusLabel || journey.statusLabel}");
    // No second APPLIED badge beside it.
    expect(mainPanel).not.toContain(">Applied<");
  });

  it("renders the headline on the main panel", () => {
    expect(mainPanel).toContain("<AdiPanelSummary");
    expect(mainPanel).toContain("adjustment={headline.adjustment}");
    expect(mainPanel).toContain("benefit={headline.benefit}");
    expect(mainPanel).toContain("comparison={headline.comparison}");
    // The finding sentence, the current/best pair and the calculation count are
    // no longer props of the main panel.
    expect(mainPanel).not.toContain("finding={panelFinding}");
    expect(mainPanel).not.toContain("currentP20={summary.currentP20}");
    expect(mainPanel).not.toContain("recommendedP20={summary.recommendedP20}");
    expect(summary).not.toContain("Best result found");
    expect(summary).not.toContain("Current result");
  });

  it("moves every evidence block inside the collapsed disclosure", () => {
    expect(detailsAt).toBeGreaterThan(-1);
    [
      "<AdiCalibrationSection",
      "<AdiTestedSection",
      "<AdiDesignRecommendationSection",
      "<AdiCalibrationEvidenceBlock",
      "<AdiTestedOptionsTable",
      "<AdiAbsoluteGroupDelays",
      "<OptimiserCalculationEstimateLine",
    ].forEach((block) => {
      expect(mainPanel).not.toContain(block);
      expect(journey.indexOf(block, detailsAt)).toBeGreaterThan(detailsAt);
    });
  });

  it("keeps the published, baseline and evaluated P20 values named in the disclosure", () => {
    expect(journey.indexOf("Current design (published result):", detailsAt)).toBeGreaterThan(detailsAt);
    expect(journey.indexOf("Evaluated result with the recommended change:", detailsAt)).toBeGreaterThan(detailsAt);
    expect(journey.indexOf("Evaluation baseline:", detailsAt)).toBeGreaterThan(detailsAt);
  });

  it("draws each control once, on the main panel", () => {
    const calls = (text, needle) => text.split(needle).length - 1;
    expect(calls(mainPanel, "<AdiDesignerActionBar")).toBe(1);
    expect(calls(journey, "<AdiDesignerActionBar")).toBe(1);
    expect(calls(mainPanel, "<ReoptimiseCalibrationAction")).toBe(1);
    expect(calls(journey, "<ReoptimiseCalibrationAction")).toBe(1);
    // The placement panel is drawn twice by design: controls on the main panel,
    // evidence in the details. It never draws both halves at once.
    expect(journey).toContain('variant="actions"');
    expect(journey).toContain('variant="evidence"');
  });

  it("states the progress indicator only while a run is in progress", () => {
    expect(journey).toContain("{isRunning && (");
    expect(journey).toContain('data-adi-optimiser-button="running"');
    expect(journey).toContain("{showAction && !panelShowsRerun && (");
  });
});

describe("the headline authority decides nothing about the engineering", () => {
  const source = read("components/room/bass/optimiserPlan/adiPanelHeadline.js");

  it("imports no engine, no threshold and no grading module", () => {
    expect(source).not.toMatch(/improveBassV2Engine|bassAnalysis|p20DisplayAuthority|bassGradingAuthority/);
    expect(source).not.toMatch(/Math\.floor\(|Math\.round\(/);
  });

  it("states no acceptance rule of its own", () => {
    expect(source).not.toMatch(/isMaterialImprovement|hasPrimarySeatRegression|assessCalibrationDamage/);
  });
});