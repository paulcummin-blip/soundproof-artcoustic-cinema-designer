/**
 * snapshotP19.js
 * --------------------------------
 * Reads canonical P19 results from the published P19 seat authority
 * (summariseAuthoritativeP19Seats). Does NOT re-grade raw values. Does NOT
 * substitute RSP for seat values.
 *
 * The p19SeatAuthority publication owns:
 *   - per-seat published grades (unchanged from engine output)
 *   - Primary / Secondary / Project floors (conservative weakest-level)
 *   - coverage summary
 *
 * Pure function. No React. No side effects.
 */

/**
 * @param {Object} p19SeatAuthority — from summariseAuthoritativeP19Seats()
 * @param {Object} completedBassPresentation — for RSP-level P19 headline
 * @returns {{ rsp, primary_floor, secondary_floor, project_floor, per_seat, coverage_summary }}
 */
export function buildSnapshotP19(p19SeatAuthority, completedBassPresentation) {
  if (!p19SeatAuthority) {
    return {
      rsp: null,
      primary_floor: null,
      secondary_floor: null,
      project_floor: null,
      per_seat: [],
      coverage_summary: 'NOT CALCULATED',
    };
  }

  const rspParam = completedBassPresentation?.parameters?.p19;
  const rsp = rspParam
    ? {
        level: rspParam.level || null,
        raw_value: Number.isFinite(Number(rspParam.rawValue)) ? Number(rspParam.rawValue) : null,
      }
    : null;

  const primaryFloor = p19SeatAuthority.primary?.floor || null;
  const secondaryFloor = p19SeatAuthority.secondary?.floor || null;
  const projectFloor = p19SeatAuthority.project?.floor || null;
  const coverageSummary = p19SeatAuthority.project?.coverageSummary || 'NOT CALCULATED';

  const perSeat = (p19SeatAuthority.seats || []).map((seat) => ({
    seat_id: seat.seatId,
    priority: seat.priority,
    row: seat.row,
    column: seat.column,
    grade: seat.grade,
    raw_value: seat.rawValue,
    display_value: seat.displayedValue,
    calculated: seat.calculated,
  }));

  return {
    rsp,
    primary_floor: primaryFloor,
    secondary_floor: secondaryFloor,
    project_floor: projectFloor,
    per_seat: perSeat,
    coverage_summary: coverageSummary,
  };
}