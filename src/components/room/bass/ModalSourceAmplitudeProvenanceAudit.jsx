/**
 * ModalSourceAmplitudeProvenanceAudit — Diagnostic only.
 * No production changes. Does not affect the live graph.
 *
 * Traces every gain/normalisation step that produces modalSourceAmplitude1m
 * as it exists in rewBassEngine.js simulateBassResponseRewCore.
 *
 * Steps mirrored exactly from the engine (no maths changed):
 *   1. Raw source curve at frequency           curveDb
 *   2. After gainDb applied                    curveDb + gainDb
 *   3. dB → pressure conversion                10^((curveDb+gainDb)/20)
 *   4. modalGainScalar                         ×modalGainScalar
 *   5. modalSourceReferenceMode normalisation  mode-specific
 *      a. existing / no_volume → no change
 *      b. distance_normalized  → ×(1/distM)
 *      c. room_volume / room_normalized → ÷√(V)
 *      d. distance_blend → ×10^(blendedLossDb/20)  [computed in BassResponse]
 *   6. Final modalSourceAmplitude entering the solver
 *
 * For each step: input, multiplier, output.
 * Contribution factor: finalModalSourceAmplitude / rawSourcePressure.
 * Verdict: >10× → "inflation detected"; ≤10× → "physically consistent".
 */

import React, { useState, useCallback } from 'react';
import {
  computeRoomModesLocal,
  estimateModeQLocal,
  modeShapeValueLocal,
  resonantTransfer,
} from '@/bass/core/modalCalculations.js';

// ── Constants ──────────────────────────────────────────────────────────────────
const FLAT_CURVE_DB   = 94;
const SPEED_OF_SOUND  = 343;
const TARGET_HZ       = [40, 57, 70, 80, 85, 90];
const MONO            = { fontFamily: 'monospace' };
const MIN_DIST        = 0.01;

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt6 = (v) => Number.isFinite(Number(v)) ? Number(v).toFixed(6) : '—';
const fmt4 = (v) => Number.isFinite(Number(v)) ? Number(v).toFixed(4) : '—';
const fmt2 = (v) => Number.isFinite(Number(v)) ? Number(v).toFixed(2) : '—';
const fmt1 = (v) => Number.isFinite(Number(v)) ? Number(v).toFixed(1) : '—';
const fmtx = (v) => !Number.isFinite(Number(v)) ? '—' : (Number(v) >= 0 ? '×' : '') + Number(v).toFixed(6);
const toDb = (p) => (Number.isFinite(p) && p > 0) ? (20 * Math.log10(p)).toFixed(2) + ' dB' : '—';

function estimateModeQByType(mode, axialQ) {
  const axes = (mode.nx > 0 ? 1 : 0) + (mode.ny > 0 ? 1 : 0) + (mode.nz > 0 ? 1 : 0);
  if (axes === 1) return axialQ;
  if (axes === 2) return 3.9;
  return 2.5;
}

function normSA(sa) {
  const c = (v) => Math.max(0, Math.min(1, Number.isFinite(Number(v)) ? Number(v) : 0.3));
  return { front: c(sa?.front), back: c(sa?.back), left: c(sa?.left), right: c(sa?.right), floor: c(sa?.floor), ceiling: c(sa?.ceiling) };
}

/** Find dominant mode (highest |coupling × |H||) at a given frequency */
function dominantMode(hz, roomDims, seat, sub, surfaceAbsorption, axialQ) {
  const { widthM, lengthM, heightM } = roomDims;
  const seatZ = Number.isFinite(Number(seat?.z)) ? Number(seat.z) : 1.2;
  const subZ  = Number.isFinite(Number(sub?.z))  ? Number(sub.z)  : 0.35;
  const sa    = normSA(surfaceAbsorption);

  const rawModes = computeRoomModesLocal({ widthM, lengthM, heightM, fMax: 200, c: SPEED_OF_SOUND });
  const modes = rawModes.map(mode => {
    const baseQ  = estimateModeQByType(mode, axialQ);
    const absQ   = estimateModeQLocal({ roomDims: { widthM, lengthM, heightM }, surfaceAbsorption: sa, f0: mode.freq });
    return { ...mode, qValue: Math.max(1, Math.min(baseQ, absQ)) };
  });

  let best = null, bestScore = -1;
  for (const m of modes) {
    const sc = modeShapeValueLocal(m, Number(sub.x), Number(sub.y), subZ, { widthM, lengthM, heightM });
    const rc = modeShapeValueLocal(m, Number(seat.x), Number(seat.y), seatZ, { widthM, lengthM, heightM });
    const { transferMag } = resonantTransfer(hz, m.freq, m.qValue);
    const score = Math.abs(sc * rc) * transferMag;
    if (score > bestScore) { bestScore = score; best = { ...m, sc, rc, coupling: sc * rc }; }
  }
  return best;
}

/**
 * Compute all 6 provenance steps for a given frequency.
 * Mirrors rewBassEngine.js lines exactly — no maths changed.
 */
function computeSteps(hz, roomDims, seat, sub, surfaceAbsorption, activeSettings) {
  const { widthM, lengthM, heightM } = roomDims;
  const seatZ = Number.isFinite(Number(seat?.z)) ? Number(seat.z) : 1.2;
  const subZ  = Number.isFinite(Number(sub?.z))  ? Number(sub.z)  : 0.35;

  // Settings mirroring BassResponse sweepSettings
  const modalSourceReferenceMode = activeSettings?.modalSourceReferenceMode ?? 'existing';
  const modalDistanceBlend       = Number.isFinite(activeSettings?.modalDistanceBlend) ? activeSettings.modalDistanceBlend : 0.55;
  const modalGainScalar          = Number.isFinite(activeSettings?.modalGainScalar) ? activeSettings.modalGainScalar : 1.0;
  const axialQ                   = Number.isFinite(activeSettings?.axialQ) ? activeSettings.axialQ : 4.0;
  const gainDb                   = Number.isFinite(Number(sub?.tuning?.gainDb)) ? Number(sub.tuning.gainDb) : 0;

  // ── Step 1: Raw source curve at frequency ─────────────────────────────────
  // Engine: const curveDb = interpolateCurveDb(subProductCurve, frequencyHz);
  // We use flat 94 dB (matches the flat_rew_reference / sweep default).
  const curveDb = FLAT_CURVE_DB;

  // ── Step 2: After gainDb applied ──────────────────────────────────────────
  const curveDbPlusGain = curveDb + gainDb;

  // ── Step 3: dB → pressure ────────────────────────────────────────────────
  // Engine: modalSourceAmplitudeBase = 10^((curveDb + gainDb) / 20) × modalGainScalar
  // We separate scalar for clarity.
  const rawSourcePressure = Math.pow(10, curveDb / 20);               // reference: without gain
  const pressureAfterGain = Math.pow(10, curveDbPlusGain / 20);       // = 10^(curveDbPlusGain/20)

  // ── Step 4: modalGainScalar ───────────────────────────────────────────────
  // Engine: modalSourceAmplitudeBase = Math.pow(10, (curveDb + gainDb) / 20) * modalGainScalar
  const modalSourceAmplitudeBase = pressureAfterGain * modalGainScalar;

  // ── Step 5: modalSourceReferenceMode normalisation ────────────────────────
  // Engine lines (simulateBassResponseRewCore):
  //   distance_normalized → × 10^(distanceLossDb/20) = × (1/distM)
  //   room_volume / room_normalized → ÷ √(roomVolumeM3)
  //   distance_blend → applied in BassResponse as blended dB scalar
  //   existing / no_volume → no change
  const roomVolumeM3 = widthM * lengthM * heightM;

  // Sub → seat distance
  const dx = Number(sub.x) - Number(seat.x);
  const dy = Number(sub.y) - Number(seat.y);
  const dz = subZ - seatZ;
  const distM = Math.max(MIN_DIST, Math.sqrt(dx*dx + dy*dy + dz*dz));
  const distLossDb = -20 * Math.log10(distM / 1);  // negative = attenuation

  // Determine effective engine mode (distance_blend is resolved in BassResponse before engine call)
  let effectiveMode = modalSourceReferenceMode;
  let blendExplanation = '';
  let blendScalar = 1.0;
  if (modalSourceReferenceMode === 'distance_blend') {
    const blend = Math.max(0, Math.min(1, modalDistanceBlend));
    if (blend >= 1.0) {
      effectiveMode = 'distance_normalized';
      blendExplanation = `blend=1.0 → full distance_normalized`;
    } else if (blend <= 0.0) {
      effectiveMode = 'existing';
      blendExplanation = `blend=0.0 → no normalisation`;
    } else {
      // Partial: blendedLossDb = distanceLossDb × blend, applied as gain scalar
      const blendedLossDb = distLossDb * blend;
      blendScalar = Math.pow(10, blendedLossDb / 20);
      effectiveMode = 'distance_blend_partial';
      blendExplanation = `blend=${blend.toFixed(2)}, blendedLossDb=${blendedLossDb.toFixed(3)} dB → ×${blendScalar.toFixed(6)}`;
    }
  }

  let normWeighting = 1.0;
  let normLabel = '';
  switch (effectiveMode) {
    case 'distance_normalized':
      normWeighting = Math.pow(10, distLossDb / 20); // = 1/distM
      normLabel = `distance_normalized: ×(1/${fmt4(distM)} m) = ×${fmt6(normWeighting)}`;
      break;
    case 'room_volume':
    case 'room_normalized':
      normWeighting = 1 / Math.sqrt(Math.max(roomVolumeM3, 1e-6));
      normLabel = `${effectiveMode}: ÷√(${fmt2(roomVolumeM3)} m³) = ×${fmt6(normWeighting)}`;
      break;
    case 'distance_blend_partial':
      normWeighting = blendScalar;
      normLabel = `distance_blend (partial): ${blendExplanation}`;
      break;
    case 'no_volume':
    case 'existing':
    default:
      normWeighting = 1.0;
      normLabel = `${effectiveMode}: no normalisation applied (×1.0)`;
      break;
  }

  // ── Step 6: Final modalSourceAmplitude1m entering modal solver ────────────
  // Engine: modalSourceAmplitude1m = modalSourceAmplitudeBase × normWeighting
  //   (when distance_blend_partial, BassResponse folds blendScalar into _engineModalGainScalar,
  //    so the engine sees effective modalGainScalar × blendScalar with referenceMode='existing')
  const finalModalSourceAmplitude = modalSourceAmplitudeBase * normWeighting;

  // ── Contribution factor ───────────────────────────────────────────────────
  const contributionFactor = rawSourcePressure > 0 ? finalModalSourceAmplitude / rawSourcePressure : null;

  // ── Dominant mode for context ──────────────────────────────────────────────
  const dom = dominantMode(hz, roomDims, seat, sub, surfaceAbsorption, axialQ);

  return {
    hz,
    curveDb,
    gainDb,
    curveDbPlusGain,
    rawSourcePressure,
    pressureAfterGain,
    modalGainScalar,
    modalSourceAmplitudeBase,
    normWeighting,
    normLabel,
    effectiveMode,
    modalSourceReferenceMode,
    modalDistanceBlend,
    finalModalSourceAmplitude,
    contributionFactor,
    distM,
    distLossDb,
    roomVolumeM3,
    dominantMode: dom,
  };
}

// ── Table row style ───────────────────────────────────────────────────────────
const TH  = { padding: '3px 6px', fontSize: 9, fontWeight: 700, fontFamily: 'monospace', background: '#1c1917', color: '#a8a29e', borderBottom: '2px solid #292524', whiteSpace: 'nowrap', textAlign: 'right' };
const THL = { ...TH, textAlign: 'left' };
const TD  = { padding: '2px 6px', fontSize: 9, fontFamily: 'monospace', textAlign: 'right', borderBottom: '1px solid #1c1917' };
const TDL = { ...TD, textAlign: 'left' };

function StepRow({ idx, name, inputLabel, multiplier, output, outputLabel, note, highlight }) {
  const multColor = multiplier != null && Math.abs(multiplier) > 1 ? '#fb923c' : '#86efac';
  return (
    <tr style={{ background: idx % 2 === 0 ? '#0f0e0d' : 'transparent', borderBottom: '1px solid #1c1917' }}>
      <td style={{ ...TDL, color: '#57534e', fontWeight: 700 }}>{idx}</td>
      <td style={{ ...TDL, color: highlight ? '#fbbf24' : '#d6d3d1', fontWeight: highlight ? 700 : 400 }}>{name}</td>
      <td style={{ ...TDL, color: '#78716c', fontSize: 8 }}>{inputLabel}</td>
      <td style={{ ...TD, color: multiplier != null ? multColor : '#57534e' }}>{multiplier != null ? fmtx(multiplier) : '(n/a)'}</td>
      <td style={{ ...TD, color: highlight ? '#fbbf24' : '#d6d3d1', fontWeight: highlight ? 700 : 400 }}>{outputLabel}</td>
      <td style={{ ...TDL, color: '#57534e', fontSize: 8 }}>{note}</td>
    </tr>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ModalSourceAmplitudeProvenanceAudit({ roomDims, seat, sub, surfaceAbsorption, activeSettings }) {
  const [result, setResult]     = useState(null);
  const [running, setRunning]   = useState(false);
  const [error, setError]       = useState(null);
  const [activeHz, setActiveHz] = useState(40);

  const canRun = !!(
    roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM &&
    seat?.x != null && seat?.y != null && sub?.x != null && sub?.y != null
  );

  const runAudit = useCallback(async () => {
    if (!canRun) return;
    setRunning(true);
    setError(null);
    setResult(null);
    await new Promise(r => setTimeout(r, 0));

    try {
      const byHz = {};
      for (const hz of TARGET_HZ) {
        await new Promise(r => setTimeout(r, 0));
        byHz[hz] = computeSteps(hz, roomDims, seat, sub, surfaceAbsorption, activeSettings);
      }
      setResult({ byHz });
    } catch (e) {
      setError(e.message || 'Unknown error');
    }
    setRunning(false);
  }, [roomDims, seat, sub, surfaceAbsorption, activeSettings, canRun]);

  const active = result?.byHz?.[activeHz];

  return (
    <div style={{ marginTop: 12, border: '1px solid #292524', borderRadius: 8, background: '#0c0a09', padding: '10px 12px' }}>

      {/* Header */}
      <div style={{ fontWeight: 700, color: '#d6d3d1', fontSize: 11, ...MONO, marginBottom: 3 }}>
        Modal Source Amplitude Provenance Audit
        <span style={{ fontWeight: 400, color: '#44403c', marginLeft: 10, fontSize: 10 }}>
          diagnostic only · no production changes
        </span>
      </div>
      <div style={{ fontSize: 9, color: '#57534e', ...MONO, marginBottom: 8, lineHeight: 1.8 }}>
        Traces the exact origin of <code>modalSourceAmplitude1m</code> entering the modal solver.
        Steps mirror rewBassEngine.js exactly. Flat 94 dB source curve. Current activeSettings applied.
      </div>

      {!canRun && (
        <div style={{ fontSize: 10, color: '#fbbf24', ...MONO, marginBottom: 6 }}>⚠ Need room, seat, and sub.</div>
      )}

      <button
        onClick={runAudit}
        disabled={running || !canRun}
        style={{
          height: 28, padding: '0 14px', borderRadius: 6,
          border: '1px solid #57534e', background: running ? '#1c1917' : '#292524',
          color: running || !canRun ? '#57534e' : '#d6d3d1', fontSize: 11, ...MONO,
          cursor: running || !canRun ? 'not-allowed' : 'pointer', fontWeight: 700, marginBottom: 10,
        }}
      >
        {running ? 'Computing…' : result ? 'Re-run Audit' : 'Run Modal Source Amplitude Provenance Audit'}
      </button>

      {error && <div style={{ fontSize: 10, color: '#f87171', ...MONO, marginBottom: 8 }}>⚠ {error}</div>}

      {result && (
        <>
          {/* ── Frequency tabs ── */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
            {TARGET_HZ.map(hz => {
              const d = result.byHz[hz];
              const isActive = hz === activeHz;
              const cf = d?.contributionFactor;
              const cfColor = cf == null ? '#57534e' : cf > 10 ? '#f87171' : cf > 2 ? '#fbbf24' : '#4ade80';
              return (
                <button key={hz} onClick={() => setActiveHz(hz)} style={{
                  padding: '3px 10px', borderRadius: 4, fontSize: 9, ...MONO, cursor: 'pointer',
                  border: isActive ? '1px solid #60a5fa' : '1px solid #292524',
                  background: isActive ? '#1e3a5f' : '#1c1917',
                  color: isActive ? '#93c5fd' : '#78716c', fontWeight: isActive ? 700 : 400,
                }}>
                  {hz} Hz
                  {d && <span style={{ marginLeft: 5, color: cfColor }}>×{Number(cf).toFixed(2)}</span>}
                </button>
              );
            })}
          </div>

          {/* ── Summary table all freqs ── */}
          <div style={{ fontSize: 10, fontWeight: 700, color: '#60a5fa', ...MONO, marginBottom: 4 }}>
            Summary — modalSourceAmplitude vs raw source pressure
          </div>
          <div style={{ overflowX: 'auto', marginBottom: 14 }}>
            <table style={{ borderCollapse: 'collapse', minWidth: 680 }}>
              <thead>
                <tr>
                  <th style={{ ...THL, minWidth: 40 }}>Hz</th>
                  <th style={{ ...TH, minWidth: 72 }}>Raw P (Pa)</th>
                  <th style={{ ...TH, minWidth: 72 }}>Base P (Pa)</th>
                  <th style={{ ...TH, minWidth: 72 }}>Final P (Pa)</th>
                  <th style={{ ...TH, minWidth: 60 }}>Factor ×</th>
                  <th style={{ ...TH, minWidth: 72 }}>Factor dB</th>
                  <th style={{ ...THL, minWidth: 160 }}>Norm mode</th>
                  <th style={{ ...THL, minWidth: 90 }}>Verdict</th>
                </tr>
              </thead>
              <tbody>
                {TARGET_HZ.map(hz => {
                  const d = result.byHz[hz];
                  if (!d) return null;
                  const cf = d.contributionFactor;
                  const cfDb = Number.isFinite(cf) && cf > 0 ? 20 * Math.log10(cf) : null;
                  const inflation = Number.isFinite(cf) && cf > 10;
                  const cfColor = inflation ? '#f87171' : cf > 2 ? '#fbbf24' : '#4ade80';
                  const isActive = hz === activeHz;
                  return (
                    <tr key={hz} onClick={() => setActiveHz(hz)} style={{ cursor: 'pointer', background: isActive ? '#1a1a1a' : 'transparent', borderBottom: '1px solid #1c1917' }}>
                      <td style={{ ...TDL, color: '#fbbf24', fontWeight: 700 }}>{hz} Hz</td>
                      <td style={{ ...TD, color: '#78716c' }}>{fmt6(d.rawSourcePressure)}</td>
                      <td style={{ ...TD, color: '#a78bfa' }}>{fmt6(d.modalSourceAmplitudeBase)}</td>
                      <td style={{ ...TD, color: '#fbbf24', fontWeight: 700 }}>{fmt6(d.finalModalSourceAmplitude)}</td>
                      <td style={{ ...TD, color: cfColor, fontWeight: 700 }}>{Number.isFinite(cf) ? cf.toFixed(4) : '—'}</td>
                      <td style={{ ...TD, color: cfColor }}>{Number.isFinite(cfDb) ? cfDb.toFixed(2) + ' dB' : '—'}</td>
                      <td style={{ ...TDL, color: '#78716c', fontSize: 8 }}>{d.modalSourceReferenceMode}</td>
                      <td style={{ ...TDL, color: inflation ? '#f87171' : '#4ade80', fontWeight: 700, fontSize: 8 }}>
                        {inflation ? '⚠ inflation' : '✓ consistent'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Per-frequency step detail ── */}
          {active && (() => {
            const d = active;
            const cf = d.contributionFactor;
            const cfDb = Number.isFinite(cf) && cf > 0 ? 20 * Math.log10(cf) : null;
            const inflation = Number.isFinite(cf) && cf > 10;

            const steps = [
              {
                idx: 1, name: 'Raw source curve at frequency',
                inputLabel: `flat_rew_reference`,
                multiplier: null,
                output: d.curveDb,
                outputLabel: `${fmt1(d.curveDb)} dB`,
                note: 'curveDb = interpolateCurveDb(subProductCurve, hz). Using flat 94 dB.',
                highlight: false,
              },
              {
                idx: 2, name: 'Source curve after gainDb',
                inputLabel: `${fmt1(d.curveDb)} dB + gainDb ${fmt1(d.gainDb)} dB`,
                multiplier: Math.pow(10, d.gainDb / 20),
                output: d.curveDbPlusGain,
                outputLabel: `${fmt1(d.curveDbPlusGain)} dB`,
                note: `gainDb = sub.tuning.gainDb (${fmt1(d.gainDb)} dB). Engine adds this to curveDb before conversion.`,
                highlight: false,
              },
              {
                idx: 3, name: 'dB → pressure (10^(·/20))',
                inputLabel: `10^(${fmt1(d.curveDbPlusGain)}/20)`,
                multiplier: d.pressureAfterGain,
                output: d.pressureAfterGain,
                outputLabel: `${fmt6(d.pressureAfterGain)} Pa`,
                note: `rawSourcePressure (no gain) = ${fmt6(d.rawSourcePressure)} Pa. This step yields modalSourceAmplitudeBase ÷ modalGainScalar.`,
                highlight: false,
              },
              {
                idx: 4, name: 'modalGainScalar applied',
                inputLabel: `${fmt6(d.pressureAfterGain)} Pa × ${fmt4(d.modalGainScalar)}`,
                multiplier: d.modalGainScalar,
                output: d.modalSourceAmplitudeBase,
                outputLabel: `${fmt6(d.modalSourceAmplitudeBase)} Pa`,
                note: `modalGainScalar=${fmt4(d.modalGainScalar)}. Engine: modalSourceAmplitudeBase = 10^((curveDb+gainDb)/20) × modalGainScalar.`,
                highlight: false,
              },
              {
                idx: 5, name: 'modalSourceReferenceMode normalisation',
                inputLabel: `${fmt6(d.modalSourceAmplitudeBase)} Pa`,
                multiplier: d.normWeighting,
                output: d.finalModalSourceAmplitude,
                outputLabel: `${fmt6(d.finalModalSourceAmplitude)} Pa`,
                note: d.normLabel,
                highlight: false,
              },
              {
                idx: 6, name: 'Final modalSourceAmplitude1m (enters modal solver)',
                inputLabel: 'all steps above combined',
                multiplier: null,
                output: d.finalModalSourceAmplitude,
                outputLabel: `${fmt6(d.finalModalSourceAmplitude)} Pa  (${toDb(d.finalModalSourceAmplitude)})`,
                note: `This value feeds legacyModalTransferLocal as modalSourceAmplitude. Multiplied by ψ_source × ψ_receiver × |H(f,f₀,Q)| per mode.`,
                highlight: true,
              },
            ];

            return (
              <>
                {/* Dominant mode context */}
                {d.dominantMode && (
                  <div style={{ padding: '5px 10px', background: '#1c1917', borderLeft: '3px solid #a78bfa', borderRadius: 4, fontSize: 9, ...MONO, color: '#d6d3d1', marginBottom: 10, lineHeight: 1.9 }}>
                    <span style={{ color: '#a78bfa', fontWeight: 700 }}>Dominant mode @ {d.hz} Hz: </span>
                    ({d.dominantMode.nx},{d.dominantMode.ny},{d.dominantMode.nz}) {d.dominantMode.type}
                    &nbsp;· f₀ = {fmt2(d.dominantMode.freq)} Hz · Q = {fmt2(d.dominantMode.qValue)}
                    &nbsp;· ψ coupling = {fmt6(d.dominantMode.coupling)}
                    &nbsp;· Sub→Seat dist = {fmt4(d.distM)} m
                  </div>
                )}

                {/* 6-step provenance table */}
                <div style={{ fontSize: 10, fontWeight: 700, color: '#60a5fa', ...MONO, marginBottom: 4 }}>
                  6-Step Amplitude Provenance @ {d.hz} Hz
                </div>
                <div style={{ overflowX: 'auto', marginBottom: 12 }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 720 }}>
                    <thead>
                      <tr>
                        <th style={{ ...THL, minWidth: 22 }}>#</th>
                        <th style={{ ...THL, minWidth: 240 }}>Stage</th>
                        <th style={{ ...THL, minWidth: 180 }}>Input</th>
                        <th style={{ ...TH, minWidth: 100 }}>Multiplier</th>
                        <th style={{ ...TH, minWidth: 130 }}>Output</th>
                        <th style={{ ...THL, minWidth: 200 }}>Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {steps.map(s => (
                        <StepRow key={s.idx} {...s} />
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Contribution factor */}
                <div style={{ padding: '7px 12px', background: '#1c1917', borderRadius: 6, border: `1px solid ${inflation ? '#f87171' : '#4ade80'}`, marginBottom: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: inflation ? '#f87171' : '#4ade80', ...MONO, marginBottom: 4 }}>
                    Contribution factor: finalModalSourceAmplitude / rawSourcePressure
                  </div>
                  <div style={{ fontSize: 9, ...MONO, color: '#d6d3d1', lineHeight: 1.9 }}>
                    {fmt6(d.finalModalSourceAmplitude)} / {fmt6(d.rawSourcePressure)}
                    = <span style={{ color: inflation ? '#f87171' : '#4ade80', fontWeight: 700 }}>
                      ×{Number.isFinite(cf) ? cf.toFixed(6) : '—'}
                    </span>
                    {Number.isFinite(cfDb) && <span style={{ marginLeft: 10, color: '#78716c' }}>({fmt1(cfDb)} dB relative to raw source)</span>}
                  </div>
                  <div style={{ fontSize: 9, ...MONO, color: '#57534e', marginTop: 4 }}>
                    modalSourceReferenceMode: <span style={{ color: '#d6d3d1' }}>{d.modalSourceReferenceMode}</span>
                    &nbsp;·&nbsp; effectiveMode: <span style={{ color: '#d6d3d1' }}>{d.effectiveMode}</span>
                    &nbsp;·&nbsp; normWeighting: <span style={{ color: '#d6d3d1' }}>{fmt6(d.normWeighting)}</span>
                  </div>
                </div>

                {/* Verdict */}
                <div style={{ padding: '8px 12px', background: '#1c1917', borderRadius: 6, border: `1px solid ${inflation ? '#f87171' : '#292524'}`, fontSize: 10, ...MONO, fontStyle: 'italic', lineHeight: 1.9 }}>
                  <span style={{ color: inflation ? '#f87171' : '#4ade80', fontWeight: 700 }}>
                    Verdict @ {d.hz} Hz:{' '}
                  </span>
                  {inflation
                    ? `"Modal source amplitude inflation detected." Factor ×${cf.toFixed(2)} (${toDb(cf)}) exceeds 10× threshold. Consider whether modalSourceReferenceMode="${d.effectiveMode}" is appropriate.`
                    : `"Modal source amplitude is physically consistent." Factor ×${Number.isFinite(cf) ? cf.toFixed(4) : '—'} is within expected pressure-domain range.`}
                </div>
              </>
            );
          })()}
        </>
      )}
    </div>
  );
}