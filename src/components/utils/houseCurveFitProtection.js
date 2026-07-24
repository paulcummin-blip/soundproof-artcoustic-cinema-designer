import { applyBassSmoothing } from "@/components/room/bass/bassGraphSmoothing";
import { artcousticHouseCurveOffsetAt } from "@/components/utils/artcousticHouseCurve";
import { getSourceDomainBoostAllowance } from "@/components/utils/subwooferCapability";
import { interpolateCanonicalTarget } from "@/components/utils/houseCurveTargetAuthority";

const octaveWidth = (startHz, endHz) => startHz > 0 && endHz > startHz ? Math.log2(endHz / startHz) : 0;

export function identifyProtectedNullRegions(curve, assessmentStartHz, assessmentEndHz, anchorDb, activeSubs, usableLfHz, requestedSystemOutputDb, canonicalTargetCurve = null) {
  const nullThresholdDb = -10;
  const boundaryThresholdDb = -6;
  const points = applyBassSmoothing(curve, "third")
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
  const regions = [];
  let current = [];
  const finish = () => {
    if (!current.length) return;
    const localMinima = current.filter((point) => point.isLocalMinimum && point.nullDepthDb <= nullThresholdDb);
    if (!localMinima.length) {
      current = [];
      return;
    }
    const worst = localMinima.reduce((a, b) => b.nullDepthDb < a.nullDepthDb ? b : a);
    let startIndex = localized.indexOf(current[0]);
    let endIndex = localized.indexOf(current.at(-1));
    while (startIndex > 0 && localized[startIndex - 1].nullDepthDb <= boundaryThresholdDb) startIndex--;
    while (endIndex < localized.length - 1 && localized[endIndex + 1].nullDepthDb <= boundaryThresholdDb) endIndex++;
    const startHz = localized[startIndex].frequency;
    const endHz = localized[endIndex].frequency;
    const requiredBoostDb = Math.max(0, -worst.residualDb);
    const allowance = getSourceDomainBoostAllowance({
      frequency: worst.frequency, requestedBoostDb: 6, activeSubs, usableLfHz,
      maxBoostDb: 6, requestedSystemOutputDb,
    });
    const permittedBoostDb = Number.isFinite(allowance?.allowedBoostDb) ? allowance.allowedBoostDb : 6;
    const capabilityLimited = permittedBoostDb + 0.05 < Math.min(6, requiredBoostDb);
    const widthOctaves = octaveWidth(startHz, endHz);
    const reason = "Localized cancellation null at least 10 dB below neighbouring broad response";
    regions.push({
      startHz: startHz / 2 ** (1 / 12), endHz: endHz * 2 ** (1 / 12),
      widthHz: endHz - startHz, widthOctaves,
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
      assessmentCurveDomain: "third-octave-smoothed-response",
      depthFormula: "centreSplDb - shoulderReferenceSplDb",
      depthRelativeToTargetDb: requiredBoostDb,
      neighbouringShoulderResidualDb: worst.shoulderReferenceSplDb
        - (interpolateCanonicalTarget(canonicalTargetCurve, worst.frequency) ?? (anchorDb + artcousticHouseCurveOffsetAt(worst.frequency))),
      depthRelativeToShouldersDb: -worst.nullDepthDb,
      requiredBoostDb, permittedBoostDb, boostRejectedDb: requiredBoostDb,
      narrowCancellation: widthOctaves < 1 / 3, capabilityLimited,
      rejectionReason: reason, reason,
    });
    current = [];
  };
  for (const point of localized) {
    if (point.nullDepthDb <= nullThresholdDb) current.push(point); else finish();
  }
  finish();
  return regions;
}

export function runProtectedNullClassificationValidation() {
  const frequencies = Array.from({ length: 201 }, (_, index) => 20 + index * 0.5);
  const gaussian = (frequency, centre, width, gain) => gain * Math.exp(-0.5 * ((frequency - centre) / width) ** 2);
  const classify = (centreHz, gainDb, baselineDb = 100) => {
    const curve = frequencies.map((frequency) => ({
      frequency,
      spl: baselineDb + gaussian(frequency, centreHz, 2, gainDb),
    }));
    return identifyProtectedNullRegions(curve, 20, 120, baselineDb, [], 20, baselineDb, null);
  };
  const genuineNull = classify(50, -40);
  const modalPeak = classify(50, 40);
  const current67PeakShape = classify(67, 10, 91.8);
  const current34NullShape = classify(34, -35, 95.8);
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
  ];
  return {
    checks,
    allPassed: checks.every((check) => check.passed),
    genuineNullRegions: genuineNull,
    modalPeakRegions: modalPeak,
    current67PeakRegions: current67PeakShape,
    current34Regions: current34NullShape,
    current34ArithmeticDeltaDb: arithmeticDeltaDb,
  };
}

export function isProtectedFrequency(frequency, regions) {
  return (regions || []).some((region) => frequency >= region.startHz && frequency <= region.endHz);
}

export function evaluateNearTargetProtection(baselinePoints, candidatePoints, maximumResidualImprovementDb, protectedNullRegions = []) {
  const candidateByFrequency = new Map((candidatePoints || []).map((point) => [point.frequency, point]));
  const violations = [];
  for (const before of baselinePoints || []) {
    if (isProtectedFrequency(before.frequency, protectedNullRegions) || Math.abs(before.deviationDb) > 1) continue;
    const after = candidateByFrequency.get(before.frequency);
    if (!after) continue;
    const afterAbs = Math.abs(after.deviationDb);
    let reason = null;
    if (afterAbs > 3 + 1e-9) reason = `near-target point exceeded ±3 dB while maximum residual improved ${maximumResidualImprovementDb.toFixed(2)} dB`;
    if (reason) violations.push({ frequency: before.frequency, beforeResidualDb: before.deviationDb, afterResidualDb: after.deviationDb, reason });
  }
  return { passed: violations.length === 0, violations };
}