// isometricReportReadinessStore.js
// ---------------------------------------------------------------------------
// A lightweight readiness + failure gate for the report-only isometric render.
//
// The IsometricReportImage component renders a WebGL scene to a PNG data URL
// before the PDF export may run. This store tracks which (projectId, versionId)
// keys have completed their render, failed, or are pending, so the export
// buttons in RP22Report and RP22ClientReport can disable until the image is
// ready and can show a retry action when capture fails.
//
// Pure external-store pattern (no React import) so it is safe to read from
// useSyncExternalStore in either report page.

const listeners = new Set();

// key -> { status: 'pending' | 'ready' | 'failed', error: string | null, dataUrl: string | null }
const statusMap = new Map();

// key -> number (incremented by requestIsometricRetry to force a re-capture)
const retryCounters = new Map();

function emit() {
  listeners.forEach((fn) => fn());
}

/**
 * Mark the isometric render for one project/version as ready (or not).
 * Setting ready=true also clears any prior failure.
 * Setting ready=false transitions back to pending (used on cleanup / re-render).
 */
export function setIsometricReportReady(key, ready) {
  if (!key) return;
  const current = statusMap.get(key);
  if (ready) {
    if (current?.status !== 'ready') {
      statusMap.set(key, { status: 'ready', error: null, dataUrl: current?.dataUrl || null });
      emit();
    }
  } else {
    // Only transition to pending if NOT already ready from a newer capture.
    // A stale cleanup must not clear a newer successful render.
    if (current?.status === 'ready') {
      statusMap.set(key, { status: 'pending', error: null });
      emit();
    }
  }
}

/**
 * Mark the isometric render for one project/version as failed with an error
 * message. This replaces any prior status so the UI can show the failure and
 * offer retry.
 */
export function setIsometricReportFailed(key, error) {
  if (!key) return;
  const msg = String(error?.message || error || 'Isometric image capture failed');
  const current = statusMap.get(key);
  if (current?.status !== 'failed' || current?.error !== msg) {
    statusMap.set(key, { status: 'failed', error: msg, dataUrl: null });
    emit();
  }
}

/**
 * Store the captured PNG data URL for one key. Called by IsometricReportImage
 * after a successful capture so the display page can read it from the store
 * instead of needing its own capture.
 */
export function setIsometricReportDataUrl(key, dataUrl) {
  if (!key) return;
  const current = statusMap.get(key);
  if (current?.dataUrl !== dataUrl) {
    statusMap.set(key, { ...current, status: current?.status || 'pending', error: current?.error || null, dataUrl });
    emit();
  }
}

/**
 * Reset the status for one key to pending and bump the retry counter, which
 * forces the IsometricReportImage effect to re-run its capture.
 */
export function requestIsometricRetry(key) {
  if (!key) return;
  statusMap.set(key, { status: 'pending', error: null, dataUrl: null });
  retryCounters.set(key, (retryCounters.get(key) || 0) + 1);
  emit();
}

/** Whether the isometric render for one project/version is ready. */
export function isometricReportReady(key) {
  if (!key) return false;
  return statusMap.get(key)?.status === 'ready';
}

/** The status string for one key: 'pending' | 'ready' | 'failed'. */
export function isometricReportStatus(key) {
  if (!key) return 'pending';
  return statusMap.get(key)?.status || 'pending';
}

/** The error message for a failed render, or null. */
export function isometricReportError(key) {
  if (!key) return null;
  return statusMap.get(key)?.error || null;
}

/** The retry nonce for one key (changes on each requestIsometricRetry call). */
export function isometricRetryNonce(key) {
  if (!key) return 0;
  return retryCounters.get(key) || 0;
}

/** The captured PNG data URL for one key, or null if not yet captured. */
export function isometricReportDataUrl(key) {
  if (!key) return null;
  return statusMap.get(key)?.dataUrl || null;
}

/** Subscribe to readiness/failure/retry changes (useSyncExternalStore compatible). */
export function subscribeIsometricReportReady(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Clear all readiness (used when the report page unmounts or changes project). */
export function clearIsometricReportReadiness() {
  if (statusMap.size === 0 && retryCounters.size === 0) return;
  statusMap.clear();
  retryCounters.clear();
  emit();
}