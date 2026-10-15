// optimiserRunAuthority.js
// ---------------------------------------------------------------------------
// THE RUN LIFECYCLE AUTHORITY for the Bass Optimiser.
//
// ONE RULE, and it is the only rule that decides which run the panel describes:
//
//   THE LATEST RUN STARTED FOR THIS DESIGN VERSION OWNS CURRENT-STATE
//   PRESENTATION. Every earlier run is HISTORY: it is kept, never deleted and
//   never rewritten, but it may not determine the badge, the headline, the next
//   action, the current recommendation or the current failure state.
//
// A run starts the moment the designer presses the panel's one run control
// (OPTIMISE BASS, or RE-TEST BASS OPTIMISATION in a re-test state). From that
// moment the run it replaced is presented as history only: the panel states the
// run in progress and nothing of the old result. When the new run finishes and
// saves its own record, that record is newer than the run's own start, so it
// becomes the presentation authority by itself — no second write, no flag, no
// callback: a completed run supersedes the previous one by being newer.
//
// It performs NO calculation of any kind and changes no optimiser maths, no
// P19/P20 definition, no candidate ranking, no subwoofer grouping, no
// materiality rule and no physical-change policy. It records run identity and
// compares it with the saved record's own save time.
// ---------------------------------------------------------------------------

import { useSyncExternalStore } from "react";
import { getOptimiserPlanAuthority } from "./optimiserPlanStore.js";

const store = new Map();
const listeners = new Set();

const keyOf = (projectId, versionId) => `${projectId || ""}::${versionId || ""}`;

let runSequence = 0;

function notify() {
  listeners.forEach((listener) => {
    try { listener(); } catch { /* a failing subscriber never breaks the store */ }
  });
}

/** The saved record's own identity, noted when a newer run supersedes it. */
function supersededIdentity(plan) {
  if (!plan) return null;
  return {
    recordKind: plan.recordKind || null,
    terminalOutcome: plan.terminalOutcome || null,
    candidateId: plan.candidateId || null,
    savedAt: plan.savedAt || null,
  };
}

/**
 * START A RUN for this design version: mint its id and mark the run it replaces
 * as history. The saved record itself is never touched — nothing is cleared,
 * deleted or rewritten, so the previous run remains readable for history,
 * diagnostics and audit; it simply stops being what the panel describes.
 *
 * @returns {{ runId: string, startedAt: string, superseded: object|null }}
 */
export function beginOptimiserRun(projectId, versionId) {
  const key = keyOf(projectId, versionId);
  const previousRun = store.get(key) || null;
  const savedPlan = getOptimiserPlanAuthority(projectId, versionId);

  runSequence += 1;
  const startedAt = new Date().toISOString();
  const runId = `optimiser-run-${startedAt}-${runSequence}`;
  const run = {
    runId,
    startedAt,
    // Durable provenance for the record this run eventually saves. Prefer the
    // prior record's own persisted run id; fall back to the latest in-memory run
    // when the older record predates durable run identity.
    supersededRunId: savedPlan?.run?.runId || previousRun?.runId || null,
    superseded: supersededIdentity(savedPlan),
  };

  store.set(key, {
    ...run,
    // Run history for this design version, oldest first: which run was started
    // when, and what it superseded. Diagnostics and audit only — nothing here is
    // ever presented on the panel.
    history: [
      ...(previousRun?.history || []),
      // A run that was itself started this session, together with the record it
      // superseded. A record saved in an earlier session has no run id to enter
      // here — what this run superseded is stated on `superseded` above.
      ...(previousRun
        ? [{
          runId: previousRun.runId,
          startedAt: previousRun.startedAt,
          ...run.superseded,
        }]
        : []),
    ],
  });
  notify();
  return run;
}

/** The latest run started for this design version, or null. */
export function getLatestOptimiserRun(projectId, versionId) {
  return store.get(keyOf(projectId, versionId)) || null;
}

/** React binding — the latest run started for the open design version. */
export function useLatestOptimiserRun(projectId, versionId) {
  const key = keyOf(projectId, versionId);
  return useSyncExternalStore(
    subscribeOptimiserRun,
    () => store.get(key) || null,
    () => null,
  );
}

export function subscribeOptimiserRun(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test/reopen support: forget the run lifecycle for one design version. */
export function resetOptimiserRunAuthority(projectId, versionId) {
  store.delete(keyOf(projectId, versionId));
  notify();
}

/**
 * Does a newer run supersede this saved record?
 *
 * True when a run has been started for this design version AFTER the record was
 * saved: that record is the earlier run's result and is history from that moment
 * on. A record saved after the run started is that run's own result and is the
 * authority. A record with no save time cannot prove it belongs to the newest
 * run, so it is treated as history rather than presented as current.
 */
export function planIsSupersededByRun(plan, run) {
  if (!plan || !run) return false;

  // A fresh record names the run that wrote it. Identity wins over timestamps:
  // the current run's own record is authoritative; every other identified run is
  // history. The timestamp fallback remains only for legacy records.
  const savedRunId = plan.run?.runId || null;
  if (savedRunId) return savedRunId !== run.runId;

  const startedAt = Date.parse(run.startedAt || "");
  if (!Number.isFinite(startedAt)) return false;
  const savedAt = Date.parse(plan.savedAt || "");
  if (!Number.isFinite(savedAt)) return true;
  return savedAt < startedAt;
}

/**
 * WHICH RECORD THE PANEL MAY DESCRIBE: the newest run's own result, or nothing.
 *
 * @param {object} params
 * @param {object|null} params.plan - the saved record for the open version
 * @param {object|null} params.run - the latest run started for it
 * @returns {{ plan: object|null, superseded: boolean, supersededByRunId: string|null, supersededPlanSavedAt: string|null }}
 */
export function resolvePresentationPlan({ plan = null, run = null } = {}) {
  if (!plan) {
    return { plan: null, superseded: false, supersededByRunId: null, supersededPlanSavedAt: null };
  }
  const superseded = planIsSupersededByRun(plan, run);
  if (!superseded) {
    return { plan, superseded: false, supersededByRunId: null, supersededPlanSavedAt: null };
  }
  return {
    // The earlier run's record is not handed to the presentation at all, so no
    // badge, headline, recommendation, candidate or failure reason can be derived
    // from it while the newer run owns the panel.
    plan: null,
    superseded: true,
    supersededByRunId: run?.runId || null,
    supersededPlanSavedAt: plan.savedAt || null,
  };
}