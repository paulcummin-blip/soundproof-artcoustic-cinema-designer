/**
 * proposalEditRecord.js (shared)
 * -------------------------------
 * THE Phase 4 edit record: one immutable, auditable record per saved edit of a
 * generated proposal.
 *
 * The edit record never touches the generation it edits. The generation stays
 * exactly as it was — its frozen evidence pack, its GPT input, its GPT output,
 * its validation result, its report snapshot IDs, its evidence and engineering
 * fingerprints and its record fingerprint are all left byte-identical — and the
 * designer's copy lives here instead, linked back to it by `generation_id` and
 * `base_generation_fingerprint`. Every saved edit appends a new record; nothing
 * is ever rewritten, so an earlier copy stays readable for audit.
 *
 * Immutability is real, not a convention: the record is a JSON snapshot of what
 * was saved — cloned, so the caller's objects can never change it, and frozen, so
 * nothing can change it afterwards. A validation status is never accepted from a
 * caller: it is derived from the validation result, and a copy that did not pass
 * validation can never say it did.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

import { proposalEvidenceFingerprint } from '../proposalEvidence/proposalEvidenceBuilder.js';
import {
  deepFreeze,
  jsonClone,
} from '../proposalGeneration/proposalGenerationRecord.js';
import {
  EDIT_SOURCES,
  EDIT_SOURCE,
  EDIT_VALIDATION_STATUS,
  deriveEditValidationStatus,
} from './editStatuses.js';

/** Every field an edit record stores. */
export const EDIT_RECORD_FIELDS = Object.freeze([
  'edit_id',
  'edit_number',
  'generation_id',
  'proposal_id',
  'draft_proposal_id',
  'project_id',
  'account_id',
  'edited_sections',
  'edit_source',
  'base_edit_id',
  'edited_by',
  'edited_at',
  'created_at',
  'base_generation_fingerprint',
  'validation_status',
  'validation_errors',
  'edit_fingerprint',
]);

function requireText(value, message) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(message);
  return value;
}

/**
 * Build one immutable edit record.
 *
 * @param {Object} attempt
 * @param {string} attempt.generationId — the generation this copy edits
 * @param {string} [attempt.proposalId] — the saved proposal, when there is one
 * @param {string} [attempt.draftProposalId] — the draft proposal id, before it is saved
 * @param {string} attempt.projectId
 * @param {string} [attempt.accountId]
 * @param {Array<Object>} attempt.editedSections — the designer's copy
 * @param {string} [attempt.editSource] — 'manual' | 'revert'
 * @param {string|null} [attempt.baseEditId] — the edit a revert restores
 * @param {string} attempt.editedBy
 * @param {string} attempt.editedAt — ISO timestamp
 * @param {string} [attempt.createdAt] — defaults to the moment of the edit
 * @param {string} attempt.baseGenerationFingerprint — the generation fingerprint the copy was made from
 * @param {string} attempt.basePackFingerprint — the frozen pack the copy was validated against
 * @param {Object} attempt.validation — the validateWriterOutput result for this copy
 * @param {number} attempt.editNumber — this copy's place in the generation's edit chain
 * @param {string} [attempt.editId] — supplied only to pin a known ID
 * @returns {Object} the frozen record
 */
export function buildEditRecord(attempt = {}) {
  const {
    generationId = null,
    proposalId = null,
    draftProposalId = null,
    projectId = null,
    accountId = null,
    editedSections = null,
    editSource = EDIT_SOURCE.MANUAL,
    baseEditId = null,
    editedBy = null,
    editedAt = null,
    createdAt = null,
    baseGenerationFingerprint = null,
    basePackFingerprint = null,
    validation = null,
    editNumber = null,
    editId = null,
  } = attempt;

  // The audit identity. Without these there is nothing to audit.
  requireText(generationId, 'An edit record needs the generation it edits.');
  requireText(projectId, 'An edit record needs the project the proposal belongs to.');
  requireText(editedBy, 'An edit record needs the user who saved it.');
  requireText(editedAt, 'An edit record needs the time it was saved.');
  requireText(
    baseGenerationFingerprint,
    'An edit record needs the generation fingerprint it was made against, or it cannot be traced to the copy it started from.',
  );
  if (!EDIT_SOURCES.includes(editSource)) {
    throw new Error(`Unknown edit source "${editSource}". Known sources: ${EDIT_SOURCES.join(', ')}.`);
  }
  if (!Array.isArray(editedSections)) {
    throw new Error('An edit is a copy of the proposal: edited_sections must be the section list the designer saved.');
  }
  if (!Number.isInteger(editNumber) || editNumber < 1) {
    throw new Error('An edit record needs its place in the generation\'s edit chain (a positive integer).');
  }
  if (editSource === EDIT_SOURCE.MANUAL && baseEditId !== null) {
    throw new Error('A manual edit restores nothing: base_edit_id belongs to a revert.');
  }

  // The validation must belong to the pack this copy was held against, or the
  // record would mix two pieces of evidence.
  if (!validation || typeof validation !== 'object') {
    throw new Error('An edit record stores the validation result of the copy it was saved with.');
  }
  if (String(validation.pack_fingerprint ?? '') !== String(basePackFingerprint ?? '')) {
    throw new Error('The validation result belongs to another evidence pack, so the edit cannot be recorded against this one.');
  }

  const validationStatus = deriveEditValidationStatus(validation);

  const record = {
    edit_id: 'pending',
    edit_number: editNumber,
    generation_id: generationId,
    proposal_id: proposalId ?? null,
    draft_proposal_id: draftProposalId ?? null,
    project_id: projectId,
    account_id: accountId ?? null,
    edited_sections: jsonClone(editedSections),
    edit_source: editSource,
    base_edit_id: baseEditId ?? null,
    edited_by: editedBy,
    edited_at: editedAt,
    created_at: createdAt ?? editedAt,
    base_generation_fingerprint: baseGenerationFingerprint,
    validation_status: validationStatus,
    validation_errors: jsonClone(validation.violations) || [],
    edit_fingerprint: null,
  };

  // The ID is derived from the edit itself — the generation it edits, the copy,
  // how it was made, what it restores, when it was saved and how it validated.
  // The chain position is deliberately not part of it: the same edit saved twice
  // has to hash to the same ID, so a double save is refused as a duplicate
  // rather than filed as a second edit.
  const identityForId = {
    generation_id: record.generation_id,
    project_id: record.project_id,
    base_edit_id: record.base_edit_id,
    edit_source: record.edit_source,
    edited_at: record.edited_at,
    validation_status: record.validation_status,
    edited_copy_fingerprint: proposalEvidenceFingerprint({ sections: record.edited_sections }),
  };
  record.edit_id = editId || `edit_${proposalEvidenceFingerprint(identityForId)}`;
  record.edit_fingerprint = proposalEvidenceFingerprint(record);

  return deepFreeze(record);
}

export default buildEditRecord;