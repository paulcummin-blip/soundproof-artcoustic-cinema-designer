// One version-scoped critical section for both writers of ProjectAnalysisCache.
// Web Locks also serialise same-origin browser tabs. Failures release the lock.
const chains = new Map();
export function withBassCacheWriteLock(key, work) {
  if (typeof navigator !== 'undefined' && navigator.locks?.request)
    return navigator.locks.request('sound-proof-bass-cache:' + key, work);
  const next = (chains.get(key) || Promise.resolve()).catch(() => {}).then(work);
  chains.set(key, next.catch(() => {}));
  return next;
}
