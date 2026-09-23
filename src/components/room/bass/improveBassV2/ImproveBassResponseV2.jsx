// ImproveBassResponseV2.jsx
// Main V2 Improve Bass Response UI component.
// Replaces the V1 "Find Better Positions" flow with the full V2 workflow:
// placement + all-pass phase + delay + polarity + trim search, canonical confirmation,
// primary-seat protection, and atomic apply.
//
// BLOCKER 3: Stale detection reads CURRENT project state via a ref, not a
// render closure. The latest design inputs are stored in a ref that's updated
// on every render, so the running engine always sees the latest state.
//
// BLOCKER 4: Null/empty worker results display a safe NO_WINNER message,
// never a blank complete state.
//
// BLOCKER 7: Cancelled jobs can never publish or apply — the store gates
// status transitions and the Apply button checks for a valid winner.

import React, { useCallback, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, AlertCircle, RotateCcw } from "lucide-react";
import { useSharedBassResults } from "@/components/room/bass/bassResultsStore";
import { useActiveProjectId } from "@/components/state/project-session";
import { getStage2State, subscribeStage2 } from "@/components/room/bass/stage2/stage2PlacementStore";
import { useSyncExternalStore } from "react";
import { buildAuthoritativeRspPosition } from "@/components/room/bass/authoritativeRspPosition";
import { runImproveBassV2 } from "./improveBassV2Engine";
import {
  startImproveBassV2,
  setAwaitingStage2,
  updateProgress,
  setBestSoFar,
  setWinner,
  setRuntimeMetrics,
  setOptimisationDiagnostics,
  setCancelled,
  setStale,
  setError,
  requestCancel,
  isCancelRequested,
  resetImproveBassV2,
  useImproveBassV2State,
} from "./improveBassV2Store";
import { requestBassHeavyAction, cancelBassHeavyAction } from "../bassHeavyActionStore";
import { isStage2ReadyForConsumption, waitForStage2Terminal } from "./stage2LifecycleOrchestrator";
import { buildOptimisedInstances } from "./improveBassV2Apply";
import { applyCalibrationTuning } from "./improveBassV2ApplyCalibration";
import { computeV2DesignFingerprint } from "./improveBassV2Fingerprint";
import { buildProvenance } from "./appliedProvenance";
import ImproveBassV2Progress from "./ImproveBassV2Progress";
import ImproveBassV2SimplifiedResults from "./ImproveBassV2SimplifiedResults";
import ImproveBassV2InfoPopover from "./ImproveBassV2InfoPopover";
import { generateRecommendation, publishRecommendation } from "@/components/recommendationEngine";
import ImproveBassV2CompletedInvestigation from "./ImproveBassV2CompletedInvestigation";
import OptimisationDiagnosticsReport from "./OptimisationDiagnosticsReport";
import { normaliseModelKey } from "@/components/models/speakers/registry";
import { DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W } from "@/components/utils/subwooferCapability";
import {
  computeCalibrationBasisFingerprint,
  extractCalibrationValues,
  resolveCalibrationStatus,
  CALIBRATION_STATUS,
} from "../calibrationAuthority/calibrationAuthority.js";
import {
  useCalibrationAuthority,
  markCalibrationOptimiserGenerated,
  markCalibrationStale,
  resetCalibrationAuthority,
} from "../calibrationAuthority/calibrationAuthorityStore.js";
import CalibrationAuthorityPanel from "../calibrationAuthority/CalibrationAuthorityPanel.jsx";

export default function ImproveBassResponseV2({
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
}) {
  const projectId = useActiveProjectId();
  const versionId = appState?.activeVersionId || null;
  const shared = useSharedBassResults();
  const state = useImproveBassV2State(projectId, versionId);
  const stage2 = useSyncExternalStore(
    subscribeStage2,
    () => getStage2State(projectId, versionId),
    () => getStage2State(projectId, versionId),
  );
  const runningRef = useRef(false);

  // Derive P14 target parameters from the shared bass results
  const p14Params = useMemo(() => {
    const requested = shared?.authoritative?.requested || {};
    const authority = shared?.completedBassAuthority || {};
    return {
      p14TargetBasis: requested.p14TargetBasis || authority.p14TargetBasis || "minimum",
      p14TargetLevel: requested.requestedLevel || requested.selectedP14Level || requested.p14TargetLevel || requested.selectedP14TargetLevel || authority.p14TargetLevel || 2,
      p14TargetDb: requested.selectedP14TargetDb || authority.p14TargetDb || 117,
      p18TargetBasis: requested.p18TargetBasis || requested.selectedP18TargetBasis || authority.p18TargetBasis || "minimum",
    };
  }, [shared?.authoritative?.requested, shared?.completedBassAuthority]);

  // Compute RSP position
  const rspPosition = useMemo(() => {
    if (!roomDims) return null;
    return buildAuthoritativeRspPosition(
      roomDims,
      appState?.mlpY_m,
      appState?.mlpX_m,
      appState?.designatedRspSeatId,
    );
  }, [roomDims, appState?.mlpY_m, appState?.mlpX_m, appState?.designatedRspSeatId]);

  const selectedSubModel = frontSubsCfg?.model || rearSubsCfg?.model || null;
  const subwooferBottomHeightM = frontSubsCfg?.bottomHeightM ?? rearSubsCfg?.bottomHeightM ?? 0;
  const resolvedAmplifierPowerPerSubW = Number.isFinite(Number(amplifierPowerPerSubW))
    ? Number(amplifierPowerPerSubW)
    : Number.isFinite(Number(appState?.splConfig?.subwooferAmplifierPowerW))
      ? Number(appState.splConfig.subwooferAmplifierPowerW)
      : DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W;

  // BLOCKER 3: Live stale detection — use a ref to always read the LATEST design
  // inputs at stale-check time. The ref is updated on every render, so the
  // running engine (which captured the callback at V2 start) always sees the
  // current project state, not the state from the render that started V2.
  const latestDesignRef = useRef({});
  latestDesignRef.current = {
    subwooferInstances,
    roomDims,
    seatingPositions,
    rspPosition,
    selectedSubModel,
    p14Params,
    amplifierPowerPerSubW: resolvedAmplifierPowerPerSubW,
  };

  const canStart = shared?.hasCurrentResult === true && !state?.status === "running";

  // ── Post-completion stale detection ──────────────────────────────────
  // After the run completes, a bass-relevant design change invalidates the
  // completed result. We compute the current design fingerprint and compare
  // it to the winner's applyFingerprint. If they differ, the completed
  // investigation is shown greyed and Apply controls are hidden.
  const currentDesignFingerprint = useMemo(() => {
    try {
      return computeV2DesignFingerprint({
        subwooferInstances,
        roomDims,
        seatingPositions,
        rspPosition,
        selectedSubModel,
        p14TargetBasis: p14Params.p14TargetBasis,
        p14TargetLevel: p14Params.p14TargetLevel,
        p14TargetDb: p14Params.p14TargetDb,
        p18TargetBasis: p14Params.p18TargetBasis,
        amplifierPowerPerSubW: resolvedAmplifierPowerPerSubW,
      });
    } catch {
      return null;
    }
  }, [subwooferInstances, roomDims, seatingPositions, rspPosition, selectedSubModel,
    p14Params, resolvedAmplifierPowerPerSubW]);

  const completedResultStale =
    state?.status === "complete"
    && !!state?.winner?.applyFingerprint
    && !!currentDesignFingerprint
    && currentDesignFingerprint !== state.winner.applyFingerprint;

  // ── Calibration Authority lifecycle ─────────────────────────────────
  // Calibration is part of the design, not a hidden optimiser setting.
  // The basis fingerprint tracks engineering inputs that determine whether
  // calibration is still valid — WITHOUT including the calibration values
  // themselves. When geometry changes, calibration becomes Stale.
  const calibrationBasisFingerprint = useMemo(() => {
    try {
      return computeCalibrationBasisFingerprint({
        subwooferInstances,
        roomDims,
        seatingPositions,
        rspPosition,
        selectedSubModel,
        p14TargetBasis: p14Params.p14TargetBasis,
        p14TargetLevel: p14Params.p14TargetLevel,
        p14TargetDb: p14Params.p14TargetDb,
        p18TargetBasis: p14Params.p18TargetBasis,
      });
    } catch {
      return null;
    }
  }, [subwooferInstances, roomDims, seatingPositions, rspPosition, selectedSubModel, p14Params]);

  const calibrationAuthority = useCalibrationAuthority(projectId, versionId);
  const calibrationStatus = useMemo(() => {
    if (!calibrationAuthority || !calibrationBasisFingerprint) return null;
    return resolveCalibrationStatus(calibrationAuthority, calibrationBasisFingerprint);
  }, [calibrationAuthority, calibrationBasisFingerprint]);

  // Auto-detect stale calibration when geometry changes
  React.useEffect(() => {
    if (!calibrationAuthority || !calibrationBasisFingerprint) return;
    if (calibrationAuthority.basisFingerprint !== calibrationBasisFingerprint) {
      markCalibrationStale(projectId, versionId,
        "Current calibration belongs to an earlier version of this design and is no longer authoritative.");
    }
  }, [calibrationAuthority, calibrationBasisFingerprint, projectId, versionId]);

  const handleRecalculateCalibration = useCallback(() => {
    // Recalculate = re-run the optimiser to produce fresh calibration
    handleStart();
  }, [handleStart]);

  const handleResetCalibration = useCallback(() => {
    if (!commitInstances || !hasCanonicalInstances) return;
    const reset = (subwooferInstances || []).map((inst) => ({
      ...inst,
      delayMs: 0,
      gainDb: 0,
      polarity: 1,
      phaseControlDeg: 0,
      tuningSource: "manual",
      appliedV2Provenance: null,
    }));
    commitInstances(reset, { front: { placementMode: "manual", isManual: true }, rear: { placementMode: "manual", isManual: true } });
    resetCalibrationAuthority(projectId, versionId);
  }, [commitInstances, hasCanonicalInstances, subwooferInstances, projectId, versionId]);

  // Stamp the Calibration Authority after a successful optimiser Apply.
  // The basis fingerprint is computed from the POST-apply design so the
  // authority is Current against the new geometry.
  const stampCalibrationAuthority = useCallback((nextInstances, candidateId, stageKey) => {
    try {
      const basisFp = computeCalibrationBasisFingerprint({
        subwooferInstances: nextInstances,
        roomDims,
        seatingPositions,
        rspPosition,
        selectedSubModel,
        p14TargetBasis: p14Params.p14TargetBasis,
        p14TargetLevel: p14Params.p14TargetLevel,
        p14TargetDb: p14Params.p14TargetDb,
        p18TargetBasis: p14Params.p18TargetBasis,
      });
      const values = extractCalibrationValues(nextInstances);
      markCalibrationOptimiserGenerated(projectId, versionId, {
        basisFingerprint: basisFp,
        candidateId,
        values,
        stageKey,
      });
    } catch {
      // If fingerprint computation fails, don't block the apply
    }
  }, [roomDims, seatingPositions, rspPosition, selectedSubModel, p14Params, projectId, versionId]);

  const handleStart = useCallback(async () => {
    if (runningRef.current) return;
    if (!shared?.hasCurrentResult || !rspPosition || !selectedSubModel) return;

    runningRef.current = true;

    const snapshot = {
      subwooferInstances,
      roomDims,
      selectedSubModel,
      currentAuthority: shared?.completedBassAuthority,
      p14TargetBasis: p14Params.p14TargetBasis,
      p14TargetLevel: p14Params.p14TargetLevel,
      p14TargetDb: p14Params.p14TargetDb,
      p18TargetBasis: p14Params.p18TargetBasis,
    };

    const startFingerprint = (() => {
      try {
        return computeV2DesignFingerprint({
          subwooferInstances,
          roomDims,
          seatingPositions,
          rspPosition,
          selectedSubModel,
          p14TargetBasis: p14Params.p14TargetBasis,
          p14TargetLevel: p14Params.p14TargetLevel,
          p14TargetDb: p14Params.p14TargetDb,
          p18TargetBasis: p14Params.p18TargetBasis,
          amplifierPowerPerSubW: resolvedAmplifierPowerPerSubW,
        });
      } catch {
        return null;
      }
    })();

    const getCurrentFingerprint = () => {
      try {
        const d = latestDesignRef.current;
        return computeV2DesignFingerprint({
          subwooferInstances: d.subwooferInstances,
          roomDims: d.roomDims,
          seatingPositions: d.seatingPositions,
          rspPosition: d.rspPosition,
          selectedSubModel: d.selectedSubModel,
          p14TargetBasis: d.p14Params?.p14TargetBasis,
          p14TargetLevel: d.p14Params?.p14TargetLevel,
          p14TargetDb: d.p14Params?.p14TargetDb,
          p18TargetBasis: d.p14Params?.p18TargetBasis,
          amplifierPowerPerSubW: d.amplifierPowerPerSubW,
        });
      } catch {
        return null;
      }
    };

    // ── Stage 2 lifecycle: reuse or request ───────────────────────────
    // Case A: valid current Stage 2 authority exists → reuse immediately.
    // Case B: no valid authority → request heavy action, wait for Stage 2
    //         to complete, then continue into V2 optimisation.
    let stage2Result = stage2;
    let placementFingerprint = stage2?.placementFingerprint;

    if (!isStage2ReadyForConsumption(stage2)) {
      // Case B: request Stage 2 through the existing heavy action lifecycle
      if (!shared.cacheKey) {
        setError(projectId, versionId, "Bass result is not ready — calculate parameter results first.");
        runningRef.current = false;
        return;
      }

      setAwaitingStage2(projectId, versionId, snapshot);
      requestBassHeavyAction(projectId, versionId, "optimise", shared.cacheKey);

      const waitResult = await waitForStage2Terminal(projectId, versionId, {
        isCancelled: () => isCancelRequested(projectId, versionId),
        getCurrentFingerprint,
        startFingerprint,
      });

      if (waitResult.status === "cancelled") {
        setCancelled(projectId, versionId);
        runningRef.current = false;
        return;
      }
      if (waitResult.status === "stale") {
        setStale(projectId, versionId, waitResult.message);
        runningRef.current = false;
        return;
      }
      if (waitResult.status === "error") {
        setError(projectId, versionId, waitResult.error);
        runningRef.current = false;
        return;
      }
      if (waitResult.status === "timeout") {
        setError(projectId, versionId, waitResult.error);
        runningRef.current = false;
        return;
      }

      // Stage 2 complete — consume the new authority
      stage2Result = waitResult.stage2;
      placementFingerprint = waitResult.stage2?.placementFingerprint;
    }

    // ── Continue into V2 finalist/local optimisation ──────────────────
    startImproveBassV2(projectId, versionId, snapshot);

    const params = {
      subwooferInstances,
      roomDims,
      seatingPositions,
      rspPosition,
      selectedSubModel,
      amplifierPowerPerSubW: resolvedAmplifierPowerPerSubW,
      subwooferBottomHeightM,
      p14TargetBasis: p14Params.p14TargetBasis,
      p14TargetLevel: p14Params.p14TargetLevel,
      p14TargetDb: p14Params.p14TargetDb,
      p18TargetBasis: p14Params.p18TargetBasis,
      currentAuthority: shared?.completedBassAuthority,
      currentCanonicalResult: shared?.optimisationResult,
      currentSources: shared?.authoritative?.sources,
      liveCacheKey: shared?.cacheKey,
      stage2Result,
      placementFingerprint,
    };

    const callbacks = {
      onProgress: (phase, label, current, total) => {
        updateProgress(projectId, versionId, phase, label, current, total);
      },
      isCancelled: () => isCancelRequested(projectId, versionId),
      onBestSoFar: (bestSoFar) => {
        setBestSoFar(projectId, versionId, bestSoFar);
      },
      // BLOCKER 3: Stale-job rejection — recompute the fingerprint from the
      // CURRENT design state on each check, reading from the ref (not the
      // render closure). If the design changed during V2 execution, the
      // fingerprint will differ from the start fingerprint.
      getCurrentFingerprint,
    };

    try {
      const result = await runImproveBassV2(projectId, versionId, params, callbacks);

      // BLOCKER 7: Cancelled jobs never publish a winner
      if (result.status === "cancelled") {
        setCancelled(projectId, versionId);
      } else if (result.status === "stale") {
        setStale(projectId, versionId, result.message);
      } else if (result.status === "error") {
        setError(projectId, versionId, result.error);
      } else if (result.status === "complete") {
        // BLOCKER 4: If selection is null/undefined, treat as NO_WINNER
        // (Current retained), never blank complete
        const selection = result.selection;
        if (!selection) {
          setWinner(projectId, versionId, {
            isCurrent: true,
            winner: null,
            message: "No verified material automatic improvement found.",
            confirmedResults: result.confirmedResults || [],
            currentResult: null,
          });
        } else {
          setWinner(projectId, versionId, { ...selection, applyFingerprint: startFingerprint,
            applyCandidateId: selection.winner?.candidateId ?? null,
            applyCalibrationId: selection.calibrationResult?.candidateId ?? null });
        }

        // ── Generate and persist the Recommendation Engine output ──────
        // Pure reasoning layer — consumes the selection, produces a
        // structured recommendation, and persists it alongside the canonical
        // bass result. Never recalculates engineering.
        try {
          const recommendation = generateRecommendation(selection, {
            context: {
              p14TargetDb: p14Params.p14TargetDb,
              subwooferCount: subwooferInstances?.filter((s) => s.enabled !== false).length || 0,
              roomDims,
            },
          });
          const resultFingerprint = selection?.currentResult?.inputIdentity
            || shared?.completedBassAuthority?.currentFingerprint
            || startFingerprint;
          if (resultFingerprint) {
            publishRecommendation(projectId, versionId, recommendation, resultFingerprint);
          }
        } catch {
          // Recommendation generation failure is non-fatal.
        }
      }
      // Store runtime metrics for acceptance verification
      if (result.runtimeMetrics) {
        setRuntimeMetrics(projectId, versionId, result.runtimeMetrics);
      }
      // Store developer/debug optimisation diagnostics report (read-only)
      if (result.optimisationDiagnostics) {
        setOptimisationDiagnostics(projectId, versionId, result.optimisationDiagnostics);
      }
    } catch (err) {
      setError(projectId, versionId, err.message);
    } finally {
      runningRef.current = false;
    }
  }, [projectId, versionId, shared, rspPosition, selectedSubModel, subwooferInstances, roomDims,
    seatingPositions, frontSubsCfg, rearSubsCfg, amplifierPowerPerSubW,
    subwooferBottomHeightM, p14Params, stage2]);

  const handleCancel = useCallback(() => {
    requestCancel(projectId, versionId);
    // If Stage 2 is being generated, cancel the heavy action so the
    // orchestrator's store listener fires and resolves the wait promise.
    cancelBassHeavyAction(projectId, versionId, "Improve Bass cancelled");
  }, [projectId, versionId]);

  const handleRetry = useCallback(() => {
    resetImproveBassV2(projectId, versionId);
  }, [projectId, versionId]);

  // A card supplies its own ID; look it up in the one confirmed collection.
  // Recheck the live design at mutation time, including edits after completion.
  const handleApply = useCallback((candidateId) => {
    const selection=state?.winner;
    const rec=selection?.recommendations?.find(r=>r.result.candidateId===candidateId);
    if(!rec || candidateId!==selection.winner?.candidateId || !rec.isWinner || !commitInstances || !hasCanonicalInstances) return;
    const d=latestDesignRef.current;
    const fingerprint=computeV2DesignFingerprint({...d,...d.p14Params});
    if(state?.status!=="complete" || !selection.applyFingerprint || fingerprint!==selection.applyFingerprint ||
       rec.result.inputIdentity!==fingerprint){
      setStale(projectId, versionId,"Design changed — recalculate the recommendation before Apply");return;
    }
    const _provenance=buildProvenance(
      rec.interventionType==="calibration"?"calibration":"subPositions",
      rec.result.candidateId,
      selection.applyFingerprint,
      fingerprint);
    const next=rec.interventionType==="calibration"
      ? applyCalibrationTuning(subwooferInstances,rec.result.appliedTuning,_provenance)
      : buildOptimisedInstances(rec.result,subwooferInstances,roomDims,selectedSubModel,_provenance);
    commitInstances(next,{front:{placementMode:"manual",isManual:true},rear:{placementMode:"manual",isManual:true}});
    stampCalibrationAuthority(next, rec.result.candidateId, rec.interventionType || "calibration");
  },[state?.status,state?.winner,commitInstances,hasCanonicalInstances,projectId,versionId,subwooferInstances,roomDims,selectedSubModel,stampCalibrationAuthority]);
  const handleApplyCalibration=handleApply;

  // ── Trade-off Apply handler ──────────────────────────────────────────
  // Allows applying a verified trade-off alternative (not the canonical winner).
  // The designer explicitly chose this priority — it passed all hard safety gates.
  // Same fingerprint/stale checks as the winner Apply.
  const handleApplyTradeOff = useCallback((candidateId) => {
    const selection=state?.winner;
    const entry=selection?.tradeOffs?.find(t=>t.candidateId===candidateId);
    if(!entry || !commitInstances || !hasCanonicalInstances) return;
    const d=latestDesignRef.current;
    const fingerprint=computeV2DesignFingerprint({...d,...d.p14Params});
    if(state?.status!=="complete" || !selection.applyFingerprint || fingerprint!==selection.applyFingerprint ||
       entry.result.inputIdentity!==fingerprint){
      setStale(projectId, versionId,"Design changed — recalculate the recommendation before Apply");return;
    }
    const _provenance=buildProvenance(
      entry.result.candidateKind==="calibration"?"calibration":"subPositions",
      entry.result.candidateId,
      selection.applyFingerprint,
      fingerprint);
    const next=entry.result.candidateKind==="calibration"
      ? applyCalibrationTuning(subwooferInstances,entry.result.appliedTuning,_provenance)
      : buildOptimisedInstances(entry.result,subwooferInstances,roomDims,selectedSubModel,_provenance);
    commitInstances(next,{front:{placementMode:"manual",isManual:true},rear:{placementMode:"manual",isManual:true}});
    stampCalibrationAuthority(next, entry.result.candidateId, entry.result.candidateKind || "calibration");
  },[state?.status,state?.winner,commitInstances,hasCanonicalInstances,projectId,versionId,subwooferInstances,roomDims,selectedSubModel,stampCalibrationAuthority]);

  // ── Per-stage Apply handler ──────────────────────────────────────────
  // Each stage has its own independent Apply action. The user may choose
  // independently which improvement to apply. Applying one stage does NOT
  // silently combine another recommendation.
  const handleApplyStage = useCallback((stageKey, result) => {
    if (!result || !commitInstances || !hasCanonicalInstances) return;
    const d = latestDesignRef.current;
    const fingerprint = computeV2DesignFingerprint({...d, ...d.p14Params});
    if (state?.status !== "complete" || !state?.winner?.applyFingerprint || fingerprint !== state.winner.applyFingerprint) {
      setStale(projectId, versionId, "Design changed — recalculate the recommendation before Apply");
      return;
    }

    if (stageKey === "phase" || stageKey === "delay" || stageKey === "gain") {
      // Apply calibration tuning (phase, delay or gain)
      const _provenance = buildProvenance(stageKey, result.candidateId, state.winner.applyFingerprint, fingerprint);
      const next = applyCalibrationTuning(subwooferInstances, result.appliedTuning || result.tuning || [], _provenance);
      commitInstances(next, {front:{placementMode:"manual",isManual:true},rear:{placementMode:"manual",isManual:true}});
      stampCalibrationAuthority(next, result.candidateId, stageKey);
    } else if (stageKey === "subPositions") {
      // Apply subwoofer position change
      const _provenance = buildProvenance("subPositions", result.candidateId, state.winner.applyFingerprint, fingerprint);
      const next = buildOptimisedInstances(result, subwooferInstances, roomDims, selectedSubModel, _provenance);
      commitInstances(next, {front:{placementMode:"manual",isManual:true},rear:{placementMode:"manual",isManual:true}});
      stampCalibrationAuthority(next, result.candidateId, "subPositions");
    } else if (stageKey === "combined") {
      // Combined apply: may include sub positions + retuned calibration,
      // OR calibration + seating, OR all three. Apply ALL components in
      // one atomic user action → single canonical state mutation.
      const _provenance = buildProvenance("subPositions", result.candidateId, state.winner.applyFingerprint, fingerprint);
      const hasCoords = (result.positionCoordinates?.length || result.coordinates?.length || 0) > 0;

      // Step 1: Apply sub positions + tuning (if coordinates exist) or
      // calibration tuning only (for calibration+seating combined candidates)
      let next;
      if (hasCoords) {
        next = buildOptimisedInstances(result, subwooferInstances, roomDims, selectedSubModel, _provenance);
      } else {
        next = applyCalibrationTuning(subwooferInstances, result.appliedTuning || result.tuning || [], _provenance);
      }
      commitInstances(next, {front:{placementMode:"manual",isManual:true},rear:{placementMode:"manual",isManual:true}});
      stampCalibrationAuthority(next, result.candidateId, "combined");

      // Step 2: Apply seating changes if present (calibration+seating combined)
      if (result.seatingPositions && commitSeating) {
        commitSeating(result.seatingPositions);
        const postMutationFingerprint = (() => {
          try {
            return computeV2DesignFingerprint({
              ...d,
              subwooferInstances: next,
              seatingPositions: result.seatingPositions,
              ...d.p14Params,
            });
          } catch { return null; }
        })();
        const seatingProvenance = buildProvenance(
          "seating_positions", result.candidateId,
          state.winner.applyFingerprint, postMutationFingerprint,
        );
        if (commitSeatingProvenance) commitSeatingProvenance(seatingProvenance);
      }
    } else if (stageKey === "seating") {
      // Apply seating position change — stamp provenance on successful apply.
      // Seating mutates seatingPositions (not subwooferInstances), so provenance
      // is stored at the project level via commitSeatingProvenance.
      //
      // CRITICAL TIMING: The appliedFingerprint must be the POST-mutation
      // fingerprint (the new current design fingerprint after seating moves),
      // NOT the pre-mutation fingerprint or the candidate preview fingerprint.
      // Sequence: validate baseline → commit seating → derive new fingerprint
      // → persist provenance with new fingerprint.
      if (commitSeating && result.seatingPositions) {
        // The confirmed seating candidate may include calibration that was
        // retuned for the moved seats. Commit both parts of the exact
        // candidate so the applied design can reproduce the preview.
        const tuning = result.appliedTuning || result.tuning || [];
        const next = applyCalibrationTuning(subwooferInstances, tuning);
        commitInstances(next, {front:{placementMode:"manual",isManual:true},rear:{placementMode:"manual",isManual:true}});
        commitSeating(result.seatingPositions);

        // Derive the NEW fingerprint from the complete applied candidate.
        const postMutationFingerprint = (() => {
          try {
            return computeV2DesignFingerprint({
              ...d,
              subwooferInstances: next,
              seatingPositions: result.seatingPositions,
              ...d.p14Params,
            });
          } catch {
            return null;
          }
        })();

        // Step F: Persist seating Apply provenance with the NEW fingerprint.
        // baselineFingerprint = run-start fingerprint (state.winner.applyFingerprint)
        // appliedFingerprint = post-mutation current design fingerprint
        const _provenance = buildProvenance(
          "seating_positions",
          result.candidateId,
          state.winner.applyFingerprint,
          postMutationFingerprint,
        );
        if (commitSeatingProvenance) commitSeatingProvenance(_provenance);
      }
    }
  }, [state?.status, state?.winner, commitInstances, commitSeating, commitSeatingProvenance, hasCanonicalInstances, projectId, versionId, subwooferInstances, roomDims, selectedSubModel]);

  // ── Post-Apply automatic recalculation state ──────────────────────────
  // Tracks whether a post-Apply canonical recalculation is in progress.
  // Set true when Apply Selected Changes commits state and triggers onCalculate.
  // Cleared when the shared bass results show a new current result (recalc done).
  const [postApplyRecalculating, setPostApplyRecalculating] = useState(false);

  // Clear post-apply state when the new result arrives
  React.useEffect(() => {
    if (postApplyRecalculating && shared?.hasCurrentResult && !shared?.calculationInProgress) {
      // The recalculation has completed — the new fingerprint is now current
      setPostApplyRecalculating(false);
    }
  }, [postApplyRecalculating, shared?.hasCurrentResult, shared?.calculationInProgress]);

  // ── Apply Candidate handler (exact previewed candidate) ─────────────
  // Applies the EXACT confirmed candidate from the live preview — no
  // recomposition from checkbox rows. The candidate displayed in
  // "WITH SELECTED CHANGES" is the candidate that gets applied.
  const handleApplyCandidate = useCallback((candidate) => {
    if (!candidate || !commitInstances || !hasCanonicalInstances) return;
    const selection = state?.winner;
    if (!selection) return;

    const d = latestDesignRef.current;
    const fingerprint = computeV2DesignFingerprint({ ...d, ...d.p14Params });
    if (state?.status !== "complete" || !selection.applyFingerprint || fingerprint !== selection.applyFingerprint) {
      setStale(projectId, versionId, "Design changed — recalculate the recommendation before Apply");
      return;
    }

    const _provenance = buildProvenance("subPositions", "preview-apply", selection.applyFingerprint, fingerprint);
    const hasCoords = (candidate.positionCoordinates?.length || candidate.coordinates?.length || 0) > 0;

    let next;
    if (hasCoords) {
      next = buildOptimisedInstances(candidate, subwooferInstances, roomDims, selectedSubModel, _provenance);
    } else {
      next = applyCalibrationTuning(subwooferInstances, candidate.appliedTuning || [], _provenance);
    }
    commitInstances(next, { front: { placementMode: "manual", isManual: true }, rear: { placementMode: "manual", isManual: true } });
    stampCalibrationAuthority(next, candidate.candidateId || "preview-apply", hasCoords ? "subPositions" : "calibration");

    if (candidate.seatingPositions && commitSeating) {
      commitSeating(candidate.seatingPositions);
      const postMutationFingerprint = (() => {
        try {
          return computeV2DesignFingerprint({
            ...d,
            subwooferInstances: next,
            seatingPositions: candidate.seatingPositions,
            ...d.p14Params,
          });
        } catch { return null; }
      })();
      const seatingProvenance = buildProvenance("seating_positions", "preview-apply", selection.applyFingerprint, postMutationFingerprint);
      if (commitSeatingProvenance) commitSeatingProvenance(seatingProvenance);
    }

    if (typeof window !== "undefined") {
      window.__IMPROVE_BASS_APPLY_AUDIT__ = {
        beforeFingerprint: fingerprint,
        appliedCandidateId: candidate.candidateId || "preview",
        hasCoords, hasSeating: !!candidate.seatingPositions,
        timestamp: Date.now(),
      };
    }

    setPostApplyRecalculating(true);
    if (shared?.onCalculate) {
      setTimeout(() => { shared.onCalculate(); }, 50);
    }
  }, [state?.status, state?.winner, commitInstances, commitSeating, commitSeatingProvenance,
      hasCanonicalInstances, projectId, versionId, subwooferInstances, roomDims, selectedSubModel, shared]);

  if (!shared?.hasCurrentResult) return null;

  const isRunning = state?.status === "running";
  const isAwaitingStage2 = state?.status === "awaiting_stage2";
  const isComplete = state?.status === "complete";
  const isError = state?.status === "error";
  const isCancelled = state?.status === "cancelled";
  const isStale = state?.status === "stale";
  const isBusy = isRunning || isAwaitingStage2;

  return (
    <div className="mt-3 rounded-lg border border-[#D9D5CE] bg-white px-4 py-4">
      <div className="flex items-center gap-1.5">
        <div className="text-[13px] font-semibold text-[#1B1A1A]">Improve Bass Response</div>
        {isComplete && state?.winner && (
          <ImproveBassV2InfoPopover
            state={state}
            selection={state?.winner}
            stale={completedResultStale}
            currentInstances={subwooferInstances}
            roomDims={roomDims}
            appliedSeatingProvenance={appliedSeatingProvenance}
          />
        )}
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-[#625143]">
        Test practical placement, timing, polarity and level improvements before recommending more hardware.
      </p>

      {/* ── Calibration Authority lifecycle panel ── */}
      {/* Calibration is part of the design, not a hidden optimiser setting. */}
      {calibrationAuthority && (
        <CalibrationAuthorityPanel
          authority={calibrationAuthority}
          isStale={calibrationStatus?.isStale || false}
          staleReason={calibrationStatus?.staleReason || null}
          onRecalculate={handleRecalculateCalibration}
          onReset={handleResetCalibration}
          busy={isBusy}
        />
      )}

      <div className="mt-3">
        <Button
          type="button"
          className="w-full bg-[#213428] text-white hover:bg-[#3E4349]"
          onClick={handleStart}
          disabled={isBusy || !rspPosition || !selectedSubModel}
        >
          <Sparkles className="h-4 w-4 mr-1.5" />
          {isAwaitingStage2 ? "Preparing placement…" : isRunning ? "Optimising…" : "Improve Bass Response"}
        </Button>
      </div>

      {isBusy && (
        <ImproveBassV2Progress state={state} onCancel={handleCancel} />
      )}

      {/* ── Completed investigation — persists in all terminal states ── */}
      {/* Shows the full stage checklist with verdicts + numerical results. */}
      {/* Mounted alongside the results (complete) or error messages. */}
      {isComplete && state?.winner && !completedResultStale && (
        <ImproveBassV2SimplifiedResults
          selection={state.winner}
          currentInstances={subwooferInstances}
          roomDims={roomDims}
          seatingPositions={seatingPositions}
          selectedSubModel={selectedSubModel}
          onApplyCandidate={handleApplyCandidate}
          stale={completedResultStale}
          projectId={projectId}
          versionId={versionId}
          rspPosition={rspPosition}
          amplifierPowerPerSubW={resolvedAmplifierPowerPerSubW}
          subwooferBottomHeightM={subwooferBottomHeightM}
          p14TargetBasis={p14Params.p14TargetBasis}
          p14TargetLevel={p14Params.p14TargetLevel}
          p14TargetDb={p14Params.p14TargetDb}
          p18TargetBasis={p14Params.p18TargetBasis}
          currentDesignFingerprint={currentDesignFingerprint}
        />
      )}

      {/* ── Post-Apply automatic recalculation progress ── */}
      {postApplyRecalculating && shared?.calculationInProgress && (
        <div className="mt-3 rounded-md border border-[#213428]/20 bg-[#E7F0EC] p-3" data-post-apply-recalc="true">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-[#213428] border-t-transparent rounded-full animate-spin flex-shrink-0" />
            <span className="text-[12px] font-semibold text-[#213428]">
              {shared?.calculationPhaseLabel || "Recalculating bass performance…"}
            </span>
          </div>
          <p className="mt-1 text-[10px] text-[#625143] ml-6">
            Applying your changes and recalculating seat results automatically.
          </p>
        </div>
      )}

      {/* ── Developer/debug optimisation diagnostics (read-only) ── */}
      {isComplete && state?.optimisationDiagnostics && (
        <OptimisationDiagnosticsReport report={state.optimisationDiagnostics} />
      )}

      {isCancelled && (
        <>
          <ImproveBassV2CompletedInvestigation state={state} selection={state?.winner} currentInstances={subwooferInstances} roomDims={roomDims} appliedSeatingProvenance={appliedSeatingProvenance} />
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-700" />
              <span className="text-[12px] font-semibold text-amber-800">Optimisation cancelled</span>
            </div>
            <p className="mt-1 text-[10px] leading-relaxed text-amber-700">
              Current design remains unchanged. Best-so-far results retained for diagnostics.
            </p>
            <Button type="button" size="sm" variant="outline" onClick={handleRetry} className="mt-2 text-[11px]">
              <RotateCcw className="h-3 w-3 mr-1" />
              Retry
            </Button>
          </div>
        </>
      )}

      {isStale && (
        <>
          <ImproveBassV2CompletedInvestigation state={state} selection={state?.winner} currentInstances={subwooferInstances} roomDims={roomDims} appliedSeatingProvenance={appliedSeatingProvenance} />
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-700" />
              <span className="text-[12px] font-semibold text-amber-800">Design changed — optimisation result discarded</span>
            </div>
            <p className="mt-1 text-[10px] leading-relaxed text-amber-700">
              The room, seating, subwoofers, or target changed during optimisation. The result was rejected to prevent applying a stale recommendation. Current design remains untouched.
            </p>
            <Button type="button" size="sm" variant="outline" onClick={handleRetry} className="mt-2 text-[11px]">
              <RotateCcw className="h-3 w-3 mr-1" />
              Retry
            </Button>
          </div>
        </>
      )}

      {isError && (
        <>
          <ImproveBassV2CompletedInvestigation state={state} selection={state?.winner} currentInstances={subwooferInstances} roomDims={roomDims} appliedSeatingProvenance={appliedSeatingProvenance} />
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-700" />
              <span className="text-[12px] font-semibold text-red-800">Optimisation incomplete — retry</span>
            </div>
            <p className="mt-1 text-[10px] leading-relaxed text-red-700">{state?.error}</p>
            <Button type="button" size="sm" variant="outline" onClick={handleRetry} className="mt-2 text-[11px]">
              <RotateCcw className="h-3 w-3 mr-1" />
              Retry
            </Button>
          </div>
        </>
      )}
    </div>
  );
}