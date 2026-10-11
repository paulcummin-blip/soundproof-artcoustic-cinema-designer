import { validateCompleteDocument } from './completeDocumentValidation.js';
import { buildOptionGuidance } from '../proposalWriter/writerOptionGuidance.js';

async function records(entity, query) {
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
export async function readCompleteDocument(entities, proposal) {
  const query = { proposal_id: proposal.id };
  const [sections, generationRecords, editRecords, assets] = await Promise.all([
    records(entities.ProposalSection, query), records(entities.ProposalGeneration, query),
    records(entities.ProposalEdit, query), records(entities.ProposalAsset, { project_id: proposal.project_id }),
  ]);
  const ids = proposal.selected_version_ids?.length ? proposal.selected_version_ids : [proposal.version_id].filter(Boolean);
  const eligible = assets.filter(asset => asset.scope !== 'version' || ids.includes(asset.version_id));
  return validateCompleteDocument({ proposal, sections, generationRecords, editRecords,
    optionGuidance: buildOptionGuidance(eligible), privateNotes: eligible.map(asset => asset.comparison_note) });
}