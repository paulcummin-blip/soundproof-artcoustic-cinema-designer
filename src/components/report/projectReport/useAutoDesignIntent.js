/**
 * useAutoDesignIntent
 * -------------------
 * Runs ADI's initial rewrite of a newly generated Project Report's Design Intent,
 * once, with no user interaction. Mounted by the report PAGE, so it always runs.
 *
 * A new report already carries its first-draft Design Intent. The rewrite is the
 * same editorial pass the "Improve with ADI" button runs, applied to that draft.
 *
 * Identity and completion:
 *   - the report's generation identity is its snapshot `generated_at`; the handled
 *     outcome is remembered against it, so a regenerated report is a new identity;
 *   - the durable completion mark is the saved narrative's own `editorial` record,
 *     written atomically with the improved text. A narrative that carries it, or
 *     that has a replaced draft kept beside it, has already been rewritten and is
 *     never touched again.
 * Only a snapshot generated in the last 30 min is eligible; any other report is
 * left exactly as it is.
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { base44 } from '@/api/base44Client';

const NEW_REPORT_WINDOW_MS = 30 * 60 * 1000;
export const INTENT_UPDATED_EVENT = 'adi-design-intent-updated';

export const AUTO_INTENT = { IDLE: 'idle', RUNNING: 'running', FAILED: 'failed', COMPLETE: 'complete' };

const inFlight = new Set();
const listeners = new Set();
const keyOf = (projectId, versionId) => `adi_auto_intent_v2:${projectId}:${versionId}`;
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

/** Already rewritten: the narrative carries its editorial record or a kept prior draft. */
const alreadyRewritten = (payload) => !!(payload?.design_intent?.editorial || payload?.design_intent_previous);

export default function useAutoDesignIntent({ projectId, versionId }) {
  const status = useAutoDesignIntentStatus(projectId, versionId);
  const key = keyOf(projectId, versionId);

  const run = useCallback(async (generation) => {
    if (!projectId || !versionId || inFlight.has(key)) return;
    inFlight.add(key);
    setStatus(key, AUTO_INTENT.RUNNING, generation);
    let outcome = AUTO_INTENT.FAILED;
    try {
      let snapshot = await readSnapshot(projectId, versionId);
      // The first draft is normally saved with the report; write it only if absent.
      if (snapshot?.payload?.design_intent?.status !== 'accepted') {
        await base44.functions.invoke('generateReportDesignIntent', { project_id: projectId, version_id: versionId });
      }
      const rewritten = (await base44.functions.invoke('improveAdiWording', {
        surface: 'report_design_intent', action: 'improve', mode: 'section',
        project_id: projectId, version_id: versionId,
      }))?.data || {};
      if (rewritten.applied === true) {
        // Complete only once the improved text is read back from the saved report.
        snapshot = await readSnapshot(projectId, versionId);
        if (snapshot?.payload?.design_intent?.editorial) outcome = AUTO_INTENT.COMPLETE;
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
      // This generation was already handled (completed or failed): leave it.
      if (readGeneration(key) === generation && status !== AUTO_INTENT.IDLE) return;
      const generatedAt = snapshot.generated_at ? new Date(snapshot.generated_at).getTime() : 0;
      const isNew = generatedAt > 0 && Date.now() - generatedAt < NEW_REPORT_WINDOW_MS;
      if (isNew && !alreadyRewritten(snapshot.payload)) run(generation);
      else setStatus(key, AUTO_INTENT.COMPLETE, generation);
    };
    timer = setTimeout(check, 500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [projectId, versionId, status, run, key]);

  return { status, retry: () => readSnapshot(projectId, versionId).then((s) => run(s?.generated_at || s?.id || 'retry')) };
}