// optimiseWorkflowOrchestrator.js
// Orchestration logic for the unified Optimise & Calculate workflow.
//
// This module wraps the EXISTING V2 optimisation engine (runImproveBassV2)
// without modifying it. It replicates the essential Stage 2 lifecycle
// management from ImproveBassResponseV2.handleStart so the new workflow can
// trigger the optimisation programmatically.
//
// After the V2 engine returns, this module:
//   1. Extracts per-stage results via buildStageResults
//   2. Auto-applies calibration tuning (phase + delay + gain) from the winner
//   3. Identifies optional user-decision recommendations (positions, seating)
//
// The engine, calculations, RP22 grading, and publication are NOT changed.

import { runImproveBassV2 } from "../improveBassV2/improveBassV2Engine";
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
  isCancelRequested,
} from "../improveBassV2/improveBassV2Store";
import { requestBassHeavyAction, cancelBassHeavyAction } from "../bassHeavyActionStore";
import { isStage2ReadyForConsumption, waitForStage2Terminal } from "../improveBassV2/stage2LifecycleOrchestrator";
import { getStage2State, subscribeStage2 } from "../stage2/stage2PlacementStore";
import { buildStageResults } from "../improveBassV2/improveBassV2StageAuthority";
import { applyCalibrationTuning, buildCalibrationChangeSummary } from "../improveBassV2/improveBassV2ApplyCalibration";
import { buildProvenance } from "../improveBassV2/appliedProvenance";
import { computeV2DesignFingerprint } from "../improveBassV2/improveBassV2Fingerprint";
import { buildAuthoritativeRspPosition } from "../authoritativeRspPosition";
import { normalisePhaseControlDeg } from "../../../../bass/core/subwooferPhaseControl";
import { classifyOptimisationStage } from "./optimisationStageClassifier";
import { generateRecommendation } from "@/components/recommendationEngine";
import { publishRecommendation } from "@/components/recommendationEngine";
import { identifyProblem } from "@/components/recommendationEngine/recommendationProblem";
import { classifyCorrectability } from "../improveBassV2/correctabilityClassifier";

/**
 * Run the V2 optimisation engine and return the selection result.
 *
 * This replicates the essential logic from ImproveBassResponseV2.handleStart:
 *   - Stage 2 lifecycle (reuse or request + wait)
 *   - runImproveBassV2 call with correct params
 *   - Result handling (winner, error, etc.)
 *
 * @param {object} opts
 * @returns {Promise<object>} { status, selection, runtimeMetrics, optimisationDiagnostics }
 */
export async function runOptimisation(opts) {
  const {
    projectId,
    versionId,
    shared,
    subwooferInstances,
    roomDims,
    seatingPositions,
    frontSubsCfg,
    rearSubsCfg,
    amplifierPowerPerSubW,
    subwooferBottomHeightM,
    appState,
  } = opts;

  const rspPosition = buildAuthoritativeRspPosition(
    roomDims,
    appState?.mlpY_m,
    appState?.mlpX_m,
    appState?.designatedRspSeatId,
  );

  const selectedSubModel = frontSubsCfg?.model || rearSubsCfg?.model || null;

  // Derive P14 target parameters from the shared bass results
  const requested = shared?.authoritative?.requested || {};
  const authority = shared?.completedBassAuthority || {};
  const p14Params = {
    p14TargetBasis: requested.p14TargetBasis || authority.p14TargetBasis || "minimum",
    p14TargetLevel: requested.requestedLevel || requested.selectedP14Level || requested.p14TargetLevel || requested.selectedP14TargetLevel || authority.p14TargetLevel || 2,
    p14TargetDb: requested.selectedP14TargetDb || authority.p14TargetDb || 117,
    p18TargetBasis: requested.p18TargetBasis || requested.selectedP18TargetBasis || authority.p18TargetBasis || "minimum",
  };

  if (!shared?.hasCurrentResult || !rspPosition || !selectedSubModel) {
    return { status: "error", error: "Bass calculation is not ready — calculate parameter results first." };
  }

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
        subwooferInstances, roomDims, seatingPositions, rspPosition, selectedSubModel,
        p14TargetBasis: p14Params.p14TargetBasis, p14TargetLevel: p14Params.p14TargetLevel,
        p14TargetDb: p14Params.p14TargetDb, p18TargetBasis: p14Params.p18TargetBasis,
        amplifierPowerPerSubW: amplifierPowerPerSubW || frontSubsCfg?.amplifierPowerW || 0,
      });
    } catch { return null; }
  })();

  // ── Stage 2 lifecycle: reuse or request ──
  let stage2Result = getStage2State(projectId, versionId);
  let placementFingerprint = stage2Result?.placementFingerprint;

  if (!isStage2ReadyForConsumption(stage2Result)) {
    if (!shared.cacheKey) {
      return { status: "error", error: "Bass result is not ready — calculate parameter results first." };
    }

    setAwaitingStage2(projectId, versionId, snapshot);
    requestBassHeavyAction(projectId, versionId, "optimise", shared.cacheKey);

    const getCurrentFingerprint = () => {
      try {
        return computeV2DesignFingerprint({
          subwooferInstances, roomDims, seatingPositions, rspPosition, selectedSubModel,
          p14TargetBasis: p14Params.p14TargetBasis, p14TargetLevel: p14Params.p14TargetLevel,
          p14TargetDb: p14Params.p14TargetDb, p18TargetBasis: p14Params.p18TargetBasis,
          amplifierPowerPerSubW: amplifierPowerPerSubW || frontSubsCfg?.amplifierPowerW || 0,
        });
      } catch { return null; }
    };

    const waitResult = await waitForStage2Terminal(projectId, versionId, {
      isCancelled: () => isCancelRequested(projectId, versionId),
      getCurrentFingerprint,
      startFingerprint,
    });

    if (waitResult.status === "cancelled") {
      setCancelled(projectId, versionId);
      return { status: "cancelled" };
    }
    if (waitResult.status === "stale") {
      setStale(projectId, versionId, waitResult.message);
      return { status: "stale" };
    }
    if (waitResult.status === "error" || waitResult.status === "timeout") {
      setError(projectId, versionId, waitResult.error);
      return { status: "error", error: waitResult.error };
    }

    stage2Result = waitResult.stage2;
    placementFingerprint = waitResult.stage2?.placementFingerprint;
  }

  // ── Compute correctability BEFORE the optimisation ──
  // The Physical Recoverability Assessment is the authoritative input to the
  // EQ optimisation. It determines whether EQ is physically appropriate before
  // the search begins. The legacy protection modules consume this result
  // instead of independently deciding whether EQ is permitted.
  let correctabilityAssessment = null;
  try {
    const baseline = shared?.optimisationResult || null;
    if (baseline) {
      const problem = identifyProblem(baseline, {
        p14TargetDb: p14Params.p14TargetDb,
        p18TargetHz: null,
      });
      correctabilityAssessment = classifyCorrectability(
        problem,
        baseline,
        { p14TargetDb: p14Params.p14TargetDb },
      );
    }
  } catch {
    // Correctability classification failure is non-fatal.
  }

  // ── Continue into V2 finalist/local optimisation ──
  startImproveBassV2(projectId, versionId, snapshot);

  const params = {
    subwooferInstances,
    roomDims,
    seatingPositions,
    rspPosition,
    selectedSubModel,
    amplifierPowerPerSubW: amplifierPowerPerSubW || frontSubsCfg?.amplifierPowerW || 0,
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
    correctabilityAssessment,
  };

  const callbacks = {
    onProgress: (phase, label, current, total) => {
      updateProgress(projectId, versionId, phase, label, current, total);
    },
    isCancelled: () => isCancelRequested(projectId, versionId),
    onBestSoFar: (bestSoFar) => {
      setBestSoFar(projectId, versionId, bestSoFar);
    },
    getCurrentFingerprint: () => {
      try {
        return computeV2DesignFingerprint({
          subwooferInstances, roomDims, seatingPositions, rspPosition, selectedSubModel,
          p14TargetBasis: p14Params.p14TargetBasis, p14TargetLevel: p14Params.p14TargetLevel,
          p14TargetDb: p14Params.p14TargetDb, p18TargetBasis: p14Params.p18TargetBasis,
          amplifierPowerPerSubW: amplifierPowerPerSubW || frontSubsCfg?.amplifierPowerW || 0,
        });
      } catch { return null; }
    },
  };

  try {
    const result = await runImproveBassV2(projectId, versionId, params, callbacks);

    if (result.status === "cancelled") {
      setCancelled(projectId, versionId);
    } else if (result.status === "stale") {
      setStale(projectId, versionId, result.message);
    } else if (result.status === "error") {
      setError(projectId, versionId, result.error);
    } else if (result.status === "complete") {
      const selection = result.selection;

      // ── Compute correctability classification ──────────────────────
      // The optimiser owns correctability. The classification is computed
      // from the baseline result and design objectives, then attached to
      // the selection as the authoritative correctability output.
      // ADI consumes this classification and restates it — it never
      // classifies independently.
      if (selection) {
        try {
          const baseline = selection.currentResult || null;
          const problem = identifyProblem(baseline, {
            p14TargetDb: p14Params.p14TargetDb,
            p18TargetHz: null,
          });
          selection.correctabilityClassification = classifyCorrectability(
            problem,
            baseline,
            { p14TargetDb: p14Params.p14TargetDb },
          );
          selection.noMaterialImprovement = !selection.winner;
        } catch {
          // Correctability classification failure is non-fatal.
        }
      }

      if (!selection) {
        setWinner(projectId, versionId, {
          isCurrent: true,
          winner: null,
          message: "No verified material automatic improvement found.",
          confirmedResults: result.confirmedResults || [],
          currentResult: null,
        });
      } else {
        setWinner(projectId, versionId, {
          ...selection,
          applyFingerprint: startFingerprint,
          applyCandidateId: selection.winner?.candidateId ?? null,
          applyCalibrationId: selection.calibrationResult?.candidateId ?? null,
        });
      }

      // ── Generate and persist the Recommendation Engine output ──────
      // The Recommendation Engine is a pure reasoning layer that consumes
      // the optimiser's selection and produces a structured recommendation
      // object. It never recalculates engineering — it interprets existing
      // results. The output is persisted alongside the canonical bass result.
      //
      // The recommendation is published with the PRE-auto-apply fingerprint
      // here. The caller (OptimiseAndCalculate) will re-publish it with the
      // POST-recalculation fingerprint after the auto-apply + recalculate
      // phases complete, so the recommendation survives a page refresh
      // against the current (final) fingerprint.
      let generatedRecommendation = null;
      try {
        generatedRecommendation = generateRecommendation(selection, {
          context: {
            p14TargetDb: p14Params.p14TargetDb,
            p18TargetHz: null, // P18 target Hz not directly available here
            subwooferCount: subwooferInstances?.filter((s) => s.enabled !== false).length || 0,
            roomDims,
          },
        });
        const resultFingerprint = selection?.currentResult?.inputIdentity
          || shared?.completedBassAuthority?.currentFingerprint
          || startFingerprint;
        if (resultFingerprint) {
          publishRecommendation(projectId, versionId, generatedRecommendation, resultFingerprint);
        }
      } catch {
        // Recommendation generation failure is non-fatal — the optimiser
        // result is still valid. The recommendation is a reasoning layer,
        // not a calculation.
      }
      // Attach to the result so the caller can re-publish after recalculation.
      result.recommendation = generatedRecommendation;
    }

    if (result.runtimeMetrics) {
      setRuntimeMetrics(projectId, versionId, result.runtimeMetrics);
    }
    if (result.optimisationDiagnostics) {
      setOptimisationDiagnostics(projectId, versionId, result.optimisationDiagnostics);
    }

    return result;
  } catch (err) {
    setError(projectId, versionId, err.message);
    return { status: "error", error: err.message };
  }
}

/**
 * Extract the calibration tuning from the V2 selection winner.
 *
 * The winner may be a calibration-only candidate, a position+calibration
 * combined candidate, or a seating+calibration combined candidate. In all
 * cases, the winner's `appliedTuning` contains the combined phase+delay+gain
 * tuning. We auto-apply ONLY the tuning (not positions or seating).
 *
 * @param {object} selection - V2 engine selection (state.winner)
 * @returns {Array|null} the appliedTuning array, or null if no calibration
 */
export function extractCalibrationTuning(selection) {
  if (!selection) return null;
  const winner = selection.winner;
  if (!winner) return null;
  const tuning = winner.appliedTuning || winner.tuning || [];
  return Array.isArray(tuning) && tuning.length > 0 ? tuning : null;
}

/**
 * Build the auto-apply summary from the V2 selection.
 *
 * @param {object} selection - V2 engine selection
 * @param {Array} currentInstances - current subwooferInstances
 * @returns {object} { tuning, changeSummary, hasPositions, hasSeating, winnerResult, stageResults }
 */
export function buildAutoApplySummary(selection, currentInstances) {
  if (!selection) {
    return { tuning: null, changeSummary: null, hasPositions: false, hasSeating: false, winnerResult: null, stageResults: null };
  }

  const stageResults = buildStageResults(selection);
  const winner = selection.winner;
  const tuning = extractCalibrationTuning(selection);
  // Physical recommendations must use their own canonically confirmed stage
  // result. The overall calibration winner can carry the current coordinates,
  // which previously produced a false “Move subwoofers” Apply card even when
  // the position stage reported no material improvement.
  const safePhysicalClassifications = new Set([
    "IMPROVES_BOTH",
    "IMPROVES_P19",
    "IMPROVES_P20",
  ]);
  const positionClassification = classifyOptimisationStage(
    selection.currentResult,
    stageResults?.subPositions?.result,
  );
  const seatingClassification = classifyOptimisationStage(
    selection.currentResult,
    stageResults?.seating?.result,
  );
  const hasPositions = stageResults?.subPositions?.verdict === "improvement"
    && safePhysicalClassifications.has(positionClassification);
  const hasSeating = stageResults?.seating?.verdict === "improvement"
    && safePhysicalClassifications.has(seatingClassification);

  let changeSummary = null;
  if (tuning) {
    try {
      changeSummary = buildCalibrationChangeSummary(currentInstances, tuning);
    } catch {
      changeSummary = null;
    }
  }

  return { tuning, changeSummary, hasPositions, hasSeating, winnerResult: winner, stageResults };
}

/**
 * Auto-apply calibration tuning to subwooferInstances.
 *
 * @param {Array} currentInstances - current subwooferInstances
 * @param {Array} tuning - appliedTuning from the winner
 * @param {function} commitInstances - state commit function
 * @param {string} fingerprint - design fingerprint for provenance
 * @returns {Array|null} the new instances, or null if nothing to apply
 */
export function autoApplyCalibration(currentInstances, tuning, commitInstances, fingerprint) {
  if (!Array.isArray(tuning) || tuning.length === 0 || !commitInstances) return null;

  const provenance = buildProvenance("calibration", "auto-optimise", fingerprint, fingerprint);
  const next = applyCalibrationTuning(currentInstances, tuning, provenance);
  commitInstances(next, {
    front: { placementMode: "manual", isManual: true },
    rear: { placementMode: "manual", isManual: true },
  });
  return next;
}

/**
 * Check whether the V2 selection has any calibration improvement.
 */
export function hasCalibrationImprovement(stageResults) {
  if (!stageResults) return false;
  return stageResults.phase?.verdict === "improvement"
    || stageResults.delay?.verdict === "improvement"
    || stageResults.gain?.verdict === "improvement";
}

/**
 * Check whether the V2 selection has any position or seating recommendation.
 */
export function hasPhysicalRecommendations(autoApplySummary) {
  if (!autoApplySummary) return false;
  return autoApplySummary.hasPositions || autoApplySummary.hasSeating;
}