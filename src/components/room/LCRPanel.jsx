import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAppState } from '@/components/AppStateProvider';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getModelsByCategoryOrdered, getSpeakerModelMeta, normaliseModelKey } from '@/components/models/speakers/registry';
import { getLevelColors } from '@/components/utils/rp22Colors';
import { getCanonicalRole } from '@/components/utils/surroundRoleMap';
import { getMlpSeat } from '@/components/utils/spl/centralSplEngine';
import LcrSplCard from '@/components/speakers/LcrSplCard';
import { calculateLcrAcousticCentreBand, formatHeightM } from '@/components/utils/acoustics/acousticCentreBand';

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

function rectsOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.bottom < b.top && a.top > b.bottom;
}

function hasFrontLcrSubClash({ speakers, frontSubs, frontSubsCfg }) {
  const lcrRoles = new Set(['FL', 'FC', 'FR', 'FCL', 'FCR']);
  const lcrRects = (Array.isArray(speakers) ? speakers : [])
    .filter((speaker) => lcrRoles.has(getCanonicalRole(speaker?.role)))
    .map((speaker) => {
      const x = Number(speaker?.position?.x);
      const z = Number(speaker?.position?.z);
      const meta = getSpeakerModelMeta(speaker?.model);
      const width = Number(meta?.widthM);
      const height = Number(meta?.heightM);
      if (![x, z, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
      return { left: x - width / 2, right: x + width / 2, bottom: z - height / 2, top: z + height / 2 };
    })
    .filter(Boolean);

  const frontSubRects = (Array.isArray(frontSubs) ? frontSubs : [])
    .filter((sub) => sub?.group === 'front' || String(sub?.role || '').toUpperCase().startsWith('SUBF'))
    .map((sub) => {
      const x = Number.isFinite(Number(sub?.position?.x)) ? Number(sub.position.x) : Number(sub?.x);
      const bottom = Number.isFinite(Number(sub?.bottomHeightM))
        ? Number(sub.bottomHeightM)
        : Number.isFinite(Number(frontSubsCfg?.bottomHeightM))
          ? Number(frontSubsCfg.bottomHeightM)
          : 0.05;
      const model = sub?.model || frontSubsCfg?.model;
      const meta = getSpeakerModelMeta(model);
      const width = Number(meta?.widthM);
      const height = Number(meta?.heightM);
      if (![x, bottom, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
      return { left: x - width / 2, right: x + width / 2, bottom, top: bottom + height };
    })
    .filter(Boolean);

  if (lcrRects.length === 0 || frontSubRects.length === 0) return false;
  return lcrRects.some((lcrRect) => frontSubRects.some((subRect) => rectsOverlap(lcrRect, subRect)));
}

const CENTER_ONLY_SOUNDBAR_LABELS = ['C-1', 'C4-1', 'Multi (Mono)', 'HSPL (Mono)'];
const INTEGRATED_LCR_SOUNDBAR_LABELS = ['Multi (LCR)', 'HSPL (LCR)'];

function resolveSoundbarMeta(modelLabel, screen) {
  const tvPresetKey = screen?.tvPresetKey || null;
  return getSpeakerModelMeta(modelLabel, tvPresetKey);
}

function buildFrontStageSeed({ baseModelLabel, frontStageMode, soundbarModelLabel, dimensions, screen, splConfig, setSpeakers }) {
  setSpeakers(prev => {
    const list = Array.isArray(prev) ? prev : [];
    const by = buildRoleMap(list);

    const isCentreLike = (role) => {
      const r = String(role || '').trim().toUpperCase();
      return r === 'FC' || r === 'C' || r === 'CENTER' || r === 'CENTRE';
    };
    const LCR_ROLES_SET = new Set(['FL', 'FR']);
    const filtered = list.filter(s => {
      const canon = getCanonicalRole(s.role);
      return !LCR_ROLES_SET.has(canon) && !isCentreLike(String(s.role || '').trim().toUpperCase());
    });

    const roomW = Number(dimensions?.width ?? dimensions?.widthM) || 4.5;
    const roomH = Number(dimensions?.height ?? dimensions?.heightM) || 2.8;
    const screenHeightFromFloorM = Number(screen?.heightFromFloorM) || 0.5;
    const visibleWidthInches = Number(screen?.visibleWidthInches) || 100;
    const aspectRatio = String(screen?.aspectRatio || '16:9');
    const [arW, arH] = aspectRatio.split(':').map(Number);
    const ratio = (arW && arH) ? arW / arH : 16 / 9;
    const viewableWidthM = visibleWidthInches * 0.0254;
    const viewableHeightM = viewableWidthM / ratio;
    const screenBottomM = screenHeightFromFloorM;

    const defaultY = 0.20;
    const lcrHeightM = Number(splConfig?.lcrHeightM);
    const defaultZ = Number.isFinite(lcrHeightM)
      ? lcrHeightM
      : roomH * 0.5;
    const spread = Math.min(1.2, roomW * 0.22);
    const midX = roomW / 2;

    const FL = by.get('FL') || { role: 'FL', id: 'FL-1', draggable: true };
    const FC = by.get('FC') || { role: 'FC', id: 'FC-1', draggable: true };
    const FR = by.get('FR') || { role: 'FR', id: 'FR-1', draggable: true };

    const soundbarLabel = soundbarModelLabel || null;
    const soundbarMeta = soundbarLabel ? resolveSoundbarMeta(soundbarLabel, screen) : null;
    const soundbarHeightM = Number(soundbarMeta?.heightM) || 0;
    const soundbarCenterZ = soundbarMeta
      ? Math.max(soundbarHeightM / 2, screenBottomM - 0.02 - (soundbarHeightM / 2))
      : defaultZ;

    if (frontStageMode === 'integrated_lcr' && soundbarLabel) {
      return [
        ...filtered,
        {
          ...FC,
          role: 'FC',
          id: FC.id || 'FC-1',
          model: soundbarLabel,
          position: { x: midX, y: defaultY, z: defaultZ },
          rotation: FC.rotation || { x: 0, y: 0, z: 0 },
        },
      ];
    }

    if (frontStageMode === 'center_only' && soundbarLabel) {
      return [
        ...filtered,
        {
          ...FL,
          role: 'FL',
          id: FL.id || 'FL-1',
          model: baseModelLabel,
          position: { ...(FL.position || { x: midX - spread, y: defaultY, z: defaultZ }), z: defaultZ },
          rotation: FL.rotation || { x: 0, y: 0, z: 0 },
        },
        {
          ...FC,
          role: 'FC',
          id: FC.id || 'FC-1',
          model: soundbarLabel,
          position: { x: midX, y: defaultY, z: defaultZ },
          rotation: FC.rotation || { x: 0, y: 0, z: 0 },
        },
        {
          ...FR,
          role: 'FR',
          id: FR.id || 'FR-1',
          model: baseModelLabel,
          position: { ...(FR.position || { x: midX + spread, y: defaultY, z: defaultZ }), z: defaultZ },
          rotation: FR.rotation || { x: 0, y: 0, z: 0 },
        },
      ];
    }

    return [
      ...filtered,
      {
        ...FL,
        role: 'FL',
        id: FL.id || 'FL-1',
        model: baseModelLabel,
        position: { x: midX - spread, y: defaultY, z: defaultZ },
        rotation: FL.rotation || { x: 0, y: 0, z: 0 },
      },
      {
        ...FC,
        role: 'FC',
        id: FC.id || 'FC-1',
        model: baseModelLabel,
        position: { x: midX, y: defaultY, z: defaultZ },
        rotation: FC.rotation || { x: 0, y: 0, z: 0 },
      },
      {
        ...FR,
        role: 'FR',
        id: FR.id || 'FR-1',
        model: baseModelLabel,
        position: { x: midX + spread, y: defaultY, z: defaultZ },
        rotation: FR.rotation || { x: 0, y: 0, z: 0 },
      },
    ];
  });
}

export default function LCRPanel({ setSpeakers, dimensions, lcrAimMode, onChangeLcrAimMode, lcrAngleDeg, mlpPoint, disabled, allSeatSplMetrics, onP12Update }) {
  const appState = useAppState();
  const { speakerSystem, splConfig = {}, updateGlobalSpl, seatingPositions, screen, frontSubsCfg, subwoofers } = appState || {};
  const { LCR: lcrModelOptions = [] } = getModelsByCategoryOrdered() || {};

  const LCR_CANONICAL_ROLES = useMemo(() => new Set(['FL', 'FC', 'FR']), []);
  const lcrRoles = useMemo(() => ['FL', 'FC', 'FR'], []);

  const byRole = useMemo(() => buildRoleMap(speakerSystem?.placedSpeakers || []),
    [speakerSystem?.placedSpeakers]);

  const getByRole = useCallback(r => byRole.get(getCanonicalRole(r)), [byRole]);

  const soundbarOptions = useMemo(() => lcrModelOptions.filter((opt) => {
    const meta = getSpeakerModelMeta(opt.label);
    return meta?.frontStageType === 'center_only' || meta?.frontStageType === 'integrated_lcr';
  }), [lcrModelOptions]);

  const standardLcrOptions = useMemo(() => lcrModelOptions.filter((opt) => {
    const meta = getSpeakerModelMeta(opt.label);
    return !meta?.frontStageType;
  }), [lcrModelOptions]);

  const initialModel = useMemo(() => {
    const fcModel = getByRole('FC')?.model;
    const fcMeta = fcModel ? getSpeakerModelMeta(fcModel) : null;

    if (fcMeta?.frontStageType === 'center_only' || fcMeta?.frontStageType === 'integrated_lcr') {
      for (const role of ['FL', 'FR']) {
        const m = getByRole(role)?.model;
        if (m && standardLcrOptions.some(opt => opt.label === m)) return m;
      }
      return standardLcrOptions[0]?.label || '';
    }

    for (const r of LCR_CANONICAL_ROLES) {
      const m = getByRole(r)?.model;
      if (m && standardLcrOptions.some(opt => opt.label === m)) return m;
    }
    return standardLcrOptions[0]?.label || '';
  }, [getByRole, LCR_CANONICAL_ROLES, standardLcrOptions]);

  const lastP12SentRef = useRef(null);

  // Compute P12 values at component scope so the effect can depend on them
  const hasLcrSubClash = useMemo(() => hasFrontLcrSubClash({
    speakers: speakerSystem?.placedSpeakers,
    frontSubs: subwoofers,
    frontSubsCfg,
  }), [speakerSystem?.placedSpeakers, subwoofers, frontSubsCfg]);

  // Acoustic centre guidance (read-only, no state writes)
  const acousticCentreGuidance = useMemo(() => {
    try {
      const activeModel = frontStageMode === 'integrated_lcr' ? null : lcrModel;
      const modelMeta = activeModel ? getSpeakerModelMeta(activeModel) : null;
      const speakerHeightM = modelMeta?.heightM || null;

      const screenBottom = Number(screen?.heightFromFloorM);
      const visWidthIn = Number(screen?.visibleWidthInches);
      const arStr = String(screen?.aspectRatio || '16:9');
      const [arW, arH] = arStr.split(':').map(Number);
      const ratio = (arW && arH) ? arW / arH : 16 / 9;
      const viewableHeightM = (Number.isFinite(visWidthIn) && visWidthIn > 0)
        ? (visWidthIn * 0.0254) / ratio
        : null;

      const currentAcousticCentreM = Number.isFinite(Number(splConfig?.lcrHeightM))
        ? Number(splConfig.lcrHeightM)
        : null;

      const seatedEarHeightM = Number.isFinite(mlpPoint?.z) ? mlpPoint.z : 1.2;

      return calculateLcrAcousticCentreBand({
        screenBottomHeightM: Number.isFinite(screenBottom) ? screenBottom : null,
        viewableImageHeightM: viewableHeightM,
        seatedEarHeightM,
        speakerHeightM,
        currentAcousticCentreM,
      });
    } catch {
      return null;
    }
  }, [
    lcrModel,
    frontStageMode,
    screen?.heightFromFloorM,
    screen?.visibleWidthInches,
    screen?.aspectRatio,
    splConfig?.lcrHeightM,
    mlpPoint?.z,
  ]);

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

  const fcModel = getByRole('FC')?.model;
  const fcMeta = fcModel ? getSpeakerModelMeta(fcModel) : null;
  const derivedFrontStageMode = fcMeta?.frontStageType === 'integrated_lcr' ? 'integrated_lcr' : fcMeta?.frontStageType === 'center_only' ? 'center_only' : 'standard';
  const derivedSoundbarModel = (fcMeta?.frontStageType === 'center_only' || fcMeta?.frontStageType === 'integrated_lcr') ? fcModel : '';

  const roomH = Number(dimensions?.height ?? dimensions?.heightM) || 2.8;
  const screenBottomM = Number(screen?.heightFromFloorM);
  const visibleWidthInches = Number(screen?.visibleWidthInches);
  const aspectRatio = String(screen?.aspectRatio || '16:9');
  const [arW, arH] = aspectRatio.split(':').map(Number);
  const screenRatio = (arW && arH) ? arW / arH : 16 / 9;
  const screenHeightM = Number.isFinite(visibleWidthInches) && visibleWidthInches > 0 ? (visibleWidthInches * 0.0254) / screenRatio : null;
  const defaultLcrHeightM = Number.isFinite(screenBottomM) && Number.isFinite(screenHeightM)
    ? screenBottomM + screenHeightM / 2
    : roomH * 0.5;
  const clampLcrHeight = useCallback((value) => Math.max(0.2, Math.min(roomH - 0.2, value)), [roomH]);

  const [lcrModel, setLcrModel] = useState(initialModel);
  const [frontStageMode, setFrontStageMode] = useState(derivedFrontStageMode);
  const [soundbarModel, setSoundbarModel] = useState(derivedSoundbarModel);
  const [lcrPowerInputValue, setLcrPowerInputValue] = useState(String(splConfig?.lcrW || 100));
  const [lcrHeightInputValue, setLcrHeightInputValue] = useState(String(clampLcrHeight(Number.isFinite(Number(splConfig?.lcrHeightM)) ? Number(splConfig.lcrHeightM) : defaultLcrHeightM).toFixed(2)));

  useEffect(() => {
    if (initialModel && initialModel !== lcrModel) setLcrModel(initialModel);
  }, [initialModel, lcrModel]);

  useEffect(() => {
    if (derivedFrontStageMode !== frontStageMode) setFrontStageMode(derivedFrontStageMode);
    if (derivedSoundbarModel !== soundbarModel) setSoundbarModel(derivedSoundbarModel);
  }, [derivedFrontStageMode, derivedSoundbarModel, frontStageMode, soundbarModel]);

  useEffect(() => {
    setLcrPowerInputValue(String(splConfig?.lcrW || 100));
  }, [splConfig?.lcrW]);

  useEffect(() => {
    const stored = Number(splConfig?.lcrHeightM);
    const next = clampLcrHeight(Number.isFinite(stored) ? stored : defaultLcrHeightM);
    setLcrHeightInputValue(String(Number(next.toFixed(2))));
  }, [splConfig?.lcrHeightM, defaultLcrHeightM, clampLcrHeight]);

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

  const updatePlacedLcrHeight = useCallback((heightM) => {
    const rolesToUpdate = new Set(['FL', 'FC', 'FR']);

    if (rolesToUpdate.size === 0) return;

    setSpeakers?.((prev) => (Array.isArray(prev) ? prev.map((speaker) => {
      const role = getCanonicalRole(speaker?.role);
      if (!rolesToUpdate.has(role) || !speaker?.position) return speaker;
      return { ...speaker, position: { ...speaker.position, z: heightM } };
    }) : prev));
  }, [frontStageMode, setSpeakers]);

  const handleLcrHeightChange = useCallback((e) => {
    const newValue = e.target.value;
    if (newValue !== '' && !/^\d*\.?\d*$/.test(newValue)) return;
    setLcrHeightInputValue(newValue);
    if (newValue === '' || newValue.endsWith('.')) return;

    const val = Number(newValue);
    const maxHeight = roomH - 0.2;
    if (Number.isFinite(val) && val >= 0.2 && val <= maxHeight) {
      updateGlobalSpl?.({ lcrHeightM: val });
      updatePlacedLcrHeight(val);
    }
  }, [roomH, updateGlobalSpl, updatePlacedLcrHeight]);

  const handleLcrHeightBlur = useCallback((e) => {
    const val = Number(e.target.value);
    const fallback = Number.isFinite(Number(splConfig?.lcrHeightM)) ? Number(splConfig.lcrHeightM) : defaultLcrHeightM;
    const clamped = clampLcrHeight(Number.isFinite(val) ? val : fallback);
    setLcrHeightInputValue(String(Number(clamped.toFixed(2))));
    updateGlobalSpl?.({ lcrHeightM: clamped });
    updatePlacedLcrHeight(clamped);
  }, [clampLcrHeight, defaultLcrHeightM, splConfig?.lcrHeightM, updateGlobalSpl, updatePlacedLcrHeight]);

  const applyFrontStage = useCallback((nextBaseModel, nextMode, nextSoundbarModel) => {
    buildFrontStageSeed({
      baseModelLabel: nextBaseModel,
      frontStageMode: nextMode,
      soundbarModelLabel: nextSoundbarModel,
      dimensions,
      screen,
      splConfig,
      setSpeakers,
    });
  }, [dimensions, screen, splConfig, setSpeakers]);

  const onChooseModel = useCallback((modelLabel) => {
    if (!standardLcrOptions.some(opt => opt.label === modelLabel)) return;
    setLcrModel(modelLabel);
    applyFrontStage(modelLabel, frontStageMode, soundbarModel);
  }, [standardLcrOptions, applyFrontStage, frontStageMode, soundbarModel]);

  const onChooseFrontStageMode = useCallback((mode) => {
    const nextMode = mode || 'standard';
    const nextSoundbarModel = nextMode === 'standard'
      ? ''
      : nextMode === 'center_only'
        ? (CENTER_ONLY_SOUNDBAR_LABELS.includes(soundbarModel) ? soundbarModel : CENTER_ONLY_SOUNDBAR_LABELS[0])
        : (INTEGRATED_LCR_SOUNDBAR_LABELS.includes(soundbarModel) ? soundbarModel : INTEGRATED_LCR_SOUNDBAR_LABELS[0]);

    setFrontStageMode(nextMode);
    setSoundbarModel(nextSoundbarModel);
    applyFrontStage(lcrModel, nextMode, nextSoundbarModel);
  }, [applyFrontStage, lcrModel, soundbarModel]);

  const onChooseSoundbarModel = useCallback((modelLabel) => {
    if (!soundbarOptions.some(opt => opt.label === modelLabel)) return;
    setSoundbarModel(modelLabel);
    const meta = getSpeakerModelMeta(modelLabel);
    const nextMode = meta?.frontStageType === 'integrated_lcr' ? 'integrated_lcr' : 'center_only';
    if (nextMode !== frontStageMode) setFrontStageMode(nextMode);
    applyFrontStage(lcrModel, nextMode, modelLabel);
  }, [soundbarOptions, applyFrontStage, lcrModel, frontStageMode]);
  
  return (
    <div className="space-y-2 p-2">
      <Label htmlFor="lcr-model" className="text-[#3E4349] font-medium">LCR Model</Label>
      <Select value={lcrModel || undefined} onValueChange={onChooseModel} disabled={disabled}>
        <SelectTrigger id="lcr-model" className="w-full h-10 px-3 py-2 mt-1 bg-white border border-[#DCDBD6] rounded-md hover:border-[#213428] focus:border-[#213428] focus:ring-1 focus:ring-[#213428] focus:outline-none">
          <span className="text-2xl font-semibold" style={{ color: '#213428' }}>
            {frontStageMode === 'integrated_lcr' ? '-' : (lcrModel ? (getSpeakerModelMeta(lcrModel)?.label || lcrModel) : 'Select LCR model')}
          </span>
        </SelectTrigger>
        <SelectContent className="bg-white border-[#DCDBD6]">
          {standardLcrOptions.map(model => (
            <SelectItem key={model.key} value={model.label} className="hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]" style={{ color: '#213428' }}>{model.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="space-y-2 mt-4">
        <Label htmlFor="front-stage-mode" className="text-[#3E4349] font-medium">Front Stage</Label>
        <Select value={frontStageMode} onValueChange={onChooseFrontStageMode} disabled={disabled}>
          <SelectTrigger id="front-stage-mode" className="w-full h-10 px-3 py-2 bg-white border border-[#DCDBD6] rounded-md hover:border-[#213428] focus:border-[#213428] focus:ring-1 focus:ring-[#213428] focus:outline-none">
            <span className="text-base font-semibold" style={{ color: '#213428' }}>
              {frontStageMode === 'integrated_lcr' ? 'Integrated LCR soundbar' : frontStageMode === 'center_only' ? 'Center-only soundbar override' : 'Separate LCR speakers'}
            </span>
          </SelectTrigger>
          <SelectContent className="bg-white border-[#DCDBD6]">
            <SelectItem value="standard" className="hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]" style={{ color: '#213428' }}>Separate LCR speakers</SelectItem>
            <SelectItem value="center_only" className="hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]" style={{ color: '#213428' }}>Center-only soundbar override</SelectItem>
            <SelectItem value="integrated_lcr" className="hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]" style={{ color: '#213428' }}>Integrated LCR soundbar</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {frontStageMode !== 'standard' && (
        <div className="space-y-2 mt-4">
          <Label htmlFor="front-stage-soundbar" className="text-[#3E4349] font-medium">Soundbar Model</Label>
          <Select value={soundbarModel || undefined} onValueChange={onChooseSoundbarModel} disabled={disabled}>
            <SelectTrigger id="front-stage-soundbar" className="w-full h-10 px-3 py-2 bg-white border border-[#DCDBD6] rounded-md hover:border-[#213428] focus:border-[#213428] focus:ring-1 focus:ring-[#213428] focus:outline-none">
              <span className="text-base font-semibold" style={{ color: '#213428' }}>
                {soundbarModel ? (getSpeakerModelMeta(soundbarModel)?.label || soundbarModel) : 'Select soundbar model'}
              </span>
            </SelectTrigger>
            <SelectContent className="bg-white border-[#DCDBD6]">
              {soundbarOptions
                .filter((model) => frontStageMode === 'center_only'
                  ? CENTER_ONLY_SOUNDBAR_LABELS.includes(model.label)
                  : INTEGRATED_LCR_SOUNDBAR_LABELS.includes(model.label)
                )
                .map(model => (
                  <SelectItem key={model.key} value={model.label} className="hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]" style={{ color: '#213428' }}>{model.label}</SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      )}

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
              integratedLcrMode={derivedFrontStageMode === 'integrated_lcr'}
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
        <Label className="text-xs text-[#625143]">LCR height from floor (to middle of speaker)</Label>
        <div className="relative">
          <Input
            type="text"
            inputMode="decimal"
            value={lcrHeightInputValue}
            onChange={handleLcrHeightChange}
            onBlur={handleLcrHeightBlur}
            disabled={disabled}
            className="pr-8"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#625143] pointer-events-none">
            m
          </span>
        </div>
        {hasLcrSubClash && (
          <p className="text-xs font-medium text-red-600">⚠ Speaker and subwoofer clashing</p>
        )}
      </div>

      {acousticCentreGuidance?.isValid && (() => {
        const { status, minHeightM, maxHeightM, idealHeightM, currentAcousticCentreM } = acousticCentreGuidance;
        const statusColor = status === 'ideal' ? '#2d7a4f' : status === 'below' || status === 'above' ? '#b45309' : '#6b7280';
        const statusLabel = status === 'ideal' ? 'Ideal' : status === 'below' ? 'Below range' : status === 'above' ? 'Above range' : 'Unknown';
        return (
          <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 6, background: '#F8F8F7', border: '1px solid #E6E4DD' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#625143', marginBottom: 5, letterSpacing: '0.3px', textTransform: 'uppercase' }}>
              Acoustic Centre Guidance
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 10px' }}>
              <span style={{ fontSize: 11, color: '#888' }}>Current</span>
              <span style={{ fontSize: 11, color: '#1B1A1A', fontWeight: 600 }}>
                {currentAcousticCentreM !== null ? formatHeightM(currentAcousticCentreM) : '—'}
              </span>
              <span style={{ fontSize: 11, color: '#888' }}>Range</span>
              <span style={{ fontSize: 11, color: '#1B1A1A' }}>
                {formatHeightM(minHeightM)} – {formatHeightM(maxHeightM)}
              </span>
              <span style={{ fontSize: 11, color: '#888' }}>Ideal</span>
              <span style={{ fontSize: 11, color: '#1B1A1A' }}>{formatHeightM(idealHeightM)}</span>
              <span style={{ fontSize: 11, color: '#888' }}>Status</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: statusColor }}>{statusLabel}</span>
            </div>
          </div>
        );
      })()}

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