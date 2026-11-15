// isometricReportReadinessStore.js
// ---------------------------------------------------------------------------
// A lightweight readiness gate for the report-only isometric render.
//
// The IsometricReportImage component renders a WebGL scene to a PNG data URL
// before the PDF export may run. This store tracks which (projectId, versionId)
// keys have completed their render, so the export buttons in RP22Report and
// RP22ClientReport can disable until the image is ready.
//
// Pure external-store pattern (no React import) so it is safe to read from
// useSyncExternalStore in either report page.

const listeners = new Set();
const readyKeys = new Set();

function emit() {
  listeners.forEach((fn) => fn());
}

/** Mark the isometric render for one project/version as ready (or not). */
export function setIsometricReportReady(key, ready) {
  if (!key) return;
  const had = readyKeys.has(key);
  if (ready && !had) {
    readyKeys.add(key);
    emit();
  } else if (!ready && had) {
    readyKeys.delete(key);
    emit();
  }
}

/** Whether the isometric render for one project/version is ready. */
export function isometricReportReady(key) {
  return key ? readyKeys.has(key) : false;
}

/** Subscribe to readiness changes (useSyncExternalStore compatible). */
export function subscribeIsometricReportReady(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Clear all readiness (used when the report page unmounts or changes project). */
export function clearIsometricReportReadiness() {
  if (readyKeys.size === 0) return;
  readyKeys.clear();
  emit();
}