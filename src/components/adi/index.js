// index.js
// ---------------------------------------------------------------------------
// Artcoustic Design Intelligence (ADI) — Public API
//
// ADI is the engineering reasoning layer of Sound Proof.
// The optimiser is the execution layer. RP22 is the reporting layer.
// The authority model is unchanged.
//
// ADI is a PURE reasoning module. It consumes the optimiser's authoritative
// result and produces an engineering explanation. It never generates
// candidates, validates constraints, ranks candidates, or selects a winner.
//
// Usage:
//   import { runEngineeringDecisionModel } from '@/components/adi';
//   const decision = runEngineeringDecisionModel({
//     optimiserResult: selection,
//     currentResult,
//     designObjectives,
//     context,
//   });
// ---------------------------------------------------------------------------

export { runEngineeringDecisionModel } from './engineeringDecisionModel';
export {
  buildRecommendation,
  buildNoFurtherEngineering,
  buildNoFurtherEq,
} from './recommendationBuilder';

export { CORRECTABILITY_CLASS, ADI_OUTCOME } from './adiConstants';