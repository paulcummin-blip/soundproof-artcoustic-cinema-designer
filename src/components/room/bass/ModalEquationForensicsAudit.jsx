// ModalEquationForensicsAudit.jsx
// Temporary diagnostic panel — Bass Response page.
// STRICT AUDIT: read-only. No production graph/Q/damping/coupling/weighting/SPL/project changes.
// Compares B44's modal transfer equation against 12 accepted room-acoustics transfer
// formulations for the tracked (0,2,0) ~57.17 Hz axial mode, to test whether the too-fast
// 30–50 Hz null recovery comes from the underlying equation rather than tunable parameters.

import React, { useState, useCallback, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import {
  fmt, FORMULATION_DEFS, buildForensicsSweep, validateProductionParity, rankFormulations,
} from '@/components/room/bass/modalEquationForensicsAuditEngine';

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

const thS = { textAlign: 'right', padding: '3px 5px', fontSize: 9, fontWeight: 700, background: '#fef2f2', borderBottom: '2px solid #fca5a5', color: '#991b1b', whiteSpace: 'nowrap' };
const tdS = { textAlign: 'right', padding: '2px 5px', fontSize: 9, fontFamily: 'monospace' };
const sectionBox = { border: '1px solid #fca5a5', borderRadius: 6, background: '#fff', padding: '8px 10px', marginBottom: 10 };
const sectionTitle = { fontWeight: 700, color: '#991b1b', fontSize: 11, fontFamily: 'monospace', marginBottom: 6 };
const COLORS = ['#111827', '#059669', '#ea580c', '#dc2626', '#2563eb', '#9333ea', '#0d9488', '#ca8a04', '#be185d', '#4338ca', '#65a30d', '#0369a1'];

export default function ModalEquationForensicsAudit({ roomDims, seatingPositions, subsForSimulation, surfaceAbsorption }) {
  const seatLabels = buildSeatLabels(seatingPositions);
  const defaultSeatId = seatLabels.find((s) => s.label === 'R1S2')?.id || seatLabels[0]?.id || null;

  const [selectedSeatId, setSelectedSeatId] = useState(defaultSeatId);
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);

  const effectiveSeatId = selectedSeatId || defaultSeatId;
  const canRun = !!(roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM && effectiveSeatId && Array.isArray(subsForSimulation) && subsForSimulation.length > 0);

  const runAudit = useCallback(() => {
    if (!canRun) return;
    setRunning(true);
    const seatEntry = seatLabels.find((s) => s.id === effectiveSeatId);
    const seat = seatEntry?.seat;
    const seatZ = Number.isFinite(Number(seat?.z)) ? Number(seat.z) : 1.2;
    const seatPos = { x: Number(seat.x), y: Number(seat.y), z: seatZ };
    const rd = { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM };

    const sweep = buildForensicsSweep(20, 60, 1, rd, seatPos, subsForSimulation, surfaceAbsorption);
    const parityValid = validateProductionParity(sweep.rows);
    const ranking = rankFormulations(sweep.rows);
    setResult({ ...sweep, parityValid, ranking });
    setRunning(false);
  }, [canRun, effectiveSeatId, roomDims, seatLabels, subsForSimulation, surfaceAbsorption]);

  const chartData = useMemo(() => {
    if (!result) return [];
    return result.rows.map((r) => {
      const row = { hz: Number(r.frequencyHz.toFixed(2)) };
      FORMULATION_DEFS.forEach(({ key }) => { row[`spl_${key}`] = r.forms[key].predictedFinalSplDb; });
      return row;
    });
  }, [result]);

  return (
    <div style={{ border: '2px solid #b91c1c', borderRadius: 8, background: '#fef2f2', padding: '10px 12px', marginTop: 8, marginBottom: 8 }}>
      <div style={{ fontWeight: 700, color: '#991b1b', fontSize: 12, fontFamily: 'monospace', marginBottom: 4 }}>
        Modal Equation Forensics Audit
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          strict audit · temporary diagnostic · tracked mode (0,2,0) ~57.17 Hz axial · read-only · no production changes
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'monospace', color: '#991b1b' }}>
          Seat:
          <select value={effectiveSeatId || ''} onChange={(e) => setSelectedSeatId(e.target.value)}
            style={{ height: 24, border: '1px solid #fca5a5', borderRadius: 4, padding: '0 6px', fontSize: 10, fontFamily: 'monospace' }}>
            {seatLabels.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <span style={{ fontSize: 9, color: '#6b7280', fontFamily: 'monospace' }}>20–60 Hz · 1 Hz step</span>
        <button onClick={runAudit} disabled={running || !canRun}
          style={{ height: 26, padding: '0 12px', borderRadius: 6, border: '1px solid #991b1b', background: running ? '#e5e7eb' : '#991b1b', color: running ? '#6b7280' : '#fff', fontSize: 10, fontFamily: 'monospace', cursor: running || !canRun ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
          {running ? 'Running…' : 'Run Audit'}
        </button>
        {!canRun && <span style={{ fontSize: 9, color: '#b45309', fontFamily: 'monospace' }}>⚠ Need room dims, seat, and ≥1 sub.</span>}
      </div>

      {result && (
        <>
          <div style={{ ...sectionBox, borderColor: result.parityValid ? '#16a34a' : '#dc2626' }}>
            <div style={sectionTitle}>Validation — Formulation #1 (B44 Production) vs Production Graph</div>
            <div style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 700, color: result.parityValid ? '#166534' : '#b91c1c' }}>
              {result.parityValid ? 'PASS — exact match at every swept frequency.' : 'FAIL — diverges from production graph values (see table).'}
            </div>
          </div>

          <div style={sectionBox}>
            <div style={sectionTitle}>Formulation Definitions</div>
            {FORMULATION_DEFS.map((v, i) => (
              <div key={v.key} style={{ fontSize: 10, fontFamily: 'monospace', color: COLORS[i] }}>
                {v.label}{v.note ? <span style={{ color: '#6b7280', fontWeight: 400 }}> — {v.note}</span> : null}
              </div>
            ))}
          </div>

          <div style={sectionBox}>
            <div style={sectionTitle}>Per-Frequency Numerator / Denominator / Transfer / Predicted SPL (all formulations)</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 2200 }}>
                <thead>
                  <tr>
                    <th style={thS}>Hz</th>
                    {FORMULATION_DEFS.map((v) => <th key={v.key + 'n'} style={thS}>{v.key} Num Mag</th>)}
                    {FORMULATION_DEFS.map((v) => <th key={v.key + 'd'} style={thS}>{v.key} Den Mag</th>)}
                    {FORMULATION_DEFS.map((v) => <th key={v.key + 't'} style={thS}>{v.key} TF Mag</th>)}
                    {FORMULATION_DEFS.map((v) => <th key={v.key + 'p'} style={thS}>{v.key} °</th>)}
                    {FORMULATION_DEFS.map((v) => <th key={v.key + 's'} style={thS}>{v.key} SPL dB</th>)}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r) => (
                    <tr key={r.frequencyHz} style={{ borderBottom: '1px solid #fee2e2' }}>
                      <td style={{ ...tdS, fontWeight: 700, color: '#991b1b' }}>{fmt(r.frequencyHz, 1)}</td>
                      {FORMULATION_DEFS.map((v) => <td key={v.key + 'n'} style={tdS}>{fmt(r.forms[v.key].numeratorMagnitude, 3)}</td>)}
                      {FORMULATION_DEFS.map((v) => <td key={v.key + 'd'} style={tdS}>{fmt(r.forms[v.key].denominatorMagnitude, 4)}</td>)}
                      {FORMULATION_DEFS.map((v) => <td key={v.key + 't'} style={tdS}>{fmt(r.forms[v.key].transferMagnitude, 4)}</td>)}
                      {FORMULATION_DEFS.map((v) => <td key={v.key + 'p'} style={tdS}>{fmt(r.forms[v.key].transferPhase, 1)}</td>)}
                      {FORMULATION_DEFS.map((v) => <td key={v.key + 's'} style={{ ...tdS, fontWeight: v.key === 'F1' ? 700 : 400 }}>{fmt(r.forms[v.key].predictedFinalSplDb, 2)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={sectionBox}>
            <div style={sectionTitle}>Effective Bandwidth &amp; Q per Formulation</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 600 }}>
                <thead><tr><th style={{ ...thS, textAlign: 'left' }}>Formulation</th><th style={thS}>-3dB BW (Hz)</th><th style={thS}>-6dB BW (Hz)</th><th style={thS}>Effective Q</th></tr></thead>
                <tbody>
                  {FORMULATION_DEFS.map((v, i) => (
                    <tr key={v.key}>
                      <td style={{ ...tdS, textAlign: 'left', fontWeight: 700, color: COLORS[i] }}>{v.key}</td>
                      <td style={tdS}>{fmt(result.bandwidthResults[v.key].bw3dBHz, 2)}</td>
                      <td style={tdS}>{fmt(result.bandwidthResults[v.key].bw6dBHz, 2)}</td>
                      <td style={tdS}>{fmt(result.bandwidthResults[v.key].effectiveQ, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={sectionBox}>
            <div style={sectionTitle}>Predicted Final SPL vs Frequency — All Formulations</div>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hz" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip wrapperStyle={{ fontSize: 10 }} />
                <Legend wrapperStyle={{ fontSize: 9 }} />
                {FORMULATION_DEFS.map((v, i) => (
                  <Line key={v.key} type="monotone" dataKey={`spl_${v.key}`} name={v.key} stroke={COLORS[i]} dot={false} strokeWidth={v.key === 'F1' ? 2 : 1} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={sectionBox}>
            <div style={sectionTitle}>Automatic Ranking</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 1000 }}>
                <thead>
                  <tr>
                    <th style={{ ...thS, textAlign: 'left' }}>Formulation</th>
                    {result.ranking.checkFreqs.map((hz) => <th key={hz} style={thS}>{hz} Hz Δ</th>)}
                    <th style={thS}>Pass/Fail</th>
                  </tr>
                </thead>
                <tbody>
                  {result.ranking.results.map((r) => (
                    <tr key={r.key} style={{ background: result.ranking.best?.key === r.key ? '#fecaca' : undefined }}>
                      <td style={{ ...tdS, textAlign: 'left', fontWeight: 700 }}>{r.key}{result.ranking.best?.key === r.key ? ' ★ BEST' : ''}</td>
                      {result.ranking.checkFreqs.map((hz) => <td key={hz} style={tdS}>{fmt(r.deltas[hz], 2)}</td>)}
                      <td style={{ ...tdS, fontWeight: 700, color: r.key === 'F1' ? '#6b7280' : (r.pass ? '#166534' : '#b91c1c') }}>{r.key === 'F1' ? 'baseline' : (r.pass ? 'PASS' : 'FAIL')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ border: '2px solid #991b1b', borderRadius: 6, background: '#fecaca', padding: '10px 12px', fontSize: 11, fontFamily: 'monospace', color: '#450a0a' }}>
            {result.ranking.best ? (
              <>
                <div style={{ fontWeight: 700 }}>BEST EQUATION CANDIDATE:</div>
                <div>Name: {result.ranking.best.label}</div>
                <div>Pass/fail: PASS</div>
                <div>30 Hz delta: {fmt(result.ranking.best.deltas[30], 2)}</div>
                <div>35 Hz delta: {fmt(result.ranking.best.deltas[35], 2)}</div>
                <div>40 Hz delta: {fmt(result.ranking.best.deltas[40], 2)}</div>
                <div>45 Hz delta: {fmt(result.ranking.best.deltas[45], 2)}</div>
                <div>50 Hz delta: {fmt(result.ranking.best.deltas[50], 2)}</div>
                <div>57 Hz delta: {fmt(result.ranking.best.deltas[57], 2)}</div>
                <div>58 Hz delta: {fmt(result.ranking.best.deltas[58], 2)}</div>
                <div>Why: Reduces 35–40 Hz recovery by {fmt(result.ranking.best.reduction3540, 2)} dB while keeping 30/50/57/58 Hz within tolerance and no new notch.</div>
                <div>Confidence: Moderate — single-pass diagnostic estimate, not cross-validated against measured REW data.</div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 700 }}>ALL EQUATION FORMULATIONS FAILED.</div>
                <div>Most likely remaining cause: the 30–50 Hz recovery speed is not governed by the single-mode transfer-function equation shape alone — likely modal phase interaction between multiple modes, or upstream coupling/excitation terms outside this audit's scope.</div>
                <div>Next audit target: Modal Physics Input Audit (coupling/excitation) and multi-mode phase-interaction analysis.</div>
              </>
            )}
            <div style={{ marginTop: 6, fontWeight: 700 }}>No fixes. Measurements only.</div>
          </div>
        </>
      )}
    </div>
  );
}