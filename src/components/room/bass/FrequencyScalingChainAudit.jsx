// FrequencyScalingChainAudit.jsx
// Temporary read-only diagnostic panel — Bass Response page.
// Traces the full per-mode multiplier chain (transfer → Q → coupling → source amplitude →
// diagnostic scales → final) and runs isolated disable tests (A–J) to find which
// frequency-dependent multiplier explains the fast 30–50 Hz recovery. No production
// graph/engine/project changes — measurements only.

import React, { useState, useCallback } from 'react';
import { getSubwooferCurve } from '@/components/models/speakers/registry';
import {
  buildModes, buildChainSweep, runDisableTests, buildRanking, buildConclusion, TARGET_SPL_FREQS,
} from '@/components/room/bass/frequencyScalingChainAuditEngine';

const MODE_COLORS = { '0,1,0': '#0891b2', '0,2,0': '#dc2626', '0,3,0': '#7c3aed', '0,4,0': '#ea580c', '2,0,0': '#16a34a', '2,2,0': '#a16207' };

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

const thS = { textAlign: 'right', padding: '3px 6px', fontSize: 9, fontWeight: 700, background: '#164e63', color: '#cffafe', whiteSpace: 'nowrap' };
const tdS = { textAlign: 'right', padding: '2px 6px', fontSize: 9, fontFamily: 'monospace' };
const sectionTitle = { fontSize: 11, fontWeight: 700, color: '#164e63', margin: '14px 0 4px', paddingTop: 8, borderTop: '1px solid #a5f3fc' };

function GenericTable({ columns, rows, rowKey }) {
  return (
    <div style={{ overflowX: 'auto', marginBottom: 8 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 600 }}>
        <thead><tr>{columns.map((c) => <th key={c.key} style={{ ...thS, textAlign: c.align || 'right' }}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={rowKey ? rowKey(row) : i} style={{ borderBottom: '1px solid #cffafe' }}>
              {columns.map((c) => <td key={c.key} style={{ ...tdS, textAlign: c.align || 'right', color: c.color ? c.color(row) : undefined, fontWeight: c.bold?.(row) ? 700 : undefined }}>{c.render ? c.render(row) : row[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function FrequencyScalingChainAudit({ roomDims, seatingPositions, subsForSimulation, surfaceAbsorption }) {
  const seatLabels = buildSeatLabels(seatingPositions);
  const defaultSeatId = seatLabels.find((s) => s.label === 'R1S2')?.id || seatLabels[0]?.id || null;
  const [selectedSeatId, setSelectedSeatId] = useState(defaultSeatId);
  const [freqStart, setFreqStart] = useState(20);
  const [freqEnd, setFreqEnd] = useState(80);
  const [step, setStep] = useState(1);
  const [chainInspectFreq, setChainInspectFreq] = useState(40);
  const [chainInspectModeKey, setChainInspectModeKey] = useState('0,2,0');
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

    const modes = buildModes(rdims, surfaceAbsorption);
    const chainSweep = buildChainSweep(modes, rdims, seatPos, sourcePos, curve, freqStart, freqEnd, step);
    const disableResults = runDisableTests(modes, rdims, seatPos, sourcePos, curve);
    const ranked = buildRanking(disableResults);
    const conclusion = buildConclusion(ranked);

    setResult({ modes, chainSweep, disableResults, ranked, conclusion });
    setRunning(false);
  }, [canRun, freqStart, freqEnd, step, roomDims, surfaceAbsorption, seat, source, curve]);

  const inspectedRow = result ? result.chainSweep.reduce((best, r) => (!best || Math.abs(r.frequencyHz - chainInspectFreq) < Math.abs(best.frequencyHz - chainInspectFreq) ? r : best), null) : null;
  const inspectedChain = inspectedRow?.perMode?.[chainInspectModeKey]?.stages || null;

  return (
    <div style={{ border: '2px solid #0e7490', borderRadius: 8, background: '#ecfeff', padding: '10px 12px', marginTop: 8, marginBottom: 8 }}>
      <div style={{ fontWeight: 700, color: '#164e63', fontSize: 12, fontFamily: 'monospace', marginBottom: 4 }}>
        Frequency Scaling Chain Audit
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          temporary diagnostic · full multiplier-chain trace + disable tests · no physics/graph/project changes
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'monospace', color: '#0e7490' }}>
          Seat:
          <select value={effectiveSeatId || ''} onChange={(e) => setSelectedSeatId(e.target.value)} style={{ height: 24, border: '1px solid #67e8f9', borderRadius: 4, padding: '0 6px', fontSize: 10, fontFamily: 'monospace' }}>
            {seatLabels.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'monospace', color: '#0e7490' }}>
          Range (Hz):
          <input type="number" value={freqStart} onChange={(e) => setFreqStart(parseFloat(e.target.value) || 20)} style={{ width: 55, height: 24, border: '1px solid #67e8f9', borderRadius: 4, padding: '0 6px', fontSize: 10, fontFamily: 'monospace' }} />
          –
          <input type="number" value={freqEnd} onChange={(e) => setFreqEnd(parseFloat(e.target.value) || 80)} style={{ width: 55, height: 24, border: '1px solid #67e8f9', borderRadius: 4, padding: '0 6px', fontSize: 10, fontFamily: 'monospace' }} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'monospace', color: '#0e7490' }}>
          Step (Hz):
          <input type="number" step="0.5" value={step} onChange={(e) => setStep(Math.max(0.1, parseFloat(e.target.value) || 1))} style={{ width: 50, height: 24, border: '1px solid #67e8f9', borderRadius: 4, padding: '0 6px', fontSize: 10, fontFamily: 'monospace' }} />
        </label>
        <button onClick={runAudit} disabled={running || !canRun} style={{ height: 26, padding: '0 12px', borderRadius: 6, border: '1px solid #164e63', background: running ? '#e5e7eb' : '#164e63', color: running ? '#6b7280' : '#fff', fontSize: 10, fontFamily: 'monospace', cursor: running || !canRun ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
          {running ? 'Running…' : 'Run Audit'}
        </button>
        {!canRun && <span style={{ fontSize: 9, color: '#b45309', fontFamily: 'monospace' }}>⚠ Need room, seat and sub with a product curve.</span>}
      </div>

      {result && (
        <>
          {/* ── Chain inspector — pick mode + freq to see all 16 stages ── */}
          <div style={sectionTitle}>Full multiplier chain — pick mode &amp; frequency to inspect</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'monospace', color: '#0e7490' }}>
              Mode:
              <select value={chainInspectModeKey} onChange={(e) => setChainInspectModeKey(e.target.value)} style={{ height: 22, border: '1px solid #67e8f9', borderRadius: 4, fontSize: 10, fontFamily: 'monospace' }}>
                {result.modes.map((m) => <option key={m.key} value={m.key}>({m.key})</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'monospace', color: '#0e7490' }}>
              Freq (Hz):
              <input type="number" value={chainInspectFreq} onChange={(e) => setChainInspectFreq(parseFloat(e.target.value) || 40)} style={{ width: 55, height: 22, border: '1px solid #67e8f9', borderRadius: 4, padding: '0 6px', fontSize: 10, fontFamily: 'monospace' }} />
            </label>
          </div>
          {inspectedChain ? (
            <GenericTable
              rowKey={(r) => r.name}
              columns={[
                { key: 'name', label: 'Stage', align: 'left' },
                { key: 'before', label: 'Before', render: (r) => fmt(r.valueBefore, 4) },
                { key: 'mult', label: 'Multiplier', render: (r) => fmt(r.multiplier, 4) },
                { key: 'after', label: 'After', render: (r) => fmt(r.valueAfter, 4) },
                { key: 'pct', label: '% change', render: (r) => r.pctChange !== null ? fmtSigned(r.pctChange, 1) + '%' : '—' },
                { key: 'freqDep', label: 'Freq-dep?', color: (r) => r.freqDependent ? '#dc2626' : '#166534', bold: () => true, render: (r) => r.freqDependent ? 'YES' : 'no' },
                { key: 'note', label: 'Note', align: 'left', render: (r) => r.note },
              ]}
              rows={inspectedChain}
            />
          ) : <div style={{ fontSize: 10, color: '#6b7280' }}>No data at this frequency — outside sweep range.</div>}

          {/* ── Disable tests A–J ── */}
          <div style={sectionTitle}>Automatic disable tests (A–J) — SPL delta vs production-default baseline</div>
          <GenericTable
            rowKey={(r) => r.id}
            columns={[
              { key: 'id', label: 'Test', align: 'left', render: (r) => `${r.id}. ${r.label}` },
              ...TARGET_SPL_FREQS.map((tf) => ({ key: `d${tf}`, label: `${tf}Hz Δ`, render: (r) => fmtSigned(r.deltas[tf], 2) })),
              { key: 'pass', label: 'Pass?', color: (r) => r.pass ? '#166534' : '#dc2626', bold: () => true, render: (r) => r.pass ? '✓ PASS' : '✗ fail' },
            ]}
            rows={result.disableResults}
          />

          {/* ── Collapse test ── */}
          <div style={sectionTitle}>Collapse test — bandwidth-normalised offset Δf/(f₀/Q)</div>
          <div style={{ fontSize: 9, color: '#0e7490', marginBottom: 4, fontFamily: 'monospace' }}>
            Collapse error depends only on Q and the transfer function — none of tests A–J alter either, so collapse error is expected to be unchanged across all of them (confirms these multipliers are amplitude-domain only, not shape-domain).
          </div>
          <GenericTable
            rowKey={(r) => r.id}
            columns={[
              { key: 'id', label: 'Test', align: 'left', render: (r) => `${r.id}. ${r.label}` },
              { key: 'before', label: 'Collapse error before', render: (r) => fmt(r.collapseErrorBefore, 4) },
              { key: 'after', label: 'Collapse error after', render: (r) => fmt(r.collapseErrorAfter, 4) },
              { key: 'improve', label: 'Improvement %', render: (r) => fmtPct(r.collapseImprovementPct) },
            ]}
            rows={result.disableResults}
          />

          {/* ── Automatic ranking ── */}
          <div style={sectionTitle}>Automatic ranking</div>
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
            rows={result.ranked.map((r, i) => ({ ...r, __idx: i }))}
          />

          {/* ── Final output ── */}
          <div style={{ border: '2px solid #164e63', borderRadius: 6, background: '#fff', padding: '10px 12px', fontSize: 10, fontFamily: 'monospace', color: '#1c1917', marginTop: 8 }}>
            <div style={{ fontWeight: 700, color: '#164e63', marginBottom: 8, fontSize: 12 }}>FREQUENCY SCALING CHAIN RESULT:</div>
            {result.conclusion.hasCulprit ? (
              <>
                <div>Culprit multiplier: <strong style={{ color: '#dc2626' }}>{result.conclusion.culprit}</strong></div>
                <div>Evidence: <strong>{result.conclusion.evidence}</strong></div>
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
                <div style={{ color: '#b91c1c', fontWeight: 700 }}>NO FREQUENCY MULTIPLIER EXPLAINS THE GAP.</div>
                <div>Remaining likely cause: <strong>{result.conclusion.remainingLikelyCause}</strong></div>
                <div>Next audit target: <strong>{result.conclusion.nextAuditTarget}</strong></div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}