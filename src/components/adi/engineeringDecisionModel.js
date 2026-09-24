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

/**
 * Explain why the winning candidate won.
 * Derived from the appropriate lever reason and the optimiser's selection.
 */
function explainWhyWinnerWon(winner, appropriateLever, problem) {
  if (!winner) return 'No winner was selected — the optimiser found no material improvement.';
  if (!appropriateLever) return 'The optimiser selected the best available engineering candidate.';

  const leverReason = appropriateLever.reason || 'The selected candidate best addresses the diagnosed engineering issue.';
  const problemDesc = problem?.description || 'the identified engineering issue';

  return `The winning candidate was selected because it directly addresses ${problemDesc}. ${leverReason}`;
}

/**
 * Explain why other candidates lost.
 * Derived from the optimiser's alternatives and terminal outcome.
 */
function explainWhyOthersLost(selection) {
  if (!selection) return 'No alternative candidates were evaluated.';

  const terminal = selection.terminalOutcome;
  const reasons = [];

  if (terminal === 'no-better-evaluated') {
    reasons.push('Other candidates were evaluated but none provided a better engineering outcome than the winner.');
  } else if (terminal === 'below-materiality') {
    reasons.push('Other candidates were evaluated but their improvements were below the materiality threshold.');
  }

  const tradeOffs = selection.tradeOffs;
  if (Array.isArray(tradeOffs) && tradeOffs.length > 0) {
    reasons.push(`${tradeOffs.length} trade-off candidate(s) were identified but not selected because they involved material worsening in another parameter.`);
  }

  const confirmedCount = (selection.confirmedResults || []).length;
  if (confirmedCount > 1) {
    reasons.push(`${confirmedCount} candidates were confirmed during the search; the winner was selected by the optimiser's ranking.`);
  }

  if (reasons.length === 0) {
    return 'The optimiser evaluated all available candidates and selected the dominant engineering solution.';
  }

  return reasons.join(' ');
}

/**
 * Summarise trade-offs from the optimiser's selection.
 */
function summariseTradeOffs(selection) {
  if (!selection) return null;

  const tradeOffs = selection.tradeOffs;
  if (!Array.isArray(tradeOffs) || tradeOffs.length === 0) return null;

  return tradeOffs.map((t) => ({
    candidateId: t.candidateId || null,
    description: t.description || 'Trade-off candidate identified by the optimiser.',
  }));
}

/**
 * Determine next steps for the designer.
 */
function determineNextSteps(outcome, appropriateLever, problem) {
  if (outcome === ADI_OUTCOME.NO_FURTHER_ENGINEERING) {
    return 'No further engineering changes are recommended. The current design is the engineering optimum for this room and system.';
  }
  if (outcome === ADI_OUTCOME.NO_FURTHER_EQ) {
    return 'EQ has been exhausted. Consider physical changes: seating position, subwoofer placement, or additional subwoofers.';
  }
  if (!appropriateLever) return 'Review the recommendation and apply if appropriate.';

  const leverClass = appropriateLever.class;
  if (leverClass === LEVER_CLASS.CALIBRATION) {
    return 'Apply the recommended calibration changes and recalculate to confirm the improvement.';
  }
  if (leverClass === LEVER_CLASS.PHYSICAL) {
    return 'Apply the recommended physical change (subwoofer placement or seating position) and recalculate.';
  }
  if (leverClass === LEVER_CLASS.SPECIFICATION) {
    return 'Consider the recommended specification change (additional or different subwoofers) and recalculate.';
  }
  return 'Review the recommendation and apply if appropriate.';
}

/**
 * Compute recoverability evidence from the baseline and the winner.
 *
 * Engineering evidence — not exposed by default in the UI.
 * Available to ADI when explaining the recommendation.
 */
function computeRecoverabilityEvidence(baseline, winner) {
  if (!baseline) return null;
  const baselineP19 = Array.isArray(baseline.perSeatP19) ? baseline.perSeatP19 : [];
  if (!baselineP19.length) return null;

  const baselineWorst = baselineP19
    .map((s) => ({
      seatId: s.seatId,
      deviation: Math.abs(Number(s.variationDbRaw) || 0),
      freq: Number(s.worstFrequencyHz) || 0,
      isPrimary: !!s.isPrimary,
    }))
    .sort((a, b) => b.deviation - a.deviation)[0];
  if (!baselineWorst) return null;

  const winnerP19 = winner?.result?.perSeatP19;
  const winnerWorst = Array.isArray(winnerP19)
    ? winnerP19.find((s) => String(s.seatId) === String(baselineWorst.seatId))
    : null;

  const measuredDeviationDb = baselineWorst.deviation;
  const correctedDeviationDb = winnerWorst
    ? Math.abs(Number(winnerWorst.variationDbRaw) || 0)
    : measuredDeviationDb;
  const remainingDeviationDb = Math.max(0, measuredDeviationDb - correctedDeviationDb);

  return {
    measuredDeviationDb,
    correctedDeviationDb,
    remainingDeviationDb,
    frequencyHz: baselineWorst.freq,
    seatId: baselineWorst.seatId,
  };
}

/**
 * Build the ADI EQ decision explanation.
 *
 * Three patterns:
 *   - eq_applied:  Physically recoverable, EQ applied, sufficient capability remains.
 *   - eq_limited: Physically recoverable, EQ limited by design objectives.
 *   - no_eq:      Not physically recoverable, no EQ, physical change required.
 */
function buildEqDecisionExplanation(correctability, problem, winner, recoverabilityEvidence) {
  if (!correctability) return null;

  const isCapabilityOrExtension =
    problem?.type === PROBLEM_TYPE.CAPABILITY || problem?.type === PROBLEM_TYPE.EXTENSION;

  // Not physically recoverable
  if (correctability.class === CORRECTABILITY_CLASS.ABSOLUTE_CANCELLATION || isCapabilityOrExtension) {
    return {
      decision: 'no_eq',
      explanation: 'This response feature is not physically recoverable. No further EQ is recommended. The remaining limitation requires a physical change.',
    };
  }

  // Physically recoverable but capability-limited
  if (correctability.class === CORRECTABILITY_CLASS.CAPABILITY_LIMITED) {
    return {
      decision: 'eq_limited',
      explanation: 'This response feature is physically recoverable. Equalisation has been limited because additional correction would compromise the selected capability or extension objective.',
    };
  }

  // Physically recoverable
  if (winner) {
    const remaining = recoverabilityEvidence?.remainingDeviationDb || 0;
    if (remaining > 1.0) {
      return {
        decision: 'eq_limited',
        explanation: 'This response feature is physically recoverable. Equalisation has been limited because additional correction would compromise the selected capability or extension objective.',
      };
    }
    return {
      decision: 'eq_applied',
      explanation: 'This response feature is physically recoverable. Equalisation has been applied because sufficient capability remains to achieve the selected design objectives.',
    };
  }

  // Recoverable but no winner found
  return {
    decision: 'eq_limited',
    explanation: 'This response feature is physically recoverable. Equalisation has been limited because additional correction would compromise the selected capability or extension objective.',
  };
}

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

  // ── Step 6: Build the Engineering Explanation ──
  const explanation = {
    whyWinnerWon: explainWhyWinnerWon(winner, appropriateLever, problem),
    whyOthersLost: explainWhyOthersLost(selection),
    tradeOffs: summariseTradeOffs(selection),
    remainingLimitation: recommendation?.remainingLimitation || null,
    nextSteps: determineNextSteps(outcome, appropriateLever, problem),
  };

  // ── Step 7: Compute Recoverability Evidence ──
  // Engineering evidence — not exposed by default in the UI.
  const recoverabilityEvidence = computeRecoverabilityEvidence(baseline, winner);

  // ── Step 8: Build EQ Decision Explanation ──
  const eqDecisionExplanation = buildEqDecisionExplanation(correctability, problem, winner, recoverabilityEvidence);

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
    recoverabilityEvidence,
    eqDecisionExplanation,
  };
}