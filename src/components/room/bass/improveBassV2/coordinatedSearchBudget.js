// coordinatedSearchBudget.js
// ---------------------------------------------------------------------------
// Bounded search budget for the Bass ADI coordinated design search.
//
// These are engineering targets to validate with measured browser runtimes,
// not guaranteed performance bounds. The orchestrator checks elapsed time
// between phases and stops launching new work when the budget is reached.
//
// No acoustic maths lives here — this is budget and bound management only.
// ---------------------------------------------------------------------------

/**
 * Initial search bounds. These are deliberately conservative to keep the
 * total search under the 45-second target while still allowing Room D's
 * coordinated improvement to be discovered blind.
 */
export const SEARCH_BOUNDS = Object.freeze({
  // Wall-clock elapsed target. The orchestrator stops launching new phases
  // when this is reached, but any in-flight canonical confirmation completes.
  ELAPSED_BUDGET_MS: 45000,

  // Seating offsets: the existing seatingPositionSearch generates 13 offsets
  // (±600 mm in 100 mm steps plus 0). We retain the full legal set and let the
  // fast screen narrow it.
  MAX_SEATING_CANDIDATES: 13,

  // Placement finalists retained per quantity per seating state. The existing
  // Stage 1/2 finalist promotion already selects family-diverse finalists.
  MAX_PLACEMENT_FINALISTS_PER_QTY: 2,

  // Seating states retained for re-placement. Current seating is always
  // retained; up to 2 additional translated states enter re-placement.
  MAX_SEATING_STATES_FOR_REPLACEMENT: 3,

  // Quantities searched: 1, 2 and 4. Three-sub is excluded from the coordinated
  // search (it remains fully supported by the existing Stage 1/2 pipeline).
  SEARCH_QUANTITIES: Object.freeze([1, 2, 4]),

  // Electronic variants per retained physical candidate before canonical
  // confirmation. One screening winner plus one materially distinct supported
  // alternative.
  MAX_ELECTRONIC_VARIANTS_PER_CANDIDATE: 2,

  // Maximum canonical confirmations across the entire search. This is the
  // hard cap on expensive canonical work.
  MAX_CANONICAL_CONFIRMATIONS: 6,

  // Early exit: when the best candidate reaches all of these, stop searching.
  EARLY_EXIT: Object.freeze({
    PRIMARY_P20_LEVEL: 4,
    P19_LEVEL: 4,
    P14_PASSES: true,
    NO_SERIOUS_CANCELLATION: true,
  }),
});

/**
 * Create a budget tracker for one search run.
 *
 * @param {object} [overrides] — partial overrides for SEARCH_BOUNDS
 * @returns {object} budget tracker API
 */
export function createSearchBudget(overrides = {}) {
  const bounds = { ...SEARCH_BOUNDS, ...overrides };
  const startTime = Date.now();
  let canonicalConfirmationsUsed = 0;
  let electronicVariantsUsed = 0;

  return {
    bounds,

    elapsedMs() {
      return Date.now() - startTime;
    },

    remainingMs() {
      return Math.max(0, bounds.ELAPSED_BUDGET_MS - this.elapsedMs());
    },

    isExhausted() {
      return this.elapsedMs() >= bounds.ELAPSED_BUDGET_MS
        || canonicalConfirmationsUsed >= bounds.MAX_CANONICAL_CONFIRMATIONS;
    },

    claimCanonicalConfirmation() {
      if (canonicalConfirmationsUsed >= bounds.MAX_CANONICAL_CONFIRMATIONS) return false;
      canonicalConfirmationsUsed++;
      return true;
    },

    claimElectronicVariant() {
      if (electronicVariantsUsed >= bounds.MAX_ELECTRONIC_VARIANTS_PER_CANDIDATE) return false;
      electronicVariantsUsed++;
      return true;
    },

    canonicalConfirmationsUsed() {
      return canonicalConfirmationsUsed;
    },

    electronicVariantsUsed() {
      return electronicVariantsUsed;
    },

    snapshot() {
      return {
        elapsedMs: this.elapsedMs(),
        remainingMs: this.remainingMs(),
        canonicalConfirmationsUsed,
        electronicVariantsUsed,
        exhausted: this.isExhausted(),
        bounds: { ...bounds },
      };
    },
  };
}

/**
 * Check whether a candidate meets the early-exit criteria.
 *
 * @param {object} evidence — canonical evidence from coordinatedCandidateEvidence
 * @param {boolean} p14Passes — whether P14 headroom is adequate
 * @returns {boolean} true if the candidate meets all early-exit criteria
 */
export function meetsEarlyExit(evidence, p14Passes = true) {
  if (!evidence) return false;

  const primaryP20Level = evidence.p20Primary?.level;
  const p19Level = evidence.p19?.level;

  if (!Number.isFinite(Number(primaryP20Level)) || !Number.isFinite(Number(p19Level))) {
    return false;
  }

  if (Number(primaryP20Level) < SEARCH_BOUNDS.EARLY_EXIT.PRIMARY_P20_LEVEL) return false;
  if (Number(p19Level) < SEARCH_BOUNDS.EARLY_EXIT.P19_LEVEL) return false;
  if (SEARCH_BOUNDS.EARLY_EXIT.P14_PASSES && !p14Passes) return false;

  const cancellations = Array.isArray(evidence.sharedCancellations)
    ? evidence.sharedCancellations
    : [];
  const seriousCancellation = cancellations.some(
    (c) => c && (c.severity === "serious" || c.severity === "severe"),
  );
  if (SEARCH_BOUNDS.EARLY_EXIT.NO_SERIOUS_CANCELLATION && seriousCancellation) return false;

  return true;
}