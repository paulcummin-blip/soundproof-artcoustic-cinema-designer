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
import { finalistKey, verifiedFinalist } from "../stage1/stage1FinalistEvidence";
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
  const y = source?.yNorm;
  return Number.isFinite(y) && (y <= 0 || y >= 1);
}

/**
 * Is a source on a side wall ONLY (xNorm = 0/1 with 0 < yNorm < 1)?
 * A corner is NOT side-only — it is front/rear.
 * @private
 */
function isSideWallOnlySource(source) {
  const x = source?.xNorm;
  const y = source?.yNorm;
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
  const y = source?.yNorm;
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
function buildCoordinates(finalist, roomDims) {
  return finalist.sources.map(source => ({
    x: Number((source.xNorm * roomDims.widthM).toFixed(3)),
    y: Number((source.yNorm * roomDims.lengthM).toFixed(3)),
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
    primarySevereProblemCount: Number.isFinite(s.primarySevereProblemCount)
      ? Number(s.primarySevereProblemCount) : null,
    worstPrimarySpatialVariation: Number.isFinite(s.worstPrimarySpatialVariation)
      ? Number(s.worstPrimarySpatialVariation) : null,
    primaryResponseSmoothness: Number.isFinite(s.primaryResponseSmoothness)
      ? Number(s.primaryResponseSmoothness) : null,
    primaryRspCoherence: Number.isFinite(s.primaryRspCoherence)
      ? Number(s.primaryRspCoherence) : null,
    secondarySpatialConsistency: Number.isFinite(s.secondarySpatialConsistency)
      ? Number(s.secondarySpatialConsistency) : null,
    efficiencyIndicator: Number.isFinite(s.efficiencyIndicator)
      ? Number(s.efficiencyIndicator) : null,
    // Validated frequency-defined depression metrics (comparative Stage 1
    // evidence, never RP22 Performance Levels).
    deepestRspDepression: s.deepestRspDepression
      ? {
          depthDb: Number.isFinite(s.deepestRspDepression.depthDb) ? Number(s.deepestRspDepression.depthDb) : null,
          centreHz: Number.isFinite(s.deepestRspDepression.centreHz) ? Number(s.deepestRspDepression.centreHz) : null,
        }
      : null,
    deepestPrimaryDepression: s.deepestPrimaryDepression
      ? {
          depthDb: Number.isFinite(s.deepestPrimaryDepression.depthDb) ? Number(s.deepestPrimaryDepression.depthDb) : null,
          centreHz: Number.isFinite(s.deepestPrimaryDepression.centreHz) ? Number(s.deepestPrimaryDepression.centreHz) : null,
        }
      : null,
    primarySeatsWithSevereBroadNulls: Number.isFinite(s.primarySeatsWithSevereBroadNulls)
      ? Number(s.primarySeatsWithSevereBroadNulls) : null,
    primarySeatCount: Number.isFinite(s.primarySeatCount) ? Number(s.primarySeatCount) : null,
  };
}

/**
 * Build a compact Stage 1 recommendation option from a finalist.
 * @private
 */
function buildStage1Option(finalist, quantity, placementKind, fingerprint, context) {
  if (!finalist) return null;
  const key = finalistKey(finalist, quantity, fingerprint);
  if (!key || !context?.roomDims) return null;
  const ready = verifiedFinalist(finalist, quantity, fingerprint, context.seatingPositions);
  const coordinates = buildCoordinates(finalist, context.roomDims);
  if (coordinates.length === 0) return null;
  if (coordinates.some((c) => !Number.isFinite(c.x) || !Number.isFinite(c.y))) return null;

  const meta = getFamilyDisplayMetadata(finalist.familyId) || {};
  return {
    quantity,
    finalistId: finalist.id || null,
    familyId: finalist.familyId || null,
    familyLabel: meta.label || finalist.familyId || null,
    coordinates,
    fingerprint, evidenceKey: key, ready,
    screening: ready ? formatScreeningMetrics(finalist.screening) : null,
    responseEvidence: ready ? finalist.responseEvidence : null,
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
    const chosen = recommendationTarget(result);
    const option = buildStage1Option(chosen, bucket.quantity, "practical", runFingerprint, context);
    if (option) {
      const alternative = finalists.filter(isSideWallArrangement)
        .filter(f => verifiedFinalist(f, bucket.quantity, runFingerprint, context.seatingPositions))
        .sort(compareScreeningResults)[0];
      option.sideWallAlternative = buildStage1Option(alternative, bucket.quantity, "alternative", runFingerprint, context);
    }
    options.push(option);
  }

  return options;
}
export function recommendationTarget(result) {
  if (!result) return null;
  const finalists = Array.isArray(result.finalists) ? result.finalists : [];
  if ("recommendationId" in result) {
    const target = [result.recommendationFinalist, ...finalists].find(f => f?.id && f.id === result.recommendationId);
    return isFrontRearArrangement(target) ? target : null;
  }
  // Historical caches have no pinned winner. Prefer a previously refined
  // practical arrangement. A discovery-only target must finish refinement
  // before either its graph or its screening can reach the card.
  const practical = finalists.filter(isFrontRearArrangement).sort(compareScreeningResults);
  return practical.find(f => f.discoveryScreening) || practical[0] || null;
}
