// recommendationEngine.js
// ---------------------------------------------------------------------------
// The Recommendation Engine — Stage 1 (Reasoning Layer).
//
// This is the "brain" of the Bass Design Assistant. It consumes the
// existing authoritative optimiser results and produces a structured
// recommendation object that explains the engineering reasoning behind
// the optimiser's selection.
//
// The Recommendation Engine NEVER:
//   - Recalculates engineering
//   - Changes the optimiser
//   - Filters candidates
//   - Invents explanations
//
// It ONLY:
//   - Interprets existing engineering results
//   - Structures the reasoning into a designer-facing object
//   - Identifies the physical cause, appropriate lever, and expected effect
//   - Generates "No Recommendation" when the design is already good enough
//   - Notes protected-objective violations without hiding them
//
// The output is a structured object persisted alongside the canonical bass
// result. It is NOT displayed yet — this stage builds the internal object
// only.
// ---------------------------------------------------------------------------

import { RECOMMENDATION_SCHEMA_VERSION, RECOMMENDATION_TYPE } from './recommendationTypes.js';
import { assessDesign, isGoodEnough } from './recommendationAssessment.js';
import { identifyProblem } from './recommendationProblem.js';
import { inferPhysicalCause } from './recommendationPhysicalCause.js';
import { identifyAvailableLevers, determineAppropriateLever, areAllLeversExhausted } from './recommendationLevers.js';
import { buildRecommendedAction } from './recommendationAction.js';
import { buildAlternativesConsidered } from './recommendationAlternatives.js';
import { assessConfidence } from './recommendationConfidence.js';
import { buildRp22Evidence, buildExpectedPhysicalEffect, identifyRemainingLimitation } from './recommendationEvidence.js';
import { evaluateProtectedObjective } from './recommendationProtectedObjective.js';
import { PROTECTED_OBJECTIVE } from './recommendationTypes.js';

/**
 * Generate a structured recommendation from the optimiser's selection.
 *
 * @param {object} selection - the optimiser selection object (from runImproveBassV2)
 * @param {object} [options] - optional configuration
 * @param {string} [options.protectedObjective] - the active protected objective
 * @param {object} [options.context] - engineering context (p14TargetDb, p18TargetHz, subwooferCount, roomDims)
 * @returns {object} structured recommendation object
 */
export function generateRecommendation(selection, options = {}) {
  if (!selection) {
    return buildNoDataRecommendation();
  }

  const protectedObjective = options.protectedObjective || PROTECTED_OBJECTIVE.PROTECT_PRIMARY_SEATING;
  const context = options.context || {};

  const currentResult = selection.currentResult;
  const winner = selection.winner;

  // ── 1. Assessment ──────────────────────────────────────────────────
  const assessment = assessDesign(currentResult, context);

  // ── 2. Determine recommendation type ──────────────────────────────
  const recommendationType = determineRecommendationType(selection, assessment, winner);

  // ── 3. If "No Recommendation", return early ───────────────────────
  if (recommendationType === RECOMMENDATION_TYPE.NO_RECOMMENDATION) {
    return buildNoRecommendation(assessment, selection, context, protectedObjective);
  }

  // ── 4. Problem ────────────────────────────────────────────────────
  const problem = identifyProblem(currentResult, context);

  // ── 5. Physical Cause ─────────────────────────────────────────────
  const physicalCause = inferPhysicalCause(problem, currentResult, context);

  // ── 6. Available Levers ───────────────────────────────────────────
  const availableLevers = identifyAvailableLevers(selection);

  // ── 7. Appropriate Lever ───────────────────────────────────────────
  const appropriateLever = determineAppropriateLever(problem, physicalCause, availableLevers, selection);

  // ── 8. Recommended Action ──────────────────────────────────────────
  const recommendedAction = buildRecommendedAction(winner, currentResult);

  // ── 9. Expected Physical Effect ───────────────────────────────────
  const expectedPhysicalEffect = buildExpectedPhysicalEffect(currentResult, winner);

  // ── 10. RP22 Evidence ──────────────────────────────────────────────
  const rp22Evidence = buildRp22Evidence(currentResult, winner);

  // ── 11. Remaining Limitation ───────────────────────────────────────
  const remainingLimitation = identifyRemainingLimitation(winner, problem, context);

  // ── 12. Alternatives Considered ────────────────────────────────────
  const alternativesConsidered = buildAlternativesConsidered(selection, winner, currentResult);

  // ── 13. Recommendation Confidence ──────────────────────────────────
  const recommendationConfidence = assessConfidence(winner, currentResult, selection);

  // ── 14. Protected Objective ────────────────────────────────────────
  const protectedObjectiveEvaluation = evaluateProtectedObjective(selection, winner, currentResult, protectedObjective);

  // ── 15. Assemble final recommendation object ────────────────────────
  return {
    schemaVersion: RECOMMENDATION_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    recommendationType,

    assessment: {
      rating: assessment.rating,
      summary: assessment.summary,
      metrics: assessment.metrics,
    },

    problem: {
      type: problem.type,
      description: problem.description,
      worstSeat: problem.worstSeat ? {
        seatId: problem.worstSeat.seatId,
        isPrimary: problem.worstSeat.isPrimary,
        variationDbRaw: problem.worstSeat.variationDbRaw,
        worstFrequencyHz: problem.worstSeat.worstFrequencyHz,
      } : null,
    },

    physicalCause: {
      description: physicalCause.description,
      inferred: physicalCause.inferred,
    },

    availableLevers,

    appropriateLever: {
      class: appropriateLever.class,
      lever: appropriateLever.lever,
      reason: appropriateLever.reason,
    },

    recommendedAction,

    expectedPhysicalEffect,

    rp22Evidence,

    remainingLimitation: {
      description: remainingLimitation.description,
      type: remainingLimitation.type,
    },

    alternativesConsidered,

    recommendationConfidence,

    protectedObjective: protectedObjectiveEvaluation,

    // Provenance — trace back to the optimiser selection
    provenance: {
      winnerCandidateId: winner?.candidateId || null,
      currentCandidateId: currentResult?.candidateId || null,
      terminalOutcome: selection.terminalOutcome || null,
      materialityReason: selection.materialityReason || null,
      confirmedResultsCount: (selection.confirmedResults || []).length,
      recommendationsCount: (selection.recommendations || []).length,
    },
  };
}

/**
 * Determine the recommendation type based on the assessment and selection.
 */
function determineRecommendationType(selection, assessment, winner) {
  // If the design is already good enough AND no material improvement was found
  if (isGoodEnough(assessment.rating) && !winner) {
    return RECOMMENDATION_TYPE.NO_RECOMMENDATION;
  }

  // If all levers have been exhausted and no improvement was found
  if (!winner && areAllLeversExhausted(selection)) {
    return RECOMMENDATION_TYPE.NO_RECOMMENDATION;
  }

  // If the terminal outcome is "no-better-evaluated" or "below-materiality"
  const terminal = selection.terminalOutcome;
  if (terminal === 'no-better-evaluated' || terminal === 'below-materiality') {
    if (isGoodEnough(assessment.rating)) {
      return RECOMMENDATION_TYPE.NO_RECOMMENDATION;
    }
  }

  // If there are trade-offs available
  if (selection.tradeOffs && selection.tradeOffs.length > 0) {
    return RECOMMENDATION_TYPE.TRADE_OFF_AVAILABLE;
  }

  // Default — there is a recommendation
  return RECOMMENDATION_TYPE.RECOMMENDATION;
}

/**
 * Build a "No Recommendation" object.
 */
function buildNoRecommendation(assessment, selection, context, protectedObjective) {
  const allExhausted = areAllLeversExhausted(selection);

  let summary;
  if (allExhausted) {
    summary = 'Your bass design is already well optimised. All available engineering levers have been applied and no further material improvement is available.';
  } else if (isGoodEnough(assessment.rating)) {
    summary = 'Your bass design is already well optimised. No engineering changes are recommended.';
  } else {
    summary = 'No material engineering improvement was found among the evaluated options.';
  }

  return {
    schemaVersion: RECOMMENDATION_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    recommendationType: RECOMMENDATION_TYPE.NO_RECOMMENDATION,

    assessment: {
      rating: assessment.rating,
      summary: assessment.summary,
      metrics: assessment.metrics,
    },

    noRecommendation: {
      summary,
      allLeversExhausted: allExhausted,
    },

    problem: { type: null, description: 'No engineering problem requires attention.', worstSeat: null },
    physicalCause: { description: 'No physical cause to address.', inferred: false },
    availableLevers: identifyAvailableLevers(selection),
    appropriateLever: { class: null, lever: null, reason: 'No action required.' },
    recommendedAction: { description: 'No engineering action recommended.', interventionType: null, candidateId: null },
    expectedPhysicalEffect: { description: 'No changes expected.', effects: [] },
    rp22Evidence: null,
    remainingLimitation: {
      description: assessment.rating === 'excellent' || assessment.rating === 'good'
        ? 'No significant limitation remains.'
        : 'The design is limited but no further improvement is available.',
      type: null,
    },
    alternativesConsidered: [],
    recommendationConfidence: { level: 'very_high', reason: 'No recommendation — the design does not require changes.' },
    protectedObjective: {
      activeObjective: protectedObjective,
      violatedByBestCandidate: false,
      betterSolutionAvailable: null,
      recommendedInstead: null,
    },
    provenance: {
      winnerCandidateId: null,
      currentCandidateId: selection.currentResult?.candidateId || null,
      terminalOutcome: selection.terminalOutcome || null,
      materialityReason: selection.materialityReason || null,
      confirmedResultsCount: (selection.confirmedResults || []).length,
      recommendationsCount: (selection.recommendations || []).length,
    },
  };
}

/**
 * Build a recommendation when no data is available.
 */
function buildNoDataRecommendation() {
  return {
    schemaVersion: RECOMMENDATION_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    recommendationType: RECOMMENDATION_TYPE.NO_RECOMMENDATION,
    assessment: {
      rating: 'poor',
      summary: 'No engineering results available for assessment.',
      metrics: null,
    },
    noRecommendation: {
      summary: 'No engineering results available. Run the bass optimiser to generate a recommendation.',
      allLeversExhausted: false,
    },
    problem: { type: null, description: 'No data.', worstSeat: null },
    physicalCause: { description: 'No data.', inferred: false },
    availableLevers: { calibration: [], physical: [], specification: [] },
    appropriateLever: { class: null, lever: null, reason: 'No data.' },
    recommendedAction: { description: 'No data.', interventionType: null, candidateId: null },
    expectedPhysicalEffect: { description: 'No data.', effects: [] },
    rp22Evidence: null,
    remainingLimitation: { description: 'No data.', type: null },
    alternativesConsidered: [],
    recommendationConfidence: { level: 'low', reason: 'No data available.' },
    protectedObjective: {
      activeObjective: PROTECTED_OBJECTIVE.PROTECT_PRIMARY_SEATING,
      violatedByBestCandidate: false,
      betterSolutionAvailable: null,
      recommendedInstead: null,
    },
    provenance: null,
  };
}