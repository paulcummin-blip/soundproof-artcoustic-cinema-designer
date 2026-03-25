import React, { useMemo, useCallback } from 'react';
import { useAppState } from '@/components/AppStateProvider';
import { getSpeakerModelMeta, getModelsByCategoryOrdered, normaliseModelKey, displayModelKey } from "@/components/models/speakers/registry";
import { getCanonicalRole, rolesForLayout } from "@/components/utils/surroundRoleMap";
import { timeNowMs } from "@/components/utils/timeNow";
import SurroundsSelector from '../speakers/SurroundsSelector';

export default function UnifiedSurroundsConfig({
  placedSpeakers,
  setSpeakers,
  mlpPoint,
  dolbyPreset,
  sevenBedLayoutType,
  dimensions,
  getHuggingCenterLines,
  applyCornerClearance,
  applyRoomBoundsClamp,
  disabled,
  allowedRoles,
  canSides,
  canRears,
  canWides,
  is7xOrHigher,
  safePos,
  effectivePreset,
  useWides,
  resetSurroundPositions,
  surroundConfig,
  setSurroundConfig,
  needsSurroundResetRef,
  lastSurroundModelKeyRef,
  extraSurroundCount,
  onExtraSurroundCountChange,
  allowExtraSurrounds,
}) {
  const dimsSafe = React.useMemo(() => {
    const src = dimensions || {};
    return {
      width: Number(src.width ?? src.widthM) || 4.5,
      length: Number(src.length ?? src.lengthM) || 6.0,
      height: Number(src.height ?? src.heightM) || 2.4,
    };
  }, [dimensions]);

  const app = useAppState();
  const activeRoles = useMemo(() => {
    const roles = [];
    if (allowedRoles.has('SL')) roles.push('SL', 'SR');
    if (allowedRoles.has('SBL')) roles.push('SBL', 'SBR');
    if (allowedRoles.has('LW')) roles.push('LW', 'RW');
    return roles;
  }, [allowedRoles]);

  const safeExtraSurroundCount = Number.isFinite(extraSurroundCount) ? extraSurroundCount : 0;
  const safeOnExtraSurroundCountChange =
    typeof onExtraSurroundCountChange === "function" ? onExtraSurroundCountChange : () => {};
  const safeAllowExtraSurrounds = !!allowExtraSurrounds;

  const handleSurroundModelChange = useCallback((config) => {
    const safeConfig = {
      value: {
        master: String(config?.value?.master || "off"),
        side: String(config?.value?.side || "off"),
        rear: String(config?.value?.rear || "off"),
        wide: String(config?.value?.wide || "off"),
      },
      override: {
        side: !!config?.override?.side,
        rear: !!config?.override?.rear,
        wide: !!config?.override?.wide,
      },
    };

    setSurroundConfig(safeConfig);

    const modelKeyRaw = safeConfig.value.master;
    let modelKey = String(modelKeyRaw || "").trim();
    modelKey = normaliseModelKey(modelKey);
    const modelKeyLower = modelKey.toLowerCase();

    // Resolve per-group override models (normalised, falling back to global)
    const resolveGroupModel = (groupVal, groupOverride) => {
      if (!groupOverride) return modelKey; // use global
      const raw = String(groupVal || "").trim();
      const norm = normaliseModelKey(raw);
      const lower = norm.toLowerCase();
      if (!norm || lower === "off" || lower === "none") return modelKey;
      return norm;
    };

    const sideModel = resolveGroupModel(safeConfig.value.side, safeConfig.override.side);
    const rearModel = resolveGroupModel(safeConfig.value.rear, safeConfig.override.rear);
    const wideModel = resolveGroupModel(safeConfig.value.wide, safeConfig.override.wide);

    // Role -> resolved model
    const roleModelMap = {
      SL: sideModel, SR: sideModel,
      SBL: rearModel, SBR: rearModel,
      LW: wideModel, RW: wideModel,
    };

    if (app && typeof app.setGlobalSurroundModel === "function") {
      app.setGlobalSurroundModel(modelKeyLower === "off" ? "off" : modelKey);
    }

    if (globalThis.__B44_LOGS) {
      console.log("[SP handleSurroundModelChange]", { modelKey, sideModel, rearModel, wideModel, effectivePreset, useWides });
    }

    setSpeakers((prev) => {
      const layout = String(effectivePreset || "5.1").split(" ")[0].split("_")[0];
      const layoutMajor = parseInt(String(layout || "5.1").split(".")[0], 10) || 5;
      const useWidesInsteadOfRearsForThisLayout = (layoutMajor === 7) ? !!useWides : false;

      const layoutRoles = rolesForLayout({
        dolbyLayout: layout,
        useWidesInsteadOfRears: useWidesInsteadOfRearsForThisLayout,
      }).filter((r) => ["SL", "SR", "SBL", "SBR", "LW", "RW"].includes(r));

      // Build byRole map — reuse existing objects EXACTLY (preserve position, positionSource, rotation, yaw)
      const byRole = new Map();
      for (const s of Array.isArray(prev) ? prev : []) {
        byRole.set(getCanonicalRole(s.role), s); // NOTE: no spread — keep original reference
      }

      // Only create a new stub for roles that truly do not exist yet
      for (const role of layoutRoles) {
        if (!byRole.has(role)) {
          byRole.set(role, {
            id: `${role.toLowerCase()}-${timeNowMs()}`,
            role,
            label: role,
            model: null,
            position: null,
            rotation: { x: 0, y: 0, z: 0 },
            draggable: true,
          });
        }
      }

      // Remove roles not expected by the current layout
      for (const role of ["SL", "SR", "SBL", "SBR", "LW", "RW"]) {
        if (!layoutRoles.includes(role)) byRole.delete(role);
      }

      if (!modelKey || modelKeyLower === "off" || modelKeyLower === "none") {
        // OFF path: only clear model, never touch positions
        const result = Array.from(byRole.values()).map(s => {
          const canon = getCanonicalRole(s.role);
          if (!["SL","SR","SBL","SBR","LW","RW"].includes(canon)) return s;
          return { ...s, model: null };
        });

        if (needsSurroundResetRef) needsSurroundResetRef.current = false;
        if (lastSurroundModelKeyRef) lastSurroundModelKeyRef.current = null;

        if (globalThis.__B44_LOGS) {
          console.log("[SP] Surrounds OFF -> kept stubs:", result
            .filter(s => ["SL","SR","SBL","SBR","LW","RW"].includes(getCanonicalRole(s.role)))
            .map(s => ({ role: s.role, model: s.model }))
          );
        }
        return result;
      }

      // ON path: only update model on existing speakers, keep all other fields intact
      const draft = Array.from(byRole.values()).map(s => {
        const canon = getCanonicalRole(s.role);
        if (!layoutRoles.includes(canon)) return s;
        const resolvedModel = roleModelMap[canon] || modelKey;
        // Spread only to update model — position, positionSource, rotation, yaw are preserved
        return { ...s, model: resolvedModel };
      });

      if (needsSurroundResetRef) needsSurroundResetRef.current = true;
      if (lastSurroundModelKeyRef) lastSurroundModelKeyRef.current = modelKey;

      if (globalThis.__B44_LOGS) {
        console.log("[SP] Surrounds ON -> draft:", draft
          .filter(s => ["SL","SR","SBL","SBR","LW","RW"].includes(getCanonicalRole(s.role)))
          .map(s => ({ role: s.role, model: s.model, pos: s.position }))
        );
      }

      // Single hydration pass — resetSurroundPositions only seeds roles with no valid position
      const hydrated = resetSurroundPositions(
        effectivePreset,
        mlpPoint,
        dimsSafe,
        draft,
        modelKey
      );

      // Return hydrated list directly — no second rescue pass
      return Array.isArray(hydrated) && hydrated.length ? hydrated : draft;
    });
  }, [
    app,
    setSurroundConfig,
    setSpeakers,
    effectivePreset,
    useWides,
    mlpPoint,
    dimsSafe,
    resetSurroundPositions,
    needsSurroundResetRef,
    lastSurroundModelKeyRef,
  ]);

  const surroundChoices = useMemo(() => {
    const byCat = getModelsByCategoryOrdered();
    const surrounds = byCat['SURROUNDS'] || [];
    return [
      { value: 'off', label: 'Off' },
      ...surrounds.map(s => ({ value: s.key, label: displayModelKey(s.label) }))
    ];
  }, [getModelsByCategoryOrdered]);

  const surroundOverrideChoices = useMemo(() => {
    return surroundChoices.filter(c => c.value !== 'off');
  }, [surroundChoices]);

  return (
    <div className="space-y-3 p-2">
      <SurroundsSelector
        layout={dolbyPreset}
        choices={surroundChoices}
        overrideChoices={surroundOverrideChoices}
        value={surroundConfig.value}
        override={surroundConfig.override}
        onChange={handleSurroundModelChange}
        activeRoles={activeRoles}
        disabled={disabled}
        extraSurroundCount={safeExtraSurroundCount}
        onExtraSurroundCountChange={safeOnExtraSurroundCountChange}
        allowExtraSurrounds={safeAllowExtraSurrounds}
      />
    </div>
  );
}