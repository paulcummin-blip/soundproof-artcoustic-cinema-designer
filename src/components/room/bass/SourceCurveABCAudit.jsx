// SourceCurveABCAudit.jsx
// Temporary read-only diagnostic panel — Bass Response page.
// Strict A/B/C source-curve audit: current production curve (A) vs the
// uploaded SUB4-12 INFRA max-SPL FRD (B) vs the generic REW-like falling LF
// curve (C), at R1S1–R1S3 and the requested target frequencies.
// No production/physics/graph changes — re-runs the unmodified engine only.

import React, { useState, useCallback } from 'react';
import { runSourceCurveABCAudit, TARGET_HZ } from '@/components/room/bass/sourceCurveABCAuditEngine';

function fmt(v, d = 2) { return Number.isFinite(v) ? Number(v).toFixed(d) : '—'; }

function buildSeatMap(seatingPositions) {
  const ordered = [...(seatingPositions || [])].sort((a, b) => (Number(a?.x) || 0) - (Number(b?.x) || 0));
  const row1 = ordered.filter((s) => (Number(s?.row || s?.rowNumber) || 1) === 1);
  const map = {};
  row1.forEach((seat, i) => { const label = `R1S${i + 1}`; if (['R1S1', 'R1S2', 'R1S3'].includes(label)) map[label] = seat; });
  return map;
}

const thS = { textAlign: 'right', padding: '3px 6px', fontSize: 9, fontWeight: 700, background: '#7c2d12', color: '#fef2f2', whiteSpace: 'nowrap' };
const tdS = { textAlign: 'right', padding: '2px 6px', fontSize: 9, fontFamily: 'monospace' };

function severityColor(severity) {
  if (severity.startsWith('PASS')) return '#166534';
  if (severity.startsWith('WATCH')) return '#b45309';
  if (severity.startsWith('FAIL')) return '#b91c1c';
  return '#6b7280';
}

function VariantTable({ rows, variantLabel, actualKey, deltaKey, severityKey, nextTestKey }) {
  return (
    <div style={{ overflowX: 'auto', marginBottom: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#7c2d12', marginBottom: 3 }}>{variantLabel}</div>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 760 }}>
        <thead>
          <tr>{['Test (Hz)', 'Expected (Prod. dB)', 'Actual (dB)', 'Delta (dB)', 'Severity', 'Next test'].map((h) => <th key={h} style={thS}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.frequencyHz} style={{ borderBottom: '1px solid #fee2e2' }}>
              <td style={{ ...tdS, fontWeight: 700, color: '#7c2d12', textAlign: 'left' }}>{row.frequencyHz} Hz</td>
              <td style={tdS}>{fmt(row.expected)}</td>
              <td style={{ ...tdS, fontWeight: 700 }}>{fmt(row[actualKey])}</td>
              <td style={tdS}>{row[deltaKey] !== null ? (row[deltaKey] >= 0 ? '+' : '') + fmt(row[deltaKey]) : '—'}</td>
              <td style={{ ...tdS, fontWeight: 700, color: severityColor(row[severityKey]) }}>{row[severityKey]}</td>
              <td style={{ ...tdS, textAlign: 'left', fontSize: 8 }}>{row[nextTestKey]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SourceCurveABCAudit({ roomDims, seatingPositions, subsForSimulation }) {
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);

  const seatMap = buildSeatMap(seatingPositions);
  const source = subsForSimulation?.[0] || null;
  const canRun = !!(roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM && source && Object.keys(seatMap).length > 0);

  const runAudit = useCallback(() => {
    if (!canRun) return;
    setRunning(true);
    const rdims = { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM };
    const out = {};
    Object.entries(seatMap).forEach(([label, seat]) => {
      const seatPos = { x: seat.x, y: seat.y, z: Number.isFinite(Number(seat.z)) ? Number(seat.z) : 1.2 };
      out[label] = runSourceCurveABCAudit(rdims, seatPos, source);
    });
    setResults(out);
    setRunning(false);
  }, [canRun, roomDims, seatMap, source]);

  // Summary: does SUB4-12 (B) reduce the 30-45Hz excess without damaging 57/58Hz?
  const summary = results ? Object.entries(results).map(([label, rows]) => {
    const recoveryRows = rows.filter((r) => r.frequencyHz >= 30 && r.frequencyHz <= 45);
    const guardRows = rows.filter((r) => r.frequencyHz === 57 || r.frequencyHz === 58);
    const recoveryPass = recoveryRows.every((r) => r.severityB.startsWith('PASS') || r.severityB.startsWith('WATCH'));
    const guardPass = guardRows.every((r) => r.severityB.startsWith('PASS'));
    return { label, recoveryPass, guardPass, verdict: recoveryPass && guardPass ? 'SUB4-12 reduces 30-45Hz excess without damaging 57/58Hz' : !recoveryPass ? 'SUB4-12 does NOT meaningfully reduce 30-45Hz excess' : 'SUB4-12 damages the 57/58Hz guard band' };
  }) : null;

  return (
    <div style={{ border: '2px solid #7c2d12', borderRadius: 8, background: '#fef2f2', padding: '10px 12px', marginTop: 8, marginBottom: 8 }}>
      <div style={{ fontWeight: 700, color: '#7c2d12', fontSize: 12, fontFamily: 'monospace', marginBottom: 4 }}>
        Source Curve A/B/C Audit
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          temporary diagnostic · production vs SUB4-12 FRD vs REW-like curve · no production changes
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 9, color: '#6b7280', fontFamily: 'monospace' }}>Seats: R1S1–R1S3 · Frequencies: {TARGET_HZ.join(', ')} Hz</span>
        <button onClick={runAudit} disabled={running || !canRun} style={{ height: 26, padding: '0 12px', borderRadius: 6, border: '1px solid #7c2d12', background: running ? '#e5e7eb' : '#7c2d12', color: running ? '#6b7280' : '#fff', fontSize: 10, fontFamily: 'monospace', cursor: running || !canRun ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
          {running ? 'Running…' : 'Run Audit'}
        </button>
        {!canRun && <span style={{ fontSize: 9, color: '#b45309', fontFamily: 'monospace' }}>⚠ Need room, a sub, and at least one Row 1 seat (R1S1–R1S3).</span>}
      </div>

      {results && Object.entries(results).map(([label, rows]) => (
        <div key={label} style={{ marginBottom: 20, borderBottom: '2px solid #7c2d12', paddingBottom: 12 }}>
          <div style={{ fontWeight: 700, color: '#7c2d12', fontSize: 12, fontFamily: 'monospace', marginBottom: 6 }}>{label}</div>
          <div style={{ fontSize: 9, color: '#374151', marginBottom: 6, fontStyle: 'italic' }}>
            Expected = current production source curve output (A). Actual = variant output. Severity bands: 30-45Hz wants
            reduction (≤-2dB PASS), 57/58Hz wants ≈0dB change (±0.5dB PASS).
          </div>
          <VariantTable rows={rows} variantLabel="Variant B — SUB4-12 INFRA max-SPL FRD" actualKey="actualB" deltaKey="deltaB" severityKey="severityB" nextTestKey="nextTestB" />
          <VariantTable rows={rows} variantLabel="Variant C — REW-like generic falling LF curve" actualKey="actualC" deltaKey="deltaC" severityKey="severityC" nextTestKey="nextTestC" />
        </div>
      ))}

      {summary && (
        <div style={{ border: '2px solid #7c2d12', borderRadius: 6, background: '#fff', padding: '10px 12px', fontSize: 10, fontFamily: 'monospace', color: '#1c1917' }}>
          <div style={{ fontWeight: 700, color: '#7c2d12', marginBottom: 6, fontSize: 11 }}>Verdict — Variant B (SUB4-12) per seat</div>
          {summary.map((s) => (
            <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderBottom: '1px solid #fee2e2' }}>
              <span><strong>{s.label}</strong></span>
              <span style={{ fontWeight: 700, color: (s.recoveryPass && s.guardPass) ? '#166534' : '#b91c1c' }}>{s.verdict}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}