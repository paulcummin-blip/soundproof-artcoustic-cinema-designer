// engineeringRankingConstants.js
// ---------------------------------------------------------------------------
// Centralised engineering comparison constants for the bass optimiser ranking.
//
// Stage 1 scope: centralise existing constants only. No new thresholds.
// ---------------------------------------------------------------------------

// Floating-point comparison tolerance for ranking tuple comparisons.
// Extracted from zeroFailOptimiser.compareZeroFailFirst (was inline 1e-8).
export const COMPARISON_TOLERANCE = 1e-8;