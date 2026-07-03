// RewTransferFunctionParityAudit.jsx
// Temporary diagnostic panel — Bass Response page.
// STRICT AUDIT: read-only. No production graph/Q/damping/coupling/weighting/summation/SPL changes.
// Compares 6 transfer-function formulations side by side for the tracked dominant mode
// (0,2,0), native ~57.17 Hz axial, to test whether the transfer-function shape itself is
// responsible for the too-fast 30–50 Hz null recovery vs REW.

import React, { useState, useCallback, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import {
  fmt, VARIANT_DEFS, buildTransferParitySweep, validateProductionParity, rankVariants,
} from '@/components/room/bass/rewTransferParityAuditEngine';

function buildSeatLabels(seatingPositions) {
  const ordered = [...(seatingPositions || [])].sort((a, b) => {
    const ra = Number(a?.row || a?.rowNumber) || 1;
    const rb = Number(b?.row || b?.rowNumber) || 1;
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

const thS = { textAlign: 'right', padding: '3px 5px', fontSize: 9, fontWeight: 700, background: '#f5f3ff', borderBottom: '2px solid #c4b5fd', color: '#5b21b6', whiteSpace: 'nowrap' };
const tdS = { textAlign: 'right', padding: '2px 5px', fontSize: 9, fontFamily: 'monospace' };
const sectionBox = { border: '1px solid #c4b5fd', borderRadius: 6, background: '#fff', padding: '8px 10px', marginBottom: 10 };
const sectionTitle = { fontWeight: 700, color: '#5b21b6', fontSize: 11, fontFamily: 'monospace', marginBottom: 6 };
const VARIANT_COLORS = { A: '#111827', B: '#059669', C: '#ea580c', D: '#dc2626', E: '#2563eb', F: '#9333ea' };

export default function RewTransferFunctionParityAudit({ roomDims, seatingPositions, subsForSimulation, surfaceAbsorption }) {
  const seatLabels = buildSeatLabels(seatingPositions);
  const defaultSeatId = seatLabels.find((s) => s.label === 'R1S2')?.id || seatLabels[0]?.id || null;

  const [selectedSeatId, setSelectedSeatId] = useState(defaultSeatId);
  const [freqStart, setFreqStart] = useState(20);
  const [freqEnd, setFreqEnd] = useState(60);
  const [step, setStep] = useState(1);
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);

  const effectiveSeatId = selectedSeatId || defaultSeatId;
  const canRun = !!(
    roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM &&
    effectiveSeatId && Array.isArray(subsForSimulation) && subsForSimulation.length > 0 &&
    Number(freqEnd) >= Number(freqStart) && Number(step) > 0
  );

  const runAudit = useCallback(() => {
    if (!canRun) return;
    setRunning(true);
    const seatEntry = seatLabels.find((s) => s.id === effectiveSeatId);
    const seat = seatEntry?.seat;
    const seatZ = Number.isFinite(Number(seat?.z)) ? Number(seat.z) : 1.2;
    const seatPos = { x: Number(seat.x), y: Number(seat.y), z: seatZ };
    const rd = { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM };

    const sweep = buildTransferParitySweep(Number(freqStart), Number(freqEnd), Number(step), rd, seatPos, subsForSimulation, surfaceAbsorption);
    const parityValid = validateProductionParity(sweep.rows);
    const ranking = rankVariants(sweep.rows);
    setResult({ ...sweep, parityValid, ranking });
    setRunning(false);
  }, [canRun, effectiveSeatId, freqStart, freqEnd, step, roomDims, seatLabels, subsForSimulation, surfaceAbsorption]);

  const chartData = useMemo(() => {
    if (!result) return [];
    return result.rows.map((r) => {
      const row = { hz: Number(r.frequencyHz.toFixed(2)) };
      VARIANT_DEFS.forEach(({ key }) => {
        row[`mag_${key}`] = r.variants[key].transferMagnitude;
        row[`splDb_${key}`] = r.variants[key].predictedFinalSplDb;
      });
      return row;
    });
  }, [result]);

  return (
    <div style={{ border: '2px solid #6d28d9', borderRadius: 8, background: '#f5f3ff', padding: '10px 12px', marginTop: 8, marginBottom: 8 }}>
      <div style={{ fontWeight: 700, color: '#5b21b6', fontSize: 12, fontFamily: 'monospace', marginBottom: 4 }}>
        REW Transfer Function Parity Audit
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          strict audit · temporary diagnostic · tracked mode (0,2,0) ~57.17 Hz axial · read-only · no production changes
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'monospace', color: '#5b21b6' }}>
          Seat:
          <select value={effectiveSeatId || ''} onChange={(e) => setSelectedSeatId(e.target.value)}
            style={{ height: 24, border: '1px solid #c4b5fd', borderRadius: 4, padding: '0 6px', fontSize: 10, fontFamily: 'monospace' }}>
            {seatLabels.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'monospace', color: '#5b21b6' }}>
          Start (Hz): <input type="number" step="1" value={freqStart} onChange={(e) => setFreqStart(parseFloat(e.target.value) || 20)}
            style={{ width: 55, height: 24, border: '1px solid #c4b5fd', borderRadius: 4, padding: '0 6px', fontSize: 10, fontFamily: 'monospace' }} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'monospace', color: '#5b21b6' }}>
          End (Hz): <input type="number" step="1" value={freqEnd} onChange={(e) => setFreqEnd(parseFloat(e.target.value) || 60)}
            style={{ width: 55, height: 24, border: '1px solid #c4b5fd', borderRadius: 4, padding: '0 6px', fontSize: 10, fontFamily: 'monospace' }} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'monospace', color: '#5b21b6' }}>
          Step (Hz): <input type="number" step="0.5" min="0.1" value={step} onChange={(e) => setStep(Math.max(0.1, parseFloat(e.target.value) || 1))}
            style={{ width: 50, height: 24, border: '1px solid #c4b5fd', borderRadius: 4, padding: '0 6px', fontSize: 10, fontFamily: 'monospace' }} />
        </label>
        <button onClick={runAudit} disabled={running || !canRun}
          style={{ height: 26, padding: '0 12px', borderRadius: 6, border: '1px solid #5b21b6', background: running ? '#e5e7eb' : '#5b21b6', color: running ? '#6b7280' : '#fff', fontSize: 10, fontFamily: 'monospace', cursor: running || !canRun ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
          {running ? 'Running…' : 'Run Audit'}
        </button>
        {!canRun && <span style={{ fontSize: 9, color: '#b45309', fontFamily: 'monospace' }}>⚠ Need room dims, seat, ≥1 sub, and end ≥ start.</span>}
      </div>

      {result && (
        <>
          {/* Validation */}
          <div style={{ ...sectionBox, borderColor: result.parityValid ? '#16a34a' : '#dc2626' }}>
            <div style={sectionTitle}>Validation — Variant A vs Production Graph</div>
            <div style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 700, color: result.parityValid ? '#166534' : '#b91c1c' }}>
              {result.parityValid ? 'PASS — Variant A predicted final SPL exactly matches current production graph values at every frequency.' : 'FAIL — Variant A diverges from production graph values (see table).'}
            </div>
          </div>

          {/* Variant list */}
          <div style={sectionBox}>
            <div style={sectionTitle}>Variant Definitions</div>
            {VARIANT_DEFS.map((v) => (
              <div key={v.key} style={{ fontSize: 10, fontFamily: 'monospace', color: VARIANT_COLORS[v.key] }}>{v.label}</div>
            ))}
          </div>

          {/* Per-frequency table (compact, all variants side by side for magnitude + predicted SPL) */}
          <div style={sectionBox}>
            <div style={sectionTitle}>Per-Frequency Transfer Values &amp; Predicted Final SPL (all variants)</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 1600 }}>
                <thead>
                  <tr>
                    <th style={thS}>Hz</th>
                    {VARIANT_DEFS.map((v) => <th key={v.key} style={thS}>{v.key} TF Mag</th>)}
                    {VARIANT_DEFS.map((v) => <th key={v.key + 'p'} style={thS}>{v.key} °</th>)}
                    {VARIANT_DEFS.map((v) => <th key={v.key + 'd'} style={thS}>{v.key} Den Mag</th>)}
                    {VARIANT_DEFS.map((v) => <th key={v.key + 's'} style={thS}>{v.key} Predicted SPL dB</th>)}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r) => (
                    <tr key={r.frequencyHz} style={{ borderBottom: '1px solid #ede9fe' }}>
                      <td style={{ ...tdS, fontWeight: 700, color: '#5b21b6' }}>{fmt(r.frequencyHz, 1)}</td>
                      {VARIANT_DEFS.map((v) => <td key={v.key} style={tdS}>{fmt(r.variants[v.key].transferMagnitude, 4)}</td>)}
                      {VARIANT_DEFS.map((v) => <td key={v.key + 'p'} style={tdS}>{fmt(r.variants[v.key].transferPhase, 1)}</td>)}
                      {VARIANT_DEFS.map((v) => <td key={v.key + 'd'} style={tdS}>{fmt(r.variants[v.key].denominatorMagnitude, 4)}</td>)}
                      {VARIANT_DEFS.map((v) => <td key={v.key + 's'} style={{ ...tdS, fontWeight: v.key === 'A' ? 700 : 400 }}>{fmt(r.variants[v.key].predictedFinalSplDb, 2)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bandwidth / effective Q summary */}
          <div style={sectionBox}>
            <div style={sectionTitle}>Effective Bandwidth &amp; Q per Variant (sweep-derived)</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 600 }}>
                <thead>
                  <tr>
                    <th style={{ ...thS, textAlign: 'left' }}>Variant</th>
                    <th style={thS}>-3dB BW (Hz)</th><th style={thS}>-6dB BW (Hz)</th><th style={thS}>Effective Q</th>
                  </tr>
                </thead>
                <tbody>
                  {VARIANT_DEFS.map((v) => (
                    <tr key={v.key}>
                      <td style={{ ...tdS, textAlign: 'left', fontWeight: 700, color: VARIANT_COLORS[v.key] }}>{v.key}</td>
                      <td style={tdS}>{fmt(result.bandwidthResults[v.key].bw3dBHz, 2)}</td>
                      <td style={tdS}>{fmt(result.bandwidthResults[v.key].bw6dBHz, 2)}</td>
                      <td style={tdS}>{fmt(result.bandwidthResults[v.key].effectiveQ, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Chart: predicted SPL per variant */}
          <div style={sectionBox}>
            <div style={sectionTitle}>Predicted Final SPL vs Frequency — All Variants</div>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hz" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip wrapperStyle={{ fontSize: 10 }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {VARIANT_DEFS.map((v) => (
                  <Line key={v.key} type="monotone" dataKey={`splDb_${v.key}`} name={`Variant ${v.key}`} stroke={VARIANT_COLORS[v.key]} dot={false} strokeWidth={v.key === 'A' ? 2 : 1} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Chart: transfer magnitude per variant */}
          <div style={sectionBox}>
            <div style={sectionTitle}>Transfer Magnitude vs Frequency — All Variants</div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hz" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip wrapperStyle={{ fontSize: 10 }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {VARIANT_DEFS.map((v) => (
                  <Line key={v.key} type="monotone" dataKey={`mag_${v.key}`} name={`Variant ${v.key}`} stroke={VARIANT_COLORS[v.key]} dot={false} strokeWidth={v.key === 'A' ? 2 : 1} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Ranking */}
          <div style={sectionBox}>
            <div style={sectionTitle}>Automatic Ranking — Widens 30–40 Hz Null Recovery Without Exceeding Constraints</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900 }}>
                <thead>
                  <tr>
                    <th style={{ ...thS, textAlign: 'left' }}>Variant</th>
                    {result.ranking.checkFreqs.map((hz) => <th key={hz} style={thS}>{hz} Hz Δ</th>)}
                    <th style={thS}>Constraints</th>
                  </tr>
                </thead>
                <tbody>
                  {result.ranking.results.map((r) => (
                    <tr key={r.key} style={{ background: result.ranking.best?.key === r.key ? '#ddd6fe' : undefined }}>
                      <td style={{ ...tdS, textAlign: 'left', fontWeight: 700, color: VARIANT_COLORS[r.key] }}>{r.key}{result.ranking.best?.key === r.key ? ' ★ BEST' : ''}</td>
                      {result.ranking.checkFreqs.map((hz) => <td key={hz} style={tdS}>{fmt(r.deltas[hz], 2)}</td>)}
                      <td style={{ ...tdS, fontWeight: 700, color: r.constraintsPass ? '#166534' : '#b91c1c' }}>{r.key === 'A' ? 'baseline' : (r.constraintsPass ? 'OK' : 'exceeded')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Final output */}
          <div style={{ border: '2px solid #5b21b6', borderRadius: 6, background: '#ddd6fe', padding: '10px 12px', fontSize: 11, fontFamily: 'monospace', color: '#4c1d95' }}>
            {result.ranking.best ? (
              <>
                <div><strong>Best candidate:</strong> {result.ranking.best.label}</div>
                <div><strong>Reason:</strong> Widens the 30–40 Hz null recovery the most (avg Δ at 35/40 Hz = {fmt(result.ranking.best.wideningScore, 2)} dB) while staying within all constraints (30 Hz ≤1dB, 50 Hz ≤2dB, 57/58 Hz ≤2dB).</div>
                <div>30 Hz Δ: {fmt(result.ranking.best.deltas[30], 2)} dB</div>
                <div>35 Hz Δ: {fmt(result.ranking.best.deltas[35], 2)} dB</div>
                <div>40 Hz Δ: {fmt(result.ranking.best.deltas[40], 2)} dB</div>
                <div>45 Hz Δ: {fmt(result.ranking.best.deltas[45], 2)} dB</div>
                <div>50 Hz Δ: {fmt(result.ranking.best.deltas[50], 2)} dB</div>
                <div>57 Hz Δ: {fmt(result.ranking.best.deltas[57], 2)} dB</div>
                <div>58 Hz Δ: {fmt(result.ranking.best.deltas[58], 2)} dB</div>
                <div style={{ marginTop: 6, fontWeight: 700 }}>Not applied to production. Measurements only — no fix recommended.</div>
              </>
            ) : (
              <div style={{ fontWeight: 700 }}>No variant satisfies all constraints — measurements only, no fix recommended.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}