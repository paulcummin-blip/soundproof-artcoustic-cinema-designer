// authoritativeFinalistSelection.js
// ---------------------------------------------------------------------------
// Authoritative finalist selection for the bass optimiser's final winner.
//
// This module replaces the proxy-based winner selection with a Pareto-filtered
// comparison using the ACTUAL authoritative P18 / P19 / P20 results that the
// canonical evaluation pipeline already produced for every Stage 2 finalist.
//
// It does NOT change:
//   - candidate generation, placement search, delay/level search
//   - P14/P18/P19/P20 equations, smoothing, house curve, EQ rules
//   - REW-parity physics
//
// It ONLY changes how the final winner is chosen from the evaluated finalists.
// ---------------------------------------------------------------------------

import { getFamilyDisplayMetadata } from "../stage1/stage1FamilyRegistry";

// Small tolerance so differences of only a few hundredths of a dB do not
// determine the winner. Matches the user's "small equality tolerance" spec.
const PARETO_TOLERANCE_DB = 0.05;

// A sub is "effectively muted" when its gain is at or below this threshold.
// The user specifies "approximately −40 dB"; we use −30 dB as a conservative
// detection boundary so genuinely muted subs are caught without false-positiving
// modest gain trims (e.g. −3 to −6 dB level adjustments).
const MUTED_SUB_GAIN_THRESHOLD_DB = -30;

// Material improvement threshold: a difference below this is not "material"
// and does not justify preferring one finalist over another on that axis.
const MATERIAL_IMPROVEMENT_DB = 0.15;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function numericLevel(value) {
  if (Number.isFinite(Number(value))) return Math.max(0, Math.min(4, Number(value)));
  const match = String(value || "").match(/^L([1-4])$/i);
  return match ? Number(match[1]) : 0;
}

function primarySeats(result, key) {
  return (Array.isArray(result?.[key]) ? result[key] : [])
    .filter((seat) => seat?.isPrimary !== false);
}

/**
 * Worst absolute variation across primary seats for a given metric key.
 * Lower is better (minimisation objective for Pareto).
 */
function worstPrimaryVariationDb(result, key) {
  const rows = primarySeats(result, key);
  if (!rows.length) return Number.POSITIVE_INFINITY;
  return Math.max(...rows.map((row) => Math.abs(Number(row?.variationDbRaw) || 0)));
}

/**
 * Floor level across primary seats for a given metric key.
 * Higher is better.
 */
function primaryFloorLevel(result, key) {
  const rows = primarySeats(result, key);
  if (!rows.length) return 0;
  return Math.min(...rows.map((row) => numericLevel(row?.level)));
}

/**
 * Detect effectively muted subs from the current layout's source tuning.
 * A sub with gainDb ≤ MUTED_SUB_GAIN_THRESHOLD_DB is effectively muted and
 * must be removed from the active-sub count.
 *
 * @param {Array} sources - current layout sources with tuning.gainDb
 * @returns {{ activeCount: number, mutedCount: number, mutedIds: string[] }}
 */
export function detectMutedSubs(sources) {
  const list = Array.isArray(sources) ? sources : [];
  const mutedIds = [];
  let activeCount = 0;
  for (const src of list) {
    const gainDb = Number(src?.tuning?.gainDb ?? src?.gainDb ?? 0);
    if (Number.isFinite(gainDb) && gainDb <= MUTED_SUB_GAIN_THRESHOLD_DB) {
      mutedIds.push(src?.id || `sub-${activeCount + mutedIds.length + 1}`);
    } else {
      activeCount += 1;
    }
  }
  return {
    activeCount,
    mutedCount: mutedIds.length,
    mutedIds,
  };
}

/**
 * Adjust the active sub count for a finalist or current layout.
 * Stage 2 finalists are built with gainDb=0, so they will not be muted.
 * The current layout may have user-applied gain trims that effectively mute subs.
 */
function effectiveActiveCount(layout) {
  const sources = layout?.sources || [];
  const { activeCount } = detectMutedSubs(sources);
  return activeCount;
}

// ---------------------------------------------------------------------------
// Authoritative metric extraction
// ---------------------------------------------------------------------------

/**
 * Extract the authoritative P18/P19/P20 comparison metrics from a finalist
 * or current-layout result. These are the SAME values the canonical evaluation
 * already produced — no re-calculation.
 *
 * @param {object} result - Stage 2 finalist result or current canonical result
 * @param {object} [layout] - optional layout (for current-layout muted-sub check)
 * @returns {{ p19VariationDb: number, p20VariationDb: number, p19Level: number, p20Level: number, p18Level: number, p18Hz: number|null, p14Level: number, p14Db: number|null, activeCount: number, hasAuthority: boolean }}
 */
export function extractAuthoritativeMetrics(result, layout) {
  if (!result) {
    return {
      p19VariationDb: Number.POSITIVE_INFINITY,
      p20VariationDb: Number.POSITIVE_INFINITY,
      p19Level: 0,
      p20Level: 0,
      p18Level: 0,
      p18Hz: null,
      p14Level: 0,
      p14Db: null,
      activeCount: 0,
      hasAuthority: false,
    };
  }
  return {
    p19VariationDb: worstPrimaryVariationDb(result, "perSeatP19"),
    p20VariationDb: worstPrimaryVariationDb(result, "perSeatP20"),
    p19Level: primaryFloorLevel(result, "perSeatP19"),
    p20Level: primaryFloorLevel(result, "perSeatP20"),
    p18Level: numericLevel(result?.p18AchievedLevel ?? result?.canonicalResult?.p18AchievedLevel),
    p18Hz: Number.isFinite(Number(result?.achievedP18Hz ?? result?.canonicalResult?.achievedP18Hz))
      ? Number(result.achievedP18Hz ?? result.canonicalResult.achievedP18Hz)
      : null,
    p14Level: numericLevel(result?.p14AchievedLevel ?? result?.canonicalResult?.p14AchievedLevel),
    p14Db: Number.isFinite(Number(result?.p14AchievedDb ?? result?.canonicalResult?.p14AchievedDb))
      ? Number(result.p14AchievedDb ?? result.canonicalResult.p14AchievedDb)
      : null,
    activeCount: layout ? effectiveActiveCount(layout) : Number(result?.quantity) || 0,
    hasAuthority: !!(result?.perSeatP19?.length || result?.perSeatP20?.length),
  };
}

// ---------------------------------------------------------------------------
// Pareto dominance
// ---------------------------------------------------------------------------

/**
 * Check whether candidate A Pareto-dominates candidate B.
 * A dominates B if A is at least as good on all objectives and strictly better
 * on at least one (beyond tolerance).
 *
 * Objectives (all minimisation):
 *   - p19VariationDb (lower = better)
 *   - p20VariationDb (lower = better)
 *
 * @returns {boolean} true if a dominates b
 */
function dominates(a, b) {
  const a19 = a.p19VariationDb;
  const b19 = b.p19VariationDb;
  const a20 = a.p20VariationDb;
  const b20 = b.p20VariationDb;

  const aBetterOrEqual19 = a19 <= b19 + PARETO_TOLERANCE_DB;
  const aBetterOrEqual20 = a20 <= b20 + PARETO_TOLERANCE_DB;
  if (!aBetterOrEqual19 || !aBetterOrEqual20) return false;

  const aStrictlyBetter19 = a19 < b19 - PARETO_TOLERANCE_DB;
  const aStrictlyBetter20 = a20 < b20 - PARETO_TOLERANCE_DB;
  return aStrictlyBetter19 || aStrictlyBetter20;
}

/**
 * Filter a list of scored candidates to the Pareto front.
 * A candidate is on the Pareto front if no other candidate dominates it.
 *
 * @param {Array} scored - array of { result, layout, metrics, isCurrent, isSideWall }
 * @returns {Array} Pareto-front candidates
 */
function paretoFilter(scored) {
  if (!scored.length) return [];
  const front = [];
  for (let i = 0; i < scored.length; i++) {
    let dominated = false;
    for (let j = 0; j < scored.length; j++) {
      if (i === j) continue;
      if (dominates(scored[j].metrics, scored[i].metrics)) {
        dominated = true;
        break;
      }
    }
    if (!dominated) front.push(scored[i]);
  }
  return front;
}

// ---------------------------------------------------------------------------
// Trade-off detection
// ---------------------------------------------------------------------------

/**
 * Compare a candidate against the current layout to determine whether it is
 * a joint improvement, a trade-off, or a regression.
 *
 * @param {object} candidateMetrics - extractAuthoritativeMetrics output
 * @param {object} currentMetrics - extractAuthoritativeMetrics output
 * @returns {{ type: 'improvement'|'trade-off'|'regression', p19Delta: number, p20Delta: number, description: string }}
 */
export function classifyVersusCurrent(candidateMetrics, currentMetrics) {
  const p19Delta = currentMetrics.p19VariationDb - candidateMetrics.p19VariationDb; // positive = improvement
  const p20Delta = currentMetrics.p20VariationDb - candidateMetrics.p20VariationDb; // positive = improvement

  const p19Improves = p19Delta > MATERIAL_IMPROVEMENT_DB;
  const p20Improves = p20Delta > MATERIAL_IMPROVEMENT_DB;
  const p19Worsens = p19Delta < -MATERIAL_IMPROVEMENT_DB;
  const p20Worsens = p20Delta < -MATERIAL_IMPROVEMENT_DB;

  if (p19Improves && p20Improves) {
    return {
      type: "improvement",
      p19Delta,
      p20Delta,
      description: `Improves P19 by ${p19Delta.toFixed(2)} dB and P20 by ${p20Delta.toFixed(2)} dB versus current.`,
    };
  }
  if ((p19Improves && p20Worsens) || (p20Improves && p19Worsens)) {
    const p19Label = p19Improves ? `+${p19Delta.toFixed(2)} dB P19` : `${p19Delta.toFixed(2)} dB P19`;
    const p20Label = p20Improves ? `+${p20Delta.toFixed(2)} dB P20` : `${p20Delta.toFixed(2)} dB P20`;
    return {
      type: "trade-off",
      p19Delta,
      p20Delta,
      description: `Trade-off: ${p19Label}, ${p20Label} versus current. Not an unconditional improvement.`,
    };
  }
  if (p19Improves || p20Improves) {
    // One improves, the other is within tolerance (no material change)
    const improving = p19Improves ? "P19" : "P20";
    return {
      type: "improvement",
      p19Delta,
      p20Delta,
      description: `Improves ${improving} by ${Math.abs(p19Delta > 0 ? p19Delta : p20Delta).toFixed(2)} dB; the other metric is unchanged.`,
    };
  }
  return {
    type: "regression",
    p19Delta,
    p20Delta,
    description: "No material improvement over the current design.",
  };
}

// ---------------------------------------------------------------------------
// Side-wall detection (reused from existing logic)
// ---------------------------------------------------------------------------

const TOLERANCE_M = 0.01;

function isSideWallResult(result, roomDims) {
  const width = Number(roomDims?.widthM);
  const length = Number(roomDims?.lengthM);
  return (result?.coordinates || []).some((coordinate) => {
    const x = Number(coordinate?.x);
    const y = Number(coordinate?.y);
    const onSide = Math.abs(x) <= TOLERANCE_M
      || (Number.isFinite(width) && Math.abs(x - width) <= TOLERANCE_M);
    const onFrontRear = Math.abs(y) <= TOLERANCE_M
      || (Number.isFinite(length) && Math.abs(y - length) <= TOLERANCE_M);
    return onSide && !onFrontRear;
  });
}

// ---------------------------------------------------------------------------
// Main selection function
// ---------------------------------------------------------------------------

/**
 * Select the authoritative winner from Stage 2 evaluated finalists, using
 * Pareto-filtered P19/P20 comparison against the current layout.
 *
 * @param {object} quantityResult - Stage 2 quantity result with evaluatedFinalists
 * @param {object} roomDims - room dimensions
 * @param {object} [currentLayout] - current canonical layout (for comparison)
 * @returns {{ winner: object|null, isCurrent: boolean, isTradeOff: boolean, tradeOffDescription: string|null, paretoFinalistIds: string[] }}
 */
export function selectAuthoritativeFinalist(quantityResult, roomDims, currentLayout) {
  const ranked = Array.isArray(quantityResult?.evaluatedFinalists)
    ? quantityResult.evaluatedFinalists.filter(Boolean)
    : [];

  if (!ranked.length) {
    return {
      winner: null,
      isCurrent: false,
      isTradeOff: false,
      tradeOffDescription: null,
      paretoFinalistIds: [],
    };
  }

  // Build scored candidates from all evaluated finalists
  const scored = ranked.map((result) => ({
    result,
    layout: null, // Stage 2 finalists don't have a layout object
    metrics: extractAuthoritativeMetrics(result),
    isCurrent: false,
    isSideWall: isSideWallResult(result, roomDims),
  }));

  // Add the current layout as a candidate in the Pareto comparison if available
  if (currentLayout?.metrics) {
    const currentResult = {
      perSeatP19: currentLayout.metrics.perSeatP19,
      perSeatP20: currentLayout.metrics.perSeatP20,
      p18AchievedLevel: currentLayout.metrics.p18AchievedLevel,
      achievedP18Hz: currentLayout.metrics.achievedP18Hz,
      p14AchievedLevel: currentLayout.metrics.p14AchievedLevel,
      p14AchievedDb: currentLayout.metrics.p14AchievedDb,
      quantity: currentLayout.sources?.length || 0,
    };
    scored.push({
      result: currentResult,
      layout: currentLayout,
      metrics: extractAuthoritativeMetrics(currentResult, currentLayout),
      isCurrent: true,
      isSideWall: false,
    });
  }

  // Pareto-filter
  const paretoFront = paretoFilter(scored);
  const paretoFinalistIds = paretoFront
    .filter((c) => !c.isCurrent)
    .map((c) => c.result?.finalistId)
    .filter(Boolean);

  // If the current layout is on the Pareto front and no finalist dominates it,
  // keep the current design.
  const currentOnFront = paretoFront.some((c) => c.isCurrent);
  const nonCurrentPareto = paretoFront.filter((c) => !c.isCurrent);

  if (currentOnFront && nonCurrentPareto.length === 0) {
    return {
      winner: null, // signal "keep current"
      isCurrent: true,
      isTradeOff: false,
      tradeOffDescription: null,
      paretoFinalistIds,
    };
  }

  // If no non-current Pareto candidates, keep current
  if (nonCurrentPareto.length === 0) {
    return {
      winner: null,
      isCurrent: true,
      isTradeOff: false,
      tradeOffDescription: null,
      paretoFinalistIds,
    };
  }

  // Among the Pareto front, check if any non-current candidate dominates the current
  const currentCandidate = scored.find((c) => c.isCurrent);
  let winner = null;
  let isTradeOff = false;
  let tradeOffDescription = null;

  if (currentCandidate) {
    // Check for jointly improving candidates first
    const jointlyImproving = nonCurrentPareto.filter((c) => {
      const classification = classifyVersusCurrent(c.metrics, currentCandidate.metrics);
      return classification.type === "improvement";
    });

    if (jointlyImproving.length > 0) {
      // Among jointly improving, prefer practical (front/rear) layouts
      const practical = jointlyImproving.filter((c) => !c.isSideWall);
      const pool = practical.length > 0 ? practical : jointlyImproving;
      // Pick the one with the best combined P19+P20 variation
      winner = pool.reduce((best, c) =>
        (c.metrics.p19VariationDb + c.metrics.p20VariationDb) <
        (best.metrics.p19VariationDb + best.metrics.p20VariationDb) ? c : best
      );
    } else {
      // No joint improvement — check for trade-offs
      const tradeOffs = nonCurrentPareto.filter((c) => {
        const classification = classifyVersusCurrent(c.metrics, currentCandidate.metrics);
        return classification.type === "trade-off";
      });

      if (tradeOffs.length > 0) {
        // Select the best trade-off but label it as such
        const practical = tradeOffs.filter((c) => !c.isSideWall);
        const pool = practical.length > 0 ? practical : tradeOffs;
        winner = pool.reduce((best, c) =>
          (c.metrics.p19VariationDb + c.metrics.p20VariationDb) <
          (best.metrics.p19VariationDb + best.metrics.p20VariationDb) ? c : best
        );
        const classification = classifyVersusCurrent(winner.metrics, currentCandidate.metrics);
        isTradeOff = true;
        tradeOffDescription = classification.description;
      } else {
        // All alternatives regress — keep current
        return {
          winner: null,
          isCurrent: true,
          isTradeOff: false,
          tradeOffDescription: null,
          paretoFinalistIds,
        };
      }
    }
  } else {
    // No current layout to compare — pick the best Pareto candidate
    const practical = nonCurrentPareto.filter((c) => !c.isSideWall);
    const pool = practical.length > 0 ? practical : nonCurrentPareto;
    winner = pool.reduce((best, c) =>
      (c.metrics.p19VariationDb + c.metrics.p20VariationDb) <
      (best.metrics.p19VariationDb + best.metrics.p20VariationDb) ? c : best
    );
  }

  return {
    winner: winner?.result || null,
    isCurrent: false,
    isTradeOff,
    tradeOffDescription,
    paretoFinalistIds,
  };
}