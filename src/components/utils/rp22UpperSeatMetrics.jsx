// components/utils/rp22UpperSeatMetrics.js
// Helpers for computing per-seat RP22 metrics for upper/height speakers

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/**
 * Get upper speakers relevant to a seat
 * @param {Object} seat - Seat object with x, y, z
 * @param {Array} placedSpeakers - Array of all placed speakers
 * @param {Function} getCanonicalRole - Function to normalize role names
 * @returns {Array} Array of upper speaker objects with distance and position
 */
export function getUpperSpeakersForSeat(seat, placedSpeakers, getCanonicalRole) {
  if (!seat || !Array.isArray(placedSpeakers)) return [];

  const seatX = Number(seat.x ?? seat.position?.x);
  const seatY = Number(seat.y ?? seat.position?.y);
  const seatZ = Number(seat.z ?? seat.position?.z ?? 1.2); // default ear height

  if (!isNum(seatX) || !isNum(seatY) || !isNum(seatZ)) return [];

  // Upper/height roles per RP22 spec
  const upperRoles = new Set(['TFL', 'TFR', 'TML', 'TMR', 'TBL', 'TBR', 'TL', 'TR', 'TFC', 'TBC']);

  return placedSpeakers
    .filter(spk => {
      if (!spk || !spk.position) return false;
      const role = getCanonicalRole ? getCanonicalRole(spk.role) : String(spk.role || "").toUpperCase();
      return upperRoles.has(role);
    })
    .map(spk => {
      const pos = spk.position;
      if (!isNum(pos.x) || !isNum(pos.y) || !isNum(pos.z)) return null;

      const dx = pos.x - seatX;
      const dy = pos.y - seatY;
      const dz = pos.z - seatZ;
      const distance = Math.hypot(dx, dy, dz);

      const role = getCanonicalRole ? getCanonicalRole(spk.role) : String(spk.role || "").toUpperCase();

      return {
        id: spk.id || role,
        role,
        position: { x: pos.x, y: pos.y, z: pos.z },
        distance,
        model: spk.model,
      };
    })
    .filter(Boolean);
}

/**
 * Compute vertical elevation angles for upper speakers from a seat
 * Returns max gap between adjacent uppers on each side
 * @param {Object} seat - Seat with x, y, z
 * @param {Array} upperSpeakers - Array from getUpperSpeakersForSeat
 * @param {Number} roomCenterX - Room center X coordinate for left/right split
 * @returns {Object} { maxVerticalGapDeg, gaps, elevations }
 */
export function computeUpperVerticalAnglesForSeat(seat, upperSpeakers, roomCenterX = 0) {
  if (!seat || !Array.isArray(upperSpeakers) || upperSpeakers.length < 2) {
    return { maxVerticalGapDeg: null, gaps: [], elevations: [] };
  }

  const seatX = Number(seat.x ?? seat.position?.x);
  const seatY = Number(seat.y ?? seat.position?.y);
  const seatZ = Number(seat.z ?? seat.position?.z ?? 1.2);

  if (!isNum(seatX) || !isNum(seatY) || !isNum(seatZ)) {
    return { maxVerticalGapDeg: null, gaps: [], elevations: [] };
  }

  // Compute elevation angle for each upper speaker
  const elevations = upperSpeakers.map(spk => {
    const pos = spk.position;
    const dx = pos.x - seatX;
    const dy = pos.y - seatY;
    const dz = pos.z - seatZ;
    
    // Planar distance
    const rPlanar = Math.hypot(dx, dy);
    
    // Elevation angle in degrees
    const elevDeg = Math.atan2(dz, rPlanar) * 180 / Math.PI;
    
    return {
      role: spk.role,
      elevDeg,
      x: pos.x,
      y: pos.y,
      z: pos.z,
      isLeft: pos.x < roomCenterX,
    };
  });

  // Split by side
  const leftUppers = elevations.filter(e => e.isLeft).sort((a, b) => a.y - b.y); // front to back
  const rightUppers = elevations.filter(e => !e.isLeft).sort((a, b) => a.y - b.y);

  // Compute gaps within each side
  const gaps = [];

  const computeSideGaps = (side) => {
    for (let i = 1; i < side.length; i++) {
      const gap = Math.abs(side[i].elevDeg - side[i - 1].elevDeg);
      gaps.push(gap);
    }
  };

  computeSideGaps(leftUppers);
  computeSideGaps(rightUppers);

  const maxVerticalGapDeg = gaps.length > 0 ? Math.max(...gaps) : null;

  return {
    maxVerticalGapDeg,
    gaps,
    elevations,
  };
}

/**
 * Compute upper SPL spread for a seat
 * Returns max SPL difference among upper speakers
 * @param {Object} seat - Seat object
 * @param {Array} upperSpeakers - Array from getUpperSpeakersForSeat
 * @param {Function} getSplAtSeat - Function(seatId, role) => SPL in dB
 * @returns {Number|null} deltaUpperSPL in dB
 */
export function computeUpperSplSpreadForSeat(seat, upperSpeakers, getSplAtSeat) {
  if (!seat || !Array.isArray(upperSpeakers) || upperSpeakers.length < 2 || typeof getSplAtSeat !== 'function') {
    return null;
  }

  const seatId = seat.id || `seat-${seat.x}-${seat.y}`;
  
  const splValues = upperSpeakers
    .map(spk => getSplAtSeat(seatId, spk.role))
    .filter(v => isNum(v));

  if (splValues.length < 2) return null;

  const maxSpl = Math.max(...splValues);
  const minSpl = Math.min(...splValues);
  const deltaSpl = maxSpl - minSpl;

  return deltaSpl;
}