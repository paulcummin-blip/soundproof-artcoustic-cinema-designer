/**
 * Shared SPL calculation utilities with comprehensive input validation
 */

export const calcSPL = (sens, powerW, distanceM) => {
  if (!Number.isFinite(sens) || !Number.isFinite(powerW) || powerW <= 0 || !Number.isFinite(distanceM) || distanceM <= 0) {
    return null;
  }
  return sens + 10 * Math.log10(powerW) - 20 * Math.log10(distanceM);
};

export const thermalMaxSPL1m = (sensitivity, maxPowerW) => {
  if (!Number.isFinite(sensitivity) || !Number.isFinite(maxPowerW) || maxPowerW <= 0) {
    return null;
  }
  return sensitivity + 10 * Math.log10(maxPowerW);
};

export const splAtDistanceFrom1m = (spl1m, distanceM) => {
  if (!Number.isFinite(spl1m) || !Number.isFinite(distanceM) || distanceM <= 0) {
    return null;
  }
  return spl1m - 20 * Math.log10(distanceM);
};

export const bestMaxSPL1m = ({ sensitivity_dB_1W1m, max_power_W, excursionMax1m }) => {
  const thermal = thermalMaxSPL1m(sensitivity_dB_1W1m, max_power_W);
  const candidates = [thermal, excursionMax1m].filter(Number.isFinite);
  return candidates.length ? Math.min(...candidates) : null;
};

export const clampToCeiling = (splAtDistance, maxSPL1m, distanceM) => {
  if (!Number.isFinite(splAtDistance)) return null;
  if (!Number.isFinite(maxSPL1m) || !Number.isFinite(distanceM) || distanceM <= 0) {
    return splAtDistance;
  }
  const ceilingAtDistance = splAtDistanceFrom1m(maxSPL1m, distanceM);
  return Number.isFinite(ceilingAtDistance) ? Math.min(splAtDistance, ceilingAtDistance) : splAtDistance;
};

export const calcPowerRequired = (sensitivity, targetSPL, distanceM) => {
  if (!Number.isFinite(sensitivity) || !Number.isFinite(targetSPL) || !Number.isFinite(distanceM) || distanceM <= 0) {
    return null;
  }
  const powerLog = (targetSPL - sensitivity + 20 * Math.log10(distanceM)) / 10;
  return Math.pow(10, powerLog);
};