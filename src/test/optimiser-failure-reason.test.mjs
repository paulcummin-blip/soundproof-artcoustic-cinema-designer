// optimiser-failure-reason.test.mjs
// ---------------------------------------------------------------------------
// The Bass Optimiser panel must state an ACTIONABLE outcome in the designer's
// words, with the next step beside it and ONE button that actually resolves that
// state — never a bare "could not complete" badge with a pointer to Engineer
// details, never a button that cannot fix the failure, and never a state that
// contradicts its own badge.
//
// Presentation only: no bass maths, no optimiser search, no P19/P20 scoring.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  OPTIMISER_FAILURE_CODE,
  OPTIMISER_FAILURE_FIX,
  OPTIMISER_RETEST_DETAIL,
  OPTIMISER_RETEST_MESSAGE,
  OPTIMISER_UNEVALUABLE_REASON,
  resolveOptimiserFailureCode,
} from "../components/room/bass/optimiserPlan/optimiserFailureReason.js";
import { OPTIMISER_PLAN_STATUS } from "../components/room/bass/optimiserPlan/optimiserPlanConstants.js";
import {
  ADI_OPTIMISER_ACTION,
  OPTIMISER_PLAN_RUN_BLOCK,
} from "../components/room/bass/optimiserPlan/resolveAdiOptimiserJourney.js";
import {
  OPTIMISER_PRESENTATION_COPY,
  OPTIMISER_PRESENTATION_STATE,
  resolveOptimiserPresentationState,
} from "../components/room/bass/optimiserPlan/resolveOptimiserPresentationState.js";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, "..");
const read = (path) => readFileSync(join(SRC, path), "utf8");

/** A saved terminal record: the run finished without a usable comparison. */
const incompletePlan = (run = null) => ({
  status: OPTIMISER_PLAN_STATUS.INCOMPLETE,
  terminalOutcome: "evaluation_incomplete",
  run,
});

const BASS_FIX_LABELS = [
  "Recalculate Bass Performance",
  "Calculate Bass Performance",
  "Update Bass Performance",
];

describe("the reason a run could not complete is mapped, never dumped", () => {
  it("1. a baseline that could not be validated says so, and offers the recalculation", () => {
    const state = resolveOptimiserPresentationState({
      planView: incompletePlan({
        baselineValidation: { valid: false, message: "The current baseline could not be validated." },
        rejectionReasons: ["The current baseline could not be validated."],
      }),
    });

    expect(state.state).toBe(OPTIMISER_PRESENTATION_STATE.EVALUATION_INCOMPLETE);
    // A bass result that is the present blocker is badged as a bass update.
    expect(state.statusLabel).toBe("Bass Performance Needs Updating");
    expect(state.failureCode).toBe(OPTIMISER_FAILURE_CODE.BASELINE_NOT_VALIDATED);
    expect(state.message).toMatch(/current bass result could not be validated/);
    expect(state.nextAction).toBe("Recalculate Bass Performance before running the optimiser.");
    expect(state.actionLabel).toBe("Recalculate Bass Performance");
    // The bass calculation is the action that fixes THIS state, so the panel's
    // one button runs it — and it is offered even while the run is blocked.
    expect(state.action).toBe(ADI_OPTIMISER_ACTION.CALCULATE);
    expect(state.canRun).toBe(true);
  });

  it("2. a bass result that was never calculated says so", () => {
    const state = resolveOptimiserPresentationState({
      planView: incompletePlan(null),
      runBlockReason: { code: OPTIMISER_PLAN_RUN_BLOCK.CALCULATION_REQUIRED },
    });

    expect(state.failureCode).toBe(OPTIMISER_FAILURE_CODE.BASS_NOT_CALCULATED);
    expect(state.message).toMatch(/has not been calculated/);
    expect(state.nextAction).toBe("Recalculate Bass Performance before running the optimiser.");
    expect(state.actionLabel).toBe("Recalculate Bass Performance");
    expect(state.action).toBe(ADI_OPTIMISER_ACTION.CALCULATE);
  });

  it("3. a stale bass result says the setup has changed", () => {
    const state = resolveOptimiserPresentationState({
      planView: incompletePlan(null),
      runBlockReason: { code: OPTIMISER_PLAN_RUN_BLOCK.DESIGN_STALE },
    });

    expect(state.failureCode).toBe(OPTIMISER_FAILURE_CODE.BASS_STALE);
    expect(state.message).toMatch(/room or subwoofer setup has changed/);
    expect(state.nextAction).toBe("Recalculate Bass Performance before running the optimiser.");
    expect(state.actionLabel).toBe("Recalculate Bass Performance");
    expect(state.action).toBe(ADI_OPTIMISER_ACTION.CALCULATE);
  });

  it("4. a failed run states that, and asks for a re-test", () => {
    const state = resolveOptimiserPresentationState({
      planView: null,
      runStatus: "failed",
      runError: "worker failed",
    });

    expect(state.state).toBe(OPTIMISER_PRESENTATION_STATE.FAILED);
    // A genuine technical failure is badged as one, and it names the real reason
    // rather than a bare "could not complete".
    expect(state.statusLabel).toBe("Unable To Evaluate");
    expect(state.failureCode).toBe(OPTIMISER_FAILURE_CODE.WORKER_FAILED);
    expect(state.message).toBe(OPTIMISER_UNEVALUABLE_REASON);
    expect(state.nextAction).toBe("Try again. If it repeats, check Engineer details.");
    expect(state.actionLabel).toBe("Re-test Bass Optimisation");
    // Never the bass calculation: recalculation cannot fix a failed run.
    expect(state.action).not.toBe(ADI_OPTIMISER_ACTION.CALCULATE);
    // The engine's own error text is not lost from the state.
    expect(state.runError).toBe("worker failed");
  });

  it("5. missing candidate evidence asks for a re-test", () => {
    const state = resolveOptimiserPresentationState({
      planView: incompletePlan({ rejectionReasons: ["No candidate was confirmed in this run."] }),
    });

    expect(state.failureCode).toBe(OPTIMISER_FAILURE_CODE.EVIDENCE_MISSING);
    // The mandated re-test pair: what to do, then why the saved result cannot be
    // trusted to support its own recommendation.
    expect(state.statusLabel).toBe("Re-test Needed");
    expect(state.message).toBe(OPTIMISER_RETEST_MESSAGE);
    expect(state.nextAction).toBe(OPTIMISER_RETEST_DETAIL);
    expect(state.actionLabel).toBe("Re-test Bass Optimisation");
    // Never the two claims that do not describe this state.
    expect(state.message).not.toMatch(/no useful improvement|could not complete/i);
    expect(state.action).not.toBe(ADI_OPTIMISER_ACTION.CALCULATE);
  });
});

describe("the panel never shows only the outcome label", () => {
  const CASES = [
    { name: "baseline", label: "Bass Performance Needs Updating", input: { planView: incompletePlan({ baselineValidation: { valid: false } }) } },
    { name: "not calculated", label: "Bass Performance Needs Updating", input: { planView: incompletePlan(null), runBlockReason: { code: OPTIMISER_PLAN_RUN_BLOCK.CALCULATION_REQUIRED } } },
    { name: "stale", label: "Bass Performance Needs Updating", input: { planView: incompletePlan(null), runBlockReason: { code: OPTIMISER_PLAN_RUN_BLOCK.DESIGN_STALE } } },
    { name: "worker failed", label: "Unable To Evaluate", input: { planView: null, runStatus: "failed" } },
    { name: "no evidence", label: "Re-test Needed", input: { planView: incompletePlan({ rejectionReasons: [] }) } },
  ];

  it.each(CASES)("$name: states a real reason and a next step", ({ input, label }) => {
    const state = resolveOptimiserPresentationState(input);
    expect(state.statusLabel).toBe(label);
    // Never the banned wording — neither as the badge nor as the sentence — and
    // never a bare pointer to Engineer details.
    expect(state.message).not.toMatch(/evaluation could not complete|could not complete the optimi[sz]ation/i);
    expect(state.nextAction).toBeTruthy();
    expect(state.actionLabel).toBeTruthy();
    // The technical wording stays out of the main panel.
    expect(state.message).not.toMatch(/baseline_validation_failed|candidate id not recorded/i);
  });

  it("gives the bass failures a bass button and the run failures a run button", () => {
    const bass = BASS_FIX_LABELS;
    const baseline = resolveOptimiserPresentationState({
      planView: incompletePlan({ baselineValidation: { valid: false } }),
    });
    const worker = resolveOptimiserPresentationState({ planView: null, runStatus: "failed" });
    expect(bass).toContain(baseline.actionLabel);
    expect(bass).not.toContain(worker.actionLabel);
  });
});

describe("the blocks the panel already explains are left alone", () => {
  it("maps nothing for a missing subwoofer, an unselected target or a running calculation", () => {
    [OPTIMISER_PLAN_RUN_BLOCK.MISSING_REQUIRED_DATA,
      OPTIMISER_PLAN_RUN_BLOCK.TARGET_NOT_SELECTED,
      OPTIMISER_PLAN_RUN_BLOCK.CALCULATION_IN_PROGRESS].forEach((code) => {
      expect(resolveOptimiserFailureCode({ runBlockCode: code })).toBeNull();
    });
  });

  it("never sends a blocked bass result to the optimiser run", () => {
    const state = resolveOptimiserPresentationState({
      planView: incompletePlan(null),
      runBlockReason: { code: OPTIMISER_PLAN_RUN_BLOCK.NO_VALID_BASS_RESULT },
    });
    expect(state.actionLabel).toBe("Recalculate Bass Performance");
    expect(state.action).toBe(ADI_OPTIMISER_ACTION.CALCULATE);
    expect(state.canRun).toBe(true);
  });
});

describe("the plumbing carries the reason and the fix to the panel", () => {
  const journey = read("components/room/bass/optimiserPlan/AdiOptimisationJourney.jsx");
  const summary = read("components/room/bass/optimiserPlan/AdiPanelSummary.jsx");

  it("renders the next step in the MAIN panel, beside the reason", () => {
    expect(summary).toContain('data-adi-panel-next-action="true"');
    expect(journey).toMatch(/nextAction=\{presentation\?\.nextAction \|\| null\}/);
  });

  it("lets a failure offer its own action even while the run is blocked", () => {
    expect(journey).toMatch(/canRun: presentation\.canRun === true \? true :/);
  });

  it("routes the calculation button to the bass calculation, not the optimiser run", () => {
    expect(journey).toMatch(/journey\.action === ADI_OPTIMISER_ACTION\.CALCULATE\s*\n\s*\? onCalculateBassPerformance/);
  });

  it("passes the run-block reason from the workflow into the resolver", () => {
    const caller = read("components/room/bass/optimiseWorkflow/AdiRecommendation.jsx");
    expect(caller).toMatch(/runBlockReason: optimisationRunBlockReason \|\| null/);
  });
});