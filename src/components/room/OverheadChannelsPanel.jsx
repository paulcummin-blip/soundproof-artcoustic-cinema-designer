import React, { useState, useEffect, useCallback } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { CollapsiblePanel } from '@/components/ui/CollapsiblePanel';
import { useAppState } from '@/components/AppStateProvider';
import OverheadChannelSelector from '@/components/speakers/OverheadChannelSelector';
import OverheadSplStrip from '@/components/speakers/OverheadSplStrip';
import { getLevelColors } from '@/components/utils/rp22Colors';
import { getMlpSeat } from "@/components/utils/spl/centralSplEngine";
import { getTargetOverheadIds } from '@/components/room/utils/dolbyHelpers';
import { assignModelsForRoles, resolveOverheadModelForRole } from '@/components/room/utils/speakerAssignmentAuthority';

const P13_THRESHOLDS_REC = { L1: 99, L2: 102, L3: 105, L4: 108 };
const P13_THRESHOLDS_MIN = { L1: 96, L2: 99, L3: 102, L4: 105 };

function computeRP22Level(splDb, thresholds) {
  if (!Number.isFinite(splDb)) return null;
  if (splDb >= thresholds.L4) return 4;
  if (splDb >= thresholds.L3) return 3;
  if (splDb >= thresholds.L2) return 2;
  if (splDb >= thresholds.L1) return 1;
  return 'FAIL';
}

function RP22LevelPill({ level, label }) {
  const colors = getLevelColors(level);
  return (
    <div style={{ marginTop: 12, padding: '8px 16px', borderRadius: 8, border: `1px solid ${colors.border || '#E6E4DD'}`, background: colors.bg, display: 'inline-block', width: '100%' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>
        {label}: {typeof level === 'number' && level >= 1 ? `Level ${level}` : 'FAIL'}
      </div>
    </div>
  );
}

export default function OverheadChannelsPanel({
  overheadCount,
  overheadGlobalModel, setOverheadGlobalModel,
  overheadFrontOverride, setOverheadFrontOverride,
  overheadMidOverride, setOverheadMidOverride,
  overheadRearOverride, setOverheadRearOverride,
  useFrontGlobal, setUseFrontGlobal,
  useMidGlobal, setUseMidGlobal,
  useRearGlobal, setUseRearGlobal,
  disabled,
  placedSpeakers,
  setSpeakers,
  mlpPoint,
  effectivePreset,
  allSeatSplMetrics,
  mlpSeat,
}) {
  const appState = useAppState() || {};
  const { splConfig = {}, updateGlobalSpl } = appState;

  const [overheadsPowerInputValue, setOverheadsPowerInputValue] = useState(String(splConfig?.overheadsW ?? 100));

  useEffect(() => {
    setOverheadsPowerInputValue(String(splConfig?.overheadsW || 100));
  }, [splConfig?.overheadsW]);

  // The overhead control is the user action that installs overhead equipment:
  // selecting a model gives it to the roles the current format requires, and
  // clearing it removes them again. Format changes, reloads and placement never
  // assign a model on their own.
  const selection = {
    globalModel: overheadGlobalModel,
    frontOverride: overheadFrontOverride,
    midOverride: overheadMidOverride,
    rearOverride: overheadRearOverride,
    useFrontGlobal,
    useMidGlobal,
    useRearGlobal,
  };

  const applyOverheadSelection = useCallback((next) => {
    if (typeof setSpeakers !== 'function') return;
    const roles = getTargetOverheadIds(effectivePreset);
    if (!roles.length) return;
    setSpeakers((prev) => assignModelsForRoles(
      Array.isArray(prev) ? prev : [],
      roles,
      (role) => resolveOverheadModelForRole(role, next),
    ));
  }, [setSpeakers, effectivePreset]);

  const handleGlobalModelChange = (model) => {
    setOverheadGlobalModel(model);
    applyOverheadSelection({ ...selection, globalModel: model });
  };

  const handleFrontOverrideChange = (model) => {
    setOverheadFrontOverride(model);
    setUseFrontGlobal(false);
    applyOverheadSelection({ ...selection, frontOverride: model, useFrontGlobal: false });
  };

  const handleMidOverrideChange = (model) => {
    setOverheadMidOverride(model);
    setUseMidGlobal(false);
    applyOverheadSelection({ ...selection, midOverride: model, useMidGlobal: false });
  };

  const handleRearOverrideChange = (model) => {
    setOverheadRearOverride(model);
    setUseRearGlobal(false);
    applyOverheadSelection({ ...selection, rearOverride: model, useRearGlobal: false });
  };

  const handleUseFrontGlobalChange = (next) => {
    setUseFrontGlobal(next);
    applyOverheadSelection({ ...selection, useFrontGlobal: next });
  };

  const handleUseMidGlobalChange = (next) => {
    setUseMidGlobal(next);
    applyOverheadSelection({ ...selection, useMidGlobal: next });
  };

  const handleUseRearGlobalChange = (next) => {
    setUseRearGlobal(next);
    applyOverheadSelection({ ...selection, useRearGlobal: next });
  };

  if (overheadCount === 0) return null;

  const p13Pill = (() => {
    if (!allSeatSplMetrics) return null;
    const mlpMetrics = allSeatSplMetrics.get("mlp");
    const seatMetrics = mlpMetrics || (mlpSeat ? allSeatSplMetrics.get(mlpSeat.id) : null);
    if (!seatMetrics?.spl?.uppers) return null;
    const overheadTileSplDb = Object.values(seatMetrics.spl.uppers)
      .map(s => s?.value).filter(v => Number.isFinite(v)).map(v => Math.ceil(v));
    if (overheadTileSplDb.length === 0) return null;
    const pillBasisDb = Math.min(...overheadTileSplDb);
    const isMinimumMode = splConfig?.p13Mode === 'minimum' || !splConfig?.p13Mode;
    const thresholds = isMinimumMode ? P13_THRESHOLDS_MIN : P13_THRESHOLDS_REC;
    const level = computeRP22Level(pillBasisDb, thresholds);
    return <RP22LevelPill level={level} label="RP22 P13 (Overheads)" />;
  })();

  return (
    <CollapsiblePanel title="Overhead Channels" defaultOpen={false}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left column: configuration and mounting */}
        <div className="space-y-3">
          <OverheadChannelSelector
            overheadCount={overheadCount}
            globalModel={overheadGlobalModel}
            onGlobalModelChange={handleGlobalModelChange}
            frontOverride={overheadFrontOverride}
            midOverride={overheadMidOverride}
            rearOverride={overheadRearOverride}
            onFrontOverrideChange={handleFrontOverrideChange}
            onMidOverrideChange={handleMidOverrideChange}
            onRearOverrideChange={handleRearOverrideChange}
            useFrontGlobal={useFrontGlobal}
            useMidGlobal={useMidGlobal}
            useRearGlobal={useRearGlobal}
            onUseFrontGlobalChange={handleUseFrontGlobalChange}
            onUseMidGlobalChange={handleUseMidGlobalChange}
            onUseRearGlobalChange={handleUseRearGlobalChange}
            disabled={disabled}
          />
        </div>

        {/* Right column: performance */}
        <div className="space-y-3">
          <div>
            <OverheadSplStrip
              allSeatSplMetrics={allSeatSplMetrics}
              mlpSeat={mlpSeat}
              dolbyLayout={effectivePreset}
            />
          </div>

          {/* Amplifier Power (Overheads) */}
          <div className="space-y-2 mt-4">
            <Label className="text-xs text-[#625143]">Amplifier Power (Overheads)</Label>
            <div className="relative">
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={overheadsPowerInputValue}
                onChange={(e) => {
                  const newValue = e.target.value;
                  if (newValue !== '' && !/^\d+$/.test(newValue)) return;
                  setOverheadsPowerInputValue(newValue);
                  if (newValue === '') return;
                  const val = parseInt(newValue, 10);
                  if (Number.isFinite(val) && val >= 1 && val <= 5000) {
                    updateGlobalSpl?.({ overheadsW: val });
                  }
                }}
                onBlur={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!Number.isFinite(val) || val < 1 || val > 5000) {
                    setOverheadsPowerInputValue(String(splConfig?.overheadsW || 100));
                  } else {
                    const clamped = Math.max(1, Math.min(5000, val));
                    setOverheadsPowerInputValue(String(clamped));
                    if (clamped !== (splConfig?.overheadsW || 100)) {
                      updateGlobalSpl?.({ overheadsW: clamped });
                    }
                  }
                }}
                disabled={disabled}
                className="pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#625143] pointer-events-none">W</span>
            </div>
          </div>

          {/* P13 Mode toggle (matching Surrounds structure) */}
          <div className="space-y-2 mt-4">
            <Label className="text-xs text-[#625143]">Parameter 13. Non-screen speakers SPL capability at RSP</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={splConfig?.p13Mode === 'minimum' || !splConfig?.p13Mode ? 'default' : 'outline'}
                className={
                  splConfig?.p13Mode === 'minimum' || !splConfig?.p13Mode
                    ? 'flex-1 bg-[#213428] text-white hover:bg-[#213428]/90'
                    : 'flex-1 border-[#DCDBD6] text-[#3E4349] hover:bg-[#F8F8F7]'
                }
                onClick={() => updateGlobalSpl?.({ p13Mode: 'minimum' })}
                disabled={disabled}
              >
                Minimum
              </Button>
              <Button
                type="button"
                size="sm"
                variant={splConfig?.p13Mode === 'recommended' ? 'default' : 'outline'}
                className={
                  splConfig?.p13Mode === 'recommended'
                    ? 'flex-1 bg-[#213428] text-white hover:bg-[#213428]/90'
                    : 'flex-1 border-[#DCDBD6] text-[#3E4349] hover:bg-[#F8F8F7]'
                }
                onClick={() => updateGlobalSpl?.({ p13Mode: 'recommended' })}
                disabled={disabled}
              >
                Recommended
              </Button>
            </div>
          </div>

          {p13Pill}
        </div>
      </div>
    </CollapsiblePanel>
  );
}