// recommendationAuthorityStore.js
// ---------------------------------------------------------------------------
// Reactive store for the Recommendation Authority. Per-project, per-version.
// Independent from the Applied Calibration Authority store.
//
// The store holds:
//   - current:  the latest recommendation (or null)
//   - history:  all previous recommendations (append-only, oldest-first)
//
// Supports:
//   - setRecommendation           — set a new current (old → history)
//   - getRecommendation            — get the current recommendation
//   - getRecommendationById        — lookup by recommendationId (current + history)
//   - getRecommendationsByGeometry — lookup by geometry fingerprint
//   - getRecommendationHistory     — full append-only history
//   - transitionCurrentRecommendation — lifecycle status transition
//   - markRecommendationStale / Declined / Accepted / Superseded
//   - resetRecommendationAuthority — clear all
//
// A recommendation is IMMUTABLE. Only its lifecycle status changes.
// When a new recommendation is set:
//   - Same geometry as current  → current marked Superseded, pushed to history
//   - Different geometry        → current pushed to history as-is (effectively stale)
//
// No UI. No persistence. No connection to Applied Calibration or the design.
// ---------------------------------------------------------------------------

import { useSyncExternalStore } from "react";
import { bassCacheKey } from "../bassCacheKey";
import {
  RECOMMENDATION_STATUS,
  transitionRecommendationStatus,
  isRecommendationTerminal,
} from "./recommendationAuthority.js";

const listeners = new Set();
const states = new Map();

// Stable empty-state reference. useSyncExternalStore requires getSnapshot to
// return a referentially-stable value when state has not changed; returning a
// new object literal each call causes an infinite render loop (React #185).
const EMPTY_RECOMMENDATION_STATE = { current: null, history: [] };

function getState(projectId, versionId) {
  const key = bassCacheKey(projectId, versionId);
  if (!states.has(key)) {
    states.set(key, EMPTY_RECOMMENDATION_STATE);
  }
  return states.get(key);
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish(projectId, versionId, state) {
  const key = bassCacheKey(projectId, versionId);
  states.set(key, state);
  listeners.forEach((l) => l());
  return state;
}

/**
 * Set a new recommendation as current.
 *
 * The previous current (if any) is pushed to history:
 *   - Same geometry fingerprint  → previous marked Superseded (if not terminal)
 *   - Different geometry        → previous pushed as-is (effectively stale)
 *
 * @param {string} projectId
 * @param {string} versionId
 * @param {object} recommendation - recommendation object (from createRecommendation)
 */
export function setRecommendation(projectId, versionId, recommendation) {
  const existing = getState(projectId, versionId);
  let history = existing.history;

  if (existing.current) {
    const sameGeometry =
      existing.current.geometryFingerprint === recommendation.geometryFingerprint;

    if (sameGeometry && !isRecommendationTerminal(existing.current)) {
      const superseded = transitionRecommendationStatus(
        existing.current,
        RECOMMENDATION_STATUS.SUPERSEDED,
      );
      history = [...existing.history, superseded];
    } else {
      history = [...existing.history, existing.current];
    }
  }

  return publish(projectId, versionId, {
    current: recommendation,
    history,
  });
}

/**
 * Get the current recommendation (or null).
 */
export function getRecommendation(projectId, versionId) {
  return getState(projectId, versionId).current;
}

/**
 * Get the full recommendation history (append-only, oldest-first).
 */
export function getRecommendationHistory(projectId, versionId) {
  return getState(projectId, versionId).history;
}

/**
 * Look up a recommendation by ID. Searches current + history.
 *
 * @param {string} recommendationId
 * @returns {object|null}
 */
export function getRecommendationById(projectId, versionId, recommendationId) {
  const state = getState(projectId, versionId);
  if (state.current?.recommendationId === recommendationId) return state.current;
  return state.history.find((r) => r.recommendationId === recommendationId) || null;
}

/**
 * Look up recommendations by geometry fingerprint. Searches current + history.
 *
 * @param {string} geometryFingerprint
 * @returns {object[]}
 */
export function getRecommendationsByGeometry(projectId, versionId, geometryFingerprint) {
  const state = getState(projectId, versionId);
  const all = [state.current, ...state.history].filter(Boolean);
  return all.filter((r) => r.geometryFingerprint === geometryFingerprint);
}

/**
 * Transition the current recommendation's lifecycle status.
 * Returns the new state. Values are unchanged (immutable).
 *
 * Throws if the transition is invalid (e.g. from a terminal status).
 *
 * @param {string} newStatus - one of RECOMMENDATION_STATUS
 */
export function transitionCurrentRecommendation(projectId, versionId, newStatus) {
  const state = getState(projectId, versionId);
  if (!state.current) return null;
  const updated = transitionRecommendationStatus(state.current, newStatus);
  return publish(projectId, versionId, {
    current: updated,
    history: state.history,
  });
}

/**
 * Mark the current recommendation as stale.
 * Called when geometry changes and the recommendation no longer belongs
 * to the current design.
 */
export function markRecommendationStale(projectId, versionId) {
  return transitionCurrentRecommendation(projectId, versionId, RECOMMENDATION_STATUS.STALE);
}

/**
 * Mark the current recommendation as declined.
 *
 * Declined is NOT permanent — it belongs only to the geometry against which
 * it was declined. If geometry changes, a new Generated recommendation may
 * be created even if it proposes the same action.
 */
export function markRecommendationDeclined(projectId, versionId) {
  return transitionCurrentRecommendation(projectId, versionId, RECOMMENDATION_STATUS.DECLINED);
}

/**
 * Mark the current recommendation as accepted.
 *
 * Accepted is terminal for this recommendation instance.
 * (The accept transition itself — writing to Applied Calibration — is
 * implemented in a later stage. This function only changes the lifecycle
 * status of the recommendation.)
 */
export function markRecommendationAccepted(projectId, versionId) {
  return transitionCurrentRecommendation(projectId, versionId, RECOMMENDATION_STATUS.ACCEPTED);
}

/**
 * Mark the current recommendation as superseded.
 * Superseded means a newer recommendation was generated for the same
 * geometry. The old recommendation is retained in history for audit.
 */
export function markRecommendationSuperseded(projectId, versionId) {
  return transitionCurrentRecommendation(projectId, versionId, RECOMMENDATION_STATUS.SUPERSEDED);
}

/**
 * Reset the Recommendation Authority to zero state.
 * Clears current and history.
 */
export function resetRecommendationAuthority(projectId, versionId) {
  return publish(projectId, versionId, { current: null, history: [] });
}

/**
 * React hook: subscribe to the Recommendation Authority state for a
 * project/version. Returns { current, history }.
 */
export function useRecommendationAuthority(projectId, versionId) {
  return useSyncExternalStore(
    subscribe,
    () => getState(projectId, versionId),
    () => getState(projectId, versionId),
  );
}