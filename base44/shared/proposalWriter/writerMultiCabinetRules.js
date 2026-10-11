/**
 * writerMultiCabinetRules.js (shared)
 * -----------------------------------
 * THE multi-cabinet rule of the writer: where the frozen evidence states a stage
 * position built from MORE physical cabinets than that position has channels, the
 * arrangement is a fact about the design, and the copy explains it — once,
 * naturally, wherever the writer places it.
 *
 * The requirement is READ FROM THE EVIDENCE and never hard-coded. Each option's
 * own frozen `front_stage` fact states the physical centre cabinets the design
 * places and the logical centre channels they reproduce (built by
 * resolveFrontStageRoles.js and carried into the pack by proposalEvidenceFacts.js).
 * A requirement exists only where the evidence states MORE cabinets than channels:
 * a design with one cabinet, and a design that genuinely has one cabinet per
 * channel, state nothing here, and this rule reports nothing for them.
 *
 * What is refused, on a design whose evidence states a multi-cabinet arrangement:
 *
 *   - copy that never explains the arrangement — the client reads that a centre
 *     channel exists but never that it is built from several cabinets working as
 *     one;
 *   - copy that writes the physical cabinets as several independent channels
 *     ("two discrete centre channels", "the centre uses two channels") — a channel
 *     count the design does not have;
 *   - copy that states a cabinet count the frozen evidence does not place
 *     ("three C4-1 centre cabinets" where the design places two).
 *
 * What is accepted: the design's own natural wording, however the writer phrases
 * it, as long as one sentence names the position (or its own model), states the
 * frozen cabinet count against a physical noun, and states that the arrangement is
 * ONE channel — "the centre channel uses two C4-1 loudspeaker cabinets working
 * together to reproduce a single centre channel". The check is deliberately
 * lenient: it looks for a positive statement of the arrangement, so a description
 * that reads naturally is never refused, and no particular sentence is required.
 *
 * Exact evidence wording may satisfy the requirement when it explicitly states
 * both counts. The requirement is enforced only where the writer input carries this
 * agreement's own `multi_cabinet_channels` block: a generation filed before the
 * rule existed carries no block and is never re-read under it.
 *
 * Pure: no React, no SDK, no writes, no runtime-specific APIs.
 */

import { WRITER_REJECTION } from './writerContractSchema.js';
import { isProductToken, modelTokens, sentenceParts } from './writerVocabulary.js';
import { cabinetCounts, logicalChannelCounts, namesCabinetPosition } from './writerCabinetLanguage.js';

/** The reason a requirement is reported unmet. */
export const MULTI_CABINET_REASONS = Object.freeze({
  OMITTED: 'required_arrangement_not_described',
  MULTIPLIED: 'physical_cabinets_described_as_multiple_channels',
  COUNT: 'cabinet_count_contradicts_the_frozen_specification',
});

/** A token as a literal regular expression. */
function escapeToken(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The product models a frozen statement carries. */
function modelsOf(statement) {
  return [...new Set(modelTokens(String(statement || '')).filter(isProductToken))];
}

/**
 * The multi-cabinet arrangements a frozen pack states, derived from the evidence
 * alone: one entry per arrangement where a stage position is built from MORE
 * physical cabinets than that position has channels.
 *
 * Each arrangement keeps its own version identity. Shared arrangements may be
 * explained once for both options; different arrangements must be attributed to
 * the appropriate design. Single-cabinet designs gain no requirement.
 *
 * @param {Object} pack — the frozen proposal evidence pack
 * @returns {Array<Object>} the required arrangements
 */
export function requiredMultiCabinetChannels(pack) {
  const options = Array.isArray(pack?.options) ? pack.options : [];
  const required = new Map();

  for (const option of options) {
    const stage = option?.facts?.system?.front_stage || null;
    if (!stage || typeof stage !== 'object') continue;
    const cabinets = Number(stage.physical_centre_cabinets);
    const channels = Number(stage.logical_centre_channels);
    // One cabinet per channel is not a multi-cabinet arrangement: the evidence
    // states nothing for this rule to require.
    if (!Number.isInteger(cabinets) || channels !== 1 || cabinets <= channels) continue;

    const key = `${option.version_id}|centre|${cabinets}|${channels}`;
    const existing = required.get(key);
    required.set(key, {
      position: 'centre',
      label: 'Centre',
      version_id: option.version_id,
      version_name: option.version_name || null,
      option_label: option.label || null,
      cabinets,
      channels,
      models: [...new Set([...(existing?.models || []), ...modelsOf(stage.centre)])],
      statement: typeof stage.centre === 'string' ? stage.centre : null,
      options: [...new Set([...(existing?.options || []), option?.version_name].filter(Boolean))],
    });
  }

  return [...required.values()];
}

/** Keep each comparison statement attached to the design it describes. */
function scopedSentences(rows, input, requirement) {
  const options = input.evidence_pack?.options || [];
  const claims = input.allowed_claims || [];
  const signature = stage => stage && `${stage.physical_centre_cabinets}|${stage.logical_centre_channels}|${stage.centre}`;
  const allShared = options.every(option => signature(option.facts?.system?.front_stage)
    === signature(options.find(option => option.version_id === requirement.version_id)?.facts?.system?.front_stage));
  const found = [];
  for (const row of rows) {
    const cited = [...new Set((row.claim_ids || []).flatMap(id => {
      const versionId = claims.find(claim => claim.claim_id === id)?.option?.version_id;
      return versionId ? [versionId] : [];
    }))];
    let context = cited.length === 1 ? cited : [];
    const aliases = options.flatMap(option => [option.version_name, option.label]).filter(Boolean).map(escapeToken);
    const boundaries = aliases.length ? new RegExp(`(?:[,;]\\s*|\\s+(?:while|whereas|but)\\s+)(?=(?:${aliases.join('|')})(?:\\W|$))`, 'i') : null;
    const fragments = sentenceParts(row.text).flatMap(sentence => boundaries ? sentence.split(boundaries) : [sentence]);
    for (const sentence of fragments) {
      const named = options.filter(option => [option.version_name, option.label].filter(Boolean)
        .some(name => new RegExp(`(^|\\W)${escapeToken(name)}(?=\\W|$)`, 'i').test(sentence)));
      if (named.length) context = named.map(option => option.version_id);
      const ownModel = requirement.models.some(model => new RegExp(`\\b${escapeToken(model)}\\b`, 'i').test(sentence));
      const uniqueModel = ownModel && !options.some(option => option.version_id !== requirement.version_id
        && modelsOf(option.facts?.system?.front_stage?.centre).some(model => requirement.models.includes(model)));
      const belongs = context.length ? context.includes(requirement.version_id)
        : options.length === 1 || allShared || uniqueModel;
      // A global "both options" assertion is also checked against this option.
      const global = /\b(?:both|all)\s+(?:options|designs|versions)\b/i.test(sentence);
      if (belongs || global) found.push({ section: row.section, sentence });
    }
  }
  return found;
}

function contradictionReason(sentence, requirement) {
  if (!namesCabinetPosition(sentence, requirement)) return null;
  if (logicalChannelCounts(sentence, requirement).some(count => count !== requirement.channels)) {
    return `${MULTI_CABINET_REASONS.MULTIPLIED}:${requirement.position}`;
  }
  const wrong = cabinetCounts(sentence, requirement).find(count => count !== requirement.cabinets);
  return wrong !== undefined ? `${MULTI_CABINET_REASONS.COUNT}:${requirement.position}:${wrong}` : null;
}

function described(sentences, requirement) {
  const placements = new Set(['decision_summary', 'what_stays_same', 'what_changes', 'system_design_summary', 'products', 'specification', 'system_overview']);
  const eligible = sentences.filter(row => placements.has(row.section));
  return eligible.some(({ sentence, section }, index) => {
    const next = eligible[index + 1];
    const description = next?.section === section ? `${sentence} ${next.sentence}` : sentence;
    return namesCabinetPosition(description, requirement)
      && cabinetCounts(description, requirement).includes(requirement.cabinets)
      && logicalChannelCounts(description, requirement).includes(requirement.channels)
      && !contradictionReason(description, requirement);
  });
}

/**
 * Every multi-cabinet rejection the assembled copy carries.
 *
 * The copy is read as a whole: the arrangement has to be explained once, wherever
 * the writer places it, and it is never required to be repeated section by
 * section. A contradiction is reported against the section that states it; an
 * omission is reported once for the document, with no section of its own.
 *
 * @param {Object} params
 * @param {Object} params.input — the writer input the draft was written against
 * @param {Array<{section: string, text: string}>} params.sections — every section of the draft
 * @returns {Array<{ code: string, section: string|null, detail: string, sentence?: string }>}
 */
export function multiCabinetChannelViolations({ input = null, sections = [] } = {}) {
  const found = [];
  // The rule belongs to the agreement the input was built under: a generation
  // filed before it carries no block and is never re-read under it.
  if (!input?.multi_cabinet_channels) return found;

  const required = requiredMultiCabinetChannels(input.evidence_pack);
  if (required.length === 0) return found;

  const rows = (Array.isArray(sections) ? sections : [])
    .map((entry) => ({
      section: typeof entry?.section === 'string' ? entry.section : null,
      text: typeof entry?.text === 'string' ? entry.text : '',
      claim_ids: entry?.claim_ids || [],
    }))
    .filter((entry) => entry.text.trim().length > 0);

  for (const requirement of required) {
    const sentences = scopedSentences(rows, input, requirement);
    let contradicted = false;
    for (const { section, sentence } of sentences) {
      const detail = contradictionReason(sentence, requirement);
      if (!detail) continue;
      found.push({ code: WRITER_REJECTION.MULTI_CABINET_CHANNEL, section, detail,
        sentence, version_id: requirement.version_id });
      contradicted = true;
    }
    if (!contradicted && !described(sentences, requirement)) {
      found.push({ code: WRITER_REJECTION.MULTI_CABINET_CHANNEL, section: null,
        detail: `${MULTI_CABINET_REASONS.OMITTED}:${requirement.position}:${requirement.version_id}`,
        version_id: requirement.version_id });
    }
  }

  return found;
}

export default multiCabinetChannelViolations;