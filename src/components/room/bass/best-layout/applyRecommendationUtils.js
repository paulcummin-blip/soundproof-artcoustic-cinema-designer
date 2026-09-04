// Utilities for applying recommended subwoofer layouts and detecting applied state.
// Coordinates are in metres and represent cabinet centres, matching the saved
// room-plan subwoofer objects.

import { generateStableId } from "@/components/utils/subwooferInstanceMigration";
import { deriveSubWallOrientation, subHalfExtents } from "@/components/room/rv/utils/subWallOrientation";

export const COORDINATE_TOLERANCE_M = 0.01; // 10 mm

// All placement groups are supported — front, rear, left, right walls.
export const SUPPORTED_PLACEMENTS = ["front", "rear", "left", "right"];

const CABINET_CLEARANCE_M = 0.01; // 10 mm cabinet-to-wall clearance

/**
 * Adjust a recommendation source position so the entire cabinet footprint
 * sits inside the room. Determines wall orientation and clamps the cabinet
 * centre to keep the cabinet clear of all walls. Does not alter the acoustic
 * fractional position more than necessary for the physical cabinet footprint.
 *
 * Returns a new source object with adjusted x/y and a rotationDeg field
 * (0 for front/rear walls, 90 for left/right walls).
 */
export function adjustSourceForCabinet(source, roomDims, cabWidthM, cabDepthM) {
  const x = Number(source?.x);
  const y = Number(source?.y);
  const W = Number(roomDims?.widthM) || 0;
  const L = Number(roomDims?.lengthM) || 0;
  if (!Number.isFinite(x) || !Number.isFinite(y) || W <= 0 || L <= 0) {
    return { ...source };
  }
  const { rotationDeg } = deriveSubWallOrientation({
    x, y, widthM: W, lengthM: L, subWidthM: cabWidthM, subDepthM: cabDepthM,
  });
  const { halfX, halfY } = subHalfExtents(cabWidthM, cabDepthM, rotationDeg);
  const minX = halfX + CABINET_CLEARANCE_M;
  const maxX = W - halfX - CABINET_CLEARANCE_M;
  const minY = halfY + CABINET_CLEARANCE_M;
  const maxY = L - halfY - CABINET_CLEARANCE_M;
  return {
    ...source,
    x: Math.max(minX, Math.min(maxX, x)),
    y: Math.max(minY, Math.min(maxY, y)),
    rotationDeg,
  };
}

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
 * Compare two arrays of sources. Matches count, placement group, x, and y.
 * z is not compared because current subs use centre height while recommendation
 * sources use bottom height (see comment in unorderedGroupMatch).
 */
export function coordinatesMatch(currentSources, recommendationSources, tolerance = COORDINATE_TOLERANCE_M) {
  const current = Array.isArray(currentSources) ? currentSources : [];
  const recommended = Array.isArray(recommendationSources) ? recommendationSources : [];
  if (current.length === 0 || recommended.length === 0) return false;
  if (current.length !== recommended.length) return false;
  if (current.some((source) => !SUPPORTED_PLACEMENTS.includes(source?.placement))) return false;
  if (recommended.some((source) => !SUPPORTED_PLACEMENTS.includes(source?.placement))) return false;
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
  // No hidden fallback model — preserve the selected model only. When no
  // model is selected, positions are still applied but the model stays empty
  // so bass/P14 do not calculate from a hidden default product.
  const activeModel = frontSubsCfg?.model || rearSubsCfg?.model || null;

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
 *
 * Enabled-state matching:
 *   1. Existing ENABLEED instances are updated first (position only)
 *   2. DISABLED instances may be re-enabled if extra recommended positions are required
 *   3. New instances are created only after disabled compatible instances are exhausted
 *   4. Matched instances must be enabled
 *   5. Excess enabled instances are disabled (not deleted)
 *   6. Existing IDs, models, calibration, and original array order survive
 *   7. New front instances use legacyGroup "front" and rotationDeg 0
 *   8. New rear instances use legacyGroup "rear" and rotationDeg 180
 *
 * @param {Object} layout - Recommendation layout with sources[]
 * @param {Array} currentInstances - Existing subwooferInstances[]
 * @param {Object} frontSubsCfg - Legacy front config (for model fallback on new instances)
 * @param {Object} rearSubsCfg - Legacy rear config (for model fallback on new instances)
 * @returns {Array} Updated subwooferInstances[]
 */
const PLACEMENT_GROUPS = ["front", "rear", "left", "right"];
const ROTATION_BY_GROUP = { front: 0, rear: 180, left: 90, right: 270 };

export function buildAppliedInstances(layout, currentInstances, frontSubsCfg, rearSubsCfg, modelOverride = null) {
  const instances = Array.isArray(currentInstances) ? currentInstances : [];
  const sources = layout?.sources || [];

  const sortSources = (srcs) =>
    srcs.slice().sort((a, b) => (Number(a.x) - Number(b.x)) || (Number(a.y) - Number(b.y)));

  const existingIds = new Set(instances.filter((i) => i?.id).map((i) => i.id));

  const buildGroupIndices = (group) => {
    const enabled = [];
    const disabled = [];
    instances.forEach((inst, i) => {
      if (inst?.legacyGroup === group) {
        if (inst.enabled !== false) enabled.push(i);
        else disabled.push(i);
      }
    });
    return { enabled, disabled, all: [...enabled, ...disabled] };
  };

  const resolvedBottomHeight = Number.isFinite(Number(frontSubsCfg?.bottomHeightM))
    ? Math.max(0, Math.min(2.5, Number(frontSubsCfg.bottomHeightM)))
    : Number.isFinite(Number(rearSubsCfg?.bottomHeightM))
      ? Math.max(0, Math.min(2.5, Number(rearSubsCfg.bottomHeightM)))
      : 0.05;

  const groupResults = new Map();

  for (const group of PLACEMENT_GROUPS) {
    const groupSrcs = sortSources(sources.filter((s) => s.placement === group));
    const groupIdx = buildGroupIndices(group);

    // Skip groups with no sources and no existing instances
    if (groupSrcs.length === 0 && groupIdx.all.length === 0) continue;

    const cfg = group === "front" ? frontSubsCfg : group === "rear" ? rearSubsCfg : null;
    const cfgModel = modelOverride || cfg?.model || null;

    const result = new Map();
    let sourceIdx = 0;

    // Phase 1: Match to enabled instances
    for (let e = 0; e < groupIdx.enabled.length && sourceIdx < groupSrcs.length; e++) {
      const origIdx = groupIdx.enabled[e];
      const rec = groupSrcs[sourceIdx];
      result.set(origIdx, {
        ...instances[origIdx],
        position: { x: Number(rec.x), y: Number(rec.y) },
        positionSource: "user",
        enabled: true,
        rotationDeg: Number.isFinite(Number(rec.rotationDeg)) ? Number(rec.rotationDeg) : (instances[origIdx].rotationDeg ?? ROTATION_BY_GROUP[group] ?? 0),
        ...(modelOverride ? { model: modelOverride } : {}),
      });
      sourceIdx++;
    }

    // Phase 2: Re-enable disabled instances
    for (let d = 0; d < groupIdx.disabled.length && sourceIdx < groupSrcs.length; d++) {
      const origIdx = groupIdx.disabled[d];
      const rec = groupSrcs[sourceIdx];
      result.set(origIdx, {
        ...instances[origIdx],
        position: { x: Number(rec.x), y: Number(rec.y) },
        positionSource: "user",
        enabled: true,
        rotationDeg: Number.isFinite(Number(rec.rotationDeg)) ? Number(rec.rotationDeg) : (instances[origIdx].rotationDeg ?? ROTATION_BY_GROUP[group] ?? 0),
        ...(modelOverride ? { model: modelOverride } : {}),
      });
      sourceIdx++;
    }

    // Phase 3: Disable excess enabled instances
    if (groupSrcs.length < groupIdx.all.length) {
      const enabledMatched = Math.min(groupIdx.enabled.length, groupSrcs.length);
      for (let e = enabledMatched; e < groupIdx.enabled.length; e++) {
        const origIdx = groupIdx.enabled[e];
        if (!result.has(origIdx)) {
          result.set(origIdx, { ...instances[origIdx], enabled: false });
        }
      }
    }

    // Phase 4: Create new instances
    const newInstances = [];
    if (sourceIdx < groupSrcs.length) {
      const model = String(cfgModel || "").trim();
      for (let i = sourceIdx; i < groupSrcs.length; i++) {
        const rec = groupSrcs[i];
        newInstances.push({
          id: generateStableId(existingIds, group),
          model,
          enabled: true,
          position: { x: Number(rec.x), y: Number(rec.y) },
          bottomHeightM: Number.isFinite(Number(cfg?.bottomHeightM))
            ? Math.max(0, Math.min(2.5, Number(cfg.bottomHeightM)))
            : resolvedBottomHeight,
          rotationDeg: ROTATION_BY_GROUP[group] ?? 0,
          positionSource: "user",
          legacyGroup: group,
          symmetryLinkId: null,
          gainDb: 0,
          delayMs: 0,
          polarity: 1,
        });
      }
    }

    groupResults.set(group, { result, newInstances });
  }

  // Reassemble preserving original order
  const next = instances.map((inst, i) => {
    for (const group of PLACEMENT_GROUPS) {
      const gr = groupResults.get(group);
      if (gr?.result.has(i)) return gr.result.get(i);
    }
    return inst;
  });

  // Append newly created instances
  for (const group of PLACEMENT_GROUPS) {
    const gr = groupResults.get(group);
    if (gr) next.push(...gr.newInstances);
  }

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