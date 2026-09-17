// zeroFailOptimiser.js
// ---------------------------------------------------------------------------
// Zero-fail-first optimisation policy for Improve Bass Response V2.
//
// Philosophy:
//   1. FIRST: minimise the number of failing seats (P19 OR P20 FAIL).
//   2. THEN: maximise the primary-seat floor (worst-first lexicographic).
//   3. THEN: raw margins as tie-breaker.
//   4. THEN: secondary seats.
//
// This replaces the blanket primary-seat regression veto with a floor-first
// comparator that allows trading a strong primary seat to eliminate FAILs.
//
// No acoustic maths are changed. This is selection policy only.
// ---------------------------------------------------------------------------

function numericLevel(value) {
  if (Number.isFinite(Number(value))) return Math.max(0, Math.min(4, Number(value)));
  const match = String(value || "").match(/^L([1-4])$/i);
  return match ? Number(match[1]) : 0;
}

function isFail(level) {
  return numericLevel(level) === 0;
}

/**
 * Count the number of seats that FAIL P19 OR P20.
 * A seat fails if its P19 level is FAIL (0) OR its P20 level is FAIL (0).
 * Counts across ALL seats (primary + secondary).
 */
export function countFailingSeats(result) {
  const p19 = Array.isArray(result?.perSeatP19) ? result.perSeatP19 : [];
  const p20 = Array.isArray(result?.perSeatP20) ? result.perSeatP20 : [];
  const p19FailIds = new Set(p19.filter(s => isFail(s.level)).map(s => String(s.seatId)));
  const p20FailIds = new Set(p20.filter(s => isFail(s.level)).map(s => String(s.seatId)));
  const allSeatIds = new Set([
    ...p19.map(s => String(s.seatId)),
    ...p20.map(s => String(s.seatId)),
  ]);
  let count = 0;
  for (const id of allSeatIds) {
    if (p19FailIds.has(id) || p20FailIds.has(id)) count++;
  }
  return count;
}

/**
 * Count total P19 FAIL results + P20 FAIL results.
 * A seat failing both P19 and P20 counts as 2.
 * Secondary diagnostic to the primary failing-seat count.
 */
export function countParameterFails(result) {
  const p19 = Array.isArray(result?.perSeatP19) ? result.perSeatP19 : [];
  const p20 = Array.isArray(result?.perSeatP20) ? result.perSeatP20 : [];
  return p19.filter(s => isFail(s.level)).length + p20.filter(s => isFail(s.level)).length;
}

/**
 * Build a sorted ascending grade vector for seats of the given priority.
 * Combines P19 and P20 grades. Returns negated levels for ascending tuple
 * (higher grade = more negative = sorts first = better).
 * Worst-first: smallest grade first after sorting ascending.
 */
function floorVector(result, isPrimary) {
  const p19 = (Array.isArray(result?.perSeatP19) ? result.perSeatP19 : []).filter(s => !!s.isPrimary === isPrimary);
  const p20 = (Array.isArray(result?.perSeatP20) ? result.perSeatP20 : []).filter(s => !!s.isPrimary === isPrimary);
  const grades = [...p19, ...p20].map(s => numericLevel(s.level));
  grades.sort((a, b) => a - b); // ascending (worst/smallest first)
  return grades.map(g => -g); // negate: higher grade = more negative = sorts first
}

/**
 * Build a sorted descending raw-deviation vector for seats of the given priority.
 * Combines P19 and P20 raws. Worst (highest) first. Lower raw = better.
 */
function rawMarginVector(result, isPrimary) {
  const p19 = (Array.isArray(result?.perSeatP19) ? result.perSeatP19 : []).filter(s => !!s.isPrimary === isPrimary);
  const p20 = (Array.isArray(result?.perSeatP20) ? result.perSeatP20 : []).filter(s => !!s.isPrimary === isPrimary);
  const raws = [...p19, ...p20].map(s => Math.abs(Number(s?.variationDbRaw) || 0));
  raws.sort((a, b) => b - a); // descending (worst/highest first)
  return raws; // lower = better (ascending tuple)
}

/**
 * Build the zero-fail-first comparison tuple.
 * Lower tuple = better candidate.
 *
 * Order:
 *   1. -failingSeatCount  (fewer fails = more negative = sorts first)
 *   2. -parameterFailCount
 *   3. primary floor vector (worst-first, negated levels)
 *   4. primary raw-margin vector (worst-first, lower = better)
 *   5. secondary floor vector
 *   6. secondary raw-margin vector
 *   7. P18 level, P18 Hz, P14 level, P14 dB (existing tie-breakers)
 */
export function zeroFailTuple(result) {
  return [
    countFailingSeats(result),
    countParameterFails(result),
    ...floorVector(result, true),
    ...rawMarginVector(result, true),
    ...floorVector(result, false),
    ...rawMarginVector(result, false),
    -numericLevel(result?.p18AchievedLevel),
    Number(result?.achievedP18Hz) || 0,
    -numericLevel(result?.p14AchievedLevel),
    -Number(result?.p14AchievedDb) || 0,
  ];
}

/**
 * Compare two candidates using the zero-fail-first policy.
 * Returns negative if a is better, positive if b is better, 0 if tied.
 */
export function compareZeroFailFirst(a, b) {
  const left = zeroFailTuple(a), right = zeroFailTuple(b);
  const len = Math.max(left.length, right.length);
  for (let i = 0; i < len; i++) {
    const lv = left[i] ?? 0, rv = right[i] ?? 0;
    if (Math.abs(lv - rv) > 1e-8) return lv - rv;
  }
  return 0;
}

/**
 * Hard safety regression: P14 or P18 level drop only.
 * Does NOT check P19 L3+ protection — that blanket veto was removed
 * by the zero-fail-first policy. A candidate may trade a strong primary
 * P19 seat to eliminate FAILs elsewhere.
 */
export function hasHardSafetyRegression(candidateMetrics, currentMetrics) {
  if (!currentMetrics) return { regressed: false };
  if (candidateMetrics.p14Level < currentMetrics.p14Level) {
    return { regressed: true, parameter: "P14", current: currentMetrics.p14Level, candidate: candidateMetrics.p14Level };
  }
  if (candidateMetrics.p18Level < currentMetrics.p18Level) {
    return { regressed: true, parameter: "P18", current: currentMetrics.p18Level, candidate: candidateMetrics.p18Level };
  }
  return { regressed: false };
}

/**
 * Check whether any seat that was passing (not FAIL) in current has become
 * FAIL in candidate. Used to detect "moved fails" at same fail count.
 * If fails simply moved from one seat to another (same count), the
 * candidate is not a net improvement on the zero-fail objective.
 */
export function hasNewFailingSeats(currentResult, candidateResult) {
  const currentFailSeats = new Set();
  for (const s of (currentResult?.perSeatP19 || [])) if (isFail(s.level)) currentFailSeats.add(String(s.seatId));
  for (const s of (currentResult?.perSeatP20 || [])) if (isFail(s.level)) currentFailSeats.add(String(s.seatId));
  for (const s of (candidateResult?.perSeatP19 || [])) {
    if (isFail(s.level) && !currentFailSeats.has(String(s.seatId))) return true;
  }
  for (const s of (candidateResult?.perSeatP20 || [])) {
    if (isFail(s.level) && !currentFailSeats.has(String(s.seatId))) return true;
  }
  return false;
}