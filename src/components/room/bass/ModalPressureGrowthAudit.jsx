/**
 * ModalPressureGrowthAudit — Diagnostic only. No production changes.
 * Does not affect the live graph.
 *
 * Goal: identify where modal pressure becomes too large before final
 * direct/modal summation.
 *
 * For each target frequency the dominant mode is traced through:
 *   Stage 1 — raw source pressure (flat 94 dBSPL)
 *   Stage 2 — after modal source normalisation  (ψ_source scaling)
 *   Stage 3 — after mode-shape coupling at receiver (ψ_source × ψ_receiver)
 *   Stage 4 — after transfer-function magnitude
 *   Stage 5 — after modal summation (top 5 modes incoherent sum)
 *   Stage 6 — modal SPL conversion (20·log10)
 *   Stage 7 — before final direct/modal combination (modal leg only)
 *
 * Override sweeps:
 *   A — transfer-function ×0.5
 *   B — modal source normalisation ×0.5
 *   C — modal summation result ×0.5
 */

import React, { useState, useCallback } from 'react';
import {
  computeRoomModesLocal,
  estimateModeQLocal,
  modeShapeValueLocal,
  resonantTransfer,
} from '@/bass/core/modalCalculations.js';

// ─────────────────────────────────────────────────────────────────────────────
const C       = 343;
const FLAT_DB = 94;
const REF_P   = 20e-6;
const MONO    = { fontFamily: 'monospace' };
const TARGET_HZ = [57, 70, 80, 85, 90];

const REW_BENCHMARK = [
  { hz: 20, db: 92.5 }, { hz: 25, db: 94.1 }, { hz: 30, db: 95.2 }, { hz: 35, db: 95.8 },
  { hz: 40, db: 96.2 }, { hz: 45, db: 96.5 }, { hz: 50, db: 96.6 }, { hz: 55, db: 96.4 },
  { hz: 60, db: 95.8 }, { hz: 65, db: 94.7 }, { hz: 70, db: 93.2 }, { hz: 75, db: 91.8 },
  { hz: 80, db: 90.5 }, { hz: 85, db: 89.6 }, { hz: 90, db: 89.2 }, { hz: 95, db: 89.4 },
  { hz: 100, db: 90.1 },
];
const FREQ_STEP = 0.5;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function normSA(sa) {
  const c = k => Math.max(0, Math.min(1, Number.isFinite(Number(sa?.[k])) ? Number(sa[k]) : 0.3));
  return { front: c('front'), back: c('back'), left: c('left'), right: c('right'), floor: c('floor'), ceiling: c('ceiling') };
}

function toDB(linear) {
  return linear > 0 ? 20 * Math.log10(linear / REF_P) : null;
}

function growthDB(curr, prev) {
  if (!Number.isFinite(curr) || !Number.isFinite(prev) || prev === 0) return null;
  return 20 * Math.log10(curr / prev);
}

function linspace(lo, hi, step) {
  const out = [];
  for (let f = lo; f <= hi + 1e-9; f += step) out.push(f);
  return out;
}

function computeQ(mode, roomDims, nSA, axialQ) {
  const baseQ = mode.type === 'axial' ? axialQ : mode.type === 'tangential' ? 3.9 : 2.5;
  const absQ  = estimateModeQLocal({ roomDims, surfaceAbsorption: nSA, f0: mode.freq });
  return Math.max(1, Math.min(baseQ, absQ));
}

// ─────────────────────────────────────────────────────────────────────────────
// Core: trace 7 stages for a single frequency
// ─────────────────────────────────────────────────────────────────────────────

function traceFrequency({ hz, modes, roomDims, seat, sub, nSA, axialQ,
  tfScale = 1, srcNormScale = 1, sumScale = 1,
}) {
  const sourceP = Math.pow(10, FLAT_DB / 20);  // raw source Pa-equivalent
  const subZ    = Number.isFinite(Number(sub?.z))  ? Number(sub.z)  : 0.35;
  const seatZ   = Number.isFinite(Number(seat?.z)) ? Number(seat.z) : 1.2;
  const dims    = roomDims;

  // Stage 1 — raw source pressure
  const stage1 = sourceP;

  // Compute per-mode contributions
  const perMode = modes.map(m => {
    const q   = computeQ(m, dims, nSA, axialQ);
    const ψs  = modeShapeValueLocal(m, Number(sub.x),  Number(sub.y),  subZ,  dims);
    const ψr  = modeShapeValueLocal(m, Number(seat.x), Number(seat.y), seatZ, dims);
    const { transferMag } = resonantTransfer(hz, m.freq, q);

    // Stage 2 — after source normalisation: sourceP × |ψ_source|
    const afterSrcNorm   = sourceP * Math.abs(ψs) * srcNormScale;
    // Stage 3 — after mode-shape coupling: × |ψ_receiver|
    const afterCoupling  = afterSrcNorm * Math.abs(ψr);
    // Stage 4 — after transfer-function magnitude: × TF
    const afterTF        = afterCoupling * (transferMag * tfScale);
    // raw contribution to sum
    const contrib        = Math.abs(ψs) * Math.abs(ψr) * sourceP * transferMag * srcNormScale * tfScale;

    return { mode: m, q, ψs, ψr, transferMag, afterSrcNorm, afterCoupling, afterTF, contrib };
  });

  // Sort by contribution descending, take top 5 for stage 5
  const sorted = [...perMode].sort((a, b) => b.contrib - a.contrib);
  const top5   = sorted.slice(0, 5);

  // Stage 5 — incoherent (RSS) sum over top 5
  const stage5 = Math.sqrt(top5.reduce((acc, m) => acc + m.contrib * m.contrib, 0)) * sumScale;

  // Stage 6 — dB conversion
  const stage6db = toDB(stage5);

  // Stage 7 — same as stage 5 (modal leg before summation with direct)
  const stage7 = stage5;

  // Dominant mode is top5[0]
  const dom = top5[0];

  return {
    hz,
    stage1, // Pa
    stage2: dom ? dom.afterSrcNorm : null,
    stage3: dom ? dom.afterCoupling : null,
    stage4: dom ? dom.afterTF : null,
    stage5,
    stage6db,
    stage7,
    dominantMode: dom?.mode ?? null,
    dominantTF: dom?.transferMag ?? null,
    dominantQ: dom?.q ?? null,
    top5,
    modeCount: perMode.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Full-band MAE computation for override sweeps
// ─────────────────────────────────────────────────────────────────────────────

function computeFullBandSeries({ modes, roomDims, seat, sub, nSA, axialQ,
  tfScale = 1, srcNormScale = 1, sumScale = 1,
}) {
  const freqs = linspace(20, 200, FREQ_STEP);
  return freqs.map(hz => {
    const r = traceFrequency({ hz, modes, roomDims, seat, sub, nSA, axialQ, tfScale, srcNormScale, sumScale });
    return { hz, db: r.stage6db };
  });
}

function computeMAE(series) {
  const errors = REW_BENCHMARK.map(pt => {
    const s = series.find(d => Math.abs(d.hz - pt.hz) < 1);
    return (s && s.db != null) ? Math.abs(s.db - pt.db) : null;
  }).filter(v => v != null);
  return errors.length ? errors.reduce((a, b) => a + b, 0) / errors.length : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main audit runner
// ─────────────────────────────────────────────────────────────────────────────

function runAudit({ roomDims, seat, sub, surfaceAbsorption, axialQ }) {
  const nSA  = normSA(surfaceAbsorption);
  const modes = computeRoomModesLocal({ ...roomDims, fMax: 200, c: C });

  // 1. Per-frequency stage traces
  const traces = TARGET_HZ.map(hz => {
    const nearby = modes.filter(m => Math.abs(m.freq - hz) <= 20);
    return traceFrequency({ hz, modes: nearby, roomDims, seat, sub, nSA, axialQ });
  });

  // 2. Full-band MAE — production
  const prodSeries = computeFullBandSeries({ modes, roomDims, seat, sub, nSA, axialQ });
  const maeProduction = computeMAE(prodSeries);

  // 3. Override sweeps
  const sweepA = computeFullBandSeries({ modes, roomDims, seat, sub, nSA, axialQ, tfScale: 0.5 });
  const sweepB = computeFullBandSeries({ modes, roomDims, seat, sub, nSA, axialQ, srcNormScale: 0.5 });
  const sweepC = computeFullBandSeries({ modes, roomDims, seat, sub, nSA, axialQ, sumScale: 0.5 });

  const maeA = computeMAE(sweepA);
  const maeB = computeMAE(sweepB);
  const maeC = computeMAE(sweepC);

  return { traces, maeProduction, maeA, maeB, maeC };
}

// ─────────────────────────────────────────────────────────────────────────────
// UI helpers
// ─────────────────────────────────────────────────────────────────────────────

const TH  = { padding: '3px 7px', fontSize: 9, fontWeight: 700, ...MONO, background: '#1c1917', color: '#a8a29e', borderBottom: '2px solid #292524', textAlign: 'right', whiteSpace: 'nowrap' };
const THL = { ...TH, textAlign: 'left' };
const TD  = { padding: '2px 7px', fontSize: 9, ...MONO, textAlign: 'right', borderBottom: '1px solid #1c1917' };
const TDL = { ...TD, textAlign: 'left' };

const fmt  = (v, d = 3) => Number.isFinite(Number(v)) ? Number(v).toFixed(d) : '—';
const fmtG = v => {
  if (!Number.isFinite(Number(v))) return '—';
  const s = Number(v) >= 0 ? '+' : '';
  return s + Number(v).toFixed(2) + ' dB';
};

const growthColor = v => {
  if (!Number.isFinite(Number(v))) return '#57534e';
  if (v > 20) return '#f87171';
  if (v > 10) return '#fbbf24';
  if (v < -5) return '#60a5fa';
  return '#4ade80';
};

const STAGE_LABELS = [
  'Stage 1 — Raw source',
  'Stage 2 — After src normalisation (ψ_s)',
  'Stage 3 — After mode-shape coupling (ψ_s × ψ_r)',
  'Stage 4 — After TF magnitude',
  'Stage 5 — After modal summation (top-5 RSS)',
  'Stage 6 — Modal SPL',
  'Stage 7 — Before direct/modal combine',
];

// ─────────────────────────────────────────────────────────────────────────────
// StageTrace sub-component
// ─────────────────────────────────────────────────────────────────────────────

function StageTrace({ trace }) {
  const stages = [
    trace.stage1,
    trace.stage2,
    trace.stage3,
    trace.stage4,
    trace.stage5,
    null, // stage6 is dB only
    trace.stage7,
  ];

  const rows = STAGE_LABELS.map((label, i) => {
    const lin = stages[i];
    const db  = i === 5 ? trace.stage6db : (lin != null ? toDB(lin) : null);
    const prev = i > 0 ? stages[i - 1] : null;
    const growthFromPrev = (lin != null && prev != null) ? growthDB(lin, prev) : null;
    const growthFromS1   = (lin != null && trace.stage1) ? growthDB(lin, trace.stage1) : null;
    return { label, lin, db, growthFromPrev, growthFromS1 };
  });

  // Amplification ranking (skip stage 6 which is conversion)
  const ranked = rows
    .filter((r, i) => i !== 5 && r.growthFromPrev != null)
    .sort((a, b) => b.growthFromPrev - a.growthFromPrev)
    .slice(0, 3);

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#fbbf24', ...MONO, marginBottom: 4 }}>
        {trace.hz} Hz
        {trace.dominantMode && (
          <span style={{ fontWeight: 400, color: '#57534e', marginLeft: 10, fontSize: 9 }}>
            dominant mode ({trace.dominantMode.nx},{trace.dominantMode.ny},{trace.dominantMode.nz})
            @ {fmt(trace.dominantMode.freq, 1)} Hz · Q={fmt(trace.dominantQ, 1)} · TF={fmt(trace.dominantTF, 3)}
          </span>
        )}
      </div>
      <div style={{ overflowX: 'auto', marginBottom: 6 }}>
        <table style={{ borderCollapse: 'collapse', minWidth: 640 }}>
          <thead>
            <tr>
              <th style={{ ...THL, minWidth: 280 }}>Stage</th>
              <th style={{ ...TH,  minWidth: 90  }}>Linear (Pa)</th>
              <th style={{ ...TH,  minWidth: 72  }}>dB SPL</th>
              <th style={{ ...TH,  minWidth: 80  }}>Δ prev stage</th>
              <th style={{ ...TH,  minWidth: 80  }}>Δ cumulative</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td style={{ ...TDL, color: '#d6d3d1' }}>{r.label}</td>
                <td style={{ ...TD,  color: '#78716c' }}>
                  {r.lin != null ? r.lin.toExponential(3) : (i === 5 ? '(dB only)' : '—')}
                </td>
                <td style={{ ...TD,  color: '#d6d3d1' }}>{r.db != null ? fmt(r.db, 2) + ' dB' : '—'}</td>
                <td style={{ ...TD,  color: growthColor(r.growthFromPrev) }}>{fmtG(r.growthFromPrev)}</td>
                <td style={{ ...TD,  color: growthColor(r.growthFromS1)   }}>{fmtG(r.growthFromS1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ranked.length > 0 && (
        <div style={{ fontSize: 9, ...MONO, color: '#57534e', lineHeight: 1.8, paddingLeft: 4 }}>
          <span style={{ color: '#a8a29e', fontWeight: 700 }}>Amplification ranking: </span>
          {ranked.map((r, i) => (
            <span key={i} style={{ color: i === 0 ? '#f87171' : i === 1 ? '#fbbf24' : '#78716c', marginRight: 12 }}>
              #{i + 1} {r.label.split('—')[1]?.trim()} ({fmtG(r.growthFromPrev)})
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Override sweeps table
// ─────────────────────────────────────────────────────────────────────────────

function OverrideSweepsTable({ maeProduction, maeA, maeB, maeC }) {
  const sweeps = [
    { id: 'A', label: 'Transfer-function magnitude ×0.5',        mae: maeA, color: '#60a5fa' },
    { id: 'B', label: 'Modal source normalisation (ψ_s) ×0.5',   mae: maeB, color: '#4ade80' },
    { id: 'C', label: 'Modal summation result ×0.5',              mae: maeC, color: '#fb923c' },
  ];

  return (
    <div style={{ marginTop: 10, marginBottom: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#60a5fa', ...MONO, marginBottom: 6 }}>
        Override Sweeps — MAE vs REW (20–200 Hz)
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', minWidth: 540 }}>
          <thead>
            <tr>
              <th style={{ ...THL, minWidth: 20  }}>ID</th>
              <th style={{ ...THL, minWidth: 320 }}>Override</th>
              <th style={{ ...TH,  minWidth: 80  }}>MAE (dB)</th>
              <th style={{ ...TH,  minWidth: 90  }}>Δ vs production</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ ...TDL, color: '#78716c' }}>Prod</td>
              <td style={{ ...TDL, color: '#d6d3d1', fontWeight: 700 }}>Production (no override)</td>
              <td style={{ ...TD,  color: '#d6d3d1', fontWeight: 700 }}>{fmt(maeProduction, 3)} dB</td>
              <td style={{ ...TD,  color: '#57534e' }}>—</td>
            </tr>
            {sweeps.map(s => {
              const delta = (s.mae != null && maeProduction != null) ? s.mae - maeProduction : null;
              const col   = delta == null ? '#57534e' : delta < -3 ? '#4ade80' : delta < 0 ? '#a3e635' : '#f87171';
              return (
                <tr key={s.id}>
                  <td style={{ ...TDL, color: s.color, fontWeight: 700 }}>{s.id}</td>
                  <td style={{ ...TDL, color: '#d6d3d1' }}>{s.label}</td>
                  <td style={{ ...TD,  color: '#d6d3d1' }}>{fmt(s.mae, 3)} dB</td>
                  <td style={{ ...TD,  color: col, fontWeight: delta != null && Math.abs(delta) > 3 ? 700 : 400 }}>
                    {delta != null ? (delta >= 0 ? '+' : '') + delta.toFixed(3) + ' dB' : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Verdict
// ─────────────────────────────────────────────────────────────────────────────

function VerdictPanel({ maeProduction, maeA, maeB, maeC }) {
  const suspects = [];
  const deltaA = maeA != null && maeProduction != null ? maeA - maeProduction : null;
  const deltaB = maeB != null && maeProduction != null ? maeB - maeProduction : null;
  const deltaC = maeC != null && maeProduction != null ? maeC - maeProduction : null;

  const labels = {
    A: 'Transfer-function magnitude',
    B: 'Modal source normalisation',
    C: 'Modal summation result',
  };
  const deltas = { A: deltaA, B: deltaB, C: deltaC };

  for (const id of ['A', 'B', 'C']) {
    if (deltas[id] != null && deltas[id] < -3) suspects.push(id);
  }

  const hasPrimary = suspects.length > 0;
  const borderColor = hasPrimary ? '#4ade80' : '#292524';

  return (
    <div style={{ padding: '8px 12px', background: '#1c1917', borderRadius: 6, border: `1px solid ${borderColor}`, fontSize: 9, ...MONO, lineHeight: 1.9 }}>
      <div style={{ fontWeight: 700, fontSize: 10, color: hasPrimary ? '#4ade80' : '#60a5fa', marginBottom: 4 }}>Verdict</div>
      {hasPrimary ? (
        <>
          {suspects.map(id => (
            <div key={id} style={{ color: '#4ade80', fontWeight: 700, marginBottom: 2 }}>
              ✓ [{id}] {labels[id]}: "Primary remaining parity suspect."
              <span style={{ fontWeight: 400, color: '#78716c' }}>
                {' '}Halving reduces MAE by {Math.abs(deltas[id]).toFixed(3)} dB (&gt;3 dB threshold).
              </span>
            </div>
          ))}
        </>
      ) : (
        <div style={{ color: '#d6d3d1' }}>
          No single modal stage reduces MAE &gt;3 dB when halved.
          <div style={{ color: '#78716c', fontWeight: 400, marginTop: 2 }}>
            Best reduction: {
              Object.entries(deltas)
                .filter(([, v]) => v != null)
                .sort(([, a], [, b]) => a - b)
                .map(([id, v]) => `[${id}] ${labels[id]} Δ${v >= 0 ? '+' : ''}${v?.toFixed(3)} dB`)
                .join(' · ')
            }.
            Parity gap likely originates from direct-field calibration, room geometry, or source coupling — not modal stage amplification.
          </div>
        </div>
      )}
      <div style={{ color: '#44403c', fontSize: 8, marginTop: 4 }}>
        Threshold: &lt;−3 dB MAE improvement when stage halved → primary suspect. Sweeps isolated; no production engine modifications.
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function ModalPressureGrowthAudit({ roomDims, seat, sub, surfaceAbsorption, activeSettings }) {
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
      const r = runAudit({ roomDims, seat, sub, surfaceAbsorption, axialQ });
      setResult(r);
    } catch (e) {
      setError(e.message || 'Unknown error');
    }
    setRunning(false);
  }, [roomDims, seat, sub, surfaceAbsorption, axialQ, canRun]);

  return (
    <div style={{ marginTop: 12, border: '1px solid #292524', borderRadius: 8, background: '#0c0a09', padding: '10px 12px' }}>
      <div style={{ fontWeight: 700, color: '#d6d3d1', fontSize: 11, ...MONO, marginBottom: 3 }}>
        Modal Pressure Growth Audit
        <span style={{ fontWeight: 400, color: '#44403c', marginLeft: 10, fontSize: 10 }}>
          diagnostic only · no production changes · does not affect live graph
        </span>
      </div>
      <div style={{ fontSize: 9, color: '#57534e', ...MONO, marginBottom: 8, lineHeight: 1.8 }}>
        Traces modal pressure through 7 stages at 57, 70, 80, 85, 90 Hz to identify where
        amplification exceeds expectation, then tests 3 override sweeps to isolate the dominant stage.
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
        {running ? 'Computing…' : result ? 'Re-run Growth Audit' : 'Run Modal Pressure Growth Audit'}
      </button>

      {error && <div style={{ fontSize: 10, color: '#f87171', ...MONO, marginBottom: 8 }}>⚠ {error}</div>}

      {result && (
        <>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#a8a29e', ...MONO, marginBottom: 8 }}>
            Stage-by-stage pressure growth — dominant mode per target frequency
          </div>
          {result.traces.map(t => <StageTrace key={t.hz} trace={t} />)}
          <OverrideSweepsTable
            maeProduction={result.maeProduction}
            maeA={result.maeA}
            maeB={result.maeB}
            maeC={result.maeC}
          />
          <VerdictPanel
            maeProduction={result.maeProduction}
            maeA={result.maeA}
            maeB={result.maeB}
            maeC={result.maeC}
          />
        </>
      )}
    </div>
  );
}