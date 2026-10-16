// adiRerunAgainAuthority.js
// ---------------------------------------------------------------------------
// RUN ADI AGAIN — the deliberate re-run of a COMPLETED evaluation.
//
// A finished run is not the end of the conversation. The designer may want to
// verify a result, repeat a test, check their confidence in it, validate the
// run history or measure the run again — and that must be possible WITHOUT
// changing the design first. The optimiser evaluates whatever is current, so a
// re-run needs no edit and, when the design's bass result is already current
// and its fingerprint is unchanged, no bass recalculation either.
//
// ONE RULE, in two halves — the wording follows the STATE CLASS, never the
// individual outcome:
//
//   a COMPLETED evaluation — improvement found or applied, a trade-off found,
//   the trade-off kept, a physical change recommended, no improvement found —
//   offers RUN ADI AGAIN
//
//   a FAILED or INCOMPLETE evaluation keeps its OWN wording — RETRY ADI,
//   RE-TEST BASS OPTIMISATION, or the bass recalculation when that is what is
//   missing — because there the run did not complete, and finishing it is the
//   next step. This authority never replaces those.
//
// It is never the primary action. Where a decision exists — an improvement to
// apply, a trade-off to review, a measurement to keep — that decision owns the
// primary and this is a quiet control beside it. It is also never a SECOND run
// control: where the card's own run control (or the placement panel) already
// states the same action, this one is not drawn at all, and while a run is in
// flight it is not drawn either, so an overlapping run can never be started.
//
// PRESENTATION ONLY. It changes no optimiser maths, no search range, no
// candidate ranking, no P19/P20 value, no materiality rule, no publication
// logic, no result authority, no report readiness and no panel hierarchy. It
// decides one thing: whether the completed evaluation may be run again, and
// what that control says.
// ---------------------------------------------------------------------------

import { OPTIMISER_OUTCOME } from "./resolveOptimiserPresentationState.js";
import { ADI_OPTIMISER_JOURNEY_STATE } from "./resolveAdiOptimiserJourney.js";

/** The one wording of the deliberate re-run of a completed evaluation. */
export const ADI_RERUN_AGAIN_LABEL = "RUN ADI AGAIN";

/**
 * What the control does, in one line. Shown as the control's own tooltip so the
 * quiet action states its scope without adding a line to the decision.
 */
export const ADI_RERUN_AGAIN_HELPER =
  "Runs ADI again on the current design and its current bass result. Nothing is changed.";

/** Stated when the control cannot be offered because a run is already in flight. */
export const ADI_RERUN_AGAIN_RUNNING_REASON = "ADI is already running.";

/**
 * The COMPLETED outcomes — the ones whose evaluation finished and whose result
 * is trustworthy. Read lazily, inside the functions below: this module and the
 * presentation authority import each other, and a frozen list built at module
 * load could then read an enum that is not initialised yet.
 */
let completedOutcomes = null;
function completedOutcomeSet() {
  if (!completedOutcomes) {
    completedOutcomes = new Set([
      OPTIMISER_OUTCOME.IMPROVEMENTS_FOUND,
      OPTIMISER_OUTCOME.PHYSICAL_CHANGE,
      OPTIMISER_OUTCOME.TRADE_OFF,
      OPTIMISER_OUTCOME.NO_IMPROVEMENTS,
    ]);
  }
  return completedOutcomes;
}

/** The journey states that ARE a completed evaluation (no presentation supplied). */
let completedJourneyStates = null;
function completedJourneyStateSet() {
  if (!completedJourneyStates) {
    completedJourneyStates = new Set([
      ADI_OPTIMISER_JOURNEY_STATE.PLAN_AVAILABLE,
      ADI_OPTIMISER_JOURNEY_STATE.NO_USEFUL_IMPROVEMENT,
    ]);
  }
  return completedJourneyStates;
}

/**
 * Did this outcome's evaluation COMPLETE with a trustworthy result?
 *
 * @param {string|null} outcome - one OPTIMISER_OUTCOME value
 * @returns {boolean}
 */
export function isCompletedEvaluationOutcome(outcome) {
  return Boolean(outcome) && completedOutcomeSet().has(outcome);
}

/**
 * Is this journey state a completed evaluation? Used only when no presentation
 * authority was supplied; when one was, its outcome is the authority.
 *
 * @param {string|null} journeyStateKey
 * @returns {boolean}
 */
export function isCompletedEvaluationJourneyState(journeyStateKey) {
  return Boolean(journeyStateKey) && completedJourneyStateSet().has(journeyStateKey);
}

/**
 * Resolve the deliberate re-run for the state on screen.
 *
 * @param {object} params
 * @param {string|null} [params.outcome] - the resolved OPTIMISER_OUTCOME
 * @param {string|null} [params.journeyStateKey] - the resolved journey state
 * @param {boolean} [params.running] - a run is in flight right now
 * @param {boolean} [params.canRun] - the state's own run eligibility
 * @param {string|null} [params.blockedReason] - why the optimiser cannot run yet
 * @returns {{ offered:boolean, available:boolean, label:string|null, helper:string|null,
 *   disabledReason:string|null }}
 */
export function resolveAdiRerunAgain({
  outcome = null,
  journeyStateKey = null,
  running = false,
  canRun = true,
  blockedReason = null,
} = {}) {
  const completed = isCompletedEvaluationOutcome(outcome)
    || (!outcome && isCompletedEvaluationJourneyState(journeyStateKey));

  if (!completed) {
    return { offered: false, available: false, label: null, helper: null, disabledReason: null };
  }

  const blocked = typeof blockedReason === "string" && blockedReason.length > 0 ? blockedReason : null;
  const disabledReason = running
    ? ADI_RERUN_AGAIN_RUNNING_REASON
    : (blocked || (canRun === false ? "ADI cannot run on this design yet." : null));

  return {
    offered: true,
    // Offered is not the same as pressable: a run in flight, a blocked design or
    // a state that cannot run at all still SHOWS the control as unavailable
    // rather than pretending the action does not exist.
    available: !running && !blocked && canRun !== false,
    label: ADI_RERUN_AGAIN_LABEL,
    helper: ADI_RERUN_AGAIN_HELPER,
    disabledReason,
  };
}