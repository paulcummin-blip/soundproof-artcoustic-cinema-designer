// OptimiseAndCalculate.jsx
// Unified Optimise & Calculate workflow component.
//
// Replaces the separate "Calculate Parameter Results" + "Improve Bass Response"
// buttons with a single "OPTIMISE & CALCULATE" button that internally:
//   1. Runs the initial authoritative bass calculation (hidden)
//   2. Runs the V2 bass optimisation (phase, delay, gain, placement, seating)
//   3. Auto-applies calibration improvements (phase, delay, gain, global bass trim)
//   4. Recalculates using the optimised system
//   5. Publishes the final authoritative RP22 results
//
// The user sees a simple progress display. After completion, a single ADI
// Recommendation presents one coherent engineering action with an Apply button.
//
// The existing engineering workflow (Calculate + Improve Bass Response V2) is
// retained behind an Advanced Diagnostics toggle.

import { unstable_batchedUpdates } from "react-dom";
import { clone, stable, electronicContextFromUi, physicalContext, prepareElectronicCandidate, settingsEqual,
  changedSettings, resultLevels, comparisonReceipt, executeElectronicTransaction } from "./electronicApplication.js";
import { withElectronicPersistence } from "./electronicPersistence.js";
import { resolveCalibrationAutoApply } from "./adiCalibrationAutoApplyAuthority.js";
import { validateCandidateForRun, canonicalLevel } from "../improveBassV2/confirmedCandidateValidity.js";
import { recommendationResultMatches, recommendationSettingsMatch } from "./crossoverApplicationVerification.js";
import { extractAuthorityForComparison } from "../improveBassV2/currentAuthorityComparison.js";
import WhatAdiDid from "./WhatAdiDid.jsx";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { resolveCrossoverReceiptState } from "./crossoverReceiptState.js";
import { useOptimiserPlanAuthority } from "../optimiserPlan/optimiserPlanStore.js";
import { useLatestOptimiserRun } from "../optimiserPlan/optimiserRunAuthority.js";
import { useSyncExternalStore } from "react";
import { Sparkles, CheckCircle2, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { useSharedBassResults } from "../bassResultsStore";
import { capturePublicationTrace } from "../publicationTraceStore";
import { useActiveProjectId } from "@/components/state/project-session";
import { getStage2State, subscribeStage2 } from "../stage2/stage2PlacementStore";
import { getImproveBassV2State, useImproveBassV2State, requestCancel, resetImproveBassV2 } from "../improveBassV2/improveBassV2Store";
import { cancelBassHeavyAction, useBassHeavyAction } from "../bassHeavyActionStore";
import { buildStageDisplay } from "../improveBassV2/improveBassV2StageMapping";
import {
  useOptimiseWorkflowState,
  startWorkflow,
  setOptimising,
  setApplying,
  setRecalculating,
  setPublishing,
  setComplete,
  setWorkflowError,
  setCancelled,
  resetWorkflow,
} from "./optimiseWorkflowStore";
import {
  runOptimisation,
  buildAutoApplySummary,
  hasPhysicalRecommendations,
} from "./optimiseWorkflowOrchestrator";
import { resolveCalibrationApplicationPlan } from "./adiCalibrationCandidateSelection.js";
import { applyCalibrationTuning } from "../improveBassV2/improveBassV2ApplyCalibration.js";
import { publishRecommendation } from "@/components/recommendationEngine";
import { DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W } from "@/components/utils/subwooferCapability";
import { buildAuthoritativeRspPosition } from "../authoritativeRspPosition";
import AdiRecommendation from "./AdiRecommendation";
import ResetSubwooferTuningButton from "./ResetSubwooferTuningButton";
import CrossoverRecommendation from "./CrossoverRecommendation";
import useRunOptimisationPlan from "./useRunOptimisationPlan";
import { BASS_LIFECYCLE_STATE, BASS_LIFECYCLE_COPY, canCancelBassCalculation } from "../bassCalculationLifecycle";
import {
  computeAppliedCalibrationBasisFingerprint,
} from "../appliedCalibrationAuthority/appliedCalibrationAuthority.js";
import {
  getAppliedCalibrationAuthority,
} from "../appliedCalibrationAuthority/appliedCalibrationAuthorityStore.js";
import {
  createRecommendation,
  RECOMMENDATION_INTENT,
} from "../recommendationAuthority/recommendationAuthority.js";
import {
  setRecommendation,
} from "../recommendationAuthority/recommendationAuthorityStore.js";
import {
  acceptRecommendation,
} from "../recommendationAuthority/acceptTransition.js";
import { runEngineeringDecisionModel } from "@/components/adi";
import { buildAdiBassEvidence } from "@/components/adi/adiBassEvidenceBuilder";
import { buildOptimiserPlan } from "@/components/room/bass/optimiserPlan/buildOptimiserPlan.js";
import { buildOptimiserResultForSave } from "@/components/room/bass/optimiserPlan/optimiserPlanSave.js";
import { buildOptimiserRunEvidence } from "@/components/room/bass/optimiserPlan/buildOptimiserRunEvidence.js";
import { resolveCanonicalTerminalOutcome } from "@/components/room/bass/optimiserPlan/resolveCanonicalTerminalOutcome.js";
import {
  getOptimiserPlanAuthority,
  setOptimiserPlanAuthority,
} from "@/components/room/bass/optimiserPlan/optimiserPlanStore.js";
// ONE shared run-identity authority for BOTH entry routes (Run ADI Again and
// Re-test Bass Optimisation). The Re-test route (runCalibrationAutoApply →
// handleStart) must mint the same run identity the Run ADI Again route mints
// (useRunOptimisationPlan → beginOptimiserRun), so every saved plan/evidence,
// save acknowledgement and run history row carries a non-null runId regardless
// of entry button, winner or terminal outcome.
import { beginOptimiserRun, getLatestOptimiserRun } from "@/components/room/bass/optimiserPlan/optimiserRunAuthority.js";
import { persistOptimiserRunHistory, updateOptimiserRunHistoryPublication } from "@/components/room/bass/optimiserPlan/optimiserRunHistory.js";
import {
  RUN_TIMING,
  beginRunTimings,
  buildPersistedRunTimings,
  getRunTimings,
  recordRunTiming,
  runTimingAt,
} from "@/components/room/bass/optimiserPlan/optimiserRunTimings.js";
import { summariseElectronicStageBreakdown } from "@/components/room/bass/electronicSafety/electronicTimingLedger.js";
import { OPTIMISER_FAILURE_STATUS, OPTIMISER_LEVER } from "@/components/room/bass/optimiserPlan/optimiserPlanConstants.js";
import { resolveOptimisationPlanRunBlock } from "@/components/room/bass/optimiserPlan/resolveAdiOptimiserJourney.js";
import { resolveP14TargetSelectionState } from "../p14TargetSelectionState";
import { canReuseCurrentBaselineForOptimiser } from "./retestPreflightAuthority.js";

const SLEEP_MS = 100;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hasPublishedCurrentDesign = (shared) =>
  shared?.completedBassAuthority?.authorityStatus === "AUTHORITATIVE"
  && shared?.completedBassAuthority?.contract?.job?.resultFingerprint === shared?.cacheKey;

// A preserved old contract is not completion. If the foreground job has ended
// without publishing the current fingerprint, fail rather than wait forever.
async function waitForCurrentPublication(sharedRef, phaseRef) {
  let noActiveJobSince = null;
  while (true) {
    await sleep(SLEEP_MS);
    const current = sharedRef.current;
    if (!current?.calculationInProgress && hasPublishedCurrentDesign(current)) return true;
    if (phaseRef.current === "cancelled") return false;
    if (!current?.calculationInProgress) {
      if (["error", "timeout", "rejected"].includes(current?.calculationOutcome)) {
        throw new Error(current?.terminalMessage || "Bass calculation ended without publishing a result.");
      }
      noActiveJobSince ??= Date.now();
      if (Date.now() - noActiveJobSince > 30000) {
        const contract = current?.contract;
        capturePublicationTrace({
          effectPhase: "publication-wait-expired",
          firstGuard: "no active calculation and no current publication after 30s",
          cacheKey: current?.cacheKey,
          manualRequestFingerprint: null,
          lifecycleStatus: current?.lifecycle?.status,
          lifecycleResultFingerprint: current?.lifecycle?.resultFingerprint,
          lifecycleCurrentJobFingerprint: current?.lifecycle?.currentJobFingerprint,
          workerStatus: current?.lifecycle?.workerStatus,
          activeJobId: current?.lifecycle?.activeJobId,
          calculationInProgress: current?.calculationInProgress,
          calculationOutcome: current?.calculationOutcome,
          lastTerminalOutcome: current?.terminalMessage,
          contractJobStatus: contract?.job?.status,
          contractJobResultFingerprint: contract?.job?.resultFingerprint,
          contractJobCurrentJobFingerprint: contract?.job?.currentJobFingerprint,
          contractJobMetricSchemaVersion: contract?.job?.metricSchemaVersion,
          contractVersion: contract?.version,
          contractMetricSchemaVersion: contract?.metricSchemaVersion,
          hasSelectedCandidate: !!contract?.selectedCandidate,
          hasSelectedCandidateId: !!contract?.selectedCandidateId,
          hasP14Parameter: !!contract?.productAnalysis?.parameters?.p14,
          hasP18Parameter: !!contract?.productAnalysis?.parameters?.p18,
          p19Status: contract?.productAnalysis?.parameters?.p19?.status,
          p20Status: contract?.productAnalysis?.parameters?.p20?.status,
          authorityStatus: current?.completedBassAuthority?.authorityStatus,
          completedResultFingerprint: current?.completedBassAuthority?.contract?.job?.resultFingerprint,
          publishRan: false,
          syncRan: false,
        });
        throw new Error("Bass calculation ended without publishing the current design. Retry the update.");
      }
    } else {
      noActiveJobSince = null;
    }
  }
}

// Confirmed values are absolute effective tuning, including baseline alignment.
// Reuse the existing calibration boundary so the normal engine does not add
// automatic alignment a second time. Accept Transition owns the authority write.
function applyRecommendationToInstances(instances, values) {
  if (!Array.isArray(instances) || !Array.isArray(values)) return instances;
  return applyCalibrationTuning(instances, values.map((value) => ({
    ...value,
    sourceId: value.id,
  })));
}

export default function OptimiseAndCalculate({
  roomDims,
  seatingPositions,
  subwooferInstances,
  frontSubsCfg,
  rearSubsCfg,
  commitInstances,
  commitSeating,
  commitSeatingProvenance,
  appliedSeatingProvenance,
  hasCanonicalInstances,
  appState,
  amplifierPowerPerSubW,
  disabled,
  hasResults = false,
  registerRecalculate = null,
}) {
  const projectId = useActiveProjectId();
  const versionId = appState?.activeVersionId || null;
  const shared = useSharedBassResults();
  const workflowState = useOptimiseWorkflowState(projectId, versionId);
  const v2State = useImproveBassV2State(projectId, versionId);
  const stage2 = useSyncExternalStore(
    subscribeStage2,
    () => getStage2State(projectId, versionId),
    () => getStage2State(projectId, versionId),
  );
  const heavyAction = useBassHeavyAction(projectId, versionId);

  const runningRef = useRef(false);
  const phaseRef = useRef("idle"); // tracks which phase we're in to avoid double-trigger
  // Optimisation Plan runs are evidence-only and tracked separately from the
  // full auto-applying workflow, so the two never share a busy flag.
  // (Owned by useRunOptimisationPlan below.)
  const adiDecisionRef = useRef(null); // ADI reasoning output for the completed optimisation

  // Refs for live values that must be read during the async orchestration.
  // The `shared` context value is replaced on every state change, so the
  // closure captured at handleStart time would be stale. These refs are
  // updated on every render so the async loop always reads the latest.
  const sharedRef = useRef(shared);
  sharedRef.current = shared;
  const subInstancesRef = useRef(subwooferInstances);
  subInstancesRef.current = subwooferInstances;

  // ── Check if a subwoofer model is active ──
  const hasActiveSubModel = React.useMemo(() => {
    const instances = Array.isArray(subwooferInstances) ? subwooferInstances : [];
    return instances.some((i) => i?.enabled !== false && i?.model);
  }, [subwooferInstances]);

  const resolvedAmplifierPowerPerSubW = Number.isFinite(Number(amplifierPowerPerSubW))
    ? Number(amplifierPowerPerSubW)
    : Number.isFinite(Number(appState?.splConfig?.subwooferAmplifierPowerW))
      ? Number(appState.splConfig.subwooferAmplifierPowerW)
      : DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W;


  const liveElectronicRef=useRef(null);
  liveElectronicRef.current={projectId,versionId,shared,appState,subwooferInstances,roomDims,seatingPositions,
    frontSubsCfg,rearSubsCfg,amplifierPowerPerSubW:resolvedAmplifierPowerPerSubW};
  const performElectronicUpdate=async receipt=>{
    const before=receipt.before,after=receipt.after;
    return withElectronicPersistence(projectId,versionId,async io=>{
      if(!settingsEqual(await io.readback(),before))throw new Error("The saved starting settings changed. Run ADI again.");
      const guard=()=>{
        const live=liveElectronicRef.current;
        if(!io.current() || live.projectId!==projectId || live.versionId!==versionId || phaseRef.current==="cancelled")return false;
        const context=electronicContextFromUi(live);
        return stable(physicalContext(context))===stable(receipt.physicalContext) &&
          (settingsEqual({instances:live.subwooferInstances,crossover:live.appState?.splConfig?.crossover},before) ||
           settingsEqual({instances:live.subwooferInstances,crossover:live.appState?.splConfig?.crossover},after));
      };
      const commit=(settings,record)=>{
        if(!io.current())return;
        const liveSettings={instances:liveElectronicRef.current.subwooferInstances,crossover:liveElectronicRef.current.appState?.splConfig?.crossover};
        if(!settingsEqual(liveSettings,before) && !settingsEqual(liveSettings,after))return;
        unstable_batchedUpdates(()=>{
          commitInstances(settings.instances);
          liveElectronicRef.current.appState.updateGlobalSpl({crossover:settings.crossover,bassAdiReceipt:record});
        });
      };
      const verify=async(settings,restoring=false)=>{
        phaseRef.current="recalculating";setRecalculating(projectId,versionId);
        const start=Date.now();
        // Wait for the complete state update and its new calculation identity.
        while(Date.now()-start<15000){
          if(!io.current())return false;
          const live=liveElectronicRef.current;
          if(settingsEqual({instances:live.subwooferInstances,crossover:live.appState?.splConfig?.crossover},settings))break;
          await sleep(50);
        }
        const live=sharedRef.current;
        if(typeof live?.onCalculate!=="function")return false;
        live.onCalculate();
        if(!(await waitForCurrentPublication(sharedRef,phaseRef)))return false;
        const state=sharedRef.current;
        const expected=restoring?receipt.beforeResult:receipt.expectedResult;
        const tuning=settings.instances.filter(s=>s.enabled!==false).map(s=>({
          sourceId:s.id,delayMs:s.delayMs??0,gainDb:s.gainDb??0,
          phaseControlDeg:s.phaseControlDeg??s.phaseAdjust??0,polarity:s.polarity,
        }));
        if(!recommendationSettingsMatch(state.authoritative,{crossover:settings.crossover,tuning}) ||
           !recommendationResultMatches(state.completedBassAuthority,expected))return false;
        return {fingerprint:state.cacheKey,levels:resultLevels(extractAuthorityForComparison(state.completedBassAuthority))};
      };
      return executeElectronicTransaction({before,after,receipt,persist:io.persist,readback:io.readback,commit,verify,guard});
    });
  };
  const restoreElectronicSettings=async()=>{
    const receipt=liveElectronicRef.current.appState?.splConfig?.bassAdiReceipt;
    if(!receipt?.before || !receipt?.after || isBusy)return;
    try{
      phaseRef.current="applying";setApplying(projectId,versionId);
      await performElectronicUpdate({...receipt,operation:"restore",runId:receipt.runId+":restore",
        before:receipt.after,after:receipt.before,beforeResult:receipt.expectedResult,expectedResult:receipt.beforeResult,
        beforeLevels:receipt.afterLevels,changes:changedSettings(receipt.after,receipt.before)});
      setComplete(projectId,versionId,{},null,false);
    }catch(error){setWorkflowError(projectId,versionId,error.message);}
    finally{phaseRef.current="idle";}
  };

  const bassActionDisabled = disabled
    || !hasActiveSubModel
    || shared?.canCalculate !== true;

  const isBusy = ["calculating", "optimising", "applying", "recalculating", "publishing"].includes(workflowState.status);
  // Unified calculation state: a real calculation may be in progress even
  // when the workflow store is idle (background auto-calculate). Cancel must
  // be visible whenever a real active job exists.
  const isCalculating = isBusy || shared?.calculationInProgress === true;
  const bassLifecycleState = shared?.bassLifecycleState || BASS_LIFECYCLE_STATE.IDLE;

  // Why the ADI Optimisation Plan cannot run against the current design.
  // null = it can run. Every reason carries its own next step, so the journey
  // card is never a dead end.
  const optimisationRunBlockReason = React.useMemo(() => {
    const p14Selection = resolveP14TargetSelectionState(appState?.splConfig || null);
    return resolveOptimisationPlanRunBlock({
      hasActiveSubModel,
      hasCanonicalInstances,
      // A published result proves a target was selected; only an uncalculated
      // design can be missing its target.
      targetSelected: shared?.hasCurrentResult === true ? true : !p14Selection.noP14TargetSelected,
      authorityStatus: shared?.completedBassAuthority?.authorityStatus || null,
      needsRecalculation: bassLifecycleState === BASS_LIFECYCLE_STATE.STALE_NEEDS_RECALCULATION,
      calculationInProgress: shared?.calculationInProgress === true,
      lastOutcome: shared?.calculationOutcome || null,
      errorMessage: shared?.terminalMessage || null,
      canCalculate: shared?.canCalculate === true,
      hasCurrentResult: shared?.hasCurrentResult === true,
    });
  }, [
    hasActiveSubModel, hasCanonicalInstances, appState?.splConfig,
    shared?.hasCurrentResult, shared?.completedBassAuthority?.authorityStatus,
    bassLifecycleState, shared?.calculationInProgress, shared?.calculationOutcome,
    shared?.terminalMessage, shared?.canCalculate,
  ]);

  // The ADI journey action — evidence only, never applies a lever.
  const { runOptimisationPlan, planRunStatus, planRunError } = useRunOptimisationPlan({
    projectId,
    versionId,
    sharedRef,
    subInstancesRef,
    phaseRef,
    roomDims,
    seatingPositions,
    frontSubsCfg,
    rearSubsCfg,
    amplifierPowerPerSubW: resolvedAmplifierPowerPerSubW,
    appState,
    hasCanonicalInstances,
    waitForCurrentPublication,
  });
  const savedJointPlan = useOptimiserPlanAuthority(projectId, versionId);
  const latestJointRun = useLatestOptimiserRun(projectId, versionId);
  const [jointOperation, setJointOperation] = useState(null);
  const jointReceiptState = resolveCrossoverReceiptState({
    record: appState?.splConfig?.crossoverRecommendation, plan: savedJointPlan,
    latestRun: latestJointRun, versionId, projectId, fingerprint: shared?.cacheKey,
    operation: jointOperation, runStatus: planRunStatus,
    calculationInProgress: shared?.calculationInProgress,
  });
  // hasActiveJob: composite of independent job-tracking signals (not an alias
  // of isBusy or calculationInProgress). Observes whether ANY real cancellable
  // job exists right now — background calculation, V2 optimiser, or heavy action.
  const hasActiveJob = Boolean(
    shared?.calculationInProgress
    || v2State?.status === "running"
    || v2State?.status === "awaiting_stage2"
    || heavyAction?.status === "requested"
    || heavyAction?.status === "running"
  );
  // A current bass publication can coexist with a running evidence-only plan.
  // Its active jobs use the same cancel handler even though bass itself is complete.
  const canCancel = canCancelBassCalculation(bassLifecycleState, hasActiveJob)
    || (planRunStatus === "running" && hasActiveJob);
  const isTimedOut = bassLifecycleState === BASS_LIFECYCLE_STATE.TIMED_OUT && !isCalculating;
  // Stale: published result exists but the subwoofer design has changed.
  // The designer must see "Update Bass Performance" — not be forced back to
  // Choose Starting Layout.
  const isStale = bassLifecycleState === BASS_LIFECYCLE_STATE.STALE_NEEDS_RECALCULATION;

  // Why the calibration apply action cannot run yet. These are the SAME gates
  // the workflow itself enforces, stated before the press — so pressing it can
  // never be a silent no-op. Null = it can run.
  const reoptimiseDisabledReason = !hasActiveSubModel
    ? "Select a subwoofer model and quantity before optimising."
    : shared?.canCalculate !== true
      ? "The bass calculation is not ready for this design yet. Let the design settle, then try again."
      : null;

  // ── Main orchestration: triggered by the OPTIMISE & CALCULATE button ──
  const handleStart = useCallback(async () => {
    if (runningRef.current) return;
    if (bassActionDisabled || !hasCanonicalInstances) return;

    runningRef.current = true;
    phaseRef.current = "calculating";
    startWorkflow(projectId, versionId);

    // ── RUN IDENTITY — ONE AUTHORITY FOR BOTH ENTRY ROUTES ──
    // The Re-test Bass Optimisation route (runCalibrationAutoApply → handleStart)
    // mints the SAME run identity the Run ADI Again route mints
    // (useRunOptimisationPlan → beginOptimiserRun). The run id belongs to the
    // RUN, not to the winner or the actionability: it is created once here, at
    // the start of this execution, and survives through the engine, the plan
    // build, the result save, the save acknowledgement and the run history —
    // regardless of entry button, winner existence or terminal outcome.
    const activeRun = beginOptimiserRun(projectId, versionId);
    beginRunTimings(projectId, versionId, activeRun.runId);

    // Durable history + failure-evidence helpers, mirroring useRunOptimisationPlan
    // so both routes write through the same authorities and the same runId.
    let measuredRuntime = null;
    let traceStage = "preflight";
    const trace = {
      runId: activeRun.runId,
      projectId,
      versionId,
      designFingerprint: sharedRef.current?.cacheKey || null,
      engineStatus: null,
      baselineValid: null,
      electronicCandidateId: null,
      electronicIsCurrentFallback: null,
      placementGate: null,
      seatingGate: null,
      terminalOutcome: null,
      planSave: "not_requested",
      historySave: "not_requested",
      firstIssue: null,
    };
    // Keep arbitrary exception text, stack traces and response payloads out
    // of the persisted diagnostic. The stage and error class are sufficient
    // to locate the exception in the browser's developer tools.
    const recordIssue = (stage, message, kind) => {
      trace.firstIssue ??= { stage, message, kind };
    };
    const attachTrace = (record) => ({
      ...record,
      terminalTrace: { ...trace },
    });
    const saveTracedRecord = (record) => {
      if (getLatestOptimiserRun(projectId, versionId)?.runId !== activeRun.runId) return;
      trace.planSave = "requested";
      setOptimiserPlanAuthority(projectId, versionId, attachTrace(record));
    };
    // The plan actionability decided at the save boundary, used at the terminal
    // history row so a winnerless re-test records "no_useful_improvement" rather
    // than "actionable_plan".
    let runTerminalStatus = "actionable_plan";
    // ── OPTIMISER COMPLETION IS A SEPARATE LIFECYCLE EVENT FROM PUBLICATION ──
    // Once the optimiser engine returns a result (not cancelled/error/blocked),
    // the run has completed. A later publication failure (HTTP 429, timeout)
    // must NOT relabel this run as "failed" or erase its history — the optimiser
    // completed, only the publication failed.
    let optimiserCompleted = false;
    // The pre-written history row's existence. When true, the catch block updates
    // the existing row instead of creating a new one — so the completed run's
    // terminal status survives a publication failure.
    let historyPreWritten = false;
    const logRunHistory = (facts = {}) => {
      recordRunTiming(projectId, versionId, RUN_TIMING.USER_TERMINAL);
      const timings = getRunTimings(projectId, versionId);
      const live = sharedRef.current;
      trace.historySave = "requested";
      return persistOptimiserRunHistory({
        runId: activeRun.runId,
        projectId,
        versionId,
        designFingerprint: live?.cacheKey || null,
        resultFingerprint: live?.completedBassAuthority?.contract?.job?.resultFingerprint
          || live?.currentFingerprint || null,
        startedAt: activeRun.startedAt,
        userTerminalAt: runTimingAt(timings, RUN_TIMING.USER_TERMINAL)
          || new Date().toISOString(),
        terminalAt: runTimingAt(timings, RUN_TIMING.USER_TERMINAL)
          || new Date().toISOString(),
        ...facts,
        workerCalls: measuredRuntime ? {
          total: measuredRuntime.workerCallCount || 0,
          canonicalConfirmations: measuredRuntime.counts?.canonicalConfirmations || 0,
          integrationCanonicalConfirmations: measuredRuntime.counts?.integrationCanonicalConfirmations || 0,
          roomSimulationCalls: (measuredRuntime.counts?.roomSimulationCalls || 0)
            + (measuredRuntime.stage2?.roomSimulationCalls || 0),
          batchedReceiverEvaluations: measuredRuntime.counts?.batchedReceiverEvaluations || 0,
          stage2Jobs: (measuredRuntime.stage2?.placementCount || 0)
            + (measuredRuntime.stage2?.confirmationCount || 0),
        } : null,
        runtimeBreakdown: {
          ...(summariseElectronicStageBreakdown({ runtimeMetrics: measuredRuntime }) || {}),
          runId: activeRun.runId,
          timings: buildPersistedRunTimings(timings),
        },
        engineRevision: measuredRuntime?.engineRevision || null,
      }).then((receipt) => {
        trace.historySave = receipt?.ok === true ? "acknowledged" : "failed";
        if (trace.historySave === "failed") recordIssue("history-save", "History write was not acknowledged.", "save_failure");
        return receipt;
      }, (error) => {
        trace.historySave = "failed";
        recordIssue("history-save", "History write threw an exception.", "save_failure");
        throw error;
      });
    };
    const saveRunFailure = (reason, extra = {}) => {
      const current = sharedRef.current;
      const evidence = buildOptimiserRunEvidence({
        identity: {
          projectId,
          versionId,
          designFingerprint: current?.cacheKey || null,
          resultFingerprint: current?.completedBassAuthority?.contract?.job?.resultFingerprint
            || current?.currentFingerprint || null,
          cacheKey: current?.cacheKey || null,
          baseDesignFingerprint: current?.baseDesignFingerprint || null,
          baselineParity: extra.baselineParity || null,
        },
        baselineParity: extra.baselineParity || null,
        failureReason: reason,
        failure: extra.planSaveFailed ? {
          status: OPTIMISER_FAILURE_STATUS.PLAN_SAVE_FAILED,
          category: OPTIMISER_FAILURE_STATUS.PLAN_SAVE_FAILED,
          message: reason,
          publicationError: null,
          attempts: null,
          at: new Date().toISOString(),
          runId: activeRun.runId,
        } : null,
        runIdentity: activeRun,
      });
      if (evidence) {
        trace.terminalOutcome ??= evidence.terminalOutcome || null;
        saveTracedRecord(evidence);
      }
    };

    try {
      // ── Phase 1: Preflight — FAST PATH vs SLOW PATH ──
      // The Re-test route previously called onCalculate() unconditionally and
      // waited for the current bass publication BEFORE starting the optimiser
      // search. When the bass authority is already AUTHORITATIVE, current and
      // fingerprint-matched, that recalculation produces no new engineering
      // authority — on the audited Case C baseline it wasted ~27.4 s of
      // pre-search work. Reuse the existing currentness authority so the search
      // starts directly against the baseline that already describes the design.
      //
      // This READS the existing authority: it never creates a new bass
      // publication. The baseline identity (resultFingerprint, designFingerprint)
      // the optimiser receives is the same it would have received after an
      // unnecessary recalculation. If the authority is missing, stale,
      // fingerprint-mismatched or lacks baseline evidence, take the slow path —
      // never optimise against a stale or incomplete baseline.
      const sharedStart = sharedRef.current;
      const preflight = canReuseCurrentBaselineForOptimiser(sharedStart);
      if (preflight.reuse) {
        // Fast path: baseline already current — start the search directly.
        // No onCalculate(), no waitForCurrentPublication().
        recordRunTiming(projectId, versionId, RUN_TIMING.CALCULATION_COMPLETE);
      } else {
        // Slow path: missing / stale / fingerprint-mismatch / incomplete
        // baseline. Recalculate so the optimiser runs against a genuine
        // current authority, then wait for its publication.
        if (typeof sharedStart?.onCalculate === "function") {
          sharedStart.onCalculate();
        }
        if (!(await waitForCurrentPublication(sharedRef, phaseRef))) {
          // The preflight wait returns false ONLY on an explicit user cancel
          // (phaseRef === "cancelled"). The run ID was already minted above, so
          // this started run must receive its own terminal receipt: a cancelled
          // record, never an acoustic failure. Without this, refresh could
          // discard the in-memory run authority and restore the previous run's
          // result as though this run never happened.
          const cancelReason = "Optimisation cancelled by the user before completion.";
          recordIssue("preflight", "Cancelled during publication readiness wait.", "cancelled");
          trace.terminalOutcome = "cancelled";
          saveRunFailure(cancelReason, { terminalOutcome: "evaluation_incomplete" });
          logRunHistory({
            terminalStatus: "cancelled",
            publicationStatus: "not_attempted",
            publicationError: null,
          }).catch(() => null);
          setCancelled(projectId, versionId);
          return;
        }
        recordRunTiming(projectId, versionId, RUN_TIMING.CALCULATION_COMPLETE);
      }

      // Phase 2: Run V2 optimisation
      phaseRef.current = "optimising";
      setOptimising(projectId, versionId);

      // Pass the SAME runId minted by beginOptimiserRun above into the engine
      // — the same argument/contract as the Run ADI Again route. The engine
      // threads it into every runtimeMetrics record and the V2 optimisation
      // params, so the Stage 2 wait, the search and the saved plan reconcile
      // as ONE run. No second id is minted.
      traceStage = "engine";
      trace.designFingerprint = sharedRef.current?.cacheKey || null;
      const result = await runOptimisation({
        projectId,
        versionId,
        runId: activeRun.runId,
        shared: sharedRef.current,
        subwooferInstances: subInstancesRef.current,
        roomDims,
        seatingPositions,
        frontSubsCfg,
        rearSubsCfg,
        amplifierPowerPerSubW: resolvedAmplifierPowerPerSubW,
        subwooferBottomHeightM: frontSubsCfg?.bottomHeightM ?? rearSubsCfg?.bottomHeightM ?? 0,
        appState,
      });

      measuredRuntime = result.runtimeMetrics || measuredRuntime;
      trace.engineStatus = result.status || null;
      trace.superseded = getLatestOptimiserRun(projectId, versionId)?.runId !== activeRun.runId;
      const engineSelection = result.selection;
      const hierarchy = engineSelection?.hierarchyGateDiagnostics;
      trace.baselineValid = engineSelection?.baselineValidation?.valid ?? result.baselineParity?.valid
        ?? (result.status === "blocked" ? false : null);
      trace.electronicCandidateId = hierarchy?.electronicCandidateId || null;
      trace.electronicIsCurrentFallback = hierarchy?.electronicIsCurrentFallback ?? null;
      trace.placementGate = hierarchy?.placementGate ?? null;
      trace.seatingGate = hierarchy?.seatingGate ?? null;
      const firstIssue = engineSelection?.evaluationIssues?.[0];
      if (firstIssue) recordIssue(firstIssue.stage || "engine", "Engine reported an evaluation issue. See saved evaluation evidence.", "evaluation_issue");
      traceStage = "engine-return";
      if (result.status === "cancelled") {
        // Only an explicit user Cancel is a user cancellation. Other stop
        // reasons (inputs-incomplete, user-interaction, superseded, etc.) are
        // preserved as evaluation_incomplete with the actual reason.
        const userCancel = result.reason === "user-cancel";
        recordIssue(traceStage, userCancel ? "Cancelled by the designer." : "Execution stopped before completion.", userCancel ? "cancelled" : "incomplete");
        trace.terminalOutcome = userCancel ? "cancelled" : "evaluation_incomplete";
        const stopReason = result.reason || result.error || null;
        const reason = userCancel
          ? "Optimisation cancelled by the user before completion."
          : (stopReason
            ? `The optimisation stopped before it could complete (${stopReason}). Re-run the Optimisation Plan.`
            : "The optimisation stopped before it could complete. Re-run the Optimisation Plan.");
        logRunHistory({
          terminalStatus: userCancel ? "cancelled" : "evaluation_incomplete",
          publicationStatus: "not_attempted",
          publicationError: userCancel ? null : reason,
        }).catch(() => null);
        setCancelled(projectId, versionId);
        return;
      }
      if (result.status === "error" || result.status === "stale") {
        const reason = result.error || "Optimisation failed.";
        recordIssue(traceStage, result.status === "stale" ? "Design identity changed during execution." : "Optimiser returned an error.", result.status);
        // The failed run still carries its own runId in the saved terminal
        // evidence and history — run identity never depends on a winner.
        saveRunFailure(reason, { baselineParity: result.baselineParity || null });
        logRunHistory({
          terminalStatus: "failed",
          publicationStatus: "not_attempted",
          publicationError: reason,
        }).catch(() => null);
        setWorkflowError(projectId, versionId, reason);
        return;
      }
      if (result.status === "blocked") {
        // The optimiser baseline must be the published bass result. With no
        // matching completed authority the run stopped before evaluating
        // anything: state the reason and stop — nothing is auto-applied. The
        // block is still saved as terminal run evidence with the run's own
        // identity, so the panel states it after refresh and the history row
        // carries the runId.
        recordIssue(traceStage, "Current bass authority did not pass preflight.", "blocked");
        trace.terminalOutcome = "blocked";
        const blockedShared = sharedRef.current;
        const blockedEvidence = buildOptimiserRunEvidence({
          identity: {
            projectId,
            versionId,
            designFingerprint: blockedShared?.cacheKey || null,
            resultFingerprint: blockedShared?.completedBassAuthority?.contract?.job?.resultFingerprint
              || blockedShared?.currentFingerprint || null,
            cacheKey: blockedShared?.cacheKey || null,
            baseDesignFingerprint: blockedShared?.baseDesignFingerprint || null,
            baselineParity: result.baselineParity || null,
          },
          baselineParity: result.baselineParity || null,
          runIdentity: activeRun,
        });
        if (blockedEvidence) saveTracedRecord(blockedEvidence);
        logRunHistory({
          terminalStatus: "blocked",
          publicationStatus: "not_attempted",
          publicationError: result.error || null,
        }).catch(() => null);
        setWorkflowError(projectId, versionId, result.error);
        return;
      }

      // ── OPTIMISER COMPLETION BOUNDARY ──
      // The optimiser engine returned a result (not cancelled/error/blocked).
      // From this point, the run HAS completed — a later publication failure
      // is a publication lifecycle event, not an optimiser failure.
      optimiserCompleted = true;

      // ── ADI: Consume the optimiser's authoritative result ──────────
      // ADI is a pure reasoning module. It receives the optimiser's
      // selection (with correctability classification attached by the
      // orchestrator) and produces an engineering explanation. ADI never
      // generates candidates, validates constraints, or ranks — it
      // interprets the optimiser's decision.
      try {
        const selection = result.selection;
        const baseline = selection?.currentResult || null;
        adiDecisionRef.current = runEngineeringDecisionModel({
          optimiserResult: selection,
          currentResult: baseline,
          designObjectives: {
            p14TargetDb: shared?.authoritative?.requested?.selectedP14TargetDb
              || shared?.completedBassAuthority?.p14TargetDb
              || 0,
            p18TargetHz: null,
          },
          context: {
            subwooferCount: subInstancesRef.current?.filter((s) => s.enabled !== false).length || 0,
            roomDims,
            seatingPositions,
          },
        });
      } catch {
        adiDecisionRef.current = null;
      }

      // Persist the exact ADI decision shown for each published fingerprint.
      // Existing calibration can end this workflow before the auto-apply path;
      // a first-run auto-apply calls this again after its final recalculation.
      // ── The calibration decision, made ONCE for this run ──
      // Every calibration candidate the run itself confirmed (delay, gain,
      // polarity, phase — never a physical change) is put to the decision
      // authority. The strongest qualifying candidate is the one applied; every
      // other one states why it was not. Recorded with the run's evidence and
      // reused by the apply step below, so the panel and the apply path can never
      // disagree about what ADI did.
      const calibrationApplication = resolveCalibrationApplicationPlan({
        baseline: result.selection?.currentResult || null,
        selection: result.selection,
        objectives: result.selection?.objectives || null,
        instances: subInstancesRef.current,
        appliedCalibration: getAppliedCalibrationAuthority(projectId, versionId),
      });
      let calibrationApplied = false;

      // ── SPLIT PUBLISHER: plan-save (terminal boundary) + recommendation-publish (background) ──
      // The plan save is the designer's terminal boundary: the moment it lands the
      // run has a verdict. The recommendation publication is secondary work that
      // happens after the terminal card is visible — it never blocks the UI and
      // its failure never relabels a completed run. ONE publication per fingerprint:
      // the no-apply path publishes once against the current fingerprint; the
      // apply path publishes once against the post-recalculation fingerprint.
      const saveOptimiserPlanForTerminal = () => {
        traceStage = "plan-construction";
        const fingerprint = sharedRef.current?.completedBassAuthority?.contract?.job?.resultFingerprint
          || sharedRef.current?.completedBassAuthority?.currentFingerprint
          || null;
        if (!fingerprint) {
          recordIssue(traceStage, "Completed result fingerprint unavailable.", "missing_authority");
          return { fingerprint: null, persistedPlan: null, runEvidence: null, actionability: null, decision: null };
        }
        const currentShared = sharedRef.current;
        const decision = runEngineeringDecisionModel({
          optimiserResult: getImproveBassV2State(projectId, versionId),
          currentResult: buildAdiBassEvidence(currentShared?.completedBassAuthority),
          designObjectives: {
            p14TargetDb: currentShared?.authoritative?.requested?.selectedP14TargetDb,
            p14Level: currentShared?.authoritative?.requested?.requestedLevel,
            p18TargetBasis: currentShared?.authoritative?.requested?.p18TargetBasis,
          },
          context: {
            subwooferCount: subInstancesRef.current?.filter((i) => i?.enabled !== false && i?.model).length || 0,
            roomDims,
            seatingPositions,
          },
        });
        // Both identity domains from the canonical winner: the V2 start
        // fingerprint (inputIdentity) and the live cache key (baselineCacheKey).
        // Each is checked against its OWN authority in identity proof — never
        // cross-domain.
        const winnerInputIdentity = result.inputIdentityAuthority || null;
        const winnerBaselineCacheKey = result.selection?.winner?.baselineCacheKey || null;
        const currentCrossover = appState?.splConfig?.crossover || null;
        const rspAuthority = {
          rspMode: appState?.rspMode || null,
          manualRspY_m: appState?.manualRspY_m ?? null,
          manualRspX_m: appState?.manualRspX_m ?? null,
          designated_rsp_seat_id: appState?.designatedRspSeatId || null,
        };
        const optimiserPlan = buildOptimiserPlan({
          selection: result.selection,
          baseline: result.selection?.currentResult || null,
          identity: {
            projectId,
            versionId,
            designFingerprint: currentShared?.cacheKey || null,
            resultFingerprint: fingerprint,
            baselineParity: result.baselineParity || null,
            cacheKey: currentShared?.cacheKey || null,
            baseDesignFingerprint: currentShared?.baseDesignFingerprint || null,
            inputIdentity: winnerInputIdentity,
            electronicContext: electronicContextFromUi(liveElectronicRef.current),
            baselineCacheKey: winnerBaselineCacheKey,
            target: {
              p14TargetDb: currentShared?.authoritative?.requested?.selectedP14TargetDb
                ?? currentShared?.completedBassAuthority?.p14TargetDb
                ?? null,
              targetKey: null,
            },
            engineVersion: result.selection?.winner?.algorithmVersion || null,
            engineRevision: result.engineRevision || measuredRuntime?.engineRevision || null,
          },
          instances: subInstancesRef.current || [],
          seatingPositions,
          roomDims,
          leverDecisions: getOptimiserPlanAuthority(projectId, versionId)?.leverDecisions || {},
          calibrationDecision: calibrationApplication,
          decisionApplied: calibrationApplied,
          currentCrossover,
          rspAuthority,
        });
        const { actionability, actionablePlan: persistedPlan, runEvidence } = buildOptimiserResultForSave({
          plan: optimiserPlan,
          selection: result.selection,
          diagnostics: result.optimisationDiagnostics || null,
          identity: {
            projectId,
            versionId,
            designFingerprint: currentShared?.cacheKey || null,
            resultFingerprint: fingerprint,
            baselineParity: result.baselineParity || null,
            cacheKey: currentShared?.cacheKey || null,
            baseDesignFingerprint: currentShared?.baseDesignFingerprint || null,
            engineVersion: result.selection?.winner?.algorithmVersion || null,
            engineRevision: result.engineRevision || measuredRuntime?.engineRevision || null,
          },
          calibrationDecision: calibrationApplication,
          decisionApplied: calibrationApplied,
          runIdentity: activeRun,
        });
        recordRunTiming(projectId, versionId, RUN_TIMING.SAVE_STARTED);
        traceStage = "terminal-classification";
        runTerminalStatus = resolveCanonicalTerminalOutcome({
          actionability,
          calibrationDecision: calibrationApplication,
        });
        trace.terminalOutcome = runTerminalStatus;
        if (["failed", "evaluation_incomplete"].includes(runTerminalStatus)) {
          recordIssue(traceStage, "Terminal selection reported failed or incomplete evidence.", runTerminalStatus);
        }
        traceStage = "plan-save";
        if (persistedPlan) {
          saveTracedRecord({
            ...persistedPlan,
            timings: buildPersistedRunTimings(getRunTimings(projectId, versionId)),
          });
        } else if (runEvidence) {
          saveTracedRecord({
            ...runEvidence,
            timings: buildPersistedRunTimings(getRunTimings(projectId, versionId)),
          });
        }
        recordRunTiming(projectId, versionId, RUN_TIMING.SAVE_COMPLETED);
        return { fingerprint, persistedPlan, runEvidence, actionability, decision };
      };

      // ONE background recommendation publication against a single fingerprint.
      // Never throws into the run's try block — a refused publication is its own
      // diagnostic, recorded on the history row, never a run failure.
      const publishAdiRecommendationInBackground = (fingerprint, persistedPlan, runEvidence, decision) => {
        // Finalise the history row. When the pre-write landed (historyPreWritten),
        // update it in place. When it did not, create the row from scratch here so
        // the run's terminal record carries the publication outcome either way.
        const finaliseHistory = (status, errorMsg) => {
          if (historyPreWritten) {
            return updateOptimiserRunHistoryPublication({
              runId: activeRun.runId, projectId, versionId,
              publicationStatus: status,
              publicationError: errorMsg || null,
              publicationCompletedAt: new Date().toISOString(),
            }).then((res) => {
              if (res?.ok === false && res?.error === "row_not_found") {
                return logRunHistory({ terminalStatus: runTerminalStatus, publicationStatus: status, publicationError: errorMsg || null });
              }
              return res;
            }).catch(() => null);
          }
          return logRunHistory({ terminalStatus: runTerminalStatus, publicationStatus: status, publicationError: errorMsg || null }).catch(() => null);
        };
        if (!fingerprint || !result?.recommendation) {
          finaliseHistory("published", null);
          return;
        }
        const recommendationForPublication = {
          ...result.recommendation,
          optimiserPlan: persistedPlan || runEvidence || undefined,
          publishedAdiDecision: decision?.recommendation ? {
            outcome: decision.outcome,
            intent: decision.intent,
            recommendation: {
              assessment: decision.recommendation.assessment || null,
              action: decision.recommendation.action || null,
              why: decision.recommendation.why || null,
              rp22Evidence: decision.recommendation.rp22Evidence || null,
              remainingLimitation: decision.recommendation.remainingLimitation || null,
            },
            leverAssessment: {
              appropriateLever: decision.leverAssessment?.appropriateLever || null,
            },
          } : null,
        };
        publishRecommendation(projectId, versionId, recommendationForPublication, fingerprint)
          .then((persisted) => {
            finaliseHistory(persisted ? "published" : "failed", persisted ? null : "The recommendation could not be published.");
          })
          .catch((pubError) => {
            finaliseHistory("failed", pubError?.message || "The recommendation could not be published.");
          });
      };

      // ── 1. SAVE PLAN — the terminal boundary ──
      const {
        fingerprint: planFingerprint,
        persistedPlan,
        runEvidence: planRunEvidence,
        actionability,
        decision: adiDecision,
      } = saveOptimiserPlanForTerminal();

      // ── 2. PRE-WRITE HISTORY (awaited so the row exists before any status update) ──
      // The row MUST exist before any later publication-status update can target
      // it. A failure to create it is surfaced separately as a history
      // persistence failure — never silently converted into another lifecycle
      // state. The terminal UI still releases (the plan is saved), but the
      // background publication will create the row from scratch on its own
      // outcome.
      recordRunTiming(projectId, versionId, RUN_TIMING.USER_TERMINAL);
      traceStage = "history-save";
      phaseRef.current = "history";
      let historyPersistenceError = null;
      {
        const historyResult = await logRunHistory({
          terminalStatus: runTerminalStatus,
          publicationStatus: "pending",
        });
        if (historyResult?.ok === false) {
          historyPersistenceError = historyResult?.error
            || "The run history could not be written.";
          historyPreWritten = false;
        } else {
          historyPreWritten = true;
        }
      }
      if (historyPersistenceError) {
        console.warn("[OptimiseAndCalculate] history pre-write failed:", historyPersistenceError,
          "— background publication will create the row from scratch.");
      }
      phaseRef.current = "idle";

      // Apply one complete candidate-owned electronic configuration.
      const selection=result.selection;
      const baseline=selection.currentResult;
      const context=electronicContextFromUi(liveElectronicRef.current);
      const currentCrossover=liveElectronicRef.current.appState?.splConfig?.crossover;
      const candidates=[
        selection.winner,selection.integrationRecommendation,selection.combinedResult,
        selection.calibrationResult,selection.gainResult,selection.phaseResult,
        ...(selection.calibrationDiagnostics?.options||[]).map(o=>o.canonical),
        ...(selection.gainDiagnostics?.options||[]).map(o=>o.canonical),
      ].filter(Boolean);
      const seen=new Set(), eligible=[], rejected=[];
      for(const candidate of candidates){
        if(seen.has(candidate.candidateId))continue;
        seen.add(candidate.candidateId);
        const prepared=prepareElectronicCandidate({candidate,context,
          inputIdentity:result.inputIdentityAuthority,cacheKey:sharedRef.current?.cacheKey,currentCrossover});
        if(!prepared.ok){rejected.push(prepared.reason);continue;}
        const valid=validateCandidateForRun(candidate,{seats:seatingPositions,
          sourceIds:context.instances.filter(s=>s.enabled!==false).map(s=>s.id),
          inputIdentity:result.inputIdentityAuthority});
        if(!valid.valid){rejected.push("Candidate confirmation is incomplete.");continue;}
        const decision=resolveCalibrationAutoApply({baseline,candidate:valid.result,
          objectives:selection.objectives,instances:context.instances,applyValidatedSimulation:true,
          crossoverChanged:stable(prepared.crossover)!==stable(currentCrossover)});
        // Preserve the canonical output/extension safety envelope.
        const safeOutput=candidate.p14AchievedDb>=baseline.p14AchievedDb-0.1 &&
          canonicalLevel(candidate.p14AchievedLevel)>=canonicalLevel(baseline.p14AchievedLevel) &&
          candidate.achievedP18Hz<=baseline.achievedP18Hz+0.1;
        if(decision.decision==="applied" && safeOutput && changedSettings(prepared.before,prepared).length){
          eligible.push({candidate:valid.result,prepared,decision});
        }
      }
      eligible.sort((a,b)=>(b.decision.improvement?.p20DeltaDb||0)-(a.decision.improvement?.p20DeltaDb||0) ||
        (b.decision.improvement?.p19DeltaDb||0)-(a.decision.improvement?.p19DeltaDb||0));
      const chosen=eligible[0];
      const summary=buildAutoApplySummary(selection,subInstancesRef.current);
      const recommendations={
        subPositions:summary.hasPositions?summary.stageResults?.subPositions?.result:null,
        seating:summary.hasSeating?summary.stageResults?.seating?.result:null,addSubs:false,
      };
      if(chosen){
        phaseRef.current="applying";setApplying(projectId,versionId);
        const {prepared,candidate}=chosen;
        const receipt={
          schemaVersion:1,projectId,versionId,runId:activeRun.runId,candidateId:candidate.candidateId,
          inputIdentity:result.inputIdentityAuthority,baselineCacheKey:candidate.baselineCacheKey,
          physicalContext:physicalContext(context),before:prepared.before,
          after:{instances:prepared.instances,crossover:prepared.crossover},
          beforeResult:comparisonReceipt(baseline),expectedResult:comparisonReceipt(candidate),
          beforeLevels:resultLevels(baseline),changes:changedSettings(prepared.before,prepared),
        };
        await performElectronicUpdate(receipt);
        calibrationApplied=true;
        const keys=new Set(receipt.changes.map(r=>r.label.split(" · ").pop()));
        setComplete(projectId,versionId,{phase:keys.has("Phase"),delay:keys.has("Delay"),
          gain:keys.has("Gain"),polarity:keys.has("Polarity"),calibration:null},recommendations,false);
        publishAdiRecommendationInBackground(sharedRef.current.cacheKey,persistedPlan,planRunEvidence,adiDecision);
      }else{
        const noBenefit=result.status==="complete" && !selection.winner && !rejected.length &&
          !(selection.evaluationIssues||[]).length;
        if(noBenefit){
          const settings={instances:subInstancesRef.current,crossover:currentCrossover};
          const fingerprint=sharedRef.current.cacheKey;
          const receipt={schemaVersion:1,status:"no-changes",runId:activeRun.runId,projectId,versionId,
            resultFingerprint:fingerprint,before:settings,after:settings,changes:[],
            beforeLevels:resultLevels(baseline),afterLevels:resultLevels(baseline)};
          await withElectronicPersistence(projectId,versionId,async io=>{
            if(!io.current() || sharedRef.current.cacheKey!==fingerprint ||
               !settingsEqual(await io.readback(),settings))throw new Error("The design changed before saving the ADI result.");
            await io.persist(settings,receipt);
            if((await io.readback()).receipt?.runId!==receipt.runId)throw new Error("The ADI result could not be read back.");
            liveElectronicRef.current.appState.updateGlobalSpl({bassAdiReceipt:receipt});
          });
        }
        setComplete(projectId,versionId,{phase:false,delay:false,gain:false,calibration:null},recommendations,noBenefit);
        publishAdiRecommendationInBackground(planFingerprint,persistedPlan,planRunEvidence,adiDecision);
      }
    } catch (err) {
      const errorClass = err instanceof TypeError ? "TypeError"
        : err instanceof ReferenceError ? "ReferenceError" : "Error";
      const message = typeof err?.message === "string" ? err.message : "";
      // Allow only familiar JS runtime messages with identifier-shaped operands.
      const safeMessage = /^(?:[A-Za-z_$][\w$]{0,63} is (?:not defined|not a function)|Cannot read properties of (?:null|undefined) \(reading '[\w$]{1,64}'\))$/.test(message)
        ? message : "Unexpected exception.";
      recordIssue(traceStage, errorClass + ": " + safeMessage, "exception");
      const reason = err?.message || "Optimisation failed.";
      if (optimiserCompleted) {
        // FAILURE CLASSIFICATION BY PHASE: the optimiser completed and its plan
        // is saved. The error is from a LATER lifecycle event, and its label must
        // match the phase it occurred in. A tuning/apply exception is NOT a bass
        // publication failure. A target-cache HTTP 500 is neither. Do NOT
        // overwrite the completed plan with failure evidence.
        const phase = phaseRef.current;
        let userMessage;
        if (phase === "history") {
          userMessage = "The optimisation completed, but the run history could not be written. The saved plan is intact.";
        } else if (phase === "applying") {
          userMessage = "The optimisation completed, but the calibration could not be applied. The saved decision remains unapplied.";
        } else if (phase === "recalculating") {
          userMessage = "The optimisation completed, but the recalculated bass result could not be published. Retry the update.";
        } else if (phase === "publishing") {
          userMessage = "The optimisation completed, but the updated bass result could not be published. Retry the update.";
        } else {
          userMessage = "The optimisation completed, but a post-engine step could not complete. The saved plan is intact.";
        }
        if (historyPreWritten) {
          // Finalise the pre-written "pending" row in place.
          Promise.resolve(updateOptimiserRunHistoryPublication({
            runId: activeRun.runId,
            projectId,
            versionId,
            publicationStatus: "failed",
            publicationError: reason,
            publicationCompletedAt: new Date().toISOString(),
          })).catch(() => {});
        } else {
          // The pre-write itself did not land. Create the row now with the
          // correct terminal status — the optimiser's own outcome, not "failed".
          logRunHistory({
            terminalStatus: runTerminalStatus,
            publicationStatus: "failed",
            publicationError: reason,
          }).catch(() => null);
        }
        setWorkflowError(projectId, versionId, userMessage);
      } else {
        // ── GENUINE OPTIMISER FAILURE (before completion) ──
        // A genuinely failed re-test still carries its runId in the saved
        // incomplete/failure evidence and history — never a null runId.
        saveRunFailure(reason);
        logRunHistory({
          terminalStatus: "failed",
          publicationStatus: "not_attempted",
          publicationError: reason,
        });
        setWorkflowError(projectId, versionId, err.message);
      }
    } finally {
      console.info("[Bass ADI terminal trace]", JSON.stringify(trace));
      runningRef.current = false;
      phaseRef.current = "idle";
    }
  }, [projectId, versionId, shared, subwooferInstances, roomDims, seatingPositions,
      frontSubsCfg, rearSubsCfg, resolvedAmplifierPowerPerSubW, commitInstances, hasCanonicalInstances,
      appState, bassActionDisabled]);

  const handleCancel = useCallback(() => {
    phaseRef.current = "cancelled";
    requestCancel(projectId, versionId);
    cancelBassHeavyAction(projectId, versionId, "Optimise & Calculate cancelled");
    // Also cancel the background controller's active worker
    if (typeof sharedRef.current?.onCancel === "function") {
      sharedRef.current.onCancel();
    }
    setCancelled(projectId, versionId);
    runningRef.current = false;
  }, [projectId, versionId]);

  const handleReset = useCallback(() => {
    resetWorkflow(projectId, versionId);
    resetImproveBassV2(projectId, versionId);
    adiDecisionRef.current = null;
    if (typeof sharedRef.current?.onClearTerminal === "function") {
      sharedRef.current.onClearTerminal();
    }
  }, [projectId, versionId]);

  // Update Bass Performance — resets any terminal state from a previous
  // cancelled/failed run, then starts the full optimise-and-calculate
  // workflow. The previous published result remains visible until the
  // new calculation completes and publishes atomically.
  // Calculate / Recalculate Bass Results: calculates the CURRENT design only.
  // No optimisation, no applied settings. ADI is a separate designer action.
  const handleCalculateOnly = useCallback(() => {
    if (bassActionDisabled || !hasCanonicalInstances) return;
    handleReset();
    setTimeout(() => {
      if (typeof sharedRef.current?.onCalculate === "function") sharedRef.current.onCalculate();
    }, 50);
  }, [handleReset, bassActionDisabled, hasCanonicalInstances]);
  const handleUpdateBass = handleCalculateOnly;

  // Expose a recalculate function via registerRecalculate so the compact
  // Recalculate control in the Performance header can trigger the full
  // optimise-and-calculate workflow without duplicating orchestration logic.
  const handleStartRef = useRef(handleStart);
  const handleResetRef = useRef(handleReset);
  handleStartRef.current = handleStart;
  handleResetRef.current = handleReset;

  // ONE calibration apply action, shared by every surface that offers it: the
  // registered header control and the "Re-optimise Bass Calibration" action on
  // the ADI journey card. It clears the previous run's terminal state and starts
  // the full workflow — the only path that can auto-apply safe calibration,
  // recalculate P14/P18/P19/P20 from the applied state and republish the
  // authority. Nothing here decides what may be applied: that is the calibration
  // decision's own job.
  const runCalibrationAutoApply = useCallback(() => {
    handleResetRef.current();
    setTimeout(() => handleStartRef.current(), 50);
  }, []);

  useEffect(() => {
    if (!registerRecalculate) return;
    registerRecalculate(handleCalculateOnly);
    return () => registerRecalculate(null);
  }, [registerRecalculate, handleCalculateOnly]);

  // A physical Apply commits room state first. Wait until React has produced
  // the new calculation fingerprint, then calculate that exact design. Calling
  // the render-captured handler immediately queues the previous fingerprint and
  // leaves the newly applied design permanently stale.
  const handlePhysicalRecalculate = useCallback(async ({ previousCacheKey = null } = {}) => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      await sleep(SLEEP_MS);
      const live = sharedRef.current;
      const fingerprintAdvanced = !previousCacheKey
        || (!!live?.cacheKey && live.cacheKey !== previousCacheKey);
      if (fingerprintAdvanced && live?.canCalculate === true && typeof live?.onCalculate === "function") {
        return live.onCalculate();
      }
    }
    return { action: "blocked", reason: "applied-design-fingerprint-not-ready" };
  }, []);

  // ── Build the simplified progress display ──
  const stageDisplay = React.useMemo(() => {
    if (!isBusy) return null;
    return buildStageDisplay(v2State);
  }, [v2State, isBusy]);

  // Map workflow phases to the simplified progress stages
  const progressSteps = React.useMemo(() => {
    const steps = [
      { key: "phase", label: "Phase analysed", workflowPhase: "optimising", stageKey: "phase_polarity" },
      { key: "delay", label: "Delay analysed", workflowPhase: "optimising", stageKey: "delays" },
      { key: "gain", label: "Gain analysed", workflowPhase: "optimising", stageKey: "gain" },
      { key: "placement", label: "Placement analysed", workflowPhase: "optimising", stageKey: "sub_positions" },
      { key: "seating", label: "Seating analysed", workflowPhase: "optimising", stageKey: "seating_positions" },
      { key: "globalAlignment", label: "Global level alignment", workflowPhase: "recalculating", stageKey: null },
    ];

    const workflowPhase = workflowState.status;
    const v2Complete = v2State?.status === "complete";

    return steps.map((step) => {
      let status = "pending";

      if (workflowPhase === "calculating") {
        status = "pending";
      } else if (workflowPhase === "optimising") {
        // Use the V2 stage display to determine completion
        if (stageDisplay) {
          const stage = stageDisplay.stages?.find((s) => s.key === step.stageKey);
          if (stage) {
            if (stage.status === "completed") status = "done";
            else if (stage.status === "active") status = "active";
            else if (stage.status === "not_tested") status = "skipped";
            else status = "pending";
          }
        }
        // Global alignment is after optimisation
        if (step.key === "globalAlignment") status = "pending";
      } else if (workflowPhase === "applying" || workflowPhase === "recalculating" || workflowPhase === "publishing" || workflowPhase === "complete") {
        // All optimisation steps are done
        if (step.key === "globalAlignment") {
          status = workflowPhase === "publishing" || workflowPhase === "complete" ? "done" : "active";
        } else {
          // Check if the stage was skipped (not_tested) vs done
          if (stageDisplay) {
            const stage = stageDisplay.stages?.find((s) => s.key === step.stageKey);
            if (stage?.status === "not_tested") status = "skipped";
            else status = "done";
          } else {
            status = "done";
          }
        }
      }

      return { ...step, status };
    });
  }, [workflowState.status, v2State?.status, stageDisplay]);

  // ── Render ──
  const status = workflowState.status;
  const isError = status === "error";
  const isCancelledState = status === "cancelled";
  const isComplete = status === "complete";

  return (
    <div className="space-y-3">
      {/* ── Main button ── */}
      {!isCalculating && !isComplete && !isError && !isCancelledState && !isTimedOut && !hasResults && (
        <>
          <button
            type="button"
            onClick={handleCalculateOnly}
            disabled={bassActionDisabled}
            className="w-full rounded-lg bg-[#213428] px-4 py-3 text-[13px] font-semibold text-white transition-opacity hover:bg-[#3E4349] disabled:cursor-not-allowed disabled:opacity-45 flex items-center justify-center gap-2"
          >
            <Sparkles className="h-4 w-4" />
            Calculate Bass Results
          </button>
          {!hasActiveSubModel && (
            <p className="mt-2 text-[11px] text-[#625143]">Select a subwoofer model and quantity before optimising.</p>
          )}
          {shared?.completedBassAuthority?.authorityStatus === "STALE" && (
            <p className="mt-2 text-[11px] font-medium text-[#4A230F]">Previous result needs recalculation — press Recalculate Bass Results to update.</p>
          )}
        </>
      )}

      {/* ── Update Bass Performance (published result exists but design changed) ── */}
      {!isCalculating && !isError && !isTimedOut && hasResults && isStale && (
        <button
          type="button"
          onClick={handleUpdateBass}
          disabled={bassActionDisabled}
          className="w-full rounded-lg bg-[#213428] px-4 py-3 text-[13px] font-semibold text-white transition-opacity hover:bg-[#3E4349] disabled:cursor-not-allowed disabled:opacity-45 flex items-center justify-center gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Recalculate Bass Results
        </button>
      )}

      {/* ── Simplified progress display ── */}
      {isCalculating && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-[#213428]" />
            <span className="text-[13px] font-semibold text-[#1B1A1A]">
              {shared?.calculationPhaseLabel
                || (status === "applying" && "Applying improvements\u2026")
                || (status === "publishing" && "Publishing results\u2026")
                || BASS_LIFECYCLE_COPY[BASS_LIFECYCLE_STATE.PREPARING]}
            </span>
          </div>

          {/* Stage checklist */}
          {status === "optimising" && (
            <div className="space-y-1.5 pl-2">
              {progressSteps.filter((s) => s.key !== "globalAlignment").map((step) => (
                <div key={step.key} className="flex items-center gap-2 text-[12px]">
                  {step.status === "done" && <CheckCircle2 className="h-3.5 w-3.5 text-[#213428] flex-shrink-0" />}
                  {step.status === "active" && <Loader2 className="h-3.5 w-3.5 animate-spin text-[#213428] flex-shrink-0" />}
                  {step.status === "pending" && <div className="h-3.5 w-3.5 rounded-full border border-[#DCDBD6] flex-shrink-0" />}
                  {step.status === "skipped" && <div className="h-3.5 w-3.5 flex-shrink-0 text-[#8A7B6A] text-[10px] flex items-center justify-center">—</div>}
                  <span className={step.status === "done" ? "text-[#213428]" : step.status === "active" ? "text-[#1B1A1A] font-medium" : step.status === "skipped" ? "text-[#8A7B6A]" : "text-[#8A7B6A]"}>
                    {step.label}
                    {step.status === "skipped" && " (not applicable)"}
                  </span>
                </div>
              ))}
            </div>
          )}

          {(status === "recalculating" || status === "publishing") && (
            <div className="space-y-1.5 pl-2">
              {progressSteps.map((step) => (
                <div key={step.key} className="flex items-center gap-2 text-[12px]">
                  {step.status === "done" && <CheckCircle2 className="h-3.5 w-3.5 text-[#213428] flex-shrink-0" />}
                  {step.status === "active" && <Loader2 className="h-3.5 w-3.5 animate-spin text-[#213428] flex-shrink-0" />}
                  {step.status === "pending" && <div className="h-3.5 w-3.5 rounded-full border border-[#DCDBD6] flex-shrink-0" />}
                  {step.status === "skipped" && <div className="h-3.5 w-3.5 flex-shrink-0 text-[#8A7B6A] text-[10px] flex items-center justify-center">—</div>}
                  <span className={step.status === "done" ? "text-[#213428]" : step.status === "active" ? "text-[#1B1A1A] font-medium" : step.status === "skipped" ? "text-[#8A7B6A]" : "text-[#8A7B6A]"}>
                    {step.label}
                    {step.status === "skipped" && " (not applicable)"}
                  </span>
                </div>
              ))}
            </div>
          )}

        </div>
      )}

      {/* Cancel — visibility governed solely by bassCalculationLifecycle */}
      {canCancel && (
        <button
          type="button"
          onClick={handleCancel}
          className="text-[11px] text-[#625143] hover:text-[#1B1A1A] underline underline-offset-2"
        >
          Cancel
        </button>
      )}

      <ResetSubwooferTuningButton
        appState={appState}
        frontSubsCfg={frontSubsCfg}
        rearSubsCfg={rearSubsCfg}
        disabled={disabled}
      />

      {/* ── Recommended Improvement: ADI Recommendation ── */}
      {/* Authoritative project state drives the zone; workflow status only
          modifies presentation. When authoritative bass results exist, the
          zone always renders — AdiRecommendation internally resolves to one
          of: Recommended Improvement, No further engineering, or No further EQ. */}
      {hasResults && (
        <div className={`mt-3 ${shared?.placementPreviewActive ? "opacity-45" : ""}`}>
          <WhatAdiDid
            receipt={appState?.splConfig?.bassAdiReceipt}
            instances={subwooferInstances} crossover={appState?.splConfig?.crossover}
            fingerprint={shared?.cacheKey} authorityCurrent={hasPublishedCurrentDesign(shared)}
            busy={isCalculating} disabled={!!reoptimiseDisabledReason}
            onRun={runCalibrationAutoApply} onRestore={restoreElectronicSettings}
            physical={Boolean(workflowState.recommendations?.subPositions || workflowState.recommendations?.seating)}>
          <AdiRecommendation
            jointReceiptState={jointReceiptState}
            autoApplied={workflowState.autoApplied}
            v2State={v2State}
            completedBassAuthority={shared?.completedBassAuthority}
            subwooferCount={
              Array.isArray(subwooferInstances)
                ? subwooferInstances.filter(
                    (i) => i?.enabled !== false && i?.model,
                  ).length
                : 0
            }
            shared={shared}
            roomDims={roomDims}
            seatingPositions={seatingPositions}
            recommendations={workflowState.recommendations}
            currentInstances={subwooferInstances}
            selectedSubModel={frontSubsCfg?.model || rearSubsCfg?.model || null}
            commitInstances={commitInstances}
            commitSeating={commitSeating}
            commitSeatingProvenance={commitSeatingProvenance}
            hasCanonicalInstances={hasCanonicalInstances}
            appState={appState}
            amplifierPowerPerSubW={resolvedAmplifierPowerPerSubW}
            onRecalculate={handlePhysicalRecalculate}
            optimisationRunBlockReason={optimisationRunBlockReason}
            optimisationRunStatus={planRunStatus}
            optimisationRunError={planRunError}
            onRunOptimisationPlan={runCalibrationAutoApply}
            onCalculateBassPerformance={() => {
              if (typeof sharedRef.current?.onCalculate === "function") sharedRef.current.onCalculate();
            }}
            // The calibration apply workflow is offered whenever saved authority
            // exists AND the design is current. When the design is stale, the
            // "Update Bass Performance" action above already runs this same
            // workflow, so the card does not offer a second run button for it.
            onReoptimiseCalibration={hasResults && !isStale ? runCalibrationAutoApply : null}
            reoptimiseBusy={isCalculating && !jointReceiptState.operationActive}
            reoptimiseDisabledReason={reoptimiseDisabledReason}
            // The journey card's stall notice states the ONE cancel path, whose
            // availability is owned solely by bassCalculationLifecycle. No
            // second cancel action is created here.
            canCancelRun={canCancel}
            onCancelRun={handleCancel}
          />
          </WhatAdiDid>
        </div>
      )}

      {/* Combined electronic changes use the single saved-and-verified transaction above. */}

      {/* ── Error state ── */}
      {isError && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-700" />
            <span className="text-[12px] font-semibold text-red-800">Optimisation incomplete</span>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-red-700">{workflowState.error}</p>
          <button type="button" onClick={handleReset} className="mt-2 text-[11px] text-red-700 underline underline-offset-2">
            Retry
          </button>
        </div>
      )}

      {/* ── Cancelled state (only when no published result to restore) ── */}
      {isCancelledState && !hasResults && (
        <div className="rounded-md border border-[#C1B6AD] bg-[#F1F0EE] p-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-[#4A230F]" />
            <span className="text-[12px] font-semibold text-[#4A230F]">Optimisation cancelled</span>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-[#4A230F]">Current design remains unchanged.</p>
          <button type="button" onClick={handleReset} className="mt-2 text-[11px] text-[#4A230F] underline underline-offset-2">
            Retry
          </button>
        </div>
      )}

      {/* ── Timed out state ── */}
      {isTimedOut && (
        <div className="rounded-md border border-[#C1B6AD] bg-[#F1F0EE] p-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-[#4A230F]" />
            <span className="text-[12px] font-semibold text-[#4A230F]">Calculation timed out</span>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-[#4A230F]">{BASS_LIFECYCLE_COPY[BASS_LIFECYCLE_STATE.TIMED_OUT]}</p>
          <div className="mt-2 flex gap-3">
            <button type="button" onClick={handleReset} className="text-[11px] font-semibold text-[#4A230F] underline underline-offset-2">
              Retry
            </button>
            <button type="button" onClick={handleReset} className="text-[11px] text-[#4A230F] underline underline-offset-2">
              Clear
            </button>
          </div>
        </div>
      )}

      </div>
      );
      }