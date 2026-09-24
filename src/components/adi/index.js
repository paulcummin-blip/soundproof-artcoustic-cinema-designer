// index.js
// ---------------------------------------------------------------------------
// Artcoustic Design Intelligence (ADI) — Public API
//
// ADI is the engineering reasoning layer of Sound Proof.
// The optimiser is the execution layer. RP22 is the reporting layer.
// The authority model is unchanged.
//
// Usage:
//   import { runEngineeringDecisionModel } from '@/components/adi';
//   const decision = runEngineeringDecisionModel({ currentResult, candidateResults, ... });
// ---------------------------------------------------------------------------

export { runEngineeringDecisionModel } from './engineeringDecisionModel';
export { classifyCorrectability } from './correctabilityClassifier';
export { validateEngineeringConstraints } from './engineeringConstraints';
export { compareByDominance, rankByDominance } from './engineeringDominance';
export { assessMaterialImprovement, isGenuineImprovement } from './materialImprovement';
export {
  buildRecommendation,
  buildNoFurtherEngineering,
  buildNoFurtherEq,
} from './recommendationBuilder';

export {
  CORRECTABILITY_CLASS,
  ENGINEERING_CONSTRAINT,
  DOMINANCE_CRITERION,
  ADI_OUTCOME,
  LEVER_HIERARCHY_ORDER,
  DEFAULT_MATERIALITY_THRESHOLDS,
} from './adiConstants';