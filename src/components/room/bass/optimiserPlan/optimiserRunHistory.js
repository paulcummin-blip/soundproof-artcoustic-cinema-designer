// optimiserRunHistory.js
// ---------------------------------------------------------------------------
// DURABLE RUN HISTORY for the Bass Optimiser.
//
// The database used to expose only the CURRENT saved plan, so a run that
// behaved badly could not be diagnosed after the fact: the previous run's row
// was overwritten by the next run, and nothing recorded when the plan was
// ready, when the publication started and finished, or what the publication
// error actually was.
//
// This module appends ONE lightweight lifecycle row per run and keeps only the
// most recent few rows per project version. It stores LIFECYCLE FACTS ONLY:
//
//   run id · project · version · design/result fingerprints
//   started · terminal · plan saved · user-terminal · publication started/completed
//   terminal status · publication status, error and attempt count
//   the fingerprints the publication wrote · worker calls · runtime breakdown
//
// WHAT IT IS NOT:
//   • NOT a result authority. No engineering value, candidate, seat result,
//     curve or ranking is stored here, and nothing in it may be read as a
//     current result.
//   • NOT a readiness input. Report readiness, publication gating and Apply
//     authority read none of this.
//   • NOT a calculation. It writes what the run already decided.
//
// A failure to write history is swallowed and reported: a diagnostic log must
// never be able to break, delay or alter a run.
// ---------------------------------------------------------------------------

import { base44 } from "@/api/base44Client";

/** How many runs are retained per project version. */
export const OPTIMISER_RUN_HISTORY_LIMIT = 12;

/** The most runtime-cost rows one history record keeps. */
const RUNTIME_ROW_LIMIT = 24;

// The signed-in user's account id, resolved once per session. The history row
// carries account_id because that is what scopes the log to the owning account
// (the same access model every other project record uses). A lookup that fails
// leaves it absent: the row is still attempted, and a refusal is reported
// without ever affecting the run.
let accountIdPromise = null;

/** The account this session's runs belong to, or null when it cannot be read. */
export async function resolveRunHistoryAccountId() {
  if (!accountIdPromise) {
    accountIdPromise = (async () => {
      try {
        const me = await base44.auth.me();
        return me?.access_context?.account?.id || me?.data?.account_id || me?.account_id || null;
      } catch (error) {
        console.warn("[optimiserRunHistory] account identity unavailable:", error?.message || error);
        return null;
      }
    })();
  }
  return accountIdPromise;
}

const text = (value) => {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
};

const count = (value) => (Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0);

/** The compact runtime-cost rows only: key, label, value. Nothing else. */
function compactRuntimeBreakdown(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .slice(0, RUNTIME_ROW_LIMIT)
    .map((row) => ({
      key: text(row?.key),
      label: text(row?.label),
      value: text(row?.value),
    }))
    .filter((row) => row.key || row.label);
}

/** The run's own worker/job counts, when the engine published them. */
function compactWorkerCalls(workerCalls) {
  if (!workerCalls || typeof workerCalls !== "object" || Array.isArray(workerCalls)) return null;
  const entries = Object.entries(workerCalls)
    .filter(([, value]) => Number.isFinite(Number(value)))
    .slice(0, 12)
    .map(([key, value]) => [key, count(value)]);
  return entries.length ? Object.fromEntries(entries) : null;
}

/**
 * The plain, JSON-safe history record for one run. Returns null when the run's
 * own identity is incomplete — a row without a run id, project and version
 * could not be attributed, so it is not written.
 */
export function buildOptimiserRunHistoryRecord({
  runId = null,
  projectId = null,
  versionId = null,
  accountId = null,
  designFingerprint = null,
  resultFingerprint = null,
  startedAt = null,
  terminalAt = null,
  // The instant the run became terminal FOR THE DESIGNER — the saved plan. It is
  // never the instant the secondary publication finished: that is a separate
  // figure, and the two stay separable when a run is diagnosed afterwards.
  userTerminalAt = null,
  planSavedAt = null,
  publicationStartedAt = null,
  publicationCompletedAt = null,
  terminalStatus = null,
  publicationStatus = null,
  publicationError = null,
  publicationAttemptCount = 0,
  fingerprintsPublished = [],
  workerCalls = null,
  runtimeBreakdown = [],
} = {}) {
  const run = text(runId);
  const project = text(projectId);
  const version = text(versionId);
  if (!run || !project || !version) return null;

  return {
    run_id: run,
    project_id: project,
    version_id: version,
    ...(text(accountId) ? { account_id: text(accountId) } : {}),
    design_fingerprint: text(designFingerprint),
    result_fingerprint: text(resultFingerprint),
    started_at: text(startedAt),
    terminal_at: text(terminalAt),
    user_terminal_at: text(userTerminalAt),
    plan_saved_at: text(planSavedAt),
    publication_started_at: text(publicationStartedAt),
    publication_completed_at: text(publicationCompletedAt),
    terminal_status: text(terminalStatus) || "unknown",
    publication_status: text(publicationStatus),
    publication_error: text(publicationError),
    publication_attempt_count: count(publicationAttemptCount),
    fingerprints_published: Array.isArray(fingerprintsPublished)
      ? [...new Set(fingerprintsPublished.filter(Boolean).map(String))].slice(0, 4)
      : [],
    worker_calls: compactWorkerCalls(workerCalls),
    runtime_breakdown: compactRuntimeBreakdown(runtimeBreakdown),
  };
}

/** Append one run's lifecycle row. Never throws. */
export async function recordOptimiserRunHistory(entry = {}) {
  const record = buildOptimiserRunHistoryRecord(entry);
  if (!record) return { ok: false, error: "incomplete_run_identity" };
  try {
    const created = await base44.entities.OptimiserRunHistory.create(record);
    return { ok: true, id: created?.id || null };
  } catch (error) {
    console.warn("[optimiserRunHistory] history write failed:", error?.message || error);
    return { ok: false, error: error?.message || "run_history_write_failed" };
  }
}

/**
 * Keep only the most recent `keep` rows for one project version. Older rows are
 * removed: this is a bounded diagnostic log, not an archive.
 */
export async function pruneOptimiserRunHistory({
  projectId = null,
  versionId = null,
  keep = OPTIMISER_RUN_HISTORY_LIMIT,
} = {}) {
  if (!projectId || !versionId) return { ok: false, removed: 0 };
  const keepCount = Math.max(1, count(keep) || OPTIMISER_RUN_HISTORY_LIMIT);
  try {
    const page = await base44.entities.OptimiserRunHistory.filter(
      { project_id: String(projectId), version_id: String(versionId) },
      { sort: "-started_at", limit: keepCount + 10 },
    );
    const rows = Array.isArray(page?.items) ? page.items : [];
    const stale = rows.slice(keepCount).map((row) => row?.id).filter(Boolean);
    if (stale.length === 0) return { ok: true, removed: 0 };
    await base44.entities.OptimiserRunHistory.deleteMany({ id: { $in: stale } });
    return { ok: true, removed: stale.length };
  } catch (error) {
    console.warn("[optimiserRunHistory] history prune failed:", error?.message || error);
    return { ok: false, removed: 0, error: error?.message || "run_history_prune_failed" };
  }
}

/** THE ONE WRITE: append the run's row, then bound the log. */
export async function persistOptimiserRunHistory(entry = {}, { prune = true } = {}) {
  const accountId = entry?.accountId || await resolveRunHistoryAccountId();
  const written = await recordOptimiserRunHistory({ ...entry, accountId });
  if (prune && written.ok) {
    await pruneOptimiserRunHistory({
      projectId: entry?.projectId,
      versionId: entry?.versionId,
    });
  }
  return written;
}

/** The retained rows for one version, newest first. Read-only. */
export async function readOptimiserRunHistory({ projectId, versionId, limit = OPTIMISER_RUN_HISTORY_LIMIT } = {}) {
  if (!projectId || !versionId) return [];
  try {
    const page = await base44.entities.OptimiserRunHistory.filter(
      { project_id: String(projectId), version_id: String(versionId) },
      { sort: "-started_at", limit: Math.max(1, count(limit) || OPTIMISER_RUN_HISTORY_LIMIT) },
    );
    return Array.isArray(page?.items) ? page.items : [];
  } catch (error) {
    console.warn("[optimiserRunHistory] history read failed:", error?.message || error);
    return [];
  }
}