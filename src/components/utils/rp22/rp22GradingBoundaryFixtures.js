import {
  getP21PresetResult,
  levelP17_wsFR,
  levelP20_lfConsistency,
  levelP21_earlyReflections,
} from "@/components/utils/rp22/levels";
import { adaptCurrentBassOptimisationResult } from "@/components/room/bass/bassAnalysisAdapter";

export function runRp22GradingBoundaryFixtures() {
  const checks = [];
  const check = (name, passed) => checks.push({ name, passed: !!passed });
  const observedValues = [];
  const expect = (name, grader, value, level) => {
    const result = grader(value);
    observedValues.push(value);
    check(name, result.level === level && result.ok === true);
  };

  expect("P17 L4 boundary", levelP17_wsFR, 1.5, "L4");
  expect("P17 between L4 and L3", levelP17_wsFR, 2.1, "L3");
  expect("P17 exact L3 boundary", levelP17_wsFR, 3, "L3");
  [3.1, 11.3, 1000000].forEach((value) => expect(`P17 worse value ${value}`, levelP17_wsFR, value, "L2"));
  check("No finite P17 result produces L1 or FAIL", [-100, 0, 1.5, 1.6, 3, 3.1, 1000000].every((value) => ["L4", "L3", "L2"].includes(levelP17_wsFR(value).level)));

  [[2, "L4"], [2.1, "L3"], [3, "L3"], [3.1, "L2"], [4, "L2"], [4.1, "L1"], [11.3, "L1"]]
    .forEach(([value, level]) => expect(`P20 ${value}`, levelP20_lfConsistency, value, level));
  const singleSeat = adaptCurrentBassOptimisationResult({
    optimisationResult: { selectedCandidate: { p20Available: true, achievedP20Level: 1, achievedP20VariationDb: 11.3, generatedFilterBank: [] }, poolId: "single-seat" },
    perSeatRawCurves: [{ seatId: "seat-1" }],
  });
  check("P20 single seat remains N/A", singleSeat.productAnalysis.parameters.p20.status === "not_applicable" && singleSeat.productAnalysis.parameters.p20.value === null);
  check("No finite P20 result produces FAIL", [-100, 0, 2, 2.1, 3, 3.1, 4, 4.1, 11.3].every((value) => levelP20_lfConsistency(value).level !== "FAIL"));

  [[-12, "L4"], [-11.9, "L3"], [-10, "L3"], [-9.9, "L2"], [-8, "L2"], [-7.9, "L1"], [0, "L1"]]
    .forEach(([value, level]) => expect(`P21 ${value}`, levelP21_earlyReflections, value, level));
  check("No finite P21 result produces FAIL", [-100, -12, -11.9, -10, -9.9, -8, -7.9, 0, 100].every((value) => levelP21_earlyReflections(value).level !== "FAIL"));
  check("Non-applicable P21 preset remains N/A", getP21PresetResult("l1").level === "N/A" && getP21PresetResult("l1").value === null);
  const expectedValues = [1.5, 2.1, 3, 3.1, 11.3, 1000000, 2, 2.1, 3, 3.1, 4, 4.1, 11.3, -12, -11.9, -10, -9.9, -8, -7.9, 0];
  check("Grading preserves every measured value", JSON.stringify(observedValues) === JSON.stringify(expectedValues));

  const passed = checks.filter((item) => item.passed).length;
  return { results: checks, passed, total: checks.length, allPassed: passed === checks.length };
}