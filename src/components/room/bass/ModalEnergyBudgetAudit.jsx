// ModalEnergyBudgetAudit.jsx
// Temporary read-only diagnostic panel — Bass Response page.
// Measures where final pressure comes from (direct / reflection / modal) at target
// frequencies for R1S1–R1S3, using the unmodified production engine. No physics,
// coefficient, or graph changes. Measurement only — no recommendations.

import React, { useState, useCallback } from 'react';
import {
  runModalEnergyBudgetAudit,
  buildDominanceRanking,
  buildFinalSummary,
  TARGET_HZ,
} from '@/components/room/bass/modalEnergyBudgetAuditEngine';

function fmt(v, d = 2) { return Number.isFinite(v) ? Number(v).toFixed(d) : '—'; }
function fmtPct(v, d = 1) { return Number.isFinite(v) ? `${v.toFixed(d)}%` : '—'; }

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
    if (['R1S1', 'R1S2', 'R1S3'].includes(label)) map[label] = seat;
  });
  return map;
}

const thS = { textAlign: 'right', padding: '3px 6px', fontSize: 9, fontWeight: 700, background: '#7c2d12', color: '#fff7ed', whiteSpace: 'nowrap' };
const tdS = { textAlign: 'right', padding: '2px 6px', fontSize: 9, fontFamily: 'monospace' };
const sectionTitle = { fontSize: 11, fontWeight: 700, color: '#7c2d12', margin: '12px 0 4px', paddingTop: 8, borderTop: '1px solid #fed7aa' };

function GenericTable({ columns, rows, rowKey }) {
  return (
    <div style={{ overflowX: 'auto', marginBottom: 8 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 640 }}>
        <thead><tr>{columns.map((c) => <th key={c.key} style={{ ...thS, textAlign: c.align || 'right' }}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={rowKey ? rowKey(row, i) : i} style={{ borderBottom: '1px solid #fed7aa' }}>
              {columns.map((c) => <td key={c.key} style={{ ...tdS, textAlign: c.align || 'right', color: c.color ? c.color(row) : undefined, fontWeight: c.bold?.(row) ? 700 : undefined }}>{c.render ? c.render(row, i) : row[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SeatReport({ label, rows }) {
  const validRows = rows.filter((r) => r);
  const ranking = buildDominanceRanking(rows);
  const summary = buildFinalSummary(rows);
  const [inspectHz, setInspectHz] = useState(TARGET_HZ[0]);
  const inspectRow = validRows.find((r) => r.frequencyHz === inspectHz) || validRows[0] || null;

  return (
    <div style={{ marginBottom: 20, borderBottom: '2px solid #9a3412', paddingBottom: 12 }}>
      <div style={{ fontWeight: 700, color: '#7c2d12', fontSize: 12, fontFamily: 'monospace', marginBottom: 6 }}>{label}</div>

      <div style={sectionTitle}>Magnitudes, ratios &amp; percentages</div>
      <GenericTable
        rowKey={(r) => r.frequencyHz}
        columns={[
          { key: 'hz', label: 'Hz', render: (r) => r.frequencyHz },
          { key: 'direct', label: 'Direct mag', render: (r) => fmt(r.directMag, 4) },
          { key: 'refl', label: 'Reflection mag', render: (r) => fmt(r.reflectionMag, 4) },
          { key: 'modal', label: 'Modal mag', render: (r) => fmt(r.modalMag, 4) },
          { key: 'final', label: 'Final mag', render: (r) => fmt(r.finalMag, 4) },
          { key: 'mOverD', label: 'Modal/Direct', render: (r) => fmt(r.modalOverDirect, 3) },
          { key: 'rOverD', label: 'Refl/Direct', render: (r) => fmt(r.reflectionOverDirect, 3) },
          { key: 'mOverF', label: 'Modal/Final', render: (r) => fmt(r.modalOverFinal, 3) },
          { key: 'rOverF', label: 'Refl/Final', render: (r) => fmt(r.reflectionOverFinal, 3) },
          { key: 'dOverF', label: 'Direct/Final', render: (r) => fmt(r.directOverFinal, 3) },
          { key: 'dPct', label: 'Direct %', render: (r) => fmtPct(r.directPct) },
          { key: 'rPct', label: 'Refl %', render: (r) => fmtPct(r.reflectionPct) },
          { key: 'mPct', label: 'Modal %', render: (r) => fmtPct(r.modalPct), bold: () => true },
        ]}
        rows={validRows}
      />

      <div style={sectionTitle}>Modal dominance ranking (highest → lowest)</div>
      <GenericTable
        rowKey={(r) => r.frequencyHz}
        columns={[
          { key: 'rank', label: '#', render: (_r, i) => i + 1 },
          { key: 'hz', label: 'Hz', render: (r) => r.frequencyHz },
          { key: 'modalPct', label: 'Modal %', render: (r) => fmtPct(r.modalPct), bold: () => true },
        ]}
        rows={ranking}
      />

      <div style={sectionTitle}>Per-mode contribution (before summation) — pick a frequency</div>
      <div style={{ marginBottom: 6 }}>
        <select value={inspectHz} onChange={(e) => setInspectHz(Number(e.target.value))} style={{ height: 22, border: '1px solid #fdba74', borderRadius: 4, fontSize: 10, fontFamily: 'monospace' }}>
          {TARGET_HZ.map((hz) => <option key={hz} value={hz}>{hz} Hz</option>)}
        </select>
      </div>
      {inspectRow && inspectRow.modes.length > 0 ? (
        <GenericTable
          rowKey={(m) => m.key}
          columns={[
            { key: 'mode', label: 'Mode', align: 'left', render: (m) => `(${m.key}) ${m.modeType || ''}` },
            { key: 'modeFreq', label: 'Mode freq (Hz)', render: (m) => fmt(m.modeFrequencyHz, 1) },
            { key: 'transferMag', label: 'Transfer mag', render: (m) => fmt(m.transferMagnitude, 3) },
            { key: 'srcC', label: 'Source coupling', render: (m) => fmt(m.sourceCoupling, 3) },
            { key: 'rcvC', label: 'Receiver coupling', render: (m) => fmt(m.receiverCoupling, 3) },
            { key: 'combined', label: 'Combined modal pressure', render: (m) => fmt(m.combinedModalPressure, 4) },
            { key: 'pct', label: '% of modal field', render: (m) => fmtPct(m.pctOfModalField) },
          ]}
          rows={inspectRow.modes}
        />
      ) : (
        <div style={{ fontSize: 9, color: '#9a3412', fontFamily: 'monospace' }}>No per-mode data at this frequency.</div>
      )}

      <div style={{ border: '2px solid #7c2d12', borderRadius: 6, background: '#fff', padding: '10px 12px', fontSize: 10, fontFamily: 'monospace', color: '#1c1917', marginTop: 8 }}>
        <div style={{ fontWeight: 700, color: '#7c2d12', marginBottom: 6, fontSize: 11 }}>FINAL SUMMARY — {label}</div>
        <div>Average modal/direct ratio: <strong>{fmt(summary.avgModalOverDirect, 3)}</strong></div>
        <div>Average modal/final ratio: <strong>{fmt(summary.avgModalOverFinal, 3)}</strong></div>
        <div>Peak modal contribution: <strong>{fmtPct(summary.peakModalPct)}</strong> @ {summary.peakModalHz ?? '—'} Hz</div>
        <div>Lowest modal contribution: <strong>{fmtPct(summary.lowestModalPct)}</strong> @ {summary.lowestModalHz ?? '—'} Hz</div>
        <div>Average reflection/direct ratio: <strong>{fmt(summary.avgReflectionOverDirect, 3)}</strong></div>
      </div>
    </div>
  );
}

export default function ModalEnergyBudgetAudit({ roomDims, seatingPositions, subsForSimulation, surfaceAbsorption }) {
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);

  const seatMap = buildSeatMap(seatingPositions);
  const source = subsForSimulation?.[0] || null;
  const canRun = !!(roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM && source && Object.keys(seatMap).length > 0);

  const runAudit = useCallback(() => {
    if (!canRun) return;
    setRunning(true);
    const rdims = { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM };
    const seatResults = runModalEnergyBudgetAudit(rdims, seatMap, source, surfaceAbsorption);
    setResult(seatResults);
    setRunning(false);
  }, [canRun, roomDims, surfaceAbsorption, seatMap, source]);

  return (
    <div style={{ border: '2px solid #9a3412', borderRadius: 8, background: '#fff7ed', padding: '10px 12px', marginTop: 8, marginBottom: 8 }}>
      <div style={{ fontWeight: 700, color: '#7c2d12', fontSize: 12, fontFamily: 'monospace', marginBottom: 4 }}>
        Modal Energy Budget Audit
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          temporary diagnostic · measures where final pressure comes from · no physics/graph/coefficient changes
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 9, color: '#6b7280', fontFamily: 'monospace' }}>Seats: R1S1, R1S2, R1S3 · Frequencies: {TARGET_HZ.join(', ')} Hz</span>
        <button onClick={runAudit} disabled={running || !canRun} style={{ height: 26, padding: '0 12px', borderRadius: 6, border: '1px solid #7c2d12', background: running ? '#e5e7eb' : '#7c2d12', color: running ? '#6b7280' : '#fff', fontSize: 10, fontFamily: 'monospace', cursor: running || !canRun ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
          {running ? 'Running…' : 'Run Audit'}
        </button>
        {!canRun && <span style={{ fontSize: 9, color: '#b45309', fontFamily: 'monospace' }}>⚠ Need room, a sub, and at least one Row 1 seat (R1S1–R1S3).</span>}
      </div>

      {result && ['R1S1', 'R1S2', 'R1S3'].map((label) => (
        result[label] ? <SeatReport key={label} label={label} rows={result[label]} /> : (
          <div key={label} style={{ fontSize: 9, fontFamily: 'monospace', color: '#b45309', marginBottom: 8 }}>{label}: not present in current seating layout.</div>
        )
      ))}
    </div>
  );
}