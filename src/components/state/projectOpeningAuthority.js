// projectOpeningAuthority.js
// --------------------------
// THE authority for "is this project actually open yet?".
//
// The opening panel does NOT mean "the project record has loaded". It means the
// saved design has been restored and the main project authorities are ready — or
// are known to be unavailable, with a reason. This module owns exactly that
// answer, so the panel can neither close early (half-restored state on screen)
// nor hang (an unknown state shown as if it were the truth).
//
// Every stage ends in a definite outcome — ready, not generated yet, not
// applicable, out of date, or failed with a reason. "Still restoring" is NOT a
// completed stage, so a stage that never confirms keeps the panel open; it is
// never silently resolved into a finished project. When the wait runs long the
// panel says so and offers Retry, and it will only continue on an explicit,
// warned decision — and never past a critical stage.
//
// Read-only: nothing here calculates, recalculates, generates a report, starts a
// worker or writes to the database. It only records what other authorities
// report.

import { useMemo, useSyncExternalStore } from "react";

import {
  OPENING_CHECKPOINT_OUTCOME,
  OPENING_CHECKPOINT_STATE,
  criticalOpeningCheckpointKeys,
  normaliseId,
  normaliseOutcome,
} from "./projectOpeningStages.js";
import {
  PROJECT_OPENING_CHECKPOINT_KEYS,
  deriveOpeningReadinessFor,
  pendingOpeningCheckpointKeys,
} from "./projectOpeningReadiness.js";

// Re-exported so the panel, the resolver and the tests keep one import site for
// the whole opening contract.
export {
  OPENING_CHECKPOINT_OUTCOME,
  OPENING_CHECKPOINT_STATE,
  OPENING_ENTRY_SURFACE,
  OPENING_OUTCOME_LABEL,
  OPENING_PHASE,
  OUTCOME_VALUES,
  WARNING_OUTCOMES,
  criticalOpeningCheckpointKeys,
  openingCheckpointStage,
  openingEntrySurfaceForPath,
} from "./projectOpeningStages.js";
export {
  PROJECT_OPENING_CHECKPOINT_KEYS,
  PROJECT_OPENING_LINES,
  openingCheckpointWarnings,
  openingProgressLines,
  pendingOpeningCheckpointKeys,
} from "./projectOpeningReadiness.js";

/** The panel never flashes: it stays for at least this long. */
export const PROJECT_OPENING_MIN_VISIBLE_MS = 900;

/**
 * A dependency that will not confirm within this window stops being waited on
 * silently: the panel says it is still restoring and offers Retry. It never
 * opens the project by itself — an unresolved stage is not a completed stage.
 * A still-unresolved critical stage cannot be continued past at all.
 */
export const PROJECT_OPENING_TIMEOUT_MS = 8000;

/** The panel notice shown while a required stage has not confirmed in time. */
export const PROJECT_OPENING_STILL_RESTORING_TITLE = "Still restoring saved project data";

const TIMEOUT_DETAIL =
  "Not confirmed in time — this step was still restoring when the project was opened.";

const emptySnapshot = () => ({
  projectId: null,
  versionId: null,
  startedAt: 0,
  minVisibleMs: PROJECT_OPENING_MIN_VISIBLE_MS,
  timeoutMs: PROJECT_OPENING_TIMEOUT_MS,
  minVisibleElapsed: false,
  closed: false,
  timedOut: false,
  /** Route-specific gating: the surface the designer opened straight into. */
  entrySurface: null,
  /** How many times the reads have been re-run (Retry). */
  attempt: 0,
  warningsDismissed: false,
  checkpoints: {},
});

let state = emptySnapshot();
const listeners = new Set();
let minVisibleTimer = null;
let timeoutTimer = null;

/**
 * Projects already fully opened in this browser session. Moving between pages
 * inside an open project must never show the opening panel again.
 */
const satisfiedProjects = new Set();

function notify() {
  listeners.forEach((listener) => listener());
}

function clearTimers() {
  if (minVisibleTimer != null) {
    clearTimeout(minVisibleTimer);
    minVisibleTimer = null;
  }
  if (timeoutTimer != null) {
    clearTimeout(timeoutTimer);
    timeoutTimer = null;
  }
}

/**
 * Arm the "this is taking a long time" notice. It never resolves a stage and
 * never closes the panel — it only tells the designer the truth, so a slow
 * read can no longer look like a finished one.
 */
function scheduleOpeningTimeout(timeoutMs) {
  if (timeoutTimer != null) {
    clearTimeout(timeoutTimer);
    timeoutTimer = null;
  }
  if (!(timeoutMs > 0)) return;
  timeoutTimer = setTimeout(() => {
    timeoutTimer = null;
    markProjectOpeningTimedOut();
  }, timeoutMs);
}

function markSatisfied(projectId) {
  const pid = normaliseId(projectId);
  if (pid) satisfiedProjects.add(pid);
}

export function getProjectOpening() {
  return state;
}

export function subscribeProjectOpening(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Has this project already been fully opened in this browser session? */
export function isProjectOpeningSatisfied(projectId) {
  const pid = normaliseId(projectId);
  return !!pid && satisfiedProjects.has(pid);
}

export function markProjectOpeningSatisfied(projectId) {
  const pid = normaliseId(projectId);
  if (!pid || satisfiedProjects.has(pid)) return;
  satisfiedProjects.add(pid);
  notify();
}

export function resetProjectOpening() {
  clearTimers();
  state = emptySnapshot();
  notify();
}

/**
 * A project is being opened. Idempotent: calling it again while the same project
 * is opening keeps the checkpoints and the timers, so a re-render or a late
 * version id can never restart the opening or re-flash the panel.
 *
 * @param {string} projectId
 * @param {{versionId?: string|null, minVisibleMs?: number, timeoutMs?: number}} [options]
 */
export function beginProjectOpening(projectId, options = {}) {
  const pid = normaliseId(projectId);
  if (!pid) {
    resetProjectOpening();
    return;
  }
  // Already opened in this session — no panel, and no new work.
  if (satisfiedProjects.has(pid)) return;

  const versionId = normaliseId(options.versionId);
  const entrySurface = options.entrySurface || null;
  const minVisibleMs = Number.isFinite(Number(options.minVisibleMs))
    ? Math.max(0, Number(options.minVisibleMs))
    : PROJECT_OPENING_MIN_VISIBLE_MS;
  const timeoutMs = Number.isFinite(Number(options.timeoutMs))
    ? Math.max(0, Number(options.timeoutMs))
    : PROJECT_OPENING_TIMEOUT_MS;

  if (state.projectId === pid && !state.closed) {
    // Late-arriving routing detail (the entry surface) is folded into the
    // opening already under way — it never restarts one.
    if (versionId !== state.versionId || (entrySurface && entrySurface !== state.entrySurface)) {
      state = { ...state, versionId, entrySurface: entrySurface || state.entrySurface };
      notify();
    }
    return;
  }

  clearTimers();
  state = {
    ...emptySnapshot(),
    projectId: pid,
    versionId,
    entrySurface,
    startedAt: Date.now(),
    minVisibleMs,
    timeoutMs,
    // A zero minimum means "no minimum was asked for" — never hold on a flag
    // whose timer was deliberately not scheduled.
    minVisibleElapsed: minVisibleMs === 0,
  };
  notify();

  if (minVisibleMs > 0) {
    minVisibleTimer = setTimeout(() => {
      minVisibleTimer = null;
      markOpeningMinVisibleElapsed();
    }, minVisibleMs);
  }
  scheduleOpeningTimeout(timeoutMs);
}

/** The panel's minimum visible time has passed. */
export function markOpeningMinVisibleElapsed() {
  if (!state.projectId || state.minVisibleElapsed) return;
  state = { ...state, minVisibleElapsed: true };
  closeIfResolved();
  notify();
}

/**
 * A stage did not confirm within the opening timeout.
 *
 * This deliberately does NOT resolve anything and does NOT open the project:
 * the still-restoring stage keeps gating, and the panel tells the designer it is
 * still restoring while offering Retry. Opening here is what used to show a
 * project whose bass authority and report sources had not been restored.
 */
export function markProjectOpeningTimedOut() {
  if (!state.projectId || state.closed || state.timedOut) return;
  state = { ...state, timedOut: true };
  notify();
}

/**
 * Re-run the opening reads after a stage failed to confirm. Every stage returns
 * to "restoring" (a resolved stage is re-read rather than trusted), the timeout
 * notice is cleared and re-armed, and the panel stays open.
 */
export function retryProjectOpening(options = {}) {
  if (!state.projectId || state.closed) return;
  const timeoutMs = Number.isFinite(Number(options.timeoutMs))
    ? Math.max(0, Number(options.timeoutMs))
    : state.timeoutMs;

  clearTimers();
  state = {
    ...state,
    checkpoints: {},
    timedOut: false,
    attempt: (Number(state.attempt) || 0) + 1,
    startedAt: Date.now(),
    timeoutMs,
    // The panel has already been read once, so a retry that resolves quickly may
    // close immediately rather than waiting out the minimum again.
    minVisibleElapsed: true,
  };
  notify();
  scheduleOpeningTimeout(timeoutMs);
}

/**
 * Open the project while a stage is still restoring — the explicit, warned
 * path offered on the panel once the wait has run long.
 *
 * Refused while any CRITICAL stage is still restoring: a project is never
 * released without its design, saved calculation authority or bass performance.
 * It is allowed only when the unresolved stages are supporting ones (report
 * sources, the target bank, pricing), which then appear as visible warnings.
 *
 * @returns {boolean} whether the project was opened
 */
export function continueProjectOpeningWithWarning() {
  if (!state.projectId || state.closed) return false;

  const pending = pendingOpeningCheckpointKeys(state);
  if (pending.length === 0) return false;
  if (pending.some((key) => criticalOpeningCheckpointKeys(state.entrySurface).includes(key))) {
    return false;
  }

  const checkpoints = { ...state.checkpoints };
  pending.forEach((key) => {
    checkpoints[key] = {
      state: OPENING_CHECKPOINT_STATE.UNAVAILABLE,
      outcome: OPENING_CHECKPOINT_OUTCOME.FAILED,
      detail: TIMEOUT_DETAIL,
      timedOut: true,
    };
  });

  state = { ...state, checkpoints, timedOut: true };
  closeIfResolved();
  notify();
  return state.closed === true;
}

export function resolveProjectOpeningCheckpoint(key, resolved) {
  resolveProjectOpeningCheckpoints({ [key]: resolved });
}

/**
 * Record what an authority reports for one or more checkpoints. Unknown keys are
 * ignored, and an unchanged value does not notify (this runs during a project
 * open, so it must stay quiet unless something genuinely moved).
 *
 * Each entry may state `outcome` (how a completed stage finished) and
 * `timedOut`. An entry that states neither is normalised from its state, so a
 * caller can never leave a stage in an unreadable limbo.
 *
 * @param {Record<string, {state: string, outcome?: string, detail?: string|null, timedOut?: boolean}>} entries
 */
export function resolveProjectOpeningCheckpoints(entries) {
  if (!entries || !state.projectId) return;

  let changed = false;
  const checkpoints = { ...state.checkpoints };

  Object.entries(entries).forEach(([key, value]) => {
    if (!value || !PROJECT_OPENING_CHECKPOINT_KEYS.includes(key)) return;
    const nextState = value.state === OPENING_CHECKPOINT_STATE.READY
      ? OPENING_CHECKPOINT_STATE.READY
      : value.state === OPENING_CHECKPOINT_STATE.PENDING
        ? OPENING_CHECKPOINT_STATE.PENDING
        : OPENING_CHECKPOINT_STATE.UNAVAILABLE;
    const next = {
      state: nextState,
      outcome: nextState === OPENING_CHECKPOINT_STATE.PENDING
        ? null
        : normaliseOutcome(value.outcome, nextState),
      detail: value.detail || null,
      ...(value.timedOut ? { timedOut: true } : {}),
    };
    const previous = checkpoints[key];
    if (
      previous
      && previous.state === next.state
      && previous.outcome === next.outcome
      && previous.detail === next.detail
      && (previous.timedOut === true) === (next.timedOut === true)
    ) return;
    checkpoints[key] = next;
    changed = true;
  });

  if (!changed) return;
  state = { ...state, checkpoints };
  closeIfResolved();
  notify();
}

/**
 * The project is open as soon as every checkpoint has a definite state and the
 * panel has been visible long enough to read.
 */
function closeIfResolved() {
  if (state.closed || !state.projectId) return;
  if (!state.minVisibleElapsed) return;
  if (pendingOpeningCheckpointKeys(state).length > 0) return;
  state = { ...state, closed: true };
  markSatisfied(state.projectId);
}

/**
 * The designer has seen the warnings this project opened with. The warnings stay
 * recorded (they are still the truth); only the strip is dismissed.
 */
export function dismissProjectOpeningWarnings(projectId) {
  const pid = normaliseId(projectId);
  if (!pid || normaliseId(state.projectId) !== pid || state.warningsDismissed) return;
  state = { ...state, warningsDismissed: true };
  notify();
}

/**
 * The one decision the opening panel needs — see projectOpeningReadiness.js for
 * the derivation itself. This wrapper supplies the session-scoped knowledge
 * (which projects have already opened in this browser) and keeps the signature
 * every consumer uses.
 *
 * Phases: 'restoring' while any stage is still resolving, 'still-restoring' once
 * the wait has run long, 'ready' when the project may be shown. The project
 * opens only when every stage has a definite outcome — or when the designer
 * explicitly continues past supporting stages that are still restoring.
 */
export function deriveOpeningReadiness(snapshot, projectId) {
  const pid = normaliseId(projectId);
  return deriveOpeningReadinessFor(snapshot, pid, {
    satisfied: !!pid && satisfiedProjects.has(pid),
  });
}

/** Reactive opening readiness for one project. */
export function useProjectOpening(projectId) {
  const snapshot = useSyncExternalStore(
    subscribeProjectOpening,
    getProjectOpening,
    getProjectOpening,
  );
  return useMemo(() => deriveOpeningReadiness(snapshot, projectId), [snapshot, projectId]);
}

/** Test-only: clear the opening state and the satisfied-project set. */
export function _resetProjectOpeningForTest() {
  clearTimers();
  state = emptySnapshot();
  satisfiedProjects.clear();
}