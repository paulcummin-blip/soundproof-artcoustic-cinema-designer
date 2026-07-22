export const BASS_PRIORITY_MODES = Object.freeze({
  BALANCED: "balanced",
  HOUSE_CURVE_ACCURACY: "house_curve_accuracy",
  DEPTH: "depth",
  SPL: "spl",
});

export const CANONICAL_BASS_PRIORITY_MODES = Object.freeze(Object.values(BASS_PRIORITY_MODES));

export function normalizeBassPriorityMode(mode) {
  if (mode === "accuracy") return BASS_PRIORITY_MODES.HOUSE_CURVE_ACCURACY;
  if (mode === "extension") return BASS_PRIORITY_MODES.DEPTH;
  return CANONICAL_BASS_PRIORITY_MODES.includes(mode) ? mode : BASS_PRIORITY_MODES.BALANCED;
}

export function bassLevelScore(value) {
  const parsed = typeof value === "string" ? Number(value.replace(/^L/i, "")) : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(4, Math.round(parsed))) : 0;
}

const finiteOr = (value, fallback) => Number.isFinite(value) ? value : fallback;
const lowerScore = (value) => -finiteOr(value, Number.MAX_SAFE_INTEGER);
const levels = (candidate) => [candidate?.achievedP14Level, candidate?.achievedP18Level, candidate?.achievedP19Level].map(bassLevelScore);
const balancedTuple = (candidate) => levels(candidate).sort((a, b) => a - b);
const levelSpread = (candidate) => {
  const tuple = levels(candidate);
  return Math.max(...tuple) - Math.min(...tuple);
};
const worstSeatDeviation = (candidate) => finiteOr(
  candidate?.worstSeatMaxDeviationDb ?? candidate?.worstRealSeatHouseCurveVariationDb ?? candidate?.achievedP19VariationDb,
  Number.MAX_SAFE_INTEGER,
);
const meanSeatDeviation = (candidate) => finiteOr(candidate?.meanSeatMaxDeviationDb, worstSeatDeviation(candidate));
const rmsTargetError = (candidate) => finiteOr(candidate?.rmsSeatTargetErrorDb, candidate?.achievedP19VariationDb ?? Number.MAX_SAFE_INTEGER);
const eqCost = (candidate) => (candidate?.generatedFilterBank || []).reduce((sum, filter) => (
  filter?.enabled && Number.isFinite(filter.gainDb) ? sum + Math.abs(filter.gainDb) : sum
), 0);
const DOMINANCE_DB_TOLERANCE = 0.05;
const DOMINANCE_HZ_TOLERANCE = 0.1;
const enabledFilterCount = (candidate) => (candidate?.generatedFilterBank || []).filter((filter) => filter?.enabled).length;
const maximumPositiveAggregateEqDb = (candidate) => {
  const value = candidate?.aggregateBankLimits?.maxAggregateBoostDb
    ?? candidate?.bankValidationResult?.maxAggregateBoostDb;
  return Number.isFinite(value) ? Math.max(0, value) : null;
};
const lowerMetricComparison = (a, b, tolerance) => {
  if (!Number.isFinite(a) && !Number.isFinite(b)) return { noWorse: true, materiallyBetter: false };
  if (!Number.isFinite(a)) return { noWorse: false, materiallyBetter: false };
  if (!Number.isFinite(b)) return { noWorse: true, materiallyBetter: false };
  return { noWorse: a <= b + tolerance, materiallyBetter: a < b - tolerance };
};
const higherMetricComparison = (a, b, tolerance) => {
  if (!Number.isFinite(a) && !Number.isFinite(b)) return { noWorse: true, materiallyBetter: false };
  if (!Number.isFinite(a)) return { noWorse: false, materiallyBetter: false };
  if (!Number.isFinite(b)) return { noWorse: true, materiallyBetter: false };
  return { noWorse: a + tolerance >= b, materiallyBetter: a > b + tolerance };
};

function strictlyDominatesBalancedFallback(a, b) {
  if (levels(a).some((level, index) => level !== levels(b)[index])) return false;
  const comparisons = [
    lowerMetricComparison(a?.achievedP18FrequencyHz, b?.achievedP18FrequencyHz, DOMINANCE_HZ_TOLERANCE),
    lowerMetricComparison(a?.achievedP19VariationDb, b?.achievedP19VariationDb, DOMINANCE_DB_TOLERANCE),
    lowerMetricComparison(a?.achievedP20VariationDb, b?.achievedP20VariationDb, DOMINANCE_DB_TOLERANCE),
    higherMetricComparison(a?.achievedP14Db, b?.achievedP14Db, DOMINANCE_DB_TOLERANCE),
    lowerMetricComparison(maximumPositiveAggregateEqDb(a), maximumPositiveAggregateEqDb(b), DOMINANCE_DB_TOLERANCE),
    lowerMetricComparison(enabledFilterCount(a), enabledFilterCount(b), 0),
  ];
  return comparisons.every((comparison) => comparison.noWorse)
    && comparisons.some((comparison) => comparison.materiallyBetter);
}

export function removeStrictlyDominatedBalancedFallbacks(candidates) {
  if (!Array.isArray(candidates) || candidates.length < 2) return Array.isArray(candidates) ? candidates : [];
  return candidates.filter((candidate, index) => !candidates.some((other, otherIndex) => (
    index !== otherIndex && strictlyDominatesBalancedFallback(other, candidate)
  )));
}

export function stableCandidateSignature(candidate) {
  if (typeof candidate?.candidateSignature === "string") return candidate.candidateSignature;
  return JSON.stringify({
    request: [candidate?.requestedP14Level, candidate?.requestedP18Level, candidate?.requestedP19Level],
    p14TargetBasis: candidate?.p14TargetBasis || "minimum",
    profile: candidate?.designEqFitProfile || "standard",
    filters: (candidate?.generatedFilterBank || []).map((filter) => [
      !!filter?.enabled, finiteOr(filter?.frequencyHz, null), finiteOr(filter?.gainDb, null), finiteOr(filter?.Q, null),
    ]),
  });
}

export function isBankAndBandValid(candidate) {
  const start = candidate?.assessmentStartHz;
  const end = candidate?.assessmentEndHz;
  return candidate?.bankValidationResult?.allOk === true &&
    Number.isFinite(start) && Number.isFinite(end) && end > start;
}

const isAllL1 = (candidate) => candidate?.allAtLeastL1 === true && levels(candidate).every((score) => score >= 1);

export function rankingTupleForMode(candidate, mode) {
  const canonicalMode = normalizeBassPriorityMode(mode);
  const [p14, p18, p19] = levels(candidate);
  const balance = balancedTuple(candidate);
  if (canonicalMode === BASS_PRIORITY_MODES.HOUSE_CURVE_ACCURACY) return [
    lowerScore(candidate?.houseCurveRankingMaxResidualDb ?? candidate?.rspObjectiveMaxDeviationDb),
    lowerScore(candidate?.houseCurveRankingRmsResidualDb ?? candidate?.rspRmsResidualDb),
    lowerScore(candidate?.houseCurveRankingMeanAbsoluteResidualDb ?? candidate?.rspMeanAbsoluteResidualDb),
    lowerScore(eqCost(candidate)),
  ];
  if (canonicalMode === BASS_PRIORITY_MODES.DEPTH) return [
    p18, lowerScore(candidate?.achievedP18FrequencyHz), Math.min(p14, p19),
    lowerScore(candidate?.achievedP19VariationDb), p14, lowerScore(eqCost(candidate)),
  ];
  if (canonicalMode === BASS_PRIORITY_MODES.SPL) return [
    p14, finiteOr(candidate?.achievedP14Db, -Number.MAX_SAFE_INTEGER), Math.min(p18, p19),
    lowerScore(candidate?.achievedP19VariationDb), lowerScore(candidate?.achievedP18FrequencyHz), lowerScore(eqCost(candidate)),
  ];
  return [...balance, -levelSpread(candidate), lowerScore(worstSeatDeviation(candidate)),
    lowerScore(rmsTargetError(candidate)), lowerScore(eqCost(candidate))];
}

function compareRanked(a, b, mode) {
  const aTuple = rankingTupleForMode(a, mode);
  const bTuple = rankingTupleForMode(b, mode);
  for (let i = 0; i < Math.max(aTuple.length, bTuple.length); i++) {
    const difference = (bTuple[i] ?? -Number.MAX_SAFE_INTEGER) - (aTuple[i] ?? -Number.MAX_SAFE_INTEGER);
    if (difference !== 0) return difference;
  }
  return stableCandidateSignature(a).localeCompare(stableCandidateSignature(b));
}

export function rankBassCandidates(pool, mode) {
  const canonicalMode = normalizeBassPriorityMode(mode);
  const bankValid = Array.isArray(pool) ? pool.filter(isBankAndBandValid) : [];
  const fullyValid = bankValid.filter(isAllL1);
  const houseCurveMode = canonicalMode === BASS_PRIORITY_MODES.HOUSE_CURVE_ACCURACY;
  const houseCurveCandidates = bankValid.filter((candidate) => candidate?.designEqFitProfile === "house_curve");
  const preEqReachedP14L1 = houseCurveCandidates.some((candidate) => candidate?.preEqP14Level >= 1);
  const p14PreservingHouseCandidates = houseCurveCandidates.filter((candidate) => candidate?.achievedP14Level >= 1);
  const baseEligible = houseCurveMode
    ? (preEqReachedP14L1 && p14PreservingHouseCandidates.length ? p14PreservingHouseCandidates : houseCurveCandidates)
    : (fullyValid.length ? fullyValid : bankValid);
  const balancedFallbackDominanceApplied = canonicalMode === BASS_PRIORITY_MODES.BALANCED
    && fullyValid.length === 0 && bankValid.length > 0;
  const eligible = balancedFallbackDominanceApplied
    ? removeStrictlyDominatedBalancedFallbacks(baseEligible)
    : baseEligible;
  const dominatedCandidateCount = balancedFallbackDominanceApplied ? baseEligible.length - eligible.length : 0;
  const p14PreservationUnavailable = houseCurveMode && preEqReachedP14L1 && p14PreservingHouseCandidates.length === 0;
  const eligibilityGroup = p14PreservationUnavailable ? "house_curve_no_admissible_p14_l1_preserving_candidate" :
    houseCurveMode && bankValid.length ? "bank_valid_raw_house_curve_objective" :
    fullyValid.length ? "bank_valid_all_p14_p18_p19_l1" :
    bankValid.length ? "bank_valid_best_calibrated_attempt_below_l1" : "no_bank_and_band_valid_candidates";
  const selected = eligible.length ? [...eligible].sort((a, b) => compareRanked(a, b, canonicalMode))[0] : null;
  const signature = selected ? stableCandidateSignature(selected) : null;
  const rankingTuple = selected ? rankingTupleForMode(selected, canonicalMode) : [];
  const houseCurveCandidate = houseCurveMode
    ? [...eligible].filter((candidate) => candidate?.designEqFitProfile === "house_curve").sort((a, b) => compareRanked(a, b, canonicalMode))[0] || null
    : null;
  const comparison = houseCurveMode && selected ? {
    houseCurve: houseCurveCandidate ? {
      candidateId: houseCurveCandidate.candidateId || null,
      max: houseCurveCandidate.houseCurveRankingMaxResidualDb ?? null,
      rms: houseCurveCandidate.houseCurveRankingRmsResidualDb ?? null,
    } : null,
    winner: {
      candidateId: selected.candidateId || null,
      profile: selected.designEqFitProfile || "standard",
      max: selected.houseCurveRankingMaxResidualDb ?? null,
      rms: selected.houseCurveRankingRmsResidualDb ?? null,
    },
  } : null;
  const selectionReason = selected
    ? houseCurveMode
      ? houseCurveCandidate
        ? selected === houseCurveCandidate
          ? `${canonicalMode}: generated house_curve candidate won the raw RSP maximum, RMS and mean-absolute residual ranking outside protected nulls.`
          : `${canonicalMode}: ${selected.designEqFitProfile || "standard"} beat house_curve on measured raw residual metrics (${selected.houseCurveRankingMaxResidualDb?.toFixed?.(2) ?? "—"}/${selected.houseCurveRankingRmsResidualDb?.toFixed?.(2) ?? "—"} dB vs ${houseCurveCandidate.houseCurveRankingMaxResidualDb?.toFixed?.(2) ?? "—"}/${houseCurveCandidate.houseCurveRankingRmsResidualDb?.toFixed?.(2) ?? "—"} dB).`
        : `${canonicalMode}: ERROR — no compatible generated house_curve candidate was available; no legacy accuracy fallback was accepted.`
      : fullyValid.length
        ? `${canonicalMode}: selected from ${fullyValid.length} bank-valid candidates achieving P14, P18 and P19 at L1 or above.`
        : balancedFallbackDominanceApplied
          ? `${canonicalMode}: no candidate achieved L1 across P14, P18 and P19; removed ${dominatedCandidateCount} strictly dominated fallback candidate${dominatedCandidateCount === 1 ? "" : "s"}, then selected the best calibrated invalid/FAIL attempt with the existing fallback comparator without changing achieved levels.`
          : `${canonicalMode}: no candidate achieved L1 across P14, P18 and P19; selected the best calibrated invalid/FAIL attempt without changing achieved levels.`
    : `${canonicalMode}: no bank-valid candidate with a valid assessment band was available.`;
  return {
    selected,
    diagnostics: {
      mode: canonicalMode, eligibilityGroup, rankingTuple,
      balancedFallbackDominanceApplied, dominatedCandidateCount,
      selectedCandidateSignature: signature, selectionReason,
      houseCurveCandidateComparison: comparison,
      heavyPoolReused: true, workerStarted: false,
    },
  };
}