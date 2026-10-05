// One presentation shape for the comparison table in the editor, the at-a-glance
// page and the printed pack. Stored values are never altered: the report's own
// version order is kept, so a stored derived change always matches the columns
// printed beside it.
export function isCompleteComparisonTable(table, ids = []) {
  const columns = table?.versions || [];
  return columns.length >= 2 && new Set(columns.map(c => c.version_id)).size === columns.length
    && columns.every(c => c.version_id && (c.version_name || c.label))
    && (!ids.length || (ids.length === columns.length && ids.every((id, i) => id === columns[i].version_id)))
    && table?.rows?.length > 0
    && table.rows.every(r => r.values?.length === columns.length && r.values.every(v => typeof v === 'string' && v.trim()));
}

export function resolveProposalComparison(proposal, sections = [], recovery = null) {
  const section = sections.find(s => s.section_type === 'key_performance_highlights');
  const sectionTable = { rows: section?.metadata?.comparison_rows, versions: section?.metadata?.comparison_versions };
  const candidates = [proposal?.metadata?.comparison_table, sectionTable, recovery];
  const source = candidates.find(table => isCompleteComparisonTable(table, proposal?.selected_version_ids || []));
  return resolveComparisonDisplay(source?.rows, source?.versions);
}

export function resolveComparisonDisplay(rows, versions, fallback = null) {
  // Choose an atomic pair: never mix stored rows with recovered columns.
  const primary = { rows, versions };
  const source = isCompleteComparisonTable(primary) ? primary
    : isCompleteComparisonTable(fallback) ? fallback : { rows: [], versions: [] };
  const sourceRows = source.rows;
  const sourceVersions = source.versions;
  // A table that carries the per-group equipment rows shows those instead of the
  // single combined speaker line, which would restate the same specification.
  const splitEquipment = sourceRows.some((row) => row.key === 'lcr');
  return {
    versions: sourceVersions,
    rows: sourceRows
      .filter((row) => !(splitEquipment && row.key === 'speakers'))
      .map((row) => ({ ...row, values: row.values || [] })),
  };
}
export default resolveComparisonDisplay;