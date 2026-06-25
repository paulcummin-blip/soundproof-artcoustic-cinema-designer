/**
 * MultiSeatParityValidationAudit
 * Validation only — no code changes, no production effects.
 *
 * Compares 'existing' vs 'distance_normalized' across every seat in the room.
 * Reports MAE, worst error, modal/direct ratio per seat, and aggregate verdict.
 */

import React, { useState, useCallback } from 'react';
import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';

// REW benchmark — flat 94 dB room sim reference
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

const BASE_OPTIONS = {
  enableReflections: false,
  enableModes: true,
  freqMinHz: 20,
  freqMaxHz: 200,
  smoothing: 'none',
  modalGainScalar: 1.0,
  modalStorageMode: 'none',
  propagationPhaseScale: 0,
  pureDeterministicModalSum: true,
  disableReflectionPhaseJitter: false,
  disableReflectionCoherenceWeight: false,
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

function runSeat(roomDims, seat, sub, surfaceAbsorption, axialQ, refMode) {
  const seatZ = Number.isFinite(Number(seat.z)) ? Number(seat.z) : 1.2;

  const result = simulateBassResponseRewCore(
    { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM },
    { x: seat.x, y: seat.y, z: seatZ },
    sub,
    FLAT_REW_CURVE,
    { ...BASE_OPTIONS, surfaceAbsorption, axialQ, modalSourceReferenceMode: refMode }
  );

  const directResult = simulateBassResponseRewCore(
    { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM },
    { x: seat.x, y: seat.y, z: seatZ },
    sub,
    FLAT_REW_CURVE,
    { ...BASE_OPTIONS, surfaceAbsorption, axialQ, enableModes: false, modalSourceReferenceMode: refMode }
  );

  let sumAbsErr = 0;
  let worstErr = 0;
  let worstHz = null;
  const freqErrors = {};

  BENCH_FREQS.forEach(hz => {
    const b44 = interpolateDb(result.freqsHz, result.splDbRaw, hz);
    const rew = REW_BENCH[hz];
    if (b44 !== null && Number.isFinite(b44)) {
      const err = b44 - rew;
      freqErrors[hz] = err;
      sumAbsErr += Math.abs(err);
      if (Math.abs(err) > Math.abs(worstErr)) { worstErr = err; worstHz = hz; }
    } else {
      freqErrors[hz] = null;
    }
  });

  const validCount = BENCH_FREQS.filter(hz => freqErrors[hz] !== null).length;
  const mae = validCount > 0 ? sumAbsErr / validCount : null;

  // Modal/direct ratio (amplitude ratio averaged across benchmark freqs)
  const ratios = [];
  BENCH_FREQS.forEach(hz => {
    const fullDb = interpolateDb(result.freqsHz, result.splDbRaw, hz);
    const dirDb  = interpolateDb(directResult.freqsHz, directResult.splDbRaw, hz);
    if (Number.isFinite(fullDb) && Number.isFinite(dirDb)) {
      ratios.push(Math.pow(10, fullDb / 20) / Math.max(Math.pow(10, dirDb / 20), 1e-10));
    }
  });
  const avgRatio = ratios.length > 0 ? ratios.reduce((a, b) => a + b, 0) / ratios.length : null;

  return { mae, worstErr, worstHz, freqErrors, avgRatio };
}

function fmtDb(v, d = 2) {
  if (v === null || !Number.isFinite(v)) return '—';
  return (v >= 0 ? '+' : '') + v.toFixed(d);
}
function fmt(v, d = 2) {
  if (v === null || !Number.isFinite(v)) return '—';
  return v.toFixed(d);
}

export default function MultiSeatParityValidationAudit({
  roomDims,
  seatingPositions,
  subsForSimulation,
  surfaceAbsorption,
  axialQ = 4.0,
}) {
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);

  const seats = Array.isArray(seatingPositions) ? seatingPositions : [];
  const sub = subsForSimulation?.[0] ?? null;
  const canRun = !!(roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM && seats.length > 0 && sub);

  const runAudit = useCallback(() => {
    if (!canRun) return;
    setRunning(true);
    setError(null);

    setTimeout(() => {
      try {
        const seatResults = seats.map((seat, idx) => {
          const seatId = seat.id || `${seat.x?.toFixed(3)}-${seat.y?.toFixed(3)}`;
          const rowNum = Number(seat?.row || seat?.rowNumber) || 1;
          // derive position-in-row label
          const rowSeats = seats.filter(s => (Number(s?.row || s?.rowNumber) || 1) === rowNum);
          const posInRow = rowSeats.findIndex(s => (s.id || `${s.x?.toFixed(3)}-${s.y?.toFixed(3)}`) === seatId) + 1;
          const label = `R${rowNum}S${posInRow}`;
          const isMlp = !!seat.isPrimary;

          const existing = runSeat(roomDims, seat, sub, surfaceAbsorption, axialQ, 'existing');
          const distNorm = runSeat(roomDims, seat, sub, surfaceAbsorption, axialQ, 'distance_normalized');

          const maeImprovement = (existing.mae !== null && distNorm.mae !== null)
            ? existing.mae - distNorm.mae : null;
          const ratioReduction = (existing.avgRatio !== null && distNorm.avgRatio !== null)
            ? existing.avgRatio - distNorm.avgRatio : null;
          const madWorse = maeImprovement !== null && maeImprovement < 0;

          return { seatId, label, isMlp, existing, distNorm, maeImprovement, ratioReduction, madWorse };
        });

        // Aggregate stats
        const improvements = seatResults.map(r => r.maeImprovement).filter(v => v !== null);
        const avgImprovement = improvements.length > 0
          ? improvements.reduce((a, b) => a + b, 0) / improvements.length : null;
        const bestImprovement = improvements.length > 0 ? Math.max(...improvements) : null;
        const worstImprovement = improvements.length > 0 ? Math.min(...improvements) : null;
        const seatsWorsened = seatResults.filter(r => r.madWorse);
        const allImproved = seatsWorsened.length === 0;
        const mlpImproved = seatResults.filter(r => r.isMlp).every(r => !r.madWorse);

        let verdict, verdictColor;
        if (allImproved && avgImprovement !== null && avgImprovement > 2) {
          verdict = '✅ ROBUST IMPROVEMENT ACROSS ROOM — distance_normalized improves every seat';
          verdictColor = '#166534';
        } else if (mlpImproved && seatsWorsened.length > 0) {
          verdict = '🟡 MLP-ONLY IMPROVEMENT — ' + seatsWorsened.length + ' non-MLP seat(s) made worse';
          verdictColor = '#92400e';
        } else if (seatsWorsened.length > 0) {
          verdict = '🔴 MIXED RESULT — ' + seatsWorsened.length + ' seat(s) made worse including non-MLP positions';
          verdictColor = '#991b1b';
        } else {
          verdict = '✅ IMPROVEMENT ACROSS ALL SEATS — modest but consistent';
          verdictColor = '#166534';
        }

        setResults({ seatResults, avgImprovement, bestImprovement, worstImprovement, seatsWorsened, verdict, verdictColor, allImproved, mlpImproved });
      } catch (e) {
        setError(e.message || 'Unknown error');
      } finally {
        setRunning(false);
      }
    }, 20);
  }, [canRun, roomDims, seats, sub, surfaceAbsorption, axialQ]);

  return (
    <div style={{ border: '2px solid #0369a1', borderRadius: 8, background: '#f0f9ff', padding: '10px 12px', fontSize: 10, fontFamily: 'monospace', marginTop: 8 }}>
      <div style={{ fontWeight: 700, color: '#0c4a6e', fontSize: 12, marginBottom: 4 }}>
        Multi-Seat REW Parity Validation Audit
      </div>
      <div style={{ color: '#0369a1', fontSize: 9, marginBottom: 8 }}>
        Validation only — no code changes. Compares existing vs distance_normalized across all seats.
        Flat 94 dB source · Direct+Modes · Reflections OFF · Axial Q {axialQ}
      </div>

      {!canRun && (
        <div style={{ color: '#b91c1c', marginBottom: 6 }}>
          ⚠ Need room dims + at least one seat + one sub to run.
        </div>
      )}

      {canRun && (
        <div style={{ marginBottom: 8, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={runAudit}
            disabled={running}
            style={{ height: 28, padding: '0 14px', borderRadius: 6, border: '1px solid #0369a1', background: running ? '#bae6fd' : '#0369a1', color: running ? '#0369a1' : '#fff', fontSize: 11, cursor: running ? 'default' : 'pointer', fontWeight: 600 }}
          >
            {running ? `Running ${seats.length * 2} simulations…` : `Run Validation (${seats.length} seats × 2 modes)`}
          </button>
          <span style={{ fontSize: 9, color: '#0369a1' }}>
            Room: {roomDims?.widthM}×{roomDims?.lengthM}×{roomDims?.heightM} m &nbsp;|&nbsp;
            {seats.length} seat(s) &nbsp;|&nbsp; Sub: {sub?.id ?? '—'}
          </span>
        </div>
      )}

      {error && (
        <div style={{ color: '#b91c1c', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 4, padding: '4px 8px', marginBottom: 6 }}>
          ⚠ {error}
        </div>
      )}

      {results && (
        <>
          {/* ── Verdict ── */}
          <div style={{ border: `2px solid ${results.verdictColor}`, borderRadius: 6, background: '#fff', padding: '8px 10px', marginBottom: 10 }}>
            <div style={{ fontWeight: 700, color: results.verdictColor, fontSize: 11, marginBottom: 4 }}>
              {results.verdict}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '3px 12px', color: '#374151' }}>
              <div>Seats tested: <strong>{results.seatResults.length}</strong></div>
              <div>Avg MAE improvement: <strong style={{ color: results.avgImprovement > 0 ? '#166534' : '#991b1b' }}>{fmtDb(results.avgImprovement)} dB</strong></div>
              <div>Best improvement: <strong style={{ color: '#166534' }}>{fmtDb(results.bestImprovement)} dB</strong></div>
              <div>Worst improvement: <strong style={{ color: results.worstImprovement < 0 ? '#991b1b' : '#374151' }}>{fmtDb(results.worstImprovement)} dB</strong></div>
              <div>Seats made worse: <strong style={{ color: results.seatsWorsened.length > 0 ? '#991b1b' : '#166534' }}>{results.seatsWorsened.length}</strong></div>
              {results.seatsWorsened.length > 0 && (
                <div style={{ gridColumn: '2 / -1', color: '#991b1b' }}>
                  Worsened: {results.seatsWorsened.map(r => r.label).join(', ')}
                </div>
              )}
            </div>
          </div>

          {/* ── Per-seat table ── */}
          <div style={{ fontWeight: 700, color: '#0c4a6e', marginBottom: 4 }}>Per-Seat Results</div>
          <div style={{ overflowX: 'auto', marginBottom: 10 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 760 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #bae6fd', color: '#0369a1', fontSize: 9, textTransform: 'uppercase' }}>
                  <th style={{ textAlign: 'left', padding: '2px 6px' }}>Seat</th>
                  <th style={{ textAlign: 'center', padding: '2px 6px' }}>MLP</th>
                  {/* existing */}
                  <th style={{ textAlign: 'right', padding: '2px 6px', borderLeft: '1px solid #bae6fd' }}>existing MAE</th>
                  <th style={{ textAlign: 'right', padding: '2px 6px' }}>Worst err</th>
                  <th style={{ textAlign: 'right', padding: '2px 6px' }}>M/D</th>
                  {/* dist norm */}
                  <th style={{ textAlign: 'right', padding: '2px 6px', borderLeft: '1px solid #bae6fd' }}>distNorm MAE</th>
                  <th style={{ textAlign: 'right', padding: '2px 6px' }}>Worst err</th>
                  <th style={{ textAlign: 'right', padding: '2px 6px' }}>M/D</th>
                  {/* delta */}
                  <th style={{ textAlign: 'right', padding: '2px 6px', borderLeft: '2px solid #0369a1' }}>Δ MAE</th>
                  <th style={{ textAlign: 'right', padding: '2px 6px' }}>Δ M/D</th>
                  <th style={{ textAlign: 'left', padding: '2px 6px' }}>Result</th>
                </tr>
              </thead>
              <tbody>
                {results.seatResults.map((r) => {
                  const bg = r.madWorse ? '#fef2f2' : r.isMlp ? '#f0fdf4' : undefined;
                  const deltaColor = r.maeImprovement > 0 ? '#166534' : r.maeImprovement < 0 ? '#991b1b' : '#374151';
                  return (
                    <tr key={r.seatId} style={{ borderBottom: '1px solid #e0f2fe', background: bg }}>
                      <td style={{ padding: '2px 6px', fontWeight: 700, color: '#0c4a6e' }}>{r.label}</td>
                      <td style={{ textAlign: 'center', padding: '2px 6px', color: '#166534' }}>{r.isMlp ? '★' : ''}</td>
                      {/* existing */}
                      <td style={{ textAlign: 'right', padding: '2px 6px', borderLeft: '1px solid #bae6fd', color: '#92400e' }}>{fmt(r.existing.mae)} dB</td>
                      <td style={{ textAlign: 'right', padding: '2px 6px', color: '#92400e' }}>{fmtDb(r.existing.worstErr)} @ {r.existing.worstHz ?? '—'} Hz</td>
                      <td style={{ textAlign: 'right', padding: '2px 6px', color: '#92400e' }}>{fmt(r.existing.avgRatio, 2)}×</td>
                      {/* dist norm */}
                      <td style={{ textAlign: 'right', padding: '2px 6px', borderLeft: '1px solid #bae6fd', color: '#166534' }}>{fmt(r.distNorm.mae)} dB</td>
                      <td style={{ textAlign: 'right', padding: '2px 6px', color: '#166534' }}>{fmtDb(r.distNorm.worstErr)} @ {r.distNorm.worstHz ?? '—'} Hz</td>
                      <td style={{ textAlign: 'right', padding: '2px 6px', color: '#166534' }}>{fmt(r.distNorm.avgRatio, 2)}×</td>
                      {/* delta */}
                      <td style={{ textAlign: 'right', padding: '2px 6px', borderLeft: '2px solid #0369a1', fontWeight: 700, color: deltaColor }}>
                        {fmtDb(r.maeImprovement)} dB
                      </td>
                      <td style={{ textAlign: 'right', padding: '2px 6px', color: r.ratioReduction > 0 ? '#166534' : '#991b1b' }}>
                        {r.ratioReduction !== null ? (r.ratioReduction >= 0 ? '-' : '+') + Math.abs(r.ratioReduction).toFixed(2) + '×' : '—'}
                      </td>
                      <td style={{ padding: '2px 6px', color: r.madWorse ? '#991b1b' : '#166534', fontWeight: 600 }}>
                        {r.madWorse ? '⚠ worse' : r.maeImprovement > 3 ? '✓ strong' : r.maeImprovement > 1 ? '✓ improved' : '~ marginal'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Per-seat frequency breakdown ── */}
          <details style={{ marginTop: 4 }}>
            <summary style={{ color: '#0369a1', cursor: 'pointer', fontSize: 10, fontWeight: 600 }}>
              Per-seat frequency error breakdown (existing → distance_normalized)
            </summary>
            <div style={{ marginTop: 8 }}>
              {results.seatResults.map(r => (
                <div key={r.seatId} style={{ border: '1px solid #bae6fd', borderRadius: 4, background: '#fff', padding: '6px 8px', marginBottom: 6 }}>
                  <div style={{ fontWeight: 700, color: '#0c4a6e', marginBottom: 3 }}>
                    {r.label}{r.isMlp ? ' ★ MLP' : ''} — MAE: {fmt(r.existing.mae)} → {fmt(r.distNorm.mae)} dB (Δ {fmtDb(r.maeImprovement)})
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ borderCollapse: 'collapse', fontSize: 9 }}>
                      <thead>
                        <tr style={{ color: '#0369a1', borderBottom: '1px solid #bae6fd' }}>
                          <th style={{ textAlign: 'left', padding: '1px 5px' }}>Hz</th>
                          <th style={{ textAlign: 'right', padding: '1px 5px' }}>REW</th>
                          <th style={{ textAlign: 'right', padding: '1px 5px' }}>existing err</th>
                          <th style={{ textAlign: 'right', padding: '1px 5px' }}>distNorm err</th>
                          <th style={{ textAlign: 'right', padding: '1px 5px' }}>Δ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {BENCH_FREQS.map(hz => {
                          const eErr = r.existing.freqErrors[hz];
                          const dErr = r.distNorm.freqErrors[hz];
                          const delta = (eErr !== null && dErr !== null) ? eErr - dErr : null;
                          const improved = delta !== null && delta > 0;
                          return (
                            <tr key={hz} style={{ borderBottom: '1px solid #f0f9ff' }}>
                              <td style={{ padding: '1px 5px', fontWeight: 700, color: '#0c4a6e' }}>{hz}</td>
                              <td style={{ textAlign: 'right', padding: '1px 5px' }}>{REW_BENCH[hz]}</td>
                              <td style={{ textAlign: 'right', padding: '1px 5px', color: Math.abs(eErr ?? 0) > 5 ? '#991b1b' : '#374151' }}>{fmtDb(eErr)}</td>
                              <td style={{ textAlign: 'right', padding: '1px 5px', color: Math.abs(dErr ?? 0) > 5 ? '#991b1b' : '#166534' }}>{fmtDb(dErr)}</td>
                              <td style={{ textAlign: 'right', padding: '1px 5px', fontWeight: 700, color: improved ? '#166534' : '#991b1b' }}>
                                {delta !== null ? (delta >= 0 ? '+' : '') + delta.toFixed(2) + ' dB' : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </details>
        </>
      )}
    </div>
  );
}