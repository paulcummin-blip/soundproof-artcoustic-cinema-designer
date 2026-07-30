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
//   useSyncExternalStore. Listeners are notified on every event append.

const MAX_RUNS = 10;
const runs = new Map();
const runOrder = [];
const listeners = new Set();
let lastCheckboxClickTs = null;
let lastCheckboxClickValue = null;
let lastManualForcedToken = null;
let tokenSeq = 0;

function notify() {
  listeners.forEach((listener) => listener());
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
  notify();
  return token;
}

export function getLastManualForcedToken() {
  return lastManualForcedToken;
}

export function getManualForcedRun() {
  if (!lastManualForcedToken) return null;
  return runs.get(lastManualForcedToken) || null;
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
  notify();
}

export function recordCheckboxClick(value) {
  lastCheckboxClickTs = Date.now();
  lastCheckboxClickValue = value;
}

export function getDiagRuns() {
  return runOrder.map((t) => runs.get(t)).filter(Boolean);
}

export function getDiagRun(token) {
  if (!token) return null;
  return runs.get(token) || null;
}

export function getLatestDiagRun() {
  if (runOrder.length === 0) return null;
  return runs.get(runOrder[runOrder.length - 1]) || null;
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
  notify();
}

// --- Subscription mechanism for useSyncExternalStore ---

export function subscribeDiagRuns(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getDiagRunsSnapshot() {
  return runOrder.map((t) => {
    const run = runs.get(t);
    if (!run) return null;
    return { ...run, events: [...run.events] };
  }).filter(Boolean);
}