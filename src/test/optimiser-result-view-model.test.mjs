// optimiser-result-view-model.test.mjs
// ---------------------------------------------------------------------------
// FOCUSED ACCEPTANCE — ONE RUN, ONE DESCRIPTION.
//
// The Bass Optimiser card states ONE result. This suite pins the six things a
// designer must never be able to misread, using a held trade-off as its worked
// case (the run found a change, the change costs the primary seat 1.2 dB, and
// the run recorded HOLD):
//
//   1. A HELD result is never presented as applied.
//   2. The seat the change costs is stated as the run RECORDED it — 1.2 dB,
//      never rounded to a whole decibel.
//   3. CURRENT and PROPOSED are two labelled sides. The candidate value can
//      never be read as the project's current result, and the current result is
//      the PUBLISHED measurement, not the run's own baseline.
//   4. A capability figure carries its own unit: P14 reads "115 dBC", never a
//      bare "115 dB".
//   5. A placement the run tested but did not recommend is never named as a
//      recommendation — it is the "best tested placement candidate".
//   6. A value that is not a credible frequency reads "Not identified"; 0 Hz can
//      never be printed.
//
// Nothing here changes an optimiser rule. Every fixture is an authority already
// resolved by the card, and every assertion is about presentation.
// ---------------------------------------------------------------------------

import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  OPTIMISER_APPLIED_STATE,
  OPTIMISER_DECISION_TYPE,
  OPTIMISER_RESULT_SIDE,
  OPTIMISER_TESTED_PLACEMENT_LABEL,
  buildOptimiserResultViewModel,
} from "../components/room/bass/optimiserPlan/optimiserResultViewModel.js";
import { PLACEMENT_KIND } from "../components/room/bass/optimiserPlan/placementRecommendationAuthority.js";
import { CALIBRATION_APPLY_DECISION } from "../components/room/bass/optimiseWorkflow/adiCalibrationAutoApplyAuthority.js";

// Source is read from the project root, as the other suites do.
const read = (relative) => readFileSync(resolve(process.cwd(), relative), "utf8");

const JOURNEY = "src/components/room/bass/optimiserPlan/AdiOptimisationJourney.jsx";
const SUMMARY = "src/components/room/bass/optimiserPlan/adiDesignerSummary.js";
const SECTIONS = "src/components/room/bass/optimiserPlan/AdiJourneyEngineerDetailsSections.jsx";
const PLACEMENT_PANEL = "src/components/room/bass/optimiserPlan/PlacementRecommendationPanel.jsx";

// ── THE PUBLISHED RESULT ──
// The canonical current authority the card, the tooltip and the reports all
// read. P14 capability 115 dBC, P20 ±15 dB with its limiting frequency at 95 Hz.
const publishedAuthority = {
  contract: {
    job: { resultFingerprint: "pub-fp-1" },
    productAnalysis: {
      parameters: {
        p14: { parameter: "P14", value: 115, level: 3, unit: "dBC", status: "measured" },
        p18: { parameter: "P18", value: 31, level: 2 },
        p19: { parameter: "P19", value: -9, level: 1 },
        p20: {
          variationDbRaw: -15,
          level: 2,
          worstSeatId: "primary",
          worstFrequencyHz: 95,
        },
      },
    },
  },
};

// ── THE HELD TRADE-OFF ──
// The candidate improves P20 ±15 → ±12 dB overall and costs the primary seat
// 1.2 dB. The run recorded HOLD, so the change is NOT in the design.
const heldDecision = {
  decision: CALIBRATION_APPLY_DECISION.HOLD,
  statement: "Primary seat worsens by 1.2 dB. Held for your decision.",
  lever: "placement",
  adjustment: "Rear subwoofers 0.4 m further from the side wall",
  regression: {
    seatId: "primary",
    parameter: "P20",
    rawDeltaDb: 1.2,
    currentLevel: 2,
    candidateLevel: 2,
  },
  after: {
    p14: { value: 126, level: 3, unit: "dBC" },
    p18: { value: 27, level: 3 },
    p19: { deviationDb: -8, level: 2 },
    p20: { deviationDb: -12, level: 2, worstSeatId: "primary" },
  },
};

const heldPlanView = {
  status: "current",
  recordKind: "plan",
  projectId: "proj-1",
  versionId: "ver-1",
  run: { runId: "run-7" },
  candidateId: "cand-placement-3",
  decisionApplied: false,
  calibrationDecision: heldDecision,
  baseline: { p20VariationDb: -15, p20Level: 2, worstFrequencyHz: 95 },
  levers: [{
    key: "placement",
    evaluated: true,
    canApply: true,
    effect: { p20VariationDb: -12, p20Level: 2, worstSeatId: "primary" },
    changes: [{ label: "Rear subwoofer distance from side wall", from: 0.5, to: 0.9 }],
  }],
};

// The placement the run TESTED. It carries a real, measured move — which is
// exactly why it must not be able to read as a recommendation.
const testedPlacement = {
  kind: PLACEMENT_KIND.PREVIOUS,
  status: "Evaluated",
  statusText: "Evaluated for this design version — not in the design.",
  notice: "The move did not improve the design as it stands.",
  move: { movementLabel: "Rear subwoofers 0.4 m further from the side wall" },
  summary: "Expected P20 ±12 dB · L2",
  canApply: true,
  canUndo: false,
};

const heldTradeOffState = {
  isTradeOff: true,
  kept: false,
  seat: {
    seatId: "primary",
    delta: 1.2,
    parameter: "P20",
    before: "±15 dB · L2",
    after: "±12 dB · L2",
  },
};

const buildHeld = () => buildOptimiserResultViewModel({
  planView: heldPlanView,
  identity: { projectId: "proj-1", versionId: "ver-1", runId: "run-7" },
  completedBassAuthority: publishedAuthority,
  placement: testedPlacement,
  tradeOffState: heldTradeOffState,
});

// ── 1. A HELD RESULT IS HELD ────────────────────────────────────────────────
describe("a held trade-off is described as held", () => {
  const model = buildHeld();

  it("is the one decision, not an engine state", () => {
    assert.equal(model.decisionType, OPTIMISER_DECISION_TYPE.TRADE_OFF);
    assert.equal(model.hasTerminalRun, true);
    assert.equal(model.stale, false);
  });

  it("never appears as applied — the persisted decision is authoritative", () => {
    assert.equal(model.appliedState, OPTIMISER_APPLIED_STATE.HELD);
    assert.equal(model.appliedState, "held");
    assert.match(model.appliedStateLabel, /held/i);
    assert.notEqual(model.appliedState, OPTIMISER_APPLIED_STATE.APPLIED);
  });

  it("states the run's own recorded reason rather than composing a new one", () => {
    assert.equal(model.decisionReason, heldDecision.statement);
  });

  it("names the seat the change costs, in the app's own seat language", () => {
    assert.ok(model.affectedSeat);
    assert.equal(model.affectedSeat.seatId, "primary");
    assert.equal(model.affectedSeat.scope, "primary");
    assert.ok(model.affectedSeat.label);
  });
});

// ── 2. THE RECORDED REGRESSION IS NOT ROUNDED AWAY ──────────────────────────
describe("the retained seat regression is stated as recorded", () => {
  const model = buildHeld();

  it("keeps the 1.2 dB the run recorded", () => {
    assert.equal(model.affectedSeatRegression.amountDb, 1.2);
    assert.equal(model.affectedSeatRegression.amountText, "1.2 dB");
    assert.equal(model.affectedSeatRegression.direction, "worsens");
    assert.equal(model.affectedSeatRegression.parameter, "P20");
  });

  it("states the same recorded amount in the comparison block", () => {
    assert.equal(model.comparison.seatRegressionText, "1.2 dB");
  });

  it("is never converted into the whole-decibel display rule", () => {
    assert.notEqual(model.affectedSeatRegression.amountText, "1 dB");
  });
});

// ── 3. CURRENT AND PROPOSED ARE TWO LABELLED SIDES ──────────────────────────
describe("current and proposed are never mixed", () => {
  const model = buildHeld();

  it("labels each side", () => {
    assert.equal(model.current.side, OPTIMISER_RESULT_SIDE.CURRENT);
    assert.equal(model.proposed.side, OPTIMISER_RESULT_SIDE.PROPOSED);
    assert.notEqual(model.current.side, model.proposed.side);
  });

  it("reads CURRENT from the published result, not from the run's baseline", () => {
    assert.equal(model.current.source, "published");
    assert.equal(model.current.p20.text, "±15 dB · L2");
    assert.equal(model.current.worstSeatId, "primary");
  });

  it("states the candidate result only as the proposed side", () => {
    assert.equal(model.proposed.source, "decision-candidate");
    assert.equal(model.proposed.p20.text, "±12 dB · L2");
    assert.notEqual(model.proposed.p20.text, model.current.p20.text);
  });

  it("never lets a candidate value stand in for the current result", () => {
    assert.equal(model.current.p20.text.includes("12"), false);
  });

  it("compares the DISPLAYED endpoints, so the improvement adds up", () => {
    assert.equal(model.comparison.p20PairText, "±15 dB → ±12 dB");
    assert.equal(model.comparison.p20ImprovementText, "3 dB better");
    assert.equal(model.comparison.p20DeltaText, "3 dB better");
  });
});

// ── 4. A CAPABILITY FIGURE CARRIES ITS OWN UNIT ─────────────────────────────
describe("P14 capability is stated in its own unit", () => {
  const model = buildHeld();

  it("reads the published capability as dBC, never a bare dB", () => {
    assert.equal(model.current.p14.text, "115 dBC · L3");
    assert.equal(model.current.p14.unit, "dBC");
  });

  it("states the candidate capability beside it, labelled Proposed", () => {
    assert.equal(model.proposed.p14.text, "126 dBC · L3");
    assert.notEqual(model.current.p14.text, model.proposed.p14.text);
  });

  it("invents no unit when the published result carries none", () => {
    const authority = {
      contract: {
        productAnalysis: {
          parameters: {
            p14: { parameter: "P14", value: 118, level: 3 },
            p20: { variationDbRaw: -12, level: 2, worstSeatId: "primary" },
          },
        },
      },
    };
    const bare = buildOptimiserResultViewModel({
      planView: heldPlanView,
      completedBassAuthority: authority,
    });
    assert.equal(bare.current.p14.text, "118 dB · L3");
    assert.equal(bare.current.p14.text.includes("dBC"), false);
  });
});

// ── 5. A TESTED PLACEMENT IS NOT A RECOMMENDATION ───────────────────────────
describe("physical recommendations come only from the result view model", () => {
  const model = buildHeld();

  it("does not present an evaluated-but-not-recommended move as a recommendation", () => {
    assert.equal(model.physicalRecommendation.isRecommendation, false);
    assert.equal(model.physicalRecommendation.recommended, false);
    assert.equal(model.physicalRecommendation.applied, false);
    assert.equal(model.physicalRecommendation.canApply, false);
  });

  it("names it as the best tested placement candidate instead", () => {
    assert.equal(model.physicalRecommendation.testedNotRecommended, true);
    assert.equal(model.physicalRecommendation.testedCandidate.label, OPTIMISER_TESTED_PLACEMENT_LABEL);
    assert.equal(model.physicalRecommendation.testedCandidate.recommended, false);
  });

  it("states no recommendable move and no expected benefit for it", () => {
    assert.equal(model.physicalRecommendation.movementLabel, null);
    assert.equal(model.physicalRecommendation.expectedEffect, null);
  });

  it("still presents a genuinely recommended move as the recommendation", () => {
    const recommended = buildOptimiserResultViewModel({
      planView: heldPlanView,
      completedBassAuthority: publishedAuthority,
      placement: { ...testedPlacement, kind: PLACEMENT_KIND.RECOMMENDED },
    });
    assert.equal(recommended.physicalRecommendation.isRecommendation, true);
    assert.equal(recommended.physicalRecommendation.testedNotRecommended, false);
    assert.equal(recommended.physicalRecommendation.testedCandidate, null);
    assert.ok(recommended.physicalRecommendation.movementLabel);
    assert.equal(recommended.decisionType, OPTIMISER_DECISION_TYPE.PHYSICAL_RECOMMENDATION);
  });
});

// ── 6. THE LIMITING FREQUENCY IS ONE RESOLVED VALUE ─────────────────────────
describe("the limiting frequency is resolved once and never printed as 0 Hz", () => {
  it("states the published frequency", () => {
    const model = buildHeld();
    assert.equal(model.limitingFrequency.identified, true);
    assert.equal(model.limitingFrequency.hz, 95);
    assert.equal(model.limitingFrequency.text, "95 Hz");
  });

  it("states Not identified for a value that is not a frequency", () => {
    const authority = {
      contract: {
        productAnalysis: {
          parameters: {
            p20: { variationDbRaw: -12, level: 2, worstSeatId: "primary", worstFrequencyHz: 0 },
          },
        },
      },
    };
    const model = buildOptimiserResultViewModel({
      planView: { ...heldPlanView, baseline: null },
      completedBassAuthority: authority,
    });
    assert.equal(model.limitingFrequency.hz, null);
    assert.equal(model.limitingFrequency.identified, false);
    assert.equal(model.limitingFrequency.text, "Not identified");
    assert.equal(model.limitingFrequency.text.includes("0"), false);
  });
});

// ── AN APPLIED RESULT IS APPLIED, FROM THE SAME AUTHORITY ───────────────────
describe("an applied result is applied", () => {
  it("reads APPLIED from the persisted decision and the persisted application", () => {
    const model = buildOptimiserResultViewModel({
      planView: {
        ...heldPlanView,
        decisionApplied: true,
        calibrationDecision: { ...heldDecision, decision: CALIBRATION_APPLY_DECISION.APPLIED },
      },
      completedBassAuthority: publishedAuthority,
    });
    assert.equal(model.appliedState, OPTIMISER_APPLIED_STATE.APPLIED);
    assert.equal(model.appliedStateLabel, "Applied");
  });

  it("never calls an eligible-but-unapplied decision applied", () => {
    const model = buildOptimiserResultViewModel({
      planView: { ...heldPlanView, decisionApplied: false },
      completedBassAuthority: publishedAuthority,
    });
    assert.equal(model.appliedState, OPTIMISER_APPLIED_STATE.HELD);
    assert.notEqual(model.appliedStateLabel, "Applied");
  });
});

// ── A STALE RESULT IS NEVER A CURRENT RESULT ────────────────────────────────
describe("a saved result that no longer belongs to the design says so", () => {
  const model = buildOptimiserResultViewModel({
    planView: { ...heldPlanView, status: "stale" },
    completedBassAuthority: publishedAuthority,
    placement: testedPlacement,
  });

  it("asks for a re-test rather than reporting a result", () => {
    assert.equal(model.decisionType, OPTIMISER_DECISION_TYPE.RETEST_NEEDED);
    assert.equal(model.hasTerminalRun, false);
    assert.equal(model.stale, true);
  });

  it("never offers the stale candidate as an applyable change", () => {
    assert.equal(model.appliedState, OPTIMISER_APPLIED_STATE.NOT_APPLICABLE);
    assert.equal(model.physicalRecommendation.isRecommendation, false);
  });

  it("never names a stale candidate a trade-off", () => {
    assert.notEqual(model.decisionType, OPTIMISER_DECISION_TYPE.TRADE_OFF);
  });
});

// ── THE CARD AND ITS EVIDENCE READ THIS ONE MODEL ───────────────────────────
describe("every surface reads the one result view model", () => {
  it("the card builds it from the published result, the run's identity and the trade-off state", () => {
    const source = read(JOURNEY);
    assert.ok(source.includes("buildAdiDesignerSummary({"));
    assert.ok(source.includes("completedBassAuthority,"));
    assert.ok(source.includes("tradeOffState: presentation?.tradeOff || null,"));
    assert.ok(source.includes("const resultModel = summary.resultViewModel || null;"));
  });

  it("the card takes the limiting frequency from the model rather than re-deriving it", () => {
    const source = read(JOURNEY);
    assert.ok(source.includes("resultModel?.limitingFrequency?.identified"));
  });

  it("the summary builds the model once and gates Apply on its applied state", () => {
    const source = read(SUMMARY);
    assert.ok(source.includes("buildOptimiserResultViewModel("));
    assert.ok(source.includes("applyOutcome.allowed"));
    assert.ok(source.includes("OPTIMISER_APPLIED_STATE.HELD"));
    // Apply is never offered merely because the lever could be applied.
    assert.equal(source.includes("canApply: apply.allowed"), false);
  });

  it("the summary takes the limiting frequency from the model, not a second derivation", () => {
    const source = read(SUMMARY);
    assert.ok(source.includes("const limitingFrequency = resultViewModel.limitingFrequency;"));
  });

  it("Engineer details states the labelled current and proposed pair from the model", () => {
    const source = read(SECTIONS);
    assert.ok(source.includes("resultModel = null,"));
    assert.ok(source.includes("currentSide?.p14?.text"));
    assert.ok(source.includes("proposedSide?.p14?.text"));
    assert.ok(source.includes('data-adi-current-vs-proposed="true"'));
    assert.ok(source.includes('data-adi-seat-regression="true"'));
  });

  it("Engineer details only names a placement as tested when the model says so", () => {
    const source = read(SECTIONS);
    assert.ok(source.includes("resultModel?.physicalRecommendation?.testedNotRecommended"));
    assert.ok(source.includes("OPTIMISER_TESTED_PLACEMENT_LABEL"));
  });

  it("the placement evidence panel can state that a move is tested, not recommended", () => {
    const source = read(PLACEMENT_PANEL);
    assert.ok(source.includes("testedNotRecommendedLabel = null,"));
    assert.ok(source.includes('data-placement-tested-not-recommended="true"'));
  });
});