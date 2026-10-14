/**
 * proposalNarrativeContext.js (base44/shared — CANONICAL)
 * -------------------------------------------------------
 * THE CONTEXT THE NARRATIVE CLASSIFICATION READS, READ ONCE.
 *
 * ASDR importance says what matters and the evidence says how well it performs, but
 * neither answers the question the client story turns on: is this performance right
 * for THIS project? A single-row television lounge and a reference-style dedicated
 * cinema can hold identical results and deserve different emphasis, so the grouping
 * is given the project's own context — its declared intent, its room type, the
 * subjects the designer's brief and steer name, and the subjects the steer keeps out.
 *
 * WHAT IT NEVER DOES. It decides no figure, level, product or claim, and it never
 * reads live design state: everything here comes from the proposal record, its
 * verified interpretation, the designer's own brief, and the frozen option facts.
 * A missing value is left missing rather than guessed, so the classification falls
 * back to its own default rather than to an invented intent.
 *
 * Pure: no React, no SDK, no storage, no recalculation, no side effects.
 */

import { BRIEF_INTENT, areasForBriefText } from './briefRelevance.js';
import { suppressedAreasFromTopics } from './narrativePriorityAuthority.js';

/**
 * The stored narrative-steer states. These are the values the steer is SAVED under,
 * read here as data: this module never changes a steer, and a topic state it does
 * not recognise is simply ignored.
 */
export const STEER_STATE_VALUE = Object.freeze({
  PREFER: 'prefer',
  DO_NOT_DISCUSS: 'do_not_discuss',
});

/**
 * THE EXPLICIT DESIGNATION, in the project's own words. A client, dealer or designer
 * who says the room is a dedicated cinema has decided what the project is, and the
 * display it happens to be built around does not overrule them: a large television
 * chosen instead of the projector is still a dedicated cinema to the client who
 * chose it. Deliberately narrow — a bare "cinema room" is not a designation.
 */
const EXPLICIT_DEDICATED_CINEMA = /\bdedicated\s+(?:home\s+|screening\s+)?cinema\b|\bdedicated\s+screening\s+room\b|\breference[\s-]*(?:style|grade|level)?\s+(?:dedicated\s+)?cinema\b|\bcinema\s+bunker\b/i;

/** An explicit media-room designation: the same authority, one room type down. */
const EXPLICIT_MEDIA_ROOM = /\b(?:media|family|living|everyday)\s+(?:room|lounge)\b|\bmedia\s+den\b/i;

/** One topic's recorded state, from either the stored shape or a bare string. */
function stateOf(entry) {
  return typeof entry === 'string' ? entry : entry?.state ?? null;
}

/**
 * The topics a steer recorded at one state, in the steer's own order. The steer is
 * the stored map (topic key → state, or topic key → { state, label }).
 *
 * @param {Object|null} steer
 * @param {string} state
 * @returns {Array<string>} the topic keys
 */
export function steerTopicKeys(steer, state) {
  if (!steer || typeof steer !== 'object') return [];
  return Object.entries(steer)
    .filter(([, entry]) => stateOf(entry) === state)
    .map(([key]) => String(key));
}

/** The steering topics kept out of the narrative, and those the designer prefers. */
export function steerTopicSelection(steer = null) {
  return {
    excludedTopics: steerTopicKeys(steer, STEER_STATE_VALUE.DO_NOT_DISCUSS),
    preferredTopics: steerTopicKeys(steer, STEER_STATE_VALUE.PREFER),
  };
}

/**
 * What one frozen design CONTAINS, read from its own facts: the presence of a
 * display, loudspeakers, seating and bass. Nothing is inferred from a level, and a
 * fact the evidence does not state is never read as present.
 *
 * @param {Object|null} facts — one option's frozen facts
 * @returns {Object} the design block the brief-relevance authority reads
 */
export function designContainmentFromFacts(facts = null) {
  const layout = facts?.system?.channel_layout || {};
  const bedChannels = Number(layout.bed_channels) || 0;
  const overheadChannels = Number(layout.overhead_channels) || 0;
  const subwoofers = Number(layout.subwoofer_count) || Number(facts?.system?.subwoofer_strategy?.count) || 0;
  const products = Array.isArray(facts?.system?.products) ? facts.system.products.length : 0;
  const seats = Number(facts?.seating?.seat_count) || 0;
  const viewing = Array.isArray(facts?.viewing?.per_seat) ? facts.viewing.per_seat.length : 0;
  return {
    display: facts?.screen != null || viewing > 0,
    speakers: products > 0 || bedChannels > 0,
    seats: seats || viewing,
    bass: subwoofers > 0,
    spatial: overheadChannels > 0 || bedChannels >= 5 || products > 0,
    timbre: products > 1 || bedChannels >= 5,
    screenChannels: bedChannels >= 5 || products > 0,
  };
}

/** The first number actually stated, so a missing fact is never read as zero. */
function numberOf(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

/**
 * THE SHAPE OF THE DESIGN ITSELF: the display it presents on, how it is seated, how
 * substantial its loudspeaker layout is and whether the room was treated. Every value
 * is read from the frozen facts, falling back to the saved report evidence where the
 * facts are silent, and none of it is inferred from a level.
 *
 * @param {Object|null} facts — one option's frozen facts
 * @param {Object|null} [evidence] — the saved report evidence behind those facts
 * @returns {Object} the shape, and whether it reads as a cinema or a media room
 */
export function readDesignShape(facts = null, evidence = null) {
  const layout = facts?.system?.channel_layout || {};
  const evidenceLayout = evidence?.system?.channel_layout || {};
  const screen = facts?.screen || evidence?.room?.screen || evidence?.screen || null;
  const seating = facts?.seating || evidence?.room?.seating || evidence?.seating || null;
  const rowCount = numberOf(seating?.row_count);
  const seatCount = numberOf(seating?.seat_count);
  const bedChannels = numberOf(layout.bed_channels, evidenceLayout.bed_channels);
  const overheadChannels = numberOf(layout.overhead_channels, evidenceLayout.overhead_channels);
  const subwooferCount = numberOf(layout.subwoofer_count, evidenceLayout.subwoofer_count);
  const treatment = [
    facts?.room?.acoustic_treatment,
    evidence?.room?.acoustic_treatment,
    evidence?.system?.acoustic_treatment,
  ].find((value) => Array.isArray(value)) || [];
  const displayType = String(screen?.display_type || '').toLowerCase();

  // The two shapes the structural context separates, each requiring its own evidence.
  const multiRow = rowCount != null && rowCount >= 2;
  const immersive = overheadChannels != null && overheadChannels > 0;
  const substantialSurround = bedChannels != null && bedChannels >= 7;
  const treated = treatment.length > 0;
  // A single-row television system on a straightforward 5.1 or 7.1 layout with no
  // height layer is the media-room shape: nothing about it reads as a cinema, so no
  // structural evidence of its own can promote it.
  const simpleSingleRowTv = displayType === 'tv'
    && (rowCount == null || rowCount <= 1)
    && (bedChannels == null || bedChannels <= 5)
    && !immersive;

  return {
    display_type: displayType || null,
    row_count: rowCount,
    seat_count: seatCount,
    bed_channels: bedChannels,
    overhead_channels: overheadChannels,
    subwoofer_count: subwooferCount,
    treatment_count: treatment.length,
    multi_row: multiRow,
    immersive,
    substantial_surround: substantialSurround,
    treated,
    // Cinema indicators present, and nothing that says media room.
    dedicated_cinema: !simpleSingleRowTv && (multiRow || immersive || substantialSurround || treated),
    media_lounge: simpleSingleRowTv && !multiRow && !immersive,
  };
}

/**
 * WHAT KIND OF ROOM THE PROJECT IS, resolved in the order the project's own words and
 * structure demand:
 *
 *   1. THE EXPLICIT DESIGNATION FIRST. The client's brief, the dealer's brief and the
 *      ADI interpretation are the project's own statement of what it is, and they win.
 *      A television as the chosen display never overrides an explicit intent.
 *   2. THE STRUCTURAL DESIGN CONTEXT. Where nothing is stated, the design's own shape
 *      decides: two or more seating rows, an immersive multi-layer loudspeaker layout,
 *      a substantial surround system or dedicated acoustic treatment read as a
 *      dedicated cinema; a single-row television system on a 5.1 or 7.1 layout reads
 *      as a media lounge.
 *   3. THE DISPLAY, ONLY WHERE THE SHAPE IS AMBIGUOUS. A television then says media
 *      lounge and a projection design says cinema — asked last, because a display
 *      carries no authority over what the client says they are building.
 *
 * @param {Object} input
 * @param {string|null} [input.declaredIntent] — the interpretation's stated intent
 * @param {string|null} [input.roomType] — the interpretation's room type
 * @param {string} [input.briefText] — the designer's own client / narrative brief
 * @param {Object|null} [input.facts] — the option's frozen facts
 * @param {Object|null} [input.evidence] — the saved report evidence behind those facts
 * @param {Object|null} [input.shape] — a shape already read by the caller
 * @returns {string|null} one of the brief intents, or null where nothing is stated
 */
export function resolveBriefIntent({
  declaredIntent = null,
  roomType = null,
  briefText = '',
  facts = null,
  evidence = null,
  shape = null,
} = {}) {
  const stated = [declaredIntent, roomType, briefText].filter(Boolean).join('\n');
  if (EXPLICIT_DEDICATED_CINEMA.test(stated)) return BRIEF_INTENT.DEDICATED_CINEMA;
  if (EXPLICIT_MEDIA_ROOM.test(stated)) return BRIEF_INTENT.MEDIA_LOUNGE;

  const design = shape || readDesignShape(facts, evidence);
  if (design.dedicated_cinema) return BRIEF_INTENT.DEDICATED_CINEMA;
  if (design.media_lounge) return BRIEF_INTENT.MEDIA_LOUNGE;

  if (design.display_type === 'tv') return BRIEF_INTENT.MEDIA_LOUNGE;
  if (design.display_type) return BRIEF_INTENT.DEDICATED_CINEMA;
  return null;
}

/**
 * The whole narrative context for one proposal, read from what the proposal and its
 * verified interpretation state.
 *
 * @param {Object} input
 * @param {Object|null} [input.proposal] — the proposal record (its briefs and its steer)
 * @param {Object|null} [input.interpretation] — the verified ADI interpretation
 * @returns {Object} the context the grouping and the row classification read
 */
export function buildProposalNarrativeContext({ proposal = null, interpretation = null } = {}) {
  const view = interpretation?.view || interpretation || null;
  const briefText = [proposal?.client_brief, proposal?.narrative_brief].filter(Boolean).join('\n');
  const steer = proposal?.metadata?.narrative_steer || null;
  const { excludedTopics, preferredTopics } = steerTopicSelection(steer);
  // The subjects the brief is read against: the areas the designer's own words name,
  // and the areas of the topics they asked to weigh more heavily.
  const subjects = [...new Set([
    ...areasForBriefText(briefText),
    ...areasForBriefText([view?.intended_use, view?.room_type].filter(Boolean).join(' ')),
  ])];
  return {
    brief_text: briefText,
    declared_intent: view?.intended_use ?? view?.primary_design_intent ?? null,
    room_type: view?.room_type ?? null,
    preferred_topics: preferredTopics,
    excluded_topics: excludedTopics,
    subjects,
    // The areas a seating topic silences: the seating decision, its rationale, the
    // clearance explanation and every seat-scope claim are suppressed together.
    suppressed_areas: suppressedAreasFromTopics(excludedTopics),
    source: 'proposal_record_and_verified_interpretation',
  };
}

export default buildProposalNarrativeContext;