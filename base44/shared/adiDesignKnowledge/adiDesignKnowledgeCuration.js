/**
 * adiDesignKnowledgeCuration.js (shared)
 * --------------------------------------
 * WHAT A MASTER ADMIN MAY DO TO A LEARNED RECORD, AND WHAT EACH ACTION MEANS.
 *
 * WHY IT EXISTS. Learned knowledge is ADI's own understanding of how designs are
 * usually intended, so it has to be inspectable and correctable by a person. Five
 * decisions are all a record needs: approve it, edit its wording, disable it, merge
 * a duplicate into it, or reset its confidence so it has to earn its place again.
 *
 * HOW EACH ACTION BEHAVES:
 *
 *   - APPROVE marks the record learned knowledge and lifts its confidence to the
 *     top band, and it clears any contest — a person has read the disagreement and
 *     settled it. Approving also empties the raw designer wording, exactly as
 *     promotion does.
 *   - EDIT replaces the canonical wording by hand and records who did it. The design
 *     condition, the projects that gave the reason and the confidence are untouched:
 *     editing the wording never invents agreement.
 *   - DISABLE takes the record out of use completely. ADI neither applies it, offers
 *     it as a confirmation, nor strengthens or re-learns it while it is disabled.
 *   - ENABLE restores a disabled record to the standing its projects have earned.
 *   - RESET CONFIDENCE puts the record back to what its own separate projects have
 *     earned and clears a contest, so a record that was contested or over-confident
 *     has to be confirmed again before it is used.
 *   - MERGE folds one record into another and removes the duplicate: the separate
 *     projects of both are counted together, so merging two two-project candidates
 *     legitimately produces a learned matter. The merged record keeps a note of the
 *     keys it absorbed.
 *
 * WHAT IT NEVER DOES. It never invents projects, never counts one project twice, and
 * never touches an engineering value: this is design intent about WHY a design is the
 * way it is, and nothing here changes a figure, a level or a product.
 *
 * Pure: no React, no SDK, no writes.
 */

import {
  CONFIDENCE_BAND,
  KNOWLEDGE_STATUS,
  conditionStatements,
  confidenceBand,
  confidenceForProjects,
  statusForProjects,
} from './adiDesignKnowledgeModel.js';

/** The five decisions a master admin may take. */
export const CURATION_ACTION = Object.freeze({
  APPROVE: 'approve',
  EDIT: 'edit',
  DISABLE: 'disable',
  ENABLE: 'enable',
  RESET_CONFIDENCE: 'reset_confidence',
  MERGE: 'merge',
});

/** Why a curation action could not be applied. Every refusal is a stated reason. */
export const CURATION_REFUSAL = Object.freeze({
  RECORD_NOT_FOUND: 'knowledge_record_not_found',
  TARGET_NOT_FOUND: 'merge_target_not_found',
  SAME_RECORD: 'merge_target_is_the_same_record',
  EMPTY_WORDING: 'edited_wording_is_empty',
  UNKNOWN_ACTION: 'unknown_curation_action',
});

function asText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Every separate project a record rests on, from its references and its own answers. */
function projectsOf(record = {}) {
  const refs = (Array.isArray(record.source_refs) ? record.source_refs : [])
    .map((ref) => asText(String(ref?.project_id || '')))
    .filter(Boolean);
  const answers = (Array.isArray(record.raw_answers) ? record.raw_answers : [])
    .map((entry) => asText(String(entry?.project_id || '')))
    .filter(Boolean);
  return Array.from(new Set([...refs, ...answers]));
}

/** A record restated from its own separate projects, contests and approval. */
function standing(record, { now = null, keepRaw = false } = {}) {
  const projects = projectsOf(record);
  const approved = Boolean(record.approved_at);
  const contested = record.contested === true;
  const status = record.status === KNOWLEDGE_STATUS.DISABLED && !keepRaw
    ? KNOWLEDGE_STATUS.DISABLED
    : (contested ? KNOWLEDGE_STATUS.CANDIDATE : (approved ? KNOWLEDGE_STATUS.LEARNED : statusForProjects(projects.length)));
  const confidence = confidenceForProjects(projects.length, { approved, contested });
  const understood = status === KNOWLEDGE_STATUS.LEARNED;
  return {
    ...record,
    status,
    confidence,
    confidence_band: bandOf(confidence),
    seen_projects: projects.length,
    condition_text: conditionStatements(record.condition || {}),
    source_refs: keepRaw ? record.source_refs : uniqueRefs(record.source_refs),
    raw_answers: keepRaw ? (record.raw_answers || []) : (understood ? [] : (record.raw_answers || [])),
    last_confirmed_at: now || record.last_confirmed_at || null,
  };
}

function bandOf(score) {
  return confidenceBand(score);
}

/** References without repetition: one entry per project and designer. */
function uniqueRefs(refs = []) {
  const seen = new Set();
  const out = [];
  for (const ref of Array.isArray(refs) ? refs : []) {
    const key = `${ref?.project_id || ''}::${ref?.user_id || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
  }
  return out;
}

/**
 * APPLY ONE CURATION ACTION.
 *
 * @param {Object} input
 * @param {Array<Object>} input.items — the records as they stand
 * @param {string} [input.id] — the record to act on
 * @param {string} input.action — one of CURATION_ACTION
 * @param {string} [input.value] — the new canonical wording (EDIT), or the merge target
 * @param {string} [input.intoId] — the record a MERGE keeps
 * @param {Object} [input.admin] — { name } of the master admin acting
 * @param {string} [input.now] — ISO timestamp
 * @returns {{items, record, removedId, outcome, reason}}
 */
export function applyAdminAction({
  items = [],
  id = null,
  action = null,
  value = null,
  intoId = null,
  admin = null,
  now = null,
} = {}) {
  const list = Array.isArray(items) ? items : [];
  const who = asText(admin?.name) || asText(admin?.email) || 'master admin';
  const target = list.find((item) => String(item?.id || '') === String(id || '')
    || String(item?.knowledge_key || '') === String(id || '')) || null;
  const refuse = (reason) => ({ items: list, record: null, removedId: null, outcome: 'refused', reason });

  if (!action || !Object.values(CURATION_ACTION).includes(action)) {
    return refuse(CURATION_REFUSAL.UNKNOWN_ACTION);
  }
  if (!target) return refuse(CURATION_REFUSAL.RECORD_NOT_FOUND);

  if (action === CURATION_ACTION.EDIT) {
    const wording = asText(value);
    if (!wording) return refuse(CURATION_REFUSAL.EMPTY_WORDING);
    const edited = {
      ...target,
      canonical_meaning: wording,
      admin_edited: true,
      admin_edited_by: who,
      admin_edited_at: now || null,
    };
    return replaced(list, target, edited, 'edited');
  }

  if (action === CURATION_ACTION.APPROVE) {
    const approved = standing({
      ...target,
      approved_by: who,
      approved_at: now || null,
      contested: false,
      contested_answer: null,
      // An approval settles the disagreement and empties the raw wording, exactly as
      // promotion does: what remains is the meaning and the internal references.
      raw_answers: [],
    }, { now, keepRaw: false });
    const learned = { ...approved, status: KNOWLEDGE_STATUS.LEARNED, confidence_band: CONFIDENCE_BAND.HIGH };
    return replaced(list, target, learned, 'approved');
  }

  if (action === CURATION_ACTION.DISABLE) {
    const disabled = {
      ...target,
      status: KNOWLEDGE_STATUS.DISABLED,
      disabled_by: who,
      disabled_at: now || null,
      confidence_band: bandOf(target.confidence),
    };
    return replaced(list, target, disabled, 'disabled');
  }

  if (action === CURATION_ACTION.ENABLE) {
    const enabled = standing({ ...target, disabled_by: null, disabled_at: null, status: knowledgeStatusFor(target) }, { now });
    return replaced(list, target, enabled, 'enabled');
  }

  if (action === CURATION_ACTION.RESET_CONFIDENCE) {
    const reset = standing({ ...target, contested: false, contested_answer: null, status: knowledgeStatusFor(target) }, { now });
    return replaced(list, target, reset, 'confidence_reset');
  }

  if (action === CURATION_ACTION.MERGE) {
    const mergeTargetId = String(intoId || value || '');
    const holder = list.find((item) => String(item?.id || '') === mergeTargetId
      || String(item?.knowledge_key || '') === mergeTargetId) || null;
    if (!holder) return refuse(CURATION_REFUSAL.TARGET_NOT_FOUND);
    if (holder === target) return refuse(CURATION_REFUSAL.SAME_RECORD);

    const mergedRefs = uniqueRefs([...(holder.source_refs || []), ...(target.source_refs || [])]);
    const merged = standing({
      ...holder,
      source_refs: mergedRefs,
      raw_answers: [...(holder.raw_answers || []), ...(target.raw_answers || [])],
      merged_from: [...(holder.merged_from || []), String(target.knowledge_key || '')],
      contested: holder.contested === true,
      contested_answer: holder.contested_answer || target.contested_answer || null,
      last_confirmed_at: now || holder.last_confirmed_at || target.last_confirmed_at || null,
    }, { now });

    return {
      items: list.map((item) => (item === holder ? merged : (item === target ? null : item))).filter(Boolean),
      record: merged,
      removedId: target.id || null,
      outcome: merged.status === KNOWLEDGE_STATUS.LEARNED ? 'merged_learned' : 'merged',
      reason: null,
    };
  }

  return refuse(CURATION_REFUSAL.UNKNOWN_ACTION);
}

/** The status a record earns from its own projects once a contest is cleared. */
function knowledgeStatusFor(record = {}) {
  const projects = projectsOf(record);
  return record.approved_at ? KNOWLEDGE_STATUS.LEARNED : statusForProjects(projects.length);
}

function replaced(list, target, updated, outcome) {
  return {
    items: list.map((item) => (item === target ? updated : item)),
    record: updated,
    removedId: null,
    outcome,
    reason: null,
  };
}

export default { CURATION_ACTION, CURATION_REFUSAL, applyAdminAction };