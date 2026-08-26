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
// Keyed by placementFingerprint + finalistId, this cache survives P14 changes.
// When P14 changes, the confirmation layer reuses the cached raw transfer
// and only re-runs the EQ/P14/P18/P19/P20 pipeline.

const cache = new Map(); // placementFingerprint -> Map(finalistId -> rawTransfer)

export function getCachedRawTransfer(placementFingerprint, finalistId) {
  if (!placementFingerprint || !finalistId) return null;
  const byFinalist = cache.get(placementFingerprint);
  if (!byFinalist) return null;
  return byFinalist.get(finalistId) || null;
}

export function setCachedRawTransfer(placementFingerprint, finalistId, rawTransfer) {
  if (!placementFingerprint || !finalistId || !rawTransfer) return;
  let byFinalist = cache.get(placementFingerprint);
  if (!byFinalist) {
    byFinalist = new Map();
    cache.set(placementFingerprint, byFinalist);
  }
  byFinalist.set(finalistId, rawTransfer);
}

export function hasCachedRawTransfer(placementFingerprint, finalistId) {
  return getCachedRawTransfer(placementFingerprint, finalistId) != null;
}

export function getCachedRawTransfersForFingerprint(placementFingerprint) {
  const byFinalist = cache.get(placementFingerprint);
  if (!byFinalist) return new Map();
  return new Map(byFinalist);
}

export function clearRawTransferCache(placementFingerprint) {
  if (!placementFingerprint) return;
  cache.delete(placementFingerprint);
}

export function clearAllRawTransferCache() {
  cache.clear();
}