// optimiser-actionable-states.test.mjs
// ---------------------------------------------------------------------------
// ACCEPTANCE — the Bass Optimiser states an ACTIONABLE outcome, never a
// contradictory pair.
//
// The six states the designer acts on, and the rule that makes them safe:
//
//   NO IMPROVEMENT FOUND          a completed search that confirmed nothing
//   IMPROVEMENT FOUND             a confirmed, applicable adjustment
//   PHYSICAL CHANGE RECOMMENDED   the confirmed change needs seats/subs moved
//   RE-TEST NEEDED                the saved result cannot support a
//                                 recommendation until it is checked again
//   BASS PERFORMANCE NEEDS UPDATING  the current bass authority is missing/stale
//   UNABLE TO EVALUATE            a technical failure, with its real reason named
//
// A state never contradicts itself: "no improvement was found" is stated only
// for a completed search, a re-test result is never also reported as a search
// that found nothing, a genuine failure names its real reason and never shows
// the engine's own words, and each state offers ONE control.
//
// Presentation only: no bass maths, no candidate search, no P19/P20 scoring and
// no RP22 grading is exercised or changed here.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { OPTIMISER_PLAN_STATUS } from "../components/room/bass/optimiserPlan/optimiserPlanConstants.js";
import {
  ADI_OPTIMISER_ACTION,
  OPTIMISER_PLAN_RUN_BLOCK,
} from "../components/room/bass/optimiserPlan/resolveAdiOptimiserJourney.js";
import {
  OPTIMISER_OUTCOME,
  OPTIMISER_OUTCOME_LABEL,
  OPTIMISER_PRESENTATION_ACTION,
  OPTIMISER_PRESENTATION_STATE,
  OPTIMISER_RETEST_LABEL,
  resolveOptimiserPresentationState,
} from "../components/room/bass/optimiserPlan/resolveOptimiserPresentationState.js";
import {
  OPTIMISER_FAILURE_CODE,
  OPTIMISER_RETEST_DETAIL,
  OPTIMISER_RETEST_MESSAGE,
  resolveOptimiserFailureCode,
} from "../components/room/bass/optimiserPlan/optimiserFailureReason.js";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, "..");
const read = (path) => readFileSync(join(SRC, path), "utf8");

/** A completed search whose evidence is complete and confirmed nothing. */
const noImprovementPlan = () => ({
  status: OPTIMISER_PLAN_STATUS.NO_USEFUL_IMPROVEMENT,
  terminalOutcome: "no_useful_improvement",
  run: { rejectionReasons: [] },
});

/** An OLD run that kept no usable evidence for its own result. */
const oldRunWithoutEvidence = () => ({
  status: OPTIMISER_PLAN_STATUS.INCOMPLETE,
  terminalOutcome: "evaluation_incomplete",
  run: { rejectionReasons: [] },
});

/** A saved result from an evidence contract the reader does not know. */
const oldContractResult = () => ({
  status: OPTIMISER_PLAN_STATUS.UNSUPPORTED,
  run: { rejectionReasons: [] },
});

/** A current plan holding one applicable evaluated change of the given kind. */
const applicablePlan = (leverKey, effectDb = -3) => ({
  status: OPTIMISER_PLAN_STATUS.CURRENT,
  individualEffectsEvaluated: true,
  baseline: { p20VariationDb: 12 },
  run: { rejectionReasons: [] },
  levers: [{
    key: leverKey,
    evaluated: true,
    canApply: true,
    effect: { p20DeltaDb: effectDb },
    changes: [{ lever: leverKey, field: "delayMs", to: 4.5 }],
  }],
});

const stateFor = (planView, extra = {}) => resolveOptimiserPresentationState({ planView, ...extra });

describe("ACCEPTANCE 1: an old run with insufficient evidence is RE-TEST NEEDED", () => {
  const CASES = [
    { name: "incomplete run", planView: oldRunWithoutEvidence() },
    { name: "saved before this evidence contract", planView: oldContractResult() },
    { name: "saved result never persisted", planView: null, extra: { planPersisted: false } },
  ];

  it.each(CASES)("$name", ({ planView, extra }) => {
    const state = stateFor(planView, extra);

    expect(state.outcome).toBe(OPTIMISER_OUTCOME.RETEST_NEEDED);
    expect(state.outcomeLabel).toBe("Re-test Needed");
    // The badge IS the outcome: the pill cannot say something else.
    expect(state.statusLabel).toBe(OPTIMISER_OUTCOME_LABEL[OPTIMISER_OUTCOME.RETEST_NEEDED]);
    expect(state.message).toBe(OPTIMISER_RETEST_MESSAGE);
    expect(state.nextAction).toBe(OPTIMISER_RETEST_DETAIL);
    // The ONE control is the re-test itself.
    expect(state.action).toBe(OPTIMISER_PRESENTATION_ACTION.RETEST);
    expect(state.actionLabel).toBe(OPTIMISER_RETEST_LABEL);
    expect(state.showApply).toBe(false);
  });

  it("never states that no improvement was found, and never 'evaluation could not complete'", () => {
    CASES.forEach(({ planView, extra }) => {
      const state = stateFor(planView, extra);
      const mainPanel = [state.statusLabel, state.message, state.nextAction].join(" ");
      expect(mainPanel).not.toMatch(/no useful improvement|no improvement was found|did not find/i);
      expect(mainPanel).not.toMatch(/evaluation could not complete|could not complete the optimi[sz]ation/i);
      // The engine's own words stay out of the main panel.
      expect(mainPanel).not.toMatch(/baseline_validation_failed|candidate id|worker failed/i);
    });
  });
});

describe("ACCEPTANCE 2: a completed search with no better result is NO IMPROVEMENT FOUND", () => {
  it("states the completed search and no re-test badge", () => {
    const state = stateFor(noImprovementPlan());

    expect(state.state).toBe(OPTIMISER_PRESENTATION_STATE.NO_USEFUL_IMPROVEMENT);
    expect(state.outcome).toBe(OPTIMISER_OUTCOME.NO_IMPROVEMENTS);
    expect(state.statusLabel).toBe("No Improvement Found");
    expect(state.message).toBe("ADI checked the current design and did not find a worthwhile improvement.");
    // A completed, trustworthy result never asks for a re-test as its outcome,
    // and nothing is offered for application.
    expect(state.outcome).not.toBe(OPTIMISER_OUTCOME.RETEST_NEEDED);
    expect(state.showApply).toBe(false);
  });
});

describe("ACCEPTANCE 3: a confirmed improvement is IMPROVEMENT FOUND", () => {
  it("states the adjustment and offers its one Apply action", () => {
    const state = stateFor(applicablePlan("delay"));

    expect(state.state).toBe(OPTIMISER_PRESENTATION_STATE.PLAN_AVAILABLE);
    expect(state.outcome).toBe(OPTIMISER_OUTCOME.IMPROVEMENTS_FOUND);
    expect(state.statusLabel).toBe("Improvement Found");
    expect(state.message).toBe("ADI found an adjustment that improves the result.");
    expect(state.showApply).toBe(true);
    // Never an evaluation-failed badge beside a confirmed improvement.
    expect(state.statusLabel).not.toBe("Unable To Evaluate");
    expect(state.statusLabel).not.toBe("Re-test Needed");
  });
});

describe("ACCEPTANCE 4: a change that needs seats or subwoofers moved is PHYSICAL CHANGE RECOMMENDED", () => {
  it.each(["placement", "seating", "subwoofer", "layout"])("%s", (leverKey) => {
    const state = stateFor(applicablePlan(leverKey, -3));

    expect(state.outcome).toBe(OPTIMISER_OUTCOME.PHYSICAL_CHANGE);
    expect(state.statusLabel).toBe("Physical Change Recommended");
    expect(state.message).toBe("ADI found an improvement that requires a physical change.");
    // The change is stated with its own controls and is never applied by ADI.
    expect(state.nextAction).toMatch(/not applied/i);
    expect(state.showApply).toBe(true);
  });

  it("stays IMPROVEMENT FOUND when an electronic adjustment is also applicable", () => {
    const plan = applicablePlan("delay");
    plan.levers.push({
      key: "placement",
      evaluated: true,
      canApply: true,
      effect: { p20DeltaDb: -2 },
      changes: [{ lever: "placement", axis: "x", to: 1.2 }],
    });
    const state = stateFor(plan);
    // The adjustment is offered first (least intrusive first), so the badge names
    // the improvement rather than the physical change.
    expect(state.outcome).toBe(OPTIMISER_OUTCOME.IMPROVEMENTS_FOUND);
  });
});

describe("ACCEPTANCE 5: a missing or stale bass authority is BASS PERFORMANCE NEEDS UPDATING", () => {
  const CASES = [
    { name: "never calculated", block: OPTIMISER_PLAN_RUN_BLOCK.CALCULATION_REQUIRED },
    { name: "stale", block: OPTIMISER_PLAN_RUN_BLOCK.DESIGN_STALE },
    { name: "not validated", block: OPTIMISER_PLAN_RUN_BLOCK.NO_VALID_BASS_RESULT },
    { name: "baseline could not be validated", block: null },
  ];

  it.each(CASES)("$name", ({ block }) => {
    const state = stateFor(
      block ? { status: OPTIMISER_PLAN_STATUS.INCOMPLETE, run: null } : { status: OPTIMISER_PLAN_STATUS.INCOMPLETE, run: { baselineValidation: { valid: false } } },
      block ? { runBlockReason: { code: block } } : {},
    );

    expect(state.outcome).toBe(OPTIMISER_OUTCOME.BASS_UPDATE_REQUIRED);
    expect(state.statusLabel).toBe("Bass Performance Needs Updating");
    expect(state.nextAction).toMatch(/Recalculate Bass Performance before running the optimiser/);
    // The ONE control is the recalculation: it is what lifts the block.
    expect(state.action).toBe(ADI_OPTIMISER_ACTION.CALCULATE);
    expect(state.actionLabel).toBe("Recalculate Bass Performance");
    expect(state.showApply).toBe(false);
  });

  it("names which bass fact is missing instead of a bare 'could not complete'", () => {
    const stale = stateFor(
      { status: OPTIMISER_PLAN_STATUS.INCOMPLETE, run: null },
      { runBlockReason: { code: OPTIMISER_PLAN_RUN_BLOCK.DESIGN_STALE } },
    );
    const never = stateFor(
      { status: OPTIMISER_PLAN_STATUS.INCOMPLETE, run: null },
      { runBlockReason: { code: OPTIMISER_PLAN_RUN_BLOCK.CALCULATION_REQUIRED } },
    );
    expect(stale.message).toMatch(/setup has changed/);
    expect(never.message).toMatch(/has not been calculated/);
    expect(stale.message).not.toBe(never.message);
  });
});

describe("ACCEPTANCE 6: a genuine technical failure names its real reason", () => {
  const CASES = [
    { recorded: ["Required seat-response data is missing for one or more seats."], expect: /seat-response data is missing/i },
    { recorded: ["The subwoofer configuration could not be built from the saved instances."], expect: /subwoofer configuration could not be evaluated/i },
    { recorded: ["The bass response band produced no usable data."], expect: /bass response data is incomplete/i },
    { recorded: ["stage aborted with no detail"], expect: /did not finish/i },
  ];

  it.each(CASES)("$recorded", ({ recorded, expect: expected }) => {
    const state = stateFor(
      { status: OPTIMISER_PLAN_STATUS.FAILED, run: { rejectionReasons: recorded } },
      { runStatus: "failed", runError: "worker failed: internal detail" },
    );

    expect(state.outcome).toBe(OPTIMISER_OUTCOME.UNABLE_TO_EVALUATE);
    expect(state.statusLabel).toBe("Unable To Evaluate");
    expect(state.message).toMatch(expected);
    // The engine's own error text is retained for Engineer details, never shown
    // as the panel's own sentence.
    expect(state.message).not.toMatch(/worker failed/i);
    expect(state.runError).toBe("worker failed: internal detail");
    expect(state.nextAction).toBeTruthy();
    expect(state.actionLabel).toBeTruthy();
  });

  it("keeps the engine's own words on the state, where Engineer details reads them", () => {
    const state = stateFor(
      { status: OPTIMISER_PLAN_STATUS.FAILED, run: { rejectionReasons: ["worker failed"] } },
      { runStatus: "failed", runError: "worker failed" },
    );
    expect(state.failureCode).toBe(OPTIMISER_FAILURE_CODE.WORKER_FAILED);
    // The technical text still travels with the state, so Engineer details can
    // print it — it is simply never the main panel's sentence.
    expect(state.runError).toBe("worker failed");
    expect(state.message).not.toContain("worker failed");
  });
});

describe("ACCEPTANCE 7: one primary action per state", () => {
  it("offers exactly one control, and it matches the state", () => {
    const states = [
      stateFor(oldRunWithoutEvidence()),
      stateFor(noImprovementPlan()),
      stateFor(applicablePlan("delay")),
      stateFor(applicablePlan("placement")),
      stateFor(
        { status: OPTIMISER_PLAN_STATUS.INCOMPLETE, run: null },
        { runBlockReason: { code: OPTIMISER_PLAN_RUN_BLOCK.DESIGN_STALE } },
      ),
    ];
    states.forEach((state) => {
      expect(state.action == null).toBe(state.actionLabel == null);
      expect(state.showApply === true).toBe(state.state === OPTIMISER_PRESENTATION_STATE.PLAN_AVAILABLE);
    });
  });

  it("draws the re-test control twice never: the calibration control stands down", () => {
    const journey = read("components/room/bass/optimiserPlan/AdiOptimisationJourney.jsx");
    // The rule reads the re-test WORDING as well as the action, so a run control
    // worded as the re-test always owns it.
    expect(journey).toMatch(/runControlIsRetest = journey\.action === OPTIMISER_PRESENTATION_ACTION\.RETEST/);
    expect(journey).toMatch(/\|\| journey\.actionLabel === OPTIMISER_RETEST_LABEL/);
    expect(journey).toMatch(/const retestOwnsPrimary = runControlIsRetest[\s\S]*?showAction[\s\S]*?!panelShowsRerun/);
    // The re-test STATE stands the calibration control down as well: one control,
    // one wording, one helper line.
    expect(journey).toMatch(/onReoptimise=\{optimiserRunOwnsRetry \|\| isRunning \|\| retestOwnsPrimary[\s\S]*?onReoptimiseCalibration\}/);
  });

  it("keeps the re-test helper line directly under that one control", () => {
    const journey = read("components/room/bass/optimiserPlan/AdiOptimisationJourney.jsx");
    const controlAt = journey.indexOf("{showAction && !panelShowsRerun && (");
    const helperAt = journey.indexOf("{OPTIMISER_RETEST_HELPER_SENTENCE}");
    const detailsAt = journey.indexOf("data-adi-engineer-details");
    expect(helperAt).toBeGreaterThan(controlAt);
    expect(helperAt).toBeLessThan(detailsAt);
  });
});

describe("ACCEPTANCE 8: Engineer details retain the diagnostics", () => {
  it("keeps the run evidence and the failure code on the resolved state", () => {
    const state = stateFor(oldRunWithoutEvidence());
    expect(state.failureCode).toBe(OPTIMISER_FAILURE_CODE.EVIDENCE_MISSING);
    expect(state.evidence).toBeTruthy();
    expect(state.state).toBe(OPTIMISER_PRESENTATION_STATE.EVALUATION_INCOMPLETE);
  });

  it("renders the engine's own error text inside the Engineer details disclosure", () => {
    const journey = read("components/room/bass/optimiserPlan/AdiOptimisationJourney.jsx");
    const technicalAt = journey.indexOf('data-adi-run-error="true"');
    const detailsAt = journey.indexOf("data-adi-engineer-details");
    const detailsCloseAt = journey.indexOf("</details>");
    expect(technicalAt).toBeGreaterThan(detailsAt);
    expect(technicalAt).toBeLessThan(detailsCloseAt);
    // The main panel no longer prints the raw error at all.
    expect(journey).not.toMatch(/\{runStatus === "failed" && runError && \(/);
  });
});

describe("ACCEPTANCE 9: the failure mapper is unchanged in what it decides", () => {
  it("still maps the blocks the panel explains elsewhere to nothing", () => {
    [OPTIMISER_PLAN_RUN_BLOCK.MISSING_REQUIRED_DATA,
      OPTIMISER_PLAN_RUN_BLOCK.TARGET_NOT_SELECTED,
      OPTIMISER_PLAN_RUN_BLOCK.CALCULATION_IN_PROGRESS].forEach((code) => {
      expect(resolveOptimiserFailureCode({ runBlockCode: code })).toBeNull();
    });
  });

  it("changes no optimiser maths: the resolver never writes the design", () => {
    const source = read("components/room/bass/optimiserPlan/resolveOptimiserPresentationState.js");
    expect(/commitInstances|commitSeating|update\(|bulkUpdate|applyCalibrationTuning|setOptimiserPlanAuthority|calculateBass|runOptimiser/.test(source)).toBe(false);
  });
});