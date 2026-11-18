/**
 * recoveryRetry.js
 * -----------------
 * Production recovery orchestrator for post-apply ADI Optimiser
 * recalculation failures. Extracted so it can be tested with controlled
 * reads and deferred calculation without mounting the full component.
 *
 * When a completed optimisation's electronic apply succeeds but the
 * recalculation/publication of the resulting bass authority fails, the saved
 * plan and the actual (possibly restored) settings are intact. Recovery
 * retries ONLY the calculation and publication for the PINNED current design
 * and settings — it never runs the optimiser, never auto-applies, and never
 * mutates the saved plan, recommendation evidence or run history.
 *
 * IDENTITY PINNING: the orchestrator captures the cacheKey (and optionally
 * project/version) at the start of the attempt. During the wait it rejects
 * any identity change — if the user switches project, version or design
 * mid-retry, the wait does NOT accept a result that belongs to a different
 * design.
 *
 * EXPLICIT REUSE: if the pinned design already has an authoritative published
 * result at attempt start (e.g. the settings were restored to the baseline
 * and the baseline result is already current), the orchestrator confirms
 * that explicitly WITHOUT launching another calculation. The returned
 * `reused: true` tells the caller the existing result was confirmed, not
 * that a new calculation ran. The caller must never present this as the
 * candidate having been applied.
 *
 * SUCCESS is marked only when the authoritative published result's
 * fingerprint matches the PINNED cacheKey. A previously completed result for
 * a different design is never accepted.
 */

/** Workflow phases that qualify for a targeted recovery retry. */
export const POST_APPLY_FAILURE_PHASES = new Set(["recalculating", "publishing"]);

/**
 * Check whether the completed bass authority is AUTHORITATIVE and its result
 * fingerprint matches a SPECIFIC pinned fingerprint — not the mutable current
 * cacheKey. This prevents accepting a result that belongs to a different
 * design.
 */
export function isAuthoritativeForFingerprint(shared, fingerprint) {
  if (!fingerprint) return false;
  return shared?.completedBassAuthority?.authorityStatus === "AUTHORITATIVE"
    && shared?.completedBassAuthority?.contract?.job?.resultFingerprint === fingerprint;
}

/**
 * Attempt a targeted recovery retry.
 *
 * @param {Object} args
 * @param {string} args.lastErrorPhase      Phase recorded at the original failure.
 * @param {Object} args.sharedRef           Ref to the latest shared bass context.
 * @param {Object} args.phaseRef            Ref used for cancel detection.
 * @param {string} [args.pinnedProjectId]   Project id at attempt start (optional extra check).
 * @param {string} [args.pinnedVersionId]   Version id at attempt start (optional extra check).
 * @param {number} [args.sleepMs=100]       Poll interval.
 * @param {number} [args.timeoutMs=30000]   Maximum wait (no extension beyond existing).
 * @param {Function} [args.sleep]            Injectable sleep for tests.
 *
 * @returns {Promise<{action: string, reason?: string, reused?: boolean, pinnedCacheKey?: string}>}
 *   "fallback-reset" — not a post-apply failure; caller should reset.
 *   "success"        — pinned design's bass result is published and matches.
 *                     reused=true if an existing result was confirmed without
 *                     launching a new calculation.
 *   "failed"         — recovery failed; caller preserves the error with reason.
 */
export async function attemptRecoveryRetry({
  lastErrorPhase,
  sharedRef,
  phaseRef,
  pinnedProjectId = null,
  pinnedVersionId = null,
  sleepMs = 100,
  timeoutMs = 30000,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
}) {
  if (!POST_APPLY_FAILURE_PHASES.has(lastErrorPhase)) {
    return { action: "fallback-reset" };
  }

  const initial = sharedRef.current;
  if (!initial || typeof initial?.onCalculate !== "function") {
    return {
      action: "failed",
      reason: "Bass calculation is not ready. Reload the project and try again.",
    };
  }

  // Pin the exact design identity at attempt start.
  const pinnedCacheKey = initial?.cacheKey || null;
  if (!pinnedCacheKey) {
    return {
      action: "failed",
      reason: "The current design identity is not available. Reload the project and try again.",
    };
  }

  // EXPLICIT REUSE: if the pinned design already has an authoritative published
  // result, confirm it without launching another calculation. This handles
  // the restored-baseline case: the baseline result is already current.
  if (isAuthoritativeForFingerprint(initial, pinnedCacheKey)) {
    return { action: "success", reused: true, pinnedCacheKey };
  }

  // Launch the calculation for the pinned design.
  initial.onCalculate();

  const start = Date.now();
  while (true) {
    await sleep(sleepMs);

    if (phaseRef.current === "cancelled") {
      return {
        action: "failed",
        reason: "Recovery was cancelled. The saved plan is intact; settings are unchanged.",
        pinnedCacheKey,
      };
    }

    const state = sharedRef.current;

    // Reject identity changes: if the cacheKey changed, the user switched
    // design/project mid-retry. Do NOT accept a result for a different design.
    if (state?.cacheKey && state.cacheKey !== pinnedCacheKey) {
      return {
        action: "failed",
        reason: "The design changed during recovery. The saved plan is intact; retry when the design is settled.",
        pinnedCacheKey,
        actualCacheKey: state.cacheKey,
      };
    }

    // Optional project/version identity check (defence in depth).
    if (pinnedVersionId && state?.versionId && state.versionId !== pinnedVersionId) {
      return {
        action: "failed",
        reason: "The project version changed during recovery. The saved plan is intact; retry when the design is settled.",
        pinnedCacheKey,
      };
    }

    if (isAuthoritativeForFingerprint(state, pinnedCacheKey)) {
      return { action: "success", reused: false, pinnedCacheKey };
    }

    if (Date.now() - start > timeoutMs) {
      return {
        action: "failed",
        reason: "The recalculated bass result could not be published within the expected time. The saved plan is intact; settings are unchanged.",
        pinnedCacheKey,
      };
    }
  }
}

export default attemptRecoveryRetry;