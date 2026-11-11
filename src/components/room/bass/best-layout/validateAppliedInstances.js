// validateAppliedInstances.js
//
// Shared physical-validation helper for the actionable Apply paths that commit
// subwooferInstances directly (BassPostCalculationActions, Rp22PlacementRecommendation,
// BestSubLayoutGuide). Validates the EXACT instances that buildAppliedInstances
// will save — each cabinet against its OWN model dimensions — through the existing
// validateCabinetBoundary and validateCabinetOverlap authorities.
//
// Mixed-model aware: every enabled instance is checked using its own cabinet
// dimensions. An instance without a model, with unresolved dimensions, or with
// non-finite coordinates is rejected. A cabinet that crosses a wall or overlaps
// another cabinet volume is rejected. The helper creates no new geometry: it
// reuses the canonical registry (getCabinetWidthM/DepthM/HeightM), the
// wall-orientation extents (subHalfExtents) and the stage2 physical authorities.
//
// Returns { valid, reason, violations }. `reason` is null when valid.

import {
  validateCabinetBoundary,
  validateCabinetOverlap,
} from "@/components/room/bass/stage2/installableWallCentreAuthority";
import {
  getCabinetWidthM,
  getCabinetDepthM,
  getCabinetHeightM,
} from "@/components/utils/subwooferInstanceMigration";
import { subHalfExtents } from "@/components/room/rv/utils/subWallOrientation";

/**
 * Validate the proposed subwooferInstances that an Apply path would commit.
 *
 * @param {Array} instances — proposed subwooferInstances[] (output of buildAppliedInstances)
 * @param {{widthM:number,lengthM:number}} roomDims
 * @returns {{valid:boolean, reason:string|null, violations:Array}}
 */
export function validateAppliedInstances(instances, roomDims) {
  const W = Number(roomDims?.widthM);
  const L = Number(roomDims?.lengthM);
  if (!Number.isFinite(W) || W <= 0 || !Number.isFinite(L) || L <= 0) {
    return { valid: false, reason: "Room dimensions are not valid.", violations: [] };
  }
  const enabled = (Array.isArray(instances) ? instances : []).filter((i) => i?.enabled !== false);
  if (enabled.length === 0) {
    return { valid: false, reason: "No enabled subwoofers to apply.", violations: [] };
  }

  // Resolve each cabinet's geometry from its own model and orientation.
  const sources = [];
  for (let i = 0; i < enabled.length; i += 1) {
    const inst = enabled[i];
    const model = inst?.model;
    if (!model) {
      return {
        valid: false,
        reason: `Subwoofer ${i + 1} has no model selected.`,
        violations: [],
      };
    }
    const cabW = getCabinetWidthM(model);
    const cabD = getCabinetDepthM(model);
    const cabH = getCabinetHeightM(model);
    if (![cabW, cabD, cabH].every((v) => Number.isFinite(v) && v > 0)) {
      return {
        valid: false,
        reason: `Subwoofer ${i + 1} has unresolved cabinet dimensions.`,
        violations: [],
      };
    }
    const x = Number(inst?.position?.x);
    const y = Number(inst?.position?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return {
        valid: false,
        reason: `Subwoofer ${i + 1} has missing coordinates.`,
        violations: [],
      };
    }
    const rotationDeg = Number.isFinite(Number(inst?.rotationDeg)) ? Number(inst.rotationDeg) : 0;
    // subHalfExtents swaps at rotation 90; treat 270 the same so a right-wall
    // cabinet's footprint is validated with the correct axis orientation.
    const normalised = (rotationDeg === 90 || rotationDeg === 270) ? 90 : 0;
    const { halfX, halfY } = subHalfExtents(cabW, cabD, normalised);
    const bottom = Number.isFinite(Number(inst?.bottomHeightM)) ? Math.max(0, Number(inst.bottomHeightM)) : 0;
    const centreZ = bottom + cabH / 2;
    sources.push({
      index: i,
      x,
      y,
      z: centreZ,
      cabinetWidthM: halfX * 2,
      cabinetDepthM: halfY * 2,
      cabinetHeightM: cabH,
      rotationDeg,
    });
  }

  // Per-cabinet boundary check (full cabinet footprint inside the room).
  for (const s of sources) {
    const result = validateCabinetBoundary({
      centre: { x: s.x, y: s.y },
      roomDims: { widthM: W, lengthM: L },
      cabinetWidthM: s.cabinetWidthM,
      cabinetDepthM: s.cabinetDepthM,
    });
    if (!result.valid) {
      return {
        valid: false,
        reason: `Subwoofer ${s.index + 1} cabinet does not fit inside the room.`,
        violations: result.violations,
      };
    }
  }

  // Pairwise cabinet-volume overlap check.
  const overlap = validateCabinetOverlap({ sources });
  if (!overlap.valid) {
    return {
      valid: false,
      reason: "Two subwoofers would physically overlap.",
      violations: overlap.violations,
    };
  }

  return { valid: true, reason: null, violations: [] };
}