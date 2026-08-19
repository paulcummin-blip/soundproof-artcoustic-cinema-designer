// p14TargetContractBuilder.js — Pure function to build a compact contract
// from a background target optimiser result.
//
// Reuses the SAME pure functions as the foreground path (BassBackgroundAnalysisOwner)
// to produce the same authoritative contract structure. Does NOT change any
// physics, maths, EQ, or calculation logic.

import { selectCandidateFromPool } from "@/components/utils/bassOperatingEnvelopeOptimiser";
import { buildFinalOptimisedBassResponse } from "./finalOptimisedBassResponse";
import { evaluateCanonicalBassAuthority } from "@/components/utils/canonicalBassAuthorityEvaluation";
import { buildCanonicalCompletedBassMetricAuthority } from "./canonicalCompletedBassMetricAuthority";
import { buildMetricPublicationReceipt } from "./metricPublicationReceipt";
import { adaptCurrentBassOptimisationResult } from "./bassAnalysisAdapter";
import { compactCompletedBassContract } from "./completedBassResultPersistence";
import { BASS_OPTIMISER_VERSIONS } from "./bassOptimiserWorkerProtocol";

/**
 * Build a compact authoritative contract from a background target worker result.
 *
 * This chains the same pure functions used by BassBackgroundAnalysisOwner:
 *   selectCandidateFromPool -> buildFinalOptimisedBassResponse ->
 *   evaluateCanonicalBassAuthority -> buildCanonicalCompletedBassMetricAuthority ->
 *   buildMetricPublicationReceipt -> adaptCurrentBassOptimisationResult ->
 *   compactCompletedBassContract
 *
 * @returns {object|null} compact contract, or null if the result is invalid
 */
export function buildCompactContractFromWorkerResult({
  workerResult,
  sources,
  usableLfHz,
  rspRawCurve,
  perSeatRawCurves,
  fingerprints,
  target,
}) {
  const pool = workerResult.pool;
  const fingerprint = workerResult.fingerprint;
  const calibrationFingerprint = workerResult.calibrationFingerprint || fingerprints?.calibration || null;

  // Use target-specific fingerprints: geometry and product are design-wide
  // (shared across all P14 targets), but calibration is target-specific.
  // Passing the foreground calibration fingerprint here would contaminate
  // cached contracts with the wrong calibration identity.
  const targetFingerprints = {
    geometry: fingerprints?.geometry ?? null,
    product: fingerprints?.product ?? null,
    calibration: calibrationFingerprint,
  };

  // Step 1: Select candidate from pool (same as foreground)
  const selected = selectCandidateFromPool(pool);
  if (!selected) return null;

  // Step 2: Build base result (same as foreground)
  const baseResult = {
    ...selected,
    ...BASS_OPTIMISER_VERSIONS,
    cacheKey: fingerprint,
    calibrationFingerprint,
    heavyPoolReused: false,
  };

  // Step 3: Build canonical result (same as foreground)
  const canonicalResult = buildFinalOptimisedBassResponse({
    optimisationResult: baseResult,
    selectedLayout: sources,
  });

  // Step 4: Evaluate canonical authority (same as foreground)
  const authority = evaluateCanonicalBassAuthority({
    canonicalResult,
    activeSubs: sources,
    usableLfHz,
    p14TargetBasis: target.basis,
    p18TargetBasis: target.p18TargetBasis,
    requestedLevel: target.level,
  });

  const selectedCandidate = authority
    ? { ...selected.selectedCandidate, ...authority }
    : selected.selectedCandidate;

  const result = {
    ...baseResult,
    ...authority,
    selectedCandidate,
    selectedByMode: { ...baseResult.selectedByMode, balanced: selectedCandidate },
    primaryLimitation: authority?.limitation || null,
  };

  // Step 5: Build final optimised response with authority (same as foreground)
  const finalOptimisedBassResponse = buildFinalOptimisedBassResponse({
    optimisationResult: result,
    selectedLayout: sources,
  });

  // Step 6: Build canonical metric authority (same as foreground)
  const canonicalMetricAuthorityResult = buildCanonicalCompletedBassMetricAuthority({
    finalOptimisedBassResponse,
    activeRequestFingerprint: fingerprint,
    returnedWorkerFingerprint: fingerprint,
    completedContractFingerprint: fingerprint,
    persistedCompletedFingerprint: null,
    calibrationFingerprint,
    candidateId: result?.selectedCandidate?.candidateId || null,
    candidateResultIdentity: {
      candidateId: result?.selectedCandidate?.candidateId || null,
      completedResultFingerprint: fingerprint,
    },
    graphMetricParityValid: null,
    completedResultP14Identity: {
      selectedP14TargetDb: target.db,
      p14TargetBasis: target.basis,
      selectedP14Level: target.level,
      selectedP14RequiredExtensionHz: target.p14RequiredExtensionHz,
      p18TargetBasis: target.p18TargetBasis,
    },
    requestedP14Identity: {
      selectedP14TargetDb: target.db,
      p14TargetBasis: target.basis,
      p14TargetLevel: target.level,
      selectedP14RequiredExtensionHz: target.p14RequiredExtensionHz,
      p18TargetBasis: target.p18TargetBasis,
      selectedP18RequiredExtensionHz: target.p18RequiredExtensionHz,
    },
  });

  const optimisationResult = {
    ...result,
    finalOptimisedBassResponse,
    completedContractFingerprint: fingerprint,
    canonicalMetricAuthority: canonicalMetricAuthorityResult.authority,
    canonicalMetricDiagnostics: canonicalMetricAuthorityResult.diagnostics,
  };

  // Step 7: Build metric publication receipt (same as foreground)
  const metricPublication = buildMetricPublicationReceipt(optimisationResult);

  // Step 8: Build contract via adapter (same as foreground)
  const contract = adaptCurrentBassOptimisationResult({
    optimisationResult,
    detailedStatus: "COMPLETE",
    detailedProgress: null,
    detailedElapsedMs: null,
    rspRawCurve,
    perSeatRawCurves,
    activeSubs: sources,
    usableLfHz,
    sourceLayout: sources,
    canonicalPriorityMode: "canonical-physics-eq",
    fingerprints: targetFingerprints,
    responseDomain: "normalized_room_transfer",
    backgroundLifecycle: { status: "ready", resultFingerprint: fingerprint },
    p14TargetBasis: target.basis,
    p18TargetBasis: target.p18TargetBasis,
    selectedP14Level: target.level,
    selectedP14TargetDb: target.db,
    selectedP14RequiredExtensionHz: target.p14RequiredExtensionHz,
    selectedP18RequiredExtensionHz: target.p18RequiredExtensionHz,
    collectDiagnostics: false,
    metricPublication,
  });

  // Step 9: Compact contract (same as foreground)
  return compactCompletedBassContract(contract);
}