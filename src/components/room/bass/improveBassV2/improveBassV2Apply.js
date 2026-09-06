// improveBassV2Apply.js
// Atomic apply contract for the V2 Improve Bass Response winner.
// Applies: positions, orientation, delay, trim, polarity, and marks the
// old bass authority stale. Also provides tuning-aware applied-state matching.

import { generateStableId } from "../../../utils/stableIdGenerator.js";
import { deriveSubWallOrientation, subHalfExtents } from "../../rv/utils/subWallOrientation.js";
import { normaliseModelKey } from "../../../utils/modelKeyNormaliser.js";

// Coordinate tolerance for position matching (mirrors applyRecommendationUtils.js).
// Defined locally to avoid pulling in @/ aliased transitive deps for Node tests.
const COORDINATE_TOLERANCE_M = 0.01; // 10 mm

const TUNING_TOLERANCE_DELAY_MS = 0.1;
const TUNING_TOLERANCE_GAIN_DB = 0.1;

/**
 * Normalise a polarity value to -1 (inverted) or 0 (normal).
 * Fixes the BLOCKER 4 precedence bug where (Number(t.polarity) || 0 < 0 ? -1 : 0)
 * evaluated as (Number(t.polarity) || false) due to operator precedence.
 *
 * @param {*} value - raw polarity value (0, -1, 180, undefined, etc.)
 * @returns {number} -1 for inverted, 0 for normal
 */
function normalisePolarity(value) {
  const n = Number(value) || 0;
  // -1 (canonical UI) and 180 (engine degrees) both mean inverted.
  // 0 and 1 (and any other positive non-180) mean normal.
  return (n < 0 || n === 180) ? -1 : 0;
}

/**
 * Build optimised subwooferInstances from the V2 winner, preserving
 * existing instance IDs where possible and applying new positions,
 * rotation, delay, trim, and polarity.
 *
 * @param {object} winner - V2 winner result with coordinates, appliedTuning, sources
 * @param {Array} currentInstances - existing subwooferInstances
 * @param {object} roomDims - { widthM, lengthM, heightM }
 * @param {string} modelKey - subwoofer model key
 * @returns {Array} new subwooferInstances array
 */
export function buildOptimisedInstances(winner, currentInstances, roomDims, modelKey) {
  if (!winner?.coordinates?.length) return currentInstances || [];

  const W = Number(roomDims?.widthM) || 0;
  const L = Number(roomDims?.lengthM) || 0;
  const normalisedModel = normaliseModelKey(modelKey);
  const tuning = winner.appliedTuning || winner.tuning || [];
  const existingList = Array.isArray(currentInstances) ? currentInstances : [];
  const usedIds = new Set(existingList.map((inst) => String(inst.id)));

  return winner.coordinates.map((coord, i) => {
    const x = Number(coord.x);
    const y = Number(coord.y);
    const { rotationDeg } = deriveSubWallOrientation({
      x, y, widthM: W, lengthM: L, subWidthM: 0.3, subDepthM: 0.3,
    });

    const t = tuning[i] || { delayMs: 0, gainDb: 0, polarity: 0 };
    const existing = existingList[i];
    const id = existing?.id
      ? existing.id
      : generateStableId(usedIds, "sub");

    return {
      id,
      model: normalisedModel,
      enabled: true,
      position: { x, y },
      bottomHeightM: Number(existing?.bottomHeightM) || 0,
      rotationDeg,
      positionSource: "v2-optimised",
      gainDb: Number(t.gainDb) || 0,
      delayMs: Number(t.delayMs) || 0,
      polarity: Number(t.polarity) || 0,
    };
  });
}

/**
 * Check whether the current subwooferInstances match the V2 winner's
 * positions AND tuning (delay, trim, polarity). This fixes the V1 bug
 * where "Applied" was claimed when only coordinates matched but tuning did not.
 *
 * @param {Array} currentInstances - current subwooferInstances
 * @param {object} winner - V2 winner result
 * @param {object} roomDims - room dimensions
 * @returns {boolean} true only if positions AND tuning match
 */
export function isOptimisedApplied(currentInstances, winner, roomDims) {
  if (!winner?.coordinates?.length || !currentInstances?.length) return false;
  if (winner.coordinates.length !== currentInstances.length) return false;

  const tuning = winner.appliedTuning || winner.tuning || [];

  for (let i = 0; i < winner.coordinates.length; i++) {
    const wc = winner.coordinates[i];
    const inst = currentInstances[i];
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
    // BLOCKER 4 fix: explicit, unambiguous polarity normalisation.
    // The old code had a precedence bug: (Number(t.polarity) || 0 < 0 ? -1 : 0)
    // evaluated as (Number(t.polarity) || false) due to < binding tighter than ||.
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