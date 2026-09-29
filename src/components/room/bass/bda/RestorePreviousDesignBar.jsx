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
import { setRestoring as setSharedRestoring } from "./restoreStateStore";
import { resolveRestoreExit, RESTORE_OUTCOME } from "./restoreRecoveryAuthority";
import { safeConsole } from "@/components/utils/safeConsole";

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
  // Transient restore outcome — set when the transaction returns without a
  // prepared family for the restored design (cache-miss, unprovable/empty bank,
  // promotion failure, physical failure). Drives the actionable card below; it
  // is cleared automatically once the restored authority is current and the
  // target family has been rebuilt.
  const [restoreResult, setRestoreResult] = useState(null);

  // Shared restoring flag — the sole authority BassBackgroundAnalysisOwner
  // reads to force bassLifecycleState = RESTORING. It is set FIRST, before the
  // local state, to minimise the one-render race where the owner re-renders
  // with a stale restoringActive snapshot — and it is always released when the
  // restore transaction returns (FIX 2), so Restoring never outlives it.

  const sharedRef = React.useRef(shared);
  sharedRef.current = shared;

  // ── Coherence reconciliation after a restore ──
  // Every restore outcome (cache-miss, unprovable/empty bank, promotion
  // failure, fingerprint not ready) now exits Restoring immediately and shows
  // the actionable card below. That card clears itself as soon as the restored
  // authority is current for this design AND the prepared target family has
  // been rebuilt — Path C rebuilds it automatically from the restored
  // authority, so no further action is normally required.
  useEffect(() => {
    if (!restoreResult) return;
    const authority = shared?.completedBassAuthority;
    const progress = shared?.p14FamilyProgress;
    const coherent = !!authority?.authoritative
      && !!authority?.contract?.job?.resultFingerprint
      && authority.contract.job.resultFingerprint === shared?.cacheKey
      && !!progress
      && progress.total > 0
      && progress.resolved >= progress.total;
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

    let result = null;
    try {
      result = await restorePreviousDesign(projectId, versionId, {
        commitInstances,
        commitSeating,
        sharedRef,
      });
    } catch {
      result = { ok: false, reason: "restore-error", physicalRestored: false };
    } finally {
      setLocalRestoring(false);
      // FIX 2 — Restoring ALWAYS ends when the restore transaction returns.
      // The transaction is internally bounded (RESTORE_TIMEOUT_MS) and nothing
      // else writes this flag, so holding it open here was what left the
      // lifecycle stuck on "Restoring previous design…" with no checkpoint and
      // no message. The lifecycle now reports Current, or the actionable card
      // below reports "needs updating / preparing target results".
      setSharedRestoring(projectId, versionId, false);
    }

    // Map the returned transaction to the visible state (pure policy).
    const exit = resolveRestoreExit(result);
    if (exit.showNeedsUpdate || exit.showRetry) {
      setRestoreResult({
        ok: false,
        reason: exit.reason,
        physicalRestored: exit.outcome !== RESTORE_OUTCOME.RETRY,
        bankRestored: false,
        needsBankRebuild: exit.needsBankRebuild,
        outcome: exit.outcome,
      });
    }

    // FIX 4 — restore-return diagnostic. One concise line; removable.
    safeConsole.log("bass-restore-return", JSON.stringify({
      projectId,
      versionId,
      ok: result?.ok === true,
      reason: result?.reason || null,
      physicalRestored: result?.physicalRestored === true,
      bankRestored: result?.bankRestored !== false,
      outcome: exit.outcome,
    }));
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

  // ── Needs update / preparing: physical restored, prepared family not ──
  // The checkpoint has been consumed or kept. This card is the ACTIONABLE state
  // the restore exits into; it is deliberately NOT suppressed by the restoring
  // flag (FIX 2) — that flag is cleared by the time the transaction returns.
  // When the restored authority is already current, the family is rebuilt
  // automatically (Path C), so the card reports "Preparing target results…"
  // rather than implying action is required.
  if (!checkpoint && restoreResult && !restoreResult.ok) {
    const progress = shared?.p14FamilyProgress || {};
    const familyTotal = Number(progress.total) || 0;
    const familyResolved = Number(progress.resolved) || 0;
    const authorityCurrent = !!shared?.completedBassAuthority?.authoritative
      && shared?.completedBassAuthority?.contract?.job?.resultFingerprint === shared?.cacheKey;
    const preparing = authorityCurrent && familyTotal > 0 && familyResolved < familyTotal;
    const needsUpdate = restoreResult.physicalRestored !== false;
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 space-y-2">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-amber-700" />
          <span className="text-[13px] font-semibold text-amber-800">Previous design restored</span>
        </div>
        <p className="text-[11px] text-amber-700 leading-relaxed">
          {!needsUpdate
            ? "The previous design could not be restored. You can update bass performance for the current design."
            : preparing ? "Preparing target results\u2026" : "Bass performance needs updating."}
        </p>
        {preparing && (
          <p className="text-[10px] text-amber-600">
            Prepared {familyResolved} of {familyTotal} target results.
          </p>
        )}
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