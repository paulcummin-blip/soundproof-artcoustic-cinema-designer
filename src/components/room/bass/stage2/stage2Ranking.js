// stage2Ranking.js
// Strict lexicographic ranking for Stage 2 canonical finalist evaluation.
// No blended weighted score — acoustic Primary-seat performance always
// outranks family preference.
//
// Ranking tuple (ordered, each element: higher = better, minimisation
// objectives are negated):
//   1.  -(Primary P19 below L2 count)
//   2.  -(Primary P20 below L2 count)
//   3.  worst Primary combined P19/P20 level (min → worst)
//   4.  Primary L4 count
//   5.  Primary L3+ count
//   6.  -(worst Primary whole-dB P19 deviation)
//   7.  -(worst Primary whole-dB P20 deviation)
//   8.  -(Secondary P19 FAIL count)
//   9.  Secondary L2+ coverage
//   10. Secondary L1+ coverage
//   11. P14 headroom dB
//   12. -(efficiency loss — not yet available, 0)
//   13. -(family preference rank)
//   14. -(local displacement — not yet available, 0)
//   15. -(asymmetry — not yet available, 0)
//   16. deterministic coordinate key (string comparison)

import { getFamilyPreferenceRank } from "../stage1/stage1FamilyRegistry";
import { STAGE2_TIE_TOLERANCE_DB } from "./stage2Constants";

/**
 * Build a per-seat summary from P19/P20 results.
 * @private
 */
function buildSeatSummary(perSeatP19, perSeatP20, seatPriorityMap) {
  const p19BySeat = new Map((perSeatP19 || []).map((s) => [String(s.seatId), s]));
  const p20BySeat = new Map((perSeatP20 || []).map((s) => [String(s.seatId), s]));

  const primarySeats = [];
  const secondarySeats = [];

  for (const [seatId, priority] of seatPriorityMap.entries()) {
    const p19 = p19BySeat.get(seatId);
    const p20 = p20BySeat.get(seatId);
    if (!p19 && !p20) continue;
    const seatData = {
      seatId,
      isPrimary: priority === "primary",
      p19Level: p19?.level ?? 0,
      p19VariationDb: p19?.variationDbRaw ?? null,
      p19WorstFrequencyHz: p19?.worstFrequencyHz ?? null,
      p20Level: p20?.level ?? 0,
      p20VariationDb: p20?.variationDbRaw ?? null,
      p20WorstFrequencyHz: p20?.worstFrequencyHz ?? null,
    };
    if (priority === "primary") primarySeats.push(seatData);
    else secondarySeats.push(seatData);
  }

  return { primarySeats, secondarySeats };
}

/**
 * Compute the worst Primary combined P19/P20 level.
 * For each Primary seat: combinedLevel = min(p19Level, p20Level).
 * Worst = min across all Primary seats.
 * @private
 */
function worstPrimaryCombinedLevel(primarySeats) {
  if (!primarySeats.length) return 0;
  return Math.min(...primarySeats.map((s) => Math.min(s.p19Level || 0, s.p20Level || 0)));
}

/**
 * Build the lexicographic ranking tuple for a Stage 2 finalist result.
 *
 * @param {object} result — Stage 2 finalist evaluation result
 * @param {Map} seatPriorityMap — seatId → "primary" | "secondary"
 * @returns {object} { rankingTuple, primarySummary, secondarySummary }
 */
export function buildStage2RankingTuple(result, seatPriorityMap) {
  const { primarySeats, secondarySeats } = buildSeatSummary(
    result.perSeatP19, result.perSeatP20, seatPriorityMap,
  );

  // Primary metrics
  const primaryP19BelowL2 = primarySeats.filter((s) => (s.p19Level || 0) < 2).length;
  const primaryP20BelowL2 = primarySeats.filter((s) => (s.p20Level || 0) < 2).length;
  const worstPrimaryCombined = worstPrimaryCombinedLevel(primarySeats);
  const primaryL4Count = primarySeats.filter((s) => (s.p19Level || 0) >= 4 && (s.p20Level || 0) >= 4).length;
  const primaryL3PlusCount = primarySeats.filter((s) => (s.p19Level || 0) >= 3 && (s.p20Level || 0) >= 3).length;
  // Whole-dB (floored) deviations — raw fractional deviations remain as
  // diagnostics on the seat summary but are NOT ranking fields. This prevents
  // fractional raw differences from overriding whole-dB grading authority.
  const worstPrimaryP19Deviation = primarySeats.length
    ? Math.floor(Math.max(...primarySeats.map((s) => Math.abs(s.p19VariationDb ?? 0))))
    : 0;
  const worstPrimaryP20Deviation = primarySeats.length
    ? Math.floor(Math.max(...primarySeats.map((s) => Math.abs(s.p20VariationDb ?? 0))))
    : 0;

  // Secondary metrics
  const secondaryP19Fail = secondarySeats.filter((s) => (s.p19Level || 0) === 0).length;
  const secondaryL2Plus = secondarySeats.filter((s) => (s.p19Level || 0) >= 2 && (s.p20Level || 0) >= 2).length;
  const secondaryL1Plus = secondarySeats.filter((s) => (s.p19Level || 0) >= 1 && (s.p20Level || 0) >= 1).length;

  // P14 headroom
  const p14HeadroomDb = Number.isFinite(result.p14HeadroomDb) ? result.p14HeadroomDb : -Infinity;

  // Family preference
  const familyRank = getFamilyPreferenceRank(result.familyId);

  // Deterministic coordinate key
  const coordKey = (result.coordinates || [])
    .map((c) => `${(c.x || 0).toFixed(3)},${(c.y || 0).toFixed(3)}`)
    .sort().join("|");

  const rankingTuple = [
    -primaryP19BelowL2,
    -primaryP20BelowL2,
    worstPrimaryCombined,
    primaryL4Count,
    primaryL3PlusCount,
    -worstPrimaryP19Deviation,
    -worstPrimaryP20Deviation,
    -secondaryP19Fail,
    secondaryL2Plus,
    secondaryL1Plus,
    p14HeadroomDb,
    0, // efficiency loss — not yet available
    -familyRank,
    0, // local displacement — not yet available
    0, // asymmetry — not yet available
    coordKey,
  ];

  return {
    rankingTuple,
    primarySummary: {
      seatCount: primarySeats.length,
      p19BelowL2: primaryP19BelowL2,
      p20BelowL2: primaryP20BelowL2,
      worstCombinedLevel: worstPrimaryCombined,
      l4Count: primaryL4Count,
      l3PlusCount: primaryL3PlusCount,
      worstP19Deviation: worstPrimaryP19Deviation,
      worstP20Deviation: worstPrimaryP20Deviation,
      seats: primarySeats,
    },
    secondarySummary: {
      seatCount: secondarySeats.length,
      p19Fail: secondaryP19Fail,
      l2Plus: secondaryL2Plus,
      l1Plus: secondaryL1Plus,
      seats: secondarySeats,
    },
  };
}

/**
 * Compare two Stage 2 finalist results lexicographically.
 * Returns negative if a ranks higher (better), positive if b ranks higher.
 */
export function compareStage2Results(a, b) {
  const ta = Array.isArray(a?.rankingTuple) ? a.rankingTuple : [];
  const tb = Array.isArray(b?.rankingTuple) ? b.rankingTuple : [];
  const len = Math.max(ta.length, tb.length);
  for (let i = 0; i < len; i += 1) {
    const va = ta[i] ?? 0;
    const vb = tb[i] ?? 0;
    // Numeric comparison with tolerance for floating-point fields
    if (typeof va === "number" && typeof vb === "number") {
      if (Math.abs(va - vb) > STAGE2_TIE_TOLERANCE_DB) return vb - va;
    } else {
      // String comparison (coordinate key)
      if (va !== vb) return va < vb ? -1 : 1;
    }
  }
  return 0;
}

/**
 * Check whether a finalist result meets the stop condition for a quantity.
 * Stop when all Primary P19/P20 are L4 and all Secondary are at least L2,
 * or all Primary P19/P20 are at least L3, Secondary has no P19 FAIL and
 * all Secondary P19/P20 are at least L2.
 */
export function meetsStopCondition(rankingData) {
  const primary = rankingData?.primarySummary;
  const secondary = rankingData?.secondarySummary;
  if (!primary || !secondary) return false;

  const allPrimaryL4 = primary.seats.length > 0
    && primary.seats.every((s) => (s.p19Level || 0) >= 4 && (s.p20Level || 0) >= 4);
  const allSecondaryL2 = secondary.seats.length === 0
    || secondary.seats.every((s) => (s.p19Level || 0) >= 2 && (s.p20Level || 0) >= 2);
  if (allPrimaryL4 && allSecondaryL2) return true;

  const allPrimaryL3 = primary.seats.length > 0
    && primary.seats.every((s) => (s.p19Level || 0) >= 3 && (s.p20Level || 0) >= 3);
  const noSecondaryP19Fail = secondary.p19Fail === 0;
  const allSecondaryL2Alt = secondary.seats.length === 0
    || secondary.seats.every((s) => (s.p19Level || 0) >= 2 && (s.p20Level || 0) >= 2);
  return allPrimaryL3 && noSecondaryP19Fail && allSecondaryL2Alt;
}