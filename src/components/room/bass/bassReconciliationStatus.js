/**
 * bassReconciliationStatus.js
 * ---------------------------
 * Read-only runtime proof of the bass-authority reconciliation, plus the
 * plain-language name of what moved when a rebuilt identity has no saved
 * contract.
 *
 * Why this exists: reconciliation is opportunistic — it repairs a saved row on
 * open. When it repairs nothing, the reason must be visible (did the hook
 * mount, was an identity produced, did a saved contract match, did the write
 * land) instead of only a report that says "out of date" with no explanation.
 *
 * It holds no authority and no engineering values: one observed fingerprint,
 * which saved store a match came from, whether the promotion persisted, and the
 * named identity inputs that moved. Reports and the promotion path never read
 * it — it exists to be looked at.
 */

const statusByKey = new Map();

const scopeKey = (projectId, versionId) =>
  `${String(projectId || "free")}::${String(versionId || "free")}`;

/** Merge one reconciliation observation into the scope's status record. */
export function publishBassReconciliationStatus(projectId, versionId, patch) {
  const key = scopeKey(projectId, versionId);
  if (key === "free::free") return null;
  const next = { ...(statusByKey.get(key) || {}), ...patch, updatedAtMs: Date.now() };
  statusByKey.set(key, next);
  if (typeof window !== "undefined") {
    window.__SP_BASS_RECONCILIATION__ = { scope: key, ...next };
  }
  return next;
}

/** The last reconciliation observation for a project version, or null. */
export function readBassReconciliationStatus(projectId, versionId) {
  return statusByKey.get(scopeKey(projectId, versionId)) || null;
}

/**
 * One plain sentence naming the identity inputs that moved, or null when no
 * digest comparison is available. This is what turns "out of date" into
 * "out of date — subwoofer layout (…)".
 */
export function describeBassReconciliationStaleness(projectId, versionId) {
  const differences = readBassReconciliationStatus(projectId, versionId)?.differences;
  if (!Array.isArray(differences) || differences.length === 0) return null;
  const first = differences[0];
  const label = first?.label || null;
  if (!label) return null;
  return first?.detail ? `${label} (${first.detail})` : label;
}

/** Test-only: forget every status record. */
export function _resetBassReconciliationStatusForTest() {
  statusByKey.clear();
}