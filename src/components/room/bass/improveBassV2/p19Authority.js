// p19Authority.js
// ---------------------------------------------------------------------------
// The ONE reader for the canonical P19 authority.
//
// In this model P19 is an AGGREGATE RSP result: the corrected reference
// response measured against the house target. There are no per-seat P19 rows —
// `perSeatP19` is legitimately empty, so any logic that inspects it for a P19
// decision silently sees nothing and reports "no P19 change".
//
// Every P19 comparison in the optimiser (materiality, trade-off classification,
// objective selection, ledger) reads the aggregate authority through here, so
// no module re-derives it and none can drift back to per-seat P19.
//
// Pure: no React, no side effects.
// ---------------------------------------------------------------------------

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

/** Canonical RP22 level 0..4 (0 = FAIL), or null when unstated. */
export function canonicalP19Level(value) {
  if (Number.isInteger(value) && value >= 0 && value <= 4) return value;
  if (value === "FAIL") return 0;
  const match = typeof value === "string" ? value.match(/^L([1-4])$/i) : null;
  return match ? Number(match[1]) : null;
}

/** The aggregate RSP P19 result of a confirmed candidate. */
export function readRspP19(result) {
  return {
    deviationDb: finite(result?.achievedP19VariationDb) ?? finite(result?.officialP19VariationDb),
    level: canonicalP19Level(result?.achievedP19Level),
  };
}

/** Whether a result carries genuine per-seat P19 rows (legacy authority only). */
export function hasPerSeatP19(result) {
  return Array.isArray(result?.perSeatP19) && result.perSeatP19.length > 0;
}

/**
 * Compare the aggregate RSP P19 of a candidate against the baseline.
 *
 * Positive deviationDeltaDb means the response improved (deviation reduced).
 * Returns null when either side carries no aggregate P19 authority — never a
 * fabricated comparison.
 *
 * @param {object} baseline
 * @param {object} candidate
 * @param {number} minDeviationDb - deviation improvement that counts as material
 */
export function compareRspP19(baseline, candidate, minDeviationDb = 1.0) {
  const before = readRspP19(baseline);
  const after = readRspP19(candidate);
  if (before.deviationDb == null || after.deviationDb == null) return null;

  const deviationDeltaDb = before.deviationDb - after.deviationDb; // positive = better
  const levelImproved = before.level != null && after.level != null && after.level > before.level;
  const levelRegressed = before.level != null && after.level != null && after.level < before.level;

  return {
    before,
    after,
    deviationDeltaDb,
    levelImproved,
    levelRegressed,
    improved: levelImproved || (!levelRegressed && deviationDeltaDb >= minDeviationDb),
    regressed: levelRegressed,
  };
}