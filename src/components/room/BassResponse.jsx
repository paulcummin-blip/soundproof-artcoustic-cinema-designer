import React, { useMemo, useEffect, useState, useRef } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppState } from "../AppStateProvider";
import BassGraph from "@/components/room/bass/BassGraph";
import { computeRoomModesLocal } from "@/bass/core/modalCalculations.js";
import { getSubwooferCurve } from "@/components/models/speakers/registry";
import SubTuningControls from "@/components/room/bass/SubTuningControls";
import ModalResonanceLineToggles from "@/components/room/bass/ModalResonanceLineToggles";
import NullDepthAuditBadge from "@/components/room/bass/NullDepthAuditBadge";
import BassDiagnosticsPanel from "@/components/room/bass/BassDiagnosticsPanel";
import Case099RewThreeRoomBenchmark from "@/components/room/bass/Case099RewThreeRoomBenchmark";
import { applyBassSmoothing, bassSmoothingLabel } from "@/components/room/bass/bassGraphSmoothing";
import BackgroundAnalysisControls from "@/components/room/bass/BackgroundAnalysisControls";
import BassEngineeringDetails from "@/components/room/bass/BassEngineeringDetails";
import BassResultsSummary from "@/components/room/bass/BassResultsSummary";
import { useSharedBassResults } from "@/components/room/bass/bassResultsStore";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import DesignEqLimitStatus from "@/components/room/bass/DesignEqLimitStatus";
import { REW_PARITY_PRESET, REW_SOURCE_CURVES } from "@/components/room/bass/rewSourceCurves";
import { useNormalizedRoomTransferLive } from "@/components/room/bass/useNormalizedRoomTransferLive";
import { useNormalizedPhysicsOptions } from "@/components/room/bass/useNormalizedPhysicsOptions";
import { buildNormalizedSeries } from "@/components/room/bass/normalizedSeriesBuilder";
import { buildBassGraphSeries, detailedEqStatusText } from "@/components/room/bass/bassGraphDomainBuilder";
import { usePublishBestSubLayoutInputs } from "@/components/room/bass/best-layout/usePublishBestSubLayoutInputs";
import { useActiveProjectId } from "@/components/state/project-session";
import { resolveBestSubLayoutContextId } from "@/components/room/bass/best-layout/bestSubLayoutContext";

const IS_DEVELOPMENT_MODE = false;

export default function BassResponse({ frontSubsCfg, rearSubsCfg, subWarnings }) {
  const { setFrontSubsCfg, setRearSubsCfg, designEqEnabled, setDesignEqEnabled } = useAppState();
  const sharedBassResults = useSharedBassResults();
  const authoritative = sharedBassResults.authoritative;
  const {
    roomDims, seatingPositions, splConfig, rspPosition, subsForSimulation, simulationResults,
    rspRawCurve, perSeatRawCurves, designEqSystemLimits, optimisationTransitionHz,
    runSimulation, autoAlignEnabled, setAutoAlignEnabled, autoAlignDelays,
    surfaceAbsorptionInputs, setSurfaceAbsorptionInputs, surfaceAbsorption, roomDamping,
    frontSubsLive, rearSubsLive,
    enableRewCoreReflections, setEnableRewCoreReflections, rewSourceCurveMode, setRewSourceCurveMode,
    modalSourceReferenceMode, setModalSourceReferenceMode, modalGainScalar, setModalGainScalar,
    axialQ, setAxialQ, modalStorageMode, propagationPhaseScale, setPropagationPhaseScale,
    disableReflectionPhaseJitter, disableReflectionCoherenceWeight, disableLateField,
    disableModalPropagationPhase, mute68HzAxialMode, debugDisableModalContribution,
    rewParityFieldMode, setRewParityFieldMode, modalDistanceBlend, setModalDistanceBlend,
    overrideConstantAxialQ, overrideAbsorptionAxialQ, debugMode200Multiplier, setDebugMode200Multiplier,
    debugModalPhaseConvention, setDebugModalPhaseConvention, debugModalHSign, setDebugModalHSign,
    reflectionGainScale, setReflectionGainScale, rewParityModalMagnitudeScale, setRewParityModalMagnitudeScale,
    modalCoherenceMode, setModalCoherenceMode, highOrderAxialScale, setHighOrderAxialScale,
    qStrategy, setQStrategy, rewModalBandwidthScale, setRewModalBandwidthScale,
    bassSmoothingMode, setBassSmoothingMode, includeDiagnostics, setIncludeDiagnostics,
  } = authoritative;
  const activeProjectId = useActiveProjectId();
  const layoutContextId = resolveBestSubLayoutContextId({ projectId: activeProjectId, roomDims });
  const hasNoSeats = !Array.isArray(seatingPositions) || seatingPositions.length === 0;
  const totalSubCount = (frontSubsCfg?.count || 0) + (rearSubsCfg?.count || 0);
  const hasNoSubs = totalSubCount === 0;
  const resolveAutoDelayForSub = (subId, group, index) => {
    if (autoAlignDelays[subId] != null) return autoAlignDelays[subId];
    const labels = ["left", "right"];
    const canonicalId = `${group}-sub-${labels[index] ?? index}`;
    if (autoAlignDelays[canonicalId] != null) return autoAlignDelays[canonicalId];
    return autoAlignDelays[`sub-${group}-${index + 1}`] ?? 0;
  };

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

  // Presentation-only state. Production response inputs and physics are owned by the room-scoped authority.
  const [isDraggingSub, setIsDraggingSub] = useState(false);
  const [graphScaleMode, setGraphScaleMode] = useState('rew_fixed');
  const [houseCurveOverride, setHouseCurveOverride] = useState(null);
  const showHouseCurve = houseCurveOverride ?? !!designEqEnabled;
  const [overlayProduction, setOverlayProduction] = useState(false);
  const [showRsp, setShowRsp] = useState(true);
  const [showRealSeatOverlays, setShowRealSeatOverlays] = useState(false);

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

  const overlayProductionResults = useMemo(
    () => (overlayProduction ? runSimulation('production') : null),
    [runSimulation, overlayProduction]
  );

  // Build graph series: RSP is always the first (authoritative) series, followed by
  // selected real-seat display overlays. The optimiser never reads from this list —
  // it reads rspRawCurve directly. Graph visibility never affects P14/P18/P19.
  const multiSeries = useMemo(() => {
    const responses = simulationResults.seatResponses;
    const series = [];

    // RSP — always first, green, labelled
    if (showRsp && rspRawCurve.length > 0) {
      series.push({ id: "rsp", color: "#16A34A", data: rspRawCurve, kind: "rsp", label: "RSP" });
    }

    // Real-seat display overlays
    const activeIds = selectedSeatIds.filter(id => id !== "rsp" && responses[id]);
    activeIds.forEach(sid => {
      const response = responses[sid];
      if (!response?.freqsHz || !response?.splDb) return;

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

      series.push({ id: sid, color: getSeatColor(sid), data: deduped });
    });

    if (!isDraggingSub && series.length > 0 && series[0].data.length > 0) {
      lastStablePlotRef.current = series[0].data;
    }

    return series;
  }, [selectedSeatIds, simulationResults.seatResponses, orderedSeats, isDraggingSub, showRsp, rspRawCurve]);

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
    const sid = "rsp";
    const response = overlayProductionResults.seatResponses?.[sid];
    if (!response?.freqsHz || !response?.splDb) return null;
    const data = response.freqsHz
      .map((frequency, i) => ({ frequency, spl: Number.isFinite(response.splDb[i]) ? response.splDb[i] : null }))
      .filter(p => Number.isFinite(p.frequency) && p.frequency > 0);
    return { id: 'overlay-production', color: '#9CA3AF', label: 'Production', data };
  }, [overlayProduction, overlayProductionResults, selectedSeatIds]);


  const detailedLifecycle = sharedBassResults.lifecycle;
  const detailedStatus = sharedBassResults.detailedStatus;
  const detailedError = sharedBassResults.detailedError;
  const detailedInputsValid = sharedBassResults.inputsValid;
  const optimisationResult = sharedBassResults.optimisationResult;
  const bassAnalysisContract = sharedBassResults.contract;
  const optimiserPriorityMode = sharedBassResults.selectedPriorityMode;
  const setOptimiserPriorityMode = sharedBassResults.onPriorityChange;
  const calculateDetailed = sharedBassResults.onRetry;

  // Product-independent normalized physics options.
  const normalizedPhysicsOptions = useNormalizedPhysicsOptions({
    surfaceAbsorption, qStrategy, enableRewCoreReflections, roomDamping, axialQ,
    modalSourceReferenceMode, modalGainScalar, modalDistanceBlend, modalStorageMode,
    propagationPhaseScale, disableReflectionPhaseJitter, disableReflectionCoherenceWeight,
    mute68HzAxialMode, debugDisableModalContribution, rewParityFieldMode,
    overrideConstantAxialQ, overrideAbsorptionAxialQ, debugMode200Multiplier,
    reflectionGainScale, modalCoherenceMode, highOrderAxialScale, rewModalBandwidthScale,
  });

  usePublishBestSubLayoutInputs({ contextId: layoutContextId, physicsOptions: normalizedPhysicsOptions });

  const normalizedLive = useNormalizedRoomTransferLive({
    roomDims, rspPosition, seatingPositions, subsForSimulation,
    physicsOptions: normalizedPhysicsOptions,
  });

  // Normalized RSP series for the live, pre-calibration room-response display.
  // Phase 2B: label reflects the two-stage quality (preview / refining / refined).
  const normalizedSeries = useMemo(
    () => buildNormalizedSeries(normalizedLive.result?.rspCurve, normalizedLive.quality, normalizedLive.isRefining),
    [normalizedLive.result, normalizedLive.quality, normalizedLive.isRefining]
  );

  const hasValidDetailedResult = !!designEqEnabled &&
    optimisationResult?.finalPostEqCurve?.length > 0 && rspRawCurve.length > 0;

  const multiSeriesForGraph = useMemo(() => buildBassGraphSeries({
    designEqEnabled, showHouseCurve, normalizedSeries, rspRawCurve, optimisationResult,
    hasMatchingDetailedResult: hasValidDetailedResult, multiSeries, showRealSeatOverlays,
    smoothingMode: bassSmoothingMode, overlayProductionSeries, showRewOverlay, rewOverlaySeries,
  }), [designEqEnabled, showHouseCurve, normalizedSeries, rspRawCurve, optimisationResult,
    hasValidDetailedResult, multiSeries, showRealSeatOverlays, bassSmoothingMode,
    overlayProductionSeries, showRewOverlay, rewOverlaySeries]);

  const graphStatusText = detailedEqStatusText({
    designEqEnabled, hasMatchingDetailedResult: hasValidDetailedResult,
    detailedStatus, optimisationResult, error: detailedError,
  });
  const graphCandidateId = multiSeriesForGraph.find((series) => series.kind === "post-eq")?.candidateId || null;

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

  // Keep a single-seat "selectedSeat" reference for the graph title + per-seat detail cards.
  // Prefers RSP (the authoritative assessment position) when available.
  const primarySelectedSeat = useMemo(() => {
    const responses = simulationResults.seatResponses;
    if (responses.rsp) {
      return { id: "rsp", isRsp: true };
    }
    const sid = selectedSeatIds[0];
    if (sid && responses[sid]) {
      return { id: sid };
    }
    return null;
  }, [selectedSeatIds, simulationResults.seatResponses]);

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

  // Shared transition frequency for graph markers and the optimiser validation path.
  const schroederFrequency = optimisationTransitionHz;

  const rp22Levels = React.useMemo(() => ([
    { level: "L1", spl: 114, color: "#C1B6AD" },
    { level: "L2", spl: 117, color: "#8B7F76" },
    { level: "L3", spl: 120, color: "#625143" },
    { level: "L4", spl: 123, color: "#213428" },
  ]), []);

  // Expose drag state
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__B44_setIsDraggingSub = (dragging) => setIsDraggingSub(dragging);
    }
  }, []);

  return (
    <div className="space-y-4" style={{ fontFamily: 'Didact Gothic, Century Gothic, sans-serif' }}>

      {(!rspPosition || hasNoSubs) && (
        <Alert className="border border-[#DCDBD6] bg-[#F8F8F7] text-[#3E4349]">
          <AlertDescription className="text-sm">
            {!rspPosition && <>No RSP (green dot) position available. Bass assessment is unavailable until the MLP is set.</>}
            {!rspPosition && hasNoSubs && <><br/></>}
            {hasNoSubs && <>No subwoofers found. Add one in <strong>Speakers</strong> (front corner is fine to start).</>}
          </AlertDescription>
        </Alert>
      )}
      {hasNoSeats && rspPosition && !hasNoSubs && (
        <div style={{ fontSize: 11, color: "#8B7F76", fontFamily: "monospace", marginBottom: 8 }}>
          No real seats — P14/P18/P19 assessed at RSP. P20 requires at least 2 real seats.
        </div>
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
      <BassResultsSummary />
      
      {(subWarnings?.front?.length > 0 || subWarnings?.rear?.length > 0) && (
        <Alert className="border border-[#C1B6AD] bg-[#F8F8F7] text-[#3E4349]">
          <AlertDescription className="text-sm">
            {subWarnings.front.map((w, i) => <div key={`f-${i}`}>{w}</div>)}
            {subWarnings.rear.map((w, i) => <div key={`r-${i}`}>{w}</div>)}
          </AlertDescription>
        </Alert>
      )}

      {/* ── Active Test Engine Banner ── */}
      {includeDiagnostics && activeTestEngine && (
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
            <DesignEqLimitStatus enabled={designEqEnabled} onChange={setDesignEqEnabled} priorityMode={optimiserPriorityMode} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: '#625143', fontFamily: 'monospace' }}>Show house curve:</span>
              <Switch checked={showHouseCurve} onCheckedChange={setHouseCurveOverride} />
            </div>
            {designEqEnabled && Array.isArray(seatingPositions) && seatingPositions.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: '#625143', fontFamily: 'monospace' }}>Show real-seat overlays:</span>
                <Switch checked={showRealSeatOverlays} onCheckedChange={setShowRealSeatOverlays} />
              </div>
            )}
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
            {designEqEnabled && (
              <BackgroundAnalysisControls
                lifecycle={detailedLifecycle}
                onRecalculate={() => calculateDetailed?.(includeDiagnostics)}
                disabled={!detailedInputsValid || detailedStatus === "CALCULATING" || detailedStatus === "QUEUED"}
                includeDiagnostics={includeDiagnostics}
                onDiagnosticsChange={setIncludeDiagnostics}
              />
            )}
          </div>
        </div>



        {/* RSP measurement pill — authoritative assessment position */}
        {rspPosition && (
          <div style={{ display: "flex", gap: 5, marginBottom: 6, alignItems: "center" }}>
            <button
              onClick={() => setShowRsp(prev => !prev)}
              title={`RSP — Reference Seat Position (x=${rspPosition.x.toFixed(2)} m, y=${rspPosition.y.toFixed(2)} m, z=${rspPosition.z.toFixed(2)} m)`}
              style={{
                width: 52, height: 26,
                border: showRsp ? "2px solid #16A34A" : "1px solid #DCDBD6",
                borderRadius: 9999, fontSize: 11, fontWeight: showRsp ? 700 : 500,
                background: showRsp ? "#16A34A" : "#F6F3EE",
                color: showRsp ? "#fff" : "#625143",
                cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center",
                outline: "none", flexShrink: 0, transition: "background 0.12s, border-color 0.12s",
              }}
            >
              RSP
            </button>
            <span style={{ fontSize: 10, color: "#8B7F76", fontFamily: "monospace" }}>
              Assessment position
            </span>
          </div>
        )}

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
                      const color = getSeatColor(sid);
                      const rowNum = Number(seat?.row || seat?.rowNumber) || 1;
                      const rowSeatsOrdered = orderedSeats.filter(s => (Number(s?.row || s?.rowNumber) || 1) === rowNum);
                      const posInRow = rowSeatsOrdered.findIndex(s => (s.id || `${s.x}-${s.y}`) === sid) + 1;
                      const label = `R${rowNum}S${posInRow}`;
                      return (
                        <button
                          key={sid}
                          onClick={() => toggleSeat(sid)}
                          title={label}
                          style={{
                            width: 52, height: 26,
                            border: isOn ? `2px solid ${color}` : "1px solid #DCDBD6",
                            borderRadius: 9999, fontSize: 11, fontWeight: isOn ? 700 : 500,
                            background: isOn ? color : "#F6F3EE",
                            color: isOn ? "#fff" : "#625143",
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

        {/* Fixed curve key — derived from series metadata so the key, graph and tooltip cannot drift apart */}
        {multiSeriesForGraph.length > 0 && (() => {
          const primaryCurves = multiSeriesForGraph.filter(s => s.kind === "raw" || s.kind === "post-eq" || s.kind === "house-curve" || s.kind === "normalized-target");
          const realSeatOverlays = multiSeriesForGraph.filter(s => s.kind === "real-seat-overlay");
          if (primaryCurves.length === 0) return null;
          return (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 18px", marginBottom: 8, padding: "6px 10px", background: "#F8F8F7", border: "1px solid #DCDBD6", borderRadius: 6 }}>
              {primaryCurves.map(s => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <svg width="32" height="8" style={{ flexShrink: 0 }}>
                    <line x1="0" y1="4" x2="32" y2="4" stroke={s.color} strokeWidth={s.strokeWidth ?? 2} strokeDasharray={s.strokeDasharray} opacity={s.strokeOpacity ?? 1} />
                  </svg>
                  <span style={{ fontSize: 10, color: "#1B1A1A", fontFamily: "monospace" }}>{s.label}</span>
                </div>
              ))}
              {realSeatOverlays.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 10, borderLeft: "1px solid #DCDBD6" }}>
                  <span style={{ fontSize: 10, color: "#8B7F76", fontFamily: "monospace" }}>Real-seat overlays:</span>
                  {realSeatOverlays.map(s => (
                    <span key={s.id} style={{ fontSize: 10, color: s.color, fontFamily: "monospace" }}>{s.id}</span>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        <div className="mt-4">
          {multiSeriesForGraph.length > 0 ? (
            <BassGraph
              multiSeries={multiSeriesForGraph}
              responseData={(designEqEnabled ? multiSeriesForGraph.find((series) => series.id.endsWith("-eq")) : multiSeriesForGraph[0])?.data ?? []}
              schroederFrequency={schroederFrequency}
              rp22Levels={rp22Levels}
              toggles={{}}
              crossoverFrequency={80}
              modeFrequencies={[]}
              showModeMarkers={true}
              modeMarkers={modeMarkersForGraph}
              linearHzAxis={false}
              rewStyleMode={true}
              yDomain={graphScaleMode === 'rew_fixed' ? [70, 140] : undefined}
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
        <div style={{ fontSize: 10, color: designEqEnabled ? '#213428' : '#8B7F76', fontFamily: 'monospace', marginTop: 2 }}>
          {graphStatusText}
        </div>
        <BassEngineeringDetails
          enabled={includeDiagnostics}
          designEqEnabled={designEqEnabled}
          result={optimisationResult}
          rspPosition={rspPosition}
          seatingPositions={seatingPositions}
          contract={bassAnalysisContract}
          detailedStatus={detailedStatus}
          rspRawCurve={rspRawCurve}
          perSeatRawCurves={perSeatRawCurves}
          priorityMode={optimiserPriorityMode}
          onPriorityChange={setOptimiserPriorityMode}
          systemLimits={designEqSystemLimits}
          multiSeries={multiSeries}
          runtimeCapture={simulationResults.runtimeVectorCapture}
          smoothingMode={bassSmoothingMode}
          lifecycle={detailedLifecycle}
          graphCandidateId={graphCandidateId}
        />

        {/* Allen & Berkley model attribution — presentation only, no simulation/scaling logic */}
        <p className="text-center text-[11px] font-normal text-muted-foreground mt-2 mb-2">
          Simulation based on the Allen & Berkley (1978) room acoustics model with Artcoustic Loudspeakers engineering data.
        </p>

        {/* ── Temporary overlay toggle for the REW-style Absorption Authority candidate ── */}
        {includeDiagnostics && <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
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
        </div>}

        {includeDiagnostics && <ModalResonanceLineToggles
          toggles={modalLineToggles}
          onToggle={toggleModalLine}
          onSetAll={setAllModalLines}
        />}
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
      {includeDiagnostics && multiSeries.length > 0 && multiSeries[0]?.data?.length > 0 && (
        <NullDepthAuditBadge rawData={multiSeries[0].data} smoothingMode={bassSmoothingMode} />
      )}

      {/* ── Diagnostic panel wiring extracted to BassDiagnosticsPanel.jsx ── */}
      {includeDiagnostics && <BassDiagnosticsPanel
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
      />}

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

    </div>
  );
}