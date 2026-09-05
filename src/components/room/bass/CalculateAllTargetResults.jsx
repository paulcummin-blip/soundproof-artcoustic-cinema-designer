// CalculateAllTargetResults — Explicit "Calculate All P18 Results" button.
//
// Triggers the background P14 target scheduler to calculate all 8 supported
// P14 target combinations (minimum/recommended × L1–L4). Results are saved
// to the persistent target cache; switching between P18/P14 target choices
// shows the saved result immediately without recalculation.
//
// This is deliberately user-requested heavy processing. It does NOT
// reintroduce the old automatic background sweep — the scheduler runs
// ONLY when this button is pressed.

import React from "react";
import { useActiveProjectId } from "@/components/state/project-session";
import { useSharedBassResults } from "@/components/room/bass/bassResultsStore";
import { requestCalculateAllTargets, useCalculateAllTargetsRequest } from "@/components/room/bass/calculateAllTargetsStore";
import { useP14AnalysisProgress, presentP14AnalysisProgress } from "@/components/room/bass/p14AnalysisProgressStore";

export default function CalculateAllTargetResults({ disabled = false }) {
  const projectId = useActiveProjectId();
  const shared = useSharedBassResults();
  const request = useCalculateAllTargetsRequest();
  const progress = useP14AnalysisProgress(projectId);
  const presentation = presentP14AnalysisProgress(progress);

  const requestPending = request?.requested === true;
  // FIX 6: "calculating" means active or resumable work. "paused" and
  // "retryable-partial" are NOT calculating — the button stays enabled so
  // the designer can interact (resume or retry).
  const isCalculating = progress?.status === "calculating" || requestPending;
  const isComplete = progress?.status === "complete" && (progress?.completed || 0) >= (progress?.total || 8);
  const isPaused = progress?.status === "paused";
  const isRetryable = progress?.status === "retryable-partial" || presentation?.retryable === true;

  // Button is disabled only during active calculation or when the shared
  // bass context is not ready. Paused and retryable-partial states keep the
  // button enabled — the designer can press to resume or retry.
  const buttonDisabled = disabled || isCalculating
    || !shared?.canCalculate
    || shared?.calculationInProgress === true;

  const handleClick = () => {
    if (buttonDisabled) return;
    requestCalculateAllTargets();
  };

  // Button always says "Calculate All P18 Results" — no Recalculate wording.
  // Progress ("X of Y prepared") is shown as small secondary text below.
  const label = "Calculate All P18 Results";

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={buttonDisabled}
        className="w-full rounded-lg border border-[#213428] bg-white px-4 py-2.5 text-[12px] font-semibold text-[#213428] transition-opacity hover:bg-[#F7F4F0] disabled:cursor-not-allowed disabled:opacity-45"
      >
        {label}
      </button>
      {isCalculating && !isComplete && (
        <p className="mt-1.5 text-[11px] text-[#625143]">
          {presentation?.label || "Preparing…"}
        </p>
      )}
      {isPaused && !isComplete && (
        <p className="mt-1.5 text-[11px] text-[#625143]">
          {presentation?.label || "Paused"}
        </p>
      )}
      {isRetryable && !isComplete && (
        <p className="mt-1.5 text-[11px] text-[#625143]">
          {presentation?.label || "Retry available"}
        </p>
      )}
      {isComplete && !isCalculating && (
        <p className="mt-1.5 text-[11px] text-[#213428]">
          All {progress?.total || 8} P18 results saved. Switch between target choices to see them instantly.
        </p>
      )}
    </div>
  );
}