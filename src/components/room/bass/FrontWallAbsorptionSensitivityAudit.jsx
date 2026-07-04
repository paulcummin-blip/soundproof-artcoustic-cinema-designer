// FrontWallAbsorptionSensitivityAudit.jsx
// Temporary diagnostic panel — Bass Response page.
// STRICT AUDIT: read-only, fixed parity test case. No physics/graph/production changes.
// Compares B44's sensitivity to front-wall absorption and a small seat move against the
// established physical baseline (no REW measured dataset wired into this environment).

import React, { useState, useCallback } from 'react';
import { runFrontWallAbsorptionSensitivityAudit, fmt } from '@/components/room/bass/frontWallAbsorptionSensitivityAuditEngine';

const thS = { textAlign: 'right', padding: '4px 6px', fontSize: 10, fontWeight: 700, background: '#fdf2f8', borderBottom: '2px solid #f9a8d4', color: '#9d174d', whiteSpace: 'nowrap' };
const tdS = { textAlign: 'right', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace' };
const sectionBox = { border: '1px solid #f9a8d4', borderRadius: 6, background: '#fff', padding: '8px 10px', marginBottom: 10 };
const sectionTitle = { fontWeight: 700, color: '#9d174d', fontSize: 11, fontFamily: 'monospace', marginBottom: 6 };

function VariantTable({ variant }) {
  return (
    <div style={sectionBox}>
      <div style={sectionTitle}>{variant.label}</div>
      <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#6b7280', marginBottom: 6 }}>{variant.description}</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 950 }}>
          <thead>
            <tr>
              <th style={{ ...thS, textAlign: 'left' }}>Hz</th>
              <th style={thS}>Total SPL</th><th style={thS}>Direct SPL</th><th style={thS}>Reflection SPL</th><th style={thS}>Modal SPL</th>
              <th style={thS}>Final Re</th><th style={thS}>Final Im</th><th style={thS}>Final °</th><th style={{ ...thS, textAlign: 'left' }}>Dominant Mode</th>
            </tr>
          </thead>
          <tbody>
            {variant.rows.map((r) => (
              <tr key={r.frequencyHz} style={{ borderBottom: '1px solid #fce7f3' }}>
                <td style={{ ...tdS, textAlign: 'left', fontWeight: 700 }}>{r.frequencyHz}</td>
                <td style={{ ...tdS, fontWeight: 700 }}>{fmt(r.totalSplDb, 2)}</td>
                <td style={tdS}>{fmt(r.directSplDb, 2)}</td>
                <td style={tdS}>{fmt(r.reflectionSplDb, 2)}</td>
                <td style={tdS}>{fmt(r.modalSplDb, 2)}</td>
                <td style={tdS}>{fmt(r.finalRe, 4)}</td>
                <td style={tdS}>{fmt(r.finalIm, 4)}</td>
                <td style={tdS}>{fmt(r.finalPhaseDeg, 1)}</td>
                <td style={{ ...tdS, textAlign: 'left' }}>{r.dominantMode}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#9d174d', marginTop: 6, lineHeight: 1.7 }}>
        <div>29–31 Hz null depth: <strong>{fmt(variant.nullDepthDb, 2)} dB</strong></div>
        <div>30 Hz SPL: <strong>{fmt(variant.spl30, 2)} dB</strong> — dominant mode: {variant.dominantAt30}</div>
        <div>34 Hz SPL: <strong>{fmt(variant.spl34, 2)} dB</strong> — dominant mode: {variant.dominantAt34}</div>
        <div>30→34 Hz rise: <strong>{fmt(variant.rise30to34, 2)} dB</strong></div>
      </div>
    </div>
  );
}

export default function FrontWallAbsorptionSensitivityAudit() {
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);

  const runAudit = useCallback(() => {
    setRunning(true);
    setResult(runFrontWallAbsorptionSensitivityAudit());
    setRunning(false);
  }, []);

  return (
    <div style={{ border: '2px solid #db2777', borderRadius: 8, background: '#fdf2f8', padding: '10px 12px', marginTop: 8, marginBottom: 8 }}>
      <div style={{ fontWeight: 700, color: '#9d174d', fontSize: 12, fontFamily: 'monospace', marginBottom: 4 }}>
        Front Wall Absorption Sensitivity Audit
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          strict audit · temporary diagnostic · read-only · fixed room 5.0×4.5×3.0m · seats 4.00m/3.80m · 28–35 Hz
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <button onClick={runAudit} disabled={running}
          style={{ height: 26, padding: '0 12px', borderRadius: 6, border: '1px solid #9d174d', background: running ? '#e5e7eb' : '#9d174d', color: running ? '#6b7280' : '#fff', fontSize: 10, fontFamily: 'monospace', cursor: running ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
          {running ? 'Running…' : 'Run Audit'}
        </button>
      </div>

      {result && (
        <>
          {Object.values(result.results).map((variant) => (
            <VariantTable key={variant.key} variant={variant} />
          ))}

          <div style={sectionBox}>
            <div style={sectionTitle}>Sensitivity Summary</div>
            <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#9d174d', lineHeight: 1.7 }}>
              <div>Absorption-driven null-depth shift — seat 4.00m (A→C): <strong>{fmt(result.absorptionShiftSeatA, 2)} dB</strong></div>
              <div>Absorption-driven null-depth shift — seat 3.80m (B→D): <strong>{fmt(result.absorptionShiftSeatB, 2)} dB</strong></div>
              <div>Seat-move-driven null-depth shift — base absorption (A→B): <strong>{fmt(result.seatShiftBaseAbsorption, 2)} dB</strong></div>
              <div>Seat-move-driven null-depth shift — high front absorption (C→D): <strong>{fmt(result.seatShiftHighAbsorption, 2)} dB</strong></div>
            </div>
          </div>

          <div style={{ border: '2px solid #9d174d', borderRadius: 6, background: '#fce7f3', padding: '10px 12px', fontSize: 11, fontFamily: 'monospace', color: '#831843' }}>
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