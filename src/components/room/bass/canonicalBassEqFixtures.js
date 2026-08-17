import { deriveCorrectionWindowOperatingOffsetDb, generateCanonicalCandidatePool } from "@/components/utils/canonicalBassOptimiser";
import { selectCandidateFromPool } from "@/components/utils/bassCandidatePoolSelection";
import { buildCurveSignature } from "@/components/room/bass/bassResultAuthority";
import { computeCalibrationFingerprint } from "@/components/room/bass/bassAnalysisFingerprints";
import { applyBassSmoothing } from "@/components/room/bass/bassGraphSmoothing";

const frequencies = Array.from({ length: 181 }, (_, index) => 20 + index);
const gaussian = (frequency, centre, width, gain) => gain * Math.exp(-0.5 * ((frequency - centre) / width) ** 2);
const rawCurve = frequencies.map((frequency) => ({
  frequency,
  // Deliberately leave useful headroom at Minimum L1 while forcing visible
  // product/output limiting at Recommended L4.
  spl: 114 + 4 * Math.log10(120 / frequency) + gaussian(frequency, 42, 7, 7) + gaussian(frequency, 73, 9, -4),
}));
const seatCurve = (seatId, shift) => ({
  seatId,
  responseData: rawCurve.map((point) => ({ ...point, spl: point.spl + shift + gaussian(point.frequency, 58, 12, shift * 0.3) })),
});
const physicalInputs = {
  rawCurve,
  activeSubs: [{ id: "sub-1", modelKey: "SUB2-12" }],
  usableLfHz: 20,
  transitionHz: 120,
  correctionEndHz: 200,
  perSeatRawCurves: [seatCurve("seat-1", -0.6), seatCurve("seat-2", 0.8)],
};

export function runCanonicalBassEqFixtures() {
  const correctionWindowTarget = frequencies.map((frequency) => ({ frequency, spl: 100 }));
  const feasibleWindowCurve = frequencies.map((frequency) => ({
    frequency,
    spl: 101 + 3 * Math.sin(Math.log2(frequency / 20) * Math.PI),
  }));
  const feasibleWindow = deriveCorrectionWindowOperatingOffsetDb({
    rawCurve: feasibleWindowCurve,
    targetCurve: correctionWindowTarget,
  });
  const peakDominatedCurve = frequencies.map((frequency) => ({
    frequency,
    spl: 96 + gaussian(frequency, 69, 6, 35),
  }));
  const peakDominatedWindow = deriveCorrectionWindowOperatingOffsetDb({
    rawCurve: peakDominatedCurve,
    targetCurve: correctionWindowTarget,
  });
  const protectedNullRegion = [{ startHz: 89.5, endHz: 90.5 }];
  const referenceProtectedWindow = deriveCorrectionWindowOperatingOffsetDb({
    rawCurve: peakDominatedCurve,
    targetCurve: correctionWindowTarget,
    protectedNullRegions: protectedNullRegion,
  });
  const protectedNullWindow = deriveCorrectionWindowOperatingOffsetDb({
    rawCurve: peakDominatedCurve.map((point) => ({
      ...point,
      spl: point.spl + gaussian(point.frequency, 90, 0.4, -40),
    })),
    targetCurve: correctionWindowTarget,
    protectedNullRegions: protectedNullRegion,
  });
  const smoothed = applyBassSmoothing(rawCurve, "third");
  const legacyReferenceBand = smoothed.filter((point) => point.frequency >= 150 && point.frequency <= 200);
  const sortedLegacyLevels = legacyReferenceBand.map((point) => point.spl).sort((a, b) => a - b);
  const middle = Math.floor(sortedLegacyLevels.length / 2);
  const previousProductionAnchorDb = sortedLegacyLevels.length % 2
    ? sortedLegacyLevels[middle]
    : (sortedLegacyLevels[middle - 1] + sortedLegacyLevels[middle]) / 2;
  const targetCases = [
    { requestedLevel: 1, requestedTargetSplDb: 109, targetBasis: "minimum" },
    { requestedLevel: 2, requestedTargetSplDb: 112, targetBasis: "minimum" },
    { requestedLevel: 3, requestedTargetSplDb: 115, targetBasis: "minimum" },
    { requestedLevel: 4, requestedTargetSplDb: 118, targetBasis: "minimum" },
    { requestedLevel: 4, requestedTargetSplDb: 123, targetBasis: "recommended" },
  ];
  const levels = targetCases.map(({ requestedLevel, requestedTargetSplDb, targetBasis }) => {
    const pool = generateCanonicalCandidatePool({
      ...physicalInputs,
      selectedP14TargetDb: requestedTargetSplDb,
      p14TargetBasis: targetBasis,
      p14TargetLevel: requestedLevel,
    });
    const result = selectCandidateFromPool(pool);
    const candidate = result.selectedCandidate;
    const workerFingerprintInput = computeCalibrationFingerprint({
      roomDims: { widthM: 4, lengthM: 6, heightM: 2.7 },
      rspPosition: { x: 2, y: 3, z: 1.2 },
      seatingPositions: [{ id: "seat-1", x: 1.5, y: 3, z: 1.2 }, { id: "seat-2", x: 2.5, y: 3, z: 1.2 }],
      sources: [{ id: "sub-1", modelKey: "SUB2-12", x: 1, y: 0.5, z: 0.3 }],
      houseCurveFingerprint: "artcoustic-shape-v1", eqConstraints: { maxBoostDb: 6, maxCutDb: 15 },
      assessmentStartHz: 20, assessmentEndHz: 200, optimisationTransitionHz: 120, usableLfHz: 20,
      selectedP14TargetDb: requestedTargetSplDb,
      p14TargetBasis: targetBasis,
      p14TargetLevel: requestedLevel,
    });
    return {
      requestedLevel,
      requestedTargetSplDb,
      targetBasis,
      workerFingerprintInput,
      poolId: pool.poolId,
      filterBankSignature: candidate?.filterBankSignature ?? null,
      rawResponseSignature: candidate?.rawResponseSignature ?? null,
      postEqResponseSignature: candidate?.postEqCurveSignature ?? null,
      canonicalTargetShapeSignature: buildCurveSignature((candidate?.canonicalHouseCurveShape || []).map((point) => ({ frequency: point.frequency, spl: point.offsetDb }))),
      canonicalVerticalOffsetDb: candidate?.canonicalVerticalOffsetDb ?? null,
      operatingLevelOffsetDb: pool.operatingLevelOffsetDb ?? null,
      capabilityLimitedPointCount: candidate?.capabilityLimitedPointCount ?? null,
      matchesPreviousProductionAnchor: candidate?.canonicalVerticalOffsetDb === previousProductionAnchorDb,
    };
  });
  const minimumL1 = levels[0];
  const recommendedL4 = levels.at(-1);
  const rawResponseInvariant = levels.every((entry) => entry.rawResponseSignature === minimumL1.rawResponseSignature);
  const targetShapeInvariant = levels.every((entry) => entry.canonicalTargetShapeSignature === minimumL1.canonicalTargetShapeSignature);
  const targetIdentityChanges = levels.every((entry, index) => index === 0 || entry.workerFingerprintInput !== minimumL1.workerFingerprintInput);
  const targetDependentHeadroomResponse = minimumL1.postEqResponseSignature !== recommendedL4.postEqResponseSignature
    && minimumL1.filterBankSignature !== recommendedL4.filterBankSignature
    && minimumL1.canonicalVerticalOffsetDb !== recommendedL4.canonicalVerticalOffsetDb
    && minimumL1.capabilityLimitedPointCount < recommendedL4.capabilityLimitedPointCount;
  const movedPool = generateCanonicalCandidatePool({
    ...physicalInputs,
    rawCurve: rawCurve.map((point) => ({ ...point, spl: point.spl + gaussian(point.frequency, 36, 5, 3) })),
  });
  const deepNullPool = generateCanonicalCandidatePool({
    ...physicalInputs,
    rawCurve: rawCurve.map((point) => ({
      ...point,
      spl: point.spl + gaussian(point.frequency, 119, 1.2, -35),
    })),
    selectedP14TargetDb: 112,
    p14TargetBasis: "minimum",
    p14TargetLevel: 2,
  });
  const moved = selectCandidateFromPool(movedPool).selectedCandidate;
  const selected = selectCandidateFromPool(generateCanonicalCandidatePool(physicalInputs)).selectedCandidate;
  const enabledFilters = (selected?.generatedFilterBank || []).filter((filter) => filter?.enabled);
  const maximumDemandDb = Math.max(0, ...(selected?.positiveEqDemandCurve || []).map((point) => point.demandDb));
  const limits = selected?.physicalValidation?.bankLimits;
  const checks = [
    { name: "Room response is independent of the selected P14 target", passed: rawResponseInvariant },
    { name: "House-curve shape is preserved while its absolute target level changes", passed: targetShapeInvariant },
    { name: "Target identity participates in the calibration fingerprint", passed: targetIdentityChanges },
    { name: "Minimum L1 and Recommended L4 produce different achieved responses when headroom changes", passed: targetDependentHeadroomResponse },
    { name: "Minimum L1 retains more headroom than Recommended L4", passed: minimumL1.capabilityLimitedPointCount < recommendedL4.capabilityLimitedPointCount },
    {
      name: "A feasible broad response is placed inside the available boost and cut window",
      passed: feasibleWindow.feasible
        && feasibleWindow.minimumResidualDb + feasibleWindow.requestedOffsetDb >= -6.000001
        && feasibleWindow.maximumResidualDb + feasibleWindow.requestedOffsetDb <= 15.000001,
    },
    {
      name: "A dominant modal peak cannot pull correctable low frequencies below the boost window",
      passed: !peakDominatedWindow.feasible
        && Math.abs(peakDominatedWindow.minimumResidualDb + peakDominatedWindow.requestedOffsetDb + 6) <= 0.000001
        && peakDominatedWindow.requestedOffsetDb > peakDominatedWindow.upperOffsetBoundDb,
    },
    {
      name: "A protected narrow null does not change the global operating-level anchor",
      passed: Math.abs(protectedNullWindow.requestedOffsetDb - referenceProtectedWindow.requestedOffsetDb) <= 0.1,
    },
    {
      name: "A detected deep modal null does not pin the complete response to maximum capability",
      passed: Number.isFinite(deepNullPool.operatingLevelOffsetDb)
        && Math.abs(deepNullPool.operatingLevelOffsetDb - levels[1].operatingLevelOffsetDb) <= 0.1,
    },
  ];
  return {
    levels,
    // Backward-compatible alias: only the physical room response is expected
    // to remain invariant across target selections.
    invariant: rawResponseInvariant,
    rawResponseInvariant,
    targetShapeInvariant,
    targetIdentityChanges,
    targetDependentHeadroomResponse,
    checks,
    passed: checks.filter((check) => check.passed).length,
    total: checks.length,
    allPassed: checks.every((check) => check.passed),
    previousProductionAnchorDb,
    canonicalAnchorMatchesPreviousProductionReference: levels.every((entry) => entry.matchesPreviousProductionAnchor),
    physicalChangeRecalculates: movedPool.poolId !== levels[0].poolId,
    physicalChangeMayChangeFilterBank: moved?.filterBankSignature !== selected?.filterBankSignature,
    maximumEnabledFilterBoostDb: Math.max(0, ...enabledFilters.map((filter) => filter.gainDb)),
    minimumEnabledFilterCutDb: Math.min(0, ...enabledFilters.map((filter) => filter.gainDb)),
    maximumPositiveEqDemandDb: maximumDemandDb,
    protectedNullBoostCount: enabledFilters.filter((filter) => filter.gainDb > 0 && (selected?.protectedNullRegions || []).some((region) => filter.frequencyHz >= region.startHz && filter.frequencyHz <= region.endHz)).length,
    correctionWindowDiagnostics: {
      feasibleWindow,
      peakDominatedWindow,
      referenceProtectedWindow,
      protectedNullWindow,
    },
    deepNullOperatingLevelOffsetDb: deepNullPool.operatingLevelOffsetDb,
    referenceL2OperatingLevelOffsetDb: levels[1].operatingLevelOffsetDb,
    physicalValidationPassed: selected?.physicalValidation?.passed === true,
    aggregateBoostWithinLimit: Number(limits?.maxAggregateBoostDb) <= 6.05,
    aggregateCutWithinLimit: Number(limits?.maxAggregateCutDb) >= -15.05,
  };
}