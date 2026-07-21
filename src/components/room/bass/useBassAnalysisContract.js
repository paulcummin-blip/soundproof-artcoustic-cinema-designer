// useBassAnalysisContract.js — Phase 1C: Memoized live contract instantiation.
//
// Encapsulates the fingerprint computation and contract adaptation logic
// extracted from BassResponse.jsx to keep that file under 2000 lines.
// Pure, no side effects. Does NOT start a calculation, restart a worker,
// rerank candidates, change the selected candidate, change graph series,
// or change visible parameter values.
//
// Mode changes and display changes do not affect any fingerprint.

import { useMemo } from "react";
import {
  computeGeometryFingerprint,
  computeProductFingerprint,
  computeCalibrationFingerprint,
} from "@/components/room/bass/bassAnalysisFingerprints";
import { adaptCurrentBassOptimisationResult } from "@/components/room/bass/bassAnalysisAdapter";

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
}) {
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
    requestedOutputDb: splConfig?.targetSpl || 105,
    houseCurveVersion: "artcoustic-v1",
    eqConstraints: { maxBoostDb: 6, maxCutDb: 12, maxPerFilterBoostDb: 3, maxPerFilterCutDb: 6 },
    assessmentStartHz: 20, assessmentEndHz: 200,
    optimisationTransitionHz, targetAnchorDb: 0,
    usableLfHz: designEqSystemLimits?.usableLfHz,
  }), [roomDims, rspPosition, seatingPositions, subsForSimulation, surfaceAbsorption,
    roomDamping, axialQ, modalSourceReferenceMode, modalGainScalar, modalDistanceBlend,
    modalStorageMode, propagationPhaseScale, enableRewCoreReflections, rewSourceCurveMode,
    qStrategy, rewModalBandwidthScale, disableReflectionPhaseJitter,
    disableReflectionCoherenceWeight, disableLateField, disableModalPropagationPhase,
    mute68HzAxialMode, debugDisableModalContribution, rewParityFieldMode,
    overrideConstantAxialQ, overrideAbsorptionAxialQ, debugMode200Multiplier,
    debugModalPhaseConvention, reflectionGainScale, debugModalHSign,
    rewParityModalMagnitudeScale, modalCoherenceMode, highOrderAxialScale,
    splConfig, optimisationTransitionHz, designEqSystemLimits?.usableLfHz]);

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