// improveBassV2Store.js
// State store for the V2 Improve Bass Response workflow.
// Manages: status, phase, progress, best-so-far, confirmed challengers,
// winner, error, snapshot, and cancellation.

import { useSyncExternalStore } from "react";

const listeners = new Set();
const states = new Map();

const keyFor = (projectId) => String(projectId || "free");

function emptyState(projectId) {
  return {
    projectId: keyFor(projectId),
    status: "idle", // idle | running | complete | cancelled | error | stale
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
  });
}

export function updateProgress(projectId, phase, label, current, total) {
  return publish(projectId, {
    phase,
    phaseLabel: label,
    progressCurrent: current || 0,
    progressTotal: total || 0,
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