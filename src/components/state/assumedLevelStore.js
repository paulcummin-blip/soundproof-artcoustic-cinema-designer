/**
 * assumedLevelStore.js
 * --------------------
 * Transport-only bridge for P15/P21 assumed-level change requests from
 * surfaces that do not own the appState (the left sidebar Live RP22
 * Performance Summary) to the Room Designer controls panel that does.
 *
 * The Room Designer registers the real appState setters (setAssumedP15LevelSafe
 * / setAssumedP21LevelSafe) as handlers; the sidebar calls
 * requestAssumedLevelChange to trigger them. No level is stored here — this is
 * a function registry, not a second copy of the assumed levels.
 */

const handlers = { p15: null, p21: null };

const keyFor = (param) =>
  param === 15 || param === "p15" || param === "15" ? "p15" : "p21";

/**
 * Register the real state-update handler for P15 or P21.
 * Returns an unregister function.
 */
export function registerAssumedLevelHandler(param, handler) {
  const key = keyFor(param);
  handlers[key] = typeof handler === "function" ? handler : null;
  return () => {
    if (handlers[key] === handler) handlers[key] = null;
  };
}

/**
 * Request a level change from any surface. Calls the registered handler
 * (the appState setter). No-op when no handler is registered (e.g. the
 * Room Designer is not mounted).
 */
export function requestAssumedLevelChange(param, level) {
  const key = keyFor(param);
  const handler = handlers[key];
  if (typeof handler === "function") handler(level);
}