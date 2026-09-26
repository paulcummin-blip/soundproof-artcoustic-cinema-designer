// P20SeatStrip.jsx
// ---------------------------------------------------------------------------
// P20 individual seat-consistency results, placed directly below the
// four-parameter Bass Performance Strip.
//
// This links the "P20 SEAT" headline to the individual seat grades that
// constitute it — they are ONE result presentation and must sit together.
//
// Shows seat identity (R#S#) next to each grade pill so the designer can
// immediately see which physical seat each grade belongs to.
//
// PRESENTATION ONLY. Consumes the same canonical authority as PerSeatResults.
// Does not change P20 maths, grading, seat authority, ordering, aggregation,
// calculation, caching, or publication.
// ---------------------------------------------------------------------------

import React, { useEffect, useState } from "react";
import { formatOfficialBassResults } from "@/components/room/bass/bassResultsPresentation";
import { useSharedBassResults } from "@/components/room/bass/bassResultsStore";
import { resolveP14TargetSelectionState } from "@/components/room/bass/p14TargetSelectionState";
import SharedP19P20SeatResults from "@/components/room/bass/SharedP19P20SeatResults";

export default function P20SeatStrip() {
  const shared = useSharedBassResults();
  const [nowMs, setNowMs] = useState(Date.now());
  const active = shared.calculationInProgress || shared.bassLifecycleState === "stale_needs_recalculation";

  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active, shared.lifecycle?.startedAtMs, shared.lifecycle?.queuedAtMs]);

  const p14Selection = resolveP14TargetSelectionState(shared.authoritative?.requested);
  const formatted = formatOfficialBassResults(
    shared.completedBassAuthority,
    shared.lifecycle,
    shared.seatingPositions,
    nowMs,
    p14Selection.noP14TargetSelected,
    {
      p14TargetBasis: shared.authoritative?.requested?.p14TargetBasis,
      p18TargetBasis: shared.authoritative?.requested?.p18TargetBasis,
    },
    shared.p19SeatAuthority,
    shared.bassLifecycleState,
  );

  const isStale = shared.bassLifecycleState === "stale_needs_recalculation";
  const isPlacementPreview = shared.placementPreviewActive === true;
  const hasSeats = (formatted.p20Rows || []).some((row) => row.seats.length > 0);

  if (!hasSeats && !isStale) return null;

  return (
    <div className={`space-y-1 ${isPlacementPreview ? "opacity-45" : ""}`}>
      <SharedP19P20SeatResults
        p20Rows={formatted.p20Rows}
        publicationVerified={formatted.publicationVerified}
        authorityStatus={shared.completedBassAuthority?.authorityStatus}
        p14TargetUnselected={p14Selection.noP14TargetSelected}
      />
      <div className="flex items-center gap-2 text-[10px] font-medium text-[#625143]" aria-live="polite">
        {isStale && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-[#F5F0E6] text-[#8A6D3B] border border-[#E0D5C0]">
            Out of Date
          </span>
        )}
        {shared.bassLifecycleState === "failed" && shared.onRetry
          ? <button type="button" onClick={shared.onRetry} className="font-semibold text-red-700 underline">{formatted.statusText}</button>
          : <span>{formatted.statusText}</span>}
      </div>
    </div>
  );
}