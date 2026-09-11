import { applyBassSmoothing } from "@/components/room/bass/bassGraphSmoothing";
import { isReferenceSeatIdentity } from "@/components/room/bass/normalizedRoomInputAdapters";
import { artcousticHouseCurveOffsetAt } from "@/components/utils/artcousticHouseCurve";
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

/**
 * Canonical P19 span authority.
 *
 * residual(f) = smoothedResponse(f) − houseCurveShape(f)
 * spanDb = max(residual) − min(residual)
 * p19RawDb = spanDb / 2
 *
 * The house-curve SHAPE (artcousticHouseCurveOffsetAt) is used, not the
 * vertically-anchored target. A constant vertical offset shifts min and max
 * equally and leaves the span unchanged — so P19 is independent of target
 * centring.
 *
 * Protected null regions are excluded from the min/max so that narrow/deep
 * cancellations a calibrator would not equalise do not distort the span.
 */
function residualSpan(curve, excludedRegions = []) {
  let maxResidual = -Infinity;
  let minResidual = Infinity;
  let worstFrequencyHz = null;
  curve.forEach((point) => {
    if (excludedRegions.some((region) => point.frequency >= region.startHz && point.frequency <= region.endHz)) return;
    const shapeOffset = artcousticHouseCurveOffsetAt(point.frequency);
    if (!Number.isFinite(shapeOffset)) return;
    const residual = point.spl - shapeOffset;
    if (residual > maxResidual) {
      maxResidual = residual;
      worstFrequencyHz = point.frequency;
    }
    if (residual < minResidual) {
      minResidual = residual;
    }
  });
  if (!Number.isFinite(maxResidual) || !Number.isFinite(minResidual)) return null;
  const spanDb = maxResidual - minResidual;
  const p19RawDb = spanDb / 2;
  return {
    variationDbRaw: p19RawDb,
    totalRspToTargetDifferenceDbRaw: p19RawDb,
    displayVariationDb: p19RawDb,
    level: numericRp22Level(levelP19_lfResponse(p19RawDb)),
    worstFrequencyHz,
    spanDb,
    maxResidual,
    minResidual,
  };
}

export function computeOfficialP19Assessment({ rspPostEqCurve, canonicalTargetCurve, assessmentStartHz, assessmentEndHz }) {
  const sourceCurve = smoothedAssessmentCurve(rspPostEqCurve, assessmentStartHz, assessmentEndHz);
  const result = residualSpan(sourceCurve);
  return { ...result, sourceCurve, label: "P19 RSP" };
}

/**
 * Per-seat P19 assessment — same residualSpan maths as the RSP P19,
 * applied to each real seat's post-EQ curve.
 * Returns an array of per-seat P19 results with seatId, level, variationDbRaw.
 */
export function computeOfficialPerSeatP19Assessment({ perSeatPostEqCurves, canonicalTargetCurve, assessmentStartHz, assessmentEndHz }) {
  return (Array.isArray(perSeatPostEqCurves) ? perSeatPostEqCurves : [])
    .filter((seat) => seat?.seatId && !isReferenceSeatIdentity(seat))
    .map((seat) => {
      const seatCurve = smoothedAssessmentCurve(seat.responseData, assessmentStartHz, assessmentEndHz);
      if (!seatCurve.length) return null;
      const result = residualSpan(seatCurve);
      if (!result || result.variationDbRaw == null) return null;
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
  const result = residualSpan(sourceCurve, protectedNullRegions);
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
        // RP22 P20 ±dB is the maximum absolute seat-to-RSP deviation.
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