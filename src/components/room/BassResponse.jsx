// BassResponse.jsx - Simplified bass simulation UI

import React, { useMemo, useEffect, useState, useRef, useCallback } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppState } from "../AppStateProvider";
import BassGraph from "@/components/room/bass/BassGraph";
import { simulateBassAtSeats } from "@/components/bass/bassSimulationEngine";
import { simulateBassResponseRewCore, simulateBassResponseRewParityField } from "@/bass/core/rewBassEngine";
import { getSubwooferCurve } from "@/components/models/speakers/registry";
import SubTuningControls from "@/components/room/bass/SubTuningControls";
import RewDebugPanel from "@/components/room/bass/RewDebugPanel";
import RewParityBenchmark from "@/components/room/bass/RewParityBenchmark";
import RewBenchmarkComparisonTable from "@/components/room/bass/RewBenchmarkComparisonTable";
import RewCandidateComparisonPanel from "@/components/room/bass/RewCandidateComparisonPanel";
import RewParityAutoSweep from "@/components/room/bass/RewParityAutoSweep";
import RewParityInvestigationRunner from "@/components/room/bass/RewParityInvestigationRunner";
import RewParityModalParticipationAudit from "@/components/room/bass/RewParityModalParticipationAudit";
import RewParityCombinedRootCauseAudit from "@/components/room/bass/RewParityCombinedRootCauseAudit";
import RewParityParticipationDecayAudit from "@/components/room/bass/RewParityParticipationDecayAudit";
import RewProductionCandidateGenerator from "@/components/room/bass/RewProductionCandidateGenerator";
import RewEngineShootout from "@/components/room/bass/RewEngineShootout";
import RewParityErrorBreakdown from "@/components/room/bass/RewParityErrorBreakdown";
import RewBestCandidateRefiner from "@/components/room/bass/RewBestCandidateRefiner";
import RewRefinedEngineShootout from "@/components/room/bass/RewRefinedEngineShootout";
import SubwooferDelayOptimiser from "@/components/room/bass/SubwooferDelayOptimiser";
import DeepDiagnosticsSweepPanel from "@/components/room/bass/DeepDiagnosticsSweepPanel";
import ModalSourceNormalisationAudit from "@/components/room/bass/ModalSourceNormalisationAudit";
import MultiSeatParityValidationAudit from "@/components/room/bass/MultiSeatParityValidationAudit";
import ActiveParityInvestigations from "@/components/room/bass/ActiveParityInvestigations";
import AcousticSolverShootoutBatch1 from "@/components/room/bass/AcousticSolverShootoutBatch1";
import NullDepthAuditBadge from "@/components/room/bass/NullDepthAuditBadge";
import ArchivedInvestigations from "@/components/room/bass/ArchivedInvestigations";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

// Development flag — set to true to re-enable all diagnostic UI panels.
// Do not delete diagnostic code; just flip this flag.
const IS_DEVELOPMENT_MODE = true;

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
  const [modalSourceReferenceMode, setModalSourceReferenceMode] = useState(REW_PARITY_PRESET.modalSourceReferenceMode);
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

  // Run bass simulation engine
  const simulationResults = useMemo(() => {
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
        const _fieldReflections = _isParityFullField ? false
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
            debugReflectionOrder: rewSourceCurveMode === 'flat_rew_reference' ? 1 : 3, // __TEMP_DIAGNOSTIC_REFLECTION_ORDER__ force order-1 for REW parity preset
            reflectionGainScale, // diagnostic: scale imageAmplitude after reflectionCoefficient
            debugModalHSign: 'normal', // __TEMP_DIAGNOSTIC_MODAL_H_SIGN__
            rewParityModalMagnitudeScale: rewSourceCurveMode === 'flat_rew_reference' ? rewParityModalMagnitudeScale : 1.0, // __TEMP_REW_PARITY_MODAL_MAGNITUDE_SCALE__
            modalCoherenceMode, // __TEMP_DIAGNOSTIC_MODAL_COHERENCE__
            highOrderAxialScale, // __TEMP_REW_PARITY_HIGH_ORDER_AXIAL_SCALE__
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
  }, [roomDims?.widthM, roomDims?.lengthM, roomDims?.heightM, seatingPositions, subsForSimulation, splConfig, roomDamping, hasNoSeats, hasNoSubs, useRewCoreTestMode, enableRewCoreReflections, rewSourceCurveMode, modalSourceReferenceMode, modalGainScalar, modalDistanceBlend, axialQ, modalStorageMode, propagationPhaseScale, disableReflectionPhaseJitter, disableReflectionCoherenceWeight, disableLateField, disableModalPropagationPhase, mute68HzAxialMode, surfaceAbsorptionInputs, selectedSeatIds, debugDisableModalContribution, subTuningSignature, rewParityFieldMode, overrideConstantAxialQ, overrideAbsorptionAxialQ, debugMode200Multiplier, debugModalPhaseConvention, reflectionGainScale, debugModalHSign, rewParityModalMagnitudeScale, modalCoherenceMode, highOrderAxialScale]);

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

  const multiSeriesForGraph = useMemo(() => {
    if (!showRewOverlay || !rewOverlaySeries) return multiSeries;
    return [...multiSeries, rewOverlaySeries];
  }, [multiSeries, rewOverlaySeries, showRewOverlay]);

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

      {/* REW Parity Controls — visible above graph for screenshot workflow */}
      {IS_DEVELOPMENT_MODE && (
        <div style={{ border: '1px solid #CBD5E1', borderRadius: 8, background: '#f8fafc', padding: '10px 12px', marginBottom: 4 }}>
          <div style={{ fontWeight: 700, color: '#334155', fontSize: 11, fontFamily: 'monospace', marginBottom: 8 }}>REW Parity Controls</div>
          <div className="flex flex-col gap-2">
            <div className="text-xs text-[#6b7280] font-mono">Engine: REW Core (production — fixed)</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={resetToParityPreset} style={{ height: 28, padding: '0 10px', borderRadius: 6, border: '1px solid #213428', background: '#213428', color: '#fff', fontSize: 11, fontFamily: 'monospace', cursor: 'pointer', fontWeight: 600 }}>
                Reset to REW parity preset
              </button>
              <span style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: isParityPresetActive ? '#dcfce7' : '#fef9c3', color: isParityPresetActive ? '#166534' : '#92400e', border: `1px solid ${isParityPresetActive ? '#86efac' : '#fde68a'}` }}>
                {isParityPresetActive ? '✓ REW parity preset active' : '⚠ modified'}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <select value={rewSourceCurveMode} onChange={(e) => setRewSourceCurveMode(e.target.value)} className="h-8 rounded-md border border-[#DCDBD6] bg-white px-2 text-xs text-[#1B1A1A]" aria-label="Source curve">
                <option value="product">Source curve: current product</option>
                <option value="flat_rew_reference">Source curve: Flat REW reference</option>
                <option value="flat90">Source curve: flat 90 dB</option>
                <option value="rew20HzPorted">Source curve: REW-style 20 Hz ported</option>
                <option value="flat_0_500hz_rew_parity">Flat 0–500Hz REW parity</option>
              </select>
              <select value={modalSourceReferenceMode} onChange={(e) => setModalSourceReferenceMode(e.target.value)} className="h-8 rounded-md border border-[#DCDBD6] bg-white px-2 text-xs text-[#1B1A1A]" aria-label="Modal source reference">
                <option value="existing">Modal source: existing 1 m reference</option>
                <option value="no_volume">Modal source: no volume attenuation ⚠️ diagnostic</option>
                <option value="distance_normalized">Modal source: distance matched to listener ⚠️</option>
                <option value="distance_blend">Modal source: distance blend ⚠️</option>
                <option value="room_normalized">Modal source: room-normalised</option>
              </select>
              {modalSourceReferenceMode === 'distance_blend' && (
                <label className="flex h-8 items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-2 text-xs text-amber-800 font-mono">
                  Modal distance blend:
                  <input type="number" min="0.00" max="1.00" step="0.05" value={modalDistanceBlend} onChange={(e) => setModalDistanceBlend(Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)))} className="w-16 rounded border border-amber-300 bg-white px-1 py-0.5 text-xs font-mono text-right focus:outline-none" />
                </label>
              )}
              <select value={modalGainScalar} onChange={(e) => setModalGainScalar(Number(e.target.value))} className="h-8 rounded-md border border-[#DCDBD6] bg-white px-2 text-xs text-[#1B1A1A]" aria-label="Modal gain">
                <option value={1.0}>Modal gain: 1.0</option>
                <option value={1.2}>Modal gain: 1.2</option>
                <option value={1.4}>Modal gain: 1.4</option>
                <option value={1.6}>Modal gain: 1.6</option>
              </select>
              <select value={axialQ} onChange={(e) => setAxialQ(Number(e.target.value))} className="h-8 rounded-md border border-[#DCDBD6] bg-white px-2 text-xs text-[#1B1A1A]" aria-label="Axial Q">
                <option value={4.0}>Axial Q: 4.0 (parity)</option>
                <option value={5.0}>Axial Q: 5.0</option>
                <option value={6.0}>Axial Q: 6.0</option>
                <option value={6.5}>Axial Q: 6.5</option>
                <option value={7.0}>Axial Q: 7.0</option>
                <option value={8.0}>Axial Q: 8.0 (legacy)</option>
              </select>
              <select value={propagationPhaseScale} onChange={(e) => setPropagationPhaseScale(Number(e.target.value))} className="h-8 rounded-md border border-[#DCDBD6] bg-white px-2 text-xs text-[#1B1A1A]" aria-label="Propagation phase scale">
                <option value={0.00}>Propagation phase scale: 0.00</option>
                <option value={0.10}>Propagation phase scale: 0.10</option>
                <option value={0.20}>Propagation phase scale: 0.20</option>
                <option value={0.30}>Propagation phase scale: 0.30</option>
                <option value={0.40}>Propagation phase scale: 0.40</option>
                <option value={0.50}>Propagation phase scale: 0.50</option>
                <option value={0.60}>Propagation phase scale: 0.60</option>
                <option value={0.70}>Propagation phase scale: 0.70</option>
                <option value={1.00}>Propagation phase scale: 1.00</option>
              </select>
              <select value={debugMode200Multiplier} onChange={(e) => setDebugMode200Multiplier(Number(e.target.value))} className="h-8 rounded-md border border-amber-300 bg-amber-50 px-2 text-xs text-amber-800 font-semibold" aria-label="(2,0,0) axial overlay">
                <option value={1.00}>(2,0,0) axial overlay: 1.00</option>
                <option value={0.75}>(2,0,0) axial overlay: 0.75</option>
                <option value={0.50}>(2,0,0) axial overlay: 0.50</option>
                <option value={0.25}>(2,0,0) axial overlay: 0.25</option>
              </select>
              {/* __TEMP_DIAGNOSTIC_MODAL_PHASE_CONVENTION__ — only active when flat_rew_reference is selected */}
              <select
                value={debugModalPhaseConvention}
                onChange={(e) => setDebugModalPhaseConvention(e.target.value)}
                className="h-8 rounded-md border border-purple-400 bg-purple-50 px-2 text-xs text-purple-900 font-semibold"
                aria-label="Modal phase convention"
                title="Diagnostic: applies a phase-convention transform to the modal sum before it is added to the pre-modal field. Active only when source curve = flat_rew_reference."
              >
                <option value="normal">Modal convention: normal (Re, Im)</option>
                <option value="invert">Modal convention: invert (−Re, −Im) = 180°</option>
                <option value="conjugate">Modal convention: conjugate (Re, −Im)</option>
                <option value="negative_conjugate">Modal convention: −conjugate (−Re, Im)</option>
              </select>
              {/* __TEMP_DIAGNOSTIC_MODAL_H_SIGN__ — only active when flat_rew_reference is selected */}
              <select
                value={debugModalHSign}
                onChange={(e) => setDebugModalHSign(e.target.value)}
                className="h-8 rounded-md border border-rose-400 bg-rose-50 px-2 text-xs text-rose-900 font-semibold"
                aria-label="Modal H sign"
                title="Diagnostic: switches the imaginary sign of the resonator transfer function. Active only when source curve = flat_rew_reference."
              >
                <option value="normal">Modal H sign: Normal (−Im)</option>
                <option value="rew_test">Modal H sign: REW test (+Im)</option>
              </select>
              {/* __TEMP_DIAGNOSTIC_MODAL_COHERENCE__ */}
              <select
                value={modalCoherenceMode}
                onChange={(e) => setModalCoherenceMode(e.target.value)}
                className="h-8 rounded-md border border-indigo-400 bg-indigo-50 px-2 text-xs text-indigo-900 font-semibold"
                aria-label="Modal coherence mode"
                title="Diagnostic: tests whether 80–150 Hz over-prediction is caused by fully coherent modal summation."
              >
                <option value="coherent">Modal coherence: coherent</option>
                <option value="distributed">Modal coherence: distributed diagnostic ⚠️</option>
                <option value="split">Modal coherence: split diagnostic ⚠️</option>
              </select>
              {/* __TEMP_REW_PARITY_HIGH_ORDER_AXIAL_SCALE__ */}
              <select
                value={highOrderAxialScale}
                onChange={(e) => setHighOrderAxialScale(Number(e.target.value))}
                className="h-8 rounded-md border border-amber-400 bg-amber-50 px-2 text-xs text-amber-900 font-semibold"
                aria-label="High-order axial scale"
                title="Diagnostic: scales axial modes with order ≥ 2. Default 1.00 = no change."
              >
                <option value={1.00}>High-order axial scale: 1.00</option>
                <option value={0.85}>High-order axial scale: 0.85</option>
                <option value={0.70}>High-order axial scale: 0.70</option>
                <option value={0.60}>High-order axial scale: 0.60</option>
                <option value={0.50}>High-order axial scale: 0.50</option>
              </select>
              {/* __TEMP_REW_PARITY_MODAL_MAGNITUDE_SCALE__ — only active when flat_rew_reference is selected */}
              <label className="flex h-8 items-center gap-2 rounded-md border border-teal-400 bg-teal-50 px-2 text-xs text-teal-900 font-mono font-semibold" title="Scales the entire modal sum before adding to direct+reflections. Active only when source = flat_rew_reference. Tests whether parity is a magnitude issue.">
                Modal mag scale:
                <input
                  type="number"
                  min="0.25"
                  max="2.00"
                  step="0.05"
                  value={rewParityModalMagnitudeScale}
                  onChange={(e) => setRewParityModalMagnitudeScale(Math.max(0.25, Math.min(2.0, parseFloat(e.target.value) || 1.0)))}
                  className="w-16 rounded border border-teal-300 bg-white px-1 py-0.5 text-xs font-mono text-right focus:outline-none"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="flex h-8 items-center gap-1 rounded-md border border-[#DCDBD6] bg-white px-2 text-xs text-[#1B1A1A]">
                <input type="checkbox" checked={enableRewCoreReflections} onChange={(e) => setEnableRewCoreReflections(e.target.checked)} />
                Reflections
              </label>
              <label className="flex h-8 items-center gap-1 rounded-md border border-orange-300 bg-orange-50 px-2 text-xs text-orange-800 font-mono">
                Refl gain:
                <input type="number" min="0.00" max="2.00" step="0.05" value={reflectionGainScale} onChange={(e) => setReflectionGainScale(Math.max(0, Math.min(2, parseFloat(e.target.value) || 0)))} className="w-14 rounded border border-orange-300 bg-white px-1 py-0.5 text-xs font-mono text-right focus:outline-none" />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'reflections_only', label: 'Reflections only' },
                { value: 'modes_only', label: 'Modes only' },
                { value: 'direct_plus_modes', label: 'Direct + Modes' },
                { value: 'full_field', label: 'Full field' },
              ].map(({ value, label }) => (
                <button key={value} onClick={() => setRewParityFieldMode(value)} className={`h-8 px-3 rounded-md border text-xs font-mono transition-colors ${rewParityFieldMode === value ? 'bg-[#213428] text-white border-[#213428]' : 'bg-white text-[#1B1A1A] border-[#DCDBD6] hover:border-[#213428]'}`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="w-full max-w-xl rounded-md border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 text-[11px] text-[#334155] font-mono leading-5">
              <div className="font-bold text-[#1E293B]">Active model:</div>
              {(() => {
                const _isMOP =
                  (rewSourceCurveMode === 'flat_rew_reference' && rewParityFieldMode === 'full_field') ||
                  rewParityFieldMode === 'modes_only';
                return (
                  <div style={{ color: _isMOP ? '#166534' : '#991b1b', fontWeight: 700 }}>
                    isModeOnlyParity: {String(_isMOP)}
                  </div>
                );
              })()}
              <div>Source: {rewSourceCurveMode}</div>
              <div>Modal source: {modalSourceReferenceMode}{modalSourceReferenceMode === 'distance_blend' ? ` ⚠️` : ''}</div>
              {modalSourceReferenceMode === 'distance_blend' && <div style={{ color: '#b45309', fontWeight: 700 }}>Modal distance blend: {modalDistanceBlend.toFixed(2)}</div>}
              <div>Modal gain: {modalGainScalar.toFixed(1)}</div>
              {(() => {
                // Distance normalisation factor readout — mirrors the engine's distance_normalized path
                const _dnSeat = selectedSeatIds[0]
                  ? (seatingPositions || []).find(s => (s.id || `${s.x}-${s.y}`) === selectedSeatIds[0])
                  : null;
                const _dnSub = subsForSimulation[0] ?? null;
                if (!_dnSeat || !_dnSub) return null;
                const _seatZ = Number.isFinite(Number(_dnSeat.z)) ? Number(_dnSeat.z) : 1.2;
                const _dx = _dnSub.x - _dnSeat.x;
                const _dy = _dnSub.y - _dnSeat.y;
                const _dz = (_dnSub.z ?? 0.35) - _seatZ;
                const _dist = Math.sqrt(_dx*_dx + _dy*_dy + _dz*_dz);
                const _lossDb = -20 * Math.log10(Math.max(_dist, 0.01));
                const _factor = Math.pow(10, _lossDb / 20);
                const activeRefMode = modalSourceReferenceMode === 'distance_blend' ? 'distance_blend→engine:' + (modalDistanceBlend >= 1 ? 'distance_normalized' : 'existing') : modalSourceReferenceMode;
                const isDistNorm = activeRefMode === 'distance_normalized' || (modalSourceReferenceMode === 'distance_blend' && modalDistanceBlend >= 1);
                return (
                  <>
                    <div style={{ color: isDistNorm ? '#166534' : '#6b7280', fontWeight: isDistNorm ? 700 : undefined }}>
                      modalSourceReferenceMode: {activeRefMode}{isDistNorm ? '' : ' (not distance_normalized)'}
                    </div>
                    <div style={{ color: isDistNorm ? '#166534' : '#6b7280' }}>
                      distance normalisation factor: {_factor.toFixed(4)} ({_lossDb.toFixed(2)} dB @ {_dist.toFixed(3)} m)
                    </div>
                  </>
                );
              })()}
              <div>Axial Q: {axialQ.toFixed(1)}</div>
              <div>Storage: {modalStorageMode}</div>
              <div>Propagation phase scale: {propagationPhaseScale.toFixed(2)}</div>
              <div>pureDeterministicModalSum: {rewSourceCurveMode === 'flat_rew_reference' ? 'true (REW parity)' : 'false'}</div>
              <div style={{ color: simulationResults?.activeModalVectorPath === 'storedModalContrib clean path' ? '#166534' : '#92400e', fontWeight: 600 }}>
                activeModalVectorPath: {simulationResults?.activeModalVectorPath || 'not reported'}
              </div>
              <div className="mt-1">Reflections: {enableRewCoreReflections ? 'ON' : 'OFF'}</div>
              <div style={{ color: reflectionGainScale !== 1.0 ? '#b45309' : undefined, fontWeight: reflectionGainScale !== 1.0 ? 700 : undefined }}>
                Reflection gain scale: {reflectionGainScale.toFixed(2)}{reflectionGainScale !== 1.0 ? ' ⚠️' : ''}
              </div>
              <div style={{ color: debugMode200Multiplier !== 1.0 ? '#b45309' : undefined, fontWeight: debugMode200Multiplier !== 1.0 ? 700 : undefined }}>
                (2,0,0) overlay after 0.5x axial correction: {debugMode200Multiplier.toFixed(2)}{debugMode200Multiplier !== 1.0 ? ' ⚠️' : ''}
              </div>
              {debugMode200Multiplier !== 1.0 && (
                <div style={{ color: '#dc2626', fontWeight: 700, background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 4, padding: '2px 6px', marginTop: 2 }}>
                  ⛔ WARNING: (2,0,0) diagnostic multiplier is active
                </div>
              )}
              {(() => {
                const isNonDefault = rewParityFieldMode !== 'full_field';
                const isParityIsolated = rewSourceCurveMode === 'flat_rew_reference' && rewParityFieldMode === 'full_field';
                const label = `Parity isolation: ${rewParityFieldMode}${isParityIsolated ? ' → REW direct + modes only' : rewParityFieldMode === 'full_field' ? ' (true full field)' : ''}`;
                return <div style={{ color: isParityIsolated ? '#0369a1' : isNonDefault ? '#b45309' : undefined, fontWeight: isParityIsolated || isNonDefault ? 700 : undefined }}>{label}</div>;
              })()}
              {rewSourceCurveMode === 'flat_rew_reference' && rewParityFieldMode === 'full_field' && (
                <div style={{ color: '#0369a1', fontWeight: 700 }}>Reflections: suppressed for REW parity</div>
              )}
              {(() => {
                const isNonDefault = debugModalPhaseConvention !== 'normal';
                const isActive = rewSourceCurveMode === 'flat_rew_reference';
                return (
                  <div style={{ color: isNonDefault && isActive ? '#7e22ce' : isNonDefault ? '#9ca3af' : undefined, fontWeight: isNonDefault && isActive ? 700 : undefined }}>
                    Modal phase convention: {debugModalPhaseConvention}{!isActive ? ' (inactive — flat_rew_reference not selected)' : isNonDefault ? ' ⚠️' : ''}
                  </div>
                );
              })()}
              {(() => {
                const isNonDefault = debugModalHSign !== 'normal';
                const isActive = rewSourceCurveMode === 'flat_rew_reference';
                return (
                  <div style={{ color: isNonDefault && isActive ? '#be123c' : isNonDefault ? '#9ca3af' : undefined, fontWeight: isNonDefault && isActive ? 700 : undefined }}>
                    Modal H sign: {debugModalHSign}{!isActive ? ' (inactive — flat_rew_reference not selected)' : isNonDefault ? ' ⚠️' : ''}
                  </div>
                );
              })()}
              {(() => {
                const isNonDefault = modalCoherenceMode !== 'coherent';
                return (
                  <div style={{ color: isNonDefault ? '#3730a3' : undefined, fontWeight: isNonDefault ? 700 : undefined }}>
                    Modal coherence: {modalCoherenceMode}{isNonDefault ? ' ⚠️' : ''}
                  </div>
                );
              })()}
              {(() => {
                const isNonDefault = highOrderAxialScale !== 1.0;
                return (
                  <div style={{ color: isNonDefault ? '#b45309' : undefined, fontWeight: isNonDefault ? 700 : undefined }}>
                    High-order axial scale: {highOrderAxialScale.toFixed(2)}{isNonDefault ? ' ⚠️ (axial order ≥ 2 only)' : ''}
                  </div>
                );
              })()}
              {(() => {
                const isNonDefault = rewParityModalMagnitudeScale !== 1.0;
                const isActive = rewSourceCurveMode === 'flat_rew_reference';
                return (
                  <div style={{ color: isNonDefault && isActive ? '#0f766e' : isNonDefault ? '#9ca3af' : undefined, fontWeight: isNonDefault && isActive ? 700 : undefined }}>
                    Modal magnitude scale: {rewParityModalMagnitudeScale.toFixed(2)}{!isActive ? ' (inactive — flat_rew_reference not selected)' : isNonDefault ? ' ⚠️' : ''}
                  </div>
                );
              })()}

            </div>

            {/* ── Live Modal Table (first 20 modes) ── */}
            {roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM && (() => {
              const _W = Number(roomDims.widthM);
              const _L = Number(roomDims.lengthM);
              const _H = Number(roomDims.heightM);
              const _C = 343;
              const _fMax = 200;
              const _nMax = Math.ceil((_fMax / _C) * 2 * Math.max(_W, _L, _H)) + 3;
              const _modes = [];
              for (let nx = 0; nx <= _nMax && _modes.length < 60; nx++) {
                for (let ny = 0; ny <= _nMax && _modes.length < 60; ny++) {
                  for (let nz = 0; nz <= _nMax && _modes.length < 60; nz++) {
                    if (nx === 0 && ny === 0 && nz === 0) continue;
                    const freq = (_C / 2) * Math.sqrt((nx / _W) ** 2 + (ny / _L) ** 2 + (nz / _H) ** 2);
                    if (!Number.isFinite(freq) || freq <= 0 || freq > _fMax) continue;
                    const axes = (nx > 0 ? 1 : 0) + (ny > 0 ? 1 : 0) + (nz > 0 ? 1 : 0);
                    const type = axes === 1 ? 'axial' : axes === 2 ? 'tangential' : 'oblique';
                    const axisLabel = type === 'axial'
                      ? (nx > 0 ? 'width' : ny > 0 ? 'length' : 'height')
                      : '';
                    _modes.push({ nx, ny, nz, freq, type, axisLabel, order: nx + ny + nz });
                  }
                }
              }
              _modes.sort((a, b) => a.freq - b.freq);
              const top20 = _modes.slice(0, 20);
              return (
                <details style={{ marginTop: 6, borderTop: '1px solid #CBD5E1', paddingTop: 4 }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 700, color: '#334155', fontSize: 10 }}>
                    Live Modal Table — first 20 modes ({_W}×{_L}×{_H} m)
                  </summary>
                  <div style={{ overflowX: 'auto', marginTop: 4 }}>
                    <table style={{ borderCollapse: 'collapse', fontSize: 9, width: '100%' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #CBD5E1', color: '#6b7280' }}>
                          <th style={{ padding: '1px 4px', textAlign: 'right' }}>#</th>
                          <th style={{ padding: '1px 4px', textAlign: 'right' }}>nx</th>
                          <th style={{ padding: '1px 4px', textAlign: 'right' }}>ny</th>
                          <th style={{ padding: '1px 4px', textAlign: 'right' }}>nz</th>
                          <th style={{ padding: '1px 4px' }}>type</th>
                          <th style={{ padding: '1px 4px' }}>axis</th>
                          <th style={{ padding: '1px 4px', textAlign: 'right' }}>order</th>
                          <th style={{ padding: '1px 4px', textAlign: 'right' }}>Hz</th>
                        </tr>
                      </thead>
                      <tbody>
                        {top20.map((m, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', color: m.type === 'axial' ? '#1d4ed8' : m.type === 'tangential' ? '#7c3aed' : '#374151' }}>
                            <td style={{ padding: '1px 4px', textAlign: 'right', color: '#9ca3af' }}>{i + 1}</td>
                            <td style={{ padding: '1px 4px', textAlign: 'right' }}>{m.nx}</td>
                            <td style={{ padding: '1px 4px', textAlign: 'right' }}>{m.ny}</td>
                            <td style={{ padding: '1px 4px', textAlign: 'right' }}>{m.nz}</td>
                            <td style={{ padding: '1px 4px' }}>{m.type}</td>
                            <td style={{ padding: '1px 4px', color: '#64748b' }}>{m.axisLabel}</td>
                            <td style={{ padding: '1px 4px', textAlign: 'right' }}>{m.order}</td>
                            <td style={{ padding: '1px 4px', textAlign: 'right', fontWeight: 600 }}>{m.freq.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              );
            })()}

            {/* ── REW Benchmark Comparison Table ── */}
            <div style={{ marginTop: 10, borderTop: '1px solid #CBD5E1', paddingTop: 8 }}>
              <div style={{ fontWeight: 700, color: '#334155', fontSize: 11, fontFamily: 'monospace', marginBottom: 6 }}>
                REW Benchmark Comparison — seat: {selectedSeatIds[0] || '—'}
                {modalSourceReferenceMode === 'no_volume' && (
                  <span style={{ marginLeft: 8, color: '#b45309', fontSize: 10 }}>⚠️ no_volume mode active</span>
                )}
              </div>
              {multiSeries.length > 0 ? (
                <RewBenchmarkComparisonTable
                  b44Data={multiSeries[0]?.data ?? []}
                  label={`B44 dB (${modalSourceReferenceMode})`}
                />
              ) : (
                <div style={{ color: '#6b7280', fontSize: 10, fontFamily: 'monospace' }}>No simulation data — add a sub and seat.</div>
              )}
            </div>

            {/* Investigation tools moved to Deep Engine Diagnostics → ActiveParityInvestigations / ArchivedInvestigations */}
          </div>
        </div>
      )}

      {/* ── Core Parity Diagnostics (always visible) ── */}
      {IS_DEVELOPMENT_MODE && (() => {
        /* Phase at Null Region */
        const PHASE_TARGET_HZ = [70, 75, 77, 78, 80, 85];
        const stepDebugInline = simulationResults.stepDebug;
        const getStepRowAtHzInline = (rows, targetHz) => {
          if (!Array.isArray(rows) || rows.length === 0) return null;
          let best = null, bestDist = Infinity;
          for (const row of rows) {
            const hz = row?.frequencyHz ?? row?.hz ?? null;
            if (hz === null) continue;
            const dist = Math.abs(hz - targetHz);
            if (dist < bestDist) { bestDist = dist; best = row; }
          }
          return best && bestDist <= 5 ? best : null;
        };
        const radToDegInline = (r) => (r * 180) / Math.PI;
        const magToDbInline = (v) => (Number.isFinite(v) && v > 0) ? 20 * Math.log10(v) : null;
        const fmt1Inline = (v) => (v !== null && Number.isFinite(Number(v))) ? Number(v).toFixed(1) : '—';
        const fmt0Inline = (v) => (v !== null && Number.isFinite(Number(v))) ? Number(v).toFixed(0) : '—';
        const fmt3Inline = (v) => (v !== null && Number.isFinite(Number(v))) ? Number(v).toFixed(3) : '—';
        const hasPhaseData = Array.isArray(stepDebugInline) && stepDebugInline.length > 0;

        /* Layer Breakdown */
        const wcdInline = simulationResults.wholeCurveDebugRows;
        const preModalSeriesInline = wcdInline?.preModalSeries;
        const modalOnlySeriesInline = wcdInline?.modalOnlySeries;
        const postModalSeriesInline = wcdInline?.postModalSeries;
        const LAYER_TARGET_HZ = [30, 34.3, 40, 50, 58, 60, 68.6, 70, 80, 100];
        const magToDbL = (v) => (Number.isFinite(v) && v != null) ? 20 * Math.log10(Math.max(v, 1e-10)) : null;
        const getDbAtHzL = (series, targetHz) => {
          if (!Array.isArray(series) || series.length === 0) return null;
          let best = null, bestDist = Infinity;
          for (const pt of series) {
            const hz = pt.hz ?? pt.frequency ?? pt.frequencyHz;
            const dist = Math.abs((hz ?? 0) - targetHz);
            if (dist < bestDist) { bestDist = dist; best = pt; }
          }
          if (!best || bestDist > 5) return null;
          return best.db ?? best.spl ?? best.dB ?? best.splDb ?? null;
        };
        const getRowAtHzL = (rows, targetHz) => {
          if (!Array.isArray(rows)) return null;
          let best = null, bestDist = Infinity;
          for (const row of rows) {
            const hz = row.hz ?? row.frequency ?? row.freq ?? row.frequencyHz ?? row.targetHz;
            const dist = Math.abs((hz ?? 0) - targetHz);
            if (dist < bestDist) { bestDist = dist; best = row; }
          }
          return best && bestDist <= 5 ? best : null;
        };
        const fmtL = (v) => (v !== null && v !== undefined && Number.isFinite(Number(v))) ? Number(v).toFixed(1) : '—';
        const hasLayerData = preModalSeriesInline || modalOnlySeriesInline || postModalSeriesInline || (Array.isArray(wcdInline) && wcdInline.length > 0);

        return (
          <>
            {/* Phase at Null Region */}
            <div style={{ border: '1px solid #0891b2', borderRadius: 6, background: '#ecfeff', padding: '8px 10px', fontSize: 10, fontFamily: 'monospace', marginBottom: 4 }}>
              <div style={{ fontWeight: 700, color: '#0e7490', marginBottom: 4 }}>
                Phase at null region — seat: {selectedSeatIds[0] || '—'}
              </div>
              <div style={{ color: '#164e63', fontSize: 9, marginBottom: 6, fontStyle: 'italic' }}>
                Source: <code>targetVectorDebug.applicationComparison</code> — prevRe/Im = pre-modal field. modalSumRe/Im = isolated modal sum. livePostRe/Im = final summed field.
                Δ phase = modal° − pre-modal°, wrapped [−180°, +180°]. Destructive = |Δ| &gt; 135°.
              </div>
              {!hasPhaseData ? (
                <div style={{ color: '#0e7490' }}>No stepDebug data — stepDebug is only populated for TARGET_DEBUG_FREQUENCIES in the engine.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 580 }}>
                    <thead>
                     <tr style={{ borderBottom: '1px solid #a5f3fc', color: '#0e7490', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                       <th style={{ textAlign: 'right', padding: '2px 5px', minWidth: 38 }}>Hz</th>
                       <th style={{ textAlign: 'right', padding: '2px 5px', minWidth: 52 }}>Pre-modal dB</th>
                       <th style={{ textAlign: 'right', padding: '2px 5px', minWidth: 52 }}>Pre-modal °</th>
                       <th style={{ textAlign: 'right', padding: '2px 5px', minWidth: 52 }}>Modal dB</th>
                       <th style={{ textAlign: 'right', padding: '2px 5px', minWidth: 52 }}>Modal °</th>
                       <th style={{ textAlign: 'right', padding: '2px 5px', minWidth: 60 }}>Δ phase °</th>
                       <th style={{ textAlign: 'right', padding: '2px 5px', minWidth: 52 }}>Final dB</th>
                       <th style={{ textAlign: 'left',  padding: '2px 5px', minWidth: 80 }}>Verdict</th>
                       <th style={{ textAlign: 'right', padding: '2px 5px', minWidth: 58, borderLeft: '1px solid #a5f3fc', color: '#0e4f1a' }}>PRE RE</th>
                       <th style={{ textAlign: 'right', padding: '2px 5px', minWidth: 58, color: '#0e4f1a' }}>PRE IM</th>
                       <th style={{ textAlign: 'right', padding: '2px 5px', minWidth: 58, color: '#7c2d12' }}>MOD RE</th>
                       <th style={{ textAlign: 'right', padding: '2px 5px', minWidth: 58, color: '#7c2d12' }}>MOD IM</th>
                       <th style={{ textAlign: 'right', padding: '2px 5px', minWidth: 58, color: '#1c1917' }}>FINAL RE</th>
                       <th style={{ textAlign: 'right', padding: '2px 5px', minWidth: 58, color: '#1c1917' }}>FINAL IM</th>
                     </tr>
                    </thead>
                    <tbody>
                      {PHASE_TARGET_HZ.map(hz => {
                        const row = getStepRowAtHzInline(stepDebugInline, hz);
                        const ac = row?.applicationComparison ?? null;
                        const pmRe = ac?.prevRe ?? null; const pmIm = ac?.prevIm ?? null;
                        const mRe = ac?.modalSumRe ?? null; const mIm = ac?.modalSumIm ?? null;
                        const postRe = ac?.livePostRe ?? null; const postIm = ac?.livePostIm ?? null;
                        const pmMag = (pmRe !== null && pmIm !== null) ? Math.sqrt(pmRe*pmRe + pmIm*pmIm) : null;
                        const mMag = (mRe !== null && mIm !== null) ? Math.sqrt(mRe*mRe + mIm*mIm) : null;
                        const postMag = (postRe !== null && postIm !== null) ? Math.sqrt(postRe*postRe + postIm*postIm) : null;
                        const preModalDb = magToDbInline(pmMag); const modalDb = magToDbInline(mMag); const finalDb = magToDbInline(postMag);
                        const preModalPhase = (pmRe !== null && pmIm !== null) ? radToDegInline(Math.atan2(pmIm, pmRe)) : null;
                        const modalPhase = (mRe !== null && mIm !== null) ? radToDegInline(Math.atan2(mIm, mRe)) : null;
                        let phaseDiff = null;
                        if (preModalPhase !== null && modalPhase !== null) {
                          phaseDiff = modalPhase - preModalPhase;
                          while (phaseDiff > 180) phaseDiff -= 360;
                          while (phaseDiff < -180) phaseDiff += 360;
                        }
                        const noData = ac === null;
                        const verdict = (() => {
                          if (noData) return 'no data';
                          if (phaseDiff === null) return '—';
                          const absDiff = Math.abs(phaseDiff);
                          if (absDiff > 135) return '⚠ destructive';
                          if (absDiff > 90) return '~ partial cancel';
                          if (absDiff < 45) return '✓ constructive';
                          return '~ partial add';
                        })();
                        const verdictColor = verdict.startsWith('⚠') ? '#b91c1c' : verdict.startsWith('✓') ? '#15803d' : verdict === 'no data' ? '#9ca3af' : '#92400e';
                        return (
                          <tr key={hz} style={{ borderBottom: '1px solid #cffafe', background: noData ? '#f0fdfa' : undefined }}>
                            <td style={{ textAlign: 'right', padding: '1px 5px', fontWeight: 700, color: '#0c4a6e' }}>{hz}</td>
                            <td style={{ textAlign: 'right', padding: '1px 5px', color: '#0e4f1a' }}>{fmt1Inline(preModalDb)}</td>
                            <td style={{ textAlign: 'right', padding: '1px 5px', color: '#0e4f1a' }}>{fmt0Inline(preModalPhase)}</td>
                            <td style={{ textAlign: 'right', padding: '1px 5px', color: '#7c2d12' }}>{fmt1Inline(modalDb)}</td>
                            <td style={{ textAlign: 'right', padding: '1px 5px', color: '#7c2d12' }}>{fmt0Inline(modalPhase)}</td>
                            <td style={{ textAlign: 'right', padding: '1px 5px', fontWeight: 700, color: phaseDiff !== null && Math.abs(phaseDiff) > 90 ? '#b91c1c' : '#1c1917' }}>{fmt0Inline(phaseDiff)}</td>
                            <td style={{ textAlign: 'right', padding: '1px 5px', fontWeight: 700, color: '#1c1917' }}>{fmt1Inline(finalDb)}</td>
                            <td style={{ textAlign: 'left', padding: '1px 5px', color: verdictColor, fontWeight: 600 }}>{verdict}</td>
                            <td style={{ textAlign: 'right', padding: '1px 5px', borderLeft: '1px solid #cffafe', color: '#0e4f1a', fontFamily: 'monospace', fontSize: 9 }}>{fmt3Inline(ac?.prevRe ?? null)}</td>
                            <td style={{ textAlign: 'right', padding: '1px 5px', color: '#0e4f1a', fontFamily: 'monospace', fontSize: 9 }}>{fmt3Inline(ac?.prevIm ?? null)}</td>
                            <td style={{ textAlign: 'right', padding: '1px 5px', color: '#7c2d12', fontFamily: 'monospace', fontSize: 9 }}>{fmt3Inline(ac?.modalSumRe ?? null)}</td>
                            <td style={{ textAlign: 'right', padding: '1px 5px', color: '#7c2d12', fontFamily: 'monospace', fontSize: 9 }}>{fmt3Inline(ac?.modalSumIm ?? null)}</td>
                            <td style={{ textAlign: 'right', padding: '1px 5px', color: '#1c1917', fontFamily: 'monospace', fontSize: 9 }}>{fmt3Inline(ac?.livePostRe ?? null)}</td>
                            <td style={{ textAlign: 'right', padding: '1px 5px', color: '#1c1917', fontFamily: 'monospace', fontSize: 9 }}>{fmt3Inline(ac?.livePostIm ?? null)}</td>
                            </tr>
                            );
                            })}
                            </tbody>
                            </table>
                            <div style={{ marginTop: 4, color: '#0891b2', fontSize: 9, fontStyle: 'italic' }}>
                            Source: applicationComparison.modalSumRe/modalSumIm — isolated modal sum, same as used in graph.
                    stepDebug only populated for TARGET_DEBUG_FREQUENCIES in the engine (30–72 Hz range by default).
                  </div>
                </div>
              )}
            </div>

            {/* Layer Contribution Breakdown */}
            <div style={{ border: '1px solid #7c3aed', borderRadius: 6, background: '#f5f3ff', padding: '8px 10px', fontSize: 10, fontFamily: 'monospace', marginBottom: 4 }}>
              <div style={{ fontWeight: 700, color: '#5b21b6', marginBottom: 4 }}>
                Layer Contribution Breakdown — seat: {selectedSeatIds[0] || '—'}
              </div>
              {!hasLayerData ? (
                <div style={{ color: '#7c3aed' }}>No wholeCurveDebugRows data available for this seat.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 500 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #c4b5fd', color: '#5b21b6', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        <th style={{ textAlign: 'right', padding: '2px 5px', minWidth: 42 }}>Hz</th>
                        <th style={{ textAlign: 'right', padding: '2px 5px', minWidth: 50 }}>Direct</th>
                        <th style={{ textAlign: 'right', padding: '2px 5px', minWidth: 50 }}>Refl</th>
                        <th style={{ textAlign: 'right', padding: '2px 5px', minWidth: 60 }}>Pre-Modal</th>
                        <th style={{ textAlign: 'right', padding: '2px 5px', minWidth: 50 }}>Modal</th>
                        <th style={{ textAlign: 'right', padding: '2px 5px', minWidth: 50 }}>Final</th>
                        <th style={{ textAlign: 'left',  padding: '2px 5px', minWidth: 80 }}>Top mode</th>
                      </tr>
                    </thead>
                    <tbody>
                      {LAYER_TARGET_HZ.map(hz => {
                        const row = getRowAtHzL(wcdInline, hz);
                        const directDb = row?.directDb ?? row?.direct_db ?? row?.directPressureDb ?? magToDbL(row?.directMagnitude) ?? null;
                        const reflDb = row?.reflectionsDb ?? row?.reflDb ?? row?.refl_db ?? magToDbL(row?.reflectionMagnitude) ?? null;
                        const preModalDb = row?.preModalDb ?? row?.pre_modal_db ?? magToDbL(row?.preModalMagnitude) ?? getDbAtHzL(preModalSeriesInline, hz);
                        const modalDb = row?.modalDb ?? row?.modal_db ?? magToDbL(row?.modalSumMagnitude) ?? getDbAtHzL(modalOnlySeriesInline, hz);
                        const finalDb = row?.finalSplDb ?? row?.finalDb ?? row?.final_db ?? row?.splDb ?? row?.spl_db ?? getDbAtHzL(postModalSeriesInline, hz);
                        const sm = row?.strongestMode ?? row?.dominant_mode ?? row?.dominantMode ?? row?.topMode ?? null;
                        const modeLabel = sm ? (typeof sm === 'string' ? sm : (sm.label ?? sm.mode ?? `(${[sm.nx,sm.ny,sm.nz].filter(v=>v!=null).join(',')})`)) : '—';
                        return (
                          <tr key={hz} style={{ borderBottom: '1px solid #ede9fe' }}>
                            <td style={{ textAlign: 'right', padding: '1px 5px', fontWeight: 700, color: '#4c1d95' }}>{hz}</td>
                            <td style={{ textAlign: 'right', padding: '1px 5px', color: '#1e3a5f' }}>{fmtL(directDb)}</td>
                            <td style={{ textAlign: 'right', padding: '1px 5px', color: '#1e3a5f' }}>{fmtL(reflDb)}</td>
                            <td style={{ textAlign: 'right', padding: '1px 5px', color: '#0e4f1a' }}>{fmtL(preModalDb)}</td>
                            <td style={{ textAlign: 'right', padding: '1px 5px', color: '#7c2d12' }}>{fmtL(modalDb)}</td>
                            <td style={{ textAlign: 'right', padding: '1px 5px', fontWeight: 700, color: '#1c1917' }}>{fmtL(finalDb)}</td>
                            <td style={{ textAlign: 'left', padding: '1px 5px', color: '#6b21a8', fontSize: 9 }}>{modeLabel}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div style={{ marginTop: 4, color: '#7c3aed', fontSize: 9, fontStyle: 'italic' }}>
                    Pre-Modal = direct + reflections summed before modal addition. All values dBSPL.
                  </div>
                </div>
              )}
            </div>
          </>
        );
      })()}

      {/* ── Deep Engine Diagnostics (reorganised) ── */}
      {IS_DEVELOPMENT_MODE && (
        <details style={{ border: '1px solid #CBD5E1', borderRadius: 8, background: '#f8fafc', padding: '8px 10px', marginBottom: 4 }}>
          <summary style={{ fontWeight: 700, color: '#334155', fontSize: 11, fontFamily: 'monospace', cursor: 'pointer' }}>
            Deep Engine Diagnostics
          </summary>
          <div style={{ marginTop: 8 }}>

            {/* ── SECTION 1: Active REW Parity Investigation ── */}
            <div style={{ fontWeight: 700, color: '#213428', fontSize: 11, fontFamily: 'monospace', marginBottom: 8, paddingBottom: 6, borderBottom: '2px solid #213428' }}>
              Section 1 — Active REW Parity Investigation
            </div>
            {(() => {
              const activeSeat = selectedSeatIds[0]
                ? (seatingPositions || []).find(s => (s.id || `${s.x}-${s.y}`) === selectedSeatIds[0])
                : null;
              const activeSub = subsForSimulation[0] ?? null;
              return (
                <ActiveParityInvestigations
                  roomDims={roomDims}
                  seat={activeSeat}
                  sub={activeSub}
                  seatingPositions={seatingPositions}
                  subsForSimulation={subsForSimulation}
                  surfaceAbsorption={surfaceAbsorption}
                  axialQ={axialQ}
                  multiSeries={multiSeries}
                  modalSourceReferenceMode={modalSourceReferenceMode}
                  modalGainScalar={modalGainScalar}
                  modalDistanceBlend={modalDistanceBlend}
                  propagationPhaseScale={propagationPhaseScale}
                  enableRewCoreReflections={enableRewCoreReflections}
                  rewParityModalMagnitudeScale={rewParityModalMagnitudeScale}
                  debugModalPhaseConvention={debugModalPhaseConvention}
                  debugModalHSign={debugModalHSign}
                  modalCoherenceMode={modalCoherenceMode}
                  modalStorageMode={modalStorageMode}
                  disableLateField={disableLateField}
                  onPromoteRefined={(spec) => setActiveTestEngine(spec)}
                />
              );
            })()}

            {/* ── Acoustic Solver Shootout — Batch 1 ── */}
            {(() => {
              const shootoutSeat = selectedSeatIds[0]
                ? (seatingPositions || []).find(s => (s.id || `${s.x}-${s.y}`) === selectedSeatIds[0])
                : null;
              const shootoutSub = subsForSimulation[0] ?? null;
              const shootoutCurve = shootoutSub ? getSubwooferCurve(shootoutSub.modelKey) : null;
              if (!shootoutSeat || !shootoutSub || !shootoutCurve || !roomDims?.widthM) return null;
              return (
                <AcousticSolverShootoutBatch1
                  roomDims={{ widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM }}
                  seatPos={{ x: shootoutSeat.x, y: shootoutSeat.y, z: Number.isFinite(Number(shootoutSeat.z)) ? Number(shootoutSeat.z) : 1.2 }}
                  subsForSimulation={subsForSimulation}
                  subProductCurve={shootoutCurve}
                  surfaceAbsorption={surfaceAbsorption}
                  axialQ={axialQ}
                  liveProductionData={multiSeries[0]?.data ?? null}
                />
              );
            })()}

            {/* ── SECTION 2: Archived Investigations ── */}
            <div style={{ fontWeight: 700, color: '#4c1d95', fontSize: 11, fontFamily: 'monospace', margin: '16px 0 8px', paddingBottom: 6, borderBottom: '2px solid #c4b5fd' }}>
              Section 2 — Archived Investigations
            </div>
            {(() => {
              const archiveSeat = selectedSeatIds[0]
                ? (seatingPositions || []).find(s => (s.id || `${s.x}-${s.y}`) === selectedSeatIds[0])
                : null;
              const archiveSub = subsForSimulation[0] ?? null;
              const archiveSweepSettings = {
                axialQ, modalSourceReferenceMode, modalGainScalar,
                propagationPhaseScale: 0, pureDeterministicModalSum: true,
                disableModalPropagationPhase: true, modalStorageMode,
                highOrderAxialScale, rewParityModalMagnitudeScale,
                enableReflections: false, disableLateField: true, modalCoherenceMode: 'coherent',
              };
              return (
                <ArchivedInvestigations
                  roomDims={roomDims}
                  seat={archiveSeat}
                  sub={archiveSub}
                  subs={subsForSimulation}
                  seatingPositions={seatingPositions}
                  surfaceAbsorption={surfaceAbsorption}
                  axialQ={axialQ}
                  multiSeries={multiSeries}
                  simulationResults={simulationResults}
                  sweepSettings={archiveSweepSettings}
                  modalDistanceBlend={modalDistanceBlend}
                  modalSourceReferenceMode={modalSourceReferenceMode}
                  modalGainScalar={modalGainScalar}
                  disableModalPropagationPhase={disableModalPropagationPhase}
                  propagationPhaseScale={propagationPhaseScale}
                  rewSourceCurveMode={rewSourceCurveMode}
                  selectedSeatIds={selectedSeatIds}
                  subsForSimulation={subsForSimulation}
                  frontSubsCfg={frontSubsCfg}
                  enableRewCoreReflections={enableRewCoreReflections}
                  disableLateField={disableLateField}
                  modalStorageMode={modalStorageMode}
                  disableReflectionPhaseJitter={disableReflectionPhaseJitter}
                  disableReflectionCoherenceWeight={disableReflectionCoherenceWeight}
                  mute68HzAxialMode={mute68HzAxialMode}
                  debugDisableModalContribution={debugDisableModalContribution}
                />
              );
            })()}

            {/* ── Inline geometry debug panels (preserved) ── */}
      {/* __B44_SEAT_MAP_DEBUG__ */}
      {Array.isArray(seatingPositions) && seatingPositions.length > 0 && (() => {
        const debugRows = orderedSeats.map((seat) => {
          const sid = seat.id || `${seat.x}-${seat.y}`;
          const rowNum = Number(seat?.row || seat?.rowNumber) || 1;
          const rowSeatsOrdered = orderedSeats.filter(s => (Number(s?.row || s?.rowNumber) || 1) === rowNum);
          const posInRow = rowSeatsOrdered.findIndex(s => (s.id || `${s.x}-${s.y}`) === sid) + 1;
          const label = `R${rowNum}S${posInRow}`;
          const color = getSeatColor(sid);
          const isSelected = selectedSeatIds.includes(sid);
          const hasResponse = !!simulationResults.seatResponses[sid];
          return { label, sid, x: seat.x, y: seat.y, indexInRow: seat.indexInRow, isPrimary: !!seat.isPrimary, isSelected, color, hasResponse };
        });
        const firstSeriesId = multiSeries[0]?.id ?? '—';
        const allSeriesIds = multiSeries.map(s => s.id).join(', ') || '—';
        return (
          <div style={{ border: '1px solid #f97316', borderRadius: 6, background: '#fff7ed', padding: '8px 10px', fontSize: 10, fontFamily: 'monospace', marginBottom: 4 }}>
            <div style={{ fontWeight: 700, color: '#9a3412', marginBottom: 6 }}>Bass seat mapping debug</div>
            <div style={{ marginBottom: 4, color: '#7c2d12' }}><strong>orderedSeats sequence:</strong> {orderedSeats.map(s => s.id || `${s.x}-${s.y}`).join(' → ')}</div>
            <div style={{ marginBottom: 4, color: '#7c2d12' }}><strong>selectedSeatIds:</strong> [{selectedSeatIds.join(', ')}]</div>
            <div style={{ marginBottom: 4, color: '#7c2d12' }}><strong>multiSeries first id:</strong> {firstSeriesId}</div>
            <div style={{ marginBottom: 6, color: '#7c2d12' }}><strong>multiSeries all ids:</strong> [{allSeriesIds}]</div>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #fed7aa', color: '#9a3412' }}>
                  <th style={{ textAlign: 'left', padding: '1px 4px' }}>label</th>
                  <th style={{ textAlign: 'left', padding: '1px 4px' }}>id</th>
                  <th style={{ textAlign: 'right', padding: '1px 4px' }}>x</th>
                  <th style={{ textAlign: 'right', padding: '1px 4px' }}>y</th>
                  <th style={{ textAlign: 'right', padding: '1px 4px' }}>idxInRow</th>
                  <th style={{ textAlign: 'center', padding: '1px 4px' }}>MLP</th>
                  <th style={{ textAlign: 'center', padding: '1px 4px' }}>sel</th>
                  <th style={{ textAlign: 'left', padding: '1px 4px' }}>colour</th>
                  <th style={{ textAlign: 'center', padding: '1px 4px' }}>hasResp</th>
                </tr>
              </thead>
              <tbody>
                {debugRows.map(r => (
                  <tr key={r.sid} style={{ borderBottom: '1px solid #ffedd5', background: r.isSelected ? '#fef3c7' : undefined }}>
                    <td style={{ padding: '1px 4px', fontWeight: 700, color: '#9a3412' }}>{r.label}</td>
                    <td style={{ padding: '1px 4px', color: '#78350f', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.sid}</td>
                    <td style={{ textAlign: 'right', padding: '1px 4px' }}>{Number.isFinite(r.x) ? r.x.toFixed(3) : '—'}</td>
                    <td style={{ textAlign: 'right', padding: '1px 4px' }}>{Number.isFinite(r.y) ? r.y.toFixed(3) : '—'}</td>
                    <td style={{ textAlign: 'right', padding: '1px 4px' }}>{r.indexInRow ?? '—'}</td>
                    <td style={{ textAlign: 'center', padding: '1px 4px' }}>{r.isPrimary ? '✓' : ''}</td>
                    <td style={{ textAlign: 'center', padding: '1px 4px', fontWeight: r.isSelected ? 700 : 400 }}>{r.isSelected ? '●' : '○'}</td>
                    <td style={{ padding: '1px 4px' }}><span style={{ display: 'inline-block', width: 10, height: 10, background: r.color, borderRadius: 2, marginRight: 3, verticalAlign: 'middle' }} />{r.color}</td>
                    <td style={{ textAlign: 'center', padding: '1px 4px' }}>{r.hasResponse ? '✓' : '✗'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}

      {/* __B44_GEOMETRY_DEBUG__ */}
      {(() => {
        const firstSelectedId = selectedSeatIds[0] || null;
        const firstSeat = firstSelectedId ? (seatingPositions || []).find(s => (s.id || `${s.x}-${s.y}`) === firstSelectedId) : null;
        const firstSeriesSeatId = multiSeries[0]?.id ?? null;
        return (
          <div style={{ border: '1px solid #6366f1', borderRadius: 6, background: '#eef2ff', padding: '8px 10px', fontSize: 10, fontFamily: 'monospace', marginBottom: 4 }}>
            <div style={{ fontWeight: 700, color: '#4338ca', marginBottom: 6 }}>Bass runtime geometry debug</div>
            <div style={{ marginBottom: 4 }}><strong>selectedSeatIds:</strong> [{selectedSeatIds.join(', ')}]</div>
            <div style={{ marginBottom: 4 }}><strong>first graph series seat:</strong> {firstSeriesSeatId ?? '—'}</div>
            <div style={{ marginBottom: 4, borderTop: '1px solid #c7d2fe', paddingTop: 4 }}>
              <strong>seat id:</strong> {firstSeat ? (firstSeat.id || `${firstSeat.x}-${firstSeat.y}`) : '—'}<br/>
              <strong>seat x:</strong> {firstSeat ? firstSeat.x : '—'}<br/>
              <strong>seat y:</strong> {firstSeat ? firstSeat.y : '—'}<br/>
              <strong>seat z:</strong> {firstSeat ? (Number.isFinite(Number(firstSeat.z)) ? Number(firstSeat.z) : 1.2) : '—'}
            </div>
            <div style={{ marginBottom: 4, borderTop: '1px solid #c7d2fe', paddingTop: 4 }}>
              <strong>room width:</strong> {roomDims?.widthM ?? '—'}<br/>
              <strong>room length:</strong> {roomDims?.lengthM ?? '—'}<br/>
              <strong>room height:</strong> {roomDims?.heightM ?? '—'}
            </div>
            <div style={{ marginBottom: 4, borderTop: '1px solid #c7d2fe', paddingTop: 4 }}>
              <strong>subs ({subsForSimulation.length}):</strong>
              {subsForSimulation.length === 0 && <span> none</span>}
              {subsForSimulation.map((sub, i) => (
                <div key={sub.id || i} style={{ marginLeft: 8 }}>[{i}] id: {sub.id ?? '—'}, model: {sub.modelKey ?? '—'}, x: {sub.x}, y: {sub.y}, z: {sub.z ?? '—'}, gain: {sub.tuning?.gainDb ?? 0} dB, delay: {sub.tuning?.delayMs ?? 0} ms, polarity: {sub.tuning?.polarity ?? 0}°</div>
              ))}
            </div>
            <div style={{ marginBottom: 4, borderTop: '1px solid #c7d2fe', paddingTop: 4 }}>
              <strong>surface absorption:</strong><br/>
              <span style={{ marginLeft: 8 }}>front: {surfaceAbsorption.front}, back: {surfaceAbsorption.back}, left: {surfaceAbsorption.left}, right: {surfaceAbsorption.right}, ceiling: {surfaceAbsorption.ceiling}, floor: {surfaceAbsorption.floor}</span>
            </div>
            <div style={{ borderTop: '1px solid #c7d2fe', paddingTop: 4 }}>
              <strong>reflections:</strong> {String(enableRewCoreReflections)}<br/>
              <strong>modes:</strong> true<br/>
              <strong>smoothing:</strong> none<br/>
              <strong>freq min:</strong> 20 Hz<br/>
              <strong>freq max:</strong> 200 Hz
            </div>
          </div>
        );
      })()}

      {/* __B44_RUNTIME_AUDIT__ */}
      {(() => {
        const auditFirstSeatId = selectedSeatIds[0] || null;
        const auditFirstSeat = auditFirstSeatId ? (seatingPositions || []).find(s => (s.id || `${s.x}-${s.y}`) === auditFirstSeatId) : null;
        return (
          <div style={{ border: '2px solid #0ea5e9', borderRadius: 8, background: '#f0f9ff', padding: '10px 12px', fontSize: 10, fontFamily: 'monospace', marginBottom: 8 }}>
            <div style={{ fontWeight: 700, color: '#0369a1', marginBottom: 8, fontSize: 12 }}>⚡ Bass Runtime Audit Panel</div>
            <div style={{ marginBottom: 6, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 16px', color: '#0c4a6e' }}>
              <div><strong>frontSubsCfg.count:</strong> {frontSubsCfg?.count ?? 'undefined'}</div>
              <div><strong>rearSubsCfg.count:</strong> {rearSubsCfg?.count ?? 'undefined'}</div>
              <div><strong>frontSubsLive.length:</strong> {Array.isArray(frontSubsLive) ? frontSubsLive.length : 'not array'}</div>
              <div><strong>rearSubsLive.length:</strong> {Array.isArray(rearSubsLive) ? rearSubsLive.length : 'not array'}</div>
              <div><strong>autoAlignEnabled:</strong> {String(autoAlignEnabled)}</div>
              <div><strong>selectedSeatIds:</strong> [{selectedSeatIds.join(', ')}]</div>
            </div>
            <div style={{ borderTop: '1px solid #bae6fd', paddingTop: 6, marginBottom: 6, color: '#0c4a6e' }}>
              <strong>First selected seat:</strong>{' '}
              {auditFirstSeat ? `id=${auditFirstSeat.id ?? `${auditFirstSeat.x}-${auditFirstSeat.y}`}  x=${auditFirstSeat.x}  y=${auditFirstSeat.y}  z=${Number.isFinite(Number(auditFirstSeat.z)) ? Number(auditFirstSeat.z) : 1.2}` : '—'}
            </div>
            <div style={{ borderTop: '1px solid #bae6fd', paddingTop: 6, marginBottom: 6, color: '#0c4a6e' }}>
              <strong>autoAlignDelays:</strong>{' '}
              {Object.keys(autoAlignDelays).length === 0 ? '{}' : Object.entries(autoAlignDelays).map(([k, v]) => `${k}: ${Number.isFinite(v) ? v.toFixed(3) : v}ms`).join('  |  ')}
            </div>
            <div style={{ borderTop: '1px solid #bae6fd', paddingTop: 6, color: '#0c4a6e' }}>
              <strong>subsForSimulation ({subsForSimulation.length}):</strong>
              {subsForSimulation.length === 0 && <span style={{ marginLeft: 8 }}>none</span>}
              {subsForSimulation.map((sub, i) => (
                <div key={sub.id || i} style={{ border: '1px solid #bae6fd', borderRadius: 4, background: '#fff', padding: '4px 8px', marginTop: 4 }}>
                  <span style={{ fontWeight: 700, color: '#0369a1' }}>[{i}] {sub.id ?? '—'}</span>
                  {'  '}model: {sub.modelKey ?? '—'}
                  {'  '}x: {Number.isFinite(sub.x) ? sub.x.toFixed(4) : '—'}
                  {'  '}y: {Number.isFinite(sub.y) ? sub.y.toFixed(4) : '—'}
                  {'  '}z: {Number.isFinite(sub.z) ? sub.z.toFixed(4) : '—'}
                  {'  '}gainDb: {sub.tuning?.gainDb ?? 0}
                  {'  '}delayMs: {Number.isFinite(sub.tuning?.delayMs) ? sub.tuning.delayMs.toFixed(3) : 0}
                  {'  '}polarity: {sub.tuning?.polarity ?? 0}°
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* RewDebugPanel moved to ArchivedInvestigations */}

      {/* Delay optimiser moved to ArchivedInvestigations */}

      {/* REW Geometry Match Values + Alignment Audit — in Geometry & REW Import section below the graph */}

          </div>
        </details>
      )}
      {/* Deep Engine Diagnostics end */}

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
              showModeMarkers={false}
              modeMarkers={{ axial: [], tangential: [], oblique: [] }}
              linearHzAxis={false}
              rewStyleMode={true}
              yDomain={undefined}
              xDomain={[20, 200]}
              showAxialOnly={false}
              refDb={85}
              disableHighlight={false}
            />
          ) : (
            <div style={{ border: "1px solid #DCDBD6", borderRadius: 12, background: "#F8F8F7", padding: 24, color: "#3E4349", fontSize: 13, textAlign: "center" }}>
              No bass data yet. Add at least one subwoofer and one seat.
            </div>
          )}
        </div>
      </div>

      {/* ── Null Depth Audit Badge ── */}
      {multiSeries.length > 0 && multiSeries[0]?.data?.length > 0 && (
        <NullDepthAuditBadge rawData={multiSeries[0].data} />
      )}

      {/* ── Geometry & REW Import (collapsed) ── */}
      {IS_DEVELOPMENT_MODE && (
        <details style={{ border: '1px solid #0891b2', borderRadius: 8, background: '#f0f9ff', padding: '8px 10px', marginBottom: 4 }}>
          <summary style={{ fontWeight: 700, color: '#0369a1', fontSize: 11, fontFamily: 'monospace', cursor: 'pointer' }}>
            Geometry &amp; REW Import
          </summary>
          <div style={{ marginTop: 8 }}>

      {/* __REW_GEOMETRY_MATCH__ */}
      {(() => {
        const rewSeatId = selectedSeatIds[0] || null;
        const rewSeat = rewSeatId ? (seatingPositions || []).find(s => (s.id || `${s.x}-${s.y}`) === rewSeatId) : null;
        const rewSeatZ = rewSeat && Number.isFinite(Number(rewSeat.z)) ? Number(rewSeat.z) : 1.2;
        const fmt = (v, d = 4) => Number.isFinite(v) ? Number(v).toFixed(d) : '—';
        const frontSubs = subsForSimulation.filter(s => s.id?.includes('front-sub') || s.id?.includes('sub-front'));
        const rearSubs = subsForSimulation.filter(s => s.id?.includes('rear-sub') || s.id?.includes('sub-rear'));
        return (
          <div style={{ border: '2px solid #0891b2', borderRadius: 6, background: '#ecfeff', padding: '8px 10px', fontSize: 10, fontFamily: 'monospace', marginBottom: 4 }}>
            <div style={{ fontWeight: 700, color: '#0e7490', marginBottom: 6, fontSize: 11 }}>REW Geometry Match Values</div>
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontWeight: 600, color: '#155e75', marginBottom: 2 }}>Room</div>
              <div style={{ color: '#164e63' }}>widthM: {fmt(roomDims?.widthM)} &nbsp; lengthM: {fmt(roomDims?.lengthM)} &nbsp; heightM: {fmt(roomDims?.heightM)}</div>
            </div>
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontWeight: 600, color: '#155e75', marginBottom: 2 }}>Selected Seat</div>
              {rewSeat ? <div style={{ color: '#164e63' }}>id: {rewSeat.id || `${rewSeat.x}-${rewSeat.y}`} &nbsp; x: {fmt(rewSeat.x)} &nbsp; y: {fmt(rewSeat.y)} &nbsp; z: {fmt(rewSeatZ)}</div> : <div style={{ color: '#6b7280' }}>— none selected —</div>}
            </div>
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontWeight: 600, color: '#155e75', marginBottom: 2 }}>All Seats ({(seatingPositions || []).length})</div>
              {(seatingPositions || []).map((seat) => {
                const sid = seat.id || `${seat.x}-${seat.y}`;
                const sz = Number.isFinite(Number(seat.z)) ? Number(seat.z) : 1.2;
                const rowNum = Number(seat?.row || seat?.rowNumber) || 1;
                const rowSeats = orderedSeats.filter(s => (Number(s?.row || s?.rowNumber) || 1) === rowNum);
                const posInRow = rowSeats.findIndex(s => (s.id || `${s.x}-${s.y}`) === sid) + 1;
                const label = `R${rowNum}S${posInRow}`;
                return <div key={sid} style={{ color: '#164e63', paddingLeft: 8 }}>[{label}] id: {sid} &nbsp; x: {fmt(seat.x)} &nbsp; y: {fmt(seat.y)} &nbsp; z: {fmt(sz)} {seat.isPrimary ? '(MLP)' : ''}</div>;
              })}
            </div>
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontWeight: 600, color: '#155e75', marginBottom: 2 }}>Front Subs ({frontSubs.length})</div>
              {frontSubs.length === 0 ? <div style={{ color: '#6b7280', paddingLeft: 8 }}>none</div> : frontSubs.map((sub, i) => {
                const subId = sub.id;
                const isFront = subId?.includes('front-sub') || subId?.includes('sub-front');
                const cfgForSub = isFront ? frontSubsCfg : rearSubsCfg;
                const manualDelay = Number.isFinite(cfgForSub?.settingsById?.[subId]?.delayMs) ? cfgForSub.settingsById[subId].delayMs : 0;
                const autoDelay = resolveAutoDelayForSub(subId, 'front', i);
                return <div key={sub.id || i} style={{ color: '#164e63', paddingLeft: 8, marginBottom: 2 }}>id: {sub.id} &nbsp; x: {fmt(sub.x)} &nbsp; y: {fmt(sub.y)} &nbsp; z: {fmt(sub.z)} &nbsp; model: {sub.modelKey}<br/>&nbsp;&nbsp;manual delay: {fmt(manualDelay, 3)}ms &nbsp; auto delay: {fmt(autoDelay, 3)}ms &nbsp; total: {fmt(manualDelay + autoDelay, 3)}ms &nbsp; polarity: {sub.tuning?.polarity ?? 0}°</div>;
              })}
            </div>
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontWeight: 600, color: '#155e75', marginBottom: 2 }}>Rear Subs ({rearSubs.length})</div>
              {rearSubs.length === 0 ? <div style={{ color: '#6b7280', paddingLeft: 8 }}>none</div> : rearSubs.map((sub, i) => {
                const subId = sub.id;
                const manualDelay = Number.isFinite(rearSubsCfg?.settingsById?.[subId]?.delayMs) ? rearSubsCfg.settingsById[subId].delayMs : 0;
                const autoDelay = resolveAutoDelayForSub(subId, 'rear', i);
                return <div key={sub.id || i} style={{ color: '#164e63', paddingLeft: 8, marginBottom: 2 }}>id: {sub.id} &nbsp; x: {fmt(sub.x)} &nbsp; y: {fmt(sub.y)} &nbsp; z: {fmt(sub.z)} &nbsp; model: {sub.modelKey}<br/>&nbsp;&nbsp;manual delay: {fmt(manualDelay, 3)}ms &nbsp; auto delay: {fmt(autoDelay, 3)}ms &nbsp; total: {fmt(manualDelay + autoDelay, 3)}ms &nbsp; polarity: {sub.tuning?.polarity ?? 0}°</div>;
              })}
            </div>
            <div style={{ color: '#0e7490', fontStyle: 'italic', fontSize: 9, borderTop: '1px solid #a5f3fc', paddingTop: 4 }}>
              Coordinates are engine source points. Use these exact values in REW for parity testing.
            </div>
          </div>
        );
      })()}

      {/* __B44_ALIGNMENT_AUDIT__ */}
      {(() => {
        const auditMlpSeat = seatingPositions?.find(s => s.isPrimary) || seatingPositions?.[0];
        const auditMlpPoint = auditMlpSeat ? { x: auditMlpSeat.x, y: auditMlpSeat.y, z: Number.isFinite(Number(auditMlpSeat.z)) ? Number(auditMlpSeat.z) : 1.2 } : null;
        const auditSeatId = auditMlpSeat ? (auditMlpSeat.id || `${auditMlpSeat.x}-${auditMlpSeat.y}`) : '—';
        const SPEED_OF_SOUND = 343;
        const auditRoomW = Number(roomDims?.widthM) || 4.5;
        const auditRoomL = Number(roomDims?.lengthM) || 6.0;
        const auditRows = [];
        const buildRows = (cfg, group) => {
          const count = cfg?.count || 0;
          if (count === 0) return;
          const cfgPositions = Array.isArray(cfg?.positions) ? cfg.positions : [];
          const LABELS = ['left', 'right'];
          const isRear = group === 'rear';
          const defaultPositions = isRear
            ? [{ x: auditRoomW * 0.33, y: auditRoomL - 0.15 }, { x: auditRoomW * 0.67, y: auditRoomL - 0.15 }]
            : [{ x: auditRoomW * 0.33, y: 0.15 }, { x: auditRoomW * 0.67, y: 0.15 }];
          for (let i = 0; i < count; i++) {
            const subId = `${group}-sub-${LABELS[i] ?? i}`;
            const fromCfg = cfgPositions[i];
            const pos = fromCfg || defaultPositions[i];
            const posSource = fromCfg ? `${group}SubsCfg.positions[${i}]` : 'default';
            const subX = pos?.x ?? null;
            const subY = pos?.y ?? null;
            const subZ = 0.35;
            const settings = cfg?.settingsById?.[subId] || {};
            const manualDelayMs = Number.isFinite(settings.delayMs) ? settings.delayMs : 0;
            const appliedDelayMs = manualDelayMs + (autoAlignDelays[subId] ?? 0);
            let dx = null, dy = null, dz = null, distM = null, arrMs = null;
            if (auditMlpPoint && subX !== null && subY !== null) {
              dx = subX - auditMlpPoint.x; dy = subY - auditMlpPoint.y; dz = subZ - auditMlpPoint.z;
              distM = Math.sqrt(dx*dx + dy*dy + dz*dz); arrMs = (distM / SPEED_OF_SOUND) * 1000;
            }
            const uiLabel = count === 1 ? `${group.charAt(0).toUpperCase() + group.slice(1)} Sub Single` : `${group.charAt(0).toUpperCase() + group.slice(1)} Sub ${LABELS[i]?.charAt(0).toUpperCase() + LABELS[i]?.slice(1)}`;
            auditRows.push({ uiLabel, subId, group, subX, subY, subZ, dx, dy, dz, distM, arrMs, appliedDelayMs, posSource });
          }
        };
        buildRows(frontSubsCfg, 'front');
        buildRows(rearSubsCfg, 'rear');
        const fmt = (v, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : '—');
        return (
          <div style={{ border: '1px solid #dc2626', borderRadius: 6, background: '#fef2f2', padding: '8px 10px', fontSize: 10, fontFamily: 'monospace', marginBottom: 4 }}>
            <div style={{ fontWeight: 700, color: '#991b1b', marginBottom: 6 }}>Two-sub alignment geometry audit</div>
            <div style={{ marginBottom: 6, color: '#7f1d1d' }}>
              <strong>MLP seat id:</strong> {auditSeatId} &nbsp;|&nbsp;
              <strong>seat x:</strong> {auditMlpPoint ? fmt(auditMlpPoint.x) : '—'} &nbsp;
              <strong>seat y:</strong> {auditMlpPoint ? fmt(auditMlpPoint.y) : '—'} &nbsp;
              <strong>seat z:</strong> {auditMlpPoint ? fmt(auditMlpPoint.z) : '—'}
            </div>
            {auditRows.length === 0 && <div style={{ color: '#7f1d1d' }}>No active subs found.</div>}
            {auditRows.map((r, idx) => (
              <div key={r.subId} style={{ border: '1px solid #fca5a5', borderRadius: 4, background: idx % 2 === 0 ? '#fff5f5' : '#fff', padding: '5px 8px', marginBottom: 4 }}>
                <div style={{ fontWeight: 700, color: '#b91c1c', marginBottom: 3 }}>{r.uiLabel} — <span style={{ color: '#6b7280' }}>{r.subId}</span> ({r.group})</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px 12px', color: '#1c1917' }}>
                  <div><strong>sub x:</strong> {fmt(r.subX)}</div>
                  <div><strong>sub y:</strong> {fmt(r.subY)}</div>
                  <div><strong>sub z:</strong> {fmt(r.subZ)}</div>
                  <div><strong>dx:</strong> {fmt(r.dx)}</div>
                  <div><strong>dy:</strong> {fmt(r.dy)}</div>
                  <div><strong>dz:</strong> {fmt(r.dz)}</div>
                  <div><strong>distance:</strong> {fmt(r.distM, 4)} m</div>
                  <div><strong>arrival:</strong> {fmt(r.arrMs, 3)} ms</div>
                  <div><strong>applied delay:</strong> {fmt(r.appliedDelayMs, 3)} ms</div>
                  <div style={{ gridColumn: '1 / -1' }}><strong>pos source:</strong> {r.posSource}</div>
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* __REW_OVERLAY_IMPORT__ */}
      <div style={{ border: '1px solid #ea580c', borderRadius: 6, background: '#fff7ed', padding: '8px 10px', fontSize: 10, fontFamily: 'monospace', marginBottom: 4 }}>
        <div style={{ fontWeight: 700, color: '#9a3412', marginBottom: 6, fontSize: 11 }}>REW Reference Overlay</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', color: '#7c2d12' }}>
            <input type="checkbox" checked={showRewOverlay} onChange={e => setShowRewOverlay(e.target.checked)} />
            Show REW overlay
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', color: '#7c2d12' }}>
            <input type="checkbox" checked={normalizeRewOverlay} onChange={e => setNormalizeRewOverlay(e.target.checked)} />
            Normalise at 80 Hz to B44
          </label>
          <button onClick={() => setRewOverlayText('')} style={{ padding: '1px 8px', borderRadius: 4, border: '1px solid #ea580c', background: '#fff', color: '#9a3412', cursor: 'pointer', fontSize: 10 }}>Clear</button>
        </div>
        <div style={{ color: '#92400e', marginBottom: 4, fontSize: 9 }}>Paste REW export CSV below (frequency,spl — one per line, header row OK):</div>
        <textarea
          value={rewOverlayText}
          onChange={e => setRewOverlayText(e.target.value)}
          rows={6}
          placeholder={"frequency,spl\n20,92.1\n25,93.4\n30,94.8\n..."}
          style={{ width: '100%', fontFamily: 'monospace', fontSize: 10, border: '1px solid #fed7aa', borderRadius: 4, padding: '4px 6px', background: '#fff', color: '#1c1917', resize: 'vertical', boxSizing: 'border-box' }}
        />
        {rewOverlaySeries && (
          <div style={{ marginTop: 4, color: '#059669', fontSize: 9 }}>
            ✓ {rewOverlaySeries.data.length} points parsed — {rewOverlaySeries.data[0]?.frequency.toFixed(1)}–{rewOverlaySeries.data[rewOverlaySeries.data.length - 1]?.frequency.toFixed(1)} Hz
          </div>
        )}
        {rewOverlayText.trim() && !rewOverlaySeries && (
          <div style={{ marginTop: 4, color: '#dc2626', fontSize: 9 }}>⚠ Could not parse data — check format (frequency,spl per line)</div>
        )}
      </div>

          </div>
        </details>
      )}
      {/* Geometry & REW Import end */}

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