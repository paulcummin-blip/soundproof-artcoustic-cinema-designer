/**
 * snapshotP20.js
 * --------------------------------
 * Reads canonical P20 results from the completed bass presentation's
 * perSeatP20Results, using the established p20SeatPresentation helpers for
 * per-seat row building and scoped floor derivation.
 *
 * Does NOT alter P20 maths. Does NOT rebuild grades. The floor is derived
 * from the published per-seat levels using the same conservative weakest-level
 * approach as p19SeatAuthority (floorFor pattern).
 *
 * Pure function. No React. No side effects.
 */

import { buildP20SeatRows, p20LevelText } from '@/components/room/bass/p20SeatPresentation';
import { resolveSeatPriority, PRIMARY, SECONDARY } from '@/components/utils/seatPriorityAuthority';

const LEVEL_RANK = Object.freeze({ FAIL: 0, L1: 1, L2: 2, L3: 3, L4: 4 });

function p20FloorFor(seats) {
  const calculated = seats.filter((s) => s.level !== '—' && LEVEL_RANK[s.level] != null);
  if (!calculated.length) return null;
  return calculated.reduce(
    (floor, seat) => (LEVEL_RANK[seat.level] < LEVEL_RANK[floor] ? seat.level : floor),
    calculated[0].level,
  );
}

/**
 * @param {Array} seatingPositions — canonical seats with priority
 * @param {Array} perSeatP20Results — from completedBassPresentation.perSeatP20Results
 * @param {Object} completedBassPresentation — for RSP-level P20 headline
 * @returns {{ rsp, primary_floor, secondary_floor, project_floor, per_seat }}
 */
export function buildSnapshotP20(seatingPositions, perSeatP20Results, completedBassPresentation) {
  const rows = buildP20SeatRows(seatingPositions, perSeatP20Results || []);
  const allSeats = rows.flatMap((r) => r.seats);

  const rspParam = completedBassPresentation?.parameters?.p20;
  const rsp = rspParam
    ? {
        level: rspParam.level || null,
        raw_value: Number.isFinite(Number(rspParam.rawValue)) ? Number(rspParam.rawValue) : null,
      }
    : null;

  const primarySeats = allSeats.filter((s) => s.priority === PRIMARY);
  const secondarySeats = allSeats.filter((s) => s.priority === SECONDARY);

  const primaryFloor = p20FloorFor(primarySeats);
  const secondaryFloor = p20FloorFor(secondarySeats);
  const projectFloor = p20FloorFor(allSeats);

  const perSeat = allSeats.map((seat) => ({
    seat_id: seat.seatId,
    priority: seat.priority,
    row: seat.row,
    column: seat.column,
    grade: seat.level,
    raw_value: seat.variationDbRaw,
    display_value: seat.displayVariationDb,
  }));

  return {
    rsp,
    primary_floor: primaryFloor,
    secondary_floor: secondaryFloor,
    project_floor: projectFloor,
    per_seat: perSeat,
  };
}