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
import {
  OPTIMISER_FAILURE_CODE,
  OPTIMISER_FAILURE_FIX,
  OPTIMISER_RETEST_DETAIL,
  OPTIMISER_RETEST_MESSAGE,
  OPTIMISER_UNEVALUABLE_REASON,
  resolveOptimiserFailure,
} from "./optimiserFailureReason.js";
import { CALIBRATION_LEVER_KEYS } from "./adiPanelSections.js";

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
 * THE OUTCOMES the designer acts on. Every finished evaluation resolves to
 * exactly one of them, so the panel states what happened and what to do about it
 * rather than an engine state.
 *
 * The outcomes are mutually exclusive BY CONSTRUCTION, because the badge, the
 * sentence and the action are all read from one resolved outcome:
 *
 *   NO_IMPROVEMENTS      the search ran to completion and confirmed nothing
 *   IMPROVEMENTS_FOUND   a confirmed, applicable adjustment exists
 *   PHYSICAL_CHANGE      the confirmed improvement needs seats/subwoofers moved
 *   RETEST_NEEDED        the saved result cannot support a recommendation until
 *                        it is checked again against the current design
 *   BASS_UPDATE_REQUIRED the current Bass Performance authority is missing/stale
 *   UNABLE_TO_EVALUATE   a genuine technical failure, with its real reason named
 *
 * A re-test outcome is therefore never also reported as a search that found
 * nothing: "no improvement found" is stated only for NO_IMPROVEMENTS.
 */
export const OPTIMISER_OUTCOME = Object.freeze({
  NO_IMPROVEMENTS: "no_improvements",
  IMPROVEMENTS_FOUND: "improvements_found",
  PHYSICAL_CHANGE: "physical_change",
  RETEST_NEEDED: "retest_needed",
  BASS_UPDATE_REQUIRED: "bass_update_required",
  UNABLE_TO_EVALUATE: "unable_to_evaluate",
});

/**
 * THE ONE LABEL PER OUTCOME — the badge the designer reads, and nothing else.
 * The badge is read from the outcome itself, so a badge can never disagree with
 * the sentence or the action beneath it.
 */
export const OPTIMISER_OUTCOME_LABEL = Object.freeze({
  [OPTIMISER_OUTCOME.NO_IMPROVEMENTS]: "No Improvement Found",
  [OPTIMISER_OUTCOME.IMPROVEMENTS_FOUND]: "Improvement Found",
  [OPTIMISER_OUTCOME.PHYSICAL_CHANGE]: "Physical Change Recommended",
  [OPTIMISER_OUTCOME.RETEST_NEEDED]: "Re-test Needed",
  [OPTIMISER_OUTCOME.BASS_UPDATE_REQUIRED]: "Bass Performance Needs Updating",
  [OPTIMISER_OUTCOME.UNABLE_TO_EVALUATE]: "Unable To Evaluate",
});

/**
 * Which outcome each presentation state presents (null = no outcome yet).
 *
 * Two states are refined by the facts the resolver already holds: an incomplete
 * evaluation presents BASS_UPDATE_REQUIRED when the bass result is what is
 * missing or stale and UNABLE_TO_EVALUATE when the run itself failed, and an
 * available plan presents PHYSICAL_CHANGE when the change it offers is a move of
 * seats, subwoofers or layout rather than an electronic adjustment.
 */
export const OPTIMISER_OUTCOME_BY_STATE = Object.freeze({
  [OPTIMISER_PRESENTATION_STATE.NO_RUN]: null,
  [OPTIMISER_PRESENTATION_STATE.RUNNING]: null,
  [OPTIMISER_PRESENTATION_STATE.PLAN_AVAILABLE]: OPTIMISER_OUTCOME.IMPROVEMENTS_FOUND,
  [OPTIMISER_PRESENTATION_STATE.NO_USEFUL_IMPROVEMENT]: OPTIMISER_OUTCOME.NO_IMPROVEMENTS,
  [OPTIMISER_PRESENTATION_STATE.EVALUATION_INCOMPLETE]: OPTIMISER_OUTCOME.RETEST_NEEDED,
  [OPTIMISER_PRESENTATION_STATE.STALE]: OPTIMISER_OUTCOME.RETEST_NEEDED,
  [OPTIMISER_PRESENTATION_STATE.FAILED]: OPTIMISER_OUTCOME.UNABLE_TO_EVALUATE,
});

/**
 * THE ONE SENTENCE PER OUTCOME that no failure reason overrides: what the panel
 * says, and the line beside it. A bass or technical failure states its own
 * reason and its own next step (optimiserFailureReason.js), so those two outcomes
 * are not worded again here.
 */
export const OPTIMISER_OUTCOME_COPY = Object.freeze({
  [OPTIMISER_OUTCOME.NO_IMPROVEMENTS]: {
    message: "ADI checked the current design and did not find a worthwhile improvement.",
    detail: null,
  },
  [OPTIMISER_OUTCOME.IMPROVEMENTS_FOUND]: {
    message: "ADI found an adjustment that improves the result.",
    detail: null,
  },
  [OPTIMISER_OUTCOME.PHYSICAL_CHANGE]: {
    message: "ADI found an improvement that requires a physical change.",
    // The change itself is stated with its own Apply/Undo controls below, and it
    // is never applied by ADI.
    detail: "The change is stated below. ADI has not applied it.",
  },
  [OPTIMISER_OUTCOME.RETEST_NEEDED]: {
    message: OPTIMISER_RETEST_MESSAGE,
    detail: OPTIMISER_RETEST_DETAIL,
  },
});

/**
 * Is the change this plan offers a PHYSICAL one — a move of seats, subwoofers or
 * layout — rather than an electronic adjustment?
 *
 * Read from the plan's own lever records: the offered change is physical when
 * every applicable, evaluated change is a non-calibration lever. When a
 * calibration change is also applicable the panel presents the adjustment first
 * (least intrusive first), so that is not this outcome.
 *
 * Presentation only: no lever is ranked, scored or re-evaluated here.
 */
export function offersPhysicalChangeOnly(planView) {
  if (!planView || planView.status !== OPTIMISER_PLAN_STATUS.CURRENT) return false;
  const levers = Array.isArray(planView.levers) ? planView.levers : [];
  const offered = levers.filter((lever) => lever.canApply === true
    && lever.evaluated === true
    && lever.effect != null
    && Array.isArray(lever.changes)
    && lever.changes.length > 0);
  if (!offered.length) return false;
  return offered.every((lever) => !CALIBRATION_LEVER_KEYS.includes(String(lever?.key ?? lever?.lever ?? "")));
}

/** The one control the re-test outcomes offer, worded as the next step. */
export const OPTIMISER_RETEST_LABEL = "Re-test Bass Optimisation";

/** The one helper line under that control: what pressing it may write. */
export const OPTIMISER_RETEST_HELPER_SENTENCE =
  "ADI re-checks the current design and only proposes a change where it improves the result.";

/**
 * What the main panel states in the re-test states INSTEAD of the previous
 * candidate's own detail. The old candidate is never presented as a current
 * recommendation: its adjustment, the result it was measured on and the reason it
 * was not applied are read in Engineer details, after the re-test.
 */
export const OPTIMISER_RETEST_PREVIOUS_CANDIDATE =
  "A previous run found a possible improvement, but it must be re-tested before it can be recommended.";

/** Status pill label for every state — exactly one label per state. */
export const OPTIMISER_PRESENTATION_LABEL = Object.freeze({
  [OPTIMISER_PRESENTATION_STATE.NO_RUN]: "Optimisation required",
  [OPTIMISER_PRESENTATION_STATE.RUNNING]: "Optimisation running",
  [OPTIMISER_PRESENTATION_STATE.PLAN_AVAILABLE]: OPTIMISER_OUTCOME_LABEL[OPTIMISER_OUTCOME.IMPROVEMENTS_FOUND],
  [OPTIMISER_PRESENTATION_STATE.NO_USEFUL_IMPROVEMENT]: OPTIMISER_OUTCOME_LABEL[OPTIMISER_OUTCOME.NO_IMPROVEMENTS],
  [OPTIMISER_PRESENTATION_STATE.EVALUATION_INCOMPLETE]: OPTIMISER_OUTCOME_LABEL[OPTIMISER_OUTCOME.RETEST_NEEDED],
  [OPTIMISER_PRESENTATION_STATE.STALE]: OPTIMISER_OUTCOME_LABEL[OPTIMISER_OUTCOME.RETEST_NEEDED],
  [OPTIMISER_PRESENTATION_STATE.FAILED]: OPTIMISER_OUTCOME_LABEL[OPTIMISER_OUTCOME.UNABLE_TO_EVALUATE],
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
  // While the newest run works, the panel states THAT RUN ONLY: what it is doing
  // and that nothing can be applied until it finishes. No earlier run's result,
  // candidate, comparison or warning is stated beside it.
  RUNNING: "ADI is evaluating the current design.",
  STALE:
    "The design has changed since this optimisation was run. Re-test bass optimisation to update the result.",
  // A saved result that cannot support a recommendation is one to check again —
  // never a design conclusion, and never "no improvement found".
  INCOMPLETE: OPTIMISER_RETEST_MESSAGE,
  // A technical failure always names its real reason (optimiserFailureReason.js).
  // This is the honest fallback when nothing was recorded to name.
  FAILED: OPTIMISER_UNEVALUABLE_REASON,
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
    // THE FAILING RUN'S OWN REASON COMES FIRST. When a run fails, why THIS run
    // failed is what the panel states — the newest run's real reason — never an
    // earlier run's evidence, which may no longer describe anything current.
    recordedReasons: [
      ...(runStatus === "failed" && typeof runError === "string" && runError ? [runError] : []),
      ...(Array.isArray(evidence?.rejectionReasons) ? evidence.rejectionReasons : []),
    ],
    // A terminal record carrying the id and evidence contract minted at click
    // time is THIS fresh run's own result. Missing/incomplete evidence on that
    // record is a technical failure, never another legacy re-test prompt.
    currentRunRecord: !!evidence?.runId
      && evidence?.terminal === true
      && evidence?.evidenceContractVersion === planView?.planVersion,
  });
  // The button names the flow that fixes THIS state — the bass calculation when
  // the bass result is what is missing, stale or unvalidated, otherwise the
  // optimiser run itself. Nothing here sends the designer to a control that
  // cannot fix the failure.
  // THE FAILURE'S OWN OUTCOME: a bass result that is missing or stale is a
  // BASS UPDATE, a genuine technical failure is UNABLE TO EVALUATE, and any other
  // result that cannot support a recommendation is one to RE-TEST. Nothing else
  // decides the badge.
  const failureOutcome = !failure
    ? null
    : (failure.fix === OPTIMISER_FAILURE_FIX.BASS_CALCULATION
      ? OPTIMISER_OUTCOME.BASS_UPDATE_REQUIRED
      : (failure.code === OPTIMISER_FAILURE_CODE.WORKER_FAILED
        ? OPTIMISER_OUTCOME.UNABLE_TO_EVALUATE
        : OPTIMISER_OUTCOME.RETEST_NEEDED));
  const failureExtras = failure
    ? {
      message: failure.reason,
      nextAction: failure.nextAction,
      failureCode: failure.code,
      // Carried with the failure, so every branch that states it states the
      // matching badge: the outcome, its label and the action can never disagree.
      outcome: failureOutcome,
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
    const outcome = extra.outcome || OPTIMISER_OUTCOME_BY_STATE[state] || null;
    // THE BADGE IS THE OUTCOME: one label read from one value, so the pill can
    // never state something the panel's own sentence contradicts.
    const outcomeLabel = outcome ? OPTIMISER_OUTCOME_LABEL[outcome] : null;
    // Every outcome with no control of its own offers the ONE run action, worded
    // as the outcome's own next step. A mapped failure names the action that
    // actually fixes it, and that one wins.
    const retest = outcome === OPTIMISER_OUTCOME.RETEST_NEEDED
      || outcome === OPTIMISER_OUTCOME.UNABLE_TO_EVALUATE
      || outcome === OPTIMISER_OUTCOME.BASS_UPDATE_REQUIRED;
    const resolved = {
      state,
      // The outcome is what the designer reads; the state behind it stays
      // available for the surfaces that need the finer distinction.
      outcome,
      outcomeLabel,
      statusLabel: outcomeLabel || OPTIMISER_PRESENTATION_LABEL[state],
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
    // a mapped failure names the action that fixes it, and that one wins, so the
    // designer is never sent to a control that cannot resolve the state.
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
  // stays in the state and in Engineer details. Persisted failure status owns the
  // same outcome after refresh/reopen even though transient runStatus is idle.
  if (runStatus === "failed" || status === OPTIMISER_PLAN_STATUS.FAILED) {
    return build(OPTIMISER_PRESENTATION_STATE.FAILED, {
      // The mapped reason names the REAL cause. The engine's own error text is
      // never the main panel's sentence: it stays in the state (runError) and in
      // the run evidence, where Engineer details reads it.
      message: OPTIMISER_PRESENTATION_COPY.FAILED,
      action: OPTIMISER_PRESENTATION_ACTION.RERUN,
      actionLabel: OPTIMISER_PRESENTATION_ACTION.RERUN,
      showApply: false,
      ...failureExtras,
    });
  }

  // ── STALE ── the saved plan no longer belongs to this design.
  if (status === OPTIMISER_PLAN_STATUS.STALE) {
    return build(OPTIMISER_PRESENTATION_STATE.STALE, {
      // The re-test pair, the same one every re-test state states: the state asks
      // for one thing, and its one control names it. WHY this result has to be
      // checked again — which input moved — is the stale reason, and it is read in
      // Engineer details beside the old candidate's own detail.
      message: OPTIMISER_RETEST_MESSAGE,
      nextAction: OPTIMISER_RETEST_DETAIL,
      explanation: planView?.staleReason || OPTIMISER_PRESENTATION_COPY.STALE,
      action: OPTIMISER_PRESENTATION_ACTION.RERUN,
      actionLabel: OPTIMISER_PRESENTATION_ACTION.RERUN,
      showPlan: true,
      showApply: false,
    });
  }

  // ── NO_USEFUL_IMPROVEMENT ── complete evidence, every credible candidate rejected.
  if (status === OPTIMISER_PLAN_STATUS.NO_USEFUL_IMPROVEMENT) {
    // A COMPLETED search that confirmed nothing. This is the only outcome in
    // which the panel may state that no worthwhile improvement was found.
    return build(OPTIMISER_PRESENTATION_STATE.NO_USEFUL_IMPROVEMENT, {
      message: OPTIMISER_OUTCOME_COPY[OPTIMISER_OUTCOME.NO_IMPROVEMENTS].message,
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
      // A result that has to be checked again — never "no improvement found".
      message: OPTIMISER_RETEST_MESSAGE,
      nextAction: OPTIMISER_RETEST_DETAIL,
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
    // WHICH improvement: an electronic adjustment, or a physical change of seats,
    // subwoofers or layout. The badge names it; the Apply controls are the same
    // either way, and neither is ever applied by ADI on its own.
    const planOutcome = offersPhysicalChangeOnly(planView)
      ? OPTIMISER_OUTCOME.PHYSICAL_CHANGE
      : OPTIMISER_OUTCOME.IMPROVEMENTS_FOUND;
    return build(OPTIMISER_PRESENTATION_STATE.PLAN_AVAILABLE, {
      message: OPTIMISER_OUTCOME_COPY[planOutcome].message,
      nextAction: OPTIMISER_OUTCOME_COPY[planOutcome].detail,
      outcome: planOutcome,
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
      message: OPTIMISER_RETEST_MESSAGE,
      nextAction: "The evaluated result was not saved for this design, so nothing can be applied from it.",
      evidence,
      action: OPTIMISER_PRESENTATION_ACTION.RERUN,
      actionLabel: OPTIMISER_PRESENTATION_ACTION.RERUN,
      showApply: false,
      ...failureExtras,
    });
  }

  if (status === OPTIMISER_PLAN_STATUS.UNSUPPORTED) {
    return build(OPTIMISER_PRESENTATION_STATE.EVALUATION_INCOMPLETE, {
      message: OPTIMISER_RETEST_MESSAGE,
      nextAction: "The saved result predates the current evidence, so it cannot support a recommendation until it is checked again.",
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
      message: OPTIMISER_RETEST_MESSAGE,
      nextAction: "The saved result does not hold enough lever-level evidence to apply safely.",
      showPlan: true,
      // The one action that resolves this state is the re-test itself.
      action: OPTIMISER_PRESENTATION_ACTION.RETEST,
      actionLabel: OPTIMISER_RETEST_LABEL,
      showApply: false,
      ...failureExtras,
    });
  }

  // A terminal run record that is not a completed no-winner result.
  if (evidence) {
    return build(OPTIMISER_PRESENTATION_STATE.EVALUATION_INCOMPLETE, {
      message: OPTIMISER_RETEST_MESSAGE,
      nextAction: OPTIMISER_RETEST_DETAIL,
      evidence,
      action: OPTIMISER_PRESENTATION_ACTION.RERUN,
      actionLabel: OPTIMISER_PRESENTATION_ACTION.RERUN,
      showApply: false,
      ...failureExtras,
    });
  }

  // ── NO_RUN ── nothing evaluated and saved for this design.
  // With no saved result there is nothing to re-test, so the panel states the
  // one thing that stands between the design and a run: a bass result that does
  // not exist yet is stated as a bass update, with the recalculation as its ONE
  // action. Any other block carries its own message and the panel stays out of
  // the way.
  const bassUpdateOnly = failure?.fix === OPTIMISER_FAILURE_FIX.BASS_CALCULATION
    ? failureExtras
    : {};
  return build(OPTIMISER_PRESENTATION_STATE.NO_RUN, {
    action: OPTIMISER_PRESENTATION_ACTION.RUN,
    actionLabel: OPTIMISER_PRESENTATION_ACTION.RUN,
    showApply: false,
    ...bassUpdateOnly,
  });
}