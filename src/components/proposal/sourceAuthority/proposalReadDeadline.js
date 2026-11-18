// Read-only proposal checks must settle, including a shared cached request that
// never returns. Retry invalidates those shared reads; it never generates data.
export const PROPOSAL_READ_DEADLINE_MS = 20000;

export function runReadinessRead(operation, read, timeoutMs = PROPOSAL_READ_DEADLINE_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error(`Reading ${operation} did not finish within ${Math.round(timeoutMs / 1000)} seconds. Retry the document check.`);
      error.code = 'PROPOSAL_READ_TIMEOUT';
      error.operation = operation;
      reject(error);
    }, timeoutMs);
    Promise.resolve().then(read).then(value => {
      if (value?.readState === 'failed' || value?.status === 'read_failed') {
        throw new Error(value.error || 'The saved source could not be read.');
      }
      clearTimeout(timer);
      resolve(value);
    }).catch(cause => {
      clearTimeout(timer);
      const error = new Error(`Could not read ${operation}: ${cause?.message || 'Request failed.'}`);
      error.code = 'PROPOSAL_READ_FAILED';
      error.operation = operation;
      reject(error);
    });
  });
}
