import { applyBassSmoothing } from "./bassGraphSmoothing";
import { artcousticHouseCurveOffsetAt } from "@/components/utils/artcousticHouseCurve";
import { buildGraphSourceIdentity } from "./graphSourceIdentity";

export const NORMALIZED_ROOM_REFERENCE_DB = 94;

const shiftCurve = (curve, offsetDb) => (curve || []).map((point) => ({
  ...point,
  spl: Number.isFinite(point?.spl) ? point.spl + offsetDb : point?.spl,
}));

const finite = (value) => value !== null && value !== "" && Number.isFinite(Number(value));

const cleanCurve = (curve) => (Array.isArray(curve) ? curve : [])
  .filter((point) => finite(point?.frequency) && finite(point?.spl))
  .map((point) => ({ frequency: Number(point.frequency), spl: Number(point.spl) }))
  .sort((left, right) => left.frequency - right.frequency);

const interpolateCurve = (curve, frequency) => {
  if (!curve.length || frequency < curve[0].frequency || frequency > curve[curve.length - 1].frequency) return null;
  if (frequency === curve[0].frequency) return curve[0].spl;
  if (frequency === curve[curve.length - 1].frequency) return curve[curve.length - 1].spl;
  const upperIndex = curve.findIndex((point) => point.frequency >= frequency);
  if (upperIndex <= 0) return curve[0].spl;
  const low = curve[upperIndex - 1];
  const high = curve[upperIndex];
  const ratio = (frequency - low.frequency) / (high.frequency - low.frequency);
  return low.spl + (high.spl - low.spl) * ratio;
};

function buildRoomResponseSeries(normalizedSeries, smoothingMode, optimisationResult) {
  if (!normalizedSeries?.data?.length) return null;
  const sourceDiagnostics = optimisationResult?.selectedCandidate?.pairedP14P18Authority?.sources?.sourceDiagnostics;
  const selectedLayout = optimisationResult?.finalOptimisedBassResponse?.selectedSubwooferLayout;
  const sourceCount = Math.max(
    1,
    Array.isArray(sourceDiagnostics) && sourceDiagnostics.length
      ? sourceDiagnostics.length
      : (Array.isArray(selectedLayout) && selectedLayout.length ? selectedLayout.length : 1),
  );
  const systemPowerReferenceDb = NORMALIZED_ROOM_REFERENCE_DB + 10 * Math.log10(sourceCount);
  return {
    id: "room-response",
    kind: "room-response",
    label: "Room / layout response · reference only",
    tooltipLabel: `Room / layout response · ${sourceCount} flat 94 dB source${sourceCount === 1 ? "" : "s"}`,
    referenceDb: NORMALIZED_ROOM_REFERENCE_DB,
    sourceCount,
    systemPowerReferenceDb,
    color: "#7C3AED",
    strokeWidth: 1.75,
    strokeDasharray: "5 4",
    data: applyBassSmoothing(normalizedSeries.data, smoothingMode),
  };
}

export function buildProductMaximumSplSeries(optimisationResult, smoothingMode = "none") {
  const diagnostics = optimisationResult?.selectedCandidate?.pairedP14P18Authority?.sources?.sourceDiagnostics;
  const sourceCurves = (Array.isArray(diagnostics) ? diagnostics : [])
    .map((source) => cleanCurve(source?.capabilityCurve))
    .filter((curve) => curve.length >= 2);
  if (!sourceCurves.length) return null;

  const sharedStartHz = Math.max(...sourceCurves.map((curve) => curve[0].frequency));
  const sharedEndHz = Math.min(...sourceCurves.map((curve) => curve[curve.length - 1].frequency));
  if (!finite(sharedStartHz) || !finite(sharedEndHz) || sharedEndHz <= sharedStartHz) return null;

  const frequencies = [...new Set(sourceCurves
    .flatMap((curve) => curve.map((point) => point.frequency))
    .filter((frequency) => frequency >= sharedStartHz && frequency <= sharedEndHz))]
    .sort((left, right) => left - right);
  const productMaximum = frequencies.map((frequency) => {
    const sourceValues = sourceCurves.map((curve) => interpolateCurve(curve, frequency));
    if (sourceValues.some((value) => !finite(value))) return null;
    return {
      frequency,
      spl: 10 * Math.log10(sourceValues.reduce((sum, value) => sum + Math.pow(10, Number(value) / 10), 0)),
    };
  }).filter(Boolean);
  if (!productMaximum.length) return null;

  return {
    id: "product-maximum",
    kind: "product-maximum",
    label: "Subwoofer maximum · before room",
    tooltipLabel: "Power-summed maximum product capability · room excluded",
    color: "#2563EB",
    strokeWidth: 2,
    strokeDasharray: "8 4",
    data: applyBassSmoothing(productMaximum, smoothingMode),
  };
}

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
  // C6.2A2: consume all source identity from the shared helper (once).
  const graphIdentity = buildGraphSourceIdentity(optimisationResult);
  return {
    id: "house-curve",
    kind: "house-curve",
    label,
    tooltipLabel: `House-curve target · correction band ${Math.round(startHz)}–${Math.round(endHz)} Hz`,
    color: "#625143",
    strokeWidth: 2.25,
    strokeDasharray: "10 5",
    data: exactTarget,
    sourceTargetCurveHash: graphIdentity?.targetCurveHash || null,
    sourceCandidateId: graphIdentity?.candidateId || null,
    sourceFingerprint: graphIdentity?.fingerprint || null,
    sourceCalibrationFingerprint: graphIdentity?.calibrationFingerprint || null,
  };
}

function buildMaximumSplSeries(finalResponse, smoothingMode) {
  const curve = finalResponse?.maximumSplCurveAfterEq;
  if (!Array.isArray(curve) || !curve.length) return null;
  const safetyMarginDb = Number.isFinite(Number(finalResponse?.maximumSplSafetyMarginDb))
    ? Number(finalResponse.maximumSplSafetyMarginDb)
    : 0;
  return {
    id: "maximum-spl-after-eq",
    kind: "maximum-spl",
    label: `Usable in-room maximum · ${safetyMarginDb.toFixed(0)} dB reserve`,
    tooltipLabel: `Usable in-room maximum · product + room/layout − ${safetyMarginDb.toFixed(0)} dB reserve`,
    safetyMarginDb,
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
  // C6.2A2: consume all source identity from the shared helper (once per scope).
  const graphIdentity = buildGraphSourceIdentity(optimisationResult);
  let series;
  if (!designEqEnabled) {
    // The simulation graph is always product-aware. Disabling Design EQ must
    // not replace the physical response with a 94 dB normalized diagnostic.
    series = rspRawCurve.length ? [rawRspSeries(rspRawCurve, smoothingMode)] : [];
    const target = showHouseCurve ? buildAbsoluteHouseCurveSeries(optimisationResult) : null;
    if (target) series.push(target);
  } else {
    const selectedRealIds = selectedSeatIds.filter((id) => id !== "rsp");
    const selectedRawSeats = selectedRealIds.map((id) => multiSeries.find((item) => item.id === id)).filter(Boolean);
    const postEqBySeat = new Map((finalResponse?.postEqPerSeatCurves || []).map((seat) => [seat.seatId, seat]));
    const seatValidationActive = selectedRawSeats.length > 0;
    // Blue curve authority: the product-aware physical response from the
    // room engine. The RP22 target is demand only and must never vertically
    // normalise this curve.
    const storedRspBeforePeq = finalResponse?.physicalRawResponseCurve;
    const hasStoredBlueCurve = Array.isArray(storedRspBeforePeq) && storedRspBeforePeq.length > 0;
    series = seatValidationActive
      ? selectedRawSeats.map((seat) => ({ ...seat, id: `${seat.id}-raw`, kind: "raw", label: `${seat.id} before EQ`, tooltipLabel: `${seat.id} before EQ`, strokeDasharray: "6 4", strokeWidth: 1.5, data: applyBassSmoothing(seat.data, smoothingMode) }))
      : (hasStoredBlueCurve
        ? [{ id: "rsp-raw", kind: "raw", label: "Physical RSP before EQ", tooltipLabel: "Product-aware physical RSP before EQ", color: "#64748B", strokeWidth: 1.75, strokeDasharray: "6 4", data: applyBassSmoothing(storedRspBeforePeq, smoothingMode) }]
        : (rspRawCurve.length ? [rawRspSeries(rspRawCurve, smoothingMode)] : []));
    const roomResponse = buildRoomResponseSeries(normalizedSeries, smoothingMode, optimisationResult);
    if (roomResponse) series.push(roomResponse);
    if (hasMatchingDetailedResult && finalResponse?.postEqRspCurve?.length) {
      if (seatValidationActive) {
        series.push(...selectedRawSeats.map((seat, index) => {
          const postEq = postEqBySeat.get(seat.id);
          if (!postEq) return null;
          return { id: `${seat.id}-eq`, kind: "post-eq", label: `${seat.id} after EQ`, tooltipLabel: `${seat.id} after EQ`,
            candidateId: finalResponse.selectedCandidateId, filterBankSignature: finalResponse.filterBankSignature,
            sourcePostEqCurveHash: graphIdentity?.postEqCurveHash || null,
            sourceCandidateId: graphIdentity?.candidateId || null,
            sourceFilterBankSignature: graphIdentity?.filterBankSignature || null,
            sourceFingerprint: graphIdentity?.fingerprint || null,
            sourceCalibrationFingerprint: graphIdentity?.calibrationFingerprint || null,
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
          sourcePostEqCurveHash: graphIdentity?.postEqCurveHash || null,
          sourceCandidateId: graphIdentity?.candidateId || null,
          sourceFilterBankSignature: graphIdentity?.filterBankSignature || null,
          sourceFingerprint: graphIdentity?.fingerprint || null,
          sourceCalibrationFingerprint: graphIdentity?.calibrationFingerprint || null,
          color: "#16A34A", strokeWidth: 2.5, data: applyBassSmoothing(finalResponse.postEqRspCurve, smoothingMode) });
        if (showRealSeatOverlays) series.push(...finalResponse.postEqPerSeatCurves
          .filter((seat) => multiSeries.some((item) => item.id === seat.seatId))
          .map((seat, index) => ({ id: seat.seatId, kind: "real-seat-overlay", label: `${seat.seatId} after EQ`, tooltipLabel: `${seat.seatId} after EQ`,
            candidateId: finalResponse.selectedCandidateId, filterBankSignature: finalResponse.filterBankSignature,
            color: multiSeries.find((item) => item.id === seat.seatId)?.color || ["#213428", "#625143", "#8B7F76", "#A67C52", "#6B8A8F", "#7E8B6F"][index % 6],
            strokeWidth: 1.25, strokeOpacity: 0.5, data: applyBassSmoothing(seat.responseData, smoothingMode) })));
      }
      const productMaximum = buildProductMaximumSplSeries(optimisationResult, smoothingMode);
      if (productMaximum) series.push(productMaximum);
      const target = showHouseCurve ? buildAbsoluteHouseCurveSeries(optimisationResult) : null;
      if (target) series.push(target);
      const maximumSpl = buildMaximumSplSeries(finalResponse, smoothingMode);
      if (maximumSpl) series.push(maximumSpl);
      // Raw curves remain in the physical product/room domain. No target- or
      // operating-level render-time shift is permitted.
    }
    if (overlayProductionSeries) series.push(overlayProductionSeries);
  }
  if (showRewOverlay && rewOverlaySeries) series.push(rewOverlaySeries);
  return series;
}

export function detailedEqStatusText({ designEqEnabled, hasMatchingDetailedResult, detailedStatus, optimisationResult, error }) {
  if (!designEqEnabled) return "Showing the product-aware physical RSP before EQ";
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