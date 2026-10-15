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

/**
 * THE RE-TEST STATEMENT, in the designer's words: the main line, and the
 * sentence stated beside it. One source, so the panel states the same pair
 * whether the incomplete result came from a saved record, an unsupported record
 * or a run that kept no usable evidence.
 */
export const OPTIMISER_RETEST_MESSAGE =
  "The previous optimiser result needs to be checked again against the current design.";
export const OPTIMISER_RETEST_DETAIL =
  "The saved run does not contain enough evidence to confirm its recommendation.";

/**
 * THE REAL REASON an evaluation could not run, read from the facts the run
 * itself recorded. The engine's own words stay in the run evidence, where
 * Engineer details reads them; the panel names the missing input in the
 * designer's language. Nothing is invented: an unrecognised failure states the
 * honest fallback rather than a guessed cause.
 */
export const OPTIMISER_UNEVALUABLE_REASON =
  "The optimisation did not finish, so no result could be confirmed.";

const UNEVALUABLE_REASONS = Object.freeze([
  { test: /seat|listening position|response curve|per-seat/i, reason: "Required seat-response data is missing." },
  { test: /subwoofer configuration|subwoofer|instance/i, reason: "The current subwoofer configuration could not be evaluated." },
  { test: /band|response|spectrum|spl|frequency/i, reason: "Bass response data is incomplete." },
]);

/** One entry per reason: the panel's reason, its next step and its one button. */
export const OPTIMISER_FAILURE_COPY = Object.freeze({
  /**
   * The bass result itself is the missing or stale input. The reason names it,
   * and the ONE button is the recalculation — recalculating is what lifts the
   * block, so the designer is never sent to a control that cannot fix it.
   */
  [OPTIMISER_FAILURE_CODE.BASELINE_NOT_VALIDATED]: {
    reason: "The current bass result could not be validated, so the optimiser has no baseline to compare against.",
    nextAction: "Recalculate Bass Performance before running the optimiser.",
    actionLabel: "Recalculate Bass Performance",
    fix: OPTIMISER_FAILURE_FIX.BASS_CALCULATION,
  },
  [OPTIMISER_FAILURE_CODE.BASS_NOT_CALCULATED]: {
    reason: "Bass Performance has not been calculated for this design, so there is no current result to optimise.",
    nextAction: "Recalculate Bass Performance before running the optimiser.",
    actionLabel: "Recalculate Bass Performance",
    fix: OPTIMISER_FAILURE_FIX.BASS_CALCULATION,
  },
  [OPTIMISER_FAILURE_CODE.BASS_STALE]: {
    reason: "The room or subwoofer setup has changed since Bass Performance was calculated.",
    nextAction: "Recalculate Bass Performance before running the optimiser.",
    actionLabel: "Recalculate Bass Performance",
    fix: OPTIMISER_FAILURE_FIX.BASS_CALCULATION,
  },
  /**
   * A genuine technical failure. The reason is replaced with the real one the
   * run recorded (resolveUnevaluableReason) — never a bare "could not complete".
   */
  [OPTIMISER_FAILURE_CODE.WORKER_FAILED]: {
    reason: OPTIMISER_UNEVALUABLE_REASON,
    nextAction: "Try again. If it repeats, check Engineer details.",
    actionLabel: "Re-test Bass Optimisation",
    fix: OPTIMISER_FAILURE_FIX.OPTIMISER_RUN,
  },
  /**
   * The saved result kept no evidence that can confirm its own recommendation.
   * This is NOT a design conclusion: the panel asks for the re-test that checks
   * the result against the current design.
   */
  [OPTIMISER_FAILURE_CODE.EVIDENCE_MISSING]: {
    reason: OPTIMISER_RETEST_MESSAGE,
    nextAction: OPTIMISER_RETEST_DETAIL,
    actionLabel: "Re-test Bass Optimisation",
    fix: OPTIMISER_FAILURE_FIX.OPTIMISER_RUN,
  },
});

/**
 * The real reason a technical failure could not name itself from the recorded
 * facts: an honest statement, never a cause that was guessed.
 */
export function resolveUnevaluableReason(recordedReasons = []) {
  const words = (Array.isArray(recordedReasons) ? recordedReasons : []).join(" ");
  const match = UNEVALUABLE_REASONS.find((entry) => entry.test.test(words));
  return match ? match.reason : OPTIMISER_UNEVALUABLE_REASON;
}

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
  const copy = OPTIMISER_FAILURE_COPY[code];
  // A technical failure states the REAL reason the run recorded, so the panel
  // never shows a bare "could not complete".
  if (code === OPTIMISER_FAILURE_CODE.WORKER_FAILED) {
    return { code, ...copy, reason: resolveUnevaluableReason(input.recordedReasons) };
  }
  return { code, ...copy };
}