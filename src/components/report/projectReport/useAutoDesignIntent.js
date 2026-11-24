import {reportClientFailure} from '@/components/systemHealth/clientExperienceMonitor';
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
import { useCallback, useEffect, useSyncExternalStore, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { createIntentStorage } from './autoDesignIntentStorage';

export const INTENT_UPDATED_EVENT = 'adi-design-intent-updated';

export const AUTO_INTENT = { IDLE: 'idle', RUNNING: 'running', FAILED: 'failed', COMPLETE: 'complete' };

import {narrativeIsCurrent} from './reportNarrativeCurrent';

const storage = createIntentStorage(() => window.localStorage);
const inFlight = new Set();
const reviewing = new Set();
const listeners = new Set();
const keyOf = (projectId, versionId) => `adi_auto_intent_v3:${projectId}:${versionId}`;
const genKeyOf = (key) => `${key}:generation`;
const reasonKeyOf = (key) => `${key}:reason`;

function readStored(key) {
  try {
    const stored = storage.get(key);
    // A stored 'running' with nothing in flight is an interrupted run.
    if (stored === 'running') return inFlight.has(key) ? AUTO_INTENT.RUNNING : AUTO_INTENT.FAILED;
    return stored || AUTO_INTENT.IDLE;
  } catch { return AUTO_INTENT.IDLE; }
}

function setStatus(key, status, generation, reason = null) {
  try {
    storage.set(key, status);
    if (generation) storage.set(genKeyOf(key), generation);
    // Preserve the backend's own refusal reason alongside a FAILED outcome, so
    // the UI can state WHY the writer refused (writer_flag_off,
    // validation_failed, provider_failed, …) instead of a generic FAILED
    // state. Cleared on any non-FAILED outcome so a later success never shows a
    // stale refusal.
    if (status === AUTO_INTENT.FAILED) {
      storage.set(reasonKeyOf(key), typeof reason === 'string' && reason.length > 0 ? reason : '');
    } else {
      storage.set(reasonKeyOf(key), null);
    }
  } catch { /* memory only */ }
  listeners.forEach((listener) => listener());
}

const readGeneration = (key) => {
  try { return storage.get(genKeyOf(key)); } catch { return null; }
};

const readReason = (key) => {
  try { const value = storage.get(reasonKeyOf(key)); return typeof value === 'string' && value.length > 0 ? value : null; } catch { return null; }
};

const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };

/** Status only — used by the export button and the summary page. */
export function useAutoDesignIntentStatus(projectId, versionId) {
  const key = keyOf(projectId, versionId);
  return useSyncExternalStore(subscribe, () => (
    projectId && versionId ? readStored(key) : AUTO_INTENT.IDLE
  ));
}

/** The backend's own refusal reason when the status is FAILED, else null. */
export function useAutoDesignIntentReason(projectId, versionId) {
  const key = keyOf(projectId, versionId);
  return useSyncExternalStore(subscribe, () => (
    projectId && versionId ? readReason(key) : null
  ));
}

async function readSnapshot(projectId, versionId) {
  const page = await base44.entities.ReportSnapshot.filter(
    { project_id: projectId, version_id: versionId, report_type: 'project' },
    { limit: 1 },
  );
  return (Array.isArray(page)?page:page?.items || [])[0] || null;
}

/**
 * Whether the saved narrative on this snapshot is accepted and its evidence
 * fingerprints still match the snapshot it lives on. A narrative whose evidence
 * has moved is not current and must be regenerated. A fingerprint either side
 * cannot state is never treated as a difference, so a narrative is never
 * regenerated for a reason the snapshot cannot state.
 */

import { shouldAutoGenerateDesignIntent } from './autoDesignIntentGate';

export default function useAutoDesignIntent({ projectId, versionId, enabled = false, onBeforeGenerate = null, forceRegenerate = false, skipQuestionIds = [] } = {}) {
  const [verifiedKey,setVerifiedKey]=useState(null);
  const status = useAutoDesignIntentStatus(projectId, versionId);
  const reason = useAutoDesignIntentReason(projectId, versionId);
  const key = keyOf(projectId, versionId);
  useEffect(()=>{
    if(status===AUTO_INTENT.FAILED && projectId && versionId)reportClientFailure({code:'REPORT_NARRATIVE_FAILED',operation:'report-design-summary',projectId,versionId,detail:reason || 'Saved report summary is incomplete.'});
  },[status,reason,projectId,versionId]);

  const run = useCallback(async (generation) => {
    if (!projectId || !versionId || inFlight.has(key) || reviewing.has(key)) return;
    let confirmedContextRevision = null;
    // The pre-generation context review step. If a callback is supplied, it
    // runs before the writer is called. The designer may answer, skip, or
    // cancel. If the callback returns false, the generation is skipped.
    // The callback may return { skippedQuestionIds: [...] } to carry
    // temporary skip exclusions to the generation function.
    let effectiveSkipIds = Array.isArray(skipQuestionIds) ? [...skipQuestionIds] : [];
    if (typeof onBeforeGenerate === 'function') {
      reviewing.add(key);
      try {
        const proceed = await onBeforeGenerate();
        if (proceed === false) return;
        confirmedContextRevision = proceed?.contextRevision || null;
        if (proceed && typeof proceed === 'object' && Array.isArray(proceed.skippedQuestionIds)) {
          effectiveSkipIds = proceed.skippedQuestionIds;
        }
      } catch (error) {
        setStatus(key, AUTO_INTENT.FAILED, generation, 'Your design answers could not be verified. Retry saving before generating.');
        return;
      } finally { reviewing.delete(key); }
    }
    setVerifiedKey(null);
    inFlight.add(key);
    setStatus(key, AUTO_INTENT.RUNNING, generation);
    let outcome = AUTO_INTENT.FAILED;
    let refusalReason = null;
    try {
      const response = await base44.functions.invoke('generateReportDesignIntent', {
        project_id: projectId,
        version_id: versionId,
        context_revision: confirmedContextRevision,
        ...(effectiveSkipIds.length > 0 ? { skip_question_ids: effectiveSkipIds } : {}),
      });
      const data = response?.data || {};
      if (data.ok === true) {
        // Complete only once the accepted text is read back from the saved report.
        const snapshot = await readSnapshot(projectId, versionId);
        if (narrativeIsCurrent(snapshot)) { outcome = AUTO_INTENT.COMPLETE; setVerifiedKey(key); }
        else { outcome = AUTO_INTENT.FAILED; refusalReason = 'The project summary was generated but could not be read back from the saved report. Retry to recover it.'; }
      } else {
        outcome = AUTO_INTENT.FAILED;
        // Preserve the backend's own refusal reason (writer_flag_off,
        // validation_failed, provider_failed, …) instead of collapsing every
        // refusal into a generic FAILED state.
        refusalReason = [data.reason, data.detail || data.error].filter(Boolean).join(': ') || null;
      }
    } catch (err) { outcome = AUTO_INTENT.FAILED; refusalReason = err?.message || null; }
    inFlight.delete(key);
    setStatus(key, outcome, generation, refusalReason);
    if(outcome===AUTO_INTENT.FAILED)reportClientFailure({code:'REPORT_NARRATIVE_FAILED',operation:'report-design-summary',projectId,versionId,detail:refusalReason || 'Report writer did not return an accepted saved summary.'});
    window.dispatchEvent(new Event(INTENT_UPDATED_EVENT));
  }, [key, projectId, versionId, onBeforeGenerate, skipQuestionIds]);

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
        else setStatus(key, AUTO_INTENT.FAILED, null, 'The saved report could not be loaded. Retry to read it again.');
        return;
      }
      const generation = snapshot.generated_at || snapshot.id;
      setVerifiedKey(narrativeIsCurrent(snapshot) ? key : null);
      const handledGeneration = readGeneration(key);
      // This generation already reached a complete outcome: leave it.
      if (handledGeneration === generation && status === AUTO_INTENT.COMPLETE && narrativeIsCurrent(snapshot)) return;
      if (handledGeneration === generation && status === AUTO_INTENT.FAILED) {
        // A refresh during generation reads as FAILED, but the provider may have
        // completed the write after the client gave up. If the accepted narrative
        // is now on the snapshot, transition to COMPLETE; otherwise keep the
        // failed outcome without re-running, so a failure never becomes an
        // automatic retry loop.
        if (narrativeIsCurrent(snapshot)) setStatus(key, AUTO_INTENT.COMPLETE, generation);
        return;
      }
      if (narrativeIsCurrent(snapshot) && !forceRegenerate) {
        setStatus(key, AUTO_INTENT.COMPLETE, generation);
      } else if (shouldAutoGenerateDesignIntent({ enabled, narrativeCurrent: false, snapshotExists: true })) {
        run(generation);
      } else {
        // Viewing must not silently regenerate a saved report. An incomplete
        // snapshot needs an explicit, recoverable action instead of a loader.
        setStatus(key, AUTO_INTENT.FAILED, generation,
          'The saved report is missing a completed project summary. Retry to finish the report using its saved evidence.');
      }
    };
    timer = setTimeout(check, 500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [projectId, versionId, status, run, key, enabled, forceRegenerate]);

  const retry = async () => {
    try {
      const snapshot = await readSnapshot(projectId, versionId);
      if (!snapshot) {
        setStatus(key, AUTO_INTENT.FAILED, null, 'The saved report could not be loaded. Return to the project and create the report again.');
        return;
      }
      const generation = snapshot.generated_at || snapshot.id;
      setVerifiedKey(narrativeIsCurrent(snapshot) ? key : null);
      if (narrativeIsCurrent(snapshot) && !forceRegenerate) {
        setStatus(key, AUTO_INTENT.COMPLETE, generation);
        window.dispatchEvent(new Event(INTENT_UPDATED_EVENT));
        return;
      }
      await run(generation);
    } catch (err) {
      setStatus(key, AUTO_INTENT.FAILED, null, err?.message || 'The saved report could not be loaded. Retry to read it again.');
    }
  };
  return { status, reason, retry, verifiedCurrent: verifiedKey===key && status===AUTO_INTENT.COMPLETE };
}