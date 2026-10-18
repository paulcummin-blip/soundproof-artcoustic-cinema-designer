import { composeWriterSectionBodies } from '../proposalWriter/writerSectionMapping.js';

function asRows(result) {
  return Array.isArray(result) ? result : (result?.items || []);
}

export function publicationRevisionMetadata(metadata, {
  generationId = null,
  editId = null,
  appliedAt = null,
  source = 'generated',
} = {}) {
  return {
    ...(metadata || {}),
    publication_revision: {
      generation_id: generationId,
      edit_id: editId,
      revision_id: editId || generationId || null,
      source,
      applied_at: appliedAt,
    },
  };
}

/**
 * Hand a validated writer revision into the stored ProposalSection rows.
 * The proposal page, approval authority and export validator then read the same
 * revision. Existing approvals are retained as audit history but stop counting
 * automatically whenever the exact content fingerprint changes.
 */
export async function applyProposalRevision({
  entities,
  proposalId,
  sections,
  mode = 'single',
  generationId = null,
  editId = null,
  appliedAt = new Date().toISOString(),
  source = editId ? 'edit' : 'generated',
  sectionPatchByType = null,
} = {}) {
  if (!entities || !proposalId || !generationId || !Array.isArray(sections)) {
    throw new Error('A proposal, generation and validated section list are required for publication handoff.');
  }

  const page = await entities.ProposalSection.filter({ proposal_id: proposalId }, { limit: 50 });
  const stored = asRows(page);
  const mapped = composeWriterSectionBodies({ output: { sections }, mode });
  if (mapped.unmapped.length > 0) {
    throw new Error(`Validated copy has no proposal section: ${mapped.unmapped.join(', ')}`);
  }

  const updated = [];
  for (const body of mapped.bodies) {
    const record = stored.find((row) => row.section_type === body.section_type) || null;
    if (!record) throw new Error(`Proposal section is missing: ${body.section_type}`);
    const targetedPatch = sectionPatchByType?.[record.section_type] || null;
    const baseMetadata = targetedPatch?.metadata ?? record.metadata;
    await entities.ProposalSection.update(record.id, {
      body: body.html,
      // Normal editor saves retain their existing behaviour. A caller that is
      // publishing one generated editorial change supplies the exact section
      // patch instead, so unchanged sections keep their approval timestamps.
      ...(targetedPatch || (editId
        ? { last_user_edited_at: appliedAt }
        : { last_gpt_generated_at: appliedAt })),
      metadata: publicationRevisionMetadata(baseMetadata, {
        generationId,
        editId,
        appliedAt,
        source,
      }),
    });
    updated.push({ section_id: record.id, section_type: record.section_type });
  }

  return {
    proposal_id: proposalId,
    generation_id: generationId,
    edit_id: editId,
    revision_id: editId || generationId,
    updated,
  };
}

export default applyProposalRevision;
