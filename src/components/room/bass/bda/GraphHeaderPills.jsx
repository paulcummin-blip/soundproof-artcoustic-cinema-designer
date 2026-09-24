// GraphHeaderPills — compact RP22 summary strip integrated with the graph
// header. Replaces the separate 4-column BassHeadlinePills panel.
//
// P14 / P18 / P19 / P20 are presented as a single horizontal row of
// clickable pills. Clicking a pill selects that RP22 parameter in the
// graph interaction store, which drives the graph to highlight the
// limiting frequency and responsible response deviation.
//
// The pills are the graph summary. They read from the same canonical
// bass results authority as every other surface — one engineering truth.
//
// Publication-gated: only a canonically published completed result may be
// presented as an official RP22 result. While calculating/updating, pills
// show "Calculating…" — never preliminary live values.
import React, { useEffect, useState } from "react";
import RP22GradingPill from "@/components/ui/RP22GradingPill";
import BassResultDetailTooltip from "@/components/room/bass/BassResultDetailTooltip";
import { formatOfficialBassResults } from "@/components/room/bass/bassResultsPresentation";
import { useSharedBassResults } from "@/components/room/bass/bassResultsStore";
import { resolveP14TargetSelectionState } from "@/components/room/bass/p14TargetSelectionState";
import { useGraphInteraction, setGraphInteraction, clearGraphInteraction } from "@/components/room/bass/bda/graphInteractionStore";

const PARAM_KEYS = ["p14", "p18", "p19", "p20"];
const PARAM_LABELS = { p14: "P14", p18: "P18", p19: "P19", p20: "P20" };
const SEAT_SCOPED = new Set(["p19", "p20"]);

function splitPillContent(resultText) {
  const text = String(resultText || "");
  const sepIndex = text.indexOf(" · ");
  if (sepIndex === -1) return { pillLabel: text, supportingText: null };
  return {
    pillLabel: text.slice(0, sepIndex),
    supportingText: text.slice(sepIndex + 3),
  };
}

export default function GraphHeaderPills() {
  const shared = useSharedBassResults();
  const interaction = useGraphInteraction();
  const [clock, setClock] = useState(Date.now());

  const active = shared.calculationInProgress || shared.bassLifecycleState === "stale_needs_recalculation";
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
    clock,
    p14Selection.noP14TargetSelected,
    {
      p14TargetBasis: shared.authoritative?.requested?.p14TargetBasis,
      p18TargetBasis: shared.authoritative?.requested?.p18TargetBasis,
    },
    shared.p19SeatAuthority,
    shared.bassLifecycleState,
  );

  const handlePillClick = (key) => {
    if (interaction.selectedMetric === key) {
      clearGraphInteraction();
    } else {
      setGraphInteraction({ selectedMetric: key });
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap px-1 pb-1">
      {PARAM_KEYS.map((key) => {
        const pill = formatted.pills[key];
        if (!pill) return null;
        const isSeatScoped = SEAT_SCOPED.has(key);
        const { pillLabel, supportingText } = isSeatScoped
          ? { pillLabel: pill.resultText, supportingText: null }
          : splitPillContent(pill.resultText);
        const isActive = interaction.selectedMetric === key;

        return (
          <BassResultDetailTooltip key={key} parameterKey={key}>
            <button
              type="button"
              onClick={() => handlePillClick(key)}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 transition-all duration-150 cursor-pointer select-none
                ${isActive
                  ? "border-[#213428] bg-[#213428]/8 shadow-sm ring-1 ring-[#213428]/30"
                  : "border-[#DCDBD6] bg-white hover:border-[#C1B6AD] hover:bg-[#F6F3EE]"
                }`}
            >
              <span className={`text-[10px] font-bold ${isActive ? "text-[#213428]" : "text-[#625143]"}`}>
                {PARAM_LABELS[key]}
              </span>
              <RP22GradingPill level={pill.level} compact>
                {pillLabel}
              </RP22GradingPill>
              {supportingText && (
                <span className="text-[10px] text-[#625143]">{supportingText}</span>
              )}
            </button>
          </BassResultDetailTooltip>
        );
      })}
    </div>
  );
}