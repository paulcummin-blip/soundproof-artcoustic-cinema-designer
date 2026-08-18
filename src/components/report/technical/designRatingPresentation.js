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
 * ── Failure logic (failure-driven, NOT index-driven) ──────────────────────
 * "Design Improvement Recommended" is shown ONLY when an active, definitively
 * scored system-design parameter has FAIL as its authoritative result.
 * An RP22 Level 1 (L1) result is a valid achieved performance level and is
 * NEVER treated as a failure.
 *
 * Overall room designation resolves in this order:
 *   1. Any contribution with FAIL  → "Design Improvement Recommended"
 *   2. Otherwise, Design Performance Index:
 *        80+        → Exceptional Performance
 *        70–79      → Reference Performance
 *        65–69      → Excellent Performance
 *        50–64      → High Performance
 *        below 50   → Good Performance
 */

const FAIL_LABEL = "Design Improvement Recommended";

// ── Overall room designation bands (additive Design Performance Index) ─────
// These bands apply to the overall room Design Performance Index only.
// Category cards retain their own percentage-based bands (INDEX_BANDS below).
// Kept in ONE shared helper so they can be calibrated against real projects.
const OVERALL_INDEX_BANDS = [
  { min: 120, label: "Exceptional Performance" },
  { min: 95, label: "Reference Performance" },
  { min: 80, label: "Excellent Performance" },
  { min: 60, label: "High Performance" },
  { min: 0, label: "Good Performance" },
];

// ── Category card bands (percentage-based, unchanged) ──────────────────────
// Used by getCategorySummaries for Spatial Resolution, Dynamic Range and
// Timbre Matching. These are NOT used for the overall room designation.
const INDEX_BANDS = [
  { min: 80, label: "Exceptional Performance" },
  { min: 70, label: "Reference Performance" },
  { min: 65, label: "Excellent Performance" },
  { min: 50, label: "High Performance" },
  { min: 0, label: "Good Performance" },
];

/**
 * Pure Design Performance Index → band mapping for CATEGORY cards only.
 * Uses the legacy percentage-based bands. The overall room designation
 * uses getOverallDesignationFromIndex() via getRoomDesignRatingDesignation().
 * @param {number|null|undefined} displayPercentage
 * @returns {string|null}
 */
export function getDesignRatingDesignation(displayPercentage) {
  const v = Number(displayPercentage);
  if (!Number.isFinite(v)) return null;
  for (const band of INDEX_BANDS) {
    if (v >= band.min) return band.label;
  }
  return "Good Performance";
}

/**
 * Map an additive Design Performance Index to the overall room designation.
 * @param {number|null|undefined} index
 * @returns {string|null}
 */
function getOverallDesignationFromIndex(index) {
  const v = Number(index);
  if (!Number.isFinite(v)) return null;
  for (const band of OVERALL_INDEX_BANDS) {
    if (v >= band.min) return band.label;
  }
  return "Good Performance";
}

/**
 * The additive Design Performance Index: round(actualPoints / 10), clamped ≥ 0.
 * Accepts either a rating object (preferred) or a legacy number.
 * Never displayed with a % symbol, /100, or "out of 100" wording.
 * @param {Object|number|null|undefined} roomDesignRatingOrValue
 * @returns {number|null}
 */
export function getDesignPerformanceIndex(roomDesignRatingOrValue) {
  if (roomDesignRatingOrValue == null) return null;
  // Rating object (preferred path)
  if (typeof roomDesignRatingOrValue === "object") {
    if (Number.isFinite(roomDesignRatingOrValue.designPerformanceIndex)) {
      return Math.max(0, Math.round(roomDesignRatingOrValue.designPerformanceIndex));
    }
    const actualPoints = Number(roomDesignRatingOrValue.actualPoints);
    if (Number.isFinite(actualPoints)) {
      return Math.max(0, Math.round(actualPoints / 10));
    }
    return null;
  }
  // Legacy number fallback
  const v = Number(roomDesignRatingOrValue);
  if (!Number.isFinite(v)) return null;
  return Math.max(0, Math.round(v));
}

// ── Level parsing / aggregation ─────────────────────────────────────────────

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
 * Does any contribution in the given set have a genuine FAIL result?
 * L1 is NOT a failure — only an explicit FAIL counts.
 */
function hasFailResult(contributions) {
  if (!Array.isArray(contributions)) return false;
  return contributions.some((c) => {
    const counts = parseLevelCounts(c.resultLevel);
    return (counts.FAIL || 0) > 0;
  });
}

/**
 * Aggregate the weighted L4/L3/L2/L1/FAIL profile across contributions.
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

// ── Overall room designation (failure-driven) ───────────────────────────────

/**
 * Resolve the overall room designation.
 * FAIL-driven: any genuine FAIL → "Design Improvement Recommended".
 * Otherwise the additive Design Performance Index maps to the overall bands.
 * @param {Object|null|undefined} roomDesignRating
 * @returns {string|null}
 */
export function getRoomDesignRatingDesignation(roomDesignRating) {
  if (!roomDesignRating || roomDesignRating.status === "NOT_ASSESSED" || roomDesignRating.status === "NOT_CONFIGURED") return null;
  if (hasFailResult(roomDesignRating.contributions)) return FAIL_LABEL;
  const index = getDesignPerformanceIndex(roomDesignRating);
  return getOverallDesignationFromIndex(index);
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

// ── Screen / Viewing Geometry — single-parameter category ──────────────────
// This category contains only the authoritative RP23 horizontal viewing-angle
// result. It bypasses the normal multi-parameter weighted aggregation: the
// achieved RP23 level is read directly and translated to a fixed category
// descriptor. No category Design Performance Index is calculated for this
// category. The overall room rating and its six designations are unaffected.
const SCREEN_CATEGORY_LABEL = "Screen / Viewing Geometry";

const SCREEN_LEVEL_DESCRIPTOR = {
  L4: "Exceptional Performance",
  L3: "Reference Performance",
  L2: "Good Performance",
  L1: "Acceptable Performance",
  FAIL: "Design Improvement Recommended",
};

/**
 * Extract the worst (lowest) achieved level from a resultLevel string.
 * A single level ("L4") returns itself. A seat-scope distribution
 * ("3×L4 · 2×L3 · 1×L1") returns the lowest level present.
 * Returns null for unrecognised input.
 */
function worstLevelFromResultLevel(resultLevel) {
  if (!resultLevel || typeof resultLevel !== "string") return null;
  const trimmed = resultLevel.trim();
  if (/^(L[1-4]|FAIL)$/.test(trimmed)) return trimmed;
  const counts = parseLevelCounts(trimmed);
  if (counts.FAIL) return "FAIL";
  if (counts.L1) return "L1";
  if (counts.L2) return "L2";
  if (counts.L3) return "L3";
  if (counts.L4) return "L4";
  return null;
}

/**
 * Derive per-category qualitative summaries.
 *
 * Spatial Resolution, Dynamic Range and Timbre Matching use the existing
 * multi-parameter weighted aggregation: each category's earned/maximum points
 * are summed and the resulting percentage is mapped through the index bands.
 *
 * Screen / Viewing Geometry is a single-parameter category containing only the
 * authoritative RP23 horizontal viewing-angle result. It bypasses the weighted
 * aggregation: the achieved RP23 level is read directly from the "screen"
 * contribution and translated via SCREEN_LEVEL_DESCRIPTOR. No category Design
 * Performance Index is calculated for this category.
 *
 * Failure wording ("Design Improvement Recommended") for the three weighted
 * categories is shown ONLY when an authoritative result within that category
 * is genuinely FAIL. An L1 result is a valid achieved level and never triggers
 * failure wording. For Screen / Viewing Geometry, only an authoritative RP23
 * FAIL produces "Design Improvement Recommended"; L1 produces "Acceptable
 * Performance".
 *
 * @param {Object} roomDesignRating
 * @returns {Array<{label, designation, index}>}
 */
export function getCategorySummaries(roomDesignRating) {
  if (!roomDesignRating || roomDesignRating.status === "NOT_ASSESSED" || roomDesignRating.status === "NOT_CONFIGURED") return [];
  const contributions = roomDesignRating.contributions || [];

  const groups = {};
  for (const c of contributions) {
    const g = getGroupForContrib(c);
    if (!g) continue;
    if (!groups[g]) groups[g] = { earned: 0, max: 0, contribs: [] };
    groups[g].earned += Number(c.earnedPoints) || 0;
    groups[g].max += Number(c.maximumPoints) || 0;
    groups[g].contribs.push(c);
  }

  return CATEGORY_GROUPS.map((g) => {
    const data = groups[g.label];
    if (!data || data.max === 0) {
      return { label: g.label, designation: null, index: null };
    }
    // Screen / Viewing Geometry: single-parameter category — read the
    // authoritative RP23 result directly, bypassing weighted aggregation.
    if (g.label === SCREEN_CATEGORY_LABEL) {
      const screenContrib = data.contribs.find((c) => c.key === "screen");
      const worst = screenContrib ? worstLevelFromResultLevel(screenContrib.resultLevel) : null;
      return {
        label: g.label,
        designation: worst ? (SCREEN_LEVEL_DESCRIPTOR[worst] ?? null) : null,
        index: null,
      };
    }
    const pct = (data.earned / data.max) * 100;
    const fail = hasFailResult(data.contribs);
    return {
      label: g.label,
      designation: fail ? FAIL_LABEL : getDesignRatingDesignation(pct),
      index: getDesignPerformanceIndex(pct),
    };
  });
}

// ── Supporting sentence (descriptive, not mechanical) ──────────────────────

function levelNum(key) {
  return Number(key.replace("L", ""));
}

/**
 * Convert a weighted share into a qualitative descriptor, or null if too
 * small to mention. Avoids raw counts in the headline sentence.
 */
function qualifier(weighted, total) {
  if (weighted <= 0 || total <= 0) return null;
  const frac = weighted / total;
  if (frac >= 0.4) return "multiple";
  if (frac >= 0.2) return "significant";
  if (frac >= 0.08) return "several";
  if (frac >= 0.03) return "some";
  return null;
}

/**
 * Build a concise supporting sentence describing the dominant weighted
 * L4/L3/L2/L1 profile naturally — not by listing raw counts.
 * @param {Object} roomDesignRating
 * @returns {string|null}
 */
export function getDesignRatingSupportingSentence(roomDesignRating) {
  if (!roomDesignRating || roomDesignRating.status === "NOT_ASSESSED" || roomDesignRating.status === "NOT_CONFIGURED") return null;
  const contributions = roomDesignRating.contributions || [];
  if (contributions.length === 0) return null;

  const profile = aggregateLevelProfile(contributions);
  const total = profile.L4 + profile.L3 + profile.L2 + profile.L1;

  // No achieved levels at all — everything failed.
  if (total <= 0) {
    return "Design improvement recommended across multiple parameters";
  }

  const achieved = [
    { key: "L4", w: profile.L4 },
    { key: "L3", w: profile.L3 },
    { key: "L2", w: profile.L2 },
    { key: "L1", w: profile.L1 },
  ]
    .filter((l) => l.w > 0)
    .sort((a, b) => b.w - a.w);

  const dom = achieved[0];
  const second = achieved[1];
  // "Balanced" only when the top two are genuinely co-dominant (nearly equal
  // weight) AND adjacent levels — otherwise the dominant level leads.
  const balanced =
    second &&
    second.w > 0 &&
    dom.w > 0 &&
    second.w / dom.w >= 0.9 &&
    Math.abs(levelNum(dom.key) - levelNum(second.key)) === 1;

  let prefix;
  let floorNum;
  const mentioned = new Set();
  if (balanced) {
    const a = levelNum(dom.key);
    const b = levelNum(second.key);
    floorNum = Math.min(a, b);
    mentioned.add(dom.key);
    mentioned.add(second.key);
    prefix = `Balanced Level ${Math.min(a, b)} and Level ${Math.max(a, b)} performance`;
  } else {
    floorNum = levelNum(dom.key);
    mentioned.add(dom.key);
    prefix =
      dom.key === "L1"
        ? "Level 1 performance"
        : `Strong Level ${floorNum} performance`;
  }

  // Higher-level strengths above the floor (excluding the mentioned pair).
  const higher = achieved
    .filter((l) => !mentioned.has(l.key) && levelNum(l.key) > floorNum)
    .sort((a, b) => levelNum(a.key) - levelNum(b.key));
  const higherWeight = higher.reduce((s, l) => s + l.w, 0);
  const qual = qualifier(higherWeight, total);

  if (!qual || higher.length === 0) {
    if (dom.key === "L4" && !balanced) {
      return "Strong Level 4 performance across multiple parameters";
    }
    return prefix;
  }

  let suffix;
  if (balanced) {
    suffix = `with ${qual} higher-level results`;
  } else if (higher.length === 1) {
    suffix = `with ${qual} Level ${levelNum(higher[0].key)} results`;
  } else if (higher.length === 2) {
    const names = higher
      .map((l) => `Level ${levelNum(l.key)}`)
      .join(" and ");
    suffix = `with ${qual} ${names} strengths`;
  } else {
    suffix = `with ${qual} higher-level results`;
  }

  return `${prefix} ${suffix}`;
}

/**
 * Format a recommendation comparison line as
 * "Design Performance Index {from} → {to}".
 * Accepts rating objects or legacy numeric values.
 * @param {Object|number} fromRating
 * @param {Object|number} toRating
 * @returns {string|null}
 */
export function formatDesignIndexComparison(fromRating, toRating) {
  const from = getDesignPerformanceIndex(fromRating);
  const to = getDesignPerformanceIndex(toRating);
  if (from == null || to == null) return null;
  return `Design Performance Index ${from} → ${to}`;
}