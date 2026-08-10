/**
 * viewingPriorityAuthority.js
 *
 * Canonical utility module for multi-row viewing intent.
 *
 * This module does NOT own any viewing-angle or RP23 calculation.
 * It consumes already-calculated per-row data (rowNumber, viewingAngleDeg,
 * viewingDistanceM, rp23Level) produced upstream by ViewingAnglePanel /
 * viewingAngleUtils, and provides:
 *   - normalisation of the persisted priority mode
 *   - a canonical summary object for UI display
 *   - lexicographic comparators for balanced and prioritised-row modes
 *
 * 57.5° is Sound Proof's preferred viewing target. It is NOT an RP22
 * requirement and must never be described as one.
 *
 * FUTURE INTEGRATION (Stage D):
 *   When the recommendation engine consumes this comparator, the existing
 *   RP22 hierarchy MUST be preserved:
 *     1. eliminate FAIL
 *     2. reduce L1
 *     3. reduce L2
 *     4. improve L3 → L4
 *     5. leave L4 alone
 *   Viewing Priority is an additional comparator for relevant geometry
 *   alternatives only. It must NOT override serious RP22 weaknesses.
 */

// ── Constants ─────────────────────────────────────────────────────────────

export const VIEWING_PRIORITY_DEFAULT = "balanced";

// Sound Proof's preferred viewing target (NOT an RP22 requirement).
const PREFERRED_VIEWING_ANGLE_DEG = 57.5;

// Numeric ordering for RP23 levels — used for comparison only.
// Does NOT alter RP23 level definitions.
const LEVEL_RANK = { L1: 1, L2: 2, L3: 3, L4: 4 };

/**
 * Check whether a priority mode string is the balanced sentinel.
 */
export function isBalancedMode(mode) {
  return String(mode || "").trim() === "balanced";
}

/**
 * Extract the 1-based row number from a "row_N" priority mode.
 * Returns null for balanced or invalid modes.
 */
export function prioritisedRowNumber(mode) {
  const m = String(mode || "").trim();
  const match = m.match(/^row_(\d+)$/);
  if (!match) return null;
  const n = parseInt(match[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Normalise a persisted viewing-priority mode against the current row count.
 *
 * - "balanced" is always valid.
 * - "row_N" is valid only when N <= rowCount.
 * - Any invalid / unavailable / missing value falls back to "balanced".
 *
 * This prevents stale "row_3" values from surviving in a two-row project.
 */
export function normaliseViewingPriority(mode, rowCount = 0) {
  const m = String(mode || "").trim();
  if (!m) return VIEWING_PRIORITY_DEFAULT;

  if (isBalancedMode(m)) return "balanced";

  const rowN = prioritisedRowNumber(m);
  if (rowN !== null && rowN <= rowCount) return `row_${rowN}`;

  // Invalid or unavailable row — safe fallback.
  return VIEWING_PRIORITY_DEFAULT;
}

// ── Summary Builder ──────────────────────────────────────────────────────

/**
 * Build a canonical viewing-priority summary from already-calculated per-row
 * data.
 *
 * Each row item is expected to provide:
 *   { rowNumber, viewingAngleDeg, viewingDistanceM, rp23Level }
 *
 * Rows with null/undefined rp23Level or non-finite angles are ignored safely.
 * Missing data is never converted into fake L1 results.
 *
 * Returns:
 * {
 *   priorityMode,
 *   rows: [{ rowNumber, viewingAngleDeg, viewingDistanceM, rp23Level, deviationFrom57_5 }],
 *   worstRowLevel,     // 'L1'|'L2'|'L3'|'L4' or null
 *   bestRowLevel,      // 'L1'|'L2'|'L3'|'L4' or null
 *   levelSpread,       // (bestRank - worstRank), 0 if fewer than 2 valid rows
 *   angleSpreadDeg,    // max - min angle among valid rows, 0 if < 2
 *   totalDeviationFrom57_5  // sum of |angle - 57.5| across valid rows
 * }
 */
export function buildViewingPrioritySummary(perRowData, priorityMode = "balanced") {
  const rows = Array.isArray(perRowData) ? perRowData : [];

  // Filter to valid rows only — ignore unavailable/invalid rows safely.
  const valid = rows
    .filter((r) => r && r.rp23Level && Number.isFinite(Number(r.viewingAngleDeg)))
    .map((r) => ({
      rowNumber: Number(r.rowNumber) || 0,
      viewingAngleDeg: Number(r.viewingAngleDeg),
      viewingDistanceM: Number.isFinite(Number(r.viewingDistanceM)) ? Number(r.viewingDistanceM) : null,
      rp23Level: String(r.rp23Level),
      deviationFrom57_5: Math.abs(Number(r.viewingAngleDeg) - PREFERRED_VIEWING_ANGLE_DEG),
    }));

  if (valid.length === 0) {
    return {
      priorityMode: normaliseViewingPriority(priorityMode, rows.length),
      rows: [],
      worstRowLevel: null,
      bestRowLevel: null,
      levelSpread: 0,
      angleSpreadDeg: 0,
      totalDeviationFrom57_5: 0,
    };
  }

  const ranks = valid.map((r) => LEVEL_RANK[r.rp23Level] ?? 0);
  const worstRank = Math.min(...ranks);
  const bestRank = Math.max(...ranks);

  // Find the level code matching each rank.
  const worstRowLevel = valid.find((r) => (LEVEL_RANK[r.rp23Level] ?? 0) === worstRank)?.rp23Level ?? null;
  const bestRowLevel = valid.find((r) => (LEVEL_RANK[r.rp23Level] ?? 0) === bestRank)?.rp23Level ?? null;

  const angles = valid.map((r) => r.viewingAngleDeg);
  const angleSpreadDeg = valid.length >= 2 ? Math.max(...angles) - Math.min(...angles) : 0;

  const totalDeviationFrom57_5 = valid.reduce((sum, r) => sum + r.deviationFrom57_5, 0);

  return {
    priorityMode: normaliseViewingPriority(priorityMode, rows.length),
    rows: valid,
    worstRowLevel,
    bestRowLevel,
    levelSpread: bestRank - worstRank,
    angleSpreadDeg,
    totalDeviationFrom57_5,
  };
}

// ── Comparators ──────────────────────────────────────────────────────────

/**
 * Lexicographic comparator for BALANCED mode.
 *
 * Compare order:
 *   1. HIGHER worst-row RP23 level  (larger rank wins)
 *   2. SMALLER RP23 level spread
 *   3. SMALLER horizontal viewing-angle spread
 *   4. SMALLER total deviation from 57.5°
 *   5. stable deterministic tie-break (row count, then sum of angles)
 *
 * Returns:
 *   negative if summaryA is better,
 *   positive if summaryB is better,
 *   0 if truly equal.
 *
 * Does NOT average RP23 levels.
 * Does NOT average viewing angles and call that balanced.
 */
export function compareBalancedViewing(summaryA, summaryB) {
  const a = buildViewingPrioritySummary(summaryA?.rows, "balanced");
  const b = buildViewingPrioritySummary(summaryB?.rows, "balanced");

  // 1. Higher worst-row RP23 level
  const worstA = LEVEL_RANK[a.worstRowLevel] ?? 0;
  const worstB = LEVEL_RANK[b.worstRowLevel] ?? 0;
  if (worstA !== worstB) return worstB - worstA; // higher wins → negative when A is higher

  // 2. Smaller RP23 level spread
  if (a.levelSpread !== b.levelSpread) return a.levelSpread - b.levelSpread;

  // 3. Smaller horizontal viewing-angle spread
  if (Math.abs(a.angleSpreadDeg - b.angleSpreadDeg) > 1e-9) {
    return a.angleSpreadDeg - b.angleSpreadDeg;
  }

  // 4. Smaller total deviation from 57.5°
  if (Math.abs(a.totalDeviationFrom57_5 - b.totalDeviationFrom57_5) > 1e-9) {
    return a.totalDeviationFrom57_5 - b.totalDeviationFrom57_5;
  }

  // 5. Stable deterministic tie-break: row count, then sum of angles
  if (a.rows.length !== b.rows.length) return b.rows.length - a.rows.length;
  const sumA = a.rows.reduce((s, r) => s + r.viewingAngleDeg, 0);
  const sumB = b.rows.reduce((s, r) => s + r.viewingAngleDeg, 0);
  return sumA - sumB;
}

/**
 * Comparator for PRIORITISE ROW N mode.
 *
 * Compare order:
 *   1. prioritised-row RP23 level            (higher wins)
 *   2. prioritised-row deviation from 57.5°  (smaller wins)
 *   3. worst RP23 level among all remaining rows (higher wins)
 *   4. overall level spread                   (smaller wins)
 *   5. overall angle spread                   (smaller wins)
 *   6. overall total deviation from 57.5°     (smaller wins)
 *
 * This means designer intent can favour one row, but other rows still
 * matter after the priority row is protected.
 */
export function comparePrioritisedViewing(summaryA, summaryB, rowNumber) {
  const n = Number(rowNumber);
  if (!Number.isFinite(n) || n <= 0) {
    // Invalid priority row — fall back to balanced comparison.
    return compareBalancedViewing(summaryA, summaryB);
  }

  const a = buildViewingPrioritySummary(summaryA?.rows, `row_${n}`);
  const b = buildViewingPrioritySummary(summaryB?.rows, `row_${n}`);

  const aRow = a.rows.find((r) => r.rowNumber === n);
  const bRow = b.rows.find((r) => r.rowNumber === n);

  // If the prioritised row is missing from one side, that side loses.
  if (aRow && !bRow) return -1;
  if (!aRow && bRow) return 1;
  if (!aRow && !bRow) return compareBalancedViewing(summaryA, summaryB);

  // 1. Prioritised-row RP23 level (higher wins)
  const rankA = LEVEL_RANK[aRow.rp23Level] ?? 0;
  const rankB = LEVEL_RANK[bRow.rp23Level] ?? 0;
  if (rankA !== rankB) return rankB - rankA;

  // 2. Prioritised-row deviation from 57.5° (smaller wins)
  if (Math.abs(aRow.deviationFrom57_5 - bRow.deviationFrom57_5) > 1e-9) {
    return aRow.deviationFrom57_5 - bRow.deviationFrom57_5;
  }

  // 3. Worst RP23 level among all remaining rows (higher wins)
  const remainingA = a.rows.filter((r) => r.rowNumber !== n);
  const remainingB = b.rows.filter((r) => r.rowNumber !== n);
  const worstRemA = remainingA.length > 0 ? Math.min(...remainingA.map((r) => LEVEL_RANK[r.rp23Level] ?? 0)) : 99;
  const worstRemB = remainingB.length > 0 ? Math.min(...remainingB.map((r) => LEVEL_RANK[r.rp23Level] ?? 0)) : 99;
  if (worstRemA !== worstRemB) return worstRemB - worstRemA;

  // 4. Overall level spread (smaller wins)
  if (a.levelSpread !== b.levelSpread) return a.levelSpread - b.levelSpread;

  // 5. Overall angle spread (smaller wins)
  if (Math.abs(a.angleSpreadDeg - b.angleSpreadDeg) > 1e-9) {
    return a.angleSpreadDeg - b.angleSpreadDeg;
  }

  // 6. Overall total deviation from 57.5° (smaller wins)
  return a.totalDeviationFrom57_5 - b.totalDeviationFrom57_5;
}

/**
 * Unified comparator dispatch — picks the correct comparator based on mode.
 * Returns negative / zero / positive in the same convention as above.
 */
export function compareViewingPriority(summaryA, summaryB, priorityMode = "balanced") {
  if (isBalancedMode(priorityMode)) {
    return compareBalancedViewing(summaryA, summaryB);
  }
  const n = prioritisedRowNumber(priorityMode);
  return comparePrioritisedViewing(summaryA, summaryB, n);
}

// ── UI Helpers ────────────────────────────────────────────────────────────

/**
 * Build a short human-readable balance description for the VIEWING BALANCE
 * line in ViewingAnglePanel.
 *
 * Examples:
 *   "Both rows L3 · 6° spread"
 *   "Both rows L2 · 34.5° spread · Uneven"
 *   "L4 / L2 · Uneven performance"
 *
 * Does NOT create a new RP23 "balance level".
 * Does NOT show a fake L1-L4 score for balance.
 */
export function describeViewingBalance(summary) {
  const s = buildViewingPrioritySummary(summary?.rows, summary?.priorityMode);
  if (!s.rows.length) return "";

  const levels = s.rows.map((r) => r.rp23Level);
  const allSame = levels.every((l) => l === levels[0]);
  const spread = s.angleSpreadDeg;
  const spreadStr = `${spread.toFixed(1)}° spread`;

  if (allSame && s.rows.length >= 2) {
    // Same level across rows — but angle spread may still be uneven.
    const uneven = spread > 10;
    const label = s.rows.length === 2
      ? `Both rows ${levels[0]}`
      : `All ${s.rows.length} rows ${levels[0]}`;
    return uneven
      ? `${label} · ${spreadStr} · Uneven`
      : `${label} · ${spreadStr}`;
  }

  if (allSame && s.rows.length === 1) {
    return `Row ${s.rows[0].rowNumber} ${levels[0]}`;
  }

  // Mixed levels — always uneven.
  const levelStr = levels.join(" / ");
  return `${levelStr} · Uneven performance`;
}