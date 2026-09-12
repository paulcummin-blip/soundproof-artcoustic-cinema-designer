// improveBassV2Store.js
// State store for the V2 Improve Bass Response workflow.
// Manages: status, phase, progress, best-so-far, confirmed challengers,
// winner, error, snapshot, and cancellation.

import { useSyncExternalStore } from "react";
import { computeEta } from "./etaCalculator.js";

const listeners = new Set();
const states = new Map();

const MAX_ETA_SAMPLES = 10;

const keyFor = (projectId) => String(projectId || "free");

function emptyState(projectId) {
  return {
    projectId: keyFor(projectId),
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
  };
}

export function getImproveBassV2State(projectId) {
  const key = keyFor(projectId);
  if (!states.has(key)) states.set(key, emptyState(key));
  return states.get(key);
}

export function subscribeImproveBassV2(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish(projectId, patch) {
  const key = keyFor(projectId);
  const current = getImproveBassV2State(key);
  states.set(key, { ...current, ...patch, projectId: key });
  listeners.forEach((l) => l());
  return states.get(key);
}

export function setAwaitingStage2(projectId, snapshot) {
  return publish(projectId, {
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
  });
}

export function startImproveBassV2(projectId, snapshot) {
  return publish(projectId, {
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
  });
}

export function updateProgress(projectId, phase, label, current, total) {
  const state = getImproveBassV2State(projectId);
  const now = Date.now();
  const unitTimes = [...(state.unitTimes || [])];

  // Track per-unit completion time when progress advances
  if (state.lastProgressAt && current > (state.progressCurrent || 0)) {
    const duration = now - state.lastProgressAt;
    unitTimes.push(duration);
    if (unitTimes.length > MAX_ETA_SAMPLES) unitTimes.shift();
  }

  const eta = computeEta(unitTimes, current || 0, total || 0, phase);

  return publish(projectId, {
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

export function setBestSoFar(projectId, bestSoFar) {
  return publish(projectId, { bestSoFar });
}

export function addConfirmedChallenger(projectId, challenger) {
  const current = getImproveBassV2State(projectId);
  const confirmed = [...(current.confirmedChallengers || []), challenger];
  return publish(projectId, { confirmedChallengers: confirmed });
}

export function setWinner(projectId, winner) {
  return publish(projectId, {
    winner,
    status: "complete",
    completedAtMs: Date.now(),
  });
}

export function setRuntimeMetrics(projectId, runtimeMetrics) {
  return publish(projectId, { runtimeMetrics });
}

export function setPositionSearchPhase(projectId, phase) {
  return publish(projectId, { positionSearchPhase: phase });
}

export function setPositionExhaustion(projectId, exhausted, materialFound, bestPractical) {
  return publish(projectId, {
    subOptimisationExhausted: exhausted,
    materialSubImprovementFound: materialFound,
    bestPracticalSubResult: bestPractical,
  });
}

export function setStageVerdict(projectId, stageKey, verdict) {
  const state = getImproveBassV2State(projectId);
  const stageVerdicts = { ...(state.stageVerdicts || {}) };
  stageVerdicts[stageKey] = verdict;
  return publish(projectId, { stageVerdicts });
}

export function setCancelled(projectId) {
  return publish(projectId, {
    status: "cancelled",
    completedAtMs: Date.now(),
  });
}

export function setStale(projectId, message) {
  return publish(projectId, {
    status: "stale",
    error: message || "Design changed — optimisation result discarded",
    completedAtMs: Date.now(),
  });
}

export function setError(projectId, error) {
  return publish(projectId, {
    status: "error",
    error: error || "Optimisation could not be completed.",
    completedAtMs: Date.now(),
  });
}

export function requestCancel(projectId) {
  return publish(projectId, { cancelRequested: true });
}

export function isCancelRequested(projectId) {
  return getImproveBassV2State(projectId)?.cancelRequested === true;
}

export function resetImproveBassV2(projectId) {
  return publish(projectId, emptyState(projectId));
}

export function useImproveBassV2State(projectId) {
  return useSyncExternalStore(
    subscribeImproveBassV2,
    () => getImproveBassV2State(projectId),
    () => getImproveBassV2State(projectId),
  );
}