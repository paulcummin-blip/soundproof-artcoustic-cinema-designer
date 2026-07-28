// subwooferInstanceMigration.js — Stage 1: Legacy-to-instance normalisation and adapter.
//
// Canonical instance shape (stored):
//   {
//     id: string,           — stable identifier, never regenerated from CFG
//     model: string,        — independent per-instance model (mixed models allowed)
//     enabled: boolean,     — false = filtered before engine
//     position: { x, y },    — cabinet centre XY in metres (NO z — see bottomHeightM)
//     bottomHeightM: number, — canonical stored height: cabinet BOTTOM from floor
//     rotationDeg: number,
//     positionSource: "user" | "default",
//     legacyGroup: "front" | "rear" | null, — compatibility metadata only
//     symmetryLinkId: string | null,
//     gainDb: number,
//     delayMs: number,
//     polarity: number,      — 1 or -1
//   }
//
// At rendering and engine boundaries, derive centre/acoustic height:
//   centreZ = bottomHeightM + cabinetHeightM / 2
//
// Authority rules:
//   A) Valid subwooferInstances exist → instances are canonical. CFG cannot
//      overwrite IDs, models, positions, enabled state, or calibration.
//   B) Instances absent → normalise legacy CFG once into runtime instances.
//      Do NOT autosave merely because migration occurred.
//   C) Instances present but malformed → report an explicit migration/load
//      error. Do NOT silently replace from CFG.
//
// Coordinate convention:
//   origin = front-left-floor room corner
//   x = cabinet centre from left wall
//   y = cabinet centre from front wall
//   bottomHeightM = cabinet bottom from floor
//   rotationDeg = 0 faces front wall, clockwise positive

import { subDimsMM } from "@/components/data/subwooferData";
import { getSpeakerModelMeta } from "@/components/models/speakers/registry";

export const INSTANCE_AUTHORITY_VERSION = 1;

const SUB_WIDTH_FALLBACK_M = 0.50;
const SUB_HEIGHT_FALLBACK_M = 0.50;
const SUB_DEPTH_FALLBACK_M = 0.30;
const WALL_BUFFER_M = 0.01;

/**
 * Resolve cabinet height in metres for a given model.
 */
export function getCabinetHeightM(model, orientation) {
  try {
    const meta = getSpeakerModelMeta(model, orientation) || {};
    const h = Number(meta.heightM);
    return Number.isFinite(h) && h > 0 ? h : SUB_HEIGHT_FALLBACK_M;
  } catch {
    return SUB_HEIGHT_FALLBACK_M;
  }
}

/**
 * Resolve cabinet width in metres for a given model.
 */
export function getCabinetWidthM(model) {
  try {
    const dims = subDimsMM?.[model];
    const w = Number(dims?.w);
    return Number.isFinite(w) && w > 0 ? w / 1000 : SUB_WIDTH_FALLBACK_M;
  } catch {
    return SUB_WIDTH_FALLBACK_M;
  }
}

/**
 * Resolve cabinet depth in metres for a given model.
 */
export function getCabinetDepthM(model) {
  try {
    const dims = subDimsMM?.[model];
    const d = Number(dims?.d);
    return Number.isFinite(d) && d > 0 ? d / 1000 : SUB_DEPTH_FALLBACK_M;
  } catch {
    return SUB_DEPTH_FALLBACK_M;
  }
}

/**
 * Derive centre Z (acoustic centre height) from bottomHeightM and model.
 * This is the boundary function — used at rendering and engine boundaries only.
 *
 * @param {Object} inst — instance with bottomHeightM and model
 * @returns {number} centre Z in metres
 */
export function deriveCentreZ(inst, orientationOverride) {
  const bottom = Number(inst?.bottomHeightM);
  const safeBottom = Number.isFinite(bottom) ? Math.max(0, bottom) : 0;
  const orientation = orientationOverride ?? inst?.orientation;
  const cabinetH = getCabinetHeightM(inst?.model, orientation);
  return safeBottom + cabinetH / 2;
}

/**
 * Normalise legacy front_subs_cfg / rear_subs_cfg into subwooferInstances[].
 * Used on project load when no persisted instances exist (Rule B).
 * Does NOT save — the result lives in runtime memory and persists on the
 * next normal project save.
 *
 * @param {Object} frontSubsCfg - Legacy front sub config
 * @param {Object} rearSubsCfg - Legacy rear sub config
 * @param {Object} roomDims - { widthM, lengthM, heightM }
 * @param {Object} stableDimensions - Fallback dims { width, length, height }
 * @returns {Array} subwooferInstances array
 */
export function normaliseLegacySubwoofers(frontSubsCfg, rearSubsCfg, roomDims, stableDimensions) {
  const widthM =
    Number(roomDims?.widthM) ||
    Number(stableDimensions?.width) ||
    4.5;
  const lengthM =
    Number(roomDims?.lengthM) ||
    Number(stableDimensions?.length) ||
    6.0;

  const getQty = (cfg) =>
    Math.max(0, Number(cfg?.count ?? cfg?.qty ?? 0) || 0);

  const buildGroup = (cfg, group) => {
    if (!cfg) return [];
    const qty = getQty(cfg);
    if (qty === 0 || !cfg.model) return [];

    const model = String(cfg.model).trim();
    const subWidth = getCabinetWidthM(model);
    const depthM = getCabinetDepthM(model);
    const halfD = depthM / 2;
    const halfW = subWidth / 2;
    const EPS = 0.01;

    const minX = WALL_BUFFER_M + halfW;
    const maxX = widthM - WALL_BUFFER_M - halfW;

    // bottomHeightM is the canonical stored height
    const rawBottom = Number(cfg?.bottomHeightM);
    const bottomHeightM = Number.isFinite(rawBottom)
      ? Math.max(0, Math.min(2.5, rawBottom))
      : cfg?.mountMode === "wall"
        ? 0.80
        : 0.05;

    // Y pinning
    const yPinned =
      group === "front" ? halfD + EPS : Math.max(halfD + EPS, lengthM - halfD - EPS);

    const positions = Array.isArray(cfg.positions) ? cfg.positions : [];
    const placementMode = String(cfg?.placementMode || "default").trim() || "default";

    // Default X positions
    const makeDefaultXs = (qty) => {
      if (qty <= 0) return [];
      if (placementMode === "default" || placementMode === "manual") {
        if (qty === 1) return [widthM * 0.5];
        const margin = widthM * 0.15;
        const span = Math.max(0.01, widthM - margin * 2);
        return Array.from({ length: qty }, (_, i) => margin + span * (i / (qty - 1)));
      }
      if (qty === 1) return [widthM * 0.5];
      if (placementMode === "quarter") return [widthM * 0.25, widthM * 0.75];
      if (placementMode === "corners") return [minX, maxX];
      if (placementMode === "midpoint") return [widthM * 0.5];
      if (placementMode === "sixth") return [widthM / 6, (widthM * 5) / 6];
      if (placementMode === "asymmetric") return [widthM * 0.32, widthM * 0.78];
      const margin = widthM * 0.15;
      const span = Math.max(0.01, widthM - margin * 2);
      return Array.from({ length: qty }, (_, i) => margin + span * (i / (qty - 1)));
    };

    const defaultsX = makeDefaultXs(qty);

    return Array.from({ length: qty }, (_, i) => {
      const saved = positions[i];
      const savedX = Number(saved?.x);
      const savedY = Number(saved?.y);

      const pickedX = Number.isFinite(savedX) ? savedX : Number(defaultsX[i]);
      const finalX = Math.max(minX, Math.min(maxX, pickedX));
      const finalY = Number.isFinite(savedY)
        ? Math.max(WALL_BUFFER_M, Math.min(lengthM - WALL_BUFFER_M, savedY))
        : yPinned;

      const positionSource = Number.isFinite(savedX) ? "user" : "default";

      return {
        id: `migrated-${group}-${i}`,
        model,
        enabled: true,
        position: { x: finalX, y: finalY },
        bottomHeightM,
        rotationDeg: group === "front" ? 0 : 180,
        positionSource,
        legacyGroup: group,
        symmetryLinkId: null,
        gainDb: 0,
        delayMs: 0,
        polarity: 1,
      };
    });
  };

  return [
    ...buildGroup(frontSubsCfg, "front"),
    ...buildGroup(rearSubsCfg, "rear"),
  ];
}

/**
 * Convert active subwooferInstances[] into the flat structure expected by
 * the existing bass engine. This is the PRODUCTION BASS ADAPTER.
 *
 * Disabled instances are filtered out before reaching the engine.
 * Per-instance models and calibration survive unchanged.
 *
 * Output format matches appState.subwoofers with:
 *   - root-level x/y/z (for fingerprints)
 *   - position: {x, y, z} (for useSeatResponses and rendering)
 *   - bottomHeightM (for SubwooferPanel clash detection)
 *   - tuning (for fingerprint normalizeSourceGeometry)
 *   - root-level gain/delay/polarity (for useSeatResponses)
 *
 * @param {Array} instances - subwooferInstances array
 * @returns {Array} Flat array for bass engine consumption
 */
export function bassInputAdapter(instances, orientationMeta) {
  if (!Array.isArray(instances)) return [];
  const frontOrientation = orientationMeta?.frontOrientation ?? null;
  const rearOrientation = orientationMeta?.rearOrientation ?? null;

  return instances
    .filter((inst) => inst && inst.enabled !== false)
    .map((inst, i) => {
      const pos = inst.position || {};
      const group = inst.legacyGroup || null;
      const role = group === "front" ? `SUBF${i + 1}` : group === "rear" ? `SUBR${i + 1}` : `SUB${i + 1}`;
      // Resolve group-facing orientation from CFG metadata (orientation stays
      // in CFG; only used here for deriveCentreZ/getCabinetHeightM).
      const orientation = group === "front" ? frontOrientation : group === "rear" ? rearOrientation : null;

      // Derive centre Z from bottomHeightM + cabinet height / 2
      const centreZ = deriveCentreZ(inst, orientation);

      return {
        id: inst.id,
        model: inst.model,
        group,
        role,
        isSub: true,
        enabled: true,
        position: {
          x: Number(pos.x) || 0,
          y: Number(pos.y) || 0,
          z: centreZ,
        },
        // Root-level x/y/z for fingerprint normalizeSourceGeometry
        x: Number(pos.x) || 0,
        y: Number(pos.y) || 0,
        z: centreZ,
        rotationDeg: inst.rotationDeg ?? 0,
        orientation,
        bottomHeightM: Number(inst.bottomHeightM) || 0,
        // Tuning for fingerprint normalizeSourceGeometry
        tuning: {
          gainDb: inst.gainDb ?? 0,
          delayMs: inst.delayMs ?? 0,
          polarity: inst.polarity ?? 1,
        },
        // Root-level tuning fields for useSeatResponses
        gainDb: inst.gainDb ?? 0,
        delay: inst.delayMs ?? 0,
        phaseAdjust: 0,
        polarity: inst.polarity ?? 1,
        // Instance metadata
        positionSource: inst.positionSource || "default",
        legacyGroup: group,
        symmetryLinkId: inst.symmetryLinkId ?? null,
      };
    });
}

/**
 * Validate a subwooferInstances array and return detailed diagnostics.
 *
 * Distinguishes:
 *   - field absent (not an array) → invalid
 *   - valid empty array → valid (project intentionally has zero subwoofers)
 *   - malformed present array → invalid with detailed errors
 *
 * @param {Array} instances
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateInstances(instances) {
  const errors = [];
  if (!Array.isArray(instances)) {
    return { valid: false, errors: ["subwooferInstances is not an array"] };
  }
  // Empty array is valid — project intentionally has zero subwoofers.
  if (instances.length === 0) {
    return { valid: true, errors: [] };
  }
  const seenIds = new Set();
  instances.forEach((inst, i) => {
    if (!inst || typeof inst !== "object") {
      errors.push(`instance[${i}] is not an object`);
      return;
    }
    // Missing or empty ID
    if (typeof inst.id !== "string" || inst.id.trim().length === 0) {
      errors.push(`instance[${i}].id is missing or not a non-empty string`);
    } else if (seenIds.has(inst.id)) {
      // Duplicate ID
      errors.push(`instance[${i}].id is duplicate: "${inst.id}"`);
    } else {
      seenIds.add(inst.id);
    }
    // Missing model
    if (typeof inst.model !== "string" || inst.model.trim().length === 0) {
      errors.push(`instance[${i}].model is missing or not a non-empty string`);
    }
    // Position x/y must be finite
    const pos = inst.position;
    if (!pos || typeof pos !== "object") {
      errors.push(`instance[${i}].position is missing or not an object`);
    } else {
      if (!Number.isFinite(Number(pos.x))) {
        errors.push(`instance[${i}].position.x is not finite`);
      }
      if (!Number.isFinite(Number(pos.y))) {
        errors.push(`instance[${i}].position.y is not finite`);
      }
    }
    // bottomHeightM must be finite
    if (!Number.isFinite(Number(inst.bottomHeightM))) {
      errors.push(`instance[${i}].bottomHeightM is not finite`);
    }
    // enabled must be boolean
    if (typeof inst.enabled !== "boolean") {
      errors.push(`instance[${i}].enabled is not boolean`);
    }
    // gainDb must be finite
    if (!Number.isFinite(Number(inst.gainDb))) {
      errors.push(`instance[${i}].gainDb is not finite`);
    }
    // delayMs must be finite
    if (!Number.isFinite(Number(inst.delayMs))) {
      errors.push(`instance[${i}].delayMs is not finite`);
    }
    // polarity must be 1 or -1
    if (inst.polarity !== 1 && inst.polarity !== -1) {
      errors.push(`instance[${i}].polarity is not 1 or -1 (got ${inst.polarity})`);
    }
    // legacyGroup must be "front", "rear", or null/undefined
    if (inst.legacyGroup != null && inst.legacyGroup !== "front" && inst.legacyGroup !== "rear") {
      errors.push(`instance[${i}].legacyGroup is malformed: "${inst.legacyGroup}"`);
    }
  });
  return { valid: errors.length === 0, errors };
}

/**
 * Generate a globally-unique stable ID for a new subwoofer instance.
 * Uses a prefix based on the legacy group and increments a counter until
 * an unused ID is found. The existingIds Set is mutated to include the new ID.
 *
 * @param {Set<string>} existingIds - Set of all current instance IDs
 * @param {string|null} group - Legacy group ("front", "rear", or null)
 * @returns {string} A unique ID
 */
export function generateStableId(existingIds, group) {
  const prefix = group ? `sub-${group}-` : "sub-";
  let n = 1;
  while (true) {
    const id = `${prefix}${n}`;
    if (!existingIds || !existingIds.has(id)) {
      if (existingIds) existingIds.add(id);
      return id;
    }
    n++;
  }
}

/**
 * Quick boolean check for backward compatibility.
 * Returns true if every element has a finite position (x, y), a finite
 * bottomHeightM, and a non-empty model.
 *
 * @param {Array} instances
 * @returns {boolean}
 */
export function isValidInstanceArray(instances) {
  return validateInstances(instances).valid;
}