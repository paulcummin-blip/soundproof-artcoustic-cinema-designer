import { applyBassSmoothing } from "./bassGraphSmoothing";
import { artcousticHouseCurveOffsetAt } from "@/components/utils/artcousticHouseCurve";

export const NORMALIZED_ROOM_REFERENCE_DB = 94;

const shiftCurve = (curve, offsetDb) => (curve || []).map((point) => ({
  ...point,
  spl: Number.isFinite(point?.spl) ? point.spl + offsetDb : point?.spl,
}));

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
  const p14TotalDb = Number.isFinite(optimisationResult?.selectedP14TargetDb)
    ? Math.round(optimisationResult.selectedP14TargetDb)
    : null;
  const label = p14TotalDb != null
    ? `House-curve target · ${p14TotalDb} dBC total`
    : `Absolute house-curve target — correction band ${Math.round(startHz)}–${Math.round(endHz)} Hz`;
  return {
    id: "house-curve",
    kind: "house-curve",
    label,
    tooltipLabel: `House-curve target · correction band ${Math.round(startHz)}–${Math.round(endHz)} Hz`,
    color: "#625143",
    strokeWidth: 2.25,
    strokeDasharray: "10 5",
    data: exactTarget,
  };
}

function buildMaximumSplSeries(finalResponse, smoothingMode) {
  const curve = finalResponse?.maximumSplCurveAfterEq;
  if (!Array.isArray(curve) || !curve.length) return null;
  return {
    id: "maximum-spl-after-eq",
    kind: "maximum-spl",
    label: "Maximum available SPL after EQ headroom",
    tooltipLabel: "Maximum available SPL after EQ headroom",
    color: "#B45309",
    strokeWidth: 2,
    strokeDasharray: "2 4",
    data: applyBassSmoothing(curve, smoothingMode),
  };
}

export function buildBassGraphSeries({
  designEqEnabled, showHouseCurve, normalizedSeries, rspRawCurve = [], optimisationResult,
  hasMatchingDetailedResult, multiSeries = [], selectedSeatIds = [], showRealSeatOverlays, smoothingMode = "none",
  overlayProductionSeries, showRewOverlay, rewOverlaySeries, operatingLevelOffsetDb = 0,
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
    // Blue curve authority: use the stored rspBeforePeqAtOperatingLevel when
    // available (the level-normalised curve from the optimiser). Do NOT
    // independently reconstruct the same curve with a separate render-time shift.
    const storedRspBeforePeq = finalResponse?.rspBeforePeqAtOperatingLevel;
    const hasStoredBlueCurve = Array.isArray(storedRspBeforePeq) && storedRspBeforePeq.length > 0;
    series = seatValidationActive
      ? selectedRawSeats.map((seat) => ({ ...seat, id: `${seat.id}-raw`, kind: "raw", label: `${seat.id} before EQ`, tooltipLabel: `${seat.id} before EQ`, strokeDasharray: "6 4", strokeWidth: 1.5, data: applyBassSmoothing(seat.data, smoothingMode) }))
      : (hasStoredBlueCurve
        ? [{ id: "rsp-raw", kind: "raw", label: "RSP before PEQ", tooltipLabel: "RSP before PEQ at operating level", color: "#64748B", strokeWidth: 1.75, strokeDasharray: "6 4", data: applyBassSmoothing(storedRspBeforePeq, smoothingMode) }]
        : (rspRawCurve.length ? [rawRspSeries(rspRawCurve, smoothingMode)] : []));
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
        const selectedProfile = optimisationResult?.selectedCandidate?.designEqFitProfile;
        const isIdentityCandidate = selectedProfile === "identity";
        const isSalvagedCandidate = typeof selectedProfile === "string"
          && (selectedProfile.endsWith("_sanitised") || selectedProfile.endsWith("_cut_only"));
        series.push({ id: "rsp-eq", kind: "post-eq",
          label: isIdentityCandidate ? "RSP after EQ (No EQ applied)" : "RSP after EQ",
          tooltipLabel: isIdentityCandidate ? "RSP after EQ — no Design EQ applied"
            : isSalvagedCandidate ? "RSP after EQ — partial EQ bank applied"
            : "RSP after EQ",
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
      const maximumSpl = buildMaximumSplSeries(finalResponse, smoothingMode);
      if (maximumSpl) series.push(maximumSpl);
      // When using the stored blue curve, it is already at the operating level —
      // no render-time shift needed. Only apply the shift when falling back to
      // the unnormalised rspRawCurve (legacy path without stored curve).
      if (!hasStoredBlueCurve) {
        series = series.map((item) => item.kind === "raw"
          ? { ...item, data: shiftCurve(item.data, operatingLevelOffsetDb) }
          : item);
      }
    }
    if (overlayProductionSeries) series.push(overlayProductionSeries);
  }
  if (showRewOverlay && rewOverlaySeries) series.push(rewOverlaySeries);
  return series;
}

export function detailedEqStatusText({ designEqEnabled, hasMatchingDetailedResult, detailedStatus, optimisationResult, error }) {
  if (!designEqEnabled) return "Showing product-independent normalized room response (94 dB flat reference) — not predicted product SPL";
  if (hasMatchingDetailedResult) {
    const selectedProfile = optimisationResult?.selectedCandidate?.designEqFitProfile;
    if (selectedProfile === "identity") {
      return "No physically valid EQ bank was available. Results show the achieved response without Design EQ.";
    }
    if (typeof selectedProfile === "string"
      && (selectedProfile.endsWith("_sanitised") || selectedProfile.endsWith("_cut_only"))) {
      return "A physically safe partial EQ bank was applied. Some target corrections were omitted because they exceeded product or protected-null limits.";
    }
    return optimisationResult?.isBestCalibratedAttempt
      ? "BEST CALIBRATED ATTEMPT — LEVEL 1 NOT ACHIEVED"
      : "BASS OPTIMISER VALIDATION ACTIVE — showing matching product-aware EQ result";
  }
  if (detailedStatus === "CALCULATING") return "Calculating detailed EQ… showing current product-aware RSP before EQ";
  if (detailedStatus === "QUEUED") return "Detailed EQ queued… showing current product-aware RSP before EQ";
  if (detailedStatus === "OUT_OF_DATE") return "Design changed — recalculating detailed EQ… stale result hidden";
  if (detailedStatus === "ERROR") return `Detailed EQ error${error ? `: ${error}` : ""}`;
  return "Waiting for detailed EQ… showing current product-aware RSP before EQ";
}