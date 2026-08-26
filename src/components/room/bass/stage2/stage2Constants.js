// stage2Constants.js
// Stage 2 Subwoofer Placement Optimiser — versions, caps, concurrency.
// Product-aware, P14-aware canonical P19/P20 ranking of Stage 1 finalists.

// Bumped to 3: two-phase architecture with physics-only placement fingerprint,
// P18 grading view removed from fingerprints, selected-quantity-first lifecycle,
// and persistent raw transfer cache. Old cache records are rejected.
export const STAGE2_CACHE_VERSION = 3;
export const STAGE2_RANKING_VERSION = "stage2-ranking-v1";
// Confirmation layer version: P14-dependent EQ/canonical/P14/P18/P19/P20
// authority pipeline. Bumped to v3: confirmation fingerprint now carries
// canonicalVersion + productEngineeringVersion (moved from placement), and
// p18TargetBasis removed (presentation-only grading view).
export const STAGE2_CANONICAL_VERSION = "stage2-canonical-v3";
export const STAGE2_PRODUCT_ENGINEERING_VERSION = "product-engineering-v5";
// Placement layer version: P14-independent raw modal transfer. Bumped to v2:
// placement fingerprint is now physics-only (canonicalVersion and
// productEngineeringVersion removed — they are confirmation-layer concerns).
export const STAGE2_PLACEMENT_VERSION = "stage2-placement-v2";

// Maximum concurrent canonical finalist evaluation jobs.
export const STAGE2_MAX_CONCURRENT_JOBS = 2;

// Auto-start delay after Stage 1 settles + product/P14 selected (ms).
export const STAGE2_START_DELAY_MS = 800;
export const STAGE2_DEBOUNCE_MS = 300;

// Finalist promotion: normal 2 per quantity, max 3 per quantity.
export const STAGE2_FINALISTS_NORMAL = 2;
export const STAGE2_FINALISTS_MAX = 3;

// Default quantity evaluation order when user has no current selection.
export const STAGE2_DEFAULT_QUANTITY_ORDER = [2, 4, 1];

// Source height fallback (acoustic centre Z). Must match Stage 1.
export const STAGE2_FALLBACK_SOURCE_HEIGHT_M = 0.05;

// Lexicographic tie tolerance (dB).
export const STAGE2_TIE_TOLERANCE_DB = 0.15;

// Stop condition thresholds.
export const STAGE2_STOP_ALL_L4_SECONDARY_L2 = true;