// adiResultsDismissStore.js
// ---------------------------------------------------------------------------
// Session-scoped, per-recommendation dismiss state for the ADI results panel.
//
// Dismiss hides a single identified recommendation from the main results view.
// It writes nothing to the design, deletes no audit evidence, and is cleared
// when the design fingerprint changes (a new run or a design change re-offers
// the recommendation). Pure presentation state.
// ---------------------------------------------------------------------------

const store = new Set();
const listeners = new Set();

const keyOf = (projectId, versionId, leverKey, fingerprint) =>
  `${projectId || ""}::${versionId || ""}::${leverKey || ""}::${fingerprint || ""}`;

export function isRecommendationDismissed(projectId, versionId, leverKey, fingerprint) {
  return store.has(keyOf(projectId, versionId, leverKey, fingerprint));
}

export function dismissRecommendation(projectId, versionId, leverKey, fingerprint) {
  store.add(keyOf(projectId, versionId, leverKey, fingerprint));
  listeners.forEach((l) => { try { l(); } catch { /* listener failure is isolated */ } });
}

export function restoreRecommendation(projectId, versionId, leverKey, fingerprint) {
  store.delete(keyOf(projectId, versionId, leverKey, fingerprint));
  listeners.forEach((l) => { try { l(); } catch { /* listener failure is isolated */ } });
}

export function subscribeDismiss(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}