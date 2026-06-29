/**
 * ModalFrequencyOrderingAudit.jsx — Diagnostic only. No production changes.
 *
 * Audits the nearest-neighbour spacing calculation in the modal overlap computation.
 * Identifies why overlap ratios reach 10^13–10^15.
 *
 * For each room:
 *  - Generates all modes 20–220 Hz via computeRoomModesLocal (exact same call as production)
 *  - Checks sort order, duplicates, zero/negative gaps, self-neighbour risk
 *  - Reports minimum spacing and highlights pathological spacings
 *  - Answers: what is the first mathematically incorrect step?
 */
import React, { useState, useCallback } from 'react';
import { computeRoomModesLocal } from '@/bass/core/modalCalculations';

const TEST_ROOMS = [
  { w: 3.5, l: 4.5, h: 2.4, label: '3.5×4.5×2.4' },
  { w: 4.0, l: 6.0, h: 2.4, label: '4.0×6.0×2.4' },
  { w: 4.3, l: 6.0, h: 2.4, label: '4.3×6.0×2.4' },
  { w: 5.0, l: 5.0, h: 2.4, label: '5.0×5.0×2.4' },
  { w: 6.0, l: 8.0, h: 2.7, label: '6.0×8.0×2.7' },
  { w: 7.0, l: 9.0, h: 2.8, label: '7.0×9.0×2.8' },
];

const SPACING_THRESHOLDS = [0.001, 0.01, 0.1];

// ── Core audit logic ──────────────────────────────────────────────────────────

function auditRoom(room) {
  const rd = { widthM: room.w, lengthM: room.l, heightM: room.h };
  const modes = computeRoomModesLocal({ ...rd, fMax: 220 });

  // 1. Strict sort check
  let strictlySorted = true;
  for (let i = 1; i < modes.length; i++) {
    if (modes[i].freq < modes[i - 1].freq) { strictlySorted = false; break; }
  }

  // 2. Duplicates — modes with exactly the same freq (floating point identical)
  const freqSet = new Set();
  const exactDuplicates = [];
  for (const m of modes) {
    const key = m.freq; // no rounding — exact float
    if (freqSet.has(key)) exactDuplicates.push(m);
    else freqSet.add(key);
  }

  // 3. Near-duplicates — modes within 1e-6 Hz of each other (degenerate)
  const nearDupes = [];
  for (let i = 1; i < modes.length; i++) {
    const gap = modes[i].freq - modes[i - 1].freq;
    if (gap < 1e-6 && gap >= 0) nearDupes.push({ a: modes[i - 1], b: modes[i], gap });
  }

  // 4. Per-mode spacing analysis (same logic as production ModalOverlapBandwidthAudit)
  const modeRows = modes.map((mode, i) => {
    const leftGap  = i > 0               ? mode.freq - modes[i - 1].freq : null;
    const rightGap = i < modes.length - 1 ? modes[i + 1].freq - mode.freq : null;

    // spacing = Math.min(leftGap, rightGap) with Infinity sentinels
    const leftUsed  = leftGap  ?? Infinity;
    const rightUsed = rightGap ?? Infinity;
    const spacing   = Math.min(leftUsed, rightUsed);

    // Can this mode select itself as a neighbour?
    // Only if leftGap or rightGap is 0 (exact duplicate adjacent)
    const selfNeighbourRisk = (leftGap === 0) || (rightGap === 0);

    // Pathological flags
    const isNegative    = (leftGap !== null && leftGap < 0) || (rightGap !== null && rightGap < 0);
    const isZero        = spacing === 0;
    const isTiny001     = spacing > 0 && spacing < 0.001;
    const isTiny01      = spacing >= 0.001 && spacing < 0.01;
    const isTiny1       = spacing >= 0.01  && spacing < 0.1;

    return {
      i, nx: mode.nx, ny: mode.ny, nz: mode.nz,
      freq: mode.freq, type: mode.type,
      prevFreq: i > 0               ? modes[i - 1].freq : null,
      nextFreq: i < modes.length - 1 ? modes[i + 1].freq : null,
      leftGap, rightGap, spacing,
      selfNeighbourRisk, isNegative, isZero,
      isTiny001, isTiny01, isTiny1,
    };
  });

  // 5. Min spacing
  const finiteSpacings = modeRows.map(r => r.spacing).filter(Number.isFinite);
  const minSpacing     = finiteSpacings.length ? Math.min(...finiteSpacings) : Infinity;
  const maxSpacing     = finiteSpacings.length ? Math.max(...finiteSpacings) : 0;

  // 6. Counts per threshold
  const counts = SPACING_THRESHOLDS.map(t => ({
    threshold: t,
    count: modeRows.filter(r => r.spacing > 0 && r.spacing < t).length,
  }));

  // 7. Zero spacings
  const zeroRows         = modeRows.filter(r => r.isZero);
  const negativeRows     = modeRows.filter(r => r.isNegative);
  const selfNeighbourRows = modeRows.filter(r => r.selfNeighbourRisk);

  // 8. Worst overlap ratio implied by min spacing (BW = f/Q, Q~4 axial, use f=100 Hz as representative)
  const repBW  = 100 / 4; // = 25 Hz
  const worstOverlapRatio = minSpacing > 0 ? repBW / minSpacing : Infinity;

  return {
    room, modes, modeRows,
    strictlySorted,
    exactDuplicateCount: exactDuplicates.length,
    exactDuplicates,
    nearDupeCount: nearDupes.length,
    nearDupes,
    minSpacing, maxSpacing,
    zeroCount: zeroRows.length,
    negativeCount: negativeRows.length,
    selfNeighbourCount: selfNeighbourRows.length,
    counts,
    worstOverlapRatio,
    modeCount: modes.length,
  };
}

function runAudit() {
  return TEST_ROOMS.map(auditRoom);
}

// ── Diagnostic verdict ────────────────────────────────────────────────────────

function buildVerdict(results) {
  const anyUnsorted   = results.some(r => !r.strictlySorted);
  const anyExactDupe  = results.some(r => r.exactDuplicateCount > 0);
  const anyNearDupe   = results.some(r => r.nearDupeCount > 0);
  const anyZero       = results.some(r => r.zeroCount > 0);
  const anyNeg        = results.some(r => r.negativeCount > 0);
  const allMinPos     = results.every(r => r.minSpacing > 0);
  const globalMin     = Math.min(...results.map(r => r.minSpacing));
  const globalWorst   = results.reduce((m, r) => r.worstOverlapRatio > m ? r.worstOverlapRatio : m, 0);
  const tinyBelow001  = results.some(r => r.counts[0].count > 0);
  const tinyBelow01   = results.some(r => r.counts[1].count > 0);

  // Determine first failing step
  let firstFailingStep = null;
  let rootCause = null;

  if (anyUnsorted) {
    firstFailingStep = 'Step 1 — Sort: computeRoomModesLocal does not produce a strictly ascending sort.';
    rootCause = 'incorrect_sorting';
  } else if (anyNeg) {
    firstFailingStep = 'Step 2 — Gap arithmetic: a right gap or left gap is negative, implying the sort contains equal-frequency runs that are not stable.';
    rootCause = 'negative_gap';
  } else if (anyExactDupe) {
    firstFailingStep = 'Step 3 — Exact duplicates: two modes share the exact same floating-point frequency. left_gap or right_gap = 0.0 exactly. spacing = 0. overlap_ratio = bw/0 = Infinity → coerced to 10^15+ by IEEE754 operations downstream.';
    rootCause = 'exact_duplicate_zero_spacing';
  } else if (anyZero) {
    firstFailingStep = 'Step 3 — Zero spacing: spacing = 0 reached without exact float duplicate (possible after rounding elsewhere). overlap = Infinity.';
    rootCause = 'zero_spacing';
  } else if (anyNearDupe) {
    firstFailingStep = 'Step 4 — Near-degenerate modes: spacing < 1e-6 Hz (genuine modal degeneracy in room geometry). BW/spacing yields ratios > 10^7 even with physically correct Q.';
    rootCause = 'genuine_modal_degeneracy';
  } else if (tinyBelow001) {
    firstFailingStep = 'Step 4 — Near-zero spacing: minimum spacing < 0.001 Hz. At Q=4, BW≈25 Hz → ratio ≈ 25000. At Q=80, BW≈1.25 Hz → ratio ≈ 1250. Ratios in 10^3–10^4 range arise here.';
    rootCause = 'near_zero_spacing_sub_001';
  } else if (tinyBelow01) {
    firstFailingStep = 'Step 4 — Small spacing: minimum spacing < 0.01 Hz. Ratios up to ~2500 possible.';
    rootCause = 'near_zero_spacing_sub_01';
  } else {
    firstFailingStep = 'No pathological spacing found. Overlap ratios > 10 arise from genuine modal crowding (many modes close together at high frequencies).';
    rootCause = 'modal_crowding';
  }

  return {
    anyUnsorted, anyExactDupe, anyNearDupe, anyZero, anyNeg,
    allMinPos, globalMin, globalWorst,
    tinyBelow001, tinyBelow01,
    firstFailingStep, rootCause,
  };
}

// ── Styles ────────────────────────────────────────────────────────────────────
const mono = { fontFamily: 'monospace' };
const fe = v => (v == null ? '—' : Number.isFinite(v) ? v.toExponential(3) : v === Infinity ? '∞' : '—');
const f4 = v => (v == null ? '—' : Number.isFinite(v) ? v.toFixed(4) : v === Infinity ? '∞' : '—');
const f2 = v => (v == null ? '—' : Number.isFinite(v) ? v.toFixed(2) : '—');
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

// ── Room summary card ─────────────────────────────────────────────────────────
function RoomSummaryCard({ result }) {
  const { room, modeCount, strictlySorted, exactDuplicateCount, nearDupeCount,
          zeroCount, negativeCount, selfNeighbourCount, minSpacing, counts,
          worstOverlapRatio } = result;

  const ok = v => v
    ? <span style={{ color: '#dc2626', fontWeight: 700 }}>✗ YES</span>
    : <span style={{ color: '#16a34a', fontWeight: 700 }}>✓ NO</span>;

  return (
    <div style={{ border: '1px solid #c4b5fd', borderRadius: 6, background: '#fff', padding: '8px 10px', marginBottom: 6 }}>
      <div style={{ fontWeight: 700, fontSize: 9, color: '#4c1d95', ...mono, marginBottom: 6 }}>
        {room.label} — {modeCount} modes (20–220 Hz)
      </div>
      <table style={{ borderCollapse: 'collapse', fontSize: 8, ...mono, width: '100%' }}>
        <tbody>
          <tr>
            <td style={{ ...tdL, color: '#374151', width: '50%' }}>Strictly sorted?</td>
            <td style={td}>{strictlySorted
              ? <span style={{ color: '#16a34a', fontWeight: 700 }}>✓ YES</span>
              : <span style={{ color: '#dc2626', fontWeight: 700 }}>✗ NO</span>}
            </td>
            <td style={{ ...tdL, color: '#374151', width: '50%' }}>Min spacing (Hz)</td>
            <td style={{ ...td, fontWeight: 700, color: minSpacing < 0.001 ? '#dc2626' : minSpacing < 0.01 ? '#f59e0b' : '#16a34a' }}>
              {fe(minSpacing)}
            </td>
          </tr>
          <tr style={{ background: '#f8fafc' }}>
            <td style={tdL}>Exact duplicates (Δf = 0)?</td>
            <td style={td}>{ok(!exactDuplicateCount)} {exactDuplicateCount > 0 && <span style={{ color: '#dc2626' }}>({exactDuplicateCount})</span>}</td>
            <td style={tdL}>Spacings &lt; 0.001 Hz</td>
            <td style={{ ...td, color: counts[0].count > 0 ? '#dc2626' : '#6b7280', fontWeight: counts[0].count > 0 ? 700 : 400 }}>
              {counts[0].count}
            </td>
          </tr>
          <tr>
            <td style={tdL}>Near-dupes (Δf &lt; 1e-6)?</td>
            <td style={td}>{ok(!nearDupeCount)} {nearDupeCount > 0 && <span style={{ color: '#dc2626' }}>({nearDupeCount})</span>}</td>
            <td style={tdL}>Spacings &lt; 0.01 Hz</td>
            <td style={{ ...td, color: counts[1].count > 0 ? '#f59e0b' : '#6b7280', fontWeight: counts[1].count > 0 ? 700 : 400 }}>
              {counts[1].count}
            </td>
          </tr>
          <tr style={{ background: '#f8fafc' }}>
            <td style={tdL}>Zero spacing (spacing = 0)?</td>
            <td style={td}>{ok(!zeroCount)}</td>
            <td style={tdL}>Spacings &lt; 0.1 Hz</td>
            <td style={{ ...td, color: counts[2].count > 0 ? '#f59e0b' : '#6b7280' }}>
              {counts[2].count}
            </td>
          </tr>
          <tr>
            <td style={tdL}>Negative gaps?</td>
            <td style={td}>{ok(!negativeCount)}</td>
            <td style={tdL}>Worst implied overlap ratio (BW=25Hz)</td>
            <td style={{ ...td, fontWeight: 700, color: worstOverlapRatio > 1000 ? '#dc2626' : '#374151' }}>
              {worstOverlapRatio > 1e12 ? `~${worstOverlapRatio.toExponential(1)}` : f2(worstOverlapRatio)}
            </td>
          </tr>
          <tr style={{ background: '#f8fafc' }}>
            <td style={tdL}>Self-neighbour risk (gap = 0)?</td>
            <td style={td}>{ok(!selfNeighbourCount)}</td>
            <td style={tdL}></td>
            <td style={td}></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ── Per-mode detail table (worst 50 spacings) ─────────────────────────────────
function WorstSpacingsTable({ result }) {
  const sorted = [...result.modeRows]
    .filter(r => Number.isFinite(r.spacing))
    .sort((a, b) => a.spacing - b.spacing)
    .slice(0, 60);

  if (!sorted.length) return <div style={{ fontSize: 8, ...mono, color: '#6b7280' }}>No finite spacings.</div>;

  return (
    <div style={{ overflowX: 'auto', marginBottom: 10 }}>
      <div style={{ fontSize: 8, fontWeight: 700, color: '#334155', ...mono, marginBottom: 3 }}>
        {result.room.label} — 60 smallest spacings
      </div>
      <table style={{ borderCollapse: 'collapse', minWidth: 720 }}>
        <thead>
          <tr>
            <th style={th}>#</th>
            <th style={{ ...thL, minWidth: 80 }}>Type</th>
            <th style={th}>nx,ny,nz</th>
            <th style={th}>Freq (Hz)</th>
            <th style={th}>Prev freq</th>
            <th style={th}>Next freq</th>
            <th style={th}>Left gap</th>
            <th style={th}>Right gap</th>
            <th style={th}>Spacing used</th>
            <th style={th}>Overlap ×(BW=25)</th>
            <th style={{ ...thL, minWidth: 80 }}>Flags</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, idx) => {
            const impliedRatio = r.spacing > 0 ? 25 / r.spacing : Infinity;
            const rowBg = r.isZero ? '#fef2f2' : r.isTiny001 ? '#fff7ed' : r.isTiny01 ? '#fefce8' : idx % 2 === 0 ? '#fff' : '#f8fafc';
            const flags = [
              r.isZero          && 'ZERO',
              r.isNegative      && 'NEG',
              r.selfNeighbourRisk && 'SELF',
              r.isTiny001       && '<0.001Hz',
              r.isTiny01        && '<0.01Hz',
              r.isTiny1         && '<0.1Hz',
            ].filter(Boolean);

            return (
              <tr key={idx} style={{ background: rowBg }}>
                <td style={td}>{r.i}</td>
                <td style={tdL}>{r.type}</td>
                <td style={td}>{r.nx},{r.ny},{r.nz}</td>
                <td style={td}>{f4(r.freq)}</td>
                <td style={{ ...td, color: '#6b7280' }}>{f4(r.prevFreq)}</td>
                <td style={{ ...td, color: '#6b7280' }}>{f4(r.nextFreq)}</td>
                <td style={{ ...td, color: r.leftGap === 0 ? '#dc2626' : r.leftGap != null && r.leftGap < 0.01 ? '#f59e0b' : '#374151' }}>
                  {r.leftGap != null ? fe(r.leftGap) : '(edge)'}
                </td>
                <td style={{ ...td, color: r.rightGap === 0 ? '#dc2626' : r.rightGap != null && r.rightGap < 0.01 ? '#f59e0b' : '#374151' }}>
                  {r.rightGap != null ? fe(r.rightGap) : '(edge)'}
                </td>
                <td style={{ ...td, fontWeight: 700, color: r.spacing < 0.001 ? '#dc2626' : r.spacing < 0.01 ? '#f59e0b' : '#374151' }}>
                  {fe(r.spacing)}
                </td>
                <td style={{ ...td, fontWeight: 700, color: impliedRatio > 1000 ? '#dc2626' : impliedRatio > 100 ? '#f59e0b' : '#374151' }}>
                  {impliedRatio > 1e12 ? `~${impliedRatio.toExponential(1)}` : f2(impliedRatio)}
                </td>
                <td style={{ ...tdL, color: '#dc2626', fontWeight: 700 }}>
                  {flags.join(' ')}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Near-duplicate detail ──────────────────────────────────────────────────────
function NearDupeTable({ result }) {
  if (!result.nearDupeCount && !result.exactDuplicateCount) return null;

  const rows = result.nearDupes.slice(0, 30);
  if (!rows.length) return null;

  return (
    <div style={{ overflowX: 'auto', marginBottom: 10 }}>
      <div style={{ fontSize: 8, fontWeight: 700, color: '#dc2626', ...mono, marginBottom: 3 }}>
        Near-duplicate modes (Δf &lt; 1e-6 Hz) — {result.room.label}
      </div>
      <table style={{ borderCollapse: 'collapse', minWidth: 560 }}>
        <thead>
          <tr>
            <th style={{ ...thL }}>Mode A</th>
            <th style={th}>Freq A (Hz)</th>
            <th style={{ ...thL }}>Mode B</th>
            <th style={th}>Freq B (Hz)</th>
            <th style={th}>Gap (Hz)</th>
            <th style={th}>Overlap × (BW=25)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? '#fef2f2' : '#fff7ed' }}>
              <td style={tdL}>{r.a.nx},{r.a.ny},{r.a.nz} ({r.a.type})</td>
              <td style={td}>{r.a.freq.toFixed(8)}</td>
              <td style={tdL}>{r.b.nx},{r.b.ny},{r.b.nz} ({r.b.type})</td>
              <td style={td}>{r.b.freq.toFixed(8)}</td>
              <td style={{ ...td, color: '#dc2626', fontWeight: 700 }}>{r.gap.toExponential(3)}</td>
              <td style={{ ...td, color: '#dc2626', fontWeight: 700 }}>
                {r.gap > 0 ? (25 / r.gap).toExponential(2) : '∞'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Final verdict block ───────────────────────────────────────────────────────
function FinalVerdict({ verdict }) {
  const { anyUnsorted, anyExactDupe, anyNearDupe, anyZero, anyNeg,
          globalMin, tinyBelow001, tinyBelow01,
          firstFailingStep, rootCause } = verdict;

  const causeColour = {
    incorrect_sorting: '#dc2626',
    negative_gap: '#dc2626',
    exact_duplicate_zero_spacing: '#dc2626',
    zero_spacing: '#dc2626',
    genuine_modal_degeneracy: '#f59e0b',
    near_zero_spacing_sub_001: '#f59e0b',
    near_zero_spacing_sub_01: '#f59e0b',
    modal_crowding: '#16a34a',
  }[rootCause] ?? '#e2e8f0';

  const checkRow = (label, fail, detail) => (
    <div style={{ marginBottom: 2 }}>
      <span style={{ color: fail ? '#f87171' : '#4ade80', fontWeight: 700 }}>
        {fail ? '✗' : '✓'}
      </span>
      <span style={{ color: '#e2e8f0', marginLeft: 6 }}>{label}</span>
      {detail && <span style={{ color: '#94a3b8', marginLeft: 6 }}>— {detail}</span>}
    </div>
  );

  return (
    <div style={{ border: '2px solid #7c3aed', borderRadius: 8, background: '#0f172a', padding: '14px 16px', ...mono, marginTop: 8 }}>
      <div style={{ fontWeight: 700, color: '#f1f5f9', fontSize: 11, marginBottom: 10, borderBottom: '1px solid #334155', paddingBottom: 4 }}>
        ▶ DIAGNOSTIC VERDICT — Modal Frequency Ordering & Nearest-Neighbour Audit
      </div>

      <div style={{ fontSize: 8, lineHeight: 2.0, marginBottom: 10 }}>
        {checkRow('Modes strictly sorted by frequency?',      anyUnsorted,  anyUnsorted  ? 'FAIL — not ascending' : 'pass')}
        {checkRow('Exact duplicate frequencies (gap = 0.0)?', anyExactDupe, anyExactDupe ? `FAIL — spacing = 0 → overlap = Infinity` : 'pass')}
        {checkRow('Near-degenerate modes (gap < 1e-6 Hz)?',   anyNearDupe,  anyNearDupe  ? `FAIL — implied overlap ratio > 10^7` : 'pass')}
        {checkRow('Zero spacing reached?',                    anyZero,      anyZero      ? 'FAIL — bw/0 = Infinity' : 'pass')}
        {checkRow('Negative gaps?',                           anyNeg,       anyNeg       ? 'FAIL — sort broken' : 'pass')}
        {checkRow('Spacings below 0.001 Hz present?',         tinyBelow001, tinyBelow001 ? `FAIL — ratios reach ${(25 / globalMin).toExponential(1)}` : 'pass')}
        {checkRow('Spacings below 0.01 Hz present?',          !tinyBelow001 && tinyBelow01, tinyBelow01 ? 'WARN — ratios in 10^3 range' : 'pass')}
      </div>

      <div style={{ borderTop: '1px solid #334155', paddingTop: 8 }}>
        <div style={{ color: '#67e8f9', fontWeight: 700, fontSize: 9, marginBottom: 6 }}>
          Root cause of 10^13–10^15 overlap ratios:
        </div>
        <div style={{ color: causeColour, fontWeight: 700, fontSize: 9, marginBottom: 8 }}>
          {{
            incorrect_sorting: 'INCORRECT SORTING',
            negative_gap: 'NEGATIVE GAP (SORT FAILURE)',
            exact_duplicate_zero_spacing: 'EXACT DUPLICATE FREQUENCIES → ZERO SPACING',
            zero_spacing: 'ZERO SPACING',
            genuine_modal_degeneracy: 'GENUINE MODAL DEGENERACY (very small but non-zero spacing)',
            near_zero_spacing_sub_001: 'NEAR-ZERO SPACING (< 0.001 Hz) from geometric degeneracy',
            near_zero_spacing_sub_01: 'SMALL SPACING (< 0.01 Hz) from modal crowding',
            modal_crowding: 'MODAL CROWDING ONLY — no pathological spacing found',
          }[rootCause] ?? rootCause}
        </div>
        <div style={{ fontSize: 8, color: '#fde68a', lineHeight: 1.9 }}>
          {firstFailingStep}
        </div>
        <div style={{ marginTop: 8, fontSize: 8, color: '#94a3b8', lineHeight: 1.7 }}>
          Global minimum spacing across all 6 rooms: <span style={{ color: '#f87171', fontWeight: 700 }}>{fe(globalMin)} Hz</span>.<br />
          At representative BW = 25 Hz (f=100 Hz, Q=4): implied overlap ratio = <span style={{ color: '#f87171', fontWeight: 700 }}>
            {globalMin > 0 ? (25 / globalMin).toExponential(2) : '∞'}
          </span>.<br />
          This audit does not recommend fixes — it only identifies the first incorrect mathematical step.
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ModalFrequencyOrderingAudit() {
  const [results,    setResults]    = useState(null);
  const [verdict,    setVerdict]    = useState(null);
  const [running,    setRunning]    = useState(false);
  const [ran,        setRan]        = useState(false);
  const [activeRoom, setActiveRoom] = useState(0);
  const [view,       setView]       = useState('summary'); // 'summary' | 'detail' | 'dupes'

  const run = useCallback(() => {
    setRunning(true);
    setTimeout(() => {
      const res = runAudit();
      setResults(res);
      setVerdict(buildVerdict(res));
      setRan(true);
      setRunning(false);
    }, 10);
  }, []);

  const tabBtn = (label, active, onClick, colour = '#7c3aed') => (
    <button key={label} onClick={onClick} style={{
      padding: '2px 10px', fontSize: 9, fontWeight: 700, borderRadius: 4, cursor: 'pointer', ...mono,
      border: `1px solid ${colour}`,
      background: active ? colour : '#fff',
      color: active ? '#fff' : colour,
    }}>{label}</button>
  );

  return (
    <details style={{ border: '2px solid #b45309', borderRadius: 8, background: '#fffbeb', padding: '8px 10px', marginTop: 8 }}>
      <summary style={{ fontWeight: 700, color: '#92400e', fontSize: 11, cursor: 'pointer', ...mono }}>
        🔎 Modal Frequency Ordering &amp; Nearest-Neighbour Audit — why overlap ratios reach 10^15
      </summary>

      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 9, color: '#78350f', lineHeight: 1.7, marginBottom: 8, borderLeft: '3px solid #fcd34d', paddingLeft: 8, ...mono }}>
          Checks: strict sort, exact duplicates, near-degenerate modes, zero/negative gaps, self-neighbour risk.<br />
          Spacing = Math.min(leftGap, rightGap) with Infinity sentinels at edges.<br />
          Worst implied overlap = BW / minSpacing. Diagnostic only — no production code changed.
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          <button onClick={run} disabled={running} style={{
            height: 28, padding: '0 16px', borderRadius: 5, border: '1px solid #b45309',
            background: '#b45309', color: '#fff', fontSize: 10, fontWeight: 700,
            cursor: running ? 'not-allowed' : 'pointer', ...mono,
          }}>
            {running ? 'Running…' : ran ? 'Re-run' : 'Run Ordering & Spacing Audit'}
          </button>
        </div>

        {results && verdict && (
          <>
            {/* View toggle */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
              {tabBtn('Summary', view === 'summary', () => setView('summary'), '#b45309')}
              {tabBtn('Worst spacings', view === 'detail', () => setView('detail'), '#b45309')}
              {tabBtn('Near-dupes', view === 'dupes', () => setView('dupes'), '#b45309')}
            </div>

            {view === 'summary' && (
              <div>
                {results.map((r, i) => <RoomSummaryCard key={i} result={r} />)}
              </div>
            )}

            {view === 'detail' && (
              <>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                  {TEST_ROOMS.map((r, i) => tabBtn(r.label, activeRoom === i, () => setActiveRoom(i), '#b45309'))}
                </div>
                <WorstSpacingsTable result={results[activeRoom]} />
              </>
            )}

            {view === 'dupes' && (
              <>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                  {TEST_ROOMS.map((r, i) => tabBtn(r.label, activeRoom === i, () => setActiveRoom(i), '#b45309'))}
                </div>
                <NearDupeTable result={results[activeRoom]} />
                {!results[activeRoom].nearDupeCount && !results[activeRoom].exactDuplicateCount && (
                  <div style={{ fontSize: 8, color: '#16a34a', ...mono }}>
                    ✓ No exact duplicates or near-degenerate modes in this room.
                  </div>
                )}
              </>
            )}

            <FinalVerdict verdict={verdict} />

            <div style={{ fontSize: 7, color: '#9ca3af', marginTop: 6, ...mono }}>
              Diagnostic only. No production code modified. Uses exact same computeRoomModesLocal call as production.
            </div>
          </>
        )}
      </div>
    </details>
  );
}