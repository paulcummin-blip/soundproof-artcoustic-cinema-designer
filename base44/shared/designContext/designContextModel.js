/**
 * designContextModel.js (shared)
 * --------------------------------
 * THE DATA MODEL for version-scoped designer context.
 *
 * A context item is the designer's own explanation of one design decision the
 * engineering evidence does not establish. Three outcomes are distinguished:
 *
 *   - answered: the designer gave an explanation; it is saved and reused.
 *   - no_reason: the designer explicitly confirmed there is no particular reason;
 *     it is saved and the question is not asked again unless the relevant
 *     decision-specific inputs materially change.
 *   - skipped: the designer passed for THIS generation only. It is never stored,
 *     so the question may be asked again on a future generation.
 *
 * Each item carries a decision_fingerprint: a fingerprint of the specific design
 * inputs that prompted the question. When those inputs change, the saved answer
 * is marked as needing reconfirmation. This implements the "decision-specific
 * inputs" rule: only a material change to the inputs relevant to that decision
 * triggers reconfirmation, not any room or system change.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

/** The maximum number of questions ADI may ask in one review. */
export const MAX_DESIGN_CONTEXT_QUESTIONS = 3;

/** The status values a context item may carry. */
export const CONTEXT_STATUS = Object.freeze({
  ANSWERED: 'answered',
  NO_REASON: 'no_reason',
  // SKIPPED is a transient state that is never persisted.
  SKIPPED: 'skipped',
});

/** The schema version of the context record, for future migration safety. */
export const DESIGN_CONTEXT_VERSION = '1.0';

function asText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Normalise one context item from raw designer input.
 *
 * @param {Object} raw — the dialog's raw entry
 * @param {Object} identity — { user, now }
 * @returns {Object|null} the normalised item, or null if it is a skip
 */
export function normaliseContextItem(raw, { user = null, now = null } = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const questionId = asText(raw.question_id);
  if (!questionId) return null;

  const status = raw.status === CONTEXT_STATUS.NO_REASON
    ? CONTEXT_STATUS.NO_REASON
    : raw.status === CONTEXT_STATUS.ANSWERED
      ? CONTEXT_STATUS.ANSWERED
      : CONTEXT_STATUS.SKIPPED;

  // A skipped question is never persisted.
  if (status === CONTEXT_STATUS.SKIPPED) return null;

  const answer = status === CONTEXT_STATUS.ANSWERED ? asText(raw.answer) : null;
  // An answered item with no text is not a real answer.
  if (status === CONTEXT_STATUS.ANSWERED && !answer) return null;

  return {
    question_id: questionId,
    question: asText(raw.question) || null,
    area: asText(raw.area) || null,
    status,
    answer,
    decision_fingerprint: asText(raw.decision_fingerprint) || null,
    answered_at: now,
    answered_by: user?.full_name || user?.email || null,
  };
}

/**
 * Normalise a full set of context items from the dialog.
 * Skips are dropped. Duplicates by question_id are removed (last wins).
 *
 * @param {Array<Object>} rawList — the dialog's raw entries
 * @param {Object} identity — { user, now }
 * @returns {Array<Object>} the normalised, persisted items
 */
export function normaliseContextItems(rawList, { user = null, now = null } = {}) {
  const list = Array.isArray(rawList) ? rawList : [];
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    const item = normaliseContextItem(raw, { user, now });
    if (!item) continue;
    if (seen.has(item.question_id)) {
      const index = out.findIndex((entry) => entry.question_id === item.question_id);
      if (index >= 0) out[index] = item;
    } else {
      seen.add(item.question_id);
      out.push(item);
    }
  }
  return out;
}

/**
 * Merge new items into existing saved items.
 * An item with the same question_id replaces the existing one.
 * Items not present in the new list are preserved (they were not re-asked).
 *
 * @param {Array<Object>} existing — the saved items
 * @param {Array<Object>} incoming — the new items from this review
 * @returns {Array<Object>} the merged set
 */
export function mergeContextItems(existing = [], incoming = []) {
  const existingList = Array.isArray(existing) ? existing : [];
  const incomingList = Array.isArray(incoming) ? incoming : [];
  const map = new Map();
  for (const item of existingList) {
    if (item?.question_id) map.set(item.question_id, item);
  }
  for (const item of incomingList) {
    if (item?.question_id) map.set(item.question_id, item);
  }
  return Array.from(map.values());
}

/**
 * Whether a saved item still matches its current decision fingerprint.
 * If the decision-specific inputs have changed, the item needs reconfirmation.
 *
 * @param {Object} savedItem — the saved context item
 * @param {string} currentFingerprint — the current decision fingerprint
 * @returns {boolean} true if the item is still current
 */
export function contextItemIsCurrent(savedItem, currentFingerprint) {
  if (!savedItem || !savedItem.question_id) return false;
  const saved = savedItem.decision_fingerprint || null;
  const current = currentFingerprint || null;
  // If either side states no fingerprint, the item is treated as current
  // rather than being needlessly reconfirmed.
  if (!saved || !current) return true;
  return saved === current;
}

/**
 * Partition saved items into current and stale, based on a map of
 * question_id -> current decision fingerprint from the discovery.
 *
 * @param {Array<Object>} savedItems — the saved context items
 * @param {Map<string, string>} currentFingerprints — question_id -> fingerprint
 * @returns {{current: Array, stale: Array}}
 */
export function partitionByCurrency(savedItems, currentFingerprints) {
  const list = Array.isArray(savedItems) ? savedItems : [];
  const fpMap = currentFingerprints instanceof Map ? currentFingerprints : new Map();
  const current = [];
  const stale = [];
  for (const item of list) {
    if (!item?.question_id) continue;
    const fp = fpMap.get(item.question_id) || null;
    if (contextItemIsCurrent(item, fp)) {
      current.push(item);
    } else {
      stale.push(item);
    }
  }
  return { current, stale };
}

/**
 * Convert saved context items into the recordedIntent strings the
 * interpretation's `important_design_decisions` expects.
 *
 * Only ANSWERED items become recorded intent. A NO_REASON item carries no
 * reason and is never turned into one: it is handled by the default writer
 * rule that states the arrangement without inventing a motivation.
 *
 * @param {Array<Object>} items — saved context items
 * @returns {Array<string>} the designer's recorded explanations
 */
export function recordedIntentFromContext(items) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => item?.status === CONTEXT_STATUS.ANSWERED && asText(item?.answer))
    .map((item) => {
      const area = asText(item?.area);
      const answer = asText(item.answer);
      return area ? `${area}: ${answer}` : answer;
    });
}

/**
 * The question ids that have been answered or confirmed as no-reason,
 * and should not be asked again unless their decision fingerprint changes.
 *
 * @param {Array<Object>} items — saved context items
 * @returns {Set<string>} the question ids to suppress
 */
export function confirmedQuestionIds(items) {
  return new Set(
    (Array.isArray(items) ? items : [])
      .filter((item) => item?.status === CONTEXT_STATUS.ANSWERED || item?.status === CONTEXT_STATUS.NO_REASON)
      .map((item) => item?.question_id)
      .filter(Boolean),
  );
}

// ── Decision-level identity ──────────────────────────────────────────────────
//
// Different question IDs can describe the same underlying design decision.
// The decision identity module maps question IDs to decision keys so a saved
// answer for one ID suppresses equivalent questions about the same decision,
// and a single review never presents two questions about the same decision.

import {
  decisionKeyForQuestionId,
  decisionKeyForQuestion,
  compareSubwooferArrangementAcrossIds,
  DESIGN_DECISION,
} from './designContextDecisionIdentity.js';

/**
 * The decision keys that have been answered or confirmed as no-reason, and
 * should not be asked again. This is the decision-level equivalent of
 * {@link confirmedQuestionIds}: a current question about any of these
 * decisions is suppressed, regardless of its question ID.
 *
 * @param {Array<Object>} items — saved context items
 * @returns {Set<string>} the decision keys to suppress
 */
export function confirmedDecisions(items) {
  return new Set(
    (Array.isArray(items) ? items : [])
      .filter((item) => item?.status === CONTEXT_STATUS.ANSWERED || item?.status === CONTEXT_STATUS.NO_REASON)
      .map((item) => decisionKeyForQuestionId(item?.question_id))
      .filter(Boolean),
  );
}

/**
 * Partition saved items into current and stale, using decision-level identity.
 *
 * A saved item is matched against the current questions by its DECISION KEY,
 * not by its question ID. This means a saved answer under
 * `subwoofer_count_rationale` suppresses a current question about
 * `subwoofer_front_rear_distribution` when both describe the same subwoofer
 * arrangement decision.
 *
 * Fingerprint comparison is used only when the saved item's question ID is
 * STILL a current question ID (the exact same question reappeared). In that
 * case, a matching fingerprint means the design is unchanged (current); a
 * mismatch means the design materially changed (stale, re-ask).
 *
 * When the saved item's question ID is NOT a current question ID but its
 * decision key matches a current question, the item is treated as current:
 * the fingerprints were computed under different question IDs and are not
 * comparable, so the designer's existing answer is respected rather than
 * needlessly reconfirmed.
 *
 * @param {Array<Object>} savedItems — the saved context items
 * @param {Array<Object>} currentQuestions — the questions discovery found
 * @returns {{current: Array, stale: Array}}
 */
export function partitionByDecisionCurrency(savedItems, currentQuestions) {
  const list = Array.isArray(savedItems) ? savedItems : [];
  const questions = Array.isArray(currentQuestions) ? currentQuestions : [];

  // Map: decision_key -> { fingerprint, question_ids: Set<string> }
  const byDecision = new Map();
  for (const q of questions) {
    if (!q?.question_id) continue;
    const dk = decisionKeyForQuestion(q);
    if (!dk) continue;
    const existing = byDecision.get(dk);
    if (existing) {
      existing.question_ids.add(q.question_id);
    } else {
      byDecision.set(dk, {
        fingerprint: q.decision_fingerprint || null,
        question_ids: new Set([q.question_id]),
      });
    }
  }

  const current = [];
  const stale = [];
  for (const item of list) {
    if (!item?.question_id) continue;
    const dk = decisionKeyForQuestionId(item.question_id);
    const info = dk ? byDecision.get(dk) : null;
    if (!info) {
      // No current question about this decision. The saved item is
      // preserved but irrelevant: nothing to suppress or re-ask.
      current.push(item);
      continue;
    }
    if (info.question_ids.has(item.question_id)) {
      // The exact same question ID reappeared. Compare fingerprints to
      // detect a material change in the design (existing behaviour).
      const savedFp = item.decision_fingerprint || null;
      const currentFp = info.fingerprint;
      if (!savedFp || !currentFp || savedFp === currentFp) {
        current.push(item);
      } else {
        stale.push(item);
      }
    } else {
      // The question ID changed but the decision is the same.
      if (dk === DESIGN_DECISION.SUBWOOFER_ARRANGEMENT) {
        // For the subwoofer decision, compare canonical arrangement
        // signatures across question IDs to detect material changes.
        // This distinguishes an unchanged arrangement (Case A/C/D: suppress)
        // from a materially changed one (Case B: re-ask).
        const comparison = compareSubwooferArrangementAcrossIds(
          item,
          info.fingerprint,
        );
        if (comparison === 'current') {
          current.push(item);
        } else {
          // 'stale' or 'unknown': do not silently treat as current.
          // Re-ask so ADI can reconsider whether the saved explanation
          // remains relevant after the material change.
          stale.push(item);
        }
      } else {
        // For other decisions, fingerprints may not be comparable across
        // question IDs. Respect the designer's existing answer.
        current.push(item);
      }
    }
  }
  return { current, stale };
}

/**
 * The context record as it is stored: one record per project version.
 *
 * @param {Object} input
 * @param {string} input.projectId
 * @param {string} input.versionId
 * @param {string} input.accountId
 * @param {Array<Object>} input.items — merged context items
 * @param {string} [input.now]
 * @param {Object} [input.user]
 * @returns {Object} the record body for entity create/update
 */
export function buildContextRecord({
  projectId = null,
  versionId = null,
  accountId = null,
  items = [],
  now = null,
  user = null,
} = {}) {
  return {
    project_id: projectId,
    version_id: versionId,
    account_id: accountId,
    context_items: items,
    updated_at: now,
    updated_by: user?.full_name || user?.email || null,
  };
}

export default {
  MAX_DESIGN_CONTEXT_QUESTIONS,
  CONTEXT_STATUS,
  DESIGN_CONTEXT_VERSION,
  normaliseContextItems,
  mergeContextItems,
  partitionByCurrency,
  partitionByDecisionCurrency,
  recordedIntentFromContext,
  confirmedQuestionIds,
  confirmedDecisions,
  buildContextRecord,
};