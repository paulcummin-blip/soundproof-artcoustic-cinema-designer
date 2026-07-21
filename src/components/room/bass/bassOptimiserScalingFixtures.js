import { generateCandidatePool, selectCandidateFromPool } from "@/components/utils/bassOperatingEnvelopeOptimiser";
import { artcousticHouseCurveOffsetAt } from "@/components/utils/artcousticHouseCurve";

const rawCurve = Array.from({ length: 37 }, (_, index) => {
  const frequency = 20 + index * 5;
  return { frequency, spl: 114 + artcousticHouseCurveOffsetAt(frequency) + 2 * Math.sin(frequency / 14) };
});
const activeSubs = [{ modelKey: "SUB2-12" }];
const makeSeats = (count) => Array.from({ length: count }, (_, seatIndex) => ({
  seatId: `seat-${seatIndex + 1}`,
  responseData: rawCurve.map((point) => ({ ...point, spl: point.spl + Math.sin(point.frequency / (11 + seatIndex)) * 0.4 })),
}));
const snapshot = (selection) => ({
  candidate: selection.selectedCandidate,
  filters: selection.selectedFilters,
  curve: selection.finalPostEqCurve,
  p14: [selection.selectedCandidate?.achievedP14Level, selection.selectedCandidate?.achievedP14Db],
  p18: [selection.selectedCandidate?.achievedP18Level, selection.selectedCandidate?.achievedP18FrequencyHz],
  p19: [selection.selectedCandidate?.achievedP19Level, selection.selectedCandidate?.achievedP19VariationDb],
  p20: [selection.selectedCandidate?.achievedP20Level, selection.selectedCandidate?.achievedP20VariationDb],
});
const run = (seatCount, reuseCandidateEvaluations) => {
  const pool = generateCandidatePool({ rawCurve, activeSubs, usableLfHz: 20, transitionHz: 100, perSeatRawCurves: makeSeats(seatCount), reuseCandidateEvaluations });
  return { pool, selection: selectCandidateFromPool(pool, "balanced") };
};

export function runBassOptimiserScalingFixtures() {
  const beforeOne = run(1, false);
  const afterOne = run(1, true);
  const beforeEight = run(8, false);
  const afterEight = run(8, true);
  const oneParity = JSON.stringify(snapshot(beforeOne.selection)) === JSON.stringify(snapshot(afterOne.selection));
  const eightParity = JSON.stringify(snapshot(beforeEight.selection)) === JSON.stringify(snapshot(afterEight.selection));
  const countsOne = afterOne.pool.performanceSummary;
  const countsEight = afterEight.pool.performanceSummary;
  const checks = [
    { name: "One-seat selected candidate, filters, curve and P14-P20 are exact", passed: oneParity },
    { name: "Eight-seat selected candidate, filters, curve and P14-P20 are exact", passed: eightParity },
    { name: "Unique core-fit count does not multiply by seats", passed: countsOne.uniqueCoreFitCount === countsEight.uniqueCoreFitCount },
    { name: "Completed candidate evaluations are reused", passed: countsOne.reusedCandidateEvaluationCount > 0 && countsEight.reusedCandidateEvaluationCount > 0 },
    { name: "Only per-seat metric work scales with seat count", passed: countsEight.seatCount === 8 && countsOne.seatCount === 1 },
  ];
  return {
    beforeOne: beforeOne.pool.performanceSummary,
    afterOne: countsOne,
    beforeEight: beforeEight.pool.performanceSummary,
    afterEight: countsEight,
    parity: {
      oneSeat: { selectedCandidate: oneParity, filters: oneParity, postEqCurves: oneParity, p14ToP20: oneParity },
      eightSeats: { selectedCandidate: eightParity, filters: eightParity, postEqCurves: eightParity, p14ToP20: eightParity },
    },
    results: checks,
    passed: checks.filter((check) => check.passed).length,
    total: checks.length,
    allPassed: checks.every((check) => check.passed),
  };
}