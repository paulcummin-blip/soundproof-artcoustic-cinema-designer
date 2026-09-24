// engineeringDecisionModel.js
// ---------------------------------------------------------------------------
// Artcoustic Design Intelligence (ADI) — Engineering Decision Model
//
// The authoritative engineering reasoning layer. The pipeline:
//
//   Authoritative Baseline
//     ↓
//   Diagnose Physical Cause
//     ↓
//   Determine Correctability
//     ↓
//   Apply Engineering Levers
//     ↓
//   Validate Engineering Constraints
//     ↓
//   Compare Engineering Outcomes
//     ↓
//   Select Dominant Solution
//     ↓
//   Report RP22
//     ↓
//   Explain Remaining Limitation
//
// ADI is the reasoning layer. The optimiser is the execution layer.
// RP22 is the reporting layer. The authority model is unchanged.
//
// This module is PURE: no React, no side effects.
// It consumes existing modules and produces an ADI decision object.
// ---------------------------------------------------------------------------

import { identifyProblem } from '@/components/recommendationEngine/recommendationProblem';
import { inferPhysicalCause } from '@/components/recommendationEngine/recommendationPhysicalCause';
import {
  identifyAvailableLevers,
  determineAppropriateLever,
  areAllLeversExhausted,
} from '@/components/recommendationEngine/recommendationLevers';
import { RECOMMENDATION_INTENT } from '@/components/room/bass/recommendationAuthority/recommendationAuthority';
import { LEVER_CLASS } from '@/components/recommendationEngine/recommendationTypes';

import { CORRECTABILITY_CLASS, ADI_OUTCOME, DEFAULT_MATERIALITY_THRESHOLDS } from './adiConstants';
import { classifyCorrectability } from './correctabilityClassifier';
import { validateEngineeringConstraints } from './engineeringConstraints';
import { rankByDominance } from './engineeringDominance';
import { assessMaterialImprovement } from './materialImprovement';
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
 * Run the ADI Engineering Decision Model.
 *
 * @param {object} inputs
 * @param {object} inputs.currentResult - authoritative baseline canonical result
 * @param {Array}  inputs.candidateResults - optimiser candidate results
 *   Each: { id, result, recommendationValues, leverClass, originatingCandidateId }
 * @param {object} inputs.designObjectives - { p14TargetDb, p18TargetHz, p14Level, p18Basis }
 * @param {object} inputs.selection - optimiser selection (for lever availability)
 * @param {object} inputs.context - { subwooferCount, roomDims, seatingPositions }
 * @param {object} [inputs.thresholds] - optional materiality threshold overrides
 * @returns {object} ADI decision object
 */
export function runEngineeringDecisionModel(inputs) {
  const {
    currentResult,
    candidateResults,
    designObjectives = {},
    selection,
    context = {},
    thresholds = {},
  } = inputs || {};

  const t = { ...DEFAULT_MATERIALITY_THRESHOLDS, ...thresholds };

  // ── Step 1: Authoritative Baseline ──
  // The currentResult IS the authoritative baseline. No action needed.

  // ── Step 2: Diagnose Physical Cause ──
  const problem = identifyProblem(currentResult, designObjectives);
  const physicalCause = inferPhysicalCause(problem, currentResult, context);

  // ── Step 3: Determine Correctability ──
  const correctability = classifyCorrectability(problem, currentResult, designObjectives, t);

  // ── Step 4: Apply Engineering Levers ──
  const availableLevers = identifyAvailableLevers(selection);
  const appropriateLever = determineAppropriateLever(problem, physicalCause, availableLevers, selection);

  // ── Step 5: Validate Engineering Constraints ──
  // Every candidate must pass ALL hard gates before ranking.
  const candidates = (Array.isArray(candidateResults) ? candidateResults : []).map((candidate) => {
    const constraints = validateEngineeringConstraints(
      candidate.result,
      currentResult,
      designObjectives,
      t,
    );
    return { ...candidate, constraints };
  });

  // Reject candidates that failed constraints — never rank them.
  const passingCandidates = candidates.filter((c) => c.constraints.passed);
  const rejectedCandidates = candidates.filter((c) => !c.constraints.passed);

  // ── Step 6: Compare Engineering Outcomes ──
  // Assess material improvement for each passing candidate.
  const comparedCandidates = passingCandidates.map((candidate) => {
    const materialAssessment = assessMaterialImprovement(currentResult, candidate.result, t);
    return { ...candidate, materialAssessment };
  });

  // Filter to candidates with material improvement
  const materialCandidates = comparedCandidates.filter((c) => c.materialAssessment.isMaterial);

  // ── Step 7: Select Dominant Solution ──
  // Rank by engineering dominance (not weighted score).
  const ranked = rankByDominance(materialCandidates, problem);
  const dominant = ranked.length > 0 ? ranked[0] : null;

  // ── Step 8: Report RP22 ──
  // RP22 results are already in the candidate results. No recalculation.
  // The RP22 evidence is extracted by the recommendation builder.

  // ── Step 9: Explain Remaining Limitation ──
  // Build the 5-field recommendation.
  let outcome;
  let recommendation;

  if (!dominant) {
    // No material improvement found from any candidate.
    // Determine whether this is "no further EQ" or "no further engineering".
    if (correctability.class === CORRECTABILITY_CLASS.ABSOLUTE_CANCELLATION) {
      // The remaining limitation is an absolute cancellation — EQ cannot help.
      outcome = ADI_OUTCOME.NO_FURTHER_EQ;
      recommendation = buildNoFurtherEq(physicalCause);
    } else if (areAllLeversExhausted(selection)) {
      // All engineering levers have been exhausted.
      outcome = ADI_OUTCOME.NO_FURTHER_ENGINEERING;
      recommendation = buildNoFurtherEngineering(physicalCause);
    } else if (correctability.class === CORRECTABILITY_CLASS.CAPABILITY_LIMITED) {
      // The remaining limitation is capability — EQ cannot help.
      outcome = ADI_OUTCOME.NO_FURTHER_EQ;
      recommendation = buildNoFurtherEq(physicalCause);
    } else {
      // Default: no further engineering changes.
      outcome = ADI_OUTCOME.NO_FURTHER_ENGINEERING;
      recommendation = buildNoFurtherEngineering(physicalCause);
    }
  } else if (dominant.materialAssessment.isTradeOff) {
    // Material improvement with material worsening — trade-off.
    outcome = ADI_OUTCOME.TRADE_OFF;
    recommendation = buildRecommendation({
      dominant,
      problem,
      physicalCause,
      correctability,
      appropriateLever,
      currentResult,
      designObjectives,
    });
  } else {
    // Pure material improvement — recommendation.
    outcome = ADI_OUTCOME.RECOMMENDATION;
    recommendation = buildRecommendation({
      dominant,
      problem,
      physicalCause,
      correctability,
      appropriateLever,
      currentResult,
      designObjectives,
    });
  }

  // Determine the recommendation intent from the lever class
  const intent = dominant
    ? leverClassToIntent(dominant.leverClass || appropriateLever.class)
    : RECOMMENDATION_INTENT.CALIBRATION;

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
    constraints: {
      total: candidates.length,
      passed: passingCandidates.length,
      rejected: rejectedCandidates.length,
      rejectedDetails: rejectedCandidates.map((c) => ({
        candidateId: c.id,
        failures: c.constraints.failures,
      })),
    },
    dominanceRanking: ranked.map((c) => c.id),
    dominantCandidate: dominant,
    remainingLimitation: recommendation?.remainingLimitation || null,
  };
}