import React, { useEffect, useState } from "react";
import BassResultsPills from "@/components/room/bass/BassResultsPills";
import BassPrioritySelector from "@/components/room/bass/BassPrioritySelector";
import { formatBassResults } from "@/components/room/bass/bassResultsPresentation";
import { useSharedBassResults } from "@/components/room/bass/bassResultsStore";

export default function BassResultsSummary({ compact = false, showPriority = true, seatId = null }) {
  const shared = useSharedBassResults();
  const [nowMs, setNowMs] = useState(Date.now());
  const active = ["stale", "calculating", "running"].includes(shared.contract?.job?.status);
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active, shared.contract?.job?.startedAtMs, shared.contract?.job?.queuedAtMs]);
  const formatted = formatBassResults(shared.contract, nowMs, seatId);
  return <div className={compact ? "space-y-1" : "rounded-lg border border-[#DCDBD6] bg-[#F8F8F7] p-2"}>
    <div className="flex flex-wrap items-center gap-2">
      <div className="min-w-[280px] flex-1"><BassResultsPills contract={shared.contract} compact={compact} seatId={seatId} nowMs={nowMs} /></div>
      {showPriority && <BassPrioritySelector value={formatted.selectedMode} onChange={shared.onPriorityChange} disabled={!shared.onPriorityChange} />}
    </div>
    <div className="flex items-center gap-2 text-[10px] font-medium text-[#625143]" aria-live="polite">
      {shared.contract?.job?.status === "error" && shared.onRetry
        ? <button type="button" onClick={shared.onRetry} className="font-semibold text-red-700 underline">{formatted.statusText}</button>
        : <span>{formatted.statusText}</span>}
    </div>
  </div>;
}