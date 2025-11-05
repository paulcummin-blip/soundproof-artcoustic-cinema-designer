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

  // Get primary seats for each row (for flag assignment)
  const getRowPrimaries = (rowSeats) => {
    const sorted = [...(rowSeats || [])].sort((a, b) => a.x - b.x);
    const n = sorted.length;
    const primaryIdx = new Set();
    if (n <= 2) { for (let i = 0; i < n; i++) primaryIdx.add(i); }
    else if (n === 3) { primaryIdx.add(1); }
    else if (n === 4) { primaryIdx.add(1); primaryIdx.add(2); }
    else { const mid = Math.floor(n / 2); primaryIdx.add(mid - 1); primaryIdx.add(mid); primaryIdx.add(mid + 1); }
    return sorted.filter((_, i) => primaryIdx.has(i));
  };
  
  let primaryReferenceRowNumbers = [];
   switch (mlpBasis) {
      case 'front': primaryReferenceRowNumbers = [rowNumbers[0]]; break;
      case 'back': primaryReferenceRowNumbers = [rowNumbers[rowNumbers.length - 1]]; break;
      case 'all': primaryReferenceRowNumbers = rowNumbers; break;
      case 'middle':
        if (rowNumbers.length >= 3) {
            if (rowNumbers.length % 2 !== 0) {
                primaryReferenceRowNumbers = [rowNumbers[Math.floor(rowNumbers.length / 2)]];
            } else {
                primaryReferenceRowNumbers = [rowNumbers[rowNumbers.length / 2 - 1], rowNumbers[rowNumbers.length / 2]];
            }
        } else {
            primaryReferenceRowNumbers = rowNumbers;
        }
        break;
      default: primaryReferenceRowNumbers = rowNumbers; break;
  }

  const primarySeatIds = new Set();
  primaryReferenceRowNumbers.forEach(rowNum => {
    const rowSeats = seatsByRow[rowNum] || [];
    const primaryInRow = getRowPrimaries(rowSeats);
    primaryInRow.forEach(seat => primarySeatIds.add(seat.id));
  });

  const seatsWithFlags = valid.map(seat => ({
    ...seat,
    isPrimary: primarySeatIds.has(seat.id),
  }));

  const frontRow = seatsByRow[rowNumbers[0]] || [];

  return { mlp, frontRow, seatsWithFlags };
}