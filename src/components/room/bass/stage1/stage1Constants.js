// stage1Constants.js
// Stage 1 Subwoofer Placement Optimiser — versions, caps, tolerances.
// Product-independent, P14-independent, EQ-independent geometric search.

export const STAGE1_PLACEMENT_ALGORITHM_VERSION = "stage1-placement-v1";
export const STAGE1_FAMILY_POLICY_VERSION = "stage1-family-policy-v1";
export const STAGE1_CACHE_VERSION = 2;

// Frequency domain for positional consistency screening (RP22 §7.1).
// This is NOT the canonical P19/P20 assessment band — Stage 2 owns that.
export const STAGE1_SCREENING_FREQ_MIN_HZ = 20;
export const STAGE1_SCREENING_FREQ_MAX_HZ = 80;
export const STAGE1_POINTS_PER_OCTAVE = 8;

// Source height fallback (acoustic centre Z). Product-independent.
export const STAGE1_FALLBACK_SOURCE_HEIGHT_M = 0.05;

// Auto-start delay after geometry settles (ms).
export const STAGE1_START_DELAY_MS = 600;
export const STAGE1_DEBOUNCE_MS = 250;

// Candidate budgets (normal hard caps).
export const STAGE1_CANDIDATE_BUDGETS = Object.freeze({
  1: { normal: 96, fallback: 160 },
  2: { normal: 128, fallback: 240, allocation: { C_FRONT_PAIR: 48, RP22_F: 40, RP22_G: 40 } },
  4: { normal: 192, fallback: 280, allocation: { RP22_C: 72, RP22_E: 60, RP22_D: 60 } },
});

// Finalist count per quantity.
export const STAGE1_FINALIST_COUNT = Object.freeze({
  1: 5,
  2: 5,
  4: 5,
});

// Diversity: minimum normalised displacement between finalists of the same family.
export const STAGE1_DIVERSITY_MIN_DISPLACEMENT_NORM = 0.03;

// A-prohibition tolerance (normalised).
export const STAGE1_A_PROHIBITION_TOLERANCE_NORM = 0.05;

// Broad null detection (reused from bestSubLayoutConstants for parity).
export const STAGE1_NULL_RULE = Object.freeze({
  smoothingRadiusBins: 1,
  shoulderRadiusBins: 4,
  minimumContiguousBins: 2,
  destructiveDepthDb: 8,
  severeDepthDb: 10,
});

// Screening variation tolerance (dB) for lexicographic tie comparison.
export const STAGE1_TIE_TOLERANCE = Object.freeze({
  variationDb: 0.15,
  smoothnessDb: 0.15,
  coherenceDb: 0.15,
  efficiencyDb: 0.1,
});

// Local search parameters.
export const STAGE1_LOCAL_SEARCH = Object.freeze({
  coarseStep: 0.05,
  fineStep: 0.01,
  fineRadius: 0.04,
  coarseRange: { min: 0.15, max: 0.35 },
  sideWallRange: { min: 0.15, max: 0.85 },
  frontWallRange: { min: 0.10, max: 0.90 },
});

// Lexicographic ranking priorities (ordered).
export const STAGE1_RANKING_PRIORITIES = Object.freeze([
  "primarySevereProblemCount",
  "worstPrimarySpatialVariation",
  "primaryResponseSmoothness",
  "primaryRspCoherence",
  "secondarySpatialConsistency",
  "efficiencyIndicator",
  "familyPreferenceRank",
]);