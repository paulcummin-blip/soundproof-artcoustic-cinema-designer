import React, { useEffect, useState } from "react";
import BassResultsPills from "@/components/room/bass/BassResultsPills";
import BassDesignRecommendation from "@/components/room/bass/BassDesignRecommendation";
import BassCapabilitySummary from "@/components/room/bass/BassCapabilitySummary";
import { formatOfficialBassResults } from "@/components/room/bass/bassResultsPresentation";
import { useSharedBassResults } from "@/components/room/bass/bassResultsStore";
import { resolveP14TargetSelectionState } from "@/components/room/bass/p14TargetSelectionState";

export default function BassResultsSummary({ compact = false, showPriority = true }) {
  const shared = useSharedBassResults();
  const [nowMs, setNowMs] = useState(Date.now());
  const active = shared.isUpdating || ["stale", "calculating", "running", "queued"].includes(shared.lifecycle?.status);
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active, shared.lifecycle?.startedAtMs, shared.lifecycle?.queuedAtMs]);
  const p14Selection = resolveP14TargetSelectionState(shared.authoritative?.requested);
  const formatted = formatOfficialBassResults(
    shared.completedBassAuthority,
    shared.lifecycle,
    shared.seatingPositions,
    nowMs,
    p14Selection.noP14TargetSelected,
  );
  return <div className={compact ? "space-y-1" : "rounded-lg border border-[#DCDBD6] bg-[#F8F8F7] p-2"}>
    {showPriority && <div className="mb-2 text-xs font-semibold text-[#213428]">Balanced RP22 Optimisation</div>}
    <div className="flex flex-wrap items-center gap-2">
      <div className="min-w-[280px] flex-1"><BassResultsPills compact={compact} nowMs={nowMs} /></div>
    </div>
    <div className="flex items-center gap-2 text-[10px] font-medium text-[#625143]" aria-live="polite">
      {shared.lifecycle?.status === "error" && shared.onRetry
        ? <button type="button" onClick={shared.onRetry} className="font-semibold text-red-700 underline">{formatted.statusText}</button>
        : <span>{formatted.statusText}</span>}
    </div>
    {p14Selection.noP14TargetSelected ? null : (
      <>
        <BassCapabilitySummary
          capability={shared.contract?.selectedCandidate?.postEqCapabilityAssessment}
          targetWarning={shared.contract?.selectedCandidate?.targetWarning}
          p14Parameter={shared.contract?.productAnalysis?.parameters?.p14}
        />
        <BassDesignRecommendation recommendation={shared.contract?.designRecommendation} />
      </>
    )}
  </div>;
}