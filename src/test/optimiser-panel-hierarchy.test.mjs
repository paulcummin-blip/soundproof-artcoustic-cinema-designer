// optimiser-panel-hierarchy.test.mjs
// ---------------------------------------------------------------------------
// THE BASS OPTIMISER PANEL'S INFORMATION HIERARCHY, AND THE DISPLAY DELTA.
//
// What is proved here:
//
//   DISPLAY DELTA   a before → after pair and the change stated beside it are
//                   derived from the SAME displayed (whole dB) endpoints, so
//                   ±15 dB → ±12 dB reads "3 dB better" — never the 2 dB the raw
//                   float leaves behind once those endpoints are floored.
//   REGRESSION      the run's own retained per-seat regression amount ("1.2 dB")
//                   is preserved exactly, and is not converted to the
//                   whole-number display rule.
//   OTHER OPTIONS   at most three, only genuinely useful ones, and never the
//                   option that is already the panel's current decision.
//   LOW-FREQUENCY   P19 / the P20 pair / the limiting region, in displayed whole
//                   numbers only.
//   THREE LEVELS    result → technical details → developer diagnostics, with the
//                   diagnostics drawn ONLY under the internal debug gate; the
//                   workload, fingerprints, ids and search totals are never in
//                   the normal experience.
//   DESIGN BOX      no "no physical design change was applied" box is drawn.
//
// No optimiser maths, no P19/P20 definition, no ranking, no materiality, no
// primary-seat protection and no apply logic is touched by any assertion here.
// ---------------------------------------------------------------------------

import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  displayDeltaDb,
  displayDeltaPhrase,
  displayDeltaText,
  displayImprovementText,
  DISPLAY_NO_MEANINGFUL_CHANGE,
} from "../components/room/bass/optimiserPlan/optimiserDisplayDelta.js";
import { resolveTradeOffState } from "../components/room/bass/optimiserPlan/optimiserTradeOffState.js";
import {
  OTHER_OPTIONS_MAX,
  buildOptimiserOtherOptions,
} from "../components/room/bass/optimiserPlan/optimiserOtherOptions.js";
import { buildLowFrequencyResult } from "../components/room/bass/optimiserPlan/optimiserPanelHierarchy.js";
import { ADI_ENGINEER_DETAILS_TITLE } from "../components/room/bass/optimiserPlan/adiDesignerSummary.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(HERE, "..", rel), "utf8");

const OPT = "components/room/bass/optimiserPlan";

/** The Barton-shaped run: ±15 dB → ±12 dB overall, one primary seat 1.2 dB worse. */
const BARTON_DECISION = {
  candidateId: "calibration:rear-delay",
  decision: "hold",
  reason: "primary-seat-regressed",
  offsetStatement: "Rear subwoofer delay +5.4 ms",
  statement: "Regresses P20 at seat-r1-c2 by 1.2 dB.",
  improvement: { p20Improved: true, p19Improved: false, p20DeltaDb: 2.4, p19DeltaDb: 0 },
  before: {
    p20: { deviationDb: 15.4, level: 1 },
    p19: { deviationDb: 3.4, level: 4 },
    perSeatP20: [{ seatId: "seat-r1-c2", isPrimary: true, variationDbRaw: 9.4, level: 1 }],
  },
  after: {
    p20: { deviationDb: 12.2, level: 1 },
    p19: { deviationDb: 3.4, level: 4 },
    perSeatP20: [{ seatId: "seat-r1-c2", isPrimary: true, variationDbRaw: 10.6, level: 1 }],
  },
  regression: {
    seatId: "seat-r1-c2",
    parameter: "P20",
    rawDeltaDb: 1.2,
    currentLevel: 1,
    candidateLevel: 1,
  },
};

describe("DISPLAY DELTA — the displayed delta equals A − B", () => {
  it("reads 15 → 12 as 3 dB better, never the 2 dB behind the rounded pair", () => {
    assert.equal(displayDeltaDb(15.4, 12.2), 3);
    assert.equal(displayDeltaPhrase(15.4, 12.2), "3 dB better");
    assert.equal(displayImprovementText(15.4, 12.2), "3 dB better");
    assert.equal(displayDeltaText(15.4, 12.2), "3 dB");
  });

  it("states no meaningful change for equal displayed endpoints", () => {
    assert.equal(displayDeltaPhrase(9.4, 10.6), "1 dB worse");
    assert.equal(displayDeltaPhrase(15.4, 15.4), DISPLAY_NO_MEANINGFUL_CHANGE);
    assert.equal(displayImprovementText(15.4, 15.4), null);
  });

  it("claims no improvement when the displayed pair worsens", () => {
    assert.equal(displayImprovementText(12.2, 15.4), null);
    assert.equal(displayDeltaPhrase(12.2, 15.4), "3 dB worse");
  });
});

describe("THE TRADE-OFF CARD — one decision, displayed deltas, retained regression", () => {
  const state = resolveTradeOffState({ decision: BARTON_DECISION });

  it("resolves the trade-off the run recorded", () => {
    assert.equal(state?.isTradeOff, true);
    assert.equal(state.adjustment, "Rear subwoofer delay +5.4 ms");
    assert.equal(state.seat.label, "Row 1 - Seat 2");
  });

  it("states the gain as the displayed delta of the pair beside it", () => {
    const p20Row = state.overall.find((row) => row.key === "p20");
    assert.equal(p20Row.pair, "±15 dB → ±12 dB");
    assert.equal(p20Row.delta, "3 dB better");
    assert.equal(state.gain.delta, "3 dB better");
    assert.equal(state.gain.pair, "±15 dB → ±12 dB");
  });

  it("keeps the run's own retained regression amount exactly as recorded", () => {
    assert.equal(state.amountText, "1.2 dB");
    assert.equal(state.giveUp.amount, "Worsens by 1.2 dB");
    const seatRow = state.rows.find((row) => row.key === "seat:seat-r1-c2");
    assert.equal(seatRow.delta, "1.2 dB");
  });
});

describe("OTHER OPTIONS — few, useful, and never the current decision", () => {
  const summary = {
    recommendedLever: "delay",
    seatingRecommendation: {
      movementLabel: "Move seating block 100 mm away from the screen",
      p20After: "±12 dB",
      p20ImprovementDb: 3,
    },
    absorption: {
      key: "low_frequency_absorption",
      reason: "Persistent modal issue around 95 Hz",
      location: "Front wall / front corners are the first places to review for bass trapping.",
    },
  };
  const planView = { baseline: { p20VariationDb: 15.4 }, levers: [] };

  it("lists the seating option and the treatment advice, and never more than three", () => {
    const options = buildOptimiserOtherOptions({ planView, summary });
    assert.deepEqual(options.map((option) => option.key), ["seating", "treatment"]);
    assert.ok(options.length <= OTHER_OPTIONS_MAX);
    assert.equal(options[0].support, "Predicted to improve seat-to-seat consistency.");
    assert.equal(
      options[1].support,
      "If further improvement is required, reviewing low-frequency treatment may help.",
    );
  });

  it("never repeats the option that is already the panel's decision", () => {
    const options = buildOptimiserOtherOptions({
      planView,
      summary: { ...summary, recommendedLever: "seating" },
    });
    assert.deepEqual(options.map((option) => option.key), ["treatment"]);
  });

  it("shows no option while a run is in progress", () => {
    assert.deepEqual(buildOptimiserOtherOptions({ planView, summary, running: true }), []);
  });
});

describe("LOW-FREQUENCY RESULT — displayed whole numbers only", () => {
  it("states P19, the P20 pair and the limiting region", () => {
    const result = buildLowFrequencyResult({
      calibrationDecision: BARTON_DECISION,
      p20Headline: { variationDb: 15.4, worstFrequencyHz: 94.7 },
      recommendedRow: { effect: { p20VariationDb: 12.2 } },
    });
    assert.equal(result.p19, "Unchanged · L4");
    assert.equal(result.p20Before, "±15 dB");
    assert.equal(result.p20After, "±12 dB");
    assert.equal(result.limiting, "95 Hz");
  });
});

describe("THREE LEVELS — result, technical details, developer diagnostics", () => {
  it("renames the second level Technical details", () => {
    assert.equal(ADI_ENGINEER_DETAILS_TITLE, "Technical details");
  });

  it("draws developer diagnostics only under the internal debug gate", () => {
    const panel = read(`${OPT}/AdiEngineerDetailsPanel.jsx`);
    assert.ok(panel.includes("showDiagnostics && children"), "diagnostics are gated");
    assert.ok(panel.includes('data-adi-developer-diagnostics="true"'));
    const gate = read(`${OPT}/useOptimiserDeveloperDiagnostics.js`);
    assert.ok(gate.includes("useEngineeringMode"), "engineering mode is required");
    assert.ok(gate.includes("isMasterAdmin"), "a Sound Proof admin is required");
    assert.ok(
      /engineeringMode === true && isMasterAdmin\(user\) === true/.test(gate),
      "both must hold",
    );
  });

  it("states WHAT ADI CHECKED, the low-frequency result and the groups in level 2", () => {
    const panel = read(`${OPT}/AdiEngineerDetailsPanel.jsx`);
    assert.ok(panel.includes("What ADI checked"));
    assert.ok(panel.includes('data-adi-low-frequency-result="true"'));
    assert.ok(panel.includes('data-adi-test-summary="true"'));
    assert.ok(!/Test summary/.test(panel), "the old duplicated test summary is gone");
    assert.ok(!/Best calibration result/.test(panel), "no duplicated calibration block");
    assert.ok(!/Best design recommendation/.test(panel), "no duplicated design block");
  });

  it("keeps fingerprints, ids, absolute delays and the workload in the developer level", () => {
    const sections = read(`${OPT}/AdiJourneyEngineerDetailsSections.jsx`);
    assert.ok(sections.includes("AdiEngineerEvidenceBlock"), "fingerprints are developer-level");
    assert.ok(sections.includes("AdiAbsoluteGroupDelays"), "grouped-delay arrays are developer-level");
    assert.ok(sections.includes("OptimiserRunEvidenceBlock"), "run evidence is developer-level");
    assert.ok(sections.includes("AdiJourneyRunWorkloadBlock"), "the run workload is developer-level");
    assert.ok(
      !sections.includes("AdiSubwooferGroupingBlock"),
      "the grouping block belongs to level 2, not the developer level",
    );

    const journey = read(`${OPT}/AdiOptimisationJourney.jsx`);
    assert.ok(
      !journey.includes("<AdiJourneyRunWorkloadBlock"),
      "the workload is never rendered by the card itself",
    );
    assert.ok(
      journey.includes("workload: runWorkload"),
      "the workload travels with the developer diagnostics view",
    );
  });

  it("keeps the developer sections inside the gated disclosure of the journey", () => {
    const journey = read(`${OPT}/AdiOptimisationJourney.jsx`);
    const detailsAt = journey.indexOf('data-adi-engineer-details="true"');
    const sectionsAt = journey.indexOf("<AdiJourneyEngineerDetailsSections");
    assert.ok(detailsAt > -1 && sectionsAt > detailsAt, "level 3 sits inside level 2");
    assert.ok(
      journey.includes("showDiagnostics={showDeveloperDiagnostics}"),
      "the journey hands the gate to the panel",
    );
  });

  it("renders OTHER OPTIONS on the card, and never an Apply per option", () => {
    const journey = read(`${OPT}/AdiOptimisationJourney.jsx`);
    assert.ok(journey.includes("<AdiOtherOptions options={otherOptions} />"));
    const options = read(`${OPT}/AdiOtherOptions.jsx`);
    assert.ok(options.includes('data-adi-other-option-review'), "each option is reviewed");
    assert.ok(!/onApply/.test(options), "an option carries no Apply of its own");
  });

  it("never draws the empty design-change box", () => {
    const section = read(`${OPT}/AdiDesignRecommendationSection.jsx`);
    assert.ok(section.includes("if (!hasDesignContent) return null;"));
    assert.ok(!section.includes("ADI_NO_DESIGN_CHANGE_APPLIED"));
  });
});