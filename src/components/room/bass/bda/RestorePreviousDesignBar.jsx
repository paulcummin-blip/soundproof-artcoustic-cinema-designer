// RestorePreviousDesignBar.jsx
//
// Minimal UI for the safe bass design experimentation workflow.
//
// Renders ONLY when a previous-design checkpoint exists. Shows the
// appropriate state wording and two actions:
//   - Restore previous design
//   - Keep design
//
// This is a presentation component — all authority lives in
// bdaCheckpointAuthority.js. It does NOT create another bass workflow.
//
// State matrix:
//
//   Checkpoint exists + bass calculating/stale:
//     "DESIGN CHANGED — Previous design saved for restore"
//     [Update Bass Performance] (only if not auto-calculating)
//     [Restore previous design]
//
//   Checkpoint exists + new result COMPLETE:
//     "NEW RESULT"
//     [Keep design] [Restore previous design]
//
//   Checkpoint exists + calculation failed:
//     "CALCULATION FAILED"
//     [Retry] [Restore previous design]
//
//   No checkpoint: render nothing.

import React, { useState } from "react";
import { History, Check, RefreshCw, Loader2 } from "lucide-react";
import { usePreviousDesignCheckpoint, clearCheckpoint } from "./previousDesignCheckpoint";
import { restorePreviousDesign } from "./bdaCheckpointAuthority";

export default function RestorePreviousDesignBar({
  projectId,
  versionId,
  appState,
  shared,
  commitInstances,
  commitSeating,
  // Lifecycle signals from the shared bass results context
  isCalculating = false,
  isStale = false,
  hasFailed = false,
  hasCurrentResult = false,
  // Existing actions from the BDA workflow (passed through, not duplicated)
  onUpdateBass = null,
  onRetry = null,
}) {
  const checkpoint = usePreviousDesignCheckpoint(projectId, versionId);
  const [restoring, setRestoring] = useState(false);
  // Transient restore result — shown after a cache-miss restore when the
  // checkpoint has been consumed (cleared) but the bass result could not be
  // promoted from cache. The physical design was restored; bass is STALE.
  const [restoreResult, setRestoreResult] = useState(null);

  const sharedRef = React.useRef(shared);
  sharedRef.current = shared;

  const handleRestore = async () => {
    if (restoring) return;
    setRestoring(true);
    setRestoreResult(null);
    try {
      const result = await restorePreviousDesign(projectId, versionId, {
        commitInstances,
        commitSeating,
        sharedRef,
      });
      if (result && !result.ok && result.physicalRestored) {
        setRestoreResult(result);
      }
    } finally {
      setRestoring(false);
    }
  };

  const handleKeep = () => {
    clearCheckpoint(projectId, versionId);
  };

  // ── Cache-miss / restore-failed: physical restored, bass STALE ──
  // The checkpoint has been consumed. Show the message + Update action.
  if (!checkpoint && restoreResult && !restoreResult.ok) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 space-y-2">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-amber-700" />
          <span className="text-[13px] font-semibold text-amber-800">Previous design restored</span>
        </div>
        <p className="text-[11px] text-amber-700 leading-relaxed">
          Bass performance needs updating.
        </p>
        {typeof onUpdateBass === "function" && (
          <button
            type="button"
            onClick={() => {
              setRestoreResult(null);
              onUpdateBass();
            }}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#213428] px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-[#3E4349]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Update Bass Performance
          </button>
        )}
      </div>
    );
  }

  if (!checkpoint) return null;

  // ── State: restoring ──
  if (restoring) {
    return (
      <div className="rounded-lg border border-[#D9D5CE] bg-[#F8F7F4] px-4 py-3">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-[#213428]" />
          <span className="text-[13px] font-semibold text-[#1B1A1A]">Restoring previous design…</span>
        </div>
      </div>
    );
  }

  // ── State: calculation failed ──
  if (hasFailed) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-red-800">Calculation failed</span>
        </div>
        <div className="flex gap-3">
          {typeof onRetry === "function" && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 rounded-md bg-red-700 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-red-800"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </button>
          )}
          <button
            type="button"
            onClick={handleRestore}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#D9D5CE] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#213428] transition-colors hover:bg-[#F3F1EC]"
          >
            <History className="h-3.5 w-3.5" />
            Restore previous design
          </button>
        </div>
      </div>
    );
  }

  // ── State: calculating / stale (design changed, result not yet ready) ──
  if (isCalculating || isStale) {
    return (
      <div className="rounded-lg border border-[#D9D5CE] bg-[#F8F7F4] px-4 py-3 space-y-2">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-[#625143]" />
          <span className="text-[13px] font-semibold text-[#1B1A1A]">Design changed</span>
        </div>
        <p className="text-[11px] text-[#625143] leading-relaxed">
          Previous design saved for restore.
        </p>
        <div className="flex gap-3">
          {isStale && typeof onUpdateBass === "function" && (
            <button
              type="button"
              onClick={onUpdateBass}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#213428] px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-[#3E4349]"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Update Bass Performance
            </button>
          )}
          <button
            type="button"
            onClick={handleRestore}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#D9D5CE] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#213428] transition-colors hover:bg-[#F3F1EC]"
          >
            <History className="h-3.5 w-3.5" />
            Restore previous design
          </button>
        </div>
      </div>
    );
  }

  // ── State: new result complete ──
  if (hasCurrentResult) {
    return (
      <div className="rounded-lg border border-[#213428] bg-[#F3F1EC] px-4 py-3 space-y-2">
        <div className="flex items-center gap-2">
          <Check className="h-4 w-4 text-[#213428]" />
          <span className="text-[13px] font-semibold text-[#1B1A1A]">New result</span>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleKeep}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#213428] px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-[#3E4349]"
          >
            <Check className="h-3.5 w-3.5" />
            Keep design
          </button>
          <button
            type="button"
            onClick={handleRestore}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#D9D5CE] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#213428] transition-colors hover:bg-[#F3F1EC]"
          >
            <History className="h-3.5 w-3.5" />
            Restore previous design
          </button>
        </div>
      </div>
    );
  }

  // Fallback: checkpoint exists but no clear lifecycle signal yet.
  // Show the restore option only — do not fabricate a state.
  return (
    <div className="rounded-lg border border-[#D9D5CE] bg-[#F8F7F4] px-4 py-3">
      <button
        type="button"
        onClick={handleRestore}
        className="inline-flex items-center gap-1.5 rounded-md border border-[#D9D5CE] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#213428] transition-colors hover:bg-[#F3F1EC]"
      >
        <History className="h-3.5 w-3.5" />
        Restore previous design
      </button>
    </div>
  );
}