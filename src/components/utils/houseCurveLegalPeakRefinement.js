import { applyBassSmoothing } from "@/components/room/bass/bassGraphSmoothing";
import { buildCurveFromBank, evaluateProvisionalBankLimits, peakingEqResponseDb } from "@/components/utils/designEqCalibration";
import { calculateAllSeatMetrics } from "@/components/utils/houseCurveFitterCore";
import { isProtectedFrequency } from "@/components/utils/houseCurveFitProtection";
import { interpolateCanonicalTarget } from "@/components/utils/houseCurveTargetAuthority";

const EQ_ACTIVITY = (filters) => filters.reduce((sum, filter) => sum + Math.abs(filter.gainDb || 0), 0);

function quality(raw, filters, target, startHz, endHz, protectedRegions) {
  const residuals = applyBassSmoothing(buildCurveFromBank(raw, filters), "third")
    .filter((point) => point.frequency >= startHz && point.frequency <= endHz)
    .filter((point) => !isProtectedFrequency(point.frequency, protectedRegions))
    .map((point) => point.spl - interpolateCanonicalTarget(target, point.frequency))
    .filter(Number.isFinite);
  if (!residuals.length) return null;
  return {
    maximum: Math.max(...residuals.map(Math.abs)),
    rms: Math.sqrt(residuals.reduce((sum, value) => sum + value ** 2, 0) / residuals.length),
    meanAbsolute: residuals.reduce((sum, value) => sum + Math.abs(value), 0) / residuals.length,
    activity: EQ_ACTIVITY(filters),
  };
}

function tuple(result) {
  return [result.quality.maximum, result.quality.rms, result.quality.meanAbsolute, result.rawPeakResidual, result.quality.activity];
}

function better(left, right) {
  if (!right) return true;
  const a = tuple(left);
  const b = tuple(right);
  for (let index = 0; index < a.length; index++) if (Math.abs(a[index] - b[index]) > 1e-9) return a[index] < b[index];
  return false;
}

export function refineLegalUnprotectedPeak({ filters, rawCurve, targetCurve, protectedNullRegions, assessmentStartHz,
  assessmentEndHz, bankRaw, activeSubs, usableLfHz, requestedSystemOutputDb, profile, objectiveSeats, fitStartHz, fitEndHz, anchorDb }) {
  const current = filters.filter((filter) => filter?.enabled).map((filter) => ({ ...filter }));
  const currentCurve = buildCurveFromBank(rawCurve, current);
  const residualCurve = currentCurve
    .filter((point) => point.frequency >= assessmentStartHz && point.frequency <= assessmentEndHz)
    .filter((point) => !isProtectedFrequency(point.frequency, protectedNullRegions))
    .map((point) => ({ ...point, residual: point.spl - interpolateCanonicalTarget(targetCurve, point.frequency) }));
  const peaks = residualCurve
    .filter((point, index) => point.residual > 3
      && point.residual >= (residualCurve[index - 1]?.residual ?? -Infinity)
      && point.residual >= (residualCurve[index + 1]?.residual ?? -Infinity))
    .sort((left, right) => right.residual - left.residual);
  if (!peaks.length) return { filters: current, changed: false, reason: "no unprotected raw peak remained above +3 dB" };

  const baselineMetrics = calculateAllSeatMetrics(objectiveSeats, current, fitStartHz, fitEndHz, anchorDb, null, null, {
    protectedNullRegions, canonicalTargetCurve: targetCurve,
  });
  let best = null;
  for (const peak of peaks.slice(0, 4)) {
    current.forEach((filter, filterIndex) => {
      if (filter.gainDb >= -0.1 || peakingEqResponseDb(peak.frequency, filter) > -0.25) return;
      for (const shift of [0.25, 0.5, 0.75, 1]) for (const gainDelta of [-0.5, -0.25, 0, 0.25, 0.5]) {
        const revised = {
          ...filter,
          frequencyHz: filter.frequencyHz + (peak.frequency - filter.frequencyHz) * shift,
          gainDb: Math.max(-15, Math.min(0, filter.gainDb + gainDelta)),
          reason: "Legal unprotected-peak frequency refinement",
        };
        const proposed = current.map((entry, index) => index === filterIndex ? revised : entry);
        const limits = evaluateProvisionalBankLimits(proposed, bankRaw, activeSubs, usableLfHz, requestedSystemOutputDb, profile);
        if (!limits.allOk || limits.maxAggregateCutDb < -15.0001) continue;
        const post = buildCurveFromBank(rawCurve, proposed);
        const postPoint = post.reduce((nearest, point) => Math.abs(point.frequency - peak.frequency) < Math.abs(nearest.frequency - peak.frequency) ? point : nearest);
        const rawPeakResidual = Math.abs(postPoint.spl - interpolateCanonicalTarget(targetCurve, postPoint.frequency));
        if (rawPeakResidual > 3.0001) continue;
        const proposedQuality = quality(rawCurve, proposed, targetCurve, assessmentStartHz, assessmentEndHz, protectedNullRegions);
        if (!proposedQuality || proposedQuality.maximum > 3.0001) continue;
        const metrics = calculateAllSeatMetrics(objectiveSeats, proposed, fitStartHz, fitEndHz, anchorDb, null, null, {
          protectedNullRegions, canonicalTargetCurve: targetCurve,
        });
        const realSeatsSafe = (metrics?.seatMetrics || []).filter((seat) => seat.seatId !== "rsp").every((seat) => {
          const baseline = baselineMetrics?.seatMetrics?.find((entry) => entry.seatId === seat.seatId);
          return !baseline || seat.maxAbsDeviationDb <= baseline.maxAbsDeviationDb + 0.5;
        });
        if (!realSeatsSafe) continue;
        const candidate = { filters: proposed, quality: proposedQuality, rawPeakResidual, metrics, limits, frequencyHz: peak.frequency };
        if (better(candidate, best)) best = candidate;
      }
    });
  }
  return best ? { ...best, changed: true, reason: "legal unprotected peak refined within ±3 dB" }
    : { filters: current, changed: false, reason: "no legal frequency refinement satisfied the strict peak and correctable-error gates" };
}