// designIntentDiagnosticStore.js
// ---------------------------------------------------------------------------
// THE SESSION'S REFUSED DESIGN INTENT ATTEMPTS, kept so a refusal stays
// diagnosable after its notice has been dismissed.
//
// A refused attempt returns its diagnostic ONCE, in the response to the button
// that asked for it. Dismissing the notice would otherwise take the only copy of
// the reason, the offending sentence and the refused draft with it, which is how
// the Barton refusal became undiagnosable. This holds that response for the
// sitting, keyed to the exact report it belongs to (project, design version), so
// the technical detail survives the notice being dismissed and can be read or
// copied at any point while the page is open.
//
// Session-scoped and in memory only: it is not a record, it is not saved to the
// database, it is never read by the report, and it disappears with the page.
// Nothing here writes a narrative, a design value or a report.
//
// Master-admin surface only: the backend sends the diagnostic to a master admin
// alone, so a dealer's attempt stores nothing.
// ---------------------------------------------------------------------------

import { useSyncExternalStore } from 'react';

const store = new Map();
const listeners = new Set();

const keyOf = (projectId, versionId) => `${projectId || ''}::${versionId || ''}`;

function notify() {
  listeners.forEach((listener) => {
    try { listener(); } catch { /* a failing subscriber never breaks the store */ }
  });
}

/**
 * Hold one refused attempt's diagnostic for the session.
 *
 * A response that carries no diagnostic (an ordinary dealer's attempt, or a
 * refusal the backend did not diagnose) replaces nothing: the session keeps the
 * last diagnostic it was actually given rather than blanking it.
 */
export function saveDesignIntentDiagnostics(projectId, versionId, diagnostics) {
  if (!diagnostics || typeof diagnostics !== 'object') return null;
  const key = keyOf(projectId, versionId);
  const next = {
    ...diagnostics,
    held_at: new Date().toISOString(),
  };
  store.set(key, next);
  notify();
  return next;
}

/** The refused attempt held for this report, or null. */
export function readDesignIntentDiagnostics(projectId, versionId) {
  return store.get(keyOf(projectId, versionId)) || null;
}

/** Test/reopen support: forget what this report's session held. */
export function clearDesignIntentDiagnostics(projectId, versionId) {
  const key = keyOf(projectId, versionId);
  const cleared = store.delete(key);
  if (cleared) notify();
  return cleared;
}

export function subscribeDesignIntentDiagnostics(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** React binding — the diagnostic held for this report in the current session. */
export function useDesignIntentDiagnostics(projectId = null, versionId = null) {
  const key = keyOf(projectId, versionId);
  return useSyncExternalStore(
    subscribeDesignIntentDiagnostics,
    () => store.get(key) || null,
    () => null,
  );
}