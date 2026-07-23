import React, { useEffect, useState } from "react";
import RP22GradingPill from "@/components/ui/RP22GradingPill";
import BassRp22ParameterTooltip from "@/components/room/bass/BassRp22ParameterTooltip";
import { formatBassResults } from "@/components/room/bass/bassResultsPresentation";
import { useSharedBassResults } from "@/components/room/bass/bassResultsStore";

export default function BassResultsPills({ contract, compact = false, seatId = null, nowMs }) {
  const shared = useSharedBassResults();
  const result = contract || shared.contract;
  const [clock, setClock] = useState(Date.now());
  const active = nowMs == null && ["stale", "calculating", "running"].includes(result?.job?.status);
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active, result?.job?.startedAtMs, result?.job?.queuedAtMs]);
  const formatted = formatBassResults(result, nowMs ?? clock, seatId);
  return <div className="grid grid-cols-2 gap-1 sm:grid-cols-4" aria-label="Bass RP22 results">
    {Object.entries(formatted.pills).map(([key, pill]) => (
      <span key={key} className="flex flex-col gap-1" aria-label={pill.text}>
        <BassRp22ParameterTooltip parameterKey={key}>
          <span className="cursor-help text-center text-[11px] font-semibold text-[#213428] underline decoration-dotted underline-offset-2">
            {key.toUpperCase()}
          </span>
        </BassRp22ParameterTooltip>
        <RP22GradingPill level={pill.level} compact={compact} style={{ width: "100%" }}>{pill.resultText}</RP22GradingPill>
        {pill.detail && <small className="text-center text-[10px] text-muted-foreground">{pill.detail}</small>}
      </span>
    ))}
  </div>;
}