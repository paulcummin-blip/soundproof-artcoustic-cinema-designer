/**
 * projectAssetsRefreshState.js
 * ----------------------------
 * Pure refresh-coalescing and project-identity state for the Project Assets
 * and Project Library readers. No React, no SDK — the exact state machine
 * both hooks run, extracted so it is testable without a DOM.
 *
 * Rules this module enforces:
 *   - A refresh requested while a read is already in flight is RETAINED, not
 *     discarded. It runs as a single follow-up once the active read settles.
 *   - Multiple notifications during one read coalesce into one follow-up.
 *   - An older response can never populate a newly selected project: a result
 *     is committed only when the project it was read for is still the active
 *     project.
 *   - Switching projects always clears stale state and starts the new read.
 */

/**
 * One fresh state object. Both hooks hold this in a ref.
 */
export function createProjectAssetsRefreshState() {
  return {
    inFlight: false,
    pending: false,
    pendingSilent: true,
    activeProjectId: null,
  };
}

/**
 * Request a read for `projectId`.
 *
 * Returns `{ shouldRun }`:
 *   - true  → the caller should start the read now.
 *   - false → a read is already in flight; the request has been retained as a
 *             coalesced pending refresh and the caller must NOT start a second
 *             read. The follow-up runs when the active read settles.
 *
 * `silent` is preserved across coalescing: if ANY coalesced request was
 * non-silent, the follow-up is non-silent too.
 */
export function requestRead(state, { projectId, silent = false }) {
  state.activeProjectId = projectId;
  if (state.inFlight) {
    state.pending = true;
    if (!silent) state.pendingSilent = false;
    return { shouldRun: false };
  }
  state.inFlight = true;
  state.pending = false;
  state.pendingSilent = silent;
  return { shouldRun: true };
}

/**
 * Report that a read for `projectId` has settled.
 *
 * Returns:
 *   - `shouldCommit` — true only when `projectId` is still the active project.
 *     An older response (from before a project switch) must never be written
 *     to state.
 *   - `pendingRefresh` — true when a coalesced follow-up should run. The
 *     caller runs ONE follow-up read (using the stored `pendingSilent`).
 */
export function onReadEnd(state, { projectId }) {
  state.inFlight = false;
  const shouldCommit = state.activeProjectId === projectId;
  const pending = state.pending;
  if (pending) {
    state.pending = false;
  }
  return { shouldCommit, pendingRefresh: pending };
}

/**
 * The silent flag the coalesced follow-up should use. Read it before starting
 * the follow-up; it resets to true (silent) once consumed.
 */
export function consumePendingSilent(state) {
  const silent = state.pendingSilent;
  state.pendingSilent = true;
  return silent;
}

/** The project identity a read result should be committed against. */
export function activeProjectIdOf(state) {
  return state.activeProjectId;
}