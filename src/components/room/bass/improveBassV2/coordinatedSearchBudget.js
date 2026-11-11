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
 * CANCELLATION: a run is cancelled by calling `cancel()`. `isExhausted()`
 * then returns true for the lifetime of the tracker, so the orchestrator
 * stops launching new phases. This is a COOPERATIVE, BETWEEN-PHASE signal:
 * it is checked at phase/loop boundaries. An in-flight worker call cannot
 * be interrupted by this budget alone — the orchestrator must thread an
 * AbortController (or the existing worker lifecycle's signal) into any
 * cancellable call. Where an in-flight calculation cannot be interrupted,
 * the orchestrator reports that limitation honestly instead of claiming
 * a hard 45 s deadline.
 *
 * OBSOLETE-RUN GUARD: `isCurrent()` compares this tracker's run token
 * against the latest token known to the budget. A newer run calls
 * `supersede()` to mark this tracker obsolete; after that, the
 * orchestrator must not publish. The token is opaque and owned by the
 * caller — typically a run id minted when the user started the search.
 *
 * @param {object} [overrides] — partial overrides for SEARCH_BOUNDS
 * @param {object} [options] — { runToken } opaque identity for obsolete-run guard
 * @returns {object} budget tracker API
 */
export function createSearchBudget(overrides = {}, options = {}) {
  const bounds = { ...SEARCH_BOUNDS, ...overrides };
  const startTime = Date.now();
  let canonicalConfirmationsUsed = 0;
  let electronicVariantsUsed = 0;
  let cancelled = false;
  let obsolete = false;
  const runToken = options?.runToken ?? null;

  return {
    bounds,

    elapsedMs() {
      return Date.now() - startTime;
    },

    remainingMs() {
      return Math.max(0, bounds.ELAPSED_BUDGET_MS - this.elapsedMs());
    },

    isExhausted() {
      return cancelled
        || obsolete
        || this.elapsedMs() >= bounds.ELAPSED_BUDGET_MS
        || canonicalConfirmationsUsed >= bounds.MAX_CANONICAL_CONFIRMATIONS;
    },

    // Cooperative cancellation. Stops new work; does not interrupt in-flight
    // work (the orchestrator must propagate this into worker signals).
    cancel() { cancelled = true; },
    isCancelled() { return cancelled; },

    // Obsolete-run guard. A newer search supersedes this one; the
    // orchestrator must not publish results from a superseded tracker.
    supersede() { obsolete = true; },
    isObsolete() { return obsolete; },
    runToken() { return runToken; },
    isCurrent(latestToken) {
      if (latestToken == null) return true;
      return runToken === latestToken;
    },

    claimCanonicalConfirmation() {
      if (cancelled || obsolete) return false;
      if (canonicalConfirmationsUsed >= bounds.MAX_CANONICAL_CONFIRMATIONS) return false;
      canonicalConfirmationsUsed++;
      return true;
    },

    claimElectronicVariant() {
      if (cancelled || obsolete) return false;
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
        cancelled,
        obsolete,
        runToken,
        // Explicit statement of the budget's nature, so any consumer that
        // reads this snapshot cannot mistake the target for a hard deadline.
        budgetContract: "between-phase-target-not-hard-deadline",
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