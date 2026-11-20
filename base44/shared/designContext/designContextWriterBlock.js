/**
 * designContextWriterBlock.js (shared)
 * -------------------------------------
 * THE WRITER-FACING BLOCK built from saved designer context.
 *
 * The saved DesignContext items are the designer's own explanations of design
 * decisions the engineering evidence does not establish. This module converts
 * them into the format the existing writer input and interpretation expect:
 *
 *   - ANSWERED items become `recordedIntent` strings for buildProjectInterpretation,
 *     so the interpretation's `important_design_decisions` carries the designer's
 *     confirmed reasons.
 *   - The full set (answered + no_reason) is also returned as a structured block
 *     for callers that want to carry it explicitly in the writer input.
 *
 * THE PRINCIPLE: confirmed human answers take priority over inferred motivations.
 * A no_reason confirmation is never turned into a reason; it signals that the
 * writer should describe the arrangement without inventing a motivation, which
 * the existing writer brief already does.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

import { CONTEXT_STATUS, recordedIntentFromContext } from './designContextModel.js';

/**
 * The structured writer block: each item with its status, so the writer knows
 * which decisions have a confirmed reason and which have been confirmed as
 * having no particular reason.
 *
 * @param {Array<Object>} items — saved context items
 * @returns {{supplied: boolean, items: Array, recorded_intent: Array<string>}}
 */
export function buildDesignContextBlock(items = []) {
  const list = Array.isArray(items) ? items : [];
  const answered = list.filter((item) => item?.status === CONTEXT_STATUS.ANSWERED && item?.answer);
  const noReason = list.filter((item) => item?.status === CONTEXT_STATUS.NO_REASON);

  return {
    supplied: answered.length > 0 || noReason.length > 0,
    items: list.map((item) => ({
      question_id: item.question_id || null,
      question: item.question || null,
      area: item.area || null,
      status: item.status || null,
      answer: item.answer || null,
    })),
    recorded_intent: recordedIntentFromContext(list),
    rule:
      'these are the designer\'s own confirmed explanations of design decisions the engineering evidence does not '
      + 'establish. An answered item is the designer\'s REASON, never copy: understand the engineering principle it '
      + 'explains and state it professionally in your own words. A no_reason item means the designer confirmed there is '
      + 'no particular reason: describe the arrangement and its result without inventing a motivation. Never invent '
      + 'a reason the designer did not record. The frozen evidence governs wherever the two differ.',
  };
}

export default buildDesignContextBlock;