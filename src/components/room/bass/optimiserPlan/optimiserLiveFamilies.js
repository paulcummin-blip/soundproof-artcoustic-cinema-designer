// optimiserLiveFamilies.js
// ---------------------------------------------------------------------------
// WHICH levers the "What ADI tested" table states — the ONE authority the table
// reads.
//
// Product rule this exists to satisfy: the table reports EVERY lever in the
// fixed least-intrusive order, and each row states what happened to that lever.
// An evaluated lever reports its own outcome (Recommended · Tested · Rejected ·
// Trade-off). A lever the model does not evaluate is stated as "Not yet
// supported" WITH its reason in its own row — never left out, never shown as an
// evaluated lever, and never used to describe a lever the optimiser does search.
//
// Phase / crossover-region alignment is therefore a row (third, where it has
// always sat in the order) reading "Not yet supported — crossover-region model
// not available". Subwoofer model / quantity is a design decision rather than a
// searched lever, so it is stated once in the collapsed Engineer details.
//
// The engine's own search evidence is unchanged. This module decides only which
// levers the table states.
//
// READ-ONLY presentation metadata: no bass maths, no optimiser scoring, no RP22
// grading, no P18/P19/P20 definition.
// ---------------------------------------------------------------------------

/**
 * The levers the tested table states, in least-intrusive order:
 *
 *   Delay · Gain · Phase · Polarity · Placement · Layout · Seating
 *
 * Low-frequency absorption advice is appended after them by the summary.
 * Subwoofer model / quantity is deliberately NOT here: it is a design decision,
 * not a lever the optimiser searches.
 */
export const OPTIMISER_LIVE_FAMILIES = Object.freeze([
  "delay",
  "gain",
  "phase",
  "polarity",
  "placement",
  "layout",
  "seating",
]);

/**
 * Capabilities that are not evaluated in the current run, stated verbatim
 * wherever they are shown. These are the ONLY sentences the card may carry about
 * them: neither is ever a tested-table row.
 */
export const OPTIMISER_FUTURE_CAPABILITY = Object.freeze({
  phase: {
    label: "Phase / crossover-region alignment",
    statement:
      "Phase / crossover-region alignment is not currently evaluated. This requires modelling "
      + "main speaker and subwoofer summation through the crossover region.",
  },
  subwoofer_option: {
    label: "Subwoofer model / quantity comparison",
    statement:
      "Subwoofer model and quantity comparison is not currently part of this optimisation run.",
  },
});

/** The order those future capabilities are stated in. */
export const OPTIMISER_FUTURE_CAPABILITY_KEYS = Object.freeze([
  "phase",
  "subwoofer_option",
]);

/** Heading for the collapsed future-capability note. */
export const FUTURE_CAPABILITY_TITLE = "Future / not currently evaluated";

/**
 * Whether the tested table states this lever. A lever that is stated but not
 * evaluated (phase / crossover-region) still gets its own row, carrying the
 * "Not yet supported" statement and the reason.
 */
export function isLiveFamily(key) {
  if (key === "subwoofer_option") return false;
  return OPTIMISER_LIVE_FAMILIES.includes(key);
}

/** The given keys, in their own order, with the families ADI does not evaluate removed. */
export function liveFamilyKeys(keys = []) {
  return (Array.isArray(keys) ? keys : []).filter((key) => isLiveFamily(key));
}

/** The future capabilities still outstanding, in the fixed order. */
export function buildFutureCapabilityNotes() {
  return OPTIMISER_FUTURE_CAPABILITY_KEYS
    .filter((key) => !isLiveFamily(key))
    .map((key) => ({ key, ...OPTIMISER_FUTURE_CAPABILITY[key] }));
}