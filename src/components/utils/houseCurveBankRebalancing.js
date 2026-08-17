import {
  buildCurveFromBank,
  evaluateProvisionalBankLimits,
  normaliseCurve,
  peakingEqResponseDb,
} from "@/components/utils/designEqCalibration";
import { calculateAllSeatMetrics } from "@/components/utils/houseCurveFitterCore";
import { isProtectedFrequency } from "@/components/utils/houseCurveFitProtection";
import { interpolateCanonicalTarget } from "@/components/utils/houseCurveTargetAuthority";
import { evaluatePreparedBankLimits } from "@/components/utils/preparedBankValidation";

const MAX_FILTERS = 10;
const MIN_WIDTH_OCTAVES = 0.22;
const MIN_DEPTH_DB = 4;
const MIN_IMPROVEMENT_DB = 1.5;
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

function correctionAt(frequency, filters) {
  return filters.reduce((sum, filter) => sum + peakingEqResponseDb(frequency, filter), 0);
}

function residualPoints(raw, filters, targetCurve, startHz, endHz, protectedRegions) {
  return raw
    .filter((point) => point.frequency >= startHz && point.frequency <= endHz)
    .map((point) => {
      const targetSpl = interpolateCanonicalTarget(targetCurve, point.frequency);
      return {
        frequency: point.frequency,
        residualDb: point.spl + correctionAt(point.frequency, filters) - targetSpl,
        protected: isProtectedFrequency(point.frequency, protectedRegions),
      };
    })
    .filter((point) => Number.isFinite(point.residualDb));
}

function discoverBroadValleys(points, minimumFrequencyHz) {
  const regions = [];
  let current = [];
  const finish = () => {
    if (current.length >= 3) {
      const startHz = current[0].frequency;
      const endHz = current.at(-1).frequency;
      const widthOctaves = endHz > startHz ? Math.log2(endHz / startHz) : 0;
      const centre = current.reduce((worst, point) => point.residualDb < worst.residualDb ? point : worst);
      if (widthOctaves >= MIN_WIDTH_OCTAVES && centre.residualDb <= -MIN_DEPTH_DB) {
        regions.push({ startHz, endHz, widthOctaves, centre });
      }
    }
    current = [];
  };
  for (const point of points) {
    if (point.frequency < minimumFrequencyHz || point.protected || point.residualDb > -1) {
      finish();
    } else {
      current.push(point);
    }
  }
  finish();
  return regions.sort((left, right) => left.centre.residualDb - right.centre.residualDb);
}

function quality(points) {
  const scored = points.filter((point) => !point.protected);
  if (!scored.length) return null;
  return {
    maximum: Math.max(...scored.map((point) => Math.abs(point.residualDb))),
    rms: Math.sqrt(scored.reduce((sum, point) => sum + point.residualDb ** 2, 0) / scored.length),
    meanAbsolute: scored.reduce((sum, point) => sum + Math.abs(point.residualDb), 0) / scored.length,
  };
}

function valleyDeficit(points, region) {
  const inside = points.filter((point) => point.frequency >= region.startHz && point.frequency <= region.endHz);
  return inside.length
    ? inside.reduce((sum, point) => sum + Math.max(0, -point.residualDb), 0) / inside.length
    : 0;
}

function shoulderPeak(points, region) {
  const candidates = points.filter((point) => !point.protected && (
    (point.frequency >= region.startHz / 2 ** 0.5 && point.frequency < region.startHz)
    || (point.frequency > region.endHz && point.frequency <= region.endHz * 2 ** 0.35)
  )).sort((left, right) => right.residualDb - left.residualDb);
  return (candidates[0]?.residualDb ?? 0) >= 2 ? candidates[0] : null;
}

function realSeatsSafe(before, after) {
  const beforeById = new Map((before?.seatMetrics || []).map((seat) => [seat.seatId, seat]));
  return (after?.seatMetrics || []).every((seat) => {
    if (seat.seatId === "rsp") return true;
    const baseline = beforeById.get(seat.seatId);
    return !baseline || seat.maxAbsDeviationDb <= baseline.maxAbsDeviationDb + 1;
  });
}

function protectedNullsSafe(current, proposed, protectedRegions) {
  return (protectedRegions || []).every((region) => {
    const centre = region.centreFrequencyHz;
    return !Number.isFinite(centre) || correctionAt(centre, proposed) - correctionAt(centre, current) <= 0.5;
  });
}

const signature = (filters) => filters.map((filter) =>
  `${Number(filter.frequencyHz).toFixed(3)}/${Number(filter.gainDb).toFixed(3)}/${Number(filter.Q).toFixed(3)}`
).join("|");

__REBALANCE_BODY__
