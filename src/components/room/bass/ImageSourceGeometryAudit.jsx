// ImageSourceGeometryAudit.jsx
// Temporary diagnostic panel — Bass Response page.
// STRICT AUDIT: geometry-only. Ignores vectors, SPL, phase-summation, modal contributions.
// Validates the mirror-image construction of every first-order reflection against the
// textbook image-source method, for the fixed parity room. Read-only, no production changes.

import React, { useState, useCallback } from 'react';
import { runImageSourceGeometryAudit, fmt } from '@/components/room/bass/imageSourceGeometryAuditEngine';

const thS = { textAlign: 'left', padding: '4px 6px', fontSize: 10, fontWeight: 700, background: '#ecfeff', borderBottom: '2px solid #67e8f9', color: '#0e7490', whiteSpace: 'nowrap' };
const tdS = { textAlign: 'left', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace' };
const sectionBox = { border: '1px solid #67e8f9', borderRadius: 6, background: '#fff', padding: '8px 10px', marginBottom: 10 };
const sectionTitle = { fontWeight: 700, color: '#0e7490', fontSize: 11, fontFamily: 'monospace', marginBottom: 6 };

function YesNo({ value, invert }) {
  const good = invert ? !value : value;
  return <span style={{ fontWeight: 700, color: good ? '#166534' : '#b91c1c' }}>{String(value).toUpperCase()}</span>;
}

function coord(p) { return `(${fmt(p.x, 3)}, ${fmt(p.y, 3)}, ${fmt(p.z, 3)})`; }

export default function ImageSourceGeometryAudit() {
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);

  const runAudit = useCallback(() => {
    setRunning(true);
    setResult(runImageSourceGeometryAudit());
    setRunning(false);
  }, []);

  return (
    <div style={{ border: '2px solid #0891b2', borderRadius: 8, background: '#ecfeff', padding: '10px 12px', marginTop: 8, marginBottom: 8 }}>
      <div style={{ fontWeight: 700, color: '#0e7490', fontSize: 12, fontFamily: 'monospace', marginBottom: 4 }}>
        Image Source Geometry Audit
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          strict audit · temporary diagnostic · read-only · geometry-only (no vectors/SPL/phase-sum/modal) · fixed parity room 5.0×4.5×3.0m
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <button onClick={runAudit} disabled={running}
          style={{ height: 26, padding: '0 12px', borderRadius: 6, border: '1px solid #0e7490', background: running ? '#e5e7eb' : '#0e7490', color: running ? '#6b7280' : '#fff', fontSize: 10, fontFamily: 'monospace', cursor: running ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
          {running ? 'Running…' : 'Run Audit'}
        </button>
      </div>

      {result && (
        <>
          <div style={sectionBox}>
            <div style={sectionTitle}>Construction Chain</div>
            <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#0e7490', lineHeight: 2 }}>
              <div>Direct source {coord(result.source)}</div>
              <div>↓</div>
              {result.rows.map((r, i) => (
                <React.Fragment key={r.id}>
                  <div>{r.label} {coord(r.mirroredSource)}</div>
                  {i < result.rows.length - 1 && <div>↓</div>}
                </React.Fragment>
              ))}
            </div>
          </div>

          <div style={sectionBox}>
            <div style={sectionTitle}>Per-Image Geometry Detail</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 1100 }}>
                <thead>
                  <tr>
                    <th style={thS}>Image</th><th style={thS}>Wall Used</th><th style={thS}>Mirror Equation</th>
                    <th style={thS}>Original Source</th><th style={thS}>Mirrored Source</th><th style={thS}>Receiver</th>
                    <th style={thS}>Reflection Path (m)</th><th style={thS}>Direct Path (m)</th><th style={thS}>Extra Path (m)</th>
                    <th style={thS}>Delay (ms)</th><th style={thS}>Phase @30Hz (°)</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r) => (
                    <tr key={r.id} style={{ borderBottom: '1px solid #cffafe' }}>
                      <td style={{ ...tdS, fontWeight: 700 }}>{r.label}</td>
                      <td style={tdS}>{r.wallUsed}</td>
                      <td style={tdS}>{r.equation}</td>
                      <td style={tdS}>{coord(r.originalSource)}</td>
                      <td style={tdS}>{coord(r.mirroredSource)}</td>
                      <td style={tdS}>{coord(r.receiver)}</td>
                      <td style={tdS}>{fmt(r.reflectionPathLength)}</td>
                      <td style={tdS}>{fmt(r.directPathLength)}</td>
                      <td style={tdS}>{fmt(r.extraPathLength)}</td>
                      <td style={tdS}>{fmt(r.delayMs, 3)}</td>
                      <td style={tdS}>{fmt(r.phaseDeg, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={sectionBox}>
            <div style={sectionTitle}>Per-Image Verification</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 800 }}>
                <thead>
                  <tr>
                    <th style={thS}>Image</th><th style={thS}>Mirror Correct?</th><th style={thS}>Path Physically Valid?</th>
                    <th style={thS}>Generated Once?</th><th style={thS}>Duplicated?</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r) => (
                    <tr key={r.id} style={{ borderBottom: '1px solid #cffafe' }}>
                      <td style={{ ...tdS, fontWeight: 700 }}>{r.label}</td>
                      <td style={tdS}><YesNo value={r.mirrorCorrect} /></td>
                      <td style={tdS}><YesNo value={r.pathPhysicallyValid} /></td>
                      <td style={tdS}><YesNo value={r.generatedOnce} /></td>
                      <td style={tdS}><YesNo value={r.isDuplicate} invert /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ border: '2px solid #0e7490', borderRadius: 6, background: '#cffafe', padding: '10px 12px', fontSize: 11, fontFamily: 'monospace', color: '#155e63' }}>
            <div>All mirrors mathematically correct: <YesNo value={result.checks.allMirrorsCorrect} /></div>
            <div>All reflection paths physically valid: <YesNo value={result.checks.allPathsValid} /></div>
            <div>Any duplicated image sources: <YesNo value={result.checks.anyDuplicates} invert /></div>
            <div>Every image generated exactly once: <YesNo value={result.checks.allGeneratedOnce} /></div>
            <div style={{ marginTop: 10, fontWeight: 700, fontSize: 12 }}>{result.verdict}</div>
          </div>
        </>
      )}
    </div>
  );
}