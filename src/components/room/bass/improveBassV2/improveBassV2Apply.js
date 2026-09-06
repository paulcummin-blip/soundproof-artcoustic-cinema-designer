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

import { generateStableId } from "../../../utils/stableIdGenerator.js";
import { deriveSubWallOrientation, subHalfExtents } from "../../rv/utils/subWallOrientation.js";
import { normaliseModelKey } from "../../../utils/modelKeyNormaliser.js";

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
export function buildOptimisedInstances(winner, currentInstances, roomDims, modelKey) {
  if (!winner?.coordinates?.length) return currentInstances || [];

  const W = Number(roomDims?.widthM) || 0;
  const L = Number(roomDims?.lengthM) || 0;
  const normalisedModel = normaliseModelKey(modelKey);
  const tuning = winner.appliedTuning || winner.tuning || [];
  const existingList = Array.isArray(currentInstances) ? currentInstances : [];

  // BLOCKER 6: Separate ALL instances into active and disabled.
  const activeInstances = existingList.filter((inst) => inst.enabled !== false);
  const disabledInstances = existingList.filter((inst) => inst.enabled === false);

  // BLOCKER 5: Build optimised active instances from winner coordinates.
  // Map winner coordinates to active instances by index.
  const usedIds = new Set(existingList.map((inst) => String(inst.id)));
  const optimisedActive = winner.coordinates.map((coord, i) => {
    const x = Number(coord.x);
    const y = Number(coord.y);
    const { rotationDeg } = deriveSubWallOrientation({
      x, y, widthM: W, lengthM: L, subWidthM: 0.3, subDepthM: 0.3,
    });

    const t = tuning[i] || { delayMs: 0, gainDb: 0, polarity: 0 };
    const existing = activeInstances[i];
    const id = existing?.id
      ? existing.id
      : generateStableId(usedIds, "sub");

    return {
      id,
      model: normalisedModel,
      // BLOCKER 5: enabled state is explicitly set
      enabled: true,
      // BLOCKER 5: position.z preserved from existing instance where canonical
      // schema uses it. The canonical subwooferInstance stores position as {x, y}
      // with z derived from bottomHeightM. We preserve position.z if the existing
      // instance had one, otherwise omit it (matching the canonical schema).
      position: {
        x,
        y,
        ...(existing?.position?.z != null ? { z: Number(existing.position.z) } : {}),
      },
      // BLOCKER 5: bottomHeightM preserved from existing instance
      bottomHeightM: Number(existing?.bottomHeightM) || 0,
      // BLOCKER 5: rotation from wall-aware derivation
      rotationDeg,
      positionSource: "v2-optimised",
      // BLOCKER 5: delay, trim, polarity from winner tuning
      gainDb: Number(t.gainDb) || 0,
      delayMs: Number(t.delayMs) || 0,
      polarity: Number(t.polarity) || 0,
      // Preserve identity fields from existing instance
      ...(existing?.legacyGroup != null ? { legacyGroup: existing.legacyGroup } : {}),
      ...(existing?.symmetryLinkId != null ? { symmetryLinkId: existing.symmetryLinkId } : {}),
    };
  });

  // BLOCKER 5: Append disabled instances unchanged — they must NOT disappear
  // merely because optimisation only used active ones.
  const disabledPreserved = disabledInstances.map((inst) => ({
    id: inst.id,
    model: inst.model,
    enabled: false,
    position: {
      x: Number(inst.position?.x) || 0,
      y: Number(inst.position?.y) || 0,
      ...(inst.position?.z != null ? { z: Number(inst.position.z) } : {}),
    },
    bottomHeightM: Number(inst.bottomHeightM) || 0,
    rotationDeg: Number(inst.rotationDeg) || 0,
    positionSource: inst.positionSource || null,
    gainDb: Number(inst.gainDb) || 0,
    delayMs: Number(inst.delayMs) || 0,
    polarity: Number(inst.polarity) || 0,
    ...(inst.legacyGroup != null ? { legacyGroup: inst.legacyGroup } : {}),
    ...(inst.symmetryLinkId != null ? { symmetryLinkId: inst.symmetryLinkId } : {}),
  }));

  return [...optimisedActive, ...disabledPreserved];
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
  if (!winner?.coordinates?.length || !currentInstances?.length) return false;

  // Only check active instances against the winner
  const activeInstances = currentInstances.filter((inst) => inst.enabled !== false);
  if (winner.coordinates.length !== activeInstances.length) return false;

  const tuning = winner.appliedTuning || winner.tuning || [];

  for (let i = 0; i < winner.coordinates.length; i++) {
    const wc = winner.coordinates[i];
    const inst = activeInstances[i];
    if (!inst) return false;

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