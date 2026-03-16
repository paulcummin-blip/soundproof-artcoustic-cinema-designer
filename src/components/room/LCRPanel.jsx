import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAppState } from '@/components/AppStateProvider';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getModelsByCategoryOrdered, getSpeakerModelMeta } from '@/components/models/speakers/registry';
import { getLevelColors } from '@/components/utils/rp22Colors';
import { getCanonicalRole } from '@/components/utils/surroundRoleMap';
import { getMlpSeat } from '@/components/utils/spl/centralSplEngine';
import LcrSplCard from '@/components/speakers/LcrSplCard';

const P12_THRESHOLDS_REC = { L1: 102, L2: 105, L3: 108, L4: 111 };
const P12_THRESHOLDS_MIN = { L1: 99, L2: 102, L3: 105, L4: 108 };

function computeRP22Level(splDb, thresholds) {
  if (!Number.isFinite(splDb)) return null;
  if (splDb >= thresholds.L4) return 4;
  if (splDb >= thresholds.L3) return 3;
  if (splDb >= thresholds.L2) return 2;
  if (splDb >= thresholds.L1) return 1;
  return 'FAIL';
}

function RP22LevelPill({ parameter, level, label }) {
  const colors = getLevelColors(level);
  return (
    <div
      style={{
        marginTop: 12,
        padding: '8px 16px',
        borderRadius: 8,
        border: `1px solid ${colors.border || '#E6E4DD'}`,
        background: colors.bg,
        display: 'inline-block',
        width: '100%',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>
        {label}: {typeof level === 'number' && level >= 1 ? `Level ${level}` : 'FAIL'}
      </div>
    </div>
  );
}

function buildRoleMap(list) {
  const m = new Map();
  (Array.isArray(list) ? list : []).forEach((s) => {
    const raw = String(s.role || '').toUpperCase();
    const canon = getCanonicalRole(raw);
    m.set(raw, s);
    m.set(canon, s);
  });
  return m;
}

function ensureLcrWhenSelectingModel(modelLabel, dimensions, setSpeakers) {
  setSpeakers(prev => {
    const list = Array.isArray(prev) ? prev : [];
    const by = buildRoleMap(list);

    const LCR_ROLES_SET = new Set(['FL', 'FC', 'FR']);
    const filtered = list.filter(s => !LCR_ROLES_SET.has(getCanonicalRole(s.role)));

    const roomW = Number(dimensions?.width ?? dimensions?.widthM) || 4.5;
    const roomH = Number(dimensions?.height ?? dimensions?.heightM) || 2.8;

    const defaultY = 0.20;
    const defaultZ = roomH * 0.5;
    const spread = Math.min(1.2, roomW * 0.22);

    const FL = by.get('FL') || { role: 'FL', id: 'FL-1', draggable: true };
    const FC = by.get('FC') || { role: 'FC', id: 'FC-1', draggable: true };
    const FR = by.get('FR') || { role: 'FR', id: 'FR-1', draggable: true };

    const midX = roomW / 2;

    const seeded = [
      {
        ...FL,
        role: 'FL',
        id: FL.id || 'FL-1',
        model: modelLabel,
        position: FL.position || { x: midX - spread, y: defaultY, z: defaultZ },
        rotation: FL.rotation || { x: 0, y: 0, z: 0 },
      },
      {
        ...FC,
        role: 'FC',
        id: FC.id || 'FC-1',
        model: modelLabel,
        position: FC.position || { x: midX, y: defaultY, z: defaultZ },
        rotation: FC.rotation || { x: 0, y: 0, z: 0 },
      },
      {
        ...FR,
        role: 'FR',
        id: FR.id || 'FR-1',
        model: modelLabel,
        position: FR.position || { x: midX + spread, y: defaultY, z: defaultZ },
        rotation: FR.rotation || { x: 0, y: 0, z: 0 },
      },
    ];

    return [...filtered, ...seeded];
  });
}

export default function LCRPanel({ setSpeakers, dimensions, lcrAimMode, onChangeLcrAimMode, lcrAngleDeg, mlpPoint, disabled, allSeatSplMetrics, onP12Update }) {
  const appState = useAppState();
  const { speakerSystem, splConfig = {}, updateGlobalSpl, seatingPositions } = appState || {};
  const { LCR: lcrModelOptions = [] } = getModelsByCategoryOrdered() || {};

  const LCR_CANONICAL_ROLES = useMemo(() => new Set(['FL', 'FC', 'FR']), []);
  const lcrRoles = useMemo(() => ['FL', 'FC', 'FR'], []);

  const byRole = useMemo(() => buildRoleMap(speakerSystem?.placedSpeakers || []),
    [speakerSystem?.placedSpeakers]);

  const getByRole = useCallback(r => byRole.get(getCanonicalRole(r)), [byRole]);

  const initialModel = useMemo(() => {
    for (const r of LCR_CANONICAL_ROLES) {
      const m = getByRole(r)?.model;
      if (m && lcrModelOptions.some(opt => opt.label === m)) return m;
    }
    return '';
  }, [getByRole, LCR_CANONICAL_ROLES, lcrModelOptions]);

  const lastP12SentRef = React.useRef(null);

  // Compute P12 values at component scope so the effect can depend on them
  const p12Computed = useMemo(() => {
    if (!allSeatSplMetrics) return null;
    const mlpMetrics = allSeatSplMetrics.get('mlp');
    const seatMetrics = mlpMetrics || (() => {
      const mlp = getMlpSeat(seatingPositions || []);
      return mlp ? allSeatSplMetrics.get(mlp.id) : null;
    })();
    if (!seatMetrics?.spl?.screen) return null;
    const lcrTileSplDb = ['FL', 'FC', 'FR']
      .map(role => seatMetrics.spl.screen[role]?.value)
      .filter(v => Number.isFinite(v))
      .map(v => Math.ceil(v));
    if (lcrTileSplDb.length === 0) return null;
    const pillBasisDb = Math.min(...lcrTileSplDb);
    const isMinimumMode = splConfig?.radiationMode === 'half-space' || !splConfig?.radiationMode;
    const thresholds = isMinimumMode ? P12_THRESHOLDS_MIN : P12_THRESHOLDS_REC;
    const level = computeRP22Level(pillBasisDb, thresholds);
    const currentMode = isMinimumMode ? 'half-space' : 'anechoic';
    return { level, currentMode };
  }, [allSeatSplMetrics, seatingPositions, splConfig?.radiationMode]);

  // Write P12 result into app state (picked up by the normal save path via splConfig)
  useEffect(() => {
    if (!p12Computed) return;
    const sig = `${p12Computed.currentMode}|${p12Computed.level}`;
    if (lastP12SentRef.current === sig) return;
    lastP12SentRef.current = sig;
    appState?.setP12Mode?.(p12Computed.currentMode);
    appState?.setP12Level?.(p12Computed.level);
  }, [p12Computed, appState?.setP12Mode, appState?.setP12Level]);

  const [lcrModel, setLcrModel] = useState(initialModel);
  const [lcrPowerInputValue, setLcrPowerInputValue] = useState(String(splConfig?.lcrW || 100));

  useEffect(() => {
    if (initialModel && initialModel !== lcrModel) setLcrModel(initialModel);
  }, [initialModel, lcrModel]);

  useEffect(() => {
    setLcrPowerInputValue(String(splConfig?.lcrW || 100));
  }, [splConfig?.lcrW]);

  const handleLcrPowerChange = useCallback((e) => {
    const newValue = e.target.value;
    if (newValue !== '' && !/^\d+$/.test(newValue)) return;
    setLcrPowerInputValue(newValue);
    if (newValue === '') return;
    const val = parseInt(newValue, 10);
    if (Number.isFinite(val) && val >= 1 && val <= 5000) {
      updateGlobalSpl?.({ lcrW: val });
    }
  }, [updateGlobalSpl]);

  const handleLcrPowerBlur = useCallback((e) => {
    const val = parseInt(e.target.value, 10);
    if (!Number.isFinite(val) || val < 1 || val > 5000) {
      const lastValid = splConfig?.lcrW || 100;
      setLcrPowerInputValue(String(lastValid));
    } else {
      const clamped = Math.max(1, Math.min(5000, val));
      setLcrPowerInputValue(String(clamped));
      if (clamped !== (splConfig?.lcrW || 100)) {
        updateGlobalSpl?.({ lcrW: clamped });
      }
    }
  }, [splConfig?.lcrW, updateGlobalSpl]);

  const onChooseModel = useCallback((modelLabel) => {
    if (!lcrModelOptions.some(opt => opt.label === modelLabel)) return;
    setLcrModel(modelLabel);
    ensureLcrWhenSelectingModel(modelLabel, dimensions, setSpeakers);
  }, [dimensions, setSpeakers, lcrModelOptions]);

  return (
    <div className="space-y-2 p-2">
      <Label htmlFor="lcr-model" className="text-[#3E4349] font-medium">LCR Model</Label>
      <Select value={lcrModel || undefined} onValueChange={onChooseModel} disabled={disabled}>
        <SelectTrigger id="lcr-model" className="w-full h-10 px-3 py-2 mt-1 bg-white border border-[#DCDBD6] rounded-md hover:border-[#213428] focus:border-[#213428] focus:ring-1 focus:ring-[#213428] focus:outline-none">
          <span className="text-2xl font-semibold" style={{ color: '#213428' }}>
            {lcrModel ? (getSpeakerModelMeta(lcrModel)?.label || lcrModel) : 'Select LCR model'}
          </span>
        </SelectTrigger>
        <SelectContent className="bg-white border-[#DCDBD6]">
          {lcrModelOptions.map(model => (
            <SelectItem key={model.key} value={model.label} className="hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]" style={{ color: '#213428' }}>{model.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <p className="text-xs text-[#625143] mt-1">
        Angle to MLP: <span className="font-semibold text-[#1B1A1A]">{Math.round(lcrAngleDeg)}°</span>
      </p>

      <div className="mt-4">
        <Label className="text-xs text-[#625143] mb-2 block">SPL @ RSP</Label>
        <div className="grid grid-cols-3 gap-3">
          {lcrRoles.map((role) => (
            <LcrSplCard
              key={role}
              role={role}
              label={role === 'FL' ? 'Left' : role === 'FC' ? 'Center' : 'Right'}
              allSeatSplMetrics={allSeatSplMetrics}
            />
          ))}
        </div>
      </div>

      <div className="space-y-2 mt-4">
        <Label className="text-xs text-[#625143]">Amplifier Power (LCR)</Label>
        <div className="relative">
          <Input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={lcrPowerInputValue}
            onChange={handleLcrPowerChange}
            onBlur={handleLcrPowerBlur}
            disabled={disabled}
            className="pr-8"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#625143] pointer-events-none">
            W
          </span>
        </div>
      </div>

      <div className="space-y-2 mt-4">
        <Label className="text-xs text-[#625143]">Parameter 12. Screen speakers SPL capability at RSP</Label>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={splConfig?.radiationMode === 'half-space' || !splConfig?.radiationMode ? 'default' : 'outline'}
            className={
              splConfig?.radiationMode === 'half-space' || !splConfig?.radiationMode
                ? 'flex-1 bg-[#213428] text-white hover:bg-[#213428]/90'
                : 'flex-1 border-[#DCDBD6] text-[#3E4349] hover:bg-[#F8F8F7]'
            }
            onClick={() => updateGlobalSpl?.({ radiationMode: 'half-space' })}
            disabled={disabled}
          >
            Minimum
          </Button>
          <Button
            type="button"
            size="sm"
            variant={splConfig?.radiationMode === 'anechoic' ? 'default' : 'outline'}
            className={
              splConfig?.radiationMode === 'anechoic'
                ? 'flex-1 bg-[#213428] text-white hover:bg-[#213428]/90'
                : 'flex-1 border-[#DCDBD6] text-[#3E4349] hover:bg-[#F8F8F7]'
            }
            onClick={() => updateGlobalSpl?.({ radiationMode: 'anechoic' })}
            disabled={disabled}
          >
            Recommended
          </Button>
        </div>
      </div>

      {p12Computed && (
        <RP22LevelPill
          parameter="P12"
          level={p12Computed.level}
          label="RP22 P12"
        />
      )}
    </div>
  );
}