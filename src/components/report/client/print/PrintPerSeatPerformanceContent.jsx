/**
 * PrintPerSeatPerformanceContent
 * -----------------------------
 * The printed (PDF) page for the Per-Seat Performance section.
 *
 * Supplies the document heading — the section heading is printed once, in the
 * report's own heading role — and then the seat cards themselves, laid out in
 * the seating plan's shape exactly as they appear on screen.
 *
 * Rows break between seating rows in the PDF, so a card is never split across
 * two pages and the type is never squeezed to force everything onto one page.
 * A system with more rows than one page holds is split BETWEEN rows at the
 * report-page level, so each printed page carries whole seating rows.
 *
 * Props:
 *   rows — [{ rowIndex, label, seats: [...] }] from selectClientPerSeatPerformance
 *   rsp  — the canonical reference position, for a marker between rows
 */

import React from "react";
import ClientPerSeatPerformance from "@/components/report/client/ClientPerSeatPerformance";

export default function PrintPerSeatPerformanceContent({ rows, rsp }) {
  const seatRows = (Array.isArray(rows) ? rows : []).filter((row) => row?.seats?.length);
  if (seatRows.length === 0) return null;

  return (
    <>
      <div className="client-report-print-heading">
        <h1 className="client-report-print-heading__title">Per-Seat Performance</h1>
        <p className="client-report-print-heading__subtitle">
          RP22 and RP23 results by seating position
        </p>
      </div>
      <div className="client-report-print-support">
        <ClientPerSeatPerformance rows={seatRows} rsp={rsp} print />
      </div>
    </>
  );
}