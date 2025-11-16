/**
 * Groups seats by their row (front to back).
 * Assumes each seat has seat.rowNumber OR y-position can be used to infer row.
 */
export function groupSeatsByRow(seats) {
  if (!Array.isArray(seats)) return [];
  
  const byRow = new Map();
  const yKey = (y) => (typeof y === 'number' ? y.toFixed(3) : 'nan');

  for (const s of seats) {
    const rowKey = Number.isInteger(s?.rowNumber) 
      ? `i:${s.rowNumber}` 
      : `y:${yKey(s?.y)}`;

    if (!byRow.has(rowKey)) byRow.set(rowKey, []);
    byRow.get(rowKey).push(s);
  }

  const rows = Array.from(byRow.entries());
  rows.sort((a, b) => {
    const [ka] = a, [kb] = b;
    const isIdx = ka.startsWith('i:') && kb.startsWith('i:');
    if (isIdx) return parseInt(ka.slice(2), 10) - parseInt(kb.slice(2), 10);
    const ya = parseFloat(ka.slice(2)) || 0;
    const yb = parseFloat(kb.slice(2)) || 0;
    return ya - yb;
  });

  return rows.map(([, arr]) => arr);
}

/**
 * pickMLP: choose MLP based on reference (front row centre, back row centre, or average of all).
 * Seats are expected to have {x, y}. Robust to nulls.
 */
export function pickMLP(mlpRef, seats) {
  if (!Array.isArray(seats) || seats.length === 0) return null;

  const rows = groupSeatsByRow(seats);

  const centreOf = (arr) => {
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const sx = arr.reduce((a, s) => a + (s?.x ?? 0), 0);
    const sy = arr.reduce((a, s) => a + (s?.y ?? 0), 0);
    const sz = arr.reduce((a, s) => a + (s?.z ?? 1.2), 0);
    return { x: sx / arr.length, y: sy / arr.length, z: sz / arr.length };
  };

  const centreAll = () => centreOf(seats);

  switch (mlpRef) {
    case 'front':
      return centreOf(rows?.[0]) ?? centreAll();
    case 'back':
      return centreOf(rows?.[rows.length - 1]) ?? centreAll();
    case 'middle':
      if (rows.length >= 3) {
        if (rows.length % 2 !== 0) {
          const midIndex = Math.floor(rows.length / 2);
          return centreOf(rows[midIndex]) ?? centreAll();
        } else {
          const mid1 = centreOf(rows[rows.length / 2 - 1]);
          const mid2 = centreOf(rows[rows.length / 2]);
          if (!mid1 || !mid2) return centreAll();
          return { 
            x: (mid1.x + mid2.x) / 2, 
            y: (mid1.y + mid2.y) / 2,
            z: (mid1.z + mid2.z) / 2
          };
        }
      }
      return centreOf(rows[0]) ?? centreAll();
    case 'all':
    default:
      return centreAll();
  }
}

export function computeMLPAndPrimary(seats, roomWidth, roomLength, mlpBasis = "front") {
  if (!Array.isArray(seats) || seats.length === 0) {
    return { mlp: null, primary: null, seatsWithFlags: [] };
  }

  const mlp = pickMLP(mlpBasis, seats);
  
  const rows = groupSeatsByRow(seats);
  
  let targetRowIndices = [];
  switch (mlpBasis) {
    case 'front':
      targetRowIndices = [0];
      break;
    case 'back':
      targetRowIndices = [rows.length - 1];
      break;
    case 'middle':
      if (rows.length >= 3) {
        if (rows.length % 2 !== 0) {
          targetRowIndices = [Math.floor(rows.length / 2)];
        } else {
          targetRowIndices = [rows.length / 2 - 1, rows.length / 2];
        }
      } else {
        targetRowIndices = Array.from({length: rows.length}, (_, i) => i);
      }
      break;
    case 'all':
    default:
      targetRowIndices = Array.from({length: rows.length}, (_, i) => i);
      break;
  }

  const primarySeatIds = new Set();
  targetRowIndices.forEach(idx => {
    const row = rows[idx];
    if (!row) return;
    
    const sorted = [...row].sort((a, b) => (a.x ?? 0) - (b.x ?? 0));
    const n = sorted.length;
    
    if (n <= 2) {
      sorted.forEach(s => primarySeatIds.add(s.id));
    } else if (n === 3) {
      primarySeatIds.add(sorted[1].id);
    } else if (n === 4) {
      primarySeatIds.add(sorted[1].id);
      primarySeatIds.add(sorted[2].id);
    } else {
      const mid = Math.floor(n / 2);
      primarySeatIds.add(sorted[mid - 1].id);
      primarySeatIds.add(sorted[mid].id);
      primarySeatIds.add(sorted[mid + 1].id);
    }
  });

  const seatsWithFlags = seats.map(s => ({
    ...s,
    isPrimary: primarySeatIds.has(s.id)
  }));

  const primary = seatsWithFlags.find(s => s.isPrimary) || seatsWithFlags[0] || null;

  return { mlp, primary, seatsWithFlags };
}

/**
 * Given an mlpAnchor {x,y,z}, returns target row Y centres based on mode and offsets.
 * This allows seats to be positioned AROUND the anchor rather than deriving anchor FROM seats.
 * 
 * @param {string} mlpRef - 'front' | 'back' | 'middle' | 'all'
 * @param {object} mlpAnchor - {x, y, z} - the fixed anchor point
 * @param {number} rowCount - number of rows (1, 2, 3...)
 * @param {number} rowSpacingM - metres between row centres (default 0.9)
 * @param {number} viewingOffsetM - metres: positive = move audience back, negative = forward (default 0)
 * @returns {number[]} - array of Y coordinates for each row
 */
export function computeRowCentersAroundAnchor({
  mlpRef,
  mlpAnchor,
  rowCount,
  rowSpacingM = 0.9,
  viewingOffsetM = 0,
}) {
  if (!mlpAnchor || !rowCount || rowCount < 1) return [];

  // Apply viewing offset to anchor Y position
  const anchorY = mlpAnchor.y + viewingOffsetM;

  // Single row: always centre on the anchor regardless of mode
  if (rowCount === 1) {
    return [anchorY];
  }

  if (mlpRef === 'front') {
    // Front row sits ON the dot; subsequent rows are BEHIND it (increasing Y)
    return Array.from({ length: rowCount }, (_, i) => anchorY + i * rowSpacingM);
  }

  if (mlpRef === 'back') {
    // Back row sits ON the dot; earlier rows are IN FRONT (decreasing Y)
    // Example for 2 rows: [anchorY - rowSpacingM, anchorY]
    return Array.from({ length: rowCount }, (_, i) => anchorY - (rowCount - 1 - i) * rowSpacingM);
  }

  if (mlpRef === 'middle') {
    // Middle row(s) on anchor, symmetric distribution
    if (rowCount === 2) {
      // Two rows: straddle the anchor
      return [anchorY - rowSpacingM / 2, anchorY + rowSpacingM / 2];
    }
    if (rowCount % 2 !== 0) {
      // Odd rows: middle row exactly on anchor
      const mid = Math.floor(rowCount / 2);
      return Array.from({ length: rowCount }, (_, i) => anchorY + (i - mid) * rowSpacingM);
    } else {
      // Even rows: anchor sits between two middle rows
      const mid = rowCount / 2;
      return Array.from({ length: rowCount }, (_, i) => anchorY + (i - mid + 0.5) * rowSpacingM);
    }
  }

  // 'all' or default: ALL_ROWS_AVERAGE - symmetric around the anchor
  const mid = (rowCount - 1) / 2;
  return Array.from({ length: rowCount }, (_, i) => anchorY + (i - mid) * rowSpacingM);
}

/**
 * Compute ideal viewing distance for 57.5° horizontal FOV
 * @param {number} screenWidthM - visible screen width in metres
 * @returns {number} - distance in metres from screen to MLP
 */
export function distanceFor57_5FromWidth(screenWidthM) {
  if (!Number.isFinite(screenWidthM) || screenWidthM <= 0) return 2.5;
  const targetAngleRad = (57.5 * Math.PI) / 180;
  return (screenWidthM / 2) / Math.tan(targetAngleRad / 2);
}

/**
 * Compute row centers from a base MLP Y position
 * @param {number} baseMlpY - base Y position before offset
 * @param {number} rowCount - number of rows
 * @param {number} rowSpacingM - spacing between rows in metres
 * @param {string} mlpReference - 'front' | 'back' | 'all' (average)
 * @returns {number[]} - array of row center Y positions
 */
export function buildRowCenters(baseMlpY, rowCount, rowSpacingM, mlpReference) {
  if (!Number.isFinite(baseMlpY) || !Number.isFinite(rowSpacingM) || rowCount < 1) {
    return [];
  }

  const count = Math.max(1, Math.floor(rowCount));
  
  if (count === 1) {
    return [baseMlpY];
  }

  if (mlpReference === 'front') {
    // Front row at baseMlpY, others behind
    return Array.from({ length: count }, (_, i) => baseMlpY + i * rowSpacingM);
  }

  if (mlpReference === 'back') {
    // Back row at baseMlpY, others in front
    return Array.from({ length: count }, (_, i) => baseMlpY - (count - 1 - i) * rowSpacingM);
  }

  // 'all' (average) - symmetric around baseMlpY
  const mid = (count - 1) / 2;
  return Array.from({ length: count }, (_, i) => baseMlpY + (i - mid) * rowSpacingM);
}