/**
 * needsAttentionAuthority.js
 * --------------------------
 * Shared display-only weakness-band logic for the Design Review workspace.
 *
 * Used by BOTH:
 *   - DesignOverviewBlock (Needs Attention list)
 *   - ParameterExplorer (Needs Attention filter)
 *
 * One authority — no duplicated sorting/filtering logic.
 *
 * This is display-only: it reads existing resultLevel strings from
 * roomDesignRating.contributions. It does NOT regrade or recalculate.
 */

/** Returns 3 (FAIL) > 2 (L1) > 1 (L2) > 0 (OK). Display-only. */
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
 * Sort contributions by weakness band (FAIL first, then L1, then L2).
 * Within the same band, larger contribution loss first.
 * Excludes L3/L4 — never included merely to fill the list.
 *
 * @param {Array} contributions - from roomDesignRating.contributions
 * @param {number} max - maximum items to return (default 5)
 * @returns {Array} filtered + sorted contributions
 */
export function getNeedsAttention(contributions, max = 5) {
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

/**
 * Check if a contribution needs attention (weakness band > 0).
 */
export function needsAttention(contrib) {
  return !!contrib?.resultLevel && getWeaknessBand(contrib.resultLevel) > 0;
}