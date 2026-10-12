/**
 * clarificationAnswers.js (shared)
 * --------------------------------
 * HOW A DESIGNER'S CLARIFICATION ANSWER IS STORED, AND WHAT MAY BE DONE WITH IT.
 *
 * An answer is project-specific context: the designer's own explanation of one
 * decision ADI could not explain from the evidence. It is kept with the proposal
 * it was given for, together with where it came from and the project and version
 * identity it belongs to, so it can be read back later exactly as it was given.
 *
 * THREE RULES HOLD HERE, AND THEY ARE THE POINT OF THIS MODULE:
 *
 *   - a PASSED question carries NO answer, and is never stored as though it had
 *     been answered: passing is a decision, not a blank answer;
 *   - nothing is ever inferred, invented or completed on the designer's behalf;
 *   - an answer stays inside the project it was given for. It is never published,
 *     never shared between accounts, and never promoted into reusable design
 *     knowledge automatically: `shared` is false, always, and only a later
 *     master-admin curation step may ever change that.
 *
 * Pure: no React, no SDK, no writes.
 */

import { MAX_CLARIFICATION_QUESTIONS } from './adiClarificationQuestions.js';

/** Where an answer came from. */
export const CLARIFICATION_SOURCE = Object.freeze({
  WIZARD: 'proposal_wizard',
  CARRIED: 'carried_from_previous_proposal',
});

function asText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * The designer's clarification answers, normalised into stored records.
 *
 * @param {Array<Object>} raw — what the wizard sent
 * @param {Object} identity
 * @param {string} [identity.projectId]
 * @param {Array<string>} [identity.versionIds]
 * @param {Object} [identity.user] — the authenticated user ({ full_name, email })
 * @param {string} [identity.now] — ISO timestamp
 * @returns {Array<Object>} at most three records, each project- and version-scoped
 */
export function normaliseClarificationAnswers(raw, {
  projectId = null,
  versionIds = [],
  user = null,
  now = null,
} = {}) {
  const list = Array.isArray(raw) ? raw : [];
  const versionScope = (Array.isArray(versionIds) ? versionIds : []).map(String).filter(Boolean);
  const out = [];
  const seen = new Set();

  for (const entry of list) {
    if (out.length >= MAX_CLARIFICATION_QUESTIONS) break;
    const questionId = asText(entry?.question_id);
    if (!questionId || seen.has(questionId)) continue;
    const answer = asText(entry?.answer);
    const answered = entry?.status === 'answered' && Boolean(answer);
    seen.add(questionId);
    const scope = (Array.isArray(entry?.version_ids) ? entry.version_ids : [])
      .map((id) => asText(String(id || '')))
      .filter(Boolean);
    out.push({
      question_id: questionId,
      question: asText(entry?.question) || null,
      area: asText(entry?.area) || null,
      belongs_to: asText(entry?.belongs_to) || null,
      status: answered ? 'answered' : 'passed',
      // A passed question has no answer, so nothing can ever be read as one.
      answer: answered ? answer : null,
      source: asText(entry?.source) || CLARIFICATION_SOURCE.WIZARD,
      project_id: asText(projectId) || null,
      version_ids: scope.length > 0 ? scope : versionScope,
      answered_at: now,
      answered_by: user?.full_name || user?.email || null,
      // Dealer answers are project-specific and never shared knowledge. Only a
      // later master-admin curation step may ever contribute one, and this phase
      // implements no learning at all.
      shared: false,
    });
  }
  return out;
}

/** The question ids a preparation has already asked about: answered OR passed. */
export function askedClarificationIds(records = []) {
  return (Array.isArray(records) ? records : [])
    .map((record) => asText(record?.question_id))
    .filter(Boolean);
}

/** The stored records that carry a real answer. A passed question never does. */
export function answeredClarifications(records = []) {
  return (Array.isArray(records) ? records : [])
    .filter((record) => record?.status === 'answered' && asText(record?.answer));
}

/** The stored records the designer passed on. */
export function passedClarifications(records = []) {
  return (Array.isArray(records) ? records : []).filter((record) => record?.status === 'passed');
}

export default normaliseClarificationAnswers;