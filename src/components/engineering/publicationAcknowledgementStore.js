/**
 * publicationAcknowledgementStore
 * -------------------------------
 * The explicit publication acknowledgement, per project version.
 *
 * The engineering publication is written by the debounced auto-publish. A
 * debounce that is cancelled, a refused summary or a failed write used to be
 * invisible: the report gate could not tell "not yet saved" from "save failed",
 * and the only trace was a console line.
 *
 * This store records the attempt and its outcome, so the report gate can show
 * the exact reason and a report can never be generated from a save that did not
 * land. Session-first with a small localStorage mirror, so a refresh keeps an
 * honest "failed" state instead of silently reverting to "not calculated".
 */

import { useEffect, useState } from 'react';

export const PUBLICATION_ATTEMPT = Object.freeze({
  QUEUED: 'queued',
  NOT_READY: 'not_ready',
  CANCELLED: 'cancelled',
  PUBLISHING: 'publishing',
  ACKNOWLEDGED: 'acknowledged',
  FAILED: 'failed',
});

const STORAGE_KEY = 'b44_engineering_publication_ack_v1';

const attempts = new Map();
const listeners = new Map();

function keyOf(projectId, versionId) {
  if (!projectId || !versionId) return null;
  return `${projectId}::${versionId}`;
}

function persist() {
  if (typeof window === 'undefined') return;
  try {
    const snapshot = {};
    attempts.forEach((value, key) => { snapshot[key] = value; });
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // A storage failure must never break publishing; the in-memory record stands.
  }
}

function hydrate() {
  if (typeof window === 'undefined' || attempts.size > 0) return;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    const parsed = JSON.parse(stored);
    Object.entries(parsed || {}).forEach(([key, value]) => {
      if (value && typeof value === 'object') {
        // A pending request from a previous browser lifetime is not still running.
        const interrupted = ['queued', 'publishing'].includes(value.status);
        attempts.set(key, interrupted ? {
          ...value, status: PUBLICATION_ATTEMPT.CANCELLED,
          message: 'Publication interrupted by browser refresh. No durable acknowledgement was received. Publish the settled assessment again.',
        } : value);
      }
    });
  } catch {
    // Ignore unreadable storage; the store simply starts empty.
  }
}

export function recordPublicationAttempt(projectId, versionId, attempt) {
  const key = keyOf(projectId, versionId);
  if (!key) return;
  const record = {
    status: attempt?.status || PUBLICATION_ATTEMPT.FAILED,
    fingerprint: attempt?.fingerprint || null,
    publishedAt: attempt?.publishedAt || null,
    missing: Array.isArray(attempt?.missing) ? attempt.missing : [],
    message: attempt?.message || null,
    gates: Array.isArray(attempt?.gates) ? attempt.gates : [],
    httpStatus: attempt?.httpStatus || null,
    assessmentComplete: attempt?.assessmentComplete === true,
    publisherRegistered: attempt?.publisherRegistered === true,
    at: new Date().toISOString(),
  };
  attempts.set(key, record);
  persist();
  (listeners.get(key) || []).forEach((listener) => {
    try { listener(record); } catch { /* a listener error never breaks publishing */ }
  });
}

// Terminal statuses that represent a settled publication outcome.
const TERMINAL_STATUSES = new Set([
  PUBLICATION_ATTEMPT.ACKNOWLEDGED,
  PUBLICATION_ATTEMPT.FAILED,
  PUBLICATION_ATTEMPT.CANCELLED,
]);

// A more-informative terminal must not be overwritten by a less-informative
// one for the same fingerprint. ACKNOWLEDGED (success) > FAILED (reason) >
// CANCELLED (no detail). This prevents a stale cleanup CANCELLED from
// erasing a genuine FAILED that the async path recorded a moment earlier.
const TERMINAL_PRIORITY = {
  [PUBLICATION_ATTEMPT.ACKNOWLEDGED]: 3,
  [PUBLICATION_ATTEMPT.FAILED]: 2,
  [PUBLICATION_ATTEMPT.CANCELLED]: 1,
};

function isTerminalStatus(status) {
  return TERMINAL_STATUSES.has(status);
}

/**
 * Record a publication attempt only when it is not a stale record that would
 * overwrite a newer attempt for the current fingerprint.
 *
 * Rules:
 *   - A terminal record (FAILED/CANCELLED/ACKNOWLEDGED) for an OLD fingerprint
 *     must never overwrite a newer attempt (terminal or not) for the current
 *     fingerprint. This is the key guard: a cancelled async publication from
 *     a previous design cannot erase the current design's attempt.
 *   - A less-informative terminal must not overwrite a more-informative
 *     terminal for the SAME fingerprint (ACKNOWLEDGED > FAILED > CANCELLED).
 *   - Non-terminal records (QUEUED/PUBLISHING/NOT_READY) always overwrite,
 *     so the latest effect run controls the visible state.
 *
 * Used by the publication effect's async paths and cleanup so a stale
 * catch or cancelled-debounce cannot strand the UI in Saving or erase a
 * genuine success.
 */
export function recordPublicationAttemptGuarded(projectId, versionId, attempt) {
  const key = keyOf(projectId, versionId);
  if (!key) return;
  const current = attempts.get(key);
  const incomingFingerprint = attempt?.fingerprint || null;
  const incomingStatus = attempt?.status || PUBLICATION_ATTEMPT.FAILED;

  if (current) {
    // Different fingerprint: a stale terminal record must not overwrite a
    // newer attempt for the current fingerprint.
    if (current.fingerprint && current.fingerprint !== incomingFingerprint
      && isTerminalStatus(incomingStatus)) {
      return;
    }
    // Same fingerprint: a less-informative terminal must not overwrite a
    // more-informative terminal (ACKNOWLEDGED > FAILED > CANCELLED).
    if (current.fingerprint === incomingFingerprint
      && isTerminalStatus(current.status)
      && isTerminalStatus(incomingStatus)
      && (TERMINAL_PRIORITY[current.status] || 0) > (TERMINAL_PRIORITY[incomingStatus] || 0)) {
      return;
    }
  }

  recordPublicationAttempt(projectId, versionId, attempt);
}

/** Is this attempt status terminal (no further state transition expected)? */
export function isPublicationAttemptTerminal(status) {
  return isTerminalStatus(status);
}

export function readPublicationAttempt(projectId, versionId) {
  hydrate();
  const key = keyOf(projectId, versionId);
  return key ? (attempts.get(key) || null) : null;
}

export function subscribePublicationAttempt(projectId, versionId, listener) {
  const key = keyOf(projectId, versionId);
  if (!key || typeof listener !== 'function') return () => {};
  const existing = listeners.get(key) || [];
  listeners.set(key, [...existing, listener]);
  return () => {
    listeners.set(key, (listeners.get(key) || []).filter((entry) => entry !== listener));
  };
}

/** Read the current attempt for a version, live. */
export function usePublicationAttempt(projectId, versionId) {
  const [attempt, setAttempt] = useState(() => readPublicationAttempt(projectId, versionId));
  useEffect(() => {
    setAttempt(readPublicationAttempt(projectId, versionId));
    return subscribePublicationAttempt(projectId, versionId, setAttempt);
  }, [projectId, versionId]);
  return attempt;
}