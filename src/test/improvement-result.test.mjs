// improvement-result.test.mjs
// ---------------------------------------------------------------------------
// FOCUSED TESTS — a confirmed improvement is a COMPLETE, ACTIONABLE result.
//
// One completed run that found a clean, confirmed improvement must state the
// exact adjustment, what it improves (P19 and P20), whether any protected seat
// gets worse, whether it was applied, and the ONE next action — with no run and
// no re-test control left behind. A trade-off and a physical move keep their own
// workflows and are never restated here as a clean improvement.
//
// Nothing here changes an optimiser rule: the fixtures are authorities already
// resolved by the card, and the assertions are presentation.
// ---------------------------------------------------------------------------

import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
  IMPROVEMENT_CASE,
  IMPROVEMENT_COPY,
  resolveImprovementResult,
} from "../components/room/bass/optimiserPlan/improvementResultAuthority.js";
import { CALIBRATION_APPLY_DECISION } from "../components/room/bass/optimiseWorkflow/adiCalibrationAutoApplyAuthority.js";

// Source paths are read from the project root, as the other suites do.
const read = (relative) => readFileSync(resolve(process.cwd(), relative), "utf8");

const JOURNEY = "src/components/room/bass/optimiserPlan/AdiOptimisationJourney.jsx";

const planView = {
  status: "current",
  candidateId: "cand-delay-7",
  levers: [{
    key: "delay",
    evaluated: true,
    canApply: true,
    effect: { p20: true },
    changes: [{ label: "Rear group delay", from: 0, to: 5.4 }],
  }],
};

const headline = {
  kind: "improvement",
  adjustment: "Rear sub group delay +5.4 ms relative to front group",
  benefit: "Improves consistency across the primary seats.",
  comparison: "\u00b115 dB \u00b7 L1 \u2192 \u00b112 dB \u00b7 L2",
};

const decision = (kind, statement) => ({
  decision: kind,
  statement,
  candidateId: "cand-delay-7",
  before: { p19: { level: "L4" }, p20: { deviationDb: 15, level: "L1" } },
  after: { p19: { level: "L4" }, p20: { deviationDb: 12, level: "L2" } },
});

describe("CASE A — a safe calibration ADI already applied", () => {
  const result = resolveImprovementResult({
    planView,
    headline,
    summary: { recommendedLever: "delay" },
    calibrationDecision: decision(CALIBRATION_APPLY_DECISION.APPLIED, "Applied automatically."),
    calibrationKind: "applied",
    applied: true,
  });

  it("is badged and worded as APPLIED, never as a fresh find", () => {
    assert.equal(result.caseKey, IMPROVEMENT_CASE.APPLIED);
    assert.equal(result.badgeLabel, "IMPROVEMENT APPLIED");
    assert.equal(result.headlineSentence, IMPROVEMENT_COPY.APPLIED_HEADLINE);
    assert.equal(result.autoApply.applied, true);
  });

  it("still states the adjustment and the result it was applied for", () => {
    assert.equal(result.adjustment, headline.adjustment);
    assert.equal(result.result.pair, "\u00b115 dB \u00b7 L1 \u2192 \u00b112 dB \u00b7 L2");
    assert.equal(result.p19.text, "Unchanged \u00b7 L4");
    assert.equal(result.seats.text, "No protected seat gets worse");
  });

  it("offers no run and no find-it-again action", () => {
    assert.equal(result.nextAction, null);
  });
});

describe("CASE B — a safe improvement the designer approves", () => {
  const result = resolveImprovementResult({
    planView,
    headline,
    summary: { recommendedLever: "delay" },
    calibrationDecision: decision(CALIBRATION_APPLY_DECISION.HOLD, "Held for your approval."),
    calibrationKind: "held",
    applied: false,
  });

  it("is badged IMPROVEMENT FOUND with the confirmed wording", () => {
    assert.equal(result.caseKey, IMPROVEMENT_CASE.REVIEW);
    assert.equal(result.badgeLabel, "IMPROVEMENT FOUND");
    assert.equal(result.headlineSentence, IMPROVEMENT_COPY.FOUND_HEADLINE);
    assert.equal(result.found, true);
  });

  it("identifies the winning candidate and its family", () => {
    assert.equal(result.candidateId, "cand-delay-7");
    assert.equal(result.familyKey, "delay");
    assert.equal(result.familyLabel, "Delay");
  });

  it("states the ONE next step and why it was held", () => {
    assert.equal(result.nextAction.label, "REVIEW IMPROVEMENT");
    assert.equal(result.autoApply.applied, false);
    assert.equal(result.autoApply.heldReason, "Held for your approval.");
    assert.equal(result.held.text, "Held for your approval.");
  });
});

describe("THE OTHER WORKFLOWS KEEP THEIR OWN PRESENTATION", () => {
  it("never claims a trade-off as a clean improvement", () => {
    const result = resolveImprovementResult({
      planView, headline, summary: { recommendedLever: "delay" }, tradeOffActive: true,
    });
    assert.equal(result.caseKey, IMPROVEMENT_CASE.TRADE_OFF);
    assert.equal(result.found, false);
    assert.equal(result.badgeLabel, null);
  });

  it("never claims a physical move as a clean improvement", () => {
    const result = resolveImprovementResult({
      planView, headline, summary: { recommendedLever: "delay" }, physicalOnly: true,
    });
    assert.equal(result.caseKey, IMPROVEMENT_CASE.PHYSICAL);
    assert.equal(result.found, false);
  });

  it("claims nothing at all when no confirmed improvement exists", () => {
    const result = resolveImprovementResult({ planView, headline: null, summary: {} });
    assert.equal(result.caseKey, IMPROVEMENT_CASE.NONE);
    assert.equal(result.found, false);
    assert.equal(result.adjustment, null);
    assert.equal(result.result, null);
  });

  it("states no figure the run did not record", () => {
    const result = resolveImprovementResult({
      planView,
      headline,
      summary: { recommendedLever: "delay" },
      calibrationDecision: { decision: CALIBRATION_APPLY_DECISION.HOLD },
      applied: false,
    });
    assert.equal(result.p19, null);
    assert.equal(result.p20.text, headline.comparison);
    assert.equal(result.result.pair, headline.comparison);
  });
});

describe("THE CARD WIRES IT, AND LEAVES NO RUN CONTROL BEHIND", () => {
  const journey = read(JOURNEY);

  it("renders the result block and the review controls", () => {
    assert.match(journey, /improvementResult\.found && <AdiImprovementResult result=\{improvementResult\} \/>/);
    assert.match(journey, /improvementReviewActive && \(\s*<AdiImprovementActions/);
    assert.match(journey, /const improvementReviewActive = improvementResult\.caseKey === IMPROVEMENT_CASE\.REVIEW;/);
  });

  it("takes the run and re-test controls off a completed improvement", () => {
    assert.match(journey, /const improvementOwnsPanel = presentation\?\.outcome === OPTIMISER_OUTCOME\.IMPROVEMENTS_FOUND;/);
    assert.match(journey, /&& !improvementOwnsPanel;/);
    assert.match(journey, /retestOwnsPrimary \|\| improvementOwnsPanel/);
  });

  it("gives the review the only Apply, through the existing lever apply path", () => {
    assert.match(journey, /onApply=\{optimiserRunOwnsRetry \|\| recommendationIgnored \|\| improvementReviewActive/);
    assert.match(journey, /onApply=\{handleApplyRecommended\}/);
  });

  it("keeps every new module free of engineering and optimiser logic", () => {
    const files = [
      "src/components/room/bass/optimiserPlan/improvementResultAuthority.js",
      "src/components/room/bass/optimiserPlan/AdiImprovementResult.jsx",
      "src/components/room/bass/optimiserPlan/AdiImprovementActions.jsx",
      "src/components/room/bass/optimiserPlan/AdiImprovementReviewDialog.jsx",
    ];
    const forbidden = /improveBassV2Engine|materialityGate|recommendationRanker|positionScreeningEngine|p19Authority|bassGradingAuthority|runOptimisation|subwooferGroupAuthority/;
    files.forEach((file) => {
      assert.equal(forbidden.test(read(file)), false, `${file} must not reach into the optimiser`);
    });
  });
});