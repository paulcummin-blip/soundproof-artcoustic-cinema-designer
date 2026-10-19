/**
 * adiDesignKnowledgeGating.js (shared)
 * ------------------------------------
 * WHEN LEARNED KNOWLEDGE MAY ANSWER INSTEAD OF THE DESIGNER BEING ASKED.
 *
 * WHY IT EXISTS. ADI asks a designer why a decision was made. Once the same reason
 * has been given from three separate projects under the same design condition, the
 * question has been answered for this kind of design and asking it again wastes the
 * designer's time. This module decides, for one question and one design, whether to
 * use what has been learned, to confirm it lightly, or to ask.
 *
 * THE AUTHORITY ORDER IS FIXED AND IS THE POINT OF THIS MODULE:
 *
 *   1. CURRENT PROJECT EVIDENCE — a reason already on record for this design, in the
 *      verified interpretation or the designer's own brief. It governs, always.
 *   2. CURRENT PROJECT CLARIFICATIONS — the designer's own answer for this project,
 *      which OVERRIDES learned knowledge completely. "Six overheads were selected
 *      here because of the room's length" is this project's reason and is never
 *      replaced by a familiar rationale from elsewhere.
 *   3. LEARNED ADI DESIGN KNOWLEDGE — used only where nothing above speaks, and only
 *      where the design condition matches. High confidence answers silently;
 *      moderate confidence is offered as a lightweight confirmation.
 *   4. ASK THE DESIGNER.
 *
 * WHAT IT NEVER DOES. It never overrides evidence, an RP22/RP23 result, an explicit
 * answer, the client brief or the room's actual geometry; it never invents a reason;
 * it never weakens the design condition (a rationale learned for a two-row .6 layout
 * is not applied to a four-row .4 layout); and it exposes nothing about how the
 * knowledge was gathered — no mention of learning, confidence, previous projects or
 * records ever reaches a designer or a client document.
 *
 * Pure: no React, no SDK, no writes.
 */

import {
  CONFIDENCE_BAND,
  KNOWLEDGE_STATUS,
  KNOWLEDGE_USE,
  buildDesignCondition,
  confidenceBand,
  countWord,
  topicForQuestion,
} from './adiDesignKnowledgeModel.js';

function asText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * THIS DESIGN'S OWN CONDITION. The caller may hand over a condition already read from
 * the frozen design, or ADI's own question, which is built from that design and names
 * its own counts. Either way the condition is read once, here, and compared field by
 * field: a condition the design does not state is never filled in from a guess.
 */
const CONDITION_FIELDS = Object.freeze([
  'rows', 'overheads', 'overhead_layout', 'overhead_positions',
  'subwoofers', 'treatment_panels', 'treatment_product',
]);

export function normaliseCondition(condition = {}) {
  if (!condition || typeof condition !== 'object') return {};
  if (CONDITION_FIELDS.some((field) => condition[field] !== undefined)) return condition;
  return buildDesignCondition({ question: condition });
}

/** The subject a confirmation names: 'the six-overhead layout', 'the four-subwoofer arrangement'. */
function confirmationSubject(topic, condition = {}) {
  switch (topic) {
    case 'overhead_count_rationale':
      return condition.overheads ? `the ${countWord(condition.overheads)}-overhead layout` : 'this overhead layout';
    case 'subwoofer_arrangement_rationale':
      return condition.subwoofers ? `the ${countWord(condition.subwoofers)}-subwoofer arrangement` : 'this subwoofer arrangement';
    case 'seating_priority_rationale':
      return 'the seating priority';
    case 'acoustic_treatment_rationale':
      return 'the acoustic treatment';
    default:
      return 'this decision';
  }
}

/** The meaning half of a canonical rationale, without its context clause. */
export function rationaleTail(rationale) {
  const text = asText(rationale);
  if (!text) return null;
  const markers = [
    ' a common rationale is to ',
    ' a designer\'s stated rationale is that ',
  ];
  for (const marker of markers) {
    const index = text.indexOf(marker);
    if (index >= 0) return text.slice(index + marker.length).trim();
  }
  return text;
}

/**
 * The lightweight confirmation shown instead of a full clarification form:
 * `ADI understands the six-overhead layout is intended to keep the front and rear
 * overheads ahead of and behind the audience, let the middle pair fill the gap
 * between them and keep the height layer continuous across the seats.`
 */
export function confirmationFor({ topic = null, condition = {}, rationale = null } = {}) {
  const intent = designIntentFor({ topic, condition, rationale });
  return intent ? `ADI understands ${intent}` : null;
}

/**
 * THE SAME UNDERSTANDING, STATED AS DESIGN INTENT for the document itself: what the
 * layout is for, in the design's own voice. This is what may be carried into a
 * proposal or report, and it never mentions how it was understood — no learning, no
 * confidence, no previous projects, no records.
 */
export function designIntentFor({ topic = null, condition = {}, rationale = null } = {}) {
  const tail = rationaleTail(rationale);
  if (!tail) return null;
  const subject = confirmationSubject(topic, condition);
  const body = tail.replace(/[.]$/, '');
  return `${subject} is intended to ${body}.`;
}

/**
 * THE DESIGN CONDITION TEST. A record is only ever read for a design whose own
 * condition it states: every condition field the record names must be known in this
 * design and be the same value. A rationale learned for a two-row .6 layout is never
 * applied where the rows are unknown or different.
 */
export function conditionCovers(recordCondition = {}, designCondition = {}) {
  const fields = Object.keys(recordCondition || {});
  if (fields.length === 0) return false;
  return fields.every((field) => {
    const stated = designCondition?.[field];
    if (stated === undefined || stated === null) return false;
    return String(stated) === String(recordCondition[field]);
  });
}

/** The records that could speak about this design's own condition, in confidence order. */
export function matchingKnowledge({ items = [], topic = null, condition = {} } = {}) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => item
      && String(item.topic || '') === String(topic || '')
      && item.status !== KNOWLEDGE_STATUS.DISABLED
      && item.contested !== true
      && conditionCovers(item.condition || {}, condition))
    .map((item) => ({
      item,
      confidence: Number(item.confidence) || 0,
      band: item.confidence_band || confidenceBand(item.confidence),
    }))
    .sort((a, b) => b.confidence - a.confidence);
}

/**
 * WHAT ADI SHOULD DO ABOUT ONE MATTER.
 *
 * @param {Object} input
 * @param {Array<Object>} [input.items] — the learned knowledge records
 * @param {string} [input.questionId]
 * @param {string} [input.area]
 * @param {Object} [input.condition] — this design's own condition
 * @param {string} [input.projectEvidence] — a reason already on record for THIS design
 * @param {string} [input.projectAnswer] — the designer's own answer for THIS project
 * @returns {{use: string, rationale: string|null, confirmation: string|null, item: Object|null, reason: string}}
 */
export function resolveKnowledgeUse({
  items = [],
  questionId = null,
  area = null,
  condition = {},
  projectEvidence = null,
  projectAnswer = null,
} = {}) {
  const topic = topicForQuestion(questionId, area);
  const designCondition = normaliseCondition(condition);

  // 1. Current project evidence — a reason this design already holds.
  const evidence = asText(projectEvidence);
  if (evidence) {
    return { use: KNOWLEDGE_USE.PROJECT_ANSWER, rationale: evidence, confirmation: null, item: null, reason: 'project_evidence' };
  }

  // 2. Current project clarifications — the designer's own answer for this project.
  const answer = asText(projectAnswer);
  if (answer) {
    return { use: KNOWLEDGE_USE.PROJECT_ANSWER, rationale: answer, confirmation: null, item: null, reason: 'project_answer' };
  }

  // 3. Learned ADI design knowledge, read only inside this design's own condition.
  const matches = matchingKnowledge({ items, topic, condition: designCondition });
  const best = matches[0] || null;
  if (best) {
    const rationale = asText(best.item.canonical_meaning);
    if (best.band === CONFIDENCE_BAND.HIGH) {
      return { use: KNOWLEDGE_USE.LEARNED, rationale, confirmation: null, item: best.item, reason: 'learned_high_confidence' };
    }
    if (best.band === CONFIDENCE_BAND.MODERATE) {
      return {
        use: KNOWLEDGE_USE.CONFIRM,
        rationale,
        confirmation: confirmationFor({ topic, condition: designCondition, rationale }),
        item: best.item,
        reason: 'learned_moderate_confidence',
      };
    }
    return { use: KNOWLEDGE_USE.ASK, rationale, confirmation: null, item: best.item, reason: 'learned_low_confidence' };
  }

  // 4. Ask the designer.
  return { use: KNOWLEDGE_USE.ASK, rationale: null, confirmation: null, item: null, reason: 'nothing_learned' };
}

/**
 * THE QUESTIONS ADI ACTUALLY PUTS TO THE DESIGNER, after learned knowledge has been
 * read. A question whose reason has been learned under this design's own condition
 * is not asked again: it is removed and its rationale returned as supporting design
 * knowledge. A moderately-confident matter is removed from the form and offered as a
 * lightweight confirmation instead, so the designer is never put through the full
 * clarification form for something ADI already half knows.
 *
 * @returns {{questions: Array<Object>, learned: Array<Object>, confirmations: Array<Object>}}
 */
export function applyKnowledgeToQuestions({
  questions = [],
  items = [],
  projectAnswers = {},
  projectEvidence = {},
} = {}) {
  const kept = [];
  const learned = [];
  const confirmations = [];

  for (const question of Array.isArray(questions) ? questions : []) {
    const questionId = question?.question_id || null;
    const condition = buildDesignCondition({ question });
    const resolution = resolveKnowledgeUse({
      items,
      questionId,
      area: question?.area,
      condition,
      projectEvidence: projectEvidence?.[questionId] || null,
      projectAnswer: projectAnswers?.[questionId] || null,
    });

    if (resolution.use === KNOWLEDGE_USE.LEARNED) {
      learned.push({
        question_id: questionId,
        topic: topicForQuestion(questionId, question?.area),
        condition,
        rationale: resolution.rationale,
        question,
      });
      continue;
    }
    if (resolution.use === KNOWLEDGE_USE.CONFIRM) {
      confirmations.push({
        question_id: questionId,
        topic: topicForQuestion(questionId, question?.area),
        condition,
        rationale: resolution.rationale,
        confirmation: resolution.confirmation,
        question,
      });
      continue;
    }
    kept.push(question);
  }

  return { questions: kept, learned, confirmations };
}

export default {
  rationaleTail,
  confirmationFor,
  designIntentFor,
  conditionCovers,
  matchingKnowledge,
  resolveKnowledgeUse,
  applyKnowledgeToQuestions,
};