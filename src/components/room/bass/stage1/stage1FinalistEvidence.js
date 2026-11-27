import { resolveSeatPriority, PRIMARY } from "@/components/utils/seatPriorityAuthority";
import { STAGE1_REFINEMENT_POINTS_PER_OCTAVE as PPO } from "./stage1Constants";

export function finalistKey(candidate, quantity, fingerprint) {
  const sources = candidate?.sources;
  if (!candidate?.id || !fingerprint || !Array.isArray(sources) || sources.length !== quantity ||
      !sources.every(s => Number.isFinite(s?.xNorm) && Number.isFinite(s?.yNorm))) return null;
  return JSON.stringify([fingerprint.split("|")[0], quantity, candidate.id, sources.map(s => [s.xNorm, s.yNorm])]);
}

export function verifiedFinalist(candidate, quantity, fingerprint, seats) {
  const key = finalistKey(candidate, quantity, fingerprint);
  const response = candidate?.responseEvidence;
  const metrics = candidate?.screening;
  if (!key || response?.key !== key || metrics?.key !== key || response.ppo !== PPO ||
      metrics.sourceCount !== quantity || !metrics.rspAvailable) return false;
  const frequencies = response.frequencies;
  // Two octaves at the validated resolution. End-point inclusion depends on the frequency grid.
  if (!Array.isArray(frequencies) || frequencies.length < 2 * PPO || frequencies.length > 2 * PPO + 1 ||
      !frequencies.every((f,i) => Number.isFinite(f) && f >= 20 && f <= 80 &&
        (!i || Math.abs(Math.log2(f / frequencies[i-1]) * PPO - 1) < 0.02))) return false;
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
