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
 * IDENTITY PINNING: the orchestrator captures a REQUIRED live identity
 * (project id, version id, settings signature) plus the cacheKey at the start
 * of the attempt via a readLiveIdentity callback. During the wait it rejects
 * any identity change — if the user switches project, version, subwoofer
 * settings or crossover mid-retry, the wait does NOT accept a result that
 * belongs to a different design. The settings signature catches an edit that
 * has changed the live subwoofers/crossover BEFORE the bass owner's cacheKey
 * has advanced (the cacheKey is recomputed asynchronously), so a lagging
 * cache identity cannot accept old results after settings change.
 *
 * PROMPT REJECTION: a terminal failure outcome (error/rejected/timeout/
 * cancelled/stale) on the current calculation is returned immediately with
 * the original terminalMessage — the orchestrator never waits out its own
 * timeout for a request that already failed. A completed authority is never
 * reused when another calculation is active or the current request failed.
 *
 * EXPLICIT REUSE: if the pinned design already has an authoritative published
 * result at attempt start (e.g. the settings were restored to the baseline
 * and the baseline result is already current), the orchestrator confirms
 * that explicitly WITHOUT launching another calculation — but only when no
 * other calculation is active and no terminal failure is present. The
 * returned `reused: true` tells the caller the existing result was confirmed,
 * not that a new calculation ran. The caller must never present this as the
 * candidate having been applied.
 *
 * SUCCESS is marked only when the authoritative published result is
 * structurally complete, its resultFingerprint AND currentJobFingerprint both
 * match the PINNED cacheKey. A previously completed result for a different
 * design is never accepted, and a structurally incomplete or stale contract
 * is rejected by the established publication authority.
 */

/** Workflow phases that qualify for a targeted recovery retry. */
export const POST_APPLY_FAILURE_PHASES = new Set(["recalculating", "publishing"]);

/**
 * Terminal calculation outcomes that mean the current request has already
 * failed. The orchestrator returns these promptly instead of waiting out
 * its own timeout.
 */
export const TERMINAL_FAILURE_OUTCOMES = new Set([
  "error",
  "rejected",
  "timeout",
  "cancelled",
  "stale",
]);

/**
 * Structural completeness check for a completed bass contract, mirroring the
 * established publication authority's isStructurallyCompleteBassContract. A
 * contract that is not structurally complete must never be accepted as an
 * authoritative result for recovery — it is either still in flight or a
 * stale/different contract. Implemented locally (rather than imported from
 * the persistence module) so the orchestrator stays testable without
 * mounting the full React app and its transitive imports.
 */
export function contractStructurallyComplete(contract) {
  const status = contract?.job?.status;
  if (!["ready", "complete"].includes(status)) return false;
  const job = contract?.job || {};
  if (!job.resultFingerprint) return false;
  if (!job.currentJobFingerprint) return false;
  return job.resultFingerprint === job.currentJobFingerprint;
}

/**
 * Check whether the completed bass authority is AUTHORITATIVE, structurally
 * complete, and its resultFingerprint AND currentJobFingerprint both match a
 * SPECIFIC pinned fingerprint — not the mutable current cacheKey. This
 * prevents accepting a result that belongs to a different design, a
 * structurally incomplete contract, or a stale contract whose currentJob
 * fingerprint disagrees with the pinned identity.
 */
export function isAuthoritativeForFingerprint(shared, fingerprint) {
  if (!fingerprint) return false;
  const authority = shared?.completedBassAuthority;
  if (!authority || authority?.authorityStatus !== "AUTHORITATIVE") return false;
  const contract = authority?.contract;
  if (!contractStructurallyComplete(contract)) return false;
  const job = contract?.job || {};
  if (job.resultFingerprint !== fingerprint) return false;
  if (job.currentJobFingerprint !== fingerprint) return false;
  return true;
}

/**
 * Attempt a targeted recovery retry.
 *
 * @param {Object} args
 * @param {string} args.lastErrorPhase      Phase recorded at the original failure.
 * @param {Object} args.sharedRef           Ref to the latest shared bass context.
 * @param {Object} args.phaseRef            Ref used for cancel detection.
 * @param {Function} args.readLiveIdentity  REQUIRED: () => { projectId, versionId, settingsSignature }
 *   Reads the authoritative live identity (project, version, actual subwoofer
 *   settings + crossover signature) from the live electronic ref. Verified at
 *   entry and every poll so a lagging cache identity cannot accept old results
 *   after settings change.
 * @param {number} [args.sleepMs=100]       Poll interval.
 * @param {number} [args.timeoutMs=30000]   Maximum wait (no extension beyond existing).
 * @param {Function} [args.sleep]            Injectable sleep for tests.
 *
 * @returns {Promise<{action: string, reason?: string, reused?: boolean, pinned?: Object, outcome?: string, actualCacheKey?: string, actualIdentity?: Object, actualSettingsSignature?: string}>}
 *   "fallback-reset" — not a post-apply failure; caller should reset.
 *   "success"        — pinned design's bass result is published and matches.
 *                     reused=true if an existing result was confirmed without
 *                     launching a new calculation.
 *   "failed"         — recovery failed; caller preserves the error with reason.
 *                     `outcome` carries the terminal calculation outcome when
 *                     the failure was a prompt rejection. `pinned` carries the
 *                     pinned identity for diagnostics.
 */
export async function attemptRecoveryRetry({
  lastErrorPhase,
  sharedRef,
  phaseRef,
  readLiveIdentity,
  sleepMs = 100,
  timeoutMs = 30000,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
}) {
  if (!POST_APPLY_FAILURE_PHASES.has(lastErrorPhase)) {
    return { action: "fallback-reset" };
  }

  if (typeof readLiveIdentity !== "function") {
    return {
      action: "failed",
      reason: "Recovery identity is not available. Reload the project and try again.",
    };
  }

  const initial = sharedRef.current;
  if (!initial || typeof initial?.onCalculate !== "function") {
    return {
      action: "failed",
      reason: "Bass calculation is not ready. Reload the project and try again.",
    };
  }

  // Pin the exact design identity (cacheKey) at attempt start.
  const pinnedCacheKey = initial?.cacheKey || null;
  if (!pinnedCacheKey) {
    return {
      action: "failed",
      reason: "The current design identity is not available. Reload the project and try again.",
    };
  }

  // Read and pin the authoritative live identity (project, version, settings
  // signature). The settings signature catches an edit that has changed the
  // live subwoofers/crossover BEFORE the bass owner's cacheKey has advanced.
  const initialIdentity = readLiveIdentity();
  if (!initialIdentity || !initialIdentity.projectId || !initialIdentity.versionId) {
    return {
      action: "failed",
      reason: "The current project identity is not available. Reload the project and try again.",
    };
  }
  const pinned = {
    projectId: initialIdentity.projectId,
    versionId: initialIdentity.versionId,
    settingsSignature: initialIdentity.settingsSignature || null,
    cacheKey: pinnedCacheKey,
  };

  // PROMPT REJECTION: a terminal failure outcome on the current calculation is
  // returned immediately — do not wait out the orchestrator's own timeout for a
  // request that already failed.
  const initialOutcome = initial?.calculationOutcome || null;
  if (TERMINAL_FAILURE_OUTCOMES.has(initialOutcome)) {
    return {
      action: "failed",
      reason: initial?.terminalMessage
        || `The bass calculation failed (${initialOutcome}). The saved plan is intact; settings are unchanged.`,
      pinned,
      outcome: initialOutcome,
    };
  }

  // EXPLICIT REUSE: if the pinned design already has an authoritative published
  // result, confirm it without launching another calculation — but ONLY when
  // no other calculation is active and no terminal failure is present. A
  // completed authority is never reused when another calculation is active or
  // the current request failed/was rejected.
  const anotherCalcActive = initial?.calculationInProgress === true;
  if (!anotherCalcActive && isAuthoritativeForFingerprint(initial, pinnedCacheKey)) {
    return { action: "success", reused: true, pinned };
  }

  // If another calculation is already in progress for this design, do NOT
  // launch a duplicate — wait for it. Otherwise launch the calculation for the
  // pinned design.
  if (!anotherCalcActive) {
    initial.onCalculate();
  }

  const start = Date.now();
  while (true) {
    await sleep(sleepMs);

    if (phaseRef.current === "cancelled") {
      return {
        action: "failed",
        reason: "Recovery was cancelled. The saved plan is intact; settings are unchanged.",
        pinned,
      };
    }

    // Verify the authoritative live identity at every poll. A project, version
    // or settings change mid-retry means the pinned design is no longer current.
    const liveIdentity = readLiveIdentity();
    if (!liveIdentity || liveIdentity.projectId !== pinned.projectId
        || liveIdentity.versionId !== pinned.versionId) {
      return {
        action: "failed",
        reason: "The project or version changed during recovery. The saved plan is intact; retry when the design is settled.",
        pinned,
        actualIdentity: liveIdentity,
      };
    }
    if (pinned.settingsSignature && liveIdentity.settingsSignature
        && liveIdentity.settingsSignature !== pinned.settingsSignature) {
      return {
        action: "failed",
        reason: "The subwoofer settings changed during recovery. The saved plan is intact; retry when the design is settled.",
        pinned,
        actualSettingsSignature: liveIdentity.settingsSignature,
      };
    }

    const state = sharedRef.current;

    // Reject cacheKey identity changes: if the cacheKey changed, the user
    // switched design mid-retry. Do NOT accept a result for a different design.
    if (state?.cacheKey && state.cacheKey !== pinned.cacheKey) {
      return {
        action: "failed",
        reason: "The design changed during recovery. The saved plan is intact; retry when the design is settled.",
        pinned,
        actualCacheKey: state.cacheKey,
      };
    }

    // PROMPT REJECTION: a terminal failure outcome during the wait is returned
    // immediately with the original terminalMessage.
    const outcome = state?.calculationOutcome || null;
    if (TERMINAL_FAILURE_OUTCOMES.has(outcome)) {
      return {
        action: "failed",
        reason: state?.terminalMessage
          || `The bass calculation failed (${outcome}). The saved plan is intact; settings are unchanged.`,
        pinned,
        outcome,
      };
    }

    if (isAuthoritativeForFingerprint(state, pinned.cacheKey)) {
      return { action: "success", reused: false, pinned };
    }

    if (Date.now() - start > timeoutMs) {
      return {
        action: "failed",
        reason: "The recalculated bass result could not be published within the expected time. The saved plan is intact; settings are unchanged.",
        pinned,
      };
    }
  }
}

export default attemptRecoveryRetry;