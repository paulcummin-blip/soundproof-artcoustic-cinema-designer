/**
 * Immutable projection of one completed bass calculation.
 *
 * Consumers may reshape this object for presentation but must not calculate
 * P19/P20 or grade/floor it again.
 */

import {
  bassLevelFromRank,
  lowestPrimaryP19P20Level,
} from "@/components/utils/rp22/bassGradingAuthority";

export const CANONICAL_BASS_RESULT_VERSION = 1;

function cloneRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({ ...row }));
}

function numericLevelLabel(value) {
  const n = Number(value);
  return Number.isFinite(n) ? bassLevelFromRank(Math.max(0, Math.min(4, Math.round(n)))) : null;
}

export function buildCanonicalBassResult(contract, graphPayload = null) {
  const candidate = contract?.selectedCandidate;
  const parameters = contract?.productAnalysis?.parameters;
  if (!candidate || !parameters) return null;

  const perSeatP19 = cloneRows(candidate.perSeatP19Results);
  const perSeatP20 = cloneRows(candidate.perSeatP20Results);
  const p19 = parameters.p19 ? { ...parameters.p19 } : null;
  const p20 = parameters.p20 ? { ...parameters.p20 } : null;
  const resultForFloor = {
    perSeatP19: perSeatP19.map((seat) => ({ ...seat, isPrimary: seat.isPrimary === true })),
    perSeatP20: perSeatP20.map((seat) => ({ ...seat, isPrimary: seat.isPrimary === true })),
  };

  return Object.freeze({
    version: CANONICAL_BASS_RESULT_VERSION,
    candidateId: candidate.id || contract.selectedCandidateId || null,
    resultFingerprint: contract?.job?.resultFingerprint || null,
    P19: p19,
    P20: p20,
    seatResults: Object.freeze({
      P19: Object.freeze(perSeatP19),
      P20: Object.freeze(perSeatP20),
    }),
    recommendation: candidate.recommendation || contract.recommendation || null,
    EQPrediction: graphPayload ? Object.freeze({
      selectedCandidateId: graphPayload.selectedCandidateId || null,
      postEqRspCurve: graphPayload.postEqRspCurve || [],
      postEqPerSeatCurves: graphPayload.postEqPerSeatCurves || [],
      eqFilterBank: graphPayload.eqFilterBank || [],
    }) : null,
    grading: Object.freeze({
      P19: numericLevelLabel(p19?.level),
      P20: numericLevelLabel(p20?.level),
      primaryFloor: lowestPrimaryP19P20Level(resultForFloor),
    }),
  });
}

function sameSeatRows(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  return left.every((row, index) => {
    const other = right[index];
    return String(row?.seatId || "") === String(other?.seatId || "")
      && Number(row?.variationDbRaw) === Number(other?.variationDbRaw)
      && Number(row?.level) === Number(other?.level);
  });
}

export function validateCanonicalBassResult(contract) {
  const result = contract?.bassResult;
  if (!result || result.version !== CANONICAL_BASS_RESULT_VERSION) {
    return { valid: false, reason: "missing-canonical-bass-result" };
  }
  if (result.resultFingerprint !== contract?.job?.resultFingerprint) {
    return { valid: false, reason: "canonical-bass-result-fingerprint-mismatch" };
  }
  if (String(result.candidateId || "") !== String(contract?.selectedCandidateId || "")) {
    return { valid: false, reason: "canonical-bass-result-candidate-mismatch" };
  }
  if (!sameSeatRows(result?.seatResults?.P19, contract?.selectedCandidate?.perSeatP19Results)) {
    return { valid: false, reason: "canonical-bass-result-p19-mismatch" };
  }
  if (!sameSeatRows(result?.seatResults?.P20, contract?.selectedCandidate?.perSeatP20Results)) {
    return { valid: false, reason: "canonical-bass-result-p20-mismatch" };
  }
  const p19Level = numericLevelLabel(contract?.productAnalysis?.parameters?.p19?.level);
  const p20Level = numericLevelLabel(contract?.productAnalysis?.parameters?.p20?.level);
  if (result?.grading?.P19 !== p19Level || result?.grading?.P20 !== p20Level) {
    return { valid: false, reason: "canonical-bass-result-grading-mismatch" };
  }
  return { valid: true, reason: null };
}
