// ModalDistanceScalingABAudit.jsx
// Temporary diagnostic panel — Bass Response page.
// STRICT AUDIT: read-only, fixed parity test case. No physics/graph/production changes.
// Tests whether modalSourceReferenceMode="distance_normalized" (current live setting) is
// applying listener-distance attenuation to the modal field and causing the 30 Hz null.

import React, { useState, useCallback } from 'react';
import { runModalDistanceScalingABAudit, fmt } from '@/components/room/bass/modalDistanceScalingABAuditEngine';

const thS = { textAlign: 'right', padding: '4px 6px', fontSize: 10, fontWeight: 700, background: '#fff7ed', borderBottom: '2px solid #fdba74', color: '#9a3412', whiteSpace: 'nowrap' };
const tdS = { textAlign: 'right', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace' };
const sectionBox = { border: '1px solid #fdba74', borderRadius: 6, background: '#fff', padding: '8px 10px', marginBottom: 10 };
const sectionTitle = { fontWeight: 700, color: '#9a3412', fontSize: 11, fontFamily: 'monospace', marginBottom: 6 };

function VariantTable({ variant }) {
  return (
    <div style={sectionBox}>
      <div style={sectionTitle}>{variant.label}</div>
      <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#6b7280', marginBottom: 6 }}>{variant.description}</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900 }}>
          <thead>
            <tr>
              <th style={{ ...thS, textAlign: 'left' }}>Hz</th>
              <th style={thS}>Total SPL</th><th style={thS}>Direct SPL</th><th style={thS}>Reflection SPL</th><th style={thS}>Modal SPL</th>
              <th style={thS}>Final Re</th><th style={thS}>Final Im</th><th style={thS}>Final °</th><th style={thS}>Modal/Direct dB</th>
            </tr>
          </thead>
          <tbody>
            {variant.rows.map((r) => (
              <tr key={r.frequencyHz} style={{ borderBottom: '1px solid #ffedd5' }}>
                <td style={{ ...tdS, textAlign: 'left', fontWeight: 700 }}>{r.frequencyHz}</td>
                <td style={{ ...tdS, fontWeight: 700 }}>{fmt(r.totalSplDb, 2)}</td>
                <td style={tdS}>{fmt(r.directSplDb, 2)}</td>
                <td style={tdS}>{r.reflectionSplDb === null ? 'n/a' : fmt(r.reflectionSplDb, 2)}</td>
                <td style={tdS}>{fmt(r.modalSplDb, 2)}</td>
                <td style={tdS}>{fmt(r.finalRe, 4)}</td>
                <td style={tdS}>{fmt(r.finalIm, 4)}</td>
                <td style={tdS}>{fmt(r.finalPhaseDeg, 1)}</td>
                <td style={tdS}>{r.modalDirectRatioDb === null ? 'n/a' : fmt(r.modalDirectRatioDb, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ModalDistanceScalingABAudit() {
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);

  const runAudit = useCallback(() => {
    setRunning(true);
    const audit = runModalDistanceScalingABAudit();
    setResult(audit);
    setRunning(false);
  }, []);

  return (
    <div style={{ border: '2px solid #ea580c', borderRadius: 8, background: '#fff7ed', padding: '10px 12px', marginTop: 8, marginBottom: 8 }}>
      <div style={{ fontWeight: 700, color: '#9a3412', fontSize: 12, fontFamily: 'monospace', marginBottom: 4 }}>
        Modal Distance Scaling A/B Audit
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          strict audit · temporary diagnostic · read-only · fixed parity case (5.0×4.5×3.0m, seat y=4.0m, α=0.30) · 28–35 Hz
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <button onClick={runAudit} disabled={running}
          style={{ height: 26, padding: '0 12px', borderRadius: 6, border: '1px solid #9a3412', background: running ? '#e5e7eb' : '#9a3412', color: running ? '#6b7280' : '#fff', fontSize: 10, fontFamily: 'monospace', cursor: running ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
          {running ? 'Running…' : 'Run Audit'}
        </button>
      </div>

      {result && (
        <>
          {Object.values(result.results).map((variant) => (
            <VariantTable key={variant.key} variant={variant} />
          ))}

          <div style={sectionBox}>
            <div style={sectionTitle}>Null Depth &amp; Difference Summary (29–31 Hz null region)</div>
            <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#9a3412', lineHeight: 1.7 }}>
              <div>Null depth — A (current production): <strong>{fmt(result.nullDepthA, 2)} dB</strong></div>
              <div>Null depth — B (decoupled): <strong>{fmt(result.nullDepthB, 2)} dB</strong></div>
              <div>Null depth reduction (A → B): <strong>{fmt(result.nullDepthReductionDb, 2)} dB</strong></div>
              <div>New artifact introduced by B outside 29–31 Hz: <strong>{result.newArtifact ? `YES at ${result.artifactFreq} Hz` : 'NO'}</strong></div>
              <div>Max |C − D| difference across 28–35 Hz: <strong>{fmt(result.cdMaxDiffDb, 2)} dB</strong></div>
            </div>
          </div>

          <div style={{ border: '2px solid #9a3412', borderRadius: 6, background: '#ffedd5', padding: '10px 12px', fontSize: 11, fontFamily: 'monospace', color: '#7c2d12' }}>
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