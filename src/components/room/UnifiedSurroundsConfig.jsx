import React, { useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAppState } from '@/components/AppStateProvider';
import { getSpeakerModelMeta, normaliseModelKey } from "@/components/models/speakers/registry";
import { useProductRoleOptions } from "@/components/products/useProductMaster";
import { PRODUCT_ROLES } from "@/components/products/productMaster";
import { getCanonicalRole, rolesForLayout } from "@/components/utils/surroundRoleMap";
import { timeNowMs } from "@/components/utils/timeNow";
import SurroundsSelector from '../speakers/SurroundsSelector';
import AcousticCentreHeightField from './surrounds/AcousticCentreHeightField';
import SelectedSpeakerCard from './surrounds/SelectedSpeakerCard';
import { groupForSurroundRole } from './surrounds/surroundAcousticCentreAuthority';
import { useSpeakerSelection, setSpeakerSelection } from '@/components/state/speakerSelectionStore';

/** What each group is called on screen, and the roles it governs when no
    speaker of that group is installed yet. */
const GROUP_LABEL = { side: 'Side Surround', rear: 'Rear Surround', wide: 'Front Wide' };
const GROUP_ROLE_FALLBACK = { side: ['SL', 'SR'], rear: ['SBL', 'SBR'], wide: ['LW', 'RW'] };

/** "Default 1.60 m (follows the risers)" — the group's own stated default. */
const defaultHint = (defaultM) => {
  const value = Number(defaultM);
  return Number.isFinite(value)
    ? `Default ${value.toFixed(2)} m (follows the risers)`
    : 'Default follows the risers';
};

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
  acousticCentre,
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
  const { options: sideModels } = useProductRoleOptions(PRODUCT_ROLES.SURROUND);
  const { options: rearModels } = useProductRoleOptions(PRODUCT_ROLES.REAR_SURROUND);
  const { options: wideModels } = useProductRoleOptions(PRODUCT_ROLES.FRONT_WIDE);
  const activeRoles = useMemo(() => {
    const roles = [];
    if (allowedRoles.has('SL')) roles.push('SL', 'SR');
    if (allowedRoles.has('SBL')) roles.push('SBL', 'SBR');
    if (allowedRoles.has('LW')) roles.push('LW', 'RW');
    return roles;
  }, [allowedRoles]);

  // --- Selection: the same act as choosing a speaker in the elevation --------
  // A selection made in the drawing names ONE speaker, so SL, SL1, SR and SR1
  // stay individually identifiable; a selection made at a control names the
  // whole group that control governs, so the group's speakers light up together.
  const selection = useSpeakerSelection();

  // Which speakers each group actually has installed, read from the design.
  const installedByGroup = useMemo(() => {
    const list = Array.isArray(placedSpeakers) ? placedSpeakers : [];
    return list.reduce((groups, speaker) => {
      const group = groupForSurroundRole(speaker?.role);
      if (!group) return groups;
      const role = String(speaker?.role || '').toUpperCase();
      if (!role) return groups;
      groups[group] = groups[group] || [];
      if (!groups[group].includes(role)) groups[group].push(role);
      return groups;
    }, {});
  }, [placedSpeakers]);

  const rolesForGroup = useCallback(
    (group) =>
      installedByGroup[group]?.length ? installedByGroup[group] : GROUP_ROLE_FALLBACK[group] || [],
    [installedByGroup],
  );

  // The group the current selection points at, whichever end it came from.
  const selectedGroup =
    selection.group || (selection.primary ? groupForSurroundRole(selection.primary) : null);

  const selectedSpeaker = useMemo(() => {
    if (!selection.primary) return null;
    const list = Array.isArray(placedSpeakers) ? placedSpeakers : [];
    return (
      list.find(
        (speaker) => String(speaker?.role || '').toUpperCase() === selection.primary,
      ) || null
    );
  }, [placedSpeakers, selection.primary]);

  const selectedWall = useMemo(() => {
    const x = Number(selectedSpeaker?.position?.x);
    if (!Number.isFinite(x)) return null;
    return x < dimsSafe.width / 2 ? 'left wall' : 'right wall';
  }, [selectedSpeaker, dimsSafe.width]);

  // A speaker picked in the drawing brings its own control into view.
  React.useEffect(() => {
    if (selection.source !== 'drawing' || !selectedGroup) return undefined;
    const element = document.getElementById(`acoustic-centre-${selectedGroup}`);
    if (!element || typeof element.scrollIntoView !== 'function') return undefined;
    const frame = requestAnimationFrame(() => {
      try {
        element.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } catch {
        // A view with nothing to scroll simply stays where it is.
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [selection.token, selection.source, selectedGroup]);

  const engageGroup = useCallback(
    (group) => {
      setSpeakerSelection({ group, roles: rolesForGroup(group), source: 'panel' });
    },
    [rolesForGroup],
  );

  const safeExtraSurroundCount = Number.isFinite(extraSurroundCount) ? extraSurroundCount : 0;
  const safeOnExtraSurroundCountChange =
    typeof onExtraSurroundCountChange === "function" ? onExtraSurroundCountChange : () => {};
  const safeAllowExtraSurrounds = !!allowExtraSurrounds;

  React.useEffect(() => {
    const stripSurroundSuffix = (value) => {
      const str = String(value || '').trim();
      return str.endsWith('_s') ? str.slice(0, -2) : str;
    };

    const surroundChoiceKeys = new Set(
      [...sideModels, ...rearModels, ...wideModels].map((item) => item.key)
    );
    for (const speaker of (Array.isArray(placedSpeakers) ? placedSpeakers : [])) {
      // Canonical base key: a legacy "_s" placement still matches its base choice.
      const historicalKey = stripSurroundSuffix(normaliseModelKey(speaker?.model || ''));
      if (historicalKey) surroundChoiceKeys.add(historicalKey);
    }

    const normalizeSurroundChoiceModel = (value) => {
      const normalized = normaliseModelKey(String(value || '').trim());
      const lower = normalized.toLowerCase();
      if (!normalized || lower === 'off' || lower === 'none') return null;
      if (surroundChoiceKeys.has(normalized)) return normalized;

      // Product identity is canonical: a legacy role-encoded "_s" id resolves to
      // its base product rather than the suffix being re-added.
      const baseKey = stripSurroundSuffix(normalized);
      return surroundChoiceKeys.has(baseKey) ? baseKey : null;
    };

    let restoredMaster = normalizeSurroundChoiceModel(app?.globalSurroundModel);

    if (!restoredMaster) {
      const surroundRoles = new Set(['SL', 'SR', 'SBL', 'SBR', 'LW', 'RW']);
      const inferred = (Array.isArray(placedSpeakers) ? placedSpeakers : []).find((speaker) => {
        const role = getCanonicalRole(speaker?.role);
        const model = normalizeSurroundChoiceModel(speaker?.model);
        return surroundRoles.has(role) && !!model;
      });
      restoredMaster = normalizeSurroundChoiceModel(inferred?.model);
    }

    if (!restoredMaster) return;

    setSurroundConfig((prev) => {
      const currentMaster = String(prev?.value?.master || 'off');
      const nextMaster = restoredMaster;

      if (currentMaster === nextMaster) return prev;

      const next = {
        ...prev,
        value: {
          ...prev.value,
          master: nextMaster,
        },
        override: {
          ...prev.override,
        },
      };

      if (!prev?.override?.side && (prev?.value?.side === currentMaster || prev?.value?.side === 'off')) {
        next.value.side = nextMaster;
      }
      if (!prev?.override?.rear && (prev?.value?.rear === currentMaster || prev?.value?.rear === 'off')) {
        next.value.rear = nextMaster;
      }
      if (!prev?.override?.wide && (prev?.value?.wide === currentMaster || prev?.value?.wide === 'off')) {
        next.value.wide = nextMaster;
      }

      return next;
    });
  }, [app?.globalSurroundModel, placedSpeakers, setSurroundConfig, sideModels, rearModels, wideModels]);

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
    const activeGroups = [];
    if (canSides) activeGroups.push(sideModels);
    if (canRears) activeGroups.push(rearModels);
    if (canWides) activeGroups.push(wideModels);
    const groups = activeGroups.length ? activeGroups : [sideModels];
    const allowedByEveryActiveRole = groups[0].filter((model) =>
      groups.every((group) => group.some((candidate) => candidate.key === model.key))
    );
    return [
      { value: 'off', label: 'Off' },
      ...allowedByEveryActiveRole.map((model) => ({ value: model.key, label: model.label })),
    ];
  }, [canSides, canRears, canWides, sideModels, rearModels, wideModels]);

  const sideChoices = useMemo(() => sideModels.map((model) => ({ value: model.key, label: model.label })), [sideModels]);
  const rearChoices = useMemo(() => rearModels.map((model) => ({ value: model.key, label: model.label })), [rearModels]);
  const wideChoices = useMemo(() => wideModels.map((model) => ({ value: model.key, label: model.label })), [wideModels]);

  return (
    <div className="space-y-3 p-2">
      <SurroundsSelector
        layout={dolbyPreset}
        choices={surroundChoices}
        sideChoices={sideChoices}
        rearChoices={rearChoices}
        wideChoices={wideChoices}
        value={surroundConfig.value}
        override={surroundConfig.override}
        onChange={handleSurroundModelChange}
        activeRoles={activeRoles}
        disabled={disabled}
        extraSurroundCount={safeExtraSurroundCount}
        onExtraSurroundCountChange={safeOnExtraSurroundCountChange}
        allowExtraSurrounds={safeAllowExtraSurrounds}
      />

      {/* Acoustic centre heights — read from, and written to, the speakers
          themselves, so the panel and the drawing can never disagree. */}
      {(canSides || canRears || canWides) && (
        <div className="mt-3 border-t border-[#E6E4DD] pt-3 space-y-3">
          <SelectedSpeakerCard
            role={selection.primary}
            model={selectedSpeaker?.model || null}
            acousticCentreM={
              Number.isFinite(Number(selectedSpeaker?.position?.z))
                ? Number(selectedSpeaker.position.z)
                : null
            }
            positionY={
              Number.isFinite(Number(selectedSpeaker?.position?.y))
                ? Number(selectedSpeaker.position.y)
                : null
            }
            wall={selectedWall}
            groupLabel={selection.group ? GROUP_LABEL[selection.group] : null}
            groupRoles={selection.group ? rolesForGroup(selection.group) : []}
            groupValueM={
              selection.group ? acousticCentre?.groups?.[selection.group]?.valueM : null
            }
            groupMixed={selection.group ? !!acousticCentre?.groups?.[selection.group]?.mixed : false}
          />
          <p className="text-xs text-[#625143]">
            Acoustic Centre Height is the vertical centre of the speaker cabinet, measured from the
            finished floor. The default follows the seating risers: front wides 1.20 m above the first
            row, side surrounds above the second row, rear surrounds above the last row. Typing a value
            sets that group's height and is kept, whatever the seating does afterwards.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {canSides && (
              <AcousticCentreHeightField
                group="side"
                highlight={selectedGroup === 'side'}
                onEngage={() => engageGroup('side')}
                label="Side Surround — Acoustic Centre Height"
                valueM={acousticCentre?.groups?.side?.valueM}
                mixed={acousticCentre?.groups?.side?.mixed}
                defaultM={acousticCentre?.defaults?.sideM}
                minM={acousticCentre?.groups?.side?.minM}
                maxM={acousticCentre?.groups?.side?.maxM}
                hint={defaultHint(acousticCentre?.defaults?.sideM)}
                disabled={disabled}
                onChange={(valueM) => acousticCentre?.onChange?.('side', valueM)}
              />
            )}

            {canRears && (
              <AcousticCentreHeightField
                group="rear"
                highlight={selectedGroup === 'rear'}
                onEngage={() => engageGroup('rear')}
                label="Rear Surround — Acoustic Centre Height"
                valueM={acousticCentre?.groups?.rear?.valueM}
                mixed={acousticCentre?.groups?.rear?.mixed}
                defaultM={acousticCentre?.defaults?.rearM}
                minM={acousticCentre?.groups?.rear?.minM}
                maxM={acousticCentre?.groups?.rear?.maxM}
                hint={defaultHint(acousticCentre?.defaults?.rearM)}
                disabled={disabled}
                onChange={(valueM) => acousticCentre?.onChange?.('rear', valueM)}
              />
            )}

            {canWides && (
              <AcousticCentreHeightField
                group="wide"
                highlight={selectedGroup === 'wide'}
                onEngage={() => engageGroup('wide')}
                label="Front Wide — Acoustic Centre Height"
                valueM={acousticCentre?.groups?.wide?.valueM}
                mixed={acousticCentre?.groups?.wide?.mixed}
                defaultM={acousticCentre?.defaults?.wideM}
                minM={acousticCentre?.groups?.wide?.minM}
                maxM={acousticCentre?.groups?.wide?.maxM}
                hint={defaultHint(acousticCentre?.defaults?.wideM)}
                disabled={disabled}
                onChange={(valueM) => acousticCentre?.onChange?.('wide', valueM)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}