// BassPermanentSeatResults — permanently-visible P19/P20 per-seat results.
//
// P19 and P20 are seat-scoped RP22 parameters. The headline pills show "SEAT"
// (in BassPermanentPills). This component renders the individual seat results
// directly beneath, permanently — no click, accordion, or modal required.
//
// States:
//   - No P14 target selected:  "Select Bass Target"
//   - Calculating:              "Calculating…" (never mixes partial/stale results)
//   - Stale (design changed):   "NEEDS RECALCULATION"
//   - P14 failed / LIMITED:      "Not evaluated at requested operating point"
//   - Authoritative result:     all seat grades with dB values
//   - Never calculated:         "NOT CALCULATED"
//
// Presentation-only. Uses existing canonical seat-level results
// (buildP19SeatRows / buildP20SeatRows via formatOfficialBassResults).
// Does NOT change P19/P20 calculations, grading, or authority logic.

import React, { useMemo } from "react";
import RP22GradingPill from "@/components/ui/RP22GradingPill";
import { useSharedBassResults } from "@/components/room/bass/bassResultsStore";
import { formatOfficialBassResults } from "@/components/room/bass/bassResultsPresentation";
import { resolveP14TargetSelectionState } from "@/components/room/bass/p14TargetSelectionState";
import { formatSeatLabel } from "@/components/utils/seatLabel";
import { PRIMARY, SECONDARY } from "@/components/utils/seatPriorityAuthority";

function priorityTag(priority) {
  if (priority === SECONDARY) return " · Secondary";
  if (priority === PRIMARY) return " · Primary";
  return "";
}

function seatRowLabel(seat) {
  return `${formatSeatLabel(seat.seatId)}${priorityTag(seat.priority)}`;
}

function SeatResultRow({ seat }) {
  const hasValue = seat.level !== "—" && seat.displayVariationDb && seat.displayVariationDb !== "—";
  return (
    <div className="flex items-center justify-between gap-2 rounded-sm px-1.5 py-1 hover:bg-[#F7F4F0]/60">
      <span className="text-[11px] text-[#3E4349] truncate">{seatRowLabel(seat)}</span>
      <span className="flex items-center gap-1.5 shrink-0">
        <RP22GradingPill level={seat.level} compact>{seat.level}</RP22GradingPill>
        {hasValue && (
          <span className="text-[10px] text-[#625143] tabular-nums">{seat.displayVariationDb}</span>
        )}
      </span>
    </div>
  );
}

function SeatList({ rows }) {
  const seats = rows.flatMap((row) => row.seats);
  return (
    <div className="grid gap-0.5">
      {rows.map((row) => (
        <div key={row.row} className="grid gap-0.5">
          {row.seats.map((seat) => (
            <SeatResultRow key={seat.seatId} seat={seat} />
          ))}
        </div>
      ))}
      {seats.length === 0 && (
        <div className="px-1.5 py-1 text-[11px] text-[#8A7B6A]">No seats in layout.</div>
      )}
    </div>
  );
}

function StateMessage({ text }) {
  return (
    <div className="rounded-md border border-[#DCDBD6] bg-[#F8F8F7] px-3 py-2 text-[11px] text-[#625143]">
      {text}
    </div>
  );
}

function ParamSection({ label, sublabel, rows, stateText }) {
  return (
    <div className="rounded-lg border border-[#E7E4DF] bg-white/60 px-3 py-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-semibold text-[#213428]">{label}</span>
        <span className="text-[10px] text-[#8A7B6A]">{sublabel}</span>
      </div>
      {stateText ? <StateMessage text={stateText} /> : <SeatList rows={rows} />}
    </div>
  );
}

export default function BassPermanentSeatResults() {
  const shared = useSharedBassResults();
  const authorityStatus = shared?.completedBassAuthority?.authorityStatus || "UNCALCULATED";
  const isCalculating = shared?.calculationInProgress === true;
  const hasResult = shared?.hasCurrentResult === true;
  const isStale = authorityStatus === "STALE";
  const p14Selection = resolveP14TargetSelectionState(shared?.authoritative?.requested);
  const noP14TargetSelected = p14Selection.noP14TargetSelected;

  const formatted = useMemo(() => {
    if (noP14TargetSelected || isCalculating || isStale || !hasResult) return null;
    return formatOfficialBassResults(
      shared.completedBassAuthority,
      shared.lifecycle,
      shared.seatingPositions,
      Date.now(),
      noP14TargetSelected,
      {
        p14TargetBasis: shared.authoritative?.requested?.p14TargetBasis,
        p18TargetBasis: shared.authoritative?.requested?.p18TargetBasis,
      },
    );
  }, [
    shared.completedBassAuthority,
    shared.lifecycle,
    shared.seatingPositions,
    hasResult,
    isStale,
    isCalculating,
    noP14TargetSelected,
  ]);

  const p19Rows = formatted?.p19Rows || [];
  const p20Rows = formatted?.p20Rows || [];
  const p19SeatCount = p19Rows.flatMap((r) => r.seats).length;
  const p20SeatCount = p20Rows.flatMap((r) => r.seats).length;
  const publicationVerified = formatted?.publicationVerified === true;
  const isLimited = formatted?.isLimited === true;

  // Determine the display state for seat rows.
  let stateText = null;
  if (noP14TargetSelected) {
    stateText = "Select Bass Target";
  } else if (isCalculating) {
    stateText = "Calculating…";
  } else if (isStale) {
    stateText = "NEEDS RECALCULATION";
  } else if (hasResult && publicationVerified && p19SeatCount === 0) {
    // Authoritative but no seat rows → P14 failed or LIMITED.
    stateText = isLimited ? "Not evaluated — P14 target unattainable" : "Not evaluated at requested operating point";
  } else if (!hasResult) {
    stateText = "NOT CALCULATED";
  }

  const showSeatResults = publicationVerified && p19SeatCount > 0 && !stateText;

  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2" aria-label="P19 and P20 per-seat results">
      <ParamSection
        label="P19 — Response Fit"
        sublabel="Per seat"
        rows={p19Rows}
        stateText={showSeatResults ? null : stateText}
      />
      <ParamSection
        label="P20 — Seat Consistency"
        sublabel="Per seat"
        rows={p20Rows}
        stateText={showSeatResults ? null : stateText}
      />
    </div>
  );
}