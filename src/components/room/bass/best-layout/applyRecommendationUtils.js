// Utilities for applying recommended subwoofer layouts and detecting applied state.
// Coordinates are in metres and represent cabinet centres, matching the saved
// room-plan subwoofer objects.

export const COORDINATE_TOLERANCE_M = 0.01; // 10 mm

// Only front and rear placements are supported by the app's subwoofer config.
export const SUPPORTED_PLACEMENTS = ["front", "rear"];

const roundCoord = (value) => Number(Number(value || 0).toFixed(6));

/**
 * Unordered position matching within a single placement group.
 * Every recommended position must have a matching current position.
 */
function unorderedGroupMatch(currentGroup, recommendedGroup, tolerance) {
  if (currentGroup.length !== recommendedGroup.length) return false;
  if (currentGroup.length === 0) return true;
  const used = new Array(currentGroup.length).fill(false);
  return recommendedGroup.every((candidate) => {
    const cx = roundCoord(candidate.x);
    const cy = roundCoord(candidate.y);
    const cz = Number.isFinite(candidate.z) ? roundCoord(candidate.z) : null;
    for (let index = 0; index < currentGroup.length; index += 1) {
      if (used[index]) continue;
      const dx = Math.abs(roundCoord(currentGroup[index].x) - cx);
      const dy = Math.abs(roundCoord(currentGroup[index].y) - cy);
      if (dx > tolerance || dy > tolerance) continue;
      if (cz !== null && Number.isFinite(currentGroup[index].z)) {
        const dz = Math.abs(roundCoord(currentGroup[index].z) - cz);
        if (dz > tolerance) continue;
      }
      used[index] = true;
      return true;
    }
    return false;
  });
}

/**
 * Compare two arrays of sources. Matches count, placement group, x, y, and z
 * (where present). Uses unordered matching within each placement group so
 * identical subs in a different order still match.
 */
export function coordinatesMatch(currentSources, recommendationSources, tolerance = COORDINATE_TOLERANCE_M) {
  const current = Array.isArray(currentSources) ? currentSources : [];
  const recommended = Array.isArray(recommendationSources) ? recommendationSources : [];
  if (current.length === 0 || recommended.length === 0) return false;
  if (current.length !== recommended.length) return false;
  return SUPPORTED_PLACEMENTS.every((group) =>
    unorderedGroupMatch(
      current.filter((s) => s.placement === group),
      recommended.filter((s) => s.placement === group),
      tolerance,
    ),
  );
}

/**
 * Validate a recommendation layout before applying.
 * Checks: sources exist, coordinates finite, within room boundary, placements supported.
 * Returns { valid: boolean, reason: string | null, invalidIndex: number | null }.
 */
export function validateRecommendationLayout(layout, roomDims) {
  if (!layout?.sources || !Array.isArray(layout.sources) || layout.sources.length === 0) {
    return { valid: false, reason: "No recommended positions found." };
  }
  const width = Number(roomDims?.widthM) || 0;
  const length = Number(roomDims?.lengthM) || 0;
  if (width <= 0 || length <= 0) {
    return { valid: false, reason: "Room dimensions are not valid." };
  }
  const margin = 0.001;
  for (let index = 0; index < layout.sources.length; index += 1) {
    const source = layout.sources[index];
    const x = Number(source?.x);
    const y = Number(source?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return { valid: false, reason: `Sub ${index + 1} has missing coordinates.`, invalidIndex: index };
    }
    if (x < margin || x > width - margin || y < margin || y > length - margin) {
      return { valid: false, reason: `Sub ${index + 1} is outside the room boundary.`, invalidIndex: index };
    }
    const placement = source?.placement;
    if (!SUPPORTED_PLACEMENTS.includes(placement)) {
      return { valid: false, reason: `Sub ${index + 1} uses unsupported placement "${placement}". Only front and rear are supported.`, invalidIndex: index };
    }
  }
  return { valid: true, reason: null };
}

/**
 * Build merged position arrays for front and rear configs.
 * Existing position objects are preserved; only x, y, z are updated.
 * Recommended sources are sorted by x then y for deterministic assignment.
 */
export function buildMergedPositions(existingPositions, recommendedSourcesForGroup) {
  const existing = Array.isArray(existingPositions) ? existingPositions : [];
  const sorted = (Array.isArray(recommendedSourcesForGroup) ? recommendedSourcesForGroup : [])
    .slice()
    .sort((a, b) => (Number(a.x) - Number(b.x)) || (Number(a.y) - Number(b.y)));
  return sorted.map((rec, index) => {
    const existingPos = existing[index] || {};
    const recZ = Number(rec.z);
    return {
      ...existingPos,
      x: Number(rec.x),
      y: Number(rec.y),
      z: Number.isFinite(recZ) ? recZ : (existingPos.z ?? recZ),
    };
  });
}

/**
 * Build the next-state front and rear configs from a recommendation layout.
 * Preserves all config-level fields (model, bottomHeightM, mountMode, orientation, etc.)
 * and merges coordinates into existing position objects.
 */
export function buildAppliedConfigs(layout, frontSubsCfg, rearSubsCfg) {
  const frontSources = layout.sources.filter((s) => s.placement === "front");
  const rearSources = layout.sources.filter((s) => s.placement === "rear");
  const activeModel = frontSubsCfg?.model || rearSubsCfg?.model || "SUB2-12";

  const frontPositions = buildMergedPositions(frontSubsCfg?.positions, frontSources);
  const rearPositions = buildMergedPositions(rearSubsCfg?.positions, rearSources);

  return {
    front: {
      ...frontSubsCfg,
      model: frontSubsCfg?.model || (frontSources.length > 0 ? activeModel : frontSubsCfg?.model),
      count: frontSources.length,
      placementMode: "manual",
      isManual: true,
      positions: frontPositions,
    },
    rear: {
      ...rearSubsCfg,
      model: rearSubsCfg?.model || (rearSources.length > 0 ? activeModel : rearSubsCfg?.model),
      count: rearSources.length,
      placementMode: "manual",
      isManual: true,
      positions: rearPositions,
    },
  };
}

/**
 * Compute wall-relative distances for a source position.
 * All distances are in metres from the cabinet centre to the wall.
 */
export function wallRelativeDimensions(source, roomDims) {
  const x = Number(source?.x) || 0;
  const y = Number(source?.y) || 0;
  const width = Number(roomDims?.widthM) || 0;
  const length = Number(roomDims?.lengthM) || 0;
  return {
    fromLeftWall: roundCoord(x),
    fromRightWall: roundCoord(Math.max(0, width - x)),
    fromFrontWall: roundCoord(y),
    fromRearWall: roundCoord(Math.max(0, length - y)),
  };
}