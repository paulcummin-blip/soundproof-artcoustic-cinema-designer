/**
 * SPL calculation at distance (mirrors SPL Calculator formula)
 * DO NOT modify - this is a read-only mirror of the calculator's logic
 * 
 * @param {number} sensitivity_dB_1W_1m - Speaker sensitivity at 1W/1m
 * @param {number} power_W - Amplifier power in watts
 * @param {number} distance_m - Distance from speaker to listener in meters
 * @param {number} eqHeadroom_dB - EQ headroom to subtract (0, 3, or 6)
 * @returns {number|null} SPL at distance in dB
 */
export function splAtDistance_dBC(sensitivity_dB_1W_1m, power_W, distance_m, eqHeadroom_dB = 0) {
  // Validate inputs
  if (!Number.isFinite(sensitivity_dB_1W_1m)) return null;
  if (!Number.isFinite(power_W) || power_W <= 0) return null;
  if (!Number.isFinite(distance_m) || distance_m <= 0) return null;

  // SPL Calculator formula
  const gainPower = 10 * Math.log10(power_W);
  const lossDistance = 20 * Math.log10(distance_m);
  
  return sensitivity_dB_1W_1m + gainPower - lossDistance - (eqHeadroom_dB || 0);
}