// One presentation shape for the comparison table in the editor, the at-a-glance
// page and the printed pack. Stored values are never altered: the report's own
// version order is kept, so a stored derived change always matches the columns
// printed beside it.
export function resolveComparisonDisplay(rows, versions, fallback = null) {
  const sourceRows = rows?.length ? rows : fallback?.rows || [];
  const sourceVersions = versions?.length ? versions : fallback?.versions || [];
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