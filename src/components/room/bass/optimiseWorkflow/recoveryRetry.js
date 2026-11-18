import { isStructurallyCompleteBassContract } from "@/components/room/bass/completedBassResultPersistence";

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
 * (project id, version id, settings signature, AND a physical-context
 * signature derived from electronicContextFromUi(live) via physicalContext)
 * plus the cacheKey at the start of the attempt via a readLiveIdentity
 * callback. During the wait it rejects any identity change — if the user
 * switches project, version, subwoofer settings, crossover, OR edits
 * geometry/seating/RSP before the bass owner's cacheKey has advanced, the wait
 * does NOT accept a result that belongs to a different design. The settings
 * signature catches an electronic edit; the physical-context signature catches
 * a geometry/seat/RSP edit that changed the physical design before the
 * cacheKey recomputed.
 *
 * PRODUCTION PUBLICATION RECEIPT: the orchestrator uses job.completedAtMs as
 * the real publication receipt. The bass background store ALWAYS populates
 * completedAtMs on every terminal state (fresh complete, cache-hit, error,
 * cancelled) with this.now(), and the adapter copies it into the contract job.
 * It is null ONLY while a request is queued/calculating. job.calculationId is
 * NEVER populated in production (the contract factory defaults it to null and
 * no store/adapter writes it), so it cannot be used as a receipt. For a
 * same-design re-calculation the resultFingerprint AND currentJobFingerprint
 * are IDENTICAL before and after (the store sets both to the fingerprint), so
 * detecting "a new publication landed" requires completedAtMs to have advanced
 * from the pre-dispatch value — never the fingerprint.
 *
 * OLD vs NEW TERMINAL: a terminal failure outcome (error/rejected/timeout/
 * cancelled/stale) present at entry is the ORIGINAL failed calculation's
 * outcome (calculationInProgress is false). It is NOT an immediate failure —
 * that would make Retry incapable of retrying the original failed calculation.
 * The orchestrator dispatches a FRESH onCalculate and observes the new
 * request's lifecycle: the old terminal is masked once the new request makes
 * calculationInProgress true, and only a terminal that appears AFTER the new
 * request was observed running is treated as the NEW failure. The old
 * terminal's diagnostics are preserved on the returned result
 * (originalOutcome/originalTerminalMessage) so the caller never loses the
 * original reason. A blocked dispatch (canCalculate false) is a failure.
 *
 * EXPLICIT REUSE: if the pinned design already has an authoritative published
 * result at attempt start (e.g. the settings were restored to the baseline
 * and the baseline result is already current), the orchestrator confirms
 * that explicitly WITHOUT launching another calculation — but only when no
 * other calculation is active AND no old terminal failure is present. An old
 * terminal prohibits stale-authority reuse: a fresh calculation is run
 * instead. The returned `reused: true` tells the caller the existing result
 * was confirmed, not that a new calculation ran. The caller must never
 * present this as the candidate having been applied. Old authority is never
 * accepted before the new request is observed running and has settled.
 *
 * SUCCESS is marked only when completedAtMs ADVANCED from the pre-dispatch
 * value (a newly populated matching receipt — proving a new publication
 * landed, never the unchanged pre-dispatch authority) AND the authoritative
 * published result is structurally complete with resultFingerprint AND
 * currentJobFingerprint both matching the PINNED cacheKey. A previously
 * completed result for a different design is never accepted, and a structurally
 * incomplete or stale contract is rejected by the established publication
 * authority.
 *
 * NEW REJECTION may not replace the completedBassAuthority job at all: when
 * the new request was observed running (newRequestObserved) and has now
 * settled (!calculationInProgress) with a terminal outcome, the orchestrator
 * fails PROMPTLY on that terminal even if the publication receipt
 * (completedAtMs) is unchanged.
 */

/** Workflow phases that qualify for a targeted recovery retry. */
export const POST_APPLY_FAILURE_PHASES = new Set(["recalculating", "publishing"]);

// Workflow errors survive component navigation; a component ref may not.
export function resolveRecoveryFailurePhase(workflowState, localPhase = null) {
  return workflowState?.failurePhase || localPhase || null;
}

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
 * Structural completeness check for a completed bass contract. This is the
 * ESTABLISHED publication authority's isStructurallyCompleteBassContract —
 * imported, not re-implemented — so the orchestrator can never relax the
 * version/metric-schema and selectedCandidate/Id requirements that a parallel
 * local definition would silently drop. Re-exported under the legacy name so
 * existing callers/tests import the real validator.
 */
export const contractStructurallyComplete = isStructurallyCompleteBassContract;

/**
 * The REAL production publication receipt: job.completedAtMs. The bass
 * background store always populates it on every terminal state (fresh
 * complete, cache-hit, error, cancelled) with this.now(), and the adapter
 * copies it into the contract job; it is null only while a request is
 * queued/calculating. job.calculationId is never populated in production, so
 * it is deliberately NOT used. Returns null for a missing/empty value.
 */
function completedAtMsOf(state) {
  const v = state?.completedBassAuthority?.contract?.job?.completedAtMs;
  return Number.isFinite(v) ? v : null;
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
 * OLD vs NEW TERMINAL: an old terminal outcome (error/rejected/timeout/
 * cancelled/stale) from the ORIGINAL failed calculation is present at entry
 * when `calculationInProgress` is false. It must NOT cause an immediate
 * failure — that would make Retry incapable of retrying the original failed
 * calculation. Instead the orchestrator dispatches a FRESH onCalculate and
 * observes the new request's lifecycle: the old terminal is masked once the
 * new request makes `calculationInProgress` true, and only a terminal that
 * appears AFTER the new request was observed running is treated as the NEW
 * failure. The old terminal's diagnostics are preserved on the returned
 * result so the caller never loses the original reason.
 *
 * OLD AUTHORITY: a previously published authoritative result that matches the
 * pinned cacheKey may still be present at entry (it predates the apply, or is
 * from the same design). It is NEVER accepted before the new request completes:
 * acceptance requires that completedAtMs ADVANCED from the pre-dispatch value
 * (a newly populated matching receipt), never the unchanged pre-dispatch
 * authority.
 *
 * @param {Object} args
 * @param {string} args.lastErrorPhase      Phase recorded at the original failure.
 * @param {Object} args.sharedRef           Ref to the latest shared bass context.
 * @param {Object} args.phaseRef            Ref used for cancel detection.
 * @param {Function} args.readLiveIdentity  REQUIRED: () => { projectId, versionId, settingsSignature, physicalContextSignature? }
 *   Reads the authoritative live identity (project, version, actual subwoofer
 *   settings + crossover signature, AND a physical-context signature derived
 *   from electronicContextFromUi(live) via physicalContext) from the live
 *   electronic ref. Verified at entry and every poll so a lagging cache
 *   identity cannot accept old results after settings OR geometry/seating/RSP
 *   change.
 * @param {Function} [args.authoritativeElectronicsMatchLive] () => boolean.
 *   Real check that the shared authoritative bass context has ingested the
 *   CURRENT live electronic settings (crossover + per-source tuning derived
 *   from the live subwoofer instances via the existing helpers). Pinning a live
 *   settings signature plus a possibly-lagging cacheKey does not prove they
 *   correspond: the authoritative electronics must match the actual current
 *   live settings before any reuse or dispatch, and throughout the wait. A
 *   mismatch fails with actionable settling feedback and preserves the plan.
 * @param {number} [args.sleepMs=100]       Poll interval.
 * @param {number} [args.timeoutMs=30000]   Maximum wait (no extension beyond existing).
 * @param {number} [args.dispatchGraceMs=3000] Time to wait for a queued dispatch
 *   to actually make `calculationInProgress` true before treating it as a
 *   no-op dispatch.
 * @param {Function} [args.sleep]            Injectable sleep for tests.
 *
 * @returns {Promise<{action: string, reason?: string, reused?: boolean, pinned?: Object, outcome?: string, originalOutcome?: string, originalTerminalMessage?: string, actualCacheKey?: string, actualIdentity?: Object, actualSettingsSignature?: string, actualPhysicalContextSignature?: string}>}
 *   "fallback-reset" — not a post-apply failure; caller should reset.
 *   "success"        — pinned design's bass result is published and matches.
 *                     reused=true if an existing result was confirmed without
 *                     launching a new calculation.
 *   "failed"         — recovery failed; caller preserves the error with reason.
 *                     `outcome` carries the NEW terminal calculation outcome
 *                     when the failure was the new request's terminal.
 *                     `originalOutcome`/`originalTerminalMessage` preserve the
 *                     OLD terminal diagnostics. `pinned` carries the pinned
 *                     identity for diagnostics.
 */
export async function attemptRecoveryRetry({
  lastErrorPhase,
  sharedRef,
  phaseRef,
  readLiveIdentity,
  authoritativeElectronicsMatchLive,
  sleepMs = 100,
  timeoutMs = 30000,
  dispatchGraceMs = 3000,
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
  // signature, AND physical-context signature). The settings signature catches
  // an electronic edit; the physical-context signature catches a geometry/
  // seating/RSP edit that changed the physical design before the bass owner's
  // cacheKey recomputed.
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
    physicalContextSignature: initialIdentity.physicalContextSignature || null,
    cacheKey: pinnedCacheKey,
  };

  // Preserve the OLD terminal diagnostics BEFORE any dispatch. These are the
  // original failed calculation's reason; they are returned on a NEW failure so
  // the caller never loses the original reason. A terminal at entry is NOT an
  // immediate failure — it is the reason we are retrying.
  const originalOutcome = initial?.calculationOutcome || null;
  const originalTerminalMessage = initial?.terminalMessage || null;
  const hadOldTerminal = TERMINAL_FAILURE_OUTCOMES.has(originalOutcome);

  const calcInProgressAtEntry = initial?.calculationInProgress === true;

  // AUTHORITATIVE ELECTRONICS vs LIVE SETTINGS: pinning a live settings
  // signature plus a possibly-lagging cacheKey does not prove they correspond.
  // The shared authoritative bass context must have ingested the CURRENT live
  // electronic settings (crossover + per-source tuning) before any reuse or
  // dispatch, and throughout the wait. A mismatch fails with actionable
  // settling feedback and preserves the plan. The caller supplies the real
  // check (recommendationSettingsMatch against the live-derived tuning); when
  // not supplied (legacy tests) it is treated as satisfied.
  const authElectronicsOk = () => typeof authoritativeElectronicsMatchLive !== "function"
    || authoritativeElectronicsMatchLive();

  // EXPLICIT REUSE: if the pinned design already has an authoritative published
  // result, confirm it without launching another calculation — but ONLY when
  // no other calculation is active, no old terminal failure is present, AND the
  // authoritative electronics match the current live settings. An old terminal
  // prohibits stale-authority reuse: the orchestrator must run a fresh
  // calculation instead of accepting the pre-existing result.
  if (!calcInProgressAtEntry && !hadOldTerminal && authElectronicsOk()
      && isAuthoritativeForFingerprint(initial, pinnedCacheKey)) {
    return { action: "success", reused: true, pinned };
  }
  if (!authElectronicsOk()) {
    return {
      action: "failed",
      reason: "The bass analysis has not settled on the current electronic settings. The saved plan is intact; retry when the settings have settled.",
      pinned,
      originalOutcome: hadOldTerminal ? originalOutcome : null,
      originalTerminalMessage: hadOldTerminal ? originalTerminalMessage : null,
    };
  }

  // Helper: original-terminal diagnostics to attach to every terminal return so
  // the caller never loses the original failed calculation's reason, whether the
  // retry succeeded or failed.
  const originalDiag = hadOldTerminal
    ? { originalOutcome, originalTerminalMessage }
    : {};

  // Dispatch a fresh calculation unless one is already running for this design.
  // If a calculation is already in progress at entry, wait for it (its terminal
  // is the NEW terminal, since an in-progress request masks any old terminal).
  let newDispatched = false;
  let dispatchRequestId = null;
  let dispatchFingerprint = null;
  // Capture the REAL publication receipt (job.completedAtMs) BEFORE dispatch.
  // The bass background store always populates completedAtMs on every terminal
  // state (fresh complete, cache-hit, error, cancelled) with this.now(), and
  // the adapter copies it into the contract job; it is null only while a request
  // is queued/calculating. After the wait, an ADVANCED completedAtMs proves a
  // new publication landed — even when a fast cached result started AND finished
  // between polls (calculationInProgress never observed true) AND for a
  // same-design re-calculation where resultFingerprint/currentJobFingerprint are
  // IDENTICAL before and after. job.calculationId is never populated in
  // production, so it is deliberately NOT used. An UNCHANGED pre-dispatch
  // authority is never accepted.
  const preDispatchCompletedAtMs = completedAtMsOf(initial);
  if (!calcInProgressAtEntry) {
    const dispatch = initial.onCalculate();
    if (dispatch && dispatch.action === "blocked") {
      return {
        action: "failed",
        reason: "Bass calculation is not ready (blocked). Reload the project and try again.",
        pinned,
        originalOutcome: hadOldTerminal ? originalOutcome : null,
        originalTerminalMessage: hadOldTerminal ? originalTerminalMessage : null,
      };
    }
    newDispatched = true;
    dispatchRequestId = dispatch?.requestId || null;
    dispatchFingerprint = dispatch?.fingerprint || null;
    // If onCalculate returned a fingerprint that disagrees with the pinned
    // cacheKey, the design changed at the dispatch instant — do not wait for a
    // result that belongs to a different design.
    if (dispatchFingerprint && dispatchFingerprint !== pinned.cacheKey) {
      return {
        action: "failed",
        reason: "The design changed at recovery dispatch. The saved plan is intact; retry when the design is settled.",
        pinned,
        actualCacheKey: dispatchFingerprint,
        originalOutcome: hadOldTerminal ? originalOutcome : null,
        originalTerminalMessage: hadOldTerminal ? originalTerminalMessage : null,
      };
    }
  }

  const start = Date.now();
  // newRequestObserved: the dispatched (or already-running) request was seen
  // running (calculationInProgress === true). Old authority is never accepted
  // before the new request is observed running.
  let newRequestObserved = calcInProgressAtEntry;
  while (true) {
    await sleep(sleepMs);

    if (phaseRef.current === "cancelled") {
      return {
        action: "failed",
        reason: "Recovery was cancelled. The saved plan is intact; settings are unchanged.",
        pinned,
        originalOutcome: hadOldTerminal ? originalOutcome : null,
        originalTerminalMessage: hadOldTerminal ? originalTerminalMessage : null,
      };
    }

    // Verify the authoritative live identity at every poll. A project, version,
    // settings OR physical-context change mid-retry means the pinned design is
    // no longer current.
    const liveIdentity = readLiveIdentity();
    if (!liveIdentity || liveIdentity.projectId !== pinned.projectId
        || liveIdentity.versionId !== pinned.versionId) {
      return {
        action: "failed",
        reason: "The project or version changed during recovery. The saved plan is intact; retry when the design is settled.",
        pinned,
        actualIdentity: liveIdentity,
        originalOutcome: hadOldTerminal ? originalOutcome : null,
        originalTerminalMessage: hadOldTerminal ? originalTerminalMessage : null,
      };
    }
    if (pinned.settingsSignature && liveIdentity.settingsSignature
        && liveIdentity.settingsSignature !== pinned.settingsSignature) {
      return {
        action: "failed",
        reason: "The subwoofer settings changed during recovery. The saved plan is intact; retry when the design is settled.",
        pinned,
        actualSettingsSignature: liveIdentity.settingsSignature,
        originalOutcome: hadOldTerminal ? originalOutcome : null,
        originalTerminalMessage: hadOldTerminal ? originalTerminalMessage : null,
      };
    }
    // Physical-context signature: catches a geometry/seating/RSP edit that
    // changed the physical design before the bass owner's cacheKey recomputed.
    if (pinned.physicalContextSignature && liveIdentity.physicalContextSignature
        && liveIdentity.physicalContextSignature !== pinned.physicalContextSignature) {
      return {
        action: "failed",
        reason: "The room, seating or RSP changed during recovery. The saved plan is intact; retry when the design is settled.",
        pinned,
        actualPhysicalContextSignature: liveIdentity.physicalContextSignature,
        originalOutcome: hadOldTerminal ? originalOutcome : null,
        originalTerminalMessage: hadOldTerminal ? originalTerminalMessage : null,
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
        originalOutcome: hadOldTerminal ? originalOutcome : null,
        originalTerminalMessage: hadOldTerminal ? originalTerminalMessage : null,
      };
    }

    // Authoritative electronics must continue to match the current live
    // settings throughout the wait; a lagging authoritative context is not a
    // valid result for the pinned design.
    if (!authElectronicsOk()) {
      return {
        action: "failed",
        reason: "The bass analysis has not settled on the current electronic settings. The saved plan is intact; retry when the settings have settled.",
        pinned,
        originalOutcome: hadOldTerminal ? originalOutcome : null,
        originalTerminalMessage: hadOldTerminal ? originalTerminalMessage : null,
      };
    }

    const inProgress = state?.calculationInProgress === true;
    if (inProgress) newRequestObserved = true;

    // Publication receipt advanced: completedAtMs moved from the pre-dispatch
    // value to a NEW finite value, proving a new publication/terminal landed —
    // EVEN when a fast cached result started and finished between polls and
    // calculationInProgress was never observed true, AND for a same-design
    // re-calculation where resultFingerprint/currentJobFingerprint are identical
    // before and after. An UNCHANGED pre-dispatch authority is never accepted.
    const currentCompletedAtMs = completedAtMsOf(state);
    const completedAtMsChanged = currentCompletedAtMs !== null
      && currentCompletedAtMs !== preDispatchCompletedAtMs;

    // Once the request has settled (!inProgress), classify the outcome. Two
    // independent signals prove a new request occurred: newRequestObserved (we
    // saw calculationInProgress true) and completedAtMsChanged (the real
    // publication receipt advanced). Terminal-failure detection uses EITHER,
    // because a rejected request may not replace the completedBassAuthority
    // job at all (completedAtMs unchanged) but newRequestObserved still proves
    // the new request ran and settled with a terminal. Success acceptance
    // REQUIRES completedAtMsChanged so an unchanged pre-dispatch authority is
    // never accepted.
    if (!inProgress && (newRequestObserved || completedAtMsChanged)) {
      const outcome = state?.calculationOutcome || null;
      if (TERMINAL_FAILURE_OUTCOMES.has(outcome)) {
        return {
          action: "failed",
          reason: state?.terminalMessage
            || `The bass calculation failed (${outcome}). The saved plan is intact; settings are unchanged.`,
          pinned,
          outcome,
          originalOutcome: hadOldTerminal ? originalOutcome : null,
          originalTerminalMessage: hadOldTerminal ? originalTerminalMessage : null,
        };
      }
      if (completedAtMsChanged && isAuthoritativeForFingerprint(state, pinned.cacheKey)) {
        return { action: "success", reused: false, pinned, ...originalDiag };
      }
      if (completedAtMsChanged) {
        // The publication receipt advanced but the published result does not
        // match the pinned design — a different design's result landed, or the
        // result is not authoritative/complete. Do not accept.
        return {
          action: "failed",
          reason: "The recalculated bass result does not match the current design. The saved plan is intact; retry when the design is settled.",
          pinned,
          actualCacheKey: state?.cacheKey || null,
          originalOutcome: hadOldTerminal ? originalOutcome : null,
          originalTerminalMessage: hadOldTerminal ? originalTerminalMessage : null,
        };
      }
      // newRequestObserved but completedAtMs unchanged: the new request ran and
      // settled without publishing a result.
      return {
        action: "failed",
        reason: "The bass calculation finished without publishing a result. The saved plan is intact; retry the update.",
        pinned,
        originalOutcome: hadOldTerminal ? originalOutcome : null,
        originalTerminalMessage: hadOldTerminal ? originalTerminalMessage : null,
      };
    }

    // A dispatched request that never advanced the publication receipt and never
    // made calculationInProgress true within the grace is a no-op dispatch
    // (e.g. canCalculate flipped false right after entry). Do not wait out the
    // full timeout for a request that never started. A receipt that DID advance
    // is not a no-op even if inProgress was never observed.
    if (newDispatched && !newRequestObserved && !completedAtMsChanged
        && Date.now() - start > dispatchGraceMs) {
      return {
        action: "failed",
        reason: "The bass calculation could not be started. Reload the project and try again.",
        pinned,
        originalOutcome: hadOldTerminal ? originalOutcome : null,
        originalTerminalMessage: hadOldTerminal ? originalTerminalMessage : null,
      };
    }

    if (Date.now() - start > timeoutMs) {
      return {
        action: "failed",
        reason: "The recalculated bass result could not be published within the expected time. The saved plan is intact; settings are unchanged.",
        pinned,
        originalOutcome: hadOldTerminal ? originalOutcome : null,
        originalTerminalMessage: hadOldTerminal ? originalTerminalMessage : null,
      };
    }
  }
}

export default attemptRecoveryRetry;