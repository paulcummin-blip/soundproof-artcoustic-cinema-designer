import React, { useMemo, useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppState } from "../AppStateProvider";
import BassGraph from "@/components/room/bass/BassGraph";
import { simulateBassAtSeats, computeAxialModes, computeModesOnlyResponse } from "@/components/bass/bassSimulationEngine";
import { computeRoomModesResponse } from "@/components/utils/roomModesEngine";
import SubTuningControls from "@/components/room/bass/SubTuningControls";
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

export default function BassResponse({ frontSubsCfg, rearSubsCfg, subWarnings, frontSubsLive, rearSubsLive }) {
  const { seatingPositions, roomDims, splConfig, setFrontSubsCfg, setRearSubsCfg } = useAppState();
  const hasNoSeats = !Array.isArray(seatingPositions) || seatingPositions.length === 0;
  const totalSubCount = (frontSubsCfg?.count || 0) + (rearSubsCfg?.count || 0);
  const hasNoSubs = totalSubCount === 0;

  const dimsTxt = `${(roomDims?.widthM ?? 0).toFixed(1)}×${(roomDims?.lengthM ?? 0).toFixed(1)}×${(roomDims?.heightM ?? 0).toFixed(1)} m`;

  // State declarations (must be before useMemo/useCallback that use them)
  const [autoAlignEnabled, setAutoAlignEnabled] = useState(true);
  const [tryPolarity, setTryPolarity] = useState(false);
  const [hasAutoAlignedFront, setHasAutoAlignedFront] = useState(false);
  const [hasAutoAlignedRear, setHasAutoAlignedRear] = useState(false);
  const [modesEnabled, setModesEnabled] = useState(false);
  const [roomDamping, setRoomDamping] = useState(20);
  const [showModeMarkers, setShowModeMarkers] = useState(false);
  const [rewStyleMode, setRewStyleMode] = useState(false);
  const [rewSmoothing, setRewSmoothing] = useState('1/3'); // 1/3 octave smoothing by default (REW + RP22 P19)
  const [showRewModeLines, setShowRewModeLines] = useState(true);
  const [linearHzAxis, setLinearHzAxis] = useState(false);
  const [rewView, setRewView] = useState('roomOnly'); // 'roomOnly' | 'roomPlusProduct'
  const [rewRelativeView, setRewRelativeView] = useState(false); // Normalize toggle
  const [yAxisLocked, setYAxisLocked] = useState(true);
  const [yAxisDomain, setYAxisDomain] = useState(null);
  const [scaleEpoch, setScaleEpoch] = useState(0);

  // Ensure smoothing is 1/3 octave when REW mode is enabled
  useEffect(() => {
    if (rewStyleMode && (!rewSmoothing || rewSmoothing === 'none')) {
      setRewSmoothing('1/3');
    }
  }, [rewStyleMode]);

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
      const p = s?.position;
      if (!p || typeof p.x !== "number" || typeof p.y !== "number") return null;

      const subId = s?.id ?? `${group}-sub-${idx}`;
      const tuning = getTuning(subId, cfg);

      return {
        id: subId,
        modelKey: s?.model ?? "SUB2-12",
        x: p.x,
        y: p.y,
        z: typeof p.z === "number" ? p.z : 0.35,
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
      return { seatResponses: {}, metrics: null };
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
        modesEnabled,
        roomDamping
      }
    });
  }, [roomDims?.widthM, roomDims?.lengthM, roomDims?.heightM, seatingPositions, subsForSimulation, splConfig, modesEnabled, roomDamping, hasNoSeats, hasNoSubs]);

  // Find MLP seat for display
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

  // REW-style room-only curve (modal response with flat/generic sub)
  const rewModesData = useMemo(() => {
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

    const seatPos = { x: seat.x, y: seat.y, z: seat.z ?? 1.2 };

    // Build source positions from actual subs
    const sourcePositions = subsForSimulation
      .filter(s => s && Number.isFinite(s.x) && Number.isFinite(s.y))
      .map(s => ({
        x: s.x,
        y: s.y,
        z: 0.0,
        tuning: s.tuning || { gainDb: 0, delayMs: 0, polarity: 'normal' }
      }));

    if (!sourcePositions.length) {
      return {
        data: [],
        debug: { error: "No valid sub positions" }
      };
    }
    
    // Build signatures for dependency tracking
    const subSig = sourcePositions.map(s => 
      `${s.x.toFixed(2)}_${s.y.toFixed(2)}_${s.z.toFixed(2)}_g${(s.tuning?.gainDb||0).toFixed(1)}_d${(s.tuning?.delayMs||0).toFixed(1)}_p${s.tuning?.polarity||'normal'}`
    ).join('|');
    const seatSig = `${seatPos.x.toFixed(2)}_${seatPos.y.toFixed(2)}_${seatPos.z.toFixed(2)}`;

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
        rewParityMode: true,
        smoothing: rewSmoothing,
        subFloorHeight: 0.0,
        normalizeBandHz: rewRelativeView ? [30, 80] : null,
        normalizeToDb: rewRelativeView ? 0 : null,
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
        absoluteSplMode: !rewRelativeView
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

    return {
      data: result.freqs.map((frequency, i) => ({
        frequency,
        spl: result.splDb[i]
      })),
      debug: {
        ...result.debug,
        viewMode: 'Room-only (generic sub)',
        curveType: 'Modal response + geometry',
      },
      freqs: result.freqs,
      splDb: result.splDb,
      subSig,
      seatSig
    };
  }, [rewStyleMode, roomDims?.widthM, roomDims?.lengthM, roomDims?.heightM, seatingPositions, subsForSimulation, roomDamping, rewSmoothing, rewRelativeView]);

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
      console.warn("[getSubAnechoicResponseDb] Failed", modelKey, err);
      return null;
    }
  };

  // REW-style room + product curve (apply actual sub response before room interaction)
  const rewRoomPlusProductData = useMemo(() => {
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

    // Build source positions
    const sourcePositions = subsForSimulation
      .filter(s => s && Number.isFinite(s.x) && Number.isFinite(s.y))
      .map(s => ({
        x: s.x,
        y: s.y,
        z: 0.0,
        tuning: s.tuning || { gainDb: 0, delayMs: 0, polarity: 'normal' }
      }));

    if (!sourcePositions.length) {
      return { data: [], debug: { error: "No valid sub positions" } };
    }
    
    // Build signatures for dependency tracking
    const subSig = sourcePositions.map(s => 
      `${s.x.toFixed(2)}_${s.y.toFixed(2)}_${s.z.toFixed(2)}_g${(s.tuning?.gainDb||0).toFixed(1)}_d${(s.tuning?.delayMs||0).toFixed(1)}_p${s.tuning?.polarity||'normal'}`
    ).join('|');
    const seatSig = `${seatPos.x.toFixed(2)}_${seatPos.y.toFixed(2)}_${seatPos.z.toFixed(2)}`;

    // Generate frequency axis once (must match engine's axis)
    const freqs = [];
    for (let f = 15; f <= 200; f += 0.5) {
      freqs.push(f);
    }

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
        includeAxial: true,
        includeTangential: true,
        includeOblique: true,
        rewParityMode: true,
        smoothing: rewSmoothing,
        subFloorHeight: 0.0,
        normalizeBandHz: rewRelativeView ? [30, 80] : null,
        normalizeToDb: rewRelativeView ? 0 : null,
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
        absoluteSplMode: !rewRelativeView
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

    return {
      data: result.freqs.map((frequency, i) => ({
        frequency,
        spl: result.splDb[i]
      })),
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
        productCurveDebug
      },
      freqs: result.freqs,
      splDb: result.splDb
    };
  }, [rewStyleMode, rewView, roomDims, seatingPositions, subsForSimulation, roomDamping, rewSmoothing, rewModesData]);

  // Helper: apply REW-style smoothing
  function applyRewSmoothing(freqs, splDb, smoothing) {
    const octaveFraction = {
      '1/12': 12,
      '1/6': 6,
      '1/3': 3
    }[smoothing] || 1;

    const smoothed = [...splDb];

    for (let i = 0; i < freqs.length; i++) {
      const fc = freqs[i];
      const fLow = fc / Math.pow(2, 1 / (2 * octaveFraction));
      const fHigh = fc * Math.pow(2, 1 / (2 * octaveFraction));

      let sum = 0;
      let count = 0;

      for (let j = 0; j < freqs.length; j++) {
        if (freqs[j] >= fLow && freqs[j] <= fHigh) {
          sum += splDb[j];
          count++;
        }
      }

      if (count > 0) {
        smoothed[i] = sum / count;
      }
    }

    return smoothed;
  }

  // Convert to chart format (product-based curve)
  const responseData = useMemo(() => {
    if (!selectedSeat || !selectedSeat.freqsHz || !selectedSeat.splDb) {
      return [];
    }
    
    return selectedSeat.freqsHz.map((frequency, i) => ({
      frequency,
      spl: selectedSeat.splDb[i]
    }));
  }, [selectedSeat]);
  
  // Choose which curve to display based on mode and view
  const displayData = useMemo(() => {
    if (!rewStyleMode) {
      // Product simulation mode
      return responseData;
    }

    // REW parity mode
    if (rewView === 'roomPlusProduct') {
      return rewRoomPlusProductData?.data || [];
    } else {
      // roomOnly
      return rewModesData?.data || [];
    }
  }, [rewStyleMode, rewView, rewModesData, rewRoomPlusProductData, responseData]);

  // REW parity mode: no post-processing anchoring
  // (preserves absolute SPL reference from engine for consistent Y-axis)
  const rewSplAnchoredData = useMemo(() => {
    return displayData;
  }, [displayData]);

  // Compute stable Y-axis domain using 30–80 Hz band intelligence
  // IMPORTANT: ALWAYS return EXACTLY a 40 dB window (no padding).
  const computeStableYDomain = React.useCallback((data) => {
    if (!data || data.length === 0) return null;

    // 30–80 Hz band (designer-relevant reference)
    const band = data
      .filter(d => d.frequency >= 30 && d.frequency <= 80)
      .map(d => d.spl)
      .filter(v => Number.isFinite(v));

    if (band.length === 0) return null;

    const bandAvg = band.reduce((a, b) => a + b, 0) / band.length;

    // Exact 40 dB window
    const span = 40;
    let min = bandAvg - span / 2;
    let max = bandAvg + span / 2;

    // Keep window "intelligent": if the 30–80 Hz band itself sits outside the window,
    // shift the whole window up/down BUT KEEP span fixed at 40 dB.
    const bandMin = Math.min(...band);
    const bandMax = Math.max(...band);

    if (bandMax > max) {
      const shiftUp = bandMax - max;
      min += shiftUp;
      max += shiftUp;
    }
    if (bandMin < min) {
      const shiftDown = min - bandMin;
      min -= shiftDown;
      max -= shiftDown;
    }

    // Round to whole dB and re-enforce exact span after rounding
    min = Math.floor(min);
    max = min + span;

    return { min, max };
  }, []);

  // Auto-enable Lock Y-axis when REW mode is turned ON
  React.useEffect(() => {
    if (rewStyleMode) {
      setYAxisLocked(true);
    }
  }, [rewStyleMode]);

  // Compute Y-axis domain ONCE on first valid data, then only on manual reset
  React.useEffect(() => {
    if (!rewStyleMode) {
      setYAxisDomain(null);
      return;
    }
    // Set once when we first get valid data, and again only on Reset scale.
    const shouldCompute = yAxisDomain === null || scaleEpoch > 0;
    if (!shouldCompute) return;
    if (!displayData || displayData.length === 0) return;
    const domain = computeStableYDomain(displayData);
    if (domain) {
      setYAxisDomain(domain);
      if (scaleEpoch > 0) setScaleEpoch(0);
    }
  }, [rewStyleMode, displayData, yAxisDomain, scaleEpoch, computeStableYDomain]);

  // Manual reset function
  const handleResetScale = React.useCallback(() => {
    if (!rewStyleMode) return;
    
    // Trigger recompute by incrementing epoch
    setScaleEpoch(prev => prev + 1);
  }, [rewStyleMode]);

  // Determine final Y-axis domain to pass to graph + clamp data + count out-of-window points
  const finalYDomain = React.useMemo(() => {
    if (!rewStyleMode) return undefined;
    return yAxisDomain || undefined;
  }, [rewStyleMode, yAxisDomain]);

  // Break line at out-of-window points (using RAW data for counts)
  const { clampedData, outBelow, outAbove } = React.useMemo(() => {
    if (!rewStyleMode || !finalYDomain) {
      return { clampedData: displayData, outBelow: 0, outAbove: 0 };
    }

    let below = 0;
    let above = 0;

    // Count violations using RAW spl values
    displayData.forEach(p => {
      const v = p.spl;
      if (Number.isFinite(v)) {
        if (v < finalYDomain.min) below++;
        else if (v > finalYDomain.max) above++;
      }
    });

    // IMPORTANT:
    // Do NOT clamp to min/max (that draws a fake "shelf").
    // Instead, break the line by using null when outside the 40 dB window.
    const clipped = displayData.map(p => {
      const v = p.spl;
      if (!Number.isFinite(v)) return { ...p, spl: null };

      if (v < finalYDomain.min || v > finalYDomain.max) {
        return { ...p, spl: null };
      }

      return { ...p, spl: v };
    });

    return { clampedData: clipped, outBelow: below, outAbove: above };
  }, [rewStyleMode, finalYDomain, displayData]);

  // Bass Metrics (20-80 Hz) for P14 reporting
  const bassMetrics2080Hz = useMemo(() => {
    const seatResponses = simulationResults.seatResponses;
    if (!seatResponses || Object.keys(seatResponses).length === 0) {
      return null;
    }

    const seatIds = Object.keys(seatResponses);
    const firstSeat = seatResponses[seatIds[0]];
    if (!firstSeat || !firstSeat.freqsHz || !firstSeat.splDb) {
      return null;
    }

    // Filter to 20-80 Hz range
    const freqIndices = firstSeat.freqsHz
      .map((f, i) => ({ f, i }))
      .filter(({ f }) => f >= 20 && f <= 80);
    
    if (freqIndices.length === 0) {
      return null;
    }

    // 1. Seat-to-seat variance (std dev across seats per freq, then average)
    let sumStdDevs = 0;
    freqIndices.forEach(({ i }) => {
      const splValues = seatIds.map(sid => seatResponses[sid].splDb[i]);
      const mean = splValues.reduce((a, b) => a + b, 0) / splValues.length;
      const variance = splValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / splValues.length;
      const stdDev = Math.sqrt(variance);
      sumStdDevs += stdDev;
    });
    const avgVariance = sumStdDevs / freqIndices.length;

    // 2. Best vs worst seat (avg level per seat over 20-80 Hz, then max-min)
    const seatAverages = seatIds.map(sid => {
      const seat = seatResponses[sid];
      const sum = freqIndices.reduce((acc, { i }) => acc + seat.splDb[i], 0);
      return sum / freqIndices.length;
    });
    const bestSeatAvg = Math.max(...seatAverages);
    const worstSeatAvg = Math.min(...seatAverages);
    const bestWorstDelta = bestSeatAvg - worstSeatAvg;

    // 3. Null count (simple: dips >= 6dB below seat's own avg)
    let totalNulls = 0;
    seatIds.forEach(sid => {
      const seat = seatResponses[sid];
      const seatAvg = freqIndices.reduce((acc, { i }) => acc + seat.splDb[i], 0) / freqIndices.length;
      freqIndices.forEach(({ i }) => {
        const dip = seatAvg - seat.splDb[i];
        if (dip >= 6) {
          totalNulls++;
        }
      });
    });

    return {
      variance: avgVariance,
      bestWorstDelta,
      nullCount: totalNulls
    };
  }, [simulationResults.seatResponses]);

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
      // Use mode markers from the same parity calculation (prevents drift)
      // These come from the actual REW parity run with correct source/seat positions
      return rewModesData?.debug?.modeMarkersHz || [];
    }

    // Fallback to basic axial modes for product simulation
    const modes = computeAxialModes({
      widthM: roomDims.widthM,
      lengthM: roomDims.lengthM,
      heightM: roomDims.heightM
    }, 200);
    return modes.map(m => m.fHz);
  }, [rewStyleMode, rewModesData]);

  // Filter mode markers to axial only for graph overlay (visual clarity)
  const axialModeMarkersForGraph = useMemo(() => {
    if (!rewStyleMode) return [];
    const allMarkers = rewModesData?.debug?.modeMarkers || [];
    return allMarkers.filter(m => m.family === 'axial');
  }, [rewStyleMode, rewModesData]);

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
    if (!autoAlignEnabled) return; // Skip if auto-align is disabled
    
    const mlpSeat = seatingPositions?.find(s => s.isPrimary);
    if (!mlpSeat) return; // No MLP, skip

    const mlpPoint = {
      x: mlpSeat.x,
      y: mlpSeat.y,
      z: mlpSeat.z ?? 1.2
    };

    const SPEED_OF_SOUND = 343; // m/s

    // Collect active subs for this group
    const isRear = groupLabel === 'Rear';
    const cfg = isRear ? rearSubsCfg : frontSubsCfg;
    const count = cfg?.count || 0;
    
    if (count === 0) return;

    const positions = cfg?.positions || [];
    const settingsById = cfg?.settingsById || {};
    const prefix = groupLabel.toLowerCase();
    const subIds = count === 1 ? [`${prefix}-sub-left`] : [`${prefix}-sub-left`, `${prefix}-sub-right`];

    // Default positions if needed
    const roomWidth = roomDims?.widthM || 4.5;
    const roomLength = roomDims?.lengthM || 6.0;
    const defaultPositions = isRear
      ? [{ x: roomWidth * 0.33, y: roomLength - 0.15 }, { x: roomWidth * 0.67, y: roomLength - 0.15 }]
      : [{ x: roomWidth * 0.33, y: 0.15 }, { x: roomWidth * 0.67, y: 0.15 }];

    // Calculate distances and delays
    const subData = subIds.map((subId, i) => {
      const pos = positions[i] || defaultPositions[i] || { x: roomWidth / 2, y: isRear ? roomLength - 0.15 : 0.15 };
      const dx = pos.x - mlpPoint.x;
      const dy = pos.y - mlpPoint.y;
      const dz = 0.35 - mlpPoint.z; // sub z is always 0.35
      const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
      const arrivalTime = distance / SPEED_OF_SOUND;
      
      return { subId, distance, arrivalTime, pos };
    });

    // Find reference (earliest arrival)
    const minArrival = Math.min(...subData.map(s => s.arrivalTime));

    // Set delays to align all subs to reference
    const newSettings = { ...settingsById };
    subData.forEach(({ subId, arrivalTime }) => {
      const delayMs = Math.max(0, Math.min(30, (arrivalTime - minArrival) * 1000));
      newSettings[subId] = {
        ...newSettings[subId],
        gainDb: newSettings[subId]?.gainDb ?? 0,
        polarity: newSettings[subId]?.polarity ?? 'normal',
        delayMs // overwrite delay with calculated value
      };
    });

    // Polarity optimization if enabled
    if (tryPolarity && count > 1) {
      // Simple scoring: evaluate combined SPL at MLP in 30-80 Hz band
      const testFreqs = [30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80];
      
      // Function to score a polarity configuration
      const scorePolarity = (polarityConfig) => {
        // Build test subs with current delays + test polarity
        const testSubs = subData.map(({ subId, pos }, i) => ({
          id: subId,
          modelKey: cfg.model,
          x: pos.x,
          y: pos.y,
          z: 0.35,
          tuning: {
            gainDb: 0,
            delayMs: newSettings[subId].delayMs,
            polarity: polarityConfig[i] ? 180 : 0
          }
        }));

        // Quick sum at MLP for test frequencies
        let totalSpl = 0;
        testFreqs.forEach(f => {
          let sumReal = 0;
          let sumImag = 0;
          
          testSubs.forEach(sub => {
            const dx = sub.x - mlpPoint.x;
            const dy = sub.y - mlpPoint.y;
            const dz = sub.z - mlpPoint.z;
            const d = Math.sqrt(dx*dx + dy*dy + dz*dz);
            
            // Simplified: assume 90 dB @ 1m baseline
            const amplitude = Math.pow(10, (90 - 20 * Math.log10(d)) / 20);
            
            // Phase from distance + delay + polarity
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

      // Test all polarity combinations (brute force for 2 subs: 4 configs)
      const bestConfig = [false, false]; // start with all normal
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
          if (score > bestScore + 0.5) { // Must improve by >0.5dB
            bestScore = score;
            bestConfig[0] = config[0];
            bestConfig[1] = config[1];
          }
        });
      }

      // Apply best polarity
      subData.forEach(({ subId }, i) => {
        newSettings[subId].polarity = bestConfig[i] ? 'invert' : 'normal';
      });
    }

    // Update state
    if (isRear) {
      setRearSubsCfg(prev => ({ ...prev, settingsById: newSettings }));
    } else {
      setFrontSubsCfg(prev => ({ ...prev, settingsById: newSettings }));
    }
  }, [autoAlignEnabled, seatingPositions, roomDims, frontSubsCfg, rearSubsCfg, tryPolarity, setFrontSubsCfg, setRearSubsCfg]);

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
    if (frontSubsCfg?.count > 0) {
      autoAlignSubs('Front');
    }
    if (rearSubsCfg?.count > 0) {
      autoAlignSubs('Rear');
    }
  }, [autoAlignEnabled, frontSubsCfg?.positions, rearSubsCfg?.positions, roomDims, seatingPositions, autoAlignSubs]);

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

      {/* RP22 Bass Metrics */}
      {simulationResults.metrics && (
        <div className="grid grid-cols-4 gap-3">
          <div className="rounded-lg border border-[#DCDBD6] bg-white p-3">
            <div className="text-xs text-[#3E4349] mb-1">P14 Max SPL</div>
            <div className="text-lg font-bold text-[#1B1A1A]">
              {simulationResults.metrics.p14.maxSplDb.toFixed(1)} dB
            </div>
          </div>
          <div className="rounded-lg border border-[#DCDBD6] bg-white p-3">
            <div className="text-xs text-[#3E4349] mb-1">P18 Extension</div>
            <div className="text-lg font-bold text-[#1B1A1A]">
              {simulationResults.metrics.p18.f3Hz.toFixed(0)} Hz
            </div>
          </div>
          <div className="rounded-lg border border-[#DCDBD6] bg-white p-3">
            <div className="text-xs text-[#3E4349] mb-1">P19 Deviation</div>
            <div className="text-lg font-bold text-[#1B1A1A]">
              ±{simulationResults.metrics.p19.maxDeviationDb.toFixed(1)} dB
            </div>
          </div>
          <div className="rounded-lg border border-[#DCDBD6] bg-white p-3">
            <div className="text-xs text-[#3E4349] mb-1">Bass Uniformity</div>
            <div className="text-lg font-bold text-[#1B1A1A]">
              ±{simulationResults.metrics.uniformity.sdDb_20_80.toFixed(1)} dB
            </div>
            <div className="text-xs text-[#3E4349] mt-1">20–80 Hz</div>
          </div>
        </div>
      )}
      
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#1B1A1A" }}>Bass Response</div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Label htmlFor="rew-mode" className="text-xs text-[#3E4349] whitespace-nowrap">
                Room Modes (REW-style)
              </Label>
              <Switch
                id="rew-mode"
                checked={rewStyleMode}
                onCheckedChange={setRewStyleMode}
              />
            </div>

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
          </div>
        )}

        {/* REW mode info (only when REW is ON and no error) */}
        {rewStyleMode && !rewModesData?.debug?.error && (() => {
          // Select correct debug data based on view
          const activeDebug = rewView === 'roomPlusProduct' && rewRoomPlusProductData?.debug
            ? rewRoomPlusProductData.debug
            : rewModesData?.debug;

          return (
            <div className="text-xs text-[#3E4349] mb-2 bg-[#F8F8F7] p-2 rounded border border-[#DCDBD6]">
              <div className="font-semibold mb-1">
                {rewView === 'roomPlusProduct' ? 'Room + Product' : 'Room-only (generic sub)'}
              </div>
              <div className="text-[11px] space-y-1">
                <div>• Complex modal summation with spatial coupling</div>
                <div>• {activeDebug?.qMappingText || 'Q-based damping'}</div>
                <div>• {rewRelativeView ? 'Relative (normalized to 0 dB @ 30–80 Hz)' : 'Absolute SPL'} scale</div>
                {rewView === 'roomPlusProduct' && (
                  <div>• Product curves: {(activeDebug?.productModels || []).join(', ') || 'None'}</div>
                )}
              </div>
              <div className="mt-2 pt-2 border-t border-[#DCDBD6] space-y-0.5">
                <div className="text-[10px] font-mono opacity-80 font-semibold text-blue-700">
                  REW Inputs (Live Tracking):
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
                  <strong>Lowest axial:</strong> {activeDebug?.lowestAxialHz?.toFixed(1) || 'N/A'} Hz
                </div>
                {activeDebug?.lfProbe?.lfSanityCheck && (
                  <div className={`text-[10px] font-mono opacity-80 ${activeDebug.lfProbe.lfSanityCheck.startsWith('FAIL') ? 'text-red-600 font-bold' : 'text-green-600'}`}>
                    <strong>LF Sanity:</strong> {activeDebug.lfProbe.lfSanityCheck}
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
                  <div className="text-[10px] font-mono opacity-80">
                    <strong>Calibration Offset:</strong> {activeDebug.calibrationOffsetDb} dB
                  </div>
                  <div className="text-[10px] font-mono opacity-80">
                    <strong>Smoothing:</strong> {activeDebug.smoothingApplied || 'none'}
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

        {/* REW view selector (only when REW is ON) */}
        {rewStyleMode && (
          <div className="flex items-center gap-3 mb-2">
            <div className="text-xs text-[#3E4349]">View:</div>
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
                checked={!linearHzAxis}
                onCheckedChange={(v) => setLinearHzAxis(!v)}
              />
              <Label htmlFor="linear-hz-axis" className="text-xs text-[#3E4349]">
                Log Hz axis (REW-style)
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
          </div>
        )}

        {/* Out of window warning (only when REW is ON and points are clamped) */}
        {rewStyleMode && (outBelow + outAbove) > 0 && (
          <div style={{ marginTop: 6, marginBottom: 8, fontSize: 12, color: "#8a2b2b", background: "#fff3cd", padding: "6px 10px", borderRadius: 6, border: "1px solid #ffc107" }}>
            ⚠️ Out of window: {outBelow} below, {outAbove} above (fix placement / phase / quantity)
          </div>
        )}

        {/* Graph or placeholder */}
        {displayData.length > 0 ? (
          <BassGraph
            responseData={rewStyleMode ? clampedData : displayData}
            schroederFrequency={schroederFrequency}
            rp22Levels={rp22Levels}
            toggles={toggles}
            crossoverFrequency={80}
            modeFrequencies={modeFrequencies}
            showModeMarkers={rewStyleMode ? showRewModeLines : showModeMarkers}
            modeMarkers={rewStyleMode ? (rewModesData?.debug?.modeMarkers || []) : []}
            linearHzAxis={rewStyleMode && linearHzAxis}
            rewStyleMode={rewStyleMode}
            yDomain={finalYDomain}
            showAxialOnly={rewStyleMode}
            />
        ) : (
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
      
      {/* Room Modes Controls */}
      <div className="rounded-lg border border-[#DCDBD6] bg-white p-4">
        <div className="text-sm font-medium text-[#1B1A1A] mb-3">Room Modes (Product Simulation)</div>
        <div className="space-y-3">
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
            <div className="grid grid-cols-4 gap-2">
              {['none', '1/12', '1/6', '1/3'].map(opt => (
                <Button
                  key={opt}
                  variant={rewSmoothing === opt ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setRewSmoothing(opt)}
                  className="text-xs"
                >
                  {opt === 'none' ? 'None' : opt + ' oct'}
                </Button>
              ))}
            </div>
            <div className="text-xs text-[#3E4349]">
              Use 1/3 octave for RP22 P19 reporting
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