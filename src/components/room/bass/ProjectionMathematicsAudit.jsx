// ProjectionMathematicsAudit.jsx
// Temporary diagnostic panel — Bass Response page.
// STRICT AUDIT: read-only. No physics/graph/Q/damping/weighting/phase/smoothing/summation changes.
// Determines whether the dominant modal vector itself changes incorrectly between ~39–50 Hz,
// or whether only its mathematical projection onto the final summed vector collapses.

import React, { useState, useCallback, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { fmt, buildProjectionSweep, computeFirstDeviationRanking } from '@/components/room/bass/projectionMathAuditEngine';

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

const thS = { textAlign: 'right', padding: '3px 5px', fontSize: 9, fontWeight: 700, background: '#eff6ff', borderBottom: '2px solid #93c5fd', color: '#1e3a8a', whiteSpace: 'nowrap' };
const tdS = { textAlign: 'right', padding: '2px 5px', fontSize: 9, fontFamily: 'monospace' };
const sectionBox = { border: '1px solid #93c5fd', borderRadius: 6, background: '#fff', padding: '8px 10px', marginBottom: 10 };
const sectionTitle = { fontWeight: 700, color: '#1e3a8a', fontSize: 11, fontFamily: 'monospace', marginBottom: 6 };

function heatColor(v) {
  const c = Math.max(0, Math.min(1, v));
  const r = Math.round(255 - c * 40);
  const g = Math.round(255 - c * 200);
  const b = Math.round(255 - c * 30);
  return `rgb(${r},${g},${b})`;
}

export default function ProjectionMathematicsAudit({ roomDims, seatingPositions, subsForSimulation, surfaceAbsorption }) {
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

    const sweep = buildProjectionSweep(Number(freqStart), Number(freqEnd), Number(step), rd, seatPos, subsForSimulation, surfaceAbsorption);
    const ranking = computeFirstDeviationRanking(sweep.rows, sweep.nullIdx);
    setResult({ ...sweep, ranking });
    setRunning(false);
  }, [canRun, effectiveSeatId, freqStart, freqEnd, step, roomDims, seatLabels, subsForSimulation, surfaceAbsorption]);

  const chartData = useMemo(() => {
    if (!result) return [];
    return result.rows.map((r) => ({
      hz: Number(r.frequencyHz.toFixed(2)),
      projectionRatio: r.projectionRatio,
      cosTheta: r.cosTheta,
      dotProduct: r.dotProduct,
      projectionLength: r.projectionLength,
      dominantMag: r.divisors.dominantMag,
      finalMag: r.divisors.finalMag,
      combinedMag: r.divisors.combinedMag,
      deltaProjectionRatio: r.deltaProjectionRatio,
      deltaProjectionLength: r.deltaProjectionLength,
    }));
  }, [result]);

  const heatmapRows = useMemo(() => {
    if (!result) return [];
    const norm = (arr) => { const max = Math.max(...arr.map((v) => Math.abs(v || 0)), 1e-9); return arr.map((v) => Math.abs(v || 0) / max); };
    const dot = norm(result.rows.map((r) => r.dotProduct));
    const projRatio = norm(result.rows.map((r) => r.projectionRatio ?? 0));
    const cos = norm(result.rows.map((r) => r.cosTheta ?? 0));
    const angle = norm(result.rows.map((r) => r.angleDifferenceDeg ?? 0));
    const norml = norm(result.rows.map((r) => r.divisors.combinedMag));
    // no frequency weighting / scaling at this stage — columns are explicitly all-zero
    const freqWeight = result.rows.map(() => 0);
    const scaling = result.rows.map(() => 0);
    const cols = { dot, projRatio, cos, angle, norml, freqWeight, scaling };
    // find first column whose normalized value crosses 0.6 earliest (from index 1)
    let firstCol = null, firstIdx = Infinity;
    Object.entries(cols).forEach(([key, arr]) => {
      const idx = arr.findIndex((v, i) => i > 0 && v > 0.6);
      if (idx >= 0 && idx < firstIdx) { firstIdx = idx; firstCol = key; }
    });
    return { cols, firstCol, firstIdx };
  }, [result]);

  const firstDeviation = result?.ranking?.find((c) => c.startFreq !== null) ?? null;
  const allValidated = result ? result.rows.every((r) => r.pass) && !firstDeviation : false;

  return (
    <div style={{ border: '2px solid #1d4ed8', borderRadius: 8, background: '#eff6ff', padding: '10px 12px', marginTop: 8, marginBottom: 8 }}>
      <div style={{ fontWeight: 700, color: '#1e3a8a', fontSize: 12, fontFamily: 'monospace', marginBottom: 4 }}>
        Projection Mathematics Audit
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          strict audit · temporary diagnostic · read-only from live engine · no physics/graph/Q/damping/weighting/phase/smoothing/summation changes
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'monospace', color: '#1e3a8a' }}>
          Seat:
          <select value={effectiveSeatId || ''} onChange={(e) => setSelectedSeatId(e.target.value)}
            style={{ height: 24, border: '1px solid #93c5fd', borderRadius: 4, padding: '0 6px', fontSize: 10, fontFamily: 'monospace' }}>
            {seatLabels.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'monospace', color: '#1e3a8a' }}>
          Start (Hz):
          <input type="number" step="1" value={freqStart} onChange={(e) => setFreqStart(parseFloat(e.target.value) || 20)}
            style={{ width: 55, height: 24, border: '1px solid #93c5fd', borderRadius: 4, padding: '0 6px', fontSize: 10, fontFamily: 'monospace' }} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'monospace', color: '#1e3a8a' }}>
          End (Hz):
          <input type="number" step="1" value={freqEnd} onChange={(e) => setFreqEnd(parseFloat(e.target.value) || 60)}
            style={{ width: 55, height: 24, border: '1px solid #93c5fd', borderRadius: 4, padding: '0 6px', fontSize: 10, fontFamily: 'monospace' }} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'monospace', color: '#1e3a8a' }}>
          Step (Hz):
          <input type="number" step="0.5" min="0.1" value={step} onChange={(e) => setStep(Math.max(0.1, parseFloat(e.target.value) || 1))}
            style={{ width: 50, height: 24, border: '1px solid #93c5fd', borderRadius: 4, padding: '0 6px', fontSize: 10, fontFamily: 'monospace' }} />
        </label>
        <button onClick={runAudit} disabled={running || !canRun}
          style={{ height: 26, padding: '0 12px', borderRadius: 6, border: '1px solid #1e3a8a', background: running ? '#e5e7eb' : '#1e3a8a', color: running ? '#6b7280' : '#fff', fontSize: 10, fontFamily: 'monospace', cursor: running || !canRun ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
          {running ? 'Running…' : 'Run Audit'}
        </button>
        {!canRun && <span style={{ fontSize: 9, color: '#b45309', fontFamily: 'monospace' }}>⚠ Need room dims, seat, ≥1 sub, and end ≥ start.</span>}
      </div>

      {result && (
        <>
          {/* Full per-frequency table */}
          <div style={sectionBox}>
            <div style={sectionTitle}>Per-Frequency Vectors, Projection Mathematics &amp; Evolution</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 2000 }}>
                <thead>
                  <tr>
                    <th style={thS}>Hz</th>
                    <th style={thS}>Dom Re</th><th style={thS}>Dom Im</th><th style={thS}>Dom Mag</th><th style={thS}>Dom °</th>
                    <th style={thS}>Fin Re</th><th style={thS}>Fin Im</th><th style={thS}>Fin Mag</th><th style={thS}>Fin °</th>
                    <th style={thS}>Dot</th><th style={thS}>Norm Dot</th><th style={thS}>Proj Len</th><th style={thS}>Proj Ratio</th><th style={thS}>Cos θ</th><th style={thS}>Δθ °</th>
                    <th style={thS}>ΔDom Re</th><th style={thS}>ΔDom Im</th><th style={thS}>ΔDom Mag</th><th style={thS}>ΔDom °</th>
                    <th style={thS}>ΔFin Re</th><th style={thS}>ΔFin Im</th><th style={thS}>ΔFin Mag</th><th style={thS}>ΔFin °</th>
                    <th style={thS}>ΔProjLen</th><th style={thS}>ΔProjRatio</th><th style={thS}>ΔDot</th><th style={thS}>ΔCosθ</th>
                    <th style={thS}>|Dom|</th><th style={thS}>|Fin|</th><th style={thS}>|Dom|×|Fin|</th><th style={thS}>Freq Weight</th>
                    <th style={thS}>Recon</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r, i) => (
                    <tr key={r.frequencyHz} style={{ borderBottom: '1px solid #dbeafe', background: i === result.nullIdx ? '#bfdbfe' : undefined }}>
                      <td style={{ ...tdS, fontWeight: 700, color: '#1e3a8a' }}>{fmt(r.frequencyHz, 1)}</td>
                      <td style={tdS}>{fmt(r.dominant.re, 4)}</td><td style={tdS}>{fmt(r.dominant.im, 4)}</td><td style={tdS}>{fmt(r.dominant.mag, 4)}</td><td style={tdS}>{fmt(r.dominant.phase, 1)}</td>
                      <td style={tdS}>{fmt(r.final.re, 4)}</td><td style={tdS}>{fmt(r.final.im, 4)}</td><td style={tdS}>{fmt(r.final.mag, 4)}</td><td style={tdS}>{fmt(r.final.phase, 1)}</td>
                      <td style={tdS}>{fmt(r.dotProduct, 5)}</td><td style={tdS}>{fmt(r.normalisedDotProduct, 4)}</td><td style={tdS}>{fmt(r.projectionLength, 4)}</td><td style={tdS}>{fmt(r.projectionRatio, 4)}</td><td style={tdS}>{fmt(r.cosTheta, 4)}</td><td style={tdS}>{fmt(r.angleDifferenceDeg, 1)}</td>
                      <td style={tdS}>{fmt(r.deltaDominant.re, 4)}</td><td style={tdS}>{fmt(r.deltaDominant.im, 4)}</td><td style={tdS}>{fmt(r.deltaDominant.mag, 4)}</td><td style={tdS}>{fmt(r.deltaDominant.phase, 1)}</td>
                      <td style={tdS}>{fmt(r.deltaFinal.re, 4)}</td><td style={tdS}>{fmt(r.deltaFinal.im, 4)}</td><td style={tdS}>{fmt(r.deltaFinal.mag, 4)}</td><td style={tdS}>{fmt(r.deltaFinal.phase, 1)}</td>
                      <td style={tdS}>{fmt(r.deltaProjectionLength, 4)}</td><td style={tdS}>{fmt(r.deltaProjectionRatio, 4)}</td><td style={tdS}>{fmt(r.deltaDotProduct, 5)}</td><td style={tdS}>{fmt(r.deltaCosTheta, 4)}</td>
                      <td style={tdS}>{fmt(r.divisors.dominantMag, 4)}</td><td style={tdS}>{fmt(r.divisors.finalMag, 4)}</td><td style={tdS}>{fmt(r.divisors.combinedMag, 4)}</td><td style={{ ...tdS, color: '#6b7280' }}>{r.frequencyWeighting}</td>
                      <td style={{ ...tdS, fontWeight: 700, color: r.pass ? '#166534' : '#b91c1c' }}>{r.pass ? 'PASS' : 'FAIL'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Chart A/D — Projection Ratio & Projection Length */}
          <div style={sectionBox}>
            <div style={sectionTitle}>Chart A/D — Projection Ratio &amp; Projection Length vs Frequency</div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hz" tick={{ fontSize: 9 }} />
                <YAxis yAxisId="ratio" tick={{ fontSize: 9 }} />
                <YAxis yAxisId="len" orientation="right" tick={{ fontSize: 9 }} />
                <Tooltip wrapperStyle={{ fontSize: 10 }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line yAxisId="ratio" type="monotone" dataKey="projectionRatio" name="Projection Ratio" stroke="#1d4ed8" dot={false} />
                <Line yAxisId="len" type="monotone" dataKey="projectionLength" name="Projection Length" stroke="#ea580c" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Chart B — Cos(theta) */}
          <div style={sectionBox}>
            <div style={sectionTitle}>Chart B — Cos(θ) vs Frequency</div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hz" tick={{ fontSize: 9 }} />
                <YAxis domain={[-1, 1]} tick={{ fontSize: 9 }} />
                <Tooltip wrapperStyle={{ fontSize: 10 }} />
                <Line type="monotone" dataKey="cosTheta" name="Cos(θ)" stroke="#7c3aed" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Chart C — Dot Product */}
          <div style={sectionBox}>
            <div style={sectionTitle}>Chart C — Dot Product vs Frequency</div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hz" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip wrapperStyle={{ fontSize: 10 }} />
                <Line type="monotone" dataKey="dotProduct" name="Dot Product" stroke="#059669" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Chart E — Normalisation factors */}
          <div style={sectionBox}>
            <div style={sectionTitle}>Chart E — Normalisation Factors (|Dominant|, |Final|, |Dominant|×|Final|)</div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hz" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip wrapperStyle={{ fontSize: 10 }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line type="monotone" dataKey="dominantMag" name="|Dominant|" stroke="#ea580c" dot={false} />
                <Line type="monotone" dataKey="finalMag" name="|Final|" stroke="#111827" dot={false} />
                <Line type="monotone" dataKey="combinedMag" name="|Dominant|×|Final|" stroke="#1d4ed8" strokeDasharray="4 3" dot={false} />
              </LineChart>
            </ResponsiveContainer>
            <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#6b7280', marginTop: 4 }}>
              No additional weighting, scaling, decay, or damping factor is applied at this projection stage — displayed as "None" in the table above.
            </div>
          </div>

          {/* Chart F/G — Derivatives */}
          <div style={sectionBox}>
            <div style={sectionTitle}>Chart F/G — ΔProjection Ratio &amp; ΔProjection Length (first derivative, per Hz)</div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hz" tick={{ fontSize: 9 }} />
                <YAxis yAxisId="r" tick={{ fontSize: 9 }} />
                <YAxis yAxisId="l" orientation="right" tick={{ fontSize: 9 }} />
                <Tooltip wrapperStyle={{ fontSize: 10 }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line yAxisId="r" type="monotone" dataKey="deltaProjectionRatio" name="ΔProjection Ratio" stroke="#dc2626" dot={false} />
                <Line yAxisId="l" type="monotone" dataKey="deltaProjectionLength" name="ΔProjection Length" stroke="#9333ea" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Chart H — Heatmap */}
          <div style={sectionBox}>
            <div style={sectionTitle}>Chart H — Heatmap (Normalized Magnitude of Change per Frequency)</div>
            <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#1e3a8a', marginBottom: 4 }}>
              First column to change rapidly: <strong>{heatmapRows.firstCol ?? 'none crossed threshold'}</strong>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900 }}>
                <thead>
                  <tr>
                    <th style={thS}>Hz</th><th style={thS}>Dot</th><th style={thS}>Proj Ratio</th><th style={thS}>Cos θ</th><th style={thS}>Angle Δ</th><th style={thS}>Normalisation</th><th style={thS}>Freq Weight</th><th style={thS}>Scaling</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r, i) => (
                    <tr key={r.frequencyHz}>
                      <td style={{ ...tdS, fontWeight: 700 }}>{fmt(r.frequencyHz, 1)}</td>
                      <td style={{ ...tdS, background: heatColor(heatmapRows.cols.dot[i]) }}>{fmt(heatmapRows.cols.dot[i], 2)}</td>
                      <td style={{ ...tdS, background: heatColor(heatmapRows.cols.projRatio[i]) }}>{fmt(heatmapRows.cols.projRatio[i], 2)}</td>
                      <td style={{ ...tdS, background: heatColor(heatmapRows.cols.cos[i]) }}>{fmt(heatmapRows.cols.cos[i], 2)}</td>
                      <td style={{ ...tdS, background: heatColor(heatmapRows.cols.angle[i]) }}>{fmt(heatmapRows.cols.angle[i], 2)}</td>
                      <td style={{ ...tdS, background: heatColor(heatmapRows.cols.norml[i]) }}>{fmt(heatmapRows.cols.norml[i], 2)}</td>
                      <td style={{ ...tdS, background: '#f3f4f6', color: '#6b7280' }}>None</td>
                      <td style={{ ...tdS, background: '#f3f4f6', color: '#6b7280' }}>None</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Ranked analysis */}
          <div style={sectionBox}>
            <div style={sectionTitle}>Automatic Analysis — Ranked "First to Change"</div>
            {result.ranking.map((c) => (
              <div key={c.name} style={{ fontSize: 10, fontFamily: 'monospace', color: '#1e3a8a', marginBottom: 3 }}>
                <strong>{c.name}</strong> — Start Frequency: {c.startFreq !== null ? `${fmt(c.startFreq, 1)} Hz` : 'not detected'} — Rate of Change: {fmt(c.rateOfChange, 5)}/Hz — Confidence: {c.confidence}%
              </div>
            ))}
          </div>

          {/* Final conclusion */}
          <div style={{ border: '2px solid #1e3a8a', borderRadius: 6, background: '#bfdbfe', padding: '10px 12px', fontSize: 11, fontFamily: 'monospace', color: '#1e3a8a' }}>
            {allValidated ? (
              <>
                <div style={{ fontWeight: 700 }}>Projection mathematics validated.</div>
                <div>Root cause must exist upstream of projection.</div>
              </>
            ) : firstDeviation ? (
              <>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>FIRST MATHEMATICAL DEVIATION OBSERVED:</div>
                <div>Variable: <strong>{firstDeviation.name}</strong></div>
                <div>Frequency: <strong>{fmt(firstDeviation.startFreq, 1)} Hz</strong></div>
                <div>Magnitude of change: <strong>rate {fmt(firstDeviation.rateOfChange, 5)}/Hz</strong></div>
                <div>Confidence: <strong>{firstDeviation.confidence}%</strong></div>
              </>
            ) : (
              <div style={{ fontWeight: 700 }}>Reconstruction mismatch detected — see Recon column above (measurements only, no fix proposed).</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}