import { applyBassSmoothing } from "@/components/room/bass/bassGraphSmoothing";
import { interpolateCanonicalTarget } from "@/components/utils/houseCurveTargetAuthority";

const requestKey = (candidate) => [
  candidate?.requestedP14Level, candidate?.requestedP18Level, candidate?.requestedP19Level,
  candidate?.requestedTargetSpl, candidate?.assessmentStartHz, candidate?.assessmentEndHz,
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

function preEqCurve(candidate) {
  const corrections = new Map((candidate?.combinedEqCurve || []).map((point) => [Number(point.frequency), Number(point.spl)]));
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
    if (Array.isArray(regions)) nullsByRequest.set(requestKey(candidate), regions);
  });
  return source.map((candidate) => {
    const protectedNullRegions = nullsByRequest.get(requestKey(candidate)) || [];
    const postEqMetrics = rankingMetrics(candidate?.finalPostEqCurve, candidate, protectedNullRegions);
    const preEqMetrics = rankingMetrics(preEqCurve(candidate), candidate, protectedNullRegions);
    return {
      ...candidate,
      preEqHouseCurveErrorDb: preEqMetrics.rmsResidualDb,
      postEqHouseCurveErrorDb: postEqMetrics.rmsResidualDb,
      houseCurveRankingMaxResidualDb: postEqMetrics.maximumAbsoluteResidualDb,
      houseCurveRankingRmsResidualDb: postEqMetrics.rmsResidualDb,
      houseCurveRankingMeanAbsoluteResidualDb: postEqMetrics.meanAbsoluteResidualDb,
      houseCurveRankingProtectedNullCount: protectedNullRegions.length,
    };
  });
}