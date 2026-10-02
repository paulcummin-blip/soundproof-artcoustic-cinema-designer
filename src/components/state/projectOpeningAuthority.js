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
// Every checkpoint ends in a definite state: ready, or unavailable with a
// reason. There is no third outcome and no silent fallthrough.
//
// Read-only: nothing here calculates, recalculates, generates a report, starts a
// worker or writes to the database. It only records what other authorities
// report.

import { useMemo, useSyncExternalStore } from "react";

export const OPENING_CHECKPOINT_STATE = Object.freeze({
  /** Still resolving — the panel holds. */
  PENDING: "pending",
  /** Resolved and usable. */
  READY: "ready",
  /** Resolved as not usable, with a reason (missing, stale, not generated…). */
  UNAVAILABLE: "unavailable",
});

/**
 * The progress lines the opening panel shows, in order. Deliberately short: the
 * panel is reassurance, not a status console.
 */
export const PROJECT_OPENING_LINES = Object.freeze([
  { key: "roomSeating", label: "Room and seating" },
  { key: "speakerLayout", label: "Speaker layout" },
  { key: "rp22", label: "RP22 / RP23 results" },
  { key: "bass", label: "Bass performance" },
  { key: "bassTargetBank", label: "Bass target bank" },
  { key: "visualReport", label: "Visual Report" },
  { key: "technicalReport", label: "Technical Report" },
  { key: "proposalSource", label: "Proposal source data" },
  { key: "pricing", label: "Pricing" },
]);

/**
 * Checkpoints that gate closure but are not drawn as progress lines — project
 * metadata, the active version, seat priorities and the autosave baseline are
 * preconditions for a coherent project, not steps the designer needs to watch.
 */
const INTERNAL_CHECKPOINT_KEYS = Object.freeze([
  "metadata",
  "activeVersion",
  "seatPriorities",
  "autosaveBaseline",
]);

export const PROJECT_OPENING_CHECKPOINT_KEYS = Object.freeze([
  ...INTERNAL_CHECKPOINT_KEYS,
  ...PROJECT_OPENING_LINES.map((line) => line.key),
]);

/** The panel never flashes: it stays for at least this long. */
export const PROJECT_OPENING_MIN_VISIBLE_MS = 900;

/**
 * A dependency that will not confirm within this window is reported as not
 * confirmed and the project opens anyway. An unknown state must never hold the
 * project hostage.
 */
export const PROJECT_OPENING_TIMEOUT_MS = 8000;

const TIMEOUT_DETAIL =
  "Not confirmed in time — the project opened with this step still resolving.";

const emptySnapshot = () => ({
  projectId: null,
  versionId: null,
  startedAt: 0,
  minVisibleMs: PROJECT_OPENING_MIN_VISIBLE_MS,
  timeoutMs: PROJECT_OPENING_TIMEOUT_MS,
  minVisibleElapsed: false,
  closed: false,
  timedOut: false,
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

const normaliseId = (value) => (value == null || value === "" ? null : String(value));

const isPending = (entry) =>
  (entry?.state ?? OPENING_CHECKPOINT_STATE.PENDING) === OPENING_CHECKPOINT_STATE.PENDING;

function pendingKeys(snapshot) {
  return PROJECT_OPENING_CHECKPOINT_KEYS.filter((key) => isPending(snapshot.checkpoints?.[key]));
}

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
  const minVisibleMs = Number.isFinite(Number(options.minVisibleMs))
    ? Math.max(0, Number(options.minVisibleMs))
    : PROJECT_OPENING_MIN_VISIBLE_MS;
  const timeoutMs = Number.isFinite(Number(options.timeoutMs))
    ? Math.max(0, Number(options.timeoutMs))
    : PROJECT_OPENING_TIMEOUT_MS;

  if (state.projectId === pid && !state.closed) {
    if (versionId !== state.versionId) state = { ...state, versionId };
    return;
  }

  clearTimers();
  state = {
    ...emptySnapshot(),
    projectId: pid,
    versionId,
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
  if (timeoutMs > 0) {
    timeoutTimer = setTimeout(() => {
      timeoutTimer = null;
      expirePendingOpeningCheckpoints();
    }, timeoutMs);
  }
}

/** The panel's minimum visible time has passed. */
export function markOpeningMinVisibleElapsed() {
  if (!state.projectId || state.minVisibleElapsed) return;
  state = { ...state, minVisibleElapsed: true };
  closeIfResolved();
  notify();
}

/**
 * A dependency did not confirm within the opening timeout. Every still-pending
 * checkpoint becomes a definite "not confirmed" state, so the project always
 * opens with a known state rather than hanging on an unknown one.
 */
export function expirePendingOpeningCheckpoints() {
  if (!state.projectId) return;
  const pending = pendingKeys(state);
  const checkpoints = { ...state.checkpoints };
  pending.forEach((key) => {
    checkpoints[key] = {
      state: OPENING_CHECKPOINT_STATE.UNAVAILABLE,
      detail: TIMEOUT_DETAIL,
      timedOut: true,
    };
  });
  state = {
    ...state,
    checkpoints,
    timedOut: pending.length > 0 || state.timedOut,
    closed: true,
  };
  markSatisfied(state.projectId);
  notify();
}

export function resolveProjectOpeningCheckpoint(key, resolved) {
  resolveProjectOpeningCheckpoints({ [key]: resolved });
}

/**
 * Record what an authority reports for one or more checkpoints. Unknown keys are
 * ignored, and an unchanged value does not notify (this runs during a project
 * open, so it must stay quiet unless something genuinely moved).
 *
 * @param {Record<string, {state: string, detail?: string|null}>} entries
 */
export function resolveProjectOpeningCheckpoints(entries) {
  if (!entries || !state.projectId) return;

  let changed = false;
  const checkpoints = { ...state.checkpoints };

  Object.entries(entries).forEach(([key, value]) => {
    if (!value || !PROJECT_OPENING_CHECKPOINT_KEYS.includes(key)) return;
    const next = {
      state: value.state === OPENING_CHECKPOINT_STATE.READY
        ? OPENING_CHECKPOINT_STATE.READY
        : value.state === OPENING_CHECKPOINT_STATE.PENDING
          ? OPENING_CHECKPOINT_STATE.PENDING
          : OPENING_CHECKPOINT_STATE.UNAVAILABLE,
      detail: value.detail || null,
      ...(value.timedOut ? { timedOut: true } : {}),
    };
    const previous = checkpoints[key];
    if (previous && previous.state === next.state && previous.detail === next.detail) return;
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
  if (pendingKeys(state).length > 0) return;
  state = { ...state, closed: true };
  markSatisfied(state.projectId);
}

/** The nine progress lines, with the current state of each. */
export function openingProgressLines(snapshot, projectId) {
  const pid = normaliseId(projectId);
  const active = normaliseId(snapshot?.projectId) === pid ? (snapshot?.checkpoints || {}) : {};
  return PROJECT_OPENING_LINES.map((line) => ({
    key: line.key,
    label: line.label,
    state: active[line.key]?.state || OPENING_CHECKPOINT_STATE.PENDING,
    detail: active[line.key]?.detail || null,
  }));
}

/**
 * The one decision the opening panel needs.
 *
 * @returns {{holding: boolean, begun: boolean, pending: string[], closed: boolean,
 *            timedOut: boolean, minVisibleElapsed: boolean, lines: Array}}
 */
export function deriveOpeningReadiness(snapshot, projectId) {
  const pid = normaliseId(projectId);
  const lines = openingProgressLines(snapshot, pid);

  if (!pid) {
    return { holding: false, begun: false, pending: [], closed: true, timedOut: false, minVisibleElapsed: true, lines };
  }

  // Opened earlier in this session: never show the panel again.
  if (satisfiedProjects.has(pid)) {
    return { holding: false, begun: false, pending: [], closed: true, timedOut: false, minVisibleElapsed: true, lines };
  }

  // A project is selected but its opening has not begun yet. Hold, so not even
  // one frame of the previous or partially-restored state can appear.
  if (normaliseId(snapshot?.projectId) !== pid) {
    return {
      holding: true,
      begun: false,
      pending: [...PROJECT_OPENING_CHECKPOINT_KEYS],
      closed: false,
      timedOut: false,
      minVisibleElapsed: false,
      lines,
    };
  }

  const pending = pendingKeys(snapshot);
  return {
    holding: !snapshot.closed && (!snapshot.minVisibleElapsed || pending.length > 0),
    begun: true,
    pending,
    closed: snapshot.closed === true,
    timedOut: snapshot.timedOut === true,
    minVisibleElapsed: snapshot.minVisibleElapsed === true,
    lines,
  };
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