// engineeringDecisionModel.js
// ---------------------------------------------------------------------------
// Artcoustic Design Intelligence (ADI) — Engineering Decision Model
//
// ADI is a PURE reasoning layer. It consumes the optimiser's authoritative
// result and produces an engineering explanation. It never:
//   - Generates candidates
//   - Validates engineering constraints
//   - Ranks candidates
//   - Selects a winner
//   - Determines correctability
//   - Knows about stores, React, or application state
//
// The optimiser is the engineer. ADI is the interpreter.
//
// Pipeline:
//   Optimiser Authoritative Result (selection)
//     ↓
//   Diagnose Physical Problem (from baseline)
//     ↓
//   Infer Physical Cause
//     ↓
//   Restate Optimiser's Physical Recoverability Assessment
//     ↓
//   Identify Available Levers (from what the optimiser tested)
//     ↓
//   Determine Appropriate Lever (explanation, not enforcement)
//     ↓
//   Build 5-Field Recommendation (from the optimiser's winner)
//     ↓
//   Explain: Why Winner Won, Why Others Lost, Trade-offs, Remaining Limitation
//
// This module is PURE: no React, no side effects, no stores.
// ---------------------------------------------------------------------------

import { identifyProblem } from '@/components/recommendationEngine/recommendationProblem';
import { inferPhysicalCause } from '@/components/recommendationEngine/recommendationPhysicalCause';
import {
  identifyAvailableLevers,
  determineAppropriateLever,
  areAllLeversExhausted,
} from '@/components/recommendationEngine/recommendationLevers';
import { RECOMMENDATION_INTENT } from '@/components/room/bass/recommendationAuthority/recommendationAuthority';
import { LEVER_CLASS, PROBLEM_TYPE } from '@/components/recommendationEngine/recommendationTypes';

import { CORRECTABILITY_CLASS, ADI_OUTCOME } from './adiConstants';
import {
  buildRecommendation,
  buildNoFurtherEngineering,
  buildNoFurtherEq,
  buildIncomplete,
  buildTargetNotAchieved,
} from './recommendationBuilder';

function leverClassToIntent(leverClass) {
  if (leverClass === LEVER_CLASS.CALIBRATION) return RECOMMENDATION_INTENT.CALIBRATION;
  if (leverClass === LEVER_CLASS.PHYSICAL) return RECOMMENDATION_INTENT.DESIGN;
  if (leverClass === LEVER_CLASS.SPECIFICATION) return RECOMMENDATION_INTENT.SPECIFICATION;
  return RECOMMENDATION_INTENT.CALIBRATION;
}

// ── Target-achieved gate helper ──────────────────────────────────────────
// Determines whether the selected bass target is not achieved in the baseline.
// When the target is not achieved and the optimiser found no winner, "no
// improvement found" is NOT "no further engineering needed" — it is an
// unachievable target. This prevents false closure (reassuring "No further
// engineering changes are recommended" when all parameters FAIL).
function numericLevelValue(value) {
  if (Number.isFinite(Number(value))) return Math.max(0, Math.min(4, Number(value)));
  const match = String(value || '').match(/^L([1-4])$/i);
  return match ? Number(match[1]) : 0;
}

function isTargetNotAchieved(baseline, problem) {
  if (!baseline) return false;
  // Physical limits directly indicate target failure
  if (problem?.type === PROBLEM_TYPE.CAPABILITY) return true;
  if (problem?.type === PROBLEM_TYPE.EXTENSION) return true;
  // All relevant RP22 levels are 0/null/FAIL
  const levels = baseline?.rp22Levels;
  if (levels && typeof levels === 'object') {
    const allFail = numericLevelValue(levels.p14) === 0
      && numericLevelValue(levels.p18) === 0
      && numericLevelValue(levels.p19) === 0
      && numericLevelValue(levels.p20) === 0;
    if (allFail) return true;
  }
  return false;
}

// ADI explanation functions removed — the recommendation builder's 5 fields
// (assessment, action, why, expectedResult, remainingLimitation) are the
// complete ADI output. No separate whyWinnerWon, whyOthersLost, tradeOffs,
// nextSteps, eqDecisionExplanation, or recoverabilityEvidence needed.

/**
 * Run the ADI Engineering Decision Model.
 *
 * ADI is a pure reasoning module. It receives the optimiser's authoritative
 * result and produces an engineering explanation. It never retrieves
 * engineering state from stores or infers it from application state.
 *
 * @param {object} inputs
 * @param {object} inputs.optimiserResult - the optimiser's authoritative selection:
 *   { winner, confirmedResults, currentResult, terminalOutcome, tradeOffs,
 *     correctabilityClassification, noMaterialImprovement, ... }
 * @param {object} inputs.currentResult - authoritative baseline canonical result
 *   (also available as optimiserResult.currentResult, but passed explicitly
 *   to keep ADI pure — no reaching into the selection for baseline data)
 * @param {object} inputs.designObjectives - { p14TargetDb, p18TargetHz, p14Level, p18Basis }
 * @param {object} inputs.context - { subwooferCount, roomDims, seatingPositions }
 * @returns {object} ADI decision: { outcome, intent, recommendation, diagnosis, explanation }
 */
export function runEngineeringDecisionModel(inputs) {
  const {
    optimiserResult,
    currentResult,
    designObjectives = {},
    context = {},
  } = inputs || {};

  // The baseline is the current result — passed explicitly, not read from stores.
  const baseline = currentResult || optimiserResult?.currentResult || null;
  const selection = optimiserResult;

  // ── Step 1: Diagnose Physical Problem ──
  const problem = identifyProblem(baseline, designObjectives);
  const physicalCause = inferPhysicalCause(problem, baseline, context);

  // ── Step 2: Restate Optimiser's Physical Recoverability Assessment ──
  // ADI restates the optimiser's physical recoverability assessment in plain language.
  // It never assesses — the optimiser owns the Physical Recoverability Assessment (Layer 1).
  const correctability = selection?.correctabilityClassification || null;

  // ── Step 3: Identify Available Levers (from what the optimiser tested) ──
  const availableLevers = identifyAvailableLevers(selection);
  const appropriateLever = determineAppropriateLever(problem, physicalCause, availableLevers, selection);

  // ── Step 4: Build 5-Field Recommendation from the Optimiser's Winner ──
  const winner = selection?.winner || null;
  const noMaterialImprovement = selection?.noMaterialImprovement || (!winner && (selection?.terminalOutcome === 'no-better-evaluated' || selection?.terminalOutcome === 'below-materiality'));

  // FIX 4: Detect incomplete evaluation — the optimiser has a terminal
  // outcome of "incomplete", confirmedResults is 0, or no winner was selected
  // AND there is no explicit "no-better-evaluated" / "below-materiality"
  // terminal outcome. When bass evidence IS available (baseline exists with
  // P20 seat data), this is NOT "no further engineering" — it is an
  // incomplete evaluation that must be communicated visibly.
  const terminalOutcome = selection?.terminalOutcome || null;
  const confirmedResultsCount = Number(selection?.confirmedResults) || 0;
  const isIncompleteEvaluation = !winner
    && (terminalOutcome === 'incomplete'
        || (confirmedResultsCount === 0 && terminalOutcome !== 'no-better-evaluated' && terminalOutcome !== 'below-materiality' && terminalOutcome !== 'safety-rejected'));
  const hasP20Evidence = Array.isArray(baseline?.perSeatP20) && baseline.perSeatP20.length > 0;

  // ── Target-achieved gate ──
  // If the selected target is not achieved in the baseline and the optimiser
  // found no winner, "no improvement found" is NOT "no further engineering
  // needed" — it is an unachievable target. This must fire before
  // areAllLeversExhausted can produce NO_FURTHER_ENGINEERING (false closure).
  const targetNotAchieved = !winner && isTargetNotAchieved(baseline, problem);

  let outcome;
  let recommendation;

  if (targetNotAchieved) {
    outcome = ADI_OUTCOME.TARGET_NOT_ACHIEVED;
    recommendation = buildTargetNotAchieved(problem, physicalCause, designObjectives);
  } else if (isIncompleteEvaluation && hasP20Evidence) {
    // Bass evidence exists but the optimiser could not confirm an improvement.
    outcome = ADI_OUTCOME.INCOMPLETE;
    recommendation = buildIncomplete(problem, hasP20Evidence);
  } else if (noMaterialImprovement || !winner) {
    // The optimiser found no material improvement.
    // Determine whether this is "no further EQ" or "no further engineering".
    if (correctability?.class === CORRECTABILITY_CLASS.ABSOLUTE_CANCELLATION) {
      outcome = ADI_OUTCOME.NO_FURTHER_EQ;
      recommendation = buildNoFurtherEq(physicalCause);
    } else if (areAllLeversExhausted(selection)) {
      outcome = ADI_OUTCOME.NO_FURTHER_ENGINEERING;
      recommendation = buildNoFurtherEngineering(physicalCause);
    } else if (correctability?.class === CORRECTABILITY_CLASS.CAPABILITY_LIMITED) {
      outcome = ADI_OUTCOME.NO_FURTHER_EQ;
      recommendation = buildNoFurtherEq(physicalCause);
    } else {
      outcome = ADI_OUTCOME.NO_FURTHER_ENGINEERING;
      recommendation = buildNoFurtherEngineering(physicalCause);
    }
  } else {
    // The optimiser found a material improvement.
    // Check if the selection has trade-offs that make this a trade-off outcome.
    const hasTradeOffs = Array.isArray(selection?.tradeOffs) && selection.tradeOffs.length > 0;
    outcome = hasTradeOffs ? ADI_OUTCOME.TRADE_OFF : ADI_OUTCOME.RECOMMENDATION;
    recommendation = buildRecommendation({
      dominant: winner,
      problem,
      physicalCause,
      correctability,
      appropriateLever,
      currentResult: baseline,
      designObjectives,
    });
  }

  // ── Step 5: Determine Recommendation Intent from the Lever Class ──
  const intent = winner
    ? leverClassToIntent(winner.leverClass || appropriateLever?.class)
    : RECOMMENDATION_INTENT.CALIBRATION;

  // ── Step 6: Build the Explanation ──
  const explanation = {
    remainingLimitation: recommendation?.remainingLimitation || null,
  };

  return {
    outcome,
    intent,
    recommendation,
    diagnosis: {
      problem,
      physicalCause,
      correctability,
    },
    leverAssessment: {
      availableLevers,
      appropriateLever,
    },
    explanation,
  };
}