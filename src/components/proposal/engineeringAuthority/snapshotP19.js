/**
 * Passive proposal adapter for canonical P19 authority.
 * No seat grouping, floor calculation, or grading is permitted here.
 */

export function buildSnapshotP19(engineeringSummary) {
  const authority = engineeringSummary?.p19SeatAuthority || null;
  const perSeat = engineeringSummary?.project?.reportCounts?.seatResultsByParameter?.p19 || [];
  if (!authority && perSeat.length === 0) {
    return {
      rsp: null,
      primary_floor: null,
      secondary_floor: null,
      project_floor: null,
      per_seat: [],
      coverage_summary: "NOT CALCULATED",
    };
  }
  return {
    rsp: null,
    primary_floor: engineeringSummary?.parameterSummaries?.primary?.p19?.level ?? null,
    secondary_floor: engineeringSummary?.parameterSummaries?.secondary?.p19?.level ?? null,
    project_floor: engineeringSummary?.parameterSummaries?.project?.p19?.level ?? null,
    per_seat: perSeat.map((seat) => ({
      seat_id: seat.seatId,
      priority: seat.priority,
      row: seat.row,
      column: seat.column,
      grade: seat.level,
      raw_value: seat.value,
      display_value: seat.valueFormatted,
      calculated: seat.status === "ok" || seat.level !== "—",
    })),
    coverage_summary: authority?.project?.coverageSummary
      ?? engineeringSummary?.project?.coverage?.sentence
      ?? "NOT CALCULATED",
  };
}
