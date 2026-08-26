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
import { COMPLETED_BASS_CACHE_VERSION, INSTANCE_AUTHORITY_VERSION, RP22_BASS_METRIC_SCHEMA_VERSION } from "../../../../base44/shared/bassAuthorityVersion.js";
import { isAuthoritativeBassContract } from "./completedBassResultPersistence";
import { hasGraphPayload } from "./finishedGraphAdapter";
import { hasReadyCanonicalP19Contract } from "./p19Readiness";

const cacheByProject = new Map();
const listeners = new Set();
const writeQueues = new Map();
const persistedSignatures = new Map();
const persistenceTimers = new Map();
const dirtyProjects = new Set();
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
  if (!entry || !isAuthoritativeBassContract(entry)) return null;
  // Stage 3: a reusable target must also contain the finished graph payload.
  // Older entries (pre-Stage 3) without graphPayload are treated as cache
  // misses so they get recalculated with the full payload.
  if (!hasGraphPayload(entry)) return null;
  if (!hasReadyCanonicalP19Contract(entry)) return null;
  return entry;
}

/**
 * Get cache progress: how many of the 8 targets are ready.
 */
export function getTargetCacheProgress(projectId, baseDesignFingerprint, allTargetKeys) {
  const keys = Array.isArray(allTargetKeys) ? allTargetKeys : [];
  if (!baseDesignFingerprint) return { ready: 0, total: keys.length, completedDurationsMs: [], readyTargetKeys: [] };
  const cache = ensureCache(projectId);
  if (cache.metricSchemaVersion !== RP22_BASS_METRIC_SCHEMA_VERSION) return { ready: 0, total: keys.length, completedDurationsMs: [], readyTargetKeys: [] };
  if (cache.baseDesignFingerprint !== baseDesignFingerprint) return { ready: 0, total: keys.length, completedDurationsMs: [], readyTargetKeys: [] };
  const readyTargetKeys = [];
  const completedDurationsMs = [];
  keys.forEach((key) => {
    const entry = cache.targets[key];
    const ready = entry && isAuthoritativeBassContract(entry) && hasGraphPayload(entry) && hasReadyCanonicalP19Contract(entry);
    if (!ready) return;
    readyTargetKeys.push(key);
    const elapsedMs = Number(entry?.job?.elapsedMs);
    if (Number.isFinite(elapsedMs) && elapsedMs > 0) completedDurationsMs.push(elapsedMs);
  });
  return { ready: readyTargetKeys.length, total: keys.length, completedDurationsMs, readyTargetKeys };
}

/**
 * Store a compact contract for a target. Resets the cache if the design changed.
 */
export function setTargetCacheEntry(projectId, baseDesignFingerprint, targetKey, compactContract, { deferPersistence = false } = {}) {
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
  scheduleSync(projectId, { deferPersistence });
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

function scheduleSync(projectId, { deferPersistence = false } = {}) {
  const key = projectKey(projectId);
  if (key === "free") return;
  dirtyProjects.add(key);
  const previousTimer = persistenceTimers.get(key);
  if (previousTimer != null) clearTimeout(previousTimer);
  persistenceTimers.delete(key);
  if (deferPersistence) return;
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
    } catch (e) {
      // Preserve the dirty marker so the next target, explicit sweep flush, or
      // navigation cleanup retries the latest in-memory snapshot.
      dirtyProjects.add(key);
    }
    if (JSON.stringify(ensureCache(key)) !== persistedSignatures.get(key)) {
      dirtyProjects.add(key);
    }
  });
  writeQueues.set(key, queued);
  return queued;
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