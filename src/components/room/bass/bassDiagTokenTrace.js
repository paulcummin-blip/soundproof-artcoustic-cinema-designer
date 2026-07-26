// bassDiagTokenTrace.js — Read-only diagnostic request-token trace for TEST 11E.
//
// Correlates one exact recalculation through the main thread and worker using a
// unique diagnostic request token. Records per-stage collectDiagnostics, requestId,
// token, origin and timestamps. Zero worker runs, zero side effects, zero logic
// changes. Opening TEST 11 reads from completed records only.
//
// READ-ONLY RULES:
//   - No simulations, no optimiser runs, no cache invalidations.
//   - No synthetic values — every field is recorded from the real production path.
//   - MISSING = stage not yet reached for this token.

const MAX_RUNS = 10;
const runs = new Map();
const runOrder = [];
let lastCheckboxClickTs = null;
let lastCheckboxClickValue = null;
let lastManualForcedToken = null;
let tokenSeq = 0;

export function createDiagToken(origin) {
  tokenSeq += 1;
  const token = `diag-${Date.now()}-${tokenSeq}`;
  const run = {
    token,
    origin,
    checkboxClickTs: lastCheckboxClickTs,
    checkboxClickValue: lastCheckboxClickValue,
    stages: {},
  };
  runs.set(token, run);
  runOrder.push(token);
  while (runOrder.length > MAX_RUNS) {
    const old = runOrder.shift();
    runs.delete(old);
    if (lastManualForcedToken === old) lastManualForcedToken = null;
  }
  if (origin === "manual-forced") lastManualForcedToken = token;
  return token;
}

export function getLastManualForcedToken() {
  return lastManualForcedToken;
}

export function getManualForcedRun() {
  if (!lastManualForcedToken) return null;
  return runs.get(lastManualForcedToken) || null;
}

export function recordDiagStage(token, stage, data) {
  if (!token) return;
  let run = runs.get(token);
  if (!run) {
    run = { token, origin: "unknown", checkboxClickTs: null, checkboxClickValue: null, stages: {} };
    runs.set(token, run);
    runOrder.push(token);
  }
  run.stages[stage] = { ...(data || {}), ts: Date.now() };
}

export function recordCheckboxClick(value) {
  lastCheckboxClickTs = Date.now();
  lastCheckboxClickValue = value;
}

export function getDiagRuns() {
  return runOrder.map((t) => runs.get(t)).filter(Boolean);
}

export function getLatestDiagRun() {
  if (runOrder.length === 0) return null;
  return runs.get(runOrder[runOrder.length - 1]) || null;
}

export function clearDiagRuns() {
  runs.clear();
  runOrder.length = 0;
}