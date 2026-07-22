import {
  computeCorrectableP19Diagnostic,
  computeOfficialP19Assessment,
  computeOfficialP20Assessment,
} from "@/components/utils/bassAuthoritativeAssessment";
import { stampPoolAuthority } from "@/components/room/bass/bassResultAuthority";
import { selectCandidateFromPool } from "@/components/utils/bassOperatingEnvelopeOptimiser";

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
    achievedP19Level: assessment.p19.variationDbRaw <= 2 ? 4 : 1,
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

  const severeRsp = curve([100, 100, 100, 65, 100, 100, 100, 100, 100]);
  const officialNull = computeOfficialP19Assessment({ rspPostEqCurve: severeRsp, canonicalTargetCurve: TARGET, ...BAND });
  const correctableNull = computeCorrectableP19Diagnostic({ rspPostEqCurve: severeRsp, canonicalTargetCurve: TARGET, protectedNullRegions: [{ startHz: 31, endHz: 50 }], ...BAND });
  check("7. RSP null remains official and exclusion is diagnostic only", officialNull.variationDbRaw > correctableNull.variationDbRaw && officialNull.label === "P19 RSP" && correctableNull.label === "Correctable P19 — optimiser diagnostic");

  const splCandidate = fixtureCandidate("spl", 4, changedRspCurve, seatA);
  const accuracyCandidate = fixtureCandidate("accuracy", 2, rsp, seatB);
  const pool = stampPoolAuthority({ candidates: [splCandidate, accuracyCandidate], selectablePool: [splCandidate, accuracyCandidate], poolId: "assessment-fixture", performanceSummary: {} });
  const splSelection = selectCandidateFromPool(pool, "spl");
  const accuracySelection = selectCandidateFromPool(pool, "house_curve_accuracy");
  check("8. Priority selection surfaces exact candidate assessments", splSelection.selectedCandidateId !== accuracySelection.selectedCandidateId && splSelection.officialP19VariationDb === splSelection.selectedCandidate.officialP19VariationDb && accuracySelection.officialP19VariationDb === accuracySelection.selectedCandidate.officialP19VariationDb && splSelection.achievedP20VariationDb === splSelection.selectedCandidate.achievedP20VariationDb && accuracySelection.achievedP20VariationDb === accuracySelection.selectedCandidate.achievedP20VariationDb);
  check("9. Graph, bank, P19 and P20 share candidate identity", [splSelection.productionCandidateId, splSelection.assessmentAuthority?.graphCandidateId, splSelection.assessmentAuthority?.filterBankCandidateId, splSelection.assessmentAuthority?.p19CandidateId, ...(splSelection.assessmentAuthority?.p20CandidateIds || [])].every((id) => id === splSelection.selectedCandidateId));

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