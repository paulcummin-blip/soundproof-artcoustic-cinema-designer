/**
 * useAutoAdiRewrite
 * -----------------
 * Runs the EXISTING "Improve with ADI" section action once for a newly generated
 * proposal. It holds no writing rule: the server decides what may be changed.
 *
 * - Starts 2 seconds after the generated sections have loaded.
 * - Runs once per proposal: progress is saved on the proposal (metadata.adi_auto_rewrite),
 *   so refresh and reopening never start it again; a failed run shows Retry instead.
 * - Skips locked, hand-edited, approved and already-improved sections.
 * - While the run is unfinished, export is blocked with a plain reason.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';

const START_DELAY_MS = 2000;
const NEW_REPORT_WINDOW_MS = 30 * 60 * 1000;
const MARKER = 'adi_auto_rewrite';

export const AUTO_ADI_STATUS = { IDLE: 'idle', RUNNING: 'running', FAILED: 'failed', COMPLETE: 'complete' };

const isEligibleSection = (section) => Boolean(
  section
  && section.is_enabled !== false
  && !section.locked
  && section.last_gpt_generated_at
  && !section.last_user_edited_at
  && String(section.body || '').trim()
  && !section.metadata?.approval
  && !section.metadata?.adi_editorial,
);

export default function useAutoAdiRewrite({
  proposal, setProposal, sections, loading, archived, improveSection,
}) {
  const [running, setRunning] = useState(false);
  const startedFor = useRef(null);
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;

  const marker = proposal?.metadata?.[MARKER] || null;
  const createdAt = proposal?.created_date ? new Date(proposal.created_date).getTime() : 0;
  const isNewReport = !marker && createdAt > 0 && Date.now() - createdAt < NEW_REPORT_WINDOW_MS
    && ['generated', 'draft'].includes(proposal?.status);

  const saveMarker = useCallback(async (state) => {
    const metadata = { ...(proposal.metadata || {}), [MARKER]: { state, at: new Date().toISOString() } };
    await base44.entities.Proposal.update(proposal.id, { metadata });
    setProposal((prev) => (prev ? { ...prev, metadata } : prev));
    return metadata;
  }, [proposal, setProposal]);

  const run = useCallback(async () => {
    if (!proposal?.id || archived) return;
    setRunning(true);
    let failed = false;
    try {
      await saveMarker('running');
      const targets = sectionsRef.current.filter(isEligibleSection);
      for (const section of targets) {
        const data = await improveSection(section);
        if (!data || data.ok !== true) { failed = true; break; }
      }
      await saveMarker(failed ? 'failed' : 'complete');
    } catch {
      failed = true;
      await saveMarker('failed').catch(() => {});
    } finally {
      setRunning(false);
    }
  }, [archived, improveSection, proposal?.id, saveMarker]);

  useEffect(() => {
    if (loading || archived || !proposal?.id || !isNewReport || running) return undefined;
    if (!sections.length || startedFor.current === proposal.id) return undefined;
    startedFor.current = proposal.id;
    const timer = setTimeout(run, START_DELAY_MS);
    return () => { clearTimeout(timer); startedFor.current = null; };
  }, [loading, archived, proposal?.id, isNewReport, running, sections.length, run]);

  const state = marker?.state;
  let status = AUTO_ADI_STATUS.IDLE;
  if (running || state === 'running' && running) status = AUTO_ADI_STATUS.RUNNING;
  else if (state === 'failed') status = AUTO_ADI_STATUS.FAILED;
  else if (state === 'running') status = AUTO_ADI_STATUS.FAILED; // interrupted run: never export unfinished copy
  else if (state === 'complete') status = AUTO_ADI_STATUS.COMPLETE;
  else if (isNewReport && !archived) status = AUTO_ADI_STATUS.RUNNING; // pending its 2-second start

  const blockedReason = status === AUTO_ADI_STATUS.RUNNING
    ? 'ADI is preparing your report. Export is available once it finishes.'
    : status === AUTO_ADI_STATUS.FAILED
      ? 'ADI could not finish preparing your report. Retry to enable export.'
      : null;

  return { status, running, blockedReason, retry: run };
}