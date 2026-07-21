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
    const narrowCancellation = octaveWidth(startHz, endHz) < 1 / 3;
    const capabilityLimited = permittedBoostDb + 0.05 < Math.min(6, requiredBoostDb);
    if (requiredBoostDb >= 8 || narrowCancellation || capabilityLimited) {
      regions.push({
        startHz: startHz / 2 ** (1 / 24), endHz: endHz * 2 ** (1 / 24),
        centreFrequencyHz: worst.frequency, signedResidualDb: worst.residualDb,
        requiredBoostDb, permittedBoostDb, narrowCancellation, capabilityLimited,
        reason: capabilityLimited
          ? "Significant cancellation null; required boost exceeds selected-product headroom"
          : "Significant narrow cancellation null; excluded from target-error objective",
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
    if (afterAbs > 2 + 1e-9) reason = "near-target point exceeded ±2 dB";
    else if (afterAbs > 1.5 + 1e-9 && maximumResidualImprovementDb < 0.5) reason = "near-target point exceeded ±1.5 dB without larger worst-residual benefit";
    else if (Math.sign(before.deviationDb) !== 0 && Math.sign(after.deviationDb) !== Math.sign(before.deviationDb)
      && afterAbs > Math.abs(before.deviationDb) + 0.5 + 1e-9) reason = "filter crossed target and worsened opposite-side residual";
    if (reason) violations.push({ frequency: before.frequency, beforeResidualDb: before.deviationDb, afterResidualDb: after.deviationDb, reason });
  }
  return { passed: violations.length === 0, violations };
}