import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAppState } from '@/components/AppStateProvider';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import StepperInput from '@/components/ui/StepperInput';
import { getSpeakerModelMeta, normaliseModelKey } from '@/components/models/speakers/registry';
import { useProductRoleOptions } from '@/components/products/useProductMaster';
import { PRODUCT_ROLES } from '@/components/products/productMaster';
import { resolveModelOption } from '@/components/products/modelOptionResolver';
import RP22LabelledLevelPill from '@/components/ui/RP22LabelledLevelPill';
import { getCanonicalRole } from '@/components/utils/surroundRoleMap';
import { yawDegToMLP } from '@/components/room/utils/speakerHelpers';
import { effectiveCentreAcousticMidpoint } from '@/components/utils/dualCentrePairAuthority';
import { getMlpSeat } from '@/components/utils/spl/centralSplEngine';
import LcrSplCard from '@/components/speakers/LcrSplCard';
import { calculateLcrAcousticCentreBand, formatHeightM } from '@/components/utils/acoustics/acousticCentreBand';
import { calculateTvFrontStageHeightGuidance } from '@/components/utils/acoustics/tvFrontStageHeightGuidance';
import { P12_MODE_RECOMMENDED } from '@/components/utils/p12ModeAuthority';
import { Switch } from '@/components/ui/switch';
import LcrAcousticCentreGuidanceCard from '@/components/room/LcrAcousticCentreGuidanceCard';
import { computeTvVerticalCentreM } from '@/components/roomdesigner/utils/lcrHeightAuthority';
import {
  CENTER_ONLY_SOUNDBAR_LABELS,
  INTEGRATED_LCR_SOUNDBAR_LABELS,
  buildRoleMap,
  hasFrontLcrSubClash,
  resolveSoundbarMeta,
  buildFrontStageSeed,
} from '@/components/room/lcrFrontStageSeed';
import {
  CABINET_ORIENTATION_OPTIONS,
  CENTRE_CABINET_ROLES,
  FRONT_STAGE_DUAL_CENTRE,
  FRONT_STAGE_MODE_LABELS,
  FRONT_STAGE_MODE_OPTIONS,
  FRONT_STAGE_STANDARD,
  CABINET_AIM_OPTIONS,
  centreCabinetAimMode,
  centreCabinetOrientation,
  centreCabinets,
  defaultDualCentreCentreModelLabel,
  detectDualCentreStage,
  eligibleDualCentreCentreOptions,
  needsSeriesParallelWarning,
  normaliseCabinetOrientation,
  normaliseCentreCabinetAimMode,
  normaliseFrontStageMode,
} from '@/components/utils/frontStageModeAuthority';
import { resolveCanonicalRsp } from '@/components/room/placement/initialSpeakerPlacement';

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

export default function LCRPanel({ setSpeakers, dimensions, lcrAimMode, onChangeLcrAimMode, lcrAngleDeg, mlpPoint, disabled, allSeatSplMetrics, onP12Update }) {
  const appState = useAppState();
  const { speakerSystem, splConfig = {}, updateGlobalSpl, seatingPositions, screen, frontSubsCfg, subwoofers } = appState || {};
  const { options: standardLcrOptions } = useProductRoleOptions(PRODUCT_ROLES.LCR);
  const { options: soundbarOptions } = useProductRoleOptions(PRODUCT_ROLES.CENTRE_SOUNDBAR);

  const LCR_CANONICAL_ROLES = useMemo(() => new Set(['FL', 'FC', 'FR']), []);
  const lcrRoles = useMemo(() => ['FL', 'FC', 'FR'], []);

  const byRole = useMemo(() => buildRoleMap(speakerSystem?.placedSpeakers || []),
    [speakerSystem?.placedSpeakers]);

  const getByRole = useCallback(r => byRole.get(getCanonicalRole(r)), [byRole]);

  // The installed speaker records are the equipment authority. Their stored value
  // is the canonical product KEY (e.g. "q4-3") while the options are keyed by
  // product LABEL (e.g. "Q4-3"), so the match goes through the shared key-first
  // resolver and returns the OPTION's own label — the value every SelectItem
  // carries. Nothing here assigns a model: a role with no equipment stays unset.
  const initialModel = useMemo(() => {
    const fcModel = getByRole('FC')?.model;
    const fcMeta = fcModel ? getSpeakerModelMeta(fcModel) : null;

    // Shown while the catalogue is still loading, or when a product is not
    // published in it, so an installed model is displayed immediately rather
    // than reading as "Select LCR model".
    const installedLabel = (model) => {
      if (!model) return null;
      const meta = getSpeakerModelMeta(model);
      return meta && !meta.notFound ? (meta.label || model) : model;
    };
    const labelFor = (model) => resolveModelOption(standardLcrOptions, model)?.label || installedLabel(model);

    if (fcMeta?.frontStageType === 'center_only' || fcMeta?.frontStageType === 'integrated_lcr') {
      for (const role of ['FL', 'FR']) {
        const label = labelFor(getByRole(role)?.model);
        if (label) return label;
      }
      return '';
    }

    for (const r of LCR_CANONICAL_ROLES) {
      const label = labelFor(getByRole(r)?.model);
      if (label) return label;
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
  // The dual-centre stage is detected from its own two physical cabinets: the mode's
  // record IS the cabinets, since in this mode there is no single FC speaker. The
  // three existing modes resolve exactly as before.
  const dualCentreStage = useMemo(
    () => detectDualCentreStage(speakerSystem?.placedSpeakers),
    [speakerSystem?.placedSpeakers],
  );
  const derivedFrontStageMode = dualCentreStage
    ? FRONT_STAGE_DUAL_CENTRE
    : fcMeta?.frontStageType === 'integrated_lcr' ? 'integrated_lcr' : fcMeta?.frontStageType === 'center_only' ? 'center_only' : FRONT_STAGE_STANDARD;
  // A soundbar is installed the same way as an LCR: the stored key is resolved to
  // its catalogue option's label so the binding matches a SelectItem exactly, with
  // the registry label as the loading fallback.
  const derivedSoundbarModel = useMemo(() => {
    const isSoundbarStage = fcMeta?.frontStageType === 'center_only' || fcMeta?.frontStageType === 'integrated_lcr';
    if (!isSoundbarStage || !fcModel) return '';
    const fromCatalogue = resolveModelOption(soundbarOptions, fcModel)?.label;
    if (fromCatalogue) return fromCatalogue;
    const meta = getSpeakerModelMeta(fcModel);
    return meta && !meta.notFound ? (meta.label || fcModel) : fcModel;
  }, [fcModel, fcMeta?.frontStageType, soundbarOptions]);

  // Dual-centre centre cabinets: the whole Artcoustic catalogue except the
  // Architect range and subwoofers — drawn from BOTH product lists, because the
  // purpose-built centre cabinets (C-1, C4-1, Multi, HSPL) live in the
  // centre/soundbar list and the LCR ranges (Q, Evolve, Spitfire) in the other.
  // Impedance is never a restriction: a low-impedance model is offered and
  // carries a wiring note instead.
  const centreOptions = useMemo(
    () => eligibleDualCentreCentreOptions([...standardLcrOptions, ...soundbarOptions]),
    [standardLcrOptions, soundbarOptions],
  );

  // The installed cabinets are the authority for the two selectors, so a reopened
  // project shows the model and the orientation it was designed with.
  const derivedCentreModel = useMemo(() => {
    if (!dualCentreStage) return '';
    const cabinet = centreCabinets(speakerSystem?.placedSpeakers)[0];
    const model = cabinet?.model;
    if (!model) return '';
    return resolveModelOption(centreOptions, model)?.label
      || (getSpeakerModelMeta(model)?.label || model);
  }, [dualCentreStage, speakerSystem?.placedSpeakers, centreOptions]);

  // The centre channel's own horizontal angle. A linked dual-centre pair is ONE
  // centre channel, and its reference position is the midpoint of the two
  // cabinets' acoustic centres — never either cabinet on its own. Read in the
  // same convention as every other aim angle (0° = straight down the room,
  // positive clockwise), so a pair flanking the screen symmetrically with the
  // listening position on the centreline reads about 0°, exactly like a
  // conventional centre speaker installed at that midpoint.
  const centreChannelAngleDeg = useMemo(() => {
    if (!dualCentreStage) return null;
    const midpoint = effectiveCentreAcousticMidpoint(centreCabinets(speakerSystem?.placedSpeakers));
    if (!midpoint) return null;
    const target = (mlpPoint
      && Number.isFinite(Number(mlpPoint.x))
      && Number.isFinite(Number(mlpPoint.y)))
      ? { x: Number(mlpPoint.x), y: Number(mlpPoint.y) }
      : null;
    if (!target) return null;
    const deg = yawDegToMLP(midpoint, target);
    return Number.isFinite(deg) ? deg : null;
  }, [dualCentreStage, speakerSystem?.placedSpeakers, mlpPoint]);

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

  // TV vertical centre — the canonical FL/FR auto-height target in center_only
  // mode. Derived from the same resolved screen geometry that draws the TV in
  // Front Elevation. NEVER depends on the centre/soundbar height.
  const tvVerticalCentreM = useMemo(
    () => clampLcrHeight(computeTvVerticalCentreM(screen, dimensions)),
    [screen, dimensions, clampLcrHeight],
  );

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

  // FL/FR manual flag (center_only mode). Default: auto (follow TV centre).
  // Legacy projects with a saved lcrLRHeightM but no explicit flag preserve
  // their saved height as manual so existing projects are not silently
  // re-steered; new projects default to auto-follow.
  const hasSavedLrHeight = Number.isFinite(Number(splConfig?.lcrLRHeightM));
  const lcrLRHeightManual = splConfig?.lcrLRHeightManual === true
    ? true
    : splConfig?.lcrLRHeightManual === false
      ? false
      : hasSavedLrHeight;

  const [lcrModel, setLcrModel] = useState(initialModel);
  const [frontStageMode, setFrontStageMode] = useState(derivedFrontStageMode);
  const [soundbarModel, setSoundbarModel] = useState(derivedSoundbarModel);
  const [centreModel, setCentreModel] = useState(derivedCentreModel);
  const [centreOrientation, setCentreOrientation] = useState(
    () => centreCabinetOrientation(speakerSystem?.placedSpeakers),
  );
  // The pair's aiming mode — part of the same dual-centre configuration as the
  // orientation, stored on the cabinets themselves.
  const [centreAimMode, setCentreAimMode] = useState(
    () => centreCabinetAimMode(speakerSystem?.placedSpeakers),
  );
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

  // While the dual-centre cabinets are installed they are the authority for the
  // centre model and the orientation; nothing is overwritten when they are not.
  useEffect(() => {
    if (!dualCentreStage) return;
    if (derivedCentreModel && derivedCentreModel !== centreModel) setCentreModel(derivedCentreModel);
    const installed = centreCabinetOrientation(speakerSystem?.placedSpeakers);
    if (installed !== centreOrientation) setCentreOrientation(installed);
    const installedAim = centreCabinetAimMode(speakerSystem?.placedSpeakers);
    if (installedAim !== centreAimMode) setCentreAimMode(installedAim);
  }, [
    dualCentreStage,
    derivedCentreModel,
    speakerSystem?.placedSpeakers,
    centreModel,
    centreOrientation,
    centreAimMode,
  ]);

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
    // FL/FR plus the dual-centre physical cabinets: the cabinets carry the ONE
    // centre channel, so they follow the same LCR acoustic-centre height.
    const rolesToUpdate = new Set(['FL', 'FC', 'FR', 'L', 'C', 'R', CENTRE_CABINET_ROLES.left, CENTRE_CABINET_ROLES.right]);
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
  // In center_only mode this effect governs ONLY the centre/FC authority —
  // it must not move FL/FR (those follow the TV centreline via the separate
  // lcrLRHeightM auto-follow effect below).
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
      if (frontStageMode === 'center_only') {
        updatePlacedFCHeight?.(target);
      } else {
        updatePlacedLcrHeight?.(target);
      }
    }
  }, [lcrHeightManual, recommendedLcrHeightM, splConfig?.lcrHeightM, clampLcrHeight, updateGlobalSpl, updatePlacedLcrHeight, updatePlacedFCHeight, frontStageMode]);

  // FL/FR auto-follow (center_only mode only):
  // - Auto (default): lock lcrLRHeightM to the TV vertical centre; update
  //   splConfig + placed FL/FR whenever the screen geometry changes.
  // - Manual: follow the saved splConfig.lcrLRHeightM; do not auto-reset.
  // This effect is completely independent from the centre authority above —
  // a manual centre override writes lcrHeightM only and never touches
  // lcrLRHeightM or FL/FR positions.
  useEffect(() => {
    if (frontStageMode !== 'center_only') return;
    if (lcrLRHeightManual) {
      const stored = Number.isFinite(Number(splConfig?.lcrLRHeightM)) ? Number(splConfig.lcrLRHeightM) : tvVerticalCentreM;
      const next = clampLcrHeight(stored);
      setLrHeightInputValue(String(Number(next.toFixed(2))));
      return;
    }
    const target = tvVerticalCentreM;
    setLrHeightInputValue(String(Number(target.toFixed(2))));
    const stored = Number(splConfig?.lcrLRHeightM);
    if (!Number.isFinite(stored) || Math.abs(stored - target) > 0.005) {
      updateGlobalSpl?.({ lcrLRHeightM: target, lcrLRHeightManual: false });
      updatePlacedLRHeight?.(target);
    }
  }, [frontStageMode, lcrLRHeightManual, tvVerticalCentreM, splConfig?.lcrLRHeightM, clampLcrHeight, updateGlobalSpl, updatePlacedLRHeight]);

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
      // In center_only mode this moves ONLY FC — FL/FR have their own authority.
      const target = recommendedLcrHeightM;
      updateGlobalSpl?.({ lcrHeightManual: false, lcrHeightM: target });
      if (frontStageMode === 'center_only') {
        updatePlacedFCHeight?.(target);
      } else {
        updatePlacedLcrHeight?.(target);
      }
      setLcrHeightInputValue(String(Number(target.toFixed(2))));
    }
  }, [lcrHeightInputValue, recommendedLcrHeightM, clampLcrHeight, updateGlobalSpl, updatePlacedLcrHeight, updatePlacedFCHeight, frontStageMode]);

  const applyFrontStage = useCallback((nextBaseModel, nextMode, nextSoundbarModel, nextCentreModel = null, nextCentreOrientation = null, nextCentreAimMode = null) => {
    buildFrontStageSeed({
      baseModelLabel: nextBaseModel,
      frontStageMode: nextMode,
      soundbarModelLabel: nextSoundbarModel,
      // Dual centre only: the ONE model both physical centre cabinets are built
      // from, the orientation they are installed in and how they are aimed
      // (null = the product's own form / straight ahead; a value already saved on
      // an installed cabinet always wins).
      centreModelLabel: nextMode === FRONT_STAGE_DUAL_CENTRE ? nextCentreModel : null,
      centreOrientation: nextMode === FRONT_STAGE_DUAL_CENTRE ? nextCentreOrientation : null,
      centreAimMode: nextMode === FRONT_STAGE_DUAL_CENTRE ? nextCentreAimMode : null,
      dimensions,
      screen,
      splConfig,
      setSpeakers,
      // Initial placement context. The canonical RSP is the published green-dot
      // position — the same authority the LCR zones and the plan view use — so
      // the speaker is placed where it will stay.
      rsp: resolveCanonicalRsp({
        roomDims: dimensions,
        mlpX_m: appState?.mlpX_m,
        mlpY_m: appState?.mlpY_m,
        fallbackMlp: mlpPoint,
      }),
      screenFrontPlaneM: appState?.screenFrontPlaneM,
      lcrAimMode,
    });
  }, [
    dimensions,
    screen,
    splConfig,
    setSpeakers,
    appState?.mlpX_m,
    appState?.mlpY_m,
    appState?.screenFrontPlaneM,
    mlpPoint,
    lcrAimMode,
  ]);

  const onChooseModel = useCallback((modelLabel) => {
    if (!standardLcrOptions.some(opt => opt.label === modelLabel)) return;
    setLcrModel(modelLabel);
    applyFrontStage(modelLabel, frontStageMode, soundbarModel, centreModel, centreOrientation, centreAimMode);
  }, [standardLcrOptions, applyFrontStage, frontStageMode, soundbarModel, centreModel, centreOrientation, centreAimMode]);

  // Dual centre — the pair's model. Both cabinets carry it; the centre channel
  // remains ONE channel.
  const onChooseCentreModel = useCallback((modelLabel) => {
    if (!centreOptions.some(opt => opt.label === modelLabel)) return;
    setCentreModel(modelLabel);
    applyFrontStage(lcrModel, FRONT_STAGE_DUAL_CENTRE, soundbarModel, modelLabel, centreOrientation, centreAimMode);
  }, [centreOptions, applyFrontStage, lcrModel, soundbarModel, centreOrientation, centreAimMode]);

  // Dual centre — horizontal or vertical. The logical centre channel is never
  // rotated: only the two cabinets' own drawn footprint.
  const onChooseCentreOrientation = useCallback((value) => {
    const next = normaliseCabinetOrientation(value);
    setCentreOrientation(next);
    if (!centreModel) return;
    applyFrontStage(lcrModel, FRONT_STAGE_DUAL_CENTRE, soundbarModel, centreModel, next, centreAimMode);
  }, [applyFrontStage, lcrModel, soundbarModel, centreModel, centreAimMode]);

  // Dual centre — how the pair is aimed. Straight ahead is the default; Aim at
  // RSP points each cabinet at the RSP from its own acoustic centre. The stored
  // positions never move: only the drawn footprint rotates about its existing
  // front-wall mounting reference.
  const onChooseCentreAimMode = useCallback((value) => {
    const next = normaliseCentreCabinetAimMode(value);
    setCentreAimMode(next);
    if (!centreModel) return;
    applyFrontStage(lcrModel, FRONT_STAGE_DUAL_CENTRE, soundbarModel, centreModel, centreOrientation, next);
  }, [applyFrontStage, lcrModel, soundbarModel, centreModel, centreOrientation]);

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
    // Anything unrecognised — an old, corrupt or future value — falls back to the
    // existing default, so a project can never open into an undefined front stage.
    const nextMode = normaliseFrontStageMode(mode);
    const nextSoundbarModel = (nextMode === FRONT_STAGE_STANDARD || nextMode === FRONT_STAGE_DUAL_CENTRE)
      ? ''
      : nextMode === 'center_only'
        ? (CENTER_ONLY_SOUNDBAR_LABELS.includes(soundbarModel) ? soundbarModel : CENTER_ONLY_SOUNDBAR_LABELS[0])
        : (INTEGRATED_LCR_SOUNDBAR_LABELS.includes(soundbarModel) ? soundbarModel : INTEGRATED_LCR_SOUNDBAR_LABELS[0]);

    // Dual centre: the two physical cabinets are the mode's record, so the mode
    // needs its centre model. The orientation starts from the product's own form
    // (the seed resolves it) and the designer's selector overrides it.
    // Dual centre opens on the SMALLEST eligible cabinet — measured from the
    // catalogue's own dimensions, never from the model name — and a model the
    // designer has explicitly selected is never replaced.
    const nextCentreModel = nextMode === FRONT_STAGE_DUAL_CENTRE
      ? (centreOptions.some(opt => opt.label === centreModel)
        ? centreModel
        : defaultDualCentreCentreModelLabel(centreOptions, screen?.tvPresetKey))
      : '';
    if (nextMode === FRONT_STAGE_DUAL_CENTRE) setCentreModel(nextCentreModel);

    // When entering center_only mode, seed L/R height from the TV vertical
    // centre (NOT the centre/soundbar height) if not yet set.
    if (nextMode === 'center_only' && !Number.isFinite(Number(splConfig?.lcrLRHeightM))) {
      const tvCentre = clampLcrHeight(tvVerticalCentreM);
      setLrHeightInputValue(String(Number(tvCentre.toFixed(2))));
      updateGlobalSpl?.({ lcrLRHeightM: tvCentre, lcrLRHeightManual: false });
    }

    setFrontStageMode(nextMode);
    setSoundbarModel(nextSoundbarModel);
    applyFrontStage(lcrModel, nextMode, nextSoundbarModel, nextCentreModel, null);
  }, [applyFrontStage, lcrModel, soundbarModel, centreModel, centreOptions, splConfig?.lcrLRHeightM, splConfig?.lcrHeightM, defaultLcrHeightM, clampLcrHeight, updateGlobalSpl, tvVerticalCentreM, screen?.tvPresetKey]);

  const onChooseSoundbarModel = useCallback((modelLabel) => {
    if (!soundbarOptions.some(opt => opt.label === modelLabel)) return;
    setSoundbarModel(modelLabel);
    const meta = getSpeakerModelMeta(modelLabel);
    const nextMode = meta?.frontStageType === 'integrated_lcr' ? 'integrated_lcr' : 'center_only';
    if (nextMode !== frontStageMode) setFrontStageMode(nextMode);
    applyFrontStage(lcrModel, nextMode, modelLabel);
  }, [soundbarOptions, applyFrontStage, lcrModel, frontStageMode]);
  
  return (
    <div className="p-2">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ── Left column: configuration and height ── */}
        <div className="space-y-3">
          {/* LCR Model + Front Stage — side by side on desktop, stack on narrow screens */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="lcr-model" className="text-[#3E4349] font-medium">LCR Model</Label>
              <Select value={lcrModel || undefined} onValueChange={(val) => { if (val === '__none__') onClearLcrModel(); else onChooseModel(val); }} disabled={disabled}>
                <SelectTrigger id="lcr-model" className="w-full h-10 px-3 py-2 bg-white border border-[#DCDBD6] rounded-md hover:border-[#213428] focus:border-[#213428] focus:ring-1 focus:ring-[#213428] focus:outline-none">
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
            </div>

            <div className="space-y-1">
              <Label htmlFor="front-stage-mode" className="text-[#3E4349] font-medium">Front Stage</Label>
              <Select value={frontStageMode} onValueChange={onChooseFrontStageMode} disabled={disabled}>
                <SelectTrigger id="front-stage-mode" className="w-full h-10 px-3 py-2 bg-white border border-[#DCDBD6] rounded-md hover:border-[#213428] focus:border-[#213428] focus:ring-1 focus:ring-[#213428] focus:outline-none">
                  <span className="text-base font-semibold" style={{ color: '#213428' }}>
                    {FRONT_STAGE_MODE_LABELS[frontStageMode] || FRONT_STAGE_MODE_LABELS[FRONT_STAGE_STANDARD]}
                  </span>
                </SelectTrigger>
                <SelectContent className="bg-white border-[#DCDBD6]">
                  {FRONT_STAGE_MODE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value} className="hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]" style={{ color: '#213428' }}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {frontStageMode !== 'standard' && frontStageMode !== FRONT_STAGE_DUAL_CENTRE && (
            <div className="space-y-1">
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

          {frontStageMode === FRONT_STAGE_DUAL_CENTRE && (
            <div className="space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="dual-centre-model" className="text-[#3E4349] font-medium">Centre Model (two cabinets)</Label>
                  <Select value={centreModel || undefined} onValueChange={onChooseCentreModel} disabled={disabled}>
                    <SelectTrigger id="dual-centre-model" className="w-full h-10 px-3 py-2 bg-white border border-[#DCDBD6] rounded-md hover:border-[#213428] focus:border-[#213428] focus:ring-1 focus:ring-[#213428] focus:outline-none">
                      <span className="text-base font-semibold" style={{ color: '#213428' }}>
                        {centreModel || 'Select centre model'}
                      </span>
                    </SelectTrigger>
                    <SelectContent className="bg-white border-[#DCDBD6]">
                      {centreOptions.map(model => (
                        <SelectItem key={model.key} value={model.label} className="hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]" style={{ color: '#213428' }}>{model.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {needsSeriesParallelWarning(centreModel) && (
                    <p className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">Wire series/parallel</p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="dual-centre-orientation" className="text-[#3E4349] font-medium">Centre Cabinet Orientation</Label>
                  <Select value={centreOrientation} onValueChange={onChooseCentreOrientation} disabled={disabled}>
                    <SelectTrigger id="dual-centre-orientation" className="w-full h-10 px-3 py-2 bg-white border border-[#DCDBD6] rounded-md hover:border-[#213428] focus:border-[#213428] focus:ring-1 focus:ring-[#213428] focus:outline-none">
                      <span className="text-base font-semibold" style={{ color: '#213428' }}>
                        {CABINET_ORIENTATION_OPTIONS.find(opt => opt.value === centreOrientation)?.label || 'Horizontal'}
                      </span>
                    </SelectTrigger>
                    <SelectContent className="bg-white border-[#DCDBD6]">
                      {CABINET_ORIENTATION_OPTIONS.map(option => (
                        <SelectItem key={option.value} value={option.value} className="hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]" style={{ color: '#213428' }}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* How the pair is aimed. Both cabinets share this ONE setting;
                    the orientation above is never changed by aiming. */}
                <div className="space-y-1">
                  <Label htmlFor="dual-centre-aim" className="text-[#3E4349] font-medium">Aiming</Label>
                  <Select value={centreAimMode} onValueChange={onChooseCentreAimMode} disabled={disabled}>
                    <SelectTrigger id="dual-centre-aim" className="w-full h-10 px-3 py-2 bg-white border border-[#DCDBD6] rounded-md hover:border-[#213428] focus:border-[#213428] focus:ring-1 focus:ring-[#213428] focus:outline-none">
                      <span className="text-base font-semibold" style={{ color: '#213428' }}>
                        {CABINET_AIM_OPTIONS.find(opt => opt.value === centreAimMode)?.label || 'Straight ahead'}
                      </span>
                    </SelectTrigger>
                    <SelectContent className="bg-white border-[#DCDBD6]">
                      {CABINET_AIM_OPTIONS.map(option => (
                        <SelectItem key={option.value} value={option.value} className="hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]" style={{ color: '#213428' }}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {/* The centre channel's angle: the linked dual-centre pair reports it
              from the effective acoustic midpoint, every other front stage
              reports the front-stage aim angle exactly as before. */}
          <p className="text-[11px] text-[#8B7F76]">
            {centreChannelAngleDeg === null
              ? <>Angle to MLP: <span className="font-medium text-[#625143]">{Math.round(lcrAngleDeg)}°</span></>
              : <>Centre Angle: <span className="font-medium text-[#625143]">{Math.round(centreChannelAngleDeg)}°</span></>}
          </p>

          {/* SPL @ RSP */}
          <div>
            <Label className="text-xs text-[#625143] mb-2 block">SPL @ RSP</Label>
            <div className="grid grid-cols-3 gap-2">
              {lcrRoles.map((role) => (
                <LcrSplCard
                  key={role}
                  role={role}
                  label={role === 'FL' ? 'Left' : role === 'FC' ? 'Center' : 'Right'}
                  allSeatSplMetrics={allSeatSplMetrics}
                  integratedLcrMode={derivedFrontStageMode === 'integrated_lcr'}
                  dualCentre={role === 'FC' && derivedFrontStageMode === FRONT_STAGE_DUAL_CENTRE}
                />
              ))}
            </div>
          </div>

          {/* Amplifier Power */}
          <div className="space-y-2">
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

          {/* RP22 P12 */}
          <div className="space-y-2">
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
            {p12Computed && (
              <RP22LabelledLevelPill
                level={p12Computed.level}
                label="RP22 P12"
              />
            )}
          </div>
        </div>

        {/* ── Right column: Acoustic Centre Height ── */}
        <div className="space-y-3">
          {/* ── Acoustic Centre Height — compact card ── */}
          <div className="rounded-lg border border-[#DCDBD6] bg-[#F8F8F7]">
            {/* Header: title left, manual override toggle right */}
            <div className="flex items-center justify-between px-4 pt-3 pb-2 gap-3">
              <div className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#625143]">Acoustic Centre Height</div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-[#625143]">Manual override</span>
                <Switch
                  checked={lcrHeightManual}
                  onCheckedChange={onToggleLcrHeightManual}
                  disabled={disabled}
                />
              </div>
            </div>
            {/* Content */}
            <div className="px-4 pb-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-[#625143]">
                  {frontStageMode === 'center_only'
                    ? 'Centre soundbar height (to middle of speaker)'
                    : frontStageMode === FRONT_STAGE_DUAL_CENTRE
                      ? 'Centre speakers height from floor (to middle of speaker)'
                      : 'LCR height from floor (to middle of speaker)'}
                </Label>
                <span className="text-[11px] text-[#625143]">
                  {lcrHeightManual ? 'Manual' : `Auto: ${formatHeightM(recommendedLcrHeightM)}`}
                </span>
              </div>
              {frontStageMode === 'center_only' ? (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-[11px] text-[#625143]">Left / Right height from floor (to middle of speaker)</Label>
                      <span className="text-[11px] text-[#625143]">
                        {lcrLRHeightManual ? 'Manual' : `Auto: ${formatHeightM(tvVerticalCentreM)}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <StepperInput
                        value={Number(lrHeightInputValue) || 0}
                        step={0.01}
                        min={0.2}
                        max={roomH - 0.2}
                        disabled={disabled}
                        onChange={(val) => {
                          const clamped = clampLcrHeight(val);
                          setLrHeightInputValue(String(Number(clamped.toFixed(2))));
                          updateGlobalSpl?.({ lcrLRHeightM: clamped, lcrLRHeightManual: true });
                          updatePlacedLRHeight(clamped);
                        }}
                      />
                      {lcrLRHeightManual && (
                        <button
                          type="button"
                          className="text-[11px] text-[#213428] underline underline-offset-2 hover:no-underline whitespace-nowrap"
                          onClick={() => {
                            const target = clampLcrHeight(tvVerticalCentreM);
                            updateGlobalSpl?.({ lcrLRHeightM: target, lcrLRHeightManual: false });
                            setLrHeightInputValue(String(Number(target.toFixed(2))));
                            updatePlacedLRHeight(target);
                          }}
                          disabled={disabled}
                        >
                          Auto
                        </button>
                      )}
                    </div>
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
              {frontStageMode !== 'center_only' && (
                <LcrAcousticCentreGuidanceCard guidance={activeHeightGuidance} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}