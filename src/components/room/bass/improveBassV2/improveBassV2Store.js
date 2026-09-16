// improveBassV2Store.js
// State store for the V2 Improve Bass Response workflow.
// Manages: status, phase, progress, best-so-far, confirmed challengers,
// winner, error, snapshot, and cancellation.
// Version-aware: all state is keyed by (projectId, versionId) via bassCacheKey.

import { useSyncExternalStore } from "react";
import { computeEta } from "./etaCalculator.js";
import { bassCacheKey } from "../bassCacheKey";

const listeners = new Set();
const states = new Map();

const MAX_ETA_SAMPLES = 10;

function emptyState(projectId, versionId) {
  return {
    projectId: bassCacheKey(projectId, versionId),
    status: "idle", // idle | awaiting_stage2 | running | complete | cancelled | error | stale
    phase: "idle", // reviewing | testing_positions | optimising_timing | testing_polarity | balancing_levels | confirming | finalising
    phaseLabel: "",
    progressCurrent: 0,
    progressTotal: 0,
    bestSoFar: null,
    confirmedChallengers: [],
    winner: null,
    error: null,
    snapshot: null,
    startedAtMs: null,
    completedAtMs: null,
    cancelRequested: false,
    etaStatus: "estimating",
    etaSeconds: null,
    unitTimes: [],
    lastProgressAt: null,
    // Stage 11B position search state — per-phase detailed tracking
    positionSearchPhase: null, // null | "symmetric" | "asymmetric-pair" | "individual"
    subOptimisationExhausted: false,
    materialSubImprovementFound: false,
    bestPracticalSubResult: null,
    // User-facing stage verdicts — published by the engine at stage transitions.
    // Keys: 'phase_polarity' | 'delays' | 'gain' | 'sub_positions' | 'seating_positions' | 'comparing' | 'preparing'
    // Values: 'improvement' | 'no_improvement' | 'done' | null
    stageVerdicts: {},
    // Runtime metrics from the last V2 run (placementFingerprintUsed,
    // stage2TransfersReused, etc.) — set when the run reaches a terminal state.
    runtimeMetrics: null,
    // Developer/debug optimisation diagnostics report from the last V2 run.
    // Read-only transform of the engine's selection + diagnostics. Not user-facing.
    optimisationDiagnostics: null,
  };
}

export function getImproveBassV2State(projectId, versionId) {
  const key = bassCacheKey(projectId, versionId);
  if (!states.has(key)) states.set(key, emptyState(projectId, versionId));
  return states.get(key);
}

export function subscribeImproveBassV2(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish(projectId, versionId, patch) {
  const key = bassCacheKey(projectId, versionId);
  const current = getImproveBassV2State(projectId, versionId);
  states.set(key, { ...current, ...patch, projectId: key });
  listeners.forEach((l) => l());
  return states.get(key);
}

export function setAwaitingStage2(projectId, versionId, snapshot) {
  return publish(projectId, versionId, {
    status: "awaiting_stage2",
    phase: "awaiting_stage2",
    phaseLabel: "Improving bass response",
    progressCurrent: 0,
    progressTotal: 0,
    bestSoFar: null,
    confirmedChallengers: [],
    winner: null,
    error: null,
    snapshot,
    startedAtMs: Date.now(),
    completedAtMs: null,
    cancelRequested: false,
    // Reset previous-run investigation state so the new run starts clean.
    stageVerdicts: {},
    positionSearchPhase: null,
    subOptimisationExhausted: false,
    materialSubImprovementFound: false,
    bestPracticalSubResult: null,
    runtimeMetrics: null,
    optimisationDiagnostics: null,
  });
}

export function startImproveBassV2(projectId, versionId, snapshot) {
  return publish(projectId, versionId, {
    status: "running",
    phase: "reviewing",
    phaseLabel: "Reviewing current design",
    progressCurrent: 0,
    progressTotal: 0,
    bestSoFar: null,
    confirmedChallengers: [],
    winner: null,
    error: null,
    snapshot,
    startedAtMs: Date.now(),
    completedAtMs: null,
    cancelRequested: false,
    // Reset previous-run investigation state so the new run starts clean.
    stageVerdicts: {},
    positionSearchPhase: null,
    subOptimisationExhausted: false,
    materialSubImprovementFound: false,
    bestPracticalSubResult: null,
    runtimeMetrics: null,
    optimisationDiagnostics: null,
  });
}

export function updateProgress(projectId, versionId, phase, label, current, total) {
  const state = getImproveBassV2State(projectId, versionId);
  const now = Date.now();
  const unitTimes = [...(state.unitTimes || [])];

  // Track per-unit completion time when progress advances
  if (state.lastProgressAt && current > (state.progressCurrent || 0)) {
    const duration = now - state.lastProgressAt;
    unitTimes.push(duration);
    if (unitTimes.length > MAX_ETA_SAMPLES) unitTimes.shift();
  }

  const eta = computeEta(unitTimes, current || 0, total || 0, phase);

  return publish(projectId, versionId, {
    phase,
    phaseLabel: label,
    progressCurrent: current || 0,
    progressTotal: total || 0,
    lastProgressAt: now,
    unitTimes,
    etaStatus: eta.status,
    etaSeconds: eta.etaSeconds,
  });
}

export function setBestSoFar(projectId, versionId, bestSoFar) {
  return publish(projectId, versionId, { bestSoFar });
}

export function addConfirmedChallenger(projectId, versionId, challenger) {
  const current = getImproveBassV2State(projectId, versionId);
  const confirmed = [...(current.confirmedChallengers || []), challenger];
  return publish(projectId, versionId, { confirmedChallengers: confirmed });
}

export function setWinner(projectId, versionId, winner) {
  return publish(projectId, versionId, {
    winner,
    status: "complete",
    completedAtMs: Date.now(),
  });
}

export function setRuntimeMetrics(projectId, versionId, runtimeMetrics) {
  return publish(projectId, versionId, { runtimeMetrics });
}

export function setOptimisationDiagnostics(projectId, versionId, report) {
  return publish(projectId, versionId, { optimisationDiagnostics: report });
}

export function setPositionSearchPhase(projectId, versionId, phase) {
  return publish(projectId, versionId, { positionSearchPhase: phase });
}

export function setPositionExhaustion(projectId, versionId, exhausted, materialFound, bestPractical) {
  return publish(projectId, versionId, {
    subOptimisationExhausted: exhausted,
    materialSubImprovementFound: materialFound,
    bestPracticalSubResult: bestPractical,
  });
}

export function setStageVerdict(projectId, versionId, stageKey, verdict) {
  const state = getImproveBassV2State(projectId, versionId);
  const stageVerdicts = { ...(state.stageVerdicts || {}) };
  stageVerdicts[stageKey] = verdict;
  return publish(projectId, versionId, { stageVerdicts });
}

export function setCancelled(projectId, versionId) {
  return publish(projectId, versionId, {
    status: "cancelled",
    completedAtMs: Date.now(),
  });
}

export function setStale(projectId, versionId, message) {
  return publish(projectId, versionId, {
    status: "stale",
    error: message || "Design changed — optimisation result discarded",
    completedAtMs: Date.now(),
  });
}

export function setError(projectId, versionId, error) {
  return publish(projectId, versionId, {
    status: "error",
    error: error || "Optimisation could not be completed.",
    completedAtMs: Date.now(),
  });
}

export function requestCancel(projectId, versionId) {
  return publish(projectId, versionId, { cancelRequested: true });
}

export function isCancelRequested(projectId, versionId) {
  return getImproveBassV2State(projectId, versionId)?.cancelRequested === true;
}

export function resetImproveBassV2(projectId, versionId) {
  return publish(projectId, versionId, emptyState(projectId, versionId));
}

export function useImproveBassV2State(projectId, versionId) {
  return useSyncExternalStore(
    subscribeImproveBassV2,
    () => getImproveBassV2State(projectId, versionId),
    () => getImproveBassV2State(projectId, versionId),
  );
}