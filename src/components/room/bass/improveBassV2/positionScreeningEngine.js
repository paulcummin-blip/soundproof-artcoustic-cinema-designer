// positionScreeningEngine.js
// Stage 11B: Fast zero-tuning position screening using the batch modal evaluator.
//
// Uses evaluateBatchModalTransfers from the validated batch modal machinery
// to compute per-source per-listener complex transfers with ZERO tuning.
// Auto-align delays are applied afterwards through complex re-summation
// (resumWithTuning) for proxy scoring.
//
// Per-seat proxy metrics use the CORRECT responseData property (not points/curve).
//
// Screening is DISCOVERY ONLY. Canonical confirmation happens downstream.

import { prepareModeBank } from "@/bass/core/rewBassEngine";
import { evaluateBatchModalTransfers } from "@/bass/core/batchModalEvaluator";
import { resumWithTuning } from "../stage2/stage2TuningSearch.js";
import { REW_SOURCE_CURVES } from "../rewSourceCurves.js";
import { resolveSeatPriority, PRIMARY } from "@/components/utils/seatPriorityAuthority";
import { buildAuthoritativeRspPosition } from "../authoritativeRspPosition.js";

const FLAT_SOURCE_CURVE = REW_SOURCE_CURVES.flat_rew_reference;

const SCREEN_FREQ_MIN_HZ = 20;
const SCREEN_FREQ_MAX_HZ = 120;
const NULL_DEPTH_THRESHOLD_DB = 8;
const NULL_MIN_CONTIGUOUS = 2;
const SMOOTHING_RADIUS = 1;

// ── Helpers ──────────────────────────────────────────────────────────────

function mean(values) {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}

function smoothCurve(curve, radius = SMOOTHING_RADIUS) {
  return curve.map((point, index) => {
    const values = curve
      .slice(Math.max(0, index - radius), index + radius + 1)
      .map((p) => p.spl)
      .filter(Number.isFinite);
    return { frequency: point.frequency, spl: mean(values) };
  });
}

function detectBroadNulls(curve) {
  const smooth = smoothCurve(curve);
  const assessed = smooth.map((point, index) => {
    const shoulders = smooth
      .slice(Math.max(0, index - 4), Math.max(0, index - 1))
      .concat(smooth.slice(index + 2, index + 5))
      .map((p) => p.spl)
      .filter(Number.isFinite);
    return { ...point, depthDb: Math.max(0, mean(shoulders) - point.spl) };
  });
  const groups = [];
  let active = [];
  assessed.forEach((point) => {
    if (point.depthDb >= NULL_DEPTH_THRESHOLD_DB) active.push(point);
    else if (active.length) { groups.push(active); active = []; }
  });
  if (active.length) groups.push(active);
  return groups
    .filter((g) => g.length >= NULL_MIN_CONTIGUOUS)
    .map((g) => ({
      centreHz: g.reduce((best, p) => (p.depthDb > best.depthDb ? p : best)).frequency,
      depthDb: Math.max(...g.map((p) => p.depthDb)),
      bins: g.length,
    }));
}

function peakToPeak(spls) {
  if (!spls.length) return 0;
  return Math.max(...spls) - Math.min(...spls);
}

function variationFromMean(curve) {
  if (!curve.length) return 0;
  const avg = mean(curve.map((p) => p.spl));
  return Math.sqrt(mean(curve.map((p) => (p.spl - avg) ** 2)));
}

// ── Auto-align delay computation ─────────────────────────────────────────

function computeAutoAlignDelays(sources, rspPosition) {
  if (!rspPosition) return sources.map(() => 0);
  const c = 343;
  return sources.map((s) => {
    const dist = Math.hypot(s.x - rspPosition.x, s.y - rspPosition.y);
    return (dist / c) * 1000; // ms
  });
}

function normaliseDelays(delays) {
  const min = Math.min(...delays);
  return delays.map((d) => Math.max(0, d - min));
}

// ── Build listeners ───────────────────────────────────────────────────────

function buildListeners(rspPosition, seatingPositions) {
  const listeners = [];
  if (rspPosition && Number.isFinite(rspPosition.x) && Number.isFinite(rspPosition.y)) {
    listeners.push({
      id: "rsp",
      x: rspPosition.x,
      y: rspPosition.y,
      z: Number.isFinite(Number(rspPosition.z)) ? Number(rspPosition.z) : 1.2,
    });
  }
  if (Array.isArray(seatingPositions)) {
    for (const seat of seatingPositions) {
      if (seat && Number.isFinite(seat.x) && Number.isFinite(seat.y)) {
        listeners.push({
          id: seat.id || `seat-${listeners.length}`,
          x: seat.x,
          y: seat.y,
          z: Number.isFinite(Number(seat.z)) ? Number(seat.z) : 1.2,
        });
      }
    }
  }
  return listeners;
}

function buildSeatPriorityMap(seatingPositions) {
  const map = new Map();
  if (Array.isArray(seatingPositions)) {
    for (const seat of seatingPositions) {
      map.set(seat.id, resolveSeatPriority(seat) === PRIMARY);
    }
  }
  return map;
}

// ── Build zero-tuning sources for batch evaluator ─────────────────────────

function buildZeroTuningSources(positions, bottomHeightM, subHeightM) {
  const z = (Number(bottomHeightM) || 0) + (Number(subHeightM) || 0.5) / 2;
  return positions.map((pos, i) => ({
    x: Number(pos.x),
    y: Number(pos.y),
    z,
    tuning: { delayMs: 0, gainDb: 0, polarity: 0 },
    sourceCurve: FLAT_SOURCE_CURVE,
  }));
}

// ── Per-seat proxy metrics ────────────────────────────────────────────────

function computeSeatProxyMetrics(seatResponses, seatPriorityMap) {
  const seatIds = Object.keys(seatResponses);
  const metrics = {
    rspVariation: 0,
    worstSeatVariation: 0,
    worstPrimarySeatVariation: 0,
    meanSeatVariation: 0,
    rspNulls: [],
    worstSeatNulls: [],
    primarySeatNulls: [],
    worstNullDepth: 0,
    perSeat: {},
  };

  let seatVariations = [];

  for (const seatId of seatIds) {
    const response = seatResponses[seatId];
    if (!response?.freqsHz?.length) continue;

    // Build curve from splDb
    const curve = response.freqsHz
      .map((freq, i) => ({ frequency: freq, spl: response.splDb[i] }))
      .filter((p) => p.frequency >= SCREEN_FREQ_MIN_HZ && p.frequency <= SCREEN_FREQ_MAX_HZ);

    if (!curve.length) continue;

    const p2p = peakToPeak(curve.map((p) => p.spl));
    const rmsDev = variationFromMean(curve);
    const nulls = detectBroadNulls(curve);
    const isPrimary = seatPriorityMap.get(seatId) || false;
    const isRsp = seatId === "rsp";

    metrics.perSeat[seatId] = {
      peakToPeak: p2p,
      rmsDeviation: rmsDev,
      nulls,
      isPrimary,
      isRsp,
    };

    if (isRsp) {
      metrics.rspVariation = p2p;
      metrics.rspNulls = nulls;
    } else {
      seatVariations.push(p2p);
      if (p2p > metrics.worstSeatVariation) metrics.worstSeatVariation = p2p;
      if (isPrimary && p2p > metrics.worstPrimarySeatVariation) {
        metrics.worstPrimarySeatVariation = p2p;
        metrics.primarySeatNulls = nulls;
      }
      if (nulls.length) {
        const maxDepth = Math.max(...nulls.map((n) => n.depthDb));
        if (maxDepth > metrics.worstNullDepth) {
          metrics.worstNullDepth = maxDepth;
          metrics.worstSeatNulls = nulls;
        }
      }
    }
  }

  metrics.meanSeatVariation = mean(seatVariations);
  return metrics;
}

// ── Main screening function ──────────────────────────────────────────────

/**
 * Screen position candidates using the batch modal evaluator.
 *
 * @param {Array} candidates — from positionCandidateGenerator
 * @param {object} roomDims — { widthM, lengthM, heightM }
 * @param {Array} seatingPositions — original seats
 * @param {object} rspPosition — { x, y, z }
 * @param {number} bottomHeightM — sub bottom height
 * @param {number} subHeightM — sub cabinet height
 * @param {object} physics — physics options for batch evaluator
 * @returns {{ ranked: Array, precomputeTimeMs: number, screenTimeMs: number }}
 */
export function screenPositionCandidates(candidates, roomDims, seatingPositions, rspPosition, bottomHeightM, subHeightM, physics) {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();

  const listeners = buildListeners(rspPosition, seatingPositions);
  const seatPriorityMap = buildSeatPriorityMap(seatingPositions);
  const seatIds = listeners.map((l) => l.id);

  // Precompute mode bank ONCE — reused for all candidates
  const batchPhysics = {
    ...physics,
    freqMinHz: SCREEN_FREQ_MIN_HZ,
    freqMaxHz: SCREEN_FREQ_MAX_HZ,
    smoothing: "none",
  };
  const precomputedModes = prepareModeBank(roomDims, { ...batchPhysics, enableModes: true });

  const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();

  const results = [];

  for (const candidate of candidates) {
    // Build zero-tuning sources for this candidate's positions
    const sources = buildZeroTuningSources(candidate.coordinates, bottomHeightM, subHeightM);

    // Run batch modal evaluation
    const batchResult = evaluateBatchModalTransfers({
      roomDims,
      sources,
      listeners,
      precomputedModes,
      physics: batchPhysics,
      qStrategyOverride: "ab_corrected",
      freqMinHz: SCREEN_FREQ_MIN_HZ,
      freqMaxHz: SCREEN_FREQ_MAX_HZ,
    });

    // Map batch output to resumWithTuning format
    const perSourcePerSeatTransfers = batchResult.perSourcePerListenerTransfers.map((t) => ({
      sourceIndex: t.sourceIndex,
      seatId: t.listenerId,
      points: t.points,
    }));

    // Apply auto-align delays via re-summation
    const autoAlignDelays = normaliseDelays(computeAutoAlignDelays(sources, rspPosition));
    const tuning = autoAlignDelays.map((delayMs) => ({ delayMs, gainDb: 0, polarity: 0 }));
    const seatResponses = resumWithTuning(perSourcePerSeatTransfers, tuning, seatIds);

    // Compute per-seat proxy metrics
    const proxyMetrics = computeSeatProxyMetrics(seatResponses, seatPriorityMap);

    results.push({
      ...candidate,
      proxyMetrics,
      screeningScore: proxyMetrics.worstPrimarySeatVariation || proxyMetrics.worstSeatVariation || proxyMetrics.rspVariation,
    });
  }

  const t2 = typeof performance !== "undefined" ? performance.now() : Date.now();

  return {
    ranked: results,
    precomputeTimeMs: t1 - t0,
    screenTimeMs: t2 - t1,
  };
}

// ── Promote top candidates ───────────────────────────────────────────────

export function promoteScreenedCandidates(screened, maxPromoted = 3) {
  if (!screened?.length) return [];

  // Sort by lexicographic proxy score:
  // 1. Lower worst primary-seat variation
  // 2. Lower worst seat variation
  // 3. Lower RSP variation
  // 4. Fewer/shallower nulls
  const sorted = [...screened].sort((a, b) => {
    const ma = a.proxyMetrics;
    const mb = b.proxyMetrics;
    // 1. Primary seat variation
    const d1 = (ma.worstPrimarySeatVariation || ma.worstSeatVariation) - (mb.worstPrimarySeatVariation || mb.worstSeatVariation);
    if (Math.abs(d1) > 0.05) return d1;
    // 2. Worst seat variation
    const d2 = ma.worstSeatVariation - mb.worstSeatVariation;
    if (Math.abs(d2) > 0.05) return d2;
    // 3. RSP variation
    const d3 = ma.rspVariation - mb.rspVariation;
    if (Math.abs(d3) > 0.05) return d3;
    // 4. Null depth
    const d4 = ma.worstNullDepth - mb.worstNullDepth;
    if (Math.abs(d4) > 0.05) return d4;
    // 5. Mean seat variation
    return ma.meanSeatVariation - mb.meanSeatVariation;
  });

  // Deduplicate by keeping top N distinct candidates
  const promoted = [];
  const seenMovements = new Set();
  for (const c of sorted) {
    if (promoted.length >= maxPromoted) break;
    const moveKey = c.movement || c.id;
    if (seenMovements.has(moveKey)) continue;
    seenMovements.add(moveKey);
    promoted.push(c);
  }

  return promoted;
}