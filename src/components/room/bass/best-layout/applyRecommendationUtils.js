// Utilities for applying recommended subwoofer layouts and detecting applied state.
// Coordinates are in metres and represent cabinet centres, matching the saved
// room-plan subwoofer objects.

import { generateStableId } from "@/components/utils/subwooferInstanceMigration";

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
  // Only x and y are compared. z is derived differently for current subs
  // (centre height = bottomHeightM + cabinetHeight/2) vs recommendation sources
  // (bottom height = sourceHeights.front), so z cannot be directly compared.
  const used = new Array(currentGroup.length).fill(false);
  return recommendedGroup.every((candidate) => {
    const cx = roundCoord(candidate.x);
    const cy = roundCoord(candidate.y);
    for (let index = 0; index < currentGroup.length; index += 1) {
      if (used[index]) continue;
      const dx = Math.abs(roundCoord(currentGroup[index].x) - cx);
      const dy = Math.abs(roundCoord(currentGroup[index].y) - cy);
      if (dx > tolerance || dy > tolerance) continue;
      used[index] = true;
      return true;
    }
    return false;
  });
}

/**
 * Check if a layout contains unsupported placement values (left/right).
 * Only front and rear placements can be applied to the app's subwoofer config.
 */
export function hasUnsupportedPlacement(layout) {
  if (!layout?.sources) return false;
  return layout.sources.some((s) => !SUPPORTED_PLACEMENTS.includes(s?.placement));
}

/**
 * Compare two arrays of sources. Matches count, placement group, x, and y.
 * z is not compared because current subs use centre height while recommendation
 * sources use bottom height (see comment in unorderedGroupMatch).
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
 * Build updated subwooferInstances[] from a recommendation layout.
 * Matches existing instances by legacyGroup + index, updating position.x/y only.
 * Preserves IDs, models, enabled, bottomHeightM, gainDb, delayMs, polarity.
 * If the recommendation has more sources than instances in a group, new instances
 * are created with the CFG model. If fewer, extra instances are disabled (not deleted).
 *
 * @param {Object} layout - Recommendation layout with sources[]
 * @param {Array} currentInstances - Existing subwooferInstances[]
 * @param {Object} frontSubsCfg - Legacy front config (for model fallback on new instances)
 * @param {Object} rearSubsCfg - Legacy rear config (for model fallback on new instances)
 * @returns {Array} Updated subwooferInstances[]
 */
export function buildAppliedInstances(layout, currentInstances, frontSubsCfg, rearSubsCfg) {
  const instances = Array.isArray(currentInstances) ? currentInstances : [];
  const frontSources = (layout?.sources || []).filter((s) => s.placement === "front");
  const rearSources = (layout?.sources || []).filter((s) => s.placement === "rear");

  // Sort recommended sources by x then y for deterministic assignment
  const sortSources = (sources) =>
    sources.slice().sort((a, b) => (Number(a.x) - Number(b.x)) || (Number(a.y) - Number(b.y)));
  const sortedFront = sortSources(frontSources);
  const sortedRear = sortSources(rearSources);

  // Build a set of all existing IDs for uniqueness checking
  const existingIds = new Set(instances.filter((i) => i?.id).map((i) => i.id));

  // Track which indices in the original array belong to each group
  const frontIndices = [];
  const rearIndices = [];
  const otherIndices = [];
  instances.forEach((inst, i) => {
    if (inst?.legacyGroup === "front") frontIndices.push(i);
    else if (inst?.legacyGroup === "rear") rearIndices.push(i);
    else otherIndices.push(i);
  });

  // Build updated instances for a group, preserving original array positions
  const updateGroupInPlace = (groupIndices, sortedSources, cfg) => {
    const result = new Map(); // index → updated instance
    const usedIndices = new Set();

    // Match sorted sources to existing group instances by index order
    for (let s = 0; s < sortedSources.length; s++) {
      const rec = sortedSources[s];
      const origIdx = groupIndices[s];
      if (origIdx !== undefined) {
        // Update existing instance position only — preserve ID, model, calibration
        result.set(origIdx, {
          ...instances[origIdx],
          position: {
            x: Number(rec.x),
            y: Number(rec.y),
          },
          positionSource: "user",
        });
        usedIndices.add(origIdx);
      }
    }

    // Disable excess group instances that don't have a matching source
    for (let i = sortedSources.length; i < groupIndices.length; i++) {
      const origIdx = groupIndices[i];
      result.set(origIdx, { ...instances[origIdx], enabled: false });
      usedIndices.add(origIdx);
    }

    // If we need MORE instances than exist, create new ones (appended at end)
    const newInstances = [];
    if (sortedSources.length > groupIndices.length) {
      const model = String(cfg?.model || "SUB2-12").trim();
      for (let i = groupIndices.length; i < sortedSources.length; i++) {
        const rec = sortedSources[i];
        newInstances.push({
          id: generateStableId(existingIds, null),
          model,
          enabled: true,
          position: { x: Number(rec.x), y: Number(rec.y) },
          bottomHeightM: Number.isFinite(Number(cfg?.bottomHeightM))
            ? Math.max(0, Math.min(2.5, Number(cfg.bottomHeightM)))
            : 0.05,
          rotationDeg: 0,
          positionSource: "user",
          legacyGroup: null,
          symmetryLinkId: null,
          gainDb: 0,
          delayMs: 0,
          polarity: 1,
        });
      }
    }

    return { result, newInstances };
  };

  const frontResult = updateGroupInPlace(frontIndices, sortedFront, frontSubsCfg);
  const rearResult = updateGroupInPlace(rearIndices, sortedRear, rearSubsCfg);

  // Reassemble preserving original order: walk the original array,
  // replacing entries that were updated, keeping others unchanged
  const next = instances.map((inst, i) => {
    if (frontResult.result.has(i)) return frontResult.result.get(i);
    if (rearResult.result.has(i)) return rearResult.result.get(i);
    return inst;
  });

  // Append newly created instances at the end
  next.push(...frontResult.newInstances, ...rearResult.newInstances);

  return next;
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