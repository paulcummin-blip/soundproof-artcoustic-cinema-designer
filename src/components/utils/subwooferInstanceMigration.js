// subwooferInstanceMigration.js — Stage 1: Legacy-to-instance normalisation and adapter.
//
// This module provides two pure functions:
//   normaliseLegacySubwoofers(frontSubsCfg, rearSubsCfg, roomDims, stableDimensions)
//     Converts legacy front_subs_cfg / rear_subs_cfg into the canonical
//     subwooferInstances[] array. Used on project load when no persisted
//     instances exist. Does NOT save — the result lives in runtime memory
//     and persists on the next normal project save.
//
//   bassInputAdapter(instances)
//     Converts active subwooferInstances[] into the flat structure expected
//     by the existing bass engine (appState.subwoofers format). Produces
//     both root-level x/y/z (for fingerprints) and position: {x, y, z}
//     (for useSeatResponses and rendering). Disabled instances are
//     filtered before reaching the engine.
//
//   subwoofersToInstances(subwoofers, existingInstances)
//     Syncs appState.subwoofers back into instance format for persistence.
//     Preserves existing instance IDs and metadata where possible.
//
// Coordinate convention:
//   origin = front-left-floor room corner
//   x = cabinet centre from left wall
//   y = cabinet centre from front wall
//   z = cabinet centre height from floor
//   rotationDeg = 0 faces front wall, clockwise positive
//
// legacyGroup is temporary compatibility metadata only. Dragging a subwoofer
// must not change legacyGroup.

import { subDimsMM } from "@/components/data/subwooferData";
import { getSpeakerModelMeta } from "@/components/models/speakers/registry";

const SUB_WIDTH_FALLBACK_M = 0.50;
const WALL_BUFFER_M = 0.01;

/**
 * Normalise legacy front_subs_cfg / rear_subs_cfg into subwooferInstances[].
 * Replicates the geometry logic from useSubwooferSync but outputs instance format.
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

  const getSubWidthM = (model) => {
    try {
      const dims = subDimsMM?.[model];
      const w = Number(dims?.w);
      return Number.isFinite(w) && w > 0 ? w / 1000 : SUB_WIDTH_FALLBACK_M;
    } catch {
      return SUB_WIDTH_FALLBACK_M;
    }
  };

  const getDepthM = (model) => {
    try {
      const dims = subDimsMM?.[model];
      const d = Number(dims?.d);
      return Number.isFinite(d) && d > 0 ? d / 1000 : 0.30;
    } catch {
      return 0.30;
    }
  };

  const buildGroup = (cfg, group) => {
    if (!cfg) return [];
    const qty = getQty(cfg);
    if (qty === 0 || !cfg.model) return [];

    const model = String(cfg.model).trim();
    const subWidth = getSubWidthM(model);
    const depthM = getDepthM(model);
    const halfD = depthM / 2;
    const halfW = subWidth / 2;
    const EPS = 0.01;

    const minX = WALL_BUFFER_M + halfW;
    const maxX = widthM - WALL_BUFFER_M - halfW;

    // Z calculation: bottom height + cabinet height / 2
    const subMeta = getSpeakerModelMeta(model, cfg?.orientation) || {};
    const subHeight = Number(subMeta.heightM);
    const resolvedSubHeight =
      Number.isFinite(subHeight) && subHeight > 0 ? subHeight : 0.50;
    const rawBottom = Number(cfg?.bottomHeightM);
    const bottom = Number.isFinite(rawBottom)
      ? Math.max(0, Math.min(2.5, rawBottom))
      : cfg?.mountMode === "wall"
        ? 0.80
        : 0.05;
    const z = bottom + resolvedSubHeight / 2;

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
      // Other placement modes
      if (qty === 1) return [widthM * 0.5];
      if (placementMode === "quarter") return [widthM * 0.25, widthM * 0.75];
      if (placementMode === "corners") return [minX, maxX];
      if (placementMode === "midpoint") return [widthM * 0.5];
      if (placementMode === "sixth") return [widthM / 6, (widthM * 5) / 6];
      if (placementMode === "asymmetric") return [widthM * 0.32, widthM * 0.78];
      // Fallback
      const margin = widthM * 0.15;
      const span = Math.max(0.01, widthM - margin * 2);
      return Array.from({ length: qty }, (_, i) => margin + span * (i / (qty - 1)));
    };

    const defaultsX = makeDefaultXs(qty);

    return Array.from({ length: qty }, (_, i) => {
      const saved = positions[i];
      const savedX = Number(saved?.x);
      const savedY = Number(saved?.y);

      // Priority: saved cfg position > computed default
      const pickedX = Number.isFinite(savedX) ? savedX : Number(defaultsX[i]);
      const finalX = Math.max(minX, Math.min(maxX, pickedX));
      const finalY = Number.isFinite(savedY)
        ? Math.max(WALL_BUFFER_M, Math.min(lengthM - WALL_BUFFER_M, savedY))
        : yPinned;

      // Determine positionSource
      const positionSource = Number.isFinite(savedX) ? "user" : "default";

      return {
        id: `migrated-${group}-${i}`,
        model,
        enabled: true,
        position: { x: finalX, y: finalY, z },
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
 * the existing bass engine. Disabled instances are filtered out.
 *
 * Output format matches appState.subwoofers with both root-level x/y/z
 * (for fingerprints) and position: {x, y, z} (for useSeatResponses and
 * rendering). Also includes group, role, isSub, bottomHeightM, and tuning
 * for backward compatibility with all existing consumers.
 *
 * @param {Array} instances - subwooferInstances array
 * @returns {Array} Flat array for bass engine consumption
 */
export function bassInputAdapter(instances) {
  if (!Array.isArray(instances)) return [];

  return instances
    .filter((inst) => inst && inst.enabled !== false)
    .map((inst, i) => {
      const pos = inst.position || {};
      const group = inst.legacyGroup || null;
      const role = group === "front" ? `SUBF${i + 1}` : group === "rear" ? `SUBR${i + 1}` : `SUB${i + 1}`;

      // Derive bottomHeightM from z and model for SubwooferPanel clash detection
      let bottomHeightM = null;
      if (Number.isFinite(pos.z)) {
        try {
          const meta = getSpeakerModelMeta(inst.model) || {};
          const h = Number(meta.heightM);
          const subH = Number.isFinite(h) && h > 0 ? h : 0.50;
          bottomHeightM = pos.z - subH / 2;
        } catch {
          bottomHeightM = pos.z - 0.25;
        }
      }

      return {
        id: inst.id,
        model: inst.model,
        group,
        role,
        isSub: true,
        enabled: inst.enabled !== false,
        position: {
          x: Number(pos.x) || 0,
          y: Number(pos.y) || 0,
          z: Number(pos.z) || 0,
        },
        // Root-level x/y/z for fingerprint normalizeSourceGeometry
        x: Number(pos.x) || 0,
        y: Number(pos.y) || 0,
        z: Number(pos.z) || 0,
        rotationDeg: inst.rotationDeg ?? 0,
        bottomHeightM,
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
 * Sync appState.subwoofers back into instance format for persistence.
 * Preserves existing instance IDs and metadata where possible.
 *
 * @param {Array} subwoofers - appState.subwoofers array
 * @param {Array} existingInstances - Current subwooferInstances (for ID preservation)
 * @returns {Array} subwooferInstances array
 */
export function subwoofersToInstances(subwoofers, existingInstances) {
  if (!Array.isArray(subwoofers)) return [];

  const existingById = new Map();
  if (Array.isArray(existingInstances)) {
    existingInstances.forEach((inst) => {
      if (inst?.id) existingById.set(inst.id, inst);
    });
  }

  return subwoofers.map((sub, i) => {
    const pos = sub?.position || {};
    const group = sub?.group || sub?.legacyGroup || null;
    const id = sub?.id || `sub-${group || "x"}-${i}`;

    // Try to preserve existing instance metadata
    const existing = existingById.get(id);

    return {
      id,
      model: sub?.model || existing?.model || "SUB2-12",
      enabled: sub?.enabled !== false,
      position: {
        x: Number(pos.x) || 0,
        y: Number(pos.y) || 0,
        z: Number(pos.z) || 0,
      },
      rotationDeg: sub?.rotationDeg ?? existing?.rotationDeg ?? (group === "rear" ? 180 : 0),
      positionSource: sub?.positionSource || existing?.positionSource || "default",
      legacyGroup: group,
      symmetryLinkId: sub?.symmetryLinkId ?? existing?.symmetryLinkId ?? null,
      gainDb: sub?.gainDb ?? existing?.gainDb ?? 0,
      delayMs: sub?.delay ?? sub?.delayMs ?? existing?.delayMs ?? 0,
      polarity: sub?.polarity ?? existing?.polarity ?? 1,
    };
  });
}

/**
 * Validate that a subwooferInstances array is well-formed.
 * Returns true if every element has a finite position and a non-empty model.
 *
 * @param {Array} instances
 * @returns {boolean}
 */
export function isValidInstanceArray(instances) {
  if (!Array.isArray(instances) || instances.length === 0) return false;
  return instances.every((inst) => {
    if (!inst || typeof inst !== "object") return false;
    const pos = inst.position;
    if (!pos || typeof pos !== "object") return false;
    return (
      Number.isFinite(Number(pos.x)) &&
      Number.isFinite(Number(pos.y)) &&
      Number.isFinite(Number(pos.z)) &&
      typeof inst.model === "string" &&
      inst.model.trim().length > 0
    );
  });
}