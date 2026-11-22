/**
 * designContextDecisionIdentity.js (shared)
 * -------------------------------------------
 * THE DETERMINISTIC MAPPING between question IDs and the underlying design
 * decisions they describe.
 *
 * Different question IDs can describe the same design decision. For example,
 * `subwoofer_count_rationale`, `subwoofer_front_rear_distribution`,
 * `subwoofer_single_wall_arrangement` and `subwoofer_arrangement_reason` all
 * ask about the same subwoofer arrangement decision.
 *
 * This module lets the Design Context review, the Design Intent generation and
 * the Proposal Design Context clarification all share ONE decision identity,
 * so a saved answer for one question ID suppresses equivalent questions about
 * the same decision, and a single review never presents multiple questions
 * about the same decision.
 *
 * A question ID not listed here maps to itself (its own decision), so
 * AI-discovered questions and future deterministic questions remain
 * self-contained — they are never silently grouped with an unrelated decision.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

/** The underlying design decisions ADI distinguishes. */
export const DESIGN_DECISION = Object.freeze({
  SEATING_POSITION: 'seating_position',
  SUBWOOFER_ARRANGEMENT: 'subwoofers_arrangement',
  ACOUSTIC_TREATMENT: 'acoustic_treatment',
  SINGLE_ROW_LAYOUT: 'single_row_layout',
  FLOATING_SCREEN_WALL: 'floating_screen_wall',
  OVERHEADS_COUNT: 'overheads_count',
});

/**
 * Deterministic mapping from question IDs to their underlying design decision.
 *
 * This is the SINGLE shared mapping. Every surface that checks whether a
 * design decision has already been answered — the Design Context review, the
 * Design Intent writer, and the Proposal Design Context clarification — reads
 * from here so the three can never disagree about which questions are
 * equivalent.
 */
const QUESTION_ID_TO_DECISION = {
  // Seating position: any question about why seating is where it is.
  seating_forward_of_rear_wall: DESIGN_DECISION.SEATING_POSITION,
  seating_priority_reason: DESIGN_DECISION.SEATING_POSITION,
  // Subwoofer arrangement: any question about the subwoofer count or
  // placement. Multiple subwoofers for room-mode management, peak/null
  // reduction and seat-to-seat consistency are standard engineering practice;
  // the question is only about the SPECIFIC arrangement, not about why
  // multiple subwoofers are used.
  subwoofer_count_rationale: DESIGN_DECISION.SUBWOOFER_ARRANGEMENT,
  subwoofer_front_rear_distribution: DESIGN_DECISION.SUBWOOFER_ARRANGEMENT,
  subwoofer_single_wall_arrangement: DESIGN_DECISION.SUBWOOFER_ARRANGEMENT,
  subwoofer_arrangement_reason: DESIGN_DECISION.SUBWOOFER_ARRANGEMENT,
  // Acoustic treatment.
  acoustic_treatment_rationale: DESIGN_DECISION.ACOUSTIC_TREATMENT,
  acoustic_treatment_reason: DESIGN_DECISION.ACOUSTIC_TREATMENT,
  // Single row in a large room.
  single_row_in_large_room: DESIGN_DECISION.SINGLE_ROW_LAYOUT,
  // Floating screen wall.
  floating_screen_wall: DESIGN_DECISION.FLOATING_SCREEN_WALL,
  // Overheads count.
  overhead_speaker_reason: DESIGN_DECISION.OVERHEADS_COUNT,
};

/**
 * The decision key for a question ID. Unlisted IDs map to themselves, so an
 * AI-discovered or future question is its own decision and is never silently
 * grouped with an unrelated one.
 *
 * @param {string} questionId
 * @returns {string|null}
 */
export function decisionKeyForQuestionId(questionId) {
  const id = typeof questionId === 'string' ? questionId.trim() : '';
  if (!id) return null;
  return QUESTION_ID_TO_DECISION[id] || id;
}

/**
 * The decision key for a discovered or saved question object.
 *
 * @param {Object} question — a question or saved context item
 * @returns {string|null}
 */
export function decisionKeyForQuestion(question) {
  if (!question || typeof question !== 'object') return null;
  return decisionKeyForQuestionId(question.question_id);
}

export default {
  DESIGN_DECISION,
  decisionKeyForQuestionId,
  decisionKeyForQuestion,
};