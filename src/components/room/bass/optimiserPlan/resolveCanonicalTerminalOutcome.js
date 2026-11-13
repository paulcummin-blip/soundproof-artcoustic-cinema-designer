// resolveCanonicalTerminalOutcome.js
// ---------------------------------------------------------------------------
// THE ONE AUTHORITY for a completed optimiser run's terminal classification.
//
// A single completed run must carry ONE terminal outcome — not three. The
// saved result, the presentation state, the headline and the history must all
// read the same value, so a run can never state NON_ACTIONABLE_WINNER in its
// saved evidence, TRADE_OFF on its panel and NO_USEFUL_IMPROVEMENT in its
// history row at the same time.
//
// This helper derives that one outcome from the two authorities that already
// exist: the plan's own actionability (placement/electronic/seating levers)
// and the calibration decision (delay/gain/polarity/phase). The plan owns the
// ranking winner; the calibration decision owns the electronic trade-off. A
// deterministic hierarchy resolves which one is the run's terminal result:
//
//   1. ACTIONABLE PLAN      at least one lever cleared the materiality gate
//   2. NON_ACTIONABLE_WINNER  a ranking winner exists but its placement is not
//                            practical — the improvement is real, the movement
//                            is not buildable. A separate calibration trade-off
//                            is supporting evidence and never overrides this.
//   3. EVALUATION_INCOMPLETE the run did not finish — a technical state, never
//                            a trade-off.
//   4. FAILED               a genuine technical failure.
//   5. TRADE_OFF             no winner, but a calibration trade-off was held.
//                            This IS the terminal selection result when nothing
//                            higher-priority exists.
//   6. NO_USEFUL_IMPROVEMENT no winner, no trade-off — the search confirmed
//                            nothing worth applying.
//
// PURE: no React, no stores, no calculation. It reads an already-resolved
// actionability and an already-resolved calibration decision and returns one
// string. It changes no bass maths, no scoring and no RP22 grading.
// ---------------------------------------------------------------------------

import { OPTIMISER_TERMINAL_OUTCOME } from "./optimiserPlanConstants.js";
import {
  CALIBRATION_APPLY_DECISION,
  CALIBRATION_APPLY_REASON,
} from "../optimiseWorkflow/adiCalibrationAutoApplyAuthority.js";

/** The reasons that make a held calibration decision a trade-off. */
const TRADE_OFF_REASONS = Object.freeze([
  CALIBRATION_APPLY_REASON.PRIMARY_SEAT_REGRESSION,
  CALIBRATION_APPLY_REASON.P19_DAMAGED,
  CALIBRATION_APPLY_REASON.P20_DAMAGED,
  CALIBRATION_APPLY_REASON.TRADEOFF_REVIEW_REQUIRED,
]);

/**
 * Does a calibration decision constitute a genuine trade-off? It must be a
 * HOLD with a trade-off reason AND record a real improvement — a change that
 * improves nothing is a rejection, not a trade-off.
 */
export function isCalibrationTradeOffDecision(decision) {
  if (!decision || typeof decision !== "object") return false;
  if (decision.decision !== CALIBRATION_APPLY_DECISION.HOLD) return false;
  if (!TRADE_OFF_REASONS.includes(decision.reason)) return false;
  const imp = decision.improvement || null;
  const p20Delta = Number(imp?.p20DeltaDb);
  const p19Delta = Number(imp?.p19DeltaDb);
  const improved = imp?.p19Improved === true
    || imp?.p20Improved === true
    || (Number.isFinite(p20Delta) && p20Delta > 0)
    || (Number.isFinite(p19Delta) && p19Delta > 0);
  return improved;
}

/**
 * Derive the ONE canonical terminal outcome for a completed run.
 *
 * @param {object|null} params.actionability - from resolvePlanActionability:
 *   { actionable, terminalOutcome, reason, offerableLevers }
 * @param {object|null} params.calibrationDecision - the run's own calibration
 *   decision (HOLD / APPLIED / NONE), when one was recorded
 * @returns {string} one of: "actionable_plan", "non_actionable_winner",
 *   "evaluation_incomplete", "failed", "trade_off", "no_useful_improvement"
 */
export function resolveCanonicalTerminalOutcome({
  actionability = null,
  calibrationDecision = null,
} = {}) {
  // 1. An actionable plan is the run's primary result.
  if (actionability?.actionable === true) return "actionable_plan";

  const planOutcome = actionability?.terminalOutcome || null;

  // 2. A non-actionable winner outranks everything below: the improvement is
  //    real, a ranking winner exists, only the placement is not practical. A
  //    separate calibration trade-off is supporting evidence — it never
  //    overrides this terminal classification.
  if (planOutcome === OPTIMISER_TERMINAL_OUTCOME.NON_ACTIONABLE_WINNER) {
    return "non_actionable_winner";
  }

  // 2b. A non-actionable electronic winner: a combined crossover + tuning
  //     improvement was confirmed but crossover apply is not yet supported.
  //     The improvement is real and the search completed — this is never
  //     classified as a technical failure or "no improvement found."
  if (planOutcome === OPTIMISER_TERMINAL_OUTCOME.NON_ACTIONABLE_ELECTRONIC) {
    return "non_actionable_electronic";
  }

  // 3. Technical states are never trade-offs — the run did not produce a
  //    usable result to trade.
  if (planOutcome === OPTIMISER_TERMINAL_OUTCOME.EVALUATION_INCOMPLETE) {
    return "evaluation_incomplete";
  }
  if (planOutcome === OPTIMISER_TERMINAL_OUTCOME.FAILED) {
    return "failed";
  }

  // 4. No higher-priority run outcome. A held calibration trade-off IS the
  //    terminal selection result when there is no winner and no technical
  //    failure.
  if (isCalibrationTradeOffDecision(calibrationDecision)) {
    return "trade_off";
  }

  // 5. No winner, no trade-off: the search confirmed nothing.
  return "no_useful_improvement";
}