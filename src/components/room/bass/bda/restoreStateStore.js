// restoreStateStore.js
//
// Shared restoring-state flag for the Restore Previous Design workflow.
//
// FIX 3 — RestorePreviousDesignBar's local `restoring` state is not visible to
// BassBackgroundAnalysisOwner, so the main lifecycle can show "Performance is
// current" while the bar shows "Restoring previous design…". This store moves
// the restoring flag into a shared external store that BassBackgroundAnalysisOwner
// subscribes to, so it can gate the lifecycle state during a restore.
//
// This module does NOT change bass maths, optimiser logic, or publication
// authority. It is a UI-only flag.

import { useSyncExternalStore } from "react";

const restoreStates = new Map(); // "projectId::versionId" -> true
const listeners = new Set();
let revision = 0;

function notify() {
  revision += 1;
  listeners.forEach((l) => l());
}

function key(projectId, versionId) { return `${projectId}::${versionId}`; }

export function setRestoring(projectId, versionId, restoring) {
  if (!projectId || !versionId) return;
  const k = key(projectId, versionId);
  if (restoring) {
    if (!restoreStates.has(k)) {
      restoreStates.set(k, true);
      notify();
    }
  } else {
    if (restoreStates.has(k)) {
      restoreStates.delete(k);
      notify();
    }
  }
}

export function isRestoring(projectId, versionId) {
  if (!projectId || !versionId) return false;
  return restoreStates.has(key(projectId, versionId));
}

export function useIsRestoring(projectId, versionId) {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => isRestoring(projectId, versionId),
    () => isRestoring(projectId, versionId),
  );
}

// Test-only reset
export function _resetRestoreStateForTest() {
  restoreStates.clear();
  revision = 0;
  notify();
}