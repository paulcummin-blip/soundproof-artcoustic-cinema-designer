// BassResponse.jsx - Smoothing control locations audit:
// - Line 50: rewSmoothing state declaration (now defaults to 'none')
// - Line 141: graphSmoothing derivation (forced to 1/3 when rewCompareView is ON)
// - Line 150: useEffect that tracks user smoothing choice when Compare View is OFF
// - Line 1010: useEffect for REW Compare View (does NOT touch smoothing state)
// - Lines 4169-4197: Smoothing button UI (3 buttons: None/1:48/1:3, all disabled when Compare View is ON)

import React, { useMemo, useEffect, useState, useRef, useCallback } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppState } from "../AppStateProvider";
import BassGraph from "@/components/room/bass/BassGraph";
import { simulateBassAtSeats, computeAxialModes, computeModesOnlyResponse } from "@/components/bass/bassSimulationEngine";
import { computeRoomModesResponse } from "@/components/utils/roomModesEngine";
import SubTuningControls from "@/components/room/bass/SubTuningControls";
import RewParityValidator from "@/components/room/bass/RewParityValidator";
import RewParityValidatorStrict from "@/components/room/bass/RewParityValidatorStrict";

import { Label } from "@/components/ui/label";

import { Switch } from "@/components/ui/switch";
import { getSubwooferCurve, normaliseModelKey } from "@/components/models/speakers/registry";

const brand = {
  ink:   "#1B1A1A",
  text:  "#3E4349",
  edge:  "#DCDBD6",
  bg:    "#F8F8F7",
  chip:  "#F9F9F6",
  accent:"#213428",
  sand:  "#C1B6AD",
};

// Safe dev flag (prevents crash if devMode isn't defined)
const devMode = false;

// Debug always OFF (no UI toggles)
const activeDebug = false;

// Display floor: REW-style visibility threshold (values below this are nulled, not plotted)
const DISPLAY_SPL_FLOOR_DB = -60;

// Plot floor: REW-style minimum for visual display (prevents LF crushing)
const PLOT_FLOOR_DB = 60;

// Log-spaced frequency grid generator (REW parity - smooth continuous curves)
function buildLogSpacedFreqs(fMin, fMax, pointsPerOct) {
  const freqs = [];
  const octaves = Math.log2(fMax / fMin);
  const totalPoints = Math.ceil(octaves * pointsPerOct);
  
  for (let i = 0; i <= totalPoints; i++) {
    const f = fMin * Math.pow(2, i / pointsPerOct);
    if (f > fMax) break;
    freqs.push(f); // Keep full precision (no rounding)
  }
  
  return freqs;
}

// REW-style LF pressure rise so Room-only doesn't collapse below the lowest axial.
// 6 dB/oct below lowest axial, capped at +12 dB (matches your debug label).
function applyLfPressureRiseDb(freqHz, lowestAxialHz, kDbPerOct = 6, maxDb = 12) {
  if (!Number.isFinite(freqHz) || !Number.isFinite(lowestAxialHz) || lowestAxialHz <= 0) return 0;
  if (freqHz >= lowestAxialHz) return 0;
  // octaves below lowest axial: log2(lowestAxial/f)
  const oct = Math.log2(lowestAxialHz / Math.max(1e-6, freqHz));
  const db = kDbPerOct * oct;
  return Math.min(maxDb, Math.max(0, db));
}

export default function BassResponse({ frontSubsCfg, rearSubsCfg, subWarnings, frontSubsLive, rearSubsLive }) {
  const { seatingPositions, roomDims, splConfig, setFrontSubsCfg, setRearSubsCfg, autosaveMeta, restoreAutosave, clearAutosave } = useAppState();
  const hasNoSeats = !Array.isArray(seatingPositions) || seatingPositions.length === 0;
  const totalSubCount = (frontSubsCfg?.count || 0) + (rearSubsCfg?.count || 0);
  const hasNoSubs = totalSubCount === 0;

  // Safe number conversion and formatting (MUST BE EARLY for widespread use)
  const toNum = (v) => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const fmtFixed = (v, digits = 1, fallback = "—") => {
    const n = toNum(v);
    return n === null ? fallback : n.toFixed(digits);
  };

  const dimsTxt = `${fmtFixed(roomDims?.widthM, 1)}×${fmtFixed(roomDims?.lengthM, 1)}×${fmtFixed(roomDims?.heightM, 1)} m`;

  // State declarations (must be before useMemo/useCallback that use them)
  const [autoAlignEnabled, setAutoAlignEnabled] = useState(true);
  const [tryPolarity, setTryPolarity] = useState(false);
  const [hasAutoAlignedFront, setHasAutoAlignedFront] = useState(false);
  const [hasAutoAlignedRear, setHasAutoAlignedRear] = useState(false);
  
  // Load SBIR and Room Modes from localStorage (default ON)
  const [modesEnabled, setModesEnabled] = useState(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('b44_bass_modesEnabled');
      if (saved !== null) return saved === 'true';
    }
    return true; // Default ON
  });
  
  const [rewSbirEnabled, setRewSbirEnabled] = useState(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('b44_bass_sbirEnabled');
      if (saved !== null) return saved === 'true';
    }
    return true; // Default ON
  });
  
  const [roomDamping, setRoomDamping] = useState(20);
  const [showModeMarkers, setShowModeMarkers] = useState(false);
  const [rewStyleMode, setRewStyleMode] = useState(true);
  const [rewSmoothing, setRewSmoothing] = useState('none'); // Default: no smoothing for raw view
  const [showRewModeLines, setShowRewModeLines] = useState(true);
  const [linearHzAxis, setLinearHzAxis] = useState(false);
  const [rewView, setRewView] = useState('roomOnly'); // 'roomOnly' | 'roomPlusProduct'
  const [rewRelativeView, setRewRelativeView] = useState(false); // Normalize toggle
  const [yAxisLocked, setYAxisLocked] = useState(true);
  const [yAxisDomain, setYAxisDomain] = useState(null);
  const [scaleEpoch, setScaleEpoch] = useState(0);
  const [rewCompareView, setRewCompareView] = useState(false); // REW Compare View toggle
  const [rewDisplayRefDb, setRewDisplayRefDb] = useState(90); // REW display reference level (dB)
  const [seatNudgeTest, setSeatNudgeTest] = useState(false); // Diagnostic seat nudge
  const [modalOnlyDebugView, setModalOnlyDebugView] = useState(false); // Modal-only debug view (no SBIR, no smoothing)
  const [rewPlotSeries, setRewPlotSeries] = useState('DISPLAY'); // 'RAW' | 'ENGINE' | 'DISPLAY'
  const [auditUiEnabled, setAuditUiEnabled] = useState(
    typeof globalThis !== 'undefined' && globalThis.__B44_BASS_AUDIT === true
  ); // Bass audit UI visibility
  const [auditEpoch, setAuditEpoch] = useState(0); // Force re-simulation when audit toggled
  const [modalProbeEnabled, setModalProbeEnabled] = useState(false); // Modal Probe toggle
  const [debugDisableSealedGain, setDebugDisableSealedGain] = useState(false); // Debug: disable sealed-room LF gain
  const [debugDisableNullRepair, setDebugDisableNullRepair] = useState(false); // Debug: disable null repair/fill
  const [rewStrictParity, setRewStrictParity] = useState(false); // REW Strict: disable all presentation shapers

  // Drag performance tracking
  const [isDraggingSub, setIsDraggingSub] = useState(false);
  const dragIdleTimerRef = useRef(null);
  const dragThrottleTimerRef = useRef(null);
  const dragSettleTimerRef = useRef(null);
  const lastDragUpdateRef = useRef(0);
  const calcEpochRef = useRef(0); // Request cancellation
  const yDomainBeforeDragRef = useRef(null);
  const yDomainDuringDragRef = React.useRef(null);
  const [dragYDomain, setDragYDomain] = React.useState(null);
  
  // UI safety: never let REW datasets become null (prevents "No graph data yet")
  const lastGoodRewModesAbsRef = React.useRef({ data: [], debug: { note: "init" } });
  const lastGoodRewRoomPlusAbsRef = React.useRef({ data: [], debug: { note: "init" } });
  
  // Force re-sim key that ACTUALLY triggers re-render (ref.current does not)
  const [calcEpoch, setCalcEpoch] = useState(0);
  
  // Preview positions captured during drag (throttled)
  const previewFrontSubsRef = useRef(null);
  const previewRearSubsRef = useRef(null);
  
  // Draft vs committed positions (freeze simulation during drag)
  const [committedFrontSubs, setCommittedFrontSubs] = useState(null);
  const [committedRearSubs, setCommittedRearSubs] = useState(null);
  const lastStablePlotRef = useRef(null);
  
  // Sensitivity audit refs (track previous run)
  const prevSourceSigRef = useRef(null);
  const prevFinalDbRef = useRef(null);
  const prevFreqsRef = useRef(null);
  const prevCouplingRef = useRef(null);

  // REW failure cache (prevent same-input errors from looping)
  const lastRewFailSigRef = useRef(null);
  const lastRewFailResultRef = useRef(null);
  
  // REW bounce detector (track stable run key to prevent unnecessary reruns)
  const lastRewRunKeyRef = useRef("");
  
  // Throttled debug state (prevent jumping during drag)
  const lastStableDebugRef = useRef(null);
  const lastDebugUpdateTimeRef = useRef(0);
  const isDraggingRef = useRef(false);
  
  // REW Compare baseline snapshot (captured once when Compare View is enabled)
  const rewCompareBaselineRef = useRef(null);
  
  // Per-mode excitation tracking (Part G - diagnostic overlay)
  const lastModeExcitationsRef = useRef(null);
  const [showModeExcitationDiag, setShowModeExcitationDiag] = useState(false);
  
  // Mode isolation toggle (Part H - single mode test harness)
  const [modeIsolation, setModeIsolation] = useState('off'); // 'off' | '1,0,0' | '0,1,0' | '0,0,1'
  
  // Complex eigenfunctions toggle (Part H3 - REW parity phase behaviour)
  const [complexEigenfunctions, setComplexEigenfunctions] = useState(false);
  
  // Coupling phase probe (Part HB - verify complex eigenfunctions are active)
  const [couplingProbeMode, setCouplingProbeMode] = useState('auto'); // 'auto' or '1,0,0' etc
  const [couplingProbeUseComplex, setCouplingProbeUseComplex] = useState(false);
  
  // REW-style time alignment (align all subs to MLP arrival time)
  const [rewTimeAlign, setRewTimeAlign] = useState(false);
  
  // SBIR single-reflection diagnostic (63 Hz null test)
  const [sbirDebugSingleFrontWall, setSbirDebugSingleFrontWall] = useState(false);

  // --- Auto-align loop guards (refs + signatures)
  const frontCfgRef = React.useRef(null);
  const rearCfgRef = React.useRef(null);
  const roomDimsRef = React.useRef(null);
  const seatingRef = React.useRef(null);

  const lastAutoAlignApplySigRef = React.useRef({ Front: null, Rear: null });
  const lastAutoAlignTriggerSigRef = React.useRef(null);

  const __b44SafeSig = (v) => {
    try { return JSON.stringify(v); } catch { return String(v); }
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
  
  // User's smoothing choice tracking (for restore after Compare View)
  const lastUserSmoothingRef = useRef(rewSmoothing);

  // Graph smoothing used for the plotted dataset (REW Compare can force display without mutating the user's choice)
  // MUST be defined AFTER rewSmoothing state declaration
  const graphSmoothing = rewCompareView ? "1/3" : rewSmoothing;

  // Keep refs current with latest state
  React.useEffect(() => { frontCfgRef.current = frontSubsCfg; }, [frontSubsCfg]);
  React.useEffect(() => { rearCfgRef.current = rearSubsCfg; }, [rearSubsCfg]);
  React.useEffect(() => { roomDimsRef.current = roomDims; }, [roomDims]);
  React.useEffect(() => { seatingRef.current = seatingPositions; }, [seatingPositions]);

  // Track user's smoothing choice when Compare View is OFF
  useEffect(() => {
    if (!rewCompareView) {
      lastUserSmoothingRef.current = rewSmoothing;
    }
  }, [rewCompareView, rewSmoothing]);

  // Bass Audit toggle handler
  const handleAuditToggle = (enabled) => {
    if (typeof globalThis !== 'undefined') {
      globalThis.__B44_BASS_AUDIT = enabled;
    }
    setAuditUiEnabled(enabled);
    setAuditEpoch(v => v + 1); // Force re-simulation
  };

  // Persist SBIR and Room Modes to localStorage
  useEffect(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('b44_bass_sbirEnabled', String(rewSbirEnabled));
    }
  }, [rewSbirEnabled]);
  
  useEffect(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('b44_bass_modesEnabled', String(modesEnabled));
    }
  }, [modesEnabled]);
  
  // Auto-enable Lock Y-axis when REW mode is turned ON
  React.useEffect(() => {
    if (rewStyleMode) {
      setYAxisLocked(true);
    }
  }, [rewStyleMode]);

  // Position signatures to detect in-place array mutations
  const frontLiveSig = useMemo(() => {
    const a = Array.isArray(frontSubsLive) ? frontSubsLive : [];
    return a.map((s) => {
      const p = s?.position ?? s;
      return `${fmtFixed(p?.x, 4, '0')},${fmtFixed(p?.y, 4, '0')},${fmtFixed(p?.z ?? 0, 4, '0')}`;
    }).join("|");
  }, [frontSubsLive]);

  const rearLiveSig = useMemo(() => {
    const a = Array.isArray(rearSubsLive) ? rearSubsLive : [];
    return a.map((s) => {
      const p = s?.position ?? s;
      return `${fmtFixed(p?.x, 4, '0')},${fmtFixed(p?.y, 4, '0')},${fmtFixed(p?.z ?? 0, 4, '0')}`;
    }).join("|");
  }, [rearSubsLive]);

  // Incrementing epoch to force modal recomputation when subs move
  const subPositionEpoch = useMemo(() => {
    return `${frontLiveSig}||${rearLiveSig}`;
  }, [frontLiveSig, rearLiveSig]);

  const engineCallCountRef = useRef(0);
  const [engineCallsUi, setEngineCallsUi] = useState(0);

  // Build subs array from preview positions while dragging, otherwise committed/live
  const subsForSimulation = useMemo(() => {
    // During drag: use live positions directly (refs are updated by drag handler)
    const frontInput = isDraggingSub ? frontSubsLive : (committedFrontSubs || frontSubsLive);
    const rearInput = isDraggingSub ? rearSubsLive : (committedRearSubs || rearSubsLive);

    const liveFront = Array.isArray(frontInput) ? frontInput : [];
    const liveRear = Array.isArray(rearInput) ? rearInput : [];

    // Helper to get tuning settings from config
    const getTuning = (subId, cfg) => {
      const settings = cfg?.settingsById?.[subId] || {};
      return {
        gainDb: settings.gainDb || 0,
        delayMs: settings.delayMs || 0,
        polarity: settings.polarity === 'invert' ? 180 : 0
      };
    };

    // Only use subs that actually have a position (no silent fallback defaults).
    const toSource = (s, group, idx, cfg) => {
      const p = s?.position ?? s; // support both {position:{x,y,z}} and {x,y,z}
      
      const x = Number(p?.x);
      const y = Number(p?.y);
      const z = p?.z;

      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

      const subId = s?.id ?? `${group}-sub-${idx}`;
      const tuning = getTuning(subId, cfg);

      return {
        id: subId,
        modelKey: s?.model ?? "SUB2-12",
        x,
        y,
        z: Number.isFinite(Number(z)) ? Number(z) : 0.35,
        tuning,
      };
    };

    const sources = [
      ...liveFront.map((s, i) => toSource(s, "front", i, frontSubsCfg)),
      ...liveRear.map((s, i) => toSource(s, "rear", i, rearSubsCfg)),
    ].filter(Boolean);

    return sources;
  }, [
    isDraggingSub,
    frontSubsLive,
    rearSubsLive,
    committedFrontSubs,
    committedRearSubs,
    frontSubsCfg?.settingsById,
    rearSubsCfg?.settingsById,
    roomDims?.widthM,
    roomDims?.lengthM,
    roomDims?.heightM,
  ]);

  // Run bass simulation engine
  const simulationResults = useMemo(() => {
    if (hasNoSeats || hasNoSubs || !roomDims?.widthM || !roomDims?.lengthM || !roomDims?.heightM) {
      return { seatResponses: {}, metrics: null, audit: null };
    }
    
    // Prepare debugProbe options (use first primary seat, not selectedSeat to avoid circular dep)
    const probeSeat = seatingPositions?.find(s => s.isPrimary) || seatingPositions?.[0];
    const probeSeatId = probeSeat ? (probeSeat.id || `${probeSeat.x}-${probeSeat.y}`) : "MLP";
    
    const debugProbeOptions = modalProbeEnabled ? {
      enabled: true,
      seatId: probeSeatId,
      freqsHz: [20, 30, 40, 50, 63, 80, 100],
      topModes: 8
    } : null;
    
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
        modesEnabled,
        roomDamping,
        sbirEnabled: rewSbirEnabled
      },
      options: {
        debugProbe: debugProbeOptions
      }
    });
  }, [roomDims?.widthM, roomDims?.lengthM, roomDims?.heightM, seatingPositions, subsForSimulation, splConfig, modesEnabled, roomDamping, rewSbirEnabled, hasNoSeats, hasNoSubs, auditEpoch, modalProbeEnabled]);
  
  const bassAudit = simulationResults.audit || null;
  const modeProbe = bassAudit?.modeProbe || null;

  // Find MLP seat for display (MUST BE DEFINED BEFORE ANY CODE THAT USES IT)
  const selectedSeat = useMemo(() => {
    const mlpSeat = seatingPositions?.find(s => s.isPrimary);
    const mlpId = mlpSeat ? (mlpSeat.id || `${mlpSeat.x}-${mlpSeat.y}`) : null;
    
    if (mlpId && simulationResults.seatResponses[mlpId]) {
      return {
        id: mlpId,
        isPrimary: true,
        ...simulationResults.seatResponses[mlpId]
      };
    }
    
    // Fallback to first seat
    const firstId = Object.keys(simulationResults.seatResponses)[0];
    if (firstId) {
      return {
        id: firstId,
        isPrimary: false,
        ...simulationResults.seatResponses[firstId]
      };
    }
    
    return null;
  }, [seatingPositions, simulationResults.seatResponses]);

  // Canonical analysis series: ABS + optionally smoothed, no display-only transforms
  const analysisSeriesAbs = useMemo(() => {
    if (!selectedSeat || !selectedSeat.freqsHz || !selectedSeat.splDb) {
      return [];
    }
    
    // Convert engine output to points
    const points = selectedSeat.freqsHz.map((frequency, i) => ({
      frequency,
      spl: selectedSeat.splDb[i]
    }));
    
    // Apply smoothing if enabled (same logic as display smoothing)
    const shouldSmooth = graphSmoothing && graphSmoothing !== 'none';
    if (shouldSmooth) {
      return applyRewStyleDisplaySmoothing(points, graphSmoothing);
    }
    
    return points;
  }, [selectedSeat, graphSmoothing]);
  
  // Analysis SPL array for metrics (same smoothing as plot base, absolute only)
  const analysisSplDbAbs = useMemo(() => {
    return analysisSeriesAbs.map(p => p.spl);
  }, [analysisSeriesAbs]);
  
  // Dev sanity check (parity verification)
  useEffect(() => {
    if (typeof globalThis !== 'undefined' && globalThis.__B44_LOGS) {
      if (analysisSeriesAbs.length !== (selectedSeat?.freqsHz?.length || 0)) {
        console.warn('[BASS PARITY CHECK] analysisSeriesAbs length mismatch', {
          analysis: analysisSeriesAbs.length,
          engine: selectedSeat?.freqsHz?.length
        });
      }
      
      const freqMismatch = analysisSeriesAbs.some((p, i) => 
        selectedSeat?.freqsHz?.[i] && Math.abs(p.frequency - selectedSeat.freqsHz[i]) > 0.01
      );
      
      if (freqMismatch) {
        console.warn('[BASS PARITY CHECK] Frequency array mismatch detected');
      }
    }
  }, [analysisSeriesAbs, selectedSeat]);

  // Helper: compute axial coupling for sensitivity audit (mode 1,0,0)
  const computeAxialCoupling = useCallback((source, seat, roomDims) => {
    const { widthM, lengthM, heightM } = roomDims;
    
    // Width axial (nx=1, ny=0, nz=0)
    const srcShape = Math.cos(1 * Math.PI * source.x / widthM);
    const rcvShape = Math.cos(1 * Math.PI * seat.x / widthM);
    const totalCoupling = srcShape * rcvShape;
    
    return { 
      src: srcShape, 
      rcv: rcvShape, 
      total: totalCoupling 
    };
  }, []);

  // Stable signatures for REW engine dependencies (prevent unnecessary reruns)
  const stableSeatSig = useMemo(() => {
    const seat = seatingPositions?.find(s => s.isPrimary) || seatingPositions?.[0];
    if (!seat) return "";
    
    const x = fmtFixed(seat.x, 2, '0');
    const y = fmtFixed(seat.y, 2, '0');
    const z = fmtFixed(seat.z ?? 1.2, 2, '1.2');
    
    return `${x}_${y}_${z}`;
  }, [seatingPositions]);

  const stableSubSig = useMemo(() => {
    if (!subsForSimulation || subsForSimulation.length === 0) return "";
    
    return subsForSimulation.map(s => {
      const x = fmtFixed(s.x, 2, '0');
      const y = fmtFixed(s.y, 2, '0');
      const z = fmtFixed(s.z ?? 0, 2, '0');
      const gainDb = fmtFixed(s.tuning?.gainDb ?? 0, 1, '0');
      const delayMs = fmtFixed(s.tuning?.delayMs ?? 0, 1, '0');
      const polarity = s.tuning?.polarity || 'normal';
      
      return `${x}_${y}_${z}_g${gainDb}_d${delayMs}_p${polarity}`;
    }).join('|');
  }, [subsForSimulation]);

  // --- FORCE-RECOMPUTE KEY (sub movement) ---
  // We need a stable string that changes when ANY source position/tuning changes.
  // This prevents useMemo from reusing an old engine result (the "LF locked" symptom).
  const b44Round = (v) => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : v);

  const sourcesSig = React.useMemo(() => {
    const src = Array.isArray(subsForSimulation) ? subsForSimulation : [];
    return JSON.stringify(
      src.map((s) => ({
        id: s?.id ?? "src",
        x: b44Round(s?.x),
        y: b44Round(s?.y),
        z: b44Round(s?.z),
        gain: b44Round(s?.tuning?.gainDb),
        delay: b44Round(s?.tuning?.delayMs),
        polarity: s?.tuning?.polarity ?? "normal",
      }))
    );
  }, [subsForSimulation]);

  // Compute REW-style time alignment delays (when enabled)
  const rewAlignmentDelays = useMemo(() => {
    if (!rewStyleMode || !rewTimeAlign) return {};
    
    const mlpSeat = seatingPositions?.find(s => s.isPrimary) || seatingPositions?.[0];
    if (!mlpSeat) return {};
    
    const mlpPos = { x: mlpSeat.x, y: mlpSeat.y, z: mlpSeat.z ?? 1.2 };
    const SPEED_OF_SOUND = 343; // m/s
    
    const delays = {};
    let minArrivalTime = Infinity;
    
    // First pass: compute arrival times
    const arrivalTimes = {};
    subsForSimulation.forEach(sub => {
      const dx = sub.x - mlpPos.x;
      const dy = sub.y - mlpPos.y;
      const dz = (sub.z ?? 0) - mlpPos.z;
      const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
      const arrivalTime = distance / SPEED_OF_SOUND;
      
      arrivalTimes[sub.id] = arrivalTime;
      minArrivalTime = Math.min(minArrivalTime, arrivalTime);
    });
    
    // Second pass: compute alignment delays (earliest sub = 0ms, others delayed)
    subsForSimulation.forEach(sub => {
      const alignDelayMs = (arrivalTimes[sub.id] - minArrivalTime) * 1000;
      delays[sub.id] = alignDelayMs;
    });
    
    return delays;
  }, [rewStyleMode, rewTimeAlign, seatingPositions, subsForSimulation]);

  // Initialize committed positions from props ONLY on first mount
  const isInitializedRef = useRef(false);
  useEffect(() => {
    if (!isInitializedRef.current) {
      setCommittedFrontSubs(frontSubsLive);
      setCommittedRearSubs(rearSubsLive);
      isInitializedRef.current = true;
    }
  }, []);
  
  // Update committed positions ONLY when props change while NOT dragging
  const prevIsDraggingRef = useRef(false);
  useEffect(() => {
    const wasDragging = prevIsDraggingRef.current;
    const isNowDragging = isDraggingSub;
    
    // On drag end: commit live positions
    if (wasDragging && !isNowDragging) {
      setCommittedFrontSubs(frontSubsLive);
      setCommittedRearSubs(rearSubsLive);
    }
    
    // While not dragging: track prop changes
    if (!isNowDragging && !wasDragging) {
      setCommittedFrontSubs(frontSubsLive);
      setCommittedRearSubs(rearSubsLive);
    }
    
    prevIsDraggingRef.current = isNowDragging;
  }, [frontSubsLive, rearSubsLive, isDraggingSub]);
  
  // Expose drag state controls to parent (if needed)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__B44_setIsDraggingSub = (dragging) => {
        // Throttle drag updates to 50ms (20 fps max)
        const now = Date.now();
        const timeSinceLastUpdate = now - lastDragUpdateRef.current;
        
        if (dragging) {
          // DRAG START: capture a stable Y domain synchronously (must happen BEFORE setIsDraggingSub(true))
          if (!isDraggingSub) {
            // If axis is locked in REW mode, use the locked ±30 dB window (REW-like)
            if (rewStyleMode && yAxisLocked && Number.isFinite(rewDisplayRefDb)) {
              const domain = [rewDisplayRefDb - 30, rewDisplayRefDb + 30];
              yDomainDuringDragRef.current = domain;
              setDragYDomain(domain);
            } else {
              // Otherwise capture from last stable plotted series (most stable visual result)
              const series = lastStablePlotRef.current;
              if (Array.isArray(series) && series.length > 0) {
                const vals = series
                  .map(p => p?.spl)
                  .filter(v => typeof v === "number" && Number.isFinite(v));

                if (vals.length > 0) {
                  const min = Math.min(...vals);
                  const max = Math.max(...vals);

                  const rawMin = min - 5;
                  const rawMax = max + 5;
                  const span = rawMax - rawMin;
                  const step = span <= 30 ? 5 : (span <= 60 ? 10 : 20);

                  const snappedMin = Math.floor(rawMin / step) * step;
                  const snappedMax = Math.ceil(rawMax / step) * step;

                  const domain = [snappedMin, snappedMax];
                  yDomainDuringDragRef.current = domain;
                  setDragYDomain(domain);
                } else {
                  const domain = [60, 120];
                  yDomainDuringDragRef.current = domain;
                  setDragYDomain(domain);
                }
              } else {
                const domain = [60, 120];
                yDomainDuringDragRef.current = domain;
                setDragYDomain(domain);
              }
            }
          }
          
          // Throttle drag updates
          if (timeSinceLastUpdate < 50) {
            // Too soon — schedule one trailing update if not already scheduled
            if (!dragThrottleTimerRef.current) {
              const wait = Math.max(0, 50 - timeSinceLastUpdate);
              dragThrottleTimerRef.current = setTimeout(() => {
                dragThrottleTimerRef.current = null;
                lastDragUpdateRef.current = Date.now();

                previewFrontSubsRef.current = frontSubsLive;
                previewRearSubsRef.current = rearSubsLive;

                // preview recompute tick
                setCalcEpoch(v => v + 1);
              }, wait);
            }
            return;
          }
          
          lastDragUpdateRef.current = now;
          setIsDraggingSub(true);
          
          // Capture latest live positions for preview (no heavy sim yet)
          previewFrontSubsRef.current = frontSubsLive;
          previewRearSubsRef.current = rearSubsLive;
          
          // Trigger a preview recompute (cheap profile because isDraggingSub = true)
          setCalcEpoch(v => v + 1);
          
          // Clear settle timer if user starts dragging again
          if (dragSettleTimerRef.current) {
            clearTimeout(dragSettleTimerRef.current);
            dragSettleTimerRef.current = null;
          }
        } else {
          // Drag end: start settle timer for full simulation
          setIsDraggingSub(false);
          yDomainDuringDragRef.current = null;
          setDragYDomain(null);
          
          // Clear any pending throttle timers
          if (dragThrottleTimerRef.current) {
            clearTimeout(dragThrottleTimerRef.current);
            dragThrottleTimerRef.current = null;
          }
          
          // Wait 250ms for positions to settle, then run full sim
          dragSettleTimerRef.current = setTimeout(() => {
            previewFrontSubsRef.current = null;
            previewRearSubsRef.current = null;
            
            setCalcEpoch(v => v + 1); // Force full-quality recalc (real render)
          }, 250);
        }
      };
    }
    
    return () => {
      if (dragIdleTimerRef.current) clearTimeout(dragIdleTimerRef.current);
      if (dragThrottleTimerRef.current) clearTimeout(dragThrottleTimerRef.current);
      if (dragSettleTimerRef.current) clearTimeout(dragSettleTimerRef.current);
    };
  }, [isDraggingSub, yAxisLocked, rewDisplayRefDb, frontSubsLive, rearSubsLive]);
  
  // Audit curve (no smoothing, no normalization) for sensitivity testing
  const rewModesDataAudit = useMemo(() => {
    if (!rewStyleMode || !rewCompareView) return null;

    const w = roomDims?.widthM;
    const l = roomDims?.lengthM;
    const h = roomDims?.heightM;
    if (!(Number.isFinite(w) && Number.isFinite(l) && Number.isFinite(h) && w > 0 && l > 0 && h > 0)) {
      return null;
    }

    const seat = seatingPositions?.find(s => s.isPrimary) || seatingPositions?.[0];
    if (!seat) return null;

    let seatPos = { x: seat.x, y: seat.y, z: seat.z ?? 1.2 };
    if (typeof globalThis !== 'undefined' && globalThis.__B44_BASS_DEBUG && seatNudgeTest) {
      seatPos = { ...seatPos, x: seatPos.x - 0.30 };
    }

    const sourcePositions = subsForSimulation
      .filter(s => s && Number.isFinite(s.x) && Number.isFinite(s.y))
      .map(s => ({
        x: s.x,
        y: s.y,
        z: 0.0,
        tuning: s.tuning || { gainDb: 0, delayMs: 0, polarity: 'normal' }
      }));

    if (!sourcePositions.length) return null;

    // Build signature for failure caching
    const sig = `w=${fmtFixed(w, 2)}|l=${fmtFixed(l, 2)}|h=${fmtFixed(h, 2)}|seat=${fmtFixed(seatPos.x, 2)},${fmtFixed(seatPos.y, 2)},${fmtFixed(seatPos.z, 2)}|subs=${sourcePositions.map(s => `${fmtFixed(s.x, 2)},${fmtFixed(s.y, 2)},${fmtFixed(s.z, 2)},g${fmtFixed(s.tuning?.gainDb||0, 1)},d${fmtFixed(s.tuning?.delayMs||0, 1)},p${s.tuning?.polarity||'normal'}`).join('|')}|damp=${roomDamping}`;

    // Check failure cache
    if (lastRewFailSigRef.current === sig) {
      return lastRewFailResultRef.current || null;
    }

    try {
      const result = computeRoomModesResponse({
        roomDims: { widthM: w, lengthM: l, heightM: h },
        sourcePositions,
        seatPosition: seatPos,
        fMin: 20,
        fMax: 200,
        pointsPerOct: 24,
        modeLimitHz: 200,
        q: roomDamping,
        includeAxial: true,
        includeTangential: true,
        includeOblique: true,
        includeSBIR: true,
        sbirMaxOrder: 1,
        sbirIncludeWalls: true,
        sbirIncludeFloorCeiling: true,
        rewParityMode: true,
        smoothing: 'none',
        subFloorHeight: 0.0,
        normalizeBandHz: null,
        normalizeToDb: null,
        relativeViewEnabled: false,
        surfaceAbsorption: {
          front: 0.30, back: 0.30, left: 0.30,
          right: 0.30, ceiling: 0.30, floor: 0.30,
        },
        dampingScalar: Math.max(0.5, roomDamping / 20),
        leakage: 0.05,
        subProductCurves: null,
        absoluteSplMode: false,
        componentView: 'modalPlusSbir',
        disableSealedRoomGain: false,
        disableNullRepair: true,
        sbirBlendEnabled: false,
        rewStrictParity: false,
        sbirDebugSingleFrontWall: sbirDebugSingleFrontWall
      });

      if (globalThis.__B44_BASS_AUDIT && result?.debug && Array.isArray(result.freqs)) {
        try {
          result.debug.audit40_70 = {
            coherentRawDb: Array.isArray(result.coherentRawDb)
              ? peakDipDelta(result.freqs, result.coherentRawDb, 40, 70)
              : null,

            splDb: Array.isArray(result.splDb)
              ? peakDipDelta(result.freqs, result.splDb, 40, 70)
              : null,

            splDbForPipeline: Array.isArray(result.debug?.splDbForPipeline)
              ? peakDipDelta(result.freqs, result.debug.splDbForPipeline, 40, 70)
              : null,

            splDbSchroeder: Array.isArray(result.debug?.splDbSchroeder)
              ? peakDipDelta(result.freqs, result.debug.splDbSchroeder, 40, 70)
              : null,

            splDbRepaired: Array.isArray(result.debug?.splDbRepaired)
              ? peakDipDelta(result.freqs, result.debug.splDbRepaired, 40, 70)
              : null,

            plottedDb: Array.isArray(result.plottedDb)
              ? peakDipDelta(result.freqs, result.plottedDb, 40, 70)
              : null
          };
        } catch {
          // absolute fail-safe: audit must never break rendering
        }
      }

      // Clear failure cache on success
      lastRewFailSigRef.current = null;
      lastRewFailResultRef.current = null;

      return {
        freqs: result.freqs,
        splDb: result.splDb,
        debug: result.debug
      };
    } catch (e) {
      // Cache this failure
      const failResult = {
        freqs: [],
        splDb: [],
        debug: {
          error: "computeRoomModesResponse failed (audit)",
          message: String(e?.message || e),
          sig
        }
      };
      lastRewFailSigRef.current = sig;
      lastRewFailResultRef.current = failResult;
      return failResult;
    }
  }, [rewStyleMode, rewCompareView, roomDims, seatingPositions, subsForSimulation, subPositionEpoch, roomDamping, seatNudgeTest]);

  // REW-style room-only curve (modal response with flat/generic sub)
  const rewModesDataAbs = useMemo(() => {
    if (!rewStyleMode) return null;

    const w = roomDims?.widthM;
    const l = roomDims?.lengthM;
    const h = roomDims?.heightM;
    if (!(Number.isFinite(w) && Number.isFinite(l) && Number.isFinite(h) && w > 0 && l > 0 && h > 0)) {
      return {
        data: [],
        debug: { error: "Invalid room dimensions", roomDims }
      };
    }

    const seat = seatingPositions?.find(s => s.isPrimary) || seatingPositions?.[0];
    if (!seat) {
      return {
        data: [],
        debug: { error: "No seat position found" }
      };
    }

    let seatPos = { x: seat.x, y: seat.y, z: seat.z ?? 1.2 };

    // Apply seat nudge for diagnostics (only if debug mode enabled)
    if (typeof globalThis !== 'undefined' && globalThis.__B44_BASS_DEBUG && seatNudgeTest) {
      seatPos = { ...seatPos, x: seatPos.x - 0.30 };
    }

    // Build source positions from actual subs (with REW time alignment if enabled)
    const sourcePositions = subsForSimulation
      .filter(s => s && Number.isFinite(s.x) && Number.isFinite(s.y))
      .map(s => {
        const userDelayMs = s.tuning?.delayMs || 0;
        const alignDelayMs = rewAlignmentDelays[s.id] || 0;
        const effectiveDelayMs = userDelayMs + alignDelayMs;
        
        return {
          x: s.x,
          y: s.y,
          z: 0.0,
          tuning: {
            gainDb: s.tuning?.gainDb || 0,
            delayMs: effectiveDelayMs,
            polarity: s.tuning?.polarity || 'normal'
          }
        };
      });

    if (!sourcePositions.length) {
      return {
        data: [],
        debug: { error: "No valid sub positions" }
      };
    }
    
    // Use stable signatures from outer scope
    const subSig = stableSubSig;
    const seatSig = stableSeatSig;

    // Build signature for failure caching
    const sig = `w=${fmtFixed(w, 2)}|l=${fmtFixed(l, 2)}|h=${fmtFixed(h, 2)}|seat=${seatSig}|subs=${subSig}|smooth=${graphSmoothing}|rel=${rewRelativeView?1:0}|damp=${roomDamping}`;
    
    // Build run key for bounce detection
    const runKey = `${fmtFixed(w, 2)}x${fmtFixed(l, 2)}x${fmtFixed(h, 2)}|${seatSig}|${subSig}|${graphSmoothing}|${rewRelativeView?'rel':'abs'}|d${roomDamping}`;
    
    // Bounce detector: only log when deps actually change
    if (runKey !== lastRewRunKeyRef.current) {
      if (globalThis.__B44_LOGS) console.log('[REW RUN KEY CHANGED][ROOM-ONLY]', runKey);
      lastRewRunKeyRef.current = runKey;
    }

    // Check failure cache
    if (lastRewFailSigRef.current === sig) {
      return lastRewFailResultRef.current || { data: [], debug: { error: "computeRoomModesResponse failed (cached)" } };
    }

    engineCallCountRef.current += 1;

    // [REW ENGINE RUN][ROOM-ONLY] - Audit log
    if (globalThis.__B44_LOGS) console.log('[REW ENGINE RUN][ROOM-ONLY]', {
      componentView,
      rewView,
      sig,
      engineCallCount: engineCallCountRef.current
    });

    // [BASS ENGINE INPUT CHECK] - Room-only path (only if debug enabled)
    if (typeof globalThis !== 'undefined' && globalThis.__B44_BASS_INPUT_DEBUG) {
      if (globalThis.__B44_LOGS) console.log("[BASS ENGINE INPUT CHECK - Room-only]", {
        roomDims,
        roomDimsKeys: Object.keys(roomDims || {}),
        widthM: roomDims?.widthM,
        lengthM: roomDims?.lengthM,
        heightM: roomDims?.heightM,
        rawFromAppState: roomDims,
        w, l, h,
        seatPosition: seatPos,
        sourcePositionsLength: sourcePositions?.length
      });
      if (!roomDims?.widthM || !roomDims?.lengthM || !roomDims?.heightM) {
        if (globalThis.__B44_LOGS) console.warn("[BASS ENGINE INPUT FAIL] roomDims missing — bass sim will early-return", { 
          roomDims, 
          rawSource: roomDims 
        });
      }
    }

    // Room-only = flat/generic sub response (no product curves)
    // Default to absolute SPL, optional normalize via checkbox
    let result;
    // Drag performance: use fast preview profile while dragging
    const usePreviewProfile = isDraggingSub;
    
    try {
      const currentEpoch = calcEpochRef.current;
      
      result = computeRoomModesResponse({
        roomDims: { widthM: w, lengthM: l, heightM: h },
        sourcePositions,
        seatPosition: seatPos,
        mlpPosition: seatPos,
        fMin: 20,
        fMax: 200,
        pointsPerOct: usePreviewProfile ? 30 : 24, // Preview: lower grid density for speed
        modeLimitHz: 200,
        q: roomDamping,
        includeAxial: true,
        includeTangential: true,
        includeOblique: true,
        includeSBIR: true,
        sbirMaxOrder: 1,
        sbirIncludeWalls: true,
        sbirIncludeFloorCeiling: true,
        rewParityMode: true,
        smoothing: 'none',
        subFloorHeight: 0.0,
        normalizeBandHz: null,
        normalizeToDb: null,
        relativeViewEnabled: false,
        surfaceAbsorption: {
          front: 0.30,
          back: 0.30,
          left: 0.30,
          right: 0.30,
          ceiling: 0.30,
          floor: 0.30,
        },
        dampingScalar: Math.max(0.5, roomDamping / 20),
        leakage: 0.05,
        subProductCurves: null,
        absoluteSplMode: true,
        rawEngineOutput: false,
        modeIsolation: modeIsolation !== 'off' ? modeIsolation : null,
        complexEigenfunctions: complexEigenfunctions,
        componentView: 'modalPlusSbir',
        disableSealedRoomGain: false,
        disableNullRepair: true,
        sbirBlendEnabled: false,
        rewStrictParity: false,
        isDragging: usePreviewProfile,
        calcEpoch: currentEpoch
      });
      
      // Request cancellation: NEVER return null (keeps graph alive)
      if (currentEpoch !== calcEpochRef.current) {
        return lastGoodRewModesAbsRef.current || { data: [], debug: { note: "stale-cancelled" } };
      }
    } catch (e) {
      return {
        data: [],
        debug: {
          error: "computeRoomModesResponse failed",
          message: String(e?.message || e)
        }
      };
    }

    const finiteValues = result.splDb.filter(v => isFinite(v));
    if (finiteValues.length === 0) {
      // SBIR-only fallback: if SBIR is enabled but modal is off, curve might be very quiet
      // Return minimal safe data so graph doesn't blank
      if (componentView === 'sbirOnly') {
        const fallbackData = result.freqs.map(frequency => ({ frequency, spl: null }));
        return { 
          data: fallbackData, 
          debug: { ...result.debug, note: "SBIR-only: no finite values (SBIR might be very quiet or off)" } 
        };
      }
      return { data: [], debug: { ...result.debug, error: "No finite values" } };
    }

    // Clear failure cache on success
    lastRewFailSigRef.current = null;
    lastRewFailResultRef.current = null;

    // Use plottedDb for display (smoothed if requested), coherentRawDb for audit
    const plotArray = result.plottedDb || result.splDb;
    
    // Compute lowest axial frequency for LF pressure rise
    const allModes = result.debug?.modeMarkers || [];
    const axialModes = allModes.filter(m => m.family === 'axial' && Number.isFinite(m.fHz));
    const lowestAxialHz = axialModes.length > 0 
      ? Math.min(...axialModes.map(m => m.fHz)) 
      : null;
    
    // Apply REW-style LF pressure rise to Room-only series (display layer only)
    // CRITICAL FIX: Add boost as gain term, do NOT replace the engine output
    // DEBUG: When debugDisableSealedGain is ON, bypass this display-side LF rise
    // to allow true engine LF behaviour (below lowestAxialHz) to be observed.
    const plotArrayWithLfRise = (() => {
      // If debugDisableSealedGain is true, bypass this display-side LF boost.
      // This allows the engine's internal LF handling to be observed directly.
      if (debugDisableSealedGain || !lowestAxialHz) {
        return plotArray;
      }
      
      return plotArray.map((spl, i) => {
        const freq = result.freqs[i];
        
        // Guard: preserve REW-style gaps (null/undefined/NaN stay null)
        if (!Number.isFinite(freq) || !Number.isFinite(spl)) return spl;
        
        // Above/at lowest axial: pass through unchanged
        if (freq >= lowestAxialHz) {
          return spl;
        }
        
        // Below lowest axial: ADD frequency-dependent LF pressure rise as gain term
        // This preserves the underlying position-dependent response shape
        const boostDb = applyLfPressureRiseDb(freq, lowestAxialHz, 6, 12);
        
        // ADD boost to existing SPL (preserves sub position effects)
        const withLfRiseDb = spl + boostDb;
        
        return Number.isFinite(withLfRiseDb) ? withLfRiseDb : null;
      });
    })();
    
    // Build data points (ensure strictly increasing X, no rounding, no duplicates)
    const dataPoints = result.freqs
      .map((frequency, i) => ({
        frequency, // Keep full float precision (no toFixed)
        spl: plotArrayWithLfRise[i]
      }))
      .filter((p, i, arr) => {
        // Remove duplicate frequencies (keep first occurrence)
        if (i === 0) return true;
        return p.frequency !== arr[i - 1].frequency;
      })
      .sort((a, b) => a.frequency - b.frequency); // Ensure strictly increasing
    
    const finalResult = {
      data: dataPoints,
      debug: {
        ...result.debug,
        viewMode: 'Room-only (generic sub)',
        curveType: 'Modal response + geometry',
        lowestAxialHz: Number.isFinite(lowestAxialHz) ? lowestAxialHz : null,
        lfPressureRiseApplied: lowestAxialHz ? 'ADDITIVE GAIN (preserves position sensitivity)' : 'NO (no axial modes)',
        lfReplaceActive: false, // FIXED: No longer replacing data below lowestAxialHz
        freqGridPointCount: dataPoints.length,
        freqGridMin: dataPoints.length > 0 ? dataPoints[0].frequency : null,
        freqGridMax: dataPoints.length > 0 ? dataPoints[dataPoints.length - 1].frequency : null
      },
      freqs: result.freqs,
      splDb: plotArrayWithLfRise,
      coherentRawDb: result.coherentRawDb,
      subSig,
      seatSig
    };
    
    // Cache last good dataset for UI safety (non-empty only)
    if (Array.isArray(dataPoints) && dataPoints.length > 0) {
      lastGoodRewModesAbsRef.current = finalResult;
    }
    
    return finalResult;
  }, [
    rewStyleMode, 
    roomDims?.widthM, 
    roomDims?.lengthM, 
    roomDims?.heightM, 
    stableSeatSig, 
    stableSubSig, 
    subPositionEpoch, 
    roomDamping, 
    graphSmoothing, 
    rewRelativeView, 
    modeIsolation, 
    complexEigenfunctions, 
    componentView, 
    rewSmoothing,
    debugDisableSealedGain, // Include debug toggle to gate display-side LF rise
    isDraggingSub, // Include drag state
    calcEpoch, // Include calc epoch for request cancellation
    sourcesSig // FORCE-RECOMPUTE: changes when sub position/tuning changes
  ]);

  // Helper: get subwoofer anechoic response curve (anechoic FR), interpolated to freqs[]
  const getSubAnechoicResponseDb = (modelKey, freqs) => {
    try {
      const key = normaliseModelKey ? normaliseModelKey(modelKey) : modelKey;
      const curve = getSubwooferCurve ? getSubwooferCurve(key) : null;

      if (!Array.isArray(curve) || curve.length < 2) return null;

      // Normalise curve point format -> { hz, db }
      const pts = curve
        .map(p => {
          const hz = p?.hz ?? p?.frequency ?? (Array.isArray(p) ? p[0] : undefined);
          const db = p?.db ?? p?.spl ?? (Array.isArray(p) ? p[1] : undefined);
          return { hz: Number(hz), db: Number(db) };
        })
        .filter(p => Number.isFinite(p.hz) && Number.isFinite(p.db))
        .sort((a, b) => a.hz - b.hz);

      if (pts.length < 2) return null;

      // Linear interpolation in dB vs Hz (good enough for v1)
      const out = freqs.map(f => {
        const F = Number(f);
        if (!Number.isFinite(F)) return 0;

        // Clamp outside range
        if (F <= pts[0].hz) return pts[0].db;
        if (F >= pts[pts.length - 1].hz) return pts[pts.length - 1].db;

        // Find bracket
        let lo = pts[0], hi = pts[pts.length - 1];
        for (let i = 0; i < pts.length - 1; i++) {
          if (pts[i].hz <= F && F <= pts[i + 1].hz) {
            lo = pts[i];
            hi = pts[i + 1];
            break;
          }
        }

        const t = (F - lo.hz) / Math.max(1e-9, (hi.hz - lo.hz));
        return lo.db + (hi.db - lo.db) * t;
      });

      return out;
    } catch (err) {
      if (globalThis.__B44_LOGS) console.warn("[getSubAnechoicResponseDb] Failed", modelKey, err);
      return null;
    }
  };

  // REW-style room + product curve (apply actual sub response before room interaction)
  const rewRoomPlusProductDataAbs = useMemo(() => {
    if (!rewStyleMode || rewView !== 'roomPlusProduct') return null;

    const w = roomDims?.widthM;
    const l = roomDims?.lengthM;
    const h = roomDims?.heightM;
    if (!(Number.isFinite(w) && Number.isFinite(l) && Number.isFinite(h) && w > 0 && l > 0 && h > 0)) {
      return { data: [], debug: { error: "Invalid room dimensions" } };
    }

    const seat = seatingPositions?.find(s => s.isPrimary) || seatingPositions?.[0];
    if (!seat) {
      return { data: [], debug: { error: "No seat position" } };
    }

    const seatPos = { x: seat.x, y: seat.y, z: seat.z ?? 1.2 };

    // Build source positions (with REW time alignment if enabled)
    const sourcePositions = subsForSimulation
      .filter(s => s && Number.isFinite(s.x) && Number.isFinite(s.y))
      .map(s => {
        const userDelayMs = s.tuning?.delayMs || 0;
        const alignDelayMs = rewAlignmentDelays[s.id] || 0;
        const effectiveDelayMs = userDelayMs + alignDelayMs;
        
        return {
          x: s.x,
          y: s.y,
          z: 0.0,
          tuning: {
            gainDb: s.tuning?.gainDb || 0,
            delayMs: effectiveDelayMs,
            polarity: s.tuning?.polarity || 'normal'
          }
        };
      });

    if (!sourcePositions.length) {
      return { data: [], debug: { error: "No valid sub positions" } };
    }
    
    // Use stable signatures from outer scope
    const subSig = stableSubSig;
    const seatSig = stableSeatSig;

    // Build signature for failure caching
    const sig = `w=${fmtFixed(w, 2)}|l=${fmtFixed(l, 2)}|h=${fmtFixed(h, 2)}|seat=${seatSig}|subs=${subSig}|smooth=${graphSmoothing}|rel=${rewRelativeView ? 1 : 0}|damp=${roomDamping}|view=product`;
    
    // Build run key for bounce detection
    const runKey = `${fmtFixed(w, 2)}x${fmtFixed(l, 2)}x${fmtFixed(h, 2)}|${seatSig}|${subSig}|${graphSmoothing}|${rewRelativeView?'rel':'abs'}|d${roomDamping}|view:product`;
    
    // Bounce detector: only log when deps actually change
    if (runKey !== lastRewRunKeyRef.current) {
      if (globalThis.__B44_LOGS) console.log('[REW RUN KEY CHANGED][ROOM+PRODUCT]', runKey);
      lastRewRunKeyRef.current = runKey;
    }

    // Check failure cache
    if (lastRewFailSigRef.current === sig) {
      return lastRewFailResultRef.current || { data: [], debug: { error: "computeRoomModesResponse failed (cached)" } };
    }

    // Generate log-spaced frequency axis (REW parity - smooth curves)
    // 1/48 octave spacing gives ~400 points from 10-200 Hz
    const freqs = buildLogSpacedFreqs(10, 200, 48);

    // Get product curves for each sub and normalize to relative gain
    const subProductCurves = [];
    let productDataFound = false;
    const productCurveDebug = [];

    for (const sub of subsForSimulation) {
      if (!sub?.modelKey) {
        subProductCurves.push(null);
        continue;
      }

      const curveDb = getSubAnechoicResponseDb(sub.modelKey, freqs);
      if (curveDb && curveDb.length === freqs.length) {
        // Find value at 50 Hz (or nearest bin)
        const idx50 = freqs.findIndex(f => f >= 50);
        const valueAt50Hz = idx50 >= 0 ? curveDb[idx50] : null;

        // Make curve relative by subtracting 50 Hz value (normalize to 0 dB at 50 Hz)
        const relativeCurve = curveDb.map(db => db - (valueAt50Hz || 0));

        // Collect debug info
        const finite = relativeCurve.filter(v => Number.isFinite(v));
        const minDb = finite.length > 0 ? Math.min(...finite) : 0;
        const maxDb = finite.length > 0 ? Math.max(...finite) : 0;
        const isRelative = Math.abs(valueAt50Hz || 0) < 5; // Check if original was already ~0 dB centered

        productCurveDebug.push({
          modelKey: sub.modelKey,
          originalAt50Hz: fmtFixed(valueAt50Hz, 1, 'N/A'),
          relativeMinDb: fmtFixed(minDb, 1),
          relativeMaxDb: fmtFixed(maxDb, 1),
          isRelative
        });

        subProductCurves.push(relativeCurve);
        productDataFound = true;
      } else {
        subProductCurves.push(null);
      }
    }

    if (!productDataFound) {
      return {
        data: rewModesData?.data || [],
        debug: {
          ...(rewModesData?.debug || {}),
          productNote: "No anechoic data for selected sub model(s) — Room + Product will match Room-only.",
          viewMode: 'Room + Product (no product data)',
          productCurvesRequested: subsForSimulation.length,
          productCurvesApplied: 0
        }
      };
    }

    // [BASS ENGINE INPUT CHECK] - Room + Product path (only if debug enabled)
    if (typeof globalThis !== 'undefined' && globalThis.__B44_BASS_INPUT_DEBUG) {
      if (globalThis.__B44_LOGS) console.log("[BASS ENGINE INPUT CHECK - Room+Product]", {
        roomDims,
        roomDimsKeys: Object.keys(roomDims || {}),
        widthM: roomDims?.widthM,
        lengthM: roomDims?.lengthM,
        heightM: roomDims?.heightM,
        rawFromAppState: roomDims,
        w, l, h,
        seatPosition: seatPos,
        sourcePositionsLength: sourcePositions?.length
      });
      if (!roomDims?.widthM || !roomDims?.lengthM || !roomDims?.heightM) {
        if (globalThis.__B44_LOGS) console.warn("[BASS ENGINE INPUT FAIL] roomDims missing — bass sim will early-return", { 
          roomDims, 
          rawSource: roomDims 
        });
      }
    }

    // Run engine with product curves applied per-sub
    // Default to absolute SPL, optional normalize via checkbox
    
    // Drag performance: use fast preview profile while dragging
    const usePreviewProfile = isDraggingSub;
    
    let result;
    try {
      const currentEpoch = calcEpochRef.current;
      
      result = computeRoomModesResponse({
        roomDims: { widthM: w, lengthM: l, heightM: h },
        sourcePositions,
        seatPosition: seatPos,
        mlpPosition: seatPos,
        fMin: 20,
        fMax: 200,
        pointsPerOct: usePreviewProfile ? 30 : 24,
        modeLimitHz: 200,
        q: roomDamping,
        includeAxial: true,
        includeTangential: true,
        includeOblique: true,
        includeSBIR: true,
        sbirMaxOrder: 1,
        sbirIncludeWalls: true,
        sbirIncludeFloorCeiling: true,
        rewParityMode: true,
        smoothing: 'none',
        subFloorHeight: 0.0,
        normalizeBandHz: null,
        normalizeToDb: null,
        relativeViewEnabled: false,
        surfaceAbsorption: {
          front: 0.30,
          back: 0.30,
          left: 0.30,
          right: 0.30,
          ceiling: 0.30,
          floor: 0.30,
        },
        dampingScalar: Math.max(0.5, roomDamping / 20),
        leakage: 0.05,
        subProductCurves,
        absoluteSplMode: true,
        rawEngineOutput: false,
        modeIsolation: modeIsolation !== 'off' ? modeIsolation : null,
        complexEigenfunctions: complexEigenfunctions,
        componentView: 'modalPlusSbir',
        disableSealedRoomGain: false,
        disableNullRepair: true,
        sbirBlendEnabled: false,
        rewStrictParity: false,
        isDragging: usePreviewProfile,
        calcEpoch: currentEpoch
      });
      
      // Request cancellation: NEVER return null (keeps graph alive)
      if (currentEpoch !== calcEpochRef.current) {
        return lastGoodRewRoomPlusAbsRef.current || { data: [], debug: { note: "stale-cancelled" } };
      }
    } catch (e) {
      return {
        data: [],
        debug: {
          error: "computeRoomModesResponse failed",
          message: String(e?.message || e)
        }
      };
    }

    const finiteValues = result.splDb.filter(v => isFinite(v));
    if (finiteValues.length === 0) {
      // SBIR-only safeguard: always return valid data (even if SBIR disabled)
      if (componentView === 'sbirOnly') {
        // Return flat quiet line so graph never blanks
        return { 
          freqs: result.freqs, 
          splDb: result.freqs.map(() => -240),
          plottedDb: result.freqs.map(() => -240),
          debug: { ...result.debug, note: wantSBIR ? "SBIR-only: no finite values (SBIR might be very quiet)" : "SBIR disabled" } 
        };
      }
      return { freqs: [], splDb: [], plottedDb: [], debug: { ...result.debug, error: "No finite values" } };
    }

    // Clear failure cache on success
    lastRewFailSigRef.current = null;
    lastRewFailResultRef.current = null;

    const modelKeys = subsForSimulation.map(s => s?.modelKey).filter(Boolean);
    const uniqueKeys = Array.from(new Set(modelKeys));

    // Check for SPL range issues
    const productSplRange = Number(result.debug?.splRangeDb) || 0;
    const roomOnlySplRange = Number(rewModesData?.debug?.splRangeDb) || 0;
    let scaleWarning = null;

    if (Math.abs(productSplRange - roomOnlySplRange) > 20) {
      scaleWarning = `Room-only range: ${fmtFixed(roomOnlySplRange, 1)} dB, Room+Product range: ${fmtFixed(productSplRange, 1)} dB — scale mismatch detected`;
    }

    // Product curve application summary
    const productCurvesApplied = subProductCurves.filter(c => c !== null).length;
    const firstCurve = productCurveDebug[0] || null;

    // Use plottedDb for display (smoothed if requested), coherentRawDb for audit
    const plotArray = result.plottedDb || result.splDb;

    // Build data points (ensure strictly increasing X, no rounding, no duplicates)
    const dataPoints = result.freqs
      .map((frequency, i) => ({
        frequency, // Keep full float precision (no toFixed)
        spl: plotArray[i]
      }))
      .filter((p, i, arr) => {
        // Remove duplicate frequencies (keep first occurrence)
        if (i === 0) return true;
        return p.frequency !== arr[i - 1].frequency;
      })
      .sort((a, b) => a.frequency - b.frequency); // Ensure strictly increasing

    const finalResult = {
      data: dataPoints,
      debug: {
        ...result.debug,
        viewMode: 'Room + Product',
        curveType: 'Modal response + product anechoic curves',
        productModels: uniqueKeys,
        scaleWarning,
        productCurvesRequested: subsForSimulation.length,
        productCurvesApplied,
        productCurveAt50HzDb: firstCurve?.originalAt50Hz || 'N/A',
        productCurveMinMaxDb: firstCurve ? `${firstCurve.relativeMinDb} to ${firstCurve.relativeMaxDb}` : 'N/A',
        productCurveIsRelative: firstCurve?.isRelative || false,
        productCurveDebug,
        freqGridPointCount: dataPoints.length,
        freqGridMin: dataPoints.length > 0 ? dataPoints[0].frequency : null,
        freqGridMax: dataPoints.length > 0 ? dataPoints[dataPoints.length - 1].frequency : null
      },
      freqs: result.freqs,
      splDb: plotArray,
      coherentRawDb: result.coherentRawDb
    };
    
    // Cache last good dataset for UI safety (non-empty only)
    if (Array.isArray(dataPoints) && dataPoints.length > 0) {
      lastGoodRewRoomPlusAbsRef.current = finalResult;
    }
    
    return finalResult;
  }, [
    rewStyleMode, 
    rewView, 
    roomDims?.widthM, 
    roomDims?.lengthM, 
    roomDims?.heightM, 
    stableSeatSig, 
    stableSubSig, 
    subPositionEpoch, 
    roomDamping, 
    graphSmoothing, 
    rewRelativeView, 
    modeIsolation, 
    complexEigenfunctions, 
    componentView, 
    rewSmoothing,
    isDraggingSub, // Include drag state
    calcEpoch, // Include calc epoch for request cancellation
    sourcesSig // FORCE-RECOMPUTE: changes when sub position/tuning changes
  ]);



  // REW Compare View display preset (does NOT mutate user smoothing state)
  // Compare view forces display to 1/3 via graphSmoothing derivation, user's choice stays intact
  useEffect(() => {
    if (rewCompareView) {
      setRewRelativeView(false);     // absolute SPL for compare
      setYAxisLocked(true);
      setShowRewModeLines(true);
      setLinearHzAxis(false);        // REW-style log axis
      // NOTE: rewSmoothing is NOT changed here - graphSmoothing handles display override
    }
  }, [rewCompareView]);

  // Helper: apply display conditioning (REW-style nulling only, NO clamping)
  const applyDisplayConditioningNulls = (data, rewLockedMin, rewLockedMax, yAxisLocked, isRewStyle) => {
    const points = Array.isArray(data) ? data : [];
    const ABS_FLOOR_DB = -60; // Absolute display floor for true "no data"

    return points.map(p => {
      const spl = typeof p?.spl === "number" && Number.isFinite(p.spl) ? p.spl : null;
      
      // Non-finite always becomes null
      if (spl === null) return { ...p, spl: null };

      // Below absolute floor (-60 dB): TRUE floor, break line (REW-style gap)
      if (spl < ABS_FLOOR_DB) {
        return { ...p, spl: null };
      }

      // Y-axis lock does NOT mutate data (viewport constraint only)
      return p;
    });
  };

  // Helper: apply REW-style smoothing (HOISTED for early access in useMemo)
  // REW-style display smoothing (fractional octave) in LINEAR PRESSURE domain.
  // This is display-only. Do not feed this back into the engine.
  function applyRewStyleDisplaySmoothing(points, smoothingSetting) {
    if (!points || points.length === 0) return points || [];

    // Treat these as "no smoothing"
    if (!smoothingSetting || smoothingSetting === 'none' || smoothingSetting === '0') return points;

    // Map UI tokens to fractional octave width N
    // 1/48 = very light, 1/3 = heavy (RP22)
    const frac =
      smoothingSetting === '1/48' ? 48 :
      smoothingSetting === '1/24' ? 24 :
      smoothingSetting === '1/12' ? 12 :
      smoothingSetting === '1/6'  ? 6  :
      smoothingSetting === '1/3'  ? 3  :
      null;

    if (!frac) return points;

    // Build arrays
    const freqs = points.map(p => p.frequency);
    const dbIn  = points.map(p => (Number.isFinite(p.spl) ? p.spl : null));

    // Convert dB -> linear pressure
    const pIn = dbIn.map(db => (db === null ? null : Math.pow(10, db / 20)));

    // Fractional-octave smoothing window:
    // For each f0, include bins within f0 * 2^(±1/(2*frac))
    const outDb = freqs.map((f0, i) => {
      const p0 = pIn[i];
      if (!Number.isFinite(f0) || p0 === null) return null;

      const ratio = Math.pow(2, 1 / (2 * frac));
      const fLo = f0 / ratio;
      const fHi = f0 * ratio;

      let sum = 0;
      let count = 0;

      // Simple scan; dataset is small enough
      for (let j = 0; j < freqs.length; j++) {
        const fj = freqs[j];
        const pj = pIn[j];
        if (pj === null) continue;
        if (fj >= fLo && fj <= fHi) {
          sum += pj;
          count++;
        }
      }

      if (count < 1) return null;

      const meanP = sum / count;
      // linear pressure -> dB
      return 20 * Math.log10(Math.max(meanP, 1e-12));
    });

    // Rebuild points
    return points.map((p, i) => ({
      ...p,
      spl: outDb[i]
    }));
  }

  // Display-only smoothing for REW mode series (ENGINE/DISPLAY only; never RAW)
  const applyDisplaySmoothing = (series, smoothingSetting) => {
    if (!Array.isArray(series) || series.length === 0) return series;
    try {
      return applyRewStyleDisplaySmoothing(series, smoothingSetting);
    } catch (e) {
      return series;
    }
  };

  // ------------------------------
  // GRAPH SOURCE SELECTION (SAFE)
  // ------------------------------

  // Non-REW graph source: selectedSeat (product simulation engine)
  const responseDataNonRew = useMemo(() => {
    const freqs = selectedSeat?.freqsHz;
    const spls = selectedSeat?.splDb;

    if (!Array.isArray(freqs) || !Array.isArray(spls) || freqs.length === 0 || spls.length === 0) {
      return [];
    }

    const n = Math.min(freqs.length, spls.length);

    const out = [];
    for (let i = 0; i < n; i++) {
      const f = freqs[i];
      const s = spls[i];
      if (!Number.isFinite(f)) continue;
      out.push({ frequency: f, spl: Number.isFinite(s) ? s : null });
    }
    return out;
  }, [selectedSeat]);

  // Derived REW relative datasets: normalise 30–80 Hz to 0 dB baseline
  // Uses mean in linear PRESSURE domain (REW-like visual balance point)
  const normalizeDatasetToRelative = React.useCallback((dataset) => {
    if (!dataset || !Array.isArray(dataset.data) || dataset.data.length === 0) {
      return { data: [], debug: dataset?.debug };
    }

    // Extract 30–80 Hz band SPL values
    const band = dataset.data
      .filter(d => d.frequency >= 30 && d.frequency <= 80)
      .map(d => d.spl)
      .filter(v => Number.isFinite(v));

    if (band.length < 3) {
      return { data: dataset.data, debug: dataset.debug };
    }

    // Use MEAN in LINEAR PRESSURE domain for visual balance point (REW-style)
    const pressures = band.map(db => Math.pow(10, db / 20));
    const meanPressure = pressures.reduce((a, b) => a + b, 0) / pressures.length;
    const baselineDb = 20 * Math.log10(meanPressure);

    // Subtract baseline from entire curve (30-80 Hz band centers at 0 dB)
    const shifted = dataset.data.map(p => ({
      frequency: p.frequency,
      spl: Number.isFinite(p.spl) ? p.spl - baselineDb : p.spl
    }));

    return {
      data: shifted,
      debug: {
        ...(dataset.debug || {}),
        normRefDb: 0,
        normOffsetAppliedDb: fmtFixed(-baselineDb, 2),
        normBandPressureMeanDb: fmtFixed(baselineDb, 2)
      }
    };
  }, []);

  const rewModesDataRel = useMemo(() => {
    if (!rewStyleMode) return null;
    return normalizeDatasetToRelative(rewModesDataAbs || { data: [] });
  }, [rewStyleMode, rewModesDataAbs, normalizeDatasetToRelative]);

  const rewRoomPlusProductDataRel = useMemo(() => {
    if (!rewStyleMode) return null;
    return normalizeDatasetToRelative(rewRoomPlusProductDataAbs || { data: [] });
  }, [rewStyleMode, rewRoomPlusProductDataAbs, normalizeDatasetToRelative]);

  // CANONICAL DATASET: Single source of truth for graph (prevents blank/undefined errors)
  const finalSeries = useMemo(() => {
    // Always use REW-style simulation at RSP
    const w = roomDims?.widthM;
    const l = roomDims?.lengthM;
    const h = roomDims?.heightM;
    
    if (!(Number.isFinite(w) && Number.isFinite(l) && Number.isFinite(h) && w > 0 && l > 0 && h > 0)) {
      return { freqsHz: [], splDb: [], debug: { error: "Invalid room dimensions" } };
    }

    const seat = seatingPositions?.find(s => s.isPrimary) || seatingPositions?.[0];
    if (!seat) {
      return { freqsHz: [], splDb: [], debug: { error: "No RSP found" } };
    }

    const seatPos = { x: seat.x, y: seat.y, z: seat.z ?? 1.2 };

    const sourcePositions = subsForSimulation
      .filter(s => s && Number.isFinite(s.x) && Number.isFinite(s.y))
      .map(s => ({
        x: s.x,
        y: s.y,
        z: 0.0,
        tuning: s.tuning || { gainDb: 0, delayMs: 0, polarity: 'normal' }
      }));

    if (!sourcePositions.length) {
      return { freqsHz: [], splDb: [], debug: { error: "No valid sub positions" } };
    }

    try {
      const result = computeRoomModesResponse({
        roomDims: { widthM: w, lengthM: l, heightM: h },
        sourcePositions,
        seatPosition: seatPos,
        mlpPosition: seatPos,
        fMin: 20,
        fMax: 200,
        pointsPerOct: 24,
        modeLimitHz: 200,
        q: roomDamping,
        includeAxial: true,
        includeTangential: true,
        includeOblique: true,
        includeSBIR: true,
        sbirMaxOrder: 1,
        sbirIncludeWalls: true,
        sbirIncludeFloorCeiling: true,
        rewParityMode: true,
        smoothing: 'none',
        subFloorHeight: 0.0,
        normalizeBandHz: null,
        normalizeToDb: null,
        relativeViewEnabled: false,
        surfaceAbsorption: {
          front: 0.30, back: 0.30, left: 0.30,
          right: 0.30, ceiling: 0.30, floor: 0.30,
        },
        dampingScalar: Math.max(0.5, roomDamping / 20),
        leakage: 0.05,
        subProductCurves: null,
        absoluteSplMode: true,
        rawEngineOutput: false,
        componentView: 'modalPlusSbir',
        disableSealedRoomGain: false,
        disableNullRepair: true,
        sbirBlendEnabled: false,
        rewStrictParity: false,
        isDragging: false,
        calcEpoch: 0
      });

      return {
        freqsHz: result.freqs || [],
        splDb: result.splDb || [],
        debug: result.debug || {}
      };
    } catch (e) {
      return {
        freqsHz: [],
        splDb: [],
        debug: {
          error: "Engine failed",
          message: String(e?.message || e)
        }
      };
    }
  }, [roomDims, seatingPositions, subsForSimulation, roomDamping, subPositionEpoch]);

  // Build responseData ONLY from finalSeries
  const responseData = useMemo(() => {
    if (!finalSeries.freqsHz || !finalSeries.splDb || finalSeries.freqsHz.length === 0) {
      return [];
    }
    
    return finalSeries.freqsHz.map((frequency, i) => ({
      frequency,
      spl: Number.isFinite(finalSeries.splDb[i]) ? finalSeries.splDb[i] : null
    }));
  }, [finalSeries]);

  // Safe debug object
  const safeGraphDebug = finalSeries.debug || {};

  // Safe debug alias
  const safeDebug = safeGraphDebug || {};

  // Display mode gates (CRITICAL: Relative view and Display ref are mutually exclusive)
  const isRewStyle = !!rewStyleMode;
  const isRelative = isRewStyle && !!rewRelativeView;
  const isCompare = isRewStyle && !!rewCompareView;
  
  // IMPORTANT: Relative view must NEVER apply absolute display reference offsets
  const allowDisplayRefOffset = isRewStyle && !isRelative;
  
  // REW locked window bounds (fixed ±30 dB window around display ref, like REW's 60-120 dB)
  const rewLockedMin = isRewStyle && yAxisLocked ? (Number(rewDisplayRefDb) || 90) - 30 : null;
  const rewLockedMax = isRewStyle && yAxisLocked ? (Number(rewDisplayRefDb) || 90) + 30 : null;

  // Build displayData directly from finalSeries
  const displayData = useMemo(() => {
    return responseData;
  }, [responseData]);

  // TEMP DEBUG (can remove later)
  // if (globalThis.__B44_LOGS) console.log("Bass displayData source:", { rewStyleMode, rewView, hasRoom: !!rewModesData?.data?.length, hasRoomPlus: !!rewRoomPlusProductData?.data?.length, displayLen: displayData?.length });

  // REW-style display processing (display only)
  // - If Relative view is ON: normalise 30–80 Hz band so its median becomes 0 dB (REW overlay style)
  // - If Relative view is OFF: pass through unchanged
  const rewSplAnchoredData = useMemo(() => {
    const data = Array.isArray(displayData) ? displayData : [];
    if (!data.length) return data;

    // Only apply relative normalisation in REW-style mode when the toggle is on
    if (!(rewStyleMode && rewRelativeView)) return data;

    // Collect 30–80 Hz band SPL samples (finite only)
    const band = data
      .filter(d => d && Number.isFinite(d.frequency) && d.frequency >= 30 && d.frequency <= 80)
      .map(d => d.spl)
      .filter(v => Number.isFinite(v));

    // Need enough points to be meaningful (avoid "offset = 0" by accident)
    if (band.length < 10) return data;

    // Median (REW-like, stable, not skewed by deep nulls)
    const sorted = [...band].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const medianDb =
      sorted.length % 2 === 1
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;

    // Shift so 30–80 Hz median becomes 0 dB
    const offsetDb = -medianDb;

    // Apply constant shift to the plotted series (display-only)
    const shifted = data.map(d => {
      if (!d || !Number.isFinite(d.spl)) return d;
      return { ...d, spl: d.spl + offsetDb };
    });

    // Optional debug hook (matches your existing pattern)
    if (typeof globalThis !== "undefined" && globalThis.__B44_BASS_DEBUG) {
      if (globalThis.__B44_LOGS) console.log("[RELATIVE VIEW NORMALISE 30–80]", {
        bandCount: band.length,
        medianDb: Number(medianDb.toFixed(2)),
        offsetDb: Number(offsetDb.toFixed(2)),
      });
    }

    return shifted;
  }, [displayData, rewStyleMode, rewRelativeView]);

  // Update engine calls UI only when deps change (not on every render)
  useEffect(() => {
    setEngineCallsUi(engineCallCountRef.current);
  }, [subPositionEpoch, roomDims?.widthM, roomDims?.lengthM, roomDims?.heightM, rewSmoothing, rewRelativeView, rewView, roomDamping]);

  // Sensitivity audit: compute deltas when source position changes (throttled during drag)
  const sensitivityAudit = useMemo(() => {
    if (!rewCompareView || !rewModesDataAudit || !subsForSimulation.length) {
      return lastStableDebugRef.current;
    }
    
    // Throttle updates: max once per 140ms
    const now = Date.now();
    const timeSinceLastUpdate = now - lastDebugUpdateTimeRef.current;
    const shouldUpdate = timeSinceLastUpdate >= 140;
    
    if (!shouldUpdate && lastStableDebugRef.current) {
      return lastStableDebugRef.current;
    }

    // Use ROUNDED signatures (1cm resolution) to prevent float noise
    const currentSourceSigRounded = subsForSimulation.map(s => 
      `${fmtFixed(s.x, 2)}_${fmtFixed(s.y, 2)}_${fmtFixed(s.z ?? 0, 2)}`
    ).join('|');

    // Use splDbRepaired for consistent comparison (pre-smoothing, pre-normalization)
    const currentRepairedDb = rewModesDataAudit.debug?.splDbRepaired || rewModesDataAudit.splDb;
    const currentFreqs = rewModesDataAudit.freqs;

    // Compute axial coupling for first sub (rounded to 3 decimals for stability)
    const seat = seatingPositions?.find(s => s.isPrimary) || seatingPositions?.[0];
    if (!seat) return lastStableDebugRef.current || null;

    let seatPos = { x: seat.x, y: seat.y, z: seat.z ?? 1.2 };
    if (typeof globalThis !== 'undefined' && globalThis.__B44_BASS_DEBUG && seatNudgeTest) {
      seatPos = { ...seatPos, x: seatPos.x - 0.30 };
    }

    const firstSub = subsForSimulation[0];
    const coupling = computeAxialCoupling(
      { x: firstSub.x, y: firstSub.y, z: firstSub.z ?? 0.0 },
      seatPos,
      roomDims
    );
    
    // Round coupling to 3 decimals for display stability
    const currentCoupling = {
      src: toNum(coupling.src) ?? 0,
      rcv: toNum(coupling.rcv) ?? 0,
      total: toNum(coupling.total) ?? 0
    };

    // Check if source changed significantly (>1cm)
    const sourceChanged = prevSourceSigRef.current !== null && 
                          prevSourceSigRef.current !== currentSourceSigRounded;

    let probeDeltas = null;
    let couplingDeltas = null;
    let maxDelta = 0;
    let avgDelta = 0;

    if (sourceChanged && prevFinalDbRef.current && prevFreqsRef.current) {
      const probeFreqs = [20, 25, 30, 34, 36, 38, 40, 42, 45];
      probeDeltas = [];

      for (const fProbe of probeFreqs) {
        const currIdx = currentFreqs.findIndex(f => Math.abs(f - fProbe) < 0.6);
        const prevIdx = prevFreqsRef.current.findIndex(f => Math.abs(f - fProbe) < 0.6);

        if (currIdx >= 0 && prevIdx >= 0 && 
            Number.isFinite(currentRepairedDb[currIdx]) && 
            Number.isFinite(prevFinalDbRef.current[prevIdx])) {
          const delta = currentRepairedDb[currIdx] - prevFinalDbRef.current[prevIdx];
          probeDeltas.push({ freq: fProbe, delta });
        }
      }

      if (probeDeltas.length > 0) {
        const absDeltasFinite = probeDeltas
          .map(p => p.delta)
          .filter(d => Number.isFinite(d))
          .map(d => Math.abs(d));
        
        maxDelta = absDeltasFinite.length > 0 ? Math.max(...absDeltasFinite) : 0;
        avgDelta = absDeltasFinite.length > 0 
          ? absDeltasFinite.reduce((a, b) => a + b, 0) / absDeltasFinite.length 
          : 0;
      }

      if (prevCouplingRef.current) {
        couplingDeltas = {
          src: currentCoupling.src - prevCouplingRef.current.src,
          rcv: currentCoupling.rcv - prevCouplingRef.current.rcv,
          total: currentCoupling.total - prevCouplingRef.current.total
        };
      }
    }

    // Only update refs if source actually changed (prevents jitter)
    if (sourceChanged) {
      prevSourceSigRef.current = currentSourceSigRounded;
      prevFinalDbRef.current = currentRepairedDb;
      prevFreqsRef.current = currentFreqs;
      prevCouplingRef.current = currentCoupling;
    }

    // Stable verdict logic (requires meaningful change)
    const couplingChanged = couplingDeltas && Math.abs(couplingDeltas.total) >= 0.02;
    const splChanged = maxDelta >= 0.20;
    const responding = couplingChanged || splChanged;

    const auditResult = {
      sourceChanged,
      currentSourceSig: currentSourceSigRounded,
      probeDeltas,
      couplingDeltas,
      currentCoupling,
      maxDelta,
      avgDelta,
      verdict: responding ? 'RESPONDING (engine reacts to position)' : 'NOT RESPONDING (change too small or structural bug)'
    };
    
    // Update stable ref and timestamp
    lastStableDebugRef.current = auditResult;
    lastDebugUpdateTimeRef.current = now;
    
    return auditResult;
  }, [rewCompareView, rewModesDataAudit, subsForSimulation, seatingPositions, roomDims, seatNudgeTest, computeAxialCoupling]);

  // Compute stable Y-axis domain using 30–80 Hz band intelligence
  // Auto window: refDb ± 20 dB (40 dB total span)
  // Uses MEAN in linear PRESSURE domain for consistent visual centering
  const computeStableYDomain = React.useCallback((data) => {
    if (!data || data.length === 0) return null;

    // 30–80 Hz band (designer-relevant reference)
    const band = data
      .filter(d => d.frequency >= 30 && d.frequency <= 80)
      .map(d => d.spl)
      .filter(v => Number.isFinite(v));

    if (band.length < 3) return null; // Need at least 3 points for meaningful average

    // Use MEAN in LINEAR PRESSURE domain for visual balance point
    const pressures = band.map(db => Math.pow(10, db / 20));
    const meanPressure = pressures.reduce((a, b) => a + b, 0) / pressures.length;
    const refDb = 20 * Math.log10(meanPressure);

    // Auto window: refDb ± 20 dB (40 dB total span)
    const span = 40;
    const min = refDb - 20;
    const max = refDb + 20;

    return { refDb, min, max };
  }, []);

  // REW Compare View: auto window centered on 30-80 Hz pressure mean
  const computeRewCompareYDomain = React.useCallback((data) => {
    if (!data || data.length === 0) return null;

    // 30–80 Hz band pressure mean as reference
    const band = data
      .filter(d => d.frequency >= 30 && d.frequency <= 80)
      .map(d => d.spl)
      .filter(v => Number.isFinite(v));

    if (band.length < 3) {
      // Fallback: use default reference
      return { refDb: 85, min: 65, max: 105 };
    }

    // Use MEAN in LINEAR PRESSURE domain for visual balance point
    const pressures = band.map(db => Math.pow(10, db / 20));
    const meanPressure = pressures.reduce((a, b) => a + b, 0) / pressures.length;
    const refDb = 20 * Math.log10(meanPressure);

    // Auto window: refDb ± 20 dB
    const min = refDb - 20;
    const max = refDb + 20;

    return { refDb, min, max };
  }, []);

  // Dynamic Y domain from pre-clamp plotted data (designer-friendly)
  const computeDynamicYDomain = (points, isRelative) => {
    const finite = (points || []).map(p => p?.spl).filter(v => Number.isFinite(v));
    if (finite.length === 0) {
      return isRelative
        ? { min: -30, max: 12, refDb: 0 }
        : { min: 65, max: 105, refDb: 85 };
    }

    let minV = Math.min(...finite);
    let maxV = Math.max(...finite);

    // Add padding so the curve isn't pressed against the edges
    minV = minV - 6;
    maxV = maxV + 6;

    // Hard caps to keep the chart sane
    if (isRelative) {
      minV = Math.max(-60, minV);
      maxV = Math.min(20, maxV);
      // Ensure not inverted / too narrow
      if (maxV - minV < 20) {
        const mid = (maxV + minV) / 2;
        minV = mid - 10;
        maxV = mid + 10;
      }
    } else {
      minV = Math.max(40, minV);
      maxV = Math.min(130, maxV);
      if (maxV - minV < 20) {
        const mid = (maxV + minV) / 2;
        minV = mid - 10;
        maxV = mid + 10;
      }
    }

    return { min: minV, max: maxV, refDb: (minV + maxV) / 2 };
  };

  // Y-axis domain policy: REW mode computes from data, non-REW uses fixed windows
  React.useEffect(() => {
    if (!rewStyleMode) {
      setYAxisDomain(null);
      return;
    }

    // REW mode: Y-axis auto-computed from data in BassGraph (pass null)
    setYAxisDomain(null);
  }, [rewStyleMode]);

  // Manual reset function
  const handleResetScale = React.useCallback(() => {
    if (!rewStyleMode) return;

    // Reset should always snap to the designer-friendly default for the current view
    if (rewCompareView) {
      setYAxisDomain({ min: 65, max: 105, refDb: 85 });
    } else if (rewRelativeView) {
      setYAxisDomain({ min: -30, max: 12, refDb: 0 });
    } else {
      setYAxisDomain({ min: 65, max: 105, refDb: 85 });
    }
  }, [rewStyleMode, rewCompareView, rewRelativeView]);

  const finalYDomain = React.useMemo(() => {
    if (isDraggingSub) {
      const d = yDomainDuringDragRef.current;
      if (Array.isArray(d) && d.length === 2 && Number.isFinite(d[0]) && Number.isFinite(d[1])) return d;
      return undefined; // IMPORTANT: do not force a random fallback window
    }

    // Not dragging: normal behaviour (locked REW window)
    if (rewStyleMode && yAxisLocked && isRewStyle && Number.isFinite(rewLockedMin) && Number.isFinite(rewLockedMax)) {
      return [rewLockedMin, rewLockedMax];
    }

    return undefined;
  }, [isDraggingSub, rewStyleMode, yAxisLocked, isRewStyle, rewLockedMin, rewLockedMax]);

  // PLOT INTEGRITY CHECK: Ensure clean, sorted, deduplicated data
  const cleanPlottedSeries = React.useCallback((rawSeries) => {
    if (!Array.isArray(rawSeries) || rawSeries.length === 0) return [];
    
    // Filter out invalid points
    const valid = rawSeries.filter(p => {
      const f = p?.frequency;
      const s = p?.spl;
      // Keep point if frequency is finite and positive (log axis safety)
      // SPL can be null/NaN (breaks line), but frequency must be valid
      return Number.isFinite(f) && f > 0;
    });
    
    if (valid.length === 0) return [];
    
    // Sort by frequency ascending
    const sorted = [...valid].sort((a, b) => a.frequency - b.frequency);
    
    // Remove duplicate frequencies (keep last occurrence for each unique Hz)
    const deduplicated = [];
    for (let i = 0; i < sorted.length; i++) {
      const curr = sorted[i];
      const next = sorted[i + 1];
      
      // If next point has same frequency, skip current (keep last)
      if (next && Math.abs(curr.frequency - next.frequency) < 1e-9) {
        continue;
      }
      
      deduplicated.push(curr);
    }
    
    return deduplicated;
  }, []);
  
  // Final plotted series (clean for graph, no processing)
  const plottedSeries = React.useMemo(() => {
    // Clean for plotting (sort, deduplicate, ensure strictly increasing)
    const cleaned = cleanPlottedSeries(displayData);

    // Cache stable plot ONLY when not dragging
    if (!isDraggingSub && cleaned && cleaned.length > 0) {
      lastStablePlotRef.current = cleaned;
    } else if (!lastStablePlotRef.current && cleaned && cleaned.length > 0) {
      lastStablePlotRef.current = cleaned;
    }

    return cleaned;
  }, [displayData, cleanPlottedSeries, isDraggingSub]);
  
  // Plot Integrity Check (runs before graph renders)
  const plotIntegrityCheck = React.useMemo(() => {
    const series = plottedSeries;
    if (!Array.isArray(series) || series.length === 0) {
      return {
        status: 'NO_DATA',
        pointCount: 0
      };
    }
    
    const pointCount = series.length;
    
    // Check for duplicates
    let duplicateXCount = 0;
    for (let i = 1; i < series.length; i++) {
      if (Math.abs(series[i].frequency - series[i - 1].frequency) < 1e-9) {
        duplicateXCount++;
      }
    }
    
    // Check for non-increasing
    let nonIncreasingCount = 0;
    for (let i = 1; i < series.length; i++) {
      if (series[i].frequency <= series[i - 1].frequency) {
        nonIncreasingCount++;
      }
    }
    
    // Compute spacing stats
    const deltas = [];
    for (let i = 1; i < series.length; i++) {
      deltas.push(series[i].frequency - series[i - 1].frequency);
    }
    
    const minDf = deltas.length > 0 ? Math.min(...deltas) : 0;
    const maxDf = deltas.length > 0 ? Math.max(...deltas) : 0;
    
    // Find largest gap region
    let largestGapIdx = 0;
    if (deltas.length > 0) {
      for (let i = 0; i < deltas.length; i++) {
        if (deltas[i] === maxDf) {
          largestGapIdx = i;
          break;
        }
      }
    }
    const largestGapBand = largestGapIdx < series.length - 1
    ? `${fmtFixed(series[largestGapIdx].frequency, 1)}–${fmtFixed(series[largestGapIdx + 1].frequency, 1)} Hz`
    : 'N/A';
    
    // Check for NaN/Inf
    let hasNaNOrInf = false;
    for (const p of series) {
      if (!Number.isFinite(p.frequency) || (p.spl !== null && !Number.isFinite(p.spl))) {
        hasNaNOrInf = true;
        break;
      }
    }
    
    // STEP DETECTION: Find flat runs and vertical jumps
    const splValues = series.map(p => p.spl).filter(v => Number.isFinite(v));
    
    let flatRunsCount = 0;
    let currentFlatRunLength = 0;
    const jumps = [];
    
    for (let i = 1; i < series.length; i++) {
      const prevSpl = series[i - 1].spl;
      const currSpl = series[i].spl;
      
      if (!Number.isFinite(prevSpl) || !Number.isFinite(currSpl)) {
        currentFlatRunLength = 0;
        continue;
      }
      
      const deltaSpl = Math.abs(currSpl - prevSpl);
      const deltaF = series[i].frequency - series[i - 1].frequency;
      
      // Detect flat runs (≥4 consecutive points with <0.001 dB change)
      if (deltaSpl < 0.001) {
        currentFlatRunLength++;
        if (currentFlatRunLength >= 3) { // 4th point in run
          flatRunsCount++;
        }
      } else {
        currentFlatRunLength = 0;
      }
      
      // Collect all jumps
      jumps.push({
        idx: i,
        hzPrev: series[i - 1].frequency,
        hzNow: series[i].frequency,
        dbPrev: prevSpl,
        dbNow: currSpl,
        jumpDb: currSpl - prevSpl,
        absJumpDb: deltaSpl,
        deltaF: deltaF
      });
    }
    
    // Find max jump
    const maxJumpEntry = jumps.length > 0 
      ? jumps.reduce((max, curr) => curr.absJumpDb > max.absJumpDb ? curr : max, jumps[0])
      : null;
    
    const maxJumpDb = maxJumpEntry ? maxJumpEntry.absJumpDb : 0;
    const maxJumpAtHz = maxJumpEntry ? maxJumpEntry.hzNow : null;
    
    // Top 5 jumps
    const top5Jumps = [...jumps]
      .sort((a, b) => b.absJumpDb - a.absJumpDb)
      .slice(0, 5);
    
    // Build step pair debug (correlate jumps with term count data)
    const stepPairDebug = (() => {
      const termCountData = safeDebug?.termCountDebug55_80Hz;
      if (!termCountData || termCountData.length === 0 || top5Jumps.length === 0) return [];
      
      return top5Jumps.map((jump, jumpIndex) => {
        const f1Hz = jump.hzPrev;
        const f2Hz = jump.hzNow;
        const idx1 = jump.idx - 1; // Previous point index
        const idx2 = jump.idx;      // Current point index
        
        // Find nearest term count rows
        const findNearest = (targetFreq) => {
          let best = null;
          let minErr = Infinity;
          
          for (const row of termCountData) {
            const err = Math.abs(row.exactFreqHz - targetFreq);
            if (err < minErr) {
              minErr = err;
              best = row;
            }
          }
          
          return best;
        };
        
        const row1 = findNearest(f1Hz);
        const row2 = findNearest(f2Hz);
        
        if (!row1 || !row2) return null;
        
        // Extract SBIR contribution from modal total (rough approximation for display)
        // modalDb in termCountDebug is the total coherent pressure (modal+SBIR)
        const sbirDb1 = null; // Not separated in current debug data
        const sbirDb2 = null;
        
        // Check if clamped (based on locked Y-axis window)
        const isClamped1 = (yAxisLocked && Number.isFinite(rewLockedMin) && Number.isFinite(rewLockedMax))
          ? (jump.dbPrev < rewLockedMin || jump.dbPrev > rewLockedMax)
          : false;
        const isClamped2 = (yAxisLocked && Number.isFinite(rewLockedMin) && Number.isFinite(rewLockedMax))
          ? (jump.dbNow < rewLockedMin || jump.dbNow > rewLockedMax)
          : false;
        
        return {
          jumpIndex: jumpIndex + 1,
          fromHz: f1Hz,
          toHz: f2Hz,
          deltaHz: f2Hz - f1Hz,
          fromDb: jump.dbPrev,
          toDb: jump.dbNow,
          jumpDb: jump.jumpDb,
          fromIndex: idx1,
          toIndex: idx2,
          fromRow: {
            exactFreqHz: row1.exactFreqHz,
            finalDb: jump.dbPrev, // Actual plotted value
            modalDb: row1.modalDb,
            sbirDb: sbirDb1,
            modesConsidered: row1.modesConsidered,
            modesUsed: row1.modesUsed,
            sbirReflectionsUsed: row1.sbirReflectionsUsed,
            activeTermsTotal: row1.activeTermsTotal,
            modesSkippedBandwidth: row1.modesSkippedBandwidth,
            modesSkippedCoupling: row1.modesSkippedCoupling,
            isClamped: isClamped1
          },
          toRow: {
            exactFreqHz: row2.exactFreqHz,
            finalDb: jump.dbNow,
            modalDb: row2.modalDb,
            sbirDb: sbirDb2,
            modesConsidered: row2.modesConsidered,
            modesUsed: row2.modesUsed,
            sbirReflectionsUsed: row2.sbirReflectionsUsed,
            activeTermsTotal: row2.activeTermsTotal,
            modesSkippedBandwidth: row2.modesSkippedBandwidth,
            modesSkippedCoupling: row2.modesSkippedCoupling,
            isClamped: isClamped2
          },
          deltas: {
            deltaModesUsed: row2.modesUsed - row1.modesUsed,
            deltaSbirReflectionsUsed: row2.sbirReflectionsUsed - row1.sbirReflectionsUsed,
            deltaActiveTermsTotal: row2.activeTermsTotal - row1.activeTermsTotal,
            deltaModalDb: row2.modalDb - row1.modalDb,
            deltaModesSkippedBw: row2.modesSkippedBandwidth - row1.modesSkippedBandwidth,
            deltaModesSkippedCoup: row2.modesSkippedCoupling - row1.modesSkippedCoupling
          }
        };
      }).filter(Boolean);
    })();
    
    return {
      status: 'VALID',
      pointCount,
      duplicateXCount,
      nonIncreasingCount,
      minDf,
      maxDf,
      largestGapBand,
      hasNaNOrInf,
      flatRunsCount,
      maxJumpDb,
      maxJumpAtHz,
      top5Jumps,
      stepPairDebug
    };
  }, [plottedSeries]);
  
  // Compute yDomain for viewport constraint (when Y-axis is locked)
  // During drag: freeze at captured domain
  const yDomain = React.useMemo(() => {
    // During drag: ALWAYS freeze to the captured domain
    if (isDraggingSub) {
      const d = yDomainBeforeDragRef.current;
      return (Array.isArray(d) && d.length === 2) ? d : undefined;
    }

    // REW mode + locked: ALWAYS use the fixed ref window
    if (isRewStyle && yAxisLocked) {
      const lockedMin = (Number(rewDisplayRefDb) || 90) - 30;
      const lockedMax = (Number(rewDisplayRefDb) || 90) + 30;
      return [lockedMin, lockedMax];
    }

    return undefined;
  }, [isDraggingSub, isRewStyle, yAxisLocked, rewDisplayRefDb]);
  
  // Stub for removed display conditioning
  const belowFloor = 0;
  const clampedToMin = 0;
  const clampedToMax = 0;

  // Bass Metrics (20-80 Hz) - NOW USES ANALYSIS SERIES (same as plot base)
  const bassMetrics2080Hz = useMemo(() => {
    if (!selectedSeat || !selectedSeat.freqsHz || !analysisSplDbAbs || analysisSplDbAbs.length === 0) {
      return null;
    }

    const freqsHz = selectedSeat.freqsHz;
    const splDb = analysisSplDbAbs; // Use canonical analysis series

    // Filter to 20-80 Hz range
    const freqIndices = freqsHz
      .map((f, i) => ({ f, i }))
      .filter(({ f }) => f >= 20 && f <= 80);
    
    if (freqIndices.length === 0) {
      return null;
    }

    // 1. Seat-to-seat variance (simplified to single-seat for now)
    // Full multi-seat variance requires access to all seat analysis series
    const bandSpl = freqIndices.map(({ i }) => splDb[i]).filter(v => Number.isFinite(v));
    const mean = bandSpl.length > 0 ? bandSpl.reduce((a, b) => a + b, 0) / bandSpl.length : 0;
    const variance = bandSpl.length > 0 
      ? Math.sqrt(bandSpl.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / bandSpl.length)
      : 0;

    // 2. Best vs worst seat (use engine-computed value from simulationResults.metrics)
    const bestWorstDelta = simulationResults.metrics?.fairness?.spreadBestWorstDb || 0;

    // 3. Null count (use engine-computed value)
    const totalNulls = simulationResults.metrics?.fairness?.nulls?.perSeat 
      ? Object.values(simulationResults.metrics.fairness.nulls.perSeat)
          .reduce((sum, seat) => sum + (seat.count || 0), 0)
      : 0;

    return {
      variance,
      bestWorstDelta,
      nullCount: totalNulls
    };
  }, [selectedSeat, analysisSplDbAbs, simulationResults.metrics]);

  // Schroeder frequency (display only)
  const schroederFrequency = React.useMemo(() => {
    const w = roomDims?.widthM ?? 0;
    const l = roomDims?.lengthM ?? 0;
    const h = roomDims?.heightM ?? 0;
    if (!(w > 0 && l > 0 && h > 0)) return 0;
    const volume = w * l * h;
    const rt60 = 0.4; // default for v1
    return 2000 * Math.sqrt(rt60 / volume);
  }, [roomDims?.widthM, roomDims?.lengthM, roomDims?.heightM]);

  const rp22Levels = React.useMemo(() => ([
    { level: "L1", spl: 114, color: "#C1B6AD" },
    { level: "L2", spl: 117, color: "#8B7F76" },
    { level: "L3", spl: 120, color: "#625143" },
    { level: "L4", spl: 123, color: "#213428" },
  ]), []);

  const toggles = React.useMemo(() => ({ smoothing: false }), []);

  // Compute mode frequencies for markers
  const modeFrequencies = useMemo(() => {
    return safeGraphDebug?.modeMarkersHz || [];
  }, [safeGraphDebug]);

  // Mode markers for graph overlay
  const modeMarkersForGraph = useMemo(() => {
    const allMarkers = safeGraphDebug?.modeMarkers || [];
    return {
      axial: allMarkers.filter(m => m.family === 'axial'),
      tangential: allMarkers.filter(m => m.family === 'tangential'),
      oblique: allMarkers.filter(m => m.family === 'oblique')
    };
  }, [safeGraphDebug]);

  // Compute geometric distances for readouts
  const subDistances = useMemo(() => {
    const mlpSeat = seatingPositions?.find(s => s.isPrimary);
    if (!mlpSeat) return {};
    
    const mlpPoint = { x: mlpSeat.x, y: mlpSeat.y, z: mlpSeat.z ?? 1.2 };
    const SPEED_OF_SOUND = 343;
    const distances = {};
    
    // Front subs
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
    
    // Rear subs
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

  // Auto-align function (defined before useEffect hooks)
  const autoAlignSubs = React.useCallback((groupLabel) => {
    if (!autoAlignEnabled) return;

    const seatingPositionsNow = seatingRef.current;
    const roomDimsNow = roomDimsRef.current;

    const mlpSeat = seatingPositionsNow?.find(s => s.isPrimary) || seatingPositionsNow?.[0];
    if (!mlpSeat) return;

    const mlpPoint = { x: mlpSeat.x, y: mlpSeat.y, z: mlpSeat.z ?? 1.2 };
    const SPEED_OF_SOUND = 343;

    const isRear = groupLabel === "Rear";
    const cfg = isRear ? (rearCfgRef.current) : (frontCfgRef.current);
    const count = cfg?.count || 0;
    if (count === 0) return;

    const positions = Array.isArray(cfg?.positions) ? cfg.positions : [];
    const settingsById = cfg?.settingsById || {};
    const prefix = groupLabel.toLowerCase();

    const subIds =
      count === 1
        ? [`${prefix}-sub-left`]
        : [`${prefix}-sub-left`, `${prefix}-sub-right`];

    const roomWidth = Number(roomDimsNow?.widthM) || 4.5;
    const roomLength = Number(roomDimsNow?.lengthM) || 6.0;

    const defaultPositions = isRear
      ? [{ x: roomWidth * 0.33, y: roomLength - 0.15 }, { x: roomWidth * 0.67, y: roomLength - 0.15 }]
      : [{ x: roomWidth * 0.33, y: 0.15 }, { x: roomWidth * 0.67, y: 0.15 }];

    const subData = subIds.map((subId, i) => {
      const pos = positions[i] || defaultPositions[i] || { x: roomWidth / 2, y: isRear ? roomLength - 0.15 : 0.15 };
      const dx = pos.x - mlpPoint.x;
      const dy = pos.y - mlpPoint.y;
      const dz = 0.35 - mlpPoint.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const arrivalTime = distance / SPEED_OF_SOUND;
      return { subId, arrivalTime, pos };
    });

    const minArrival = Math.min(...subData.map(s => s.arrivalTime));

    const newSettings = { ...settingsById };
    subData.forEach(({ subId, arrivalTime }) => {
      const delayMs = Math.max(0, Math.min(30, (arrivalTime - minArrival) * 1000));
      newSettings[subId] = {
        ...newSettings[subId],
        gainDb: newSettings[subId]?.gainDb ?? 0,
        polarity: newSettings[subId]?.polarity ?? "normal",
        delayMs
      };
    });

    // Optional polarity optimisation (existing behaviour kept)
    if (tryPolarity && count > 1) {
      const testFreqs = [30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80];

      const scorePolarity = (polarityConfig) => {
        const testSubs = subData.map(({ subId, pos }, i) => ({
          id: subId,
          modelKey: cfg?.model,
          x: pos.x,
          y: pos.y,
          z: 0.35,
          tuning: {
            gainDb: 0,
            delayMs: newSettings[subId].delayMs,
            polarity: polarityConfig[i] ? 180 : 0
          }
        }));

        let totalSpl = 0;
        testFreqs.forEach(f => {
          let sumReal = 0;
          let sumImag = 0;

          testSubs.forEach(sub => {
            const dx = sub.x - mlpPoint.x;
            const dy = sub.y - mlpPoint.y;
            const dz = sub.z - mlpPoint.z;
            const d = Math.sqrt(dx * dx + dy * dy + dz * dz);

            const amplitude = Math.pow(10, (90 - 20 * Math.log10(d)) / 20);

            let phi = -2 * Math.PI * f * (d / SPEED_OF_SOUND);
            phi += -2 * Math.PI * f * (sub.tuning.delayMs / 1000);
            if (sub.tuning.polarity === 180) phi += Math.PI;

            sumReal += amplitude * Math.cos(phi);
            sumImag += amplitude * Math.sin(phi);
          });

          const magnitude = Math.sqrt(sumReal * sumReal + sumImag * sumImag);
          const spl = 20 * Math.log10(magnitude);
          totalSpl += spl;
        });

        return totalSpl / testFreqs.length;
      };

      const bestConfig = [false, false];
      let bestScore = scorePolarity(bestConfig);

      if (count === 2) {
        const configs = [
          [false, false],
          [false, true],
          [true, false],
          [true, true]
        ];

        configs.forEach(config => {
          const score = scorePolarity(config);
          if (score > bestScore + 0.5) {
            bestScore = score;
            bestConfig[0] = config[0];
            bestConfig[1] = config[1];
          }
        });
      }

      subData.forEach(({ subId }, i) => {
        newSettings[subId].polarity = bestConfig[i] ? "invert" : "normal";
      });
    }

    // --- APPLY GUARD: only set state if settings for active subIds actually changed
    const prevSig = lastAutoAlignApplySigRef.current?.[groupLabel] || null;
    const nextSig = __b44SettingsSig(newSettings, subIds);
    if (prevSig === nextSig) return;
    lastAutoAlignApplySigRef.current = {
      ...(lastAutoAlignApplySigRef.current || {}),
      [groupLabel]: nextSig
    };

    if (isRear) {
      setRearSubsCfg(prev => ({ ...prev, settingsById: newSettings }));
    } else {
      setFrontSubsCfg(prev => ({ ...prev, settingsById: newSettings }));
    }
  }, [autoAlignEnabled, tryPolarity, setFrontSubsCfg, setRearSubsCfg]);

  // Auto-align on first enable or when auto-align is re-enabled
  useEffect(() => {
    if (!autoAlignEnabled) return;
    
    const frontCount = frontSubsCfg?.count || 0;
    if (frontCount > 0 && !hasAutoAlignedFront) {
      autoAlignSubs('Front');
      setHasAutoAlignedFront(true);
    } else if (frontCount === 0) {
      setHasAutoAlignedFront(false);
    }
  }, [autoAlignEnabled, frontSubsCfg?.count, hasAutoAlignedFront, autoAlignSubs]);

  useEffect(() => {
    if (!autoAlignEnabled) return;
    
    const rearCount = rearSubsCfg?.count || 0;
    if (rearCount > 0 && !hasAutoAlignedRear) {
      autoAlignSubs('Rear');
      setHasAutoAlignedRear(true);
    } else if (rearCount === 0) {
      setHasAutoAlignedRear(false);
    }
  }, [autoAlignEnabled, rearSubsCfg?.count, hasAutoAlignedRear, autoAlignSubs]);
  
  // Re-align when positions or dimensions change
  useEffect(() => {
    if (!autoAlignEnabled) return;

    const roomDimsNow = roomDimsRef.current;
    const seatingNow = seatingRef.current;

    const sig = __b44SafeSig({
      w: roomDimsNow?.widthM,
      l: roomDimsNow?.lengthM,
      h: roomDimsNow?.heightM,
      seats: Array.isArray(seatingNow)
        ? seatingNow.map(s => ({ x: s.x, y: s.y, z: s.z, p: !!s.isPrimary }))
        : null,
      front: {
        count: frontCfgRef.current?.count || 0,
        pos: frontCfgRef.current?.positions || null
      },
      rear: {
        count: rearCfgRef.current?.count || 0,
        pos: rearCfgRef.current?.positions || null
      },
      tryPolarity: !!tryPolarity
    });

    if (lastAutoAlignTriggerSigRef.current === sig) return;
    lastAutoAlignTriggerSigRef.current = sig;

    if ((frontCfgRef.current?.count || 0) > 0) autoAlignSubs("Front");
    if ((rearCfgRef.current?.count || 0) > 0) autoAlignSubs("Rear");
  }, [autoAlignEnabled, tryPolarity, autoAlignSubs]);

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

      {/* RP22 Bass Metrics - NOW USES ANALYSIS SERIES */}
      {(() => {
        // Compute metrics from analysisSeriesAbs (same base as plot)
        if (!analysisSeriesAbs || analysisSeriesAbs.length === 0 || !selectedSeat) {
          return null;
        }
        
        const freqsHz = selectedSeat.freqsHz;
        const splDb = analysisSplDbAbs;
        
        // Generate target curve
        const targetDb = freqsHz.map(f => f <= 80 ? 0 : (-6 / (200 - 80)) * (f - 80));
        
        // Calculate Schroeder frequency
        const w = roomDims?.widthM ?? 0;
        const l = roomDims?.lengthM ?? 0;
        const h = roomDims?.heightM ?? 0;
        const volume = w * l * h;
        const rt60 = 0.4;
        const schroederHz = volume > 0 ? 2000 * Math.sqrt(rt60 / volume) : 80;
        
        // Compute P14 (20-80 Hz max SPL)
        const band20_80 = splDb
          .map((spl, i) => ({ freq: freqsHz[i], spl }))
          .filter(p => p.freq >= 20 && p.freq <= 80 && Number.isFinite(p.spl));
        const p14MaxSpl = band20_80.length > 0 
          ? Math.max(...band20_80.map(p => p.spl))
          : 0;
        
        // Compute P18 (in-room -3dB extension)
        const deviation = splDb.map((spl, i) => spl - targetDb[i]);
        const refBand = deviation
          .map((dev, i) => ({ freq: freqsHz[i], dev }))
          .filter(p => p.freq >= 50 && p.freq <= 80);
        const refLevel = refBand.length > 0
          ? refBand.reduce((sum, p) => sum + p.dev, 0) / refBand.length
          : 0;
        const targetLevel = refLevel - 3;
        
        let p18F3Hz = 15;
        for (let i = 0; i < freqsHz.length; i++) {
          if (freqsHz[i] >= 10 && deviation[i] >= targetLevel) {
            p18F3Hz = freqsHz[i];
            break;
          }
        }
        
        // Compute P19 (max deviation below Schroeder, with 1/3 smoothing)
        const smoothedForP19 = applyRewStyleDisplaySmoothing(
          analysisSeriesAbs,
          '1/3'
        ).map(p => p.spl);
        
        const belowSchroeder = smoothedForP19
          .map((spl, i) => ({ freq: freqsHz[i], dev: Math.abs(spl - targetDb[i]) }))
          .filter(p => p.freq <= schroederHz && Number.isFinite(p.dev));
        const p19MaxDev = belowSchroeder.length > 0
          ? Math.max(...belowSchroeder.map(p => p.dev))
          : 0;
        
        // Bass uniformity (from engine metrics)
        const uniformitySd = simulationResults.metrics?.uniformity?.sdDb_20_80 || 0;
        
        return (
          <div className="grid grid-cols-4 gap-3">
            <div className="rounded-lg border border-[#DCDBD6] bg-white p-3">
              <div className="text-xs text-[#3E4349] mb-1">P14 Max SPL</div>
              <div className="text-lg font-bold text-[#1B1A1A]">
                {fmtFixed(p14MaxSpl, 1)} dB
              </div>
            </div>
            <div className="rounded-lg border border-[#DCDBD6] bg-white p-3">
              <div className="text-xs text-[#3E4349] mb-1">P18 Extension</div>
              <div className="text-lg font-bold text-[#1B1A1A]">
                {fmtFixed(p18F3Hz, 0)} Hz
              </div>
            </div>
            <div className="rounded-lg border border-[#DCDBD6] bg-white p-3">
              <div className="text-xs text-[#3E4349] mb-1">P19 Deviation</div>
              <div className="text-lg font-bold text-[#1B1A1A]">
                ±{fmtFixed(p19MaxDev, 1)} dB
              </div>
            </div>
            <div className="rounded-lg border border-[#DCDBD6] bg-white p-3">
              <div className="text-xs text-[#3E4349] mb-1">Bass Uniformity</div>
              <div className="text-lg font-bold text-[#1B1A1A]">
                ±{fmtFixed(uniformitySd, 1)} dB
              </div>
              <div className="text-xs text-[#3E4349] mt-1">20–80 Hz</div>
            </div>
          </div>
        );
      })()}
      
      {/* Designer Warnings */}
      {simulationResults.metrics?.designerWarnings && simulationResults.metrics.designerWarnings.length > 0 && (
        <div className="space-y-2">
          {simulationResults.metrics.designerWarnings.map((warning, i) => (
            <Alert 
              key={i} 
              className={`border ${
                warning.severity === 'warning' 
                  ? 'border-[#C1B6AD] bg-[#F8F8F7]' 
                  : 'border-[#DCDBD6] bg-[#F9F9F6]'
              } text-[#3E4349]`}
            >
              <AlertDescription className="text-sm">
                <strong>{warning.severity === 'warning' ? '⚠️ Warning' : '💡 Note'}:</strong> {warning.message}
              </AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-xs">
        <Badge className="bg-[#F8F8F7] text-[#1B1A1A] border-[#DCDBD6]">
          Room: {dimsTxt}
        </Badge>
        <Badge className="bg-[#F8F8F7] text-[#1B1A1A] border-[#DCDBD6]">
          Subs: {totalSubCount}
        </Badge>
        <Badge className="bg-[#F8F8F7] text-[#1B1A1A] border-[#DCDBD6]">
          Seats: {seatingPositions?.length ?? 0}
        </Badge>
      </div>
      
      {/* Subwoofer Warnings */}
      {(subWarnings?.front?.length > 0 || subWarnings?.rear?.length > 0) && (
        <Alert className="border border-[#C1B6AD] bg-[#F8F8F7] text-[#3E4349]">
          <AlertDescription className="text-sm">
            {subWarnings.front.map((w, i) => <div key={`f-${i}`}>{w}</div>)}
            {subWarnings.rear.map((w, i) => <div key={`r-${i}`}>{w}</div>)}
          </AlertDescription>
        </Alert>
      )}

      {/* Bass Response Graph */}
      <div style={{ border: "1px solid #DCDBD6", borderRadius: 16, background: "#FFFFFF", padding: 12 }}>
        {/* B44 DEBUG STRIP (temporary) */}
        <div style={{
          marginTop: 8,
          marginBottom: 12,
          padding: '8px 10px',
          border: '1px solid #DCDBD6',
          borderRadius: 8,
          background: '#FFF6E6',
          fontSize: 12,
          color: '#1B1A1A'
        }}>
          <div><strong>DEBUG</strong></div>
          <div>globalThis.__B44_BASS_AUDIT: {String(globalThis?.__B44_BASS_AUDIT)}</div>
          <div>simulationResults.audit exists: {String(!!simulationResults?.audit)}</div>
          <div>contributors length: {String(simulationResults?.audit?.contributors?.length ?? 0)}</div>
          <div>summations length: {String(simulationResults?.audit?.summations?.length ?? 0)}</div>
          <div>hasNoSeats: {String(!!hasNoSeats)} | hasNoSubs: {String(!!hasNoSubs)}</div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, gap: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#1B1A1A" }}>
            Bass Response
            {isDraggingSub && (
              <span style={{ marginLeft: 12, fontSize: 11, color: "#f59e0b", fontWeight: 600 }}>
                ⏸ Dragging… (updates on release)
              </span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* Bass Audit toggle (always visible) */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Label htmlFor="bass-audit" className="text-xs text-[#3E4349] whitespace-nowrap">
                Bass Audit (REW comparison)
              </Label>
              <Switch
                id="bass-audit"
                checked={auditUiEnabled}
                onCheckedChange={handleAuditToggle}
              />
              </div>

              {/* REW Strict Parity toggle */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Label htmlFor="rew-strict" className="text-xs text-[#3E4349] whitespace-nowrap">
                REW Strict (Parity)
              </Label>
              <Switch
                id="rew-strict"
                checked={rewStrictParity}
                onCheckedChange={setRewStrictParity}
              />
              </div>

              {rewStyleMode && (
              <>
                {/* Advanced controls visible only when REW mode is ON */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Label htmlFor="rew-compare" className="text-xs text-[#3E4349] whitespace-nowrap">
                    REW Compare View
                  </Label>
                  <Switch
                    id="rew-compare"
                    checked={rewCompareView}
                    onCheckedChange={setRewCompareView}
                  />
                </div>

                {/* REW Movement Test Preset (Part D) */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // Skip if Compare View is active (Compare forces its own smoothing)
                    if (rewCompareView) return;
                    
                    // Set standardized test environment
                    const { setRoomDims, setSeatingPositions, setFrontSubsCfg, setRearSubsCfg } = useAppState.getState ? useAppState.getState() : {};

                    // Room: 5.0 × 5.0 × 3.0
                    if (setRoomDims) {
                      setRoomDims({ widthM: 5.0, lengthM: 5.0, heightM: 3.0 });
                    }

                    // MLP at (2.50, 2.62, 1.20)
                    if (setSeatingPositions) {
                      setSeatingPositions([{
                        id: 'mlp-test',
                        x: 2.50,
                        y: 2.62,
                        z: 1.20,
                        isPrimary: true
                      }]);
                    }

                    // One sub at front wall (2.5, 0.15, 0.0)
                    if (setFrontSubsCfg) {
                      setFrontSubsCfg({
                        count: 1,
                        model: 'SUB2-12',
                        positions: [{ x: 2.5, y: 0.15 }],
                        settingsById: {
                          'front-sub-left': { gainDb: 0, delayMs: 0, polarity: 'normal' }
                        }
                      });
                    }

                    if (setRearSubsCfg) {
                      setRearSubsCfg({ count: 0 });
                    }

                    // Force REW settings
                    setRewRelativeView(false); // Absolute SPL
                    setShowRewModeLines(true);
                    setLinearHzAxis(false); // Log Hz axis
                    setYAxisLocked(true);
                  }}
                  className="text-xs h-7 px-3 whitespace-nowrap"
                >
                  REW Movement Test Preset
                </Button>

                {/* MLP Nudge (Part D) */}
                {typeof globalThis !== 'undefined' && globalThis.__B44_BASS_DEBUG && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const currentSeats = seatingPositions || [];
                      const mlpSeat = currentSeats.find(s => s.isPrimary) || currentSeats[0];

                      if (mlpSeat) {
                        const { setSeatingPositions } = useAppState.getState ? useAppState.getState() : {};

                        if (setSeatingPositions) {
                          const newSeats = currentSeats.map(s => 
                            s.isPrimary || s.id === mlpSeat.id
                              ? { ...s, x: (s.x || 0) + 0.25 }
                              : s
                          );
                          setSeatingPositions(newSeats);
                        }
                      }
                    }}
                    className="text-xs h-7 px-3 whitespace-nowrap"
                  >
                    Nudge MLP width +0.25m
                  </Button>
                )}
              </>
            )}

            {rewStyleMode && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 6, borderLeft: "1px solid #DCDBD6", paddingLeft: 12 }}>
                  <Label htmlFor="lock-y-axis" className="text-xs text-[#3E4349] whitespace-nowrap">
                    Lock Y-axis
                  </Label>
                  <Switch
                    id="lock-y-axis"
                    checked={yAxisLocked}
                    onCheckedChange={setYAxisLocked}
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetScale}
                  className="text-xs h-7 px-2"
                >
                  Reset scale
                </Button>
              </>
            )}
          </div>

          <div style={{ fontSize: 12, color: "#3E4349" }}>
            Showing: {selectedSeat?.isPrimary ? "MLP" : `Seat ${selectedSeat?.id ?? ""}`}
          </div>
        </div>

        {/* Live Control Status Strip */}
        <div style={{ 
          fontSize: 10, 
          color: "#3E4349", 
          fontFamily: "monospace",
          background: "#F8F8F7",
          padding: "4px 8px",
          borderRadius: 4,
          border: "1px solid #DCDBD6",
          marginBottom: 6
        }}>
          User smoothing: {rewSmoothing} | Graph smoothing: {graphSmoothing} | Compare: {String(rewCompareView)} | Audit: {String(globalThis?.__B44_BASS_AUDIT === true)} | Dragging: {String(isDraggingSub)} | DisableSealed: {String(debugDisableSealedGain)}
        </div>

        {/* Engine Parameter Verification */}
        <div style={{ 
          fontSize: 10, 
          color: "#1B1A1A", 
          fontFamily: "monospace",
          background: "#FFF6E6",
          padding: "4px 8px",
          borderRadius: 4,
          border: "1px solid #C1B6AD",
          marginBottom: 8
        }}>
          seatResponses: {Object.keys(simulationResults.seatResponses || {}).length}
        </div>

        {/* REW Parity Test Case (Part E - VALIDATION) */}
        {rewStyleMode && typeof globalThis !== 'undefined' && globalThis.__B44_BASS_REW_TEST && (() => {
          // Test room: 5.0 × 5.0 × 3.0 m
          const testRoomOk = Math.abs((roomDims?.widthM || 0) - 5.0) < 0.1 &&
                             Math.abs((roomDims?.lengthM || 0) - 5.0) < 0.1 &&
                             Math.abs((roomDims?.heightM || 0) - 3.0) < 0.1;
          
          // Test seat: centre (2.5, 2.5, 1.2)
          const seat = seatingPositions?.find(s => s.isPrimary) || seatingPositions?.[0];
          const testSeatOk = seat && 
                             Math.abs(seat.x - 2.5) < 0.1 &&
                             Math.abs(seat.y - 2.5) < 0.1 &&
                             Math.abs((seat.z || 1.2) - 1.2) < 0.1;
          
          // Test sub positions (capture current position for validation)
          const testSubOk = subsForSimulation.length > 0;
          const currentSubPos = testSubOk ? {
            x: subsForSimulation[0].x,
            y: subsForSimulation[0].y,
            z: subsForSimulation[0].z ?? 0.0
          } : null;
          
          // Check if RAW mode is enabled
          const rawModeOk = modalOnlyDebugView;
          
          // Compute test positions for manual validation
          const testPositions = [
            { label: 'Front wall centre', x: 2.5, y: 0.5, z: 0.0 },
            { label: 'Front wall 0.5m left', x: 2.0, y: 0.5, z: 0.0 },
            { label: 'Front wall 1.0m left', x: 1.5, y: 0.5, z: 0.0 },
            { label: 'Front wall corner', x: 0.5, y: 0.5, z: 0.0 }
          ];
          
          // Find closest test position to current sub
          let closestTest = null;
          let minDist = Infinity;
          if (currentSubPos) {
            testPositions.forEach(tp => {
              const dx = tp.x - currentSubPos.x;
              const dy = tp.y - currentSubPos.y;
              const dist = Math.sqrt(dx*dx + dy*dy);
              if (dist < minDist && dist < 0.2) { // within 20cm
                minDist = dist;
                closestTest = tp;
              }
            });
          }
          
          const allReady = testRoomOk && testSeatOk && testSubOk && rawModeOk;
          
          const probeFreqs = [34, 68]; // First two length axial modes in 5m room
          const probeValues = allReady ? probeFreqs.map(fProbe => {
            const idx = displayData.findIndex(d => Math.abs(d.frequency - fProbe) < 1);
            return idx >= 0 ? displayData[idx].spl : null;
          }) : [];
          
          return (
            <div className="text-xs mb-2 bg-purple-50 p-2 rounded border border-purple-400">
              <div className="font-semibold mb-1 text-purple-700">🧪 REW Parity Test (Part E - VALIDATION)</div>
              <div className="text-[10px] space-y-0.5">
                <div><strong>Test room:</strong> {testRoomOk ? '✅' : '❌'} 5.0×5.0×3.0 m (current: {fmtFixed(roomDims?.widthM, 1)}×{fmtFixed(roomDims?.lengthM, 1)}×{fmtFixed(roomDims?.heightM, 1)})</div>
                <div><strong>Test seat:</strong> {testSeatOk ? '✅' : '❌'} Centre (2.5, 2.5, 1.2) (current: {fmtFixed(seat?.x, 1)}, {fmtFixed(seat?.y, 1)}, {fmtFixed(seat?.z || 1.2, 1)})</div>
                <div><strong>Test sub:</strong> {testSubOk ? '✅' : '❌'} At least one sub (current: {subsForSimulation.length})</div>
                <div><strong>RAW mode:</strong> {rawModeOk ? '✅ ENABLED' : '❌ DISABLED (toggle above)'}</div>
                <div className="mt-1 pt-1 border-t border-purple-300">
                  <strong>Status:</strong> {allReady ? '🟢 READY' : '🔴 NOT READY'}
                </div>
                {allReady && currentSubPos && (
                  <>
                    <div className="mt-1 pt-1 border-t border-purple-300 font-semibold text-purple-800">
                     Current sub position: ({fmtFixed(currentSubPos.x, 2)}, {fmtFixed(currentSubPos.y, 2)})
                     {closestTest && ` ≈ ${closestTest.label}`}
                    </div>
                    <div className="mt-1 pt-1 border-t border-purple-300">
                      <strong>Probe frequencies (1st/2nd length axial):</strong>
                      <div className="pl-2 space-y-0.5 mt-1">
                        <div>34 Hz: {fmtFixed(probeValues[0], 1, 'N/A')} dB</div>
                        <div>68 Hz: {fmtFixed(probeValues[1], 1, 'N/A')} dB</div>
                      </div>
                    </div>
                    <div className="mt-1 pt-1 border-t border-purple-300 font-semibold text-purple-800">
                      Test procedure:
                      <div className="pl-2 space-y-0.5 mt-1 font-normal">
                        <div>1. Move sub to front wall centre (2.5, 0.5) → record 34/68 Hz SPL</div>
                        <div>2. Move sub 0.5m left (2.0, 0.5) → record 34/68 Hz SPL</div>
                        <div>3. Move sub 1.0m left (1.5, 0.5) → record 34/68 Hz SPL</div>
                        <div>4. Move sub to corner (0.5, 0.5) → record 34/68 Hz SPL</div>
                        <div className="mt-1 text-red-700 font-semibold">
                          Expected: 34 Hz SPL must change by &gt;3 dB across positions
                        </div>
                        <div className="text-red-700 font-semibold">
                          Expected: Null locations must shift visibly on graph
                        </div>
                      </div>
                    </div>
                  </>
                )}
                {!allReady && (
                  <div className="mt-1 pt-1 border-t border-purple-300 text-red-700">
                    Fix missing items above, then drag sub along front wall to validate null migration.
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* REW Parity Validator (only when REW Compare is ON and NOT dragging) */}
        {rewCompareView && rewStyleMode && !isDraggingSub && (
          <div className="mb-4 space-y-3">
            <RewParityValidator
              b44Series={plottedSeries}
              rewSeries={null}
            />
            <RewParityValidatorStrict
              b44Series={plottedSeries}
              rewSeries={null}
            />
          </div>
        )}

        {/* REW Compare View readout (only when REW Compare is ON) */}
        {rewCompareView && rewStyleMode && (() => {
          // Safe refDb: use debug.normRefDb or fallback to display mode target
          const refDbDisplay = false?.normRefDb 
            ? (typeof false.normRefDb === 'string' ? false.normRefDb : fmtFixed(false.normRefDb, 1))
            : (rewRelativeView ? "0.0" : "85.0");
          
          return (
            <div className="text-xs text-[#1B1A1A] mb-2 bg-blue-50 p-2 rounded border border-blue-300">
              <div className="font-semibold mb-1">REW Compare View (Display Preset)</div>
              <div className="text-[10px] space-y-0.5">
                <div>• Room: {fmtFixed(roomDims?.widthM, 1)}×{fmtFixed(roomDims?.lengthM, 1)}×{fmtFixed(roomDims?.heightM, 1)} m</div>
                <div>• Smoothing: 1/3 octave (fixed)</div>
                <div>• Sealed room: ALWAYS (cinemas are sealed)</div>
                <div>• Absolute SPL mode (30–80 Hz → 85 dB reference)</div>
                <div>• RefDb (median 30–80): {typeof refDbDisplay === 'string' ? refDbDisplay : fmtFixed(refDbDisplay, 1)} dB</div>
                <div>• Y window: 65–105 dB (fixed for comparison)</div>
                <div className="text-[9px] opacity-70 mt-1">Engine SPL range (raw): {typeof safeDebug?.splMinDb === 'string' ? safeDebug.splMinDb : fmtFixed(safeDebug?.splMinDb, 1)} to {typeof safeDebug?.splMaxDb === 'string' ? safeDebug.splMaxDb : fmtFixed(safeDebug?.splMaxDb, 1)} dB</div>
                <div className="text-[9px] opacity-70">Display SPL range: {(() => {
                  const finite = displayData.filter(d => Number.isFinite(d.spl)).map(d => d.spl);
                  if (finite.length === 0) return 'N/A';
                  return `${fmtFixed(Math.min(...finite), 1)} to ${fmtFixed(Math.max(...finite), 1)} dB`;
                })()}</div>
                <div className="text-[9px] opacity-70 text-purple-700 font-semibold mt-1">
                  LF delta (25→69 Hz): {safeDebug?.lfProbe?.lfDelta_25_69 || 'N/A'} dB | 
                  Upper-bass delta (69→120 Hz): {safeDebug?.lfProbe?.upperBassDelta_69_120 || 'N/A'} dB
                </div>
                {rewCompareBaselineRef.current && (
                  <div className="text-[9px] opacity-70 mt-1 pt-1 border-t border-blue-200">
                    Baseline: captured at {new Date(rewCompareBaselineRef.current.timestamp).toLocaleTimeString()}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (safeRewModesData?.splDb && safeRewModesData.debug?.splDbRepaired) {
                          rewCompareBaselineRef.current = {
                            splDbRepaired: [...safeRewModesData.debug.splDbRepaired],
                            freqs: [...safeRewModesData.freqs],
                            sourceSigRounded: safeRewModesData.debug?.sourceSigRounded,
                            seatSigRounded: safeRewModesData.debug?.seatSigRounded,
                            timestamp: Date.now()
                          };
                        }
                      }}
                      className="text-[9px] h-5 px-2 ml-2"
                    >
                      Update baseline
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        })()}



        {/* LF Probe Raw (only when debug enabled) */}
        {rewStyleMode && typeof globalThis !== 'undefined' && globalThis.__B44_BASS_DEBUG && (() => {
          if (!safeDebug?.lfProbeRaw) return null;

          return (
            <div className="text-xs text-[#3E4349] mb-2 bg-orange-50 p-2 rounded border border-orange-300">
              <div className="font-semibold mb-1 text-orange-700">LF Probe Raw (Pre-smoothing)</div>
              <div className="text-[9px] space-y-0.5 font-mono">
                {safeDebug.lfProbeRaw.map((probe, i) => (
                  <div key={i}>
                    {probe.freq} Hz: blended={fmtFixed(probe.blendedMagDb_pre, 2)} (w={fmtFixed(probe.w, 2)}, direct={fmtFixed(probe.directMagDb_pre, 2)}, modal={fmtFixed(probe.scaledModalMagDb_pre, 2)})
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Sensitivity Audit (only when REW Compare View is ON) */}
        {rewCompareView && sensitivityAudit && (
          <div className="text-xs text-[#3E4349] mb-2 bg-yellow-50 p-2 rounded border border-yellow-400">
            <div className="font-semibold mb-1 text-yellow-800">Sensitivity Audit (last move)</div>
            <div className="text-[9px] space-y-0.5 font-mono">
              <div className="mb-1"><strong>Audit curve:</strong> no smoothing, no normalisation</div>
              <div><strong>SourceSig changed:</strong> {sensitivityAudit.sourceChanged ? 'YES' : 'NO (first run)'}</div>
              
              {sensitivityAudit.sourceChanged && sensitivityAudit.probeDeltas && (
                <>
                  <div className="mt-2 font-semibold">Probe ΔdB (current - previous):</div>
                  {sensitivityAudit.probeDeltas.map((p, i) => (
                    <div key={i}>
                      {p.freq} Hz: {p.delta >= 0 ? '+' : ''}{fmtFixed(p.delta, 2)} dB
                    </div>
                  ))}
                  <div className="mt-1">
                    <strong>Max |Δ|:</strong> {fmtFixed(sensitivityAudit?.maxDelta, 2)} dB
                  </div>
                  <div>
                    <strong>Avg |Δ|:</strong> {fmtFixed(sensitivityAudit?.avgDelta, 2)} dB
                  </div>
                </>
              )}

              <div className="mt-2 font-semibold">Modal Coupling (axial, n=1, first sub):</div>
              <div>Source term: {fmtFixed(sensitivityAudit?.currentCoupling?.src, 3)}</div>
              <div>Receiver term: {fmtFixed(sensitivityAudit?.currentCoupling?.rcv, 3)}</div>
              <div>Total: {fmtFixed(sensitivityAudit?.currentCoupling?.total, 3)}</div>

              {sensitivityAudit.sourceChanged && sensitivityAudit.couplingDeltas && (
                <>
                  <div className="mt-1 font-semibold">Coupling Δ:</div>
                  <div>Source Δ: {(toNum(sensitivityAudit?.couplingDeltas?.src) ?? 0) >= 0 ? '+' : ''}{fmtFixed(sensitivityAudit?.couplingDeltas?.src, 3)}</div>
                  <div>Receiver Δ: {(toNum(sensitivityAudit?.couplingDeltas?.rcv) ?? 0) >= 0 ? '+' : ''}{fmtFixed(sensitivityAudit?.couplingDeltas?.rcv, 3)}</div>
                  <div>Total Δ: {(toNum(sensitivityAudit?.couplingDeltas?.total) ?? 0) >= 0 ? '+' : ''}{fmtFixed(sensitivityAudit?.couplingDeltas?.total, 3)}</div>
                </>
              )}

              {sensitivityAudit.sourceChanged && (
                <div className={`mt-2 font-semibold ${sensitivityAudit.verdict.includes('NOT RESPONDING') ? 'text-red-600' : 'text-green-600'}`}>
                  Sensitivity verdict: {sensitivityAudit.verdict}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Advanced debug controls (dev only) */}
        {devMode && (
          <div className="space-y-2 p-2 bg-yellow-50 rounded border border-yellow-400">
            <div className="text-xs font-semibold text-yellow-900">Dev Controls</div>
            <div className="flex items-center gap-2">
              <Switch 
                id="modal-only-debug" 
                checked={modalOnlyDebugView}
                onCheckedChange={setModalOnlyDebugView}
              />
              <Label htmlFor="modal-only-debug" className="text-xs">RAW mode</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch 
                id="disable-sealed" 
                checked={debugDisableSealedGain}
                onCheckedChange={setDebugDisableSealedGain}
              />
              <Label htmlFor="disable-sealed" className="text-xs">Disable sealed gain</Label>
            </div>
          </div>
        )}
        
        {/* RAW mode banner (dev only) */}
        {devMode && modalOnlyDebugView && (
          <div className="text-xs mb-2 bg-red-50 p-2 rounded border border-red-400">
            <div className="font-semibold mb-1 text-red-700">🔴 RAW MODE ACTIVE</div>
            <div className="text-[10px]">Pure physics output, no processing</div>
          </div>
        )}



        {/* SBIR debug info */}
        {rewStyleMode && !modalOnlyDebugView && (() => {
        if (!safeDebug?.sbirEnabled) return null;

        const probe40 = safeDebug?.sbirDebugProbe40Hz;
        const probe63 = (safeDebug && safeDebug.sbirDebugProbe63Hz) ? safeDebug.sbirDebugProbe63Hz : null;

          return (
            <div className="text-xs text-[#3E4349] mb-2 bg-blue-50 p-2 rounded border border-blue-300">
              <div className="font-semibold mb-1 text-blue-700">
                SBIR: {safeDebug.sbirEnabled ? 'ON' : 'OFF'}, order={safeDebug.sbirMaxOrder || 2}
                {sbirDebugSingleFrontWall && <span className="ml-2 text-red-600 font-bold">— DIAGNOSTIC: FRONT WALL ONLY</span>}
              </div>
              {probe40 && (
                <>
                  <div className="text-[9px] font-mono">
                    Paths used: {probe40.pathsUsed || 'N/A'}
                  </div>
                  {probe40.strongestReflection && (
                    <div className="text-[9px] font-mono">
                      Strongest reflection at 40 Hz: {probe40.strongestReflection.surface} ({fmtFixed(probe40.strongestReflection.magDb, 1)} dB)
                    </div>
                  )}
                  <div className="text-[9px] font-mono mt-1 pt-1 border-t border-blue-200 space-y-0.5">
                    <div>Direct only: {fmtFixed(probe40.directOnlyDb, 1)} dB</div>
                    <div>SBIR total: {fmtFixed(probe40.sbirTotalDb, 1)} dB</div>
                    <div>Combined result: {probe40.combinedResultDb} dB</div>
                  </div>
                </>
              )}
              
              {/* 63 Hz DIAGNOSTIC - Single Reflection Interference Test */}
              {probe63 ? (
                <div className="mt-2 pt-2 border-t border-red-300 bg-red-50 rounded p-2">
                  <div className="font-semibold mb-1 text-red-700">
                    🔬 63 Hz Null Test {probe63.diagnosticMode === 'SINGLE FRONT WALL ONLY' ? '(DIAGNOSTIC MODE)' : '(ALL REFLECTIONS)'}
                  </div>
                  <div className="text-[9px] font-mono space-y-0.5">
                    <div className="font-semibold">Direct path:</div>
                    <div className="pl-2">Distance: {probe63.directDistance} m</div>
                    <div className="pl-2">Magnitude: {probe63.directMagLinear} ({probe63.directMagDb} dB)</div>
                    <div className="pl-2">Complex: Re={probe63.directRe}, Im={probe63.directIm}</div>
                    
                    <div className="font-semibold mt-1">Front wall reflection:</div>
                    <div className="pl-2">Distance: {probe63.reflectedDistance} m</div>
                    <div className="pl-2">Magnitude: {probe63.reflectedMagLinear} ({probe63.reflectedMagDb} dB)</div>
                    <div className="pl-2">Reflection coeff: {probe63.reflectionCoeff}</div>
                    <div className="pl-2">Complex: Re={probe63.reflectedRe}, Im={probe63.reflectedIm}</div>
                    
                    <div className="font-semibold mt-1 text-red-800">Interference:</div>
                    <div className="pl-2">Phase difference: {probe63.phaseDiffDeg}° {Math.abs(parseFloat(probe63.phaseDiffDeg) - 180) < 30 ? '(near 180° → CANCELLATION)' : ''}</div>
                    <div className="pl-2">Coherent sum: Re={probe63.sumRe}, Im={probe63.sumIm}</div>
                    <div className="pl-2 font-bold text-red-700">
                      Combined: {probe63.combinedMagLinear} ({probe63.combinedMagDb} dB)
                      {parseFloat(probe63.combinedMagDb) < parseFloat(probe63.directMagDb) - 6 ? ' ← DEEP NULL (>6 dB)' : ''}
                    </div>
                    
                    <div className="mt-1 pt-1 border-t border-red-300 text-[8px]">
                      Expected: If phase diff ≈180° and reflected mag is within ~12 dB of direct, combined should show deep null.
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-2 pt-2 border-t border-gray-300 text-[9px] text-gray-500">
                  63 Hz probe: (no data yet)
                </div>
              )}
            </div>
          );
        })()}

        {/* LF Movement Probe (spatial coupling verification) */}
        {rewStyleMode && !modalOnlyDebugView && (() => {
          const movementProbe = safeDebug?.lfMovementProbe;
          if (!movementProbe || Object.keys(movementProbe).length === 0) return null;

          return (
            <div className="text-xs text-[#3E4349] mb-2 bg-green-50 p-2 rounded border border-green-300">
              <div className="font-semibold mb-1 text-green-700">LF Movement Probe (25/35/45 Hz)</div>
              <div className="text-[9px] font-mono space-y-1">
                {Object.entries(movementProbe).map(([freq, data]) => (
                  <div key={freq} className="border-t border-green-200 pt-1 first:border-t-0 first:pt-0">
                    <div className="font-semibold">{freq} Hz (mode {data.nearestModeHz} Hz):</div>
                    <div className="pl-2 space-y-0.5">
                      <div>Source term: {data.sourceTerm}, Seat term: {data.seatTerm}</div>
                      <div>Total coupling: {data.totalCoupling}</div>
                      <div>Modal SPL: {data.modalSplDb} dB</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Per-mode contributions (phase debug) */}
        {rewStyleMode && !modalOnlyDebugView && (() => {
          const modeContribs = safeDebug?.modeContributions;
          if (!modeContribs || Object.keys(modeContribs).length === 0) return null;

          // Get seat and source for eigenfunction debug
          const seat = seatingPositions?.find(s => s.isPrimary) || seatingPositions?.[0];
          const source = subsForSimulation.length > 0 ? subsForSimulation[0] : null;
          
          if (!seat || !source || !roomDims?.widthM || !roomDims?.lengthM || !roomDims?.heightM) {
            return null;
          }
          
          const W = roomDims.widthM;
          const L = roomDims.lengthM;
          const H = roomDims.heightM;
          const seatPos = { x: seat.x, y: seat.y, z: seat.z ?? 1.2 };

          // Show contributions for key probe frequencies
          const probeFreqs = ['34.0', '40.0', '45.0', '60.0'];
          const relevantContribs = probeFreqs
            .map(fStr => ({ freq: fStr, modes: modeContribs[fStr] }))
            .filter(entry => entry.modes && entry.modes.length > 0);

          if (relevantContribs.length === 0) return null;

          return (
            <div className="text-xs text-[#3E4349] mb-2 bg-purple-50 p-2 rounded border border-purple-300">
              <div className="font-semibold mb-1 text-purple-700">Per-Mode Contributions (Top 3)</div>
              <div className="text-[9px] font-mono space-y-1 max-h-48 overflow-y-auto">
                {relevantContribs.map((entry, i) => (
                  <div key={i}>
                    <div className="font-semibold">{entry.freq} Hz:</div>
                    {entry.modes.map((mode, j) => {
                      const [nx, ny, nz] = mode.n;
                      
                      // Compute eigenfunction values (Part H2 - eigenfunction debug readout)
                      const srcEigenX = nx > 0 ? Math.cos(nx * Math.PI * source.x / W) : 1;
                      const srcEigenY = ny > 0 ? Math.cos(ny * Math.PI * source.y / L) : 1;
                      const srcEigenZ = nz > 0 ? Math.cos(nz * Math.PI * (source.z ?? 0.0) / H) : 1;
                      
                      const rcvEigenX = nx > 0 ? Math.cos(nx * Math.PI * seatPos.x / W) : 1;
                      const rcvEigenY = ny > 0 ? Math.cos(ny * Math.PI * seatPos.y / L) : 1;
                      const rcvEigenZ = nz > 0 ? Math.cos(nz * Math.PI * seatPos.z / H) : 1;
                      
                      const computedCoupling = (srcEigenX * srcEigenY * srcEigenZ) * (rcvEigenX * rcvEigenY * rcvEigenZ);
                      
                      return (
                        <div key={j} className="pl-2 border-l-2 border-purple-200 mb-1">
                          <div>
                           {mode.type} ({mode.n[0]},{mode.n[1]},{mode.n[2]}): {fmtFixed(mode.magDb, 1)} dB @ {fmtFixed(mode.phaseDeg, 0)}°
                          </div>
                          <div className="pl-2 text-[8px] opacity-80 space-y-0.5 mt-0.5">
                            <div>src: X={fmtFixed(srcEigenX, 4)} Y={fmtFixed(srcEigenY, 4)} Z={fmtFixed(srcEigenZ, 4)}</div>
                            <div>rcv: X={fmtFixed(rcvEigenX, 4)} Y={fmtFixed(rcvEigenY, 4)} Z={fmtFixed(rcvEigenZ, 4)}</div>
                            <div>coupling (real) = {fmtFixed(computedCoupling, 4)} (engine: {fmtFixed(mode.coupling, 4, 'N/A')})</div>
                            {mode.couplingInfo?.amp !== undefined && (
                              <div className="text-green-600 font-semibold">
                                amplitude (cosine): {fmtFixed(mode.couplingInfo.amp, 4)}
                              </div>
                            )}
                            {mode.couplingInfo?.phaseDeg !== undefined && (
                              <div className="text-purple-600 font-semibold">
                                phase: {fmtFixed(mode.couplingInfo.phaseDeg, 1)}°
                              </div>
                            )}
                            {mode.couplingInfo?.complexMag !== undefined && (
                              <div className="text-blue-600 font-semibold">
                                coupling (complex): mag={fmtFixed(mode.couplingInfo.complexMag, 4)} @ {fmtFixed(mode.couplingInfo.complexPhase, 1)}°
                              </div>
                            )}
                            {mode.couplingInfo?.complexRe !== undefined && (
                              <div className="text-blue-600">
                                (re={fmtFixed(mode.couplingInfo.complexRe, 4)}, im={fmtFixed(mode.couplingInfo.complexIm, 4)})
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
              {safeDebug?.phaseCheckAvailable && (
                <div className="text-[9px] mt-1 pt-1 border-t border-purple-200">
                  Phase check at 34 Hz available in console: <code>globalThis.__B44_PHASE_CHECK</code>
                </div>
              )}
            </div>
          );
        })()}

        {/* Coupling Phase Probe (Part HB - verify complex eigenfunctions) */}
        {rewStyleMode && typeof globalThis !== 'undefined' && globalThis.__B44_BASS_DEBUG && (() => {
          const modeList = safeDebug?.modeListFirst60;
          if (!modeList || modeList.length === 0 || subsForSimulation.length === 0) return null;
          
          const seat = seatingPositions?.find(s => s.isPrimary) || seatingPositions?.[0];
          if (!seat) return null;
          
          const seatPos = { x: seat.x, y: seat.y, z: seat.z ?? 1.2 };
          const source = subsForSimulation[0];
          
          const W = roomDims?.widthM || 1;
          const L = roomDims?.lengthM || 1;
          const H = roomDims?.heightM || 1;
          
          // Determine which mode to probe
          let probeModeDef = null;
          if (couplingProbeMode === 'auto') {
            // Use first isolated mode if isolation is active
            if (modeIsolation !== 'off') {
              const firstSpec = modeIsolation.split('|')[0];
              const [nx, ny, nz] = firstSpec.split(',').map(n => parseInt(n, 10));
              probeModeDef = modeList.find(m => m.nx === nx && m.ny === ny && m.nz === nz);
            } else {
              // Default to (1,0,0)
              probeModeDef = modeList.find(m => m.nx === 1 && m.ny === 0 && m.nz === 0);
            }
          } else {
            const [nx, ny, nz] = couplingProbeMode.split(',').map(n => parseInt(n, 10));
            probeModeDef = modeList.find(m => m.nx === nx && m.ny === ny && m.nz === nz);
          }
          
          if (!probeModeDef) return null;
          
          const { nx, ny, nz, fHz } = probeModeDef;
          const probeFreqs = [fHz - 1, fHz, fHz + 1];
          
          // Helper: compute eigenfunction (real or complex)
          const computeEigen = (n, x, dim, useComplex) => {
            if (n === 0) {
              return useComplex ? { re: 1, im: 0 } : 1;
            }
            
            if (useComplex) {
              const arg = n * Math.PI * x / dim;
              return { re: Math.cos(arg), im: Math.sin(arg) };
            } else {
              return Math.cos(n * Math.PI * x / dim);
            }
          };
          
          // Compute at probe frequencies
          const probeResults = probeFreqs.map(f => {
            if (couplingProbeUseComplex) {
              // AMPLITUDE: Cosine terms (position-dependent)
              const srcCosX = nx > 0 ? Math.cos(nx * Math.PI * source.x / W) : 1;
              const srcCosY = ny > 0 ? Math.cos(ny * Math.PI * source.y / L) : 1;
              const srcCosZ = nz > 0 ? Math.cos(nz * Math.PI * (source.z ?? 0.0) / H) : 1;
              const srcAmp = srcCosX * srcCosY * srcCosZ;
              
              const rcvCosX = nx > 0 ? Math.cos(nx * Math.PI * seatPos.x / W) : 1;
              const rcvCosY = ny > 0 ? Math.cos(ny * Math.PI * seatPos.y / L) : 1;
              const rcvCosZ = nz > 0 ? Math.cos(nz * Math.PI * seatPos.z / H) : 1;
              const rcvAmp = rcvCosX * rcvCosY * rcvCosZ;
              
              const amp = srcAmp * rcvAmp;
              
              // PHASE: Eigenfunction phase difference
              const srcPhase = (nx * Math.PI * source.x / W) + (ny * Math.PI * source.y / L) + (nz * Math.PI * (source.z ?? 0.0) / H);
              const rcvPhase = (nx * Math.PI * seatPos.x / W) + (ny * Math.PI * seatPos.y / L) + (nz * Math.PI * seatPos.z / H);
              const phi = srcPhase - rcvPhase;
              const phiDeg = (phi * 180 / Math.PI) % 360;
              
              // Coupling: amp * exp(j*phi)
              const couplingRe = amp * Math.cos(phi);
              const couplingIm = amp * Math.sin(phi);
              const couplingMag = Math.abs(amp); // Magnitude is just amplitude
              const couplingPhase = phiDeg;
              
              return {
                freq: f,
                amp: amp,
                phi: phiDeg,
                src: { amp: srcAmp, cosX: srcCosX, cosY: srcCosY, cosZ: srcCosZ },
                rcv: { amp: rcvAmp, cosX: rcvCosX, cosY: rcvCosY, cosZ: rcvCosZ },
                coupling: { re: couplingRe, im: couplingIm, mag: couplingMag, phase: couplingPhase, amp: amp, phi: phiDeg }
              };
            } else {
              // Real eigenfunctions
              const srcX = computeEigen(nx, source.x, W, false);
              const srcY = computeEigen(ny, source.y, L, false);
              const srcZ = computeEigen(nz, source.z ?? 0.0, H, false);
              const srcReal = srcX * srcY * srcZ;
              
              const rcvX = computeEigen(nx, seatPos.x, W, false);
              const rcvY = computeEigen(ny, seatPos.y, L, false);
              const rcvZ = computeEigen(nz, seatPos.z, H, false);
              const rcvReal = rcvX * rcvY * rcvZ;
              
              const couplingReal = srcReal * rcvReal;
              
              return {
                freq: f,
                amp: Math.abs(couplingReal),
                phi: couplingReal >= 0 ? 0 : 180,
                src: { re: srcReal, im: 0, mag: Math.abs(srcReal), phase: srcReal >= 0 ? 0 : 180 },
                rcv: { re: rcvReal, im: 0, mag: Math.abs(rcvReal), phase: rcvReal >= 0 ? 0 : 180 },
                coupling: { re: couplingReal, im: 0, mag: Math.abs(couplingReal), phase: couplingReal >= 0 ? 0 : 180, amp: Math.abs(couplingReal), phi: couplingReal >= 0 ? 0 : 180 }
              };
            }
          });
          
          return (
            <div className="text-xs mb-2 bg-cyan-50 p-2 rounded border border-cyan-400">
              <div className="font-semibold mb-1 text-cyan-700">
                🔬 Coupling Phase Probe (Part HB)
              </div>
              <div className="text-[10px] space-y-1">
                <div className="font-semibold">
                  Probing mode: ({nx},{ny},{nz}) @ {fmtFixed(fHz, 1)} Hz
                  {probeModeDef.axisLabel && ` [${probeModeDef.axisLabel}]`}
                </div>
                <div className="text-[9px] opacity-70">
                  Mode: {couplingProbeUseComplex ? 'COMPLEX' : 'REAL'} eigenfunctions
                </div>
                <div className="mt-2 space-y-2 font-mono text-[8px]">
                  {probeResults.map((result, i) => (
                    <div key={i} className="border-t border-cyan-200 pt-1 first:border-t-0 first:pt-0">
                      <div className="font-semibold">{fmtFixed(result.freq, 1)} Hz:</div>
                      <div className="pl-2 space-y-0.5">
                        {couplingProbeUseComplex ? (
                          <>
                            <div className="text-green-600">amp (cosine): {fmtFixed(result.amp, 4)}</div>
                            <div className="text-purple-600">phi: {fmtFixed(result.phi, 1)}°</div>
                            <div>src cosines: X={fmtFixed(result.src.cosX, 4)} Y={fmtFixed(result.src.cosY, 4)} Z={fmtFixed(result.src.cosZ, 4)} → amp={fmtFixed(result.src.amp, 4)}</div>
                            <div>rcv cosines: X={fmtFixed(result.rcv.cosX, 4)} Y={fmtFixed(result.rcv.cosY, 4)} Z={fmtFixed(result.rcv.cosZ, 4)} → amp={fmtFixed(result.rcv.amp, 4)}</div>
                          </>
                        ) : (
                          <>
                            <div>srcEigen: {fmtFixed(result.src.re, 4)} | {fmtFixed(result.src.phase, 1)}°</div>
                            <div>rcvEigen: {fmtFixed(result.rcv.re, 4)} | {fmtFixed(result.rcv.phase, 1)}°</div>
                          </>
                        )}
                        <div className="font-semibold text-cyan-800">
                          coupling: (Re={fmtFixed(result.coupling.re, 4)}, Im={fmtFixed(result.coupling.im, 4)}) | mag={fmtFixed(result.coupling.mag, 4)} @ {fmtFixed(result.coupling.phase, 1)}°
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-1 pt-1 border-t border-cyan-300 text-[9px]">
                  <strong>Test:</strong> Drag sub 0.5m → Complex OFF: phase stays 0/180 | Complex ON: amp changes (position-dependent), phi changes smoothly
                </div>
              </div>
            </div>
          );
        })()}

        {/* Per-Mode Excitation Diagnostic (Part G - DIAGNOSTIC OVERLAY) */}
        {rewStyleMode && showModeExcitationDiag && (() => {
          const modeList = safeDebug?.modeListFirst60;
          if (!modeList || modeList.length === 0 || subsForSimulation.length === 0) return null;
          
          const seat = seatingPositions?.find(s => s.isPrimary) || seatingPositions?.[0];
          if (!seat) return null;
          
          const seatPos = { x: seat.x, y: seat.y, z: seat.z ?? 1.2 };
          const source = subsForSimulation[0];
          
          const W = roomDims?.widthM || 1;
          const L = roomDims?.lengthM || 1;
          const H = roomDims?.heightM || 1;
          
          // Compute current excitations for first 20 modes
          const currentExcitations = modeList.slice(0, 20).map(mode => {
            const [nx, ny, nz] = [mode.nx, mode.ny, mode.nz];
            
            // Spatial coupling
            const srcX = nx > 0 ? Math.cos(nx * Math.PI * source.x / W) : 1;
            const srcY = ny > 0 ? Math.cos(ny * Math.PI * source.y / L) : 1;
            const srcZ = nz > 0 ? Math.cos(nz * Math.PI * (source.z ?? 0.0) / H) : 1;
            const srcCoupling = srcX * srcY * srcZ;
            
            const rcvX = nx > 0 ? Math.cos(nx * Math.PI * seatPos.x / W) : 1;
            const rcvY = ny > 0 ? Math.cos(ny * Math.PI * seatPos.y / L) : 1;
            const rcvZ = nz > 0 ? Math.cos(nz * Math.PI * seatPos.z / H) : 1;
            const rcvCoupling = rcvX * rcvY * rcvZ;
            
            const totalCoupling = srcCoupling * rcvCoupling;
            const excitationDb = 20 * Math.log10(Math.abs(totalCoupling) + Number.EPSILON);
            
            return {
              fHz: mode.fHz,
              type: mode.type,
              n: [nx, ny, nz],
              axisLabel: mode.axisLabel,
              excitationDb
            };
          });
          
          // Compare with previous if available
          let excitationChanges = [];
          if (lastModeExcitationsRef.current) {
            excitationChanges = currentExcitations.map((curr, i) => {
              const prev = lastModeExcitationsRef.current[i];
              if (!prev) return { ...curr, deltaDb: 0, changed: false };
              
              const deltaDb = curr.excitationDb - prev.excitationDb;
              const changed = Math.abs(deltaDb) > 6.0; // >6 dB change threshold
              
              return { ...curr, deltaDb, changed };
            });
          } else {
            excitationChanges = currentExcitations.map(e => ({ ...e, deltaDb: 0, changed: false }));
          }
          
          // Store current as previous for next comparison
          lastModeExcitationsRef.current = currentExcitations;
          
          // Count significant changes
          const changedCount = excitationChanges.filter(e => e.changed).length;
          
          return (
            <div className="text-xs mb-2 bg-orange-50 p-2 rounded border border-orange-400">
              <div className="font-semibold mb-1 text-orange-700">
                🔬 Per-Mode Excitation Diagnostic (Part G)
              </div>
              <div className="text-[10px] space-y-0.5">
                <div className="mb-1">
                  <strong>Modes with &gt;6 dB excitation change:</strong> {changedCount}/20
                  {changedCount === 0 && <span className="text-red-600 font-semibold"> (WARNING: No modes responding to sub movement)</span>}
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1 font-mono text-[9px]">
                  {excitationChanges.map((mode, i) => (
                    <div 
                      key={i} 
                      className={`pl-2 ${mode.changed ? 'bg-yellow-200 font-semibold' : 'opacity-70'}`}
                    >
                      <span className={mode.type === 'axial' ? 'font-bold' : ''}>
                        {fmtFixed(mode.fHz, 1)} Hz {mode.type} ({mode.n[0]},{mode.n[1]},{mode.n[2]})
                        {mode.axisLabel && ` [${mode.axisLabel}]`}
                      </span>
                      : {fmtFixed(mode.excitationDb, 1)} dB
                      {mode.deltaDb !== 0 && (
                        <span className={mode.changed ? 'text-red-700 font-semibold' : ''}>
                          {' '}({mode.deltaDb >= 0 ? '+' : ''}{fmtFixed(mode.deltaDb, 1)} dB)
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-1 pt-1 border-t border-orange-300 text-[9px]">
                  <strong>How to use:</strong> Move sub along front wall. Highlighted rows should change &gt;6 dB.
                  If nothing changes, modal coupling is broken.
                </div>
              </div>
            </div>
          );
        })()}

        {/* Mode list (first 30) - REW parity check */}
        {rewStyleMode && (() => {
          const modeList = safeDebug?.modeListFirst60;
          if (!modeList || modeList.length === 0) return null;

          const first30 = modeList.slice(0, 30);
          
          // Show mode isolation status if active
          const isolationActive = modeIsolation !== 'off';

          return (
            <div className="text-xs text-[#3E4349] mb-2 bg-blue-50 p-2 rounded border border-blue-200">
              <div className="font-semibold mb-1 text-blue-700">
                Mode List (first 30)
                {isolationActive && (
                  <span className="ml-2 text-red-600 font-bold">
                    — MODE ISOLATION ACTIVE: ({modeIsolation})
                  </span>
                )}
              </div>
              <div className="text-[9px] font-mono opacity-80 mb-1">
                <strong>Modes:</strong> {safeDebug.modeCount || 0} total
              </div>
              <div className="text-[9px] font-mono space-y-0.5 max-h-32 overflow-y-auto">
                {first30.map((mode, i) => (
                  <div key={i} className={mode.type === 'axial' ? 'font-semibold' : 'opacity-70'}>
                    {fmtFixed(mode.fHz, 1)} Hz: {mode.type} ({mode.nx},{mode.ny},{mode.nz})
                    {mode.axisLabel && ` [${mode.axisLabel}]`}
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* LF Lock Diagnostic (key frequency values) */}
        {rewStyleMode && (() => {
          const probeFreqs = [20, 30, 40, 50, 63];
          const lowestAxial = safeDebug?.lowestAxialHz || 0;
          
          // --- Degenerate lowest-axial detection (square-room friendly) ---
          const LOWEST_AXIAL_EPS_HZ = 0.25; // tolerance for "same" frequency in degenerate rooms
          
          const modes = safeDebug?.modeListFirst60 || [];
          const lowestAxialModes = Array.isArray(modes)
            ? modes.filter((m) => {
                if (!m || m.type !== "axial") return false;
                if (!Number.isFinite(m.fHz) || !Number.isFinite(lowestAxial)) return false;
                return Math.abs(m.fHz - lowestAxial) <= LOWEST_AXIAL_EPS_HZ;
              })
            : [];
          
          // Nearest frequency-bin lookup for debug readouts (prevents wrong-index "locked" illusions)
          const nearestFreqIndex = (freqs, targetHz) => {
            if (!Array.isArray(freqs) || freqs.length === 0) return -1;
            let bestI = 0;
            let bestErr = Math.abs((freqs[0] ?? 0) - targetHz);
            for (let i = 1; i < freqs.length; i++) {
              const f = freqs[i];
              if (!Number.isFinite(f)) continue;
              const err = Math.abs(f - targetHz);
              if (err < bestErr) {
                bestErr = err;
                bestI = i;
              }
            }
            return bestI;
          };
          
          const engineFreqs = safeDebug?.freqs || rewModesDataAbs?.freqs || [];
          
          const probeData = probeFreqs.map(fProbe => {
            const binI = nearestFreqIndex(engineFreqs, fProbe);
            if (binI < 0) return null;
            
            const actualFreqHz = engineFreqs[binI];
            const plotIdx = displayData?.findIndex(d => Math.abs(d.frequency - fProbe) < 1) ?? -1;
            
            return {
              freq: fProbe,
              binI: binI,
              actualFreqHz: actualFreqHz,
              engineFinal: rewModesDataAbs?.splDb?.[binI],
              schroeder: safeDebug?.splDbSchroeder?.[binI],
              repaired: safeDebug?.splDbRepaired?.[binI],
              plotted: plotIdx >= 0 ? displayData[plotIdx]?.spl : null
            };
          }).filter(Boolean);
          
          if (probeData.length === 0) return null;
          
          return (
            <div className="text-xs mb-2 bg-orange-50 p-2 rounded border border-orange-400">
              <div className="font-semibold mb-1 text-orange-700">🔬 LF Lock Diagnostic</div>
              <div className="text-[10px] font-mono space-y-0.5">
                <div><strong>Lowest axial:</strong> {fmtFixed(lowestAxial, 1, 'N/A')} Hz (pivot point)</div>
                <div style={{ marginTop: 6 }}>
                  <strong>Degenerate lowest-axial modes (±{fmtFixed(LOWEST_AXIAL_EPS_HZ, 2)} Hz):</strong>{" "}
                  {lowestAxialModes.length
                    ? lowestAxialModes
                        .map((m) => `${fmtFixed(m.fHz, 1)}Hz axial (${m.nx},${m.ny},${m.nz})${m.axisLabel ? ` [${m.axisLabel}]` : ''}`)
                        .join(" | ")
                    : "none"}
                </div>
                <div><strong>Debug flags:</strong> DisableSealedGain={String(debugDisableSealedGain)}, DisableNullRepair={String(debugDisableNullRepair)}</div>
                <div style={{ marginTop: 6, opacity: 0.85 }}>
                  <strong>sourcesSig:</strong> {String(sourcesSig).slice(0, 140)}{String(sourcesSig).length > 140 ? "…" : ""}
                </div>
                <div className="mt-1 pt-1 border-t border-orange-300">
                  <strong>Key frequencies (move sub to test):</strong>
                </div>
                {probeData.map((p, i) => (
                  <div key={i} className={p.freq < lowestAxial ? 'text-red-700 font-semibold' : ''}>
                    {p.freq} Hz (bin {p.binI} @ {fmtFixed(p.actualFreqHz, 2, 'null')}):
                    engine={fmtFixed(p.engineFinal, 1, 'null')},
                    schroeder={fmtFixed(p.schroeder, 1, 'null')},
                    repaired={fmtFixed(p.repaired, 1, 'null')},
                    plot={fmtFixed(p.plotted, 1, 'null')}
                    {p.freq < lowestAxial && ' (below axial)'}
                  </div>
                ))}
                <div className="mt-1 pt-1 border-t border-orange-300 text-red-700 font-semibold text-[9px]">
                  Expected: If LF is NOT locked, values below {fmtFixed(lowestAxial, 0)} Hz must change when sub moves.
                </div>
              </div>
            </div>
          );
        })()}

        {/* Engine error banner */}
        {safeGraphDebug?.error && (
          <div className="text-xs text-[#3E4349] mb-2 bg-[#F8F8F7] p-2 rounded border border-[#C1B6AD]">
            <div className="font-semibold mb-1">Engine Error</div>
            <div className="text-[11px] font-mono opacity-80">Error: {safeGraphDebug.error}</div>
            {safeGraphDebug.message && (
              <div className="text-[11px] font-mono opacity-80">Message: {safeGraphDebug.message}</div>
            )}
          </div>
        )}

        {/* Modal Probe Output */}
        {modalProbeEnabled && modeProbe && modeProbe.rows && modeProbe.rows.length > 0 && (
          <div className="text-xs mb-2 bg-red-50 p-2 rounded border border-red-400">
            <div className="font-semibold mb-1 text-red-700">🔬 Modal Probe (engine internal)</div>
            <div className="text-[10px] space-y-1">
              <div className="mb-2 space-y-1">
                <div>
                  <strong>Engine:</strong> bassSimulationEngine.js (product-based, applyModesToComplexPressure)
                </div>
                <div>
                  <strong>NOT using:</strong> computeModesOnlyResponse (legacy, unused)
                </div>
                <div>
                  <strong>Seat:</strong> {modeProbe.seatIdUsed || 'N/A'} | 
                  <strong className="ml-2">Requested freqs:</strong> {modeProbe.freqsRequested.join(', ')} Hz
                </div>
                <div className="text-red-700 font-semibold">
                  ⚠️ If modesPassedBandwidth is near-zero at most frequencies, modes aren't contributing
                </div>
              </div>
              <div className="max-h-96 overflow-y-auto space-y-3 font-mono">
                {modeProbe.rows.map((row, i) => {
                  const topModes = (row.topModes || []).slice(0, 3);
                  const topModesStr = topModes.length > 0 ? topModes.map(m => 
                    `(${m.nx},${m.ny},${m.nz})@${fmtFixed(m.f0Hz, 0)}Hz:cpl=${fmtFixed(m.coupling, 3)},res=${fmtFixed(m.resonMagDb, 1)}dB`
                  ).join(', ') : '';
                  
                  const modesCount = row.modesPassedBandwidth ?? 0;
                  const totalModes = row.totalModesAvailable ?? 0;
                  
                  return (
                    <div key={i} className="border-t border-red-200 pt-1 first:border-t-0 first:pt-0">
                      <div className="font-semibold text-red-800">
                        {fmtFixed(row.frequencyHz, 1)} Hz (sub {row.subId}) — {modesCount} modes within 3×BW (of {totalModes} total)
                      </div>
                      <div className="grid grid-cols-5 gap-2 pl-2 text-[9px]">
                       <div>pre: {fmtFixed(row.pre.db, 1)} dB</div>
                       <div className="text-purple-600">sum: {fmtFixed(row.modeSum.db, 1)} dB</div>
                       <div className="font-bold text-blue-600">H: {fmtFixed(row.H.db, 1)} dB</div>
                       <div>post: {fmtFixed(row.post.db, 1)} dB</div>
                       <div>Δ: {fmtFixed(row.post.db - row.pre.db, 1)} dB</div>
                      </div>
                      {topModesStr && (
                       <div className="text-[9px] opacity-80 mt-1 pl-2">
                         Top modes: {topModesStr}
                       </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Coupling trace diagnostic (Part E1) */}
        {rewStyleMode && !modalOnlyDebugView && (() => {
          // Degenerate lowest-axial detection (same as LF Lock Diagnostic)
          const LOWEST_AXIAL_EPS_HZ = 0.25;
          const lowestAxial = safeDebug?.lowestAxialHz || 0;
          const modeListFirst60 = safeDebug?.modeListFirst60 || [];
          
          const lowestAxialModes = Array.isArray(modeListFirst60)
            ? modeListFirst60.filter((m) => {
                if (!m || m.type !== "axial") return false;
                if (!Number.isFinite(m.fHz) || !Number.isFinite(lowestAxial)) return false;
                return Math.abs(m.fHz - lowestAxial) <= LOWEST_AXIAL_EPS_HZ;
              })
            : [];
          
          // Show coupling for key modes: all lowest axials (degenerate-safe), plus (0,2,0) and (1,1,0)
          const targetModes = [
            ...lowestAxialModes.map(m => ({
              n: [m.nx, m.ny, m.nz],
              label: `lowest axial (${m.nx},${m.ny},${m.nz})${m.axisLabel ? ` [${m.axisLabel}]` : ''}`,
              fHz: m.fHz
            })),
            { n: [0, 2, 0], label: 'axial L (0,2,0)' },
            { n: [1, 1, 0], label: 'tangential (1,1,0)' }
          ];
          
          if (!modeListFirst60 || subsForSimulation.length === 0) return null;
          
          const seat = seatingPositions?.find(s => s.isPrimary) || seatingPositions?.[0];
          if (!seat) return null;
          
          const seatPos = { x: seat.x, y: seat.y, z: seat.z ?? 1.2 };
          const source = subsForSimulation[0];
          
          const W = roomDims?.widthM || 1;
          const L = roomDims?.lengthM || 1;
          const H = roomDims?.heightM || 1;
          
          const couplingData = targetModes.map(({ n, label }) => {
            const mode = modeListFirst60.find(m => m.nx === n[0] && m.ny === n[1] && m.nz === n[2]);
            if (!mode) return null;
            
            const [nx, ny, nz] = n;
            
            // Compute coupling terms
            const srcX = nx > 0 ? Math.cos(nx * Math.PI * source.x / W) : 1;
            const srcY = ny > 0 ? Math.cos(ny * Math.PI * source.y / L) : 1;
            const srcZ = nz > 0 ? Math.cos(nz * Math.PI * (source.z ?? 0.0) / H) : 1;
            const srcCoupling = srcX * srcY * srcZ;
            
            const rcvX = nx > 0 ? Math.cos(nx * Math.PI * seatPos.x / W) : 1;
            const rcvY = ny > 0 ? Math.cos(ny * Math.PI * seatPos.y / L) : 1;
            const rcvZ = nz > 0 ? Math.cos(nz * Math.PI * seatPos.z / H) : 1;
            const rcvCoupling = rcvX * rcvY * rcvZ;
            
            const totalCoupling = srcCoupling * rcvCoupling;
            
            return {
              label,
              fHz: mode.fHz,
              srcCoupling: fmtFixed(srcCoupling, 4),
              rcvCoupling: fmtFixed(rcvCoupling, 4),
              totalCoupling: fmtFixed(totalCoupling, 4)
            };
          }).filter(Boolean);
          
          if (couplingData.length === 0) return null;
          
          return (
            <div className="text-xs text-[#3E4349] mb-2 bg-cyan-50 p-2 rounded border border-cyan-300">
              <div className="font-semibold mb-1 text-cyan-700">Coupling Trace (Key Modes)</div>
              <div className="text-[9px] font-mono space-y-1">
                {couplingData.map((data, i) => (
                  <div key={i} className="border-t border-cyan-200 pt-1 first:border-t-0 first:pt-0">
                    <div className="font-semibold">{data.label} @ {fmtFixed(data.fHz, 1)} Hz:</div>
                    <div className="pl-2">src={data.srcCoupling}, rcv={data.rcvCoupling}, total={data.totalCoupling}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Engine info (dev only) */}
        {devMode && !safeGraphDebug?.error && (() => {
          const schroederHz = safeGraphDebug?.schroederHz || 0;
          const schroederDisplay = schroederHz > 0
            ? (schroederHz > 200 ? `${fmtFixed(schroederHz, 1)} Hz (off-scale)` : `${fmtFixed(schroederHz, 1)} Hz`)
            : 'N/A';
          
          return (
            <div className="text-xs text-[#3E4349] mb-2 bg-[#F8F8F7] p-2 rounded border border-[#DCDBD6]">
              <div className="font-semibold mb-1">REW-Style Room Simulation</div>
              <div className="text-[11px] space-y-1">
                <div>• Complex modal summation + SBIR</div>
                <div>• Schroeder: <strong>{schroederDisplay}</strong></div>
                <div>• Modes: {safeGraphDebug.modeCount || 0} total ({safeGraphDebug.axialCount || 0} axial)</div>
                <div>• Absorption: {roomAbsorptionPct}% (all surfaces)</div>
              </div>
            </div>
          );
        })()}

        {/* Advanced controls (dev only) */}
        {devMode && (
          <div className="space-y-2 mb-2">
            <div className="flex items-center gap-3">
              <div className="text-xs text-[#3E4349]">Product:</div>
              <Button
                variant={rewView === 'roomOnly' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setRewView('roomOnly')}
                className="text-xs"
              >
                Room-only
              </Button>
              <Button
                variant={rewView === 'roomPlusProduct' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setRewView('roomPlusProduct')}
                className="text-xs"
              >
                Room + Product
              </Button>
            </div>



            {/* Modal Alignment Debug */}
            {devMode && (() => {
              const w = Number(roomDims?.widthM);
              const l = Number(roomDims?.lengthM);
              const h = Number(roomDims?.heightM);

              if (!(Number.isFinite(w) && Number.isFinite(l) && Number.isFinite(h))) return null;

              const dbg = safeGraphDebug || {};
              const c = Number(dbg.cMpsUsed) || 343;

              const fL_expected = c / (2 * l);
              const fW_expected = c / (2 * w);
              const fH_expected = c / (2 * h);

              const expectedLowest = Math.min(fL_expected, fW_expected, fH_expected);

              const engineLowestAxial = Number(dbg.lowestAxialHz);
              const aligned = Number.isFinite(engineLowestAxial) && Math.abs(engineLowestAxial - expectedLowest) < 0.5;

              const engineAxialFundamentals = dbg.axialFundamentals && typeof dbg.axialFundamentals === "object"
                ? dbg.axialFundamentals
                : null;

              return (
                <div className="text-xs mb-2 bg-cyan-50 p-2 rounded border border-cyan-400">
                  <div className="font-semibold mb-1 text-cyan-700">🔬 Modal Alignment Debug</div>
                  <div className="text-[10px] font-mono space-y-0.5">
                    <div><strong>Room dims:</strong> {fmtFixed(w, 2)}×{fmtFixed(l, 2)}×{fmtFixed(h, 2)} m</div>
                    <div><strong>Speed of sound (c):</strong> {fmtFixed(c, 1)} m/s</div>

                    <div className="mt-1 pt-1 border-t border-cyan-300 font-semibold">Expected axial fundamentals:</div>
                    <div className="pl-2">
                      <div>fL (length): {fmtFixed(fL_expected, 2)} Hz</div>
                      <div>fW (width): {fmtFixed(fW_expected, 2)} Hz</div>
                      <div>fH (height): {fmtFixed(fH_expected, 2)} Hz</div>
                      <div className="font-bold text-cyan-800">Lowest: {fmtFixed(expectedLowest, 2)} Hz</div>
                    </div>

                    <div className="mt-1 pt-1 border-t border-cyan-300">
                      <strong>Engine lowest axial:</strong> {fmtFixed(engineLowestAxial, 2, "N/A")} Hz
                    </div>

                    {engineAxialFundamentals && (
                      <div className="pl-2 text-[9px] opacity-70">
                        Engine fundamentals: fL={fmtFixed(engineAxialFundamentals.fL, 2, "N/A")},
                        fW={fmtFixed(engineAxialFundamentals.fW, 2, "N/A")},
                        fH={fmtFixed(engineAxialFundamentals.fH, 2, "N/A")}
                      </div>
                    )}

                    <div className={`mt-1 pt-1 border-t border-cyan-300 font-semibold ${aligned ? "text-green-600" : "text-red-600"}`}>
                      {aligned
                        ? "✓ OK: within ±0.5 Hz"
                        : `✗ MISMATCH: expected ${fmtFixed(expectedLowest, 1)}, engine says ${fmtFixed(engineLowestAxial, 1, "N/A")} → check c/dims/units`}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Live state readout (audit) */}
            <div className="text-[9px] font-mono bg-yellow-50 p-1 rounded border border-yellow-300 mt-2">
              <strong>Live State:</strong> engineCalls={engineCallCountRef.current} | absorption={roomAbsorptionPct}% | subs={subsForSimulation.length} | dragging={isDraggingSub ? 'YES' : 'NO'}
              <div className="mt-1 pt-1 border-t border-yellow-400">
                <strong>SBIR paths used:</strong> {safeGraphDebug?.sbirDebugProbe40Hz?.pathsUsed || safeGraphDebug?.sbirDebugProbe63Hz?.pathsUsed || 0}
              </div>
            </div>
          </div>
        )}





        {/* Parity Audit Readout (raw coherent vs final plotted) */}
        {rewStyleMode && safeDebug?.parityAudits?.modalPlusSbir && (() => {
          const audit = safeDebug.parityAudits.modalPlusSbir;
          const raw = audit.raw;
          const final = audit.final;
          const deltaShrink = audit.deltaShrinkDb_40_70;
          
          return (
            <div className="text-xs mb-2 bg-teal-50 p-2 rounded border border-teal-400">
              <div className="font-semibold mb-1 text-teal-700">🔬 Parity Audit (Engine vs Display)</div>
              <div className="text-[10px] font-mono space-y-1">
                <div className="font-semibold text-teal-800">40–70 Hz Band:</div>
                <div className="pl-2 space-y-0.5">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <div className="font-semibold text-teal-700">RAW:</div>
                      <div>Peak: {raw?.band40_70Hz?.peakDb || 'N/A'} dB @ {raw?.band40_70Hz?.peakFreq || 'N/A'} Hz</div>
                      <div>Dip: {raw?.band40_70Hz?.dipDb || 'N/A'} dB @ {raw?.band40_70Hz?.dipFreq || 'N/A'} Hz</div>
                      <div className="font-bold">Delta: {raw?.band40_70Hz?.deltaDb || 'N/A'} dB</div>
                    </div>
                    <div>
                      <div className="font-semibold text-teal-700">ENGINE FINAL (pre-display):</div>
                      <div>Peak: {final?.band40_70Hz?.peakDb || 'N/A'} dB @ {final?.band40_70Hz?.peakFreq || 'N/A'} Hz</div>
                      <div>Dip: {final?.band40_70Hz?.dipDb || 'N/A'} dB @ {final?.band40_70Hz?.dipFreq || 'N/A'} Hz</div>
                      <div className="font-bold">Delta: {final?.band40_70Hz?.deltaDb || 'N/A'} dB</div>
                    </div>
                    <div>
                      {(() => {
                        const band = displayData.filter(p =>
                          Number.isFinite(p?.frequency) &&
                          p.frequency >= 40 &&
                          p.frequency <= 70 &&
                          Number.isFinite(p?.spl)
                        );

                        if (band.length < 3) return <div className="text-gray-400">N/A</div>;

                        let peak = band[0];
                        let dip = band[0];

                        for (const p of band) {
                          if (p.spl > peak.spl) peak = p;
                          if (p.spl < dip.spl) dip = p;
                        }

                        const delta = peak.spl - dip.spl;
                        
                        // Compute offset from engine final
                        const engineFinalPeak = parseFloat(final?.band40_70Hz?.peakDb);
                        const engineFinalDip = parseFloat(final?.band40_70Hz?.dipDb);
                        const offsetFromPeak = Number.isFinite(engineFinalPeak) ? peak.spl - engineFinalPeak : null;
                        const offsetFromDip = Number.isFinite(engineFinalDip) ? dip.spl - engineFinalDip : null;
                        const offsetIsConstant = offsetFromPeak !== null && offsetFromDip !== null && Math.abs(offsetFromDip - offsetFromPeak) < 0.2;

                        return (
                          <>
                            <div className="font-semibold text-teal-700">DISPLAY FINAL (graph):</div>
                            <div>Peak: {fmtFixed(peak.spl, 2)} dB @ {fmtFixed(peak.frequency, 1)} Hz</div>
                            <div>Dip:  {fmtFixed(dip.spl, 2)} dB @ {fmtFixed(dip.frequency, 1)} Hz</div>
                            <div className="font-bold">Delta: {fmtFixed(delta, 2)} dB</div>
                            {offsetFromPeak !== null && (
                              <div className="text-[9px] text-blue-600 mt-1 pt-1 border-t border-teal-300">
                                Display offset: {offsetFromPeak >= 0 ? '+' : ''}{fmtFixed(offsetFromPeak, 2)} dB
                                <div className="text-[8px] opacity-70">(expected: {(allowDisplayRefOffset ? (toNum(rewDisplayRefDb) || 0) : 0) >= 0 ? '+' : ''}{fmtFixed(allowDisplayRefOffset ? (toNum(rewDisplayRefDb) || 0) : 0, 2)} dB, mode: {isRelative ? 'RELATIVE' : 'ABSOLUTE'})</div>
                                {offsetIsConstant && <div className="text-green-600">✓ Constant (reference shift only)</div>}
                                {isRelative && Math.abs(offsetFromPeak) > 1 && (
                                  <div className="text-red-600 font-bold">⚠️ RELATIVE mode should have ~0 dB offset (found {fmtFixed(offsetFromPeak, 2)} dB)</div>
                                )}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="mt-1 pt-1 border-t border-teal-300 font-semibold text-red-700">
                    Null Depth Shrink (RAW→ENGINE FINAL): {deltaShrink !== 'N/A' && parseFloat(deltaShrink) > 1 ? `${deltaShrink} dB (smoothing effect)` : deltaShrink}
                  </div>
                  
                  <div className="mt-2 pt-2 border-t border-teal-300">
                    <div className="font-semibold text-blue-700">PLOTTED SERIES (this graph): {rewPlotSeries}</div>
                    <div className="text-[9px] text-blue-600 mt-1">
                      {rewPlotSeries === 'RAW' && 'Shows coherent pressure before any processing (deepest nulls, unsmoothed)'}
                      {rewPlotSeries === 'ENGINE' && 'Shows engine output after smoothing, before display offset (matches ENGINE FINAL)'}
                      {rewPlotSeries === 'DISPLAY' && 'Shows final display values with offset applied (matches DISPLAY FINAL)'}
                    </div>
                    {(() => {
                      // Compute peak/dip from currently plotted series
                      const band = displayData.filter(p =>
                        Number.isFinite(p?.frequency) &&
                        p.frequency >= 40 &&
                        p.frequency <= 70 &&
                        Number.isFinite(p?.spl)
                      );

                      if (band.length < 3) return <div className="text-gray-400 text-[9px] mt-1">N/A</div>;

                      let peak = band[0];
                      let dip = band[0];

                      for (const p of band) {
                        if (p.spl > peak.spl) peak = p;
                        if (p.spl < dip.spl) dip = p;
                      }

                      const delta = peak.spl - dip.spl;

                      return (
                        <div className="mt-1 text-[9px] font-mono space-y-0.5">
                          <div>Peak: {fmtFixed(peak.spl, 2)} dB @ {fmtFixed(peak.frequency, 1)} Hz</div>
                          <div>Dip:  {fmtFixed(dip.spl, 2)} dB @ {fmtFixed(dip.frequency, 1)} Hz</div>
                          <div>Delta: {fmtFixed(delta, 2)} dB</div>
                          <div className="text-green-600 font-semibold mt-1">
                            ✓ These values should match tooltips exactly
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
                
                <div className="mt-2 pt-2 border-t border-teal-300 space-y-0.5">
                  <div className="font-semibold text-teal-800">Band Averages (ENGINE):</div>
                  <div className="pl-2">
                    <div>20–40 Hz: RAW={raw?.band20_40Hz_avgDb || 'N/A'} dB, ENGINE FINAL={final?.band20_40Hz_avgDb || 'N/A'} dB</div>
                    <div>100–160 Hz: RAW={raw?.band100_160Hz_avgDb || 'N/A'} dB, ENGINE FINAL={final?.band100_160Hz_avgDb || 'N/A'} dB</div>
                  </div>
                </div>
                
                <div className="mt-2 pt-2 border-t border-teal-300 text-[9px] space-y-0.5">
                  <div><strong>Smoothing:</strong> {activeDebug?.smoothingApplied || 'none'}</div>
                  <div><strong>REW Parity Mode:</strong> {activeDebug?.rewParityMode ? 'ON' : 'OFF'}</div>
                  <div><strong>Calibration Offset:</strong> {activeDebug?.calOffsetAppliedDb || '0.00'} dB</div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Mode isolation plot source debug (dev only) */}
        {devMode && (() => {
          const isolationActive = modeIsolation !== 'off';
          const modeCountUsed = safeDebug?.modalModeCountUsed || safeDebug?.modeCount || 0;

          return (
            <div className="text-[10px] font-mono mb-1 bg-purple-50 p-1 rounded border border-purple-300 space-y-0.5">
              <div>Plot uses: <strong>finalBassSeries</strong> (REW-parity, modal+SBIR always)</div>
              <div>Mode isolation: <strong>{isolationActive ? 'YES' : 'NO'}</strong> {isolationActive && `(${modeIsolation})`}</div>
              <div>Modes used: <strong>{modeCountUsed}</strong></div>
              <div>Modal RMS 20–200 Hz: <strong>{safeGraphDebug?.modalRmsDb_20_200 || '—'} dB</strong></div>
              <div>SBIR RMS 20–200 Hz: <strong>{safeGraphDebug?.sbirRmsDb_20_200 || '—'} dB</strong></div>
              <div>Total RMS 20–200 Hz: <strong>{safeGraphDebug?.totalRmsDb_20_200 || '—'} dB</strong></div>
            </div>
          );
        })()}

        {/* Graph area */}
        <div className="mt-6">
          {devMode && (belowFloor > 0 || (clampedToMin > 0 || clampedToMax > 0)) && (
            <div className="text-[10px] text-gray-500 mb-2 italic">
              Debug: {belowFloor} below floor, {clampedToMin} clamped low, {clampedToMax} clamped high
            </div>
            )}

            {/* Plot Integrity Check (dev only) */}
            {devMode && (
            <div className="text-xs mb-2 bg-blue-50 p-2 rounded border border-blue-400">
              <div className="font-semibold mb-1 text-blue-700">📊 Plot Integrity Check</div>
              
              {/* Visibility guarantee */}
              <div className="text-[10px] font-mono text-gray-600">
                StepJump present: {String(!!safeDebug?.stepJumpInspector55_90)}
              </div>
              
              {/* Step Jump Inspector (55–90 Hz) */}
              {safeDebug?.stepJumpInspector55_90 && (
                <div style={{ marginTop: 10, padding: 12, border: "1px solid #cfe3ff", borderRadius: 8, background: "#f0f9ff" }}>
                  <div style={{ fontWeight: 700, marginBottom: 8, color: "#1e40af" }}>Step Jump Inspector (55–90 Hz)</div>

                  {safeDebug.stepJumpInspector55_90.summary ? (
                    <>
                      <div style={{ fontFamily: "monospace", whiteSpace: "pre-wrap", fontSize: 11, marginBottom: 8 }}>
                        {`Max jump: ${fmtFixed(safeDebug.stepJumpInspector55_90.summary.jumpDb, 3)} dB
                        ${fmtFixed(safeDebug.stepJumpInspector55_90.summary.f0, 2)} Hz → ${fmtFixed(safeDebug.stepJumpInspector55_90.summary.f1, 2)} Hz
                        ${fmtFixed(safeDebug.stepJumpInspector55_90.summary.y0, 2)} dB → ${fmtFixed(safeDebug.stepJumpInspector55_90.summary.y1, 2)} dB`}
                      </div>

                      {/* Mode-level trace (when available) */}
                      {safeDebug.stepJumpInspector55_90.trace && (() => {
                        const trace = safeDebug.stepJumpInspector55_90.trace;
                        const diff = trace.diff;
                        
                        if (!diff) return null;
                        
                        return (
                          <div style={{ marginTop: 12, padding: 10, background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 6 }}>
                            <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 11, color: "#92400e" }}>
                              Mode-Level Trace (what changed?)
                            </div>
                            
                            {/* Summary counts */}
                            <div style={{ fontFamily: "monospace", fontSize: 10, marginBottom: 8 }}>
                              <div>modesUsed: {trace.bin0.modesUsed} → {trace.bin1.modesUsed}</div>
                              <div>skippedBandwidth: {trace.bin0.modesSkippedBandwidth} → {trace.bin1.modesSkippedBandwidth}</div>
                              <div>skippedCoupling: {trace.bin0.modesSkippedCoupling} → {trace.bin1.modesSkippedCoupling}</div>
                            </div>
                            
                            {/* Modes Added */}
                            {diff.modesAdded && diff.modesAdded.length > 0 && (
                              <details style={{ marginTop: 8 }}>
                                <summary style={{ fontWeight: 700, fontSize: 10, cursor: "pointer", color: "#15803d" }}>
                                  ✅ Modes Added at f1 ({diff.modesAdded.length})
                                </summary>
                                <div style={{ fontFamily: "monospace", fontSize: 9, marginTop: 4, paddingLeft: 12 }}>
                                  {diff.modesAdded.map((m, i) => (
                                    <div key={i}>
                                      {fmtFixed(m.modeHz, 1)} Hz {m.type} ({m.n[0]},{m.n[1]},{m.n[2]}): {fmtFixed(m.contribDb, 1)} dB
                                    </div>
                                  ))}
                                </div>
                              </details>
                            )}
                            
                            {/* Modes Removed */}
                            {diff.modesRemoved && diff.modesRemoved.length > 0 && (
                              <details style={{ marginTop: 8 }}>
                                <summary style={{ fontWeight: 700, fontSize: 10, cursor: "pointer", color: "#dc2626" }}>
                                  ❌ Modes Removed at f1 ({diff.modesRemoved.length})
                                </summary>
                                <div style={{ fontFamily: "monospace", fontSize: 9, marginTop: 4, paddingLeft: 12 }}>
                                  {diff.modesRemoved.map((m, i) => (
                                    <div key={i}>
                                      {fmtFixed(m.modeHz, 1)} Hz {m.type} ({m.n[0]},{m.n[1]},{m.n[2]}): {fmtFixed(m.contribDb, 1)} dB
                                    </div>
                                  ))}
                                </div>
                              </details>
                            )}
                            
                            {/* Modes with skip status changed */}
                            {diff.modesSkipChanged && diff.modesSkipChanged.length > 0 && (
                              <details style={{ marginTop: 8 }}>
                                <summary style={{ fontWeight: 700, fontSize: 10, cursor: "pointer", color: "#ea580c" }}>
                                  🔄 Modes Skip Status Changed ({diff.modesSkipChanged.length})
                                </summary>
                                <div style={{ fontFamily: "monospace", fontSize: 9, marginTop: 4, paddingLeft: 12 }}>
                                  {diff.modesSkipChanged.map((m, i) => (
                                    <div key={i}>
                                      {fmtFixed(m.modeHz, 1)} Hz {m.type} ({m.n[0]},{m.n[1]},{m.n[2]}):
                                      f0={m.atF0.skipped ? `SKIP(${m.atF0.reason})` : 'USED'}
                                      → f1={m.atF1.skipped ? `SKIP(${m.atF1.reason})` : 'USED'}
                                      (df: {fmtFixed(m.atF0.df, 1)}→{fmtFixed(m.atF1.df, 1)} Hz, bw: {fmtFixed(m.atF0.bw, 1)}→{fmtFixed(m.atF1.bw, 1)} Hz)
                                    </div>
                                  ))}
                                </div>
                              </details>
                            )}
                            
                            {/* Top Contribution Deltas */}
                            {diff.topDeltaContrib && diff.topDeltaContrib.length > 0 && (
                              <details style={{ marginTop: 8 }}>
                                <summary style={{ fontWeight: 700, fontSize: 10, cursor: "pointer", color: "#7c2d12" }}>
                                  📊 Top Contribution Deltas ({diff.topDeltaContrib.length})
                                </summary>
                                <div style={{ fontFamily: "monospace", fontSize: 9, marginTop: 4, paddingLeft: 12 }}>
                                  {diff.topDeltaContrib.map((m, i) => (
                                    <div key={i}>
                                      {fmtFixed(m.modeHz, 1)} Hz {m.type} ({m.n[0]},{m.n[1]},{m.n[2]}):
                                      {fmtFixed(m.contribDb0, 1)} → {fmtFixed(m.contribDb1, 1)} dB
                                      ({m.deltaDb >= 0 ? '+' : ''}{fmtFixed(m.deltaDb, 1)} dB)
                                    </div>
                                  ))}
                                </div>
                              </details>
                            )}
                            
                            {/* Raw JSON (optional) */}
                            <details style={{ marginTop: 8 }}>
                              <summary style={{ fontWeight: 600, fontSize: 9, cursor: "pointer", color: "#6b7280" }}>
                                Raw JSON (full trace)
                              </summary>
                              <div style={{ fontFamily: "monospace", fontSize: 8, marginTop: 4, whiteSpace: "pre-wrap", maxHeight: 200, overflow: "auto" }}>
                                {JSON.stringify(trace, null, 2)}
                              </div>
                            </details>
                          </div>
                        );
                      })()}

                      <div style={{ height: 8 }} />

                      <div style={{ fontFamily: "monospace", whiteSpace: "pre-wrap", fontSize: 9 }}>
                        {JSON.stringify(safeDebug.stepJumpInspector55_90.rows, null, 2)}
                      </div>
                    </>
                  ) : (
                    <div style={{ fontFamily: "monospace" }}>No jump found in 55–90 Hz.</div>
                  )}
                </div>
              )}
              
              <div className="text-[10px] font-mono space-y-0.5">
                <div className={plotIntegrityCheck.pointCount >= 2000 ? 'text-green-600' : plotIntegrityCheck.pointCount >= 1000 ? 'text-yellow-600' : 'text-red-600'}>
                  Point count: {plotIntegrityCheck.pointCount} 
                  {plotIntegrityCheck.pointCount >= 2000 ? ' ✓ (smooth)' : plotIntegrityCheck.pointCount >= 1000 ? ' ⚠ (moderate)' : ' ✗ (may show steps)'}
                </div>
                <div className={plotIntegrityCheck.duplicateXCount === 0 ? 'text-green-600' : 'text-red-600'}>
                  Duplicate X: {plotIntegrityCheck.duplicateXCount} 
                  {plotIntegrityCheck.duplicateXCount === 0 ? ' ✓ PASS' : ' ✗ FAIL (causes hover jumps)'}
                </div>
                <div className={plotIntegrityCheck.nonIncreasingCount === 0 ? 'text-green-600' : 'text-red-600'}>
                  Non-increasing: {plotIntegrityCheck.nonIncreasingCount} 
                  {plotIntegrityCheck.nonIncreasingCount === 0 ? ' ✓ PASS' : ' ✗ FAIL (breaks chart)'}
                </div>
                <div className={!plotIntegrityCheck.hasNaNOrInf ? 'text-green-600' : 'text-red-600'}>
                  NaN/Inf present: {plotIntegrityCheck.hasNaNOrInf ? 'YES ✗' : 'NO ✓'}
                </div>
                <div className="text-gray-700">
                  Min Δf: {fmtFixed(plotIntegrityCheck.minDf, 6)} Hz
                </div>
                <div className="text-gray-700">
                  Max Δf: {fmtFixed(plotIntegrityCheck.maxDf, 6)} Hz
                </div>
                <div className="text-gray-700">
                  Largest gap: {plotIntegrityCheck.largestGapBand}
                </div>
                
                {/* Step Detection */}
                <div className="mt-2 pt-2 border-t border-blue-300">
                  <div className="font-semibold text-red-700 mb-1">Step Detection (SPL quantization):</div>
                  <div className={plotIntegrityCheck.flatRunsCount === 0 ? 'text-green-600' : 'text-red-600'}>
                    Flat runs (≥4 pts, Δ&lt;0.001 dB): {plotIntegrityCheck.flatRunsCount} 
                    {plotIntegrityCheck.flatRunsCount === 0 ? ' ✓ (continuous)' : ' ✗ (binned/cached)'}
                  </div>
                  <div className={plotIntegrityCheck.maxJumpDb < 2.0 ? 'text-green-600' : 'text-yellow-600'}>
                    Max jump: {fmtFixed(plotIntegrityCheck.maxJumpDb, 3)} dB
                    {plotIntegrityCheck.maxJumpAtHz && ` @ ${fmtFixed(plotIntegrityCheck.maxJumpAtHz, 2)} Hz`}
                  </div>
                  
                  {plotIntegrityCheck.top5Jumps && plotIntegrityCheck.top5Jumps.length > 0 && (
                    <div className="mt-1 pt-1 border-t border-blue-200">
                      <div className="font-semibold text-xs mb-1">Top 5 SPL jumps:</div>
                      <div className="space-y-0.5 text-[9px]">
                        {plotIntegrityCheck.top5Jumps.map((jump, i) => (
                          <div key={i} className={jump.absJumpDb > 1.0 ? 'text-red-600 font-semibold' : ''}>
                            {fmtFixed(jump.hzPrev, 2)} → {fmtFixed(jump.hzNow, 2)} Hz 
                            (Δf={fmtFixed(jump.deltaF, 4)} Hz): 
                            {fmtFixed(jump.dbPrev, 2)} → {fmtFixed(jump.dbNow, 2)} dB 
                            (jump: {jump.jumpDb >= 0 ? '+' : ''}{fmtFixed(jump.jumpDb, 3)} dB)
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Step Drilldown (Top jumps) - uses engineTrace from room modes engine */}
                {safeDebug?.engineTrace && plotIntegrityCheck.top5Jumps && plotIntegrityCheck.top5Jumps.length > 0 && (() => {
                  const engineTrace = safeDebug.engineTrace;
                  const jumps = plotIntegrityCheck.top5Jumps.slice(0, 5);
                  
                  // Helper: find nearest engineTrace row by frequency
                  const findTraceRow = (targetFreq) => {
                    let best = null;
                    let minErr = Infinity;
                    
                    for (const row of engineTrace) {
                      const err = Math.abs(row.exactFreqHz - targetFreq);
                      if (err < minErr) {
                        minErr = err;
                        best = row;
                      }
                    }
                    
                    return best;
                  };
                  
                  // Build drilldown data
                  const drilldownData = jumps.map((jump, jumpIndex) => {
                    const fromRow = findTraceRow(jump.hzPrev);
                    const toRow = findTraceRow(jump.hzNow);
                    
                    if (!fromRow || !toRow) return null;
                    
                    return {
                      jumpIndex: jumpIndex + 1,
                      fromHz: jump.hzPrev,
                      toHz: jump.hzNow,
                      deltaHz: jump.hzNow - jump.hzPrev,
                      fromDb: jump.dbPrev,
                      toDb: jump.dbNow,
                      jumpDb: jump.jumpDb,
                      fromRow,
                      toRow,
                      deltas: {
                        totalDb: toRow.totalDb - fromRow.totalDb,
                        modalDb: toRow.modalDb - fromRow.modalDb,
                        sbirDb: toRow.sbirDb - fromRow.sbirDb,
                        modesUsed: toRow.modesUsed - fromRow.modesUsed,
                        sbirReflectionsUsed: toRow.sbirReflectionsUsed - fromRow.sbirReflectionsUsed,
                        activeTermsTotal: toRow.activeTermsTotal - fromRow.activeTermsTotal,
                        modesSkippedBw: toRow.modesSkippedBandwidth - fromRow.modesSkippedBandwidth,
                        modesSkippedCoup: toRow.modesSkippedCoupling - fromRow.modesSkippedCoupling
                      }
                    };
                  }).filter(Boolean);
                  
                  if (drilldownData.length === 0) return null;
                  
                  return (
                    <div className="mt-2 pt-2 border-t border-red-400">
                      <div className="font-semibold text-red-700 mb-2">Step Drilldown (Top jumps):</div>
                      <div className="space-y-3 max-h-96 overflow-y-auto">
                        {drilldownData.map((item, i) => {
                          const countsChanged = item.deltas.modesUsed !== 0 || item.deltas.sbirReflectionsUsed !== 0;
                          
                          return (
                            <div key={i} className="bg-red-50 rounded border border-red-300 p-2">
                              <div className="font-semibold text-red-800 mb-1 text-[10px]">
                                Jump {item.jumpIndex}: {fmtFixed(item.fromHz, 2)} → {fmtFixed(item.toHz, 2)} Hz 
                                (Δf={fmtFixed(item.deltaHz, 4)} Hz), 
                                {fmtFixed(item.fromDb, 2)} → {fmtFixed(item.toDb, 2)} dB 
                                (Δ={item.jumpDb >= 0 ? '+' : ''}{fmtFixed(item.jumpDb, 2)} dB)
                              </div>
                              
                              {/* Diagnosis first */}
                              <div className="mb-2 text-[9px] font-semibold">
                                {countsChanged ? (
                                  <div className="text-red-700 bg-red-200 px-2 py-1 rounded">
                                    🚨 Counts changed: modesUsed Δ{item.deltas.modesUsed}, sbirReflectionsUsed Δ{item.deltas.sbirReflectionsUsed}
                                  </div>
                                ) : (
                                  <div className="text-green-700 bg-green-100 px-2 py-1 rounded">
                                    ✓ Counts unchanged — jump is coming from maths/phase, not term inclusion
                                  </div>
                                )}
                              </div>
                              
                              <div className="overflow-x-auto">
                                <table className="w-full text-[8px] font-mono border-collapse">
                                  <thead>
                                    <tr className="border-b-2 border-red-400 bg-red-100">
                                      <th className="text-left p-1"></th>
                                      <th className="text-right p-1">exactFreqHz</th>
                                      <th className="text-right p-1">totalDb</th>
                                      <th className="text-right p-1">modalDb</th>
                                      <th className="text-right p-1">sbirDb</th>
                                      <th className="text-right p-1">modesUsed</th>
                                      <th className="text-right p-1">sbirRefl</th>
                                      <th className="text-right p-1">activeTotal</th>
                                      <th className="text-right p-1">skip:bw</th>
                                      <th className="text-right p-1">skip:coup</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    <tr className="border-b border-red-200">
                                      <td className="p-1 font-semibold text-red-700">From</td>
                                      <td className="text-right p-1">{fmtFixed(item.fromRow.exactFreqHz, 3)}</td>
                                      <td className={`text-right p-1 ${Math.abs(item.deltas.totalDb) > 2 ? 'bg-yellow-200 font-bold' : ''}`}>
                                        {fmtFixed(item.fromRow.totalDb, 2)}
                                      </td>
                                      <td className={`text-right p-1 ${Math.abs(item.deltas.modalDb) > 2 ? 'bg-yellow-200' : ''}`}>
                                        {fmtFixed(item.fromRow.modalDb, 2)}
                                      </td>
                                      <td className={`text-right p-1 ${Math.abs(item.deltas.sbirDb) > 2 ? 'bg-yellow-200' : ''}`}>
                                        {fmtFixed(item.fromRow.sbirDb, 2)}
                                      </td>
                                      <td className={`text-right p-1 ${item.deltas.modesUsed !== 0 ? 'bg-red-300 font-bold' : ''}`}>
                                        {item.fromRow.modesUsed}
                                      </td>
                                      <td className={`text-right p-1 ${item.deltas.sbirReflectionsUsed !== 0 ? 'bg-red-300 font-bold' : ''}`}>
                                        {item.fromRow.sbirReflectionsUsed}
                                      </td>
                                      <td className={`text-right p-1 ${item.deltas.activeTermsTotal !== 0 ? 'bg-red-300 font-bold' : ''}`}>
                                        {item.fromRow.activeTermsTotal}
                                      </td>
                                      <td className={`text-right p-1 ${item.deltas.modesSkippedBw !== 0 ? 'bg-orange-200' : ''}`}>
                                        {item.fromRow.modesSkippedBandwidth}
                                      </td>
                                      <td className={`text-right p-1 ${item.deltas.modesSkippedCoup !== 0 ? 'bg-orange-200' : ''}`}>
                                        {item.fromRow.modesSkippedCoupling}
                                      </td>
                                    </tr>
                                    <tr className="border-b border-red-200">
                                      <td className="p-1 font-semibold text-red-700">To</td>
                                      <td className="text-right p-1">{fmtFixed(item.toRow.exactFreqHz, 3)}</td>
                                      <td className={`text-right p-1 ${Math.abs(item.deltas.totalDb) > 2 ? 'bg-yellow-200 font-bold' : ''}`}>
                                        {fmtFixed(item.toRow.totalDb, 2)}
                                      </td>
                                      <td className={`text-right p-1 ${Math.abs(item.deltas.modalDb) > 2 ? 'bg-yellow-200' : ''}`}>
                                        {fmtFixed(item.toRow.modalDb, 2)}
                                      </td>
                                      <td className={`text-right p-1 ${Math.abs(item.deltas.sbirDb) > 2 ? 'bg-yellow-200' : ''}`}>
                                        {fmtFixed(item.toRow.sbirDb, 2)}
                                      </td>
                                      <td className={`text-right p-1 ${item.deltas.modesUsed !== 0 ? 'bg-red-300 font-bold' : ''}`}>
                                        {item.toRow.modesUsed}
                                      </td>
                                      <td className={`text-right p-1 ${item.deltas.sbirReflectionsUsed !== 0 ? 'bg-red-300 font-bold' : ''}`}>
                                        {item.toRow.sbirReflectionsUsed}
                                      </td>
                                      <td className={`text-right p-1 ${item.deltas.activeTermsTotal !== 0 ? 'bg-red-300 font-bold' : ''}`}>
                                        {item.toRow.activeTermsTotal}
                                      </td>
                                      <td className={`text-right p-1 ${item.deltas.modesSkippedBw !== 0 ? 'bg-orange-200' : ''}`}>
                                        {item.toRow.modesSkippedBandwidth}
                                      </td>
                                      <td className={`text-right p-1 ${item.deltas.modesSkippedCoup !== 0 ? 'bg-orange-200' : ''}`}>
                                        {item.toRow.modesSkippedCoupling}
                                      </td>
                                    </tr>
                                    <tr className="bg-red-100 font-bold">
                                      <td className="p-1 text-red-900">Δ</td>
                                      <td className="text-right p-1">—</td>
                                      <td className="text-right p-1 text-red-900">
                                        {item.deltas.totalDb >= 0 ? '+' : ''}{fmtFixed(item.deltas.totalDb, 2)}
                                      </td>
                                      <td className="text-right p-1 text-red-900">
                                        {item.deltas.modalDb >= 0 ? '+' : ''}{fmtFixed(item.deltas.modalDb, 2)}
                                      </td>
                                      <td className="text-right p-1 text-red-900">
                                        {item.deltas.sbirDb >= 0 ? '+' : ''}{fmtFixed(item.deltas.sbirDb, 2)}
                                      </td>
                                      <td className="text-right p-1 text-red-900">
                                        {item.deltas.modesUsed >= 0 ? '+' : ''}{item.deltas.modesUsed}
                                      </td>
                                      <td className="text-right p-1 text-red-900">
                                        {item.deltas.sbirReflectionsUsed >= 0 ? '+' : ''}{item.deltas.sbirReflectionsUsed}
                                      </td>
                                      <td className="text-right p-1 text-red-900">
                                        {item.deltas.activeTermsTotal >= 0 ? '+' : ''}{item.deltas.activeTermsTotal}
                                      </td>
                                      <td className="text-right p-1">—</td>
                                      <td className="text-right p-1">—</td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
                
                {/* Term Count Debug (55-80 Hz band) */}
                {safeDebug?.termCountDebug55_80Hz && safeDebug.termCountDebug55_80Hz.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-blue-300">
                    <div className="font-semibold text-purple-700 mb-1">Term Count Debug (55–80 Hz):</div>
                    <div className="text-[9px] font-mono space-y-0.5 max-h-48 overflow-y-auto">
                      {safeDebug.termCountDebug55_80Hz.slice(0, 20).map((entry, i) => (
                        <div key={i} className={
                          i > 0 && (
                            entry.modesUsed !== safeDebug.termCountDebug55_80Hz[i-1].modesUsed ||
                            entry.sbirReflectionsUsed !== safeDebug.termCountDebug55_80Hz[i-1].sbirReflectionsUsed
                          ) ? 'text-red-600 font-bold' : 'text-gray-700'
                        }>
                          {fmtFixed(entry.exactFreqHz, 3)} Hz: 
                          modes={entry.modesUsed}/{entry.modesConsidered} 
                          (skip: bw={entry.modesSkippedBandwidth}, coup={entry.modesSkippedCoupling}), 
                          sbir={entry.sbirReflectionsUsed}, 
                          total={entry.activeTermsTotal}
                        </div>
                      ))}
                      {safeDebug.termCountDebug55_80Hz.length > 20 && (
                        <div className="text-gray-500 italic">
                          ... ({safeDebug.termCountDebug55_80Hz.length - 20} more)
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* Graph or placeholder */}
          {displayData.length > 0 ? (() => {
            // [PLOT AUDIT] - Verify what's actually being plotted
            const dataToPlot = plottedSeries;
            const finiteSpl = dataToPlot.map(d => d.spl).filter(v => Number.isFinite(v));
            const audit40_70 = safeGraphDebug?.audit40_70 || null;

            // Calculate min/max from ONLY the finite, in-window values (what's actually plotted)
            const visualMin = finiteSpl.length > 0 ? Math.min(...finiteSpl) : null;
            const visualMax = finiteSpl.length > 0 ? Math.max(...finiteSpl) : null;
            
            const __plotAudit = {
              using: "plottedSeries",
              len: dataToPlot.length,
              finiteCount: finiteSpl.length,
              min: fmtFixed(visualMin, 2, 'N/A'),
              max: fmtFixed(visualMax, 2, 'N/A'),
              smoothing: rewStyleMode ? 'none' : rewSmoothing,
              rewCompareView,
              userSmoothingChoice: rewSmoothing,
              audit40_70,
              rewLockedWindow: (isRewStyle && yAxisLocked) ? `${fmtFixed(rewLockedMin, 0)} to ${fmtFixed(rewLockedMax, 0)} dB` : 'N/A',
              yAxisUsesLockedBounds: (isRewStyle && yAxisLocked) ? 'YES' : 'NO',
              integrityCheck: plotIntegrityCheck
            };
            if (globalThis.__B44_LOGS) {
              globalThis.__B44_LAST_PLOT_AUDIT = __plotAudit;
            }
            
            return (
              <>
                {rewStyleMode && (
                  <div className="text-[10px] text-gray-500 mb-1">
                    Plot source: plottedSeries ({Array.isArray(plottedSeries) ? plottedSeries.length : 0}) | 
                    Locked: {yAxisLocked ? 'YES (nulls applied)' : 'NO'} | 
                    Integrity: {plotIntegrityCheck.status === 'VALID' && plotIntegrityCheck.duplicateXCount === 0 && plotIntegrityCheck.nonIncreasingCount === 0 ? '✓' : '✗'}
                  </div>
                )}
                <BassGraph
                  responseData={plottedSeries}
                  schroederFrequency={schroederFrequency}
                  rp22Levels={rp22Levels}
                  toggles={toggles}
                  crossoverFrequency={80}
                  modeFrequencies={modeFrequencies}
                  showModeMarkers={isDraggingSub ? false : (rewStyleMode ? showRewModeLines : showModeMarkers)}
                  modeMarkers={isDraggingSub ? { axial: [], tangential: [], oblique: [] } : modeMarkersForGraph}
                  linearHzAxis={rewStyleMode && linearHzAxis}
                  rewStyleMode={rewStyleMode}
                  yDomain={yDomain}
                  xDomain={[20, 200]}
                  showAxialOnly={false}
                  refDb={rewStyleMode ? (rewRelativeView ? 0 : rewDisplayRefDb) : (rewRelativeView ? 0 : 85)}
                  disableHighlight={rewRelativeView}
                />
              </>
            );
          })() : (
            <div style={{ border: "1px solid #DCDBD6", borderRadius: 12, background: "#F8F8F7", padding: 12, color: "#3E4349", fontSize: 13 }}>
              No graph data yet.
              {rewStyleMode ? (
                <div className="text-xs mt-2">
                  REW mode is ON — if this stays blank, the debug banner above should say why.
                </div>
              ) : (
                <div className="text-xs mt-2">
                  Add at least one sub and one seat, then check this panel again.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bass Audit Debug Block (Always Visible) */}
      {typeof globalThis !== 'undefined' && globalThis.__B44_BASS_AUDIT === true && (
        <div className="rounded-lg border-4 border-red-600 bg-red-50 p-4 mb-4">
          <div className="text-sm font-bold text-red-900 mb-3">
            BASS AUDIT – ENGINE INTERNAL VALUES (DEBUG)
          </div>
          
          {/* Graph source + toggles diagnostic */}
          <div className="text-xs font-mono mb-3 bg-yellow-100 p-2 rounded border border-yellow-400">
            <div className="font-semibold text-yellow-900 mb-1">Graph source + toggles</div>
            <div className="space-y-0.5 text-[10px]">
              <div>
                <strong>graphSource:</strong> {(() => {
                  // Determine which engine produced the plotted series
                  if (rewStyleMode) {
                    return "roomModesEngine";
                  }
                  return "bassSimulationEngine";
                })()}
              </div>
              <div>
                <strong>sbirEnabledPassed:</strong> {String(rewSbirEnabled)}
              </div>
              <div>
                <strong>modesEnabledPassed:</strong> {String(modesEnabled)}
              </div>
              <div>
                <strong>plottedSeriesName:</strong> modalPlusSbir (REW parity, always)
              </div>
              <div>
                <strong>sbirPathsUsed:</strong> {(() => {
                  if (safeDebug?.sbirDebugProbe63Hz?.pathsUsed) {
                    return safeDebug.sbirDebugProbe63Hz.pathsUsed;
                  }
                  if (safeDebug?.sbirDebugProbe40Hz?.pathsUsed) {
                    return safeDebug.sbirDebugProbe40Hz.pathsUsed;
                  }
                  return "N/A";
                })()}
              </div>
            </div>
          </div>
          {bassAudit && Array.isArray(bassAudit.contributors) && bassAudit.contributors.length > 0 && Array.isArray(bassAudit.summations) ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono border-collapse">
                <thead>
                  <tr className="border-b-2 border-red-400">
                    <th className="text-left p-2 text-red-900">Frequency (Hz)</th>
                    <th className="text-left p-2 text-red-900">Sub ID</th>
                    <th className="text-right p-2 text-red-900">Distance (m)</th>
                    <th className="text-right p-2 text-red-900">Amplitude</th>
                    <th className="text-right p-2 text-red-900">Phase (rad)</th>
                    <th className="text-right p-2 text-red-900">Final SPL (dB)</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    // Show only 50 Hz entries
                    const entries50Hz = (bassAudit.contributors || []).filter(c => c?.frequencyHz === 50);
                    
                    if (entries50Hz.length === 0) {
                      return (
                        <tr>
                          <td colSpan="6" className="p-2 text-center text-red-700">
                            No 50 Hz data in audit
                          </td>
                        </tr>
                      );
                    }
                    
                    return entries50Hz.map((contrib, idx) => {
                      const summation = (bassAudit?.summations || []).find(s => 
                        s?.frequencyHz === 50 && s?.seatId === contrib?.seatId
                      );
                      
                      return (
                        <tr key={idx} className="border-b border-red-200 hover:bg-red-100">
                          <td className="p-2">{contrib.frequencyHz}</td>
                          <td className="p-2">{contrib.subId}</td>
                          <td className="text-right p-2">{fmtFixed(contrib.distance, 2)}</td>
                          <td className="text-right p-2">{fmtFixed(contrib.amplitude, 4)}</td>
                          <td className="text-right p-2">{fmtFixed(contrib.phiTotal, 4)}</td>
                          <td className="text-right p-2 font-bold">
                            {fmtFixed(summation?.finalSplDb, 2, '—')}
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-sm text-red-700 font-mono">
              Audit enabled but no data received from engine.
            </div>
          )}
        </div>
      )}

      {/* Bass Audit Table (REW Comparison) */}
      {simulationResults?.audit?.enabled === true && Array.isArray(simulationResults.audit.contributors) && simulationResults.audit.contributors.length > 0 && Array.isArray(simulationResults.audit.summations) && (
        <div className="rounded-lg border border-[#213428] bg-[#213428]/5 p-4">
          <div className="text-sm font-bold text-[#213428] mb-3">
            Bass Simulation Audit (REW Comparison)
          </div>
          <div className="text-xs text-[#3E4349] mb-2">
            Audit enabled: {String(simulationResults.audit.enabled)} | 
            contributors: {(simulationResults.audit.contributors || []).length} | 
            summations: {(simulationResults.audit.summations || []).length}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px] font-mono border-collapse">
              <thead>
                <tr className="border-b border-[#DCDBD6]">
                  <th className="text-left p-1 text-[#3E4349]">Freq (Hz)</th>
                  <th className="text-left p-1 text-[#3E4349]">Sub ID</th>
                  <th className="text-right p-1 text-[#3E4349]">db0 (curve)</th>
                  <th className="text-right p-1 text-[#3E4349]">dbDist</th>
                  <th className="text-right p-1 text-[#3E4349]">dbBoundary</th>
                  <th className="text-right p-1 text-[#3E4349]">dbPower</th>
                  <th className="text-right p-1 text-[#3E4349]">dbEq</th>
                  <th className="text-right p-1 text-[#3E4349]">dbGain</th>
                  <th className="text-right p-1 text-[#3E4349]">dbMag</th>
                  <th className="text-right p-1 text-[#3E4349]">Amplitude</th>
                  <th className="text-right p-1 text-[#3E4349]">Phi Dist</th>
                  <th className="text-right p-1 text-[#3E4349]">Phi Delay</th>
                  <th className="text-right p-1 text-[#3E4349]">Phi Pol</th>
                  <th className="text-right p-1 text-[#3E4349]">Phi Total</th>
                  <th className="text-right p-1 text-[#3E4349]">Sub Real</th>
                  <th className="text-right p-1 text-[#3E4349]">Sub Imag</th>
                  <th className="text-right p-1 text-[#3E4349]">Filt Real</th>
                  <th className="text-right p-1 text-[#3E4349]">Filt Imag</th>
                  <th className="text-right p-1 text-[#3E4349]">Sum Real</th>
                  <th className="text-right p-1 text-[#3E4349]">Sum Imag</th>
                  <th className="text-right p-1 text-[#3E4349]">Final SPL</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  // Build flat rows sorted by frequency ascending
                  const auditFreqs = [20, 30, 40, 50, 63, 80, 100, 125, 160];
                  const rows = [];
                  
                  auditFreqs.forEach(freq => {
                    // Get contributors for this frequency
                    const contributors = (bassAudit.contributors || []).filter(c => c?.frequencyHz === freq);
                    
                    // Get summation for this frequency
                    const summation = (bassAudit.summations || []).find(s => s?.frequencyHz === freq);
                    
                    if (contributors.length === 0) return;
                    
                    contributors.forEach((contrib, idx) => {
                      if (!contrib) return;
                      const isLastSub = idx === contributors.length - 1;
                      
                      rows.push(
                        <tr key={`${freq}-${contrib.subIndex}`} className="border-b border-[#E6E4DD] hover:bg-[#F8F8F7]">
                          <td className="p-1">{freq}</td>
                          <td className="p-1">{contrib.subId || '—'}</td>
                          <td className="text-right p-1">{fmtFixed(contrib.db0, 2)}</td>
                          <td className="text-right p-1">{fmtFixed(contrib.dbDist, 2)}</td>
                          <td className="text-right p-1">{fmtFixed(contrib.dbBoundary, 2)}</td>
                          <td className="text-right p-1">{fmtFixed(contrib.dbPower, 2)}</td>
                          <td className="text-right p-1">{fmtFixed(contrib.dbEq, 2)}</td>
                          <td className="text-right p-1">{fmtFixed(contrib.dbGain, 2)}</td>
                          <td className="text-right p-1">{fmtFixed(contrib.dbMag, 2)}</td>
                          <td className="text-right p-1">{fmtFixed(contrib.amplitude, 2)}</td>
                          <td className="text-right p-1">{fmtFixed(contrib.phiDistance, 2)}</td>
                          <td className="text-right p-1">{fmtFixed(contrib.phiDelay, 2)}</td>
                          <td className="text-right p-1">{fmtFixed(contrib.phiPolarity, 2)}</td>
                          <td className="text-right p-1">{fmtFixed(contrib.phiTotal, 2)}</td>
                          <td className="text-right p-1">{fmtFixed(contrib.subReal, 2)}</td>
                          <td className="text-right p-1">{fmtFixed(contrib.subImag, 2)}</td>
                          <td className="text-right p-1">{fmtFixed(contrib.filteredReal, 2)}</td>
                          <td className="text-right p-1">{fmtFixed(contrib.filteredImag, 2)}</td>
                          <td className="text-right p-1">{isLastSub && summation ? fmtFixed(summation.sumReal, 2) : ''}</td>
                          <td className="text-right p-1">{isLastSub && summation ? fmtFixed(summation.sumImag, 2) : ''}</td>
                          <td className="text-right p-1">{isLastSub && summation ? fmtFixed(summation.finalSplDb, 2) : ''}</td>
                        </tr>
                      );
                    });
                  });
                  
                  return rows;
                })()}
              </tbody>
            </table>
          </div>
          <div className="text-xs text-[#3E4349] mt-2">
            Audit seat: {bassAudit?.seatId || 'N/A'}
          </div>
        </div>
      )}

      {/* Bass Metrics (20-80 Hz) */}
      {bassMetrics2080Hz && (
        <div className="rounded-lg border border-[#DCDBD6] bg-white p-4">
          <div className="text-sm font-bold text-[#1B1A1A] mb-3">
            Bass Metrics (20–80 Hz)
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="text-[#3E4349]">Seat-to-seat variance:</span>
                <Badge className="bg-[#F8F8F7] text-[#3E4349] border-[#DCDBD6] text-xs">
                  RP22 P14: (pending thresholds)
                </Badge>
              </div>
              <span className="font-medium text-[#1B1A1A]">
                {fmtFixed(bassMetrics2080Hz.variance, 2)} dB
              </span>
            </div>
            <div className="text-xs text-[#3E4349] pl-4">
              Lower is better (uniformity)
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-[#3E4349]">Best ↔ Worst seat:</span>
              <span className="font-medium text-[#1B1A1A]">
                {fmtFixed(bassMetrics2080Hz.bestWorstDelta, 1)} dB
              </span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-[#3E4349]">Null count (≥6dB dips):</span>
              <span className="font-medium text-[#1B1A1A]">
                {bassMetrics2080Hz.nullCount}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Tuning Warnings */}
      {simulationResults.metrics?.tuningWarnings && simulationResults.metrics.tuningWarnings.length > 0 && (
        <Alert className="border border-[#C1B6AD] bg-[#F8F8F7] text-[#3E4349]">
          <AlertDescription className="text-sm">
            <div className="font-medium mb-1">Check headroom & alignment:</div>
            {simulationResults.metrics.tuningWarnings.map((w, i) => (
              <div key={i}>{w}</div>
            ))}
          </AlertDescription>
        </Alert>
      )}
      
      {/* Session Autosave Controls */}
      <div className="rounded-lg border border-[#DCDBD6] bg-white p-4">
        <div className="text-sm font-medium text-[#1B1A1A] mb-3">Session Auto-Save</div>
        <div className="space-y-3">
          <div className="flex gap-2 items-center flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => restoreAutosave?.()}
              className="text-xs"
            >
              Restore last session
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => clearAutosave?.()}
              className="text-xs"
            >
              Clear autosave
            </Button>
            <div className="text-xs text-[#3E4349]">
              {autosaveMeta?.savedAt 
                ? `Last autosave: ${new Date(autosaveMeta.savedAt).toLocaleTimeString()}` 
                : "No autosave yet"}
            </div>
          </div>
          <div className="text-xs text-[#3E4349] bg-[#F8F8F7] p-2 rounded space-y-1">
            <div>Auto-saves room state every 500ms (prevents data loss on Preview refresh)</div>
            <div className="text-[10px] font-mono text-blue-700 pt-1 border-t border-[#DCDBD6]">
              <strong>Display offset in Relative view:</strong> {allowDisplayRefOffset ? `${fmtFixed(toNum(rewDisplayRefDb) || 0, 2)} dB` : '0.00 dB (forced)'}
            </div>
          </div>
        </div>
      </div>

      {/* Room Damping Control */}
      <div className="rounded-lg border border-[#DCDBD6] bg-white p-4">
        <div className="text-sm font-medium text-[#1B1A1A] mb-3">Room Acoustics</div>
        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs text-[#3E4349]">Room Damping</Label>
              <span className="text-xs font-mono text-[#1B1A1A]">
                {fmtFixed(roomDamping, 0)}
              </span>
            </div>
            <input
              type="range"
              value={roomDamping}
              onChange={(e) => setRoomDamping(Number(e.target.value))}
              min="8"
              max="35"
              step="1"
              className="w-full"
            />
            <div className="flex justify-between text-xs text-[#3E4349] mt-1">
              <span>Dead (8)</span>
              <span>Lively (35)</span>
            </div>
          </div>
          <div className="text-xs text-[#3E4349]">
            Modal + SBIR simulation (REW parity, always on)
          </div>
        </div>
      </div>



      {/* Auto Align Controls */}
      {totalSubCount > 0 && (
        <div className="rounded-lg border border-[#DCDBD6] bg-white p-4">
          <div className="text-sm font-medium text-[#1B1A1A] mb-3">Time Alignment</div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="auto-align-toggle" className="text-xs text-[#3E4349]">
                Auto time-align to MLP
              </Label>
              <Switch
                id="auto-align-toggle"
                checked={autoAlignEnabled}
                onCheckedChange={setAutoAlignEnabled}
              />
            </div>
            {autoAlignEnabled && (
              <div className="text-xs text-[#3E4349] bg-[#F8F8F7] p-2 rounded">
                Subs are automatically aligned by distance to MLP for coherent summation. Disable to manually adjust delays.
              </div>
            )}
            {!autoAlignEnabled && (
              <div className="text-xs text-[#3E4349] bg-[#F8F8F7] p-2 rounded">
                Manual mode: adjust delays below to control phase alignment.
              </div>
            )}
            {totalSubCount > 1 && (
              <div className="flex items-center gap-2">
                <Switch 
                  id="try-polarity" 
                  checked={tryPolarity}
                  onCheckedChange={setTryPolarity}
                />
                <Label htmlFor="try-polarity" className="text-xs text-[#3E4349]">
                  Try polarity inversion
                </Label>
              </div>
            )}
            {autoAlignEnabled && totalSubCount > 0 && (
              <div className="flex gap-2">
                {frontSubsCfg?.count > 0 && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => autoAlignSubs('Front')}
                    className="text-xs"
                  >
                    Re-align Front
                  </Button>
                )}
                {rearSubsCfg?.count > 0 && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => autoAlignSubs('Rear')}
                    className="text-xs"
                  >
                    Re-align Rear
                  </Button>
                )}
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
              subDistances={subDistances}
              autoAlignEnabled={autoAlignEnabled}
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
              subDistances={subDistances}
              autoAlignEnabled={autoAlignEnabled}
              onSettingsChange={(newSettings) => {
                setRearSubsCfg(prev => ({ ...prev, settingsById: newSettings }));
              }}
            />
          </div>
        )}
      </div>

      {/* Per-seat detail cards */}
      {Object.keys(simulationResults.seatResponses).length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {Object.entries(simulationResults.seatResponses).map(([seatId, response]) => {
            const seat = seatingPositions.find(s => (s.id || `${s.x}-${s.y}`) === seatId);
            const isPrimary = seat?.isPrimary || false;
            const nullInfo = response.nulls || { count: 0, worstDb: 0 };
            
            return (
              <div
                key={seatId}
                className="rounded-lg border border-[#DCDBD6] bg-white p-3"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium text-[#1B1A1A]">
                    Seat {seatId}
                  </div>
                  {isPrimary && (
                    <Badge className="bg-[#213428] text-white border-[#213428]">MLP</Badge>
                  )}
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