/**
 * adiEditorialStandard.js (shared)
 * --------------------------------
 * THE ADI EDITORIAL STANDARD, with the labels and the messages the client
 * workflow shows.
 *
 * Sound Proof does two different jobs, and this module belongs to the second:
 *
 *   1. THE ENGINEERING WRITER decides what is TRUE. It writes the client-facing
 *      copy from the frozen evidence, and every figure, level, product, scope and
 *      result in that copy is the engineering authority's.
 *   2. ADI IMPROVES HOW THAT TRUTH IS EXPRESSED. It reads a generated draft
 *      whose engineering facts are grounded. Its qualitative wording remains
 *      editing input: unsupported inference, repetition and rhetoric may be cut.
 *
 * The standard below is the second job's whole contract: what an editorial pass
 * improves, what it may never do, and the one question it asks of every sentence.
 * It is a wording standard and never an evidence authority — nothing here may add
 * a fact, a figure, a level, a product, a scope or a reason.
 *
 * ADI is Sound Proof's own intelligence identity. The client workflow says "ADI"
 * and it never says "AI": a client-facing document never reads as AI-written.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

import { ADI_NARRATIVE_EMPHASIS } from '../clientNarrativePriority.js';

/** The whole-section action, exactly as it is shown. */
export const ADI_IMPROVE_LABEL = 'Improve wording with ADI';

/** The selection action, for a sentence or a paragraph the designer highlights. */
export const ADI_IMPROVE_SELECTION_LABEL = 'Improve with ADI';

/** The undo action, offered wherever ADI has changed a section's wording. */
export const ADI_UNDO_LABEL = 'Undo';

/** What the workflow says while the editorial pass is running. */
export const ADI_WORKING_MESSAGE = 'ADI is improving the wording…';

/** What the workflow says when the wording was improved and is on screen. */
export const ADI_IMPROVED_MESSAGE = 'ADI has improved the wording. Read it again before approving it.';

/** What the workflow says when ADI found nothing worth changing. */
export const ADI_UNCHANGED_MESSAGE = 'ADI read the wording and left it as it is — there was nothing to improve.';

/**
 * THE ONE MESSAGE A REFUSAL SHOWS. A rewrite that changed the supported meaning
 * is never applied, and the designer reads this sentence and nothing else: the
 * validator's own codes, rule ids, claim ids and spans stay internal.
 */
export const ADI_KEPT_ORIGINAL_MESSAGE =
  'ADI kept the original wording because the revised version changed the supported meaning.';

/** What the workflow says when there is nothing to improve at all. */
export const ADI_NOTHING_TO_IMPROVE_MESSAGE =
  'ADI can improve the wording of copy that has already been written. There is nothing here to improve yet.';

/** What the workflow says when the writer is not switched on for this login. */
export const ADI_UNAVAILABLE_MESSAGE = 'ADI is not available for this login.';

/** What the workflow says when ADI could not be reached at all. */
export const ADI_PROVIDER_UNAVAILABLE_MESSAGE =
  'ADI could not be reached, so the wording is unchanged.';

/**
 * THE AUTHORITY BOUNDARY, verbatim, for the prompt and for the audit trail. It is
 * the list of things an editorial pass may never do, and it is the same list the
 * conservation check enforces mechanically.
 */
export const ADI_AUTHORITY_BOUNDARY = Object.freeze([
  'add a new engineering fact',
  'add a new number, or alter any number',
  'alter an RP22 or RP23 level',
  'alter scope',
  'alter seat priority',
  'alter the system format',
  'invent a design decision',
  'invent a client priority',
  'invent a reason',
  'infer a new benefit from an image',
  'strengthen a performance claim',
  'remove a material limitation',
  'change equipment, or a quantity',
  'change the screen or display facts',
  'change the seating facts',
  'change the meaning of a P19 or P20 result',
  'turn an assumption into a fact',
]);

/**
 * THE STANDARD. One question, then the two lists that answer it. This text is
 * given to the editorial pass as its writing brief: it states a way of writing,
 * never a source of information.
 */
export const ADI_EDITORIAL_STANDARD = [
  'Ask of every sentence: would an experienced home cinema designer actually say this to a client?',
  '',
  'Improve, in this order of importance:',
  '  - clarity, and the flow of the paragraph',
  '  - sentence rhythm: shorter sentences, active voice, no piled-up clauses',
  '  - concision: say it once, in the fewest words that carry the meaning',
  '  - natural language, as a designer speaks to a homeowner or an architect',
  '  - professional confidence: state what the design does without hedging',
  '  - repetition: a point made twice is made once',
  '  - vague wording, generic wording and wording that reads as machine-written',
  '  - awkward transitions, and explanations the client does not need',
  '',
  'Prefer:',
  '  - clear, direct language and practical meaning',
  '  - project-specific wording over general wording',
  '  - the evidence and the actual relationship, over adjectives',
  '  - natural British English',
  '  - "you" and "your" only where the document already speaks that way',
  '',
  'Never write:',
  '  - generic marketing language, or filler',
  '  - metaphors, unless the copy already carries one',
  '  - defensive caveats, or implementation explanation',
  '  - "not just X, but Y"',
  '  - repeated superlatives, or vague claims',
  '',
  'FINAL CUT — perform this deletion pass before returning the copy:',
  '  - remove lifestyle or audience labels such as shared, family, social or entertaining unless the copy contains a specific recorded client priority for them',
  '  - remove repeated intent labels such as reference-style; state the project relationship once instead',
  '  - remove contrastive tails such as "rather than loud playback alone" when the preceding sentence already makes the point',
  '  - replace mechanisms such as "manage room resonances" with the simpler client outcome already supported by the copy',
  '  - delete a closing sentence that merely restates tonal consistency, placement, capability or cinema intent',
  '  - do not replace anything removed with a new adjective, benefit, rationale or conclusion',
  'The returned version must be noticeably clearer and tighter, not merely different.',
  '',
  'Phrases to remove wherever they appear: make the most of it, works well together,',
  'remarkably stable, exceptionally precise, great speaker spacing, powerful capability,',
  'considerable reserve, highly immersive, seamless movement, serious cinema-level.',
  'State the relationship or the result instead.',
  '',
  // THE CLIENT NARRATIVE PRIORITY, in its editorial form: it orders the meaning
  // the copy already carries, and it may never add one.
  ADI_NARRATIVE_EMPHASIS,
].join('\n');

/**
 * Known weak phrases that the final editorial pass must remove. These are not
 * engineering claims and are never evidence authority: they are the exact filler,
 * unsupported inference and repetitive intent wording already identified by the
 * client-copy audit. Keeping this list narrow makes the check deterministic without
 * turning a style preference into a second writer.
 */
export const ADI_WEAK_EDITORIAL_PHRASES = Object.freeze([
  'shared film-watching space',
  'reference-style dedicated cinema',
  'rather than loud playback alone',
  'manage the room’s bass resonances',
  "manage the room's bass resonances",
  'reference-style cinema intent',
  'allows music and effects to build in scale',
]);

/**
 * Final editorial smell test. A safe rewrite can still be weak copy; when one of
 * the audited phrases survives, return an exact violation so the existing single
 * correction attempt can remove it. This check changes no engineering meaning and
 * never edits copy itself.
 */
export function checkAdiEditorialQuality(value) {
  const copy = String(value || '');
  const lower = copy.toLocaleLowerCase('en-GB');
  const violations = ADI_WEAK_EDITORIAL_PHRASES.reduce((found, phrase) => {
    const index = lower.indexOf(phrase.toLocaleLowerCase('en-GB'));
    if (index < 0) return found;
    const matched = copy.slice(index, index + phrase.length);
    found.push({
      code: 'weak_editorial_phrase',
      category: 'editorial quality',
      matched_substring: matched,
      detail: `Remove or rewrite the weak phrase “${matched}” without changing the supported engineering meaning.`,
    });
    return found;
  }, []);
  return { ok: violations.length === 0, violations };
}

/** Whether a piece of copy is HTML rather than plain prose. */
export function looksLikeHtml(value) {
  return /<\/?[a-z][\s\S]*>/i.test(String(value || ''));
}

export default ADI_EDITORIAL_STANDARD;