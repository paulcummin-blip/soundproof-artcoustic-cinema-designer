import { useSyncExternalStore } from "react";
import { bassCacheKey } from "./bassCacheKey";

const listeners = new Set();
const states = new Map();
let sequence = 0;

function emptyState(projectId, versionId) {
  return {
    projectId: bassCacheKey(projectId, versionId),
    requestId: null,
    action: null,
    sourceFingerprint: null,
    status: "idle",
    error: null,
    requestedAtMs: null,
    completedAtMs: null,
  };
}

export function getBassHeavyAction(projectId, versionId) {
  const key = bassCacheKey(projectId, versionId);
  if (!states.has(key)) states.set(key, emptyState(projectId, versionId));
  return states.get(key);
}

export function subscribeBassHeavyAction(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish(projectId, versionId, patch) {
  const key = bassCacheKey(projectId, versionId);
  states.set(key, { ...getBassHeavyAction(projectId, versionId), ...patch, projectId: key });
  listeners.forEach((listener) => listener());
  return states.get(key);
}

export function requestBassHeavyAction(projectId, versionId, action, sourceFingerprint) {
  if (!["optimise", "compare"].includes(action) || !sourceFingerprint) return null;
  sequence += 1;
  return publish(projectId, versionId, {
    requestId: `${action}:${Date.now()}:${sequence}`,
    action,
    sourceFingerprint,
    status: "requested",
    error: null,
    requestedAtMs: Date.now(),
    completedAtMs: null,
  });
}

export function markBassHeavyActionRunning(projectId, versionId, requestId) {
  const current = getBassHeavyAction(projectId, versionId);
  if (current.requestId !== requestId) return current;
  return publish(projectId, versionId, { status: "running" });
}

export function markBassHeavyActionComplete(projectId, versionId, requestId) {
  const current = getBassHeavyAction(projectId, versionId);
  if (current.requestId !== requestId) return current;
  return publish(projectId, versionId, { status: "complete", completedAtMs: Date.now() });
}

export function markBassHeavyActionError(projectId, versionId, requestId, error) {
  const current = getBassHeavyAction(projectId, versionId);
  if (current.requestId !== requestId) return current;
  return publish(projectId, versionId, {
    status: "error",
    error: error || "Bass option analysis could not be completed.",
  });
}

export function cancelBassHeavyAction(projectId, versionId, reason = "cancelled") {
  const current = getBassHeavyAction(projectId, versionId);
  if (!current.requestId || ["idle", "cancelled"].includes(current.status)) return current;
  return publish(projectId, versionId, { status: "cancelled", error: reason });
}

export function useBassHeavyAction(projectId, versionId) {
  return useSyncExternalStore(
    subscribeBassHeavyAction,
    () => getBassHeavyAction(projectId, versionId),
    () => getBassHeavyAction(projectId, versionId),
  );
}