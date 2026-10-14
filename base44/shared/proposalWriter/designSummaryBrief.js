/**
 * designSummaryBrief.js (shared, PROPOSAL ONLY)
 * ---------------------------------------------
 * How the Design Summary is briefed when the design is a TV-based media room.
 *
 * A dedicated cinema has a design story worth developing: a projection screen, a
 * multi-row seating plan, an overhead layer and the reasoning behind them. A TV
 * media room is a different document. The client is buying a well-designed
 * listener-level system that works every day, and the point is made in two short
 * paragraphs: a well-designed 5.1 layout performs extremely well, the room stays
 * simple and easy to use, and it gives clear dialogue, surround movement and
 * bass support for sport, box sets, films and music. Several paragraphs of
 * justification make that sound smaller than it is, and it reads as an essay
 * rather than a recommendation.
 *
 * So this module holds ONE instruction and ONE word limit for that case, and
 * applies them to the Design Summary section (decision_summary, labelled Design
 * Summary in a single-option proposal) where the frozen evidence describes a TV,
 * a listener-level layout and one row of seating. Every other design keeps the
 * contract's own requirement and limit unchanged, and nothing here is decided by
 * a judgement about whether copy reads as too long: the evidence decides.
 *
 * The limit is a ceiling with headroom above the target, not the target itself:
 * copy written to 80 to 120 words passes it, and a draft that runs long is
 * refused by the validator exactly as any other over-long section is.
 *
 * Wording only. Nothing here reads, changes or reorders a figure, a level, a
 * product, a claim or a validation rule, and no calculation, evidence or report
 * authority is touched.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

/** The section this brief governs, and the limit that replaces the contract's own. */
export const DESIGN_SUMMARY_SHORT_FORM = Object.freeze({
  section: 'decision_summary',
  label: 'Design Summary',
  /** The written target the writer is given. */
  target_words: '80 to 120',
  /** The ceiling the draft is validated against: headroom above the target. */
  word_limit: 140,
});

/**
 * The instruction for this design. It states the two paragraphs, the plain
 * register, what each paragraph carries and what the copy must never say, and it
 * names the hollow phrases the writer is refused. It is written as the shape of
 * the copy rather than as a sentence to paste: the display, the layout and the
 * everyday use come from this project's own frozen evidence.
 */
const SHORT_FORM_REQUIREMENT = [
  'This is a TV-based media room with a listener-level surround layout, so make the point and stop.',
  'Write two short paragraphs, 80 to 120 words in total, three or four sentences at most, and never more than the word limit. A simple, well-designed 5.1 system performs extremely well here, and the client does not need the reasoning behind that.',
  'First paragraph: name the display exactly as the frozen evidence names it, say in one sentence how the system is arranged, and state plainly that a well-designed layout of this kind delivers excellent performance.',
  'Second paragraph: what that arrangement gives the room day to day, with the display anchoring it and the front speakers, the side surrounds and the subwoofers working together around the main seating area: clear dialogue, proper surround movement and strong bass support when the content calls for it, and relaxed everyday use for sport, box sets, films and music.',
  'Write it as a designer or salesperson explaining the recommendation in person in plain, confident language, with no repetition and no padding.',
  'Do not explain the seating arrangement, the prioritised listening positions or the theory behind the layout, and do not justify the design against anything it does not have. Never write "the basis of the viewing experience", "listener-level surround arrangement", "the relationship between the TV, the front stage and the seating" or "tonal assessment". The engineering evidence belongs in the sections that carry it, so keep this one to the recommendation itself.',
].join(' ');

/**
 * Whether the frozen evidence describes a TV-based, listener-level, single-row
 * design. Read from the pack the draft is written against, never from the live
 * project: a display that is a TV, no overhead channels, a bed layer of five
 * channels or fewer, and one row of seating or none stated.
 *
 * @param {Object} pack — the frozen proposal evidence pack
 * @param {string} mode — 'single' | 'comparison'; the Design Summary is the
 *   single-option document's own section, so a comparison keeps its contract
 * @returns {boolean}
 */
export function isTvListenerLevelDesign(pack, mode) {
  if (mode !== 'single') return false;
  const options = Array.isArray(pack?.options) ? pack.options : [];
  if (options.length !== 1) return false;
  const facts = options[0]?.facts || {};
  if (facts.screen?.display_type !== 'tv') return false;
  const layout = facts.system?.channel_layout || {};
  const overhead = Number(layout.overhead_channels) || 0;
  const bed = Number(layout.bed_channels) || 0;
  if (overhead !== 0 || bed <= 0 || bed > 5) return false;
  const rows = Number(facts.seating?.row_count) || 0;
  return rows <= 1;
}

/**
 * The sections as this brief leaves them: the Design Summary's requirement and
 * word limit replaced where the design is a TV media room, and every section
 * untouched otherwise. The returned entries are the ones the writer is given, and
 * the validator reads the limit from them, so the shorter brief is enforced
 * without a second authority.
 *
 * @param {Array<Object>} sections — writerSectionRequirements(mode) output
 * @param {{ pack?: Object, mode?: string }} [context]
 * @returns {Array<Object>}
 */
export function applyDesignSummaryBrief(sections, { pack, mode } = {}) {
  const listed = Array.isArray(sections) ? sections : [];
  if (!isTvListenerLevelDesign(pack, mode)) return listed;
  return listed.map((entry) => (entry?.section === DESIGN_SUMMARY_SHORT_FORM.section
    ? { ...entry, requirement: SHORT_FORM_REQUIREMENT, word_limit: DESIGN_SUMMARY_SHORT_FORM.word_limit }
    : entry));
}

/** The instruction itself, for the writer's contract and for audit. */
export function designSummaryShortFormRequirement() {
  return SHORT_FORM_REQUIREMENT;
}

export default applyDesignSummaryBrief;