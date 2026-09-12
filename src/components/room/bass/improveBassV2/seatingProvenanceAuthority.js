// seatingProvenanceAuthority.js
// Authority for checking whether a Seating Positions stage result has been
// genuinely APPLIED via the persisted project-level seating provenance.
//
// Unlike Delay/Gain/Position (which stamp provenance on subwooferInstances),
// Seating mutates seatingPositions — so provenance cannot live on sub
// instances. It is stored at the project level as `appliedSeatingProvenance`.
//
// APPLIED requires ALL of:
//   - stageKey === "seating_positions"
//   - candidateId matches the historical result's candidateId
//   - baselineFingerprint matches the run-start fingerprint (applyFingerprint)
//   - appliedFingerprint is present (the post-mutation fingerprint)
//
// It must NOT inspect subwooferInstances for Seating Apply.

/**
 * Check whether a seating stage result has been applied via persisted
 * project-level seating provenance.
 *
 * @param {object} appliedSeatingProvenance - persisted project-level provenance
 * @param {object} stageResult - the stage result from buildStageResults
 * @param {string} winnerApplyFingerprint - the run-start fingerprint (state.winner.applyFingerprint)
 * @returns {boolean} true only if provenance matches the historical result
 */
export function isSeatingProvenanceApplied(appliedSeatingProvenance, stageResult, winnerApplyFingerprint) {
  if (!appliedSeatingProvenance || !stageResult?.result) return false;

  const prov = appliedSeatingProvenance;
  const candidateId = stageResult.result.candidateId;

  // stageKey must be seating_positions
  if (prov.stageKey !== "seating_positions") return false;

  // candidateId must match the historical result
  if (!candidateId || prov.candidateId !== candidateId) return false;

  // baselineFingerprint must match the run-start fingerprint
  if (!winnerApplyFingerprint || prov.baselineFingerprint !== winnerApplyFingerprint) return false;

  // appliedFingerprint must be present (post-mutation fingerprint)
  if (!prov.appliedFingerprint) return false;

  return true;
}