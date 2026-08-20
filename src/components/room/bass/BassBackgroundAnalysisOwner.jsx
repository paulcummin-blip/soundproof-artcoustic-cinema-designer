import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useAppState } from "@/components/AppStateProvider";
import { selectCandidateFromPool } from "@/components/utils/bassOperatingEnvelopeOptimiser";
import { useAuthoritativeBassResponse } from "./useAuthoritativeBassResponse";
import { createBassBackgroundAnalysisStore } from "./bassBackgroundAnalysisStore";
import { useBassAnalysisContract } from "./useBassAnalysisContract";
import { BassResultsProvider, createBassResultsScope } from "./bassResultsStore";
import { buildBassResultCacheKey } from "./bassResultAuthority";
import { BASS_OPTIMISER_VERSIONS, bassOptimiserVersionSignature } from "./bassOptimiserWorkerProtocol";
import { markBassAuthorityBlocked, markBassAuthorityFailed, markBassAuthorityUpdating, publishCompletedBassContract, publishCachedCompactBassContract, syncPersistentBassAuthority, syncCachedCompactBassAuthority, useCompletedBassAuthority, hasAuthoritativeResult, isAuthoritativeBassContract, getCompletedBassContract, bassContractMatchesRequestedP14 } from "./completedBassResultStore";
import { createDiagToken, recordDiagStage } from "./bassDiagTokenTrace";
import { computeBaseDesignFingerprint, buildP14TargetKey, buildP14TargetCombinations } from "./p14TargetDefinitions";
import { useTargetCacheEntry, clearTargetCacheForDesign, hydrateTargetCache, setTargetCacheEntry } from "./p14TargetCache";
import { getP14TargetBackgroundScheduler } from "./p14TargetBackgroundScheduler";

const OPTIMISER_VERSION_SIGNATURE = bassOptimiserVersionSignature();
import { useNormalizedPhysicsOptions } from "./useNormalizedPhysicsOptions";
import { useNormalizedRoomTransferLive } from "./useNormalizedRoomTransferLive";
import { buildFinalOptimisedBassResponse } from "./finalOptimisedBassResponse";
import { buildFinishedGraphOptimisationResult, hasGraphPayload } from "./finishedGraphAdapter";
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
  // #1: Real project hydration authority. appState.isProjectHydrationReady is
  // set false at the start of useProjectLoader.loadProject and set true in its
  // finally block — the single existing flag that means the current Project
  // record has been hydrated into AppState and its persisted P14/splConfig
  // selection is authoritative. The foreground P14 owner must not start/cancel
  // a foreground job, restore/promote cached authority, write
  // current_fingerprint, or start the background family scheduler while this
  // is false (P14 target identity may still be in pre-hydration/default/
  // transitional state).
  const isProjectHydrationReady = !!appState?.isProjectHydrationReady;
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

  // ── P14 target cache: base design fingerprint and target key ──────────
  const baseDesignFingerprint = useMemo(() => {
    if (!fingerprintInputs) return null;
    return computeBaseDesignFingerprint(fingerprintInputs);
  }, [fingerprintInputs]);

  const targetKey = useMemo(() => {
    if (!requested?.p14TargetBasis || !requested?.requestedLevel) return null;
    return buildP14TargetKey(requested.p14TargetBasis, requested.requestedLevel);
  }, [requested.p14TargetBasis, requested.requestedLevel]);

  const allTargets = useMemo(() => {
    if (!requested?.p18TargetBasis) return [];
    return buildP14TargetCombinations(requested.p18TargetBasis);
  }, [requested.p18TargetBasis]);

  // Reactive cache lookup: returns cached compact contract for the current target, or null
  const cachedContract = useTargetCacheEntry(scopeId, baseDesignFingerprint, targetKey);

  // Hydrate target cache from DB on mount / project change
  const [targetCacheHydrated, setTargetCacheHydrated] = useState(false);
  useEffect(() => {
    setTargetCacheHydrated(false);
    hydrateTargetCache(scopeId).finally(() => setTargetCacheHydrated(true));
  }, [scopeId]);

  // Clear stale cache after hydration if the design doesn't match
  useEffect(() => {
    if (!targetCacheHydrated || !baseDesignFingerprint) return;
    clearTargetCacheForDesign(scopeId, baseDesignFingerprint);
  }, [targetCacheHydrated, baseDesignFingerprint, scopeId]);

  // ── Fallback: completed bass store contract ──────────────────────────
  // When the controller is idle (route return, authority-restored skip),
  // use the persisted authoritative contract from completedBassResultStore
  // so the bass graph and compliance UI render immediately without waiting
  // for a redundant optimiser run. Only used when the fingerprint matches
  // the current calibration fingerprint — prevents stale graphs after a
  // design change.
  // Reactive subscription to the completed bass authority store. On a fresh
  // session reopen the persisted authoritative contract hydrates
  // asynchronously; this hook (useSyncExternalStore) re-renders the component
  // when hydration completes so completedContract / completedFingerprint /
  // completedContractMatches / effectiveContract all pick up the hydrated
  // contract without requiring a foreground optimiser run.
  const completedBassAuthority = useCompletedBassAuthority(scopeId);
  const completedContract = completedBassAuthority?.contract || null;
  const completedFingerprint = completedContract?.job?.resultFingerprint || null;
  // #1: Persisted completed-bass-authority hydration settled flag. While false,
  // the foreground optimiser must not start — the persisted authority may
  // restore (AUTHORITATIVE → skip) or confirm no authority (UNCALCULATED →
  // calculate). Starting before hydration settles wastes a worker that gets
  // cancelled the moment the persisted authority arrives.
  const bassAuthorityHydrationSettled = completedBassAuthority?.hydrationSettled === true;
  // A persisted completed contract may be reused as AUTHORITATIVE only when it
  // is structurally complete AND metricPublication.canonicalMetricPublicationValid
  // === true (isAuthoritativeBassContract). A NOT_VERIFIED contract with a
  // matching fingerprint (e.g. old 360/320 snapshots) must NOT be treated as a
  // matching completed result — it must not block the foreground recalculation
  // or be displayed as COMPLETE.
  const completedContractMatches = isAuthoritativeBassContract(completedContract)
    && completedFingerprint
    && cacheKey
    && completedFingerprint === cacheKey;

  useEffect(() => {
    // #1: Do not start/cancel a foreground job or restore/promote cached
    // authority while the project record is still hydrating. P14 target
    // identity may be in a pre-hydration/default/transitional state.
    if (!isProjectHydrationReady) return;
    if (cachedContract) {
      // Cache hit — cancel any in-flight foreground worker so it doesn't
      // compete with the background scheduler for CPU or publish a stale
      // result after the cached contract is already live.
      controller.cancelActive("cache-hit");
      return; // Skip controller when cache hit — no optimiser run
    }
    // #1: Do not start a foreground job while persisted bass-authority
    // hydration is still in flight. The persisted authority may restore
    // (AUTHORITATIVE → authority-restored skip) or confirm no authority
    // (UNCALCULATED → calculate). Starting before hydration settles wastes a
    // worker that is cancelled the moment the persisted authority arrives.
    if (!bassAuthorityHydrationSettled) return;
    if (isDragging || !fingerprints) return; // Defer during drag; skip when analysis is blocked
    // ── Route-navigation guard ──────────────────────────────────────────
    // When returning to Room Designer after viewing a report (Technical /
    // Visual / Design Review), the completed bass store already holds the
    // authoritative contract for this fingerprint. Skip the optimiser
    // entirely — no recalculation, no worker, no lag. The fallback contract
    // (effectiveCompletedContract below) feeds the bass graph immediately.
    if (hasAuthoritativeResult(scopeId, cacheKey)) {
      controller.cancelActive("authority-restored");
      return;
    }
    controller.ensureProtocolCompatibility(BASS_OPTIMISER_VERSIONS);
    controller.updateInputs({
      valid: inputsValid,
      fingerprint: cacheKey,
      legacyFingerprint: calibrationFingerprint,
      payload,
      identity: requestIdentity,
      collectDiagnostics: false,
    });
  }, [controller, isDragging, inputsValid, cacheKey, fingerprints, payload, requestIdentity, OPTIMISER_VERSION_SIGNATURE, cachedContract, isProjectHydrationReady, bassAuthorityHydrationSettled]);
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
    const rawPersistedFingerprint = completedFingerprint;
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
  }, [selectionAttempt.result, cacheKey, lifecycle.resultFingerprint, lifecycle.cacheStatus, lifecycle.cacheRejectionReason, calibrationFingerprint, sources, designEqSystemLimits.usableLfHz, requested.p14TargetBasis, requested.p18TargetBasis, requested.requestedLevel, requested.selectedP14TargetDb, requested.selectedP14RequiredExtensionHz, requested.selectedP18RequiredExtensionHz, scopeId, completedFingerprint]);
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
    // #1: Do not publish/promote/sync while the project record is still
    // hydrating. A transient hydration target must not become current.
    if (!isProjectHydrationReady) return;
    // ── Cache hit: publish cached compact contract directly, skip optimiser ──
    if (cachedContract) {
      // Stage 4: publish cached compact contract with full safety guards.
      // cacheKey = buildBassResultCacheKey(calibrationFingerprint) — the
      // expected full result fingerprint. requested = the selected P14 target
      // identity. publishCachedCompactBassContract rejects any contract that
      // doesn't match both, or lacks the graph payload, or isn't AUTHORITATIVE.
      publishCachedCompactBassContract(scopeId, cachedContract, cacheKey, requested);
      return;
    }
    // ── Authority already restored: no publish, no sync, no recalculation ──
    // When returning from a report route, the completed bass store already
    // holds the authoritative contract for this fingerprint. The controller
    // is skipped (authority-restored guard above) so contract is null. Don't
    // call syncPersistentBassAuthority with a null contract — it would
    // needlessly rewrite the DB. The authority is already live.
    if (!contract && fingerprints && hasAuthoritativeResult(scopeId, cacheKey)) {
      return;
    }
    if (!fingerprints) {
      // Subwoofer instances / project inputs may still be hydrating. Don't wipe
      // a valid hydrated authoritative result until the live fingerprint can be
      // evaluated and a mismatch confirmed.
      if (!hasAuthoritativeResult(scopeId)) {
        markBassAuthorityBlocked(scopeId);
      }
      return;
    }
    // #2: For error/updating state transitions, use cacheKey (the current
    // request fingerprint). Do NOT use contract.job.currentJobFingerprint —
    // that is the controller's in-flight fingerprint and may be stale/zombie.
    if (contract?.job?.status === "error") {
      markBassAuthorityFailed(scopeId, cacheKey, contract?.job?.errorMessage);
      return;
    }
    const published = publishCompletedBassContract(scopeId, contract);
    if (!published && !hasAuthoritativeResult(scopeId, cacheKey)) {
      markBassAuthorityUpdating(scopeId, cacheKey);
    }
    // ── #2: Current authority persistence invariant ──────────────────────
    // A contract may update persisted CURRENT completed authority ONLY when
    // ALL are true:
    //   - contract exists and job is complete;
    //   - contract is structurally complete (isAuthoritativeBassContract);
    //   - contract is AUTHORITATIVE (canonical publication valid);
    //   - contract matches CURRENT requested P14 identity;
    //   - contract result fingerprint exactly equals CURRENT full cacheKey;
    //   - Stage 3 graph payload is complete.
    // Only then persist the verified contract.job.resultFingerprint as current.
    // Never persist a controller currentJobFingerprint from a calculating/zombie
    // lifecycle, a transient hydration target, a background target the user did
    // not select, or cacheKey without first proving the completed contract
    // equals it.
    const completedContract = getCompletedBassContract(scopeId);
    const resultFingerprint = completedContract?.job?.resultFingerprint || null;
    const jobComplete = contract?.job?.status === "complete" || contract?.job?.status === "ready";
    const canPersistCurrent = jobComplete
      && isAuthoritativeBassContract(completedContract)
      && bassContractMatchesRequestedP14(completedContract, requested)
      && !!resultFingerprint
      && !!cacheKey
      && resultFingerprint === cacheKey
      && hasGraphPayload(completedContract);
    if (canPersistCurrent) {
      syncPersistentBassAuthority(scopeId, resultFingerprint, completedContract);
    }
    // ── Stage 4 / #5: Foreground target enters family first ─────────────
    // After foreground publication succeeds, write the authoritative compact
    // contract to the 8-target family cache so the foreground target is also
    // a member of target_cache. The scheduler excludes the foreground target
    // from its background queue, so without this bridge the family would
    // contain only 7 targets. Gated on canPersistCurrent so only a fully
    // verified current foreground contract enters the family.
    if (published && baseDesignFingerprint && targetKey && canPersistCurrent) {
      setTargetCacheEntry(scopeId, baseDesignFingerprint, targetKey, completedContract);
    }
    // Record contract-published ONLY when publishCompletedBassContract returned
    // true — not when authority is merely marked updating.
    const publishedToken = lifecycle?.result?.diagnosticToken || null;
    if (published && publishedToken && !publishedContractTokensRef.current.has(publishedToken)) {
      publishedContractTokensRef.current.add(publishedToken);
      recordDiagStage(publishedToken, "contract-published", { contractAnalysisId: contract?.analysisId || null, contractFingerprint: resultFingerprint });
    }
  }, [scopeId, cacheKey, contract, fingerprints, cachedContract, isProjectHydrationReady, baseDesignFingerprint, targetKey]);

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
  // ── P14 target background scheduler ──────────────────────────────────
  // After the foreground result is complete (cached or fresh), quietly
  // precompute remaining P14 targets one at a time. The scheduler's schedule()
  // method handles same-design updates (just changes foreground target) and
  // design changes (cancels and restarts). Background results are cache-only
  // and NEVER published to the live UI.
  // ── #3: Strict foregroundReady ────────────────────────────────────────
  // The P14 background family may start ONLY after the CURRENT selected
  // foreground target is fully reusable. An old completed contract that
  // merely matches some transient hydration fingerprint is insufficient.
  //
  // PATH A — EXISTING CACHED CURRENT TARGET:
  //   project hydration complete; target_cache[currentTargetKey] exists;
  //   correct current baseDesignFingerprint; full result fingerprint matches
  //   CURRENT cacheKey; P14 identity matches CURRENT selection; AUTHORITATIVE;
  //   canonical publication valid; Stage 3 graph payload complete; that same
  //   contract has been promoted as current completed authority.
  //
  // PATH B — FRESH CURRENT FOREGROUND RESULT:
  //   project hydration complete; foreground calculation completed for CURRENT
  //   selected target; result fingerprint = CURRENT cacheKey; P14 identity =
  //   CURRENT selection; AUTHORITATIVE; canonical publication valid; Stage 3
  //   graph payload complete; foreground contract written successfully to
  //   target_cache[currentTargetKey]; same fingerprint is current completed
  //   authority.
  //
  // Both paths converge on the same invariant: the current foreground target
  // must be present in target_cache as an authoritative, graph-complete
  // contract whose fingerprint equals the current cacheKey and whose P14
  // identity matches the current selection, AND that same contract must be
  // the current completed authority (currentFingerprint === cacheKey).
  const foregroundReadyPathA = isProjectHydrationReady
    && !!cachedContract
    && isAuthoritativeBassContract(cachedContract)
    && hasGraphPayload(cachedContract)
    && bassContractMatchesRequestedP14(cachedContract, requested)
    && !!cachedContract?.job?.resultFingerprint
    && cachedContract.job.resultFingerprint === cacheKey
    && !!completedBassAuthority?.authoritative
    && completedBassAuthority?.currentFingerprint === cacheKey;
  const foregroundReadyPathB = isProjectHydrationReady
    && !cachedContract
    && !!optimisationResult
    && !!matchingResult
    && (contract?.job?.status === "complete" || contract?.job?.status === "ready")
    && isAuthoritativeBassContract(completedContract)
    && hasGraphPayload(completedContract)
    && bassContractMatchesRequestedP14(completedContract, requested)
    && !!completedContract?.job?.resultFingerprint
    && completedContract.job.resultFingerprint === cacheKey
    && !!completedBassAuthority?.authoritative
    && completedBassAuthority?.currentFingerprint === cacheKey;
  const foregroundReady = foregroundReadyPathA || foregroundReadyPathB;
  const designContextRef = useRef(null);
  designContextRef.current = useMemo(() => ({
    payload, sources, usableLfHz: designEqSystemLimits?.usableLfHz,
    rspRawCurve, perSeatRawCurves, fingerprints, fingerprintInputs,
  }), [payload, sources, designEqSystemLimits, rspRawCurve, perSeatRawCurves, fingerprints, fingerprintInputs]);

  useEffect(() => {
    // #1: Do not start the background family scheduler while the project
    // record is still hydrating.
    if (!isProjectHydrationReady) return;
    if (!baseDesignFingerprint || !targetKey) return;
    const scheduler = getP14TargetBackgroundScheduler();
    if (!foregroundReady || !allTargets.length) {
      // Foreground is recalculating — cancel background work to avoid
      // concurrent heavy calculations. Queue rebuilds when foreground completes.
      scheduler.cancel();
      return;
    }
    scheduler.schedule({
      projectId: scopeId,
      baseDesignFingerprint,
      foregroundTargetKey: targetKey,
      allTargets,
      designContext: designContextRef.current,
    });
  }, [baseDesignFingerprint, targetKey, foregroundReady, allTargets, scopeId, isProjectHydrationReady]);

  // #1: While the project record is still hydrating, do not present a
  // transitional completed contract as the effective contract — P14 target
  // identity may still be in pre-hydration/default/transitional state.
  const effectiveContract = isProjectHydrationReady
    ? (cachedContract || contract || (completedContractMatches ? completedContract : null))
    : null;
  // When using the fallback completed contract (controller skipped), show
  // COMPLETE status so the bass graph and status indicators don't flash IDLE.
  const effectiveDetailedStatus = (isProjectHydrationReady && effectiveContract && !cachedContract && !contract && completedContractMatches) ? "COMPLETE" : detailedStatus;
  // ── Stage 3: Finished graph restore from cached graphPayload ──────────
  // When no live optimisation result exists (controller idle after route
  // return, project reopen, or fresh session) but a matching authoritative
  // completed contract with a graphPayload exists, build a synthetic
  // optimisationResult from the saved graph curves. This restores the
  // finished graph without running the foreground optimiser.
  // Authority priority: live result takes precedence; cached graph is only
  // used when the live result is null AND the completed contract matches.
  const cachedGraphOptimisationResult = useMemo(() => {
    if (!isProjectHydrationReady || optimisationResult || !completedContractMatches || !completedContract) return null;
    if (!hasGraphPayload(completedContract)) return null;
    return buildFinishedGraphOptimisationResult(completedContract);
  }, [isProjectHydrationReady, optimisationResult, completedContractMatches, completedContract]);
  const effectiveOptimisationResult = optimisationResult || cachedGraphOptimisationResult;
  const value = scopeRef.current.replace({ scopeId, contract: effectiveContract, lifecycle, selectedPriorityMode, optimisationResult: effectiveOptimisationResult, fingerprint: calibrationFingerprint, cacheKey, payload, inputsValid, detailedStatus: effectiveDetailedStatus, detailedError: lifecycle.errorMessage, onPriorityChange: null, onRetry, authoritative: sharedAuthoritative, completedBassAuthority, seatingPositions });
  return <BassResultsProvider value={value}>{children}</BassResultsProvider>;
}