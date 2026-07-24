import { applyBassSmoothing } from "./bassGraphSmoothing";
import { artcousticHouseCurveOffsetAt } from "@/components/utils/artcousticHouseCurve";

export const NORMALIZED_ROOM_REFERENCE_DB = 94;

const rawRspSeries = (rspRawCurve, smoothingMode) => ({
  id: "rsp-raw",
  kind: "raw",
  label: "RSP before EQ",
  tooltipLabel: "RSP before EQ",
  color: "#64748B",
  strokeWidth: 1.75,
  strokeDasharray: "6 4",
  data: applyBassSmoothing(rspRawCurve, smoothingMode),
});

export function isMatchingDetailedResult(status, result, fingerprint) {
  return status === "COMPLETE" && result?.calibrationFingerprint === fingerprint && !!result.pool;
}

export function buildNormalizedHouseCurveSeries(normalizedSeries) {
  if (!normalizedSeries?.data?.length) return null;
  return {
    id: "normalized-house-curve",
    kind: "normalized-target",
    label: "Normalized house-curve target — 94 dB reference, not predicted product SPL",
    tooltipLabel: "Normalized house-curve target (94 dB reference) — not predicted product SPL",
    color: "#625143",
    strokeWidth: 2.25,
    strokeDasharray: "10 5",
    data: normalizedSeries.data.map(({ frequency }) => ({
      frequency,
      spl: NORMALIZED_ROOM_REFERENCE_DB + artcousticHouseCurveOffsetAt(frequency),
    })),
  };
}

export function buildAbsoluteHouseCurveSeries(optimisationResult) {
  const candidate = optimisationResult?.selectedCandidate;
  const exactTarget = candidate?.productionHouseCurveTarget;
  if (!candidate || !Array.isArray(exactTarget) || !exactTarget.length) return null;
  const startHz = candidate.correctionStartHz;
  const endHz = candidate.correctionEndHz;
  return {
    id: "house-curve",
    kind: "house-curve",
    label: `Absolute house-curve target — correction band ${Math.round(startHz)}–${Math.round(endHz)} Hz`,
    tooltipLabel: "Absolute house-curve target",
    color: "#625143",
    strokeWidth: 2.25,
    strokeDasharray: "10 5",
    data: exactTarget,
  };
}

export function buildBassGraphSeries({
  designEqEnabled, showHouseCurve, normalizedSeries, rspRawCurve = [], optimisationResult,
  hasMatchingDetailedResult, multiSeries = [], selectedSeatIds = [], showRealSeatOverlays, smoothingMode = "none",
  overlayProductionSeries, showRewOverlay, rewOverlaySeries,
}) {
  const finalResponse = optimisationResult?.finalOptimisedBassResponse;
  let series;
  if (!designEqEnabled) {
    series = normalizedSeries
      ? [{ ...normalizedSeries, data: applyBassSmoothing(normalizedSeries.data, smoothingMode) }]
      : [];
    const target = showHouseCurve ? buildNormalizedHouseCurveSeries(normalizedSeries) : null;
    if (target) series.push(target);
  } else {
    const selectedRealIds = selectedSeatIds.filter((id) => id !== "rsp");
    const selectedRawSeats = selectedRealIds.map((id) => multiSeries.find((item) => item.id === id)).filter(Boolean);
    const postEqBySeat = new Map((finalResponse?.postEqPerSeatCurves || []).map((seat) => [seat.seatId, seat]));
    const seatValidationActive = selectedRawSeats.length > 0;
    series = seatValidationActive
      ? selectedRawSeats.map((seat) => ({ ...seat, id: `${seat.id}-raw`, kind: "raw", label: `${seat.id} before EQ`, tooltipLabel: `${seat.id} before EQ`, strokeDasharray: "6 4", strokeWidth: 1.5, data: applyBassSmoothing(seat.data, smoothingMode) }))
      : (rspRawCurve.length ? [rawRspSeries(rspRawCurve, smoothingMode)] : []);
    if (hasMatchingDetailedResult && finalResponse?.postEqRspCurve?.length) {
      if (seatValidationActive) {
        series.push(...selectedRawSeats.map((seat, index) => {
          const postEq = postEqBySeat.get(seat.id);
          if (!postEq) return null;
          return { id: `${seat.id}-eq`, kind: "post-eq", label: `${seat.id} after EQ`, tooltipLabel: `${seat.id} after EQ`,
            candidateId: finalResponse.selectedCandidateId, filterBankSignature: finalResponse.filterBankSignature,
            color: seat.color || ["#213428", "#625143", "#8B7F76", "#A67C52", "#6B8A8F", "#7E8B6F"][index % 6],
            strokeWidth: 2.25, data: applyBassSmoothing(postEq.responseData, smoothingMode) };
        }).filter(Boolean));
      } else {
        series.push({ id: "rsp-eq", kind: "post-eq", label: "RSP after EQ", tooltipLabel: "RSP after EQ",
          candidateId: finalResponse.selectedCandidateId, filterBankSignature: finalResponse.filterBankSignature,
          color: "#16A34A", strokeWidth: 2.5, data: applyBassSmoothing(finalResponse.postEqRspCurve, smoothingMode) });
        if (showRealSeatOverlays) series.push(...finalResponse.postEqPerSeatCurves
          .filter((seat) => multiSeries.some((item) => item.id === seat.seatId))
          .map((seat, index) => ({ id: seat.seatId, kind: "real-seat-overlay", label: `${seat.seatId} after EQ`, tooltipLabel: `${seat.seatId} after EQ`,
            candidateId: finalResponse.selectedCandidateId, filterBankSignature: finalResponse.filterBankSignature,
            color: multiSeries.find((item) => item.id === seat.seatId)?.color || ["#213428", "#625143", "#8B7F76", "#A67C52", "#6B8A8F", "#7E8B6F"][index % 6],
            strokeWidth: 1.25, strokeOpacity: 0.5, data: applyBassSmoothing(seat.responseData, smoothingMode) })));
      }
      const target = showHouseCurve ? buildAbsoluteHouseCurveSeries(optimisationResult) : null;
      if (target) series.push(target);
    }
    if (overlayProductionSeries) series.push(overlayProductionSeries);
  }
  if (showRewOverlay && rewOverlaySeries) series.push(rewOverlaySeries);
  return series;
}

export function detailedEqStatusText({ designEqEnabled, hasMatchingDetailedResult, detailedStatus, optimisationResult, error }) {
  if (!designEqEnabled) return "Showing product-independent normalized room response (94 dB flat reference) — not predicted product SPL";
  if (hasMatchingDetailedResult) return optimisationResult?.isBestCalibratedAttempt
    ? "BEST CALIBRATED ATTEMPT — LEVEL 1 NOT ACHIEVED"
    : "BASS OPTIMISER VALIDATION ACTIVE — showing matching product-aware EQ result";
  if (detailedStatus === "CALCULATING") return "Calculating detailed EQ… showing current product-aware RSP before EQ";
  if (detailedStatus === "QUEUED") return "Detailed EQ queued… showing current product-aware RSP before EQ";
  if (detailedStatus === "OUT_OF_DATE") return "Design changed — recalculating detailed EQ… stale result hidden";
  if (detailedStatus === "ERROR") return `Detailed EQ error${error ? `: ${error}` : ""}`;
  return "Waiting for detailed EQ… showing current product-aware RSP before EQ";
}