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

    const cleanModelKey = modelKey && modelKey.endsWith("_s") ? modelKey.slice(0, -2) : modelKey;
    if (app && typeof app.setGlobalSurroundModel === "function") {
      app.setGlobalSurroundModel(modelKeyLower === "off" ? "off" : cleanModelKey);
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

      const byRole = new Map();
      for (const s of Array.isArray(prev) ? prev : []) {
        byRole.set(getCanonicalRole(s.role), { ...s });
      }

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

      for (const role of ["SL", "SR", "SBL", "SBR", "LW", "RW"]) {
        if (!layoutRoles.includes(role)) byRole.delete(role);
      }

      if (!modelKey || modelKeyLower === "off" || modelKeyLower === "none") {
        for (const role of layoutRoles) {
          const s = byRole.get(role);
          if (!s) continue;
          byRole.set(role, { ...s, model: null });
        }

        if (needsSurroundResetRef) needsSurroundResetRef.current = false;
        if (lastSurroundModelKeyRef) lastSurroundModelKeyRef.current = null;

        const result = Array.from(byRole.values());
        if (globalThis.__B44_LOGS) {
          console.log("[SP] Surrounds OFF -> kept stubs:", result
            .filter(s => ["SL","SR","SBL","SBR","LW","RW"].includes(getCanonicalRole(s.role)))
            .map(s => ({ role: s.role, model: s.model }))
          );
        }
        return result;
      }

      // Apply resolved per-role models (overrides take effect here)
      for (const role of layoutRoles) {
        const s = byRole.get(role);
        if (!s) continue;
        const resolvedModel = roleModelMap[role] || modelKey;
        byRole.set(role, { ...s, model: resolvedModel });
      }

      const draft = Array.from(byRole.values());

      if (needsSurroundResetRef) needsSurroundResetRef.current = true;
      if (lastSurroundModelKeyRef) lastSurroundModelKeyRef.current = modelKey;

      if (globalThis.__B44_LOGS) {
        console.log("[SP] Surrounds ON -> draft (positions will be hydrated centrally):", draft
          .filter(s => ["SL","SR","SBL","SBR","LW","RW"].includes(getCanonicalRole(s.role)))
          .map(s => ({ role: s.role, model: s.model }))
        );
      }

      const hydrated = resetSurroundPositions(
        effectivePreset,
        mlpPoint,
        dimsSafe,
        draft,
        modelKey
      );

      const useWidesInsteadOfRears = sevenBedLayoutType === "wides";
      const expectsRears = (layoutMajor >= 9) || (layoutMajor === 7 && !useWidesInsteadOfRears);

      const list0 = Array.isArray(hydrated) && hydrated.length ? hydrated : draft;
      const byCanon0 = new Map(list0.map(s => [getCanonicalRole(s?.role), s]));

      const hasFiniteXY = (p) =>
        !!p && Number.isFinite(p.x) && Number.isFinite(p.y);

      if (expectsRears) {
        const W = Number(dimensions?.width ?? dimensions?.widthM) || 0;
        const L = Number(dimensions?.length ?? dimensions?.lengthM) || 0;
        const earZ = 1.1;

        if (W > 0 && L > 0) {
          const backY = Math.max(0.01, L - 0.10);

          const ensureRear = (role, xFrac) => {
            const canon = role;
            const existing = byCanon0.get(canon);

            if (existing && hasFiniteXY(existing.position)) return;

            // Use the resolved rearModel for SBL/SBR (not the global master)
            const x = Math.max(0.01, Math.min(W - 0.01, W * xFrac));
            const fixed = {
              ...(existing || {}),
              id: existing?.id || `${canon.toLowerCase()}-${timeNowMs()}`,
              role: canon,
              label: canon,
              model: existing?.model || rearModel || modelKey,
              position: { x, y: backY, z: earZ },
              rotation: existing?.rotation || { x: 0, y: 0, z: 0 },
              draggable: true,
            };

            byCanon0.set(canon, fixed);
          };

          ensureRear('SBL', 0.25);
          ensureRear('SBR', 0.75);
        }
      }

      const hydratedWithRears = Array.from(byCanon0.values());

      if (globalThis.__B44_LOGS) {
        console.log('[SP] Rear rescue check:', hydratedWithRears
          .filter(s => ['SBL','SBR'].includes(getCanonicalRole(s.role)))
          .map(s => ({ role: s.role, model: s.model, pos: s.position }))
        );
      }

      return hydratedWithRears;
    });
  }, [
    app,
    setSurroundConfig,
    setSpeakers,
    effectivePreset,
    useWides,
    mlpPoint,
    dimensions,
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

  return (
    <div className="space-y-3 p-2">
      <SurroundsSelector
        layout={dolbyPreset}
        choices={surroundChoices}
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