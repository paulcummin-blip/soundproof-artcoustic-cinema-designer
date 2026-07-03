// AxialPhaseSignParityAudit.jsx
// Temporary read-only diagnostic panel — Bass Response page.
// Tests whether the 30 Hz B44 null (REW shows a peak) is a phase/sign/
// coordinate-origin mismatch in the length-axial mode. Fixed test-case room —
// does not read live project state. No production changes.

import React, { useState, useCallback } from 'react';
import { runAxialPhaseSignParityAudit, TEST_HZ } from '@/components/room/bass/axialPhaseSignParityAuditEngine';

function fmt(v, d = 2) { return Number.isFinite(v) ? Number(v).toFixed(d) : '—'; }

const thS = { textAlign: 'right', padding: '3px 6px', fontSize: 9, fontWeight: 700, background: '#4c1d95', color: '#faf5ff', whiteSpace: 'nowrap' };
const tdS = { textAlign: 'right', padding: '2px 6px', fontSize: 9, fontFamily: 'monospace' };

function passColor(pf) {
  if (pf === 'PASS') return '#166534';
  if (pf === 'BASELINE') return '#374151';
  return '#b91c1c';
}

function VariantTable({ variant }) {
  return (
    <div style={{ overflowX: 'auto', marginBottom: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#4c1d95', marginBottom: 3 }}>
        {variant.key}. {variant.label} — <span style={{ color: passColor(variant.passFail) }}>{variant.passFail}</span>
      </div>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 700 }}>
        <thead>
          <tr>{['Hz', 'Production dB', 'Variant dB', 'Delta', 'Dominant mode'].map((h) => <th key={h} style={thS}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {variant.rows.map((r) => (
            <tr key={r.frequencyHz} style={{ borderBottom: '1px solid #ede9fe' }}>
              <td style={{ ...tdS, fontWeight: 700, color: '#4c1d95' }}>{r.frequencyHz}</td>
              <td style={tdS}>{fmt(r.productionDb)}</td>
              <td style={{ ...tdS, fontWeight: 700 }}>{fmt(r.variantDb)}</td>
              <td style={tdS}>{r.delta !== null ? (r.delta >= 0 ? '+' : '') + fmt(r.delta) : '—'}</td>
              <td style={{ ...tdS, textAlign: 'left', fontSize: 8 }}>{r.dominantMode}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LengthAxialTable({ variant }) {
  const row30 = variant.rows.find((r) => r.frequencyHz === 30);
  if (!row30 || row30.lengthAxialRows.length === 0) return null;
  return (
    <div style={{ overflowX: 'auto', marginBottom: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#4c1d95', marginBottom: 3 }}>
        {variant.key}. Length axial modes @ 30 Hz — (1,0,0), (2,0,0), (3,0,0)
      </div>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 820 }}>
        <thead>
          <tr>{['Mode', 'Mode Hz', 'Src coupling', 'Rcv coupling', 'Combined', 'Transfer phase°', 'Final phase°', 'Re', 'Im', 'Constructive?'].map((h) => <th key={h} style={thS}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {row30.lengthAxialRows.map((m) => (
            <tr key={m.modeKey} style={{ borderBottom: '1px solid #ede9fe' }}>
              <td style={{ ...tdS, fontWeight: 700, color: '#4c1d95', textAlign: 'left' }}>{m.modeKey}</td>
              <td style={tdS}>{fmt(m.modeFrequencyHz, 1)}</td>
              <td style={tdS}>{fmt(m.sourceCoupling, 3)}</td>
              <td style={tdS}>{fmt(m.receiverCoupling, 3)}</td>
              <td style={tdS}>{fmt(m.combinedCoupling, 3)}</td>
              <td style={tdS}>{fmt(m.transferPhaseDeg, 1)}</td>
              <td style={tdS}>{fmt(m.finalPhaseDeg, 1)}</td>
              <td style={tdS}>{fmt(m.contribRe, 3)}</td>
              <td style={tdS}>{fmt(m.contribIm, 3)}</td>
              <td style={{ ...tdS, fontWeight: 700, color: m.constructive ? '#166534' : '#b91c1c' }}>{m.constructive ? 'Constructive' : 'Destructive'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function buildVerdict(perVariant) {
  const candidates = perVariant.filter((v) => v.key !== 'A' && v.passFail === 'PASS');
  const row30ForVariant = (v) => v.rows.find((r) => r.frequencyHz === 30);
  const best = candidates.sort((a, b) => (row30ForVariant(b)?.delta ?? -999) - (row30ForVariant(a)?.delta ?? -999))[0];
  const confirmed = candidates.length > 0;
  return {
    confirmed,
    closestVariant: best ? `${best.key}. ${best.label}` : 'None passed',
    codeLocation: confirmed
      ? 'src/bass/core/modalCalculations.js → modeShapeValueLocal() (length-axis cos(nπy/L) convention) and/or the coupling sign applied in src/bass/core/rewBassEngine.js → legacyModalTransferLocal()'
      : 'Not isolated — no tested sign/coordinate variant removed the null without a new error',
  };
}

export default function AxialPhaseSignParityAudit() {
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);

  const runAudit = useCallback(() => {
    setRunning(true);
    setResults(runAxialPhaseSignParityAudit());
    setRunning(false);
  }, []);

  const verdict = results ? buildVerdict(results.perVariant) : null;

  return (
    <div style={{ border: '2px solid #4c1d95', borderRadius: 8, background: '#faf5ff', padding: '10px 12px', marginTop: 8, marginBottom: 8 }}>
      <div style={{ fontWeight: 700, color: '#4c1d95', fontSize: 12, fontFamily: 'monospace', marginBottom: 4 }}>
        Axial Phase Sign Parity Audit
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          temporary diagnostic · fixed test case (5.0×4.5×3.0m, centre-front sub, seat y=4.0m) · no production changes
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 9, color: '#6b7280', fontFamily: 'monospace' }}>Frequencies: {TEST_HZ.join(', ')} Hz · Absorption 0.30 all surfaces</span>
        <button onClick={runAudit} disabled={running} style={{ height: 26, padding: '0 12px', borderRadius: 6, border: '1px solid #4c1d95', background: running ? '#e5e7eb' : '#4c1d95', color: running ? '#6b7280' : '#fff', fontSize: 10, fontFamily: 'monospace', cursor: running ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
          {running ? 'Running…' : 'Run Audit'}
        </button>
      </div>

      {results && results.perVariant.map((variant) => (
        <div key={variant.key} style={{ marginBottom: 14, borderBottom: '1px solid #ddd6fe', paddingBottom: 10 }}>
          <VariantTable variant={variant} />
          <LengthAxialTable variant={variant} />
        </div>
      ))}

      {verdict && (
        <div style={{ border: '2px solid #4c1d95', borderRadius: 6, background: '#fff', padding: '10px 12px', fontSize: 10, fontFamily: 'monospace', color: '#1c1917' }}>
          <div style={{ fontWeight: 700, color: '#4c1d95', marginBottom: 6, fontSize: 11 }}>FINAL VERDICT (no fix applied)</div>
          <div>Phase sign issue: <strong style={{ color: verdict.confirmed ? '#b91c1c' : '#166534' }}>{verdict.confirmed ? 'CONFIRMED' : 'NOT CONFIRMED'}</strong></div>
          <div>Variant closest to REW: <strong>{verdict.closestVariant}</strong></div>
          <div>Likely code location: <strong>{verdict.codeLocation}</strong></div>
        </div>
      )}
    </div>
  );
}