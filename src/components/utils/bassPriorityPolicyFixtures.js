import { CANONICAL_BASS_PRIORITY_MODES, rankBassCandidates, stableCandidateSignature } from "./bassPriorityPolicies";
import { selectCandidateFromPool } from "./bassOperatingEnvelopeOptimiser";
import { computeCalibrationFingerprint } from "@/components/room/bass/bassAnalysisFingerprints";

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
  bankValidationResult: { allOk: options.bankValid !== false, maxAggregateBoostDb: 4, maxAggregateCutDb: -8 },
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

  const inaccurate = { ...candidate("inaccurate", 4, 4, 4, { worst: 2, mean: 1.5, rms: 1 }), rspObjectiveMaxDeviationDb: 5, rspRmsResidualDb: 3 };
  const accurate = { ...candidate("accurate", 1, 1, 1, { worst: 5, mean: 4, rms: 3 }), rspObjectiveMaxDeviationDb: 2, rspRmsResidualDb: 1 };
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
  results.p12NoL1PoolHonestFail = fail.selected?.id === "fail-a" && fail.diagnostics.eligibilityGroup.includes("below_l1") && fail.diagnostics.selectionReason.includes("invalid/FAIL");

  const filters = [{ enabled: true, frequencyHz: 52, gainDb: -3.25, Q: 5.5 }];
  const preserved = candidate("preserved", 3, 2, 1, { p14Db: 109.25, p18Hz: 27, p19Dev: 4.75, filters });
  const selected = selectCandidateFromPool(poolOf([preserved]), "spl");
  results.p13SelectedValuesRemainExact = selected.selectedFilters === filters && selected.selectedCandidate === preserved && selected.achievedP14Db === 109.25 && selected.achievedP18FrequencyHz === 27 && selected.achievedP19VariationDb === 4.75 && stableCandidateSignature(selected.selectedCandidate) === "preserved";

  const legacyAccuracy = selectCandidateFromPool(pool, "accuracy");
  const legacyExtension = selectCandidateFromPool(pool, "extension");
  results.p14LegacyPriorityValuesRerank = legacyAccuracy.selectedMode === "house_curve_accuracy" && legacyExtension.selectedMode === "depth";
  results.p15LegacySelectedByModeAliases = legacyAccuracy.selectedByMode.accuracy === legacyAccuracy.selectedByMode.house_curve_accuracy && legacyAccuracy.selectedByMode.extension === legacyAccuracy.selectedByMode.depth;
  results.p16InvalidBankRejected = rankBassCandidates([candidate("invalid-bank", 4, 4, 4, { bankValid: false })], "balanced").selected === null;

  return results;
}