import React, { useState } from "react";
import RP22GradingPill from "@/components/ui/RP22GradingPill";
import { formatSeatLabel } from "@/components/utils/seatLabel";
import { buildP20SeatRows, p20WorstSeat } from "./p20SeatPresentation";

const detailText = (seat) => [
  formatSeatLabel(seat.seatId),
  `Raw variation: ${Number.isFinite(seat.variationDbRaw) ? `±${Math.abs(seat.variationDbRaw).toFixed(2)} dB` : "—"}`,
  `Displayed variation: ${seat.displayVariationDb}`,
  `Worst frequency: ${Number.isFinite(seat.worstFrequencyHz) ? `${seat.worstFrequencyHz.toFixed(2)} Hz` : "—"}`,
  `Comparison points: ${Number.isFinite(seat.comparisonPointCount) ? seat.comparisonPointCount : "—"}`,
].join("\n");

export default function P20SeatBlock({ seatingPositions = [], perSeatP20Results = [], rows: providedRows = null, compact = false }) {
  const rows = providedRows || buildP20SeatRows(seatingPositions, perSeatP20Results);
  const worst = p20WorstSeat(rows);
  const [selectedSeatId, setSelectedSeatId] = useState(null);
  const selected = rows.flatMap((row) => row.seats).find((seat) => seat.seatId === selectedSeatId) || null;
  return <div className="grid gap-1.5" aria-label="P20 per-seat levels">
    {rows.map((row) => <div key={row.row} className="grid grid-flow-col auto-cols-min justify-end gap-1.5" data-p20-row={row.row}>
      {row.seats.map((seat) => <button
        type="button"
        key={seat.seatId}
        title={detailText(seat)}
        aria-label={`${formatSeatLabel(seat.seatId)} P20 ${seat.level}`}
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