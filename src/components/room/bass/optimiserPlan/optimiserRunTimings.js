// optimiserRunTimings.js
// ---------------------------------------------------------------------------
// DURABLE RUN TIMING INSTRUMENTATION for the Bass Optimiser.
//
// A run publishes lightweight timestamps as it moves through its own handoff,
// so a run that took far longer than it should can be diagnosed from the saved
// record instead of guessed at afterwards:
//
//   run start                    calculation complete
//   terminal verdict ready       save started
//   save completed               publication started
//   publication completed        UI-ready authority written
//   publication retry count
//
// WHAT THIS MODULE IS NOT:
//   • NOT a progress authority: it never states a stage, a job count or a
//     percentage. The engine's own published progress owns what the run is
//     doing (optimiserRunProgressAuthority.js).
//   • NOT an acoustic authority: it records when things happened, never what
//     was calculated, ranked or graded. It changes no search, no P19/P20 maths,
//     no materiality rule and no candidate count.
//   • NOT designer-facing: the rows it builds are read only inside the
//     developer diagnostics level, behind the admin debug gate.
//
// It records only what actually happened: a milestone that was never reached
// has no timestamp, and a duration between two milestones that did not both
// happen stays unknown rather than becoming zero.
// ---------------------------------------------------------------------------

import { useSyncExternalStore } from "react";

/** The milestones a run records, in the order they happen. */
export const RUN_TIMING = Object.freeze({
  RUN_START: "run_start",
  CALCULATION_COMPLETE: "calculation_complete",
  TERMINAL_VERDICT_READY: "terminal_verdict_ready",
  SAVE_STARTED: "save_started",
  SAVE_COMPLETED: "save_completed",
  PUBLICATION_STARTED: "publication_started",
  PUBLICATION_COMPLETED: "publication_completed",
  UI_READY_WRITTEN: "ui_ready_written",
});

/** The milestone labels, in words — developer diagnostics only. */
export const RUN_TIMING_LABEL = Object.freeze({
  [RUN_TIMING.RUN_START]: "Run started",
  [RUN_TIMING.CALCULATION_COMPLETE]: "Calculation complete",
  [RUN_TIMING.TERMINAL_VERDICT_READY]: "Terminal verdict ready",
  [RUN_TIMING.SAVE_STARTED]: "Save started",
  [RUN_TIMING.SAVE_COMPLETED]: "Save completed",
  [RUN_TIMING.PUBLICATION_STARTED]: "Publication started",
  [RUN_TIMING.PUBLICATION_COMPLETED]: "Publication completed",
  [RUN_TIMING.UI_READY_WRITTEN]: "UI-ready authority written",
});

export const RUN_PUBLICATION_RETRIES_LABEL = "Publication retries";

/** The persisted field each milestone is written to, in the durable record. */
const PERSISTED_FIELD = Object.freeze({
  [RUN_TIMING.RUN_START]: "runStart",
  [RUN_TIMING.CALCULATION_COMPLETE]: "calculationComplete",
  [RUN_TIMING.TERMINAL_VERDICT_READY]: "terminalVerdictReady",
  [RUN_TIMING.SAVE_STARTED]: "saveStarted",
  [RUN_TIMING.SAVE_COMPLETED]: "saveCompleted",
  [RUN_TIMING.PUBLICATION_STARTED]: "publicationStarted",
  [RUN_TIMING.PUBLICATION_COMPLETED]: "publicationCompleted",
  [RUN_TIMING.UI_READY_WRITTEN]: "uiReadyWritten",
});

const store = new Map();
const listeners = new Set();

const keyOf = (projectId, versionId) => `${projectId || ""}::${versionId || ""}`;

function notify() {
  listeners.forEach((listener) => {
    try { listener(); } catch { /* a failing subscriber never breaks the store */ }
  });
}

/**
 * START TIMING THIS RUN. A new run's ledger replaces the previous run's own
 * ledger only after that run's timings have been written into its record.
 */
export function beginRunTimings(projectId, versionId, runId) {
  const key = keyOf(projectId, versionId);
  store.set(key, { runId: runId || null, milestones: {}, publicationRetries: 0 });
  notify();
  return getRunTimings(projectId, versionId);
}

/**
 * Record ONE milestone. The first timestamp for a milestone wins: a later call
 * never rewrites when the run actually reached it.
 */
export function recordRunTiming(projectId, versionId, milestone, { at = Date.now() } = {}) {
  const key = keyOf(projectId, versionId);
  const current = store.get(key);
  if (!current || !RUN_TIMING_LABEL[milestone]) return current || null;
  if (current.milestones[milestone]) return current;
  const next = {
    ...current,
    milestones: {
      ...current.milestones,
      [milestone]: { at, iso: new Date(at).toISOString() },
    },
  };
  store.set(key, next);
  notify();
  return next;
}

/** How many publication attempts the last write needed. Never invented. */
export function recordPublicationRetries(projectId, versionId, attempts) {
  const key = keyOf(projectId, versionId);
  const current = store.get(key);
  if (!current) return null;
  const count = Number(attempts);
  if (!Number.isFinite(count) || count < 0) return current;
  const next = { ...current, publicationRetries: Math.floor(count) };
  store.set(key, next);
  notify();
  return next;
}

export function getRunTimings(projectId, versionId) {
  return store.get(keyOf(projectId, versionId)) || null;
}

export function subscribeRunTimings(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** React binding — the timing ledger of the latest run for this design version. */
export function useRunTimings(projectId, versionId) {
  const key = keyOf(projectId, versionId);
  return useSyncExternalStore(
    subscribeRunTimings,
    () => store.get(key) || null,
    () => null,
  );
}

/** Test/reopen support: forget the timing ledger for one design version. */
export function resetRunTimings(projectId, versionId) {
  store.delete(keyOf(projectId, versionId));
  notify();
}

/**
 * IS THE PUBLICATION IN FLIGHT, and what did it need?
 *
 * This is the ONE thing the panel reads from the ledger: whether the run is
 * saving its result or publishing it. It is read, never derived from elapsed
 * time, and it is null once the publication has completed.
 */
export function resolveRunPublicationPhase(ledger) {
  const milestones = ledger?.milestones || {};
  if (!milestones[RUN_TIMING.PUBLICATION_STARTED]) return null;
  if (milestones[RUN_TIMING.PUBLICATION_COMPLETED]) return null;
  return { key: "publishing", label: "Publishing result…" };
}

/** The ISO timestamp of one milestone, or null when the run never reached it. */
export function runTimingAt(ledger, milestone) {
  return ledger?.milestones?.[milestone]?.iso || null;
}

function millisecondsBetween(ledger, from, to) {
  const a = ledger?.milestones?.[from]?.at ?? null;
  const b = ledger?.milestones?.[to]?.at ?? null;
  if (a == null || b == null || b < a) return null;
  return b - a;
}

/**
 * THE DURABLE SHAPE — what is written into the run's own saved record. Every
 * field is a timestamp the run actually reached; a milestone that did not
 * happen is absent, and a duration whose two ends did not both happen is null.
 */
export function buildPersistedRunTimings(ledger) {
  if (!ledger) return null;
  const milestones = ledger.milestones || {};
  const hasAny = Object.keys(milestones).length > 0;
  if (!hasAny) return null;

  const timings = {
    runId: ledger.runId || null,
    publicationRetries: Number.isFinite(ledger.publicationRetries) ? ledger.publicationRetries : 0,
    durationsMs: {
      // From the design's own calculation (when this run had to make one) to the
      // terminal verdict; null when the run reused an existing result.
      calculation: millisecondsBetween(ledger, RUN_TIMING.RUN_START, RUN_TIMING.CALCULATION_COMPLETE),
      evaluation: millisecondsBetween(ledger, RUN_TIMING.CALCULATION_COMPLETE, RUN_TIMING.TERMINAL_VERDICT_READY),
      verdict: millisecondsBetween(ledger, RUN_TIMING.RUN_START, RUN_TIMING.TERMINAL_VERDICT_READY),
      save: millisecondsBetween(ledger, RUN_TIMING.SAVE_STARTED, RUN_TIMING.SAVE_COMPLETED),
      saveAndPublish: millisecondsBetween(ledger, RUN_TIMING.SAVE_STARTED, RUN_TIMING.PUBLICATION_COMPLETED),
      publication: millisecondsBetween(ledger, RUN_TIMING.PUBLICATION_STARTED, RUN_TIMING.PUBLICATION_COMPLETED),
      total: millisecondsBetween(ledger, RUN_TIMING.RUN_START, RUN_TIMING.UI_READY_WRITTEN),
    },
  };
  Object.entries(PERSISTED_FIELD).forEach(([milestone, field]) => {
    timings[field] = runTimingAt(ledger, milestone);
  });
  return timings;
}

/** "42.3 s" · "0.4 s" — a duration in words, or null when it is unknown. */
export function formatRunDuration(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value < 0) return null;
  if (value < 1000) return `${value} ms`;
  return `${(value / 1000).toFixed(1)} s`;
}

/** "23:41:07" — the wall-clock time of one milestone, from its own ISO stamp. */
export function formatRunTimingClock(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(11, 19);
}

/**
 * THE DEVELOPER DIAGNOSTIC ROWS. Built from either a live ledger (while the run
 * is in flight) or the run's persisted timings (when it is being read back from
 * a saved record), so one table serves both. Nothing is invented: a milestone
 * with no timestamp is simply not a row.
 */
export function buildRunTimingRows(source) {
  if (!source) return [];
  const persisted = source.publicationRetries !== undefined && !source.milestones;
  const clockOf = (milestone) => {
    if (persisted) return formatRunTimingClock(source[PERSISTED_FIELD[milestone]]);
    return formatRunTimingClock(runTimingAt(source, milestone));
  };
  const durationOf = (key) => formatRunDuration(
    persisted ? source.durationsMs?.[key] : buildPersistedRunTimings(source)?.durationsMs?.[key],
  );

  const rows = Object.values(RUN_TIMING)
    .map((milestone) => {
      const clock = clockOf(milestone);
      if (!clock) return null;
      return { key: milestone, label: RUN_TIMING_LABEL[milestone], value: clock };
    })
    .filter(Boolean);

  const durations = [
    ["verdict", "Run start → verdict"],
    ["evaluation", "Verdict stage (search)"],
    ["save", "Save"],
    ["publication", "Publication"],
    ["total", "Total to UI-ready"],
  ]
    .map(([key, label]) => {
      const value = durationOf(key);
      return value ? { key: `duration:${key}`, label, value } : null;
    })
    .filter(Boolean);

  const retries = Number(persisted ? source.publicationRetries : source.publicationRetries);
  const retryRow = Number.isFinite(retries)
    ? [{ key: "retries", label: RUN_PUBLICATION_RETRIES_LABEL, value: String(Math.max(0, Math.floor(retries))) }]
    : [];

  return [...rows, ...durations, ...retryRow];
}