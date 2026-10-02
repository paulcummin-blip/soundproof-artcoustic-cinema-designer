// BassAuthorityRestore.jsx
// ------------------------
// Restores the saved bass authority for the active project version as soon as a
// project is open — on EVERY page, not only where the Room Designer (and its
// Bass section) happens to be mounted.
//
// This component owns no calculation and no state of its own. It acquires the
// canonical completed-bass authority, which:
//   · hydrates the durable completed contract from ProjectAnalysisCache (the
//     saved bass authority: fingerprint, completed contract, P18 extension,
//     P19 response vs target, per-seat results, RSP result, reliability flags),
//   · marks that hydration settled, so consumers can tell "restored" from
//     "still restoring" instead of reading an empty store as a real answer.
// It also hydrates the persisted 8-result P14 target bank, and retries a bank
// that is still only in memory so a completed target cannot be lost by closing
// the page before the debounced write fired.
//
// Reports therefore read the same restored authority the Room Designer reads,
// without the designer opening the Bass section, waiting for a hidden
// recalculation, or opening the Room Designer first.

import { useEffect } from "react";
import { useCompletedBassAuthority } from "@/components/room/bass/completedBassResultStore";
import {
  flushTargetCachePersistence,
  isTargetCacheDirty,
  useTargetCacheHydration,
} from "@/components/room/bass/p14TargetCache";

export default function BassAuthorityRestore({ projectId, versionId }) {
  // Acquiring the authority starts the ONE durable hydration for this project
  // version (refcounted across every consumer) and settles it when it finishes.
  useCompletedBassAuthority(projectId || "free", versionId || "free");
  // The persisted P14 target bank, restored from the same cache record.
  useTargetCacheHydration(projectId, versionId);

  useEffect(() => {
    if (!projectId || !versionId) return undefined;
    if (!isTargetCacheDirty(projectId, versionId)) return undefined;
    const handle = setTimeout(() => {
      flushTargetCachePersistence(projectId, versionId).catch(() => { /* logged in flush */ });
    }, 0);
    return () => clearTimeout(handle);
  }, [projectId, versionId]);

  return null;
}