// BassResponse.jsx - Simplified bass simulation UI

import React, { useMemo, useEffect, useState, useRef, useCallback } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppState } from "../AppStateProvider";
import BassGraph from "@/components/room/bass/BassGraph";
import { simulateBassAtSeats } from "@/components/bass/bassSimulationEngine";
import { simulateBassResponseRewCore, simulateBassResponseRewParityField } from "@/bass/core/rewBassEngine";
import { computeRoomModesLocal } from "@/bass/core/modalCalculations.js";
import { getSubwooferCurve } from "@/components/models/speakers/registry";
import SubTuningControls from "@/components/room/bass/SubTuningControls";
import ModalResonanceLineToggles from "@/components/room/bass/ModalResonanceLineToggles";
import NullDepthAuditBadge from "@/components/room/bass/NullDepthAuditBadge";
import BassDiagnosticsPanel from "@/components/room/bass/BassDiagnosticsPanel";
import Case099RewThreeRoomBenchmark from "@/components/room/bass/Case099RewThreeRoomBenchmark";
import { applyBassSmoothing, bassSmoothingLabel } from "@/components/room/bass/bassGraphSmoothing";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

// Development flag — set to false to hide all diagnostic UI panels in production.
// Flip to true to re-enable. Do not delete diagnostic code.
const IS_DEVELOPMENT_MODE = false;

// Agreed REW parity comparison state — do not change without a new sweep.
// propagationPhaseScale 0.10 was chosen by sweep on 2026-06-13 (null centre 40.4 Hz vs REW 40.6 Hz).
const REW_PARITY_PRESET = {
  rewSourceCurveMode: 'flat_rew_reference',
  modalSourceReferenceMode: 'distance_normalized',
  modalDistanceBlend: 0.55,
  modalGainScalar: 1.0,
  axialQ: 4.0,
  propagationPhaseScale: 0,
  debugMode200Multiplier: 1.00,
  enableRewCoreReflections: true,
  rewParityFieldMode: 'full_field',
};

const REW_SOURCE_CURVES = {
  product: null,
  // Flat 94 dB source from 20–200 Hz — matches REW Room Simulator flat reference for like-for-like parity.
  flat_rew_reference: [
    { hz: 20,  db: 94 },
    { hz: 50,  db: 94 },
    { hz: 100, db: 94 },
    { hz: 200, db: 94 },
  ],
  flat90: [
    { hz: 15, db: 90 },
    { hz: 200, db: 90 },
  ],
  rew20HzPorted: [
    { hz: 15, db: 78 },
    { hz: 18, db: 84 },
    { hz: 20, db: 87 },
    { hz: 25, db: 90 },
    { hz: 40, db: 90 },
    { hz: 80, db: 90 },
    { hz: 100, db: 89 },
    { hz: 200, db: 89 },
  ],
  // __TEMP_REW_PARITY__ truly flat source across full bass range — tests room model only, no product roll-off
  flat_0_500hz_rew_parity: [
    { hz: 0,   db: 94 },
    { hz: 10,  db: 94 },
    { hz: 20,  db: 94 },
    { hz: 30,  db: 94 },
    { hz: 40,  db: 94 },
    { hz: 50,  db: 94 },
    { hz: 63,  db: 94 },
    { hz: 80,  db: 94 },
    { hz: 100, db: 94 },
    { hz: 120, db: 94 },
    { hz: 160, db: 94 },
    { hz: 200, db: 94 },
    { hz: 300, db: 94 },
    { hz: 500, db: 94 },
  ],
};

export default function BassResponse({ frontSubsCfg, rearSubsCfg, subWarnings, frontSubsLive, rearSubsLive }) {
  const { seatingPositions, roomDims, splConfig, setFrontSubsCfg, setRearSubsCfg, autosaveMeta, restoreAutosave, clearAutosave } = useAppState();
  const hasNoSeats = !Array.isArray(seatingPositions) || seatingPositions.length === 0;
  const totalSubCount = (frontSubsCfg?.count || 0) + (rearSubsCfg?.count || 0);
  const hasNoSubs = totalSubCount === 0;

  // Safe number conversion and formatting
  const toNum = (v) => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const fmtFixed = (v, digits = 1, fallback = "—") => {
    const n = toNum(v);
    return n === null ? fallback : n.toFixed(digits);
  };

  const dimsTxt = `${fmtFixed(roomDims?.widthM, 1)}×${fmtFixed(roomDims?.lengthM, 1)}×${fmtFixed(roomDims?.heightM, 1)} m`;

  // --- Seat colour palette (stable, ordered, brand-aligned) ---
  const SEAT_PALETTE = ["#213428", "#625143", "#8B7F76", "#A67C52", "#6B8A8F", "#7E8B6F"];

  // Build a stable ordered seat list so palette indices are deterministic
  const orderedSeats = useMemo(() => {
    if (!Array.isArray(seatingPositions)) return [];
    return [...seatingPositions].sort((a, b) => {
      const ra = Number(a?.row || a?.rowNumber) || 1;
      const rb = Number(b?.row || b?.rowNumber) || 1;
      if (ra !== rb) return ra - rb;
      // Use indexInRow only if both seats have a valid (non-zero) value
      const ia = Number(a?.indexInRow);
      const ib = Number(b?.indexInRow);
      const bothHaveIndex = Number.isFinite(ia) && ia > 0 && Number.isFinite(ib) && ib > 0;
      if (bothHaveIndex) return ia - ib;
      // Fall back to physical x position (left → right)
      return (Number(a?.x) || 0) - (Number(b?.x) || 0);
    });
  }, [seatingPositions]);

  const getSeatColor = (seatId) => {
    const idx = orderedSeats.findIndex(s => (s.id || `${s.x}-${s.y}`) === seatId);
    return SEAT_PALETTE[Math.max(0, idx) % SEAT_PALETTE.length];
  };

  // --- Multi-seat selection state ---
  const resolveFallbackIds = (seats) => {
    const primary = seats?.find(s => s.isPrimary);
    if (primary) return [primary.id || `${primary.x}-${primary.y}`];
    const first = seats?.[0];
    if (first) return [first.id || `${first.x}-${first.y}`];
    return [];
  };

  const [selectedSeatIds, setSelectedSeatIds] = useState(() => resolveFallbackIds(seatingPositions));

  // Keep selectedSeatIds valid when seats change
  useEffect(() => {
    const seats = Array.isArray(seatingPositions) ? seatingPositions : [];
    const allIds = new Set(seats.map(s => s.id || `${s.x}-${s.y}`));
    const still = selectedSeatIds.filter(id => allIds.has(id));
    if (still.length === 0) {
      setSelectedSeatIds(resolveFallbackIds(seats));
    } else if (still.length !== selectedSeatIds.length) {
      setSelectedSeatIds(still);
    }
  }, [seatingPositions]);

  const toggleSeat = (sid) => {
    setSelectedSeatIds(prev => {
      if (prev.includes(sid)) {
        // Don't allow deselecting the last active seat
        return prev.length === 1 ? prev : prev.filter(id => id !== sid);
      }
      return [...prev, sid];
    });
  };

  // State declarations
  const [autoAlignEnabled, setAutoAlignEnabled] = useState(true);
  const [tryPolarity, setTryPolarity] = useState(false);
  const [hasAutoAlignedFront, setHasAutoAlignedFront] = useState(false);
  const [hasAutoAlignedRear, setHasAutoAlignedRear] = useState(false);
  const [roomDamping, setRoomDamping] = useState(20);
  const [surfaceAbsorptionInputs, setSurfaceAbsorptionInputs] = useState({
    front: 0.30,
    back: 0.30,
    left: 0.30,
    right: 0.30,
    ceiling: 0.30,
    floor: 0.30,
  });
  // REW Core is the production engine — not user-controllable.
  const useRewCoreTestMode = true;
  const [enableRewCoreReflections, setEnableRewCoreReflections] = useState(false);
  const [rewSourceCurveMode, setRewSourceCurveMode] = useState(REW_PARITY_PRESET.rewSourceCurveMode);
  // Production default: 'existing' preserves the product curve's absolute SPL (pure 1m
  // reference amplitude, no listener-distance normalisation of modal excitation). The REW
  // parity preset's 'distance_normalized' value is for debug/parity comparison only — it
  // must never be the product simulator's default, since it removes absolute SPL differences
  // between subwoofer product curves.
  const [modalSourceReferenceMode, setModalSourceReferenceMode] = useState('existing');
  const [modalGainScalar, setModalGainScalar] = useState(1.0);
  const [axialQ, setAxialQ] = useState(4.0);
  const [modalStorageMode, setModalStorageMode] = useState("none");
  // Temporary REW parity experiment: default changed to 1.0 to test full acoustic propagation phase.
  // Revert to 0.5 after experiment is concluded.
  const [propagationPhaseScale, setPropagationPhaseScale] = useState(REW_PARITY_PRESET.propagationPhaseScale);
  const [disableReflectionPhaseJitter, setDisableReflectionPhaseJitter] = useState(false);
  const [disableReflectionCoherenceWeight, setDisableReflectionCoherenceWeight] = useState(false);
  const [disableLateField, setDisableLateField] = useState(true);
  const [disableModalPropagationPhase, setDisableModalPropagationPhase] = useState(true);
  const [mute68HzAxialMode, setMute68HzAxialMode] = useState(false);
  // __TEMP_DIAGNOSTIC__ debugDisableModalContribution — remove after polarity masking diagnosis
  const [debugDisableModalContribution, setDebugDisableModalContribution] = useState(false);
  // __TEMP_REW_PARITY_ISOLATION__ field mode for layered comparison
  const [rewParityFieldMode, setRewParityFieldMode] = useState('full_field'); // 'reflections_only' | 'modes_only' | 'full_field'
  // __TEMP_REW_PARITY__ adjustable modal distance blend: 0.00 = existing 1m ref, 1.00 = full distance_normalized
  const [modalDistanceBlend, setModalDistanceBlend] = useState(REW_PARITY_PRESET.modalDistanceBlend);
  const [overrideConstantAxialQ, setOverrideConstantAxialQ] = useState(false);
  const [overrideAbsorptionAxialQ, setOverrideAbsorptionAxialQ] = useState(false);
  // __TEMP_REW_PARITY_MODE_200_SCALE__
  const [debugMode200Multiplier, setDebugMode200Multiplier] = useState(1.0);
  // __TEMP_DIAGNOSTIC_MODAL_PHASE_CONVENTION__
  const [debugModalPhaseConvention, setDebugModalPhaseConvention] = useState('normal');
  // __TEMP_DIAGNOSTIC_MODAL_H_SIGN__
  const [debugModalHSign, setDebugModalHSign] = useState('normal');
  const [reflectionGainScale, setReflectionGainScale] = useState(1.0); // diagnostic: multiply imageAmplitude after reflectionCoefficient
  // __TEMP_REW_PARITY_MODAL_MAGNITUDE_SCALE__
  // Tests whether REW parity is a modal magnitude calibration issue rather than a phase issue.
  // Applied only when rewSourceCurveMode === 'flat_rew_reference'.
  const [rewParityModalMagnitudeScale, setRewParityModalMagnitudeScale] = useState(1.00);
  // __TEMP_DIAGNOSTIC_MODAL_COHERENCE__
  // Tests whether the 80–150 Hz over-prediction is caused by fully coherent modal summation.
  const [modalCoherenceMode, setModalCoherenceMode] = useState('coherent');
  // __TEMP_REW_PARITY_HIGH_ORDER_AXIAL_SCALE__
  // Diagnostic scale applied to axial modes with order >= 2. Default 1.00 = no change.
  const [highOrderAxialScale, setHighOrderAxialScale] = useState(1.0);
  const [isDraggingSub, setIsDraggingSub] = useState(false);
  // Graph scale mode: 'rew_fixed' = locked 60–120 dB / 20–300 Hz, 'auto' = dynamic
  const [graphScaleMode, setGraphScaleMode] = useState('rew_fixed');
  // Bass Response Smoothing — display-only. Does not touch simulation, modal calculations,
  // raw null-depth detection, or SPL normalisation. 'none' preserves prior graph behaviour
  // (the graph previously plotted the raw unsmoothed curve).
  const [bassSmoothingMode, setBassSmoothingMode] = useState('none');
  // Q strategy selector. Default = approved Allen & Berkley corrected model.
  const [qStrategy, setQStrategy] = useState('ab_corrected');
  // __CANDIDATE_REW_MODAL_BANDWIDTH__ — bandwidth scale for the "REW-style Modal Bandwidth"
  // experimental Q strategy. Only used when qStrategy === 'rew_modal_bandwidth'.
  const [rewModalBandwidthScale, setRewModalBandwidthScale] = useState(0.55);
  // Temporary comparison toggle for the REW-style Absorption Authority candidate — see graph controls below.
  const [overlayProduction, setOverlayProduction] = useState(false);

  // Modal Resonance Line Toggles — display-only, session-only state. Does not affect
  // bass calculation, SPL response, or mode generation; only filters which resonance
  // ReferenceLines are drawn on the graph.
  const [modalLineToggles, setModalLineToggles] = useState({
    axialLength: true,
    axialWidth: true,
    axialHeight: true,
    tangentialLW: true,
    tangentialLH: true,
    tangentialWH: true,
    oblique: true,
  });
  const toggleModalLine = (key) => setModalLineToggles(prev => ({ ...prev, [key]: !prev[key] }));
  const setAllModalLines = (value) => setModalLineToggles({
    axialLength: value, axialWidth: value, axialHeight: value,
    tangentialLW: value, tangentialLH: value, tangentialWH: value, oblique: value,
  });
  // Active test engine — set by RewRefinedEngineShootout promote button via window.__B44_ACTIVE_TEST_ENGINE__
  const [activeTestEngine, setActiveTestEngine] = useState(null);
  const lastStablePlotRef = useRef(null);
  // REW reference overlay — debug only, no engine changes
  const [rewOverlayText, setRewOverlayText] = useState('');
  const [showRewOverlay, setShowRewOverlay] = useState(true);
  const [normalizeRewOverlay, setNormalizeRewOverlay] = useState(false);

  // REW parity preset helpers — no engine changes
  const resetToParityPreset = () => {
    setRewSourceCurveMode(REW_PARITY_PRESET.rewSourceCurveMode);
    setModalSourceReferenceMode(REW_PARITY_PRESET.modalSourceReferenceMode);
    setModalDistanceBlend(REW_PARITY_PRESET.modalDistanceBlend);
    setModalGainScalar(REW_PARITY_PRESET.modalGainScalar);
    setAxialQ(REW_PARITY_PRESET.axialQ);
    setPropagationPhaseScale(REW_PARITY_PRESET.propagationPhaseScale);
    setDebugMode200Multiplier(REW_PARITY_PRESET.debugMode200Multiplier);
    setEnableRewCoreReflections(REW_PARITY_PRESET.enableRewCoreReflections);
    setRewParityFieldMode(REW_PARITY_PRESET.rewParityFieldMode);
  };
  const isParityPresetActive =
    rewSourceCurveMode === REW_PARITY_PRESET.rewSourceCurveMode &&
    modalSourceReferenceMode === REW_PARITY_PRESET.modalSourceReferenceMode &&
    modalDistanceBlend === REW_PARITY_PRESET.modalDistanceBlend &&
    modalGainScalar === REW_PARITY_PRESET.modalGainScalar &&
    axialQ === REW_PARITY_PRESET.axialQ &&
    propagationPhaseScale === REW_PARITY_PRESET.propagationPhaseScale &&
    debugMode200Multiplier === REW_PARITY_PRESET.debugMode200Multiplier &&
    enableRewCoreReflections === REW_PARITY_PRESET.enableRewCoreReflections &&
    rewParityFieldMode === REW_PARITY_PRESET.rewParityFieldMode;

  // Auto-align loop guards
  const frontCfgRef = React.useRef(null);
  const rearCfgRef = React.useRef(null);
  const roomDimsRef = React.useRef(null);
  const seatingRef = React.useRef(null);
  const lastAutoAlignApplySigRef = React.useRef({ Front: null, Rear: null });
  const lastAutoAlignTriggerSigRef = React.useRef(null);

  const __b44SafeSig = (v) => {
    try { return JSON.stringify(v); } catch (e) { return String(v); }
  };

  const __b44SettingsSig = (settingsById, ids) => {
    const obj = {};
    (ids || []).forEach((id) => {
      const s = settingsById?.[id] || {};
      obj[id] = {
        gainDb: Number.isFinite(s.gainDb) ? Math.round(s.gainDb * 10) / 10 : 0,
        delayMs: Number.isFinite(s.delayMs) ? Math.round(s.delayMs * 1000) / 1000 : 0,
        polarity: s.polarity || "normal",
      };
    });
    return __b44SafeSig(obj);
  };

  // __TEMP_DIAGNOSTIC__ tuning signature — force memo invalidation on any gain/polarity/delay change
  const subTuningSignature = useMemo(() => {
    const buildSig = (settingsById) => {
      if (!settingsById) return '{}';
      return JSON.stringify(
        Object.keys(settingsById).sort().map(id => {
          const s = settingsById[id];
          return `${id}:g${Number.isFinite(s.gainDb) ? s.gainDb.toFixed(1) : 0}:p${s.polarity || 'normal'}:d${Number.isFinite(s.delayMs) ? s.delayMs.toFixed(3) : 0}`;
        })
      );
    };
    return `F[${buildSig(frontSubsCfg?.settingsById)}]R[${buildSig(rearSubsCfg?.settingsById)}]`;
  }, [frontSubsCfg?.settingsById, rearSubsCfg?.settingsById]);

  // Six-surface absorption object fed directly to the REW Core engine
  const surfaceAbsorption = {
    front:   Math.max(0, Math.min(0.95, Number(surfaceAbsorptionInputs.front)   || 0.30)),
    back:    Math.max(0, Math.min(0.95, Number(surfaceAbsorptionInputs.back)    || 0.30)),
    left:    Math.max(0, Math.min(0.95, Number(surfaceAbsorptionInputs.left)    || 0.30)),
    right:   Math.max(0, Math.min(0.95, Number(surfaceAbsorptionInputs.right)   || 0.30)),
    ceiling: Math.max(0, Math.min(0.95, Number(surfaceAbsorptionInputs.ceiling) || 0.30)),
    floor:   Math.max(0, Math.min(0.95, Number(surfaceAbsorptionInputs.floor)   || 0.30)),
  };

  // Keep refs current
  React.useEffect(() => { frontCfgRef.current = frontSubsCfg; }, [frontSubsCfg]);
  React.useEffect(() => { rearCfgRef.current = rearSubsCfg; }, [rearSubsCfg]);
  React.useEffect(() => { roomDimsRef.current = roomDims; }, [roomDims]);
  React.useEffect(() => { seatingRef.current = seatingPositions; }, [seatingPositions]);

  // Derive auto-alignment delays from geometry — runtime only, never written to config
  const autoAlignDelays = useMemo(() => {
    if (!autoAlignEnabled) return {};
    const mlpSeat = seatingPositions?.find(s => s.isPrimary) || seatingPositions?.[0];
    if (!mlpSeat) return {};

    const mlpPoint = { x: mlpSeat.x, y: mlpSeat.y, z: mlpSeat.z ?? 1.2 };
    const SPEED_OF_SOUND = 343;
    const POSITION_LABELS = ['left', 'right'];
    const allSubData = [];

    const processGroup = (cfg, liveSubs, group) => {
      // Primary source: live sub positions from the visualiser (same as subsForSimulation uses)
      const live = Array.isArray(liveSubs) ? liveSubs : [];
      // Fallback: cfg positions if live array is empty
      const cfgPositions = Array.isArray(cfg?.positions) ? cfg.positions : [];
      const count = live.length > 0 ? live.length : (cfg?.count || cfgPositions.length || 0);
      if (count === 0) return;

      for (let i = 0; i < count; i++) {
        // Use the canonical sub ID — matching exactly what subsForSimulation produces
        const subId = `${group}-sub-${POSITION_LABELS[i] ?? i}`;

        // Position: live first, then cfg fallback
        const liveEntry = live[i];
        const livePos = liveEntry?.position ?? liveEntry;
        const cfgPos = cfgPositions[i];
        const pos = (liveEntry && Number.isFinite(Number(livePos?.x))) ? livePos : cfgPos;
        if (!pos) continue;

        const x = Number(pos.x);
        const y = Number(pos.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

        const z = Number.isFinite(Number(pos.z)) ? Number(pos.z) : 0.35;
        const dx = x - mlpPoint.x;
        const dy = y - mlpPoint.y;
        const dz = z - mlpPoint.z;
        const distanceM = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const arrivalMs = (distanceM / SPEED_OF_SOUND) * 1000;
        allSubData.push({ subId, arrivalMs });
      }
    };

    processGroup(frontSubsCfg, frontSubsLive, 'front');
    processGroup(rearSubsCfg, rearSubsLive, 'rear');

    if (allSubData.length === 0) return {};

    const maxArrivalMs = Math.max(...allSubData.map(s => s.arrivalMs));
    const delays = {};
    allSubData.forEach(({ subId, arrivalMs }) => {
      delays[subId] = Math.max(0, maxArrivalMs - arrivalMs);
    });
    return delays;
  }, [autoAlignEnabled, seatingPositions, frontSubsLive, rearSubsLive, frontSubsCfg?.count, frontSubsCfg?.positions, rearSubsCfg?.count, rearSubsCfg?.positions, roomDims?.widthM, roomDims?.lengthM]);

  // Helper: resolve auto-align delay for a sub regardless of ID naming convention.
  // autoAlignDelays is keyed by canonical IDs (front-sub-left, rear-sub-left, etc.)
  // but live sub objects may carry alternate IDs (sub-front-1, sub-rear-1, etc.).
  const resolveAutoDelayForSub = (subId, group, index) => {
    const POSITION_LABELS = ['left', 'right'];
    // 1. Direct lookup
    if (autoAlignDelays[subId] != null) return autoAlignDelays[subId];
    // 2. Canonical form: front-sub-left / rear-sub-right
    const canonicalId = `${group}-sub-${POSITION_LABELS[index] ?? index}`;
    if (autoAlignDelays[canonicalId] != null) return autoAlignDelays[canonicalId];
    // 3. Alternate live naming: sub-front-1 / sub-rear-2
    const altId = `sub-${group}-${index + 1}`;
    if (autoAlignDelays[altId] != null) return autoAlignDelays[altId];
    return 0;
  };

  // Build subs array for simulation
  const subsForSimulation = useMemo(() => {
    const liveFront = Array.isArray(frontSubsLive) ? frontSubsLive : [];
    const liveRear = Array.isArray(rearSubsLive) ? rearSubsLive : [];

    const getTuning = (subId, cfg) => {
      // __TEMP_DIAGNOSTIC__ fallback: if exact subId key not found, use the only key present
      const settingsById = cfg?.settingsById || {};
      let settings = settingsById[subId];
      let lookupKeyUsed = subId;
      if (!settings) {
        const keys = Object.keys(settingsById);
        if (keys.length === 1) {
          settings = settingsById[keys[0]];
          lookupKeyUsed = keys[0];
        }
      }
      settings = settings || {};
      // Expose lookup key for debug readout
      getTuning.__lastLookup = getTuning.__lastLookup || {};
      getTuning.__lastLookup[subId] = { keyUsed: lookupKeyUsed, gainDb: settings.gainDb ?? 0 };

      const manualDelayMs = Number.isFinite(settings.delayMs) ? settings.delayMs : 0;
      // Use helper to resolve auto delay across both canonical and alternate ID formats
      const group = subId?.includes('front') || subId?.includes('sub-front') ? 'front' : 'rear';
      const index = subId?.includes('-right') || subId?.includes('-2') ? 1 : 0;
      const autoDelayMs = resolveAutoDelayForSub(subId, group, index);
      return {
        gainDb: Number.isFinite(settings.gainDb) ? settings.gainDb : 0,
        delayMs: manualDelayMs + autoDelayMs,
        polarity: settings.polarity === 'invert' ? 180 : 0,
      };
    };
    getTuning.__lastLookup = {};

    const toSource = (s, group, idx, cfg) => {
      const p = s?.position ?? s;
      const x = Number(p?.x);
      const y = Number(p?.y);
      const z = p?.z;

      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

      const POSITION_LABELS = ['left', 'right'];
      const subId = s?.id ?? `${group}-sub-${POSITION_LABELS[idx] ?? idx}`;
      const tuning = getTuning(subId, cfg);

      return {
        id: subId,
        modelKey: s?.model ?? "SUB2-12",
        x, y,
        z: Number.isFinite(Number(z)) ? Number(z) : 0.35,
        tuning,
      };
    };

    const sources = [
      ...liveFront.map((s, i) => toSource(s, "front", i, frontSubsCfg)),
      ...liveRear.map((s, i) => toSource(s, "rear", i, rearSubsCfg)),
    ].filter(Boolean);

    return sources;
  }, [frontSubsLive, rearSubsLive, frontSubsCfg?.settingsById, rearSubsCfg?.settingsById, autoAlignDelays, subTuningSignature]);

  // Run bass simulation engine — parameterized by qStrategy so the exact same engine call
  // can be re-run with a different Q strategy for the temporary overlay comparison below,
  // without any duplicated simulation or plotting logic (one engine, one renderer).
  const runSimulation = useCallback((qStrategyOverride) => {
    if (hasNoSeats || hasNoSubs || !roomDims?.widthM || !roomDims?.lengthM || !roomDims?.heightM) {
      return { seatResponses: {}, metrics: null, audit: null };
    }

    if (!useRewCoreTestMode) {
      return simulateBassAtSeats({
        roomDims: {
          widthM: roomDims.widthM,
          lengthM: roomDims.lengthM,
          heightM: roomDims.heightM
        },
        seats: seatingPositions,
        subs: subsForSimulation,
        splConfig: {
          globalPowerW: splConfig?.globalPowerW ?? 100,
          globalEqHeadroomDb: splConfig?.globalEqHeadroomDb ?? 0,
          radiationMode: splConfig?.radiationMode ?? 'half-space',
          modesEnabled: true,
          roomDamping,
          sbirEnabled: true
        },
        options: {}
      });
    }

    const seatResponses = {};
    // Step debug: follow the first selected seat + first sub (matches the visible graph).
    // Use ID-based matching (not reference equality) so it is robust to seat list re-creation.
    let __b44StepDebugCapture = null;
    let __b44WholeCurveDebugCapture = null;
    let __b44ActiveModalVectorPath = null;
    const debugSeatId = selectedSeatIds[0] || null;
    const debugSubForCapture = subsForSimulation[0] || null;

    seatingPositions.forEach((seat) => {
      const seatId = seat.id || `${seat.x}-${seat.y}`;
      let sumRe = null;
      let sumIm = null;
      let freqsHz = null;

      subsForSimulation.forEach((sub) => {
        const subCurve = getSubwooferCurve(sub.modelKey);
        if (!subCurve || subCurve.length === 0) return;
        const diagnosticSourceCurve = REW_SOURCE_CURVES[rewSourceCurveMode] || subCurve;

        // __TEMP_REW_PARITY_ISOLATION__ resolve per-field-mode overrides
        // When source = flat_rew_reference AND field mode = full_field, force direct + modal only
        // (no image-source reflections, no late field) to match REW Room Simulator parity test.
        const _isParityFullField =
          rewSourceCurveMode === 'flat_rew_reference' && rewParityFieldMode === 'full_field';
        const _effectiveFieldMode = rewParityFieldMode;

        // REW parity isolation: flat_rew_reference + full_field → direct + modes only, no reflections, no late field
        // __CANDIDATE_AB_CORRECTED_MODAL__ — the A&B strategy must match Case 071's validated
        // engine options (enableReflections: true), bypassing this legacy parity-isolation gate.
        const _fieldReflections = qStrategyOverride === 'ab_corrected' ? true
          : _isParityFullField ? false
          : _effectiveFieldMode === 'modes_only' || _effectiveFieldMode === 'direct_plus_modes' ? false
          : _effectiveFieldMode === 'reflections_only' ? true
          : enableRewCoreReflections;
        const _fieldModes = _isParityFullField ? true
          : _effectiveFieldMode === 'reflections_only' ? false
          : _effectiveFieldMode === 'modes_only' || _effectiveFieldMode === 'direct_plus_modes' ? true
          : true;
        const _fieldLateField = _isParityFullField ? true // disableLateField=true
          : (_effectiveFieldMode === 'reflections_only' || _effectiveFieldMode === 'modes_only' || _effectiveFieldMode === 'direct_plus_modes')
          ? true
          : disableLateField;

        // __TEMP_REW_PARITY__ adjustable modal distance blend
        // blend=0.00 → existing 1m reference (no attenuation applied)
        // blend=1.00 → full distance-normalized (pass through to engine as distance_normalized)
        // blend=0.xx → fractional dB attenuation applied in BassResponse, engine receives 'existing'
        const _seatZ = Number.isFinite(Number(seat.z)) ? Number(seat.z) : 1.2;
        let _engineModalRefMode = modalSourceReferenceMode;
        let _engineModalGainScalar = modalGainScalar;
        if (modalSourceReferenceMode === 'distance_blend') {
          const _blend = Math.max(0, Math.min(1, modalDistanceBlend));
          if (_blend >= 1.0) {
            // Full distance_normalized — let the engine handle it
            _engineModalRefMode = 'distance_normalized';
          } else if (_blend <= 0.0) {
            // No attenuation — existing 1m reference
            _engineModalRefMode = 'existing';
          } else {
            // Partial: apply blend fraction of the full distance dB loss as a gain scalar
            const _dx = sub.x - seat.x;
            const _dy = sub.y - seat.y;
            const _dz = sub.z - _seatZ;
            const _distM = Math.max(0.01, Math.sqrt(_dx * _dx + _dy * _dy + _dz * _dz));
            // Full distance loss in dB: -20*log10(d/1m). Apply blend fraction.
            const _fullDistanceLossDb = -20 * Math.log10(_distM / 1);
            const _blendedLossDb = _fullDistanceLossDb * _blend;
            _engineModalGainScalar = modalGainScalar * Math.pow(10, _blendedLossDb / 20);
            _engineModalRefMode = 'existing';
          }
        }

        // __TEMP_DIAGNOSTIC_REW_PARITY_FIELD__
        // Route to the dedicated REW-style modal-only Green's function solver when the
        // parity preset is fully active (flat_rew_reference source). This bypasses the
        // legacy decomposed superposition path entirely for direct comparison.
        // Production/product mode is unaffected — this only fires for the REW parity preset.
        const _useParityFieldSolver = false;

        // Pass the user-selected modal source reference mode through directly.
        // No forced override for flat_rew_reference — allows proper comparison of all modes.
        const _finalModalRefMode = _engineModalRefMode;

        const rewResult = _useParityFieldSolver
          ? simulateBassResponseRewParityField(
              {
                widthM: roomDims.widthM,
                lengthM: roomDims.lengthM,
                heightM: roomDims.heightM,
              },
              {
                x: seat.x,
                y: seat.y,
                z: _seatZ,
              },
              sub,
              diagnosticSourceCurve,
              {
                surfaceAbsorption,
                freqMinHz: 20,
                freqMaxHz: 200,
                axialQ,
              }
            )
          : simulateBassResponseRewCore(
          {
            widthM: roomDims.widthM,
            lengthM: roomDims.lengthM,
            heightM: roomDims.heightM,
          },
          {
            x: seat.x,
            y: seat.y,
            z: _seatZ,
          },
          sub,
          diagnosticSourceCurve,
          {
            enableReflections: _fieldReflections,
            enableModes: _fieldModes,
            surfaceAbsorption,
            freqMinHz: 20,
            freqMaxHz: 200,
            smoothing: 'none',
            modalSourceReferenceMode: _finalModalRefMode,
            modalGainScalar: _engineModalGainScalar,
            axialQ,
            modalStorageMode,
            propagationPhaseScale, // Uses state value (default 0.10 for REW parity)
            pureDeterministicModalSum: rewSourceCurveMode === 'flat_rew_reference', // forced true for REW parity preset only
            disableReflectionPhaseJitter,
            disableReflectionCoherenceWeight,
            disableLateField: _fieldLateField,
            disableModalPropagationPhase: rewSourceCurveMode === 'flat_rew_reference' ? true : disableModalPropagationPhase,
            debugInvertModalVector: false, // __TEMP_DIAGNOSTIC_INVERT_MODAL_VECTOR__ (legacy — use debugModalPhaseConvention)
            debugModalPhaseConvention: 'normal', // __TEMP_DIAGNOSTIC_MODAL_PHASE_CONVENTION__
            mute68HzAxialMode,
            debugDisableModalContribution, // __TEMP_DIAGNOSTIC__ — remove after polarity masking diagnosis
            overrideConstantAxialQ, // __TEMP_REW_PARITY_CONSTANT_AXIAL_Q__
            overrideAbsorptionAxialQ, // __TEMP_REW_PARITY_ABSORPTION_AXIAL_Q__
            debugMode200Multiplier, // __TEMP_REW_PARITY_MODE_200_SCALE__
            debugReflectionOrder: (rewSourceCurveMode === 'flat_rew_reference' || qStrategyOverride === 'ab_corrected') ? 1 : 3, // __TEMP_DIAGNOSTIC_REFLECTION_ORDER__ force order-1 for REW parity preset and ab_corrected
            reflectionGainScale, // diagnostic: scale imageAmplitude after reflectionCoefficient
            debugModalHSign: 'normal', // __TEMP_DIAGNOSTIC_MODAL_H_SIGN__
            rewParityModalMagnitudeScale: rewSourceCurveMode === 'flat_rew_reference' ? rewParityModalMagnitudeScale : 1.0, // __TEMP_REW_PARITY_MODAL_MAGNITUDE_SCALE__
            modalCoherenceMode, // __TEMP_DIAGNOSTIC_MODAL_COHERENCE__
            highOrderAxialScale, // __TEMP_REW_PARITY_HIGH_ORDER_AXIAL_SCALE__
            qStrategy: qStrategyOverride, // __CANDIDATE_FREQ_DEP_Q__
            rewModalBandwidthScale, // __CANDIDATE_REW_MODAL_BANDWIDTH__
            }
        );

        // Capture step debug for the first selected seat (by ID) + first sub only.
        // ID-based match ensures we always capture the currently selected pill's seat.
        if (
          __b44StepDebugCapture === null &&
          debugSeatId && seatId === debugSeatId &&
          sub === debugSubForCapture &&
          rewResult.stepDebug?.length > 0
        ) {
          __b44StepDebugCapture = rewResult.stepDebug;
          __b44WholeCurveDebugCapture = rewResult.wholeCurveDebugRows;
          __b44ActiveModalVectorPath = rewResult.activeModalVectorPath ?? null;
          if (__b44WholeCurveDebugCapture) {
            __b44WholeCurveDebugCapture.preModalSeries = rewResult.preModalSeries;
            __b44WholeCurveDebugCapture.modalOnlySeries = rewResult.modalOnlySeries;
            __b44WholeCurveDebugCapture.postModalSeries = rewResult.postModalSeries;
          }
        }

        if (!freqsHz) {
          freqsHz = rewResult.freqsHz;
          sumRe = rewResult.complexPressure.map(cp => cp.re);
          sumIm = rewResult.complexPressure.map(cp => cp.im);
        } else {
          rewResult.complexPressure.forEach((cp, index) => {
            if (Number.isFinite(cp.re) && Number.isFinite(cp.im)) {
              sumRe[index] += cp.re;
              sumIm[index] += cp.im;
            }
          });
        }
      });

      if (freqsHz && sumRe && sumIm) {
        seatResponses[seatId] = {
          freqsHz,
          splDb: sumRe.map((re, index) => {
            const im = sumIm[index];
            const magnitude = Math.sqrt(re * re + im * im);
            return 20 * Math.log10(Math.max(magnitude, 1e-10));
          }),
          nulls: { count: 0, worstDb: 0, nulls: [] },
        };
      }
    });

    return {
      seatResponses,
      metrics: null,
      audit: null,
      stepDebug: __b44StepDebugCapture, // __B44_STEP_DEBUG__ temporary — remove after diagnosis
      wholeCurveDebugRows: __b44WholeCurveDebugCapture,
      activeModalVectorPath: __b44ActiveModalVectorPath,
    };
  }, [roomDims?.widthM, roomDims?.lengthM, roomDims?.heightM, seatingPositions, subsForSimulation, splConfig, roomDamping, hasNoSeats, hasNoSubs, useRewCoreTestMode, enableRewCoreReflections, rewSourceCurveMode, modalSourceReferenceMode, modalGainScalar, modalDistanceBlend, axialQ, modalStorageMode, propagationPhaseScale, disableReflectionPhaseJitter, disableReflectionCoherenceWeight, disableLateField, disableModalPropagationPhase, mute68HzAxialMode, surfaceAbsorptionInputs, selectedSeatIds, debugDisableModalContribution, subTuningSignature, rewParityFieldMode, overrideConstantAxialQ, overrideAbsorptionAxialQ, debugMode200Multiplier, debugModalPhaseConvention, reflectionGainScale, debugModalHSign, rewParityModalMagnitudeScale, modalCoherenceMode, highOrderAxialScale, rewModalBandwidthScale]);

  const simulationResults = useMemo(() => runSimulation(qStrategy), [runSimulation, qStrategy]);
  // Temporary overlay: re-runs the identical engine with qStrategy forced to 'production',
  // for the "Overlay Production" comparison toggle only. No second engine, no duplicated logic.
  const overlayProductionResults = useMemo(
    () => (overlayProduction ? runSimulation('production') : null),
    [runSimulation, overlayProduction]
  );

  // Build one clean series per selected seat
  const multiSeries = useMemo(() => {
    const responses = simulationResults.seatResponses;
    const activeIds = selectedSeatIds.filter(id => responses[id]);

    const series = activeIds.map(sid => {
      const response = responses[sid];
      if (!response?.freqsHz || !response?.splDb) return null;

      const raw = response.freqsHz
        .map((frequency, i) => ({
          frequency,
          spl: Number.isFinite(response.splDb[i]) ? response.splDb[i] : null,
        }))
        .filter(p => Number.isFinite(p.frequency) && p.frequency > 0);

      const sorted = [...raw].sort((a, b) => a.frequency - b.frequency);
      const deduped = [];
      for (let i = 0; i < sorted.length; i++) {
        const curr = sorted[i];
        const next = sorted[i + 1];
        if (next && Math.abs(curr.frequency - next.frequency) < 1e-9) continue;
        deduped.push(curr);
      }

      return { id: sid, color: getSeatColor(sid), data: deduped };
    }).filter(Boolean);

    if (!isDraggingSub && series.length > 0 && series[0].data.length > 0) {
      lastStablePlotRef.current = series[0].data;
    }

    return series;
  }, [selectedSeatIds, simulationResults.seatResponses, orderedSeats, isDraggingSub, subTuningSignature]);

  // Parse pasted REW CSV into a series object
  const rewOverlaySeries = useMemo(() => {
    if (!rewOverlayText?.trim()) return null;
    const lines = rewOverlayText.trim().split(/[\r\n]+/);
    const pts = [];
    for (const line of lines) {
      const parts = line.split(/[,\t ]+/);
      const hz = parseFloat(parts[0]);
      const db = parseFloat(parts[1]);
      if (Number.isFinite(hz) && Number.isFinite(db) && hz > 0) pts.push({ frequency: hz, spl: db });
    }
    if (pts.length < 2) return null;
    const sorted = [...pts].sort((a, b) => a.frequency - b.frequency);
    if (normalizeRewOverlay) {
      const ref80 = sorted.reduce((best, pt) => Math.abs(pt.frequency - 80) < Math.abs(best.frequency - 80) ? pt : best, sorted[0]);
      const b44ref80 = (() => {
        const s = multiSeries[0]?.data;
        if (!s) return null;
        return s.reduce((best, pt) => Math.abs(pt.frequency - 80) < Math.abs(best.frequency - 80) ? pt : best, s[0]);
      })();
      const offset = b44ref80 ? (b44ref80.spl - ref80.spl) : 0;
      return { id: 'rew-overlay', color: '#f97316', label: 'REW', data: sorted.map(pt => ({ ...pt, spl: pt.spl + offset })) };
    }
    return { id: 'rew-overlay', color: '#f97316', label: 'REW', data: sorted };
  }, [rewOverlayText, normalizeRewOverlay, multiSeries]);

  // Temporary overlay series: the identical Production run (qStrategy forced to 'production'),
  // for the primary selected seat only — grey, for direct visual comparison against the
  // currently-selected Q strategy curve. No second engine or plotting path is introduced.
  const overlayProductionSeries = useMemo(() => {
    if (!overlayProduction || !overlayProductionResults) return null;
    const sid = selectedSeatIds[0];
    const response = overlayProductionResults.seatResponses?.[sid];
    if (!response?.freqsHz || !response?.splDb) return null;
    const data = response.freqsHz
      .map((frequency, i) => ({ frequency, spl: Number.isFinite(response.splDb[i]) ? response.splDb[i] : null }))
      .filter(p => Number.isFinite(p.frequency) && p.frequency > 0);
    return { id: 'overlay-production', color: '#9CA3AF', label: 'Production', data };
  }, [overlayProduction, overlayProductionResults, selectedSeatIds]);

  const multiSeriesForGraph = useMemo(() => {
    // When overlaying, highlight the active REW-style Absorption Authority curve in green
    // so it's clearly distinguishable from the grey Production overlay curve.
    let out = (overlayProduction && qStrategy === 'rew_absorption_authority')
      ? multiSeries.map((s, i) => (i === 0 ? { ...s, color: '#16a34a' } : s))
      : multiSeries;
    if (overlayProductionSeries) out = [...out, overlayProductionSeries];
    // Apply the selected display smoothing to calculated curves only (not the pasted REW overlay).
    out = out.map((s) => ({ ...s, data: applyBassSmoothing(s.data, bassSmoothingMode) }));
    if (showRewOverlay && rewOverlaySeries) out = [...out, rewOverlaySeries];
    return out;
  }, [multiSeries, rewOverlaySeries, showRewOverlay, overlayProduction, overlayProductionSeries, qStrategy, bassSmoothingMode]);

  // __TEMP_CASE077_VERIFICATION__ — live inputs for the Case072/077 audit panel.
  // Passes the exact same room/seat/sub/absorption/source-curve that feed the visible Bass
  // Response graph, plus the raw seat response (B, pre-smoothing) and plotted series (C).
  const auditPanelInputs = useMemo(() => {
    if (qStrategy !== 'ab_corrected') return null;
    const sid = selectedSeatIds[0];
    const seat = seatingPositions?.find(s => (s.id || `${s.x}-${s.y}`) === sid) || null;
    const subs = Array.isArray(subsForSimulation) ? subsForSimulation : [];
    const firstSub = subs[0] || null;
    const subCurve = firstSub ? getSubwooferCurve(firstSub.modelKey) : null;
    const sourceCurve = REW_SOURCE_CURVES[rewSourceCurveMode] || subCurve;
    const rawSeatResponse = simulationResults?.seatResponses?.[sid] || null;
    const graphData = multiSeriesForGraph[0]?.data || null;
    return { roomDims, seat, subs, surfaceAbsorption, sourceCurve, qStrategy, graphData, rawSeatResponse };
  }, [qStrategy, selectedSeatIds, seatingPositions, subsForSimulation, rewSourceCurveMode, roomDims, surfaceAbsorption, simulationResults, multiSeriesForGraph]);

  // Keep a single-seat "selectedSeat" reference for the graph title + per-seat detail cards
  const primarySelectedSeat = useMemo(() => {
    const responses = simulationResults.seatResponses;
    const sid = selectedSeatIds[0];
    if (sid && responses[sid]) {
      const seatMeta = seatingPositions?.find(s => (s.id || `${s.x}-${s.y}`) === sid);
      return { id: sid, isPrimary: !!seatMeta?.isPrimary };
    }
    return null;
  }, [selectedSeatIds, seatingPositions, simulationResults.seatResponses]);

  // Modal Resonance Line Toggles — display-only mode frequency generation for the graph's
  // vertical resonance ReferenceLines. Uses the same pure computeRoomModesLocal used by the
  // production engine (read-only), but this output is never fed back into any SPL calculation.
  const roomModesForDisplay = useMemo(() => {
    if (!roomDims?.widthM || !roomDims?.lengthM || !roomDims?.heightM) return [];
    return computeRoomModesLocal({ widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM, fMax: 200 });
  }, [roomDims?.widthM, roomDims?.lengthM, roomDims?.heightM]);

  const modeMarkersForGraph = useMemo(() => {
    const axial = [];
    const tangential = [];
    const oblique = [];
    roomModesForDisplay.forEach((mode) => {
      const activeAxes = (mode.nx > 0 ? 1 : 0) + (mode.ny > 0 ? 1 : 0) + (mode.nz > 0 ? 1 : 0);
      const n = [mode.nx, mode.ny, mode.nz];
      if (activeAxes === 1) {
        if (mode.ny > 0 && modalLineToggles.axialLength) axial.push({ fHz: mode.freq, n, axisLabel: 'Length' });
        else if (mode.nx > 0 && modalLineToggles.axialWidth) axial.push({ fHz: mode.freq, n, axisLabel: 'Width' });
        else if (mode.nz > 0 && modalLineToggles.axialHeight) axial.push({ fHz: mode.freq, n, axisLabel: 'Height' });
      } else if (activeAxes === 2) {
        if (mode.nx > 0 && mode.ny > 0 && modalLineToggles.tangentialLW) tangential.push({ fHz: mode.freq, n });
        else if (mode.nx > 0 && mode.nz > 0 && modalLineToggles.tangentialWH) tangential.push({ fHz: mode.freq, n });
        else if (mode.ny > 0 && mode.nz > 0 && modalLineToggles.tangentialLH) tangential.push({ fHz: mode.freq, n });
      } else if (activeAxes === 3 && modalLineToggles.oblique) {
        oblique.push({ fHz: mode.freq, n });
      }
    });
    return { axial, tangential, oblique };
  }, [roomModesForDisplay, modalLineToggles]);

  // Schroeder frequency
  const schroederFrequency = React.useMemo(() => {
    const w = roomDims?.widthM ?? 0;
    const l = roomDims?.lengthM ?? 0;
    const h = roomDims?.heightM ?? 0;
    if (!(w > 0 && l > 0 && h > 0)) return 0;
    const volume = w * l * h;
    const rt60 = 0.4;
    return 2000 * Math.sqrt(rt60 / volume);
  }, [roomDims?.widthM, roomDims?.lengthM, roomDims?.heightM]);

  const rp22Levels = React.useMemo(() => ([
    { level: "L1", spl: 114, color: "#C1B6AD" },
    { level: "L2", spl: 117, color: "#8B7F76" },
    { level: "L3", spl: 120, color: "#625143" },
    { level: "L4", spl: 123, color: "#213428" },
  ]), []);

  // Compute geometric distances
  const subDistances = useMemo(() => {
    const mlpSeat = seatingPositions?.find(s => s.isPrimary);
    if (!mlpSeat) return {};
    
    const mlpPoint = { x: mlpSeat.x, y: mlpSeat.y, z: mlpSeat.z ?? 1.2 };
    const SPEED_OF_SOUND = 343;
    const distances = {};
    
    const frontCount = frontSubsCfg?.count || 0;
    const frontPositions = frontSubsCfg?.positions || [];
    if (frontCount > 0) {
      const roomWidth = roomDims?.widthM || 4.5;
      const defaultFrontPos = [
        { x: roomWidth * 0.33, y: 0.15 },
        { x: roomWidth * 0.67, y: 0.15 }
      ];
      const frontIds = frontCount === 1 ? ['front-sub-left'] : ['front-sub-left', 'front-sub-right'];
      frontIds.forEach((id, i) => {
        const pos = frontPositions[i] || defaultFrontPos[i];
        const dx = pos.x - mlpPoint.x;
        const dy = pos.y - mlpPoint.y;
        const dz = 0.35 - mlpPoint.z;
        const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
        distances[id] = {
          distanceM: distance,
          timeMs: (distance / SPEED_OF_SOUND) * 1000
        };
      });
    }
    
    const rearCount = rearSubsCfg?.count || 0;
    const rearPositions = rearSubsCfg?.positions || [];
    if (rearCount > 0) {
      const roomWidth = roomDims?.widthM || 4.5;
      const roomLength = roomDims?.lengthM || 6.0;
      const defaultRearPos = [
        { x: roomWidth * 0.33, y: roomLength - 0.15 },
        { x: roomWidth * 0.67, y: roomLength - 0.15 }
      ];
      const rearIds = rearCount === 1 ? ['rear-sub-left'] : ['rear-sub-left', 'rear-sub-right'];
      rearIds.forEach((id, i) => {
        const pos = rearPositions[i] || defaultRearPos[i];
        const dx = pos.x - mlpPoint.x;
        const dy = pos.y - mlpPoint.y;
        const dz = 0.35 - mlpPoint.z;
        const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
        distances[id] = {
          distanceM: distance,
          timeMs: (distance / SPEED_OF_SOUND) * 1000
        };
      });
    }
    
    return distances;
  }, [seatingPositions, frontSubsCfg, rearSubsCfg, roomDims]);

  // Auto-align function — operates across ALL active subs (front + rear) globally
  const autoAlignSubs = React.useCallback(() => {
    if (!autoAlignEnabled) return;

    const seatingPositionsNow = seatingRef.current;
    const roomDimsNow = roomDimsRef.current;
    const frontCfg = frontCfgRef.current;
    const rearCfg = rearCfgRef.current;
    const mlpSeat = seatingPositionsNow?.find(s => s.isPrimary) || seatingPositionsNow?.[0];
    if (!mlpSeat) return;

    const mlpPoint = { x: mlpSeat.x, y: mlpSeat.y, z: mlpSeat.z ?? 1.2 };
    const SPEED_OF_SOUND = 343;
    const roomWidth = Number(roomDimsNow?.widthM) || 4.5;
    const roomLength = Number(roomDimsNow?.lengthM) || 6.0;

    // Build combined list of all active subs across both groups
    const allSubData = [];

    const processGroup = (cfg, group) => {
      const count = cfg?.count || 0;
      if (count === 0) return;
      const positions = Array.isArray(cfg?.positions) ? cfg.positions : [];
      const POSITION_LABELS = ['left', 'right'];
      const isRear = group === 'rear';
      const defaultPositions = isRear
        ? [{ x: roomWidth * 0.33, y: roomLength - 0.15 }, { x: roomWidth * 0.67, y: roomLength - 0.15 }]
        : [{ x: roomWidth * 0.33, y: 0.15 }, { x: roomWidth * 0.67, y: 0.15 }];
      for (let i = 0; i < count; i++) {
        const subId = `${group}-sub-${POSITION_LABELS[i] ?? i}`;
        const pos = positions[i] || defaultPositions[i] || { x: roomWidth / 2, y: isRear ? roomLength - 0.15 : 0.15 };
        const dx = pos.x - mlpPoint.x;
        const dy = pos.y - mlpPoint.y;
        const dz = 0.35 - mlpPoint.z;
        const distanceM = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const arrivalTime = distanceM / SPEED_OF_SOUND;
        allSubData.push({ subId, group, arrivalTime, distanceM });
      }
    };

    processGroup(frontCfg, 'front');
    processGroup(rearCfg, 'rear');

    if (allSubData.length === 0) return;

    // Single global maxArrival across all subs
    const maxArrival = Math.max(...allSubData.map(s => s.arrivalTime));

    // Diagnostic log
    allSubData.forEach(({ subId, distanceM, arrivalTime }) => {
      const delayMs = Math.max(0, (maxArrival - arrivalTime) * 1000);
      console.log(`[AutoAlign] ${subId}: ${distanceM.toFixed(3)}m → ${(arrivalTime * 1000).toFixed(2)}ms arrival → ${delayMs.toFixed(2)}ms applied delay`);
    });

    // Auto-align is now runtime-only — no writes to settingsById.
    // Delays are derived in autoAlignDelays useMemo and injected into subsForSimulation at engine call time.
  }, [autoAlignEnabled]);

  // Auto-align effects — re-run whenever MLP seat, room dims, or any sub positions change
  useEffect(() => {
    const frontCount = frontSubsCfg?.count || 0;
    const rearCount  = rearSubsCfg?.count  || 0;
    if (!autoAlignEnabled) return;
    if (frontCount > 0) setHasAutoAlignedFront(true); else setHasAutoAlignedFront(false);
    if (rearCount  > 0) setHasAutoAlignedRear(true);  else setHasAutoAlignedRear(false);
    autoAlignSubs();
  }, [autoAlignEnabled, frontSubsCfg?.count, frontSubsCfg?.positions, rearSubsCfg?.count, rearSubsCfg?.positions, seatingPositions, roomDims?.widthM, roomDims?.lengthM, autoAlignSubs]);

  // Expose drag state
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__B44_setIsDraggingSub = (dragging) => setIsDraggingSub(dragging);
    }
  }, []);

  return (
    <div className="space-y-4" style={{ fontFamily: 'Didact Gothic, Century Gothic, sans-serif' }}>

      {(hasNoSeats || hasNoSubs) && (
        <Alert className="border border-[#DCDBD6] bg-[#F8F8F7] text-[#3E4349]">
          <AlertDescription className="text-sm">
            {hasNoSeats && <>No seating found. Go to <strong>Layout → Seating</strong> and generate at least one row.</>}
            {hasNoSeats && hasNoSubs && <><br/></>}
            {hasNoSubs && <>No subwoofers found. Add one in <strong>Speakers</strong> (front corner is fine to start).</>}
          </AlertDescription>
        </Alert>
      )}

      {/* Fairness Summary */}
      {simulationResults.metrics?.fairness && (
        <div className="rounded-lg border border-[#213428] bg-[#213428]/5 p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-bold text-[#213428]">Designer Metrics</div>
            <div className="text-2xl font-bold text-[#213428]">
              {simulationResults.metrics.fairness.score}/100
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-[#3E4349]">Best↔Worst:</span>
              <span className="ml-1 font-medium text-[#1B1A1A]">
                {fmtFixed(simulationResults.metrics.fairness.spreadBestWorstDb, 1)} dB
              </span>
            </div>
            <div>
              <span className="text-[#3E4349]">Worst Null:</span>
              <span className="ml-1 font-medium text-[#1B1A1A]">
                {fmtFixed(simulationResults.metrics.fairness.nulls.worstNullDb, 1)} dB
              </span>
            </div>
          </div>
          {simulationResults.metrics.fairness.nulls.worstSeatId && (
            <div className="text-xs text-[#3E4349] mt-2">
              @ Seat {simulationResults.metrics.fairness.nulls.worstSeatId}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-xs">
        <Badge className="bg-[#F8F8F7] text-[#1B1A1A] border-[#DCDBD6]">Room: {dimsTxt}</Badge>
        <Badge className="bg-[#F8F8F7] text-[#1B1A1A] border-[#DCDBD6]">Subs: {totalSubCount}</Badge>
        <Badge className="bg-[#F8F8F7] text-[#1B1A1A] border-[#DCDBD6]">Seats: {seatingPositions?.length ?? 0}</Badge>

      </div>
      
      {(subWarnings?.front?.length > 0 || subWarnings?.rear?.length > 0) && (
        <Alert className="border border-[#C1B6AD] bg-[#F8F8F7] text-[#3E4349]">
          <AlertDescription className="text-sm">
            {subWarnings.front.map((w, i) => <div key={`f-${i}`}>{w}</div>)}
            {subWarnings.rear.map((w, i) => <div key={`r-${i}`}>{w}</div>)}
          </AlertDescription>
        </Alert>
      )}

      {/* ── Active Test Engine Banner ── */}
      {activeTestEngine && (
        <div style={{ border: '2px solid #059669', borderRadius: 8, background: '#f0fdf4', padding: '8px 14px', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
          <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#065f46', fontWeight: 700 }}>
            🧪 Production Test Engine Active: {activeTestEngine.label}
            <span style={{ fontWeight: 400, marginLeft: 8, color: '#6b7280' }}>
              Top 5 · Listener ×1.25 · Q×1.20 · Tang 0.40 · Transfer ranked
            </span>
          </div>
          <button
            onClick={() => { setActiveTestEngine(null); if (typeof window !== 'undefined') { window.__B44_ACTIVE_TEST_ENGINE__ = null; } }}
            style={{ height: 24, padding: '0 10px', borderRadius: 4, border: '1px solid #059669', background: '#fff', color: '#065f46', fontSize: 9, fontFamily: 'monospace', cursor: 'pointer' }}
          >
            Restore production engine
          </button>
        </div>
      )}

      {/* Bass Response Graph */}
      <div style={{ border: "1px solid #DCDBD6", borderRadius: 16, background: "#FFFFFF", padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#1B1A1A" }}>
            Bass Response
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {IS_DEVELOPMENT_MODE && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: '#625143', fontFamily: 'monospace' }}>Q strategy:</span>
              <select
                value={qStrategy}
                onChange={e => setQStrategy(e.target.value)}
                style={{
                  height: 26, borderRadius: 6, fontSize: 11, padding: '0 6px', fontFamily: 'monospace', cursor: 'pointer',
                  border: qStrategy === 'freq_dependent_cap' ? '1px solid #2563eb' : '1px solid #DCDBD6',
                  background: qStrategy === 'freq_dependent_cap' ? '#eff6ff' : '#F8F8F7',
                  color: qStrategy === 'freq_dependent_cap' ? '#1e40af' : '#1B1A1A',
                  fontWeight: qStrategy === 'freq_dependent_cap' ? 700 : 400,
                }}
              >
                <option value="ab_corrected">Allen &amp; Berkley corrected</option>
                <option value="production">Production — smooth Q cap (debug)</option>
                 <option value="freq_dependent_cap">⚡ Freq-dep cap — Variant F (diagnostic)</option>
                 <option value="smooth_soft_cap">🔬 Smooth soft cap (same as production)</option>
                 <option value="rew_absorption_authority">REW-style Absorption Authority (Experimental)</option>
                 <option value="rew_modal_bandwidth">REW-style Modal Bandwidth (Experimental)</option>
              </select>
              </div>
              )}
              {IS_DEVELOPMENT_MODE && qStrategy === 'rew_modal_bandwidth' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: '#625143', fontFamily: 'monospace' }}>Bandwidth scale:</span>
                <select
                  value={rewModalBandwidthScale}
                  onChange={e => setRewModalBandwidthScale(parseFloat(e.target.value))}
                  style={{ height: 26, borderRadius: 6, border: '1px solid #93c5fd', background: '#eff6ff', fontSize: 11, padding: '0 6px', color: '#1e40af', fontFamily: 'monospace', cursor: 'pointer' }}
                >
                  <option value="0.45">0.45</option>
                  <option value="0.55">0.55</option>
                  <option value="0.65">0.65</option>
                  <option value="0.75">0.75</option>
                  <option value="1.00">1.00</option>
                </select>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: '#625143', fontFamily: 'monospace' }}>Graph scale:</span>
              <select
                value={graphScaleMode}
                onChange={e => setGraphScaleMode(e.target.value)}
                style={{ height: 26, borderRadius: 6, border: '1px solid #DCDBD6', background: '#F8F8F7', fontSize: 11, padding: '0 6px', color: '#1B1A1A', fontFamily: 'monospace', cursor: 'pointer' }}
              >
                <option value="rew_fixed">REW-style fixed</option>
                <option value="auto">Auto</option>
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: '#625143', fontFamily: 'monospace' }}>Smoothing:</span>
              <select
                value={bassSmoothingMode}
                onChange={e => setBassSmoothingMode(e.target.value)}
                style={{ height: 26, borderRadius: 6, border: '1px solid #DCDBD6', background: '#F8F8F7', fontSize: 11, padding: '0 6px', color: '#1B1A1A', fontFamily: 'monospace', cursor: 'pointer' }}
              >
                <option value="none">None</option>
                <option value="sixth">1/6 octave</option>
                <option value="third">1/3 octave</option>
              </select>
            </div>
          </div>
        </div>

        {/* Seat selector pills */}
        {Array.isArray(seatingPositions) && seatingPositions.length > 0 && (() => {
          const rowMap = new Map();
          orderedSeats.forEach(seat => {
            const r = Number(seat?.row || seat?.rowNumber) || 1;
            if (!rowMap.has(r)) rowMap.set(r, []);
            rowMap.get(r).push(seat);
          });
          const rowNums = Array.from(rowMap.keys()).sort((a, b) => a - b);
          return (
            <div style={{ display: "grid", gap: 5, marginBottom: 12 }}>
              {rowNums.map(r => {
                const rowSeats = rowMap.get(r) || [];
                return (
                  <div key={r} style={{ display: "flex", gap: 5 }}>
                    {rowSeats.map(seat => {
                      const sid = seat.id || `${seat.x}-${seat.y}`;
                      const isOn = selectedSeatIds.includes(sid);
                      const isPrimary = !!seat.isPrimary;
                      const color = getSeatColor(sid);
                      const rowNum = Number(seat?.row || seat?.rowNumber) || 1;
                      const rowSeatsOrdered = orderedSeats.filter(s => (Number(s?.row || s?.rowNumber) || 1) === rowNum);
                      const posInRow = rowSeatsOrdered.findIndex(s => (s.id || `${s.x}-${s.y}`) === sid) + 1;
                      const label = `R${rowNum}S${posInRow}`;
                      return (
                        <button
                          key={sid}
                          onClick={() => toggleSeat(sid)}
                          title={`${label}${isPrimary ? " — MLP" : ""}`}
                          style={{
                            width: 52, height: 26,
                            border: isOn ? `2px solid ${color}` : isPrimary ? "1px solid #A09386" : "1px solid #DCDBD6",
                            borderRadius: 9999, fontSize: 11, fontWeight: isOn ? 700 : 500,
                            background: isOn ? color : "#F6F3EE",
                            color: isOn ? "#fff" : isPrimary ? "#3E4349" : "#625143",
                            cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center",
                            outline: "none", flexShrink: 0, transition: "background 0.12s, border-color 0.12s",
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })()}

        <div className="mt-4">
          {multiSeries.length > 0 ? (
            <BassGraph
              multiSeries={multiSeriesForGraph}
              responseData={multiSeriesForGraph[0]?.data ?? []}
              schroederFrequency={schroederFrequency}
              rp22Levels={rp22Levels}
              toggles={{}}
              crossoverFrequency={80}
              modeFrequencies={[]}
              showModeMarkers={true}
              modeMarkers={modeMarkersForGraph}
              linearHzAxis={false}
              rewStyleMode={true}
              yDomain={graphScaleMode === 'rew_fixed' ? [60, 120] : undefined}
              xDomain={graphScaleMode === 'rew_fixed'
                ? (multiSeriesForGraph[0]?.data?.some(p => p.frequency > 200) ? [20, 300] : [20, 200])
                : [20, 200]}
              showAxialOnly={false}
              refDb={85}
              disableHighlight={false}
              renderToken={qStrategy}
            />
          ) : (
            <div style={{ border: "1px solid #DCDBD6", borderRadius: 12, background: "#F8F8F7", padding: 24, color: "#3E4349", fontSize: 13, textAlign: "center" }}>
              No bass data yet. Add at least one subwoofer and one seat.
            </div>
          )}
        </div>

        {/* Displayed smoothing label */}
        <div style={{ fontSize: 10, color: '#8B7F76', fontFamily: 'monospace', marginTop: 4 }}>
          Displayed smoothing: {bassSmoothingLabel(bassSmoothingMode)}
        </div>

        {/* Allen & Berkley model attribution — presentation only, no simulation/scaling logic */}
        <p className="text-center text-[11px] font-normal text-muted-foreground mt-2 mb-2">
          Simulation based on the Allen & Berkley (1978) room acoustics model with Artcoustic Loudspeakers engineering data.
        </p>

        {/* ── Temporary overlay toggle for the REW-style Absorption Authority candidate ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
          <input
            type="checkbox"
            id="overlay-production-toggle"
            checked={overlayProduction}
            onChange={(e) => setOverlayProduction(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          <label htmlFor="overlay-production-toggle" style={{ fontSize: 11, color: '#625143', fontFamily: 'monospace', cursor: 'pointer' }}>
            Overlay Production {overlayProduction && <span style={{ color: '#9CA3AF' }}>(grey = Production</span>}{overlayProduction && qStrategy === 'rew_absorption_authority' && <span style={{ color: '#16a34a' }}>, green = REW-style Absorption Authority)</span>}{overlayProduction && qStrategy !== 'rew_absorption_authority' && <span style={{ color: '#9CA3AF' }}>)</span>}
          </label>
        </div>

        <ModalResonanceLineToggles
          toggles={modalLineToggles}
          onToggle={toggleModalLine}
          onSetAll={setAllModalLines}
        />
      </div>

      {/* ── Active Q Strategy Label (debug mode only) ── */}
      {IS_DEVELOPMENT_MODE && qStrategy === 'freq_dependent_cap' && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 6, padding: '3px 10px', fontSize: 11, fontFamily: 'monospace', color: '#1e40af', fontWeight: 700, marginTop: -8, marginBottom: 4 }}>
          ⚡ Q strategy: Freq-Dep Cap (Variant F) — candidate mode
        </div>
      )}
      {IS_DEVELOPMENT_MODE && qStrategy === 'smooth_soft_cap' && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 6, padding: '3px 10px', fontSize: 11, fontFamily: 'monospace', color: '#166534', fontWeight: 700, marginTop: -8, marginBottom: 4 }}>
          🔬 Q strategy: Smooth Soft Cap — same as production default
        </div>
      )}
      {IS_DEVELOPMENT_MODE && qStrategy === 'rew_absorption_authority' && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: 6, padding: '3px 10px', fontSize: 11, fontFamily: 'monospace', color: '#065f46', fontWeight: 700, marginTop: -8, marginBottom: 4 }}>
          🧪 Q strategy: REW-style Absorption Authority — experimental candidate
        </div>
      )}
      {IS_DEVELOPMENT_MODE && qStrategy === 'rew_modal_bandwidth' && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 6, padding: '3px 10px', fontSize: 11, fontFamily: 'monospace', color: '#1e40af', fontWeight: 700, marginTop: -8, marginBottom: 4 }}>
          🧪 Q strategy: REW-style Modal Bandwidth (scale {rewModalBandwidthScale.toFixed(2)}) — experimental candidate
        </div>
      )}

      {/* Case099 REW parity benchmark — debug mode only, hidden from normal users */}
      {IS_DEVELOPMENT_MODE && qStrategy === 'ab_corrected' && (
        <Case099RewThreeRoomBenchmark />
      )}

      {/* ── Null Depth Audit Badge ── */}
      {multiSeries.length > 0 && multiSeries[0]?.data?.length > 0 && (
        <NullDepthAuditBadge rawData={multiSeries[0].data} smoothingMode={bassSmoothingMode} />
      )}

      {/* ── Diagnostic panel wiring extracted to BassDiagnosticsPanel.jsx ── */}
      <BassDiagnosticsPanel
        roomDims={roomDims}
        seatingPositions={seatingPositions}
        subsForSimulation={subsForSimulation}
        orderedSeats={orderedSeats}
        surfaceAbsorption={surfaceAbsorption}
        frontSubsCfg={frontSubsCfg}
        rearSubsCfg={rearSubsCfg}
        frontSubsLive={frontSubsLive}
        rearSubsLive={rearSubsLive}
        autoAlignEnabled={autoAlignEnabled}
        autoAlignDelays={autoAlignDelays}
        resolveAutoDelayForSub={resolveAutoDelayForSub}
        getSeatColor={getSeatColor}
        simulationResults={simulationResults}
        multiSeries={multiSeries}
        selectedSeatIds={selectedSeatIds}
        rewSourceCurveMode={rewSourceCurveMode}
        setRewSourceCurveMode={setRewSourceCurveMode}
        modalSourceReferenceMode={modalSourceReferenceMode}
        setModalSourceReferenceMode={setModalSourceReferenceMode}
        modalDistanceBlend={modalDistanceBlend}
        setModalDistanceBlend={setModalDistanceBlend}
        modalGainScalar={modalGainScalar}
        setModalGainScalar={setModalGainScalar}
        axialQ={axialQ}
        setAxialQ={setAxialQ}
        modalStorageMode={modalStorageMode}
        propagationPhaseScale={propagationPhaseScale}
        setPropagationPhaseScale={setPropagationPhaseScale}
        disableReflectionPhaseJitter={disableReflectionPhaseJitter}
        disableReflectionCoherenceWeight={disableReflectionCoherenceWeight}
        disableLateField={disableLateField}
        disableModalPropagationPhase={disableModalPropagationPhase}
        mute68HzAxialMode={mute68HzAxialMode}
        debugDisableModalContribution={debugDisableModalContribution}
        rewParityFieldMode={rewParityFieldMode}
        setRewParityFieldMode={setRewParityFieldMode}
        overrideConstantAxialQ={overrideConstantAxialQ}
        overrideAbsorptionAxialQ={overrideAbsorptionAxialQ}
        debugMode200Multiplier={debugMode200Multiplier}
        setDebugMode200Multiplier={setDebugMode200Multiplier}
        debugModalPhaseConvention={debugModalPhaseConvention}
        setDebugModalPhaseConvention={setDebugModalPhaseConvention}
        debugModalHSign={debugModalHSign}
        setDebugModalHSign={setDebugModalHSign}
        reflectionGainScale={reflectionGainScale}
        setReflectionGainScale={setReflectionGainScale}
        rewParityModalMagnitudeScale={rewParityModalMagnitudeScale}
        setRewParityModalMagnitudeScale={setRewParityModalMagnitudeScale}
        modalCoherenceMode={modalCoherenceMode}
        setModalCoherenceMode={setModalCoherenceMode}
        highOrderAxialScale={highOrderAxialScale}
        setHighOrderAxialScale={setHighOrderAxialScale}
        enableRewCoreReflections={enableRewCoreReflections}
        setEnableRewCoreReflections={setEnableRewCoreReflections}
        resetToParityPreset={resetToParityPreset}
        isParityPresetActive={isParityPresetActive}
        setActiveTestEngine={setActiveTestEngine}
        rewOverlayText={rewOverlayText}
        setRewOverlayText={setRewOverlayText}
        showRewOverlay={showRewOverlay}
        setShowRewOverlay={setShowRewOverlay}
        normalizeRewOverlay={normalizeRewOverlay}
        setNormalizeRewOverlay={setNormalizeRewOverlay}
        rewOverlaySeries={rewOverlaySeries}
        qStrategy={qStrategy}
      />

      {/* ── Deep null warning — always visible ── */}
      {multiSeries.length > 0 && (() => {
        const data = multiSeries[0]?.data;
        if (!Array.isArray(data) || data.length === 0) return null;
        // Find raw minimum in 20–120 Hz band
        const band = data.filter(p => p.frequency >= 20 && p.frequency <= 120 && Number.isFinite(p.spl));
        if (band.length === 0) return null;
        const minSpl = Math.min(...band.map(p => p.spl));
        // Find local peak within ±1.5 octaves of the null
        const nullPt = band.find(p => p.spl === minSpl);
        const loHz = nullPt.frequency / Math.pow(2, 1.5);
        const hiHz = nullPt.frequency * Math.pow(2, 1.5);
        const peak = Math.max(...data.filter(p => p.frequency >= loHz && p.frequency <= hiHz && Number.isFinite(p.spl)).map(p => p.spl));
        const depth = minSpl - peak;
        if (depth > -12) return null;
        return (
          <div style={{ border: '2px solid #b45309', borderRadius: 8, background: '#fffbeb', padding: '10px 14px', marginBottom: 8 }}>
            <div style={{ fontWeight: 700, color: '#92400e', fontSize: 13, marginBottom: 4 }}>
              ⚠ Potential bass null detected
            </div>
            <div style={{ color: '#78350f', fontSize: 12, lineHeight: 1.5 }}>
              Raw null depth: <strong>{depth.toFixed(1)} dB</strong> at <strong>{nullPt.frequency.toFixed(1)} Hz</strong>.
              A null this deep ({depth < -20 ? 'severe' : 'significant'}) is unlikely to be fully resolved by EQ alone.
              Consider adjusting subwoofer placement before applying EQ correction.
            </div>
          </div>
        );
      })()}

      {/* Surface Absorption Panel */}
      <div className="rounded-lg border border-[#DCDBD6] bg-white p-4">
        <div className="text-sm font-medium text-[#1B1A1A] mb-1">Room Acoustics</div>
        <div className="text-xs text-[#3E4349] mb-3">Surface absorption coefficients (0.00 – 1.00). Default 0.30 = typical cinema.</div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
          {[
            { key: 'front',   label: 'Front wall' },
            { key: 'back',    label: 'Back wall' },
            { key: 'left',    label: 'Left wall' },
            { key: 'right',   label: 'Right wall' },
            { key: 'ceiling', label: 'Ceiling' },
            { key: 'floor',   label: 'Floor' },
          ].map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between gap-2">
              <Label className="text-xs text-[#3E4349] w-20 flex-shrink-0">{label}</Label>
              <input
                type="number"
                min="0.00"
                max="1.00"
                step="0.05"
                value={surfaceAbsorptionInputs[key]}
                onChange={(e) => {
                  const val = Math.max(0, Math.min(1, parseFloat(e.target.value) || 0));
                  setSurfaceAbsorptionInputs(prev => ({ ...prev, [key]: val }));
                }}
                autoComplete="off"
                inputMode="decimal"
                className="w-16 rounded border border-[#DCDBD6] bg-white px-2 py-1 text-xs font-mono text-right text-[#1B1A1A] focus:outline-none focus:ring-1 focus:ring-[#213428]"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Auto Align Controls */}
      {totalSubCount > 0 && (
        <div className="rounded-lg border border-[#DCDBD6] bg-white p-4">
          <div className="text-sm font-medium text-[#1B1A1A] mb-3">Time Alignment</div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="auto-align-toggle" className="text-xs text-[#3E4349]">Auto time-align to MLP</Label>
              <Switch id="auto-align-toggle" checked={autoAlignEnabled} onCheckedChange={setAutoAlignEnabled} />
            </div>
            {autoAlignEnabled && (
              <div className="text-xs text-[#3E4349] bg-[#F8F8F7] p-2 rounded">
                Auto alignment active.
              </div>
            )}
            {!autoAlignEnabled && (
              <div className="text-xs text-[#3E4349] bg-[#F8F8F7] p-2 rounded">
                Manual delay controls are currently hidden.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sub Tuning Controls */}
      <div className="space-y-4">
        {frontSubsCfg?.count > 0 && (
          <div>
            <div className="text-sm font-medium text-[#1B1A1A] mb-3">Front Subwoofer Tuning</div>
            <SubTuningControls
              subsCfg={frontSubsCfg}
              groupLabel="Front"
              autoAlignDelays={autoAlignDelays}
              showManualDelay={true}
              onSettingsChange={(newSettings) => {
                setFrontSubsCfg(prev => ({ ...prev, settingsById: newSettings }));
              }}
            />
          </div>
        )}

        {rearSubsCfg?.count > 0 && (
          <div>
            <div className="text-sm font-medium text-[#1B1A1A] mb-3">Rear Subwoofer Tuning</div>
            <SubTuningControls
              subsCfg={rearSubsCfg}
              groupLabel="Rear"
              autoAlignDelays={autoAlignDelays}
              showManualDelay={true}
              onSettingsChange={(newSettings) => {
                setRearSubsCfg(prev => ({ ...prev, settingsById: newSettings }));
              }}
            />
          </div>
        )}
      </div>

      {/* Per-seat detail cards */}
      {!useRewCoreTestMode && Object.keys(simulationResults.seatResponses).length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {Object.entries(simulationResults.seatResponses).map(([seatId, response]) => {
            const seat = seatingPositions.find(s => (s.id || `${s.x}-${s.y}`) === seatId);
            const isPrimary = seat?.isPrimary || false;
            const nullInfo = response.nulls || { count: 0, worstDb: 0 };
            
            return (
              <div key={seatId} className="rounded-lg border border-[#DCDBD6] bg-white p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium text-[#1B1A1A]">Seat {seatId}</div>
                  {isPrimary && <Badge className="bg-[#213428] text-white border-[#213428]">MLP</Badge>}
                </div>
                <div className="space-y-1 text-xs">
                  {nullInfo.count > 0 && (
                    <>
                      <div className="text-[#3E4349]">
                        <span className="font-medium">Nulls:</span> {nullInfo.count}
                      </div>
                      <div className="text-[#3E4349]">
                        <span className="font-medium">Worst:</span> {fmtFixed(nullInfo.worstDb, 1)} dB
                      </div>
                    </>
                  )}
                  {nullInfo.count === 0 && (
                    <div className="text-[#3E4349]">No significant nulls</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}