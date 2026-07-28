// subwooferInstanceCompatibility.js — Stage 1 compatibility layer.
//
// When valid subwooferInstances exist (Rule A), Front/Rear control changes
// must update canonical instances directly — NOT rebuild the full array from
// CFG. This module provides pure functions for each compatibility action.
//
// After updating instances, CFG is mirrored for legacy display/export.
//
// Migration state tracks whether runtime instances were created from a legacy
// CFG migration (to prevent autosave on the initial migration change).

import {
  generateStableId,
  getCabinetWidthM,
  getCabinetDepthM,
} from "./subwooferInstanceMigration";

export const MIGRATION_STATE = {
  NONE: "none",
  RUNTIME_MIGRATED: "runtime_migrated",
  PERSISTED: "persisted",
  ERROR: "error",
};

const WALL_BUFFER_M = 0.01;

// ---------------------------------------------------------------------------
// Default position helpers
// ---------------------------------------------------------------------------

function getDefaultXs(widthM, qty, placementMode) {
  if (qty <= 0) return [];
  const subWidth = getCabinetWidthM("SUB2-12");
  const halfW = subWidth / 2;
  const minX = WALL_BUFFER_M + halfW;
  const maxX = widthM - WALL_BUFFER_M - halfW;
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
}

function getDefaultY(lengthM, group, model) {
  const depthM = getCabinetDepthM(model);
  const halfD = depthM / 2;
  const EPS = 0.01;
  return group === "front"
    ? halfD + EPS
    : Math.max(halfD + EPS, lengthM - halfD - EPS);
}

// ---------------------------------------------------------------------------
// Compatibility actions — each updates instances in-place, preserving order
// ---------------------------------------------------------------------------

/**
 * Update model for instances in a legacy group.
 * Only the model field is changed; IDs, positions, calibration survive.
 */
export function applyModelChange(instances, group, newModel) {
  const model = String(newModel || "").trim();
  if (!model) return instances;
  return instances.map((inst) =>
    inst?.legacyGroup === group ? { ...inst, model } : inst
  );
}

/**
 * Update the count of instances in a legacy group.
 * - Decrease: disable excess instances (keep in place, preserve order)
 * - Increase: append new instances with unique stable IDs
 */
export function applyCountChange(instances, group, newCount, cfg, roomDims) {
  const count = Math.max(0, Math.floor(Number(newCount) || 0));
  const groupIndices = [];
  instances.forEach((inst, i) => {
    if (inst?.legacyGroup === group) groupIndices.push(i);
  });
  const currentGroupCount = groupIndices.length;

  if (count === currentGroupCount) return instances;

  if (count < currentGroupCount) {
    // Disable excess instances — preserve array order
    return instances.map((inst, i) => {
      if (inst?.legacyGroup === group && groupIndices.indexOf(i) >= count) {
        return { ...inst, enabled: false };
      }
      return inst;
    });
  }

  // count > currentGroupCount: add new instances at the end
  const model = String(cfg?.model || "SUB2-12").trim();
  const widthM = Number(roomDims?.widthM) || 4.5;
  const lengthM = Number(roomDims?.lengthM) || 6.0;
  const placementMode = String(cfg?.placementMode || "default").trim();
  const subWidth = getCabinetWidthM(model);
  const halfW = subWidth / 2;
  const minX = WALL_BUFFER_M + halfW;
  const maxX = widthM - WALL_BUFFER_M - halfW;
  const yPinned = getDefaultY(lengthM, group, model);
  const bottomHeightM = Number.isFinite(Number(cfg?.bottomHeightM))
    ? Math.max(0, Math.min(2.5, Number(cfg.bottomHeightM)))
    : 0.05;

  const existingIds = new Set(instances.filter((i) => i?.id).map((i) => i.id));
  const newInstances = [];
  for (let i = currentGroupCount; i < count; i++) {
    const xs = getDefaultXs(widthM, count, placementMode);
    const x = Math.max(minX, Math.min(maxX, xs[i] ?? widthM * 0.5));
    newInstances.push({
      id: generateStableId(existingIds, group),
      model,
      enabled: true,
      position: { x, y: yPinned },
      bottomHeightM,
      rotationDeg: group === "front" ? 0 : 180,
      positionSource: "default",
      legacyGroup: group,
      symmetryLinkId: null,
      gainDb: 0,
      delayMs: 0,
      polarity: 1,
    });
  }

  return [...instances, ...newInstances];
}

/**
 * Update bottomHeightM for instances in a legacy group.
 */
export function applyBottomHeightChange(instances, group, newBottomHeightM) {
  const h = Number(newBottomHeightM);
  if (!Number.isFinite(h)) return instances;
  const clamped = Math.max(0, Math.min(2.5, h));
  return instances.map((inst) =>
    inst?.legacyGroup === group ? { ...inst, bottomHeightM: clamped } : inst
  );
}

/**
 * Update enable state for instances in a legacy group.
 */
export function applyEnableChange(instances, group, enabled) {
  return instances.map((inst) =>
    inst?.legacyGroup === group ? { ...inst, enabled: !!enabled } : inst
  );
}

/**
 * Apply a placement preset to instances in a legacy group.
 * Updates coordinates only — IDs, models, enabled, calibration survive.
 */
export function applyPlacementPreset(instances, group, cfg, roomDims) {
  const model = String(cfg?.model || "SUB2-12").trim();
  const widthM = Number(roomDims?.widthM) || 4.5;
  const lengthM = Number(roomDims?.lengthM) || 6.0;
  const placementMode = String(cfg?.placementMode || "default").trim();
  const subWidth = getCabinetWidthM(model);
  const halfW = subWidth / 2;
  const minX = WALL_BUFFER_M + halfW;
  const maxX = widthM - WALL_BUFFER_M - halfW;
  const yPinned = getDefaultY(lengthM, group, model);

  // Count enabled instances in this group
  const enabledGroupInstances = instances.filter(
    (inst) => inst?.legacyGroup === group && inst.enabled !== false
  );
  const qty = enabledGroupInstances.length;
  const xs = getDefaultXs(widthM, qty, placementMode);

  let xIdx = 0;
  return instances.map((inst) => {
    if (inst?.legacyGroup !== group || inst.enabled === false) return inst;
    const x = Math.max(
      minX,
      Math.min(maxX, xs[xIdx] ?? xs[0] ?? widthM * 0.5)
    );
    xIdx++;
    return {
      ...inst,
      position: { ...inst.position, x, y: yPinned },
      positionSource: "default",
    };
  });
}

// ---------------------------------------------------------------------------
// Mirror instances → CFG (one-way, for legacy display/export)
// ---------------------------------------------------------------------------

/**
 * Mirror canonical instances into front/rear CFG objects.
 * Preserves placementMode, isManual, orientation from current CFG.
 * Updates model, count, positions, bottomHeightM from enabled instances.
 */
export function mirrorInstancesToCfg(instances, currentFrontCfg, currentRearCfg) {
  const frontInstances = instances.filter(
    (inst) => inst?.legacyGroup === "front" && inst.enabled !== false
  );
  const rearInstances = instances.filter(
    (inst) => inst?.legacyGroup === "rear" && inst.enabled !== false
  );

  const buildCfg = (groupInstances, currentCfg) => {
    if (!groupInstances.length) {
      return {
        ...(currentCfg || {}),
        model: currentCfg?.model || null,
        count: 0,
        positions: [],
      };
    }
    // Mixed-model rule: if instances in this group have different models,
    // do NOT collapse to the first model. Set model to null (mixed) so the
    // UI can indicate a mixed group. Only a single-model group mirrors its
    // model into CFG. Passive mirroring never alters instance models.
    const models = new Set(groupInstances.map((inst) => String(inst.model || "").trim()));
    const model = models.size === 1 ? [...models][0] : null;
    const positions = groupInstances.map((inst) => ({
      x: Number(inst.position?.x) || 0,
      y: Number(inst.position?.y) || 0,
    }));
    const bottomHeightM = Number(groupInstances[0]?.bottomHeightM);
    return {
      ...(currentCfg || {}),
      model,
      count: groupInstances.length,
      positions,
      bottomHeightM: Number.isFinite(bottomHeightM) ? bottomHeightM : (currentCfg?.bottomHeightM ?? 0.05),
    };
  };

  return {
    front: buildCfg(frontInstances, currentFrontCfg),
    rear: buildCfg(rearInstances, currentRearCfg),
  };
}

// ---------------------------------------------------------------------------
// Detect which CFG fields changed between previous and current
// ---------------------------------------------------------------------------

/**
 * Compare two CFG objects and return which fields changed.
 * @returns {{model:boolean, count:boolean, bottomHeightM:boolean, placementMode:boolean}}
 */
export function detectCfgChanges(prevCfg, currentCfg) {
  const p = prevCfg || {};
  const c = currentCfg || {};
  return {
    model: String(c.model || "") !== String(p.model || ""),
    count: Number(c.count) !== Number(p.count),
    bottomHeightM:
      Number(c.bottomHeightM) !== Number(p.bottomHeightM),
    placementMode: String(c.placementMode || "") !== String(p.placementMode || ""),
  };
}