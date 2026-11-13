// combinedElectronicIdentityProof.js
// ---------------------------------------------------------------------------
// Positive identity proof for a combined electronic (crossover + tuning)
// optimiser winner.
//
// A combined electronic candidate was canonically confirmed on the INSTALLED
// geometry: the same subwoofer models, positions, orientation, height, seating
// and RSP as the current design. Its tuning (delay, gain, phase, polarity) and
// crossover config may be applied ONLY when every one of those identities is
// proven to match. This module proves that — it invents nothing, weakens no
// existing guard, and never sets calibrationOnly true by default.
//
// IDENTITY DOMAINS — the V2 engine stamps TWO distinct fingerprints on every
// bound candidate:
//   - inputIdentity    = startFingerprint (V2 design fingerprint, full format)
//   - baselineCacheKey = liveCacheKey (completed-bass-authority cache key)
// OptimiseAndCalculate passes identity.cacheKey = currentShared.cacheKey and
// identity.inputIdentity = the run's V2 start fingerprint. Each domain is
// checked against its OWN authority — never cross-domain. A cross-domain
// comparison (inputIdentity vs cacheKey) always rejects real candidates.
//
// When identity or payload completeness cannot be established, the candidate
// must NOT become an actionable calibration winner. The proof returns its
// issues so the plan builder can state them instead of fabricating a lever.
//
// READ-ONLY: reads the confirmed winner and the current design snapshot. It
// changes no acoustic maths, no scoring, no grading, and no search.
// ---------------------------------------------------------------------------

import { activeInstances } from "./optimiserPlanMatching.js";

/**
 * Does the winner carry a complete, usable crossover configuration object?
 * A crossover config is complete when it states a finite frequency, valid
 * slopes and a linking flag. Missing any field is incomplete — never defaulted.
 */
function crossoverIsComplete(crossover) {
  if (!crossover || typeof crossover !== "object") return false;
  const frequencyHz = Number(crossover.frequencyHz);
  if (!Number.isFinite(frequencyHz) || frequencyHz <= 0) return false;
  const hp = Number(crossover.speakerHpSlopeDbPerOct);
  const lp = Number(crossover.subwooferLpSlopeDbPerOct);
  if (!Number.isFinite(hp) || !Number.isFinite(lp)) return false;
  if (typeof crossover.linkFrequencies !== "boolean") return false;
  if (crossover.linkFrequencies === false) {
    const subFreq = Number(crossover.subwooferFrequencyHz);
    if (!Number.isFinite(subFreq) || subFreq <= 0) return false;
  }
  return true;
}

/**
 * Does the winner carry a complete per-source tuning array that matches the
 * installed active subwoofer instances?
 */
function tuningIsComplete(tuning, instances) {
  if (!Array.isArray(tuning) || tuning.length === 0) return false;
  const active = activeInstances(instances);
  if (tuning.length !== active.length) return false;
  const activeIds = new Set(active.map((inst) => inst?.id).filter(Boolean));
  if (activeIds.size !== active.length) return false;
  const seenIds = new Set();
  for (const entry of tuning) {
    if (!entry?.sourceId || !activeIds.has(entry.sourceId)) return false;
    if (seenIds.has(entry.sourceId)) return false; // duplicate ID
    seenIds.add(entry.sourceId);
    if (!Number.isFinite(Number(entry.delayMs))) return false;
    if (!Number.isFinite(Number(entry.gainDb))) return false;
    if (!Number.isFinite(Number(entry.phaseControlDeg ?? entry.phaseAdjust))) return false;
    const polarity = Number(entry.polarity);
    if (![0, 1, -1, 180].includes(polarity)) return false;
  }
  return true;
}

/**
 * Does the winner carry any marker that means its tuning was derived from a
 * DIFFERENT physical configuration? Reuses the same markers the engine stamps
 * on physical and cross-quantity candidates — it never invents new ones.
 */
function hasPhysicalChangeMarker(winner) {
  if (!winner) return true;
  if (winner.isPositionCandidate === true) return true;
  if (winner.isCrossQuantity === true) return true;
  if (winner.isCoordinatedCandidate === true) return true;
  if (winner.isPhysicalAlternative === true) return true;
  if (winner.candidateKind === "position" || winner.candidateKind === "seating") return true;
  const seatingOffset = Number(winner.seatingOffsetMm);
  if (Number.isFinite(seatingOffset) && seatingOffset !== 0) return true;
  if (winner.candidateOrigin === "combined-calibration-seating") return true;
  if (winner.combinedFrom?.positionCandidateId) return true;
  const combinedSeatingOffset = Number(winner.combinedFrom?.seatingOffsetMm);
  if (Number.isFinite(combinedSeatingOffset) && combinedSeatingOffset !== 0) return true;
  return false;
}

/**
 * Require two fingerprint values to be nonempty strings that match exactly.
 * Returns an issue string when the check fails, null when it passes.
 */
function fingerprintMatches(candidateValue, authorityValue, label) {
  if (!candidateValue || typeof candidateValue !== "string") {
    return `The winning candidate's ${label} is missing.`;
  }
  if (!authorityValue || typeof authorityValue !== "string") {
    return `The current design's ${label} is missing — re-run the Optimisation Plan.`;
  }
  if (candidateValue !== authorityValue) {
    return `The winning candidate's ${label} does not match the current design — re-run the Optimisation Plan.`;
  }
  return null;
}

/**
 * Prove that a combined electronic winner's identity matches the installed
 * design and that its payload is complete.
 *
 * Two identity domains are checked, each against its own authority:
 *   - winner.inputIdentity (V2 start fingerprint) vs identity.inputIdentity
 *   - winner.baselineCacheKey (live cache key) vs identity.cacheKey
 *
 * Both must be nonempty and match exactly. A cross-domain comparison is never
 * performed.
 *
 * @param {object} params
 * @param {object|null} params.winner - the confirmed combined electronic winner
 * @param {Array} params.instances - current subwooferInstances
 * @param {object} [params.identity] - the run's identity
 * @param {string} [params.identity.inputIdentity] - V2 start fingerprint authority
 * @param {string} [params.identity.cacheKey] - completed-bass cache key authority
 * @param {string} [params.identity.designFingerprint] - alias for cacheKey
 * @returns {{valid: boolean, issues: string[]}}
 */
export function proveCombinedElectronicIdentity({ winner, instances, identity = {} } = {}) {
  const issues = [];

  if (!winner) {
    return { valid: false, issues: ["No combined electronic winner was provided."] };
  }

  // 1. Complete crossover payload.
  if (!crossoverIsComplete(winner.crossover)) {
    issues.push("The winning candidate's crossover configuration is incomplete.");
  }

  // 2. Complete per-source tuning matching the installed instances.
  if (!tuningIsComplete(winner.appliedTuning || winner.tuning, instances)) {
    issues.push("The winning candidate's per-source tuning does not match the installed subwoofers.");
  }

  // 3. No physical placement or seating change involved.
  if (hasPhysicalChangeMarker(winner)) {
    issues.push("The winning candidate involves a physical placement or seating change — it is not a calibration-only electronic result.");
  }

  // 4. Fingerprint domains — each checked against its own authority.
  const cacheKeyAuthority = identity.cacheKey || identity.designFingerprint || null;
  const inputIdentityIssue = fingerprintMatches(
    winner.inputIdentity || null,
    identity.inputIdentity || null,
    "V2 design fingerprint (inputIdentity)",
  );
  if (inputIdentityIssue) issues.push(inputIdentityIssue);

  const cacheKeyIssue = fingerprintMatches(
    winner.baselineCacheKey || null,
    cacheKeyAuthority,
    "completed-bass cache key (baselineCacheKey)",
  );
  if (cacheKeyIssue) issues.push(cacheKeyIssue);

  // 5. This IS a crossover integration candidate.
  if (winner.combinedFrom?.crossover !== true) {
    issues.push("The winning candidate is not a combined crossover integration result.");
  }

  return { valid: issues.length === 0, issues };
}