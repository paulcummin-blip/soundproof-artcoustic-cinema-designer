// recommendationPersistence.js
// ---------------------------------------------------------------------------
// Persists the Recommendation Engine output alongside the canonical bass
// result in ProjectAnalysisCache.
//
// The recommendation is stored within the completed_by_fingerprint snapshot
// for the current result fingerprint. This way it is:
//   1. Automatically invalidated when the design changes (new fingerprint)
//   2. Available to all consumers that read the canonical bass result
//   3. A single source of truth for engineering reasoning
//
// This module is purely additive — it does NOT modify the existing bass
// persistence logic. It reads the current ProjectAnalysisCache record and
// attaches the recommendation to the existing snapshot.
// ---------------------------------------------------------------------------

import { base44 } from '@/api/base44Client';
import { readProjectAnalysisCacheRecord, invalidateProjectAnalysisCacheRead } from '@/components/state/projectReadCache';

// In-memory cache for the current recommendation (per project+version)
const memoryByProject = new Map();
const listeners = new Set();
const persistenceWrites = new Map();
// How many attempts the last WRITE for a project+version needed. Read by the
// optimiser run diagnostic instrumentation — never a claim about the record.
const attemptsByProject = new Map();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * WHY a publication could not be written. The caller states the failure from
 * this record instead of guessing at a cause.
 */
export const PUBLICATION_FAILURE_CATEGORY = Object.freeze({
  /** The snapshot was there and the write itself was refused. */
  WRITE_REFUSED: "write_refused",
  /** The bass snapshot the recommendation belongs to never appeared. */
  SNAPSHOT_MISSING: "snapshot_missing",
});

// The wait for the result's own snapshot to exist. This is a WAIT, not a retry:
// no write is attempted while it runs, so it creates no traffic of its own.
const SNAPSHOT_WAIT_ITERATIONS = 20;
const SNAPSHOT_WAIT_MS = 250;

// How many times ONE write is attempted before it is reported as failed.
//
// This is deliberately small. A write refused by the app's write-traffic limit
// is only made worse by repeating it: every further attempt adds the traffic
// that caused the refusal. A refused write is therefore tried twice and then
// REPORTED, so the run can end and state what happened.
const DEFAULT_WRITE_ATTEMPTS = 2;
const WRITE_RETRY_BACKOFF_MS = 750;

// The last publication failure for a project+version, so the caller that needs
// it (the optimiser run) can state the real cause. Never a claim about the
// record: it describes the attempt alone.
const failureByProject = new Map();

function recordFailure(key, { category, error = null, attempts = 0 } = {}) {
  const detail = error == null
    ? null
    : (typeof error === "string" ? error : (error?.message || String(error)));
  failureByProject.set(key, {
    category: category || PUBLICATION_FAILURE_CATEGORY.WRITE_REFUSED,
    message: detail
      ? `The result could not be saved: ${detail}`
      : "The result could not be saved.",
    error: detail,
    attempts: Number.isFinite(Number(attempts)) ? Math.floor(Number(attempts)) : 0,
    at: new Date().toISOString(),
  });
}

/**
 * The most recent publication failure for this project+version, or null when
 * the last publication succeeded. Diagnostic and reporting only.
 */
export function getPublicationFailure(projectId, versionId) {
  return failureByProject.get(`${projectId}::${versionId}`) || null;
}

/**
 * How many attempts the most recent publication for this project+version took.
 * 0 when nothing has been published yet. Diagnostic only.
 */
export function getPublicationAttempts(projectId, versionId) {
  return attemptsByProject.get(`${projectId}::${versionId}`) || 0;
}

function notify() {
  listeners.forEach((l) => l());
}

/**
 * Publish a recommendation to the in-memory store and persist it to the
 * ProjectAnalysisCache alongside the canonical bass result.
 *
 * @param {string} projectId
 * @param {string} versionId
 * @param {object} recommendation - the recommendation object
 * @param {string} resultFingerprint - the bass result fingerprint
 */
export async function publishRecommendation(
  projectId,
  versionId,
  recommendation,
  resultFingerprint,
  { writeAttempts = DEFAULT_WRITE_ATTEMPTS } = {},
) {
  const key = `${projectId}::${versionId}`;

  // Update in-memory store
  memoryByProject.set(key, {
    recommendation,
    resultFingerprint,
    publishedAt: new Date().toISOString(),
  });
  notify();

  // The final bass contract may be authoritative in memory before its cache
  // snapshot has finished writing. Wait for that exact fingerprint instead of
  // silently dropping the recommendation during the auto-apply handoff.
  if (!projectId || projectId === 'free' || !resultFingerprint || !recommendation) return false;

  const previousWrite = persistenceWrites.get(key) || Promise.resolve();
  const write = previousWrite.catch(() => {}).then(async () => {
    attemptsByProject.set(key, 0);
    const boundedWrites = Number.isFinite(Number(writeAttempts)) && Number(writeAttempts) > 0
      ? Math.floor(Number(writeAttempts))
      : DEFAULT_WRITE_ATTEMPTS;

    // ── 1. WAIT for the result's own snapshot. No write is attempted here. ──
    for (let wait = 0; wait < SNAPSHOT_WAIT_ITERATIONS; wait += 1) {
      let record = null;
      let snapshot = null;
      let readError = null;
      try {
        record = await readProjectAnalysisCacheRecord(projectId, versionId, { force: true });
        snapshot = (record?.completed_by_fingerprint || {})[resultFingerprint] || null;
      } catch (e) {
        readError = e;
      }

      if (record && snapshot) {
        // ── 2. THE WRITE, bounded. A refusal is reported, never stormed. ──
        const completedByFingerprint = record.completed_by_fingerprint || {};
        for (let attempt = 0; attempt < boundedWrites; attempt += 1) {
          attemptsByProject.set(key, attempt + 1);
          try {
            await base44.entities.ProjectAnalysisCache.update(record.id, {
              completed_by_fingerprint: {
                ...completedByFingerprint,
                [resultFingerprint]: { ...snapshot, recommendation },
              },
            });
            invalidateProjectAnalysisCacheRead(projectId, versionId);
            failureByProject.delete(key);
            return true;
          } catch (e) {
            recordFailure(key, {
              category: PUBLICATION_FAILURE_CATEGORY.WRITE_REFUSED,
              error: e,
              attempts: attempt + 1,
            });
            if (attempt < boundedWrites - 1) await sleep(WRITE_RETRY_BACKOFF_MS);
          }
        }
        // Every attempt was refused. The caller states the failure and the run
        // ends; the same refused write is never repeated further.
        console.warn('[RecommendationPersistence] Publication refused:', getPublicationFailure(projectId, versionId)?.message);
        return false;
      }

      recordFailure(key, {
        category: PUBLICATION_FAILURE_CATEGORY.SNAPSHOT_MISSING,
        error: readError,
        attempts: 0,
      });
      await sleep(SNAPSHOT_WAIT_MS);
    }
    // The snapshot the recommendation belongs to never appeared.
    return false;
  });
  persistenceWrites.set(key, write);
  try {
    return await write;
  } finally {
    if (persistenceWrites.get(key) === write) persistenceWrites.delete(key);
  }
}

/**
 * Read the current recommendation from the in-memory store.
 *
 * @param {string} projectId
 * @param {string} versionId
 * @returns {{ recommendation: object|null, resultFingerprint: string|null, publishedAt: string|null }}
 */
export function getRecommendation(projectId, versionId) {
  const key = `${projectId}::${versionId}`;
  return memoryByProject.get(key) || { recommendation: null, resultFingerprint: null, publishedAt: null };
}

/**
 * Hydrate the recommendation from the ProjectAnalysisCache on project load.
 *
 * @param {string} projectId
 * @param {string} versionId
 * @param {string} resultFingerprint - the current bass result fingerprint
 */
export async function hydrateRecommendation(projectId, versionId, resultFingerprint) {
  if (!projectId || projectId === 'free' || !resultFingerprint) return;

  const key = `${projectId}::${versionId}`;

  // Don't overwrite an existing in-memory recommendation
  if (memoryByProject.has(key)) return;

  try {
    const record = await readProjectAnalysisCacheRecord(projectId, versionId, { force: true });

    if (!record) return;

    const completedByFingerprint = record.completed_by_fingerprint || {};
    const snapshot = completedByFingerprint[resultFingerprint];

    if (snapshot?.recommendation) {
      memoryByProject.set(key, {
        recommendation: snapshot.recommendation,
        resultFingerprint,
        publishedAt: snapshot.recommendation?.generatedAt || null,
      });
      notify();
    }
  } catch (e) {
    // Hydration failure is non-fatal
  }
}

/**
 * Clear the recommendation for a project+version (when the design changes).
 *
 * @param {string} projectId
 * @param {string} versionId
 */
export function clearRecommendation(projectId, versionId) {
  const key = `${projectId}::${versionId}`;
  if (memoryByProject.has(key)) {
    memoryByProject.delete(key);
    notify();
  }
}

/**
 * Subscribe to recommendation changes.
 *
 * @param {function} listener
 * @returns {function} unsubscribe
 */
export function subscribeRecommendation(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}