// bassCacheKey.js
//
// Composite cache identity for all bass analysis caches.
//
// The cache identity is ALWAYS (projectId, versionId) — never projectId alone.
// This ensures correctness even when:
//   - two browser tabs open different versions of the same project,
//   - a future comparison view loads V1 and V2 simultaneously,
//   - background analysis runs on one version while another is open.
//
// Every in-memory Map key and every database filter must use this identity.

/**
 * Build the composite in-memory cache key.
 * @param {string} projectId
 * @param {string} [versionId] - ProjectVersion ID. Falls back to "free".
 * @returns {string} "{projectId}::{versionId}"
 */
export function bassCacheKey(projectId, versionId) {
  const pid = String(projectId || "free");
  const vid = String(versionId || "free");
  return `${pid}::${vid}`;
}

/**
 * Build a database filter object for cache entity queries.
 * Always includes both project_id and version_id.
 * @param {string} projectId
 * @param {string} [versionId] - ProjectVersion ID. Falls back to "free".
 * @returns {{project_id: string, version_id: string}}
 */
export function bassDbFilter(projectId, versionId) {
  return {
    project_id: String(projectId || "free"),
    version_id: String(versionId || "free"),
  };
}

/**
 * Extract projectId and versionId from a composite key.
 * @param {string} key
 * @returns {{projectId: string, versionId: string}}
 */
export function parseBassCacheKey(key) {
  const [pid, vid] = String(key || "free::free").split("::");
  return { projectId: pid || "free", versionId: vid || "free" };
}