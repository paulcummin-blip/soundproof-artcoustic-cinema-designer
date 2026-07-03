// SourceExcitationRealityAudit.jsx
// Temporary read-only diagnostic panel — Bass Response page.
// Tests whether the subwoofer is being treated as an ideal constant-volume
// monopole and over-exciting room modes vs REW, by comparing 10 source-curve
// / modal-drive variants against the unmodified production engine at
// R1S1–R1S3. No physics, coefficient, graph, or saved-project changes.

import React, { useState, useCallback } from 'react';
import {
  runSourceExcitationAudit,
  buildDeltaTable,
  evaluateVariants,
  VARIANTS,
  TARGET_HZ,
} from '@/components/room/bass/sourceExcitationRealityAuditEngine';

function fmt(v, d = 2) { return Number.isFinite(v) ? Number(v).toFixed(d) : '—'; }

function buildSeatMap(seatingPositions) {
  const ordered = [...(seatingPositions || [])].sort((a, b) => (Number(a?.x) || 0) - (Number(b?.x) || 0));
  const row1 = ordered.filter((s) => (Number(s?.row || s?.rowNumber) || 1) === 1);
  const map = {};
  row1.forEach((seat, i) => {
    const label = `R1S${i + 1}`;
    if (['R1S1', 'R1S2', 'R1S3'].includes(label)) map[label] = seat;
  });
  return map;
}

const thS = { textAlign: 'right', padding: '3px 6px', fontSize: 9, fontWeight: 700, background: '#4c1d95', color: '#f5f3ff', whiteSpace: 'nowrap' };
const tdS = { textAlign: 'right', padding: '2px 6px', fontSize: 9, fontFamily: 'monospace' };
const sectionTitle = { fontSize: 11, fontWeight: 700, color: '#4c1d95', margin: '12px 0 4px', paddingTop: 8, borderTop: '1px solid #ddd6fe' };

function TraceTable({ rows }) {
  return (
    <div style={{ overflowX: 'auto', marginBottom: 8 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 700 }}>
        <thead>
          <tr>
            {['Hz', 'Source curve dB', 'Linear mult.', 'Transfer mag', 'Src coupling', 'Rcv coupling', 'Final SPL (dB)'].map((h) => (
              <th key={h} style={thS}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const a = row.variants.A;
            const linearMult = Number.isFinite(a.sourceCurveDb) ? Math.pow(10, a.sourceCurveDb / 20) : null;
            const finalDb = Number.isFinite(a.finalMag) ? 20 * Math.log10(Math.max(a.finalMag, 1e-10)) : null;
            return (
              <tr key={row.frequencyHz} style={{ borderBottom: '1px solid #ede9fe' }}>
                <td style={{ ...tdS, fontWeight: 700, color: '#4c1d95' }}>{row.frequencyHz}</td>
                <td style={tdS}>{fmt(a.sourceCurveDb, 1)}</td>
                <td style={tdS}>{fmt(linearMult, 4)}</td>
                <td style={tdS}>{fmt(a.transferMag, 3)}</td>
                <td style={tdS}>{fmt(a.sourceCoupling, 3)}</td>
                <td style={tdS}>{fmt(a.receiverCoupling, 3)}</td>
                <td style={{ ...tdS, fontWeight: 700 }}>{fmt(finalDb, 2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DeltaTable({ deltaTable }) {
  return (
    <div style={{ overflowX: 'auto', marginBottom: 8 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900 }}>
        <thead>
          <tr>
            <th style={thS}>Hz</th>
            <th style={thS}>Prod dB</th>
            {VARIANTS.filter((v) => v.key !== 'A').map((v) => <th key={v.key} style={thS}>{v.key} Δ</th>)}
          </tr>
        </thead>
        <tbody>
          {deltaTable.map((row) => (
            <tr key={row.frequencyHz} style={{ borderBottom: '1px solid #ede9fe' }}>
              <td style={{ ...tdS, fontWeight: 700, color: '#4c1d95' }}>{row.frequencyHz}</td>
              <td style={tdS}>{fmt(row.productionDb, 2)}</td>
              {VARIANTS.filter((v) => v.key !== 'A').map((v) => {
                const d = row.deltas[v.key];
                const color = d != null && d <= -3 ? '#166534' : d != null && d > 0 ? '#b91c1c' : undefined;
                return <td key={v.key} style={{ ...tdS, color, fontWeight: color ? 700 : undefined }}>{fmt(d, 2)}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RankingTable({ ranking }) {
  return (
    <div style={{ overflowX: 'auto', marginBottom: 8 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 700 }}>
        <thead>
          <tr>
            {['Test', 'Expected', 'Actual', '30–45Hz reduce ≥3dB', '57/58Hz ±2dB', 'No new 50Hz notch', 'Severity'].map((h) => (
              <th key={h} style={{ ...thS, textAlign: h === 'Test' ? 'left' : 'right' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ranking.map((r) => (
            <tr key={r.key} style={{ borderBottom: '1px solid #ede9fe', background: r.passesAll ? '#f0fdf4' : undefined }}>
              <td style={{ ...tdS, textAlign: 'left', fontWeight: 700 }}>{r.label}</td>
              <td style={tdS}>reduce excess</td>
              <td style={{ ...tdS, fontWeight: 700, color: r.passesAll ? '#166534' : '#b91c1c' }}>{r.passesAll ? 'PASS' : 'FAIL'}</td>
              <td style={tdS}>{r.reduceOk ? '✓' : '✗'}</td>
              <td style={tdS}>{r.preserve5758Ok ? '✓' : '✗'}</td>
              <td style={tdS}>{r.no50NotchWorse ? '✓' : '✗'}</td>
              <td style={{ ...tdS, color: r.passesAll ? '#166534' : '#92400e' }}>{r.severity}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SourceExcitationRealityAudit({ roomDims, seatingPositions, subsForSimulation, surfaceAbsorption }) {
  const [results, setResults] = useState(null); // { R1S1: rows, R1S2: rows, R1S3: rows }
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
      out[label] = runSourceExcitationAudit(rdims, seatPos, source, surfaceAbsorption);
    });
    setResults(out);
    setRunning(false);
  }, [canRun, roomDims, surfaceAbsorption, seatMap, source]);

  const deltaTablesBySeat = results
    ? Object.fromEntries(Object.entries(results).map(([label, rows]) => [label, buildDeltaTable(rows)]))
    : null;
  const ranking = deltaTablesBySeat ? evaluateVariants(deltaTablesBySeat) : null;
  const bestPass = ranking?.find((r) => r.passesAll) || null;

  return (
    <div style={{ border: '2px solid #4c1d95', borderRadius: 8, background: '#f5f3ff', padding: '10px 12px', marginTop: 8, marginBottom: 8 }}>
      <div style={{ fontWeight: 700, color: '#4c1d95', fontSize: 12, fontFamily: 'monospace', marginBottom: 4 }}>
        Source Excitation Reality Audit
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          temporary diagnostic · tests source-curve / modal-drive over-excitation · no physics/graph/coefficient changes
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 9, color: '#6b7280', fontFamily: 'monospace' }}>Seats: R1S1–R1S3 · Frequencies: {TARGET_HZ.join(', ')} Hz</span>
        <button onClick={runAudit} disabled={running || !canRun} style={{ height: 26, padding: '0 12px', borderRadius: 6, border: '1px solid #4c1d95', background: running ? '#e5e7eb' : '#4c1d95', color: running ? '#6b7280' : '#fff', fontSize: 10, fontFamily: 'monospace', cursor: running || !canRun ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
          {running ? 'Running…' : 'Run Audit'}
        </button>
        {!canRun && <span style={{ fontSize: 9, color: '#b45309', fontFamily: 'monospace' }}>⚠ Need room, a sub, and at least one Row 1 seat (R1S1–R1S3).</span>}
      </div>

      {results && Object.entries(results).map(([label, rows]) => (
        <div key={label} style={{ marginBottom: 20, borderBottom: '2px solid #6d28d9', paddingBottom: 12 }}>
          <div style={{ fontWeight: 700, color: '#4c1d95', fontSize: 12, fontFamily: 'monospace', marginBottom: 6 }}>{label}</div>

          <div style={sectionTitle}>1. Exact source amplitude path (production)</div>
          <TraceTable rows={rows} />

          <div style={sectionTitle}>2/3. Variant deltas vs production (dB)</div>
          <DeltaTable deltaTable={deltaTablesBySeat[label]} />
        </div>
      ))}

      {ranking && (
        <>
          <div style={sectionTitle}>5. Automatic ranking (pass criteria across R1S1–R1S3)</div>
          <RankingTable ranking={ranking} />

          <div style={{ border: '2px solid #4c1d95', borderRadius: 6, background: '#fff', padding: '10px 12px', fontSize: 10, fontFamily: 'monospace', color: '#1c1917', marginTop: 8 }}>
            <div style={{ fontWeight: 700, color: '#4c1d95', marginBottom: 6, fontSize: 11 }}>6. FINAL VERDICT</div>
            {bestPass ? (
              <div style={{ color: '#166534', fontWeight: 700 }}>
                Source-curve/modal-drive issue confirmed — variant "{bestPass.label}" meets all pass criteria across R1S1–R1S3 (measurement only, not a recommendation).
              </div>
            ) : (
              <div style={{ color: '#92400e', fontWeight: 700 }}>
                No source-side variant meets all pass criteria — measured data points toward a modal excitation or modal/direct balance issue rather than a pure source-curve issue.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}