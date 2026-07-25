import { generateCanonicalCandidatePool } from "@/components/utils/canonicalBassOptimiser";
import { selectCandidateFromPool } from "@/components/utils/bassCandidatePoolSelection";
import { buildCurveSignature } from "@/components/room/bass/bassResultAuthority";
import { computeCalibrationFingerprint } from "@/components/room/bass/bassAnalysisFingerprints";
import { applyBassSmoothing } from "@/components/room/bass/bassGraphSmoothing";

const frequencies = Array.from({ length: 181 }, (_, index) => 20 + index);
const gaussian = (frequency, centre, width, gain) => gain * Math.exp(-0.5 * ((frequency - centre) / width) ** 2);
const rawCurve = frequencies.map((frequency) => ({
  frequency,
  spl: 94 + 4 * Math.log10(120 / frequency) + gaussian(frequency, 42, 7, 7) + gaussian(frequency, 73, 9, -4),
}));
const seatCurve = (seatId, shift) => ({
  seatId,
  responseData: rawCurve.map((point) => ({ ...point, spl: point.spl + shift + gaussian(point.frequency, 58, 12, shift * 0.3) })),
});
const physicalInputs = {
  rawCurve,
  activeSubs: [{ id: "sub-1", modelKey: "SUB2-12" }, { id: "sub-2", modelKey: "SUB2-12" }],
  usableLfHz: 20,
  transitionHz: 120,
  correctionEndHz: 200,
  perSeatRawCurves: [seatCurve("seat-1", -0.6), seatCurve("seat-2", 0.8)],
};

export function runCanonicalBassEqFixtures() {
  const smoothed = applyBassSmoothing(rawCurve, "third");
  const legacyReferenceBand = smoothed.filter((point) => point.frequency >= 150 && point.frequency <= 200);
  const sortedLegacyLevels = legacyReferenceBand.map((point) => point.spl).sort((a, b) => a - b);
  const middle = Math.floor(sortedLegacyLevels.length / 2);
  const previousProductionAnchorDb = sortedLegacyLevels.length % 2
    ? sortedLegacyLevels[middle]
    : (sortedLegacyLevels[middle - 1] + sortedLegacyLevels[middle]) / 2;
  const levels = [1, 2, 3, 4].map((requestedLevel) => {
    const pool = generateCanonicalCandidatePool({ ...physicalInputs, requestedLevel, requestedTargetSplDb: 100 + requestedLevel, targetBasis: requestedLevel % 2 ? "minimum" : "recommended" });
    const result = selectCandidateFromPool(pool);
    const candidate = result.selectedCandidate;
    const workerFingerprintInput = computeCalibrationFingerprint({
      roomDims: { widthM: 4, lengthM: 6, heightM: 2.7 },
      rspPosition: { x: 2, y: 3, z: 1.2 },
      seatingPositions: [{ id: "seat-1", x: 1.5, y: 3, z: 1.2 }, { id: "seat-2", x: 2.5, y: 3, z: 1.2 }],
      sources: [{ id: "sub-1", modelKey: "SUB2-12", x: 1, y: 0.5, z: 0.3 }, { id: "sub-2", modelKey: "SUB2-12", x: 3, y: 0.5, z: 0.3 }],
      houseCurveFingerprint: "artcoustic-shape-v1", eqConstraints: { maxBoostDb: 6, maxCutDb: 15 },
      assessmentStartHz: 20, assessmentEndHz: 200, optimisationTransitionHz: 120, usableLfHz: 20,
      requestedLevel, requestedTargetSplDb: 100 + requestedLevel, targetBasis: requestedLevel % 2 ? "minimum" : "recommended",
    });
    return {
      requestedLevel,
      workerFingerprintInput,
      poolId: pool.poolId,
      filterBankSignature: candidate?.filterBankSignature ?? null,
      rawResponseSignature: candidate?.rawResponseSignature ?? null,
      postEqResponseSignature: candidate?.postEqCurveSignature ?? null,
      canonicalTargetShapeSignature: buildCurveSignature((candidate?.canonicalHouseCurveShape || []).map((point) => ({ frequency: point.frequency, spl: point.offsetDb }))),
      canonicalVerticalOffsetDb: candidate?.canonicalVerticalOffsetDb ?? null,
      matchesPreviousProductionAnchor: candidate?.canonicalVerticalOffsetDb === previousProductionAnchorDb,
    };
  });
  const invariantKeys = ["workerFingerprintInput", "filterBankSignature", "rawResponseSignature", "postEqResponseSignature", "canonicalTargetShapeSignature", "canonicalVerticalOffsetDb"];
  const invariant = invariantKeys.every((key) => levels.every((entry) => entry[key] === levels[0][key]));
  const movedPool = generateCanonicalCandidatePool({
    ...physicalInputs,
    rawCurve: rawCurve.map((point) => ({ ...point, spl: point.spl + gaussian(point.frequency, 36, 5, 3) })),
  });
  const moved = selectCandidateFromPool(movedPool).selectedCandidate;
  const selected = selectCandidateFromPool(generateCanonicalCandidatePool(physicalInputs)).selectedCandidate;
  const enabledFilters = (selected?.generatedFilterBank || []).filter((filter) => filter?.enabled);
  const maximumDemandDb = Math.max(0, ...(selected?.positiveEqDemandCurve || []).map((point) => point.demandDb));
  const limits = selected?.physicalValidation?.bankLimits;
  return {
    levels,
    invariant,
    previousProductionAnchorDb,
    canonicalAnchorMatchesPreviousProductionReference: levels.every((entry) => entry.matchesPreviousProductionAnchor),
    physicalChangeRecalculates: movedPool.poolId !== levels[0].poolId,
    physicalChangeMayChangeFilterBank: moved?.filterBankSignature !== selected?.filterBankSignature,
    maximumEnabledFilterBoostDb: Math.max(0, ...enabledFilters.map((filter) => filter.gainDb)),
    minimumEnabledFilterCutDb: Math.min(0, ...enabledFilters.map((filter) => filter.gainDb)),
    maximumPositiveEqDemandDb: maximumDemandDb,
    protectedNullBoostCount: enabledFilters.filter((filter) => filter.gainDb > 0 && (selected?.protectedNullRegions || []).some((region) => filter.frequencyHz >= region.startHz && filter.frequencyHz <= region.endHz)).length,
    physicalValidationPassed: selected?.physicalValidation?.passed === true,
    aggregateBoostWithinLimit: Number(limits?.maxAggregateBoostDb) <= 6.05,
    aggregateCutWithinLimit: Number(limits?.maxAggregateCutDb) >= -15.05,
  };
}