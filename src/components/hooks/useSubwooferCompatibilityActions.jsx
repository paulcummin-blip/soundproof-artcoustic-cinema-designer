// useSubwooferCompatibilityActions.jsx
//
// Stage 2 canonical-first UI action handlers for Front/Rear subwoofer controls.
//
// When valid subwooferInstances exist (status VALID), the legacy Front/Rear CFG
// controls (model, count, bottomHeight, placement preset, orientation) update
// the canonical instances directly via a single commitInstances helper.
//
// commitInstances:
//   1. Calls setSubwooferInstances exactly once with the next instance array
//   2. Derives both front/rear CFG mirrors from the same next array
//   3. Applies optional explicit CFG overrides (orientation/placement)
//   4. Writes both CFG mirrors
//   5. Transitions runtime_migrated -> none on a genuine edit (never persisted)
//
// Stable-ID handlers act on a single instance by exact id, preserving array
// order and untouched instances.
//
// Mixed-model rule:
//   Passive CFG mirroring never alters instance models.
//   An explicit model-change action applies the selected model to ALL ENABLED
//   instances in that legacyGroup. This is the only way instance models change
//   via the Front/Rear controls.

import { useCallback, useMemo } from "react";
import {
  applyModelChange,
  applyCountChange,
  applyBottomHeightChange,
  applyPlacementPreset,
  mirrorInstancesToCfg,
  patchInstanceById as patchInstanceByIdUtil,
  updateInstancePositionById as updateInstancePositionByIdUtil,
  moveInstanceGroupById as moveInstanceGroupByIdUtil,
  setInstanceEnabledById as setInstanceEnabledByIdUtil,
  INSTANCE_STATUS,
  MIGRATION_STATE,
} from "@/components/utils/subwooferInstanceCompatibility";

/**
 * @param {Object} appState - From useAppState()
 * @param {Object} frontSubsCfg - Legacy front config
 * @param {Object} rearSubsCfg - Legacy rear config
 * @returns {Object} canonical-first handlers + stable-ID handlers
 */
export function useSubwooferCompatibilityActions(appState, frontSubsCfg, rearSubsCfg) {
  const instances = Array.isArray(appState?.subwooferInstances) ? appState.subwooferInstances : [];
  const status = appState?.subwooferInstancesStatus ?? INSTANCE_STATUS.UNINITIALISED;
  // A valid empty instance array is authoritative but editable.
  // hasCanonical is driven by status, not array length.
  const hasCanonical = status === INSTANCE_STATUS.VALID;

  // Display-only model value for the Front/Rear model selector.
  //   null        → no enabled instances and no CFG model (show placeholder)
  //   "<model>"   → all enabled instances share one model
  //   "__mixed__" → enabled instances have different models
  const frontModelDisplay = useMemo(() => {
    const enabled = instances.filter((i) => i?.legacyGroup === "front" && i.enabled !== false);
    if (enabled.length === 0) return String(frontSubsCfg?.model || "").trim() || null;
    const models = new Set(enabled.map((i) => String(i.model || "").trim()).filter(Boolean));
    if (models.size === 1) return [...models][0];
    return "__mixed__";
  }, [instances, frontSubsCfg]);

  const rearModelDisplay = useMemo(() => {
    const enabled = instances.filter((i) => i?.legacyGroup === "rear" && i.enabled !== false);
    if (enabled.length === 0) return String(rearSubsCfg?.model || "").trim() || null;
    const models = new Set(enabled.map((i) => String(i.model || "").trim()).filter(Boolean));
    if (models.size === 1) return [...models][0];
    return "__mixed__";
  }, [instances, rearSubsCfg]);

  // --- Quantity derived from enabled canonical instances ---
  // The UI authority for the Front/Rear count selectors. The CFG mirror
  // (frontSubsCfg.count) is kept for backward compatibility but is NOT the
  // display authority — it can lag one frame behind instance changes.
  const frontCount = useMemo(
    () => instances.filter((i) => i?.legacyGroup === "front" && i.enabled !== false).length,
    [instances]
  );

  const rearCount = useMemo(
    () => instances.filter((i) => i?.legacyGroup === "rear" && i.enabled !== false).length,
    [instances]
  );

  // --- Single canonical-first commit helper ---
  // 1. setSubwooferInstances exactly once
  // 2. derive both CFG mirrors from the same next array
  // 3. apply optional explicit CFG overrides (orientation/placement)
  // 4. write both CFG mirrors
  // 5. transition runtime_migrated -> none (never persisted here)
  const commitInstances = useCallback((nextInstances, cfgOverrides) => {
    if (typeof appState?.setSubwooferInstances === "function") {
      appState.setSubwooferInstances(nextInstances);
    }
    const mirrored = mirrorInstancesToCfg(nextInstances, frontSubsCfg, rearSubsCfg);
    const nextFrontCfg = cfgOverrides?.front ? { ...mirrored.front, ...cfgOverrides.front } : mirrored.front;
    const nextRearCfg = cfgOverrides?.rear ? { ...mirrored.rear, ...cfgOverrides.rear } : mirrored.rear;
    if (typeof appState?.setFrontSubsCfg === "function") {
      appState.setFrontSubsCfg(nextFrontCfg);
    }
    if (typeof appState?.setRearSubsCfg === "function") {
      appState.setRearSubsCfg(nextRearCfg);
    }
    // A genuine user edit transitions runtime_migrated → none so autosave can fire.
    // "persisted" is only set after a successful save, not on edit.
    if (
      appState?.subwooferInstanceMigrationState === MIGRATION_STATE.RUNTIME_MIGRATED &&
      typeof appState?.setSubwooferInstanceMigrationState === "function"
    ) {
      appState.setSubwooferInstanceMigrationState(MIGRATION_STATE.NONE);
    }
  }, [appState, frontSubsCfg, rearSubsCfg]);

  // --- Group model change: affects ENABLED instances only ---
  // When no enabled instances exist, mirrorInstancesToCfg sets model to null.
  // Preserve the explicitly selected model in CFG so future instance creation
  // uses it. "__mixed__" is never saved as a product model.
  const setFrontSubModel = useCallback((model) => {
    if (!hasCanonical) return;
    const next = applyModelChange(instances, "front", model);
    const enabledFront = next.filter((i) => i?.legacyGroup === "front" && i.enabled !== false);
    const overrides = enabledFront.length === 0 ? { front: { model } } : undefined;
    commitInstances(next, overrides);
  }, [hasCanonical, instances, commitInstances]);

  const setRearSubModel = useCallback((model) => {
    if (!hasCanonical) return;
    const next = applyModelChange(instances, "rear", model);
    const enabledRear = next.filter((i) => i?.legacyGroup === "rear" && i.enabled !== false);
    const overrides = enabledRear.length === 0 ? { rear: { model } } : undefined;
    commitInstances(next, overrides);
  }, [hasCanonical, instances, commitInstances]);

  // --- Count change ---
  const setFrontSubCount = useCallback((count) => {
    if (!hasCanonical) return;
    const next = applyCountChange(instances, "front", count, frontSubsCfg, appState?.roomDims);
    commitInstances(next);
  }, [hasCanonical, instances, frontSubsCfg, appState?.roomDims, commitInstances]);

  const setRearSubCount = useCallback((count) => {
    if (!hasCanonical) return;
    const next = applyCountChange(instances, "rear", count, rearSubsCfg, appState?.roomDims);
    commitInstances(next);
  }, [hasCanonical, instances, rearSubsCfg, appState?.roomDims, commitInstances]);

  // --- Bottom height change: affects ENABLED instances only ---
  const setFrontBottomHeight = useCallback((value) => {
    if (!hasCanonical) return;
    const next = applyBottomHeightChange(instances, "front", value);
    commitInstances(next);
  }, [hasCanonical, instances, commitInstances]);

  const setRearBottomHeight = useCallback((value) => {
    if (!hasCanonical) return;
    const next = applyBottomHeightChange(instances, "rear", value);
    commitInstances(next);
  }, [hasCanonical, instances, commitInstances]);

  // --- Placement preset ---
  const applyFrontPlacementPreset = useCallback((mode) => {
    if (!hasCanonical) return;
    const cfgWithMode = { ...frontSubsCfg, placementMode: mode };
    const next = applyPlacementPreset(instances, "front", cfgWithMode, appState?.roomDims);
    // Preserve the new placementMode in the mirrored CFG
    commitInstances(next, { front: { placementMode: mode, isManual: false } });
  }, [hasCanonical, instances, frontSubsCfg, appState?.roomDims, commitInstances]);

  const applyRearPlacementPreset = useCallback((mode) => {
    if (!hasCanonical) return;
    const cfgWithMode = { ...rearSubsCfg, placementMode: mode };
    const next = applyPlacementPreset(instances, "rear", cfgWithMode, appState?.roomDims);
    commitInstances(next, { rear: { placementMode: mode, isManual: false } });
  }, [hasCanonical, instances, rearSubsCfg, appState?.roomDims, commitInstances]);

  // --- Orientation handlers: orientation stays in CFG, not on instances ---
  // Triggers the genuine-edit migration transition without touching instances
  // or adding orientation to the canonical schema.
  const setFrontOrientation = useCallback((orientation) => {
    if (!hasCanonical) return;
    if (typeof appState?.setFrontSubsCfg === "function") {
      appState.setFrontSubsCfg((prev) => ({ ...prev, orientation }));
    }
    if (
      appState?.subwooferInstanceMigrationState === MIGRATION_STATE.RUNTIME_MIGRATED &&
      typeof appState?.setSubwooferInstanceMigrationState === "function"
    ) {
      appState.setSubwooferInstanceMigrationState(MIGRATION_STATE.NONE);
    }
  }, [hasCanonical, appState]);

  const setRearOrientation = useCallback((orientation) => {
    if (!hasCanonical) return;
    if (typeof appState?.setRearSubsCfg === "function") {
      appState.setRearSubsCfg((prev) => ({ ...prev, orientation }));
    }
    if (
      appState?.subwooferInstanceMigrationState === MIGRATION_STATE.RUNTIME_MIGRATED &&
      typeof appState?.setSubwooferInstanceMigrationState === "function"
    ) {
      appState.setSubwooferInstanceMigrationState(MIGRATION_STATE.NONE);
    }
  }, [hasCanonical, appState]);

  // --- Stable-ID handlers: act on a single instance by exact id ---
  const patchInstance = useCallback((id, patch) => {
    if (!hasCanonical) return;
    commitInstances(patchInstanceByIdUtil(instances, id, patch));
  }, [hasCanonical, instances, commitInstances]);

  const updateInstancePosition = useCallback((id, position) => {
    if (!hasCanonical) return;
    commitInstances(updateInstancePositionByIdUtil(instances, id, position));
  }, [hasCanonical, instances, commitInstances]);

  const moveInstanceGroup = useCallback((id, newGroup) => {
    if (!hasCanonical) return;
    commitInstances(moveInstanceGroupByIdUtil(instances, id, newGroup));
  }, [hasCanonical, instances, commitInstances]);

  const setInstanceEnabled = useCallback((id, enabled) => {
    if (!hasCanonical) return;
    commitInstances(setInstanceEnabledByIdUtil(instances, id, enabled));
  }, [hasCanonical, instances, commitInstances]);

  const setInstanceCalibration = useCallback((id, calibration) => {
    if (!hasCanonical) return;
    const patch = {};
    if (Number.isFinite(Number(calibration?.gainDb))) patch.gainDb = Number(calibration.gainDb);
    if (Number.isFinite(Number(calibration?.delayMs))) patch.delayMs = Number(calibration.delayMs);
    if (calibration?.polarity === 1 || calibration?.polarity === -1) patch.polarity = calibration.polarity;
    commitInstances(patchInstanceByIdUtil(instances, id, patch));
  }, [hasCanonical, instances, commitInstances]);

  return {
    hasCanonicalInstances: hasCanonical,
    frontModelDisplay,
    rearModelDisplay,
    frontCount,
    rearCount,
    setFrontSubModel,
    setRearSubModel,
    setFrontSubCount,
    setRearSubCount,
    setFrontBottomHeight,
    setRearBottomHeight,
    applyFrontPlacementPreset,
    applyRearPlacementPreset,
    setFrontOrientation,
    setRearOrientation,
    commitInstances,
    patchInstance,
    updateInstancePosition,
    moveInstanceGroup,
    setInstanceEnabled,
    setInstanceCalibration,
  };
}