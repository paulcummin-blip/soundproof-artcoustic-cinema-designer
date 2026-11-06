/**
 * useAutoDesignIntent
 * -------------------
 * Runs ADI's generation of a Project Report's Project Summary, once,
 * automatically, with no user interaction and no separate editorial pass.
 *
 * ONE STAGE ONLY. The previous workflow generated a first draft and then ran an
 * `improveAdiWording` editorial pass on it. That second stage is removed: the
 * `generateReportDesignIntent` core (the approved writing contract, the frozen
 * report evidence, the validator) produces the finished, accepted narrative in
 * a single generation, and that narrative is the Project Summary the report
 * displays.
 *
 * Identity and completion:
 *   - the report's generation identity is its snapshot `generated_at`; the handled
 *     outcome is remembered against it, so a regenerated report is a new identity;
 *   - a saved narrative that is already accepted, and whose evidence fingerprints
 *     still match the snapshot it lives on, is reused on reopen without any
 *     provider call — no unnecessary regeneration, no loading overlay.
 *   - when the saved design or report evidence has moved past the saved narrative
 *     (evidence fingerprints differ, or no narrative exists on the current
 *     snapshot), the outdated summary is regenerated against the current snapshot.
 *
 * Duplicate-write safety: a generation in flight is held in a process-wide Set
 * and the handled outcome is recorded in localStorage keyed by the report's
 * generation identity, so a refresh, a remount or a concurrent retry cannot start
 * a second generation or write a second narrative for the same report.
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { base44 } from '@/api/base44Client';
import { WRITING_AUTHORITY_VERSION } from '@/shared/writingAuthorityVersion';

export const INTENT_UPDATED_EVENT = 'adi-design-intent-updated';

export const AUTO_INTENT = { IDLE: 'idle', RUNNING: 'running', FAILED: 'failed', COMPLETE: 'complete' };

const EVIDENCE_KEYS = ['engineeringFingerprint', 'calculationFingerprint', 'seatPriorityFingerprint'];

const inFlight = new Set();
const listeners = new Set();
const keyOf = (projectId, versionId) => `adi_auto_intent_v3:${projectId}:${versionId}`;
const genKeyOf = (key) => `${key}:generation`;

function readStored(key) {
  try {
    const stored = window.localStorage.getItem(key);
    // A stored 'running' with nothing in flight is an interrupted run.
    if (stored === 'running') return inFlight.has(key) ? AUTO_INTENT.RUNNING : AUTO_INTENT.FAILED;
    return stored || AUTO_INTENT.IDLE;
  } catch { return AUTO_INTENT.IDLE; }
}

function setStatus(key, status, generation) {
  try {
    window.localStorage.setItem(key, status);
    if (generation) window.localStorage.setItem(genKeyOf(key), generation);
  } catch { /* memory only */ }
  listeners.forEach((listener) => listener());
}

const readGeneration = (key) => {
  try { return window.localStorage.getItem(genKeyOf(key)); } catch { return null; }
};

const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };

/** Status only — used by the export button and the summary page. */
export function useAutoDesignIntentStatus(projectId, versionId) {
  const key = keyOf(projectId, versionId);
  return useSyncExternalStore(subscribe, () => (
    projectId && versionId ? readStored(key) : AUTO_INTENT.IDLE
  ));
}

async function readSnapshot(projectId, versionId) {
  const page = await base44.entities.ReportSnapshot.filter(
    { project_id: projectId, version_id: versionId, report_type: 'project' },
    { limit: 1 },
  );
  return (page?.items || [])[0] || null;
}

/**
 * Whether the saved narrative on this snapshot is accepted and its evidence
 * fingerprints still match the snapshot it lives on. A narrative whose evidence
 * has moved is not current and must be regenerated. A fingerprint either side
 * cannot state is never treated as a difference, so a narrative is never
 * regenerated for a reason the snapshot cannot state.
 */
function narrativeIsCurrent(snapshot) {
  const di = snapshot?.payload?.design_intent;
  if (!di || di.status !== 'accepted') return false;
  const savedFp = (di.evidence_fingerprints && typeof di.evidence_fingerprints === 'object')
    ? di.evidence_fingerprints : {};
  const currentFp = (snapshot.source_fingerprints && typeof snapshot.source_fingerprints === 'object')
    ? snapshot.source_fingerprints : {};
  for (const key of EVIDENCE_KEYS) {
    const a = savedFp[key];
    const b = currentFp[key];
    if (a && b && a !== b) return false;
  }
  return true;
}

export default function useAutoDesignIntent({ projectId, versionId }) {
  const status = useAutoDesignIntentStatus(projectId, versionId);
  const key = keyOf(projectId, versionId);

  const run = useCallback(async (generation) => {
    if (!projectId || !versionId || inFlight.has(key)) return;
    inFlight.add(key);
    setStatus(key, AUTO_INTENT.RUNNING, generation);
    let outcome = AUTO_INTENT.FAILED;
    try {
      const response = await base44.functions.invoke('generateReportDesignIntent', {
        project_id: projectId,
        version_id: versionId,
      });
      const data = response?.data || {};
      if (data.ok === true) {
        // Complete only once the accepted text is read back from the saved report.
        const snapshot = await readSnapshot(projectId, versionId);
        if (snapshot?.payload?.design_intent?.status === 'accepted') outcome = AUTO_INTENT.COMPLETE;
        else outcome = AUTO_INTENT.FAILED;
      } else {
        outcome = AUTO_INTENT.FAILED;
      }
    } catch { outcome = AUTO_INTENT.FAILED; }
    inFlight.delete(key);
    setStatus(key, outcome, generation);
    window.dispatchEvent(new Event(INTENT_UPDATED_EVENT));
  }, [key, projectId, versionId]);

  useEffect(() => {
    if (!projectId || !versionId || status === AUTO_INTENT.RUNNING) return undefined;
    let cancelled = false;
    let tries = 0;
    let timer;
    const check = async () => {
      if (cancelled) return;
      const snapshot = await readSnapshot(projectId, versionId).catch(() => null);
      if (cancelled) return;
      if (!snapshot) {
        tries += 1;
        if (tries < 20) timer = setTimeout(check, 3000);
        return;
      }
      const generation = snapshot.generated_at || snapshot.id;
      const handledGeneration = readGeneration(key);
      // This generation already reached a complete outcome: leave it.
      if (handledGeneration === generation && status === AUTO_INTENT.COMPLETE) return;
      if (handledGeneration === generation && status === AUTO_INTENT.FAILED) {
        // A refresh during generation reads as FAILED, but the provider may have
        // completed the write after the client gave up. If the accepted narrative
        // is now on the snapshot, transition to COMPLETE; otherwise keep the
        // failed outcome without re-running, so a failure never becomes an
        // automatic retry loop.
        if (narrativeIsCurrent(snapshot)) setStatus(key, AUTO_INTENT.COMPLETE, generation);
        return;
      }
      if (narrativeIsCurrent(snapshot)) setStatus(key, AUTO_INTENT.COMPLETE, generation);
      else run(generation);
    };
    timer = setTimeout(check, 500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [projectId, versionId, status, run, key]);

  return { status, retry: () => readSnapshot(projectId, versionId).then((s) => run(s?.generated_at || s?.id || 'retry')) };
}