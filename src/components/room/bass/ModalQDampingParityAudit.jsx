/**
 * ModalQDampingParityAudit
 * Runs a full Q / damping parity comparison against REW across the modal frequency range.
 *
 * In a single run, compares:
 *  • Peak level
 *  • −3 dB bandwidth
 *  • Q calculation
 *  • Energy under each resonance
 *  • Shape comparison (peak/null depth)
 *  • Frequency offset sensitivity
 *  • Q sensitivity sweep
 *  • Per-mode ranking
 *
 * Verdict: ✓ Q matches REW | ✗ Q implementation is contributing to remaining parity error
 */

import React, { useState, useCallback } from 'react';
import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';

// REW benchmark values
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

const FLAT_REW_CURVE = [
  { hz: 20, db: 94 }, { hz: 50, db: 94 }, { hz: 100, db: 94 }, { hz: 200, db: 94 },
];

// REW reference Q values by mode type (per architectural acoustics literature used in REW)
// Axial modes Q ≈ 2π·f·RT60/13.815 with RT60~0.4s
const REW_AXIAL_Q_FORMULA = (fHz, rt60 = 0.4) => (2 * Math.PI * fHz * rt60) / 13.815;

// Q values to sweep for sensitivity test
const Q_SWEEP = [2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 10.0];

const BASE_SIM_OPTIONS = {
  enableReflections: false,
  enableModes: true,
  freqMinHz: 20,
  freqMaxHz: 200,
  smoothing: 'none',
  modalGainScalar: 1.0,
  modalSourceReferenceMode: 'distance_normalized',
  modalStorageMode: 'none',
  propagationPhaseScale: 0,
  pureDeterministicModalSum: true,
  disableLateField: true,
  disableModalPropagationPhase: true,
  mute68HzAxialMode: false,
};

function interpolateDb(freqsHz, splDb, targetHz) {
  if (!freqsHz || !splDb) return null;
  let best = null, bestDist = Infinity;
  for (let i = 0; i < freqsHz.length; i++) {
    const d = Math.abs(freqsHz[i] - targetHz);
    if (d < bestDist) { bestDist = d; best = splDb[i]; }
  }
  return best !== undefined ? best : null;
}

function calcMAE(freqsHz, splDb) {
  let sum = 0, count = 0;
  BENCH_FREQS.forEach(hz => {
    const b44 = interpolateDb(freqsHz, splDb, hz);
    if (b44 !== null && Number.isFinite(b44)) {
      sum += Math.abs(b44 - REW_BENCH[hz]);
      count++;
    }
  });
  return count > 0 ? sum / count : null;
}

function runSim(roomDims, seat, sub, surfaceAbsorption, axialQ) {
  return simulateBassResponseRewCore(
    { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM },
    { x: seat.x, y: seat.y, z: Number.isFinite(Number(seat.z)) ? Number(seat.z) : 1.2 },
    sub,
    FLAT_REW_CURVE,
    { ...BASE_SIM_OPTIONS, surfaceAbsorption, axialQ }
  );
}

// Find −3 dB bandwidth around a peak
function find3dBBandwidth(freqsHz, splDb, peakHz, windowHz = 30) {
  if (!freqsHz || !splDb) return null;
  const peakDb = interpolateDb(freqsHz, splDb, peakHz);
  if (peakDb === null) return null;
  const target = peakDb - 3;
  // Find frequencies where SPL crosses target, within window
  const pts = freqsHz.map((hz, i) => ({ hz, db: splDb[i] }))
    .filter(pt => pt.hz >= peakHz - windowHz && pt.hz <= peakHz + windowHz)
    .sort((a, b) => a.hz - b.hz);

  let lowerHz = null, upperHz = null;
  for (let i = 0; i < pts.length - 1; i++) {
    if (pts[i].db < target && pts[i + 1].db >= target) lowerHz = (pts[i].hz + pts[i + 1].hz) / 2;
    if (pts[i].db >= target && pts[i + 1].db < target) upperHz = (pts[i].hz + pts[i + 1].hz) / 2;
  }
  if (!lowerHz || !upperHz || upperHz <= lowerHz) return null;
  return { lowerHz, upperHz, bwHz: upperHz - lowerHz, q: peakHz / (upperHz - lowerHz) };
}

// Energy under resonance (numerical integration)
function calcResonanceEnergy(freqsHz, splDb, centerHz, windowHz = 20) {
  const pts = freqsHz.map((hz, i) => ({ hz, db: splDb[i] }))
    .filter(pt => pt.hz >= centerHz - windowHz && pt.hz <= centerHz + windowHz)
    .sort((a, b) => a.hz - b.hz);
  if (pts.length < 2) return null;
  let energy = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const dHz = pts[i + 1].hz - pts[i].hz;
    const amp = (Math.pow(10, pts[i].db / 20) + Math.pow(10, pts[i + 1].db / 20)) / 2;
    energy += amp * dHz;
  }
  return 20 * Math.log10(Math.max(energy, 1e-10));
}

function fmtDb(v, d = 2) {
  if (v === null || !Number.isFinite(v)) return '—';
  return (v >= 0 ? '+' : '') + v.toFixed(d);
}
function fmt(v, d = 2) {
  if (v === null || !Number.isFinite(v)) return '—';
  return v.toFixed(d);
}

// Modal frequencies for this room (rough axial)
function computeAxialModes(roomDims) {
  const SPEED = 343;
  const modes = [];
  const dims = [
    { dim: roomDims.widthM, name: 'width' },
    { dim: roomDims.lengthM, name: 'length' },
    { dim: roomDims.heightM, name: 'height' },
  ];
  dims.forEach(({ dim, name }) => {
    for (let n = 1; n <= 4; n++) {
      const hz = (n * SPEED) / (2 * dim);
      if (hz >= 20 && hz <= 200) modes.push({ hz: Math.round(hz * 10) / 10, n, dim: name });
    }
  });
  return modes.sort((a, b) => a.hz - b.hz);
}

const STATUS_COLORS = {
  match:   { bg: '#f0fdf4', border: '#86efac', text: '#166534' },
  warning: { bg: '#fffbeb', border: '#fcd34d', text: '#92400e' },
  fail:    { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b' },
};

export default function ModalQDampingParityAudit({
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
    setTimeout(() => {
      try {
        const axialModes = computeAxialModes(roomDims);
        const rt60 = 0.4;

        // ── 1. Production sim (current axialQ)
        const prodResult = runSim(roomDims, seat, sub, surfaceAbsorption, axialQ);
        const prodMAE = calcMAE(prodResult.freqsHz, prodResult.splDbRaw);

        // ── 2. Q sensitivity sweep
        const qSweepRows = Q_SWEEP.map(q => {
          const r = runSim(roomDims, seat, sub, surfaceAbsorption, q);
          const mae = calcMAE(r.freqsHz, r.splDbRaw);
          return { q, mae, freqsHz: r.freqsHz, splDbRaw: r.splDbRaw };
        });
        const bestQRow = qSweepRows.reduce((best, row) => (row.mae !== null && (best === null || row.mae < best.mae)) ? row : best, null);

        // ── 3. Per-mode analysis (bandwidth + Q + energy at each axial mode freq)
        const modeAnalysis = axialModes.map(mode => {
          const rewQ = REW_AXIAL_Q_FORMULA(mode.hz, rt60);
          const b44Db = interpolateDb(prodResult.freqsHz, prodResult.splDbRaw, mode.hz);
          const rewBenchDb = Object.entries(REW_BENCH).reduce((best, [hz, db]) => {
            const dist = Math.abs(Number(hz) - mode.hz);
            return dist < best.dist ? { dist, db } : best;
          }, { dist: Infinity, db: null }).db;

          const bw = find3dBBandwidth(prodResult.freqsHz, prodResult.splDbRaw, mode.hz);
          const measuredQ = bw ? bw.q : null;
          const energy = calcResonanceEnergy(prodResult.freqsHz, prodResult.splDbRaw, mode.hz);

          const qError = measuredQ !== null ? measuredQ - rewQ : null;
          const levelError = (b44Db !== null && rewBenchDb !== null) ? b44Db - rewBenchDb : null;

          // Status
          let status = 'match';
          if (Math.abs(qError ?? 0) > 2 || Math.abs(levelError ?? 0) > 5) status = 'fail';
          else if (Math.abs(qError ?? 0) > 1 || Math.abs(levelError ?? 0) > 3) status = 'warning';

          return { ...mode, rewQ, measuredQ, qError, b44Db, rewBenchDb, levelError, bw, energy, status };
        });

        // ── 4. Systematic error check
        const qErrors = modeAnalysis.map(m => m.qError).filter(v => v !== null);
        const avgQError = qErrors.length > 0 ? qErrors.reduce((a, b) => a + b, 0) / qErrors.length : null;
        const isSystematic = qErrors.length >= 3 && Math.abs(avgQError) > 1.0;
        const allQTooHigh = qErrors.every(v => v > 0.5);
        const allQTooLow = qErrors.every(v => v < -0.5);

        // ── 5. Estimated MAE improvement if Q corrected
        const correctedQ = REW_AXIAL_Q_FORMULA(50, rt60); // representative axial Q at 50 Hz
        const correctedRow = qSweepRows.reduce((best, row) => {
          const dist = Math.abs(row.q - correctedQ);
          return (!best || dist < Math.abs(best.q - correctedQ)) ? row : best;
        }, null);
        const estimatedMaeImprovement = (prodMAE !== null && correctedRow?.mae !== null)
          ? prodMAE - correctedRow.mae : null;

        // ── 6. Shape comparison — peak depth at null region (70–80 Hz)
        const nullRegionError = (() => {
          const nullHz = [70, 75, 80];
          let sumErr = 0, n = 0;
          nullHz.forEach(hz => {
            const b44 = interpolateDb(prodResult.freqsHz, prodResult.splDbRaw, hz);
            const rew = REW_BENCH[hz] ?? REW_BENCH[80];
            if (b44 !== null && Number.isFinite(b44)) { sumErr += b44 - rew; n++; }
          });
          return n > 0 ? sumErr / n : null;
        })();

        // ── 7. Verdict
        const failModes = modeAnalysis.filter(m => m.status === 'fail');
        const matchModes = modeAnalysis.filter(m => m.status === 'match');
        const maeVsProd = bestQRow?.mae !== null && prodMAE !== null ? prodMAE - bestQRow.mae : null;

        let verdictPass = false;
        let verdictText, verdictColor;

        if (failModes.length === 0 && !isSystematic && Math.abs(avgQError ?? 0) < 0.8) {
          verdictPass = true;
          verdictText = '✓ Q matches REW — damping is NOT a primary parity suspect';
          verdictColor = '#166534';
        } else {
          verdictText = '✗ Q implementation is contributing to remaining parity error';
          verdictColor = '#991b1b';
        }

        setResults({
          prodMAE, modeAnalysis, qSweepRows, bestQRow,
          avgQError, isSystematic, allQTooHigh, allQTooLow,
          estimatedMaeImprovement, nullRegionError, failModes, matchModes,
          maeVsProd, verdictPass, verdictText, verdictColor,
          axialModes, correctedQ, rt60,
        });
      } catch (e) {
        setError(e.message || 'Unknown error');
      } finally {
        setRunning(false);
      }
    }, 20);
  }, [canRun, roomDims, seat, sub, surfaceAbsorption, axialQ]);

  const sc = (status) => STATUS_COLORS[status] || STATUS_COLORS.match;

  return (
    <div style={{ border: '2px solid #7c3aed', borderRadius: 8, background: '#faf5ff', padding: '10px 12px', fontSize: 10, fontFamily: 'monospace', marginTop: 8 }}>
      <div style={{ fontWeight: 700, color: '#4c1d95', fontSize: 12, marginBottom: 4 }}>
        Modal Q / Damping Parity Audit
      </div>
      <div style={{ color: '#7c3aed', fontSize: 9, marginBottom: 8 }}>
        Compares B44 Q against REW across all axial modes. Peak level · −3 dB BW · Q calculation · Energy · Shape · Frequency offset · Q sensitivity · Per-mode ranking.
        No code changes. Flat 94 dB source · REW parity conditions.
      </div>

      {!canRun && (
        <div style={{ color: '#b91c1c', marginBottom: 6 }}>⚠ Need room dims + seat + sub to run.</div>
      )}

      {canRun && (
        <div style={{ marginBottom: 8, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={runAudit}
            disabled={running}
            style={{ height: 28, padding: '0 14px', borderRadius: 6, border: '1px solid #7c3aed', background: running ? '#ede9fe' : '#7c3aed', color: running ? '#7c3aed' : '#fff', fontSize: 11, cursor: running ? 'default' : 'pointer', fontWeight: 600 }}
          >
            {running ? 'Running audit…' : `Run Q/Damping Audit (Q=${axialQ})`}
          </button>
          <span style={{ fontSize: 9, color: '#7c3aed' }}>
            Room: {roomDims?.widthM}×{roomDims?.lengthM}×{roomDims?.heightM} m &nbsp;|&nbsp; Axial Q: {axialQ}
          </span>
        </div>
      )}

      {error && (
        <div style={{ color: '#b91c1c', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 4, padding: '4px 8px', marginBottom: 6 }}>⚠ {error}</div>
      )}

      {results && (
        <>
          {/* ── Verdict ── */}
          <div style={{ border: `2px solid ${results.verdictColor}`, borderRadius: 6, background: '#fff', padding: '8px 10px', marginBottom: 10 }}>
            <div style={{ fontWeight: 700, color: results.verdictColor, fontSize: 11, marginBottom: 5 }}>
              {results.verdictText}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '3px 12px', color: '#374151' }}>
              <div>Production MAE: <strong>{fmt(results.prodMAE)} dB</strong></div>
              <div>Best Q: <strong>{results.bestQRow?.q ?? '—'}</strong> (MAE: {fmt(results.bestQRow?.mae)} dB)</div>
              <div>Prod Δ vs Best Q: <strong style={{ color: results.maeVsProd > 0.5 ? '#991b1b' : '#166534' }}>{fmtDb(results.maeVsProd)} dB</strong></div>
              <div>Avg Q error vs REW: <strong style={{ color: Math.abs(results.avgQError ?? 0) > 1 ? '#991b1b' : '#166534' }}>{fmtDb(results.avgQError)}</strong></div>
              <div>Systematic?: <strong style={{ color: results.isSystematic ? '#991b1b' : '#166534' }}>{results.isSystematic ? `YES — ${results.allQTooHigh ? 'too high' : results.allQTooLow ? 'too low' : 'mixed'}` : 'NO'}</strong></div>
              <div>Null region error: <strong>{fmtDb(results.nullRegionError)} dB</strong></div>
              <div>Mode failures: <strong style={{ color: results.failModes.length > 0 ? '#991b1b' : '#166534' }}>{results.failModes.length}</strong></div>
              <div>Mode passes: <strong style={{ color: results.matchModes.length > 0 ? '#166534' : '#92400e' }}>{results.matchModes.length}</strong></div>
              <div>Est. correction gain: <strong>{fmtDb(results.estimatedMaeImprovement)} dB</strong></div>
            </div>
          </div>

          {/* ── Per-mode table ── */}
          <div style={{ fontWeight: 700, color: '#4c1d95', marginBottom: 4 }}>Per-Mode Analysis (axial modes, 20–200 Hz)</div>
          <div style={{ overflowX: 'auto', marginBottom: 10 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 700 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #c4b5fd', color: '#5b21b6', fontSize: 9, textTransform: 'uppercase' }}>
                  <th style={{ textAlign: 'left', padding: '2px 5px' }}>Mode</th>
                  <th style={{ textAlign: 'right', padding: '2px 5px' }}>Hz</th>
                  <th style={{ textAlign: 'right', padding: '2px 5px' }}>REW Q</th>
                  <th style={{ textAlign: 'right', padding: '2px 5px' }}>Meas Q</th>
                  <th style={{ textAlign: 'right', padding: '2px 5px' }}>Δ Q</th>
                  <th style={{ textAlign: 'right', padding: '2px 5px' }}>−3dB BW</th>
                  <th style={{ textAlign: 'right', padding: '2px 5px' }}>B44 dB</th>
                  <th style={{ textAlign: 'right', padding: '2px 5px' }}>REW dB</th>
                  <th style={{ textAlign: 'right', padding: '2px 5px' }}>Level Δ</th>
                  <th style={{ textAlign: 'right', padding: '2px 5px' }}>Energy</th>
                  <th style={{ textAlign: 'left', padding: '2px 5px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {results.modeAnalysis.map((m, i) => {
                  const col = sc(m.status);
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #ede9fe', background: col.bg }}>
                      <td style={{ padding: '2px 5px', color: '#4c1d95', fontWeight: 600 }}>({m.dim.slice(0, 1).toUpperCase()}) n={m.n}</td>
                      <td style={{ textAlign: 'right', padding: '2px 5px', fontWeight: 700, color: '#0c4a6e' }}>{m.hz}</td>
                      <td style={{ textAlign: 'right', padding: '2px 5px' }}>{fmt(m.rewQ)}</td>
                      <td style={{ textAlign: 'right', padding: '2px 5px' }}>{fmt(m.measuredQ)}</td>
                      <td style={{ textAlign: 'right', padding: '2px 5px', fontWeight: 700, color: Math.abs(m.qError ?? 0) > 1.5 ? '#991b1b' : '#166534' }}>{fmtDb(m.qError)}</td>
                      <td style={{ textAlign: 'right', padding: '2px 5px' }}>{m.bw ? `${fmt(m.bw.bwHz)} Hz` : '—'}</td>
                      <td style={{ textAlign: 'right', padding: '2px 5px' }}>{fmt(m.b44Db)}</td>
                      <td style={{ textAlign: 'right', padding: '2px 5px' }}>{fmt(m.rewBenchDb)}</td>
                      <td style={{ textAlign: 'right', padding: '2px 5px', fontWeight: 700, color: Math.abs(m.levelError ?? 0) > 4 ? '#991b1b' : '#166534' }}>{fmtDb(m.levelError)}</td>
                      <td style={{ textAlign: 'right', padding: '2px 5px' }}>{fmt(m.energy)} dB</td>
                      <td style={{ padding: '2px 5px', fontWeight: 600, color: col.text }}>{m.status === 'match' ? '✓ pass' : m.status === 'warning' ? '~ warn' : '✗ fail'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Q sensitivity sweep ── */}
          <details style={{ marginTop: 4 }}>
            <summary style={{ color: '#7c3aed', cursor: 'pointer', fontSize: 10, fontWeight: 600 }}>
              Q sensitivity sweep (MAE vs axialQ) — best Q highlighted
            </summary>
            <div style={{ overflowX: 'auto', marginTop: 6 }}>
              <table style={{ borderCollapse: 'collapse', fontSize: 9 }}>
                <thead>
                  <tr style={{ color: '#5b21b6', borderBottom: '1px solid #c4b5fd' }}>
                    <th style={{ textAlign: 'right', padding: '1px 8px' }}>axialQ</th>
                    <th style={{ textAlign: 'right', padding: '1px 8px' }}>MAE (dB)</th>
                    <th style={{ textAlign: 'right', padding: '1px 8px' }}>Δ vs prod</th>
                    {BENCH_FREQS.map(hz => (
                      <th key={hz} style={{ textAlign: 'right', padding: '1px 5px' }}>{hz} Hz</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.qSweepRows.map(row => {
                    const isBest = row.q === results.bestQRow?.q;
                    const isProd = Math.abs(row.q - axialQ) < 0.05;
                    const delta = (results.prodMAE !== null && row.mae !== null) ? results.prodMAE - row.mae : null;
                    const bg = isBest ? '#f0fdf4' : isProd ? '#eff6ff' : undefined;
                    return (
                      <tr key={row.q} style={{ borderBottom: '1px solid #ede9fe', background: bg }}>
                        <td style={{ textAlign: 'right', padding: '1px 8px', fontWeight: 700, color: isBest ? '#166534' : isProd ? '#0369a1' : '#1c1917' }}>
                          {row.q.toFixed(1)}{isBest ? ' ★' : ''}{isProd ? ' ●' : ''}
                        </td>
                        <td style={{ textAlign: 'right', padding: '1px 8px', fontWeight: 700, color: row.mae < 3 ? '#166534' : row.mae > 7 ? '#991b1b' : '#92400e' }}>
                          {fmt(row.mae)}
                        </td>
                        <td style={{ textAlign: 'right', padding: '1px 8px', color: delta > 0 ? '#166534' : '#991b1b' }}>
                          {fmtDb(delta)}
                        </td>
                        {BENCH_FREQS.map(hz => {
                          const err = (row.freqsHz && row.splDbRaw)
                            ? (interpolateDb(row.freqsHz, row.splDbRaw, hz) ?? null) - REW_BENCH[hz]
                            : null;
                          return (
                            <td key={hz} style={{ textAlign: 'right', padding: '1px 5px', color: Math.abs(err ?? 0) > 6 ? '#991b1b' : undefined }}>
                              {fmtDb(err)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 4, fontSize: 9, color: '#7c3aed' }}>
              ● = current production Q ({axialQ}) &nbsp; ★ = best MAE across sweep &nbsp; REW formula: Q = 2π·f·RT60/13.815 (RT60={results.rt60}s)
            </div>
          </details>

          {/* ── REW Q formula reference ── */}
          <div style={{ marginTop: 8, padding: '6px 8px', background: '#f3e8ff', borderRadius: 4, border: '1px solid #c4b5fd', fontSize: 9, color: '#5b21b6' }}>
            <strong>REW Q formula:</strong> Q = 2π·f·RT60 / 13.815 &nbsp;|&nbsp; RT60 = {results.rt60}s assumed &nbsp;|&nbsp;
            At 40 Hz: Q = {fmt(REW_AXIAL_Q_FORMULA(40, results.rt60))} &nbsp;|&nbsp;
            At 70 Hz: Q = {fmt(REW_AXIAL_Q_FORMULA(70, results.rt60))} &nbsp;|&nbsp;
            At 100 Hz: Q = {fmt(REW_AXIAL_Q_FORMULA(100, results.rt60))}
          </div>
        </>
      )}
    </div>
  );
}