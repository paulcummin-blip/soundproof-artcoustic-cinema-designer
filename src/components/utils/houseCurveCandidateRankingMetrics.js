import { applyBassSmoothing } from "@/components/room/bass/bassGraphSmoothing";
import { interpolateCanonicalTarget } from "@/components/utils/houseCurveTargetAuthority";

const objectiveKey = (candidate) => [
  candidate?.canonicalVerticalOffsetDb, candidate?.assessmentStartHz, candidate?.assessmentEndHz,
  candidate?.correctionStartHz, candidate?.correctionEndHz,
].join("|");

function outsideProtectedNulls(frequency, regions) {
  return !regions.some((region) => frequency >= region.startHz && frequency <= region.endHz);
}

function rankingMetrics(curve, candidate, protectedNullRegions) {
  const points = applyBassSmoothing(curve || [], "third")
    .filter((point) => point.frequency >= candidate.correctionStartHz && point.frequency <= candidate.correctionEndHz)
    .filter((point) => outsideProtectedNulls(point.frequency, protectedNullRegions))
    .map((point) => point.spl - interpolateCanonicalTarget(candidate.productionHouseCurveTarget, point.frequency))
    .filter(Number.isFinite);
  if (!points.length) return { maximumAbsoluteResidualDb: null, rmsResidualDb: null, meanAbsoluteResidualDb: null };
  return {
    maximumAbsoluteResidualDb: Math.max(...points.map(Math.abs)),
    rmsResidualDb: Math.sqrt(points.reduce((sum, value) => sum + value ** 2, 0) / points.length),
    meanAbsoluteResidualDb: points.reduce((sum, value) => sum + Math.abs(value), 0) / points.length,
  };
}

function interpolateCurveSpl(curve, frequency) {
  const points = Array.isArray(curve) ? curve : [];
  if (!points.length || !Number.isFinite(frequency)) return null;
  if (frequency <= points[0].frequency) return Number(points[0].spl);
  if (frequency >= points.at(-1).frequency) return Number(points.at(-1).spl);
  const upperIndex = points.findIndex((point) => point.frequency >= frequency);
  const low = points[upperIndex - 1];
  const high = points[upperIndex];
  const span = high.frequency - low.frequency;
  if (!(span > 0)) return Number(low.spl);
  const ratio = (frequency - low.frequency) / span;
  return Number(low.spl) + (Number(high.spl) - Number(low.spl)) * ratio;
}

function avoidableTargetShortfallMetrics(curve, candidate, protectedNullRegions) {
  if (!Array.isArray(candidate?.maximumSplCurveBeforeEq) || !candidate.maximumSplCurveBeforeEq.length) {
    return { maximumDb: null, rmsDb: null, meanDb: null, pointCount: 0 };
  }
  const maximumCurve = applyBassSmoothing(candidate.maximumSplCurveBeforeEq, "third");
  const shortfalls = applyBassSmoothing(curve || [], "third")
    .filter((point) => point.frequency >= candidate.correctionStartHz && point.frequency <= candidate.correctionEndHz)
    .filter((point) => outsideProtectedNulls(point.frequency, protectedNullRegions))
    .map((point) => {
      const targetSpl = interpolateCanonicalTarget(candidate.productionHouseCurveTarget, point.frequency);
      const maximumSpl = interpolateCurveSpl(maximumCurve, point.frequency);
      if (!Number.isFinite(targetSpl) || !Number.isFinite(maximumSpl) || maximumSpl < targetSpl - 0.05) return null;
      return Math.max(0, targetSpl - point.spl);
    })
    .filter(Number.isFinite);
  if (!shortfalls.length) return { maximumDb: null, rmsDb: null, meanDb: null, pointCount: 0 };
  return {
    maximumDb: Math.max(...shortfalls),
    rmsDb: Math.sqrt(shortfalls.reduce((sum, value) => sum + value ** 2, 0) / shortfalls.length),
    meanDb: shortfalls.reduce((sum, value) => sum + value, 0) / shortfalls.length,
    pointCount: shortfalls.length,
  };
}

function preEqCurve(candidate) {
  if (Array.isArray(candidate?.rspBeforePeqAtOperatingLevel)
    && candidate.rspBeforePeqAtOperatingLevel.length) {
    return candidate.rspBeforePeqAtOperatingLevel;
  }
  const corrections = new Map((candidate?.combinedEqCurve || [])
    .map((point) => [Number(point.frequency), Number(point.spl)]));
  return (candidate?.finalPostEqCurve || []).map((point) => ({
    frequency: point.frequency,
    spl: point.spl - (corrections.get(Number(point.frequency)) || 0),
  }));
}

export function annotateCandidatePoolForHouseCurveRanking(candidates) {
  const source = Array.isArray(candidates) ? candidates : [];
  const nullsByRequest = new Map();
  source.forEach((candidate) => {
    if (candidate?.designEqFitProfile !== "house_curve") return;
    const regions = candidate?.houseCurveDiagnostics?.protectedNullRegions;
    if (Array.isArray(regions)) nullsByRequest.set(objectiveKey(candidate), regions);
  });
  return source.map((candidate) => {
    const protectedNullRegions = nullsByRequest.get(objectiveKey(candidate)) || candidate?.protectedNullRegions || [];
    const postEqMetrics = rankingMetrics(candidate?.finalPostEqCurve, candidate, protectedNullRegions);
    const preEqMetrics = rankingMetrics(preEqCurve(candidate), candidate, protectedNullRegions);
    const avoidableShortfall = avoidableTargetShortfallMetrics(
      candidate?.finalPostEqCurve, candidate, protectedNullRegions,
    );
    return {
      ...candidate,
      preEqHouseCurveErrorDb: preEqMetrics.rmsResidualDb,
      postEqHouseCurveErrorDb: postEqMetrics.rmsResidualDb,
      houseCurveRankingMaxResidualDb: postEqMetrics.maximumAbsoluteResidualDb,
      houseCurveRankingRmsResidualDb: postEqMetrics.rmsResidualDb,
      houseCurveRankingMeanAbsoluteResidualDb: postEqMetrics.meanAbsoluteResidualDb,
      avoidableTargetShortfallMaxDb: avoidableShortfall.maximumDb,
      avoidableTargetShortfallRmsDb: avoidableShortfall.rmsDb,
      avoidableTargetShortfallMeanDb: avoidableShortfall.meanDb,
      avoidableTargetShortfallPointCount: avoidableShortfall.pointCount,
      houseCurveRankingProtectedNullCount: protectedNullRegions.length,
    };
  });
}