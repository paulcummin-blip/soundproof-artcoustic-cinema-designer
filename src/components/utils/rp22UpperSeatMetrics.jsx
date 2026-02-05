// components/utils/rp22UpperSeatMetrics.js
// Helpers for computing per-seat RP22 metrics for upper/height speakers

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

// Deterministic overhead ordering for P9 adjacency
function upperOrderIndex(role) {
  const r = String(role || "").toUpperCase();

  // Front
  if (r === "TFL" || r === "TFR" || r.startsWith("TF")) return 0;

  // Mid
  if (r === "TML" || r === "TMR" || r.startsWith("TM")) return 1;

  // Rear (support both naming styles)
  if (r === "TRL" || r === "TRR" || r === "TBL" || r === "TBR" || r.startsWith("TB")) return 2;

  // Anything else should not influence adjacency
  return 99;
}

function upperSort(a, b) {
  const pa = upperOrderIndex(a.role);
  const pb = upperOrderIndex(b.role);
  if (pa !== pb) return pa - pb;

  // Tie-break: front-to-back stability
  return (a.y ?? 0) - (b.y ?? 0);
}

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
  const upperRoles = new Set(['TFL','TFR','TML','TMR','TBL','TBR','TRL','TRR','TL','TR']);

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
 * ROW-BASED RP22-PURE LOGIC (2026-02-05):
 * - Groups speakers by row (front/mid/rear) using canonical roles
 * - Computes ONE elevation angle per row (based on average Y position)
 * - Only compares adjacent rows: front↔mid, mid↔rear
 * - Ignores left/right differences (P9 is about vertical spacing only)
 * 
 * @param {Object} seat - Seat with x, y, z
 * @param {Array} upperSpeakers - Array from getUpperSpeakersForSeat
 * @param {Number} roomCenterX - Room center X coordinate (unused in row-based logic)
 * @returns {Object} { maxVerticalGapDeg, gaps, worstGap, rowElevations }
 */
export function computeUpperVerticalAnglesForSeat(seat, upperSpeakers, roomCenterX = 0) {
  if (!seat || !Array.isArray(upperSpeakers) || upperSpeakers.length < 2) {
    return { maxVerticalGapDeg: null, gaps: [], worstGap: null, rowElevations: [] };
  }

  const seatX = Number(seat.x ?? seat.position?.x);
  const seatY = Number(seat.y ?? seat.position?.y);
  const seatZ = Number(seat.z ?? seat.position?.z ?? 1.2);

  if (!isNum(seatX) || !isNum(seatY) || !isNum(seatZ)) {
    return { maxVerticalGapDeg: null, gaps: [], worstGap: null, rowElevations: [] };
  }

  // Group speakers by row using canonical roles
  const rows = {
    front: [],
    mid: [],
    rear: [],
  };

  for (const spk of upperSpeakers) {
    const role = String(spk.role || "").toUpperCase();
    const pos = spk.position;
    
    if (!isNum(pos.x) || !isNum(pos.y) || !isNum(pos.z)) continue;
    
    if (role.startsWith("TF")) {
      rows.front.push(spk);
    } else if (role.startsWith("TM")) {
      rows.mid.push(spk);
    } else if (role.startsWith("TR") || role.startsWith("TB")) {
      rows.rear.push(spk);
    }
  }

  // Compute elevation angle for each row that has speakers
  const rowElevations = [];

  const computeRowElevation = (rowName, speakers) => {
    if (speakers.length === 0) return null;

    // Average Y position of this row
    const avgY = speakers.reduce((sum, s) => sum + s.position.y, 0) / speakers.length;
    
    // Average Z position of this row
    const avgZ = speakers.reduce((sum, s) => sum + s.position.z, 0) / speakers.length;

    // Elevation angle from seat to row center
    const dz = avgZ - seatZ;
    const dy = Math.abs(avgY - seatY);
    
    const elevDeg = Math.atan2(dz, dy) * 180 / Math.PI;

    // Build role label (e.g., "TFL/TFR" for front row)
    const roleLabel = speakers.map(s => s.role).join('/');

    return {
      row: rowName,
      roleLabel,
      elevDeg,
      avgY,
      avgZ,
      speakerCount: speakers.length,
    };
  };

  const frontElev = computeRowElevation('front', rows.front);
  const midElev = computeRowElevation('mid', rows.mid);
  const rearElev = computeRowElevation('rear', rows.rear);

  if (frontElev) rowElevations.push(frontElev);
  if (midElev) rowElevations.push(midElev);
  if (rearElev) rowElevations.push(rearElev);

  // Require at least 2 rows for P9
  if (rowElevations.length < 2) {
    return { maxVerticalGapDeg: null, gaps: [], worstGap: null, rowElevations };
  }

  // Compute adjacent row gaps only
  const gaps = [];

  if (frontElev && midElev) {
    gaps.push({
      pair: `${frontElev.roleLabel} ↔ ${midElev.roleLabel}`,
      deg: Math.abs(frontElev.elevDeg - midElev.elevDeg),
    });
  }

  if (midElev && rearElev) {
    gaps.push({
      pair: `${midElev.roleLabel} ↔ ${rearElev.roleLabel}`,
      deg: Math.abs(midElev.elevDeg - rearElev.elevDeg),
    });
  }

  // Find worst gap
  const worst = gaps.length > 0
    ? gaps.reduce((max, g) => (g.deg > max.deg ? g : max), gaps[0])
    : null;

  const maxVerticalGapDeg = worst ? worst.deg : null;

  return {
    maxVerticalGapDeg,
    gaps,
    worstGap: worst,
    rowElevations,
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