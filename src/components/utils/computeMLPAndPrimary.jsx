// Enhanced MLP calculation with basis selection
export function computeMLPAndPrimary(seats, W = 0, L = 0, mlpBasis = "front") {
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

  // Find RSP seat (closest to MLP green dot)
  const distToMlp = (seat) => Math.hypot(seat.x - mlp.x, seat.y - mlp.y);
  const rspSeat = valid.reduce((closest, seat) => 
    distToMlp(seat) < distToMlp(closest) ? seat : closest
  , valid[0]);

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

    return { seat, score };
  });

  // Select Primary seats: RSP + top 3 others by score (max 4 total)
  const primarySeatIds = new Set([rspSeat.id]);
  
  seatsWithScores
    .filter(s => s.seat.id !== rspSeat.id)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .forEach(s => primarySeatIds.add(s.seat.id));

  const seatsWithFlags = valid.map(seat => ({
    ...seat,
    isPrimary: primarySeatIds.has(seat.id),
  }));

  const frontRow = seatsByRow[rowNumbers[0]] || [];

  return { mlp, frontRow, seatsWithFlags };
}