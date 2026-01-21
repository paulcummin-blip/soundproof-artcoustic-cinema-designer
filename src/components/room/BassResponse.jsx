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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
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

  const dimsTxt = `${(roomDims?.widthM ?? 0).toFixed(1)}×${(roomDims?.lengthM ?? 0).toFixed(1)}×${(roomDims?.heightM ?? 0).toFixed(1)} m`;

  // Safe formatter for numbers that might be undefined/null
  const fmtFixed = (v, dp = 1, fallback = "—") =>
    (typeof v === "number" && Number.isFinite(v)) ? v.toFixed(dp) : fallback;

  // State declarations (must be before useMemo/useCallback that use them)
  const [autoAlignEnabled, setAutoAlignEnabled] = useState(true);
  const [tryPolarity, setTryPolarity] = useState(false);
  const [hasAutoAlignedFront, setHasAutoAlignedFront] = useState(false);
  const [hasAutoAlignedRear, setHasAutoAlignedRear] = useState(false);
  const [modesEnabled, setModesEnabled] = useState(false);
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
  const [rewSbirEnabled, setRewSbirEnabled] = useState(false); // SBIR reflections toggle
  const [modalProbeEnabled, setModalProbeEnabled] = useState(false); // Modal Probe toggle
  const [debugDisableSealedGain, setDebugDisableSealedGain] = useState(false); // Debug: disable sealed-room LF gain
  const [debugDisableNullRepair, setDebugDisableNullRepair] = useState(false); // Debug: disable null repair/fill

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
  
  // Component view mode (Part 3 - SBIR isolation)
  const [componentView, setComponentView] = useState('modalPlusSbir'); // 'modalOnly' | 'sbirOnly' | 'modalPlusSbir'
  
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
      return `${Number(p?.x).toFixed(4)},${Number(p?.y).toFixed(4)},${Number(p?.z ?? 0).toFixed(4)}`;
    }).join("|");
  }, [frontSubsLive]);

  const rearLiveSig = useMemo(() => {
    const a = Array.isArray(rearSubsLive) ? rearSubsLive : [];
    return a.map((s) => {
      const p = s?.position ?? s;
      return `${Number(p?.x).toFixed(4)},${Number(p?.y).toFixed(4)},${Number(p?.z ?? 0).toFixed(4)}`;
    }).join("|");
  }, [rearSubsLive]);

  // Incrementing epoch to force modal recomputation when subs move
  const subPositionEpoch = useMemo(() => {
    return `${frontLiveSig}||${rearLiveSig}`;
  }, [frontLiveSig, rearLiveSig]);

  const engineCallCountRef = useRef(0);
  const [engineCallsUi, setEngineCallsUi] = useState(0);

  // Build subs array from LIVE dragged positions (frontSubsLive + rearSubsLive)
  const subsForSimulation = useMemo(() => {
    const liveFront = Array.isArray(frontSubsLive) ? frontSubsLive : [];
    const liveRear = Array.isArray(rearSubsLive) ? rearSubsLive : [];

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
    // ensure re-run when the live arrays or any positions change
    frontLiveSig,
    rearLiveSig,
    frontSubsLive,
    rearSubsLive,
    // also watch config for tuning settings
    frontSubsCfg?.settingsById,
    rearSubsCfg?.settingsById,
    // plus room dims if you need them elsewhere in the pipeline
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
    
    const x = Number(seat.x).toFixed(2);
    const y = Number(seat.y).toFixed(2);
    const z = Number(seat.z ?? 1.2).toFixed(2);
    
    return `${x}_${y}_${z}`;
  }, [seatingPositions]);

  const stableSubSig = useMemo(() => {
    if (!subsForSimulation || subsForSimulation.length === 0) return "";
    
    return subsForSimulation.map(s => {
      const x = Number(s.x).toFixed(2);
      const y = Number(s.y).toFixed(2);
      const z = Number(s.z ?? 0).toFixed(2);
      const gainDb = Number(s.tuning?.gainDb ?? 0).toFixed(1);
      const delayMs = Number(s.tuning?.delayMs ?? 0).toFixed(1);
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
    const sig = `w=${w.toFixed(2)}|l=${l.toFixed(2)}|h=${h.toFixed(2)}|seat=${seatPos.x.toFixed(2)},${seatPos.y.toFixed(2)},${seatPos.z.toFixed(2)}|subs=${sourcePositions.map(s => `${s.x.toFixed(2)},${s.y.toFixed(2)},${s.z.toFixed(2)},g${(s.tuning?.gainDb||0).toFixed(1)},d${(s.tuning?.delayMs||0).toFixed(1)},p${s.tuning?.polarity||'normal'}`).join('|')}|damp=${roomDamping}`;

    // Check failure cache
    if (lastRewFailSigRef.current === sig) {
      return lastRewFailResultRef.current || null;
    }

    try {
      const result = computeRoomModesResponse({
        roomDims: { widthM: w, lengthM: l, heightM: h },
        sourcePositions,
        seatPosition: seatPos,
        fMin: 15,
        fMax: 200,
        pointsPerOct: 24,
        modeLimitHz: 200,
        q: roomDamping,
        includeAxial: modesEnabled,
        includeTangential: modesEnabled,
        includeOblique: modesEnabled,
        includeSBIR: rewSbirEnabled,
        rewParityMode: true,
        smoothing: 'none', // NO SMOOTHING for audit
        subFloorHeight: 0.0,
        normalizeBandHz: null, // NO NORMALIZATION for audit
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
        sbirDebugSingleFrontWall: sbirDebugSingleFrontWall // DIAGNOSTIC: single reflection mode
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
    const sig = `w=${w.toFixed(2)}|l=${l.toFixed(2)}|h=${h.toFixed(2)}|seat=${seatSig}|subs=${subSig}|smooth=${graphSmoothing}|rel=${rewRelativeView?1:0}|damp=${roomDamping}|cv:${componentView}`;
    
    // Build run key for bounce detection
    const runKey = `${w.toFixed(2)}x${l.toFixed(2)}x${h.toFixed(2)}|${seatSig}|${subSig}|${graphSmoothing}|${rewRelativeView?'rel':'abs'}|d${roomDamping}|cv:${componentView}`;
    
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
    try {
      
      result = computeRoomModesResponse({
        roomDims: { widthM: w, lengthM: l, heightM: h },
        sourcePositions,
        seatPosition: seatPos,
        fMin: 15,
        fMax: 200,
        pointsPerOct: 24,
        modeLimitHz: 200,
        q: roomDamping,
        includeAxial: true,
        includeTangential: true,
        includeOblique: true,
        includeSBIR: rewSbirEnabled,
        rewParityMode: true,
        smoothing: rewStyleMode ? 'none' : rewSmoothing,
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
        subProductCurves: null, // Room-only: no product curves
        absoluteSplMode: true,
        rawEngineOutput: modalOnlyDebugView, // Pass raw mode flag
        modeIsolation: modeIsolation !== 'off' ? modeIsolation : null, // Part H - mode isolation
        complexEigenfunctions: complexEigenfunctions, // Part H3 - complex eigenfunctions
        componentView: componentView, // Part 3 - component isolation
        disableSealedRoomGain: debugDisableSealedGain,
        disableNullRepair: debugDisableNullRepair
      });
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
    
    return {
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
    modesEnabled, // Include modes toggle
    rewSbirEnabled, // Include SBIR toggle
    debugDisableSealedGain, // Include debug toggle to gate display-side LF rise
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
    const sig = `w=${w.toFixed(2)}|l=${l.toFixed(2)}|h=${h.toFixed(2)}|seat=${seatSig}|subs=${subSig}|smooth=${graphSmoothing}|rel=${rewRelativeView ? 1 : 0}|damp=${roomDamping}|view=product|cv:${componentView}`;
    
    // Build run key for bounce detection
    const runKey = `${w.toFixed(2)}x${l.toFixed(2)}x${h.toFixed(2)}|${seatSig}|${subSig}|${graphSmoothing}|${rewRelativeView?'rel':'abs'}|d${roomDamping}|cv:${componentView}|view:product`;
    
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
          originalAt50Hz: valueAt50Hz?.toFixed(1) || 'N/A',
          relativeMinDb: minDb.toFixed(1),
          relativeMaxDb: maxDb.toFixed(1),
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
    let result;
    try {
      
      result = computeRoomModesResponse({
        roomDims: { widthM: w, lengthM: l, heightM: h },
        sourcePositions,
        seatPosition: seatPos,
        fMin: 15,
        fMax: 200,
        pointsPerOct: 24,
        modeLimitHz: 200,
        q: roomDamping,
        includeAxial: modesEnabled,
        includeTangential: modesEnabled,
        includeOblique: modesEnabled,
        includeSBIR: rewSbirEnabled,
        rewParityMode: true,
        smoothing: rewStyleMode ? 'none' : rewSmoothing,
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
        subProductCurves, // Apply per-sub product curves
        absoluteSplMode: true,
        rawEngineOutput: modalOnlyDebugView, // Pass raw mode flag
        modeIsolation: modeIsolation !== 'off' ? modeIsolation : null, // Part H - mode isolation
        complexEigenfunctions: complexEigenfunctions, // Part H3 - complex eigenfunctions
        componentView: componentView, // Part 3 - component isolation
        sbirDebugSingleFrontWall: sbirDebugSingleFrontWall // DIAGNOSTIC: single reflection mode
      });
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
      return { data: [], debug: { ...result.debug, error: "No finite values" } };
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
      scaleWarning = `Room-only range: ${roomOnlySplRange.toFixed(1)} dB, Room+Product range: ${productSplRange.toFixed(1)} dB — scale mismatch detected`;
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

    return {
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
    modesEnabled, // Include modes toggle
    rewSbirEnabled, // Include SBIR toggle
    sourcesSig // FORCE-RECOMPUTE: changes when sub position/tuning changes
  ]);

  // Single activeDebug definition (prevents duplicate logic and ensures correct engine state visibility)
  const activeDebug = useMemo(() => {
    if (!rewStyleMode) return null;
    const useRel = rewRelativeView;
    const dbg = rewView === 'roomPlusProduct'
      ? (useRel ? rewRoomPlusProductDataAbs?.debug : rewRoomPlusProductDataAbs?.debug)
      : (useRel ? rewModesDataAbs?.debug : rewModesDataAbs?.debug);
    return dbg || null;
  }, [rewStyleMode, rewView, rewRelativeView, rewModesDataAbs, rewRoomPlusProductDataAbs, componentView]);

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

  // Convert to chart format (product-based curve) - legacy, now replaced by analysisSeriesAbs
  const responseData = useMemo(() => {
    if (!selectedSeat || !selectedSeat.freqsHz || !selectedSeat.splDb) {
      return [];
    }
    
    return selectedSeat.freqsHz.map((frequency, i) => ({
      frequency,
      spl: selectedSeat.splDb[i]
    }));
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
    // Convert dB → linear pressure, average, convert back to dB
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
        normOffsetAppliedDb: (-baselineDb).toFixed(2),
        normBandPressureMeanDb: baselineDb.toFixed(2)
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

  // Aliases switch Abs/Rel based on UI toggle
  const rewModesData = rewRelativeView ? rewModesDataRel : rewModesDataAbs;
  const rewRoomPlusProductData = rewRelativeView ? rewRoomPlusProductDataRel : rewRoomPlusProductDataAbs;

  // Display mode gates (CRITICAL: Relative view and Display ref are mutually exclusive)
  const isRewStyle = !!rewStyleMode;
  const isRelative = isRewStyle && !!rewRelativeView;
  const isCompare = isRewStyle && !!rewCompareView;
  
  // IMPORTANT: Relative view must NEVER apply absolute display reference offsets
  const allowDisplayRefOffset = isRewStyle && !isRelative;
  
  // REW locked window bounds (fixed ±30 dB window around display ref, like REW's 60-120 dB)
  const rewLockedMin = isRewStyle && yAxisLocked ? (Number(rewDisplayRefDb) || 90) - 30 : null;
  const rewLockedMax = isRewStyle && yAxisLocked ? (Number(rewDisplayRefDb) || 90) + 30 : null;

  // REW mode: Three distinct series for plotting (RAW, ENGINE, DISPLAY)
  const { rewRawSeries, rewEngineFinalSeries, rewDisplayFinalSeries } = useMemo(() => {
    // Select active dataset (Room-only or Room+Product)
    const activeDataset = rewView === 'roomPlusProduct' 
      ? rewRoomPlusProductData 
      : rewModesDataAbs;
    
    if (!activeDataset || !activeDataset.data || activeDataset.data.length === 0) {
      return { rewRawSeries: [], rewEngineFinalSeries: [], rewDisplayFinalSeries: [] };
    }
    
    // RAW: coherent pressure before any processing (from engine debug)
    const rawDb = activeDataset.coherentRawDb;
    const rawSeries = rawDb && Array.isArray(rawDb) && rawDb.length > 0
      ? activeDataset.freqs.map((frequency, i) => ({
          frequency,
          spl: rawDb[i]
        }))
      : [];
    
    // ENGINE FINAL: smoothed/processed output from engine (plottedDb or splDb)
    const engineFinalSeries = activeDataset.data || [];
    
    // DISPLAY FINAL:
    // - Absolute view: ENGINE FINAL + display ref (e.g. 85/90/95/100 dB)
    // - Relative view: DISPLAY-ONLY reference shift so median(30–80 Hz) becomes 0 dB (REW-style overlay alignment)
    // CRITICAL: allowDisplayRefOffset prevents stacking of relative + absolute offsets
    const displayOffsetDb = allowDisplayRefOffset ? (Number(rewDisplayRefDb) || 0) : 0;

    // Relative shift (median 30–80 Hz -> 0 dB)
    let relShiftDb = 0;

    if (rewRelativeView) {
      const band = (engineFinalSeries || [])
        .filter(p => p && p.frequency >= 30 && p.frequency <= 80 && Number.isFinite(p.spl))
        .map(p => p.spl);

      if (band.length >= 3) {
        const sorted = [...band].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        relShiftDb = -median;
      } else {
        relShiftDb = 0; // safe fallback
      }
    }

    const displaySeries = (engineFinalSeries || []).map(d => ({
      frequency: d.frequency,
      spl: Number.isFinite(d.spl) ? (d.spl + displayOffsetDb + relShiftDb) : d.spl
    }));
    
    return {
      rewRawSeries: rawSeries,
      rewEngineFinalSeries: engineFinalSeries,
      rewDisplayFinalSeries: displaySeries
    };
  }, [rewView, rewModesDataAbs, rewRoomPlusProductData, rewRelativeView, rewStyleMode, rewDisplayRefDb, allowDisplayRefOffset]);

  // REW final plotted series (gated to prevent stacking of relative + absolute offsets)
  const rewFinalPlottedSeries = useMemo(() => {
    if (isRelative) {
      // Relative view: use relative-normalized dataset ONLY (no additional offsets)
      return rewRelativeView && rewModesDataRel?.data?.length 
        ? rewModesDataRel.data 
        : rewDisplayFinalSeries;
    } else {
      // Absolute view: use display dataset (which may include display ref offset)
      return rewDisplayFinalSeries;
    }
  }, [isRelative, rewRelativeView, rewModesDataRel, rewDisplayFinalSeries]);

  // Choose which curve to display based on view
  const displayData = useMemo(() => {
    if (rewStyleMode) {
      // REW mode: Use gated final plotted series (no stacking)
      return rewFinalPlottedSeries;
    }
    
    // Non-REW mode: use old logic
    const baseData = rewView === 'roomPlusProduct'
      ? rewRoomPlusProductData?.data?.length ? rewRoomPlusProductData.data : (rewModesDataAbs?.data || [])
      : rewModesDataAbs?.data?.length ? rewModesDataAbs.data : (rewRoomPlusProductData?.data || []);
    
    return baseData;
  }, [rewStyleMode, rewFinalPlottedSeries, rewView, rewModesDataAbs, rewRoomPlusProductData]);

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
      `${s.x.toFixed(2)}_${s.y.toFixed(2)}_${(s.z ?? 0).toFixed(2)}`
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
      src: Number(coupling.src.toFixed(3)),
      rcv: Number(coupling.rcv.toFixed(3)),
      total: Number(coupling.total.toFixed(3))
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

  // Determine final Y-axis domain to pass to graph
  const finalYDomain = React.useMemo(() => {
    if (!rewStyleMode) return undefined;
    // REW mode: pass null so BassGraph computes from data
    return null;
  }, [rewStyleMode, yAxisDomain]);

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
  
  // Final plotted series (apply display floor + integrity cleanup)
  const plottedSeries = React.useMemo(() => {
    // Select base series
    const baseSeries = isRewStyle ? rewFinalPlottedSeries : displayData;
    
    // Apply display conditioning (floor only, no clamping)
    const conditioned = applyDisplayConditioningNulls(baseSeries, rewLockedMin, rewLockedMax, yAxisLocked, isRewStyle);
    
    // Clean for plotting (sort, deduplicate, ensure strictly increasing)
    return cleanPlottedSeries(conditioned);
  }, [isRewStyle, rewFinalPlottedSeries, displayData, rewLockedMin, rewLockedMax, yAxisLocked, cleanPlottedSeries]);
  
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
      ? `${series[largestGapIdx].frequency.toFixed(1)}–${series[largestGapIdx + 1].frequency.toFixed(1)} Hz`
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
      top5Jumps
    };
  }, [plottedSeries]);
  
  // Compute yDomain for viewport constraint (when Y-axis is locked)
  const yDomain = React.useMemo(() => {
    if (!isRewStyle || !yAxisLocked) return undefined;
    if (!Number.isFinite(rewLockedMin) || !Number.isFinite(rewLockedMax)) return undefined;
    
    return [rewLockedMin, rewLockedMax];
  }, [isRewStyle, yAxisLocked, rewLockedMin, rewLockedMax]);
  
  // Count nulled points (for user feedback)
  const { belowFloor, clampedToMin, clampedToMax } = React.useMemo(() => {
    const baseSeries = isRewStyle ? rewFinalPlottedSeries : displayData;
    const ABS_FLOOR_DB = -60;
    
    let floor = 0;
    let clampMin = 0;
    let clampMax = 0;
    
    baseSeries.forEach(p => {
      const origSpl = typeof p?.spl === "number" && Number.isFinite(p.spl) ? p.spl : null;
      if (origSpl === null) return;
      
      // Count below absolute floor (nulled)
      if (origSpl < ABS_FLOOR_DB) {
        floor++;
        return;
      }
      
      // Count clamped to window (when locked)
      if (yAxisLocked && Number.isFinite(rewLockedMin) && Number.isFinite(rewLockedMax)) {
        if (origSpl < rewLockedMin) clampMin++;
        else if (origSpl > rewLockedMax) clampMax++;
      }
    });
    
    return { belowFloor: floor, clampedToMin: clampMin, clampedToMax: clampMax };
  }, [isRewStyle, rewFinalPlottedSeries, displayData, rewLockedMin, rewLockedMax, yAxisLocked]);

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

  // Compute mode frequencies for markers (use SAME parity run to avoid drift)
  const modeFrequencies = useMemo(() => {
    if (!roomDims?.widthM || !roomDims?.lengthM || !roomDims?.heightM) return [];

    if (rewStyleMode) {
      // Use mode markers from the active debug payload (prevents drift)
      return activeDebug?.modeMarkersHz || [];
    }

    // Fallback to basic axial modes for product simulation
    const modes = computeAxialModes({
      widthM: roomDims.widthM,
      lengthM: roomDims.lengthM,
      heightM: roomDims.heightM
    }, 200);
    return modes.map(m => m.fHz);
  }, [rewStyleMode, rewModesData]);

  // Mode markers for graph overlay (REW parity)
  const modeMarkersForGraph = useMemo(() => {
    if (!rewStyleMode) return { axial: [], tangential: [], oblique: [] };
    
    const activeDebug = rewView === 'roomPlusProduct' && rewRoomPlusProductData?.debug
      ? rewRoomPlusProductData.debug
      : rewModesData?.debug;
    
    if (!activeDebug?.modeMarkers) return { axial: [], tangential: [], oblique: [] };
    
    const allMarkers = activeDebug.modeMarkers || [];
    return {
      axial: allMarkers.filter(m => m.family === 'axial'),
      tangential: allMarkers.filter(m => m.family === 'tangential'),
      oblique: allMarkers.filter(m => m.family === 'oblique')
    };
  }, [rewStyleMode, rewView, rewModesData, rewRoomPlusProductData]);

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
                {simulationResults.metrics.fairness.spreadBestWorstDb.toFixed(1)} dB
              </span>
            </div>
            <div>
              <span className="text-[#3E4349]">Worst Null:</span>
              <span className="ml-1 font-medium text-[#1B1A1A]">
                {simulationResults.metrics.fairness.nulls.worstNullDb.toFixed(1)} dB
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
                {p14MaxSpl.toFixed(1)} dB
              </div>
            </div>
            <div className="rounded-lg border border-[#DCDBD6] bg-white p-3">
              <div className="text-xs text-[#3E4349] mb-1">P18 Extension</div>
              <div className="text-lg font-bold text-[#1B1A1A]">
                {p18F3Hz.toFixed(0)} Hz
              </div>
            </div>
            <div className="rounded-lg border border-[#DCDBD6] bg-white p-3">
              <div className="text-xs text-[#3E4349] mb-1">P19 Deviation</div>
              <div className="text-lg font-bold text-[#1B1A1A]">
                ±{p19MaxDev.toFixed(1)} dB
              </div>
            </div>
            <div className="rounded-lg border border-[#DCDBD6] bg-white p-3">
              <div className="text-xs text-[#3E4349] mb-1">Bass Uniformity</div>
              <div className="text-lg font-bold text-[#1B1A1A]">
                ±{uniformitySd.toFixed(1)} dB
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
          <div style={{ fontSize: 14, fontWeight: 700, color: "#1B1A1A" }}>Bass Response</div>

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
          User smoothing: {rewSmoothing} | Graph smoothing: {graphSmoothing} | Compare: {String(rewCompareView)} | Modes: {String(modesEnabled)} | SBIR: {String(rewSbirEnabled)} | Audit: {String(globalThis?.__B44_BASS_AUDIT === true)} | DisableSealed: {String(debugDisableSealedGain)} | DisableRepair: {String(debugDisableNullRepair)}
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
          Engine modesEnabled: {String(modesEnabled)} | seatResponses: {Object.keys(simulationResults.seatResponses || {}).length}
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
                <div><strong>Test room:</strong> {testRoomOk ? '✅' : '❌'} 5.0×5.0×3.0 m (current: {(roomDims?.widthM || 0).toFixed(1)}×{(roomDims?.lengthM || 0).toFixed(1)}×{(roomDims?.heightM || 0).toFixed(1)})</div>
                <div><strong>Test seat:</strong> {testSeatOk ? '✅' : '❌'} Centre (2.5, 2.5, 1.2) (current: {seat?.x.toFixed(1)}, {seat?.y.toFixed(1)}, {(seat?.z || 1.2).toFixed(1)})</div>
                <div><strong>Test sub:</strong> {testSubOk ? '✅' : '❌'} At least one sub (current: {subsForSimulation.length})</div>
                <div><strong>RAW mode:</strong> {rawModeOk ? '✅ ENABLED' : '❌ DISABLED (toggle above)'}</div>
                <div className="mt-1 pt-1 border-t border-purple-300">
                  <strong>Status:</strong> {allReady ? '🟢 READY' : '🔴 NOT READY'}
                </div>
                {allReady && currentSubPos && (
                  <>
                    <div className="mt-1 pt-1 border-t border-purple-300 font-semibold text-purple-800">
                      Current sub position: ({currentSubPos.x.toFixed(2)}, {currentSubPos.y.toFixed(2)})
                      {closestTest && ` ≈ ${closestTest.label}`}
                    </div>
                    <div className="mt-1 pt-1 border-t border-purple-300">
                      <strong>Probe frequencies (1st/2nd length axial):</strong>
                      <div className="pl-2 space-y-0.5 mt-1">
                        <div>34 Hz: {probeValues[0] !== null ? probeValues[0].toFixed(1) + ' dB' : 'N/A'}</div>
                        <div>68 Hz: {probeValues[1] !== null ? probeValues[1].toFixed(1) + ' dB' : 'N/A'}</div>
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

        {/* REW Parity Validator (only when REW Compare is ON) */}
        {rewCompareView && rewStyleMode && (
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
          const refDbDisplay = activeDebug?.normRefDb 
            ? (typeof activeDebug.normRefDb === 'string' ? activeDebug.normRefDb : activeDebug.normRefDb.toFixed(1))
            : (rewRelativeView ? "0.0" : "85.0");
          
          return (
            <div className="text-xs text-[#1B1A1A] mb-2 bg-blue-50 p-2 rounded border border-blue-300">
              <div className="font-semibold mb-1">REW Compare View (Display Preset)</div>
              <div className="text-[10px] space-y-0.5">
                <div>• Room: {(roomDims?.widthM || 0).toFixed(1)}×{(roomDims?.lengthM || 0).toFixed(1)}×{(roomDims?.heightM || 0).toFixed(1)} m</div>
                <div>• Smoothing: 1/3 octave (fixed)</div>
                <div>• Sealed room: ALWAYS (cinemas are sealed)</div>
                <div>• Absolute SPL mode (30–80 Hz → 85 dB reference)</div>
                <div>• RefDb (median 30–80): {refDbDisplay} dB</div>
                <div>• Y window: 65–105 dB (fixed for comparison)</div>
                <div className="text-[9px] opacity-70 mt-1">Engine SPL range (raw): {activeDebug?.splMinDb || '—'} to {activeDebug?.splMaxDb || '—'} dB</div>
                <div className="text-[9px] opacity-70">Display SPL range: {(() => {
                  const finite = displayData.filter(d => Number.isFinite(d.spl)).map(d => d.spl);
                  if (finite.length === 0) return 'N/A';
                  return `${Math.min(...finite).toFixed(1)} to ${Math.max(...finite).toFixed(1)} dB`;
                })()}</div>
                <div className="text-[9px] opacity-70 text-purple-700 font-semibold mt-1">
                  LF delta (25→69 Hz): {activeDebug?.lfProbe?.lfDelta_25_69 || 'N/A'} dB | 
                  Upper-bass delta (69→120 Hz): {activeDebug?.lfProbe?.upperBassDelta_69_120 || 'N/A'} dB
                </div>
                {rewCompareBaselineRef.current && (
                  <div className="text-[9px] opacity-70 mt-1 pt-1 border-t border-blue-200">
                    Baseline: captured at {new Date(rewCompareBaselineRef.current.timestamp).toLocaleTimeString()}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (rewModesData?.splDb && rewModesData.debug?.splDbRepaired) {
                          rewCompareBaselineRef.current = {
                            splDbRepaired: [...rewModesData.debug.splDbRepaired],
                            freqs: [...rewModesData.freqs],
                            sourceSigRounded: rewModesData.debug?.sourceSigRounded,
                            seatSigRounded: rewModesData.debug?.seatSigRounded,
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
          if (!activeDebug?.lfProbeRaw) return null;

          return (
            <div className="text-xs text-[#3E4349] mb-2 bg-orange-50 p-2 rounded border border-orange-300">
              <div className="font-semibold mb-1 text-orange-700">LF Probe Raw (Pre-smoothing)</div>
              <div className="text-[9px] space-y-0.5 font-mono">
                {activeDebug.lfProbeRaw.map((probe, i) => (
                  <div key={i}>
                    {probe.freq} Hz: blended={probe.blendedMagDb_pre} (w={probe.w}, direct={probe.directMagDb_pre}, modal={probe.scaledModalMagDb_pre})
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
                      {p.freq} Hz: {p.delta >= 0 ? '+' : ''}{p.delta.toFixed(2)} dB
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
                  <div>Source Δ: {fmtFixed(sensitivityAudit?.couplingDeltas?.src, 3, '0.000') >= 0 ? '+' : ''}{fmtFixed(sensitivityAudit?.couplingDeltas?.src, 3)}</div>
                  <div>Receiver Δ: {fmtFixed(sensitivityAudit?.couplingDeltas?.rcv, 3, '0.000') >= 0 ? '+' : ''}{fmtFixed(sensitivityAudit?.couplingDeltas?.rcv, 3)}</div>
                  <div>Total Δ: {fmtFixed(sensitivityAudit?.couplingDeltas?.total, 3, '0.000') >= 0 ? '+' : ''}{fmtFixed(sensitivityAudit?.couplingDeltas?.total, 3)}</div>
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

        {/* Advanced debug controls (only visible when REW mode is ON) */}
        {rewStyleMode && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox 
                id="raw-engine-output" 
                checked={modalOnlyDebugView}
                onCheckedChange={setModalOnlyDebugView}
              />
              <Label htmlFor="raw-engine-output" className="text-xs font-semibold" style={{ color: modalOnlyDebugView ? '#dc2626' : '#3E4349' }}>
                RAW ENGINE OUTPUT — Pure coherent pressure (modal+SBIR), zero processing
              </Label>
            </div>
            
            {/* Mode excitation diagnostic toggle (Part G) */}
            {typeof globalThis !== 'undefined' && globalThis.__B44_BASS_DEBUG && (
              <div className="flex items-center gap-2">
                <Checkbox 
                  id="mode-excitation-diag" 
                  checked={showModeExcitationDiag}
                  onCheckedChange={setShowModeExcitationDiag}
                />
                <Label htmlFor="mode-excitation-diag" className="text-xs text-[#3E4349]">
                  Show per-mode excitation diagnostic (dev only)
                </Label>
              </div>
            )}
            
            {/* Mode isolation selector (Part H - single mode test harness) */}
            {typeof globalThis !== 'undefined' && globalThis.__B44_BASS_DEBUG && (
              <div className="flex items-center gap-2">
                <Label htmlFor="mode-isolation" className="text-xs text-[#3E4349]">
                  Mode Isolation (debug):
                </Label>
                <select
                  id="mode-isolation"
                  value={modeIsolation}
                  onChange={(e) => setModeIsolation(e.target.value)}
                  className="text-xs border border-[#DCDBD6] rounded px-2 py-1 bg-white"
                >
                  <option value="off">Off (all modes)</option>
                  <option value="1,0,0">Axial (1,0,0) - Width</option>
                  <option value="2,0,0">Width even: Axial (2,0,0)</option>
                  <option value="0,1,0">Axial (0,1,0) - Length</option>
                  <option value="0,0,1">Axial (0,0,1) - Height</option>
                  <option value="1,0,0|0,1,0">Axial pair: (1,0,0) + (0,1,0)</option>
                  <option value="1,0,0|2,0,0">Axial pair: (1,0,0) + (2,0,0)</option>
                </select>
              </div>
            )}
            
            {/* Complex eigenfunctions toggle (Part H3 - REW parity phase) */}
            {typeof globalThis !== 'undefined' && globalThis.__B44_BASS_DEBUG && (
              <div className="flex items-center gap-2">
                <Checkbox 
                  id="complex-eigenfunctions" 
                  checked={complexEigenfunctions}
                  onCheckedChange={setComplexEigenfunctions}
                />
                <Label htmlFor="complex-eigenfunctions" className="text-xs font-semibold" style={{ color: complexEigenfunctions ? '#2563eb' : '#3E4349' }}>
                  Complex eigenfunctions (REW parity)
                </Label>
              </div>
            )}
            
            {/* SBIR single-reflection diagnostic (63 Hz null test) */}
            <div className="flex items-center gap-2">
              <Checkbox 
                id="sbir-debug-single-front-wall" 
                checked={sbirDebugSingleFrontWall}
                onCheckedChange={setSbirDebugSingleFrontWall}
              />
              <Label htmlFor="sbir-debug-single-front-wall" className="text-xs font-semibold" style={{ color: sbirDebugSingleFrontWall ? '#dc2626' : '#3E4349' }}>
                🔬 SBIR: Single front wall reflection only (63 Hz null test)
              </Label>
            </div>
            
            {/* Modal Probe toggle */}
            <div className="flex items-center gap-2">
              <Checkbox 
                id="modal-probe" 
                checked={modalProbeEnabled}
                onCheckedChange={setModalProbeEnabled}
              />
              <Label htmlFor="modal-probe" className="text-xs font-semibold" style={{ color: modalProbeEnabled ? '#dc2626' : '#3E4349' }}>
                🔬 Modal Probe (runtime dump)
              </Label>
            </div>
            
            {/* Debug: Disable sealed-room LF gain */}
            <div className="flex items-center gap-2">
              <Checkbox 
                id="debug-disable-sealed-gain" 
                checked={debugDisableSealedGain}
                onCheckedChange={setDebugDisableSealedGain}
              />
              <Label htmlFor="debug-disable-sealed-gain" className="text-xs font-semibold" style={{ color: debugDisableSealedGain ? '#dc2626' : '#3E4349' }}>
                🔬 Debug: Disable sealed-room LF gain
              </Label>
            </div>
            
            {/* Debug: Disable null repair/fill */}
            <div className="flex items-center gap-2">
              <Checkbox 
                id="debug-disable-null-repair" 
                checked={debugDisableNullRepair}
                onCheckedChange={setDebugDisableNullRepair}
              />
              <Label htmlFor="debug-disable-null-repair" className="text-xs font-semibold" style={{ color: debugDisableNullRepair ? '#dc2626' : '#3E4349' }}>
                🔬 Debug: Disable null repair/fill
              </Label>
            </div>
            
            {/* Coupling Phase Probe (Part HB - verify complex eigenfunctions) */}
            {typeof globalThis !== 'undefined' && globalThis.__B44_BASS_DEBUG && (
              <div className="space-y-2 mt-2 pt-2 border-t border-gray-300">
                <div className="font-semibold text-xs text-[#1B1A1A]">Coupling Phase Probe</div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="probe-mode" className="text-xs text-[#3E4349]">
                    Probe mode:
                  </Label>
                  <select
                    id="probe-mode"
                    value={couplingProbeMode}
                    onChange={(e) => setCouplingProbeMode(e.target.value)}
                    className="text-xs border border-[#DCDBD6] rounded px-2 py-1 bg-white"
                  >
                    <option value="auto">Auto (first isolated mode)</option>
                    <option value="1,0,0">(1,0,0)</option>
                    <option value="2,0,0">(2,0,0)</option>
                    <option value="0,1,0">(0,1,0)</option>
                    <option value="0,0,1">(0,0,1)</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox 
                    id="probe-use-complex" 
                    checked={couplingProbeUseComplex}
                    onCheckedChange={setCouplingProbeUseComplex}
                  />
                  <Label htmlFor="probe-use-complex" className="text-xs text-[#3E4349]">
                    Use Complex eigenfunctions
                  </Label>
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* RAW mode active banner */}
        {rewStyleMode && modalOnlyDebugView && (
          <div className="text-xs mb-2 bg-red-50 p-2 rounded border border-red-400">
            <div className="font-semibold mb-1 text-red-700">🔴 RAW MODE ACTIVE</div>
            <div className="text-[10px] space-y-0.5">
              <div>• No Schroeder blending</div>
              <div>• No mode density compensation</div>
              <div>• No sealed room boost</div>
              <div>• No smoothing (even if UI slider is set)</div>
              <div>• No calibration offsets</div>
              <div>• No normalization</div>
              <div className="mt-1 pt-1 border-t border-red-300 font-semibold">
                This is the PURE physics output. If nulls don't move when sub moves, the modal coupling is broken.
              </div>
            </div>
          </div>
        )}



        {/* SBIR debug info */}
        {rewStyleMode && !modalOnlyDebugView && (() => {
          if (!activeDebug?.sbirEnabled) return null;

          const probe40 = activeDebug?.sbirDebugProbe40Hz;
          const probe63 = (activeDebug && activeDebug.sbirDebugProbe63Hz) ? activeDebug.sbirDebugProbe63Hz : null;

          return (
            <div className="text-xs text-[#3E4349] mb-2 bg-blue-50 p-2 rounded border border-blue-300">
              <div className="font-semibold mb-1 text-blue-700">
                SBIR: {activeDebug.sbirEnabled ? 'ON' : 'OFF'}, order={activeDebug.sbirMaxOrder || 2}
                {sbirDebugSingleFrontWall && <span className="ml-2 text-red-600 font-bold">— DIAGNOSTIC: FRONT WALL ONLY</span>}
              </div>
              {probe40 && (
                <>
                  <div className="text-[9px] font-mono">
                    Paths used: {probe40.pathsUsed || 'N/A'}
                  </div>
                  {probe40.strongestReflection && (
                    <div className="text-[9px] font-mono">
                      Strongest reflection at 40 Hz: {probe40.strongestReflection.surface} ({probe40.strongestReflection.magDb.toFixed(1)} dB)
                    </div>
                  )}
                  <div className="text-[9px] font-mono mt-1 pt-1 border-t border-blue-200 space-y-0.5">
                    <div>Direct only: {probe40.directOnlyDb.toFixed(1)} dB</div>
                    <div>SBIR total: {probe40.sbirTotalDb.toFixed(1)} dB</div>
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
          const movementProbe = activeDebug?.lfMovementProbe;
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
          const modeContribs = activeDebug?.modeContributions;
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
                            {mode.type} ({mode.n[0]},{mode.n[1]},{mode.n[2]}): {mode.magDb.toFixed(1)} dB @ {mode.phaseDeg.toFixed(0)}°
                          </div>
                          <div className="pl-2 text-[8px] opacity-80 space-y-0.5 mt-0.5">
                            <div>src: X={srcEigenX.toFixed(4)} Y={srcEigenY.toFixed(4)} Z={srcEigenZ.toFixed(4)}</div>
                            <div>rcv: X={rcvEigenX.toFixed(4)} Y={rcvEigenY.toFixed(4)} Z={rcvEigenZ.toFixed(4)}</div>
                            <div>coupling (real) = {computedCoupling.toFixed(4)} (engine: {mode.coupling?.toFixed(4) || 'N/A'})</div>
                            {mode.couplingInfo?.amp !== undefined && (
                              <div className="text-green-600 font-semibold">
                                amplitude (cosine): {mode.couplingInfo.amp.toFixed(4)}
                              </div>
                            )}
                            {mode.couplingInfo?.phaseDeg !== undefined && (
                              <div className="text-purple-600 font-semibold">
                                phase: {mode.couplingInfo.phaseDeg.toFixed(1)}°
                              </div>
                            )}
                            {mode.couplingInfo?.complexMag !== undefined && (
                              <div className="text-blue-600 font-semibold">
                                coupling (complex): mag={mode.couplingInfo.complexMag.toFixed(4)} @ {mode.couplingInfo.complexPhase.toFixed(1)}°
                              </div>
                            )}
                            {mode.couplingInfo?.complexRe !== undefined && (
                              <div className="text-blue-600">
                                (re={mode.couplingInfo.complexRe.toFixed(4)}, im={mode.couplingInfo.complexIm.toFixed(4)})
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
              {activeDebug?.phaseCheckAvailable && (
                <div className="text-[9px] mt-1 pt-1 border-t border-purple-200">
                  Phase check at 34 Hz available in console: <code>globalThis.__B44_PHASE_CHECK</code>
                </div>
              )}
            </div>
          );
        })()}

        {/* Coupling Phase Probe (Part HB - verify complex eigenfunctions) */}
        {rewStyleMode && typeof globalThis !== 'undefined' && globalThis.__B44_BASS_DEBUG && (() => {
          const modeList = activeDebug?.modeListFirst60;
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
                  Probing mode: ({nx},{ny},{nz}) @ {fHz.toFixed(1)} Hz
                  {probeModeDef.axisLabel && ` [${probeModeDef.axisLabel}]`}
                </div>
                <div className="text-[9px] opacity-70">
                  Mode: {couplingProbeUseComplex ? 'COMPLEX' : 'REAL'} eigenfunctions
                </div>
                <div className="mt-2 space-y-2 font-mono text-[8px]">
                  {probeResults.map((result, i) => (
                    <div key={i} className="border-t border-cyan-200 pt-1 first:border-t-0 first:pt-0">
                      <div className="font-semibold">{result.freq.toFixed(1)} Hz:</div>
                      <div className="pl-2 space-y-0.5">
                        {couplingProbeUseComplex ? (
                          <>
                            <div className="text-green-600">amp (cosine): {result.amp.toFixed(4)}</div>
                            <div className="text-purple-600">phi: {result.phi.toFixed(1)}°</div>
                            <div>src cosines: X={result.src.cosX.toFixed(4)} Y={result.src.cosY.toFixed(4)} Z={result.src.cosZ.toFixed(4)} → amp={result.src.amp.toFixed(4)}</div>
                            <div>rcv cosines: X={result.rcv.cosX.toFixed(4)} Y={result.rcv.cosY.toFixed(4)} Z={result.rcv.cosZ.toFixed(4)} → amp={result.rcv.amp.toFixed(4)}</div>
                          </>
                        ) : (
                          <>
                            <div>srcEigen: {result.src.re.toFixed(4)} | {result.src.phase.toFixed(1)}°</div>
                            <div>rcvEigen: {result.rcv.re.toFixed(4)} | {result.rcv.phase.toFixed(1)}°</div>
                          </>
                        )}
                        <div className="font-semibold text-cyan-800">
                          coupling: (Re={result.coupling.re.toFixed(4)}, Im={result.coupling.im.toFixed(4)}) | mag={result.coupling.mag.toFixed(4)} @ {result.coupling.phase.toFixed(1)}°
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
          const modeList = activeDebug?.modeListFirst60;
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
                        {mode.fHz.toFixed(1)} Hz {mode.type} ({mode.n[0]},{mode.n[1]},{mode.n[2]})
                        {mode.axisLabel && ` [${mode.axisLabel}]`}
                      </span>
                      : {mode.excitationDb.toFixed(1)} dB
                      {mode.deltaDb !== 0 && (
                        <span className={mode.changed ? 'text-red-700 font-semibold' : ''}>
                          {' '}({mode.deltaDb >= 0 ? '+' : ''}{mode.deltaDb.toFixed(1)} dB)
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
          const modeList = activeDebug?.modeListFirst60;
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
                <strong>Modes:</strong> {activeDebug.modeCount || 0} total
              </div>
              <div className="text-[9px] font-mono space-y-0.5 max-h-32 overflow-y-auto">
                {first30.map((mode, i) => (
                  <div key={i} className={mode.type === 'axial' ? 'font-semibold' : 'opacity-70'}>
                    {mode.fHz.toFixed(1)} Hz: {mode.type} ({mode.nx},{mode.ny},{mode.nz})
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
          const lowestAxial = activeDebug?.lowestAxialHz || 0;
          
          // --- Degenerate lowest-axial detection (square-room friendly) ---
          const LOWEST_AXIAL_EPS_HZ = 0.25; // tolerance for "same" frequency in degenerate rooms
          
          const modes = activeDebug?.modeListFirst60 || [];
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
          
          const engineFreqs = activeDebug?.freqs || rewModesDataAbs?.freqs || [];
          
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
              schroeder: activeDebug?.splDbSchroeder?.[binI],
              repaired: activeDebug?.splDbRepaired?.[binI],
              plotted: plotIdx >= 0 ? displayData[plotIdx]?.spl : null
            };
          }).filter(Boolean);
          
          if (probeData.length === 0) return null;
          
          return (
            <div className="text-xs mb-2 bg-orange-50 p-2 rounded border border-orange-400">
              <div className="font-semibold mb-1 text-orange-700">🔬 LF Lock Diagnostic</div>
              <div className="text-[10px] font-mono space-y-0.5">
                <div><strong>Lowest axial:</strong> {Number.isFinite(lowestAxial) ? lowestAxial.toFixed(1) : 'N/A'} Hz (pivot point)</div>
                <div style={{ marginTop: 6 }}>
                  <strong>Degenerate lowest-axial modes (±{LOWEST_AXIAL_EPS_HZ.toFixed(2)} Hz):</strong>{" "}
                  {lowestAxialModes.length
                    ? lowestAxialModes
                        .map((m) => `${m.fHz.toFixed(1)}Hz axial (${m.nx},${m.ny},${m.nz})${m.axisLabel ? ` [${m.axisLabel}]` : ''}`)
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
                    {p.freq} Hz (bin {p.binI} @ {Number.isFinite(p.actualFreqHz) ? p.actualFreqHz.toFixed(2) : 'null'}):
                    engine={Number.isFinite(p.engineFinal) ? p.engineFinal.toFixed(1) : 'null'},
                    schroeder={Number.isFinite(p.schroeder) ? p.schroeder.toFixed(1) : 'null'},
                    repaired={Number.isFinite(p.repaired) ? p.repaired.toFixed(1) : 'null'},
                    plot={Number.isFinite(p.plotted) ? p.plotted.toFixed(1) : 'null'}
                    {p.freq < lowestAxial && ' (below axial)'}
                  </div>
                ))}
                <div className="mt-1 pt-1 border-t border-orange-300 text-red-700 font-semibold text-[9px]">
                  Expected: If LF is NOT locked, values below {lowestAxial.toFixed(0)} Hz must change when sub moves.
                </div>
              </div>
            </div>
          );
        })()}

        {/* REW debug banner (only when REW is ON) */}
        {rewStyleMode && (rewModesData?.debug?.error || rewModesData?.debug?.flatNote) && (
          <div className="text-xs text-[#3E4349] mb-2 bg-[#F8F8F7] p-2 rounded border border-[#C1B6AD]">
            <div className="font-semibold mb-1">REW status</div>
            {rewModesData?.debug?.error && (
              <div className="text-[11px] font-mono opacity-80">Error: {rewModesData.debug.error}</div>
            )}
            {rewModesData?.debug?.flatNote && (
              <div className="text-[11px] font-mono opacity-80">
                {rewModesData.debug.flatNote.warning} (range {Number(rewModesData.debug.flatNote.rangeDb).toFixed(2)} dB)
              </div>
            )}
            {rewModesData?.debug?.message && (
              <div className="text-[11px] font-mono opacity-80">Message: {rewModesData.debug.message}</div>
            )}
            {rewModesData?.debug?.stack && (
              <div className="text-[11px] font-mono opacity-80 text-red-600">
                Stack: {rewModesData.debug.stack.split('\n')[0]}
              </div>
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
                  const topModesStr = topModes.map(m => 
                    `(${m.nx},${m.ny},${m.nz})@${m.f0Hz.toFixed(0)}Hz:cpl=${m.coupling.toFixed(3)},res=${m.resonMagDb.toFixed(1)}dB`
                  ).join(', ');
                  
                  const modesCount = row.modesPassedBandwidth ?? 0;
                  const totalModes = row.totalModesAvailable ?? 0;
                  
                  return (
                    <div key={i} className="border-t border-red-200 pt-1 first:border-t-0 first:pt-0">
                      <div className="font-semibold text-red-800">
                        {row.frequencyHz.toFixed(1)} Hz (sub {row.subId}) — {modesCount} modes within 3×BW (of {totalModes} total)
                      </div>
                      <div className="grid grid-cols-5 gap-2 pl-2 text-[9px]">
                       <div>pre: {row.pre.db.toFixed(1)} dB</div>
                       <div className="text-purple-600">sum: {row.modeSum.db.toFixed(1)} dB</div>
                       <div className="font-bold text-blue-600">H: {row.H.db.toFixed(1)} dB</div>
                       <div>post: {row.post.db.toFixed(1)} dB</div>
                       <div>Δ: {(row.post.db - row.pre.db).toFixed(1)} dB</div>
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
          const lowestAxial = activeDebug?.lowestAxialHz || 0;
          const modeListFirst60 = activeDebug?.modeListFirst60 || [];
          
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
              srcCoupling: srcCoupling.toFixed(4),
              rcvCoupling: rcvCoupling.toFixed(4),
              totalCoupling: totalCoupling.toFixed(4)
            };
          }).filter(Boolean);
          
          if (couplingData.length === 0) return null;
          
          return (
            <div className="text-xs text-[#3E4349] mb-2 bg-cyan-50 p-2 rounded border border-cyan-300">
              <div className="font-semibold mb-1 text-cyan-700">Coupling Trace (Key Modes)</div>
              <div className="text-[9px] font-mono space-y-1">
                {couplingData.map((data, i) => (
                  <div key={i} className="border-t border-cyan-200 pt-1 first:border-t-0 first:pt-0">
                    <div className="font-semibold">{data.label} @ {data.fHz} Hz:</div>
                    <div className="pl-2">src={data.srcCoupling}, rcv={data.rcvCoupling}, total={data.totalCoupling}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* REW mode info (only when REW is ON and no error) */}
        {rewStyleMode && !activeDebug?.error && (() => {
          // Format Schroeder frequency with off-scale indicator
          const schroederHz = activeDebug?.schroederHz || schroederFrequency;
          const schroederDisplay = schroederHz > 0
            ? (schroederHz > 200 ? `${schroederHz.toFixed(1)} Hz (off-scale)` : `${schroederHz.toFixed(1)} Hz`)
            : 'N/A';
          
          // Frequency grid diagnostics
          const gridPointCount = activeDebug?.freqGridPointCount || 0;
          const gridMin = activeDebug?.freqGridMin;
          const gridMax = activeDebug?.freqGridMax;
          
          // Check for duplicate frequencies in plotted series
          const freqs = plottedSeries.map(p => p.frequency).filter(f => Number.isFinite(f));
          const uniqueFreqs = new Set(freqs);
          const duplicateCount = freqs.length - uniqueFreqs.size;
          
          // Check if strictly increasing
          const isStrictlyIncreasing = freqs.every((f, i) => i === 0 || f > freqs[i - 1]);
          
          return (
            <div className="text-xs text-[#3E4349] mb-2 bg-[#F8F8F7] p-2 rounded border border-[#DCDBD6]">
              <div className="font-semibold mb-1">
                {rewView === 'roomPlusProduct' ? 'Room + Product' : 'Room-only (generic sub)'}
              </div>
              <div className="text-[11px] space-y-1">
                <div>• Complex modal summation with spatial coupling</div>
                <div>• {activeDebug?.qMappingText || 'Q-based damping'}</div>
                <div>• Schroeder: <strong>{schroederDisplay}</strong></div>
                <div>• {rewRelativeView ? 'Relative (normalized to 0 dB @ 30–80 Hz)' : 'Absolute SPL'} scale</div>
                {rewView === 'roomPlusProduct' && (
                  <div>• Product curves: {(activeDebug?.productModels || []).join(', ') || 'None'}</div>
                )}
              </div>
              
              {/* Frequency grid diagnostics */}
              <div className="mt-2 pt-2 border-t border-[#DCDBD6] space-y-0.5 text-[10px] font-mono">
                <div className="font-semibold text-blue-700">Frequency Grid Stats:</div>
                <div className={gridPointCount >= 2000 ? 'text-green-600' : gridPointCount >= 1000 ? 'text-yellow-600' : 'text-red-600'}>
                  Point count: {gridPointCount} {gridPointCount >= 2000 ? '✓ (dense)' : gridPointCount >= 1000 ? '⚠ (moderate)' : '✗ (sparse)'}
                </div>
                <div>
                  Range: {Number.isFinite(gridMin) ? gridMin.toFixed(2) : 'N/A'} - {Number.isFinite(gridMax) ? gridMax.toFixed(2) : 'N/A'} Hz
                </div>
                <div className="text-blue-600">
                  Grid type: Dense log-spaced (continuous evaluation)
                </div>
                <div className={duplicateCount === 0 ? 'text-green-600' : 'text-red-600'}>
                  Duplicate X: {duplicateCount} {duplicateCount === 0 ? '✓ PASS' : '✗ FAIL'}
                </div>
                <div className={isStrictlyIncreasing ? 'text-green-600' : 'text-red-600'}>
                  Strictly increasing: {isStrictlyIncreasing ? '✓ PASS' : '✗ FAIL'}
                </div>
                {(() => {
                  // Compute spacing stats
                  const deltas = freqs.slice(1).map((f, i) => f - freqs[i]);
                  if (deltas.length === 0) return null;
                  
                  const minDelta = Math.min(...deltas);
                  const maxDelta = Math.max(...deltas);
                  
                  // Find where largest spacing occurs
                  let maxDeltaIdx = 0;
                  for (let i = 0; i < deltas.length; i++) {
                    if (deltas[i] === maxDelta) {
                      maxDeltaIdx = i;
                      break;
                    }
                  }
                  const maxDeltaRegion = maxDeltaIdx < freqs.length 
                    ? `${freqs[maxDeltaIdx].toFixed(1)}–${freqs[maxDeltaIdx + 1].toFixed(1)} Hz`
                    : 'N/A';
                  
                  return (
                    <>
                      <div className={maxDelta < 0.1 ? 'text-green-600' : 'text-yellow-600'}>
                        Min Δf: {minDelta.toFixed(6)} Hz
                      </div>
                      <div className={maxDelta < 0.5 ? 'text-green-600' : 'text-yellow-600'}>
                        Max Δf: {maxDelta.toFixed(6)} Hz
                      </div>
                      <div className="text-gray-600">
                        Largest spacing region: {maxDeltaRegion}
                      </div>
                    </>
                  );
                })()}
              </div>
              
              {/* Acceptance Tests Display */}
              {activeDebug?.acceptanceTests && (
                <div className="mt-2 pt-2 border-t border-[#C1B6AD] space-y-0.5 text-[10px] font-mono bg-green-50 p-2 rounded">
                  <div className="font-semibold text-green-700 mb-1">REW Parity Acceptance Tests:</div>
                  <div>1. Hover sweep test: {activeDebug.acceptanceTests.hoverSweepTest}</div>
                  <div>2. No duplicate X test: {activeDebug.acceptanceTests.duplicateXTest}</div>
                  <div>3. Stair/step test: {activeDebug.acceptanceTests.stairStepTest}</div>
                  <div className="text-[9px] opacity-70 mt-1">
                    Point count: {activeDebug.acceptanceTests.pointCount} | 
                    Min Δf: {activeDebug.acceptanceTests.minDeltaF} Hz
                  </div>
                </div>
              )}
              <div className="mt-2 pt-2 border-t border-[#DCDBD6] space-y-0.5">
                <div className="text-[10px] font-mono opacity-80 font-semibold text-blue-700">
                  REW Inputs (Live Tracking):
                </div>
                <div className="text-[10px] font-mono opacity-80">
                  <strong>Engine calls:</strong> {engineCallsUi}
                </div>
                <div className="text-[10px] font-mono opacity-80 break-all">
                  <strong>Sources:</strong> {(subsForSimulation || []).map(s => `${s.id}:${s.x.toFixed(3)},${s.y.toFixed(3)},${(s.z ?? 0).toFixed(3)}`).join(" | ")}
                </div>
                <div className="text-[10px] font-mono opacity-80">
                  <strong>Sources used:</strong> {activeDebug?.sourceCountUsed || 0}
                </div>
                {activeDebug?.sourcePositionsUsed && activeDebug.sourcePositionsUsed.length > 0 && (
                  <div className="text-[10px] font-mono opacity-80">
                    <strong>Positions:</strong> {activeDebug.sourcePositionsUsed.map((p, i) => 
                      `[${p.x},${p.y},${p.z}]`
                    ).join(' ')}
                  </div>
                )}
                <div className="text-[9px] font-mono opacity-70 break-all">
                  <strong>SourceSig:</strong> {activeDebug?.sourceSigUsed || 'N/A'}
                </div>
                <div className="text-[9px] font-mono opacity-70">
                  <strong>SeatSig:</strong> {activeDebug?.seatSigUsed || 'N/A'}
                </div>
                <div className="text-[10px] font-mono opacity-80">
                  <strong>Lowest axial:</strong> {Number.isFinite(activeDebug?.lowestAxialHz) ? activeDebug.lowestAxialHz.toFixed(1) : '—'} Hz
                </div>
                {activeDebug?.modeCouplingSanity && (
                  <div className="text-[10px] font-mono opacity-80 bg-yellow-100 px-1 rounded">
                    <strong>ModeCoupling (1,0,0):</strong> seat={fmtFixed(activeDebug.modeCouplingSanity.seatShape_100, 3)} src={fmtFixed(activeDebug.modeCouplingSanity.srcShape_100, 3)} cpl={fmtFixed(activeDebug.modeCouplingSanity.coupling_100, 3)}
                  </div>
                )}
                {activeDebug?.lfProbe?.lfSanityCheck && (
                  <div className={`text-[10px] font-mono opacity-80 ${activeDebug.lfProbe.lfSanityCheck.startsWith('FAIL') ? 'text-red-600 font-bold' : 'text-green-600'}`}>
                    <strong>LF Sanity:</strong> {activeDebug.lfProbe.lfSanityCheck}
                  </div>
                )}
                {(() => {
                  const seat = seatingPositions?.find(s => s.isPrimary) || seatingPositions?.[0];
                  if (!seat) return null;
                  let seatUsed = { x: seat.x, y: seat.y, z: seat.z ?? 1.2 };
                  if (typeof globalThis !== 'undefined' && globalThis.__B44_BASS_DEBUG && seatNudgeTest) {
                    seatUsed = { ...seatUsed, x: seatUsed.x - 0.30 };
                  }
                  return (
                    <div className="text-[10px] font-mono opacity-80">
                      <strong>Seat used (engine):</strong> {seatUsed.x.toFixed(2)}, {seatUsed.y.toFixed(2)}, {seatUsed.z.toFixed(2)}
                    </div>
                  );
                })()}
                {typeof globalThis !== 'undefined' && globalThis.__B44_BASS_DEBUG && (
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-[#DCDBD6]">
                    <Checkbox 
                      id="seat-nudge-test" 
                      checked={seatNudgeTest}
                      onCheckedChange={setSeatNudgeTest}
                    />
                    <Label htmlFor="seat-nudge-test" className="text-[10px] text-[#3E4349]">
                      Seat nudge (test) [-0.30m X]
                    </Label>
                  </div>
                )}
              </div>
              {activeDebug ? (
                <div className="mt-2 pt-2 border-t border-[#DCDBD6] space-y-0.5">
                  <div className="text-[10px] font-mono opacity-80">
                    <strong>Modes:</strong> {activeDebug.modeCount} total 
                    ({activeDebug.axialCount} axial, {activeDebug.tangentialCount} tangential, {activeDebug.obliqueCount} oblique)
                  </div>
                  <div className="text-[10px] font-mono opacity-80">
                    <strong>View:</strong> {activeDebug.viewMode || rewView}
                  </div>
                  <div className="text-[10px] font-mono opacity-80">
                    <strong>SPL Range:</strong> {activeDebug.splMinDb} to {activeDebug.splMaxDb} dB (range: {activeDebug.splRangeDb} dB)
                  </div>
                  {activeDebug.rawEngineOutputMode && (
                    <div className="text-[10px] font-mono opacity-80 text-red-600 font-semibold">
                      <strong>RAW MODE:</strong> Unanchored, free-running SPL (no calibration)
                    </div>
                  )}
                  {!activeDebug.rawEngineOutputMode && (
                    <div className="text-[10px] font-mono opacity-80">
                      <strong>Calibration:</strong> {activeDebug.calibrationMode || 'N/A'}
                    </div>
                  )}
                  {!activeDebug.rawEngineOutputMode && activeDebug.calOffsetAppliedDb && (
                    <div className="text-[10px] font-mono opacity-80">
                      <strong>Calibration Offset:</strong> {activeDebug.calOffsetAppliedDb} dB
                    </div>
                  )}
                  <div className="text-[10px] font-mono opacity-80">
                    <strong>UI smoothing selected:</strong> {rewSmoothing}
                  </div>
                  <div className="text-[10px] font-mono opacity-80">
                    <strong>Graph smoothing (effective):</strong> {graphSmoothing}
                  </div>
                  <div className="text-[10px] font-mono opacity-80">
                    <strong>Engine smoothing applied:</strong> {activeDebug.smoothingApplied || 'none'}
                  </div>
                  <div className="text-[10px] font-mono opacity-80">
                    <strong>Absolute SPL:</strong> {activeDebug.absoluteSplMode ? 'true' : 'false'}
                  </div>
                  <div className="text-[10px] font-mono opacity-80">
                    <strong>Normalize band:</strong> {activeDebug.normalizeBandHz ? JSON.stringify(activeDebug.normalizeBandHz) : 'none'}
                  </div>
                  <div className="text-[10px] font-mono opacity-80">
                    <strong>Product curves:</strong> {activeDebug.productCurvesApplied ? 'applied' : 'none'}
                  </div>
                  {/* Part C2: Mode density compensation status */}
                  <div className="text-[10px] font-mono opacity-80">
                    <strong>Mode density comp:</strong> {activeDebug.modeDensityCompActive ? 'ON' : 'OFF'}
                    {activeDebug.blendStartHz && activeDebug.blendStartHz !== 'N/A' && (
                      <span> (above {activeDebug.blendStartHz} Hz)</span>
                    )}
                  </div>
                  {/* Schroeder blend status */}
                  {activeDebug.blendStartHz && activeDebug.blendStartHz !== 'N/A' && (
                    <div className="text-[10px] font-mono opacity-80">
                      <strong>Schroeder blend:</strong> {activeDebug.blendStartHz} Hz → {activeDebug.blendEndHz} Hz (null-preserving)
                    </div>
                  )}
                  {activeDebug?.lfProbe?.measurements && (
                    <div className="text-[10px] font-mono opacity-80 text-purple-700 mt-1 pt-1 border-t border-purple-200">
                      <strong>LF Probe (Hz → SPL + Pressure Gain):</strong><br/>
                      {activeDebug.lfProbe.measurements.map((m, i) => (
                        <div key={i}>
                          {m.freq} Hz: {m.finalDbAfterCal || m.rawDbBeforeCal || 'N/A'} dB
                          {m.pressureGainDb && Number(m.pressureGainDb) > 0 && (
                            <span className="text-orange-600"> (+{m.pressureGainDb} dB pressure)</span>
                          )}
                          {m.belowLowestAxial && <span className="text-red-600"> (below axial)</span>}
                        </div>
                      ))}
                      {activeDebug.lfProbe.pressureGainSettings && (
                        <div className="text-[9px] opacity-70 mt-1">
                          Pressure: {activeDebug.lfProbe.pressureGainSettings.enabled ? 'ON' : 'OFF'} 
                          (k={activeDebug.lfProbe.pressureGainSettings.kDbPerOct} dB/oct, 
                          max={activeDebug.lfProbe.pressureGainSettings.maxGainDb} dB)
                        </div>
                      )}
                    </div>
                  )}
                  {activeDebug.lfDebug15_45Hz && (
                    <div className="text-[10px] font-mono opacity-80 text-green-700 mt-1 pt-1 border-t border-green-200">
                      <strong>LF Debug (15-45 Hz):</strong><br/>
                      Direct: {activeDebug.lfDebug15_45Hz.directMagDb} dB<br/>
                      Modal: {activeDebug.lfDebug15_45Hz.modalMagDb} dB<br/>
                      Blended: {activeDebug.lfDebug15_45Hz.blendedMagDb} dB<br/>
                      <span className="text-[9px] opacity-70">{activeDebug.lfDebug15_45Hz.note}</span>
                    </div>
                  )}
                  {activeDebug.productCurveStats && activeDebug.productCurveStats.length > 0 && (
                    <div className="text-[10px] font-mono opacity-80 text-blue-700">
                      <strong>Product curve stats:</strong><br/>
                      {activeDebug.productCurveStats.map((stat, i) => (
                        <div key={i}>
                          Sub {stat.subIndex}: min={stat.productMinDb} dB, max={stat.productMaxDb} dB, @50Hz={stat.productAt50HzDb} dB
                        </div>
                      ))}
                    </div>
                  )}
                {activeDebug?.scaleWarning && (
                  <div className="text-[10px] font-mono opacity-80 text-yellow-700">
                    <strong>Warning:</strong> {activeDebug.scaleWarning}
                  </div>
                )}
                {activeDebug?.productNote && (
                  <div className="text-[10px] font-mono opacity-80 text-yellow-700">
                    <strong>Note:</strong> {activeDebug.productNote}
                  </div>
                )}
                
                {/* LF Replace Detection and Sub Movement Test */}
                <div className="text-[10px] font-mono opacity-80 mt-1 pt-1 border-t border-[#DCDBD6]">
                  <div><strong>lowestAxialHz:</strong> {Number.isFinite(activeDebug?.lowestAxialHz) ? activeDebug.lowestAxialHz.toFixed(2) : 'N/A'} Hz</div>
                  <div><strong>LF replace active:</strong> {activeDebug?.lfPressureRiseApplied === 'YES (6 dB/oct, max +12 dB)' ? 'NO (gain term only)' : 'NO'}</div>
                  {(() => {
                    // Compute sub movement delta below lowestAxialHz
                    const lowestAxial = activeDebug?.lowestAxialHz;
                    if (!Number.isFinite(lowestAxial) || !activeDebug?.acceptanceTests) {
                      return <div><strong>Below lowestAxialHz Δ:</strong> N/A (no axial modes)</div>;
                    }
                    
                    // For now, show placeholder until user actually moves sub
                    // This would require tracking previous run data
                    return <div><strong>Below lowestAxialHz sensitivity:</strong> LIVE (not replaced)</div>;
                  })()}
                </div>
                {(() => {
                  // Debug: inspect first sub's product curve
                  const firstSubModel = subsForSimulation[0]?.modelKey;
                  if (!firstSubModel) return null;

                  const freqs = [];
                  for (let f = 15; f <= 200; f += 0.5) freqs.push(f);

                  const curveDb = getSubAnechoicResponseDb(firstSubModel, freqs);
                  if (!curveDb || curveDb.length === 0) return null;

                  const finite = curveDb.filter(v => Number.isFinite(v));
                  if (finite.length === 0) return null;

                  const minDb = Math.min(...finite);
                  const maxDb = Math.max(...finite);
                  const idx50 = freqs.findIndex(f => f >= 50);
                  const valueAt50Hz = idx50 >= 0 ? curveDb[idx50] : null;

                  const looksAbsolute = (minDb >= 70 && maxDb <= 140);
                  const label = looksAbsolute ? "curve looks like ABSOLUTE SPL" : "curve looks like RELATIVE GAIN";

                  return (
                    <div className="text-[10px] font-mono opacity-80 text-blue-700 mt-1 pt-1 border-t border-blue-200">
                      <strong>Product Curve Debug ({firstSubModel}):</strong><br/>
                      min={minDb.toFixed(1)} dB, max={maxDb.toFixed(1)} dB, @50Hz={valueAt50Hz?.toFixed(1) || 'N/A'} dB<br/>
                      → {label}
                    </div>
                  );
                })()}
              </div>
              ) : null}
            </div>
          );
        })()}

        {/* REW advanced controls (visible only when REW is ON) */}
        {rewStyleMode && (
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

            {/* Component view selector (debug lens only - does NOT change calibration) */}
            <div className="flex items-center gap-3">
              <div className="text-xs text-[#3E4349]">Component (debug):</div>
              <Button
                variant={componentView === 'modalOnly' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setComponentView('modalOnly')}
                className="text-xs"
              >
                Modal only
              </Button>
              <Button
                variant={componentView === 'sbirOnly' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setComponentView('sbirOnly')}
                className="text-xs"
              >
                SBIR only
              </Button>
              <Button
                variant={componentView === 'modalPlusSbir' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setComponentView('modalPlusSbir')}
                className="text-xs"
              >
                Total (REW)
              </Button>
            </div>

            {/* REW-style time alignment toggle */}
            <div className="flex items-center gap-2 mt-2">
              <Checkbox 
                id="rew-time-align" 
                checked={rewTimeAlign}
                onCheckedChange={setRewTimeAlign}
              />
              <Label htmlFor="rew-time-align" className="text-xs text-[#3E4349]">
                Time align subs (MLP) — REW-style
              </Label>
            </div>

            {/* Live state readout (audit) */}
            <div className="text-[9px] font-mono bg-yellow-50 p-1 rounded border border-yellow-300 mt-2">
              <strong>Live State:</strong> componentView={componentView} | rewView={rewView} | engineCalls={engineCallCountRef.current} | dataset={rewView === 'roomPlusProduct' ? 'Room+Product' : 'Room-only'} | timeAlign={rewTimeAlign ? 'ON' : 'OFF'} | smoothingSelected={rewSmoothing} | smoothingPassedToEngine={graphSmoothing}
            </div>
          </div>
        )}

        {/* REW mode lines toggles (only when REW is ON) */}
        {rewStyleMode && (
          <div className="flex items-center gap-4 mb-2">
            <div className="flex items-center gap-2">
              <Checkbox 
                id="show-mode-lines" 
                checked={showRewModeLines}
                onCheckedChange={setShowRewModeLines}
              />
              <Label htmlFor="show-mode-lines" className="text-xs text-[#3E4349]">
                Show mode lines (REW)
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox 
                id="linear-hz-axis" 
                checked={linearHzAxis}
                onCheckedChange={(v) => setLinearHzAxis(!!v)}
              />
              <Label htmlFor="linear-hz-axis" className="text-xs text-[#3E4349]">
                Linear Hz axis (debug)
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox 
                id="rew-relative-view" 
                checked={rewRelativeView}
                onCheckedChange={setRewRelativeView}
              />
              <Label htmlFor="rew-relative-view" className="text-xs text-[#3E4349]">
                Relative view (normalise 30–80 Hz)
              </Label>
            </div>
            
            {/* REW Display Reference Level (only when absolute mode) */}
            {!rewRelativeView && (
              <div className="flex items-center gap-2">
                <Label className="text-xs text-[#3E4349] whitespace-nowrap">
                  Display ref:
                </Label>
                <div className="flex gap-1">
                  {[85, 90, 95, 100].map(val => (
                    <Button
                      key={val}
                      variant={rewDisplayRefDb === val ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setRewDisplayRefDb(val)}
                      className="text-xs h-6 px-2"
                    >
                      {val} dB
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Clamp feedback (REW mode only) */}
        {rewStyleMode && yAxisLocked && (clampedToMin + clampedToMax) > 0 && (
          <div style={{ marginTop: 6, marginBottom: 8, fontSize: 12, color: "#8a2b2b", background: "#fff3cd", padding: "6px 10px", borderRadius: 6, border: "1px solid #ffc107" }}>
            ⚠️ Clamped: {clampedToMin} to min, {clampedToMax} to max. Curve rides window edge (REW-style). Unlock Y-axis to view full range.
          </div>
        )}

        {/* Parity Audit Readout (raw coherent vs final plotted) */}
        {rewStyleMode && activeDebug?.parityAudits?.modalPlusSbir && (() => {
          const audit = activeDebug.parityAudits.modalPlusSbir;
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
                            <div>Peak: {peak.spl.toFixed(2)} dB @ {peak.frequency.toFixed(1)} Hz</div>
                            <div>Dip:  {dip.spl.toFixed(2)} dB @ {dip.frequency.toFixed(1)} Hz</div>
                            <div className="font-bold">Delta: {delta.toFixed(2)} dB</div>
                            {offsetFromPeak !== null && (
                              <div className="text-[9px] text-blue-600 mt-1 pt-1 border-t border-teal-300">
                                Display offset: {offsetFromPeak >= 0 ? '+' : ''}{offsetFromPeak.toFixed(2)} dB
                                <div className="text-[8px] opacity-70">(expected: {(allowDisplayRefOffset ? (Number(rewDisplayRefDb) || 0) : 0) >= 0 ? '+' : ''}{(allowDisplayRefOffset ? (Number(rewDisplayRefDb) || 0) : 0).toFixed(2)} dB, mode: {isRelative ? 'RELATIVE' : 'ABSOLUTE'})</div>
                                {offsetIsConstant && <div className="text-green-600">✓ Constant (reference shift only)</div>}
                                {isRelative && Math.abs(offsetFromPeak) > 1 && (
                                  <div className="text-red-600 font-bold">⚠️ RELATIVE mode should have ~0 dB offset (found {offsetFromPeak.toFixed(2)} dB)</div>
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
                          <div>Peak: {peak.spl.toFixed(2)} dB @ {peak.frequency.toFixed(1)} Hz</div>
                          <div>Dip:  {dip.spl.toFixed(2)} dB @ {dip.frequency.toFixed(1)} Hz</div>
                          <div>Delta: {delta.toFixed(2)} dB</div>
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

        {/* Mode isolation plot source debug (Part C2 - prove isolation drives plot) */}
        {rewStyleMode && (() => {
          const isolationActive = modeIsolation !== 'off';
          const modeCountUsed = activeDebug?.modalModeCountUsed || activeDebug?.modeCount || 0;

          // Determine exact data array being plotted
          const plotDataSource = rewView === 'roomPlusProduct' 
            ? 'rewRoomPlusProductData.data' 
            : 'rewModesData.data';

          const componentLabel = {
            'modalOnly': 'Modal only',
            'sbirOnly': 'SBIR only',
            'modalPlusSbir': 'Modal + SBIR'
          }[componentView] || componentView;

          return (
            <div className="text-[10px] font-mono mb-1 bg-purple-50 p-1 rounded border border-purple-300 space-y-0.5">
              <div>Plot uses: <strong>{plotDataSource}</strong> (REW {rewView === 'roomPlusProduct' ? 'Room+Product' : 'Room-only'}, {componentLabel})</div>
              <div>Mode isolation active: <strong>{isolationActive ? 'YES' : 'NO'}</strong> {isolationActive && `(value: ${modeIsolation})`}</div>
              <div>Modal modes actually used this run: <strong>{modeCountUsed}</strong></div>
              <div className="mt-1 pt-1 border-t border-purple-300 font-semibold">
                Component RMS 20–200 Hz:
              </div>
              <div>Modal RMS: <strong>{activeDebug?.modalRmsDb_20_200 || '—'} dB</strong></div>
              <div>SBIR RMS: <strong>{activeDebug?.sbirRmsDb_20_200 || '—'} dB</strong></div>
              <div>Total RMS: <strong>{activeDebug?.totalRmsDb_20_200 || '—'} dB</strong></div>
              <div className="text-[9px] opacity-70 mt-1 border-t border-purple-300 pt-1">
                <strong>UI componentView:</strong> {componentView}
              </div>
              <div className="text-[9px] opacity-70">
                <strong>Engine componentView:</strong> {activeDebug?.componentView || 'N/A'}
              </div>
              {activeDebug?.subDistancesToMLP && (
                <div className="text-[9px] opacity-70 mt-1 border-t border-purple-300 pt-1">
                  <strong>Sub distances + effective delays:</strong><br/>
                  {activeDebug.subDistancesToMLP.map((sub, i) => (
                    <div key={i}>
                      {sub.subId}: {sub.distanceM}m, delay={sub.effectiveDelayMs}ms
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* Graph area */}
        <div className="mt-6">
          {(belowFloor > 0 || (yAxisLocked && (clampedToMin > 0 || clampedToMax > 0))) && (
            <div className="text-[10px] text-gray-500 mb-2 italic">
              {belowFloor > 0 && `${belowFloor} below floor (-60 dB) → null`}
              {belowFloor > 0 && yAxisLocked && (clampedToMin > 0 || clampedToMax > 0) && ' | '}
              {yAxisLocked && clampedToMin > 0 && `${clampedToMin} clamped to min`}
              {yAxisLocked && clampedToMin > 0 && clampedToMax > 0 && ', '}
              {yAxisLocked && clampedToMax > 0 && `${clampedToMax} clamped to max`}
              {isRewStyle && yAxisLocked && ` (window: ${Number.isFinite(rewLockedMin) ? rewLockedMin.toFixed(0) : '—'} to ${Number.isFinite(rewLockedMax) ? rewLockedMax.toFixed(0) : '—'} dB)`}
            </div>
          )}
          
          {/* Plot Integrity Check (before graph renders) */}
          {plotIntegrityCheck.status === 'VALID' && (
            <div className="text-xs mb-2 bg-blue-50 p-2 rounded border border-blue-400">
              <div className="font-semibold mb-1 text-blue-700">📊 Plot Integrity Check</div>
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
                  Min Δf: {plotIntegrityCheck.minDf.toFixed(6)} Hz
                </div>
                <div className="text-gray-700">
                  Max Δf: {plotIntegrityCheck.maxDf.toFixed(6)} Hz
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
                    Max jump: {plotIntegrityCheck.maxJumpDb.toFixed(3)} dB
                    {plotIntegrityCheck.maxJumpAtHz && ` @ ${plotIntegrityCheck.maxJumpAtHz.toFixed(2)} Hz`}
                  </div>
                  
                  {plotIntegrityCheck.top5Jumps && plotIntegrityCheck.top5Jumps.length > 0 && (
                    <div className="mt-1 pt-1 border-t border-blue-200">
                      <div className="font-semibold text-xs mb-1">Top 5 SPL jumps:</div>
                      <div className="space-y-0.5 text-[9px]">
                        {plotIntegrityCheck.top5Jumps.map((jump, i) => (
                          <div key={i} className={jump.absJumpDb > 1.0 ? 'text-red-600 font-semibold' : ''}>
                            {jump.hzPrev.toFixed(2)} → {jump.hzNow.toFixed(2)} Hz 
                            (Δf={jump.deltaF.toFixed(4)} Hz): 
                            {jump.dbPrev.toFixed(2)} → {jump.dbNow.toFixed(2)} dB 
                            (jump: {jump.jumpDb >= 0 ? '+' : ''}{jump.jumpDb.toFixed(3)} dB)
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Step Pair Debug (55-80 Hz) - Automatic jump diagnosis */}
                {activeDebug?.stepPairDebug55_80Hz && activeDebug.stepPairDebug55_80Hz.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-purple-300 bg-purple-50">
                    <div className="font-semibold text-purple-800 mb-2">Step Pair Debug (55–80 Hz):</div>
                    <div className="text-[9px] font-mono space-y-3">
                      {activeDebug.stepPairDebug55_80Hz.map((pair, pairIdx) => (
                        <div key={pairIdx} className="border border-purple-200 rounded p-1.5 bg-white">
                          <div className="font-bold text-purple-700 mb-1">
                            Jump #{pairIdx + 1}: {pair.jumpFreqStart.toFixed(2)} → {pair.jumpFreqEnd.toFixed(2)} Hz 
                            ({pair.jumpDbSigned >= 0 ? '+' : ''}{pair.jumpDbSigned.toFixed(3)} dB)
                          </div>
                          <div className="space-y-0.5">
                            {pair.window.map((pt, i) => (
                              <div key={i} className={`pl-2 ${
                                pt.isJumpStart ? 'bg-yellow-100 font-bold border-l-2 border-yellow-500' :
                                pt.isJumpEnd ? 'bg-red-100 font-bold border-l-2 border-red-500' :
                                'text-gray-600'
                              }`}>
                                {pt.isJumpStart && <span className="text-yellow-700">&gt;&gt;&gt; JUMP START: </span>}
                                {pt.isJumpEnd && <span className="text-red-700">&gt;&gt;&gt; JUMP END: </span>}
                                {pt.exactFreqHz.toFixed(3)} Hz: 
                                SPL={pt.plotSPLdB.toFixed(2)} dB, 
                                modes={pt.modesUsed}/{pt.modesConsidered}, 
                                sbir={pt.sbirReflectionsUsed}, 
                                total={pt.activeTermsTotal}
                                {i > 0 && (
                                  <span className={
                                    Math.abs(pt.deltaModesUsed) > 0 || Math.abs(pt.deltaSbirReflectionsUsed) > 0
                                      ? 'text-red-600 font-bold'
                                      : 'text-gray-500'
                                  }>
                                    {' '}(Δ: SPL{pt.deltaPlotdB >= 0 ? '+' : ''}{pt.deltaPlotdB.toFixed(3)}, 
                                    modes{pt.deltaModesUsed >= 0 ? '+' : ''}{pt.deltaModesUsed}, 
                                    sbir{pt.deltaSbirReflectionsUsed >= 0 ? '+' : ''}{pt.deltaSbirReflectionsUsed})
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Term Count Debug (55-80 Hz band) - Full raw data */}
                {activeDebug?.termCountDebug55_80Hz && activeDebug.termCountDebug55_80Hz.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-blue-300">
                    <div className="font-semibold text-purple-700 mb-1">Term Count Debug (55–80 Hz) - Full:</div>
                    <div className="text-[9px] font-mono space-y-0.5 max-h-48 overflow-y-auto">
                      {activeDebug.termCountDebug55_80Hz.slice(0, 20).map((entry, i) => (
                        <div key={i} className={
                          i > 0 && (
                            entry.modesUsed !== activeDebug.termCountDebug55_80Hz[i-1].modesUsed ||
                            entry.sbirReflectionsUsed !== activeDebug.termCountDebug55_80Hz[i-1].sbirReflectionsUsed
                          ) ? 'text-red-600 font-bold' : 'text-gray-700'
                        }>
                          {entry.exactFreqHz.toFixed(3)} Hz: 
                          modes={entry.modesUsed}/{entry.modesConsidered} 
                          (skip: bw={entry.modesSkippedBandwidth}, coup={entry.modesSkippedCoupling}), 
                          sbir={entry.sbirReflectionsUsed}, 
                          total={entry.activeTermsTotal}
                        </div>
                      ))}
                      {activeDebug.termCountDebug55_80Hz.length > 20 && (
                        <div className="text-gray-500 italic">
                          ... ({activeDebug.termCountDebug55_80Hz.length - 20} more)
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
            const audit40_70 =
              (activeDebug?.audit40_70) ||
              (rewModesDataAudit?.debug?.audit40_70) ||
              (rewModesDataAbs?.debug?.audit40_70) ||
              (rewRoomPlusProductDataAbs?.debug?.audit40_70) ||
              null;

            // Calculate min/max from ONLY the finite, in-window values (what's actually plotted)
            const visualMin = finiteSpl.length > 0 ? Math.min(...finiteSpl) : null;
            const visualMax = finiteSpl.length > 0 ? Math.max(...finiteSpl) : null;
            
            const __plotAudit = {
              using: "plottedSeries",
              len: dataToPlot.length,
              finiteCount: finiteSpl.length,
              min: Number.isFinite(visualMin) ? visualMin.toFixed(2) : 'N/A',
              max: Number.isFinite(visualMax) ? visualMax.toFixed(2) : 'N/A',
              smoothing: rewStyleMode ? 'none' : rewSmoothing,
              rewCompareView,
              userSmoothingChoice: rewSmoothing,
              audit40_70,
              rewLockedWindow: (isRewStyle && yAxisLocked) ? `${rewLockedMin?.toFixed(0)} to ${rewLockedMax?.toFixed(0)} dB` : 'N/A',
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
                  showModeMarkers={rewStyleMode ? showRewModeLines : showModeMarkers}
                  modeMarkers={modeMarkersForGraph}
                  linearHzAxis={rewStyleMode && linearHzAxis}
                  rewStyleMode={rewStyleMode}
                  yDomain={yDomain}
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
                <strong>plottedSeriesName:</strong> {(() => {
                  if (activeDebug?.componentView) {
                    return activeDebug.componentView;
                  }
                  if (rewStyleMode) {
                    return `REW-${rewView}-${componentView}`;
                  }
                  return "productSim";
                })()}
              </div>
              <div>
                <strong>sbirPathsUsed:</strong> {(() => {
                  if (activeDebug?.sbirDebugProbe63Hz?.pathsUsed) {
                    return activeDebug.sbirDebugProbe63Hz.pathsUsed;
                  }
                  if (activeDebug?.sbirDebugProbe40Hz?.pathsUsed) {
                    return activeDebug.sbirDebugProbe40Hz.pathsUsed;
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
                          <td className="text-right p-2">{contrib.distance.toFixed(2)}</td>
                          <td className="text-right p-2">{contrib.amplitude.toFixed(4)}</td>
                          <td className="text-right p-2">{contrib.phiTotal.toFixed(4)}</td>
                          <td className="text-right p-2 font-bold">
                            {summation ? summation.finalSplDb.toFixed(2) : '—'}
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
                          <td className="text-right p-1">{Number.isFinite(contrib.db0) ? contrib.db0.toFixed(2) : '—'}</td>
                          <td className="text-right p-1">{Number.isFinite(contrib.dbDist) ? contrib.dbDist.toFixed(2) : '—'}</td>
                          <td className="text-right p-1">{Number.isFinite(contrib.dbBoundary) ? contrib.dbBoundary.toFixed(2) : '—'}</td>
                          <td className="text-right p-1">{Number.isFinite(contrib.dbPower) ? contrib.dbPower.toFixed(2) : '—'}</td>
                          <td className="text-right p-1">{Number.isFinite(contrib.dbEq) ? contrib.dbEq.toFixed(2) : '—'}</td>
                          <td className="text-right p-1">{Number.isFinite(contrib.dbGain) ? contrib.dbGain.toFixed(2) : '—'}</td>
                          <td className="text-right p-1">{Number.isFinite(contrib.dbMag) ? contrib.dbMag.toFixed(2) : '—'}</td>
                          <td className="text-right p-1">{Number.isFinite(contrib.amplitude) ? contrib.amplitude.toFixed(2) : '—'}</td>
                          <td className="text-right p-1">{Number.isFinite(contrib.phiDistance) ? contrib.phiDistance.toFixed(2) : '—'}</td>
                          <td className="text-right p-1">{Number.isFinite(contrib.phiDelay) ? contrib.phiDelay.toFixed(2) : '—'}</td>
                          <td className="text-right p-1">{Number.isFinite(contrib.phiPolarity) ? contrib.phiPolarity.toFixed(2) : '—'}</td>
                          <td className="text-right p-1">{Number.isFinite(contrib.phiTotal) ? contrib.phiTotal.toFixed(2) : '—'}</td>
                          <td className="text-right p-1">{Number.isFinite(contrib.subReal) ? contrib.subReal.toFixed(2) : '—'}</td>
                          <td className="text-right p-1">{Number.isFinite(contrib.subImag) ? contrib.subImag.toFixed(2) : '—'}</td>
                          <td className="text-right p-1">{Number.isFinite(contrib.filteredReal) ? contrib.filteredReal.toFixed(2) : '—'}</td>
                          <td className="text-right p-1">{Number.isFinite(contrib.filteredImag) ? contrib.filteredImag.toFixed(2) : '—'}</td>
                          <td className="text-right p-1">{isLastSub && summation && Number.isFinite(summation.sumReal) ? summation.sumReal.toFixed(2) : ''}</td>
                          <td className="text-right p-1">{isLastSub && summation && Number.isFinite(summation.sumImag) ? summation.sumImag.toFixed(2) : ''}</td>
                          <td className="text-right p-1">{isLastSub && summation && Number.isFinite(summation.finalSplDb) ? summation.finalSplDb.toFixed(2) : ''}</td>
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
                {bassMetrics2080Hz.variance.toFixed(2)} dB
              </span>
            </div>
            <div className="text-xs text-[#3E4349] pl-4">
              Lower is better (uniformity)
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-[#3E4349]">Best ↔ Worst seat:</span>
              <span className="font-medium text-[#1B1A1A]">
                {bassMetrics2080Hz.bestWorstDelta.toFixed(1)} dB
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
              <strong>Display offset in Relative view:</strong> {allowDisplayRefOffset ? `${(Number(rewDisplayRefDb) || 0).toFixed(2)} dB` : '0.00 dB (forced)'}
            </div>
          </div>
        </div>
      </div>

      {/* Room Modes & SBIR Controls */}
      <div className="rounded-lg border border-[#DCDBD6] bg-white p-4">
        <div className="text-sm font-medium text-[#1B1A1A] mb-3">Room Acoustics (Product Simulation)</div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="sbir-toggle" className="text-xs text-[#3E4349]">
                SBIR (reflections)
              </Label>
              <div className="text-[10px] text-[#3E4349] opacity-70 mt-0.5">
                Adds first-order reflections (image sources). Disables boundary gain when enabled.
              </div>
            </div>
            <Switch
              id="sbir-toggle"
              checked={rewSbirEnabled}
              onCheckedChange={setRewSbirEnabled}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="modes-toggle" className="text-xs text-[#3E4349]">
              Enable Room Modes
            </Label>
            <Switch
              id="modes-toggle"
              checked={modesEnabled}
              onCheckedChange={setModesEnabled}
            />
          </div>

          {modesEnabled && (
            <>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs text-[#3E4349]">Room Damping (Q)</Label>
                  <span className="text-xs font-mono text-[#1B1A1A]">
                    {roomDamping.toFixed(0)}
                  </span>
                </div>
                <Slider
                  value={[roomDamping]}
                  onValueChange={([v]) => setRoomDamping(v)}
                  min={8}
                  max={35}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-[#3E4349] mt-1">
                  <span>Dead (8)</span>
                  <span>Lively (35)</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox 
                  id="mode-markers" 
                  checked={showModeMarkers}
                  onCheckedChange={setShowModeMarkers}
                />
                <Label htmlFor="mode-markers" className="text-xs text-[#3E4349]">
                  Show mode frequency markers
                </Label>
              </div>
            </>
          )}

          <div className="text-xs text-[#3E4349]">
            Applies modal filtering to product-based simulation
          </div>
        </div>
      </div>

      {/* REW Smoothing (only shown when REW mode is ON) */}
      {rewStyleMode && (
        <div className="rounded-lg border border-[#DCDBD6] bg-white p-4">
          <div className="text-sm font-medium text-[#1B1A1A] mb-3">Smoothing</div>
          <div className="space-y-2">
            <div className="flex gap-2">
              <Button
                variant={(rewCompareView ? graphSmoothing === 'none' : rewSmoothing === 'none') ? 'default' : 'outline'}
                size="sm"
                onClick={() => setRewSmoothing('none')}
                className="text-xs flex-1"
                disabled={rewCompareView}
              >
                None (Raw)
              </Button>
              <Button
                variant={(rewCompareView ? graphSmoothing === '1/48' : rewSmoothing === '1/48') ? 'default' : 'outline'}
                size="sm"
                onClick={() => setRewSmoothing('1/48')}
                className="text-xs flex-1"
                disabled={rewCompareView}
              >
                1/48 oct (Simulation)
              </Button>
              <Button
                variant={(rewCompareView ? graphSmoothing === '1/3' : rewSmoothing === '1/3') ? 'default' : 'outline'}
                size="sm"
                onClick={() => setRewSmoothing('1/3')}
                className="text-xs flex-1"
                disabled={rewCompareView}
              >
                1/3 oct (RP22)
              </Button>
            </div>
            <div className="text-xs text-[#3E4349]">
              Use 1/48 for diagnostic detail, 1/3 for RP22 reporting
            </div>
          </div>
        </div>
      )}

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
                <Checkbox 
                  id="try-polarity" 
                  checked={tryPolarity}
                  onCheckedChange={setTryPolarity}
                />
                <Label htmlFor="try-polarity" className="text-xs text-[#3E4349]">
                  Try polarity inversion for best sum
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
                        <span className="font-medium">Worst:</span> {nullInfo.worstDb.toFixed(1)} dB
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