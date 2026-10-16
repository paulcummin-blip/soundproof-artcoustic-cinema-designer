/**
 * designIntentBrief.js (shared, PROJECT REPORT ONLY)
 * --------------------------------------------------
 * THE Project Report's Design Intent, as the Astra writer is briefed to write it.
 *
 * The Design Intent is the paragraph block that opens the report above the facts
 * sheet: the design intent, why it suits this particular room, and what the
 * picture, the seating and the loudspeaker arrangement give the client. It is the
 * report's own `decision_summary` section — the contract already carries that
 * section, its requirement and its word limit — so this module does not declare a
 * second section or a second contract. It states the Design Intent's own brief
 * INTO that section, exactly as the Design Summary is briefed for a TV media room,
 * and it changes nothing else.
 *
 * The voice, the natural-writing standard and the shared Sound Proof writing
 * authority are not restated here: they travel with the writer's contract, which
 * the prompt carries. This file holds only what is specific to the Design Intent:
 * what it leads with, what it must explain, what it must never recite, and the
 * length it may run to on the report's first page.
 *
 * The length is a real constraint rather than a style note: the block occupies a
 * fixed place in the report's page budget, so the ceiling is set to the width of
 * the page's own copy column and a draft that runs longer is refused by the
 * validator exactly as any other over-long section is.
 *
 * Wording only. Nothing here reads, changes or reorders a figure, a level, a
 * product, a claim or a validation rule, and no engineering, report-composition
 * or pagination authority is touched.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

/** The one section the Design Intent is written as. */
export const DESIGN_INTENT_SECTION = 'decision_summary';

/** The written target the writer is given. */
export const DESIGN_INTENT_TARGET_WORDS = '140 to 180';

/** The ceiling the draft is validated against: headroom above the target. */
export const DESIGN_INTENT_WORD_LIMIT = 200;

/**
 * The Design Intent's own instruction. It states what the block leads with, the
 * order it develops in, what it must explain and what it must never carry, and it
 * is written as the shape of the copy rather than as a sentence to paste: the
 * room, the display, the seating and the system all come from this project's own
 * frozen evidence.
 */
export const DESIGN_INTENT_REQUIREMENT = [
  'This block is the report\'s Design Intent: it opens the Project Report above its facts sheet, and it is written for the client as the design team\'s own account of the design.',
  'Open on the design intent itself: name the cinema being proposed and explain why this design is the right approach for this particular room, in the design team\'s own voice. Never announce a recommendation and never open on a formulaic phrase such as "Our recommendation is" or "We recommend": the design is explained and reasoned rather than offered as an opinion, and the opening states what this cinema is and why it suits this room.',
  'Then explain why it suits this room, and what the picture, the seating and the loudspeaker arrangement give the client: what they will see, where they will sit, how the sound is carried around and across the room, and what that arrangement is intended to deliver for them.',
  'Translate the established engineering principles this design rests on into client benefits, confidently and in plain language. A principle may be explained confidently without a high Performance Level behind it. An intention is never written as an achieved result, and a measured or calculated result is never written as an intention.',
  'Where recorded designer intent is supplied, understand the engineering principle it explains and state it professionally in your own words. It is semantic input, never finished prose: never paraphrase the designer, and never reproduce a note, a brief, an instruction or a filename.',
  'Explain the complete cinema experience — the picture, the sound and the seating as one design — rather than any single element of it.',
  'Be positive, fluent and confident, in natural British English.',
  'Do not recite specifications or RP22 parameters: no channel count, no figure, no Performance Level, no parameter name and no product-by-product account. The report states those itself, in its facts sheet directly above this block and in its evidence pages after it.',
  'Acoustic treatment is supporting evidence, never a selling point: never name a treatment product and never state a treatment quantity. Where the client\'s own brief or notes raise acoustics, state the listening benefit the room gains and stop there.',
  'Never invent a physical loudspeaker position, a designer decision or an achieved performance the frozen evidence does not record.',
  `Length: ${DESIGN_INTENT_TARGET_WORDS} words in two or three developed paragraphs, and never more than the word limit. This block sits inside the report's fixed first-page budget, so it must not run longer than that: say what the design is and what it gives the client, and stop.`,
].join(' ');

/** The scope rule the writer reads beside the section it is being given. */
export const DESIGN_INTENT_SCOPE_RULE =
  'This is a section-scoped writing job, not a proposal: you are given ONE section, the Design Intent of the Project Report, and it is the only section you return. Return that section alone, under its own ID, with its own claim citations, and write nothing anywhere else.';

/**
 * The Design Intent's own entry for a given section set: the same section ID,
 * title and grounding rule the contract states, with this block's requirement and
 * ceiling in place of the contract's. Every other entry is returned untouched, so
 * nothing outside the Design Intent is briefed differently.
 *
 * @param {Array<Object>} sections — writer section requirements
 * @returns {Array<Object>}
 */
export function applyDesignIntentBrief(sections) {
  const listed = Array.isArray(sections) ? sections : [];
  return listed.map((entry) => (entry?.section === DESIGN_INTENT_SECTION
    ? { ...entry, requirement: DESIGN_INTENT_REQUIREMENT, word_limit: DESIGN_INTENT_WORD_LIMIT }
    : entry));
}

/** The one section entry a scoped Design Intent input carries. */
export function designIntentSection(sectionRequirements) {
  const listed = Array.isArray(sectionRequirements) ? sectionRequirements : [];
  const entry = listed.find((row) => row?.section === DESIGN_INTENT_SECTION) || null;
  if (!entry) {
    throw new Error('The writer contract carries no Design Intent section, so the report intent cannot be written.');
  }
  return { ...entry, requirement: DESIGN_INTENT_REQUIREMENT, word_limit: DESIGN_INTENT_WORD_LIMIT };
}

export default applyDesignIntentBrief;