/**
 * p9SeatScopeAuthority
 * --------------------
 * The P9 Visual Report's seat scope: which seats the design has, which physical
 * seating row each one belongs to, and what each seat's PUBLISHED P9 result is.
 *
 * P9 is a seat-scoped parameter. Every seat carries its own result — the largest
 * vertical angle between ADJACENT overhead speaker rows as seen from that seat —
 * so the report presents the result seat by seat and row by row, and names the
 * project's limiting seat. There is no RSP-scoped P9 result in this module and
 * none is ever invented.
 *
 * The rows are the same physical rows every other seat-mapped report block uses
 * (groupSeatsIntoRows), and every value is the published per-seat result handed
 * in by selectClientP9Overhead. Presentation only: no grading, no measurement,
 * no recalculation.
 */

import { groupSeatsIntoRows } from "./seatRowGrouping";
import { isAssessedLevel } from "./visualReportSeatStyle";
import { formatSeatLabel } from "@/components/utils/seatLabel";

/**
 * P9 is only meaningful with two or more applicable overhead rows. With no
 * overhead speakers, or with a single overhead row, the visual page is not
 * rendered at all — an angle is never invented for it.
 */
export function isP9ReportApplicable(p9Snapshot) {
  const rows = Array.isArray(p9Snapshot?.representativeRows) ? p9Snapshot.representativeRows : [];
  return rows.length >= 2;
}

function seatEntry(seat, row) {
  const angle = Number(seat?.p9Degrees);
  const assessed = isAssessedLevel(seat?.p9Level) && Number.isFinite(angle);
  return {
    id: seat?.id,
    label: formatSeatLabel(seat?.id) || String(seat?.id ?? ""),
    x: Number(seat?.x),
    y: Number(seat?.y),
    z: Number.isFinite(Number(seat?.z)) ? Number(seat.z) : 1.2,
    level: seat?.p9Level ?? null,
    angle: assessed ? angle : null,
    priority: seat?.priority === "primary" ? "primary" : "secondary",
    assessed,
    rowLabel: row.label,
  };
}

/** The seat that decides a set of results: the largest published angle. */
function limitingOf(seats) {
  if (!seats.length) return null;
  return seats.reduce((max, seat) => (seat.angle > max.angle ? seat : max));
}

/**
 * Build the seat scope: every seat's published P9 result in its physical row,
 * each row's limiting seat, and the project's limiting seat.
 */
export function buildP9SeatScope({ seats }) {
  const rows = groupSeatsIntoRows(seats).map((row) => {
    const rowSeats = row.seats.map((seat) => seatEntry(seat, row));
    const assessedSeats = rowSeats.filter((seat) => seat.assessed);
    const limiting = limitingOf(assessedSeats);
    return {
      rowIndex: row.rowIndex,
      label: row.label,
      y: row.y,
      seats: rowSeats,
      seatCount: rowSeats.length,
      assessedCount: assessedSeats.length,
      angle: limiting?.angle ?? null,
      level: limiting?.level ?? null,
      limitingSeat: limiting,
      // The row's listening point IS its limiting seat's own depth and ear
      // height: the seat that decides the row's result is the point the row's
      // geometry is drawn from.
      listening: limiting ? { y: limiting.y, z: limiting.z } : null,
    };
  });

  const assessedSeats = rows.flatMap((row) => row.seats.filter((seat) => seat.assessed));
  const projectLimiting = limitingOf(assessedSeats);

  return {
    rows,
    hasAnyResult: assessedSeats.length > 0,
    projectResult: projectLimiting
      ? {
        seatId: projectLimiting.id,
        seatLabel: projectLimiting.label,
        rowLabel: projectLimiting.rowLabel,
        angle: projectLimiting.angle,
        level: projectLimiting.level,
      }
      : null,
  };
}