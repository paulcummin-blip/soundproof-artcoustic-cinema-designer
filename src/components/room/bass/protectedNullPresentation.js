import { interpolateCurve } from "@/components/room/bass/candidateConsistency";
import { nearestRoomModes } from "@/components/room/bass/roomModePresentation";

export function buildProtectedNullAnnotations(candidate, roomModes = [], rawCurve = []) {
  if (!candidate) return [];
  const raw = rawCurve;
  const target = candidate.productionHouseCurveTarget || [];
  const eq = candidate.combinedEqCurve || [];
  const post = candidate.finalPostEqCurve || [];
  return (candidate.protectedNullRegions || []).map((region) => {
    const points = raw.filter((point) => point.frequency >= region.startHz && point.frequency <= region.endHz);
    const marker = points.length ? points.reduce((worst, point) => {
      const residual = point.spl - interpolateCurve(target, point.frequency);
      return !worst || residual < worst.residual ? { frequency: point.frequency, residual } : worst;
    }, null) : { frequency: region.centreFrequencyHz, residual: region.signedResidualDb };
    const frequencyHz = marker.frequency;
    const rawSpl = interpolateCurve(raw, frequencyHz);
    const targetSpl = interpolateCurve(target, frequencyHz);
    const appliedEqDb = interpolateCurve(eq, frequencyHz);
    const postEqSpl = interpolateCurve(post, frequencyHz);
    const remainingResidualDb = Number.isFinite(postEqSpl) && Number.isFinite(targetSpl) ? postEqSpl - targetSpl : null;
    return {
      frequencyHz,
      startHz: region.startHz,
      endHz: region.endHz,
      rawDepthDb: Number.isFinite(rawSpl) && Number.isFinite(targetSpl) ? rawSpl - targetSpl : region.signedResidualDb,
      appliedEqDb,
      remainingResidualDb,
      reason: region.reason || region.rejectionReason,
      nearestModes: nearestRoomModes(frequencyHz, roomModes),
      label: `Protected cancellation null near ${frequencyHz.toFixed(1)} Hz — full boost avoided; consider changing subwoofer or seat position.`,
    };
  });
}