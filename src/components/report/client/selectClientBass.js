/**
 * selectClientBass
 * ----------------
 * Pure selector: passthrough of P14/P18/P19/P20 room results, per-seat
 * P19/P20 results, response arrays, target/RSP data, worst-seat IDs, and
 * publication verification state from the completed bass contract.
 *
 * No new simulation, no interpolation, no regrading.
 *
 * @param {Object} completedBassContract - from useCompletedBassAuthority
 * @param {Object} bassPresentation - from buildComplianceBassPresentation
 * @returns {Object|null} bass summary or null when contract absent
 */
export function selectClientBass(completedBassContract, bassPresentation) {
  if (!completedBassContract) return null;

  const params = completedBassContract?.productAnalysis?.parameters || {};
  const selectedCandidate = completedBassContract?.selectedCandidate || {};

  return {
    // Room-scope bass parameters (raw contract objects — presentation via bassPresentation)
    p14: params.p14 || null,
    p18: params.p18 || null,
    p19: params.p19 || null,
    p20: params.p20 || null,

    // Per-seat bass results
    perSeatP19Results: Array.isArray(selectedCandidate.perSeatP19Results)
      ? selectedCandidate.perSeatP19Results
      : [],
    perSeatP20Results: Array.isArray(selectedCandidate.perSeatP20Results)
      ? selectedCandidate.perSeatP20Results
      : [],

    // Publication verification state
    publicationVerified: bassPresentation?.publicationVerified === true,
    publicationRejectionReason: bassPresentation?.publicationRejectionReason || null,

    // Identity
    resultFingerprint: completedBassContract?.job?.resultFingerprint || null,
    selectedCandidateId: completedBassContract?.selectedCandidateId || null,
  };
}