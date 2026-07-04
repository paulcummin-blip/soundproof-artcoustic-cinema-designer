// AbsorptionAuthorityAudit.jsx
// Temporary diagnostic panel — Bass Response page.
// STRICT AUDIT: read-only, fixed parity test case. No physics/graph/production changes.
// Tests whether B44's surface absorption has real authority over the 28–35 Hz pressure
// field (Q vs modal/reflection/final SPL), against baseline case A.

import React, { useState, useCallback } from 'react';
import { runAbsorptionAuthorityAudit, fmt } from '@/components/room/bass/absorptionAuthorityAuditEngine';

const thS = { textAlign: 'right', padding: '4px 6px', fontSize: 10, fontWeight: 700, background: '#eff6ff', borderBottom: '2px solid #93c5fd', color: '#1e40af', whiteSpace: 'nowrap' };
const tdS = { textAlign: 'right', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace' };
const sectionBox = { border: '1px solid #93c5fd', borderRadius: 6, background: '#fff', padding: '8px 10px', marginBottom: 10 };
const sectionTitle = { fontWeight: 700, color: '#1e40af', fontSize: 11, fontFamily: 'monospace', marginBottom: 6 };

function CaseTable({ c }) {
  return (
    <div style={sectionBox}>
      <div style={sectionTitle}>{c.label}</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 950 }}>
          <thead>
            <tr>
              <th style={{ ...thS, textAlign: 'left' }}>Hz</th>
              <th style={thS}>Total SPL</th><th style={thS}>Direct SPL</th><th style={thS}>Reflection SPL</th><th style={thS}>Modal SPL</th>
              <th style={thS}>Final Re</th><th style={thS}>Final Im</th><th style={thS}>Final °</th>
            </tr>
          </thead>
          <tbody>
            {c.rows.map((r) => (
              <tr key={r.frequencyHz} style={{ borderBottom: '1px solid #dbeafe' }}>
                <td style={{ ...tdS, textAlign: 'left', fontWeight: 700 }}>{r.frequencyHz}</td>
                <td style={{ ...tdS, fontWeight: 700 }}>{fmt(r.totalSplDb, 2)}</td>
                <td style={tdS}>{fmt(r.directSplDb, 2)}</td>
                <td style={tdS}>{fmt(r.reflectionSplDb, 2)}</td>
                <td style={tdS}>{fmt(r.modalSplDb, 2)}</td>
                <td style={tdS}>{fmt(r.finalRe, 4)}</td>
                <td style={tdS}>{fmt(r.finalIm, 4)}</td>
                <td style={tdS}>{fmt(r.finalPhaseDeg, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#1e40af', marginTop: 6, lineHeight: 1.7 }}>
        <div>30 Hz SPL: <strong>{fmt(c.spl30, 2)} dB</strong> · 34 Hz SPL: <strong>{fmt(c.spl34, 2)} dB</strong> · 30→34 rise: <strong>{fmt(c.rise30to34, 2)} dB</strong></div>
        <div>29–31 Hz null depth: <strong>{fmt(c.nullDepthDb, 2)} dB</strong></div>
        <div>Dominant mode @30Hz: <strong>{c.dominantAt30}</strong> — Q here: <strong>{fmt(c.dominantAt30Q, 2)}</strong>, Q in baseline A: <strong>{fmt(c.dominantAt30QInBaselineA, 2)}</strong></div>
        <div>Modal SPL @30Hz: <strong>{fmt(c.modalSplAt30, 2)} dB</strong> · Reflection SPL @30Hz: <strong>{fmt(c.reflectionSplAt30, 2)} dB</strong> · Direct SPL @30Hz: <strong>{fmt(c.directSplAt30, 2)} dB</strong></div>
      </div>
    </div>
  );
}

function DeltaTable({ deltas }) {
  const rows = Object.values(deltas);
  return (
    <div style={sectionBox}>
      <div style={sectionTitle}>Delta vs Baseline A</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 750 }}>
          <thead>
            <tr>
              <th style={{ ...thS, textAlign: 'left' }}>Case</th>
              <th style={thS}>Δ30Hz</th><th style={thS}>Δ34Hz</th><th style={thS}>Δnull depth</th>
              <th style={thS}>Δdominant Q</th><th style={thS}>Δmodal SPL</th><th style={thS}>Δreflection SPL</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.key} style={{ borderBottom: '1px solid #dbeafe' }}>
                <td style={{ ...tdS, textAlign: 'left' }}>{d.label}</td>
                <td style={tdS}>{fmt(d.d30, 2)}</td>
                <td style={tdS}>{fmt(d.d34, 2)}</td>
                <td style={tdS}>{fmt(d.dNullDepth, 2)}</td>
                <td style={tdS}>{d.dDominantQ === null ? '—' : fmt(d.dDominantQ, 2)}</td>
                <td style={tdS}>{fmt(d.dModalSpl, 2)}</td>
                <td style={tdS}>{fmt(d.dReflectionSpl, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AbsorptionAuthorityAudit() {
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);

  const runAudit = useCallback(() => {
    setRunning(true);
    setResult(runAbsorptionAuthorityAudit());
    setRunning(false);
  }, []);

  return (
    <div style={{ border: '2px solid #1d4ed8', borderRadius: 8, background: '#eff6ff', padding: '10px 12px', marginTop: 8, marginBottom: 8 }}>
      <div style={{ fontWeight: 700, color: '#1e40af', fontSize: 12, fontFamily: 'monospace', marginBottom: 4 }}>
        Absorption Authority Audit
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          strict audit · temporary diagnostic · read-only · fixed room 5.0×4.5×3.0m · seat 4.00m · 28–35 Hz
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <button onClick={runAudit} disabled={running}
          style={{ height: 26, padding: '0 12px', borderRadius: 6, border: '1px solid #1e40af', background: running ? '#e5e7eb' : '#1e40af', color: running ? '#6b7280' : '#fff', fontSize: 10, fontFamily: 'monospace', cursor: running ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
          {running ? 'Running…' : 'Run Audit'}
        </button>
      </div>

      {result && (
        <>
          {Object.values(result.results).map((c) => (<CaseTable key={c.key} c={c} />))}
          <DeltaTable deltas={result.deltas} />

          <div style={{ border: '2px solid #1e40af', borderRadius: 6, background: '#dbeafe', padding: '10px 12px', fontSize: 11, fontFamily: 'monospace', color: '#1e3a8a' }}>
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