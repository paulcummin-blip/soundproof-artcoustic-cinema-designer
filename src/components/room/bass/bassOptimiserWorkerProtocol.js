export const BASS_OPTIMISER_POOL_PROPERTY = "pool";

export function createProgressMessage(requestId, fingerprint, progress) {
  return { type: "progress", requestId, fingerprint, progress };
}

export function createCompleteMessage(requestId, fingerprint, pool) {
  return { type: "complete", requestId, fingerprint, [BASS_OPTIMISER_POOL_PROPERTY]: pool };
}

export function createErrorMessage(requestId, fingerprint, error) {
  return { type: "error", requestId, fingerprint, error };
}