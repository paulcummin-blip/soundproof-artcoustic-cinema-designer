export const HOUSE_CURVE_MEMO_LIMITS = Object.freeze({
  correctedCurves: 32,
  metricGrids: 16,
  metrics: 32,
  filterResponses: 64,
});

class BoundedLruMap extends Map {
  constructor(limit) {
    super();
    this.limit = Math.max(1, Number(limit) || 1);
  }

  get(key) {
    if (!super.has(key)) return undefined;
    const value = super.get(key);
    // Promote exact hits so the working set for the current optimisation
    // iteration remains resident while older one-off trial banks are released.
    super.delete(key);
    super.set(key, value);
    return value;
  }

  set(key, value) {
    if (super.has(key)) super.delete(key);
    super.set(key, value);
    while (this.size > this.limit) {
      const oldestKey = this.keys().next().value;
      super.delete(oldestKey);
    }
    return this;
  }
}

export function stableBankSignature(filters) {
  return JSON.stringify((filters || []).map((filter) => Object.keys(filter || {})
    .sort()
    .map((key) => [key, filter[key]])));
}

export function bankResponseSignature(filters) {
  return (filters || []).map((filter) => `${filter?.enabled ? 1 : 0}:${filter?.frequencyHz}:${filter?.gainDb}:${filter?.Q}`).join("|");
}

// Per-filter PEQ response-vector cache key. Contains every mathematically
// relevant input so that identical filter parameters on the same canonical
// frequency grid produce cache hits, while any change to type, enabled
// state, frequency, gain, Q, polarity, or grid identity misses. Full-precision
// values are used (no rounding) to guarantee exact floating-point identity.
export function filterResponseCacheKey(filter, gridIdentity) {
  const f = filter || {};
  return [
    f.type ?? "Peak",
    f.enabled ? 1 : 0,
    Number(f.frequencyHz),
    Number(f.gainDb),
    Number(f.Q),
    f.polarity ?? 0,
    gridIdentity,
  ].join("|");
}

export function createHouseCurveEvaluationMemo(enabled = true) {
  return {
    enabled,
    correctedCurves: new BoundedLruMap(HOUSE_CURVE_MEMO_LIMITS.correctedCurves),
    metricGrids: new BoundedLruMap(HOUSE_CURVE_MEMO_LIMITS.metricGrids),
    metrics: new BoundedLruMap(HOUSE_CURVE_MEMO_LIMITS.metrics),
    filterResponses: new BoundedLruMap(HOUSE_CURVE_MEMO_LIMITS.filterResponses),
  };
}

export function readExactMemo(cache, key, operationCounts, hitField) {
  if (!cache?.has(key)) return null;
  if (operationCounts && hitField) operationCounts[hitField] += 1;
  return cache.get(key);
}

export function writeExactMemo(cache, key, value, enabled) {
  if (enabled) cache.set(key, value);
  return value;
}