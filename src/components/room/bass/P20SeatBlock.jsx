import React, { useState } from "react";
import RP22GradingPill from "@/components/ui/RP22GradingPill";
import { formatSeatLabel } from "@/components/utils/seatLabel";
import { buildP20SeatRows, p20WorstSeat } from "./p20SeatPresentation";
import { SECONDARY } from "@/components/utils/seatPriorityAuthority";

const priorityLabel = (priority) => priority === SECONDARY ? "Secondary" : "Primary";

const detailText = (seat) => [
  formatSeatLabel(seat.seatId),
  `${priorityLabel(seat.priority)}`,
  `Deviation: ${seat.displayVariationDb || "—"}`,
  `Worst frequency: ${Number.isFinite(seat.worstFrequencyHz) ? `${Math.round(seat.worstFrequencyHz)} Hz` : "—"}`,
  `Comparison points: ${Number.isFinite(seat.comparisonPointCount) ? seat.comparisonPointCount : "—"}`,
].join("\n");

/**
 * P20 per-seat expanded view — shows all seats with identity, Primary/Secondary
 * distinction, P20 level, and P20 variance.
 *
 * Publication-gated: when publicationVerified is false, shows a consistent
 * "NOT VERIFIED" / "Calculating…" state instead of per-seat L-level pills.
 */
export default function P20SeatBlock({ seatingPositions = [], perSeatP20Results = [], rows: providedRows = null, publicationVerified = true, authorityStatus = null, p14TargetUnselected = false, compact = false }) {
  const rows = providedRows || buildP20SeatRows(seatingPositions, perSeatP20Results);
  const allSeats = rows.flatMap((row) => row.seats);
  const [selectedSeatId, setSelectedSeatId] = useState(null);

  if (!publicationVerified || allSeats.length === 0) {
    const stateText = p14TargetUnselected
      ? "Select Bass Target"
      : authorityStatus === "LIMITED" ? "FAIL"
      : authorityStatus === "NOT_VERIFIED" ? "NOT VERIFIED" : "Calculating…";
    return (
      <div className="rounded-md border border-[#DCDBD6] bg-[#F8F8F7] px-3 py-2 text-[11px] text-[#625143]" aria-label="P20 per-seat levels">
        {stateText}
      </div>
    );
  }

  const worst = p20WorstSeat(rows);
  const selected = allSeats.find((seat) => seat.seatId === selectedSeatId) || null;
  return <div className="grid gap-1.5" aria-label="P20 per-seat levels">
    {rows.map((row) => <div key={row.row} className="grid grid-flow-col auto-cols-min justify-end gap-1.5" data-p20-row={row.row}>
      {row.seats.map((seat) => <button
        type="button"
        key={seat.seatId}
        title={detailText(seat)}
        aria-label={`${formatSeatLabel(seat.seatId)} P20 ${seat.level} ${priorityLabel(seat.priority)}`}
        onClick={() => setSelectedSeatId((current) => current === seat.seatId ? null : seat.seatId)}
        className="rounded-md bg-transparent p-0.5"
        style={{ boxShadow: worst?.seatId === seat.seatId ? "0 0 0 2px rgba(33,52,40,0.10)" : "none" }}
      >
        <RP22GradingPill level={seat.level} compact={compact}>{seat.level}</RP22GradingPill>
      </button>)}
    </div>)}
    {selected && <div className="rounded border border-[#E6E4DD] bg-[#F8F8F7] px-2 py-1 text-[10px] leading-4 text-[#3E4349] whitespace-pre-line">{detailText(selected)}</div>}
  </div>;
}