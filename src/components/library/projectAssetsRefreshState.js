/**
 * projectAssetsRefreshState.js
 * ----------------------------
 * Pure refresh-coalescing and request-identity state for the Project Assets,
 * Project Library and Proposal Image Gallery readers. No React, no SDK — the
 * exact state machine every asset hook runs, extracted so it is testable
 * without a DOM.
 *
 * Rules this module enforces:
 *   - A refresh requested while a read is already in flight is RETAINED, not
 *     discarded. It runs as a single follow-up once the active read settles.
 *   - Multiple notifications during one read coalesce into one follow-up.
 *   - An older response can never populate a newly selected project, and an
 *     earlier visit to the SAME project can never overwrite a later visit's
 *     data: a result is committed only when both the project id and the
 *     visit generation captured at read time still match.
 *   - Switching projects always bumps the visit generation so any in-flight
 *     read or count for the previous visit is discarded on settle.
 *   - Count requests are coalesced independently: five notifications during
 *     one count produce one follow-up count, not five.
 */

/**
 * One fresh state object. Each hook holds this in a ref.
 */
export function createProjectAssetsRefreshState() {
  return {
    activeProjectId: null,
    // Visit generation — incremented every time the active project changes.
    // Captured by requestRead/requestCount and checked on settle so a stale
    // response from an earlier visit (even of the same project) is discarded.
    generation: 0,
    // Read coalescing
    inFlight: false,
    pending: false,
    pendingSilent: true,
    // Count coalescing (independent in-flight tracking, shared generation)
    countInFlight: false,
    countPending: false,
  };
}

/**
 * Set the active project, bumping the visit generation on a change so every
 * in-flight read and count for the previous visit is invalidated on settle.
 */
function setActiveProject(state, projectId) {
  if (state.activeProjectId !== projectId) {
    state.activeProjectId = projectId;
    state.generation += 1;
  }
}

/**
 * Request a read for `projectId`.
 *
 * Returns `{ shouldRun, generation }`:
 *   - shouldRun true  → the caller should start the read now. `generation` is
 *     the visit identity to pass back to onReadEnd.
 *   - shouldRun false → a read is already in flight; the request has been
 *     retained as a coalesced pending refresh and the caller must NOT start a
 *     second read. The follow-up runs when the active read settles.
 *
 * `silent` is preserved across coalescing: if ANY coalesced request was
 * non-silent, the follow-up is non-silent too.
 */
export function requestRead(state, { projectId, silent = false }) {
  setActiveProject(state, projectId);
  if (state.inFlight) {
    state.pending = true;
    if (!silent) state.pendingSilent = false;
    return { shouldRun: false };
  }
  state.inFlight = true;
  state.pending = false;
  state.pendingSilent = silent;
  return { shouldRun: true, generation: state.generation };
}

/**
 * Report that a read for `projectId` captured at `generation` has settled.
 *
 * Returns:
 *   - `shouldCommit` — true only when both the project and the visit
 *     generation still match. An older response (from before a project switch,
 *     or from an earlier visit to the same project) must never be written.
 *   - `pendingRefresh` — true when a coalesced follow-up should run.
 */
export function onReadEnd(state, { projectId, generation }) {
  state.inFlight = false;
  const shouldCommit = state.activeProjectId === projectId
    && state.generation === generation;
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

/**
 * Request a count for `projectId`. Counts are coalesced independently from
 * reads: a count can be in flight while a read is in flight, but five
 * notifications during one count produce one follow-up, not five.
 *
 * Returns `{ shouldRun, generation }`:
 *   - shouldRun true  → run the count now. `generation` is the visit identity.
 *   - shouldRun false → a count is already in flight; retained as a follow-up.
 */
export function requestCount(state, { projectId }) {
  setActiveProject(state, projectId);
  if (state.countInFlight) {
    state.countPending = true;
    return { shouldRun: false };
  }
  state.countInFlight = true;
  state.countPending = false;
  return { shouldRun: true, generation: state.generation };
}

/**
 * Report that a count for `projectId` captured at `generation` has settled.
 * Same identity contract as onReadEnd: only commit when both match.
 */
export function onCountEnd(state, { projectId, generation }) {
  state.countInFlight = false;
  const shouldCommit = state.activeProjectId === projectId
    && state.generation === generation;
  const pending = state.countPending;
  if (pending) {
    state.countPending = false;
  }
  return { shouldCommit, pendingRefresh: pending };
}

/** The project identity a read result should be committed against. */
export function activeProjectIdOf(state) {
  return state.activeProjectId;
}