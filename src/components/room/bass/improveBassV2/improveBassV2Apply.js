// improveBassV2Apply.js
// Atomic apply contract for the V2 Improve Bass Response winner.
// Applies: positions, orientation, delay, trim, polarity, and marks the
// old bass authority stale. Also provides tuning-aware applied-state matching.
//
// BLOCKER 5: Apply preserves the FULL canonical subwoofer-instance contract:
//   - id, model, enabled
//   - position.x, position.y, position.z (where canonical schema uses it)
//   - bottomHeightM
//   - rotation
//   - delay, trim, polarity
//   - positionSource, legacyGroup, symmetryLinkId
//
// Disabled instances are PRESERVED — they are not removed merely because
// optimisation only used active ones. Optimisation may ignore disabled
// instances acoustically, but Apply must preserve them in project state.

import { applyCalibrationTuning, resolveTuningInstances } from "./improveBassV2ApplyCalibration.js";

const COORDINATE_TOLERANCE_M = 0.01; // 10 mm

const TUNING_TOLERANCE_DELAY_MS = 0.1;
const TUNING_TOLERANCE_GAIN_DB = 0.1;

/**
 * Normalise a polarity value to -1 (inverted) or 0 (normal).
 */
function normalisePolarity(value) {
  const n = Number(value) || 0;
  return (n < 0 || n === 180) ? -1 : 0;
}

/**
 * Build optimised subwooferInstances from the V2 winner, preserving
 * existing instance IDs, disabled instances, and all canonical fields.
 *
 * BLOCKER 5: Disabled instances are preserved in the output. The winner's
 * coordinates only replace ENABLED instance positions. Disabled instances
 * retain their original position, tuning, and identity.
 *
 * BLOCKER 6: The winner's coordinates map to ACTIVE (enabled) instances only.
 * Disabled instances from the current set are appended unchanged.
 *
 * @param {object} winner - V2 winner result with coordinates, appliedTuning, sources
 * @param {Array} currentInstances - existing subwooferInstances (ALL, including disabled)
 * @param {object} roomDims - { widthM, lengthM, heightM }
 * @param {string} modelKey - subwoofer model key
 * @returns {Array} new subwooferInstances array with ALL instances preserved
 */
export function buildOptimisedInstances(winner, currentInstances, roomDims, modelKey, provenance) {
  // Winner may carry coordinates as `coordinates` (Stage 2) or
  // `positionCoordinates` (Stage 11B position candidates).
  const coords = winner?.positionCoordinates || winner?.coordinates;
  if (!coords?.length) return currentInstances || [];

  const tuning = winner.appliedTuning || winner.tuning || [];
  const ordered = resolveTuningInstances(currentInstances, tuning);
  if (!ordered || coords.length !== ordered.length) {
    throw new Error("Cannot Apply positions to changed source identities");
  }
  const coordsById = new Map(ordered.map((inst, i) => [inst.id, coords[i]]));
  return applyCalibrationTuning(currentInstances, tuning, provenance).map((inst) => {
    if (inst.enabled === false) return inst;
    const coord = coordsById.get(inst.id);
    if (!Number.isFinite(Number(coord?.x)) || !Number.isFinite(Number(coord?.y))) {
      throw new Error("Confirmed position is invalid");
    }
    return {
      ...inst,
      position: { ...inst.position, x: Number(coord.x), y: Number(coord.y) },
      positionSource: "v2-optimised",
    };
  });
}

/**
 * Check whether the current subwooferInstances match the V2 winner's
 * positions AND tuning (delay, trim, polarity). This fixes the V1 bug
 * where "Applied" was claimed when only coordinates matched but tuning did not.
 *
 * BLOCKER 5: Only checks ACTIVE (enabled) instances against the winner.
 * Disabled instances are ignored in the match check.
 *
 * @param {Array} currentInstances - current subwooferInstances (ALL)
 * @param {object} winner - V2 winner result
 * @param {object} roomDims - room dimensions
 * @returns {boolean} true only if active positions AND tuning match
 */
export function isOptimisedApplied(currentInstances, winner, roomDims) {
  const coords = winner?.positionCoordinates || winner?.coordinates;
  if (!coords?.length || !currentInstances?.length) return false;

  // Only check active instances against the winner
  const tuning = winner.appliedTuning || winner.tuning || [];
  const activeInstances = resolveTuningInstances(currentInstances, tuning);
  if (!activeInstances || coords.length !== activeInstances.length) return false;

  for (let i = 0; i < coords.length; i++) {
    const wc = coords[i];
    const inst = activeInstances[i];
    if (!inst) return false;
    // Matching numbers in an old manual record are not an applied effective proposal.
    if ((tuning[i]?.sourceId != null) && inst.tuningSource !== "v2-optimised") return false;

    // Position match
    const dx = Math.abs(Number(inst.position?.x) - Number(wc.x));
    const dy = Math.abs(Number(inst.position?.y) - Number(wc.y));
    if (dx > COORDINATE_TOLERANCE_M || dy > COORDINATE_TOLERANCE_M) return false;

    // Tuning match
    const t = tuning[i] || { delayMs: 0, gainDb: 0, polarity: 0 };
    const instDelay = Number(inst.delayMs) || 0;
    const instGain = Number(inst.gainDb) || 0;
    const instPolarity = Number(inst.polarity) || 0;

    if (Math.abs(instDelay - (Number(t.delayMs) || 0)) > TUNING_TOLERANCE_DELAY_MS) return false;
    if (Math.abs(instGain - (Number(t.gainDb) || 0)) > TUNING_TOLERANCE_GAIN_DB) return false;
    if (normalisePolarity(instPolarity) !== normalisePolarity(t.polarity)) return false;
  }

  return true;
}

/**
 * Build a summary of the calibration settings for display.
 */
export function buildCalibrationSummary(winner) {
  const tuning = winner?.appliedTuning || winner?.tuning || [];
  if (!tuning.length) return null;

  return {
    delays: tuning.map((t) => `${(Number(t.delayMs) || 0).toFixed(1)} ms`),
    trims: tuning.map((t) => `${(Number(t.gainDb) || 0).toFixed(1)} dB`),
    polarities: tuning.map((t) => normalisePolarity(t.polarity) < 0 ? "Inverted" : "Normal"),
  };
}