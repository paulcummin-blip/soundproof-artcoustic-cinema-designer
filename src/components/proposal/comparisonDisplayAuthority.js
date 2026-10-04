// One presentation ordering for the editor, at-a-glance and printed table.
// Stored values remain unchanged; column order is by exact saved name.
export function resolveComparisonDisplay(rows, versions, fallback = null) {
  const sourceRows = rows?.length ? rows : fallback?.rows || [];
  const sourceVersions = versions?.length ? versions : fallback?.versions || [];
  const order = sourceVersions.map((version, index) => ({ version, index })).sort((a, b) =>
    String(a.version.version_name || '').localeCompare(String(b.version.version_name || ''), undefined, { numeric: true }));
  const splitPackage = sourceRows.some((row) => row.key === 'lcr');
  return {
    versions: order.map(({ version }) => version),
    rows: sourceRows.filter((row) => !(splitPackage && row.key === 'speakers')).map((row) => ({
      ...row,
      values: order.map(({ index }) => row.values?.[index] || 'Not assessed'),
      // Changes are displayed as a meaning, not a directional delta whose column
      // order might have changed. Matching areas always remain visible.
      change: row.identical ? 'No change' : 'Values differ',
    })),
  };
}
export default resolveComparisonDisplay;