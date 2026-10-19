import { latestValidGeneration } from '../proposalGeneration/proposalGenerationHistory.js';
import { createEditHistory } from './proposalEditRepository.js';
import { editEntityPayload } from './proposalEditEntity.js';
import {
  composeEditedSections,
  frozenProposalMode,
  generatedSectionsOf,
  resolveEditorLayer,
} from './proposalEditEditorModel.js';
import { EDIT_VALIDATION_STATUS } from './editStatuses.js';
import { applyProposalRevision } from './proposalRevisionHandoff.js';
import { writerDraftsFromProposalSectionBody } from '../proposalWriter/writerSectionMapping.js';

function asRows(result) {
  return Array.isArray(result) ? result : (result?.items || []);
}

function editorName(user) {
  return user?.full_name || user?.email || 'Unknown user';
}

/**
 * Persist one accepted ADI proposal-section rewrite as a validated proposal
 * revision, then hand that exact revision to the stored page.
 *
 * Validation happens before the first entity write. A candidate that does not
 * pass the frozen writer contract therefore leaves the section, its approval and
 * the append-only edit history untouched.
 */
export async function persistAdiProposalSectionRevision({
  entities,
  proposalId,
  section,
  body,
  sectionPatch,
  user = null,
  now = new Date().toISOString(),
  source = 'adi',
  validateOnly = false,
} = {}) {
  if (!entities?.ProposalGeneration?.filter
    || !entities?.ProposalEdit?.filter
    || !entities?.ProposalEdit?.create) {
    throw new Error('The proposal revision authority is not available.');
  }
  if (!proposalId || !section?.id || !section?.section_type || typeof body !== 'string') {
    throw new Error('A proposal section and its accepted wording are required.');
  }

  const generationRows = asRows(await entities.ProposalGeneration.filter(
    { proposal_id: proposalId },
    { limit: 50 },
  ));
  const generation = latestValidGeneration(generationRows, { proposalId });
  if (!generation) {
    throw new Error('No validated proposal generation is available for this wording.');
  }

  const editRows = asRows(await entities.ProposalEdit.filter(
    { generation_id: generation.generation_id },
    { limit: 500 },
  ));
  const current = resolveEditorLayer({
    generationRecords: generationRows,
    editRecords: editRows,
    proposalId,
  });
  if (!Array.isArray(current.export_sections)) {
    throw new Error('The current validated proposal copy could not be read.');
  }

  const mode = frozenProposalMode(generation);
  let drafts;
  try {
    drafts = writerDraftsFromProposalSectionBody({
      sectionType: section.section_type, body, mode,
    });
  } catch (error) {
    return {
      accepted: false,
      violations: [{ code: 'required_section_structure', detail: error.message }],
      section: null,
    };
  }
  const editedSections = composeEditedSections({
    generatedSections: generatedSectionsOf(generation),
    currentSections: current.export_sections,
    drafts,
  });

  const history = createEditHistory({ records: editRows, generations: generationRows });
  const record = history.appendEdit({
    generationId: generation.generation_id,
    editedSections,
    editedBy: editorName(user),
    editedAt: now,
  });

  if (record.validation_status !== EDIT_VALIDATION_STATUS.VALID) {
    return {
      accepted: false,
      validation_status: record.validation_status,
      violations: record.validation_errors || [],
      record,
      section: null,
    };
  }

  if (validateOnly) return {
    accepted: true, violations: [], record, section: null,
  };

  await entities.ProposalEdit.create(
    editEntityPayload({ record, accountId: generation.account_id ?? null }),
  );
  await applyProposalRevision({
    entities,
    proposalId,
    sections: record.edited_sections,
    mode,
    generationId: generation.generation_id,
    editId: record.edit_id,
    appliedAt: now,
    source,
    sectionPatchByType: {
      [section.section_type]: sectionPatch,
    },
  });

  const refreshed = asRows(await entities.ProposalSection.filter({ id: section.id }, { limit: 1 }))[0] || null;
  return {
    accepted: true,
    validation_status: record.validation_status,
    violations: [],
    record,
    section: refreshed,
  };
}

export default persistAdiProposalSectionRevision;
