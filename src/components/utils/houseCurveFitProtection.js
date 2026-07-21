import { applyBassSmoothing } from "@/components/room/bass/bassGraphSmoothing";
import { artcousticHouseCurveOffsetAt } from "@/components/utils/artcousticHouseCurve";
import { getSourceDomainBoostAllowance } from "@/components/utils/subwooferCapability";

const octaveWidth = (startHz, endHz) => startHz > 0 && endHz > startHz ? Math.log2(endHz / startHz) : 0;

export function identifyProtectedNullRegions(curve, assessmentStartHz, assessmentEndHz, anchorDb, activeSubs, usableLfHz, requestedSystemOutputDb) {
  const points = applyBassSmoothing(curve, "third")
    .filter((point) => point.frequency >= assessmentStartHz && point.frequency <= assessmentEndHz)
    .map((point) => ({ ...point, residualDb: point.spl - (anchorDb + artcousticHouseCurveOffsetAt(point.frequency)) }));
  const regions = [];
  let current = [];
  const finish = () => {
    if (!current.length) return;
    const worst = current.reduce((a, b) => b.residualDb < a.residualDb ? b : a);
    const startHz = current[0].frequency;
    const endHz = current[current.length - 1].frequency;
    const requiredBoostDb = Math.abs(worst.residualDb);
    const allowance = getSourceDomainBoostAllowance({
      frequency: worst.frequency, requestedBoostDb: 6, activeSubs, usableLfHz,
      maxBoostDb: 6, requestedSystemOutputDb,
    });
    const permittedBoostDb = Number.isFinite(allowance?.allowedBoostDb) ? allowance.allowedBoostDb : 6;
    const widthOctaves = octaveWidth(startHz, endHz);
    const narrowCancellation = widthOctaves < 1 / 3;
    const capabilityLimited = permittedBoostDb + 0.05 < Math.min(6, requiredBoostDb);
    const leftShoulder = points.filter((point) => point.frequency < startHz && point.frequency >= startHz / 2 ** (1 / 3)).at(-1);
    const rightShoulder = points.find((point) => point.frequency > endHz && point.frequency <= endHz * 2 ** (1 / 3));
    const shoulderResiduals = [leftShoulder?.residualDb, rightShoulder?.residualDb].filter(Number.isFinite);
    const neighbouringShoulderResidualDb = shoulderResiduals.length
      ? shoulderResiduals.reduce((sum, value) => sum + value, 0) / shoulderResiduals.length
      : 0;
    const depthRelativeToShouldersDb = neighbouringShoulderResidualDb - worst.residualDb;
    if (requiredBoostDb >= 8 || (narrowCancellation && depthRelativeToShouldersDb >= 4) || capabilityLimited) {
      const reason = capabilityLimited
        ? "Significant cancellation null; required boost exceeds selected-product headroom"
        : "Significant narrow cancellation null with elevated neighbouring shoulders";
      regions.push({
        startHz: startHz / 2 ** (1 / 24), endHz: endHz * 2 ** (1 / 24),
        widthHz: endHz - startHz, widthOctaves,
        centreFrequencyHz: worst.frequency, signedResidualDb: worst.residualDb,
        depthRelativeToTargetDb: requiredBoostDb, neighbouringShoulderResidualDb,
        depthRelativeToShouldersDb, requiredBoostDb, permittedBoostDb,
        boostRejectedDb: requiredBoostDb, narrowCancellation, capabilityLimited,
        rejectionReason: reason, reason,
      });
    }
    current = [];
  };
  for (const point of points) {
    if (point.residualDb <= -6) current.push(point); else finish();
  }
  finish();
  return regions;
}

export function isProtectedFrequency(frequency, regions) {
  return (regions || []).some((region) => frequency >= region.startHz && frequency <= region.endHz);
}

export function evaluateNearTargetProtection(baselinePoints, candidatePoints, maximumResidualImprovementDb) {
  const candidateByFrequency = new Map((candidatePoints || []).map((point) => [point.frequency, point]));
  const violations = [];
  for (const before of baselinePoints || []) {
    if (Math.abs(before.deviationDb) > 1) continue;
    const after = candidateByFrequency.get(before.frequency);
    if (!after) continue;
    const afterAbs = Math.abs(after.deviationDb);
    let reason = null;
    if (afterAbs > 1.5 + 1e-9) reason = `near-target point exceeded ±1.5 dB while maximum residual improved ${maximumResidualImprovementDb.toFixed(2)} dB`;
    else if (Math.sign(before.deviationDb) !== 0 && Math.sign(after.deviationDb) !== Math.sign(before.deviationDb)
      && afterAbs > Math.abs(before.deviationDb) + 0.5 + 1e-9) reason = "filter crossed target and worsened opposite-side residual";
    if (reason) violations.push({ frequency: before.frequency, beforeResidualDb: before.deviationDb, afterResidualDb: after.deviationDb, reason });
  }
  return { passed: violations.length === 0, violations };
}