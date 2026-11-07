// applyRecalcSettleAuthority.js
//
// Pure decision authority for the post-Apply authoritative bass recalculation.
//
// When an evaluated subwoofer recommendation is applied, the committed
// subwoofer instances propagate through the calibration chain (instances ->
// sources -> RSP -> calibration fingerprint) over several renders, so the
// live calculation fingerprint passes through TRANSIENT values before it
// settles on the new arrangement's identity. Firing onCalculate against a
// transient fingerprint dispatches a manual request that no longer matches
// the settled design, so manualRequestMatchesCurrent flips false and the
// request is cancelled, leaving the previous arrangement's result displayed
// as current.
//
// This module decides, from the pending settle state and the current live
// fingerprint, whether to WAIT (the chain has not propagated yet), OBSERVE
// (the fingerprint moved; force one confirmation render), FIRE (the fingerprint
// has transitioned away from the pre-apply identity and is stable across the
// threshold of consecutive renders -> the settled, committed identity), or
// RELEASE (a bounded safety valve so the UI never hangs on "Calculating...").
//
// It is pure and unit-testable; the Bass Design Assistant effect is a thin
// shell around it. It changes no acoustic physics, RP22 scoring, optimiser
// ranking, subwoofer geometry or recommendation UI.

export const APPLY_SETTLE_DEFAULTS = Object.freeze({
  // Bounded safety valve (render attempts, not a timer). The calibration chain
  // settles in a handful of renders; 40 leaves wide headroom.
  maxAttempts: 40,
  // Consecutive identical fingerprint observations required after the
  // transition before firing, so a transient intermediate value is never
  // mistaken for the settled identity.
  stableThreshold: 3,
});

/**
 * Create the initial pending settle state at the instant of Apply.
 * `preApplyFingerprint` is the live calculation fingerprint BEFORE the
 * committed arrangement has propagated, so the authority can wait for the
 * live fingerprint to move away from it.
 */
export function createApplyRecalcSettleState(preApplyFingerprint) {
  return {
    pending: true,
    preApplyFingerprint: preApplyFingerprint || null,
    lastObservedFingerprint: null,
    transitioned: false,
    stableCount: 0,
    attempts: 0,
  };
}

function releasedState() {
  return {
    pending: false,
    preApplyFingerprint: null,
    lastObservedFingerprint: null,
    transitioned: false,
    stableCount: 0,
    attempts: 0,
  };
}

/**
 * Resolve the next settle state and action from the current state.
 *
 * @param {object} state - current settle state (from createApplyRecalcSettleState)
 * @param {string|null} liveFp - the live calculation fingerprint (shared.fingerprint)
 * @param {boolean} gateReady - liveFp truthy && canCalculate && !calculationInProgress
 * @param {object} [opts] - { maxAttempts, stableThreshold }
 * @returns {{ state: object, action: "wait"|"observe"|"fire"|"release"|"idle" }}
 */
export function resolveApplyRecalcSettle(state, liveFp, gateReady, opts = APPLY_SETTLE_DEFAULTS) {
  if (!state || !state.pending) return { state, action: "idle" };

  // Gate: the calculation fingerprint must be resolved and the engine ready
  // before any recalculation is dispatched. While not ready, WAIT on the
  // shared-context dep changes (fingerprint, canCalculate,
  // calculationInProgress) to re-run, never ticking here.
  if (!gateReady) {
    const attempts = state.attempts + 1;
    if (attempts > opts.maxAttempts) return { state: releasedState(), action: "release" };
    return { state: { ...state, attempts }, action: "wait" };
  }

  const fp = liveFp || null;

  // 1. Wait for the fingerprint to transition away from the pre-apply identity.
  //    Until it does, the committed arrangement has not entered the chain, and
  //    firing would dispatch against the previous arrangement's fingerprint.
  if (!state.transitioned) {
    if (fp === state.preApplyFingerprint) {
      const attempts = state.attempts + 1;
      if (attempts > opts.maxAttempts) return { state: releasedState(), action: "release" };
      return { state: { ...state, attempts }, action: "wait" };
    }
    return {
      state: {
        ...state,
        transitioned: true,
        lastObservedFingerprint: fp,
        stableCount: 1,
        attempts: state.attempts + 1,
      },
      action: "observe",
    };
  }

  // 2. The fingerprint moved since the last observation. Reset the stability
  //    count and force one confirmation render.
  if (fp !== state.lastObservedFingerprint) {
    return {
      state: {
        ...state,
        lastObservedFingerprint: fp,
        stableCount: 1,
        attempts: state.attempts + 1,
      },
      action: "observe",
    };
  }

  // 3. The fingerprint is identical to the previous render. Count it toward
  //    the stability threshold.
  const stableCount = state.stableCount + 1;
  if (stableCount < opts.stableThreshold) {
    return {
      state: { ...state, stableCount, attempts: state.attempts + 1 },
      action: "observe",
    };
  }

  // 4. Transitioned AND stable across the threshold of consecutive renders:
  //    this is the settled, committed arrangement identity. Fire exactly one
  //    recalculation against it.
  return { state: releasedState(), action: "fire" };
}