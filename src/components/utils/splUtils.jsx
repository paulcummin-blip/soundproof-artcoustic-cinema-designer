// components/utils/splUtils.js
// Shared SPL utility functions.

import { RP22_CALIBRATION_HEADROOM_DB } from "@/components/constants/calibration";

/**
 * Applies the standard RP22 post-calibration headroom to a given SPL value.
 * This is a presentation-layer adjustment.
 * @param {number | null} db - The raw calculated SPL in dB.
 * @returns {number | null} The adjusted SPL value, or null if input is invalid.
 */
export function applyCalibrationHeadroom(db) {
  if (typeof db !== 'number' || !isFinite(db)) return null;
  return db - RP22_CALIBRATION_HEADROOM_DB;
}

/**
 * Calculates multiplicative power change to achieve a delta in dB
 * @param {number} basePowerW - Base power in watts
 * @param {number} deltaDb - Change in dB needed (positive = need more power)
 * @returns {number} Required power in watts
 */
export const powerForDeltaDb = (basePowerW, deltaDb) => {
  if (!Number.isFinite(basePowerW) || basePowerW <= 0) return NaN;
  return basePowerW * Math.pow(10, deltaDb / 10);
};

/**
 * Calculates minimal power to meet target, given the SPL at base power
 * @param {number} rawSplAtBasePowerDb - RAW SPL (pre-calibration) at base power
 * @param {number} basePowerW - Base power used to achieve the raw SPL
 * @param {number} targetDb - Target SPL (post-calibration comparison)
 * @returns {object} { requiredW, postCalAtBase, deltaDb, meets }
 */
export function requiredPowerForTarget(rawSplAtBasePowerDb, basePowerW, targetDb) {
  const postCal = applyCalibrationHeadroom(rawSplAtBasePowerDb);
  if (!Number.isFinite(postCal) || !Number.isFinite(targetDb)) {
    return { requiredW: NaN, postCalAtBase: postCal, deltaDb: NaN, meets: false };
  }

  const delta = targetDb - postCal; // positive if we're short of target
  const requiredW = powerForDeltaDb(basePowerW, delta); // if delta>0 → >base; if delta<0 → <base
  return { 
    requiredW, 
    postCalAtBase: postCal, 
    deltaDb: delta, 
    meets: delta <= 0 
  };
}