import { calculateHouseCurveEqCurve } from "@/components/utils/houseCurveFitter";
import { generateHouseCurveTrials } from "@/components/utils/houseCurveFilterTrials";
import { applyBassSmoothing } from "@/components/room/bass/bassGraphSmoothing";
import { artcousticHouseCurveOffsetAt } from "@/components/utils/artcousticHouseCurve";
import { deriveResponseAnchoredTarget } from "@/components/utils/houseCurveTargetAuthority";

const ANCHOR_DB = 114;
const gaussian = (frequency, centre, width, gain) => gain * Math.exp(-0.5 * ((frequency - centre) / width) ** 2);
const frequencies = Array.from({ length: 577 }, (_, index) => 20 + index * 0.3125);

function referenceResidual(frequency) {
  return gaussian(frequency, 34.37, 3.8, 17) - gaussian(frequency, 40, 1.4, 55)
    + gaussian(frequency, 77, 3, 9) - gaussian(frequency, 68.5, 2.5, 7.5)
    + gaussian(frequency, 101, 2.7, 13) - gaussian(frequency, 109, 2.2, 12)
    + gaussian(frequency, 120, 4, 8);
}

export function buildHouseCurveAccuracyReference() {
  const rawCurve = frequencies.map((frequency) => ({
    frequency,
    spl: ANCHOR_DB + artcousticHouseCurveOffsetAt(frequency) + referenceResidual(frequency),
  }));
  const perSeatRawCurves = [0.5, -0.4, 0.2, -0.6].map((offset, index) => ({
    seatId: `seat-${index + 1}`,
    responseData: rawCurve.map((point) => ({ ...point, spl: point.spl + offset + 0.25 * Math.sin(point.frequency / (8 + index)) })),
  }));
  return { rawCurve, perSeatRawCurves };
}

function residualAt(curve, frequency) {
  const point = applyBassSmoothing(curve, "third").reduce((best, candidate) =>
    Math.abs(candidate.frequency - frequency) < Math.abs(best.frequency - frequency) ? candidate : best);
  return point.spl - (ANCHOR_DB + artcousticHouseCurveOffsetAt(point.frequency));
}

export function runCredibleValleyFixture() {
  const rawCurve = frequencies.map((frequency) => ({
    frequency,
    spl: 100 + artcousticHouseCurveOffsetAt(frequency) + gaussian(frequency, 80, 15, -7),
  }));
  const result = calculateHouseCurveEqCurve(rawCurve, [], 35, [{ modelKey: "SUB2-12" }], {
    targetAnchorDb: 100, requestedSystemOutputDb: 100,
    assessmentStartHz: 20, assessmentEndHz: 120,
  });
  return {
    filters: result.filters.filter((filter) => filter.enabled),
    bankLimits: result.bankLimits,
    pre: result.houseCurveDiagnostics.preRsp,
    post: result.houseCurveDiagnostics.postRsp,
    protectedNullRegions: result.houseCurveDiagnostics.protectedNullRegions,
  };
}

export function runHouseCurveAccuracyFixtures() {
  const { rawCurve, perSeatRawCurves } = buildHouseCurveAccuracyReference();
  const startedAt = performance.now();
  const result = calculateHouseCurveEqCurve(rawCurve, perSeatRawCurves, 35, [{ modelKey: "SUB2-12" }], {
    targetAnchorDb: ANCHOR_DB, requestedSystemOutputDb: 114,
    assessmentStartHz: 20, assessmentEndHz: 120,
  });
  const runtimeMs = performance.now() - startedAt;
  const checkpoints = [34.37, 39.6, 69.74, 77, 101, 107.56].map((frequency) => ({
    frequency, beforeResidualDb: residualAt(rawCurve, frequency), afterResidualDb: residualAt(result.curve, frequency),
  }));
  const point = (frequency) => checkpoints.find((entry) => entry.frequency === frequency);
  const diagnostics = result.houseCurveDiagnostics;
  const enabledFilters = result.filters.filter((filter) => filter.enabled);
  const correctionValues = result.combinedEqCurve.map((entry) => entry.spl);
  const trials = generateHouseCurveTrials({
    kind: "peak", severityDb: 8, startHz: 62, endHz: 98,
    centrePoint: { frequency: 80, deviationDb: 8 },
  }, [
    { band: 1, enabled: true, type: "Peak", frequencyHz: 77, gainDb: -2, Q: 8 },
    { band: 2, enabled: true, type: "Peak", frequencyHz: 81, gainDb: -2.5, Q: 10 },
  ], { maximumCutDb: 15, maximumAggregateBoostDb: 6 }, [], 20, 100);
  const mergeTrials = trials.trials.filter((trial) => trial.action === "merge");
  const refitTrials = trials.trials.filter((trial) => trial.action === "refit");
  const valley = runCredibleValleyFixture();
  const derivedAnchor = deriveResponseAnchoredTarget({ rawCurve, usableLfHz: 20 });
  const sharpPeakCurve = rawCurve.map((point) => ({ ...point, spl: point.spl + gaussian(point.frequency, 62, 0.45, 30) }));
  const deepNullCurve = rawCurve.map((point) => ({ ...point, spl: point.spl + gaussian(point.frequency, 62, 0.45, -40) }));
  const peakAnchor = deriveResponseAnchoredTarget({ rawCurve: sharpPeakCurve, usableLfHz: 20 });
  const nullAnchor = deriveResponseAnchoredTarget({ rawCurve: deepNullCurve, usableLfHz: 20 });
  const exactCurveIdentity = result.curve.every((entry, index) => Math.abs(entry.spl - (rawCurve[index].spl + result.combinedEqCurve[index].spl)) < 1e-9);
  const materiallyDifferentPointCount = result.curve.filter((entry, index) => Math.abs(entry.spl - rawCurve[index].spl) >= 0.5).length;

  const checks = [
    ["34 Hz peak materially closer", Math.abs(point(34.37).beforeResidualDb) - Math.abs(point(34.37).afterResidualDb) >= 3],
    ["69.74 Hz near-target point protected", Math.abs(point(69.74).afterResidualDb) <= 1.5],
    ["107.56 Hz near-target point protected", Math.abs(point(107.56).afterResidualDb) <= 1.5],
    ["39–40 Hz null identified as protected", diagnostics.protectedNullRegions.some((region) => region.centreFrequencyHz >= 39 && region.centreFrequencyHz <= 43)],
    ["Protected null receives no aggressive boost", !enabledFilters.some((filter) => filter.gainDb > 0 && filter.frequencyHz >= 35 && filter.frequencyHz <= 47)],
    ["Protected null remains capability limited", diagnostics.protectedNullRegions.some((region) => region.capabilityLimited && region.permittedBoostDb < region.requiredBoostDb)],
    ["Maximum residual excluding nulls improves", diagnostics.postRsp.maximumAbsoluteResidualDb < diagnostics.preRsp.maximumAbsoluteResidualDb - 0.1],
    ["RMS residual excluding nulls improves", diagnostics.postRsp.rmsResidualDb < diagnostics.preRsp.rmsResidualDb - 0.1],
    ["Curve shape improves rather than simple offset", diagnostics.postRsp.shapeRmsResidualDb < diagnostics.preRsp.shapeRmsResidualDb - 0.1 && Math.max(...correctionValues) - Math.min(...correctionValues) > 2],
    ["Aggregate cut remains within -15 dB", result.bankLimits.cutLimitOk && result.bankLimits.maxAggregateCutDb >= -15.05],
    ["Product headroom validation passes", result.bankLimits.sourceDomainHeadroomOk && result.bankLimits.boostLimitOk],
    ["Final complete-bank validation passes", result.bankValidationPassed && result.bankLimits.allOk],
    ["Near-target protection rejects unsafe overlaps", diagnostics.nearTargetProtectionRejectionCount > 0],
    ["Broad cut trials are available", mergeTrials.some((trial) => trial.filter.Q < 4 && trial.filter.gainDb <= -6)],
    ["Overlapping filters can be merged", mergeTrials.length > 0 && mergeTrials.every((trial) => trial.mergedFilterIndices.length === 2)],
    ["Occupied regions can be jointly refit", refitTrials.some((trial) => trial.filter.reason.includes("Joint centre/gain/Q refit"))],
    ["Credible broad valley uses available boost", valley.bankLimits.maxAggregateBoostDb >= 3 && valley.bankLimits.maxAggregateBoostDb <= 6.05],
    ["Valley correction respects product headroom", valley.bankLimits.sourceDomainHeadroomOk && valley.bankLimits.allOk],
    ["Valley maximum and RMS residual improve", valley.post.maximumAbsoluteResidualDb < valley.pre.maximumAbsoluteResidualDb && valley.post.rmsResidualDb < valley.pre.rmsResidualDb],
    ["Overlapping valley filters are consolidated", valley.filters.length <= 2],
    ["Robust anchor resists one sharp peak", Number.isFinite(derivedAnchor) && Math.abs(peakAnchor - derivedAnchor) < 0.5],
    ["Robust anchor resists one protected deep null", Number.isFinite(derivedAnchor) && Math.abs(nullAnchor - derivedAnchor) < 0.5],
    ["Broad non-null valley remains correctable", valley.filters.some((filter) => filter.gainDb > 0.5) && valley.protectedNullRegions.length === 0],
    ["Final curve equals raw plus combined correction", exactCurveIdentity],
    ["Effective bank visibly changes final curve", enabledFilters.length > 0 && materiallyDifferentPointCount > frequencies.length * 0.1],
    ["Correctable P19 materially improves", diagnostics.preRsp.maximumAbsoluteResidualDb - diagnostics.postRsp.maximumAbsoluteResidualDb > 1],
    ["Official P19 includes protected null", result.officialP19VariationDb > result.correctableP19VariationDb + 5],
  ].map(([name, passed]) => ({ name, passed: !!passed }));
  return {
    checks, passed: checks.filter((check) => check.passed).length, total: checks.length,
    allPassed: checks.every((check) => check.passed), runtimeMs, checkpoints,
    metrics: { pre: diagnostics.preRsp, post: diagnostics.postRsp },
    enabledFilters, bankLimits: result.bankLimits, protectedNullRegions: diagnostics.protectedNullRegions,
    derivedAnchor, officialP19VariationDb: result.officialP19VariationDb,
    correctableP19VariationDb: result.correctableP19VariationDb,
    operationCounts: result.operationCounts,
  };
}