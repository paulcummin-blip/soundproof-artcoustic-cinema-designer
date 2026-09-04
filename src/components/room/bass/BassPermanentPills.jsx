// BassPermanentPills — Always-visible P14/P18/P19/P20 pill strip.
//
// Unlike BassResultBlock (which only renders when a verified result exists),
// this component is permanently shown in the Subwoofers panel. It presents
// clear states:
//   - No subwoofer model:      neutral "—"
//   - No P14 target selected:  "Select Bass Target"
//   - Never calculated:        "NOT CALCULATED"
//   - Calculating:             "Calculating…"
//   - Result available:        normal authoritative pill (L1/L2/L3/L4/FAIL)
//   - Stale (design changed):  "NEEDS RECALCULATION"
//
// This is presentation-only. It does NOT change any P14/P18/P19/P20
// calculation, grading, or authority logic.

import React from "react";
import RP22GradingPill from "@/components/ui/RP22GradingPill";
import BassRp22ParameterTooltip from "@/components/room/bass/BassRp22ParameterTooltip";
import { useSharedBassResults } from "@/components/room/bass/bassResultsStore";
import { formatOfficialBassResults } from "@/components/room/bass/bassResultsPresentation";
import { resolveP14TargetSelectionState } from "@/components/room/bass/p14TargetSelectionState";
import { seatScopeHeadlinePill } from "@/components/utils/rp22ParameterPresentation";

const PARAM_KEYS = ["p14", "p18", "p19", "p20"];
const PARAM_LABELS = {
  p14: "P14 Bass SPL",
  p18: "P18 Extension",
  p19: "P19 Response Fit",
  p20: "P20 Seat Consistency",
};

function neutralPill(label, text) {
  return { label, resultText: text, level: "—", detail: null };
}

export default function BassPermanentPills({ compact = true }) {
  const shared = useSharedBassResults();
  const authorityStatus = shared?.completedBassAuthority?.authorityStatus || "UNCALCULATED";
  const isCalculating = shared?.calculationInProgress === true;
  const hasResult = shared?.hasCurrentResult === true;
  const isStale = authorityStatus === "STALE";
  const p14Selection = resolveP14TargetSelectionState(shared?.authoritative?.requested);
  const noP14TargetSelected = p14Selection.noP14TargetSelected;

  // Build pills based on state
  let pills;

  if (noP14TargetSelected) {
    pills = Object.fromEntries(
      PARAM_KEYS.map((key) => [
        key,
        key === "p19" || key === "p20"
          ? seatScopeHeadlinePill(PARAM_LABELS[key])
          : neutralPill(PARAM_LABELS[key], "Select Bass Target"),
      ]),
    );
  } else if (isCalculating) {
    pills = Object.fromEntries(
      PARAM_KEYS.map((key) => [key, neutralPill(PARAM_LABELS[key], "Calculating…")]),
    );
  } else if (hasResult && !isStale) {
    // Use the existing authoritative formatter for real pills
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
    pills = formatted.pills;
  } else if (isStale) {
    pills = Object.fromEntries(
      PARAM_KEYS.map((key) => [key, neutralPill(PARAM_LABELS[key], "NEEDS RECALCULATION")]),
    );
  } else {
    // Never calculated
    pills = Object.fromEntries(
      PARAM_KEYS.map((key) => [
        key,
        key === "p19" || key === "p20"
          ? seatScopeHeadlinePill(PARAM_LABELS[key])
          : neutralPill(PARAM_LABELS[key], "NOT CALCULATED"),
      ]),
    );
  }

  return (
    <div className="grid grid-cols-2 gap-1 sm:grid-cols-4" aria-label="Bass RP22 parameter status">
      {PARAM_KEYS.map((key) => {
        const pill = pills[key] || neutralPill(PARAM_LABELS[key], "—");
        return (
          <BassRp22ParameterTooltip key={key} parameterKey={key}>
            <span className="flex flex-col gap-1 cursor-help" aria-label={pill.text || pill.resultText}>
              <span className="text-center text-[11px] font-semibold text-[#213428] underline decoration-dotted underline-offset-2">
                {key.toUpperCase()}
              </span>
              <RP22GradingPill level={pill.level} compact={compact} style={{ width: "100%" }}>
                {pill.resultText}
              </RP22GradingPill>
            </span>
          </BassRp22ParameterTooltip>
        );
      })}
    </div>
  );
}