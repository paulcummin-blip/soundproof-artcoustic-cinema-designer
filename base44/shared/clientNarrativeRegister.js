/**
 * clientNarrativeRegister.js (shared, CLIENT-FACING PROPOSAL AND REPORT ONLY)
 * --------------------------------------------------------------------------
 * How a client-facing document talks about a system: the story the client is
 * buying, never the mechanism that produces it.
 *
 * A proposal explains a recommendation. The Project Report is the evidence
 * document. Copy that counts a system's channels, names the layer the design does
 * not have, explains what a mechanism does or brings a boundary measurement into
 * the main narrative reads as parameter commentary, and it is exactly what makes
 * generated copy sound like a machine describing itself rather than a designer
 * describing a room.
 *
 * Two halves, kept in one place so they cannot drift:
 *
 *   - the instructions the writer is given: CLIENT_NARRATIVE_REGISTER_RULE for
 *     every client-facing document, and PROPOSAL_PARAMETER_RESTRAINT_RULE, the
 *     proposal's own evidence-use rule;
 *   - removeParameterCommentary(html): the deterministic backstop the narrative
 *     sanitizer applies to the returned prose, so the phrasing this rule forbids
 *     cannot reach a client even if the model writes it.
 *
 * Wording only. Nothing here reads, changes or reorders a figure, a level, a
 * product or a claim, and no validation rule is touched: a sentence that states an
 * assessed result is left exactly as it stands. The one figure this rule removes is
 * a boundary distance stated in the main narrative, which the evidence-use rule
 * places in the technical evidence rather than in the recommendation.
 *
 * Pure: no React, no SDK, no runtime-specific APIs. Safe in any backend function.
 */

/** The register's own generation, so a refinement is always traceable. */
export const CLIENT_NARRATIVE_REGISTER_VERSION = 1;

/**
 * What a client-facing document is for. Read by the proposal writer's own
 * instructions and by every System Design report section.
 */
export const CLIENT_NARRATIVE_REGISTER_RULE = [
  '=== TELL THE STORY, NEVER THE MECHANISM ===',
  'The client is buying a room, not a parameter set. State the recommendation and what the client will hear, and let the evidence support that account instead of becoming it.',
  'Never use a channel count as a selling point: no "5 discrete channels", no recounting of what a channel count makes possible. Name the system by its format where that helps the client picture what is being recommended, and never justify the design by how many channels it has.',
  'Never name a feature the design does not include, and never contrast the design against a layer, a format or a loudspeaker it does not have: no "no overhead channels are specified", "without height speakers", "no Atmos", "only listener-level" or "limited to 5.1".',
  'Never explain how a mechanism works: no "reproduce the system\'s low-frequency content", no account of what nearby walls, reflections, standing waves or room modes do to the sound, and no explanation of why a clearance or a measurement matters.',
  'Never explain the seating in acoustic terms. Say what the client hears where they sit rather than making the seating part of the acoustic arrangement or describing the relationship between the listeners and the loudspeakers.',
  'Never explain the seating theory, the prioritised listening positions or why the arrangement is what it is. Describe the arrangement and move on.',
  'Write the plain words for a room like this instead: a relaxed high-performance TV room, a simple well-executed 5.1 system, clear dialogue, screen sound locked to the picture, movement and space around the seating, proper bass weight, and a room that stays clear and controlled without feeling over-treated.',
].join('\n');

/**
 * The proposal's own evidence-use rule: evidence supports the story, it is never
 * the story.
 */
export const PROPOSAL_PARAMETER_RESTRAINT_RULE = 'EVIDENCE SUPPORTS THE STORY, IT IS NEVER THE STORY: the main proposal narrative carries the high-level facts the client is choosing between (the display, the system, the products, and a strong result stated naturally) and leaves the measurements to the sections and the report that carry them. Never bring an exact boundary distance, a loudspeaker spacing, an angle or a parameter number into the Design Summary, the Design Overview, Key Performance Highlights or the closing narrative, and never write a parameter-by-parameter account of the design. A figure earns its place in the story only where it states a key result the client asked about or a result the section exists to prove.';

/**
 * Clause-level rewrites: plain client wording, with no meaning invented. The
 * report's own phrase for the screen channels is replaced with the phrase a client
 * reads naturally, and a channel count is never left standing as a sales point.
 */
const COMMENTARY_REWRITES = Object.freeze([
  [/\bpicture[- ]related\s+sound\b/gi, 'screen sound'],
  [/\bis\s+arranged\s+around\s+the\s+audience\s+through\b/gi, 'is delivered through'],
  [/\b(\d+)\s+discrete\s+channels\b/gi, '$1 channels'],
]);

/**
 * Clauses removed: the mechanism, the boundary number and the two phrases that
 * explain the seating in acoustic terms. Each runs to the end of its own clause,
 * and the sentence's own punctuation is never consumed.
 */
const COMMENTARY_CLAUSES = Object.freeze([
  // ", and reproduce the system's low-frequency content"
  /[\s,;]*(?:and\s+)?(?:re)?produc(?:e|es|ing)\b[^.!?<>]{0,40}?\blow[- ]frequency\s+(?:content|information)\b/i,
  // ", with 1.29m to the nearest room boundary"
  /[\s,;]*(?:and\s+|with\s+|at\s+)?\d+(?:[.,]\d+)?\s?(?:m|metres?|meters?)\s+to\s+the\s+nearest\s+(?:room\s+)?boundar(?:y|ies)\b/i,
  // ", with the seating also part of the acoustic arrangement"
  /[\s,;]*(?:and\s+|with\s+)?the\s+seating\s+(?:is\s+|being\s+)?(?:also\s+)?(?:a\s+)?(?:part\s+of|a\s+factor\s+in)\s+the\s+acoustic\s+(?:arrangement|design|picture)\b/i,
  // ", and the relationship between listeners and surround loudspeakers"
  /[\s,;]*(?:and\s+)?the\s+relationship\s+between\s+(?:the\s+)?listeners?\s+and\s+(?:the\s+)?[^.!?<>]{0,30}?\b(?:loudspeakers|speakers)\b/i,
  // ", with 5 discrete channels"
  /[\s,;]*(?:with|carrying|using|having)\s+\d+\s+discrete\s+channels\b/i,
]);

/** A room boundary or a clearance. */
const BOUNDARY_ANCHOR = /\b(?:clearance|boundar(?:y|ies)|walls?)\b/i;

/** A cue that says what the boundary, the reflection or the mode does. */
const MECHANISM_CUE = /\b(?:matters?|because|influenc\w*|reflect\w*|behaviou?r|room\s+modes?|standing\s+waves?)\b/i;

/** A stated assessed result: the sentence carrying it is evidence, and is kept. */
const STATED_FIGURE = /\bP\d{1,2}\b|\bL[1-4]\b|\d+(?:[.,]\d+)?\s?(?:dB|dBC|Hz|kHz|mm|m|in|inches|%|degrees)\b/i;

/**
 * Split a text run into sentences. A full stop ends a sentence only where it is
 * followed by a space or the end of the run, so a decimal figure keeps its own
 * digits together: "1.29m" is never split into "1" and "29m". Whitespace stays with
 * the sentence it follows, so joining the pieces returns the run as it arrived.
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

/** Content words: what is left has to still read as a sentence. */
function countWords(text) {
  return String(text || '').split(/\s+/).filter((word) => /[a-z0-9]/i.test(word)).length;
}

/**
 * A sentence that explains what the room's boundaries do. A sentence that states an
 * assessed result is never one of them: that sentence is evidence, whatever else it
 * says. The boundary DISTANCE itself is removed at clause level, so a spacing or a
 * clearance figure can never be lost with a whole sentence.
 */
function explainsBoundaries(sentence) {
  if (STATED_FIGURE.test(sentence)) return false;
  return BOUNDARY_ANCHOR.test(sentence) && MECHANISM_CUE.test(sentence);
}

/**
 * The sentence with its commentary clauses removed, or null when the clauses were
 * all it said. A sentence nothing matched is returned exactly as it arrived.
 */
function withoutCommentaryClauses(sentence) {
  let out = COMMENTARY_REWRITES.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    sentence,
  );
  let removed = false;
  for (const pattern of COMMENTARY_CLAUSES) {
    if (!pattern.test(out)) continue;
    out = out.replace(pattern, '');
    removed = true;
  }
  if (!removed) return out;
  const kept = out.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+([.!?,;:])/g, '$1').trim();
  return countWords(kept) >= 5 ? kept : null;
}

/** Rewrite one text run (never crossing a tag): every sentence is read on its own. */
function rewriteRun(run) {
  if (!run.trim()) return run;
  const leading = (run.match(/^\s*/) || [''])[0];
  const pieces = splitSentences(run);
  const kept = pieces.map((piece) => {
    if (explainsBoundaries(piece)) return '';
    const withoutClauses = withoutCommentaryClauses(piece);
    return withoutClauses === null ? '' : withoutClauses;
  });
  const body = kept.join('').replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+([.!?,;:])/g, '$1').trim();
  return body ? `${leading}${body}` : '';
}

/** True when the body still carries readable copy. */
function hasCopy(html) {
  return String(html || '').replace(/<[^>]*>/g, ' ').replace(/[^a-z0-9]/gi, '').length > 0;
}

/**
 * Apply the register to one section body: parameter commentary is removed, and
 * everything else is left exactly as the writer wrote it.
 *
 * @param {string} html - the writer's returned section body
 * @returns {string} the body with parameter commentary removed
 */
export function removeParameterCommentary(html) {
  const source = String(html || '');
  if (!source) return source;
  const cleaned = source
    .split(/(<[^>]*>)/)
    .map((part) => (part.startsWith('<') ? part : rewriteRun(part)))
    .join('')
    .replace(/<p>\s*<\/p>/gi, '')
    .replace(/<li>\s*<\/li>/gi, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  // A body that was nothing but commentary is kept rather than emptied: an empty
  // body would fail the section instead of merely reading badly.
  return hasCopy(cleaned) ? cleaned : source;
}

export default removeParameterCommentary;