/**
 * speakerDesignGenerationStatus.js
 * ---------------------------------
 * ONE in-session authority for whether a Speaker Design PDF is being generated
 * and stored for a project version, and what became of the last attempt.
 *
 * Every path that creates a Speaker Design PDF — the Project Report snapshot
 * save, the report-page catch-up effect, the report PDF export and the Proposal
 * Centre's own auto-preparation — goes through `ensureSpeakerDesignForVersion`,
 * and that is the only caller that writes here. The rest of the app reads.
 *
 * What this store holds, and why:
 *   - `preparing` is true while capture, upload and record creation are in
 *     flight. Proposal Centre reads it so a missing Speaker Design reads
 *     "Preparing documents…" instead of "Not generated" the moment generation
 *     has started — never a manual button while the work is already underway.
 *   - `error` carries the plain reason the last attempt failed. It stays until a
 *     new attempt begins, so a failed generation shows a Retry action with the
 *     real cause instead of a silent return to "Not generated".
 *
 * In-session only: nothing is persisted. A cold reopen reads the stored
 * `ProjectAssetExport` records, and the auto-preparation that re-runs there
 * begins a fresh attempt — so the absence of an in-memory entry never reads as
 * a false Current, and a stale in-memory entry never survives a reload.
 */

const entries = new Map(); // `${projectId}::${versionId}` -> { preparing, error, at }
const listeners = new Set();

const keyOf = (projectId, versionId) => `${projectId || ''}::${versionId || ''}`;

function emit() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (error) {
      // One listener failing must never stop the others from being told.
      console.error('[speakerDesignGenerationStatus] listener failed:', error);
    }
  });
}

/** Whether a Speaker Design PDF is being generated for this version right now. */
export function isPreparingSpeakerDesign(projectId, versionId) {
  const entry = entries.get(keyOf(projectId, versionId));
  return !!(entry && entry.preparing);
}

/** The plain reason the last attempt failed, or null when it succeeded or has not run. */
export function getSpeakerDesignGenerationError(projectId, versionId) {
  const entry = entries.get(keyOf(projectId, versionId));
  return entry?.error || null;
}

/** Mark an attempt as in flight. Clears any previous error for this version. */
export function beginSpeakerDesignGeneration(projectId, versionId) {
  if (!projectId || !versionId) return;
  entries.set(keyOf(projectId, versionId), { preparing: true, error: null, at: Date.now() });
  emit();
}

/**
 * Mark an attempt finished. `error` is null on success or a blocked-but-honest
 * outcome (no schedule to store); a genuine storage failure passes its reason.
 */
export function completeSpeakerDesignGeneration(projectId, versionId, error = null) {
  if (!projectId || !versionId) return;
  entries.set(keyOf(projectId, versionId), { preparing: false, error: error || null, at: Date.now() });
  emit();
}

/** Forget the last attempt entirely — used when a fresh generation should read clean. */
export function clearSpeakerDesignGeneration(projectId, versionId) {
  if (!projectId || !versionId) return;
  if (!entries.has(keyOf(projectId, versionId))) return;
  entries.delete(keyOf(projectId, versionId));
  emit();
}

/**
 * Subscribe to every status change. The readiness table and the Proposal Centre
 * auto-preparation hook both use this so they re-read the moment a generation
 * starts or finishes.
 * @param {() => void} listener
 * @returns {() => void} unsubscribe
 */
export function subscribeSpeakerDesignGenerationStatus(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export default {
  isPreparingSpeakerDesign,
  getSpeakerDesignGenerationError,
  beginSpeakerDesignGeneration,
  completeSpeakerDesignGeneration,
  clearSpeakerDesignGeneration,
  subscribeSpeakerDesignGenerationStatus,
};