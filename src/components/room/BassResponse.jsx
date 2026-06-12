// BassResponse.jsx - Simplified bass simulation UI

import React, { useMemo, useEffect, useState, useRef } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppState } from "../AppStateProvider";
import BassGraph from "@/components/room/bass/BassGraph";
import { simulateBassAtSeats } from "@/components/bass/bassSimulationEngine";
import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine";
import { getSubwooferCurve } from "@/components/models/speakers/registry";
import SubTuningControls from "@/components/room/bass/SubTuningControls";
import RewDebugPanel from "@/components/room/bass/RewDebugPanel";
import RewParityBenchmark from "@/components/room/bass/RewParityBenchmark";
import SubwooferDelayOptimiser from "@/components/room/bass/SubwooferDelayOptimiser";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

// Development flag — set to true to re-enable all diagnostic UI panels.
// Do not delete diagnostic code; just flip this flag.
const IS_DEVELOPMENT_MODE = true;

const REW_SOURCE_CURVES = {
  product: null,
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
  // __TEMP_REW_PARITY__ flat ported reference matching REW Room Simulator ideal source (-3dB @ 20Hz)
  flat_20hz_rew_reference: [
    { hz: 15, db: 91 },
    { hz: 20, db: 94 },
    { hz: 25, db: 94 },
    { hz: 30, db: 94 },
    { hz: 40, db: 94 },
    { hz: 50, db: 94 },
    { hz: 63, db: 94 },
    { hz: 80, db: 94 },
    { hz: 100, db: 94 },
    { hz: 120, db: 94 },
    { hz: 160, db: 94 },
    { hz: 200, db: 94 },
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
  const [useRewCoreTestMode, setUseRewCoreTestMode] = useState(true);
  const [enableRewCoreReflections, setEnableRewCoreReflections] = useState(true);
  const [rewSourceCurveMode, setRewSourceCurveMode] = useState("product");
  const [modalSourceReferenceMode, setModalSourceReferenceMode] = useState("existing");
  const [modalGainScalar, setModalGainScalar] = useState(1.0);
  const [axialQ, setAxialQ] = useState(8.0);
  const [modalStorageMode, setModalStorageMode] = useState("none");
  // Temporary REW parity experiment: default changed to 1.0 to test full acoustic propagation phase.
  // Revert to 0.5 after experiment is concluded.
  const [propagationPhaseScale, setPropagationPhaseScale] = useState(1.0);
  const [disableReflectionPhaseJitter, setDisableReflectionPhaseJitter] = useState(false);
  const [disableReflectionCoherenceWeight, setDisableReflectionCoherenceWeight] = useState(false);
  const [disableLateField, setDisableLateField] = useState(false);
  const [disableModalPropagationPhase, setDisableModalPropagationPhase] = useState(false);
  const [mute68HzAxialMode, setMute68HzAxialMode] = useState(false);
  // __TEMP_DIAGNOSTIC__ debugDisableModalContribution — remove after polarity masking diagnosis
  const [debugDisableModalContribution, setDebugDisableModalContribution] = useState(false);
  const [isDraggingSub, setIsDraggingSub] = useState(false);
  const lastStablePlotRef = useRef(null);

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

        const rewResult = simulateBassResponseRewCore(
          {
            widthM: roomDims.widthM,
            lengthM: roomDims.lengthM,
            heightM: roomDims.heightM,
          },
          {
            x: seat.x,
            y: seat.y,
            z: Number.isFinite(Number(seat.z)) ? Number(seat.z) : 1.2,
          },
          sub,
          diagnosticSourceCurve,
          {
            enableReflections: enableRewCoreReflections,
            enableModes: true,
            surfaceAbsorption,
            freqMinHz: 20,
            freqMaxHz: 200,
            smoothing: 'none',
            modalSourceReferenceMode,
            modalGainScalar,
            axialQ,
            modalStorageMode,
            propagationPhaseScale: 1.0, // __TEMP_REW_PARITY_TEST__ forced to 1.0
            pureDeterministicModalSum: true, // __TEMP_REW_PARITY_TEST__ forced to true
            disableReflectionPhaseJitter,
            disableReflectionCoherenceWeight,
            disableLateField,
            disableModalPropagationPhase,
            mute68HzAxialMode,
            debugDisableModalContribution, // __TEMP_DIAGNOSTIC__ — remove after polarity masking diagnosis
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
    };
  }, [roomDims?.widthM, roomDims?.lengthM, roomDims?.heightM, seatingPositions, subsForSimulation, splConfig, roomDamping, hasNoSeats, hasNoSubs, useRewCoreTestMode, enableRewCoreReflections, rewSourceCurveMode, modalSourceReferenceMode, modalGainScalar, axialQ, modalStorageMode, propagationPhaseScale, disableReflectionPhaseJitter, disableReflectionCoherenceWeight, disableLateField, disableModalPropagationPhase, mute68HzAxialMode, surfaceAbsorptionInputs, selectedSeatIds, debugDisableModalContribution, subTuningSignature]);

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
        {IS_DEVELOPMENT_MODE && (
          <Badge className={useRewCoreTestMode ? "bg-[#213428] text-white border-[#213428]" : "bg-[#F8F8F7] text-[#1B1A1A] border-[#DCDBD6]"}>
            Engine: {useRewCoreTestMode ? "REW Core Test" : "Live Engine"}
          </Badge>
        )}
      </div>
      
      {(subWarnings?.front?.length > 0 || subWarnings?.rear?.length > 0) && (
        <Alert className="border border-[#C1B6AD] bg-[#F8F8F7] text-[#3E4349]">
          <AlertDescription className="text-sm">
            {subWarnings.front.map((w, i) => <div key={`f-${i}`}>{w}</div>)}
            {subWarnings.rear.map((w, i) => <div key={`r-${i}`}>{w}</div>)}
          </AlertDescription>
        </Alert>
      )}

      {/* Advanced REW debug — visibility only, no data changes */}
      {IS_DEVELOPMENT_MODE && useRewCoreTestMode && (
        <details style={{ border: '1px solid #CBD5E1', borderRadius: 8, background: '#f8fafc', padding: '8px 10px', marginBottom: 4 }}>
          <summary style={{ fontWeight: 700, color: '#334155', fontSize: 11, fontFamily: 'monospace', cursor: 'pointer' }}>
            Runtime geometry and seat mapping
          </summary>
          <div style={{ marginTop: 8 }}>
      {/* __B44_SEAT_MAP_DEBUG__ temporary — remove after verification */}
      {Array.isArray(seatingPositions) && seatingPositions.length > 0 && (() => {
        // Compute per-seat debug rows using same logic as pill renderer
        const debugRows = orderedSeats.map((seat, globalIdx) => {
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
            <div style={{ marginBottom: 4, color: '#7c2d12' }}>
              <strong>orderedSeats sequence:</strong> {orderedSeats.map(s => s.id || `${s.x}-${s.y}`).join(' → ')}
            </div>
            <div style={{ marginBottom: 4, color: '#7c2d12' }}>
              <strong>selectedSeatIds:</strong> [{selectedSeatIds.join(', ')}]
            </div>
            <div style={{ marginBottom: 4, color: '#7c2d12' }}>
              <strong>multiSeries first id:</strong> {firstSeriesId}
            </div>
            <div style={{ marginBottom: 6, color: '#7c2d12' }}>
              <strong>multiSeries all ids:</strong> [{allSeriesIds}]
            </div>
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
                    <td style={{ padding: '1px 4px' }}>
                      <span style={{ display: 'inline-block', width: 10, height: 10, background: r.color, borderRadius: 2, marginRight: 3, verticalAlign: 'middle' }} />
                      {r.color}
                    </td>
                    <td style={{ textAlign: 'center', padding: '1px 4px' }}>{r.hasResponse ? '✓' : '✗'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}
      {/* __B44_SEAT_MAP_DEBUG__ end */}

      {/* __B44_GEOMETRY_DEBUG__ temporary — runtime geometry parity check */}
      {(() => {
        const firstSelectedId = selectedSeatIds[0] || null;
        const firstSeat = firstSelectedId
          ? (seatingPositions || []).find(s => (s.id || `${s.x}-${s.y}`) === firstSelectedId)
          : null;
        const firstSeriesSeatId = multiSeries[0]?.id ?? null;

        return (
          <div style={{ border: '1px solid #6366f1', borderRadius: 6, background: '#eef2ff', padding: '8px 10px', fontSize: 10, fontFamily: 'monospace', marginBottom: 4 }}>
            <div style={{ fontWeight: 700, color: '#4338ca', marginBottom: 6 }}>Bass runtime geometry debug</div>

            <div style={{ marginBottom: 4 }}>
              <strong>selectedSeatIds:</strong> [{selectedSeatIds.join(', ')}]
            </div>
            <div style={{ marginBottom: 4 }}>
              <strong>first graph series seat:</strong> {firstSeriesSeatId ?? '—'}
            </div>

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
                <div key={sub.id || i} style={{ marginLeft: 8 }}>
                  [{i}] id: {sub.id ?? '—'}, model: {sub.modelKey ?? '—'}, x: {sub.x}, y: {sub.y}, z: {sub.z ?? '—'}, gain: {sub.tuning?.gainDb ?? 0} dB, delay: {sub.tuning?.delayMs ?? 0} ms, polarity: {sub.tuning?.polarity ?? 0}°
                </div>
              ))}
            </div>

            <div style={{ marginBottom: 4, borderTop: '1px solid #c7d2fe', paddingTop: 4 }}>
              <strong>surface absorption:</strong><br/>
              <span style={{ marginLeft: 8 }}>front: {surfaceAbsorption.front}, back: {surfaceAbsorption.back}, left: {surfaceAbsorption.left}, right: {surfaceAbsorption.right}, ceiling: {surfaceAbsorption.ceiling}, floor: {surfaceAbsorption.floor}</span>
            </div>

            <div style={{ borderTop: '1px solid #c7d2fe', paddingTop: 4 }}>
              <strong>reflections:</strong> {useRewCoreTestMode ? String(enableRewCoreReflections) : String(splConfig?.modesEnabled !== false)}<br/>
              <strong>modes:</strong> {useRewCoreTestMode ? 'true' : String(splConfig?.modesEnabled !== false)}<br/>
              <strong>smoothing:</strong> {useRewCoreTestMode ? 'none' : 'n/a (live engine)'}<br/>
              <strong>freq min:</strong> 20 Hz<br/>
              <strong>freq max:</strong> 200 Hz
            </div>
          </div>
        );
      })()}
      {/* __B44_GEOMETRY_DEBUG__ end */}
          </div>
        </details>
      )}

      {/* __B44_RUNTIME_AUDIT__ Temporary live state audit panel */}
      {IS_DEVELOPMENT_MODE && (() => {
        const auditFirstSeatId = selectedSeatIds[0] || null;
        const auditFirstSeat = auditFirstSeatId
          ? (seatingPositions || []).find(s => (s.id || `${s.x}-${s.y}`) === auditFirstSeatId)
          : null;
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
              {auditFirstSeat
                ? `id=${auditFirstSeat.id ?? `${auditFirstSeat.x}-${auditFirstSeat.y}`}  x=${auditFirstSeat.x}  y=${auditFirstSeat.y}  z=${Number.isFinite(Number(auditFirstSeat.z)) ? Number(auditFirstSeat.z) : 1.2}`
                : '—'}
            </div>

            <div style={{ borderTop: '1px solid #bae6fd', paddingTop: 6, marginBottom: 6, color: '#0c4a6e' }}>
              <strong>autoAlignDelays:</strong>{' '}
              {Object.keys(autoAlignDelays).length === 0
                ? '{}'
                : Object.entries(autoAlignDelays).map(([k, v]) => `${k}: ${Number.isFinite(v) ? v.toFixed(3) : v}ms`).join('  |  ')}
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
      {/* __B44_RUNTIME_AUDIT__ end */}

      {/* Bass Response Graph */}
      <div style={{ border: "1px solid #DCDBD6", borderRadius: 16, background: "#FFFFFF", padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#1B1A1A" }}>
            Bass Response
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {IS_DEVELOPMENT_MODE && <Label htmlFor="rew-core-test-toggle" className="text-xs text-[#3E4349]">Temporary REW core test</Label>}
              {IS_DEVELOPMENT_MODE && <Switch id="rew-core-test-toggle" checked={useRewCoreTestMode} onCheckedChange={setUseRewCoreTestMode} />}
              {IS_DEVELOPMENT_MODE && useRewCoreTestMode && (
                <>
                  <select
                    value={rewSourceCurveMode}
                    onChange={(event) => setRewSourceCurveMode(event.target.value)}
                    className="h-8 rounded-md border border-[#DCDBD6] bg-white px-2 text-xs text-[#1B1A1A]"
                    aria-label="REW source curve comparison"
                  >
                    <option value="product">Source curve: current product</option>
                    <option value="flat90">Source curve: flat 90 dB</option>
                    <option value="rew20HzPorted">Source curve: REW-style 20 Hz ported</option>
                    <option value="flat_20hz_rew_reference">Flat 20Hz REW reference</option>
                  </select>
                  <select
                    value={modalSourceReferenceMode}
                    onChange={(event) => setModalSourceReferenceMode(event.target.value)}
                    className="h-8 rounded-md border border-[#DCDBD6] bg-white px-2 text-xs text-[#1B1A1A]"
                    aria-label="Modal source reference comparison"
                  >
                    <option value="existing">Modal source: existing 1 m reference</option>
                    <option value="distance_normalized">Modal source: distance-normalised</option>
                    <option value="room_normalized">Modal source: room-normalised</option>
                  </select>
                  <select
                    value={modalGainScalar}
                    onChange={(event) => setModalGainScalar(Number(event.target.value))}
                    className="h-8 rounded-md border border-[#DCDBD6] bg-white px-2 text-xs text-[#1B1A1A]"
                    aria-label="Modal gain comparison"
                  >
                    <option value={1.0}>Modal gain: 1.0</option>
                    <option value={1.2}>Modal gain: 1.2</option>
                    <option value={1.4}>Modal gain: 1.4</option>
                    <option value={1.6}>Modal gain: 1.6</option>
                  </select>
                  <select
                    value={axialQ}
                    onChange={(event) => setAxialQ(Number(event.target.value))}
                    className="h-8 rounded-md border border-[#DCDBD6] bg-white px-2 text-xs text-[#1B1A1A]"
                    aria-label="Axial Q comparison"
                  >
                    <option value={8.0}>Axial Q: 8.0</option>
                    <option value={7.0}>Axial Q: 7.0</option>
                    <option value={6.5}>Axial Q: 6.5</option>
                  </select>
                  <select
                    value={modalStorageMode}
                    onChange={(event) => setModalStorageMode(event.target.value)}
                    className="h-8 rounded-md border border-[#DCDBD6] bg-white px-2 text-xs text-[#1B1A1A]"
                    aria-label="Modal storage comparison"
                  >
                    <option value="none">Modal storage: none</option>
                    <option value="light">Modal storage: light</option>
                    <option value="orderCompression">Modal storage: order compression</option>
                  </select>
                  <select
                    value={propagationPhaseScale}
                    onChange={(event) => setPropagationPhaseScale(Number(event.target.value))}
                    className="h-8 rounded-md border border-[#DCDBD6] bg-white px-2 text-xs text-[#1B1A1A]"
                    aria-label="Modal propagation phase scale comparison"
                  >
                    <option value={0.4}>Propagation phase scale: 0.40</option>
                    <option value={0.5}>Propagation phase scale: 0.50</option>
                    <option value={0.6}>Propagation phase scale: 0.60</option>
                    <option value={0.7}>Propagation phase scale: 0.70</option>
                    <option value={1.0}>Propagation phase scale: 1.00</option>
                  </select>
                </>
              )}
            </div>
            {IS_DEVELOPMENT_MODE && useRewCoreTestMode && (
              <>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <label className="flex h-8 items-center gap-1 rounded-md border border-[#DCDBD6] bg-white px-2 text-xs text-[#1B1A1A]">
                    <input
                      type="checkbox"
                      checked={enableRewCoreReflections}
                      onChange={(event) => setEnableRewCoreReflections(event.target.checked)}
                    />
                    Reflections
                  </label>
                  <label className="flex h-8 items-center gap-1 rounded-md border border-[#DCDBD6] bg-white px-2 text-xs text-[#1B1A1A]">
                    <input
                      type="checkbox"
                      checked={!disableReflectionPhaseJitter}
                      onChange={(event) => setDisableReflectionPhaseJitter(!event.target.checked)}
                    />
                    Reflection phase jitter
                  </label>
                  <label className="flex h-8 items-center gap-1 rounded-md border border-[#DCDBD6] bg-white px-2 text-xs text-[#1B1A1A]">
                    <input
                      type="checkbox"
                      checked={!disableReflectionCoherenceWeight}
                      onChange={(event) => setDisableReflectionCoherenceWeight(!event.target.checked)}
                    />
                    Reflection weighting
                  </label>
                  <label className="flex h-8 items-center gap-1 rounded-md border border-[#DCDBD6] bg-white px-2 text-xs text-[#1B1A1A]">
                    <input
                      type="checkbox"
                      checked={!disableLateField}
                      onChange={(event) => setDisableLateField(!event.target.checked)}
                    />
                    Late field
                  </label>
                  <label className="flex h-8 items-center gap-1 rounded-md border border-[#DCDBD6] bg-white px-2 text-xs text-[#1B1A1A]">
                    <input
                      type="checkbox"
                      checked={disableModalPropagationPhase}
                      onChange={(event) => setDisableModalPropagationPhase(event.target.checked)}
                    />
                    Disable modal propagation phase
                  </label>
                  <label className="flex h-8 items-center gap-1 rounded-md border border-[#DCDBD6] bg-white px-2 text-xs text-[#1B1A1A]">
                    <input
                      type="checkbox"
                      checked={mute68HzAxialMode}
                      onChange={(event) => setMute68HzAxialMode(event.target.checked)}
                    />
                    Mute 68.6 Hz mode
                  </label>
                  {/* __TEMP_DIAGNOSTIC__ debugDisableModalContribution toggle — remove after polarity masking diagnosis */}
                  <label className="flex h-8 items-center gap-1 rounded-md border border-red-300 bg-red-50 px-2 text-xs text-red-700 font-semibold">
                    <input
                      type="checkbox"
                      checked={debugDisableModalContribution}
                      onChange={(event) => setDebugDisableModalContribution(event.target.checked)}
                    />
                    Debug: disable modal contribution
                  </label>
                </div>
                <div className="w-full max-w-xl rounded-md border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 text-[11px] text-[#334155] font-mono leading-5">
                  <div className="font-bold text-[#1E293B]">Active model:</div>
                  <div>Source: {rewSourceCurveMode}</div>
                  <div>Modal source: {modalSourceReferenceMode}</div>
                  <div>Modal gain: {modalGainScalar.toFixed(1)}</div>
                  <div>Axial Q: {axialQ.toFixed(1)}</div>
                  <div>Storage: {modalStorageMode}</div>
                  <div>Propagation phase scale: {propagationPhaseScale.toFixed(2)}</div>
                  <div className="mt-1">Reflections: {enableRewCoreReflections ? 'ON' : 'OFF'}</div>
                  <div>Reflection phase jitter: {disableReflectionPhaseJitter ? 'OFF' : 'ON'}</div>
                  <div>Reflection weighting: {disableReflectionCoherenceWeight ? 'OFF' : 'ON'}</div>
                  <div>Late field: {disableLateField ? 'OFF' : 'ON'}</div>
                  <div>Modal propagation phase disabled: {disableModalPropagationPhase ? 'YES' : 'NO'}</div>
                  <div>Mute 68.6 Hz mode: {mute68HzAxialMode ? 'ON' : 'OFF'}</div>
                  {/* __TEMP_DIAGNOSTIC__ */}
                  <div style={{ color: debugDisableModalContribution ? '#dc2626' : undefined }}>
                    Debug modal OFF: {debugDisableModalContribution ? 'YES ⚠️' : 'NO'}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Seat selector pills — stacked rows, multi-select toggles */}
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
                            width: 52,
                            height: 26,
                            border: isOn ? `2px solid ${color}` : isPrimary ? "1px solid #A09386" : "1px solid #DCDBD6",
                            borderRadius: 9999,
                            fontSize: 11,
                            fontWeight: isOn ? 700 : 500,
                            background: isOn ? color : "#F6F3EE",
                            color: isOn ? "#fff" : isPrimary ? "#3E4349" : "#625143",
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            outline: "none",
                            flexShrink: 0,
                            transition: "background 0.12s, border-color 0.12s",
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

        {IS_DEVELOPMENT_MODE && (<>
          {/* __TEMP_DIAGNOSTIC__ tuning signature readout */}
          <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#6b21a8', background: '#faf5ff', border: '1px solid #d8b4fe', borderRadius: 4, padding: '3px 8px', marginBottom: 2, wordBreak: 'break-all' }}>
            Tuning sig: {subTuningSignature}
          </div>
          {/* __TEMP_DIAGNOSTIC__ getTuning lookup audit */}
          <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#6b21a8', background: '#faf5ff', border: '1px solid #d8b4fe', borderRadius: 4, padding: '3px 8px', marginBottom: 6, wordBreak: 'break-all' }}>
            {(() => {
              const frontKeys = Object.keys(frontSubsCfg?.settingsById || {});
              const rearKeys = Object.keys(rearSubsCfg?.settingsById || {});
              const lookup = subsForSimulation.map(sub => {
                const cfg = sub.id?.startsWith('front') ? frontSubsCfg : rearSubsCfg;
                const settingsById = cfg?.settingsById || {};
                const exactHit = !!settingsById[sub.id];
                const fallbackKey = !exactHit && Object.keys(settingsById).length === 1 ? Object.keys(settingsById)[0] : null;
                const keyUsed = exactHit ? sub.id : (fallbackKey ?? 'MISS');
                const resolvedSettings = settingsById[keyUsed] || {};
                return `[${sub.id}] key=${keyUsed} gain=${Number.isFinite(resolvedSettings.gainDb) ? resolvedSettings.gainDb.toFixed(1) : '0.0'}`;
              });
              return <>getTuning lookups: {lookup.length === 0 ? 'no subs' : lookup.join(' | ')} | frontKeys=[{frontKeys.join(',')}] rearKeys=[{rearKeys.join(',')}]</>;
            })()}
          </div>
        </>)}

        <div className="mt-4">
          {multiSeries.length > 0 ? (
            <BassGraph
              multiSeries={multiSeries}
              responseData={multiSeries[0]?.data ?? []}
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

      {/* __REW_GEOMETRY_MATCH__ Development-only REW parity coordinate readout */}
      {IS_DEVELOPMENT_MODE && useRewCoreTestMode && (() => {
        const rewSeatId = selectedSeatIds[0] || null;
        const rewSeat = rewSeatId
          ? (seatingPositions || []).find(s => (s.id || `${s.x}-${s.y}`) === rewSeatId)
          : null;
        const rewSeatZ = rewSeat && Number.isFinite(Number(rewSeat.z)) ? Number(rewSeat.z) : 1.2;
        const fmt = (v, d = 4) => Number.isFinite(v) ? Number(v).toFixed(d) : '—';
        const frontSubs = subsForSimulation.filter(s => s.id?.includes('front-sub') || s.id?.includes('sub-front'));
        const rearSubs = subsForSimulation.filter(s => s.id?.includes('rear-sub') || s.id?.includes('sub-rear'));
        return (
          <div style={{ border: '2px solid #0891b2', borderRadius: 6, background: '#ecfeff', padding: '8px 10px', fontSize: 10, fontFamily: 'monospace', marginBottom: 4 }}>
            <div style={{ fontWeight: 700, color: '#0e7490', marginBottom: 6, fontSize: 11 }}>REW Geometry Match Values</div>

            {/* Room */}
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontWeight: 600, color: '#155e75', marginBottom: 2 }}>Room</div>
              <div style={{ color: '#164e63' }}>widthM: {fmt(roomDims?.widthM)} &nbsp; lengthM: {fmt(roomDims?.lengthM)} &nbsp; heightM: {fmt(roomDims?.heightM)}</div>
            </div>

            {/* Selected seat */}
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontWeight: 600, color: '#155e75', marginBottom: 2 }}>Selected Seat</div>
              {rewSeat ? (
                <div style={{ color: '#164e63' }}>
                  id: {rewSeat.id || `${rewSeat.x}-${rewSeat.y}`} &nbsp; x: {fmt(rewSeat.x)} &nbsp; y: {fmt(rewSeat.y)} &nbsp; z: {fmt(rewSeatZ)}
                </div>
              ) : <div style={{ color: '#6b7280' }}>— none selected —</div>}
            </div>

            {/* All seats */}
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontWeight: 600, color: '#155e75', marginBottom: 2 }}>All Seats ({(seatingPositions || []).length})</div>
              {(seatingPositions || []).map((seat, i) => {
                const sid = seat.id || `${seat.x}-${seat.y}`;
                const sz = Number.isFinite(Number(seat.z)) ? Number(seat.z) : 1.2;
                const rowNum = Number(seat?.row || seat?.rowNumber) || 1;
                const rowSeats = orderedSeats.filter(s => (Number(s?.row || s?.rowNumber) || 1) === rowNum);
                const posInRow = rowSeats.findIndex(s => (s.id || `${s.x}-${s.y}`) === sid) + 1;
                const label = `R${rowNum}S${posInRow}`;
                return (
                  <div key={sid} style={{ color: '#164e63', paddingLeft: 8 }}>
                    [{label}] id: {sid} &nbsp; x: {fmt(seat.x)} &nbsp; y: {fmt(seat.y)} &nbsp; z: {fmt(sz)} {seat.isPrimary ? '(MLP)' : ''}
                  </div>
                );
              })}
            </div>

            {/* Front subs */}
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontWeight: 600, color: '#155e75', marginBottom: 2 }}>Front Subs ({frontSubs.length})</div>
              {frontSubs.length === 0 ? <div style={{ color: '#6b7280', paddingLeft: 8 }}>none</div> : frontSubs.map((sub, i) => {
                const subId = sub.id;
                const isFront = subId?.includes('front-sub') || subId?.includes('sub-front');
                const cfgForSub = isFront ? frontSubsCfg : rearSubsCfg;
                const manualDelay = Number.isFinite(cfgForSub?.settingsById?.[subId]?.delayMs) ? cfgForSub.settingsById[subId].delayMs : 0;
                const autoDelay = resolveAutoDelayForSub(subId, 'front', i);
                const totalDelay = manualDelay + autoDelay;
                return (
                  <div key={sub.id || i} style={{ color: '#164e63', paddingLeft: 8, marginBottom: 2 }}>
                    id: {sub.id} &nbsp; x: {fmt(sub.x)} &nbsp; y: {fmt(sub.y)} &nbsp; z: {fmt(sub.z)} &nbsp; model: {sub.modelKey}<br/>
                    &nbsp;&nbsp;manual delay: {fmt(manualDelay, 3)}ms &nbsp; auto delay: {fmt(autoDelay, 3)}ms &nbsp; total: {fmt(totalDelay, 3)}ms &nbsp; polarity: {sub.tuning?.polarity ?? 0}°
                  </div>
                );
              })}
            </div>

            {/* Rear subs */}
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontWeight: 600, color: '#155e75', marginBottom: 2 }}>Rear Subs ({rearSubs.length})</div>
              {rearSubs.length === 0 ? <div style={{ color: '#6b7280', paddingLeft: 8 }}>none</div> : rearSubs.map((sub, i) => {
                const subId = sub.id;
                const cfgForSub = rearSubsCfg;
                const manualDelay = Number.isFinite(cfgForSub?.settingsById?.[subId]?.delayMs) ? cfgForSub.settingsById[subId].delayMs : 0;
                const autoDelay = resolveAutoDelayForSub(subId, 'rear', i);
                const totalDelay = manualDelay + autoDelay;
                return (
                  <div key={sub.id || i} style={{ color: '#164e63', paddingLeft: 8, marginBottom: 2 }}>
                    id: {sub.id} &nbsp; x: {fmt(sub.x)} &nbsp; y: {fmt(sub.y)} &nbsp; z: {fmt(sub.z)} &nbsp; model: {sub.modelKey}<br/>
                    &nbsp;&nbsp;manual delay: {fmt(manualDelay, 3)}ms &nbsp; auto delay: {fmt(autoDelay, 3)}ms &nbsp; total: {fmt(totalDelay, 3)}ms &nbsp; polarity: {sub.tuning?.polarity ?? 0}°
                  </div>
                );
              })}
            </div>

            <div style={{ color: '#0e7490', fontStyle: 'italic', fontSize: 9, borderTop: '1px solid #a5f3fc', paddingTop: 4 }}>
              Coordinates are engine source points. Use these exact values in REW for parity testing.
            </div>
          </div>
        );
      })()}
      {/* __REW_GEOMETRY_MATCH__ end */}

      {/* __B44_ALIGNMENT_AUDIT__ Two-sub alignment geometry audit */}
      {IS_DEVELOPMENT_MODE && useRewCoreTestMode && (() => {
        const auditMlpSeat = seatingPositions?.find(s => s.isPrimary) || seatingPositions?.[0];
        const auditMlpPoint = auditMlpSeat
          ? { x: auditMlpSeat.x, y: auditMlpSeat.y, z: Number.isFinite(Number(auditMlpSeat.z)) ? Number(auditMlpSeat.z) : 1.2 }
          : null;
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
              dx = subX - auditMlpPoint.x;
              dy = subY - auditMlpPoint.y;
              dz = subZ - auditMlpPoint.z;
              distM = Math.sqrt(dx*dx + dy*dy + dz*dz);
              arrMs = (distM / SPEED_OF_SOUND) * 1000;
            }

            const uiLabel = count === 1
              ? `${group.charAt(0).toUpperCase() + group.slice(1)} Sub Single`
              : `${group.charAt(0).toUpperCase() + group.slice(1)} Sub ${LABELS[i]?.charAt(0).toUpperCase() + LABELS[i]?.slice(1)}`;

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
      {/* __B44_ALIGNMENT_AUDIT__ end */}

      {/* __B44_STEP_DEBUG__ temporary debug card — remove after diagnosis */}
      {IS_DEVELOPMENT_MODE && useRewCoreTestMode && (
        <RewDebugPanel
          stepDebug={simulationResults.stepDebug}
          selectedSeatIds={selectedSeatIds}
          disableModalPropagationPhase={disableModalPropagationPhase}
          propagationPhaseScale={propagationPhaseScale}
        />
      )}
      {/* __B44_STEP_DEBUG__ end */}

      {/* Development delay optimiser — read-only, no state changes */}
      {IS_DEVELOPMENT_MODE && useRewCoreTestMode && (() => {
        const optimiserSeat = seatingPositions?.find(s => s.id === selectedSeatIds[0] || `${s.x}-${s.y}` === selectedSeatIds[0]) || seatingPositions?.[0];
        
        // Extract current manual delay from the first active front sub's settings (same source as Manual Delay slider)
        const frontSettingsById = frontSubsCfg?.settingsById || {};
        const firstFrontSubId = subsForSimulation.find(s => s.id?.startsWith('front-'))?.id;
        const currentManualDelay = firstFrontSubId && Number.isFinite(frontSettingsById[firstFrontSubId]?.delayMs) 
          ? frontSettingsById[firstFrontSubId].delayMs 
          : 0;
        
        return (
          <SubwooferDelayOptimiser
            mlpSeat={optimiserSeat}
            roomDims={roomDims}
            subsForSimulation={subsForSimulation}
            rewSourceCurveMode={rewSourceCurveMode}
            REW_SOURCE_CURVES={REW_SOURCE_CURVES}
            enableRewCoreReflections={enableRewCoreReflections}
            surfaceAbsorption={surfaceAbsorption}
            modalSourceReferenceMode={modalSourceReferenceMode}
            modalGainScalar={modalGainScalar}
            axialQ={axialQ}
            modalStorageMode={modalStorageMode}
            propagationPhaseScale={propagationPhaseScale}
            disableReflectionPhaseJitter={disableReflectionPhaseJitter}
            disableReflectionCoherenceWeight={disableReflectionCoherenceWeight}
            disableLateField={disableLateField}
            disableModalPropagationPhase={disableModalPropagationPhase}
            mute68HzAxialMode={mute68HzAxialMode}
            debugDisableModalContribution={debugDisableModalContribution}
            currentManualDelay={currentManualDelay}
          />
        );
      })()}

      {/* REW Parity Benchmark — measurement layer, no physics changes */}
      {IS_DEVELOPMENT_MODE && useRewCoreTestMode && (
        <div style={{ border: '1px solid #213428', borderRadius: 8, background: '#f0fdf4', padding: 12, marginTop: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 12, color: '#213428', marginBottom: 8 }}>REW Parity Benchmark</div>
          <RewParityBenchmark
            b44Series={multiSeries[0]?.data ?? []}
            stepDebug={simulationResults.stepDebug}
            wholeCurveDebugRows={simulationResults.wholeCurveDebugRows}
            modalSourceReferenceMode={modalSourceReferenceMode}
          />
        </div>
      )}

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