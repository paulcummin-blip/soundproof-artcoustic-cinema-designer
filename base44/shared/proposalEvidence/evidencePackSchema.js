/**
 * evidencePackSchema.js (shared)
 * ------------------------------
 * The frozen proposal evidence pack: its version, its shape and its vocabulary.
 *
 * Sound Proof is the engineering authority. The pack is the only thing a writer
 * is given, and this module names what the pack may say: the five
 * classifications (same, different, materially different, not materially
 * different, not comparable), the four allowed claim kinds, and the reasons a
 * claim is blocked.
 *
 * The area list is deliberately NOT a second opinion. It is the canonical
 * comparison area order and the printed area names from comparisonTable.js, so a
 * proposal, a comparison table and this pack all speak about one set of areas
 * with one set of words.
 *
 * CLAIM ID STRUCTURE
 * ------------------
 *   allowed claim   claim_<area>_<kind>_<nn>     e.g. claim_p12_material_gain_01
 *   blocked claim   block_<scope>_<reason>_<nn>  e.g. block_global_no_changed_values_01
 *
 * <area>  is a canonical area key (p12, system_layout, subwoofers, ...);
 * <kind>  is a CLAIM_KIND value;
 * <scope> is 'global' for a rule that applies to the whole proposal, or an area
 *         key for a rule about that area;
 * <nn>    is a two-digit sequence. A claim kind occurs once per area, so the
 *         sequence is 01 today; it exists so a future rule can mint a second
 *         claim of the same kind without changing an ID that is already stored.
 *
 * An ID is derived from the evidence alone, so the same pack always mints the
 * same IDs and a generated sentence can always be traced to the claim behind it.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

import { COMPARISON_ROW_ORDER, ROW_LABELS } from '../comparisonTable.js';
import { structureForParameter } from '../adiReportEvidenceRules.js';

/** The pack payload generation. A pack of another generation is never read. */
export const PROPOSAL_EVIDENCE_SCHEMA_VERSION = 1;

/** Every classification a design area may carry. A writer reasons only in these. */
export const CLASSIFICATION = Object.freeze({
  SAME: 'same',
  DIFFERENT: 'different',
  MATERIALLY_DIFFERENT: 'materially_different',
  NOT_MATERIALLY_DIFFERENT: 'not_materially_different',
  NOT_COMPARABLE: 'not_comparable',
});

/** How the evidence for an area is read, which decides how it is classified. */
export const AREA_KIND = Object.freeze({
  /** An RP22 result or the RP23 viewing floor: graded L1 to L4. */
  GRADED: 'graded',
  /** An item of equipment: a change of model is a change of equipment. */
  EQUIPMENT: 'equipment',
  /** The room, screen, seating or system format: a stated design choice. */
  STRUCTURAL: 'structural',
});

/** The claims a writer may make from this pack. */
export const CLAIM_KIND = Object.freeze({
  /** A material result for one option: the higher-graded option. */
  MATERIAL_GAIN: 'material_gain',
  /** An option's own stated result where no material difference exists. */
  MODEST_RESULT: 'modest_result',
  /** An area every option states identically. */
  SHARED_RESULT: 'shared_result',
  /** A stated difference that is a change of equipment or geometry, not a gain. */
  FACTUAL_CHANGE: 'factual_change',
});

/** Why a claim is blocked. Each reason carries its own client-safe sentence. */
export const BLOCK_REASON = Object.freeze({
  NO_INVENTED_BENEFITS: 'no_invented_benefits',
  NO_CHANGED_VALUES: 'no_changed_values',
  NO_UNSELECTED_PRODUCTS: 'no_unselected_products',
  NO_RECALCULATION: 'no_recalculation',
  NO_REDESIGN_RECOMMENDATION: 'no_redesign_recommendation',
  NO_UNIVERSAL_IMPROVEMENT: 'no_universal_improvement',
  NO_DECISION_FRAMING: 'no_decision_framing',
  NO_CLAIMED_CHANGE: 'no_claimed_change',
  NO_CLAIMED_IMPROVEMENT: 'no_claimed_improvement',
  NO_ADDED_CHANNELS: 'no_added_channels',
  NO_SCREEN_CHANGE: 'no_screen_change',
  NO_SEATING_CHANGE: 'no_seating_change',
  NO_SOLVED_BASS_CONSISTENCY: 'no_solved_bass_consistency',
  NOT_COMPARABLE: 'not_comparable',
});

/**
 * The levels that make a difference material. This is the report's own
 * "positive result" set (P20_POSITIVE_LEVELS) and the same line the client
 * meaning authority draws when it refuses to sell an L1 or L2 result as a
 * strength. A difference between two low-grade results is therefore a stated
 * difference, never a material gain.
 */
export const MATERIAL_RESULT_LEVELS = Object.freeze(['L3', 'L4']);

/** The dynamic-range results that can carry a decision framing. */
export const DECISION_FRAMING_PARAMETER_KEYS = Object.freeze(['p12', 'p13', 'p14']);

/** The equipment areas whose change supports a decision framing. */
export const DECISION_FRAMING_EQUIPMENT_KEYS = Object.freeze([
  'speakers',
  'lcr',
  'surrounds',
  'overheads',
  'subwoofers',
  'amplification',
  'acoustic_treatment',
]);

/** The areas that are not RP22 parameters, with how each one is read. */
const NON_PARAMETER_KINDS = Object.freeze({
  screen_size: AREA_KIND.STRUCTURAL,
  system_layout: AREA_KIND.STRUCTURAL,
  seating: AREA_KIND.STRUCTURAL,
  rp23_viewing: AREA_KIND.GRADED,
  speakers: AREA_KIND.EQUIPMENT,
  lcr: AREA_KIND.EQUIPMENT,
  surrounds: AREA_KIND.EQUIPMENT,
  overheads: AREA_KIND.EQUIPMENT,
  subwoofers: AREA_KIND.EQUIPMENT,
  acoustic_treatment: AREA_KIND.EQUIPMENT,
  amplification: AREA_KIND.EQUIPMENT,
});

/** The RP22 design structure an area belongs to, or null for a non-parameter. */
function structureOf(key) {
  if (key === 'rp23_viewing') return 'Viewing';
  const match = /^p(\d+)$/.exec(key);
  return match ? structureForParameter(Number(match[1])) : null;
}

/**
 * The major design areas the pack classifies, in the canonical comparison order.
 * Excluded parameters (P8, P15, P21) are absent by construction: they are not in
 * the canonical order and never reach a client-facing surface.
 */
export const PROPOSAL_EVIDENCE_AREAS = Object.freeze(COMPARISON_ROW_ORDER.map((key) => Object.freeze({
  key,
  label: ROW_LABELS[key] || key,
  kind: NON_PARAMETER_KINDS[key] || AREA_KIND.GRADED,
  structure: structureOf(key),
})));

/** The area definition for a key, or null. */
export function areaByKey(key) {
  return PROPOSAL_EVIDENCE_AREAS.find((area) => area.key === key) || null;
}

/** The stable ID of an allowed claim. */
export function buildClaimId(areaKey, kind, index = 1) {
  return `claim_${areaKey}_${kind}_${String(index).padStart(2, '0')}`;
}

/** The stable ID of a blocked claim. */
export function buildBlockId(scope, reason, index = 1) {
  return `block_${scope}_${reason}_${String(index).padStart(2, '0')}`;
}