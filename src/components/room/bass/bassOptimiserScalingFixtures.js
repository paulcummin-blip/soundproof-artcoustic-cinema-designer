import { generateCandidatePool, selectCandidateFromPool } from "@/components/utils/bassOperatingEnvelopeOptimiser";
import { artcousticHouseCurveOffsetAt } from "@/components/utils/artcousticHouseCurve";
import { stableCandidateSignature } from "@/components/utils/bassPriorityPolicies";

const rawCurve = Array.from({ length: 37 }, (_, index) => {
  const frequency = 20 + index * 5;
  return { frequency, spl: 114 + artcousticHouseCurveOffsetAt(frequency) + 2 * Math.sin(frequency / 14) };
});
const activeSubs = [{ modelKey: "SUB2-12" }];
const makeSeats = (count) => Array.from({ length: count }, (_, seatIndex) => ({
  seatId: `seat-${seatIndex + 1}`,
  responseData: rawCurve.map((point) => ({ ...point, spl: point.spl + Math.sin(point.frequency / (11 + seatIndex)) * 0.4 })),
}));

function run(seatCount, reuseExactHouseCurveEvaluations) {
  const pool = generateCandidatePool({
    rawCurve, activeSubs, usableLfHz: 20, transitionHz: 100,
    perSeatRawCurves: makeSeats(seatCount), reuseCandidateEvaluations: true,
    reuseExactHouseCurveEvaluations,
  });
  return { pool, selection: selectCandidateFromPool(pool, "balanced") };
}

function paritySnapshot(runResult) {
  const { pool, selection } = runResult;
  const selected = selection.selectedCandidate;
  return {
    candidateOrdering: pool.candidates.map(stableCandidateSignature),
    selectedCandidate: stableCandidateSignature(selected),
    filterBank: selected?.generatedFilterBank,
    postEqRspCurve: selected?.finalPostEqCurve,
    postEqSeatCurves: selected?.perSeatPostEqCurves,
    parameters: {
      p14: [selected?.achievedP14Level, selected?.achievedP14Db],
      p18: [selected?.achievedP18Level, selected?.achievedP18FrequencyHz],
      p19: [selected?.achievedP19Level, selected?.achievedP19VariationDb],
      p20: [selected?.achievedP20Level, selected?.achievedP20VariationDb],
    },
    rejectionReasons: pool.candidates.map((candidate) => candidate.rejectionReason),
    bankValidationResult: selected?.bankValidationResult,
  };
}

function exactChecks(label, before, after) {
  const beforeSnapshot = paritySnapshot(before);
  const afterSnapshot = paritySnapshot(after);
  return Object.keys(beforeSnapshot).map((field) => ({
    name: `${label} ${field} exact`,
    passed: JSON.stringify(beforeSnapshot[field]) === JSON.stringify(afterSnapshot[field]),
  }));
}

export function runBassOptimiserScalingFixtures() {
  const beforeOne = run(1, false);
  const afterOne = run(1, true);
  const beforeEight = run(8, false);
  const afterEight = run(8, true);
  const checks = [
    ...exactChecks("One-seat", beforeOne, afterOne),
    ...exactChecks("Eight-seat", beforeEight, afterEight),
    { name: "One-seat prepares smoothing grids once per exact job context", passed: afterOne.pool.performanceSummary.uniqueMetricGridPreparations < afterOne.pool.performanceSummary.metricGridPreparationRequests },
    { name: "Eight-seat prepares smoothing grids once per exact job context", passed: afterEight.pool.performanceSummary.uniqueMetricGridPreparations < afterEight.pool.performanceSummary.metricGridPreparationRequests },
    { name: "Eight-seat reuses exact aggregate responses", passed: afterEight.pool.performanceSummary.reusedCurveEvaluationRequests > 0 },
    { name: "One-seat reuses exact filter response arrays", passed: afterOne.pool.performanceSummary.uniqueFilterResponses < afterOne.pool.performanceSummary.filterResponseRequests },
    { name: "Eight-seat reuses exact filter response arrays", passed: afterEight.pool.performanceSummary.uniqueFilterResponses < afterEight.pool.performanceSummary.filterResponseRequests },
    { name: "Eight-seat retains every seat metric request", passed: afterEight.pool.performanceSummary.perSeatMetricEvaluations === beforeEight.pool.performanceSummary.perSeatMetricEvaluations },
  ];
  return {
    beforeOne: beforeOne.pool.performanceSummary,
    afterOne: afterOne.pool.performanceSummary,
    beforeEight: beforeEight.pool.performanceSummary,
    afterEight: afterEight.pool.performanceSummary,
    parity: {
      oneSeat: exactChecks("One-seat", beforeOne, afterOne),
      eightSeats: exactChecks("Eight-seat", beforeEight, afterEight),
    },
    results: checks,
    passed: checks.filter((check) => check.passed).length,
    total: checks.length,
    allPassed: checks.every((check) => check.passed),
  };
}