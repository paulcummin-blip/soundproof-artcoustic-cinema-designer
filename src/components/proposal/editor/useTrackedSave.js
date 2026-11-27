/**
 * useTrackedSave
 * -------------
 * A small hook that tracks one discrete save with the editor's shared
 * SAVE_STATUS vocabulary, preserves the caller's intended local state on
 * failure (it never reverts anything itself), and exposes a Retry that re-runs
 * the last write.
 *
 * Reuses the existing save-status mechanism rather than introducing a second
 * proposal persistence framework. Used by the client brief panel, the dealer
 * notes panel, and the discrete field saves (lock, visibility) that surface
 * their failure through a toast with a Retry action.
 */
import { useCallback, useRef, useState } from 'react';
import { SAVE_STATUS } from './proposalSaveStatus';

export function useTrackedSave() {
  const [status, setStatus] = useState(SAVE_STATUS.IDLE);
  const lastRunRef = useRef(null);

  const run = useCallback(async (fn) => {
    if (typeof fn !== 'function') return { ok: false };
    lastRunRef.current = fn;
    setStatus(SAVE_STATUS.SAVING);
    try {
      await fn();
      setStatus(SAVE_STATUS.SAVED);
      return { ok: true };
    } catch (err) {
      console.error('Save failed:', err);
      setStatus(SAVE_STATUS.FAILED);
      return { ok: false, error: err };
    }
  }, []);

  const retry = useCallback(() => {
    if (lastRunRef.current) return run(lastRunRef.current);
    return Promise.resolve({ ok: false });
  }, [run]);

  const reset = useCallback(() => {
    setStatus(SAVE_STATUS.IDLE);
    lastRunRef.current = null;
  }, []);

  return { status, run, retry, reset, SAVE_STATUS };
}

export default useTrackedSave;