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
 * The pack's own sentences are exempt, exactly as they are for every other prose
 * rule, and the requirement is enforced only where the writer input carries this
 * agreement's own `multi_cabinet_channels` block: a generation filed before the
 * rule existed carries no block and is never re-read under it.
 *
 * Pure: no React, no SDK, no writes, no runtime-specific APIs.
 */

import { WRITER_REJECTION } from './writerContractSchema.js';
import { isPackProse, isProductToken, modelTokens, packProseSentences, sentenceParts } from './writerVocabulary.js';

/** A stage position the arrangement is stated at. */
const CENTRE = /\b(?:centre|center)\b/i;
/** The physical cabinet a count is stated against. */
const PHYSICAL_NOUN = /\b(?:cabinets?|enclosures?|loudspeakers?|speakers?|monitors?|boxes?)\b/i;
/** The arrangement stated as ONE channel: "a single centre channel". */
const ONE_CHANNEL = /\b(?:one|single|1)\b(?:[\s-]+\w+){0,4}[\s-]+channels?\b/i;
/** The adjectives that leave a count of channels multiplying the physical cabinets. */
const MULTIPLYING = '(?:physical|separate|discrete|independent|distinct|dedicated|additional|logical|individual|full|complete)';
/** The physical cabinets written as SEVERAL centre channels. */
const MULTIPLIED_CHANNELS = new RegExp(
  `\\b(?:two|three|four|five|2|3|4|5)\\b(?:\\s+${MULTIPLYING}){0,2}\\s+(?:centre|center)\\s+channels?\\b`,
  'i',
);
/** The position itself written as owning more than one channel. */
const POSITION_OWNS_CHANNELS = new RegExp(
  `\\b(?:centre|center)\\b[^.;:]{0,24}\\b(?:uses?|use|comprises?|contains?|has|have|with|from|`
  + `built\\s+from|made\\s+up\\s+of)\\b[^.;:]{0,16}\\b(?:two|three|2|3)\\b(?:\\s+\\w+){0,1}\\s+channels?\\b`,
  'i',
);
/** A stated count of physical cabinets. */
const STATED_CABINETS = /\b(one|two|three|four|five|six|1|2|3|4|5|6)\b[\s,×x*]*(?:[\w-]+[\s-]+){0,3}(?:centres?\s+|centers?\s+)?(?:cabinets?|enclosures?|loudspeakers?|speakers?|monitors?|boxes?)\b/gi;
/** The number each count word states. */
const COUNT_VALUE = Object.freeze({ one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 });
/** How far either side of a stated count the position it belongs to may sit. */
const WINDOW = 40;

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
 * Arrangements that state the same count at the same position are one requirement,
 * so an option pair that shares the arrangement is explained once rather than
 * twice, and no design the evidence states as a single cabinet ever appears here.
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
    const channels = Number(stage.logical_centre_channels) || 1;
    // One cabinet per channel is not a multi-cabinet arrangement: the evidence
    // states nothing for this rule to require.
    if (!Number.isFinite(cabinets) || cabinets <= channels) continue;

    const key = `centre|${cabinets}|${channels}`;
    const existing = required.get(key);
    required.set(key, {
      position: 'centre',
      label: 'Centre',
      cabinets,
      channels,
      models: [...new Set([...(existing?.models || []), ...modelsOf(stage.centre)])],
      statement: typeof stage.centre === 'string' ? stage.centre : null,
      options: [...new Set([...(existing?.options || []), option?.version_name].filter(Boolean))],
    });
  }

  return [...required.values()];
}

/** Whether a sentence names the position, or the arrangement's own model. */
function namesPosition(sentence, requirement) {
  if (CENTRE.test(sentence)) return true;
  return requirement.models.some((model) => new RegExp(`\\b${escapeToken(model)}\\b`, 'i').test(sentence));
}

/**
 * The physical cabinet count a sentence states for the arrangement, or null. A
 * count only belongs to the arrangement where its own phrase contains the
 * position, or the position sits within a short window of it — so a count stated
 * for another part of the system is never read as the centre's.
 */
function statedCabinetCount(sentence, requirement) {
  const pattern = new RegExp(STATED_CABINETS.source, 'gi');
  let match = pattern.exec(sentence);
  while (match) {
    const at = match.index;
    const near = sentence.slice(Math.max(0, at - WINDOW), at + match[0].length + WINDOW);
    const belongs = CENTRE.test(match[0]) || CENTRE.test(near)
      || requirement.models.some((model) => new RegExp(`\\b${escapeToken(model)}\\b`, 'i').test(near));
    if (belongs) {
      const value = COUNT_VALUE[String(match[1]).toLowerCase()] ?? Number(match[1]);
      if (Number.isFinite(value)) return value;
    }
    match = pattern.exec(sentence);
  }
  return null;
}

/** The reason a sentence states the arrangement wrongly, or null when it does not. */
function contradictionReason(sentence, requirement) {
  if (!namesPosition(sentence, requirement)) return null;
  if (MULTIPLIED_CHANNELS.test(sentence) || POSITION_OWNS_CHANNELS.test(sentence)) {
    return `${MULTI_CABINET_REASONS.MULTIPLIED}:${requirement.position}`;
  }
  const stated = statedCabinetCount(sentence, requirement);
  if (stated !== null && stated !== requirement.cabinets) {
    return `${MULTI_CABINET_REASONS.COUNT}:${requirement.position}:${stated}`;
  }
  return null;
}

/** Whether any sentence of the assembled copy explains the arrangement. */
function described(text, requirement, packProse) {
  for (const sentence of sentenceParts(text)) {
    if (isPackProse(sentence, packProse)) continue;
    if (!namesPosition(sentence, requirement)) continue;
    if (MULTIPLIED_CHANNELS.test(sentence) || POSITION_OWNS_CHANNELS.test(sentence)) continue;
    if (!PHYSICAL_NOUN.test(sentence) || !ONE_CHANNEL.test(sentence)) continue;
    const stated = statedCabinetCount(sentence, requirement);
    if (stated !== null && stated !== requirement.cabinets) continue;
    return true;
  }
  return false;
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

  const packProse = packProseSentences(input);
  const rows = (Array.isArray(sections) ? sections : [])
    .map((entry) => ({
      section: typeof entry?.section === 'string' ? entry.section : null,
      text: typeof entry?.text === 'string' ? entry.text : '',
    }))
    .filter((entry) => entry.text.trim().length > 0);

  for (const requirement of required) {
    let contradicted = false;
    for (const row of rows) {
      for (const sentence of sentenceParts(row.text)) {
        if (isPackProse(sentence, packProse)) continue;
        const detail = contradictionReason(sentence, requirement);
        if (!detail) continue;
        found.push({
          code: WRITER_REJECTION.MULTI_CABINET_CHANNEL,
          section: row.section,
          detail,
          sentence,
        });
        contradicted = true;
        break;
      }
      if (contradicted) break;
    }
    if (contradicted) continue;

    const assembled = rows.map((row) => row.text).join('\n');
    if (!described(assembled, requirement, packProse)) {
      found.push({
        code: WRITER_REJECTION.MULTI_CABINET_CHANNEL,
        section: null,
        detail: `${MULTI_CABINET_REASONS.OMITTED}:${requirement.position}`,
      });
    }
  }

  return found;
}

export default multiCabinetChannelViolations;