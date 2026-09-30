// resolveOptimiserPresentationState.js
// ---------------------------------------------------------------------------
// ONE authority for the complete optimiser presentation state.
//
// The status pill, headline, explanation, lever rows, Apply controls, re-run
// control, candidate evidence and rejection reason all come from this resolved
// state. Nothing else in the card decides any of them, so the pill and the body
// can never disagree.
//
// Generic ADI diagnosis text can never produce an "available" state: a state is
// only actionable when there is a genuinely evaluated change whose current and
// proposed values are visible and whose Apply action is usable.
//
// PURE: no React, no stores, no calculation. It reads an already-resolved plan
// view, the run status and the evaluated-action facts, and returns copy. It
// changes no bass maths, no optimiser scoring and no RP22 grading.
// ---------------------------------------------------------------------------

import { OPTIMISER_PLAN_STATUS } from "./optimiserPlanConstants.js";

/** The complete set of optimiser presentation states. */
export const OPTIMISER_PRESENTATION_STATE = Object.freeze({
  NO_RUN: "no_run",
  RUNNING: "running",
  PLAN_AVAILABLE: "plan_available",
  NO_USEFUL_IMPROVEMENT: "no_useful_improvement",
  EVALUATION_INCOMPLETE: "evaluation_incomplete",
  STALE: "stale",
  FAILED: "failed",
});

/** Status pill label for every state — exactly one label per state. */
export const OPTIMISER_PRESENTATION_LABEL = Object.freeze({
  [OPTIMISER_PRESENTATION_STATE.NO_RUN]: "Optimisation required",
  [OPTIMISER_PRESENTATION_STATE.RUNNING]: "Optimisation running",
  [OPTIMISER_PRESENTATION_STATE.PLAN_AVAILABLE]: "Optimisation plan available",
  [OPTIMISER_PRESENTATION_STATE.NO_USEFUL_IMPROVEMENT]: "No useful improvement found",
  [OPTIMISER_PRESENTATION_STATE.EVALUATION_INCOMPLETE]: "Evaluation incomplete",
  [OPTIMISER_PRESENTATION_STATE.STALE]: "Re-evaluation required",
  [OPTIMISER_PRESENTATION_STATE.FAILED]: "Optimisation failed",
});

/** Action offered by each state. */
export const OPTIMISER_PRESENTATION_ACTION = Object.freeze({
  RUN: "Run Optimisation Plan",
  RERUN: "Re-run Optimisation Plan",
  COMPLETE: "Complete Optimisation Plan",
});

export const OPTIMISER_PRESENTATION_COPY = Object.freeze({
  NO_RUN:
    "No evaluated optimiser run or saved plan exists for this design. Run the optimiser to evaluate what can be improved.",
  RUNNING: "Evaluation is in progress. Nothing can be applied until it finishes.",
  STALE:
    "The saved optimiser plan belongs to an earlier design state. Re-run the optimiser before applying any change.",
  INCOMPLETE:
    "The optimiser did not confirm a final winner for this design, so no change can be applied yet.",
  INCOMPLETE_MISSING:
    "The optimiser evidence saved for this design cannot be read, so no change can be applied from it.",
  INCOMPLETE_UNSAVED:
    "The optimiser result could not be saved for this design, so it cannot be trusted — re-run the optimiser.",
  FAILED: "The optimiser run did not complete.",
});

/**
 * Is there at least one lever row that was genuinely evaluated, whose current
 * and proposed values are visible, and whose own Apply action is usable?
 */
export function hasApplicableEvaluatedLever(planView) {
  if (!planView || planView.status !== OPTIMISER_PLAN_STATUS.CURRENT) return false;
  const levers = Array.isArray(planView.levers) ? planView.levers : [];
  return levers.some((lever) => lever.canApply === true
    && lever.evaluated === true
    && lever.effect != null
    && Array.isArray(lever.changes)
    && lever.changes.length > 0);
}

/**
 * Resolve the complete presentation state.
 *
 * @param {object} params
 * @param {object|null} params.planView - resolved plan / run-evidence status view
 * @param {string} [params.runStatus] - idle | running | complete | failed
 * @param {string|null} [params.runError]
 * @param {object|null} [params.actionable] - the evaluated ADI action, when one
 *   genuinely exists: { available, currentText, proposedText, reason }
 * @param {boolean} [params.runBlocked]
 * @param {boolean} [params.planPersisted] - false when saving the result failed
 * @returns {object} one resolved presentation state
 */
export function resolveOptimiserPresentationState({
  planView = null,
  runStatus = "idle",
  runError = null,
  actionable = null,
  runBlocked = false,
  planPersisted = true,
} = {}) {
  const status = planView?.status || OPTIMISER_PLAN_STATUS.ABSENT;
  const evidence = planView?.run || null;

  const build = (state, extra = {}) => ({
    state,
    statusLabel: OPTIMISER_PRESENTATION_LABEL[state],
    message: OPTIMISER_PRESENTATION_COPY.NO_RUN,
    explanation: null,
    notes: [],
    evidence: null,
    showPlan: false,
    // A state is only ever actionable from this one authority.
    showApply: state === OPTIMISER_PRESENTATION_STATE.PLAN_AVAILABLE,
    action: null,
    actionLabel: null,
    runBlocked,
    runError,
    ...extra,
  });

  // ── RUNNING ── never an Apply action while evaluation is in progress.
  if (runStatus === "running") {
    return build(OPTIMISER_PRESENTATION_STATE.RUNNING, {
      message: OPTIMISER_PRESENTATION_COPY.RUNNING,
      showApply: false,
    });
  }

  // ── FAILED ── a technical execution failure, never a design statement.
  if (runStatus === "failed") {
    return build(OPTIMISER_PRESENTATION_STATE.FAILED, {
      message: (runError || OPTIMISER_PRESENTATION_COPY.FAILED),
      action: OPTIMISER_PRESENTATION_ACTION.RERUN,
      actionLabel: OPTIMISER_PRESENTATION_ACTION.RERUN,
      showApply: false,
    });
  }

  // ── STALE ── the saved plan no longer belongs to this design.
  if (status === OPTIMISER_PLAN_STATUS.STALE) {
    return build(OPTIMISER_PRESENTATION_STATE.STALE, {
      message: planView?.staleReason || OPTIMISER_PRESENTATION_COPY.STALE,
      action: OPTIMISER_PRESENTATION_ACTION.RERUN,
      actionLabel: OPTIMISER_PRESENTATION_ACTION.RERUN,
      showPlan: true,
      showApply: false,
    });
  }

  // ── NO_USEFUL_IMPROVEMENT ── complete evidence, every credible candidate rejected.
  if (status === OPTIMISER_PLAN_STATUS.NO_USEFUL_IMPROVEMENT) {
    return build(OPTIMISER_PRESENTATION_STATE.NO_USEFUL_IMPROVEMENT, {
      message: "The optimiser completed its search without confirming a candidate worth applying.",
      explanation: "Nothing is offered for application. The evidence below is what the run evaluated.",
      evidence,
      action: OPTIMISER_PRESENTATION_ACTION.RERUN,
      actionLabel: OPTIMISER_PRESENTATION_ACTION.RERUN,
      showApply: false,
    });
  }

  // ── PLAN_AVAILABLE ── only a genuinely evaluated, visible, applicable change.
  if (hasApplicableEvaluatedLever(planView)) {
    return build(OPTIMISER_PRESENTATION_STATE.PLAN_AVAILABLE, {
      message: "Sound Proof has evaluated the available improvement options for this design.",
      showPlan: true,
      showApply: true,
    });
  }

  if (actionable?.available === true) {
    return build(OPTIMISER_PRESENTATION_STATE.PLAN_AVAILABLE, {
      message: actionable.summary || "An evaluated change is available for this design.",
      explanation: actionable.reason || null,
      showApply: true,
    });
  }

  // ── EVALUATION_INCOMPLETE ── evidence missing, unreadable, or unsaved.
  if (planPersisted === false) {
    return build(OPTIMISER_PRESENTATION_STATE.EVALUATION_INCOMPLETE, {
      message: OPTIMISER_PRESENTATION_COPY.INCOMPLETE_UNSAVED,
      evidence,
      action: OPTIMISER_PRESENTATION_ACTION.RERUN,
      actionLabel: OPTIMISER_PRESENTATION_ACTION.RERUN,
      showApply: false,
    });
  }

  if (status === OPTIMISER_PLAN_STATUS.UNSUPPORTED) {
    return build(OPTIMISER_PRESENTATION_STATE.EVALUATION_INCOMPLETE, {
      message: OPTIMISER_PRESENTATION_COPY.INCOMPLETE_MISSING,
      evidence,
      action: OPTIMISER_PRESENTATION_ACTION.RERUN,
      actionLabel: OPTIMISER_PRESENTATION_ACTION.RERUN,
      showApply: false,
    });
  }

  if (status === OPTIMISER_PLAN_STATUS.CURRENT) {
    // A current plan whose lever-level evidence is not complete enough to apply.
    return build(OPTIMISER_PRESENTATION_STATE.EVALUATION_INCOMPLETE, {
      message: OPTIMISER_PRESENTATION_COPY.INCOMPLETE,
      showPlan: true,
      action: OPTIMISER_PRESENTATION_ACTION.COMPLETE,
      actionLabel: OPTIMISER_PRESENTATION_ACTION.COMPLETE,
      showApply: false,
    });
  }

  // A terminal run record that is not a completed no-winner result.
  if (evidence) {
    return build(OPTIMISER_PRESENTATION_STATE.EVALUATION_INCOMPLETE, {
      message: OPTIMISER_PRESENTATION_COPY.INCOMPLETE,
      evidence,
      action: OPTIMISER_PRESENTATION_ACTION.RERUN,
      actionLabel: OPTIMISER_PRESENTATION_ACTION.RERUN,
      showApply: false,
    });
  }

  // ── NO_RUN ── nothing evaluated and saved for this design.
  return build(OPTIMISER_PRESENTATION_STATE.NO_RUN, {
    action: OPTIMISER_PRESENTATION_ACTION.RUN,
    actionLabel: OPTIMISER_PRESENTATION_ACTION.RUN,
    showApply: false,
  });
}