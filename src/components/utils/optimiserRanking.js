// optimiserRanking.js — Pure, deterministic priority-mode ranking for bass optimiser candidates.
// Level mapping: FAIL=0, L1=1, L2=2, L3=3, L4=4. Higher numeric values = higher achieved performance.
// Existing candidate fields already contain numeric levels 1–4 (or 0 for fail); these are preserved.

const levelValue = (level) => {
  const n = Number(level);
  return Number.isFinite(n) ? Math.max(0, Math.min(4, Math.round(n))) : 0;
};

const numOr = (v, fallback) => Number.isFinite(v) ? v : fallback;
const variationOr = (v) => Number.isFinite(v) ? v : Infinity;
const filterCount = (candidate) => {
  const bank = candidate?.generatedFilterBank;
  return Array.isArray(bank) ? bank.filter(f => f?.enabled).length : 0;
};

// Available accuracy levels for Accuracy mode: [RSP P19, worst-seat, P20 if available].
function accuracyLevels(candidate) {
  const levels = [
    levelValue(candidate.achievedP19Level),
    levelValue(candidate.worstRealSeatHouseCurveLevel),
  ];
  if (candidate.p20Available) levels.push(levelValue(candidate.achievedP20Level));
  return levels.sort((a, b) => a - b);
}

// Available levels for Balanced mode: [P14, P18, RSP P19, worst-seat, P20 if available].
function balancedLevels(candidate) {
  const levels = [
    levelValue(candidate.achievedP14Level),
    levelValue(candidate.achievedP18Level),
    levelValue(candidate.achievedP19Level),
    levelValue(candidate.worstRealSeatHouseCurveLevel),
  ];
  if (candidate.p20Available) levels.push(levelValue(candidate.achievedP20Level));
  return levels.sort((a, b) => a - b);
}

// Weakest level among metrics excluding the primary.
function weakestRemaining(candidate, exclude) {
  const all = {
    p14: levelValue(candidate.achievedP14Level),
    p18: levelValue(candidate.achievedP18Level),
    p19: levelValue(candidate.achievedP19Level),
    seat: levelValue(candidate.worstRealSeatHouseCurveLevel),
  };
  if (candidate.p20Available) all.p20 = levelValue(candidate.achievedP20Level);
  const vals = Object.entries(all).filter(([key]) => key !== exclude).map(([, v]) => v);
  return vals.length ? Math.min(...vals) : 0;
}

// Lexicographic comparison of sorted-ascending level arrays (higher is better).
function compareLevelArrays(aLevels, bLevels) {
  const len = Math.max(aLevels.length, bLevels.length);
  for (let i = 0; i < len; i++) {
    const a = aLevels[i] ?? 0;
    const b = bLevels[i] ?? 0;
    if (a !== b) return b - a;
  }
  return 0;
}

// Prioritise SPL: highest P14 level, then highest P14 dB, then weakest remaining, then P19, then fewest filters.
function compareForSpl(a, b) {
  const d1 = levelValue(b.achievedP14Level) - levelValue(a.achievedP14Level);
  if (d1 !== 0) return d1;
  const d2 = numOr(b.achievedP14Db, -Infinity) - numOr(a.achievedP14Db, -Infinity);
  if (d2 !== 0) return d2;
  const d3 = weakestRemaining(b, "p14") - weakestRemaining(a, "p14");
  if (d3 !== 0) return d3;
  const d4 = variationOr(a.achievedP19VariationDb) - variationOr(b.achievedP19VariationDb);
  if (d4 !== 0) return d4;
  return filterCount(a) - filterCount(b);
}

// Prioritise extension: highest P18 level, then lowest extension Hz, then weakest remaining, then P14 dB, then P19.
function compareForExtension(a, b) {
  const d1 = levelValue(b.achievedP18Level) - levelValue(a.achievedP18Level);
  if (d1 !== 0) return d1;
  const aHz = numOr(a.achievedP18FrequencyHz, Infinity);
  const bHz = numOr(b.achievedP18FrequencyHz, Infinity);
  const d2 = aHz - bHz;
  if (d2 !== 0) return d2;
  const d3 = weakestRemaining(b, "p18") - weakestRemaining(a, "p18");
  if (d3 !== 0) return d3;
  const d4 = numOr(b.achievedP14Db, -Infinity) - numOr(a.achievedP14Db, -Infinity);
  if (d4 !== 0) return d4;
  return variationOr(a.achievedP19VariationDb) - variationOr(b.achievedP19VariationDb);
}

// Prioritise house-curve accuracy: max-min across accuracy levels, then deviations, then P14/P18, then fewest filters.
function compareForAccuracy(a, b) {
  const dLevels = compareLevelArrays(accuracyLevels(a), accuracyLevels(b));
  if (dLevels !== 0) return dLevels;
  const d4 = variationOr(a.worstRealSeatHouseCurveVariationDb) - variationOr(b.worstRealSeatHouseCurveVariationDb);
  if (d4 !== 0) return d4;
  const d5 = variationOr(a.achievedP19VariationDb) - variationOr(b.achievedP19VariationDb);
  if (d5 !== 0) return d5;
  if (a.p20Available && b.p20Available) {
    const d6 = variationOr(a.achievedP20VariationDb) - variationOr(b.achievedP20VariationDb);
    if (d6 !== 0) return d6;
  }
  const d7 = levelValue(b.achievedP14Level) - levelValue(a.achievedP14Level);
  if (d7 !== 0) return d7;
  const d8 = levelValue(b.achievedP18Level) - levelValue(a.achievedP18Level);
  if (d8 !== 0) return d8;
  return filterCount(a) - filterCount(b);
}

// Balanced: max-min across all levels, then deviations, then P14 dB, then P18 Hz, then fewest filters.
function compareForBalanced(a, b) {
  const dLevels = compareLevelArrays(balancedLevels(a), balancedLevels(b));
  if (dLevels !== 0) return dLevels;
  const d2 = variationOr(a.worstRealSeatHouseCurveVariationDb) - variationOr(b.worstRealSeatHouseCurveVariationDb);
  if (d2 !== 0) return d2;
  const d3 = variationOr(a.achievedP19VariationDb) - variationOr(b.achievedP19VariationDb);
  if (d3 !== 0) return d3;
  if (a.p20Available && b.p20Available) {
    const d4 = variationOr(a.achievedP20VariationDb) - variationOr(b.achievedP20VariationDb);
    if (d4 !== 0) return d4;
  }
  const d5 = numOr(b.achievedP14Db, -Infinity) - numOr(a.achievedP14Db, -Infinity);
  if (d5 !== 0) return d5;
  const aHz = numOr(a.achievedP18FrequencyHz, Infinity);
  const bHz = numOr(b.achievedP18FrequencyHz, Infinity);
  const d6 = aHz - bHz;
  if (d6 !== 0) return d6;
  return filterCount(a) - filterCount(b);
}

const COMPARATORS = { spl: compareForSpl, extension: compareForExtension, accuracy: compareForAccuracy, balanced: compareForBalanced };

// Part F: Profile-aware eligibility filtering applied before the comparator.
// SPL and Extension modes select from Standard candidates only. Accuracy mode
// selects from Accuracy candidates first, falling back to Standard only if no
// credible Accuracy candidate exists. Balanced mode considers both families.
function filterByProfileEligibility(pool, mode) {
  if (!Array.isArray(pool) || pool.length === 0) return { eligiblePool: pool, eligibilityNote: "Empty pool" };
  const profileOf = (c) => c?.designEqFitProfile || "standard";
  if (mode === "spl" || mode === "extension") {
    const standard = pool.filter((c) => profileOf(c) === "standard");
    if (standard.length === 0) return { eligiblePool: pool, eligibilityNote: "Full pool (no Standard candidates)" };
    return { eligiblePool: standard, eligibilityNote: "Standard candidates only" };
  }
  if (mode === "accuracy") {
    const accuracy = pool.filter((c) => profileOf(c) === "accuracy");
    if (accuracy.length > 0) return { eligiblePool: accuracy, eligibilityNote: "Accuracy candidates" };
    const standard = pool.filter((c) => profileOf(c) === "standard");
    if (standard.length > 0) return { eligiblePool: standard, eligibilityNote: "Standard fallback (no credible Accuracy candidate)" };
    return { eligiblePool: pool, eligibilityNote: "Full pool (no Accuracy or Standard candidates)" };
  }
  return { eligiblePool: pool, eligibilityNote: "Both Standard and Accuracy candidates" };
}

// Non-mutating single-pass best-candidate selection from a pool.
export function selectBestCandidate(pool, priorityMode) {
  const mode = ["balanced", "spl", "extension", "accuracy"].includes(priorityMode) ? priorityMode : "balanced";
  const compare = COMPARATORS[mode];
  if (!Array.isArray(pool) || pool.length === 0) return { selected: null, selectionReason: "Empty pool" };
  const { eligiblePool, eligibilityNote } = filterByProfileEligibility(pool, mode);
  let best = eligiblePool[0];
  for (let i = 1; i < eligiblePool.length; i++) {
    if (compare(eligiblePool[i], best) < 0) best = eligiblePool[i];
  }
  const selectedProfile = best?.designEqFitProfile || "standard";
  return {
    selected: best,
    selectionReason: `Selected by ${mode} comparator from ${eligibilityNote} (${eligiblePool.length} of ${pool.length} candidates). Selected profile: ${selectedProfile}.`,
  };
}

// Deterministic fixture tests proving each priority mode behaves differently.
export function runRankingFixtures() {
  const results = {};
  const mk = (p14, p18, p19, seat, p20, p20Avail) => ({
    achievedP14Level: p14, achievedP18Level: p18, achievedP19Level: p19,
    worstRealSeatHouseCurveLevel: seat, achievedP20Level: p20, p20Available: p20Avail,
    achievedP14Db: 100 + p14 * 3, achievedP18FrequencyHz: 40 - p18 * 5,
    achievedP19VariationDb: 6 - p19, worstRealSeatHouseCurveVariationDb: 6 - seat,
    achievedP20VariationDb: p20Avail ? 6 - p20 : null,
    generatedFilterBank: Array.from({ length: p14 }, () => ({ enabled: true })),
  });
  results.l4AboveL3 = compareForBalanced(mk(4,4,4,4,4,true), mk(3,3,3,3,3,true)) < 0;
  results.l3AboveL2 = compareForBalanced(mk(3,3,3,3,3,true), mk(2,2,2,2,2,true)) < 0;
  results.l2AboveL1 = compareForBalanced(mk(2,2,2,2,2,true), mk(1,1,1,1,1,true)) < 0;
  results.l1AboveFail = compareForBalanced(mk(1,1,1,1,1,true), mk(0,0,0,0,0,true)) < 0;
  results.balancedL2L2L2L2BeatsL1L3L3L3 = compareForBalanced(mk(2,2,2,2,2,true), mk(1,3,3,3,3,true)) < 0;
  results.accuracyL2L2L2BeatsL4L1L1 = compareForAccuracy(mk(2,2,2,2,2,true), mk(1,1,4,1,1,true)) < 0;
  results.splSelectsHighestP14 = compareForSpl(mk(4,1,1,1,1,true), mk(3,4,4,4,4,true)) < 0;
  results.extensionSelectsBestP18 = compareForExtension(mk(1,4,1,1,1,true), mk(4,3,4,4,4,true)) < 0;
  return results;
}