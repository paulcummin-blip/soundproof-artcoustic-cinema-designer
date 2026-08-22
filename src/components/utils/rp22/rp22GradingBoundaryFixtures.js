import {
  floorP19Deviation,
  floorP20Deviation,
  formatP19Deviation,
  formatP20Deviation,
  getP21PresetResult,
  levelP17_wsFR,
  levelP19_lfResponse,
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
    check(name, result.level === level && result.ok === (level !== "FAIL"));
  };

  expect("P17 L4 boundary", levelP17_wsFR, 1.5, "L4");
  expect("P17 between L4 and L3", levelP17_wsFR, 2.1, "L3");
  expect("P17 exact L3 boundary", levelP17_wsFR, 3, "L3");
  [3.1, 11.3, 1000000].forEach((value) => expect(`P17 worse value ${value}`, levelP17_wsFR, value, "L2"));
  check("No finite P17 result produces L1 or FAIL", [-100, 0, 1.5, 1.6, 3, 3.1, 1000000].every((value) => ["L4", "L3", "L2"].includes(levelP17_wsFR(value).level)));

  const p19Cases = [
    [2.0, "2", "L4"], [2.01, "2.01", "L3"],
    [3.0, "3", "L3"], [3.01, "3.01", "L2"],
    [4.0, "4", "L2"], [4.01, "4.01", "L1"],
    [5.0, "5", "L1"], [5.01, "5.01", "FAIL"],
  ];
  p19Cases.forEach(([value, display, level]) => {
    expect(`P19 ${value} grades directly`, levelP19_lfResponse, value, level);
    check(`P19 ${value} displays ±${display} dB`, floorP19Deviation(value) === value && formatP19Deviation(value) === `±${display} dB`);
  });

  const p20Cases = [
    [2.0, "2", "L4"], [2.01, "2.01", "L3"],
    [3.0, "3", "L3"], [3.01, "3.01", "L2"],
    [4.0, "4", "L2"], [4.01, "4.01", "FAIL"],
    [11.4, "11.4", "FAIL"],
  ];
  p20Cases.forEach(([value, display, level]) => {
    expect(`P20 ${value} grades directly`, levelP20_lfConsistency, value, level);
    check(`P20 ${value} displays ±${display} dB`, floorP20Deviation(value) === value && formatP20Deviation(value) === `±${display} dB`);
  });
  const singleSeat = adaptCurrentBassOptimisationResult({
    optimisationResult: { selectedCandidate: { p20Available: true, achievedP20Level: 1, achievedP20VariationDb: 11.3, generatedFilterBank: [] }, poolId: "single-seat" },
    perSeatRawCurves: [{ seatId: "seat-1" }],
  });
  check("P20 single seat remains N/A", singleSeat.productAnalysis.parameters.p20.status === "not_applicable" && singleSeat.productAnalysis.parameters.p20.value === null);
  const missingOverlap = adaptCurrentBassOptimisationResult({
    optimisationResult: { selectedCandidate: { p20Available: false, generatedFilterBank: [] }, poolId: "missing-overlap" },
    perSeatRawCurves: [{ seatId: "seat-1" }, { seatId: "seat-2" }],
  });
  check("P20 missing overlap remains N/A", missingOverlap.productAnalysis.parameters.p20.status === "not_applicable" && missingOverlap.productAnalysis.parameters.p20.value === null);
  const fullPrecision = adaptCurrentBassOptimisationResult({
    optimisationResult: { selectedCandidate: { p20Available: true, achievedP20Level: 1, achievedP20VariationDb: 4.9, generatedFilterBank: [] }, poolId: "full-precision" },
    perSeatRawCurves: [{ seatId: "seat-1" }, { seatId: "seat-2" }],
  });
  check("P20 retains full precision internally", fullPrecision.productAnalysis.parameters.p20.value === 4.9 && fullPrecision.selectedCandidate.achievedP20VariationDb === 4.9);
  check("P20 contract preserves direct FAIL", fullPrecision.productAnalysis.parameters.p20.level === 0);
  const p20Error = adaptCurrentBassOptimisationResult({ detailedStatus: "ERROR", perSeatRawCurves: [{ seatId: "seat-1" }, { seatId: "seat-2" }] });
  check("P20 genuine job error remains error", p20Error.productAnalysis.parameters.p20.status === "error");
  const p20Uncalculated = adaptCurrentBassOptimisationResult({ perSeatRawCurves: [{ seatId: "seat-1" }, { seatId: "seat-2" }] });
  check("P20 not calculated remains uncalculated", p20Uncalculated.productAnalysis.parameters.p20.status === "uncalculated" && p20Uncalculated.productAnalysis.parameters.p20.value === null);
  check("P20 has no L1 and values above 4 dB FAIL", [4.01, 11.4, 1000000].every((value) => levelP20_lfConsistency(value).level === "FAIL") && [-100, 0, 2, 3, 4].every((value) => levelP20_lfConsistency(value).level !== "L1"));

  [[-12, "L4"], [-11.9, "L3"], [-10, "L3"], [-9.9, "L2"], [-8, "L2"], [-7.9, "L1"], [0, "L1"]]
    .forEach(([value, level]) => expect(`P21 ${value}`, levelP21_earlyReflections, value, level));
  check("No finite P21 result produces FAIL", [-100, -12, -11.9, -10, -9.9, -8, -7.9, 0, 100].every((value) => levelP21_earlyReflections(value).level !== "FAIL"));
  check("Non-applicable P21 preset remains N/A", getP21PresetResult("l1").level === "N/A" && getP21PresetResult("l1").value === null);
  const expectedValues = [1.5, 2.1, 3, 3.1, 11.3, 1000000, ...p19Cases.map(([value]) => value), ...p20Cases.map(([value]) => value), -12, -11.9, -10, -9.9, -8, -7.9, 0];
  check("Grading preserves every measured value", JSON.stringify(observedValues) === JSON.stringify(expectedValues));

  const passed = checks.filter((item) => item.passed).length;
  return { results: checks, passed, total: checks.length, allPassed: passed === checks.length };
}