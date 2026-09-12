/**
 * resolveSeatMetric.js — Canonical seat-scoped RP22 metric resolver.
 *
 * Prefers the FRESH engine authority (analysisResult.perSeatRp22 — the same
 * source the Design Rating consumes via buildLightweightSeatHudById) over the
 * UI-view-dependent cache (seatSnapshotsById, populated by
 * useSeatMetricsCacheEffect which only runs when the Plan view is mounted).
 *
 * This eliminates the data-source mismatch where the Compliance panel showed
 * a stale "Not Calculated" while the Design Rating showed the fresh engine
 * grade (e.g. P5 90° = L1).
 *
 * The UI cache is retained as a fallback for locally-computed metrics (P16,
 * P6, P1, P4) that buildSeatHudSnapshot derives from live plan-view geometry
 * and which the engine may not have published.
 */

/**
 * Resolve a seat-scoped RP22 metric, preferring the fresh engine authority.
 *
 * @param {string} seatId - The seat ID to resolve (e.g. "seat-1", "mlp")
 * @param {string} paramKey - Parameter key like "p5"
 * @param {Object} analysisResult - The canonical analysis result containing perSeatRp22
 * @param {Object} seatSnapshotsById - UI cache map of seatId → HUD snapshot
 * @param {string|null} mlpSeatId - MLP seat ID for fallback resolution
 * @returns {Object|null} The resolved metric object, or null if not found
 */
export function resolveSeatMetric(seatId, paramKey, analysisResult, seatSnapshotsById, mlpSeatId) {
  if (!seatId) return null;
  const numKey = parseInt(String(paramKey).replace(/^p/i, ""), 10);
  if (!Number.isFinite(numKey)) return null;

  const perSeatRp22 = analysisResult?.perSeatRp22;
  const candidateIds = seatId === "mlp"
    ? ["mlp", mlpSeatId].filter(Boolean)
    : [seatId, "mlp", mlpSeatId].filter(Boolean);

  // 1. Fresh engine result — canonical per-seat authority (same as Design Rating)
  if (perSeatRp22) {
    for (const cid of candidateIds) {
      const engineRp22 = perSeatRp22[cid]?.rp22;
      if (engineRp22 && engineRp22[numKey] != null) {
        return engineRp22[numKey];
      }
    }
  }

  // 2. UI cache fallback (locally-computed metrics not in the engine result)
  for (const cid of candidateIds) {
    const snap = seatSnapshotsById?.[cid];
    if (snap?.rp22?.[paramKey] != null) {
      return snap.rp22[paramKey];
    }
  }

  return null;
}