import { useSyncExternalStore } from "react";

const listeners = new Set();
const states = new Map();
let sequence = 0;

const keyFor = (projectId) => String(projectId || "free");

function emptyState(projectId) {
  return {
    projectId: keyFor(projectId),
    requestId: null,
    action: null,
    sourceFingerprint: null,
    status: "idle",
    error: null,
    requestedAtMs: null,
    completedAtMs: null,
  };
}

export function getBassHeavyAction(projectId) {
  const key = keyFor(projectId);
  if (!states.has(key)) states.set(key, emptyState(key));
  return states.get(key);
}

export function subscribeBassHeavyAction(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish(projectId, patch) {
  const key = keyFor(projectId);
  states.set(key, { ...getBassHeavyAction(key), ...patch, projectId: key });
  listeners.forEach((listener) => listener());
  return states.get(key);
}

export function requestBassHeavyAction(projectId, action, sourceFingerprint) {
  if (!["optimise", "compare"].includes(action) || !sourceFingerprint) return null;
  sequence += 1;
  return publish(projectId, {
    requestId: `${action}:${Date.now()}:${sequence}`,
    action,
    sourceFingerprint,
    status: "requested",
    error: null,
    requestedAtMs: Date.now(),
    completedAtMs: null,
  });
}

export function markBassHeavyActionRunning(projectId, requestId) {
  const current = getBassHeavyAction(projectId);
  if (current.requestId !== requestId) return current;
  return publish(projectId, { status: "running" });
}

export function markBassHeavyActionComplete(projectId, requestId) {
  const current = getBassHeavyAction(projectId);
  if (current.requestId !== requestId) return current;
  return publish(projectId, { status: "complete", completedAtMs: Date.now() });
}

export function markBassHeavyActionError(projectId, requestId, error) {
  const current = getBassHeavyAction(projectId);
  if (current.requestId !== requestId) return current;
  return publish(projectId, {
    status: "error",
    error: error || "Bass option analysis could not be completed.",
  });
}

export function cancelBassHeavyAction(projectId, reason = "cancelled") {
  const current = getBassHeavyAction(projectId);
  if (!current.requestId || ["idle", "cancelled"].includes(current.status)) return current;
  return publish(projectId, { status: "cancelled", error: reason });
}

export function useBassHeavyAction(projectId) {
  return useSyncExternalStore(
    subscribeBassHeavyAction,
    () => getBassHeavyAction(projectId),
    () => getBassHeavyAction(projectId),
  );
}
