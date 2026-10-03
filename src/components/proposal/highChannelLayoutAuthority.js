/**
 * highChannelLayoutAuthority.js
 * -----------------------------
 * The frontend half of the high-channel-density upgrade rule.
 *
 * The rule itself lives in the writing authority (base44/shared/
 * highChannelDensityRule.js) and is injected into every report prompt, so a
 * newly generated report cannot offer added speakers or an improved horizontal
 * spacing result for a high-channel-count design. This module covers the other
 * half: a proposal generated BEFORE that rule existed still carries the wording
 * in its stored body, and a stored record is never rewritten. The copy is
 * therefore cleaned on the way to the page, so the client never sees an upgrade
 * path that does not exist.
 *
 * A design is high density at 9.1.6 or any layout with 15 or more discrete
 * channels. Below that density nothing is touched: a lower-channel design may
 * still carry a supported upgrade suggestion.
 *
 * Pure: no React, no fetching, no side effects. The stored body is never
 * modified, and no value or result is ever changed.
 */

/** The channel count at which the rule applies. 9.1.6 is 9 bed + 6 overhead = 15. */
export const HIGH_DENSITY_MIN_DISCRETE_CHANNELS = 15;

/** The approved wording: the spacing limitation stated as a room constraint. */
export const HIGH_CHANNEL_PREFERRED_SENTENCE = 'The horizontal spacing result is mainly a consequence of the room layout and the practical speaker positions available. The design already uses a high channel count, so this should be understood as a room geometry constraint rather than a simple upgrade path.';

/** Discrete channels stated by a layout such as '9.1.6' (bed + overhead). */
export function parseDiscreteChannelCount(configuration) {
  const match = /^(\d+)\.(\d+)(?:\.(\d+))?$/.exec(String(configuration || '').trim());
  if (!match) return null;
  const bed = Number(match[1]);
  const overhead = match[3] === undefined ? 0 : Number(match[3]);
  return Number.isFinite(bed) ? bed + overhead : null;
}

/** True when this report's frozen snapshot describes a high-density design. */
export function isHighChannelDesign(snapshot) {
  const system = snapshot?.system || {};
  const layout = system.channel_layout || {};
  const configuration = layout.configuration_text || system.configuration?.dolby_config || null;
  const raw = layout.total_discrete ?? system.configuration?.total_discrete_channels ?? null;
  const count = raw === null || raw === undefined || raw === '' ? null : Number(raw);
  if (Number.isFinite(count)) return count >= HIGH_DENSITY_MIN_DISCRETE_CHANNELS;
  const parsed = parseDiscreteChannelCount(configuration);
  return parsed !== null && parsed >= HIGH_DENSITY_MIN_DISCRETE_CHANNELS;
}

/** Plain text of a piece of HTML: tags and entities removed. */
export function plainText(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

const ADDED_SPEAKER_RE = /\b(?:add|adding|added|additional|more|extra|another|increase|expanding|greater number of)\b[^.]{0,50}\b(?:speakers?|loudspeakers?|channels?|overheads?|height speakers?|height channels?|surrounds?|surround positions?|front wides?|positions?)\b/i;
const MIDDLE_PAIR_RE = /\b(?:middle|centre|center)\s+(?:overhead\s+|height\s+)?(?:pair|pairs|speakers?|channels?)\b/i;
const GAP_CLOSING_RE = /\b(?:close|closing|closed|reduce|reducing|tighten|tightening|narrow)\w*\b[^.]{0,40}\bgaps?\b/i;
const SPACING_SUBJECT_RE = /\b(?:horizontal spacing|side[- ]to[- ]side|p5\b|spacing between|surround channels|adjacent speakers|gaps? between)\b/i;
const FUTURE_INTENT_RE = /\b(?:in the future|future|upgrade\w*|later|if (?:greater|more|further)|should .{0,30}be required|improv\w*|closer|greater precision|more precise)\b/i;
const NEGATED_UPGRADE_RE = /\b(?:rather than|not|never|no)\b[^.]{0,40}?\bupgrade\w*/gi;

/** Does this sentence offer added speakers, a middle overhead pair, or an improved spacing result as a future upgrade? */
export function mentionsHighChannelUpgrade(text) {
  const source = plainText(text);
  if (!source) return false;
  if (ADDED_SPEAKER_RE.test(source)) return true;
  if (MIDDLE_PAIR_RE.test(source)) return true;
  if (GAP_CLOSING_RE.test(source)) return true;
  // A constraint stated as "rather than a simple upgrade path" is the approved
  // wording, so the negation is removed before the intent test.
  const withoutNegation = source.replace(NEGATED_UPGRADE_RE, ' ');
  return SPACING_SUBJECT_RE.test(withoutNegation) && FUTURE_INTENT_RE.test(withoutNegation);
}

/** The sentence a piece of copy limits: horizontal spacing, in whatever words. */
export function isSpacingSentence(text) {
  return SPACING_SUBJECT_RE.test(plainText(text));
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
      if (next === undefined || /[\s<]/.test(next)) {
        segments.push(current);
        current = '';
      }
    }
  }
  if (current.trim()) segments.push(current);
  return segments;
}

const INLINE_TAGS = ['strong', 'em', 'b', 'i', 'u', 'span'];

/** Close or drop inline tags left unbalanced by a removed sentence. */
function rebalanceInlineTags(html) {
  let out = html;
  for (const tag of INLINE_TAGS) {
    const opens = (out.match(new RegExp(`<${tag}\\b`, 'gi')) || []).length;
    const closes = (out.match(new RegExp(`</${tag}>`, 'gi')) || []).length;
    if (opens > closes) {
      out = `${out}${`</${tag}>`.repeat(opens - closes)}`;
    } else if (closes > opens) {
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

/** Clean one element: drop the sentences that offer the upgrade the rule forbids. */
function cleanSegmentBlock(block) {
  const open = /^<(p|li|h[1-6])[^>]*>/i.exec(block)?.[0] || '';
  const close = /<\/(p|li|h[1-6])>$/i.exec(block)?.[0] || '';
  const inner = block.slice(open.length, block.length - (close ? close.length : 0));

  const kept = [];
  let droppedSpacing = false;
  let spacingStated = false;
  for (const segment of segmentSentences(inner)) {
    const text = plainText(segment);
    if (!text) {
      kept.push(segment);
      continue;
    }
    if (mentionsHighChannelUpgrade(text)) {
      if (isSpacingSentence(text)) droppedSpacing = true;
      continue;
    }
    if (isSpacingSentence(text)) spacingStated = true;
    kept.push(segment);
  }

  const body = rebalanceInlineTags(kept.join('')).replace(/\s{2,}/g, ' ').trim();
  if (!plainText(body)) return { html: '', droppedSpacing, spacingStated };
  return { html: `${open}${body}${close}`, droppedSpacing, spacingStated };
}

const SEGMENT_BLOCK = /<(p|li|h[1-6])[^>]*>[\s\S]*?<\/\1>/gi;

/**
 * The copy with every added-speaker, middle-overhead-pair and spacing-upgrade
 * sentence removed. Where a spacing limitation was stated as an upgrade, the
 * approved constraint wording replaces it, so the page still explains the
 * result honestly.
 *
 * @param {string} html
 * @returns {string}
 */
export function stripHighChannelUpgradeCopy(html) {
  const source = String(html || '');
  if (!source.trim()) return source;

  let out = '';
  let cursor = 0;
  let droppedSpacing = false;
  let spacingStated = false;
  SEGMENT_BLOCK.lastIndex = 0;

  let match = SEGMENT_BLOCK.exec(source);
  while (match) {
    out += source.slice(cursor, match.index);
    const cleaned = cleanSegmentBlock(match[0]);
    out += cleaned.html;
    droppedSpacing = droppedSpacing || cleaned.droppedSpacing;
    spacingStated = spacingStated || cleaned.spacingStated;
    cursor = match.index + match[0].length;
    match = SEGMENT_BLOCK.exec(source);
  }
  out += source.slice(cursor);

  // Copy outside a paragraph (a stray line) is cleaned in the same way.
  if (mentionsHighChannelUpgrade(out)) {
    const kept = segmentSentences(out)
      .filter((segment) => !mentionsHighChannelUpgrade(segment));
    out = rebalanceInlineTags(kept.join(''));
  }

  if (droppedSpacing && !spacingStated) {
    out = `${out.replace(/\s+$/, '')}<p>${HIGH_CHANNEL_PREFERRED_SENTENCE}</p>`;
  }
  return out.replace(/\s{2,}/g, ' ').trim();
}

export default stripHighChannelUpgradeCopy;