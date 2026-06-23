/**
 * ModeCouplingProvenanceAudit — Diagnostic only. No production changes.
 * Does not affect live graph.
 *
 * Traces the complete modal excitation chain for the dominant mode at each
 * target frequency: 57, 70, 80, 85, 90 Hz.
 *
 * Chain:
 *   rawSourceP (flat source before coupling)
 *   → ψsource   (mode shape at sub position)
 *   → ψreceiver (mode shape at seat position)
 *   → coupling = ψsource × ψreceiver
 *   → TF gain |H(f₀, f₀, Q)|
 *   → finalContribution = |coupling| × rawSourceP × TF
 *
 * Coupling delta experiment:
 *   Three variants evaluated over full 20–200 Hz at every benchmark point:
 *     1) coupling = 1.0              (forced unity — removes mode-shape effect)
 *     2) coupling = |ψs × ψr|       (absolute / unsigned)
 *     3) coupling = ψs × ψr         (current signed production)
 *   MAE vs REW benchmark computed for each → if forcing to 1.0 improves MAE >1 dB
 *   → "Mode-shape coupling is the primary remaining parity suspect."
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
const TARGET_HZ = [57, 70, 80, 85, 90];
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

// ── Shared utilities ──────────────────────────────────────────────────────────
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

function toDb(linear) {
  return linear > 0 ? 20 * Math.log10(linear / REF_P) : null;
}

function toDbRaw(linear) {
  return linear > 0 ? 20 * Math.log10(Math.abs(linear)) : null;
}

// ── MAE with coupling override ────────────────────────────────────────────────
function computeMAEWithCouplingMode(mode, roomDims, seat, sub, sa, axialQ, couplingMode) {
  const { widthM, lengthM, heightM } = roomDims;
  const subZ  = Number.isFinite(Number(sub?.z))  ? Number(sub.z)  : 0.35;
  const seatZ = Number.isFinite(Number(seat?.z)) ? Number(seat.z) : 1.2;
  const nSA   = normSA(sa);
  const sourceP = Math.pow(10, FLAT_DB / 20);
  const rawModes = computeRoomModesLocal({ widthM, lengthM, heightM, fMax: 200, c: C });
  const freqs = linspace(20, 200, FREQ_STEP);

  const series = freqs.map(hz => {
    let sumP = 0;
    for (const m of rawModes) {
      const baseQ = qForType(m.type, axialQ);
      const absQ  = estimateModeQLocal({ roomDims, surfaceAbsorption: nSA, f0: m.freq });
      const q     = Math.max(1, Math.min(baseQ, absQ));
      const ψs    = modeShapeValueLocal(m, Number(sub.x),  Number(sub.y),  subZ,  { widthM, lengthM, heightM });
      const ψr    = modeShapeValueLocal(m, Number(seat.x), Number(seat.y), seatZ, { widthM, lengthM, heightM });
      const { transferMag } = resonantTransfer(hz, m.freq, q);

      let couplingVal;
      if (couplingMode === 'unity')    couplingVal = 1.0;
      else if (couplingMode === 'abs') couplingVal = Math.abs(ψs * ψr);
      else                             couplingVal = Math.abs(ψs * ψr); // production uses abs for pressure sum

      sumP += couplingVal * sourceP * transferMag;
    }
    return { hz, db: sumP > 0 ? 20 * Math.log10(sumP / REF_P) : null };
  });

  const errors = REW_BENCHMARK.map(pt => {
    const s = series.find(d => Math.abs(d.hz - pt.hz) < 1);
    return (s && s.db != null) ? Math.abs(s.db - pt.db) : null;
  }).filter(v => v != null);

  return errors.length ? errors.reduce((a, b) => a + b, 0) / errors.length : null;
}

// ── Find dominant mode ────────────────────────────────────────────────────────
function findDominantMode(targetHz, roomDims, seat, sub, sa, axialQ) {
  const { widthM, lengthM, heightM } = roomDims;
  const subZ  = Number.isFinite(Number(sub?.z))  ? Number(sub.z)  : 0.35;
  const seatZ = Number.isFinite(Number(seat?.z)) ? Number(seat.z) : 1.2;
  const nSA   = normSA(sa);
  const rawModes = computeRoomModesLocal({ widthM, lengthM, heightM, fMax: 200, c: C });

  let best = null, bestScore = -1;
  for (const m of rawModes) {
    const baseQ = qForType(m.type, axialQ);
    const absQ  = estimateModeQLocal({ roomDims, surfaceAbsorption: nSA, f0: m.freq });
    const q     = Math.max(1, Math.min(baseQ, absQ));
    const ψs    = modeShapeValueLocal(m, Number(sub.x),  Number(sub.y),  subZ,  { widthM, lengthM, heightM });
    const ψr    = modeShapeValueLocal(m, Number(seat.x), Number(seat.y), seatZ, { widthM, lengthM, heightM });
    const { transferMag } = resonantTransfer(targetHz, m.freq, q);
    const score = Math.abs(ψs * ψr) * transferMag;
    if (score > bestScore) { bestScore = score; best = { ...m, q, ψs, ψr }; }
  }
  return best;
}

// ── Top 5 contributors at targetHz ───────────────────────────────────────────
function getTopContributors(targetHz, roomDims, seat, sub, sa, axialQ, n = 5) {
  const { widthM, lengthM, heightM } = roomDims;
  const subZ  = Number.isFinite(Number(sub?.z))  ? Number(sub.z)  : 0.35;
  const seatZ = Number.isFinite(Number(seat?.z)) ? Number(seat.z) : 1.2;
  const nSA   = normSA(sa);
  const sourceP = Math.pow(10, FLAT_DB / 20);
  const rawModes = computeRoomModesLocal({ widthM, lengthM, heightM, fMax: 200, c: C });

  return rawModes
    .map(m => {
      const baseQ = qForType(m.type, axialQ);
      const absQ  = estimateModeQLocal({ roomDims, surfaceAbsorption: nSA, f0: m.freq });
      const q     = Math.max(1, Math.min(baseQ, absQ));
      const ψs    = modeShapeValueLocal(m, Number(sub.x),  Number(sub.y),  subZ,  { widthM, lengthM, heightM });
      const ψr    = modeShapeValueLocal(m, Number(seat.x), Number(seat.y), seatZ, { widthM, lengthM, heightM });
      const { transferMag } = resonantTransfer(targetHz, m.freq, q);
      const coupling = ψs * ψr;
      const finalP   = Math.abs(coupling) * sourceP * transferMag;
      return { ...m, q, ψs, ψr, coupling, transferMag, sourceP, finalP };
    })
    .sort((a, b) => b.finalP - a.finalP)
    .slice(0, n);
}

// ── Per-mode chain ────────────────────────────────────────────────────────────
function buildChain(mode, targetHz, roomDims, seat, sub, sa, axialQ) {
  const { widthM, lengthM, heightM } = roomDims;
  const subZ  = Number.isFinite(Number(sub?.z))  ? Number(sub.z)  : 0.35;
  const seatZ = Number.isFinite(Number(seat?.z)) ? Number(seat.z) : 1.2;
  const nSA   = normSA(sa);
  const sourceP = Math.pow(10, FLAT_DB / 20);

  const baseQ = qForType(mode.type, axialQ);
  const absQ  = estimateModeQLocal({ roomDims, surfaceAbsorption: nSA, f0: mode.freq });
  const q     = Math.max(1, Math.min(baseQ, absQ));
  const ψs    = modeShapeValueLocal(mode, Number(sub.x),  Number(sub.y),  subZ,  { widthM, lengthM, heightM });
  const ψr    = modeShapeValueLocal(mode, Number(seat.x), Number(seat.y), seatZ, { widthM, lengthM, heightM });
  const { transferMag } = resonantTransfer(targetHz, mode.freq, q);
  const coupling  = ψs * ψr;
  const afterCoupling = Math.abs(coupling) * sourceP;
  const finalP    = afterCoupling * transferMag;

  // Contribution ranking (by magnitude impact on finalP)
  const factors = [
    { label: 'Source amplitude (raw)',  value: sourceP,         db: 20 * Math.log10(sourceP) },
    { label: 'ψsource',                 value: Math.abs(ψs),    db: toDbRaw(ψs) },
    { label: 'ψreceiver',               value: Math.abs(ψr),    db: toDbRaw(ψr) },
    { label: 'Coupling |ψs × ψr|',      value: Math.abs(coupling), db: toDbRaw(coupling) },
    { label: 'Transfer function |H|',   value: transferMag,     db: toDbRaw(transferMag) },
    { label: 'Modal normalisation (×1)',value: 1.0,              db: 0 },
  ];
  const ranked = [...factors].sort((a, b) => b.value - a.value);

  return {
    mode, q, ψs, ψr, coupling, sourceP, afterCoupling, transferMag, finalP,
    factors, ranked,
    sourcePDb:       20 * Math.log10(sourceP),
    ψsDb:            toDbRaw(ψs),
    ψrDb:            toDbRaw(ψr),
    couplingDb:      toDbRaw(coupling),
    afterCouplingDb: toDb(afterCoupling),
    tfGainDb:        toDbRaw(transferMag),
    finalPDb:        toDb(finalP),
  };
}

// ── Main run per target Hz ────────────────────────────────────────────────────
function runForHz(targetHz, roomDims, seat, sub, sa, axialQ) {
  const dom = findDominantMode(targetHz, roomDims, seat, sub, sa, axialQ);
  if (!dom) return null;

  const chain = buildChain(dom, targetHz, roomDims, seat, sub, sa, axialQ);
  const topContributors = getTopContributors(targetHz, roomDims, seat, sub, sa, axialQ, 5);

  const maeUnity  = computeMAEWithCouplingMode('unity',    roomDims, seat, sub, sa, axialQ, 'unity');
  const maeAbs    = computeMAEWithCouplingMode('abs',      roomDims, seat, sub, sa, axialQ, 'abs');
  const maeSigned = computeMAEWithCouplingMode('signed',   roomDims, seat, sub, sa, axialQ, 'signed');

  return { dom, chain, topContributors, maeUnity, maeAbs, maeSigned };
}

// ── Styles ────────────────────────────────────────────────────────────────────
const TH  = { padding: '3px 7px', fontSize: 9, fontWeight: 700, ...MONO, background: '#1c1917', color: '#a8a29e', borderBottom: '2px solid #292524', textAlign: 'right', whiteSpace: 'nowrap' };
const THL = { ...TH, textAlign: 'left' };
const TD  = { padding: '2px 7px', fontSize: 9, ...MONO, textAlign: 'right', borderBottom: '1px solid #1c1917' };
const TDL = { ...TD, textAlign: 'left' };

const fmtE  = v => Number.isFinite(Number(v)) ? Number(v).toExponential(4) : '—';
const fmt6  = v => Number.isFinite(Number(v)) ? Number(v).toFixed(6) : '—';
const fmt3  = v => Number.isFinite(Number(v)) ? Number(v).toFixed(3) : '—';
const fmt2  = v => Number.isFinite(Number(v)) ? Number(v).toFixed(2) : '—';
const fmtDb = v => Number.isFinite(Number(v)) ? (Number(v) >= 0 ? '+' : '') + Number(v).toFixed(2) + ' dB' : '—';

// ── Sub-components ────────────────────────────────────────────────────────────

function ChainTable({ chain }) {
  const rows = [
    {
      step: '1',
      label: 'Raw source pressure',
      linear: fmtE(chain.sourceP),
      db: fmtDb(chain.sourcePDb),
      note: 'flat input (before any coupling)',
      color: '#93c5fd',
    },
    {
      step: '2',
      label: 'ψsource',
      linear: fmt6(chain.ψs),
      db: fmtDb(chain.ψsDb),
      note: `mode shape at sub (${fmt6(chain.mode.nx > 0 ? 'cos' : '1')})`,
      color: '#4ade80',
    },
    {
      step: '3',
      label: 'ψreceiver',
      linear: fmt6(chain.ψr),
      db: fmtDb(chain.ψrDb),
      note: 'mode shape at seat',
      color: '#4ade80',
    },
    {
      step: '4',
      label: 'ψs × ψr (coupling)',
      linear: fmt6(chain.coupling),
      db: fmtDb(chain.couplingDb),
      note: chain.coupling < 0 ? '⚠ signed negative' : 'signed positive',
      color: chain.coupling < 0 ? '#f87171' : '#fbbf24',
    },
    {
      step: '5',
      label: 'Pressure after coupling',
      linear: fmtE(chain.afterCoupling),
      db: fmtDb(chain.afterCouplingDb),
      note: '|coupling| × rawSourceP',
      color: '#d6d3d1',
    },
    {
      step: '6',
      label: 'Transfer function |H|',
      linear: fmt6(chain.transferMag),
      db: fmtDb(chain.tfGainDb),
      note: 'resonantTransfer at f=f₀',
      color: '#fb923c',
    },
    {
      step: '7',
      label: 'Final modal contribution',
      linear: fmtE(chain.finalP),
      db: fmtDb(chain.finalPDb),
      note: 'afterCoupling × TF',
      color: '#a78bfa',
    },
  ];

  return (
    <div style={{ overflowX: 'auto', marginBottom: 12 }}>
      <table style={{ borderCollapse: 'collapse', minWidth: 600 }}>
        <thead>
          <tr>
            <th style={{ ...THL, minWidth: 24 }}>#</th>
            <th style={{ ...THL, minWidth: 180 }}>Stage</th>
            <th style={{ ...TH,  minWidth: 110 }}>Linear value</th>
            <th style={{ ...TH,  minWidth: 80  }}>dB value</th>
            <th style={{ ...THL, minWidth: 180 }}>Note</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.step} style={{ borderBottom: '1px solid #1c1917', background: r.step === '7' ? '#14100a' : 'transparent' }}>
              <td style={{ ...TDL, color: '#57534e' }}>{r.step}</td>
              <td style={{ ...TDL, color: r.color, fontWeight: r.step === '7' ? 700 : 400 }}>{r.label}</td>
              <td style={{ ...TD,  color: '#d6d3d1', fontWeight: r.step === '7' ? 700 : 400 }}>{r.linear}</td>
              <td style={{ ...TD,  color: r.color,   fontWeight: r.step === '7' ? 700 : 400 }}>{r.db}</td>
              <td style={{ ...TDL, color: '#57534e', fontSize: 8 }}>{r.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RankingTable({ chain }) {
  return (
    <div style={{ overflowX: 'auto', marginBottom: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#60a5fa', ...MONO, marginBottom: 4 }}>
        Contribution ranking (by linear magnitude)
      </div>
      <table style={{ borderCollapse: 'collapse', minWidth: 480 }}>
        <thead>
          <tr>
            <th style={{ ...THL, minWidth: 32 }}>Rank</th>
            <th style={{ ...THL, minWidth: 200 }}>Factor</th>
            <th style={{ ...TH,  minWidth: 110 }}>Linear value</th>
            <th style={{ ...TH,  minWidth: 80  }}>dB</th>
          </tr>
        </thead>
        <tbody>
          {chain.ranked.map((f, i) => (
            <tr key={f.label} style={{ borderBottom: '1px solid #1c1917', background: i === 0 ? '#141207' : 'transparent' }}>
              <td style={{ ...TDL, color: i === 0 ? '#fbbf24' : '#57534e', fontWeight: i === 0 ? 700 : 400 }}>{i + 1}</td>
              <td style={{ ...TDL, color: '#d6d3d1', fontWeight: i === 0 ? 700 : 400 }}>{f.label}</td>
              <td style={{ ...TD,  color: '#d6d3d1' }}>{fmtE(f.value)}</td>
              <td style={{ ...TD,  color: Number.isFinite(f.db) && f.db > 60 ? '#f87171' : '#78716c' }}>{fmtDb(f.db)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TopContributorsTable({ contributors }) {
  return (
    <div style={{ overflowX: 'auto', marginBottom: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#60a5fa', ...MONO, marginBottom: 4 }}>
        Top 5 modal contributors at this frequency
      </div>
      <table style={{ borderCollapse: 'collapse', minWidth: 720 }}>
        <thead>
          <tr>
            <th style={{ ...THL, minWidth: 30  }}>Rank</th>
            <th style={{ ...THL, minWidth: 90  }}>Mode (nx,ny,nz)</th>
            <th style={{ ...THL, minWidth: 70  }}>Type</th>
            <th style={{ ...TH,  minWidth: 60  }}>f₀ (Hz)</th>
            <th style={{ ...TH,  minWidth: 52  }}>Q</th>
            <th style={{ ...TH,  minWidth: 80  }}>ψsource</th>
            <th style={{ ...TH,  minWidth: 80  }}>ψreceiver</th>
            <th style={{ ...TH,  minWidth: 80  }}>|coupling|</th>
            <th style={{ ...TH,  minWidth: 70  }}>|H|</th>
            <th style={{ ...TH,  minWidth: 90  }}>Final P (Pa)</th>
          </tr>
        </thead>
        <tbody>
          {contributors.map((m, i) => (
            <tr key={`${m.nx}-${m.ny}-${m.nz}`} style={{ borderBottom: '1px solid #1c1917', background: i === 0 ? '#141207' : 'transparent' }}>
              <td style={{ ...TDL, color: i === 0 ? '#fbbf24' : '#57534e', fontWeight: i === 0 ? 700 : 400 }}>{i + 1}</td>
              <td style={{ ...TDL, color: '#d6d3d1', fontWeight: i === 0 ? 700 : 400 }}>({m.nx},{m.ny},{m.nz})</td>
              <td style={{ ...TDL, color: m.type === 'axial' ? '#93c5fd' : m.type === 'tangential' ? '#4ade80' : '#a78bfa', fontSize: 8 }}>{m.type}</td>
              <td style={{ ...TD,  color: '#d6d3d1' }}>{fmt2(m.freq)}</td>
              <td style={{ ...TD,  color: '#78716c' }}>{fmt2(m.q)}</td>
              <td style={{ ...TD,  color: '#78716c' }}>{fmt6(m.ψs)}</td>
              <td style={{ ...TD,  color: '#78716c' }}>{fmt6(m.ψr)}</td>
              <td style={{ ...TD,  color: Math.abs(m.coupling) > 0.5 ? '#fbbf24' : '#78716c', fontWeight: Math.abs(m.coupling) > 0.5 ? 700 : 400 }}>{fmt6(Math.abs(m.coupling))}</td>
              <td style={{ ...TD,  color: m.transferMag > 10 ? '#f87171' : '#78716c' }}>{fmt6(m.transferMag)}</td>
              <td style={{ ...TD,  color: '#a78bfa', fontWeight: i === 0 ? 700 : 400 }}>{fmtE(m.finalP)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CouplingDeltaPanel({ maeUnity, maeAbs, maeSigned }) {
  const hasAll = maeUnity != null && maeAbs != null && maeSigned != null;
  const deltaUnityVsSigned  = hasAll ? maeSigned - maeUnity  : null;
  const deltaAbsVsSigned    = hasAll ? maeSigned - maeAbs    : null;

  const isCouplingPrimaryDriver = deltaUnityVsSigned != null && deltaUnityVsSigned > 1;

  return (
    <div style={{ padding: '8px 12px', background: '#1c1917', borderRadius: 6, fontSize: 9, ...MONO, lineHeight: 1.9 }}>
      <div style={{ fontWeight: 700, color: '#60a5fa', marginBottom: 6, fontSize: 10 }}>
        Coupling Override MAE Comparison (20–200 Hz vs REW benchmark)
      </div>

      <div style={{ overflowX: 'auto', marginBottom: 10 }}>
        <table style={{ borderCollapse: 'collapse', minWidth: 560 }}>
          <thead>
            <tr>
              <th style={{ ...THL, minWidth: 220 }}>Coupling variant</th>
              <th style={{ ...TH,  minWidth: 80  }}>MAE (dB)</th>
              <th style={{ ...TH,  minWidth: 100 }}>Δ vs signed prod</th>
              <th style={{ ...THL, minWidth: 160 }}>Interpretation</th>
            </tr>
          </thead>
          <tbody>
            {[
              { label: 'Coupling = 1.0 (unity forced)', mae: maeUnity,  delta: deltaUnityVsSigned,  key: 'unity' },
              { label: 'Coupling = |ψs × ψr| (abs)',    mae: maeAbs,    delta: deltaAbsVsSigned,    key: 'abs'   },
              { label: 'Coupling = ψs × ψr (signed, production)', mae: maeSigned, delta: 0,        key: 'signed'},
            ].map(row => (
              <tr key={row.key} style={{ borderBottom: '1px solid #1c1917', background: row.key === 'signed' ? '#0f0d0b' : 'transparent' }}>
                <td style={{ ...TDL, color: row.key === 'unity' ? '#93c5fd' : row.key === 'abs' ? '#4ade80' : '#fb923c', fontWeight: row.key === 'signed' ? 700 : 400 }}>
                  {row.label}
                </td>
                <td style={{ ...TD, color: '#d6d3d1', fontWeight: row.key === 'signed' ? 700 : 400 }}>
                  {row.mae != null ? row.mae.toFixed(3) : '—'}
                </td>
                <td style={{ ...TD, color: row.delta == null ? '#57534e' : row.delta > 1 ? '#4ade80' : row.delta < -1 ? '#f87171' : '#78716c', fontWeight: 700 }}>
                  {row.key === 'signed' ? '(baseline)' : row.delta != null ? (row.delta >= 0 ? '+' : '') + row.delta.toFixed(3) + ' dB' : '—'}
                </td>
                <td style={{ ...TDL, color: '#57534e', fontSize: 8 }}>
                  {row.key === 'unity'  ? 'removes all mode-shape weighting'   : ''}
                  {row.key === 'abs'    ? 'removes sign, keeps magnitude shape' : ''}
                  {row.key === 'signed' ? 'current production'                 : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Verdict */}
      <div style={{ borderTop: '1px solid #292524', paddingTop: 6 }}>
        <div style={{ fontWeight: 700, color: '#d6d3d1', marginBottom: 4 }}>Interpretation:</div>
        {isCouplingPrimaryDriver ? (
          <div style={{ color: '#4ade80', fontWeight: 700 }}>
            ✓ "Mode-shape coupling is the primary remaining parity suspect."
            <span style={{ fontWeight: 400, color: '#78716c' }}> Forcing unity coupling improves MAE by {deltaUnityVsSigned?.toFixed(2)} dB (&gt;1 dB threshold).</span>
          </div>
        ) : hasAll ? (
          <div style={{ color: '#d6d3d1' }}>
            "Parity gap originates after coupling and likely in direct/modal allocation."
            <span style={{ color: '#57534e' }}> Unity coupling MAE change = {deltaUnityVsSigned?.toFixed(3)} dB (≤1 dB threshold — coupling is not the driver).</span>
          </div>
        ) : (
          <div style={{ color: '#57534e' }}>MAE comparison unavailable — check room, seat, and sub are configured.</div>
        )}
        <div style={{ color: '#44403c', fontSize: 8, marginTop: 4 }}>
          Threshold: forcing coupling=1.0 improves MAE &gt;1 dB → coupling is primary suspect
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ModeCouplingProvenanceAudit({ roomDims, seat, sub, surfaceAbsorption, activeSettings }) {
  const [results,  setResults]  = useState(null);
  const [running,  setRunning]  = useState(false);
  const [error,    setError]    = useState(null);
  const [activeHz, setActiveHz] = useState(57);

  const axialQ = Number.isFinite(activeSettings?.axialQ) ? activeSettings.axialQ : 4.0;

  const canRun = !!(
    roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM &&
    seat?.x != null && seat?.y != null && sub?.x != null && sub?.y != null
  );

  const run = useCallback(async () => {
    if (!canRun) return;
    setRunning(true); setError(null); setResults(null);
    await new Promise(r => setTimeout(r, 0));
    try {
      const byHz = {};
      for (const hz of TARGET_HZ) {
        await new Promise(r => setTimeout(r, 0));
        byHz[hz] = runForHz(hz, roomDims, seat, sub, surfaceAbsorption, axialQ);
      }
      setResults(byHz);
    } catch (e) {
      setError(e.message || 'Unknown error');
    }
    setRunning(false);
  }, [roomDims, seat, sub, surfaceAbsorption, axialQ, canRun]);

  const active = results?.[activeHz];

  return (
    <div style={{ marginTop: 12, border: '1px solid #292524', borderRadius: 8, background: '#0c0a09', padding: '10px 12px' }}>

      <div style={{ fontWeight: 700, color: '#d6d3d1', fontSize: 11, ...MONO, marginBottom: 3 }}>
        Mode Coupling Provenance Audit
        <span style={{ fontWeight: 400, color: '#44403c', marginLeft: 10, fontSize: 10 }}>
          diagnostic only · no production changes · does not affect live graph
        </span>
      </div>
      <div style={{ fontSize: 9, color: '#57534e', ...MONO, marginBottom: 8, lineHeight: 1.8 }}>
        Traces the complete modal excitation chain: rawSourceP → ψsource → ψreceiver → coupling → TF gain → finalP.
        Evaluates three coupling variants (unity / abs / signed) to isolate mode-shape contribution to the REW parity gap.
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
        {running ? 'Computing…' : results ? 'Re-run Provenance Audit' : 'Run Mode Coupling Provenance Audit'}
      </button>

      {error && <div style={{ fontSize: 10, color: '#f87171', ...MONO, marginBottom: 8 }}>⚠ {error}</div>}

      {results && (
        <>
          {/* Frequency tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
            {TARGET_HZ.map(hz => {
              const d = results[hz];
              const isActive = hz === activeHz;
              return (
                <button key={hz} onClick={() => setActiveHz(hz)} style={{
                  padding: '3px 10px', borderRadius: 4, fontSize: 9, ...MONO, cursor: 'pointer',
                  border: isActive ? '1px solid #60a5fa' : '1px solid #292524',
                  background: isActive ? '#1e3a5f' : '#1c1917',
                  color: isActive ? '#93c5fd' : '#78716c', fontWeight: isActive ? 700 : 400,
                }}>
                  {hz} Hz
                  {d?.dom && <span style={{ marginLeft: 4, color: '#57534e' }}>f₀={d.dom.freq.toFixed(1)}</span>}
                </button>
              );
            })}
          </div>

          {active && (() => {
            const { dom, chain, topContributors, maeUnity, maeAbs, maeSigned } = active;
            return (
              <>
                {/* Mode info */}
                <div style={{ padding: '5px 10px', background: '#1c1917', borderLeft: '3px solid #a78bfa', borderRadius: 4, fontSize: 9, ...MONO, color: '#d6d3d1', marginBottom: 10, lineHeight: 1.9 }}>
                  <span style={{ color: '#a78bfa', fontWeight: 700 }}>Dominant mode @ {activeHz} Hz: </span>
                  ({dom.nx},{dom.ny},{dom.nz}) {dom.type}
                  &nbsp;· f₀ = {fmt2(dom.freq)} Hz · Q = {fmt2(chain.q)}
                  &nbsp;· coupling = {fmt6(chain.coupling)} {chain.coupling < 0 ? <span style={{ color: '#f87171' }}>(negative sign)</span> : ''}
                </div>

                {/* Chain table */}
                <div style={{ fontSize: 10, fontWeight: 700, color: '#60a5fa', ...MONO, marginBottom: 4 }}>
                  Excitation chain — evaluated at f = f₀ = {fmt2(dom.freq)} Hz
                </div>
                <ChainTable chain={chain} />

                {/* Ranking */}
                <RankingTable chain={chain} />

                {/* Top contributors */}
                <TopContributorsTable contributors={topContributors} />

                {/* Coupling delta / MAE */}
                <CouplingDeltaPanel maeUnity={maeUnity} maeAbs={maeAbs} maeSigned={maeSigned} />
              </>
            );
          })()}
        </>
      )}
    </div>
  );
}