/**
 * DegenerateModeGroupingAudit.jsx — DIAGNOSTIC ONLY. No production changes.
 *
 * Compares 4 variants of modal summation:
 *   A — current production (each tuple summed independently)
 *   B — grouped by freq rounded to 1e-6 Hz, coherent sum within group
 *   C — grouped by freq rounded to 1e-6 Hz, RMS/energy-normalised group
 *   D — grouped by freq rounded to 0.01 Hz, RMS/energy-normalised group
 */
import React, { useState, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { computeRoomModesLocal, estimateModeQLocal, modeShapeValueLocal, resonantTransfer } from '@/bass/core/modalCalculations';

// ── Fixed test parameters ─────────────────────────────────────────────────────
const ROOM   = { widthM: 4.3, lengthM: 6.0, heightM: 2.4 };
const SUB    = { x: 0.3, y: 0.3, z: 0.1 };   // corner sub
const SEAT   = { x: 2.15, y: 3.8, z: 1.2 };  // MLP
const ABSORB = { floor: 0.15, ceiling: 0.15, front: 0.15, back: 0.15, left: 0.15, right: 0.15 };
const F_MAX  = 220;
const F_MIN  = 20;
const F_STEPS = 300;
const SOURCE_LEVEL = 1.0;

// frequency axis
const freqAxis = Array.from({ length: F_STEPS }, (_, i) => {
  const t = i / (F_STEPS - 1);
  return F_MIN * Math.pow(F_MAX / F_MIN, t);
});

// ── Modal pressure for a single mode at freq f ───────────────────────────────
function modalContribution(mode, f, roomDims, absorb) {
  const q = estimateModeQLocal({ roomDims, surfaceAbsorption: absorb, f0: mode.freq });
  const srcShape  = modeShapeValueLocal(mode, SUB.x,  SUB.y,  SUB.z,  roomDims);
  const seatShape = modeShapeValueLocal(mode, SEAT.x, SEAT.y, SEAT.z, roomDims);
  const { re, im } = resonantTransfer(f, mode.freq, q);
  const scale = SOURCE_LEVEL * srcShape * seatShape;
  return { re: scale * re, im: scale * im };
}

// ── Variant A: production — sum all tuples independently ─────────────────────
function variantA(modes) {
  return freqAxis.map(f => {
    let re = 0, im = 0;
    for (const m of modes) {
      const c = modalContribution(m, f, ROOM, ABSORB);
      re += c.re; im += c.im;
    }
    const mag = Math.sqrt(re * re + im * im);
    return { f, spl: mag > 1e-12 ? 20 * Math.log10(mag) : -120 };
  });
}

// ── Group modes by rounded frequency ─────────────────────────────────────────
function groupModes(modes, roundTo) {
  const map = new Map();
  for (const m of modes) {
    const key = Math.round(m.freq / roundTo) * roundTo;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(m);
  }
  return map; // key=representative freq, value=mode[]
}

// ── Variant B: coherent sum within group, then sum groups ────────────────────
function variantB(modes, roundTo) {
  const groups = groupModes(modes, roundTo);
  return freqAxis.map(f => {
    let re = 0, im = 0;
    for (const [, members] of groups) {
      let gRe = 0, gIm = 0;
      for (const m of members) {
        const c = modalContribution(m, f, ROOM, ABSORB);
        gRe += c.re; gIm += c.im;
      }
      // coherent group sum (same as production but grouped for counting)
      re += gRe; im += gIm;
    }
    const mag = Math.sqrt(re * re + im * im);
    return { f, spl: mag > 1e-12 ? 20 * Math.log10(mag) : -120 };
  });
}

// ── Variant C/D: RMS/energy-normalised group ─────────────────────────────────
// Within each degenerate group, compute RMS of individual contributions
// (energy sum, not coherent phase sum) then use as a single contribution.
function variantRMS(modes, roundTo) {
  const groups = groupModes(modes, roundTo);
  return freqAxis.map(f => {
    let re = 0, im = 0;
    for (const [, members] of groups) {
      // Compute individual contributions
      const contribs = members.map(m => modalContribution(m, f, ROOM, ABSORB));
      // Energy (RMS) normalisation: sqrt(sum of |c_i|^2)
      const energyMag = Math.sqrt(contribs.reduce((s, c) => s + c.re * c.re + c.im * c.im, 0));
      // Use the phase of the coherent sum, but magnitude = energy-normalised
      let gRe = 0, gIm = 0;
      for (const c of contribs) { gRe += c.re; gIm += c.im; }
      const coherentMag = Math.sqrt(gRe * gRe + gIm * gIm);
      const scale = coherentMag > 1e-15 ? energyMag / coherentMag : 0;
      re += gRe * scale; im += gIm * scale;
    }
    const mag = Math.sqrt(re * re + im * im);
    return { f, spl: mag > 1e-12 ? 20 * Math.log10(mag) : -120 };
  });
}

// ── Metrics from SPL curve ────────────────────────────────────────────────────
function curveMetrics(curve) {
  const vals = curve.map(p => p.spl).filter(v => Number.isFinite(v));
  if (!vals.length) return {};
  const swing = Math.max(...vals) - Math.min(...vals);
  const peakIdx = curve.reduce((best, p, i) => p.spl > curve[best].spl ? i : best, 0);
  const nullIdx = curve.reduce((best, p, i) => p.spl < curve[best].spl ? i : best, 0);
  const median = vals.slice().sort((a,b)=>a-b)[Math.floor(vals.length/2)];
  const deepDips = curve.filter(p => p.spl < median - 8).length;
  return {
    swing: swing.toFixed(1),
    peakHz: curve[peakIdx].f.toFixed(1),
    peakDb: curve[peakIdx].spl.toFixed(1),
    nullHz: curve[nullIdx].f.toFixed(1),
    nullDb: curve[nullIdx].spl.toFixed(1),
    deepDips,
    median: median.toFixed(1),
  };
}

// ── Degeneracy statistics ─────────────────────────────────────────────────────
function degeneracyStats(modes, roundTo) {
  const groups = groupModes(modes, roundTo);
  const sizes = [...groups.values()].map(v => v.length);
  const maxSize = Math.max(...sizes);
  const largestGroup = [...groups.entries()].find(([, v]) => v.length === maxSize);
  const degenGroups = sizes.filter(s => s > 1).length;
  return {
    modeCount: modes.length,
    groupCount: groups.size,
    largestSize: maxSize,
    largestFreq: largestGroup ? largestGroup[0].toFixed(4) : '—',
    degenGroups,
  };
}

// ── Run all variants ──────────────────────────────────────────────────────────
function runAudit() {
  const modes = computeRoomModesLocal({ ...ROOM, fMax: F_MAX });

  const curveA = variantA(modes);
  const curveB = variantB(modes, 1e-6);
  const curveC = variantRMS(modes, 1e-6);
  const curveD = variantRMS(modes, 0.01);

  const statsA = degeneracyStats(modes, 1e-6);  // same grouping logic for counting
  const statsB = degeneracyStats(modes, 1e-6);
  const statsC = degeneracyStats(modes, 1e-6);
  const statsD = degeneracyStats(modes, 0.01);

  const mA = curveMetrics(curveA);
  const mB = curveMetrics(curveB);
  const mC = curveMetrics(curveC);
  const mD = curveMetrics(curveD);

  // Smoother / sharper / unchanged vs A
  const verdict = (mX) => {
    const swingA = parseFloat(mA.swing);
    const swingX = parseFloat(mX.swing);
    const delta = swingX - swingA;
    if (Math.abs(delta) < 0.5) return { label: 'Unchanged', color: '#6b7280' };
    if (delta < 0) return { label: `Smoother (↓${Math.abs(delta).toFixed(1)} dB swing)`, color: '#16a34a' };
    return { label: `Sharper (↑${delta.toFixed(1)} dB swing)`, color: '#dc2626' };
  };

  // Check if B ≈ A (coherent group sum = independent sum, which it always is by associativity)
  const bIsIdenticalToA = curveA.every((p, i) => Math.abs(p.spl - curveB[i].spl) < 0.001);

  // Final conclusion
  const swingA = parseFloat(mA.swing);
  const swingC = parseFloat(mC.swing);
  const swingD = parseFloat(mD.swing);
  const maxDelta = Math.max(Math.abs(swingC - swingA), Math.abs(swingD - swingA));
  let conclusion;
  if (maxDelta < 0.5) conclusion = 1;
  else if (maxDelta < 3.0) conclusion = 4;
  else if (maxDelta < 8.0) conclusion = 2;
  else conclusion = 3;

  // Build chart data
  const chartData = curveA.map((p, i) => ({
    f: parseFloat(p.f.toFixed(2)),
    A: parseFloat(curveA[i].spl.toFixed(2)),
    B: parseFloat(curveB[i].spl.toFixed(2)),
    C: parseFloat(curveC[i].spl.toFixed(2)),
    D: parseFloat(curveD[i].spl.toFixed(2)),
  }));

  // Largest degenerate groups — top 5
  const groups1e6 = groupModes(modes, 1e-6);
  const top5 = [...groups1e6.entries()]
    .filter(([, v]) => v.length > 1)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 5)
    .map(([freq, members]) => ({
      freq: parseFloat(freq).toFixed(6),
      size: members.length,
      types: members.map(m => `(${m.nx},${m.ny},${m.nz})`).join(' | '),
      modeTypes: [...new Set(members.map(m => m.type))].join('+'),
    }));

  return {
    modes, statsA, statsB, statsC, statsD,
    mA, mB, mC, mD,
    verdictB: verdict(mB), verdictC: verdict(mC), verdictD: verdict(mD),
    bIsIdenticalToA, conclusion, chartData, top5,
    swingDeltaC: (swingC - swingA).toFixed(2),
    swingDeltaD: (swingD - swingA).toFixed(2),
  };
}

// ── Styles ────────────────────────────────────────────────────────────────────
const mono = { fontFamily: 'monospace' };
const thS = { padding: '3px 8px', fontSize: 8, ...mono, fontWeight: 700, background: '#1e293b', color: '#e2e8f0', borderBottom: '2px solid #475569', whiteSpace: 'nowrap', position: 'sticky', top: 0, textAlign: 'right' };
const thL = { ...thS, textAlign: 'left' };
const tdS = { padding: '2px 8px', fontSize: 8, ...mono, borderBottom: '1px solid #e5e7eb', textAlign: 'right', verticalAlign: 'top' };
const tdL = { ...tdS, textAlign: 'left' };

const VARIANT_COLORS = { A: '#dc2626', B: '#2563eb', C: '#16a34a', D: '#9333ea' };

const CONCLUSION_TEXT = {
  1: { label: '1 — Degenerate duplicate handling is HARMLESS', color: '#16a34a', bg: '#f0fdf4' },
  2: { label: '2 — Degenerate duplicate handling is MATERIALLY CHANGING the curve', color: '#dc2626', bg: '#fef2f2' },
  3: { label: '3 — Degenerate duplicate handling is the PRIMARY smoothing / parity issue', color: '#7c3aed', bg: '#faf5ff' },
  4: { label: '4 — Degenerate duplicate handling is NOT primary, but CONTRIBUTES', color: '#b45309', bg: '#fffbeb' },
};

// ── Summary stats table ───────────────────────────────────────────────────────
function SummaryTable({ data }) {
  const { statsA, statsC, statsD, mA, mB, mC, mD, verdictB, verdictC, verdictD, bIsIdenticalToA } = data;
  const rows = [
    { label: 'A — Production (independent)', stats: statsA, m: mA, v: { label: 'Baseline', color: '#6b7280' }, roundTo: '1e-6' },
    { label: 'B — Grouped 1e-6 Hz, coherent', stats: statsC, m: mB, v: verdictB, roundTo: '1e-6', note: bIsIdenticalToA ? '= A by associativity' : '' },
    { label: 'C — Grouped 1e-6 Hz, RMS', stats: statsC, m: mC, v: verdictC, roundTo: '1e-6' },
    { label: 'D — Grouped 0.01 Hz, RMS', stats: statsD, m: mD, v: verdictD, roundTo: '0.01' },
  ];
  return (
    <div style={{ overflowX: 'auto', marginBottom: 10 }}>
      <table style={{ borderCollapse: 'collapse', minWidth: 900 }}>
        <thead>
          <tr>
            <th style={thL}>Variant</th>
            <th style={thS}>Mode count</th>
            <th style={thS}>Group count</th>
            <th style={thS}>Max group</th>
            <th style={thS}>Swing dB</th>
            <th style={thS}>Peak Hz/dB</th>
            <th style={thS}>Null Hz/dB</th>
            <th style={thS}>&gt;8 dB dips</th>
            <th style={{ ...thS, textAlign: 'left' }}>vs A</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
              <td style={{ ...tdL, fontWeight: 700, color: Object.values(VARIANT_COLORS)[i] }}>
                {r.label}
                {r.note && <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 6 }}>({r.note})</span>}
              </td>
              <td style={tdS}>{r.stats.modeCount}</td>
              <td style={tdS}>{r.stats.groupCount}</td>
              <td style={{ ...tdS, color: r.stats.largestSize > 1 ? '#dc2626' : '#16a34a', fontWeight: 700 }}>
                {r.stats.largestSize}
              </td>
              <td style={{ ...tdS, fontWeight: 700 }}>{r.m.swing}</td>
              <td style={tdS}>{r.m.peakHz} / {r.m.peakDb}</td>
              <td style={tdS}>{r.m.nullHz} / {r.m.nullDb}</td>
              <td style={{ ...tdS, color: parseInt(r.m.deepDips) > 0 ? '#dc2626' : '#16a34a', fontWeight: 700 }}>
                {r.m.deepDips}
              </td>
              <td style={{ ...tdS, textAlign: 'left', color: r.v.color, fontWeight: 700 }}>{r.v.label}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Top degenerate groups ─────────────────────────────────────────────────────
function DegenerateGroupsTable({ top5 }) {
  if (!top5.length) {
    return <div style={{ fontSize: 8, color: '#16a34a', ...mono, padding: 8 }}>✓ No degenerate groups found (no exact-frequency duplicates at 1e-6 Hz resolution).</div>;
  }
  return (
    <div style={{ overflowX: 'auto', marginBottom: 10 }}>
      <table style={{ borderCollapse: 'collapse', minWidth: 700 }}>
        <thead>
          <tr>
            <th style={thS}>Rank</th>
            <th style={{ ...thS, textAlign: 'left' }}>Frequency (Hz, 6dp)</th>
            <th style={thS}>Group size</th>
            <th style={thS}>Mode types</th>
            <th style={{ ...thS, textAlign: 'left', minWidth: 320 }}>Members (nx,ny,nz)</th>
          </tr>
        </thead>
        <tbody>
          {top5.map((g, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? '#fef9c3' : '#fefce8' }}>
              <td style={tdS}>{i + 1}</td>
              <td style={{ ...tdL, color: '#dc2626', fontWeight: 700 }}>{g.freq}</td>
              <td style={{ ...tdS, fontWeight: 700, color: g.size > 2 ? '#7c3aed' : '#dc2626' }}>{g.size}</td>
              <td style={tdS}>{g.modeTypes}</td>
              <td style={{ ...tdL, fontSize: 7, color: '#374151' }}>{g.types}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Overlay chart ─────────────────────────────────────────────────────────────
function OverlayChart({ chartData }) {
  const minSpl = Math.min(...chartData.flatMap(p => [p.A, p.B, p.C, p.D]));
  const maxSpl = Math.max(...chartData.flatMap(p => [p.A, p.B, p.C, p.D]));
  const yMin = Math.floor((minSpl - 5) / 5) * 5;
  const yMax = Math.ceil((maxSpl + 5) / 5) * 5;

  // Subsample for performance
  const thinned = chartData.filter((_, i) => i % 2 === 0);

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={thinned} margin={{ top: 4, right: 20, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis
          dataKey="f"
          scale="log"
          domain={[F_MIN, F_MAX]}
          type="number"
          tickCount={8}
          tickFormatter={v => `${Math.round(v)}`}
          tick={{ fontSize: 8, fontFamily: 'monospace' }}
          label={{ value: 'Hz', position: 'insideRight', offset: -4, fontSize: 8, fontFamily: 'monospace' }}
        />
        <YAxis
          domain={[yMin, yMax]}
          tickFormatter={v => `${v}`}
          tick={{ fontSize: 8, fontFamily: 'monospace' }}
          label={{ value: 'dB', angle: -90, position: 'insideLeft', offset: 10, fontSize: 8, fontFamily: 'monospace' }}
        />
        <Tooltip
          formatter={(v, name) => [`${v} dB`, name]}
          labelFormatter={v => `${v} Hz`}
          contentStyle={{ fontSize: 8, fontFamily: 'monospace' }}
        />
        <Legend wrapperStyle={{ fontSize: 8, fontFamily: 'monospace' }} />
        <Line type="monotone" dataKey="A" stroke={VARIANT_COLORS.A} dot={false} strokeWidth={2} name="A: Production" />
        <Line type="monotone" dataKey="B" stroke={VARIANT_COLORS.B} dot={false} strokeWidth={1.5} strokeDasharray="5 3" name="B: Grouped coherent 1e-6" />
        <Line type="monotone" dataKey="C" stroke={VARIANT_COLORS.C} dot={false} strokeWidth={1.5} strokeDasharray="4 2" name="C: Grouped RMS 1e-6" />
        <Line type="monotone" dataKey="D" stroke={VARIANT_COLORS.D} dot={false} strokeWidth={1.5} strokeDasharray="2 2" name="D: Grouped RMS 0.01" />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Final conclusion banner ───────────────────────────────────────────────────
function ConclusionBanner({ data }) {
  const { conclusion, swingDeltaC, swingDeltaD, bIsIdenticalToA } = data;
  const c = CONCLUSION_TEXT[conclusion];
  return (
    <div style={{ border: `2px solid ${c.color}`, borderRadius: 8, background: c.bg, padding: '12px 14px', ...mono }}>
      <div style={{ fontWeight: 700, fontSize: 12, color: c.color, marginBottom: 8 }}>
        ▶ FINAL ANSWER: {c.label}
      </div>
      <div style={{ fontSize: 8, color: '#1e293b', lineHeight: 2.0 }}>
        <div>
          <span style={{ color: '#7c3aed', fontWeight: 700 }}>Variant B (grouped coherent, 1e-6): </span>
          {bIsIdenticalToA
            ? 'Mathematically IDENTICAL to Variant A. Coherent addition is associative — grouping degenerate modes before summing produces exactly the same result as summing them independently. This confirms B44 production handles coherent degeneracy correctly by default.'
            : 'Non-trivial difference detected — unexpected. Check floating-point precision of grouping key.'}
        </div>
        <div>
          <span style={{ color: '#7c3aed', fontWeight: 700 }}>Variant C (grouped RMS, 1e-6): </span>
          Swing delta vs A = <span style={{ color: parseFloat(swingDeltaC) > 0.5 ? '#dc2626' : '#16a34a', fontWeight: 700 }}>{swingDeltaC} dB</span>.
          RMS normalisation replaces coherent (phase-sensitive) degeneracy with energy-incoherent summation.
        </div>
        <div>
          <span style={{ color: '#7c3aed', fontWeight: 700 }}>Variant D (grouped RMS, 0.01 Hz): </span>
          Swing delta vs A = <span style={{ color: parseFloat(swingDeltaD) > 0.5 ? '#dc2626' : '#16a34a', fontWeight: 700 }}>{swingDeltaD} dB</span>.
          0.01 Hz grouping merges near-degenerate as well as exactly-degenerate pairs.
        </div>
        <div style={{ marginTop: 6, borderTop: '1px solid #e5e7eb', paddingTop: 6, color: '#374151' }}>
          <span style={{ fontWeight: 700 }}>Mechanism: </span>
          Degenerate modes share the same frequency and Q, so their resonant transfer functions are identical at every evaluation point.
          Their coherent sum at the pressure accumulator equals the sum of their individual mode-shape excitation products — identical to processing them as separate tuples.
          Unless the physical model is changed to treat degenerates incoherently (Variant C/D), grouping produces no change.
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function DegenerateModeGroupingAudit() {
  const [result,  setResult]  = useState(null);
  const [running, setRunning] = useState(false);
  const [ran,     setRan]     = useState(false);

  const run = useCallback(() => {
    setRunning(true);
    setTimeout(() => {
      setResult(runAudit());
      setRan(true);
      setRunning(false);
    }, 20);
  }, []);

  return (
    <details style={{ border: '2px solid #7c3aed', borderRadius: 8, background: '#faf5ff', padding: '8px 10px', marginTop: 8 }}>
      <summary style={{ fontWeight: 700, color: '#6d28d9', fontSize: 11, cursor: 'pointer', ...mono }}>
        🔬 Degenerate Mode Grouping Audit — does duplicate-mode handling change the curve?
      </summary>

      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 9, color: '#581c87', lineHeight: 1.7, marginBottom: 8, borderLeft: '3px solid #c084fc', paddingLeft: 8, ...mono }}>
          Diagnostic only. No production changes. Room: {ROOM.widthM}×{ROOM.lengthM}×{ROOM.heightM}m.
          Sub: ({SUB.x},{SUB.y},{SUB.z})m. Seat: ({SEAT.x},{SEAT.y},{SEAT.z})m. α=0.15 all surfaces.
        </div>

        <button onClick={run} disabled={running} style={{
          height: 28, padding: '0 16px', borderRadius: 5, border: '1px solid #7c3aed',
          background: '#7c3aed', color: '#fff', fontSize: 10, fontWeight: 700,
          cursor: running ? 'not-allowed' : 'pointer', ...mono, marginBottom: 10,
        }}>
          {running ? 'Running…' : ran ? 'Re-run' : 'Run Degenerate Mode Grouping Audit'}
        </button>

        {result && (
          <>
            <div style={{ fontWeight: 700, fontSize: 9, color: '#6d28d9', ...mono, marginBottom: 4 }}>
              Degenerate groups (1e-6 Hz resolution) — top 5
            </div>
            <DegenerateGroupsTable top5={result.top5} />

            <div style={{ fontWeight: 700, fontSize: 9, color: '#6d28d9', ...mono, marginBottom: 4, marginTop: 8 }}>
              Variant comparison — metrics
            </div>
            <SummaryTable data={result} />

            <div style={{ fontWeight: 700, fontSize: 9, color: '#6d28d9', ...mono, marginBottom: 4, marginTop: 8 }}>
              Overlay chart — A (red), B (blue dashed), C (green dash), D (purple dot-dash)
            </div>
            <div style={{ background: '#fff', border: '1px solid #e9d5ff', borderRadius: 6, padding: '8px 4px', marginBottom: 12 }}>
              <OverlayChart chartData={result.chartData} />
            </div>

            <ConclusionBanner data={result} />
          </>
        )}

        <div style={{ fontSize: 7, color: '#9ca3af', marginTop: 6, ...mono }}>
          Strict diagnostic mode. No production code modified. No fixes applied.
        </div>
      </div>
    </details>
  );
}