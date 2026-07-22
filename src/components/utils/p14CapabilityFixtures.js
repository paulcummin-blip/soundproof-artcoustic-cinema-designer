import { assessP14Capability, formatP14Capability, gradeP14Minimum, gradeP14Recommended } from "./p14CapabilityAuthority.js";
import { computeP18InRoomF3, computeP19DeviationBelowSchroeder } from "./rp22BassMetrics.jsx";

export function runP14CapabilityFixtures() {
  const checks = [];
  const check = (name, expected, actual, passed, delta = 0) => checks.push({ name, expected, actual, delta, passed: !!passed });
  const boundaries = [
    [108.999, 0], [109, 1], [111.999, 1], [112, 2],
    [114.999, 2], [115, 3], [117.999, 3], [118, 4],
  ];
  boundaries.forEach(([raw, level]) => check(`Minimum boundary ${raw}`, level, gradeP14Minimum(raw), gradeP14Minimum(raw) === level));
  const recommendedBoundaries = [
    [113.999, 0], [114, 1], [116.999, 1], [117, 2],
    [119.999, 2], [120, 3], [122.999, 3], [123, 4],
  ];
  recommendedBoundaries.forEach(([raw, level]) => check(`Recommended boundary ${raw}`, level, gradeP14Recommended(raw), gradeP14Recommended(raw) === level));

  const rounded = assessP14Capability({ productCapabilityDb: 111.1 });
  check("Raw grading and display rounding are separate", "L1 · 112 dBC", `L${rounded.minimumLevel} · ${formatP14Capability(rounded.value)}`, rounded.minimumLevel === 1 && rounded.formatted === "112 dBC");

  const nullCurve = [20, 30, 39, 40, 41, 60, 80, 120].map((frequency) => ({ frequency, spl: frequency === 40 ? 80 : 112 }));
  const p19 = computeP19DeviationBelowSchroeder({ freqsHz: nullCurve.map((p) => p.frequency), splDb: nullCurve.map((p) => p.spl), targetDb: 112, schroederHz: 120 });
  const nullP14 = assessP14Capability({ productCapabilityDb: 112 });
  check("Narrow null can fail P19 without failing P14", "P19 fail; P14 L2", `P19 ±${p19.resultDb} dB; P14 L${nullP14.minimumLevel}`, p19.resultDb > 5 && nullP14.minimumLevel === 2);
  check("P14 is not deepest response bin", 112, nullP14.value, nullP14.value === 112 && Math.min(...nullCurve.map((p) => p.spl)) === 80);

  const boosted = assessP14Capability({ productCapabilityDb: 115, combinedEqCurve: [{ spl: -8 }, { spl: 2.25 }, { spl: 0 }] });
  check("Actual EQ boost consumes capability", 112.75, boosted.value, boosted.value === 112.75);
  const cutOnly = assessP14Capability({ productCapabilityDb: 115, combinedEqCurve: [{ spl: -10 }, { spl: -2 }] });
  check("Peak cutting does not reduce P14", 115, cutOnly.value, cutOnly.value === 115);

  const p18 = computeP18InRoomF3({ freqsHz: [15, 20, 25, 30, 40, 60], splDb: [108, 111, 113, 114, 114, 114], targetDb: 114 });
  check("P14 and P18 remain a capability-extension pair", "112 dBC and 20 Hz", `${nullP14.value} dBC and ${p18.f3Hz} Hz`, nullP14.value === 112 && p18.f3Hz === 20 && nullP14.value !== p18.f3Hz);

  return { checks, passed: checks.filter((item) => item.passed).length, total: checks.length, allPassed: checks.every((item) => item.passed) };
}