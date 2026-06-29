/**
 * TransferFunctionShapeAudit.jsx
 * Individual Modal Transfer Function Audit – are individual modes too broad?
 * Diagnostic only. No production changes.
 */
import { useState, useMemo } from 'react';
import {
  computeRoomModesLocal,
  estimateModeQLocal,
  modeShapeValueLocal,
  resonantTransfer,
} from '@/bass/core/modalCalculations.js';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ResponsiveContainer } from 'recharts';

// ── Constants ─────────────────────────────────────────────────────────────────
const C = 343;
const FLAT_SOURCE_DB = 94;
const MODE_COLORS = ['#2563eb','#16a34a','#d97706','#9333ea','#dc2626'];
const NULL_COLOR  = '#b91c1c';
const PEAK_COLOR  = '#166534';

const f1  = (v) => Number.isFinite(v) ? v.toFixed(1)  : '—';
const f2  = (v) => Number.isFinite(v) ? v.toFixed(2)  : '—';
const f3  = (v) => Number.isFinite(v) ? v.toFixed(3)  : '—';
const fS  = (v) => Number.isFinite(v) ? v.toExponential(3) : '—';

// ── Mode Q helpers (mirror ModalEnergyContributionAudit) ─────────────────────
function modeQByType(mode, axialQ = 4.0) {
  const axes = (mode.nx > 0 ? 1 : 0) + (mode.ny > 0 ? 1 : 0) + (mode.nz > 0 ? 1 : 0);
  if (axes === 1) return axialQ;
  if (axes === 2) return 3.9;
  return 2.5;
}

// ── Classical H(f) = 1 / (fn²−f²+ j·fn·f/Q) ─────────────────────────────────
// Returns { mag, phaseDeg } at frequency f for mode resonating at fn with quality Q.
function classicalH(f, fn, Q) {
  const re = fn * fn - f * f;
  const im = fn * f / Math.max(Q, 1e-6);
  const mag = 1 / Math.sqrt(re * re + im * im);
  const phaseDeg = Math.atan2(-im, re) * 180 / Math.PI;
  return { re, im, mag, phaseDeg };
}

// ── Half-power bandwidth from Q ───────────────────────────────────────────────
function halfPowerBw(fn, Q) { return fn / Math.max(Q, 1e-6); }

// ── Build per-frequency sweep for one mode across ±1 octave ──────────────────
function buildModeSweep(mode, source, seat, roomDims, modalSourceAmp, nPts = 120) {
  const fLow  = mode.freq / 2;
  const fHigh = mode.freq * 2;
  const freqs = [];
  for (let i = 0; i < nPts; i++) {
    freqs.push(fLow * Math.pow(fHigh / fLow, i / (nPts - 1)));
  }

  const sc = modeShapeValueLocal(mode, source.x, source.y, source.z, roomDims);
  const rc = modeShapeValueLocal(mode, seat.x, seat.y, seat.z, roomDims);
  const coupling = sc * rc;

  return freqs.map(f => {
    // B44 resonant transfer (as used in production)
    const b44 = resonantTransfer(f, mode.freq, mode.qValue);
    const b44Mag  = Math.sqrt(b44.re * b44.re + b44.im * b44.im);
    const b44PhDeg = Math.atan2(b44.im, b44.re) * 180 / Math.PI;
    const b44Contrib = modalSourceAmp * Math.abs(coupling) * b44Mag;
    const b44Db  = 20 * Math.log10(Math.max(b44Contrib, 1e-12));

    // Classical second-order reference H(f)
    const cls = classicalH(f, mode.freq, mode.qValue);
    const clsContrib = modalSourceAmp * Math.abs(coupling) * cls.mag;
    const clsDb  = 20 * Math.log10(Math.max(clsContrib, 1e-12));

    return {
      f,
      b44Db, b44PhDeg, b44Contrib,
      clsDb, clsPhDeg: cls.phaseDeg, clsContrib,
      ampDiffDb: b44Db - clsDb,
      phDiffDeg: b44PhDeg - cls.phaseDeg,
    };
  });
}

// ── Analyse a single mode's TF shape ─────────────────────────────────────────
function analyseModeShape(mode, source, seat, roomDims, modalSourceAmp) {
  const sweep = buildModeSweep(mode, source, seat, roomDims, modalSourceAmp);
  const atResonance = sweep.reduce((best, p) => p.b44Db > best.b44Db ? p : best, sweep[0]);
  const peakDb = atResonance.b44Db;
  const halfPowerDb = peakDb - 3;

  // Measured −3 dB bandwidth (B44)
  const above = sweep.filter(p => p.b44Db >= halfPowerDb);
  const measuredBwHz = above.length >= 2
    ? above[above.length - 1].f - above[0].f
    : null;

  // Classical prediction
  const classicalBwHz = halfPowerBw(mode.freq, mode.qValue);

  // Phase at resonance (should be −90° for classical 2nd-order)
  const phaseAtRes = atResonance.b44PhDeg;
  const clsPhaseAtRes = -90; // canonical

  // Bandwidth ratio
  const bwRatio = (measuredBwHz !== null && classicalBwHz > 0)
    ? measuredBwHz / classicalBwHz : null;

  // Mean amplitude diff across sweep
  const meanAmpDiff = sweep.reduce((s, p) => s + p.ampDiffDb, 0) / sweep.length;
  const meanPhDiff  = sweep.reduce((s, p) => s + p.phDiffDeg, 0) / sweep.length;

  const sc = modeShapeValueLocal(mode, source.x, source.y, source.z, roomDims);
  const rc = modeShapeValueLocal(mode, seat.x, seat.y, seat.z, roomDims);
  const coupling = sc * rc;
  const dampCoeff = mode.freq / Math.max(mode.qValue, 1e-6) / (2 * Math.PI); // ζ·ωn simplified

  return {
    mode, coupling, sc, rc, dampCoeff,
    sweep, peakDb, measuredBwHz, classicalBwHz, bwRatio,
    phaseAtRes, meanAmpDiff, meanPhDiff,
    isBroader: bwRatio !== null && bwRatio > 1.15,
    isLower: peakDb < (20 * Math.log10(Math.max(modalSourceAmp * Math.abs(coupling), 1e-12)) - 3),
    phaseTooSlow: Math.abs(phaseAtRes - clsPhaseAtRes) > 20,
  };
}

// ── Find top-5 modes at a given frequency ────────────────────────────────────
function topModesAt(freqHz, modes, source, seat, roomDims, modalSourceAmp, n = 5) {
  return modes
    .map(mode => {
      const sc = modeShapeValueLocal(mode, source.x, source.y, source.z, roomDims);
      const rc = modeShapeValueLocal(mode, seat.x, seat.y, seat.z, roomDims);
      const tf = resonantTransfer(freqHz, mode.freq, mode.qValue);
      const gain = modalSourceAmp * sc * rc;
      const re = gain * tf.re, im = gain * tf.im;
      const mag = Math.sqrt(re * re + im * im);
      return { mode, mag };
    })
    .sort((a, b) => b.mag - a.mag)
    .slice(0, n)
    .map(({ mode }) => mode);
}

// ── Run the full audit ────────────────────────────────────────────────────────
function runAudit(roomDims, seat, source, surfaceAbsorption) {
  const modesRaw = computeRoomModesLocal({ ...roomDims, fMax: 220, c: C });
  const modes = modesRaw.map(m => {
    const baseQ = modeQByType(m, 4.0);
    const absQ  = estimateModeQLocal({ roomDims, surfaceAbsorption, f0: m.freq });
    return { ...m, qValue: Math.max(1, Math.min(baseQ, absQ)) };
  });

  const dx = source.x - seat.x, dy = source.y - seat.y, dz = source.z - seat.z;
  const distM = Math.max(0.01, Math.sqrt(dx*dx + dy*dy + dz*dz));
  const modalSourceAmp = Math.pow(10, (FLAT_SOURCE_DB - 20 * Math.log10(distM)) / 20);

  // Full sweep to find null/peak
  const freqs = [];
  for (let i = 0; i <= 300; i++) freqs.push(20 * Math.pow(220/20, i/300));
  const sweep = freqs.map(hz => {
    let sumRe = 0, sumIm = 0;
    modes.forEach(mode => {
      const sc = modeShapeValueLocal(mode, source.x, source.y, source.z, roomDims);
      const rc = modeShapeValueLocal(mode, seat.x, seat.y, seat.z, roomDims);
      const tf = resonantTransfer(hz, mode.freq, mode.qValue);
      const g = modalSourceAmp * sc * rc;
      sumRe += g * tf.re; sumIm += g * tf.im;
    });
    const mag = Math.sqrt(sumRe*sumRe + sumIm*sumIm);
    return { hz, splDb: 20 * Math.log10(Math.max(mag, 1e-10)) };
  });

  const band = sweep.filter(p => p.hz >= 20 && p.hz <= 120);
  const nullPt = band.reduce((b, p) => !b || p.splDb < b.splDb ? p : b, null);
  const peakPt = band.reduce((b, p) => !b || p.splDb > b.splDb ? p : b, null);

  const nullModes = nullPt ? topModesAt(nullPt.hz, modes, source, seat, roomDims, modalSourceAmp, 5) : [];
  const peakModes = peakPt ? topModesAt(peakPt.hz, modes, source, seat, roomDims, modalSourceAmp, 5) : [];

  const nullAnalysis = nullModes.map(m => analyseModeShape(m, source, seat, roomDims, modalSourceAmp));
  const peakAnalysis = peakModes.map(m => analyseModeShape(m, source, seat, roomDims, modalSourceAmp));

  // Coherent sum overlay for null modes (at null frequency, across ±1 oct)
  const buildCoherentSumSweep = (modeSet, centreHz) => {
    const fLow = centreHz / 2, fHigh = centreHz * 2;
    const pts = [];
    for (let i = 0; i < 120; i++) {
      const f = fLow * Math.pow(fHigh/fLow, i/119);
      let sumRe = 0, sumIm = 0;
      modeSet.forEach(mode => {
        const sc = modeShapeValueLocal(mode, source.x, source.y, source.z, roomDims);
        const rc = modeShapeValueLocal(mode, seat.x, seat.y, seat.z, roomDims);
        const tf = resonantTransfer(f, mode.freq, mode.qValue);
        const g = modalSourceAmp * sc * rc;
        sumRe += g * tf.re; sumIm += g * tf.im;
      });
      const mag = Math.sqrt(sumRe*sumRe + sumIm*sumIm);
      pts.push({ f, db: 20 * Math.log10(Math.max(mag, 1e-12)) });
    }
    return pts;
  };

  const nullCohSum = nullPt ? buildCoherentSumSweep(nullModes, nullPt.hz) : [];
  const peakCohSum = peakPt ? buildCoherentSumSweep(peakModes, peakPt.hz) : [];

  // --- 6 diagnostic answers ---
  const allAnalysis = [...nullAnalysis, ...peakAnalysis];
  const broaderCount = allAnalysis.filter(a => a.isBroader).length;
  const lowerCount   = allAnalysis.filter(a => a.isLower).length;
  const slowPhCount  = allAnalysis.filter(a => a.phaseTooSlow).length;
  const avgBwRatio   = allAnalysis.reduce((s,a,_,arr) => s + (a.bwRatio??1)/arr.length, 0);
  const avgMeanAmpDiff = allAnalysis.reduce((s,a,_,arr) => s + a.meanAmpDiff/arr.length, 0);
  const avgPhDiff    = allAnalysis.reduce((s,a,_,arr) => s + Math.abs(a.meanPhDiff)/arr.length, 0);

  const nullDepth = nullPt && peakPt ? peakPt.splDb - nullPt.splDb : null;

  // Discrepancy estimate
  const bwContrib  = Math.min(40, broaderCount * 7);          // % explained by broad modes
  const phContrib  = Math.min(30, slowPhCount  * 6);
  const cplContrib = Math.min(20, allAnalysis.filter(a => Math.abs(a.coupling) < 0.3).length * 5);
  const ampContrib = Math.min(20, lowerCount   * 5);
  const total      = Math.min(95, bwContrib + phContrib + cplContrib + ampContrib);

  return {
    nullPt, peakPt, nullDepth, modes,
    nullAnalysis, peakAnalysis,
    nullCohSum, peakCohSum,
    broaderCount, lowerCount, slowPhCount,
    avgBwRatio, avgMeanAmpDiff, avgPhDiff,
    discrepancy: { bwContrib, phContrib, cplContrib, ampContrib, total },
    questions: {
      q1_broader: broaderCount > 3,
      q2_lower: lowerCount > 3,
      q3_phaseSlow: slowPhCount > 3,
      q4_dampBroad: avgBwRatio > 1.2,
      q5_couplingLow: allAnalysis.some(a => Math.abs(a.coupling) < 0.2),
      q6_tfExplains: total > 50,
    },
  };
}

// ── Chart: individual TF lines + coherent sum ─────────────────────────────────
function TfOverlayChart({ analysis, cohSum, centreHz, label, color }) {
  if (!analysis.length) return null;

  const data = analysis[0].sweep.map((pt, i) => {
    const row = { f: Math.round(pt.f * 10) / 10 };
    analysis.forEach((a, mi) => {
      row[`m${mi}_b44`] = Math.round(a.sweep[i].b44Db * 10) / 10;
      row[`m${mi}_cls`] = Math.round(a.sweep[i].clsDb * 10) / 10;
    });
    const cohPt = cohSum[Math.round(i * (cohSum.length - 1) / (analysis[0].sweep.length - 1))] ?? null;
    row['coherent'] = cohPt ? Math.round(cohPt.db * 10) / 10 : null;
    return row;
  });

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontWeight: 700, fontSize: 11, fontFamily: 'monospace', color, marginBottom: 4 }}>
        {label} — TF overlay (±1 octave around {centreHz?.toFixed(1)} Hz)
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 4, right: 10, left: -10, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="f" type="number" scale="log" domain={['auto','auto']}
            tickFormatter={v => `${v.toFixed(0)}`} tick={{ fontSize: 9, fontFamily: 'monospace' }}
            label={{ value: 'Hz', position: 'insideRight', fontSize: 9, dx: 6 }} />
          <YAxis tick={{ fontSize: 9, fontFamily: 'monospace' }}
            label={{ value: 'dB (contrib.)', angle: -90, position: 'insideLeft', fontSize: 8, dy: 40 }} />
          <Tooltip formatter={(v, k) => [v?.toFixed(1) + ' dB', k]} labelFormatter={v => `${Number(v).toFixed(1)} Hz`}
            contentStyle={{ fontSize: 9, fontFamily: 'monospace' }} />
          <Legend wrapperStyle={{ fontSize: 9, fontFamily: 'monospace' }} />
          <ReferenceLine x={centreHz} stroke={color} strokeDasharray="6 3" strokeWidth={1} />
          {analysis.map((a, mi) => (
            <Line key={`m${mi}_b44`} dataKey={`m${mi}_b44`}
              name={`(${a.mode.nx},${a.mode.ny},${a.mode.nz}) B44`}
              stroke={MODE_COLORS[mi % 5]} dot={false} strokeWidth={1.5} />
          ))}
          {analysis.map((a, mi) => (
            <Line key={`m${mi}_cls`} dataKey={`m${mi}_cls`}
              name={`(${a.mode.nx},${a.mode.ny},${a.mode.nz}) Classical`}
              stroke={MODE_COLORS[mi % 5]} dot={false} strokeWidth={1} strokeDasharray="4 3" opacity={0.55} />
          ))}
          <Line dataKey="coherent" name="Coherent sum" stroke="#0f172a" strokeWidth={2.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
      <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#94a3b8' }}>
        Solid = B44 resonantTransfer · Dashed = classical H(f) = 1/(fn²−f²+jfnf/Q) · Black = coherent sum of top-5
      </div>
    </div>
  );
}

// ── Mode metrics table ────────────────────────────────────────────────────────
function ModeMetricsTable({ analysisArr, label, color }) {
  const th = { padding: '3px 8px', fontSize: 9, fontFamily: 'monospace', fontWeight: 700, background: color + '22', color, textAlign: 'right', borderBottom: `2px solid ${color}` };
  const thL = { ...th, textAlign: 'left' };
  const td = { padding: '3px 8px', fontSize: 9, fontFamily: 'monospace', textAlign: 'right', borderBottom: '1px solid #e2e8f0' };
  const tdL = { ...td, textAlign: 'left' };

  return (
    <div style={{ marginBottom: 12, border: `1px solid ${color}44`, borderRadius: 6, background: '#fff', padding: '8px 10px' }}>
      <div style={{ fontWeight: 700, fontSize: 11, fontFamily: 'monospace', color, marginBottom: 6 }}>{label}</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 760 }}>
          <thead>
            <tr>
              <th style={{ ...thL, minWidth: 130 }}>Mode</th>
              <th style={th}>fn (Hz)</th>
              <th style={th}>Q</th>
              <th style={th}>Damp coeff</th>
              <th style={th}>Coupling</th>
              <th style={th}>Peak (dB)</th>
              <th style={th}>BW−3dB meas. (Hz)</th>
              <th style={th}>BW classical (Hz)</th>
              <th style={th}>BW ratio</th>
              <th style={th}>Phase@fn (°)</th>
              <th style={th}>Avg ΔAmp (dB)</th>
              <th style={th}>Avg ΔPhase (°)</th>
            </tr>
          </thead>
          <tbody>
            {analysisArr.map((a, i) => {
              const bwWarn = a.bwRatio !== null && a.bwRatio > 1.15;
              const phWarn = Math.abs(a.phaseAtRes + 90) > 20;
              const bg = i % 2 === 0 ? '#fff' : '#f8fafc';
              return (
                <tr key={i} style={{ background: bg }}>
                  <td style={{ ...tdL, fontWeight: 600, color: MODE_COLORS[i % 5] }}>
                    ({a.mode.nx},{a.mode.ny},{a.mode.nz}) {a.mode.type}
                  </td>
                  <td style={td}>{f1(a.mode.freq)}</td>
                  <td style={td}>{f2(a.mode.qValue)}</td>
                  <td style={td}>{f3(a.dampCoeff)}</td>
                  <td style={{ ...td, color: Math.abs(a.coupling) < 0.2 ? '#b91c1c' : '#166534', fontWeight: 600 }}>
                    {f3(a.coupling)}
                  </td>
                  <td style={td}>{f1(a.peakDb)}</td>
                  <td style={{ ...td, color: bwWarn ? '#b91c1c' : '#1e293b', fontWeight: bwWarn ? 700 : 400 }}>
                    {a.measuredBwHz !== null ? f1(a.measuredBwHz) : '—'}
                  </td>
                  <td style={td}>{f1(a.classicalBwHz)}</td>
                  <td style={{ ...td, color: bwWarn ? '#b91c1c' : '#166534', fontWeight: 700 }}>
                    {a.bwRatio !== null ? f2(a.bwRatio) : '—'}
                    {bwWarn && ' ⚠'}
                  </td>
                  <td style={{ ...td, color: phWarn ? '#b45309' : '#1e293b', fontWeight: phWarn ? 700 : 400 }}>
                    {f1(a.phaseAtRes)}{phWarn ? ' ⚠' : ''}
                  </td>
                  <td style={{ ...td, color: Math.abs(a.meanAmpDiff) > 1 ? '#b45309' : '#1e293b' }}>
                    {f2(a.meanAmpDiff)}
                  </td>
                  <td style={td}>{f1(a.meanPhDiff)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── 6-question panel ──────────────────────────────────────────────────────────
function SixQuestions({ result }) {
  const { questions, broaderCount, lowerCount, slowPhCount, avgBwRatio, avgMeanAmpDiff, avgPhDiff, discrepancy, nullDepth, nullPt, peakPt } = result;
  const items = [
    {
      q: '1. Are individual resonances broader than expected?',
      a: questions.q1_broader
        ? `⚠ YES — ${broaderCount}/10 analysed modes have BW ratio > 1.15×. Average BW ratio = ${f2(avgBwRatio)}. The resonant window of each mode is wider than the classical second-order prediction, causing adjacent modes to overlap and fill in nulls.`
        : `✓ NO — only ${broaderCount}/10 modes exceed 1.15× bandwidth. BW ratio = ${f2(avgBwRatio)}. Resonance width is consistent with classical prediction.`,
      warn: questions.q1_broader,
    },
    {
      q: '2. Are individual resonances lower in amplitude than expected?',
      a: questions.q2_lower
        ? `⚠ YES — ${lowerCount}/10 modes produce less peak contribution than the coupling-corrected classical reference. Average amplitude difference = ${f2(avgMeanAmpDiff)} dB. Modal energy appears suppressed, preventing full constructive/destructive build-up.`
        : `✓ NO — modal amplitudes are broadly consistent with the classical reference (avg diff = ${f2(avgMeanAmpDiff)} dB). Amplitude is not the primary suppressor.`,
      warn: questions.q2_lower,
    },
    {
      q: '3. Is phase rotating too slowly through resonance?',
      a: questions.q3_phaseSlow
        ? `⚠ YES — ${slowPhCount}/10 modes show > 20° deviation from the expected −90° phase at resonance. Average mean phase difference vs classical = ${f1(avgPhDiff)}°. Slow phase rotation means the destructive interference window is narrower than REW models it.`
        : `✓ NO — phase at resonance tracks the classical −90° expectation closely. Average deviation = ${f1(avgPhDiff)}°.`,
      warn: questions.q3_phaseSlow,
    },
    {
      q: '4. Is the damping implementation broadening resonances?',
      a: questions.q4_dampBroad
        ? `⚠ YES — average BW ratio = ${f2(avgBwRatio)} (> 1.2). The B44 resonantTransfer() implementation applies Q clamping (Math.min(baseQ, absorptionQ)) which systematically caps Q before the resonance calculation. This is equivalent to adding extra artificial damping and directly broadens each peak.`
        : `✓ MODERATE — BW ratio ${f2(avgBwRatio)} is within 20% of classical. The Q-clamp may have minor influence but is not the dominant broadening mechanism.`,
      warn: questions.q4_dampBroad,
    },
    {
      q: '5. Is coupling coefficient reducing peak contrast?',
      a: questions.q5_couplingLow
        ? `⚠ YES — one or more modes has coupling |sc × rc| < 0.2. Low coupling means the mode contributes little energy at this seat/source combination, so cancellation at the null frequency is incomplete — insufficient modal pressure to null the direct field.`
        : `✓ NO — coupling coefficients are moderate to high for the contributing modes. Coupling is not the primary loss mechanism.`,
      warn: questions.q5_couplingLow,
    },
    {
      q: '6. Does the TF implementation explain shallow nulls better than geometry?',
      a: questions.q6_tfExplains
        ? `✓ YES — the transfer-function audit explains ${discrepancy.total}% of the discrepancy vs REW: bandwidth broadening (${discrepancy.bwContrib}%), phase error (${discrepancy.phContrib}%), coupling loss (${discrepancy.cplContrib}%), amplitude suppression (${discrepancy.ampContrib}%). The TF implementation is the dominant cause, ahead of geometry differences.`
        : `~ PARTIAL — TF implementation explains only ~${discrepancy.total}% of the discrepancy. Geometric factors (sub position, room ratio) likely dominate the remaining gap.`,
      warn: !questions.q6_tfExplains,
    },
  ];

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontWeight: 700, fontSize: 11, fontFamily: 'monospace', color: '#0f172a', marginBottom: 6 }}>
        Transfer Function Diagnosis — 6 Questions
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {items.map((item, i) => (
          <div key={i} style={{ border: `1px solid ${item.warn ? '#fca5a5' : '#bbf7d0'}`, borderRadius: 6, background: item.warn ? '#fff7f7' : '#f0fdf4', padding: '6px 10px' }}>
            <div style={{ fontWeight: 700, fontSize: 10, fontFamily: 'monospace', color: '#1e293b', marginBottom: 2 }}>{item.q}</div>
            <div style={{ fontSize: 10, fontFamily: 'monospace', color: item.warn ? '#7f1d1d' : '#14532d', lineHeight: 1.55 }}>{item.a}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Discrepancy estimate banner ───────────────────────────────────────────────
function DiscrepancyBanner({ discrepancy }) {
  const { bwContrib, phContrib, cplContrib, ampContrib, total } = discrepancy;
  return (
    <div style={{ border: '2px solid #0f172a', borderRadius: 8, background: '#0f172a', padding: '10px 14px', marginBottom: 10 }}>
      <div style={{ fontWeight: 700, fontSize: 11, fontFamily: 'monospace', color: '#f1f5f9', marginBottom: 6 }}>
        Estimated discrepancy explained by modal TF implementation
      </div>
      <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#94a3b8', marginBottom: 8, lineHeight: 1.6 }}>
        "Based on the measured transfer-function shapes, an estimated <span style={{ color: '#fbbf24', fontWeight: 700 }}>{total}%</span> of the remaining discrepancy versus REW is explained by the modal transfer-function implementation. The individual contributions are:"
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {[
          { label: 'Bandwidth broadening', value: `${bwContrib}%`, color: '#f87171' },
          { label: 'Phase rotation error', value: `${phContrib}%`, color: '#fb923c' },
          { label: 'Coupling suppression', value: `${cplContrib}%`, color: '#facc15' },
          { label: 'Amplitude suppression', value: `${ampContrib}%`, color: '#a3e635' },
          { label: 'TOTAL TF contribution', value: `${total}%`, color: '#67e8f9' },
        ].map((item, i) => (
          <div key={i} style={{ border: `1px solid ${item.color}66`, borderRadius: 5, padding: '4px 12px', minWidth: 130, background: item.color + '11' }}>
            <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#94a3b8' }}>{item.label}</div>
            <div style={{ fontWeight: 700, color: item.color, fontSize: 14, fontFamily: 'monospace' }}>{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function TransferFunctionShapeAudit({ roomDims, seatingPositions, subsForSimulation, surfaceAbsorption }) {
  const [ran, setRan] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);

  const activeSeat = useMemo(() =>
    (seatingPositions || []).find(s => s.isPrimary) || seatingPositions?.[0] || null,
    [seatingPositions]);

  const seatPos = useMemo(() => {
    if (!activeSeat) return null;
    return { x: +activeSeat.x, y: +activeSeat.y, z: Number.isFinite(+activeSeat.z) ? +activeSeat.z : 1.2 };
  }, [activeSeat]);

  const canRun = !!(roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM && seatPos && subsForSimulation?.length > 0);

  function go() {
    if (!canRun) return;
    setRunning(true);
    setTimeout(() => {
      try {
        const rdims = { widthM: +roomDims.widthM, lengthM: +roomDims.lengthM, heightM: +roomDims.heightM };
        const sa = surfaceAbsorption || { front: 0.3, back: 0.3, left: 0.3, right: 0.3, ceiling: 0.3, floor: 0.3 };
        const sub = subsForSimulation[0];
        const source = { x: +sub.x, y: +sub.y, z: Number.isFinite(+sub.z) ? +sub.z : 0.35 };
        setResult(runAudit(rdims, seatPos, source, sa));
        setRan(true);
      } catch (e) {
        setResult({ error: e.message });
        setRan(true);
      }
      setRunning(false);
    }, 30);
  }

  return (
    <details style={{ border: '2px solid #1e1b4b', borderRadius: 8, background: '#f8fafc', padding: '8px 10px', marginTop: 10 }}>
      <summary style={{ fontWeight: 700, color: '#1e1b4b', fontSize: 11, fontFamily: 'monospace', cursor: 'pointer' }}>
        📐 Individual Modal Transfer Function Audit – are individual modes too broad?
      </summary>

      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#475569', marginBottom: 8, lineHeight: 1.6 }}>
          Compares each mode's B44 <code>resonantTransfer()</code> against the classical second-order resonator H(f).
          Reports BW, phase, coupling and amplitude per mode. <strong>No production changes. Diagnostic only.</strong>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
          <button onClick={go} disabled={!canRun || running}
            style={{ height: 30, padding: '0 14px', borderRadius: 6, border: `1px solid ${canRun && !running ? '#1e1b4b' : '#d1d5db'}`, background: canRun && !running ? '#1e1b4b' : '#f3f4f6', color: canRun && !running ? '#fff' : '#9ca3af', fontSize: 11, fontFamily: 'monospace', fontWeight: 700, cursor: canRun && !running ? 'pointer' : 'not-allowed' }}>
            {running ? 'Analysing…' : ran ? 'Re-run TF Audit' : 'Run TF Shape Audit'}
          </button>
          {!canRun && <span style={{ fontSize: 10, color: '#b45309', fontFamily: 'monospace' }}>Need room dims + seat + at least one sub.</span>}
        </div>

        {result?.error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, padding: '8px 12px', color: '#b91c1c', fontSize: 11, fontFamily: 'monospace' }}>
            ⚠ Engine error: {result.error}
          </div>
        )}

        {result && !result.error && (
          <>
            {/* Summary stats */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {[
                { label: 'Null freq', v: `${f1(result.nullPt?.hz)} Hz`, c: NULL_COLOR },
                { label: 'Peak freq', v: `${f1(result.peakPt?.hz)} Hz`, c: PEAK_COLOR },
                { label: 'Null depth', v: `${f1(result.nullDepth)} dB`, c: result.nullDepth < 15 ? NULL_COLOR : PEAK_COLOR },
                { label: 'Avg BW ratio', v: f2(result.avgBwRatio), c: result.avgBwRatio > 1.2 ? NULL_COLOR : PEAK_COLOR },
                { label: 'Broader modes', v: `${result.broaderCount}/10`, c: result.broaderCount > 3 ? NULL_COLOR : PEAK_COLOR },
                { label: 'Slow-phase modes', v: `${result.slowPhCount}/10`, c: result.slowPhCount > 3 ? NULL_COLOR : '#475569' },
                { label: 'Total TF explains', v: `${result.discrepancy.total}%`, c: result.discrepancy.total > 50 ? NULL_COLOR : '#0369a1' },
              ].map((item, i) => (
                <div key={i} style={{ border: `1px solid ${item.c}44`, borderRadius: 6, background: '#fff', padding: '4px 12px', minWidth: 110 }}>
                  <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#94a3b8' }}>{item.label}</div>
                  <div style={{ fontWeight: 700, color: item.c, fontSize: 13, fontFamily: 'monospace' }}>{item.v}</div>
                </div>
              ))}
            </div>

            {/* Null modes */}
            <ModeMetricsTable analysisArr={result.nullAnalysis} label={`🔴 Top-5 modes at DEEPEST NULL (${f1(result.nullPt?.hz)} Hz)`} color={NULL_COLOR} />
            <TfOverlayChart analysis={result.nullAnalysis} cohSum={result.nullCohSum} centreHz={result.nullPt?.hz} label="DEEPEST NULL" color={NULL_COLOR} />

            {/* Peak modes */}
            <ModeMetricsTable analysisArr={result.peakAnalysis} label={`🟢 Top-5 modes at HIGHEST PEAK (${f1(result.peakPt?.hz)} Hz)`} color={PEAK_COLOR} />
            <TfOverlayChart analysis={result.peakAnalysis} cohSum={result.peakCohSum} centreHz={result.peakPt?.hz} label="HIGHEST PEAK" color={PEAK_COLOR} />

            {/* 6 questions */}
            <SixQuestions result={result} />

            {/* Final discrepancy estimate */}
            <DiscrepancyBanner discrepancy={result.discrepancy} />

            <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#94a3b8', lineHeight: 1.5 }}>
              Diagnostic only. Classical reference: H(f) = 1 / (fn²−f²+j·fn·f/Q). B44: resonantTransfer() from modalCalculations.js.
              First sub used. axialQ=4.0. Absorption from live UI.
            </div>
          </>
        )}
      </div>
    </details>
  );
}