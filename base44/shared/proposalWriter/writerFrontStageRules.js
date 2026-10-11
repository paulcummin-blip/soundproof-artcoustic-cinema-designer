/**
 * writerFrontStageRules.js (shared)
 * ---------------------------------
 * THE screen-stage rule of the writer: a design that builds its ONE centre
 * channel from TWO physical centre cabinets is never written as one LCR of the
 * left/right model.
 *
 * The frozen pack states the stage position by position — the left and right
 * channels with their own model, and the centre with its own cabinet count and
 * its own model (the front_stage fact, built by resolveFrontStageRoles.js and
 * carried into the pack by proposalEvidenceFacts.js). Copy that groups the three
 * screen channels into one entity and gives them the left/right model therefore
 * states equipment the design does not have: it tells the client the centre is
 * the left/right model, when in fact the centre is two cabinets of its own.
 *
 * What is refused, on a design whose pack states a dual-centre stage:
 *
 *   - "LCR Q6-3", "Q6-3 LCR", "the Q6-3 loudspeakers make up the LCR" — the
 *     screen channels grouped as one LCR carrying the left/right model;
 *   - "the centre is Q6-3" — the model attributed to the centre itself;
 *   - "three Q6-3 loudspeakers", "Q6-3 × 3" — a count of three of the
 *     left/right model across the screen wall, where the design has two.
 *
 * What is left alone: the design's own wording — "Front Left / Right: Q6-3",
 * "Centre: 2 × C4-1 dual physical centre cabinets", "two physical centre
 * speakers fed from one centre channel", "the layout remains 9.1.6" — and every
 * sentence the pack itself states. A single-centre pack never carries a
 * front_stage fact, so no single-centre design is affected by this rule at all.
 *
 * The whole sentence is read, one option at a time: a sentence that names an
 * option is judged against that option's stage, and where a pack carries both a
 * dual-centre option and a single-centre option, a mention that could belong to
 * either is left alone. An unstated fact is never inferred — a pack with no
 * left/right model states nothing for this rule to read.
 *
 * Pure: no React, no SDK, no writes, no runtime-specific APIs.
 */

import { WRITER_REJECTION } from './writerContractSchema.js';
import { isPackProse, isProductToken, modelTokens, sentenceParts } from './writerVocabulary.js';

/** Terms that group the three screen channels into ONE entity ("the LCR"). */
const GROUPED_STAGE = /\b(?:lcr|left[\s/,-]*(?:centre|center)[\s/,-]*right)\b/i;
/** The noun a loudspeaker count is stated against. */
const SPEAKER_NOUN = /\b(?:loudspeakers?|speakers?|channels?|cabinets?|monitors?)\b/i;
/** The centre, stated as the owner of the model that follows it. */
const CENTRE_OWNS_MODEL = /\b(?:centre|center)\b[\s:,-]*(?:(?:is|are|uses?|use|with|specified with|delivered with|carried by|comprises?|features?)\b[\s:,-]*)?$/i;
/** A quantity of three, stated before a model ("three screen-wall Q6-3"). */
const THREE_BEFORE = /\b(?:three|3)\b(?:[\s-]+[\w-]+){0,2}[\s-]*$/i;
/** A quantity of three, stated after a model ("Q6-3 × 3"). */
const THREE_AFTER = /^[\s:,-]*[×x*][\s:,-]*(?:3|three)\b/i;

/** How far either side of a model mention its own statement is read. */
const WINDOW = 32;

/** The slice of text up to the end of the clause it is in. */
function clauseSlice(value) {
  const stop = String(value || '').search(/[.;!?]/);
  return stop === -1 ? String(value || '') : String(value || '').slice(0, stop);
}

/** The names a pack gives an option: its saved report name, and its short form. */
function optionAliases(option) {
  const name = typeof option?.version_name === 'string' ? option.version_name.trim() : '';
  if (name.length === 0) return [];
  const short = name.replace(/\s+versions?$/i, '').trim();
  return short && short !== name ? [name, short] : [name];
}

/** Whether a sentence names an option by its own name. */
function namesOption(sentence, aliases) {
  const text = String(sentence || '');
  return (Array.isArray(aliases) ? aliases : []).some((alias) => new RegExp(`\\b${String(alias).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text));
}

/**
 * The dual-centre stage a pack option states, as this rule reads it.
 *
 * @returns {{ id: string|null, aliases: string[], tokens: string[], cabinets: number }|null}
 *   null for every option whose pack states no dual-centre stage.
 */
function dualStageOf(option) {
  const stage = option?.facts?.system?.front_stage || null;
  if (!stage || String(stage.structure) !== 'dual_centre') return null;
  const tokens = modelTokens(String(stage.left_right || '')).filter(isProductToken);
  if (tokens.length === 0) return null;
  return {
    id: option.version_id || null,
    aliases: optionAliases(option),
    tokens,
    cabinets: Number(stage.physical_centre_cabinets) || 2,
  };
}

/** Every screen-channel model an option states, dual-centre or not. */
function screenModelsOf(option) {
  const system = option?.facts?.system || {};
  const stated = [
    system.front_stage?.left_right,
    system.front_stage?.centre,
    system.product_roles,
    system.products,
    system.products_by_layer,
  ];
  const found = new Set();
  for (const value of stated) {
    const text = typeof value === 'string' ? value : JSON.stringify(value || '');
    for (const token of modelTokens(text)) if (isProductToken(token)) found.add(token.toUpperCase());
  }
  return found;
}

/** The reason a sentence collapses the stage, or null when it never does. */
function collapsedReason(sentence, stage) {
  const text = String(sentence || '');
  for (const token of stage.tokens) {
    const pattern = new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    let match = pattern.exec(text);
    while (match) {
      const at = match.index;
      const end = at + match[0].length;
      const before = clauseSlice(text.slice(Math.max(0, at - WINDOW), at));
      const after = clauseSlice(text.slice(end, end + WINDOW));

      // The three screen channels grouped as one LCR carrying this model.
      if (GROUPED_STAGE.test(before) || GROUPED_STAGE.test(after)) {
        return 'the_screen_channels_are_grouped_as_one_lcr_of_the_left_right_model';
      }
      // The centre itself stated as this model.
      if (CENTRE_OWNS_MODEL.test(before.slice(-28))) {
        return 'the_centre_is_stated_as_the_left_right_model';
      }
      // A count of three of this model across the screen.
      const quantityBefore = THREE_BEFORE.test(clauseSlice(text.slice(Math.max(0, at - 26), at)));
      const quantityAfter = THREE_AFTER.test(text.slice(end, end + 12));
      if ((quantityBefore || quantityAfter) && SPEAKER_NOUN.test(text)) {
        return 'three_screen_loudspeakers_of_the_left_right_model';
      }
      match = pattern.exec(text);
    }
  }
  return null;
}

/**
 * Every collapsed screen-channel statement a section's text carries.
 *
 * @param {Object} input
 * @param {Object} input.input — the writer input the draft was written against
 * @param {string} input.text — the section's prose
 * @param {Array<string>} [input.packProse] — the pack's own sentences
 * @returns {Array<{ token: string, code: string, detail: string, sentence: string }>}
 */
export function frontStageScopeViolations({ input = null, text = '', packProse = [] } = {}) {
  const found = [];
  if (typeof text !== 'string' || text.length === 0) return found;

  const options = Array.isArray(input?.evidence_pack?.options) ? input.evidence_pack.options : [];
  const stages = options.map(dualStageOf).filter(Boolean);
  // A pack that states no dual-centre stage — every single-centre design — has
  // nothing to collapse, so this rule never reports anything for it.
  if (stages.length === 0) return found;

  // The screen models a single-centre option in the same pack states: where a
  // pack carries both kinds of design, a sentence naming no option and a model
  // one of them really does state is the other option's own correct wording.
  const singleCentreModels = new Set();
  for (const option of options) {
    if (dualStageOf(option)) continue;
    for (const token of screenModelsOf(option)) singleCentreModels.add(token);
  }

  for (const sentence of sentenceParts(text)) {
    if (isPackProse(sentence, packProse)) continue;
    const named = stages.filter((stage) => namesOption(sentence, stage.aliases));
    const scope = named.length > 0 ? named : stages;
    for (const stage of scope) {
      const reason = collapsedReason(sentence, stage);
      if (!reason) continue;
      const token = stage.tokens.find((entry) => new RegExp(`\\b${entry}\\b`, 'i').test(sentence)) || stage.tokens[0];
      if (named.length === 0 && singleCentreModels.has(String(token).toUpperCase())) break;
      found.push({
        token,
        code: WRITER_REJECTION.COLLAPSED_SCREEN_CHANNEL,
        detail: `${reason}:${token}`,
        sentence,
      });
      break;
    }
  }

  return found;
}

export default frontStageScopeViolations;