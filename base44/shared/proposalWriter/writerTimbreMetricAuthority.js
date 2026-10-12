/**
 * writerTimbreMetricAuthority.js (shared)
 * ---------------------------------------
 * WHAT RP22 P16 AND P17 ACTUALLY MEASURE, and the writing boundary that follows.
 *
 * Both parameters are SEAT-TO-SEAT frequency-response variance: how much one
 * loudspeaker group's tonal balance changes from listening position to listening
 * position, normalised to the response measured at the reference seating position
 * (500 Hz to 16 kHz, one-octave smoothing). P16 states it for the screen-wall
 * speakers and P17 for the wide, surround and upper speakers.
 *
 * Neither parameter compares one loudspeaker group with another. A result of
 * ±0.5 dB means the screen channels hold their own tonal balance that closely from
 * seat to seat; it says nothing about how closely the screen channels resemble the
 * surround or overhead speakers. So a seat-to-seat figure is never written as an
 * inter-speaker or between-group match, and the tonal aim of a design is stated as
 * the aim it is.
 *
 * The rule reads only the sentence and the claims it cites: where a sentence
 * asserts a match, a level match or an equality between two named loudspeaker
 * groups on tonal evidence, it is refused, because the evidence it cites measures
 * neither. A statement that a sound keeps its character as it moves around the
 * cinema names no relationship between loudspeaker groups, so the design's own
 * tonal aim is untouched by this rule.
 *
 * Nothing here calculates, grades or re-reads a result: it states the meaning of
 * the two published metrics and reads prose against it.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

import { isPackProse } from './writerVocabulary.js';
import { isDenied } from './writerOutputTextRules.js';

/** The generation of this metric authority, so a draft can be traced to it. */
export const TIMBRE_METRIC_AUTHORITY_VERSION = 1;

/** The two published metrics, as the reports define them. */
export const TIMBRE_METRIC_AUTHORITY = Object.freeze([
  Object.freeze({
    parameter: 'P16',
    group: 'screen-wall speakers',
    metric: 'seat-to-seat frequency-response variance across the screen-wall speakers, '
      + 'normalised to the measured response at the reference seating position '
      + '(500 Hz to 16 kHz, one-octave smoothing)',
    establishes: 'how consistently the screen channels hold the same tonal balance from seat to seat',
    does_not_establish: 'a match between the screen channels and any other loudspeaker group',
  }),
  Object.freeze({
    parameter: 'P17',
    group: 'wide, surround and upper speakers',
    metric: 'seat-to-seat frequency-response variance across the wide, surround and upper speakers, '
      + 'normalised to the measured response at the reference seating position '
      + '(500 Hz to 16 kHz, one-octave smoothing)',
    establishes: 'how consistently the surround and overhead speakers hold the same tonal balance from seat to seat',
    does_not_establish: 'a match between the surround or overhead speakers and any other loudspeaker group',
  }),
]);

/**
 * The rule the writer is held to, stated where it reads its own contract rather
 * than only in the validator.
 */
export const TIMBRE_METRIC_RULE = [
  'P16 and P17 are seat-to-seat frequency-response results: each states how consistently ONE loudspeaker group holds its own tonal balance from listening position to listening position.',
  'Neither states how closely one loudspeaker group resembles another, so a seat-to-seat figure is never written as an inter-speaker or between-group match, and is never attached to a comparison between the screen, surround and overhead speakers.',
  'The tonal aim of the design is written as the aim it is: where the copy describes a sound keeping its character as it passes between loudspeakers, that is the design\'s intent, never a measured match between the speaker groups and never a figure from these results.',
].join(' ');

/** The claim evidence this boundary governs: the tonal results and their stories. */
const TONAL_EVIDENCE = /tonal[-_ ]consistency|timbre|p1[67]\b/i;

/** A loudspeaker group, as a proposal names it. */
const GROUP = '(?:screen(?:\\s+(?:channels?|speakers?|stage|wall))?'
  + '|front\\s+(?:stage|lcr|left|right)'
  + '|lcr'
  + '|surrounds?'
  + '|wides?'
  + '|overheads?'
  + '|height(?:\\s+(?:channels?|speakers?))?'
  + '|uppers?)';

/**
 * Two named groups made into one subject: "screen-to-surround", "the screen
 * channels and the surround speakers". Only a JOINED pair is read, so a sentence
 * that merely lists the layers — "as it moves between the screen, the surround and
 * the overhead channels" — is not a claim about a relationship between them.
 */
const GROUP_PAIR = `\\b${GROUP}(?:\\s*(?:,|and|or|\\+|\\/|to|with)\\s*(?:the\\s+)?|-to-)\\s*${GROUP}`;

/** The only words allowed between the pair and what is asserted about it. */
const BETWEEN = '(?:\\s+(?:channels?|speakers?|are|is|were|was|both|and)){0,2}';

/** What is actually asserted about the two groups: a match, a level, an equality. */
const MATCH_TERM = '(?:level\\s+match|match(?:es|ed|ing)?|matched|identical|the\\s+same|equal|aligned|in\\s+step|uniform|consistent(?:cy)?)';

const INTER_GROUP_MATCH = new RegExp(`${GROUP_PAIR}${BETWEEN}\\s+${MATCH_TERM}\\b`, 'i');

/** The one reason this rule reports. */
export const TIMBRE_INTER_GROUP_MATCH_REASON = 'a_seat_to_seat_result_is_not_a_match_between_loudspeaker_groups';

/**
 * Whether a sentence presents tonal evidence as a match between loudspeaker
 * groups.
 *
 * Reported only where all three hold: the sentence joins two named loudspeaker
 * groups and asserts a match between them; the section rests that sentence on
 * tonal evidence (P16, P17 or a tonal story); and the clause does not deny its own
 * claim. The pack's own prose is exempt, exactly as it is for the other rules.
 *
 * @param {Object} params
 * @param {string} params.text — the clause or sentence as written
 * @param {Array<Object>} [params.claims] — the claims the section cites
 * @param {Array<string>} [params.packProse] — the pack's own sentences
 * @returns {string|null} the reason, or null when the sentence is sound
 */
export function timbreInterGroupMatchIssue({ text, claims = [], packProse = [] } = {}) {
  const sentence = String(text || '');
  if (sentence.length === 0) return null;
  if (isPackProse(sentence, packProse)) return null;

  const cited = Array.isArray(claims) ? claims : [];
  const tonal = cited.some((claim) => TONAL_EVIDENCE.test(`${claim?.claim_id || ''} ${claim?.area || ''}`));
  if (!tonal) return null;

  const match = INTER_GROUP_MATCH.exec(sentence);
  if (!match) return null;
  if (isDenied(sentence, match.index)) return null;

  return TIMBRE_INTER_GROUP_MATCH_REASON;
}

export default timbreInterGroupMatchIssue;