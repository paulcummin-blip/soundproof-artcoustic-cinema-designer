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

import React, { useState, useEffect } from "react";
import { History, Check, RefreshCw, Loader2 } from "lucide-react";
import { usePreviousDesignCheckpoint, clearCheckpoint } from "./previousDesignCheckpoint";
import { restorePreviousDesign } from "./bdaCheckpointAuthority";
import { setRestoring as setSharedRestoring, useIsRestoring } from "./restoreStateStore";

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
  const [restoring, setLocalRestoring] = useState(false);
  // Transient restore result — shown after a cache-miss restore when the
  // checkpoint has been consumed (cleared) but the bass result could not be
  // promoted from cache. The physical design was restored; bass is STALE.
  const [restoreResult, setRestoreResult] = useState(null);

  // Shared restoring flag — the sole authority BassBackgroundAnalysisOwner
  // reads to force bassLifecycleState = RESTORING. The local `restoring`
  // state is NOT visible to the owner, so the shared store must be set
  // FIRST (before the local state) to minimise the one-render race where
  // the owner re-renders with a stale restoringActive snapshot.
  const sharedRestoringActive = useIsRestoring(projectId, versionId);

  const sharedRef = React.useRef(shared);
  sharedRef.current = shared;

  // ── Coherence reconciliation for cache-miss restores ──
  // A cache-miss restore returns { ok:false, reason:"cache-miss",
  // physicalRestored:true, bankRestored:false }. The shared restoring state
  // is intentionally kept active (finally block skips clearing it). The
  // publish effect in BassBackgroundAnalysisOwner may subsequently promote
  // the cached contract from the hydrated target bank, making the
  // authority AUTHORITATIVE. When the authority is coherent AND the target
  // family is complete (ready >= total), the restore has recovered — clear
  // the stale cache-miss warning and the shared restoring state so the
  // lifecycle transitions to COMPLETE without requiring another Update
  // Bass Performance action.
  useEffect(() => {
    if (!restoreResult) return;
    if (restoreResult.reason !== "cache-miss") return;
    const authority = shared?.completedBassAuthority;
    const progress = shared?.p14FamilyProgress;
    const coherent = !!authority?.authoritative
      && !!authority?.contract?.job?.resultFingerprint
      && authority.contract.job.resultFingerprint === shared?.cacheKey
      && !!progress
      && progress.total > 0
      && progress.ready >= progress.total;
    if (coherent) {
      setRestoreResult(null);
      setSharedRestoring(projectId, versionId, false);
    }
  }, [restoreResult, shared?.completedBassAuthority, shared?.cacheKey, shared?.p14FamilyProgress, projectId, versionId]);

  const handleRestore = async () => {
    if (restoring) return;
    // Set shared FIRST so BassBackgroundAnalysisOwner's useSyncExternalStore
    // subscription is notified before the local re-render, reducing the
    // one-render race where restoringActive is stale.
    setSharedRestoring(projectId, versionId, true);
    setLocalRestoring(true);
    setRestoreResult(null);
    let bankRestored = true;
    try {
      const result = await restorePreviousDesign(projectId, versionId, {
        commitInstances,
        commitSeating,
        sharedRef,
      });
      if (result && !result.ok) {
        setRestoreResult(result);
      }
      // Only clear the shared restoring state if the target bank was
      // restored (from snapshot or DB). If the bank is still 0/8, keep the
      // shared restoring state active so the lifecycle shows
      // "Restoring previous design…" instead of "Performance is current".
      //
      // A bank-identity mismatch means the prepared bank belongs to another
      // physical design: the restore transaction itself is finished (physical
      // design + authority + publication pointer restored) and the bank must be
      // rebuilt for the restored design. Release the restoring state — the bank
      // identity gate keeps the lifecycle off "Performance is current" until
      // the bank matches the restored design.
      const bankIdentityMismatch = result?.reason === "bank-snapshot-base-design-mismatch";
      bankRestored = result?.bankRestored !== false || bankIdentityMismatch;
    } catch {
      bankRestored = false;
    } finally {
      setLocalRestoring(false);
      if (bankRestored) {
        setSharedRestoring(projectId, versionId, false);
      }
    }
  };

  const handleKeep = () => {
    clearCheckpoint(projectId, versionId);
  };

  // ── Restore failed (checkpoint kept for retry) ──
  // Physical restore failed — the checkpoint is still intact so the designer
  // can retry. (Fix 4)
  if (checkpoint && restoreResult && !restoreResult.ok && !restoreResult.physicalRestored) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-red-800">Restore failed</span>
        </div>
        <p className="text-[11px] text-red-700 leading-relaxed">
          Could not restore the previous design. Try again.
        </p>
        <button
          type="button"
          onClick={() => setRestoreResult(null)}
          className="inline-flex items-center gap-1.5 rounded-md bg-red-700 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-red-800"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry restore
        </button>
      </div>
    );
  }

  // ── Cache-miss / restore-failed: physical restored, bass STALE ──
  // The checkpoint has been consumed. Show the message + Update action.
  // SUPPRESS this warning while the shared restoring state is active —
  // the main lifecycle (CurrentDesignBar / BassPerformanceStrip) already
  // shows "Restoring previous design…" via bassLifecycleState = RESTORING.
  // The cache-miss warning must not appear as a second top-level status.
  if (!checkpoint && restoreResult && !restoreResult.ok && restoreResult.physicalRestored && !sharedRestoringActive) {
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