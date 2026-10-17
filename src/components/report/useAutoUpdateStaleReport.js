/**
 * useAutoUpdateStaleReport
 * ------------------------
 * The automatic refresh of a saved report the design has moved past.
 *
 * A saved report that is stale because the design changed is not a decision:
 * when the report can already be generated from the design as it stands, Sound
 * Proof prepares the updated report itself. Reporting the change and asking for
 * a press of a button would be a question with only one answer.
 *
 * The attempt is made once per (version, source fingerprint). It is never
 * retried in a loop — a failed attempt settles as FAILED and is stated on screen
 * with Retry, which is the one place a retry can start.
 *
 * Hand-off only: the caller supplies the write (its own regenerate handler), its
 * own readiness gate and the key identifying the design being updated. No
 * staleness rule, no fingerprint and no report logic lives here.
 */

import { useEffect, useRef, useState } from 'react';

/** What became of the automatic attempt for the current key. */
export const AUTO_UPDATE_STATUS = {
  /** Nothing has been attempted for this key, or no attempt applies. */
  IDLE: 'idle',
  /** The updated report is being prepared now. */
  RUNNING: 'running',
  /** The attempt produced no stored report. Retry is the way onwards. */
  FAILED: 'failed',
  /** The attempt wrote the updated report. */
  DONE: 'done',
};

export default function useAutoUpdateStaleReport({ enabled = false, key = null, regenerate = null }) {
  const [attempt, setAttempt] = useState({ key: null, status: AUTO_UPDATE_STATUS.IDLE });
  const attemptedRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => () => { mountedRef.current = false; }, []);

  useEffect(() => {
    if (!enabled || !key || typeof regenerate !== 'function') return;
    if (attemptedRef.current === key) return;
    // The gate is consumed here whatever the outcome: a stale report is never
    // written twice by Sound Proof itself, so an automatic retry loop cannot
    // form. The Retry offered on failure is the designer's own single attempt.
    attemptedRef.current = key;
    const attemptKey = key;
    setAttempt({ key: attemptKey, status: AUTO_UPDATE_STATUS.RUNNING });
    Promise.resolve(regenerate())
      .then((written) => {
        if (!mountedRef.current) return;
        setAttempt({
          key: attemptKey,
          status: written?.id ? AUTO_UPDATE_STATUS.DONE : AUTO_UPDATE_STATUS.FAILED,
        });
      })
      .catch(() => {
        if (mountedRef.current) setAttempt({ key: attemptKey, status: AUTO_UPDATE_STATUS.FAILED });
      });
    // `regenerate` is deliberately not a dependency: its identity changes with
    // the report's own state on every render, so the key — not the identity of
    // the handler — decides whether this attempt has already been made.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key]);

  // Only an attempt for the CURRENT key counts: a status left behind by another
  // version, or by the previous design, can never hold back this report's notice.
  const status = attempt.key === key ? attempt.status : AUTO_UPDATE_STATUS.IDLE;
  // While the update is Sound Proof's own work to finish, the designer is asked
  // nothing. Once it has ended — written, or failed and stated with Retry — the
  // notice belongs to the caller again.
  const automatic = enabled === true && status !== AUTO_UPDATE_STATUS.DONE;

  return { status, automatic };
}