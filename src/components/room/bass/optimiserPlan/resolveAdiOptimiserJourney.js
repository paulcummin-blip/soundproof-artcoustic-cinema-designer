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
//   1. no saved plan            → Optimisation required      · Bass Optimiser
//   2. saved plan is stale      → Re-evaluation required     · Bass Optimiser
//   3. lever-level data missing → Evaluation incomplete      · Bass Optimiser
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
import {
  BASELINE_PARITY_COPY,
  BASELINE_PARITY_STATUS,
} from "./optimiserBaselineAuthority.js";

/** The four journey states. */
export const ADI_OPTIMISER_JOURNEY_STATE = Object.freeze({
  OPTIMISATION_REQUIRED: "optimisation_required",
  REEVALUATION_REQUIRED: "reevaluation_required",
  EVALUATION_INCOMPLETE: "evaluation_incomplete",
  PLAN_AVAILABLE: "plan_available",
  /** Evaluation finished, evidence is complete, no candidate was worth applying. */
  NO_USEFUL_IMPROVEMENT: "no_useful_improvement",
  /** No completed production authority exists for the live design. */
  BASELINE_REQUIRED: "baseline_required",
  /** The optimiser baseline does not match the published bass result. */
  BASELINE_MISMATCH: "baseline_mismatch",
  /** The run itself failed. A technical failure, never a design statement. */
  FAILED: "failed",
});

/** The primary action offered for each state. */
export const ADI_OPTIMISER_ACTION = Object.freeze({
  RUN: "run",
  RERUN: "rerun",
  COMPLETE: "complete",
  /** The current bass calculation must be produced before ADI can run. */
  CALCULATE: "calculate",
});

/**
 * The ONE feature name for the optimiser action, wherever it appears — the
 * primary button before a run, during a run, after a stale result, after a
 * failed run and after an incomplete evaluation.
 *
 * The state is carried by the status pill, the spinner and the surrounding
 * copy, never by the button's wording: the same action always reads the same.
 * The panel title stays "Bass Optimisation — Powered by ADI".
 */
export const ADI_BASS_OPTIMISER_LABEL = "Bass Optimiser";

export const ADI_OPTIMISER_ACTION_LABEL = Object.freeze({
  // ONE wording, everywhere: this is the same action in every state, so the
  // button says the same thing in every state. There is never a second re-run
  // button and never a "Re-run to apply". CALCULATE is a different action —
  // the bass calculation itself — so it keeps its own wording.
  [ADI_OPTIMISER_ACTION.RUN]: ADI_BASS_OPTIMISER_LABEL,
  [ADI_OPTIMISER_ACTION.RERUN]: ADI_BASS_OPTIMISER_LABEL,
  [ADI_OPTIMISER_ACTION.COMPLETE]: ADI_BASS_OPTIMISER_LABEL,
  [ADI_OPTIMISER_ACTION.CALCULATE]: BASELINE_PARITY_COPY.CTA,
});

export const ADI_OPTIMISER_STATUS_LABEL = Object.freeze({
  [ADI_OPTIMISER_JOURNEY_STATE.OPTIMISATION_REQUIRED]: "Optimisation required",
  [ADI_OPTIMISER_JOURNEY_STATE.REEVALUATION_REQUIRED]: "Re-evaluation required",
  [ADI_OPTIMISER_JOURNEY_STATE.EVALUATION_INCOMPLETE]: "Evaluation incomplete",
  [ADI_OPTIMISER_JOURNEY_STATE.PLAN_AVAILABLE]: "Optimisation plan available",
  [ADI_OPTIMISER_JOURNEY_STATE.NO_USEFUL_IMPROVEMENT]: "No useful improvement found",
  [ADI_OPTIMISER_JOURNEY_STATE.BASELINE_REQUIRED]: BASELINE_PARITY_COPY.MISSING_STATUS,
  [ADI_OPTIMISER_JOURNEY_STATE.BASELINE_MISMATCH]: BASELINE_PARITY_COPY.MISMATCH_STATUS,
  [ADI_OPTIMISER_JOURNEY_STATE.FAILED]: "Optimisation failed",
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
    "ADI analyses the current subwoofer system to find practical ways to improve bass consistency across the seats. "
    + "It checks electronic adjustments first — delay, gain, phase and polarity — because these can often improve "
    + "the result without moving equipment. If electronic changes are not enough, ADI then assesses physical "
    + "options such as subwoofer placement, alternative layouts, different subwoofer capability, and seating changes.",
  LEVER_EXPLANATION:
    "Sound Proof will evaluate each lever from the current design so it can separate individual effects from combined effects.",
  ELECTRONIC_FIRST:
    "Sound Proof will test electronic changes first because they are lower disruption than moving subwoofers or seats.",
  PHYSICAL_LAST:
    "Physical movement is only recommended when electronic changes cannot solve the seat-to-seat problem.",
  /**
   * Long-form technical statements, retained as the technical detail that sits
   * behind the pre-run disclosure. They are never rendered in the default
   * pre-run card, which carries the count and the short summary only.
   */
  SYSTEMATIC_NOTE:
    "This is the kind of systematic optimisation that is difficult to do manually. ADI compares the options "
    + "against the current design and looks for improvements to P20 seat-to-seat consistency while protecting "
    + "P19 reference-seat smoothness, LFE output capability and available headroom.",
  /** 80–150 Hz is inside the crossover region, not outside bass optimisation. */
  PHASE_BAND_NOTE:
    "Problems between 80 Hz and 150 Hz sit inside the crossover region, so they are treated as part of bass "
    + "optimisation rather than as something placement alone has to solve.",
  WILL_EVALUATE:
    "Levers are checked least intrusive first: delay · gain · phase/crossover-region alignment · polarity · "
    + "placement · alternative layouts · subwoofer option · seating.",
  WILL_COMPARE:
    "Will compare: individual lever benefit · combined benefit · P19 impact · output/headroom trade-off · worst seat and limiting frequency",
  /** The short pre-run summary shown under the calculation count. */
  PRE_RUN_SUMMARY:
    "It checks delay, gain, phase and polarity before suggesting physical changes such as moving "
    + "subwoofers or seats.",
  /** The collapsed disclosure's title. */
  DISCLOSURE_TITLE: "What ADI will test",
  /** Label above the per-family estimate inside the disclosure. */
  DISCLOSURE_ESTIMATE_LABEL: "Estimated calculations:",
  /** Label above the acoustic calculation basis inside the disclosure. */
  DISCLOSURE_ACOUSTIC_LABEL: "Acoustic calculation basis:",
  /** What ADI compares every option against, stated inside the disclosure. */
  DISCLOSURE_COMPARISON:
    "ADI compares each option against the current design, looking for P20 improvement while protecting "
    + "P19, LFE output and headroom.",
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
    "Calculation required before optimisation. Calculate Performance, then run the Optimisation Plan.",
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
  // A current result is usable, and so is a design the engine can still
  // calculate (the run calculates it first). The one case with no usable bass
  // evidence to optimise is a result that exists but is not a valid authority
  // and cannot be recalculated.
  const invalidResult = authorityStatus === "NOT_VERIFIED" || authorityStatus === "LIMITED";
  if (hasCurrentResult || canCalculate) {
    if (invalidResult && !canCalculate) {
      return block(OPTIMISER_PLAN_RUN_BLOCK.NO_VALID_BASS_RESULT);
    }
    return null;
  }
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

  const build = (state, { message, explanation, notes = [], action = null, showPlan = false, canRunOverride = null }) => ({
    state,
    statusLabel: ADI_OPTIMISER_STATUS_LABEL[state],
    message,
    explanation,
    notes,
    action,
    actionLabel: action ? ADI_OPTIMISER_ACTION_LABEL[action] : null,
    showPlan,
    canRun: canRunOverride == null ? canRun : canRunOverride,
    blockReason,
    limitingFactorSentence,
  });

  // ── 0. The baseline must BE the published bass result ──
  // The optimiser compares every option against the published current result.
  // Without a completed authority — or with one that does not match the live
  // design — optimisation does not run: the card states the status, the reason
  // and the ONE action that fixes it. No baseline, no comparison, no Apply.
  const parity = planView?.baselineParity || null;
  if (parity?.status === BASELINE_PARITY_STATUS.MISSING
    || parity?.status === BASELINE_PARITY_STATUS.MISMATCH) {
    const missing = parity.status === BASELINE_PARITY_STATUS.MISSING;
    return build(
      missing ? ADI_OPTIMISER_JOURNEY_STATE.BASELINE_REQUIRED : ADI_OPTIMISER_JOURNEY_STATE.BASELINE_MISMATCH,
      {
        message: missing ? BASELINE_PARITY_COPY.MISSING_MESSAGE : BASELINE_PARITY_COPY.MISMATCH_MESSAGE,
        explanation: "The optimiser compares every option against the published bass result, so it needs that result before it can evaluate this design.",
        notes: [],
        action: ADI_OPTIMISER_ACTION.CALCULATE,
        showPlan: false,
        // The required action is the calculation itself — it is never hidden by
        // another run block.
        canRunOverride: true,
      },
    );
  }

  // A result saved before parity was recorded cannot be applied from: it has to
  // be re-run from the completed production authority first.
  if (parity?.status === BASELINE_PARITY_STATUS.UNKNOWN) {
    return build(ADI_OPTIMISER_JOURNEY_STATE.REEVALUATION_REQUIRED, {
      message: BASELINE_PARITY_COPY.UNKNOWN_MESSAGE,
      explanation: null,
      notes: [],
      action: ADI_OPTIMISER_ACTION.RERUN,
    });
  }

  // ── 4. A current plan with complete lever-level evidence ──
  if (status === OPTIMISER_PLAN_STATUS.CURRENT && isLeverLevelComplete(planView)) {
    return build(ADI_OPTIMISER_JOURNEY_STATE.PLAN_AVAILABLE, {
      // ADI guidance leads here too: the diagnosis first, then the evidence.
      message: withLead(ADI_OPTIMISER_COPY.PLAN_AVAILABLE),
      explanation: null,
      showPlan: true,
      // A completed run keeps its ONE run control. The designer can always
      // evaluate the design again — the button is never hidden after a result,
      // and it is never duplicated.
      action: ADI_OPTIMISER_ACTION.RERUN,
    });
  }

  // ── 4b. Evaluation finished with no candidate worth applying ──
  // Complete, trustworthy evidence: the best attempted result is stated as
  // rejected evidence. Nothing is offered for application.
  if (status === OPTIMISER_PLAN_STATUS.NO_USEFUL_IMPROVEMENT) {
    return build(ADI_OPTIMISER_JOURNEY_STATE.NO_USEFUL_IMPROVEMENT, {
      message: withLead("The optimiser completed its search without confirming a candidate worth applying."),
      explanation: "Nothing is offered for application. The evidence below is what the run evaluated.",
      action: ADI_OPTIMISER_ACTION.RERUN,
      showPlan: false,
    });
  }

  // ── 4c. The run failed ──
  if (status === OPTIMISER_PLAN_STATUS.FAILED) {
    return build(ADI_OPTIMISER_JOURNEY_STATE.FAILED, {
      message: withLead("The optimiser run did not complete."),
      explanation: ADI_OPTIMISER_COPY.RUN_EXPLANATION,
      action: ADI_OPTIMISER_ACTION.RERUN,
      showPlan: false,
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
      // ADI guidance leads every state: the diagnosis comes first, then what is
      // still incomplete.
      message: withLead(ADI_OPTIMISER_COPY.LEVER_DATA),
      explanation: ADI_OPTIMISER_COPY.LEVER_EXPLANATION,
      notes: [ADI_OPTIMISER_COPY.WILL_EVALUATE, ADI_OPTIMISER_COPY.ELECTRONIC_FIRST],
      action,
      // A CURRENT plan is shown even while its lever-level evidence is being
      // completed: running the optimiser must always leave visible, evaluated
      // evidence on the card rather than an unexplained "incomplete".
      showPlan: status === OPTIMISER_PLAN_STATUS.CURRENT,
    });
  }

  // ── 2. A saved plan that belongs to an earlier design state ──
  if (status === OPTIMISER_PLAN_STATUS.STALE) {
    return build(ADI_OPTIMISER_JOURNEY_STATE.REEVALUATION_REQUIRED, {
      message: withLead(ADI_OPTIMISER_COPY.STALE),
      // The pre-run card stays short and confident: the count and the
      // electronic-first summary carry it, and the technical detail lives
      // behind the disclosure.
      explanation: null,
      notes: [],
      action: ADI_OPTIMISER_ACTION.RERUN,
    });
  }

  // ── 1. No evaluated optimiser plan saved for this design ──
  return build(ADI_OPTIMISER_JOURNEY_STATE.OPTIMISATION_REQUIRED, {
    message: withLead(ADI_OPTIMISER_COPY.NO_PLAN),
    // Short and confident: the visible card is the count, the electronic-first
    // summary and the button. Every technical detail is behind the disclosure.
    explanation: null,
    notes: [],
    action: ADI_OPTIMISER_ACTION.RUN,
  });
}