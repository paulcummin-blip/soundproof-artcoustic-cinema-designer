// optimiserLiveFamilies.js
// ---------------------------------------------------------------------------
// WHICH levers the "What ADI tested" table states — the ONE authority the table
// reads.
//
// Product rule this exists to satisfy: the table reports the levers ADI actually
// tests, in the fixed least-intrusive order, and each row states what happened to
// that lever. An evaluated lever reports its own outcome (Recommended · Tested ·
// Rejected · Trade-off).
//
// The table states ONLY the levers the optimiser currently evaluates: Delay ·
// Gain · Polarity · Placement · Layout · Seating (low-frequency absorption advice
// is appended after them). A capability the optimiser does not evaluate at all is
// not a row — the table never lists a lever it cannot test, and never carries a
// "Not yet supported" row. Subwoofer model / quantity is a design decision rather
// than a searched lever, so it is stated once in the collapsed Engineer details.
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
 *   Delay · Gain · Polarity · Placement · Layout · Seating
 *
 * Low-frequency absorption advice is appended after them by the summary.
 * Subwoofer model / quantity is deliberately NOT here: it is a design decision,
 * not a lever the optimiser searches. Phase / crossover-region alignment is not
 * here either: the optimiser does not evaluate it, so the table does not list it.
 */
export const OPTIMISER_LIVE_FAMILIES = Object.freeze([
  "delay",
  "gain",
  "polarity",
  "placement",
  "layout",
  "seating",
]);

/**
 * Capabilities that are not evaluated in the current run, stated verbatim
 * wherever they are shown. This is the ONLY sentence the card may carry about
 * it: it is never a tested-table row.
 */
export const OPTIMISER_FUTURE_CAPABILITY = Object.freeze({
  subwoofer_option: {
    label: "Subwoofer model / quantity comparison",
    statement:
      "Subwoofer model and quantity comparison is not currently part of this optimisation run.",
  },
});

/** The order those future capabilities are stated in. */
export const OPTIMISER_FUTURE_CAPABILITY_KEYS = Object.freeze([
  "subwoofer_option",
]);

/** Heading for the collapsed future-capability note. */
export const FUTURE_CAPABILITY_TITLE = "Future / not currently evaluated";

/**
 * Whether the tested table states this lever. Only levers the optimiser actually
 * evaluates are stated: a capability it cannot test is not a row, and is never
 * presented as an outstanding or unsupported lever.
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