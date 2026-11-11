// physicalCandidateGeometry.js
//
// Shared physical-candidate geometry validation. Builds the inputs the
// existing validateCabinetBoundary and validateCabinetOverlap authorities
// consume from a candidate's ACTUAL cabinet model, X/Y/Z centres, rotation,
// orientation-adjusted dimensions and physical installation height — and runs
// both authorities so the SAME cabinet-overlap gate protects every physical
// subwoofer recommendation path (Starting Layouts, V2 placement generation,
// Phase 9B coordinated search).
//
// This module creates NO new geometry calculations. It is a thin adapter that
// resolves cabinet extents (reusing the canonical registry + wall-orientation
// helpers) and delegates boundary and overlap verdicts to the existing
// stage2/installableWallCentreAuthority. Acoustic source height is never
// confused with physical cabinet height: the cabinet-centre Z is derived as
// bottomHeightM + cabinetHeightM / 2, exactly as the instance migration
// boundary defines it.
//
// Missing essential cabinet geometry (no model, non-finite coordinates or
// non-finite resolved dimensions) is treated as INVALID — it can never become
// a valid physical recommendation.

import {
  validateCabinetBoundary,
  validateCabinetOverlap,
} from "./installableWallCentreAuthority";
import {
  getCabinetWidthM,
  getCabinetDepthM,
  getCabinetHeightM,
} from "@/components/utils/subwooferInstanceMigration";
import {
  deriveSubWallOrientation,
  subHalfExtents,
} from "@/components/room/rv/utils/subWallOrientation";

/**
 * Resolve the orientation-adjusted cabinet width and depth (in metres) for one
 * source position. Front/rear walls keep the cabinet's width along X; left/
 * right walls swap width and depth so the long edge runs parallel to the wall.
 *
 * An explicit rotation override (rotationDeg) takes precedence over the
 * wall-derived rotation — it is the rotation Apply will assign, so the
 * validated footprint matches the installed footprint.
 *
 * @returns {{ effectiveWidthM:number, effectiveDepthM:number, rotationDeg:number }}
 */
function orientationAdjustedDims(x, y, roomDims, cabinetWidthM, cabinetDepthM, rotationDegOverride) {
  const W = Number(roomDims?.widthM);
  const L = Number(roomDims?.lengthM);
  const finiteOverride = Number.isFinite(Number(rotationDegOverride));
  const rotationDeg = finiteOverride ? Number(rotationDegOverride) : null;

  if (finiteOverride) {
    // Normalise so the swapped footprint matches the existing boundary check:
    // 90 and 270 both put the long edge parallel to a side wall; 0 and 180
    // keep width along X. subHalfExtents only swaps at exactly 90.
    const normalised = (rotationDeg === 90 || rotationDeg === 270) ? 90 : 0;
    const { halfX, halfY } = subHalfExtents(cabinetWidthM, cabinetDepthM, normalised);
    return { effectiveWidthM: halfX * 2, effectiveDepthM: halfY * 2, rotationDeg };
  }

  // Derive wall-aware rotation when no explicit rotation is supplied.
  let derivedRot = 0;
  if (Number.isFinite(W) && Number.isFinite(L) && W > 0 && L > 0
    && Number.isFinite(x) && Number.isFinite(y)) {
    derivedRot = deriveSubWallOrientation({
      x, y, widthM: W, lengthM: L, subWidthM: cabinetWidthM, subDepthM: cabinetDepthM,
    }).rotationDeg;
  }
  const { halfX, halfY } = subHalfExtents(cabinetWidthM, cabinetDepthM, derivedRot);
  return { effectiveWidthM: halfX * 2, effectiveDepthM: halfY * 2, rotationDeg: derivedRot };
}

/**
 * Build the resolved-source records validateCabinetOverlap consumes from a set
 * of physical cabinet centres. Each record carries its X/Y centre,
 * orientation-adjusted cabinet width/depth, cabinet-centre Z
 * (bottomHeightM + cabinetHeightM / 2) and cabinet height.
 *
 * @param {object} args
 * @param {Array<{x:number,y:number,rotationDeg?:number}>} args.coordinates
 * @param {string|null} args.model  canonical subwoofer model key
 * @param {{widthM:number,lengthM:number,heightM:number}} args.roomDims
 * @param {number} [args.bottomHeightM]  cabinet bottom height (metres)
 * @returns {{ sources: Array, dimensionsResolved: boolean }}
 */
export function buildOverlapSources({ coordinates, model, roomDims, bottomHeightM }) {
  if (!model) return { sources: [], dimensionsResolved: false };
  const cabinetWidthM = getCabinetWidthM(model);
  const cabinetDepthM = getCabinetDepthM(model);
  const cabinetHeightM = getCabinetHeightM(model);
  if (![cabinetWidthM, cabinetDepthM, cabinetHeightM].every((v) => Number.isFinite(v) && v > 0)) {
    return { sources: [], dimensionsResolved: false };
  }
  const bottom = Number.isFinite(Number(bottomHeightM)) ? Math.max(0, Number(bottomHeightM)) : 0;
  const centreZ = bottom + cabinetHeightM / 2;
  const list = Array.isArray(coordinates) ? coordinates : [];
  const sources = list.map((coord) => {
    const x = Number(coord?.x);
    const y = Number(coord?.y);
    const { effectiveWidthM, effectiveDepthM, rotationDeg } = orientationAdjustedDims(
      x, y, roomDims, cabinetWidthM, cabinetDepthM, coord?.rotationDeg,
    );
    return {
      x,
      y,
      z: centreZ,
      cabinetWidthM: effectiveWidthM,
      cabinetDepthM: effectiveDepthM,
      cabinetHeightM,
      rotationDeg,
    };
  });
  return { sources, dimensionsResolved: true };
}

/**
 * Validate a candidate's physical cabinets through the EXISTING authorities:
 * every cabinet stays inside the room (validateCabinetBoundary) and no two
 * cabinet volumes intersect (validateCabinetOverlap). Reuses the authorities —
 * no duplicate geometry, no acoustic maths, no RP22 scoring.
 *
 * Returns an object the three physical-recommendation paths share:
 *   { valid, reason, violations, boundaryResult, overlapResult, invalidIndex }
 *
 * `reason` is null when valid, a short stable id ("cabinet-overlap",
 * "cabinet-boundary", "missing-geometry") otherwise so diagnostics record it
 * verbatim. `violations` carries the underlying authority's violation list.
 *
 * @param {object} args
 * @param {Array<{x:number,y:number,rotationDeg?:number}>} args.coordinates
 * @param {string|null} args.model
 * @param {{widthM:number,lengthM:number,heightM:number}} args.roomDims
 * @param {number} [args.bottomHeightM]
 * @param {number} [args.bufferM]  wall buffer override for boundary check
 */
export function validateCandidateCabinets({
  coordinates,
  model,
  roomDims,
  bottomHeightM,
  bufferM,
}) {
  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    return {
      valid: false,
      reason: "missing-geometry",
      violations: [],
      boundaryResult: null,
      overlapResult: null,
      invalidIndex: null,
    };
  }
  for (const coord of coordinates) {
    if (!Number.isFinite(Number(coord?.x)) || !Number.isFinite(Number(coord?.y))) {
      return {
        valid: false,
        reason: "missing-geometry",
        violations: [],
        boundaryResult: null,
        overlapResult: null,
        invalidIndex: null,
      };
    }
  }
  const { sources, dimensionsResolved } = buildOverlapSources({
    coordinates, model, roomDims, bottomHeightM,
  });
  if (!dimensionsResolved || sources.length !== coordinates.length) {
    return {
      valid: false,
      reason: "missing-geometry",
      violations: [],
      boundaryResult: null,
      overlapResult: null,
      invalidIndex: null,
    };
  }

  // Per-cabinet boundary check (full cabinet footprint inside the room).
  for (let i = 0; i < sources.length; i += 1) {
    const s = sources[i];
    const boundaryArgs = {
      centre: { x: s.x, y: s.y },
      roomDims,
      cabinetWidthM: s.cabinetWidthM,
      cabinetDepthM: s.cabinetDepthM,
    };
    if (Number.isFinite(Number(bufferM))) boundaryArgs.bufferM = Number(bufferM);
    const result = validateCabinetBoundary(boundaryArgs);
    if (!result.valid) {
      return {
        valid: false,
        reason: "cabinet-boundary",
        violations: result.violations,
        boundaryResult: result,
        overlapResult: null,
        invalidIndex: i,
      };
    }
  }

  // Pairwise cabinet-volume overlap check.
  const overlap = validateCabinetOverlap({ sources });
  if (!overlap.valid) {
    return {
      valid: false,
      reason: "cabinet-overlap",
      violations: overlap.violations,
      boundaryResult: null,
      overlapResult: overlap,
      invalidIndex: null,
    };
  }

  return {
    valid: true,
    reason: null,
    violations: [],
    boundaryResult: null,
    overlapResult: overlap,
    invalidIndex: null,
  };
}