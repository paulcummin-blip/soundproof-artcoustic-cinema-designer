// adiConstants.js
// ---------------------------------------------------------------------------
// Artcoustic Design Intelligence (ADI) — Constants
//
// ADI is the reasoning layer. The optimiser is the execution layer.
// RP22 is the reporting layer. The authority model is unchanged.
//
// CORRECTABILITY_CLASS is re-exported from the optimiser's Physical
// Recoverability Assessment (Layer 1) so ADI can restate the optimiser's
// assessment using the same constants. ADI never assesses — it restates.
// ---------------------------------------------------------------------------

// Re-export CORRECTABILITY_CLASS from the optimiser's authoritative implementation.
export { CORRECTABILITY_CLASS } from '@/components/room/bass/improveBassV2/correctabilityClassifier';

// ── ADI Outcome Types ────────────────────────────────────────────────────

export const ADI_OUTCOME = {
  RECOMMENDATION: 'recommendation',
  TRADE_OFF: 'trade_off',
  NO_FURTHER_ENGINEERING: 'no_further_engineering',
  NO_FURTHER_EQ: 'no_further_eq',
};