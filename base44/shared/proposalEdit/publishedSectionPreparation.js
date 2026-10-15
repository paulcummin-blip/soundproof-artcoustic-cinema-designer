/**
 * publishedSectionPreparation.js (shared, server half)
 * ---------------------------------------------------
 * The one deterministic preparation a proposal's own section body goes through
 * on its way to the client document, and the check that the validated copy
 * actually survives it.
 *
 * Why it exists: the published page is not the stored body. Headings that repeat
 * a section's own title are dropped, a highlight list inside a highlights
 * introduction is dropped, and a high-channel design has added-speaker and
 * spacing-upgrade wording cleaned off the page. NO paragraph or sentence limit is
 * applied: the published page carries every approved paragraph, so the Editor and
 * the PDF publish one prepared content rather than two shortenings of it. The
 * writer's draft was validated BEFORE those transformations, so a
 * transformation that also removed validated copy would go unreported — which is
 * exactly how a validated sentence about the centre channel disappeared from a
 * published page.
 *
 * The frontend mirrors these rules in
 * src/components/proposal/sectionBodyAuthority.js and
 * src/components/proposal/highChannelLayoutAuthority.js (the two cannot import
 * from each other); the browser renders the SAME prepared content this module
 * prepares and checks.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

// ── Headings ────────────────────────────────────────────────────────────────

const LEADING_HEADING = /^\s*<h([1-4])[^>]*>([\s\S]*?)<\/h\1>\s*/i;
const ANY_TAG = /<[^>]*>/g;
const ENTITIES = { '&nbsp;': ' ', '&amp;': '&', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&lt;': '<', '&gt;': '>' };

/** Plain text of a title: tags, entities, punctuation and case removed. */
export function normaliseTitleText(value) {
  if (value === null || value === undefined) return '';
  let text = String(value).replace(ANY_TAG, ' ');
  Object.entries(ENTITIES).forEach(([entity, replacement]) => { text = text.split(entity).join(replacement); });
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Remove a leading heading that simply repeats the section title. */
export function stripDuplicateLeadingHeading(html, title) {
  if (typeof html !== 'string' || !html.trim()) return '';
  const target = normaliseTitleText(title);
  if (!target) return html;
  let out = html;
  for (let guard = 0; guard < 4; guard += 1) {
    const match = LEADING_HEADING.exec(out);
    if (!match) break;
    if (normaliseTitleText(match[2]) !== target) break;
    out = out.slice(match[0].length);
  }
  return out;
}

// ── The room's own name ─────────────────────────────────────────────────────

/**
 * A television design is a media lounge, and the published page names the room
 * the way the project is used. A stored body written under an older vocabulary
 * still calls it a "TV-based cinema room", which reads as a different project:
 * the wording is corrected on the way to the page. Wording only — the stored
 * record is never modified, and no level, figure, product or claim is touched.
 *
 * The same rewrite is applied to the approved copy the published page is checked
 * against (see permittedPreparation), so the check compares like with like and a
 * corrected room name can never be reported as missing copy.
 */
const ROOM_NAME_REWRITES = Object.freeze([
  [/\bTV[- ]based\s+(?:cinema|media|screening)\s+room\b/gi, 'media lounge'],
  [/\btelevision[- ]based\s+(?:cinema|media|screening)\s+room\b/gi, 'media lounge'],
]);

export function useRoomOwnName(html) {
  if (typeof html !== 'string' || !html.trim()) return html;
  return ROOM_NAME_REWRITES.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), html);
}

// ── Blocks, sentences and paragraphs ────────────────────────────────────────

/** Drop whole list and table blocks from a section body. */
export function stripListAndTableBlocks(html) {
  if (typeof html !== 'string' || !html.trim()) return '';
  return html
    .replace(/<table[\s\S]*?<\/table>/gi, ' ')
    .replace(/<ul[\s\S]*?<\/ul>/gi, ' ')
    .replace(/<ol[\s\S]*?<\/ol>/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const PROSE_ONLY_SECTIONS = new Set([
  'system_design_summary',
  'spatial_resolution',
  'dynamic_range',
  'timbre_matching',
  'overall_design',
]);

// ── High-channel presentation cleanup (mirror of the frontend rule) ──────────

const ADDED_SPEAKER_RE = /\b(?:add|adding|added|additional|more|extra|another|increase|expanding|greater number of)\b[^.]{0,50}\b(?:speakers?|loudspeakers?|channels?|overheads?|height speakers?|height channels?|surrounds?|surround positions?|front wides?|positions?)\b/i;
// The qualifier is required: bare "centre channel" is the design's own centre
// channel, not an added middle pair.
const MIDDLE_PAIR_RE = /\b(?:middle|centre|center)\s+(?:(?:overhead|height)\s+(?:pair|pairs|speakers?|channels?)|pairs?)\b/i;
const GAP_CLOSING_RE = /\b(?:close|closing|closed|reduce|reducing|tighten|tightening|narrow)\w*\b[^.]{0,40}\bgaps?\b/i;
const SPACING_SUBJECT_RE = /\b(?:horizontal spacing|side[- ]to[- ]side|p5\b|spacing between|surround channels|adjacent speakers|gaps? between)\b/i;
const FUTURE_INTENT_RE = /\b(?:in the future|future|upgrade\w*|later|if (?:greater|more|further)|should .{0,30}be required|improv\w*|closer|greater precision|more precise)\b/i;
const NEGATED_UPGRADE_RE = /\b(?:rather than|not|never|no)\b[^.]{0,40}?\bupgrade\w*/gi;
const ROOM_SUBJECT_RE = /\b(?:room geometry|room layout|the room|geometry|layout)\b/i;
const CONSTRAINT_WORD_RE = /\b(?:constraint|constraints|constrained|limitation|limitations|limited|limits?|restrict\w*|caps?\b|ceiling)\b/i;
const ROOM_CAUSAL_RE = /\b(?:consequence|result|set|decided|determined|governed|dictated|fixed)\b[^.]{0,40}\b(?:room layout|room geometry|the room|the room's)\b/i;
const SPACING_OR_CHANNEL_RE = /\b(?:spacing|side[-\s]to[-\s]side|discrete (?:channels?|speakers?|outputs?)|channel count|channels?|surround channels?|overhead (?:channels?|positions?)|speaker positions?)\b/i;
const PROCESSOR_SUBJECT_RE = /\b(?:av\s+processor|a\/v\s+processor|processor|pre[-\s]?amp\w*|receiver|amplifier|amplifiers|amp)\b/i;
const PROCESSOR_CLAIM_RE = /\b(?:limit\w*|constrain\w*|restrict\w*|capabilit\w*|channel count|cost\w*|expens\w*|afford\w*|budget)\b/i;

/** Plain text of a piece of HTML: tags and entities removed. */
export function plainTextOf(html) {
  if (html === null || html === undefined) return '';
  let text = String(html).replace(ANY_TAG, ' ');
  Object.entries(ENTITIES).forEach(([entity, replacement]) => { text = text.split(entity).join(replacement); });
  return text.replace(/\s+/g, ' ').trim();
}

export function mentionsHighChannelUpgrade(text) {
  const source = plainTextOf(text);
  if (!source) return false;
  if (ADDED_SPEAKER_RE.test(source)) return true;
  if (MIDDLE_PAIR_RE.test(source)) return true;
  if (GAP_CLOSING_RE.test(source)) return true;
  const withoutNegation = source.replace(NEGATED_UPGRADE_RE, ' ');
  return SPACING_SUBJECT_RE.test(withoutNegation) && FUTURE_INTENT_RE.test(withoutNegation);
}

export function mentionsRoomGeometryConstraintClaim(text) {
  const source = plainTextOf(text);
  if (!source) return false;
  if (!SPACING_OR_CHANNEL_RE.test(source)) return false;
  if (ROOM_CAUSAL_RE.test(source)) return true;
  return ROOM_SUBJECT_RE.test(source) && CONSTRAINT_WORD_RE.test(source);
}

export function mentionsProcessorCostClaim(text) {
  const source = plainTextOf(text);
  if (!source) return false;
  return PROCESSOR_SUBJECT_RE.test(source) && PROCESSOR_CLAIM_RE.test(source);
}

/** Any high-channel copy defect a published page must not carry. */
export function mentionsHighChannelCopyDefect(text) {
  return mentionsHighChannelUpgrade(text)
    || mentionsRoomGeometryConstraintClaim(text)
    || mentionsProcessorCostClaim(text);
}

/** The copy split into sentences, tags left intact. */
export function segmentSentences(html) {
  const source = String(html || '');
  const segments = [];
  let current = '';
  let inTag = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    current += char;
    if (char === '<') inTag = true;
    else if (char === '>') inTag = false;
    else if (!inTag && /[.!?]/.test(char)) {
      const next = source[index + 1];
      if (next === undefined || /[\s<]/.test(next)) { segments.push(current); current = ''; }
    }
  }
  if (current.trim()) segments.push(current);
  return segments;
}

const INLINE_TAGS = ['strong', 'em', 'b', 'i', 'u', 'span'];

function rebalanceInlineTags(html) {
  let out = html;
  for (const tag of INLINE_TAGS) {
    const opens = (out.match(new RegExp(`<${tag}\\b`, 'gi')) || []).length;
    const closes = (out.match(new RegExp(`</${tag}>`, 'gi')) || []).length;
    if (opens > closes) out = `${out}${`</${tag}>`.repeat(opens - closes)}`;
    else if (closes > opens) {
      let surplus = closes - opens;
      out = out.replace(new RegExp(`</${tag}>`, 'gi'), (match) => {
        if (surplus <= 0) return match;
        surplus -= 1;
        return '';
      });
    }
  }
  return out;
}

function cleanSegmentBlock(block) {
  const open = /^<(p|li|h[1-6])[^>]*>/i.exec(block)?.[0] || '';
  const close = /<\/(p|li|h[1-6])>$/i.exec(block)?.[0] || '';
  const inner = block.slice(open.length, block.length - (close ? close.length : 0));
  const kept = [];
  for (const segment of segmentSentences(inner)) {
    const text = plainTextOf(segment);
    if (!text) { kept.push(segment); continue; }
    if (mentionsHighChannelCopyDefect(text)) continue;
    kept.push(segment);
  }
  const body = rebalanceInlineTags(kept.join('')).replace(/\s{2,}/g, ' ').trim();
  if (!plainTextOf(body)) return '';
  return `${open}${body}${close}`;
}

const SEGMENT_BLOCK = /<(p|li|h[1-6])[^>]*>[\s\S]*?<\/\1>/gi;

/** The copy with every added-speaker and spacing-upgrade sentence removed. */
export function stripHighChannelUpgradeCopy(html) {
  const source = String(html || '');
  if (!source.trim()) return source;
  let out = '';
  let cursor = 0;
  SEGMENT_BLOCK.lastIndex = 0;
  let match = SEGMENT_BLOCK.exec(source);
  while (match) {
    out += source.slice(cursor, match.index);
    out += cleanSegmentBlock(match[0]);
    cursor = match.index + match[0].length;
    match = SEGMENT_BLOCK.exec(source);
  }
  out += source.slice(cursor);
  if (mentionsHighChannelCopyDefect(out)) {
    const kept = [];
    for (const segment of segmentSentences(out)) {
      const text = plainTextOf(segment);
      if (!text) { kept.push(segment); continue; }
      if (mentionsHighChannelCopyDefect(text)) continue;
      kept.push(segment);
    }
    out = rebalanceInlineTags(kept.join(''));
  }
  return out.replace(/\s{2,}/g, ' ').trim();
}

// ── Preparation ─────────────────────────────────────────────────────────────

/**
 * The body of one section as the client document publishes it.
 *
 * @param {string} html — the stored (approved) section body
 * @param {{ title?: string, sectionType?: string, proseOnly?: boolean, highChannel?: boolean, proposalType?: string }} section
 * @returns {string}
 */
export function preparePublishedSectionBody(html, section = {}) {
  const deduped = stripDuplicateLeadingHeading(useRoomOwnName(html), section.title);
  const cleaned = section.highChannel ? stripHighChannelUpgradeCopy(deduped) : deduped;
  if (section.sectionType === 'key_performance_highlights') {
    // The calculated table is the only table in this section: a list or table
    // inside the introduction would repeat it. The introduction's prose is
    // published entire.
    return stripListAndTableBlocks(cleaned);
  }
  if (section.proseOnly && PROSE_ONLY_SECTIONS.has(section.sectionType)) {
    const isComparisonSummary = section.proposalType === 'comparison'
      && section.sectionType === 'system_design_summary';
    return isComparisonSummary ? cleaned : stripListAndTableBlocks(cleaned);
  }
  return cleaned;
}

/**
 * What a section is permitted to lose BEFORE it is published, with no
 * high-channel cleanup applied: the transformations that are deliberate page
 * rules, kept separate from the cleanup so the cleanup can never excuse a
 * validated sentence going missing.
 *
 * The deliberate rules are structural only — a repeated heading, a list or table
 * that repeats a designed block. Nothing here shortens prose, so every approved
 * paragraph is required to survive to the published page.
 */
function permittedPreparation(html, section = {}) {
  const deduped = stripDuplicateLeadingHeading(useRoomOwnName(html), section.title);
  if (section.sectionType === 'key_performance_highlights') return stripListAndTableBlocks(deduped);
  if (section.proseOnly && PROSE_ONLY_SECTIONS.has(section.sectionType)) {
    const isComparisonSummary = section.proposalType === 'comparison'
      && section.sectionType === 'system_design_summary';
    return isComparisonSummary ? deduped : stripListAndTableBlocks(deduped);
  }
  return deduped;
}

/** A comparable form of published text: words only, case and punctuation ignored. */
export function normalisePublishedText(html) {
  return plainTextOf(html)
    .replace(/[\u2018\u2019\u201c\u201d"']/g, ' ')
    .replace(/[\u2013\u2014-]/g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** The sentences of a body, each normalised for comparison. */
export function publishedSentences(html) {
  return segmentSentences(plainTextOf(html))
    .map((sentence) => normalisePublishedText(sentence))
    .filter((sentence) => sentence.length >= 8);
}

/**
 * The sentences of a section's approved copy that MUST still be in the published
 * page: everything the deliberate page rules keep, minus the copy the
 * high-channel rule targets (which is correctly never published).
 */
export function requiredPublishedSentences({ approvedHtml, title = null, sectionType = null } = {}) {
  const permitted = permittedPreparation(approvedHtml, { title, sectionType });
  return publishedSentences(permitted).filter((sentence) => !mentionsHighChannelCopyDefect(sentence));
}

/**
 * The first required sentence missing from the published body, or null.
 *
 * @returns {string|null} the missing sentence, in comparable form
 */
export function missingPublishedContent({ approvedHtml, publishedHtml, title = null, sectionType = null } = {}) {
  const published = normalisePublishedText(publishedHtml);
  if (!published) return requiredPublishedSentences({ approvedHtml, title, sectionType })[0] || null;
  const required = requiredPublishedSentences({ approvedHtml, title, sectionType });
  return required.find((sentence) => !published.includes(sentence)) || null;
}

export default preparePublishedSectionBody;