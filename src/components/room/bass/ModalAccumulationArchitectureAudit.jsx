// ModalAccumulationArchitectureAudit.jsx
// Temporary diagnostic panel — Bass Response page.
// STRICT AUDIT: read-only, fixed parity test case. No physics/graph/production changes.
// Tests whether production's independent-summation of the complete reflection field and
// complete modal field is causing the remaining 30 Hz REW parity mismatch.

import React, { useState, useCallback } from 'react';
import { runModalAccumulationArchitectureAudit, fmt } from '@/components/room/bass/modalAccumulationArchitectureAuditEngine';

const thS = { textAlign: 'right', padding: '4px 6px', fontSize: 10, fontWeight: 700, background: '#f5f3ff', borderBottom: '2px solid #c4b5fd', color: '#5b21b6', whiteSpace: 'nowrap' };
const tdS = { textAlign: 'right', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace' };
const sectionBox = { border: '1px solid #c4b5fd', borderRadius: 6, background: '#fff', padding: '8px 10px', marginBottom: 10 };
const sectionTitle = { fontWeight: 700, color: '#5b21b6', fontSize: 11, fontFamily: 'monospace', marginBottom: 6 };

function YesNo({ value, invert }) {
  const good = invert ? !value : value;
  return <span style={{ fontWeight: 700, color: good ? '#166534' : '#b91c1c' }}>{String(value).toUpperCase()}</span>;
}

function VariantTable({ variant }) {
  return (
    <div style={sectionBox}>
      <div style={sectionTitle}>{variant.label}</div>
      <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#6b7280', marginBottom: 6 }}>{variant.description}</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 700 }}>
          <thead>
            <tr>
              <th style={{ ...thS, textAlign: 'left' }}>Hz</th>
              <th style={thS}>SPL (dB)</th><th style={thS}>Final Re</th><th style={thS}>Final Im</th><th style={thS}>Phase (°)</th>
              {variant.key !== 'A' && <th style={thS}>Δ30Hz vs A</th>}
            </tr>
          </thead>
          <tbody>
            {variant.rows.map((r) => (
              <tr key={r.frequencyHz} style={{ borderBottom: '1px solid #ede9fe' }}>
                <td style={{ ...tdS, textAlign: 'left', fontWeight: 700 }}>{r.frequencyHz}</td>
                <td style={{ ...tdS, fontWeight: 700 }}>{fmt(r.splDb, 2)}</td>
                <td style={tdS}>{fmt(r.re, 4)}</td>
                <td style={tdS}>{fmt(r.im, 4)}</td>
                <td style={tdS}>{fmt(r.phaseDeg, 1)}</td>
                {variant.key !== 'A' && r.frequencyHz === 30 && <td style={{ ...tdS, fontWeight: 700 }}>{fmt(variant.delta30HzVsA, 2)}</td>}
                {variant.key !== 'A' && r.frequencyHz !== 30 && <td style={tdS}></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#5b21b6', marginTop: 6, lineHeight: 1.6 }}>
        <div>29–31 Hz null depth: <strong>{fmt(variant.nullDepthDb, 2)} dB</strong></div>
        <div>Tells REW story (rising 30–34 Hz, no deep 30 Hz null): <YesNo value={variant.tellsRewStory} /></div>
        {variant.key !== 'A' && (
          <>
            <div>30 Hz delta vs production (A): <strong>{fmt(variant.delta30HzVsA, 2)} dB</strong></div>
            <div>New artifact introduced outside 29–31 Hz: {variant.newArtifact ? <span style={{ fontWeight: 700, color: '#b91c1c' }}>YES at {variant.newArtifactFreq} Hz</span> : <span style={{ fontWeight: 700, color: '#166534' }}>NO</span>}</div>
          </>
        )}
      </div>
    </div>
  );
}

export default function ModalAccumulationArchitectureAudit() {
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);

  const runAudit = useCallback(() => {
    setRunning(true);
    setResult(runModalAccumulationArchitectureAudit());
    setRunning(false);
  }, []);

  return (
    <div style={{ border: '2px solid #7c3aed', borderRadius: 8, background: '#f5f3ff', padding: '10px 12px', marginTop: 8, marginBottom: 8 }}>
      <div style={{ fontWeight: 700, color: '#5b21b6', fontSize: 12, fontFamily: 'monospace', marginBottom: 4 }}>
        Modal Accumulation Architecture Audit
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          strict audit · temporary diagnostic · read-only · fixed parity case (5.0×4.5×3.0m, seat y=4.0m, α=0.30) · 28–35 Hz
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <button onClick={runAudit} disabled={running}
          style={{ height: 26, padding: '0 12px', borderRadius: 6, border: '1px solid #5b21b6', background: running ? '#e5e7eb' : '#5b21b6', color: running ? '#6b7280' : '#fff', fontSize: 10, fontFamily: 'monospace', cursor: running ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
          {running ? 'Running…' : 'Run Audit'}
        </button>
        {result && <span style={{ fontSize: 9, fontFamily: 'monospace', color: '#6b7280' }}>Schroeder frequency: {fmt(result.schroederHz, 1)} Hz</span>}
      </div>

      {result && (
        <>
          {Object.values(result.results).map((variant) => (
            <VariantTable key={variant.key} variant={variant} />
          ))}

          <div style={{ border: '2px solid #5b21b6', borderRadius: 6, background: '#ede9fe', padding: '10px 12px', fontSize: 11, fontFamily: 'monospace', color: '#4c1d95' }}>
            <div><strong>TEST:</strong> {result.finalReport.test}</div>
            <div style={{ marginTop: 4 }}><strong>EXPECTED:</strong> {result.finalReport.expected}</div>
            <div style={{ marginTop: 4 }}><strong>ACTUAL:</strong> {result.finalReport.actual}</div>
            <div style={{ marginTop: 4 }}><strong>DELTA:</strong> {result.finalReport.delta}</div>
            <div style={{ marginTop: 4 }}><strong>SEVERITY:</strong> {result.finalReport.severity}</div>
            <div style={{ marginTop: 4 }}><strong>NEXT TEST:</strong> {result.finalReport.nextTest}</div>
            <div style={{ marginTop: 10, fontWeight: 700, fontSize: 12 }}>{result.verdict}</div>
          </div>
        </>
      )}
    </div>
  );
}