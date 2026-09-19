/**
 * snapshotViewing.js
 * --------------------------------
 * Reads canonical RP23 viewing results from the analysis engine's published
 * perSeatRp23 output (analysisResult.perSeatRp23[seatId].angleDeg).
 *
 * This is the SAME canonical source consumed by buildLightweightSeatHudById
 * in useAppDesignRating. No fragile multi-key probing. No independent RP23
 * recalculation.
 *
 * Pure function. No React. No side effects.
 */

import { rp23LevelForAngleDeg } from '@/components/utils/viewingAngleUtils';
import { resolveSeatPriority, PRIMARY, SECONDARY } from '@/components/utils/seatPriorityAuthority';

const LEVEL_RANK = Object.freeze({ FAIL: 0, L1: 1, L2: 2, L3: 3, L4: 4 });

function rp23FloorFor(seats) {
  const calculated = seats.filter((s) => s.rp23_level != null && LEVEL_RANK[s.rp23_level] != null);
  if (!calculated.length) return null;
  return calculated.reduce(
    (floor, seat) => (LEVEL_RANK[seat.rp23_level] < LEVEL_RANK[floor] ? seat.rp23_level : floor),
    calculated[0].rp23_level,
  );
}

/**
 * @param {Object} analysisResult — from useRP22AnalysisEngine
 * @param {Array} seats — canonical seating positions with priority
 * @returns {{ available, per_seat, primary_floor, secondary_floor, project_floor, summary }}
 */
export function buildSnapshotViewing(analysisResult, seats) {
  const perSeatRp23 = analysisResult?.perSeatRp23;
  const seatList = Array.isArray(seats) ? seats : [];

  const perSeat = seatList.map((seat) => {
    const engineRp23 = perSeatRp23?.[seat.id];
    const angleDeg = engineRp23 && Number.isFinite(engineRp23.angleDeg) ? Number(engineRp23.angleDeg) : null;
    const level = angleDeg != null ? rp23LevelForAngleDeg(angleDeg) : null;
    return {
      seat_id: seat.id,
      priority: resolveSeatPriority(seat),
      horizontal_angle_deg: angleDeg,
      rp23_level: level,
    };
  });

  const hasAnyAngle = perSeat.some((s) => s.horizontal_angle_deg != null);
  if (!hasAnyAngle) {
    return {
      available: false,
      per_seat: [],
      primary_floor: null,
      secondary_floor: null,
      project_floor: null,
      summary: 'Viewing angles not calculated.',
    };
  }

  const primarySeats = perSeat.filter((s) => s.priority === PRIMARY);
  const secondarySeats = perSeat.filter((s) => s.priority === SECONDARY);

  const primaryFloor = rp23FloorFor(primarySeats);
  const secondaryFloor = rp23FloorFor(secondarySeats);
  const projectFloor = rp23FloorFor(perSeat);

  const angles = perSeat.filter((s) => s.horizontal_angle_deg != null).map((s) => s.horizontal_angle_deg);
  const minH = angles.length > 0 ? Math.min(...angles) : null;
  const maxH = angles.length > 0 ? Math.max(...angles) : null;

  let summary = `Viewing angles calculated for ${angles.length} seat${angles.length !== 1 ? 's' : ''}.`;
  if (minH != null && maxH != null) {
    summary += ` Horizontal viewing angle ranges from ${minH.toFixed(0)}° to ${maxH.toFixed(0)}°.`;
  }

  return {
    available: true,
    per_seat: perSeat,
    primary_floor: primaryFloor,
    secondary_floor: secondaryFloor,
    project_floor: projectFloor,
    summary,
  };
}