import { buildCurveSignature, buildFilterBankSignature } from "@/components/room/bass/bassResultAuthority";

const cloneCurve = (curve) => (Array.isArray(curve) ? curve.map((point) => ({ ...point })) : []);

export function buildFinalOptimisedBassResponse({ optimisationResult, selectedLayout = [] }) {
  const candidate = optimisationResult?.selectedCandidate;
  if (!candidate?.candidateId || !Array.isArray(candidate.finalPostEqCurve) || !candidate.finalPostEqCurve.length) return null;

  const postEqRspCurve = cloneCurve(candidate.finalPostEqCurve);
  const postEqPerSeatCurves = (Array.isArray(candidate.perSeatPostEqCurves) ? candidate.perSeatPostEqCurves : [])
    .map((seat) => ({ ...seat, responseData: cloneCurve(seat.responseData) }));
  const eqFilterBank = (Array.isArray(candidate.generatedFilterBank) ? candidate.generatedFilterBank : [])
    .map((filter) => ({ ...filter }));

  return {
    selectedSubwooferLayout: (Array.isArray(selectedLayout) ? selectedLayout : []).map((source) => ({
      id: source?.id ?? null,
      modelKey: source?.modelKey ?? null,
      x: Number.isFinite(source?.x) ? source.x : null,
      y: Number.isFinite(source?.y) ? source.y : null,
      z: Number.isFinite(source?.z) ? source.z : null,
      tuning: source?.tuning ? { ...source.tuning } : null,
    })),
    selectedCandidateId: candidate.candidateId,
    canonicalFilterBank: eqFilterBank,
    canonicalPostEqRsp: postEqRspCurve,
    canonicalPostEqSeatResponses: postEqPerSeatCurves,
    canonicalHouseCurveShape: cloneCurve(candidate.canonicalHouseCurveShape),
    canonicalTargetCurve: cloneCurve(candidate.productionHouseCurveTarget),
    practicalCalibrationTarget: cloneCurve(candidate.practicalCalibrationTarget),
    p19TargetIdentity: candidate.p19TargetIdentity
      || (Array.isArray(candidate.practicalCalibrationTarget) && candidate.practicalCalibrationTarget.length
        ? "practical-calibration-target"
        : "ideal-house-target"),
    canonicalVerticalOffsetDb: candidate.canonicalVerticalOffsetDb ?? null,
    operatingLevelOffsetDb: candidate.operatingLevelOffsetDb ?? 0,
    requestedOperatingLevelOffsetDb: Number.isFinite(candidate.requestedOperatingLevelOffsetDb) ? candidate.requestedOperatingLevelOffsetDb : 0,
    baseRequestedSystemOutputDb: Number.isFinite(candidate.baseRequestedSystemOutputDb) ? candidate.baseRequestedSystemOutputDb : null,
    operatingSystemOutputDb: Number.isFinite(candidate.operatingSystemOutputDb) ? candidate.operatingSystemOutputDb : null,
    selectedOperatingOutputDb: Number.isFinite(candidate.selectedOperatingOutputDb) ? candidate.selectedOperatingOutputDb : null,
    operatingOutputDiagnostics: candidate.operatingOutputDiagnostics || null,
    physicalRawResponseCurve: cloneCurve(candidate.rawResponseCurve),
    requestedPreEqOperatingCurve: cloneCurve(candidate.requestedPreEqOperatingCurve),
    rspBeforePeqAtOperatingLevel: cloneCurve(candidate.rspBeforePeqAtOperatingLevel),
    unconstrainedPostEqCurve: cloneCurve(candidate.unconstrainedPostEqCurve),
    positiveEqDemandCurve: cloneCurve(candidate.positiveEqDemandCurve),
    capabilityLimitedRegions: (candidate.capabilityLimitedRegions || []).map((region) => ({ ...region })),
    capabilityLimitedPointCount: candidate.capabilityLimitedPointCount ?? 0,
    fitMetrics: candidate.fitMetrics || null,
    protectedNullRegions: (candidate.protectedNullRegions || []).map((region) => ({ ...region })),
    physicalValidation: candidate.physicalValidation || null,
    rawResponseSignature: candidate.rawResponseSignature || buildCurveSignature(candidate.rawResponseCurve),
    eqFilterBank,
    filterBankSignature: candidate.filterBankSignature || buildFilterBankSignature(candidate),
    postEqCurveSignature: candidate.postEqCurveSignature || buildCurveSignature(postEqRspCurve),
    postEqRspCurve,
    postEqPerSeatCurves,
    maximumSplCurveBeforeEq: cloneCurve(
      candidate.maximumSplCurveBeforeEq || candidate.pairedP14P18Authority?.curves?.rawDeliveredCurve,
    ),
    sourceCapabilityCurves: (Array.isArray(candidate.pairedP14P18Authority?.sources?.sourceDiagnostics)
      ? candidate.pairedP14P18Authority.sources.sourceDiagnostics
      : [])
      .map((source) => cloneCurve(source?.capabilityCurve))
      .filter((curve) => Array.isArray(curve) && curve.length >= 2),
    maximumSplCurveAfterEq: cloneCurve(
      candidate.maximumSplCurveAfterEq || candidate.pairedP14P18Authority?.curves?.postEqDeliveredCurve,
    ),
    maximumSplAuthority: candidate.maximumSplAuthority
      || candidate.pairedP14P18Authority?.authority
      || null,
    maximumSplSafetyMarginDb: candidate.maximumSplSafetyMarginDb ?? null,
    maximumSplGlobalEqTrimDb: candidate.maximumSplGlobalEqTrimDb ?? null,
    achievedP14Db: candidate.achievedP14Db ?? null,
    achievedP14Level: candidate.achievedP14Level ?? null,
    achievedP18FrequencyHz: candidate.achievedP18FrequencyHz ?? null,
    achievedP18Level: candidate.achievedP18Level ?? null,
    achievedP19VariationDb: candidate.achievedP19VariationDb ?? null,
    achievedP19Level: candidate.achievedP19Level ?? null,
    achievedP20VariationDb: candidate.achievedP20VariationDb ?? null,
    achievedP20Level: candidate.achievedP20Level ?? null,
    p14CapabilityDetails: candidate.p14CapabilityDetails || null,
    postEqCapabilityAssessment: candidate.postEqCapabilityAssessment || null,
    finalSeatVariationData: {
      p18: {
        candidateId: candidate.candidateId,
        level: candidate.achievedP18Level ?? null,
        extensionHz: candidate.achievedP18FrequencyHz ?? null,
        achievedExtensionBounded: candidate.p18AchievedAuthority?.achievedExtensionBounded === true,
        authority: candidate.p18AchievedAuthority || null,
      },
      p19: {
        candidateId: candidate.candidateId,
        level: candidate.achievedP19Level ?? null,
        variationDb: candidate.achievedP19VariationDb ?? null,
        worstFrequencyHz: candidate.officialP19WorstFrequencyHz ?? null,
      },
      p20: {
        candidateId: candidate.candidateId,
        level: candidate.achievedP20Level ?? null,
        variationDb: candidate.achievedP20VariationDb ?? null,
        worstSeatId: candidate.worstP20SeatId ?? null,
        perSeatResults: (Array.isArray(candidate.perSeatP20Results) ? candidate.perSeatP20Results : [])
          .map((seat) => ({ ...seat, candidateId: candidate.candidateId })),
      },
    },
    assessmentStartHz: candidate.assessmentStartHz ?? null,
    assessmentEndHz: candidate.assessmentEndHz ?? null,
    correctionStartHz: candidate.correctionStartHz ?? null,
    correctionEndHz: candidate.correctionEndHz ?? null,
  };
}

/**
 * Overlay authority scalar fields onto an existing canonical final response
 * WITHOUT re-cloning the curve arrays.
 *
 * The first buildFinalOptimisedBassResponse call produces the canonical curve
 * arrays (postEqRspCurve, canonicalTargetCurve, postEqPerSeatCurves,
 * maximumSplCurveAfterEq, sourceCapabilityCurves, eqFilterBank, etc.).
 * Authority evaluation (evaluateCanonicalBassAuthority) only changes scalar
 * metadata — it does NOT modify any curve arrays. The previous implementation
 * called buildFinalOptimisedBassResponse a SECOND time after merging authority
 * onto the candidate, which re-cloned every curve array unnecessarily.
 *
 * This helper produces the same result as that second call by reusing the
 * immutable curve arrays from the first call and overlaying only the
 * authority-dependent scalar fields.
 *
 * Immutability contract: the curve arrays on canonicalResult are reused by
 * reference. All downstream consumers (buildCanonicalCompletedBassMetricAuthority,
 * buildMetricPublicationReceipt, adaptCurrentBassOptimisationResult,
 * compactCompletedBassContract) treat them as read-only.
 * compactCompletedBassContract clones them at the compact-contract boundary.
 */
export function applyAuthorityToCanonicalResult(canonicalResult, authorityBearingCandidate) {
  if (!canonicalResult?.selectedCandidateId || !authorityBearingCandidate?.candidateId) return canonicalResult;
  const candidate = authorityBearingCandidate;
  return {
    ...canonicalResult,
    achievedP14Db: candidate.achievedP14Db ?? null,
    achievedP14Level: candidate.achievedP14Level ?? null,
    achievedP18FrequencyHz: candidate.achievedP18FrequencyHz ?? null,
    achievedP18Level: candidate.achievedP18Level ?? null,
    achievedP19VariationDb: candidate.achievedP19VariationDb ?? null,
    achievedP19Level: candidate.achievedP19Level ?? null,
    achievedP20VariationDb: candidate.achievedP20VariationDb ?? null,
    achievedP20Level: candidate.achievedP20Level ?? null,
    p14CapabilityDetails: candidate.p14CapabilityDetails || null,
    postEqCapabilityAssessment: candidate.postEqCapabilityAssessment || null,
    finalSeatVariationData: {
      p18: {
        candidateId: candidate.candidateId,
        level: candidate.achievedP18Level ?? null,
        extensionHz: candidate.achievedP18FrequencyHz ?? null,
        achievedExtensionBounded: candidate.p18AchievedAuthority?.achievedExtensionBounded === true,
        authority: candidate.p18AchievedAuthority || null,
      },
      p19: {
        candidateId: candidate.candidateId,
        level: candidate.achievedP19Level ?? null,
        variationDb: candidate.achievedP19VariationDb ?? null,
        worstFrequencyHz: candidate.officialP19WorstFrequencyHz ?? null,
      },
      p20: {
        candidateId: candidate.candidateId,
        level: candidate.achievedP20Level ?? null,
        variationDb: candidate.achievedP20VariationDb ?? null,
        worstSeatId: candidate.worstP20SeatId ?? null,
        perSeatResults: (Array.isArray(candidate.perSeatP20Results) ? candidate.perSeatP20Results : [])
          .map((seat) => ({ ...seat, candidateId: candidate.candidateId })),
      },
    },
    // Overlay the authoritative P19/P20 assessment band from the authority
    // evaluation. The canonical result's assessmentStartHz/assessmentEndHz
    // come from the fixed domain (HOUSE_CURVE_P19_START_HZ = 20); the
    // authority replaces the lower bound with the precise achieved P18 -3 dB
    // crossing for the selected P14 target. This is the single authority
    // consumed by the graph marker, persisted cache, and report/debug text.
    assessmentStartHz: Number.isFinite(candidate.assessmentStartHz)
      ? Number(candidate.assessmentStartHz)
      : (canonicalResult.assessmentStartHz ?? null),
    assessmentEndHz: Number.isFinite(candidate.assessmentEndHz)
      ? Number(candidate.assessmentEndHz)
      : (canonicalResult.assessmentEndHz ?? null),
  };
}

export function finalOptimisedBassAuthorityMatches(response) {
  if (!response?.selectedCandidateId) return false;
  const candidateId = response.selectedCandidateId;
  return response.finalSeatVariationData?.p18?.candidateId === candidateId
    && response.finalSeatVariationData?.p19?.candidateId === candidateId
    && response.finalSeatVariationData?.p20?.candidateId === candidateId
    && response.filterBankSignature === buildFilterBankSignature({ generatedFilterBank: response.eqFilterBank })
    && response.postEqCurveSignature === buildCurveSignature(response.postEqRspCurve);
}