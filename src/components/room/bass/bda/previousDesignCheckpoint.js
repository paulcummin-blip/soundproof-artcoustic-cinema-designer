// previousDesignCheckpoint.js
//
// ONE-LEVEL previous-design checkpoint owned by the Bass Design Assistant.
//
// This is NOT project version history. This is NOT an undo stack.
// It is a single checkpoint that stores the physical design + fingerprint
// identity of the last coherent design, so a designer can safely try an
// alternative and restore to the known-good state.
//
// The checkpoint stores ONLY identity + physical state:
//   - projectId, versionId
//   - subwooferInstances (deep clone)
//   - seatingPositions (deep clone, only if the apply action changes seating)
//   - bassFingerprint  (the bass result fingerprint of the coherent design)
//   - engineeringFingerprint (the full engineering fingerprint of the coherent design)
//   - includesSeating (whether restore should also restore seating)
//   - baseDesignFingerprint / targetBankSnapshot / targetBankCount (bank carry)
//
// It does NOT duplicate the completed bass contract — that already lives in
// ProjectAnalysisCache.completed_by_fingerprint.
// It does NOT duplicate the engineering publication — that already lives in
// ProjectAnalysisCache.engineering_publications.
//
// ── Durable, version-scoped persistence ──────────────────────────────────
// The checkpoint is mirrored to localStorage under a project+version-scoped
// key so it survives save, refresh and cold reopen. The in-memory Map remains
// the synchronous primary store (and the only store in environments without
// localStorage, e.g. the node test runner); localStorage is a durability
// mirror. A checkpoint is NEVER restored for a project/version it does not
// belong to: the storage key is scoped, and the hydrated record's own
// projectId/versionId are re-validated on read. It never touches the Project
// entity, ProjectVersion.design_state or historical versions.

import { useEffect, useSyncExternalStore } from "react";

const checkpoints = new Map(); // key: "projectId::versionId" -> checkpoint
const listeners = new Set();

const STORAGE_PREFIX = "b44-bda-checkpoint:v1:";

const checkpointKey = (projectId, versionId) => `${projectId}::${versionId}`;
const storageKey = (projectId, versionId) => `${STORAGE_PREFIX}${projectId}::${versionId}`;

function hasLocalStorage() {
  try {
    return typeof localStorage !== "undefined" && localStorage !== null;
  } catch {
    return false;
  }
}

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

function serialiseCheckpoint(cp) {
  // The targetBankSnapshot can be large. Strip it first if quota forces it.
  return JSON.stringify(cp);
}

function readDurable(projectId, versionId) {
  if (!projectId || !versionId || !hasLocalStorage()) return null;
  try {
    const raw = localStorage.getItem(storageKey(projectId, versionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.projectId !== projectId || parsed.versionId !== versionId) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeDurable(projectId, versionId, cp) {
  if (!projectId || !versionId || !hasLocalStorage()) return;
  try {
    localStorage.setItem(storageKey(projectId, versionId), serialiseCheckpoint(cp));
  } catch {
    // Quota exceeded — retry once without the (potentially large) target bank
    // snapshot so the identity + physical state still survives cold reopen.
    try {
      const trimmed = { ...cp, targetBankSnapshot: null, targetBankCount: 0 };
      localStorage.setItem(storageKey(projectId, versionId), serialiseCheckpoint(trimmed));
    } catch {
      // Still no room — keep the session-only in-memory checkpoint. Restore
      // will re-hydrate the target bank from the DB cache on cold reopen.
    }
  }
}

function removeDurable(projectId, versionId) {
  if (!projectId || !versionId || !hasLocalStorage()) return;
  try {
    localStorage.removeItem(storageKey(projectId, versionId));
  } catch {
    // ignore
  }
}

/**
 * Hydrate a durable checkpoint into the in-memory store for a project/version.
 * Called lazily so a cold-reopened session sees its restore point. Idempotent:
 * no-ops when the in-memory entry already exists or no durable entry exists.
 */
function hydrateFromDurable(projectId, versionId) {
  if (!projectId || !versionId) return;
  const key = checkpointKey(projectId, versionId);
  if (checkpoints.has(key)) return;
  const durable = readDurable(projectId, versionId);
  if (!durable) return;
  checkpoints.set(key, durable);
  notify();
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
 * The checkpoint is mirrored to localStorage so it survives refresh and cold
 * reopen. Repeated recommendation switching overwrites the same project/version
 * key, so exactly one reversible checkpoint is kept per design.
 *
 * @returns {boolean} true if captured
 */
export function captureCheckpoint(projectId, versionId, payload) {
  if (!projectId || !versionId) return false;
  if (!payload?.bassFingerprint || !payload?.engineeringFingerprint) return false;
  const key = checkpointKey(projectId, versionId);
  // Fix 2: capture the target bank snapshot so restore can recover 8/8 targets
  // without a full background recalculation. Deep-clone the targets object so
  // later in-memory cache mutations cannot corrupt the checkpoint.
  const targetBankSnapshot = payload.targetBankSnapshot
    ? JSON.parse(JSON.stringify(payload.targetBankSnapshot))
    : null;
  const checkpoint = {
    projectId,
    versionId,
    subwooferInstances: cloneInstances(payload.subwooferInstances),
    seatingPositions: cloneSeats(payload.seatingPositions),
    bassFingerprint: payload.bassFingerprint,
    engineeringFingerprint: payload.engineeringFingerprint,
    includesSeating: !!payload.includesSeating,
    baseDesignFingerprint: payload.baseDesignFingerprint || null,
    targetBankSnapshot,
    targetBankCount: payload.targetBankCount || 0,
    capturedAt: Date.now(),
  };
  checkpoints.set(key, checkpoint);
  writeDurable(projectId, versionId, checkpoint);
  notify();
  return true;
}

/**
 * Mark an existing checkpoint as including seating (so restore will also
 * restore seating). Used when commitSeating is called after commitInstances
 * in the same apply batch. Mirrors the update to durable storage.
 */
export function markCheckpointIncludesSeating(projectId, versionId) {
  if (!projectId || !versionId) return;
  const key = checkpointKey(projectId, versionId);
  const cp = checkpoints.get(key);
  if (!cp || cp.includesSeating) return;
  const next = { ...cp, includesSeating: true };
  checkpoints.set(key, next);
  writeDurable(projectId, versionId, next);
  notify();
}

export function getCheckpoint(projectId, versionId) {
  if (!projectId || !versionId) return null;
  const key = checkpointKey(projectId, versionId);
  if (checkpoints.has(key)) return checkpoints.get(key);
  // Cold reopen: hydrate from durable so the restore point survives refresh.
  const durable = readDurable(projectId, versionId);
  if (durable) {
    checkpoints.set(key, durable);
  }
  return checkpoints.get(key) || null;
}

export function hasCheckpoint(projectId, versionId) {
  if (!projectId || !versionId) return false;
  if (checkpoints.has(checkpointKey(projectId, versionId))) return true;
  return readDurable(projectId, versionId) != null;
}

export function clearCheckpoint(projectId, versionId) {
  const key = checkpointKey(projectId, versionId);
  let changed = false;
  if (checkpoints.has(key)) {
    checkpoints.delete(key);
    changed = true;
  }
  removeDurable(projectId, versionId);
  if (changed) notify();
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
 *
 * On mount (and when the project/version changes) it hydrates a durable
 * checkpoint from localStorage into the in-memory store, so the Restore bar
 * appears after a cold reopen without an extra capture.
 */
export function usePreviousDesignCheckpoint(projectId, versionId) {
  useEffect(() => {
    hydrateFromDurable(projectId, versionId);
  }, [projectId, versionId]);
  return useSyncExternalStore(
    subscribe,
    getSnapshot(projectId, versionId),
    getSnapshot(projectId, versionId),
  );
}