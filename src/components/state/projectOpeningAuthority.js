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
// calculated yet, not applicable, out of date, or failed with a reason. "Still
// restoring" (and hydrating/calculating/pending/checking) is NOT a completed
// stage, so a stage that never confirms keeps the panel open; it is never
// silently resolved into a finished project. When the wait runs long the panel
// says so and offers Retry, and it will only continue on an explicit, warned
// decision — and never past a structural stage.
//
// THE release rule lives in projectRestoreChecklist.js: the panel closes exactly
// when every restore row is terminal and every blocking row is in an allowed
// terminal state. Time is never a release condition — the minimum visible time
// can only hold the panel longer.
//
// Read-only: nothing here calculates, recalculates, generates a report, starts a
// worker or writes to the database. It only records what other authorities
// report.

import { useMemo, useSyncExternalStore } from "react";

import {
  OPENING_CHECKPOINT_OUTCOME,
  OPENING_CHECKPOINT_STATE,
  nonBypassableOpeningCheckpointKeys,
  normaliseId,
  normaliseOutcome,
} from "./projectOpeningStages.js";
import {
  PROJECT_OPENING_CHECKPOINT_KEYS,
  deriveOpeningReadinessFor,
  pendingOpeningCheckpointKeys,
} from "./projectOpeningReadiness.js";
import {
  buildRestoreChecklist,
  deriveRestoreRelease,
} from "./projectRestoreChecklist.js";

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
  nonBypassableOpeningCheckpointKeys,
  openingCheckpointStage,
  openingEntrySurfaceForPath,
  savedBassCheckpointKeys,
} from "./projectOpeningStages.js";
export {
  PROJECT_OPENING_CHECKPOINT_KEYS,
  PROJECT_OPENING_LINES,
  openingCheckpointWarnings,
  openingProgressLines,
  pendingOpeningCheckpointKeys,
} from "./projectOpeningReadiness.js";
export {
  RESTORE_ALLOWED_BLOCKING_TERMINAL_STATUSES,
  RESTORE_NON_TERMINAL_STATUSES,
  RESTORE_ROWS,
  RESTORE_STATUS,
  RESTORE_STATUS_LABEL,
  RESTORE_TERMINAL_STATUSES,
  blockingRestoreRowKeys,
  buildRestoreChecklist,
  deriveRestoreRelease,
  isRestoreRowBlocking,
  isRestoreStatusTerminal,
} from "./projectRestoreChecklist.js";

/** The panel never flashes: it stays for at least this long. */
export const PROJECT_OPENING_MIN_VISIBLE_MS = 900;

/**
 * A dependency that will not confirm within this window stops being waited on
 * silently: the panel says it is still restoring and offers Retry. It never
 * opens the project by itself — an unresolved stage is not a completed stage.
 * A still-unresolved structural stage cannot be continued past at all.
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
 * Refused while a STRUCTURAL stage is still restoring: without the project
 * record, its active version or its saved geometry there is no project to open,
 * so this offers nothing to continue past. Everything else may be continued past
 * on an explicit decision: each unresolved row is then recorded as FAILED with a
 * visible warning, which is a terminal state — the panel closes because the
 * checklist finished, not because a timer ran out.
 *
 * @returns {boolean} whether the project was opened
 */
export function continueProjectOpeningWithWarning() {
  if (!state.projectId || state.closed) return false;

  const pending = pendingOpeningCheckpointKeys(state);
  if (pending.length === 0) return false;
  if (pending.some((key) => nonBypassableOpeningCheckpointKeys().includes(key))) {
    return false;
  }

  const checkpoints = { ...state.checkpoints };
  pending.forEach((key) => {
    checkpoints[key] = {
      state: OPENING_CHECKPOINT_STATE.UNAVAILABLE,
      outcome: OPENING_CHECKPOINT_OUTCOME.FAILED,
      detail: TIMEOUT_DETAIL,
      timedOut: true,
      safeToContinue: true,
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
 * Each entry may state `outcome` (how a completed stage finished), `timedOut`,
 * `status` (the precise non-terminal state, e.g. hydrating or calculating) and
 * `blocking` (whether this stage holds the release for THIS version — the
 * saved-bass rows can only be answered by the resolver). An entry that states
 * none of them is normalised from its state, so a caller can never leave a stage
 * in an unreadable limbo.
 *
 * @param {Record<string, {state: string, outcome?: string, detail?: string|null,
 *   timedOut?: boolean, status?: string, blocking?: boolean, safeToContinue?: boolean}>} entries
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
      // A precise non-terminal state is only meaningful while the stage is
      // genuinely still resolving.
      ...(nextState === OPENING_CHECKPOINT_STATE.PENDING && value.status ? { status: value.status } : {}),
      ...(typeof value.blocking === "boolean" ? { blocking: value.blocking } : {}),
      ...(value.safeToContinue === true ? { safeToContinue: true } : {}),
    };
    const previous = checkpoints[key];
    if (
      previous
      && previous.state === next.state
      && previous.outcome === next.outcome
      && previous.detail === next.detail
      && previous.status === next.status
      && previous.blocking === next.blocking
      && (previous.timedOut === true) === (next.timedOut === true)
      && (previous.safeToContinue === true) === (next.safeToContinue === true)
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
 * Open the project — and only when the restore checklist says so.
 *
 * The release decision is the checklist's, not a timer's: every row must have
 * reached a terminal state, and every blocking row must be in an allowed terminal
 * state (a blocking failure needs the designer's explicit, warned decision — see
 * continueProjectOpeningWithWarning). A row still restoring therefore keeps the
 * project behind the panel, which is what stops a report or a proposal being
 * opened on a half-restored authority.
 *
 * "Nothing saved for this stage yet" is terminal: an unfinished project opens so
 * the designer can finish it, and its own surfaces say what is missing.
 */
function closeIfResolved() {
  if (state.closed || !state.projectId) return;
  if (!state.minVisibleElapsed) return;
  const checklist = buildRestoreChecklist({ snapshot: state, projectId: state.projectId });
  const { release } = deriveRestoreRelease(checklist.rows);
  if (!release) return;
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
 * Phases: 'restoring' while the restore checklist still has a non-terminal row,
 * 'still-restoring' once that wait runs long, and 'ready' when the checklist has
 * released the project. The release rule itself lives in
 * projectRestoreChecklist.js — if a row still says Restoring, the project is not
 * loaded and the panel stays up.
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