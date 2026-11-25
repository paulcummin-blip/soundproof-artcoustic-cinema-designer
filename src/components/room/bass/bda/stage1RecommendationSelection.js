// stage1RecommendationSelection.js
// ---------------------------------------------------------------------------
// Model-independent Stage 1 placement recommendation selection.
//
// Reads the Stage 1 placement store (which holds product-independent, P14-
// independent geometric discovery results) and builds one recommendation
// option per quantity (1, 2, 4). Each option carries the best practical
// front/rear-wall arrangement's actual evaluated coordinates and screening
// evidence. The best side-wall candidate is retained per quantity as
// comparative evidence, but is NOT shown as a recommendation — the
// exceptional side-wall threshold is validated separately.
//
// This module is READ-ONLY: it reads the Stage 1 store and the design
// context. It evaluates nothing, recalculates nothing and changes no bass
// maths, no RP22 scoring, no candidate generation and no Stage 1 ranking.
// The finalists it reads are already wall-only (the engine applies the
// wall-only filter before finalist selection).
//
// No RP22 grades are fabricated from Stage 1 screening metrics. The
// screening values (smoothness, nulls, spatial variation) are presented as
// comparative acoustic evidence, not as RP22 Performance Levels.
// ---------------------------------------------------------------------------

import { compareScreeningResults } from "../stage1/stage1Screening";
import { isWallReferencePoint } from "../stage2/installableWallCentreAuthority";
import { getFamilyDisplayMetadata } from "../stage1/stage1FamilyRegistry";

const QUANTITY_BUCKETS = [
  { quantity: 1, key: "one_sub_result" },
  { quantity: 2, key: "two_sub_result" },
  { quantity: 4, key: "four_sub_result" },
];

/**
 * Is a source on a front or rear wall (yNorm = 0 or 1)? Corner positions
 * (xNorm = 0/1 AND yNorm = 0/1) count as front/rear — a corner subwoofer is
 * practically a front/rear-wall placement.
 * @private
 */
function isFrontRearWallSource(source) {
  const y = Number(source?.yNorm);
  return Number.isFinite(y) && (y <= 0 || y >= 1);
}

/**
 * Is a source on a side wall ONLY (xNorm = 0/1 with 0 < yNorm < 1)?
 * A corner is NOT side-only — it is front/rear.
 * @private
 */
function isSideWallOnlySource(source) {
  const x = Number(source?.xNorm);
  const y = Number(source?.yNorm);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const onSide = x <= 0 || x >= 1;
  const onFrontRear = y <= 0 || y >= 1;
  return onSide && !onFrontRear;
}

/**
 * Is a finalist a practical front/rear-wall arrangement? Every source must
 * be on a front or rear wall.
 * @private
 */
function isFrontRearArrangement(finalist) {
  const sources = Array.isArray(finalist?.sources) ? finalist.sources : [];
  if (sources.length === 0) return false;
  return sources.every(isFrontRearWallSource);
}

/**
 * Is a finalist a side-wall arrangement? At least one source is on a side
 * wall only (not on a front/rear wall).
 * @private
 */
function isSideWallArrangement(finalist) {
  const sources = Array.isArray(finalist?.sources) ? finalist.sources : [];
  if (sources.length === 0) return false;
  return sources.some(isSideWallOnlySource);
}

/**
 * Derive the wall placement ("front" | "rear") for a source from its yNorm.
 * @private
 */
function placementForSource(source) {
  const y = Number(source?.yNorm);
  if (!Number.isFinite(y)) return "front";
  return y >= 1 ? "rear" : "front";
}

/**
 * Build the coordinate array for a Stage 1 finalist. Each coordinate
 * carries the virtual-source position (x, y in metres) and the wall
 * placement ("front" | "rear"). These are WALL positions, not cabinet
 * centres — cabinet offsets belong to subsequent product evaluation.
 * @private
 */
function buildCoordinates(finalist) {
  const sources = Array.isArray(finalist?.sources) ? finalist.sources : [];
  return sources.map((source) => ({
    x: Number(source.x),
    y: Number(source.y),
    placement: placementForSource(source),
  }));
}

/**
 * Format a screening metric for display. Returns a compact, human-readable
 * comparative string without RP22 grade language.
 * @private
 */
function formatScreeningMetrics(screening) {
  const s = screening || {};
  return {
    primarySevereProblemCount: Number.isFinite(Number(s.primarySevereProblemCount))
      ? Number(s.primarySevereProblemCount) : null,
    worstPrimarySpatialVariation: Number.isFinite(Number(s.worstPrimarySpatialVariation))
      ? Number(s.worstPrimarySpatialVariation) : null,
    primaryResponseSmoothness: Number.isFinite(Number(s.primaryResponseSmoothness))
      ? Number(s.primaryResponseSmoothness) : null,
    primaryRspCoherence: Number.isFinite(Number(s.primaryRspCoherence))
      ? Number(s.primaryRspCoherence) : null,
    secondarySpatialConsistency: Number.isFinite(Number(s.secondarySpatialConsistency))
      ? Number(s.secondarySpatialConsistency) : null,
    efficiencyIndicator: Number.isFinite(Number(s.efficiencyIndicator))
      ? Number(s.efficiencyIndicator) : null,
  };
}

/**
 * Build a compact Stage 1 recommendation option from a finalist.
 * @private
 */
function buildStage1Option(finalist, quantity, placementKind) {
  if (!finalist) return null;
  const coordinates = buildCoordinates(finalist);
  if (coordinates.length === 0) return null;
  if (coordinates.some((c) => !Number.isFinite(c.x) || !Number.isFinite(c.y))) return null;

  const meta = getFamilyDisplayMetadata(finalist.familyId) || {};
  return {
    quantity,
    finalistId: finalist.id || null,
    familyId: finalist.familyId || null,
    familyLabel: meta.label || finalist.familyId || null,
    coordinates,
    screening: formatScreeningMetrics(finalist.screening),
    placementKind,
    isStage1: true,
  };
}

/**
 * Build Stage 1 model-independent recommendation options from the Stage 1
 * placement store state. Returns exactly one option per quantity (1, 2, 4),
 * or null for a quantity with no valid wall-only finalist.
 *
 * The best practical front/rear-wall arrangement is the normal
 * recommendation. The best side-wall candidate is retained as
 * `sideWallAlternative` on the option for future threshold validation, but
 * is NOT shown as a separate recommendation card.
 *
 * @param {object} stage1State — Stage 1 placement store state
 * @param {object} context — { roomDims } (unused by this module but kept
 *   for call-site stability)
 * @returns {Array} array of 3 option-or-null entries (1-sub, 2-sub, 4-sub)
 */
export function buildStage1Recommendations(stage1State, context) {
  if (!stage1State || stage1State.status !== "complete") return [];
  const runFingerprint = stage1State.fingerprint || null;

  const options = [];
  for (const bucket of QUANTITY_BUCKETS) {
    const result = stage1State[bucket.key];
    const finalists = Array.isArray(result?.finalists) ? result.finalists : [];
    if (finalists.length === 0) {
      options.push(null);
      continue;
    }

    // Re-rank finalists by their screening sort key to find the absolute
    // best front/rear and best side-wall. The finalists array is family-
    // diversified, not purely ranked.
    const ranked = [...finalists].sort(compareScreeningResults);

    const frontRear = ranked.filter(isFrontRearArrangement);
    const sideWall = ranked.filter(isSideWallArrangement);

    const bestFrontRear = frontRear[0] || null;
    const bestSideWall = sideWall[0] || null;

    const option = buildStage1Option(bestFrontRear, bucket.quantity, "practical");
    if (option) {
      option.fingerprint = runFingerprint;
      // Retain the best side-wall candidate and its comparative acoustic
      // metrics for future threshold validation. NOT shown as a card.
      if (bestSideWall) {
        option.sideWallAlternative = buildStage1Option(bestSideWall, bucket.quantity, "alternative");
      } else {
        option.sideWallAlternative = null;
      }
    }
    options.push(option);
  }

  return options;
}