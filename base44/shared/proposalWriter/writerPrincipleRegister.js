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
 *      result verb (delivers, achieves, provides, ensures, guarantees) anywhere in
 *      the sentence, no improvement in performance unless the sentence also states
 *      the intention behind the approach, and no state assertion of the bass being
 *      even, uniform or identical.
 *
 * A guarantee therefore never passes: "the four-subwoofer arrangement helps deliver
 * consistent bass across the seating" attributes a delivered outcome to the
 * arrangement and is read as a result claim, while "spreading the subwoofers around
 * the room reduces the influence of room modes" is read as the principle. Nothing
 * here changes a figure, a level, a claim or a rejection elsewhere: the register
 * only decides whether a sentence about consistency is a result claim or design
 * reasoning.
 *
 * WHICH FORM. The register also states WHICH form of reasoning a sentence is: the
 * designer's recorded INTENTION ("the arrangement is intended to improve bass
 * consistency between seating positions") or an ESTABLISHED PRINCIPLE ("distributing
 * subwoofers between the front and rear helps manage room resonances"). Both may be
 * written confidently whatever the project's own result is, including where P20 is
 * L1. Neither states an achieved result, which is the third form of knowledge and is
 * read by the result rules.
 *
 * FRAMING NEVER BUYS BACK A RESULT. "helps", "designed to", "intended to" and
 * "expected to" cannot carry an achieved result past these rules: an outcome verb, an
 * improvement in this design's performance without a stated intention, a level, a
 * figure or an absolute guarantee about the room's own behaviour all keep the
 * sentence out of the register, and the evidence rules then read it in full.
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
export const OUTCOME_VERBS = /\b(?:deliver\w*|achiev\w*|provid\w*|ensur\w*|guarantee\w*|record\w*|measur\w*|prove\w*|attain\w*|yield\w*|results?\s+in|gives?|giving|gave)\b/i;

/**
 * A stated IMPROVEMENT in performance: better, stronger, more accurate, a raised
 * figure. A sentence carrying one of these is reasoning only when it also states
 * the INTENT behind the approach; without that framing it reads as an improvement
 * this design achieved, which the frozen evidence has to state.
 */
export const IMPROVEMENT_VERBS = /\b(?:improv\w*|enhanc\w*|increas\w*|boost\w*|maximis\w*|maximiz\w*|optimi[sz]\w*|elevat\w*|rais\w*|strengthen\w*|reinforc\w*|tighten\w*|better|greater|more\s+accurate)\b/i;

/**
 * The INTENT framing that makes an improvement a designer's intention rather than
 * a delivered result: "is intended to improve", "aims to", "so that", "in order to".
 */
export const INTENT_FRAMING = /\b(?:intended\s+to|intends?\s+to|intend\s+to|designed\s+to|design(?:er)?\s+intent|aims?\s+to|aimed\s+at|purpose\s+is|the\s+goal\s+is|chosen\s+to|selected\s+to|so\s+that|in\s+order\s+to|with\s+the\s+aim)\b/i;

/**
 * The three forms of ADI knowledge. Only the third states what this design
 * achieved; the first two are design reasoning and are never held to a result.
 */
export const KNOWLEDGE_FORM = Object.freeze({
  ESTABLISHED_PRINCIPLE: 'established_principle',
  DESIGNER_INTENTION: 'designer_intention',
  ACHIEVED_PERFORMANCE: 'achieved_performance',
});

/**
 * ABSOLUTE GUARANTEES ABOUT THE ROOM. A guarantee, an elimination, an assurance
 * that the room is free of modes, or that a peak, a dip or a null never occurs, is
 * never design reasoning: it asserts an outcome of this design that the frozen
 * reports do not state, and a real room's acoustics are never absolute.
 *
 * The subject has to be the room's own behaviour — a mode, a resonance, a standing
 * wave, a peak, a dip, a null, the room or the bass response — so an ordinary
 * explanation of an approach ("helps manage the resonances that produce peaks and
 * dips") carries no guarantee word and is untouched.
 *
 * It is read on the words themselves, so framing never buys it back: "is intended
 * to eliminate room modes" is refused exactly as "guarantees the elimination of
 * room modes" is.
 */
export const GUARANTEE_WORDS = /\b(?:guarantee\w*|guaranteed|ensur\w*|eliminat\w*|eradicat\w*|remov\w*|free\s+(?:of|from)|without\s+(?:any\s+)?modes?|no\s+(?:room\s+)?modes?|completely|entirely|totally|fully|always|never)\b/i;

/** The room behaviour a guarantee would be making absolute. */
export const GUARANTEE_SUBJECTS = /\b(?:mode|modes|resonance|resonances|standing\s+wave|standing\s+waves|null|nulls|peak|peaks|dip|dips|room\s+response|bass\s+response)\b/i;

/** The rule id the absolute-guarantee rule reports, for an audit to assert against. */
export const ABSOLUTE_GUARANTEE_RULE = 'absolute_room_behaviour_guarantee';

/**
 * The absolute guarantee about the room's own behaviour a sentence makes, or null.
 *
 * @param {string} text
 * @returns {{ rule: string, at: number }|null}
 */
export function absoluteGuarantee(text) {
  const sentence = String(text || '');
  if (sentence.length === 0) return null;
  const subject = GUARANTEE_SUBJECTS.exec(sentence);
  if (!subject) return null;
  const guarantee = GUARANTEE_WORDS.exec(sentence);
  if (!guarantee) return null;
  return { rule: ABSOLUTE_GUARANTEE_RULE, at: Math.min(subject.index, guarantee.index) };
}

export function principleRationale(text) {
  const sentence = String(text || '');
  if (sentence.length === 0) return null;
  if (RESULT_STATE_ASSERTION.test(sentence)) return null;
  // An outcome or improvement attributed to the approach is a statement of what
  // this design did, whatever purpose verb the sentence also carries: "helps
  // deliver", "provides", "achieves", "ensures" and "improves" without a stated
  // intention are result claims, and the evidence has to state them.
  if (OUTCOME_VERBS.test(sentence)) return null;
  if (IMPROVEMENT_VERBS.test(sentence) && !INTENT_FRAMING.test(sentence)) return null;
  // A guarantee is an absolute outcome, never an explanation of an approach.
  if (absoluteGuarantee(sentence)) return null;
  if (!PURPOSE_VERBS.test(sentence)) return null;
  if (!APPROACH_TERMS.test(sentence)) return null;
  const at = sentence.search(PURPOSE_VERBS);
  // WHICH form of reasoning this is: a sentence that states the intention behind
  // the approach is the designer's recorded INTENTION, and one that explains the
  // mechanism itself is an ESTABLISHED PRINCIPLE. Both are reasoning, and neither
  // states what this design achieved.
  const form = INTENT_FRAMING.test(sentence)
    ? KNOWLEDGE_FORM.DESIGNER_INTENTION
    : KNOWLEDGE_FORM.ESTABLISHED_PRINCIPLE;
  return { rule: PRINCIPLE_REGISTER_RULE, form, at: at >= 0 ? at : 0 };
}

/** Whether the sentence is written in the established-principle register. */
export function isPrincipleRationale(text) {
  return principleRationale(text) !== null;
}

/**
 * The form of knowledge a sentence carries: an established principle, the
 * designer's recorded intention, or a claim of achieved performance. A sentence
 * that is not design reasoning is read as the third form, and the evidence rules
 * then decide whether the frozen reports support it.
 */
export function knowledgeForm(text) {
  return principleRationale(text)?.form || KNOWLEDGE_FORM.ACHIEVED_PERFORMANCE;
}

export default principleRationale;