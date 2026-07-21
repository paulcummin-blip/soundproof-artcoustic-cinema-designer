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
  const anchorDb = optimisationResult?.selectedP14TargetDb;
  const postEq = optimisationResult?.finalPostEqCurve;
  if (!candidate || !Number.isFinite(anchorDb) || !Array.isArray(postEq)) return null;
  const endHz = candidate.assessmentEndHz;
  return {
    id: "house-curve",
    kind: "house-curve",
    label: `Absolute house-curve target — P19 band 20–${Math.round(endHz)} Hz`,
    tooltipLabel: "Absolute house-curve target",
    color: "#625143",
    strokeWidth: 2.25,
    strokeDasharray: "10 5",
    data: postEq
      .filter(({ frequency }) => frequency >= 20 && frequency <= endHz)
      .map(({ frequency }) => ({ frequency, spl: anchorDb + artcousticHouseCurveOffsetAt(frequency) })),
  };
}

export function buildBassGraphSeries({
  designEqEnabled, showHouseCurve, normalizedSeries, rspRawCurve = [], optimisationResult,
  hasMatchingDetailedResult, multiSeries = [], showRealSeatOverlays, smoothingMode = "none",
  overlayProductionSeries, showRewOverlay, rewOverlaySeries,
}) {
  let series;
  if (!designEqEnabled) {
    series = normalizedSeries
      ? [{ ...normalizedSeries, data: applyBassSmoothing(normalizedSeries.data, smoothingMode) }]
      : [];
    const target = showHouseCurve ? buildNormalizedHouseCurveSeries(normalizedSeries) : null;
    if (target) series.push(target);
  } else {
    series = rspRawCurve.length ? [rawRspSeries(rspRawCurve, smoothingMode)] : [];
    if (hasMatchingDetailedResult && optimisationResult?.finalPostEqCurve?.length) {
      series.push({
        id: "rsp-eq", kind: "post-eq", label: "RSP after EQ", tooltipLabel: "RSP after EQ",
        color: "#16A34A", strokeWidth: 2.5,
        data: applyBassSmoothing(optimisationResult.finalPostEqCurve, smoothingMode),
      });
      if (showRealSeatOverlays) {
        series.push(...multiSeries.filter(({ id }) => id !== "rsp").map((item) => ({
          ...item, kind: "real-seat-overlay", strokeWidth: 1.25, strokeOpacity: 0.5,
          data: applyBassSmoothing(item.data, smoothingMode),
        })));
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