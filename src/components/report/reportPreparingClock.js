/**
 * reportPreparingClock
 * --------------------
 * When the current Project Report preparing window began, held for the whole
 * browser session, per project version.
 *
 * The report's readiness bound (PREPARING_BOUND_SECONDS) is measured on this
 * clock rather than a per-mount counter, so a re-render or a remount can never
 * restart the wait: a report that cannot be prepared always resolves to a clear
 * Not Ready instead of hanging. The window is closed the moment the report
 * leaves Preparing, so a later genuine attempt measures its own wait.
 *
 * Session state only. Pure arithmetic, no React, no DOM, no timers.
 */

const startedAtByKey = new Map();

/** The window's identity: one window per project version, per session. */
export function preparingKey(projectId, versionId) {
  return `${projectId || ''}::${versionId || ''}`;
}

/** Open the window if it is not already open, and return when it began. */
export function beginPreparingWindow(key, now = Date.now()) {
  if (!startedAtByKey.has(key)) startedAtByKey.set(key, now);
  return startedAtByKey.get(key);
}

/** Seconds the window has been open. */
export function preparingElapsedSeconds(key, now = Date.now()) {
  return Math.max(0, Math.floor((now - beginPreparingWindow(key, now)) / 1000));
}

/** Close the window. */
export function clearPreparingWindow(key) {
  startedAtByKey.delete(key);
}