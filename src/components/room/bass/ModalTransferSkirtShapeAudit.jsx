// ModalTransferSkirtShapeAudit.jsx
// Temporary read-only diagnostic panel — Bass Response page.
// Tests whether higher modes (esp. (0,2,0) ~57 Hz) have too much low-frequency tail below
// resonance, potentially explaining the fast 30 Hz null recovery. Uses only the canonical
// resonantTransfer()/estimateModeQLocal() functions — no production graph/Q/coupling/SPL changes.

import React, { useState, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  runSkirtSweep, buildSkirtLevels, buildBandwidthAsymmetry, buildDiagnosis,
} from '@/components/room/bass/modalTransferSkirtAuditEngine';

const MODE_COLORS = {
  '0,1,0': '#0891b2',
  '0,2,0': '#dc2626',
  '0,3,0': '#7c3aed',
  '0,4,0': '#ea580c',
  '2,0,0': '#16a34a',
  '2,2,0': '#a16207',
};

function fmt(v, d = 3) { return Number.isFinite(v) ? v.toFixed(d) : '—'; }
function fmtPct(v, d = 1) { return Number.isFinite(v) ? `${(v * 100).toFixed(d)}%` : '—'; }

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

const thS = { textAlign: 'right', padding: '3px 6px', fontSize: 9, fontWeight: 700, background: '#fef2f2', borderBottom: '2px solid #fca5a5', color: '#991b1b', whiteSpace: 'nowrap' };
const tdS = { textAlign: 'right', padding: '2px 6px', fontSize: 9, fontFamily: 'monospace' };

export default function ModalTransferSkirtShapeAudit({ roomDims, seatingPositions, surfaceAbsorption }) {
  const seatLabels = buildSeatLabels(seatingPositions);
  const defaultSeatId = seatLabels.find((s) => s.label === 'R1S2')?.id || seatLabels[0]?.id || null;
  const [selectedSeatId, setSelectedSeatId] = useState(defaultSeatId);
  const [freqStart, setFreqStart] = useState(20);
  const [freqEnd, setFreqEnd] = useState(80);
  const [step, setStep] = useState(1);
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);

  const effectiveSeatId = selectedSeatId || defaultSeatId;
  const canRun = !!(roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM);

  const runAudit = useCallback(() => {
    if (!canRun) return;
    setRunning(true);
    const { modes, rows, peakByKey } = runSkirtSweep(freqStart, freqEnd, step, roomDims, surfaceAbsorption, 4.0);
    const skirtLevels = buildSkirtLevels(modes, peakByKey);
    const bandwidthRows = buildBandwidthAsymmetry(modes, peakByKey);
    const diagnosis = buildDiagnosis(modes, skirtLevels, bandwidthRows);

    const chartAbs = rows.map((r) => {
      const point = { frequencyHz: Number(r.frequencyHz.toFixed(2)) };
      modes.forEach((m) => { point[m.key] = r.modes[m.key].normalisedMagnitude; });
      return point;
    });
    const chartDeltaF = rows.map((r) => {
      const point = {};
      modes.forEach((m) => {
        point.deltaFreqHz = Number(r.modes[m.key].deltaFreqHz.toFixed(2));
        point[m.key] = r.modes[m.key].normalisedMagnitude;
      });
      return point;
    }).sort((a, b) => a.deltaFreqHz - b.deltaFreqHz);
    const chartFractional = rows.map((r) => {
      const point = {};
      modes.forEach((m) => {
        point.fractionalOffset = Number(r.modes[m.key].fractionalOffset.toFixed(4));
        point[m.key] = r.modes[m.key].normalisedMagnitude;
      });
      return point;
    }).sort((a, b) => a.fractionalOffset - b.fractionalOffset);

    setResult({ modes, skirtLevels, bandwidthRows, diagnosis, chartAbs, chartDeltaF, chartFractional });
    setRunning(false);
  }, [canRun, freqStart, freqEnd, step, roomDims, surfaceAbsorption]);

  return (
    <div style={{ border: '2px solid #dc2626', borderRadius: 8, background: '#fef2f2', padding: '10px 12px', marginTop: 8, marginBottom: 8 }}>
      <div style={{ fontWeight: 700, color: '#991b1b', fontSize: 12, fontFamily: 'monospace', marginBottom: 4 }}>
        Modal Transfer Skirt Shape Audit
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          temporary diagnostic · pure resonantTransfer() shape analysis · no physics/graph changes
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'monospace', color: '#7f1d1d' }}>
          Seat:
          <select value={effectiveSeatId || ''} onChange={(e) => setSelectedSeatId(e.target.value)} style={{ height: 24, border: '1px solid #fca5a5', borderRadius: 4, padding: '0 6px', fontSize: 10, fontFamily: 'monospace' }}>
            {seatLabels.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'monospace', color: '#7f1d1d' }}>
          Range (Hz):
          <input type="number" value={freqStart} onChange={(e) => setFreqStart(parseFloat(e.target.value) || 20)} style={{ width: 55, height: 24, border: '1px solid #fca5a5', borderRadius: 4, padding: '0 6px', fontSize: 10, fontFamily: 'monospace' }} />
          –
          <input type="number" value={freqEnd} onChange={(e) => setFreqEnd(parseFloat(e.target.value) || 80)} style={{ width: 55, height: 24, border: '1px solid #fca5a5', borderRadius: 4, padding: '0 6px', fontSize: 10, fontFamily: 'monospace' }} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'monospace', color: '#7f1d1d' }}>
          Step (Hz):
          <input type="number" step="0.5" value={step} onChange={(e) => setStep(Math.max(0.1, parseFloat(e.target.value) || 1))} style={{ width: 50, height: 24, border: '1px solid #fca5a5', borderRadius: 4, padding: '0 6px', fontSize: 10, fontFamily: 'monospace' }} />
        </label>
        <button
          onClick={runAudit}
          disabled={running || !canRun}
          style={{ height: 26, padding: '0 12px', borderRadius: 6, border: '1px solid #991b1b', background: running ? '#e5e7eb' : '#991b1b', color: running ? '#6b7280' : '#fff', fontSize: 10, fontFamily: 'monospace', cursor: running || !canRun ? 'not-allowed' : 'pointer', fontWeight: 600 }}
        >
          {running ? 'Running…' : 'Run Audit'}
        </button>
        {!canRun && <span style={{ fontSize: 9, color: '#b45309', fontFamily: 'monospace' }}>⚠ Need room dimensions.</span>}
      </div>

      {result && (
        <>
          {/* ── Mode reference table ── */}
          <div style={{ overflowX: 'auto', marginBottom: 8 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 600 }}>
              <thead>
                <tr>
                  <th style={{ ...thS, textAlign: 'left' }}>Mode</th>
                  <th style={{ ...thS, textAlign: 'left' }}>Family</th>
                  <th style={thS}>Native Freq (Hz)</th>
                  <th style={thS}>Q</th>
                </tr>
              </thead>
              <tbody>
                {result.modes.map((m) => (
                  <tr key={m.key} style={{ borderBottom: '1px solid #fecaca' }}>
                    <td style={{ ...tdS, textAlign: 'left', fontWeight: 700, color: MODE_COLORS[m.key] }}>({m.key})</td>
                    <td style={{ ...tdS, textAlign: 'left' }}>{m.family}</td>
                    <td style={tdS}>{fmt(m.modeFrequencyHz, 2)}</td>
                    <td style={tdS}>{fmt(m.qValue, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Chart 1: Normalised magnitude vs absolute frequency ── */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#991b1b', marginBottom: 4 }}>1. Normalised transfer magnitude vs absolute frequency</div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={result.chartAbs}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="frequencyHz" tick={{ fontSize: 9 }} label={{ value: 'Hz', position: 'insideBottomRight', fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} domain={[0, 1]} />
                <Tooltip contentStyle={{ fontSize: 10 }} />
                <Legend wrapperStyle={{ fontSize: 9 }} />
                {result.modes.map((m) => (
                  <Line key={m.key} type="monotone" dataKey={m.key} stroke={MODE_COLORS[m.key]} dot={false} strokeWidth={1.5} isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* ── Chart 2: vs Δf ── */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#991b1b', marginBottom: 4 }}>2. Normalised transfer magnitude vs Δf (test − mode freq)</div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={result.chartDeltaF}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="deltaFreqHz" tick={{ fontSize: 9 }} label={{ value: 'Δf (Hz)', position: 'insideBottomRight', fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} domain={[0, 1]} />
                <Tooltip contentStyle={{ fontSize: 10 }} />
                <Legend wrapperStyle={{ fontSize: 9 }} />
                {result.modes.map((m) => (
                  <Line key={m.key} type="monotone" dataKey={m.key} stroke={MODE_COLORS[m.key]} dot={false} strokeWidth={1.5} isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* ── Chart 3: vs fractional offset ── */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#991b1b', marginBottom: 4 }}>3. Normalised transfer magnitude vs fractional offset (Δf / modeFreq)</div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={result.chartFractional}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="fractionalOffset" tick={{ fontSize: 9 }} label={{ value: 'Δf / f₀', position: 'insideBottomRight', fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} domain={[0, 1]} />
                <Tooltip contentStyle={{ fontSize: 10 }} />
                <Legend wrapperStyle={{ fontSize: 9 }} />
                {result.modes.map((m) => (
                  <Line key={m.key} type="monotone" dataKey={m.key} stroke={MODE_COLORS[m.key]} dot={false} strokeWidth={1.5} isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* ── 4. Low-side skirt comparison table ── */}
          <div style={{ overflowX: 'auto', marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#991b1b', marginBottom: 4 }}>4. Low-side skirt comparison (normalised magnitude at Hz below resonance)</div>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 700 }}>
              <thead>
                <tr>
                  <th style={{ ...thS, textAlign: 'left' }}>Mode</th>
                  {[-5, -10, -15, -20, -25, -30].map((o) => <th key={o} style={thS}>{o} Hz</th>)}
                </tr>
              </thead>
              <tbody>
                {result.skirtLevels.map((r) => (
                  <tr key={r.key} style={{ borderBottom: '1px solid #fecaca' }}>
                    <td style={{ ...tdS, textAlign: 'left', fontWeight: 700, color: MODE_COLORS[r.key] }}>({r.key})</td>
                    {[-5, -10, -15, -20, -25, -30].map((o) => (
                      <td key={o} style={tdS}>{fmtPct(r.levels[o])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── 5. Low/high asymmetry table ── */}
          <div style={{ overflowX: 'auto', marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#991b1b', marginBottom: 4 }}>5. Low/high asymmetry (−3dB bandwidth, Hz)</div>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 600 }}>
              <thead>
                <tr>
                  <th style={{ ...thS, textAlign: 'left' }}>Mode</th>
                  <th style={thS}>Low BW (Hz)</th>
                  <th style={thS}>High BW (Hz)</th>
                  <th style={thS}>Asymmetry (Low/High)</th>
                </tr>
              </thead>
              <tbody>
                {result.bandwidthRows.map((r) => (
                  <tr key={r.key} style={{ borderBottom: '1px solid #fecaca' }}>
                    <td style={{ ...tdS, textAlign: 'left', fontWeight: 700, color: MODE_COLORS[r.key] }}>({r.key})</td>
                    <td style={tdS}>{fmt(r.lowBandwidthHz, 2)}</td>
                    <td style={tdS}>{fmt(r.highBandwidthHz, 2)}</td>
                    <td style={{ ...tdS, fontWeight: r.asymmetryRatio > 1.3 ? 700 : 400, color: r.asymmetryRatio > 1.3 ? '#dc2626' : undefined }}>{fmt(r.asymmetryRatio, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Final output ── */}
          <div style={{ border: '2px solid #991b1b', borderRadius: 6, background: '#fff', padding: '8px 10px', fontSize: 10, fontFamily: 'monospace', color: '#1c1917' }}>
            <div style={{ fontWeight: 700, color: '#991b1b', marginBottom: 6, fontSize: 11 }}>TRANSFER SKIRT RESULT:</div>
            <div>Does (0,2,0) low-side tail explain fast recovery: <strong style={{ color: result.diagnosis.m020ExplainsRecovery ? '#dc2626' : '#166534' }}>{result.diagnosis.m020ExplainsRecovery ? 'YES' : 'NO'}</strong></div>
            <div>Worst offending mode: <strong>{result.diagnosis.worstOffendingMode || '—'}</strong></div>
            <div>Worst offset: <strong>{result.diagnosis.worstOffset !== null && result.diagnosis.worstOffset !== undefined ? `${fmt(result.diagnosis.worstOffset, 1)} Hz` : '—'}</strong></div>
            <div>Magnitude excess: <strong>{result.diagnosis.magnitudeExcess !== null ? fmtPct(result.diagnosis.magnitudeExcess) : '—'}</strong></div>
            <div>Confidence: <strong>{result.diagnosis.confidence}</strong></div>
            <div>Next audit target: <strong>{result.diagnosis.nextAuditTarget}</strong></div>
            {result.diagnosis.flags.length > 0 && (
              <div style={{ marginTop: 6, borderTop: '1px solid #fecaca', paddingTop: 6 }}>
                {result.diagnosis.flags.map((f, i) => (
                  <div key={i} style={{ color: '#b45309' }}>⚠ {f}</div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}