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
import { ADI_BASS_OPTIMISER_LABEL, ADI_OPTIMISER_ACTION } from "./resolveAdiOptimiserJourney.js";
import { OPTIMISER_FAILURE_FIX, resolveOptimiserFailure } from "./optimiserFailureReason.js";

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

/**
 * THE FOUR OUTCOMES the designer acts on. Every finished evaluation resolves to
 * exactly one of them, so the panel always states an outcome rather than an
 * engine state, and the four are the only result words the designer ever reads.
 */
export const OPTIMISER_OUTCOME = Object.freeze({
  NO_IMPROVEMENTS: "no_improvements",
  IMPROVEMENTS_FOUND: "improvements_found",
  RETEST_NEEDED: "retest_needed",
  COULD_NOT_COMPLETE: "could_not_complete",
});

/** The one visible label per outcome. */
export const OPTIMISER_OUTCOME_LABEL = Object.freeze({
  [OPTIMISER_OUTCOME.NO_IMPROVEMENTS]: "No Improvements Found",
  [OPTIMISER_OUTCOME.IMPROVEMENTS_FOUND]: "Improvements Found",
  [OPTIMISER_OUTCOME.RETEST_NEEDED]: "Re-test Needed",
  [OPTIMISER_OUTCOME.COULD_NOT_COMPLETE]: "Evaluation Could Not Complete",
});

/** Which outcome each presentation state presents (null = no outcome yet). */
export const OPTIMISER_OUTCOME_BY_STATE = Object.freeze({
  [OPTIMISER_PRESENTATION_STATE.NO_RUN]: null,
  [OPTIMISER_PRESENTATION_STATE.RUNNING]: null,
  [OPTIMISER_PRESENTATION_STATE.PLAN_AVAILABLE]: OPTIMISER_OUTCOME.IMPROVEMENTS_FOUND,
  [OPTIMISER_PRESENTATION_STATE.NO_USEFUL_IMPROVEMENT]: OPTIMISER_OUTCOME.NO_IMPROVEMENTS,
  [OPTIMISER_PRESENTATION_STATE.EVALUATION_INCOMPLETE]: OPTIMISER_OUTCOME.COULD_NOT_COMPLETE,
  [OPTIMISER_PRESENTATION_STATE.STALE]: OPTIMISER_OUTCOME.RETEST_NEEDED,
  [OPTIMISER_PRESENTATION_STATE.FAILED]: OPTIMISER_OUTCOME.COULD_NOT_COMPLETE,
});

/** The one control the re-test outcomes offer, worded as the next step. */
export const OPTIMISER_RETEST_LABEL = "Re-test Bass Optimisation";

/** The one helper line under that control: what pressing it may write. */
export const OPTIMISER_RETEST_HELPER_SENTENCE =
  "ADI re-checks the current design and only proposes a change where it improves the result.";

/** Status pill label for every state — exactly one label per state. */
export const OPTIMISER_PRESENTATION_LABEL = Object.freeze({
  [OPTIMISER_PRESENTATION_STATE.NO_RUN]: "Optimisation required",
  [OPTIMISER_PRESENTATION_STATE.RUNNING]: "Optimisation running",
  [OPTIMISER_PRESENTATION_STATE.PLAN_AVAILABLE]: OPTIMISER_OUTCOME_LABEL[OPTIMISER_OUTCOME.IMPROVEMENTS_FOUND],
  [OPTIMISER_PRESENTATION_STATE.NO_USEFUL_IMPROVEMENT]: OPTIMISER_OUTCOME_LABEL[OPTIMISER_OUTCOME.NO_IMPROVEMENTS],
  [OPTIMISER_PRESENTATION_STATE.EVALUATION_INCOMPLETE]: OPTIMISER_OUTCOME_LABEL[OPTIMISER_OUTCOME.COULD_NOT_COMPLETE],
  [OPTIMISER_PRESENTATION_STATE.STALE]: OPTIMISER_OUTCOME_LABEL[OPTIMISER_OUTCOME.RETEST_NEEDED],
  [OPTIMISER_PRESENTATION_STATE.FAILED]: OPTIMISER_OUTCOME_LABEL[OPTIMISER_OUTCOME.COULD_NOT_COMPLETE],
});

/** Action offered by each state. */
export const OPTIMISER_PRESENTATION_ACTION = Object.freeze({
  // The same action states the same wording in every state — before a run, after
  // a stale result, after a failed run and after an incomplete evaluation. The
  // state itself is carried by the status pill, the spinner and the copy, so
  // there is only ever one run control and never a "Re-run to apply".
  RUN: ADI_BASS_OPTIMISER_LABEL,
  RERUN: ADI_BASS_OPTIMISER_LABEL,
  COMPLETE: ADI_BASS_OPTIMISER_LABEL,
  // The re-test outcomes offer no other control, so their one button names the
  // step itself: re-test the bass optimisation.
  RETEST: OPTIMISER_RETEST_LABEL,
});

export const OPTIMISER_PRESENTATION_COPY = Object.freeze({
  NO_RUN:
    "No evaluated optimiser run or saved plan exists for this design. Run the optimiser to evaluate what can be improved.",
  RUNNING: "Evaluation is in progress. Nothing can be applied until it finishes.",
  STALE:
    "The design has changed since this optimisation was run. Re-test bass optimisation to update the result.",
  INCOMPLETE:
    "ADI could not complete the bass optimisation. Re-run the optimiser or check Engineer Details.",
  INCOMPLETE_MISSING:
    "ADI could not complete the bass optimisation. Re-run the optimiser or check Engineer Details.",
  INCOMPLETE_UNSAVED:
    "ADI could not complete the bass optimisation. Re-run the optimiser or check Engineer Details.",
  FAILED:
    "ADI could not complete the bass optimisation. Re-run the optimiser or check Engineer Details.",
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
 * @param {object|string|null} [params.runBlockReason] - why the run is blocked
 * @param {boolean} [params.planPersisted] - false when saving the result failed
 * @returns {object} one resolved presentation state
 */
export function resolveOptimiserPresentationState({
  planView = null,
  runStatus = "idle",
  runError = null,
  actionable = null,
  runBlocked = false,
  runBlockReason = null,
  planPersisted = true,
} = {}) {
  const status = planView?.status || OPTIMISER_PLAN_STATUS.ABSENT;
  const evidence = planView?.run || null;

  // WHY the run could not complete, in the designer's words: one mapped reason,
  // the next step beside it and the one button that fixes that state. The
  // engine's own recorded words are left untouched in the run evidence, which is
  // what Engineer details reads.
  const failure = resolveOptimiserFailure({
    runStatus,
    terminalOutcome: planView?.terminalOutcome || null,
    runBlockCode: runBlockReason?.code
      || (typeof runBlockReason === "string" ? runBlockReason : null),
    baselineInvalid: evidence?.baselineValidation?.valid === false,
    recordedReasons: Array.isArray(evidence?.rejectionReasons) ? evidence.rejectionReasons : [],
  });
  // The button names the flow that fixes THIS state — the bass calculation when
  // the bass result is what is missing, stale or unvalidated, otherwise the
  // optimiser run itself. Nothing here sends the designer to a control that
  // cannot fix the failure.
  const failureExtras = failure
    ? {
      message: failure.reason,
      nextAction: failure.nextAction,
      failureCode: failure.code,
      action: failure.fix === OPTIMISER_FAILURE_FIX.BASS_CALCULATION
        ? ADI_OPTIMISER_ACTION.CALCULATE
        : OPTIMISER_PRESENTATION_ACTION.RETEST,
      actionLabel: failure.actionLabel,
      // The bass calculation is offered even while the optimiser run itself is
      // blocked: it is the action that lifts the block.
      canRun: failure.fix === OPTIMISER_FAILURE_FIX.BASS_CALCULATION ? true : null,
    }
    : {};

  const build = (state, extra = {}) => {
    const outcome = OPTIMISER_OUTCOME_BY_STATE[state] || null;
    // "Re-test Needed" and "Evaluation Could Not Complete" offer exactly one
    // control, and it is the run action worded as the outcome's own next step.
    const retest = outcome === OPTIMISER_OUTCOME.RETEST_NEEDED
      || outcome === OPTIMISER_OUTCOME.COULD_NOT_COMPLETE;
    const resolved = {
      state,
      // The outcome is what the designer reads; the state behind it stays
      // available for the surfaces that need the finer distinction.
      outcome,
      outcomeLabel: outcome ? OPTIMISER_OUTCOME_LABEL[outcome] : null,
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
      // The reason's own next step, stated beside it in the main panel, and the
      // mapped reason behind it — never a pointer to Engineer details.
      nextAction: null,
      failureCode: null,
      canRun: null,
      runBlocked,
      runError,
      ...extra,
    };
    // A re-test outcome offers the run action worded as its own next step — but
    // a mapped failure names the action that fixes it, and that one wins.
    if (retest && !extra.failureCode) {
      resolved.action = OPTIMISER_PRESENTATION_ACTION.RETEST;
      resolved.actionLabel = OPTIMISER_RETEST_LABEL;
    }
    return resolved;
  };

  // ── RUNNING ── never an Apply action while evaluation is in progress.
  if (runStatus === "running") {
    return build(OPTIMISER_PRESENTATION_STATE.RUNNING, {
      message: OPTIMISER_PRESENTATION_COPY.RUNNING,
      showApply: false,
    });
  }

  // ── FAILED ── a technical execution failure, never a design statement. The
  // panel states why it failed and what to do next; the engine's own error text
  // stays in the state and in Engineer details.
  if (runStatus === "failed") {
    return build(OPTIMISER_PRESENTATION_STATE.FAILED, {
      message: (runError || OPTIMISER_PRESENTATION_COPY.FAILED),
      action: OPTIMISER_PRESENTATION_ACTION.RERUN,
      actionLabel: OPTIMISER_PRESENTATION_ACTION.RERUN,
      showApply: false,
      ...failureExtras,
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

  // ── EVALUATION_INCOMPLETE (terminal) ── the run finished without a usable
  // comparison. The saved reason is stated as recorded, never re-worded into a
  // design conclusion, and the evidence the run produced is shown with a re-run.
  if (status === OPTIMISER_PLAN_STATUS.INCOMPLETE) {
    // The main panel states WHY in the designer's words and the next step beside
    // it, with the one button that fixes that state. The run's own recorded
    // diagnosis is not replaced: it stays in the evidence Engineer details reads.
    return build(OPTIMISER_PRESENTATION_STATE.EVALUATION_INCOMPLETE, {
      message: OPTIMISER_PRESENTATION_COPY.INCOMPLETE,
      explanation: "Nothing is offered for application. The evidence below is what the run evaluated.",
      evidence,
      action: OPTIMISER_PRESENTATION_ACTION.RERUN,
      actionLabel: OPTIMISER_PRESENTATION_ACTION.RERUN,
      showApply: false,
      ...failureExtras,
    });
  }

  // ── PLAN_AVAILABLE ── only a genuinely evaluated, visible, applicable change.
  if (hasApplicableEvaluatedLever(planView)) {
    return build(OPTIMISER_PRESENTATION_STATE.PLAN_AVAILABLE, {
      message: "Sound Proof has evaluated the available improvement options for this design.",
      // A winning plan must carry the same completed-run evidence as terminal
      // outcomes. The plan card owns Apply; this read-only block owns the
      // calculation count and the tested-family audit trail.
      evidence,
      showPlan: true,
      showApply: true,
      // The run control stays available after a result: the designer can always
      // re-evaluate the design. Apply and re-run are different actions, and the
      // run control is never a second Apply.
      action: OPTIMISER_PRESENTATION_ACTION.RERUN,
      actionLabel: OPTIMISER_PRESENTATION_ACTION.RERUN,
    });
  }

  if (actionable?.available === true) {
    return build(OPTIMISER_PRESENTATION_STATE.PLAN_AVAILABLE, {
      message: actionable.summary || "An evaluated change is available for this design.",
      explanation: actionable.reason || null,
      showApply: true,
      action: OPTIMISER_PRESENTATION_ACTION.RERUN,
      actionLabel: OPTIMISER_PRESENTATION_ACTION.RERUN,
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
      ...failureExtras,
    });
  }

  if (status === OPTIMISER_PLAN_STATUS.UNSUPPORTED) {
    return build(OPTIMISER_PRESENTATION_STATE.EVALUATION_INCOMPLETE, {
      message: OPTIMISER_PRESENTATION_COPY.INCOMPLETE_MISSING,
      evidence,
      action: OPTIMISER_PRESENTATION_ACTION.RERUN,
      actionLabel: OPTIMISER_PRESENTATION_ACTION.RERUN,
      showApply: false,
      ...failureExtras,
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
      ...failureExtras,
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
      ...failureExtras,
    });
  }

  // ── NO_RUN ── nothing evaluated and saved for this design.
  return build(OPTIMISER_PRESENTATION_STATE.NO_RUN, {
    action: OPTIMISER_PRESENTATION_ACTION.RUN,
    actionLabel: OPTIMISER_PRESENTATION_ACTION.RUN,
    showApply: false,
  });
}