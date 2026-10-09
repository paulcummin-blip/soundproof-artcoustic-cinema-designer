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
import useSharedBassAuthorityState from "@/components/room/bass/useSharedBassAuthorityState";
import BassStateBadge from "@/components/room/bass/BassStateBadge";
import { resolveP14TargetSelectionState } from "@/components/room/bass/p14TargetSelectionState";
import SharedP19P20SeatResults from "@/components/room/bass/SharedP19P20SeatResults";
import { useEffectiveBassLifecycleState } from "@/components/room/bass/bda/useEffectiveBassLifecycle";

export default function P20SeatStrip() {
  const { shared, authorityState } = useSharedBassAuthorityState();
  const [nowMs, setNowMs] = useState(Date.now());
  const active = shared.calculationInProgress || shared.bassLifecycleState === "stale_needs_recalculation";

  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active, shared.lifecycle?.startedAtMs, shared.lifecycle?.queuedAtMs]);

  const p14Selection = resolveP14TargetSelectionState(shared.authoritative?.requested);
  // ── Global restore display override ──────────────────────────────────
  // Subscribe to restoreStateStore so P20 sees RESTORING on the same
  // synchronous tick as the restore click — before shared.bassLifecycleState
  // catches up. Suppresses "Performance is current" during the restore window.
  const effectiveLifecycle = useEffectiveBassLifecycleState(
    shared.scopeId, shared.versionId, shared.bassLifecycleState,
  );
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
    effectiveLifecycle,
  );

  const isStale = effectiveLifecycle === "stale_needs_recalculation";
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
        <BassStateBadge state={authorityState} />
        {effectiveLifecycle === "failed" && shared.onRetry
          ? <button type="button" onClick={shared.onRetry} className="font-semibold text-red-700 underline">{formatted.statusText}</button>
          : null}
      </div>
    </div>
  );
}