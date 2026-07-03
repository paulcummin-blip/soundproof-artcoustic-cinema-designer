// IsolatedModalTransferRootCauseAudit.jsx
// Temporary read-only diagnostic panel — Bass Response page.
// Proves whether the fat low-side skirt originates in the transfer equation itself, a frequency
// normalisation error, or post-transfer summation/scaling. No production graph/engine/project
// changes — measurements only, using canonical resonantTransfer()/estimateModeQLocal()/
// modeShapeValueLocal() primitives via isolatedModalTransferRootCauseAuditEngine.jsx.

import React, { useState, useCallback } from 'react';
import { getSubwooferCurve } from '@/components/models/speakers/registry';
import {
  buildModes, buildRawAndIsolated, buildClosedFormMetrics, buildCollapseSeries,
  buildTailExcessScores, buildSubstitutionScopes, runSubstitutionTest, buildConclusion,
  FORMULA_KEYS, FORMULA_LABELS, TARGET_SPL_FREQS, OFFSETS,
} from '@/components/room/bass/isolatedModalTransferRootCauseAuditEngine';

const MODE_COLORS = { '0,1,0': '#0891b2', '0,2,0': '#dc2626', '0,3,0': '#7c3aed', '0,4,0': '#ea580c', '2,0,0': '#16a34a', '2,2,0': '#a16207' };

function fmt(v, d = 2) { return Number.isFinite(v) ? Number(v).toFixed(d) : '—'; }
function fmtPct(v, d = 1) { return Number.isFinite(v) ? `${(v * 100).toFixed(d)}%` : '—'; }
function fmtSigned(v, d = 2) { return Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(d)}` : '—'; }

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

const thS = { textAlign: 'right', padding: '3px 6px', fontSize: 9, fontWeight: 700, background: '#312e81', color: '#e0e7ff', whiteSpace: 'nowrap' };
const tdS = { textAlign: 'right', padding: '2px 6px', fontSize: 9, fontFamily: 'monospace' };
const sectionTitle = { fontSize: 11, fontWeight: 700, color: '#312e81', margin: '14px 0 4px', paddingTop: 8, borderTop: '1px solid #c7d2fe' };

function GenericTable({ columns, rows, rowKey }) {
  return (
    <div style={{ overflowX: 'auto', marginBottom: 8 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 600 }}>
        <thead>
          <tr>{columns.map((c) => <th key={c.key} style={{ ...thS, textAlign: c.align || 'right' }}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={rowKey ? rowKey(row) : i} style={{ borderBottom: '1px solid #e0e7ff' }}>
              {columns.map((c) => <td key={c.key} style={{ ...tdS, textAlign: c.align || 'right', color: c.color ? c.color(row) : undefined, fontWeight: c.bold?.(row) ? 700 : undefined }}>{c.render ? c.render(row) : row[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function IsolatedModalTransferRootCauseAudit({ roomDims, seatingPositions, subsForSimulation, surfaceAbsorption }) {
  const seatLabels = buildSeatLabels(seatingPositions);
  const defaultSeatId = seatLabels.find((s) => s.label === 'R1S2')?.id || seatLabels[0]?.id || null;
  const [selectedSeatId, setSelectedSeatId] = useState(defaultSeatId);
  const [freqStart, setFreqStart] = useState(20);
  const [freqEnd, setFreqEnd] = useState(80);
  const [step, setStep] = useState(1);
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

    const modes = buildModes(rdims, surfaceAbsorption, 4.0);
    const rawAndIsolated = buildRawAndIsolated(modes, rdims, seatPos, sourcePos, curve, freqStart, freqEnd, step);
    const closedFormMetrics = buildClosedFormMetrics(modes, sourcePos, seatPos, rdims, curve);
    const collapseSeries = buildCollapseSeries(modes, freqStart, freqEnd, step);
    const tailExcessScores = buildTailExcessScores(closedFormMetrics);
    const scopes = buildSubstitutionScopes(modes);
    const singleModeSubResults = runSubstitutionTest(['0,2,0'], modes, rdims, seatPos, sourcePos, curve);
    const multiModeSubResults = {};
    scopes.forEach(({ scope, keys }) => {
      multiModeSubResults[scope] = runSubstitutionTest(keys, modes, rdims, seatPos, sourcePos, curve);
    });
    const conclusion = buildConclusion(rawAndIsolated, closedFormMetrics, collapseSeries, tailExcessScores, multiModeSubResults);

    setResult({ modes, rawAndIsolated, closedFormMetrics, collapseSeries, tailExcessScores, scopes, singleModeSubResults, multiModeSubResults, conclusion });
    setRunning(false);
  }, [canRun, freqStart, freqEnd, step, roomDims, surfaceAbsorption, seat, source, curve]);

  const targetFreqRows = result ? TARGET_SPL_FREQS.map((tf) => {
    const row = result.rawAndIsolated.reduce((best, r) => (!best || Math.abs(r.frequencyHz - tf) < Math.abs(best.frequencyHz - tf) ? r : best), null);
    return { tf, row };
  }) : [];

  return (
    <div style={{ border: '2px solid #4338ca', borderRadius: 8, background: '#eef2ff', padding: '10px 12px', marginTop: 8, marginBottom: 8 }}>
      <div style={{ fontWeight: 700, color: '#312e81', fontSize: 12, fontFamily: 'monospace', marginBottom: 4 }}>
        Isolated Modal Transfer Root Cause Audit
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          temporary diagnostic · closed-form transfer substitution · no physics/graph/project changes
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'monospace', color: '#3730a3' }}>
          Seat:
          <select value={effectiveSeatId || ''} onChange={(e) => setSelectedSeatId(e.target.value)} style={{ height: 24, border: '1px solid #a5b4fc', borderRadius: 4, padding: '0 6px', fontSize: 10, fontFamily: 'monospace' }}>
            {seatLabels.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'monospace', color: '#3730a3' }}>
          Range (Hz):
          <input type="number" value={freqStart} onChange={(e) => setFreqStart(parseFloat(e.target.value) || 20)} style={{ width: 55, height: 24, border: '1px solid #a5b4fc', borderRadius: 4, padding: '0 6px', fontSize: 10, fontFamily: 'monospace' }} />
          –
          <input type="number" value={freqEnd} onChange={(e) => setFreqEnd(parseFloat(e.target.value) || 80)} style={{ width: 55, height: 24, border: '1px solid #a5b4fc', borderRadius: 4, padding: '0 6px', fontSize: 10, fontFamily: 'monospace' }} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'monospace', color: '#3730a3' }}>
          Step (Hz):
          <input type="number" step="0.5" value={step} onChange={(e) => setStep(Math.max(0.1, parseFloat(e.target.value) || 1))} style={{ width: 50, height: 24, border: '1px solid #a5b4fc', borderRadius: 4, padding: '0 6px', fontSize: 10, fontFamily: 'monospace' }} />
        </label>
        <button onClick={runAudit} disabled={running || !canRun} style={{ height: 26, padding: '0 12px', borderRadius: 6, border: '1px solid #312e81', background: running ? '#e5e7eb' : '#312e81', color: running ? '#6b7280' : '#fff', fontSize: 10, fontFamily: 'monospace', cursor: running || !canRun ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
          {running ? 'Running…' : 'Run Audit'}
        </button>
        {!canRun && <span style={{ fontSize: 9, color: '#b45309', fontFamily: 'monospace' }}>⚠ Need room, seat and sub with a product curve.</span>}
      </div>

      {result && (
        <>
          {/* ── 1 & 2: raw production transfer + isolated single-mode SPL delta ── */}
          <div style={sectionTitle}>1–2. Raw production transfer vs isolated single-mode SPL delta</div>
          <GenericTable
            rowKey={(r) => r.tf}
            columns={[
              { key: 'tf', label: 'Hz', align: 'left' },
              { key: 'full', label: 'Full (6-mode) dB', render: (r) => fmt(r.row?.fullProductionDb, 1) },
              ...result.modes.map((m) => ({
                key: m.key, label: `(${m.key}) Δ`, color: () => MODE_COLORS[m.key],
                render: (r) => fmtSigned(r.row?.isolated[m.key]?.deltaVsFullDb, 2),
              })),
            ]}
            rows={targetFreqRows}
          />

          {/* ── 3: closed-form reference comparison ── */}
          <div style={sectionTitle}>3. Closed-form reference comparison (per mode, per formulation)</div>
          {result.closedFormMetrics.map((m) => (
            <div key={m.key} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: MODE_COLORS[m.key], marginBottom: 2 }}>
                Mode ({m.key}) — {m.family} @ {fmt(m.modeFrequencyHz, 2)} Hz, Q={fmt(m.qValue, 2)}
              </div>
              <GenericTable
                rowKey={(r) => r.formulaKey}
                columns={[
                  { key: 'formula', label: 'Formulation', align: 'left', render: (r) => FORMULA_LABELS[r.formulaKey] },
                  { key: 'bw3', label: '-3dB BW (Hz)', render: (r) => fmt(r.data.bw3TotalHz, 2) },
                  { key: 'bw6', label: '-6dB BW (Hz)', render: (r) => fmt(r.data.bw6TotalHz, 2) },
                  { key: 'low10', label: '-10Hz', render: (r) => fmtPct(r.data.low[10]) },
                  { key: 'low20', label: '-20Hz', render: (r) => fmtPct(r.data.low[20]) },
                  { key: 'low30', label: '-30Hz', render: (r) => fmtPct(r.data.low[30]) },
                  { key: 'high10', label: '+10Hz', render: (r) => fmtPct(r.data.high[10]) },
                  { key: 'high20', label: '+20Hz', render: (r) => fmtPct(r.data.high[20]) },
                  { key: 'high30', label: '+30Hz', render: (r) => fmtPct(r.data.high[30]) },
                  { key: 'asym', label: 'Asym (L/H)', color: (r) => r.data.asymmetryRatio > 1.3 ? '#dc2626' : undefined, bold: (r) => r.data.asymmetryRatio > 1.3, render: (r) => fmt(r.data.asymmetryRatio, 2) },
                ]}
                rows={FORMULA_KEYS.map((formulaKey) => ({ formulaKey, data: m.perFormula[formulaKey] }))}
              />
            </div>
          ))}

          {/* ── 4: normalised collapse test ── */}
          <div style={sectionTitle}>4. Normalised collapse test — sampled points (bandwidth-normalised offset Δf/(f₀/Q))</div>
          <div style={{ fontSize: 9, color: '#4338ca', marginBottom: 4, fontFamily: 'monospace' }}>
            If the transfer formula scales correctly, all modes' normalised magnitude should collapse onto one curve when plotted vs Δf/(f₀/Q). Sampled at 30%/50%/70% through the sweep range.
          </div>
          <GenericTable
            rowKey={(r) => r.idx}
            columns={[
              { key: 'idx', label: 'Sample', align: 'left', render: (r) => r.label },
              ...result.modes.map((m) => ({ key: m.key, label: `(${m.key}) bwNorm Δf`, color: () => MODE_COLORS[m.key], render: (r) => fmt(r.point?.[`${m.key}__bwNorm`], 3) })),
              ...result.modes.map((m) => ({ key: `${m.key}_mag`, label: `(${m.key}) mag`, color: () => MODE_COLORS[m.key], render: (r) => fmtPct(r.point?.[`${m.key}__mag`]) })),
            ]}
            rows={[0.3, 0.5, 0.7].map((frac, i) => {
              const idx = Math.floor(result.collapseSeries.length * frac);
              return { idx: i, label: `${(frac * 100).toFixed(0)}%`, point: result.collapseSeries[idx] };
            })}
          />

          {/* ── 5: tail excess score ── */}
          <div style={sectionTitle}>5. Tail excess score</div>
          <GenericTable
            rowKey={(r) => r.key}
            columns={[
              { key: 'mode', label: 'Mode', align: 'left', color: (r) => MODE_COLORS[r.key], render: (r) => `(${r.key})` },
              { key: 'vs010', label: 'Excess vs (0,1,0)', render: (r) => r.excessVs010Max !== null ? fmtPct(r.excessVs010Max) : '—' },
              { key: 'vs2nd', label: 'Excess vs 2nd-order ref', render: (r) => fmtPct(r.excessVsSecondOrderMax) },
              { key: 'vsLor', label: 'Excess vs Lorentzian', render: (r) => fmtPct(r.excessVsLorentzianMax) },
              { key: 'band', label: '30–50Hz band excess', render: (r) => r.bandExcess30to50 !== null ? fmtPct(r.bandExcess30to50) : '—' },
            ]}
            rows={result.tailExcessScores}
          />

          {/* ── 6: single-mode substitution test — (0,2,0) only ── */}
          <div style={sectionTitle}>6. Single-mode substitution test — (0,2,0) only</div>
          <GenericTable
            rowKey={(r) => r.formulaKey}
            columns={[
              { key: 'formula', label: 'Substituted formulation', align: 'left', render: (r) => FORMULA_LABELS[r.formulaKey] },
              ...TARGET_SPL_FREQS.map((tf) => ({ key: `d${tf}`, label: `${tf}Hz Δ`, render: (r) => fmtSigned(r.data.deltas[tf], 2) })),
              { key: 'pass', label: 'Pass?', color: (r) => r.data.pass ? '#166534' : '#dc2626', bold: () => true, render: (r) => r.data.pass ? '✓ PASS' : '✗ fail' },
            ]}
            rows={FORMULA_KEYS.filter((k) => k !== 'A_b44').map((formulaKey) => ({ formulaKey, data: result.singleModeSubResults[formulaKey] }))}
          />

          {/* ── 7: multi-mode substitution tests ── */}
          <div style={sectionTitle}>7. Multi-mode substitution tests</div>
          {result.scopes.map(({ scope }) => (
            <div key={scope} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#4338ca', marginBottom: 2 }}>Scope: {scope}</div>
              <GenericTable
                rowKey={(r) => r.formulaKey}
                columns={[
                  { key: 'formula', label: 'Substituted formulation', align: 'left', render: (r) => FORMULA_LABELS[r.formulaKey] },
                  ...TARGET_SPL_FREQS.map((tf) => ({ key: `d${tf}`, label: `${tf}Hz Δ`, render: (r) => fmtSigned(r.data.deltas[tf], 2) })),
                  { key: 'pass', label: 'Pass?', color: (r) => r.data.pass ? '#166534' : '#dc2626', bold: () => true, render: (r) => r.data.pass ? '✓ PASS' : '✗ fail' },
                ]}
                rows={FORMULA_KEYS.filter((k) => k !== 'A_b44').map((formulaKey) => ({ formulaKey, data: result.multiModeSubResults[scope][formulaKey] }))}
              />
            </div>
          ))}

          {/* ── 8: automatic conclusion ── */}
          <div style={{ border: '2px solid #312e81', borderRadius: 6, background: '#fff', padding: '10px 12px', fontSize: 10, fontFamily: 'monospace', color: '#1c1917', marginTop: 8 }}>
            <div style={{ fontWeight: 700, color: '#312e81', marginBottom: 8, fontSize: 12 }}>ISOLATED TRANSFER RESULT:</div>
            <div>Fat skirt created by: <strong style={{ color: '#dc2626' }}>{result.conclusion.faultLocation}</strong></div>
            {result.conclusion.hasCandidate ? (
              <>
                <div style={{ marginTop: 6 }}>Best candidate formulation: <strong>{result.conclusion.bestCandidateFormulation}</strong></div>
                <div>Best candidate scope: <strong>{result.conclusion.bestCandidateScope}</strong></div>
                <div>30 Hz delta: <strong>{fmtSigned(result.conclusion.deltasAtKeyFreqs[30])}</strong></div>
                <div>35 Hz delta: <strong>{fmtSigned(result.conclusion.deltasAtKeyFreqs[35])}</strong></div>
                <div>40 Hz delta: <strong>{fmtSigned(result.conclusion.deltasAtKeyFreqs[40])}</strong></div>
                <div>45 Hz delta: <strong>{fmtSigned(result.conclusion.deltasAtKeyFreqs[45])}</strong></div>
                <div>50 Hz delta: <strong>{fmtSigned(result.conclusion.deltasAtKeyFreqs[50])}</strong></div>
                <div>57 Hz delta: <strong>{fmtSigned(result.conclusion.deltasAtKeyFreqs[57])}</strong></div>
                <div>58 Hz delta: <strong>{fmtSigned(result.conclusion.deltasAtKeyFreqs[58])}</strong></div>
                <div>Confidence: <strong>{result.conclusion.confidence}</strong></div>
              </>
            ) : (
              <>
                <div style={{ marginTop: 6, color: '#b91c1c', fontWeight: 700 }}>NO TRANSFER FORMULATION PASSED.</div>
                <div>Remaining likely cause: <strong>{result.conclusion.remainingLikelyCause}</strong></div>
                <div>Next audit target: <strong>{result.conclusion.nextAuditTarget}</strong></div>
              </>
            )}
            <div style={{ marginTop: 6, borderTop: '1px solid #e0e7ff', paddingTop: 4, color: '#6b7280', fontSize: 9 }}>
              Collapse test: {result.conclusion.collapsesCleanly ? 'modes collapsed onto one curve (shape scaling OK)' : 'modes did NOT collapse (possible frequency-scaling error)'} · Isolated (0,2,0) Δ @ ~40Hz: {fmt(result.conclusion.isolated020Delta, 2)} dB
            </div>
          </div>
        </>
      )}
    </div>
  );
}