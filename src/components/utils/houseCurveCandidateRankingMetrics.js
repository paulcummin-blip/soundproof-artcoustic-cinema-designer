import { applyBassSmoothing } from "@/components/room/bass/bassGraphSmoothing";
import { artcousticHouseCurveOffsetAt } from "@/components/utils/artcousticHouseCurve";

const requestKey = (candidate) => [
  candidate?.requestedP14Level, candidate?.requestedP18Level, candidate?.requestedP19Level,
  candidate?.requestedTargetSpl, candidate?.assessmentStartHz, candidate?.assessmentEndHz,
].join("|");

function outsideProtectedNulls(frequency, regions) {
  return !regions.some((region) => frequency >= region.startHz && frequency <= region.endHz);
}

function rankingMetrics(candidate, protectedNullRegions) {
  const points = applyBassSmoothing(candidate?.finalPostEqCurve || [], "third")
    .filter((point) => point.frequency >= candidate.assessmentStartHz && point.frequency <= candidate.assessmentEndHz)
    .filter((point) => outsideProtectedNulls(point.frequency, protectedNullRegions))
    .map((point) => point.spl - (candidate.requestedTargetSpl + artcousticHouseCurveOffsetAt(point.frequency)))
    .filter(Number.isFinite);
  if (!points.length) return { maximumAbsoluteResidualDb: null, rmsResidualDb: null, meanAbsoluteResidualDb: null };
  return {
    maximumAbsoluteResidualDb: Math.max(...points.map(Math.abs)),
    rmsResidualDb: Math.sqrt(points.reduce((sum, value) => sum + value ** 2, 0) / points.length),
    meanAbsoluteResidualDb: points.reduce((sum, value) => sum + Math.abs(value), 0) / points.length,
  };
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
    const metrics = rankingMetrics(candidate, protectedNullRegions);
    return {
      ...candidate,
      houseCurveRankingMaxResidualDb: metrics.maximumAbsoluteResidualDb,
      houseCurveRankingRmsResidualDb: metrics.rmsResidualDb,
      houseCurveRankingMeanAbsoluteResidualDb: metrics.meanAbsoluteResidualDb,
      houseCurveRankingProtectedNullCount: protectedNullRegions.length,
    };
  });
}