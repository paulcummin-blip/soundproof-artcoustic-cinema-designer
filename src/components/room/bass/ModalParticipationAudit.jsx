/**
 * ModalParticipationAudit.jsx
 *
 * Diagnostic only — no production changes.
 *
 * Determines whether too many modes are suppressed before they
 * meaningfully contribute to the summed pressure response.
 *
 * This is NOT a mode-count audit.
 * This is NOT a modal-density audit.
 * This IS a participation audit.
 *
 * For every frequency 20–220 Hz reports:
 *   - Total modes available
 *   - Modes contributing > -3 / -6 / -10 / -20 dB from strongest
 *   - RMS energy distribution
 *   - % energy in strongest mode
 *   - Effective participation ratio (Ninv = 1 / Σ(E_n/E_total)²)
 *
 * Answers:
 *   - Are too few modes carrying total energy?
 *   - Are a handful of modes dominating?
 *   - Is participation significantly below rigid-room expectation?
 *   - Could reduced participation explain smoother REW mismatch?
 */

import React, { useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import {
  computeRoomModesLocal,
  modeShapeValueLocal,
  estimateModeQLocal,
  resonantTransfer,
} from '@/bass/core/modalCalculations.js';

const C = 343;
const FLAT_SOURCE_DB = 94;
const AXIAL_Q_BASE = 4.0;

// ─── Canonical theoretical expectations ───────────────────────────────────────
// Based on Morse & Ingard rigid rectangular room theory.
// Rigid room: all modes participate at resonance, participation constrained by
// overlap (Q * modal density). At low freq (sparse modes) dominance is expected.
function canonicalExpectedParticipants(freqHz, modes) {
  // Modes within 1.5× the bandwidth of the driving frequency
  // bandwidth ≈ f / Q_avg, so nearby modes all get some excitation.
  // In a rigid room: ALL modes within the -20 dB point of the TF should contribute.
  const nearby = modes.filter(m => Math.abs(m.freq - freqHz) / Math.max(m.freq, 1) < 0.5);
  // Rigid room canonical: at least nearby.length modes contributing above -20 dB
  // Minimum floor: 1 mode always participates
  return Math.max(1, nearby.length);
}

// ─── Engine ────────────────────────────────────────────────────────────────────
function runParticipationAudit(roomDims, seatPos, sub) {
  const { widthM: W, lengthM: L, heightM: H } = roomDims;

  const allModes = computeRoomModesLocal({ widthM: W, lengthM: L, heightM: H, fMax: 220, c: C });

  // Assign Q values (matching production parity defaults)
  const modesWithQ = allModes.map(mode => {
    const baseQ = AXIAL_Q_BASE;
    const absQ  = estimateModeQLocal({
      roomDims: { widthM: W, lengthM: L, heightM: H },
      surfaceAbsorption: { front: 0.3, back: 0.3, left: 0.3, right: 0.3, ceiling: 0.3, floor: 0.3 },
      f0: mode.freq,
    });
    const qValue = Math.max(1, Math.min(baseQ, absQ));
    return { ...mode, qValue };
  });

  // Source amplitude (flat reference, distance_normalized)
  const dx = sub.x - seatPos.x;
  const dy = sub.y - seatPos.y;
  const dz = sub.z - seatPos.z;
  const distM = Math.max(0.01, Math.sqrt(dx * dx + dy * dy + dz * dz));
  const modalSourceAmplitude = Math.pow(10, FLAT_SOURCE_DB / 20) / distM;

  // Build log-spaced frequency axis 20–220 Hz
  const freqs = [];
  for (let f = 20; f <= 220; f += 2) freqs.push(f);

  const perFreqRows = freqs.map(freqHz => {
    // Calculate the contribution magnitude of each mode at this frequency
    const contributions = modesWithQ.map(mode => {
      const psiSrc = modeShapeValueLocal(mode, sub.x, sub.y, sub.z, { widthM: W, lengthM: L, heightM: H });
      const psiRcv = modeShapeValueLocal(mode, seatPos.x, seatPos.y, seatPos.z, { widthM: W, lengthM: L, heightM: H });
      const coupling = psiSrc * psiRcv;

      // highOrderAxial scale (matching production parity field solver)
      const order = Math.abs(mode.nx) + Math.abs(mode.ny) + Math.abs(mode.nz);
      const axialScale = (mode.type === 'axial' && order >= 2) ? 0.50 : 1.0;

      const gain = modalSourceAmplitude * coupling * axialScale;
      const tf   = resonantTransfer(freqHz, mode.freq, mode.qValue);
      const re   = gain * tf.re;
      const im   = gain * tf.im;
      const mag  = Math.sqrt(re * re + im * im);

      return { mode, mag, magSq: mag * mag };
    });

    // Sort by magnitude descending
    const sorted = [...contributions].sort((a, b) => b.mag - a.mag);
    const strongest = sorted[0]?.mag ?? 0;

    if (strongest < 1e-12) {
      return {
        freqHz,
        totalModes: modesWithQ.length,
        above3dB: 0, above6dB: 0, above10dB: 0, above20dB: 0,
        participationRatio: 0,
        dominancePercent: 100,
        totalRmsEnergy: 0,
        strongestPercent: 100,
        canonicalParticipants: canonicalExpectedParticipants(freqHz, modesWithQ),
        top3: [],
      };
    }

    const strongestDb = 20 * Math.log10(strongest);
    const above3dB  = sorted.filter(c => 20 * Math.log10(Math.max(c.mag, 1e-30)) >= strongestDb - 3).length;
    const above6dB  = sorted.filter(c => 20 * Math.log10(Math.max(c.mag, 1e-30)) >= strongestDb - 6).length;
    const above10dB = sorted.filter(c => 20 * Math.log10(Math.max(c.mag, 1e-30)) >= strongestDb - 10).length;
    const above20dB = sorted.filter(c => 20 * Math.log10(Math.max(c.mag, 1e-30)) >= strongestDb - 20).length;

    // RMS total energy
    const totalEnergySq = contributions.reduce((s, c) => s + c.magSq, 0);
    const totalRmsEnergy = Math.sqrt(totalEnergySq);

    // Effective participation (inverse participation ratio)
    // N_eff = (Σ E_n)² / Σ E_n²  where E_n = mag²
    const sumEnergy = contributions.reduce((s, c) => s + c.magSq, 0);
    const sumEnergySq = contributions.reduce((s, c) => s + c.magSq * c.magSq, 0);
    const participationRatio = sumEnergySq > 0 ? (sumEnergy * sumEnergy) / sumEnergySq : 0;

    // Strongest mode % of total energy
    const strongestPercent = totalEnergySq > 0 ? (sorted[0].magSq / totalEnergySq) * 100 : 100;

    const canonicalParticipants = canonicalExpectedParticipants(freqHz, modesWithQ);

    const top3 = sorted.slice(0, 3).map(c => ({
      label: `(${c.mode.nx},${c.mode.ny},${c.mode.nz}) ${c.mode.type} @ ${c.mode.freq.toFixed(1)} Hz`,
      mag: c.mag,
      percent: totalEnergySq > 0 ? (c.magSq / totalEnergySq * 100) : 0,
    }));

    return {
      freqHz,
      totalModes: modesWithQ.length,
      above3dB, above6dB, above10dB, above20dB,
      participationRatio,
      strongestPercent,
      totalRmsEnergy,
      canonicalParticipants,
      top3,
    };
  });

  // Histogram: distribution of participationRatio across all frequencies
  const histBins = [
    { label: '1', min: 0, max: 1.5 },
    { label: '2', min: 1.5, max: 2.5 },
    { label: '3', min: 2.5, max: 3.5 },
    { label: '4', min: 3.5, max: 4.5 },
    { label: '5+', min: 4.5, max: Infinity },
  ];
  const histogram = histBins.map(bin => ({
    label: bin.label,
    count: perFreqRows.filter(r => r.participationRatio >= bin.min && r.participationRatio < bin.max).length,
  }));

  // Bottom 10 frequencies by participation
  const bottom10 = [...perFreqRows]
    .sort((a, b) => a.participationRatio - b.participationRatio)
    .slice(0, 10);

  // Overall answers
  const avgParticipation  = perFreqRows.reduce((s, r) => s + r.participationRatio, 0) / perFreqRows.length;
  const avgDominance      = perFreqRows.reduce((s, r) => s + r.strongestPercent, 0) / perFreqRows.length;
  const avgAbove10dB      = perFreqRows.reduce((s, r) => s + r.above10dB, 0) / perFreqRows.length;
  const singleModeFreqs   = perFreqRows.filter(r => r.above6dB <= 1).length;
  const singleModePct     = (singleModeFreqs / perFreqRows.length) * 100;

  return {
    perFreqRows,
    histogram,
    bottom10,
    avgParticipation,
    avgDominance,
    avgAbove10dB,
    singleModeFreqs,
    singleModePct,
    totalFreqs: perFreqRows.length,
    modeCount: modesWithQ.length,
    roomVolumeM3: W * L * H,
  };
}

// ─── UI helpers ────────────────────────────────────────────────────────────────
const mono = { fontFamily: 'monospace' };

function SevBadge({ val, warn, crit, label }) {
  const isCrit = val !== null && crit !== null && val >= crit;
  const isWarn = val !== null && warn !== null && val >= warn && !isCrit;
  const bg    = isCrit ? '#fef2f2' : isWarn ? '#fffbeb' : '#f0fdf4';
  const color = isCrit ? '#991b1b' : isWarn ? '#92400e' : '#166534';
  const tag   = isCrit ? '⚠ HIGH' : isWarn ? '△ MODERATE' : '✓ OK';
  return (
    <span style={{ display: 'inline-block', padding: '1px 7px', borderRadius: 4, background: bg, color, fontSize: 9, fontWeight: 700, ...mono }}>
      {label ?? tag}
    </span>
  );
}

const CustomTooltipParticipation = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#fff', border: '1px solid #d1d5db', borderRadius: 5, padding: '5px 9px', fontSize: 9, ...mono }}>
      <div style={{ fontWeight: 700 }}>{label} Hz</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ color: p.stroke ?? p.fill }}>
          {p.name}: {Number.isFinite(p.value) ? p.value.toFixed(2) : '—'}
        </div>
      ))}
    </div>
  );
};

// ─── Main component ────────────────────────────────────────────────────────────
export default function ModalParticipationAudit({ roomDims, seatingPositions, subsForSimulation }) {
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [ran, setRan] = useState(false);

  const activeSeat = useMemo(() => {
    const primary = (seatingPositions || []).find(s => s.isPrimary);
    return primary || seatingPositions?.[0] || null;
  }, [seatingPositions]);

  const seatPos = useMemo(() => {
    if (!activeSeat) return null;
    return {
      x: Number(activeSeat.x),
      y: Number(activeSeat.y),
      z: Number.isFinite(Number(activeSeat.z)) ? Number(activeSeat.z) : 1.2,
    };
  }, [activeSeat]);

  const sub = subsForSimulation?.[0] || null;
  const canRun = !!(roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM && seatPos && sub);

  function run() {
    if (!canRun) return;
    setRunning(true);
    setTimeout(() => {
      const rd = { widthM: Number(roomDims.widthM), lengthM: Number(roomDims.lengthM), heightM: Number(roomDims.heightM) };
      const sb = { x: Number(sub.x), y: Number(sub.y), z: Number.isFinite(Number(sub.z)) ? Number(sub.z) : 0.35 };
      setResult(runParticipationAudit(rd, seatPos, sb));
      setRan(true);
      setRunning(false);
    }, 20);
  }

  const r = result;

  // Chart data
  const participationChartData = useMemo(() => {
    if (!r) return [];
    return r.perFreqRows.map(row => ({
      freq: row.freqHz,
      actual: parseFloat(row.participationRatio.toFixed(3)),
      canonical: row.canonicalParticipants,
      above10dB: row.above10dB,
    }));
  }, [r]);

  const dominanceChartData = useMemo(() => {
    if (!r) return [];
    return r.perFreqRows.map(row => ({
      freq: row.freqHz,
      dominance: parseFloat(row.strongestPercent.toFixed(1)),
    }));
  }, [r]);

  // Table styles
  const th  = { padding: '3px 8px', fontSize: 9, ...mono, fontWeight: 700, color: '#1e3a5f', background: '#eff6ff', borderBottom: '2px solid #93c5fd', textAlign: 'right', whiteSpace: 'nowrap' };
  const thL = { ...th, textAlign: 'left' };
  const td  = { padding: '2px 8px', fontSize: 9, ...mono, borderBottom: '1px solid #e5e7eb', textAlign: 'right', verticalAlign: 'top' };
  const tdL = { ...td, textAlign: 'left' };

  // Answer logic
  const answers = r ? {
    tooFewModes: r.avgParticipation < 2.0,
    dominationPresent: r.avgDominance > 60,
    belowRigidRoom: r.avgParticipation < 2.5 && r.avgAbove10dB < 3,
    canExplainMismatch: r.singleModePct > 30,
  } : null;

  return (
    <details style={{ border: '2px solid #7c3aed', borderRadius: 8, background: '#faf5ff', padding: '8px 10px', marginTop: 8 }}>
      <summary style={{ fontWeight: 700, color: '#7c3aed', fontSize: 11, cursor: 'pointer', ...mono }}>
        📊 Modal Participation Audit — energy concentration & effective mode count
      </summary>

      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 10, color: '#5b21b6', lineHeight: 1.7, marginBottom: 8, borderLeft: '3px solid #7c3aed', paddingLeft: 8, ...mono }}>
          Measures how many modes <em>actually carry energy</em> vs how many exist.<br />
          Uses production excitation chain (flat 94 dB, distance_normalized, axial-scale correction).<br />
          Mode contributions evaluated at every freq 20–220 Hz against all modes simultaneously.<br />
          Participation ratio N_eff = (ΣE²)/(ΣE²²) — independent of absolute level.
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          <button onClick={run} disabled={!canRun || running}
            style={{ height: 30, padding: '0 14px', borderRadius: 6, border: `1px solid ${canRun && !running ? '#7c3aed' : '#d1d5db'}`, background: canRun && !running ? '#7c3aed' : '#f3f4f6', color: canRun && !running ? '#fff' : '#9ca3af', fontSize: 11, fontWeight: 700, cursor: canRun && !running ? 'pointer' : 'not-allowed', ...mono }}>
            {running ? 'Running…' : ran ? 'Re-run' : 'Run Participation Audit'}
          </button>
          {!canRun && <span style={{ fontSize: 10, color: '#7c3aed', ...mono }}>Need room dims + seat + sub.</span>}
        </div>

        {r && (
          <>
            {/* ── Summary stats ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 12 }}>
              {[
                { label: 'Avg N_eff (participation ratio)', value: r.avgParticipation.toFixed(2), warn: null, crit: null },
                { label: 'Avg strongest-mode energy %', value: `${r.avgDominance.toFixed(1)}%`, warn: 50, crit: 70, rawVal: r.avgDominance },
                { label: 'Avg modes > −10 dB', value: r.avgAbove10dB.toFixed(1), warn: null, crit: null },
                { label: '% freqs single-mode dominated (>−6 dB)', value: `${r.singleModePct.toFixed(1)}%`, warn: 25, crit: 50, rawVal: r.singleModePct },
              ].map((s, i) => (
                <div key={i} style={{ background: '#ede9fe', border: '1px solid #c4b5fd', borderRadius: 6, padding: '6px 10px' }}>
                  <div style={{ fontSize: 8, color: '#5b21b6', ...mono, lineHeight: 1.3, marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#4c1d95', ...mono }}>{s.value}</div>
                  {s.warn !== null && <SevBadge val={s.rawVal} warn={s.warn} crit={s.crit} />}
                </div>
              ))}
            </div>

            <div style={{ background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: 5, padding: '4px 10px', fontSize: 9, ...mono, marginBottom: 10 }}>
              Room {roomDims.widthM}×{roomDims.lengthM}×{roomDims.heightM} m |
              Volume {r.roomVolumeM3.toFixed(1)} m³ |
              Total modes (20–220 Hz): {r.modeCount} |
              Freq bins evaluated: {r.totalFreqs} |
              Source: flat 94 dB @ 1m-normalized
            </div>

            {/* ── Chart 1: Participation ratio vs frequency ── */}
            <div style={{ border: '1px solid #c4b5fd', borderRadius: 6, background: '#fff', padding: '10px 12px', marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 10, color: '#5b21b6', ...mono, marginBottom: 6 }}>
                1. Participation Ratio (N_eff) vs Frequency — actual vs canonical rigid-room expectation
              </div>
              <div style={{ width: '100%', height: 240 }}>
                <ResponsiveContainer>
                  <LineChart data={participationChartData} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="freq" type="number" domain={[20, 220]}
                      ticks={[20, 40, 60, 80, 100, 120, 150, 200, 220]}
                      tickFormatter={v => `${v}`}
                      label={{ value: 'Hz', position: 'insideBottom', offset: -8, fill: '#6b7280', fontSize: 10 }}
                      tick={{ fontSize: 9, ...mono }} />
                    <YAxis domain={[0, 'auto']}
                      label={{ value: 'N_eff', angle: -90, position: 'insideLeft', fill: '#6b7280', fontSize: 10 }}
                      tick={{ fontSize: 9, ...mono }} />
                    <Tooltip content={<CustomTooltipParticipation />} />
                    <Line type="linear" dataKey="actual" name="Actual N_eff" stroke="#7c3aed" strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line type="linear" dataKey="canonical" name="Canonical expected" stroke="#059669" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
                    <Line type="linear" dataKey="above10dB" name="Modes > −10 dB" stroke="#dc2626" strokeWidth={1} strokeDasharray="2 2" dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: 'flex', gap: 16, marginTop: 4, flexWrap: 'wrap' }}>
                {[['#7c3aed', 'Actual N_eff (effective participating modes)'], ['#059669', 'Canonical rigid-room expectation (dashed)'], ['#dc2626', 'Modes contributing > −10 dB (dotted)']].map(([col, lbl]) => (
                  <span key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 8, color: col, ...mono }}>
                    <span style={{ display: 'inline-block', width: 18, height: 2, background: col }} /> {lbl}
                  </span>
                ))}
              </div>
            </div>

            {/* ── Chart 2: Strongest-mode dominance vs frequency ── */}
            <div style={{ border: '1px solid #c4b5fd', borderRadius: 6, background: '#fff', padding: '10px 12px', marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 10, color: '#5b21b6', ...mono, marginBottom: 6 }}>
                2. Strongest-Mode Energy % vs Frequency — 100% = single-mode dominance
              </div>
              <div style={{ width: '100%', height: 200 }}>
                <ResponsiveContainer>
                  <LineChart data={dominanceChartData} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="freq" type="number" domain={[20, 220]}
                      ticks={[20, 40, 60, 80, 100, 120, 150, 200, 220]}
                      label={{ value: 'Hz', position: 'insideBottom', offset: -8, fill: '#6b7280', fontSize: 10 }}
                      tick={{ fontSize: 9, ...mono }} />
                    <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`}
                      label={{ value: '% energy', angle: -90, position: 'insideLeft', fill: '#6b7280', fontSize: 10 }}
                      tick={{ fontSize: 9, ...mono }} />
                    <Tooltip content={<CustomTooltipParticipation />} />
                    <Line type="linear" dataKey="dominance" name="Strongest mode %" stroke="#ea580c" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* ── Chart 3: Histogram of N_eff distribution ── */}
            <div style={{ border: '1px solid #c4b5fd', borderRadius: 6, background: '#fff', padding: '10px 12px', marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 10, color: '#5b21b6', ...mono, marginBottom: 6 }}>
                3. Energy Concentration Histogram — how often each participation level occurs
              </div>
              <div style={{ width: '100%', height: 180 }}>
                <ResponsiveContainer>
                  <BarChart data={r.histogram} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="label"
                      label={{ value: 'N_eff (effective modes)', position: 'insideBottom', offset: -8, fill: '#6b7280', fontSize: 10 }}
                      tick={{ fontSize: 9, ...mono }} />
                    <YAxis
                      label={{ value: '# freq bins', angle: -90, position: 'insideLeft', fill: '#6b7280', fontSize: 10 }}
                      tick={{ fontSize: 9, ...mono }} />
                    <Tooltip content={<CustomTooltipParticipation />} />
                    <Bar dataKey="count" name="Freq bins" fill="#7c3aed" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ fontSize: 8, color: '#5b21b6', ...mono, marginTop: 4 }}>
                Left = single-mode dominance (N_eff ≈ 1) — Right = distributed participation (N_eff ≥ 5)
              </div>
            </div>

            {/* ── Table 4: Bottom 10 participation frequencies ── */}
            <div style={{ fontWeight: 700, color: '#5b21b6', fontSize: 10, ...mono, marginBottom: 4, borderBottom: '1px solid #c4b5fd', paddingBottom: 2 }}>
              4. Top 10 Frequencies with Lowest Participation
            </div>
            <div style={{ overflowX: 'auto', marginBottom: 12 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr>
                    <th style={th}>Freq (Hz)</th>
                    <th style={th}>N_eff</th>
                    <th style={th}>Canonical expected</th>
                    <th style={th}>Delta</th>
                    <th style={th}>&gt;−3 dB</th>
                    <th style={th}>&gt;−6 dB</th>
                    <th style={th}>&gt;−10 dB</th>
                    <th style={th}>&gt;−20 dB</th>
                    <th style={th}>Strongest %</th>
                    <th style={thL}>Severity</th>
                    <th style={thL}>Top mode</th>
                  </tr>
                </thead>
                <tbody>
                  {r.bottom10.map((row, i) => {
                    const delta = row.participationRatio - row.canonicalParticipants;
                    const isCrit = row.participationRatio < 1.5;
                    const isWarn = row.participationRatio < 2.5 && !isCrit;
                    const sev = isCrit ? 'HIGH' : isWarn ? 'MODERATE' : 'LOW';
                    const sevColor = isCrit ? '#991b1b' : isWarn ? '#92400e' : '#166534';
                    const sevBg   = isCrit ? '#fee2e2' : isWarn ? '#fef3c7' : '#dcfce7';
                    return (
                      <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#faf5ff' }}>
                        <td style={{ ...td, fontWeight: 700 }}>{row.freqHz}</td>
                        <td style={{ ...td, fontWeight: 700, color: isCrit ? '#991b1b' : '#1e3a5f' }}>
                          {row.participationRatio.toFixed(2)}
                        </td>
                        <td style={td}>{row.canonicalParticipants.toFixed(1)}</td>
                        <td style={{ ...td, color: delta < -1 ? '#991b1b' : '#374151', fontWeight: delta < -1 ? 700 : 400 }}>
                          {delta > 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2)}
                        </td>
                        <td style={td}>{row.above3dB}</td>
                        <td style={td}>{row.above6dB}</td>
                        <td style={td}>{row.above10dB}</td>
                        <td style={td}>{row.above20dB}</td>
                        <td style={{ ...td, color: row.strongestPercent > 80 ? '#991b1b' : '#374151' }}>
                          {row.strongestPercent.toFixed(1)}%
                        </td>
                        <td style={tdL}>
                          <span style={{ display: 'inline-block', padding: '0 5px', borderRadius: 3, background: sevBg, color: sevColor, fontSize: 9, fontWeight: 700, ...mono }}>
                            {sev}
                          </span>
                        </td>
                        <td style={{ ...tdL, fontSize: 8, color: '#374151' }}>
                          {row.top3[0]?.label ?? '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── Final answers ── */}
            <div style={{ border: '2px solid #7c3aed', borderRadius: 6, background: '#ede9fe', padding: '10px 14px', fontSize: 11, ...mono, lineHeight: 1.9 }}>
              <div style={{ fontWeight: 700, color: '#4c1d95', marginBottom: 6, fontSize: 12 }}>
                ▶ Participation Audit Answers
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 18, color: answers.tooFewModes ? '#991b1b' : '#166534', lineHeight: 1 }}>
                    {answers.tooFewModes ? '⚠' : '✓'}
                  </span>
                  <div>
                    <strong>Are too few modes carrying total energy?</strong>
                    <div style={{ fontSize: 9, color: '#374151' }}>
                      Average N_eff = {r.avgParticipation.toFixed(2)}.{' '}
                      {answers.tooFewModes
                        ? `YES — average effective participation below 2.0. Most energy concentrates in 1–2 modes.`
                        : `NO — participation is broadly distributed (N_eff ≥ 2.0 on average).`}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 18, color: answers.dominationPresent ? '#991b1b' : '#166534', lineHeight: 1 }}>
                    {answers.dominationPresent ? '⚠' : '✓'}
                  </span>
                  <div>
                    <strong>Are a handful of modes dominating?</strong>
                    <div style={{ fontSize: 9, color: '#374151' }}>
                      Strongest mode carries avg {r.avgDominance.toFixed(1)}% of energy.{' '}
                      {answers.dominationPresent
                        ? `YES — single-mode dominance (>60% avg energy) is significant.`
                        : `NO — energy is reasonably distributed across multiple modes.`}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 18, color: answers.belowRigidRoom ? '#991b1b' : '#166534', lineHeight: 1 }}>
                    {answers.belowRigidRoom ? '⚠' : '✓'}
                  </span>
                  <div>
                    <strong>Is modal participation significantly below rigid-room expectation?</strong>
                    <div style={{ fontSize: 9, color: '#374151' }}>
                      Avg modes &gt;−10 dB: {r.avgAbove10dB.toFixed(1)}.{' '}
                      {answers.belowRigidRoom
                        ? `YES — fewer modes contribute meaningfully than a rigid room predicts. Q-damping or position nulling is suppressing participation.`
                        : `NO — participation broadly matches rigid-room theory for this room geometry.`}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 18, color: answers.canExplainMismatch ? '#ea580c' : '#166534', lineHeight: 1 }}>
                    {answers.canExplainMismatch ? '△' : '✓'}
                  </span>
                  <div>
                    <strong>Could reduced participation explain the smoother REW mismatch?</strong>
                    <div style={{ fontSize: 9, color: '#374151' }}>
                      {r.singleModePct.toFixed(1)}% of frequency bins are single-mode dominated (above −6 dB).{' '}
                      {answers.canExplainMismatch
                        ? `POSSIBLY YES — at >30% single-mode bins, nulls in the coupling product (Ψ_src × Ψ_rcv) can blank wide frequency ranges, producing a smoother response than a REW measurement that does not share the same null geometry.`
                        : `UNLIKELY — single-mode dominance is below 30% of bins. REW mismatch is more likely driven by Q magnitude or absolute level offset.`}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid #c4b5fd', marginTop: 8, paddingTop: 8, fontSize: 9, color: '#5b21b6' }}>
                <strong>Key insight:</strong> If participation is low because modes are geometrically nulled (Ψ → 0 at sub or seat)
                rather than Q-dampened, the response will be structurally smoother regardless of Q, because those modes simply
                do not excite the room at that position. This is distinct from the Green's function parity gap and acts
                as a silence mechanism, not a level-offset mechanism.
              </div>
            </div>

            <div style={{ fontSize: 9, color: '#6b7280', marginTop: 6, lineHeight: 1.5, ...mono }}>
              Diagnostic only. No production defaults changed.
              Source: modalCalculations.js primitives, flat 94 dB, axial Q 4.0, default absorption 0.3 each surface.
            </div>
          </>
        )}
      </div>
    </details>
  );
}