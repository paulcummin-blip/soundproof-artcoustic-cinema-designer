// optimiserLiveFamilies.js
// ---------------------------------------------------------------------------
// WHICH families the optimiser genuinely evaluates today — the ONE authority the
// "What ADI tested" table reads.
//
// Product rule this exists to satisfy: a row appears in the default tested table
// ONLY when ADI actually evaluates that option in the current run. A capability
// that is not live yet is never presented as a tested lever and never as "Not
// yet supported" in the designer's main view — it is stated once, as a future
// capability, in the collapsed Engineer details.
//
// The engine's own search evidence is unchanged. This module decides only what
// the DEFAULT TABLE may claim, so the designer never reads a row as something
// ADI tested for them when the model cannot evaluate it.
//
// READ-ONLY presentation metadata: no bass maths, no optimiser scoring, no RP22
// grading, no P18/P19/P20 definition.
// ---------------------------------------------------------------------------

import { CROSSOVER_REGION_PHASE_SUPPORTED } from "./crossoverRegionPhaseAuthority.js";

/**
 * The families ADI evaluates in the current run, in least-intrusive order:
 *
 *   Delay · Gain · Polarity · Placement · Layout · Seating
 *
 * Phase / crossover-region alignment joins this list at position 3 as soon as
 * the engine gains a crossover-region model (CROSSOVER_REGION_PHASE_SUPPORTED is
 * the single switch, and the lever already sits third in the fixed order).
 * Subwoofer model / quantity comparison joins after Layout if the optimiser is
 * ever made to compare models or quantities. Neither is claimed today, and
 * neither may be added here by hand while its capability is absent.
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
 * Whether ADI genuinely evaluates this family in the current run.
 * The crossover-region switch is read from its own authority, never restated
 * here, so the tested table can never claim a capability the model lacks.
 */
export function isLiveFamily(key) {
  if (key === "phase") return CROSSOVER_REGION_PHASE_SUPPORTED === true;
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