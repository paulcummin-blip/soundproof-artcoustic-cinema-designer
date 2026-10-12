/**
 * adiClarificationQuestions.js (shared)
 * -------------------------------------
 * THE clarification questions ADI may ask the designer before a proposal is
 * written, and the rules that decide whether to ask at all.
 *
 * WHY IT EXISTS. Some important design decisions leave no reason on record: the
 * reports state what the design IS (six overhead channels, four subwoofers, two
 * seating rows) and record no reason WHY it was chosen that way. A proposal that
 * cannot explain a decision either says nothing about it or, worse, implies a
 * reason Sound Proof does not hold. Asking the designer for that one reason is
 * what lets the writer explain the finished cinema properly.
 *
 * WHAT IT DOES. For every candidate question it checks THREE things against the
 * canonical frozen evidence, and asks only where all three hold:
 *
 *   1. the design really has the thing asked about (read from the frozen
 *      snapshot, never from an assumption);
 *   2. the design's own geometry is the same across every selected version, and
 *      where a count is named it is the same count in every one of them, so a
 *      question can never misdescribe one version of a comparison;
 *   3. no reason for that decision is already on record — in the verified design
 *      interpretation, or in the designer's own words in the brief and notes.
 *
 * WHAT IT NEVER DOES. It never states a reason, never assumes an answer, never
 * asks about something the frozen evidence does not show, and never asks more
 * than THREE questions in one proposal preparation. Zero questions is a normal,
 * correct outcome: where the context is complete ADI asks nothing.
 *
 * A question is an OFFER. Nothing blocks generating a proposal, and a question
 * the designer passes is never treated as answered and never asked again during
 * the same preparation.
 *
 * Pure: no React, no SDK, no writes.
 */

import { toNumber } from '../adiNarrativeFacts.js';
import { groundedReason } from '../proposalWriter/writerBriefReasoning.js';
import { rp22QuestionDecision } from '../rp22DesignContext.js';

/** The hard limit: never more than three questions in one preparation. */
export const MAX_CLARIFICATION_QUESTIONS = 3;

const NUMBER_WORDS = Object.freeze([
  'zero', 'one', 'two', 'three', 'four', 'five', 'six',
  'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
]);

/** `6` reads as 'six'; a value beyond the word list keeps its digits. */
export function numberWord(value) {
  const count = toNumber(value);
  if (count === null) return null;
  const whole = Math.round(count);
  return whole >= 0 && whole < NUMBER_WORDS.length ? NUMBER_WORDS[whole] : String(whole);
}

/**
 * The overhead loudspeaker count of one frozen version. Read from the snapshot's
 * own channel layout, and otherwise from the third digit of the Dolby
 * configuration (9.1.6 is nine bed, one LFE, six overhead) — never invented.
 */
export function overheadChannelCount({ facts = null, snapshot = null } = {}) {
  const explicit = toNumber(snapshot?.system?.channel_layout?.overhead_channels);
  if (explicit !== null) return explicit;
  const configuration = String(facts?.channels?.configuration || '');
  const parts = configuration.split('.');
  return parts.length >= 3 ? toNumber(parts[2]) : null;
}

/** The active subwoofer count of one frozen version, or null when not stated. */
export function subwooferCount({ facts = null } = {}) {
  return toNumber(facts?.subwoofers?.totalSubwooferCount);
}

/** The seating row count of one frozen version, or null when not stated. */
export function rowCount({ facts = null } = {}) {
  return toNumber(facts?.seating?.rows);
}

/** The acoustic treatment one frozen version specifies, or null when none is stated. */
export function acousticTreatment({ snapshot = null } = {}) {
  const treatment = snapshot?.room?.acoustic_treatment || null;
  if (!treatment || treatment.enabled !== true) return null;
  const quantity = toNumber(treatment.quantity);
  if (quantity === null || quantity <= 0) return null;
  return { quantity, product: String(treatment.product || 'acoustic treatment') };
}

/** Every value read is identical, and at least one version states one. */
function sameValue(values) {
  if (values.length === 0) return false;
  if (values.some((value) => value === null)) return false;
  return values.every((value) => value === values[0]);
}

/**
 * The sentences of a brief that ASK for something rather than STATE a reason.
 * "Explain the overhead speaker spacing logic" is a request; it is not a
 * designer's explanation of why the spacing is what it is, so a request is never
 * read as documented reasoning.
 */
const REQUEST_OPENER = /^(?:please\s+)?(?:explain|explain\s+why|highlight|emphasise|emphasize|mention|show|discuss|suggest|note|state|cover|include|detail)\b/i;

export function withoutRequests(text) {
  return String(text || '')
    .split(/(?<=[.!?;])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0 && !REQUEST_OPENER.test(sentence.replace(/^[\s•·\-*]+/, '')))
    .join(' ');
}

/**
 * The questions ADI may ask, in priority order. The wording is built from the
 * frozen evidence, so a question names this design's own figures.
 */
const QUESTION_CANDIDATES = Object.freeze([
  {
    question_id: 'overhead_speaker_reason',
    area: 'overheads',
    belongs_to: 'what_stays_same',
    priority: 1,
    applies: ({ facts, snapshot }) => Boolean(facts?.parameters?.p9) && (overheadChannelCount({ facts, snapshot }) || 0) >= 4,
    sharedAcross: (sources) => sameValue(sources.map(overheadChannelCount)),
    question: (sources) => {
      const count = numberWord(overheadChannelCount(sources[0]));
      if (!count) return null;
      const rows = numberWord(rowCount(sources[0]));
      return rows && rowCount(sources[0]) >= 2
        ? `What was the main reason for selecting ${count} overhead loudspeakers for this ${rows}-row cinema?`
        : `What was the main reason for selecting ${count} overhead loudspeakers in this room?`;
    },
    subjectPatterns: [/\boverhead|height\s+(?:channel|speaker)/i],
    // The reason the question asks about is the reason for the NUMBER and the
    // PLACEMENT of the overheads. A recorded reason for choosing which overhead
    // loudspeaker to use is a different decision and does not answer it, so the
    // matter read here is the count and the geometry that drives it.
    documentedTerms: [
      'count', 'number', 'quantity', 'spacing', 'position', 'positions', 'layer', 'layers',
      'row', 'rows', 'seat', 'seats', 'coverage across', 'wide', 'width', 'ceiling',
      'front', 'middle', 'rear',
    ],
  },
  {
    question_id: 'subwoofer_arrangement_reason',
    area: 'subwoofers',
    belongs_to: 'what_stays_same',
    priority: 2,
    applies: ({ facts }) => (subwooferCount({ facts }) || 0) > 1,
    sharedAcross: (sources) => sameValue(sources.map(subwooferCount)),
    question: (sources) => {
      const count = numberWord(subwooferCount(sources[0]));
      return count ? `What was the main reason for the ${count}-subwoofer arrangement in this room?` : null;
    },
    subjectPatterns: [/\bsubwoofers?\b|\bsubs\b/i],
    documentedTerms: ['placement', 'position', 'count', 'symmetry', 'strategy', 'arrangement', 'layout', 'chosen', 'selected', 'specified'],
  },
  {
    question_id: 'seating_priority_reason',
    area: 'seating',
    belongs_to: 'decision_summary',
    priority: 3,
    applies: ({ facts }) => (rowCount({ facts }) || 0) >= 2,
    sharedAcross: (sources) => sameValue(sources.map(rowCount)),
    question: (sources) => {
      const rows = numberWord(rowCount(sources[0]));
      return rows ? `Which seating row was the priority in this ${rows}-row design, and what drives that choice?` : null;
    },
    subjectPatterns: [/\bseats?\b|\bseating\b|\brows?\b|viewing\s+position/i],
    documentedTerms: ['priority', 'prioritised', 'prioritized', 'sightline', 'comfort', 'row', 'position', 'chosen', 'selected'],
  },
  {
    question_id: 'acoustic_treatment_reason',
    area: 'acoustic_treatment',
    belongs_to: 'what_stays_same',
    priority: 4,
    applies: ({ snapshot }) => acousticTreatment({ snapshot }) !== null,
    sharedAcross: (sources) => sameValue(sources.map((source) => acousticTreatment(source)?.quantity ?? null)),
    question: (sources) => {
      const treatment = acousticTreatment(sources[0]);
      const count = treatment ? numberWord(treatment.quantity) : null;
      return count ? `What led to the ${count} ${treatment.product} panels specified for this room?` : null;
    },
    subjectPatterns: [/\babfuser|acoustic\s+treatment|panels?\b/i],
    documentedTerms: ['reason', 'purpose', 'reflection', 'reverberation', 'absorption', 'diffusion', 'chosen', 'selected', 'specified', 'quantity'],
  },
]);

/**
 * The questions ADI may put to the designer for these selected versions.
 *
 * @param {Object} input
 * @param {Array<{version_id: string|null, facts: Object, snapshot: Object}>} input.versions
 *   — one entry per selected version, each with its own frozen snapshot and the
 *   facts read from it. Every question must hold for EVERY entry.
 * @param {string} [input.material] — the recorded reasoning the design already
 *   holds: the verified interpretation, the designer's brief and notes.
 * @param {Array<string>} [input.askedQuestionIds] — questions already answered or
 *   passed in this preparation. A passed question is not asked again.
 * @returns {Array<{question_id, area, belongs_to, question, version_ids}>}
 */
export function buildClarificationQuestions({ versions = [], material = '', askedQuestionIds = [] } = {}) {
  const sources = (Array.isArray(versions) ? versions : [])
    .filter((entry) => entry?.facts?.available === true && entry?.snapshot);
  if (sources.length === 0) return [];

  const asked = new Set((Array.isArray(askedQuestionIds) ? askedQuestionIds : [])
    .map((id) => String(id || '').trim())
    .filter(Boolean));
  // A request the brief makes is not a recorded reason, so it never suppresses
  // a question: the reason is still missing until the designer states one.
  const recorded = withoutRequests(material);

  const out = [];
  for (const candidate of [...QUESTION_CANDIDATES].sort((a, b) => a.priority - b.priority)) {
    if (out.length >= MAX_CLARIFICATION_QUESTIONS) break;
    if (asked.has(candidate.question_id)) continue;
    // The RP22 design context decides two of these before any other check: an
    // acoustic-treatment reason is not asked at the design stage at all, and a
    // reference position the frozen evidence already declares is not asked for
    // again. A general principle never suppresses a question about this project's
    // own decision, so every other question stands.
    if (!sources.every((source) => rp22QuestionDecision({
      question_id: candidate.question_id,
      snapshot: source.snapshot,
    }).ask)) continue;
    if (!sources.every((source) => candidate.applies(source))) continue;
    if (candidate.sharedAcross && !candidate.sharedAcross(sources)) continue;
    if (groundedReason({
      text: recorded,
      subjectPatterns: candidate.subjectPatterns,
      contentTerms: candidate.documentedTerms,
    })) continue;
    const question = candidate.question(sources);
    if (!question) continue;
    out.push({
      question_id: candidate.question_id,
      area: candidate.area,
      belongs_to: candidate.belongs_to,
      question,
      version_ids: sources.map((source) => source.version_id).filter(Boolean),
    });
  }
  return out;
}

/** The question ids already answered or passed, read from stored records. */
export function askedQuestionIds(records = []) {
  return (Array.isArray(records) ? records : [])
    .map((record) => String(record?.question_id || '').trim())
    .filter(Boolean);
}

export default buildClarificationQuestions;