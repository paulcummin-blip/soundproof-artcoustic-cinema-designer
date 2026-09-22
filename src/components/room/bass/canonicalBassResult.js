/**
 * Immutable projection of one completed bass calculation.
 *
 * Consumers may reshape this object for presentation but must not calculate
 * P19/P20 or grade/floor it again.
 */

import {
  bassLevelFromRank,
  lowestBassLevel,
} from "@/components/utils/rp22/bassGradingAuthority";

export const CANONICAL_BASS_RESULT_VERSION = 3;

function cloneRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({ ...row }));
}

function markPrimaryRows(rows, primarySeatIds) {
  const primaryIds = new Set((Array.isArray(primarySeatIds) ? primarySeatIds : []).map(String));
  return cloneRows(rows).map((seat) => ({
    ...seat,
    isPrimary: primaryIds.has(String(seat?.seatId || "")),
  }));
}

function primaryAggregate(parameter, rows) {
  const primaryRows = rows.filter((seat) => seat?.isPrimary === true);
  if (!parameter || !primaryRows.length) return null;
  const worst = primaryRows.reduce((selected, seat) => {
    if (!selected) return seat;
    const seatLevel = Number(seat?.level);
    const selectedLevel = Number(selected?.level);
    if (seatLevel < selectedLevel) return seat;
    if (seatLevel > selectedLevel) return selected;
    return Number(seat?.variationDbRaw) > Number(selected?.variationDbRaw) ? seat : selected;
  }, null);
  return {
    ...parameter,
    level: Number(worst.level),
    value: Number(worst.variationDbRaw),
    seatId: worst.seatId,
  };
}

export function buildCanonicalBassResult(contract, graphPayload = null) {
  const candidate = contract?.selectedCandidate;
  const parameters = contract?.productAnalysis?.parameters;
  const primarySeatIds = contract?.provenance?.primarySeatIds;
  if (!candidate || !parameters || !Array.isArray(primarySeatIds) || !primarySeatIds.length) return null;

  const perSeatP19 = markPrimaryRows(candidate.perSeatP19Results, primarySeatIds);
  const perSeatP20 = markPrimaryRows(candidate.perSeatP20Results, primarySeatIds);
  const p19 = parameters.p19 ? { ...parameters.p19 } : null;
  const p20 = primaryAggregate(parameters.p20, perSeatP20);
  if (!p19 || !p20) return null;
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
      P19: bassLevelFromRank(p19.level),
      P20: bassLevelFromRank(p20.level),
      primaryFloor: lowestBassLevel([p19.level, p20.level]),
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
  const expected = buildCanonicalBassResult(contract);
  if (!expected) {
    return { valid: false, reason: "canonical-bass-result-primary-scope-missing" };
  }
  const sameAggregate = (actual, canonical) => (
    Number(actual?.level) === Number(canonical?.level)
    && Number(actual?.value) === Number(canonical?.value)
    && String(actual?.seatId || "") === String(canonical?.seatId || "")
  );
  if (!sameAggregate(result?.P19, expected.P19)
    || !sameAggregate(result?.P20, expected.P20)
    || result?.grading?.P19 !== expected.grading.P19
    || result?.grading?.P20 !== expected.grading.P20
    || result?.grading?.primaryFloor !== expected.grading.primaryFloor) {
    return { valid: false, reason: "canonical-bass-result-grading-mismatch" };
  }
  return { valid: true, reason: null };
}
