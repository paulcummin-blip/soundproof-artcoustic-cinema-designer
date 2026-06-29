/**
 * QClampBypassABTest.jsx
 * Diagnostic only — no production defaults changed.
 *
 * Tests whether the baseQ ceiling in production is masking absorption sensitivity.
 * Compares:
 *   A — Production Q:        Math.max(1, Math.min(baseQ, sabineQ))
 *   B — Uncapped Sabine Q:   Math.max(1, sabineQ)       [80-cap only, from estimateModeQLocal]
 *   C — High-cap Sabine Q:   Math.max(1, Math.min(80, sabineQ))  [explicitly 80-capped]
 *
 * Across absorption values: 0.00, 0.10, 0.30, 0.70, 1.00
 */

import React, { useState, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import {
  computeRoomModesLocal,
  estimateModeQLocal,
  modeShapeValueLocal,
  resonantTransfer,
} from '@/bass/core/modalCalculations';

// ─── Constants ─────────────────────────────────────────────────────────────────
const C = 343;
const FLAT_94 = [{ hz: 20, db: 94 }, { hz: 220, db: 94 }];
const ABSORPTION_VALUES = [0.00, 0.10, 0.30, 0.70, 1.00];

const VARIANT_DEFS = [
  { id: 'A', label: 'A — Production Q', desc: 'Math.max(1, Math.min(baseQ, sabineQ))', color: '#213428' },
  { id: 'B', label: 'B — Uncapped Sabine Q', desc: 'Math.max(1, sabineQ)  [80-cap via estimateModeQLocal]', color: '#0891b2' },
  { id: 'C', label: 'C — High-cap (80) Sabine Q', desc: 'Math.max(1, Math.min(80, sabineQ))', color: '#7c3aed' },
];

const ALPHA_COLORS = {
  '0.00': '#dc2626',
  '0.10': '#d97706',
  '0.30': '#2563eb',
  '0.70': '#059669',
  '1.00': '#7c3aed',
};

// ─── Q strategies ──────────────────────────────────────────────────────────────
function productionBaseQ(mode) {
  const ax = (mode.nx > 0 ? 1 : 0) + (mode.ny > 0 ? 1 : 0) + (mode.nz > 0 ? 1 : 0);
  if (ax === 1) return 4.0;
  if (ax === 2) return 3.9;
  return 2.5;
}

function qProduction(mode, roomDims, alpha) {
  const absorption = uniformAbsorption(alpha);
  const baseQ = productionBaseQ(mode);
  const sabineQ = estimateModeQLocal({ roomDims, surfaceAbsorption: absorption, f0: mode.freq });
  return Math.max(1, Math.min(baseQ, sabineQ));
}

function qUncapped(mode, roomDims, alpha) {
  const absorption = uniformAbsorption(alpha);
  // estimateModeQLocal already caps at 80 internally — this is "uncapped baseQ" variant
  return estimateModeQLocal({ roomDims, surfaceAbsorption: absorption, f0: mode.freq });
}

function qHighCap(mode, roomDims, alpha) {
  const absorption = uniformAbsorption(alpha);
  // Explicit 80-cap (same as estimateModeQLocal's internal cap — for clarity)
  const rt60 = 0.161 * (roomDims.widthM * roomDims.lengthM * roomDims.heightM) /
    Math.max(computeTotalAbsorptionArea(roomDims, absorption), 1e-6);
  const tau = rt60 / 13.815;
  const qSabine = 2 * Math.PI * mode.freq * tau;
  return Math.max(1, Math.min(80, qSabine));
}

function uniformAbsorption(alpha) {
  const a = Math.max(0, Math.min(1, alpha));
  return { front: a, back: a, left: a, right: a, ceiling: a, floor: a };
}

function computeTotalAbsorptionArea(roomDims, absorption) {
  const { widthM, lengthM, heightM } = roomDims;
  return (
    lengthM * widthM * (absorption.floor ?? 0) +
    lengthM * widthM * (absorption.ceiling ?? 0) +
    widthM  * heightM * (absorption.front ?? 0) +
    widthM  * heightM * (absorption.back ?? 0) +
    lengthM * heightM * (absorption.left ?? 0) +
    lengthM * heightM * (absorption.right ?? 0)
  );
}

// ─── Q probe — compute finalQ at three diagnostic frequencies ──────────────────
function probeQ(qFn, modes, roomDims, alpha, targetHz) {
  const closest = modes.reduce((best, m) => {
    return Math.abs(m.freq - targetHz) < Math.abs(best.freq - targetHz) ? m : best;
  }, modes[0]);
  if (!closest) return null;
  return qFn(closest, roomDims, alpha);
}

// ─── Frequency axis ────────────────────────────────────────────────────────────
function buildFreqAxis() {
  const freqs = [];
  const min = 20, max = 220, ppo = 96;
  const n = Math.ceil(Math.log2(max / min) * ppo);
  for (let i = 0; i <= n; i++) {
    const f = min * Math.pow(2, i / ppo);
    if (f > max + 0.001) break;
    freqs.push(f);
  }
  if (freqs[freqs.length - 1] < max) freqs.push(max);
  return freqs;
}

// ─── Modal simulation (single sub) ────────────────────────────────────────────
function runModalSim(roomDims, seatPos, sub, freqsHz, qFn) {
  const modes = computeRoomModesLocal({
    widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM, fMax: 220, c: C,
  });

  const src = { x: Number(sub.x), y: Number(sub.y), z: Number(sub.z ?? 0.35) };
  const seat = { x: Number(seatPos.x), y: Number(seatPos.y), z: Number(seatPos.z ?? 1.2) };
  const dx = src.x - seat.x, dy = src.y - seat.y, dz = src.z - seat.z;
  const dist = Math.max(0.01, Math.sqrt(dx * dx + dy * dy + dz * dz));
  const distLossDb = -20 * Math.log10(dist);

  return freqsHz.map(hz => {
    const curveDb = 94; // flat 94 dB source
    const ampLin = Math.pow(10, (curveDb + distLossDb) / 20);
    let re = 0, im = 0;
    for (const mode of modes) {
      const sc = modeShapeValueLocal(mode, src.x, src.y, src.z, roomDims);
      const rc = modeShapeValueLocal(mode, seat.x, seat.y, seat.z, roomDims);
      const coupling = sc * rc;
      const q = qFn(mode);
      const { re: tfRe, im: tfIm } = resonantTransfer(hz, mode.freq, q);
      const modeOrder = Math.abs(mode.nx) + Math.abs(mode.ny) + Math.abs(mode.nz);
      const axialScale = (mode.type === 'axial' && modeOrder >= 2) ? 0.50 : 1.0;
      const gain = ampLin * coupling * axialScale;
      re += gain * tfRe;
      im += gain * tfIm;
    }
    return 20 * Math.log10(Math.max(Math.sqrt(re * re + im * im), 1e-10));
  });
}

// ─── Metrics ───────────────────────────────────────────────────────────────────
function analyseResult(freqsHz, spl) {
  const band = freqsHz.map((f, i) => ({ f, db: spl[i] })).filter(p => p.f >= 20 && p.f <= 120 && Number.isFinite(p.db));
  if (band.length < 3) return {};
  const nullPt = band.reduce((a, b) => b.db < a.db ? b : a);
  const peakPt = band.reduce((a, b) => b.db > a.db ? b : a);
  const all = freqsHz.map((f, i) => ({ f, db: spl[i] })).filter(p => p.f >= 20 && p.f <= 220 && Number.isFinite(p.db));
  let deepDips = 0, highPeaks = 0;
  for (let i = 2; i < all.length - 2; i++) {
    const nb = (all[i-2].db + all[i-1].db + all[i+1].db + all[i+2].db) / 4;
    if (nb - all[i].db > 8) deepDips++;
    if (all[i].db - nb > 8) highPeaks++;
  }
  return {
    nullHz: nullPt.f, nullDb: nullPt.db,
    peakHz: peakPt.f, peakDb: peakPt.db,
    swing: peakPt.db - nullPt.db,
    deepDips, highPeaks,
  };
}

// ─── Tooltip ───────────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px', fontSize: 10, fontFamily: 'monospace' }}>
      <div style={{ fontWeight: 700, marginBottom: 3 }}>{Number(label).toFixed(1)} Hz</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ color: p.stroke }}>
          {p.name}: {Number.isFinite(p.value) ? `${Number(p.value).toFixed(1)} dB` : '—'}
        </div>
      ))}
    </div>
  );
}

// ─── Helper: fmt ───────────────────────────────────────────────────────────────
const fmt1 = v => (v !== null && v !== undefined && Number.isFinite(Number(v))) ? Number(v).toFixed(1) : '—';
const fmt2 = v => (v !== null && v !== undefined && Number.isFinite(Number(v))) ? Number(v).toFixed(2) : '—';

// ─── Main component ────────────────────────────────────────────────────────────
export default function QClampBypassABTest({ roomDims, seatingPositions, subsForSimulation }) {
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);

  const seatPos = useMemo(() => {
    const s = (seatingPositions || []).find(s => s.isPrimary) || seatingPositions?.[0];
    if (!s) return null;
    return { x: Number(s.x), y: Number(s.y), z: Number.isFinite(Number(s.z)) ? Number(s.z) : 1.2 };
  }, [seatingPositions]);

  const sub = useMemo(() => subsForSimulation?.[0] ?? null, [subsForSimulation]);
  const canRun = !!(roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM && seatPos && sub);

  const qFnMap = {
    A: (mode, alpha) => qProduction(mode, roomDims, alpha),
    B: (mode, alpha) => qUncapped(mode, roomDims, alpha),
    C: (mode, alpha) => qHighCap(mode, roomDims, alpha),
  };

  function run() {
    if (!canRun) return;
    setRunning(true);
    setTimeout(() => {
      const rd = { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM };
      const freqsHz = buildFreqAxis();
      const modes = computeRoomModesLocal({ ...rd, fMax: 220, c: C });

      // For each variant × absorption value, run simulation + collect metrics + Q probes
      const grid = {};
      for (const vd of VARIANT_DEFS) {
        grid[vd.id] = {};
        for (const alpha of ABSORPTION_VALUES) {
          const key = alpha.toFixed(2);
          const qFn = mode => qFnMap[vd.id](mode, alpha);
          const spl = runModalSim(rd, seatPos, sub, freqsHz, qFn);
          const metrics = analyseResult(freqsHz, spl);
          const q30  = probeQ(mode => qFnMap[vd.id](mode, alpha), modes, rd, alpha, 30);
          const q60  = probeQ(mode => qFnMap[vd.id](mode, alpha), modes, rd, alpha, 60);
          const q100 = probeQ(mode => qFnMap[vd.id](mode, alpha), modes, rd, alpha, 100);

          // Check if curve visibly changes from α=0.00 to α=1.00 (compare swing)
          grid[vd.id][key] = { freqsHz, spl, metrics, q30, q60, q100 };
        }

        // Compute visiblity verdict: does swing change meaningfully from α=0.00 to α=1.00?
        const swingAt0 = grid[vd.id]['0.00']?.metrics?.swing;
        const swingAt1 = grid[vd.id]['1.00']?.metrics?.swing;
        grid[vd.id].__swingDelta = (Number.isFinite(swingAt0) && Number.isFinite(swingAt1))
          ? swingAt1 - swingAt0 : null;
      }

      // Build overlay chart data (A@0.00, A@1.00, B@0.00, B@1.00, C@0.00, C@1.00)
      const overlayKeys = [
        { variantId: 'A', alpha: '0.00', label: 'A α=0.00', color: '#213428', dash: undefined },
        { variantId: 'A', alpha: '1.00', label: 'A α=1.00', color: '#213428', dash: '4 2' },
        { variantId: 'B', alpha: '0.00', label: 'B α=0.00', color: '#0891b2', dash: undefined },
        { variantId: 'B', alpha: '1.00', label: 'B α=1.00', color: '#0891b2', dash: '4 2' },
        { variantId: 'C', alpha: '0.00', label: 'C α=0.00', color: '#7c3aed', dash: undefined },
        { variantId: 'C', alpha: '1.00', label: 'C α=1.00', color: '#7c3aed', dash: '4 2' },
      ];

      const chartData = freqsHz.map((hz, i) => {
        const pt = { frequency: Math.round(hz * 10) / 10 };
        for (const ok of overlayKeys) {
          const key = `${ok.variantId}_${ok.alpha.replace('.', '_')}`;
          const cell = grid[ok.variantId]?.[ok.alpha];
          pt[key] = cell?.spl[i] ?? null;
        }
        return pt;
      });

      // Final verdict computation
      const verdicts = computeVerdicts(grid);

      setResults({ grid, chartData, overlayKeys, verdicts, freqsHz });
      setRunning(false);
    }, 20);
  }

  function computeVerdicts(grid) {
    // Q1: Is production absorption dead-zoned by the baseQ ceiling?
    const deltaA = grid['A']?.__swingDelta;
    const deltaB = grid['B']?.__swingDelta;
    const q1 = Number.isFinite(deltaA)
      ? (Math.abs(deltaA) < 2 ? 'YES — swing changes <2 dB from α=0.00→1.00 in variant A. baseQ ceiling is masking absorption.' : `PARTIAL — swing changes ${fmt1(deltaA)} dB. Ceiling has some effect but not fully masking.`)
      : '—';

    // Q2: Does bypassing baseQ ceiling make 0% absorption violently different?
    const swingB0 = grid['B']?.['0.00']?.metrics?.swing;
    const swingA0 = grid['A']?.['0.00']?.metrics?.swing;
    const q2Gap = Number.isFinite(swingB0) && Number.isFinite(swingA0) ? swingB0 - swingA0 : null;
    const q2 = q2Gap !== null
      ? (q2Gap > 5 ? `YES — at α=0.00, B swing is ${fmt1(q2Gap)} dB higher than A. Uncapped Q is significantly more violent.` : `NO — at α=0.00, B vs A swing gap is only ${fmt1(q2Gap)} dB. Not significantly more violent.`)
      : '—';

    // Q3: Does uncapped or high-capped Sabine Q tell a more REW-like story?
    // REW-like story = higher contrast, deeper nulls, more visible absorption sensitivity
    const deltaC = grid['C']?.__swingDelta;
    const q3 = (Number.isFinite(deltaB) && Number.isFinite(deltaC))
      ? (Math.abs(deltaB) > Math.abs(deltaC) ? `B (uncapped) shows more absorption sensitivity: ${fmt1(deltaB)} dB swing delta vs C: ${fmt1(deltaC)} dB. Uncapped is more REW-like.` : `C (high-cap 80) shows comparable or higher sensitivity: ${fmt1(deltaC)} dB vs B: ${fmt1(deltaB)} dB.`)
      : '—';

    // Q4: Which Q strategy to test next?
    const allDeltas = [
      { id: 'A', delta: deltaA },
      { id: 'B', delta: deltaB },
      { id: 'C', delta: deltaC },
    ].filter(x => Number.isFinite(x.delta)).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    const best = allDeltas[0];
    const q4 = best
      ? (best.id === 'A' ? 'Production Q (A) is already most absorption-responsive — no change needed.' : `Variant ${best.id} shows the largest absorption sensitivity (${fmt1(best.delta)} dB swing delta). Test this as candidate production Q.`)
      : '—';

    return { q1, q2, q3, q4 };
  }

  // ─── Styles ─────────────────────────────────────────────────────────────────
  const cell  = { padding: '3px 7px', textAlign: 'right', fontSize: 10, fontFamily: 'monospace', borderBottom: '1px solid #e5e7eb' };
  const cellL = { ...cell, textAlign: 'left' };
  const th    = { ...cell, fontWeight: 700, color: '#5b21b6', background: '#f5f3ff', borderBottom: '2px solid #c4b5fd' };
  const thL   = { ...th, textAlign: 'left' };

  return (
    <details style={{ border: '2px solid #7c3aed', borderRadius: 8, background: '#f5f3ff', padding: '8px 10px', marginBottom: 8 }}>
      <summary style={{ fontWeight: 700, color: '#5b21b6', fontSize: 11, fontFamily: 'monospace', cursor: 'pointer' }}>
        🧪 Q Clamp Bypass A/B Test — does uncapped absorption create REW-like contrast?
      </summary>

      <div style={{ marginTop: 8 }}>
        {/* Description */}
        <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#5b21b6', lineHeight: 1.6, marginBottom: 8, background: '#ede9fe', borderRadius: 4, padding: '6px 8px' }}>
          Diagnostic only. No production defaults changed. Tests whether the baseQ ceiling (4.0/3.9/2.5) is masking
          absorption sensitivity by comparing Production Q, uncapped Sabine Q, and 80-capped Sabine Q across
          absorption values 0.00 → 1.00. Same room, same first sub, same primary seat, flat 94 dB source.
        </div>

        {/* Run button */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
          <button
            onClick={run} disabled={!canRun || running}
            style={{ height: 30, padding: '0 14px', borderRadius: 6, border: `1px solid ${canRun && !running ? '#7c3aed' : '#d1d5db'}`, background: canRun && !running ? '#7c3aed' : '#f3f4f6', color: canRun && !running ? '#fff' : '#9ca3af', fontSize: 11, fontFamily: 'monospace', fontWeight: 700, cursor: canRun && !running ? 'pointer' : 'not-allowed' }}>
            {running ? 'Running…' : results ? 'Re-run' : 'Run Q Clamp Bypass Test'}
          </button>
          {!canRun && <span style={{ fontSize: 10, color: '#b45309', fontFamily: 'monospace' }}>Need room dims + seat + at least one sub.</span>}
          {results && !running && (
            <span style={{ fontSize: 10, color: '#5b21b6', fontFamily: 'monospace' }}>
              Room: {roomDims.widthM?.toFixed(1)}×{roomDims.lengthM?.toFixed(1)}×{roomDims.heightM?.toFixed(1)} m
              · Sub: ({sub?.x?.toFixed(2)}, {sub?.y?.toFixed(2)}) · Seat: ({seatPos?.x?.toFixed(2)}, {seatPos?.y?.toFixed(2)})
            </span>
          )}
        </div>

        {results && (
          <>
            {/* ── Q probe table at 30 / 60 / 100 Hz ── */}
            <div style={{ fontWeight: 700, color: '#5b21b6', fontSize: 11, fontFamily: 'monospace', marginBottom: 6 }}>
              Final Q values at diagnostic frequencies
            </div>
            <div style={{ overflowX: 'auto', marginBottom: 12 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 700 }}>
                <thead>
                  <tr>
                    <th style={thL}>Variant</th>
                    <th style={th}>α</th>
                    <th style={th}>Q @ 30 Hz</th>
                    <th style={th}>Q @ 60 Hz</th>
                    <th style={th}>Q @ 100 Hz</th>
                    <th style={th}>Null Hz</th>
                    <th style={th}>Null dB</th>
                    <th style={th}>Peak Hz</th>
                    <th style={th}>Peak dB</th>
                    <th style={th}>Swing dB</th>
                    <th style={th}>Deep dips</th>
                    <th style={th}>High peaks</th>
                    <th style={thL}>Curve changes?</th>
                  </tr>
                </thead>
                <tbody>
                  {VARIANT_DEFS.map(vd => {
                    const swingDelta = results.grid[vd.id]?.__swingDelta;
                    const visiblyChanges = Number.isFinite(swingDelta) && Math.abs(swingDelta) > 2;
                    return ABSORPTION_VALUES.map((alpha, ai) => {
                      const key = alpha.toFixed(2);
                      const cell_data = results.grid[vd.id]?.[key];
                      const m = cell_data?.metrics;
                      const isFirst = ai === 0;
                      const isLast = ai === ABSORPTION_VALUES.length - 1;
                      const alphaColor = ALPHA_COLORS[key] || '#374151';
                      const rowBg = ai % 2 === 0 ? '#faf5ff' : '#f5f3ff';
                      return (
                        <tr key={`${vd.id}-${key}`} style={{ background: rowBg, borderTop: isFirst ? '2px solid #c4b5fd' : undefined }}>
                          {isFirst && (
                            <td style={{ ...cellL, verticalAlign: 'middle', fontWeight: 700, color: vd.color, fontSize: 10, borderRight: '1px solid #e5e7eb' }}
                              rowSpan={ABSORPTION_VALUES.length}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: vd.color }} />
                                {vd.id}
                              </div>
                              <div style={{ fontSize: 9, color: '#6b7280', marginTop: 2, fontWeight: 400 }}>{vd.desc}</div>
                              <div style={{ fontSize: 9, marginTop: 4, fontWeight: 700, color: visiblyChanges ? '#166534' : '#991b1b' }}>
                                {visiblyChanges
                                  ? `✓ Δswing ${fmt1(swingDelta)} dB`
                                  : `✗ Δswing ${fmt1(swingDelta)} dB`}
                              </div>
                            </td>
                          )}
                          <td style={{ ...cell, fontWeight: 700, color: alphaColor }}>{key}</td>
                          <td style={{ ...cell, color: '#374151' }}>{fmt2(cell_data?.q30)}</td>
                          <td style={{ ...cell, color: '#374151' }}>{fmt2(cell_data?.q60)}</td>
                          <td style={{ ...cell, color: '#374151' }}>{fmt2(cell_data?.q100)}</td>
                          <td style={cell}>{fmt1(m?.nullHz)}</td>
                          <td style={{ ...cell, color: m?.nullDb < 75 ? '#dc2626' : '#374151', fontWeight: m?.nullDb < 75 ? 700 : 400 }}>{fmt1(m?.nullDb)}</td>
                          <td style={cell}>{fmt1(m?.peakHz)}</td>
                          <td style={cell}>{fmt1(m?.peakDb)}</td>
                          <td style={{ ...cell, fontWeight: 600 }}>{fmt1(m?.swing)}</td>
                          <td style={cell}>{m?.deepDips ?? '—'}</td>
                          <td style={cell}>{m?.highPeaks ?? '—'}</td>
                          {isFirst && (
                            <td style={{ ...cellL, verticalAlign: 'middle', fontSize: 10, color: visiblyChanges ? '#166534' : '#991b1b', fontWeight: 700 }}
                              rowSpan={ABSORPTION_VALUES.length}>
                              {visiblyChanges ? 'YES — absorption visible' : 'NO — curve static'}
                            </td>
                          )}
                        </tr>
                      );
                    });
                  })}
                </tbody>
              </table>
            </div>

            {/* ── Overlay chart ── */}
            <div style={{ border: '1px solid #c4b5fd', borderRadius: 8, background: '#fff', padding: '10px 12px', marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 11, fontFamily: 'monospace', color: '#5b21b6', marginBottom: 8 }}>
                Overlay Chart — A/B/C at α=0.00 (solid) vs α=1.00 (dashed) · log Hz · no smoothing
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {results.overlayKeys.map(ok => (
                  <span key={ok.label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, fontFamily: 'monospace', padding: '2px 8px', borderRadius: 99, border: `1.5px solid ${ok.color}`, color: ok.color, background: `${ok.color}12` }}>
                    <svg width="18" height="4"><line x1="0" y1="2" x2="18" y2="2" stroke={ok.color} strokeWidth="2" strokeDasharray={ok.dash || 'none'} /></svg>
                    {ok.label}
                  </span>
                ))}
              </div>
              <div style={{ width: '100%', height: 340 }}>
                <ResponsiveContainer>
                  <LineChart data={results.chartData} margin={{ top: 10, right: 50, left: 20, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="frequency" type="number" scale="log" domain={[20, 220]}
                      ticks={[20, 30, 40, 50, 60, 80, 100, 120, 150, 200]}
                      tickFormatter={v => String(Math.round(v))}
                      label={{ value: 'Frequency (Hz)', position: 'insideBottom', offset: -10, fill: '#374151', fontSize: 11 }}
                      tick={{ fill: '#374151', fontSize: 10 }} />
                    <YAxis domain={[60, 120]} ticks={[60, 70, 80, 90, 100, 110, 120]}
                      label={{ value: 'SPL (dB)', angle: -90, position: 'insideLeft', fill: '#374151', fontSize: 11 }}
                      tick={{ fill: '#374151', fontSize: 10 }} allowDecimals={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <ReferenceLine y={94} stroke="#9ca3af" strokeDasharray="2 4" strokeWidth={1} />
                    {results.overlayKeys.map(ok => {
                      const key = `${ok.variantId}_${ok.alpha.replace('.', '_')}`;
                      return (
                        <Line key={key} type="linear" dataKey={key} name={ok.label}
                          stroke={ok.color}
                          strokeWidth={ok.alpha === '0.00' ? 2.5 : 1.5}
                          strokeDasharray={ok.dash}
                          dot={false} activeDot={{ r: 3 }}
                          connectNulls={false} isAnimationActive={false}
                        />
                      );
                    })}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* ── REW overlay note ── */}
            <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#6b7280', marginBottom: 10, padding: '4px 8px', background: '#f9fafb', borderRadius: 4, border: '1px solid #e5e7eb' }}>
              ⓘ D — REW visual reference: <strong>no REW overlay available</strong> in this panel (REW_ESTIMATE hardcoded series not imported here to keep this panel self-contained). Use the Physics Substitution Shootout for REW overlay comparison.
            </div>

            {/* ── Final Verdict ── */}
            <div style={{ border: '2px solid #7c3aed', borderRadius: 6, background: '#ede9fe', padding: '10px 14px', fontSize: 10, fontFamily: 'monospace', lineHeight: 1.8 }}>
              <div style={{ fontWeight: 700, color: '#5b21b6', fontSize: 11, marginBottom: 8 }}>▶ Final Verdict — Q Clamp Bypass A/B Test</div>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <tbody>
                  {[
                    { q: '1. Is production absorption dead-zoned by the baseQ ceiling?', a: results.verdicts.q1 },
                    { q: '2. Does bypassing the baseQ ceiling make α=0.00 visibly violent?', a: results.verdicts.q2 },
                    { q: '3. Does uncapped or high-capped Sabine Q tell a more REW-like story?', a: results.verdicts.q3 },
                    { q: '4. Which exact Q strategy should be tested next as candidate production replacement?', a: results.verdicts.q4 },
                  ].map(({ q, a }, i) => (
                    <tr key={i}>
                      <td style={{ padding: '3px 6px', verticalAlign: 'top', color: '#4c1d95', width: '42%', fontWeight: 600 }}>{q}</td>
                      <td style={{ padding: '3px 6px', verticalAlign: 'top', color: '#1f2937' }}>{a}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Diagnostic disclaimer */}
            <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#b45309', marginTop: 8, lineHeight: 1.5 }}>
              ⚠ Diagnostic only. No production behaviour changed. Modal-only, flat 94 dB source, first sub only, primary seat only.
              Metrics computed over 20–120 Hz null/peak band. Deep dips and high peaks use ±8 dB from local 5-point neighbour average.
            </div>
          </>
        )}
      </div>
    </details>
  );
}