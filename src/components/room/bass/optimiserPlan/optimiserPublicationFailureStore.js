// optimiserPublicationFailureStore.js
// ---------------------------------------------------------------------------
// KEEP CURRENT BASS RESULT — the designer's acknowledgement of a run whose
// result could not be published.
//
// A run whose result could not be saved is TERMINAL: the panel states it and
// offers exactly two actions, Retry ADI and Keep current bass result. Keeping
// the current bass result means the designer accepts that the current published
// bass result stands — which is the truth, because a failed publication changed
// nothing — and does not want the failure held in front of them.
//
// It records THAT acknowledgement alone, scoped to the exact run that failed
// (project, design version, run id). It is NOT suppression of the failure: the
// saved record keeps its own failure evidence, Engineer details keeps reading
// it, and a new run is a new run id, so its own failure is stated as the new
// thing it is.
//
// Session-scoped, like the panel's own "recommendation ignored" state: the
// acknowledgement belongs to the sitting, so reopening states the failure from
// the saved record again rather than hiding a technical failure for ever.
//
// Presentation only: nothing here writes a design value, a bass result, a plan
// field or a publication.
// ---------------------------------------------------------------------------

import { useSyncExternalStore } from "react";

const store = new Map();
const listeners = new Set();

const keyOf = (projectId, versionId) => `${projectId || ""}::${versionId || ""}`;

function notify() {
  listeners.forEach((listener) => {
    try { listener(); } catch { /* a failing subscriber never breaks the store */ }
  });
}

/** Record the designer's acknowledgement for ONE failed run. */
export function keepCurrentBassResult(projectId, versionId, runId) {
  if (!runId) return null;
  const key = keyOf(projectId, versionId);
  const next = { runId, keptAt: new Date().toISOString() };
  store.set(key, next);
  notify();
  return next;
}

/** Has the designer kept the current bass result for THIS run? */
export function isCurrentBassResultKept({ projectId = null, versionId = null, runId = null } = {}) {
  if (!runId) return false;
  return store.get(keyOf(projectId, versionId))?.runId === runId;
}

export function subscribeCurrentBassKept(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** React binding — whether the named run's failure has been acknowledged. */
export function useCurrentBassResultKept({ projectId = null, versionId = null, runId = null } = {}) {
  const key = keyOf(projectId, versionId);
  return useSyncExternalStore(
    subscribeCurrentBassKept,
    () => store.get(key)?.runId === runId && Boolean(runId),
    () => false,
  );
}

/** Test/reopen support: forget the acknowledgement for one design version. */
export function resetCurrentBassResultKept(projectId, versionId) {
  store.delete(keyOf(projectId, versionId));
  notify();
}