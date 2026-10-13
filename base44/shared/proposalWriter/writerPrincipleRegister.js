/**
 * writerPrincipleRegister.js (shared)
 * -----------------------------------
 * THE ESTABLISHED-PRINCIPLE REGISTER: how a sentence that explains WHY an approach
 * is used is told apart from a sentence that claims what THIS design has achieved.
 *
 * WHY IT EXISTS. ADI holds three forms of knowledge, and only one of them states an
 * achieved result: an ESTABLISHED PRINCIPLE (how acoustics work, and why an approach
 * is used at all), a DESIGNER INTENTION (why this design is arranged as it is), and
 * the PROJECT'S CALCULATED PERFORMANCE (what the frozen reports state). The
 * consistency rules on the bass wording protect the third form: a claim that the
 * bass IS the same at every seat, or that the room achieved a consistency the P20
 * result does not support, is refused, and rightly so.
 *
 * A sentence explaining the principle is not that claim. "Spreading the subwoofers
 * around the room reduces the influence of the room's own resonances, which helps
 * the bass hold together across the seating" states why the approach is used. It is
 * design reasoning, it carries no result, and it must be able to be written
 * confidently whatever the project's own result turns out to be.
 *
 * WHAT COUNTS, DETERMINISTICALLY. A sentence is read as the principle register only
 * when all three hold:
 *
 *   1. it names a design APPROACH or the physical mechanism (placement, spacing,
 *      distribution, arrangement, subwoofers, resonance, boundaries ...);
 *   2. it carries a PURPOSE or MECHANISM verb (helps, reduces, spreads, distributes,
 *      manages, minimises, addresses ...), so it explains what the approach is FOR;
 *   3. it asserts no outcome of this design: no Performance Level, no figure, no
 *      result verb attributed to the design, the room or the arrangement, and no
 *      state assertion of the bass being even, uniform or identical.
 *
 * A guarantee therefore never passes: "the four-subwoofer arrangement helps deliver
 * consistent bass across the seating" attributes a delivered outcome to the
 * arrangement and is read as a result claim, while "spreading the subwoofers around
 * the room reduces the influence of room modes" is read as the principle. Nothing
 * here changes a figure, a level, a claim or a rejection elsewhere: the register
 * only decides whether a sentence about consistency is a result claim or design
 * reasoning.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

/** The rule id the register reports, for an audit to assert against. */
export const PRINCIPLE_REGISTER_RULE = 'design_principle_rationale';

/**
 * The design approaches and physical mechanisms a principle sentence is anchored
 * on. A sentence that names none of these is never read as the principle register.
 */
export const APPROACH_TERMS = /\b(?:placement|position|positions|positioned|placing|arrangement|arranged|arrangement|layout|distribution|distributed|distributing|spacing|spaced|configuration|approach|strategy|treatment|architecture|offset|offsetting|pair|pairs|pairing|paired|subwoofer|subwoofers|seating|reflection|reflections|resonance|resonances|mode|modes|boundary|boundaries|clearance|ceiling|overhead|overheads|surround|channel|channels|speaker|speakers|loudspeaker|loudspeakers|cabinet|cabinets|absorption|diffusion|geometry|correction|equalisation|equalization|calibration|design|system)\b/i;

/**
 * The purpose and mechanism verbs. These explain what an approach is FOR, so a
 * sentence that carries one is reasoning about the approach rather than reporting
 * its outcome. Result verbs (delivers, achieves, provides, records, measures,
 * guarantees, ensures) are deliberately absent: they state what this design did.
 */
export const PURPOSE_VERBS = /\b(?:help|helps|helping|reduce|reduces|reducing|spread|spreads|spreading|distribut\w*|minimis\w*|minimiz\w*|mitigat\w*|manage|manages|managing|limit|limits|limiting|control|controls|controlling|balance|balances|balancing|avoid|avoids|avoiding|prevent|prevents|preventing|smooth|smooths|smoothing|excit\w*|loads?|loads|address\w*|tackl\w*|offset\w*|intended\s+to|designed\s+to|works?\s+by|contributes?\s+to|allows?|enables?)\b/i;

/**
 * A stated outcome of THIS design: a Performance Level, a figure in dB, a result
 * verb attributed to the design, the room, the arrangement or the system, or an
 * assertion that the bass is even, uniform or identical. Where any of these is
 * present the sentence is a result claim, whatever else it says.
 */
export const RESULT_STATE_ASSERTION = /\b(?:L[1-4]|Level\s+[1-4])\b|\b\d+(?:\.\d+)?\s*dB\b|\b(?:the|this|its|our)\s+(?:design|room|system|arrangement|configuration|layout|placement|setup|installation)\b[^.;:!?]{0,40}?\b(?:deliver\w*|achiev\w*|provid\w*|record\w*|measur\w*|guarantee\w*|ensure\w*|prove\w*)\b|\b(?:every|all|each)\s+(?:seat\w*|listener\w*|listening\s+positions?|rows?)\b[^.;:!?]{0,30}?\b(?:receiv\w*|hear\w*|hears?|get|gets|getting|sound\w*|enjoy\w*|experience\w*)\b|\b(?:consisten\w+|even|uniform|identical|equal|similar|the\s+same)\b[^.;:!?]{0,20}?\b(?:is|are|was|were|remains?|stays?|sounds?|hears?|has|have)\b|\b(?:is|are|was|were|remains?|stays?|sounds?|hears?|has|have)\b[^.;:!?]{0,20}?\b(?:consisten\w+|even|uniform|identical|equal|similar|the\s+same)\b/i;

/**
 * Whether a sentence is written in the established-principle register: design
 * reasoning that explains why an approach is used, and asserts no outcome of this
 * design.
 *
 * @param {string} text
 * @returns {{ rule: string, at: number }|null} the rule, or null when the sentence
 *   is not the principle register (and so is read by the result-claim rules as
 *   before)
 */
export function principleRationale(text) {
  const sentence = String(text || '');
  if (sentence.length === 0) return null;
  if (RESULT_STATE_ASSERTION.test(sentence)) return null;
  if (!PURPOSE_VERBS.test(sentence)) return null;
  if (!APPROACH_TERMS.test(sentence)) return null;
  const at = sentence.search(PURPOSE_VERBS);
  return { rule: PRINCIPLE_REGISTER_RULE, at: at >= 0 ? at : 0 };
}

/** Whether the sentence is written in the established-principle register. */
export function isPrincipleRationale(text) {
  return principleRationale(text) !== null;
}

export default principleRationale;