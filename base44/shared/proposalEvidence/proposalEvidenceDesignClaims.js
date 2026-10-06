/**
 * proposalEvidenceDesignClaims.js (shared)
 * -----------------------------------------
 * The whole-design half of the frozen proposal evidence pack: the decision
 * framing a comparison may use, the two claims that speak about the options
 * themselves (a credible design, and the stronger recommendation), and the bass
 * claim contract.
 *
 * THE FRAMING GUARD
 * -----------------
 * A framing that sets one option above the other — the Marquee "gives the room
 * the format / gives that format the authority" line — is allowed only where
 * every one of these is true:
 *
 *   1. the same room, from the reports' own room facts;
 *   2. the same screen;
 *   3. the same seating;
 *   4. the same system layout, and so the same channel count;
 *   5. the same acoustic treatment, or none stated in either report;
 *   6. a material dynamic-range gain (P12/P13/P14) for exactly one option;
 *   7. meaningful product differences behind that gain;
 *   8. P20 does not contradict it — the bass result must not materially favour
 *      the other option;
 *   9. the framing rests on the shared design, the dynamic range and the
 *      products, and never on seat-to-seat bass consistency.
 *
 * A framing whose wording claims "the same format" is therefore refused outright
 * when the screen or the seating changed: the sentence would not be true, and a
 * rewrite is not this module's job.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

import {
  BLOCK_REASON,
  CLASSIFICATION,
  CLAIM_KIND,
  DECISION_FRAMING_EQUIPMENT_KEYS,
  DECISION_FRAMING_PARAMETER_KEYS,
  buildBlockId,
  buildClaimId,
} from './evidencePackSchema.js';
import { basisOf, bestIndex, optionName, optionRef, reportSnapshotIds } from './proposalEvidenceClaims.js';
import {
  BASS_OUTPUT_AUTHORITY_SCOPE,
  buildBassConsistencyBlock,
  buildBassConsistencyNote,
} from './proposalEvidenceWording.js';

/** The scope key of a claim that speaks about the design as a whole. */
export const DESIGN_CLAIM_AREA = 'design';
export const DESIGN_CLAIM_LABEL = 'Design';

/** Finds one classification row by area key. */
function rowFinder(classification) {
  const list = Array.isArray(classification) ? classification : [];
  return (key) => list.find((row) => row.area === key) || null;
}

/** The single option a set of material rows agrees on, or -1 when they disagree. */
function agreedWinner(rows) {
  const winners = new Set((Array.isArray(rows) ? rows : [])
    .filter(Boolean)
    .map((row) => bestIndex(row))
    .filter((index) => index >= 0));
  return winners.size === 1 ? [...winners][0] : -1;
}

/** The dynamic-range rows carrying a material difference. */
function materialRangeRows(rowFor) {
  return DECISION_FRAMING_PARAMETER_KEYS.map(rowFor)
    .filter((row) => row?.classification === CLASSIFICATION.MATERIALLY_DIFFERENT);
}

/** The equipment areas the reports state differently. */
function equipmentRows(rowFor) {
  return DECISION_FRAMING_EQUIPMENT_KEYS
    .filter((key) => rowFor(key)?.classification === CLASSIFICATION.DIFFERENT);
}

/** Whether a treatment statement records no treatment at all. */
function statesNoTreatment(reading) {
  const text = typeof reading === 'string' ? reading : (reading?.text ?? null);
  if (!text) return true;
  const value = String(text).trim();
  return /^none( specified)?$/i.test(value) || /^no (acoustic )?treatment$/i.test(value);
}

/** The treatment the two reports state: the same, the same nothing, or neither. */
function treatmentBasis(row, options) {
  if (row?.classification === CLASSIFICATION.SAME) return 'identical_in_every_report';
  const noneInEither = (Array.isArray(options) ? options : [])
    .every((option) => statesNoTreatment(option?.areas?.acoustic_treatment));
  return noneInEither ? 'no_treatment_in_either_report' : null;
}

/**
 * The decision framing a two-option comparison may use, and the exact evidence
 * behind it. `allowed: false` names the first condition the evidence fails.
 *
 * @param {Array<Object>} classification
 * @param {Array<Object>} options — each option's facts, in order
 * @returns {{ allowed: boolean, reason: string, text: string|null, evidence: Object }}
 */
export function buildDecisionFraming(classification = [], options = []) {
  const rowFor = rowFinder(classification);
  const refuse = (reason, evidence = {}) => ({ allowed: false, reason, text: null, evidence });

  if (options.length !== 2) return refuse('not_a_two_option_comparison');

  const room = rowFor('room');
  if (room?.classification !== CLASSIFICATION.SAME) {
    return refuse('room_is_not_shared', { room: room?.classification ?? null });
  }
  const screen = rowFor('screen_size');
  if (screen?.classification !== CLASSIFICATION.SAME) {
    return refuse('screen_is_not_shared', { screen_size: screen?.classification ?? null });
  }
  const seating = rowFor('seating');
  if (seating?.classification !== CLASSIFICATION.SAME) {
    return refuse('seating_is_not_shared', { seating: seating?.classification ?? null });
  }
  const layout = rowFor('system_layout');
  if (layout?.classification !== CLASSIFICATION.SAME) {
    return refuse('format_is_not_shared', { system_layout: layout?.classification ?? null });
  }
  const treatment = rowFor('acoustic_treatment');
  const treatmentState = treatmentBasis(treatment, options);
  if (!treatmentState) {
    return refuse('acoustic_treatment_is_not_compatible', {
      acoustic_treatment: treatment?.classification ?? null,
    });
  }

  const material = materialRangeRows(rowFor);
  if (material.length === 0) return refuse('no_material_dynamic_range_evidence');
  const winner = agreedWinner(material);
  if (winner < 0) return refuse('no_single_option_supported');

  const equipment = equipmentRows(rowFor);
  if (equipment.length === 0) return refuse('no_product_difference');

  const p20 = rowFor('p20');
  const p20Material = p20?.classification === CLASSIFICATION.MATERIALLY_DIFFERENT;
  const p20Winner = p20Material ? bestIndex(p20) : -1;
  const p20Evidence = {
    classification: p20?.classification ?? null,
    levels: p20?.levels ?? [],
    values: p20?.values ?? [],
    supports_framing: p20Winner < 0 || p20Winner === winner,
    consistency_claims: p20Material ? 'supported' : 'blocked',
  };
  if (!p20Evidence.supports_framing) return refuse('p20_contradicts_the_framing', { p20: p20Evidence });

  const base = winner === 0 ? 1 : 0;
  return {
    allowed: true,
    reason: 'shared_design_with_material_dynamic_range_and_products',
    text: `${optionName(options[base], base)} gives the room the format. `
      + `${optionName(options[winner], winner)} gives that format the authority to feel like a serious dedicated cinema.`,
    evidence: {
      shared_areas: ['room', 'screen_size', 'seating', 'system_layout'],
      acoustic_treatment: treatmentState,
      material_areas: material.map((row) => row.area),
      equipment_areas: equipment,
      option: optionRef(options[winner]),
      option_index: winner,
      p20: p20Evidence,
      rests_on: ['shared_design', 'material_dynamic_range', 'product_differences'],
      excludes: ['seat_to_seat_bass_consistency'],
    },
  };
}

/**
 * The two claims that speak about the options themselves: that the option
 * without the material gain is still a credible design, and that the option with
 * it is the stronger recommendation where maximum performance is the priority.
 *
 * @param {Array<Object>} classification
 * @param {Array<Object>} options
 * @param {Object|null} framing — the framing the recommendation rests on
 * @returns {Array<Object>}
 */
export function buildDesignClaims(classification = [], options = [], framing = null) {
  const list = Array.isArray(classification) ? classification : [];
  if (list.length === 0 || options.length < 2) return [];
  const rowFor = rowFinder(list);
  const claims = [];

  // A credible design: the option that does not take the material gain keeps its
  // credibility, and where no material gain exists at all, every option does.
  const layout = rowFor('system_layout');
  if (layout?.classification === CLASSIFICATION.SAME) {
    const winner = agreedWinner(materialRangeRows(rowFor));
    const credible = winner >= 0 ? [winner === 0 ? 1 : 0] : options.map((_, index) => index);
    credible.forEach((index, position) => {
      const option = options[index];
      const format = option?.facts?.system?.format;
      if (!format) return;
      claims.push({
        claim_id: buildClaimId(DESIGN_CLAIM_AREA, CLAIM_KIND.CREDIBILITY, position + 1),
        area: DESIGN_CLAIM_AREA,
        label: DESIGN_CLAIM_LABEL,
        kind: CLAIM_KIND.CREDIBILITY,
        statement: `${optionName(option, index)} remains a credible ${format} design.`,
        option: optionRef(option),
        favours: false,
        basis: { ...basisOf(layout, options), supports: ['shared_design'] },
      });
    });
  }

  if (framing?.allowed === true) {
    const index = Number(framing?.evidence?.option_index);
    const option = Number.isInteger(index) ? options[index] : null;
    if (option) {
      claims.push({
        claim_id: buildClaimId(DESIGN_CLAIM_AREA, CLAIM_KIND.RECOMMENDATION, 1),
        area: DESIGN_CLAIM_AREA,
        label: DESIGN_CLAIM_LABEL,
        kind: CLAIM_KIND.RECOMMENDATION,
        statement: `${optionName(option, index)} is the stronger recommendation `
          + 'where maximum performance and headroom are the priority.',
        option: optionRef(option),
        favours: true,
        basis: {
          classification: CLASSIFICATION.MATERIALLY_DIFFERENT,
          reason: framing.reason,
          values: framing.evidence?.material_areas ?? [],
          levels: [],
          material_areas: framing.evidence?.material_areas ?? [],
          product_differences: framing.evidence?.equipment_areas ?? [],
          bass_consistency_claims: framing.evidence?.p20?.consistency_claims ?? 'blocked',
          report_snapshot_ids: reportSnapshotIds(options),
        },
      });
    }
  }

  return claims;
}

/** The bass claim contract of a single-option pack: nothing is comparable. */
export function emptyBassClaims() {
  return {
    p20: null,
    p14: null,
    allowed: [],
    blocked: [],
    scope: BASS_OUTPUT_AUTHORITY_SCOPE,
    note: null,
  };
}

/**
 * The bass claim contract: what may be said about low-frequency performance,
 * what may not, and the note behind P20.
 *
 * @param {Array<Object>} classification
 * @param {Array<Object>} options
 * @param {Array<Object>} allowedClaims — the claims already minted for this pack
 * @returns {Object}
 */
export function buildBassClaims(classification = [], options = [], allowedClaims = []) {
  const rowFor = rowFinder(classification);
  const claims = Array.isArray(allowedClaims) ? allowedClaims : [];
  const p20 = rowFor('p20');
  const p14 = rowFor('p14');

  const winner = agreedWinner(materialRangeRows(rowFor));
  const gain = claims.find((claim) => claim.area === 'p14' && claim.kind === CLAIM_KIND.MATERIAL_GAIN) || null;
  const supported = p20?.classification === CLASSIFICATION.MATERIALLY_DIFFERENT;

  const allowed = [];
  if (gain) {
    allowed.push({
      claim_id: gain.claim_id,
      scope: 'bass_output_authority',
      text: gain.statement,
    });
  }

  // The subwoofer specification is a stated change, never a claimed gain, and no
  // figure is recalculated: the values are the reports' own Products Selected rows.
  const specification = rowFor('subwoofers');
  const specificationClaim = claims
    .find((claim) => claim.area === 'subwoofers' && claim.kind === CLAIM_KIND.FACTUAL_CHANGE) || null;
  if (specification?.classification === CLASSIFICATION.DIFFERENT && winner >= 0 && specificationClaim) {
    const base = winner === 0 ? 1 : 0;
    allowed.push({
      claim_id: specificationClaim.claim_id,
      scope: 'subwoofer_specification',
      text: `${optionName(options[winner], winner)} is specified with ${specification.values[winner]} `
        + `rather than ${specification.values[base]}.`,
    });
  }

  if (supported) {
    const consistency = claims.find((claim) => claim.area === 'p20' && claim.kind === CLAIM_KIND.MATERIAL_GAIN) || null;
    if (consistency) {
      allowed.push({
        claim_id: consistency.claim_id,
        scope: 'seat_to_seat_consistency',
        text: consistency.statement,
      });
    }
  }

  const blocked = supported
    ? []
    : [{
      ...buildBassConsistencyBlock(),
      block_id: buildBlockId('p20', BLOCK_REASON.NO_SOLVED_BASS_CONSISTENCY, 1),
    }];

  return {
    p20: p20 ? {
      classification: p20.classification,
      reason: p20.reason,
      levels: p20.levels ?? [],
      values: p20.values ?? [],
      supports_consistency: supported,
    } : null,
    p14: p14 ? {
      classification: p14.classification,
      reason: p14.reason,
      levels: p14.levels ?? [],
      values: p14.values ?? [],
    } : null,
    allowed,
    blocked,
    scope: BASS_OUTPUT_AUTHORITY_SCOPE,
    note: p20
      ? buildBassConsistencyNote({
        levels: p20.levels,
        outputAuthorityOptionName: gain?.option?.version_name || null,
      })
      : null,
  };
}