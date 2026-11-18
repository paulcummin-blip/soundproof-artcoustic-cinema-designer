// optimiseWorkflowStore.js
// State store for the unified Optimise & Calculate workflow.
//
// Tracks the high-level workflow phases (calculating → optimising → applying →
// recalculating → publishing → complete) and the summary of what was
// auto-applied plus optional user-decision recommendations.
//
// The V2 optimisation engine (runImproveBassV2) is unchanged — this store only
// tracks the orchestration layer above it.

import { useSyncExternalStore } from "react";
import { bassCacheKey } from "../bassCacheKey";

const listeners = new Set();
const states = new Map();

function emptyState(projectId, versionId) {
  return {
    projectId: bassCacheKey(projectId, versionId),
    // idle | calculating | optimising | applying | recalculating | publishing | complete | error | cancelled
    status: "idle",
    error: null,
    startedAtMs: null,
    completedAtMs: null,
    // Summary of auto-applied calibration changes.
    // { phase: bool, delay: bool, gain: bool, globalBassTrim: bool, details: { phases, delays, trims, polarities, globalTrimDb } }
    autoApplied: null,
    // Optional user-decision recommendations (not auto-applied).
    // { subPositions: result|null, seating: result|null, addSubs: bool }
    recommendations: null,
    // Whether the V2 optimisation found no improvements at all.
    noImprovementsFound: false,
  };
}

export function getOptimiseWorkflowState(projectId, versionId) {
  const key = bassCacheKey(projectId, versionId);
  if (!states.has(key)) states.set(key, emptyState(projectId, versionId));
  return states.get(key);
}

export function subscribeOptimiseWorkflow(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish(projectId, versionId, patch) {
  const key = bassCacheKey(projectId, versionId);
  const current = getOptimiseWorkflowState(projectId, versionId);
  states.set(key, { ...current, ...patch, projectId: key });
  listeners.forEach((l) => l());
  return states.get(key);
}

export function startWorkflow(projectId, versionId) {
  return publish(projectId, versionId, {
    status: "calculating",
    error: null,
    startedAtMs: Date.now(),
    completedAtMs: null,
    autoApplied: null,
    recommendations: null,
    noImprovementsFound: false,
  });
}

export function setOptimising(projectId, versionId) {
  return publish(projectId, versionId, { status: "optimising" });
}

export function setApplying(projectId, versionId) {
  return publish(projectId, versionId, { status: "applying" });
}

export function setRecalculating(projectId, versionId) {
  return publish(projectId, versionId, { status: "recalculating" });
}

export function setPublishing(projectId, versionId) {
  return publish(projectId, versionId, { status: "publishing" });
}

export function setComplete(projectId, versionId, autoApplied, recommendations, noImprovementsFound) {
  return publish(projectId, versionId, {
    status: "complete",
    completedAtMs: Date.now(),
    autoApplied,
    recommendations,
    noImprovementsFound: noImprovementsFound === true,
  });
}

export function setWorkflowError(projectId, versionId, error) {
  return publish(projectId, versionId, {
    status: "error",
    error: error || "Optimisation could not be completed.",
    completedAtMs: Date.now(),
  });
}

export function setCancelled(projectId, versionId) {
  return publish(projectId, versionId, {
    status: "cancelled",
    completedAtMs: Date.now(),
  });
}

/**
 * Merge-only recovery-complete transition for post-apply recalculation
 * failures. Preserves the original run's autoApplied, recommendations and
 * noImprovementsFound — recovery only retried the calculation, it did not
 * re-run the search or apply anything new. Records the original error in a
 * recoveryHistory diagnostic array so the recovery is traceable without
 * affecting the completed UI state. Never clears or resets those fields.
 */
export function setRecoveryComplete(projectId, versionId, originalError = null) {
  const current = getOptimiseWorkflowState(projectId, versionId);
  const recoveryEntry = {
    originalError: originalError || current.error || null,
    recoveredAt: new Date().toISOString(),
  };
  return publish(projectId, versionId, {
    status: "complete",
    error: null,
    completedAtMs: Date.now(),
    // PRESERVED from the original completed run — recovery did not change
    // any of these.
    autoApplied: current.autoApplied,
    recommendations: current.recommendations,
    noImprovementsFound: current.noImprovementsFound,
    // Diagnostic history: append, never overwrite.
    recoveryHistory: [
      ...(Array.isArray(current.recoveryHistory) ? current.recoveryHistory : []),
      recoveryEntry,
    ],
  });
}

/**
 * Append a recovery FAILURE to the recoveryHistory diagnostic array without
 * resetting the completed run's autoApplied, recommendations or
 * noImprovementsFound. The run stays in error status (the recovery did not
 * succeed), but the original error and the failure reason/diagnostics are
 * preserved so a failed recovery attempt is traceable — not only a successful
 * one. Never clears or resets those fields; never mutates the saved plan or
 * run history.
 */
export function appendRecoveryFailure(projectId, versionId, {
  originalError = null,
  failureReason = null,
  diagnostics = null,
} = {}) {
  const current = getOptimiseWorkflowState(projectId, versionId);
  const failureEntry = {
    type: "failure",
    originalError: originalError || current.error || null,
    failureReason: failureReason || null,
    diagnostics: diagnostics || null,
    failedAt: new Date().toISOString(),
  };
  return publish(projectId, versionId, {
    status: "error",
    error: failureReason || current.error || "Recovery failed. The saved plan is intact; settings are unchanged.",
    completedAtMs: Date.now(),
    // PRESERVED from the original completed run — a failed recovery did not
    // change any of these.
    autoApplied: current.autoApplied,
    recommendations: current.recommendations,
    noImprovementsFound: current.noImprovementsFound,
    // Diagnostic history: append, never overwrite.
    recoveryHistory: [
      ...(Array.isArray(current.recoveryHistory) ? current.recoveryHistory : []),
      failureEntry,
    ],
  });
}

export function resetWorkflow(projectId, versionId) {
  return publish(projectId, versionId, emptyState(projectId, versionId));
}

export function useOptimiseWorkflowState(projectId, versionId) {
  return useSyncExternalStore(
    subscribeOptimiseWorkflow,
    () => getOptimiseWorkflowState(projectId, versionId),
    () => getOptimiseWorkflowState(projectId, versionId),
  );
}