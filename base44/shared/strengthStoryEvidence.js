/**
 * strengthStoryEvidence.js (base44/shared — CANONICAL)
 * ---------------------------------------------------
 * The evidence reads a strength story is built from: the product schedule, the
 * per-seat floors, the published parameter rows and the per-row viewing results.
 *
 * These reads are shared by the Project Report's ADI Design Highlights page and
 * by the proposal writer's strength selection, so both state the same value for
 * the same result. Nothing here calculates, grades or re-interprets an
 * engineering result: a value is read exactly as the published evidence states
 * it, and a missing result is simply absent.
 *
 * Pure: no React, no fetching, no side effects, no runtime-specific APIs. This
 * file IS the canonical implementation; `shared/strengthStoryEvidence.js` and
 * `src/shared/strengthStoryEvidence.js` are thin re-exports of it.
 */

import { levelLabel, levelRank, readPublishedParameter } from './strengthImportance.js';

const NONE_SPECIFIED = /^none specified$/i;

/* ── Product schedule helpers ─────────────────────────────────────────────── */

/** One product schedule row, split into its own entries: { name, count, position }. */
export function productEntries(productsSelected, key) {
  const row = (productsSelected?.rows || []).find((entry) => entry?.key === key);
  const value = String(row?.value || '').trim();
  if (!value || NONE_SPECIFIED.test(value)) return [];
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part && !NONE_SPECIFIED.test(part))
    .map((part) => ({
      label: part,
      name: part.replace(/×\s*\d+/, '').replace(/\([^)]*\)/g, '').trim(),
      count: Number((part.match(/×\s*(\d+)/) || [])[1] || 1),
      position: (part.match(/\(([^)]*)\)/) || [])[1] || null,
    }));
}

/** Subwoofers stated by model with their combined count: "SUB4-12 × 4". */
export function subwooferSummary(entries) {
  const byModel = new Map();
  for (const entry of entries) {
    if (!entry.name) continue;
    byModel.set(entry.name, (byModel.get(entry.name) || 0) + entry.count);
  }
  return [...byModel.entries()].map(([name, count]) => ({ name, count }));
}

export const modelCountLabel = (entries) => entries
  .map((entry) => (entry.count > 1 ? `${entry.name} × ${entry.count}` : entry.name))
  .filter(Boolean)
  .join(', ');

/** "A, B and C" — the page's own list style. */
export function joinList(items) {
  const list = (Array.isArray(items) ? items : []).filter(Boolean);
  if (list.length <= 1) return list[0] || '';
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

/** The combined count of a product schedule row's entries. */
export const productCount = (entries) => entries.reduce((sum, entry) => sum + entry.count, 0);

/* ── Evidence line helpers ────────────────────────────────────────────────── */

/**
 * One evidence line: the label it rests on (a parameter number, or the fact it
 * states), the published level that result reached, and the value that states
 * it. The level is ALWAYS passed separately and never written into the label —
 * the page renders it as the canonical level pill, so a level can neither be
 * printed twice nor appear as loose plain text beside its own pill.
 */
export const evidence = (label, level, value, detail = null) => ({
  key: label,
  level: level ?? null,
  value: value ?? null,
  detail,
});

/** A sentence with its first letter capitalised. */
export const sentence = (text) => {
  const trimmed = String(text || '').trim();
  return trimmed ? `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}` : '';
};

/* ── Published evidence reads ─────────────────────────────────────────────── */

/** One published parameter result, by its RP22 number. */
export function parameter(summary, id) {
  return readPublishedParameter(summary, id);
}

/** Every assessed seat result published for one parameter. */
export function seatRows(summary, id) {
  const rows = summary?.project?.reportCounts?.seatResultsByParameter?.[`p${id}`] || [];
  return rows.filter((row) => levelLabel(row?.level) != null);
}

/**
 * The parameter's all-seat floor: the weakest assessed seat governs, so a
 * strength claimed from this result holds at every seat that was assessed.
 */
export function seatFloor(summary, id) {
  const rows = seatRows(summary, id);
  if (rows.length === 0) return null;
  const worst = rows.reduce(
    (acc, row) => (levelRank(row.level) < levelRank(acc.level) ? row : acc),
    rows[0],
  );
  const level = levelLabel(worst.level);
  return {
    key: `P${id}`,
    id,
    level,
    value: worst.valueFormatted || null,
    detail: rows.length > 1 ? `worst of ${rows.length} assessed seats` : 'assessed seat',
    scope: 'seat',
    assessed: rows.length,
  };
}

/** The RP23 viewing result of every seating row, from the published per-seat authority. */
export function viewingRows(summary, seatingPositions) {
  const perSeat = summary?.viewing?.per_seat || [];
  if (perSeat.length === 0) return [];
  const rowBySeatId = new Map(
    (Array.isArray(seatingPositions) ? seatingPositions : [])
      .map((seat) => [String(seat?.id), Number(seat?.rowNumber ?? seat?.row)]),
  );
  // A seating plan that does not name its seats still carries the row the
  // evidence itself states, so the viewing result is never lost with the plan.
  const fallbackRow = new Map(
    perSeat
      .filter((seat) => seat?.seat_id != null && Number.isFinite(Number(seat?.row)))
      .map((seat) => [String(seat.seat_id), Number(seat.row)]),
  );
  const byRow = new Map();
  for (const seat of perSeat) {
    const rowNumber = rowBySeatId.get(String(seat?.seat_id)) ?? fallbackRow.get(String(seat?.seat_id));
    if (!Number.isFinite(rowNumber)) continue;
    const level = levelLabel(seat?.rp23_level);
    const angle = Number(seat?.horizontal_angle_deg);
    const entry = byRow.get(rowNumber) || { rowNumber, levels: [], angles: [], seats: 0 };
    entry.seats += 1;
    if (level) entry.levels.push(level);
    if (Number.isFinite(angle)) entry.angles.push(angle);
    byRow.set(rowNumber, entry);
  }
  return [...byRow.values()]
    .sort((a, b) => a.rowNumber - b.rowNumber)
    .map((entry) => ({
      rowNumber: entry.rowNumber,
      seats: entry.seats,
      level: entry.levels.length
        ? entry.levels.reduce((acc, level) => (levelRank(level) < levelRank(acc) ? level : acc), entry.levels[0])
        : null,
      minAngleDeg: entry.angles.length ? Math.min(...entry.angles) : null,
      maxAngleDeg: entry.angles.length ? Math.max(...entry.angles) : null,
    }));
}

/** "Front row" / "Middle row" / "Rear row", from the row's place in the plan. */
export function rowLabel(index, total) {
  if (total <= 1) return 'Seating row';
  if (index === 0) return 'Front row';
  if (index === total - 1) return 'Rear row';
  return total === 3 ? 'Middle row' : `Row ${index + 1}`;
}

export default productEntries;