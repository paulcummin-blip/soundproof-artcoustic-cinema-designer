// projectOpeningReadiness.js
// --------------------------
// The pure reader over an opening snapshot: the progress lines the panel draws,
// the warnings the project opens with, and the ONE decision the panel needs.
//
// Split out of projectOpeningAuthority.js (which owns the state machine) so the
// rule "when may the panel close?" is readable and testable on its own. Nothing
// here holds state, writes to the database or calculates anything: it reads a
// snapshot and answers.
//
// The rule, in full:
//   · editable design and commercial-save authorities must be restored
//   · calculated/output stages never prevent an unfinished project opening
//   · reports and proposals enforce completeness inside their own surfaces
//   · the session knowledge of an already-opened project is honoured

import {
  OPENING_CHECKPOINT_STATE,
  OPENING_PHASE,
  WARNING_OUTCOMES,
  normaliseId,
} from "./projectOpeningStages.js";
import {
  RESTORE_ROWS,
  RESTORE_STATUS,
  buildRestoreChecklist,
  deriveRestoreRelease,
} from "./projectRestoreChecklist.js";

/**
 * The progress lines the opening panel shows, in order. Deliberately short: the
 * panel is reassurance, not a status console. Derived from the restore checklist
 * so the panel and the release decision can never name different rows.
 */
export const PROJECT_OPENING_LINES = Object.freeze(
  RESTORE_ROWS
    .filter((row) => row.displayed !== false)
    .map((row) => Object.freeze({ key: row.key, label: row.label, source: row.source })),
);

/** Every checklist row — displayed and internal — in release order. */
export const PROJECT_OPENING_CHECKPOINT_KEYS = Object.freeze(
  RESTORE_ROWS.map((row) => row.key),
);

/**
 * One checklist row as a panel line. The panel is given the row's terminal flag,
 * its blocking flag and its exact status, so it can never render "Restoring" for
 * a row that has finished — or hide a row that is holding the project.
 */
function restoreRowToLine(row) {
  return {
    key: row.key,
    label: row.label,
    // The state vocabulary existing consumers read.
    state: !row.terminal
      ? OPENING_CHECKPOINT_STATE.PENDING
      : row.status === RESTORE_STATUS.FAILED
        ? OPENING_CHECKPOINT_STATE.UNAVAILABLE
        : OPENING_CHECKPOINT_STATE.READY,
    status: row.status,
    terminal: row.terminal,
    blocking: row.blocking,
    source: row.source,
    outcome: row.terminal ? row.status : null,
    timedOut: row.timedOut === true,
    detail: row.message,
  };
}

/** Every stage still restoring, in checklist order. */
export function pendingOpeningCheckpointKeys(snapshot, projectId = snapshot?.projectId) {
  return buildRestoreChecklist({ snapshot, projectId })
    .rows.filter((row) => !row.terminal)
    .map((row) => row.key);
}

/** The progress lines, with the status, terminality and blocking of each. */
export function openingProgressLines(snapshot, projectId) {
  return buildRestoreChecklist({ snapshot, projectId })
    .rows.filter((row) => row.displayed)
    .map(restoreRowToLine);
}

/**
 * The completed stages the designer must be told about: anything that was never
 * confirmed, anything out of date, and anything that failed. A stage with
 * nothing saved yet is a normal state, not a warning.
 */
export function openingCheckpointWarnings(snapshot, projectId) {
  const pid = normaliseId(projectId);
  if (!pid || normaliseId(snapshot?.projectId) !== pid) return [];
  if (snapshot?.warningsDismissed === true) return [];

  const entries = snapshot?.checkpoints || {};
  return PROJECT_OPENING_LINES
    .filter((line) => {
      const entry = entries[line.key];
      if (!entry || entry.state === OPENING_CHECKPOINT_STATE.PENDING) return false;
      if (entry.timedOut === true) return true;
      return WARNING_OUTCOMES.includes(entry.outcome);
    })
    .map((line) => ({
      key: line.key,
      label: line.label,
      outcome: entries[line.key]?.outcome || null,
      detail: entries[line.key]?.detail || null,
      timedOut: entries[line.key]?.timedOut === true,
    }));
}

/**
 * The one decision the opening panel needs.
 *
 * `phase` is 'restoring' while an opening-critical stage is resolving, and
 * 'still-restoring' once the wait has run long enough to be reported — at 30 s the
 * panel says the restore is taking longer than usual, at 90 s it offers Retry, and a
 * row is only recorded as failed after a much longer, progress-free stall (see
 * projectOpeningWaitPolicy.js). 'ready' means the project may be shown. Live work
 * that is not a restore row (a bass analysis running for an open project) continues
 * in the background; it is gated by the report/proposal surfaces that consume it.
 *
 * @param {Object} snapshot the opening snapshot
 * @param {string|null} projectId the project being opened
 * @param {{satisfied?: boolean}} [context] whether this project already opened
 *        in this browser session
 */
export function deriveOpeningReadinessFor(snapshot, projectId, context = {}) {
  const pid = normaliseId(projectId);
  const checklist = buildRestoreChecklist({ snapshot, projectId: pid });
  const release = deriveRestoreRelease(checklist.rows);
  const lines = checklist.rows.filter((row) => row.displayed).map(restoreRowToLine);

  const nonTerminalRows = checklist.rows.filter((row) => !row.terminal);
  const base = {
    release: release.release,
    checklist: checklist.rows,
    blockingKeys: release.blockingRows.map((row) => row.key),
    holdLabels: release.holdLabels,
    releaseReason: release.reason,
    entrySurface: checklist.entrySurface,
    attempt: checklist.attempt,
    lines,
    warnings: openingCheckpointWarnings(snapshot, pid),
    begun: checklist.begun,
  };

  if (!pid) {
    return {
      ...base, holding: false, pending: [], pendingCritical: [], pendingSupporting: [],
      pendingLabels: [], closed: true, timedOut: false, slow: false,
      retryAvailable: false, minVisibleElapsed: true,
      phase: OPENING_PHASE.IDLE, checklist: [], release: false,
    };
  }

  // Opened earlier in this session: never show the panel again.
  if (context.satisfied === true) {
    return {
      ...base, holding: false, pending: [], pendingCritical: [], pendingSupporting: [],
      pendingLabels: [], closed: true, timedOut: false, slow: false,
      retryAvailable: false, minVisibleElapsed: true,
      phase: OPENING_PHASE.READY,
    };
  }

  // The minimum visible time can only ever hold the panel LONGER than the
  // checklist's own answer — it is never a reason to close. A project whose
  // opening has not begun yet cannot take credit for the previous project's.
  const minVisibleElapsed = checklist.begun && snapshot?.minVisibleElapsed === true;
  const holding = !release.release || !minVisibleElapsed;
  const timedOut = checklist.begun && snapshot?.timedOut === true;
  const slow = checklist.begun && snapshot?.slow === true;
  // Retry is offered on the authority's own flag: a real failure earns it straight
  // away, a long wait earns it at 90 s, and a slow-but-working restore never does.
  const retryAvailable = checklist.begun
    && (snapshot?.retryAvailable === true || timedOut);

  return {
    ...base,
    holding,
    pending: nonTerminalRows.map((row) => row.key),
    pendingCritical: nonTerminalRows.filter((row) => row.blocking).map((row) => row.key),
    pendingSupporting: nonTerminalRows.filter((row) => !row.blocking).map((row) => row.key),
    pendingLabels: nonTerminalRows.map((row) => row.label),
    closed: !holding,
    timedOut,
    slow,
    retryAvailable,
    minVisibleElapsed,
    // The panel reports a long wait — it never treats one as a failure, and it shows
    // the message without an offer while the rows are still making progress.
    phase: !holding
      ? OPENING_PHASE.READY
      : (slow || timedOut || retryAvailable)
        ? OPENING_PHASE.STILL_RESTORING
        : OPENING_PHASE.RESTORING,
  };
}