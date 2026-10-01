/**
 * seatRowGrouping.js
 * ------------------
 * Physical row grouping for Visual Report seat result blocks.
 *
 * Seats are clustered into front-to-back rows by their y coordinate (the same
 * room coordinate authority every report drawing uses), and each row is ordered
 * left-to-right by x. The result is the seat arrangement the client sees in the
 * seating plan, so a seat-mapped result block can lay its pills out in the same
 * physical pattern instead of a linear Seat 1 … Seat N list.
 *
 * Presentation only: it groups and sorts already-published seat results and never
 * re-grades, re-measures or re-orders anything else.
 */

// Y-tolerance for treating seats as the same physical row (metres).
const ROW_TOLERANCE_M = 0.05;

function rowLabel(rowIndex, rowCount) {
  if (rowCount <= 1) return "Front row";
  if (rowIndex === 0) return "Front row";
  if (rowIndex === rowCount - 1) return "Rear row";
  return "Middle row";
}

/**
 * Group seats into physical rows, front to back.
 *
 * @param {Array} seats - seat results carrying x, y (metres) plus their own display fields
 * @returns {Array<{ rowIndex: number, label: string, y: number, seats: Array }>}
 *          One entry per physical row; `label` is the client-facing row name
 *          ("Front row", "Middle row", "Rear row") and `y` is the row's own
 *          depth in metres, so a result block can place a position that sits
 *          BETWEEN two rows (a free-standing reference position) in its real
 *          place in the plan.
 */
export function groupSeatsIntoRows(seats) {
  const list = (Array.isArray(seats) ? seats : []).filter((seat) => {
    const x = Number(seat?.x);
    const y = Number(seat?.y);
    return Number.isFinite(x) && Number.isFinite(y);
  });
  if (list.length === 0) return [];

  const sortedByY = [...list].sort((a, b) => Number(a.y) - Number(b.y));
  const clusters = [];
  for (const seat of sortedByY) {
    const last = clusters[clusters.length - 1];
    if (last && Math.abs(Number(seat.y) - last.y) <= ROW_TOLERANCE_M) {
      last.seats.push(seat);
    } else {
      clusters.push({ y: Number(seat.y), seats: [seat] });
    }
  }

  const rowCount = clusters.length;
  return clusters.map((cluster, index) => ({
    rowIndex: index + 1,
    label: rowLabel(index, rowCount),
    y: cluster.y,
    seats: [...cluster.seats].sort((a, b) => Number(a.x) - Number(b.x)),
  }));
}