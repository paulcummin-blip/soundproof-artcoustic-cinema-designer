// projectRestoreChecklist.js
// --------------------------
// THE single restore checklist the project opening panel is gated on.
//
// The panel is not a splash screen: it is the visible form of this checklist. One
// row per thing that must be restored before a project may be handed to the pages
// that read it. The panel may close ONLY when every row has reached a terminal
// state — "Restoring" is not terminal, so a row that still says Restoring keeps
// the project behind the panel. That is what stops a report or a proposal being
// opened on a half-restored authority.
//
//   terminal        ready · loaded · complete · current · stale · not-generated ·
//                   not-calculated · not-applicable · failed (non-blocking, warned)
//   non-terminal    restoring · loading · hydrating · calculating · pending ·
//                   unknown · checking
//
// Two things decide release, and nothing else does:
//
//   1. every row is terminal, and
//   2. every BLOCKING row is in an allowed terminal state — a blocking row that
//      FAILED holds the panel, with no way past it: the project opens when the
//      restore succeeds, or not at all. There is no accepted-failure path.
//
// There is no timeout, no route-ready signal and no shell-mounted signal in this
// decision. Time can only ever hold the panel LONGER (the minimum visible time),
// or — after a long, progress-free stall — turn a stalled row into a visible
// FAILURE (projectOpeningAuthority.js); it can never release the panel.
//
// Pure: no React, no state, no side effects, no database access. It reads the
// opening snapshot and answers.

import {
  OPENING_CHECKPOINT_OUTCOME,
  OPENING_CHECKPOINT_STATE,
  criticalOpeningCheckpointKeys,
  normaliseId,
  openingCheckpointStage,
} from "./projectOpeningStages.js";

/** The complete restore-status vocabulary. */
export const RESTORE_CHECKLIST_VERSION = "core-design-v1";

export const RESTORE_STATUS = Object.freeze({
  // ── terminal ────────────────────────────────────────────────────────────
  READY: "ready",
  LOADED: "loaded",
  COMPLETE: "complete",
  CURRENT: "current",
  STALE: "stale",
  NOT_GENERATED: "not-generated",
  NOT_CALCULATED: "not-calculated",
  NOT_APPLICABLE: "not-applicable",
  FAILED: "failed",
  // ── non-terminal ────────────────────────────────────────────────────────
  RESTORING: "restoring",
  LOADING: "loading",
  HYDRATING: "hydrating",
  CALCULATING: "calculating",
  PENDING: "pending",
  UNKNOWN: "unknown",
  CHECKING: "checking",
});

/** The states a row has FINISHED in. Only these may release the panel. */
export const RESTORE_TERMINAL_STATUSES = Object.freeze([
  RESTORE_STATUS.READY,
  RESTORE_STATUS.LOADED,
  RESTORE_STATUS.COMPLETE,
  RESTORE_STATUS.CURRENT,
  RESTORE_STATUS.STALE,
  RESTORE_STATUS.NOT_GENERATED,
  RESTORE_STATUS.NOT_CALCULATED,
  RESTORE_STATUS.NOT_APPLICABLE,
  RESTORE_STATUS.FAILED,
]);

/** The states a row is still WAITING in. None of these may release the panel. */
export const RESTORE_NON_TERMINAL_STATUSES = Object.freeze([
  RESTORE_STATUS.RESTORING,
  RESTORE_STATUS.LOADING,
  RESTORE_STATUS.HYDRATING,
  RESTORE_STATUS.CALCULATING,
  RESTORE_STATUS.PENDING,
  RESTORE_STATUS.UNKNOWN,
  RESTORE_STATUS.CHECKING,
]);

/**
 * Terminal states a BLOCKING row may release on. A blocking row that FAILED is
 * deliberately absent, and nothing can accept one: a required row that could not
 * be restored holds the project until it is.
 */
export const RESTORE_ALLOWED_BLOCKING_TERMINAL_STATUSES = Object.freeze(
  RESTORE_TERMINAL_STATUSES.filter((status) => status !== RESTORE_STATUS.FAILED),
);

/** The words the panel shows for each status. */
export const RESTORE_STATUS_LABEL = Object.freeze({
  [RESTORE_STATUS.READY]: "Ready",
  [RESTORE_STATUS.LOADED]: "Loaded",
  [RESTORE_STATUS.COMPLETE]: "Complete",
  [RESTORE_STATUS.CURRENT]: "Current",
  [RESTORE_STATUS.STALE]: "Out of date",
  [RESTORE_STATUS.NOT_GENERATED]: "Not generated yet",
  [RESTORE_STATUS.NOT_CALCULATED]: "Not calculated yet",
  [RESTORE_STATUS.NOT_APPLICABLE]: "Not applicable",
  [RESTORE_STATUS.FAILED]: "Failed",
  [RESTORE_STATUS.RESTORING]: "Restoring",
  [RESTORE_STATUS.LOADING]: "Loading",
  [RESTORE_STATUS.HYDRATING]: "Hydrating",
  [RESTORE_STATUS.CALCULATING]: "Calculating",
  [RESTORE_STATUS.PENDING]: "Pending",
  [RESTORE_STATUS.UNKNOWN]: "Unknown",
  [RESTORE_STATUS.CHECKING]: "Checking",
});

/**
 * The rows, in the order the panel draws them. `displayed: false` rows are real
 * tracked preconditions that gate the release but are not progress lines — the
 * designer does not need to watch the project record load.
 *
 * Blocking is NOT declared here: it is decided by the opening vocabulary
 * (projectOpeningStages.js) plus the row's own resolved facts, so there is one
 * definition of what blocks the open.
 */
export const RESTORE_ROWS = Object.freeze([
  { key: "metadata", label: "Project record", displayed: false, source: "project hydration store" },
  { key: "activeVersion", label: "Active design version", displayed: false, source: "project hydration store" },
  { key: "roomSeating", label: "Room and seating", source: "saved design state" },
  { key: "speakerLayout", label: "Speaker layout", source: "saved design state" },
  { key: "seatPriorities", label: "Seat priorities", displayed: false, source: "saved design state" },
]);

export const isRestoreStatusTerminal = (status) => RESTORE_TERMINAL_STATUSES.includes(status);

export const restoreStatusLabel = (status) => RESTORE_STATUS_LABEL[status] || "Restoring";

/**
 * The status of one row, from the checkpoint the resolver recorded. Terminal
 * states come from the checkpoint's own state/outcome pair; the precise
 * non-terminal states (hydrating, calculating, …) may be stated by the resolver
 * so the panel never says "Restoring" for work that is doing something else.
 */
function restoreStatusFor(entry) {
  if (!entry) return RESTORE_STATUS.RESTORING;

  if (entry.state === OPENING_CHECKPOINT_STATE.READY) return RESTORE_STATUS.READY;

  if (entry.state === OPENING_CHECKPOINT_STATE.PENDING) {
    return RESTORE_NON_TERMINAL_STATUSES.includes(entry.status)
      ? entry.status
      : RESTORE_STATUS.RESTORING;
  }

  switch (entry.outcome) {
    case OPENING_CHECKPOINT_OUTCOME.READY:
      return RESTORE_STATUS.READY;
    case OPENING_CHECKPOINT_OUTCOME.STALE:
      return RESTORE_STATUS.STALE;
    case OPENING_CHECKPOINT_OUTCOME.FAILED:
      return RESTORE_STATUS.FAILED;
    case OPENING_CHECKPOINT_OUTCOME.NOT_CALCULATED:
      return RESTORE_STATUS.NOT_CALCULATED;
    case OPENING_CHECKPOINT_OUTCOME.NOT_APPLICABLE:
      return RESTORE_STATUS.NOT_APPLICABLE;
    case OPENING_CHECKPOINT_OUTCOME.NOT_GENERATED:
      return RESTORE_STATUS.NOT_GENERATED;
    default:
      return RESTORE_STATUS.NOT_GENERATED;
  }
}

/**
 * Does this row block the release?
 *
 * A row that states its own answer wins: only the resolver knows whether this
 * version actually has saved bass to restore. Where it has not stated one, the
 * opening vocabulary decides — and the saved-bass rows stay blocking until the
 * resolver says otherwise, because waiting to learn is never worse than opening
 * half-restored.
 */
export function isRestoreRowBlocking(key, context = {}) {
  const stated = context.entry?.blocking;
  if (typeof stated === "boolean") return stated;
  return openingCheckpointStage(key, context.entrySurface || null) === "critical";
}

/**
 * The checklist for a project opening.
 *
 * @param {Object} params
 * @param {Object} params.snapshot the opening authority snapshot
 * @param {string|null} params.projectId the project being opened
 * @returns {{projectId:string|null, begun:boolean, entrySurface:string|null, attempt:number, rows:Array}}
 */
export function buildRestoreChecklist({ snapshot, projectId } = {}) {
  const pid = normaliseId(projectId);
  const begun = !!pid && normaliseId(snapshot?.projectId) === pid;
  const checkpoints = begun ? (snapshot?.checkpoints || {}) : {};
  const entrySurface = begun ? (snapshot?.entrySurface || null) : null;

  const rows = RESTORE_ROWS.map((definition) => {
    const entry = checkpoints[definition.key] || null;
    const status = restoreStatusFor(entry);
    const terminal = isRestoreStatusTerminal(status);
    return {
      key: definition.key,
      label: definition.label,
      displayed: definition.displayed !== false,
      source: definition.source,
      status,
      terminal,
      blocking: isRestoreRowBlocking(definition.key, { entry, entrySurface }),
      timedOut: entry?.timedOut === true,
      message: entry?.detail || null,
    };
  });

  return {
    projectId: pid || null,
    begun,
    entrySurface,
    attempt: Number(snapshot?.attempt) || 0,
    rows,
  };
}

/**
 * THE release decision. The panel may close exactly when this says so.
 *
 * @returns {{release:boolean, nonTerminalRows:Array, blockingRows:Array,
 *   blockingFailures:Array, blockedRows:Array, holdLabels:string[],
 *   blockingLabels:string[], reason:string|null}}
 */
export function deriveRestoreRelease(checklistOrRows) {
  const rows = Array.isArray(checklistOrRows)
    ? checklistOrRows
    : (checklistOrRows?.rows || []);

  const nonTerminalRows = rows.filter((row) => !row.terminal);
  const blockingRows = rows.filter((row) => row.blocking);
  // A blocking row that finished anywhere other than an allowed state — in
  // practice a failure. Nothing accepts one: it holds until it is restored.
  const blockedRows = blockingRows.filter((row) => (
    row.terminal && !RESTORE_ALLOWED_BLOCKING_TERMINAL_STATUSES.includes(row.status)
  ));
  const blockingFailures = blockingRows.filter((row) => row.status === RESTORE_STATUS.FAILED);

  const release = nonTerminalRows.length === 0 && blockedRows.length === 0;
  const holdRows = [...nonTerminalRows, ...blockedRows];
  const holdLabels = [...new Set(holdRows.map((row) => row.label))];

  return {
    release,
    nonTerminalRows,
    blockingRows,
    blockingFailures,
    blockedRows,
    holdLabels,
    blockingLabels: blockingRows.map((row) => row.label),
    reason: release
      ? null
      : blockedRows.length > 0 && nonTerminalRows.length === 0
        ? `A required step could not be restored: ${holdLabels.join(", ")}.`
        : `Still restoring: ${holdLabels.join(", ")}.`,
  };
}

/** The project-open gate is route-independent and owns core design only. */
export const blockingRestoreRowKeys = () => criticalOpeningCheckpointKeys();

export default buildRestoreChecklist;