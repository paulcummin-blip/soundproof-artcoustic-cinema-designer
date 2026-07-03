// QTransferResolutionAudit.jsx
// Temporary read-only diagnostic panel — Bass Response page.
// Tests whether Q/bandwidth resolution (not coupling/weighting/SPL) explains the fast
// 30–50 Hz recovery, by substituting 12 Q/bandwidth strategies into an isolated copy of
// the transfer + field summation. No production graph/engine/project changes.

import React, { useState, useCallback } from 'react';
import { getSubwooferCurve } from '@/components/models/speakers/registry';
import { runQTransferAudit, buildRanking, buildConclusion, TARGET_SPL_FREQS } from '@/components/room/bass/qTransferResolutionAuditEngine';

function fmt(v, d = 2) { return Number.isFinite(v) ? Number(v).toFixed(d) : '—'; }
function fmtSigned(v, d = 2) { return Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(d)}` : '—'; }
function fmtPct(v, d = 1) { return Number.isFinite(v) ? `${v.toFixed(d)}%` : '—'; }

function buildSeatLabels(seatingPositions) {
  const ordered = [...(seatingPositions || [])].sort((a, b) => {
    const ra = Number(a?.row || a?.rowNumber) || 1, rb = Number(b?.row || b?.rowNumber) || 1;
    if (ra !== rb) return ra - rb;
    return (Number(a?.x) || 0) - (Number(b?.x) || 0);
  });
  return ordered.map((seat) => {
    const sid = seat.id || `${seat.x}-${seat.y}`;
    const rowNum = Number(seat?.row || seat?.rowNumber) || 1;
    const rowSeats = ordered.filter((s) => (Number(s?.row || s?.rowNumber) || 1) === rowNum);
    const posInRow = rowSeats.findIndex((s) => (s.id || `${s.x}-${s.y}`) === sid) + 1;
    return { id: sid, label: `R${rowNum}S${posInRow}`, seat };
  });
}

const thS = { textAlign: 'right', padding: '3px 6px', fontSize: 9, fontWeight: 700, background: '#581c87', color: '#f3e8ff', whiteSpace: 'nowrap' };
const tdS = { textAlign: 'right', padding: '2px 6px', fontSize: 9, fontFamily: 'monospace' };
const sectionTitle = { fontSize: 11, fontWeight: 700, color: '#581c87', margin: '14px 0 4px', paddingTop: 8, borderTop: '1px solid #e9d5ff' };

function GenericTable({ columns, rows, rowKey }) {
  return (
    <div style={{ overflowX: 'auto', marginBottom: 8 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 600 }}>
        <thead><tr>{columns.map((c) => <th key={c.key} style={{ ...thS, textAlign: c.align || 'right' }}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={rowKey ? rowKey(row) : i} style={{ borderBottom: '1px solid #e9d5ff' }}>
              {columns.map((c) => <td key={c.key} style={{ ...tdS, textAlign: c.align || 'right', color: c.color ? c.color(row) : undefined, fontWeight: c.bold?.(row) ? 700 : undefined }}>{c.render ? c.render(row, i) : row[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function QTransferResolutionAudit({ roomDims, seatingPositions, subsForSimulation, surfaceAbsorption }) {
  const seatLabels = buildSeatLabels(seatingPositions);
  const defaultSeatId = seatLabels.find((s) => s.label === 'R1S2')?.id || seatLabels[0]?.id || null;
  const [selectedSeatId, setSelectedSeatId] = useState(defaultSeatId);
  const [perModeInspectVariantId, setPerModeInspectVariantId] = useState('1');
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);

  const effectiveSeatId = selectedSeatId || defaultSeatId;
  const seat = seatLabels.find((s) => s.id === effectiveSeatId)?.seat || null;
  const source = subsForSimulation?.[0] || null;
  const curve = source ? getSubwooferCurve(source.modelKey) : null;
  const canRun = !!(roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM && seat && source && curve);

  const runAudit = useCallback(() => {
    if (!canRun) return;
    setRunning(true);
    const seatPos = { x: seat.x, y: seat.y, z: Number.isFinite(Number(seat.z)) ? Number(seat.z) : 1.2 };
    const sourcePos = { x: source.x, y: source.y, z: Number.isFinite(Number(source.z)) ? Number(source.z) : 0.35, tuning: source.tuning };
    const rdims = { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM };
    const audit = runQTransferAudit(rdims, seatPos, sourcePos, curve, surfaceAbsorption);
    const ranked = buildRanking(audit.results);
    const conclusion = buildConclusion(ranked);
    setResult({ ...audit, ranked, conclusion });
    setRunning(false);
  }, [canRun, roomDims, surfaceAbsorption, seat, source, curve]);

  const inspectedResult = result?.results.find((r) => r.id === perModeInspectVariantId) || null;

  return (
    <div style={{ border: '2px solid #6b21a8', borderRadius: 8, background: '#faf5ff', padding: '10px 12px', marginTop: 8, marginBottom: 8 }}>
      <div style={{ fontWeight: 700, color: '#581c87', fontSize: 12, fontFamily: 'monospace', marginBottom: 4 }}>
        Q And Transfer Resolution Audit
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          temporary diagnostic · 12 Q/bandwidth strategies vs production · no physics/graph/project changes
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'monospace', color: '#6b21a8' }}>
          Seat:
          <select value={effectiveSeatId || ''} onChange={(e) => setSelectedSeatId(e.target.value)} style={{ height: 24, border: '1px solid #d8b4fe', borderRadius: 4, padding: '0 6px', fontSize: 10, fontFamily: 'monospace' }}>
            {seatLabels.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <span style={{ fontSize: 9, color: '#6b7280', fontFamily: 'monospace' }}>Range 20–80Hz · Step 0.25Hz (fixed per spec)</span>
        <button onClick={runAudit} disabled={running || !canRun} style={{ height: 26, padding: '0 12px', borderRadius: 6, border: '1px solid #581c87', background: running ? '#e5e7eb' : '#581c87', color: running ? '#6b7280' : '#fff', fontSize: 10, fontFamily: 'monospace', cursor: running || !canRun ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
          {running ? 'Running…' : 'Run Audit'}
        </button>
        {!canRun && <span style={{ fontSize: 9, color: '#b45309', fontFamily: 'monospace' }}>⚠ Need room, seat and sub with a product curve.</span>}
      </div>

      {result && (
        <>
          {/* ── SPL deltas per test ── */}
          <div style={sectionTitle}>SPL delta vs production at target frequencies</div>
          <GenericTable
            rowKey={(r) => r.id}
            columns={[
              { key: 'id', label: 'Test', align: 'left', render: (r) => `${r.id}. ${r.label}` },
              ...TARGET_SPL_FREQS.map((tf) => ({ key: `d${tf}`, label: `${tf}Hz Δ`, render: (r) => fmtSigned(r.deltas[tf], 2) })),
              { key: 'pass', label: 'Pass?', color: (r) => r.pass ? '#166534' : '#dc2626', bold: () => true, render: (r) => r.id === '1' ? '—' : (r.pass ? '✓ PASS' : '✗ fail') },
            ]}
            rows={result.results}
          />

          {/* ── Collapse test ── */}
          <div style={sectionTitle}>Collapse test — Δf / bandwidth</div>
          <GenericTable
            rowKey={(r) => r.id}
            columns={[
              { key: 'id', label: 'Test', align: 'left', render: (r) => `${r.id}. ${r.label}` },
              { key: 'before', label: 'Collapse error before', render: (r) => fmt(r.collapseErrorBefore, 4) },
              { key: 'after', label: 'Collapse error after', render: (r) => fmt(r.collapseErrorAfter, 4) },
              { key: 'improve', label: 'Improvement %', render: (r) => fmtPct(r.collapseImprovementPct) },
            ]}
            rows={result.results}
          />

          {/* ── Per-mode detail: Q, bandwidth, low-side metrics ── */}
          <div style={sectionTitle}>Per-mode Q / bandwidth / low-side tail — pick a test to inspect</div>
          <div style={{ marginBottom: 6 }}>
            <select value={perModeInspectVariantId} onChange={(e) => setPerModeInspectVariantId(e.target.value)} style={{ height: 22, border: '1px solid #d8b4fe', borderRadius: 4, fontSize: 10, fontFamily: 'monospace' }}>
              {result.results.map((r) => <option key={r.id} value={r.id}>{r.id}. {r.label}</option>)}
            </select>
          </div>
          {inspectedResult && (
            <GenericTable
              rowKey={(r) => r.key}
              columns={[
                { key: 'key', label: 'Mode', align: 'left', render: (r) => `(${r.key})` },
                { key: 'q', label: 'Effective Q', render: (r) => fmt(r.qValue, 2) },
                { key: 'bw', label: 'Effective BW (Hz)', render: (r) => fmt(r.bandwidthHz, 2) },
                { key: 'bw3', label: 'Low-side -3dB BW', render: (r) => r.lowSideMinus3 !== null ? fmt(r.lowSideMinus3, 2) : '—' },
                { key: 'bw6', label: 'Low-side -6dB BW', render: (r) => r.lowSideMinus6 !== null ? fmt(r.lowSideMinus6, 2) : '—' },
                { key: 't10', label: 'Tail @ -10Hz (dB)', render: (r) => r.tailAtMinus10 !== null ? fmt(r.tailAtMinus10, 1) : '—' },
                { key: 't20', label: 'Tail @ -20Hz (dB)', render: (r) => r.tailAtMinus20 !== null ? fmt(r.tailAtMinus20, 1) : '—' },
                { key: 't30', label: 'Tail @ -30Hz (dB)', render: (r) => r.tailAtMinus30 !== null ? fmt(r.tailAtMinus30, 1) : '—' },
              ]}
              rows={inspectedResult.perMode}
            />
          )}

          {/* ── Automatic ranking ── */}
          <div style={sectionTitle}>Automatic ranking (production baseline excluded)</div>
          <GenericTable
            rowKey={(r) => r.id}
            columns={[
              { key: 'rank', label: '#', render: (_r, i) => i + 1 },
              { key: 'id', label: 'Test', align: 'left', render: (r) => `${r.id}. ${r.label}` },
              { key: 'recovery', label: '35–45Hz reduction', render: (r) => fmt(r.recoveryReduction, 2) + ' dB' },
              { key: 'collapse', label: 'Collapse improvement', render: (r) => fmtPct(r.collapseImprovementPct) },
              { key: 'pass', label: 'Pass?', color: (r) => r.pass ? '#166534' : '#dc2626', bold: () => true, render: (r) => r.pass ? '✓' : '✗' },
              { key: 'collateral', label: 'Collateral damage', render: (r) => fmt(r.collateralDamage, 2) },
            ]}
            rows={result.ranked}
          />

          {/* ── Final output ── */}
          <div style={{ border: '2px solid #581c87', borderRadius: 6, background: '#fff', padding: '10px 12px', fontSize: 10, fontFamily: 'monospace', color: '#1c1917', marginTop: 8 }}>
            <div style={{ fontWeight: 700, color: '#581c87', marginBottom: 8, fontSize: 12 }}>Q / TRANSFER RESOLUTION RESULT:</div>
            {result.conclusion.hasCandidate ? (
              <>
                <div>Best candidate: <strong style={{ color: '#dc2626' }}>{result.conclusion.bestCandidate}</strong></div>
                <div>Scope: <strong>{result.conclusion.scope}</strong></div>
                <div>30 Hz delta: <strong>{fmtSigned(result.conclusion.deltas[30])}</strong></div>
                <div>35 Hz delta: <strong>{fmtSigned(result.conclusion.deltas[35])}</strong></div>
                <div>40 Hz delta: <strong>{fmtSigned(result.conclusion.deltas[40])}</strong></div>
                <div>45 Hz delta: <strong>{fmtSigned(result.conclusion.deltas[45])}</strong></div>
                <div>50 Hz delta: <strong>{fmtSigned(result.conclusion.deltas[50])}</strong></div>
                <div>57 Hz delta: <strong>{fmtSigned(result.conclusion.deltas[57])}</strong></div>
                <div>58 Hz delta: <strong>{fmtSigned(result.conclusion.deltas[58])}</strong></div>
                <div>Collapse improvement: <strong>{fmtPct(result.conclusion.collapseImprovementPct)}</strong></div>
                <div>Confidence: <strong>{result.conclusion.confidence}</strong></div>
              </>
            ) : (
              <>
                <div style={{ color: '#b91c1c', fontWeight: 700 }}>NO Q OR BANDWIDTH FORMULATION EXPLAINS THE GAP.</div>
                <div>Next target: <strong>{result.conclusion.nextTarget}</strong></div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}