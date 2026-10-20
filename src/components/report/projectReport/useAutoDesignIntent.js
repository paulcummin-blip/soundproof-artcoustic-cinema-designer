/**
 * useAutoDesignIntent
 * -------------------
 * Runs the EXISTING Design Intent write and the EXISTING "Improve with ADI" rewrite
 * once for a newly generated Project Report, with no user interaction. No writing
 * rule lives here: both backend actions decide what may change.
 *
 * Once per report: the outcome is remembered per project version, so refresh and
 * reopening never start it again. A failed or interrupted run reports 'failed' and
 * offers Retry. Only a report whose saved snapshot is new (< 30 min) and has no
 * Design Intent yet is started automatically. Export reads the same status through
 * useAutoDesignIntentStatus and stays disabled until it is complete.
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { base44 } from '@/api/base44Client';

const START_DELAY_MS = 2000;
const NEW_REPORT_WINDOW_MS = 30 * 60 * 1000;

export const AUTO_INTENT = { IDLE: 'idle', RUNNING: 'running', FAILED: 'failed', COMPLETE: 'complete' };

const live = new Map();
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
  live.set(key, status);
  try { window.localStorage.setItem(key, status); } catch { /* memory only */ }
  listeners.forEach((listener) => listener());
}

const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };

/** Status only — used by the export button. */
export function useAutoDesignIntentStatus(projectId, versionId) {
  const key = keyOf(projectId, versionId);
  return useSyncExternalStore(subscribe, () => (
    projectId && versionId ? (live.get(key) === AUTO_INTENT.RUNNING ? AUTO_INTENT.RUNNING : readStored(key)) : AUTO_INTENT.IDLE
  ));
}

async function readSnapshot(projectId, versionId) {
  const page = await base44.entities.ReportSnapshot.filter(
    { project_id: projectId, version_id: versionId, report_type: 'project' },
    { limit: 1 },
  );
  return (page?.items || [])[0] || null;
}

export default function useAutoDesignIntent({ projectId, versionId, onDone }) {
  const status = useAutoDesignIntentStatus(projectId, versionId);
  const key = keyOf(projectId, versionId);

  const run = useCallback(async () => {
    if (!projectId || !versionId || inFlight.has(key)) return;
    inFlight.add(key);
    setStatus(key, AUTO_INTENT.RUNNING);
    let outcome = AUTO_INTENT.FAILED;
    try {
      const snapshot = await readSnapshot(projectId, versionId);
      let proceed = true;
      if (!snapshot?.payload?.design_intent) {
        const written = (await base44.functions.invoke('generateReportDesignIntent', {
          project_id: projectId, version_id: versionId,
        }))?.data || {};
        if (written.ok !== true) {
          // A writer that is switched off for this login leaves the report's own text.
          proceed = false;
          if (written.reason === 'writer_flag_off') outcome = AUTO_INTENT.COMPLETE;
        }
      }
      if (proceed) {
        const improved = (await base44.functions.invoke('improveAdiWording', {
          surface: 'report_design_intent', action: 'improve', mode: 'section',
          project_id: projectId, version_id: versionId,
        }))?.data || {};
        if (improved.ok === true) outcome = AUTO_INTENT.COMPLETE;
      }
    } catch { outcome = AUTO_INTENT.FAILED; }
    inFlight.delete(key);
    setStatus(key, outcome);
    if (onDone) await onDone();
  }, [key, onDone, projectId, versionId]);

  useEffect(() => {
    if (!projectId || !versionId || status !== AUTO_INTENT.IDLE) return undefined;
    const timer = setTimeout(async () => {
      const snapshot = await readSnapshot(projectId, versionId).catch(() => null);
      const generatedAt = snapshot?.generated_at ? new Date(snapshot.generated_at).getTime() : 0;
      const isNew = snapshot && !snapshot.payload?.design_intent
        && generatedAt > 0 && Date.now() - generatedAt < NEW_REPORT_WINDOW_MS;
      if (isNew) run();
    }, START_DELAY_MS);
    return () => clearTimeout(timer);
  }, [projectId, versionId, status, run]);

  return { status, retry: run };
}