// AppliedLayoutPills — P14/P18/P19/P20 result strip + shared per-seat P19/P20
// map, shown ONLY on the applied recommendation card when a valid, non-stale,
// publication-verified authoritative result exists in the canonical cache.
//
// Rules:
//   - P19 and P20 headline pills always say "SEAT" (seat-scoped parameters).
//   - Per-seat P19/P20 results use the shared SharedP19P20SeatResults component
//     (same visual treatment as Bass Simulation and Subwoofers permanent area).
//   - Never show fake/preview/stale grades.
//   - If no matching authoritative result exists, render nothing.
//
// This is presentation-only. It does NOT trigger any calculation.

import React from "react";
import RP22GradingPill from "@/components/ui/RP22GradingPill";
import { useSharedBassResults } from "@/components/room/bass/bassResultsStore";
import { formatOfficialBassResults } from "@/components/room/bass/bassResultsPresentation";
import { resolveP14TargetSelectionState } from "@/components/room/bass/p14TargetSelectionState";
import SharedP19P20SeatResults from "@/components/room/bass/SharedP19P20SeatResults";

const PARAM_KEYS = ["p14", "p18", "p19", "p20"];
const PARAM_LABELS = { p14: "P14", p18: "P18", p19: "P19", p20: "P20" };

export default function AppliedLayoutPills({ seatingPositions = [] }) {
  const shared = useSharedBassResults();
  const authorityStatus = shared?.completedBassAuthority?.authorityStatus || "UNCALCULATED";
  const isCalculating = shared?.calculationInProgress === true;
  const hasResult = shared?.hasCurrentResult === true;
  const isStale = authorityStatus === "STALE";
  const p14Selection = resolveP14TargetSelectionState(shared?.authoritative?.requested);
  const noP14TargetSelected = p14Selection.noP14TargetSelected;

  // Only render when a real, current, non-stale authoritative result exists.
  if (!hasResult || isStale || isCalculating || noP14TargetSelected) return null;

  const formatted = formatOfficialBassResults(
    shared.completedBassAuthority,
    shared.lifecycle,
    seatingPositions,
    Date.now(),
    noP14TargetSelected,
    {
      p14TargetBasis: shared.authoritative?.requested?.p14TargetBasis,
      p18TargetBasis: shared.authoritative?.requested?.p18TargetBasis,
    },
  );

  // Publication-verified authoritative result required.
  if (!formatted.isReady) return null;

  const pills = formatted.pills || {};

  return (
    <div className="space-y-3" aria-label="Applied layout authoritative results">
      {/* Parameter pills — clean 4-column row (wraps to 2 on narrow widths) */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PARAM_KEYS.map((key) => {
          const pill = pills[key] || { resultText: "—", level: "—" };
          return (
            <div key={key} className="flex flex-col items-center gap-1">
              <span className="text-[10px] font-semibold text-[#213428]">{PARAM_LABELS[key]}</span>
              <RP22GradingPill level={pill.level} compact style={{ width: "100%", whiteSpace: "normal", minWidth: "0" }}>
                {pill.resultText}
              </RP22GradingPill>
            </div>
          );
        })}
      </div>

      {/* Per-seat P19/P20 results — shared component (compact for card fit) */}
      <SharedP19P20SeatResults
        p19Rows={formatted.p19Rows || []}
        p20Rows={formatted.p20Rows || []}
        publicationVerified={formatted.publicationVerified}
        authorityStatus={authorityStatus}
        p14TargetUnselected={noP14TargetSelected}
        compact
      />
    </div>
  );
}