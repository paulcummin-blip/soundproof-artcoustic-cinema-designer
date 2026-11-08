// hasCurrentBassResult.js
//
// Pure predicate: a "current" bass result must be authoritative AND its
// contract's result fingerprint must match the active calculation fingerprint.
//
// A retained contract from a different design (e.g. after a Restore that
// changed the physical layout, where the old contract is preserved for
// historical visibility) must never appear as the current result. The
// authority store deliberately retains the last contract when marked stale,
// so every "current" indicator must gate on the fingerprint as well as the
// authoritative flag.
//
// This does not create a new authority system — it is a predicate consumed by
// the existing bass results context.

/**
 * @param {object|null} completedBassAuthority - from useCompletedBassAuthority
 * @param {string|null} cacheKey - the active calculation fingerprint
 * @returns {boolean}
 */
export function hasCurrentBassResult(completedBassAuthority, cacheKey) {
  return completedBassAuthority?.authoritative === true
    && !!completedBassAuthority?.contract
    && !!cacheKey
    && completedBassAuthority?.contract?.job?.resultFingerprint === cacheKey;
}