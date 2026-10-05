import React, { useEffect, useState } from 'react';
import { useOptionalSharedBassResults } from '@/components/room/bass/bassResultsStore';
import { fetchDurablePublication } from './versionedEngineeringAuthority';
import { auditDurablePublication } from './publicationGateAuthority';

export default function EngineeringPublicationStatus({ publication, projectId, versionId }) {
  const bass = useOptionalSharedBassResults();
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
  const status = saved ? 'Published'
    : matchingAttempt?.status === 'publishing' ? 'Publishing'
    : matchingAttempt?.status === 'failed' ? 'Failed: ' + matchingAttempt.message
    : matchingAttempt?.status === 'queued' ? 'Publishing — waiting for assessment to settle'
    : !preflight.ready ? 'Not ready: ' + preflight.reason
    : matchingAttempt?.status === 'cancelled' ? matchingAttempt.message
    : 'Engineering assessment not saved';
  return <section className="rounded-xl border border-amber-200 bg-white p-3 mb-3" aria-label="Engineering publication">
    <h2 className="font-semibold">Engineering assessment</h2>
    <p role="status">{status}</p>
    {!saved && <p className="text-sm">Assessment displayed, not published. Final reports and proposals remain blocked.</p>}
    {!saved && (preflight.ready
      ? <button type="button" className="border rounded px-3 py-1 my-2" disabled={matchingAttempt?.status === 'publishing'} onClick={publish}>Publish Assessment</button>
      : <button type="button" className="border rounded px-3 py-1 my-2" disabled={!bass?.canCalculate || bass?.calculationInProgress}
          onClick={() => bass?.onCalculate?.({ collectDiagnostics: true })}>Verify Bass / Complete P19</button>)}
    {!saved && !preflight.ready && !bass?.canCalculate && <p className="text-sm">Complete the selected P14 target and system inputs in Subwoofer Design first. No publication request has been sent.</p>}
    <details><summary>Publication preflight</summary>
      <table className="text-sm"><thead><tr><th>Gate</th><th>Result</th><th>Reason</th></tr></thead>
      <tbody>{preflight.gates.map(gate => <tr key={gate.key}>
        <td>{gate.label}</td><td>{gate.ok ? 'PASS' : 'FAIL'}</td><td>{gate.detail || ''}</td>
      </tr>)}</tbody></table>
      <p>Publication request: {matchingAttempt?.status || 'not attempted'}. HTTP: {matchingAttempt?.httpStatus || 'not recorded'}.</p>
      <p>Durable publication: {durable?.acknowledgement?.durably_published === true ? 'acknowledged' : 'not acknowledged'}.</p>
    </details>
  </section>;
}
