// candidateGeometryMatchAuthority.js
// ---------------------------------------------------------------------------
// P0-1 guard: a calibration-only result may be auto-applied ONLY when its
// source identities, quantity, positions, seating geometry, RSP and processing
// assumptions match the installed configuration.
//
// A candidate whose confirmed result depends on changed physical geometry
// (moved subwoofers, changed subwoofer count, moved seating) must remain
// advisory — its tuning was computed for a different geometry and applying it
// to the installed design would be unsafe, regardless of the acoustic score.
//
// This is a pure boundary check consumed by the ONE calibration auto-apply
// decision authority (adiCalibrationAutoApplyAuthority.js). It reads only the
// candidate's own signals and the installed instances; it never invents
// coordinates, never re-derives acoustic results, and never changes a score.
// ---------------------------------------------------------------------------

import { resolveTuningInstances } from "../improveBassV2/improveBassV2ApplyCalibration.js";

/** Tolerance for detecting a nonzero seating offset (1 mm). */
const SEATING_OFFSET_TOLERANCE_MM = 1;

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

/**
 * Extract the per-source tuning a candidate carries, regardless of whether it
 * is stored under `appliedTuning` or `tuning`.
 *
 * @param {object} candidate - confirmed candidate result
 * @returns {Array} tuning rows (possibly empty)
 */
function candidateTuning(candidate) {
  const tuning = candidate?.appliedTuning || candidate?.tuning;
  return Array.isArray(tuning) ? tuning.filter(Boolean) : [];
}

/**
 * Verify that a calibration candidate's physical geometry matches the installed
 * configuration. Returns the list of mismatch reasons; an empty list means the
 * candidate is geometry-safe for automatic calibration application.
 *
 * Checks (all must pass):
 *   1. The candidate result does not signal changed subwoofer positions
 *      (`isPositionCandidate`, `combinedFrom.positionCandidateId`).
 *   2. The candidate result does not signal moved seating
 *      (`seatingOffsetMm`, `combinedFrom.seatingOffsetMm`).
 *   3. The tuning's source count matches the installed active subwoofer count.
 *   4. Every tuning source identity resolves to an installed active instance
 *      and every installed active instance is covered (via resolveTuningInstances).
 *
 * @param {object|null} candidate - the confirmed candidate result
 * @param {Array} instances - installed subwoofer instances (all, including disabled)
 * @returns {{ matches: boolean, reasons: string[] }}
 */
export function candidatePhysicalGeometryMatchesInstalled(candidate, instances) {
  const reasons = [];

  if (!candidate) {
    return { matches: false, reasons: ["no candidate provided"] };
  }

  // ── 1. Changed subwoofer positions ────────────────────────────────
  if (candidate.isPositionCandidate === true) {
    reasons.push("candidate depends on changed subwoofer positions");
  }
  const combinedFrom = candidate.combinedFrom || {};
  if (combinedFrom.positionCandidateId) {
    reasons.push("candidate was retuned on a changed subwoofer position");
  }

  // ── 2. Moved seating ───────────────────────────────────────────────
  const seatingOffset = finite(candidate.seatingOffsetMm);
  if (seatingOffset != null && Math.abs(seatingOffset) > SEATING_OFFSET_TOLERANCE_MM) {
    reasons.push("candidate depends on moved seating");
  }
  const combinedSeatingOffset = finite(combinedFrom.seatingOffsetMm);
  if (combinedSeatingOffset != null && Math.abs(combinedSeatingOffset) > SEATING_OFFSET_TOLERANCE_MM) {
    reasons.push("candidate was retuned on moved seating");
  }

  // ── 3 & 4. Source identity and quantity match ──────────────────────
  const tuning = candidateTuning(candidate);
  const active = (Array.isArray(instances) ? instances : []).filter((s) => s?.enabled !== false);

  if (tuning.length === 0) {
    reasons.push("candidate carries no tuning");
  } else if (tuning.length !== active.length) {
    reasons.push(
      `tuning source count (${tuning.length}) does not match installed active subwoofer count (${active.length})`,
    );
  } else {
    // resolveTuningInstances maps tuning sourceIds to installed instances.
    // Returns null when identities cannot be matched (count mismatch is
    // already excluded above; this catches ID mismatch / duplicates).
    const resolved = resolveTuningInstances(active, tuning);
    if (!resolved) {
      reasons.push("tuning source identities do not match the installed subwoofer instances");
    }
  }

  return { matches: reasons.length === 0, reasons };
}