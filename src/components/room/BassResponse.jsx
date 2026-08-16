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
import BassTargetLevelControl from "@/components/room/bass/BassTargetLevelControl";
import { REW_PARITY_PRESET, REW_SOURCE_CURVES } from "@/components/room/bass/rewSourceCurves";
import { buildNormalizedSeries } from "@/components/room/bass/normalizedSeriesBuilder";
import { buildBassGraphSeries, detailedEqStatusText } from "@/components/room/bass/bassGraphDomainBuilder";
import { usePublishBestSubLayoutInputs } from "@/components/room/bass/best-layout/usePublishBestSubLayoutInputs";
import { useActiveProjectId } from "@/components/state/project-session";
import { resolveBestSubLayoutContextId } from "@/components/room/bass/best-layout/bestSubLayoutContext";
import { buildVisibleRoomModeMarkers } from "@/components/room/bass/roomModePresentation";
import { buildProtectedNullAnnotations } from "@/components/room/bass/protectedNullPresentation";
import ProtectedNullNotice from "@/components/room/bass/ProtectedNullNotice";
import { finalOptimisedBassAuthorityMatches } from "@/components/room/bass/finalOptimisedBassResponse";
import SeatResponseScopeControls from "@/components/room/bass/SeatResponseScopeControls";
import BassCurveVisibilityControls, { DEFAULT_BASS_CURVE_VISIBILITY } from "@/components/room/bass/BassCurveVisibilityControls";
import { buildRp22GraphMarkers } from "@/components/room/bass/rp22GraphMarkers";
import Rp22GraphMarkerKey from "@/components/room/bass/Rp22GraphMarkerKey";
import P14PresentationHeader from "@/components/room/bass/P14PresentationHeader";
import CopyLiveBassValidationButton from "@/components/room/bass/CopyLiveBassValidationButton";
import CopyEqForensicTraceButton from "@/components/room/bass/CopyEqForensicTraceButton";
import EqDiscoveryAuditPanel from "@/components/room/bass/EqDiscoveryAuditPanel";
import Test11GentlePeakCutValidation from "@/components/room/bass/Test11GentlePeakCutValidation";
import { normaliseHouseCurveToP14Total, diagnoseHouseCurveP14Integration } from "@/components/utils/p14HouseCurveNormalisation";
import { useSubwooferCompatibilityActions } from "@/components/hooks/useSubwooferCompatibilityActions";

const IS_DEVELOPMENT_MODE = false;

export default function BassResponse({ frontSubsCfg, rearSubsCfg, subWarnings }) {
  const appState = useAppState();
  const { setFrontSubsCfg, setRearSubsCfg, designEqEnabled, setDesignEqEnabled } = appState;
  const compat = useSubwooferCompatibilityActions(appState, frontSubsCfg, rearSubsCfg);
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
    normalizedLive, normalizedPhysicsOptions,
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

  // Enabled canonical instances per group, enriched with auto-delay readout.
  // Rendered with their exact stable ids and canonical gainDb/delayMs/polarity.
  const frontTuningInstances = useMemo(() => {
    const instances = Array.isArray(appState?.subwooferInstances) ? appState.subwooferInstances : [];
    return instances
      .filter((i) => i?.legacyGroup === "front" && i?.enabled !== false)
      .map((inst, i) => ({
        ...inst,
        autoDelayMs: resolveAutoDelayForSub(`front-sub-${["left", "right"][i] ?? i}`, "front", i),
      }));
  }, [appState?.subwooferInstances, autoAlignDelays]);

  const rearTuningInstances = useMemo(() => {
    const instances = Array.isArray(appState?.subwooferInstances) ? appState.subwooferInstances : [];
    return instances
      .filter((i) => i?.legacyGroup === "rear" && i?.enabled !== false)
      .map((inst, i) => ({
        ...inst,
        autoDelayMs: resolveAutoDelayForSub(`rear-sub-${["left", "right"][i] ?? i}`, "rear", i),
      }));
  }, [appState?.subwooferInstances, autoAlignDelays]);

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
  const responseSelectionKey = `bass-response-selection:${activeProjectId || "free"}`;
  const [selectedSeatIds, setSelectedSeatIds] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(responseSelectionKey) || "null");
      return Array.isArray(saved) && saved.length ? saved : ["rsp"];
    } catch { return ["rsp"]; }
  });

  // Keep RSP as the default; retain only an explicitly selected response while it remains valid.
  useEffect(() => {
    const seats = Array.isArray(seatingPositions) ? seatingPositions : [];
    const validIds = new Set(["rsp", ...seats.map(s => s.id || `${s.x}-${s.y}`)]);
    setSelectedSeatIds((current) => {
      if (current.includes("rsp") || seats.length === 0) return current;
      const still = current.filter((id) => validIds.has(id));
      return still.length ? still : ["rsp"];
    });
  }, [seatingPositions, rspPosition]);
  useEffect(() => {
    try { localStorage.setItem(responseSelectionKey, JSON.stringify(selectedSeatIds)); } catch { /* presentation preference only */ }
  }, [responseSelectionKey, selectedSeatIds]);

  const selectSeat = (sid) => {
    setShowRsp(false);
    setSelectedSeatIds([sid]);
  };
  const selectAllSeats = () => setSelectedSeatIds(orderedSeats.map((seat) => seat.id || `${seat.x}-${seat.y}`));
  const selectRsp = () => {
    setShowRsp(true);
    setSelectedSeatIds(["rsp"]);
  };

  // Presentation-only state. Production response inputs and physics are owned by the room-scoped authority.
  const [isDraggingSub, setIsDraggingSub] = useState(false);
  const [overlayProduction, setOverlayProduction] = useState(false);
  const [showRsp, setShowRsp] = useState(true);
  const [showRealSeatOverlays, setShowRealSeatOverlays] = useState(false);
  const [curveVisibility, setCurveVisibility] = useState(DEFAULT_BASS_CURVE_VISIBILITY);

  // Design EQ is part of the authoritative bass assessment path. It is fixed on;
  // the graph controls below change presentation only and never change RP22 results.
  useEffect(() => {
    if (!designEqEnabled) setDesignEqEnabled(true);
  }, [designEqEnabled, setDesignEqEnabled]);
  // Historical physics investigations are intentionally opt-in. They include
  // dozens of retired simulations and must never block live geometry/product
  // changes merely because current engineering receipts are enabled.
  const [showLegacyBassDiagnostics, setShowLegacyBassDiagnostics] = useState(false);
  useEffect(() => {
    if (!includeDiagnostics) setShowLegacyBassDiagnostics(false);
  }, [includeDiagnostics]);

  // Modal Resonance Line Toggles — display-only, session-only state. Does not affect
  // bass calculation, SPL response, or mode generation; only filters which resonance
  // ReferenceLines are drawn on the graph.
  const [showRoomModes, setShowRoomModes] = useState(false);
  const [modalLineToggles, setModalLineToggles] = useState({ axial: true, tangential: true, oblique: true });
  const toggleModalLine = (key) => setModalLineToggles(prev => ({ ...prev, [key]: !prev[key] }));
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
    const storedSeatCurves = new Map((perSeatRawCurves || []).map((seat) => [seat.seatId, seat.responseData]));
    const series = [];

    // RSP — always first, green, labelled
    if (showRsp && rspRawCurve.length > 0) {
      series.push({ id: "rsp", color: "#16A34A", data: rspRawCurve, kind: "rsp", label: "RSP" });
    }

    // Real-seat display overlays
    const requestedIds = showRealSeatOverlays && selectedSeatIds.includes("rsp")
      ? orderedSeats.map((seat) => seat.id || `${seat.x}-${seat.y}`)
      : selectedSeatIds;
    const activeIds = requestedIds.filter(id => id !== "rsp" && (storedSeatCurves.has(id) || responses[id]));
    activeIds.forEach(sid => {
      const response = responses[sid];
      const storedCurve = storedSeatCurves.get(sid);
      const raw = Array.isArray(storedCurve) && storedCurve.length
        ? storedCurve.map((point) => ({ frequency: Number(point.frequency), spl: Number(point.spl) }))
        : (response?.freqsHz || []).map((frequency, i) => ({ frequency, spl: Number.isFinite(response?.splDb?.[i]) ? response.splDb[i] : null }));
      const validRaw = raw.filter(p => Number.isFinite(p.frequency) && p.frequency > 0);

      const sorted = [...validRaw].sort((a, b) => a.frequency - b.frequency);
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
  }, [selectedSeatIds, simulationResults.seatResponses, perSeatRawCurves, orderedSeats, isDraggingSub, showRsp, showRealSeatOverlays, rspRawCurve]);

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

  // Product-independent transfer is owned by the shared room analysis owner so
  // the graph and optimiser consume one calculation for the current geometry.
  usePublishBestSubLayoutInputs({ contextId: layoutContextId, physicsOptions: normalizedPhysicsOptions });

  // Normalized RSP series for the live, pre-calibration room-response display.
  // Phase 2B: label reflects the two-stage quality (preview / refining / refined).
  const normalizedSeries = useMemo(
    () => buildNormalizedSeries(normalizedLive.result?.rspCurve, normalizedLive.quality, normalizedLive.isRefining),
    [normalizedLive.result, normalizedLive.quality, normalizedLive.isRefining]
  );

  const hasValidDetailedResult = !!designEqEnabled &&
    finalOptimisedBassAuthorityMatches(optimisationResult?.finalOptimisedBassResponse) && rspRawCurve.length > 0;
  const selectedP14TargetDb = authoritative.requested?.selectedP14TargetDb;
  const selectedP14RequiredExtensionHz = authoritative.requested?.selectedP14RequiredExtensionHz;
  const finalBassResponse = optimisationResult?.finalOptimisedBassResponse;
  const canonicalVerticalOffsetDb = finalBassResponse?.canonicalVerticalOffsetDb;
  const p14HouseCurveNormalisation = useMemo(() => normaliseHouseCurveToP14Total({
    houseCurveShape: finalBassResponse?.canonicalHouseCurveShape,
    selectedP14TargetDb,
    requiredExtensionHz: selectedP14RequiredExtensionHz,
    upperLfeHz: 120,
  }), [finalBassResponse?.canonicalHouseCurveShape, selectedP14TargetDb, selectedP14RequiredExtensionHz]);
  const operatingLevelOffsetDb = Number.isFinite(finalBassResponse?.operatingLevelOffsetDb)
    ? finalBassResponse.operatingLevelOffsetDb
    : (Number.isFinite(p14HouseCurveNormalisation?.operatingCurveOffsetDb) && Number.isFinite(canonicalVerticalOffsetDb)
      ? p14HouseCurveNormalisation.operatingCurveOffsetDb - canonicalVerticalOffsetDb
      : 0);

  // Development diagnostic — proves the rendered house curve integrates to the
  // selected P14 target (e.g. 109 dBC for Minimum L1). Acceptance: |errorDb| <= 0.05 dB.
  const p14IntegrationDiagnostic = useMemo(() => diagnoseHouseCurveP14Integration({
    houseCurveShape: finalBassResponse?.canonicalHouseCurveShape,
    selectedP14TargetDb,
    requiredExtensionHz: selectedP14RequiredExtensionHz,
    upperLfeHz: 120,
  }), [finalBassResponse?.canonicalHouseCurveShape, selectedP14TargetDb, selectedP14RequiredExtensionHz]);

  const multiSeriesForGraph = useMemo(() => buildBassGraphSeries({
    designEqEnabled, showHouseCurve: true, normalizedSeries, rspRawCurve, optimisationResult,
    hasMatchingDetailedResult: hasValidDetailedResult, multiSeries, selectedSeatIds, showRealSeatOverlays,
    smoothingMode: bassSmoothingMode, overlayProductionSeries, showRewOverlay, rewOverlaySeries,
    operatingLevelOffsetDb,
  }), [designEqEnabled, normalizedSeries, rspRawCurve, optimisationResult,
    hasValidDetailedResult, multiSeries, selectedSeatIds, showRealSeatOverlays, bassSmoothingMode,
    overlayProductionSeries, showRewOverlay, rewOverlaySeries, operatingLevelOffsetDb]);

  const visibleMultiSeries = useMemo(() => multiSeriesForGraph.filter((series) => {
    if (series.kind === "room-response") return curveVisibility.room;
    if (series.kind === "product-maximum") return curveVisibility.product;
    if (series.kind === "maximum-spl") return curveVisibility.combined;
    if (series.kind === "house-curve" || series.kind === "normalized-target") return curveVisibility.house;
    if (series.kind === "post-eq" || series.kind === "real-seat-overlay") return curveVisibility.finalEq;
    if (series.kind === "raw") return false;
    return true;
  }), [multiSeriesForGraph, curveVisibility]);

  const rp22GraphMarkers = useMemo(
    () => buildRp22GraphMarkers(finalBassResponse),
    [finalBassResponse]
  );

  // C6.1A/C6.1B2: Graph boundary hash check — compare the ACTUAL rendered-series
  // source identity metadata (embedded by bassGraphDomainBuilder) with the
  // canonical metric authority hashes. This breaks the circular dependency
  // where graph hashes were computed from the same completed-result object.
  //
  // C6.1B2 Gap 2: Also verify that the graph candidate ID equals the completed
  // candidate ID (metricCompletedCandidateId from the candidateResultIdentity receipt).
  //
  // C6.1B2 Gap 3: The result of this check (graphMetricParityValid) feeds into
  // computeCanonicalMetricPublication to produce the final publication receipt
  // that gates P14/P18/P19 metric publication, report authority, and export authority.
  const graphMetricParity = useMemo(() => {
    const metricDiag = optimisationResult?.canonicalMetricDiagnostics;
    if (!metricDiag || !metricDiag.canonicalMetricAuthorityValid) {
      return { graphMetricParityValid: false, reason: "metric-authority-invalid", graphPostEqCurveHash: null, graphTargetCurveHash: null, graphCandidateId: null, graphFingerprint: null, graphCalibrationFingerprint: null };
    }
    const postEqSeries = multiSeriesForGraph.find((s) => s.kind === "post-eq" && s.id === "rsp-eq");
    const houseSeries = multiSeriesForGraph.find((s) => s.kind === "house-curve");
    const graphPostEqCurveHash = postEqSeries?.sourcePostEqCurveHash || null;
    const graphTargetCurveHash = houseSeries?.sourceTargetCurveHash || null;
    const graphCandidateId = postEqSeries?.sourceCandidateId || houseSeries?.sourceCandidateId || null;
    // C6.1B2: sourceFingerprint = completed-contract fingerprint (from lifecycle.resultFingerprint).
    // sourceCalibrationFingerprint = embedded calibration identity (separate).
    const graphFingerprint = postEqSeries?.sourceFingerprint || houseSeries?.sourceFingerprint || null;
    const graphCalibrationFingerprint = postEqSeries?.sourceCalibrationFingerprint || houseSeries?.sourceCalibrationFingerprint || null;
    const postEqMatch = graphPostEqCurveHash && graphPostEqCurveHash === metricDiag.metricPostEqCurveHash;
    const targetMatch = graphTargetCurveHash && graphTargetCurveHash === metricDiag.metricTargetCurveHash;
    // C6.1B2 Gap 2: graph candidate must equal the completed candidate ID
    // (metricCompletedCandidateId from the candidateResultIdentity receipt),
    // not just the metric candidate ID.
    const candidateMatch = graphCandidateId && graphCandidateId === metricDiag.metricCompletedCandidateId;
    const fingerprintMatch = graphFingerprint && graphFingerprint === metricDiag.metricCompletedContractFingerprint;
    const calibrationMatch = graphCalibrationFingerprint && graphCalibrationFingerprint === metricDiag.metricCalibrationFingerprint;
    const graphMetricParityValid = !!(postEqMatch && targetMatch && candidateMatch && fingerprintMatch && calibrationMatch);
    const reason = !postEqMatch ? "post-eq-hash-mismatch"
      : !targetMatch ? "target-hash-mismatch"
      : !candidateMatch ? "candidate-id-mismatch"
      : !fingerprintMatch ? "result-fingerprint-mismatch"
      : !calibrationMatch ? "calibration-fingerprint-mismatch"
      : null;
    return { graphMetricParityValid, reason, graphPostEqCurveHash, graphTargetCurveHash, graphCandidateId, graphFingerprint, graphCalibrationFingerprint };
  }, [multiSeriesForGraph, optimisationResult?.canonicalMetricDiagnostics]);

  // C6.2A: The authoritative metric publication receipt now lives in the
  // completed contract (bassAnalysisContract.metricPublication), computed
  // before publishCompletedBassContract() in BassBackgroundAnalysisOwner.
  // BassResponse reads it from the contract rather than owning the only copy.
  // The runtime graph parity check below (graphMetricParity) still verifies
  // that the RENDERED series carry the same hashes as the contract receipt.
  const canonicalMetricPublication = bassAnalysisContract?.metricPublication || null;

  const graphStatusText = detailedEqStatusText({
    designEqEnabled, hasMatchingDetailedResult: hasValidDetailedResult,
    detailedStatus, optimisationResult, error: detailedError,
  });
  const graphPostEqSeries = multiSeriesForGraph.find((series) => series.kind === "post-eq");
  const graphCandidateId = graphPostEqSeries?.candidateId || null;
  const graphFilterBankSignature = graphPostEqSeries?.filterBankSignature || null;

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

  const modeMarkersForGraph = useMemo(() => buildVisibleRoomModeMarkers({
    modes: roomModesForDisplay,
    show: showRoomModes,
    families: modalLineToggles,
    xDomain: [20, 200],
  }), [roomModesForDisplay, showRoomModes, modalLineToggles]);

  const protectedNullAnnotations = useMemo(() => buildProtectedNullAnnotations(
    optimisationResult?.selectedCandidate,
    roomModesForDisplay,
    rspRawCurve,
  ), [optimisationResult?.selectedCandidate, roomModesForDisplay, rspRawCurve]);

  // Shared transition frequency for graph markers and the optimiser validation path.
  const schroederFrequency = optimisationTransitionHz;

  // P14 presentation — the selected P14 dBC value is an integrated C-weighted
  // total, NOT a per-frequency SPL target. The header cards and assessment-band
  // marker communicate this clearly. No horizontal P14 line is drawn on the graph.
  const p14PresentationData = React.useMemo(() => {
    const basis = authoritative.requested?.p14TargetBasis || splConfig?.selectedP14TargetBasis || "minimum";
    const levelNum = authoritative.requested?.requestedLevel || Number(splConfig?.selectedP14Level) || 1;
    const targetDb = Number.isFinite(selectedP14TargetDb) ? selectedP14TargetDb : null;
    const availableCapability = optimisationResult?.availableP14CapabilityDb ?? null;
    const p19Variation = optimisationResult?.achievedP19VariationDb ?? null;
    const p19Level = optimisationResult?.achievedP19Level ?? null;
    return { basis, levelNum, targetDb, availableCapability, p19Variation, p19Level };
  }, [authoritative.requested, splConfig?.selectedP14TargetBasis, splConfig?.selectedP14Level,
    selectedP14TargetDb, optimisationResult?.availableP14CapabilityDb,
    optimisationResult?.achievedP19VariationDb, optimisationResult?.achievedP19Level]);

  // Expose drag state — dispatches events so the background analysis owner
  // can defer the heavy EQ worker during drag and run it once on pointer-up.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__B44_setIsDraggingSub = (dragging) => {
        setIsDraggingSub(dragging);
        window.dispatchEvent(new CustomEvent(dragging ? 'b44-bass-drag-start' : 'b44-bass-drag-end'));
      };
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
            <BassTargetLevelControl disabled={detailedStatus === "CALCULATING" || detailedStatus === "QUEUED"} />
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
                onRecalculate={() => calculateDetailed?.({ collectDiagnostics: includeDiagnostics === true, force: true })}
                disabled={!detailedInputsValid || detailedStatus === "CALCULATING" || detailedStatus === "QUEUED"}
                includeDiagnostics={includeDiagnostics}
                onDiagnosticsChange={setIncludeDiagnostics}
              />
            )}
            {includeDiagnostics && (
              <>
                <CopyLiveBassValidationButton />
                <CopyEqForensicTraceButton />
              </>
            )}
          </div>
        </div>



        <P14PresentationHeader
          selectedP14TargetDb={p14PresentationData.targetDb}
          selectedP14Level={p14PresentationData.levelNum}
          selectedP14TargetBasis={p14PresentationData.basis}
          availableP14CapabilityDb={p14PresentationData.availableCapability}
          achievedP19VariationDb={p14PresentationData.p19Variation}
          achievedP19Level={p14PresentationData.p19Level}
        />

        <SeatResponseScopeControls
          rspPosition={rspPosition}
          orderedSeats={orderedSeats}
          selectedSeatIds={selectedSeatIds}
          getSeatColor={getSeatColor}
          onSelectRsp={selectRsp}
          onSelectSeat={selectSeat}
          onSelectAll={selectAllSeats}
        />

        <BassCurveVisibilityControls
          visibility={curveVisibility}
          onChange={setCurveVisibility}
        />

        <Rp22GraphMarkerKey markers={rp22GraphMarkers} />

        <div className="mt-2">
          {visibleMultiSeries.length > 0 ? (
            <BassGraph
              multiSeries={visibleMultiSeries}
              responseData={(visibleMultiSeries.find((series) => series.kind === "post-eq") || visibleMultiSeries[0])?.data ?? []}
              schroederFrequency={schroederFrequency}
              rp22Levels={[]}
              toggles={{}}
              crossoverFrequency={80}
              showModeMarkers={showRoomModes}
              modeMarkers={modeMarkersForGraph}
              protectedNullAnnotations={protectedNullAnnotations}
              linearHzAxis={false}
              rewStyleMode={true}
              yDomain={[70, 140]}
              xDomain={visibleMultiSeries[0]?.data?.some(p => p.frequency > 200) ? [15, 300] : [15, 200]}
              showAxialOnly={false}
              refDb={85}
              disableHighlight={false}
              renderToken={qStrategy}
              p14TotalDb={p14PresentationData.targetDb}
              operatingLevelOffsetDb={operatingLevelOffsetDb}
              rp22Markers={rp22GraphMarkers}
            />
          ) : (
            <div style={{ border: "1px solid #DCDBD6", borderRadius: 12, background: "#F8F8F7", padding: 24, color: "#3E4349", fontSize: 13, textAlign: "center" }}>
              {multiSeriesForGraph.length > 0
                ? "No graph layers selected. Turn on a layer above to inspect the response."
                : "No bass data yet. Add at least one subwoofer and one seat."}
            </div>
          )}
        </div>
        <ProtectedNullNotice annotations={protectedNullAnnotations} />

        {/* Displayed smoothing label */}
        <div style={{ fontSize: 10, color: '#8B7F76', fontFamily: 'monospace', marginTop: 4 }}>
          Displayed smoothing: {bassSmoothingLabel(bassSmoothingMode)}
        </div>
        <div style={{ fontSize: 10, color: designEqEnabled ? '#213428' : '#8B7F76', fontFamily: 'monospace', marginTop: 2 }}>
          {graphStatusText}
        </div>
        {p14PresentationData.targetDb != null && <div style={{ marginTop: 6, padding: '4px 10px', background: '#F8F8F7', border: '1px solid #DCDBD6', borderRadius: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#213428', fontFamily: 'monospace' }}>
            P14 target: {p14PresentationData.basis === "recommended" ? "Recommended" : "Minimum"} L{Math.max(1, Math.min(4, Math.round(p14PresentationData.levelNum)))} · {Math.round(p14PresentationData.targetDb)} dBC total
          </span>
          {Number.isFinite(selectedP14RequiredExtensionHz) && (
            <span style={{ fontSize: 11, color: '#625143', fontFamily: 'monospace', marginLeft: 16 }}>
              P18 requirement: {selectedP14RequiredExtensionHz} Hz
            </span>
          )}
        </div>}
        {p14PresentationData.targetDb != null && <div style={{ fontSize: 10, color: '#625143', fontFamily: 'monospace', marginTop: 4, fontStyle: 'italic' }}>
          The shaped target integrates to {Math.round(p14PresentationData.targetDb)} dBC total. Individual frequencies are not required to reach {Math.round(p14PresentationData.targetDb)} dB.
        </div>}
        {includeDiagnostics && p14IntegrationDiagnostic && p14IntegrationDiagnostic.integratedCWeightedDb != null && (() => {
          const err = Math.abs(p14IntegrationDiagnostic.errorDb || 0);
          const pass = err <= 0.05;
          return (
            <div style={{ fontSize: 10, color: pass ? '#213428' : '#b45309', fontFamily: 'monospace', marginTop: 2 }}>
              Integration check: {p14IntegrationDiagnostic.integratedCWeightedDb.toFixed(2)} dBC (target {p14IntegrationDiagnostic.selectedP14TargetDb} dBC, error {err.toFixed(3)} dB) {pass ? '✓' : '✗'}
            </div>
          );
        })()}
        {includeDiagnostics && optimisationResult?.canonicalMetricDiagnostics && (() => {
          const d = optimisationResult.canonicalMetricDiagnostics;
          const g = graphMetricParity;
          const pub = canonicalMetricPublication;
          const pubValid = pub?.canonicalMetricPublicationValid === true;
          const authorityValid = d.canonicalMetricAuthorityValid === true;
          const gValid = g.graphMetricParityValid === true;
          const fp = (v) => v ? String(v).slice(0, 12) : 'null';
          const id = (v) => v ? String(v).slice(0, 20) : 'null';
          const bool = (v) => v ? '✓' : '✗';
          const SectionLabel = ({ children }) => (
            <div style={{ fontWeight: 700, marginTop: 4, marginBottom: 1, color: '#625143', letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: 9 }}>{children}</div>
          );
          const Row = ({ label, value, ok }) => (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 2px' }}>
              <span style={{ color: '#3E4349' }}>{label}</span>
              <span style={{ color: ok === undefined ? '#1B1A1A' : (ok ? '#213428' : '#dc2626'), fontWeight: ok === undefined ? 400 : 600 }}>
                {value} {ok === undefined ? '' : (ok ? '✓' : '✗')}
              </span>
            </div>
          );
          return (
            <div style={{ fontSize: 10, color: pubValid ? '#213428' : '#b45309', fontFamily: 'monospace', marginTop: 2, padding: '6px 10px', background: '#F8F8F7', border: `1px solid ${pubValid ? '#DCDBD6' : '#f59e0b'}`, borderRadius: 6 }}>
              <div style={{ fontWeight: 700, fontSize: 11 }}>
                Canonical metric publication: {pubValid ? 'VALID' : 'INVALID'} {pubValid ? '✓' : '✗'}
                {!pubValid && pub?.publicationRejectionReason ? <span style={{ fontWeight: 400, marginLeft: 8, color: '#b45309' }}>({pub.publicationRejectionReason})</span> : null}
              </div>

              <SectionLabel>Completed Identity</SectionLabel>
              <Row label="metricRequestFingerprint" value={fp(d.metricRequestFingerprint)} />
              <Row label="metricReturnedWorkerFingerprint" value={fp(d.metricReturnedWorkerFingerprint)} />
              <Row label="metricCompletedContractFingerprint" value={fp(d.metricCompletedContractFingerprint)} />
              <Row label="metricPersistedCompletedFingerprint" value={fp(d.metricPersistedCompletedFingerprint)} />
              <Row label="metricCalibrationFingerprint" value={fp(d.metricCalibrationFingerprint)} />

              <SectionLabel>Candidate Linkage</SectionLabel>
              <Row label="metricCandidateId" value={id(d.metricCandidateId)} />
              <Row label="metricCompletedCandidateId" value={id(d.metricCompletedCandidateId)} />
              <Row label="metricCompletedCandidateFingerprint" value={fp(d.metricCompletedCandidateFingerprint)} />
              <Row label="candidateIdParityValid" value={bool(d.candidateIdParityValid)} ok={d.candidateIdParityValid} />
              <Row label="candidateFingerprintParityValid" value={bool(d.candidateFingerprintParityValid)} ok={d.candidateFingerprintParityValid} />
              <Row label="candidateResultIdentityValid" value={bool(d.candidateResultIdentityValid)} ok={d.candidateResultIdentityValid} />

              <SectionLabel>Fingerprint Parity</SectionLabel>
              <Row label="requestWorkerParityValid" value={bool(d.requestWorkerParityValid)} ok={d.requestWorkerParityValid} />
              <Row label="requestCompletedParityValid" value={bool(d.requestCompletedParityValid)} ok={d.requestCompletedParityValid} />
              <Row label="workerCompletedParityValid" value={bool(d.workerCompletedParityValid)} ok={d.workerCompletedParityValid} />
              <Row label="persistedFingerprintParityValid" value={bool(d.persistedFingerprintParityValid)} ok={d.persistedFingerprintParityValid} />
              <Row label="calibrationIdentityParityValid" value={bool(d.calibrationIdentityParityValid)} ok={d.calibrationIdentityParityValid} />
              <Row label="fingerprintParityValid" value={bool(d.fingerprintParityValid)} ok={d.fingerprintParityValid} />

              <SectionLabel>Graph Parity (runtime — rendered series)</SectionLabel>
              <Row label="graphPostEqCurveHash" value={g.graphPostEqCurveHash || 'null'} />
              <Row label="graphTargetCurveHash" value={g.graphTargetCurveHash || 'null'} />
              <Row label="graphCandidateId" value={id(g.graphCandidateId)} />
              <Row label="graphFingerprint" value={fp(g.graphFingerprint)} />
              <Row label="graphCalibrationFingerprint" value={fp(g.graphCalibrationFingerprint)} />
              <Row label="graphMetricParityValid" value={bool(gValid)} ok={gValid} />
              <Row label="graph parity reason" value={g.reason || '—'} />

              <SectionLabel>Graph Parity (contract receipt)</SectionLabel>
              <Row label="contract.graphPostEqCurveHash" value={pub?.graphPostEqCurveHash || 'null'} />
              <Row label="contract.graphTargetCurveHash" value={pub?.graphTargetCurveHash || 'null'} />
              <Row label="contract.graphMetricParityValid" value={bool(pub?.graphMetricParityValid)} ok={pub?.graphMetricParityValid} />

              <SectionLabel>Publication</SectionLabel>
              <Row label="canonicalMetricAuthorityValid" value={bool(authorityValid)} ok={authorityValid} />
              <Row label="graphMetricParityValid" value={bool(gValid)} ok={gValid} />
              <Row label="canonicalMetricPublicationValid" value={bool(pubValid)} ok={pubValid} />
              <Row label="publicationRejectionReason" value={pub?.publicationRejectionReason || '—'} />

              <div style={{ marginTop: 4, paddingTop: 3, borderTop: '1px solid #DCDBD6', fontWeight: 400, color: '#625143' }}>
                p14Identity: {bool(d.p14IdentityParityValid)} ·
                freqGrid: {bool(d.frequencyGridParityValid)} ({d.metricCurvePointCount}/{d.targetCurvePointCount} pts)
                {d.legacyMetricCurveDetected ? <span style={{ color: '#dc2626', fontWeight: 700 }}> · LEGACY 186</span> : null}
              </div>
              <div style={{ marginTop: 1, fontWeight: 400, color: '#625143' }}>
                P14: requestedTarget={optimisationResult?.selectedP14TargetDb ?? 'null'} dBC ·
                achievedCapability={optimisationResult?.finalOptimisedBassResponse?.achievedP14Db != null ? optimisationResult.finalOptimisedBassResponse.achievedP14Db.toFixed(2) : 'null'} dBC ·
                source={d.achievedCapabilitySource || 'null'}
              </div>
            </div>
          );
        })()}
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
          graphFilterBankSignature={graphFilterBankSignature}
          graphSeries={multiSeriesForGraph}
          transitionFrequencyHz={optimisationTransitionHz}
          normalizedTransferResult={normalizedLive.status === "ready" && normalizedLive.quality === "refined" ? normalizedLive.result : null}
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

        <ModalResonanceLineToggles
          show={showRoomModes}
          onShowChange={setShowRoomModes}
          toggles={modalLineToggles}
          onToggle={toggleModalLine}
        />
      </div>

      {/* ── EQ Discovery Audit — engineering-only, below the Bass Response graph ── */}
      {includeDiagnostics && <EqDiscoveryAuditPanel />}

      {/* ── TEST 11 — Gentle Peak-Cut Runtime Validation — engineering-only, read-only ── */}
      {includeDiagnostics && <Test11GentlePeakCutValidation />}

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

      {/* Historical/retired investigations are loaded only on explicit request.
          Current EQ receipts remain available above without mounting this archive. */}
      {includeDiagnostics && (
        <div style={{ marginBottom: 8 }}>
          <button
            type="button"
            aria-expanded={showLegacyBassDiagnostics}
            onClick={() => setShowLegacyBassDiagnostics((open) => !open)}
            style={{ border: '1px solid #CBD5E1', borderRadius: 6, background: '#F8FAFC', color: '#334155', padding: '6px 10px', fontSize: 10, fontFamily: 'monospace', cursor: 'pointer' }}
          >
            {showLegacyBassDiagnostics ? 'Hide legacy physics investigations' : 'Load legacy physics investigations'}
          </button>
          {showLegacyBassDiagnostics && <BassDiagnosticsPanel
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
        </div>
      )}

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
        {frontTuningInstances.length > 0 && (
          <div>
            <div className="text-sm font-medium text-[#1B1A1A] mb-3">Front Subwoofer Tuning</div>
            <SubTuningControls
              instances={frontTuningInstances}
              groupLabel="Front"
              showManualDelay={true}
              onCalibrationChange={(instanceId, calibration) => compat.setInstanceCalibration(instanceId, calibration)}
            />
          </div>
        )}

        {rearTuningInstances.length > 0 && (
          <div>
            <div className="text-sm font-medium text-[#1B1A1A] mb-3">Rear Subwoofer Tuning</div>
            <SubTuningControls
              instances={rearTuningInstances}
              groupLabel="Rear"
              showManualDelay={true}
              onCalibrationChange={(instanceId, calibration) => compat.setInstanceCalibration(instanceId, calibration)}
            />
          </div>
        )}
      </div>

    </div>
  );
}