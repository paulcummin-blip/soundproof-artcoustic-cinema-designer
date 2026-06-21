// RewParityParticipationDecayAudit.jsx
// Diagnostic-only: tests 10 participation weighting models to determine whether
// REW parity error comes from hard mode exclusion or soft suppression behaviour.
// Self-contained — no production engine changes, no project state writes.

import React, { useState, useCallback, useRef } from 'react';

// ── REW benchmark (same as all other panels) ──────────────────────────────────
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

const FLAT_SOURCE_DB = 94;
const C = 343;

// ── Scenario definitions ──────────────────────────────────────────────────────
// category: 'current' | 'hard' | 'soft'
// runFn: (contributions, f) → { sumRe, sumIm }
// contributions: array of { re, im, magnitude } — pre-computed per mode per frequency
const SCENARIOS = [
  {
    id: 1,
    label: '1. Current production (all modes)',
    category: 'current',
    desc: 'All modes contribute equally — no weighting applied.',
  },
  {
    id: 2,
    label: '2. Top 3 hard cutoff',
    category: 'hard',
    topN: 3,
    desc: 'Only the 3 modes with highest contribution magnitude are included.',
  },
  {
    id: 3,
    label: '3. Top 5 hard cutoff',
    category: 'hard',
    topN: 5,
    desc: 'Only the 5 modes with highest contribution magnitude are included.',
  },
  {
    id: 4,
    label: '4. Linear contribution weighting',
    category: 'soft',
    weight: (mag, maxMag) => maxMag > 0 ? mag / maxMag : 1,
    desc: 'Each mode scaled by its contribution magnitude normalised to the strongest mode.',
  },
  {
    id: 5,
    label: '5. Contribution² weighting',
    category: 'soft',
    weight: (mag, maxMag) => maxMag > 0 ? Math.pow(mag / maxMag, 2) : 1,
    desc: 'Each mode scaled by (mag/maxMag)² — stronger modes further emphasised.',
  },
  {
    id: 6,
    label: '6. Contribution³ weighting',
    category: 'soft',
    weight: (mag, maxMag) => maxMag > 0 ? Math.pow(mag / maxMag, 3) : 1,
    desc: 'Each mode scaled by (mag/maxMag)³ — aggressive emphasis on dominant modes.',
  },
  {
    id: 7,
    label: '7. Exponential decay weighting',
    category: 'soft',
    weight: (mag, maxMag) => maxMag > 0 ? Math.exp(-4 * (1 - mag / maxMag)) : 1,
    desc: 'Exp decay from dominant mode. Weak modes are heavily attenuated.',
  },
  {
    id: 8,
    label: '8. Logarithmic decay weighting',
    category: 'soft',
    weight: (mag, maxMag) => {
      if (maxMag <= 0) return 1;
      const ratio = mag / maxMag;
      return Math.max(0, (1 + Math.log10(Math.max(ratio, 1e-6)) / 2));
    },
    desc: 'Log-based decay. Moderate suppression of distant modes.',
  },
  {
    id: 9,
    label: '9. Dominant-mode emphasis weighting',
    category: 'soft',
    weight: (mag, maxMag) => {
      if (maxMag <= 0) return 1;
      const ratio = mag / maxMag;
      // Gentle plateau near dominant, steep fall for weak modes
      return ratio > 0.5 ? 1.0 : ratio * 2;
    },
    desc: 'Modes within 50% of peak gain unweighted; below 50% scaled linearly to zero.',
  },
  {
    id: 10,
    label: '10. Continuous energy-ranked weighting',
    category: 'soft',
    weight: (mag, maxMag, rank, total) => {
      if (total <= 1) return 1;
      // Smooth cosine rolloff from rank 1 (weight=1) to last rank (weight→0)
      const t = rank / (total - 1);
      return 0.5 * (1 + Math.cos(Math.PI * t));
    },
    desc: 'Cosine rolloff applied by energy rank — smooth continuous suppression.',
  },
];

// ── Acoustic helpers (self-contained, same conventions as ModalParticipationAudit) ──

function buildFreqAxis(minHz = 20, maxHz = 200) {
  const freqs = [];
  const ppo = 96;
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
  const nMax = Math.ceil((fMax / C) * 2 * Math.max(W, L, H)) + 5;
  for (let nx = 0; nx <= nMax; nx++) {
    for (let ny = 0; ny <= nMax; ny++) {
      for (let nz = 0; nz <= nMax; nz++) {
        if (nx === 0 && ny === 0 && nz === 0) continue;
        const freq = (C / 2) * Math.sqrt((nx / W) ** 2 + (ny / L) ** 2 + (nz / H) ** 2);
        if (!Number.isFinite(freq) || freq <= 0 || freq > fMax) continue;
        const axes = (nx > 0 ? 1 : 0) + (ny > 0 ? 1 : 0) + (nz > 0 ? 1 : 0);
        const type = axes === 1 ? 'axial' : axes === 2 ? 'tangential' : 'oblique';
        modes.push({ nx, ny, nz, freq, type });
      }
    }
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

function typeBaseQ(type, axialQOverride) {
  if (type === 'axial') return Number.isFinite(axialQOverride) ? axialQOverride : 4.0;
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
  return { re: rr / d, im: -ri / d };
}

// ── Core: precompute per-mode per-frequency complex contributions ──────────────
// Returns [{re, im, magnitude}] indexed by [modeIdx][freqIdx]
function precomputeContributions(modesWithQ, freqsHz, W, L, H, sx, sy, sz, rx, ry, rz) {
  const srcAmp = Math.pow(10, FLAT_SOURCE_DB / 20);
  return modesWithQ.map(mode => {
    const sc = cosShape(mode.nx, sx, W) * cosShape(mode.ny, sy, L) * cosShape(mode.nz, sz, H);
    const rc = cosShape(mode.nx, rx, W) * cosShape(mode.ny, ry, L) * cosShape(mode.nz, rz, H);
    const coupling = sc * rc;
    const modeOrder = Math.abs(mode.nx) + Math.abs(mode.ny) + Math.abs(mode.nz);
    const orderWeight = modeOrder >= 2 ? 0.50 : 1.0;
    const hoScale = (mode.type === 'axial' && modeOrder >= 2) ? 0.50 : 1.0;
    const gain = srcAmp * coupling * orderWeight * hoScale;
    return freqsHz.map(f => {
      const { re: tRe, im: tIm } = resonator(f, mode.freq, mode.q);
      const re = gain * tRe;
      const im = gain * tIm;
      return { re, im, magnitude: Math.abs(coupling) * orderWeight * hoScale * Math.sqrt(tRe * tRe + tIm * tIm) };
    });
  });
}

// Direct path contribution (constant across all scenarios)
function directContrib(f, sx, sy, sz, rx, ry, rz) {
  const dist = Math.max(0.01, Math.sqrt((sx - rx) ** 2 + (sy - ry) ** 2 + (sz - rz) ** 2));
  const amp = Math.pow(10, (FLAT_SOURCE_DB - 20 * Math.log10(dist)) / 20);
  const tof = -2 * Math.PI * f * dist / C;
  return { re: amp * Math.cos(tof), im: amp * Math.sin(tof) };
}

// Run a scenario given precomputed per-mode contributions
function runScenario(scenario, precomputed, freqsHz, sx, sy, sz, rx, ry, rz) {
  return freqsHz.map((f, fi) => {
    const direct = directContrib(f, sx, sy, sz, rx, ry, rz);
    let sumRe = direct.re;
    let sumIm = direct.im;

    // Build per-mode entries for this freq bin
    const entries = precomputed.map((modeSeries, mi) => modeSeries[fi]);

    if (scenario.topN != null) {
      // Hard cutoff: include only top N by magnitude
      const sorted = entries
        .map((e, i) => ({ ...e, i }))
        .sort((a, b) => b.magnitude - a.magnitude);
      for (let k = 0; k < Math.min(scenario.topN, sorted.length); k++) {
        const e = sorted[k];
        if (Number.isFinite(e.re) && Number.isFinite(e.im)) {
          sumRe += e.re;
          sumIm += e.im;
        }
      }
    } else if (scenario.weight != null) {
      // Soft weighting
      const mags = entries.map(e => e.magnitude);
      const maxMag = Math.max(...mags, 1e-10);
      const sortedByMag = [...mags.map((m, i) => ({ m, i }))].sort((a, b) => b.m - a.m);
      const rankOf = new Array(mags.length);
      sortedByMag.forEach(({ i }, rank) => { rankOf[i] = rank; });

      entries.forEach((e, idx) => {
        if (!Number.isFinite(e.re) || !Number.isFinite(e.im)) return;
        const w = scenario.weight(e.magnitude, maxMag, rankOf[idx], entries.length);
        if (Number.isFinite(w) && w > 0) {
          sumRe += e.re * w;
          sumIm += e.im * w;
        }
      });
    } else {
      // All modes — current production
      entries.forEach(e => {
        if (Number.isFinite(e.re) && Number.isFinite(e.im)) {
          sumRe += e.re;
          sumIm += e.im;
        }
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

// ── Root cause interpretation ─────────────────────────────────────────────────

function buildRootCauseInterpretation(results) {
  const current = results.find(r => r.scenario.category === 'current');
  if (!current) return null;

  const hardResults = results.filter(r => r.scenario.category === 'hard');
  const softResults = results.filter(r => r.scenario.category === 'soft');

  const bestHard = hardResults.reduce((a, b) => (!a || b.score.mae < a.score.mae) ? b : a, null);
  const bestSoft = softResults.reduce((a, b) => (!a || b.score.mae < a.score.mae) ? b : a, null);

  if (!bestHard || !bestSoft) return null;

  const currentMae = current.score.mae;
  const hardMae = bestHard.score.mae;
  const softMae = bestSoft.score.mae;
  const hardImprovement = currentMae - hardMae;
  const softImprovement = currentMae - softMae;
  const diff = softMae - hardMae; // positive = soft is worse than hard

  // Determine behaviour type
  let behaviourType;
  let confidence;
  let nextDiagnostic;
  const SOFT_CLOSE_THRESHOLD = 0.25; // dB

  if (hardImprovement < 0.5 && softImprovement < 0.5) {
    behaviourType = 'Inconclusive';
    confidence = 'Low';
    nextDiagnostic = 'Neither hard exclusion nor soft suppression meaningfully improves parity. The error source is elsewhere — investigate Q values, modal coupling geometry, or resonator transfer function shape.';
  } else if (hardImprovement > 1.0 && softImprovement < 0.5) {
    behaviourType = 'Hard exclusion behaviour';
    confidence = hardImprovement > 2.0 ? 'High' : 'Moderate';
    nextDiagnostic = `Hard mode exclusion significantly reduces MAE. Soft weighting does not match this improvement. Consider testing mode removal strategies in the production engine, but first confirm whether the excluded modes are genuinely absent in REW or just attenuated.`;
  } else if (softImprovement > 0.5 && diff <= SOFT_CLOSE_THRESHOLD) {
    behaviourType = 'Soft suppression behaviour';
    confidence = softImprovement > 2.0 ? 'High' : 'Moderate';
    nextDiagnostic = `Best soft model ("${bestSoft.scenario.label}") comes within ${diff.toFixed(3)} dB of the best hard cutoff. Prefer testing participation weighting before hard mode removal in production.`;
  } else if (hardImprovement > 0.5 && softImprovement > 0.5) {
    behaviourType = 'Mixed behaviour';
    confidence = 'Moderate';
    nextDiagnostic = `Both hard and soft approaches reduce MAE. Soft suppression gap vs hard cutoff is ${diff.toFixed(3)} dB. A weighted participation model may offer the best production trade-off.`;
  } else {
    behaviourType = 'Inconclusive';
    confidence = 'Low';
    nextDiagnostic = 'Results are ambiguous. Widen the sweep or investigate at specific frequency bands.';
  }

  const softCloseToHard = diff <= SOFT_CLOSE_THRESHOLD && hardImprovement > 0.5;

  return {
    behaviourType,
    confidence,
    nextDiagnostic,
    bestHardLabel: bestHard.scenario.label,
    bestSoftLabel: bestSoft.scenario.label,
    bestHardMae: hardMae,
    bestSoftMae: softMae,
    hardImprovement,
    softImprovement,
    diff,
    softCloseToHard,
  };
}

// ── Formatting helpers ────────────────────────────────────────────────────────
function fmt(v, d = 2) { return Number.isFinite(v) ? Number(v).toFixed(d) : '—'; }

const thS = {
  textAlign: 'right', padding: '3px 5px', fontSize: 9, fontWeight: 700,
  background: '#eff6ff', borderBottom: '2px solid #93c5fd', color: '#1e40af', whiteSpace: 'nowrap',
};
const tdS = { textAlign: 'right', padding: '2px 5px', fontSize: 9, fontFamily: 'monospace' };

const CATEGORY_COLORS = {
  current: { bg: '#fff7ed', border: '#fb923c', text: '#9a3412' },
  hard:    { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b' },
  soft:    { bg: '#f0fdf4', border: '#86efac', text: '#166534' },
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function RewParityParticipationDecayAudit({
  roomDims, seat, sub, surfaceAbsorption, activeSettings,
}) {
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const cancelRef = React.useRef(false);

  const canRun = !!(
    roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM &&
    seat?.x != null && seat?.y != null &&
    sub?.x != null && sub?.y != null
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
    const axialQOverride = activeSettings?.axialQ ?? 4.0;
    const sa = surfaceAbsorption ?? {};

    // Build modes with Q
    const rawModes = buildModes(W, L, H, 210);
    const modesWithQ = rawModes.map(m => {
      const baseQ = typeBaseQ(m.type, axialQOverride);
      const absQ = sabineQ(m.freq, W, L, H, sa);
      return { ...m, q: Math.max(1, Math.min(baseQ, absQ)) };
    });

    const freqsHz = buildFreqAxis(20, 200);

    // Precompute all per-mode contributions — shared across scenarios
    await new Promise(r => setTimeout(r, 0));
    const precomputed = precomputeContributions(modesWithQ, freqsHz, W, L, H, sx, sy, sz, rx, ry, rz);

    const scored = [];

    for (let i = 0; i < SCENARIOS.length; i++) {
      if (cancelRef.current) break;
      const scenario = SCENARIOS[i];
      const splDb = runScenario(scenario, precomputed, freqsHz, sx, sy, sz, rx, ry, rz);
      const score = scoreResponse(freqsHz, splDb);
      if (score) scored.push({ scenario, score });
      setProgress(Math.round(((i + 1) / SCENARIOS.length) * 100));
      await new Promise(r => setTimeout(r, 0)); // yield between scenarios
    }

    if (!cancelRef.current) {
      const ranked = [...scored].sort((a, b) => a.score.mae - b.score.mae);
      const rootCause = buildRootCauseInterpretation(scored);
      setResults({ scored, ranked, rootCause });
    }

    setRunning(false);
    setProgress(0);
  }, [roomDims, seat, sub, surfaceAbsorption, activeSettings, canRun, running]);

  const cancel = () => { cancelRef.current = true; };

  const current = results?.scored?.find(r => r.scenario.category === 'current');
  const ranked = results?.ranked ?? [];
  const rootCause = results?.rootCause ?? null;

  return (
    <div style={{ marginTop: 14, borderTop: '2px solid #93c5fd', paddingTop: 10 }}>
      {/* Header */}
      <div style={{ fontWeight: 700, color: '#1e40af', fontSize: 11, fontFamily: 'monospace', marginBottom: 4 }}>
        REW Parity Participation Decay Audit
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          {SCENARIOS.length} scenarios · hard vs soft suppression · diagnostic only
        </span>
      </div>
      <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#6b7280', marginBottom: 6 }}>
        Tests whether REW parity error comes from hard mode exclusion or soft suppression.
        Compares Top-N cutoffs against weighted participation models (linear, power, exp, log, cosine).
        All scenarios share identical room geometry, Q values, and resonator.
      </div>

      {!canRun && (
        <div style={{ fontSize: 10, color: '#b45309', fontFamily: 'monospace', marginBottom: 6 }}>
          ⚠ Need room dims, valid seat, and valid sub position to run.
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <button
          onClick={runAudit}
          disabled={running || !canRun}
          style={{
            height: 28, padding: '0 14px', borderRadius: 6,
            border: '1px solid #1d4ed8', background: running ? '#e5e7eb' : '#1d4ed8',
            color: running ? '#6b7280' : '#fff', fontSize: 11, fontFamily: 'monospace',
            cursor: running || !canRun ? 'not-allowed' : 'pointer', fontWeight: 600,
          }}
        >
          {running ? `Running… (${progress}%)` : results ? 'Re-run Participation Decay Audit' : 'Run Participation Decay Audit'}
        </button>
        {running && (
          <button
            onClick={cancel}
            style={{
              height: 28, padding: '0 10px', borderRadius: 6,
              border: '1px solid #dc2626', background: '#fef2f2',
              color: '#dc2626', fontSize: 11, fontFamily: 'monospace', cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        )}
      </div>

      {running && (
        <div style={{ width: '100%', background: '#e0e7ff', borderRadius: 4, height: 6, marginBottom: 10 }}>
          <div style={{ width: `${progress}%`, background: '#1d4ed8', height: 6, borderRadius: 4, transition: 'width 0.2s' }} />
        </div>
      )}

      {results && (
        <>
          {/* ── Quick stats strip ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 10 }}>
            {[
              {
                label: 'Current MAE', value: fmt(current?.score?.mae, 3) + ' dB',
                color: '#1e40af',
              },
              {
                label: 'Best hard MAE',
                value: fmt(rootCause?.bestHardMae, 3) + ' dB',
                note: rootCause?.bestHardLabel,
                color: (rootCause?.hardImprovement ?? 0) >= 1 ? '#dc2626' : '#6b7280',
              },
              {
                label: 'Best soft MAE',
                value: fmt(rootCause?.bestSoftMae, 3) + ' dB',
                note: rootCause?.bestSoftLabel,
                color: (rootCause?.softImprovement ?? 0) >= 1 ? '#166534' : '#6b7280',
              },
              {
                label: 'Hard vs soft gap',
                value: rootCause ? (fmt(rootCause.diff, 3) + ' dB') : '—',
                note: rootCause?.softCloseToHard ? '⚡ within 0.25 dB threshold' : undefined,
                color: rootCause?.softCloseToHard ? '#059669' : '#6b7280',
              },
            ].map(({ label, value, note, color }) => (
              <div key={label} style={{ background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 6, padding: '6px 10px' }}>
                <div style={{ fontSize: 9, color: '#6b7280', fontFamily: 'monospace' }}>{label}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color, fontFamily: 'monospace' }}>{value}</div>
                {note && <div style={{ fontSize: 9, color, fontFamily: 'monospace', marginTop: 1 }}>{note}</div>}
              </div>
            ))}
          </div>

          {/* ── ROOT CAUSE INTERPRETATION ── */}
          {rootCause && (
            <div style={{
              marginBottom: 12,
              border: '2px solid #1d4ed8',
              borderRadius: 8,
              background: '#eff6ff',
              padding: '10px 14px',
              fontFamily: 'monospace',
            }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: '#1e3a8a', marginBottom: 6, letterSpacing: '0.04em' }}>
                ROOT CAUSE INTERPRETATION
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: 10, color: '#1e40af', marginBottom: 8 }}>
                <div>
                  <span style={{ color: '#64748b' }}>Behaviour type: </span>
                  <strong style={{
                    color: rootCause.behaviourType === 'Hard exclusion behaviour' ? '#dc2626'
                      : rootCause.behaviourType === 'Soft suppression behaviour' ? '#166534'
                      : rootCause.behaviourType === 'Mixed behaviour' ? '#b45309'
                      : '#6b7280'
                  }}>
                    {rootCause.behaviourType}
                  </strong>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>Confidence: </span>
                  <strong style={{ color: rootCause.confidence === 'High' ? '#166534' : rootCause.confidence === 'Moderate' ? '#b45309' : '#6b7280' }}>
                    {rootCause.confidence}
                  </strong>
                </div>
                <div><span style={{ color: '#64748b' }}>Best hard-cutoff MAE: </span><strong>{fmt(rootCause.bestHardMae, 3)} dB</strong></div>
                <div><span style={{ color: '#64748b' }}>Best soft-suppression MAE: </span><strong>{fmt(rootCause.bestSoftMae, 3)} dB</strong></div>
                <div><span style={{ color: '#64748b' }}>Hard improvement vs current: </span><strong>▼ {fmt(rootCause.hardImprovement, 3)} dB</strong></div>
                <div><span style={{ color: '#64748b' }}>Soft improvement vs current: </span><strong>▼ {fmt(rootCause.softImprovement, 3)} dB</strong></div>
                <div style={{ gridColumn: '1 / -1' }}><span style={{ color: '#64748b' }}>Difference (soft − hard): </span><strong>{fmt(rootCause.diff, 3)} dB</strong></div>
              </div>

              {rootCause.softCloseToHard && (
                <div style={{
                  background: '#dcfce7', border: '1px solid #4ade80', borderRadius: 6,
                  padding: '6px 10px', marginBottom: 8, fontSize: 10, color: '#14532d', fontWeight: 700,
                }}>
                  ⚡ Soft suppression is close enough to hard cutoff. Prefer testing participation weighting before hard mode removal.
                </div>
              )}

              <div style={{ fontSize: 10, color: '#1e3a8a', background: '#dbeafe', borderRadius: 6, padding: '6px 10px' }}>
                <div style={{ fontWeight: 700, marginBottom: 2 }}>Recommended next step:</div>
                {rootCause.nextDiagnostic}
              </div>
            </div>
          )}

          {/* ── Results table ── */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 860 }}>
              <thead>
                <tr>
                  <th style={{ ...thS, textAlign: 'left', minWidth: 40 }}>Rank</th>
                  <th style={{ ...thS, textAlign: 'left', minWidth: 200 }}>Scenario</th>
                  <th style={{ ...thS, minWidth: 72 }}>Overall MAE</th>
                  <th style={{ ...thS, minWidth: 72 }}>Δ vs current</th>
                  <th style={{ ...thS, minWidth: 60 }}>Worst err</th>
                  <th style={{ ...thS, minWidth: 60 }}>Worst Hz</th>
                  {BANDS.map(b => <th key={b.label} style={{ ...thS, minWidth: 60 }}>{b.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {ranked.map((row, i) => {
                  const { scenario, score } = row;
                  const isCurrent = scenario.category === 'current';
                  const colors = CATEGORY_COLORS[scenario.category] ?? {};
                  const maeVsCurrent = current ? score.mae - current.score.mae : null;
                  const improved = maeVsCurrent !== null && maeVsCurrent < -0.01;
                  const worse    = maeVsCurrent !== null && maeVsCurrent > 0.01;

                  const rankLabel = isCurrent ? '★ BASE'
                    : i === 0 ? '🥇 1'
                    : i === 1 ? '🥈 2'
                    : i === 2 ? '🥉 3'
                    : `#${i + 1}`;

                  return (
                    <tr key={scenario.id} style={{ borderBottom: '1px solid #bfdbfe', background: colors.bg }}>
                      <td style={{ ...tdS, textAlign: 'left', fontWeight: 700, color: colors.text, fontSize: 9 }}>{rankLabel}</td>
                      <td style={{ ...tdS, textAlign: 'left', fontSize: 9, maxWidth: 220, whiteSpace: 'normal', color: colors.text, fontWeight: isCurrent || i < 3 ? 700 : 400 }}>
                        {scenario.label}
                      </td>
                      <td style={{ ...tdS, fontWeight: 700, color: isCurrent ? '#1e40af' : improved ? '#166534' : '#374151' }}>
                        {fmt(score.mae, 3)}
                      </td>
                      <td style={{ ...tdS, fontWeight: 700, color: isCurrent ? '#6b7280' : improved ? '#166534' : worse ? '#dc2626' : '#6b7280' }}>
                        {isCurrent ? '—' : maeVsCurrent !== null
                          ? (improved ? `▼ ${fmt(Math.abs(maeVsCurrent), 2)}` : worse ? `▲ ${fmt(maeVsCurrent, 2)}` : '~')
                          : '—'}
                      </td>
                      <td style={{ ...tdS, color: (score.worstErr ?? 0) > 5 ? '#dc2626' : (score.worstErr ?? 0) > 3 ? '#b45309' : '#374151' }}>
                        {fmt(score.worstErr, 3)}
                      </td>
                      <td style={{ ...tdS, color: '#374151' }}>
                        {score.worstHz != null ? `${score.worstHz} Hz` : '—'}
                      </td>
                      {score.bands.map((v, bi) => {
                        const curBand = current?.score?.bands[bi];
                        const bandImproved = !isCurrent && v != null && curBand != null && v < curBand - 0.01;
                        const bandWorse    = !isCurrent && v != null && curBand != null && v > curBand + 0.01;
                        return (
                          <td key={bi} style={{
                            ...tdS,
                            color: bandImproved ? '#166534' : bandWorse ? '#dc2626' : (v ?? 0) > 3 ? '#b45309' : '#374151',
                            fontWeight: bandImproved || bandWorse ? 700 : 400,
                          }}>
                            {fmt(v, 2)}{bandImproved ? ' ▼' : bandWorse ? ' ▲' : ''}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ marginTop: 4, fontSize: 9, fontFamily: 'monospace', color: '#6b7280' }}>
              <span style={{ color: CATEGORY_COLORS.current.text }}>★ BASE</span> = all modes · 
              <span style={{ color: CATEGORY_COLORS.hard.text, marginLeft: 4 }}>🔴 red rows = hard cutoff</span> · 
              <span style={{ color: CATEGORY_COLORS.soft.text, marginLeft: 4 }}>🟢 green rows = soft suppression</span>
            </div>
          </div>

          {/* Scenario descriptions */}
          <details style={{ marginTop: 10, borderTop: '1px dashed #93c5fd', paddingTop: 6 }}>
            <summary style={{ fontWeight: 700, color: '#1e40af', fontSize: 9, fontFamily: 'monospace', cursor: 'pointer', marginBottom: 4 }}>
              Scenario descriptions (click to expand)
            </summary>
            {SCENARIOS.map(s => (
              <div key={s.id} style={{ fontSize: 9, fontFamily: 'monospace', color: '#1e3a8a', marginBottom: 2 }}>
                <span style={{ fontWeight: 700 }}>{s.label}:</span> {s.desc}
              </div>
            ))}
          </details>
        </>
      )}
    </div>
  );
}