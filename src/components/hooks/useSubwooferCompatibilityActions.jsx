// useSubwooferCompatibilityActions.jsx
//
// Stage 1 explicit UI action handlers for Front/Rear subwoofer controls.
//
// When valid subwooferInstances exist (Rule A), the legacy Front/Rear CFG
// controls (model, count, bottomHeight, placement preset) must update the
// canonical instances directly — NOT via reactive CFG-change inference in
// useSubwooferSync.
//
// Each handler:
//   1. Updates only the affected canonical instances (by legacyGroup)
//   2. Preserves untouched IDs, models, and calibration
//   3. Mirrors the resulting compatibility values into CFG for display
//   4. Creates exactly one committed instance update
//
// Mixed-model rule:
//   Passive CFG mirroring never alters instance models.
//   An explicit model-change action applies the selected model to ALL
//   instances in that legacyGroup (front or rear). This is the only way
//   instance models change via the Front/Rear controls.

import { useCallback } from "react";
import {
  applyModelChange,
  applyCountChange,
  applyBottomHeightChange,
  applyPlacementPreset,
  mirrorInstancesToCfg,
} from "@/components/utils/subwooferInstanceCompatibility";
import { isValidInstanceArray } from "@/components/utils/subwooferInstanceMigration";
import { MIGRATION_STATE } from "@/components/utils/subwooferInstanceCompatibility";

/**
 * @param {Object} appState - From useAppState()
 * @param {Object} frontSubsCfg - Legacy front config
 * @param {Object} rearSubsCfg - Legacy rear config
 * @returns {Object} { setFrontSubModel, setRearSubModel, setFrontSubCount,
 *                     setRearSubCount, setFrontBottomHeight, setRearBottomHeight,
 *                     applyFrontPlacementPreset, applyRearPlacementPreset,
 *                     hasCanonicalInstances }
 */
export function useSubwooferCompatibilityActions(appState, frontSubsCfg, rearSubsCfg) {
  const instances = Array.isArray(appState?.subwooferInstances) ? appState.subwooferInstances : [];
  const hasCanonical = isValidInstanceArray(instances);

  const commit = useCallback((nextInstances, nextFrontCfg, nextRearCfg) => {
    if (typeof appState?.setSubwooferInstances === "function") {
      appState.setSubwooferInstances(nextInstances);
    }
    // Mirror into CFG for legacy display/export
    if (typeof appState?.setFrontSubsCfg === "function" && nextFrontCfg) {
      appState.setFrontSubsCfg(nextFrontCfg);
    }
    if (typeof appState?.setRearSubsCfg === "function" && nextRearCfg) {
      appState.setRearSubsCfg(nextRearCfg);
    }
    // A genuine user edit transitions runtime_migrated → persisted so autosave can fire
    if (
      appState?.subwooferInstanceMigrationState === MIGRATION_STATE.RUNTIME_MIGRATED &&
      typeof appState?.setSubwooferInstanceMigrationState === "function"
    ) {
      appState.setSubwooferInstanceMigrationState(MIGRATION_STATE.PERSISTED);
    }
  }, [appState]);

  const mirrorBoth = useCallback((nextInstances) => {
    const mirrored = mirrorInstancesToCfg(nextInstances, frontSubsCfg, rearSubsCfg);
    return { front: mirrored.front, rear: mirrored.rear };
  }, [frontSubsCfg, rearSubsCfg]);

  // --- Model change: applies to ALL instances in the group ---
  const setFrontSubModel = useCallback((model) => {
    if (!hasCanonical) return;
    const next = applyModelChange(instances, "front", model);
    const cfgs = mirrorBoth(next);
    commit(next, cfgs.front, null);
  }, [hasCanonical, instances, mirrorBoth, commit]);

  const setRearSubModel = useCallback((model) => {
    if (!hasCanonical) return;
    const next = applyModelChange(instances, "rear", model);
    const cfgs = mirrorBoth(next);
    commit(next, null, cfgs.rear);
  }, [hasCanonical, instances, mirrorBoth, commit]);

  // --- Count change ---
  const setFrontSubCount = useCallback((count) => {
    if (!hasCanonical) return;
    const next = applyCountChange(instances, "front", count, frontSubsCfg, appState?.roomDims);
    const cfgs = mirrorBoth(next);
    commit(next, cfgs.front, null);
  }, [hasCanonical, instances, frontSubsCfg, appState?.roomDims, mirrorBoth, commit]);

  const setRearSubCount = useCallback((count) => {
    if (!hasCanonical) return;
    const next = applyCountChange(instances, "rear", count, rearSubsCfg, appState?.roomDims);
    const cfgs = mirrorBoth(next);
    commit(next, null, cfgs.rear);
  }, [hasCanonical, instances, rearSubsCfg, appState?.roomDims, mirrorBoth, commit]);

  // --- Bottom height change ---
  const setFrontBottomHeight = useCallback((value) => {
    if (!hasCanonical) return;
    const next = applyBottomHeightChange(instances, "front", value);
    const cfgs = mirrorBoth(next);
    commit(next, cfgs.front, null);
  }, [hasCanonical, instances, mirrorBoth, commit]);

  const setRearBottomHeight = useCallback((value) => {
    if (!hasCanonical) return;
    const next = applyBottomHeightChange(instances, "rear", value);
    const cfgs = mirrorBoth(next);
    commit(next, null, cfgs.rear);
  }, [hasCanonical, instances, mirrorBoth, commit]);

  // --- Placement preset ---
  const applyFrontPlacementPreset = useCallback((mode) => {
    if (!hasCanonical) return;
    const cfgWithMode = { ...frontSubsCfg, placementMode: mode };
    const next = applyPlacementPreset(instances, "front", cfgWithMode, appState?.roomDims);
    const cfgs = mirrorBoth(next);
    // Preserve the new placementMode in the mirrored CFG
    const frontCfg = { ...cfgs.front, placementMode: mode, isManual: false };
    commit(next, frontCfg, null);
  }, [hasCanonical, instances, frontSubsCfg, appState?.roomDims, mirrorBoth, commit]);

  const applyRearPlacementPreset = useCallback((mode) => {
    if (!hasCanonical) return;
    const cfgWithMode = { ...rearSubsCfg, placementMode: mode };
    const next = applyPlacementPreset(instances, "rear", cfgWithMode, appState?.roomDims);
    const cfgs = mirrorBoth(next);
    const rearCfg = { ...cfgs.rear, placementMode: mode, isManual: false };
    commit(next, null, rearCfg);
  }, [hasCanonical, instances, rearSubsCfg, appState?.roomDims, mirrorBoth, commit]);

  return {
    hasCanonicalInstances: hasCanonical,
    setFrontSubModel,
    setRearSubModel,
    setFrontSubCount,
    setRearSubCount,
    setFrontBottomHeight,
    setRearBottomHeight,
    applyFrontPlacementPreset,
    applyRearPlacementPreset,
  };
}