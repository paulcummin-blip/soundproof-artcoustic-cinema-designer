// Larger P14/P18/P19/P20 result cards for the Bass Simulation top section.
// Pure presentation — reads the exact same formatBassResults() pills used by the
// legacy BassResultsPills, so no bass values, levels, or statuses change.
import React, { useEffect, useState } from "react";
import RP22GradingPill from "@/components/ui/RP22GradingPill";
import BassRp22ParameterTooltip from "@/components/room/bass/BassRp22ParameterTooltip";
import { formatBassResults } from "@/components/room/bass/bassResultsPresentation";
import { useSharedBassResults } from "@/components/room/bass/bassResultsStore";

const CARD_TITLES = {
  p14: "P14 Bass SPL",
  p18: "P18 Extension",
  p19: "P19 Response Fit",
  p20: "P20 Seat Consistency",
};

export default function BassResultCards() {
  const shared = useSharedBassResults();
  const [nowMs, setNowMs] = useState(Date.now());
  const active = ["stale", "calculating", "running"].includes(shared.contract?.job?.status);
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active, shared.contract?.job?.startedAtMs, shared.contract?.job?.queuedAtMs]);

  const formatted = formatBassResults(shared.contract, nowMs);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Object.entries(formatted.pills).map(([key, pill]) => (
          <div
            key={key}
            className="flex flex-col gap-1 rounded-lg border border-[#DCDBD6] bg-white p-3"
            aria-label={pill.text}
          >
            <BassRp22ParameterTooltip parameterKey={key}>
              <span className="cursor-help text-[11px] font-semibold text-[#213428] underline decoration-dotted underline-offset-2">
                {CARD_TITLES[key] || pill.label}
              </span>
            </BassRp22ParameterTooltip>
            <RP22GradingPill level={pill.level} />
            <div className="text-[12px] font-semibold text-[#1B1A1A]">{pill.resultText}</div>
            {pill.detail && <div className="text-[10px] text-[#625143]">{pill.detail}</div>}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 text-[10px] font-medium text-[#625143]" aria-live="polite">
        {shared.contract?.job?.status === "error" && shared.onRetry
          ? <button type="button" onClick={shared.onRetry} className="font-semibold text-red-700 underline">{formatted.statusText}</button>
          : <span>{formatted.statusText}</span>}
      </div>
    </div>
  );
}