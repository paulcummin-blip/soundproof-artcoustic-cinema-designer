// shortlistMaterialEquivalence.js
// ---------------------------------------------------------------------------
// Material-equivalence deduplication for the ADI Starting Layout shortlist.
//
// Two evaluated Stage 2 finalists represent the SAME design choice when they
// share, between them:
//   - the same subwoofer quantity (different coordinate counts never match),
//   - the same selected subwoofer model,
//   - the same RSP P19 Performance Level,
//   - the same worst Primary P20 Performance Level,
//   - the same worst Secondary P20 Performance Level,
//   - the same worst-seat P20 variation dB within a tight tolerance (so
//     materially different seat-to-seat response evidence is never suppressed
//     merely because the displayed Levels match), and
//   - pairwise cabinet centres within a material placement tolerance.
//
// The canonical ranking already orders the pool best-first, so the first-seen
// (best-ranked) equivalent candidate wins; later equivalents are dropped.
//
// This is a PRESENTATION deduplication only. It reads existing candidate
// evidence (coordinates, quantity, selectedProduct, achievedP19Level,
// rankingData P20 summaries) and changes no acoustic maths, no RP22 scoring,
// no Stage 1/2 generation and no Apply authority. Genuinely different
// arrangements — different quantities, different models, materially different
// geometry (hundreds of mm apart), or materially different seat-to-seat
// evidence — are NEVER collapsed, even when their displayed RP22 Levels happen
// to be identical.
// ---------------------------------------------------------------------------

import { normaliseModelKey } from "@/components/models/speakers/registry";

// Two cabinet centres within this distance are the same physical placement.
// 150 mm is well under half a typical subwoofer cabinet width, so the
// documented near-duplicate (cabinets 86 mm apart) collapses while genuinely
// different front/rear layouts (hundreds of mm apart) stay distinct.
const GEOMETRY_TOLERANCE_M = 0.15;

// Two worst-seat P20 variation figures within this many dB are the same
// seat-to-seat evidence. Tight by design: it only collapses candidates whose
// actual seat-to-seat response is essentially identical, and retains
// candidates whose variation differs materially even when Levels match.
const VARIATION_TOLERANCE_DB = 1.0;

function rspP19Level(result) {
  const level = Number(result?.achievedP19Level);
  return Number.isFinite(level) ? level : null;
}

function seatsForPriority(result, priority) {
  const summary = priority === "primary"
    ? result?.rankingData?.primarySummary
    : result?.rankingData?.secondarySummary;
  return Array.isArray(summary?.seats) ? summary.seats : [];
}

function worstP20Level(result, priority) {
  const seats = seatsForPriority(result, priority);
  if (!seats.length) return null;
  let worst = Infinity;
  for (const seat of seats) {
    const level = Number(seat?.p20Level);
    if (Number.isFinite(level) && level < worst) worst = level;
  }
  return Number.isFinite(worst) ? worst : null;
}

function worstP20VariationDb(result, priority) {
  const seats = seatsForPriority(result, priority);
  if (!seats.length) return null;
  let worst = -Infinity;
  for (const seat of seats) {
    const v = Number(seat?.p20VariationDb);
    if (Number.isFinite(v)) worst = Math.max(worst, Math.abs(v));
  }
  return Number.isFinite(worst) ? worst : null;
}

function resolvedCoordinates(result) {
  return (Array.isArray(result?.coordinates) ? result.coordinates : [])
    .map((c) => ({ x: Number(c?.x), y: Number(c?.y) }))
    .filter((c) => Number.isFinite(c.x) && Number.isFinite(c.y));
}

/**
 * Greedy nearest-neighbour: every coordinate in A must have a partner in B
 * within the geometry tolerance (and vice versa, since counts must match).
 * Robust for small N (≤4) and immune to coordinate ordering differences.
 * @private
 */
function coordinatesWithinTolerance(aCoords, bCoords, tol) {
  if (aCoords.length !== bCoords.length) return false;
  if (aCoords.length === 0) return true;
  const used = new Array(bCoords.length).fill(false);
  for (const a of aCoords) {
    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < bCoords.length; i++) {
      if (used[i]) continue;
      const dx = bCoords[i].x - a.x;
      const dy = bCoords[i].y - a.y;
      const d = Math.hypot(dx, dy);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    if (best < 0 || bestDist > tol) return false;
    used[best] = true;
  }
  return true;
}

function levelsEqual(a, b) {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a === b;
}

function variationEqual(a, b, tol) {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return Math.abs(a - b) <= tol;
}

/**
 * Whether two evaluated Stage 2 finalists are the same practical design choice.
 *
 * Returns true only when quantity, model, P19 Level, worst Primary/Secondary
 * P20 Level, worst-seat P20 variation dB (within tolerance) AND pairwise
 * cabinet geometry (within tolerance) all match. Any material difference in
 * any of these dimensions returns false, so genuinely different arrangements
 * are retained even when their displayed RP22 Levels happen to be identical.
 *
 * @param {object} a — Stage 2 finalist result
 * @param {object} b — Stage 2 finalist result
 * @param {object} [context] — { selectedSubModel } fallback when a result
 *   omits selectedProduct
 * @returns {boolean}
 */
export function isMateriallyEquivalentLayout(a, b, context) {
  if (!a || !b) return false;

  // Different quantities are never equivalent (different coordinate counts).
  if (Number(a?.quantity) !== Number(b?.quantity)) return false;

  // Different models are never equivalent. Both results in one Stage 2 run
  // share the run's selected model, so this guards against any future run that
  // mixes models. When a result omits selectedProduct it falls back to the
  // shared context model, so absence never blocks a genuine equivalent.
  const modelA = normaliseModelKey(a?.selectedProduct || context?.selectedSubModel);
  const modelB = normaliseModelKey(b?.selectedProduct || context?.selectedSubModel);
  if (modelA && modelB && modelA !== modelB) return false;

  // Same RSP P19 Level.
  if (!levelsEqual(rspP19Level(a), rspP19Level(b))) return false;
  // Same worst Primary P20 Level.
  if (!levelsEqual(worstP20Level(a, "primary"), worstP20Level(b, "primary"))) return false;
  // Same worst Secondary P20 Level.
  if (!levelsEqual(worstP20Level(a, "secondary"), worstP20Level(b, "secondary"))) return false;

  // Same worst-seat P20 variation within tolerance. Guards against collapsing
  // candidates whose displayed Levels match but whose actual seat-to-seat
  // response differs materially.
  if (!variationEqual(
    worstP20VariationDb(a, "primary"),
    worstP20VariationDb(b, "primary"),
    VARIATION_TOLERANCE_DB,
  )) return false;
  if (!variationEqual(
    worstP20VariationDb(a, "secondary"),
    worstP20VariationDb(b, "secondary"),
    VARIATION_TOLERANCE_DB,
  )) return false;

  // Pairwise cabinet geometry within the material placement tolerance.
  return coordinatesWithinTolerance(resolvedCoordinates(a), resolvedCoordinates(b), GEOMETRY_TOLERANCE_M);
}

export { GEOMETRY_TOLERANCE_M, VARIATION_TOLERANCE_DB };