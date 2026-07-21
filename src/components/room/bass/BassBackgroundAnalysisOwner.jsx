import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useAppState } from "@/components/AppStateProvider";
import { MODELS, normaliseModelKey } from "@/components/models/speakers/registry";
import { selectCandidateFromPool } from "@/components/utils/bassOperatingEnvelopeOptimiser";
import { ARTCOUSTIC_HOUSE_CURVE } from "@/components/utils/artcousticHouseCurve";
import { computeCalibrationFingerprint, computeGeometryFingerprint, computeHouseCurveFingerprint, computeProductFingerprint } from "./bassAnalysisFingerprints";
import { createBassBackgroundAnalysisStore } from "./bassBackgroundAnalysisStore";
import { useBassAnalysisContract } from "./useBassAnalysisContract";
import { deriveRequestedCalibrationConfig } from "./requestedCalibrationConfig";
import { BASS_NORMALIZED_PHYSICS_DEFAULTS as DEFAULTS } from "./bassPhysicsDefaults";
import { BassResultsProvider, createBassResultsScope } from "./bassResultsStore";
import { buildPersistentBassSources, buildPersistentResponseCurves, simulatePersistentProductBass } from "./persistentBassAnalysisInputs";

const LEGACY_STATUS = { idle: "IDLE", queued: "QUEUED", calculating: "CALCULATING", ready: "COMPLETE", stale: "OUT_OF_DATE", error: "ERROR" };

export default function BassBackgroundAnalysisOwner({ children, scopeId = "free" }) {
  const appState = useAppState();
  const controllerRef = useRef(null);
  const scopeRef = useRef(null);
  if (!controllerRef.current) controllerRef.current = createBassBackgroundAnalysisStore();
  if (!scopeRef.current) scopeRef.current = createBassResultsScope(scopeId);
  const controller = controllerRef.current;
  const lifecycle = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [selectedPriorityMode, setSelectedPriorityMode] = useState("balanced");

  const roomDims = appState?.roomDims;
  const seatingPositions = appState?.seatingPositions || [];
  const rspPosition = useMemo(() => {
    const widthM = Number(roomDims?.widthM);
    const y = Number(appState?.mlpY_m);
    return widthM > 0 && y > 0 ? { id: "rsp", x: widthM / 2, y, z: 1.2, __isSyntheticRsp: true } : null;
  }, [roomDims?.widthM, appState?.mlpY_m]);
  const sources = useMemo(() => buildPersistentBassSources({
    roomDims, rspPosition, subwoofers: appState?.subwoofers,
    frontSubsCfg: appState?.frontSubsCfg, rearSubsCfg: appState?.rearSubsCfg,
  }), [roomDims, rspPosition, appState?.subwoofers, appState?.frontSubsCfg, appState?.rearSubsCfg]);
  const simulation = useMemo(() => simulatePersistentProductBass({ roomDims, seatingPositions, rspPosition, sources }), [roomDims, seatingPositions, rspPosition, sources]);
  const { rspRawCurve, perSeatRawCurves } = useMemo(() => buildPersistentResponseCurves(simulation.seatResponses), [simulation.seatResponses]);
  const designEqSystemLimits = useMemo(() => {
    const usable = sources.map((sub) => MODELS.find((model) => model.key === normaliseModelKey(sub.modelKey))?.approvedUsableLfHzMinus6dB).filter(Number.isFinite);
    return { activeSubs: sources, usableLfHz: usable.length ? Math.max(...usable) : null };
  }, [sources]);
  const optimisationTransitionHz = useMemo(() => {
    const volume = Number(roomDims?.widthM) * Number(roomDims?.lengthM) * Number(roomDims?.heightM);
    return volume > 0 ? 2000 * Math.sqrt(0.4 / volume) : 120;
  }, [roomDims?.widthM, roomDims?.lengthM, roomDims?.heightM]);
  const requested = useMemo(() => deriveRequestedCalibrationConfig({ splConfig: appState?.splConfig, optimisationTransitionHz, designEqSystemLimits }), [appState?.splConfig, optimisationTransitionHz, designEqSystemLimits]);
  const productCapabilities = useMemo(() => sources.map((sub) => {
    const model = MODELS.find((item) => item.key === normaliseModelKey(sub.modelKey));
    return model ? { modelKey: model.key, response: model.frequency_response_curve, usableLfHz: model.approvedUsableLfHzMinus6dB, continuousSplDb: model.approvedContinuousSplAt1mDb, continuousSpl30HzDb: model.approvedContinuousSplAt30HzDb, peakSplDb: model.approvedPeakSplDb } : { modelKey: sub.modelKey };
  }), [sources]);
  const fingerprintInputs = useMemo(() => ({
    roomDims, sources, rspPosition, seatingPositions, surfaceAbsorption: DEFAULTS.surfaceAbsorption,
    roomDamping: DEFAULTS.roomDamping, axialQ: DEFAULTS.axialQ, modalSourceReferenceMode: DEFAULTS.modalSourceReferenceMode,
    modalGainScalar: DEFAULTS.modalGainScalar, modalDistanceBlend: DEFAULTS.modalDistanceBlend, modalStorageMode: DEFAULTS.modalStorageMode,
    propagationPhaseScale: DEFAULTS.propagationPhaseScale, enableRewCoreReflections: DEFAULTS.enableRewCoreReflections,
    rewSourceCurveMode: "product", qStrategy: DEFAULTS.qStrategy, rewModalBandwidthScale: DEFAULTS.rewModalBandwidthScale,
    disableReflectionPhaseJitter: DEFAULTS.disableReflectionPhaseJitter, disableReflectionCoherenceWeight: DEFAULTS.disableReflectionCoherenceWeight,
    disableLateField: true, disableModalPropagationPhase: true, mute68HzAxialMode: DEFAULTS.mute68HzAxialMode,
    debugDisableModalContribution: DEFAULTS.debugDisableModalContribution, rewParityFieldMode: DEFAULTS.rewParityFieldMode,
    overrideConstantAxialQ: DEFAULTS.overrideConstantAxialQ, overrideAbsorptionAxialQ: DEFAULTS.overrideAbsorptionAxialQ,
    debugMode200Multiplier: DEFAULTS.debugMode200Multiplier, debugModalPhaseConvention: "normal", reflectionGainScale: DEFAULTS.reflectionGainScale,
    debugModalHSign: "normal", rewParityModalMagnitudeScale: 1, modalCoherenceMode: DEFAULTS.modalCoherenceMode,
    highOrderAxialScale: DEFAULTS.highOrderAxialScale, splConfig: appState?.splConfig, optimisationTransitionHz,
    requestedOutputDb: requested.requestedOutputDb, houseCurveFingerprint: computeHouseCurveFingerprint(ARTCOUSTIC_HOUSE_CURVE),
    assessmentStartHz: requested.requestedAssessmentStartHz, assessmentEndHz: requested.requestedAssessmentEndHz,
    targetAnchorDb: requested.requestedTargetAnchorDb, activeFitProfile: requested.requestedFitProfile,
    usableLfHz: requested.requestedUsableLfHz, evaluatedProfiles: requested.evaluatedProfiles, productDataVersion: 1, productCapabilities,
  }), [roomDims, sources, rspPosition, seatingPositions, appState?.splConfig, optimisationTransitionHz, requested, productCapabilities]);
  const fingerprints = useMemo(() => ({ geometry: computeGeometryFingerprint(fingerprintInputs), product: computeProductFingerprint(fingerprintInputs), calibration: computeCalibrationFingerprint(fingerprintInputs) }), [fingerprintInputs]);
  const payload = useMemo(() => ({ rawCurve: rspRawCurve, activeSubs: sources, usableLfHz: designEqSystemLimits.usableLfHz, transitionHz: optimisationTransitionHz, perSeatRawCurves }), [rspRawCurve, sources, designEqSystemLimits.usableLfHz, optimisationTransitionHz, perSeatRawCurves]);
  const inputsValid = !!rspPosition && seatingPositions.length > 0 && rspRawCurve.length > 0 && sources.length > 0 && [roomDims?.widthM, roomDims?.lengthM, roomDims?.heightM].every((value) => Number(value) > 0);

  useEffect(() => { controller.updateInputs({ valid: inputsValid, fingerprint: fingerprints.calibration, payload, collectDiagnostics: false }); }, [controller, inputsValid, fingerprints.calibration, payload]);
  useEffect(() => () => { controller.dispose(); scopeRef.current?.clear(); }, [controller]);

  const detailedStatus = LEGACY_STATUS[lifecycle.status] || "IDLE";
  const matchingResult = lifecycle.status === "ready" && lifecycle.resultFingerprint === fingerprints.calibration ? lifecycle.result : null;
  const optimisationResult = useMemo(() => matchingResult?.pool ? selectCandidateFromPool(matchingResult.pool, selectedPriorityMode) : null, [matchingResult, selectedPriorityMode]);
  const contract = useBassAnalysisContract({
    ...fingerprintInputs, subsForSimulation: sources, designEqSystemLimits, optimisationResult,
    detailedStatus, detailedProgress: lifecycle.progress, detailedElapsedMs: lifecycle.elapsedMs,
    rspRawCurve, perSeatRawCurves, optimiserPriorityMode: selectedPriorityMode, ...requested,
    fingerprintsOverride: fingerprints, backgroundLifecycle: lifecycle,
  });
  const onPriorityChange = useCallback((mode) => setSelectedPriorityMode(mode), []);
  const onRetry = useCallback((collectDiagnostics = false) => controller.requestManual({ fingerprint: fingerprints.calibration, payload, collectDiagnostics, force: true }), [controller, fingerprints.calibration, payload]);
  const value = scopeRef.current.replace({ scopeId, contract, lifecycle, selectedPriorityMode, optimisationResult, fingerprint: fingerprints.calibration, payload, inputsValid, detailedStatus, detailedError: lifecycle.errorMessage, onPriorityChange, onRetry });
  return <BassResultsProvider value={value}>{children}</BassResultsProvider>;
}