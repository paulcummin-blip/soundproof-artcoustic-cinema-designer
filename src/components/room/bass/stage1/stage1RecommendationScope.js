// stage1RecommendationScope.js
// ---------------------------------------------------------------------------
// Cross-quantity recommendation scope for the ADI Subwoofer Design workflow.
//
// The three-option Subwoofer Design recommendation evaluates 1, 2 and 4
// subwoofer arrangements together from ONE fixed room, seating and RSP
// snapshot. This module defines the quantity set for that workflow WITHOUT
// touching the existing single-quantity scope, the 3-subwoofer search, or any
// existing caller.
//
// Existing scopes (unchanged):
//   - scopeQuantity = null  → full search (1, 2, 3, 4 in family order)
//   - scopeQuantity = N     → single-quantity search (ADI installed-count)
//
// New scope (this module):
//   - recommendationQuantities = [1, 2, 4] → cross-quantity recommendation
//
// The 3-subwoofer search remains fully supported elsewhere — it is simply not
// part of this recommendation workflow. No acoustic physics, RP22 scoring or
// existing search logic is changed.
// ---------------------------------------------------------------------------

/**
 * The fixed quantity set for the three-option Subwoofer Design recommendation.
 * 1, 2 and 4 subwoofers — the front/rear wall arrangements a designer chooses
 * between. 3 is excluded from this workflow but remains supported by the
 * existing Stage 1/Stage 2 search.
 */
export const RECOMMENDATION_QUANTITIES = Object.freeze([1, 2, 4]);

// At most seven supported subsets. Stable immutable identities prevent the
// scheduling effects from restarting on their own store notifications.
const canonicalScopes = new Map([["1,2,4", RECOMMENDATION_QUANTITIES]]);

/**
 * Is a quantity set a valid cross-quantity recommendation scope?
 * Must be a non-empty array of supported subwoofer quantities (1, 2 or 4),
 * in ascending order, with no duplicates.
 *
 * @param {Array|*} quantities
 * @returns {boolean}
 */
export function isRecommendationQuantitySet(quantities) {
  if (!Array.isArray(quantities) || quantities.length === 0) return false;
  const valid = new Set([1, 2, 4]);
  for (const q of quantities) {
    if (!valid.has(q)) return false;
  }
  // Must be ascending and unique.
  for (let i = 1; i < quantities.length; i += 1) {
    if (quantities[i] <= quantities[i - 1]) return false;
  }
  return true;
}

/**
 * Normalise a caller-provided recommendation scope into the canonical
 * quantity set, or null when the caller did not request a recommendation scope.
 *
 * @param {Array|null|undefined} recommendationQuantities
 * @returns {number[]|null} the normalised quantity set, or null
 */
export function normaliseRecommendationScope(recommendationQuantities) {
  if (!Array.isArray(recommendationQuantities) || recommendationQuantities.length === 0) return null;
  // Accept [1,2,4] or any subset in any order — normalise to ascending unique.
  const valid = recommendationQuantities
    .filter((q) => q === 1 || q === 2 || q === 4)
    .filter((q, index, arr) => arr.indexOf(q) === index);
  if (valid.length === 0) return null;
  valid.sort((a, b) => a - b);
  const key = valid.join(",");
  if (!canonicalScopes.has(key)) canonicalScopes.set(key, Object.freeze(valid));
  return canonicalScopes.get(key);
}

/**
 * Resolve the quantity search order for a Stage 1 / Stage 2 run given both the
 * existing scopeQuantity and the new recommendationQuantities scope.
 *
 * Precedence: recommendationQuantities (cross-quantity) takes priority over
 * scopeQuantity (single-quantity), which takes priority over the default full
 * search. This preserves every existing caller's behaviour — none of them
 * pass recommendationQuantities, so they all resolve exactly as before.
 *
 * @param {object} params
 * @param {number|null} [params.scopeQuantity]
 * @param {Array|null} [params.recommendationQuantities]
 * @param {number[]|null} [params.defaultOrder]
 * @returns {number[]|null} quantity order, or null when no scope applies (full search)
 */
export function resolveRecommendationQuantityOrder({
  scopeQuantity = null,
  recommendationQuantities = null,
  defaultOrder = null,
} = {}) {
  const rec = normaliseRecommendationScope(recommendationQuantities);
  if (rec) return rec;
  if ([1, 2, 3, 4].includes(scopeQuantity)) return [scopeQuantity];
  return defaultOrder || null;
}

// ---------------------------------------------------------------------------
// Stage 1 fingerprint scope parsing and coverage.
//
// A Stage 1 fingerprint is one of:
//   stage1:v1:HASH            — full search (1, 2, 3, 4)
//   stage1:v1:HASH|sel:N      — single-quantity search (quantity N)
//   stage1:v1:HASH|rec:1,2,4  — cross-quantity recommendation scope
//
// The base (pre-`|`) part encodes room dimensions, RSP, seating, modal physics,
// algorithm and family policy — the inputs that invalidate ANY Stage 1 cache
// for the same design. The suffix encodes only WHICH quantities were searched.
//
// These helpers let the cache validator compare the base (preserving all
// existing fingerprint protections) and then check quantity COVERAGE, so a
// valid `[1,2,4]` cache hydrates a `[1,2,4]` request without requiring a
// three-subwoofer result that was never requested.
// ---------------------------------------------------------------------------

const ALL_STAGE1_QUANTITIES = Object.freeze([1, 2, 3, 4]);

/**
 * Parse a Stage 1 fingerprint into its base identity and the quantity scope it
 * searched. Unknown / malformed suffixes fall back to the full scope so a
 * corrupt record is never treated as a narrower (partial) one.
 *
 * @param {string|null|undefined} fingerprint
 * @returns {{base: string|null, scopeType: 'full'|'sel'|'rec', quantities: number[]}}
 */
export function parseStage1FingerprintScope(fingerprint) {
  if (!fingerprint || typeof fingerprint !== "string") {
    return { base: null, scopeType: "full", quantities: ALL_STAGE1_QUANTITIES.slice() };
  }
  const idx = fingerprint.indexOf("|");
  if (idx === -1) {
    return { base: fingerprint, scopeType: "full", quantities: ALL_STAGE1_QUANTITIES.slice() };
  }
  const base = fingerprint.slice(0, idx);
  const suffix = fingerprint.slice(idx + 1);
  if (suffix.startsWith("sel:")) {
    const n = Number(suffix.slice(4));
    return {
      base,
      scopeType: "sel",
      quantities: ALL_STAGE1_QUANTITIES.includes(n) ? [n] : [],
    };
  }
  if (suffix.startsWith("rec:")) {
    const qs = suffix
      .slice(4)
      .split(",")
      .map((v) => Number(v))
      .filter((n) => ALL_STAGE1_QUANTITIES.includes(n));
    return { base, scopeType: "rec", quantities: qs };
  }
  // Unknown suffix — treat as full so it can never masquerade as a narrower scope.
  return { base: fingerprint, scopeType: "full", quantities: ALL_STAGE1_QUANTITIES.slice() };
}

/**
 * Does a saved cache's searched quantity set cover every quantity requested
 * by the current run? A full saved cache covers any request; a `[1,2,4]` saved
 * cache covers `[1,2,4]` and any subset, but not a request that needs 3.
 *
 * @param {number[]} savedQuantities
 * @param {number[]} requestedQuantities
 * @returns {boolean}
 */
export function stage1ScopeCovers(savedQuantities, requestedQuantities) {
  if (!Array.isArray(requestedQuantities) || requestedQuantities.length === 0) return false;
  if (!Array.isArray(savedQuantities) || savedQuantities.length === 0) return false;
  const saved = new Set(savedQuantities);
  return requestedQuantities.every((q) => saved.has(q));
}