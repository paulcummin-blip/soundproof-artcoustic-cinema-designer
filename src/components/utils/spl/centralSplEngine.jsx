// components/utils/spl/centralSplEngine.js
// Single source of truth for SPL calculations across the entire app.
// Used by: Seat HUD, LCR cards, Surround cards, Overhead cards.

/**
 * Calculate SPL at a point given speaker position, seat position, sensitivity, and power.
 * This is the canonical formula used throughout the app.
 * 
 * Formula: SPL = sensitivity + 10*log10(power) - 20*log10(distance)
 */
function calculateSplAtPoint({
  speakerPos,
  seatPos,
  sensitivity_dB_1w1m,
  powerW,
}) {
  // Validate inputs
  if (!speakerPos || !Number.isFinite(speakerPos.x) || !Number.isFinite(speakerPos.y)) return null;
  if (!seatPos || !Number.isFinite(seatPos.x) || !Number.isFinite(seatPos.y)) return null;
  if (!Number.isFinite(sensitivity_dB_1w1m) || !Number.isFinite(powerW) || powerW <= 0) return null;

  // Calculate 3D distance (including Z if available)
  const dx = speakerPos.x - seatPos.x;
  const dy = speakerPos.y - seatPos.y;
  const dz = (speakerPos.z || 1.2) - (seatPos.z || 1.2);
  
  const distance = Math.max(0.10, Math.hypot(dx, dy, dz)); // 10cm floor to avoid infinity
  
  // SPL calculation
  const spl = sensitivity_dB_1w1m + 10 * Math.log10(powerW) - 20 * Math.log10(distance);
  
  return Number.isFinite(spl) ? spl : null;
}

/**
 * Compute SPL metrics for all seats in the room.
 * Returns a map: seatId → { spl: { screen: {...}, surrounds: {...}, uppers: {...} } }
 * 
 * @param {Array} seats - Array of seat objects with x, y, z, id
 * @param {Array} placedSpeakers - Array of speaker objects
 * @param {Function} getCanonicalRole - Role normalization function
 * @param {Function} getEffectiveSplInputs - Function to get power/sensitivity for a role
 * @param {Function} getModelDimsM - Function to get speaker dimensions/metadata
 * @returns {Map} seatId → metrics object
 */
export function computeAllSeatSplMetrics({
  seats,
  placedSpeakers,
  getCanonicalRole,
  getEffectiveSplInputs,
  getModelDimsM,
}) {
  const metricsMap = new Map();
  
  if (!Array.isArray(seats) || !Array.isArray(placedSpeakers)) {
    return metricsMap;
  }

  // Role categorization
  const screenRoles = new Set(['FL', 'FC', 'FR']);
  const surroundRoles = new Set(['SL', 'SR', 'SBL', 'SBR', 'LW', 'RW']);
  const overheadRoles = new Set(['TFL', 'TFR', 'TML', 'TMR', 'TBL', 'TBR', 'TL', 'TR', 'TFC', 'TBC']);

  // Filter speakers with valid positions
  const hasPos = s => s?.position && Number.isFinite(s.position.x) && Number.isFinite(s.position.y);
  const placedLCR = placedSpeakers.filter(s => hasPos(s) && screenRoles.has(getCanonicalRole(s.role)));
  const placedSur = placedSpeakers.filter(s => hasPos(s) && surroundRoles.has(getCanonicalRole(s.role)));
  const placedOH = placedSpeakers.filter(s => hasPos(s) && overheadRoles.has(getCanonicalRole(s.role)));

  // Process each seat
  for (const seat of seats) {
    const seatId = seat.id || `seat-${seat.x}-${seat.y}`;
    const seatPos = {
      x: Number(seat?.x ?? seat?.position?.x),
      y: Number(seat?.y ?? seat?.position?.y),
      z: Number(seat?.z ?? seat?.position?.z ?? 1.2),
    };

    if (!Number.isFinite(seatPos.x) || !Number.isFinite(seatPos.y)) {
      continue; // Skip invalid seats
    }

    const spl = {
      screen: {},
      surrounds: {},
      uppers: {},
    };

    // Helper to process speakers in a category
    const processSpeakers = (speakerArray, categoryKey) => {
      for (const spk of speakerArray) {
        const role = getCanonicalRole(spk.role);
        const speakerMeta = getModelDimsM(spk.model);
        const effectiveSplInputs = getEffectiveSplInputs(spk.role);

        const splValue = calculateSplAtPoint({
          speakerPos: spk.position,
          seatPos,
          sensitivity_dB_1w1m: effectiveSplInputs?.sensitivity_dB_1w1m || 
                               effectiveSplInputs?.sensitivity || 
                               speakerMeta?.sensitivity_dB_1w1m || 
                               speakerMeta?.sensitivity || 
                               87,
          powerW: effectiveSplInputs?.powerW || 100,
        });

        if (Number.isFinite(splValue)) {
          spl[categoryKey][role] = {
            value: splValue,
            formatted: `${splValue.toFixed(1)} dB`,
          };
        }
      }
    };

    processSpeakers(placedLCR, 'screen');
    processSpeakers(placedSur, 'surrounds');
    processSpeakers(placedOH, 'uppers');

    metricsMap.set(seatId, { spl });
  }

  return metricsMap;
}

/**
 * Get SPL metrics for a specific seat (typically MLP/RSP).
 * Returns { screen: {...}, surrounds: {...}, uppers: {...} } or null if seat not found.
 */
export function getSeatSplMetrics(allSeatMetrics, seatId) {
  if (!allSeatMetrics || !seatId) return null;
  const metrics = allSeatMetrics.get(seatId);
  return metrics?.spl || null;
}

/**
 * Helper to get the MLP/RSP seat from a list of seats.
 * Looks for isPrimary flag or falls back to the first seat.
 */
export function getMlpSeat(seats) {
  if (!Array.isArray(seats) || seats.length === 0) return null;
  
  // Try to find primary seat
  const primary = seats.find(s => s.isPrimary);
  if (primary) return primary;
  
  // Fallback to first seat
  return seats[0];
}