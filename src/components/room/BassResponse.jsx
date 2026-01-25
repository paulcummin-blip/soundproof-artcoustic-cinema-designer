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
  
  // Simplified state: only absorption control
  const [absorptionPct, setAbsorptionPct] = useState(30); // 0-100%
  const [roomDamping, setRoomDamping] = useState(20);

  // Drag performance tracking
  const [isDraggingSub, setIsDraggingSub] = useState(false);
  const lastStablePlotRef = useRef(null);

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
  


  // Convert absorption % to coefficient (0-1)
  const absorptionCoeff = Math.max(0, Math.min(1, absorptionPct / 100));
  const surfaceAbsorption = {
    front: absorptionCoeff,
    back: absorptionCoeff,
    left: absorptionCoeff,
    right: absorptionCoeff,
    ceiling: absorptionCoeff,
    floor: absorptionCoeff
  };

  // Keep refs current with latest state
  React.useEffect(() => { frontCfgRef.current = frontSubsCfg; }, [frontSubsCfg]);
  React.useEffect(() => { rearCfgRef.current = rearSubsCfg; }, [rearSubsCfg]);
  React.useEffect(() => { roomDimsRef.current = roomDims; }, [roomDims]);
  React.useEffect(() => { seatingRef.current = seatingPositions; }, [seatingPositions]);

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

  // Build subs array for simulation
  const subsForSimulation = useMemo(() => {
    const frontInput = frontSubsLive;
    const rearInput = rearSubsLive;

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
  }, [frontSubsLive, rearSubsLive, frontSubsCfg?.settingsById, rearSubsCfg?.settingsById]);

  // Run bass simulation engine  
  const simulationResults = useMemo(() => {
    if (hasNoSeats || hasNoSubs || !roomDims?.widthM || !roomDims?.lengthM || !roomDims?.heightM) {
      return { seatResponses: {}, metrics: null, audit: null };
    }
    
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
  }, [roomDims?.widthM, roomDims?.lengthM, roomDims?.heightM, seatingPositions, subsForSimulation, splConfig, roomDamping, hasNoSeats, hasNoSubs]);

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

  // Canonical analysis series: no smoothing (REW standard)
  const analysisSeriesAbs = useMemo(() => {
    if (!selectedSeat || !selectedSeat.freqsHz || !selectedSeat.splDb) {
      return [];
    }
    
    // Convert engine output to points (no smoothing)
    return selectedSeat.freqsHz.map((frequency, i) => ({
      frequency,
      spl: selectedSeat.splDb[i]
    }));
  }, [selectedSeat]);
  
  // Analysis SPL array for metrics
  const analysisSplDbAbs = useMemo(() => {
    return analysisSeriesAbs.map(p => p.spl);
  }, [analysisSeriesAbs]);

  // Stable signature for engine dependencies
  const sourcesSig = useMemo(() => {
    const src = Array.isArray(subsForSimulation) ? subsForSimulation : [];
    return JSON.stringify(
      src.map(s => ({
        id: s?.id ?? "src",
        x: Number.isFinite(s?.x) ? Math.round(s.x * 1000) / 1000 : 0,
        y: Number.isFinite(s?.y) ? Math.round(s.y * 1000) / 1000 : 0,
        z: Number.isFinite(s?.z) ? Math.round(s.z * 1000) / 1000 : 0,
        gain: Number.isFinite(s?.tuning?.gainDb) ? Math.round(s.tuning.gainDb * 10) / 10 : 0,
        delay: Number.isFinite(s?.tuning?.delayMs) ? Math.round(s.tuning.delayMs * 1000) / 1000 : 0,
        polarity: s?.tuning?.polarity ?? "normal"
      }))
    );
  }, [subsForSimulation]);

  // REW-style time alignment delays (always enabled)
  const rewAlignmentDelays = useMemo(() => {
    const mlpSeat = seatingPositions?.find(s => s.isPrimary) || seatingPositions?.[0];
    if (!mlpSeat) return {};
    
    const mlpPos = { x: mlpSeat.x, y: mlpSeat.y, z: mlpSeat.z ?? 1.2 };
    const SPEED_OF_SOUND = 343; // m/s
    
    const delays = {};
    let maxArrivalTime = -Infinity;
    
    // First pass: compute arrival times
    const arrivalTimes = {};
    subsForSimulation.forEach(sub => {
      const dx = sub.x - mlpPos.x;
      const dy = sub.y - mlpPos.y;
      const dz = (sub.z ?? 0) - mlpPos.z;
      const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
      const arrivalTime = distance / SPEED_OF_SOUND;
      
      arrivalTimes[sub.id] = arrivalTime;
      maxArrivalTime = Math.max(maxArrivalTime, arrivalTime);
    });
    
    // Second pass: align to furthest sub (REW standard)
    subsForSimulation.forEach(sub => {
      const alignDelayMs = (maxArrivalTime - arrivalTimes[sub.id]) * 1000;
      delays[sub.id] = alignDelayMs;
    });
    
    return delays;
  }, [seatingPositions, subsForSimulation]);

  // Expose drag state to parent
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__B44_setIsDraggingSub = (dragging) => {
        setIsDraggingSub(dragging);
      };
    }
  }, []);
  
  // CANONICAL DATASET: Single REW-style simulation at RSP
  const finalSeries = useMemo(() => {

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
    .map(s => {
      const userDelayMs = s.tuning?.delayMs || 0;
      const alignDelayMs = rewAlignmentDelays[s.id] || 0;

      return {
        x: s.x,
        y: s.y,
        z: 0.0,
        id: s.id,
        modelKey: s.modelKey,
        tuning: {
          gainDb: s.tuning?.gainDb || 0,
          delayMs: userDelayMs + alignDelayMs,
          polarity: s.tuning?.polarity || 'normal'
        }
      };
    });

    if (!sourcePositions.length) {
      return { freqsHz: [], splDb: [], debug: { error: "No valid sub positions" } };
    }

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
        sbirMaxOrder: 2,
        sbirIncludeWalls: true,
        sbirIncludeFloorCeiling: true,
        rewParityMode: true,
        smoothing: 'none',
        subFloorHeight: 0.0,
        surfaceAbsorption,
        dampingScalar: Math.max(0.5, roomDamping / 20),
        leakage: 0.0,
        subProductCurves: null,
        isDragging: isDraggingSub
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
  }, [roomDims, seatingPositions, subsForSimulation, roomDamping, sourcesSig, absorptionPct, rewAlignmentDelays, isDraggingSub]);

  // Build responseData from finalSeries
  const responseData = useMemo(() => {
    if (!finalSeries || !finalSeries.freqsHz || !finalSeries.splDb || finalSeries.freqsHz.length === 0) {
      return [];
    }
    
    return finalSeries.freqsHz.map((frequency, i) => ({
      frequency,
      spl: Number.isFinite(finalSeries.splDb[i]) ? finalSeries.splDb[i] : null
    }));
  }, [finalSeries]);

  // Display data (clean for graph)
  const displayData = useMemo(() => {
    return responseData.filter(p => Number.isFinite(p.frequency) && p.frequency > 0);
  }, [responseData]);

  // Safe debug object
  const safeDebug = finalSeries?.debug || {};

  // Clean plotted series for graph
  const plottedSeries = useMemo(() => {
    if (!displayData || displayData.length === 0) return [];
    
    const valid = displayData.filter(p => Number.isFinite(p.frequency) && p.frequency > 0);
    if (valid.length === 0) return [];
    
    const sorted = [...valid].sort((a, b) => a.frequency - b.frequency);
    
    // Remove duplicates (keep first)
    const deduplicated = [];
    for (let i = 0; i < sorted.length; i++) {
      const curr = sorted[i];
      const next = sorted[i + 1];
      if (next && Math.abs(curr.frequency - next.frequency) < 1e-9) continue;
      deduplicated.push(curr);
    }
    
    // Cache for drag stability
    if (!isDraggingSub && deduplicated.length > 0) {
      lastStablePlotRef.current = deduplicated;
    }
    
    return deduplicated;
  }, [displayData, isDraggingSub]);

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
    return safeDebug?.modeMarkersHz || [];
  }, [safeDebug]);

  // Mode markers for graph overlay
  const modeMarkersForGraph = useMemo(() => {
    const allMarkers = safeDebug?.modeMarkers || [];
    return {
      axial: allMarkers.filter(m => m.family === 'axial'),
      tangential: allMarkers.filter(m => m.family === 'tangential'),
      oblique: allMarkers.filter(m => m.family === 'oblique')
    };
  }, [safeDebug]);

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
        
        // Compute P19 (max deviation below Schroeder)
        // Note: P19 should use 1/3 smoothing, but helper not accessible
        const smoothedForP19 = splDb; // Using unsmoothed for now
        
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#1B1A1A" }}>
            Bass Response at {selectedSeat?.isPrimary ? "MLP" : `Seat ${selectedSeat?.id ?? ""}`}
          </div>
        </div>

        {/* Graph area */}
        <div className="mt-4">
          {displayData.length > 0 ? (
            <BassGraph
              responseData={plottedSeries}
              schroederFrequency={schroederFrequency}
              rp22Levels={rp22Levels}
              toggles={{}}
              crossoverFrequency={80}
              modeFrequencies={safeDebug?.modeMarkersHz || []}
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

      {/* Absorption Control */}
      <div className="rounded-lg border border-[#DCDBD6] bg-white p-4">
        <div className="text-sm font-medium text-[#1B1A1A] mb-3">Room Acoustics</div>
        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs text-[#3E4349]">Absorption</Label>
              <span className="text-xs font-mono text-[#1B1A1A]">
                {fmtFixed(absorptionPct, 0)}%
              </span>
            </div>
            <input
              type="range"
              value={absorptionPct}
              onChange={(e) => setAbsorptionPct(Number(e.target.value))}
              min="0"
              max="100"
              step="5"
              className="w-full"
            />
            <div className="flex justify-between text-xs text-[#3E4349] mt-1">
              <span>Reflective (0%)</span>
              <span>Absorptive (100%)</span>
            </div>
          </div>
          <div className="text-xs text-[#3E4349]">
            Applies to all room surfaces. Default: 30% (typical cinema).
          </div>
        </div>
      </div>

      {/* REMOVE ALL DEBUG UI FROM HERE UNTIL Auto Align Controls */}
      {/* Keep only the metrics cards and warnings that were before the graph */}

      {/* Auto Align Controls - KEEP THIS SECTION UNCHANGED */}
      {/* START OF REMOVED SECTION - REMOVE EVERYTHING FROM "REW Parity Test Case" UNTIL HERE */}
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