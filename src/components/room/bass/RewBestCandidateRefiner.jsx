// RewBestCandidateRefiner.jsx
// Diagnostic-only: Fine-sweep around the current best shootout candidate.
// Seed = Candidate #1 (Top5 / Listener only / Q×1.10 / Tang reduced / Transfer ranked).
// Does NOT modify rewBassEngine, production maths, or the Bass Response graph.

import React, { useState, useCallback, useRef } from 'react';

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
const STALL_THRESHOLD_DB = 0.25;

// ── Seed (current best from Shootout) ─────────────────────────────────────────
const SEED_MAE = null; // will be set dynamically when seeded

// ── Fine-sweep grids ──────────────────────────────────────────────────────────

const PARTICIPATION_SWEEP = [
  { id: 'top4', label: 'Top 4',  topN: 4 },
  { id: 'top5', label: 'Top 5',  topN: 5 },
  { id: 'top6', label: 'Top 6',  topN: 6 },
  { id: 'top7', label: 'Top 7',  topN: 7 },
  { id: 'bw15', label: '±1.5 BW', bwFactor: 1.5 },
  { id: 'bw2',  label: '±2 BW',   bwFactor: 2.0 },
];

const COUPLING_SWEEP = [
  { id: 'rcv_only',      label: 'Listener only',           fn: (_sc, rc) => rc },
  { id: 'src_x_rcv',    label: 'Source × listener',        fn: (sc, rc) => sc * rc },
  { id: 'rcv_w075',     label: 'Listener weighted 0.75',   fn: (_sc, rc) => rc * 0.75 },
  { id: 'rcv_w125',     label: 'Listener weighted 1.25',   fn: (_sc, rc) => rc * 1.25 },
];

const Q_SWEEP = [
  { id: 'q100', label: 'Q × 1.00', scale: 1.00 },
  { id: 'q105', label: 'Q × 1.05', scale: 1.05 },
  { id: 'q110', label: 'Q × 1.10', scale: 1.10 },
  { id: 'q115', label: 'Q × 1.15', scale: 1.15 },
  { id: 'q120', label: 'Q × 1.20', scale: 1.20 },
];

const TANG_SWEEP = [
  { id: 't040', label: 'Tang 0.40', tang: 0.40 },
  { id: 't050', label: 'Tang 0.50', tang: 0.50 },
  { id: 't060', label: 'Tang 0.60', tang: 0.60 },
  { id: 't070', label: 'Tang 0.70', tang: 0.70 },
  { id: 't080', label: 'Tang 0.80', tang: 0.80 },
];

const SELECTION_SWEEP = [
  { id: 'transfer',    label: 'Transfer ranked' },
  { id: 'energy',     label: 'Energy ranked' },
  { id: 'coup_x_tr',  label: 'Coupling × transfer' },
];

// Total: 6 × 4 × 5 × 5 × 3 = 1800 combinations

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
  return { re: rr / d, im: -ri / d, mag: 1 / Math.max(d, 1e-12) };
}

// ── Single run ────────────────────────────────────────────────────────────────

function runCandidate(cfg, W, L, H, modesPrep, freqsHz, sx, sy, sz, rx, ry, rz) {
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

      let coupVal;
      if (coupling.id === 'bw_local') {
        const bw = mode.freq / Math.max(mode.q, 1e-6);
        coupVal = Math.abs(mode.freq - f) <= bw ? sc * rc : 0;
      } else {
        coupVal = coupling.fn(sc, rc);
      }

      const fw = mode.type === 'axial' ? 1.0
               : mode.type === 'tangential' ? tangWeight
               : 1.0; // oblique stays 1.0
      const modeOrder = Math.abs(mode.nx) + Math.abs(mode.ny) + Math.abs(mode.nz);
      const orderWeight = modeOrder >= 2 ? 0.50 : 1.0;
      const hoScale = (mode.type === 'axial' && modeOrder >= 2) ? 0.50 : 1.0;

      const { re: tRe, im: tIm, mag: transferMag } = resonator(f, mode.freq, mode.q);
      const bw = mode.freq / Math.max(mode.q, 1e-6);
      const energyProxy = transferMag * Math.abs(coupVal) * fw * orderWeight;

      let rankMetric;
      if (selection.id === 'transfer')    rankMetric = transferMag;
      else if (selection.id === 'energy') rankMetric = energyProxy;
      else /* coup_x_tr */                rankMetric = Math.abs(coupVal) * transferMag;

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

function score(freqsHz, splDb) {
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

// ── Formatting ────────────────────────────────────────────────────────────────
const fmt = (v, d = 2) => Number.isFinite(v) ? Number(v).toFixed(d) : '—';

// ── Component ─────────────────────────────────────────────────────────────────

export default function RewBestCandidateRefiner({ roomDims, seat, sub, surfaceAbsorption, activeSettings }) {
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const cancelRef = useRef(false);

  const canRun = !!(
    roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM &&
    seat?.x != null && seat?.y != null &&
    sub?.x != null && sub?.y != null
  );

  const totalCombos =
    PARTICIPATION_SWEEP.length * COUPLING_SWEEP.length * Q_SWEEP.length *
    TANG_SWEEP.length * SELECTION_SWEEP.length;

  const run = useCallback(async () => {
    if (!canRun || running) return;
    setRunning(true);
    setResults(null);
    cancelRef.current = false;
    setProgress({ done: 0, total: totalCombos });

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

    // Seed MAE — run the seed candidate first so we have a reference
    const SEED_CFG = {
      participation: PARTICIPATION_SWEEP.find(p => p.id === 'top5'),
      coupling:      COUPLING_SWEEP.find(c => c.id === 'rcv_only'),
      qScale:        1.10,
      tangWeight:    0.60,
      selection:     SELECTION_SWEEP.find(s => s.id === 'transfer'),
    };
    const seedSpl  = runCandidate(SEED_CFG, W, L, H, modesPrep, freqsHz, sx, sy, sz, rx, ry, rz);
    const seedScore = score(freqsHz, seedSpl);
    const seedMae = seedScore?.mae ?? null;

    const allResults = [];
    let done = 0;
    const BATCH = 25;

    for (const participation of PARTICIPATION_SWEEP) {
      for (const coupling of COUPLING_SWEEP) {
        for (const qMult of Q_SWEEP) {
          for (const tang of TANG_SWEEP) {
            for (const sel of SELECTION_SWEEP) {
              if (cancelRef.current) break;
              const cfg = {
                participation,
                coupling,
                qScale: qMult.scale,
                tangWeight: tang.tang,
                selection: sel,
                _key: `${participation.id}_${coupling.id}_${qMult.id}_${tang.id}_${sel.id}`,
                _labels: {
                  participation: participation.label,
                  coupling: coupling.label,
                  q: qMult.label,
                  tang: tang.label,
                  selection: sel.label,
                },
              };
              const splDb = runCandidate(cfg, W, L, H, modesPrep, freqsHz, sx, sy, sz, rx, ry, rz);
              const s = score(freqsHz, splDb);
              if (s) allResults.push({ cfg, score: s });
              done++;
              if (done % BATCH === 0) {
                setProgress({ done, total: totalCombos });
                await new Promise(r => setTimeout(r, 0));
              }
            }
            if (cancelRef.current) break;
          }
          if (cancelRef.current) break;
        }
        if (cancelRef.current) break;
      }
      if (cancelRef.current) break;
    }

    if (!cancelRef.current) {
      const sorted = [...allResults].sort((a, b) => a.score.mae - b.score.mae);
      const top20  = sorted.slice(0, 20);
      const best   = sorted[0] ?? null;
      const improvement = (seedMae != null && best?.score?.mae != null)
        ? seedMae - best.score.mae
        : null;
      const stalled = improvement != null && improvement < STALL_THRESHOLD_DB;
      setResults({ sorted, top20, best, seedMae, improvement, stalled, totalRan: allResults.length });
    }

    setRunning(false);
    setProgress({ done: 0, total: 0 });
  }, [roomDims, seat, sub, surfaceAbsorption, activeSettings, canRun, running]);

  const cancel = () => { cancelRef.current = true; };
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  const thS = {
    textAlign: 'right', padding: '4px 6px', fontSize: 9, fontWeight: 700,
    background: '#1c1917', color: '#d6d3d1', borderBottom: '2px solid #44403c', whiteSpace: 'nowrap',
  };
  const tdS = { textAlign: 'right', padding: '3px 6px', fontSize: 9, fontFamily: 'monospace' };

  return (
    <div style={{ marginTop: 16, borderTop: '3px solid #92400e', paddingTop: 12 }}>

      {/* Header */}
      <div style={{ fontWeight: 800, color: '#78350f', fontSize: 13, fontFamily: 'monospace', marginBottom: 3, letterSpacing: '0.02em' }}>
        REW Best Candidate Refiner
        <span style={{ fontWeight: 400, color: '#9ca3af', marginLeft: 8, fontSize: 9 }}>
          {totalCombos.toLocaleString()} fine-sweep combos · diagnostic only
        </span>
      </div>

      {/* Seed spec */}
      <div style={{ border: '1px solid #d97706', borderRadius: 6, background: '#fffbeb', padding: '7px 12px', marginBottom: 8, fontSize: 9, fontFamily: 'monospace', color: '#92400e' }}>
        <div style={{ fontWeight: 700, marginBottom: 3 }}>Seed (current Shootout winner — Candidate #1)</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 18px' }}>
          <span>Participation: <strong>Top 5</strong></span>
          <span>Coupling: <strong>Listener only</strong></span>
          <span>Q: <strong>× 1.10</strong></span>
          <span>Tang weight: <strong>0.60</strong></span>
          <span>Selection: <strong>Transfer ranked</strong></span>
        </div>
      </div>

      <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#78350f', marginBottom: 8, lineHeight: 1.5 }}>
        Fine-sweeps participation (6) × coupling (4) × Q (5) × tangential weight (5) × selection (3) = {totalCombos.toLocaleString()} combos.
        Improvement threshold: {STALL_THRESHOLD_DB} dB MAE.
      </div>

      {!canRun && (
        <div style={{ fontSize: 10, color: '#b45309', fontFamily: 'monospace', marginBottom: 6 }}>
          ⚠ Need room dims, valid seat, and valid sub position to run.
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <button
          onClick={run}
          disabled={running || !canRun}
          style={{
            height: 32, padding: '0 18px', borderRadius: 6,
            border: '1px solid #92400e', background: running ? '#e5e7eb' : '#92400e',
            color: running ? '#6b7280' : '#fff', fontSize: 11, fontFamily: 'monospace',
            cursor: running || !canRun ? 'not-allowed' : 'pointer', fontWeight: 700,
          }}
        >
          {running
            ? `Refining… ${pct}% (${progress.done.toLocaleString()}/${progress.total.toLocaleString()})`
            : results ? 'Re-run Refiner' : 'Run Best Candidate Refiner'}
        </button>
        {running && (
          <button onClick={cancel} style={{ height: 28, padding: '0 10px', borderRadius: 6, border: '1px solid #dc2626', background: '#fef2f2', color: '#dc2626', fontSize: 10, fontFamily: 'monospace', cursor: 'pointer' }}>
            Cancel
          </button>
        )}
      </div>

      {running && (
        <div style={{ width: '100%', background: '#fde68a', borderRadius: 4, height: 8, marginBottom: 10 }}>
          <div style={{ width: `${pct}%`, background: '#d97706', height: 8, borderRadius: 4, transition: 'width 0.15s' }} />
        </div>
      )}

      {results && (
        <>
          {/* ── Verdict banner ── */}
          <div style={{
            border: `2px solid ${results.stalled ? '#dc2626' : '#16a34a'}`,
            borderRadius: 8, background: results.stalled ? '#fef2f2' : '#f0fdf4',
            padding: '12px 16px', marginBottom: 12,
          }}>
            {results.stalled ? (
              <>
                <div style={{ fontWeight: 800, color: '#991b1b', fontSize: 13, fontFamily: 'monospace', marginBottom: 4 }}>
                  🛑 Refinement has stalled.
                </div>
                <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#7f1d1d' }}>
                  Best refined MAE: <strong>{fmt(results.best?.score?.mae, 3)} dB</strong>
                  {' '}· Seed MAE: <strong>{fmt(results.seedMae, 3)} dB</strong>
                  {' '}· Improvement: <strong>{fmt(results.improvement, 3)} dB</strong> (threshold: {STALL_THRESHOLD_DB} dB)
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#b91c1c', fontFamily: 'monospace', marginTop: 8, background: '#fee2e2', borderRadius: 4, padding: '6px 10px' }}>
                  Move to production test implementation.
                </div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 800, color: '#14532d', fontSize: 13, fontFamily: 'monospace', marginBottom: 4 }}>
                  ✅ Meaningful improvement found — {fmt(results.improvement, 3)} dB MAE gain
                </div>
                <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#166534' }}>
                  Seed MAE: {fmt(results.seedMae, 3)} dB → Refined MAE: {fmt(results.best?.score?.mae, 3)} dB
                </div>
              </>
            )}
          </div>

          {/* ── Best refined candidate ── */}
          {results.best && (
            <div style={{ border: `2px solid ${results.stalled ? '#b45309' : '#16a34a'}`, borderRadius: 8, background: results.stalled ? '#fffbeb' : '#f0fdf4', padding: '10px 14px', marginBottom: 12 }}>
              <div style={{ fontWeight: 800, color: results.stalled ? '#92400e' : '#14532d', fontSize: 11, fontFamily: 'monospace', marginBottom: 6 }}>
                {results.stalled ? '⚑' : '🏆'} Best Refined Candidate (MAE {fmt(results.best.score.mae, 3)} dB)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px 20px', fontSize: 10, fontFamily: 'monospace', color: results.stalled ? '#92400e' : '#166534' }}>
                <div><span style={{ color: '#6b7280' }}>Participation:</span> <strong>{results.best.cfg._labels.participation}</strong></div>
                <div><span style={{ color: '#6b7280' }}>Coupling:</span> <strong>{results.best.cfg._labels.coupling}</strong></div>
                <div><span style={{ color: '#6b7280' }}>Q:</span> <strong>{results.best.cfg._labels.q}</strong></div>
                <div><span style={{ color: '#6b7280' }}>Tang weight:</span> <strong>{results.best.cfg._labels.tang}</strong></div>
                <div><span style={{ color: '#6b7280' }}>Selection:</span> <strong>{results.best.cfg._labels.selection}</strong></div>
                <div>
                  <span style={{ color: '#6b7280' }}>vs seed:</span>{' '}
                  <strong style={{ color: results.stalled ? '#b45309' : '#15803d' }}>
                    {results.improvement != null ? (results.improvement >= 0 ? `▼${fmt(results.improvement, 3)} dB` : `▲${fmt(Math.abs(results.improvement), 3)} dB`) : '—'}
                  </strong>
                </div>
              </div>
              <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {BANDS.map((b, bi) => (
                  <div key={b.label} style={{ fontSize: 9, fontFamily: 'monospace', background: '#fff', border: '1px solid #d1fae5', borderRadius: 4, padding: '2px 8px' }}>
                    {b.label} Hz: <strong>{fmt(results.best.score.bands[bi], 2)} dB</strong>
                  </div>
                ))}
                <div style={{ fontSize: 9, fontFamily: 'monospace', background: '#fff', border: '1px solid #fde68a', borderRadius: 4, padding: '2px 8px' }}>
                  Worst: <strong>{fmt(results.best.score.worstErr, 2)} dB @ {results.best.score.worstHz} Hz</strong>
                </div>
              </div>
            </div>
          )}

          {/* ── Top 20 table ── */}
          <div style={{ border: '1px solid #d6d3d1', borderRadius: 8, background: '#fff', marginBottom: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 10, fontFamily: 'monospace', color: '#1c1917', padding: '10px 12px 6px' }}>
              Top 20 Refined Candidates
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 860 }}>
                <thead>
                  <tr>
                    <th style={{ ...thS, textAlign: 'left', minWidth: 28 }}>#</th>
                    <th style={{ ...thS, textAlign: 'left', minWidth: 70 }}>Particip.</th>
                    <th style={{ ...thS, textAlign: 'left', minWidth: 110 }}>Coupling</th>
                    <th style={{ ...thS, textAlign: 'left', minWidth: 60 }}>Q</th>
                    <th style={{ ...thS, textAlign: 'left', minWidth: 60 }}>Tang</th>
                    <th style={{ ...thS, textAlign: 'left', minWidth: 90 }}>Selection</th>
                    <th style={thS}>MAE</th>
                    <th style={thS}>Δ seed</th>
                    <th style={thS}>Worst</th>
                    <th style={thS}>@ Hz</th>
                    {BANDS.map(b => <th key={b.label} style={thS}>{b.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {results.top20.map((row, i) => {
                    const { cfg, score: sc } = row;
                    const delta = results.seedMae != null ? results.seedMae - sc.mae : null;
                    const isWinner = i === 0;
                    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
                    return (
                      <tr key={cfg._key} style={{ borderBottom: '1px solid #e7e5e4', background: isWinner ? '#fefce8' : '#fff' }}>
                        <td style={{ ...tdS, textAlign: 'left', fontWeight: 700, color: '#78350f', fontSize: 10 }}>{medal}</td>
                        <td style={{ ...tdS, textAlign: 'left', color: '#44403c', fontSize: 8 }}>{cfg._labels.participation}</td>
                        <td style={{ ...tdS, textAlign: 'left', color: '#44403c', fontSize: 8 }}>{cfg._labels.coupling}</td>
                        <td style={{ ...tdS, textAlign: 'left', color: '#44403c', fontSize: 8 }}>{cfg._labels.q}</td>
                        <td style={{ ...tdS, textAlign: 'left', color: '#44403c', fontSize: 8 }}>{cfg._labels.tang}</td>
                        <td style={{ ...tdS, textAlign: 'left', color: '#44403c', fontSize: 8 }}>{cfg._labels.selection}</td>
                        <td style={{ ...tdS, fontWeight: 700, color: isWinner ? '#15803d' : '#1c1917' }}>{fmt(sc.mae, 3)}</td>
                        <td style={{ ...tdS, color: delta != null && delta >= STALL_THRESHOLD_DB ? '#15803d' : '#6b7280', fontWeight: isWinner ? 700 : 400 }}>
                          {delta != null ? (delta >= 0 ? `▼${fmt(delta, 3)}` : `▲${fmt(Math.abs(delta), 3)}`) : '—'}
                        </td>
                        <td style={{ ...tdS, color: (sc.worstErr ?? 0) > 7 ? '#dc2626' : '#374151' }}>{fmt(sc.worstErr, 2)}</td>
                        <td style={{ ...tdS, color: '#6b7280' }}>{sc.worstHz ?? '—'}</td>
                        {sc.bands.map((v, bi) => (
                          <td key={bi} style={{ ...tdS, color: (v ?? 0) > 5 ? '#b45309' : '#374151' }}>{fmt(v, 2)}</td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Summary stats ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {[
              { label: 'Combos tested', value: results.totalRan.toLocaleString(), color: '#1c1917' },
              { label: 'Seed MAE', value: `${fmt(results.seedMae, 3)} dB`, color: '#b45309' },
              { label: 'Best refined MAE', value: `${fmt(results.best?.score?.mae, 3)} dB`, color: '#15803d' },
              { label: 'Net improvement', value: `${results.improvement != null ? (results.improvement >= 0 ? '▼' : '▲') + fmt(Math.abs(results.improvement), 3) : '—'} dB`, color: results.stalled ? '#dc2626' : '#15803d' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: '#fafaf9', border: '1px solid #e7e5e4', borderRadius: 6, padding: '6px 10px' }}>
                <div style={{ fontSize: 9, color: '#6b7280', fontFamily: 'monospace' }}>{label}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color, fontFamily: 'monospace' }}>{value}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}