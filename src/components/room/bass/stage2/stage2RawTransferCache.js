// stage2RawTransferCache.js
// In-memory cache for P14-independent raw transfer results.
//
// Each entry stores the expensive P14-independent modal work:
//   - rspRawCurve
//   - perSeatRawCurves (with isPrimary)
//   - sources (with XYZ, tuning, alignment)
//   - usableLfHz
//   - transitionHz
//
// Keyed by projectId::versionId::placementFingerprint + finalistId.
// The composite (projectId, versionId) prefix guarantees version isolation
// even if two versions share the same placementFingerprint. The placement
// fingerprint survives P14 changes — when P14 changes, the confirmation
// layer reuses the cached raw transfer and only re-runs the EQ/P14/P18/P19/P20
// pipeline.

import { bassCacheKey } from "../bassCacheKey";

const cache = new Map(); // bassCacheKey(projectId,versionId)::placementFingerprint -> Map(finalistId -> rawTransfer)

function versionedKey(projectId, versionId, placementFingerprint) {
  return `${bassCacheKey(projectId, versionId)}::${placementFingerprint}`;
}

export function getCachedRawTransfer(projectId, versionId, placementFingerprint, finalistId) {
  if (!placementFingerprint || !finalistId) return null;
  const byFinalist = cache.get(versionedKey(projectId, versionId, placementFingerprint));
  if (!byFinalist) return null;
  return byFinalist.get(finalistId) || null;
}

export function setCachedRawTransfer(projectId, versionId, placementFingerprint, finalistId, rawTransfer) {
  if (!placementFingerprint || !finalistId || !rawTransfer) return;
  const vk = versionedKey(projectId, versionId, placementFingerprint);
  let byFinalist = cache.get(vk);
  if (!byFinalist) {
    byFinalist = new Map();
    cache.set(vk, byFinalist);
  }
  byFinalist.set(finalistId, rawTransfer);
}

export function hasCachedRawTransfer(projectId, versionId, placementFingerprint, finalistId) {
  return getCachedRawTransfer(projectId, versionId, placementFingerprint, finalistId) != null;
}

export function getCachedRawTransfersForFingerprint(projectId, versionId, placementFingerprint) {
  const byFinalist = cache.get(versionedKey(projectId, versionId, placementFingerprint));
  if (!byFinalist) return new Map();
  return new Map(byFinalist);
}

export function clearRawTransferCache(projectId, versionId, placementFingerprint) {
  if (!placementFingerprint) return;
  cache.delete(versionedKey(projectId, versionId, placementFingerprint));
}

export function clearAllRawTransferCache() {
  cache.clear();
}