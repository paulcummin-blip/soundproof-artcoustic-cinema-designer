/**
 * Seat evidence joins the report's frozen seating authority to its RP23 and
 * RP22 authority by exact seat ID. Never parse IDs or consult live state.
 */
const number = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
const rounded = (value, places = 2) => {
  const n = number(value); return n == null ? null : Math.round(n * 10 ** places) / 10 ** places;
};
export function buildReportSeating({ seats = [], viewing = [], screenPlaneM = null,
  seatResultsByParameter = {}, seatHudById = {}, p19 = null } = {}) {
  const rowCounts = new Map();
  const perSeat = seats.filter(s => s && (s.id || s.seat_id)).map(seat => {
    const id = seat.id || seat.seat_id;
    const row = seat.row ?? seat.rowNumber ?? null;
    const ordinal = (rowCounts.get(row) || 0) + 1;
    rowCounts.set(row, ordinal);
    const view = viewing.find(v => (v.seat_id || v.seatId) === id) || {};
    const y = number(seat.position?.y ?? seat.y);
    const plane = number(screenPlaneM);
    const distance = view.distance_m ?? view.distanceM ?? view.distanceFromScreen
      ?? (y != null && plane != null ? Math.abs(y - plane) : null);
    const results = {};
    for (const [key, entries] of Object.entries(seatResultsByParameter)) {
      const result = Array.isArray(entries) ? entries.find(r => (r.seatId || r.seat_id) === id) : null;
      if (result) results[key] = result;
    }
    const hud = seatHudById[id]?.rp22 || {};
    return {
      seat_id: id, row, column: seat.column ?? seat.col ?? seat.seatNumber ?? ordinal,
      priority: seat.priority ?? null, seat_label: seat.label || id,
      position: { x_m: rounded(seat.position?.x ?? seat.x), y_m: rounded(y),
        z_m: rounded(seat.position?.z ?? seat.z) },
      distance_m: rounded(distance),
      horizontal_angle_deg: rounded(view.horizontal_angle_deg ?? view.horizontalAngleDeg ?? view.angleDeg, 1),
      vertical_angle_deg: rounded(view.vertical_angle_deg ?? view.verticalAngleDeg, 1),
      rp23_level: view.rp23_level ?? view.level ?? null,
      rp22_results: results, p20_result: results.p20 ?? hud.p20 ?? null,
      // P19 is RSP-only: a link to that result, never a manufactured seat P19.
      p19_rsp_ref: p19 ? { scope: 'RSP', result: p19 } : null,
    };
  });
  const rows = [...rowCounts.keys()].filter(r => r != null).sort((a,b) => Number(a)-Number(b));
  return {
    rows, row_count: rows.length, seats: perSeat.length,
    primary_seats: perSeat.filter(s => s.priority === 'primary').length,
    secondary_seats: perSeat.filter(s => s.priority === 'secondary').length,
    per_seat: perSeat, per_row_viewing: rows.map(row => perSeat.find(s => s.row === row)),
    seat_ids: perSeat.map(s => s.seat_id),
  };
}