// optimiserPlanStore.js
// ---------------------------------------------------------------------------
// In-memory authority for the persisted ADI Optimisation Plan, keyed by
// (projectId, versionId) — the same keying the optimiser, the bass authority
// and the Applied Calibration Authority already use.
//
// The store holds the SAVED evaluated optimiser result for the open design
// version. It is written only by the optimiser publication path and by
// hydration. It never computes, re-runs, or re-evaluates anything.
//
// Lever decisions (disabled / ignored) are designer decisions and live on the
// same plan object, so they are persisted and restored with it.
// ---------------------------------------------------------------------------

import { useSyncExternalStore } from "react";
import { OPTIMISER_LEVER_ORDER } from "./optimiserPlanConstants.js";

const store = new Map();
const listeners = new Set();

const keyOf = (projectId, versionId) => `${projectId || ""}::${versionId || ""}`;

function notify() {
  listeners.forEach((listener) => {
    try { listener(); } catch { /* a failing subscriber never breaks the store */ }
  });
}

export function getOptimiserPlanAuthority(projectId, versionId) {
  return store.get(keyOf(projectId, versionId)) || null;
}

export function subscribeOptimiserPlan(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Save the evaluated optimiser result (or clear it with null). */
export function setOptimiserPlanAuthority(projectId, versionId, plan) {
  const key = keyOf(projectId, versionId);
  if (!plan) store.delete(key);
  else store.set(key, plan);
  notify();
}

export function resetOptimiserPlanAuthority(projectId, versionId) {
  store.delete(keyOf(projectId, versionId));
  notify();
}

/**
 * Record a designer decision about one lever (rule 5).
 * `disabled: true` = the lever is ignored and must stay ignored on reopen.
 */
export function setOptimiserLeverDecision(projectId, versionId, leverKey, disabled) {
  if (!OPTIMISER_LEVER_ORDER.includes(leverKey)) return null;
  const key = keyOf(projectId, versionId);
  const current = store.get(key);
  if (!current) return null;
  const decisions = { ...(current.leverDecisions || {}) };
  if (disabled) {
    decisions[leverKey] = { disabled: true, decidedAt: new Date().toISOString() };
  } else {
    delete decisions[leverKey];
  }
  const next = { ...current, leverDecisions: decisions };
  store.set(key, next);
  notify();
  return next;
}

/** React binding — the plan for the open design version. */
export function useOptimiserPlanAuthority(projectId, versionId) {
  const key = keyOf(projectId, versionId);
  return useSyncExternalStore(
    subscribeOptimiserPlan,
    () => store.get(key) || null,
    () => null,
  );
}