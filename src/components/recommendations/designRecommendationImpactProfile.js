/**
 * designRecommendationImpactProfile.js
 * --------------------------------
 * Stage B: RP22 performance-impact vector for design recommendations.
 *
 * Reach-coupled lexicographic comparison. Reach and magnitude stay coupled:
 * maxGain is measured ONLY among consequences at the primary reach.
 *
 * No pillar weights. No parameter-specific weights. No blended score. No price.
 *
 * P12/P13 use UNIQUE PHYSICAL RP22 threshold crossings (not the active-mode
 * resultLevel) so Minimum and Recommended are equally authoritative while
 * describing one physical result once. Shared Min/Rec thresholds count once.
 * No L5. No extrapolation above the published scale.
 *
 * This module never scores acoustics and never redefines RP22 thresholds — it
 * only compares already-computed canonical results.
 */

const LEVEL_RANK = Object.freeze({ FAIL: 0, L1: 1, L2: 2, L3: 3, L4: 4 });

// Reach ordinals (higher = broader reach). Used for comparison only — not weights.
export const REACH = Object.freeze({
  NONE: -1,
  ONE_SECONDARY: 0,
  MULTI_SECONDARY: 1,
  RSP_SUBSET: 2,
  CORE: 3,
});

// Unique union of Minimum + Recommended thresholds (shared thresholds count once).
const P12_THRESHOLDS = Object.freeze([99, 102, 105, 108, 111]);
const P13_THRESHOLDS = Object.freeze([96, 99, 102, 105, 108]);
const P12_LOWEST = 99;
const P13_LOWEST = 96;

const P12_KEY = "p12";
const P13_KEY = "p13";

function rankOf(level) {
  return LEVEL_RANK[level] ?? null;
}

function isScoredLevel(level) {
  return level === "FAIL" || level === "L1" || level === "L2" || level === "L3" || level === "L4";
}

function thresholdsForKey(key) {
  return key === P12_KEY ? P12_THRESHOLDS : P13_THRESHOLDS;
}

function lowestThresholdForKey(key) {
  return key === P12_KEY ? P12_LOWEST : P13_LOWEST;
}

/**
 * Count unique canonical thresholds crossed upward in (beforeRaw, afterRaw].
 * No extrapolation beyond the published scale.
 */
export function thresholdStepGain(beforeRaw, afterRaw, key) {
  const b = Number(beforeRaw);
  const a = Number(afterRaw);
  if (!Number.isFinite(b) || !Number.isFinite(a) || a <= b) return 0;
  let count = 0;
  for (const t of thresholdsForKey(key)) {
    if (t > b && t <= a) count++;
  }
  return count;
}

/**
 * Count unique canonical thresholds crossed downward in (afterRaw, beforeRaw].
 */
export function thresholdStepLoss(beforeRaw, afterRaw, key) {
  const b = Number(beforeRaw);
  const a = Number(afterRaw);
  if (!Number.isFinite(b) || !Number.isFinite(a) || a >= b) return 0;
  let count = 0;
  for (const t of thresholdsForKey(key)) {
    if (t > a && t <= b) count++;
  }
  return count;
}

/**
 * Find the RSP seat id: the seat closest to the mlpPoint.
 * Seat ids are stable across baseline/candidate (seating moves preserve ids).
 */
function findRspSeatId(seats, mlpPoint) {
  const list = Array.isArray(seats) ? seats : [];
  if (!mlpPoint || !Number.isFinite(Number(mlpPoint.x)) || !Number.isFinite(Number(mlpPoint.y))) {
    return list[0]?.id || null;
  }
  const mx = Number(mlpPoint.x);
  const my = Number(mlpPoint.y);
  let closest = null;
  let minDist = Infinity;
  for (const seat of list) {
    if (!seat?.id) continue;
    const sx = Number(seat.x ?? seat.position?.x ?? 0);
    const sy = Number(seat.y ?? seat.position?.y ?? 0);
    if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue;
    const d = Math.hypot(sx - mx, sy - my);
    if (d < minDist) {
      minDist = d;
      closest = seat.id;
    }
  }
  return closest || (list[0]?.id || null);
}

/**
 * Classify reach for a set of improved seats (improvement direction).
 *
 * CORE: every applicable seat improved, including RSP.
 * RSP_SUBSET: RSP improved, but not every applicable seat.
 * MULTI_SECONDARY: RSP unchanged, >= 2 non-RSP seats improved.
 * ONE_SECONDARY: RSP unchanged, exactly 1 non-RSP seat improved.
 */
function classifyReach(improvedSeatIds, applicableSeatIds, rspSeatId) {
  const improved = new Set(improvedSeatIds);
  const applicable = new Set(applicableSeatIds);
  const rspImproved = rspSeatId != null && improved.has(rspSeatId);
  const allApplicableImproved =
    applicable.size > 0 && [...applicable].every((id) => improved.has(id));

  if (allApplicableImproved && rspImproved) return REACH.CORE;
  if (rspImproved) return REACH.RSP_SUBSET;
  if (improved.size >= 2) return REACH.MULTI_SECONDARY;
  if (improved.size === 1) return REACH.ONE_SECONDARY;
  return REACH.NONE;
}

/**
 * Classify reach for a set of degraded seats (degradation direction).
 */
function classifyDegradedReach(degradedSeatIds, applicableSeatIds, rspSeatId) {
  const degraded = new Set(degradedSeatIds);
  const applicable = new Set(applicableSeatIds);
  const rspDegraded = rspSeatId != null && degraded.has(rspSeatId);
  const allApplicableDegraded =
    applicable.size > 0 && [...applicable].every((id) => degraded.has(id));

  if (allApplicableDegraded && rspDegraded) return REACH.CORE;
  if (rspDegraded) return REACH.RSP_SUBSET;
  if (degraded.size >= 2) return REACH.MULTI_SECONDARY;
  if (degraded.size === 1) return REACH.ONE_SECONDARY;
  return REACH.NONE;
}

function buildContributionMap(rating) {
  return new Map((rating?.contributions || []).map((c) => [c.key, c]));
}

// ── Improvement impact ──────────────────────────────────────────────

/**
 * Build the Stage B improvement impact profile for one candidate.
 *
 * { primaryReach, failFixedAtPrimaryReach, maxGainAtPrimaryReach,
 *   breadthAtPrimaryReach, totalLevelGain, seatsImproved }
 */
export function buildImprovementImpactProfile(baselineRating, candidateRating, candidate, viewingChange = null) {
  const baselineContribs = buildContributionMap(baselineRating);
  const candidateContribs = buildContributionMap(candidateRating);
  const baselineSeatLevels = baselineRating?.seatLevels || {};
  const candidateSeatLevels = candidateRating?.seatLevels || {};

  const rspSeatId = findRspSeatId(candidate?.seats, candidate?.mlpPoint);

  const allKeys = new Set([...baselineContribs.keys(), ...candidateContribs.keys()]);
  const consequences = []; // { reach, gain, failFixed }
  let totalLevelGain = 0;
  const improvedSeatSet = new Set();

  for (const key of allKeys) {
    const bc = baselineContribs.get(key);
    const cc = candidateContribs.get(key);
    if (!bc || !cc) continue;
    const scope = bc.scope || cc.scope;

    if (scope === "room") {
      if (key === P12_KEY || key === P13_KEY) {
        const beforeRaw = baselineRating?.[`${key}RawDb`] ?? null;
        const afterRaw = candidateRating?.[`${key}RawDb`] ?? null;
        const gain = thresholdStepGain(beforeRaw, afterRaw, key);
        const lowest = lowestThresholdForKey(key);
        const failFixed =
          Number.isFinite(Number(beforeRaw)) && Number.isFinite(Number(afterRaw)) &&
          Number(beforeRaw) < lowest && Number(afterRaw) >= lowest ? 1 : 0;
        if (gain > 0 || failFixed > 0) {
          consequences.push({ reach: REACH.CORE, gain, failFixed });
          totalLevelGain += gain;
        }
      } else {
        const beforeRank = rankOf(bc.resultLevel);
        const afterRank = rankOf(cc.resultLevel);
        if (beforeRank == null || afterRank == null) continue;
        const gain = afterRank - beforeRank;
        const failFixed = bc.resultLevel === "FAIL" && cc.resultLevel !== "FAIL" ? 1 : 0;
        if (gain > 0 || failFixed > 0) {
          consequences.push({ reach: REACH.CORE, gain: Math.max(gain, 0), failFixed });
          totalLevelGain += Math.max(gain, 0);
        }
      }
    } else {
      const beforeSeatMap = baselineSeatLevels[key] || {};
      const afterSeatMap = candidateSeatLevels[key] || {};
      const seatIds = new Set([...Object.keys(beforeSeatMap), ...Object.keys(afterSeatMap)]);
      let maxGain = 0;
      let failFixed = 0;
      const improvedSeats = [];
      const applicableSeats = [];
      for (const seatId of seatIds) {
        const bl = beforeSeatMap[seatId];
        const al = afterSeatMap[seatId];
        if (!isScoredLevel(bl) || !isScoredLevel(al)) continue;
        applicableSeats.push(seatId);
        const br = rankOf(bl);
        const ar = rankOf(al);
        const g = ar - br;
        const ff = bl === "FAIL" && al !== "FAIL" ? 1 : 0;
        if (g > 0 || ff > 0) {
          improvedSeats.push(seatId);
          maxGain = Math.max(maxGain, g);
          failFixed += ff;
          improvedSeatSet.add(seatId);
        }
      }
      if (improvedSeats.length > 0) {
        const reach = classifyReach(improvedSeats, applicableSeats, rspSeatId);
        consequences.push({ reach, gain: maxGain, failFixed });
        totalLevelGain += maxGain;
      }
    }
  }

  // Viewing consequence (Stage C): CORE reach, no FAIL state.
  // Viewing does not contribute to seatsImproved (physical seat-scope RP22 only).
  if (viewingChange && viewingChange.beforeLevel && viewingChange.afterLevel) {
    const vBeforeRank = rankOf(viewingChange.beforeLevel);
    const vAfterRank = rankOf(viewingChange.afterLevel);
    if (vBeforeRank != null && vAfterRank != null) {
      const vGain = vAfterRank - vBeforeRank;
      if (vGain > 0) {
        consequences.push({ reach: REACH.CORE, gain: vGain, failFixed: 0 });
        totalLevelGain += vGain;
      }
    }
  }

  let primaryReach = REACH.NONE;
  for (const c of consequences) {
    if (c.reach > primaryReach) primaryReach = c.reach;
  }
  let failFixedAtPrimaryReach = 0;
  let maxGainAtPrimaryReach = 0;
  let breadthAtPrimaryReach = 0;
  for (const c of consequences) {
    if (c.reach === primaryReach) {
      failFixedAtPrimaryReach += c.failFixed;
      maxGainAtPrimaryReach = Math.max(maxGainAtPrimaryReach, c.gain);
      breadthAtPrimaryReach += 1;
    }
  }

  return {
    primaryReach,
    failFixedAtPrimaryReach,
    maxGainAtPrimaryReach,
    breadthAtPrimaryReach,
    totalLevelGain,
    seatsImproved: improvedSeatSet.size,
  };
}

// ── Degradation impact ──────────────────────────────────────────────

/**
 * Build the Stage B degradation impact profile for one candidate.
 *
 * { highestReachDegraded, maxLossAtHighestReach, breadthAtHighestReach,
 *   totalLevelLoss, seatsDegraded }
 *
 * Loss magnitudes are positive integers (beforeRank - afterRank).
 */
export function buildDegradationImpactProfile(baselineRating, candidateRating, candidate, viewingChange = null) {
  const baselineContribs = buildContributionMap(baselineRating);
  const candidateContribs = buildContributionMap(candidateRating);
  const baselineSeatLevels = baselineRating?.seatLevels || {};
  const candidateSeatLevels = candidateRating?.seatLevels || {};

  const rspSeatId = findRspSeatId(candidate?.seats, candidate?.mlpPoint);

  const allKeys = new Set([...baselineContribs.keys(), ...candidateContribs.keys()]);
  const consequences = []; // { reach, loss }
  let totalLevelLoss = 0;
  const degradedSeatSet = new Set();

  for (const key of allKeys) {
    const bc = baselineContribs.get(key);
    const cc = candidateContribs.get(key);
    if (!bc || !cc) continue;
    const scope = bc.scope || cc.scope;

    if (scope === "room") {
      if (key === P12_KEY || key === P13_KEY) {
        const beforeRaw = baselineRating?.[`${key}RawDb`] ?? null;
        const afterRaw = candidateRating?.[`${key}RawDb`] ?? null;
        const loss = thresholdStepLoss(beforeRaw, afterRaw, key);
        if (loss > 0) {
          consequences.push({ reach: REACH.CORE, loss });
          totalLevelLoss += loss;
        }
      } else {
        const beforeRank = rankOf(bc.resultLevel);
        const afterRank = rankOf(cc.resultLevel);
        if (beforeRank == null || afterRank == null) continue;
        const loss = beforeRank - afterRank;
        if (loss > 0) {
          consequences.push({ reach: REACH.CORE, loss });
          totalLevelLoss += loss;
        }
      }
    } else {
      const beforeSeatMap = baselineSeatLevels[key] || {};
      const afterSeatMap = candidateSeatLevels[key] || {};
      const seatIds = new Set([...Object.keys(beforeSeatMap), ...Object.keys(afterSeatMap)]);
      let maxLoss = 0;
      const degradedSeats = [];
      const applicableSeats = [];
      for (const seatId of seatIds) {
        const bl = beforeSeatMap[seatId];
        const al = afterSeatMap[seatId];
        if (!isScoredLevel(bl) || !isScoredLevel(al)) continue;
        applicableSeats.push(seatId);
        const br = rankOf(bl);
        const ar = rankOf(al);
        const l = br - ar;
        if (l > 0) {
          degradedSeats.push(seatId);
          maxLoss = Math.max(maxLoss, l);
          degradedSeatSet.add(seatId);
        }
      }
      if (degradedSeats.length > 0) {
        const reach = classifyDegradedReach(degradedSeats, applicableSeats, rspSeatId);
        consequences.push({ reach, loss: maxLoss });
        totalLevelLoss += maxLoss;
      }
    }
  }

  // Viewing consequence (Stage C): CORE reach, no FAIL state.
  // Viewing does not contribute to seatsDegraded (physical seat-scope RP22 only).
  if (viewingChange && viewingChange.beforeLevel && viewingChange.afterLevel) {
    const vBeforeRank = rankOf(viewingChange.beforeLevel);
    const vAfterRank = rankOf(viewingChange.afterLevel);
    if (vBeforeRank != null && vAfterRank != null) {
      const vLoss = vBeforeRank - vAfterRank;
      if (vLoss > 0) {
        consequences.push({ reach: REACH.CORE, loss: vLoss });
        totalLevelLoss += vLoss;
      }
    }
  }

  let highestReachDegraded = REACH.NONE;
  for (const c of consequences) {
    if (c.reach > highestReachDegraded) highestReachDegraded = c.reach;
  }
  let maxLossAtHighestReach = 0;
  let breadthAtHighestReach = 0;
  for (const c of consequences) {
    if (c.reach === highestReachDegraded) {
      maxLossAtHighestReach = Math.max(maxLossAtHighestReach, c.loss);
      breadthAtHighestReach += 1;
    }
  }

  return {
    highestReachDegraded,
    maxLossAtHighestReach,
    breadthAtHighestReach,
    totalLevelLoss,
    seatsDegraded: degradedSeatSet.size,
  };
}

// ── Comparators ─────────────────────────────────────────────────────

/**
 * Lexicographic improvement comparator. Descending (higher = better).
 * [primaryReach, failFixed, maxGain, breadth, totalGain, seatsImproved]
 */
export function compareImprovementImpact(a, b) {
  if (a.primaryReach !== b.primaryReach) return b.primaryReach - a.primaryReach;
  if (a.failFixedAtPrimaryReach !== b.failFixedAtPrimaryReach)
    return b.failFixedAtPrimaryReach - a.failFixedAtPrimaryReach;
  if (a.maxGainAtPrimaryReach !== b.maxGainAtPrimaryReach)
    return b.maxGainAtPrimaryReach - a.maxGainAtPrimaryReach;
  if (a.breadthAtPrimaryReach !== b.breadthAtPrimaryReach)
    return b.breadthAtPrimaryReach - a.breadthAtPrimaryReach;
  if (a.totalLevelGain !== b.totalLevelGain) return b.totalLevelGain - a.totalLevelGain;
  if (a.seatsImproved !== b.seatsImproved) return b.seatsImproved - a.seatsImproved;
  return 0;
}

/**
 * Lexicographic degradation comparator. Ascending (lower = safer).
 * [highestReachDegraded, maxLoss, breadth, totalLoss, seatsDegraded]
 */
export function compareDegradationImpact(a, b) {
  if (a.highestReachDegraded !== b.highestReachDegraded)
    return a.highestReachDegraded - b.highestReachDegraded;
  if (a.maxLossAtHighestReach !== b.maxLossAtHighestReach)
    return a.maxLossAtHighestReach - b.maxLossAtHighestReach;
  if (a.breadthAtHighestReach !== b.breadthAtHighestReach)
    return a.breadthAtHighestReach - b.breadthAtHighestReach;
  if (a.totalLevelLoss !== b.totalLevelLoss) return a.totalLevelLoss - b.totalLevelLoss;
  if (a.seatsDegraded !== b.seatsDegraded) return a.seatsDegraded - b.seatsDegraded;
  return 0;
}

/**
 * LCR capability reserve comparator (Stage E1).
 *
 * Tie-break ONLY — applies after primary RP22 impact and viewing consequence,
 * but before disruption/confidence/ASDR. Compares canonical P12 design
 * capability (p12RawDb) descending. Higher genuine capability ranks first.
 *
 * Returns 0 when either candidate is not an LCR material upgrade, or when
 * either has a non-finite P12 design value. Never overrides a candidate with
 * genuinely greater primary RP22 impact — those are already separated by
 * compareImprovementImpact before this runs.
 */
export function compareLcrCapabilityReserve(a, b) {
  const aIsLcrUpgrade = a?.kind === "lcr" && a?.recommendationDirection === "upgrade";
  const bIsLcrUpgrade = b?.kind === "lcr" && b?.recommendationDirection === "upgrade";
  if (!aIsLcrUpgrade || !bIsLcrUpgrade) return 0;

  const aP12 = Number(a?.p12DesignDb ?? a?.p12RawDb);
  const bP12 = Number(b?.p12DesignDb ?? b?.p12RawDb);
  if (!Number.isFinite(aP12) || !Number.isFinite(bP12)) return 0;

  return bP12 - aP12;
}