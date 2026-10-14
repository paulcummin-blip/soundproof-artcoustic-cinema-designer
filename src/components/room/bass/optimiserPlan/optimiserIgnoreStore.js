// optimiserIgnoreStore.js
// ---------------------------------------------------------------------------
// SESSION-SCOPED IGNORE for an optimiser recommendation.
//
// The designer's "Ignore" is a statement about THIS session and THIS result:
// once a recommendation is ignored the panel stops offering it, and the designer
// is not asked again while they stay in the session. Nothing is persisted,
// nothing is written into the design, and no saved evidence is touched — the
// optimiser result, the P19/P20 scoring, the calibration decision and the run
// record all stay exactly as they were.
//
// The key carries the run it was ignored on (project · version · design
// fingerprint), so a re-test — or any design change that produces a new result —
// offers the recommendation again.
// ---------------------------------------------------------------------------

const ignoredKeys = new Set();
const listeners = new Set();

/** The one key shape: this run, on this design, in this project version. */
export function optimiserIgnoreKey({ projectId = "", versionId = "", fingerprint = "" } = {}) {
  return `${projectId || ""}:${versionId || ""}:${fingerprint || ""}`;
}

export function readOptimiserIgnored(key) {
  return Boolean(key) && ignoredKeys.has(key);
}

export function ignoreOptimiserRecommendation(key) {
  if (!key) return;
  ignoredKeys.add(key);
  listeners.forEach((listener) => listener());
}

/** Clear a session ignore — used when a re-test supersedes the result. */
export function clearOptimiserIgnored(key) {
  if (!key || !ignoredKeys.has(key)) return;
  ignoredKeys.delete(key);
  listeners.forEach((listener) => listener());
}

export function subscribeOptimiserIgnored(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}