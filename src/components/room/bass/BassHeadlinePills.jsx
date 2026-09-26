// BassHeadlinePills — THE single shared P14/P18/P19/P20 headline presentation
// for both the Bass Simulation section and the Subwoofer / Parameter Results
// section. One visual implementation, one presentation authority.
//
// Layout: 4-column grid of titled cards, each with a standard RP22GradingPill
// and supporting value underneath. All four parameters split
// "L2 · 112 dBC" into pill label "L2" and supporting text "112 dBC".
// When stale, an "Out of date" badge appears beneath the pill.
//
// Publication-gated: only a canonically published completed result may be
// presented as an official RP22 result. During calculation with a published
// result, the last published values remain visible (greyed) — only the
// first-ever calculation (no published result) shows "Calculating…".
//
// Tooltip: BassResultDetailTooltip (same canonical authority for both surfaces).
import React, { useEffect, useState } from "react";
import RP22GradingPill from "@/components/ui/RP22GradingPill";
import BassResultDetailTooltip from "@/components/room/bass/BassResultDetailTooltip";
import { formatOfficialBassResults } from "@/components/room/bass/bassResultsPresentation";
import { useSharedBassResults } from "@/components/room/bass/bassResultsStore";
import { resolveP14TargetSelectionState } from "@/components/room/bass/p14TargetSelectionState";
import { useGraphInteraction, setGraphInteraction } from "@/components/room/bass/bda/graphInteractionStore";

const CARD_TITLES = {
  p14: "P14 Bass SPL",
  p18: "P18 Extension",
  p19: "P19 Response Fit",
  p20: "P20 Seat Consistency",
};

// Split "L2 · 112 dBC" into pill label "L2" and supporting text "112 dBC".
// Non-ready states ("Calculating…", "FAIL", "Select Bass Target")
// have no " · " separator — shown in the pill as-is with no supporting text.
function splitPillContent(resultText) {
  const text = String(resultText || "");
  const sepIndex = text.indexOf(" · ");
  if (sepIndex === -1) return { pillLabel: text, supportingText: null };
  return {
    pillLabel: text.slice(0, sepIndex),
    supportingText: text.slice(sepIndex + 3),
  };
}

/**
 * Shared P14/P18/P19/P20 headline pills grid.
 * @param {object} opts
 * @param {number} [opts.nowMs] — optional clock for elapsed-time text
 */
export default function BassHeadlinePills({ nowMs }) {
  const shared = useSharedBassResults();
  const interaction = useGraphInteraction();
  const activeMetric = interaction?.selectedMetric || null;
  const [clock, setClock] = useState(Date.now());
  const active = nowMs == null && (shared.calculationInProgress || shared.bassLifecycleState === "stale_needs_recalculation");
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active, shared.lifecycle?.startedAtMs, shared.lifecycle?.queuedAtMs]);

  const p14Selection = resolveP14TargetSelectionState(shared.authoritative?.requested);
  const formatted = formatOfficialBassResults(
    shared.completedBassAuthority,
    shared.lifecycle,
    shared.seatingPositions,
    nowMs ?? clock,
    p14Selection.noP14TargetSelected,
    {
      p14TargetBasis: shared.authoritative?.requested?.p14TargetBasis,
      p18TargetBasis: shared.authoritative?.requested?.p18TargetBasis,
    },
    shared.p19SeatAuthority,
    shared.bassLifecycleState,
  );

  return (
    <div className={`grid grid-cols-2 gap-2 sm:grid-cols-4 transition-opacity duration-300 ${formatted.isCalculatingWithPublishedResult ? "opacity-80" : ""}`}>
      {Object.entries(formatted.pills).map(([key, pill]) => {
        const { pillLabel, supportingText } = splitPillContent(pill.resultText);
        const isActive = activeMetric === key;
        return (
          <div
            key={key}
            onClick={() => setGraphInteraction({ selectedMetric: isActive ? null : key })}
            className={`flex flex-col items-center gap-1 rounded-lg border p-3 cursor-pointer transition-all duration-150 hover:shadow-md ${
              isActive
                ? "border-[#213428] bg-[#F8F8F7] shadow-md ring-1 ring-[#213428]"
                : "border-[#DCDBD6] bg-white"
            }`}
            aria-label={pill.text}
            title={`Click to focus the graph on ${CARD_TITLES[key] || key}`}
          >
            <span className="text-[11px] font-semibold text-[#213428]">
              {CARD_TITLES[key] || pill.label}
            </span>
            <BassResultDetailTooltip parameterKey={key}>
              <RP22GradingPill level={pill.level}>{pillLabel}</RP22GradingPill>
            </BassResultDetailTooltip>
            {supportingText
              ? <div className="text-center text-[10px] text-[#625143]">{supportingText}</div>
              : null}
            {pill.stale && (
              <div className="text-[9px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">Out of date</div>
            )}
          </div>
        );
      })}
    </div>
  );
}