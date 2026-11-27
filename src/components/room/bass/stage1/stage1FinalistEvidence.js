import { buildFrequencyAxis } from "@/bass/core/rewCorePrimitives";
import { resolveSeatPriority, PRIMARY } from "@/components/utils/seatPriorityAuthority";
import { STAGE1_REFINEMENT_POINTS_PER_OCTAVE as PPO } from "./stage1Constants";

const displayGrid = buildFrequencyAxis(15, 200, PPO).filter(hz => hz >= 20 && hz <= 80);

export function finalistKey(candidate, quantity, fingerprint) {
  const sources = candidate?.sources;
  if (!candidate?.id || !fingerprint || !Array.isArray(sources) || sources.length !== quantity ||
      !sources.every(s => Number.isFinite(s?.xNorm) && Number.isFinite(s?.yNorm) &&
        s.xNorm >= 0 && s.xNorm <= 1 && s.yNorm >= 0 && s.yNorm <= 1)) return null;
  return JSON.stringify([fingerprint.split("|")[0], quantity, candidate.id, sources.map(s => [s.xNorm, s.yNorm])]);
}

export function verifiedFinalist(candidate, quantity, fingerprint, seats) {
  const key = finalistKey(candidate, quantity, fingerprint);
  const response = candidate?.responseEvidence;
  const metrics = candidate?.screening;
  if (!key || response?.key !== key || metrics?.key !== key || response.ppo !== PPO ||
      metrics.sourceCount !== quantity || !metrics.rspAvailable) return false;
  const frequencies = response.frequencies;
  if (!Array.isArray(frequencies) || frequencies.length !== displayGrid.length ||
      !frequencies.every((f,i) => Number.isFinite(f) && Math.abs(f - displayGrid[i]) < 1e-8)) return false;
  const validCurve = curve => Array.isArray(curve) && curve.length === frequencies.length &&
    curve.every((p,i) => p?.frequency === frequencies[i] && Number.isFinite(p.spl));
  const validDepth = d => Number.isFinite(d?.depthDb) && d.depthDb >= 0 && Number.isFinite(d.centreHz);
  if (!validCurve(response.rspCurve) || !validDepth(metrics.deepestRspDepression)) return false;
  const listeners = (seats || []).filter(s => Number.isFinite(s?.x) && Number.isFinite(s?.y));
  const curves = response.seatCurves;
  if (!Array.isArray(curves) || curves.length !== listeners.length) return false;
  const ids = new Set(curves.map(c => c.originalSeatId || c.seatKey));
  if (ids.size !== listeners.length || !listeners.every((s,i) => ids.has(s.id || "__seat_" + i + "__")) ||
      !curves.every(c => validCurve(c.responseData))) return false;
  const primaryCount = listeners.filter(s => resolveSeatPriority(s) === PRIMARY).length;
  return metrics.primarySeatCount === primaryCount && metrics.secondarySeatCount === listeners.length - primaryCount &&
    (!primaryCount || validDepth(metrics.deepestPrimaryDepression)) &&
    ["primarySevereProblemCount","primarySeatsWithSevereBroadNulls","worstPrimarySpatialVariation",
     "primaryResponseSmoothness","primaryRspCoherence","secondarySpatialConsistency","efficiencyIndicator"]
    .every(name => Number.isFinite(metrics[name]));
}
