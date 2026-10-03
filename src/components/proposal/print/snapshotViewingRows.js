/**
 * snapshotViewingRows
 * -------------------
 * The RP23 horizontal viewing geometry of the client pack, stated one seating row
 * at a time.
 *
 * RP23 is a per-row result: row 1 can sit inside the screen's viewing window
 * while row 2 does not. A single level for the whole room would therefore
 * contradict the report, so the pack reads exactly as the Technical Report's RP23
 * rows and the Visual Report's viewing page read — one result per row, taken from
 * that row's representative seat.
 *
 * Sources, both already published in the frozen snapshot:
 *   snapshot.seats             → { id, row, position.x, is_reference }
 *   snapshot.viewing.per_seat  → { seat_id, horizontal_angle_deg, rp23_level }
 *
 * The representative seat is the seat nearest the room centreline, which is how
 * the report's row authority defines it. Nothing is averaged. No level is graded
 * here: a level is stated as published, and derived through the app's shared
 * rp23LevelForAngleDeg only where an older snapshot states the angle alone — the
 * same fallback the Technical Report uses.
 *
 * Pure: no React, no fetching, no side effects.
 */

import { rp23DisplayAngleDeg, rp23LevelForAngleDeg } from '@/components/utils/viewingAngleUtils';

/** The seat's x position in metres, or null when the snapshot states none. */
function seatX(seat) {
  const x = Number(seat?.position?.x);
  return Number.isFinite(x) ? x : null;
}

/** The row's own centre, used only when the room width is not published. */
function rowCentreX(rowSeats) {
  const xs = rowSeats.map(seatX).filter((x) => x !== null).sort((a, b) => a - b);
  if (xs.length === 0) return 0;
  return xs[Math.floor((xs.length - 1) / 2)];
}

/** The seat nearest the centreline — the seat the row is stated by. */
function representativeSeat(rowSeats, centreX) {
  return rowSeats
    .slice()
    .sort((a, b) => {
      const da = Math.abs((seatX(a) ?? centreX) - centreX);
      const db = Math.abs((seatX(b) ?? centreX) - centreX);
      if (Math.abs(da - db) > 0.001) return da - db;
      return String(a.id).localeCompare(String(b.id));
    })[0];
}

/**
 * One entry per seating row, in row order, each carrying its own whole-degree
 * angle, its own published RP23 level, and the line the pack prints:
 *
 *   { rowNumber: 1, angleDeg: 63.2, angleText: '63°', level: 'L4',
 *     line: 'Row 1 · 63° · RP23 L4' }
 *
 * A row whose published angle is missing is left out rather than guessed at, and
 * a reference seat (the RSP) is never a row's representative seat.
 *
 * @returns {Array<{ rowNumber: number, angleDeg: number, angleText: string, level: string|null, line: string }>}
 */
export function resolveViewingRows(snapshot) {
  const seats = (Array.isArray(snapshot?.seats) ? snapshot.seats : [])
    .filter((seat) => seat?.id && seat.is_reference !== true);
  if (seats.length === 0) return [];

  const published = new Map(
    (Array.isArray(snapshot?.viewing?.per_seat) ? snapshot.viewing.per_seat : [])
      .filter((result) => result?.seat_id)
      .map((result) => [String(result.seat_id), result])
  );

  const widthM = Number(snapshot?.room?.dimensions?.width_m);
  const roomCentreX = Number.isFinite(widthM) && widthM > 0 ? widthM / 2 : null;

  const byRow = new Map();
  seats.forEach((seat) => {
    const row = Number(seat.row);
    if (!Number.isFinite(row)) return;
    if (!byRow.has(row)) byRow.set(row, []);
    byRow.get(row).push(seat);
  });

  return [...byRow.keys()]
    .sort((a, b) => a - b)
    .map((rowNumber) => {
      const rowSeats = byRow.get(rowNumber);
      const centreX = roomCentreX ?? rowCentreX(rowSeats);
      const seat = representativeSeat(rowSeats, centreX);
      const result = published.get(String(seat.id)) || null;

      const angle = Number(result?.horizontal_angle_deg);
      if (!Number.isFinite(angle)) return null;

      const level = result?.rp23_level || rp23LevelForAngleDeg(angle) || null;
      // Whole degrees as the app itself displays them, so the angle and its level
      // always agree with the seat views the designer has already seen.
      const displayDeg = rp23DisplayAngleDeg(angle);
      const angleText = `${displayDeg === null ? Math.round(angle) : displayDeg}°`;
      return {
        rowNumber,
        angleDeg: angle,
        angleText,
        level,
        line: [`Row ${rowNumber}`, angleText, level ? `RP23 ${level}` : null]
          .filter(Boolean)
          .join(' · '),
      };
    })
    .filter(Boolean);
}

export default resolveViewingRows;