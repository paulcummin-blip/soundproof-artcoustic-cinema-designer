import {
  BASS_RESULT_SCHEMA_VERSION,
  HOUSE_CURVE_ENGINE_VERSION,
  buildBassResultCacheKey,
  buildCandidateId,
  buildFilterBankSignature,
  completedStatusesEquivalent,
  stampCandidateAuthority,
  stampPoolAuthority,
  validateCachedBassResult,
} from "./bassResultAuthority";
import { rankBassCandidates } from "@/components/utils/bassPriorityPolicies";

const legacyFilters = [
  { enabled: true, frequencyHz: 31.5, gainDb: -10, Q: 4 },
  { enabled: true, frequencyHz: 50, gainDb: -4, Q: 5 },
  { enabled: true, frequencyHz: 80, gainDb: 2, Q: 3 },
  { enabled: true, frequencyHz: 100, gainDb: -2, Q: 6 },
];

const candidate = (profile, startStrategy, max, rms, filters = legacyFilters) => stampCandidateAuthority({
  designEqFitProfile: profile,
  startStrategy,
  selectedStart: profile === "house_curve" ? "empty" : null,
  designEqFitProfileConfig: { maximumCutDb: profile === "house_curve" ? 15 : 10, maximumAggregateBoostDb: 6 },
  requestedP14Level: "L1", requestedP18Level: "L1", requestedP19Level: "L1",
  requestedTargetSpl: 114, assessmentStartHz: 20, assessmentEndHz: 120,
  achievedP14Level: 1, achievedP18Level: 1, achievedP19Level: 1, allAtLeastL1: true,
  achievedP14Db: 114, achievedP18FrequencyHz: 20, achievedP19VariationDb: max,
  houseCurveRankingMaxResidualDb: max, houseCurveRankingRmsResidualDb: rms,
  houseCurveRankingMeanAbsoluteResidualDb: rms * 0.8,
  bankValidationResult: { allOk: true }, generatedFilterBank: filters,
  finalPostEqCurve: [{ frequency: 20, spl: 120 }, { frequency: 120, spl: 114 }],
});

export function runBassResultAuthorityFixtures() {
  const checks = [];
  const check = (name, passed) => checks.push({ name, passed: !!passed });
  const legacyCandidate = candidate("accuracy", "single", 4, 2.5);
  const legacyResult = {
    engineVersion: "legacy-minus10-single",
    resultSchemaVersion: 1,
    pool: { candidates: [legacyCandidate], selectablePool: [legacyCandidate] },
    productionCandidateId: buildCandidateId(legacyCandidate),
  };
  check("Legacy minus-10 single-start cache is rejected", !validateCachedBassResult(legacyResult).valid);
  check("Versioned cache key changes from calibration-only key", buildBassResultCacheKey("cal:v1:legacy") !== "cal:v1:legacy");

  const house = candidate("house_curve", "multi-start", 2.1, 1.1, [{ enabled: true, frequencyHz: 34, gainDb: -12, Q: 8 }]);
  const accuracy = candidate("accuracy", "single", 3.4, 1.8);
  const pool = stampPoolAuthority({ candidates: [legacyCandidate, accuracy, house], selectablePool: [legacyCandidate, accuracy, house] });
  const currentResult = { engineVersion: HOUSE_CURVE_ENGINE_VERSION, resultSchemaVersion: BASS_RESULT_SCHEMA_VERSION, pool };
  check("Current pool contains compatible house-curve candidate", validateCachedBassResult(currentResult).valid);
  const ranked = rankBassCandidates(pool.selectablePool, "house_curve_accuracy");
  check("Canonical house-curve ranking runs", ranked.selected?.candidateId === house.candidateId);
  check("House-curve multi-start candidate wins raw residual ranking", ranked.selected?.designEqFitProfile === "house_curve" && ranked.selected?.startStrategy === "multi-start");
  const id = ranked.selected?.candidateId;
  check("Pills graph diagnostics and contract can share one candidate", [id, id, id, id].every((value) => value === id));
  check("Completed status aliases pass parity", completedStatusesEquivalent("ready", "complete"));
  check("Current UI limits are minus-15 plus-6", house.designEqFitProfileConfig.maximumCutDb === 15 && house.designEqFitProfileConfig.maximumAggregateBoostDb === 6);
  check("Stored filter signature matches selected bank", house.filterBankSignature === buildFilterBankSignature(house));
  const passed = checks.filter((item) => item.passed).length;
  return { results: checks, passed, total: checks.length, allPassed: passed === checks.length };
}