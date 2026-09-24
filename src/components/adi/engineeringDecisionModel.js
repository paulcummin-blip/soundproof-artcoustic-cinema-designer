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
} from './recommendationBuilder';

function leverClassToIntent(leverClass) {
  if (leverClass === LEVER_CLASS.CALIBRATION) return RECOMMENDATION_INTENT.CALIBRATION;
  if (leverClass === LEVER_CLASS.PHYSICAL) return RECOMMENDATION_INTENT.DESIGN;
  if (leverClass === LEVER_CLASS.SPECIFICATION) return RECOMMENDATION_INTENT.SPECIFICATION;
  return RECOMMENDATION_INTENT.CALIBRATION;
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

  let outcome;
  let recommendation;

  if (noMaterialImprovement || !winner) {
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