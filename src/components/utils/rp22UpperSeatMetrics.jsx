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

  // RP22-PURE ADJACENCY: Only compare front↔mid and mid↔rear on SAME SIDE
  const byRow = (list) => {
    const rows = { front: null, mid: null, rear: null };

    for (const e of list) {
      const r = String(e.role || "").toUpperCase();
      if (r.startsWith("TF")) rows.front = e;
      else if (r.startsWith("TM")) rows.mid = e;
      else if (r.startsWith("TR") || r.startsWith("TB")) rows.rear = e;
    }

    return rows;
  };

  const gaps = [];

  const evalSide = (sideList) => {
    const rows = byRow(sideList);

    if (rows.front && rows.mid) {
      gaps.push({
        pair: `${rows.front.role} ↔ ${rows.mid.role}`,
        deg: Math.abs(rows.front.elevDeg - rows.mid.elevDeg),
      });
    }

    if (rows.mid && rows.rear) {
      gaps.push({
        pair: `${rows.mid.role} ↔ ${rows.rear.role}`,
        deg: Math.abs(rows.mid.elevDeg - rows.rear.elevDeg),
      });
    }
  };

  evalSide(elevations.filter(e => e.isLeft));
  evalSide(elevations.filter(e => !e.isLeft));

  const worst = gaps.length > 0
    ? gaps.reduce((max, g) => (g.deg > max.deg ? g : max), gaps[0])
    : null;

  const maxVerticalGapDeg = worst ? worst.deg : null;

  return {
    maxVerticalGapDeg,
    gaps,
    worstGap: worst || null,
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