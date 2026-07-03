// ModalPhaseRotationABTest.jsx
// Temporary read-only diagnostic panel — Bass Response page.
// Test A: production baseline. Test B: rewParityModalPhase + pureDeterministicModalSum only
// (disables modal propagation phase + deterministic modal phase perturbation).
// No changes to Q, damping, coupling, transfer function, source curve, summation, or smoothing.

import React, { useState, useCallback } from 'react';
import {
  runModalPhaseRotationABTest,
  evaluatePassCriteria,
  TARGET_HZ,
} from '@/components/room/bass/modalPhaseRotationABTestEngine';

function fmt(v, d = 1) { return Number.isFinite(v) ? Number(v).toFixed(d) : '—'; }
function fmtSigned(v, d = 2) { return Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(d)}` : '—'; }

function buildSeatMap(seatingPositions) {
  const ordered = [...(seatingPositions || [])].sort((a, b) => {
    const ra = Number(a?.row || a?.rowNumber) || 1, rb = Number(b?.row || b?.rowNumber) || 1;
    if (ra !== rb) return ra - rb;
    return (Number(a?.x) || 0) - (Number(b?.x) || 0);
  });
  const map = {};
  ordered.forEach((seat) => {
    const sid = seat.id || `${seat.x}-${seat.y}`;
    const rowNum = Number(seat?.row || seat?.rowNumber) || 1;
    if (rowNum !== 1) return;
    const rowSeats = ordered.filter((s) => (Number(s?.row || s?.rowNumber) || 1) === rowNum);
    const posInRow = rowSeats.findIndex((s) => (s.id || `${s.x}-${s.y}`) === sid) + 1;
    const label = `R1S${posInRow}`;
    if (['R1S1', 'R1S2', 'R1S3'].includes(label)) {
      map[label] = seat;
    }
  });
  return map;
}

const thS = { textAlign: 'right', padding: '3px 6px', fontSize: 9, fontWeight: 700, background: '#334155', color: '#f1f5f9', whiteSpace: 'nowrap' };
const tdS = { textAlign: 'right', padding: '2px 6px', fontSize: 9, fontFamily: 'monospace' };

function SeatTable({ label, rows }) {
  const criteria = evaluatePassCriteria(rows);
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 700, color: '#1e293b', fontSize: 11, fontFamily: 'monospace', marginBottom: 4 }}>{label}</div>
      <div style={{ overflowX: 'auto', marginBottom: 6 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 520 }}>
          <thead>
            <tr>
              <th style={{ ...thS, textAlign: 'right' }}>Hz</th>
              <th style={{ ...thS, textAlign: 'right' }}>Test A dB (production)</th>
              <th style={{ ...thS, textAlign: 'right' }}>Test B dB (phase disabled)</th>
              <th style={{ ...thS, textAlign: 'right' }}>Δ (B − A)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.hz} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ ...tdS, fontWeight: 700, color: '#1e293b' }}>{r.hz}</td>
                <td style={tdS}>{fmt(r.dbA)}</td>
                <td style={tdS}>{fmt(r.dbB)}</td>
                <td style={{ ...tdS, fontWeight: 700, color: Number.isFinite(r.deltaBMinusA) && Math.abs(r.deltaBMinusA) > 1 ? '#b45309' : '#1e293b' }}>
                  {fmtSigned(r.deltaBMinusA)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#334155' }}>
        <div>Null width (30–45Hz) improved: <strong style={{ color: criteria.nullWidthImproved === true ? '#166534' : criteria.nullWidthImproved === false ? '#b91c1c' : '#6b7280' }}>{criteria.nullWidthImproved === null ? '—' : criteria.nullWidthImproved ? '✓ YES' : '✗ NO'}</strong> (avg Δ: {fmtSigned(criteria.avgNullDelta)})</div>
        <div>57/58Hz peak preserved: <strong style={{ color: criteria.peakPreserved ? '#166534' : '#b91c1c' }}>{criteria.peakPreserved ? '✓ YES' : '✗ NO'}</strong></div>
        <div>No new artificial notch: <strong style={{ color: criteria.noNewNotch ? '#166534' : '#b91c1c' }}>{criteria.noNewNotch ? '✓ YES' : '✗ NO'}</strong></div>
      </div>
    </div>
  );
}

export default function ModalPhaseRotationABTest({ roomDims, seatingPositions, subsForSimulation, surfaceAbsorption }) {
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);

  const seatMap = buildSeatMap(seatingPositions);
  const source = subsForSimulation?.[0] || null;
  const canRun = !!(roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM && source && Object.keys(seatMap).length > 0);

  const runTest = useCallback(() => {
    if (!canRun) return;
    setRunning(true);
    const rdims = { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM };
    const seatResults = runModalPhaseRotationABTest(rdims, seatMap, source, surfaceAbsorption);
    setResult(seatResults);
    setRunning(false);
  }, [canRun, roomDims, surfaceAbsorption, seatMap, source]);

  return (
    <div style={{ border: '2px solid #334155', borderRadius: 8, background: '#f8fafc', padding: '10px 12px', marginTop: 8, marginBottom: 8 }}>
      <div style={{ fontWeight: 700, color: '#1e293b', fontSize: 12, fontFamily: 'monospace', marginBottom: 4 }}>
        Modal Phase Rotation A/B Test
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          temporary diagnostic · Test A = production · Test B = modal propagation phase + deterministic phase perturbation disabled only
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 9, color: '#6b7280', fontFamily: 'monospace' }}>Seats: R1S1, R1S2, R1S3 · Frequencies: {TARGET_HZ.join(', ')} Hz</span>
        <button onClick={runTest} disabled={running || !canRun} style={{ height: 26, padding: '0 12px', borderRadius: 6, border: '1px solid #1e293b', background: running ? '#e5e7eb' : '#1e293b', color: running ? '#6b7280' : '#fff', fontSize: 10, fontFamily: 'monospace', cursor: running || !canRun ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
          {running ? 'Running…' : 'Run A/B Test'}
        </button>
        {!canRun && <span style={{ fontSize: 9, color: '#b45309', fontFamily: 'monospace' }}>⚠ Need room, a sub, and at least one Row 1 seat (R1S1–R1S3).</span>}
      </div>

      {result && (
        <>
          {['R1S1', 'R1S2', 'R1S3'].map((label) => (
            result[label] ? <SeatTable key={label} label={label} rows={result[label]} /> : (
              <div key={label} style={{ fontSize: 9, fontFamily: 'monospace', color: '#b45309', marginBottom: 8 }}>{label}: not present in current seating layout.</div>
            )
          ))}
        </>
      )}
    </div>
  );
}