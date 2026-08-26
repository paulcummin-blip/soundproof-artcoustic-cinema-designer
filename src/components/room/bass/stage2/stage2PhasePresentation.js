// stage2PhasePresentation.js
// Combined phase presentation for the P14 controls area.
//
// Shows the actual calculation phase in the required order:
//   1. "Calculating current target…" — foreground P14 running
//   2. "Optimising subwoofer positions · X of 3" — Stage 2 confirmation running
//   3. "Calculating bass targets · X of 8 · ~XXs remaining" — background P14 running
//   4. "Analysis complete" — all done
//
// ETA uses measured job durations from the P14 progress store. No fake countdown.

import { presentP14AnalysisProgress } from "../p14AnalysisProgressStore";

/**
 * Compute the combined phase label from the foreground lifecycle, Stage 2
 * state, and P14 family progress.
 *
 * @param {object} params
 * @param {string} params.foregroundStatus — bass background lifecycle status
 *   ("idle" | "queued" | "calculating" | "ready" | "error")
 * @param {object} params.stage2State — Stage 2 placement store state
 * @param {object} params.p14Progress — P14 analysis progress from the store
 * @param {boolean} params.hasSelectedP14 — whether a P14 target is selected
 * @returns {string|null} phase label, or null if nothing to show
 */
export function presentCombinedPhase({
  foregroundStatus,
  stage2State,
  p14Progress,
  hasSelectedP14,
}) {
  if (!hasSelectedP14) return null;

  // 1. Foreground P14 running
  if (foregroundStatus === "queued" || foregroundStatus === "calculating") {
    return "Calculating current target…";
  }

  // 2. Stage 2 confirmation running
  if (stage2State?.status === "updating") {
    const phase = stage2State?.phase || "";
    // Confirmation phase: "confirmation_X_of_Y" → "Optimising subwoofer positions · X of Y"
    const confirmMatch = String(phase).match(/^confirmation_(\d+)_of_(\d+)$/);
    if (confirmMatch) {
      const done = parseInt(confirmMatch[1], 10);
      const total = parseInt(confirmMatch[2], 10);
      return `Optimising subwoofer positions · ${done + 1} of ${total}`;
    }
    // Placement phase: still computing raw transfers
    if (phase === "placement") {
      return "Optimising subwoofer positions…";
    }
    // Preparing or other updating states
    return "Optimising subwoofer positions…";
  }

  // 3. Background P14 family running — only when work is actually in progress.
  // "idle" status means hydration hasn't settled or the background scheduler
  // hasn't started yet; showing "Calculating bass targets · 0 of 8" here is a
  // transient flash before the hydrated family resolves.
  if (p14Progress && p14Progress.status === "calculating" && Number(p14Progress.completed) < Number(p14Progress.total)) {
    const presented = presentP14AnalysisProgress(p14Progress);
    if (presented && !presented.complete) {
      return `Calculating bass targets · ${presented.label}`;
    }
  }

  // 4. Everything complete
  if (foregroundStatus === "ready" || foregroundStatus === "idle") {
    if (stage2State?.status === "complete" || !stage2State) {
      if (!p14Progress || p14Progress.status === "complete" || Number(p14Progress.completed) >= Number(p14Progress.total)) {
        return "Analysis complete";
      }
    }
  }

  return null;
}