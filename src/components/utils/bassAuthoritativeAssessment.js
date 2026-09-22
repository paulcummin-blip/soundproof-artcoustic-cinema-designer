import { applyBassSmoothing } from "@/components/room/bass/bassGraphSmoothing";
import { isReferenceSeatIdentity } from "@/components/room/bass/normalizedRoomInputAdapters";
import { levelP20_lfConsistency, numericRp22Level } from "@/components/utils/rp22/levels";
import { evaluateP19AbsoluteTargetDeviation, evaluateP19ReferenceEqDeviation } from "@/components/utils/p19AbsoluteTargetDeviation";

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

// ── Canonical published P19 authority ──
//
// P19 is the maximum absolute deviation from the stored final calibrated RSP
// response (Reference EQ). The same evaluator is used for the RSP and every
// real seat. The RSP result is 0 dB because the stored response and reference
// are the same curve, not because of a grading exception.

export function computeOfficialP19Assessment({ rspPostEqCurve, referenceEqCurve, assessmentStartHz, assessmentEndHz, protectedNullRegions = [] }) {
  const result = evaluateP19ReferenceEqDeviation({
    responseCurve: rspPostEqCurve,
    referenceEqCurve,
    assessmentStartHz,
    assessmentEndHz,
    protectedNullRegions,
  });
  if (!result) return null;
  return { ...result, sourceCurve: result.sourceCurve, label: "P19 RSP vs Reference EQ" };
}

/**
 * Per-seat P19 assessment against the same stored Reference EQ.
 *
 * No per-seat centering or alternate target is applied. Each value is the
 * direct maximum absolute deviation between that calibrated seat response and
 * Reference EQ over the canonical assessment band.
 */
export function computeOfficialPerSeatP19Assessment({ perSeatPostEqCurves, referenceEqCurve, assessmentStartHz, assessmentEndHz, protectedNullRegions = [] }) {
  return (Array.isArray(perSeatPostEqCurves) ? perSeatPostEqCurves : [])
    .filter((seat) => seat?.seatId && !isReferenceSeatIdentity(seat))
    .map((seat) => {
      const result = evaluateP19ReferenceEqDeviation({
        responseCurve: seat.responseData,
        referenceEqCurve,
        assessmentStartHz,
        assessmentEndHz,
        protectedNullRegions,
      });
      if (!result || result.variationDbRaw == null) return null;
      return {
        seatId: seat.seatId,
        variationDbRaw: result.variationDbRaw,
        totalRspToTargetDifferenceDbRaw: result.variationDbRaw,
        displayVariationDb: result.variationDbRaw,
        level: result.level,
        worstFrequencyHz: result.worstFrequencyHz,
        comparisonPointCount: result.residualCurve.length,
      };
    })
    .filter(Boolean);
}

export function computeCorrectableP19Diagnostic({ rspPostEqCurve, canonicalTargetCurve, assessmentStartHz, assessmentEndHz, protectedNullRegions = [] }) {
  const result = evaluateP19AbsoluteTargetDeviation({
    rspPostEqCurve,
    canonicalTargetCurve,
    assessmentStartHz,
    assessmentEndHz,
    protectedNullRegions,
  });
  if (!result) return null;
  return { ...result, sourceCurve: result.sourceCurve, label: "Correctable P19 — optimiser diagnostic" };
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