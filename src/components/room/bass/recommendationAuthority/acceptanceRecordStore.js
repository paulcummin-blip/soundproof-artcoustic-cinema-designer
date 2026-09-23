// acceptanceRecordStore.js
// ---------------------------------------------------------------------------
// Append-only store for immutable Acceptance Records. Per-project,
// per-version. Uses useSyncExternalStore for React integration.
//
// Acceptance Records are audit records — they are appended once and never
// mutated or deleted. The only exception is transactional rollback during
// the Accept Transition, which uses _replaceAcceptanceRecords to restore
// the pre-transaction state before the record was ever visible.
//
// Supports:
//   - addAcceptanceRecord — append a new record (called by Accept Transition)
//   - getAcceptanceRecords — list all records for a project/version
//   - getAcceptanceRecordById — lookup by acceptanceId
//   - getAcceptanceRecordByRecommendationId — lookup by recommendationId
//   - useAcceptanceRecords — React hook
//   - _replaceAcceptanceRecords — internal, for transactional rollback ONLY
//
// No UI. No persistence. No connection to Applied Calibration or the design.
// ---------------------------------------------------------------------------

import { useSyncExternalStore } from "react";
import { bassCacheKey } from "../bassCacheKey";

const listeners = new Set();
const store = new Map();

function getRecords(projectId, versionId) {
  const key = bassCacheKey(projectId, versionId);
  return store.get(key) || [];
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish(projectId, versionId, list) {
  const key = bassCacheKey(projectId, versionId);
  store.set(key, list);
  listeners.forEach((l) => l());
  return list;
}

/**
 * Append a new Acceptance Record. Called by the Accept Transition.
 * Records are immutable — once appended, they are never modified.
 */
export function addAcceptanceRecord(projectId, versionId, record) {
  const existing = getRecords(projectId, versionId);
  return publish(projectId, versionId, [...existing, record]);
}

/**
 * Get all Acceptance Records for a project/version (oldest-first).
 */
export function getAcceptanceRecords(projectId, versionId) {
  return getRecords(projectId, versionId);
}

/**
 * Look up an Acceptance Record by acceptanceId.
 */
export function getAcceptanceRecordById(projectId, versionId, acceptanceId) {
  return getRecords(projectId, versionId).find(
    (r) => r.acceptanceId === acceptanceId,
  ) || null;
}

/**
 * Look up an Acceptance Record by recommendationId.
 * Returns the most recent record for that recommendation (if multiple exist).
 */
export function getAcceptanceRecordByRecommendationId(projectId, versionId, recommendationId) {
  const records = getRecords(projectId, versionId);
  for (let i = records.length - 1; i >= 0; i--) {
    if (records[i].recommendationId === recommendationId) return records[i];
  }
  return null;
}

/**
 * INTERNAL — Replace the entire record list for a project/version.
 *
 * This is used ONLY by the Accept Transition for transactional rollback,
 * to restore the pre-transaction state before a partially-committed
 * Acceptance Record was ever visible. Never call this from application code.
 */
export function _replaceAcceptanceRecords(projectId, versionId, list) {
  return publish(projectId, versionId, Array.isArray(list) ? [...list] : []);
}

/**
 * React hook: subscribe to Acceptance Records for a project/version.
 */
export function useAcceptanceRecords(projectId, versionId) {
  return useSyncExternalStore(
    subscribe,
    () => getRecords(projectId, versionId),
    () => getRecords(projectId, versionId),
  );
}