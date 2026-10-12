/** The measured browser compositor's shared allocation decision for every content kind. */
export function measuredPartition(units, probe, { append, measure }) {
  const count = units.length;
  const best = Array(count + 1).fill(null);
  best[count] = { sheets: 0, penalty: 0, ranges: [] };
  for (let start = count - 1; start >= 0; start -= 1) {
    probe.replaceChildren();
    const rows = new Map();
    for (let end = start + 1; end <= count; end += 1) {
      const unit = units[end - 1];
      append(probe, unit);
      if (unit.tableId) {
        const group = rows.get(unit.tableId) || { count: 0, total: unit.rowTotal };
        group.count += 1;
        rows.set(unit.tableId, group);
      }
      const measured = measure(probe);
      if (!measured.fits) break;
      if (unit.keepNext && end < count) continue;
      if ([...rows.values()].some((group) => group.total >= 4 && group.count < 2)) continue;
      const tail = best[end];
      if (!tail) continue;
      const blank = 1 - measured.used / Math.max(1, measured.budget);
      const candidate = {
        sheets: tail.sheets + 1,
        // Same sheet count: penalise sparse continuations by MEASURED height, not row count.
        penalty: tail.penalty + blank * blank,
        ranges: [[start, end, { usedMm: measured.usedMm, availableMm: measured.availableMm }], ...tail.ranges],
      };
      const previous = best[start];
      if (!previous || candidate.sheets < previous.sheets
          || (candidate.sheets === previous.sheets && candidate.penalty < previous.penalty)) best[start] = candidate;
    }
  }
  if (!best[0]) throw new Error('Proposal content cannot fit A4 while keeping headings, complete table rows and closing notes together. Nothing was clipped or omitted.');
  return best[0].ranges;
}