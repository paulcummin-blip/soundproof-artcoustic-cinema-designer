/**
 * p19HeatMapCache.js
 * ------------------
 * In-memory cache for the P19 spatial heat map.
 *
 * Keyed by: projectId::versionId::calibrationFingerprint + heatmap authority
 * version + grid size + ear height.
 *
 * The composite (projectId, versionId) prefix guarantees version isolation
 * even if two versions share the same calibration fingerprint. Reused on
 * reopen/export if the fingerprint still matches. Invalidated automatically
 * when the calibration fingerprint changes (which captures all bass-relevant
 * design inputs).
 */

import { bassCacheKey } from "@/components/room/bass/bassCacheKey";

const cache = new Map();
const MAX_ENTRIES = 12;

export function buildCacheKey({ projectId, versionId, calibrationFingerprint, authorityVersion, gridN, earHeightM }) {
  if (!calibrationFingerprint) return null;
  const vk = bassCacheKey(projectId, versionId);
  return `${vk}::p19hm|${calibrationFingerprint}|v${authorityVersion}|g${gridN}|e${Number(earHeightM || 0).toFixed(3)}`;
}

export function getCachedMap(cacheKey) {
  if (!cacheKey) return null;
  return cache.get(cacheKey) || null;
}

export function setCachedMap(cacheKey, result) {
  if (!cacheKey) return;
  // Evict oldest entries if cache is full
  if (cache.size >= MAX_ENTRIES) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
  cache.set(cacheKey, { ...result, cachedAt: Date.now() });
}

export function clearCache() {
  cache.clear();
}

export function getCacheSize() {
  return cache.size;
}