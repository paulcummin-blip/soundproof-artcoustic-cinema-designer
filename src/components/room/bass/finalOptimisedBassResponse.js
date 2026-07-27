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
    canonicalVerticalOffsetDb: candidate.canonicalVerticalOffsetDb ?? null,
    operatingLevelOffsetDb: candidate.operatingLevelOffsetDb ?? 0,
    rspBeforePeqAtOperatingLevel: cloneCurve(candidate.rspBeforePeqAtOperatingLevel),
    positiveEqDemandCurve: cloneCurve(candidate.positiveEqDemandCurve),
    fitMetrics: candidate.fitMetrics || null,
    protectedNullRegions: (candidate.protectedNullRegions || []).map((region) => ({ ...region })),
    physicalValidation: candidate.physicalValidation || null,
    rawResponseSignature: candidate.rawResponseSignature || buildCurveSignature(candidate.rawResponseCurve),
    eqFilterBank,
    filterBankSignature: candidate.filterBankSignature || buildFilterBankSignature(candidate),
    postEqCurveSignature: candidate.postEqCurveSignature || buildCurveSignature(postEqRspCurve),
    postEqRspCurve,
    postEqPerSeatCurves,
    maximumSplCurveBeforeEq: cloneCurve(candidate.pairedP14P18Authority?.curves?.rawDeliveredCurve),
    maximumSplCurveAfterEq: cloneCurve(candidate.pairedP14P18Authority?.curves?.postEqDeliveredCurve),
    maximumSplAuthority: candidate.pairedP14P18Authority?.authority || null,
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