/**
 * hydrationAuthority.js
 * ---------------------
 * Fail-closed save authority for the Room Designer.
 *
 * A database write is permitted ONLY when:
 *   authority.status === "loaded"
 *   && authority.projectId === activeProjectId
 *   && authority.loadGenerationId === currentLoadGenerationId
 *
 * If any condition is false: NO DATABASE WRITE.
 * This applies equally to autosave, manual save, and debounced saves.
 */

/**
 * Create a new hydration authority for a project load attempt.
 * @param {string} projectId
 * @param {number} loadGenerationId
 * @returns {{projectId: string, loadGenerationId: number, status: "loading"}}
 */
export function createAuthority(projectId, loadGenerationId) {
  return { projectId, loadGenerationId, status: "loading" };
}

/**
 * Mark an authority as successfully loaded — saving is now permitted.
 * @param {object} authority
 * @returns {object}
 */
export function markLoaded(authority) {
  if (!authority) return null;
  return { ...authority, status: "loaded" };
}

/**
 * Mark an authority as failed — saving stays disabled.
 * @param {object} authority
 * @returns {object}
 */
export function markError(authority) {
  if (!authority) return null;
  return { ...authority, status: "error" };
}

/**
 * Check whether a database write is permitted right now.
 * @param {object|null} authority
 * @param {string|null} activeProjectId
 * @param {number} currentLoadGenerationId
 * @returns {boolean}
 */
export function canSave(authority, activeProjectId, currentLoadGenerationId) {
  if (!authority) return false;
  if (!activeProjectId) return false;
  if (authority.status !== "loaded") return false;
  if (authority.projectId !== activeProjectId) return false;
  if (authority.loadGenerationId !== currentLoadGenerationId) return false;
  return true;
}