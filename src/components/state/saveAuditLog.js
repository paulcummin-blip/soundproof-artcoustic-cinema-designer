/**
 * saveAuditLog.js
 * ---------------
 * Lightweight save provenance log for the Room Designer.
 *
 * For every Project write (or blocked attempt), records:
 *   projectId, timestamp, source (autosave|manual),
 *   hydrationGenerationId, hydrationStatus,
 *   payloadHash, structuralCounts, systemFormat,
 *   blocked, blockReason
 *
 * Does NOT store full project payloads — only a short hash + counts.
 * Capped at MAX_ENTRIES to avoid unbounded growth.
 */

const LOG_KEY = "b44_save_audit_log";
const MAX_ENTRIES = 200;

/**
 * Read the save audit log from localStorage.
 * @returns {Array<object>}
 */
export function readSaveLog() {
  try {
    if (typeof window === "undefined") return [];
    const raw = window.localStorage.getItem(LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Append a save event to the audit log.
 * @param {object} event
 */
export function logSaveEvent(event) {
  try {
    if (typeof window === "undefined") return;
    const entry = {
      timestamp: Date.now(),
      ...event,
    };
    const log = readSaveLog();
    log.unshift(entry);
    if (log.length > MAX_ENTRIES) log.length = MAX_ENTRIES;
    window.localStorage.setItem(LOG_KEY, JSON.stringify(log));
  } catch {
    // Never crash the save path over a logging failure.
  }
}

/**
 * Clear the save audit log (admin/debug).
 */
export function clearSaveLog() {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(LOG_KEY);
  } catch {
    // ignore
  }
}