import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { createEditHistory } from '../../shared/proposalEdit/proposalEditRepository.js';
import { editEntityPayload } from '../../shared/proposalEdit/proposalEditEntity.js';
import {
  composeEditedSections,
  generatedSectionsOf,
  resolveEditorLayer,
} from '../../shared/proposalEdit/proposalEditEditorModel.js';
import { EDIT_SOURCE, EDIT_SOURCES, EDIT_VALIDATION_STATUS } from '../../shared/proposalEdit/editStatuses.js';

/**
 * Append one edit of a proposal's generated copy — the only write path into the
 * edit layer.
 *
 * The designer submits wording, and nothing else. The copy is composed here from
 * the frozen records: the contract's nine sections in the contract's order, the
 * submitted wording for each, and the claim IDs the copy already stood on (the
 * union of the generated copy's and the edited copy's), so a save can neither
 * drop the evidence behind a section nor re-ground one from the browser.
 *
 * The composed copy is then validated by the store against the frozen GPT input
 * of generation it edits, by the same Phase 2 writer contract the GPT draft was
 * held to. The record's status is derived from that validation and is never
 * supplied by the caller, so an unchecked copy cannot be filed and an invalid one
 * cannot declare itself valid. An invalid copy is retained for review and is
 * blocked from issue, export, completion and sending by the same shared gate the
 * editor reads.
 *
 * Nothing is overwritten: each save, correction or revert appends a new
 * ProposalEdit record, and the generation record and every earlier edit are left
 * exactly as they were. A revert takes its sections from the copy being restored
 * — the original generated output or a stored valid edit — never from the caller.
 *
 * Reads and writes use the caller's own session, so an account can only ever edit
 * its own proposal's copy. No GPT call is made here.
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { generation_id, drafts, edit_source, to_edit_id } = body || {};

    if (!generation_id) {
      return Response.json({ error: 'generation_id required' }, { status: 400 });
    }

    const source = EDIT_SOURCES.includes(edit_source) ? edit_source : EDIT_SOURCE.MANUAL;

    const generationResult = await base44.entities.ProposalGeneration.filter({ generation_id });
    const generation = (Array.isArray(generationResult) ? generationResult : (generationResult?.items || []))[0];
    if (!generation) {
      return Response.json({ error: 'That generation attempt was not found.' }, { status: 404 });
    }

    const editResult = await base44.entities.ProposalEdit.filter({ generation_id });
    const storedEdits = Array.isArray(editResult) ? editResult : (editResult?.items || []);

    const history = createEditHistory({ records: storedEdits, generations: [generation] });

    const editedBy = user.full_name || user.email || 'Unknown user';
    const editedAt = new Date().toISOString();

    let record = null;
    try {
      if (source === EDIT_SOURCE.REVERT) {
        record = history.appendRevert({
          generationId: generation_id,
          toEditId: to_edit_id ?? null,
          editedBy,
          editedAt,
        });
      } else {
        // Compose from the records: the copy the designer was looking at is the
        // renderable copy, and its grounding is carried, never accepted.
        const currentCopy = resolveEditorLayer({
          generationRecords: [generation],
          editRecords: storedEdits,
          proposalId: generation.proposal_id ?? null,
          draftProposalId: generation.draft_proposal_id ?? null,
        });

        const editedSections = composeEditedSections({
          generatedSections: generatedSectionsOf(generation),
          currentSections: currentCopy.export_sections || [],
          drafts,
        });

        record = history.appendEdit({
          generationId: generation_id,
          editedSections,
          editedBy,
          editedAt,
        });
      }
    } catch (writeError) {
      const message = writeError?.message || 'The edit could not be saved.';
      const alreadyStored = /already stored/.test(message);
      return Response.json({ error: message }, { status: alreadyStored ? 409 : 400 });
    }

    const created = await base44.entities.ProposalEdit.create(
      editEntityPayload({ record, accountId: generation.account_id ?? null }),
    );

    return Response.json({
      ok: true,
      edit_id: record.edit_id,
      edit_number: record.edit_number,
      edit_source: record.edit_source,
      validation_status: record.validation_status,
      valid: record.validation_status === EDIT_VALIDATION_STATUS.VALID,
      validation_errors: record.validation_errors,
      edited_at: record.edited_at,
      record: created,
    });
  } catch (error) {
    return Response.json({ error: error?.message || 'The edit could not be saved.' }, { status: 500 });
  }
}