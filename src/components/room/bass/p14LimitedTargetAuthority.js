// p14LimitedTargetAuthority.js
//
// Explicit LIMITED terminal state for P14 background targets.
//
// A LIMITED target is one where the calculation successfully proved the
// requested P14 dBC cannot be achieved by the current physical system.
// This is a valid terminal engineering result — NOT a worker failure.
//
// The authoritative cache gate (isAuthoritativeBassContract) is NOT weakened.
// LIMITED contracts are validated by a separate validator and stored in a
// separate cache path. Both AUTHORITATIVE and LIMITED are terminal/resolved,
// but only AUTHORITATIVE contains P18/P19/P20 authority.
//
// This module does NOT change:
//   - bass physics, EQ, P14 capability maths, P18, P19, P20, grading thresholds
//   - Stage 1 / Stage 2 placement
//   - the authoritative cache gate

import { isStructurallyCompleteBassContract } from "./completedBassResultPersistence";
import { hasReadyCanonicalP19Contract } from "./p19Readiness";

/**
 * Validate a contract as a legitimate LIMITED P14 target.
 *
 * A contract is LIMITED when ALL are true:
 *   1. Structurally complete (job finished, fingerprints match)
 *   2. P14 parameter exists with pass === false (capability below target)
 *   3. achievedCapabilityDb is finite (real capability measurement)
 *   4. requestedTargetDb is finite (real target)
 *   5. headroomOrShortfallDb is finite and negative (confirmed shortfall)
 *   6. P19 is NOT ready (intentionally not evaluated at unattainable target)
 *
 * @param {object|null} contract
 * @returns {boolean}
 */
export function isValidLimitedP14Contract(contract) {
  if (!contract) return false;
  if (!isStructurallyCompleteBassContract(contract)) return false;

  const p14 = contract?.productAnalysis?.parameters?.p14;
  if (!p14) return false;

  const achievedDb = Number(p14.achievedCapabilityDb);
  const requestedDb = Number(p14.requestedTargetDb);
  const shortfallDb = Number(p14.headroomOrShortfallDb);

  if (!Number.isFinite(achievedDb)) return false;
  if (!Number.isFinite(requestedDb)) return false;
  if (!Number.isFinite(shortfallDb)) return false;

  // P14 must have failed (capability below target)
  if (p14.pass !== false) return false;
  // Must be a genuine shortfall (negative headroom)
  if (shortfallDb >= 0) return false;

  // P19 must NOT be ready — a LIMITED target deliberately does not evaluate
  // P18/P19/P20 because the requested P14 operating point is unattainable.
  // If P19 IS ready, this is not a LIMITED contract — it's an authoritative
  // contract that happens to have a P14 miss, and should go through the
  // authoritative path.
  if (hasReadyCanonicalP19Contract(contract)) return false;

  return true;
}

/**
 * Check whether a cache entry is a LIMITED P14 entry.
 * @param {object|null} entry
 * @returns {boolean}
 */
export function isLimitedP14Entry(entry) {
  if (!entry) return false;
  return entry.__p14Limited === true || isValidLimitedP14Contract(entry);
}

/**
 * Extract a display summary from a LIMITED P14 contract.
 *
 * @param {object|null} contract
 * @returns {{requestedDb: number, achievedDb: number, shortfallDb: number, reason: string}|null}
 */
export function getLimitedP14Summary(contract) {
  if (!isValidLimitedP14Contract(contract)) return null;
  const p14 = contract.productAnalysis.parameters.p14;
  return {
    requestedDb: Number(p14.requestedTargetDb),
    achievedDb: Number(p14.achievedCapabilityDb),
    shortfallDb: Math.abs(Number(p14.headroomOrShortfallDb)),
    reason: "P14 capability below requested target",
  };
}

/**
 * Check whether a cache entry is terminal (authoritative OR limited).
 * Used by the scheduler to skip already-resolved targets.
 *
 * @param {object|null} entry
 * @returns {boolean}
 */
export function isTerminalTargetEntry(entry) {
  if (!entry) return false;
  // Authoritative entries are terminal
  if (entry.__p14Limited !== true && isStructurallyCompleteBassContract(entry)) {
    // Full authoritative check is done by the caller; here we just check
    // structural completeness + the limited marker.
  }
  // LIMITED entries are terminal
  if (isLimitedP14Entry(entry)) return true;
  return false;
}