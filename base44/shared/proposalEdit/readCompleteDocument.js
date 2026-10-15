import { validateCompleteDocument } from './completeDocumentValidation.js';
import { buildOptionGuidance } from '../proposalWriter/writerOptionGuidance.js';

export async function readProposalRecords(entity, query) {
  const rows = [];
  let cursor;
  do {
    const page = await entity.filter(query, { limit: 50, cursor });
    if (Array.isArray(page)) return page;
    rows.push(...(page.items || []));
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return rows;
}

/** All reads are caller-scoped. This never changes historical records. */
export async function readCompleteDocument(entities, proposal, history = {}) {
  const query = { proposal_id: proposal.id };
  const [sections, generationRecords, editRecords, assets] = await Promise.all([
    readProposalRecords(entities.ProposalSection, query), history.generationRecords || readProposalRecords(entities.ProposalGeneration, query),
    history.editRecords || readProposalRecords(entities.ProposalEdit, query), readProposalRecords(entities.ProposalAsset, { project_id: proposal.project_id }),
  ]);
  const ids = proposal.selected_version_ids?.length ? proposal.selected_version_ids : [proposal.version_id].filter(Boolean);
  const eligible = assets.filter(asset => asset.scope !== 'version' || ids.includes(asset.version_id));
  const validation = validateCompleteDocument({ proposal, sections, generationRecords, editRecords,
    optionGuidance: buildOptionGuidance(eligible), privateNotes: eligible.map(asset => asset.comparison_note),
    publishedAssetText: eligible.filter(asset => asset.usage !== 'do_not_use' && asset.proposal_importance !== 'Do Not Use')
      .flatMap(asset => [asset.caption, asset.comparison_option_label, asset.comparison_group]) });
  // The stored rows travel with the validation. Whether a section's approval still
  // counts is judged against BOTH the wording the document publishes and the wording
  // the editor shows, and only the stored record carries the second of those — so
  // the approval authority is given it here rather than re-reading the rows.
  return { ...validation, sections };
}