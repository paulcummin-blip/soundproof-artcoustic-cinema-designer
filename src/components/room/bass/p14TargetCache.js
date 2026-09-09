// p14TargetCache.js — Persistent P14 background target cache.
//
// Stores compact authoritative bass contracts for precomputed P14 target
// combinations, keyed by baseDesignFingerprint -> targetKey.
//
// In-memory cache is the primary read path; DB sync is fire-and-forget.
// On project reopen, hydrateTargetCache loads the persisted cache.
//
// This module does NOT touch the live bass authority (completedBassResultStore).
// Background results are cache-only until a target switch hydrates them.

import { useEffect, useSyncExternalStore } from "react";
import { base44 } from "@/api/base44Client";
import { COMPLETED_BASS_CACHE_VERSION, INSTANCE_AUTHORITY_VERSION, RP22_BASS_METRIC_SCHEMA_VERSION } from "@/lib/bassAuthorityVersion";
import { isAuthoritativeBassContract } from "./completedBassResultPersistence";
import { hasGraphPayload } from "./finishedGraphAdapter";
import { hasReadyCanonicalP19Contract } from "./p19Readiness";
import { isValidLimitedP14Contract } from "./p14LimitedTargetAuthority";
import { safeConsole } from "@/components/utils/safeConsole";

const cacheByProject = new Map();
const listeners = new Set();
const writeQueues = new Map();
const persistedSignatures = new Map();
const persistenceTimers = new Map();
const dirtyProjects = new Set();
// Tracks the last persistence failure per project so callers/diagnostics can
// detect that a completed target is NOT durably saved. Cleared on successful write.
const persistenceFailures = new Map();
const TARGET_CACHE_WRITE_DEBOUNCE_MS = 2000;
let cacheRevision = 0;

function notify() {
  cacheRevision += 1;
  listeners.forEach((l) => l());
}

function projectKey(projectId) { return String(projectId || "free"); }

function ensureCache(projectId) {
  const key = projectKey(projectId);
  if (!cacheByProject.has(key)) {
    cacheByProject.set(key, { metricSchemaVersion: RP22_BASS_METRIC_SCHEMA_VERSION, baseDesignFingerprint: null, targets: {} });
  }
  return cacheByProject.get(key);
}

/**
 * Get a cached compact contract for a specific target.
 * Returns null if the cache doesn't match the current base design or the
 * target hasn't been cached yet.
 */
export function getTargetCacheEntry(projectId, baseDesignFingerprint, targetKey) {
  if (!baseDesignFingerprint || !targetKey) return null;
  const cache = ensureCache(projectId);
  if (cache.metricSchemaVersion !== RP22_BASS_METRIC_SCHEMA_VERSION) return null;
  if (cache.baseDesignFingerprint !== baseDesignFingerprint) return null;
  const entry = cache.targets[targetKey];
  if (!entry) return null;
  // AUTHORITATIVE: structurally complete + graph payload + P19 ready
  if (isAuthoritativeBassContract(entry) && hasGraphPayload(entry) && hasReadyCanonicalP19Contract(entry)) {
    return entry;
  }
  // LIMITED: a valid capability-limited P14 contract (terminal, no P19)
  if (isValidLimitedP14Contract(entry)) {
    return entry;
  }
  return null;
}

/**
 * Store a LIMITED P14 contract for a target. A LIMITED contract represents a
 * successful terminal engineering result: the requested P14 dBC cannot be
 * achieved. It is stored separately from authoritative contracts and does
 * NOT pass the authoritative cache gate.
 */
export function setLimitedTargetCacheEntry(projectId, baseDesignFingerprint, targetKey, limitedContract, { deferPersistence = false, immediate = false } = {}) {
  if (!baseDesignFingerprint || !targetKey || !limitedContract) return false;
  if (!isValidLimitedP14Contract(limitedContract)) return false;
  const cache = ensureCache(projectId);
  if (cache.metricSchemaVersion !== RP22_BASS_METRIC_SCHEMA_VERSION
    || cache.baseDesignFingerprint !== baseDesignFingerprint) {
    cache.metricSchemaVersion = RP22_BASS_METRIC_SCHEMA_VERSION;
    cache.baseDesignFingerprint = baseDesignFingerprint;
    cache.targets = {};
  }
  // Mark the entry so isLimitedP14Entry can identify it without re-validating
  cache.targets[targetKey] = { ...limitedContract, __p14Limited: true };
  notify();
  scheduleSync(projectId, { deferPersistence, immediate });
  return true;
}

/**
 * Get cache progress: how many of the 8 targets are ready.
 */
export function getTargetCacheProgress(projectId, baseDesignFingerprint, allTargetKeys) {
  const keys = Array.isArray(allTargetKeys) ? allTargetKeys : [];
  const empty = { ready: 0, resolved: 0, total: keys.length, completedDurationsMs: [], readyTargetKeys: [], limitedTargetKeys: [], resolvedTargetKeys: [] };
  if (!baseDesignFingerprint) return empty;
  const cache = ensureCache(projectId);
  if (cache.metricSchemaVersion !== RP22_BASS_METRIC_SCHEMA_VERSION) return empty;
  if (cache.baseDesignFingerprint !== baseDesignFingerprint) return empty;
  const readyTargetKeys = [];
  const limitedTargetKeys = [];
  const resolvedTargetKeys = [];
  const completedDurationsMs = [];
  keys.forEach((key) => {
    const entry = cache.targets[key];
    if (!entry) return;
    const isAuthoritative = isAuthoritativeBassContract(entry) && hasGraphPayload(entry) && hasReadyCanonicalP19Contract(entry);
    const isLimited = isValidLimitedP14Contract(entry);
    if (isAuthoritative) {
      readyTargetKeys.push(key);
      resolvedTargetKeys.push(key);
      const elapsedMs = Number(entry?.job?.elapsedMs);
      if (Number.isFinite(elapsedMs) && elapsedMs > 0) completedDurationsMs.push(elapsedMs);
    } else if (isLimited) {
      limitedTargetKeys.push(key);
      resolvedTargetKeys.push(key);
    }
  });
  return {
    ready: readyTargetKeys.length,
    resolved: resolvedTargetKeys.length,
    total: keys.length,
    completedDurationsMs,
    readyTargetKeys,
    limitedTargetKeys,
    resolvedTargetKeys,
  };
}

/**
 * Store a compact contract for a target. Resets the cache if the design changed.
 */
export function setTargetCacheEntry(projectId, baseDesignFingerprint, targetKey, compactContract, { deferPersistence = false, immediate = false } = {}) {
  if (!baseDesignFingerprint || !targetKey || !compactContract) return false;
  if (!isAuthoritativeBassContract(compactContract)) return false;
  // Stage 3: reject contracts without the required finished graph payload.
  if (!hasGraphPayload(compactContract)) return false;
  // P19 readiness is part of completed-target reuse: a target without both
  // canonical curves and a finite official result remains eligible to retry.
  if (!hasReadyCanonicalP19Contract(compactContract)) return false;
  const cache = ensureCache(projectId);
  if (cache.metricSchemaVersion !== RP22_BASS_METRIC_SCHEMA_VERSION
    || cache.baseDesignFingerprint !== baseDesignFingerprint) {
    cache.metricSchemaVersion = RP22_BASS_METRIC_SCHEMA_VERSION;
    cache.baseDesignFingerprint = baseDesignFingerprint;
    cache.targets = {};
  }
  cache.targets[targetKey] = compactContract;
  notify();
  scheduleSync(projectId, { deferPersistence, immediate });
  return true;
}

/**
 * Reset the cache when the design changes. Old cached results for a different
 * design are no longer valid.
 */
export function clearTargetCacheForDesign(projectId, baseDesignFingerprint) {
  const cache = ensureCache(projectId);
  if (cache.metricSchemaVersion === RP22_BASS_METRIC_SCHEMA_VERSION
    && cache.baseDesignFingerprint === baseDesignFingerprint) return;
  cache.metricSchemaVersion = RP22_BASS_METRIC_SCHEMA_VERSION;
  cache.baseDesignFingerprint = baseDesignFingerprint;
  cache.targets = {};
  notify();
  scheduleSync(projectId);
}

/**
 * Hydrate the target cache from the database. Called on project load.
 */
export async function hydrateTargetCache(projectId) {
  const key = projectKey(projectId);
  if (key === "free") return;
  try {
    const records = await base44.entities.ProjectAnalysisCache.filter({ project_id: key }, '-updated_date', 1);
    const record = Array.isArray(records) ? records[0] : null;
    if (!record?.target_cache) return;
    const stored = typeof record.target_cache === 'string' ? JSON.parse(record.target_cache) : record.target_cache;
    if (!stored || stored.metricSchemaVersion !== RP22_BASS_METRIC_SCHEMA_VERSION || !stored.baseDesignFingerprint) {
      cacheByProject.set(key, { metricSchemaVersion: RP22_BASS_METRIC_SCHEMA_VERSION, baseDesignFingerprint: null, targets: {} });
      notify();
      return;
    }
    cacheByProject.set(key, {
      metricSchemaVersion: RP22_BASS_METRIC_SCHEMA_VERSION,
      baseDesignFingerprint: stored.baseDesignFingerprint,
      targets: stored.targets || {},
    });
    persistedSignatures.set(key, JSON.stringify(cacheByProject.get(key)));
    notify();
  } catch (e) {
    // Hydration failure is non-fatal — cache rebuilds from background scheduler
  }
}

/**
 * Schedule a persistence write for the target cache.
 *
 * Options:
 *   deferPersistence — mark dirty but do NOT schedule a write (non-terminal
 *     mutations; a later terminal mutation or explicit flush will persist).
 *   immediate — bypass the 2-second debounce and write NOW. Used for target
 *     completion so each verified target is durable before the user can close
 *     the page. The write is fire-and-forget (errors are logged in flush);
 *     callers that need to await may call flushTargetCachePersistence directly.
 *
 * The debounce remains for non-terminal cache mutations (e.g. design-clear)
 * where coalescing is safe and no completed target is at risk of being lost.
 */
function scheduleSync(projectId, { deferPersistence = false, immediate = false } = {}) {
  const key = projectKey(projectId);
  if (key === "free") return;
  dirtyProjects.add(key);
  const previousTimer = persistenceTimers.get(key);
  if (previousTimer != null) clearTimeout(previousTimer);
  persistenceTimers.delete(key);
  if (deferPersistence) return;
  if (immediate) {
    // Bypass the debounce — write immediately so the completed target is
    // durable before the user can close the page. Fire-and-forget; errors
    // are logged inside flushTargetCachePersistence.
    flushTargetCachePersistence(key).catch(() => { /* already logged */ });
    return;
  }
  persistenceTimers.set(key, setTimeout(() => {
    persistenceTimers.delete(key);
    flushTargetCachePersistence(key);
  }, TARGET_CACHE_WRITE_DEBOUNCE_MS));
}

export function flushTargetCachePersistence(projectId) {
  const key = projectKey(projectId);
  if (key === "free") return Promise.resolve();
  const timer = persistenceTimers.get(key);
  if (timer != null) clearTimeout(timer);
  persistenceTimers.delete(key);
  if (!dirtyProjects.has(key)) return writeQueues.get(key) || Promise.resolve();

  const snapshot = JSON.parse(JSON.stringify(ensureCache(key)));
  const signature = JSON.stringify(snapshot);
  dirtyProjects.delete(key);
  if (persistedSignatures.get(key) === signature) {
    return writeQueues.get(key) || Promise.resolve();
  }

  const queued = (writeQueues.get(key) || Promise.resolve()).then(async () => {
    try {
      const records = await base44.entities.ProjectAnalysisCache.filter({ project_id: key }, '-updated_date', 1);
      const record = Array.isArray(records) ? records[0] : null;
      const payload = {
        completed_cache_version: COMPLETED_BASS_CACHE_VERSION,
        instance_authority_version: INSTANCE_AUTHORITY_VERSION,
        metric_schema_version: RP22_BASS_METRIC_SCHEMA_VERSION,
        target_cache: snapshot,
      };
      if (record?.id) {
        await base44.entities.ProjectAnalysisCache.update(record.id, payload);
      } else {
        await base44.entities.ProjectAnalysisCache.create({ project_id: key, ...payload });
      }
      persistedSignatures.set(key, signature);
      // Write succeeded — clear any previous failure record for this project.
      persistenceFailures.delete(key);
    } catch (e) {
      // Preserve the dirty marker so the next target, explicit sweep flush, or
      // navigation cleanup retries the latest in-memory snapshot. The completed
      // result remains in memory and available for immediate use — it is NOT
      // falsely treated as durably saved.
      dirtyProjects.add(key);
      persistenceFailures.set(key, {
        error: e?.message || String(e),
        timestamp: Date.now(),
        targetCount: Object.keys(snapshot?.targets || {}).length,
      });
      safeConsole.warn("p14-cache", `target_cache persistence FAILED for project ${key}: ${e?.message || e}. ${Object.keys(snapshot?.targets || {}).length} target(s) retained in memory; dirty marker set for retry.`);
    }
    if (JSON.stringify(ensureCache(key)) !== persistedSignatures.get(key)) {
      dirtyProjects.add(key);
    }
  });
  writeQueues.set(key, queued);
  return queued;
}

/**
 * Returns the last persistence failure for a project, or null if the last
 * write succeeded. Used by diagnostics to detect that completed targets are
 * NOT durably saved — do not falsely treat the cache as durable when this
 * returns non-null.
 */
export function getPersistenceFailure(projectId) {
  const key = projectKey(projectId);
  return persistenceFailures.get(key) || null;
}

/**
 * Returns true when the in-memory cache has unwritten changes (dirty). Used
 * by diagnostics and tests to verify the dirty/retry state is retained after
 * a write failure.
 */
export function isTargetCacheDirty(projectId) {
  const key = projectKey(projectId);
  return dirtyProjects.has(key);
}

/**
 * Test-only: reset all in-memory cache state. Simulates a fresh app restart
 * so durability/hydration tests can verify the DB → memory restore path
 * without lingering in-memory state from a previous test.
 */
export function _resetTargetCacheForTest() {
  cacheByProject.clear();
  persistedSignatures.clear();
  persistenceTimers.forEach((t) => clearTimeout(t));
  persistenceTimers.clear();
  dirtyProjects.clear();
  persistenceFailures.clear();
  writeQueues.clear();
  cacheRevision = 0;
  notify();
}

// ── React hook for reactive cache reads ──────────────────────────────────

export function useTargetCacheEntry(projectId, baseDesignFingerprint, targetKey) {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => getTargetCacheEntry(projectId, baseDesignFingerprint, targetKey),
    () => getTargetCacheEntry(projectId, baseDesignFingerprint, targetKey),
  );
}

export function useTargetCacheProgress(projectId, baseDesignFingerprint, allTargetKeys) {
  useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => cacheRevision,
    () => cacheRevision,
  );
  return getTargetCacheProgress(projectId, baseDesignFingerprint, allTargetKeys);
}

export function useTargetCacheHydration(projectId) {
  useEffect(() => {
    hydrateTargetCache(projectId);
  }, [projectId]);
}