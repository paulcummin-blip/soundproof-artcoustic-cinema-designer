// bassDiagTokenTrace.js — Ordered diagnostic lifecycle trace.
//
// Correlates one exact recalculation through the main thread and worker using a
// unique diagnostic request token. Records an ordered, append-only event list
// per token. Each event is an immutable snapshot with stage, timestamp, token,
// worker request ID (where available), and real event data.
//
// READ-ONLY RULES:
//   - No simulations, no optimiser runs, no cache invalidations.
//   - No synthetic values — every field is recorded from the real production path.
//   - Repeated events append; they never overwrite earlier events.
//   - MISSING = stage not yet reached for this token.
//
// SUBSCRIPTION:
//   subscribeDiagRuns(listener) + getDiagRunsSnapshot() are suitable for
//   useSyncExternalStore. The snapshot is cached and stable — the exact same
//   reference is returned while state has not changed. A new immutable snapshot
//   is built only on mutation (token creation, event append, eviction, clear).
//   Listeners are notified only after the cached snapshot has been replaced.
//
// IMMUTABILITY:
//   Public getters (getDiagRun, getDiagRuns, getLatestDiagRun, getManualForcedRun)
//   return immutable external snapshots from the same canonical cached source as
//   getDiagRunsSnapshot(). Consumers cannot mutate internal state through them:
//   the outer array, run objects, and event arrays are all frozen.

const MAX_RUNS = 10;
const runs = new Map();
const runOrder = [];
const listeners = new Set();
let lastCheckboxClickTs = null;
let lastCheckboxClickValue = null;
let lastManualForcedToken = null;
let tokenSeq = 0;
let cachedSnapshot = null;

function notify() {
  listeners.forEach((listener) => listener());
}

// Build a fully frozen immutable snapshot of all runs and their event arrays.
// Event objects are already frozen at creation time; this freezes the containing
// run objects, event arrays, and the outer array so consumers cannot mutate
// internal state through the snapshot.
function buildSnapshot() {
  const arr = runOrder.map((t) => {
    const run = runs.get(t);
    if (!run) return null;
    return Object.freeze({
      ...run,
      events: Object.freeze([...run.events]),
    });
  }).filter(Boolean);
  return Object.freeze(arr);
}

// Rebuild the cached snapshot, then notify subscribers. Called after every
// mutation (token creation, event append, run eviction, clear). Subscribers
// are notified only after the cached snapshot has been replaced.
function invalidateSnapshot() {
  cachedSnapshot = buildSnapshot();
  notify();
}

// Extract worker request ID from common data field names.
function extractWorkerRequestId(data) {
  if (!data) return null;
  return data.workerRequestId
    || data.requestId
    || data.startRequestId
    || data.postMessageRequestId
    || data.workerEventRequestId
    || data.completedRequestId
    || data.resultRequestId
    || data.acceptedRequestId
    || data.publishedRequestId
    || null;
}

export function createDiagToken(origin) {
  tokenSeq += 1;
  const token = `diag-${Date.now()}-${tokenSeq}`;
  const run = {
    token,
    origin,
    checkboxClickTs: lastCheckboxClickTs,
    checkboxClickValue: lastCheckboxClickValue,
    events: [],
  };
  runs.set(token, run);
  runOrder.push(token);
  while (runOrder.length > MAX_RUNS) {
    const old = runOrder.shift();
    runs.delete(old);
    if (lastManualForcedToken === old) lastManualForcedToken = null;
  }
  if (origin === "manual-forced") lastManualForcedToken = token;
  invalidateSnapshot();
  return token;
}

export function getLastManualForcedToken() {
  return lastManualForcedToken;
}

export function getManualForcedRun() {
  if (!lastManualForcedToken) return null;
  return getDiagRun(lastManualForcedToken);
}

// Append an immutable event snapshot to the token's ordered event list.
// Repeated calls with the same stage name append new events; they never
// overwrite earlier events. Data fields are flattened into the event for
// backward-compatible access (event.field) alongside the structured fields.
export function recordDiagStage(token, stage, data = {}) {
  if (!token) return;
  let run = runs.get(token);
  if (!run) {
    run = { token, origin: "unknown", checkboxClickTs: null, checkboxClickValue: null, events: [] };
    runs.set(token, run);
    runOrder.push(token);
  }
  const event = Object.freeze({
    stage,
    ts: Date.now(),
    token,
    workerRequestId: extractWorkerRequestId(data),
    ...data,
  });
  run.events = [...run.events, event];
  invalidateSnapshot();
}

export function recordCheckboxClick(value) {
  lastCheckboxClickTs = Date.now();
  lastCheckboxClickValue = value;
}

// --- Public getters: return immutable external snapshots ---
// All getters source from the same canonical cached snapshot as
// getDiagRunsSnapshot(), so they agree and cannot leak mutable internal state.

export function getDiagRuns() {
  return getDiagRunsSnapshot();
}

export function getDiagRun(token) {
  if (!token) return null;
  const snap = getDiagRunsSnapshot();
  return snap.find((r) => r.token === token) || null;
}

export function getLatestDiagRun() {
  const snap = getDiagRunsSnapshot();
  return snap.length > 0 ? snap[snap.length - 1] : null;
}

// Backward-compatible stage accessor: returns the first event matching stageName.
export function getDiagStageEvent(token, stageName) {
  const run = getDiagRun(token);
  if (!run?.events) return null;
  return run.events.find((e) => e.stage === stageName) || null;
}

export function clearDiagRuns() {
  runs.clear();
  runOrder.length = 0;
  invalidateSnapshot();
}

// --- Subscription mechanism for useSyncExternalStore ---

export function subscribeDiagRuns(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getDiagRunsSnapshot() {
  if (cachedSnapshot === null) {
    cachedSnapshot = buildSnapshot();
  }
  return cachedSnapshot;
}