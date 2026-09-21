/**
 * Canonical Sound Proof P19/P20 grading and level aggregation.
 *
 * This module is the only place that floors bass deviations, maps them to
 * RP22 levels, or selects the lowest level from a set. It is dependency-free
 * so browser code, workers and persistence fixtures all use the same policy.
 *
 * Policy: floor the full-precision value. Never round or ceil.
 */

export const BASS_LEVEL_RANK = Object.freeze({
  FAIL: 0,
  L1: 1,
  L2: 2,
  L3: 3,
  L4: 4,
});

export const BASS_RANK_LEVEL = Object.freeze(["FAIL", "L1", "L2", "L3", "L4"]);

export function floorBassDeviation(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.floor(numeric) : null;
}

export function gradeP19(value) {
  const wholeDb = floorBassDeviation(value);
  if (wholeDb == null) return null;
  if (wholeDb <= 2) return 4;
  if (wholeDb <= 3) return 3;
  if (wholeDb <= 4) return 2;
  if (wholeDb <= 5) return 1;
  return 0;
}

export function gradeP20(value) {
  const wholeDb = floorBassDeviation(value);
  if (wholeDb == null) return null;
  if (wholeDb <= 2) return 4;
  if (wholeDb <= 3) return 3;
  if (wholeDb <= 4) return 2;
  return 1;
}

export function canonicalBassLevel(value) {
  if (value === 0 || String(value ?? "").trim().toUpperCase() === "FAIL") return "FAIL";
  const match = String(value ?? "").trim().toUpperCase().match(/^L?([1-4])$/);
  return match ? `L${match[1]}` : null;
}

export function bassLevelFromRank(rank) {
  const numeric = Number(rank);
  return Number.isInteger(numeric) && numeric >= 0 && numeric <= 4
    ? BASS_RANK_LEVEL[numeric]
    : null;
}

export function bassRankFromLevel(level) {
  const canonical = canonicalBassLevel(level);
  return canonical == null ? null : BASS_LEVEL_RANK[canonical];
}

export function lowestBassLevel(levels) {
  const ranks = (Array.isArray(levels) ? levels : [])
    .map(bassRankFromLevel)
    .filter((rank) => rank != null);
  return ranks.length ? bassLevelFromRank(Math.min(...ranks)) : null;
}

export function lowestPrimaryP19P20Level(result) {
  const p19 = Array.isArray(result?.perSeatP19) ? result.perSeatP19 : [];
  const p20 = Array.isArray(result?.perSeatP20) ? result.perSeatP20 : [];
  const primary = [...p19, ...p20].filter((seat) => seat?.isPrimary === true);
  const scoped = primary.length ? primary : [...p19, ...p20];
  return lowestBassLevel(scoped.map((seat) => seat?.level));
}
