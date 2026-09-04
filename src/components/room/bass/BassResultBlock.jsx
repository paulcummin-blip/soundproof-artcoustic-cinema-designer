import React, { useEffect, useMemo, useState } from "react";
import { useSharedBassResults } from "@/components/room/bass/bassResultsStore";
import { useAppState } from "@/components/AppStateProvider";
import BassGraph from "@/components/room/bass/BassGraph";
import BassResultsPills from "@/components/room/bass/BassResultsPills";
import BassDesignRecommendation from "@/components/room/bass/BassDesignRecommendation";
import BassCapabilitySummary from "@/components/room/bass/BassCapabilitySummary";
import SeatResponseScopeControls from "@/components/room/bass/SeatResponseScopeControls";
import BassCurveVisibilityControls, { DEFAULT_BASS_CURVE_VISIBILITY } from "@/components/room/bass/BassCurveVisibilityControls";
import { buildBassGraphSeries } from "@/components/room/bass/bassGraphDomainBuilder";
import { buildNormalizedSeries } from "@/components/room/bass/normalizedSeriesBuilder";
import { buildRp22GraphMarkers } from "@/components/room/bass/rp22GraphMarkers";
import { buildProtectedNullAnnotations } from "@/components/room/bass/protectedNullPresentation";
import { finalOptimisedBassAuthorityMatches } from "@/components/room/bass/finalOptimisedBassResponse";
import { resolveP14TargetSelectionState } from "@/components/room/bass/p14TargetSelectionState";
import { useActiveProjectId } from "@/components/state/project-session";
import { normaliseHouseCurveToP14Total } from "@/components/utils/p14HouseCurveNormalisation";

// BassResultBlock — presentation-only. Consumes the already-published authoritative
// result from the shared room analysis owner. No second simulation path: all data
// comes from useSharedBassResults(). The graph series are built with the same pure
// presentation function (buildBassGraphSeries) used by the Bass Simulation area.
//
// Order: P14/P18/P19/P20 pills → graph/seat curves → guidance.
// Gated by verified current authority (hasCurrentResult), not structural storage.
export default function BassResultBlock() {
  const shared = useSharedBassResults();
  const appState = useAppState();
  const activeProjectId = useActiveProjectId();
  const authoritative = shared?.authoritative;
  const optimisationResult = shared?.optimisationResult;
  const hasCurrentResult = shared?.hasCurrentResult === true;

  // --- Extract live authoritative data (same source as BassResponse) ---
  const rspRawCurve = authoritative?.rspRawCurve || [];
  const perSeatRawCurves = authoritative?.perSeatRawCurves || [];
  const simulationResults = authoritative?.simulationResults || { seatResponses: {} };
  const seatingPositions = shared?.seatingPositions || [];
  const rspPosition = authoritative?.rspPosition || null;
  const normalizedLive = authoritative?.normalizedLive || { result: null, quality: null, isRefining: false };
  const bassSmoothingMode = authoritative?.bassSmoothingMode || "none";
  const designEqEnabled = appState?.designEqEnabled !== false;

  const p14Selection = resolveP14TargetSelectionState(authoritative?.requested);

  // --- Seat colour palette (stable, ordered) ---
  const SEAT_PALETTE = ["#213428", "#625143", "#8B7F76", "#A67C52", "#6B8A8F", "#7E8B6F"];
  const orderedSeats = useMemo(() => {
    if (!Array.isArray(seatingPositions)) return [];
    return [...seatingPositions].sort((a, b) => {
      const ra = Number(a?.row || a?.rowNumber) || 1;
      const rb = Number(b?.row || b?.rowNumber) || 1;
      if (ra !== rb) return ra - rb;
      const ia = Number(a?.indexInRow);
      const ib = Number(b?.indexInRow);
      const bothHaveIndex = Number.isFinite(ia) && ia > 0 && Number.isFinite(ib) && ib > 0;
      if (bothHaveIndex) return ia - ib;
      return (Number(a?.x) || 0) - (Number(b?.x) || 0);
    });
  }, [seatingPositions]);

  const getSeatColor = (seatId) => {
    const idx = orderedSeats.findIndex(s => (s.id || `${s.x}-${s.y}`) === seatId);
    return SEAT_PALETTE[Math.max(0, idx) % SEAT_PALETTE.length];
  };

  // --- Seat selection state (presentation-only, persisted per project) ---
  const responseSelectionKey = `bass-result-block-selection:${activeProjectId || "free"}`;
  const [selectedSeatIds, setSelectedSeatIds] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(responseSelectionKey) || "null");
      return Array.isArray(saved) && saved.length ? saved : ["rsp"];
    } catch { return ["rsp"]; }
  });

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

  const [showRsp, setShowRsp] = useState(true);
  const [curveVisibility, setCurveVisibility] = useState(DEFAULT_BASS_CURVE_VISIBILITY);

  const selectSeat = (sid) => {
    setShowRsp(false);
    setSelectedSeatIds([sid]);
  };
  const selectAllSeats = () => setSelectedSeatIds(orderedSeats.map((seat) => seat.id || `${seat.x}-${seat.y}`));
  const selectRsp = () => {
    setShowRsp(true);
    setSelectedSeatIds(["rsp"]);
  };

  // --- Build raw multi-series (RSP + selected seat raw curves) ---
  // Same logic as BassResponse — pure presentation, no calculation.
  const multiSeries = useMemo(() => {
    const responses = simulationResults.seatResponses;
    const storedSeatCurves = new Map((perSeatRawCurves || []).map((seat) => [seat.seatId, seat.responseData]));
    const series = [];

    if (showRsp && rspRawCurve.length > 0) {
      series.push({ id: "rsp", color: "#16A34A", data: rspRawCurve, kind: "rsp", label: "RSP" });
    }

    const requestedIds = selectedSeatIds.filter(id => id !== "rsp" && (storedSeatCurves.has(id) || responses[id]));
    requestedIds.forEach(sid => {
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

    return series;
  }, [selectedSeatIds, simulationResults.seatResponses, perSeatRawCurves, orderedSeats, showRsp, rspRawCurve]);

  // --- Build normalized series (pure presentation) ---
  const normalizedSeries = useMemo(
    () => buildNormalizedSeries(normalizedLive.result?.rspCurve, normalizedLive.quality, normalizedLive.isRefining),
    [normalizedLive.result, normalizedLive.quality, normalizedLive.isRefining]
  );

  // --- Build final graph series (same pure function as BassResponse) ---
  const finalBassResponse = optimisationResult?.finalOptimisedBassResponse;
  const hasValidDetailedResult = !!designEqEnabled
    && finalOptimisedBassAuthorityMatches(finalBassResponse) && rspRawCurve.length > 0;
  const selectedP14TargetDb = authoritative?.requested?.selectedP14TargetDb;
  const canonicalVerticalOffsetDb = finalBassResponse?.canonicalVerticalOffsetDb;
  const p14HouseCurveNormalisation = useMemo(() => normaliseHouseCurveToP14Total({
    houseCurveShape: finalBassResponse?.canonicalHouseCurveShape,
    selectedP14TargetDb,
    requiredExtensionHz: 20,
    upperLfeHz: 120,
  }), [finalBassResponse?.canonicalHouseCurveShape, selectedP14TargetDb]);
  const operatingLevelOffsetDb = Number.isFinite(finalBassResponse?.operatingLevelOffsetDb)
    ? finalBassResponse.operatingLevelOffsetDb
    : (Number.isFinite(p14HouseCurveNormalisation?.operatingCurveOffsetDb) && Number.isFinite(canonicalVerticalOffsetDb)
      ? p14HouseCurveNormalisation.operatingCurveOffsetDb - canonicalVerticalOffsetDb
      : 0);

  const multiSeriesForGraph = useMemo(() => buildBassGraphSeries({
    designEqEnabled, showHouseCurve: true, normalizedSeries, rspRawCurve, optimisationResult,
    hasMatchingDetailedResult: hasValidDetailedResult, multiSeries, selectedSeatIds,
    showRealSeatOverlays: false, smoothingMode: bassSmoothingMode,
    operatingLevelOffsetDb,
  }), [designEqEnabled, normalizedSeries, rspRawCurve, optimisationResult,
    hasValidDetailedResult, multiSeries, selectedSeatIds, bassSmoothingMode, operatingLevelOffsetDb]);

  const visibleMultiSeries = useMemo(() => multiSeriesForGraph.filter((series) => {
    if (series.kind === "room-response") return curveVisibility.room;
    if (series.kind === "product-maximum") return curveVisibility.product;
    if (series.kind === "maximum-spl") return curveVisibility.combined;
    if (series.kind === "house-curve" || series.kind === "normalized-target") return curveVisibility.house;
    if (series.kind === "post-eq" || series.kind === "real-seat-overlay") return curveVisibility.finalEq;
    if (series.kind === "raw") return false;
    return true;
  }), [multiSeriesForGraph, curveVisibility]);

  const rp22GraphMarkers = useMemo(() => buildRp22GraphMarkers(finalBassResponse), [finalBassResponse]);
  const protectedNullAnnotations = useMemo(() => buildProtectedNullAnnotations(
    optimisationResult?.selectedCandidate, [], rspRawCurve,
  ), [optimisationResult?.selectedCandidate, rspRawCurve]);

  if (!hasCurrentResult) return null;
  if (p14Selection.noP14TargetSelected) return null;

  const hasGraphData = visibleMultiSeries.length > 0;

  return (
    <div className="mt-4 space-y-3">
      {/* 1. P14 / P18 / P19 / P20 pills */}
      <BassResultsPills compact={false} nowMs={Date.now()} />

      {/* 2. Authoritative bass response graph + seat curves */}
      {hasGraphData && (
        <div style={{ border: "1px solid #DCDBD6", borderRadius: 12, background: "#FFFFFF", padding: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#1B1A1A", marginBottom: 8 }}>
            Bass Response
          </div>

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

          <div className="mt-2">
            <BassGraph
              multiSeries={visibleMultiSeries}
              responseData={(visibleMultiSeries.find((series) => series.kind === "post-eq") || visibleMultiSeries[0])?.data ?? []}
              schroederFrequency={authoritative?.optimisationTransitionHz || 0}
              rp22Levels={[]}
              toggles={{}}
              crossoverFrequency={80}
              showModeMarkers={false}
              modeMarkers={{ axial: [], tangential: [], oblique: [] }}
              protectedNullAnnotations={protectedNullAnnotations}
              linearHzAxis={false}
              rewStyleMode={true}
              yDomain={[70, 140]}
              xDomain={visibleMultiSeries[0]?.data?.some(p => p.frequency > 200) ? [15, 300] : [15, 200]}
              showAxialOnly={false}
              refDb={85}
              disableHighlight={false}
              renderToken={authoritative?.qStrategy || "ab_corrected"}
              p14TotalDb={selectedP14TargetDb}
              operatingLevelOffsetDb={operatingLevelOffsetDb}
              rp22Markers={rp22GraphMarkers}
            />
          </div>
        </div>
      )}

      {/* 3. Primary limitation / improvement guidance */}
      <BassCapabilitySummary
        capability={shared?.contract?.selectedCandidate?.postEqCapabilityAssessment}
        targetWarning={shared?.contract?.selectedCandidate?.targetWarning}
        p14Parameter={shared?.contract?.productAnalysis?.parameters?.p14}
      />
      <BassDesignRecommendation recommendation={shared?.contract?.designRecommendation} />
    </div>
  );
}