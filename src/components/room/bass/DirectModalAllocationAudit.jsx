/**
 * DirectModalAllocationAudit — Diagnostic only. No production changes.
 * Does not affect live graph.
 *
 * Determines whether the REW parity gap originates from how direct and modal
 * fields are combined. Runs 5 allocation variants over 20–200 Hz and computes
 * MAE vs REW benchmark for each, plus parity sensitivity (ΔMAE per ±1 dB
 * of direct or modal gain).
 *
 * Variants:
 *   A) Production  — direct ×1.0 + modal ×1.0
 *   B) Direct only — modal removed (×0.0)
 *   C) Modal only  — direct removed (×0.0)
 *   D) Direct ×1.5 + modal ×1.0
 *   E) Direct ×1.0 + modal ×0.5
 *
 * Sensitivity:
 *   ΔMAE per +1 dB direct  → (MAE_D_boost − MAE_A)  where D_boost = direct ×√2
 *   ΔMAE per -1 dB modal   → (MAE_M_reduce − MAE_A) where M_reduce = modal ×1/√2
 */

import React, { useState, useCallback } from 'react';
import {
  computeRoomModesLocal,
  estimateModeQLocal,
  modeShapeValueLocal,
  resonantTransfer,
} from '@/bass/core/modalCalculations.js';

// ── Constants ─────────────────────────────────────────────────────────────────
const C         = 343;
const MONO      = { fontFamily: 'monospace' };
const FLAT_DB   = 94;
const REF_P     = 20e-6;
const FREQ_STEP = 0.5;

const REW_BENCHMARK = [
  { hz: 20, db: 92.5 }, { hz: 25, db: 94.1 }, { hz: 30, db: 95.2 }, { hz: 35, db: 95.8 },
  { hz: 40, db: 96.2 }, { hz: 45, db: 96.5 }, { hz: 50, db: 96.6 }, { hz: 55, db: 96.4 },
  { hz: 60, db: 95.8 }, { hz: 65, db: 94.7 }, { hz: 70, db: 93.2 }, { hz: 75, db: 91.8 },
  { hz: 80, db: 90.5 }, { hz: 85, db: 89.6 }, { hz: 90, db: 89.2 }, { hz: 95, db: 89.4 },
  { hz: 100, db: 90.1 },
];

const SPOT_HZ = [57, 70, 80, 85, 90];

// ── Utilities ─────────────────────────────────────────────────────────────────
function normSA(sa) {
  const c = k => Math.max(0, Math.min(1, Number.isFinite(Number(sa?.[k])) ? Number(sa[k]) : 0.3));
  return { front: c('front'), back: c('back'), left: c('left'), right: c('right'), floor: c('floor'), ceiling: c('ceiling') };
}

function qForType(type, axialQ) {
  if (type === 'axial')      return axialQ;
  if (type === 'tangential') return 3.9;
  return 2.5;
}

function linspace(lo, hi, step) {
  const out = [];
  for (let f = lo; f <= hi + 1e-9; f += step) out.push(f);
  return out;
}

/**
 * Compute direct-field pressure at the seat from a point source sub.
 * Simple free-field 1/r model.
 */
function directPressure(hz, sub, seat, sourceP) {
  const dx = Number(seat.x) - Number(sub.x);
  const dy = Number(seat.y) - Number(sub.y);
  const dz = (Number(seat.z) || 1.2) - (Number(sub.z) || 0.35);
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const r = Math.max(dist, 0.1);
  return sourceP / r;
}

/**
 * Compute modal pressure sum at a single frequency.
 * Returns the total modal pressure (linear Pa-equivalent).
 */
function modalPressureAt(hz, rawModes, roomDims, seat, sub, nSA, axialQ) {
  const { widthM, lengthM, heightM } = roomDims;
  const subZ  = Number.isFinite(Number(sub?.z))  ? Number(sub.z)  : 0.35;
  const seatZ = Number.isFinite(Number(seat?.z)) ? Number(seat.z) : 1.2;
  const sourceP = Math.pow(10, FLAT_DB / 20);
  let sumP = 0;
  for (const m of rawModes) {
    const baseQ = qForType(m.type, axialQ);
    const absQ  = estimateModeQLocal({ roomDims, surfaceAbsorption: nSA, f0: m.freq });
    const q     = Math.max(1, Math.min(baseQ, absQ));
    const ψs    = modeShapeValueLocal(m, Number(sub.x),  Number(sub.y),  subZ,  { widthM, lengthM, heightM });
    const ψr    = modeShapeValueLocal(m, Number(seat.x), Number(seat.y), seatZ, { widthM, lengthM, heightM });
    const { transferMag } = resonantTransfer(hz, m.freq, q);
    sumP += Math.abs(ψs * ψr) * sourceP * transferMag;
  }
  return sumP;
}

/**
 * Build full 20–200 Hz series for a given direct/modal scale pair.
 * directScale: multiplier for the direct field
 * modalScale:  multiplier for the modal sum
 */
function buildSeries(roomDims, seat, sub, sa, axialQ, directScale, modalScale) {
  const { widthM, lengthM, heightM } = roomDims;
  const nSA = normSA(sa);
  const sourceP = Math.pow(10, FLAT_DB / 20);
  const rawModes = computeRoomModesLocal({ widthM, lengthM, heightM, fMax: 200, c: C });
  const freqs = linspace(20, 200, FREQ_STEP);

  return freqs.map(hz => {
    const dP = directPressure(hz, sub, seat, sourceP) * directScale;
    const mP = modalPressureAt(hz, rawModes, roomDims, seat, sub, nSA, axialQ) * modalScale;
    const totalP = dP + mP;
    return { hz, db: totalP > 0 ? 20 * Math.log10(totalP / REF_P) : null };
  });
}

function computeMetrics(series) {
  const errors = REW_BENCHMARK.map(pt => {
    const s = series.find(d => Math.abs(d.hz - pt.hz) < 1);
    return (s && s.db != null) ? { hz: pt.hz, err: Math.abs(s.db - pt.db) } : null;
  }).filter(Boolean);

  const mae = errors.length ? errors.reduce((a, b) => a + b.err, 0) / errors.length : null;
  const worst = errors.length ? errors.reduce((a, b) => b.err > a.err ? b : a) : null;

  const spotErrors = {};
  for (const hz of SPOT_HZ) {
    const s = series.find(d => Math.abs(d.hz - hz) < 1);
    const bm = REW_BENCHMARK.find(p => p.hz === hz) ?? REW_BENCHMARK.reduce((a, b) => Math.abs(b.hz - hz) < Math.abs(a.hz - hz) ? b : a);
    spotErrors[hz] = (s && s.db != null && bm) ? (s.db - bm.db) : null; // signed
  }

  return { mae, worstErr: worst?.err ?? null, worstHz: worst?.hz ?? null, spotErrors };
}

function runAudit(roomDims, seat, sub, sa, axialQ) {
  const variants = [
    { id: 'A', label: 'Production (direct ×1.0 + modal ×1.0)', dScale: 1.0,         mScale: 1.0,         color: '#60a5fa' },
    { id: 'B', label: 'Direct only (modal ×0)',                 dScale: 1.0,         mScale: 0.0,         color: '#4ade80' },
    { id: 'C', label: 'Modal only (direct ×0)',                 dScale: 0.0,         mScale: 1.0,         color: '#fb923c' },
    { id: 'D', label: 'Direct ×1.5 + modal ×1.0',              dScale: 1.5,         mScale: 1.0,         color: '#a78bfa' },
    { id: 'E', label: 'Direct ×1.0 + modal ×0.5',              dScale: 1.0,         mScale: 0.5,         color: '#f472b6' },
  ];

  const results = variants.map(v => {
    const series = buildSeries(roomDims, seat, sub, sa, axialQ, v.dScale, v.mScale);
    const metrics = computeMetrics(series);
    return { ...v, ...metrics, series };
  });

  // Sensitivity: +1 dB direct = ×√2 ≈ ×1.122, −1 dB modal = ×1/√2 ≈ ×0.891
  const maeA = results[0].mae;
  const dBoostSeries   = buildSeries(roomDims, seat, sub, sa, axialQ, Math.SQRT2, 1.0);
  const mReduceSeries  = buildSeries(roomDims, seat, sub, sa, axialQ, 1.0, 1 / Math.SQRT2);
  const maeD1          = computeMetrics(dBoostSeries).mae;
  const maeM1          = computeMetrics(mReduceSeries).mae;

  const sensitivityDirect = (maeD1 != null && maeA != null) ? maeD1 - maeA : null;
  const sensitivityModal  = (maeM1 != null && maeA != null) ? maeM1 - maeA : null;

  return { results, sensitivityDirect, sensitivityModal };
}

// ── Styles ────────────────────────────────────────────────────────────────────
const TH  = { padding: '3px 7px', fontSize: 9, fontWeight: 700, ...MONO, background: '#1c1917', color: '#a8a29e', borderBottom: '2px solid #292524', textAlign: 'right', whiteSpace: 'nowrap' };
const THL = { ...TH, textAlign: 'left' };
const TD  = { padding: '2px 7px', fontSize: 9, ...MONO, textAlign: 'right', borderBottom: '1px solid #1c1917' };
const TDL = { ...TD, textAlign: 'left' };

const fmtDb   = v => Number.isFinite(Number(v)) ? (Number(v) >= 0 ? '+' : '') + Number(v).toFixed(2) + ' dB' : '—';
const fmtMae  = v => Number.isFinite(Number(v)) ? Number(v).toFixed(3) + ' dB' : '—';
const fmt1    = v => Number.isFinite(Number(v)) ? Number(v).toFixed(1) : '—';

// ── Sub-components ────────────────────────────────────────────────────────────

function VariantsTable({ results }) {
  const maeA = results[0]?.mae;
  return (
    <div style={{ overflowX: 'auto', marginBottom: 12 }}>
      <table style={{ borderCollapse: 'collapse', minWidth: 860 }}>
        <thead>
          <tr>
            <th style={{ ...THL, minWidth: 24 }}>ID</th>
            <th style={{ ...THL, minWidth: 240 }}>Variant</th>
            <th style={{ ...TH,  minWidth: 70  }}>MAE (dB)</th>
            <th style={{ ...TH,  minWidth: 72  }}>ΔvsProd</th>
            <th style={{ ...TH,  minWidth: 62  }}>Worst err</th>
            <th style={{ ...TH,  minWidth: 52  }}>@ Hz</th>
            {SPOT_HZ.map(hz => <th key={hz} style={{ ...TH, minWidth: 62 }}>{hz} Hz</th>)}
          </tr>
        </thead>
        <tbody>
          {results.map(v => {
            const delta = (v.mae != null && maeA != null && v.id !== 'A') ? v.mae - maeA : null;
            const isProd = v.id === 'A';
            return (
              <tr key={v.id} style={{ borderBottom: '1px solid #1c1917', background: isProd ? '#0f0d0b' : 'transparent' }}>
                <td style={{ ...TDL, color: v.color, fontWeight: 700 }}>{v.id}</td>
                <td style={{ ...TDL, color: '#d6d3d1', fontWeight: isProd ? 700 : 400 }}>{v.label}</td>
                <td style={{ ...TD,  color: '#d6d3d1', fontWeight: isProd ? 700 : 400 }}>{fmtMae(v.mae)}</td>
                <td style={{ ...TD,  color: delta == null ? '#57534e' : delta < -1 ? '#4ade80' : delta > 1 ? '#f87171' : '#78716c', fontWeight: 700 }}>
                  {isProd ? '(baseline)' : delta != null ? (delta >= 0 ? '+' : '') + delta.toFixed(3) + ' dB' : '—'}
                </td>
                <td style={{ ...TD,  color: v.worstErr != null && v.worstErr > 5 ? '#f87171' : '#78716c' }}>
                  {fmtMae(v.worstErr)}
                </td>
                <td style={{ ...TD,  color: '#57534e' }}>{fmt1(v.worstHz)}</td>
                {SPOT_HZ.map(hz => {
                  const err = v.spotErrors?.[hz];
                  const col = err == null ? '#57534e' : Math.abs(err) < 1 ? '#4ade80' : Math.abs(err) > 4 ? '#f87171' : '#fbbf24';
                  return <td key={hz} style={{ ...TD, color: col }}>{fmtDb(err)}</td>;
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SensitivityPanel({ sensitivityDirect, sensitivityModal }) {
  const directIsDominant = sensitivityDirect != null && sensitivityModal != null
    ? Math.abs(sensitivityDirect) > Math.abs(sensitivityModal)
    : null;

  return (
    <div style={{ padding: '8px 12px', background: '#1c1917', borderRadius: 6, fontSize: 9, ...MONO, lineHeight: 1.9, marginBottom: 10 }}>
      <div style={{ fontWeight: 700, color: '#60a5fa', marginBottom: 6, fontSize: 10 }}>Parity Sensitivity</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 24px', marginBottom: 6 }}>
        <div>
          <span style={{ color: '#57534e' }}>ΔMAE per +1 dB direct: </span>
          <span style={{ color: sensitivityDirect != null ? (Math.abs(sensitivityDirect) > 1 ? '#fbbf24' : '#4ade80') : '#57534e', fontWeight: 700 }}>
            {sensitivityDirect != null ? (sensitivityDirect >= 0 ? '+' : '') + sensitivityDirect.toFixed(3) + ' dB' : '—'}
          </span>
        </div>
        <div>
          <span style={{ color: '#57534e' }}>ΔMAE per −1 dB modal: </span>
          <span style={{ color: sensitivityModal != null ? (Math.abs(sensitivityModal) > 1 ? '#fbbf24' : '#4ade80') : '#57534e', fontWeight: 700 }}>
            {sensitivityModal != null ? (sensitivityModal >= 0 ? '+' : '') + sensitivityModal.toFixed(3) + ' dB' : '—'}
          </span>
        </div>
        {directIsDominant != null && (
          <div style={{ gridColumn: '1 / -1', color: '#d6d3d1' }}>
            Larger influence: <span style={{ color: '#fbbf24', fontWeight: 700 }}>
              {directIsDominant ? 'direct field' : 'modal field'}
            </span>
          </div>
        )}
      </div>
      <div style={{ fontSize: 8, color: '#44403c' }}>
        +1 dB direct = ×√2 ≈ ×1.122 · −1 dB modal = ×(1/√2) ≈ ×0.891 · both evaluated against REW benchmark
      </div>
    </div>
  );
}

function VerdictPanel({ results, sensitivityDirect, sensitivityModal }) {
  const maeA = results[0]?.mae;
  const maeD = results[3]?.mae; // D: direct ×1.5
  const maeE = results[4]?.mae; // E: modal ×0.5

  const directBoostHelps = maeD != null && maeA != null && maeD < maeA;
  const modalReduceHelps = maeE != null && maeA != null && maeE < maeA;
  const bothHelp = directBoostHelps && modalReduceHelps;

  const sensLarge = (
    (sensitivityDirect != null && Math.abs(sensitivityDirect) >= 1) ||
    (sensitivityModal  != null && Math.abs(sensitivityModal)  >= 1)
  );
  const sensSmall = (
    sensitivityDirect != null && sensitivityModal != null &&
    Math.abs(sensitivityDirect) < 1 && Math.abs(sensitivityModal) < 1
  );

  const isPrimaryDriver = bothHelp && sensLarge;

  return (
    <div style={{ padding: '8px 12px', background: '#1c1917', borderRadius: 6, border: `1px solid ${isPrimaryDriver ? '#4ade80' : '#292524'}`, fontSize: 9, ...MONO, lineHeight: 1.9 }}>
      <div style={{ fontWeight: 700, color: isPrimaryDriver ? '#4ade80' : '#60a5fa', marginBottom: 4, fontSize: 10 }}>
        Verdict
      </div>

      {isPrimaryDriver && (
        <div style={{ color: '#4ade80', fontWeight: 700, marginBottom: 4 }}>
          ✓ "Direct/modal allocation architecture is the dominant remaining parity suspect."
          <div style={{ fontWeight: 400, color: '#78716c', marginTop: 2 }}>
            Boosting direct (+1.5×) improves MAE by {(maeA - maeD).toFixed(3)} dB.
            Halving modal (×0.5) improves MAE by {(maeA - maeE).toFixed(3)} dB.
            Both changes consistently improve parity.
          </div>
        </div>
      )}

      {sensSmall && (
        <div style={{ color: '#d6d3d1', fontWeight: 700, marginBottom: 4 }}>
          "Parity gap originates elsewhere."
          <span style={{ fontWeight: 400, color: '#78716c' }}>
            {' '}Direct sensitivity = {sensitivityDirect?.toFixed(3)} dB · modal sensitivity = {sensitivityModal?.toFixed(3)} dB.
            Both &lt;1 dB — allocation is not the driver.
          </span>
        </div>
      )}

      {!isPrimaryDriver && !sensSmall && (
        <div style={{ color: '#fbbf24' }}>
          Mixed result — one allocation change helps, the other does not.
          <div style={{ color: '#78716c', fontWeight: 400, marginTop: 2 }}>
            Direct ×1.5 ΔMAE = {maeD != null && maeA != null ? ((maeD - maeA) >= 0 ? '+' : '') + (maeD - maeA).toFixed(3) : '—'} dB ·
            Modal ×0.5 ΔMAE = {maeE != null && maeA != null ? ((maeE - maeA) >= 0 ? '+' : '') + (maeE - maeA).toFixed(3) : '—'} dB.
            Allocation is a partial contributor — investigate direct/modal balance further.
          </div>
        </div>
      )}

      <div style={{ color: '#44403c', fontSize: 8, marginTop: 4 }}>
        Thresholds: both D and E improve MAE + sensitivity ≥1 dB → primary driver · sensitivity &lt;1 dB both → gap elsewhere
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function DirectModalAllocationAudit({ roomDims, seat, sub, surfaceAbsorption, activeSettings }) {
  const [result,  setResult]  = useState(null);
  const [running, setRunning] = useState(false);
  const [error,   setError]   = useState(null);

  const axialQ = Number.isFinite(activeSettings?.axialQ) ? activeSettings.axialQ : 4.0;

  const canRun = !!(
    roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM &&
    seat?.x != null && seat?.y != null && sub?.x != null && sub?.y != null
  );

  const run = useCallback(async () => {
    if (!canRun) return;
    setRunning(true); setError(null); setResult(null);
    await new Promise(r => setTimeout(r, 0));
    try {
      const r = runAudit(roomDims, seat, sub, surfaceAbsorption, axialQ);
      setResult(r);
    } catch (e) {
      setError(e.message || 'Unknown error');
    }
    setRunning(false);
  }, [roomDims, seat, sub, surfaceAbsorption, axialQ, canRun]);

  return (
    <div style={{ marginTop: 12, border: '1px solid #292524', borderRadius: 8, background: '#0c0a09', padding: '10px 12px' }}>

      <div style={{ fontWeight: 700, color: '#d6d3d1', fontSize: 11, ...MONO, marginBottom: 3 }}>
        Direct–Modal Allocation Architecture Audit
        <span style={{ fontWeight: 400, color: '#44403c', marginLeft: 10, fontSize: 10 }}>
          diagnostic only · no production changes · does not affect live graph
        </span>
      </div>
      <div style={{ fontSize: 9, color: '#57534e', ...MONO, marginBottom: 8, lineHeight: 1.8 }}>
        Evaluates 5 direct/modal allocation variants and parity sensitivity (ΔMAE per ±1 dB per path)
        to determine whether the REW parity gap is driven by direct/modal allocation architecture.
      </div>

      {!canRun && <div style={{ fontSize: 10, color: '#fbbf24', ...MONO, marginBottom: 6 }}>⚠ Need room, seat, and sub configured.</div>}

      <button
        onClick={run}
        disabled={running || !canRun}
        style={{
          height: 28, padding: '0 14px', borderRadius: 6,
          border: '1px solid #57534e', background: running ? '#1c1917' : '#292524',
          color: running || !canRun ? '#57534e' : '#d6d3d1', fontSize: 11, ...MONO,
          cursor: running || !canRun ? 'not-allowed' : 'pointer', fontWeight: 700, marginBottom: 10,
        }}
      >
        {running ? 'Computing…' : result ? 'Re-run Allocation Audit' : 'Run Direct–Modal Allocation Architecture Audit'}
      </button>

      {error && <div style={{ fontSize: 10, color: '#f87171', ...MONO, marginBottom: 8 }}>⚠ {error}</div>}

      {result && (
        <>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#60a5fa', ...MONO, marginBottom: 4 }}>
            Variant MAE comparison (20–200 Hz vs REW benchmark)
          </div>
          <VariantsTable results={result.results} />
          <SensitivityPanel sensitivityDirect={result.sensitivityDirect} sensitivityModal={result.sensitivityModal} />
          <VerdictPanel results={result.results} sensitivityDirect={result.sensitivityDirect} sensitivityModal={result.sensitivityModal} />
        </>
      )}
    </div>
  );
}