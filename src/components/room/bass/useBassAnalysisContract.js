// useBassAnalysisContract.js — Phase 1C/2A: Memoized live contract instantiation.
//
// Encapsulates the fingerprint computation and contract adaptation logic
// extracted from BassResponse.jsx to keep that file under 2000 lines.
// Pure, no side effects. Does NOT start a calculation, restart a worker,
// rerank candidates, change the selected candidate, change graph series,
// or change visible parameter values.
//
// Phase 2A: Calibration fingerprint now uses live values from the selected
// candidate when available (assessment frequencies, target anchor, fit
// profile, requested output). Falls back to current requested configuration.
// The house-curve fingerprint hashes the actual curve points.
//
// Mode changes and display changes do not affect any fingerprint.

import { useMemo } from "react";
import {
  computeGeometryFingerprint,
  computeProductFingerprint,
  computeCalibrationFingerprint,
  computeHouseCurveFingerprint,
} from "@/components/room/bass/bassAnalysisFingerprints";
import { adaptCurrentBassOptimisationResult } from "@/components/room/bass/bassAnalysisAdapter";
import { ARTCOUSTIC_HOUSE_CURVE } from "@/components/utils/artcousticHouseCurve";
import { getDesignEqFitProfile } from "@/components/utils/designEqCalibration";

// Stable house-curve fingerprint — the Artcoustic curve points are a constant,
// so this is memoized once per module load.
const HOUSE_CURVE_FINGERPRINT = computeHouseCurveFingerprint(ARTCOUSTIC_HOUSE_CURVE);

export function useBassAnalysisContract({
  roomDims, rspPosition, seatingPositions, subsForSimulation,
  surfaceAbsorption, roomDamping, axialQ, modalSourceReferenceMode,
  modalGainScalar, modalDistanceBlend, modalStorageMode, propagationPhaseScale,
  enableRewCoreReflections, rewSourceCurveMode, qStrategy, rewModalBandwidthScale,
  disableReflectionPhaseJitter, disableReflectionCoherenceWeight, disableLateField,
  disableModalPropagationPhase, mute68HzAxialMode, debugDisableModalContribution,
  rewParityFieldMode, overrideConstantAxialQ, overrideAbsorptionAxialQ,
  debugMode200Multiplier, debugModalPhaseConvention, reflectionGainScale,
  debugModalHSign, rewParityModalMagnitudeScale, modalCoherenceMode, highOrderAxialScale,
  splConfig, optimisationTransitionHz, designEqSystemLimits,
  optimisationResult, detailedStatus, detailedProgress, detailedElapsedMs,
  rspRawCurve, perSeatRawCurves, optimiserPriorityMode,
  // Phase 2A: Requested configuration fallback — used when no selected
  // candidate exists. Caller must pass the current requested values; the hook
  // does not invent defaults.
  requestedAssessmentStartHz, requestedAssessmentEndHz,
  requestedTargetAnchorDb, requestedFitProfile,
  requestedOutputDb, requestedUsableLfHz,
}) {
  // --- Phase 2A: Live calibration values from the selected candidate ---
  // Prefer values from the selected candidate when one exists. Otherwise use
  // the current requested configuration passed by the caller. Never hardcode
  // 20–200 Hz, -12 dB, 105 dB, zero target anchor, or a curve-version label
  // that does not fully identify the live curve.
  const selectedCandidate = optimisationResult?.selectedCandidate || null;

  const liveAssessmentStartHz = Number.isFinite(selectedCandidate?.assessmentStartHz)
    ? selectedCandidate.assessmentStartHz
    : (Number.isFinite(requestedAssessmentStartHz) ? requestedAssessmentStartHz : null);
  const liveAssessmentEndHz = Number.isFinite(selectedCandidate?.assessmentEndHz)
    ? selectedCandidate.assessmentEndHz
    : (Number.isFinite(requestedAssessmentEndHz) ? requestedAssessmentEndHz : null);
  const liveTargetAnchorDb = Number.isFinite(selectedCandidate?.requestedTargetSpl)
    ? selectedCandidate.requestedTargetSpl
    : (Number.isFinite(requestedTargetAnchorDb) ? requestedTargetAnchorDb : null);
  const liveFitProfile = selectedCandidate?.designEqFitProfile || requestedFitProfile || null;
  const liveRequestedOutputDb = Number.isFinite(selectedCandidate?.requestedTargetSpl)
    ? selectedCandidate.requestedTargetSpl
    : (Number.isFinite(requestedOutputDb) ? requestedOutputDb
      : (Number.isFinite(splConfig?.targetSpl) ? splConfig.targetSpl : null));
  const liveUsableLfHz = Number.isFinite(designEqSystemLimits?.usableLfHz)
    ? designEqSystemLimits.usableLfHz
    : (Number.isFinite(requestedUsableLfHz) ? requestedUsableLfHz : null);

  // Resolve EQ constraints from the active fit profile config. Only aggregate
  // boost/cut limits exist as named constraints in DESIGN_EQ_FIT_PROFILES.
  // There is no independent per-filter limit — per-filter clamping is derived
  // dynamically from the aggregate limit and source-domain headroom. Do not
  // invent per-filter constants; store null so the fingerprint truthfully
  // reflects that no independent per-filter constraint exists.
  const profileConfig = liveFitProfile ? getDesignEqFitProfile(liveFitProfile) : null;
  const liveEqConstraints = {
    maxBoostDb: profileConfig?.maximumAggregateBoostDb ?? null,
    maxCutDb: profileConfig?.maximumCutDb ?? null,
    maxPerFilterBoostDb: null,
    maxPerFilterCutDb: null,
  };

  // Build fingerprint inputs from current physical state (excludes priority
  // mode, graph smoothing/scale, and diagnostics visibility).
  const contractFingerprintInputs = useMemo(() => ({
    roomDims, rspPosition, seatingPositions, sources: subsForSimulation,
    surfaceAbsorption, roomDamping, axialQ, modalSourceReferenceMode,
    modalGainScalar, modalDistanceBlend, modalStorageMode, propagationPhaseScale,
    enableRewCoreReflections, rewSourceCurveMode, qStrategy, rewModalBandwidthScale,
    disableReflectionPhaseJitter, disableReflectionCoherenceWeight, disableLateField,
    disableModalPropagationPhase, mute68HzAxialMode, debugDisableModalContribution,
    rewParityFieldMode, overrideConstantAxialQ, overrideAbsorptionAxialQ,
    debugMode200Multiplier, debugModalPhaseConvention, reflectionGainScale,
    debugModalHSign, rewParityModalMagnitudeScale, modalCoherenceMode, highOrderAxialScale,
    splConfig,
    requestedOutputDb: liveRequestedOutputDb,
    houseCurveFingerprint: HOUSE_CURVE_FINGERPRINT,
    eqConstraints: liveEqConstraints,
    assessmentStartHz: liveAssessmentStartHz,
    assessmentEndHz: liveAssessmentEndHz,
    optimisationTransitionHz,
    targetAnchorDb: liveTargetAnchorDb,
    activeFitProfile: liveFitProfile,
    usableLfHz: liveUsableLfHz,
  }), [roomDims, rspPosition, seatingPositions, subsForSimulation, surfaceAbsorption,
    roomDamping, axialQ, modalSourceReferenceMode, modalGainScalar, modalDistanceBlend,
    modalStorageMode, propagationPhaseScale, enableRewCoreReflections, rewSourceCurveMode,
    qStrategy, rewModalBandwidthScale, disableReflectionPhaseJitter,
    disableReflectionCoherenceWeight, disableLateField, disableModalPropagationPhase,
    mute68HzAxialMode, debugDisableModalContribution, rewParityFieldMode,
    overrideConstantAxialQ, overrideAbsorptionAxialQ, debugMode200Multiplier,
    debugModalPhaseConvention, reflectionGainScale, debugModalHSign,
    rewParityModalMagnitudeScale, modalCoherenceMode, highOrderAxialScale,
    splConfig, optimisationTransitionHz, designEqSystemLimits?.usableLfHz,
    liveAssessmentStartHz, liveAssessmentEndHz, liveTargetAnchorDb, liveFitProfile,
    liveRequestedOutputDb, liveUsableLfHz,
    requestedAssessmentStartHz, requestedAssessmentEndHz, requestedTargetAnchorDb,
    requestedFitProfile, requestedOutputDb, requestedUsableLfHz]);

  const contractGeometryFp = useMemo(() => computeGeometryFingerprint(contractFingerprintInputs), [contractFingerprintInputs]);
  const contractProductFp = useMemo(() => computeProductFingerprint(contractFingerprintInputs), [contractFingerprintInputs]);
  const contractCalibrationFp = useMemo(() => computeCalibrationFingerprint(contractFingerprintInputs), [contractFingerprintInputs]);

  // Response domain: 'product' source mode uses the product's curve (product-aware);
  // flat/reference source modes replace the product curve (product-independent).
  const contractResponseDomain = useMemo(() => {
    if (!rspRawCurve || rspRawCurve.length === 0) return "unavailable";
    return rewSourceCurveMode === "product" ? "legacy_product_aware" : "normalized_room_transfer";
  }, [rspRawCurve, rewSourceCurveMode]);

  // Adapt the current live result into the contract. Pure, no recalculation.
  const bassAnalysisContract = useMemo(() => adaptCurrentBassOptimisationResult({
    optimisationResult, detailedStatus, detailedProgress, detailedElapsedMs,
    rspRawCurve, perSeatRawCurves,
    activeSubs: designEqSystemLimits?.activeSubs,
    usableLfHz: designEqSystemLimits?.usableLfHz,
    sourceLayout: subsForSimulation,
    canonicalPriorityMode: optimiserPriorityMode,
    fingerprints: {
      geometry: contractGeometryFp, product: contractProductFp, calibration: contractCalibrationFp,
    },
    responseDomain: contractResponseDomain,
  }), [optimisationResult, detailedStatus, detailedProgress, detailedElapsedMs,
    rspRawCurve, perSeatRawCurves, designEqSystemLimits, subsForSimulation,
    optimiserPriorityMode, contractGeometryFp, contractProductFp, contractCalibrationFp,
    contractResponseDomain]);

  return bassAnalysisContract;
}