/**
 * proposalEditHistory.js (shared)
 * --------------------------------
 * THE Phase 4 audit retrieval and copy selection: every question asked of a
 * generation's edits, answered from the records themselves.
 *
 * These helpers read records and change nothing. They work equally on records
 * held in memory and on the rows the `ProposalEdit` entity returns, because the
 * entity stores the record's own fields.
 *
 * Two questions are answered here, and they are deliberately different:
 *
 *   RENDERABLE COPY   the copy there is to show — the latest valid edit, or else
 *                     the validated GPT output. When the newest edit is invalid
 *                     the last good copy is still returned, so a designer can see
 *                     it and revert to it, and the block is reported alongside.
 *   ISSUE GATE        what may actually be issued, exported, completed or sent.
 *                     The newest edit decides: an invalid edit at the head of the
 *                     chain blocks, even where an earlier valid copy exists,
 *                     because the designer's most recent intent is the one that
 *                     did not pass. Reverting or correcting it clears the block by
 *                     appending a valid record; nothing is ever overwritten.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

import {
  generationIssueGate,
} from '../proposalGeneration/proposalGenerationHistory.js';
import { GENERATION_STATUS } from '../proposalGeneration/generationStatuses.js';
import { editCopy, generatedCopy } from './proposalEditCopy.js';
import {
  EDIT_GATE_REASON,
  EDIT_RENDER_SOURCE,
  EDIT_REVIEW_STATUSES,
  EDIT_VALIDATION_STATUS,
  editGate,
} from './editStatuses.js';

/** Every edit in a list, skipping anything that is not one. */
function asEdits(records) {
  return (Array.isArray(records) ? records : [])
    .filter((record) => record && typeof record === 'object' && record.edit_id);
}

/** Oldest first: by the time the edit was saved, then by place in the chain. */
function byRecency(a, b) {
  const at = String(a?.edited_at || '');
  const bt = String(b?.edited_at || '');
  if (at !== bt) return at < bt ? -1 : 1;
  return (Number(a?.edit_number) || 0) - (Number(b?.edit_number) || 0);
}

/** One edit by its ID. */
export function editById(records, editId) {
  if (!editId) return null;
  return asEdits(records).find((record) => record.edit_id === editId) || null;
}

/** Every edit of one generation, oldest first. */
export function editsForGeneration(records, generationId) {
  if (!generationId) return [];
  return asEdits(records)
    .filter((record) => record.generation_id === generationId)
    .sort(byRecency);
}

/** The newest edit of a generation, whether or not it passed validation. */
export function latestEdit(records, generationId) {
  const chain = editsForGeneration(records, generationId);
  return chain.length === 0 ? null : chain[chain.length - 1];
}

/** The newest edit of a generation that passed validation, and only that one. */
export function latestValidEdit(records, generationId) {
  const valid = editsForGeneration(records, generationId)
    .filter((record) => record.validation_status === EDIT_VALIDATION_STATUS.VALID);
  return valid.length === 0 ? null : valid[valid.length - 1];
}

/**
 * The copies a human should review, newest first: an edit that broke a claim,
 * figure, level or product rule, and one that was not the contract's shape.
 * Passing edits of a generation are not here — nothing needs reviewing.
 */
export function editsNeedingReview(records, generationId = null) {
  const wanted = generationId ? editsForGeneration(records, generationId) : asEdits(records);
  return wanted
    .filter((record) => EDIT_REVIEW_STATUSES.includes(record.validation_status))
    .sort(byRecency)
    .reverse();
}

/**
 * The validation result of one edit, as it was stored: the status, every
 * rejection, and the generation fingerprint the copy was validated against.
 */
export function editValidationResult(records, editId) {
  const record = editById(records, editId);
  if (!record) return null;
  return {
    edit_id: record.edit_id,
    generation_id: record.generation_id,
    base_generation_fingerprint: record.base_generation_fingerprint,
    status: record.validation_status,
    valid: record.validation_status === EDIT_VALIDATION_STATUS.VALID,
    errors: Array.isArray(record.validation_errors) ? [...record.validation_errors] : [],
  };
}

/** Whether one edit may be issued, exported, completed or sent, judged on its own. */
export function editIssueGate(records, editId) {
  const record = editById(records, editId);
  if (!record) {
    return {
      edit_id: editId ?? null,
      issuable: false,
      status: null,
      reason: EDIT_GATE_REASON.NOT_FOUND,
      record: null,
    };
  }
  return { edit_id: record.edit_id, ...editGate({ status: record.validation_status }), record };
}

/**
 * The copy there is to render, and where it comes from.
 *
 * The latest valid edit wins. With no valid edit the validated GPT output is
 * used — and only a valid generation has one, so an unvalidated draft is never
 * offered as the copy. When the newest edit is invalid, the last good copy is
 * still returned with the block reported, so it can be shown and reverted to.
 *
 * @param {Object} input
 * @param {Object|null} [input.generation] — the generation being rendered
 * @param {Array<Object>} [input.edits] — every edit record known
 * @returns {{ generation_id, source, copy, edit_id, edit_status,
 *   blocked_by_latest_edit, blocked_edit_id, blocked_errors, reason }}
 */
export function renderableProposalCopy({ generation = null, edits = [] } = {}) {
  const generationId = generation?.generation_id ?? null;
  const head = latestEdit(edits, generationId);
  const valid = latestValidEdit(edits, generationId);

  const blockedByLatestEdit = Boolean(head) && head.validation_status !== EDIT_VALIDATION_STATUS.VALID;
  const generatedAvailable = generation?.status === GENERATION_STATUS.VALID_GENERATED
    ? generatedCopy(generation)
    : null;

  const copy = valid ? editCopy(valid) : generatedAvailable;

  let source = null;
  let reason = EDIT_GATE_REASON.NO_COPY;
  if (valid) {
    source = EDIT_RENDER_SOURCE.EDIT;
    reason = EDIT_GATE_REASON.LATEST_VALID_EDIT;
  } else if (copy) {
    source = EDIT_RENDER_SOURCE.GENERATED;
    reason = EDIT_GATE_REASON.GENERATED_COPY;
  }

  return {
    generation_id: generationId,
    source,
    copy,
    edit_id: valid?.edit_id ?? null,
    edit_status: valid?.validation_status ?? null,
    blocked_by_latest_edit: blockedByLatestEdit,
    blocked_edit_id: blockedByLatestEdit ? head.edit_id : null,
    blocked_errors: blockedByLatestEdit && Array.isArray(head.validation_errors)
      ? [...head.validation_errors]
      : [],
    reason,
  };
}

/**
 * The one gate for issue, export, completion and sending, across both layers.
 *
 * Only two copies may ever be used: the validated GPT output, or the latest valid
 * edit. A generation that is not valid is refused by the Phase 3 rule; and when
 * the newest edit is invalid, the proposal is refused until that is corrected or
 * reverted, even though an earlier valid copy exists.
 *
 * @returns {{ generation_id, issuable: boolean, source: string|null,
 *   edit_id: string|null, status: string|null, reason: string, errors: Array<Object> }}
 */
export function proposalIssueGate({ generationRecords = [], editRecords = [], generationId = null } = {}) {
  const generation = generationIssueGate(generationRecords, generationId);
  const head = latestEdit(editRecords, generationId);

  if (!generation.issuable) {
    return {
      generation_id: generationId ?? null,
      issuable: false,
      source: null,
      edit_id: null,
      status: generation.status ?? null,
      reason: generation.reason,
      errors: [],
    };
  }

  if (head && head.validation_status !== EDIT_VALIDATION_STATUS.VALID) {
    return {
      generation_id: generationId,
      issuable: false,
      source: EDIT_RENDER_SOURCE.EDIT,
      edit_id: head.edit_id,
      status: head.validation_status,
      reason: EDIT_GATE_REASON.LATEST_EDIT_INVALID,
      errors: Array.isArray(head.validation_errors) ? [...head.validation_errors] : [],
    };
  }

  if (head) {
    return {
      generation_id: generationId,
      issuable: true,
      source: EDIT_RENDER_SOURCE.EDIT,
      edit_id: head.edit_id,
      status: head.validation_status,
      reason: EDIT_GATE_REASON.VALID,
      errors: [],
    };
  }

  return {
    generation_id: generationId,
    issuable: true,
    source: EDIT_RENDER_SOURCE.GENERATED,
    edit_id: null,
    status: generation.status ?? null,
    reason: EDIT_GATE_REASON.VALID,
    errors: [],
  };
}