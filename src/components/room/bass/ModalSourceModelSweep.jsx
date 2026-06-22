/**
 * ModalSourceModelSweep — Diagnostic only. Does not affect the live graph.
 *
 * Tests 8 different modal source/excitation models to isolate whether the remaining
 * REW parity gap is caused by the modal source coupling model (excitation geometry)
 * rather than Q, gain, reflections, SPL conversion, or graphing.
 *
 * Fixed settings for every run:
 *   Q scale 0.8  → axialQ = 4.0 * 0.8 = 3.2
 *   Tangential   → tangentialFamilyScale = 0.8
 *   Reflections  → OFF
 *   Late field   → OFF
 *   Modal gain   → 1.0
 *   Source curve → flat 94 dB
 *   Path         → direct + modes
 *
 * Models:
 *   1. distance_blend 0.55   (current production reference)
 *   2. source shape only     (combinedCoupling = sourceCoupling only; receiverCoupling forced 1)
 *   3. source × receiver     (standard mode-shape: sourceCoupling * receiverCoupling)
 *   4. receiver only         (combinedCoupling = receiverCoupling only; sourceCoupling forced 1)
 *   5. uniform excitation    (combinedCoupling = 1 for all modes)
 *   6. distance_blend 0.25
 *   7. distance_blend 0.75
 *   8. distance_blend 1.00   (fully distance-normalised)
 */

import React, { useState, useCallback } from 'react';
import {
  computeRoomModesLocal,
  estimateModeQLocal,
  modeShapeValueLocal,
  resonantTransfer,
} from '@/components/room/bass/core/modalCalculations';
import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';

// ── REW benchmark (must match RewParityAutoSweep exactly) ─────────────────────
const REW_BENCHMARK = [
  { hz: 20,  db: 92.4 }, { hz: 25,  db: 93.6 }, { hz: 30,  db: 89.2 },
  { hz: 40,  db: 86.0 }, { hz: 50,  db: 91.8 }, { hz: 57,  db: 104.1 },
  { hz: 60,  db: 98.1 }, { hz: 70,  db: 86.8 }, { hz: 80,  db: 79.7 },
  { hz: 85,  db: 90.8 }, { hz: 100, db: 98.3 }, { hz: 120, db: 92.1 },
  { hz: 150, db: 94.3 }, { hz: 180, db: 99.3 }, { hz: 200, db: 99.5 },
];

const REW_SPOT = { 70: 86.8, 80: 79.7, 85: 90.8 }; // 90 Hz not in benchmark
const DISPLAY_FREQS = [70, 80, 85, 90];
const FLAT_CURVE = [
  { hz: 20, db: 94 }, { hz: 50, db: 94 }, { hz: 100, db: 94 }, { hz: 200, db: 94 },
];

const FIXED_AXIAL_Q = 4.0 * 0.8;       // 3.2
const FIXED_TANG_SCALE = 0.8;
const SPEED_OF_SOUND_MPS = 343;
const MIN_DISTANCE_M = 0.01;

// ── Model definitions ─────────────────────────────────────────────────────────
const MODELS = [
  { id: 'blend055',    label: 'Distance blend 0.55', note: '(current production ref)', useEngine: true,  blend: 0.55 },
  { id: 'src_only',   label: 'Source shape only',    note: 'Ψ_src  (receiverCoupling=1)', useEngine: false, couplingFn: (sc) => sc        },
  { id: 'src_x_rcv',  label: 'Source × receiver',    note: 'Ψ_src × Ψ_rcv (standard)', useEngine: false, couplingFn: (sc, rc) => sc * rc },
  { id: 'rcv_only',   label: 'Receiver only',         note: 'Ψ_rcv  (sourceCoupling=1)', useEngine: false, couplingFn: (_sc, rc) => rc    },
  { id: 'uniform',    label: 'Uniform excitation',    note: 'combinedCoupling = 1',      useEngine: false, couplingFn: () => 1             },
  { id: 'blend025',   label: 'Distance blend 0.25',   note: '', useEngine: true, blend: 0.25 },
  { id: 'blend075',   label: 'Distance blend 0.75',   note: '', useEngine: true, blend: 0.75 },
  { id: 'blend100',   label: 'Distance blend 1.00',   note: '(fully distance-normalised)', useEngine: true, blend: 1.00 },
];

// ── helpers ───────────────────────────────────────────────────────────────────

function interpolateSpl(series, targetHz) {
  if (!Array.isArray(series) || series.length === 0) return null;
  const sorted = [...series].sort((a, b) => a.frequency - b.frequency);
  if (targetHz <= sorted[0].frequency) return sorted[0].spl;
  if (targetHz >= sorted[sorted.length - 1].frequency) return sorted[sorted.length - 1].spl;
  for (let i = 0; i < sorted.length - 1; i++) {
    const p1 = sorted[i], p2 = sorted[i + 1];
    if (targetHz >= p1.frequency && targetHz <= p2.frequency) {
      const t = (targetHz - p1.frequency) / (p2.frequency - p1.frequency);
      return p1.spl + (p2.spl - p1.spl) * t;
    }
  }
  return null;
}

function interpolateCurveDb(pts, hz) {
  const sorted = [...pts].sort((a, b) => (a.hz ?? a.frequency) - (b.hz ?? b.frequency));
  if (hz <= sorted[0].hz) return sorted[0].db;
  if (hz >= sorted[sorted.length - 1].hz) return sorted[sorted.length - 1].db;
  for (let i = 0; i < sorted.length - 1; i++) {
    const l = sorted[i], r = sorted[i + 1];
    if (hz >= l.hz && hz <= r.hz) {
      const t = (hz - l.hz) / (r.hz - l.hz);
      return l.db + (r.db - l.db) * t;
    }
  }
  return sorted[0].db;
}

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

function computeMAE(series) {
  let sum = 0, count = 0, worstErr = 0, worstHz = null;
  for (const { hz, db } of REW_BENCHMARK) {
    const b44 = interpolateSpl(series, hz);
    if (!Number.isFinite(b44)) continue;
    const absErr = Math.abs(b44 - db);
    sum += absErr;
    count++;
    if (absErr > worstErr) { worstErr = absErr; worstHz = hz; }
  }
  return count > 0 ? { mae: sum / count, worst: worstErr, worstHz } : { mae: null, worst: null, worstHz: null };
}

// Custom lightweight modal sim — avoids full engine overhead, allows custom coupling functions
function runCustomModalSim(roomDims, seat, sub, surfaceAbsorption, couplingFn) {
  const { widthM, lengthM, heightM } = roomDims;
  const seatZ = Number.isFinite(Number(seat?.z)) ? Number(seat.z) : 1.2;
  const subZ  = Number.isFinite(Number(sub?.z))  ? Number(sub.z)  : 0.35;

  const seatPos = { x: seat.x, y: seat.y, z: seatZ };
  const subPos  = { x: sub.x,  y: sub.y,  z: subZ  };

  const rdims = { widthM, lengthM, heightM };

  // Build modes with Q
  const rawModes = computeRoomModesLocal({ widthM, lengthM, heightM, fMax: 200, c: SPEED_OF_SOUND_MPS });
  const modes = rawModes.map(mode => {
    const activeAxes = (mode.nx > 0 ? 1 : 0) + (mode.ny > 0 ? 1 : 0) + (mode.nz > 0 ? 1 : 0);
    const baseQ = activeAxes === 1 ? FIXED_AXIAL_Q : activeAxes === 2 ? 3.9 : 2.5;
    const absorptionQ = estimateModeQLocal({ roomDims: rdims, surfaceAbsorption, f0: mode.freq });
    const qValue = Math.max(1, Math.min(baseQ, absorptionQ));
    return { ...mode, qValue };
  });

  const freqsHz = buildFreqAxis(20, 200);

  const series = freqsHz.map(hz => {
    const curveDb = interpolateCurveDb(FLAT_CURVE, hz);
    const modalSourceAmplitudeBase = Math.pow(10, curveDb / 20); // gain = 1.0

    // Direct path
    const dx = subPos.x - seatPos.x;
    const dy = subPos.y - seatPos.y;
    const dz = subZ - seatZ;
    const distM = Math.max(MIN_DISTANCE_M, Math.sqrt(dx*dx + dy*dy + dz*dz));
    const distanceLossDb = -20 * Math.log10(distM);
    const directAmplitude = Math.pow(10, (curveDb + distanceLossDb) / 20);
    const tofPhase = -2 * Math.PI * hz * (distM / SPEED_OF_SOUND_MPS);
    let sumRe = directAmplitude * Math.cos(tofPhase);
    let sumIm = directAmplitude * Math.sin(tofPhase);

    // Modal contributions with custom coupling
    let modalSumRe = 0, modalSumIm = 0;
    for (const mode of modes) {
      const srcCoupling = modeShapeValueLocal(mode, subPos.x, subPos.y, subZ, rdims);
      const rcvCoupling = modeShapeValueLocal(mode, seatPos.x, seatPos.y, seatZ, rdims);
      const coupling = couplingFn(srcCoupling, rcvCoupling);

      const modeOrder = Math.abs(mode.nx) + Math.abs(mode.ny) + Math.abs(mode.nz);
      const orderWeight = modeOrder >= 2 ? 0.50 : 1.0;

      // Family scale: tangential × 0.8
      const familyScale = mode.type === 'tangential' ? FIXED_TANG_SCALE : 1.0;

      const { re: tfRe, im: tfIm } = resonantTransfer(hz, mode.freq, mode.qValue);

      // High-order axial correction (same as production)
      const hoAxialScale = (mode.type === 'axial' && modeOrder >= 2) ? 1.0 : 1.0;

      const gain = modalSourceAmplitudeBase * coupling * orderWeight * familyScale * hoAxialScale;
      modalSumRe += gain * tfRe;
      modalSumIm += gain * tfIm;
    }

    sumRe += modalSumRe;
    sumIm += modalSumIm;

    const mag = Math.sqrt(sumRe * sumRe + sumIm * sumIm);
    return { frequency: hz, spl: 20 * Math.log10(Math.max(mag, 1e-10)) };
  });

  return series;
}

// Engine-based sim for distance-blend models (reuses full production engine)
function runEngineBlendSim(roomDims, seat, sub, surfaceAbsorption, blend) {
  const seatZ = Number.isFinite(Number(seat?.z)) ? Number(seat.z) : 1.2;

  // Compute distance-blend gain scalar manually (same as RewParityAutoSweep.resolveEngineModalParams)
  let engineModalRefMode = 'existing';
  let engineModalGainScalar = 1.0;
  if (blend >= 1.0) {
    engineModalRefMode = 'distance_normalized';
  } else if (blend > 0.0) {
    const dx = sub.x - seat.x;
    const dy = sub.y - seat.y;
    const dz = (Number.isFinite(sub.z) ? sub.z : 0.35) - seatZ;
    const distM = Math.max(0.01, Math.sqrt(dx*dx + dy*dy + dz*dz));
    const fullLossDb = -20 * Math.log10(distM);
    engineModalGainScalar = Math.pow(10, (fullLossDb * blend) / 20);
    engineModalRefMode = 'existing';
  }

  try {
    const result = simulateBassResponseRewCore(
      { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM },
      { x: seat.x, y: seat.y, z: seatZ },
      sub,
      FLAT_CURVE,
      {
        enableReflections:            false,
        enableModes:                  true,
        disableLateField:             true,
        surfaceAbsorption,
        freqMinHz:                    20,
        freqMaxHz:                    200,
        smoothing:                    'none',
        modalSourceReferenceMode:     engineModalRefMode,
        modalGainScalar:              engineModalGainScalar,
        axialQ:                       FIXED_AXIAL_Q,
        tangentialFamilyScale:        FIXED_TANG_SCALE,
        axialFamilyScale:             1.0,
        obliqueFamilyScale:           1.0,
        modalStorageMode:             'none',
        propagationPhaseScale:        0,
        pureDeterministicModalSum:    true,
        disableModalPropagationPhase: true,
        modalCoherenceMode:           'coherent',
        highOrderAxialScale:          1.0,
        debugReflectionOrder:         1,
      }
    );
    if (!result?.freqsHz || !result?.splDbRaw) return null;
    return result.freqsHz.map((hz, i) => ({ frequency: hz, spl: result.splDbRaw[i] }));
  } catch {
    return null;
  }
}

function fmt(v, d = 2) { return Number.isFinite(v) ? v.toFixed(d) : '—'; }

function errColor(err) {
  if (!Number.isFinite(err)) return '#6b7280';
  const a = Math.abs(err);
  if (a >= 6) return '#f87171';
  if (a >= 3) return '#fb923c';
  if (a >= 1) return '#fbbf24';
  return '#4ade80';
}

// ── Styles ────────────────────────────────────────────────────────────────────
const TH = {
  padding: '4px 6px', fontSize: 9, fontWeight: 700,
  background: '#1a1040', color: '#a78bfa',
  textAlign: 'right', borderBottom: '2px solid #2d1b69',
  whiteSpace: 'nowrap', fontFamily: 'monospace',
};
const TD = { padding: '3px 6px', fontSize: 9, fontFamily: 'monospace', textAlign: 'right' };

// ── Component ─────────────────────────────────────────────────────────────────
export default function ModalSourceModelSweep({ roomDims, seat, sub, surfaceAbsorption }) {
  const [rows, setRows]       = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError]     = useState(null);

  const canRun = !!(
    roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM &&
    seat?.x != null && seat?.y != null &&
    sub?.x  != null && sub?.y  != null
  );

  const run = useCallback(async () => {
    if (!canRun) return;
    setRunning(true);
    setRows(null);
    setError(null);
    await new Promise(r => setTimeout(r, 0));

    try {
      const computed = [];

      for (const model of MODELS) {
        await new Promise(r => setTimeout(r, 0));

        let series = null;
        try {
          if (model.useEngine) {
            series = runEngineBlendSim(roomDims, seat, sub, surfaceAbsorption, model.blend);
          } else {
            series = runCustomModalSim(roomDims, seat, sub, surfaceAbsorption, model.couplingFn);
          }
        } catch { /* series stays null */ }

        const { mae, worst, worstHz } = series ? computeMAE(series) : { mae: null, worst: null, worstHz: null };

        const freqData = {};
        for (const hz of DISPLAY_FREQS) {
          const simSpl   = series ? interpolateSpl(series, hz) : null;
          const rewTarget = REW_SPOT[hz] ?? null;
          const err = (Number.isFinite(simSpl) && rewTarget != null) ? simSpl - rewTarget : null;
          freqData[hz] = { simSpl, rewTarget, err };
        }

        computed.push({ ...model, series, freqData, mae, worst, worstHz });
      }

      setRows(computed);
    } catch (e) {
      setError(e?.message ?? String(e));
    } finally {
      setRunning(false);
    }
  }, [roomDims, seat, sub, surfaceAbsorption, canRun]);

  const bestIdx = rows
    ? rows.reduce((best, r, i) => {
        if (!Number.isFinite(r.mae)) return best;
        return best === -1 || r.mae < rows[best].mae ? i : best;
      }, -1)
    : -1;

  return (
    <div style={{
      marginTop: 12, border: '1px solid #2d1b69', borderRadius: 8,
      background: '#0d0a1f', padding: '10px 12px',
    }}>
      {/* Header */}
      <div style={{ fontWeight: 700, color: '#c4b5fd', fontSize: 11, fontFamily: 'monospace', marginBottom: 3 }}>
        Modal Source Model Sweep
        <span style={{ fontWeight: 400, color: '#3730a3', marginLeft: 10, fontSize: 10 }}>
          diagnostic only · does not affect live graph
        </span>
      </div>

      {/* Fixed settings */}
      <div style={{
        display: 'inline-flex', gap: 10, flexWrap: 'wrap',
        padding: '4px 10px', borderRadius: 5, background: '#1a1040',
        marginBottom: 8, fontSize: 9, fontFamily: 'monospace', color: '#7c3aed',
      }}>
        <span>Q scale: <strong style={{ color: '#a78bfa' }}>0.8 → axialQ={FIXED_AXIAL_Q.toFixed(2)}</strong></span>
        <span>Tangential: <strong style={{ color: '#a78bfa' }}>×0.8</strong></span>
        <span>Reflections: <strong style={{ color: '#a78bfa' }}>OFF</strong></span>
        <span>Modal gain: <strong style={{ color: '#a78bfa' }}>1.0</strong></span>
        <span>Source: <strong style={{ color: '#a78bfa' }}>flat 94 dB</strong></span>
      </div>

      <div style={{ fontSize: 9, color: '#5b21b6', fontFamily: 'monospace', marginBottom: 8, lineHeight: 1.7 }}>
        Goal: determine whether the remaining parity gap comes from the modal source coupling model
        (excitation geometry) — not Q, gain, reflections, SPL conversion, or graphing.
      </div>

      {!canRun && (
        <div style={{ fontSize: 10, color: '#fbbf24', fontFamily: 'monospace', marginBottom: 6 }}>
          ⚠ Requires room dimensions, seat position, and sub position.
        </div>
      )}

      <button
        onClick={run}
        disabled={running || !canRun}
        style={{
          height: 28, padding: '0 14px', borderRadius: 6,
          border: `1px solid ${running || !canRun ? '#2d1b69' : '#7c3aed'}`,
          background: running || !canRun ? '#1a1040' : '#7c3aed',
          color: running || !canRun ? '#3730a3' : '#fff',
          fontSize: 11, fontFamily: 'monospace', fontWeight: 600,
          cursor: running || !canRun ? 'not-allowed' : 'pointer',
          marginBottom: 10,
        }}
      >
        {running ? 'Running…' : rows ? 'Re-run sweep' : 'Run Modal Source Model Sweep'}
      </button>

      {error && (
        <div style={{ fontSize: 10, color: '#f87171', fontFamily: 'monospace', marginBottom: 6 }}>Error: {error}</div>
      )}

      {rows && (
        <>
          {/* Best result banner */}
          {bestIdx >= 0 && (
            <div style={{
              padding: '5px 10px', borderRadius: 5, marginBottom: 10,
              background: '#14532d', color: '#86efac',
              fontFamily: 'monospace', fontSize: 10, fontWeight: 700,
            }}>
              🥇 Best MAE: <strong>{rows[bestIdx].label}</strong> → MAE = {fmt(rows[bestIdx].mae, 3)} dB · worst = {fmt(rows[bestIdx].worst, 3)} dB @ {rows[bestIdx].worstHz ?? '—'} Hz
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 820 }}>
              <thead>
                <tr>
                  <th style={{ ...TH, textAlign: 'left', width: '22%' }}>Model</th>
                  {DISPLAY_FREQS.map(hz => (
                    <React.Fragment key={hz}>
                      <th style={{ ...TH, borderLeft: '1px solid #2d1b69', color: '#c4b5fd' }}>{hz} sim</th>
                      <th style={{ ...TH, color: '#6b7280' }}>{hz} REW</th>
                      <th style={{ ...TH, color: '#e879f9' }}>{hz} err</th>
                    </React.Fragment>
                  ))}
                  <th style={{ ...TH, borderLeft: '1px solid #2d1b69', color: '#34d399' }}>MAE</th>
                  <th style={{ ...TH, color: '#f87171' }}>Worst</th>
                  <th style={{ ...TH, color: '#f87171' }}>@ Hz</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const isBest = i === bestIdx;
                  const rowBg = isBest ? '#052e16' : i === 0 ? '#1a0f2e' : undefined;
                  const labelColor = isBest ? '#86efac' : '#ddd6fe';

                  return (
                    <tr key={row.id} style={{ borderBottom: '1px solid #1a1040', background: rowBg }}>
                      <td style={{ ...TD, textAlign: 'left', fontWeight: 700, color: labelColor }}>
                        {isBest ? '★ ' : ''}{row.label}
                        {row.note && (
                          <span style={{ fontWeight: 400, color: '#4c1d95', fontSize: 8, display: 'block' }}>
                            {row.note}
                          </span>
                        )}
                      </td>

                      {DISPLAY_FREQS.map(hz => {
                        const fd = row.freqData[hz] ?? {};
                        return (
                          <React.Fragment key={hz}>
                            <td style={{ ...TD, borderLeft: '1px solid #1a1040', color: isBest ? '#86efac' : '#e0e7ff' }}>
                              {fmt(fd.simSpl, 2)}
                            </td>
                            <td style={{ ...TD, color: '#374151' }}>
                              {fd.rewTarget != null ? fmt(fd.rewTarget, 1) : '—'}
                            </td>
                            <td style={{ ...TD, fontWeight: 700, color: fd.err != null ? errColor(fd.err) : '#6b7280' }}>
                              {fd.err != null ? (fd.err >= 0 ? '+' : '') + fmt(fd.err, 2) : '—'}
                            </td>
                          </React.Fragment>
                        );
                      })}

                      <td style={{ ...TD, borderLeft: '1px solid #1a1040', fontWeight: 700, color: isBest ? '#34d399' : '#a7f3d0' }}>
                        {fmt(row.mae, 3)}
                      </td>
                      <td style={{ ...TD, fontWeight: 700, color: row.worst != null ? errColor(row.worst) : '#6b7280' }}>
                        {fmt(row.worst, 3)}
                      </td>
                      <td style={{ ...TD, color: '#6b7280' }}>
                        {row.worstHz ?? '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Interpretation */}
          <div style={{ marginTop: 8, fontSize: 9, fontFamily: 'monospace', color: '#4c1d95', lineHeight: 1.8, borderTop: '1px solid #1a1040', paddingTop: 6 }}>
            <strong style={{ color: '#7c3aed' }}>Interpretation:</strong><br />
            If <em>source × receiver</em> has lowest MAE → standard coupling is correct; look elsewhere.<br />
            If <em>receiver only</em> wins → source position is mis-coupling modes; try moving sub.<br />
            If <em>source only</em> wins → receiver coupling (seat position) is distorting mode shape.<br />
            If <em>uniform excitation</em> wins → coupling itself is causing the error; all modes equally excited fits REW better.<br />
            If <em>distance blend</em> values win and blend &lt; 0.55 beats blend = 0.55 → current source normalisation is over-attenuating.<br />
            <span style={{ color: '#2d1b69' }}>90 Hz shown for reference; not in benchmark so excluded from MAE.</span>
          </div>
        </>
      )}
    </div>
  );
}