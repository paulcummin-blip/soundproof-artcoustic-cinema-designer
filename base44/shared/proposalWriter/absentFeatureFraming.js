/**
 * absentFeatureFraming.js (shared, PROPOSAL ONLY)
 * -----------------------------------------------
 * The ONE authority for how proposal copy treats a feature the design does not
 * have. A proposal is a sales document: it states what this design is and what it
 * gives the client. A sentence spent on an absent feature sells nothing, and it
 * tells a client about a layer they were never expecting to hear.
 *
 * Two halves, and they are the same rule:
 *
 *   - `absentFeatureFramingRule({ comparison })` — the instruction given to the
 *     writer, so the copy is generated positively in the first place, specific to
 *     the project rather than to a stock sentence;
 *   - `removeAbsentFeatureFraming(html, { allowed })` — the deterministic
 *     backstop applied to the returned prose by the narrative sanitizer, so an
 *     absent-feature comparison cannot reach a client even if the model writes it.
 *
 * The comparison exception is explicit and never inferred from the design: it is
 * the client asking for it. A comparison PROPOSAL is that request (the proposal
 * type is chosen deliberately), and so is a brief or a designer note that asks to
 * compare options, explain a downgrade, describe an upgrade or weigh a budget
 * trade-off — `comparisonFramingRequested()` reads that ask.
 *
 * Wording only. Nothing here reads, changes or reorders a value, a level, a
 * parameter, a product or an engineering claim: a sentence that states an assessed
 * figure is never removed, so no evidence is lost to this rule.
 *
 * Pure: no React, no SDK, no runtime-specific APIs. Safe in any backend function.
 */

/** The layer nouns whose absence an absent-feature comparison is built from. */
const ABSENT_LAYER = 'overhead|overheads|height|heights|upper|top|ceiling|immersive|atmos';

/** A contrast clause that runs to the end of its sentence: ", rather than an overhead sound layer". */
const TRAILING_CONTRAST_CLAUSE = new RegExp(
  `[\\s,;:]*(?:rather than|instead of|as opposed to)\\s+(?:an?\\s+|the\\s+|any\\s+)?(?:${ABSENT_LAYER})\\b[\\w-]*(?:\\s+[\\w-]+){0,3}\\s*$`,
  'i',
);

/**
 * A layer noun that LEADS its own statement, so the noun and the absence verb
 * travel together: "the overhead speakers are missing", "the height layer is
 * absent". A bare `upper` or `top` is read as a layer only where it is named as
 * one, so "the top row of seats" is furniture and is never removed by this rule.
 */
const ABSENT_LAYER_NOUN_FIRST = `overheads?|heights?|ceiling|immersive|atmos|(?:upper|top)\\s+layer`;

/**
 * A sentence about something the design does not have. A qualifier such as "only
 * listener-level" or "limited to 5.1" is NOT one of these: the design is real and
 * the statement is true, so it is rewritten by FRAMING_REWRITES and kept.
 */
const ABSENCE_STATEMENTS = Object.freeze([
  new RegExp(`\\b(?:no|not any|zero)\\s+(?:${ABSENT_LAYER})\\b`, 'i'),
  new RegExp(`\\b(?:free of|without|absent)\\s+(?:any\\s+|the\\s+)?(?:${ABSENT_LAYER})\\b`, 'i'),
  new RegExp(`\\b(?:lacks?|lacking|missing|devoid of)\\b[^.!?<>]{0,60}?(?:${ABSENT_LAYER}|layer\\b)`, 'i'),
  new RegExp(`\\b(?:${ABSENT_LAYER_NOUN_FIRST})\\b[^.!?<>]{0,40}?\\b(?:missing|absent|omitted|left out|not (?:present|included|used|part of))\\b`, 'i'),
  new RegExp(`\\b(?:is|are|isn['’]t|aren['’]t)\\s+not\\s+an?\\s+(?:atmos|immersive|dolby atmos)\\b`, 'i'),
  new RegExp(`\\bisn['’]t\\s+an?\\s+(?:atmos|immersive|dolby atmos)\\b`, 'i'),
  new RegExp(`\\bnot\\s+(?:an?\\s+)?(?:atmos|immersive)\\s+(?:system|design|cinema|layout|room)\\b`, 'i'),
  new RegExp(`\\bdoes\\s+not\\s+(?:include|have|use|feature|add|offer)\\b[^.!?<>]{0,40}?(?:${ABSENT_LAYER})\\b`, 'i'),
  /\bmiss(?:es|ing|ed)?\s+out\s+on\b/i,
  new RegExp(`\\b(?:not|never)\\s+(?:get|gets|getting|receive|receives|receiving)\\b[^.!?<>]{0,40}?(?:${ABSENT_LAYER})\\b`, 'i'),
]);

/**
 * Framing that qualifies a design as the smaller one. Rewritten rather than
 * removed, because the statement itself is true and worth keeping: "limited to
 * 5.1" becomes "5.1", and "only listener-level" becomes "listener-level".
 */
const FRAMING_REWRITES = Object.freeze([
  [/[ \t]*\b(?:only|merely|just|simply|purely)\s+((?:a\s+)?(?:listener-level|bed-layer|5\.1|7\.1|5-channel|five-channel|surround-only))\b/gi, '$1'],
  [/[ \t]*\blimited to\s+((?:a\s+)?(?:5\.1|7\.1|five-channel|5-channel))\b/gi, '$1'],
]);

/** A stated figure: the sentence carrying it is evidence, and is never removed. */
const STATED_FIGURE = /\bP\d{1,2}\b|\bL[1-4]\b|\d+(?:[.,]\d+)?\s?(?:dB|dBC|Hz|kHz|m|mm|in|inches|%|degrees)/i;

/** An explicit ask for a comparison, a downgrade explanation, an upgrade or a trade-off. */
const COMPARISON_REQUEST = /\b(?:compar(?:e|es|ed|ing|ison)|versus|vs\.?|trade[- ]?offs?|upgrade|downgrade|budget|cheaper|more expensive|price difference)\b/i;

/** True when the client's own words ask for a comparison, an upgrade or a trade-off. */
export function comparisonFramingRequested(text) {
  return COMPARISON_REQUEST.test(String(text || ''));
}

/**
 * The writer's rule. Stated as the shape of a positive sentence, never as one
 * fixed sentence to copy: the writer must say what THIS room's design does.
 */
export function absentFeatureFramingRule({ comparison = false } = {}) {
  const exception = comparison
    ? 'This IS a comparison proposal: the difference between the options is part of what the client is buying, so the trade-off is stated plainly, once, and never as a defect in either design.'
    : 'Where the client has explicitly asked for a comparison, a downgrade explanation, an upgrade option or a budget trade-off, that comparison is allowed: state it plainly, once, and never as a defect. No other mention of an absent feature is written.';
  return [
    '=== DESCRIBE WHAT THE DESIGN DOES, NEVER WHAT IT DOES NOT DO ===',
    'This proposal states what this design is and what it gives the client. A sentence about a feature the design does not have sells nothing, and it tells the client about something they were never expecting to hear.',
    'Never write: "rather than an overhead sound layer", "instead of overhead speakers", "without height speakers", "no overhead layer", "no Atmos", "not an immersive system", "only listener-level", "limited to 5.1", "lacks" or "missing". Never contrast the selected design against the layer, the channel count or the format it does not use, and never present it as the smaller version of another design.',
    'Where the design has no height layer, write its own case: clear dialogue from the TV or the front stage, movement around the seating from the surround channels, useful bass support behind the soundtrack, a straightforward practical layout that suits how the room is actually used, comfortable everyday use for sport, box sets, films and music, and real performance when the soundtrack asks for it.',
    'Do not write: "This is a listener-level surround arrangement, centred on the relationship between the TV, the front stage and the seating rather than an overhead sound layer." Write a sentence about this room instead, naming what the design has and how it works — for example, "The layout keeps the TV, the front speakers, the surrounds and the subwoofers working together around the main seating area." Use the shape and not the words: the sentence must be specific to this project.',
    exception,
  ].join('\n');
}

/** Apply the framing rewrites to one sentence. */
function rewriteFraming(sentence) {
  return FRAMING_REWRITES.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), sentence);
}

/**
 * Whether a sentence is about the absence itself. A sentence that states an
 * assessed figure is never one of them: that sentence is evidence, not framing.
 */
function statesAbsence(sentence) {
  if (STATED_FIGURE.test(sentence)) return false;
  return ABSENCE_STATEMENTS.some((pattern) => pattern.test(sentence));
}

/** The sentence with its trailing contrast clause removed, or null when nothing is left of it. */
function withoutTrailingContrast(sentence) {
  if (!TRAILING_CONTRAST_CLAUSE.test(sentence)) return sentence;
  const kept = sentence.replace(TRAILING_CONTRAST_CLAUSE, '').trim();
  const words = kept.split(/\s+/).filter((word) => /[a-z0-9]/i.test(word));
  return words.length >= 4 ? kept : null;
}

/** Rewrite one text run (never crossing a tag): every sentence is read on its own. */
function rewriteRun(run, allowed) {
  if (!run.trim()) return run;
  const leading = (run.match(/^\s*/) || [''])[0];
  const pieces = run.match(/[^.!?]+[.!?]*/g) || [run];
  const kept = pieces.map((piece) => {
    if (allowed) return piece;
    if (statesAbsence(piece)) return '';
    const withoutContrast = withoutTrailingContrast(piece);
    if (withoutContrast === null) return '';
    return rewriteFraming(withoutContrast);
  });
  const body = kept.join('').replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+([.!?,;:])/g, '$1').trim();
  return body ? `${leading}${body}` : '';
}

/** True when the body still carries readable copy. */
function hasCopy(html) {
  return String(html || '').replace(/<[^>]*>/g, ' ').replace(/[^a-z0-9]/gi, '').length > 0;
}

/**
 * Apply the absent-feature rule to one section body.
 *
 * @param {string} html - the model's returned section body
 * @param {{ allowed?: boolean }} [options] - `allowed` is the client's explicit
 *   comparison request, already resolved by the caller. When it is true the body
 *   is returned untouched.
 * @returns {string} the body with absent-feature framing removed
 */
export function removeAbsentFeatureFraming(html, options = {}) {
  const source = String(html || '');
  if (!source || options.allowed) return source;
  const cleaned = source
    .split(/(<[^>]*>)/)
    .map((part) => (part.startsWith('<') ? part : rewriteRun(part, false)))
    .join('')
    .replace(/<p>\s*<\/p>/gi, '')
    .replace(/<li>\s*<\/li>/gi, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  // A body that was nothing but absent-feature framing is kept rather than
  // emptied: an empty body would fail the section instead of merely reading badly.
  return hasCopy(cleaned) ? cleaned : source;
}

export default removeAbsentFeatureFraming;