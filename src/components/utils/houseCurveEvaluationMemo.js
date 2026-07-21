export function stableBankSignature(filters) {
  return JSON.stringify((filters || []).map((filter) => Object.keys(filter || {})
    .sort()
    .map((key) => [key, filter[key]])));
}

export function bankResponseSignature(filters) {
  return (filters || []).map((filter) => `${filter?.enabled ? 1 : 0}:${filter?.frequencyHz}:${filter?.gainDb}:${filter?.Q}`).join("|");
}

export function createHouseCurveEvaluationMemo(enabled = true) {
  return {
    enabled,
    correctedCurves: new Map(),
    metricGrids: new Map(),
    metrics: new Map(),
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