// stage2PlacementRanking.js
// P14-INDEPENDENT ranking of Stage 2 finalists by raw transfer quality.
//
// This ranking selects the best physical placement WITHOUT using P14-dependent
// P19/P20 threshold crossings. It uses only:
//   - Raw room/seat transfer (pre-EQ)
//   - Spatial consistency (seat-to-seat variation)
//   - Broad modal/null behaviour (null depth, peak height)
//   - Approved family practicality (family preference rank)
//
// The Liverpool test proved why this matters: the 2-sub winner flipped at
// Recommended L4 only because a P19 value crossed an L2 boundary as P18
// moved, while the P14-independent layout still had substantially better raw
// consistency and P20. That is not sufficient reason to move the subwoofers.
//
// Ranking tuple (ordered, higher = better, minimisation objectives negated):
//   1.  -(worst primary raw null depth dB)       — broad modal/null behaviour
//   2.  -(mean primary seat-to-seat variation dB) — raw consistency
//   3.  -(worst primary spatial deviation dB)    — spatial consistency
//   4.  -(worst secondary raw null depth dB)      — secondary broad modal/null
//   5.  -(family preference rank)                  — approved family practicality
//   6.  deterministic coordinate key               — stable tiebreaker

import { getFamilyPreferenceRank } from "../stage1/stage1FamilyRegistry";
import { STAGE2_TIE_TOLERANCE_DB } from "./stage2Constants";

/**
 * Compute the raw null depth for a single seat's raw curve.
 * Null depth = max(0, meanSPL - minSPL) over the assessment band.
 * This measures the deepest dip relative to the average level.
 * @private
 */
function computeRawNullDepthDb(rawCurve) {
  if (!Array.isArray(rawCurve) || rawCurve.length < 3) return 0;
  const valid = rawCurve.filter((p) => Number.isFinite(p?.spl));
  if (valid.length < 3) return 0;
  const spls = valid.map((p) => p.spl);
  const mean = spls.reduce((sum, v) => sum + v, 0) / spls.length;
  const min = Math.min(...spls);
  return Math.max(0, mean - min);
}

/**
 * Compute the mean SPL of a raw curve.
 * @private
 */
function computeMeanSpl(rawCurve) {
  if (!Array.isArray(rawCurve) || rawCurve.length === 0) return null;
  const valid = rawCurve.filter((p) => Number.isFinite(p?.spl));
  if (valid.length === 0) return null;
  return valid.reduce((sum, p) => sum + p.spl, 0) / valid.length;
}

/**
 * Compute the seat-to-seat variation across primary seats.
 * For each frequency, compute the range (max - min) of SPL across all
 * primary seats. Return the mean range across all frequencies.
 * Lower is better (more consistent across seats).
 * @private
 */
function computeSeatToSeatVariationDb(perSeatCurves, primarySeatIds) {
  if (!perSeatCurves.length || !primarySeatIds.size) return 0;

  const primaryCurves = perSeatCurves.filter((s) => primarySeatIds.has(String(s.seatId)));
  if (primaryCurves.length < 2) return 0;

  // Build frequency-indexed SPL arrays
  const freqMap = new Map();
  for (const seat of primaryCurves) {
    for (const point of seat.responseData || []) {
      if (!Number.isFinite(point?.frequency) || !Number.isFinite(point?.spl)) continue;
      const f = Math.round(point.frequency * 100) / 100;
      if (!freqMap.has(f)) freqMap.set(f, []);
      freqMap.get(f).push(point.spl);
    }
  }

  let totalRange = 0;
  let count = 0;
  for (const spls of freqMap.values()) {
    if (spls.length >= 2) {
      totalRange += Math.max(...spls) - Math.min(...spls);
      count++;
    }
  }
  return count > 0 ? totalRange / count : 0;
}

/**
 * Compute the spatial deviation of each primary seat from the RSP curve.
 * For each primary seat, compute the mean absolute deviation from the RSP
 * curve across all frequencies. Return the worst (max) across primary seats.
 * Lower is better (seats track the RSP more closely).
 * @private
 */
function computeSpatialDeviationDb(rspRawCurve, perSeatCurves, primarySeatIds) {
  if (!rspRawCurve.length || !perSeatCurves.length || !primarySeatIds.size) return 0;

  const rspByFreq = new Map();
  for (const point of rspRawCurve) {
    if (!Number.isFinite(point?.frequency) || !Number.isFinite(point?.spl)) continue;
    const f = Math.round(point.frequency * 100) / 100;
    rspByFreq.set(f, point.spl);
  }

  const primaryCurves = perSeatCurves.filter((s) => primarySeatIds.has(String(s.seatId)));
  if (!primaryCurves.length) return 0;

  let worstDeviation = 0;
  for (const seat of primaryCurves) {
    let totalDev = 0;
    let count = 0;
    for (const point of seat.responseData || []) {
      if (!Number.isFinite(point?.frequency) || !Number.isFinite(point?.spl)) continue;
      const f = Math.round(point.frequency * 100) / 100;
      const rspSpl = rspByFreq.get(f);
      if (Number.isFinite(rspSpl)) {
        totalDev += Math.abs(point.spl - rspSpl);
        count++;
      }
    }
    const meanDev = count > 0 ? totalDev / count : 0;
    worstDeviation = Math.max(worstDeviation, meanDev);
  }
  return worstDeviation;
}

/**
 * Build the P14-independent placement ranking tuple for a raw transfer result.
 *
 * @param {object} rawTransfer — { finalistId, familyId, quantity, coordinates, rspRawCurve, perSeatRawCurves, sources }
 * @param {Map} seatPriorityMap — seatId → "primary" | "secondary"
 * @returns {object} { rankingTuple, placementMetrics }
 */
export function buildPlacementRankingTuple(rawTransfer, seatPriorityMap) {
  const { rspRawCurve, perSeatRawCurves, familyId, coordinates } = rawTransfer;

  const primarySeatIds = new Set();
  const secondarySeatIds = new Set();
  if (seatPriorityMap) {
    for (const [seatId, priority] of seatPriorityMap.entries()) {
      if (priority === "primary") primarySeatIds.add(String(seatId));
      else secondarySeatIds.add(String(seatId));
    }
  }

  // Broad modal/null behaviour: worst raw null depth across primary seats
  const primaryCurves = (perSeatRawCurves || []).filter((s) => primarySeatIds.has(String(s.seatId)));
  const primaryNullDepths = primaryCurves.map((s) => computeRawNullDepthDb(s.responseData));
  const worstPrimaryNullDepth = primaryNullDepths.length ? Math.max(...primaryNullDepths) : 0;

  // Also include RSP null depth as a proxy if no primary seats
  const rspNullDepth = computeRawNullDepthDb(rspRawCurve);
  const effectivePrimaryNullDepth = Math.max(worstPrimaryNullDepth, rspNullDepth);

  // Raw consistency: mean seat-to-seat variation across primary seats
  const seatToSeatVariation = computeSeatToSeatVariationDb(perSeatRawCurves || [], primarySeatIds);

  // Spatial consistency: worst primary seat deviation from RSP
  const spatialDeviation = computeSpatialDeviationDb(rspRawCurve || [], perSeatRawCurves || [], primarySeatIds);

  // Secondary broad modal/null behaviour
  const secondaryCurves = (perSeatRawCurves || []).filter((s) => secondarySeatIds.has(String(s.seatId)));
  const secondaryNullDepths = secondaryCurves.map((s) => computeRawNullDepthDb(s.responseData));
  const worstSecondaryNullDepth = secondaryNullDepths.length ? Math.max(...secondaryNullDepths) : 0;

  // Family preference
  const familyRank = getFamilyPreferenceRank(familyId);

  // Deterministic coordinate key
  const coordKey = (coordinates || [])
    .map((c) => `${(c.x || 0).toFixed(3)},${(c.y || 0).toFixed(3)}`)
    .sort().join("|");

  const rankingTuple = [
    -effectivePrimaryNullDepth,
    -seatToSeatVariation,
    -spatialDeviation,
    -worstSecondaryNullDepth,
    -familyRank,
    coordKey,
  ];

  return {
    rankingTuple,
    placementMetrics: {
      worstPrimaryNullDepth: effectivePrimaryNullDepth,
      seatToSeatVariation,
      spatialDeviation,
      worstSecondaryNullDepth,
      familyRank,
    },
  };
}

/**
 * Compare two placement results lexicographically by P14-independent ranking.
 * Returns negative if a ranks higher (better), positive if b ranks higher.
 */
export function comparePlacementResults(a, b) {
  const ta = Array.isArray(a?.placementRanking?.rankingTuple) ? a.placementRanking.rankingTuple : null;
  const tb = Array.isArray(b?.placementRanking?.rankingTuple) ? b.placementRanking.rankingTuple : null;
  if (!ta && !tb) return 0;
  if (!ta) return 1;
  if (!tb) return -1;

  const len = Math.max(ta.length, tb.length);
  for (let i = 0; i < len; i += 1) {
    const va = ta[i] ?? 0;
    const vb = tb[i] ?? 0;
    if (typeof va === "number" && typeof vb === "number") {
      if (Math.abs(va - vb) > STAGE2_TIE_TOLERANCE_DB) return vb - va;
    } else {
      if (va !== vb) return va < vb ? -1 : 1;
    }
  }
  return 0;
}

/**
 * Check whether two placement results are genuinely tied (first 3 tuple
 * elements match within tolerance). Used to decide whether an alternate
 * finalist should be confirmed.
 */
export function isPlacementTied(a, b) {
  const ta = Array.isArray(a?.placementRanking?.rankingTuple) ? a.placementRanking.rankingTuple : null;
  const tb = Array.isArray(b?.placementRanking?.rankingTuple) ? b.placementRanking.rankingTuple : null;
  if (!ta || !tb) return false;
  for (let i = 0; i < 3; i += 1) {
    const va = ta[i] ?? 0;
    const vb = tb[i] ?? 0;
    if (Math.abs(va - vb) > STAGE2_TIE_TOLERANCE_DB) return false;
  }
  return true;
}