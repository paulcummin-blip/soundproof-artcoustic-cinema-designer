export function computeSeatRoles(seats) {
  // group by rowNumber (default 1)
  const byRow = new Map();
  for (const s of seats) {
    const key = s.rowNumber ?? 1;
    const arr = byRow.get(key) || [];
    arr.push(s);
    byRow.set(key, arr);
  }

  // work row-by-row: sort left→right by x, mark extremes as secondary
  const enriched = [];
  for (const [, row] of byRow) {
    const sorted = [...row].sort((a,b) => a.x - b.x);
    const n = sorted.length;

    if (n === 1) {
      // single seat: primary
      enriched.push({ ...sorted[0], isPrimary: true, isSecondary: false });
      continue;
    }

    // If n === 2, both are outer seats → both secondary.
    // For 3+, mark only the two extremes as secondary; the rest primary.
    for (let i = 0; i < n; i++) {
      const isEdge = (i === 0 || i === n - 1);
      const isSecondary = isEdge;
      const isPrimary = !isSecondary && n >= 3; // middle seats only
      enriched.push({ ...sorted[i], isPrimary, isSecondary });
    }
  }

  // If we ended up with no primary seats (e.g. all rows had 1 or 2 seats),
  // promote all seats to primary so calculations still have a target.
  const hasPrimary = enriched.some(s => s.isPrimary);
  if (!hasPrimary) {
    return enriched.map(s => ({ ...s, isPrimary: true, isSecondary: false }));
  }
  return enriched;
}