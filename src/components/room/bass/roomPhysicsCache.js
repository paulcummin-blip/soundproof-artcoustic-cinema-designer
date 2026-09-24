/**
 * roomPhysicsCache.js
 * --------------------
 * Geometry-keyed LRU cache for the authoritative room-physics simulation
 * result (perSourceRspComplexTransfers + seatResponses).
 *
 * Room physics is independent of design objectives (P14/P18 target).
 * Changing the P14 target must NOT invalidate or re-run room physics.
 * This cache stores the simulation result keyed by the geometry
 * fingerprint, so that a P14-only change reuses the cached room response
 * and only re-runs the optimiser.
 *
 * The cache is invalidated automatically when the geometry fingerprint
 * changes (room dims, source positions, seats, absorption, physics
 * flags) — a new key simply misses.
 *
 * Single module-level instance, shared across all projects/versions.
 * Bounded to MAX_ENTRIES to prevent unbounded growth across projects.
 */

const MAX_ENTRIES = 8;
const cache = new Map(); // geometryFingerprint -> { result, storedAtMs }

/**
 * Read a cached room-physics result by geometry fingerprint.
 * @param {string} geometryFingerprint
 * @returns {object|null} The cached simulation result, or null on miss.
 */
export function getCachedRoomPhysics(geometryFingerprint) {
  if (!geometryFingerprint) return null;
  const entry = cache.get(geometryFingerprint);
  if (!entry) return null;
  // Move to end (most-recently used) for LRU eviction.
  cache.delete(geometryFingerprint);
  cache.set(geometryFingerprint, entry);
  return entry.result;
}

/**
 * Store a room-physics simulation result keyed by geometry fingerprint.
 * @param {string} geometryFingerprint
 * @param {object} result — the authoritative simulation result
 *   (simulationResults from useAuthoritativeBassResponse).
 */
export function setCachedRoomPhysics(geometryFingerprint, result) {
  if (!geometryFingerprint || !result) return;
  if (cache.has(geometryFingerprint)) cache.delete(geometryFingerprint);
  cache.set(geometryFingerprint, { result, storedAtMs: Date.now() });
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
}

/**
 * Clear the room-physics cache. If a geometry fingerprint is provided,
 * only that entry is removed; otherwise the entire cache is cleared.
 * @param {string} [geometryFingerprint]
 */
export function clearCachedRoomPhysics(geometryFingerprint) {
  if (geometryFingerprint) cache.delete(geometryFingerprint);
  else cache.clear();
}