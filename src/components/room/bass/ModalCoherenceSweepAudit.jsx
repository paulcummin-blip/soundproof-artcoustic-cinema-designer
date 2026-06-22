/**
 * ModalCoherenceSweepAudit — Diagnostic only. Does not affect the live graph.
 *
 * Tests 7 modal summation strategies against the REW benchmark to determine
 * whether the remaining parity gap is a coherence-combination issue.
 *
 * Fixed: Direct+Modes · Reflections OFF · Flat REW ref · ModalGain 1.0
 *        Current Q and source model settings from props.
 */

import React, { useState, useMemo } from 'react';
import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';
import {
  computeRoomModesLocal,
  modeShapeValueLocal,
  resonantTransfer,
  estimateModeQLocal,
} from '@/components/room/bass/core/modalCalculations';

// ── REW benchmark ─────────────────────────────────────────────────────────────
const REW_BENCHMARK = [
  { hz: 20,  db: 93.1 }, { hz: 25,  db: 96.6 }, { hz: 30,  db: 95.8 },
  { hz: 34,  db: 94.1 }, { hz: 40,  db: 100.3 },{ hz: 45,  db: 98.6 },
  { hz: 50,  db: 97.5 }, { hz: 55,  db: 95.7 }, { hz: 60,  db: 91.2 },
  { hz: 63,  db: 89.8 }, { hz: 68,  db: 85.2 }, { hz: 70,  db: 83.1 },
  { hz: 75,  db: 84.4 }, { hz: 80,  db: 86.2 }, { hz: 85,  db: 88.4 },
  { hz: 90,  db: 89.1 }, { hz: 100, db: 87.3 }, { hz: 120, db: 83.6 },
  { hz: 150, db: 79.2 }, { hz: 200, db: 74.1 },
];

const FLAT_REF = [
  { hz: 20, db: 94 }, { hz: 50, db: 94 }, { hz: 100, db: 94 }, { hz: 200, db: 94 },
];

const TARGET_HZ = [70, 80, 85];
const SPEED_OF_SOUND = 343;

// ── Sweep mode definitions ────────────────────────────────────────────────────
const SWEEP_MODES = [
  {
    id: 'coherent',
    label: '1. Fully coherent (current)',
    description: 'Standard complex pressure sum — current production path.',
  },
  {
    id: 'magnitude_only',
    label: '2. Magnitude-only modal sum',
    description: 'Sum |Ψ·H| per mode, discard phase. Tests whether phase cancellation is driving the null.',
  },
  {
    id: 'monte_carlo',
    label: '3. Random phase Monte-Carlo (100 runs avg)',
    description: 'Each run assigns uniform random phase to each mode. Average of 100 RMS results.',
  },
  {
    id: 'rss',
    label: '4. Energy sum (RSS)',
    description: 'Root-sum-of-squares across all modal magnitudes. Fully incoherent energy combination.',
  },
  {
    id: 'family_coherent',
    label: '5. Pairwise coherent within families only',
    description: 'Modes in the same family (axial/tangential/oblique) sum coherently; families combine RSS.',
  },
  {
    id: 'axial_coherent_tang_rss',
    label: '6. Axial coherent, Tangential+Oblique RSS',
    description: 'Axial modes coherent; tangential and oblique each contribute energy-sum magnitude.',
  },
  {
    id: 'all_families_rss',
    label: '7. All modal families RSS',
    description: 'Axial, tangential, and oblique family magnitudes RSS-combined.',
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function interp(data, hz) {
  if (!data || data.length === 0) return null;
  const sorted = [...data].sort((a, b) => a.hz - b.hz);
  if (hz <= sorted[0].hz) return sorted[0].db;
  if (hz >= sorted[sorted.length - 1].hz) return sorted[sorted.length - 1].db;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (hz >= sorted[i].hz && hz <= sorted[i + 1].hz) {
      const t = (hz - sorted[i].hz) / (sorted[i + 1].hz - sorted[i].hz);
      return sorted[i].db + t * (sorted[i + 1].db - sorted[i].db);
    }
  }
  return null;
}

function scoreAgainstBenchmark(simData) {
  let sumErr = 0, count = 0, worstErr = 0, worstHz = 0;
  for (const { hz, db: ref } of REW_BENCHMARK) {
    const sim = interp(simData, hz);
    if (sim === null) continue;
    const err = Math.abs(sim - ref);
    sumErr += err;
    count++;
    if (err > worstErr) { worstErr = err; worstHz = hz; }
  }
  return { mae: count > 0 ? sumErr / count : null, worstErr, worstHz };
}

function errAtHz(simData, hz) {
  const sim = interp(simData, hz);
  const ref = interp(REW_BENCHMARK, hz);
  if (sim === null || ref === null) return null;
  return sim - ref;
}

function buildCleanSeries(result) {
  const raw = (result.freqsHz || []).map((hz, i) => {
    const re = result.complexPressure[i]?.re ?? 0;
    const im = result.complexPressure[i]?.im ?? 0;
    const mag = Math.sqrt(re * re + im * im);
    return { hz, db: 20 * Math.log10(Math.max(mag, 1e-10)) };
  }).filter(p => Number.isFinite(p.hz) && p.hz > 0);
  raw.sort((a, b) => a.hz - b.hz);
  const deduped = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i + 1] && Math.abs(raw[i].hz - raw[i + 1].hz) < 1e-9) continue;
    deduped.push(raw[i]);
  }
  return deduped;
}

// Build frequency axis (96 pts/octave, matches engine)
function buildFreqAxis(minHz = 20, maxHz = 200) {
  const freqs = [];
  const octaves = Math.log2(maxHz / minHz);
  const ppo = 96;
  const total = Math.ceil(octaves * ppo);
  for (let i = 0; i <= total; i++) {
    const hz = minHz * Math.pow(2, i / ppo);
    if (hz > maxHz) break;
    freqs.push(hz);
  }
  if (freqs[freqs.length - 1] !== maxHz) freqs.push(maxHz);
  return freqs;
}

function interpCurve(curve, hz) {
  const pts = [...curve].sort((a, b) => a.hz - b.hz);
  if (hz <= pts[0].hz) return pts[0].db;
  if (hz >= pts[pts.length - 1].hz) return pts[pts.length - 1].db;
  for (let i = 0; i < pts.length - 1; i++) {
    if (hz >= pts[i].hz && hz <= pts[i + 1].hz) {
      const t = (hz - pts[i].hz) / (pts[i + 1].hz - pts[i].hz);
      return pts[i].db + t * (pts[i + 1].db - pts[i].db);
    }
  }
  return pts[0].db;
}

// Deterministic seeded random for Monte-Carlo reproducibility
function seededRand(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

// ── Low-level modal computation (isolated, does not call engine) ───────────────
function computeModalContributions(roomDims, subPos, seatPos, modes, curveDb, gainDb) {
  const amplitude = Math.pow(10, (curveDb + (gainDb ?? 0)) / 20);
  return modes.map(mode => {
    const srcPsi = modeShapeValueLocal(mode, subPos.x, subPos.y, subPos.z ?? 0.35, roomDims);
    const rcvPsi = modeShapeValueLocal(mode, seatPos.x, seatPos.y, seatPos.z ?? 1.2, roomDims);
    const coupling = srcPsi * rcvPsi;
    const modeOrder = Math.abs(mode.nx) + Math.abs(mode.ny) + Math.abs(mode.nz);
    const orderWeight = modeOrder >= 2 ? 0.50 : 1.0;
    const axialScale = (mode.type === 'axial' && modeOrder >= 2) ? 0.50 : 1.0;
    const gain = amplitude * coupling * orderWeight * axialScale;
    return { mode, gain, type: mode.type };
  });
}

function applyResonantTransfer(gain, freqHz, mode) {
  const { re, im } = resonantTransfer(freqHz, mode.freq, mode.qValue);
  return { re: gain * re, im: gain * im };
}

function buildDirectSeries(roomDims, subPos, seatPos, freqAxis, sub) {
  // Direct path only (no reflections, no modes)
  const dx = subPos.x - seatPos.x;
  const dy = subPos.y - seatPos.y;
  const dz = (subPos.z ?? 0.35) - (seatPos.z ?? 1.2);
  const dist = Math.max(0.01, Math.sqrt(dx*dx + dy*dy + dz*dz));
  return freqAxis.map(hz => {
    const curveDb = interpCurve(FLAT_REF, hz);
    const distLossDb = -20 * Math.log10(dist);
    const amp = Math.pow(10, (curveDb + distLossDb + (sub?.tuning?.gainDb ?? 0)) / 20);
    const phase = -2 * Math.PI * hz * (dist / SPEED_OF_SOUND);
    return { hz, re: amp * Math.cos(phase), im: amp * Math.sin(phase) };
  });
}

// Run one coherence mode and return { hz, db }[]
function runCoherenceMode(modeId, roomDims, subPos, seatPos, modes, freqAxis, sub) {
  const directSeries = buildDirectSeries(roomDims, subPos, seatPos, freqAxis, sub);

  if (modeId === 'coherent') {
    // Use the engine directly (most accurate, matches production path)
    const result = simulateBassResponseRewCore(
      roomDims,
      { x: seatPos.x, y: seatPos.y, z: seatPos.z ?? 1.2 },
      { ...sub, x: subPos.x, y: subPos.y, z: subPos.z ?? 0.35 },
      FLAT_REF,
      {
        enableReflections: false,
        enableModes: true,
        modalGainScalar: 1.0,
        propagationPhaseScale: 0,
        pureDeterministicModalSum: true,
        disableModalPropagationPhase: true,
        disableLateField: true,
        freqMinHz: 20,
        freqMaxHz: 200,
      }
    );
    return buildCleanSeries(result);
  }

  // For custom coherence modes: compute per-frequency modal sums manually
  return freqAxis.map((hz, idx) => {
    const curveDb = interpCurve(FLAT_REF, hz);
    const contribs = computeModalContributions(roomDims, subPos, seatPos, modes, curveDb, sub?.tuning?.gainDb ?? 0);
    let totalRe = directSeries[idx].re;
    let totalIm = directSeries[idx].im;
    let modalMag = 0;

    if (modeId === 'magnitude_only') {
      // Sum |contribution| — strip phase entirely
      let magSum = 0;
      for (const { gain, mode } of contribs) {
        const { re, im } = applyResonantTransfer(gain, hz, mode);
        magSum += Math.sqrt(re*re + im*im);
      }
      // Add modal magnitude to direct magnitude (incoherent magnitude addition)
      const directMag = Math.sqrt(totalRe*totalRe + totalIm*totalIm);
      modalMag = directMag + magSum;
      return { hz, db: 20 * Math.log10(Math.max(modalMag, 1e-10)) };
    }

    if (modeId === 'rss') {
      // RSS of all modal magnitudes, added in energy to direct
      let energySum = 0;
      for (const { gain, mode } of contribs) {
        const { re, im } = applyResonantTransfer(gain, hz, mode);
        energySum += re*re + im*im;
      }
      const directMag = Math.sqrt(totalRe*totalRe + totalIm*totalIm);
      const finalMag = Math.sqrt(directMag*directMag + energySum);
      return { hz, db: 20 * Math.log10(Math.max(finalMag, 1e-10)) };
    }

    if (modeId === 'monte_carlo') {
      // Average of 100 runs with random mode phases
      let avgEnergy = 0;
      const N = 100;
      for (let run = 0; run < N; run++) {
        const rand = seededRand(run * 31337 + Math.round(hz * 100));
        let re = totalRe, im = totalIm;
        for (const { gain, mode } of contribs) {
          const { re: mr, im: mi } = applyResonantTransfer(gain, hz, mode);
          const phase = rand() * 2 * Math.PI;
          const c = Math.cos(phase), s = Math.sin(phase);
          re += mr*c - mi*s;
          im += mr*s + mi*c;
        }
        avgEnergy += re*re + im*im;
      }
      const rmsMag = Math.sqrt(avgEnergy / N);
      return { hz, db: 20 * Math.log10(Math.max(rmsMag, 1e-10)) };
    }

    if (modeId === 'family_coherent') {
      // Each family sums coherently; families combine RSS with direct energy
      const axial = { re: 0, im: 0 };
      const tangential = { re: 0, im: 0 };
      const oblique = { re: 0, im: 0 };
      for (const { gain, mode } of contribs) {
        const { re, im } = applyResonantTransfer(gain, hz, mode);
        if (mode.type === 'axial')      { axial.re += re; axial.im += im; }
        else if (mode.type === 'tangential') { tangential.re += re; tangential.im += im; }
        else { oblique.re += re; oblique.im += im; }
      }
      const directMagSq   = totalRe*totalRe + totalIm*totalIm;
      const axialMagSq    = axial.re*axial.re + axial.im*axial.im;
      const tangMagSq     = tangential.re*tangential.re + tangential.im*tangential.im;
      const oblMagSq      = oblique.re*oblique.re + oblique.im*oblique.im;
      const finalMag = Math.sqrt(directMagSq + axialMagSq + tangMagSq + oblMagSq);
      return { hz, db: 20 * Math.log10(Math.max(finalMag, 1e-10)) };
    }

    if (modeId === 'axial_coherent_tang_rss') {
      // Axial: coherent sum; tangential+oblique each contribute energy
      const axial = { re: 0, im: 0 };
      let tangOblEnergy = 0;
      for (const { gain, mode } of contribs) {
        const { re, im } = applyResonantTransfer(gain, hz, mode);
        if (mode.type === 'axial') { axial.re += re; axial.im += im; }
        else tangOblEnergy += re*re + im*im;
      }
      // Axial adds coherently to direct
      const postAxialRe = totalRe + axial.re;
      const postAxialIm = totalIm + axial.im;
      const postAxialMagSq = postAxialRe*postAxialRe + postAxialIm*postAxialIm;
      const finalMag = Math.sqrt(postAxialMagSq + tangOblEnergy);
      return { hz, db: 20 * Math.log10(Math.max(finalMag, 1e-10)) };
    }

    if (modeId === 'all_families_rss') {
      // Compute per-family coherent sums, then RSS all families + direct
      const axial = { re: 0, im: 0 };
      const tang  = { re: 0, im: 0 };
      const obl   = { re: 0, im: 0 };
      for (const { gain, mode } of contribs) {
        const { re, im } = applyResonantTransfer(gain, hz, mode);
        if (mode.type === 'axial')       { axial.re += re; axial.im += im; }
        else if (mode.type === 'tangential') { tang.re += re; tang.im += im; }
        else { obl.re += re; obl.im += im; }
      }
      const directMagSq = totalRe*totalRe + totalIm*totalIm;
      const axMagSq = axial.re*axial.re + axial.im*axial.im;
      const tgMagSq = tang.re*tang.re + tang.im*tang.im;
      const obMagSq = obl.re*obl.re + obl.im*obl.im;
      const finalMag = Math.sqrt(directMagSq + axMagSq + tgMagSq + obMagSq);
      return { hz, db: 20 * Math.log10(Math.max(finalMag, 1e-10)) };
    }

    // Fallback: coherent
    return { hz, db: 0 };
  });
}

// ── Styles ────────────────────────────────────────────────────────────────────
const TH = {
  padding: '4px 8px', fontSize: 8, fontWeight: 700, fontFamily: 'monospace',
  background: '#1c1917', color: '#d6d3d1', textAlign: 'right',
  borderBottom: '2px solid #292524', whiteSpace: 'nowrap',
};
const TD = { padding: '3px 8px', fontSize: 8, fontFamily: 'monospace', textAlign: 'right' };
const TDL = { ...TD, textAlign: 'left' };

function errColor(v) {
  if (!Number.isFinite(v)) return '#6b7280';
  const a = Math.abs(v);
  if (a <= 1) return '#4ade80';
  if (a <= 3) return '#fbbf24';
  if (a <= 6) return '#fb923c';
  return '#f87171';
}
function fmt(v, d = 2) { return Number.isFinite(v) ? v.toFixed(d) : '—'; }
function fmtSigned(v, d = 2) {
  if (!Number.isFinite(v)) return '—';
  return (v >= 0 ? '+' : '') + v.toFixed(d);
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ModalCoherenceSweepAudit({ roomDims, subs, seat, surfaceAbsorption }) {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);

  const hasRoom = !!(roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM);
  const currentSub = subs?.[0] ?? null;
  const mlpSeat = seat ?? null;

  const run = () => {
    if (!hasRoom || !mlpSeat || !currentSub) return;
    setRunning(true);
    setTimeout(() => {
      try {
        const freqAxis = buildFreqAxis(20, 200);
        const subPos = { x: currentSub.x, y: currentSub.y, z: currentSub.z ?? 0.35 };
        const seatPos = { x: mlpSeat.x, y: mlpSeat.y, z: mlpSeat.z ?? 1.2 };

        // Pre-compute modes (shared across all coherence modes)
        const rawModes = computeRoomModesLocal({
          widthM: roomDims.widthM,
          lengthM: roomDims.lengthM,
          heightM: roomDims.heightM,
          fMax: 200,
          c: SPEED_OF_SOUND,
        });
        const modes = rawModes.map(mode => {
          // Mirror engine Q logic: clamp to absorption Q
          const activeAxes = (mode.nx > 0 ? 1 : 0) + (mode.ny > 0 ? 1 : 0) + (mode.nz > 0 ? 1 : 0);
          const baseQ = activeAxes === 1 ? 4.0 : activeAxes === 2 ? 3.9 : 2.5;
          const absorptionQ = estimateModeQLocal({
            roomDims,
            surfaceAbsorption: surfaceAbsorption ?? {},
            f0: mode.freq,
          });
          return { ...mode, qValue: Math.max(1, Math.min(baseQ, absorptionQ)) };
        });

        const rows = SWEEP_MODES.map(sweepMode => {
          const series = runCoherenceMode(
            sweepMode.id, roomDims, subPos, seatPos, modes, freqAxis, currentSub
          );
          const { mae, worstErr, worstHz } = scoreAgainstBenchmark(series);
          const errors = {};
          for (const hz of TARGET_HZ) errors[hz] = errAtHz(series, hz);
          return { id: sweepMode.id, label: sweepMode.label, description: sweepMode.description, mae, worstErr, worstHz, errors };
        });
        setResults(rows);
      } catch (e) {
        console.error('[ModalCoherenceSweepAudit]', e);
      } finally {
        setRunning(false);
      }
    }, 0);
  };

  const bestMaeIdx = useMemo(() => {
    if (!results) return -1;
    let best = Infinity, idx = -1;
    results.forEach((r, i) => { if ((r.mae ?? Infinity) < best) { best = r.mae; idx = i; } });
    return idx;
  }, [results]);

  return (
    <div style={{
      marginTop: 12, border: '1px solid #292524', borderRadius: 8,
      background: '#0c0a09', padding: '10px 12px',
    }}>
      {/* Header */}
      <div style={{ fontWeight: 700, color: '#d6d3d1', fontSize: 11, fontFamily: 'monospace', marginBottom: 3 }}>
        Modal Coherence Sweep Audit
        <span style={{ fontWeight: 400, color: '#44403c', marginLeft: 10, fontSize: 10 }}>
          diagnostic only · does not affect live graph
        </span>
      </div>
      <div style={{ fontSize: 9, color: '#57534e', fontFamily: 'monospace', marginBottom: 8, lineHeight: 1.7 }}>
        Fixed: Direct+Modes · Reflections OFF · Flat REW reference · ModalGain 1.0 · current Q + source model.<br />
        Tests 7 modal summation strategies. Goal: determine whether the parity gap is a coherence artefact.
      </div>

      {/* Warnings */}
      {!hasRoom && (
        <div style={{ fontSize: 10, color: '#fbbf24', fontFamily: 'monospace', marginBottom: 6 }}>⚠ Requires room dimensions.</div>
      )}
      {hasRoom && !mlpSeat && (
        <div style={{ fontSize: 10, color: '#fbbf24', fontFamily: 'monospace', marginBottom: 6 }}>⚠ Requires a seat/MLP position.</div>
      )}
      {hasRoom && !currentSub && (
        <div style={{ fontSize: 10, color: '#fbbf24', fontFamily: 'monospace', marginBottom: 6 }}>⚠ Requires a subwoofer configuration.</div>
      )}

      {/* Config preview */}
      {hasRoom && mlpSeat && currentSub && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 9, fontFamily: 'monospace',
          color: '#78716c', background: '#1c1917', borderRadius: 4, padding: '5px 10px', marginBottom: 8,
        }}>
          <span>Room: <strong style={{ color: '#d6d3d1' }}>
            {roomDims.widthM.toFixed(2)}W × {roomDims.lengthM.toFixed(2)}L × {roomDims.heightM.toFixed(2)}H m
          </strong></span>
          <span>MLP: <strong style={{ color: '#86efac' }}>
            ({mlpSeat.x?.toFixed(3)}, {mlpSeat.y?.toFixed(3)}, {(mlpSeat.z ?? 1.2).toFixed(3)}) m
          </strong></span>
          <span>Sub: <strong style={{ color: '#93c5fd' }}>
            ({currentSub.x?.toFixed(3)}, {currentSub.y?.toFixed(3)}, {(currentSub.z ?? 0.35).toFixed(3)}) m
          </strong></span>
        </div>
      )}

      {/* Run button */}
      {hasRoom && mlpSeat && currentSub && (
        <button
          onClick={run}
          disabled={running}
          style={{
            padding: '5px 14px', borderRadius: 5, border: '1px solid #57534e',
            background: running ? '#1c1917' : '#292524', color: running ? '#57534e' : '#d6d3d1',
            fontSize: 10, fontFamily: 'monospace', cursor: running ? 'default' : 'pointer',
            marginBottom: 10, fontWeight: 700,
          }}
        >
          {running ? 'Running 7 coherence modes…' : 'Run Modal Coherence Sweep (7 modes)'}
        </button>
      )}

      {/* Results table */}
      {results && (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 680 }}>
              <thead>
                <tr>
                  <th style={{ ...TH, textAlign: 'left', width: 220 }}>Coherence strategy</th>
                  <th style={{ ...TH, color: '#fbbf24' }}>MAE</th>
                  <th style={{ ...TH, color: '#fb923c' }}>Worst err</th>
                  <th style={TH}>Worst Hz</th>
                  <th style={{ ...TH, color: '#93c5fd' }}>70 Hz err</th>
                  <th style={{ ...TH, color: '#6ee7b7' }}>80 Hz err</th>
                  <th style={TH}>85 Hz err</th>
                </tr>
              </thead>
              <tbody>
                {results.map((row, i) => {
                  const isBest = i === bestMaeIdx;
                  return (
                    <tr key={row.id} style={{ borderBottom: '1px solid #1c1917', background: isBest ? '#172554' : undefined }}>
                      <td style={{ ...TDL, color: isBest ? '#93c5fd' : '#a8a29e', fontWeight: isBest ? 700 : 400 }}>
                        {isBest && <span style={{ color: '#60a5fa', marginRight: 4 }}>★</span>}
                        {row.label}
                      </td>
                      <td style={{ ...TD, fontWeight: 700, color: isBest ? '#60a5fa' : errColor(row.mae) }}>
                        {fmt(row.mae)}
                      </td>
                      <td style={{ ...TD, color: errColor(row.worstErr) }}>{fmt(row.worstErr)}</td>
                      <td style={{ ...TD, color: '#6b7280' }}>{row.worstHz}</td>
                      {TARGET_HZ.map(hz => (
                        <td key={hz} style={{ ...TD, color: errColor(row.errors[hz]) }}>
                          {fmtSigned(row.errors[hz])}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Description column */}
          <div style={{ marginTop: 8, fontSize: 8, fontFamily: 'monospace', color: '#44403c', lineHeight: 1.9 }}>
            {results.map((row, i) => (
              <div key={row.id}>
                <span style={{ color: i === bestMaeIdx ? '#60a5fa' : '#57534e', fontWeight: i === bestMaeIdx ? 700 : 400 }}>
                  {row.label.split('.')[0]}:
                </span>
                <span style={{ color: '#3b3836', marginLeft: 6 }}>{row.description}</span>
              </div>
            ))}
          </div>

          {/* Legend */}
          <div style={{ marginTop: 8, fontSize: 9, fontFamily: 'monospace', color: '#44403c', lineHeight: 1.8, borderTop: '1px solid #1c1917', paddingTop: 6 }}>
            <strong style={{ color: '#78716c' }}>★</strong> best MAE &nbsp;&nbsp;
            Error colours: <span style={{ color: '#4ade80' }}>≤1 dB</span> · <span style={{ color: '#fbbf24' }}>≤3 dB</span> · <span style={{ color: '#fb923c' }}>≤6 dB</span> · <span style={{ color: '#f87171' }}>&gt;6 dB</span><br />
            Errors are signed vs REW benchmark (+= over, −= under). All modes use orderWeight×0.5 for order≥2 axial, matching production.
          </div>

          {/* Interpretation */}
          <div style={{ marginTop: 8, fontSize: 9, fontFamily: 'monospace', color: '#57534e', lineHeight: 1.8 }}>
            If a non-coherent strategy (RSS or magnitude-only) achieves lower MAE than fully coherent,
            the parity gap is driven by phase-cancellation in the modal sum rather than individual mode levels.
            If all strategies produce similar MAE, the gap is not a coherence issue — investigate mode amplitudes or Q values.
          </div>
        </>
      )}
    </div>
  );
}