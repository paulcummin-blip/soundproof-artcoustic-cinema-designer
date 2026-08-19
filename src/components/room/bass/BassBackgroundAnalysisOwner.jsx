import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useAppState } from "@/components/AppStateProvider";
import { selectCandidateFromPool } from "@/components/utils/bassOperatingEnvelopeOptimiser";
import { useAuthoritativeBassResponse } from "./useAuthoritativeBassResponse";
import { createBassBackgroundAnalysisStore } from "./bassBackgroundAnalysisStore";
import { useBassAnalysisContract } from "./useBassAnalysisContract";
import { BassResultsProvider, createBassResultsScope } from "./bassResultsStore";
import { buildBassResultCacheKey } from "./bassResultAuthority";
import { BASS_OPTIMISER_VERSIONS, bassOptimiserVersionSignature } from "./bassOptimiserWorkerProtocol";
import { markBassAuthorityBlocked, markBassAuthorityFailed, markBassAuthorityUpdating, publishCompletedBassContract, syncPersistentBassAuthority, getCompletedBassAuthority, hasAuthoritativeResult } from "./completedBassResultStore";
import { createDiagToken, recordDiagStage } from "./bassDiagTokenTrace";

const OPTIMISER_VERSION_SIGNATURE = bassOptimiserVersionSignature();
import { useNormalizedPhysicsOptions } from "./useNormalizedPhysicsOptions";
import { useNormalizedRoomTransferLive } from "./useNormalizedRoomTransferLive";
import { buildFinalOptimisedBassResponse } from "./finalOptimisedBassResponse";
import { evaluateCanonicalBassAuthority } from "@/components/utils/canonicalBassAuthorityEvaluation";
import { buildCanonicalCompletedBassMetricAuthority } from "./canonicalCompletedBassMetricAuthority";
import { buildMetricPublicationReceipt } from "./metricPublicationReceipt";


const LEGACY_STATUS = { idle: "IDLE", queued: "QUEUED", calculating: "CALCULATING", ready: "COMPLETE", stale: "OUT_OF_DATE", error: "ERROR" };

export default function BassBackgroundAnalysisOwner({ children, scopeId = "free" }) {
  const appState = useAppState();
  const controllerRef = useRef(null);
  const scopeRef = useRef(null);

  // Event-driven drag state: listen for drag-start/drag-end events so the
  // heavy EQ worker only runs on pointer-up, not continuously during drag.
  // No polling — purely event-driven.
  const [isDragging, setIsDragging] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStart = () => setIsDragging(true);
    const onEnd = () => setIsDragging(false);
    window.addEventListener("b44-bass-drag-start", onStart);
    window.addEventListener("b44-bass-drag-end", onEnd);
    return () => {
      window.removeEventListener("b44-bass-drag-start", onStart);
      window.removeEventListener("b44-bass-drag-end", onEnd);
    };
  }, []);
  const retainedController = controllerRef.current;
  if (!retainedController
    || typeof retainedController.ensureProtocolCompatibility !== "function"
    || retainedController.protocolSignature !== OPTIMISER_VERSION_SIGNATURE) {
    retainedController?.dispose?.();
    controllerRef.current = createBassBackgroundAnalysisStore();
  }
  if (!scopeRef.current) scopeRef.current = createBassResultsScope(scopeId);
  const controller = controllerRef.current;
  const lifecycle = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const selectedPriorityMode = "balanced";

  const frontSubsLive = useMemo(() => (appState?.subwoofers || []).filter((sub) => sub?.group === "front"), [appState?.subwoofers]);
  const rearSubsLive = useMemo(() => (appState?.subwoofers || []).filter((sub) => sub?.group === "rear"), [appState?.subwoofers]);
  const authoritative = useAuthoritativeBassResponse({ appState, frontSubsLive, rearSubsLive });
  const {
    roomDims, seatingPositions, rspPosition, sources, rspRawCurve, perSeatRawCurves,
    designEqSystemLimits, optimisationTransitionHz, requested, fingerprintInputs,
    fingerprints, payload: basePayload, inputsValid: baseInputsValid, includeDiagnostics,
  } = authoritative;
  const calibrationFingerprint = fingerprints?.calibration ?? null;
  const normalizedPhysicsOptions = useNormalizedPhysicsOptions(authoritative);
  const normalizedLive = useNormalizedRoomTransferLive({
    roomDims,
    rspPosition,
    seatingPositions,
    subsForSimulation: sources,
    physicsOptions: normalizedPhysicsOptions,
  });
  const normalizedTransferReady = normalizedLive.status === "ready" && normalizedLive.quality === "refined";
  const payload = useMemo(() => ({
    ...basePayload,
    perSourceComplexTransfers: normalizedTransferReady ? normalizedLive.result?.perSourceRspComplexTransfers || [] : [],
    normalizedTransferFingerprint: normalizedTransferReady ? normalizedLive.geometryFingerprint : null,
    calibrationFingerprint: fingerprints?.calibration ?? null,
  }), [basePayload, normalizedTransferReady, normalizedLive.result, normalizedLive.geometryFingerprint, fingerprints]);
  const inputsValid = baseInputsValid && normalizedTransferReady;
  const sharedAuthoritative = useMemo(() => ({
    ...authoritative,
    normalizedLive,
    normalizedPhysicsOptions,
  }), [authoritative, normalizedLive, normalizedPhysicsOptions]);

  const cacheKey = useMemo(() => fingerprints ? buildBassResultCacheKey(calibrationFingerprint) : null, [fingerprints, OPTIMISER_VERSION_SIGNATURE]);
  const requestIdentity = useMemo(() => ({
    fingerprint: cacheKey,
    geometryFingerprint: fingerprints?.geometry ?? null,
    productFingerprint: fingerprints?.product ?? null,
    calibrationFingerprint: fingerprints?.calibration ?? null,
    ...BASS_OPTIMISER_VERSIONS,
    canonicalPriorityMode: "canonical-physics-eq",
    poolId: null,
    selectedP14TargetDb: requested.selectedP14TargetDb,
    p14TargetBasis: requested.p14TargetBasis,
    p14TargetLevel: requested.requestedLevel,
    selectedP14RequiredExtensionHz: requested.selectedP14RequiredExtensionHz,
    p18TargetBasis: requested.p18TargetBasis,
    selectedP18RequiredExtensionHz: requested.selectedP18RequiredExtensionHz,
  }), [cacheKey, fingerprints, OPTIMISER_VERSION_SIGNATURE, requested.selectedP14TargetDb, requested.p14TargetBasis, requested.requestedLevel, requested.selectedP14RequiredExtensionHz, requested.p18TargetBasis, requested.selectedP18RequiredExtensionHz]);
  useEffect(() => {
    if (isDragging || !fingerprints) return; // Defer during drag; skip when analysis is blocked
    controller.ensureProtocolCompatibility(BASS_OPTIMISER_VERSIONS);
    controller.updateInputs({
      valid: inputsValid,
      fingerprint: cacheKey,
      legacyFingerprint: calibrationFingerprint,
      payload,
      identity: requestIdentity,
      collectDiagnostics: false,
    });
  }, [controller, isDragging, inputsValid, cacheKey, fingerprints, payload, requestIdentity, OPTIMISER_VERSION_SIGNATURE]);
  useEffect(() => () => { controller.dispose(); scopeRef.current?.clear(); }, [controller]);

  const detailedStatus = LEGACY_STATUS[lifecycle.status] || "IDLE";
  const matchingResult = lifecycle.status === "ready" && lifecycle.resultFingerprint === cacheKey ? lifecycle.result : null;
  const selectionAttempt = useMemo(() => {
    if (!matchingResult?.pool) return { result: null, error: null };
    try {
      return { result: selectCandidateFromPool(matchingResult.pool), error: null };
    } catch (error) {
      return { result: null, error };
    }
  }, [matchingResult, selectedPriorityMode]);
  useEffect(() => {
    if (selectionAttempt.error) controller.reportMainThreadError(selectionAttempt.error, "Canonical EQ selection");
  }, [controller, selectionAttempt.error]);
  const optimisationResult = useMemo(() => {
    const selected = selectionAttempt.result;
    if (!selected) return null;
    const heavyPoolReused = lifecycle.cacheStatus === "hit";
    const baseResult = {
      ...selected,
      ...BASS_OPTIMISER_VERSIONS,
      cacheKey,
      cacheSource: lifecycle.cacheRejectionReason ? "rejected-stale" : lifecycle.cacheStatus === "hit" ? "restored" : "fresh",
      cacheRejectionReason: lifecycle.cacheRejectionReason || null,
      calibrationFingerprint: calibrationFingerprint,
      heavyPoolReused,
      selectionDiagnostics: selected.selectionDiagnostics
        ? { ...selected.selectionDiagnostics, heavyPoolReused }
        : selected.selectionDiagnostics,
    };
    const canonicalResult = buildFinalOptimisedBassResponse({ optimisationResult: baseResult, selectedLayout: sources });
    const authority = evaluateCanonicalBassAuthority({
      canonicalResult,
      activeSubs: sources,
      usableLfHz: designEqSystemLimits.usableLfHz,
      p14TargetBasis: requested.p14TargetBasis,
      p18TargetBasis: requested.p18TargetBasis,
      requestedLevel: requested.requestedLevel,
    });
    const selectedCandidate = authority ? { ...selected.selectedCandidate, ...authority } : selected.selectedCandidate;
    const result = {
      ...baseResult,
      ...authority,
      selectedCandidate,
      selectedByMode: { ...baseResult.selectedByMode, balanced: selectedCandidate },
      primaryLimitation: authority?.limitation || null,
    };
    // Compact diagnostic identity object — only captured run identity fields.
    // No candidate, filter, curve, or P19 diagnostic content in Stage B.
    const diagnosticIdentity = matchingResult ? {
      diagnosticToken: matchingResult.diagnosticToken || null,
      collectDiagnostics: matchingResult.collectDiagnostics === true,
      workerRequestId: matchingResult.workerRequestId || null,
      startedAtMs: Number.isFinite(matchingResult.startedAtMs) ? matchingResult.startedAtMs : null,
      completedAtMs: Number.isFinite(matchingResult.completedAtMs) ? matchingResult.completedAtMs : null,
      inputFingerprint: matchingResult.fingerprint || null,
      cacheKey: cacheKey || null,
      protocolVersion: matchingResult.protocolVersion || null,
      poolVersion: matchingResult.poolVersion || null,
      engineVersion: matchingResult.engineVersion || null,
      resultSchemaVersion: matchingResult.resultSchemaVersion || null,
    } : null;
    const finalOptimisedBassResponse = buildFinalOptimisedBassResponse({ optimisationResult: result, selectedLayout: sources });
    // C6.1B2 Gap 1: completedContractFingerprint MUST come from the completed
    // contract/store, NOT from the current request cacheKey.
    //   activeRequestFingerprint    = cacheKey (the current request fingerprint)
    //   returnedWorkerFingerprint   = matchingResult.fingerprint (returned by the worker)
    //   completedContractFingerprint = lifecycle.resultFingerprint (the fingerprint on the
    //                                  COMPLETED RESULT in the lifecycle store — this is the
    //                                  same value that contract.job.resultFingerprint will get)
    //   persistedCompletedFingerprint = from the persisted completed authority store
    //   calibrationFingerprint      = calibrationFingerprint (embedded calibration identity)
    //
    // We do NOT use result.cacheKey — that is the current request cacheKey, not
    // the completed contract fingerprint. Using it would derive completed
    // identity from the current request, which is exactly what C6.1B2 prohibits.
    const returnedWorkerFingerprint = matchingResult?.fingerprint || null;
    const completedContractFingerprint = lifecycle?.resultFingerprint || null;
    // C6.2A1: Only compare persistedCompletedFingerprint when the persisted
    // record claims to represent the same result identity (same completed
    // fingerprint). For fresh runtime publication, pass null so an older
    // stored result does not invalidate a legitimate fresh replacement.
    // Restored persisted results still validate their own persisted
    // fingerprint because it matches their completedContractFingerprint.
    const rawPersistedFingerprint = getCompletedBassAuthority(scopeId)?.contract?.job?.resultFingerprint || null;
    const persistedCompletedFingerprint = rawPersistedFingerprint === completedContractFingerprint
      ? rawPersistedFingerprint
      : null;
    const resolvedCandidateId = result?.selectedCandidate?.candidateId || null;
    // C6.1B2 Gap 2: Candidate-result identity receipt. The candidate must be
    // explicitly linked to the completed result — presence alone is insufficient.
    const candidateResultIdentity = {
      candidateId: resolvedCandidateId,
      completedResultFingerprint: completedContractFingerprint,
    };
    const canonicalMetricAuthorityResult = buildCanonicalCompletedBassMetricAuthority({
      finalOptimisedBassResponse,
      activeRequestFingerprint: cacheKey,
      returnedWorkerFingerprint,
      completedContractFingerprint,
      persistedCompletedFingerprint,
      calibrationFingerprint,
      candidateId: resolvedCandidateId,
      candidateResultIdentity,
      // C6.1B2 Gap 3: graphMetricParityValid is not yet known at authority build
      // time — it is computed in BassResponse after the graph series are rendered.
      // Pass null so canonicalMetricPublicationValid starts false and is only set
      // true after the graph parity check completes via computeCanonicalMetricPublication.
      graphMetricParityValid: null,
      completedResultP14Identity: {
        selectedP14TargetDb: Number.isFinite(result?.selectedP14TargetDb) ? result.selectedP14TargetDb : null,
        p14TargetBasis: result?.p14TargetBasis ?? null,
        selectedP14Level: Number.isFinite(result?.selectedP14Level) ? result.selectedP14Level : null,
        selectedP14RequiredExtensionHz: Number.isFinite(result?.selectedP14RequiredExtensionHz) ? result.selectedP14RequiredExtensionHz : null,
        p18TargetBasis: result?.p18TargetBasis ?? null,
      },
      requestedP14Identity: {
        selectedP14TargetDb: requested.selectedP14TargetDb,
        p14TargetBasis: requested.p14TargetBasis,
        p14TargetLevel: requested.requestedLevel,
        selectedP14RequiredExtensionHz: requested.selectedP14RequiredExtensionHz,
        p18TargetBasis: requested.p18TargetBasis,
        selectedP18RequiredExtensionHz: requested.selectedP18RequiredExtensionHz,
      },
    });
    return {
      ...result,
      diagnosticIdentity,
      finalOptimisedBassResponse,
      // Expose completedContractFingerprint so graph series can carry it as
      // sourceFingerprint (C6.1B2: graph must carry completed-contract identity,
      // not current-request identity).
      completedContractFingerprint,
      canonicalMetricAuthority: canonicalMetricAuthorityResult.authority,
      canonicalMetricDiagnostics: canonicalMetricAuthorityResult.diagnostics,
    };
  }, [selectionAttempt.result, cacheKey, lifecycle.resultFingerprint, lifecycle.cacheStatus, lifecycle.cacheRejectionReason, calibrationFingerprint, sources, designEqSystemLimits.usableLfHz, requested.p14TargetBasis, requested.p18TargetBasis, requested.requestedLevel, requested.selectedP14TargetDb, requested.selectedP14RequiredExtensionHz, requested.selectedP18RequiredExtensionHz, scopeId]);
  // Record candidate-selection-accepted only after the pool contains a valid
  // selectable result. Guard with a Set so unrelated React renders do not
  // overwrite or duplicate the stage for the same token.
  const candidateAcceptedTokensRef = useRef(new Set());
  useEffect(() => {
    if (!optimisationResult?.selectedCandidate) return;
    const token = lifecycle?.result?.diagnosticToken || null;
    if (!token) return;
    if (candidateAcceptedTokensRef.current.has(token)) return;
    candidateAcceptedTokensRef.current.add(token);
    recordDiagStage(token, "candidate-selection-accepted", { workerRequestId: lifecycle?.result?.workerRequestId || null, selectedCandidateId: optimisationResult.selectedCandidateId || null });
  }, [optimisationResult, lifecycle?.result?.diagnosticToken, lifecycle?.result?.workerRequestId]);
  // C6.2A: Compute the metric publication receipt from the optimisation result
  // before publishCompletedBassContract(). This receipt is attached to the
  // completed contract and is the sole authoritative publication receipt.
  // BassResponse reads it from the contract rather than owning the only copy.
  const metricPublication = useMemo(() => buildMetricPublicationReceipt(optimisationResult), [optimisationResult]);
  const contract = useBassAnalysisContract({
    ...fingerprintInputs, subsForSimulation: sources, designEqSystemLimits, optimisationResult,
    detailedStatus, detailedProgress: lifecycle.progress, detailedElapsedMs: lifecycle.elapsedMs,
    rspRawCurve, perSeatRawCurves, optimiserPriorityMode: selectedPriorityMode, ...requested,
    fingerprintsOverride: fingerprints, backgroundLifecycle: lifecycle,
    collectDiagnostics: includeDiagnostics,
    metricPublication,
  });
  const publishedContractTokensRef = useRef(new Set());
  useEffect(() => {
    if (!fingerprints) {
      // Subwoofer instances / project inputs may still be hydrating. Don't wipe
      // a valid hydrated authoritative result until the live fingerprint can be
      // evaluated and a mismatch confirmed.
      if (!hasAuthoritativeResult(scopeId)) {
        markBassAuthorityBlocked(scopeId);
      }
      return;
    }
    const currentFingerprint = contract?.job?.currentJobFingerprint || cacheKey || null;
    if (contract?.job?.status === "error") {
      markBassAuthorityFailed(scopeId, currentFingerprint, contract?.job?.errorMessage);
      return;
    }
    const published = publishCompletedBassContract(scopeId, contract);
    if (!published && !hasAuthoritativeResult(scopeId, currentFingerprint)) {
      markBassAuthorityUpdating(scopeId, currentFingerprint);
    }
    syncPersistentBassAuthority(scopeId, currentFingerprint, contract);
    // Record contract-published ONLY when publishCompletedBassContract returned
    // true — not when authority is merely marked updating.
    const publishedToken = lifecycle?.result?.diagnosticToken || null;
    if (published && publishedToken && !publishedContractTokensRef.current.has(publishedToken)) {
      publishedContractTokensRef.current.add(publishedToken);
      recordDiagStage(publishedToken, "contract-published", { contractAnalysisId: contract?.analysisId || null, contractFingerprint: currentFingerprint });
    }
  }, [scopeId, cacheKey, contract, fingerprints]);

  const publishedStagesRef = useRef(new Set());
  useEffect(() => {
    const resultFingerprint = lifecycle.resultFingerprint;
    if (!resultFingerprint || !optimisationResult) return;
    for (const stage of ["Canonical EQ selection created", "Contract adapted", "Authoritative result published"]) {
      const key = `${resultFingerprint}:${stage}`;
      if (!publishedStagesRef.current.has(key)) {
        publishedStagesRef.current.add(key);
        controller.stage(stage, { jobId: lifecycle.activeJobId, poolId: optimisationResult.poolId });
      }
    }
  }, [controller, lifecycle.resultFingerprint, lifecycle.activeJobId, optimisationResult]);
  const onRetry = useCallback(
    ({ collectDiagnostics = false, force = true } = {}) => {
      const diagnosticToken = collectDiagnostics ? createDiagToken("manual-forced") : null;
      if (diagnosticToken) recordDiagStage(diagnosticToken, "token-created", { origin: "manual-forced", collectDiagnostics: true });
      return controller.requestManual({
        fingerprint: cacheKey,
        payload,
        identity: requestIdentity,
        collectDiagnostics: collectDiagnostics === true,
        force: force === true,
        diagnosticToken,
        });
    },
    [controller, cacheKey, payload, requestIdentity]
  );
  const value = scopeRef.current.replace({ scopeId, contract, lifecycle, selectedPriorityMode, optimisationResult, fingerprint: calibrationFingerprint, cacheKey, payload, inputsValid, detailedStatus, detailedError: lifecycle.errorMessage, onPriorityChange: null, onRetry, authoritative: sharedAuthoritative });
  return <BassResultsProvider value={value}>{children}</BassResultsProvider>;
}