/**
 * ModalSourceNormalisationAudit
 * Diagnostic only — does not affect live graph or production defaults.
 *
 * Tests 5 modalSourceReferenceMode × 3 modal scale values = 15 combinations.
 * Compares each against the REW reference benchmark and reports MAE, worst error,
 * modal/direct pressure ratio, and per-frequency errors.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';

// ──────────────────────────────────────────────────────────────────────────────
// REW benchmark values (from RewParityBenchmark — flat 94 dB room sim reference)
// ──────────────────────────────────────────────────────────────────────────────
const REW_BENCH = {
  40:  91.4,
  57:  88.5,
  70:  93.6,
  80:  87.5,
  85:  89.1,
  90:  91.3,
  100: 87.0,
};
const BENCH_FREQS = Object.keys(REW_BENCH).map(Number);

// Flat 94 dB reference — matches REW Room Simulator source
const FLAT_REW_CURVE = [
  { hz: 20, db: 94 }, { hz: 50, db: 94 }, { hz: 100, db: 94 }, { hz: 200, db: 94 },
];

// Modes under test
const REF_MODES = ['existing', 'no_volume', 'room_volume', 'room_normalized', 'distance_normalized'];
const SCALE_VALUES = [1.0, 0.75, 0.5];

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────
function interpolateDb(freqsHz, splDb, targetHz) {
  if (!freqsHz || !splDb) return null;
  let best = null, bestDist = Infinity;
  for (let i = 0; i < freqsHz.length; i++) {
    const d = Math.abs(freqsHz[i] - targetHz);
    if (d < bestDist) { bestDist = d; best = splDb[i]; }
  }
  return best !== undefined ? best : null;
}

function calcNormFactor(refMode, scale, distM, volumeM3) {
  // Returns the factor applied to modalSourceAmplitudeBase
  const distanceLossDb = -20 * Math.log10(Math.max(distM, 0.01));
  let modeFactor;
  if (refMode === 'distance_normalized') {
    modeFactor = Math.pow(10, distanceLossDb / 20); // distanceLossDb is negative → factor < 1
  } else if (refMode === 'room_volume' || refMode === 'room_normalized') {
    modeFactor = 1 / Math.sqrt(Math.max(volumeM3, 1e-6));
  } else {
    modeFactor = 1.0; // existing / no_volume / default
  }
  return modeFactor * scale;
}

function fmtDb(v, d = 1) {
  if (v === null || !Number.isFinite(v)) return '—';
  return (v >= 0 ? '+' : '') + v.toFixed(d);
}
function fmt(v, d = 3) {
  if (v === null || !Number.isFinite(v)) return '—';
  return v.toFixed(d);
}

// ──────────────────────────────────────────────────────────────────────────────
// Row computation
// ──────────────────────────────────────────────────────────────────────────────
function runCombo(roomDims, seat, sub, surfaceAbsorption, axialQ, refMode, scale) {
  const _seatZ = Number.isFinite(Number(seat.z)) ? Number(seat.z) : 1.2;

  // Normalisation factor (informational)
  const dx = sub.x - seat.x;
  const dy = sub.y - seat.y;
  const dz = (sub.z ?? 0.35) - _seatZ;
  const distM = Math.sqrt(dx*dx + dy*dy + dz*dz);
  const volumeM3 = roomDims.widthM * roomDims.lengthM * roomDims.heightM;
  const normFactor = calcNormFactor(refMode, scale, distM, volumeM3);
  const normFactorDb = 20 * Math.log10(Math.max(normFactor, 1e-10));

  const result = simulateBassResponseRewCore(
    { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM },
    { x: seat.x, y: seat.y, z: _seatZ },
    sub,
    FLAT_REW_CURVE,
    {
      enableReflections: false,
      enableModes: true,
      surfaceAbsorption,
      freqMinHz: 20,
      freqMaxHz: 200,
      smoothing: 'none',
      modalSourceReferenceMode: refMode,
      modalGainScalar: scale,
      axialQ,
      modalStorageMode: 'none',
      propagationPhaseScale: 0,
      pureDeterministicModalSum: true,
      disableReflectionPhaseJitter: false,
      disableReflectionCoherenceWeight: false,
      disableLateField: true,
      disableModalPropagationPhase: true,
      mute68HzAxialMode: false,
    }
  );

  // Also run direct-only (modes=false) to get modal/direct ratio at each freq
  const directOnlyResult = simulateBassResponseRewCore(
    { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM },
    { x: seat.x, y: seat.y, z: _seatZ },
    sub,
    FLAT_REW_CURVE,
    {
      enableReflections: false,
      enableModes: false,
      surfaceAbsorption,
      freqMinHz: 20,
      freqMaxHz: 200,
      smoothing: 'none',
      modalGainScalar: scale,
      axialQ,
      propagationPhaseScale: 0,
      pureDeterministicModalSum: true,
      disableModalPropagationPhase: true,
      disableLateField: true,
    }
  );

  // Per-frequency errors vs REW benchmark
  const freqErrors = {};
  let sumAbsError = 0;
  let worstError = 0;
  let worstHz = null;

  BENCH_FREQS.forEach(hz => {
    const b44 = interpolateDb(result.freqsHz, result.splDbRaw, hz);
    const rew = REW_BENCH[hz];
    if (b44 !== null && Number.isFinite(b44)) {
      const err = b44 - rew;
      freqErrors[hz] = err;
      sumAbsError += Math.abs(err);
      if (Math.abs(err) > Math.abs(worstError)) {
        worstError = err;
        worstHz = hz;
      }
    } else {
      freqErrors[hz] = null;
    }
  });

  const mae = sumAbsError / BENCH_FREQS.filter(hz => freqErrors[hz] !== null).length;

  // Modal/direct ratio at benchmark freqs (modal SPL - direct SPL avg)
  const modalDirectRatios = [];
  BENCH_FREQS.forEach(hz => {
    const fullDb = interpolateDb(result.freqsHz, result.splDbRaw, hz);
    const dirDb  = interpolateDb(directOnlyResult.freqsHz, directOnlyResult.splDbRaw, hz);
    if (Number.isFinite(fullDb) && Number.isFinite(dirDb)) {
      // modal contribution as ratio of direct amplitude
      const fullAmp  = Math.pow(10, fullDb / 20);
      const dirAmp   = Math.pow(10, dirDb / 20);
      modalDirectRatios.push(fullAmp / Math.max(dirAmp, 1e-10));
    }
  });
  const avgModalDirectRatio = modalDirectRatios.length > 0
    ? modalDirectRatios.reduce((a, b) => a + b, 0) / modalDirectRatios.length
    : null;

  return {
    refMode,
    scale,
    normFactor,
    normFactorDb,
    distM,
    mae,
    worstError,
    worstHz,
    freqErrors,
    avgModalDirectRatio,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Active production row marker
// ──────────────────────────────────────────────────────────────────────────────
function isProductionRow(row) {
  // Production default: distance_blend at 0.55 blend handled as blended 'existing' in engine
  // but for audit purposes we compare against distance_blend ≈ distance_normalized with partial gain.
  // The closest pure test is distance_normalized scale=1.0.
  return row.refMode === 'distance_normalized' && row.scale === 1.0;
}

// ──────────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────────
export default function ModalSourceNormalisationAudit({
  roomDims,
  seat,
  sub,
  surfaceAbsorption,
  axialQ = 4.0,
}) {
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);

  const canRun = !!(roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM && seat && sub);

  const runAudit = useCallback(() => {
    if (!canRun) return;
    setRunning(true);
    setError(null);

    // Run in a timeout to allow the UI to update
    setTimeout(() => {
      try {
        const rows = [];
        REF_MODES.forEach(refMode => {
          SCALE_VALUES.forEach(scale => {
            rows.push(runCombo(roomDims, seat, sub, surfaceAbsorption, axialQ, refMode, scale));
          });
        });

        // Sort by MAE
        const sorted = [...rows].sort((a, b) => a.mae - b.mae);

        setResults({ rows, sorted });
      } catch (e) {
        setError(e.message || 'Unknown error');
      } finally {
        setRunning(false);
      }
    }, 20);
  }, [roomDims, seat, sub, surfaceAbsorption, axialQ, canRun]);

  // Interpretation logic
  const interpretation = useMemo(() => {
    if (!results) return null;
    const { sorted, rows } = results;
    const baselineRow = rows.find(r => r.refMode === 'existing' && r.scale === 1.0);
    const distNormRow = rows.find(r => r.refMode === 'distance_normalized' && r.scale === 1.0);
    const roomVolRow  = rows.find(r => r.refMode === 'room_volume' && r.scale === 1.0);
    const bestRow     = sorted[0];

    if (!baselineRow) return null;

    const distImprovement = baselineRow.mae - (distNormRow?.mae ?? baselineRow.mae);
    const volImprovement  = baselineRow.mae - (roomVolRow?.mae  ?? baselineRow.mae);

    let verdict;
    let verdictColor;
    if (distImprovement > 3) {
      verdict = '🔴 Wrong modal source reference mode is primary REW parity driver. distance_normalized reduces MAE by ' + distImprovement.toFixed(1) + ' dB.';
      verdictColor = '#991b1b';
    } else if (volImprovement > 3 && distImprovement <= 3) {
      verdict = '🟡 Room-volume normalisation is primary parity driver (reduces MAE by ' + volImprovement.toFixed(1) + ' dB). distance_normalized does not help further.';
      verdictColor = '#92400e';
    } else if (bestRow.mae < baselineRow.mae - 1.5) {
      verdict = '🟡 Minor improvement possible (' + (baselineRow.mae - bestRow.mae).toFixed(1) + ' dB). Best: ' + bestRow.refMode + ' ×' + bestRow.scale + '. Not a primary driver.';
      verdictColor = '#92400e';
    } else {
      verdict = '✅ Modal source normalisation is NOT the primary parity driver. All modes produce similar MAE.';
      verdictColor = '#166534';
    }

    const distNormReducesRatio = distNormRow && baselineRow
      ? (distNormRow.avgModalDirectRatio !== null && baselineRow.avgModalDirectRatio !== null
          ? distNormRow.avgModalDirectRatio < baselineRow.avgModalDirectRatio * 0.7
          : false)
      : false;

    const roomVolOverReduces = roomVolRow && roomVolRow.mae > baselineRow.mae;

    return {
      verdict,
      verdictColor,
      baselineMAE: baselineRow.mae,
      distImprovement,
      volImprovement,
      distNormReducesRatio,
      roomVolOverReduces,
      bestRow,
    };
  }, [results]);

  const cellStyle = (highlight) => ({
    padding: '2px 5px',
    textAlign: 'right',
    background: highlight ? '#fef9c3' : undefined,
    color: highlight ? '#92400e' : undefined,
    fontWeight: highlight ? 700 : undefined,
  });

  return (
    <div style={{ border: '2px solid #6d28d9', borderRadius: 8, background: '#faf5ff', padding: '10px 12px', fontSize: 10, fontFamily: 'monospace', marginTop: 8 }}>
      <div style={{ fontWeight: 700, color: '#4c1d95', fontSize: 12, marginBottom: 6 }}>
        Modal Source Normalisation Matrix Audit
      </div>
      <div style={{ color: '#6d28d9', fontSize: 9, marginBottom: 8 }}>
        Diagnostic only — 15 combinations (5 modes × 3 scales). Direct+Modes, reflections OFF, flat 94 dB source.
        Does not affect live graph or production defaults.
      </div>

      {!canRun && (
        <div style={{ color: '#b91c1c', marginBottom: 6 }}>
          ⚠ Missing room, seat, or sub data. Cannot run audit.
        </div>
      )}

      {canRun && (
        <div style={{ marginBottom: 8, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={runAudit}
            disabled={running}
            style={{ height: 28, padding: '0 14px', borderRadius: 6, border: '1px solid #6d28d9', background: running ? '#e9d5ff' : '#6d28d9', color: running ? '#6d28d9' : '#fff', fontSize: 11, cursor: running ? 'default' : 'pointer', fontWeight: 600 }}
          >
            {running ? 'Running 15 combos…' : 'Run Audit (15 combos)'}
          </button>
          {results && (
            <span style={{ fontSize: 9, color: '#7c3aed' }}>
              Room: {roomDims?.widthM}×{roomDims?.lengthM}×{roomDims?.heightM} m &nbsp;|&nbsp;
              Vol: {(roomDims.widthM * roomDims.lengthM * roomDims.heightM).toFixed(1)} m³ &nbsp;|&nbsp;
              Axial Q: {axialQ}
            </span>
          )}
        </div>
      )}

      {error && (
        <div style={{ color: '#b91c1c', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 4, padding: '4px 8px', marginBottom: 6 }}>
          ⚠ Error: {error}
        </div>
      )}

      {results && (
        <>
          {/* ── Interpretation ── */}
          {interpretation && (
            <div style={{ border: `2px solid ${interpretation.verdictColor}`, borderRadius: 6, background: '#fff', padding: '8px 10px', marginBottom: 10 }}>
              <div style={{ fontWeight: 700, color: interpretation.verdictColor, marginBottom: 4 }}>
                Verdict
              </div>
              <div style={{ color: interpretation.verdictColor, fontWeight: 600, lineHeight: 1.5 }}>
                {interpretation.verdict}
              </div>
              <div style={{ marginTop: 6, color: '#374151', lineHeight: 1.6 }}>
                <div>Baseline MAE (existing ×1.0): {interpretation.baselineMAE.toFixed(2)} dB</div>
                <div>distance_normalized ×1.0 improvement: {fmtDb(interpretation.distImprovement)} dB</div>
                <div>room_volume ×1.0 improvement: {fmtDb(interpretation.volImprovement)} dB</div>
                <div>distance_normalized reduces modal/direct ratio (&gt;30%): {interpretation.distNormReducesRatio ? '✓ YES' : '✗ NO'}</div>
                <div>room_volume over-reduces (worse MAE than existing): {interpretation.roomVolOverReduces ? '⚠ YES' : 'NO'}</div>
              </div>
            </div>
          )}

          {/* ── Current production row ── */}
          {(() => {
            const prodRow = results.rows.find(r => r.refMode === 'distance_normalized' && r.scale === 1.0);
            if (!prodRow) return null;
            return (
              <div style={{ border: '1px solid #0369a1', borderRadius: 6, background: '#e0f2fe', padding: '6px 10px', marginBottom: 8 }}>
                <div style={{ fontWeight: 700, color: '#0369a1', marginBottom: 3 }}>
                  Current Production Row (distance_blend≈0.55 → closest pure: distance_normalized ×1.0)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '2px 12px', color: '#0c4a6e' }}>
                  <div>Mode: {prodRow.refMode}</div>
                  <div>Scale: ×{prodRow.scale}</div>
                  <div>Norm factor: {fmt(prodRow.normFactor, 4)} ({fmtDb(prodRow.normFactorDb)} dB)</div>
                  <div>Dist: {fmt(prodRow.distM)} m</div>
                  <div>MAE: {prodRow.mae.toFixed(2)} dB</div>
                  <div>Worst error: {fmtDb(prodRow.worstError)} dB @ {prodRow.worstHz} Hz</div>
                  <div>Modal/direct ratio: {fmt(prodRow.avgModalDirectRatio, 2)}×</div>
                </div>
              </div>
            );
          })()}

          {/* ── Top 10 by MAE ── */}
          <div style={{ fontWeight: 700, color: '#4c1d95', marginBottom: 4 }}>Top 10 Ranked by MAE</div>
          <div style={{ overflowX: 'auto', marginBottom: 10 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 820 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #c4b5fd', color: '#5b21b6', fontSize: 9, textTransform: 'uppercase' }}>
                  <th style={{ textAlign: 'left', padding: '2px 5px' }}>#</th>
                  <th style={{ textAlign: 'left', padding: '2px 5px' }}>Mode</th>
                  <th style={{ textAlign: 'right', padding: '2px 5px' }}>Scale</th>
                  <th style={{ textAlign: 'right', padding: '2px 5px' }}>Norm factor</th>
                  <th style={{ textAlign: 'right', padding: '2px 5px' }}>ΔdB vs base</th>
                  <th style={{ textAlign: 'right', padding: '2px 5px' }}>MAE</th>
                  <th style={{ textAlign: 'right', padding: '2px 5px' }}>Worst err</th>
                  <th style={{ textAlign: 'right', padding: '2px 5px' }}>Worst Hz</th>
                  <th style={{ textAlign: 'right', padding: '2px 5px' }}>Modal/Direct</th>
                  <th style={{ textAlign: 'right', padding: '2px 5px' }}>40Hz</th>
                  <th style={{ textAlign: 'right', padding: '2px 5px' }}>57Hz</th>
                  <th style={{ textAlign: 'right', padding: '2px 5px' }}>70Hz</th>
                  <th style={{ textAlign: 'right', padding: '2px 5px' }}>80Hz</th>
                  <th style={{ textAlign: 'right', padding: '2px 5px' }}>85Hz</th>
                  <th style={{ textAlign: 'right', padding: '2px 5px' }}>90Hz</th>
                  <th style={{ textAlign: 'right', padding: '2px 5px' }}>100Hz</th>
                </tr>
              </thead>
              <tbody>
                {results.sorted.slice(0, 10).map((row, i) => {
                  const isProd = isProductionRow(row);
                  const isExisting = row.refMode === 'existing' && row.scale === 1.0;
                  const baseDeltaDb = row.normFactorDb; // delta vs base amplitude (log of norm factor including scale)
                  const bg = i === 0 ? '#f0fdf4' : isProd ? '#eff6ff' : undefined;
                  const labelColor = i === 0 ? '#166534' : isProd ? '#0369a1' : '#1c1917';
                  return (
                    <tr key={`${row.refMode}_${row.scale}`} style={{ borderBottom: '1px solid #ede9fe', background: bg }}>
                      <td style={{ padding: '2px 5px', fontWeight: 700, color: labelColor }}>{i + 1}{i === 0 ? ' ★' : ''}{isProd ? ' 🔵' : ''}</td>
                      <td style={{ padding: '2px 5px', color: labelColor, fontWeight: isProd ? 700 : undefined }}>{row.refMode}</td>
                      <td style={cellStyle(false)}>×{row.scale}</td>
                      <td style={cellStyle(false)}>{fmt(row.normFactor, 4)}</td>
                      <td style={cellStyle(Math.abs(baseDeltaDb) > 5)}>{fmtDb(baseDeltaDb)} dB</td>
                      <td style={{ ...cellStyle(false), fontWeight: 700, color: row.mae < 3 ? '#166534' : row.mae > 8 ? '#b91c1c' : '#92400e' }}>{row.mae.toFixed(2)}</td>
                      <td style={cellStyle(Math.abs(row.worstError) > 8)}>{fmtDb(row.worstError)}</td>
                      <td style={cellStyle(false)}>{row.worstHz ?? '—'}</td>
                      <td style={cellStyle(row.avgModalDirectRatio > 3)}>{fmt(row.avgModalDirectRatio, 2)}×</td>
                      {BENCH_FREQS.map(hz => (
                        <td key={hz} style={cellStyle(Math.abs(row.freqErrors[hz] ?? 0) > 6)}>
                          {fmtDb(row.freqErrors[hz])}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Best mode and scale ── */}
          {interpretation && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              <div style={{ border: '1px solid #059669', borderRadius: 6, background: '#f0fdf4', padding: '6px 10px' }}>
                <div style={{ fontWeight: 700, color: '#065f46', marginBottom: 3 }}>Best Mode (any scale)</div>
                {(() => {
                  const best = results.sorted[0];
                  return (
                    <div style={{ color: '#065f46', lineHeight: 1.7 }}>
                      <div>Mode: <strong>{best.refMode}</strong></div>
                      <div>Scale: ×{best.scale}</div>
                      <div>MAE: <strong>{best.mae.toFixed(2)} dB</strong></div>
                      <div>Improvement vs existing: {fmtDb(results.rows.find(r => r.refMode === 'existing' && r.scale === 1.0)?.mae - best.mae)} dB</div>
                      <div>Modal/direct: {fmt(best.avgModalDirectRatio, 2)}×</div>
                    </div>
                  );
                })()}
              </div>
              <div style={{ border: '1px solid #0891b2', borderRadius: 6, background: '#ecfeff', padding: '6px 10px' }}>
                <div style={{ fontWeight: 700, color: '#0e7490', marginBottom: 3 }}>Full Matrix Summary</div>
                <div style={{ color: '#155e75', lineHeight: 1.7 }}>
                  {REF_MODES.map(mode => {
                    const modeRows = results.rows.filter(r => r.refMode === mode);
                    const bestForMode = [...modeRows].sort((a, b) => a.mae - b.mae)[0];
                    return (
                      <div key={mode}>
                        <strong>{mode}:</strong> best MAE {bestForMode.mae.toFixed(1)} dB @ ×{bestForMode.scale}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── Full 15-combo table ── */}
          <details style={{ marginTop: 4 }}>
            <summary style={{ color: '#6d28d9', cursor: 'pointer', fontSize: 10, fontWeight: 600 }}>
              Full 15-combination table (all results)
            </summary>
            <div style={{ overflowX: 'auto', marginTop: 6 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 820, fontSize: 9 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #c4b5fd', color: '#5b21b6', textTransform: 'uppercase' }}>
                    <th style={{ textAlign: 'left', padding: '2px 5px' }}>Mode</th>
                    <th style={{ textAlign: 'right', padding: '2px 5px' }}>Scale</th>
                    <th style={{ textAlign: 'right', padding: '2px 5px' }}>ΔdB</th>
                    <th style={{ textAlign: 'right', padding: '2px 5px' }}>MAE</th>
                    <th style={{ textAlign: 'right', padding: '2px 5px' }}>Worst</th>
                    <th style={{ textAlign: 'right', padding: '2px 5px' }}>@Hz</th>
                    <th style={{ textAlign: 'right', padding: '2px 5px' }}>M/D</th>
                    {BENCH_FREQS.map(hz => (
                      <th key={hz} style={{ textAlign: 'right', padding: '2px 5px' }}>{hz}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {REF_MODES.map(mode => (
                    SCALE_VALUES.map(scale => {
                      const row = results.rows.find(r => r.refMode === mode && r.scale === scale);
                      if (!row) return null;
                      const isProd = isProductionRow(row);
                      return (
                        <tr key={`${mode}_${scale}`} style={{ borderBottom: '1px solid #ede9fe', background: isProd ? '#eff6ff' : undefined }}>
                          <td style={{ padding: '2px 5px', fontWeight: isProd ? 700 : undefined, color: isProd ? '#0369a1' : '#1c1917' }}>{mode}{isProd ? ' 🔵' : ''}</td>
                          <td style={{ textAlign: 'right', padding: '2px 5px' }}>×{scale}</td>
                          <td style={{ textAlign: 'right', padding: '2px 5px' }}>{fmtDb(row.normFactorDb)} dB</td>
                          <td style={{ textAlign: 'right', padding: '2px 5px', fontWeight: 700, color: row.mae < 3 ? '#166534' : row.mae > 8 ? '#b91c1c' : '#92400e' }}>{row.mae.toFixed(2)}</td>
                          <td style={{ textAlign: 'right', padding: '2px 5px' }}>{fmtDb(row.worstError)}</td>
                          <td style={{ textAlign: 'right', padding: '2px 5px' }}>{row.worstHz ?? '—'}</td>
                          <td style={{ textAlign: 'right', padding: '2px 5px' }}>{fmt(row.avgModalDirectRatio, 2)}×</td>
                          {BENCH_FREQS.map(hz => (
                            <td key={hz} style={{ textAlign: 'right', padding: '2px 5px', color: Math.abs(row.freqErrors[hz] ?? 0) > 6 ? '#b91c1c' : undefined, fontWeight: Math.abs(row.freqErrors[hz] ?? 0) > 6 ? 700 : undefined }}>
                              {fmtDb(row.freqErrors[hz])}
                            </td>
                          ))}
                        </tr>
                      );
                    })
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </div>
  );
}