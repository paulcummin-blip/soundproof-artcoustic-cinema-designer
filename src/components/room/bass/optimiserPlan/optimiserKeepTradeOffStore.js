// optimiserKeepTradeOffStore.js
// ---------------------------------------------------------------------------
// KEEP CURRENT DESIGN — the designer's own "no" to a trade-off.
//
// Keeping the current design is a decision about ONE evaluated candidate: the
// candidate is dismissed for this run, nothing is applied, and the current
// published bass result, the saved calibration and every design field are left
// exactly as they are. Nothing here writes a design value, a plan field or an
// engineering result — it records the dismissal alone.
//
// It survives a refresh and a project reopen, because the decision was the
// designer's: the trade-off must not be offered again as if it were new. The
// record is scoped to the project, the design version and the candidate the run
// found, so:
//
//   • reopening the same project restores the same terminal state
//   • a re-test that finds a DIFFERENT candidate offers it again, because that
//     is a new decision
//   • a different project or version can never read this one's decision
//
// Presentation only: no thresholds, no eligibility and no engineering value is
// touched by reading or writing this store.
// ---------------------------------------------------------------------------

const STORAGE_PREFIX = "b44_adi_tradeoff_kept_v1";

/** In-memory mirror, so the state is correct even when storage is unavailable. */
let memory = {};
const listeners = new Set();

function storageKey({ projectId = null, versionId = null } = {}) {
  return `${STORAGE_PREFIX}::${projectId || "none"}::${versionId || "none"}`;
}

/** The one identity a kept trade-off is recorded against. */
export function optimiserTradeOffKeptKey({ projectId = null, versionId = null, candidateId = null } = {}) {
  return `${projectId || "none"}:${versionId || "none"}:${candidateId || "none"}`;
}

function readAll({ projectId = null, versionId = null } = {}) {
  try {
    const raw = window.localStorage.getItem(storageKey({ projectId, versionId }));
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return memory[storageKey({ projectId, versionId })] || {};
  }
}

function writeAll(scope, next) {
  const key = storageKey(scope);
  memory = { ...memory, [key]: next };
  try {
    window.localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // Storage unavailable: the in-memory mirror still owns this session.
  }
  listeners.forEach((listener) => listener());
}

/** Whether this exact candidate was kept for this project version. */
export function readTradeOffKept(key) {
  const [projectId, versionId] = String(key || "").split(":");
  return readAll({ projectId, versionId })[key] === true;
}

/**
 * Record the designer's decision to keep the current design for this candidate.
 * Applies nothing and changes nothing: only the dismissal is written.
 */
export function keepTradeOff(key) {
  if (!key) return;
  const [projectId, versionId] = String(key).split(":");
  const scope = { projectId, versionId };
  writeAll(scope, { ...readAll(scope), [key]: true });
}

export function subscribeTradeOffKept(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}