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
// The user sees a simple progress display. After completion, a Bass Optimisation
// Summary shows what was auto-applied, and optional "Further Improvements" are
// presented for user-decision items (move seating, move subwoofers, add subs).
//
// The existing engineering workflow (Calculate + Improve Bass Response V2) is
// retained behind an Advanced Diagnostics toggle.

import React, { useCallback, useEffect, useRef } from "react";
import { useSyncExternalStore } from "react";
import { Sparkles, CheckCircle2, Loader2, AlertCircle, RotateCcw } from "lucide-react";
import { useSharedBassResults } from "../bassResultsStore";
import { useActiveProjectId } from "@/components/state/project-session";
import { useEngineeringMode } from "@/components/state/useEngineeringMode";
import { getStage2State, subscribeStage2 } from "../stage2/stage2PlacementStore";
import { useImproveBassV2State, requestCancel, resetImproveBassV2 } from "../improveBassV2/improveBassV2Store";
import { cancelBassHeavyAction } from "../bassHeavyActionStore";
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
  autoApplyCalibration,
  hasCalibrationImprovement,
  hasPhysicalRecommendations,
} from "./optimiseWorkflowOrchestrator";
import { computeV2DesignFingerprint } from "../improveBassV2/improveBassV2Fingerprint";
import { DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W } from "@/components/utils/subwooferCapability";
import { buildAuthoritativeRspPosition } from "../authoritativeRspPosition";
import BassOptimisationSummary from "./BassOptimisationSummary";
import FurtherImprovements from "./FurtherImprovements";
import ImproveBassResponseV2 from "../improveBassV2/ImproveBassResponseV2";
import { BASS_LIFECYCLE_STATE, BASS_LIFECYCLE_COPY } from "../bassCalculationLifecycle";

const SLEEP_MS = 100;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

  const runningRef = useRef(false);
  const phaseRef = useRef("idle"); // tracks which phase we're in to avoid double-trigger

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
  const isTimedOut = bassLifecycleState === BASS_LIFECYCLE_STATE.TIMED_OUT && !isCalculating;
  const { engineeringMode } = useEngineeringMode();

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
      while (true) {
        await sleep(SLEEP_MS);
        const s = sharedRef.current;
        if (!s?.calculationInProgress && s?.hasCurrentResult) break;
        if (phaseRef.current === "cancelled") break;
      }
      if (phaseRef.current === "cancelled") return;

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

      // Phase 3: Auto-apply calibration improvements
      phaseRef.current = "applying";
      setApplying(projectId, versionId);

      const selection = result.selection;
      const autoApplySummary = buildAutoApplySummary(selection, subInstancesRef.current);
      const stageResults = autoApplySummary.stageResults;
      const hasCal = hasCalibrationImprovement(stageResults);
      const hasPhysical = hasPhysicalRecommendations(autoApplySummary);

      let appliedTuning = false;
      if (hasCal && autoApplySummary.tuning && commitInstances) {
        const fingerprint = (() => {
          try {
            const rspPosition = buildAuthoritativeRspPosition(roomDims, appState?.mlpY_m, appState?.mlpX_m, appState?.designatedRspSeatId);
            const selectedSubModel = frontSubsCfg?.model || rearSubsCfg?.model || null;
            const requested = shared?.authoritative?.requested || {};
            return computeV2DesignFingerprint({
              subwooferInstances, roomDims, seatingPositions, rspPosition, selectedSubModel,
              p14TargetBasis: requested.p14TargetBasis || "minimum",
              p14TargetLevel: requested.requestedLevel || 2,
              p14TargetDb: requested.selectedP14TargetDb || 117,
              p18TargetBasis: requested.p18TargetBasis || "minimum",
              amplifierPowerPerSubW: resolvedAmplifierPowerPerSubW,
            });
          } catch { return null; }
        })();

        const next = autoApplyCalibration(subwooferInstances, autoApplySummary.tuning, commitInstances, fingerprint);
        appliedTuning = !!next;
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
      while (true) {
        await sleep(SLEEP_MS);
        const s = sharedRef.current;
        if (!s?.calculationInProgress && s?.hasCurrentResult) break;
        if (phaseRef.current === "cancelled") break;
      }
      if (phaseRef.current === "cancelled") return;

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
    if (typeof sharedRef.current?.onClearTerminal === "function") {
      sharedRef.current.onClearTerminal();
    }
  }, [projectId, versionId]);

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
    <div className="mt-3 rounded-lg border border-[#D9D5CE] bg-white px-4 py-4">
      {/* ── Main button ── */}
      {!isCalculating && !isComplete && !isError && !isCancelledState && !isTimedOut && (
        <>
          <button
            type="button"
            onClick={handleStart}
            disabled={bassActionDisabled}
            className="w-full rounded-lg bg-[#213428] px-4 py-3 text-[13px] font-semibold text-white transition-opacity hover:bg-[#3E4349] disabled:cursor-not-allowed disabled:opacity-45 flex items-center justify-center gap-2"
          >
            <Sparkles className="h-4 w-4" />
            Optimise & Calculate
          </button>
          {!hasActiveSubModel && (
            <p className="mt-2 text-[11px] text-[#625143]">Select a subwoofer model and quantity before optimising.</p>
          )}
          {shared?.completedBassAuthority?.authorityStatus === "STALE" && (
            <p className="mt-2 text-[11px] font-medium text-amber-700">Previous result needs recalculation — press Optimise & Calculate to update.</p>
          )}
        </>
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

          {/* Cancel button */}
          <button
            type="button"
            onClick={handleCancel}
            className="text-[11px] text-[#625143] hover:text-[#1B1A1A] underline underline-offset-2"
          >
            Cancel
          </button>
        </div>
      )}

      {/* ── Completion: Calibration Summary ── */}
      {isComplete && (
        <>
          <BassOptimisationSummary
            autoApplied={workflowState.autoApplied}
            noImprovementsFound={workflowState.noImprovementsFound}
            v2State={v2State}
            completedBassAuthority={shared?.completedBassAuthority}
            subwooferCount={
              Array.isArray(subwooferInstances)
                ? subwooferInstances.filter(
                    (i) => i?.enabled !== false && i?.model,
                  ).length
                : 0
            }
          />

          {/* ── Further Design Improvements (physical recommendations) ── */}
          {workflowState.recommendations && (
            <div className="mt-3">
              <FurtherImprovements
                recommendations={workflowState.recommendations}
                selection={v2State?.winner}
                currentInstances={subwooferInstances}
                roomDims={roomDims}
                selectedSubModel={frontSubsCfg?.model || rearSubsCfg?.model || null}
                commitInstances={commitInstances}
                commitSeating={commitSeating}
                commitSeatingProvenance={commitSeatingProvenance}
                hasCanonicalInstances={hasCanonicalInstances}
                appState={appState}
                shared={shared}
                amplifierPowerPerSubW={resolvedAmplifierPowerPerSubW}
                onRecalculate={handlePhysicalRecalculate}
              />
            </div>
          )}

          <div className="mt-3">
            <button
              type="button"
              onClick={handleReset}
              className="text-[11px] text-[#625143] hover:text-[#1B1A1A] underline underline-offset-2"
            >
              Re-optimise Bass
            </button>
          </div>
        </>
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

      {/* ── Cancelled state ── */}
      {isCancelledState && (
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

      {/* ── Engineering Mode (advanced diagnostics) ──
          The toggle lives in the Options panel so it can reveal engineering
          workflows across the app, not just Bass. When enabled there, the full
          Improve Bass Response V2 workflow is shown below the standard summary. */}
      {engineeringMode && (
        <div className="mt-4 pt-3 border-t border-[#E7E4DF]">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A] mb-2">
            Engineering Diagnostics
          </div>
          <ImproveBassResponseV2
            roomDims={roomDims}
            seatingPositions={seatingPositions}
            subwooferInstances={subwooferInstances}
            frontSubsCfg={frontSubsCfg}
            rearSubsCfg={rearSubsCfg}
            commitInstances={commitInstances}
            commitSeating={commitSeating}
            commitSeatingProvenance={commitSeatingProvenance}
            appliedSeatingProvenance={appState?.appliedSeatingProvenance}
            hasCanonicalInstances={hasCanonicalInstances}
            appState={appState}
            amplifierPowerPerSubW={resolvedAmplifierPowerPerSubW}
          />
        </div>
      )}

    </div>
  );
}