// provisionalCombinedAssessment.js
// ---------------------------------------------------------------------------
// PROVISIONAL P19/P20 for the combined LCR + subwoofer response.
//
// It reuses the existing canonical grading functions — it does not restate,
// reimplement or approximate any grading rule:
//   * P19  → computeCorrectableP19Diagnostic  (RSP-only, max |response − target|)
//   * P20  → computeOfficialP20Assessment     (worst seat to RSP deviation)
//   * band → resolveBassAssessmentBand        (P18 F3 → transition frequency)
//
// Both functions apply the existing third-octave smoothing and the existing
// RP22 level mapping internally, so the provisional figures are produced by the
// SAME authority the published result uses.
//
// This is a PROVISIONAL result and is never published. The subwoofer-only
// authority remains the published P19/P20.
// ---------------------------------------------------------------------------

import {
  computeCorrectableP19Diagnostic,
  computeOfficialP20Assessment,
} from "@/components/utils/bassAuthoritativeAssessment";
import { resolveBassAssessmentBand } from "@/components/utils/bassAssessmentBandAuthority";

const finite = (value) => value !== null && value !== "" && Number.isFinite(Number(value));

/**
 * Assess one set of per-seat curves with the canonical functions.
 * @returns {{ available: boolean, reason: string|null, p19: object|null, p20: object|null }}
 */
function assessCurves({ curvesBySeat, seatIds, primarySeatId, targetCurve, band }) {
  const rspCurve = curvesBySeat?.[primarySeatId];
  if (!Array.isArray(rspCurve) || rspCurve.length === 0) {
    return { available: false, reason: "no-reference-seat-curve", p19: null, p20: null };
  }
  const p19 = computeCorrectableP19Diagnostic({
    rspPostEqCurve: rspCurve,
    canonicalTargetCurve: targetCurve,
    assessmentStartHz: band.lowerHz,
    assessmentEndHz: band.upperHz,
  });
  const p20 = computeOfficialP20Assessment({
    rspPostEqCurve: rspCurve,
    perSeatPostEqCurves: seatIds
      .filter((seatId) => seatId !== primarySeatId)
      .map((seatId) => ({ seatId, responseData: curvesBySeat?.[seatId] || [] })),
    assessmentStartHz: band.lowerHz,
    assessmentEndHz: band.upperHz,
  });
  return {
    available: true,
    reason: null,
    p19: p19
      ? { variationDb: p19.variationDbRaw ?? null, level: p19.level ?? null, worstFrequencyHz: p19.worstFrequencyHz ?? null }
      : null,
    p20: p20?.available
      ? {
          level: p20.worstSeat?.level ?? null,
          variationDb: p20.worstSeat?.variationDbRaw ?? null,
          limitingSeatId: p20.worstSeat?.seatId ?? null,
          limitingFrequencyHz: p20.worstSeat?.worstFrequencyHz ?? null,
          perSeatResults: p20.perSeatResults || [],
        }
      : null,
  };
}

/**
 * Build the provisional combined-system assessment and its comparison against
 * the subwoofer-only result.
 *
 * @param {object} params
 * @param {object} params.combined                            buildCombinedSystemResponse output
 * @param {number|null} params.achievedP18Hz
 * @param {number|null} params.transitionHz
 * @param {Array} params.targetCurve                           canonical house/design target
 * @returns {object}
 */
export function buildProvisionalCombinedAssessment({
  combined,
  achievedP18Hz = null,
  transitionHz = null,
  targetCurve = null,
} = {}) {
  if (!combined?.available) {
    return { available: false, reason: combined?.reason || "combined-response-unavailable" };
  }
  const band = resolveBassAssessmentBand({ achievedP18Hz, transitionHz });
  if (!band.valid) {
    return { available: false, reason: band.reason || "assessment-band-unavailable", band };
  }
  if (!Array.isArray(targetCurve) || targetCurve.length === 0) {
    return { available: false, reason: "target-curve-unavailable", band };
  }

  const seatIds = Object.keys(combined.combinedBySeat || {});
  if (seatIds.length === 0) return { available: false, reason: "no-seats", band };
  const primarySeatId = combined.primarySeatId || seatIds[0];

  const combinedAssessment = assessCurves({
    curvesBySeat: combined.combinedBySeat,
    seatIds,
    primarySeatId,
    targetCurve,
    band,
  });
  const subOnlyAssessment = assessCurves({
    curvesBySeat: combined.subOnlyBySeat,
    seatIds,
    primarySeatId,
    targetCurve,
    band,
  });

  const delta = (a, b) => (finite(a) && finite(b) ? Number(a) - Number(b) : null);

  return {
    available: combinedAssessment.available,
    reason: combinedAssessment.reason,
    band,
    primarySeatId,
    seatCount: seatIds.length,
    combined: combinedAssessment,
    subOnly: subOnlyAssessment,
    comparison: {
      p19DeviationDeltaDb: delta(combinedAssessment.p19?.variationDb, subOnlyAssessment.p19?.variationDb),
      p19LevelDelta: finite(combinedAssessment.p19?.level) && finite(subOnlyAssessment.p19?.level)
        ? Number(combinedAssessment.p19.level) - Number(subOnlyAssessment.p19.level)
        : null,
      p20DeviationDeltaDb: delta(combinedAssessment.p20?.variationDb, subOnlyAssessment.p20?.variationDb),
      p20LevelDelta: finite(combinedAssessment.p20?.level) && finite(subOnlyAssessment.p20?.level)
        ? Number(combinedAssessment.p20.level) - Number(subOnlyAssessment.p20.level)
        : null,
    },
    provisional: true,
  };
}