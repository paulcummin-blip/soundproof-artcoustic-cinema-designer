/**
 * designRatingPresentation.js
 * ---------------------------
 * Pure presentation helper for the Artcoustic System Design Rating.
 *
 * Maps the existing canonical calculateRoomDesignRating() numerical result
 * to client-facing designations, a Design Performance Index, a supporting
 * performance sentence, and per-category qualitative summaries.
 *
 * Pure: no React, no UI, no side effects. Does NOT recalculate any score,
 * weight, level, or recommendation. Consumes only the existing
 * `displayPercentage` and `contributions` from calculateRoomDesignRating().
 *
 * The six designation bands:
 *   80+        → Exceptional Performance
 *   70–79      → Reference Performance
 *   65–69      → Excellent Performance
 *   50–64      → High Performance
 *   40–49      → Good Performance
 *   below 40   → Design Improvement Recommended
 */

const DESIGNATION_BANDS = [
  { min: 80, label: "Exceptional Performance" },
  { min: 70, label: "Reference Performance" },
  { min: 65, label: "Excellent Performance" },
  { min: 50, label: "High Performance" },
  { min: 40, label: "Good Performance" },
  { min: 0, label: "Design Improvement Recommended" },
];

/**
 * Map a numerical displayPercentage to the client-facing designation.
 * @param {number|null|undefined} displayPercentage
 * @returns {string|null} designation label, or null if not a finite number.
 */
export function getDesignRatingDesignation(displayPercentage) {
  const v = Number(displayPercentage);
  if (!Number.isFinite(v)) return null;
  for (const band of DESIGNATION_BANDS) {
    if (v >= band.min) return band.label;
  }
  return "Design Improvement Recommended";
}

/**
 * The rounded numerical value exposed as the "Design Performance Index".
 * Never displayed with a % symbol, /100, or "out of 100" wording.
 * @param {number|null|undefined} displayPercentage
 * @returns {number|null} rounded integer index, or null.
 */
export function getDesignPerformanceIndex(displayPercentage) {
  const v = Number(displayPercentage);
  if (!Number.isFinite(v)) return null;
  return Math.round(v);
}

// ── Category grouping (matches TechnicalAsdrScorecard CATEGORY_GROUPS) ──────

const CATEGORY_GROUPS = [
  { label: "Spatial Resolution", range: [1, 11] },
  { label: "Dynamic Range", range: [12, 15] },
  { label: "Timbre Matching", range: [16, 21] },
  { label: "Screen / Viewing Geometry", range: null },
];

function getGroupForContrib(contrib) {
  if (contrib.key === "screen") return "Screen / Viewing Geometry";
  const num = contrib.parameter;
  if (!Number.isFinite(num)) return null;
  for (const g of CATEGORY_GROUPS) {
    if (g.range && num >= g.range[0] && num <= g.range[1]) return g.label;
  }
  return null;
}

// ── Level profile aggregation ───────────────────────────────────────────────

const LEVEL_ORDER = ["L4", "L3", "L2", "L1", "FAIL"];
const DIST_RE = /(\d+)\s*[×x]\s*(L[1-4]|FAIL)/g;

/**
 * Parse a resultLevel that may be a single level ("L4") or a seat-scope
 * distribution string ("3×L4 · 2×L3 · 1×L1") into per-level counts.
 */
function parseLevelCounts(resultLevel) {
  if (!resultLevel || typeof resultLevel !== "string") return {};
  const trimmed = resultLevel.trim();
  if (/^(L[1-4]|FAIL)$/.test(trimmed)) {
    return { [trimmed]: 1 };
  }
  const counts = {};
  let m;
  DIST_RE.lastIndex = 0;
  while ((m = DIST_RE.exec(trimmed)) !== null) {
    const lvl = m[2];
    counts[lvl] = (counts[lvl] || 0) + parseInt(m[1], 10);
  }
  return counts;
}

/**
 * Aggregate the weighted L4/L3/L2/L1/FAIL profile across all contributions.
 * Each contribution's per-level count is multiplied by its effectiveWeight.
 */
function aggregateLevelProfile(contributions) {
  const profile = { L4: 0, L3: 0, L2: 0, L1: 0, FAIL: 0 };
  if (!Array.isArray(contributions)) return profile;
  for (const c of contributions) {
    const w = Number(c.effectiveWeight) || 1;
    const counts = parseLevelCounts(c.resultLevel);
    for (const [lvl, n] of Object.entries(counts)) {
      if (profile[lvl] != null) {
        profile[lvl] += n * w;
      }
    }
  }
  return profile;
}

function dominantLevel(profile) {
  let best = null;
  let bestCount = -1;
  for (const lvl of LEVEL_ORDER) {
    const c = profile[lvl] || 0;
    if (c > bestCount) {
      best = lvl;
      bestCount = c;
    }
  }
  return best;
}

/**
 * Build a concise supporting sentence from the actual weighted L4/L3/L2/L1
 * contribution profile. Reflects the real project profile — not hard-coded
 * to the overall designation.
 * @param {Object} roomDesignRating - from calculateRoomDesignRating()
 * @returns {string|null}
 */
export function getDesignRatingSupportingSentence(roomDesignRating) {
  if (!roomDesignRating || roomDesignRating.status === "NOT_ASSESSED") return null;
  const contributions = roomDesignRating.contributions || [];
  if (contributions.length === 0) return null;

  const profile = aggregateLevelProfile(contributions);
  const dom = dominantLevel(profile);
  if (!dom) return null;

  const l4 = Math.round(profile.L4 || 0);
  const l3 = Math.round(profile.L3 || 0);

  if (dom === "L4") {
    return l4 >= 2
      ? "Strong Level 4 performance across multiple parameters"
      : "Level 4 performance";
  }
  if (dom === "L3") {
    if (l4 >= 2) return "Strong Level 3 performance with multiple Level 4 results";
    if (l4 === 1) return "Strong Level 3 performance with one Level 4 result";
    return "Strong Level 3 performance across the assessed parameters";
  }
  if (dom === "L2") {
    const extras = [];
    if (l4 > 0) extras.push(`${l4} Level 4`);
    if (l3 > 0) extras.push(`${l3} Level 3`);
    return extras.length
      ? `Level 2 performance with ${extras.join(" and ")} results`
      : "Level 2 performance across the assessed parameters";
  }
  if (dom === "L1") {
    return "Level 1 performance across the assessed parameters";
  }
  if (dom === "FAIL") {
    return "Design improvement recommended across multiple parameters";
  }
  return null;
}

/**
 * Derive per-category qualitative summaries from the same existing weighted
 * contribution data. Each category's earned/maximum points are summed and
 * the resulting percentage is mapped through the same six-band designation.
 *
 * @param {Object} roomDesignRating - from calculateRoomDesignRating()
 * @returns {Array<{label, designation, index}>} one entry per category (in
 *   fixed order); designation/index are null when the category has no scored
 *   contributions.
 */
export function getCategorySummaries(roomDesignRating) {
  if (!roomDesignRating || roomDesignRating.status === "NOT_ASSESSED") return [];
  const contributions = roomDesignRating.contributions || [];

  const groups = {};
  for (const c of contributions) {
    const g = getGroupForContrib(c);
    if (!g) continue;
    if (!groups[g]) groups[g] = { earned: 0, max: 0 };
    groups[g].earned += Number(c.earnedPoints) || 0;
    groups[g].max += Number(c.maximumPoints) || 0;
  }

  return CATEGORY_GROUPS.map((g) => {
    const data = groups[g.label];
    if (!data || data.max === 0) {
      return { label: g.label, designation: null, index: null };
    }
    const pct = (data.earned / data.max) * 100;
    return {
      label: g.label,
      designation: getDesignRatingDesignation(pct),
      index: getDesignPerformanceIndex(pct),
    };
  });
}

/**
 * Format a recommendation comparison line as "Design Performance Index {from} → {to}".
 * @param {number} fromPct - currentPercentage
 * @param {number} toPct - newPercentage
 * @returns {string|null}
 */
export function formatDesignIndexComparison(fromPct, toPct) {
  const from = getDesignPerformanceIndex(fromPct);
  const to = getDesignPerformanceIndex(toPct);
  if (from == null || to == null) return null;
  return `Design Performance Index ${from} → ${to}`;
}