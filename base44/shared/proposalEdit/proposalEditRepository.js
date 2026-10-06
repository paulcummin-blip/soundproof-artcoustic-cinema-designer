/**
 * proposalEditRepository.js (shared)
 * ------------------------------------
 * THE Phase 4 append-only store for proposal edits.
 *
 * It has one write path into a record — `appendEdit`, and the revert that is
 * built on the same path — and no way at all to change or remove a record it
 * already holds. A further edit, a correction, or a revert each append a new
 * record; nothing is ever rewritten, so every earlier copy stays readable.
 *
 * Two rules are enforced here rather than trusted to a caller:
 *
 *   1. validation is not optional. The store validates every copy it saves with
 *      the Phase 2 writer validator against the frozen GPT input of the
 *      generation, and derives the record's status from that result, so a caller
 *      cannot file an unchecked copy or declare one valid.
 *   2. a revert is derived, not supplied. `appendRevert` takes the copy from the
 *      frozen generation or from a stored valid edit itself, so the sections of a
 *      revert cannot come from whoever asked for it.
 *
 * The store holds records in memory and delegates every question to the history
 * helpers, so an in-memory history and a history read back from the `ProposalEdit`
 * entity answer identically. The entity itself refuses updates and deletes (its
 * schema sets both to false), so the two layers agree.
 *
 * Pure: no React, no SDK, no runtime-specific APIs. Nothing here calls GPT and
 * nothing here touches a Proposal record.
 */

import {
  generationById,
} from '../proposalGeneration/proposalGenerationHistory.js';
import { GENERATION_STATUS } from '../proposalGeneration/generationStatuses.js';
import { editCopy, generatedCopy, validateEditedCopy } from './proposalEditCopy.js';
import {
  editById,
  editIssueGate,
  editsForGeneration,
  editValidationResult,
  editsNeedingReview,
  latestValidEdit,
  proposalIssueGate,
  renderableProposalCopy,
} from './proposalEditHistory.js';
import { buildEditRecord } from './proposalEditRecord.js';
import { EDIT_SOURCE, EDIT_VALIDATION_STATUS } from './editStatuses.js';

/**
 * Create an edit history for one or more generations.
 *
 * @param {Object} [input]
 * @param {Array<Object>} [input.records] — edit records already stored (e.g. read
 *   back from the entity), which this history continues to append to
 * @param {Array<Object>} [input.generations] — the generation records the copies
 *   are edited from and validated against
 * @returns {Object} the store: appendEdit, appendRevert, and the audit queries
 */
export function createEditHistory({ records = [], generations = [] } = {}) {
  const written = [];
  for (const record of Array.isArray(records) ? records : []) {
    if (record && typeof record === 'object' && record.edit_id) written.push(record);
  }

  const generationRecords = (Array.isArray(generations) ? generations : [])
    .filter((record) => record && typeof record === 'object' && record.generation_id);

  /**
   * The generation a copy edits. Only a valid generation has a copy to edit: an
   * attempt that did not pass validation is regenerated, never patched into an
   * approved copy through the back door.
   */
  function baseGeneration(generationId) {
    const generation = generationById(generationRecords, generationId);
    if (!generation) {
      throw new Error(
        `An edit is made against a generation in this history: ${generationId} is not one of them.`,
      );
    }
    if (generation.status !== GENERATION_STATUS.VALID_GENERATED) {
      throw new Error(
        `Generation ${generation.generation_id} is ${generation.status}: only a valid generation is edited, because only a valid generation holds a copy that passed the writer contract.`,
      );
    }
    if (!generatedCopy(generation)) {
      throw new Error(`Generation ${generation.generation_id} carries no GPT output to edit.`);
    }
    return generation;
  }

  /** The one write path: validate the copy, then append the record it produced. */
  function append({
    generation,
    editedSections,
    editedBy,
    editedAt,
    createdAt,
    editSource,
    baseEditId,
    editId,
  }) {
    const validation = validateEditedCopy({ generation, editedSections });

    const chain = editsForGeneration(written, generation.generation_id);
    const number = chain.reduce((highest, record) => Math.max(highest, Number(record.edit_number) || 0), 0) + 1;

    if (editId && editById(written, editId)) {
      throw new Error(
        `Edit ${editId} is already stored. An edit record is never overwritten: a further edit creates a new record.`,
      );
    }

    const record = buildEditRecord({
      generationId: generation.generation_id,
      proposalId: generation.proposal_id,
      draftProposalId: generation.draft_proposal_id,
      projectId: generation.project_id,
      accountId: generation.account_id,
      editedSections,
      editSource,
      baseEditId,
      editedBy,
      editedAt,
      createdAt,
      baseGenerationFingerprint: generation.record_fingerprint,
      basePackFingerprint: generation.evidence_pack_fingerprint,
      validation,
      editNumber: number,
      editId,
    });

    if (editById(written, record.edit_id)) {
      throw new Error(
        `Edit ${record.edit_id} is already stored. An edit record is never overwritten: a further edit creates a new record.`,
      );
    }

    written.push(record);
    return record;
  }

  return {
    /**
     * Save one manual edit: the designer's own copy of the proposal sections.
     *
     * @throws when the generation is not in this history, is not a valid
     *   generation, or when the copy it would create is already stored
     */
    appendEdit({
      generationId,
      editedSections,
      editedBy,
      editedAt = null,
      createdAt = null,
      editId = null,
    } = {}) {
      return append({
        generation: baseGeneration(generationId),
        editedSections,
        editedBy,
        editedAt,
        createdAt,
        editSource: EDIT_SOURCE.MANUAL,
        baseEditId: null,
        editId,
      });
    },

    /**
     * Revert to a copy that already passed validation: the original generated
     * copy, or a stored valid edit. The sections are taken from that copy, so a
     * revert cannot carry wording of its own, and it is appended as a new record —
     * the copy it restores, and every edit before it, are left exactly as they
     * were.
     *
     * @param {string} [input.toEditId] — the edit to restore; omit to revert to
     *   the original generated copy
     * @throws when the generation is not valid, or the edit to restore is not in
     *   this history, belongs to another generation, or did not pass validation
     */
    appendRevert({
      generationId,
      toEditId = null,
      editedBy,
      editedAt = null,
      createdAt = null,
      editId = null,
    } = {}) {
      const generation = baseGeneration(generationId);
      const baseEditId = toEditId ?? null;

      let sections = null;
      if (baseEditId) {
        const target = editById(written, baseEditId);
        if (!target) {
          throw new Error(
            `A revert restores an edit in this history: ${baseEditId} is not one of them.`,
          );
        }
        if (target.generation_id !== generation.generation_id) {
          throw new Error('A revert stays within one generation: the edit it points at belongs to another generation.');
        }
        if (target.validation_status !== EDIT_VALIDATION_STATUS.VALID) {
          throw new Error(
            `Edit ${baseEditId} is ${target.validation_status}: a revert restores a copy that passed validation.`,
          );
        }
        sections = editCopy(target);
      } else {
        sections = generatedCopy(generation);
        if (!sections) {
          throw new Error('A revert to the generated copy needs the frozen GPT output of a valid generation.');
        }
      }

      return append({
        generation,
        editedSections: sections,
        editedBy,
        editedAt,
        createdAt,
        editSource: EDIT_SOURCE.REVERT,
        baseEditId,
        editId,
      });
    },

    /** Every edit appended so far, oldest first. */
    records() {
      return [...written];
    },

    /** One edit by ID. */
    byId(editId) {
      return editById(written, editId);
    },

    /** Every edit of one generation, oldest first. */
    forGeneration(generationId) {
      return editsForGeneration(written, generationId);
    },

    /** The newest edit that passed validation, and only that one. */
    latestValid(generationId) {
      return latestValidEdit(written, generationId);
    },

    /** The copies that need review, newest first. */
    needsReview(generationId = null) {
      return editsNeedingReview(written, generationId);
    },

    /** The validation result of one edit. */
    validationOf(editId) {
      return editValidationResult(written, editId);
    },

    /** Whether one edit, judged on its own, may be issued. */
    editIssueGate(editId) {
      return editIssueGate(written, editId);
    },

    /** The copy there is to render for a generation, and where it comes from. */
    renderableCopy(generationId) {
      return renderableProposalCopy({
        generation: generationById(generationRecords, generationId),
        edits: written,
      });
    },

    /** Whether this generation may be issued, exported, completed or sent. */
    issueGate(generationId) {
      return proposalIssueGate({
        generationRecords,
        editRecords: written,
        generationId,
      });
    },
  };
}

export default createEditHistory;