/**
 * Technical Report — RP23 horizontal viewing row authority.
 * --------------------------------------------------------
 * The Technical Report states one RP23 horizontal viewing result per seating row.
 * Those values come from the SAME published authority the Visual Report's Viewing
 * Experience page and the Room Designer seat pop-up read:
 *
 *   engineeringSummary.viewing.per_seat  →  { seat_id, horizontal_angle_deg, rp23_level }
 *
 * Nothing is recalculated here. The published angle is stated as published, and the
 * published level is stated as published. A level is only ever derived, through the
 * app's own shared `rp23LevelForAngleDeg`, when an older published summary carries
 * the angle alone — in that case the seat HUD snapshot supplies the angle.
 */

import { rp23LevelForAngleDeg } from "@/components/utils/viewingAngleUtils";

/** The published per-seat viewing authority, keyed by seat id. */
function viewingBySeatId(engineeringSummary) {
  const perSeat = Array.isArray(engineeringSummary?.viewing?.per_seat)
    ? engineeringSummary.viewing.per_seat
    : [];
  return new Map(perSeat.map((result) => [String(result?.seat_id), result]));
}

/** The seat HUD snapshot's RP23 entry — the older, angle-only surface. */
function hudRp23For(engineeringSummary, seatId) {
  return engineeringSummary?.seatHudById?.[String(seatId)]?.rp23 || null;
}

/**
 * The representative position is stated positionally — it is the seat nearest the
 * room centreline in that row, so the row reads "centre seat" rather than a seat
 * identifier. Seat identifiers belong to engineer-level traceability, not to the
 * report's default view.
 */
function representativeSeatLabel() {
  return "centre seat";
}

/**
 * Resolve the RP23 rows the Technical Report states — one per representative seat.
 *
 * @param {Object}   args
 * @param {Array}    args.representativeSeats  One representative seat per row (the centre seat).
 * @param {Object}   args.engineeringSummary   The published engineering summary.
 * @returns {{ hasAny: boolean, rows: Array }}
 */
export function resolveTechnicalViewingRows({ representativeSeats, engineeringSummary } = {}) {
  const seats = Array.isArray(representativeSeats) ? representativeSeats.filter(Boolean) : [];
  if (seats.length === 0) return { hasAny: false, rows: [] };

  const viewing = viewingBySeatId(engineeringSummary);

  const rows = seats.map((seat) => {
    const rowNumber = seat.rowNumber || 1;
    const published = viewing.get(String(seat.id)) || null;
    const hud = hudRp23For(engineeringSummary, seat.id);

    const publishedAngle = Number(published?.horizontal_angle_deg);
    const hudAngle = Number(hud?.angleDeg);
    const angleDeg = Number.isFinite(publishedAngle)
      ? publishedAngle
      : Number.isFinite(hudAngle)
      ? hudAngle
      : null;

    // The level is always the published one; only a legacy snapshot that states an
    // angle without a level has it derived — via the shared RP23 grading authority.
    const publishedLevel = published?.rp23_level || null;
    const level = publishedLevel
      || (angleDeg != null ? rp23LevelForAngleDeg(angleDeg) : null)
      || hud?.level
      || null;

    return {
      rowNumber,
      seatId: seat.id ?? null,
      seatLabel: representativeSeatLabel(),
      angleDeg,
      angleFormatted: angleDeg != null ? `${angleDeg.toFixed(1)}°` : "—",
      level,
    };
  });

  return {
    hasAny: rows.some((row) => row.angleDeg != null || row.level),
    rows,
  };
}

export default resolveTechnicalViewingRows;