// components/utils/spl/seatSpl.js
// Shared SPL calculation functions for consistent results across HUD and tiles

/**
 * Calculate SPL at a given distance from a speaker
 * @param {number} sens1w1mDb - Speaker sensitivity at 1W/1m
 * @param {number} powerW - Amplifier power in watts
 * @param {number} distanceM - Distance in meters (must be > 0)
 * @returns {number|null} SPL in dB, or null if inputs invalid
 */
export function splAtDistanceDb({ sens1w1mDb, powerW, distanceM }) {
  // Validate inputs
  if (!Number.isFinite(sens1w1mDb)) return null;
  if (!Number.isFinite(powerW) || powerW <= 0) return null;
  if (!Number.isFinite(distanceM) || distanceM <= 0) return null;

  // Standard SPL formula: SPL = sensitivity + 10·log10(power) - 20·log10(distance)
  const spl = sens1w1mDb + 10 * Math.log10(powerW) - 20 * Math.log10(distanceM);
  
  return Number.isFinite(spl) ? spl : null;
}

/**
 * Calculate distance between two points (2D planar)
 * @param {object} point1 - {x, y} in meters
 * @param {object} point2 - {x, y} in meters
 * @returns {number} Distance in meters (minimum 0.10m to avoid log blowups)
 */
export function distanceBetween(point1, point2) {
  const dx = Number(point2.x) - Number(point1.x);
  const dy = Number(point2.y) - Number(point1.y);
  
  // Use 10cm floor to prevent log(0) issues
  return Math.max(0.10, Math.hypot(dx, dy));
}

/**
 * Calculate SPL at a specific seat position from a speaker
 * @param {object} speakerPos - {x, y} in meters
 * @param {object} seatPos - {x, y} in meters
 * @param {number} sens1w1mDb - Speaker sensitivity at 1W/1m
 * @param {number} powerW - Amplifier power in watts
 * @returns {number|null} SPL in dB at the seat, or null if inputs invalid
 */
export function splAtPointDb({ speakerPos, seatPos, sens1w1mDb, powerW }) {
  // Validate positions
  if (!speakerPos || !Number.isFinite(speakerPos.x) || !Number.isFinite(speakerPos.y)) return null;
  if (!seatPos || !Number.isFinite(seatPos.x) || !Number.isFinite(seatPos.y)) return null;

  const distanceM = distanceBetween(speakerPos, seatPos);
  
  return splAtDistanceDb({ sens1w1mDb, powerW, distanceM });
}