// productionPathValidation.js — Production-path validation module.
// Imports from both bassOperatingEnvelopeOptimiser (buildCandidate) and
// optimiserRanking (selectBestCandidate) without creating a circular dependency.
// optimiserRanking.js remains limited to ranking logic and pure ranking fixtures.

import { buildCandidate, selectCandidateFromPool } from "@/components/utils/bassOperatingEnvelopeOptimiser";
import { selectBestCandidate } from "@/components/utils/optimiserRanking";
import { isBankAndBandValid } from "@/components/utils/bassPriorityPolicies";
import { calculateDesignEqCurve, DESIGN_EQ_FIT_PROFILES, evaluateProvisionalBankLimits } from "@/components/utils/designEqCalibration";
import { calculateHouseCurveEqCurve, resolveFallback } from "@/components/utils/houseCurveFitter";
import { getRp22BassOperatingDefinitions } from "@/components/utils/rp22BassOperatingDefinitions";
import { artcousticHouseCurveOffsetAt } from "@/components/utils/artcousticHouseCurve";

// Production-path fixture: call buildCandidate() directly with actual EQ results
// to prove uniform seat metrics are finite for every profile, the comparator is
// order-invariant with real candidates, and aggregate bank limits are normalised.
export function runProductionPathFixtures() {
  const results = {};
  const definitions = getRp22BassOperatingDefinitions();
  const base = definitions.find((d) => d.value === 1);
  const request = { p14: base, p18: base, p19: base };
  const freqs = [];
  for (let f = 20; f <= 200; f += 1) freqs.push(f);
  const rawCurve = freqs.map((f) => {
    let dev = 0;
    dev -= 15 * Math.exp(-(((f - 30) / 5) ** 2));
    dev += 6 * Math.exp(-(((f - 50) / 10) ** 2));
    return { frequency: f, spl: base.p14TargetDb + artcousticHouseCurveOffsetAt(f) + dev };
  });
  const perSeatRawCurves = [
    { seatId: "seat1", isPrimary: false, responseData: rawCurve.map((p) => ({ ...p, spl: p.spl - 2 })) },
  ];
  const activeSubs = [{ modelKey: "sub2-12" }];
  const standardEq = calculateDesignEqCurve(rawCurve, 35, activeSubs, {
    requestedSystemOutputDb: base.p14TargetDb, targetAnchorDb: base.p14TargetDb, targetToleranceDb: 2,
    fitProfile: "standard", assessmentStartHz: 35, assessmentEndHz: 120,
  });
  const houseCurveEq = calculateHouseCurveEqCurve(rawCurve, perSeatRawCurves, 35, activeSubs, {
    requestedSystemOutputDb: base.p14TargetDb, targetAnchorDb: base.p14TargetDb, targetToleranceDb: 2,
    assessmentStartHz: 35, assessmentEndHz: 120,
    initialFilters: (standardEq.filters || []).filter((f) => f && f.enabled),
  });
  const standardCand = buildCandidate({ request, rawCurve, activeSubs, usableLfHz: 35, transitionHz: 120, definitions, eqResult: standardEq, perSeatRawCurves });
  const houseCurveCand = buildCandidate({ request, rawCurve, activeSubs, usableLfHz: 35, transitionHz: 120, definitions, eqResult: houseCurveEq, perSeatRawCurves });

  // Both must have finite worst, mean and RMS values.
  results.productionStandardHasFiniteMetrics = Number.isFinite(standardCand.worstSeatMaxDeviationDb)
    && Number.isFinite(standardCand.meanSeatMaxDeviationDb)
    && Number.isFinite(standardCand.rmsSeatTargetErrorDb);
  results.productionHouseCurveHasFiniteMetrics = Number.isFinite(houseCurveCand.worstSeatMaxDeviationDb)
    && Number.isFinite(houseCurveCand.meanSeatMaxDeviationDb)
    && Number.isFinite(houseCurveCand.rmsSeatTargetErrorDb);
  // Candidate order does not affect selection.
  const order1 = selectBestCandidate([standardCand, houseCurveCand], "accuracy").selected;
  const order2 = selectBestCandidate([houseCurveCand, standardCand], "accuracy").selected;
  results.productionOrderInvariant = order1 === order2;
  // Aggregate bank limits are normalised across all profiles (no N/A for Standard).
  results.standardHasAggregateBankLimits = standardCand.aggregateBankLimits != null
    && Number.isFinite(standardCand.aggregateBankLimits.maxAggregateBoostDb)
    && Number.isFinite(standardCand.aggregateBankLimits.maxAggregateCutDb)
    && standardCand.aggregateBankLimits.allOk === true;
  results.houseCurveHasAggregateBankLimits = houseCurveCand.aggregateBankLimits != null
    && Number.isFinite(houseCurveCand.aggregateBankLimits.maxAggregateBoostDb)
    && Number.isFinite(houseCurveCand.aggregateBankLimits.maxAggregateCutDb)
    && houseCurveCand.aggregateBankLimits.allOk === true;

  const productionPool = {
    candidates: [standardCand], selectablePool: [standardCand], poolId: "production-path",
    generatedCandidateCount: 1, physicallyCredibleCount: 1,
    requestedEnvelopeValidCount: standardCand.meetsRequestedEnvelope ? 1 : 0,
    performanceSummary: {},
  };
  const productionSelection = selectCandidateFromPool(productionPool, "balanced");
  results.phase5ProductionCandidateEligibleAndSelected = standardCand.bankValidationResult === standardCand.designEqBankDiagnostics.selectedBankLimits
    && isBankAndBandValid(standardCand)
    && productionSelection.selectedCandidate === standardCand;
  results.phase5ProductionOutputsUnchanged = productionSelection.selectedFilters === standardCand.generatedFilterBank
    && productionSelection.finalPostEqCurve === standardCand.finalPostEqCurve
    && productionSelection.achievedP14Db === standardCand.achievedP14Db
    && productionSelection.achievedP18FrequencyHz === standardCand.achievedP18FrequencyHz
    && productionSelection.achievedP19VariationDb === standardCand.achievedP19VariationDb;
  const invalidBankValidation = evaluateProvisionalBankLimits(
    [{ frequencyHz: 100, gainDb: -100, Q: 1, enabled: true }], rawCurve, activeSubs, 35,
    base.p14TargetDb, DESIGN_EQ_FIT_PROFILES.standard,
  );
  const invalidProductionCandidate = { ...standardCand, bankValidationResult: invalidBankValidation };
  results.phase5InvalidProductionBankRejected = invalidBankValidation.allOk === false
    && !isBankAndBandValid(invalidProductionCandidate)
    && selectCandidateFromPool({ ...productionPool, candidates: [invalidProductionCandidate], selectablePool: [invalidProductionCandidate] }, "balanced").selectedCandidate === null;

  // --- Fallback fixtures: test resolveFallback directly to force both routes ---
  const rspRaw = freqs.map((f) => ({ frequency: f, spl: artcousticHouseCurveOffsetAt(f) }));
  const objectiveSeats = [{ seatId: "rsp", isPrimary: true, raw: rspRaw }];

  // Fixture 1: Invalid selected bank + valid Standard seed → standard-seed fallback.
  // Uses cut filters: a -100 dB cut exceeds the 15 dB aggregate cut limit (invalid),
  // while a -3 dB cut is within limits (valid). Boost filters are avoided because
  // the sub2-12 source domain headroom is fully consumed at the requested output.
  {
    const result = resolveFallback({
      selectedFilters: [{ frequencyHz: 200, gainDb: -100, Q: 1, enabled: true }],
      standardSeedFilters: [{ frequencyHz: 50, gainDb: -3, Q: 1, enabled: true }],
      bankRaw: rspRaw, activeSubs, usableLfHz: 35,
      requestedSystemOutputDb: base.p14TargetDb, profile: DESIGN_EQ_FIT_PROFILES.accuracy,
      objectiveSeats, assessmentStartHz: 20, assessmentEndHz: 200, anchorDb: 0,
    });
    results.fallbackStandardSeedReturned = result.fallbackType === "standard-seed"
      && result.bankValidationPassed === true
      && result.finalBankLimits.allOk === true
      && result.invariantViolation === false;
  }

  // Fixture 2: Invalid selected bank + invalid Standard seed → empty fallback.
  {
    const result = resolveFallback({
      selectedFilters: [{ frequencyHz: 200, gainDb: -100, Q: 1, enabled: true }],
      standardSeedFilters: [{ frequencyHz: 100, gainDb: -100, Q: 1, enabled: true }],
      bankRaw: rspRaw, activeSubs, usableLfHz: 35,
      requestedSystemOutputDb: base.p14TargetDb, profile: DESIGN_EQ_FIT_PROFILES.accuracy,
      objectiveSeats, assessmentStartHz: 20, assessmentEndHz: 200, anchorDb: 0,
    });
    results.fallbackEmptyReturned = result.fallbackType === "empty"
      && result.bankValidationPassed === true
      && result.finalBankLimits.allOk === true
      && result.invariantViolation === false;
  }

  // Fixture 3: Valid selected bank → no fallback, no invariant violation.
  {
    const result = resolveFallback({
      selectedFilters: [{ frequencyHz: 50, gainDb: -3, Q: 1, enabled: true }],
      standardSeedFilters: [{ frequencyHz: 50, gainDb: -3, Q: 1, enabled: true }],
      bankRaw: rspRaw, activeSubs, usableLfHz: 35,
      requestedSystemOutputDb: base.p14TargetDb, profile: DESIGN_EQ_FIT_PROFILES.accuracy,
      objectiveSeats, assessmentStartHz: 20, assessmentEndHz: 200, anchorDb: 0,
    });
    results.noFallbackWhenValid = result.fallbackOccurred === false
      && result.fallbackType === null
      && result.bankValidationPassed === true
      && result.invariantViolation === false;
  }

  return results;
}