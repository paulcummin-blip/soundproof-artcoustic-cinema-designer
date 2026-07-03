// PhaseEvolutionModalTransferAudit.jsx
// Temporary diagnostic panel — Bass Response page.
// STRICT AUDIT: read-only. No physics/graph/Q/damping/weighting changes.
// Investigates WHY the ~30–40 Hz null recovers faster than REW by measuring
// phase velocity/acceleration, projection rate, magnitude growth, complex
// rotation, cancellation efficiency, transfer curvature, interpolation error,
// multi-mode competition, modal bandwidth, dominance ratio, phase separation,
// a correlation matrix, and an automatic root-cause ranking + timeline.

import React, { useState, useCallback, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { fmt, buildSweep, computeRootCauseRanking, buildTimeline } from '@/components/room/bass/phaseEvolutionAuditEngine';

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

const thS = { textAlign: 'right', padding: '3px 5px', fontSize: 9, fontWeight: 700, background: '#fdf2f8', borderBottom: '2px solid #f9a8d4', color: '#831843', whiteSpace: 'nowrap' };
const tdS = { textAlign: 'right', padding: '2px 5px', fontSize: 9, fontFamily: 'monospace' };
const sectionBox = { border: '1px solid #f9a8d4', borderRadius: 6, background: '#fff', padding: '8px 10px', marginBottom: 10 };
const sectionTitle = { fontWeight: 700, color: '#831843', fontSize: 11, fontFamily: 'monospace', marginBottom: 6 };

function heatColor(v) {
  // v is 0..1 normalized magnitude of change
  const c = Math.max(0, Math.min(1, v));
  const r = Math.round(255 - c * 40);
  const g = Math.round(255 - c * 200);
  const b = Math.round(255 - c * 200);
  return `rgb(${r},${g},${b})`;
}

export default function PhaseEvolutionModalTransferAudit({ roomDims, seatingPositions, subsForSimulation, surfaceAbsorption }) {
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

    const sweep = buildSweep(Number(freqStart), Number(freqEnd), Number(step), rd, seatPos, subsForSimulation, surfaceAbsorption);
    const candidates = computeRootCauseRanking(sweep.rows, sweep.nullIdx);
    const timeline = buildTimeline(sweep.rows, sweep.nullIdx, candidates);
    setResult({ ...sweep, candidates, timeline });
    setRunning(false);
  }, [canRun, effectiveSeatId, freqStart, freqEnd, step, roomDims, seatLabels, subsForSimulation, surfaceAbsorption]);

  const chartData = useMemo(() => {
    if (!result) return [];
    return result.rows.map((r) => ({
      hz: Number(r.frequencyHz.toFixed(2)),
      phaseVelDirect: r.phaseVelocity?.direct ?? null,
      phaseVelDominant: r.phaseVelocity?.dominant ?? null,
      phaseVelRemaining: r.phaseVelocity?.remaining ?? null,
      phaseVelFinal: r.phaseVelocity?.final ?? null,
      angAccelDominant: r.angularAcceleration?.dominant ?? null,
      projVelDirect: r.projectionVelocity?.direct ?? null,
      projVelDominant: r.projectionVelocity?.dominant ?? null,
      projVelRemaining: r.projectionVelocity?.remaining ?? null,
      projAccelDominant: r.projectionAcceleration?.dominant ?? null,
      magGrowthDirect: r.magnitudeGrowthRate?.direct ?? null,
      magGrowthDominant: r.magnitudeGrowthRate?.dominant ?? null,
      magGrowthRemaining: r.magnitudeGrowthRate?.remaining ?? null,
      cancelRatio: r.cancellationEfficiencyRatio,
      dominanceRatio: r.dominanceRatio,
      transferCurvatureMag: r.transferCurvature?.magnitude ?? null,
      dirMinusDom: r.phaseSeparation?.directMinusDominant,
      dirMinusRem: r.phaseSeparation?.directMinusRemaining,
      dirMinusFinal: r.phaseSeparation?.directMinusFinal,
      domMinusFinal: r.phaseSeparation?.dominantMinusFinal,
    }));
  }, [result]);

  const firstMechanism = result?.candidates?.[0] ?? null;

  return (
    <div style={{ border: '2px solid #be185d', borderRadius: 8, background: '#fdf2f8', padding: '10px 12px', marginTop: 8, marginBottom: 8 }}>
      <div style={{ fontWeight: 700, color: '#831843', fontSize: 12, fontFamily: 'monospace', marginBottom: 4 }}>
        Phase Evolution &amp; Modal Transfer Investigation
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          strict audit · temporary diagnostic · read-only from live engine · no physics/graph/Q/damping/weighting changes
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'monospace', color: '#831843' }}>
          Seat:
          <select value={effectiveSeatId || ''} onChange={(e) => setSelectedSeatId(e.target.value)}
            style={{ height: 24, border: '1px solid #f9a8d4', borderRadius: 4, padding: '0 6px', fontSize: 10, fontFamily: 'monospace' }}>
            {seatLabels.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'monospace', color: '#831843' }}>
          Start (Hz):
          <input type="number" step="1" value={freqStart} onChange={(e) => setFreqStart(parseFloat(e.target.value) || 20)}
            style={{ width: 55, height: 24, border: '1px solid #f9a8d4', borderRadius: 4, padding: '0 6px', fontSize: 10, fontFamily: 'monospace' }} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'monospace', color: '#831843' }}>
          End (Hz):
          <input type="number" step="1" value={freqEnd} onChange={(e) => setFreqEnd(parseFloat(e.target.value) || 60)}
            style={{ width: 55, height: 24, border: '1px solid #f9a8d4', borderRadius: 4, padding: '0 6px', fontSize: 10, fontFamily: 'monospace' }} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'monospace', color: '#831843' }}>
          Step (Hz):
          <input type="number" step="0.5" min="0.1" value={step} onChange={(e) => setStep(Math.max(0.1, parseFloat(e.target.value) || 1))}
            style={{ width: 50, height: 24, border: '1px solid #f9a8d4', borderRadius: 4, padding: '0 6px', fontSize: 10, fontFamily: 'monospace' }} />
        </label>
        <button onClick={runAudit} disabled={running || !canRun}
          style={{ height: 26, padding: '0 12px', borderRadius: 6, border: '1px solid #831843', background: running ? '#e5e7eb' : '#831843', color: running ? '#6b7280' : '#fff', fontSize: 10, fontFamily: 'monospace', cursor: running || !canRun ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
          {running ? 'Running…' : 'Run Audit'}
        </button>
        {!canRun && <span style={{ fontSize: 9, color: '#b45309', fontFamily: 'monospace' }}>⚠ Need room dims, seat, ≥1 sub, and end ≥ start.</span>}
      </div>

      {result && (
        <>
          {/* Existing measurements retained — full per-frequency vector table */}
          <div style={sectionBox}>
            <div style={sectionTitle}>Existing Measurements (retained) — Vectors, Projections, Cancellation</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 1500 }}>
                <thead>
                  <tr>
                    <th style={thS}>Hz</th>
                    <th style={thS}>Dir Mag</th><th style={thS}>Dir °</th>
                    <th style={thS}>Dom Mag</th><th style={thS}>Dom °</th>
                    <th style={thS}>Rem Mag</th><th style={thS}>Rem °</th>
                    <th style={thS}>Final Mag</th><th style={thS}>Final °</th><th style={thS}>Final SPL</th>
                    <th style={thS}>Dir Proj</th><th style={thS}>Dom Proj</th><th style={thS}>Rem Proj</th>
                    <th style={thS}>Cancel %</th><th style={thS}>Residual %</th>
                    <th style={thS}>Match</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r, i) => (
                    <tr key={r.frequencyHz} style={{ borderBottom: '1px solid #fce7f3', background: i === result.nullIdx ? '#fbcfe8' : undefined }}>
                      <td style={{ ...tdS, fontWeight: 700, color: '#831843' }}>{fmt(r.frequencyHz, 1)}</td>
                      <td style={tdS}>{fmt(r.direct.mag, 4)}</td><td style={tdS}>{fmt(r.direct.phase, 1)}</td>
                      <td style={tdS}>{fmt(r.dominant.mag, 4)}</td><td style={tdS}>{fmt(r.dominant.phase, 1)}</td>
                      <td style={tdS}>{fmt(r.remaining.mag, 4)}</td><td style={tdS}>{fmt(r.remaining.phase, 1)}</td>
                      <td style={tdS}>{fmt(r.final.mag, 4)}</td><td style={tdS}>{fmt(r.final.phase, 1)}</td><td style={{ ...tdS, fontWeight: 700 }}>{fmt(r.final.splDb, 2)}</td>
                      <td style={tdS}>{fmt(r.directProj, 4)}</td><td style={tdS}>{fmt(r.dominantProj, 4)}</td><td style={tdS}>{fmt(r.remainingProj, 4)}</td>
                      <td style={tdS}>{fmt(r.cancellationEfficiency, 1)}%</td><td style={tdS}>{fmt(r.residualCancellation, 1)}%</td>
                      <td style={{ ...tdS, fontWeight: 700, color: r.pass ? '#166534' : '#b91c1c' }}>{r.pass ? 'PASS' : 'FAIL'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* A/B/E — Phase velocity + angular acceleration + complex rotation */}
          <div style={sectionBox}>
            <div style={sectionTitle}>A/B/E — Phase Velocity, Angular Acceleration &amp; Complex Rotation Rate (deg/Hz, deg/Hz²)</div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hz" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip wrapperStyle={{ fontSize: 10 }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line type="monotone" dataKey="phaseVelDirect" name="Phase vel Direct" stroke="#2563eb" dot={false} />
                <Line type="monotone" dataKey="phaseVelDominant" name="Phase vel Dominant" stroke="#ea580c" dot={false} />
                <Line type="monotone" dataKey="phaseVelRemaining" name="Phase vel Remaining" stroke="#7c3aed" dot={false} />
                <Line type="monotone" dataKey="phaseVelFinal" name="Phase vel Final" stroke="#111827" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="angAccelDominant" name="Ang. accel Dominant" stroke="#dc2626" strokeDasharray="4 3" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* C — Projection velocity/acceleration */}
          <div style={sectionBox}>
            <div style={sectionTitle}>C — Vector Projection Rate (Velocity &amp; Acceleration, per Hz)</div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hz" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip wrapperStyle={{ fontSize: 10 }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line type="monotone" dataKey="projVelDirect" name="Proj vel Direct" stroke="#2563eb" dot={false} />
                <Line type="monotone" dataKey="projVelDominant" name="Proj vel Dominant" stroke="#ea580c" dot={false} />
                <Line type="monotone" dataKey="projVelRemaining" name="Proj vel Remaining" stroke="#7c3aed" dot={false} />
                <Line type="monotone" dataKey="projAccelDominant" name="Proj accel Dominant" stroke="#dc2626" strokeDasharray="4 3" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* D — Magnitude growth rate */}
          <div style={sectionBox}>
            <div style={sectionTitle}>D — Magnitude Growth Rate (ΔMagnitude / Hz)</div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hz" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip wrapperStyle={{ fontSize: 10 }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line type="monotone" dataKey="magGrowthDirect" name="Growth Direct" stroke="#2563eb" dot={false} />
                <Line type="monotone" dataKey="magGrowthDominant" name="Growth Dominant" stroke="#ea580c" dot={false} />
                <Line type="monotone" dataKey="magGrowthRemaining" name="Growth Remaining" stroke="#7c3aed" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* F/K — Cancellation efficiency ratio + dominance ratio */}
          <div style={sectionBox}>
            <div style={sectionTitle}>F/K — Cancellation Efficiency (Final / Σ Individual Mags) &amp; Dominance Ratio (Top/2nd Mode)</div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hz" tick={{ fontSize: 9 }} />
                <YAxis yAxisId="ratio" tick={{ fontSize: 9 }} />
                <YAxis yAxisId="dom" orientation="right" tick={{ fontSize: 9 }} />
                <Tooltip wrapperStyle={{ fontSize: 10 }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line yAxisId="ratio" type="monotone" dataKey="cancelRatio" name="Cancellation efficiency ratio" stroke="#059669" dot={false} />
                <Line yAxisId="dom" type="monotone" dataKey="dominanceRatio" name="Dominance ratio" stroke="#9333ea" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* G — Transfer curvature */}
          <div style={sectionBox}>
            <div style={sectionTitle}>G — Transfer Function Curvature (Dominant Mode, 2nd Derivative of Magnitude)</div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hz" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip wrapperStyle={{ fontSize: 10 }} />
                <Line type="monotone" dataKey="transferCurvatureMag" name="Curvature (mag)" stroke="#b91c1c" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* H — Interpolation stability */}
          <div style={sectionBox}>
            <div style={sectionTitle}>H — Frequency Interpolation Stability</div>
            <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#831843' }}>
              Max interpolation error: <strong>{fmt(Math.max(...result.rows.map((r) => r.interpolationErrorHz)), 6)} Hz</strong>
              {' '}— {Math.max(...result.rows.map((r) => r.interpolationErrorHz)) < 1e-6 ? 'engine solves the exact requested frequency; no interpolation curvature observed via this API.' : 'non-zero deviation detected between requested and actual bin.'}
            </div>
          </div>

          {/* I — Multi-mode competition (top 5 contributors) */}
          <div style={sectionBox}>
            <div style={sectionTitle}>I — Multi-Mode Competition (Top 5 Contributors per Frequency)</div>
            <div style={{ overflowX: 'auto', maxHeight: 300, overflowY: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900 }}>
                <thead>
                  <tr>
                    <th style={thS}>Hz</th><th style={thS}>Rank</th><th style={thS}>Mode</th><th style={thS}>Mag</th><th style={thS}>Proj</th><th style={thS}>Phase °</th><th style={thS}>Contrib %</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.flatMap((r) => r.top5.map((m, rank) => (
                    <tr key={`${r.frequencyHz}-${m.key}`} style={{ borderBottom: rank === r.top5.length - 1 ? '1px solid #fce7f3' : 'none' }}>
                      <td style={tdS}>{rank === 0 ? fmt(r.frequencyHz, 1) : ''}</td>
                      <td style={tdS}>{rank + 1}</td>
                      <td style={tdS}>{m.key} ({fmt(m.modeFrequencyHz, 1)}Hz {m.modeType})</td>
                      <td style={tdS}>{fmt(m.mag, 4)}</td>
                      <td style={tdS}>{fmt(m.projection, 4)}</td>
                      <td style={tdS}>{fmt(m.phase, 1)}</td>
                      <td style={tdS}>{fmt(m.contributionPct, 1)}%</td>
                    </tr>
                  )))}
                </tbody>
              </table>
            </div>
          </div>

          {/* J — Modal bandwidth */}
          <div style={sectionBox}>
            <div style={sectionTitle}>J — Modal Bandwidth (Tracked Dominant Mode)</div>
            <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#831843', lineHeight: 1.6 }}>
              Peak: {fmt(result.modalBandwidth.peakFreq, 1)} Hz ({fmt(result.modalBandwidth.peakMagDb, 2)} dB) · Mode's native frequency: {fmt(result.modalBandwidth.trackedModeFrequencyHz, 2)} Hz<br />
              -3dB bandwidth: {result.modalBandwidth.bw3Db ? `${fmt(result.modalBandwidth.bw3Db.lo, 1)}–${fmt(result.modalBandwidth.bw3Db.hi, 1)} Hz (${fmt(result.modalBandwidth.bw3Db.bw, 2)} Hz)` : 'not captured within sweep range'}<br />
              -6dB bandwidth: {result.modalBandwidth.bw6Db ? `${fmt(result.modalBandwidth.bw6Db.lo, 1)}–${fmt(result.modalBandwidth.bw6Db.hi, 1)} Hz (${fmt(result.modalBandwidth.bw6Db.bw, 2)} Hz)` : 'not captured within sweep range'}<br />
              Measured Effective Q: <strong>{fmt(result.modalBandwidth.measuredEffectiveQ, 2)}</strong> (derived from -3dB bandwidth of the actual production transfer function; no independently "calculated Q" is exposed by this engine API for comparison — reported as measured only).
            </div>
          </div>

          {/* L — Phase separation */}
          <div style={sectionBox}>
            <div style={sectionTitle}>L — Phase Separation (Direct vs Dominant / Remaining / Final)</div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hz" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip wrapperStyle={{ fontSize: 10 }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line type="monotone" dataKey="dirMinusDom" name="Direct−Dominant" stroke="#ea580c" dot={false} />
                <Line type="monotone" dataKey="dirMinusRem" name="Direct−Remaining" stroke="#7c3aed" dot={false} />
                <Line type="monotone" dataKey="dirMinusFinal" name="Direct−Final" stroke="#111827" dot={false} />
                <Line type="monotone" dataKey="domMinusFinal" name="Dominant−Final" stroke="#059669" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* M — Correlation matrix (heatmap) */}
          <div style={sectionBox}>
            <div style={sectionTitle}>M — Correlation Matrix (Normalized Magnitude of Change per Frequency)</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900 }}>
                <thead>
                  <tr>
                    <th style={thS}>Hz</th><th style={thS}>Phase Vel</th><th style={thS}>Proj Vel</th><th style={thS}>Mag Growth</th><th style={thS}>Cancel Eff</th><th style={thS}>Curvature</th><th style={thS}>Dominance</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const norm = (arr) => { const max = Math.max(...arr.map((v) => Math.abs(v || 0)), 1e-9); return arr.map((v) => Math.abs(v || 0) / max); };
                    const phaseVelArr = norm(chartData.map((d) => d.phaseVelDominant));
                    const projVelArr = norm(chartData.map((d) => d.projVelDominant));
                    const magGrowthArr = norm(chartData.map((d) => d.magGrowthDominant));
                    const cancelArr = norm(chartData.map((d) => d.cancelRatio));
                    const curveArr = norm(chartData.map((d) => d.transferCurvatureMag));
                    const domArr = norm(chartData.map((d) => (d.dominanceRatio ? 1 / d.dominanceRatio : 0)));
                    return chartData.map((d, i) => (
                      <tr key={d.hz}>
                        <td style={{ ...tdS, fontWeight: 700 }}>{fmt(d.hz, 1)}</td>
                        <td style={{ ...tdS, background: heatColor(phaseVelArr[i]) }}>{fmt(phaseVelArr[i], 2)}</td>
                        <td style={{ ...tdS, background: heatColor(projVelArr[i]) }}>{fmt(projVelArr[i], 2)}</td>
                        <td style={{ ...tdS, background: heatColor(magGrowthArr[i]) }}>{fmt(magGrowthArr[i], 2)}</td>
                        <td style={{ ...tdS, background: heatColor(cancelArr[i]) }}>{fmt(cancelArr[i], 2)}</td>
                        <td style={{ ...tdS, background: heatColor(curveArr[i]) }}>{fmt(curveArr[i], 2)}</td>
                        <td style={{ ...tdS, background: heatColor(domArr[i]) }}>{fmt(domArr[i], 2)}</td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          </div>

          {/* Root cause ranking */}
          <div style={sectionBox}>
            <div style={sectionTitle}>Automatic Root Cause Ranking</div>
            {result.candidates.map((c) => (
              <div key={c.name} style={{ fontSize: 10, fontFamily: 'monospace', color: '#831843', marginBottom: 3 }}>
                <strong>{c.name}</strong> — Confidence {c.confidence}% — {c.crossFreq !== null ? `Started at ${fmt(c.crossFreq, 1)} Hz` : (c.status === 'rejected' ? 'Rejected' : 'No evidence')}
              </div>
            ))}
          </div>

          {/* Timeline */}
          <div style={sectionBox}>
            <div style={sectionTitle}>Required Timeline</div>
            {result.timeline.map((e, i) => (
              <div key={i} style={{ fontSize: 10, fontFamily: 'monospace', color: '#831843' }}>
                <strong>{fmt(e.frequencyHz, 1)} Hz</strong> — {e.label}
              </div>
            ))}
          </div>

          {/* Final output */}
          <div style={{ border: '2px solid #831843', borderRadius: 6, background: '#fbcfe8', padding: '10px 12px', fontSize: 11, fontFamily: 'monospace', color: '#831843' }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>FIRST MECHANISM TO DEVIATE FROM IDEAL</div>
            {firstMechanism ? (
              <>
                <div>Variable: <strong>{firstMechanism.name}</strong></div>
                <div>Frequency: <strong>{firstMechanism.crossFreq !== null ? `${fmt(firstMechanism.crossFreq, 1)} Hz` : 'not detected within sweep'}</strong></div>
                <div>Measured Change: <strong>{firstMechanism.confidence}% deviation from null-centre baseline</strong></div>
                <div>Likely Responsible: <strong>{firstMechanism.name}</strong> ({firstMechanism.status})</div>
                <div>Confidence: <strong>{firstMechanism.confidence}%</strong></div>
                <div>Recommended Next Physics Test: <em>none — this audit only reports measurements, no fixes are proposed.</em></div>
              </>
            ) : <div>No candidates evaluated.</div>}
          </div>
        </>
      )}
    </div>
  );
}