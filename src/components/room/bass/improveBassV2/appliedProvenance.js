// appliedProvenance.js
// Minimal durable Apply provenance for the V2 Improve Bass Response workflow.
//
// DEFECT: isCalibrationApplied / isOptimisedApplied can return true when
// tuningSource === "v2-optimised" AND current values happen to match a newly
// generated candidate — even though the user never pressed Apply for that
// candidate/run. Matching state is NOT sufficient evidence of an Apply action.
//
// FIX: Stamp each subwoofer instance with an appliedV2Provenance object at
// the moment of a successful Apply. The provenance records:
//   - stageKey: which stage was applied ("delay" | "gain" | "subPositions" | "seating")
//   - candidateId: the candidate that was applied
//   - baselineFingerprint: the design fingerprint at run start
//   - appliedFingerprint: the design fingerprint at Apply time
//
// The APPLIED display checks provenance — it does NOT infer APPLIED solely
// from current sub values.

/**
 * Build a provenance record for an Apply action.
 *
 * @param {string} stageKey - "delay" | "gain" | "subPositions" | "seating"
 * @param {string} candidateId - the candidate ID from the selection
 * @param {string} baselineFingerprint - applyFingerprint from the selection
 * @param {string} appliedFingerprint - current design fingerprint at Apply time
 * @returns {object} provenance record
 */
export function buildProvenance(stageKey, candidateId, baselineFingerprint, appliedFingerprint) {
  return {
    stageKey: String(stageKey || ""),
    candidateId: String(candidateId || ""),
    baselineFingerprint: String(baselineFingerprint || ""),
    appliedFingerprint: String(appliedFingerprint || ""),
  };
}

/**
 * Check whether the current subwooferInstances have a provenance record that
 * matches the given stageKey and candidateId.
 *
 * This is the authoritative APPLIED check — it verifies that an actual Apply
 * action occurred for this specific candidate, not merely that values match.
 *
 * @param {Array} currentInstances - current subwooferInstances (ALL)
 * @param {string} stageKey - the stage to check
 * @param {string} candidateId - the candidate ID to check
 * @returns {boolean} true only if active instances carry matching provenance
 */
export function isProvenanceApplied(currentInstances, stageKey, candidateId) {
  if (!Array.isArray(currentInstances) || !stageKey || !candidateId) return false;

  const active = currentInstances.filter((s) => s.enabled !== false);
  if (!active.length) return false;

  // All active instances must carry the matching provenance. This is strict:
  // a single mismatch means the Apply was not for this candidate.
  for (const inst of active) {
    const p = inst?.appliedV2Provenance;
    if (!p || p.stageKey !== stageKey || p.candidateId !== candidateId) {
      return false;
    }
  }
  return true;
}

/**
 * Check whether ANY provenance exists on the current instances.
 * Used to distinguish "never applied" from "applied for a different candidate".
 *
 * @param {Array} currentInstances - current subwooferInstances (ALL)
 * @returns {object|null} the provenance if all active instances share one, or null
 */
export function getActiveProvenance(currentInstances) {
  if (!Array.isArray(currentInstances)) return null;
  const active = currentInstances.filter((s) => s.enabled !== false);
  if (!active.length) return null;
  const first = active[0]?.appliedV2Provenance;
  if (!first) return null;
  // Verify all active instances share the same provenance
  for (const inst of active) {
    const p = inst?.appliedV2Provenance;
    if (!p || p.stageKey !== first.stageKey || p.candidateId !== first.candidateId) {
      return null;
    }
  }
  return first;
}