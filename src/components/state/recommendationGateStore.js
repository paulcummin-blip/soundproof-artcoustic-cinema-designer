// recommendationGateStore.js — Shared recommendation-feature gate.
//
// Tracks whether the subwoofer placement recommendation UI is mounted.
// When active, Stage 1/Stage 2 placement optimisers and the P14 background
// sweep are permitted to run. When inactive, all speculative background
// bass work is gated off to eliminate worker contention during dragging.
//
// This is a GATE only — it does not change any Stage 1/2 acoustic logic.
// When the gate opens, the existing scheduling/evaluation logic runs
// unchanged. When the gate closes, pending/active work is cancelled.
//
// Runtime UI state only — never persisted.

import { useSyncExternalStore } from "react";

let activeCount = 0;
const listeners = new Set();

function notify() {
  listeners.forEach((l) => { try { l(); } catch (_) { /* listener errors are non-fatal */ } });
}

/** Mark the recommendation gate as active (BestSubLayoutGuide mounted) or
 *  inactive (unmounted). Uses a count so multiple concurrent mounts are safe. */
export function setRecommendationGateActive(active) {
  const prev = activeCount;
  activeCount = Math.max(0, activeCount + (active ? 1 : -1));
  if (prev !== activeCount) {
    const isDev = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV === true;
    if (isDev) console.log("[recommendation-gate]", active ? "OPEN" : "CLOSED", "— speculative bass work", activeCount > 0 ? "ENABLED" : "GATED");
    notify();
  }
}

export function isRecommendationGateActive() { return activeCount > 0; }

export function subscribeRecommendationGate(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** React hook: returns true when the recommendation UI is mounted. */
export function useRecommendationGate() {
  return useSyncExternalStore(subscribeRecommendationGate, isRecommendationGateActive, isRecommendationGateActive);
}

// ── Test-only helpers ──────────────────────────────────────────────────────
export function resetRecommendationGateForTest() {
  activeCount = 0;
  listeners.clear();
}