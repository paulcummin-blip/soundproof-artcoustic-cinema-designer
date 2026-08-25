// stage1Screening.js
// Neutral Stage 1 screening metrics and lexicographic ranking.
// NO P19/P20 labels — Stage 2 owns canonical P19/P20.

import {
  STAGE1_SCREENING_FREQ_MIN_HZ,
  STAGE1_SCREENING_FREQ_MAX_HZ,
  STAGE1_NULL_RULE,
  STAGE1_TIE_TOLERANCE,
} from "./stage1Constants";
import { getFamilyPreferenceRank } from "./stage1FamilyRegistry";
import { resolveSeatPriority, PRIMARY } from "@/components/utils/seatPriorityAuthority";

const mean = (values) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0);

// ── Curve helpers ───────────────────────────────────────────────────────

function filterToScreeningBand(curve) {
  return (curve || []).filter(
    (p) => p.frequency >= STAGE1_SCREENING_FREQ_MIN_HZ && p.frequency <= STAGE1_SCREENING_FREQ_MAX_HZ && Number.isFinite(p.spl),
  );
}

function smoothCurve(curve) {
  const radius = STAGE1_NULL_RULE.smoothingRadiusBins;
  return curve.map((point, index) => {
    const values = curve.slice(Math.max(0, index - radius), index + radius + 1).map((item) => item.spl).filter(Number.isFinite);
    return { frequency: point.frequency, spl: mean(values) };
  });
}

function detectBroadNulls(curve) {
  const smooth = smoothCurve(curve);
  const depths = smooth.map((point, index) => {
    const radius = STAGE1_NULL_RULE.shoulderRadiusBins;
    const shoulders = smooth.slice(Math.max(0, index - radius), Math.max(0, index - 1))
      .concat(smooth.slice(index + 2, index + radius + 1))
      .map((item) => item.spl).filter(Number.isFinite);
    return { ...point, depthDb: Math.max(0, mean(shoulders) - point.spl) };
  });
  const groups = [];
  let active = [];
  depths.forEach((point) => {
    if (point.depthDb >= STAGE1_NULL_RULE.destructiveDepthDb) active.push(point);
    else if (active.length) { groups.push(active); active = []; }
  });
  if (active.length) groups.push(active);
  return groups
    .filter((group) => group.length >= STAGE1_NULL_RULE.minimumContiguousBins)
    .map((group) => ({
      centreHz: group.reduce((best, item) => (item.depthDb > best.depthDb ? item : best)).frequency,
      depthDb: Math.max(...group.map((item) => item.depthDb)),
      bins: group.length,
    }));
}

// ── Per-seat metrics ────────────────────────────────────────────────────

function seatVariationFromMean(curve) {
  if (!curve.length) return 0;
  const avg = mean(curve.map((p) => p.spl));
  return Math.sqrt(mean(curve.map((p) => (p.spl - avg) ** 2)));
}

function seatRspDifference(seatCurve, rspCurve) {
  if (!seatCurve.length || !rspCurve.length) return 0;
  const rspByHz = new Map(rspCurve.map((p) => [p.frequency, p.spl]));
  const diffs = seatCurve
    .map((p) => {
      const rsp = rspByHz.get(p.frequency);
      return Number.isFinite(rsp) ? Math.abs(p.spl - rsp) : null;
    })
    .filter(Number.isFinite);
  return mean(diffs);
}

// ── Spatial variation across a group of seats ──────────────────────────

function worstSpatialVariation(curves) {
  if (curves.length < 2) return 0;
  const length = Math.min(...curves.map((c) => c.length));
  let worst = 0;
  for (let i = 0; i < length; i += 1) {
    const values = curves.map((c) => c[i]?.spl).filter(Number.isFinite);
    if (values.length > 1) {
      const variation = Math.max(...values) - Math.min(...values);
      if (variation > worst) worst = variation;
    }
  }
  return worst;
}

// ── Main screening function ────────────────────────────────────────────

/**
 * Compute neutral Stage 1 screening metrics for a candidate layout.
 *
 * @param {object} params
 * @param {object} params.transferResult — from computeNormalizedRoomTransfer
 * @param {Array} params.seatingPositions — original seats with priority
 * @param {object} params.candidate — { familyId, sources, ... }
 * @returns {object} screening metrics + ranking tuple
 */
export function screenCandidate({ transferResult, seatingPositions, candidate }) {
  const rspCurve = filterToScreeningBand(transferResult.rspCurve);
  const seatCurvesRaw = (transferResult.seatCurves || []).map((sc) => ({
    seatKey: sc.seatKey,
    originalSeatId: sc.originalSeatId,
    curve: filterToScreeningBand(sc.responseData),
  }));

  // Map seat curves to priority using original seating positions
  const seatPriorityMap = new Map();
  (Array.isArray(seatingPositions) ? seatingPositions : []).forEach((seat) => {
    const id = String(seat.id || "");
    if (id) seatPriorityMap.set(id, resolveSeatPriority(seat));
  });

  const primaryCurves = [];
  const secondaryCurves = [];
  seatCurvesRaw.forEach((sc) => {
    const id = String(sc.originalSeatId || "");
    const priority = seatPriorityMap.get(id) || PRIMARY;
    if (priority === PRIMARY) primaryCurves.push(sc.curve);
    else secondaryCurves.push(sc.curve);
  });

  // Per-seat metrics
  const primaryPerSeat = primaryCurves.map((curve) => {
    const nulls = detectBroadNulls(curve);
    const worstNullDepth = Math.max(0, ...nulls.map((n) => n.depthDb));
    const hasSevereNull = nulls.some((n) => n.depthDb >= STAGE1_NULL_RULE.severeDepthDb);
    const variationFromMean = seatVariationFromMean(curve);
    const rspDiff = seatRspDifference(curve, rspCurve);
    return { nulls, worstNullDepth, hasSevereNull, variationFromMean, rspDiff };
  });

  const secondaryPerSeat = secondaryCurves.map((curve) => ({
    variationFromMean: seatVariationFromMean(curve),
  }));

  // ── Screening metrics (neutral — NO P19/P20) ────────────────────────
  const primarySevereProblemCount = primaryPerSeat.filter((s) => s.hasSevereNull).length;
  const worstPrimarySpatialVariation = worstSpatialVariation(primaryCurves);
  const primaryResponseSmoothness = -mean(primaryPerSeat.map((s) => s.variationFromMean));
  const primaryRspCoherence = -mean(primaryPerSeat.map((s) => s.rspDiff));
  const secondarySpatialConsistency = secondaryCurves.length > 1 ? worstSpatialVariation(secondaryCurves) : 0;
  // Efficiency: mean RSP transfer level in the screening band. Higher = more
  // efficient room coupling. Product-independent (referenced to flat 94 dB source).
  const efficiencyIndicator = rspCurve.length ? mean(rspCurve.map((p) => p.spl)) : 0;

  const familyPreferenceRank = getFamilyPreferenceRank(candidate.familyId);

  // ── Lexicographic ranking tuple ─────────────────────────────────────
  // Each element: higher = better. Negate minimisation objectives.
  const rankingTuple = [
    -primarySevereProblemCount,
    -worstPrimarySpatialVariation,
    primaryResponseSmoothness,
    primaryRspCoherence,
    -secondarySpatialConsistency,
    efficiencyIndicator,
    -familyPreferenceRank,
  ];

  return {
    familyId: candidate.familyId,
    sourceCount: candidate.sources.length,
    primarySevereProblemCount,
    worstPrimarySpatialVariation,
    primaryResponseSmoothness,
    primaryRspCoherence,
    secondarySpatialConsistency,
    efficiencyIndicator,
    familyPreferenceRank,
    rankingTuple,
    primarySeatCount: primaryCurves.length,
    secondarySeatCount: secondaryCurves.length,
    rspAvailable: rspCurve.length > 0,
  };
}

// ── Lexicographic comparator ───────────────────────────────────────────

/**
 * Compare two screening results lexicographically.
 * Returns negative if a ranks higher (better), positive if b ranks higher.
 */
export function compareScreeningResults(a, b) {
  const ta = a.rankingTuple;
  const tb = b.rankingTuple;
  const tol = STAGE1_TIE_TOLERANCE;

  // 1. Primary severe-problem count (minimise)
  if (a.primarySevereProblemCount !== b.primarySevereProblemCount) {
    return a.primarySevereProblemCount - b.primarySevereProblemCount;
  }

  // 2. Worst Primary spatial variation (minimise)
  if (Math.abs(a.worstPrimarySpatialVariation - b.worstPrimarySpatialVariation) > tol.variationDb) {
    return a.worstPrimarySpatialVariation - b.worstPrimarySpatialVariation;
  }

  // 3. Primary broad response quality / smoothness (maximise)
  if (Math.abs(a.primaryResponseSmoothness - b.primaryResponseSmoothness) > tol.smoothnessDb) {
    return b.primaryResponseSmoothness - a.primaryResponseSmoothness;
  }

  // 4. Primary RSP/seat coherence (maximise)
  if (Math.abs(a.primaryRspCoherence - b.primaryRspCoherence) > tol.coherenceDb) {
    return b.primaryRspCoherence - a.primaryRspCoherence;
  }

  // 5. Secondary consistency (minimise)
  if (Math.abs(a.secondarySpatialConsistency - b.secondarySpatialConsistency) > tol.variationDb) {
    return a.secondarySpatialConsistency - b.secondarySpatialConsistency;
  }

  // 6. Efficiency (maximise) — late tiebreaker
  if (Math.abs(a.efficiencyIndicator - b.efficiencyIndicator) > tol.efficiencyDb) {
    return b.efficiencyIndicator - a.efficiencyIndicator;
  }

  // 7. Practical family preference (lower rank = better)
  return a.familyPreferenceRank - b.familyPreferenceRank;
}