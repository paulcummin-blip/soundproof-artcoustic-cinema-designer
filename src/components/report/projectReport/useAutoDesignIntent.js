/**
 * useAutoDesignIntent
 * -------------------
 * Runs the Astra Design Intent writer once for a newly generated Project Report,
 * with no user interaction. It is mounted by the report PAGE, so it always runs.
 *
 * A brand-new report's snapshot is saved a moment after the page opens, so it is
 * polled for (up to ~60 s). Only a snapshot generated in the last 30 min with NO
 * Design Intent yet is written; any other report is marked done and never touched,
 * now or on reopening. The outcome is remembered per project version.
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { base44 } from '@/api/base44Client';

const NEW_REPORT_WINDOW_MS = 30 * 60 * 1000;
export const INTENT_UPDATED_EVENT = 'adi-design-intent-updated';

export const AUTO_INTENT = { IDLE: 'idle', RUNNING: 'running', FAILED: 'failed', COMPLETE: 'complete' };

const inFlight = new Set();
const listeners = new Set();
const keyOf = (projectId, versionId) => `adi_auto_intent_v1:${projectId}:${versionId}`;

function readStored(key) {
  try {
    const stored = window.localStorage.getItem(key);
    // A stored 'running' with nothing in flight is an interrupted run.
    if (stored === 'running') return inFlight.has(key) ? AUTO_INTENT.RUNNING : AUTO_INTENT.FAILED;
    return stored || AUTO_INTENT.IDLE;
  } catch { return AUTO_INTENT.IDLE; }
}

function setStatus(key, status) {
  try { window.localStorage.setItem(key, status); } catch { /* memory only */ }
  listeners.forEach((listener) => listener());
}

const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };

/** Status only — used by the export button and the manual action. */
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

export default function useAutoDesignIntent({ projectId, versionId }) {
  const status = useAutoDesignIntentStatus(projectId, versionId);
  const key = keyOf(projectId, versionId);

  const run = useCallback(async () => {
    if (!projectId || !versionId || inFlight.has(key)) return;
    inFlight.add(key);
    setStatus(key, AUTO_INTENT.RUNNING);
    let outcome = AUTO_INTENT.FAILED;
    try {
      // One writing process only: the Astra Design Intent writer.
      const written = (await base44.functions.invoke('generateReportDesignIntent', {
        project_id: projectId, version_id: versionId,
      }))?.data || {};
      // A writer switched off for this login leaves the report's own text.
      if (written.ok === true || written.reason === 'writer_flag_off') outcome = AUTO_INTENT.COMPLETE;
    } catch { outcome = AUTO_INTENT.FAILED; }
    inFlight.delete(key);
    setStatus(key, outcome);
    // The text is saved before the report re-reads it.
    window.dispatchEvent(new Event(INTENT_UPDATED_EVENT));
  }, [key, projectId, versionId]);

  useEffect(() => {
    if (!projectId || !versionId || status !== AUTO_INTENT.IDLE) return undefined;
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
      const generatedAt = snapshot.generated_at ? new Date(snapshot.generated_at).getTime() : 0;
      const isNew = !snapshot.payload?.design_intent
        && generatedAt > 0 && Date.now() - generatedAt < NEW_REPORT_WINDOW_MS;
      if (isNew) run(); else setStatus(key, AUTO_INTENT.COMPLETE);
    };
    timer = setTimeout(check, 500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [projectId, versionId, status, run, key]);

  return { status, retry: run };
}