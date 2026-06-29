/**
 * AbsorptionTrendTest.jsx — Diagnostic only. No production changes.
 *
 * Tests 4 Q formulations (A–D) across 6 rooms and 7 absorption levels.
 * Reports whether modal contrast reduces monotonically as α increases.
 * Identifies dead zones and instability.
 */
import React, { useState, useCallback } from 'react';
import {
  computeRoomModesLocal,
  estimateModeQLocal,
  modeShapeValueLocal,
  resonantTransfer,
} from '@/bass/core/modalCalculations';
import { VARIANTS } from './multiRoomQRegression/qFormulas';

// ── Test config ──────────────────────────────────────────────────────────────
const TEST_ROOMS = [
  { w: 3.5, l: 4.5, h: 2.4, label: '3.5×4.5×2.4' },
  { w: 4.0, l: 6.0, h: 2.4, label: '4.0×6.0×2.4' },
  { w: 4.3, l: 6.0, h: 2.4, label: '4.3×6.0×2.4' },
  { w: 5.0, l: 5.0, h: 2.4, label: '5.0×5.0×2.4' },
  { w: 6.0, l: 8.0, h: 2.7, label: '6.0×8.0×2.7' },
  { w: 7.0, l: 9.0, h: 2.8, label: '7.0×9.0×2.8' },
];

const ALPHA_STEPS = [0.00, 0.10, 0.30, 0.50, 0.70, 0.90, 1.00];
const PROBE_FREQS = [30, 60, 100]; // Hz — Q reported at these

const BASE_Q_BY_TYPE = { axial: 4.0, tangential: 3.9, oblique: 2.5 };

// ── Frequency axis (log-spaced 20–220 Hz) ───────────────────────────────────
function buildFreqAxis() {
  const freqs = [];
  const ppo = 48;
  const n = Math.ceil(Math.log2(220 / 20) * ppo);
  for (let i = 0; i <= n; i++) {
    const hz = 20 * Math.pow(2, i / ppo);
    if (hz > 222) break;
    freqs.push(hz);
  }
  return freqs;
}
const FREQ_AXIS = buildFreqAxis();

// ── Helpers ──────────────────────────────────────────────────────────────────
function makeSA(alpha) {
  return { front: alpha, back: alpha, left: alpha, right: alpha, floor: alpha, ceiling: alpha };
}

function computeResponse(rd, seat, sub, modes) {
  const { widthM: W, lengthM: L, heightM: H } = rd;
  const modalAmp = Math.pow(10, 94 / 20);
  return FREQ_AXIS.map(f => {
    let re = 0, im = 0;
    for (const mode of modes) {
      const sc = modeShapeValueLocal(mode, sub.x, sub.y, sub.z, { widthM: W, lengthM: L, heightM: H });
      const rc = modeShapeValueLocal(mode, seat.x, seat.y, seat.z, { widthM: W, lengthM: L, heightM: H });
      const coupling = sc * rc;
      const { re: tfRe, im: tfIm } = resonantTransfer(f, mode.freq, mode.qValue);
      const order = Math.abs(mode.nx) + Math.abs(mode.ny) + Math.abs(mode.nz);
      const axScale = (mode.type === 'axial' && order >= 2) ? 0.50 : 1.0;
      const gain = modalAmp * coupling * axScale;
      re += gain * tfRe;
      im += gain * tfIm;
    }
    return 20 * Math.log10(Math.max(Math.sqrt(re * re + im * im), 1e-10));
  });
}

function analyseResponse(splDb) {
  const vals = splDb.filter(Number.isFinite);
  if (!vals.length) return null;
  const sorted = [...vals].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const swing = sorted[sorted.length - 1] - sorted[0];
  const maxPeak = sorted[sorted.length - 1];
  const nullDepth = sorted[0];
  let peaks = 0, deepNulls = 0, prev = false, prevN = false;
  for (const db of splDb) {
    if (!Number.isFinite(db)) continue;
    const isPeak = db > median + 4;
    const isNull = db < median - 12;
    if (isPeak && !prev) peaks++;
    if (isNull && !prevN) deepNulls++;
    prev = isPeak; prevN = isNull;
  }
  const stable = swing <= 55 && (maxPeak - median) <= 30;
  return { swing, peaks, deepNulls, maxPeak, nullDepth, stable };
}

// Compute Q at a specific frequency for a given alpha/variant/room
function qAtFreq(f, variant, rd, alpha) {
  const sa = makeSA(alpha);
  const absQ = estimateModeQLocal({ roomDims: rd, surfaceAbsorption: sa, f0: f });
  // baseQ for a hypothetical axial mode at this freq
  const baseQ = BASE_Q_BY_TYPE.axial;
  return variant.fn(baseQ, absQ);
}

// ── Core runner ──────────────────────────────────────────────────────────────
function runAllTests() {
  return TEST_ROOMS.map(room => {
    const rd = { widthM: room.w, lengthM: room.l, heightM: room.h };
    const sub  = { x: room.w * 0.25, y: 0.3,          z: 0.55 };
    const seat = { x: room.w * 0.50, y: room.l * 0.55, z: 1.2  };
    const rawModes = computeRoomModesLocal({ ...rd, fMax: 220 });

    const variantData = VARIANTS.map(variant => {
      const alphaRows = ALPHA_STEPS.map(alpha => {
        const sa = makeSA(alpha);
        const modes = rawModes.map(mode => {
          const absQ = estimateModeQLocal({ roomDims: rd, surfaceAbsorption: sa, f0: mode.freq });
          const baseQ = BASE_Q_BY_TYPE[mode.type] ?? 4.0;
          const qValue = variant.fn(baseQ, absQ);
          return { ...mode, qValue };
        });
        const splDb = computeResponse(rd, seat, sub, modes);
        const metrics = analyseResponse(splDb);
        const qProbes = Object.fromEntries(
          PROBE_FREQS.map(f => [f, qAtFreq(f, variant, rd, alpha)])
        );
        return { alpha, metrics, qProbes };
      });

      // Monotonicity check: does swing reduce as alpha increases?
      const swings = alphaRows.map(r => r.metrics?.swing ?? null);
      let monoFails = 0;
      let deadZoneStart = null, deadZoneCount = 0;
      const DEAD_THRESHOLD = 1.0; // dB
      for (let i = 1; i < swings.length; i++) {
        if (swings[i] !== null && swings[i - 1] !== null) {
          if (swings[i] > swings[i - 1]) monoFails++;
          if (Math.abs(swings[i] - swings[i - 1]) < DEAD_THRESHOLD) deadZoneCount++;
        }
      }
      const totalReduction = (swings[0] ?? 0) - (swings[swings.length - 1] ?? 0);
      const hasInstability = alphaRows.some(r => r.metrics && !r.metrics.stable);
      const swingReductionPct = swings[0] > 0 ? (totalReduction / swings[0]) * 100 : 0;

      return {
        variantId: variant.id,
        variant,
        alphaRows,
        monoFails,
        deadZoneCount,
        totalReduction,
        swingReductionPct,
        hasInstability,
      };
    });

    return { room, rd, variantData };
  });
}

// ── Score each formulation (aggregate across all rooms) ──────────────────────
function scoreSummary(results) {
  return VARIANTS.map(variant => {
    let totalMono = 0, totalDead = 0, totalReduction = 0, totalUnstable = 0;
    for (const roomResult of results) {
      const vd = roomResult.variantData.find(v => v.variantId === variant.id);
      if (!vd) continue;
      totalMono      += vd.monoFails;
      totalDead      += vd.deadZoneCount;
      totalReduction += vd.totalReduction;
      if (vd.hasInstability) totalUnstable++;
    }
    const n = results.length;
    return {
      variantId: variant.id, variant,
      avgMono:      totalMono / n,
      avgDead:      totalDead / n,
      avgReduction: totalReduction / n,
      unstableRooms: totalUnstable,
      // Score: maximise reduction, minimise mono failures, penalise dead zones & instability
      score: Math.round(totalReduction - totalMono * 8 - totalDead * 3 - totalUnstable * 15),
    };
  });
}

// ── Style constants ──────────────────────────────────────────────────────────
const mono = { fontFamily: 'monospace' };
const f1 = v => (Number.isFinite(v) ? v.toFixed(1) : '—');
const f0 = v => (Number.isFinite(v) ? Math.round(v) : '—');

const thBase = {
  padding: '3px 6px', fontSize: 8, ...mono, fontWeight: 700,
  background: '#1e293b', color: '#e2e8f0', borderBottom: '2px solid #475569',
  whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 2,
};
const th  = { ...thBase, textAlign: 'right' };
const thL = { ...thBase, textAlign: 'left' };
const tdB = { padding: '2px 6px', fontSize: 8, ...mono, borderBottom: '1px solid #e5e7eb', verticalAlign: 'middle' };
const td  = { ...tdB, textAlign: 'right' };
const tdL = { ...tdB, textAlign: 'left' };

function monoStatus(fails) {
  if (fails === 0) return <span style={{ color: '#16a34a', fontWeight: 700 }}>✓ MONO</span>;
  if (fails <= 1)  return <span style={{ color: '#f59e0b', fontWeight: 700 }}>⚠ {fails} fail</span>;
  return <span style={{ color: '#dc2626', fontWeight: 700 }}>✗ {fails} fails</span>;
}

// ── Per-room swing trend table ───────────────────────────────────────────────
function RoomSwingTable({ roomResult, variantId }) {
  const vd = roomResult.variantData.find(v => v.variantId === variantId);
  if (!vd) return null;
  const swings = vd.alphaRows.map(r => r.metrics?.swing ?? null);

  return (
    <div style={{ overflowX: 'auto', marginBottom: 10 }}>
      <div style={{ fontSize: 8, fontWeight: 700, color: '#334155', ...mono, marginBottom: 3 }}>
        {roomResult.room.label}
      </div>
      <table style={{ borderCollapse: 'collapse', minWidth: 600 }}>
        <thead>
          <tr>
            <th style={{ ...thL, minWidth: 40 }}>α</th>
            <th style={th}>Q@30Hz</th>
            <th style={th}>Q@60Hz</th>
            <th style={th}>Q@100Hz</th>
            <th style={th}>Swing dB</th>
            <th style={th}>Δ swing</th>
            <th style={th}>Peaks</th>
            <th style={th}>Deep nulls</th>
            <th style={th}>Max peak</th>
            <th style={th}>Null depth</th>
            <th style={th}>Stable?</th>
          </tr>
        </thead>
        <tbody>
          {vd.alphaRows.map((row, i) => {
            const m = row.metrics;
            const prevSwing = i > 0 ? (vd.alphaRows[i - 1].metrics?.swing ?? null) : null;
            const delta = (m?.swing != null && prevSwing != null) ? m.swing - prevSwing : null;
            const isBad = delta !== null && delta > 0;
            const rowBg = i % 2 === 0 ? '#fff' : '#f8fafc';
            return (
              <tr key={row.alpha} style={{ background: rowBg }}>
                <td style={{ ...tdL, fontWeight: 700 }}>{row.alpha.toFixed(2)}</td>
                <td style={td}>{f1(row.qProbes[30])}</td>
                <td style={td}>{f1(row.qProbes[60])}</td>
                <td style={td}>{f1(row.qProbes[100])}</td>
                <td style={{ ...td, fontWeight: 700, color: m?.swing > 40 ? '#dc2626' : m?.swing < 8 ? '#2563eb' : '#16a34a' }}>
                  {f1(m?.swing)}
                </td>
                <td style={{ ...td, fontWeight: 700, color: isBad ? '#dc2626' : delta !== null ? '#16a34a' : '#9ca3af' }}>
                  {delta !== null ? (delta > 0 ? `+${f1(delta)}` : f1(delta)) : '—'}
                </td>
                <td style={td}>{m?.peaks ?? '—'}</td>
                <td style={td}>{m?.deepNulls ?? '—'}</td>
                <td style={td}>{f1(m?.maxPeak)}</td>
                <td style={td}>{f1(m?.nullDepth)}</td>
                <td style={{ ...td, color: m == null ? '#9ca3af' : m.stable ? '#16a34a' : '#dc2626', fontWeight: 700 }}>
                  {m == null ? '—' : m.stable ? 'YES' : 'NO'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ fontSize: 7, ...mono, color: '#6b7280', marginTop: 2 }}>
        Mono fails: {vd.monoFails} &nbsp;|&nbsp; Dead steps (&lt;1 dB change): {vd.deadZoneCount} &nbsp;|&nbsp;
        Total reduction α0→α1: {f1(vd.totalReduction)} dB &nbsp;|&nbsp;
        Instability: {vd.hasInstability ? <span style={{ color: '#dc2626' }}>YES</span> : 'none'}
      </div>
    </div>
  );
}

// ── Aggregate summary table ──────────────────────────────────────────────────
function SummaryTable({ scores }) {
  const sorted = [...scores].sort((a, b) => b.score - a.score);
  const winner = sorted[0];
  return (
    <div style={{ overflowX: 'auto', marginBottom: 12 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 580 }}>
        <thead>
          <tr>
            <th style={{ ...thL, minWidth: 200 }}>Variant</th>
            <th style={th}>Avg mono fails</th>
            <th style={th}>Avg dead steps</th>
            <th style={th}>Avg swing Δ dB</th>
            <th style={th}>Unstable rooms</th>
            <th style={th}>Score</th>
            <th style={th}>Rank</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s, i) => {
            const isW = s.variantId === winner.variantId;
            return (
              <tr key={s.variantId} style={{ background: isW ? '#f0fdf4' : i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                <td style={{ ...tdL, fontWeight: 700, color: s.variant.colour }}>
                  {isW && '🏆 '}{s.variant.label}
                </td>
                <td style={{ ...td, fontWeight: 700, color: s.avgMono < 0.5 ? '#16a34a' : s.avgMono < 1.5 ? '#f59e0b' : '#dc2626' }}>
                  {f1(s.avgMono)}
                </td>
                <td style={{ ...td, color: s.avgDead > 2 ? '#dc2626' : '#374151' }}>{f1(s.avgDead)}</td>
                <td style={{ ...td, fontWeight: 700, color: s.avgReduction > 10 ? '#16a34a' : '#f59e0b' }}>
                  {f1(s.avgReduction)}
                </td>
                <td style={{ ...td, color: s.unstableRooms > 0 ? '#dc2626' : '#6b7280', fontWeight: s.unstableRooms > 0 ? 700 : 400 }}>
                  {s.unstableRooms}
                </td>
                <td style={{ ...td, fontWeight: 700, fontSize: 10 }}>{s.score}</td>
                <td style={{ ...td, fontWeight: 700 }}>#{i + 1}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Final verdict ────────────────────────────────────────────────────────────
function FinalVerdict({ scores }) {
  const sorted = [...scores].sort((a, b) => b.score - a.score);
  const winner = sorted[0];
  const varA = scores.find(s => s.variantId === 'A');
  const aWins = winner.variantId === 'A';
  const noGoodChoice = sorted[0].avgMono >= 1.5 || sorted[0].unstableRooms >= 3;

  const verdictMap = {
    A: 'A. Current production has the best physical absorption trend.',
    B: 'B. Sabine direct has the best physical absorption trend.',
    C: 'C. Logistic saturation has the best physical absorption trend.',
    D: 'D. Soft harmonic limiter has the best physical absorption trend.',
  };
  const verdict = noGoodChoice
    ? 'E. No formulation behaves physically enough.'
    : (verdictMap[winner.variantId] ?? 'E. No formulation behaves physically enough.');

  return (
    <div style={{ border: '2px solid #0891b2', borderRadius: 8, background: '#0f172a', padding: '14px 16px', ...mono, marginTop: 4 }}>
      <div style={{ fontWeight: 700, color: '#f1f5f9', fontSize: 12, marginBottom: 10, borderBottom: '1px solid #334155', paddingBottom: 4 }}>
        ▶ FINAL VERDICT — Absorption Monotonicity Test
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#4ade80', marginBottom: 10 }}>
        {verdict}
      </div>
      <div style={{ fontSize: 8, color: '#cbd5e1', lineHeight: 2.0 }}>
        <div>
          <span style={{ color: '#67e8f9', fontWeight: 700 }}>Winner: </span>
          <span style={{ color: winner.variant.colour, fontWeight: 700 }}>{winner.variant.label}</span>
        </div>
        <div>
          <span style={{ color: '#67e8f9', fontWeight: 700 }}>Current (A): </span>
          avg {f1(varA?.avgMono)} mono fails, {f1(varA?.avgDead)} dead steps, avg reduction {f1(varA?.avgReduction)} dB
        </div>
        <div>
          <span style={{ color: '#67e8f9', fontWeight: 700 }}>Ranking: </span>
          {sorted.map((s, i) => (
            <span key={s.variantId} style={{ color: s.variant.colour }}>
              {s.variant.label.split(' — ')[0]} (score {s.score}){i < sorted.length - 1 ? ' › ' : ''}
            </span>
          ))}
        </div>
        <div style={{ marginTop: 6, color: '#94a3b8' }}>
          Score = total swing reduction − mono_fails×8 − dead_steps×3 − unstable_rooms×15.
          Physical goal: swing decreases monotonically α 0→1 with no dead zones.
        </div>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function AbsorptionTrendTest() {
  const [results, setResults]   = useState(null);
  const [scores, setScores]     = useState(null);
  const [running, setRunning]   = useState(false);
  const [ran, setRan]           = useState(false);
  const [activeRoom, setActiveRoom]       = useState(0);
  const [activeVariant, setActiveVariant] = useState('A');

  const run = useCallback(() => {
    setRunning(true);
    setTimeout(() => {
      const res = runAllTests();
      setResults(res);
      setScores(scoreSummary(res));
      setRan(true);
      setRunning(false);
    }, 10);
  }, []);

  const tabBtn = (label, active, onClick, colour) => (
    <button onClick={onClick} style={{
      padding: '2px 10px', fontSize: 9, fontWeight: 700, borderRadius: 4, cursor: 'pointer', ...mono,
      border: `1px solid ${colour}`,
      background: active ? colour : '#fff',
      color: active ? '#fff' : colour,
    }}>{label}</button>
  );

  return (
    <details style={{ border: '2px solid #059669', borderRadius: 8, background: '#f0fdf4', padding: '8px 10px', marginTop: 8 }}>
      <summary style={{ fontWeight: 700, color: '#065f46', fontSize: 11, cursor: 'pointer', ...mono }}>
        📉 Absorption Monotonicity / Physical Trend Test — 4 formulations × 6 rooms × 7 α steps
      </summary>

      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 9, color: '#064e3b', lineHeight: 1.7, marginBottom: 8, borderLeft: '3px solid #6ee7b7', paddingLeft: 8, ...mono }}>
          Physical goal: α=0 → maximum modal contrast; α=1 → minimum. Swing should reduce smoothly.<br />
          Dead zone = consecutive α steps with &lt;1 dB swing change. Mono fail = swing increases as α rises.<br />
          Score = total_reduction_dB − mono_fails×8 − dead_steps×3 − unstable_rooms×15. Diagnostic only.
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          <button onClick={run} disabled={running} style={{
            height: 28, padding: '0 16px', borderRadius: 5, border: '1px solid #059669',
            background: '#059669', color: '#fff', fontSize: 10, fontWeight: 700,
            cursor: running ? 'not-allowed' : 'pointer', ...mono,
          }}>
            {running ? 'Running 6 rooms × 4 variants × 7 α steps…' : ran ? 'Re-run' : 'Run Absorption Trend Test'}
          </button>
        </div>

        {results && scores && (
          <>
            {/* Aggregate summary */}
            <div style={{ fontWeight: 700, fontSize: 9, color: '#1e293b', ...mono, marginBottom: 4, borderBottom: '1px solid #6ee7b7', paddingBottom: 2 }}>
              AGGREGATE SUMMARY — 6 rooms
            </div>
            <SummaryTable scores={scores} />

            {/* Per-room detail: select room then variant */}
            <div style={{ fontWeight: 700, fontSize: 9, color: '#1e293b', ...mono, marginBottom: 4, borderBottom: '1px solid #6ee7b7', paddingBottom: 2 }}>
              PER-ROOM DETAIL
            </div>

            {/* Room tabs */}
            <div style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 8, color: '#6b7280', ...mono, marginRight: 6 }}>Room:</span>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 3 }}>
                {TEST_ROOMS.map((r, i) => tabBtn(r.label, activeRoom === i, () => setActiveRoom(i), '#059669'))}
              </div>
            </div>

            {/* Variant tabs */}
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 8, color: '#6b7280', ...mono, marginRight: 6 }}>Variant:</span>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 3 }}>
                {VARIANTS.map(v => tabBtn(v.label.split(' — ')[0], activeVariant === v.id, () => setActiveVariant(v.id), v.colour))}
              </div>
            </div>

            <RoomSwingTable
              roomResult={results[activeRoom]}
              variantId={activeVariant}
            />

            <FinalVerdict scores={scores} />

            <div style={{ fontSize: 7, color: '#9ca3af', marginTop: 6, ...mono }}>
              Diagnostic only. No production code changed. Modal-only, no reflections, flat 94 dB source, α uniform per surface.
            </div>
          </>
        )}
      </div>
    </details>
  );
}