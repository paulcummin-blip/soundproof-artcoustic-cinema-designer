// previousDesignCheckpoint.js
//
// ONE-LEVEL previous-design checkpoint owned by the Bass Design Assistant.
//
// This is NOT project version history. This is NOT an undo stack.
// It is a single transient (session-only) checkpoint that stores the physical
// design + fingerprint identity of the last coherent design, so a designer
// can safely try an alternative and restore to the known-good state.
//
// The checkpoint stores ONLY identity + physical state:
//   - projectId, versionId
//   - subwooferInstances (deep clone)
//   - seatingPositions (deep clone, only if the apply action changes seating)
//   - bassFingerprint  (the bass result fingerprint of the coherent design)
//   - engineeringFingerprint (the full engineering fingerprint of the coherent design)
//   - includesSeating (whether restore should also restore seating)
//
// It does NOT duplicate the completed bass contract — that already lives in
// ProjectAnalysisCache.completed_by_fingerprint.
// It does NOT duplicate the engineering publication — that already lives in
// ProjectAnalysisCache.engineering_publications.

import { useSyncExternalStore } from "react";

const checkpoints = new Map(); // key: "projectId::versionId" -> checkpoint
const listeners = new Set();

const checkpointKey = (projectId, versionId) => `${projectId}::${versionId}`;

function notify() {
  listeners.forEach((fn) => fn());
}

// Deep clone helpers — structured clone semantics without the API dependency.
function cloneInstances(instances) {
  if (!Array.isArray(instances)) return [];
  return instances.map((inst) => ({
    ...inst,
    position: inst?.position ? { ...inst.position } : null,
    tuning: inst?.tuning ? { ...inst.tuning } : undefined,
  }));
}

function cloneSeats(seats) {
  if (!Array.isArray(seats)) return [];
  return seats.map((seat) => ({ ...seat }));
}

/**
 * Capture a previous-design checkpoint.
 *
 * CHECKPOINT CAPTURE RULE:
 *   Only capture when the current design is coherent (authoritative + complete
 *   + fingerprint matches). The caller is responsible for passing the current
 *   completedBassAuthority so this function can enforce the rule.
 *
 *   If a checkpoint already exists, it is OVERWRITTEN — but only when the
 *   current design is coherent. The caller must NOT call this when the current
 *   design is stale/failed (see captureBeforeApply in bdaCheckpointAuthority.js
 *   which enforces this).
 *
 * @returns {boolean} true if captured
 */
export function captureCheckpoint(projectId, versionId, payload) {
  if (!projectId || !versionId) return false;
  if (!payload?.bassFingerprint || !payload?.engineeringFingerprint) return false;
  const key = checkpointKey(projectId, versionId);
  checkpoints.set(key, {
    projectId,
    versionId,
    subwooferInstances: cloneInstances(payload.subwooferInstances),
    seatingPositions: cloneSeats(payload.seatingPositions),
    bassFingerprint: payload.bassFingerprint,
    engineeringFingerprint: payload.engineeringFingerprint,
    includesSeating: !!payload.includesSeating,
    capturedAt: Date.now(),
  });
  notify();
  return true;
}

/**
 * Mark an existing checkpoint as including seating (so restore will also
 * restore seating). Used when commitSeating is called after commitInstances
 * in the same apply batch.
 */
export function markCheckpointIncludesSeating(projectId, versionId) {
  if (!projectId || !versionId) return;
  const key = checkpointKey(projectId, versionId);
  const cp = checkpoints.get(key);
  if (!cp || cp.includesSeating) return;
  checkpoints.set(key, { ...cp, includesSeating: true });
  notify();
}

export function getCheckpoint(projectId, versionId) {
  return checkpoints.get(checkpointKey(projectId, versionId)) || null;
}

export function hasCheckpoint(projectId, versionId) {
  return checkpoints.has(checkpointKey(projectId, versionId));
}

export function clearCheckpoint(projectId, versionId) {
  const key = checkpointKey(projectId, versionId);
  if (!checkpoints.has(key)) return;
  checkpoints.delete(key);
  notify();
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(projectId, versionId) {
  return () => checkpoints.get(checkpointKey(projectId, versionId)) || null;
}

/**
 * React hook for the previous-design checkpoint.
 * Returns the checkpoint object or null, and re-renders on changes.
 */
export function usePreviousDesignCheckpoint(projectId, versionId) {
  return useSyncExternalStore(
    subscribe,
    getSnapshot(projectId, versionId),
    getSnapshot(projectId, versionId),
  );
}