// finishedGraphAdapter.js — Stage 3: One finished graph adapter.
//
// Normalises live optimisationResult and cached compact contract graphPayload
// into a common synthetic optimisationResult shape that buildBassGraphSeries
// can consume identically in either case.
//
// Authority priority:
//   - While genuinely calculating: the live optimisationResult is used (LIVE).
//   - When a matching authoritative completed contract exists and no live
//     calculation is required: the saved graphPayload is used (CACHED).
//
// Signatures (postEqCurveSignature, filterBankSignature, targetCurveHash) are
// recomputed using the SAME canonical helpers (buildCurveSignature,
// buildFilterBankSignature) from the saved curves — there is no separate
// "cached hash" implementation. This satisfies the one-identity-method rule.
//
// This module does NOT:
//   - Change any physics, maths, EQ fitting, or calculation logic.
//   - Create a second store or second authority.
//   - Bypass the publication gate — the caller must verify the contract is
//     authoritative (isAuthoritativeBassContract) before calling this adapter.

import { buildCurveSignature, buildFilterBankSignature } from "./bassResultAuthority.js";

/**
 * Build a synthetic optimisationResult from a compact completed contract's
 * graphPayload, shaped exactly as buildBassGraphSeries expects.
 *
 * @param {object} compactContract - authoritative compact completed contract
 *   (must have graphPayload and be isAuthoritativeBassContract)
 * @returns {object|null} synthetic optimisationResult, or null if no graphPayload
 */
export function buildFinishedGraphOptimisationResult(compactContract) {
  if (!compactContract?.graphPayload) return null;
  const gp = compactContract.graphPayload;
  const candidateId = gp.selectedCandidateId || compactContract.selectedCandidateId || null;
  const postEqRspCurve = Array.isArray(gp.postEqRspCurve) ? gp.postEqRspCurve : [];
  const eqFilterBank = Array.isArray(gp.eqFilterBank) ? gp.eqFilterBank : [];
  const productionHouseCurveTarget = Array.isArray(gp.productionHouseCurveTarget)
    ? gp.productionHouseCurveTarget
    : [];

  // Recompute signatures using the SAME canonical helpers — no second hash method.
  const postEqCurveSignature = postEqRspCurve.length ? buildCurveSignature(postEqRspCurve) : null;
  const filterBankSignature = eqFilterBank.length ? buildFilterBankSignature({ generatedFilterBank: eqFilterBank }) : null;

  // Reconstruct finalSeatVariationData from the persisted assessment envelope
  // (v9) so buildRp22GraphMarkers produces identical markers after cold reopen.
  const envelope = compactContract.assessmentEnvelope || null;
  const perSeatP20Results = Array.isArray(compactContract.selectedCandidate?.perSeatP20Results)
    ? compactContract.selectedCandidate.perSeatP20Results.map((seat) => ({ ...seat }))
    : [];
  const finalSeatVariationData = candidateId ? {
    p18: { candidateId, level: null, extensionHz: envelope?.achievedP18FrequencyHz ?? null, authority: null },
    p19: { candidateId, level: null, variationDb: null, worstFrequencyHz: envelope?.officialP19WorstFrequencyHz ?? null },
    p20: { candidateId, level: null, variationDb: null, worstSeatId: envelope?.p20WorstSeatId ?? null, perSeatResults: perSeatP20Results },
  } : null;

  const finalOptimisedBassResponse = {
    selectedCandidateId: candidateId,
    postEqRspCurve,
    postEqPerSeatCurves: Array.isArray(gp.postEqPerSeatCurves) ? gp.postEqPerSeatCurves : [],
    maximumSplCurveAfterEq: Array.isArray(gp.maximumSplCurveAfterEq) ? gp.maximumSplCurveAfterEq : [],
    maximumSplSafetyMarginDb: Number.isFinite(gp.maximumSplSafetyMarginDb) ? gp.maximumSplSafetyMarginDb : 0,
    eqFilterBank,
    filterBankSignature,
    postEqCurveSignature,
    operatingLevelOffsetDb: Number.isFinite(gp.operatingLevelOffsetDb) ? gp.operatingLevelOffsetDb : 0,
    canonicalVerticalOffsetDb: null,
    canonicalHouseCurveShape: null,
    canonicalTargetCurve: productionHouseCurveTarget,
    physicalRawResponseCurve: null, // live rspRawCurve is the same curve
    selectedSubwooferLayout: [],
    finalSeatVariationData,
    assessmentStartHz: envelope?.assessmentStartHz ?? null,
    assessmentEndHz: envelope?.assessmentEndHz ?? null,
    // Graph-source identity fields consumed by buildGraphSourceIdentity
    // are recomputed above (postEqCurveSignature, filterBankSignature).
  };

  const sourceCapabilityCurves = Array.isArray(gp.sourceCapabilityCurves) ? gp.sourceCapabilityCurves : [];
  const sourceDiagnostics = sourceCapabilityCurves.map((curve) => ({ capabilityCurve: curve }));

  const selectedCandidate = {
    candidateId,
    productionHouseCurveTarget,
    correctionStartHz: Number.isFinite(gp.correctionStartHz) ? gp.correctionStartHz : null,
    correctionEndHz: Number.isFinite(gp.correctionEndHz) ? gp.correctionEndHz : null,
    designEqFitProfile: gp.designEqFitProfile || null,
    // Reconstruct pairedP14P18Authority.sources.sourceDiagnostics so
    // buildProductMaximumSplSeries can power-sum the saved capability curves.
    pairedP14P18Authority: sourceDiagnostics.length
      ? { sources: { sourceDiagnostics } }
      : null,
  };

  return {
    finalOptimisedBassResponse,
    selectedCandidate,
    selectedP14TargetDb: Number.isFinite(compactContract.requestedP14TargetDb)
      ? compactContract.requestedP14TargetDb
      : null,
    completedContractFingerprint: compactContract.job?.resultFingerprint || null,
    calibrationFingerprint: compactContract.fingerprints?.calibration || null,
    // canonicalMetricDiagnostics is not available from the cached contract.
    // The graph parity check (graphMetricParity in BassResponse) will not run
    // for cached graphs — the publication receipt was already validated at
    // publication time and is stored in compactContract.metricPublication.
    canonicalMetricDiagnostics: null,
  };
}

/**
 * Check whether a compact contract carries a usable graphPayload.
 */
export function hasGraphPayload(compactContract) {
  return !!compactContract?.graphPayload?.postEqRspCurve?.length;
}