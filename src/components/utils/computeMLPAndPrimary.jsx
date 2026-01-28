// Round to 1mm for stable comparisons
const round3 = (n) => Math.round(n * 1000) / 1000;

// Primary seat eligibility constants
const WALL_CLEARANCE_MIN_M = 1.0;
const ELLIPSE_A_M = 2.2;  // side-to-side radius (wider for adjacent seats)
const ELLIPSE_B_M = 0.95;  // front-to-back radius (tighter for row spacing control)
const DIST_SOFT_MAX_M = 1.9;
const SCORE_TOLERANCE = 0.10;

// Enhanced MLP calculation with basis selection
export function computeMLPAndPrimary(seats, W = 0, L = 0, mlpBasis = "front", mlpOverride = null) {
  const width = Number(W) || 0;
  const length = Number(L) || 0;

  const valid = Array.isArray(seats)
    ? seats.filter(s => Number.isFinite(s?.x) && Number.isFinite(s?.y))
    : [];

  const fallbackMlp = { x: width / 2, y: Math.min(length * 0.58, length - 1.2) };

  if (!valid.length) {
    return {
      mlp: fallbackMlp,
      frontRow: [],
      seatsWithFlags: [],
    };
  }

  // Group seats by row number
  const seatsByRow = {};
  valid.forEach(seat => {
    const row = seat.rowNumber || 1;
    if (!seatsByRow[row]) seatsByRow[row] = [];
    seatsByRow[row].push(seat);
  });

  const rowNumbers = Object.keys(seatsByRow).map(Number).sort((a, b) => a - b);
  
  // Calculate center point for each row
  const rowCenters = rowNumbers.map(rowNum => {
    const rowSeats = seatsByRow[rowNum];
    const avgX = rowSeats.reduce((sum, seat) => sum + seat.x, 0) / rowSeats.length;
    const avgY = rowSeats.reduce((sum, seat) => sum + seat.y, 0) / rowSeats.length;
    return { rowNum, x: avgX, y: avgY };
  });

  if (rowCenters.length === 0) {
    return { mlp: fallbackMlp, frontRow: [], seatsWithFlags: valid };
  }

  // Calculate MLP based on selected basis
  let mlp = fallbackMlp;

  switch(mlpBasis) {
    case 'front':
      mlp = rowCenters[0];
      break;
    case 'back':
      mlp = rowCenters[rowCenters.length - 1];
      break;
    case 'middle':
      if (rowCenters.length >= 3) {
        if (rowCenters.length % 2 !== 0) { // Odd number of rows
          const midIndex = Math.floor(rowCenters.length / 2);
          mlp = rowCenters[midIndex];
        } else { // Even number of rows, average the two middle ones
          const mid1 = rowCenters[rowCenters.length / 2 - 1];
          const mid2 = rowCenters[rowCenters.length / 2];
          mlp = { x: (mid1.x + mid2.x) / 2, y: (mid1.y + mid2.y) / 2 };
        }
      } else { // Fallback for 1 or 2 rows
        mlp = rowCenters[0];
      }
      break;
    case 'all':
    default:
      const totalX = rowCenters.reduce((sum, center) => sum + center.x, 0);
      const totalY = rowCenters.reduce((sum, center) => sum + center.y, 0);
      mlp = { x: totalX / rowCenters.length, y: totalY / rowCenters.length };
      break;
  }

  // Override with live green-dot position if provided
  if (mlpOverride && Number.isFinite(mlpOverride.x) && Number.isFinite(mlpOverride.y)) {
    mlp = { x: mlpOverride.x, y: mlpOverride.y };
  }

  // Find RSP seat (closest to MLP green dot) with stable tie-breaker
  const distToMlp = (seat) => Math.hypot(seat.x - mlp.x, seat.y - mlp.y);
  const rspSeat = valid.reduce((closest, seat) => {
    const dA = round3(distToMlp(seat));
    const dB = round3(distToMlp(closest));
    if (dA < dB) return seat;
    if (dA > dB) return closest;
    return String(seat.id).localeCompare(String(closest.id)) < 0 ? seat : closest;
  }, valid[0]);

  // Extract row number from seat ID (e.g., "seat-r2-c3" -> 2)
  const getRowNum = (seat) => {
    const match = seat.id?.match(/r(\d+)/);
    return match ? parseInt(match[1]) : 1;
  };

  // Calculate min distance to any wall
  const minDistToWall = (seat) => {
    const distLeft = seat.x;
    const distRight = width - seat.x;
    const distFront = seat.y;
    const distBack = length - seat.y;
    return Math.min(distLeft, distRight, distFront, distBack);
  };

  // Score each seat
  const seatsWithScores = valid.map(seat => {
    const d = distToMlp(seat);
    
    // A) Distance to RSP (dominant factor)
    let distScore = 0;
    if (d <= 0.6) {
      distScore = 1;
    } else if (d < 2.0) {
      distScore = 1 - ((d - 0.6) / (2.0 - 0.6));
    }

    // B) Row relationship (small bias)
    const seatRow = getRowNum(seat);
    const rspRow = getRowNum(rspSeat);
    let rowBonus = 0;
    if (seatRow === rspRow) {
      rowBonus = 0.15;
    } else if (Math.abs(seatRow - rspRow) === 1) {
      rowBonus = 0.08;
    }

    // C) Wall proximity penalty (tie-breaker)
    const w = minDistToWall(seat);
    let wallPenalty = 0;
    if (w <= 0.4) {
      wallPenalty = 0.10;
    } else if (w < 0.8) {
      wallPenalty = ((0.8 - w) / (0.8 - 0.4)) * 0.10;
    }

    const score = distScore + rowBonus - wallPenalty;
    
    // Wall clearance for eligibility
    const wallClearance = minDistToWall(seat);
    
    // Ellipse eligibility around MLP (green dot)
    const dx = seat.x - mlp.x;
    const dy = seat.y - mlp.y;
    const ellipseNorm = Math.sqrt((dx / ELLIPSE_A_M) ** 2 + (dy / ELLIPSE_B_M) ** 2);
    
    // Eligibility gates
    const isEligible = 
      ellipseNorm <= 1 &&
      wallClearance >= WALL_CLEARANCE_MIN_M &&
      d <= DIST_SOFT_MAX_M;

    return { seat, score, isEligible };
  });

  // Select Primary seats: all eligible seats (no score tolerance)
  const eligibleSeats = seatsWithScores.filter(s => s.isEligible);
  
  // RSP is always Primary
  const primarySeatIds = new Set();
  primarySeatIds.add(rspSeat.id);
  
  // Add all other eligible seats
  eligibleSeats.forEach(s => primarySeatIds.add(s.seat.id));

  const seatsWithFlags = valid.map(seat => ({
    ...seat,
    isPrimary: primarySeatIds.has(seat.id),
  }));

  const frontRow = seatsByRow[rowNumbers[0]] || [];

  return { mlp, frontRow, seatsWithFlags };
}