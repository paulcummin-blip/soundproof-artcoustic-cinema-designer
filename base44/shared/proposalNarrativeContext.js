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

/** The intent-words that make a design a dedicated cinema rather than a media room. */
const DEDICATED_INTENT_PATTERN = /dedicated|reference|screening room|cinema room/i;

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

/**
 * The project's declared intent, as the classification reads it. The designer's own
 * stated intent governs where there is one; otherwise it is read from the display
 * the evidence states, because a television lounge and a dedicated cinema with a
 * projection screen are the two cases the brief relevance is built around.
 *
 * @param {Object} input
 * @param {string|null} [input.declaredIntent] — the interpretation's intended use
 * @param {string|null} [input.roomType] — the interpretation's room type
 * @param {Object|null} [input.facts] — the option's frozen facts
 * @returns {string|null} one of the brief intents, or null where nothing is stated
 */
export function resolveBriefIntent({ declaredIntent = null, roomType = null, facts = null } = {}) {
  // The display the evidence states comes first, because it is the FACT: a design
  // presenting on a television is a media room whatever the words around it say, and
  // a room described as a cinema but built around a TV is exactly the case this
  // distinction exists for.
  const displayType = String(facts?.screen?.display_type || '').toLowerCase();
  if (displayType === 'tv') return BRIEF_INTENT.MEDIA_LOUNGE;
  if (displayType) return BRIEF_INTENT.DEDICATED_CINEMA;
  const stated = [declaredIntent, roomType].filter(Boolean).join(' ').trim();
  if (DEDICATED_INTENT_PATTERN.test(stated)) return BRIEF_INTENT.DEDICATED_CINEMA;
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