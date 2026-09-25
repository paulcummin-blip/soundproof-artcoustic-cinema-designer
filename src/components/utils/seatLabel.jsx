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

/**
 * Convert a seat ID like "seat-r1-c1" to a compact pill label like "R1S1".
 * This is the canonical format used by the seat selector pills and the bass
 * graph limiting-seat marker. Matches the mapping:
 *   seat-r1-c1 → R1S1
 *   seat-r1-c2 → R1S2
 *   seat-r2-c1 → R2S1
 * @param {string} seatId - The seat identifier (e.g., "seat-r1-c1")
 * @returns {string} - Compact pill label (e.g., "R1S1"), or the input as-is if it doesn't match
 */
export function formatSeatPillLabel(seatId) {
  if (!seatId || typeof seatId !== 'string') return seatId || '';
  const match = seatId.match(/^seat-r(\d+)-c(\d+)$/);
  if (!match) return seatId;
  return `R${match[1]}S${match[2]}`;
}