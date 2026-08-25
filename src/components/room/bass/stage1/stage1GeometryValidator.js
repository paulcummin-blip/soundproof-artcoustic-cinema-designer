// stage1GeometryValidator.js
// A-prohibition geometry validator.
// RP22 Figure 7-2 layout A (four interior quarter-grid) is PROHIBITED.
// This validator recognises the A topology under source permutation and
// rejects candidates approximately matching it.

import { STAGE1_A_PROHIBITION_TOLERANCE_NORM } from "./stage1Constants";

// A topology: four interior quarter-grid positions (normalised).
const A_TARGET_POSITIONS = Object.freeze([
  { xNorm: 0.25, yNorm: 0.25 },
  { xNorm: 0.75, yNorm: 0.25 },
  { xNorm: 0.25, yNorm: 0.75 },
  { xNorm: 0.75, yNorm: 0.75 },
]);

function normDistance(a, b) {
  const dx = a.xNorm - b.xNorm;
  const dy = a.yNorm - b.yNorm;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Check whether a set of source positions (normalised) matches the A topology
 * under source permutation, within tolerance.
 *
 * Uses a greedy bipartite matching: for each A target, find the closest
 * unassigned source. If all A targets are matched within tolerance, the
 * candidate matches A and must be rejected.
 *
 * @param {Array<{xNorm:number, yNorm:number}>} sources — normalised source positions
 * @param {number} tolerance — normalised tolerance (default from constants)
 * @returns {{ isA: boolean, matchedCount: number, maxDistance: number }}
 */
export function matchesAProhibitedTopology(sources, tolerance = STAGE1_A_PROHIBITION_TOLERANCE_NORM) {
  if (!Array.isArray(sources) || sources.length !== 4) return { isA: false, matchedCount: 0, maxDistance: Infinity };

  const assigned = new Array(sources.length).fill(false);
  let matchedCount = 0;
  let maxDistance = 0;

  for (const target of A_TARGET_POSITIONS) {
    let bestIndex = -1;
    let bestDist = Infinity;
    for (let i = 0; i < sources.length; i += 1) {
      if (assigned[i]) continue;
      const dist = normDistance(target, sources[i]);
      if (dist < bestDist) {
        bestDist = dist;
        bestIndex = i;
      }
    }
    if (bestIndex >= 0 && bestDist <= tolerance) {
      assigned[bestIndex] = true;
      matchedCount += 1;
      maxDistance = Math.max(maxDistance, bestDist);
    } else {
      return { isA: false, matchedCount, maxDistance };
    }
  }

  return { isA: matchedCount === 4, matchedCount, maxDistance };
}

/**
 * Validate a candidate layout against the A-prohibition rule.
 * @param {Array<{xNorm:number, yNorm:number}>} sources — normalised source positions
 * @returns {{ passes: boolean, reason: string|null }}
 */
export function validateAProhibition(sources) {
  const check = matchesAProhibitedTopology(sources);
  if (check.isA) {
    return {
      passes: false,
      reason: `Candidate matches prohibited RP22 A topology (matched ${check.matchedCount}/4 within tolerance ${STAGE1_A_PROHIBITION_TOLERANCE_NORM})`,
    };
  }
  return { passes: true, reason: null };
}

/**
 * Filter an array of candidate layouts, removing any that match the A topology.
 * @param {Array<{sources: Array<{xNorm:number, yNorm:number}>}>} candidates
 * @returns {{ accepted: Array, rejected: Array }}
 */
export function filterAProhibited(candidates) {
  const accepted = [];
  const rejected = [];
  for (const candidate of candidates) {
    const validation = validateAProhibition(candidate.sources);
    if (validation.passes) accepted.push(candidate);
    else rejected.push({ ...candidate, rejectionReason: validation.reason });
  }
  return { accepted, rejected };
}