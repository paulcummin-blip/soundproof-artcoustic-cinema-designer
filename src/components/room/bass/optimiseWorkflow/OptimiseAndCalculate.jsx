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

import React, { useCallback, useEffect, useRef } from "react";
import { useSyncExternalStore } from "react";
import { Sparkles, CheckCircle2, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { useSharedBassResults } from "../bassResultsStore";
import { capturePublicationTrace } from "../publicationTraceStore";
import { useActiveProjectId } from "@/components/state/project-session";
import { getStage2State, subscribeStage2 } from "../stage2/stage2PlacementStore";
import { useImproveBassV2State, requestCancel, resetImproveBassV2 } from "../improveBassV2/improveBassV2Store";
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
  hasCalibrationImprovement,
  hasPhysicalRecommendations,
} from "./optimiseWorkflowOrchestrator";
import { DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W } from "@/components/utils/subwooferCapability";
import { buildAuthoritativeRspPosition } from "../authoritativeRspPosition";
import AdiRecommendation from "./AdiRecommendation";
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

// ── Helper: apply recommendation values to subwoofer instances ──
// Mirrors BassDecisionActions.applyRecommendationToInstances — the single
// canonical way to commit accepted calibration values to instances after
// an Accept Transition. No provenance stamping (the Accept Transition
// owns the authority write; this helper only updates the instances).
function applyRecommendationToInstances(instances, values) {
  if (!Array.isArray(instances) || !Array.isArray(values)) return instances;
  const byId = new Map(values.map((v) => [String(v.id), v]));
  return instances.map((inst) => {
    const v = byId.get(String(inst.id));
    if (!v) return inst;
    return {
      ...inst,
      delayMs: Number(v.delayMs) || 0,
      gainDb: Number(v.gainDb) || 0,
      polarity: Number(v.polarity) || 1,
      phaseControlDeg: Number(v.phaseControlDeg) || 0,
    };
  });
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

  const bassActionDisabled = disabled
    || !hasActiveSubModel
    || shared?.canCalculate !== true;

  const isBusy = ["calculating", "optimising", "applying", "recalculating", "publishing"].includes(workflowState.status);
  // Unified calculation state: a real calculation may be in progress even
  // when the workflow store is idle (background auto-calculate). Cancel must
  // be visible whenever a real active job exists.
  const isCalculating = isBusy || shared?.calculationInProgress === true;
  const bassLifecycleState = shared?.bassLifecycleState || BASS_LIFECYCLE_STATE.IDLE;
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
  // Cancel visibility is owned solely by bassCalculationLifecycle.
  const canCancel = canCancelBassCalculation(bassLifecycleState, hasActiveJob);
  const isTimedOut = bassLifecycleState === BASS_LIFECYCLE_STATE.TIMED_OUT && !isCalculating;
  // Stale: published result exists but the subwoofer design has changed.
  // The designer must see "Update Bass Performance" — not be forced back to
  // Choose Starting Layout.
  const isStale = bassLifecycleState === BASS_LIFECYCLE_STATE.STALE_NEEDS_RECALCULATION;

  // ── Main orchestration: triggered by the OPTIMISE & CALCULATE button ──
  const handleStart = useCallback(async () => {
    if (runningRef.current) return;
    if (bassActionDisabled || !hasCanonicalInstances) return;

    runningRef.current = true;
    phaseRef.current = "calculating";
    startWorkflow(projectId, versionId);

    try {
      // Phase 1: Initial authoritative bass calculation (hidden)
      const sharedStart = sharedRef.current;
      if (typeof sharedStart?.onCalculate === "function") {
        sharedStart.onCalculate();
      }

      // Wait for the initial calculation to complete
      if (!(await waitForCurrentPublication(sharedRef, phaseRef))) return;

      // Phase 2: Run V2 optimisation
      phaseRef.current = "optimising";
      setOptimising(projectId, versionId);

      const result = await runOptimisation({
        projectId,
        versionId,
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

      if (result.status === "cancelled") {
        setCancelled(projectId, versionId);
        return;
      }
      if (result.status === "error" || result.status === "stale") {
        setWorkflowError(projectId, versionId, result.error || "Optimisation failed.");
        return;
      }

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

      // Phase 3: Route through the Recommendation Authority
      // The optimiser's calibration tuning is now a RECOMMENDATION, not an
      // auto-apply. The Recommendation Authority owns the proposal; the
      // Accept Transition owns the mutation.
      //
      // First run (no Applied Calibration): auto-accept to preserve the
      //   one-click behaviour — there is no existing design to protect.
      // Existing calibration: STOP — the recommendation is set, and
      //   BassDecisionActions renders the Accept/Continue decision.
      phaseRef.current = "applying";
      setApplying(projectId, versionId);

      const selection = result.selection;
      const autoApplySummary = buildAutoApplySummary(selection, subInstancesRef.current);
      const stageResults = autoApplySummary.stageResults;
      const hasCal = hasCalibrationImprovement(stageResults);
      const hasPhysical = hasPhysicalRecommendations(autoApplySummary);

      if (hasCal && autoApplySummary.tuning) {
        const rspPosition = buildAuthoritativeRspPosition(roomDims, appState?.mlpY_m, appState?.mlpX_m, appState?.designatedRspSeatId);
        const selectedSubModel = frontSubsCfg?.model || rearSubsCfg?.model || null;
        const requested = shared?.authoritative?.requested || {};

        const basisFp = (() => {
          try {
            return computeAppliedCalibrationBasisFingerprint({
              subwooferInstances: subInstancesRef.current,
              roomDims,
              seatingPositions,
              rspPosition,
              selectedSubModel,
            });
          } catch { return null; }
        })();

        if (basisFp) {
          // 1. Build recommendationValues from the optimiser tuning
          const recommendationValues = autoApplySummary.tuning.map((t) => ({
            id: String(t.sourceId || ""),
            delayMs: Number(t.delayMs) || 0,
            gainDb: Number(t.gainDb) || 0,
            polarity: (Number(t.polarity) < 0 || Number(t.polarity) === 180) ? -1 : 1,
            phaseControlDeg: Number(t.phaseControlDeg ?? t.phaseAdjust) || 0,
          }));

          // 2. Create and set the Recommendation Authority object
          const recommendation = createRecommendation({
            geometryFingerprint: basisFp,
            intent: RECOMMENDATION_INTENT.CALIBRATION,
            recommendationValues,
            generatedBy: "Bass Optimiser V2",
            originatingCandidateId: selection?.winner?.candidateId || "auto-optimise",
          });
          setRecommendation(projectId, versionId, recommendation);

          // 3. First run (no Applied Calibration): auto-accept.
          //    Existing calibration: STOP — let BassDecisionActions decide.
          const existingCalibration = getAppliedCalibrationAuthority(projectId, versionId);
          if (!existingCalibration) {
            try {
              acceptRecommendation(projectId, versionId, {
                currentGeometryFingerprint: basisFp,
              });
              if (commitInstances) {
                const newInstances = applyRecommendationToInstances(
                  subInstancesRef.current,
                  recommendationValues,
                );
                commitInstances(newInstances);
              }
            } catch {
              // Accept transition failed — non-fatal, workflow continues
            }
          } else {
            // Existing calibration — STOP. Recommendation is ready.
            // No recalculation — the designer's Accept/Continue triggers it.
            setComplete(projectId, versionId, {
              phase: false,
              delay: false,
              gain: false,
              globalBassTrim: false,
              details: autoApplySummary.changeSummary,
            }, {
              subPositions: autoApplySummary.hasPositions
                ? autoApplySummary.stageResults?.subPositions?.result || null
                : null,
              seating: autoApplySummary.hasSeating
                ? autoApplySummary.stageResults?.seating?.result || null
                : null,
              addSubs: false,
            }, false);
            return;
          }
        }
      }

      // Phase 4: Recalculate with the optimised system
      phaseRef.current = "recalculating";
      setRecalculating(projectId, versionId);

      if (typeof sharedRef.current?.onCalculate === "function") {
        // Small delay to let the instance commit propagate
        await sleep(150);
        sharedRef.current?.onCalculate();
      }

      // Wait for recalculation to complete — read live state via sharedRef
      // (NOT the stale closure-captured `shared`) so layout/position changes
      // between runs don't freeze the break condition on an old snapshot.
      if (!(await waitForCurrentPublication(sharedRef, phaseRef))) return;

      // Phase 5: Publishing
      phaseRef.current = "publishing";
      setPublishing(projectId, versionId);
      await sleep(300);

      // Build the summary
      const autoApplied = {
        phase: stageResults?.phase?.verdict === "improvement",
        delay: stageResults?.delay?.verdict === "improvement",
        gain: stageResults?.gain?.verdict === "improvement",
        globalBassTrim: false, // determined from the authority after recalculation
        details: autoApplySummary.changeSummary,
      };

      // Check for global bass trim from the authority — read live state so the
      // freshly recalculated authority (not the stale closure snapshot) is used.
      const liveAuthority = sharedRef.current?.completedBassAuthority;
      const globalTrim = liveAuthority?.contract?.selectedCandidate?.globalLevelAlignment
        || liveAuthority?.contract?.productAnalysis?.parameters?.globalLevelAlignment
        || null;
      if (globalTrim && Number.isFinite(globalTrim.recommendedTrimDb) && Math.abs(globalTrim.recommendedTrimDb) > 0.05) {
        autoApplied.globalBassTrim = true;
        autoApplied.details = autoApplied.details || {};
        autoApplied.details.globalTrimDb = globalTrim.recommendedTrimDb;
      }

      const recommendations = {
        subPositions: autoApplySummary.hasPositions
          ? autoApplySummary.stageResults?.subPositions?.result || null
          : null,
        seating: autoApplySummary.hasSeating
          ? autoApplySummary.stageResults?.seating?.result || null
          : null,
        addSubs: false, // could be determined from Stage 2 results in future
      };

      const noImprovements = !hasCal && !hasPhysical && !autoApplied.globalBassTrim;

      setComplete(projectId, versionId, autoApplied, recommendations, noImprovements);
    } catch (err) {
      setWorkflowError(projectId, versionId, err.message);
    } finally {
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
  const handleUpdateBass = useCallback(() => {
    handleReset();
    setTimeout(() => handleStart(), 50);
  }, [handleReset, handleStart]);

  // Expose a recalculate function via registerRecalculate so the compact
  // Recalculate control in the Performance header can trigger the full
  // optimise-and-calculate workflow without duplicating orchestration logic.
  const handleStartRef = useRef(handleStart);
  const handleResetRef = useRef(handleReset);
  handleStartRef.current = handleStart;
  handleResetRef.current = handleReset;

  useEffect(() => {
    if (!registerRecalculate) return;
    registerRecalculate(() => {
      handleResetRef.current();
      setTimeout(() => handleStartRef.current(), 50);
    });
    return () => registerRecalculate(null);
  }, [registerRecalculate]);

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
            onClick={handleStart}
            disabled={bassActionDisabled}
            className="w-full rounded-lg bg-[#213428] px-4 py-3 text-[13px] font-semibold text-white transition-opacity hover:bg-[#3E4349] disabled:cursor-not-allowed disabled:opacity-45 flex items-center justify-center gap-2"
          >
            <Sparkles className="h-4 w-4" />
            Calculate Performance
          </button>
          {!hasActiveSubModel && (
            <p className="mt-2 text-[11px] text-[#625143]">Select a subwoofer model and quantity before optimising.</p>
          )}
          {shared?.completedBassAuthority?.authorityStatus === "STALE" && (
            <p className="mt-2 text-[11px] font-medium text-amber-700">Previous result needs recalculation — press Calculate Performance to update.</p>
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
          Update Bass Performance
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

      {/* ── Recommended Improvement: ADI Recommendation ── */}
      {/* Authoritative project state drives the zone; workflow status only
          modifies presentation. When authoritative bass results exist, the
          zone always renders — AdiRecommendation internally resolves to one
          of: Recommended Improvement, No further engineering, or No further EQ. */}
      {hasResults && (
        <div className="mt-3">
          <AdiRecommendation
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
          />
        </div>
      )}

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
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-700" />
            <span className="text-[12px] font-semibold text-amber-800">Optimisation cancelled</span>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-amber-700">Current design remains unchanged.</p>
          <button type="button" onClick={handleReset} className="mt-2 text-[11px] text-amber-700 underline underline-offset-2">
            Retry
          </button>
        </div>
      )}

      {/* ── Timed out state ── */}
      {isTimedOut && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-700" />
            <span className="text-[12px] font-semibold text-amber-800">Calculation timed out</span>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-amber-700">{BASS_LIFECYCLE_COPY[BASS_LIFECYCLE_STATE.TIMED_OUT]}</p>
          <div className="mt-2 flex gap-3">
            <button type="button" onClick={handleReset} className="text-[11px] font-semibold text-amber-700 underline underline-offset-2">
              Retry
            </button>
            <button type="button" onClick={handleReset} className="text-[11px] text-amber-700 underline underline-offset-2">
              Clear
            </button>
          </div>
        </div>
      )}

      </div>
      );
      }