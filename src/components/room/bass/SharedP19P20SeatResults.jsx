// SharedP20SeatResults — P20 per-seat presentation.
//
// Design authority: the compact Bass Simulation version (P20SeatBlock).
// One shared visual treatment rendered in:
//   - Bass Simulation section (BassResultCards)
//   - Subwoofers permanent result area (BassPermanentSeatResults)
//   - Applied Recommended Layout card (AppliedLayoutPills, compact)
//
// P19 is RSP-only — there are no per-seat P19 results to display.
// This component shows P20 per-seat results only.
//
// Rules preserved:
//   - P20 headline shows the project level + deviation (in the headline pills)
//   - Actual seats displayed underneath, following real rows and left/right
//     ordering
//   - Primary seats distinguished by dark border, Secondary by light border
//   - No Primary/Secondary text
//   - Uses actual canonical per-seat values (level pills from p20Rows)
//
// PRESENTATION ONLY. Does not trigger or change any calculation.

import React from "react";
import RP22GradingPill from "@/components/ui/RP22GradingPill";
import BassResultDetailTooltip from "@/components/room/bass/BassResultDetailTooltip";
import { PRIMARY } from "@/components/utils/seatPriorityAuthority";
import { formatCoverageSummaryFromRows } from "@/components/utils/seatCoverageSummary";
import { useGraphInteraction, setGraphInteraction, clearGraphInteraction } from "@/components/room/bass/bda/graphInteractionStore";

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

function SeatPill({ seat, compact, paramKey, isSelected, onSelect }) {
  const isPrimary = seat.priority === PRIMARY;
  const borderColour = isSelected ? "#213428" : (isPrimary ? PRIMARY_BORDER : SECONDARY_BORDER);
  const borderWidth = isSelected ? "3px" : (isPrimary ? "2px" : "1px");
  return (
    <BassResultDetailTooltip parameterKey={paramKey} seatData={seat}>
      <div
        onClick={onSelect}
        style={{
          border: `${borderWidth} solid ${borderColour}`,
          borderRadius: 6,
          padding: 2,
          background: isSelected ? "#F0EDE7" : "#FFFFFF",
          display: "inline-flex",
          cursor: "pointer",
          transition: "border-color 0.15s, background 0.15s",
        }}
      >
        <RP22GradingPill level={seat.level} compact={compact}>{seat.level}</RP22GradingPill>
      </div>
    </BassResultDetailTooltip>
  );
}

function SeatGrid({ rows, compact, paramKey, selectedSeatId, onSelectSeat }) {
  return (
    <div className="grid gap-1.5">
      {rows.map((row) => (
        <div key={row.row} className="flex flex-wrap justify-center gap-1.5">
          {row.seats.map((seat) => (
            <SeatPill
              key={seat.seatId}
              seat={seat}
              compact={compact}
              paramKey={paramKey}
              isSelected={selectedSeatId === seat.seatId}
              onSelect={() => onSelectSeat(seat.seatId)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function Panel({ title, paramKey, rows, publicationVerified, stateText, compact, authoritativeSummary = null, selectedSeatId, onSelectSeat }) {
  const showSeats = publicationVerified && rows.length > 0;
  return (
    <div className={`rounded-lg border border-[#DCDBD6] bg-white ${compact ? "p-2" : "p-3"}`}>
      <div className={`mb-1 font-semibold text-[#213428] ${compact ? "text-[10px]" : "text-[11px]"}`}>{title}</div>
      {showSeats ? (
        <>
          {!compact && (
            <div className="mb-1.5 text-[10px] font-medium text-[#625143]">{authoritativeSummary || formatCoverageSummaryFromRows(rows)}</div>
          )}
          <SeatGrid rows={rows} compact={compact} paramKey={paramKey} selectedSeatId={selectedSeatId} onSelectSeat={onSelectSeat} />
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
  p20Rows = [],
  publicationVerified = false,
  authorityStatus = null,
  p14TargetUnselected = false,
  compact = false,
}) {
  const interaction = useGraphInteraction();
  const stateText = stateTextFor(authorityStatus, publicationVerified, p14TargetUnselected);

  const handleSeatSelect = (paramKey) => (seatId) => {
    if (interaction.selectedSeatId === seatId && interaction.selectedMetric === paramKey) {
      clearGraphInteraction();
    } else {
      setGraphInteraction({ selectedSeatId: seatId, selectedMetric: paramKey });
    }
  };

  return (
    <div className="grid gap-2 grid-cols-1" aria-label="P20 per-seat results">
      <Panel
        title="P20 — All Seats"
        paramKey="p20"
        rows={p20Rows}
        publicationVerified={publicationVerified}
        stateText={stateText}
        compact={compact}
        selectedSeatId={interaction.selectedSeatId}
        onSelectSeat={handleSeatSelect("p20")}
      />
    </div>
  );
}