import { applyBassSmoothing } from "@/components/room/bass/bassGraphSmoothing";
import { isReferenceSeatIdentity } from "@/components/room/bass/normalizedRoomInputAdapters";
import { interpolateCanonicalTarget } from "@/components/utils/houseCurveTargetAuthority";
import { levelP19_lfResponse, levelP20_lfConsistency, numericRp22Level } from "@/components/utils/rp22/levels";

const finite = (value) => value !== null && value !== "" && Number.isFinite(Number(value));

function normalizedCurve(curve) {
  return (Array.isArray(curve) ? curve : [])
    .filter((point) => finite(point?.frequency) && finite(point?.spl))
    .map((point) => ({ frequency: Number(point.frequency), spl: Number(point.spl) }))
    .sort((left, right) => left.frequency - right.frequency);
}

function smoothedAssessmentCurve(curve, startHz, endHz) {
  return applyBassSmoothing(normalizedCurve(curve), "third")
    .filter((point) => point.frequency >= startHz && point.frequency <= endHz && finite(point.spl));
}

function curveValueAt(curve, frequency) {
  if (!curve.length) return null;
  if (frequency < curve[0].frequency || frequency > curve[curve.length - 1].frequency) return null;
  if (frequency === curve[0].frequency) return curve[0].spl;
  if (frequency === curve[curve.length - 1].frequency) return curve[curve.length - 1].spl;
  for (let index = 0; index < curve.length - 1; index += 1) {
    const low = curve[index];
    const high = curve[index + 1];
    if (frequency < low.frequency || frequency > high.frequency) continue;
    const span = high.frequency - low.frequency;
    if (span === 0) return low.spl;
    const ratio = (frequency - low.frequency) / span;
    return low.spl + (high.spl - low.spl) * ratio;
  }
  return null;
}

function maximumTargetDeviation(curve, targetCurve, excludedRegions = []) {
  let variationDbRaw = null;
  let worstFrequencyHz = null;
  curve.forEach((point) => {
    if (excludedRegions.some((region) => point.frequency >= region.startHz && point.frequency <= region.endHz)) return;
    const targetSpl = interpolateCanonicalTarget(targetCurve, point.frequency);
    if (!finite(targetSpl)) return;
    // RP22 ±dB is the maximum absolute deviation from the target curve.
    // A +4 dB peak (or -4 dB dip) is a ±4 dB result — not halved to ±2 dB.
    const deviation = Math.abs(point.spl - targetSpl);
    if (variationDbRaw == null || deviation > variationDbRaw) {
      variationDbRaw = deviation;
      worstFrequencyHz = point.frequency;
    }
  });
  const displayVariationDb = variationDbRaw == null ? null : Number(variationDbRaw);
  return {
    variationDbRaw,
    totalRspToTargetDifferenceDbRaw: variationDbRaw == null ? null : Number(variationDbRaw),
    displayVariationDb,
    level: displayVariationDb == null ? null : numericRp22Level(levelP19_lfResponse(displayVariationDb)),
    worstFrequencyHz,
  };
}

export function computeOfficialP19Assessment({ rspPostEqCurve, canonicalTargetCurve, assessmentStartHz, assessmentEndHz }) {
  const sourceCurve = smoothedAssessmentCurve(rspPostEqCurve, assessmentStartHz, assessmentEndHz);
  const result = maximumTargetDeviation(sourceCurve, canonicalTargetCurve);
  return { ...result, sourceCurve, label: "P19 RSP" };
}

/**
 * Per-seat P19 assessment — same maximumTargetDeviation maths as the RSP P19,
 * applied to each real seat's post-EQ curve versus the canonical target.
 * Returns an array of per-seat P19 results with seatId, level, variationDbRaw.
 */
export function computeOfficialPerSeatP19Assessment({ perSeatPostEqCurves, canonicalTargetCurve, assessmentStartHz, assessmentEndHz }) {
  return (Array.isArray(perSeatPostEqCurves) ? perSeatPostEqCurves : [])
    .filter((seat) => seat?.seatId && !isReferenceSeatIdentity(seat))
    .map((seat) => {
      const seatCurve = smoothedAssessmentCurve(seat.responseData, assessmentStartHz, assessmentEndHz);
      if (!seatCurve.length) return null;
      const result = maximumTargetDeviation(seatCurve, canonicalTargetCurve);
      if (result.variationDbRaw == null) return null;
      return {
        seatId: seat.seatId,
        variationDbRaw: result.variationDbRaw,
        totalRspToTargetDifferenceDbRaw: result.totalRspToTargetDifferenceDbRaw,
        displayVariationDb: result.displayVariationDb,
        level: result.level,
        worstFrequencyHz: result.worstFrequencyHz,
      };
    })
    .filter(Boolean);
}

export function computeCorrectableP19Diagnostic({ rspPostEqCurve, canonicalTargetCurve, assessmentStartHz, assessmentEndHz, protectedNullRegions = [] }) {
  const sourceCurve = smoothedAssessmentCurve(rspPostEqCurve, assessmentStartHz, assessmentEndHz);
  const result = maximumTargetDeviation(sourceCurve, canonicalTargetCurve, protectedNullRegions);
  return { ...result, sourceCurve, label: "Correctable P19 — optimiser diagnostic" };
}

export function p20LevelFromDisplayVariation(displayVariationDb) {
  if (!finite(displayVariationDb)) return null;
  return numericRp22Level(levelP20_lfConsistency(Number(displayVariationDb)));
}

export function computeOfficialP20Assessment({ rspPostEqCurve, perSeatPostEqCurves, assessmentStartHz, assessmentEndHz }) {
  const rspCurve = smoothedAssessmentCurve(rspPostEqCurve, assessmentStartHz, assessmentEndHz);
  if (!rspCurve.length) return { available: false, perSeatResults: [], worstSeat: null, label: "P20 worst seat" };
  const perSeatResults = (Array.isArray(perSeatPostEqCurves) ? perSeatPostEqCurves : [])
    .filter((seat) => seat?.seatId && !isReferenceSeatIdentity(seat))
    .map((seat) => {
      const seatCurve = smoothedAssessmentCurve(seat.responseData, assessmentStartHz, assessmentEndHz);
      let variationDbRaw = null;
      let worstFrequencyHz = null;
      let comparisonPointCount = 0;
      rspCurve.forEach((rspPoint) => {
        const seatSpl = curveValueAt(seatCurve, rspPoint.frequency);
        if (!finite(rspPoint.spl) || !finite(seatSpl)) return;
        comparisonPointCount += 1;
        // RP22 ±dB is the maximum absolute seat-to-RSP deviation.
        // An 8 dB difference is ±8 dB — not halved to ±4 dB.
        const variation = Math.abs(seatSpl - rspPoint.spl);
        if (variationDbRaw == null || variation > variationDbRaw) {
          variationDbRaw = variation;
          worstFrequencyHz = rspPoint.frequency;
        }
      });
      if (comparisonPointCount === 0 || variationDbRaw == null) return null;
      const displayVariationDb = Number(variationDbRaw);
      return {
        seatId: seat.seatId,
        variationDbRaw,
        totalSeatToRspDifferenceDbRaw: Number(variationDbRaw),
        displayVariationDb,
        level: p20LevelFromDisplayVariation(displayVariationDb),
        worstFrequencyHz,
        comparisonPointCount,
      };
    })
    .filter(Boolean);
  const worstSeat = perSeatResults.reduce((worst, seat) => (
    !worst || seat.variationDbRaw > worst.variationDbRaw ? seat : worst
  ), null);
  return { available: perSeatResults.length > 0, perSeatResults, worstSeat, label: "P20 worst seat" };
}