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
 * - Computes ONE elevation angle per row per side (based on average Y of row)
 * - Only compares adjacent rows: front↔mid, mid↔rear
 * - Left and right sides computed independently
 * - Works with 2 or 3 rows (does not require mid to exist)
 * 
 * @param {Object} seat - Seat with x, y, z
 * @param {Array} upperSpeakers - Array from getUpperSpeakersForSeat
 * @param {Number} roomCenterX - Room center X coordinate for left/right split
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

  // Group speakers by row AND side using canonical roles
  const rowsByLR = {
    left: { front: [], mid: [], rear: [] },
    right: { front: [], mid: [], rear: [] },
  };

  for (const spk of upperSpeakers) {
    const role = String(spk.role || "").toUpperCase();
    const pos = spk.position;
    
    if (!isNum(pos.x) || !isNum(pos.y) || !isNum(pos.z)) continue;
    
    const side = pos.x < roomCenterX ? 'left' : 'right';
    
    if (role.startsWith("TF")) {
      rowsByLR[side].front.push(spk);
    } else if (role.startsWith("TM")) {
      rowsByLR[side].mid.push(spk);
    } else if (role.startsWith("TR") || role.startsWith("TB")) {
      rowsByLR[side].rear.push(spk);
    }
  }

  // For each side, compute elevation angles for rows that exist
  const allGaps = [];
  const allRowElevations = [];

  const processSide = (sideName, sideRows) => {
    // Compute elevation for each row on this side
    const rowData = [];

    const computeRowElev = (rowName, rowIndex, speakers) => {
      if (speakers.length === 0) return null;

      // Average Y and Z of this row
      const avgY = speakers.reduce((sum, s) => sum + s.position.y, 0) / speakers.length;
      const avgZ = speakers.reduce((sum, s) => sum + s.position.z, 0) / speakers.length;

      // Elevation from seat to row center
      const dz = avgZ - seatZ;
      const dy = avgY - seatY;
      const elevDeg = Math.atan2(dz, dy) * 180 / Math.PI;

      // Build role label
      const roleLabel = speakers.map(s => s.role).join('/');

      return {
        sideName,
        rowName,
        rowIndex,
        roleLabel,
        elevDeg,
        avgY,
        avgZ,
        dy,
        dz,
      };
    };

    const frontRow = computeRowElev('front', 0, sideRows.front);
    const midRow = computeRowElev('mid', 1, sideRows.mid);
    const rearRow = computeRowElev('rear', 2, sideRows.rear);

    // Collect rows that exist
    if (frontRow) rowData.push(frontRow);
    if (midRow) rowData.push(midRow);
    if (rearRow) rowData.push(rearRow);

    // Store for return
    allRowElevations.push(...rowData);

    // Need at least 2 rows on this side to compute gaps
    if (rowData.length < 2) return;

    // Sort by rowIndex (front=0, mid=1, rear=2)
    rowData.sort((a, b) => a.rowIndex - b.rowIndex);

    // Compute adjacent row gaps
    for (let i = 1; i < rowData.length; i++) {
      const a = rowData[i - 1].elevDeg;
      const b = rowData[i].elevDeg;
      const gap = Math.abs(b - a);

      const prevRow = rowData[i - 1];
      const nextRow = rowData[i];

      allGaps.push({
        pair:
          `${sideName.toUpperCase()} | ` +
          `${prevRow.rowName} ` +
          `[${prevRow.roleLabel}] ` +
          `y=${prevRow.avgY.toFixed(2)} z=${prevRow.avgZ.toFixed(2)} ` +
          `dy=${prevRow.dy.toFixed(2)} dz=${prevRow.dz.toFixed(2)} ` +
          `elev=${prevRow.elevDeg.toFixed(1)}° ` +
          `↔ ` +
          `${nextRow.rowName} ` +
          `[${nextRow.roleLabel}] ` +
          `y=${nextRow.avgY.toFixed(2)} z=${nextRow.avgZ.toFixed(2)} ` +
          `dy=${nextRow.dy.toFixed(2)} dz=${nextRow.dz.toFixed(2)} ` +
          `elev=${nextRow.elevDeg.toFixed(1)}°`,
        deg: gap,
      });
    }
  };

  processSide('left', rowsByLR.left);
  processSide('right', rowsByLR.right);

  // Find worst gap
  const worst = allGaps.length > 0
    ? allGaps.reduce((max, g) => (g.deg > max.deg ? g : max), allGaps[0])
    : null;

  const maxVerticalGapDeg = worst ? worst.deg : null;

  return {
    maxVerticalGapDeg,
    gaps: allGaps,
    worstGap: worst,
    rowElevations: allRowElevations,
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