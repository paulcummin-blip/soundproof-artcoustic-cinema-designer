// Auth recovery never substitutes an identity or grants access.
export function authFailureStatus(error) {
  return Number(error?.response?.status || error?.status || 0);
}
export function isTransientAuthFailure(error) {
  if (error?.name === 'AbortError' || error?.code === 'ERR_CANCELED') return false;
  const status = authFailureStatus(error);
  const reason = error?.response?.data?.reason || error?.data?.reason;
  return status === 0 || [408,429,502,503,504].includes(status)
    || (status === 409 && reason === 'ACCOUNT_OPERATION_BUSY');
}
export function isUnexpectedAuthFailure(error) {
  return isTransientAuthFailure(error) || authFailureStatus(error) >= 500;
}
export async function retryAuthRequest(work, {sleep = ms => new Promise(r => setTimeout(r, ms))} = {}) {
  for (let attempt = 0; ; attempt++) {
    try { return await work(); }
    catch (error) {
      if (attempt >= 2 || !isTransientAuthFailure(error)) throw error;
      await sleep([400,1000][attempt]);
    }
  }
}
export function authCorrelationId() {
  return globalThis.crypto?.randomUUID?.() || 'auth-' + Date.now() + '-' + Math.random().toString(36).slice(2);
}
