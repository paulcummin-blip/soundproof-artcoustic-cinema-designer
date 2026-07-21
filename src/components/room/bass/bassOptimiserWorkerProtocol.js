export const BASS_OPTIMISER_POOL_PROPERTY = "pool";

const envelope = (type, requestId, fingerprint, identity) => ({ type, requestId, fingerprint, identity: identity || null });

export function createProgressMessage(requestId, fingerprint, progress, identity = null) {
  return { ...envelope("progress", requestId, fingerprint, identity), progress, postedAtMs: Date.now() };
}

export function createCompleteMessage(requestId, fingerprint, pool, identity = null) {
  return { ...envelope("complete", requestId, fingerprint, identity), [BASS_OPTIMISER_POOL_PROPERTY]: pool, postedAtMs: Date.now() };
}

export function createErrorMessage(requestId, fingerprint, error, identity = null) {
  return { ...envelope("error", requestId, fingerprint, identity), error, postedAtMs: Date.now() };
}