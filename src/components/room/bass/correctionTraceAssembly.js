// correctionTraceAssembly.js
//
// Assembles the persisted correction trace for one completed calculation:
// the per-frequency evidence trace, plus the counterfactual examination of the
// worst low-frequency residual.
//
// WHY IT IS ITS OWN MODULE
//   finalOptimisedBassResponse already carries the authority overlay; keeping
//   the trace assembly here stops that file from growing and gives the trace
//   one owner. Nothing in this module computes acoustic outputs — it reads
//   curves the calculation has already produced.
//
// INPUTS ARE THE FINAL AUTHORITY CURVES ONLY
//   alignedRsp        final post-alignment RSP response (the graph + P19 source)
//   canonicalTarget   the house target H(f)
//   correctionCurve   applied (post-smoothing) envelope
//   rawCorrectionCurve the REAL pre-smoothing envelope (carried from the predictor)
//   maximumSplCurveAfterEq the delivered-output ceiling (headroom authority)

import {
  buildCorrectionTrace,
  REQUIRED_INSPECTION_FREQUENCIES_HZ,
} from "@/components/room/bass/correctionTraceAuthority";
import {
  buildCorrectionCounterfactual,
  selectInspectionFrequencyForCounterfactual,
} from "@/components/room/bass/correctionCounterfactualAuthority";

const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;

/**
 * The P20 worst frequency: the frequency of the worst seat-to-RSP deviation.
 * Taken from the candidate/result when the authority states it, otherwise from
 * the per-seat results — never invented.
 */
export function resolveP20WorstFrequency(candidate, canonicalResult) {
  const direct = finite(candidate?.p20WorstFrequencyHz) ?? finite(canonicalResult?.p20WorstFrequencyHz);
  if (direct !== null) return direct;
  const seats = Array.isArray(candidate?.perSeatP20Results)
    ? candidate.perSeatP20Results
    : (Array.isArray(canonicalResult?.perSeatP20Results) ? canonicalResult.perSeatP20Results : []);
  if (!seats.length) return null;
  let worst = null;
  for (const seat of seats) {
    const deviation = Math.abs(Number(seat?.variationDbRaw ?? seat?.displayVariationDb ?? NaN));
    const frequency = finite(seat?.worstFrequencyHz);
    if (!Number.isFinite(deviation) || frequency === null) continue;
    if (!worst || deviation > worst.deviation) worst = { deviation, frequency };
  }
  return worst ? worst.frequency : null;
}

/**
 * Assemble the persisted trace and its counterfactual.
 *
 * @param {object} params
 * @param {object} params.canonicalResult
 * @param {object} params.candidate            authority-bearing candidate
 * @param {Array}  params.alignedRsp           final post-alignment RSP curve
 * @returns {{ correctionTrace: object|null, rawCorrectionCurve: Array, counterfactual: object|null,
 *             inspectionFrequencyHz: number|null }}
 */
export function assembleCorrectionTrace({ canonicalResult, candidate, alignedRsp } = {}) {
  const postEqCurve = Array.isArray(alignedRsp) && alignedRsp.length
    ? alignedRsp
    : (canonicalResult?.postEqRspCurve || canonicalResult?.canonicalPostEqRsp || null);
  const rawCorrectionCurve = Array.isArray(candidate?.rawCorrectionCurve) && candidate.rawCorrectionCurve.length
    ? candidate.rawCorrectionCurve
    : (Array.isArray(canonicalResult?.rawCorrectionCurve) ? canonicalResult.rawCorrectionCurve : null);
  const maximumOutputCurve = Array.isArray(candidate?.maximumSplCurveAfterEq) && candidate.maximumSplCurveAfterEq.length
    ? candidate.maximumSplCurveAfterEq
    : (Array.isArray(canonicalResult?.maximumSplCurveAfterEq) ? canonicalResult.maximumSplCurveAfterEq : null);
  const globalTrimDb = finite(candidate?.realisticGlobalTrimDb)
    ?? finite(canonicalResult?.realisticGlobalTrimDb);
  const assessmentStartHz = finite(candidate?.assessmentStartHz)
    ?? finite(canonicalResult?.assessmentStartHz);
  const assessmentEndHz = finite(candidate?.assessmentEndHz)
    ?? finite(canonicalResult?.assessmentEndHz);
  const protectedNullRegions = candidate?.protectedNullRegions || canonicalResult?.protectedNullRegions || [];
  const capabilityLimitedRegions = candidate?.capabilityLimitedRegions
    || canonicalResult?.capabilityLimitedRegions || [];
  const officialP19WorstFrequencyHz = finite(candidate?.officialP19WorstFrequencyHz)
    ?? finite(canonicalResult?.officialP19WorstFrequencyHz);
  const p20WorstFrequencyHz = resolveP20WorstFrequency(candidate, canonicalResult);

  // The counterfactual is run for the worst BELOW-TARGET residual inside the
  // designer's low-frequency inspection set — the frequency where an unjustified
  // shortfall would actually mislead a design decision.
  const inspectionFrequencyHz = (postEqCurve && canonicalResult?.canonicalTargetCurve)
    ? selectInspectionFrequencyForCounterfactual({
        postEqRspCurve: postEqCurve,
        canonicalTargetCurve: canonicalResult.canonicalTargetCurve,
        frequencies: REQUIRED_INSPECTION_FREQUENCIES_HZ,
      })
    : null;

  const counterfactual = inspectionFrequencyHz === null ? null : buildCorrectionCounterfactual({
    inspectionFrequencyHz,
    postEqRspCurve: postEqCurve,
    canonicalTargetCurve: canonicalResult.canonicalTargetCurve,
    correctionCurve: canonicalResult.correctionCurve,
    rawCorrectionCurve,
    maximumOutputCurve,
    globalTrimDb,
    assessmentStartHz,
    assessmentEndHz,
    protectedNullRegions,
    capabilityLimitedRegions,
    officialP19WorstFrequencyHz,
  });

  const correctionTrace = buildCorrectionTrace({
    postEqRspCurve: postEqCurve,
    rawRspCurve: canonicalResult?.rspBeforePeqAtOperatingLevel?.length
      ? canonicalResult.rspBeforePeqAtOperatingLevel
      : canonicalResult?.physicalRawResponseCurve,
    targetCurve: canonicalResult?.canonicalTargetCurve,
    correctionCurve: canonicalResult?.correctionCurve,
    rawCorrectionCurve,
    maximumOutputCurve,
    globalTrimDb,
    capabilityLimitedRegions,
    protectedNullRegions,
    initialOperatingAdjustmentDb: canonicalResult?.operatingLevelOffsetDb,
    finalGlobalAlignmentTrimDb: candidate?.globalLevelAlignment?.recommendedTrimDb,
    assessmentStartHz,
    assessmentEndHz,
    officialP19WorstFrequencyHz,
    p20WorstFrequencyHz,
    transitionEdgeHz: candidate?.transitionHz ?? canonicalResult?.transitionHz ?? null,
    counterfactual,
  });

  return {
    correctionTrace,
    rawCorrectionCurve: Array.isArray(rawCorrectionCurve) ? rawCorrectionCurve : [],
    counterfactual,
    inspectionFrequencyHz,
  };
}