// StorageFactorDominanceAudit.jsx
// Case 027 — Storage Factor Dominance Audit. Temporary diagnostic panel — Bass Response page.
// STRICT AUDIT: read-only, fixed test case. No physics/graph/production changes.

import React, { useState, useCallback } from 'react';
import { runStorageFactorDominanceAudit, fmt } from '@/components/room/bass/storageFactorDominanceAuditEngine';

const thS = { textAlign: 'right', padding: '4px 6px', fontSize: 10, fontWeight: 700, background: '#f0fdf4', borderBottom: '2px solid #86efac', color: '#166534', whiteSpace: 'nowrap' };
const tdS = { textAlign: 'right', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace' };
const sectionBox = { border: '1px solid #86efac', borderRadius: 6, background: '#fff', padding: '8px 10px', marginBottom: 10 };
const sectionTitle = { fontWeight: 700, color: '#166534', fontSize: 11, fontFamily: 'monospace', marginBottom: 6 };

function ContributorTable({ title, rows }) {
  return (
    <div style={sectionBox}>
      <div style={sectionTitle}>{title}</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 800 }}>
          <thead>
            <tr>
              <th style={{ ...thS, textAlign: 'left' }}>Mode (m,n,p)</th>
              <th style={{ ...thS, textAlign: 'left' }}>Type</th>
              <th style={thS}>Natural Freq</th>
              <th style={thS}>Before storageFactor</th>
              <th style={thS}>storageFactor</th>
              <th style={thS}>After storageFactor</th>
              <th style={thS}>% of field</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #dcfce7' }}>
                <td style={{ ...tdS, textAlign: 'left' }}>{r.modeLabel}</td>
                <td style={{ ...tdS, textAlign: 'left' }}>{r.modeType}</td>
                <td style={tdS}>{fmt(r.naturalFrequencyHz, 2)} Hz</td>
                <td style={tdS}>{fmt(r.beforeStorage, 6)}</td>
                <td style={tdS}>{fmt(r.storageFactor, 6)}</td>
                <td style={tdS}>{fmt(r.afterStorage, 6)}</td>
                <td style={tdS}>{fmt(r.pctOfField, 1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ComparisonSummary({ result }) {
  return (
    <div style={sectionBox}>
      <div style={sectionTitle}>A vs B Comparison (evaluated at 30.0 Hz)</div>
      <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#166534', lineHeight: 1.8 }}>
        <div>A. Production (modalStorageMode='none'): 30 Hz SPL <strong>{fmt(result.caseA.finalSplDb, 2)} dB</strong> · Modal magnitude <strong>{fmt(result.caseA.modalMagnitude, 6)}</strong> · Null depth <strong>{fmt(result.nullA.depthDb, 2)} dB</strong> @ <strong>{fmt(result.nullA.nullHz, 1)} Hz</strong></div>
        <div>B. storageFactor forced to 1.0 for all modes: 30 Hz SPL <strong>{fmt(result.caseB.finalSplDb, 2)} dB</strong> · Modal magnitude <strong>{fmt(result.caseB.modalMagnitude, 6)}</strong> · Null depth <strong>{fmt(result.nullB.depthDb, 2)} dB</strong> @ <strong>{fmt(result.nullB.nullHz, 1)} Hz</strong></div>
        <div style={{ marginTop: 4 }}>&Delta; 30 Hz SPL: <strong>{fmt(result.splDeltaDb, 3)} dB</strong> · &Delta; modal magnitude: <strong>{fmt(result.modalMagDeltaPct, 3)}%</strong> · &Delta; null depth: <strong>{fmt(result.nullDepthDeltaDb, 3)} dB</strong></div>
        <div style={{ marginTop: 4 }}>All reported contributors carry storageFactor === 1.0 under production defaults: <strong>{result.allStorageFactorsAreUnity ? 'YES' : 'NO'}</strong></div>
      </div>
    </div>
  );
}

export default function StorageFactorDominanceAudit() {
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);

  const runAudit = useCallback(() => {
    setRunning(true);
    setResult(runStorageFactorDominanceAudit());
    setRunning(false);
  }, []);

  return (
    <div style={{ border: '2px solid #15803d', borderRadius: 8, background: '#f0fdf4', padding: '10px 12px', marginTop: 8, marginBottom: 8 }}>
      <div style={{ fontWeight: 700, color: '#166534', fontSize: 12, fontFamily: 'monospace', marginBottom: 4 }}>
        Case 027 — Storage Factor Dominance Audit
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          strict audit · temporary diagnostic · read-only · fixed room 5.0×4.5×3.0m · seat 4.00m · 30.0 Hz
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <button onClick={runAudit} disabled={running}
          style={{ height: 26, padding: '0 12px', borderRadius: 6, border: '1px solid #166534', background: running ? '#e5e7eb' : '#166534', color: running ? '#6b7280' : '#fff', fontSize: 10, fontFamily: 'monospace', cursor: running ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
          {running ? 'Running…' : 'Run Audit'}
        </button>
      </div>

      {result && (
        <>
          <ContributorTable title="Modal Contributors — Case A (Production), sorted descending by contribution" rows={result.caseA.rows} />
          <ComparisonSummary result={result} />

          <div style={{ border: '2px solid #166534', borderRadius: 6, background: '#dcfce7', padding: '10px 12px', fontSize: 11, fontFamily: 'monospace', color: '#14532d' }}>
            <div><strong>TEST:</strong> {result.finalReport.test}</div>
            <div style={{ marginTop: 4 }}><strong>EXPECTED:</strong> {result.finalReport.expected}</div>
            <div style={{ marginTop: 4 }}><strong>ACTUAL:</strong> {result.finalReport.actual}</div>
            <div style={{ marginTop: 4 }}><strong>DELTA:</strong> {result.finalReport.delta}</div>
            <div style={{ marginTop: 4 }}><strong>SEVERITY:</strong> {result.finalReport.severity}</div>
            <div style={{ marginTop: 4 }}><strong>NEXT TEST:</strong> {result.finalReport.nextTest}</div>
            <div style={{ marginTop: 10, fontWeight: 700, fontSize: 12 }}>{result.finalReport.conclusionLine}</div>
          </div>
        </>
      )}
    </div>
  );
}