import { applyBassSmoothing } from "@/components/room/bass/bassGraphSmoothing";
import { artcousticHouseCurveOffsetAt } from "@/components/utils/artcousticHouseCurve";
import { getSourceDomainBoostAllowance } from "@/components/utils/subwooferCapability";
import { interpolateCanonicalTarget } from "@/components/utils/houseCurveTargetAuthority";

const octaveWidth = (startHz, endHz) => startHz > 0 && endHz > startHz ? Math.log2(endHz / startHz) : 0;

export function identifyProtectedNullRegions(curve, assessmentStartHz, assessmentEndHz, anchorDb, activeSubs, usableLfHz, requestedSystemOutputDb, canonicalTargetCurve = null) {
  const points = applyBassSmoothing(curve, "third")
    .filter((point) => Number.isFinite(point.frequency) && Number.isFinite(point.spl)
      && point.frequency >= assessmentStartHz && point.frequency <= assessmentEndHz)
    .map((point) => ({
      ...point,
      residualDb: point.spl - (interpolateCanonicalTarget(canonicalTargetCurve, point.frequency)
        ?? (anchorDb + artcousticHouseCurveOffsetAt(point.frequency))),
    }));
  const median = (values) => {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return null;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  };
  const localized = points.map((point) => {
    const left = points.filter((candidate) => candidate.frequency >= point.frequency / 2 ** (2 / 3)
      && candidate.frequency <= point.frequency / 2 ** (1 / 4));
    const right = points.filter((candidate) => candidate.frequency >= point.frequency * 2 ** (1 / 4)
      && candidate.frequency <= point.frequency * 2 ** (2 / 3));
    const leftShoulderDb = median(left.map((candidate) => candidate.spl));
    const rightShoulderDb = median(right.map((candidate) => candidate.spl));
    const neighbouringShoulderSplDb = Number.isFinite(leftShoulderDb) && Number.isFinite(rightShoulderDb)
      ? (leftShoulderDb + rightShoulderDb) / 2
      : null;
    return {
      ...point,
      neighbouringShoulderSplDb,
      depthRelativeToShouldersDb: Number.isFinite(neighbouringShoulderSplDb) ? neighbouringShoulderSplDb - point.spl : null,
    };
  });
  const regions = [];
  let current = [];
  const finish = () => {
    if (!current.length) return;
    const worst = current.reduce((a, b) => b.depthRelativeToShouldersDb > a.depthRelativeToShouldersDb ? b : a);
    let startIndex = localized.indexOf(current[0]);
    let endIndex = localized.indexOf(current.at(-1));
    while (startIndex > 0 && localized[startIndex - 1].depthRelativeToShouldersDb >= 6) startIndex--;
    while (endIndex < localized.length - 1 && localized[endIndex + 1].depthRelativeToShouldersDb >= 6) endIndex++;
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
      startHz: startHz / 2 ** (1 / 24), endHz: endHz * 2 ** (1 / 24),
      widthHz: endHz - startHz, widthOctaves,
      centreFrequencyHz: worst.frequency, signedResidualDb: worst.residualDb,
      depthRelativeToTargetDb: requiredBoostDb,
      neighbouringShoulderResidualDb: worst.neighbouringShoulderSplDb
        - (interpolateCanonicalTarget(canonicalTargetCurve, worst.frequency) ?? (anchorDb + artcousticHouseCurveOffsetAt(worst.frequency))),
      depthRelativeToShouldersDb: worst.depthRelativeToShouldersDb,
      requiredBoostDb, permittedBoostDb, boostRejectedDb: requiredBoostDb,
      narrowCancellation: widthOctaves < 1 / 3, capabilityLimited,
      rejectionReason: reason, reason,
    });
    current = [];
  };
  for (const point of localized) {
    if (point.depthRelativeToShouldersDb >= 10) current.push(point); else finish();
  }
  finish();
  return regions;
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