// ModeAxisIdentityAudit.jsx
// Temporary read-only diagnostic panel — Bass Response page.
// Verifies whether modal indices, room axes, and displayed mode labels align.
// Fixed test-case room — no production changes, measurements only.

import React, { useState, useCallback } from 'react';
import { runModeAxisIdentityAudit, TEST_HZ } from '@/components/room/bass/modeAxisIdentityAuditEngine';

function fmt(v, d = 2) { return Number.isFinite(v) ? Number(v).toFixed(d) : '—'; }

const thS = { textAlign: 'right', padding: '3px 6px', fontSize: 9, fontWeight: 700, background: '#0f766e', color: '#f0fdfa', whiteSpace: 'nowrap' };
const tdS = { textAlign: 'right', padding: '2px 6px', fontSize: 9, fontFamily: 'monospace' };

function RawModeTable({ rows }) {
  return (
    <div style={{ overflowX: 'auto', marginBottom: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#0f766e', marginBottom: 3 }}>1. Raw generated axial modes (before coupling/transfer)</div>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 820 }}>
        <thead>
          <tr>{['Mode id', 'nx', 'ny', 'nz', 'Dim for nx', 'Dim for ny', 'Dim for nz', 'Freq (Hz)', 'Family', 'Expected axis label'].map((h) => <th key={h} style={thS}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.displayId} style={{ borderBottom: '1px solid #ccfbf1' }}>
              <td style={{ ...tdS, textAlign: 'left', fontWeight: 700, color: '#0f766e' }}>{r.displayId}</td>
              <td style={tdS}>{r.nx}</td>
              <td style={tdS}>{r.ny}</td>
              <td style={tdS}>{r.nz}</td>
              <td style={{ ...tdS, textAlign: 'left', fontSize: 8 }}>{r.dimensionForNx}</td>
              <td style={{ ...tdS, textAlign: 'left', fontSize: 8 }}>{r.dimensionForNy}</td>
              <td style={{ ...tdS, textAlign: 'left', fontSize: 8 }}>{r.dimensionForNz}</td>
              <td style={{ ...tdS, fontWeight: 700 }}>{fmt(r.calculatedFrequencyHz, 2)}</td>
              <td style={tdS}>{r.family}</td>
              <td style={{ ...tdS, textAlign: 'left', fontSize: 8 }}>{r.expectedAxisLabel}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChecklistTable({ checklist }) {
  return (
    <div style={{ overflowX: 'auto', marginBottom: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#0f766e', marginBottom: 3 }}>2. PASS/FAIL checks</div>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 600 }}>
        <thead>
          <tr>{['Question', 'Result', 'Verdict'].map((h) => <th key={h} style={{ ...thS, textAlign: h === 'Verdict' ? 'right' : 'left' }}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {checklist.map((c) => (
            <tr key={c.question} style={{ borderBottom: '1px solid #ccfbf1' }}>
              <td style={{ ...tdS, textAlign: 'left' }}>{c.question}</td>
              <td style={{ ...tdS, textAlign: 'left', fontSize: 8 }}>{c.result}</td>
              <td style={{ ...tdS, fontWeight: 700, color: c.pass ? '#166534' : '#b91c1c' }}>{c.pass ? 'PASS' : 'FAIL'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ContributorTable({ rows }) {
  return (
    <div style={{ overflowX: 'auto', marginBottom: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#0f766e', marginBottom: 3 }}>3. Production contributor-debug labels @ 28–35 Hz</div>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 700 }}>
        <thead>
          <tr>{['Hz', 'Dominant mode id', 'Native freq (Hz)', 'Expected id for that freq', 'Label match?'].map((h) => <th key={h} style={thS}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.frequencyHz} style={{ borderBottom: '1px solid #ccfbf1' }}>
              <td style={{ ...tdS, fontWeight: 700, color: '#0f766e' }}>{r.frequencyHz}</td>
              <td style={tdS}>{r.dominantModeId}</td>
              <td style={tdS}>{fmt(r.nativeFrequencyHz, 2)}</td>
              <td style={tdS}>{r.expectedIdForFrequency}</td>
              <td style={{ ...tdS, fontWeight: 700, color: r.labelMatch === 'YES' ? '#166534' : r.labelMatch === 'NO' ? '#b91c1c' : '#6b7280' }}>{r.labelMatch}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ModeAxisIdentityAudit() {
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);

  const runAudit = useCallback(() => {
    setRunning(true);
    setResults(runModeAxisIdentityAudit());
    setRunning(false);
  }, []);

  return (
    <div style={{ border: '2px solid #0f766e', borderRadius: 8, background: '#f0fdfa', padding: '10px 12px', marginTop: 8, marginBottom: 8 }}>
      <div style={{ fontWeight: 700, color: '#0f766e', fontSize: 12, fontFamily: 'monospace', marginBottom: 4 }}>
        Mode Axis Identity Audit
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          temporary diagnostic · fixed test case (5.0×4.5×3.0m, centre-front sub, seat y=4.0m) · no production changes
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 9, color: '#6b7280', fontFamily: 'monospace' }}>Frequencies: {TEST_HZ.join(', ')} Hz · Absorption 0.30 all surfaces</span>
        <button onClick={runAudit} disabled={running} style={{ height: 26, padding: '0 12px', borderRadius: 6, border: '1px solid #0f766e', background: running ? '#e5e7eb' : '#0f766e', color: running ? '#6b7280' : '#fff', fontSize: 10, fontFamily: 'monospace', cursor: running ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
          {running ? 'Running…' : 'Run Audit'}
        </button>
      </div>

      {results && (
        <>
          <RawModeTable rows={results.axialModeRows} />
          <ChecklistTable checklist={results.checklist} />
          <ContributorTable rows={results.contributorRows} />

          <div style={{ border: '1px solid #99f6e4', borderRadius: 6, background: '#fff', padding: '8px 10px', fontSize: 9, fontFamily: 'monospace', color: '#374151', marginBottom: 10 }}>
            {results.note}
          </div>

          <div style={{ border: '2px solid #0f766e', borderRadius: 6, background: '#fff', padding: '10px 12px', fontSize: 10, fontFamily: 'monospace', color: '#1c1917' }}>
            <div style={{ fontWeight: 700, color: '#0f766e', marginBottom: 6, fontSize: 11 }}>FINAL VERDICT (measurements only, no fix applied)</div>
            <div style={{ fontWeight: 700 }}>{results.verdict}</div>
          </div>
        </>
      )}
    </div>
  );
}