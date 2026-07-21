import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useAppState } from "@/components/AppStateProvider";
import { selectCandidateFromPool } from "@/components/utils/bassOperatingEnvelopeOptimiser";
import { useAuthoritativeBassResponse } from "./useAuthoritativeBassResponse";
import { createBassBackgroundAnalysisStore } from "./bassBackgroundAnalysisStore";
import { useBassAnalysisContract } from "./useBassAnalysisContract";
import { BassResultsProvider, createBassResultsScope } from "./bassResultsStore";
import {
  BASS_RESULT_SCHEMA_VERSION,
  HOUSE_CURVE_ENGINE_VERSION,
  buildBassResultCacheKey,
} from "./bassResultAuthority";
import { normalizeBassPriorityMode } from "@/components/utils/bassPriorityPolicies";

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

  const frontSubsLive = useMemo(() => (appState?.subwoofers || []).filter((sub) => sub?.group === "front"), [appState?.subwoofers]);
  const rearSubsLive = useMemo(() => (appState?.subwoofers || []).filter((sub) => sub?.group === "rear"), [appState?.subwoofers]);
  const authoritative = useAuthoritativeBassResponse({ appState, frontSubsLive, rearSubsLive });
  const {
    roomDims, seatingPositions, rspPosition, sources, rspRawCurve, perSeatRawCurves,
    designEqSystemLimits, optimisationTransitionHz, requested, fingerprintInputs,
    fingerprints, payload, inputsValid, includeDiagnostics,
  } = authoritative;

  const cacheKey = useMemo(() => buildBassResultCacheKey(fingerprints.calibration), [fingerprints.calibration]);
  useEffect(() => {
    controller.updateInputs({
      valid: inputsValid,
      fingerprint: cacheKey,
      legacyFingerprint: fingerprints.calibration,
      payload,
      collectDiagnostics: includeDiagnostics,
    });
  }, [controller, inputsValid, cacheKey, fingerprints.calibration, payload, includeDiagnostics]);
  useEffect(() => () => { controller.dispose(); scopeRef.current?.clear(); }, [controller]);

  const detailedStatus = LEGACY_STATUS[lifecycle.status] || "IDLE";
  const matchingResult = lifecycle.status === "ready" && lifecycle.resultFingerprint === cacheKey ? lifecycle.result : null;
  const optimisationResult = useMemo(() => {
    if (!matchingResult?.pool) return null;
    const selected = selectCandidateFromPool(matchingResult.pool, selectedPriorityMode);
    return {
      ...selected,
      engineVersion: HOUSE_CURVE_ENGINE_VERSION,
      resultSchemaVersion: BASS_RESULT_SCHEMA_VERSION,
      cacheKey,
      cacheSource: lifecycle.cacheRejectionReason ? "rejected-stale" : lifecycle.cacheStatus === "hit" ? "restored" : "fresh",
      cacheRejectionReason: lifecycle.cacheRejectionReason || null,
      calibrationFingerprint: fingerprints.calibration,
    };
  }, [matchingResult, selectedPriorityMode, cacheKey, lifecycle.cacheStatus, lifecycle.cacheRejectionReason, fingerprints.calibration]);
  const contract = useBassAnalysisContract({
    ...fingerprintInputs, subsForSimulation: sources, designEqSystemLimits, optimisationResult,
    detailedStatus, detailedProgress: lifecycle.progress, detailedElapsedMs: lifecycle.elapsedMs,
    rspRawCurve, perSeatRawCurves, optimiserPriorityMode: selectedPriorityMode, ...requested,
    fingerprintsOverride: fingerprints, backgroundLifecycle: lifecycle,
  });
  const onPriorityChange = useCallback((mode) => setSelectedPriorityMode(normalizeBassPriorityMode(mode)), []);
  const onRetry = useCallback((collectDiagnostics = false) => controller.requestManual({ fingerprint: cacheKey, payload, collectDiagnostics, force: true }), [controller, cacheKey, payload]);
  const value = scopeRef.current.replace({ scopeId, contract, lifecycle, selectedPriorityMode, optimisationResult, fingerprint: fingerprints.calibration, cacheKey, payload, inputsValid, detailedStatus, detailedError: lifecycle.errorMessage, onPriorityChange, onRetry, authoritative });
  return <BassResultsProvider value={value}>{children}</BassResultsProvider>;
}