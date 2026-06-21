// RewEngineShootout.jsx
// Diagnostic-only: Compare complete candidate engines directly against REW benchmark.
// Runs the current production engine + top candidates from the Generator, overlays all curves,
// scores and ranks them, highlights the winner, and offers a "Promote" button.
// Does NOT modify rewBassEngine, production defaults, or any project state.

import React, { useState, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ResponsiveContainer
} from 'recharts';

// ── Shared REW benchmark ───────────────────────────────────────────────────────
const REW_BENCHMARK = [
  { hz: 20,  db: 92.4 }, { hz: 25,  db: 93.6 }, { hz: 30,  db: 89.2 },
  { hz: 40,  db: 86.0 }, { hz: 50,  db: 91.8 }, { hz: 57,  db: 104.1 },
  { hz: 60,  db: 98.1 }, { hz: 70,  db: 86.8 }, { hz: 80,  db: 79.7 },
  { hz: 85,  db: 90.8 }, { hz: 100, db: 98.3 }, { hz: 120, db: 92.1 },
  { hz: 150, db: 94.3 }, { hz: 180, db: 99.3 }, { hz: 200, db: 99.5 },
];

const BANDS = [
  { label: '20–40',   lo: 20,  hi: 40  },
  { label: '40–80',   lo: 40,  hi: 80  },
  { label: '80–120',  lo: 80,  hi: 120 },
  { label: '120–200', lo: 120, hi: 200 },
];

const FLAT_SOURCE_DB = 94;
const C = 343;

// ── Engine palette ─────────────────────────────────────────────────────────────
const ENGINE_COLORS = {
  current:     '#213428',
  candidate_1: '#2563eb',
  candidate_2: '#dc2626',
  candidate_3: '#d97706',
  candidate_7: '#7c3aed',
  rew:         '#f97316',
};

// ── Acoustic primitives (duplicated locally to keep file self-contained) ──────

function buildFreqAxis(minHz = 20, maxHz = 200) {
  const freqs = [];
  const ppo = 48;
  const total = Math.ceil(Math.log2(maxHz / minHz) * ppo);
  for (let i = 0; i <= total; i++) {
    const hz = minHz * Math.pow(2, i / ppo);
    if (hz > maxHz) break;
    freqs.push(hz);
  }
  if (freqs[freqs.length - 1] !== maxHz) freqs.push(maxHz);
  return freqs;
}

function buildModes(W, L, H, fMax) {
  const modes = [];
  const nMax = Math.ceil((fMax / C) * 2 * Math.max(W, L, H)) + 4;
  for (let nx = 0; nx <= nMax; nx++)
    for (let ny = 0; ny <= nMax; ny++)
      for (let nz = 0; nz <= nMax; nz++) {
        if (nx === 0 && ny === 0 && nz === 0) continue;
        const freq = (C / 2) * Math.sqrt((nx / W) ** 2 + (ny / L) ** 2 + (nz / H) ** 2);
        if (!Number.isFinite(freq) || freq <= 0 || freq > fMax) continue;
        const axes = (nx > 0 ? 1 : 0) + (ny > 0 ? 1 : 0) + (nz > 0 ? 1 : 0);
        const type = axes === 1 ? 'axial' : axes === 2 ? 'tangential' : 'oblique';
        modes.push({ nx, ny, nz, freq, type });
      }
  return modes.sort((a, b) => a.freq - b.freq);
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

function typeBaseQ(type, axialQ) {
  if (type === 'axial') return axialQ;
  if (type === 'tangential') return 3.9;
  return 2.5;
}

function cosShape(n, pos, dim) {
  return n > 0 ? Math.cos(n * Math.PI * pos / Math.max(dim, 1e-6)) : 1;
}

function resonator(f, f0, q) {
  const r = f / Math.max(f0, 1e-6);
  const rr = 1 - r * r;
  const ri = r / Math.max(q, 1e-6);
  const d = rr * rr + ri * ri;
  return { re: rr / d, im: -ri / d, transferMag: Math.sqrt((rr * rr + ri * ri) / (d * d)) };
}

// ── Simulate one candidate config ─────────────────────────────────────────────

function simulateEngine(cfg, W, L, H, modesWithBaseQ, freqsHz, sx, sy, sz, rx, ry, rz) {
  const { participation, coupling, qScale, family, selection } = cfg;
  const srcAmp = Math.pow(10, FLAT_SOURCE_DB / 20);

  const modes = modesWithBaseQ.map(m => ({
    ...m, q: Math.max(1, Math.min(80, m.baseQ * qScale)),
  }));

  return freqsHz.map(f => {
    const dist = Math.max(0.01, Math.sqrt((sx - rx) ** 2 + (sy - ry) ** 2 + (sz - rz) ** 2));
    const directAmp = srcAmp * Math.pow(10, -20 * Math.log10(dist) / 20);
    const tof = -2 * Math.PI * f * dist / C;
    let sumRe = directAmp * Math.cos(tof);
    let sumIm = directAmp * Math.sin(tof);

    const entries = modes.map(mode => {
      const sc = cosShape(mode.nx, sx, W) * cosShape(mode.ny, sy, L) * cosShape(mode.nz, sz, H);
      const rc = cosShape(mode.nx, rx, W) * cosShape(mode.ny, ry, L) * cosShape(mode.nz, rz, H);

      let coupVal;
      if (coupling.id === 'bw_local') {
        const bw = mode.freq / Math.max(mode.q, 1e-6);
        coupVal = Math.abs(mode.freq - f) <= bw ? sc * rc : 0;
      } else {
        coupVal = coupling.fn(sc, rc);
      }

      const fw = mode.type === 'axial' ? family.axial
               : mode.type === 'tangential' ? family.tang : family.obli;
      const modeOrder = Math.abs(mode.nx) + Math.abs(mode.ny) + Math.abs(mode.nz);
      const orderWeight = modeOrder >= 2 ? 0.50 : 1.0;
      const hoScale = (mode.type === 'axial' && modeOrder >= 2) ? 0.50 : 1.0;
      const { re: tRe, im: tIm, transferMag } = resonator(f, mode.freq, mode.q);
      const bw = mode.freq / Math.max(mode.q, 1e-6);

      let rankMetric;
      if (selection.id === 'coupling') rankMetric = Math.abs(coupVal);
      else if (selection.id === 'transfer') rankMetric = transferMag;
      else if (selection.id === 'energy') rankMetric = transferMag * Math.abs(coupVal) * fw * orderWeight;
      else rankMetric = 1 / Math.max(bw, 1e-6);

      const gain = srcAmp * coupVal * fw * orderWeight * hoScale;
      return { re: gain * tRe, im: gain * tIm, rankMetric };
    });

    if (participation.topN != null) {
      const sorted = [...entries].sort((a, b) => b.rankMetric - a.rankMetric);
      for (let k = 0; k < Math.min(participation.topN, sorted.length); k++) {
        const e = sorted[k];
        if (Number.isFinite(e.re) && Number.isFinite(e.im)) { sumRe += e.re; sumIm += e.im; }
      }
    } else if (participation.bwFactor != null) {
      modes.forEach((mode, mi) => {
        const bw = mode.freq / Math.max(mode.q, 1e-6);
        if (Math.abs(mode.freq - f) <= participation.bwFactor * bw) {
          const e = entries[mi];
          if (Number.isFinite(e.re) && Number.isFinite(e.im)) { sumRe += e.re; sumIm += e.im; }
        }
      });
    } else {
      entries.forEach(e => {
        if (Number.isFinite(e.re) && Number.isFinite(e.im)) { sumRe += e.re; sumIm += e.im; }
      });
    }

    return 20 * Math.log10(Math.max(Math.sqrt(sumRe * sumRe + sumIm * sumIm), 1e-10));
  });
}

// ── Scoring ───────────────────────────────────────────────────────────────────

function interpolate(freqsHz, splDb, targetHz) {
  if (!freqsHz?.length) return null;
  if (targetHz <= freqsHz[0]) return splDb[0];
  if (targetHz >= freqsHz[freqsHz.length - 1]) return splDb[splDb.length - 1];
  for (let i = 0; i < freqsHz.length - 1; i++) {
    if (targetHz >= freqsHz[i] && targetHz <= freqsHz[i + 1]) {
      const t = (targetHz - freqsHz[i]) / (freqsHz[i + 1] - freqsHz[i]);
      return splDb[i] + (splDb[i + 1] - splDb[i]) * t;
    }
  }
  return null;
}

function scoreResponse(freqsHz, splDb) {
  let sumErr = 0, worstErr = 0, worstHz = null, count = 0;
  for (const { hz, db } of REW_BENCHMARK) {
    const v = interpolate(freqsHz, splDb, hz);
    if (!Number.isFinite(v)) continue;
    const err = Math.abs(v - db);
    sumErr += err;
    if (err > worstErr) { worstErr = err; worstHz = hz; }
    count++;
  }
  if (count === 0) return null;
  const bands = BANDS.map(({ lo, hi }) => {
    const pts = REW_BENCHMARK.filter(p => p.hz >= lo && p.hz <= hi);
    let s = 0, c = 0;
    for (const { hz, db } of pts) {
      const v = interpolate(freqsHz, splDb, hz);
      if (!Number.isFinite(v)) continue;
      s += Math.abs(v - db); c++;
    }
    return c > 0 ? s / c : null;
  });
  return { mae: sumErr / count, worstErr, worstHz, bands };
}

// ── Engine definitions ────────────────────────────────────────────────────────
// "Current" = All modes, src×rcv coupling, Q×1.0, all families equal, coupling-ranked
// Candidates 1–3 and 7 pulled from the canonical Generator top-10 pattern
// (the user sees the actual numbers after running the Generator; these are the specs)

const PARTICIPATION_ALL   = { id: 'all',    label: 'All modes' };
const PARTICIPATION_TOP5  = { id: 'top5',   label: 'Top 5',  topN: 5 };
const PARTICIPATION_TOP3  = { id: 'top3',   label: 'Top 3',  topN: 3 };
const PARTICIPATION_BW2   = { id: 'bw2',    label: '±2 BW',  bwFactor: 2.0 };
const PARTICIPATION_BW1   = { id: 'bw1',    label: '±1 BW',  bwFactor: 1.0 };

const COUPLING_SRC_X_RCV  = { id: 'src_x_rcv', label: 'Source × listener', fn: (sc, rc) => sc * rc };
const COUPLING_RCV_ONLY   = { id: 'rcv_only',  label: 'Listener only',     fn: (_sc, rc) => rc };
const COUPLING_SRC_ONLY   = { id: 'src_only',  label: 'Source only',        fn: (sc) => sc };
const COUPLING_BW_LOCAL   = { id: 'bw_local',  label: 'Bandwidth-local',    fn: (sc, rc) => sc * rc };

const FAMILY_CURRENT  = { id: 'current',  label: 'Current',            axial: 1.0, tang: 1.0, obli: 1.0 };
const FAMILY_TANG_RED = { id: 'tang_red', label: 'Tangential reduced',  axial: 1.0, tang: 0.6, obli: 1.0 };
const FAMILY_BALANCED = { id: 'balanced', label: 'Balanced',            axial: 0.8, tang: 0.8, obli: 0.8 };
const FAMILY_OBLI_OFF = { id: 'obli_off', label: 'Oblique ignored',     axial: 1.0, tang: 1.0, obli: 0.0 };
const FAMILY_AXIAL_RED= { id: 'axial_red',label: 'Axial reduced',       axial: 0.6, tang: 1.0, obli: 1.0 };

const SEL_COUPLING  = { id: 'coupling',  label: 'Coupling ranked' };
const SEL_TRANSFER  = { id: 'transfer',  label: 'Transfer ranked' };
const SEL_ENERGY    = { id: 'energy',    label: 'Energy ranked' };
const SEL_BANDWIDTH = { id: 'bandwidth', label: 'Bandwidth ranked' };

const ENGINE_DEFS = [
  {
    id: 'current',
    label: 'Current Engine',
    shortLabel: 'Current',
    color: ENGINE_COLORS.current,
    cfg: {
      participation: PARTICIPATION_ALL,
      coupling: COUPLING_SRC_X_RCV,
      qScale: 1.0,
      family: FAMILY_CURRENT,
      selection: SEL_COUPLING,
    },
  },
  {
    id: 'candidate_1',
    label: 'Candidate #1',
    shortLabel: 'Cand #1',
    color: ENGINE_COLORS.candidate_1,
    cfg: {
      participation: PARTICIPATION_TOP5,
      coupling: COUPLING_RCV_ONLY,
      qScale: 1.0,
      family: FAMILY_TANG_RED,
      selection: SEL_COUPLING,
    },
  },
  {
    id: 'candidate_2',
    label: 'Candidate #2',
    shortLabel: 'Cand #2',
    color: ENGINE_COLORS.candidate_2,
    cfg: {
      participation: PARTICIPATION_TOP5,
      coupling: COUPLING_RCV_ONLY,
      qScale: 0.90,
      family: FAMILY_TANG_RED,
      selection: SEL_COUPLING,
    },
  },
  {
    id: 'candidate_3',
    label: 'Candidate #3',
    shortLabel: 'Cand #3',
    color: ENGINE_COLORS.candidate_3,
    cfg: {
      participation: PARTICIPATION_TOP5,
      coupling: COUPLING_RCV_ONLY,
      qScale: 1.0,
      family: FAMILY_BALANCED,
      selection: SEL_COUPLING,
    },
  },
  {
    id: 'candidate_7',
    label: 'Candidate #7',
    shortLabel: 'Cand #7',
    color: ENGINE_COLORS.candidate_7,
    cfg: {
      participation: PARTICIPATION_BW2,
      coupling: COUPLING_RCV_ONLY,
      qScale: 1.0,
      family: FAMILY_TANG_RED,
      selection: SEL_ENERGY,
    },
  },
];

// ── Custom tooltip ─────────────────────────────────────────────────────────────

function ShootoutTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 10px', fontSize: 9, fontFamily: 'monospace', maxWidth: 220 }}>
      <div style={{ fontWeight: 700, marginBottom: 4, color: '#1e293b' }}>{Number(label).toFixed(1)} Hz</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ color: p.color, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span>{p.name}</span>
          <span style={{ fontWeight: 700 }}>{Number.isFinite(p.value) ? p.value.toFixed(1) : '—'} dB</span>
        </div>
      ))}
    </div>
  );
}

// ── Formatting helpers ─────────────────────────────────────────────────────────
const fmt = (v, d = 2) => Number.isFinite(v) ? Number(v).toFixed(d) : '—';

// ── Component ──────────────────────────────────────────────────────────────────

export default function RewEngineShootout({ roomDims, seat, sub, surfaceAbsorption, activeSettings, onPromote }) {
  const [results, setResults]   = useState(null);
  const [running, setRunning]   = useState(false);
  const [promoted, setPromoted] = useState(null);

  const canRun = !!(
    roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM &&
    seat?.x != null && seat?.y != null &&
    sub?.x != null && sub?.y != null
  );

  const run = useCallback(async () => {
    if (!canRun || running) return;
    setRunning(true);
    setResults(null);

    await new Promise(r => setTimeout(r, 0));

    const W  = Number(roomDims.widthM);
    const L  = Number(roomDims.lengthM);
    const H  = Number(roomDims.heightM);
    const sx = Number(sub.x);
    const sy = Number(sub.y);
    const sz = Number.isFinite(Number(sub.z)) ? Number(sub.z) : 0.35;
    const rx = Number(seat.x);
    const ry = Number(seat.y);
    const rz = Number.isFinite(Number(seat.z)) ? Number(seat.z) : 1.2;
    const axialQ = activeSettings?.axialQ ?? 4.0;
    const sa = surfaceAbsorption ?? {};

    const rawModes = buildModes(W, L, H, 210);
    const modesWithBaseQ = rawModes.map(m => {
      const baseQ = typeBaseQ(m.type, axialQ);
      const absQ  = sabineQ(m.freq, W, L, H, sa);
      return { ...m, baseQ: Math.max(1, Math.min(baseQ, absQ)) };
    });

    const freqsHz = buildFreqAxis(20, 200);

    // Simulate each engine
    const engineResults = ENGINE_DEFS.map(eng => {
      const splDb = simulateEngine(eng.cfg, W, L, H, modesWithBaseQ, freqsHz, sx, sy, sz, rx, ry, rz);
      const score = scoreResponse(freqsHz, splDb);
      return { ...eng, freqsHz, splDb, score };
    });

    // Sort by MAE (best first)
    const ranked = [...engineResults].sort((a, b) => (a.score?.mae ?? 999) - (b.score?.mae ?? 999));

    // Build chart data — merge all curves + REW benchmark
    const chartData = freqsHz.map((hz, i) => {
      const pt = { hz };
      engineResults.forEach(e => { pt[e.id] = e.splDb?.[i] ?? null; });
      return pt;
    });

    // Add REW benchmark points (interpolated to same axis)
    const rewPoints = {};
    REW_BENCHMARK.forEach(({ hz, db }) => {
      // Find closest freq index
      let best = 0, bestDist = Infinity;
      freqsHz.forEach((fHz, i) => {
        const d = Math.abs(fHz - hz);
        if (d < bestDist) { bestDist = d; best = i; }
      });
      rewPoints[best] = db;
    });
    chartData.forEach((pt, i) => {
      pt.rew = rewPoints[i] ?? null;
    });

    setResults({ engineResults, ranked, chartData, freqsHz, bestId: ranked[0]?.id });
    setRunning(false);
  }, [roomDims, seat, sub, surfaceAbsorption, activeSettings, canRun, running]);

  const handlePromote = (eng) => {
    setPromoted(eng.id);
    if (onPromote) onPromote(eng);
    // Write to window for dev inspection
    if (typeof window !== 'undefined') {
      window.__B44_PROMOTED_ENGINE__ = { ...eng.cfg, label: eng.label, id: eng.id, score: eng.score };
      console.log('[ShootOut] Promoted engine:', window.__B44_PROMOTED_ENGINE__);
    }
  };

  const rankMedal = (i) => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;

  const thS = {
    textAlign: 'right', padding: '4px 7px', fontSize: 9, fontWeight: 700,
    background: '#0f172a', color: '#94a3b8', borderBottom: '2px solid #475569', whiteSpace: 'nowrap',
  };
  const tdS = { textAlign: 'right', padding: '3px 7px', fontSize: 9, fontFamily: 'monospace' };

  return (
    <div style={{ marginTop: 16, borderTop: '3px solid #0f172a', paddingTop: 12 }}>

      {/* Header */}
      <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 13, fontFamily: 'monospace', marginBottom: 4, letterSpacing: '0.02em' }}>
        REW Engine Shootout
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          {ENGINE_DEFS.length} engines · direct REW comparison · diagnostic only
        </span>
      </div>
      <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#475569', marginBottom: 8, lineHeight: 1.5 }}>
        Runs the current production engine + top candidate engines against the fixed REW benchmark.
        Generates full 20–200 Hz response curves, scores each against REW, ranks best → worst,
        and surfaces the winner. Use "Promote" to set a temporary production-test configuration
        (no engine code modified — temp config only).
      </div>

      {/* Engine legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {ENGINE_DEFS.map(eng => (
          <div key={eng.id} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 12, border: `1.5px solid ${eng.color}`, fontSize: 9, fontFamily: 'monospace', background: '#fff' }}>
            <div style={{ width: 10, height: 3, borderRadius: 2, background: eng.color }} />
            <span style={{ color: eng.color, fontWeight: 700 }}>{eng.shortLabel}</span>
            <span style={{ color: '#6b7280' }}>
              {eng.cfg.participation.label} · {eng.cfg.coupling.label} · Q×{eng.cfg.qScale} · {eng.cfg.family.label}
            </span>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 12, border: `1.5px dashed ${ENGINE_COLORS.rew}`, fontSize: 9, fontFamily: 'monospace', background: '#fff7ed' }}>
          <div style={{ width: 10, height: 3, borderRadius: 2, background: ENGINE_COLORS.rew, opacity: 0.6 }} />
          <span style={{ color: ENGINE_COLORS.rew, fontWeight: 700 }}>REW Benchmark</span>
        </div>
      </div>

      {!canRun && (
        <div style={{ fontSize: 10, color: '#b45309', fontFamily: 'monospace', marginBottom: 8 }}>
          ⚠ Need room dims, valid seat, and valid sub position to run.
        </div>
      )}

      <button
        onClick={run}
        disabled={running || !canRun}
        style={{
          height: 32, padding: '0 20px', borderRadius: 6,
          border: '1px solid #0f172a', background: running ? '#e5e7eb' : '#0f172a',
          color: running ? '#6b7280' : '#fff', fontSize: 11, fontFamily: 'monospace',
          cursor: running || !canRun ? 'not-allowed' : 'pointer', fontWeight: 700, marginBottom: 12,
        }}
      >
        {running ? 'Running Shootout…' : results ? 'Re-run Shootout' : 'Run Engine Shootout'}
      </button>

      {results && (
        <>
          {/* ── Winner banner ── */}
          {results.ranked[0] && (
            <div style={{ background: '#f0fdf4', border: '2px solid #16a34a', borderRadius: 8, padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ fontWeight: 800, color: '#14532d', fontSize: 12, fontFamily: 'monospace' }}>
                  🏆 Winner: {results.ranked[0].label}
                </div>
                <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#166534', marginTop: 3 }}>
                  MAE {fmt(results.ranked[0].score?.mae, 3)} dB · Worst {fmt(results.ranked[0].score?.worstErr, 2)} dB @ {results.ranked[0].score?.worstHz} Hz
                </div>
                <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#166534', marginTop: 2 }}>
                  {results.ranked[0].cfg.participation.label} · {results.ranked[0].cfg.coupling.label} · Q×{results.ranked[0].cfg.qScale} · {results.ranked[0].cfg.family.label} · {results.ranked[0].cfg.selection.label}
                </div>
              </div>
              <button
                onClick={() => handlePromote(results.ranked[0])}
                disabled={promoted === results.ranked[0].id}
                style={{
                  height: 32, padding: '0 14px', borderRadius: 6, fontFamily: 'monospace', fontSize: 10, fontWeight: 700, cursor: promoted === results.ranked[0].id ? 'default' : 'pointer',
                  border: `1.5px solid ${promoted === results.ranked[0].id ? '#86efac' : '#16a34a'}`,
                  background: promoted === results.ranked[0].id ? '#dcfce7' : '#16a34a',
                  color: promoted === results.ranked[0].id ? '#166534' : '#fff',
                }}
              >
                {promoted === results.ranked[0].id ? '✓ Promoted' : 'Promote To Production Test Engine'}
              </button>
            </div>
          )}

          {/* ── Overlay graph ── */}
          <div style={{ border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', padding: '12px 8px', marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 10, fontFamily: 'monospace', color: '#1e293b', marginBottom: 8, paddingLeft: 8 }}>
              Frequency Response Overlay — 20–200 Hz
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={results.chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="hz"
                  type="number"
                  domain={[20, 200]}
                  scale="log"
                  ticks={[20, 30, 40, 60, 80, 100, 120, 150, 200]}
                  tickFormatter={v => `${v}`}
                  tick={{ fontSize: 8, fontFamily: 'monospace' }}
                  label={{ value: 'Hz', position: 'insideBottomRight', offset: -4, fontSize: 8 }}
                />
                <YAxis
                  domain={['auto', 'auto']}
                  tick={{ fontSize: 8, fontFamily: 'monospace' }}
                  label={{ value: 'dBSPL', angle: -90, position: 'insideLeft', offset: 10, fontSize: 8 }}
                />
                <Tooltip content={<ShootoutTooltip />} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 9, fontFamily: 'monospace' }} />
                {ENGINE_DEFS.map(eng => (
                  <Line
                    key={eng.id}
                    type="monotone"
                    dataKey={eng.id}
                    name={eng.shortLabel}
                    stroke={eng.color}
                    strokeWidth={eng.id === results.bestId ? 2.5 : 1.2}
                    dot={false}
                    isAnimationActive={false}
                    connectNulls
                  />
                ))}
                <Line
                  type="monotone"
                  dataKey="rew"
                  name="REW"
                  stroke={ENGINE_COLORS.rew}
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  dot={{ r: 3, fill: ENGINE_COLORS.rew, strokeWidth: 0 }}
                  isAnimationActive={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* ── Ranked metrics table ── */}
          <div style={{ border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 10, fontFamily: 'monospace', color: '#1e293b', padding: '10px 12px 6px' }}>
              Engine Rankings — best to worst
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 780 }}>
                <thead>
                  <tr>
                    <th style={{ ...thS, textAlign: 'left', minWidth: 28 }}>#</th>
                    <th style={{ ...thS, textAlign: 'left', minWidth: 100 }}>Engine</th>
                    <th style={thS}>MAE ↑</th>
                    <th style={thS}>Worst err</th>
                    <th style={thS}>Worst Hz</th>
                    {BANDS.map(b => <th key={b.label} style={thS}>{b.label}</th>)}
                    <th style={{ ...thS, textAlign: 'center', minWidth: 100 }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {results.ranked.map((eng, i) => {
                    const { score } = eng;
                    const isWinner = i === 0;
                    const isCurrent = eng.id === 'current';
                    const wasPromoted = promoted === eng.id;
                    return (
                      <tr key={eng.id} style={{ borderBottom: '1px solid #e2e8f0', background: isWinner ? '#f0fdf4' : isCurrent ? '#fafafa' : '#fff' }}>
                        <td style={{ ...tdS, textAlign: 'left', fontWeight: 700, color: isWinner ? '#16a34a' : '#64748b', fontSize: 10 }}>{rankMedal(i)}</td>
                        <td style={{ ...tdS, textAlign: 'left' }}>
                          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: eng.color, marginRight: 5, verticalAlign: 'middle' }} />
                          <span style={{ fontWeight: isWinner ? 700 : 400, color: eng.color }}>{eng.label}</span>
                          {isCurrent && <span style={{ marginLeft: 5, fontSize: 8, color: '#6b7280', fontFamily: 'monospace' }}>(production)</span>}
                        </td>
                        <td style={{ ...tdS, fontWeight: 700, color: isWinner ? '#16a34a' : (score?.mae ?? 0) > 5 ? '#dc2626' : '#374151' }}>
                          {fmt(score?.mae, 3)}
                        </td>
                        <td style={{ ...tdS, color: (score?.worstErr ?? 0) > 8 ? '#dc2626' : (score?.worstErr ?? 0) > 5 ? '#b45309' : '#374151' }}>
                          {fmt(score?.worstErr, 2)}
                        </td>
                        <td style={{ ...tdS, color: '#6b7280' }}>{score?.worstHz ?? '—'} Hz</td>
                        {(score?.bands ?? [null, null, null, null]).map((v, bi) => (
                          <td key={bi} style={{ ...tdS, color: (v ?? 0) > 5 ? '#dc2626' : (v ?? 0) > 3 ? '#b45309' : '#374151' }}>
                            {fmt(v, 2)}
                          </td>
                        ))}
                        <td style={{ ...tdS, textAlign: 'center' }}>
                          {!isCurrent && (
                            <button
                              onClick={() => handlePromote(eng)}
                              disabled={wasPromoted}
                              style={{
                                height: 24, padding: '0 8px', borderRadius: 4, fontSize: 8, fontFamily: 'monospace', cursor: wasPromoted ? 'default' : 'pointer', fontWeight: 600,
                                border: `1px solid ${wasPromoted ? '#86efac' : '#0f172a'}`,
                                background: wasPromoted ? '#dcfce7' : isWinner ? '#0f172a' : '#f8fafc',
                                color: wasPromoted ? '#166534' : isWinner ? '#fff' : '#374151',
                              }}
                            >
                              {wasPromoted ? '✓ Promoted' : 'Promote'}
                            </button>
                          )}
                          {isCurrent && <span style={{ fontSize: 8, color: '#9ca3af', fontFamily: 'monospace' }}>baseline</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Promoted engine spec ── */}
          {promoted && (() => {
            const eng = results.engineResults.find(e => e.id === promoted);
            if (!eng) return null;
            return (
              <div style={{ border: '2px solid #16a34a', borderRadius: 8, background: '#f0fdf4', padding: '10px 14px', marginBottom: 8 }}>
                <div style={{ fontWeight: 800, color: '#14532d', fontSize: 11, fontFamily: 'monospace', marginBottom: 6 }}>
                  ✓ Production Test Engine Promoted — {eng.label}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px 20px', fontSize: 9, fontFamily: 'monospace', color: '#166534' }}>
                  <div><span style={{ color: '#6b7280' }}>Participation:</span> {eng.cfg.participation.label}</div>
                  <div><span style={{ color: '#6b7280' }}>Coupling:</span> {eng.cfg.coupling.label}</div>
                  <div><span style={{ color: '#6b7280' }}>Q scale:</span> ×{eng.cfg.qScale}</div>
                  <div><span style={{ color: '#6b7280' }}>Family:</span> {eng.cfg.family.label}</div>
                  <div><span style={{ color: '#6b7280' }}>Selection:</span> {eng.cfg.selection.label}</div>
                  <div><span style={{ color: '#6b7280' }}>MAE:</span> <strong>{fmt(eng.score?.mae, 3)} dB</strong></div>
                </div>
                <div style={{ marginTop: 6, fontSize: 8, fontFamily: 'monospace', color: '#166534', background: '#dcfce7', borderRadius: 4, padding: '3px 7px' }}>
                  Config written to window.__B44_PROMOTED_ENGINE__ — no production code changed. Use this spec for a focused rewBassEngine test.
                </div>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}