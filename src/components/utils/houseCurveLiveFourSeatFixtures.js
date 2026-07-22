import { buildCurveFromBank, evaluateProvisionalBankLimits, peakingEqResponseDb } from "@/components/utils/designEqCalibration";
import { applyBassSmoothing } from "@/components/room/bass/bassGraphSmoothing";
import { buildBassGraphSeries } from "@/components/room/bass/bassGraphDomainBuilder";
import { computeOfficialP19Assessment, computeOfficialP20Assessment } from "@/components/utils/bassAuthoritativeAssessment";
import { artcousticHouseCurveOffsetAt } from "@/components/utils/artcousticHouseCurve";
import { stableBankSignature } from "@/components/utils/houseCurveEvaluationMemo";
import { runProfessionalResidualCleanup } from "@/components/utils/houseCurveResidualCleanup";

const ANCHOR_DB = 113.54;
const CHECKPOINTS = [34.37, 39.71, 91.1];
const gaussian = (frequency, centre, width, gain) => gain * Math.exp(-0.5 * ((frequency - centre) / width) ** 2);
const targetAt = (frequency) => ANCHOR_DB + artcousticHouseCurveOffsetAt(frequency);

function buildLiveCase() {
  const grid = [...new Set([
    ...Array.from({ length: 721 }, (_, index) => 20 + index * 0.25),
    ...CHECKPOINTS,
  ])].sort((left, right) => left - right);
  const rawCurve = grid.map((frequency) => {
    let residual = gaussian(frequency, 34.37, 1.7, 14.1)
      + gaussian(frequency, 39.71, 0.9, -22)
      + gaussian(frequency, 91.1, 2.2, 1.9);
    if (frequency === 34.37) residual = 14.1;
    if (frequency === 39.71) residual = -14.8;
    if (frequency === 91.1) residual = 1.9;
    return { frequency, spl: targetAt(frequency) + residual };
  });
  const perSeatRawCurves = [0.15, -0.12, 0.08, -0.1].map((offset, index) => ({
    seatId: `seat-${index + 1}`,
    responseData: rawCurve.map((point) => ({
      frequency: point.frequency,
      spl: point.spl + offset + 0.04 * Math.sin(point.frequency / (7 + index)),
    })),
  }));
  const initialFilters = [
    { band: 1, enabled: true, type: "Peak", frequencyHz: 34.37, gainDb: -0.3, Q: 10, reason: "Captured live pre-cleanup bank" },
    { band: 2, enabled: true, type: "Peak", frequencyHz: 91.1, gainDb: -3.6, Q: 4, reason: "Captured live pre-cleanup bank" },
  ];
  const protectedNullRegions = [{
    startHz: 34.5,
    endHz: 45,
    centreFrequencyHz: 39.71,
    signedResidualDb: -14.8,
    requiredBoostDb: 14.8,
    permittedBoostDb: 6,
    reason: "Captured extreme cancellation null",
  }];
  const canonicalTargetCurve = grid.map((frequency) => ({ frequency, spl: targetAt(frequency) }));
  return { rawCurve, perSeatRawCurves, initialFilters, protectedNullRegions, canonicalTargetCurve };
}

function nearest(curve, frequency) {
  return curve.reduce((best, point) => Math.abs(point.frequency - frequency) < Math.abs(best.frequency - frequency) ? point : best);
}

function correctionAt(filters, frequency) {
  return filters.reduce((sum, filter) => sum + peakingEqResponseDb(frequency, filter), 0);
}

export function runHouseCurveLiveFourSeatFixtures() {
  const fixture = buildLiveCase();
  const preCurve = buildCurveFromBank(fixture.rawCurve, fixture.initialFilters);
  const preP20 = computeOfficialP20Assessment({
    rspPostEqCurve: preCurve,
    perSeatPostEqCurves: fixture.perSeatRawCurves.map((seat) => ({
      ...seat,
      responseData: buildCurveFromBank(seat.responseData, fixture.initialFilters),
    })),
    assessmentStartHz: 20,
    assessmentEndHz: 120,
  });
  const result = runProfessionalResidualCleanup({
    filters: fixture.initialFilters,
    rawCurve: fixture.rawCurve,
    perSeatRawCurves: fixture.perSeatRawCurves,
    anchorDb: ANCHOR_DB,
    canonicalTargetCurve: fixture.canonicalTargetCurve,
    protectedNullRegions: fixture.protectedNullRegions,
    activeSubs: [{ modelKey: "SUB2-12" }],
    usableLfHz: 20,
    requestedSystemOutputDb: ANCHOR_DB,
    assessmentStartHz: 20,
    assessmentEndHz: 120,
    correctionStartHz: 20,
    correctionEndHz: 200,
    profile: { maximumCutDb: 15, maximumAggregateBoostDb: 6 },
    priorIterationTrace: [],
  });
  const postP19 = computeOfficialP19Assessment({
    rspPostEqCurve: result.curve,
    canonicalTargetCurve: fixture.canonicalTargetCurve,
    assessmentStartHz: 20,
    assessmentEndHz: 120,
  });
  const postP20 = computeOfficialP20Assessment({
    rspPostEqCurve: result.curve,
    perSeatPostEqCurves: fixture.perSeatRawCurves.map((seat) => ({
      ...seat,
      responseData: buildCurveFromBank(seat.responseData, result.filters),
    })),
    assessmentStartHz: 20,
    assessmentEndHz: 120,
  });
  const checkpoints = CHECKPOINTS.map((frequency) => {
    const raw = nearest(fixture.rawCurve, frequency);
    const post = nearest(result.curve, frequency);
    return {
      frequency,
      preEqSpl: raw.spl,
      targetSpl: targetAt(frequency),
      requiredCorrectionDb: targetAt(frequency) - raw.spl,
      aggregateCorrectionDb: correctionAt(result.filters, frequency),
      postResidualDb: post.spl - targetAt(frequency),
    };
  });
  const point = (frequency) => checkpoints.find((checkpoint) => checkpoint.frequency === frequency);
  const correctedPoints = applyBassSmoothing(result.curve, "third")
    .filter((entry) => entry.frequency >= 20 && entry.frequency <= 120)
    .filter((entry) => !fixture.protectedNullRegions.some((region) => entry.frequency >= region.startHz && entry.frequency <= region.endHz));
  const correctableP19 = Math.max(...correctedPoints.map((entry) => Math.abs(entry.spl - targetAt(entry.frequency))));
  const enabledFilters = result.filters.filter((filter) => filter.enabled);
  const bankLimits = evaluateProvisionalBankLimits(enabledFilters, fixture.rawCurve, [{ modelKey: "SUB2-12" }], 20, ANCHOR_DB, { maximumCutDb: 15, maximumAggregateBoostDb: 6 });
  const filterBankSignature = stableBankSignature(enabledFilters);
  const candidateId = "live-four-seat-house-curve-regression";
  const graphSeries = buildBassGraphSeries({
    designEqEnabled: true,
    showHouseCurve: true,
    rspRawCurve: fixture.rawCurve,
    optimisationResult: {
      selectedCandidateId: candidateId,
      filterBankSignature,
      finalPostEqCurve: result.curve,
      selectedCandidate: { productionHouseCurveTarget: fixture.canonicalTargetCurve, correctionStartHz: 20, correctionEndHz: 200 },
    },
    hasMatchingDetailedResult: true,
    smoothingMode: "none",
  });
  const graphPostEq = graphSeries.find((series) => series.kind === "post-eq");
  const diagnostic34 = result.diagnostics.find((diagnostic) => Math.abs(diagnostic.centreFrequencyHz - 34.37) < 0.5);
  const diagnostic39 = result.diagnostics.find((diagnostic) => diagnostic.protectedNullOverlap && Math.abs(diagnostic.centreFrequencyHz - 39.71) < 1);
  const checks = [
    ["34.37 Hz receives −12 to −15 dB aggregate cut", point(34.37).aggregateCorrectionDb <= -12 && point(34.37).aggregateCorrectionDb >= -15.05],
    ["34.37 Hz post-EQ residual is within ±2 dB", Math.abs(point(34.37).postResidualDb) <= 2],
    ["39.71 Hz remains protected and receives no boost", diagnostic39?.finalDisposition.includes("protected-null") && point(39.71).aggregateCorrectionDb <= 0],
    ["Aggregate boost never exceeds +6 dB", bankLimits.boostLimitOk && bankLimits.maxAggregateBoostDb <= 6.05],
    ["91.10 Hz target crossing is refined within ±1 dB", Math.abs(point(91.1).postResidualDb) <= 1],
    ["Correctable P19 reaches ±3 dB", correctableP19 <= 3],
    ["Official P19 still includes protected RSP null", postP19.worstFrequencyHz >= 34.5 && postP19.worstFrequencyHz <= 45 && postP19.variationDbRaw > correctableP19],
    ["P20 does not fall below captured L4 level", preP20.worstSeat?.level === 4 && postP20.worstSeat?.level >= preP20.worstSeat.level],
    ["Maximum aggregate cut remains −15 dB", bankLimits.cutLimitOk && bankLimits.maxAggregateCutDb >= -15.05],
    ["Maximum enabled filters remains ten", enabledFilters.length <= 10],
    ["34 Hz diagnostic records exact prior disposition and every attempted rejection", diagnostic34?.priorFit.disposition === "not-discovered-on-1/3-octave-scoring-grid" && diagnostic34.attempts.length > 0 && diagnostic34.attempts.every((attempt) => attempt.accepted || !!attempt.rejectionReason)],
    ["34 Hz diagnostic includes filters, headroom, null overlap and selected attempt", Array.isArray(diagnostic34?.overlappingFilters) && Number.isFinite(diagnostic34?.remainingCutHeadroomDb) && diagnostic34?.protectedNullOverlap === false && diagnostic34?.acceptedAttempt?.selected],
    ["Graph uses exact selected candidate curve and filter-bank signature", graphPostEq?.candidateId === candidateId && graphPostEq?.filterBankSignature === filterBankSignature && JSON.stringify(graphPostEq.data) === JSON.stringify(result.curve)],
  ].map(([name, passed]) => ({ name, passed: !!passed }));
  return {
    checks,
    passed: checks.filter((check) => check.passed).length,
    total: checks.length,
    allPassed: checks.every((check) => check.passed),
    checkpoints,
    correctableP19VariationDb: correctableP19,
    officialP19VariationDb: postP19.variationDbRaw,
    preP20Level: preP20.worstSeat?.level ?? null,
    postP20Level: postP20.worstSeat?.level ?? null,
    enabledFilters,
    bankLimits,
    diagnostics: result.diagnostics,
    graphAuthority: { candidateId, filterBankSignature, graphCandidateId: graphPostEq?.candidateId, graphFilterBankSignature: graphPostEq?.filterBankSignature },
  };
}