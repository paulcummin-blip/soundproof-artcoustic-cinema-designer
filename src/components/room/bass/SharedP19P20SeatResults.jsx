// SharedP19P20SeatResults — unified P19/P20 per-seat presentation.
//
// Design authority: the compact Bass Simulation version (P19SeatBlock /
// P20SeatBlock). One shared visual treatment rendered in:
//   - Bass Simulation section (BassResultCards)
//   - Subwoofers permanent result area (BassPermanentSeatResults)
//   - Applied Recommended Layout card (AppliedLayoutPills, compact)
//
// Rules preserved:
//   - P19 headline = SEAT, P20 headline = SEAT (handled by the pill strip
//     above this component in the recommendation card; here we show per-seat)
//   - Actual seats displayed underneath, following real rows and left/right
//     ordering
//   - Primary seats distinguished by dark border, Secondary by light border
//   - No Primary/Secondary text
//   - Uses actual canonical per-seat values (level pills from p19Rows/p20Rows)
//
// PRESENTATION ONLY. Does not trigger or change any calculation.

import React from "react";
import RP22GradingPill from "@/components/ui/RP22GradingPill";
import { PRIMARY } from "@/components/utils/seatPriorityAuthority";
import { formatCoverageSummaryFromRows } from "@/components/utils/seatCoverageSummary";

const PRIMARY_BORDER = "#1B1A1A";
const SECONDARY_BORDER = "#C1B6AD";

function stateTextFor(authorityStatus, publicationVerified, p14TargetUnselected) {
  if (p14TargetUnselected) return "Select Bass Target";
  if (authorityStatus === "LIMITED") return "FAIL";
  if (authorityStatus === "NOT_VERIFIED") return "NOT VERIFIED";
  if (authorityStatus === "STALE") return "Needs recalculation";
  if (authorityStatus === "UNCALCULATED") return "NOT CALCULATED";
  if (!publicationVerified) return "Calculating…";
  return "—";
}

function SeatPill({ seat, compact }) {
  const isPrimary = seat.priority === PRIMARY;
  const borderColour = isPrimary ? PRIMARY_BORDER : SECONDARY_BORDER;
  const borderWidth = isPrimary ? "2px" : "1px";
  return (
    <div
      style={{
        border: `${borderWidth} solid ${borderColour}`,
        borderRadius: 6,
        padding: 2,
        background: "#FFFFFF",
        display: "inline-flex",
      }}
    >
      <RP22GradingPill level={seat.level} compact={compact}>{seat.level}</RP22GradingPill>
    </div>
  );
}

function SeatGrid({ rows, compact }) {
  return (
    <div className="grid gap-1.5">
      {rows.map((row) => (
        <div key={row.row} className="flex flex-wrap justify-center gap-1.5">
          {row.seats.map((seat) => (
            <SeatPill key={seat.seatId} seat={seat} compact={compact} />
          ))}
        </div>
      ))}
    </div>
  );
}

function Panel({ title, rows, publicationVerified, stateText, compact }) {
  const showSeats = publicationVerified && rows.length > 0;
  return (
    <div className={`rounded-lg border border-[#DCDBD6] bg-white ${compact ? "p-2" : "p-3"}`}>
      <div className={`mb-1 font-semibold text-[#213428] ${compact ? "text-[10px]" : "text-[11px]"}`}>{title}</div>
      {showSeats ? (
        <>
          {!compact && (
            <div className="mb-1.5 text-[10px] font-medium text-[#625143]">{formatCoverageSummaryFromRows(rows)}</div>
          )}
          <SeatGrid rows={rows} compact={compact} />
        </>
      ) : (
        <div className="rounded-md border border-[#DCDBD6] bg-[#F8F8F7] px-3 py-2 text-[11px] text-[#625143]">
          {stateText}
        </div>
      )}
    </div>
  );
}

export default function SharedP19P20SeatResults({
  p19Rows = [],
  p20Rows = [],
  publicationVerified = false,
  authorityStatus = null,
  p14TargetUnselected = false,
  compact = false,
}) {
  const stateText = stateTextFor(authorityStatus, publicationVerified, p14TargetUnselected);
  const gridClass = compact ? "grid gap-2 grid-cols-1" : "grid gap-2 grid-cols-1 sm:grid-cols-2";

  return (
    <div className={gridClass} aria-label="P19 and P20 per-seat results">
      <Panel
        title="P19 — All Seats"
        rows={p19Rows}
        publicationVerified={publicationVerified}
        stateText={stateText}
        compact={compact}
      />
      <Panel
        title="P20 — All Seats"
        rows={p20Rows}
        publicationVerified={publicationVerified}
        stateText={stateText}
        compact={compact}
      />
    </div>
  );
}