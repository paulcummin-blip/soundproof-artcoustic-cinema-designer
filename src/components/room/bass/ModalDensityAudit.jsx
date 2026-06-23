/**
 * ModalDensityAudit — Diagnostic only.
 * Does NOT modify the production engine or live graph.
 *
 * Goal: Determine whether the parity gap is caused by excessive active
 * modal participation around 70–120 Hz.
 *
 * Section 1: Per-frequency modal participation table (20–200 Hz)
 *   - Total calculated modes below each frequency
 *   - Active modes at >1%, >5%, >10% of total modal energy
 *   - Cumulative energy share of top 3, 5, 10 modes
 *
 * Section 2: Engine architecture comparison
 *   A) Production engine (all modes, coherent)
 *   B) Order ≤ 3 only (coherent)
 *   C) Order ≤ 3 + family RSS
 *
 * Section 3: Automatic diagnostic report
 *   - % energy from order ≥ 4 modes
 *   - % energy from top 5 modes
 *   - Whether parity improves via count reduction or summation architecture change
 */

import React, { useState, useCallback, useMemo } from 'react';
import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';
import {
  computeRoomModesLocal,
  estimateModeQLocal,
  modeShapeValueLocal,
  resonantTransfer,
} from '@/bass/core/modalCalculations';

// ── Constants ─────────────────────────────────────────────────────────────────
const SPEED_OF_SOUND = 343;
const MIN_DIST = 0.01;

const REW_BENCHMARK = [
  { hz: 20, db: 92.4 }, { hz: 25, db: 93.6 }, { hz: 30, db: 89.2 },
  { hz: 40, db: 86.0 }, { hz: 50, db: 91.8 }, { hz: 57, db: 104.1 },
  { hz: 60, db: 98.1 }, { hz: 70, db: 86.8 }, { hz: 80, db: 79.7 },
  { hz: 85, db: 90.8 }, { hz: 100, db: 98.3 }, { hz: 120, db: 92.1 },
  { hz: 150, db: 94.3 }, { hz: 180, db: 99.3 }, { hz: 200, db: 99.5 },
];

const FLAT_CURVE = [
  { hz: 20, db: 94 }, { hz: 50, db: 94 }, { hz: 100, db: 94 }, { hz: 200, db: 94 },
];

// Display frequencies for Section 1 table
const DISPLAY_FREQS = [
  20, 25, 30, 34, 40, 50, 57, 60, 68, 70, 80, 85, 90, 100, 110, 120, 150, 200,
];

const PARITY_FREQS = [70, 80, 85, 90];

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt   = (v, d = 1) => Number.isFinite(Number(v)) ? Number(v).toFixed(d) : '—';
const fmtΔ  = (v) => (!Number.isFinite(v) ? '—' : (v >= 0 ? '+' : '') + v.toFixed(2));
const pct   = (v) => Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : '—';

function errColor(v) {
  if (!Number.isFinite(v)) return '#6b7280';
  const a = Math.abs(v);
  if (a <= 1.0) return '#4ade80';
  if (a <= 3.0) return '#fbbf24';
  if (a <= 6.0) return '#fb923c';
  return '#f87171';
}

function interpolateSpl(series, hz) {
  if (!series?.length) return null;
  if (hz <= series[0].frequency) return series[0].spl;
  if (hz >= series[series.length - 1].frequency) return series[series.length - 1].spl;
  for (let i = 0; i < series.length - 1; i++) {
    const a = series[i], b = series[i + 1];
    if (hz >= a.frequency && hz <= b.frequency) {
      const t = (hz - a.frequency) / (b.frequency - a.frequency);
      return a.spl + t * (b.spl - a.spl);
    }
  }
  return null;
}

function computeMetrics(series) {
  let sumAbs = 0, worst = 0, worstHz = null, count = 0;
  for (const { hz, db } of REW_BENCHMARK) {
    const v = interpolateSpl(series, hz);
    if (v === null || !Number.isFinite(v)) continue;
    const e = Math.abs(v - db);
    sumAbs += e; count++;
    if (e > worst) { worst = e; worstHz = hz; }
  }
  return count > 0 ? { mae: sumAbs / count, worst, worstHz } : null;
}

function getParityErrors(series) {
  const out = {};
  for (const hz of PARITY_FREQS) {
    const ref = REW_BENCHMARK.find(r => r.hz === hz)?.db;
    const v   = interpolateSpl(series, hz);
    out[hz]   = (Number.isFinite(v) && Number.isFinite(ref)) ? v - ref : null;
  }
  return out;
}

function normaliseSurfaceAbsorption(sa) {
  const clamp = (v) => Math.max(0, Math.min(1, Number.isFinite(Number(v)) ? Number(v) : 0.3));
  return {
    front: clamp(sa?.front), back: clamp(sa?.back),
    left: clamp(sa?.left), right: clamp(sa?.right),
    floor: clamp(sa?.floor), ceiling: clamp(sa?.ceiling),
  };
}

// ── Core production sim wrapper ───────────────────────────────────────────────
function runProductionSim(roomDims, seat, sub, surfaceAbsorption, activeSettings) {
  const seatZ = Number.isFinite(Number(seat?.z)) ? Number(seat.z) : 1.2;
  const subZ  = Number.isFinite(Number(sub?.z))  ? Number(sub.z)  : 0.35;
  try {
    const result = simulateBassResponseRewCore(
      { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM },
      { x: seat.x, y: seat.y, z: seatZ },
      { ...sub, z: subZ },
      FLAT_CURVE,
      {
        enableReflections:            false,
        enableModes:                  true,
        surfaceAbsorption,
        freqMinHz:                    20,
        freqMaxHz:                    200,
        smoothing:                    'none',
        modalSourceReferenceMode:     activeSettings?.modalSourceReferenceMode ?? 'existing',
        modalGainScalar:              activeSettings?.modalGainScalar          ?? 1.0,
        axialQ:                       activeSettings?.axialQ                  ?? 4.0,
        modalStorageMode:             'none',
        propagationPhaseScale:        0,
        pureDeterministicModalSum:    true,
        disableModalPropagationPhase: true,
        modalCoherenceMode:           'coherent',
        highOrderAxialScale:          1.0,
        rewParityModalMagnitudeScale: 1.0,
        disableLateField:             true,
      }
    );
    if (!result?.freqsHz) return null;
    return result.freqsHz.map((hz, i) => ({ frequency: hz, spl: result.splDbRaw[i] }));
  } catch {
    return null;
  }
}

// ── Per-mode magnitude calculation (shared between sections) ──────────────────
function computeModeMagnitude(mode, frequencyHz, sourceAmpl, source, seat, roomDims) {
  const { widthM, lengthM, heightM } = roomDims;
  const sc = modeShapeValueLocal(mode, source.x, source.y, source.z, roomDims);
  const rc = modeShapeValueLocal(mode, seat.x, seat.y, seat.z, roomDims);
  const coupling = sc * rc;
  const { re, im } = resonantTransfer(frequencyHz, mode.freq, mode.qValue);
  const modeOrder = Math.abs(mode.nx) + Math.abs(mode.ny) + Math.abs(mode.nz);
  const orderWeight = modeOrder >= 2 ? 0.50 : 1.0;
  const highOrderAxialScale = (mode.type === 'axial' && modeOrder >= 2) ? 0.50 : 1.0;
  const gain = sourceAmpl * coupling * orderWeight * highOrderAxialScale;
  const pressureRe = gain * re;
  const pressureIm = gain * im;
  return { magnitude: Math.sqrt(pressureRe * pressureRe + pressureIm * pressureIm), re: pressureRe, im: pressureIm, modeOrder };
}

// ── Section 1: Modal density calculation ─────────────────────────────────────
function computeModalDensityData(roomDims, seat, sub, surfaceAbsorption, axialQ) {
  const sa = normaliseSurfaceAbsorption(surfaceAbsorption);
  const { widthM, lengthM, heightM } = roomDims;
  const seatZ = Number.isFinite(Number(seat?.z)) ? Number(seat.z) : 1.2;
  const subZ  = Number.isFinite(Number(sub?.z))  ? Number(sub.z)  : 0.35;

  const allModes = computeRoomModesLocal({ widthM, lengthM, heightM, fMax: 200 }).map(mode => {
    const baseQ = (() => {
      const activeAxes = (mode.nx > 0 ? 1 : 0) + (mode.ny > 0 ? 1 : 0) + (mode.nz > 0 ? 1 : 0);
      if (activeAxes === 1) return axialQ;
      if (activeAxes === 2) return 3.9;
      return 2.5;
    })();
    const absQ = estimateModeQLocal({ roomDims, surfaceAbsorption: sa, f0: mode.freq });
    return { ...mode, qValue: Math.max(1, Math.min(baseQ, absQ)) };
  });

  const source = { x: Number(sub.x), y: Number(sub.y), z: subZ };
  const seatP  = { x: Number(seat.x), y: Number(seat.y), z: seatZ };

  return DISPLAY_FREQS.map(targetHz => {
    const curveDb = 94; // flat reference
    const sourceAmpl = Math.pow(10, curveDb / 20);

    // Only modes below this frequency contribute meaningfully (include up to targetHz + 1 octave band)
    const modesBelow = allModes.filter(m => m.freq <= targetHz + 50);
    const totalModes = modesBelow.length;

    if (totalModes === 0) {
      return { hz: targetHz, totalModes: 0, active1: 0, active5: 0, active10: 0, top3: 0, top5: 0, top10: 0 };
    }

    const contributions = modesBelow.map(mode => {
      const { magnitude } = computeModeMagnitude(mode, targetHz, sourceAmpl, source, seatP, { widthM, lengthM, heightM });
      return magnitude;
    });

    const totalMag = contributions.reduce((a, b) => a + b, 0);
    if (totalMag < 1e-20) {
      return { hz: targetHz, totalModes, active1: 0, active5: 0, active10: 0, top3: 0, top5: 0, top10: 0 };
    }

    const fractions = contributions.map(m => m / totalMag);
    const sorted    = [...fractions].sort((a, b) => b - a);

    const active1  = fractions.filter(f => f > 0.01).length;
    const active5  = fractions.filter(f => f > 0.05).length;
    const active10 = fractions.filter(f => f > 0.10).length;

    const top3  = sorted.slice(0, 3).reduce((a, b) => a + b, 0);
    const top5  = sorted.slice(0, 5).reduce((a, b) => a + b, 0);
    const top10 = sorted.slice(0, 10).reduce((a, b) => a + b, 0);

    return { hz: targetHz, totalModes, active1, active5, active10, top3, top5, top10 };
  });
}

// ── Section 2: Architecture variants ─────────────────────────────────────────

// Variant B: Order ≤ 3 coherent sum (direct + modes≤3)
function runOrderLimitedSim(roomDims, seat, sub, surfaceAbsorption, axialQ) {
  const sa = normaliseSurfaceAbsorption(surfaceAbsorption);
  const { widthM, lengthM, heightM } = roomDims;
  const seatZ = Number.isFinite(Number(seat?.z)) ? Number(seat.z) : 1.2;
  const subZ  = Number.isFinite(Number(sub?.z))  ? Number(sub.z)  : 0.35;

  const allModes = computeRoomModesLocal({ widthM, lengthM, heightM, fMax: 200 }).map(mode => {
    const activeAxes = (mode.nx > 0 ? 1 : 0) + (mode.ny > 0 ? 1 : 0) + (mode.nz > 0 ? 1 : 0);
    const baseQ = activeAxes === 1 ? axialQ : activeAxes === 2 ? 3.9 : 2.5;
    const absQ  = estimateModeQLocal({ roomDims, surfaceAbsorption: sa, f0: mode.freq });
    return { ...mode, qValue: Math.max(1, Math.min(baseQ, absQ)) };
  });

  const modesOrder3 = allModes.filter(m => (Math.abs(m.nx) + Math.abs(m.ny) + Math.abs(m.nz)) <= 3);

  const source  = { x: Number(sub.x), y: Number(sub.y), z: subZ };
  const seatP   = { x: Number(seat.x), y: Number(seat.y), z: seatZ };

  // Build frequency axis (96 pts/oct from 20 to 200)
  const freqs = [];
  const octaves = Math.log2(200 / 20);
  const total = Math.ceil(octaves * 96);
  for (let i = 0; i <= total; i++) {
    const hz = 20 * Math.pow(2, i / 96);
    if (hz > 200) break;
    freqs.push(hz);
  }
  if (freqs[freqs.length - 1] !== 200) freqs.push(200);

  const dx = source.x - seatP.x, dy = source.y - seatP.y, dz = source.z - seatP.z;
  const distM = Math.max(MIN_DIST, Math.sqrt(dx * dx + dy * dy + dz * dz));

  return freqs.map(hz => {
    const curveDb   = 94;
    const distLossDb = -20 * Math.log10(distM);
    const amplitude  = Math.pow(10, (curveDb + distLossDb) / 20);
    const phase      = -2 * Math.PI * hz * (distM / SPEED_OF_SOUND);
    let sumRe = amplitude * Math.cos(phase);
    let sumIm = amplitude * Math.sin(phase);

    const modalAmpl = Math.pow(10, curveDb / 20);
    for (const mode of modesOrder3) {
      const { re: mRe, im: mIm } = computeModeMagnitude(mode, hz, modalAmpl, source, seatP, { widthM, lengthM, heightM });
      sumRe += mRe;
      sumIm += mIm;
    }

    const mag = Math.sqrt(sumRe * sumRe + sumIm * sumIm);
    return { frequency: hz, spl: 20 * Math.log10(Math.max(mag, 1e-10)) };
  });
}

// Variant C: Order ≤ 3, RSS between families
function runOrder3RssSim(roomDims, seat, sub, surfaceAbsorption, axialQ) {
  const sa = normaliseSurfaceAbsorption(surfaceAbsorption);
  const { widthM, lengthM, heightM } = roomDims;
  const seatZ = Number.isFinite(Number(seat?.z)) ? Number(seat.z) : 1.2;
  const subZ  = Number.isFinite(Number(sub?.z))  ? Number(sub.z)  : 0.35;

  const allModes = computeRoomModesLocal({ widthM, lengthM, heightM, fMax: 200 }).map(mode => {
    const activeAxes = (mode.nx > 0 ? 1 : 0) + (mode.ny > 0 ? 1 : 0) + (mode.nz > 0 ? 1 : 0);
    const baseQ = activeAxes === 1 ? axialQ : activeAxes === 2 ? 3.9 : 2.5;
    const absQ  = estimateModeQLocal({ roomDims, surfaceAbsorption: sa, f0: mode.freq });
    return { ...mode, qValue: Math.max(1, Math.min(baseQ, absQ)) };
  }).filter(m => (Math.abs(m.nx) + Math.abs(m.ny) + Math.abs(m.nz)) <= 3);

  const source = { x: Number(sub.x), y: Number(sub.y), z: subZ };
  const seatP  = { x: Number(seat.x), y: Number(seat.y), z: seatZ };

  const freqs = [];
  const total = Math.ceil(Math.log2(200 / 20) * 96);
  for (let i = 0; i <= total; i++) {
    const hz = 20 * Math.pow(2, i / 96);
    if (hz > 200) break;
    freqs.push(hz);
  }
  if (freqs[freqs.length - 1] !== 200) freqs.push(200);

  const dx = source.x - seatP.x, dy = source.y - seatP.y, dz = source.z - seatP.z;
  const distM = Math.max(MIN_DIST, Math.sqrt(dx * dx + dy * dy + dz * dz));

  return freqs.map(hz => {
    const curveDb   = 94;
    const distLossDb = -20 * Math.log10(distM);
    const amplitude  = Math.pow(10, (curveDb + distLossDb) / 20);
    const phase      = -2 * Math.PI * hz * (distM / SPEED_OF_SOUND);

    // Direct (coherent with itself)
    const directRe = amplitude * Math.cos(phase);
    const directIm = amplitude * Math.sin(phase);

    // Modes: coherent within each family, RSS across families
    const modalAmpl = Math.pow(10, curveDb / 20);
    const families = { axial: { re: 0, im: 0 }, tangential: { re: 0, im: 0 }, oblique: { re: 0, im: 0 } };

    for (const mode of allModes) {
      const { re: mRe, im: mIm } = computeModeMagnitude(mode, hz, modalAmpl, source, seatP, { widthM, lengthM, heightM });
      const fam = families[mode.type] ?? families.oblique;
      fam.re += mRe;
      fam.im += mIm;
    }

    // RSS of family magnitudes, then add direct coherently
    const axialMag  = Math.sqrt(families.axial.re ** 2 + families.axial.im ** 2);
    const tangMag   = Math.sqrt(families.tangential.re ** 2 + families.tangential.im ** 2);
    const oblMag    = Math.sqrt(families.oblique.re ** 2 + families.oblique.im ** 2);
    const modalRss  = Math.sqrt(axialMag ** 2 + tangMag ** 2 + oblMag ** 2);

    // Direct + modal (vector direct + RSS modal)
    const directMag = Math.sqrt(directRe ** 2 + directIm ** 2);
    // Combine direct (coherent) with modal RSS energetically
    const combinedMag = Math.sqrt(directMag ** 2 + modalRss ** 2);

    return { frequency: hz, spl: 20 * Math.log10(Math.max(combinedMag, 1e-10)) };
  });
}

// ── Section 3: Order ≥4 energy fraction ──────────────────────────────────────
function computeHighOrderEnergyFraction(roomDims, seat, sub, surfaceAbsorption, axialQ) {
  const sa = normaliseSurfaceAbsorption(surfaceAbsorption);
  const { widthM, lengthM, heightM } = roomDims;
  const seatZ = Number.isFinite(Number(seat?.z)) ? Number(seat.z) : 1.2;
  const subZ  = Number.isFinite(Number(sub?.z))  ? Number(sub.z)  : 0.35;

  const allModes = computeRoomModesLocal({ widthM, lengthM, heightM, fMax: 200 }).map(mode => {
    const activeAxes = (mode.nx > 0 ? 1 : 0) + (mode.ny > 0 ? 1 : 0) + (mode.nz > 0 ? 1 : 0);
    const baseQ = activeAxes === 1 ? axialQ : activeAxes === 2 ? 3.9 : 2.5;
    const absQ  = estimateModeQLocal({ roomDims, surfaceAbsorption: sa, f0: mode.freq });
    return { ...mode, qValue: Math.max(1, Math.min(baseQ, absQ)) };
  });

  const source  = { x: Number(sub.x), y: Number(sub.y), z: subZ };
  const seatP   = { x: Number(seat.x), y: Number(seat.y), z: seatZ };

  // Evaluate at parity frequencies
  const results = PARITY_FREQS.map(hz => {
    const curveDb   = 94;
    const sourceAmpl = Math.pow(10, curveDb / 20);

    const contribs = allModes.map(mode => {
      const { magnitude, modeOrder } = computeModeMagnitude(mode, hz, sourceAmpl, source, seatP, { widthM, lengthM, heightM });
      return { magnitude, modeOrder };
    });

    const sorted = [...contribs].sort((a, b) => b.magnitude - a.magnitude);
    const total  = sorted.reduce((s, c) => s + c.magnitude, 0);
    if (total < 1e-20) return { hz, highOrderFrac: 0, top5Frac: 0 };

    const highOrderEnergy = sorted.filter(c => c.modeOrder >= 4).reduce((s, c) => s + c.magnitude, 0);
    const top5Energy      = sorted.slice(0, 5).reduce((s, c) => s + c.magnitude, 0);

    return {
      hz,
      highOrderFrac: highOrderEnergy / total,
      top5Frac:      top5Energy / total,
    };
  });

  const avgHighOrder = results.reduce((s, r) => s + r.highOrderFrac, 0) / results.length;
  const avgTop5      = results.reduce((s, r) => s + r.top5Frac, 0) / results.length;
  return { perFreq: results, avgHighOrder, avgTop5 };
}

// ── Styles ────────────────────────────────────────────────────────────────────
const MONO = { fontFamily: 'monospace' };
const TH = { padding: '3px 7px', fontSize: 9, fontWeight: 700, ...MONO, background: '#1c1917', color: '#a8a29e', borderBottom: '2px solid #292524', whiteSpace: 'nowrap', textAlign: 'right' };
const TD = { padding: '3px 7px', fontSize: 9, ...MONO, textAlign: 'right', borderBottom: '1px solid #1c1917' };

// ── Main component ────────────────────────────────────────────────────────────
export default function ModalDensityAudit({ roomDims, seat, sub, surfaceAbsorption, activeSettings }) {
  const [result, setResult]   = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError]     = useState(null);

  const axialQ = activeSettings?.axialQ ?? 4.0;

  const canRun = !!(
    roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM &&
    seat?.x != null && seat?.y != null &&
    sub?.x  != null && sub?.y  != null
  );

  const runAudit = useCallback(async () => {
    if (!canRun) return;
    setRunning(true);
    setError(null);
    setResult(null);
    await new Promise(r => setTimeout(r, 0));

    try {
      // Section 1
      const densityData = computeModalDensityData(roomDims, seat, sub, surfaceAbsorption, axialQ);

      // Section 2 — three variants
      const seriesProd  = runProductionSim(roomDims, seat, sub, surfaceAbsorption, activeSettings);
      await new Promise(r => setTimeout(r, 0));
      const seriesOrd3  = runOrderLimitedSim(roomDims, seat, sub, surfaceAbsorption, axialQ);
      await new Promise(r => setTimeout(r, 0));
      const seriesRss   = runOrder3RssSim(roomDims, seat, sub, surfaceAbsorption, axialQ);

      const metricsProd = seriesProd ? computeMetrics(seriesProd) : null;
      const metricsOrd3 = seriesOrd3 ? computeMetrics(seriesOrd3) : null;
      const metricsRss  = seriesRss  ? computeMetrics(seriesRss)  : null;

      const errProd = seriesProd ? getParityErrors(seriesProd) : {};
      const errOrd3 = seriesOrd3 ? getParityErrors(seriesOrd3) : {};
      const errRss  = seriesRss  ? getParityErrors(seriesRss)  : {};

      // Section 3
      const energyFrac = computeHighOrderEnergyFraction(roomDims, seat, sub, surfaceAbsorption, axialQ);

      // Determine parity improvement driver
      const maeProd  = metricsProd?.mae ?? Infinity;
      const maeOrd3  = metricsOrd3?.mae ?? Infinity;
      const maeRss   = metricsRss?.mae  ?? Infinity;
      const bestMae  = Math.min(maeProd, maeOrd3, maeRss);

      let parityDriver = 'production (no improvement from reducing modes or changing summation)';
      if (bestMae < maeProd - 0.3) {
        if (maeOrd3 <= maeRss && maeOrd3 === bestMae) {
          parityDriver = 'modal count reduction (order ≤ 3 coherent) improves MAE by ' + (maeProd - maeOrd3).toFixed(2) + ' dB';
        } else if (maeRss === bestMae) {
          parityDriver = 'summation architecture change (order ≤ 3 RSS) improves MAE by ' + (maeProd - maeRss).toFixed(2) + ' dB';
        }
      }

      setResult({
        densityData,
        variants: [
          { label: 'A) Production (all modes, coherent)', metrics: metricsProd, errors: errProd, series: seriesProd },
          { label: 'B) Order ≤ 3 only (coherent)',         metrics: metricsOrd3, errors: errOrd3, series: seriesOrd3 },
          { label: 'C) Order ≤ 3 + family RSS',            metrics: metricsRss,  errors: errRss,  series: seriesRss  },
        ],
        energyFrac,
        parityDriver,
        maeProd, maeOrd3, maeRss,
      });
    } catch (e) {
      setError(e.message || 'Unknown error');
    }
    setRunning(false);
  }, [roomDims, seat, sub, surfaceAbsorption, activeSettings, axialQ, canRun]);

  return (
    <div style={{ marginTop: 12, border: '1px solid #292524', borderRadius: 8, background: '#0c0a09', padding: '10px 12px' }}>

      {/* Header */}
      <div style={{ fontWeight: 700, color: '#d6d3d1', fontSize: 11, ...MONO, marginBottom: 3 }}>
        Modal Density Audit
        <span style={{ fontWeight: 400, color: '#44403c', marginLeft: 10, fontSize: 10 }}>
          diagnostic only · no production changes · direct + modes, reflections OFF
        </span>
      </div>
      <div style={{ fontSize: 9, color: '#57534e', ...MONO, marginBottom: 8, lineHeight: 1.8 }}>
        Goal: determine whether the parity gap originates from excessive modal participation (too many modes) or from summation architecture (coherent vs RSS). Flat 94 dB source curve, current room/seat/sub geometry, current Q settings.
      </div>

      {!canRun && (
        <div style={{ fontSize: 10, color: '#fbbf24', ...MONO, marginBottom: 6 }}>
          ⚠ Need room dimensions, a valid seat, and a valid sub to run.
        </div>
      )}

      <button
        onClick={runAudit}
        disabled={running || !canRun}
        style={{
          height: 28, padding: '0 14px', borderRadius: 6,
          border: '1px solid #57534e', background: running ? '#1c1917' : '#292524',
          color: running ? '#57534e' : '#d6d3d1', fontSize: 11, ...MONO,
          cursor: running || !canRun ? 'not-allowed' : 'pointer', fontWeight: 700,
          marginBottom: 10,
        }}
      >
        {running ? 'Running…' : result ? 'Re-run Audit' : 'Run Modal Density Audit'}
      </button>

      {error && (
        <div style={{ fontSize: 10, color: '#f87171', ...MONO, marginBottom: 8 }}>⚠ Error: {error}</div>
      )}

      {result && (
        <>
          {/* ── Section 1: Modal participation table ── */}
          <div style={{ fontSize: 10, fontWeight: 700, color: '#93c5fd', ...MONO, marginBottom: 6, marginTop: 4 }}>
            Section 1 — Modal Participation by Frequency (20–200 Hz)
          </div>
          <div style={{ fontSize: 9, color: '#57534e', ...MONO, marginBottom: 6, lineHeight: 1.7 }}>
            Total modes = all modes with freq ≤ target + 50 Hz. Active = modes whose individual magnitude is &gt; X% of total modal sum magnitude. Cum. top N = fraction of total magnitude held by the N strongest modes.
          </div>
          <div style={{ overflowX: 'auto', marginBottom: 14 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 640 }}>
              <thead>
                <tr>
                  <th style={{ ...TH, textAlign: 'left', color: '#fbbf24' }}>Freq (Hz)</th>
                  <th style={TH}>Total modes</th>
                  <th style={TH}>Active &gt;1%</th>
                  <th style={TH}>Active &gt;5%</th>
                  <th style={TH}>Active &gt;10%</th>
                  <th style={{ ...TH, color: '#86efac' }}>Top 3 cum.</th>
                  <th style={{ ...TH, color: '#86efac' }}>Top 5 cum.</th>
                  <th style={{ ...TH, color: '#86efac' }}>Top 10 cum.</th>
                </tr>
              </thead>
              <tbody>
                {result.densityData.map((row) => {
                  const isTarget = PARITY_FREQS.includes(row.hz);
                  const bg = isTarget ? '#1c1917' : undefined;
                  return (
                    <tr key={row.hz} style={{ borderBottom: '1px solid #1c1917', background: bg }}>
                      <td style={{ ...TD, textAlign: 'left', color: isTarget ? '#fbbf24' : '#d6d3d1', fontWeight: isTarget ? 700 : 400 }}>{row.hz}</td>
                      <td style={{ ...TD, color: '#a8a29e' }}>{row.totalModes}</td>
                      <td style={{ ...TD, color: row.active1 > 15 ? '#f87171' : row.active1 > 8 ? '#fbbf24' : '#d6d3d1' }}>{row.active1}</td>
                      <td style={{ ...TD, color: row.active5 > 8 ? '#f87171' : row.active5 > 4 ? '#fbbf24' : '#d6d3d1' }}>{row.active5}</td>
                      <td style={{ ...TD, color: row.active10 > 4 ? '#f87171' : row.active10 > 2 ? '#fbbf24' : '#d6d3d1' }}>{row.active10}</td>
                      <td style={{ ...TD, color: '#86efac' }}>{pct(row.top3)}</td>
                      <td style={{ ...TD, color: '#86efac' }}>{pct(row.top5)}</td>
                      <td style={{ ...TD, color: row.top10 > 0.95 ? '#4ade80' : '#86efac' }}>{pct(row.top10)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Section 2: Architecture comparison ── */}
          <div style={{ fontSize: 10, fontWeight: 700, color: '#a78bfa', ...MONO, marginBottom: 6 }}>
            Section 2 — Engine Architecture Comparison vs REW Benchmark
          </div>
          <div style={{ overflowX: 'auto', marginBottom: 14 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 640 }}>
              <thead>
                <tr>
                  <th style={{ ...TH, textAlign: 'left', minWidth: 220 }}>Variant</th>
                  <th style={TH}>MAE (dB)</th>
                  <th style={TH}>Worst err</th>
                  <th style={TH}>Worst Hz</th>
                  {PARITY_FREQS.map(hz => (
                    <th key={hz} style={{ ...TH, color: '#fbbf24' }}>{hz} Hz err</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.variants.map((v, i) => {
                  const bestMae = Math.min(...result.variants.map(vv => vv.metrics?.mae ?? Infinity));
                  const isBest  = Math.abs((v.metrics?.mae ?? Infinity) - bestMae) < 0.001;
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #1c1917', background: isBest ? '#1c1917' : undefined }}>
                      <td style={{ ...TD, textAlign: 'left', color: isBest ? '#a78bfa' : '#d6d3d1', fontWeight: isBest ? 700 : 400 }}>
                        {isBest ? '⭐ ' : ''}{v.label}
                      </td>
                      <td style={{ ...TD, color: errColor(v.metrics?.mae) }}>{fmt(v.metrics?.mae)}</td>
                      <td style={{ ...TD, color: errColor(v.metrics?.worst) }}>{fmt(v.metrics?.worst)}</td>
                      <td style={{ ...TD, color: '#a8a29e' }}>{v.metrics?.worstHz ?? '—'}</td>
                      {PARITY_FREQS.map(hz => (
                        <td key={hz} style={{ ...TD, color: errColor(v.errors?.[hz]) }}>{fmtΔ(v.errors?.[hz])}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Section 3: Automatic diagnostic report ── */}
          <div style={{ fontSize: 10, fontWeight: 700, color: '#fbbf24', ...MONO, marginBottom: 6 }}>
            Section 3 — Automatic Diagnostic Report
          </div>

          {/* Energy fraction stats */}
          <div style={{ marginBottom: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px' }}>
            {result.energyFrac.perFreq.map(r => (
              <div key={r.hz} style={{ padding: '6px 10px', background: '#1c1917', borderRadius: 5, fontSize: 9, ...MONO }}>
                <span style={{ color: '#fbbf24', fontWeight: 700 }}>{r.hz} Hz</span>
                <span style={{ color: '#a8a29e', marginLeft: 10 }}>Order ≥4 energy: </span>
                <span style={{ color: r.highOrderFrac > 0.3 ? '#f87171' : r.highOrderFrac > 0.15 ? '#fbbf24' : '#4ade80', fontWeight: 700 }}>{pct(r.highOrderFrac)}</span>
                <span style={{ color: '#a8a29e', marginLeft: 10 }}>Top 5 energy: </span>
                <span style={{ color: '#86efac', fontWeight: 700 }}>{pct(r.top5Frac)}</span>
              </div>
            ))}
          </div>

          {/* Summary interpretation lines */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {/* High-order verdict */}
            {(() => {
              const frac = result.energyFrac.avgHighOrder;
              const color = frac > 0.3 ? '#f87171' : frac > 0.15 ? '#fbbf24' : '#4ade80';
              return (
                <div style={{ padding: '6px 10px', background: '#1c1917', borderRadius: 4, borderLeft: `3px solid ${color}`, fontSize: 9, ...MONO, color }}>
                  Order ≥4 modes contribute on average <strong>{pct(frac)}</strong> of modal energy at 70/80/85/90 Hz.
                  {frac > 0.3 ? ' HIGH — reducing modal count to ≤3 could meaningfully change the response.' : frac > 0.15 ? ' MODERATE — high-order modes add measurable energy but may not be the primary driver.' : ' LOW — high-order modes are not the dominant source of energy at these frequencies.'}
                </div>
              );
            })()}

            {/* Top 5 verdict */}
            {(() => {
              const frac = result.energyFrac.avgTop5;
              const color = frac > 0.85 ? '#4ade80' : frac > 0.65 ? '#fbbf24' : '#f87171';
              return (
                <div style={{ padding: '6px 10px', background: '#1c1917', borderRadius: 4, borderLeft: `3px solid ${color}`, fontSize: 9, ...MONO, color }}>
                  Top 5 modes hold on average <strong>{pct(frac)}</strong> of total modal energy at parity frequencies.
                  {frac > 0.85 ? ' CONCENTRATED — modal energy is dominated by a few modes. Addressing them directly may resolve parity gap.' : frac > 0.65 ? ' MODERATELY DISTRIBUTED — energy is spread over several modes.' : ' HIGHLY DISTRIBUTED — no single small set of modes dominates; architecture-level changes needed.'}
                </div>
              );
            })()}

            {/* Parity driver */}
            {(() => {
              const prodMae = result.maeProd, ord3Mae = result.maeOrd3, rssMae = result.maeRss;
              const bestImprovement = Math.max(0, prodMae - Math.min(ord3Mae, rssMae));
              const color = bestImprovement > 1 ? '#a78bfa' : '#57534e';
              return (
                <div style={{ padding: '6px 10px', background: '#1c1917', borderRadius: 4, borderLeft: `3px solid ${color}`, fontSize: 9, ...MONO, color: '#d6d3d1' }}>
                  <span style={{ color: '#a78bfa', fontWeight: 700 }}>Parity driver: </span>
                  {result.parityDriver}
                  {bestImprovement < 0.3 && (
                    <span style={{ color: '#57534e' }}> — modal count and summation architecture are NOT the primary cause of the ~6 dB parity gap. The gap likely originates elsewhere (source reference level, distance normalisation, or geometric reference mismatch).</span>
                  )}
                </div>
              );
            })()}

            {/* Improvement table summary */}
            <div style={{ padding: '6px 10px', background: '#1c1917', borderRadius: 4, fontSize: 9, ...MONO, color: '#a8a29e', lineHeight: 1.8 }}>
              MAE summary:
              {' '}Production = <span style={{ color: '#d6d3d1', fontWeight: 700 }}>{fmt(result.maeProd)} dB</span>
              {' '}· Order ≤3 = <span style={{ color: '#d6d3d1', fontWeight: 700 }}>{fmt(result.maeOrd3)} dB</span> ({fmtΔ(result.maeOrd3 - result.maeProd)} vs prod)
              {' '}· Order ≤3 RSS = <span style={{ color: '#d6d3d1', fontWeight: 700 }}>{fmt(result.maeRss)} dB</span> ({fmtΔ(result.maeRss - result.maeProd)} vs prod)
            </div>
          </div>
        </>
      )}
    </div>
  );
}