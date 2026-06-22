// RewParityErrorBreakdown.jsx
// Diagnostic-only compact shootout panel: tests 10 targeted variants against the fixed REW benchmark.
// Does NOT affect production engine, live graph, or any simulation defaults.

import React, { useState, useCallback } from 'react';

// ── Fixed REW benchmark (canonical) ───────────────────────────────────────────
const REW_BENCHMARK = [
  { hz: 20,  db: 92.4 }, { hz: 25,  db: 93.6 }, { hz: 30,  db: 89.2 },
  { hz: 40,  db: 86.0 }, { hz: 50,  db: 91.8 }, { hz: 57,  db: 104.1 },
  { hz: 60,  db: 98.1 }, { hz: 70,  db: 86.8 }, { hz: 80,  db: 79.7 },
  { hz: 85,  db: 90.8 }, { hz: 100, db: 98.3 }, { hz: 120, db: 92.1 },
  { hz: 150, db: 94.3 }, { hz: 180, db: 99.3 }, { hz: 200, db: 99.5 },
];

// Band definitions for per-band error reporting
const ERROR_BANDS = [
  { label: '50–60 Hz',  lo: 50,  hi: 60  },
  { label: '70–80 Hz',  lo: 70,  hi: 80  },
  { label: '90–110 Hz', lo: 90,  hi: 110 },
];

const FLAT_DB = 94;
const C = 343;

// ── Acoustic primitives (self-contained, no external imports) ─────────────────

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
  return { re: rr / d, im: -ri / d };
}

function interpolateSpl(freqsHz, splDb, targetHz) {
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
    const v = interpolateSpl(freqsHz, splDb, hz);
    if (!Number.isFinite(v)) continue;
    const err = Math.abs(v - db);
    sumErr += err;
    if (err > worstErr) { worstErr = err; worstHz = hz; }
    count++;
  }
  if (count === 0) return null;

  const bandErrors = ERROR_BANDS.map(({ label, lo, hi }) => {
    const pts = REW_BENCHMARK.filter(p => p.hz >= lo && p.hz <= hi);
    let s = 0, c = 0;
    for (const { hz, db } of pts) {
      const v = interpolateSpl(freqsHz, splDb, hz);
      if (!Number.isFinite(v)) continue;
      s += Math.abs(v - db); c++;
    }
    return { label, mae: c > 0 ? s / c : null };
  });

  return { mae: sumErr / count, worstErr, worstHz, bandErrors };
}

// ── Core simulation for a variant ─────────────────────────────────────────────
// Runs direct + full modal summation (all modes) using variant-specific scalars.
// No participation filter, no coupling mode — matches the production engine structure.

function simulateVariant(variant, W, L, H, modesRaw, freqsHz, sx, sy, sz, rx, ry, rz, axialQ, sa) {
  const {
    tangentialScale = 1.0,
    obliquScale = 1.0,
    orderWeightScale = 0.50,     // replaces the hardcoded 0.50 for modeOrder >= 2
    highOrderAxialScale = 1.0,   // extra scale for axial modes with order >= 2
    normRef80 = false,           // normalize curve at 80 Hz to REW benchmark 80 Hz value (79.7 dB)
    rolloffDisabled = null,      // 'not_available' = report not available
    modalGainScale = 1.0,
  } = variant;

  if (rolloffDisabled === 'not_available') return null;

  const srcAmp = Math.pow(10, FLAT_DB / 20) * modalGainScale;

  const modes = modesRaw.map(m => {
    const baseQ = typeBaseQ(m.type, axialQ);
    const absQ = sabineQ(m.freq, W, L, H, sa);
    return { ...m, q: Math.max(1, Math.min(baseQ, absQ)) };
  });

  const splDb = freqsHz.map(f => {
    const dist = Math.max(0.01, Math.sqrt((sx - rx) ** 2 + (sy - ry) ** 2 + (sz - rz) ** 2));
    const distLossDb = -20 * Math.log10(dist);
    const directAmp = Math.pow(10, (FLAT_DB + distLossDb) / 20);
    const tof = -2 * Math.PI * f * dist / C;
    let sumRe = directAmp * Math.cos(tof);
    let sumIm = directAmp * Math.sin(tof);

    for (const mode of modes) {
      const sc = cosShape(mode.nx, sx, W) * cosShape(mode.ny, sy, L) * cosShape(mode.nz, sz, H);
      const rc = cosShape(mode.nx, rx, W) * cosShape(mode.ny, ry, L) * cosShape(mode.nz, rz, H);
      const coupling = sc * rc;

      // Family weight
      const familyW =
        mode.type === 'tangential' ? tangentialScale :
        mode.type === 'oblique'    ? obliquScale :
        1.0; // axial

      // Order weight
      const modeOrder = Math.abs(mode.nx) + Math.abs(mode.ny) + Math.abs(mode.nz);
      const orderWeight = modeOrder >= 2 ? orderWeightScale : 1.0;

      // High-order axial scale (additional, applied on top of orderWeight for axial only)
      const hoAxial = (mode.type === 'axial' && modeOrder >= 2) ? highOrderAxialScale : 1.0;

      const gain = srcAmp * coupling * familyW * orderWeight * hoAxial;
      const { re, im } = resonator(f, mode.freq, mode.q);

      sumRe += gain * re;
      sumIm += gain * im;
    }

    return 20 * Math.log10(Math.max(Math.sqrt(sumRe * sumRe + sumIm * sumIm), 1e-10));
  });

  // Optional 80 Hz normalization (diagnostic only — shifts entire curve, not production)
  if (normRef80) {
    const spl80 = interpolateSpl(freqsHz, splDb, 80);
    const rewRef80 = REW_BENCHMARK.find(p => p.hz === 80)?.db ?? 79.7;
    if (Number.isFinite(spl80)) {
      const offset = rewRef80 - spl80;
      for (let i = 0; i < splDb.length; i++) splDb[i] += offset;
    }
  }

  return splDb;
}

// ── Variant definitions ────────────────────────────────────────────────────────

const VARIANTS = [
  {
    id: 'current',
    label: '1. Current live engine',
    description: 'orderWeight 0.50 for order≥2, all families 1.0, hoAxial 1.0',
    tangentialScale: 1.0,
    obliquScale: 1.0,
    orderWeightScale: 0.50,
    highOrderAxialScale: 1.0,
    normRef80: false,
  },
  {
    id: 'tang_reduced',
    label: '2. Tangential reduced only',
    description: 'tang×0.6, oblique 1.0, orderWeight 0.50',
    tangentialScale: 0.6,
    obliquScale: 1.0,
    orderWeightScale: 0.50,
    highOrderAxialScale: 1.0,
  },
  {
    id: 'obli_reduced',
    label: '3. Oblique reduced only',
    description: 'tang 1.0, oblique×0.5, orderWeight 0.50',
    tangentialScale: 1.0,
    obliquScale: 0.5,
    orderWeightScale: 0.50,
    highOrderAxialScale: 1.0,
  },
  {
    id: 'tang_obli_reduced',
    label: '4. Tangential + oblique reduced',
    description: 'tang×0.6, oblique×0.5, orderWeight 0.50',
    tangentialScale: 0.6,
    obliquScale: 0.5,
    orderWeightScale: 0.50,
    highOrderAxialScale: 1.0,
  },
  {
    id: 'order_050',
    label: '5. modeOrder 0.50 (current)',
    description: 'orderWeight 0.50 for all order≥2 — same as current',
    tangentialScale: 1.0,
    obliquScale: 1.0,
    orderWeightScale: 0.50,
    highOrderAxialScale: 1.0,
  },
  {
    id: 'order_075',
    label: '6. modeOrder 0.75',
    description: 'orderWeight 0.75 for all order≥2',
    tangentialScale: 1.0,
    obliquScale: 1.0,
    orderWeightScale: 0.75,
    highOrderAxialScale: 1.0,
  },
  {
    id: 'order_100',
    label: '7. modeOrder 1.00',
    description: 'orderWeight 1.00 — no order suppression',
    tangentialScale: 1.0,
    obliquScale: 1.0,
    orderWeightScale: 1.00,
    highOrderAxialScale: 1.0,
  },
  {
    id: 'rolloff_disabled',
    label: '8. Low-freq roll-off disabled',
    description: 'not available — roll-off is in the product curve, not an engine toggle',
    rolloffDisabled: 'not_available',
  },
  {
    id: 'norm_current',
    label: '9. Normalisation current (no change)',
    description: 'modalGainScale 1.0 — baseline normalisation',
    tangentialScale: 1.0,
    obliquScale: 1.0,
    orderWeightScale: 0.50,
    highOrderAxialScale: 1.0,
    modalGainScale: 1.0,
  },
  {
    id: 'norm_80hz',
    label: '10. Normalisation matched at 80 Hz',
    description: 'Curve shifted so 80 Hz SPL matches REW benchmark (79.7 dB) — diagnostic only',
    tangentialScale: 1.0,
    obliquScale: 1.0,
    orderWeightScale: 0.50,
    highOrderAxialScale: 1.0,
    modalGainScale: 1.0,
    normRef80: true,
  },
];

// ── Formatting ─────────────────────────────────────────────────────────────────
const fmt = (v, d = 2) => (Number.isFinite(v) ? Number(v).toFixed(d) : '—');

function deltaColor(delta) {
  if (!Number.isFinite(delta)) return '#6b7280';
  if (delta < -0.3) return '#16a34a';   // improves
  if (delta > 0.3)  return '#dc2626';   // worsens
  return '#92400e';                      // negligible
}

function deltaLabel(delta) {
  if (!Number.isFinite(delta)) return '—';
  if (Math.abs(delta) < 0.05) return '≈ same';
  return `${delta > 0 ? '▲' : '▼'} ${Math.abs(delta).toFixed(2)} dB`;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function RewParityErrorBreakdown({ roomDims, seat, sub, surfaceAbsorption, activeSettings }) {
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);

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
    const freqsHz = buildFreqAxis(20, 200);

    const variantResults = VARIANTS.map(variant => {
      if (variant.rolloffDisabled === 'not_available') {
        return { ...variant, score: null, notAvailable: true };
      }
      const splDb = simulateVariant(variant, W, L, H, rawModes, freqsHz, sx, sy, sz, rx, ry, rz, axialQ, sa);
      const score = splDb ? scoreResponse(freqsHz, splDb) : null;
      return { ...variant, score, freqsHz, splDb };
    });

    // Baseline = variant[0] (current live engine)
    const baselineMAE = variantResults[0]?.score?.mae ?? null;

    setResults({ variantResults, baselineMAE });
    setRunning(false);
  }, [roomDims, seat, sub, surfaceAbsorption, activeSettings, canRun, running]);

  const thS = {
    textAlign: 'right', padding: '4px 6px', fontSize: 9, fontWeight: 700,
    background: '#1e1b4b', color: '#c7d2fe', borderBottom: '2px solid #4338ca',
    whiteSpace: 'nowrap',
  };
  const tdS = { textAlign: 'right', padding: '3px 6px', fontSize: 9, fontFamily: 'monospace' };

  return (
    <div style={{ marginTop: 16, borderTop: '3px solid #1e1b4b', paddingTop: 12 }}>

      {/* Header */}
      <div style={{ fontWeight: 800, color: '#1e1b4b', fontSize: 13, fontFamily: 'monospace', marginBottom: 4, letterSpacing: '0.02em' }}>
        REW PARITY ERROR BREAKDOWN
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          {VARIANTS.length} variants · diagnostic only · no engine changes
        </span>
      </div>
      <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#475569', marginBottom: 8, lineHeight: 1.5 }}>
        Tests targeted modal amplitude variants against the fixed REW benchmark.
        All variants use the flat 94 dB source curve and current room geometry.
        Does <strong>not</strong> alter the live graph or production engine defaults.
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
          border: '1px solid #1e1b4b', background: running ? '#e5e7eb' : '#1e1b4b',
          color: running ? '#6b7280' : '#fff', fontSize: 11, fontFamily: 'monospace',
          cursor: running || !canRun ? 'not-allowed' : 'pointer', fontWeight: 700, marginBottom: 12,
        }}
      >
        {running ? 'Running breakdown…' : results ? 'Re-run Breakdown' : 'Run REW Parity Error Breakdown'}
      </button>

      {results && (
        <div style={{ border: '1px solid #c7d2fe', borderRadius: 8, background: '#fff', marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 10, fontFamily: 'monospace', color: '#1e1b4b', padding: '10px 12px 6px', borderBottom: '1px solid #e0e7ff' }}>
            Results — baseline MAE (current engine): {fmt(results.baselineMAE, 3)} dB
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 860 }}>
              <thead>
                <tr>
                  <th style={{ ...thS, textAlign: 'left', minWidth: 220 }}>Variant</th>
                  <th style={thS}>MAE (dB)</th>
                  <th style={thS}>Worst err</th>
                  <th style={thS}>Worst Hz</th>
                  {ERROR_BANDS.map(b => <th key={b.label} style={thS}>{b.label}</th>)}
                  <th style={{ ...thS, textAlign: 'left', minWidth: 100 }}>vs Current</th>
                </tr>
              </thead>
              <tbody>
                {results.variantResults.map((v, i) => {
                  if (v.notAvailable) {
                    return (
                      <tr key={v.id} style={{ borderBottom: '1px solid #e0e7ff', background: '#faf5ff' }}>
                        <td style={{ ...tdS, textAlign: 'left', maxWidth: 220 }}>
                          <div style={{ fontWeight: 700, color: '#1e1b4b', fontSize: 9 }}>{v.label}</div>
                          <div style={{ color: '#9ca3af', fontSize: 8 }}>{v.description}</div>
                        </td>
                        <td colSpan={3 + ERROR_BANDS.length + 1} style={{ ...tdS, textAlign: 'center', color: '#9ca3af', fontStyle: 'italic', fontSize: 9 }}>
                          not available — {v.description}
                        </td>
                      </tr>
                    );
                  }

                  const { score } = v;
                  const mae = score?.mae ?? null;
                  const delta = (mae !== null && results.baselineMAE !== null) ? mae - results.baselineMAE : null;
                  const isBaseline = i === 0;

                  return (
                    <tr key={v.id} style={{ borderBottom: '1px solid #e0e7ff', background: isBaseline ? '#eef2ff' : '#fff' }}>
                      <td style={{ ...tdS, textAlign: 'left', maxWidth: 220 }}>
                        <div style={{ fontWeight: isBaseline ? 800 : 600, color: '#1e1b4b', fontSize: 9 }}>
                          {v.label}
                          {isBaseline && <span style={{ marginLeft: 5, color: '#6366f1', fontSize: 8, fontWeight: 400 }}>(baseline)</span>}
                        </div>
                        <div style={{ color: '#6b7280', fontSize: 8, marginTop: 1 }}>{v.description}</div>
                      </td>
                      <td style={{ ...tdS, fontWeight: 700, color: (mae ?? 99) < (results.baselineMAE ?? 99) - 0.3 ? '#16a34a' : (mae ?? 99) > (results.baselineMAE ?? 99) + 0.3 ? '#dc2626' : '#374151' }}>
                        {fmt(mae, 3)}
                      </td>
                      <td style={{ ...tdS, color: (score?.worstErr ?? 0) > 10 ? '#dc2626' : (score?.worstErr ?? 0) > 6 ? '#b45309' : '#374151' }}>
                        {fmt(score?.worstErr, 2)}
                      </td>
                      <td style={{ ...tdS, color: '#6b7280' }}>{score?.worstHz ?? '—'} Hz</td>
                      {ERROR_BANDS.map((band, bi) => {
                        const bandMae = score?.bandErrors?.[bi]?.mae ?? null;
                        return (
                          <td key={band.label} style={{ ...tdS, color: (bandMae ?? 0) > 8 ? '#dc2626' : (bandMae ?? 0) > 4 ? '#b45309' : '#374151' }}>
                            {fmt(bandMae, 2)}
                          </td>
                        );
                      })}
                      <td style={{ ...tdS, textAlign: 'left', fontWeight: 700, color: deltaColor(delta) }}>
                        {isBaseline ? '—' : deltaLabel(delta)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '8px 12px', fontSize: 8, fontFamily: 'monospace', color: '#6b7280', borderTop: '1px solid #e0e7ff' }}>
            ▼ = improvement (lower MAE than current) · ▲ = worsens · ≈ same = delta &lt; 0.05 dB.
            Band MAE = mean absolute error vs REW benchmark for frequencies within that band only.
            All variants use flat 94 dB source + identical room geometry. Roll-off disabled (Variant 8) is not available
            because LF roll-off is in the product response curve, not an engine toggle.
          </div>
        </div>
      )}
    </div>
  );
}