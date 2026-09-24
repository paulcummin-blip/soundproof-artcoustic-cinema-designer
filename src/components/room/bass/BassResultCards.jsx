// Larger P14/P18/P19/P20 result cards for the Bass Simulation top section.
// Official results are publication-gated: only a canonically published
// completed result (canonicalMetricPublicationValid === true) may be
// presented as an official RP22 result. During calculation with a published
// result, the last published values remain visible (greyed) — only the
// first-ever calculation (no published result) shows "Calculating…".
// P19 and P20 are SEAT-scoped parameters: main pill always shows "SEAT" —
// no RSP/aggregate headline. Expanded seat grids below show all seats with
// Primary/Secondary distinction.
import React, { useEffect, useState } from "react";
import { formatOfficialBassResults } from "@/components/room/bass/bassResultsPresentation";
import { useSharedBassResults } from "@/components/room/bass/bassResultsStore";
import { resolveP14TargetSelectionState } from "@/components/room/bass/p14TargetSelectionState";
import SharedP19P20SeatResults from "@/components/room/bass/SharedP19P20SeatResults";
import BassHeadlinePills from "@/components/room/bass/BassHeadlinePills";

export default function BassResultCards() {
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

  return (
    <div className="space-y-2">
      {/* Shared P14/P18/P19/P20 headline pills — same component as Subwoofer section */}
      <BassHeadlinePills nowMs={nowMs} />

      {/* Expanded P19/P20 per-seat views — shared component */}
      <div className={`transition-opacity duration-300 ${formatted.isCalculatingWithPublishedResult ? "opacity-80" : ""}`}>
        <SharedP19P20SeatResults
          p19Rows={formatted.p19Rows}
          p20Rows={formatted.p20Rows}
          p19Summary={formatted.p19SeatAuthority?.project?.coverageSummary || null}
          publicationVerified={formatted.publicationVerified}
          authorityStatus={shared.completedBassAuthority?.authorityStatus}
          p14TargetUnselected={p14Selection.noP14TargetSelected}
        />
      </div>

      <div className="flex items-center gap-2 text-[10px] font-medium text-[#625143]" aria-live="polite">
        {shared.bassLifecycleState === "failed" && shared.onRetry
          ? <button type="button" onClick={shared.onRetry} className="font-semibold text-red-700 underline">{formatted.statusText}</button>
          : <span>{formatted.statusText}</span>}
      </div>
    </div>
  );
}