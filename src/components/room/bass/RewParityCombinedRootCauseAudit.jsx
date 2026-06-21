// RewParityCombinedRootCauseAudit.jsx
// Diagnostic-only: tests four suspected root-cause dimensions together and ranks
// all combinations by MAE improvement over the current production baseline.
// No production engine changes. No project state writes.

import React, { useState, useCallback, useRef } from 'react';

// ── REW Benchmark ──────────────────────────────────────────────────────────────
const REW_BENCHMARK = [
  { hz: 20,  db: 92.4 },
  { hz: 25,  db: 93.6 },
  { hz: 30,  db: 89.2 },
  { hz: 40,  db: 86.0 },
  { hz: 50,  db: 91.8 },
  { hz: 57,  db: 104.1 },
  { hz: 60,  db: 98.1 },
  { hz: 70,  db: 86.8 },
  { hz: 80,  db: 79.7 },
  { hz: 85,  db: 90.8 },
  { hz: 100, db: 98.3 },
  { hz: 120, db: 92.1 },
  { hz: 150, db: 94.3 },
  { hz: 180, db: 99.3 },
  { hz: 200, db: 99.5 },
];

const BANDS = [
  { label: '20–40',   lo: 20,  hi: 40  },
  { label: '40–80',   lo: 40,  hi: 80  },
  { label: '80–120',  lo: 80,  hi: 120 },
  { label: '120–200', lo: 120, hi: 200 },
];

// ── Dimension definitions ──────────────────────────────────────────────────────

const DIM_PARTICIPATION = [
  { id: 'all',   label: 'All modes',        bwFactor: null, topN: null },
  { id: 'top1',  label: 'Top 1 mode',       topN: 1,        bwFactor: null },
  { id: 'top3',  label: 'Top 3 modes',      topN: 3,        bwFactor: null },
  { id: 'top5',  label: 'Top 5 modes',      topN: 5,        bwFactor: null },
  { id: 'bw1',   label: '±1 BW',            bwFactor: 1.0,  topN: null },
  { id: 'bw2',   label: '±2 BW',            bwFactor: 2.0,  topN: null },
];

const DIM_COUPLING = [
  { id: 'both',     label: 'src×listener',       mode: 'both' },
  { id: 'src_only', label: 'src-side only',       mode: 'src_only' },
  { id: 'lst_only', label: 'listener-side only',  mode: 'lst_only' },
  { id: 'raw',      label: 'raw shape only',      mode: 'raw' },
  { id: 'lst_dist', label: 'listener-dist norm',  mode: 'lst_dist' },
  { id: 'soft_inv', label: 'soft inv-distance',   mode: 'soft_inv' },
];

const DIM_Q = [
  { id: 'q100', label: 'Current Q',  scale: 1.00 },
  { id: 'q060', label: 'Q × 0.60',   scale: 0.60 },
  { id: 'q075', label: 'Q × 0.75',   scale: 0.75 },
  { id: 'q090', label: 'Q × 0.90',   scale: 0.90 },
  { id: 'q110', label: 'Q × 1.10',   scale: 1.10 },
];

const DIM_FAMILY = [
  { id: 'current',  label: 'Current weights',       ax: 1.0,  ta: 1.0,  ob: 1.0 },
  { id: 'axred',    label: 'Axial reduced',          ax: 0.6,  ta: 1.0,  ob: 1.0 },
  { id: 'tared',    label: 'Tangential reduced',     ax: 1.0,  ta: 0.6,  ob: 1.0 },
  { id: 'balanced', label: 'Axial+Tang balanced',    ax: 0.75, ta: 0.75, ob: 1.0 },
  { id: 'nooblq',   label: 'Oblique ignored',        ax: 1.0,  ta: 1.0,  ob: 0.0 },
];

const TOTAL_COMBOS = DIM_PARTICIPATION.length * DIM_COUPLING.length * DIM_Q.length * DIM_FAMILY.length;
// = 6 × 6 × 5 × 5 = 900

// ── Acoustic helpers (self-contained) ─────────────────────────────────────────

const C = 343;
const FLAT_DB = 94;

function buildFreqAxis(lo = 20, hi = 200, ppo = 96) {
  const freqs = [];
  const total = Math.ceil(Math.log2(hi / lo) * ppo);
  for (let i = 0; i <= total; i++) {
    const hz = lo * Math.pow(2, i / ppo);
    if (hz > hi) break;
    freqs.push(hz);
  }
  if (freqs[freqs.length - 1] !== hi) freqs.push(hi);
  return freqs;
}

function modeType(nx, ny, nz) {
  const axes = (nx > 0 ? 1 : 0) + (ny > 0 ? 1 : 0) + (nz > 0 ? 1 : 0);
  return axes === 1 ? 'axial' : axes === 2 ? 'tangential' : 'oblique';
}

function buildModes(W, L, H, fMax = 210) {
  const modes = [];
  const nMax = Math.ceil((fMax / C) * 2 * Math.max(W, L, H)) + 3;
  for (let nx = 0; nx <= nMax; nx++) {
    for (let ny = 0; ny <= nMax; ny++) {
      for (let nz = 0; nz <= nMax; nz++) {
        if (nx === 0 && ny === 0 && nz === 0) continue;
        const f = (C / 2) * Math.sqrt((nx / W) ** 2 + (ny / L) ** 2 + (nz / H) ** 2);
        if (!Number.isFinite(f) || f <= 0 || f > fMax) continue;
        modes.push({ nx, ny, nz, freq: f, type: modeType(nx, ny, nz) });
      }
    }
  }
  return modes.sort((a, b) => a.freq - b.freq);
}

function cosShape(n, pos, dim) {
  return n > 0 ? Math.cos(n * Math.PI * pos / Math.max(dim, 1e-6)) : 1;
}

function sabineQ(f0, W, L, H, sa) {
  const V = W * L * H;
  const A =
    (L * W) * ((sa?.floor ?? 0.3) + (sa?.ceiling ?? 0.3)) +
    (W * H) * ((sa?.front ?? 0.3) + (sa?.back ?? 0.3)) +
    (L * H) * ((sa?.left ?? 0.3) + (sa?.right ?? 0.3));
  const rt60 = 0.161 * V / Math.max(A, 1e-6);
  return Math.max(1, Math.min(80, 2 * Math.PI * f0 * rt60 / 13.815));
}

function resonatorRe(f, f0, q) {
  const r = f / Math.max(f0, 1e-6);
  const rr = 1 - r * r;
  const ri = r / Math.max(q, 1e-6);
  const d = rr * rr + ri * ri;
  return { re: rr / d, im: -ri / d };
}

// Coupling function by mode
function getCoupling(nx, ny, nz, sx, sy, sz, rx, ry, rz, W, L, H, couplingMode, distSR) {
  const srcCos = cosShape(nx, sx, W) * cosShape(ny, sy, L) * cosShape(nz, sz, H);
  const lstCos = cosShape(nx, rx, W) * cosShape(ny, ry, L) * cosShape(nz, rz, H);
  switch (couplingMode) {
    case 'src_only': return srcCos;
    case 'lst_only': return lstCos;
    case 'raw':      return srcCos; // shape-only from source side
    case 'lst_dist': return srcCos * lstCos / Math.max(distSR, 0.1);
    case 'soft_inv': return srcCos * lstCos / Math.max(1 + distSR * 0.3, 0.1);
    default:         return srcCos * lstCos; // 'both'
  }
}

// Pre-compute mode Q values with scale
function prepareModes(rawModes, W, L, H, sa, axialQBase, qScale) {
  return rawModes.map(m => {
    const baseQ = m.type === 'axial' ? axialQBase
      : m.type === 'tangential' ? 3.9 : 2.5;
    const absQ = sabineQ(m.freq, W, L, H, sa);
    const q = Math.max(0.5, Math.min(baseQ, absQ) * qScale);
    return { ...m, q };
  });
}

// Run single combination
function runCombo(params) {
  const { W, L, H, sx, sy, sz, rx, ry, rz, modesWithQ,
          freqsHz, distSR, participation, coupling, familyWeights } = params;
  const srcAmp = Math.pow(10, FLAT_DB / 20);

  return freqsHz.map(f => {
    // Direct path
    const distD = Math.max(0.01, distSR);
    const directAmp = Math.pow(10, (FLAT_DB - 20 * Math.log10(distD)) / 20);
    const tof = -2 * Math.PI * f * distD / C;
    let sumRe = directAmp * Math.cos(tof);
    let sumIm = directAmp * Math.sin(tof);

    // Modal participation filter
    let eligible;
    if (participation.topN != null) {
      const ranked = modesWithQ
        .map(m => {
          const c = getCoupling(m.nx, m.ny, m.nz, sx, sy, sz, rx, ry, rz, W, L, H, coupling.mode, distSR);
          const { re, im } = resonatorRe(f, m.freq, m.q);
          return { m, mag: Math.abs(c) * Math.sqrt(re * re + im * im) };
        })
        .sort((a, b) => b.mag - a.mag)
        .slice(0, participation.topN)
        .map(r => r.m);
      eligible = ranked;
    } else if (participation.bwFactor != null) {
      eligible = modesWithQ.filter(m => {
        const bw = m.freq / Math.max(m.q, 1e-6);
        return Math.abs(m.freq - f) <= participation.bwFactor * bw;
      });
    } else {
      eligible = modesWithQ;
    }

    for (const mode of eligible) {
      const family = mode.type;
      const fw = family === 'axial' ? familyWeights.ax
        : family === 'tangential' ? familyWeights.ta : familyWeights.ob;
      if (fw === 0) continue;

      const c = getCoupling(mode.nx, mode.ny, mode.nz, sx, sy, sz, rx, ry, rz, W, L, H, coupling.mode, distSR);
      if (!Number.isFinite(c) || c === 0) continue;

      const { re: tRe, im: tIm } = resonatorRe(f, mode.freq, mode.q);
      const modeOrder = Math.abs(mode.nx) + Math.abs(mode.ny) + Math.abs(mode.nz);
      const orderWeight = modeOrder >= 2 ? 0.50 : 1.0;
      const hoScale = (mode.type === 'axial' && modeOrder >= 2) ? 0.50 : 1.0;
      const gain = srcAmp * c * fw * orderWeight * hoScale;
      sumRe += gain * tRe;
      sumIm += gain * tIm;
    }

    return 20 * Math.log10(Math.max(Math.sqrt(sumRe * sumRe + sumIm * sumIm), 1e-10));
  });
}

// Scoring
function interpolate(freqs, vals, hz) {
  if (!freqs?.length) return null;
  if (hz <= freqs[0]) return vals[0];
  if (hz >= freqs[freqs.length - 1]) return vals[freqs.length - 1];
  for (let i = 0; i < freqs.length - 1; i++) {
    if (hz >= freqs[i] && hz <= freqs[i + 1]) {
      const t = (hz - freqs[i]) / (freqs[i + 1] - freqs[i]);
      return vals[i] + (vals[i + 1] - vals[i]) * t;
    }
  }
  return null;
}

function scoreResponse(freqs, vals) {
  let sumErr = 0, worstErr = 0, worstHz = null, count = 0;
  for (const { hz, db } of REW_BENCHMARK) {
    const v = interpolate(freqs, vals, hz);
    if (!Number.isFinite(v)) continue;
    const err = Math.abs(v - db);
    sumErr += err;
    if (err > worstErr) { worstErr = err; worstHz = hz; }
    count++;
  }
  if (count === 0) return null;
  const bands = BANDS.map(({ lo, hi }) => {
    const pts = REW_BENCHMARK.filter(p => p.hz >= lo && p.hz <= hi);
    let s = 0, c2 = 0;
    for (const { hz, db } of pts) {
      const v = interpolate(freqs, vals, hz);
      if (!Number.isFinite(v)) continue;
      s += Math.abs(v - db); c2++;
    }
    return c2 > 0 ? s / c2 : null;
  });
  return { mae: sumErr / count, worstErr, worstHz, bands };
}

function fmt(v, d = 2) { return Number.isFinite(v) ? Number(v).toFixed(d) : '—'; }

// ── Conclusion builder ─────────────────────────────────────────────────────────

function buildSummary(currentScore, top20, bestPerFamily) {
  if (!currentScore || !top20?.length) return null;
  const best = top20[0];
  const delta = currentScore.mae - best.score.mae;
  const isBaseline = best.p.id === 'all' && best.c.id === 'both' && best.q.id === 'q100' && best.f.id === 'current';

  // Which dimensions change in the top 5?
  const top5 = top20.slice(0, 5);
  const pChange = top5.filter(r => r.p.id !== 'all').length;
  const cChange = top5.filter(r => r.c.id !== 'both').length;
  const qChange = top5.filter(r => r.q.id !== 'q100').length;
  const fChange = top5.filter(r => r.f.id !== 'current').length;

  const drivers = [];
  if (pChange >= 3) drivers.push('modal participation / selection');
  if (cChange >= 3) drivers.push('source coupling / excitation');
  if (qChange >= 3) drivers.push('Q scale');
  if (fChange >= 3) drivers.push('modal family weighting');

  const confidence = delta >= 2.0 ? 'HIGH' : delta >= 0.8 ? 'MEDIUM' : 'LOW';
  const nextAction = (() => {
    if (isBaseline || delta < 0.3) {
      return 'None of the tested dimensions explain the remaining error. Look elsewhere (resonator shape, boundary loss, source curve).';
    }
    const topDriver = drivers.length > 0 ? drivers[0]
      : (best.p.id !== 'all') ? 'modal participation / selection'
      : (best.c.id !== 'both') ? 'source coupling / excitation'
      : (best.q.id !== 'q100') ? 'Q scale'
      : 'modal family weighting';
    return `Test applying "${topDriver}" in the production engine: specifically "${
      best.p.id !== 'all' ? best.p.label
      : best.c.id !== 'both' ? best.c.label
      : best.q.id !== 'q100' ? best.q.label
      : best.f.label
    }".`;
  })();

  const cause = isBaseline ? 'current production (no change)' :
    drivers.length >= 2 ? `combination: ${drivers.join(' + ')}` :
    drivers.length === 1 ? drivers[0] :
    best.p.id !== 'all' ? 'modal participation / selection' :
    best.c.id !== 'both' ? 'source coupling / excitation' :
    best.q.id !== 'q100' ? 'Q scale' : 'modal family weighting';

  return {
    bestMae: best.score.mae,
    delta,
    cause,
    drivers,
    confidence,
    nextAction,
    worstRemainingHz: best.score.worstHz,
    isBaseline,
  };
}

// ── Shared table header style ──────────────────────────────────────────────────
const thS = {
  textAlign: 'right', padding: '3px 4px', fontSize: 9, fontWeight: 700,
  background: '#f0fdf4', borderBottom: '2px solid #6ee7b7', color: '#065f46', whiteSpace: 'nowrap',
};
const tdS = { textAlign: 'right', padding: '2px 4px', fontSize: 9, fontFamily: 'monospace' };

// ── ResultRow component (avoids inline table logic repetition) ─────────────────
function ResultRow({ row, currentMae, rank, isBaseline }) {
  const maeVsCurrent = Number.isFinite(currentMae) ? row.score.mae - currentMae : null;
  const improved = maeVsCurrent !== null && maeVsCurrent < -0.01;
  const rankLabel = isBaseline ? '★' : rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
  const bg = isBaseline ? '#fff7ed' : rank <= 3 ? '#f0fdf4' : undefined;

  return (
    <tr style={{ borderBottom: '1px solid #a7f3d0', background: bg }}>
      <td style={{ ...tdS, textAlign: 'center', fontWeight: 700, color: isBaseline ? '#b45309' : '#065f46', fontSize: 10 }}>
        {rankLabel}
      </td>
      <td style={{ ...tdS, textAlign: 'left', maxWidth: 90, whiteSpace: 'normal', color: '#374151', fontSize: 9 }}>{row.p.label}</td>
      <td style={{ ...tdS, textAlign: 'left', maxWidth: 90, whiteSpace: 'normal', color: '#374151', fontSize: 9 }}>{row.c.label}</td>
      <td style={{ ...tdS, textAlign: 'left', color: '#374151', fontSize: 9 }}>{row.q.label}</td>
      <td style={{ ...tdS, textAlign: 'left', color: '#374151', fontSize: 9 }}>{row.f.label}</td>
      <td style={{ ...tdS, fontWeight: isBaseline || rank <= 3 ? 700 : 400, color: improved ? '#15803d' : isBaseline ? '#b45309' : '#374151' }}>
        {fmt(row.score.mae, 3)}
      </td>
      <td style={{ ...tdS, fontWeight: 700, color: improved ? '#15803d' : '#6b7280' }}>
        {isBaseline ? '—' : maeVsCurrent !== null ? (improved ? `▼${fmt(Math.abs(maeVsCurrent), 2)}` : `▲${fmt(maeVsCurrent, 2)}`) : '—'}
      </td>
      <td style={{ ...tdS, color: (row.score.worstErr ?? 0) > 5 ? '#dc2626' : '#374151' }}>{fmt(row.score.worstErr, 2)}</td>
      <td style={{ ...tdS }}>{row.score.worstHz != null ? `${row.score.worstHz}` : '—'}</td>
      {row.score.bands.map((v, bi) => {
        const cur = currentMae; // band comparison skipped for simplicity in this table
        return <td key={bi} style={{ ...tdS, color: v != null && v < 2 ? '#15803d' : v != null && v > 4 ? '#dc2626' : '#374151' }}>{fmt(v, 2)}</td>;
      })}
    </tr>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function RewParityCombinedRootCauseAudit({
  roomDims, seat, sub, surfaceAbsorption, activeSettings, onResult,
}) {
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showTop20, setShowTop20] = useState(false);
  const [showBestPerFamily, setShowBestPerFamily] = useState(false);
  const [showBestPerBand, setShowBestPerBand] = useState(false);
  const cancelRef = useRef(false);

  const canRun = !!(
    roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM &&
    seat?.x != null && seat?.y != null && sub?.x != null && sub?.y != null
  );

  const runAudit = useCallback(async () => {
    if (!canRun || running) return;
    setRunning(true);
    setResults(null);
    setProgress(0);
    cancelRef.current = false;

    const W = Number(roomDims.widthM);
    const L = Number(roomDims.lengthM);
    const H = Number(roomDims.heightM);
    const sx = Number(sub.x);
    const sy = Number(sub.y);
    const sz = Number.isFinite(Number(sub.z)) ? Number(sub.z) : 0.35;
    const rx = Number(seat.x);
    const ry = Number(seat.y);
    const rz = Number.isFinite(Number(seat.z)) ? Number(seat.z) : 1.2;
    const axialQBase = activeSettings?.axialQ ?? 4.0;
    const sa = surfaceAbsorption ?? {};

    const dx = sx - rx, dy = sy - ry, dz = sz - rz;
    const distSR = Math.max(0.01, Math.sqrt(dx * dx + dy * dy + dz * dz));

    const rawModes = buildModes(W, L, H, 210);
    const freqsHz = buildFreqAxis(20, 200);

    const all = [];
    let done = 0;
    const BATCH = 30; // combos per yield

    for (const p of DIM_PARTICIPATION) {
      for (const c of DIM_COUPLING) {
        for (const q of DIM_Q) {
          for (const f of DIM_FAMILY) {
            if (cancelRef.current) break;

            const modesWithQ = prepareModes(rawModes, W, L, H, sa, axialQBase, q.scale);
            const vals = runCombo({ W, L, H, sx, sy, sz, rx, ry, rz, modesWithQ, freqsHz, distSR, participation: p, coupling: c, familyWeights: f });
            const score = scoreResponse(freqsHz, vals);
            if (score) all.push({ p, c, q, f, score });

            done++;
            if (done % BATCH === 0) {
              setProgress(Math.round((done / TOTAL_COMBOS) * 100));
              await new Promise(r => setTimeout(r, 0));
            }
          }
          if (cancelRef.current) break;
        }
        if (cancelRef.current) break;
      }
      if (cancelRef.current) break;
    }

    if (cancelRef.current) { setRunning(false); return; }

    // Sort all by MAE ascending
    all.sort((a, b) => a.score.mae - b.score.mae);

    const currentRow = all.find(r => r.p.id === 'all' && r.c.id === 'both' && r.q.id === 'q100' && r.f.id === 'current') ?? all[all.length - 1];
    const top20 = all.slice(0, 20);

    // Best per root-cause family (what changes from current)
    const bestPerFamily = {
      participation: all.filter(r => r.p.id !== 'all').sort((a, b) => a.score.mae - b.score.mae)[0] ?? null,
      coupling:      all.filter(r => r.c.id !== 'both').sort((a, b) => a.score.mae - b.score.mae)[0] ?? null,
      qScale:        all.filter(r => r.q.id !== 'q100').sort((a, b) => a.score.mae - b.score.mae)[0] ?? null,
      family:        all.filter(r => r.f.id !== 'current').sort((a, b) => a.score.mae - b.score.mae)[0] ?? null,
    };

    // Best per frequency band
    const bestPerBand = BANDS.map((band, bi) => {
      return {
        band,
        best: all
          .filter(r => r.score.bands[bi] != null)
          .sort((a, b) => (a.score.bands[bi] ?? 99) - (b.score.bands[bi] ?? 99))[0] ?? null,
      };
    });

    const summary = buildSummary(currentRow?.score, top20, bestPerFamily);

    const resultData = { all, top20, currentRow, bestPerFamily, bestPerBand, summary };
    setResults(resultData);
    setRunning(false);
    setProgress(100);

    if (onResult && summary) {
      onResult({
        bestMae: summary.bestMae,
        improvement: summary.delta,
        conclusion: `Combined audit: ${summary.cause} (${summary.confidence} confidence). ${summary.nextAction}`,
      });
    }
  }, [roomDims, seat, sub, surfaceAbsorption, activeSettings, canRun, running, onResult]);

  const { currentRow, top20, bestPerFamily, bestPerBand, summary } = results ?? {};
  const currentMae = currentRow?.score?.mae ?? null;

  return (
    <div style={{
      marginTop: 14, border: '2px solid #d97706', borderRadius: 10,
      background: '#fffbeb', padding: '10px 14px',
    }}>
      {/* Header */}
      <div style={{ fontWeight: 700, color: '#92400e', fontSize: 12, fontFamily: 'monospace', marginBottom: 4 }}>
        REW Parity Combined Root Cause Audit
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          {TOTAL_COMBOS} combinations · 4 dimensions · diagnostic only
        </span>
      </div>
      <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#6b7280', marginBottom: 8 }}>
        Tests modal participation × source coupling × Q scale × modal family weighting together.
        Ranks every combination by MAE improvement over current production behaviour.
      </div>

      {!canRun && (
        <div style={{ fontSize: 10, color: '#b45309', fontFamily: 'monospace', marginBottom: 6 }}>
          ⚠ Need room dims + valid seat + valid sub to run.
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <button
          onClick={runAudit}
          disabled={running || !canRun}
          style={{
            height: 30, padding: '0 16px', borderRadius: 6,
            border: '1px solid #b45309', background: running ? '#e5e7eb' : '#d97706',
            color: running ? '#6b7280' : '#fff', fontSize: 11, fontFamily: 'monospace',
            cursor: running || !canRun ? 'not-allowed' : 'pointer', fontWeight: 700,
          }}
        >
          {running ? `Running… ${progress}% (${TOTAL_COMBOS} combos)` : results ? 'Re-run Combined Audit' : 'Run Combined Root Cause Audit'}
        </button>
        {running && (
          <button
            onClick={() => { cancelRef.current = true; }}
            style={{ fontSize: 9, padding: '2px 8px', borderRadius: 4, border: '1px solid #fca5a5', background: '#fff1f2', color: '#be123c', cursor: 'pointer', fontFamily: 'monospace' }}
          >Cancel</button>
        )}
      </div>

      {running && (
        <div style={{ height: 6, background: '#fde68a', borderRadius: 3, overflow: 'hidden', marginBottom: 10 }}>
          <div style={{ height: '100%', width: `${progress}%`, background: '#d97706', transition: 'width 0.2s' }} />
        </div>
      )}

      {results && summary && (
        <>
          {/* ── Big-picture summary ── */}
          <div style={{
            border: `2px solid ${summary.isBaseline ? '#6ee7b7' : summary.delta >= 2 ? '#dc2626' : '#d97706'}`,
            borderRadius: 8, background: summary.isBaseline ? '#f0fdf4' : summary.delta >= 2 ? '#fef2f2' : '#fefce8',
            padding: '10px 14px', marginBottom: 12,
          }}>
            <div style={{ fontWeight: 700, fontSize: 11, fontFamily: 'monospace', color: summary.isBaseline ? '#065f46' : summary.delta >= 2 ? '#991b1b' : '#92400e', marginBottom: 6 }}>
              ROOT CAUSE SUMMARY
            </div>

            {/* 4-column KPI strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 10 }}>
              {[
                { label: 'Current MAE', value: fmt(currentMae, 3) + ' dB', color: '#b45309' },
                { label: 'Best MAE', value: fmt(summary.bestMae, 3) + ' dB', color: '#065f46' },
                { label: 'Total improvement', value: summary.delta > 0 ? `▼ ${fmt(summary.delta, 3)} dB` : '—', color: summary.delta >= 2 ? '#dc2626' : summary.delta >= 0.8 ? '#b45309' : '#6b7280' },
                { label: 'Confidence', value: summary.confidence, color: summary.confidence === 'HIGH' ? '#dc2626' : summary.confidence === 'MEDIUM' ? '#b45309' : '#6b7280' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid #fde68a', borderRadius: 6, padding: '6px 8px' }}>
                  <div style={{ fontSize: 9, color: '#6b7280', fontFamily: 'monospace' }}>{label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color, fontFamily: 'monospace' }}>{value}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <div style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid #fde68a', borderRadius: 6, padding: '6px 8px' }}>
                <div style={{ fontSize: 9, color: '#6b7280', fontFamily: 'monospace' }}>Most likely cause</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#92400e', fontFamily: 'monospace' }}>{summary.cause}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid #fde68a', borderRadius: 6, padding: '6px 8px' }}>
                <div style={{ fontSize: 9, color: '#6b7280', fontFamily: 'monospace' }}>Worst remaining frequency</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', fontFamily: 'monospace' }}>
                  {summary.worstRemainingHz != null ? `${summary.worstRemainingHz} Hz` : '—'}
                </div>
              </div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid #fde68a', borderRadius: 6, padding: '7px 10px', fontSize: 10, fontFamily: 'monospace', color: '#78350f' }}>
              <span style={{ fontWeight: 700 }}>Recommended next production change: </span>{summary.nextAction}
            </div>
          </div>

          {/* ── Best per root-cause family ── */}
          <div style={{ marginBottom: 12 }}>
            <button
              onClick={() => setShowBestPerFamily(v => !v)}
              style={{ fontWeight: 700, color: '#065f46', fontSize: 10, fontFamily: 'monospace', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 4 }}
            >
              {showBestPerFamily ? '▼' : '▶'} Best result per root-cause dimension
            </button>
            {showBestPerFamily && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 700 }}>
                  <thead>
                    <tr>
                      {['Dimension', 'Best variant', 'MAE', 'Δ vs current', 'Worst err', 'Worst Hz', ...BANDS.map(b => b.label)].map((h, i) => (
                        <th key={h} style={{ ...thS, textAlign: i < 2 ? 'left' : 'right' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: 'Modal participation', key: 'participation', dimLabel: r => r?.p?.label ?? '—' },
                      { label: 'Source coupling',     key: 'coupling',      dimLabel: r => r?.c?.label ?? '—' },
                      { label: 'Q scale',             key: 'qScale',        dimLabel: r => r?.q?.label ?? '—' },
                      { label: 'Family weighting',    key: 'family',        dimLabel: r => r?.f?.label ?? '—' },
                    ].map(({ label, key, dimLabel }) => {
                      const row = bestPerFamily?.[key];
                      if (!row) return null;
                      const delta = Number.isFinite(currentMae) ? currentMae - row.score.mae : null;
                      const improved = delta != null && delta > 0.01;
                      return (
                        <tr key={key} style={{ borderBottom: '1px solid #a7f3d0' }}>
                          <td style={{ ...tdS, textAlign: 'left', fontWeight: 700, color: '#065f46' }}>{label}</td>
                          <td style={{ ...tdS, textAlign: 'left', color: '#374151' }}>{dimLabel(row)}</td>
                          <td style={{ ...tdS, fontWeight: 700, color: improved ? '#15803d' : '#374151' }}>{fmt(row.score.mae, 3)}</td>
                          <td style={{ ...tdS, fontWeight: 700, color: improved ? '#15803d' : '#6b7280' }}>
                            {delta != null ? (improved ? `▼${fmt(delta, 2)}` : `▲${fmt(Math.abs(delta), 2)}`) : '—'}
                          </td>
                          <td style={{ ...tdS }}>{fmt(row.score.worstErr, 2)}</td>
                          <td style={{ ...tdS }}>{row.score.worstHz ?? '—'}</td>
                          {row.score.bands.map((v, bi) => (
                            <td key={bi} style={{ ...tdS, color: v != null && v < 2 ? '#15803d' : v != null && v > 4 ? '#dc2626' : '#374151' }}>{fmt(v, 2)}</td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Best per frequency band ── */}
          <div style={{ marginBottom: 12 }}>
            <button
              onClick={() => setShowBestPerBand(v => !v)}
              style={{ fontWeight: 700, color: '#065f46', fontSize: 10, fontFamily: 'monospace', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 4 }}
            >
              {showBestPerBand ? '▼' : '▶'} Best result per frequency band
            </button>
            {showBestPerBand && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 700 }}>
                  <thead>
                    <tr>
                      {['Band', 'Participation', 'Coupling', 'Q', 'Family', 'Band MAE', 'Overall MAE'].map((h, i) => (
                        <th key={h} style={{ ...thS, textAlign: i === 0 ? 'left' : 'right' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bestPerBand?.map(({ band, best }, bi) => {
                      if (!best) return null;
                      return (
                        <tr key={band.label} style={{ borderBottom: '1px solid #a7f3d0' }}>
                          <td style={{ ...tdS, textAlign: 'left', fontWeight: 700, color: '#065f46' }}>{band.label} Hz</td>
                          <td style={{ ...tdS }}>{best.p.label}</td>
                          <td style={{ ...tdS }}>{best.c.label}</td>
                          <td style={{ ...tdS }}>{best.q.label}</td>
                          <td style={{ ...tdS }}>{best.f.label}</td>
                          <td style={{ ...tdS, fontWeight: 700, color: '#065f46' }}>{fmt(best.score.bands[bi], 2)}</td>
                          <td style={{ ...tdS }}>{fmt(best.score.mae, 3)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Top 20 combinations ── */}
          <div>
            <button
              onClick={() => setShowTop20(v => !v)}
              style={{ fontWeight: 700, color: '#065f46', fontSize: 10, fontFamily: 'monospace', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 4 }}
            >
              {showTop20 ? '▼' : '▶'} Top 20 best combinations
            </button>
            {showTop20 && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 800 }}>
                  <thead>
                    <tr>
                      {['Rank', 'Participation', 'Coupling', 'Q', 'Family', 'MAE', 'Δ vs cur', 'Worst err', 'Worst Hz', ...BANDS.map(b => b.label)].map((h, i) => (
                        <th key={h} style={{ ...thS, textAlign: i <= 4 ? 'left' : 'right' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {/* Current production row first */}
                    {currentRow && (
                      <ResultRow row={currentRow} currentMae={currentMae} rank={null} isBaseline />
                    )}
                    {top20?.map((row, i) => {
                      const isCurrentProd = row.p.id === 'all' && row.c.id === 'both' && row.q.id === 'q100' && row.f.id === 'current';
                      if (isCurrentProd) return null; // already shown above
                      return <ResultRow key={i} row={row} currentMae={currentMae} rank={i + 1} isBaseline={false} />;
                    })}
                  </tbody>
                </table>
                <div style={{ marginTop: 4, fontSize: 9, fontFamily: 'monospace', color: '#6b7280' }}>
                  ★ = current production · ▼ = improved vs current · ▲ = worse
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}