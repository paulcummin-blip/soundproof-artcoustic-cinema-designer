/**
 * proposalExportDiagnostics
 * -------------------------
 * The internal timing trace of ONE proposal export attempt (preview or issued).
 *
 * Why it exists: when export preparation fails, the only question that matters is
 * which operation held it up — the saved-version lookup, an animation frame, a
 * resource — and how long each stage actually took. This records exactly that,
 * in order, for the attempt that just ran.
 *
 * What it deliberately does NOT carry: any project content. Marks are operation
 * names, phases, durations and counts. No section text, no client or dealer name,
 * no file URL, no record id — so a trace can be read without exposing a client's
 * document.
 *
 * Where it goes: the last attempt's trace is kept in memory and published on
 * `window.__PROPOSAL_EXPORT_DIAGNOSTICS__` for inspection, and printed to the
 * console only when debugging is switched on for this browser
 * (`localStorage.b44_proposal_export_debug = '1'`, or `window.__PROPOSAL_EXPORT_DEBUG__`).
 * A designer is never shown any of it: they get one plain, actionable sentence.
 *
 * Pure logic, no React, no DOM access beyond those two guarded globals.
 */

const DEBUG_FLAG_KEY = 'b44_proposal_export_debug';

/** In-memory trace of the most recent attempt. */
let lastSnapshot = null;

function defaultNow() {
  return typeof performance !== 'undefined' && performance.now
    ? performance.now()
    : Date.now();
}

function round(value) {
  return Math.round(value * 10) / 10;
}

/** Whether this browser asked for export diagnostics on the console. */
export function exportDiagnosticsEnabled() {
  if (typeof window === 'undefined') return false;
  if (window.__PROPOSAL_EXPORT_DEBUG__ === true) return true;
  try {
    return window.localStorage?.getItem(DEBUG_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Open a trace for one export attempt.
 *
 * @param {{scope?: string, now?: Function}} options
 * @returns {Object} the recorder: start / done / expire / fail / elapsedMs / snapshot
 */
export function createExportDiagnostics({ scope = 'proposal-export', now = defaultNow } = {}) {
  const startedAt = now();
  const marks = [];
  let blockedBy = null;

  const push = (operation, phase, detail = null) => {
    marks.push({ operation, phase, atMs: round(now() - startedAt), detail });
  };

  return {
    /** The operation has begun. */
    start: (operation, detail) => push(operation, 'started', detail),
    /** The operation finished normally. */
    done: (operation, detail) => push(operation, 'completed', detail),
    /** The operation ran out of its budget — never recorded as success. */
    expire: (operation, detail) => push(operation, 'expired', detail),
    /** The operation failed, and nothing after it can complete. */
    fail: (operation, detail) => {
      if (!blockedBy) blockedBy = operation;
      push(operation, 'failed', detail);
    },
    elapsedMs: () => round(now() - startedAt),
    snapshot: () => ({
      scope,
      totalMs: round(now() - startedAt),
      blockedBy,
      marks: marks.map((mark) => ({ ...mark })),
    }),
  };
}

/**
 * Keep a trace as the last export attempt's, and echo it to the console when
 * debugging is enabled. Safe to call with nothing.
 */
export function recordExportDiagnostics(snapshot, { label = null } = {}) {
  if (!snapshot) return null;
  lastSnapshot = {
    ...snapshot,
    label,
    recordedAt: new Date().toISOString(),
  };
  if (typeof window !== 'undefined') {
    window.__PROPOSAL_EXPORT_DIAGNOSTICS__ = lastSnapshot;
    if (exportDiagnosticsEnabled()) console.debug('[proposal-export]', lastSnapshot);
  }
  return lastSnapshot;
}

/** The most recent attempt's trace, for inspection or a test. */
export function readLastExportDiagnostics() {
  return lastSnapshot;
}

export default createExportDiagnostics;