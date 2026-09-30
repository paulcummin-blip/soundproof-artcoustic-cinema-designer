// resolveAdiOptimiserJourney.js
// ---------------------------------------------------------------------------
// The ADI optimiser journey — one answer to four questions:
//
//   1. What is limiting the result?
//   2. Why does it matter?
//   3. What should I do next?
//   4. Why can this not be applied yet?
//
// Four states, resolved from the SAVED Optimisation Plan (the plan status
// authority) and whether the optimiser can be run against the current design:
//
//   1. no saved plan            → Optimisation required      · Run Optimisation Plan
//   2. saved plan is stale      → Re-evaluation required     · Re-run Optimisation Plan
//   3. lever-level data missing → Evaluation incomplete      · Complete / Re-run Optimisation Plan
//   4. saved plan is current    → Optimisation plan available · (read-only plan)
//
// There is NO fifth "nothing to do" state: a card may never end at
// "Evaluation incomplete" without also stating the next action.
//
// PURE: no React, no stores, no calculation. This module changes no bass
// maths, no optimiser scoring, no P19/P20 definition, no RP22 grading, no
// graph calculation, no pricing and no reporting. It reads a plan status view
// and a run-block reason and returns copy.
// ---------------------------------------------------------------------------

import { OPTIMISER_PLAN_STATUS } from "./optimiserPlanConstants.js";

/** The four journey states. */
export const ADI_OPTIMISER_JOURNEY_STATE = Object.freeze({
  OPTIMISATION_REQUIRED: "optimisation_required",
  REEVALUATION_REQUIRED: "reevaluation_required",
  EVALUATION_INCOMPLETE: "evaluation_incomplete",
  PLAN_AVAILABLE: "plan_available",
});

/** The primary action offered for each state. */
export const ADI_OPTIMISER_ACTION = Object.freeze({
  RUN: "run",
  RERUN: "rerun",
  COMPLETE: "complete",
});

export const ADI_OPTIMISER_ACTION_LABEL = Object.freeze({
  [ADI_OPTIMISER_ACTION.RUN]: "Run Optimisation Plan",
  [ADI_OPTIMISER_ACTION.RERUN]: "Re-run Optimisation Plan",
  [ADI_OPTIMISER_ACTION.COMPLETE]: "Complete Optimisation Plan",
});

export const ADI_OPTIMISER_STATUS_LABEL = Object.freeze({
  [ADI_OPTIMISER_JOURNEY_STATE.OPTIMISATION_REQUIRED]: "Optimisation required",
  [ADI_OPTIMISER_JOURNEY_STATE.REEVALUATION_REQUIRED]: "Re-evaluation required",
  [ADI_OPTIMISER_JOURNEY_STATE.EVALUATION_INCOMPLETE]: "Evaluation incomplete",
  [ADI_OPTIMISER_JOURNEY_STATE.PLAN_AVAILABLE]: "Optimisation plan available",
});

/** Canonical journey copy. Plain professional language, every line actionable. */
export const ADI_OPTIMISER_COPY = Object.freeze({
  NO_PLAN:
    "No evaluated optimiser plan is saved for this design yet.",
  STALE:
    "The saved optimiser plan belongs to an earlier design state. Re-run the optimiser before applying any changes.",
  LEVER_DATA:
    "The optimiser has identified the limiting issue, but the saved evidence does not yet contain enough lever-level data to apply changes safely.",
  PLAN_AVAILABLE:
    "Sound Proof has evaluated the available improvement options for this design.",
  RUN_EXPLANATION:
    "This will test delay, gain, polarity and placement options against the current design and show the predicted P20 benefit, P19 effect and any output/headroom trade-off.",
  LEVER_EXPLANATION:
    "Sound Proof will evaluate each lever from the current design so it can separate individual effects from combined effects.",
  ELECTRONIC_FIRST:
    "Sound Proof will test electronic changes first because they are lower disruption than moving subwoofers or seats.",
  PHYSICAL_LAST:
    "Physical movement is only recommended when electronic changes cannot solve the seat-to-seat problem.",
  WILL_EVALUATE: "Will evaluate: delay · gain · polarity · placement",
  WILL_COMPARE:
    "Will compare: individual lever benefit · combined benefit · P19 impact · output/headroom trade-off · worst seat and limiting frequency",
});

/**
 * Why the optimiser cannot run right now. Every code maps to a stated next
 * step — a blocked journey is never a dead end.
 */
export const OPTIMISER_PLAN_RUN_BLOCK = Object.freeze({
  MISSING_REQUIRED_DATA: "missing_required_data",
  TARGET_NOT_SELECTED: "target_not_selected",
  DESIGN_STALE: "design_stale",
  CALCULATION_IN_PROGRESS: "calculation_in_progress",
  WORKER_FAILED: "worker_failed",
  CALCULATION_REQUIRED: "calculation_required",
  NO_VALID_BASS_RESULT: "no_valid_bass_result",
});

export const OPTIMISER_PLAN_RUN_BLOCK_MESSAGE = Object.freeze({
  [OPTIMISER_PLAN_RUN_BLOCK.MISSING_REQUIRED_DATA]:
    "A subwoofer model and quantity are required before the optimiser can run. Choose the subwoofer system in the Room Designer.",
  [OPTIMISER_PLAN_RUN_BLOCK.TARGET_NOT_SELECTED]:
    "No bass target has been selected for this design. Select the bass target, then run the Optimisation Plan.",
  [OPTIMISER_PLAN_RUN_BLOCK.DESIGN_STALE]:
    "This design has changed since the bass result was published. Update Bass Performance, then run the Optimisation Plan.",
  [OPTIMISER_PLAN_RUN_BLOCK.CALCULATION_IN_PROGRESS]:
    "A bass calculation is already running. The Optimisation Plan can run as soon as it finishes.",
  [OPTIMISER_PLAN_RUN_BLOCK.WORKER_FAILED]:
    "The last bass calculation did not complete. Retry Calculate Performance, then run the Optimisation Plan.",
  [OPTIMISER_PLAN_RUN_BLOCK.CALCULATION_REQUIRED]:
    "This design has no current bass result. Calculate Performance, then run the Optimisation Plan.",
  [OPTIMISER_PLAN_RUN_BLOCK.NO_VALID_BASS_RESULT]:
    "No valid bass result is available for this design. Calculate Performance, then run the Optimisation Plan.",
});

/** First sentence of a diagnosis line — e.g. "Seat-to-seat consistency is the limiting factor." */
export function firstSentence(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^[^.]+\./);
  return match ? match[0].trim() : trimmed;
}

/**
 * Is the saved plan's lever-level evidence complete enough to apply safely?
 * A current plan is only actionable when its individual lever effects were
 * actually evaluated — a plan holding combined-only evidence is incomplete.
 */
export function isLeverLevelComplete(planView) {
  if (!planView || planView.status !== OPTIMISER_PLAN_STATUS.CURRENT) return false;
  if (planView.individualEffectsEvaluated !== true) return false;
  const levers = Array.isArray(planView.levers) ? planView.levers : [];
  if (!levers.length) return false;
  return levers.every((lever) => lever.evaluated === true && lever.notEvaluated !== true && !!lever.effect);
}

/**
 * Resolve why the optimiser cannot run against the current design.
 *
 * @returns {null|{ code: string, message: string }} null when it can run.
 */
export function resolveOptimisationPlanRunBlock({
  hasActiveSubModel = false,
  hasCanonicalInstances = false,
  targetSelected = true,
  authorityStatus = null,
  needsRecalculation = false,
  calculationInProgress = false,
  lastOutcome = null,
  errorMessage = null,
  canCalculate = false,
  hasCurrentResult = false,
} = {}) {
  const block = (code, override = null) => ({
    code,
    message: override || OPTIMISER_PLAN_RUN_BLOCK_MESSAGE[code],
  });

  if (!hasActiveSubModel || !hasCanonicalInstances) {
    return block(OPTIMISER_PLAN_RUN_BLOCK.MISSING_REQUIRED_DATA);
  }
  if (!targetSelected) {
    return block(OPTIMISER_PLAN_RUN_BLOCK.TARGET_NOT_SELECTED);
  }
  if (needsRecalculation || String(authorityStatus || "") === "STALE") {
    return block(OPTIMISER_PLAN_RUN_BLOCK.DESIGN_STALE);
  }
  if (calculationInProgress) {
    return block(OPTIMISER_PLAN_RUN_BLOCK.CALCULATION_IN_PROGRESS);
  }
  if (["error", "timeout", "rejected"].includes(String(lastOutcome || ""))) {
    return block(OPTIMISER_PLAN_RUN_BLOCK.WORKER_FAILED, errorMessage
      ? `${OPTIMISER_PLAN_RUN_BLOCK_MESSAGE[OPTIMISER_PLAN_RUN_BLOCK.WORKER_FAILED]} (${errorMessage})`
      : null);
  }
  if (hasCurrentResult || canCalculate) return null;
  return block(OPTIMISER_PLAN_RUN_BLOCK.CALCULATION_REQUIRED);
}

/**
 * Resolve the journey state and its copy.
 *
 * @param {object} params
 * @param {object|null} params.planView - resolved plan status view
 * @param {string|null} params.limitingFactorSentence - "…is the limiting factor."
 * @param {object|null} params.blockReason - from resolveOptimisationPlanRunBlock
 * @returns {object} journey state, copy and the primary action
 */
export function resolveAdiOptimiserJourney({
  planView = null,
  limitingFactorSentence = null,
  blockReason = null,
} = {}) {
  const status = planView?.status || null;
  const lead = limitingFactorSentence ? `${limitingFactorSentence} ` : "";
  const canRun = !blockReason;
  const withLead = (text) => `${lead}${text}`.trim();

  const build = (state, { message, explanation, notes = [], action = null, showPlan = false }) => ({
    state,
    statusLabel: ADI_OPTIMISER_STATUS_LABEL[state],
    message,
    explanation,
    notes,
    action,
    actionLabel: action ? ADI_OPTIMISER_ACTION_LABEL[action] : null,
    showPlan,
    canRun,
    blockReason,
    limitingFactorSentence,
  });

  // ── 4. A current plan with complete lever-level evidence ──
  if (status === OPTIMISER_PLAN_STATUS.CURRENT && isLeverLevelComplete(planView)) {
    return build(ADI_OPTIMISER_JOURNEY_STATE.PLAN_AVAILABLE, {
      message: ADI_OPTIMISER_COPY.PLAN_AVAILABLE,
      explanation: null,
      showPlan: true,
    });
  }

  // ── 3. Evidence exists but lever-level data is not sufficient ──
  // Covers both an unreadable (unsupported schema) plan and a current plan
  // whose individual lever effects were never evaluated.
  if (status === OPTIMISER_PLAN_STATUS.UNSUPPORTED
    || (status === OPTIMISER_PLAN_STATUS.CURRENT && !isLeverLevelComplete(planView))) {
    const action = status === OPTIMISER_PLAN_STATUS.CURRENT
      ? ADI_OPTIMISER_ACTION.COMPLETE
      : ADI_OPTIMISER_ACTION.RERUN;
    return build(ADI_OPTIMISER_JOURNEY_STATE.EVALUATION_INCOMPLETE, {
      message: ADI_OPTIMISER_COPY.LEVER_DATA,
      explanation: ADI_OPTIMISER_COPY.LEVER_EXPLANATION,
      notes: [ADI_OPTIMISER_COPY.WILL_EVALUATE, ADI_OPTIMISER_COPY.ELECTRONIC_FIRST],
      action,
    });
  }

  // ── 2. A saved plan that belongs to an earlier design state ──
  if (status === OPTIMISER_PLAN_STATUS.STALE) {
    return build(ADI_OPTIMISER_JOURNEY_STATE.REEVALUATION_REQUIRED, {
      message: withLead(ADI_OPTIMISER_COPY.STALE),
      explanation: ADI_OPTIMISER_COPY.RUN_EXPLANATION,
      notes: [ADI_OPTIMISER_COPY.WILL_EVALUATE, ADI_OPTIMISER_COPY.WILL_COMPARE],
      action: ADI_OPTIMISER_ACTION.RERUN,
    });
  }

  // ── 1. No evaluated optimiser plan saved for this design ──
  return build(ADI_OPTIMISER_JOURNEY_STATE.OPTIMISATION_REQUIRED, {
    message: withLead(ADI_OPTIMISER_COPY.NO_PLAN),
    explanation: ADI_OPTIMISER_COPY.RUN_EXPLANATION,
    notes: [
      ADI_OPTIMISER_COPY.WILL_EVALUATE,
      ADI_OPTIMISER_COPY.WILL_COMPARE,
      ADI_OPTIMISER_COPY.ELECTRONIC_FIRST,
      ADI_OPTIMISER_COPY.PHYSICAL_LAST,
    ],
    action: ADI_OPTIMISER_ACTION.RUN,
  });
}