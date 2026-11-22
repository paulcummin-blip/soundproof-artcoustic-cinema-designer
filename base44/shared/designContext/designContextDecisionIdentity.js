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

// ── Canonical subwoofer arrangement fingerprint ──────────────────────────────
//
// Subwoofer questions can carry different question IDs (front_rear
// distribution, single_wall arrangement, or the legacy count_rationale)
// while describing the same underlying arrangement decision.  To compare a
// saved answer against a current question across different question IDs,
// the subwoofer decision uses a CANONICAL arrangement fingerprint that
// encodes the material aspects: arrangement type, total count, and
// front/rear split.  This fingerprint is the same regardless of which
// question ID triggered it.
//
// Format: subarr:{type}:{count}:{front}:{rear}
//
// Legacy saved items carry dc1-{hash}-{length} fingerprints computed with
// a different formula and cannot be directly compared with the canonical
// format.  For those, a compatibility rule extracts the subwoofer count
// from the saved question text and compares it against the current count.
// If the count matches the arrangement is treated as unchanged; if it
// differs the design materially changed.  If the count cannot be extracted
// equivalence cannot be established and the item is NOT silently treated
// as current.
//
// The fingerprint is insensitive to minor position adjustments (it
// captures count and distribution, not exact coordinates) while remaining
// sensitive to material changes (count or arrangement type).  Subwoofer
// quantity alone does not determine performance — two well-positioned
// subs may outperform four poorly placed ones — but a change in count
// alongside a change in arrangement type is a strong signal that the
// design materially changed and the saved explanation should be
// reconsidered.

/**
 * Build a canonical subwoofer arrangement fingerprint.
 *
 * @param {Object} sig — { type, count, front, rear }
 * @returns {string} the canonical fingerprint
 */
export function canonicalSubwooferFingerprint({ type, count, front, rear }) {
  return `subarr:${type}:${count}:${front}:${rear}`;
}

/**
 * Parse a canonical subwoofer fingerprint into its components.
 * Returns null if the fingerprint is not in the canonical subarr: format.
 *
 * @param {string} fingerprint
 * @returns {{type: string, count: number, front: number, rear: number}|null}
 */
export function parseSubwooferSignature(fingerprint) {
  if (typeof fingerprint !== 'string') return null;
  const match = fingerprint.match(/^subarr:(\w+):(\d+):(\d+):(\d+)$/);
  if (!match) return null;
  return {
    type: match[1],
    count: parseInt(match[2], 10),
    front: parseInt(match[3], 10),
    rear: parseInt(match[4], 10),
  };
}

/**
 * Extract the subwoofer count from a saved question's text.
 * Looks for a pattern like "4 subwoofers" or "2 subwoofers".
 * Returns null if the count cannot be determined.
 *
 * @param {string} questionText
 * @returns {number|null}
 */
export function extractSubwooferCountFromQuestionText(questionText) {
  if (typeof questionText !== 'string') return null;
  const match = questionText.match(/\b(\d+)\s+subwoofer/i);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Compare a saved subwoofer arrangement item against a current subwoofer
 * question, across different question IDs.
 *
 * Used by partitionByDecisionCurrency when the saved item's question ID
 * differs from the current question's ID but both map to the same
 * subwoofers_arrangement decision.
 *
 * Returns 'current' (arrangement materially unchanged, suppress),
 * 'stale' (arrangement materially changed, re-ask), or 'unknown'
 * (equivalence cannot be established — caller treats as stale per the
 * requirement: do not silently treat as current).
 *
 * @param {Object} savedItem — the saved context item
 * @param {string|null} currentFingerprint — the current question's fingerprint
 * @returns {'current'|'stale'|'unknown'}
 */
export function compareSubwooferArrangementAcrossIds(savedItem, currentFingerprint) {
  const currentSig = parseSubwooferSignature(currentFingerprint);
  if (!currentSig) return 'unknown';

  // Try to parse the saved fingerprint as a canonical signature.
  const savedSig = parseSubwooferSignature(savedItem?.decision_fingerprint);
  if (savedSig) {
    // Both canonical: full comparison of type, count, and front/rear split.
    if (savedSig.type === currentSig.type
      && savedSig.count === currentSig.count
      && savedSig.front === currentSig.front
      && savedSig.rear === currentSig.rear) {
      return 'current';
    }
    return 'stale';
  }

  // Saved fingerprint is legacy (dc1- format). Use the compatibility rule:
  // extract the count from the saved question text and compare against the
  // current count from the canonical fingerprint.
  const savedCount = extractSubwooferCountFromQuestionText(savedItem?.question);
  if (savedCount === null) return 'unknown';

  if (savedCount === currentSig.count) return 'current';
  return 'stale';
}

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
  canonicalSubwooferFingerprint,
  parseSubwooferSignature,
  extractSubwooferCountFromQuestionText,
  compareSubwooferArrangementAcrossIds,
};