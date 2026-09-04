// calculateAllTargetsStore.js — Explicit "Calculate All Target Results" request.
//
// The background P14 target scheduler (p14TargetBackgroundScheduler.js) is
// never started automatically. It runs ONLY when the designer explicitly
// presses the "Calculate All Target Results" button. This store is the
// bridge: the UI requests, BassBackgroundAnalysisOwner consumes and
// calls scheduler.schedule().

import { useSyncExternalStore } from "react";

const listeners = new Set();
let state = { requested: false, requestId: null, requestedAtMs: null };

export function requestCalculateAllTargets() {
  const requestId = `all-targets:${Date.now()}`;
  state = { requested: true, requestId, requestedAtMs: Date.now() };
  listeners.forEach((l) => l());
  return requestId;
}

export function consumeCalculateAllTargetsRequest() {
  if (!state.requested) return;
  state = { requested: false, requestId: null, requestedAtMs: null };
  listeners.forEach((l) => l());
}

export function getCalculateAllTargetsState() {
  return state;
}

export function subscribeCalculateAllTargets(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCalculateAllTargetsRequest() {
  return useSyncExternalStore(
    subscribeCalculateAllTargets,
    getCalculateAllTargetsState,
    getCalculateAllTargetsState,
  );
}