// index.js
// ---------------------------------------------------------------------------
// Recommendation Engine — Stage 1 (Reasoning Layer).
//
// The Recommendation Engine is a pure reasoning layer that sits between the
// optimiser and the Bass Design Assistant. It transforms engineering results
// into structured design advice.
//
// Usage:
//   import { generateRecommendation } from '@/components/recommendationEngine';
//
//   const recommendation = generateRecommendation(selection, {
//     protectedObjective: 'protect_primary_seating',
//     context: { p14TargetDb, p18TargetHz, subwooferCount, roomDims },
//   });
//
// The output is a structured object with:
//   - assessment (is the design good enough?)
//   - problem (what is limiting the design?)
//   - physicalCause (why?)
//   - availableLevers (what can be done?)
//   - appropriateLever (which lever matches the cause?)
//   - recommendedAction (what should I do next?)
//   - expectedPhysicalEffect (what improvement should I expect?)
//   - rp22Evidence (which RP22 parameters support that?)
//   - remainingLimitation (what still limits the design?)
//   - alternativesConsidered (what alternatives were considered and why rejected?)
//   - recommendationConfidence (how robust is the recommendation?)
//   - protectedObjective (does the best candidate violate the protected objective?)
//
// The Recommendation Engine never recalculates engineering. It only
// interprets existing authoritative results.
// ---------------------------------------------------------------------------

export { generateRecommendation } from './recommendationEngine.js';
export { RECOMMENDATION_SCHEMA_VERSION, RECOMMENDATION_TYPE, ASSESSMENT_RATING, PROBLEM_TYPE, LEVER_CLASS, LEVER, INTERVENTION_TYPE, CONFIDENCE_LEVEL, WHY_LOST, PROTECTED_OBJECTIVE, EXPECTED_EFFECT } from './recommendationTypes.js';
export { assessDesign } from './recommendationAssessment.js';
export { identifyProblem } from './recommendationProblem.js';
export { inferPhysicalCause } from './recommendationPhysicalCause.js';
export { identifyAvailableLevers, determineAppropriateLever, areAllLeversExhausted } from './recommendationLevers.js';
export { buildRecommendedAction } from './recommendationAction.js';
export { buildAlternativesConsidered } from './recommendationAlternatives.js';
export { assessConfidence } from './recommendationConfidence.js';
export { buildRp22Evidence, buildExpectedPhysicalEffect, identifyRemainingLimitation } from './recommendationEvidence.js';
export { evaluateProtectedObjective } from './recommendationProtectedObjective.js';
export { publishRecommendation, getRecommendation, hydrateRecommendation, clearRecommendation, subscribeRecommendation } from './recommendationPersistence.js';