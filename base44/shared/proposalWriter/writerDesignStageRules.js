/**
 * writerDesignStageRules.js (shared)
 * ----------------------------------
 * THE design-stage commentary rule: the wording a proposal never carries.
 *
 * The proposal states the FINISHED design. It sells what the design delivers, in
 * the scope the evidence states each result for, and it does not review the
 * design: no sentence tells the client what still needs attention, improvement,
 * calibration, optimisation or further design work, and none suggests a future
 * correction.
 *
 * Two things are deliberately kept apart here:
 *
 *   REFUSED     design-stage phrasing is refused outright, however true the
 *               underlying limitation may be. Reporting a limitation as a task
 *               for the future turns a sales document into a work list.
 *   DISCLOSED   where an issue genuinely undermines the proposed system, the
 *               refusal is what holds the attempt for human review. Whether a
 *               limitation is disclosed, and how, is an engineering and
 *               commercial decision, never the writer's to make in prose.
 *
 * Each rule id is a label for the audit and never the phrase itself.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

export const DESIGN_STAGE_COMMENTARY_RULES = Object.freeze([
  {
    rule: 'needs_or_requires_work',
    pattern: /\b(?:needs?|requires?|required|requiring|in\s+need\s+of)\s+(?:\w+\s+){0,2}?(?:attention|improvement|calibration|optimisation|optimization|correction|adjustment|refinement|review|work)\b/i,
  },
  {
    rule: 'attention_area',
    pattern: /\b(?:area|item|point|aspect)\s+(?:for|of|that\s+needs?|requiring)\s+(?:\w+\s+){0,2}?(?:attention|improvement|calibration|optimisation|optimization|adjustment|correction|work)\b/i,
  },
  {
    rule: 'should_be_corrected',
    pattern: /\b(?:should|must|ought\s+to|could|can|would)\s+be\s+(?:\w+\s+){0,2}?(?:improved|optimised|optimized|corrected|adjusted|calibrated|refined|addressed|revisited|reviewed)\b/i,
  },
  {
    rule: 'further_work_required',
    pattern: /\b(?:further|additional|more|continued|ongoing)\s+(?:\w+\s+){0,3}?(?:optimisation|optimization|calibration|correction|adjustment|refinement|design\s+work|work|tuning)\s+(?:(?:is|was|would\s+be|will\s+be|remains?)\s+)?(?:required|needed|necessary|recommended|advised)\b/i,
  },
  {
    rule: 'future_correction',
    pattern: /\b(?:future|subsequent|later)\s+(?:\w+\s+){0,2}?(?:calibration|optimisation|optimization|correction|adjustment|tuning|refinement)\b|\bin\s+the\s+future\b[^.;:]{0,40}?\b(?:calibrat|optimis|optimiz|correct|tune|adjust)\w*/i,
  },
  {
    rule: 'design_shortfall',
    pattern: /\b(?:compromised|falls?\s+short|falling\s+short|less\s+than\s+ideal|not\s+ideal|weak\s+(?:point|spot)|second[- ]class|underperform\w*|disappointing)\b/i,
  },
]);

/** The rule ids behind the design-stage commentary, for an audit to assert against. */
export const DESIGN_STAGE_RULES = Object.freeze(DESIGN_STAGE_COMMENTARY_RULES.map((entry) => entry.rule));

/**
 * The design-stage commentary a sentence carries, or null. The first rule that
 * matches is the one reported, so one sentence raises one reason.
 *
 * @param {string} text
 * @returns {{ rule: string, at: number }|null}
 */
export function designStageCommentary(text) {
  const sentence = String(text || '');
  if (sentence.length === 0) return null;
  for (const entry of DESIGN_STAGE_COMMENTARY_RULES) {
    const match = entry.pattern.exec(sentence);
    if (match) return { rule: entry.rule, at: match.index };
  }
  return null;
}

export default designStageCommentary;