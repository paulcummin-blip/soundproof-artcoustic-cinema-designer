import React from "react";
import { useSharedBassResults } from "@/components/room/bass/bassResultsStore";

// FIX 2: Explicit terminal status display. Shows error/timeout/cancelled/rejected/stale
// messages below the Calculate button — NOT gated behind hasCurrentResult.
// The terminal outcome is preserved until the next calculation starts, so the
// user always sees why the previous attempt ended.
export default function BassTerminalStatus() {
  const shared = useSharedBassResults();
  const lifecycleState = shared?.bassLifecycleState;
  const message = shared?.terminalMessage;

  // Only show for terminal non-complete states. Active calculation phases
  // (preparing, searching, validating, queued) and idle/complete are NOT
  // terminal — they have no message to display.
  if (!lifecycleState
    || lifecycleState === "idle" || lifecycleState === "complete"
    || lifecycleState === "preparing" || lifecycleState === "searching"
    || lifecycleState === "validating" || lifecycleState === "queued") {
    return null;
  }
  if (!message) return null;

  const isError = lifecycleState === "failed" || lifecycleState === "timed_out";
  const isWarning = lifecycleState === "cancelled" || lifecycleState === "stale_needs_recalculation";

  const bg = isError ? "#fef2f2" : "#fffbeb";
  const border = isError ? "#fecaca" : "#fde68a";
  const text = isError ? "#991b1b" : "#92400e";
  const label = isError ? "Error" : "Notice";

  return (
    <div
      className="mt-3 rounded-lg border px-4 py-3"
      style={{ background: bg, borderColor: border }}
    >
      <p className="text-[11px] font-semibold" style={{ color: text }}>{label}</p>
      <p className="mt-1 text-[10px]" style={{ color: text }}>{message}</p>
      {shared?.onRetry && isError && (
        <button
          type="button"
          onClick={shared.onRetry}
          className="mt-2 text-[11px] font-semibold underline"
          style={{ color: text }}
        >
          Retry
        </button>
      )}
    </div>
  );
}