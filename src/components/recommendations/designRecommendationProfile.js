/**
 * designRecommendationProfile.js
 * --------------------------------
 * Canonical RP22 level-profile comparison for recommendation classification.
 *
 * The primary recommendation authority is the achieved RP22 parameter levels,
 * NOT the ASDR percentage. This module extracts per-parameter level profiles
 * from ASDR rating contributions and provides deterministic comparison for
 * improvement / degradation detection.
 *
 * Design objective (priority order):
 *   1. Eliminate FAIL
 *   2. Reduce L1 results
 *   3. Reduce L2 results
 *   4. Improve L3 to L4 where practical
 *   5. Leave existing L4 results alone
 *
 * This module does NOT score acoustics, calculate ASDR percentages, or modify
 * any RP22 / ASDR thresholds or weights. It only compares achieved RP22 level
 * profiles between a baseline and a candidate.
 */

const LEVEL_RANK = { L4: 4, L3: 3, L2: 2, L1: 1, FAIL: 0 };

/**
 * Parse a seat distribution string like "3×L4 · 2×L3 · 1×L1" into counts.
 * Single-level strings like "L4" return { l4Count: 1, ... }.
 * Returns null if the string cannot be parsed.
 */
export function parseSeatDistribution(distString) {
  if (!distString || typeof distString !== "string") return null;
  const trimmed = distString.trim();
  if (!trimmed) return null;

  const counts = { failCount: 0, l1Count: 0, l2Count: 0, l3Count: 0, l4Count: 0 };

  // Single level: "L4", "L3", "L2", "L1", "FAIL"
  if (/^(L[1-4]|FAIL)$/.test(trimmed)) {
    const key = trimmed === "FAIL" ? "failCount" : `l${trimmed[1]}Count`;
    counts[key] = 1;
    return counts;
  }

  // Distribution: "3×L4 · 2×L3 · 1×L1" (also supports 'x')
  const parts = trimmed.split("·").map((s) => s.trim());
  let matched = 0;
  for (const part of parts) {
    const m = part.match(/^(\d+)\s*[×x]\s*(L[1-4]|FAIL)$/i);
    if (!m) continue;
    const count = Number(m[1]);
    const level = m[2].toUpperCase();
    const key = level === "FAIL" ? "failCount" : `l${level[1]}Count`;
    counts[key] += count;
    matched += 1;
  }
  if (matched === 0) return null;
  return counts;
}

/**
 * Extract the canonical level profile from a rating's contributions array.
 * Returns a Map: paramKey → { key, scope, level (room), distribution (seat), distributionCounts (seat) }
 *
 * Only parameters present in the contributions are included. N/A, provisional,
 * and indeterminate parameters are not in contributions, so they are not
 * treated as fake low levels.
 */
export function extractLevelProfile(rating) {
  const profile = new Map();
  const contributions = rating?.contributions || [];
  for (const c of contributions) {
    if (!c?.key) continue;
    const entry = {
      key: c.key,
      scope: c.scope,
      resultLevel: c.resultLevel || null,
    };
    if (c.scope === "room") {
      entry.level = c.resultLevel || null;
    } else {
      entry.distribution = c.resultLevel || null;
      entry.distributionCounts = parseSeatDistribution(c.resultLevel);
    }
    profile.set(c.key, entry);
  }
  return profile;
}

/**
 * Convert a room-scope level string to a pseudo-distribution for unified comparison.
 */
function levelToCounts(level) {
  const counts = { failCount: 0, l1Count: 0, l2Count: 0, l3Count: 0, l4Count: 0 };
  if (!level) return counts;
  if (level === "FAIL") counts.failCount = 1;
  else if (level === "L1") counts.l1Count = 1;
  else if (level === "L2") counts.l2Count = 1;
  else if (level === "L3") counts.l3Count = 1;
  else if (level === "L4") counts.l4Count = 1;
  return counts;
}

/**
 * Compare two seat distributions deterministically.
 * Returns positive if `after` is better, negative if worse, 0 if equal.
 *
 * Priority: fewer FAIL > fewer L1 > fewer L2 > fewer L3 > more L4
 */
export function compareSeatDistributions(before, after) {
  const b = before || { failCount: 0, l1Count: 0, l2Count: 0, l3Count: 0, l4Count: 0 };
  const a = after || { failCount: 0, l1Count: 0, l2Count: 0, l3Count: 0, l4Count: 0 };

  if (a.failCount !== b.failCount) return b.failCount - a.failCount;
  if (a.l1Count !== b.l1Count) return b.l1Count - a.l1Count;
  if (a.l2Count !== b.l2Count) return b.l2Count - a.l2Count;
  if (a.l3Count !== b.l3Count) return b.l3Count - a.l3Count;
  return a.l4Count - b.l4Count;
}

/**
 * Compute the delta for a single parameter.
 * Returns null if either entry is missing.
 *
 * { isImproved, isDegraded, levelChanged,
 *   failRemoved, l1Removed, l2Removed, l3ToL4, l4Gained,
 *   newFail, newL1, newL2, newL3 }
 */
export function computeParamDelta(beforeEntry, afterEntry) {
  if (!beforeEntry || !afterEntry) return null;

  const beforeCounts = beforeEntry.scope === "room"
    ? levelToCounts(beforeEntry.level)
    : (beforeEntry.distributionCounts || levelToCounts(null));
  const afterCounts = afterEntry.scope === "room"
    ? levelToCounts(afterEntry.level)
    : (afterEntry.distributionCounts || levelToCounts(null));

  const cmp = compareSeatDistributions(beforeCounts, afterCounts);

  return {
    levelChanged: cmp !== 0,
    isImproved: cmp > 0,
    isDegraded: cmp < 0,
    failRemoved: Math.max(0, beforeCounts.failCount - afterCounts.failCount),
    l1Removed: Math.max(0, beforeCounts.l1Count - afterCounts.l1Count),
    l2Removed: Math.max(0, beforeCounts.l2Count - afterCounts.l2Count),
    l3ToL4: Math.max(0, beforeCounts.l3Count - afterCounts.l3Count),
    l4Gained: Math.max(0, afterCounts.l4Count - beforeCounts.l4Count),
    newFail: Math.max(0, afterCounts.failCount - beforeCounts.failCount),
    newL1: Math.max(0, afterCounts.l1Count - beforeCounts.l1Count),
    newL2: Math.max(0, afterCounts.l2Count - beforeCounts.l2Count),
    newL3: Math.max(0, afterCounts.l3Count - beforeCounts.l3Count),
  };
}

/**
 * Compute the aggregate improvement profile across all parameters.
 *
 * A candidate is an improvement when at least one parameter's level/distribution
 * improves AND no parameter degrades.
 *
 * priorityClass: 4 = FAIL removed, 3 = L1 removed, 2 = L2 removed, 1 = L3→L4
 */
export function computeImprovementProfile(baselineRating, candidateRating) {
  const beforeProfile = extractLevelProfile(baselineRating);
  const afterProfile = extractLevelProfile(candidateRating);

  const aggregate = {
    failRemoved: 0,
    l1Removed: 0,
    l2Removed: 0,
    l3ToL4: 0,
    l4Gained: 0,
    affectedParams: [],
    degradedParams: [],
    hasDegradation: false,
    hasNewFail: false,
    hasNewL1: false,
    isImprovement: false,
    priorityClass: 0,
    priorityParam: null,
  };

  const allKeys = new Set([...beforeProfile.keys(), ...afterProfile.keys()]);
  for (const key of allKeys) {
    const beforeEntry = beforeProfile.get(key);
    const afterEntry = afterProfile.get(key);
    const delta = computeParamDelta(beforeEntry, afterEntry);
    if (!delta || !delta.levelChanged) continue;

    aggregate.affectedParams.push(key);

    if (delta.isDegraded) {
      aggregate.degradedParams.push(key);
      aggregate.hasDegradation = true;
      if (delta.newFail > 0) aggregate.hasNewFail = true;
      if (delta.newL1 > 0) aggregate.hasNewL1 = true;
    }

    aggregate.failRemoved += delta.failRemoved;
    aggregate.l1Removed += delta.l1Removed;
    aggregate.l2Removed += delta.l2Removed;
    aggregate.l3ToL4 += delta.l3ToL4;
    aggregate.l4Gained += delta.l4Gained;
  }

  // Determine priority class (highest weakness removed)
  if (aggregate.failRemoved > 0) {
    aggregate.priorityClass = 4;
    aggregate.priorityParam = aggregate.affectedParams.find((key) => {
      const delta = computeParamDelta(beforeProfile.get(key), afterProfile.get(key));
      return delta?.failRemoved > 0;
    });
  } else if (aggregate.l1Removed > 0) {
    aggregate.priorityClass = 3;
  } else if (aggregate.l2Removed > 0) {
    aggregate.priorityClass = 2;
  } else if (aggregate.l3ToL4 > 0) {
    aggregate.priorityClass = 1;
  }

  aggregate.isImprovement =
    (aggregate.failRemoved + aggregate.l1Removed + aggregate.l2Removed + aggregate.l3ToL4 > 0) &&
    !aggregate.hasDegradation;

  return aggregate;
}

/**
 * Compute the aggregate degradation profile for cost-saving evaluation.
 *
 * degradationScore weights:
 *   newFail × 10000  (excluded from savings)
 *   newL1  × 100    (L2→L1 or worse — heavy penalty)
 *   newL2  × 10     (L3→L2 — medium penalty)
 *   newL3  × 1      (L4→L3 — lightest acceptable degradation)
 *
 * Lower score = better profile preservation.
 * L4→L3 (score 1) is preferred over L3→L2 (score 10) over L2→L1 (score 100).
 */
export function computeDegradationProfile(baselineRating, candidateRating) {
  const beforeProfile = extractLevelProfile(baselineRating);
  const afterProfile = extractLevelProfile(candidateRating);

  const aggregate = {
    newFail: 0,
    newL1: 0,
    newL2: 0,
    newL3: 0,
    l4Lost: 0,
    affectedParams: [],
    improvedParams: [],
    degradedParams: [],
    hasNewFail: false,
    hasNewL1: false,
    hasDegradation: false,
    hasImprovement: false,
    degradationScore: 0,
  };

  const allKeys = new Set([...beforeProfile.keys(), ...afterProfile.keys()]);
  for (const key of allKeys) {
    const beforeEntry = beforeProfile.get(key);
    const afterEntry = afterProfile.get(key);
    const delta = computeParamDelta(beforeEntry, afterEntry);
    if (!delta || !delta.levelChanged) continue;

    aggregate.affectedParams.push(key);

    if (delta.isImproved) {
      aggregate.improvedParams.push(key);
      aggregate.hasImprovement = true;
    } else if (delta.isDegraded) {
      aggregate.degradedParams.push(key);
      aggregate.hasDegradation = true;
      aggregate.newFail += delta.newFail;
      aggregate.newL1 += delta.newL1;
      aggregate.newL2 += delta.newL2;
      aggregate.newL3 += delta.newL3;
      aggregate.l4Lost += delta.newL3; // L4→L3 shows as newL3
      if (delta.newFail > 0) aggregate.hasNewFail = true;
      if (delta.newL1 > 0) aggregate.hasNewL1 = true;
    }
  }

  aggregate.degradationScore =
    aggregate.newFail * 10000 +
    aggregate.newL1 * 100 +
    aggregate.newL2 * 10 +
    aggregate.newL3 * 1;

  return aggregate;
}

/**
 * Get affected parameters (only those whose level/profile actually changed).
 * Returns array of display names sorted by parameter number.
 * Does NOT list parameters whose raw values changed within the same level.
 */
export function getAffectedParameters(baselineRating, candidateRating) {
  const beforeProfile = extractLevelProfile(baselineRating);
  const afterProfile = extractLevelProfile(candidateRating);
  const result = [];

  const allKeys = new Set([...beforeProfile.keys(), ...afterProfile.keys()]);
  for (const key of allKeys) {
    const beforeEntry = beforeProfile.get(key);
    const afterEntry = afterProfile.get(key);
    const delta = computeParamDelta(beforeEntry, afterEntry);
    if (!delta || !delta.levelChanged) continue;
    result.push(key === "screen" ? "Screen" : key.toUpperCase());
  }

  return result.sort((a, b) => {
    const na = Number(a.replace(/\D/g, "")) || 999;
    const nb = Number(b.replace(/\D/g, "")) || 999;
    return na - nb;
  });
}

/**
 * Get per-parameter level change descriptions for UI display.
 * Returns array of { key, display, beforeLevel, afterLevel, isImproved, isDegraded }
 * sorted by parameter number.
 */
export function getParameterLevelChanges(baselineRating, candidateRating) {
  const beforeProfile = extractLevelProfile(baselineRating);
  const afterProfile = extractLevelProfile(candidateRating);
  const changes = [];

  const allKeys = new Set([...beforeProfile.keys(), ...afterProfile.keys()]);
  for (const key of allKeys) {
    const beforeEntry = beforeProfile.get(key);
    const afterEntry = afterProfile.get(key);
    const delta = computeParamDelta(beforeEntry, afterEntry);
    if (!delta || !delta.levelChanged) continue;

    const display = key === "screen" ? "Screen" : key.toUpperCase();
    const beforeLevel = beforeEntry?.scope === "room"
      ? beforeEntry.level
      : beforeEntry?.distribution;
    const afterLevel = afterEntry?.scope === "room"
      ? afterEntry.level
      : afterEntry?.distribution;

    changes.push({
      key,
      display,
      beforeLevel,
      afterLevel,
      isImproved: delta.isImproved,
      isDegraded: delta.isDegraded,
    });
  }

  return changes.sort((a, b) => {
    const na = Number(a.key.replace(/\D/g, "")) || 999;
    const nb = Number(b.key.replace(/\D/g, "")) || 999;
    return na - nb;
  });
}

/**
 * Get a priority label for FAIL-dominant improvements.
 * Returns null if no FAIL is being removed.
 * Example: "PRIORITY: Resolve P5 failure"
 */
export function getPriorityLabel(improvementProfile) {
  if (!improvementProfile || improvementProfile.priorityClass < 4) return null;
  const param = improvementProfile.priorityParam;
  if (!param) return null;
  const display = param === "screen" ? "Screen" : param.toUpperCase();
  return `PRIORITY: Resolve ${display} failure`;
}