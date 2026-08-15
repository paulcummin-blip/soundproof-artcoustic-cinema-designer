import { getSubwooferCurve } from "@/components/models/speakers/registry";
import {
  getPerSubwooferAmplifierAuthority,
  getSystemSourceCapability,
  interpolateCapabilityCurve,
} from "@/components/utils/subwooferCapability";
import { calculatePairedP14P18ProductionAuthority } from "@/components/utils/pairedP14P18ProductionAuthority";

const REF_AMPLITUDE = 10 ** (94 / 20);
const check = (name, expected, actual, passed) => ({ name, expected, actual, passed: Boolean(passed) });
const at = (curve, frequency) => interpolateCapabilityCurve(curve, frequency);
const curve = (modelKey) => (getSubwooferCurve(modelKey) || []).map(({ hz, db }) => ({ frequency: hz, spl: db }));
const transfer = (sourceId, phase = 0, phaseSlope = 0.002) => ({
  sourceId,
  points: Array.from({ length: 106 }, (_, index) => 15 + index).map((frequency) => ({
    frequency,
    re: REF_AMPLITUDE * Math.cos(phase + frequency * phaseSlope),
    im: REF_AMPLITUDE * Math.sin(phase + frequency * phaseSlope),
  })),
});
const subs = (modelKey, count) => Array.from({ length: count }, (_, index) => ({ id: `s${index + 1}`, modelKey }));
const authority = (modelKey, count, combinedEqCurve = []) => calculatePairedP14P18ProductionAuthority({
  activeSubs: subs(modelKey, count),
  perSourceComplexTransfers: Array.from({ length: count }, (_, index) => transfer(`s${index + 1}`, index * 0.17, 0.002 + index * 0.003)),
  combinedEqCurve,
  targetBasis: "minimum",
});

export function runSubwooferProductIntegrationFixtures() {
  const checks = [];
  const sub2 = curve("sub2-12");
  const sub4 = curve("sub4-12");
  checks.push(check("SUB2-12 raw engineering trace is retained", "15–100 Hz", `${sub2[0]?.frequency}–${sub2.at(-1)?.frequency} Hz`, sub2.length > 40 && sub2[0]?.frequency === 15 && sub2.at(-1)?.frequency === 100));
  checks.push(check("SUB4-12 has a full frequency curve", "12–200 Hz", `${sub4[0]?.frequency}–${sub4.at(-1)?.frequency} Hz`, sub4.length > 40 && sub4[0]?.frequency <= 12));
  checks.push(check("SUB4-12 exceeds SUB2-12 at 20 Hz", "> 6 dB", at(sub4, 20) - at(sub2, 20), at(sub4, 20) - at(sub2, 20) > 6));
  checks.push(check("SUB4-12 extends below SUB2-12", "lower first frequency", `${sub4[0]?.frequency} vs ${sub2[0]?.frequency}`, sub4[0]?.frequency < sub2[0]?.frequency));

  const oneSub2Amp = getPerSubwooferAmplifierAuthority(subs("sub2-12", 1));
  const fourSub2Amp = getPerSubwooferAmplifierAuthority(subs("sub2-12", 4));
  const fourSub4Amp = getPerSubwooferAmplifierAuthority(subs("sub4-12", 4));
  checks.push(check("Each subwoofer receives its own 1000 W amplifier", "4000 W for four subs", fourSub2Amp.totalAvailablePowerW, fourSub2Amp.totalAvailablePowerW === 4000));
  checks.push(check("SUB2-12 remains product-limited below 1000 W", "0 dB amplifier derating", oneSub2Amp.sourceAuthorities[0]?.deratingDb, oneSub2Amp.sourceAuthorities[0]?.deratingDb === 0));
  checks.push(check("Each SUB4-12 is individually limited by its 1000 W amplifier", "-1.46 dB per cabinet", fourSub4Amp.sourceAuthorities.map((source) => source.deratingDb), fourSub4Amp.sourceAuthorities.every((source) => Math.abs(source.deratingDb + 1.46128) < 0.001)));
  const oneSub4At50 = getSystemSourceCapability(subs("sub4-12", 1), 50);
  const fourSub4At50 = getSystemSourceCapability(subs("sub4-12", 4), 50);
  checks.push(check("Four co-located SUB4-12 retain coherent quantity gain", "+12.04 dB", fourSub4At50 - oneSub4At50, Math.abs((fourSub4At50 - oneSub4At50) - 20 * Math.log10(4)) < 0.001));

  const oneSub2 = authority("sub2-12", 1);
  const twoSub2 = authority("sub2-12", 2);
  const fourSub2 = authority("sub2-12", 4);
  const twoSub4 = authority("sub4-12", 2);
  const fourSub4 = authority("sub4-12", 4);
  const deliveredAt = (result, frequency) => at(result.curves.rawDeliveredCurve, frequency);
  checks.push(check(
    "SUB2-12 paired P14/P18 authority covers the 120 Hz assessment boundary",
    "complete PASS/FAIL assessment, never incomplete data",
    { status: oneSub2.status, sharedRangeHz: oneSub2.coverage.sharedFrequencyRangeHz },
    oneSub2.status !== "INCOMPLETE DATA" && oneSub2.coverage.sharedFrequencyRangeHz[1] >= 120,
  ));
  checks.push(check(
    "SUB2-12 upper-band completion is explicit and approved-range bounded",
    "edge hold from measured 100 Hz through approved 170 Hz",
    oneSub2.sources.sourceDiagnostics[0]?.approvedRangeCompletion,
    oneSub2.sources.sourceDiagnostics[0]?.approvedRangeCompletion?.method === "approved-range-edge-hold"
      && oneSub2.sources.sourceDiagnostics[0]?.approvedRangeCompletion?.measuredThroughHz === 100
      && oneSub2.sources.sourceDiagnostics[0]?.approvedRangeCompletion?.completedThroughHz === 170,
  ));
  checks.push(check("Two spatial sources change delivered SPL", "not identical to one source", deliveredAt(twoSub2, 30) - deliveredAt(oneSub2, 30), Math.abs(deliveredAt(twoSub2, 30) - deliveredAt(oneSub2, 30)) > 0.1));
  checks.push(check("Four spatial sources change delivered SPL", "not identical to two sources", deliveredAt(fourSub2, 30) - deliveredAt(twoSub2, 30), Math.abs(deliveredAt(fourSub2, 30) - deliveredAt(twoSub2, 30)) > 0.1));
  const twoSubDelta30 = deliveredAt(twoSub2, 30) - deliveredAt(oneSub2, 30);
  const twoSubDelta70 = deliveredAt(twoSub2, 70) - deliveredAt(oneSub2, 70);
  checks.push(check("Multiple sources do not apply a flat scalar lift", "frequency-dependent delta", `${twoSubDelta30}/${twoSubDelta70}`, Math.abs(twoSubDelta30 - twoSubDelta70) > 0.05));
  checks.push(check("SUB4-12 retains LF advantage with two subs", "> SUB2-12", deliveredAt(twoSub4, 20) - deliveredAt(twoSub2, 20), deliveredAt(twoSub4, 20) > deliveredAt(twoSub2, 20)));
  checks.push(check("SUB4-12 retains LF advantage with four subs", "> SUB2-12", deliveredAt(fourSub4, 20) - deliveredAt(fourSub2, 20), deliveredAt(fourSub4, 20) > deliveredAt(fourSub2, 20)));

  const noEq = authority("sub4-12", 2);
  const boost25 = authority("sub4-12", 2, [{ frequency: 15, spl: 0 }, { frequency: 24, spl: 0 }, { frequency: 25, spl: 6 }, { frequency: 26, spl: 0 }, { frequency: 120, spl: 0 }]);
  const noEq25 = at(noEq.curves.postEqDeliveredCurve, 25);
  const boost25Available = at(boost25.curves.postEqDeliveredCurve, 25);
  const noEq50 = at(noEq.curves.postEqDeliveredCurve, 50);
  const boost25AvailableAt50 = at(boost25.curves.postEqDeliveredCurve, 50);
  checks.push(check(
    "+6 dB at 25 Hz spends only local operating margin and leaves the capability envelope fixed",
    "boosted and unboosted maximum capability unchanged; 0 dB global cost",
    { boostedFrequencyDeltaDb: noEq25 - boost25Available, unboostedFrequencyDeltaDb: noEq50 - boost25AvailableAt50, costDb: boost25.eqHeadroom.maximumPositiveEqCostDb },
    Math.abs(noEq25 - boost25Available) < 1e-9
      && Math.abs(noEq50 - boost25AvailableAt50) < 1e-9
      && boost25.eqHeadroom.maximumPositiveEqCostDb === 0,
  ));

  const cuts = authority("sub4-12", 2, [{ frequency: 15, spl: -6 }, { frequency: 120, spl: -2 }]);
  checks.push(check("Cuts do not consume global maximum SPL headroom", 0, cuts.eqHeadroom.maximumPositiveEqCostDb, cuts.eqHeadroom.maximumPositiveEqCostDb === 0));
  return { checks, passed: checks.filter((item) => item.passed).length, total: checks.length, allPassed: checks.every((item) => item.passed) };
}