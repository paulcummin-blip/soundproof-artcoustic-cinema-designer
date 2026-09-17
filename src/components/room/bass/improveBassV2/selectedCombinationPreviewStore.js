// selectedCombinationPreviewStore.js
// Reactive store for the live selected-combination preview state.
//
// State shape:
//   status: "idle" | "preparing" | "retuning" | "confirming" | "complete" | "error" | "cancelled"
//   result: confirmed canonical result (null until complete)
//   selectedKeys: Set of selected stage keys
//   progress: { stage, label, current, total }
//   error: error message
//   generation: monotonically increasing id for cancellation/superseding

import { useSyncExternalStore, useCallback } from "react";

const DEFAULT_STATE = Object.freeze({
  status: "idle",
  result: null,
  selectedKeys: null,
  progress: null,
  error: null,
  generation: 0,
});

const states = new Map();
const subscribers = new Map();

function stateKey(projectId, versionId) {
  return `${projectId}::${versionId || ""}`;
}

export function getPreviewState(projectId, versionId) {
  return states.get(stateKey(projectId, versionId)) || DEFAULT_STATE;
}

export function subscribePreview(projectId, versionId, cb) {
  const k = stateKey(projectId, versionId);
  if (!subscribers.has(k)) subscribers.set(k, new Set());
  subscribers.get(k).add(cb);
  return () => { subscribers.get(k)?.delete(cb); };
}

export function setPreviewState(projectId, versionId, patch) {
  const k = stateKey(projectId, versionId);
  const prev = getPreviewState(projectId, versionId);
  const next = { ...prev, ...patch };
  states.set(k, next);
  subscribers.get(k)?.forEach((cb) => cb());
}

export function nextPreviewGeneration(projectId, versionId) {
  const prev = getPreviewState(projectId, versionId);
  const gen = (prev.generation || 0) + 1;
  setPreviewState(projectId, versionId, { generation: gen });
  return gen;
}

export function getPreviewGeneration(projectId, versionId) {
  return getPreviewState(projectId, versionId).generation;
}

export function resetPreview(projectId, versionId) {
  setPreviewState(projectId, versionId, { status: "idle", result: null, selectedKeys: null, progress: null, error: null });
}

export function usePreviewState(projectId, versionId) {
  const subscribe = useCallback(
    (cb) => subscribePreview(projectId, versionId, cb),
    [projectId, versionId],
  );
  const getSnapshot = useCallback(
    () => getPreviewState(projectId, versionId),
    [projectId, versionId],
  );
  return useSyncExternalStore(subscribe, getSnapshot);
}