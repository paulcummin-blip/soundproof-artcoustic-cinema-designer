/**
 * proposalNarrativeExclusions.js (shared, PROPOSAL NARRATIVE ONLY)
 * ---------------------------------------------------------------
 * WHAT A "DO NOT DISCUSS" TOPIC ACTUALLY SUPPRESSES.
 *
 * The designer can mark a topic as a soft preference to leave out of the
 * client-facing narrative. That is a statement about COPY, and about nothing
 * else. This module is the deterministic backstop behind it: the writer is told
 * not to discuss an excluded topic, and this removes the sentences that discuss
 * it anyway.
 *
 * HOW IT MAY TOUCH:
 *   - client-facing proposal narrative only — a section body of prose;
 *   - sentence by sentence, so a sentence about something else is never lost
 *     with the one it followed.
 *
 * HOW IT MAY NOT TOUCH: engineering values, Performance Levels, products, the
 * Project Report, RP22/RP23 results, technical tables, evidence or the frozen
 * snapshot. Nothing here calculates, re-derives, reorders or rewrites a fact; it
 * removes narrative sentences and leaves everything else exactly as it was. It
 * never empties a section either — a body that was nothing but excluded narrative
 * is kept as it stands.
 *
 * The topic keys are deliberately the same keys the wizard's narrative steer
 * records (src/components/proposal/wizard/narrativeSteer.js), so a state set on
 * one side of the pipeline always names the same topic on the other.
 *
 * Pure: no React, no SDK, no runtime-specific APIs. Safe in any backend function.
 */

/** The exclusion authority's own generation, so a refinement is traceable. */
export const NARRATIVE_EXCLUSION_VERSION = 1;

/**
 * One topic per key. Each carries the subjects that count as discussing it. The
 * patterns are intentionally narrow: they describe the topic's own subjects, not
 * every sentence that happens to share a word with it.
 */
export const NARRATIVE_EXCLUSION_RULES = Object.freeze({
  // Seating is the one topic whose exclusion is a cluster: the seating positions,
  // the boundary clearance, the prioritised listening positions, the P1 seat
  // result and the seating theory are all the seating conversation.
  seating_arrangement: [
    /\bseat(?:s|ing)?\b/i,
    /\brows?\s+of\s+seats?\b/i,
    /\b(?:front|rear|back|second|middle)\s+row\b/i,
    /\blistening\s+(?:position|area|zone)s?\b/i,
    /\bboundary\s+clearance\b/i,
    /\bclearance\s+(?:to|around|from)\b/i,
    /\bP1\b/,
  ],
  seating_geometry: [
    /\brow\s+spacing\b/i,
    /\bseating\s+(?:dimensions?|geometry|distances?)\b/i,
    /\b\d+(?:[.,]\d+)?\s?(?:m|metres?|meters?|mm)\s+(?:to|from)\s+the\s+(?:seat|row|screen|front|rear|side)\b/i,
  ],
  screen_dynamic: [
    /\bscreen\s+(?:channel\s+|stage\s+)?dynamic\s+range\b/i,
    /\bscreen\s+(?:channel|stage|speaker)s?'?\s+(?:output|capability|headroom|spl)\b/i,
    /\bP12\b/,
  ],
  channel_count: [
    /\b\d+\s+(?:discrete\s+)?channels?\b/i,
    /\bdiscrete\s+channels?\b/i,
    /\bchannel\s+count\b/i,
  ],
  viewing_experience: [
    /\bviewing\s+(?:experience|angle|distance|geometry)\b/i,
  ],
  speaker_positioning: [
    /\b(?:loudspeaker|speaker)\s+(?:placement|positioning|positions?)\b/i,
    /\bplacement\s+of\s+the\s+(?:loudspeakers|speakers)\b/i,
    /\bP(?:3|5|7|11)\b/,
  ],
  overhead_arrangement: [
    /\boverhead\s+(?:loudspeakers|speakers|channels?|arrangement|spacing|layer)\b/i,
    /\bP9\b/,
  ],
  bass_extension: [
    /\bbass\s+extension\b/i,
    /\blow[- ]frequency\s+extension\b/i,
    /\bextends?\s+down\s+to\b/i,
    /\bP18\b/,
  ],
  rear_subwoofer: [
    /\brear\s+subwoofer/i,
    /\bsubwoofer\s+(?:placement|arrangement|positions?)\b/i,
  ],
  screen_tonal: [
    /\bscreen\s+(?:channel\s+)?(?:tonal|timbre)\b/i,
    /\bP16\b/,
  ],
  surround_tonal: [
    /\bsurround\s+(?:channel\s+)?(?:tonal|timbre)\b/i,
    /\bP17\b/,
  ],
  system_approach: [
    /\b\d(?:\.\d){1,2}\s+(?:system|layout|configuration)\b/i,
    /\bsystem\s+(?:approach|layout)\b/i,
  ],
  display: [
    /\bTV\b/,
    /\btelevision\b/i,
    /\bprojector\b/i,
    /\bprojection\s+screen\b/i,
  ],
  documented_constraint: [
    /\bconstraint\b/i,
    /\bcompromise\b/i,
  ],
});

/**
 * The topic a free-text topic name belongs to, so a label recorded before the
 * keys existed still suppresses what it names. Matches the wizard's own map.
 */
const LABEL_TOPICS = Object.freeze([
  ['seating', 'seating_arrangement'],
  ['viewing', 'viewing_experience'],
  ['screen tonal', 'screen_tonal'],
  ['surround tonal', 'surround_tonal'],
  ['tonal', 'screen_tonal'],
  ['bass extension', 'bass_extension'],
  ['subwoofer', 'rear_subwoofer'],
  ['bass', 'bass_extension'],
  ['channel', 'channel_count'],
  ['system approach', 'system_approach'],
  ['system layout', 'system_approach'],
  ['dynamic', 'screen_dynamic'],
  ['overhead', 'overhead_arrangement'],
  ['speaker positioning', 'speaker_positioning'],
  ['speaker placement', 'speaker_positioning'],
  ['display', 'display'],
  ['constraint', 'documented_constraint'],
]);

/** The topic keys a list of excluded topics (keys or names) stands for. */
export function resolveExcludedTopics(excluded = []) {
  const keys = new Set();
  for (const entry of Array.isArray(excluded) ? excluded : []) {
    const text = String(entry || '').trim().toLowerCase();
    if (!text) continue;
    if (NARRATIVE_EXCLUSION_RULES[text]) {
      keys.add(text);
      continue;
    }
    for (const [needle, key] of LABEL_TOPICS) {
      if (text.includes(needle)) {
        keys.add(key);
        break;
      }
    }
  }
  return [...keys];
}

/** The subjects an excluded topic covers, all together. */
export function exclusionPatterns(excluded = []) {
  return resolveExcludedTopics(excluded).flatMap((key) => NARRATIVE_EXCLUSION_RULES[key] || []);
}

/** Whether a sentence discusses any excluded topic. */
export function discussesExcludedTopic(sentence, excluded = []) {
  const text = String(sentence || '');
  if (!text.trim()) return false;
  return exclusionPatterns(excluded).some((pattern) => pattern.test(text));
}

/**
 * Split a text run into sentences. A full stop ends a sentence only where it is
 * followed by a space or the end of the run, so a decimal keeps its digits
 * together. Whitespace stays with the sentence it follows.
 */
function splitSentences(text) {
  const pieces = [];
  const boundary = /[.!?]+(?=\s|$)/g;
  let start = 0;
  let match = boundary.exec(text);
  while (match) {
    const end = match.index + match[0].length;
    pieces.push(text.slice(start, end));
    start = end;
    match = boundary.exec(text);
  }
  if (start < text.length) pieces.push(text.slice(start));
  return pieces.length > 0 ? pieces : [text];
}

function countWords(text) {
  return String(text || '').split(/\s+/).filter((word) => /[a-z0-9]/i.test(word)).length;
}

function hasCopy(html) {
  return String(html || '').replace(/<[^>]*>/g, ' ').replace(/[^a-z0-9]/gi, '').length > 0;
}

/** One text run with its excluded sentences removed (never crossing a tag). */
function suppressRun(run, excluded) {
  if (!run.trim()) return run;
  const patterns = exclusionPatterns(excluded);
  if (patterns.length === 0) return run;
  const leading = (run.match(/^\s*/) || [''])[0];
  const kept = splitSentences(run).filter((sentence) => {
    if (!sentence.trim()) return false;
    return !patterns.some((pattern) => pattern.test(sentence));
  });
  const body = kept.join('').replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+([.!?,;:])/g, '$1').trim();
  if (!body) return '';
  // A fragment left with nothing but a few words is not copy: it is dropped
  // rather than published as a half-sentence.
  return countWords(body) >= 4 ? `${leading}${body}` : '';
}

/**
 * Apply the excluded topics to one client-facing narrative body.
 *
 * @param {string} html - the narrative body
 * @param {Object} [options]
 * @param {Array<string>} [options.excluded] - excluded topics, by key or name
 * @returns {string} the body with sentences about those topics removed
 */
export function suppressExcludedNarrative(html, { excluded = [] } = {}) {
  const source = String(html || '');
  const patterns = exclusionPatterns(excluded);
  if (!source || patterns.length === 0) return source;
  const cleaned = source
    .split(/(<[^>]*>)/)
    .map((part) => (part.startsWith('<') ? part : suppressRun(part, excluded)))
    .join('')
    .replace(/<p>\s*<\/p>/gi, '')
    .replace(/<li>\s*<\/li>/gi, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  // A narrative that was nothing but excluded topics is kept rather than emptied:
  // an empty section would fail the document instead of merely reading quietly.
  return hasCopy(cleaned) ? cleaned : source;
}

/**
 * The rule the writer is given. Stated once, so the instruction and the backstop
 * behind it cannot drift apart.
 */
export const EXCLUDED_TOPIC_RULE = 'EXCLUDED TOPICS ARE KEPT OUT OF THE NARRATIVE: a topic the designer marked "do not discuss" is not written about in any client-facing section. Do not explain it, do not illustrate it with a figure, and do not build a story around it. This is a statement about copy alone: it changes no evidence, no reported result, no table and no figure of the document, and where the design has no other way to describe the room, describe what the client hears and move on.';

export default suppressExcludedNarrative;