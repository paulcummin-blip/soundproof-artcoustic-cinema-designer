/**
 * proposalEvidenceClaims.js (shared)
 * ----------------------------------
 * The CLAIMS half of the frozen proposal evidence pack: the claims a writer may
 * make, the claims it must not make, the materiality note behind each important
 * difference, and the decision framing a Marquee-style comparison may use.
 *
 * No wording is invented here. Every allowed claim's sentence comes from the one
 * client meaning authority (comparisonClientMeaning), scoped to the option the
 * claim is about, so a claim can never describe an option with wording the
 * evidence does not support. Every blocked claim is derived from a
 * classification: an area the reports share blocks a claimed change, an area
 * without a material difference blocks a claimed improvement.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

import comparisonClientMeaning from '../comparisonClientMeaning.js';
import {
  BLOCK_REASON,
  CLASSIFICATION,
  CLAIM_KIND,
  DECISION_FRAMING_EQUIPMENT_KEYS,
  DECISION_FRAMING_PARAMETER_KEYS,
  MATERIAL_RESULT_LEVELS,
  buildBlockId,
  buildClaimId,
} from './evidencePackSchema.js';

/** The client meaning for an area, read from the authority that owns the wording. */
function meaning(areaKey, values) {
  return comparisonClientMeaning({ key: areaKey, values, identical: false });
}

function optionName(option, index) {
  return option?.version_name || option?.label || `Option ${String.fromCharCode(65 + index)}`;
}

function optionRef(option) {
  return {
    version_id: option?.version_id ?? null,
    version_name: option?.version_name ?? null,
    label: option?.label ?? null,
  };
}

/** The report evidence each claim rests on, so a claim is always traceable. */
function basisOf(row, options) {
  return {
    classification: row.classification,
    reason: row.reason,
    values: row.values,
    levels: row.levels || [],
    report_snapshot_ids: options.map((option) => ({
      version_id: option.version_id,
      visual_report_snapshot_id: option.facts?.report_snapshot_ids?.visual ?? null,
      technical_report_snapshot_id: option.facts?.report_snapshot_ids?.technical ?? null,
    })),
  };
}

/** The strongest option in a graded row, by its level. */
function bestIndex(row) {
  let best = -1;
  let bestLevel = 0;
  row.levels.forEach((level, index) => {
    const value = level ? Number(level.slice(1)) : 0;
    if (value > bestLevel) {
      bestLevel = value;
      best = index;
    }
  });
  return best;
}

/** The weakest option in a graded row, by its level. */
function worstIndex(row) {
  let worst = -1;
  let worstLevel = 5;
  row.levels.forEach((level, index) => {
    const value = level ? Number(level.slice(1)) : 5;
    if (value < worstLevel) {
      worstLevel = value;
      worst = index;
    }
  });
  return worst;
}

/**
 * The claims a writer may make from this pack. Each claim names the option it is
 * about (and, for a material gain, the option it favours) and the report
 * evidence behind it.
 *
 * @param {Array<Object>} classification
 * @param {Array<Object>} options — each option's facts, in order
 * @returns {Array<Object>}
 */
export function buildAllowedClaims(classification = [], options = []) {
  const list = Array.isArray(classification) ? classification : [];
  const claims = [];

  for (const row of list) {
    if (row.classification === CLASSIFICATION.SAME) {
      claims.push({
        claim_id: buildClaimId(row.area, CLAIM_KIND.SHARED_RESULT),
        area: row.area,
        label: row.label,
        kind: CLAIM_KIND.SHARED_RESULT,
        statement: options.length === 2
          ? comparisonClientMeaning({ key: row.area, values: row.values, identical: true })
          : `All options share the same ${row.label.toLowerCase()}.`,
        option: null,
        favours: false,
        basis: basisOf(row, options),
      });
      continue;
    }

    // A stated difference that is not a graded gain: a change of equipment, or
    // of the screen, seating or system format. It is reportable as the change it
    // is, and it is never described as a gain.
    if (row.classification === CLASSIFICATION.DIFFERENT) {
      claims.push({
        claim_id: buildClaimId(row.area, CLAIM_KIND.FACTUAL_CHANGE),
        area: row.area,
        label: row.label,
        kind: CLAIM_KIND.FACTUAL_CHANGE,
        statement: meaning(row.area, row.values),
        option: null,
        favours: false,
        basis: basisOf(row, options),
      });
      continue;
    }

    if (row.classification === CLASSIFICATION.NOT_MATERIALLY_DIFFERENT) {
      claims.push({
        claim_id: buildClaimId(row.area, CLAIM_KIND.MODEST_RESULT),
        area: row.area,
        label: row.label,
        kind: CLAIM_KIND.MODEST_RESULT,
        statement: meaning(row.area, row.values),
        option: null,
        favours: false,
        basis: basisOf(row, options),
      });
      continue;
    }

    if (row.classification !== CLASSIFICATION.MATERIALLY_DIFFERENT) continue;

    const winner = bestIndex(row);
    if (winner >= 0) {
      claims.push({
        claim_id: buildClaimId(row.area, CLAIM_KIND.MATERIAL_GAIN),
        area: row.area,
        label: row.label,
        kind: CLAIM_KIND.MATERIAL_GAIN,
        // The gain is described for the option that achieved it, from that
        // option's own stated result, so the wording can never describe the
        // weaker option as if it were the stronger one.
        statement: meaning(row.area, [row.values[winner]]),
        option: optionRef(options[winner]),
        favours: true,
        basis: basisOf(row, options),
      });
    }

    const loser = worstIndex(row);
    if (loser >= 0 && loser !== winner && !MATERIAL_RESULT_LEVELS.includes(row.levels[loser])) {
      claims.push({
        claim_id: buildClaimId(row.area, CLAIM_KIND.MODEST_RESULT),
        area: row.area,
        label: row.label,
        kind: CLAIM_KIND.MODEST_RESULT,
        statement: meaning(row.area, [row.values[loser]]),
        option: optionRef(options[loser]),
        favours: false,
        basis: basisOf(row, options),
      });
    }
  }

  return claims;
}

/** The materiality note behind each important difference, in the claim's own words. */
export function buildMaterialityNotes(claims = []) {
  const notable = [CLAIM_KIND.MATERIAL_GAIN, CLAIM_KIND.FACTUAL_CHANGE, CLAIM_KIND.MODEST_RESULT];
  return (Array.isArray(claims) ? claims : [])
    .filter((claim) => notable.includes(claim.kind))
    .map((claim) => ({
      area: claim.area,
      label: claim.label,
      classification: claim.basis.classification,
      kind: claim.kind,
      note: claim.statement,
      option: claim.option,
    }));
}

/** The claims the writer must not make, each with the reason it is blocked. */
export function buildBlockedClaims(classification = [], options = [], framing = null) {
  const list = Array.isArray(classification) ? classification : [];
  const blocked = [];
  const add = (scope, reason, prohibited, detail = null, area = null) => {
    blocked.push({
      block_id: buildBlockId(scope, reason, blocked.length + 1),
      scope,
      area,
      reason,
      prohibited,
      detail,
    });
  };

  // Global rules. They hold whatever the evidence says, because they define what
  // a proposal is: a statement of the frozen design, not a new design.
  add('global', BLOCK_REASON.NO_INVENTED_BENEFITS,
    'Do not invent a benefit: every client-facing claim must be one of the allowed claims in this pack.');
  add('global', BLOCK_REASON.NO_CHANGED_VALUES,
    'Never change, round or restate a value: every figure is copied exactly as this pack states it.');
  add('global', BLOCK_REASON.NO_UNSELECTED_PRODUCTS,
    'Never name a product that is not listed for the option it belongs to in this pack.');
  add('global', BLOCK_REASON.NO_RECALCULATION,
    'Never calculate, estimate or infer a result: this pack is the only source of performance figures.');
  add('global', BLOCK_REASON.NO_REDESIGN_RECOMMENDATION,
    'Do not recommend changing the design: the proposal states the final design, it is not a set of next steps.');
  add('global', BLOCK_REASON.NO_UNIVERSAL_IMPROVEMENT,
    'Do not claim every parameter improves: claim only what this pack records as a material gain.');

  for (const row of list) {
    if (row.classification === CLASSIFICATION.SAME) {
      add(row.area, BLOCK_REASON.NO_CLAIMED_CHANGE,
        `Do not state or imply a change in ${row.label.toLowerCase()}: every report states it identically.`,
        row.values.join(' | '), row.area);
    }
    if (row.classification === CLASSIFICATION.NOT_MATERIALLY_DIFFERENT) {
      add(row.area, BLOCK_REASON.NO_CLAIMED_IMPROVEMENT,
        `Do not claim an improvement in ${row.label.toLowerCase()}: the reports show no material difference.`,
        row.reason, row.area);
    }
    if (row.classification === CLASSIFICATION.NOT_COMPARABLE) {
      add(row.area, BLOCK_REASON.NOT_COMPARABLE,
        `Do not compare or describe ${row.label.toLowerCase()}: the reports do not both state it.`,
        row.reason, row.area);
    }
  }

  const layout = list.find((row) => row.area === 'system_layout');
  if (layout?.classification === CLASSIFICATION.SAME) {
    add('system_layout', BLOCK_REASON.NO_ADDED_CHANNELS,
      'Do not claim any option adds channels or a larger format: every option uses the same system layout.');
  }
  const screen = list.find((row) => row.area === 'screen_size');
  if (screen?.classification === CLASSIFICATION.SAME) {
    add('screen_size', BLOCK_REASON.NO_SCREEN_CHANGE,
      'Do not claim any option changes the screen: both options are designed around the same screen.');
  }
  const seating = list.find((row) => row.area === 'seating');
  if (seating?.classification === CLASSIFICATION.SAME) {
    add('seating', BLOCK_REASON.NO_SEATING_CHANGE,
      'Do not claim any option changes the seating: both options are assessed across the same seats.');
  }
  const p20 = list.find((row) => row.area === 'p20');
  if (p20 && p20.classification !== CLASSIFICATION.MATERIALLY_DIFFERENT) {
    add('p20', BLOCK_REASON.NO_SOLVED_BASS_CONSISTENCY,
      'Do not claim seat-to-seat bass consistency is solved, and do not present it as an improvement: the reports show no material difference here.',
      p20.reason, 'p20');
  }

  if (framing && framing.allowed !== true) {
    add('global', BLOCK_REASON.NO_DECISION_FRAMING,
      'Do not write a decision framing that sets one option above the other: this pack does not support it.',
      framing.reason);
  }

  return blocked;
}

/**
 * The decision framing a Marquee-style comparison may use, and only where the
 * evidence supports it: a shared format, a material dynamic-range gain for one
 * option, and a product difference behind it.
 *
 * @returns {{ allowed: boolean, reason: string, text: string|null, evidence: Object }}
 */
export function buildDecisionFraming(classification = [], options = []) {
  const list = Array.isArray(classification) ? classification : [];
  const rowFor = (key) => list.find((row) => row.area === key) || null;

  const refuse = (reason, evidence = {}) => ({ allowed: false, reason, text: null, evidence });
  if (options.length !== 2) return refuse('not_a_two_option_comparison');

  const layout = rowFor('system_layout');
  if (layout?.classification !== CLASSIFICATION.SAME) return refuse('format_is_not_shared');

  const material = DECISION_FRAMING_PARAMETER_KEYS
    .map((key) => rowFor(key))
    .filter((row) => row?.classification === CLASSIFICATION.MATERIALLY_DIFFERENT);
  if (material.length === 0) return refuse('no_material_dynamic_range_evidence');

  const equipment = DECISION_FRAMING_EQUIPMENT_KEYS
    .filter((key) => rowFor(key)?.classification === CLASSIFICATION.DIFFERENT);
  if (equipment.length === 0) return refuse('no_product_difference');

  const winners = new Set(material.map((row) => bestIndex(row)));
  if (winners.size !== 1 || winners.has(-1)) return refuse('no_single_option_supported');

  const winner = [...winners][0];
  const base = winner === 0 ? 1 : 0;
  const evidence = {
    shared_areas: ['system_layout'],
    material_areas: material.map((row) => row.area),
    equipment_areas: equipment,
    option: optionRef(options[winner]),
  };
  return {
    allowed: true,
    reason: 'shared_format_with_material_dynamic_range_and_products',
    text: `${optionName(options[base], base)} gives the room the format. `
      + `${optionName(options[winner], winner)} gives that format the authority to feel like a serious dedicated cinema.`,
    evidence,
  };
}