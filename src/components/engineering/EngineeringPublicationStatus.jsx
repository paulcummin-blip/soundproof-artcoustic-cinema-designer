import React, { useEffect, useState } from 'react';
import { useOptionalSharedBassResults } from '@/components/room/bass/bassResultsStore';
import { fetchDurablePublication } from './versionedEngineeringAuthority';
import { auditDurablePublication } from './publicationGateAuthority';
import EngineeringPublicationDiagnostics from './EngineeringPublicationDiagnostics';
import { useEngineeringMode } from '@/components/state/useEngineeringMode';
import { useAuth } from '@/lib/AuthContext';

// Dealer-facing status wording. Internal gate labels and field names stay inside
// the diagnostics disclosure — never in the normal workflow.
const TONES = {
  published: { dot: '#2F7D4F', label: 'Saved' },
  publishing: { dot: '#B7791F', label: 'Saving…' },
  failed: { dot: '#B3261E', label: 'Assessment not saved' },
  'not-ready': { dot: '#B7791F', label: 'Complete design assessment' },
  'not-saved': { dot: '#B7791F', label: 'Ready to save' },
};

// The one client-facing label per state. Generic by design: it names no
// gate, parameter, workflow or code, and the click routes internally to the
// right one. Never put internal wording in this row.
const ACTIONS = {
  'not-ready': { label: 'Complete Assessment' },
  failed: { label: 'Try Again' },
  'not-saved': { label: 'Save Assessment' },
};

export default function EngineeringPublicationStatus({ publication, projectId, versionId }) {
  const bass = useOptionalSharedBassResults();
  const { user } = useAuth();
  const { engineeringMode } = useEngineeringMode();
  const [durable, setDurable] = useState(null);
  // The diagnostics disclosure is mounted only once the designer opens it, so no
  // gate row, fingerprint or HTTP code exists in the DOM by default.
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
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

  const tone = TONES[state];
  // The client-facing primary action: a generic label, routed internally. A
  // saved or saving assessment offers no action at all, so the steady state
  // carries no action noise in front of a client.
  const action = state === 'published' || state === 'publishing' ? null
    : state === 'failed' ? { ...ACTIONS.failed, onClick: publish }
    : preflight.ready ? { ...ACTIONS['not-saved'], onClick: publish }
    : {
        ...ACTIONS['not-ready'],
        onClick: () => bass?.onCalculate?.({ collectDiagnostics: true }),
        disabled: !bass?.canCalculate || bass?.calculationInProgress,
      };

  // Internal diagnostics, and only for the two internal audiences: an explicit
  // developer Engineering Mode session, or a true internal master admin, which
  // is never account-scoped. A dealer's own account administrator is account
  // scoped, so it never reaches this disclosure even though it manages users.
  const accountScoped = Boolean(
    user?.access_context?.account?.id || user?.access_context?.user?.account_id
  );
  const showDiagnostics = engineeringMode === true
    || (user?.access_context?.capabilities?.masterAdmin === true && !accountScoped);

  return (
    <section className="rounded-lg border border-[#DCDBD6] bg-white px-3 py-2 mb-3" aria-label="Engineering assessment status">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: tone.dot }} aria-hidden="true" />
          <span className="font-semibold" style={{ color: '#213428' }}>Engineering assessment</span>
          <span aria-hidden="true" style={{ color: '#625143' }}>·</span>
          <span role="status" style={{ color: '#625143' }}>{tone.label}</span>
        </span>
        {action && (
          <button
            type="button"
            className="border rounded px-3 py-1"
            onClick={action.onClick}
            disabled={action.disabled}
          >
            {action.label}
          </button>
        )}
      </div>
      {action?.disabled && (
        <p className="mt-1 text-xs" style={{ color: '#625143' }}>Complete the system design first.</p>
      )}
      {showDiagnostics && (
        <details
          className="mt-2"
          onToggle={(event) => setDiagnosticsOpen(event.currentTarget.open)}
        >
          <summary className="cursor-pointer text-xs uppercase tracking-wide" style={{ color: '#625143' }}>Show diagnostics</summary>
          {diagnosticsOpen && (
            <EngineeringPublicationDiagnostics preflight={preflight} matchingAttempt={matchingAttempt} durable={durable} />
          )}
        </details>
      )}
    </section>
  );
}