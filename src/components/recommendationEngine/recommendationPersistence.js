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
import { bassDbFilter, parseBassCacheKey } from '@/components/room/bass/bassCacheKey';

// In-memory cache for the current recommendation (per project+version)
const memoryByProject = new Map();
const listeners = new Set();
const persistenceWrites = new Map();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
export async function publishRecommendation(projectId, versionId, recommendation, resultFingerprint) {
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
    const dbFilter = bassDbFilter(projectId, versionId);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        const records = await base44.entities.ProjectAnalysisCache.filter(dbFilter, '-updated_date', 1);
        const record = Array.isArray(records) ? records[0] : null;
        const completedByFingerprint = record?.completed_by_fingerprint || {};
        const snapshot = completedByFingerprint[resultFingerprint];
        if (record && snapshot) {
          await base44.entities.ProjectAnalysisCache.update(record.id, {
            completed_by_fingerprint: {
              ...completedByFingerprint,
              [resultFingerprint]: { ...snapshot, recommendation },
            },
          });
          return true;
        }
      } catch (e) {
        if (attempt === 19) console.warn('[RecommendationPersistence] Failed to persist recommendation:', e);
      }
      await sleep(250);
    }
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
    const dbFilter = bassDbFilter(projectId, versionId);
    const records = await base44.entities.ProjectAnalysisCache.filter(dbFilter, '-updated_date', 1);
    const record = Array.isArray(records) ? records[0] : null;

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