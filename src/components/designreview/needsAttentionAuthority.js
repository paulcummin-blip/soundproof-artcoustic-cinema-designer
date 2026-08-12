/**
 * needsAttentionAuthority.js
 * --------------------------
 * Shared display-only level + ranking helpers for the Design Review workspace.
 *
 * Used by BOTH:
 *   - DesignOverviewBlock (LOWEST PERFORMANCE RESULTS list)
 *   - ParameterExplorer (row result rendering)
 *
 * One authority — no duplicated sorting/filtering logic.
 *
 * This is display-only: it reads existing resultLevel strings from
 * roomDesignRating.contributions. It does NOT regrade or recalculate.
 *
 * RP22 Performance Levels (L1–L4) are neutral RESULTS, not pass/fail
 * judgements. FAIL is the only genuine failure state (does not achieve L1).
 */

/** Neutral text colours for each Performance Level (readable on white). */
export const LEVEL_TEXT_COLORS = {
  L4: "#2A6E3F",
  L3: "#625143",
  L2: "#8B7B6A",
  L1: "#4A230F",
  FAIL: "#DC2626",
};

/**
 * Normalise a level value to a canonical string.
 * @returns {"L4"|"L3"|"L2"|"L1"|"FAIL"|"N/A"|null}
 */
export function normalizeLevel(lvl) {
  const n = Number(lvl);
  if (Number.isFinite(n)) {
    if (n === 0) return "FAIL";
    if (n >= 1 && n <= 4) return `L${n}`;
  }
  const str = String(lvl || "").trim().toUpperCase();
  if (str === "FAIL") return "FAIL";
  if (str === "N/A" || str === "NA") return "N/A";
  if (/^L[1-4]$/.test(str)) return str;
  return null;
}

/** Returns 3 (FAIL) > 2 (L1) > 1 (L2) > 0 (L3+). Display-only ranking band. */
export function getWeaknessBand(resultLevel) {
  const str = String(resultLevel || "");
  if (str.includes("FAIL")) return 3;
  if (str.includes("L1")) return 2;
  if (str.includes("L2")) return 1;
  return 0;
}

export function getContributionLoss(c) {
  return (c.maximumPoints || 0) - (c.earnedPoints || 0);
}

/**
 * Sort contributions by lowest Performance Level first (FAIL, then L1, then L2).
 * Within the same level, larger contribution loss first.
 * Excludes L3/L4 — never included merely to fill the list.
 *
 * @param {Array} contributions - from roomDesignRating.contributions
 * @param {number} max - maximum items to return (default 5)
 * @returns {Array} filtered + sorted contributions
 */
export function getLowestPerformanceResults(contributions, max = 5) {
  return contributions
    .filter((c) => c.resultLevel && getWeaknessBand(c.resultLevel) > 0)
    .sort((a, b) => {
      const bandA = getWeaknessBand(a.resultLevel);
      const bandB = getWeaknessBand(b.resultLevel);
      if (bandA !== bandB) return bandB - bandA;
      const lossA = getContributionLoss(a);
      const lossB = getContributionLoss(b);
      if (lossA !== lossB) return lossB - lossA;
      return (b.effectiveWeight || 0) - (a.effectiveWeight || 0);
    })
    .slice(0, max);
}

/** Check if a contribution is below L3 (weakness band > 0). */
export function needsAttention(contrib) {
  return !!contrib?.resultLevel && getWeaknessBand(contrib.resultLevel) > 0;
}