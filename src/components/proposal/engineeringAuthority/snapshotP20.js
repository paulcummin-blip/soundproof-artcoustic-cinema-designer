/**
 * Passive proposal adapter for canonical P20 authority.
 * P20 has no FAIL grade: every finite assessed result is at least L1.
 * No seat grouping, floor calculation, or grading is permitted here.
 */

export function buildSnapshotP20(engineeringSummary) {
  const perSeat = engineeringSummary?.project?.reportCounts?.seatResultsByParameter?.p20 || [];
  return {
    rsp: null,
    primary_floor: engineeringSummary?.parameterSummaries?.primary?.p20?.level ?? null,
    secondary_floor: engineeringSummary?.parameterSummaries?.secondary?.p20?.level ?? null,
    project_floor: engineeringSummary?.parameterSummaries?.project?.p20?.level ?? null,
    per_seat: perSeat.map((seat) => ({
      seat_id: seat.seatId,
      priority: seat.priority,
      row: seat.row,
      column: seat.column,
      grade: seat.level,
      raw_value: seat.value,
      display_value: seat.valueFormatted,
    })),
  };
}
