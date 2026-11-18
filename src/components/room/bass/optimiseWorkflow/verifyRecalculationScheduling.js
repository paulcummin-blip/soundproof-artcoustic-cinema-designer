/**
 * verifyRecalculationScheduling.js
 * --------------------------------
 * Production identity/settings-wait-and-publication scheduling helper used by
 * performElectronicUpdate.verify. Extracted so the scheduling logic — settings
 * settle wait, cacheKey advancement wait, authoritative-settings confirmation,
 * onCalculate dispatch, publication wait, pinned-fingerprint verification — is
 * testable without mounting the full React component or re-implementing the
 * physics/verification match logic.
 *
 * PER-COMMIT preCommitCacheKey: the caller captures the cacheKey immediately
 * before EACH commit (apply commit and restore commit) and passes that key to
 * the corresponding verify. A single key captured once before the whole
 * transaction is the BASELINE; using it for the restore verify would wait for
 * baseline !== baseline forever, or dispatch on the still-applied candidate
 * key before the rollback settles. Each verify waits for the bass owner to
 * advance its cacheKey past the key that was current immediately before THIS
 * commit.
 *
 * IDENTITY GUARD: an injected identityGuard() is called EVERY wait poll. It
 * checks io.current() and the project/version still match, so a project
 * switch, version switch or closed persistence session aborts the wait
 * promptly instead of accepting a result for a different design.
 *
 * AUTHORITATIVE SETTINGS: an injected authoritativeSettingsMatch() — built by
 * the caller from receipt.expectedEffectiveTuning / beforeEffectiveTuning and
 * the target crossover — must return true BEFORE dispatch. This requires the
 * authoritative bass context to have ingested the committed tuning, so an
 * arbitrary geometry/cache advance cannot masquerade as the requested
 * electronic change. The helper never duplicates recommendationSettingsMatch;
 * the caller supplies the real one.
 *
 * NO-OP: when the caller declares the commit a no-op (before === after), the
 * helper confirms the EXISTING published result is current for the current
 * cacheKey (using the ESTABLISHED authority validation — structural
 * completeness + AUTHORITATIVE status + matching job fingerprints — plus
 * no active calculation, authoritative-settings match, and settings still
 * equal to the target; matching job keys alone are insufficient) and returns
 * without dispatching or waiting for advancement. When the existing
 * publication is stale or missing, the no-op BYPASSES the cache-advancement
 * requirement and DISPATCHES on the current unchanged key (the design did not
 * change, so the cacheKey will not advance) rather than timing out with
 * cacheKey-not-advanced. A no-op must never wait for a cacheKey that will not
 * advance.
 *
 * SETTINGS RECHECK: settingsEqual(readLiveSettings(), targetSettings) is
 * rechecked EVERY poll during the cache-advancement wait AND after the
 * publication wait. A user edit back to receipt.before passes the caller's
 * outer before||after commit guard (it equals before) while the cacheKey may
 * lag, so without this recheck the helper would dispatch on a stale advanced
 * key for a design whose live settings no longer match the target.
 *
 * DISPATCH FINGERPRINT: captured AT DISPATCH (the cacheKey at the moment
 * onCalculate is called). After publication, the result fingerprint, the
 * currentJob fingerprint AND the live cacheKey must ALL equal the dispatch
 * fingerprint; a result that belongs to a different design is rejected. A
 * stale-scheduling bug (onCalculate called before the cacheKey advanced) is
 * detectable: the dispatch fingerprint would equal the pre-commit key.
 *
 * EXPLICIT FAILURES: canCalculate false, a null cacheKey, a blocked dispatch,
 * an authoritative-settings mismatch and a publication fingerprint mismatch
 * each return a distinct structured reason — the helper never falls through
 * to dispatch after a timeout without classifying. The publication wait is
 * delegated to an injected waitForPublication; a throw from it is converted to
 * a structured failure (identity-changed-during-publication vs
 * publication-failed), never re-thrown.
 */
import { settingsEqual } from "./electronicApplication.js";
import { isStructurallyCompleteBassContract as contractStructurallyComplete } from "@/components/room/bass/completedBassResultPersistence";

/**
 * @param {Object} args
 * @param {Object} args.sharedRef            Ref to the latest shared bass context.
 * @param {Object} args.phaseRef             Ref used for cancel detection.
 * @param {Function} args.readLiveSettings   () => { instances, crossover } — live settings.
 * @param {Object} args.targetSettings       Committed settings to settle to.
 * @param {string} args.preCommitCacheKey    cacheKey captured immediately before THIS commit.
 * @param {Function} [args.identityGuard]    () => boolean — io.current + project/version guard.
 * @param {Function} [args.authoritativeSettingsMatch] () => boolean — real recommendationSettingsMatch
 *   against shared.authoritative for the target tuning; required before dispatch.
 * @param {boolean} [args.noOp=false]        True when the commit changes nothing (before === after).
 * @param {Function} args.waitForPublication async (sharedRef, phaseRef) => boolean | throws.
 * @param {Function} [args.sleep]            Injectable sleep for tests.
 * @param {number} [args.settleTimeoutMs]
 * @param {number} [args.cacheAdvanceTimeoutMs]
 * @param {number} [args.settlePollMs]
 * @param {number} [args.cachePollMs]
 *
 * @returns {Promise<{ok: boolean, reason?: string, dispatchFingerprint?: string|null, resolvedCacheKey?: string|null, noOp?: boolean, resultFingerprint?: string|null, currentJobFingerprint?: string|null, currentCacheKey?: string|null, error?: string}>}
 */
export async function verifyRecalculationScheduling({
  sharedRef,
  phaseRef,
  readLiveSettings,
  targetSettings,
  preCommitCacheKey,
  identityGuard,
  authoritativeSettingsMatch,
  noOp = false,
  waitForPublication,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  settleTimeoutMs = 15000,
  cacheAdvanceTimeoutMs = 15000,
  settlePollMs = 50,
  cachePollMs = 100,
}) {
  const cancelled = () => phaseRef?.current === "cancelled";
  const identityOk = () => typeof identityGuard !== "function" || identityGuard();
  const authOk = () => typeof authoritativeSettingsMatch !== "function" || authoritativeSettingsMatch();

  // 1. Wait for the live settings to settle to the committed target. The
  //    identity guard runs every poll so a project/version change or a closed
  //    persistence session aborts the settle wait promptly.
  const settleStart = Date.now();
  while (Date.now() - settleStart < settleTimeoutMs) {
    if (cancelled()) return { ok: false, reason: "cancelled" };
    if (!identityOk()) return { ok: false, reason: "identity-changed" };
    if (settingsEqual(readLiveSettings(), targetSettings)) break;
    await sleep(settlePollMs);
  }
  if (cancelled()) return { ok: false, reason: "cancelled" };
  if (!identityOk()) return { ok: false, reason: "identity-changed" };
  if (!settingsEqual(readLiveSettings(), targetSettings)) {
    return { ok: false, reason: "settings-not-settled" };
  }

  // 2. No-op commit (before === after): the design did not change, so the
  //    cacheKey will not advance. Confirm the EXISTING published result is
  //    current for the current cacheKey using the ESTABLISHED authority
  //    validation (structural completeness + AUTHORITATIVE status + matching
  //    job fingerprints) PLUS no active calculation, authoritative-settings
  //    match, and settings still equal to the target. Matching job keys alone
  //    are insufficient. If the existing publication is reusable, return
  //    without dispatching. If it is stale or missing, BYPASS the
  //    cache-advancement requirement and DISPATCH on the current unchanged
  //    key (the design did not change, so the cacheKey will not advance)
  //    rather than timing out with cacheKey-not-advanced.
  let noOpDispatch = false;
  let noOpDispatchKey = null;
  if (noOp) {
    const cur = sharedRef.current?.cacheKey || null;
    if (!cur) return { ok: false, reason: "no-cache-key" };
    const authority = sharedRef.current?.completedBassAuthority || null;
    const job = authority?.contract?.job || {};
    const noActiveCalc = sharedRef.current?.calculationInProgress !== true;
    const settingsStillTarget = settingsEqual(readLiveSettings(), targetSettings);
    if (noActiveCalc && authOk() && settingsStillTarget
        && authority?.authorityStatus === "AUTHORITATIVE"
        && contractStructurallyComplete(authority?.contract)
        && job.resultFingerprint === cur && job.currentJobFingerprint === cur) {
      return { ok: true, dispatchFingerprint: cur, resolvedCacheKey: cur, noOp: true };
    }
    // Existing publication is stale/missing for the no-op key: dispatch on the
    // current unchanged key, bypassing the cache-advancement requirement.
    noOpDispatch = true;
    noOpDispatchKey = cur;
  }

  // 3. Wait for the bass owner to advance its cacheKey past the per-commit
  //    pre-commit value, with canCalculate true AND the authoritative settings
  //    ingested (real recommendationSettingsMatch). Calling onCalculate with a
  //    stale cacheKey queues the previous design; dispatching before the
  //    authoritative tuning settled would let a geometry/cache advance
  //    masquerade as the requested electronic change. A no-op dispatch skips
  //    this wait (the cacheKey will not advance) and dispatches on the current
  //    unchanged key. settingsEqual is rechecked EVERY poll: a user edit back
  //    to receipt.before passes the caller's outer before||after commit guard
  //    while the cacheKey may lag, so without this recheck the helper would
  //    dispatch on a stale advanced key for a design whose live settings no
  //    longer match the target.
  let advancedKey = null;
  if (noOpDispatch) {
    // Bypass the advancement wait. Still require canCalculate, authOk and
    // settings still target before dispatching on the unchanged key.
    const noopStart = Date.now();
    while (Date.now() - noopStart < cacheAdvanceTimeoutMs) {
      if (cancelled()) return { ok: false, reason: "cancelled" };
      if (!identityOk()) return { ok: false, reason: "identity-changed" };
      if (!settingsEqual(readLiveSettings(), targetSettings)) return { ok: false, reason: "settings-reverted" };
      const probe = sharedRef.current;
      if (probe?.canCalculate === true && authOk()) break;
      await sleep(cachePollMs);
    }
    if (cancelled()) return { ok: false, reason: "cancelled" };
    if (!identityOk()) return { ok: false, reason: "identity-changed" };
    const probe = sharedRef.current;
    advancedKey = noOpDispatchKey;
    if (probe?.canCalculate !== true) return { ok: false, reason: "cannot-calculate" };
    if (!authOk()) return { ok: false, reason: "authoritative-settings-mismatch" };
    if (!settingsEqual(readLiveSettings(), targetSettings)) return { ok: false, reason: "settings-reverted" };
  } else {
    const cacheStart = Date.now();
    while (Date.now() - cacheStart < cacheAdvanceTimeoutMs) {
      if (cancelled()) return { ok: false, reason: "cancelled" };
      if (!identityOk()) return { ok: false, reason: "identity-changed" };
      if (!settingsEqual(readLiveSettings(), targetSettings)) return { ok: false, reason: "settings-reverted" };
      const probe = sharedRef.current;
      const key = probe?.cacheKey || null;
      if (key && key !== preCommitCacheKey && probe?.canCalculate === true && authOk()) break;
      await sleep(cachePollMs);
    }
    if (cancelled()) return { ok: false, reason: "cancelled" };
    if (!identityOk()) return { ok: false, reason: "identity-changed" };

    // Explicit failure classification — never fall through to dispatch after a
    // timeout without a precise reason. Each condition is checked in order.
    const probe = sharedRef.current;
    advancedKey = probe?.cacheKey || null;
    if (!advancedKey) return { ok: false, reason: "no-cache-key" };
    if (advancedKey === preCommitCacheKey) return { ok: false, reason: "cacheKey-not-advanced" };
    if (probe?.canCalculate !== true) return { ok: false, reason: "cannot-calculate" };
    if (!authOk()) return { ok: false, reason: "authoritative-settings-mismatch" };
    if (!settingsEqual(readLiveSettings(), targetSettings)) return { ok: false, reason: "settings-reverted" };
  }

  // 4. Capture the dispatch fingerprint AT DISPATCH — the cacheKey at the
  //    moment onCalculate is called — so a stale-scheduling bug (onCalculate
  //    called before the cacheKey advanced) is detectable: the dispatch
  //    fingerprint would equal the pre-commit key.
  const dispatchFingerprint = advancedKey;

  // 5. Dispatch onCalculate. A blocked dispatch, a missing onCalculate, a
  //    dispatch error or a dispatch fingerprint that disagrees with the pinned
  //    cacheKey is an explicit structured failure.
  const live = sharedRef.current;
  if (typeof live?.onCalculate !== "function") {
    return { ok: false, reason: "no-onCalculate", dispatchFingerprint };
  }
  let dispatch = null;
  try {
    dispatch = live.onCalculate();
  } catch (e) {
    return { ok: false, reason: "dispatch-error", dispatchFingerprint, error: e?.message };
  }
  if (dispatch && dispatch.action === "blocked") {
    return { ok: false, reason: "dispatch-blocked", dispatchFingerprint };
  }
  if (dispatch && dispatch.fingerprint && dispatch.fingerprint !== dispatchFingerprint) {
    return { ok: false, reason: "dispatch-fingerprint-mismatch", dispatchFingerprint, actualFingerprint: dispatch.fingerprint };
  }

  // 6. Publication wait. A throw from the injected waitForPublication is
  //    converted to a structured failure: if the identity changed during the
  //    wait, report that (do not attribute a different design's terminal
  //    failure to this verify); otherwise report publication-failed with the
  //    terminal message.
  let published;
  try {
    published = await waitForPublication(sharedRef, phaseRef);
  } catch (e) {
    if (!identityOk()) return { ok: false, reason: "identity-changed-during-publication", dispatchFingerprint, error: e?.message };
    return { ok: false, reason: "publication-failed", dispatchFingerprint, error: e?.message };
  }
  if (cancelled()) return { ok: false, reason: "cancelled", dispatchFingerprint };
  if (!published) return { ok: false, reason: "publication-timeout", dispatchFingerprint };
  if (!identityOk()) return { ok: false, reason: "identity-changed-during-publication", dispatchFingerprint };
  // Recheck settings AFTER publication: a user edit back to receipt.before
  // during the publication wait passes the caller's outer before||after commit
  // guard while the key may lag, so a result published for the target must not
  // be accepted once the live settings no longer match the target.
  if (!settingsEqual(readLiveSettings(), targetSettings)) {
    return { ok: false, reason: "settings-reverted", dispatchFingerprint };
  }

  // 7. Pin the dispatch fingerprint: the published result fingerprint, the
  //    currentJob fingerprint AND the live cacheKey must ALL equal the
  //    dispatch fingerprint. A result that belongs to a different design —
  //    including a mutable-newdesign that landed during the wait — is rejected.
  const job = sharedRef.current?.completedBassAuthority?.contract?.job || {};
  const resultFingerprint = job.resultFingerprint || null;
  const currentJobFingerprint = job.currentJobFingerprint || null;
  const currentCacheKey = sharedRef.current?.cacheKey || null;
  if (resultFingerprint !== dispatchFingerprint
      || currentJobFingerprint !== dispatchFingerprint
      || currentCacheKey !== dispatchFingerprint) {
    return {
      ok: false,
      reason: "publication-fingerprint-mismatch",
      dispatchFingerprint,
      resultFingerprint,
      currentJobFingerprint,
      currentCacheKey,
    };
  }

  return { ok: true, dispatchFingerprint, resolvedCacheKey: currentCacheKey };
}

export default verifyRecalculationScheduling;