// ModalQTransferAuthorityAudit.jsx
// Temporary diagnostic panel — Bass Response page.
// STRICT AUDIT: read-only, fixed parity test case. No physics/graph/production changes.
// Traces the dominant mode's Q continuously through |H|, pre/post-accumulation modal
// amplitude, and final SPL to find the first stage where a Q-driven gain is suppressed.

import React, { useState, useCallback } from 'react';
import { runModalQTransferAuthorityAudit, fmt } from '@/components/room/bass/modalQTransferAuthorityAuditEngine';

const thS = { textAlign: 'right', padding: '4px 6px', fontSize: 10, fontWeight: 700, background: '#f0fdf4', borderBottom: '2px solid #86efac', color: '#166534', whiteSpace: 'nowrap' };
const tdS = { textAlign: 'right', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace' };
const sectionBox = { border: '1px solid #86efac', borderRadius: 6, background: '#fff', padding: '8px 10px', marginBottom: 10 };
const sectionTitle = { fontWeight: 700, color: '#166534', fontSize: 11, fontFamily: 'monospace', marginBottom: 6 };

function CaseCard({ c }) {
  return (
    <div style={sectionBox}>
      <div style={sectionTitle}>{c.label}</div>
      <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#166534', lineHeight: 1.8 }}>
        <div>Dominant mode: <strong>{c.dominantLabel}</strong> · Natural frequency: <strong>{fmt(c.naturalFrequencyHz, 2)} Hz</strong> · Calculated Q: <strong>{fmt(c.qValue, 3)}</strong></div>
        <div>Complex resonant transfer: Re <strong>{fmt(c.transferRe, 5)}</strong>, Im <strong>{fmt(c.transferIm, 5)}</strong></div>
        <div>Transfer magnitude |H|: <strong>{fmt(c.transferMagActual, 5)}</strong> (recomputed independently: <strong>{fmt(c.transferMagRecomputed, 5)}</strong>)</div>
        <div>Modal amplitude before accumulation (this mode only): <strong>{fmt(c.preAccumulationModalAmplitude, 6)}</strong></div>
        <div>Modal amplitude after accumulation (all modes summed): <strong>{fmt(c.postAccumulationModalAmplitude, 6)}</strong></div>
        <div>Final modal SPL contribution: <strong>{fmt(c.finalModalSplDb, 2)} dB</strong> · Final total SPL: <strong>{fmt(c.finalTotalSplDb, 2)} dB</strong></div>
      </div>
    </div>
  );
}

function ComparisonTable({ rows }) {
  return (
    <div style={sectionBox}>
      <div style={sectionTitle}>Comparison Table (vs Baseline A, evaluated at 30 Hz)</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 950 }}>
          <thead>
            <tr>
              <th style={{ ...thS, textAlign: 'left' }}>Case</th>
              <th style={thS}>Q</th><th style={thS}>Expected |H|</th><th style={thS}>Actual |H|</th>
              <th style={thS}>Expected Δ|H|</th><th style={thS}>Actual Δ|H|</th>
              <th style={thS}>Expected modal SPL</th><th style={thS}>Actual modal SPL</th>
              <th style={thS}>Loss (%)</th><th style={thS}>Transfer Efficiency</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} style={{ borderBottom: '1px solid #dcfce7' }}>
                <td style={{ ...tdS, textAlign: 'left' }}>{r.label}</td>
                <td style={tdS}>{fmt(r.qValue, 3)}</td>
                <td style={tdS}>{fmt(r.expectedH, 5)}</td>
                <td style={tdS}>{fmt(r.actualH, 5)}</td>
                <td style={tdS}>{r.expectedDeltaH === null ? '—' : fmt(r.expectedDeltaH, 5)}</td>
                <td style={tdS}>{r.actualDeltaH === null ? '—' : fmt(r.actualDeltaH, 5)}</td>
                <td style={tdS}>{r.expectedModalSplDb === null ? '—' : fmt(r.expectedModalSplDb, 2)}</td>
                <td style={tdS}>{fmt(r.actualModalSplDb, 2)}</td>
                <td style={tdS}>{r.lossPct === null ? '—' : fmt(r.lossPct, 1)}</td>
                <td style={tdS}>{r.transferEfficiency === null ? '—' : fmt(r.transferEfficiency, 3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ModalQTransferAuthorityAudit() {
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);

  const runAudit = useCallback(() => {
    setRunning(true);
    setResult(runModalQTransferAuthorityAudit());
    setRunning(false);
  }, []);

  return (
    <div style={{ border: '2px solid #15803d', borderRadius: 8, background: '#f0fdf4', padding: '10px 12px', marginTop: 8, marginBottom: 8 }}>
      <div style={{ fontWeight: 700, color: '#166534', fontSize: 12, fontFamily: 'monospace', marginBottom: 4 }}>
        Modal Q Transfer Authority Audit
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          strict audit · temporary diagnostic · read-only · fixed room 5.0×4.5×3.0m · seat 4.00m · 28–35 Hz
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
          {Object.values(result.results).map((c) => (<CaseCard key={c.key} c={c} />))}
          <ComparisonTable rows={result.comparisonRows} />

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