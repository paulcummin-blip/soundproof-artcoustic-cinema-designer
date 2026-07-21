import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useAppState } from "@/components/AppStateProvider";
import { selectCandidateFromPool } from "@/components/utils/bassOperatingEnvelopeOptimiser";
import { useAuthoritativeBassResponse } from "./useAuthoritativeBassResponse";
import { createBassBackgroundAnalysisStore } from "./bassBackgroundAnalysisStore";
import { useBassAnalysisContract } from "./useBassAnalysisContract";
import { BassResultsProvider, createBassResultsScope } from "./bassResultsStore";

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

  useEffect(() => { controller.updateInputs({ valid: inputsValid, fingerprint: fingerprints.calibration, payload, collectDiagnostics: includeDiagnostics }); }, [controller, inputsValid, fingerprints.calibration, payload, includeDiagnostics]);
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
  const value = scopeRef.current.replace({ scopeId, contract, lifecycle, selectedPriorityMode, optimisationResult, fingerprint: fingerprints.calibration, payload, inputsValid, detailedStatus, detailedError: lifecycle.errorMessage, onPriorityChange, onRetry, authoritative });
  return <BassResultsProvider value={value}>{children}</BassResultsProvider>;
}