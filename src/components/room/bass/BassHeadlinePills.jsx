// BassHeadlinePills — THE single shared P14/P18/P19/P20 headline presentation
// for both the Bass Simulation section and the Subwoofer / Parameter Results
// section. One visual implementation, one presentation authority.
//
// Layout: 4-column grid of titled cards, each with a standard RP22GradingPill
// and supporting value underneath. P19/P20 are SEAT-scoped (pill shows "SEAT",
// no supporting text). P14/P18 split "L2 · 112 dBC" into pill label "L2" and
// supporting text "112 dBC".
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

const CARD_TITLES = {
  p14: "P14 Bass SPL",
  p18: "P18 Extension",
  p19: "P19 Response Fit",
  p20: "P20 Seat Consistency",
};

const SEAT_SCOPED_KEYS = new Set(["p19", "p20"]);

// Split "L2 · 112 dBC" into pill label "L2" and supporting text "112 dBC".
// Non-ready states ("Calculating…", "FAIL", "SEAT", "Select Bass Target")
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
        const isSeatScoped = SEAT_SCOPED_KEYS.has(key);
        const { pillLabel, supportingText } = isSeatScoped
          ? { pillLabel: pill.resultText, supportingText: null }
          : splitPillContent(pill.resultText);
        return (
          <div
            key={key}
            className="flex flex-col items-center gap-1 rounded-lg border border-[#DCDBD6] bg-white p-3"
            aria-label={pill.text}
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
          </div>
        );
      })}
    </div>
  );
}