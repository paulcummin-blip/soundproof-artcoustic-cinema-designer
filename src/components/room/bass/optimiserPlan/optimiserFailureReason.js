// optimiserFailureReason.js
// ---------------------------------------------------------------------------
// WHY ADI COULD NOT COMPLETE — the same reason, in the designer's words.
//
// One pure mapping from the facts the optimiser already resolved (the run-block
// code, the recorded baseline / evidence diagnosis, the run status and the saved
// terminal outcome) to the three things the main panel must state:
//
//   • WHAT failed      — the reason sentence
//   • WHAT TO DO NEXT  — the action sentence, beside the reason in the main
//                        panel, never only inside Engineer details
//   • the ONE button   — worded and routed to the action that actually fixes
//                        THIS state, never a control that cannot fix it
//
// A run blocked on something the panel already explains elsewhere (no subwoofer
// chosen, no target selected, a calculation already running) maps to nothing:
// those blocks carry their own message and the mapper stays out of the way.
//
// The engine's own words ("baseline_validation_failed", "candidate id not
// recorded", "worker failed") are NOT written here and are NOT replaced: they
// stay in the run evidence, where Engineer details reads them.
//
// PURE: no React, no stores, no calculation. It changes no bass maths, no
// optimiser search, no P19/P20 scoring and no RP22 threshold.
// ---------------------------------------------------------------------------

import { OPTIMISER_TERMINAL_OUTCOME } from "./optimiserPlanConstants.js";
import { OPTIMISER_PLAN_RUN_BLOCK } from "./resolveAdiOptimiserJourney.js";

/** The five reasons a run can fail to complete. */
export const OPTIMISER_FAILURE_CODE = Object.freeze({
  BASELINE_NOT_VALIDATED: "baseline_not_validated",
  BASS_NOT_CALCULATED: "bass_not_calculated",
  BASS_STALE: "bass_stale",
  WORKER_FAILED: "worker_failed",
  EVIDENCE_MISSING: "evidence_missing",
});

/** Which flow the one button runs: the bass calculation, or the optimiser. */
export const OPTIMISER_FAILURE_FIX = Object.freeze({
  BASS_CALCULATION: "bass_calculation",
  OPTIMISER_RUN: "optimiser_run",
});

/** One entry per reason: the panel's reason, its next step and its one button. */
export const OPTIMISER_FAILURE_COPY = Object.freeze({
  [OPTIMISER_FAILURE_CODE.BASELINE_NOT_VALIDATED]: {
    reason: "ADI could not complete the optimisation because the current bass result could not be validated.",
    nextAction: "Recalculate Bass Performance, then run Bass Optimiser again.",
    actionLabel: "Recalculate Bass Performance",
    fix: OPTIMISER_FAILURE_FIX.BASS_CALCULATION,
  },
  [OPTIMISER_FAILURE_CODE.BASS_NOT_CALCULATED]: {
    reason: "ADI could not complete the optimisation because current bass performance has not been calculated.",
    nextAction: "Calculate Bass Performance.",
    actionLabel: "Calculate Bass Performance",
    fix: OPTIMISER_FAILURE_FIX.BASS_CALCULATION,
  },
  [OPTIMISER_FAILURE_CODE.BASS_STALE]: {
    reason: "ADI could not complete the optimisation because the room or subwoofer setup has changed since bass performance was calculated.",
    nextAction: "Update Bass Performance.",
    actionLabel: "Update Bass Performance",
    fix: OPTIMISER_FAILURE_FIX.BASS_CALCULATION,
  },
  [OPTIMISER_FAILURE_CODE.WORKER_FAILED]: {
    reason: "ADI could not complete the optimisation run.",
    nextAction: "Try again. If it repeats, check Engineer Details.",
    actionLabel: "Re-test Bass Optimisation",
    fix: OPTIMISER_FAILURE_FIX.OPTIMISER_RUN,
  },
  [OPTIMISER_FAILURE_CODE.EVIDENCE_MISSING]: {
    reason: "ADI could not complete the optimisation because the previous run did not retain enough evidence to explain the result.",
    nextAction: "Re-test Bass Optimisation.",
    actionLabel: "Re-test Bass Optimisation",
    fix: OPTIMISER_FAILURE_FIX.OPTIMISER_RUN,
  },
});

/** The run-block codes that stop a run on the bass result itself. */
const BLOCK_REASON = Object.freeze({
  [OPTIMISER_PLAN_RUN_BLOCK.NO_VALID_BASS_RESULT]: OPTIMISER_FAILURE_CODE.BASELINE_NOT_VALIDATED,
  [OPTIMISER_PLAN_RUN_BLOCK.CALCULATION_REQUIRED]: OPTIMISER_FAILURE_CODE.BASS_NOT_CALCULATED,
  [OPTIMISER_PLAN_RUN_BLOCK.DESIGN_STALE]: OPTIMISER_FAILURE_CODE.BASS_STALE,
});

/** Blocks the panel already states with their own message and next step. */
const BLOCK_HANDLED_ELSEWHERE = Object.freeze([
  OPTIMISER_PLAN_RUN_BLOCK.MISSING_REQUIRED_DATA,
  OPTIMISER_PLAN_RUN_BLOCK.TARGET_NOT_SELECTED,
  OPTIMISER_PLAN_RUN_BLOCK.CALCULATION_IN_PROGRESS,
]);

/** Any recorded word for a baseline that could not be validated. */
const BASELINE_WORDS = /baseline|validat/i;

/**
 * Which of the five reasons applies.
 *
 * A bass result that is missing, stale or unvalidated is decided FIRST: it is
 * the present blocker, and the run cannot succeed until it is fixed — so the
 * button must be the calculation, even when a previous run also failed.
 */
export function resolveOptimiserFailureCode({
  runStatus = "idle",
  terminalOutcome = null,
  runBlockCode = null,
  baselineInvalid = false,
  recordedReasons = [],
} = {}) {
  if (runBlockCode && BLOCK_HANDLED_ELSEWHERE.includes(runBlockCode)) return null;
  if (runBlockCode && BLOCK_REASON[runBlockCode]) return BLOCK_REASON[runBlockCode];
  if (runBlockCode === OPTIMISER_PLAN_RUN_BLOCK.WORKER_FAILED) return OPTIMISER_FAILURE_CODE.WORKER_FAILED;
  if (runStatus === "failed" || terminalOutcome === OPTIMISER_TERMINAL_OUTCOME.FAILED) {
    return OPTIMISER_FAILURE_CODE.WORKER_FAILED;
  }
  if (baselineInvalid) return OPTIMISER_FAILURE_CODE.BASELINE_NOT_VALIDATED;
  if (Array.isArray(recordedReasons)
    && recordedReasons.some((reason) => BASELINE_WORDS.test(String(reason || "")))) {
    return OPTIMISER_FAILURE_CODE.BASELINE_NOT_VALIDATED;
  }
  return OPTIMISER_FAILURE_CODE.EVIDENCE_MISSING;
}

/**
 * Resolve the failure, or null when the state is not a mapped failure.
 *
 * @returns {null|{code:string, reason:string, nextAction:string, actionLabel:string, fix:string}}
 */
export function resolveOptimiserFailure(input = {}) {
  const code = resolveOptimiserFailureCode(input);
  if (!code) return null;
  return { code, ...OPTIMISER_FAILURE_COPY[code] };
}