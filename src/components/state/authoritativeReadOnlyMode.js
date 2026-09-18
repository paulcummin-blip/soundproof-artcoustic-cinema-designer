/**
 * Authoritative Read-Only Mode guard.
 *
 * When active, this signals that the current component is acting as a
 * CONSUMER of authoritative state (e.g. the Technical Report), not a
 * PRODUCER. Every authoritative write boundary — publish, mark, and
 * sync bass-authority functions — calls assertNotAuthoritativeReadOnly()
 * before mutating. If a mutation is attempted while the mode is active,
 * a console warning is logged with the function name, mutation type,
 * and stack trace so the regression is immediately visible.
 *
 * The guard does NOT throw or block the mutation — it warns. This keeps
 * the report rendering pipeline non-destructive while making any
 * accidental write path loud and traceable.
 *
 * Intentional exception: AppState hydration setters (setScreen,
 * setSeatingPositions, setSpeakerSystem, etc.) called by
 * hydrateProjectIntoAppState during report load are display-only
 * hydration, NOT authoritative mutations. They are not guarded here.
 * The authoritative boundaries are the publish, mark, and sync
 * functions that change the published RP22, bass, or design-rating
 * state.
 */

let active = false;
const listeners = new Set();

/**
 * Activate or deactivate authoritative read-only mode.
 * Called by the Technical Report on mount / unmount.
 */
export function setAuthoritativeReadOnlyMode(value) {
  const next = value === true;
  if (active === next) return;
  active = next;
  listeners.forEach((fn) => fn(active));
}

/**
 * Returns true when authoritative read-only mode is active.
 */
export function isAuthoritativeReadOnlyMode() {
  return active;
}

/**
 * Subscribe to mode changes. Returns an unsubscribe function.
 */
export function subscribeAuthoritativeReadOnlyMode(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Assert that an authoritative mutation is permitted. If read-only mode
 * is active, logs a console warning with the function name, mutation
 * type, and stack trace. Does NOT throw — the mutation proceeds so the
 * UI remains non-destructive, but the regression is visible in the
 * console.
 *
 * @param {string} functionName — the publish, mark, or sync function name
 * @param {string} mutationType — e.g. 'publish', 'mark-stale', 'sync-db'
 */
export function assertNotAuthoritativeReadOnly(functionName, mutationType = 'authoritative-mutation') {
  if (!active) return;
  try {
    const stack = new Error().stack || '(no stack)';
    console.warn(
      `⚠ Authoritative Read-Only Mode: ${functionName} attempted to mutate authoritative state.\n`
      + `  Mutation type: ${mutationType}\n`
      + `  Stack trace:\n${stack}`
    );
  } catch {
    // Never let the guard itself throw
  }
}