import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAppState } from '@/components/AppStateProvider';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import StepperInput from '@/components/ui/StepperInput';
import { getModelsByCategoryOrdered, getSpeakerModelMeta, normaliseModelKey } from '@/components/models/speakers/registry';
import { getLevelColors } from '@/components/utils/rp22Colors';
import { getCanonicalRole } from '@/components/utils/surroundRoleMap';
import { getMlpSeat } from '@/components/utils/spl/centralSplEngine';
import LcrSplCard from '@/components/speakers/LcrSplCard';
import { calculateLcrAcousticCentreBand, formatHeightM } from '@/components/utils/acoustics/acousticCentreBand';
import { calculateTvFrontStageHeightGuidance } from '@/components/utils/acoustics/tvFrontStageHeightGuidance';
import { P12_MODE_RECOMMENDED } from '@/components/utils/p12ModeAuthority';
import { Switch } from '@/components/ui/switch';
import LcrAcousticCentreGuidanceCard from '@/components/room/LcrAcousticCentreGuidanceCard';
import {
  CENTER_ONLY_SOUNDBAR_LABELS,
  INTEGRATED_LCR_SOUNDBAR_LABELS,
  buildRoleMap,
  hasFrontLcrSubClash,
  resolveSoundbarMeta,
  buildFrontStageSeed,
} from '@/components/room/lcrFrontStageSeed';

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
      return '';
    }

    for (const r of LCR_CANONICAL_ROLES) {
      const m = getByRole(r)?.model;
      if (m && standardLcrOptions.some(opt => opt.label === m)) return m;
    }
    return '';
  }, [getByRole, LCR_CANONICAL_ROLES, standardLcrOptions]);

  const lastP12SentRef = useRef(null);
  const hasInitialisedLcrIdealHeightRef = useRef(false);

  // Compute P12 values at component scope so the effect can depend on them
  const hasLcrSubClash = useMemo(() => hasFrontLcrSubClash({
    speakers: speakerSystem?.placedSpeakers,
    frontSubs: subwoofers,
    frontSubsCfg,
  }), [speakerSystem?.placedSpeakers, subwoofers, frontSubsCfg]);

  // P12 target basis is owned by appState.p12Mode (canonical "minimum"/"recommended").
  // radiationMode remains a separate acoustical value and is NOT coupled to P12.
  const p12ActiveMode = appState?.p12Mode === P12_MODE_RECOMMENDED ? P12_MODE_RECOMMENDED : 'minimum';

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
    const thresholds = p12ActiveMode === P12_MODE_RECOMMENDED ? P12_THRESHOLDS_REC : P12_THRESHOLDS_MIN;
    const level = computeRP22Level(pillBasisDb, thresholds);
    return { level, currentMode: p12ActiveMode };
  }, [allSeatSplMetrics, seatingPositions, p12ActiveMode]);

  // Write P12 LEVEL into app state. p12Mode is owned by the toggle below —
  // the effect never writes p12Mode, so the two authorities stay decoupled.
  useEffect(() => {
    if (!p12Computed) return;
    const sig = `${p12Computed.currentMode}|${p12Computed.level}`;
    if (lastP12SentRef.current === sig) return;
    lastP12SentRef.current = sig;
    appState?.setP12Level?.(p12Computed.level);
  }, [p12Computed, appState?.setP12Level]);

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

  // LCR acoustic-centre height: auto-follow the recommended value by default;
  // a manual override lets the designer lock a custom height.
  // Legacy projects (no explicit flag) preserve a saved height as manual so
  // existing completed projects are not silently re-steered; new projects with
  // no saved height default to auto-follow.
  const hasSavedLcrHeight = Number.isFinite(Number(splConfig?.lcrHeightM));
  const lcrHeightManual = splConfig?.lcrHeightManual === true
    ? true
    : splConfig?.lcrHeightManual === false
      ? false
      : hasSavedLcrHeight;

  const [lcrModel, setLcrModel] = useState(initialModel);
  const [frontStageMode, setFrontStageMode] = useState(derivedFrontStageMode);
  const [soundbarModel, setSoundbarModel] = useState(derivedSoundbarModel);
  const [lcrPowerInputValue, setLcrPowerInputValue] = useState(String(splConfig?.lcrW || 100));
  const [lcrHeightInputValue, setLcrHeightInputValue] = useState(String(clampLcrHeight(Number.isFinite(Number(splConfig?.lcrHeightM)) ? Number(splConfig.lcrHeightM) : defaultLcrHeightM).toFixed(2)));
  // Separate L/R height for center_only mode (FC uses lcrHeightInputValue)
  const [lrHeightInputValue, setLrHeightInputValue] = useState(String(clampLcrHeight(Number.isFinite(Number(splConfig?.lcrLRHeightM)) ? Number(splConfig.lcrLRHeightM) : defaultLcrHeightM).toFixed(2)));

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

  // LCR height sync is handled by the auto-follow effect below (after the
  // recommended-height memo and placed-height updaters are defined).

  useEffect(() => {
    // Prefer saved lcrLRHeightM, fall back to actual FL speaker z, then default
    const stored = Number(splConfig?.lcrLRHeightM);
    const flZ = Number(getByRole('FL')?.position?.z);
    const fallback = Number.isFinite(flZ) ? flZ : defaultLcrHeightM;
    const next = clampLcrHeight(Number.isFinite(stored) ? stored : fallback);
    setLrHeightInputValue(String(Number(next.toFixed(2))));
  }, [splConfig?.lcrLRHeightM, defaultLcrHeightM, clampLcrHeight, getByRole]);

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
    const rolesToUpdate = new Set(['FL', 'FC', 'FR', 'L', 'C', 'R']);
    setSpeakers?.((prev) => (Array.isArray(prev) ? prev.map((speaker) => {
      const role = getCanonicalRole(speaker?.role);
      if (!rolesToUpdate.has(role) || !speaker?.position) return speaker;
      return { ...speaker, position: { ...speaker.position, z: heightM } };
    }) : prev));
  }, [setSpeakers]);

  // Update only FL/FR heights (used in center_only mode)
  const updatePlacedLRHeight = useCallback((heightM) => {
    const lrRoles = new Set(['FL', 'FR', 'L', 'R']);
    setSpeakers?.((prev) => (Array.isArray(prev) ? prev.map((speaker) => {
      const role = getCanonicalRole(speaker?.role);
      if (!lrRoles.has(role) || !speaker?.position) return speaker;
      return { ...speaker, position: { ...speaker.position, z: heightM } };
    }) : prev));
  }, [setSpeakers]);

  // Update only FC height (used in center_only mode)
  const updatePlacedFCHeight = useCallback((heightM) => {
    setSpeakers?.((prev) => (Array.isArray(prev) ? prev.map((speaker) => {
      const role = getCanonicalRole(speaker?.role);
      if ((role !== 'FC' && role !== 'C') || !speaker?.position) return speaker;
      return { ...speaker, position: { ...speaker.position, z: heightM } };
    }) : prev));
  }, [setSpeakers]);

  // Acoustic centre guidance (read-only, no state writes)
  const acousticCentreGuidance = useMemo(() => {
    try {
      const activeModel = frontStageMode === 'integrated_lcr' ? null : lcrModel;
      const modelMeta = activeModel ? getSpeakerModelMeta(activeModel) : null;
      const speakerHeightM = modelMeta?.heightM || null;

      const screenBottom = Number(screen?.heightFromFloorM);
      const visWidthIn = Number(screen?.visibleWidthInches);
      const arStr = String(screen?.aspectRatio || '16:9');
      const [arW2, arH2] = arStr.split(':').map(Number);
      const ratio = (arW2 && arH2) ? arW2 / arH2 : 16 / 9;
      const viewableHeightM = (Number.isFinite(visWidthIn) && visWidthIn > 0)
        ? (visWidthIn * 0.0254) / ratio
        : null;

      const currentAcousticCentreM = Number.isFinite(Number(lcrHeightInputValue))
        ? Number(lcrHeightInputValue)
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
    lcrHeightInputValue,
    mlpPoint?.z,
  ]);

  const activeHeightGuidance = useMemo(() => {
    const isTv = Boolean(screen?.tvPresetKey);
    if (!isTv) return acousticCentreGuidance;

    const currentAcousticCentreM = Number.isFinite(Number(lcrHeightInputValue))
      ? Number(lcrHeightInputValue)
      : null;
    const activeSoundbarMeta = soundbarModel ? resolveSoundbarMeta(soundbarModel, screen) : null;
    const soundbarHeightM = Number.isFinite(Number(activeSoundbarMeta?.heightM))
      ? Number(activeSoundbarMeta.heightM)
      : Number.isFinite(Number(activeSoundbarMeta?.heightMm))
        ? Number(activeSoundbarMeta.heightMm) / 1000
        : null;

    return calculateTvFrontStageHeightGuidance({
      isTv,
      frontStageMode,
      screenBottomHeightM: Number(screen?.heightFromFloorM),
      viewableImageHeightM: screenHeightM,
      soundbarHeightM,
      placementOffsetFromScreenBottomMm: activeSoundbarMeta?.placementOffsetFromScreenBottomMm,
      currentAcousticCentreM,
    });
  }, [
    acousticCentreGuidance,
    frontStageMode,
    lcrHeightInputValue,
    screen,
    screenHeightM,
    soundbarModel,
  ]);

  // Recommended acoustic-centre height (auto-follow target). Uses the active
  // guidance authority (projector acoustic-centre band or TV front-stage guide)
  // so it stays correct for every front-stage mode.
  const recommendedLcrHeightM = useMemo(() => {
    const ideal = Number(activeHeightGuidance?.idealHeightM);
    return Number.isFinite(ideal) ? clampLcrHeight(ideal) : clampLcrHeight(defaultLcrHeightM);
  }, [activeHeightGuidance?.idealHeightM, clampLcrHeight, defaultLcrHeightM]);

  // LCR height authority:
  // - Auto (default): lock to recommendedLcrHeightM; update splConfig + placed
  //   speakers whenever the recommendation changes (room/screen/seating edits).
  // - Manual: follow the saved splConfig.lcrHeightM value; do not auto-reset.
  useEffect(() => {
    if (lcrHeightManual) {
      const stored = Number.isFinite(Number(splConfig?.lcrHeightM)) ? Number(splConfig.lcrHeightM) : recommendedLcrHeightM;
      const next = clampLcrHeight(stored);
      setLcrHeightInputValue(String(Number(next.toFixed(2))));
      return;
    }
    const target = recommendedLcrHeightM;
    setLcrHeightInputValue(String(Number(target.toFixed(2))));
    const stored = Number(splConfig?.lcrHeightM);
    if (!Number.isFinite(stored) || Math.abs(stored - target) > 0.005) {
      updateGlobalSpl?.({ lcrHeightM: target, lcrHeightManual: false });
      updatePlacedLcrHeight?.(target);
    }
  }, [lcrHeightManual, recommendedLcrHeightM, splConfig?.lcrHeightM, clampLcrHeight, updateGlobalSpl, updatePlacedLcrHeight]);

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

  const onToggleLcrHeightManual = useCallback((nextManual) => {
    if (nextManual) {
      // Entering manual: freeze the current effective height as the manual value.
      const current = Number(lcrHeightInputValue);
      const clamped = clampLcrHeight(Number.isFinite(current) ? current : recommendedLcrHeightM);
      updateGlobalSpl?.({ lcrHeightManual: true, lcrHeightM: clamped });
      setLcrHeightInputValue(String(Number(clamped.toFixed(2))));
    } else {
      // Leaving manual: reset to the current recommended acoustic-centre height.
      const target = recommendedLcrHeightM;
      updateGlobalSpl?.({ lcrHeightManual: false, lcrHeightM: target });
      updatePlacedLcrHeight?.(target);
      setLcrHeightInputValue(String(Number(target.toFixed(2))));
    }
  }, [lcrHeightInputValue, recommendedLcrHeightM, clampLcrHeight, updateGlobalSpl, updatePlacedLcrHeight]);

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

  // Clear the LCR model — remove the model from all LCR speakers and return
  // the selector to its placeholder state. No hidden fallback remains.
  const onClearLcrModel = useCallback(() => {
    setLcrModel('');
    const lcrRoleSet = new Set(['FL', 'FC', 'FR', 'L', 'C', 'R']);
    setSpeakers?.((prev) => (Array.isArray(prev) ? prev.map((s) => {
      const role = getCanonicalRole(s?.role);
      if (!lcrRoleSet.has(role)) return s;
      const next = { ...s };
      delete next.model;
      return next;
    }) : prev));
  }, [setSpeakers]);

  const onChooseFrontStageMode = useCallback((mode) => {
    const nextMode = mode || 'standard';
    const nextSoundbarModel = nextMode === 'standard'
      ? ''
      : nextMode === 'center_only'
        ? (CENTER_ONLY_SOUNDBAR_LABELS.includes(soundbarModel) ? soundbarModel : CENTER_ONLY_SOUNDBAR_LABELS[0])
        : (INTEGRATED_LCR_SOUNDBAR_LABELS.includes(soundbarModel) ? soundbarModel : INTEGRATED_LCR_SOUNDBAR_LABELS[0]);

    // When entering center_only mode, seed L/R height from the current shared height if not yet set
    if (nextMode === 'center_only' && !Number.isFinite(Number(splConfig?.lcrLRHeightM))) {
      const currentH = clampLcrHeight(Number.isFinite(Number(splConfig?.lcrHeightM)) ? Number(splConfig.lcrHeightM) : defaultLcrHeightM);
      setLrHeightInputValue(String(Number(currentH.toFixed(2))));
      updateGlobalSpl?.({ lcrLRHeightM: currentH });
    }

    setFrontStageMode(nextMode);
    setSoundbarModel(nextSoundbarModel);
    applyFrontStage(lcrModel, nextMode, nextSoundbarModel);
  }, [applyFrontStage, lcrModel, soundbarModel, splConfig?.lcrLRHeightM, splConfig?.lcrHeightM, defaultLcrHeightM, clampLcrHeight, updateGlobalSpl]);

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
      {/* ── Model ── */}
      <Label htmlFor="lcr-model" className="text-[#3E4349] font-medium">LCR Model</Label>
      <Select value={lcrModel || undefined} onValueChange={(val) => { if (val === '__none__') onClearLcrModel(); else onChooseModel(val); }} disabled={disabled}>
        <SelectTrigger id="lcr-model" className="w-full h-10 px-3 py-2 mt-1 bg-white border border-[#DCDBD6] rounded-md hover:border-[#213428] focus:border-[#213428] focus:ring-1 focus:ring-[#213428] focus:outline-none">
          <span className="text-2xl font-semibold" style={{ color: '#213428' }}>
            {frontStageMode === 'integrated_lcr' ? '-' : (lcrModel ? (getSpeakerModelMeta(lcrModel)?.label || lcrModel) : 'Select LCR model')}
          </span>
        </SelectTrigger>
        <SelectContent className="bg-white border-[#DCDBD6]">
          {lcrModel && <SelectItem value="__none__" className="hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]" style={{ color: '#9B9890' }}>— Clear selection —</SelectItem>}
          {standardLcrOptions.map(model => (
            <SelectItem key={model.key} value={model.label} className="hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]" style={{ color: '#213428' }}>{model.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* ── Front Stage ── */}
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

      {/* ── Acoustic Centre Height ── */}
      <div className="space-y-2 mt-4">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-[#625143]">
            {frontStageMode === 'center_only' ? 'Centre soundbar height (to middle of speaker)' : 'LCR height from floor (to middle of speaker)'}
          </Label>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#625143]">
              {lcrHeightManual ? 'Manual override' : `Auto: ${formatHeightM(recommendedLcrHeightM)} recommended`}
            </span>
            <Switch
              checked={lcrHeightManual}
              onCheckedChange={onToggleLcrHeightManual}
              disabled={disabled}
            />
          </div>
        </div>
        {frontStageMode === 'center_only' ? (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label className="text-[11px] text-[#625143]">Left / Right height from floor (to middle of speaker)</Label>
              <StepperInput
                value={Number(lrHeightInputValue) || 0}
                step={0.01}
                min={0.2}
                max={roomH - 0.2}
                disabled={disabled}
                onChange={(val) => {
                  const clamped = clampLcrHeight(val);
                  setLrHeightInputValue(String(Number(clamped.toFixed(2))));
                  updateGlobalSpl?.({ lcrLRHeightM: clamped });
                  updatePlacedLRHeight(clamped);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[11px] text-[#625143]">Centre soundbar height from floor (to middle of speaker)</Label>
              <StepperInput
                value={Number(lcrHeightInputValue) || 0}
                step={0.01}
                min={0.2}
                max={roomH - 0.2}
                disabled={disabled || !lcrHeightManual}
                onChange={(val) => {
                  if (!lcrHeightManual) return;
                  const clamped = clampLcrHeight(val);
                  setLcrHeightInputValue(String(Number(clamped.toFixed(2))));
                  updateGlobalSpl?.({ lcrHeightM: clamped });
                  updatePlacedFCHeight(clamped);
                }}
              />
            </div>
            {hasLcrSubClash && (
              <p className="text-xs font-medium text-red-600">⚠ Speaker and subwoofer clashing</p>
            )}
          </div>
        ) : (
          <>
            <StepperInput
              value={Number(lcrHeightInputValue) || 0}
              step={0.01}
              min={0.2}
              max={roomH - 0.2}
              disabled={disabled || !lcrHeightManual}
              onChange={(val) => {
                if (!lcrHeightManual) return;
                const clamped = clampLcrHeight(val);
                setLcrHeightInputValue(String(Number(clamped.toFixed(2))));
                updateGlobalSpl?.({ lcrHeightM: clamped });
                updatePlacedLcrHeight(clamped);
              }}
            />
            {hasLcrSubClash && (
              <p className="text-xs font-medium text-red-600">⚠ Speaker and subwoofer clashing</p>
            )}
          </>
        )}
      </div>

      {frontStageMode !== 'center_only' && (
        <LcrAcousticCentreGuidanceCard guidance={activeHeightGuidance} />
      )}

      {/* ── SPL @ RSP ── */}
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

      {/* ── Amplifier Power ── */}
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

      {/* ── RP22 P12 ── */}
      <div className="space-y-2 mt-4">
        <Label className="text-xs text-[#625143]">Parameter 12. Screen speakers SPL capability at RSP</Label>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={p12ActiveMode === 'minimum' ? 'default' : 'outline'}
            className={
              p12ActiveMode === 'minimum'
                ? 'flex-1 bg-[#213428] text-white hover:bg-[#213428]/90'
                : 'flex-1 border-[#DCDBD6] text-[#3E4349] hover:bg-[#F8F8F7]'
            }
            onClick={() => appState?.setP12Mode?.('minimum')}
            disabled={disabled}
          >
            Minimum
          </Button>
          <Button
            type="button"
            size="sm"
            variant={p12ActiveMode === P12_MODE_RECOMMENDED ? 'default' : 'outline'}
            className={
              p12ActiveMode === P12_MODE_RECOMMENDED
                ? 'flex-1 bg-[#213428] text-white hover:bg-[#213428]/90'
                : 'flex-1 border-[#DCDBD6] text-[#3E4349] hover:bg-[#F8F8F7]'
            }
            onClick={() => appState?.setP12Mode?.(P12_MODE_RECOMMENDED)}
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