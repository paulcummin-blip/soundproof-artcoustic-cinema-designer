import { artcousticHouseCurveOffsetAt } from "@/components/utils/artcousticHouseCurve";
import { interpolateCanonicalTarget } from "@/components/utils/houseCurveTargetAuthority";

const octaveWidth = (startHz, endHz) => startHz > 0 && endHz > startHz ? Math.log2(endHz / startHz) : 0;
export const MAX_PROTECTED_NULL_WIDTH_HZ = 6;

export function identifyProtectedNullRegions(curve, assessmentStartHz, assessmentEndHz, anchorDb, activeSubs, usableLfHz, requestedSystemOutputDb, canonicalTargetCurve = null) {
  const nullThresholdDb = -10;
  const boundaryThresholdDb = -6;
  // Cancellation protection is intentionally assessed on the unsmoothed
  // physical response. Fractional-octave smoothing broadens a knife-edge null
  // and can incorrectly classify a recoverable wide valley as untouchable.
  const points = (Array.isArray(curve) ? curve : [])
    .filter((point) => Number.isFinite(point.frequency) && Number.isFinite(point.spl)
      && point.frequency >= assessmentStartHz && point.frequency <= assessmentEndHz)
    .map((point, index) => ({
      ...point,
      assessmentIndex: index,
      residualDb: point.spl - (interpolateCanonicalTarget(canonicalTargetCurve, point.frequency)
        ?? (anchorDb + artcousticHouseCurveOffsetAt(point.frequency))),
    }));
  const median = (values) => {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return null;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  };
  const shoulderForFrequencyRange = (minimumHz, maximumHz) => {
    const samples = points.filter((candidate) => candidate.frequency >= minimumHz && candidate.frequency <= maximumHz);
    const medianSplDb = median(samples.map((candidate) => candidate.spl));
    if (!Number.isFinite(medianSplDb)) return null;
    const representative = samples.reduce((nearest, candidate) => (
      !nearest || Math.abs(candidate.spl - medianSplDb) < Math.abs(nearest.spl - medianSplDb) ? candidate : nearest
    ), null);
    return representative ? {
      index: representative.assessmentIndex,
      frequencyHz: representative.frequency,
      splDb: representative.spl,
      medianSplDb,
    } : null;
  };
  const localized = points.map((point, index) => {
    const leftShoulder = shoulderForFrequencyRange(point.frequency / 2 ** (2 / 3), point.frequency / 2 ** (1 / 4));
    const rightShoulder = shoulderForFrequencyRange(point.frequency * 2 ** (1 / 4), point.frequency * 2 ** (2 / 3));
    const shoulderReferenceSplDb = leftShoulder && rightShoulder
      ? (leftShoulder.splDb + rightShoulder.splDb) / 2
      : null;
    const nullDepthDb = Number.isFinite(shoulderReferenceSplDb) ? point.spl - shoulderReferenceSplDb : null;
    const previous = points[index - 1];
    const next = points[index + 1];
    const isLocalMinimum = !!previous && !!next && point.spl <= previous.spl && point.spl <= next.spl
      && (point.spl < previous.spl || point.spl < next.spl);
    return {
      ...point,
      leftShoulder,
      rightShoulder,
      shoulderReferenceSplDb,
      neighbouringShoulderSplDb: shoulderReferenceSplDb,
      nullDepthDb,
      isLocalMinimum,
    };
  });
  // Classify each local minimum against its own fixed broad-shoulder reference.
  // Using every neighbouring point's independently moving shoulder reference
  // can make a knife-edge cancellation appear artificially wide when it sits
  // beside a modal peak. A fixed reference measures the actual notch width.
  const regions = [];
  const localMinima = localized
    .filter((point) => point.isLocalMinimum
      && point.nullDepthDb <= nullThresholdDb
      && Number.isFinite(point.shoulderReferenceSplDb))
    .sort((a, b) => a.nullDepthDb - b.nullDepthDb);

  for (const worst of localMinima) {
    let startIndex = worst.assessmentIndex;
    let endIndex = worst.assessmentIndex;
    const depthFromFixedShoulders = (point) => point.spl - worst.shoulderReferenceSplDb;
    while (startIndex > 0 && depthFromFixedShoulders(localized[startIndex - 1]) <= boundaryThresholdDb) startIndex--;
    while (endIndex < localized.length - 1 && depthFromFixedShoulders(localized[endIndex + 1]) <= boundaryThresholdDb) endIndex++;

    const startHz = localized[startIndex].frequency;
    const endHz = localized[endIndex].frequency;
    const widthHz = endHz - startHz;
    const widthOctaves = octaveWidth(startHz, endHz);
    const narrowCancellation = widthHz <= MAX_PROTECTED_NULL_WIDTH_HZ + 1e-9;
    if (!narrowCancellation) {
      // Broad valleys remain eligible for a partial, capability-limited boost.
      // The +6 dB bank ceiling and product/amplifier headroom decide how much
      // can actually be recovered.
      continue;
    }
    // Multiple sampled minima inside one notch describe the same cancellation.
    if (regions.some((region) => startHz <= region.endHz && endHz >= region.startHz)) continue;

    const requiredBoostDb = Math.max(0, -worst.residualDb);
    const permittedBoostDb = 6;
    const capabilityLimited = requiredBoostDb > permittedBoostDb + 1e-9;
    const protectionPaddingHz = Math.max(0.25, Math.min(1, widthHz * 0.1));
    const reason = `Narrow cancellation null (≤ ${MAX_PROTECTED_NULL_WIDTH_HZ} Hz) at least 10 dB below neighbouring broad response`;
    regions.push({
      startHz: Math.max(assessmentStartHz, startHz - protectionPaddingHz),
      endHz: Math.min(assessmentEndHz, endHz + protectionPaddingHz),
      widthHz, widthOctaves,
      centreFrequencyHz: worst.frequency, signedResidualDb: worst.residualDb,
      centreAssessmentIndex: worst.assessmentIndex,
      centreSplDb: worst.spl,
      leftShoulderIndex: worst.leftShoulder.index,
      leftShoulderFrequencyHz: worst.leftShoulder.frequencyHz,
      leftShoulderSplDb: worst.leftShoulder.splDb,
      rightShoulderIndex: worst.rightShoulder.index,
      rightShoulderFrequencyHz: worst.rightShoulder.frequencyHz,
      rightShoulderSplDb: worst.rightShoulder.splDb,
      shoulderReferenceSplDb: worst.shoulderReferenceSplDb,
      nullDepthDb: worst.nullDepthDb,
      nullDepthThresholdDb: nullThresholdDb,
      localMinimum: worst.isLocalMinimum,
      protected: true,
      assessmentCurveDomain: "unsmoothed-physical-response",
      depthFormula: "centreSplDb - shoulderReferenceSplDb",
      depthRelativeToTargetDb: requiredBoostDb,
      neighbouringShoulderResidualDb: worst.shoulderReferenceSplDb
        - (interpolateCanonicalTarget(canonicalTargetCurve, worst.frequency) ?? (anchorDb + artcousticHouseCurveOffsetAt(worst.frequency))),
      depthRelativeToShouldersDb: -worst.nullDepthDb,
      requiredBoostDb, permittedBoostDb, boostRejectedDb: requiredBoostDb,
      narrowCancellation, maximumProtectedWidthHz: MAX_PROTECTED_NULL_WIDTH_HZ, capabilityLimited,
      rejectionReason: reason, reason,
    });
  }
  return regions.sort((a, b) => a.startHz - b.startHz);
}

export function runProtectedNullClassificationValidation() {
  const frequencies = Array.from({ length: 201 }, (_, index) => 20 + index * 0.5);
  const gaussian = (frequency, centre, width, gain) => gain * Math.exp(-0.5 * ((frequency - centre) / width) ** 2);
  const classify = (centreHz, gainDb, baselineDb = 100, widthHz = 0.75) => {
    const curve = frequencies.map((frequency) => ({
      frequency,
      spl: baselineDb + gaussian(frequency, centreHz, widthHz, gainDb),
    }));
    return identifyProtectedNullRegions(curve, 20, 120, baselineDb, [], 20, baselineDb, null);
  };
  const genuineNull = classify(50, -40);
  const modalPeak = classify(50, 40);
  const current67PeakShape = classify(67, 10, 91.8);
  const current34NullShape = classify(34, -35, 95.8);
  const broadRecoverableValley = classify(50, -20, 100, 5);
  const regionNear = (regions, frequency) => regions.find((region) => Math.abs(region.centreFrequencyHz - frequency) <= 3);
  const region34 = regionNear(current34NullShape, 34);
  const arithmeticDeltaDb = region34
    ? region34.nullDepthDb - (region34.centreSplDb - region34.shoulderReferenceSplDb)
    : null;
  const checks = [
    { id: "A", expected: "genuine null protected", passed: !!regionNear(genuineNull, 50) },
    { id: "B", expected: "modal peak not protected", passed: !regionNear(modalPeak, 50) },
    { id: "C", expected: "67 Hz positive peak not protected", passed: !regionNear(current67PeakShape, 67) },
    { id: "D", expected: "34 Hz decision uses exact signed arithmetic", passed: !region34 || Math.abs(arithmeticDeltaDb) < 1e-9 },
    { id: "E", expected: "broad deep valley remains eligible for limited EQ", passed: !regionNear(broadRecoverableValley, 50) },
  ];
  return {
    checks,
    allPassed: checks.every((check) => check.passed),
    genuineNullRegions: genuineNull,
    modalPeakRegions: modalPeak,
    current67PeakRegions: current67PeakShape,
    current34Regions: current34NullShape,
    broadRecoverableValleyRegions: broadRecoverableValley,
    current34ArithmeticDeltaDb: arithmeticDeltaDb,
  };
}

export function isProtectedFrequency(frequency, regions) {
  return (regions || []).some((region) => frequency >= region.startHz && frequency <= region.endHz);
}

// Correctable-error scoring uses a one-third-octave smoothed response. A protected
// knife-edge cancellation influences that smoothed curve for half the smoothing
// width beyond each raw protection edge. Exclude those skirts from optimiser and
// diagnostic "correctable" scores without widening the physical no-boost region.
export const PROTECTED_NULL_SCORING_SMOOTHING_OCTAVES = 1 / 3;
export function isProtectedSmoothedFrequency(frequency, regions, smoothingWidthOctaves = PROTECTED_NULL_SCORING_SMOOTHING_OCTAVES) {
  const halfWidthOctaves = Math.max(0, Number(smoothingWidthOctaves) || 0) / 2;
  const edgeScale = 2 ** halfWidthOctaves;
  return (regions || []).some((region) => (
    frequency >= region.startHz / edgeScale
    && frequency <= region.endHz * edgeScale
  ));
}

const NEAR_TARGET_INFLUENCE_THRESHOLD_DB = 0.25;

export function evaluateNearTargetProtection(baselinePoints, candidatePoints, maximumResidualImprovementDb, protectedNullRegions = []) {
  const candidateByFrequency = new Map((candidatePoints || []).map((point) => [point.frequency, point]));
  const violations = [];
  for (const before of baselinePoints || []) {
    if (isProtectedSmoothedFrequency(before.frequency, protectedNullRegions) || Math.abs(before.deviationDb) > 1) continue;
    const after = candidateByFrequency.get(before.frequency);
    if (!after) continue;
    // Only evaluate frequencies materially influenced by this candidate.
    // A cut at 50 Hz must not be rejected because an unrelated near-target
    // point at 80 Hz happened to cross ±3 dB for an unrelated reason.
    const changeDb = Math.abs(after.deviationDb - before.deviationDb);
    if (changeDb < NEAR_TARGET_INFLUENCE_THRESHOLD_DB) continue;
    const afterAbs = Math.abs(after.deviationDb);
    let reason = null;
    if (afterAbs > 3 + 1e-9) reason = `influenced near-target point exceeded ±3 dB while maximum residual improved ${maximumResidualImprovementDb.toFixed(2)} dB`;
    if (reason) violations.push({ frequency: before.frequency, beforeResidualDb: before.deviationDb, afterResidualDb: after.deviationDb, reason });
  }
  return { passed: violations.length === 0, violations };
}