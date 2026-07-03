// DominantModeConstructionAudit.jsx
// Temporary diagnostic panel — Bass Response page.
// STRICT AUDIT: read-only. No physics/graph/Q/damping/weighting/graph/SPL changes.
// Exposes every mathematical term in the construction of the already-tracked dominant
// mode (source coupling → transfer function → Q/damping → final vector) to find the
// first physical quantity that begins diverging between ~30–50 Hz.

import React, { useState, useCallback, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import {
  fmt, buildDominantModeConstructionSweep, computeCorrelationRanking, computeRootCauseRanking,
} from '@/components/room/bass/dominantModeConstructionAuditEngine';

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

const thS = { textAlign: 'right', padding: '3px 5px', fontSize: 9, fontWeight: 700, background: '#fef2f2', borderBottom: '2px solid #fca5a5', color: '#991b1b', whiteSpace: 'nowrap' };
const tdS = { textAlign: 'right', padding: '2px 5px', fontSize: 9, fontFamily: 'monospace' };
const sectionBox = { border: '1px solid #fca5a5', borderRadius: 6, background: '#fff', padding: '8px 10px', marginBottom: 10 };
const sectionTitle = { fontWeight: 700, color: '#991b1b', fontSize: 11, fontFamily: 'monospace', marginBottom: 6 };

function heatColor(v) {
  const c = Math.max(0, Math.min(1, v));
  return `rgb(${Math.round(255 - c * 30)},${Math.round(255 - c * 200)},${Math.round(255 - c * 200)})`;
}

export default function DominantModeConstructionAudit({ roomDims, seatingPositions, subsForSimulation, surfaceAbsorption }) {
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

    const sweep = buildDominantModeConstructionSweep(Number(freqStart), Number(freqEnd), Number(step), rd, seatPos, subsForSimulation, surfaceAbsorption);
    const correlations = computeCorrelationRanking(sweep.rows, sweep.scalarGetters);
    const ranking = computeRootCauseRanking(sweep.rows, sweep.nullIdx, sweep.scalarGetters);
    setResult({ ...sweep, correlations, ranking });
    setRunning(false);
  }, [canRun, effectiveSeatId, freqStart, freqEnd, step, roomDims, seatLabels, subsForSimulation, surfaceAbsorption]);

  const chartData = useMemo(() => {
    if (!result) return [];
    return result.rows.map((r) => ({
      hz: Number(r.frequencyHz.toFixed(2)),
      mag: r.reconstructedMag,
      phase: r.reconstructedPhase,
      qValue: r.physics.qValue,
      coupling: r.distance?.combinedCoupling ?? 0,
      distanceLossDb: r.distance?.distanceLossDb ?? 0,
      transferMag: r.transfer.magnitude,
      dMag: r.derivative1?.reconstructedMag ?? null,
      d2Mag: r.derivative2?.reconstructedMag ?? null,
      zMag: r.zScore?.reconstructedMag ?? null,
    }));
  }, [result]);

  const heatmapCols = useMemo(() => {
    if (!result) return null;
    const norm = (arr) => { const max = Math.max(...arr.map((v) => Math.abs(v || 0)), 1e-9); return arr.map((v) => Math.abs(v || 0) / max); };
    const cols = {
      transferMag: norm(result.rows.map((r) => r.transfer.magnitude)),
      qValue: norm(result.rows.map((r) => r.physics.qValue)),
      coupling: norm(result.rows.map((r) => r.distance?.combinedCoupling ?? 0)),
      distanceLossDb: norm(result.rows.map((r) => r.distance?.distanceLossDb ?? 0)),
      derivative1: norm(result.rows.map((r) => r.derivative1?.reconstructedMag ?? 0)),
      pctChange: norm(result.rows.map((r) => r.pctChange?.reconstructedMag ?? 0)),
    };
    let firstCol = null, firstIdx = Infinity;
    Object.entries(cols).forEach(([key, arr]) => {
      const idx = arr.findIndex((v, i) => i > 0 && v > 0.6);
      if (idx >= 0 && idx < firstIdx) { firstIdx = idx; firstCol = key; }
    });
    return { cols, firstCol };
  }, [result]);

  const timelineEvents = useMemo(() => {
    if (!result) return [];
    const events = [];
    result.rows.forEach((r, i) => {
      if (i === 0) return;
      const prev = result.rows[i - 1];
      const checks = [
        ['Q begins changing', Math.abs(r.physics.qValue - prev.physics.qValue) / Math.max(Math.abs(prev.physics.qValue), 1e-9) > 0.05],
        ['Source/listener coupling begins changing', Math.abs((r.distance?.combinedCoupling ?? 0) - (prev.distance?.combinedCoupling ?? 0)) / Math.max(Math.abs(prev.distance?.combinedCoupling ?? 0), 1e-9) > 0.1],
        ['Distance attenuation begins changing', Math.abs((r.distance?.distanceLossDb ?? 0) - (prev.distance?.distanceLossDb ?? 0)) > 0.05],
        ['Dominant magnitude begins accelerating', Math.abs(r.derivative2?.reconstructedMag ?? 0) > 0.001],
      ];
      checks.forEach(([label, fired]) => {
        if (fired && !events.some((e) => e.label === label)) events.push({ hz: r.frequencyHz, label });
      });
    });
    return events.sort((a, b) => a.hz - b.hz);
  }, [result]);

  const firstDeviation = result?.ranking?.find((c) => c.startFreq !== null) ?? null;
  const allValidated = result ? result.rows.every((r) => r.pass) && !firstDeviation : false;

  return (
    <div style={{ border: '2px solid #b91c1c', borderRadius: 8, background: '#fef2f2', padding: '10px 12px', marginTop: 8, marginBottom: 8 }}>
      <div style={{ fontWeight: 700, color: '#991b1b', fontSize: 12, fontFamily: 'monospace', marginBottom: 4 }}>
        Dominant Mode Construction Audit
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          strict audit · temporary diagnostic · read-only · no physics/graph/Q/damping/weighting/SPL changes
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
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'monospace', color: '#991b1b' }}>
          Start (Hz): <input type="number" step="1" value={freqStart} onChange={(e) => setFreqStart(parseFloat(e.target.value) || 20)}
            style={{ width: 55, height: 24, border: '1px solid #fca5a5', borderRadius: 4, padding: '0 6px', fontSize: 10, fontFamily: 'monospace' }} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'monospace', color: '#991b1b' }}>
          End (Hz): <input type="number" step="1" value={freqEnd} onChange={(e) => setFreqEnd(parseFloat(e.target.value) || 60)}
            style={{ width: 55, height: 24, border: '1px solid #fca5a5', borderRadius: 4, padding: '0 6px', fontSize: 10, fontFamily: 'monospace' }} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'monospace', color: '#991b1b' }}>
          Step (Hz): <input type="number" step="0.5" min="0.1" value={step} onChange={(e) => setStep(Math.max(0.1, parseFloat(e.target.value) || 1))}
            style={{ width: 50, height: 24, border: '1px solid #fca5a5', borderRadius: 4, padding: '0 6px', fontSize: 10, fontFamily: 'monospace' }} />
        </label>
        <button onClick={runAudit} disabled={running || !canRun}
          style={{ height: 26, padding: '0 12px', borderRadius: 6, border: '1px solid #991b1b', background: running ? '#e5e7eb' : '#991b1b', color: running ? '#6b7280' : '#fff', fontSize: 10, fontFamily: 'monospace', cursor: running || !canRun ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
          {running ? 'Running…' : 'Run Audit'}
        </button>
        {!canRun && <span style={{ fontSize: 9, color: '#b45309', fontFamily: 'monospace' }}>⚠ Need room dims, seat, ≥1 sub, and end ≥ start.</span>}
      </div>

      {result && (
        <>
          {/* Stage 1+2+4 identity & physics summary (constant per mode, shown once) */}
          <div style={sectionBox}>
            <div style={sectionTitle}>Tracked Dominant Mode — Identity &amp; Physics Terms</div>
            <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#991b1b', lineHeight: 1.6 }}>
              <div><strong>Mode ID:</strong> {result.rows[0]?.modeId} — <strong>Family:</strong> {result.rows[0]?.family} — <strong>Native Frequency:</strong> {fmt(result.rows[0]?.nativeFrequencyHz, 2)} Hz — <strong>Mode Order:</strong> {result.rows[0]?.modeOrder}</div>
              <div><strong>Stored Energy Term:</strong> {result.rows[0]?.physics.storedEnergyTerm}</div>
              <div><strong>Frequency-Dependent Correction:</strong> {result.rows[0]?.physics.frequencyDependentCorrection}</div>
              <div><strong>Modal Weighting:</strong> {result.rows[0]?.physics.modalWeighting}</div>
              <div><strong>Interpolation:</strong> {result.rows[0]?.physics.interpolation}</div>
            </div>
          </div>

          {/* Per-frequency full construction table */}
          <div style={sectionBox}>
            <div style={sectionTitle}>Per-Frequency Construction Stages, Deltas &amp; Reconstruction</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 2200 }}>
                <thead>
                  <tr>
                    <th style={thS}>Hz</th>
                    <th style={thS}>Num Re</th><th style={thS}>Num Im</th><th style={thS}>Den Re</th><th style={thS}>Den Im</th>
                    <th style={thS}>TF Mag</th><th style={thS}>TF °</th><th style={thS}>TF Re</th><th style={thS}>TF Im</th>
                    <th style={thS}>Src→Mode &amp; Mode→Listener Coupling</th><th style={thS}>Dist Atten dB</th><th style={thS}>Room Norm</th>
                    <th style={thS}>Q</th><th style={thS}>Bandwidth</th><th style={thS}>Damping ζ</th><th style={thS}>Loss 1/Q</th><th style={thS}>Decay τ</th>
                    <th style={thS}>Final Mag</th><th style={thS}>Final °</th><th style={thS}>Final Re</th><th style={thS}>Final Im</th>
                    <th style={thS}>ΔMag</th><th style={thS}>Δ°</th><th style={thS}>ΔRe</th><th style={thS}>ΔIm</th><th style={thS}>ΔQ</th><th style={thS}>ΔCoupling</th><th style={thS}>ΔDistAtten</th>
                    <th style={thS}>d1 Mag</th><th style={thS}>d2 Mag</th><th style={thS}>% Chg</th><th style={thS}>Z-score</th>
                    <th style={thS}>Recon Mag</th><th style={thS}>Engine Mag</th><th style={thS}>Error</th><th style={thS}>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r, i) => (
                    <tr key={r.frequencyHz} style={{ borderBottom: '1px solid #fee2e2', background: i === result.nullIdx ? '#fecaca' : undefined }}>
                      <td style={{ ...tdS, fontWeight: 700, color: '#991b1b' }}>{fmt(r.frequencyHz, 1)}</td>
                      <td style={tdS}>{fmt(r.transfer.numeratorRe, 2)}</td><td style={tdS}>{fmt(r.transfer.numeratorIm, 2)}</td>
                      <td style={tdS}>{fmt(r.transfer.denominatorRe, 4)}</td><td style={tdS}>{fmt(r.transfer.denominatorIm, 4)}</td>
                      <td style={tdS}>{fmt(r.transfer.magnitude, 4)}</td><td style={tdS}>{fmt(r.transfer.phase, 1)}</td>
                      <td style={tdS}>{fmt(r.transfer.real, 4)}</td><td style={tdS}>{fmt(r.transfer.imag, 4)}</td>
                      <td style={tdS}>{fmt(r.distance?.combinedCoupling, 4)}</td>
                      <td style={tdS}>{fmt(r.distance?.distanceLossDb, 2)}</td>
                      <td style={tdS}>{r.distance?.distanceTermUsed ? 'used' : 'not used'}</td>
                      <td style={tdS}>{fmt(r.physics.qValue, 3)}</td><td style={tdS}>{fmt(r.physics.bandwidthHz, 3)}</td>
                      <td style={tdS}>{fmt(r.physics.dampingRatio, 4)}</td><td style={tdS}>{fmt(r.physics.lossFactor, 4)}</td><td style={tdS}>{fmt(r.physics.decayConstant, 4)}</td>
                      <td style={{ ...tdS, fontWeight: 700 }}>{fmt(r.reconstructedMag, 4)}</td><td style={tdS}>{fmt(r.reconstructedPhase, 1)}</td>
                      <td style={tdS}>{fmt(r.reconstructedRe, 4)}</td><td style={tdS}>{fmt(r.reconstructedIm, 4)}</td>
                      <td style={tdS}>{fmt(r.deltas?.reconstructedMag, 4)}</td><td style={tdS}>{fmt(r.deltas?.reconstructedPhase, 1)}</td>
                      <td style={tdS}>{fmt(r.deltas?.reconstructedRe, 4)}</td><td style={tdS}>{fmt(r.deltas?.reconstructedIm, 4)}</td>
                      <td style={tdS}>{fmt(r.deltas?.qValue, 4)}</td><td style={tdS}>{fmt(r.deltas?.combinedCoupling, 4)}</td><td style={tdS}>{fmt(r.deltas?.distanceLossDb, 4)}</td>
                      <td style={tdS}>{fmt(r.derivative1?.reconstructedMag, 4)}</td><td style={tdS}>{fmt(r.derivative2?.reconstructedMag, 5)}</td>
                      <td style={tdS}>{fmt(r.pctChange?.reconstructedMag, 1)}%</td><td style={tdS}>{fmt(r.zScore?.reconstructedMag, 2)}</td>
                      <td style={tdS}>{fmt(r.reconstructedMag, 4)}</td><td style={tdS}>{fmt(r.engineMag, 4)}</td><td style={tdS}>{fmt(r.numericalError, 6)}</td>
                      <td style={{ ...tdS, fontWeight: 700, color: r.pass ? '#166534' : '#b91c1c' }}>{r.pass ? 'PASS' : 'FAIL'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Construction timeline for a representative frequency (the tracked null point) */}
          <div style={sectionBox}>
            <div style={sectionTitle}>Construction Timeline — at {fmt(result.rows[result.nullIdx]?.frequencyHz, 1)} Hz (null-region reference)</div>
            {result.rows[result.nullIdx]?.timeline.map((step, i) => (
              <div key={i} style={{ fontSize: 9, fontFamily: 'monospace', color: '#991b1b' }}>
                {step.label}: mag={fmt(step.mag, 4)} phase={fmt(step.phase, 1)}° re={fmt(step.re, 4)} im={fmt(step.im, 4)}
              </div>
            ))}
          </div>

          {/* Charts */}
          <div style={sectionBox}>
            <div style={sectionTitle}>Dominant Mode Magnitude &amp; Phase vs Frequency</div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hz" tick={{ fontSize: 9 }} />
                <YAxis yAxisId="mag" tick={{ fontSize: 9 }} />
                <YAxis yAxisId="phase" orientation="right" tick={{ fontSize: 9 }} />
                <Tooltip wrapperStyle={{ fontSize: 10 }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line yAxisId="mag" type="monotone" dataKey="mag" name="Magnitude" stroke="#b91c1c" dot={false} />
                <Line yAxisId="phase" type="monotone" dataKey="phase" name="Phase °" stroke="#7c3aed" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={sectionBox}>
            <div style={sectionTitle}>Q, Coupling &amp; Distance Attenuation vs Frequency</div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hz" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip wrapperStyle={{ fontSize: 10 }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line type="monotone" dataKey="qValue" name="Q" stroke="#ea580c" dot={false} />
                <Line type="monotone" dataKey="coupling" name="Coupling" stroke="#059669" dot={false} />
                <Line type="monotone" dataKey="distanceLossDb" name="Distance Atten dB" stroke="#111827" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={sectionBox}>
            <div style={sectionTitle}>Derivatives — 1st &amp; 2nd Derivative of Dominant Magnitude</div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hz" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip wrapperStyle={{ fontSize: 10 }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line type="monotone" dataKey="dMag" name="1st Derivative" stroke="#dc2626" dot={false} />
                <Line type="monotone" dataKey="d2Mag" name="2nd Derivative" stroke="#9333ea" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Heatmap */}
          {heatmapCols && (
            <div style={sectionBox}>
              <div style={sectionTitle}>Heatmap — Normalized Magnitude of Change per Term</div>
              <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#991b1b', marginBottom: 4 }}>
                First term to change rapidly: <strong>{heatmapCols.firstCol ?? 'none crossed threshold'}</strong>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 800 }}>
                  <thead>
                    <tr>
                      <th style={thS}>Hz</th><th style={thS}>Transfer Mag</th><th style={thS}>Q</th><th style={thS}>Coupling</th><th style={thS}>Dist Atten</th><th style={thS}>d/dHz</th><th style={thS}>% Chg</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((r, i) => (
                      <tr key={r.frequencyHz}>
                        <td style={{ ...tdS, fontWeight: 700 }}>{fmt(r.frequencyHz, 1)}</td>
                        <td style={{ ...tdS, background: heatColor(heatmapCols.cols.transferMag[i]) }}>{fmt(heatmapCols.cols.transferMag[i], 2)}</td>
                        <td style={{ ...tdS, background: heatColor(heatmapCols.cols.qValue[i]) }}>{fmt(heatmapCols.cols.qValue[i], 2)}</td>
                        <td style={{ ...tdS, background: heatColor(heatmapCols.cols.coupling[i]) }}>{fmt(heatmapCols.cols.coupling[i], 2)}</td>
                        <td style={{ ...tdS, background: heatColor(heatmapCols.cols.distanceLossDb[i]) }}>{fmt(heatmapCols.cols.distanceLossDb[i], 2)}</td>
                        <td style={{ ...tdS, background: heatColor(heatmapCols.cols.derivative1[i]) }}>{fmt(heatmapCols.cols.derivative1[i], 2)}</td>
                        <td style={{ ...tdS, background: heatColor(heatmapCols.cols.pctChange[i]) }}>{fmt(heatmapCols.cols.pctChange[i], 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Timeline of events */}
          <div style={sectionBox}>
            <div style={sectionTitle}>Ordered Event Timeline</div>
            {timelineEvents.length === 0 && <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#6b7280' }}>No significant events detected — all terms remained stable.</div>}
            {timelineEvents.map((e, i) => (
              <div key={i} style={{ fontSize: 10, fontFamily: 'monospace', color: '#991b1b' }}>{fmt(e.hz, 1)} Hz — {e.label}</div>
            ))}
          </div>

          {/* Correlation ranking */}
          <div style={sectionBox}>
            <div style={sectionTitle}>Correlation Analysis — vs Dominant Mode Magnitude</div>
            {result.correlations.map((c) => (
              <div key={c.name} style={{ fontSize: 10, fontFamily: 'monospace', color: '#991b1b' }}>{c.name}: {fmt(c.correlation, 3)}</div>
            ))}
          </div>

          {/* Root cause ranking */}
          <div style={sectionBox}>
            <div style={sectionTitle}>Root Cause Ranking (Rejected Variables Included)</div>
            {result.ranking.map((c, i) => (
              <div key={c.key} style={{ fontSize: 10, fontFamily: 'monospace', color: c.startFreq !== null ? '#991b1b' : '#6b7280', marginBottom: 3 }}>
                {i + 1}. <strong>{c.name}</strong> — {c.startFreq !== null ? `Starts ${fmt(c.startFreq, 1)} Hz, Confidence ${c.confidence}%, Rate ${fmt(c.rateOfChange, 5)}/Hz` : `Rejected — no threshold crossing detected, Confidence ${c.confidence}%`}
              </div>
            ))}
          </div>

          {/* Final conclusion */}
          <div style={{ border: '2px solid #991b1b', borderRadius: 6, background: '#fecaca', padding: '10px 12px', fontSize: 11, fontFamily: 'monospace', color: '#7f1d1d' }}>
            {allValidated ? (
              <>
                <div style={{ fontWeight: 700 }}>All dominant-mode construction stages validated.</div>
                <div>The tracked dominant mode is being constructed correctly. The root cause must exist upstream of modal construction (mode excitation, modal solver, or transfer-function generation) rather than within dominant-mode assembly.</div>
              </>
            ) : firstDeviation ? (
              <>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>First physical quantity to deviate:</div>
                <div>Name: <strong>{firstDeviation.name}</strong></div>
                <div>Frequency: <strong>{fmt(firstDeviation.startFreq, 1)} Hz</strong></div>
                <div>Magnitude of change: <strong>rate {fmt(firstDeviation.rateOfChange, 5)}/Hz</strong></div>
                <div>Confidence: <strong>{firstDeviation.confidence}%</strong></div>
              </>
            ) : (
              <div style={{ fontWeight: 700 }}>Reconstruction mismatch detected — see Result column above (measurements only, no fix proposed).</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}