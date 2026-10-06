// Storage contract only: no calculations or automatic historical backfill.
export const COMPARISON_REGENERATION_REQUIRED = 'Comparison evidence requires regeneration. Create a new comparison revision from both versions; the existing report is unchanged.';

export function isCompleteComparisonTable(table, ids = []) {
  const columns = table?.versions || [];
  return columns.length >= 2 && new Set(columns.map(c => c.version_id)).size === columns.length
    && columns.every(c => c.version_id && (c.version_name || c.label))
    && (!ids.length || (ids.length === columns.length && ids.every((id, i) => id === columns[i].version_id)))
    && table?.rows?.length > 0
    && table.rows.every(r => r.values?.length === columns.length && r.values.every(v => typeof v === 'string' && v.trim()));
}

export function comparisonSectionMetadata(table, metadata = {}) {
  return { ...metadata, comparison: true, comparison_versions: table.versions, comparison_rows: table.rows };
}

function stableJson(value) {
  return JSON.stringify(value, (_key, entry) => entry && typeof entry === 'object' && !Array.isArray(entry)
    ? Object.fromEntries(Object.keys(entry).sort().map(key => [key, entry[key]])) : entry);
}

export async function verifyComparisonPersisted(base44, proposalId, table, evidence, sectionId = null) {
  const saved = await base44.entities.Proposal.get(proposalId);
  if (!isCompleteComparisonTable(saved?.metadata?.comparison_table, saved?.selected_version_ids)
    || stableJson(saved.metadata.comparison_table) !== stableJson(table)
    || stableJson(saved.metadata.selected_versions) !== stableJson(evidence)) {
    throw new Error('Comparison evidence did not survive storage. No completed comparison can be issued.');
  }
  if (sectionId) {
    const section = await base44.entities.ProposalSection.get(sectionId);
    if (stableJson(section?.metadata?.comparison_rows) !== stableJson(table.rows)
      || stableJson(section?.metadata?.comparison_versions) !== stableJson(table.versions)) {
      throw new Error('Key Differences evidence did not survive storage.');
    }
  }
  return saved;
}