import { assessP14Capability, combinedApprovedP14Capability, formatP14Capability, gradeP14Minimum, gradeP14Recommended } from "./p14CapabilityAuthority.js";
import { computeP18InRoomF3, computeP19DeviationBelowSchroeder } from "./rp22BassMetrics.jsx";

const subs = (modelKey, count) => Array.from({ length: count }, (_, index) => ({ id: `${modelKey}-${index + 1}`, modelKey }));
const pointAt = (curve, frequency) => curve.find((point) => point.frequency === frequency);

export function runP14CapabilityFixtures() {
  const checks = [];
  const check = (name, expected, actual, passed, delta = 0) => checks.push({ name, expected, actual, delta, passed: !!passed });

  [[108.999, 0], [109, 1], [112, 2], [115, 3], [118, 4]].forEach(([raw, level]) => {
    check(`Minimum boundary ${raw}`, level, gradeP14Minimum(raw), gradeP14Minimum(raw) === level);
  });
  [[113.999, 0], [114, 1], [117, 2], [120, 3], [123, 4]].forEach(([raw, level]) => {
    check(`Recommended boundary ${raw}`, level, gradeP14Recommended(raw), gradeP14Recommended(raw) === level);
  });

  const results = {};
  ["sub2-12", "sub4-12"].forEach((modelKey) => {
    [1, 2, 4].forEach((count) => {
      const activeSubs = subs(modelKey, count);
      const result = assessP14Capability({ activeSubs });
      results[`${modelKey}-${count}`] = result;
      const approvedSystemDb = combinedApprovedP14Capability(activeSubs);
      check(`${count} x ${modelKey.toUpperCase()} returns frequency-aware authority`, true, !!result?.capabilityCurve?.length, !!result?.capabilityCurve?.length);
      check(`${count} x ${modelKey.toUpperCase()} does not exceed approved hardware`, `≤ ${approvedSystemDb}`, result?.rawCapabilityDb, result?.rawCapabilityDb <= approvedSystemDb + 1e-9, result?.rawCapabilityDb - approvedSystemDb);
      check(`${count} x ${modelKey.toUpperCase()} applies 2 dB safety margin`, 2, result?.rawCapabilityDb - result?.p14CapabilityDb, Math.abs((result?.rawCapabilityDb - result?.p14CapabilityDb) - 2) < 1e-9);
    });
  });

  ["sub2-12", "sub4-12"].forEach((modelKey) => {
    const one = results[`${modelKey}-1`];
    const two = results[`${modelKey}-2`];
    const four = results[`${modelKey}-4`];
    check(`${modelKey.toUpperCase()} two-sub power sum`, 3.0103, two.rawCapabilityDb - one.rawCapabilityDb, Math.abs((two.rawCapabilityDb - one.rawCapabilityDb) - 3.0103) < 0.001);
    check(`${modelKey.toUpperCase()} four-sub power sum`, 6.0206, four.rawCapabilityDb - one.rawCapabilityDb, Math.abs((four.rawCapabilityDb - one.rawCapabilityDb) - 6.0206) < 0.001);
  });

  const sub2Low = pointAt(results["sub2-12-1"].capabilityCurve, 20)?.rawCapabilityDb;
  const sub4Low = pointAt(results["sub4-12-1"].capabilityCurve, 20)?.rawCapabilityDb;
  check("SUB4-12 improves low-frequency capability over SUB2-12", "> SUB2-12", sub4Low - sub2Low, sub4Low > sub2Low);

  const noEq = assessP14Capability({ activeSubs: subs("sub4-12", 1) });
  const localBoost = assessP14Capability({
    activeSubs: subs("sub4-12", 1),
    combinedEqCurve: [{ frequency: 79, spl: 0 }, { frequency: 80, spl: 6 }, { frequency: 81, spl: 0 }],
  });
  check("Local +6 dB EQ is charged at 80 Hz", 6, pointAt(localBoost.capabilityCurve, 80)?.positiveEqBoostDb, pointAt(localBoost.capabilityCurve, 80)?.positiveEqBoostDb === 6);
  check("Local +6 dB EQ does not penalise 25.2 Hz", 0, pointAt(localBoost.capabilityCurve, 25.2)?.positiveEqBoostDb, pointAt(localBoost.capabilityCurve, 25.2)?.positiveEqBoostDb === 0);
  check("Frequency-local EQ penalty is less than blanket maximum", "between 0 and 6 dB", localBoost.eqHeadroomConsumedDb, localBoost.eqHeadroomConsumedDb > 0 && localBoost.eqHeadroomConsumedDb < 6);

  const cutsOnly = assessP14Capability({ activeSubs: subs("sub4-12", 1), combinedEqCurve: [{ frequency: 20, spl: -6 }, { frequency: 120, spl: -2 }] });
  check("EQ cuts do not consume P14 headroom", noEq.p14CapabilityDb, cutsOnly.p14CapabilityDb, Math.abs(noEq.p14CapabilityDb - cutsOnly.p14CapabilityDb) < 1e-9);

  const nullCurve = [20, 30, 39, 40, 41, 60, 80, 120].map((frequency) => ({ frequency, spl: frequency === 40 ? 80 : 112 }));
  const p19 = computeP19DeviationBelowSchroeder({ freqsHz: nullCurve.map((point) => point.frequency), splDb: nullCurve.map((point) => point.spl), targetDb: 112, schroederHz: 120 });
  check("Room-response null remains excluded from P14", "P19 fail; P14 unchanged", `P19 ±${p19.resultDb}; P14 ${formatP14Capability(noEq.value)}`, p19.resultDb > 5 && noEq.value === assessP14Capability({ activeSubs: subs("sub4-12", 1) }).value);

  const p18 = computeP18InRoomF3({ freqsHz: [15, 20, 25, 30, 40, 60], splDb: [108, 111, 113, 114, 114, 114], targetDb: 114 });
  check("P18 remains independently calculated", 20, p18.f3Hz, p18.f3Hz === 20);

  return { checks, results, passed: checks.filter((item) => item.passed).length, total: checks.length, allPassed: checks.every((item) => item.passed) };
}