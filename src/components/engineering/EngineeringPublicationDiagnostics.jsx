import React from 'react';

/**
 * Full publication preflight table. Developer/diagnostic surface only — it is
 * rendered exclusively behind an explicit admin or Expert View disclosure, so
 * internal gate labels and field names never appear in the dealer workflow.
 */
export default function EngineeringPublicationDiagnostics({ preflight, matchingAttempt, durable }) {
  return (
    <div className="mt-2 rounded-lg border border-[#DCDBD6] bg-[#FAFAF9] p-3">
      <table className="w-full text-xs text-left">
        <thead>
          <tr>
            <th className="pr-3">Gate</th>
            <th className="pr-3">Result</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {preflight.gates.map((gate) => (
            <tr key={gate.key}>
              <td className="pr-3 align-top">{gate.label}</td>
              <td className="pr-3 align-top">{gate.ok ? 'PASS' : 'FAIL'}</td>
              <td className="align-top">{gate.detail || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs">
        Publication request: {matchingAttempt?.status || 'not attempted'}
        {matchingAttempt?.message ? ' — ' + matchingAttempt.message : ''}. HTTP: {matchingAttempt?.httpStatus || 'not recorded'}.
      </p>
      <p className="text-xs">
        Durable publication: {durable?.acknowledgement?.durably_published === true ? 'acknowledged' : 'not acknowledged'}.
      </p>
    </div>
  );
}