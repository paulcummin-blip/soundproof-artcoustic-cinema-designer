// AdiSeatScopeP20Block.jsx
// ---------------------------------------------------------------------------
// ENGINEER DETAILS' P20 BY SEAT — the real scope behind the panel's figures.
//
// P20 is a seat-scoped result. Engineer details therefore never show one bare
// "Current P20": the per-seat values are grouped by their canonical scope —
// Primary seats, Secondary seats — with the limiting seat named on its own line.
//
// Presentation only: the groups arrive already resolved (optimiserP20SeatScope.js)
// from per-seat values the published authority and the saved plan already carry.
// Nothing is calculated, aggregated or re-graded here.
// ---------------------------------------------------------------------------

import React from "react";

const rowText = (row) => [
  `${row.label} — ${row.deviation}`,
  row.level ? ` · ${row.level}` : "",
].join("");

function Group({ title, rows }) {
  if (!rows.length) return null;
  return (
    <div className="mt-1">
      <div className="text-[10px] font-semibold tracking-wide text-[#8B7F76]">{title}</div>
      <div className="space-y-0.5 text-[11px] text-[#1B1A1A]">
        {rows.map((row) => <div key={row.seatId}>{rowText(row)}</div>)}
      </div>
    </div>
  );
}

export default function AdiSeatScopeP20Block({ groups = null, className = "" }) {
  if (!groups?.any) return null;
  return (
    <div
      className={`rounded-md border border-[#E7E5E0] bg-[#FAFAF9] p-2.5 ${className}`}
      data-adi-p20-seat-scope="true"
    >
      <div className="text-[10px] font-semibold tracking-wide text-[#3E4349]">
        P20 BY SEAT — PRIMARY AND SECONDARY
      </div>
      <div className="mt-0.5 text-[10px] text-[#8B7F76] leading-relaxed">
        Each seat&apos;s own P20 variation. One aggregate figure describes the worst seat, never
        every seat.
      </div>

      <Group title="Primary seats" rows={groups.primary} />
      <Group title="Secondary seats" rows={groups.secondary} />

      {groups.limiting && (
        <div className="mt-1.5 text-[11px] text-[#1B1A1A]">
          <span className="text-[#8B7F76]">Limiting seat: </span>
          {rowText(groups.limiting)}
        </div>
      )}
    </div>
  );
}