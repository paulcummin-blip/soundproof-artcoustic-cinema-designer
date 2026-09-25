import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useAppState } from "@/components/AppStateProvider";
import { selectCandidateFromPool } from "@/components/utils/bassOperatingEnvelopeOptimiser";
import { useAuthoritativeBassResponse } from "./useAuthoritativeBassResponse";
import { createBassBackgroundAnalysisStore } from "./bassBackgroundAnalysisStore";
import { useBassAnalysisContract } from "./useBassAnalysisContract";
import { BassResultsProvider, createBassResultsScope } from "./bassResultsStore";
import { buildBassResultCacheKey } from "./bassResultAuthority";
import { BASS_OPTIMISER_VERSIONS, bassOptimiserVersionSignature } from "./bassOptimiserWorkerProtocol";
import { BASS_AUTHORITY_STATUS, markBassAuthorityBlocked, markBassAuthorityFailed, markBassAuthorityStale, markBassAuthorityUpdating, publishCompletedBassContract, publishCachedCompactBassContract, publishCachedLimitedBassContract, syncPersistentBassAuthority, syncCachedCompactBassAuthority, useCompletedBassAuthority, hasAuthoritativeResult, isAuthoritativeBassContract, getCompletedBassContract, bassContractMatchesRequestedP14 } from "./completedBassResultStore";
import { resolveBassLifecycleState, BASS_LIFECYCLE_STATE, BASS_LIFECYCLE_COPY, BASS_COLD_RELOAD_RECOVERY_COPY } from "./bassCalculationLifecycle";
import { useOptimiseWorkflowState } from "./optimiseWorkflow/optimiseWorkflowStore";
import { createDiagToken, recordDiagStage } from "./bassDiagTokenTrace";
import { computeBaseDesignFingerprint, buildP14TargetKey, buildP14TargetCombinations } from "./p14TargetDefinitions";
import { useTargetCacheEntry, useTargetCacheProgress, clearTargetCacheForDesign, hydrateTargetCache, setTargetCacheEntry, flushTargetCachePersistence } from "./p14TargetCache";
import { beginP14AnalysisJob, publishP14AnalysisProgress, getP14AnalysisProgress } from "./p14AnalysisProgressStore";
import { getP14TargetBackgroundScheduler } from "./p14TargetBackgroundScheduler";
import { isBackgroundInputsReady } from "./backgroundInputReadiness";
import { resolveRspScreenFrontPlaneM, resolveRspScreenWidthM } from "@/components/room/rsp/screenGeometryResolver";
import { distanceFor57_5FromWidth } from "@/components/room/seatingUtils";
import { summariseAuthoritativeP19Seats } from "./p19SeatAuthority";
import { getScopedSeatIds } from "@/components/utils/seatScopeAuthority";

const OPTIMISER_VERSION_SIGNATURE = bassOptimiserVersionSignature();
import { useNormalizedPhysicsOptions } from "./useNormalizedPhysicsOptions";
import { useNormalizedRoomTransferLive } from "./useNormalizedRoomTransferLive";
import { buildFinalOptimisedBassResponse } from "./finalOptimisedBassResponse";
import { buildFinishedGraphOptimisationResult, hasGraphPayload } from "./finishedGraphAdapter";
import { evaluateCanonicalBassAuthority } from "@/components/utils/canonicalBassAuthorityEvaluation";
import { buildCanonicalCompletedBassMetricAuthority } from "./canonicalCompletedBassMetricAuthority";
import { buildMetricPublicationReceipt } from "./metricPublicationReceipt";
import { hasReadyCanonicalP19Contract } from "./p19Readiness";
import { isValidLimitedP14Contract } from "./p14LimitedTargetAuthority";
import { useRecommendationGate } from "@/components/state/recommendationGateStore";
import { getBassHeavyAction, cancelBassHeavyAction, useBassHeavyAction } from "./bassHeavyActionStore";
import { createManualBassTimingTrace } from "./manualBassTimingDiagnostics";
import { consumeCalculateAllTargetsRequest, useCalculateAllTargetsRequest } from "./calculateAllTargetsStore";
import { getStage2State, subscribeStage2 } from "./stage2/stage2PlacementStore";


const LEGACY_STATUS = { idle: "IDLE", queued: "QUEUED", calculating: "CALCULATING", ready: "COMPLETE", stale: "OUT_OF_DATE", error: "ERROR" };

export default function BassBackgroundAnalysisOwner({ children, scopeId = "free", versionId = "free" }) {
  const appState = useAppState();
  const recommendationsActive = useRecommendationGate();
  const calcAllTargetsRequest = useCalculateAllTargetsRequest();
  // FIX 5: Higher-priority work detection. The P14 background sweep must yield
  // to manual Calculate, Improve Bass Response / Stage 2, and recommendation
  // work. These reactive subscriptions ensure the auto-start useEffect re-runs
  // when higher-priority work starts or ends.
  const heavyAction = useBassHeavyAction(scopeId, versionId);
  const stage2State = useSyncExternalStore(subscribeStage2, () => getStage2State(scopeId, versionId), () => getStage2State(scopeId, versionId));
  const heavyActionRunning = heavyAction?.status === "requested" || heavyAction?.status === "running";
  const stage2Updating = stage2State?.status === "updating";
  const controllerRef = useRef(null);
  const scopeRef = useRef(null);
  const [manualAnalysisRequest, setManualAnalysisRequest] = useState(null);
  // FIX 2&3: Explicit terminal outcome tracking. When the manual request is
  // cleared, this records WHY — success, error, timeout, cancelled, stale,
  // or rejected — so the UI can show an explicit status instead of silently
  // returning to idle.
  const [lastTerminalOutcome, setLastTerminalOutcome] = useState(null);
  // Cold-reload recovery: set when a persisted UPDATING authority is found
  // with no active job after reload. Cleared when a new calculation starts.
  const [coldReloadRecovered, setColdReloadRecovered] = useState(false);
  const manualRequestSequenceRef = useRef(0);
  const dispatchedManualRequestRef = useRef(null);

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
  const authoritative = useAuthoritativeBassResponse({
    appState,
    frontSubsLive,
    rearSubsLive,
    analysisRequestId: manualAnalysisRequest?.id || null,
    // Pass the GEOMETRY fingerprint to the authoritative hook for the
    // room-physics gate. Room physics is geometry-dependent only — a P14
    // target change does not invalidate room physics. The hook checks
    // analysisRequestFingerprint === fingerprints.geometry, so a P14-only
    // change reuses the cached room response.
    analysisRequestFingerprint: manualAnalysisRequest?.geometryFingerprint || null,
  });
  const {
    roomDims, seatingPositions, rspPosition, sources, rspRawCurve, perSeatRawCurves,
    designEqSystemLimits, optimisationTransitionHz, requested, fingerprintInputs,
    fingerprints, payload: basePayload, inputsValid: baseInputsValid, includeDiagnostics,
    canonicalRoomResponseCurve,
  } = authoritative;
  const calibrationFingerprint = fingerprints?.calibration ?? null;
  const geometryFingerprint = fingerprints?.geometry ?? null;
  const normalizedPhysicsOptions = useNormalizedPhysicsOptions(authoritative);
  // PASS 2: The normalized room-transfer hook is NO LONGER driven by the manual
  // Calculate request. perSourceRspComplexTransfers now come from the
  // authoritative simulation itself (flat-source RSP transfers, same mode
  // bank). The hook is retained for potential non-manual live features but
  // stays idle during manual Calculate (no analysisRequestId passed).
  const normalizedLive = useNormalizedRoomTransferLive({
    roomDims,
    rspPosition,
    seatingPositions,
    subsForSimulation: sources,
    physicsOptions: normalizedPhysicsOptions,
    analysisRequestId: null,
    analysisRequestFingerprint: null,
  });
  // PASS 2: Use perSourceRspComplexTransfers from the authoritative simulation.
  // The authoritative engine produces these from a flat 94 dB source (same
  // physics as the normalized engine) reusing the same precomputed mode bank.
  const authoritativeTransferReady = authoritative.status === "ready" && (authoritative.perSourceRspComplexTransfers?.length || 0) > 0;
  const payload = useMemo(() => ({
    ...basePayload,
    perSourceComplexTransfers: authoritativeTransferReady ? authoritative.perSourceRspComplexTransfers || [] : [],
    normalizedTransferFingerprint: authoritativeTransferReady ? fingerprints?.geometry ?? null : null,
    calibrationFingerprint: fingerprints?.calibration ?? null,
  }), [basePayload, authoritativeTransferReady, authoritative.perSourceRspComplexTransfers, fingerprints]);
  const inputsValid = baseInputsValid && authoritativeTransferReady;
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

  // The eight-target acoustic family is independent of the P18 grading view.
  // Minimum/Recommended P18 is recomputed from achieved extension at display
  // time, so changing that selector neither rebuilds nor restarts this queue.
  const allTargets = useMemo(() => buildP14TargetCombinations(), [OPTIMISER_VERSION_SIGNATURE]);
  const allTargetKeys = useMemo(() => allTargets.map((target) => target.key), [allTargets]);

  // Reactive cache lookup: returns cached compact contract for the current target, or null
  const cachedContract = useTargetCacheEntry(scopeId, versionId, baseDesignFingerprint, targetKey);
  const targetFamilyProgress = useTargetCacheProgress(scopeId, versionId, baseDesignFingerprint, allTargetKeys);
  const targetDurationSignature = targetFamilyProgress.completedDurationsMs.join("|");

  // Hydrate target cache from DB on mount / project change
  const [targetCacheHydrated, setTargetCacheHydrated] = useState(false);
  useEffect(() => {
    setTargetCacheHydrated(false);
    hydrateTargetCache(scopeId, versionId).finally(() => setTargetCacheHydrated(true));
  }, [scopeId, versionId]);

  // Clear stale cache after hydration if the design doesn't match
  useEffect(() => {
    if (!targetCacheHydrated || !baseDesignFingerprint) return;
    clearTargetCacheForDesign(scopeId, versionId, baseDesignFingerprint);
  }, [targetCacheHydrated, baseDesignFingerprint, scopeId, versionId]);

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
  const completedBassAuthority = useCompletedBassAuthority(scopeId, versionId);
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
  // ── Separation of Restoration and Recalculation ──────────────────────
  // The Published Engineering Contract is the engineering truth. Restoration
  // (displaying the published graph, RP22, ADI) uses the contract directly —
  // no live fingerprint comparison required. Recalculation (deciding whether
  // the design changed and a new calculation is needed) uses the live
  // fingerprint. These two responsibilities are intentionally separate.
  //
  // completedContractMatches: DB fingerprint === live fingerprint. Used for
  //   RECALCULATION decisions (success terminal, persistence, foreground
  //   readiness). NOT used to gate restoration.
  const completedContractMatches = isAuthoritativeBassContract(completedContract)
    && completedFingerprint
    && cacheKey
    && completedFingerprint === cacheKey;
  // hasPublishedContract: the contract is structurally authoritative and
  // carries a graph payload. This is the RESTORATION authority — the published
  // contract may be displayed regardless of whether the live fingerprint
  // matches. The live fingerprint determines recalculation, not restoration.
  const hasPublishedContract = isAuthoritativeBassContract(completedContract)
    && !!completedFingerprint
    && hasGraphPayload(completedContract);
  // publishedContractIsStale: the live fingerprint differs from the published
  // contract's fingerprint — the design changed and recalculation is needed.
  // The published contract remains visible (restoration) until the new
  // calculation replaces it.
  const publishedContractIsStale = hasPublishedContract
    && !!cacheKey
    && completedFingerprint !== cacheKey;

  // PASS 2: manualRequestMatchesCurrent no longer depends on the normalized
  // transfer fingerprint. The cacheKey (full calibration fingerprint) captures
  // the complete design identity — geometry, product, target. That is
  // sufficient to confirm the request is still valid.
  const manualRequestMatchesCurrent = !!manualAnalysisRequest
    && manualAnalysisRequest.fingerprint === cacheKey;
  // Semantic geometry readiness: proves the geometry feeding the calibration
  // fingerprint is fully resolved and internally consistent. This is NOT a
  // timing heuristic — it checks the mathematical invariant that mlpY_m
  // equals the value the canonical RSP authority would derive from the
  // current screenFrontPlaneM and screen width. When the invariant holds,
  // the MLP effect's setter is a no-op and the entire downstream chain
  // (rspPosition → autoAlignDelays → sources → calibration fingerprint) is
  // stable. Uses the SAME canonical resolvers used by computeEffectiveRsp
  // during hydration — no duplicated maths.
  const bassGeometryReady = (() => {
    const rspMode = appState?.rspMode || "auto_from_screen";

    // SEAT-BOUND: designated seat resolved → rspPosition authoritative.
    // No screen-plane or MLP dependency.
    if (rspMode === "seat_bound") {
      return !!appState?.designatedRspSeatId && !!rspPosition;
    }

    // MANUAL_POSITION: manualRspY_m is the sole authority. MLP effect does
    // not run for this mode.
    if (rspMode === "manual_position") {
      return Number.isFinite(Number(appState?.manualRspY_m));
    }

    // AUTO_FROM_SCREEN and row-derived modes: use the same canonical screen
    // plane resolver as the RSP writer. New rooms can have no LCR model yet,
    // so no screen plane has been published; the resolver supplies the same
    // stable fallback used to position the RSP until LCR geometry is ready.
    const expectedSfp = resolveRspScreenFrontPlaneM(appState?.screenFrontPlaneM, appState?.screen);
    if (!Number.isFinite(expectedSfp) || expectedSfp <= 0) return false;

    const mlpY = Number(appState?.mlpY_m);
    if (!Number.isFinite(mlpY) || mlpY <= 0) return false;

    const screenWidthM = resolveRspScreenWidthM(appState?.screen);
    const idealDistM = distanceFor57_5FromWidth(screenWidthM);
    const expectedMlpY = expectedSfp + idealDistM;

    return Math.abs(mlpY - expectedMlpY) < 0.0005;
  })();

  // PASS 2: canCalculate no longer depends on the normalized room-transfer
  // hook. The authoritative geometry fingerprint (fingerprints.geometry) is the
  // sole geometry-validity gate. The normalized hook stays idle during manual
  // Calculate (analysisRequestId: null) and is not waited on.
  const layoutRefreshPending = !!appState?.layoutRefreshPending;
  const geometryReflowInProgress = !!appState?.geometryReflowInProgress;
  const clearGeometryReflow = appState?.clearGeometryReflow;

  // ── Geometry-ready state machine ──────────────────────────────────────
  // After a room-dimension Refresh, reflowLayout mutates geometry (subs,
  // projector) and increments roomReflowEpoch. Downstream effects
  // (useSeatingRebuild, MLP recalc, speaker reconciliation) then fire across
  // subsequent renders, each mutating the calibration fingerprint.
  //
  // geometryReadyForCalculation becomes true ONLY when:
  //   1. No reflow is in progress (normal operation), OR
  //   2. A reflow is in progress AND the calibration fingerprint has been
  //      observed unchanged across two consecutive renders — proving all
  //      downstream rebuild effects have completed.
  //
  // This is event-driven and deterministic: no timers, no arbitrary delays.
  // The settle-tick triggers one extra render so the fingerprint can be
  // compared against itself; if it changed (another effect mutated geometry),
  // we store the new value and tick again. Convergence is bounded by the
  // number of geometry-effect chains (typically 3–5 renders).
  const prevCalibrationFingerprintRef = useRef(null);
  const prevReflowInProgressRef = useRef(false);
  const settleAttemptsRef = useRef(0);
  const [settleTick, setSettleTick] = useState(0);
  const MAX_SETTLE_TICKS = 30; // safety bound — not a timer

  useEffect(() => {
    const reflowJustStarted = geometryReflowInProgress && !prevReflowInProgressRef.current;
    prevReflowInProgressRef.current = geometryReflowInProgress;

    if (!geometryReflowInProgress) {
      // Not in reflow — keep ref synced for the next reflow.
      prevCalibrationFingerprintRef.current = calibrationFingerprint;
      settleAttemptsRef.current = 0;
      return;
    }

    if (reflowJustStarted) {
      // Reset the ref so we don't match against the pre-reflow fingerprint.
      // Tick to trigger a second render for the first comparison.
      prevCalibrationFingerprintRef.current = null;
      settleAttemptsRef.current = 1;
      setSettleTick((t) => t + 1);
      return;
    }

    if (!calibrationFingerprint) {
      // Fingerprint not yet computed — wait for it.
      prevCalibrationFingerprintRef.current = null;
      return;
    }

    if (calibrationFingerprint === prevCalibrationFingerprintRef.current) {
      // Fingerprint unchanged across two consecutive renders — all
      // downstream rebuild effects have completed. Clear the reflow flags.
      prevCalibrationFingerprintRef.current = null;
      settleAttemptsRef.current = 0;
      if (typeof clearGeometryReflow === "function") clearGeometryReflow();
    } else {
      // Fingerprint changed (or first observation) — store it and trigger
      // one more render so we can compare again.
      prevCalibrationFingerprintRef.current = calibrationFingerprint;
      settleAttemptsRef.current += 1;
      if (settleAttemptsRef.current < MAX_SETTLE_TICKS) {
        setSettleTick((t) => t + 1);
      } else {
        // Safety valve — geometry should have settled by now.
        prevCalibrationFingerprintRef.current = null;
        settleAttemptsRef.current = 0;
        if (typeof clearGeometryReflow === "function") clearGeometryReflow();
      }
    }
  }, [calibrationFingerprint, geometryReflowInProgress, settleTick, clearGeometryReflow]);

  // geometryReadyForCalculation — the sole geometry gate for canCalculate.
  // True when no reflow is pending or in-progress. During a reflow, it stays
  // false until the fingerprint stabilises (effect above calls
  // clearGeometryReflow, which sets both flags false).
  const geometryReadyForCalculation = !layoutRefreshPending && !geometryReflowInProgress;

  const canCalculate = isProjectHydrationReady
    && bassAuthorityHydrationSettled
    && bassGeometryReady
    && geometryReadyForCalculation
    && !!fingerprints
    && !!fingerprints?.geometry
    && !!cacheKey
    && !!targetKey
    && sources.length > 0
    && seatingPositions.length > 0;

  // Observe identity only. This path deliberately has no worker start and no
  // debounce: a design change can cancel/invalidate work, but never schedules
  // an authoritative replacement.
  useEffect(() => {
    getP14TargetBackgroundScheduler().cancel();
    controller.ensureProtocolCompatibility(BASS_OPTIMISER_VERSIONS);
    controller.observeInputs({
      valid: !!fingerprints && !!cacheKey && !!targetKey,
      fingerprint: cacheKey,
      projectId: scopeId,
      versionId,
    });

    const heavyAction = getBassHeavyAction(scopeId, versionId);
    if (heavyAction?.requestId
      && heavyAction.sourceFingerprint
      && heavyAction.sourceFingerprint !== cacheKey) {
      cancelBassHeavyAction(scopeId, versionId, "Design changed — request cancelled.");
    }

    if (
      bassAuthorityHydrationSettled
      && cacheKey
      && completedBassAuthority?.currentFingerprint
      && completedBassAuthority.currentFingerprint !== cacheKey
    ) {
      if (completedBassAuthority.contract) {
        markBassAuthorityStale(scopeId, versionId, cacheKey);
      } else {
        markBassAuthorityUpdating(scopeId, versionId, null);
      }
    }

    // Cold-reload recovery: if the persisted authority is UPDATING but no
    // active job exists (the worker from the previous session is gone), mark
    // as stale_needs_recalculation — not endless "Calculating…".
    if (
      bassAuthorityHydrationSettled
      && !manualAnalysisRequest
      && completedBassAuthority?.authorityStatus === BASS_AUTHORITY_STATUS.UPDATING
    ) {
      setColdReloadRecovered(true);
      if (completedBassAuthority.contract) {
        markBassAuthorityStale(scopeId, versionId, cacheKey);
      } else {
        markBassAuthorityBlocked(scopeId, versionId);
      }
    }

    if (manualAnalysisRequest && !manualRequestMatchesCurrent) {
      dispatchedManualRequestRef.current = null;
      // FIX 3: Design changed during calculation — terminal "cancelled" state.
      setLastTerminalOutcome({ outcome: "cancelled", fingerprint: manualAnalysisRequest.fingerprint });
      setManualAnalysisRequest(null);
    }
  }, [
    controller,
    scopeId,
    cacheKey,
    targetKey,
    fingerprints,
    bassAuthorityHydrationSettled,
    completedBassAuthority,
    manualAnalysisRequest,
    manualRequestMatchesCurrent,
    OPTIMISER_VERSION_SIGNATURE,
  ]);

  // PASS 1 — Preparation watchdog: covers the entire preparation phase
  // (authoritative simulation) from request acceptance to optimiser dispatch.
  // Bounded at 90 seconds — generous for development/debugging, but finite.
  // When it fires: terminate the request, mark failed, clear calculating state,
  // and prevent stale workers from publishing. Fingerprint-specific so an old
  // timeout cannot kill a newer calculation.
  const PREPARATION_WATCHDOG_MS = 90000;
  const preparationWatchdogRef = useRef(null);
  const timingTraceRef = useRef(null);

  useEffect(() => {
    if (!manualAnalysisRequest) {
      // No active manual request — clear any stale watchdog.
      if (preparationWatchdogRef.current) {
        clearTimeout(preparationWatchdogRef.current);
        preparationWatchdogRef.current = null;
      }
      return;
    }
    // Start watchdog when a new manual request is accepted.
    if (preparationWatchdogRef.current) {
      clearTimeout(preparationWatchdogRef.current);
    }
    const requestFingerprint = manualAnalysisRequest.fingerprint;
    const requestId = manualAnalysisRequest.id;
    preparationWatchdogRef.current = setTimeout(() => {
      // Guard: only fire if this exact request is still pending.
      if (!manualAnalysisRequest || manualAnalysisRequest.id !== requestId || manualAnalysisRequest.fingerprint !== requestFingerprint) return;
      if (dispatchedManualRequestRef.current === requestId) return; // Already dispatched to optimiser.
      const isDev = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV === true;
      if (isDev) console.log("[bass-prep-watchdog]", "TIMEOUT", { requestId, requestFingerprint });
      if (timingTraceRef.current) timingTraceRef.current.mark("preparationTimeoutMs");
      markBassAuthorityFailed(scopeId, versionId, requestFingerprint, "Bass preparation timed out — please retry.");
      dispatchedManualRequestRef.current = null;
      // FIX 3: Watchdog timeout — terminal "timeout" state, distinct from error.
      setLastTerminalOutcome({ outcome: "timeout", fingerprint: requestFingerprint });
      setManualAnalysisRequest(null);
    }, PREPARATION_WATCHDOG_MS);
    return () => {
      if (preparationWatchdogRef.current) {
        clearTimeout(preparationWatchdogRef.current);
        preparationWatchdogRef.current = null;
      }
    };
  }, [manualAnalysisRequest?.id, manualAnalysisRequest?.fingerprint, scopeId]);

  // Worker-phase watchdog: covers the optimiser worker phase from dispatch
  // to completion. Bounded at 120 seconds — generous for real calculations,
  // but finite. When it fires: terminate the worker, mark timed_out (not
  // error), clear calculating state, and surface a plain-language message.
  // This ensures the primary action never remains disabled indefinitely.
  const WORKER_WATCHDOG_MS = 120000;
  const workerWatchdogRef = useRef(null);

  useEffect(() => {
    if (!manualAnalysisRequest || !manualRequestMatchesCurrent) {
      if (workerWatchdogRef.current) {
        clearTimeout(workerWatchdogRef.current);
        workerWatchdogRef.current = null;
      }
      return;
    }
    // Only start the worker watchdog once the request is dispatched to the
    // optimiser. Before dispatch, the preparation watchdog covers the phase.
    if (dispatchedManualRequestRef.current !== manualAnalysisRequest.id) return;
    if (workerWatchdogRef.current) return; // Already armed for this request

    const requestId = manualAnalysisRequest.id;
    const requestFingerprint = manualAnalysisRequest.fingerprint;
    workerWatchdogRef.current = setTimeout(() => {
      // Guard: only fire if this exact request is still active and dispatched.
      if (!manualAnalysisRequest || manualAnalysisRequest.id !== requestId || manualAnalysisRequest.fingerprint !== requestFingerprint) return;
      if (dispatchedManualRequestRef.current !== requestId) return;
      const isDev = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV === true;
      if (isDev) console.log("[bass-worker-watchdog]", "TIMEOUT", { requestId, requestFingerprint });
      controller.cancelActive("timed_out");
      dispatchedManualRequestRef.current = null;
      markBassAuthorityFailed(scopeId, versionId, requestFingerprint, "Bass calculation timed out \u2014 please retry.");
      setLastTerminalOutcome({ outcome: "timeout", fingerprint: requestFingerprint });
      setManualAnalysisRequest(null);
    }, WORKER_WATCHDOG_MS);
    return () => {
      if (workerWatchdogRef.current) {
        clearTimeout(workerWatchdogRef.current);
        workerWatchdogRef.current = null;
      }
    };
  }, [manualAnalysisRequest?.id, manualAnalysisRequest?.fingerprint, manualRequestMatchesCurrent, controller, scopeId, versionId]);

  // Once the authoritative raw response preparation has completed for the exact
  // submitted fingerprint, dispatch exactly one existing full optimiser run.
  // Geometry changes cannot reach this branch because they invalidate the
  // submitted identity above.
  useEffect(() => {
    if (!manualRequestMatchesCurrent || !manualAnalysisRequest) return;
    // PASS 1 — Problem A: Authoritative preparation failure must be terminal.
    // The authoritative engine is the sole preparation path on the manual
    // workflow. Its failure must immediately terminate the request, clear
    // calculating state, and surface a concise error. No stranded spinner.
    if (authoritative.status === "error") {
      if (timingTraceRef.current) timingTraceRef.current.mark("preparationFailMs");
      markBassAuthorityFailed(scopeId, versionId, cacheKey, authoritative.reason || "Bass analysis preparation failed");
      dispatchedManualRequestRef.current = null;
      // FIX 3: Authoritative preparation failure — terminal "error" state.
      setLastTerminalOutcome({ outcome: "error", fingerprint: cacheKey, message: authoritative.reason || "Bass analysis preparation failed" });
      setManualAnalysisRequest(null);
      return;
    }
    // Fingerprint mismatch: the calibration fingerprint changed between the
    // Calculate click and the simulation start (e.g. post-reflow seating or
    // source mutation). The authoritative simulation will never run for this
    // request — terminate immediately instead of sitting in "Preparing" until
    // the 90-second watchdog fires.
    if (authoritative.status === "idle") {
      if (timingTraceRef.current) timingTraceRef.current.mark("preparationFingerprintMismatchMs");
      markBassAuthorityFailed(scopeId, versionId, cacheKey, "Design changed during calculation. Recalculate to analyse the current layout.");
      dispatchedManualRequestRef.current = null;
      setLastTerminalOutcome({ outcome: "cancelled", fingerprint: cacheKey });
      setManualAnalysisRequest(null);
      return;
    }
    if (!inputsValid) return;
    if (dispatchedManualRequestRef.current === manualAnalysisRequest.id) return;

    // Clear the preparation watchdog — preparation is complete.
    if (preparationWatchdogRef.current) {
      clearTimeout(preparationWatchdogRef.current);
      preparationWatchdogRef.current = null;
    }
    if (timingTraceRef.current) timingTraceRef.current.mark("optimiserStartMs");
    dispatchedManualRequestRef.current = manualAnalysisRequest.id;
    controller.requestManual({
      fingerprint: cacheKey,
      payload,
      identity: requestIdentity,
      collectDiagnostics: manualAnalysisRequest.collectDiagnostics === true,
      force: true,
      diagnosticToken: manualAnalysisRequest.diagnosticToken || null,
      projectId: scopeId,
      versionId,
    });
  }, [
    controller,
    scopeId,
    manualAnalysisRequest,
    manualRequestMatchesCurrent,
    authoritative.status,
    authoritative.reason,
    inputsValid,
    cacheKey,
    payload,
    requestIdentity,
  ]);
  useEffect(() => () => {
    getP14TargetBackgroundScheduler().cancel();
    flushTargetCachePersistence(scopeId, versionId);
    controller.dispose();
    scopeRef.current?.clear();
  }, [controller, scopeId, versionId]);

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
      protocolVersion: matchingResult.protocolVersion,
      poolVersion: matchingResult.poolVersion,
      engineVersion: matchingResult.engineVersion,
      resultSchemaVersion: matchingResult.resultSchemaVersion,
      metricSchemaVersion: matchingResult.metricSchemaVersion,
      cacheKey,
      cacheSource: lifecycle.cacheRejectionReason ? "rejected-stale" : lifecycle.cacheStatus === "hit" ? "restored" : "fresh",
      cacheRejectionReason: lifecycle.cacheRejectionReason || null,
      calibrationFingerprint: calibrationFingerprint,
      heavyPoolReused,
      selectionDiagnostics: selected.selectionDiagnostics
        ? { ...selected.selectionDiagnostics, heavyPoolReused }
        : selected.selectionDiagnostics,
    };
    const canonicalResult = buildFinalOptimisedBassResponse({ optimisationResult: baseResult, selectedLayout: sources, roomResponseCurve: canonicalRoomResponseCurve, perSeatRawCurves });
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
      metricSchemaVersion: matchingResult.metricSchemaVersion || null,
    } : null;
    const finalOptimisedBassResponse = buildFinalOptimisedBassResponse({ optimisationResult: result, selectedLayout: sources, roomResponseCurve: canonicalRoomResponseCurve, perSeatRawCurves });
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
  // PASS 1: Mark authoritative preparation completion for timing diagnostics.
  useEffect(() => {
    if (!manualAnalysisRequest || !manualRequestMatchesCurrent) return;
    if (authoritative.status === "ready" && timingTraceRef.current && timingTraceRef.current.trace.authoritativeCompleteMs === null) {
      timingTraceRef.current.mark("authoritativeCompleteMs");
    }
  }, [authoritative.status, manualAnalysisRequest, manualRequestMatchesCurrent]);

  // FIX 7: Mark authoritativeStartMs when the authoritative simulation worker
  // actually starts (status transitions to "calculating"), not at button click.
  useEffect(() => {
    if (!manualAnalysisRequest || !manualRequestMatchesCurrent) return;
    if (authoritative.status === "calculating" && timingTraceRef.current && timingTraceRef.current.trace.authoritativeStartMs === null) {
      timingTraceRef.current.mark("authoritativeStartMs");
    }
  }, [authoritative.status, manualAnalysisRequest, manualRequestMatchesCurrent]);

  // PASS 1: Mark optimiser completion for timing diagnostics.
  useEffect(() => {
    if (!manualAnalysisRequest || !manualRequestMatchesCurrent) return;
    if (lifecycle.status === "ready" && lifecycle.resultFingerprint === cacheKey && timingTraceRef.current && timingTraceRef.current.trace.optimiserCompleteMs === null) {
      timingTraceRef.current.mark("optimiserCompleteMs");
    }
  }, [lifecycle.status, lifecycle.resultFingerprint, cacheKey, manualAnalysisRequest, manualRequestMatchesCurrent]);

  const publishedContractTokensRef = useRef(new Set());
  useEffect(() => {
    // #1: Do not publish/promote/sync while the project record is still
    // hydrating. A transient hydration target must not become current.
    // Also gate on targetKey: no P14 target selected → no optimisation, no
    // publish, no authority marking, no cache seeding.
    if (!isProjectHydrationReady || !targetKey) return;
    // [VR-CAPTURE] PRODUCER — temporary diagnostic, remove after verdict
    console.info("[VR-CAPTURE] PRODUCER", {
      projectId: scopeId,
      versionId: versionId,
      activeVersionId: appState?.activeVersionId ?? null,
      cacheKey: cacheKey,
      fingerprint: calibrationFingerprint,
    });
    // ── Cache hit: publish cached compact contract directly, skip optimiser ──
    // Two cases:
    // 1. Manual calculate for current target (manualRequestMatchesCurrent) —
    //    publish cache hit instead of running the optimiser.
    // 2. P14 target switch with no manual request (!manualAnalysisRequest) —
    //    hydrate the cached contract immediately so the UI shows the prepared
    //    result without recalculation. publishCachedCompactBassContract
    //    validates fingerprint + P14 identity, so a stale/wrong contract is
    //    never published.
    if (cachedContract && (manualRequestMatchesCurrent || !manualAnalysisRequest)) {
      // LIMITED cache hit: the requested P14 dBC is physically unattainable.
      // Publish as a LIMITED authority (not AUTHORITATIVE) so the UI can show
      // the P14 capability shortfall without running the optimiser again.
      if (isValidLimitedP14Contract(cachedContract)) {
        publishCachedLimitedBassContract(scopeId, versionId, cachedContract, cacheKey, requested);
        return;
      }
      // Stage 4: publish cached compact contract with full safety guards.
      // cacheKey = buildBassResultCacheKey(calibrationFingerprint) — the
      // expected full result fingerprint. requested = the selected P14 target
      // identity. publishCachedCompactBassContract rejects any contract that
      // doesn't match both, or lacks the graph payload, or isn't AUTHORITATIVE.
      publishCachedCompactBassContract(scopeId, versionId, cachedContract, cacheKey, requested);
      return;
    }
    // ── Authority already restored: no publish, no sync, no recalculation ──
    // When returning from a report route, the completed bass store already
    // holds the authoritative contract for this fingerprint. The controller
    // is skipped (authority-restored guard above), so no foreground optimiser
    // has run and contract.selectedCandidate is null. The shell contract object
    // itself is still non-null (useBassAnalysisContract always returns one),
    // so the active-result test is !contract?.selectedCandidate, not !contract.
    // Don't call syncPersistentBassAuthority with a shell contract — it would
    // needlessly rewrite the DB. The authority is already live.
    if (!contract?.selectedCandidate && fingerprints && hasAuthoritativeResult(scopeId, versionId, cacheKey)) {
      // ── Bridge restored authority into P14 target cache ────────────────
      // On a fresh reopen, the completed authority hydrates from DB but the
      // target cache may be empty (e.g. after a base-design fingerprint change
      // cleared it). Without the foreground target in the cache,
      // foregroundReadyPathA is false (cachedContract null) and
      // foregroundReadyPathB is false (controller skipped → no
      // optimisationResult). The scheduler cancels and 0/8 persists.
      //
      // The restored contract is already authoritative, graph-complete, and
      // P19-ready. Seed it into the target cache so cachedContract becomes
      // non-null on the next render, foregroundReadyPathA becomes true, and
      // the scheduler fills the remaining seven targets. Idempotent: after
      // seeding, cachedContract is non-null and the cache-hit branch above
      // handles subsequent renders, so this branch is never reached again.
      if (
        baseDesignFingerprint
        && targetKey
        && bassAuthorityHydrationSettled
        && completedBassAuthority?.authoritative
        && completedBassAuthority?.currentFingerprint === cacheKey
      ) {
        const restoredContract = getCompletedBassContract(scopeId, versionId);
        if (
          restoredContract
          && isAuthoritativeBassContract(restoredContract)
          && bassContractMatchesRequestedP14(restoredContract, requested)
        ) {
          setTargetCacheEntry(scopeId, versionId, baseDesignFingerprint, targetKey, restoredContract, { immediate: true });
        }
      }
      return;
    }
    if (!fingerprints) {
      // Subwoofer instances / project inputs may still be hydrating. Don't wipe
      // a valid hydrated authoritative result until the live fingerprint can be
      // evaluated and a mismatch confirmed.
      if (!hasAuthoritativeResult(scopeId, versionId)) {
        markBassAuthorityBlocked(scopeId, versionId);
      }
      return;
    }
    // #2: For error/updating state transitions, use cacheKey (the current
    // request fingerprint). Do NOT use contract.job.currentJobFingerprint —
    // that is the controller's in-flight fingerprint and may be stale/zombie.
    if (contract?.job?.status === "error") {
      const message =
        contract?.job?.errorMessage
        || lifecycle?.errorMessage
        || "Bass calculation could not be completed. Please try again.";
      markBassAuthorityFailed(scopeId, versionId, cacheKey, message);
      setLastTerminalOutcome({ outcome: "error", fingerprint: cacheKey, message });
      dispatchedManualRequestRef.current = null;
      setManualAnalysisRequest(null);
      return;
    }
    const jobComplete = contract?.job?.status === "complete" || contract?.job?.status === "ready";
    const p19Ready = hasReadyCanonicalP19Contract(contract);
    if (jobComplete && !p19Ready) {
      if (!hasAuthoritativeResult(scopeId, versionId, cacheKey)) {
        markBassAuthorityUpdating(scopeId, versionId, cacheKey);
      }
      return;
    }
    // FIX 4: publishCompletedBassContract returns true ONLY for authoritative
    // acceptance. A structurally complete but NOT_VERIFIED contract returns
    // false — treat that as a terminal rejected state, not success.
    const published = publishCompletedBassContract(scopeId, versionId, contract);
    if (published && timingTraceRef.current && timingTraceRef.current.trace.publicationMs === null) {
      timingTraceRef.current.mark("publicationMs");
    }
    if (!published) {
      // If the contract was structurally complete and P19-ready but
      // publication returned false, it is NOT_VERIFIED — terminal rejected.
      if (jobComplete && p19Ready) {
        if (timingTraceRef.current && timingTraceRef.current.trace.publicationMs === null) {
          timingTraceRef.current.mark("publicationMs");
        }
        setLastTerminalOutcome({ outcome: "rejected", fingerprint: cacheKey, message: "Bass calculation could not be verified." });
        dispatchedManualRequestRef.current = null;
        setManualAnalysisRequest(null);
      } else if (!hasAuthoritativeResult(scopeId, versionId, cacheKey)) {
        markBassAuthorityUpdating(scopeId, versionId, cacheKey);
      }
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
    const completedContract = getCompletedBassContract(scopeId, versionId);
    const resultFingerprint = completedContract?.job?.resultFingerprint || null;
    const canPersistCurrent = jobComplete
      && p19Ready
      && isAuthoritativeBassContract(completedContract)
      && bassContractMatchesRequestedP14(completedContract, requested)
      && !!resultFingerprint
      && !!cacheKey
      && resultFingerprint === cacheKey
      && hasGraphPayload(completedContract);
    if (canPersistCurrent) {
      syncPersistentBassAuthority(scopeId, versionId, resultFingerprint, completedContract);
    }
    // ── Stage 4 / #5: Foreground target enters family first ─────────────
    // After foreground publication succeeds, write the authoritative compact
    // contract to the 8-target family cache so the foreground target is also
    // a member of target_cache. The scheduler excludes the foreground target
    // from its background queue, so without this bridge the family would
    // contain only 7 targets. Gated on canPersistCurrent so only a fully
    // verified current foreground contract enters the family.
    if (published && baseDesignFingerprint && targetKey && canPersistCurrent) {
      setTargetCacheEntry(scopeId, versionId, baseDesignFingerprint, targetKey, completedContract, { immediate: true });
    }
    // Record contract-published ONLY when publishCompletedBassContract returned
    // true — not when authority is merely marked updating.
    const publishedToken = lifecycle?.result?.diagnosticToken || null;
    if (published && publishedToken && !publishedContractTokensRef.current.has(publishedToken)) {
      publishedContractTokensRef.current.add(publishedToken);
      recordDiagStage(publishedToken, "contract-published", { contractAnalysisId: contract?.analysisId || null, contractFingerprint: resultFingerprint });
    }
  }, [scopeId, versionId, cacheKey, contract, fingerprints, cachedContract, manualRequestMatchesCurrent, isProjectHydrationReady, baseDesignFingerprint, targetKey, bassAuthorityHydrationSettled]);

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
  const onCalculate = useCallback(
    ({ collectDiagnostics = false } = {}) => {
      if (!canCalculate) return { action: "blocked" };
      setColdReloadRecovered(false);
      const diagnosticToken = collectDiagnostics ? createDiagToken("manual-authoritative") : null;
      if (diagnosticToken) recordDiagStage(diagnosticToken, "token-created", { origin: "manual-authoritative", collectDiagnostics: true });

      // FIX 5: Foreground manual Calculate has priority. Pause the background
      // sweep WITHOUT destroying the batch — the queue and remaining targets
      // are preserved. After the manual calculation completes, the owner
      // calls resumeAfterForegroundCalculate() to restart the background sweep
      // from the remaining missing targets.
      getP14TargetBackgroundScheduler().pauseForForegroundCalculate();
      controller.cancelActive("manual-replaced");
      dispatchedManualRequestRef.current = null;
      markBassAuthorityUpdating(scopeId, versionId, cacheKey);
      const id = `manual-bass-${++manualRequestSequenceRef.current}`;
      // PASS 2: normalizedFingerprint removed — the authoritative simulation
      // now provides perSourceRspComplexTransfers directly. The cacheKey
      // (full calibration fingerprint) is the sole identity check.
      setManualAnalysisRequest({
        id,
        // fingerprint = full result/cache fingerprint for authority
        // and cache identity checks (manualRequestMatchesCurrent, watchdog,
        // controller.requestManual). This is calibration-based — the
        // optimiser correctly depends on P14 target identity.
        fingerprint: cacheKey,
        // calibrationFingerprint = BARE calibration fingerprint, retained
        // for diagnostic/identity purposes.
        calibrationFingerprint,
        // geometryFingerprint = BARE geometry fingerprint for the
        // authoritative room-physics hook (analysisRequestFingerprint).
        // Room physics is geometry-dependent only — a P14-only change
        // reuses the cached room response.
        geometryFingerprint,
        collectDiagnostics: collectDiagnostics === true,
        diagnosticToken,
      });
      // PASS 1: Start timing trace for this manual request.
      timingTraceRef.current = createManualBassTimingTrace(id, cacheKey);
      timingTraceRef.current.mark("acceptedAtMs");
      // FIX 7: authoritativeStartMs is marked when the authoritative worker
      // actually starts (see the effect below), not at button-click time.
      return { action: "queued", requestId: id, fingerprint: cacheKey };
    },
    [controller, scopeId, canCalculate, cacheKey, calibrationFingerprint, geometryFingerprint]
  );
  const onRetry = onCalculate;
  // Cancel handler: visible whenever a real active job exists. Terminates
  // the background controller's worker, clears the manual request, and sets
  // the terminal outcome to "cancelled". Does NOT mutate the design.
  const onCancel = useCallback(() => {
    if (!manualAnalysisRequest) return;
    controller.cancelActive("cancelled");
    dispatchedManualRequestRef.current = null;
    setLastTerminalOutcome({ outcome: "cancelled", fingerprint: manualAnalysisRequest.fingerprint });
    setManualAnalysisRequest(null);
  }, [controller, manualAnalysisRequest, scopeId, versionId, cacheKey]);
  // Clear terminal: clears the last terminal outcome and cold-reload flag so
  // the UI returns to a clean idle/complete state. Used by Retry/Clear buttons.
  const onClearTerminal = useCallback(() => {
    setLastTerminalOutcome(null);
    setColdReloadRecovered(false);
  }, []);
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
  // PATH A — EXISTING CACHED CURRENT TARGET:
  //   The cached contract itself is the proof that the foreground target is
  //   ready. We do NOT require completedBassAuthority.currentFingerprint ===
  //   cacheKey here because the publish effect promotes the cached contract
  //   asynchronously — requiring the store to already match would prevent
  //   the background scheduler from starting on the first render after a P14
  //   target switch (chicken-and-egg: scheduler needs foregroundReady, but
  //   foregroundReady needs the store to match, but the store is only updated
  //   by the publish effect which runs after render).
  const foregroundReadyPathA = isProjectHydrationReady
    && targetCacheHydrated
    && !!cachedContract
    && bassContractMatchesRequestedP14(cachedContract, requested)
    && !!cachedContract?.job?.resultFingerprint
    && cachedContract.job.resultFingerprint === cacheKey
    && (
      (isAuthoritativeBassContract(cachedContract)
        && hasGraphPayload(cachedContract))
      || isValidLimitedP14Contract(cachedContract)
    );
  const foregroundReadyPathB = isProjectHydrationReady
    && targetCacheHydrated
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

  // Publish one shared, non-acoustic lifecycle snapshot for the P14 selector
  // and Stage 2 gate. Counts come only from verified target-cache entries.
  // Timing evidence comes from completed real jobs; no countdown is invented.
  useEffect(() => {
    // FIX 1: "calculating" must mean real scheduler ownership. A partial
    // hydrated cache (e.g. 1/8) with no active scheduler work and no
    // foreground calculation must report "idle", not "calculating". Cache
    // incompleteness is not active calculation.
    const hydrationGated = !targetCacheHydrated || !baseDesignFingerprint || !bassAuthorityHydrationSettled;
    const basePatch = {
      baseDesignFingerprint,
      completed: targetFamilyProgress.resolved,
      total: targetFamilyProgress.total,
      completedDurationsMs: targetFamilyProgress.completedDurationsMs,
    };
    if (targetFamilyProgress.total > 0 && targetFamilyProgress.resolved >= targetFamilyProgress.total) {
      publishP14AnalysisProgress(scopeId, versionId, { ...basePatch, status: "complete", activeTargetKey: null, activeStartedAtMs: null });
      return;
    }
    if (hydrationGated) {
      publishP14AnalysisProgress(scopeId, versionId, { ...basePatch, status: "idle", activeTargetKey: null, activeStartedAtMs: null });
      return;
    }
    if ((lifecycle.status === "queued" || lifecycle.status === "calculating") && targetKey) {
      beginP14AnalysisJob(scopeId, versionId, { ...basePatch, targetKey });
      return;
    }
    // FIX 1: Fallthrough — partial cache with no foreground calculation.
    // Only preserve "calculating" if the scheduler genuinely owns a batch.
    // Preserve "retryable-partial" and "paused" statuses from the scheduler.
    // Otherwise publish "idle" — cache incompleteness is NOT active work.
    const scheduler = getP14TargetBackgroundScheduler();
    const currentProgress = getP14AnalysisProgress(scopeId, versionId);
    const currentStatus = currentProgress?.status;
    if (scheduler.hasActiveBatchWork()
      || currentStatus === "retryable-partial"
      || currentStatus === "paused") {
      // Scheduler owns the status or a terminal/paused status exists —
      // update counts only, preserve the scheduler's published status.
      publishP14AnalysisProgress(scopeId, versionId, basePatch);
    } else {
      publishP14AnalysisProgress(scopeId, versionId, { ...basePatch, status: "idle", activeTargetKey: null, activeStartedAtMs: null });
    }
  }, [scopeId, baseDesignFingerprint, targetKey, targetCacheHydrated, bassAuthorityHydrationSettled, targetFamilyProgress.resolved, targetFamilyProgress.total, targetDurationSignature, lifecycle.status]);

  // ── Live background worker-input readiness ──────────────────────────
  // Reflects the ACTUAL live payload needed by the background worker, NOT the
  // completed foreground authority. On cold restore, foregroundReadyPathA can
  // be true (restored authoritative Minimum L2) while the live rspRawCurve is
  // still []. Scheduling the background family with that premature designContext
  // sends rawCurve=[] to the worker, which correctly returns
  // generationStatus=invalid-inputs, missingInputs=["rawCurve"].
  // backgroundInputsReady gates scheduling until the live curve hydrates.
  const backgroundInputsReady = useMemo(
    () => isBackgroundInputsReady({ rspRawCurve, sources }),
    [rspRawCurve, sources],
  );
  const designContextRef = useRef(null);
  designContextRef.current = useMemo(() => ({
    payload, sources, usableLfHz: designEqSystemLimits?.usableLfHz,
    rspRawCurve, perSeatRawCurves,
    primarySeatIds: getScopedSeatIds(seatingPositions).primarySeatIds,
    fingerprints, fingerprintInputs,
  }), [payload, sources, designEqSystemLimits, rspRawCurve, perSeatRawCurves, seatingPositions, fingerprints, fingerprintInputs]);

  useEffect(() => {
    // FIX 2-5: Automatic P18 target preparation. The background P14 target
    // scheduler auto-starts when the foreground target is ready and missing
    // targets exist. It yields to higher-priority work (manual Calculate,
    // Improve Bass Response / Stage 2, recommendation) and resumes when
    // that work reaches a terminal state. Only missing targets run —
    // schedule() skips already-cached targets.
    const scheduler = getP14TargetBackgroundScheduler();

    // Explicit Retry request — bypass the retryable-partial guard.
    if (calcAllTargetsRequest?.requested && backgroundInputsReady && baseDesignFingerprint && scopeId !== "free") {
      consumeCalculateAllTargetsRequest();
      scheduler.schedule({
        projectId: scopeId,
        baseDesignFingerprint,
        foregroundTargetKey: targetKey,
        allTargets,
        designContext: designContextRef.current,
      });
      return;
    }

    // Don't auto-start during hydration or when inputs aren't ready.
    if (!foregroundReady || !backgroundInputsReady || !baseDesignFingerprint || scopeId === "free") {
      if (!scheduler.hasActiveBatchWork()) scheduler.cancel();
      return;
    }

    // FIX 5: Higher-priority work gate. When manual Calculate, Improve Bass
    // Response / Stage 2, or recommendation work is active, pause the
    // background sweep (soft pause — preserves the batch). Resume when the
    // higher-priority work reaches a terminal state.
    const higherPriorityActive = !!manualAnalysisRequest
      || heavyActionRunning
      || stage2Updating
      || recommendationsActive;

    if (higherPriorityActive) {
      if (scheduler.hasActiveBatchWork() && !scheduler.foregroundCalculateInProgress) {
        scheduler.pauseForForegroundCalculate();
      }
      return;
    }

    // Resume after higher-priority work ends.
    if (scheduler.foregroundCalculateInProgress) {
      scheduler.resumeAfterForegroundCalculate();
      return;
    }

    // FIX 6: Don't auto-start if retryable-partial — user must press Retry.
    const currentProgress = getP14AnalysisProgress(scopeId, versionId);
    if (currentProgress?.status === "retryable-partial") {
      return;
    }

    // FIX 3/H: All targets prepared — no scheduler work needed.
    if (targetFamilyProgress.total > 0 && targetFamilyProgress.resolved >= targetFamilyProgress.total) {
      if (scheduler.hasActiveBatchWork()) scheduler.cancel();
      return;
    }

    // FIX 2: Missing targets exist — auto-start the scheduler if not already
    // running for this fingerprint. schedule() skips cached targets, so only
    // missing targets run.
    if (scheduler.hasActiveBatchWork() && scheduler.currentBaseDesignFingerprint === baseDesignFingerprint) {
      return;
    }

    scheduler.schedule({
      projectId: scopeId,
      baseDesignFingerprint,
      foregroundTargetKey: targetKey,
      allTargets,
      designContext: designContextRef.current,
    });
  }, [scopeId, baseDesignFingerprint, targetKey, foregroundReady, backgroundInputsReady, manualAnalysisRequest, heavyActionRunning, stage2Updating, targetFamilyProgress.resolved, targetFamilyProgress.total, calcAllTargetsRequest, allTargets]);

  // ── Auto-calculate missing target on P14 switch (foreground priority) ──
  // When the user switches to a missing (uncached) target:
  //   a. While the background scheduler is running: auto-start a foreground
  //      calculation (promote to foreground priority). onCalculate() pauses
  //      the scheduler, the foreground calculation runs and publishes, then
  //      the resume effect (below) restarts the scheduler for remaining targets.
  //   b. On project reopen with a partial cache: auto-calculate the missing
  //      foreground target, then the scheduler fills the remaining targets.
  //   c. If the scheduler is already calculating this target (it was in the
  //      queue and the user switched to it): do nothing — the scheduler's job
  //      is reused, and the publish effect publishes the result when it completes.
  // Prevents duplicate jobs: at most one calculation per base fingerprint + target.
  // Declare this before the effect below because it is read in both the effect
  // body and dependency array. A later const declaration triggers a runtime TDZ.
  const calculationInProgress = !!manualAnalysisRequest
    && manualRequestMatchesCurrent
    && (
      dispatchedManualRequestRef.current !== manualAnalysisRequest.id
      || lifecycle.status === "queued"
      || lifecycle.status === "calculating"
    );
  const autoCalculatedKeyRef = useRef(null);
  useEffect(() => {
    if (!isProjectHydrationReady || !targetKey || !canCalculate) return;
    if (manualAnalysisRequest || calculationInProgress) return;
    if (cachedContract) return; // Already cached — publish effect handles it
    // A current Published Engineering Contract is already the foreground
    // authority. Its separate bridge effect may still be seeding the target
    // cache on this render; restoration must win that race and remain idle.
    if (completedContractMatches) return;
    // Only auto-calculate once per target key + base design fingerprint
    const autoKey = `${targetKey}|${baseDesignFingerprint}`;
    if (autoCalculatedKeyRef.current === autoKey) return;
    const scheduler = getP14TargetBackgroundScheduler();
    // c. Scheduler is already calculating this target — reuse the job
    if (scheduler.currentTarget?.key === targetKey) return;
    // a. Scheduler is running OR b. partial cache on reopen
    const hasPartialCache = targetFamilyProgress.resolved > 0
      && targetFamilyProgress.resolved < targetFamilyProgress.total;
    if (scheduler.hasActiveBatchWork() || hasPartialCache) {
      const result = onCalculate();
      if (result?.action === "queued") {
        autoCalculatedKeyRef.current = autoKey;
      }
    }
  }, [isProjectHydrationReady, targetKey, canCalculate, manualAnalysisRequest, calculationInProgress, cachedContract, completedContractMatches, targetFamilyProgress.resolved, targetFamilyProgress.total, baseDesignFingerprint, onCalculate]);

  // #1: While the project record is still hydrating, do not present a
  // transitional completed contract as the effective contract — P14 target
  // identity may still be in pre-hydration/default/transitional state.
  // Show cached contract on BOTH manual calculate (manualRequestMatchesCurrent)
  // AND P14 target switch (!manualAnalysisRequest). This gives the UI the
  // cached contract on the FIRST render after a target switch — before the
  // publish effect has promoted it to the live authority store.
  const visibleCachedContract = (manualRequestMatchesCurrent || !manualAnalysisRequest) ? cachedContract : null;
  // ── Published Engineering Contract lifecycle ──────────────────────────
  // The graph must obey the SAME lifecycle as RP22, ADI, and Design Rating:
  // it must never leave the Published Engineering Contract while it remains
  // the published authority. The live `contract` from useBassAnalysisContract
  // is always a non-null object (even during calculation), so the previous
  // `|| contract ||` fallback prevented the published `completedContract`
  // from ever being selected. This left the graph as the only consumer that
  // abandoned the published contract during UPDATE/CANCEL/REFRESH/REOPEN.
  //
  // Priority: visibleCachedContract (P14 cache hit) → authoritative live
  // contract (fresh calculation complete) → published contract (previous
  // result, remains visible during UPDATE) → non-authoritative live contract
  // (final fallback for lifecycle status only).
  const authoritativeLiveContract = isAuthoritativeBassContract(contract) ? contract : null;
  const effectiveContract = isProjectHydrationReady
    ? (visibleCachedContract || authoritativeLiveContract || (hasPublishedContract ? completedContract : null) || contract)
    : null;
  // Restoration status: when the published contract is the effective contract
  // (no cached/live authoritative contract), show COMPLETE if the published
  // contract is current (fingerprint matches), or UPDATING if the design
  // changed (fingerprint mismatch). The published result remains visible in
  // both cases — only the status reflects whether recalculation is needed.
  const showingPublishedContract = isProjectHydrationReady
    && !!effectiveContract
    && !visibleCachedContract
    && !authoritativeLiveContract
    && hasPublishedContract;
  const effectiveDetailedStatus = showingPublishedContract
    ? (publishedContractIsStale ? "UPDATING" : "COMPLETE")
    : detailedStatus;
  // ── Stage 3: Finished graph restore from published contract ──────────
  // Restoration: the finished graph is restored from the published contract's
  // graphPayload whenever no live optimisation result exists. No live
  // fingerprint comparison — the published contract is the engineering truth
  // and may be displayed regardless of whether the design has changed. The
  // live fingerprint determines recalculation, not graph restoration.
  const cachedGraphOptimisationResult = useMemo(() => {
    if (!isProjectHydrationReady || !effectiveContract || !isAuthoritativeBassContract(effectiveContract) || !hasGraphPayload(effectiveContract)) return null;
    return buildFinishedGraphOptimisationResult(effectiveContract);
  }, [isProjectHydrationReady, effectiveContract]);
  // The published contract is the engineering truth. Prefer its finished graph
  // payload over any leftover live optimiser object; the latter may belong to a
  // previously selected target and must not suppress the current published graph.
  const effectiveOptimisationResult = cachedGraphOptimisationResult || optimisationResult;
  // PASS 1: User-facing phase states. Replaces the single ambiguous
  // long-running message with a small number of useful phases:
  //   "Preparing bass response…"  — authoritative simulation running
  //   "Optimising bass performance…" — optimiser worker running
  //   "Finalising results…" — publication/fingerprint validation
  // No worker names, calculation counts, frequency samples, or implementation
  // detail. The designer remains interactive throughout.
  const calculationPhase = !calculationInProgress ? null
    : dispatchedManualRequestRef.current !== manualAnalysisRequest.id
      ? "preparing"   // Authoritative simulation in flight
      : lifecycle.status === "queued" || lifecycle.status === "calculating"
        ? "optimising" // Optimiser worker in flight
        : "finalising"; // Publication / fingerprint validation
  const calculationPhaseLabel = calculationPhase === "preparing"
    ? BASS_LIFECYCLE_COPY[BASS_LIFECYCLE_STATE.PREPARING]
    : calculationPhase === "optimising"
      ? BASS_LIFECYCLE_COPY[BASS_LIFECYCLE_STATE.SEARCHING]
      : calculationPhase === "finalising"
        ? BASS_LIFECYCLE_COPY[BASS_LIFECYCLE_STATE.VALIDATING]
        : null;

  // PASS 1: When calculation is no longer in progress, mark the timing trace
  // as complete and clear the trace ref. This fires on every terminal path:
  // complete, error, cancelled, stale, or timeout.
  useEffect(() => {
    if (!manualAnalysisRequest && timingTraceRef.current) {
      if (timingTraceRef.current.trace.calculatingClearedMs === null) {
        timingTraceRef.current.mark("calculatingClearedMs");
        timingTraceRef.current.finish();
      }
      timingTraceRef.current = null;
    }
  }, [manualAnalysisRequest]);
  const hasCurrentResult = completedBassAuthority?.authoritative === true
    && !!completedBassAuthority?.contract;
  const hasPublishedCurrentDesign = completedBassAuthority?.authorityStatus === BASS_AUTHORITY_STATUS.AUTHORITATIVE
    && completedBassAuthority?.contract?.job?.resultFingerprint === cacheKey;

  // FIX 3: Explicit success terminal — clear the manual request only after
  // the completed contract becomes the current authoritative result and the
  // calculation is no longer in progress. Do not derive "finished" merely
  // because the optimiser became ready.
  useEffect(() => {
    if (!manualAnalysisRequest || !manualRequestMatchesCurrent) return;
    if (hasPublishedCurrentDesign && !calculationInProgress) {
      if (timingTraceRef.current && timingTraceRef.current.trace.publicationAcceptedMs === null) {
        timingTraceRef.current.mark("publicationAcceptedMs");
      }
      setLastTerminalOutcome({ outcome: "success", fingerprint: cacheKey });
      setManualAnalysisRequest(null);
    }
  }, [manualAnalysisRequest, manualRequestMatchesCurrent, hasPublishedCurrentDesign, calculationInProgress, cacheKey]);

  // FIX 5: After the foreground manual Calculate completes (manualAnalysisRequest
  // cleared), resume the background P14 sweep if it was paused for the manual
  // calculation. The background scheduler's queue and remaining targets were
  // preserved by pauseForForegroundCalculate() — this restarts the sweep from
  // the missing targets without recalculating verified ones.
  useEffect(() => {
    if (manualAnalysisRequest) return;
    const scheduler = getP14TargetBackgroundScheduler();
    if (scheduler.foregroundCalculateInProgress) {
      scheduler.resumeAfterForegroundCalculate();
    }
  }, [manualAnalysisRequest]);

  // FIX 2: Explicit terminal calculation outcome. Distinguishes success,
  // error, timeout, cancelled, stale, and rejected — never implies success
  // merely because the button returned to idle.
  // When a valid cached contract exists for the current target (P14 target
  // switch with no manual request), the outcome is "success" immediately —
  // do not wait for the publish effect to promote the cached contract to the
  // live authority store. This prevents a transient "stale" / "idle" flash
  // when switching to a prepared target.
  const hasValidCachedContractForOutcome = !calculationInProgress
    && !!cachedContract
    && !manualAnalysisRequest
    && bassContractMatchesRequestedP14(cachedContract, requested)
    && cachedContract?.job?.resultFingerprint === cacheKey
    && (isAuthoritativeBassContract(cachedContract) || isValidLimitedP14Contract(cachedContract));
  const calculationOutcome = calculationInProgress
    ? calculationPhase  // "preparing" | "optimising" | "finalising"
    : (hasValidCachedContractForOutcome ? "success"
        : (completedBassAuthority?.authorityStatus === "STALE" ? "stale"
          : (lastTerminalOutcome?.outcome
            || (completedBassAuthority?.authorityStatus === "AUTHORITATIVE" ? "success"
              : completedBassAuthority?.authorityStatus === "LIMITED" ? "success"
              : completedBassAuthority?.authorityStatus === "ERROR" ? "error"
              : completedBassAuthority?.authorityStatus === "NOT_VERIFIED" ? "rejected"
              : "idle"))));
  // Unified lifecycle state — the single lifecycle consumed by all visible
  // Bass surfaces. Maps the existing split-state model into one canonical
  // state with plain-language copy.
  // Workflow status from optimiseWorkflowStore — feeds the PUBLISHING state
  // into the unified lifecycle so bassCalculationLifecycle owns it.
  const workflowStatus = useOptimiseWorkflowState(scopeId, versionId)?.status || "idle";
  const bassLifecycleState = resolveBassLifecycleState({
    calculationInProgress,
    calculationPhase,
    calculationOutcome,
    authorityStatus: completedBassAuthority?.authorityStatus,
    workflowStatus,
  });
  const terminalMessage = coldReloadRecovered && !calculationInProgress
    ? BASS_COLD_RELOAD_RECOVERY_COPY
    : bassLifecycleState === BASS_LIFECYCLE_STATE.TIMED_OUT
      ? BASS_LIFECYCLE_COPY[BASS_LIFECYCLE_STATE.TIMED_OUT]
      : bassLifecycleState === BASS_LIFECYCLE_STATE.FAILED
        ? (lastTerminalOutcome?.message || BASS_LIFECYCLE_COPY[BASS_LIFECYCLE_STATE.FAILED])
        : bassLifecycleState === BASS_LIFECYCLE_STATE.CANCELLED
          ? BASS_LIFECYCLE_COPY[BASS_LIFECYCLE_STATE.CANCELLED]
          : bassLifecycleState === BASS_LIFECYCLE_STATE.STALE_NEEDS_RECALCULATION
            ? BASS_LIFECYCLE_COPY[BASS_LIFECYCLE_STATE.STALE_NEEDS_RECALCULATION]
            : null;

  // Single P19 seat authority instance for every Room Designer consumer.
  const p19SeatAuthority = useMemo(() => {
    const { primarySeatIds, secondarySeatIds } = getScopedSeatIds(seatingPositions);
    return summariseAuthoritativeP19Seats({
      authoritativeSeatResults: completedBassAuthority?.contract?.bassResult?.seatResults?.P19 || [],
      primarySeatIds,
      secondarySeatIds,
      seatingPositions,
    });
  }, [completedBassAuthority?.contract?.bassResult?.seatResults?.P19, seatingPositions]);

  const value = scopeRef.current.replace({ scopeId, contract: effectiveContract, lifecycle, selectedPriorityMode, optimisationResult: effectiveOptimisationResult, fingerprint: calibrationFingerprint, cacheKey, payload, inputsValid, detailedStatus: effectiveDetailedStatus, detailedError: lifecycle.errorMessage, onPriorityChange: null, onCalculate, onRetry, onCancel, onClearTerminal, canCalculate, calculationInProgress, calculationPhaseLabel, calculationOutcome, bassLifecycleState, terminalMessage, hasCurrentResult, authoritative: sharedAuthoritative, completedBassAuthority, seatingPositions, p19SeatAuthority, p14FamilyProgress: targetFamilyProgress });
  return <BassResultsProvider value={value}>{children}</BassResultsProvider>;
}