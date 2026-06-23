/**
 * SourceReferenceProvenanceAudit — Diagnostic only.
 * Does NOT modify the production engine or live graph.
 *
 * Goal: Trace exactly where the 94 dB source reference originates and
 * determine whether REW parity implies a different effective source reference.
 *
 * Shows:
 *  1. User source reference value (flat curve input)
 *  2. Internal source reference value (interpolated at each target frequency)
 *  3. Direct-field reference level used by engine
 *  4. Modal excitation reference level used by engine
 *  5–6. Normalisations applied before each path
 *  7. Final effective source level entering each path
 *
 * Calculates:
 *  - Effective source level required to exactly match REW at 70/80/85/90 Hz
 *  - Average required source level vs current 94 dB reference
 *  - Whether the gap behaves like a fixed SPL offset
 */

import React, { useState, useCallback } from 'react';
import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';

// ── Constants ─────────────────────────────────────────────────────────────────
const FLAT_SOURCE_DB   = 94;
const FLAT_CURVE       = [{ hz: 20, db: FLAT_SOURCE_DB }, { hz: 200, db: FLAT_SOURCE_DB }];
const SPEED_OF_SOUND   = 343;
const MIN_DIST         = 0.01;
const PARITY_FREQS     = [70, 80, 85, 90];
const REW_TARGETS      = { 70: 86.8, 80: 79.7, 85: 90.8, 90: 84.1 };

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt   = (v, d = 2) => Number.isFinite(Number(v)) ? Number(v).toFixed(d) : '—';
const fmtΔ  = (v) => !Number.isFinite(v) ? '—' : (v >= 0 ? '+' : '') + v.toFixed(2);
const MONO  = { fontFamily: 'monospace' };

function errColor(v) {
  const a = Math.abs(v ?? Infinity);
  if (a <= 0.3) return '#4ade80';
  if (a <= 1.0) return '#86efac';
  if (a <= 3.0) return '#fbbf24';
  if (a <= 6.0) return '#fb923c';
  return '#f87171';
}

function consistencyColor(spread) {
  if (spread <= 0.5) return '#4ade80';
  if (spread <= 1.5) return '#fbbf24';
  return '#f87171';
}

/** 3-D Euclidean distance from sub to seat */
function subToSeatDist(sub, seat) {
  const dx = Number(sub.x) - Number(seat.x);
  const dy = Number(sub.y) - Number(seat.y);
  const dz = (Number.isFinite(Number(sub.z)) ? Number(sub.z) : 0.35) -
             (Number.isFinite(Number(seat.z)) ? Number(seat.z) : 1.2);
  return Math.max(MIN_DIST, Math.sqrt(dx * dx + dy * dy + dz * dz));
}

/** Interpolate series { frequency, spl } at targetHz */
function interpSpl(series, hz) {
  if (!series?.length) return null;
  const s = series;
  if (hz <= s[0].frequency) return s[0].spl;
  if (hz >= s[s.length - 1].frequency) return s[s.length - 1].spl;
  for (let i = 0; i < s.length - 1; i++) {
    if (hz >= s[i].frequency && hz <= s[i + 1].frequency) {
      const t = (hz - s[i].frequency) / (s[i + 1].frequency - s[i].frequency);
      return s[i].spl + t * (s[i + 1].spl - s[i].spl);
    }
  }
  return null;
}

/** Run simulation at a specific source level (replaces the 94 dB flat curve) */
function runSimAtLevel(sourceDb, roomDims, seat, sub, surfaceAbsorption, activeSettings) {
  const seatZ = Number.isFinite(Number(seat?.z)) ? Number(seat.z) : 1.2;
  const subZ  = Number.isFinite(Number(sub?.z))  ? Number(sub.z)  : 0.35;
  const curve = [{ hz: 20, db: sourceDb }, { hz: 200, db: sourceDb }];
  try {
    const result = simulateBassResponseRewCore(
      { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM },
      { x: seat.x, y: seat.y, z: seatZ },
      { ...sub, z: subZ },
      curve,
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

/**
 * Binary-search for the source level (dB) that produces exactly `targetSpl`
 * at `targetHz`, given all other params fixed.
 * Returns the required source level in dB.
 */
function findRequiredSourceLevel(targetHz, targetSpl, roomDims, seat, sub, surfaceAbsorption, activeSettings) {
  let lo = 70, hi = 130;
  for (let iter = 0; iter < 40; iter++) {
    const mid    = (lo + hi) / 2;
    const series = runSimAtLevel(mid, roomDims, seat, sub, surfaceAbsorption, activeSettings);
    if (!series) return null;
    const spl    = interpSpl(series, targetHz);
    if (spl === null) return null;
    // SPL increases monotonically with source level → if sim spl < target, increase source
    if (spl < targetSpl) lo = mid;
    else                  hi = mid;
    if (hi - lo < 0.01) break;
  }
  return (lo + hi) / 2;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function SourceReferenceProvenanceAudit({
  roomDims, seat, sub, surfaceAbsorption, activeSettings,
}) {
  const [result, setResult]   = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError]     = useState(null);

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
      const seatZ = Number.isFinite(Number(seat?.z)) ? Number(seat.z) : 1.2;
      const subZ  = Number.isFinite(Number(sub?.z))  ? Number(sub.z)  : 0.35;
      const gainDb = Number.isFinite(Number(sub?.tuning?.gainDb)) ? Number(sub.tuning.gainDb) : 0;
      const modalGainScalar = activeSettings?.modalGainScalar ?? 1.0;
      const modalRefMode    = activeSettings?.modalSourceReferenceMode ?? 'existing';
      const roomVolume      = (roomDims.widthM * roomDims.lengthM * roomDims.heightM);

      const distM        = subToSeatDist(sub, seat);
      const distLossDb   = -20 * Math.log10(distM);

      // ── 1. User source reference (flat curve value) ──
      const userSourceRef = FLAT_SOURCE_DB;

      // ── 2. Internal (interpolated) at each parity frequency ──
      // Flat curve → same at all freqs
      const internalRefByHz = {};
      PARITY_FREQS.forEach(hz => { internalRefByHz[hz] = FLAT_SOURCE_DB; });

      // ── 3. Direct-field reference ──
      // Engine: totalMagnitudeDb = curveDb + distanceLossDb + gainDb
      const directRefByHz = {};
      PARITY_FREQS.forEach(hz => {
        directRefByHz[hz] = internalRefByHz[hz] + distLossDb + gainDb;
      });

      // ── 4. Modal excitation reference ──
      // Engine: modalSourceAmplitudeBase = 10^((curveDb + gainDb) / 20) × modalGainScalar
      // In dB: curveDb + gainDb + 20*log10(modalGainScalar)
      const modalGainScalarDb = 20 * Math.log10(Math.max(modalGainScalar, 1e-6));
      const modalBaseRefByHz  = {};
      PARITY_FREQS.forEach(hz => {
        modalBaseRefByHz[hz] = internalRefByHz[hz] + gainDb + modalGainScalarDb;
      });

      // ── 5. Normalisation before direct ──
      // Engine: distanceLossDb = -20*log10(distM) — this IS the normalisation
      const directNormNote = `distance attenuation: −20·log₁₀(${fmt(distM, 3)} m) = ${fmt(distLossDb, 2)} dB`;
      const directNormDb   = distLossDb;

      // ── 6. Normalisation before modal ──
      let modalNormNote, modalNormDb;
      if (modalRefMode === 'room_volume' || modalRefMode === 'room_normalized') {
        const sqrtVDb = -10 * Math.log10(Math.max(roomVolume, 1e-6)); // 20*log10(1/sqrt(V))
        modalNormNote = `room-volume normalisation: ÷sqrt(V=${fmt(roomVolume, 2)} m³) = ${fmt(sqrtVDb, 2)} dB`;
        modalNormDb   = sqrtVDb;
      } else if (modalRefMode === 'distance_normalized') {
        modalNormNote = `distance-normalised: ×distAttenuation = ${fmt(distLossDb, 2)} dB (same as direct)`;
        modalNormDb   = distLossDb;
      } else {
        modalNormNote = 'none — existing mode: no distance or volume normalisation applied';
        modalNormDb   = 0;
      }

      // ── 7. Final effective level entering each path ──
      const directEffectiveByHz = {};
      const modalEffectiveByHz  = {};
      PARITY_FREQS.forEach(hz => {
        directEffectiveByHz[hz] = internalRefByHz[hz] + gainDb + distLossDb;
        modalEffectiveByHz[hz]  = internalRefByHz[hz] + gainDb + modalGainScalarDb + modalNormDb;
      });

      // ── Current sim at 94 dB ──
      const prodSeries = runSimAtLevel(FLAT_SOURCE_DB, roomDims, seat, sub, surfaceAbsorption, activeSettings);
      const currentSplByHz = {};
      PARITY_FREQS.forEach(hz => {
        currentSplByHz[hz] = prodSeries ? interpSpl(prodSeries, hz) : null;
      });

      // ── Required source levels ──
      const requiredLevels = {};
      for (const hz of PARITY_FREQS) {
        await new Promise(r => setTimeout(r, 0));
        requiredLevels[hz] = findRequiredSourceLevel(
          hz, REW_TARGETS[hz], roomDims, seat, sub, surfaceAbsorption, activeSettings
        );
      }

      const validLevels = PARITY_FREQS.map(hz => requiredLevels[hz]).filter(Number.isFinite);
      const avgRequired = validLevels.length > 0
        ? validLevels.reduce((a, b) => a + b, 0) / validLevels.length
        : null;
      const avgDelta    = Number.isFinite(avgRequired) ? avgRequired - FLAT_SOURCE_DB : null;
      const spread      = validLevels.length > 1
        ? Math.max(...validLevels) - Math.min(...validLevels)
        : 0;

      // Is the gap a flat offset? spread < 1 dB → yes
      const isFixedOffset = spread < 1.0 && validLevels.length >= 3;
      const isNear100     = Number.isFinite(avgRequired) && Math.abs(avgRequired - 100) < 1.5;

      setResult({
        distM, distLossDb, gainDb, modalGainScalar, modalGainScalarDb, modalRefMode, roomVolume,
        userSourceRef, internalRefByHz, directRefByHz, modalBaseRefByHz,
        directNormNote, directNormDb, modalNormNote, modalNormDb,
        directEffectiveByHz, modalEffectiveByHz,
        currentSplByHz, requiredLevels, avgRequired, avgDelta, spread, isFixedOffset, isNear100,
      });
    } catch (e) {
      setError(e.message || 'Unknown error');
    }
    setRunning(false);
  }, [roomDims, seat, sub, surfaceAbsorption, activeSettings, canRun]);

  // ── Styles ────────────────────────────────────────────────────────────────
  const TH = { padding: '3px 8px', fontSize: 9, fontWeight: 700, ...MONO, background: '#1c1917', color: '#a8a29e', borderBottom: '2px solid #292524', whiteSpace: 'nowrap', textAlign: 'right' };
  const TD = { padding: '3px 8px', fontSize: 9, ...MONO, textAlign: 'right', borderBottom: '1px solid #1c1917' };
  const TDL = { ...TD, textAlign: 'left' };
  const ROW_HEAD = { ...TDL, color: '#d6d3d1', fontWeight: 600, minWidth: 260 };

  return (
    <div style={{ marginTop: 12, border: '1px solid #292524', borderRadius: 8, background: '#0c0a09', padding: '10px 12px' }}>

      {/* Header */}
      <div style={{ fontWeight: 700, color: '#d6d3d1', fontSize: 11, ...MONO, marginBottom: 3 }}>
        Source Reference Provenance Audit
        <span style={{ fontWeight: 400, color: '#44403c', marginLeft: 10, fontSize: 10 }}>
          diagnostic only · no production changes
        </span>
      </div>
      <div style={{ fontSize: 9, color: '#57534e', ...MONO, marginBottom: 8, lineHeight: 1.8 }}>
        Traces where the 94 dB source reference enters the engine and computes the exact source level needed to hit REW at 70/80/85/90 Hz.
        Determines whether the parity gap is equivalent to a fixed source-reference calibration offset.
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
          cursor: running || !canRun ? 'not-allowed' : 'pointer', fontWeight: 700, marginBottom: 10,
        }}
      >
        {running ? 'Running…' : result ? 'Re-run Audit' : 'Run Source Provenance Audit'}
      </button>

      {error && (
        <div style={{ fontSize: 10, color: '#f87171', ...MONO, marginBottom: 8 }}>⚠ Error: {error}</div>
      )}

      {result && (() => {
        const r = result;
        const hz = PARITY_FREQS;

        return (
          <>
            {/* ── Section 1: Source reference chain ── */}
            <div style={{ fontSize: 10, fontWeight: 700, color: '#93c5fd', ...MONO, marginBottom: 5 }}>
              Section 1 — Source Reference Chain
            </div>
            <div style={{ overflowX: 'auto', marginBottom: 12 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 580 }}>
                <thead>
                  <tr>
                    <th style={{ ...TH, textAlign: 'left', minWidth: 260 }}>Stage</th>
                    {hz.map(h => <th key={h} style={{ ...TH, color: '#fbbf24' }}>{h} Hz</th>)}
                    <th style={{ ...TH, textAlign: 'left', minWidth: 220 }}>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Row 1 */}
                  <tr style={{ borderBottom: '1px solid #1c1917' }}>
                    <td style={ROW_HEAD}>1. User source reference</td>
                    {hz.map(h => <td key={h} style={{ ...TD, color: '#d6d3d1' }}>{fmt(r.userSourceRef)} dB</td>)}
                    <td style={{ ...TDL, color: '#57534e', fontSize: 8 }}>Flat 94 dB input to engine — user-controlled source curve value</td>
                  </tr>
                  {/* Row 2 */}
                  <tr style={{ borderBottom: '1px solid #1c1917' }}>
                    <td style={ROW_HEAD}>2. Internal source ref (interpolated)</td>
                    {hz.map(h => <td key={h} style={{ ...TD, color: '#d6d3d1' }}>{fmt(r.internalRefByHz[h])} dB</td>)}
                    <td style={{ ...TDL, color: '#57534e', fontSize: 8 }}>interpolateCurveDb(sourceCurve, hz) — flat curve ⇒ constant</td>
                  </tr>
                  {/* Row 3 */}
                  <tr style={{ borderBottom: '1px solid #1c1917' }}>
                    <td style={ROW_HEAD}>3. Direct-field ref (before distance atten.)</td>
                    {hz.map(h => <td key={h} style={{ ...TD, color: '#93c5fd' }}>{fmt(r.internalRefByHz[h] + r.gainDb)} dB</td>)}
                    <td style={{ ...TDL, color: '#57534e', fontSize: 8 }}>curveDb + gainDb — same for all freqs on flat curve; gain = {fmt(r.gainDb, 1)} dB</td>
                  </tr>
                  {/* Row 4 */}
                  <tr style={{ borderBottom: '1px solid #1c1917' }}>
                    <td style={ROW_HEAD}>4. Modal excitation ref (before modal norm.)</td>
                    {hz.map(h => <td key={h} style={{ ...TD, color: '#a78bfa' }}>{fmt(r.modalBaseRefByHz[h])} dB</td>)}
                    <td style={{ ...TDL, color: '#57534e', fontSize: 8 }}>curveDb + gainDb + modalGainScalar (×{fmt(r.modalGainScalar, 2)} = {fmt(r.modalGainScalarDb, 2)} dB)</td>
                  </tr>
                  {/* Row 5 */}
                  <tr style={{ borderBottom: '1px solid #1c1917' }}>
                    <td style={ROW_HEAD}>5. Normalisation before direct calculation</td>
                    {hz.map(h => <td key={h} style={{ ...TD, color: '#86efac' }}>{fmt(r.directNormDb, 2)} dB</td>)}
                    <td style={{ ...TDL, color: '#57534e', fontSize: 8 }}>{r.directNormNote}</td>
                  </tr>
                  {/* Row 6 */}
                  <tr style={{ borderBottom: '1px solid #1c1917' }}>
                    <td style={ROW_HEAD}>6. Normalisation before modal calculation</td>
                    {hz.map(h => <td key={h} style={{ ...TD, color: '#86efac' }}>{fmt(r.modalNormDb, 2)} dB</td>)}
                    <td style={{ ...TDL, color: '#57534e', fontSize: 8 }}>{r.modalNormNote}</td>
                  </tr>
                  {/* Row 7a */}
                  <tr style={{ borderBottom: '1px solid #1c1917', background: '#111110' }}>
                    <td style={{ ...ROW_HEAD, color: '#60a5fa' }}>7a. Final effective → direct path</td>
                    {hz.map(h => <td key={h} style={{ ...TD, color: '#60a5fa', fontWeight: 700 }}>{fmt(r.directEffectiveByHz[h])} dB</td>)}
                    <td style={{ ...TDL, color: '#57534e', fontSize: 8 }}>curveDb + gainDb + distLoss ({fmt(r.distLossDb, 2)} dB @ {fmt(r.distM, 3)} m)</td>
                  </tr>
                  {/* Row 7b */}
                  <tr style={{ borderBottom: '1px solid #1c1917', background: '#111110' }}>
                    <td style={{ ...ROW_HEAD, color: '#c084fc' }}>7b. Final effective → modal path</td>
                    {hz.map(h => <td key={h} style={{ ...TD, color: '#c084fc', fontWeight: 700 }}>{fmt(r.modalEffectiveByHz[h])} dB</td>)}
                    <td style={{ ...TDL, color: '#57534e', fontSize: 8 }}>curveDb + gainDb + modalGainScalar + modalNorm</td>
                  </tr>
                  {/* Current SPL */}
                  <tr style={{ borderBottom: '2px solid #292524', background: '#0f0e0d' }}>
                    <td style={{ ...ROW_HEAD, color: '#fb923c' }}>Current sim SPL @ 94 dB source</td>
                    {hz.map(h => {
                      const spl = r.currentSplByHz[h];
                      const ref = REW_TARGETS[h];
                      const delta = Number.isFinite(spl) && Number.isFinite(ref) ? spl - ref : null;
                      return (
                        <td key={h} style={{ ...TD, color: '#fb923c', fontWeight: 700 }}>
                          {fmt(spl)} dB
                          <br />
                          <span style={{ fontSize: 8, color: errColor(delta), fontWeight: 400 }}>
                            {fmtΔ(delta)} vs REW
                          </span>
                        </td>
                      );
                    })}
                    <td style={{ ...TDL, color: '#57534e', fontSize: 8 }}>Direct + modes, reflections OFF</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* ── Section 2: Required source level ── */}
            <div style={{ fontSize: 10, fontWeight: 700, color: '#fbbf24', ...MONO, marginBottom: 5 }}>
              Section 2 — Required Source Level to Match REW Exactly
            </div>
            <div style={{ overflowX: 'auto', marginBottom: 14 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 480 }}>
                <thead>
                  <tr>
                    <th style={{ ...TH, textAlign: 'left' }}>Metric</th>
                    {hz.map(h => <th key={h} style={{ ...TH, color: '#fbbf24' }}>{h} Hz</th>)}
                    <th style={{ ...TH, color: '#86efac' }}>Average</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #1c1917' }}>
                    <td style={ROW_HEAD}>REW target SPL</td>
                    {hz.map(h => <td key={h} style={{ ...TD, color: '#a8a29e' }}>{fmt(REW_TARGETS[h])} dB</td>)}
                    <td style={{ ...TD, color: '#a8a29e' }}>—</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #1c1917' }}>
                    <td style={ROW_HEAD}>Current B44 SPL</td>
                    {hz.map(h => <td key={h} style={{ ...TD, color: '#fb923c' }}>{fmt(r.currentSplByHz[h])} dB</td>)}
                    <td style={{ ...TD, color: '#a8a29e' }}>—</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #1c1917', background: '#111110' }}>
                    <td style={{ ...ROW_HEAD, color: '#fbbf24' }}>Required source level</td>
                    {hz.map(h => (
                      <td key={h} style={{ ...TD, color: '#fbbf24', fontWeight: 700 }}>
                        {fmt(r.requiredLevels[h])} dB
                      </td>
                    ))}
                    <td style={{ ...TD, color: '#fbbf24', fontWeight: 700 }}>{fmt(r.avgRequired)} dB</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #1c1917' }}>
                    <td style={ROW_HEAD}>Δ from 94 dB reference</td>
                    {hz.map(h => {
                      const delta = Number.isFinite(r.requiredLevels[h]) ? r.requiredLevels[h] - FLAT_SOURCE_DB : null;
                      return <td key={h} style={{ ...TD, color: errColor(delta), fontWeight: 600 }}>{fmtΔ(delta)} dB</td>;
                    })}
                    <td style={{ ...TD, color: errColor(r.avgDelta), fontWeight: 700 }}>{fmtΔ(r.avgDelta)} dB</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* ── Section 3: Verdict ── */}
            <div style={{ fontSize: 10, fontWeight: 700, color: '#4ade80', ...MONO, marginBottom: 5 }}>
              Section 3 — Verdict
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>

              {/* Spread / consistency */}
              <div style={{
                padding: '7px 10px', background: '#1c1917', borderRadius: 5,
                borderLeft: `3px solid ${consistencyColor(r.spread)}`,
                fontSize: 9, ...MONO, color: '#d6d3d1', lineHeight: 1.9,
              }}>
                <span style={{ color: consistencyColor(r.spread), fontWeight: 700 }}>
                  Required level spread: {fmt(r.spread, 2)} dB across 70/80/85/90 Hz.
                </span>
                {' '}
                {r.isFixedOffset
                  ? 'Spread ≤ 1 dB → the parity gap is consistent across frequencies.'
                  : `Spread > 1 dB → the required correction is frequency-dependent, not a flat offset.`}
              </div>

              {/* ~100 dB special case */}
              {r.isNear100 && (
                <div style={{
                  padding: '8px 12px', background: '#1c1917', borderRadius: 5,
                  border: '2px solid #4ade80',
                  fontSize: 10, ...MONO, color: '#4ade80', fontWeight: 700, lineHeight: 1.9,
                }}>
                  ✓ Parity gap behaves like a source-reference calibration offset.
                  <br />
                  <span style={{ fontWeight: 400, color: '#86efac' }}>
                    Average required source level is {fmt(r.avgRequired)} dB ≈ 100 dB.
                    The engine currently uses {FLAT_SOURCE_DB} dB.
                    Raising the flat source reference by {fmt(r.avgDelta, 1)} dB would close the parity gap
                    without any changes to modal Q, geometry, or summation architecture.
                  </span>
                </div>
              )}

              {/* General verdict */}
              <div style={{
                padding: '7px 10px', background: '#1c1917', borderRadius: 5,
                borderLeft: `3px solid ${errColor(r.avgDelta)}`,
                fontSize: 9, ...MONO, color: '#d6d3d1', lineHeight: 1.9,
              }}>
                <span style={{ color: '#a78bfa', fontWeight: 700 }}>Average required source level: </span>
                <span style={{ color: '#fbbf24', fontWeight: 700 }}>{fmt(r.avgRequired)} dB</span>
                {' vs current '}
                <span style={{ color: '#60a5fa', fontWeight: 700 }}>{FLAT_SOURCE_DB} dB</span>
                {' → Δ = '}
                <span style={{ color: errColor(r.avgDelta), fontWeight: 700 }}>{fmtΔ(r.avgDelta)} dB</span>
                <br />
                {r.isFixedOffset
                  ? `The parity gap behaves like a uniform source-level offset of ${fmtΔ(r.avgDelta)} dB. This is consistent with the B44 flat reference being ${fmt(Math.abs(r.avgDelta ?? 0), 1)} dB below the REW reference convention.`
                  : `The required correction varies by frequency (spread = ${fmt(r.spread, 2)} dB). The gap is NOT a simple source-level offset — modal phase, modal density, or Q-factor differences also contribute.`}
              </div>

              {/* Path divergence note */}
              {(() => {
                const directModal = r.directEffectiveByHz[80];
                const modalEff    = r.modalEffectiveByHz[80];
                const pathDiff    = Number.isFinite(directModal) && Number.isFinite(modalEff)
                  ? modalEff - directModal : null;
                return (
                  <div style={{
                    padding: '7px 10px', background: '#1c1917', borderRadius: 5,
                    borderLeft: '3px solid #57534e',
                    fontSize: 9, ...MONO, color: '#78716c', lineHeight: 1.9,
                  }}>
                    At 80 Hz: direct path enters at <span style={{ color: '#60a5fa' }}>{fmt(directModal)} dB</span>,
                    {' '}modal path enters at <span style={{ color: '#c084fc' }}>{fmt(modalEff)} dB</span>
                    {' '}(Δ = <span style={{ color: '#d6d3d1', fontWeight: 700 }}>{fmtΔ(pathDiff)} dB</span>).
                    {Math.abs(pathDiff ?? 0) < 0.5
                      ? ' Paths use the same effective source level — modal normalisation is off.'
                      : ` Paths diverge by ${fmt(Math.abs(pathDiff ?? 0), 2)} dB due to ${r.modalNormNote.split(':')[0]}.`}
                  </div>
                );
              })()}

            </div>
          </>
        );
      })()}
    </div>
  );
}