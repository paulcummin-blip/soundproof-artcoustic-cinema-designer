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
const levels = (candidate) => {
  const scores = [candidate?.achievedP14Level, candidate?.achievedP18Level, candidate?.achievedP19Level].map(bassLevelScore);
  if (candidate?.p20Available === true && candidate?.achievedP20Level != null) scores.push(bassLevelScore(candidate.achievedP20Level));
  return scores;
};
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
const houseCurveRmsError = (candidate) => finiteOr(
  candidate?.houseCurveRankingRmsResidualDb ?? candidate?.postEqHouseCurveErrorDb ?? candidate?.rspRmsResidualDb,
  Number.MAX_SAFE_INTEGER,
);
const houseCurveMaxError = (candidate) => finiteOr(
  candidate?.houseCurveRankingMaxResidualDb ?? candidate?.rspObjectiveMaxDeviationDb,
  Number.MAX_SAFE_INTEGER,
);
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
  const aLevels = levels(a);
  const bLevels = levels(b);
  if (aLevels.length !== bLevels.length || aLevels.some((level, index) => level < bLevels[index])) return false;
  const levelMateriallyBetter = aLevels.some((level, index) => level > bLevels[index]);
  const comparisons = [
    lowerMetricComparison(houseCurveRmsError(a), houseCurveRmsError(b), DOMINANCE_DB_TOLERANCE),
    lowerMetricComparison(houseCurveMaxError(a), houseCurveMaxError(b), DOMINANCE_DB_TOLERANCE),
    lowerMetricComparison(a?.achievedP18FrequencyHz, b?.achievedP18FrequencyHz, DOMINANCE_HZ_TOLERANCE),
    lowerMetricComparison(a?.achievedP19VariationDb, b?.achievedP19VariationDb, DOMINANCE_DB_TOLERANCE),
    lowerMetricComparison(a?.achievedP20VariationDb, b?.achievedP20VariationDb, DOMINANCE_DB_TOLERANCE),
    higherMetricComparison(a?.achievedP14Db, b?.achievedP14Db, DOMINANCE_DB_TOLERANCE),
    lowerMetricComparison(eqCost(a), eqCost(b), DOMINANCE_DB_TOLERANCE),
  ];
  return comparisons.every((comparison) => comparison.noWorse)
    && (levelMateriallyBetter || comparisons.some((comparison) => comparison.materiallyBetter));
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
  return candidate?.bankValidationResult?.allOk === true && candidate?.physicalEqAuthorityPassed !== false &&
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
  return [lowerScore(houseCurveRmsError(candidate)), lowerScore(houseCurveMaxError(candidate)),
    lowerScore(candidate?.houseCurveRankingMeanAbsoluteResidualDb ?? candidate?.rspMeanAbsoluteResidualDb),
    lowerScore(eqCost(candidate))];
}

function compareRanked(a, b, mode) {
  const canonicalMode = normalizeBassPriorityMode(mode);
  const aTuple = rankingTupleForMode(a, canonicalMode);
  const bTuple = rankingTupleForMode(b, canonicalMode);
  const acousticMetricCount = canonicalMode === BASS_PRIORITY_MODES.BALANCED ? 2 : 0;
  for (let i = 0; i < Math.max(aTuple.length, bTuple.length); i++) {
    const difference = (bTuple[i] ?? -Number.MAX_SAFE_INTEGER) - (aTuple[i] ?? -Number.MAX_SAFE_INTEGER);
    if (i < acousticMetricCount && Math.abs(difference) <= DOMINANCE_DB_TOLERANCE) continue;
    if (difference !== 0) return difference;
  }
  return stableCandidateSignature(a).localeCompare(stableCandidateSignature(b));
}

export function rankBassCandidates(pool, mode) {
  const canonicalMode = normalizeBassPriorityMode(mode);
  const bankValid = Array.isArray(pool) ? pool.filter(isBankAndBandValid) : [];
  const houseCurveMode = canonicalMode === BASS_PRIORITY_MODES.HOUSE_CURVE_ACCURACY;
  const houseCurveCandidates = bankValid.filter((candidate) => candidate?.designEqFitProfile === "house_curve");
  const eligible = houseCurveMode && houseCurveCandidates.length ? houseCurveCandidates : bankValid;
  const balancedFallbackDominanceApplied = false;
  const dominatedCandidateCount = 0;
  const eligibilityGroup = bankValid.length ? "bank_valid_fixed_house_curve_objective" : "no_bank_and_band_valid_candidates";
  const rankedEligible = [...eligible].sort((a, b) => compareRanked(a, b, canonicalMode));
  const selected = rankedEligible[0] || null;
  const signature = selected ? stableCandidateSignature(selected) : null;
  const rankingTuple = selected ? rankingTupleForMode(selected, canonicalMode) : [];
  const selectedCandidateReason = selected ? "Best house curve match after valid EQ" : null;
  const candidateSelectionDiagnostics = (Array.isArray(pool) ? pool : []).map((candidate) => {
    const physicallyValid = isBankAndBandValid(candidate);
    const rank = rankedEligible.indexOf(candidate);
    const residualWorse = selected && (
      houseCurveRmsError(candidate) > houseCurveRmsError(selected) + DOMINANCE_DB_TOLERANCE
      || houseCurveMaxError(candidate) > houseCurveMaxError(selected) + DOMINANCE_DB_TOLERANCE
    );
    const reason = candidate === selected
      ? selectedCandidateReason
      : !physicallyValid
        ? "Rejected EQ candidate: exceeds fixed EQ safety limits"
        : residualWorse || !eligible.includes(candidate)
          ? "Rejected EQ candidate: higher residual error"
          : "Rejected EQ candidate: lower overall response quality or higher EQ cost after equivalent acoustic performance";
    return {
      candidateId: candidate?.candidateId || stableCandidateSignature(candidate),
      rank: rank >= 0 ? rank + 1 : null,
      selected: candidate === selected,
      reason,
      preEqHouseCurveErrorDb: candidate?.preEqHouseCurveErrorDb ?? null,
      postEqHouseCurveErrorDb: houseCurveRmsError(candidate),
      maximumPostEqHouseCurveDeviationDb: houseCurveMaxError(candidate),
      eqCostDb: eqCost(candidate),
      physicalEqAuthorityPassed: candidate?.physicalEqAuthorityPassed !== false,
      physicalAuthorityViolations: candidate?.physicalAuthorityViolations || [],
    };
  });
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
      : `${canonicalMode}: best fixed house-curve match after valid EQ; capability and RP22 outcomes were excluded from selection.`
    : `${canonicalMode}: no bank-valid candidate with a valid assessment band was available.`;
  return {
    selected,
    diagnostics: {
      mode: canonicalMode, eligibilityGroup, rankingTuple,
      balancedFallbackDominanceApplied, dominatedCandidateCount,
      selectedCandidateSignature: signature, selectedCandidateReason, selectionReason,
      rankedCandidates: candidateSelectionDiagnostics,
      houseCurveCandidateComparison: comparison,
      heavyPoolReused: true, workerStarted: false,
    },
  };
}