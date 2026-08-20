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
import { isAuthoritativeBassContract } from "./completedBassResultPersistence";
import { hasGraphPayload } from "./finishedGraphAdapter";

const cacheByProject = new Map();
const listeners = new Set();
const writeQueues = new Map();
const syncSignatures = new Map();

function notify() { listeners.forEach((l) => l()); }

function projectKey(projectId) { return String(projectId || "free"); }

function ensureCache(projectId) {
  const key = projectKey(projectId);
  if (!cacheByProject.has(key)) {
    cacheByProject.set(key, { baseDesignFingerprint: null, targets: {} });
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
  if (cache.baseDesignFingerprint !== baseDesignFingerprint) return null;
  const entry = cache.targets[targetKey];
  if (!entry || !isAuthoritativeBassContract(entry)) return null;
  // Stage 3: a reusable target must also contain the finished graph payload.
  // Older entries (pre-Stage 3) without graphPayload are treated as cache
  // misses so they get recalculated with the full payload.
  if (!hasGraphPayload(entry)) return null;
  return entry;
}

/**
 * Get cache progress: how many of the 8 targets are ready.
 */
export function getTargetCacheProgress(projectId, baseDesignFingerprint, allTargetKeys) {
  if (!baseDesignFingerprint) return { ready: 0, total: allTargetKeys.length };
  const cache = ensureCache(projectId);
  if (cache.baseDesignFingerprint !== baseDesignFingerprint) return { ready: 0, total: allTargetKeys.length };
  const ready = allTargetKeys.filter((k) => {
    const entry = cache.targets[k];
    return entry && isAuthoritativeBassContract(entry) && hasGraphPayload(entry);
  }).length;
  return { ready, total: allTargetKeys.length };
}

/**
 * Store a compact contract for a target. Resets the cache if the design changed.
 */
export function setTargetCacheEntry(projectId, baseDesignFingerprint, targetKey, compactContract) {
  if (!baseDesignFingerprint || !targetKey || !compactContract) return;
  if (!isAuthoritativeBassContract(compactContract)) return;
  // Stage 3: reject contracts without the required finished graph payload.
  if (!hasGraphPayload(compactContract)) return;
  const cache = ensureCache(projectId);
  if (cache.baseDesignFingerprint !== baseDesignFingerprint) {
    cache.baseDesignFingerprint = baseDesignFingerprint;
    cache.targets = {};
  }
  cache.targets[targetKey] = compactContract;
  notify();
  scheduleSync(projectId);
}

/**
 * Reset the cache when the design changes. Old cached results for a different
 * design are no longer valid.
 */
export function clearTargetCacheForDesign(projectId, baseDesignFingerprint) {
  const cache = ensureCache(projectId);
  if (cache.baseDesignFingerprint === baseDesignFingerprint) return;
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
    if (!stored || !stored.baseDesignFingerprint) return;
    cacheByProject.set(key, {
      baseDesignFingerprint: stored.baseDesignFingerprint,
      targets: stored.targets || {},
    });
    notify();
  } catch (e) {
    // Hydration failure is non-fatal — cache rebuilds from background scheduler
  }
}

function scheduleSync(projectId) {
  const key = projectKey(projectId);
  if (key === "free") return;
  const cache = ensureCache(projectId);
  const signature = JSON.stringify(cache);
  if (syncSignatures.get(key) === signature) return;
  syncSignatures.set(key, signature);
  const queued = (writeQueues.get(key) || Promise.resolve()).then(async () => {
    try {
      const records = await base44.entities.ProjectAnalysisCache.filter({ project_id: key }, '-updated_date', 1);
      const record = Array.isArray(records) ? records[0] : null;
      const payload = { target_cache: cache };
      if (record?.id) {
        await base44.entities.ProjectAnalysisCache.update(record.id, payload);
      } else {
        await base44.entities.ProjectAnalysisCache.create({ project_id: key, ...payload });
      }
    } catch (e) {
      // Sync failure is non-fatal — next change will retry
    }
  });
  writeQueues.set(key, queued);
}

// ── React hook for reactive cache reads ──────────────────────────────────

export function useTargetCacheEntry(projectId, baseDesignFingerprint, targetKey) {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => getTargetCacheEntry(projectId, baseDesignFingerprint, targetKey),
    () => getTargetCacheEntry(projectId, baseDesignFingerprint, targetKey),
  );
}

export function useTargetCacheHydration(projectId) {
  useEffect(() => {
    hydrateTargetCache(projectId);
  }, [projectId]);
}