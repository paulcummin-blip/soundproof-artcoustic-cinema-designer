// p14SweepCancelAuthority.js — Pure cancel policy for the P14 background sweep.
//
// The background target sweep is cancelled ONLY when the underlying physical
// design actually changed. The owner's observe-inputs effect re-runs on normal
// publication/notification traffic (completed authority updates, fingerprint
// notifications, cacheKey changes, manual-request state), none of which change
// the base design. An unconditional cancel() there emptied the queue, cleared
// the timers and left the bank frozen at N/8 with no failed targets — the UI
// then showed a passive "N of 8 prepared" with no reason and no Retry, because
// the retryable-partial classification is only published when the queue runs
// out with failures.
//
// This module is pure policy only. It does NOT change:
//   - bass maths, EQ, P14/P18/P19/P20 metrics
//   - the cache schema or the target definitions
//   - the scheduler's own lifecycle (schedule/cancel/retry remain unchanged).

/**
 * Decide whether an observed input change warrants cancelling the sweep.
 *
 * @param {object} params
 * @param {string|null} params.activeBaseDesignFingerprint - the fingerprint the
 *   scheduler's current batch belongs to (null = no active batch).
 * @param {string|null} params.currentBaseDesignFingerprint - the live design's
 *   base design fingerprint (null = not yet computable).
 * @returns {boolean} true only for a genuine base-design change.
 */
export function shouldCancelP14Sweep({ activeBaseDesignFingerprint, currentBaseDesignFingerprint } = {}) {
  // No batch to protect / nothing to rebuild → never cancel.
  if (!activeBaseDesignFingerprint) return false;
  // Live fingerprint not yet available (hydration) → do not cancel on a
  // transient undefined; the scheduler's own schedule() handles the real
  // fingerprint transition once the design identity is resolved.
  if (!currentBaseDesignFingerprint) return false;
  return activeBaseDesignFingerprint !== currentBaseDesignFingerprint;
}

/**
 * Apply the gated cancel to a scheduler instance.
 *
 * @param {object|null} scheduler - P14TargetBackgroundScheduler instance
 * @param {string|null} currentBaseDesignFingerprint - live base design fingerprint
 * @returns {boolean} true when the sweep was cancelled.
 */
export function cancelP14SweepOnDesignChange(scheduler, currentBaseDesignFingerprint) {
  if (!scheduler || typeof scheduler.cancel !== 'function') return false;
  const active = scheduler.currentBaseDesignFingerprint ?? null;
  if (!shouldCancelP14Sweep({
    activeBaseDesignFingerprint: active,
    currentBaseDesignFingerprint: currentBaseDesignFingerprint ?? null,
  })) {
    return false;
  }
  scheduler.cancel();
  return true;
}