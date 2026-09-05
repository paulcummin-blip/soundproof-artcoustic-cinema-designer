// AppliedLayoutPills — compact P14/P18/P19/P20 pills shown ONLY on the
// applied recommendation card when a valid, non-stale authoritative result
// exists in the canonical cache.
//
// Rules (per simplification task):
//   - Never show fake/preview grades.
//   - Never show "NOT CALCULATED" or "Select Bass Target" placeholders.
//   - Never show stale results from a different geometry/model/target.
//   - If no matching authoritative result exists, render nothing.
//
// This is presentation-only. It does NOT trigger any calculation.

import React from "react";
import RP22GradingPill from "@/components/ui/RP22GradingPill";
import { useSharedBassResults } from "@/components/room/bass/bassResultsStore";
import { formatOfficialBassResults } from "@/components/room/bass/bassResultsPresentation";
import { resolveP14TargetSelectionState } from "@/components/room/bass/p14TargetSelectionState";

const PARAM_KEYS = ["p14", "p18", "p19", "p20"];

export default function AppliedLayoutPills() {
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
    shared.seatingPositions,
    Date.now(),
    noP14TargetSelected,
    {
      p14TargetBasis: shared.authoritative?.requested?.p14TargetBasis,
      p18TargetBasis: shared.authoritative?.requested?.p18TargetBasis,
    },
  );
  const pills = formatted?.pills || {};

  return (
    <div className="grid grid-cols-4 gap-1" aria-label="Applied layout authoritative results">
      {PARAM_KEYS.map((key) => {
        const pill = pills[key] || { resultText: "—", level: "—" };
        return (
          <div key={key} className="flex flex-col items-center gap-0.5">
            <span className="text-[9px] font-semibold text-[#213428]">{key.toUpperCase()}</span>
            <RP22GradingPill level={pill.level} compact style={{ width: "100%" }}>
              {pill.resultText}
            </RP22GradingPill>
          </div>
        );
      })}
    </div>
  );
}