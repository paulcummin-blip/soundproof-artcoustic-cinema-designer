import { CANONICAL_BASS_PRIORITY_MODES, rankBassCandidates, stableCandidateSignature } from "./bassPriorityPolicies";
import { selectCandidateFromPool } from "./bassOperatingEnvelopeOptimiser";
import { computeCalibrationFingerprint } from "@/components/room/bass/bassAnalysisFingerprints";
import { identifyBassLimitingParameter } from "./bassLimitingParameter";

const candidate = (id, p14, p18, p19, options = {}) => ({
  id, candidateSignature: id,
  achievedP14Level: p14, achievedP18Level: p18, achievedP19Level: p19,
  achievedP14Db: options.p14Db ?? 100 + p14,
  achievedP18FrequencyHz: options.p18Hz ?? 40 - p18,
  achievedP19VariationDb: options.p19Dev ?? 6 - p19,
  worstSeatMaxDeviationDb: options.worst ?? options.p19Dev ?? 6 - p19,
  meanSeatMaxDeviationDb: options.mean ?? options.worst ?? options.p19Dev ?? 6 - p19,
  rmsSeatTargetErrorDb: options.rms ?? options.p19Dev ?? 6 - p19,
  allAtLeastL1: p14 >= 1 && p18 >= 1 && p19 >= 1,
  bankValidationResult: { allOk: options.bankValid !== false, maxAggregateBoostDb: options.maxBoost ?? 4, maxAggregateCutDb: -8 },
  assessmentStartHz: 20, assessmentEndHz: 120,
  generatedFilterBank: options.filters || [{ enabled: true, frequencyHz: 40, gainDb: -2, Q: 4 }],
  finalPostEqCurve: [{ frequency: 40, spl: 100 }],
  requestedTargetSpl: 100,
  designEqFitProfile: "standard",
});

const poolOf = (candidates) => ({
  candidates, selectablePool: candidates, poolId: "same-heavy-pool",
  generatedCandidateCount: candidates.length, physicallyCredibleCount: candidates.length,
  requestedEnvelopeValidCount: candidates.filter((item) => item.allAtLeastL1).length,
  performanceSummary: {},
});

export function runBassPriorityPolicyFixtures() {
  const results = {};
  const base = candidate("base", 2, 2, 2);
  results.p1AllCanonicalModesMap = CANONICAL_BASS_PRIORITY_MODES.every((mode) => rankBassCandidates([base], mode).diagnostics.mode === mode);

  const valid = candidate("valid", 1, 1, 1, { p14Db: 100 });
  const invalid = candidate("invalid", 4, 4, 0, { p14Db: 120 });
  results.p2L1Guardrail = rankBassCandidates([invalid, valid], "spl").selected === valid;

  results.p3BalancedMaximisesWeakest = rankBassCandidates([candidate("weak", 4, 4, 1), candidate("strong", 2, 2, 2)], "balanced").selected?.id === "strong";
  results.p4BalancedL2Tuple = rankBassCandidates([candidate("421", 4, 2, 1), candidate("222", 2, 2, 2)], "balanced").selected?.id === "222";
  results.p5BalancedSpreadTieBreak = rankBassCandidates([candidate("spread", 4, 2, 2), candidate("compact", 3, 3, 2)], "balanced").selected?.id === "compact";

  const inaccurate = { ...candidate("inaccurate", 4, 4, 4, { worst: 2, mean: 1.5, rms: 1 }), designEqFitProfile: "house_curve", startStrategy: "multi-start", houseCurveRankingMaxResidualDb: 5, houseCurveRankingRmsResidualDb: 3 };
  const accurate = { ...candidate("accurate", 1, 1, 1, { worst: 5, mean: 4, rms: 3 }), designEqFitProfile: "house_curve", startStrategy: "multi-start", houseCurveRankingMaxResidualDb: 2, houseCurveRankingRmsResidualDb: 1 };
  results.p6AccuracyUsesAuthoritativeDeviation = rankBassCandidates([inaccurate, accurate], "house_curve_accuracy").selected === accurate;

  results.p7DepthUsesDeepestP18 = rankBassCandidates([candidate("shallow", 2, 3, 2, { p18Hz: 30 }), candidate("deep", 2, 3, 2, { p18Hz: 22 })], "depth").selected?.id === "deep";
  results.p8SplUsesHighestP14 = rankBassCandidates([candidate("quiet", 3, 2, 2, { p14Db: 108 }), candidate("loud", 3, 2, 2, { p14Db: 112 })], "spl").selected?.id === "loud";

  const pool = poolOf([valid, candidate("other", 2, 1, 1)]);
  const balanced = selectCandidateFromPool(pool, "balanced");
  const spl = selectCandidateFromPool(pool, "spl");
  results.p9SwitchReusesPoolNoWorker = balanced.poolId === spl.poolId && balanced.selectionDiagnostics.heavyPoolReused && spl.selectionDiagnostics.workerStarted === false;

  const fingerprintInputs = { roomDims: { widthM: 4, lengthM: 6, heightM: 2.7 }, sources: [], rspPosition: { x: 2, y: 3, z: 1.2 }, seatingPositions: [], surfaceAbsorption: {}, qStrategy: "ab_corrected" };
  const before = computeCalibrationFingerprint(fingerprintInputs);
  selectCandidateFromPool(pool, "depth");
  results.p10PriorityDoesNotChangeIdentity = before === computeCalibrationFingerprint(fingerprintInputs) && pool.poolId === "same-heavy-pool";

  const tieA = candidate("a", 2, 2, 2);
  const tieB = candidate("b", 2, 2, 2);
  results.p11TiesDeterministic = rankBassCandidates([tieB, tieA], "balanced").selected === tieA && rankBassCandidates([tieA, tieB], "balanced").selected === tieA;

  const fail = rankBassCandidates([candidate("fail-a", 4, 0, 4), candidate("fail-b", 2, 0, 2)], "balanced");
  results.p12NoL1PoolHonestFail = fail.selected?.id === "fail-a" && fail.diagnostics.eligibilityGroup.includes("below_l1") && fail.diagnostics.selectionReason.includes("non-sacrificial");

  const filters = [{ enabled: true, frequencyHz: 52, gainDb: -3.25, Q: 5.5 }];
  const preserved = candidate("preserved", 3, 2, 1, { p14Db: 109.25, p18Hz: 27, p19Dev: 4.75, filters });
  const selected = selectCandidateFromPool(poolOf([preserved]), "spl");
  results.p13SelectedValuesRemainExact = selected.selectedFilters === filters && selected.selectedCandidate === preserved && selected.achievedP14Db === 109.25 && selected.achievedP18FrequencyHz === 27 && selected.achievedP19VariationDb === 4.75 && stableCandidateSignature(selected.selectedCandidate) === "preserved";

  const houseCandidate = { ...candidate("house", 1, 1, 1), designEqFitProfile: "house_curve", startStrategy: "multi-start" };
  const legacyPool = poolOf([...pool.candidates, houseCandidate]);
  const legacyAccuracy = selectCandidateFromPool(legacyPool, "accuracy");
  const legacyExtension = selectCandidateFromPool(legacyPool, "extension");
  results.p14LegacyPriorityValuesResolveToBalancedAuthority = legacyAccuracy.selectedMode === "balanced" && legacyExtension.selectedMode === "balanced";
  results.p15OnlyBalancedProductionSelectionReturned = Object.keys(legacyAccuracy.selectedByMode).length === 1 && legacyAccuracy.selectedByMode.balanced != null;
  results.p16InvalidBankRejected = rankBassCandidates([candidate("invalid-bank", 4, 4, 4, { bankValid: false })], "balanced").selected === null;

  const dominant = candidate("dominant", 0, 0, 0, {
    p14Db: 110, p18Hz: 25, p19Dev: 4, worst: 6, maxBoost: 2,
    filters: [{ enabled: true, gainDb: 1 }],
  });
  dominant.achievedP20VariationDb = 3;
  const dominated = candidate("dominated", 0, 0, 0, {
    p14Db: 109, p18Hz: 26, p19Dev: 4.5, worst: 1, maxBoost: 3,
    filters: [{ enabled: true, gainDb: 1 }, { enabled: true, gainDb: -1 }],
  });
  dominated.achievedP20VariationDb = 3.5;
  const dominanceSelection = rankBassCandidates([dominated, dominant], "balanced");
  results.p17BalancedFallbackRemovesStrictlyDominated = dominanceSelection.selected === dominant
    && dominanceSelection.diagnostics.balancedFallbackDominanceApplied === true
    && dominanceSelection.diagnostics.dominatedCandidateCount === 1;

  const exactTieSelection = rankBassCandidates([candidate("tie-b", 0, 0, 0), candidate("tie-a", 0, 0, 0)], "balanced");
  results.p18ExactTiesDoNotDominate = exactTieSelection.diagnostics.dominatedCandidateCount === 0;

  const missingP20 = { ...dominant, id: "missing-p20", candidateSignature: "missing-p20", achievedP20VariationDb: null };
  const finiteP20 = { ...dominated, id: "finite-p20", candidateSignature: "finite-p20", achievedP20VariationDb: 3.5 };
  const p20Selection = rankBassCandidates([missingP20, finiteP20], "balanced");
  results.p19MissingP20CannotDominateFiniteP20 = p20Selection.diagnostics.dominatedCandidateCount === 0;

  const splSelection = rankBassCandidates([dominated, dominant], "spl");
  results.p20OtherModesDoNotApplyDominance = splSelection.diagnostics.balancedFallbackDominanceApplied === false
    && splSelection.diagnostics.dominatedCandidateCount === 0;

  const consistent = candidate("consistent", 2, 2, 2, { p14Db: 110, p18Hz: 25, p19Dev: 3 });
  consistent.p20Available = true;
  consistent.achievedP20Level = 2;
  consistent.achievedP20VariationDb = 3;
  const sacrificedWorstSeat = candidate("sacrificed", 3, 3, 3, { p14Db: 112, p18Hz: 22, p19Dev: 2 });
  sacrificedWorstSeat.p20Available = true;
  sacrificedWorstSeat.achievedP20Level = 0;
  sacrificedWorstSeat.achievedP20VariationDb = 8;
  results.p21BalancedDoesNotSacrificeP20 = rankBassCandidates([sacrificedWorstSeat, consistent], "balanced").selected === consistent;

  const p14Only = candidate("p14-only", 4, 2, 0, { p14Db: 118, p19Dev: 8 });
  const allRespected = candidate("all-respected", 3, 2, 2, { p14Db: 115, p19Dev: 4 });
  results.p22P14GainCannotTradeAwayP19 = rankBassCandidates([p14Only, allRespected], "balanced").selected === allRespected;

  const limitationCases = [
    [{ ...candidate("limit-p14", 1, 3, 3), p20Available: true, achievedP20Level: 3 }, "p14", "additional subwoofers"],
    [{ ...candidate("limit-p18", 3, 1, 3), p20Available: true, achievedP20Level: 3 }, "p18", "low-frequency capability"],
    [{ ...candidate("limit-p19", 3, 3, 1), p20Available: true, achievedP20Level: 3 }, "p19", "subwoofer placement"],
    [{ ...candidate("limit-p20", 3, 3, 3), p20Available: true, achievedP20Level: 1 }, "p20", "seating position"],
  ];
  results.p23PhysicalRecommendationsMatchLimitations = limitationCases.every(([item, key, phrase]) => {
    const recommendation = identifyBassLimitingParameter(item);
    return recommendation?.parameterKey === key && recommendation.recommendedImprovement.toLowerCase().includes(phrase);
  });
  const allL4 = { ...candidate("all-l4", 4, 4, 4), p20Available: true, achievedP20Level: 4 };
  const allL4Recommendation = identifyBassLimitingParameter(allL4);
  results.p24AllL4DoesNotRecommendUnnecessaryUpgrade = allL4Recommendation?.parameterKey === "none"
    && allL4Recommendation.recommendedImprovement.includes("No physical design change");

  return results;
}