// calibrationIdentityGuard.js
// The physical-identity guard for automatic calibration application.
//
// A candidate whose confirmed tuning was derived under a DIFFERENT physical
// configuration — different subwoofer positions, different seating, a different
// subwoofer quantity, or a coordinated combination of seating and subwoofers —
// must NEVER have its tuning automatically applied to the installed design.
// The tuning was optimised for a geometry the installed design does not share,
// so applying it would produce a different acoustic result than the one that
// was canonically confirmed.
//
// This guard reads the physical-identity markers the V2 engine, the combined
// search and the coordinated search already stamp on every confirmed
// candidate. It invents nothing and changes no acoustic maths, scoring,
// threshold, budget, candidate generation or ranking: it is a read-only filter
// that keeps the calibration auto-apply path honest.
//
// Genuine calibration-only candidates — grouped delay, gain, polarity,
// all-pass phase, and the calibration-only combined retune (all run on the
// installed Current geometry) — pass through unchanged.

/**
 * Does this confirmed result carry a physical-identity marker that means its
 * tuning was derived from a different physical configuration?
 *
 * @param {object|null} result - a confirmed candidate result
 * @returns {boolean} true when the candidate involves a physical change
 */
export function isPhysicalIdentityCandidate(result) {
  if (!result) return false;
  // Cross-quantity: different subwoofer count — tuning binds to synthetic IDs.
  if (result.isCrossQuantity === true) return true;
  // Position candidate: different subwoofer positions.
  if (result.isPositionCandidate === true) return true;
  // Phase 9B coordinated: combined seating + subwoofer move.
  if (result.isCoordinatedCandidate === true) return true;
  if (result.isPhysicalAlternative === true) return true;
  // Seating-only candidate: moved seating, same subs.
  if (result.candidateKind === "seating") return true;
  // Position candidate kind (global placement also moves positions).
  if (result.candidateKind === "position") return true;
  // Non-zero seating offset = seating moved.
  const seatingOffset = Number(result.seatingOffsetMm);
  if (Number.isFinite(seatingOffset) && seatingOffset !== 0) return true;
  // Combined candidate that involved seating (calibration + seating retune).
  if (result.candidateOrigin === "combined-calibration-seating") return true;
  // Combined candidate that involved a position candidate.
  if (result.combinedFrom?.positionCandidateId) return true;
  // Combined candidate with a non-zero seating offset recorded in combinedFrom.
  const combinedSeatingOffset = Number(result.combinedFrom?.seatingOffsetMm);
  if (Number.isFinite(combinedSeatingOffset) && combinedSeatingOffset !== 0) return true;
  return false;
}

/**
 * Is this confirmed result a genuine calibration-only candidate whose tuning
 * was derived from the installed geometry and may be considered for automatic
 * application?
 *
 * @param {object|null} result - a confirmed candidate result
 * @returns {boolean}
 */
export function isCalibrationOnlyResult(result) {
  return !isPhysicalIdentityCandidate(result);
}