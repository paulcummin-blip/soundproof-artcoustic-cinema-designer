import React, { useEffect, useState } from 'react';
import { useOptionalSharedBassResults } from '@/components/room/bass/bassResultsStore';
import { fetchDurablePublication } from './versionedEngineeringAuthority';
import { auditDurablePublication } from './publicationGateAuthority';
import EngineeringPublicationDiagnostics from './EngineeringPublicationDiagnostics';
import { useEngineeringMode } from '@/components/state/useEngineeringMode';
import { useAuth } from '@/lib/AuthContext';
import { isMasterAdmin } from '@/lib/accountAccess';

// Dealer-facing status wording. Internal gate labels and field names stay inside
// the diagnostics disclosure — never in the normal workflow.
const TONES = {
  published: { dot: '#2F7D4F', label: 'Published' },
  publishing: { dot: '#B7791F', label: 'Publishing…' },
  failed: { dot: '#B3261E', label: 'Failed' },
  'not-ready': { dot: '#B7791F', label: 'Not ready' },
  'not-saved': { dot: '#B7791F', label: 'Not saved' },
};

export default function EngineeringPublicationStatus({ publication, projectId, versionId }) {
  const bass = useOptionalSharedBassResults();
  const { user } = useAuth();
  const { engineeringMode } = useEngineeringMode();
  const [durable, setDurable] = useState(null);
  useEffect(() => {
    let cancelled = false;
    setDurable(null);
    fetchDurablePublication(projectId, versionId, { force: true }).then(value => {
      if (!cancelled) setDurable(value);
    });
    return () => { cancelled = true; };
  }, [projectId, versionId, publication.attempt?.status, publication.attempt?.fingerprint]);
  const { preflight, attempt, fingerprint, publish } = publication;
  const saved = auditDurablePublication({ durable }).allowed
    && durable?.version?.published_fingerprint === fingerprint;
  const matchingAttempt = attempt?.fingerprint === fingerprint ? attempt : null;

  const state = saved ? 'published'
    : matchingAttempt?.status === 'publishing' ? 'publishing'
    : matchingAttempt?.status === 'failed' ? 'failed'
    : matchingAttempt?.status === 'queued' ? 'publishing'
    : !preflight.ready ? 'not-ready'
    : matchingAttempt?.status === 'cancelled' ? 'not-ready'
    : 'not-saved';

  const action = state === 'published' ? null
    : state === 'publishing' ? null
    : state === 'failed' ? 'Engineering assessment has not been saved.'
    : state === 'not-saved' ? 'Reports are blocked until the engineering assessment is published.'
    : preflight.p19Blocks ? 'Complete P19 verification before reports can be generated.'
    : 'Reports are blocked until the engineering assessment is published.';

  const tone = TONES[state];
  const showDiagnostics = isMasterAdmin(user) || engineeringMode === true;

  return (
    <section className="rounded-lg border border-[#DCDBD6] bg-white px-3 py-2 mb-3" aria-label="Engineering publication">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: tone.dot }} aria-hidden="true" />
          <span className="font-semibold" style={{ color: '#213428' }}>Engineering assessment:</span>
          <span role="status">{tone.label}</span>
        </span>
        {action && <span style={{ color: '#625143' }}>{action}</span>}
        {state !== 'published' && state !== 'publishing' && (preflight.ready
          ? <button type="button" className="border rounded px-3 py-1" onClick={publish}>Publish Assessment</button>
          : <button type="button" className="border rounded px-3 py-1" disabled={!bass?.canCalculate || bass?.calculationInProgress}
              onClick={() => bass?.onCalculate?.({ collectDiagnostics: true })}>Verify Bass / Complete P19</button>)}
      </div>
      {state !== 'published' && !preflight.ready && !bass?.canCalculate && (
        <p className="mt-1 text-xs" style={{ color: '#625143' }}>Complete the selected P14 target and system inputs in Subwoofer Design first.</p>
      )}
      {showDiagnostics && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs uppercase tracking-wide" style={{ color: '#625143' }}>Show diagnostics</summary>
          <EngineeringPublicationDiagnostics preflight={preflight} matchingAttempt={matchingAttempt} durable={durable} />
        </details>
      )}
    </section>
  );
}