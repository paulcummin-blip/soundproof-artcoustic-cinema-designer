// BassPermanentSeatResults — permanently-visible P19/P20 per-seat results
// in the Subwoofers panel. Uses the shared SharedP19P20SeatResults component
// (same visual treatment as the Bass Simulation section).
//
// PRESENTATION ONLY. Does NOT change P19/P20 calculations, grading, seat
// priority logic, or acoustic authority. Uses existing canonical seat-level
// results (formatOfficialBassResults → p19Rows / p20Rows).

import React, { useMemo } from "react";
import { useSharedBassResults } from "@/components/room/bass/bassResultsStore";
import { formatOfficialBassResults } from "@/components/room/bass/bassResultsPresentation";
import { resolveP14TargetSelectionState } from "@/components/room/bass/p14TargetSelectionState";
import SharedP19P20SeatResults from "@/components/room/bass/SharedP19P20SeatResults";

const BODY_FONT = "'Didact Gothic', 'Century Gothic', sans-serif";

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

  return (
    <div
      className="mt-3"
      aria-label="P19 and P20 per-seat results"
      style={{
        borderRadius: 10,
        border: "1px solid #E7E4DF",
        background: "#F8F8F7",
        padding: "12px 14px 14px",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#213428", fontFamily: BODY_FONT, letterSpacing: "0.01em" }}>
          Seat Results
        </span>
        <span style={{ fontSize: 10, color: "#8A7B6A", fontFamily: BODY_FONT }}>
          P19 · P20
        </span>
      </div>

      <SharedP19P20SeatResults
        p19Rows={formatted?.p19Rows || []}
        p20Rows={formatted?.p20Rows || []}
        publicationVerified={formatted?.publicationVerified === true}
        authorityStatus={authorityStatus}
        p14TargetUnselected={noP14TargetSelected}
      />
    </div>
  );
}