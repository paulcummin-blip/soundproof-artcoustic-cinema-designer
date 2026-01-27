/**
 * Convert a seat ID like "seat-r1-c1" to a friendly label like "Row 1 - Seat 1"
 * @param {string} seatId - The seat identifier (e.g., "seat-r1-c1")
 * @returns {string} - Friendly label (e.g., "Row 1 - Seat 1")
 */
export function formatSeatLabel(seatId) {
  if (!seatId || typeof seatId !== 'string') return seatId || '';
  
  // Match pattern: seat-r{row}-c{col}
  const match = seatId.match(/^seat-r(\d+)-c(\d+)$/);
  
  if (!match) {
    // Not in expected format, return as-is
    return seatId;
  }
  
  const row = match[1];
  const col = match[2];
  
  return `Row ${row} - Seat ${col}`;
}