// evaluatedRecommendationsStore.js
// ---------------------------------------------------------------------------
// Shared runtime store for the evaluated 1/2/4-subwoofer recommendations.
//
// The Subwoofer Design recommendation search must run in the background,
// independent of the Subwoofer Design accordion. A single always-mounted
// background runner owns the Stage 1/2 evaluation and publishes its results
// here. BassDesignAssistant (rendered inside the collapsible accordion)
// consumes them, so opening or closing the accordion never starts, cancels
// or restarts the search — the runner stays mounted and the store retains
// the latest evaluated options for the current project/version.
//
// Keyed by `${projectId}::${versionId}` — the same identity the Stage 1/2
// stores use. Runtime UI state only; never persisted (the Stage 1/2 caches
// own durable persistence, this is just the presentation bridge).
//
// This is a STORE only — it changes no acoustic logic.

import { useSyncExternalStore } from "react";

const EMPTY = Object.freeze({ status: "idle", options: [], stage2Fingerprint: null });

const cache = new Map();
const listeners = new Set();

function notify() {
  listeners.forEach((l) => { try { l(); } catch (_) { /* listener errors are non-fatal */ } });
}

function samePayload(a, b) {
  if (!a || !b) return false;
  return a.status === b.status
    && a.stage2Fingerprint === b.stage2Fingerprint
    && a.options === b.options;
}

/** Publish the latest evaluated recommendations for a project/version key.
 *  No-ops when status, fingerprint and options are unchanged so consumers
 *  do not re-render on every runner tick. */
export function publishEvaluatedRecommendations(key, payload) {
  const prev = cache.get(key);
  if (prev && samePayload(prev, payload)) return;
  cache.set(key, payload);
  notify();
}

/** Clear the entry for a key (used when the runner unmounts its project). */
export function clearEvaluatedRecommendations(key) {
  if (!cache.has(key)) return;
  cache.delete(key);
  notify();
}

export function getEvaluatedRecommendations(key) {
  return cache.get(key) || EMPTY;
}

export function subscribeEvaluatedRecommendations(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** React hook: returns the latest evaluated recommendations for a key. */
export function useEvaluatedRecommendations(key) {
  return useSyncExternalStore(
    subscribeEvaluatedRecommendations,
    () => getEvaluatedRecommendations(key),
    () => EMPTY,
  );
}