import { applyBassSmoothing } from "@/components/room/bass/bassGraphSmoothing";
import { isReferenceSeatIdentity } from "@/components/room/bass/normalizedRoomInputAdapters";
import { levelP19_lfResponse, levelP20_lfConsistency, numericRp22Level } from "@/components/utils/rp22/levels";
import { evaluateP19AbsoluteTargetDeviation, centerResidualForP19Assessment } from "@/components/utils/p19AbsoluteTargetDeviation";

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

// ── Canonical P19 authority ──
//
// P19 is the maximum absolute deviation from the P14-anchored practical
// calibration target after calibration, excluding protected null regions.
//
// The canonical evaluation lives in p19AbsoluteTargetDeviation.js and is
// shared by both this published assessment and the house-curve fitter.
// There is never a separate optimisation metric and reporting metric.
//
// Protected null regions are excluded from the max-abs scan so that narrow
// uncorrectable nulls a calibrator would not equalise do not cause a false
// FAIL. The exclusion uses isProtectedSmoothedFrequency (the smoothed-edge
// variant) exactly as the fitter does.

export function computeOfficialP19Assessment({ rspPostEqCurve, canonicalTargetCurve, assessmentStartHz, assessmentEndHz, protectedNullRegions = [] }) {
  const result = evaluateP19AbsoluteTargetDeviation({
    rspPostEqCurve,
    canonicalTargetCurve,
    assessmentStartHz,
    assessmentEndHz,
    protectedNullRegions,
  });
  if (!result) return null;
  return { ...result, sourceCurve: result.sourceCurve, label: "P19 RSP" };
}

/**
 * Per-seat P19 assessment — centered minimax ± deviation.
 *
 * Each seat's post-EQ response is smoothed and the residual (response −
 * canonical target) is computed by the same canonical primitive as the RSP
 * P19. The residual is then centered analytically so P19 measures
 * response-SHAPE deviation, not absolute-level error:
 *
 *   centeringDb   = -(maxResidual + minResidual) / 2
 *   p19VariationDb = (maxResidual - minResidual) / 2
 *
 * This centering is assessment normalisation only — it is NOT a physical EQ
 * filter, boost/cut request, or installed calibration setting. It is
 * unconstrained by P14 headroom because it measures shape, not operating
 * level. The RSP P19 path is unchanged (it uses performGlobalLevelAlignment).
 *
 * Protected null regions (identified on the RSP) are excluded from every
 * seat's centering and worst-frequency scan.
 *
 * Returns an array of per-seat P19 results with seatId, level, variationDbRaw,
 * worstFrequencyHz, centeringDb.
 */
export function computeOfficialPerSeatP19Assessment({ perSeatPostEqCurves, canonicalTargetCurve, assessmentStartHz, assessmentEndHz, protectedNullRegions = [] }) {
  return (Array.isArray(perSeatPostEqCurves) ? perSeatPostEqCurves : [])
    .filter((seat) => seat?.seatId && !isReferenceSeatIdentity(seat))
    .map((seat) => {
      const result = evaluateP19AbsoluteTargetDeviation({
        rspPostEqCurve: seat.responseData,
        canonicalTargetCurve,
        assessmentStartHz,
        assessmentEndHz,
        protectedNullRegions,
      });
      if (!result || result.variationDbRaw == null) return null;
      // Center the residual curve analytically (minimax ± deviation) so the
      // per-seat P19 measures shape, not the seat-specific constant offset
      // left by inheriting the RSP's global trim.
      const centered = centerResidualForP19Assessment(result.residualCurve);
      if (!centered || centered.variationDbRaw == null) return null;
      const level = numericRp22Level(levelP19_lfResponse(centered.variationDbRaw));
      return {
        seatId: seat.seatId,
        variationDbRaw: centered.variationDbRaw,
        totalRspToTargetDifferenceDbRaw: centered.variationDbRaw,
        displayVariationDb: centered.variationDbRaw,
        level,
        worstFrequencyHz: centered.worstFrequencyHz,
        // Assessment-only centering offset (diagnostic, NOT a physical trim).
        centeringDb: centered.centeringDb,
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