/**
 * adiDesignKnowledgeLearning.js (shared)
 * --------------------------------------
 * TURNING REPEATED ANSWERS INTO LEARNED DESIGN KNOWLEDGE — AND REFUSING TO.
 *
 * WHY IT EXISTS. A designer's answer explains one project. When the same reason
 * comes back from separate projects, it has earned the right to be understood
 * without asking again. That is the whole of it: no general AI memory, no free
 * text, no invention. A structured record per topic and design condition, built
 * only from answers designers actually gave.
 *
 * THE PROMOTION RULE, HELD HERE AND NOWHERE ELSE:
 *   1 matching project  → candidate: a record of what one designer explained
 *   2 matching projects → strengthened candidate: the same reason, twice
 *   3 matching projects → learned ADI rationale: understood, and no longer asked
 * Projects, not answers. One designer answering the same question on one project
 * twice teaches nothing new, so a repeated project never promotes anything.
 *
 * CONTRADICTION IS NOT PROMOTION. A later answer that means something else does
 * not overwrite the record: it marks the matter CONTESTED, the confidence falls
 * back to the bottom band and ADI asks again. Learned knowledge is never allowed
 * to out-argue a designer who has just said something different.
 *
 * WHAT IT REFUSES, ALWAYS. A passed question, a blank answer, a project result
 * ("this room achieved 22 Hz", "P19 L4"), a project-specific constraint ("the room
 * is 3.2 m wide"), a budget, a price, an address or any personal detail is never
 * learned. Those answers stay with the project they were given for.
 *
 * Pure: no React, no SDK, no writes, no network.
 */

import {
  CONFIDENCE_BAND,
  KNOWLEDGE_STATUS,
  PROMOTION_RULE,
  UNLEARNABLE_REASON,
  buildDesignCondition,
  canonicalRationale,
  conditionStatements,
  confidenceBand,
  confidenceForProjects,
  knowledgeKey,
  learnabilityOfAnswer,
  statusForProjects,
  topicForQuestion,
} from './adiDesignKnowledgeModel.js';
import { answersAlike, conceptsOf, contentTokens, readAnswer, sharedConcepts } from './adiDesignKnowledgeMatching.js';

/** What one reconciliation did. Every outcome is stated, including the refusals. */
export const LEARNING_OUTCOME = Object.freeze({
  NOT_LEARNABLE: 'not_learnable',
  DISABLED: 'topic_disabled',
  CANDIDATE_CREATED: 'candidate_created',
  CANDIDATE_STRENGTHENED: 'candidate_strengthened',
  KNOWLEDGE_LEARNED: 'knowledge_learned',
  RECORD_UPDATED: 'record_updated',
  CONTESTED: 'contested',
});

function asText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** One stored answer inside a record: who gave it, for which project, and what it meant. */
function storedAnswer({ answer, projectId, userId, at, topic }) {
  return {
    answer: String(answer || '').trim(),
    project_id: projectId || null,
    user_id: userId || null,
    at: at || null,
    concepts: conceptsOf(answer, topic),
  };
}

/** The distinct projects a record has heard a reason from. */
export function heardProjects(record = {}) {
  const fromRefs = (Array.isArray(record.source_refs) ? record.source_refs : [])
    .map((ref) => asText(String(ref?.project_id || '')))
    .filter(Boolean);
  const fromAnswers = (Array.isArray(record.raw_answers) ? record.raw_answers : [])
    .map((entry) => asText(String(entry?.project_id || '')))
    .filter(Boolean);
  return Array.from(new Set([...fromRefs, ...fromAnswers]));
}

/**
 * THE CANDIDATE BUILT FROM ONE ANSWER. Returns the structured learning candidate
 * the request describes — topic, design condition, the designer's exact words, the
 * canonical meaning, the internal source references, the date and an initial
 * confidence — or a stated refusal.
 *
 * @returns {{learnable: boolean, reason: string|null, candidate: Object|null}}
 */
export function learningCandidateFromAnswer({
  question = null,
  answer = null,
  identity = {},
  condition = null,
  now = null,
} = {}) {
  const text = asText(typeof answer === 'string' ? answer : answer?.answer);
  const topic = topicForQuestion(question?.question_id, question?.area);
  const verdict = learnabilityOfAnswer(text);
  if (!topic) return { learnable: false, reason: UNLEARNABLE_REASON.NO_ANSWER, candidate: null };
  if (!verdict.learnable) return { learnable: false, reason: verdict.reason, candidate: null };

  const designCondition = condition
    ? buildDesignCondition({ ...condition, question })
    : buildDesignCondition({ question });
  const concepts = conceptsOf(text, topic);

  return {
    learnable: true,
    reason: null,
    candidate: {
      topic,
      knowledge_key: knowledgeKey(topic, designCondition),
      condition: designCondition,
      condition_text: conditionStatements(designCondition),
      canonical_meaning: canonicalRationale({ topic, condition: designCondition, concepts, fallback: text }),
      raw_answers: [storedAnswer({
        answer: text,
        projectId: identity.projectId,
        userId: identity.userId,
        at: now,
        topic,
      })],
      source_refs: [{
        project_id: identity.projectId || null,
        user_id: identity.userId || null,
        at: now || null,
      }],
      last_confirmed_at: now || null,
      at: now || null,
    },
  };
}

/** The record as it is written before anything has been approved or contested. */
function recordFromCandidate(candidate, now) {
  const projects = heardProjects(candidate);
  const status = statusForProjects(projects.length);
  const confidence = confidenceForProjects(projects.length);
  return {
    ...candidate,
    status,
    confidence,
    confidence_band: confidenceBand(confidence),
    seen_projects: projects.length,
    contested: false,
    contested_answer: null,
    approved_by: null,
    approved_at: null,
    disabled_by: null,
    disabled_at: null,
    admin_edited: false,
    admin_edited_by: null,
    admin_edited_at: null,
    merged_from: [],
    last_confirmed_at: now || candidate.last_confirmed_at || null,
  };
}

/** A record that has been understood keeps no raw text: the meaning and the internal refs remain. */
function promoteRecord(record, now) {
  const projects = heardProjects(record);
  return {
    ...record,
    status: KNOWLEDGE_STATUS.LEARNED,
    confidence: confidenceForProjects(projects.length, { approved: Boolean(record.approved_at) }),
    confidence_band: confidenceBand(confidenceForProjects(projects.length, { approved: Boolean(record.approved_at) })),
    seen_projects: projects.length,
    contested: false,
    contested_answer: null,
    last_confirmed_at: now || record.last_confirmed_at || null,
  };
}

/** Everything a record states once its projects, contradiction and approval are known. */
function restated(record, { now = null, rawAnswers = null } = {}) {
  const projects = heardProjects(record);
  const approved = Boolean(record.approved_at) || record.admin_approved === true;
  const status = record.contested
    ? KNOWLEDGE_STATUS.CANDIDATE
    : statusForProjects(projects.length);
  const effective = approved && !record.contested
    ? KNOWLEDGE_STATUS.LEARNED
    : status;
  const confidence = confidenceForProjects(projects.length, { approved, contested: record.contested });
  const understood = effective === KNOWLEDGE_STATUS.LEARNED;
  const answers = rawAnswers === null ? (record.raw_answers || []) : rawAnswers;

  return {
    ...record,
    status: effective,
    confidence,
    confidence_band: confidenceBand(confidence),
    seen_projects: projects.length,
    // Raw designer wording and any competing wording exist only while the matter is
    // still being learned, and are dropped the moment it becomes learned knowledge:
    // a learned record carries the canonical meaning and internal references only.
    raw_answers: understood && !record.contested ? [] : answers,
    contested_answer: understood && !record.contested ? null : record.contested_answer,
    condition_text: conditionStatements(record.condition || {}),
    last_confirmed_at: now || record.last_confirmed_at || null,
  };
}

/**
 * RECONCILE ONE ANSWER WITH THE RECORDS THAT EXIST. This is the only place the
 * promotion rule is applied: an answer either creates a candidate, strengthens one,
 * promotes it to learned knowledge, or marks the matter contested.
 *
 * @returns {{items: Array<Object>, outcome: string, reason: string|null, record: Object|null}}
 */
export function reconcileKnowledge({ items = [], candidate = null, now = null } = {}) {
  const existingItems = Array.isArray(items) ? items : [];
  if (!candidate?.knowledge_key || !candidate?.topic) {
    return { items: existingItems, outcome: LEARNING_OUTCOME.NOT_LEARNABLE, reason: UNLEARNABLE_REASON.NO_ANSWER, record: null };
  }

  const match = existingItems.find((item) => String(item?.knowledge_key || '') === candidate.knowledge_key) || null;

  if (match && match.status === KNOWLEDGE_STATUS.DISABLED) {
    // The admin turned this matter off. ADI neither strengthens nor re-learns it, and
    // it never resurfaces in a designer's workflow while it is disabled.
    return { items: existingItems, outcome: LEARNING_OUTCOME.DISABLED, reason: null, record: match };
  }

  if (!match) {
    const record = recordFromCandidate(candidate, now);
    record.id = candidate.id || `knowledge-${candidate.knowledge_key}`;
    const outcome = record.status === KNOWLEDGE_STATUS.LEARNED
      ? LEARNING_OUTCOME.KNOWLEDGE_LEARNED
      : LEARNING_OUTCOME.CANDIDATE_CREATED;
    const stored = restated(record, { now });
    return { items: [...existingItems, stored], outcome, reason: null, record: stored };
  }

  const incoming = readAnswer({
    answer: candidate.raw_answers?.[0]?.answer || '',
    topic: candidate.topic,
    projectId: candidate.raw_answers?.[0]?.project_id || null,
    userId: candidate.raw_answers?.[0]?.user_id || null,
    at: now,
  });
  const heard = (match.raw_answers || []).map((entry) => readAnswer({
    answer: entry.answer,
    topic: match.topic,
    projectId: entry.project_id,
    userId: entry.user_id,
    at: entry.at,
  }));
  // Does the new answer mean the same thing as the reason already recorded? A
  // record that has been understood no longer keeps its raw answers, so its own
  // canonical meaning is read instead — the designer must never be asked to phrase
  // a reason the way the canonical form happens to be written.
  const reference = heard.length > 0
    ? heard
    : [readAnswer({ answer: match.canonical_meaning, topic: match.topic })];
  const alike = reference.some((entry) => answersAlike(entry, incoming).alike);

  if (!alike) {
    // CONTRADICTION. The record does not change its mind and does not overwrite the
    // designer: the matter is marked contested, confidence falls to the bottom band
    // and ADI asks again rather than asserting something a designer has disputed.
    const contestedRecord = restated({
      ...match,
      contested: true,
      contested_answer: incoming.answer,
      raw_answers: match.raw_answers || [],
    }, { now });
    return {
      items: existingItems.map((item) => (item === match ? contestedRecord : item)),
      outcome: LEARNING_OUTCOME.CONTESTED,
      reason: null,
      record: contestedRecord,
    };
  }

  const alreadyHeard = heardProjects(match).includes(incoming.projectId);
  const answers = [...(match.raw_answers || []), storedAnswer({
    answer: incoming.answer,
    projectId: incoming.projectId,
    userId: incoming.userId,
    at: now,
    topic: match.topic,
  })];
  const refs = [
    ...(match.source_refs || []),
    { project_id: incoming.projectId || null, user_id: incoming.userId || null, at: now || null },
  ];
  const merged = restated({
    ...match,
    raw_answers: answers,
    source_refs: refs,
    // The canonical meaning states what the designers shared, so it is recomposed
    // from the answers themselves rather than from whichever one arrived last.
    canonical_meaning: canonicalRationale({
      topic: match.topic,
      condition: match.condition || {},
      concepts: sharedConcepts(heard.concat(incoming), match.topic),
      fallback: match.canonical_meaning,
    }) || match.canonical_meaning,
  }, { now });

  const outcome = merged.status === KNOWLEDGE_STATUS.LEARNED
    ? LEARNING_OUTCOME.KNOWLEDGE_LEARNED
    : alreadyHeard
      ? LEARNING_OUTCOME.RECORD_UPDATED
      : merged.status === KNOWLEDGE_STATUS.STRENGTHENED
        ? LEARNING_OUTCOME.CANDIDATE_STRENGTHENED
        : LEARNING_OUTCOME.RECORD_UPDATED;

  return {
    items: existingItems.map((item) => (item === match ? merged : item)),
    outcome,
    reason: null,
    record: merged,
  };
}

/** The one promotion test, exposed so a caller can state it without repeating it. */
export function promotionFor(projects = 0) {
  return {
    status: statusForProjects(projects),
    projects: Number(projects) || 0,
    strengthenAt: PROMOTION_RULE.STRENGTHEN_PROJECTS,
    learnAt: PROMOTION_RULE.LEARN_PROJECTS,
  };
}

export default {
  LEARNING_OUTCOME,
  learningCandidateFromAnswer,
  reconcileKnowledge,
  heardProjects,
  promotionFor,
};