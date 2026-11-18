/**
 * verifyRecalculationScheduling.js
 * --------------------------------
 * Production identity/settings-wait-and-publication scheduling helper used by
 * performElectronicUpdate.verify. Extracted so the scheduling logic — settings
 * settle wait, cacheKey advancement wait, onCalculate dispatch, publication
 * wait — is testable without mounting the full React component or re-implement
 * the physics/verification match logic.
 *
 * The dispatch fingerprint is captured AT DISPATCH (the cacheKey at the moment
 * onCalculate is called), not at completion, so a stale-scheduling bug where
 * onCalculate is called before the cacheKey has advanced is detectable: the
 * dispatch fingerprint would equal the pre-commit key.
 *
 * The cacheKey advancement wait applies to BOTH apply and restore paths. A
 * stale restored-design handler must never be scheduled: waiting for the
 * cacheKey to advance past the pre-commit value before calling onCalculate
 * guarantees the bass analysis owner has registered the restored settings.
 *
 * The publication wait is delegated to an injected waitForPublication function
 * so this helper has no dependency on the production trace/capture machinery.
 * The settings match and result match checks are performed by the CALLER using
 * the real recommendationSettingsMatch / recommendationResultMatches functions,
 * so this helper never duplicates that logic.
 */
import { settingsEqual } from "./electronicApplication.js";

/**
 * @param {Object} args
 * @param {Object} args.sharedRef            Ref to the latest shared bass context.
 * @param {Object} args.phaseRef             Ref used for cancel detection.
 * @param {Function} args.readLiveSettings   () => { instances, crossover } — live settings.
 * @param {Object} args.targetSettings       Committed settings to settle to.
 * @param {string} args.preCommitCacheKey    cacheKey captured before the electronic commit.
 * @param {Function} args.waitForPublication async (sharedRef, phaseRef) => boolean.
 * @param {Function} [args.sleep]            Injectable sleep for tests.
 * @param {number} [args.settleTimeoutMs]
 * @param {number} [args.cacheAdvanceTimeoutMs]
 * @param {number} [args.settlePollMs]
 * @param {number} [args.cachePollMs]
 *
 * @returns {Promise<{ok: boolean, reason?: string, dispatchFingerprint?: string|null, resolvedCacheKey?: string|null}>}
 */
export async function verifyRecalculationScheduling({
  sharedRef,
  phaseRef,
  readLiveSettings,
  targetSettings,
  preCommitCacheKey,
  waitForPublication,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  settleTimeoutMs = 15000,
  cacheAdvanceTimeoutMs = 15000,
  settlePollMs = 50,
  cachePollMs = 100,
}) {
  // 1. Wait for the live settings to settle to the committed target.
  const settleStart = Date.now();
  while (Date.now() - settleStart < settleTimeoutMs) {
    if (phaseRef?.current === "cancelled") return { ok: false, reason: "cancelled" };
    if (settingsEqual(readLiveSettings(), targetSettings)) break;
    await sleep(settlePollMs);
  }
  if (!settingsEqual(readLiveSettings(), targetSettings)) {
    return { ok: false, reason: "settings-not-settled" };
  }

  // 2. Wait for the bass analysis owner to advance its cacheKey from the
  //    pre-commit value before calling onCalculate. Calling onCalculate with a
  //    stale cacheKey queues the previous design and leaves the newly applied
  //    settings permanently stale. Applies to restore too: a stale
  //    restored-design handler must never be scheduled.
  const cacheStart = Date.now();
  while (Date.now() - cacheStart < cacheAdvanceTimeoutMs) {
    if (phaseRef?.current === "cancelled") return { ok: false, reason: "cancelled" };
    const probe = sharedRef.current;
    if (probe?.cacheKey && probe.cacheKey !== preCommitCacheKey && probe?.canCalculate === true) break;
    await sleep(cachePollMs);
  }
  if (sharedRef.current?.cacheKey === preCommitCacheKey) {
    return { ok: false, reason: "cacheKey-not-advanced" };
  }

  // 3. Capture the dispatch fingerprint AT DISPATCH — the cacheKey at the
  //    moment onCalculate is called — so a stale-scheduling bug (onCalculate
  //    called before the cacheKey advanced) is detectable: the dispatch
  //    fingerprint would equal the pre-commit key.
  const dispatchFingerprint = sharedRef.current?.cacheKey || null;

  // 4. Call onCalculate for the advanced design.
  const live = sharedRef.current;
  if (typeof live?.onCalculate !== "function") {
    return { ok: false, reason: "no-onCalculate", dispatchFingerprint };
  }
  live.onCalculate();

  // 5. Wait for publication (delegated to the injected waitForPublication).
  const published = await waitForPublication(sharedRef, phaseRef);
  if (!published) return { ok: false, reason: "publication-timeout", dispatchFingerprint };

  return {
    ok: true,
    dispatchFingerprint,
    resolvedCacheKey: sharedRef.current?.cacheKey || null,
  };
}

export default verifyRecalculationScheduling;