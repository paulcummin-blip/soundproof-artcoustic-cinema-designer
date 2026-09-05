// CalculateAllTargetResults — Passive P18 target preparation progress.
//
// Shows small passive progress text for the 8-target P14 family:
//   "1 of 8 prepared"          — partial cache, nothing running
//   "Preparing 2 of 8"         — scheduler actively preparing the next target
//   "Paused — 3 of 8 prepared"  — yielded to user interaction / higher-priority work
//   "8 of 8 prepared"          — all targets complete
//   "7 of 8 prepared — retry"  — partial failure, retry available
//
// The only actionable control is a small "Retry" button, shown exclusively
// after a retryable-partial failure. Normal preparation is fully automatic —
// no manual "Calculate All" button is needed.

import React from "react";
import { useActiveProjectId } from "@/components/state/project-session";
import { requestCalculateAllTargets } from "@/components/room/bass/calculateAllTargetsStore";
import { useP14AnalysisProgress, presentP14AnalysisProgress } from "@/components/room/bass/p14AnalysisProgressStore";

export default function CalculateAllTargetResults({ disabled = false }) {
  const projectId = useActiveProjectId();
  const progress = useP14AnalysisProgress(projectId);
  const presentation = presentP14AnalysisProgress(progress);

  const isComplete = presentation?.complete === true;
  const isRetryable = progress?.status === "retryable-partial" || presentation?.retryable === true;

  return (
    <div>
      {presentation?.label && (
        <p className={`text-[11px] ${isComplete ? 'text-[#213428] font-medium' : 'text-[#625143]'}`}>
          {presentation.label}
        </p>
      )}
      {isRetryable && !isComplete && (
        <button
          type="button"
          onClick={() => requestCalculateAllTargets()}
          disabled={disabled}
          className="mt-1.5 rounded-md border border-[#213428] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#213428] transition-opacity hover:bg-[#F7F4F0] disabled:cursor-not-allowed disabled:opacity-45"
        >
          Retry
        </button>
      )}
    </div>
  );
}