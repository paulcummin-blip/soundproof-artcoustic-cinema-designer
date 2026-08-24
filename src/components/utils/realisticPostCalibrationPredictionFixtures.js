import { smoothPredictedCorrectionEnvelope } from "./realisticPostCalibrationPrediction.js";

export function runRealisticCorrectionEnvelopeFixtures() {
  const checks = [];
  const check = (name, passed, actual = null) => checks.push({ name, passed: passed === true, actual });

  const steppedCut = [0, 0, -15, -15, -15, 0, 0]
    .map((spl, index) => ({ frequency: 20 + index, spl }));
  const smoothedCut = smoothPredictedCorrectionEnvelope(steppedCut);
  check("Cut corner is rounded inward", smoothedCut[2].spl > -15 && smoothedCut[2].spl < 0, smoothedCut[2].spl);
  check("Cut never exceeds original magnitude", smoothedCut.every((point, index) =>
    point.spl <= 0 && point.spl >= steppedCut[index].spl), smoothedCut.map((point) => point.spl));

  const steppedBoost = [0, 0, 6, 6, 6, 0, 0]
    .map((spl, index) => ({ frequency: 30 + index, spl }));
  const smoothedBoost = smoothPredictedCorrectionEnvelope(steppedBoost);
  check("Boost corner is rounded inward", smoothedBoost[2].spl > 0 && smoothedBoost[2].spl < 6, smoothedBoost[2].spl);
  check("Boost never exceeds original magnitude", smoothedBoost.every((point, index) =>
    point.spl >= 0 && point.spl <= steppedBoost[index].spl), smoothedBoost.map((point) => point.spl));

  const aroundNull = [-8, -8, 6, 6, -8, -8]
    .map((spl, index) => ({ frequency: 48 + index, spl }));
  const protectedNullRegions = [{ startHz: 50, endHz: 51 }];
  const smoothedNull = smoothPredictedCorrectionEnvelope(aroundNull, protectedNullRegions);
  check("Protected null remains exactly zero", smoothedNull[2].spl === 0 && smoothedNull[3].spl === 0, smoothedNull.map((point) => point.spl));
  check("Smoothing does not bridge across protected null", smoothedNull[1].spl <= 0 && smoothedNull[4].spl <= 0, smoothedNull.map((point) => point.spl));

  const hardLimits = [...smoothedCut, ...smoothedBoost, ...smoothedNull];
  check("Hard +6/-15 limits preserved", hardLimits.every((point) => point.spl >= -15 && point.spl <= 6));

  const passed = checks.filter((item) => item.passed).length;
  return { checks, passed, total: checks.length, allPassed: passed === checks.length };
}
