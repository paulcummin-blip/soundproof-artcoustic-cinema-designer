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
    eqFilterBank,
    filterBankSignature: candidate.filterBankSignature || buildFilterBankSignature(candidate),
    postEqCurveSignature: candidate.postEqCurveSignature || buildCurveSignature(postEqRspCurve),
    postEqRspCurve,
    postEqPerSeatCurves,
    finalSeatVariationData: {
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
  return response.finalSeatVariationData?.p19?.candidateId === candidateId
    && response.finalSeatVariationData?.p20?.candidateId === candidateId
    && response.filterBankSignature === buildFilterBankSignature({ generatedFilterBank: response.eqFilterBank })
    && response.postEqCurveSignature === buildCurveSignature(response.postEqRspCurve);
}