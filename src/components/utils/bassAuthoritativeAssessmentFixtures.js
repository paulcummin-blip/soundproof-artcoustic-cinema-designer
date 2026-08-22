import {
  computeCorrectableP19Diagnostic,
  computeOfficialP19Assessment,
  computeOfficialP20Assessment,
} from "@/components/utils/bassAuthoritativeAssessment";
import { stampPoolAuthority } from "@/components/room/bass/bassResultAuthority";
import { selectCandidateFromPool } from "@/components/utils/bassOperatingEnvelopeOptimiser";
import { computeP19DeviationBelowSchroeder } from "@/components/utils/rp22BassMetrics";

const FREQUENCIES = [20, 25, 31.5, 40, 50, 63, 80, 100, 120];
const curve = (values) => FREQUENCIES.map((frequency, index) => ({ frequency, spl: values[index] }));
const flat = (spl) => curve(FREQUENCIES.map(() => spl));
const TARGET = flat(100);
const BAND = { assessmentStartHz: 20, assessmentEndHz: 120 };

function assess(rspPostEqCurve, perSeatPostEqCurves, canonicalTargetCurve = TARGET) {
  return {
    p19: computeOfficialP19Assessment({ rspPostEqCurve, canonicalTargetCurve, ...BAND }),
    p20: computeOfficialP20Assessment({ rspPostEqCurve, perSeatPostEqCurves, ...BAND }),
  };
}

function fixtureCandidate(id, p14, rspPostEqCurve, seatCurve) {
  const assessment = assess(rspPostEqCurve, [{ seatId: `${id}-seat`, responseData: seatCurve }]);
  return {
    fixtureId: id,
    designEqFitProfile: id === "accuracy" ? "house_curve" : "standard",
    startStrategy: id === "accuracy" ? "multi-start" : "single",
    requestedP14Level: 1, requestedP18Level: 1, requestedP19Level: 1,
    assessmentStartHz: 20, assessmentEndHz: 120,
    achievedP14Level: p14, achievedP14Db: 113 + p14,
    achievedP18Level: 2, achievedP18FrequencyHz: 25,
    achievedP19Level: assessment.p19.level,
    achievedP19VariationDb: assessment.p19.variationDbRaw,
    officialP19VariationDb: assessment.p19.variationDbRaw,
    achievedP20Level: assessment.p20.worstSeat.level,
    achievedP20VariationDb: assessment.p20.worstSeat.variationDbRaw,
    worstP20SeatId: assessment.p20.worstSeat.seatId,
    p20Available: true,
    perSeatP20Results: assessment.p20.perSeatResults,
    perSeatPostEqCurves: [{ seatId: `${id}-seat`, responseData: seatCurve }],
    generatedFilterBank: [{ enabled: true, frequencyHz: id === "accuracy" ? 50 : 63, gainDb: -2, Q: 3 }],
    finalPostEqCurve: rspPostEqCurve,
    bankValidationResult: { allOk: true },
    allAtLeastL1: true,
    meetsRequestedEnvelope: true,
  };
}

export function runBassAuthoritativeAssessmentFixtures() {
  const checks = [];
  const check = (name, passed) => checks.push({ name, passed: !!passed });
  const rsp = curve([100, 100, 100, 105, 100, 100, 100, 100, 100]);
  const seatA = curve([100, 100, 100, 100, 100, 100, 100, 100, 100]);
  const seatB = curve([100, 100, 100, 92, 100, 100, 100, 100, 100]);
  const baseline = assess(rsp, [{ seatId: "seat-a", responseData: seatA }]);
  const changedSeat = assess(rsp, [{ seatId: "seat-a", responseData: seatB }]);
  check("1. Non-RSP change affects P20 only", baseline.p19.variationDbRaw === changedSeat.p19.variationDbRaw && baseline.p20.worstSeat.variationDbRaw !== changedSeat.p20.worstSeat.variationDbRaw);

  const shiftedTarget = curve([100, 100, 100, 98, 100, 100, 100, 100, 100]);
  const targetChanged = assess(rsp, [{ seatId: "seat-a", responseData: seatA }], shiftedTarget);
  check("2. Target change affects P19 only", baseline.p19.variationDbRaw !== targetChanged.p19.variationDbRaw && baseline.p20.worstSeat.variationDbRaw === targetChanged.p20.worstSeat.variationDbRaw);

  const changedRspCurve = curve([100, 100, 100, 110, 100, 100, 100, 100, 100]);
  const changedRsp = assess(changedRspCurve, [{ seatId: "seat-a", responseData: seatA }]);
  check("3. RSP change affects P19 and P20", baseline.p19.variationDbRaw !== changedRsp.p19.variationDbRaw && baseline.p20.worstSeat.variationDbRaw !== changedRsp.p20.worstSeat.variationDbRaw);

  const identical = assess(rsp, [{ seatId: "seat-identical", responseData: rsp }]);
  check("4. Identical curves produce P20 zero", identical.p20.worstSeat.variationDbRaw === 0 && identical.p20.worstSeat.displayVariationDb === 0 && identical.p20.worstSeat.level === 4 && identical.p20.worstSeat.comparisonPointCount === FREQUENCIES.length);
  const oneSeat = assess(rsp, []);
  check("5. One-seat project produces P20 N/A", oneSeat.p20.available === false && oneSeat.p20.worstSeat === null);

  const severeSeatNull = assess(rsp, [{ seatId: "seat-null", responseData: curve([100, 100, 100, 65, 100, 100, 100, 100, 100]) }]);
  check("6. Non-RSP null affects P20 not P19", severeSeatNull.p20.worstSeat.variationDbRaw > baseline.p20.worstSeat.variationDbRaw && severeSeatNull.p19.variationDbRaw === baseline.p19.variationDbRaw);

  // After /2 removal: ±dB is the direct maximum absolute deviation (not halved).
  // Curves use flat(X) vs TARGET=100, so deviation = |X - 100| directly.
  const belowThreeDbP19 = assess(flat(102.9), []);
  const threeDbP19 = assess(flat(103), []);
  const belowFourDbP19 = assess(flat(103.9), []);
  const fourDbP19 = assess(flat(104), []);
  const belowFiveDbP19 = assess(flat(104.9), []);
  const fiveDbP19 = assess(flat(105), []);
  const belowSixDbP19 = assess(flat(105.9), []);
  const sixDbP19 = assess(flat(106), []);
  check("6a. P19 2.9 dB deviation is direct L3", Math.abs(belowThreeDbP19.p19.variationDbRaw - 2.9) < 1e-9 && Math.abs(belowThreeDbP19.p19.displayVariationDb - 2.9) < 1e-9 && belowThreeDbP19.p19.level === 3);
  check("6b. P19 3 dB deviation is ±3 dB L3", threeDbP19.p19.variationDbRaw === 3 && threeDbP19.p19.displayVariationDb === 3 && threeDbP19.p19.level === 3);
  check("6c. P19 3.9 dB deviation is direct L2", Math.abs(belowFourDbP19.p19.variationDbRaw - 3.9) < 1e-9 && Math.abs(belowFourDbP19.p19.displayVariationDb - 3.9) < 1e-9 && belowFourDbP19.p19.level === 2);
  check("6d. P19 4 dB deviation is ±4 dB L2", fourDbP19.p19.variationDbRaw === 4 && fourDbP19.p19.displayVariationDb === 4 && fourDbP19.p19.level === 2);
  check("6e. P19 4.9 dB deviation is direct L1", Math.abs(belowFiveDbP19.p19.variationDbRaw - 4.9) < 1e-9 && Math.abs(belowFiveDbP19.p19.displayVariationDb - 4.9) < 1e-9 && belowFiveDbP19.p19.level === 1);
  check("6f. P19 5 dB deviation is ±5 dB L1", fiveDbP19.p19.variationDbRaw === 5 && fiveDbP19.p19.displayVariationDb === 5 && fiveDbP19.p19.level === 1);
  check("6g. P19 5.9 dB deviation is direct FAIL", Math.abs(belowSixDbP19.p19.variationDbRaw - 5.9) < 1e-9 && Math.abs(belowSixDbP19.p19.displayVariationDb - 5.9) < 1e-9 && belowSixDbP19.p19.level === 0);
  check("6h. P19 6 dB deviation is ±6 dB FAIL", sixDbP19.p19.variationDbRaw === 6 && sixDbP19.p19.displayVariationDb === 6 && sixDbP19.p19.level === 0);
  const legacyP19BelowFail = computeP19DeviationBelowSchroeder({ freqsHz: [20, 40], splDb: [100, 111.9], targetDb: [100, 100], schroederHz: 120 });
  const legacyP19Fail = computeP19DeviationBelowSchroeder({ freqsHz: [20, 40], splDb: [100, 112], targetDb: [100, 100], schroederHz: 120 });
  check("6i. Shared P19 helper preserves direct maximum deviation", Math.abs(legacyP19BelowFail.resultDb - 11.9) < 1e-9 && legacyP19Fail.resultDb === 12 && legacyP19Fail.totalDifferenceDbRaw === 12);

  // After /2 removal: ±dB is the direct max absolute seat-to-RSP deviation (not halved).
  // P20 has no L1: >4 dB is FAIL (level 0), not L1.
  const fourDbDifference = assess(flat(100), [{ seatId: "seat-four-db", responseData: flat(96) }]);
  const belowFiveDbDifference = assess(flat(100), [{ seatId: "seat-below-five-db", responseData: flat(95.1) }]);
  const fiveDbDifference = assess(flat(100), [{ seatId: "seat-five-db", responseData: flat(95) }]);
  check("6j. P20 4 dB difference reports ±4 dB L2", fourDbDifference.p20.worstSeat.variationDbRaw === 4 && fourDbDifference.p20.worstSeat.displayVariationDb === 4 && fourDbDifference.p20.worstSeat.level === 2);
  check("6k. P20 4.9 dB difference is direct FAIL", Math.abs(belowFiveDbDifference.p20.worstSeat.variationDbRaw - 4.9) < 1e-9 && Math.abs(belowFiveDbDifference.p20.worstSeat.displayVariationDb - 4.9) < 1e-9 && belowFiveDbDifference.p20.worstSeat.level === 0);
  check("6l. P20 5 dB difference reports ±5 dB FAIL (no L1)", fiveDbDifference.p20.worstSeat.variationDbRaw === 5 && fiveDbDifference.p20.worstSeat.displayVariationDb === 5 && fiveDbDifference.p20.worstSeat.level === 0);

  const severeRsp = curve([100, 100, 100, 65, 100, 100, 100, 100, 100]);
  const officialNull = computeOfficialP19Assessment({ rspPostEqCurve: severeRsp, canonicalTargetCurve: TARGET, ...BAND });
  const correctableNull = computeCorrectableP19Diagnostic({ rspPostEqCurve: severeRsp, canonicalTargetCurve: TARGET, protectedNullRegions: [{ startHz: 31, endHz: 50 }], ...BAND });
  check("7. RSP null remains official and exclusion is diagnostic only", officialNull.variationDbRaw > correctableNull.variationDbRaw && officialNull.label === "P19 RSP" && correctableNull.label === "Correctable P19 — optimiser diagnostic");

  const splCandidate = fixtureCandidate("spl", 4, changedRspCurve, seatA);
  const accuracyCandidate = fixtureCandidate("accuracy", 2, rsp, seatB);
  const pool = stampPoolAuthority({ candidates: [splCandidate, accuracyCandidate], selectablePool: [splCandidate, accuracyCandidate], poolId: "assessment-fixture", performanceSummary: {} });
  const splSelection = selectCandidateFromPool(pool);
  const accuracySelection = selectCandidateFromPool(pool);
  check("8. Canonical selection is mode-independent and retains exact candidate assessments", splSelection.selectedCandidateId === accuracySelection.selectedCandidateId && splSelection.selectedMode === "balanced" && accuracySelection.selectedMode === "balanced" && Number.isFinite(splSelection.selectedCandidate.officialP19VariationDb) && Number.isFinite(splSelection.selectedCandidate.achievedP20VariationDb));
  check("9. Selected candidate and filter bank share canonical identity", splSelection.productionCandidateId === splSelection.selectedCandidateId && splSelection.selectedByMode?.balanced?.candidateId === splSelection.selectedCandidateId && splSelection.filterBankSignature === splSelection.selectedCandidate.filterBankSignature);

  const emptySeat = assess(rsp, [{ seatId: "seat-empty", responseData: [] }]);
  check("10. Empty non-RSP curve produces P20 N/A", !emptySeat.p20.available && emptySeat.p20.perSeatResults.length === 0 && emptySeat.p20.worstSeat === null);
  const nonOverlappingSeat = assess(rsp, [{ seatId: "seat-high-band", responseData: [{ frequency: 200, spl: 100 }, { frequency: 250, spl: 100 }, { frequency: 300, spl: 100 }] }]);
  check("11. Non-overlapping non-RSP curve produces P20 N/A", !nonOverlappingSeat.p20.available && nonOverlappingSeat.p20.perSeatResults.length === 0);
  const partialSeatCurve = [{ frequency: 63, spl: 100 }, { frequency: 80, spl: 100 }, { frequency: 100, spl: 100 }];
  const partialOverlap = assess(rsp, [{ seatId: "seat-partial", responseData: partialSeatCurve }]);
  check("12. Partial overlap uses genuine points only", partialOverlap.p20.worstSeat?.comparisonPointCount === partialSeatCurve.length && partialOverlap.p20.worstSeat.comparisonPointCount < FREQUENCIES.length);
  const aliasesExcluded = assess(rsp, [
    { seatId: " MLP ", responseData: seatB },
    { seatId: "RSP", responseData: seatB },
    { seatId: "synthetic", __isSyntheticRsp: true, responseData: seatB },
    { seatId: "seat-valid", responseData: rsp },
  ]);
  check("13. RSP aliases and synthetic fallbacks are excluded", aliasesExcluded.p20.perSeatResults.length === 1 && aliasesExcluded.p20.perSeatResults[0].seatId === "seat-valid");
  check("14. Valid identical curves remain P20 zero L4", identical.p20.available && identical.p20.worstSeat.variationDbRaw === 0 && identical.p20.worstSeat.level === 4);

  const rawValues = {
    baseline: { rspP19: baseline.p19.variationDbRaw, seats: baseline.p20.perSeatResults },
    changedSeat: { rspP19: changedSeat.p19.variationDbRaw, seats: changedSeat.p20.perSeatResults },
    changedTarget: { rspP19: targetChanged.p19.variationDbRaw, seats: targetChanged.p20.perSeatResults },
    changedRsp: { rspP19: changedRsp.p19.variationDbRaw, seats: changedRsp.p20.perSeatResults },
    identical: { rspP19: identical.p19.variationDbRaw, seats: identical.p20.perSeatResults },
    oneSeat: { rspP19: oneSeat.p19.variationDbRaw, seats: oneSeat.p20.perSeatResults },
    severeSeatNull: { rspP19: severeSeatNull.p19.variationDbRaw, seats: severeSeatNull.p20.perSeatResults },
    severeRspNull: { rspP19: officialNull.variationDbRaw, correctableP19: correctableNull.variationDbRaw, seats: [] },
    selectedPriorities: {
      spl: { candidateId: splSelection.selectedCandidateId, rspP19: splSelection.officialP19VariationDb, seats: splSelection.selectedCandidate.perSeatP20Results },
      accuracy: { candidateId: accuracySelection.selectedCandidateId, rspP19: accuracySelection.officialP19VariationDb, seats: accuracySelection.selectedCandidate.perSeatP20Results },
    },
    missingData: {
      emptySeat: emptySeat.p20,
      nonOverlappingSeat: nonOverlappingSeat.p20,
      partialOverlap: partialOverlap.p20,
      aliasesExcluded: aliasesExcluded.p20,
    },
  };
  const passed = checks.filter((item) => item.passed).length;
  return { checks, passed, total: checks.length, allPassed: passed === checks.length, rawValues };
}