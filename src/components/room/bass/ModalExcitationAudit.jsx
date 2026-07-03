// ModalExcitationAudit.jsx
// Temporary read-only diagnostic panel — Bass Response page.
// Purpose: determine whether the production engine generates correct complex modal pressure
// BEFORE resonantTransfer() is applied, by printing every excitation stage (source coupling,
// receiver coupling, combined excitation, distance term, modal gain, radiation/source curve,
// pre/post-transfer complex pressure) for 6 tracked modes at 10 target frequencies.
// No production/graph/physics changes — measurements only.

import React, { useState, useCallback } from 'react';
import { getSubwooferCurve } from '@/components/models/speakers/registry';
import { runModalExcitationAudit, TARGET_FREQS } from '@/components/room/bass/modalExcitationAuditEngine';

function fmt(v, d = 4) { return Number.isFinite(v) ? Number(v).toFixed(d) : '—'; }
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

const thS = { textAlign: 'right', padding: '3px 6px', fontSize: 9, fontWeight: 700, background: '#1e3a8a', color: '#dbeafe', whiteSpace: 'nowrap' };
const tdS = { textAlign: 'right', padding: '2px 6px', fontSize: 9, fontFamily: 'monospace' };
const sectionTitle = { fontSize: 11, fontWeight: 700, color: '#1e3a8a', margin: '14px 0 4px', paddingTop: 8, borderTop: '1px solid #bfdbfe' };

function GenericTable({ columns, rows, rowKey, minWidth }) {
  return (
    <div style={{ overflowX: 'auto', marginBottom: 8 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: minWidth || 600 }}>
        <thead><tr>{columns.map((c) => <th key={c.key} style={{ ...thS, textAlign: c.align || 'right' }}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={rowKey ? rowKey(row) : i} style={{ borderBottom: '1px solid #bfdbfe' }}>
              {columns.map((c) => <td key={c.key} style={{ ...tdS, textAlign: c.align || 'right' }}>{c.render ? c.render(row, i) : row[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ModalExcitationAudit({ roomDims, seatingPositions, subsForSimulation, surfaceAbsorption }) {
  const seatLabels = buildSeatLabels(seatingPositions);
  const defaultSeatId = seatLabels.find((s) => s.label === 'R1S2')?.id || seatLabels[0]?.id || null;
  const [selectedSeatId, setSelectedSeatId] = useState(defaultSeatId);
  const [inspectModeKey, setInspectModeKey] = useState('0,1,0');
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
    const audit = runModalExcitationAudit(rdims, seatPos, sourcePos, curve, surfaceAbsorption);
    setResult(audit);
    setRunning(false);
  }, [canRun, roomDims, surfaceAbsorption, seat, source, curve]);

  const inspected = result?.table.find((t) => t.mode.key === inspectModeKey) || null;

  return (
    <div style={{ border: '2px solid #1e3a8a', borderRadius: 8, background: '#eff6ff', padding: '10px 12px', marginTop: 8, marginBottom: 8 }}>
      <div style={{ fontWeight: 700, color: '#1e3a8a', fontSize: 12, fontFamily: 'monospace', marginBottom: 4 }}>
        Modal Excitation Audit
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          temporary diagnostic · stages before/after resonantTransfer() · no physics/graph changes
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'monospace', color: '#1e3a8a' }}>
          Seat:
          <select value={effectiveSeatId || ''} onChange={(e) => setSelectedSeatId(e.target.value)} style={{ height: 24, border: '1px solid #93c5fd', borderRadius: 4, padding: '0 6px', fontSize: 10, fontFamily: 'monospace' }}>
            {seatLabels.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <button onClick={runAudit} disabled={running || !canRun} style={{ height: 26, padding: '0 12px', borderRadius: 6, border: '1px solid #1e3a8a', background: running ? '#e5e7eb' : '#1e3a8a', color: running ? '#6b7280' : '#fff', fontSize: 10, fontFamily: 'monospace', cursor: running || !canRun ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
          {running ? 'Running…' : 'Run Audit'}
        </button>
        {!canRun && <span style={{ fontSize: 9, color: '#b45309', fontFamily: 'monospace' }}>⚠ Need room, seat and sub with a product curve.</span>}
      </div>

      {result && (
        <>
          {/* ── Per-mode stage breakdown ── */}
          <div style={sectionTitle}>Per-mode stage breakdown — pick a mode to inspect</div>
          <div style={{ marginBottom: 6 }}>
            <select value={inspectModeKey} onChange={(e) => setInspectModeKey(e.target.value)} style={{ height: 22, border: '1px solid #93c5fd', borderRadius: 4, fontSize: 10, fontFamily: 'monospace' }}>
              {result.table.map((t) => <option key={t.mode.key} value={t.mode.key}>({t.mode.key}) {t.mode.family} @ {fmt(t.mode.modeFrequencyHz, 1)}Hz, Q={fmt(t.mode.qValue, 2)}</option>)}
            </select>
          </div>
          {inspected && (
            <GenericTable
              minWidth={1500}
              rowKey={(r) => r.frequencyHz}
              columns={[
                { key: 'freq', label: 'Hz', align: 'left', render: (r) => r.frequencyHz },
                { key: 's1', label: 'S1 Source coupling', render: (r) => fmt(r.stage1) },
                { key: 's2', label: 'S2 Receiver coupling', render: (r) => fmt(r.stage2) },
                { key: 's3', label: 'S3 Combined', render: (r) => fmt(r.stage3) },
                { key: 's4', label: 'S4 Distance term', render: (r) => fmt(r.stage4) },
                { key: 's5', label: 'S5 Modal gain', render: (r) => fmt(r.stage5) },
                { key: 's6', label: 'S6 Curve amp', render: (r) => fmt(r.stage6) },
                { key: 's7re', label: 'S7 Pre-XF Re', render: (r) => fmt(r.stage7.re) },
                { key: 's7im', label: 'S7 Pre-XF Im', render: (r) => fmt(r.stage7.im) },
                { key: 's7mag', label: 'S7 Pre-XF Mag', render: (r) => fmt(r.stage7.mag) },
                { key: 's8re', label: 'S8 Post-XF Re', render: (r) => fmt(r.stage8.re) },
                { key: 's8im', label: 'S8 Post-XF Im', render: (r) => fmt(r.stage8.im) },
                { key: 's8mag', label: 'S8 Post-XF Mag', render: (r) => fmt(r.stage8.mag) },
                { key: 's8phase', label: 'S8 Phase°', render: (r) => fmt(r.stage8.phaseDeg, 1) },
                { key: 'recon', label: 'Recon check', render: (r) => r.reconReconciles === null ? '—' : (r.reconReconciles ? '✓' : '✗') },
              ]}
              rows={inspected.rows}
            />
          )}

          <div style={{ fontSize: 10, fontWeight: 700, color: '#1e3a8a', margin: '10px 0 4px' }}>Relative contribution (% of final production pressure)</div>
          {inspected && (
            <GenericTable
              minWidth={1100}
              rowKey={(r) => r.frequencyHz}
              columns={[
                { key: 'freq', label: 'Hz', align: 'left', render: (r) => r.frequencyHz },
                { key: 'p1', label: '% S1', render: (r) => fmtPct(r.pctStage1) },
                { key: 'p2', label: '% S2', render: (r) => fmtPct(r.pctStage2) },
                { key: 'p3', label: '% S3', render: (r) => fmtPct(r.pctStage3) },
                { key: 'p4', label: '% S4', render: (r) => fmtPct(r.pctStage4) },
                { key: 'p5', label: '% S5', render: (r) => fmtPct(r.pctStage5) },
                { key: 'p6', label: '% S6', render: (r) => fmtPct(r.pctStage6) },
                { key: 'p7', label: '% S7', render: (r) => fmtPct(r.pctStage7) },
                { key: 'p8', label: '% S8', render: (r) => fmtPct(r.pctStage8) },
              ]}
              rows={inspected.rows}
            />
          )}

          {/* ── Normalisation test ── */}
          <div style={sectionTitle}>Normalisation test — does (0,2,0) collapse onto (0,1,0) below resonance?</div>
          <GenericTable
            minWidth={900}
            rowKey={(r) => r.frequencyHz}
            columns={[
              { key: 'freq', label: 'Hz', align: 'left', render: (r) => r.frequencyHz },
              { key: 'below', label: 'Below (0,2,0) resonance?', render: (r) => r.belowResonance ? 'yes' : 'no' },
              { key: 'shapeMax', label: '÷ shape max', color: () => '#1e3a8a', render: (r) => r.collapseByShapeMax === null ? '—' : (r.collapseByShapeMax ? 'COLLAPSES' : 'no collapse') },
              { key: 'srcOnly', label: '÷ source only', render: (r) => r.collapseBySourceOnly === null ? '—' : (r.collapseBySourceOnly ? 'COLLAPSES' : 'no collapse') },
              { key: 'recOnly', label: '÷ receiver only', render: (r) => r.collapseByReceiverOnly === null ? '—' : (r.collapseByReceiverOnly ? 'COLLAPSES' : 'no collapse') },
              { key: 'srcRec', label: '÷ source×receiver', render: (r) => r.collapseBySourceTimesReceiver === null ? '—' : (r.collapseBySourceTimesReceiver ? 'COLLAPSES' : 'no collapse') },
            ]}
            rows={result.normalisation}
          />

          {/* ── Family test ── */}
          <div style={sectionTitle}>Family test — average combined excitation by family</div>
          <GenericTable
            rowKey={(r) => r.family}
            columns={[
              { key: 'family', label: 'Family', align: 'left' },
              { key: 'modes', label: 'Tracked modes', align: 'left', render: (r) => r.modeKeys.length ? r.modeKeys.map((k) => `(${k})`).join(', ') : '— none tracked —' },
              { key: 'avg', label: 'Avg excitation', render: (r) => r.hasData ? fmt(r.avgExcitation) : 'N/A' },
            ]}
            rows={result.familyTest}
          />

          {/* ── Automatic ranking ── */}
          <div style={sectionTitle}>Automatic ranking — stages by explaining 30–40Hz excess (dominant mode 0,1,0)</div>
          <GenericTable
            rowKey={(r) => r.stage}
            columns={[
              { key: 'rank', label: '#', render: (_r, i) => i + 1 },
              { key: 'stage', label: 'Stage' },
              { key: 'at295', label: '% @ 29.5Hz', render: (r) => fmtPct(r.pctAt29_5) },
              { key: 'at40', label: '% @ 40Hz', render: (r) => fmtPct(r.pctAt40) },
              { key: 'growth', label: 'Growth (pp)', render: (r) => fmtPct(r.growth) },
            ]}
            rows={result.stageRanking}
          />

          {/* ── Final result ── */}
          <div style={{ border: '2px solid #1e3a8a', borderRadius: 6, background: '#fff', padding: '10px 12px', fontSize: 10, fontFamily: 'monospace', color: '#1c1917', marginTop: 8 }}>
            <div style={{ fontWeight: 700, color: '#1e3a8a', marginBottom: 8, fontSize: 12 }}>MODAL EXCITATION RESULT:</div>
            {result.hasExplanation ? (
              <>
                <div>Largest unexplained jump: <strong style={{ color: '#dc2626' }}>Stage {result.largestJump.fromStage} → Stage {result.largestJump.toStage}</strong> ({result.largestJump.label})</div>
                <div>Magnitude: <strong>{fmt(result.largestJump.jumpDb, 2)} dB</strong></div>
                <div>Confidence: <strong>{Math.abs(result.largestJump.jumpDb) > 12 ? 'High' : 'Medium'}</strong></div>
              </>
            ) : (
              <div style={{ color: '#b91c1c', fontWeight: 700 }}>
                The discrepancy originates before modal excitation is finalised. Remaining candidates are modal source formulation, Green's function implementation, or boundary-condition mathematics rather than transfer, Q, scaling or summation.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}