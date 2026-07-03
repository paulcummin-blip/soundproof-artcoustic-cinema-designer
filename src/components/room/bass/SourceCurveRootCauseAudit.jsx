// SourceCurveRootCauseAudit.jsx
// Temporary read-only diagnostic panel — Bass Response page.
// Determines WHY Variant D (REW-like LF source curve) passed parity: isolates
// source curve, transfer magnitude, source coupling, and receiver coupling
// contributions at R1S1–R1S3. No physics/coefficient/graph/project changes.

import React, { useState, useCallback } from 'react';
import {
  runRootCauseAudit,
  buildReductionAttribution,
  buildNormalizedComparison,
  buildFinalVerdict,
  TARGET_HZ,
} from '@/components/room/bass/sourceCurveRootCauseAuditEngine';

function fmt(v, d = 2) { return Number.isFinite(v) ? Number(v).toFixed(d) : '—'; }

function buildSeatMap(seatingPositions) {
  const ordered = [...(seatingPositions || [])].sort((a, b) => (Number(a?.x) || 0) - (Number(b?.x) || 0));
  const row1 = ordered.filter((s) => (Number(s?.row || s?.rowNumber) || 1) === 1);
  const map = {};
  row1.forEach((seat, i) => { const label = `R1S${i + 1}`; if (['R1S1', 'R1S2', 'R1S3'].includes(label)) map[label] = seat; });
  return map;
}

const thS = { textAlign: 'right', padding: '3px 6px', fontSize: 9, fontWeight: 700, background: '#1e3a8a', color: '#eff6ff', whiteSpace: 'nowrap' };
const tdS = { textAlign: 'right', padding: '2px 6px', fontSize: 9, fontFamily: 'monospace' };
const sectionTitle = { fontSize: 11, fontWeight: 700, color: '#1e3a8a', margin: '12px 0 4px', paddingTop: 8, borderTop: '1px solid #bfdbfe' };

function TestTable({ rows, label, key1 }) {
  return (
    <div style={{ overflowX: 'auto', marginBottom: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#1e40af', marginBottom: 3 }}>{label}</div>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 700 }}>
        <thead>
          <tr>{['Hz', 'Final SPL (dB)', 'Modal/Direct', 'Modal %', 'Dominant modes'].map((h) => <th key={h} style={thS}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const t = row[key1];
            const domStr = t.dominantModes.map((m) => `${m.key}@${fmt(m.modeFrequencyHz, 1)}Hz`).join(', ');
            return (
              <tr key={row.frequencyHz} style={{ borderBottom: '1px solid #dbeafe' }}>
                <td style={{ ...tdS, fontWeight: 700, color: '#1e3a8a' }}>{row.frequencyHz}</td>
                <td style={{ ...tdS, fontWeight: 700 }}>{fmt(t.finalDb)}</td>
                <td style={tdS}>{fmt(t.modalOverDirect, 3)}</td>
                <td style={tdS}>{fmt(t.modalPct, 1)}%</td>
                <td style={{ ...tdS, textAlign: 'left', fontSize: 8 }}>{domStr || '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ReductionTable({ attribution }) {
  return (
    <div style={{ overflowX: 'auto', marginBottom: 8 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 700 }}>
        <thead>
          <tr>{['Hz', 'Total reduction (dB)', 'Source curve %', 'Transfer magnitude %', 'Source coupling %', 'Receiver coupling %'].map((h) => <th key={h} style={thS}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {attribution.map((r) => (
            <tr key={r.frequencyHz} style={{ borderBottom: '1px solid #dbeafe' }}>
              <td style={{ ...tdS, fontWeight: 700, color: '#1e3a8a' }}>{r.frequencyHz}</td>
              <td style={{ ...tdS, fontWeight: 700 }}>{fmt(r.totalReductionDb)}</td>
              <td style={{ ...tdS, fontWeight: 700, color: '#166534' }}>{r.sourceCurvePct}%</td>
              <td style={tdS}>{r.transferMagnitudePct}%</td>
              <td style={tdS}>{r.sourceCouplingPct}%</td>
              <td style={tdS}>{r.receiverCouplingPct}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DriveTable({ rows }) {
  return (
    <div style={{ overflowX: 'auto', marginBottom: 8 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 700 }}>
        <thead>
          <tr>{['Hz', 'Source dB (prod)', 'Linear mult (prod)', 'Transfer mag (top mode)', 'Final SPL prod (dB)', 'Final SPL Variant D (dB)'].map((h) => <th key={h} style={thS}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.frequencyHz} style={{ borderBottom: '1px solid #dbeafe' }}>
              <td style={{ ...tdS, fontWeight: 700, color: '#1e3a8a' }}>{row.frequencyHz}</td>
              <td style={tdS}>{fmt(row.prodCurveDb, 1)}</td>
              <td style={tdS}>{fmt(row.linearMultProd, 4)}</td>
              <td style={tdS}>{fmt(row.transferMagTopMode, 3)}</td>
              <td style={{ ...tdS, fontWeight: 700 }}>{fmt(row.production.finalDb)}</td>
              <td style={{ ...tdS, fontWeight: 700 }}>{row.variantDSummary ? fmt(row.variantDSummary.finalDb) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NormalizedTable({ rows }) {
  return (
    <div style={{ overflowX: 'auto', marginBottom: 8 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 700 }}>
        <thead>
          <tr>{['Hz', 'Production dB', 'Variant D raw dB', 'Variant D normalized @57Hz', 'Residual vs production'].map((h) => <th key={h} style={thS}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.frequencyHz} style={{ borderBottom: '1px solid #dbeafe' }}>
              <td style={{ ...tdS, fontWeight: 700, color: '#1e3a8a' }}>{r.frequencyHz}</td>
              <td style={tdS}>{fmt(r.productionDb)}</td>
              <td style={tdS}>{fmt(r.variantDRawDb)}</td>
              <td style={tdS}>{fmt(r.variantDNormalizedDb)}</td>
              <td style={{ ...tdS, fontWeight: 700, color: Math.abs(r.residualDb ?? 0) > 1 ? '#b91c1c' : '#166534' }}>{fmt(r.residualDb)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SourceCurveRootCauseAudit({ roomDims, seatingPositions, subsForSimulation, surfaceAbsorption }) {
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
      out[label] = runRootCauseAudit(rdims, seatPos, source, surfaceAbsorption);
    });
    setResults(out);
    setRunning(false);
  }, [canRun, roomDims, surfaceAbsorption, seatMap, source]);

  const verdict = results ? buildFinalVerdict(Object.values(results)[0]) : null;

  return (
    <div style={{ border: '2px solid #1e3a8a', borderRadius: 8, background: '#eff6ff', padding: '10px 12px', marginTop: 8, marginBottom: 8 }}>
      <div style={{ fontWeight: 700, color: '#1e3a8a', fontSize: 12, fontFamily: 'monospace', marginBottom: 4 }}>
        Source Curve Root Cause Audit
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          temporary diagnostic · why Variant D passes parity · no physics/graph/coefficient changes
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 9, color: '#6b7280', fontFamily: 'monospace' }}>Seats: R1S1–R1S3 · Frequencies: {TARGET_HZ.join(', ')} Hz</span>
        <button onClick={runAudit} disabled={running || !canRun} style={{ height: 26, padding: '0 12px', borderRadius: 6, border: '1px solid #1e3a8a', background: running ? '#e5e7eb' : '#1e3a8a', color: running ? '#6b7280' : '#fff', fontSize: 10, fontFamily: 'monospace', cursor: running || !canRun ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
          {running ? 'Running…' : 'Run Audit'}
        </button>
        {!canRun && <span style={{ fontSize: 9, color: '#b45309', fontFamily: 'monospace' }}>⚠ Need room, a sub, and at least one Row 1 seat (R1S1–R1S3).</span>}
      </div>

      {results && Object.entries(results).map(([label, rows]) => {
        const attribution = buildReductionAttribution(rows);
        const normalized = buildNormalizedComparison(rows);
        return (
          <div key={label} style={{ marginBottom: 20, borderBottom: '2px solid #1e40af', paddingBottom: 12 }}>
            <div style={{ fontWeight: 700, color: '#1e3a8a', fontSize: 12, fontFamily: 'monospace', marginBottom: 6 }}>{label}</div>

            <div style={sectionTitle}>Test 1 — Unity excitation into every mode</div>
            <TestTable rows={rows} label="Unity excitation (source curve disabled for modal path only)" key1="test1" />

            <div style={sectionTitle}>Test 2 — Transfer magnitude disabled</div>
            <TestTable rows={rows} label="Transfer magnitude → 1 (phase preserved)" key1="test2" />

            <div style={sectionTitle}>Test 3 — Source coupling disabled</div>
            <TestTable rows={rows} label="Source coupling → 1" key1="test3" />

            <div style={sectionTitle}>Test 4 — Receiver coupling disabled</div>
            <TestTable rows={rows} label="Receiver coupling → 1" key1="test4" />

            <div style={sectionTitle}>Test 5 — Reduction attribution (Variant D vs production)</div>
            <div style={{ fontSize: 9, color: '#374151', marginBottom: 4, fontStyle: 'italic' }}>
              Variant D only substitutes the source curve — transfer magnitude, source coupling, and receiver coupling
              formulas are identical between production and Variant D runs, so the measured reduction is attributable
              entirely to the source curve difference.
            </div>
            <ReductionTable attribution={attribution} />

            <div style={sectionTitle}>Test 6 — Effective acoustic drive</div>
            <DriveTable rows={rows} />

            <div style={sectionTitle}>Test 7 — Variant D normalized to match production at 57 Hz</div>
            {normalized ? <NormalizedTable rows={normalized} /> : <div style={{ fontSize: 9, color: '#b45309' }}>No 57 Hz data available.</div>}
          </div>
        );
      })}

      {verdict && (
        <div style={{ border: '2px solid #1e3a8a', borderRadius: 6, background: '#fff', padding: '10px 12px', fontSize: 10, fontFamily: 'monospace', color: '#1c1917' }}>
          <div style={{ fontWeight: 700, color: '#1e3a8a', marginBottom: 6, fontSize: 11 }}>FINAL — Likelihood ranking (measurement only, no fix recommended)</div>
          {verdict.map((v) => (
            <div key={v.option} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderBottom: '1px solid #dbeafe' }}>
              <span><strong>{v.option}.</strong> {v.label}</span>
              <span style={{ fontWeight: 700 }}>{v.confidence}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}