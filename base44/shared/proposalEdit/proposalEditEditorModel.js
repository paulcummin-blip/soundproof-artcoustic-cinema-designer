/**
 * proposalEditEditorModel.js (shared)
 * ------------------------------------
 * THE model the Proposal Editor's copy surface is rendered from.
 *
 * It is resolved here, once, rather than in the browser, for two reasons: the
 * rules are the Phase 3 and Phase 4 rules, and there is exactly one copy of them;
 * and the things an editor must never be able to supply — the claim IDs a section
 * stands on, the contract's section order, the evidence fingerprints — are read
 * from the frozen records on the server and sent to the browser either read-only
 * or not at all.
 *
 * It answers five questions in one shape:
 *
 *   what copy is there to show   the latest valid edit, else the validated GPT
 *                                output — the same rule the render and the export
 *                                use, so the screen and the PDF cannot disagree
 *   what may be edited           the contract's nine sections, in the contract's
 *                                order, each with its text and word limit
 *   whether it may be issued     the shared Phase 3 + Phase 4 gate, unchanged
 *   how it reads to a designer   plain-language status, issues and block reason
 *   what the audit shows         the generation and every edit, for authorised
 *                                users only — never for a client-facing page
 *
 * It decides nothing itself: validity, supersession and the gate are the shared
 * modules' answers. Pure — no React, no SDK, no runtime-specific APIs.
 */

import {
  WRITER_SECTIONS,
  WRITER_SECTION_IDS,
} from '../proposalWriter/writerContractSchema.js';
import { GENERATION_STATUS } from '../proposalGeneration/generationStatuses.js';
import {
  generationStatusOf,
  generationsForProposal,
  generationsNeedingReview,
  latestValidGeneration,
} from '../proposalGeneration/proposalGenerationHistory.js';
import { EDIT_GATE_REASON, EDIT_SOURCE, EDIT_VALIDATION_STATUS } from './editStatuses.js';
import {
  editsForGeneration,
  latestEdit,
  proposalIssueGate,
  renderableProposalCopy,
} from './proposalEditHistory.js';
import { generatedCopy } from './proposalEditCopy.js';
import {
  LEGACY_MESSAGE,
  LEGACY_TITLE,
  LATEST_EDIT_INVALID_SENTENCE,
  NO_VALID_COPY_SENTENCE,
  NOT_VALIDATED_SENTENCE,
  REVIEW_LABEL,
  SUPERSEDED_SENTENCE,
  generationFailureSentence,
  plainIssues,
  validationStatusLabel,
} from './proposalEditEditorCopy.js';

/** Which surface the editor shows for a proposal's copy. */
export const EDITOR_MODE = Object.freeze({
  /** No generation history: a legacy/manual proposal, edited as it always was. */
  LEGACY: 'legacy',
  /** Attempts exist but none passed validation: there is no copy to edit yet. */
  NO_VALID_GENERATION: 'no_valid_generation',
  /** A validated copy exists: it can be read, edited, reverted and issued. */
  EDIT_LAYER: 'edit_layer',
});

const EDIT_SOURCE_LABEL = Object.freeze({
  [EDIT_SOURCE.MANUAL]: 'Edited by hand',
  [EDIT_SOURCE.REVERT]: 'Reverted',
});

/** The nine contract sections as editable fields, in the contract's order. */
export function editableSectionFields(sections) {
  const list = Array.isArray(sections) ? sections : [];
  return WRITER_SECTIONS.map((def) => {
    const found = list.find((entry) => entry?.section === def.section) || null;
    return {
      section: def.section,
      title: def.title,
      word_limit: def.word_limit,
      text: typeof found?.text === 'string' ? found.text : '',
      // Read-only: shown so the designer can see a section is grounded, never
      // accepted back from the browser as a value.
      claim_ids: Array.isArray(found?.claim_ids) ? [...found.claim_ids] : [],
      present: Boolean(found),
    };
  });
}

/** How many words a section's text holds. */
export function wordCountOf(text) {
  const trimmed = typeof text === 'string' ? text.trim() : '';
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

const claimIdsOf = (sections, section) => {
  const found = (Array.isArray(sections) ? sections : [])
    .find((entry) => entry?.section === section) || null;
  return Array.isArray(found?.claim_ids) ? found.claim_ids : [];
};

const textOf = (sections, section) => {
  const found = (Array.isArray(sections) ? sections : [])
    .find((entry) => entry?.section === section) || null;
  return typeof found?.text === 'string' ? found.text : '';
};

/**
 * The copy a save submits: the contract's nine sections, in the contract's order,
 * carrying the designer's wording and the evidence the copy already stood on.
 *
 * Every value that is not the designer's own wording is taken from the frozen
 * records, never from the caller:
 *   - the text comes from the drafts, falling back to the copy being edited;
 *   - the claim IDs are the union of the generated copy's and the edited copy's,
 *     so a save can neither drop grounding nor re-ground a section from the form.
 */
export function composeEditedSections({
  generatedSections = [],
  currentSections = [],
  drafts = {},
} = {}) {
  const submitted = drafts && typeof drafts === 'object' ? drafts : {};

  return WRITER_SECTION_IDS.map((section) => {
    const draft = submitted[section];
    const claimIds = new Set([
      ...claimIdsOf(generatedSections, section),
      ...claimIdsOf(currentSections, section),
    ]);
    return {
      section,
      text: typeof draft === 'string'
        ? draft
        : (textOf(currentSections, section) || textOf(generatedSections, section)),
      claim_ids: [...claimIds],
    };
  });
}

/** Why a copy cannot be issued, in the designer's words. */
function blockSentence({ gate, generation, generationRecords }) {
  if (gate?.reason === EDIT_GATE_REASON.LATEST_EDIT_INVALID) return LATEST_EDIT_INVALID_SENTENCE;
  const status = generationStatusOf(generation, generationRecords);
  if (status === GENERATION_STATUS.SUPERSEDED) return SUPERSEDED_SENTENCE;
  return NOT_VALIDATED_SENTENCE;
}

/** The audit view: the generation, every edit, and nothing a client would see. */
function auditBlock({ generation, edits, generationRecords, canViewAudit }) {
  if (!canViewAudit || !generation) return null;
  return {
    generation: {
      generation_id: generation.generation_id,
      generation_number: generation.generation_number ?? null,
      status: generationStatusOf(generation, generationRecords),
      created_at: generation.created_at ?? null,
      created_by: generation.created_by ?? null,
      provider: generation.provider ?? null,
      model: generation.model ?? null,
      contract_version: generation.contract_version ?? null,
      prompt_version: generation.prompt_version ?? null,
      evidence_pack_fingerprint: generation.evidence_pack_fingerprint ?? null,
      record_fingerprint: generation.record_fingerprint ?? null,
      visual_report_snapshot_ids: generation.visual_report_snapshot_ids || [],
      technical_report_snapshot_ids: generation.technical_report_snapshot_ids || [],
    },
    edits: edits.map((record) => ({
      edit_id: record.edit_id,
      edit_number: record.edit_number ?? null,
      source: EDIT_SOURCE_LABEL[record.edit_source] || 'Edited',
      status: validationStatusLabel(record.validation_status),
      valid: record.validation_status === EDIT_VALIDATION_STATUS.VALID,
      editor: record.edited_by ?? null,
      edited_at: record.edited_at ?? null,
      restore_of: record.base_edit_id || null,
      base_generation_fingerprint: record.base_generation_fingerprint ?? null,
      edit_fingerprint: record.edit_fingerprint ?? null,
    })),
  };
}

/**
 * The editor's copy layer for one proposal.
 *
 * @param {Object} [input]
 * @param {Array<Object>} [input.generationRecords] — every generation attempt known
 * @param {Array<Object>} [input.editRecords] — every edit record known
 * @param {string|null} [input.proposalId] — the saved proposal
 * @param {string|null} [input.draftProposalId] — the draft identity, before it is saved
 * @param {boolean} [input.canViewAudit] — whether this user may see the audit block
 * @returns {Object} the JSON-safe model the editor renders
 */
export function resolveEditorLayer({
  generationRecords = [],
  editRecords = [],
  proposalId = null,
  draftProposalId = null,
  canViewAudit = false,
} = {}) {
  const generations = generationsForProposal(generationRecords, { proposalId, draftProposalId });

  // Nothing generated, ever: a legacy/manual proposal. It is never blocked — it
  // has no generated copy to hold to a gate — and it stays fully editable.
  if (generations.length === 0) {
    return {
      mode: EDITOR_MODE.LEGACY,
      legacy: true,
      has_history: false,
      title: LEGACY_TITLE,
      message: LEGACY_MESSAGE,
      generation: null,
      generation_status: null,
      fields: [],
      copy: null,
      export_source: null,
      export_sections: null,
      status: null,
      status_label: null,
      ready: false,
      gate: null,
      blocking_edit: null,
      blocked_issues: [],
      failures: [],
      revert_targets: [],
      export_blocked_reason: null,
      audit: null,
    };
  }

  const failures = generationsNeedingReview(generations).map((record) => ({
    generation_id: record.generation_id,
    generation_number: record.generation_number ?? null,
    status: record.status,
    created_at: record.created_at ?? null,
    sentence: generationFailureSentence(record.status),
  }));

  const generation = latestValidGeneration(generations, null);

  if (!generation) {
    return {
      mode: EDITOR_MODE.NO_VALID_GENERATION,
      legacy: false,
      has_history: true,
      title: REVIEW_LABEL,
      message: NO_VALID_COPY_SENTENCE,
      generation: null,
      generation_status: null,
      fields: [],
      copy: null,
      export_source: null,
      export_sections: null,
      status: null,
      status_label: null,
      ready: false,
      gate: null,
      blocking_edit: null,
      blocked_issues: [],
      failures,
      revert_targets: [],
      export_blocked_reason: NO_VALID_COPY_SENTENCE,
      audit: auditBlock({ generation: null, edits: [], generationRecords: generations, canViewAudit }),
    };
  }

  const edits = editsForGeneration(editRecords, generation.generation_id);
  const copy = renderableProposalCopy({ generation, edits });
  const gate = proposalIssueGate({
    generationRecords: generations,
    editRecords: edits,
    generationId: generation.generation_id,
  });

  // The newest edit decides the gate, so an invalid one at the head of the chain
  // is what blocks — even where an earlier valid copy is still shown and can be
  // reverted to.
  const blockingEdit = copy.blocked_by_latest_edit ? latestEdit(edits, generation.generation_id) : null;
  const status = blockingEdit ? blockingEdit.validation_status : EDIT_VALIDATION_STATUS.VALID;

  return {
    mode: EDITOR_MODE.EDIT_LAYER,
    legacy: false,
    has_history: true,
    title: validationStatusLabel(status),
    message: null,
    generation: { generation_id: generation.generation_id },
    generation_status: generationStatusOf(generation, generations),
    fields: editableSectionFields(copy.copy),
    copy: { source: copy.source, sections: copy.copy },
    export_source: copy.source,
    export_sections: copy.copy,
    status,
    status_label: validationStatusLabel(status),
    ready: gate.issuable,
    gate: {
      issuable: gate.issuable,
      reason: gate.reason,
      source: gate.source,
      edit_id: gate.edit_id,
      status: gate.status,
    },
    blocking_edit: blockingEdit
      ? {
        edit_id: blockingEdit.edit_id,
        edit_number: blockingEdit.edit_number ?? null,
        editor: blockingEdit.edited_by ?? null,
        edited_at: blockingEdit.edited_at ?? null,
        status: blockingEdit.validation_status,
      }
      : null,
    blocked_issues: blockingEdit ? plainIssues(blockingEdit.validation_errors) : [],
    failures,
    // The copies a revert may restore: the original generated copy, and every
    // edit that passed validation. An invalid copy is never offered as a target.
    revert_targets: [
      { edit_id: null, edit_number: null, edited_at: null },
      ...edits
        .filter((record) => record.validation_status === EDIT_VALIDATION_STATUS.VALID)
        .map((record) => ({
          edit_id: record.edit_id,
          edit_number: record.edit_number ?? null,
          edited_at: record.edited_at ?? null,
        })),
    ],
    export_blocked_reason: gate.issuable
      ? null
      : blockSentence({ gate, generation, generationRecords: generations }),
    audit: auditBlock({ generation, edits, generationRecords: generations, canViewAudit }),
  };
}

/** The base copy a save composes from: the generated output of the generation. */
export function generatedSectionsOf(generation) {
  return generatedCopy(generation) || [];
}