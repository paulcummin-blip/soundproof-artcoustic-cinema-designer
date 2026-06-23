/**
 * SingleModeAbsoluteCalibrationAudit — Diagnostic only.
 * No production changes. Does not affect live graph.
 *
 * Goal: Determine whether the remaining REW parity gap is caused by
 * absolute modal-level calibration.
 *
 * Fixed:
 *   - Reflections OFF
 *   - Direct OFF
 *   - One dominant mode only per target frequency
 *   - Flat 94 dB source reference
 *   - Current Q, TF formula, mode-shape coupling, modal source normalisation
 *
 * For each target frequency reports:
 *   - B44 modal-only SPL
 *   - REW benchmark SPL
 *   - Error (B44 - REW)
 *   - Required modal source dB to match REW exactly
 *   - Required modal scalar to match REW exactly
 *   - Required correction dB
 */

import React, { useState, useCallback } from 'react';
import {
  computeRoomModesLocal,
  estimateModeQLocal,
  modeShapeValueLocal,
  resonantTransfer,
} from '@/bass/core/modalCalculations.js';

// ─────────────────────────────────────────────────────────────────────────────
const C        = 343;
const FLAT_DB  = 94;
const REF_P    = 20e-6;
const MONO     = { fontFamily: 'monospace' };
const TARGET_HZ = [57, 70, 80, 85, 90];

const REW_BENCHMARK = [
  { hz: 57, db: 96.4 },
  { hz: 70, db: 93.2 },
  { hz: 80, db: 90.5 },
  { hz: 85, db: 89.6 },
  { hz: 90, db: 89.2 },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function normSA(sa) {
  const c = k => Math.max(0, Math.min(1, Number.isFinite(Number(sa?.[k])) ? Number(sa[k]) : 0.3));
  return { front: c('front'), back: c('back'), left: c('left'), right: c('right'), floor: c('floor'), ceiling: c('ceiling') };
}

function computeQ(mode, roomDims, nSA, axialQ) {
  const baseQ = mode.type === 'axial' ? axialQ : mode.type === 'tangential' ? 3.9 : 2.5;
  const absQ  = estimateModeQLocal({ roomDims, surfaceAbsorption: nSA, f0: mode.freq });
  return Math.max(1, Math.min(baseQ, absQ));
}

function toDB(pa) {
  return pa > 0 ? 20 * Math.log10(pa / REF_P) : null;
}

function rewSplAt(hz) {
  const pt = REW_BENCHMARK.find(p => p.hz === hz);
  return pt ? pt.db : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core: single-mode SPL at a given frequency
// ─────────────────────────────────────────────────────────────────────────────

function singleModeSpl({ hz, mode, roomDims, seat, sub, nSA, axialQ }) {
  const sourceP = Math.pow(10, FLAT_DB / 20);           // 94 dBSPL flat reference
  const subZ    = Number.isFinite(Number(sub?.z))  ? Number(sub.z)  : 0.35;
  const seatZ   = Number.isFinite(Number(seat?.z)) ? Number(seat.z) : 1.2;

  const q   = computeQ(mode, roomDims, nSA, axialQ);
  const ψs  = modeShapeValueLocal(mode, Number(sub.x),  Number(sub.y),  subZ,  roomDims);
  const ψr  = modeShapeValueLocal(mode, Number(seat.x), Number(seat.y), seatZ, roomDims);
  const { transferMag } = resonantTransfer(hz, mode.freq, q);

  // modal source normalisation × mode-shape coupling × TF magnitude
  const modalP = sourceP * Math.abs(ψs) * Math.abs(ψr) * transferMag;
  const spl    = toDB(modalP);

  return { q, ψs, ψr, transferMag, modalP, spl };
}

// ─────────────────────────────────────────────────────────────────────────────
// Find dominant mode nearest to target frequency
// ─────────────────────────────────────────────────────────────────────────────

function findDominantMode({ hz, modes, roomDims, seat, sub, nSA, axialQ }) {
  const subZ  = Number.isFinite(Number(sub?.z))  ? Number(sub.z)  : 0.35;
  const seatZ = Number.isFinite(Number(seat?.z)) ? Number(seat.z) : 1.2;

  const scored = modes.map(m => {
    const q   = computeQ(m, roomDims, nSA, axialQ);
    const ψs  = modeShapeValueLocal(m, Number(sub.x),  Number(sub.y),  subZ,  roomDims);
    const ψr  = modeShapeValueLocal(m, Number(seat.x), Number(seat.y), seatZ, roomDims);
    const { transferMag } = resonantTransfer(hz, m.freq, q);
    const score = Math.abs(ψs) * Math.abs(ψr) * transferMag;
    return { mode: m, score };
  });

  return scored.sort((a, b) => b.score - a.score)[0]?.mode ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main audit runner
// ─────────────────────────────────────────────────────────────────────────────

function runAudit({ roomDims, seat, sub, surfaceAbsorption, axialQ }) {
  const nSA   = normSA(surfaceAbsorption);
  const modes = computeRoomModesLocal({ ...roomDims, fMax: 200, c: C });

  const rows = TARGET_HZ.map(hz => {
    // Search within ±25 Hz
    const nearby = modes.filter(m => Math.abs(m.freq - hz) <= 25);
    const dom    = findDominantMode({ hz, modes: nearby, roomDims, seat, sub, nSA, axialQ });

    if (!dom) {
      return { hz, dom: null, error: 'No mode found within ±25 Hz' };
    }

    const { q, ψs, ψr, transferMag, modalP, spl } = singleModeSpl({
      hz, mode: dom, roomDims, seat, sub, nSA, axialQ,
    });

    const rewSpl   = rewSplAt(hz);
    const errorDb  = (spl != null && rewSpl != null) ? spl - rewSpl : null;

    // Required modal source level = current source + (-error) = 94 - error
    const reqSrcDb = (spl != null && rewSpl != null) ? FLAT_DB - errorDb : null;

    // Required modal scalar: what multiplier on modalP gives REW SPL?
    // rewSpl = 20·log10(modalP × scalar / REF_P)
    // scalar = 10^((rewSpl - spl)/20)
    const reqScalar = (errorDb != null) ? Math.pow(10, -errorDb / 20) : null;

    // Required correction = reqSrcDb - FLAT_DB = -errorDb
    const reqCorrDb = errorDb != null ? -errorDb : null;

    // Coupling = |ψs × ψr|
    const coupling = Math.abs(ψs) * Math.abs(ψr);

    return {
      hz,
      dom,
      q,
      coupling,
      spl,
      rewSpl,
      errorDb,
      reqSrcDb,
      reqScalar,
      reqCorrDb,
      modalP,
      transferMag,
    };
  });

  // Summary stats over rows with valid corrections
  const valid = rows.filter(r => r.reqCorrDb != null);
  const avg   = valid.length
    ? valid.reduce((s, r) => s + r.reqCorrDb, 0) / valid.length
    : null;
  const spread = valid.length > 1
    ? Math.max(...valid.map(r => r.reqCorrDb)) - Math.min(...valid.map(r => r.reqCorrDb))
    : null;

  return { rows, avg, spread };
}

// ─────────────────────────────────────────────────────────────────────────────
// UI helpers
// ─────────────────────────────────────────────────────────────────────────────

const TH  = { padding: '3px 7px', fontSize: 9, fontWeight: 700, ...MONO, background: '#1c1917', color: '#a8a29e', borderBottom: '2px solid #292524', textAlign: 'right', whiteSpace: 'nowrap' };
const THL = { ...TH, textAlign: 'left' };
const TD  = { padding: '2px 7px', fontSize: 9, ...MONO, textAlign: 'right', borderBottom: '1px solid #1c1917' };
const TDL = { ...TD, textAlign: 'left' };

const fmt  = (v, d = 2) => Number.isFinite(Number(v)) ? Number(v).toFixed(d) : '—';
const fmtS = (v, d = 4) => Number.isFinite(Number(v)) ? Number(v).toFixed(d) : '—';
const fmtE = v => {
  if (!Number.isFinite(Number(v))) return '—';
  const s = Number(v) >= 0 ? '+' : '';
  return s + Number(v).toFixed(2) + ' dB';
};

const errColor = v => {
  if (!Number.isFinite(Number(v))) return '#57534e';
  const a = Math.abs(v);
  if (a > 6) return '#f87171';
  if (a > 3) return '#fbbf24';
  return '#4ade80';
};

const corrColor = v => {
  if (!Number.isFinite(Number(v))) return '#57534e';
  const a = Math.abs(v);
  if (a > 6) return '#f87171';
  if (a > 3) return '#fbbf24';
  return '#a3e635';
};

// ─────────────────────────────────────────────────────────────────────────────
// Results table
// ─────────────────────────────────────────────────────────────────────────────

function ResultsTable({ rows }) {
  return (
    <div style={{ overflowX: 'auto', marginBottom: 12 }}>
      <table style={{ borderCollapse: 'collapse', minWidth: 860 }}>
        <thead>
          <tr>
            <th style={{ ...TH,  minWidth: 52  }}>Target Hz</th>
            <th style={{ ...THL, minWidth: 72  }}>Mode</th>
            <th style={{ ...TH,  minWidth: 56  }}>f₀ (Hz)</th>
            <th style={{ ...TH,  minWidth: 44  }}>Q</th>
            <th style={{ ...TH,  minWidth: 70  }}>Coupling</th>
            <th style={{ ...TH,  minWidth: 76  }}>B44 SPL</th>
            <th style={{ ...TH,  minWidth: 72  }}>REW SPL</th>
            <th style={{ ...TH,  minWidth: 72  }}>Error</th>
            <th style={{ ...TH,  minWidth: 84  }}>Req src dB</th>
            <th style={{ ...TH,  minWidth: 80  }}>Req scalar</th>
            <th style={{ ...TH,  minWidth: 84  }}>Req corr dB</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            if (!r.dom) {
              return (
                <tr key={i}>
                  <td style={{ ...TD, color: '#fbbf24' }}>{r.hz}</td>
                  <td colSpan={10} style={{ ...TDL, color: '#78716c' }}>{r.error}</td>
                </tr>
              );
            }
            const modeLabel = `(${r.dom.nx},${r.dom.ny},${r.dom.nz})`;
            return (
              <tr key={i}>
                <td style={{ ...TD,  color: '#fbbf24', fontWeight: 700 }}>{r.hz}</td>
                <td style={{ ...TDL, color: '#d6d3d1' }}>{modeLabel}</td>
                <td style={{ ...TD,  color: '#78716c' }}>{fmt(r.dom.freq, 2)}</td>
                <td style={{ ...TD,  color: '#d6d3d1' }}>{fmt(r.q, 1)}</td>
                <td style={{ ...TD,  color: '#a8a29e' }}>{fmtS(r.coupling, 4)}</td>
                <td style={{ ...TD,  color: '#60a5fa', fontWeight: 700 }}>{fmt(r.spl, 2)} dB</td>
                <td style={{ ...TD,  color: '#4ade80', fontWeight: 700 }}>{fmt(r.rewSpl, 2)} dB</td>
                <td style={{ ...TD,  color: errColor(r.errorDb), fontWeight: 700 }}>{fmtE(r.errorDb)}</td>
                <td style={{ ...TD,  color: '#d6d3d1' }}>{fmt(r.reqSrcDb, 2)} dB</td>
                <td style={{ ...TD,  color: '#a8a29e' }}>{fmtS(r.reqScalar, 4)}×</td>
                <td style={{ ...TD,  color: corrColor(r.reqCorrDb), fontWeight: 700 }}>{fmtE(r.reqCorrDb)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary + Verdict
// ─────────────────────────────────────────────────────────────────────────────

function SummaryVerdict({ avg, spread }) {
  const consistent     = spread != null && spread <= 3.0;   // within ±1.5 dB total range
  const freqDependent  = spread != null && spread > 6.0;    // varies by more than ±3 dB either side

  let verdictText, verdictColor;
  if (freqDependent) {
    verdictText  = 'Remaining gap is frequency-dependent and not a simple modal-level offset.';
    verdictColor = '#f87171';
  } else if (consistent) {
    verdictText  = 'Remaining gap is a fixed modal-level calibration offset.';
    verdictColor = '#4ade80';
  } else {
    verdictText  = 'Correction is partially consistent — mixed calibration and frequency-dependent error.';
    verdictColor = '#fbbf24';
  }

  return (
    <div style={{ marginTop: 8 }}>
      {/* Summary row */}
      <div style={{ display: 'flex', gap: 24, marginBottom: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 9, ...MONO, color: '#a8a29e' }}>
          <span style={{ color: '#57534e' }}>Avg required correction: </span>
          <span style={{ color: '#d6d3d1', fontWeight: 700 }}>
            {avg != null ? (avg >= 0 ? '+' : '') + avg.toFixed(2) + ' dB' : '—'}
          </span>
        </div>
        <div style={{ fontSize: 9, ...MONO, color: '#a8a29e' }}>
          <span style={{ color: '#57534e' }}>Correction spread (max−min): </span>
          <span style={{ color: spread != null ? (consistent ? '#4ade80' : freqDependent ? '#f87171' : '#fbbf24') : '#57534e', fontWeight: 700 }}>
            {spread != null ? spread.toFixed(2) + ' dB' : '—'}
          </span>
          {spread != null && (
            <span style={{ color: '#57534e', marginLeft: 6 }}>
              (±1.5 dB threshold: {spread <= 3 ? '✓ within' : '✗ outside'})
            </span>
          )}
        </div>
        <div style={{ fontSize: 9, ...MONO, color: '#a8a29e' }}>
          <span style={{ color: '#57534e' }}>Consistent within ±1.5 dB: </span>
          <span style={{ color: consistent ? '#4ade80' : '#f87171', fontWeight: 700 }}>
            {spread != null ? (consistent ? 'YES' : 'NO') : '—'}
          </span>
        </div>
      </div>

      {/* Verdict */}
      <div style={{
        padding: '8px 12px', background: '#1c1917', borderRadius: 6,
        border: `1px solid ${verdictColor}`, fontSize: 9, ...MONO, lineHeight: 1.9,
      }}>
        <div style={{ fontWeight: 700, fontSize: 10, color: verdictColor, marginBottom: 4 }}>Verdict</div>
        <div style={{ color: verdictColor, fontWeight: 700 }}>"{verdictText}"</div>
        <div style={{ color: '#57534e', fontSize: 8, marginTop: 4 }}>
          Thresholds: ±1.5 dB spread → fixed calibration offset · &gt;±3 dB spread → frequency-dependent gap.
          Diagnostic only — no production changes.
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function SingleModeAbsoluteCalibrationAudit({
  roomDims, seat, sub, surfaceAbsorption, activeSettings,
}) {
  const [result,  setResult]  = useState(null);
  const [running, setRunning] = useState(false);
  const [error,   setError]   = useState(null);

  const axialQ = Number.isFinite(activeSettings?.axialQ) ? activeSettings.axialQ : 4.0;

  const canRun = !!(
    roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM &&
    seat?.x != null && seat?.y != null &&
    sub?.x  != null && sub?.y  != null
  );

  const run = useCallback(async () => {
    if (!canRun) return;
    setRunning(true); setError(null); setResult(null);
    await new Promise(r => setTimeout(r, 0));
    try {
      setResult(runAudit({ roomDims, seat, sub, surfaceAbsorption, axialQ }));
    } catch (e) {
      setError(e.message || 'Unknown error');
    }
    setRunning(false);
  }, [roomDims, seat, sub, surfaceAbsorption, axialQ, canRun]);

  return (
    <div style={{ marginTop: 12, border: '1px solid #292524', borderRadius: 8, background: '#0c0a09', padding: '10px 12px' }}>
      {/* Header */}
      <div style={{ fontWeight: 700, color: '#d6d3d1', fontSize: 11, ...MONO, marginBottom: 3 }}>
        Single Mode Absolute Calibration Audit
        <span style={{ fontWeight: 400, color: '#44403c', marginLeft: 10, fontSize: 10 }}>
          diagnostic only · no production changes · does not affect live graph
        </span>
      </div>
      <div style={{ fontSize: 9, color: '#57534e', ...MONO, marginBottom: 8, lineHeight: 1.8 }}>
        Isolates one dominant mode per target frequency (reflections OFF, direct OFF, all other modes OFF).
        Compares modal-only SPL against REW benchmark to determine whether the remaining parity gap
        is a fixed absolute calibration offset or a frequency-dependent shape error.
      </div>

      {!canRun && (
        <div style={{ fontSize: 10, color: '#fbbf24', ...MONO, marginBottom: 6 }}>
          ⚠ Need room dims, seat, and sub configured.
        </div>
      )}

      <button
        onClick={run}
        disabled={running || !canRun}
        style={{
          height: 28, padding: '0 14px', borderRadius: 6,
          border: '1px solid #57534e', background: running ? '#1c1917' : '#292524',
          color: running || !canRun ? '#57534e' : '#d6d3d1',
          fontSize: 11, ...MONO, cursor: running || !canRun ? 'not-allowed' : 'pointer',
          fontWeight: 700, marginBottom: 10,
        }}
      >
        {running ? 'Computing…' : result ? 'Re-run Calibration Audit' : 'Run Single Mode Calibration Audit'}
      </button>

      {error && (
        <div style={{ fontSize: 10, color: '#f87171', ...MONO, marginBottom: 8 }}>⚠ {error}</div>
      )}

      {result && (
        <>
          <div style={{ fontSize: 9, color: '#57534e', ...MONO, marginBottom: 6 }}>
            Fixed: reflections OFF · direct OFF · one dominant mode only · flat 94 dB source · current Q + TF + coupling
          </div>
          <ResultsTable rows={result.rows} />
          <SummaryVerdict avg={result.avg} spread={result.spread} />
        </>
      )}
    </div>
  );
}