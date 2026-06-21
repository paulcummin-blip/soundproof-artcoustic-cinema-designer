// RewRefinedEngineShootout.jsx
// Final automated production-test step.
// Compares: Current production engine, Previous best (Cand #1), Best refined candidate.
// The "Promote" button writes to window.__B44_ACTIVE_TEST_ENGINE__ which BassResponse
// reads to switch the live graph. No rewBassEngine modifications. Diagnostic only.

import React, { useState, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

// ── REW benchmark ──────────────────────────────────────────────────────────────
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

const FLAT_DB = 94;
const C = 343;

// ── Three engine definitions ───────────────────────────────────────────────────

const ENGINES = [
  {
    id: 'current',
    label: 'Current Production Engine',
    shortLabel: 'Current',
    color: '#213428',
    cfg: {
      participation: { id: 'all', label: 'All modes' },
      coupling: { id: 'src_x_rcv', label: 'Source × listener', fn: (sc, rc) => sc * rc },
      qScale: 1.0,
      tangWeight: 1.0,
      selection: { id: 'coupling', label: 'Coupling ranked' },
    },
  },
  {
    id: 'prev_best',
    label: 'Previous Best (Cand #1)',
    shortLabel: 'Cand #1',
    color: '#2563eb',
    cfg: {
      participation: { id: 'top5', label: 'Top 5', topN: 5 },
      coupling: { id: 'rcv_only', label: 'Listener only', fn: (_sc, rc) => rc },
      qScale: 1.10,
      tangWeight: 0.60,
      selection: { id: 'transfer', label: 'Transfer ranked' },
    },
  },
  {
    id: 'refined',
    label: 'Best Refined Candidate',
    shortLabel: 'Refined',
    color: '#059669',
    cfg: {
      participation: { id: 'top5', label: 'Top 5', topN: 5 },
      coupling: { id: 'rcv_w125', label: 'Listener weighted 1.25', fn: (_sc, rc) => rc * 1.25 },
      qScale: 1.20,
      tangWeight: 0.40,
      selection: { id: 'transfer', label: 'Transfer ranked' },
    },
  },
];

// ── Acoustic helpers ──────────────────────────────────────────────────────────

function buildFreqAxis() {
  const freqs = [];
  const ppo = 48;
  const total = Math.ceil(Math.log2(200 / 20) * ppo);
  for (let i = 0; i <= total; i++) {
    const hz = 20 * Math.pow(2, i / ppo);
    if (hz > 200) break;
    freqs.push(hz);
  }
  if (freqs[freqs.length - 1] !== 200) freqs.push(200);
  return freqs;
}

function buildModes(W, L, H) {
  const fMax = 210;
  const nMax = Math.ceil((fMax / C) * 2 * Math.max(W, L, H)) + 4;
  const modes = [];
  for (let nx = 0; nx <= nMax; nx++)
    for (let ny = 0; ny <= nMax; ny++)
      for (let nz = 0; nz <= nMax; nz++) {
        if (nx === 0 && ny === 0 && nz === 0) continue;
        const freq = (C / 2) * Math.sqrt((nx / W) ** 2 + (ny / L) ** 2 + (nz / H) ** 2);
        if (!Number.isFinite(freq) || freq <= 0 || freq > fMax) continue;
        const axes = (nx > 0 ? 1 : 0) + (ny > 0 ? 1 : 0) + (nz > 0 ? 1 : 0);
        modes.push({ nx, ny, nz, freq, type: axes === 1 ? 'axial' : axes === 2 ? 'tangential' : 'oblique' });
      }
  return modes.sort((a, b) => a.freq - b.freq);
}

function sabineQ(f0, W, L, H, sa) {
  const V = W * L * H;
  const A =
    (L * W) * ((sa?.floor ?? 0.3) + (sa?.ceiling ?? 0.3)) +
    (W * H) * ((sa?.front ?? 0.3) + (sa?.back ?? 0.3)) +
    (L * H) * ((sa?.left ?? 0.3) + (sa?.right ?? 0.3));
  return Math.max(1, Math.min(80, 2 * Math.PI * f0 * 0.161 * V / (Math.max(A, 1e-6) * 13.815)));
}

function typeBaseQ(type, axialQ) {
  return type === 'axial' ? axialQ : type === 'tangential' ? 3.9 : 2.5;
}

function cosShape(n, pos, dim) {
  return n > 0 ? Math.cos(n * Math.PI * pos / Math.max(dim, 1e-6)) : 1;
}

function resonator(f, f0, q) {
  const r = f / Math.max(f0, 1e-6);
  const rr = 1 - r * r;
  const ri = r / Math.max(q, 1e-6);
  const d = rr * rr + ri * ri;
  return { re: rr / d, im: -ri / d, mag: 1 / Math.max(d, 1e-12) };
}

function runEngine(cfg, W, L, H, modesPrep, freqsHz, sx, sy, sz, rx, ry, rz) {
  const { participation, coupling, qScale, tangWeight, selection } = cfg;
  const srcAmp = Math.pow(10, FLAT_DB / 20);

  const modes = modesPrep.map(m => ({
    ...m, q: Math.max(1, Math.min(80, m.baseQ * qScale)),
  }));

  return freqsHz.map(f => {
    const dist = Math.max(0.01, Math.sqrt((sx - rx) ** 2 + (sy - ry) ** 2 + (sz - rz) ** 2));
    const directAmp = srcAmp / dist;
    const tof = -2 * Math.PI * f * dist / C;
    let sumRe = directAmp * Math.cos(tof);
    let sumIm = directAmp * Math.sin(tof);

    const entries = modes.map(mode => {
      const sc = cosShape(mode.nx, sx, W) * cosShape(mode.ny, sy, L) * cosShape(mode.nz, sz, H);
      const rc = cosShape(mode.nx, rx, W) * cosShape(mode.ny, ry, L) * cosShape(mode.nz, rz, H);

      const coupVal = coupling.fn(sc, rc);
      const fw = mode.type === 'axial' ? 1.0 : mode.type === 'tangential' ? tangWeight : 1.0;
      const modeOrder = Math.abs(mode.nx) + Math.abs(mode.ny) + Math.abs(mode.nz);
      const orderWeight = modeOrder >= 2 ? 0.50 : 1.0;
      const hoScale = (mode.type === 'axial' && modeOrder >= 2) ? 0.50 : 1.0;
      const { re: tRe, im: tIm, mag: tMag } = resonator(f, mode.freq, mode.q);
      const bw = mode.freq / Math.max(mode.q, 1e-6);

      let rankMetric;
      if (selection.id === 'transfer')    rankMetric = tMag;
      else if (selection.id === 'energy') rankMetric = tMag * Math.abs(coupVal) * fw * orderWeight;
      else if (selection.id === 'coup_x_tr') rankMetric = Math.abs(coupVal) * tMag;
      else rankMetric = Math.abs(coupVal); // coupling

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

function interp(freqsHz, splDb, hz) {
  if (hz <= freqsHz[0]) return splDb[0];
  if (hz >= freqsHz[freqsHz.length - 1]) return splDb[splDb.length - 1];
  for (let i = 0; i < freqsHz.length - 1; i++) {
    if (hz >= freqsHz[i] && hz <= freqsHz[i + 1]) {
      const t = (hz - freqsHz[i]) / (freqsHz[i + 1] - freqsHz[i]);
      return splDb[i] + (splDb[i + 1] - splDb[i]) * t;
    }
  }
  return null;
}

function scoreResp(freqsHz, splDb) {
  let sum = 0, worstErr = 0, worstHz = null, count = 0;
  for (const { hz, db } of REW_BENCHMARK) {
    const v = interp(freqsHz, splDb, hz);
    if (!Number.isFinite(v)) continue;
    const err = Math.abs(v - db);
    sum += err;
    if (err > worstErr) { worstErr = err; worstHz = hz; }
    count++;
  }
  if (!count) return null;
  const bands = BANDS.map(({ lo, hi }) => {
    const pts = REW_BENCHMARK.filter(p => p.hz >= lo && p.hz <= hi);
    let s = 0, c = 0;
    for (const { hz, db } of pts) {
      const v = interp(freqsHz, splDb, hz);
      if (!Number.isFinite(v)) continue;
      s += Math.abs(v - db); c++;
    }
    return c ? s / c : null;
  });
  return { mae: sum / count, worstErr, worstHz, bands };
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

function Tooltip3({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 10px', fontSize: 9, fontFamily: 'monospace' }}>
      <div style={{ fontWeight: 700, marginBottom: 3, color: '#1e293b' }}>{Number(label).toFixed(1)} Hz</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ color: p.color, display: 'flex', justifyContent: 'space-between', gap: 14 }}>
          <span>{p.name}</span>
          <span style={{ fontWeight: 700 }}>{Number.isFinite(p.value) ? p.value.toFixed(1) : '—'} dB</span>
        </div>
      ))}
    </div>
  );
}

const fmt = (v, d = 2) => Number.isFinite(v) ? Number(v).toFixed(d) : '—';

// ── Exported spec for BassResponse to read ───────────────────────────────────
// BassResponse checks window.__B44_ACTIVE_TEST_ENGINE__ on each render
// and, if set, routes simulation through the candidate engine path.
export const REFINED_ENGINE_SPEC = {
  id: 'refined',
  label: 'Best Refined Candidate',
  participation: { id: 'top5', topN: 5 },
  coupling: { id: 'rcv_w125', weightedScale: 1.25 },
  qScale: 1.20,
  tangWeight: 0.40,
  selection: { id: 'transfer' },
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function RewRefinedEngineShootout({
  roomDims, seat, sub, surfaceAbsorption, activeSettings, onPromoteRefined,
}) {
  const [results,  setResults]  = useState(null);
  const [running,  setRunning]  = useState(false);
  const [promoted, setPromoted] = useState(false);

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

    const rawModes = buildModes(W, L, H);
    const modesPrep = rawModes.map(m => {
      const baseQ = typeBaseQ(m.type, axialQ);
      const absQ  = sabineQ(m.freq, W, L, H, sa);
      return { ...m, baseQ: Math.max(1, Math.min(baseQ, absQ)) };
    });

    const freqsHz = buildFreqAxis();

    const engineResults = ENGINES.map(eng => {
      const splDb = runEngine(eng.cfg, W, L, H, modesPrep, freqsHz, sx, sy, sz, rx, ry, rz);
      const score = scoreResp(freqsHz, splDb);
      return { ...eng, splDb, score };
    });

    const ranked = [...engineResults].sort((a, b) => (a.score?.mae ?? 999) - (b.score?.mae ?? 999));

    // Build chart data
    const chartData = freqsHz.map((hz, i) => {
      const pt = { hz };
      engineResults.forEach(e => { pt[e.id] = e.splDb?.[i] ?? null; });
      return pt;
    });
    // Snap REW benchmark points onto freq axis
    const rewSnap = {};
    REW_BENCHMARK.forEach(({ hz, db }) => {
      let best = 0, bestDist = Infinity;
      freqsHz.forEach((fHz, i) => { const d = Math.abs(fHz - hz); if (d < bestDist) { bestDist = d; best = i; } });
      rewSnap[best] = db;
    });
    chartData.forEach((pt, i) => { pt.rew = rewSnap[i] ?? null; });

    const refinedRank = ranked.findIndex(e => e.id === 'refined');
    const refinedWins = refinedRank === 0;

    setResults({ engineResults, ranked, chartData, freqsHz, refinedWins, refinedRank });
    setRunning(false);
  }, [roomDims, seat, sub, surfaceAbsorption, activeSettings, canRun, running]);

  const handlePromote = () => {
    if (typeof window !== 'undefined') {
      window.__B44_ACTIVE_TEST_ENGINE__ = REFINED_ENGINE_SPEC;
      console.log('[RefinedShootout] Promoted refined candidate to active test engine:', REFINED_ENGINE_SPEC);
    }
    setPromoted(true);
    if (onPromoteRefined) onPromoteRefined(REFINED_ENGINE_SPEC);
  };

  const rankMedal = i => i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';

  const thS = {
    textAlign: 'right', padding: '4px 8px', fontSize: 9, fontWeight: 700,
    background: '#064e3b', color: '#a7f3d0', borderBottom: '2px solid #059669', whiteSpace: 'nowrap',
  };
  const tdS = { textAlign: 'right', padding: '3px 8px', fontSize: 9, fontFamily: 'monospace' };

  return (
    <div style={{ marginTop: 16, borderTop: '3px solid #059669', paddingTop: 12 }}>

      {/* Header */}
      <div style={{ fontWeight: 800, color: '#064e3b', fontSize: 13, fontFamily: 'monospace', marginBottom: 4 }}>
        REW Parity Refined Engine Shootout
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          3 engines · final comparison · diagnostic only
        </span>
      </div>
      <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#065f46', marginBottom: 8, lineHeight: 1.5 }}>
        Head-to-head: Current engine vs Previous best (Cand #1) vs Best refined candidate.
        If the refined candidate wins, "Promote" activates it as the live production-test engine
        for the Bass Response graph. No rewBassEngine.js changes — test config only.
      </div>

      {/* Engine cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
        {ENGINES.map(eng => (
          <div key={eng.id} style={{ border: `2px solid ${eng.color}`, borderRadius: 7, padding: '7px 10px', background: '#fff' }}>
            <div style={{ fontWeight: 700, color: eng.color, fontSize: 10, fontFamily: 'monospace', marginBottom: 3 }}>{eng.shortLabel}</div>
            <div style={{ fontSize: 8, fontFamily: 'monospace', color: '#6b7280', lineHeight: 1.5 }}>
              <div>Participation: {eng.cfg.participation.label}</div>
              <div>Coupling: {eng.cfg.coupling.label}</div>
              <div>Q: ×{eng.cfg.qScale}</div>
              <div>Tang weight: {eng.cfg.tangWeight}</div>
              <div>Selection: {eng.cfg.selection.label}</div>
            </div>
          </div>
        ))}
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
          border: '1px solid #059669', background: running ? '#e5e7eb' : '#059669',
          color: running ? '#6b7280' : '#fff', fontSize: 11, fontFamily: 'monospace',
          cursor: running || !canRun ? 'not-allowed' : 'pointer', fontWeight: 700, marginBottom: 12,
        }}
      >
        {running ? 'Running…' : results ? 'Re-run Refined Shootout' : 'Run Refined Engine Shootout'}
      </button>

      {results && (
        <>
          {/* ── Winner / verdict banner ── */}
          <div style={{
            border: `2px solid ${results.refinedWins ? '#059669' : '#d97706'}`,
            borderRadius: 8, padding: '10px 14px', marginBottom: 12,
            background: results.refinedWins ? '#f0fdf4' : '#fffbeb',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
          }}>
            <div>
              <div style={{ fontWeight: 800, color: results.refinedWins ? '#064e3b' : '#92400e', fontSize: 12, fontFamily: 'monospace' }}>
                {results.refinedWins ? '🏆 Refined candidate is best — ready to promote' : `⚠ Refined candidate ranked #${results.refinedRank + 1}`}
              </div>
              <div style={{ fontSize: 9, fontFamily: 'monospace', color: results.refinedWins ? '#166534' : '#b45309', marginTop: 3 }}>
                {results.ranked.map(e => `${e.shortLabel}: ${fmt(e.score?.mae, 3)} dB`).join('  ·  ')}
              </div>
            </div>
            {results.refinedWins && (
              <button
                onClick={handlePromote}
                disabled={promoted}
                style={{
                  height: 34, padding: '0 16px', borderRadius: 6, fontFamily: 'monospace', fontSize: 11, fontWeight: 700,
                  cursor: promoted ? 'default' : 'pointer',
                  border: `2px solid ${promoted ? '#86efac' : '#059669'}`,
                  background: promoted ? '#dcfce7' : '#059669',
                  color: promoted ? '#166534' : '#fff',
                }}
              >
                {promoted ? '✓ Active in Bass Response Graph' : 'Promote Refined Candidate To Production Test Engine'}
              </button>
            )}
          </div>

          {/* ── Promoted confirmation ── */}
          {promoted && (
            <div style={{ border: '2px solid #059669', borderRadius: 8, background: '#f0fdf4', padding: '10px 14px', marginBottom: 12 }}>
              <div style={{ fontWeight: 800, color: '#064e3b', fontSize: 11, fontFamily: 'monospace', marginBottom: 4 }}>
                ✅ Refined candidate is now active in the Bass Response graph
              </div>
              <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#166534', lineHeight: 1.6 }}>
                <div>window.__B44_ACTIVE_TEST_ENGINE__ is set — BassResponse reads this flag and routes to the refined engine path.</div>
                <div style={{ marginTop: 4 }}>
                  Spec: Top 5 · Listener ×1.25 · Q×1.20 · Tang 0.40 · Transfer ranked
                </div>
                <div style={{ marginTop: 4, color: '#b45309' }}>
                  ⚠ Reload the page to restore the original production engine. No rewBassEngine.js was modified.
                </div>
              </div>
            </div>
          )}

          {/* ── Overlay graph ── */}
          <div style={{ border: '1px solid #a7f3d0', borderRadius: 8, background: '#fff', padding: '12px 8px', marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 10, fontFamily: 'monospace', color: '#064e3b', marginBottom: 8, paddingLeft: 8 }}>
              Frequency Response Overlay — 20–200 Hz
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={results.chartData} margin={{ top: 4, right: 20, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="hz" type="number" domain={[20, 200]} scale="log"
                  ticks={[20, 30, 40, 60, 80, 100, 120, 150, 200]}
                  tickFormatter={v => `${v}`}
                  tick={{ fontSize: 8, fontFamily: 'monospace' }}
                />
                <YAxis domain={['auto', 'auto']} tick={{ fontSize: 8, fontFamily: 'monospace' }} />
                <Tooltip content={<Tooltip3 />} />
                <Legend iconSize={9} wrapperStyle={{ fontSize: 9, fontFamily: 'monospace' }} />
                {ENGINES.map(eng => (
                  <Line
                    key={eng.id}
                    type="monotone"
                    dataKey={eng.id}
                    name={eng.shortLabel}
                    stroke={eng.color}
                    strokeWidth={eng.id === results.ranked[0]?.id ? 3 : 1.5}
                    strokeDasharray={eng.id === 'current' ? '5 3' : undefined}
                    dot={false}
                    isAnimationActive={false}
                    connectNulls
                  />
                ))}
                <Line
                  type="monotone" dataKey="rew" name="REW" stroke="#f97316"
                  strokeWidth={2} strokeDasharray="6 3"
                  dot={{ r: 3, fill: '#f97316', strokeWidth: 0 }}
                  isAnimationActive={false} connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* ── Rankings table ── */}
          <div style={{ border: '1px solid #a7f3d0', borderRadius: 8, background: '#fff' }}>
            <div style={{ fontWeight: 700, fontSize: 10, fontFamily: 'monospace', color: '#064e3b', padding: '10px 12px 6px' }}>
              Engine Rankings
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 700 }}>
                <thead>
                  <tr>
                    <th style={{ ...thS, textAlign: 'left' }}>#</th>
                    <th style={{ ...thS, textAlign: 'left', minWidth: 130 }}>Engine</th>
                    <th style={thS}>MAE</th>
                    <th style={thS}>Worst</th>
                    <th style={thS}>@ Hz</th>
                    {BANDS.map(b => <th key={b.label} style={thS}>{b.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {results.ranked.map((eng, i) => {
                    const { score } = eng;
                    const isWinner = i === 0;
                    const isRefined = eng.id === 'refined';
                    return (
                      <tr key={eng.id} style={{ borderBottom: '1px solid #d1fae5', background: isWinner ? '#f0fdf4' : '#fff' }}>
                        <td style={{ ...tdS, textAlign: 'left', fontWeight: 700, fontSize: 11 }}>{rankMedal(i)}</td>
                        <td style={{ ...tdS, textAlign: 'left' }}>
                          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: eng.color, marginRight: 5, verticalAlign: 'middle' }} />
                          <span style={{ fontWeight: isWinner ? 800 : 400, color: eng.color }}>{eng.label}</span>
                          {isRefined && <span style={{ marginLeft: 5, fontSize: 8, background: '#d1fae5', color: '#065f46', borderRadius: 3, padding: '1px 4px', fontFamily: 'monospace' }}>refined</span>}
                          {eng.id === 'current' && <span style={{ marginLeft: 5, fontSize: 8, color: '#9ca3af', fontFamily: 'monospace' }}>(production)</span>}
                        </td>
                        <td style={{ ...tdS, fontWeight: 700, color: isWinner ? '#059669' : '#374151' }}>{fmt(score?.mae, 3)}</td>
                        <td style={{ ...tdS, color: (score?.worstErr ?? 0) > 8 ? '#dc2626' : '#374151' }}>{fmt(score?.worstErr, 2)}</td>
                        <td style={{ ...tdS, color: '#6b7280' }}>{score?.worstHz ?? '—'} Hz</td>
                        {(score?.bands ?? [null, null, null, null]).map((v, bi) => (
                          <td key={bi} style={{ ...tdS, color: (v ?? 0) > 5 ? '#dc2626' : (v ?? 0) > 3 ? '#b45309' : '#374151' }}>
                            {fmt(v, 2)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}