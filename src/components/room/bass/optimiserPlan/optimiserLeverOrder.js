// optimiserLeverOrder.js
// ---------------------------------------------------------------------------
// The least-intrusive lever order, and the dealer-facing name for every lever.
//
// Product rule: electronic changes are far less disruptive than moving boxes or
// seating, so ADI always lists and evaluates them in this order:
//
//   1. Delay      — front/rear timing
//   2. Gain       — front/rear level balance
//   3. Phase      — crossover-region alignment
//   4. Polarity   — inversion test
//   5. Placement  — move subwoofers
//   6. Layout     — different sub arrangement
//   7. Subwoofer option — different model or quantity
//   8. Seating    — move listener positions
//
// READ-ONLY presentation metadata. This module evaluates nothing and changes no
// optimiser behaviour, scoring, bass maths or RP22 definition.
// ---------------------------------------------------------------------------

/** Least-intrusive-first order of the levers ADI presents. */
export const OPTIMISER_LEVER_SEQUENCE = Object.freeze([
  "delay",
  "gain",
  "phase",
  "polarity",
  "placement",
]);

/** Dealer-facing name and one-line purpose of each lever. */
export const LEVER_PRESENTATION = Object.freeze({
  delay: { label: "Delay", descriptor: "front/rear timing" },
  gain: { label: "Gain", descriptor: "front/rear level balance" },
  phase: { label: "Phase", descriptor: "crossover-region alignment" },
  polarity: { label: "Polarity", descriptor: "inversion test" },
  placement: { label: "Placement", descriptor: "move subwoofers" },
  layout: { label: "Layout", descriptor: "different sub arrangement" },
  subwoofer_option: { label: "Subwoofer option", descriptor: "different model or quantity" },
  seating: { label: "Seating", descriptor: "move listener positions" },
});

/** Order of the eight families ADI reports on, least intrusive first. */
export const OPTIMISER_FAMILY_SEQUENCE = Object.freeze([
  "delay",
  "gain",
  "phase",
  "polarity",
  "placement",
  "layout",
  "subwoofer_option",
  "seating",
]);

/** The run's family keys, mapped to the lever they present as. */
const FAMILY_TO_LEVER = Object.freeze({
  delay: "delay",
  gain: "gain",
  phase: "phase",
  polarity: "polarity",
  placement: "placement",
  additional_positions: "layout",
  subwoofer_option: "subwoofer_option",
  seat_movement: "seating",
});

/** "Delay — front/rear timing", or null for an unknown lever. */
export function leverTitle(leverKey) {
  const entry = LEVER_PRESENTATION[leverKey];
  return entry ? `${entry.label} — ${entry.descriptor}` : null;
}

/** "Delay", or null for an unknown lever. */
export function leverLabel(leverKey) {
  return LEVER_PRESENTATION[leverKey]?.label || null;
}

/** Position of a run family in the least-intrusive order. Unknown families last. */
export function familySequenceIndex(familyKey) {
  const index = OPTIMISER_FAMILY_SEQUENCE.indexOf(FAMILY_TO_LEVER[familyKey]);
  return index === -1 ? OPTIMISER_FAMILY_SEQUENCE.length : index;
}

/** The eight families in least-intrusive order. */
export function sortFamiliesLeastIntrusive(families = []) {
  return [...families].sort((a, b) => familySequenceIndex(a?.family) - familySequenceIndex(b?.family));
}

/** Stated once, above the lever list. */
export const LEAST_INTRUSIVE_NOTE =
  "ADI tests the least-intrusive options first — electronic alignment before moving subwoofers or seating.";

/**
 * The families a saved Optimisation Plan cannot carry a result for. Stated with
 * the plan so nothing is silently omitted: each line says what the optimiser
 * does and does not search, in the same order as the lever list.
 */
export const PLAN_FAMILY_STATEMENTS = Object.freeze([
  {
    key: "phase",
    statement:
      "Crossover-region phase is not yet supported. The optimiser does not model phase between "
      + "the main speakers and subwoofers through the 80–150 Hz crossover region, so no phase "
      + "change is offered for separate application.",
  },
  {
    key: "layout",
    statement:
      "A different sub arrangement is searched only as an alternative placement; when no arrangement was retained, none is offered.",
  },
  {
    key: "subwoofer_option",
    statement:
      "The optimiser does not search alternative subwoofer models or quantities. Compare models separately (for example 2 × SUB4-12 against 4 × SUB3-12).",
  },
  {
    key: "seating",
    statement:
      "Listener movement is a last resort and is searched only after the electronic and placement options are exhausted.",
  },
]);