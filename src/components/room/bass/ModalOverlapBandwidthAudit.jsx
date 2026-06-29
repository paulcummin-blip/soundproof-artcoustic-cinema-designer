/**
 * ModalOverlapBandwidthAudit.jsx — Diagnostic only. No production changes.
 *
 * For each of the 6 test rooms × 7 α steps (current production Q, variant A):
 *  - bandwidth = f0/Q  (full -3 dB bandwidth)
 *  - spacing   = distance to nearest neighbouring mode
 *  - overlap ratio = bandwidth / spacing
 *  - reports avg/max overlap, overlapping (>1) and isolated (<0.25) counts
 *  - compares overlap trend vs response swing trend
 *  - answers 4 diagnostic questions
 */
import React, { useState, useCallback } from 'react';
import {
  computeRoomModesLocal,
  estimateModeQLocal,
  modeShapeValueLocal,
  resonantTransfer,
} from '@/bass/core/modalCalculations';

// ── Config ────────────────────────────────────────────────────────────────────
const TEST_ROOMS = [
  { w: 3.5, l: 4.5, h: 2.4, label: '3.5×4.5×2.4' },
  { w: 4.0, l: 6.0, h: 2.4, label: '4.0×6.0×2.4' },
  { w: 4.3, l: 6.0, h: 2.4, label: '4.3×6.0×2.4' },
  { w: 5.0, l: 5.0, h: 2.4, label: '5.0×5.0×2.4' },
  { w: 6.0, l: 8.0, h: 2.7, label: '6.0×8.0×2.7' },
  { w: 7.0, l: 9.0, h: 2.8, label: '7.0×9.0×2.8' },
];

const ALPHA_STEPS  = [0.00, 0.10, 0.30, 0.50, 0.70, 0.90, 1.00];
const BASE_Q_BY_TYPE = { axial: 4.0, tangential: 3.9, oblique: 2.5 };

// Current production Q formula (variant A)
function qA(baseQ, absorptionQ) {
  return Math.max(1, Math.min(baseQ, absorptionQ));
}

function makeSA(alpha) {
  return { front: alpha, back: alpha, left: alpha, right: alpha, floor: alpha, ceiling: alpha };
}

// ── Frequency axis ────────────────────────────────────────────────────────────
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

// ── Overlap metrics ───────────────────────────────────────────────────────────
function computeOverlapMetrics(modes) {
  return modes.map((mode, i) => {
    const bw        = mode.freq / Math.max(mode.qValue, 1e-6);
    const halfWidth = bw / 2;
    const leftGap   = i > 0               ? mode.freq - modes[i - 1].freq : Infinity;
    const rightGap  = i < modes.length - 1 ? modes[i + 1].freq - mode.freq : Infinity;
    const spacing   = Math.min(leftGap, rightGap);
    const overlapRatio = spacing > 0 ? bw / spacing : Infinity;
    return { freq: mode.freq, type: mode.type, q: mode.qValue, bw, halfWidth, spacing, overlapRatio };
  });
}

function summariseOverlap(modeMetrics) {
  const valid = modeMetrics.filter(m => Number.isFinite(m.overlapRatio));
  if (!valid.length) return { avg: 0, max: 0, overlapping: 0, isolated: 0, count: 0 };
  const avg         = valid.reduce((s, m) => s + m.overlapRatio, 0) / valid.length;
  const max         = Math.max(...valid.map(m => m.overlapRatio));
  const overlapping = valid.filter(m => m.overlapRatio > 1).length;
  const isolated    = valid.filter(m => m.overlapRatio < 0.25).length;
  return { avg, max, overlapping, isolated, count: valid.length };
}

// ── Response swing ────────────────────────────────────────────────────────────
function computeSwing(rd, seat, sub, modes) {
  const { widthM: W, lengthM: L, heightM: H } = rd;
  const modalAmp = Math.pow(10, 94 / 20);
  const splDb = FREQ_AXIS.map(f => {
    let re = 0, im = 0;
    for (const mode of modes) {
      const sc = modeShapeValueLocal(mode, sub.x, sub.y, sub.z, { widthM: W, lengthM: L, heightM: H });
      const rc = modeShapeValueLocal(mode, seat.x, seat.y, seat.z, { widthM: W, lengthM: L, heightM: H });
      const coupling = sc * rc;
      const { re: tfRe, im: tfIm } = resonantTransfer(f, mode.freq, mode.qValue);
      const order = Math.abs(mode.nx) + Math.abs(mode.ny) + Math.abs(mode.nz);
      const axScale = (mode.type === 'axial' && order >= 2) ? 0.50 : 1.0;
      re += modalAmp * coupling * axScale * tfRe;
      im += modalAmp * coupling * axScale * tfIm;
    }
    return 20 * Math.log10(Math.max(Math.sqrt(re * re + im * im), 1e-10));
  });
  const finite = splDb.filter(Number.isFinite);
  if (!finite.length) return 0;
  return Math.max(...finite) - Math.min(...finite);
}

// ── Core runner ───────────────────────────────────────────────────────────────
function runAudit() {
  return TEST_ROOMS.map(room => {
    const rd   = { widthM: room.w, lengthM: room.l, heightM: room.h };
    const sub  = { x: room.w * 0.25, y: 0.3,          z: 0.55 };
    const seat = { x: room.w * 0.50, y: room.l * 0.55, z: 1.2  };
    const rawModes = computeRoomModesLocal({ ...rd, fMax: 220 });

    const alphaRows = ALPHA_STEPS.map(alpha => {
      const sa = makeSA(alpha);
      const modes = rawModes.map(mode => {
        const absQ  = estimateModeQLocal({ roomDims: rd, surfaceAbsorption: sa, f0: mode.freq });
        const baseQ = BASE_Q_BY_TYPE[mode.type] ?? 4.0;
        return { ...mode, qValue: qA(baseQ, absQ), absQ };
      });

      const modeMetrics = computeOverlapMetrics(modes);
      const overlap     = summariseOverlap(modeMetrics);
      const swing       = computeSwing(rd, seat, sub, modes);

      // Q + absQ at three probe frequencies
      const probeQ = [30, 60, 100].map(f => {
        const absQ = estimateModeQLocal({ roomDims: rd, surfaceAbsorption: sa, f0: f });
        return { f, q: qA(BASE_Q_BY_TYPE.axial, absQ), absQ };
      });

      return { alpha, overlap, swing, probeQ };
    });

    // Monotonicity analysis
    const overlapAvgs = alphaRows.map(r => r.overlap.avg);
    const swings      = alphaRows.map(r => r.swing);

    let overlapMonoFails = 0;
    for (let i = 1; i < overlapAvgs.length; i++) {
      if (overlapAvgs[i] > overlapAvgs[i - 1] + 0.01) overlapMonoFails++;
    }
    let swingMonoFails = 0;
    for (let i = 1; i < swings.length; i++) {
      if (swings[i] > swings[i - 1] + 0.5) swingMonoFails++;
    }

    // Pearson correlation overlap ↔ swing
    const n = alphaRows.length;
    const meanO = overlapAvgs.reduce((s, v) => s + v, 0) / n;
    const meanS = swings.reduce((s, v) => s + v, 0) / n;
    let covOS = 0, sdO = 0, sdS = 0;
    for (let i = 0; i < n; i++) {
      covOS += (overlapAvgs[i] - meanO) * (swings[i] - meanS);
      sdO   += (overlapAvgs[i] - meanO) ** 2;
      sdS   += (swings[i]     - meanS) ** 2;
    }
    const correlation = (sdO > 0 && sdS > 0) ? covOS / Math.sqrt(sdO * sdS) : 0;

    // Dead zone: consecutive steps where overlap changes by < 0.02 (BW frozen)
    let deadZoneBW = 0;
    for (let i = 1; i < alphaRows.length; i++) {
      if (Math.abs(overlapAvgs[i] - overlapAvgs[i - 1]) < 0.02) deadZoneBW++;
    }

    // First departure: α at which absQ first drops below axial baseQ (ceiling becomes inactive)
    let firstDepartureAlpha = null;
    for (const row of alphaRows) {
      const probe60 = row.probeQ.find(p => p.f === 60);
      if (probe60 && probe60.absQ < BASE_Q_BY_TYPE.axial) {
        firstDepartureAlpha = row.alpha;
        break;
      }
    }

    return {
      room, rd, alphaRows,
      overlapMonoFails, swingMonoFails, correlation, deadZoneBW,
      firstDepartureAlpha, overlapAvgs, swings,
    };
  });
}

// ── Conclusions ───────────────────────────────────────────────────────────────
function buildConclusions(results) {
  const allOverlapMono    = results.every(r => r.overlapMonoFails === 0);
  const failRooms         = results.filter(r => r.swingMonoFails > 0);
  const failAlsoOverlap   = failRooms.filter(r => r.overlapMonoFails > 0);
  const avgCorr           = results.reduce((s, r) => s + r.correlation, 0) / results.length;
  const allDead           = results.every(r => r.deadZoneBW >= 3);
  const departures        = results.map(r => r.firstDepartureAlpha).filter(x => x !== null);
  const firstDep          = departures.length ? Math.min(...departures) : null;

  return {
    q1_overlap_monotonic:    allOverlapMono,
    q2_fail_rooms_count:     failRooms.length,
    q2_also_abnormal_overlap: failAlsoOverlap.length,
    q3_root_cause: allDead
      ? 'Incorrect Q (baseQ ceiling): bandwidth is frozen = f₀/baseQ for all α where absorptionQ > baseQ. Overlap ratio does not respond to absorption changes, decoupling damping from swing. Swing is driven by phase-sum geometry (listener position vs mode nulls/antinodes), not by damping changes.'
      : 'Mixed: Q ceiling active at low α (BW frozen); at high α absorptionQ drops below baseQ giving correct Q narrowing. The non-monotonic window is confined to the ceiling-active range.',
    q4_first_departure_alpha: firstDep,
    q4_stage: 'Stage 1 — estimateModeQLocal: Math.min(baseQ, absorptionQ). When absorptionQ ≥ baseQ the ceiling clamps Q = baseQ. Bandwidth = f₀/baseQ is independent of absorption. Overlap ratio = constant. This is the first and only place where physical absorption information is discarded — all downstream behaviour (phase summation, swing) inherits this decoupling.',
    avgCorrelation: avgCorr,
  };
}

// ── Styles ────────────────────────────────────────────────────────────────────
const mono = { fontFamily: 'monospace' };
const f2 = v => (Number.isFinite(v) ? v.toFixed(2) : '—');
const f1 = v => (Number.isFinite(v) ? v.toFixed(1) : '—');

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

// ── Room detail table ─────────────────────────────────────────────────────────
function OverlapTrendTable({ roomResult }) {
  const { alphaRows, room, overlapAvgs, swingMonoFails, overlapMonoFails, correlation, deadZoneBW, firstDepartureAlpha } = roomResult;

  return (
    <div style={{ overflowX: 'auto', marginBottom: 10 }}>
      <div style={{ fontSize: 8, fontWeight: 700, color: '#334155', ...mono, marginBottom: 3 }}>
        {room.label}
        {swingMonoFails > 0 && <span style={{ color: '#dc2626', marginLeft: 8 }}>⚠ {swingMonoFails} swing mono fail(s)</span>}
        {overlapMonoFails > 0 && <span style={{ color: '#f59e0b', marginLeft: 8 }}>⚠ {overlapMonoFails} overlap mono fail(s)</span>}
        <span style={{ color: '#6b7280', marginLeft: 8 }}>corr={f2(correlation)}</span>
      </div>
      <table style={{ borderCollapse: 'collapse', minWidth: 720 }}>
        <thead>
          <tr>
            <th style={{ ...thL, minWidth: 40 }}>α</th>
            <th style={th}>Q@60Hz</th>
            <th style={th}>absQ@60Hz</th>
            <th style={th}>BW@60Hz Hz</th>
            <th style={th}>Avg overlap</th>
            <th style={th}>Max overlap</th>
            <th style={th}>Overlapping</th>
            <th style={th}>Isolated</th>
            <th style={th}>Swing dB</th>
            <th style={th}>Δ overlap</th>
            <th style={th}>Δ swing</th>
          </tr>
        </thead>
        <tbody>
          {alphaRows.map((row, i) => {
            const prevOvlp = i > 0 ? overlapAvgs[i - 1] : null;
            const prevSwing = i > 0 ? alphaRows[i - 1].swing : null;
            const dO = prevOvlp  !== null ? row.overlap.avg - prevOvlp  : null;
            const dS = prevSwing !== null ? row.swing - prevSwing : null;
            const badO = dO !== null && dO > 0.01;
            const badS = dS !== null && dS > 0.5;
            const probe60 = row.probeQ.find(p => p.f === 60);
            const bw60 = probe60 ? probe60.f / Math.max(probe60.q, 1e-6) : null;
            const ceilingActive = probe60 && probe60.absQ >= BASE_Q_BY_TYPE.axial;
            const rowBg = i % 2 === 0 ? '#fff' : '#f8fafc';
            return (
              <tr key={row.alpha} style={{ background: rowBg }}>
                <td style={{ ...tdL, fontWeight: 700 }}>{row.alpha.toFixed(2)}</td>
                <td style={{ ...td, color: ceilingActive ? '#dc2626' : '#16a34a' }}>{f2(probe60?.q)}</td>
                <td style={{ ...td, color: ceilingActive ? '#9ca3af' : '#059669' }}>{f2(probe60?.absQ)}</td>
                <td style={{ ...td, color: ceilingActive ? '#dc2626' : '#374151' }}>{f1(bw60)}</td>
                <td style={{ ...td, fontWeight: 700, color: row.overlap.avg > 2 ? '#dc2626' : row.overlap.avg > 0.5 ? '#f59e0b' : '#16a34a' }}>
                  {f2(row.overlap.avg)}
                </td>
                <td style={td}>{f2(row.overlap.max)}</td>
                <td style={{ ...td, color: row.overlap.overlapping > 0 ? '#dc2626' : '#6b7280' }}>
                  {row.overlap.overlapping}
                </td>
                <td style={{ ...td, color: row.overlap.isolated > 5 ? '#2563eb' : '#6b7280' }}>
                  {row.overlap.isolated}
                </td>
                <td style={{ ...td, fontWeight: 700, color: row.swing > 40 ? '#dc2626' : '#374151' }}>
                  {f1(row.swing)}
                </td>
                <td style={{ ...td, fontWeight: 700, color: badO ? '#dc2626' : dO !== null ? '#16a34a' : '#9ca3af' }}>
                  {dO !== null ? (dO > 0 ? `+${f2(dO)}` : f2(dO)) : '—'}
                </td>
                <td style={{ ...td, fontWeight: 700, color: badS ? '#dc2626' : dS !== null ? '#16a34a' : '#9ca3af' }}>
                  {dS !== null ? (dS > 0 ? `+${f1(dS)}` : f1(dS)) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ fontSize: 7, ...mono, color: '#6b7280', marginTop: 2 }}>
        BW dead steps (Δ overlap {'<'} 0.02): {deadZoneBW} &nbsp;|&nbsp;
        Red Q@60 = ceiling active (absQ ≥ 4.0). Green = ceiling off, Q follows absorption.&nbsp;|&nbsp;
        absQ first drops below baseQ at: α = {firstDepartureAlpha ?? 'never in test range'}
      </div>
    </div>
  );
}

// ── Cross-room summary ────────────────────────────────────────────────────────
function CrossRoomSummary({ results }) {
  return (
    <div style={{ overflowX: 'auto', marginBottom: 12 }}>
      <table style={{ borderCollapse: 'collapse', minWidth: 560 }}>
        <thead>
          <tr>
            <th style={{ ...thL, minWidth: 130 }}>Room</th>
            <th style={th}>Overlap mono fails</th>
            <th style={th}>Swing mono fails</th>
            <th style={th}>BW dead steps</th>
            <th style={th}>Corr overlap↔swing</th>
            <th style={th}>α first ceiling off</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
              <td style={{ ...tdL, fontWeight: 600 }}>{r.room.label}</td>
              <td style={{ ...td, color: r.overlapMonoFails > 0 ? '#f59e0b' : '#16a34a', fontWeight: 700 }}>
                {r.overlapMonoFails}
              </td>
              <td style={{ ...td, color: r.swingMonoFails > 0 ? '#dc2626' : '#16a34a', fontWeight: 700 }}>
                {r.swingMonoFails}
              </td>
              <td style={{ ...td, color: r.deadZoneBW >= 3 ? '#dc2626' : '#374151' }}>
                {r.deadZoneBW}
              </td>
              <td style={{ ...td, fontWeight: 700, color: Math.abs(r.correlation) > 0.7 ? '#16a34a' : Math.abs(r.correlation) > 0.3 ? '#f59e0b' : '#dc2626' }}>
                {f2(r.correlation)}
              </td>
              <td style={{ ...td, color: '#6b7280' }}>
                {r.firstDepartureAlpha ?? 'never'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Diagnostic conclusions block ──────────────────────────────────────────────
function DiagnosticConclusions({ conc }) {
  return (
    <div style={{ border: '2px solid #7c3aed', borderRadius: 8, background: '#0f172a', padding: '14px 16px', ...mono, marginTop: 8 }}>
      <div style={{ fontWeight: 700, color: '#f1f5f9', fontSize: 11, marginBottom: 10, borderBottom: '1px solid #334155', paddingBottom: 4 }}>
        ▶ DIAGNOSTIC CONCLUSIONS — Modal Overlap & Bandwidth Audit
      </div>
      <div style={{ fontSize: 8, color: '#cbd5e1', lineHeight: 2.2 }}>

        <div style={{ marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid #1e293b' }}>
          <span style={{ color: '#67e8f9', fontWeight: 700 }}>Q1. Does modal overlap reduce monotonically as absorption increases?</span><br />
          <span style={{ color: conc.q1_overlap_monotonic ? '#4ade80' : '#f87171', fontWeight: 700 }}>
            {conc.q1_overlap_monotonic
              ? '✓ YES — overlap ratio is flat or reduces across all rooms as α increases.'
              : '✗ NO — overlap ratio increases at one or more α steps in one or more rooms.'}
          </span><br />
          <span style={{ color: '#94a3b8' }}>
            Average overlap–swing Pearson r across 6 rooms: {f2(conc.avgCorrelation)}.
            {Math.abs(conc.avgCorrelation) > 0.7
              ? ' High — swing and overlap track together.'
              : Math.abs(conc.avgCorrelation) > 0.3
              ? ' Moderate — partially linked.'
              : ' Low — swing is NOT driven by overlap changes. Phase geometry dominates.'}
          </span>
        </div>

        <div style={{ marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid #1e293b' }}>
          <span style={{ color: '#67e8f9', fontWeight: 700 }}>Q2. Are rooms that fail swing monotonicity also showing abnormal overlap behaviour?</span><br />
          <span style={{ color: '#e2e8f0' }}>
            {conc.q2_fail_rooms_count} room(s) fail swing monotonicity.{' '}
            {conc.q2_also_abnormal_overlap} of those also show non-monotonic overlap.
          </span><br />
          <span style={{ color: '#94a3b8' }}>
            {conc.q2_also_abnormal_overlap === conc.q2_fail_rooms_count && conc.q2_fail_rooms_count > 0
              ? 'All swing-failing rooms have abnormal overlap → overlap is implicated.'
              : conc.q2_also_abnormal_overlap === 0 && conc.q2_fail_rooms_count > 0
              ? 'Swing fails without overlap anomaly → overlap structure is NOT the cause. The swing reversal is driven by phase summation geometry, not by bandwidth changes.'
              : 'Mixed across rooms.'}
          </span>
        </div>

        <div style={{ marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid #1e293b' }}>
          <span style={{ color: '#67e8f9', fontWeight: 700 }}>Q3. Is the swing increase caused by: incorrect Q / incorrect bandwidth / incorrect overlap / phase summation?</span><br />
          <span style={{ color: '#fde68a' }}>{conc.q3_root_cause}</span>
        </div>

        <div>
          <span style={{ color: '#67e8f9', fontWeight: 700 }}>Q4. Which stage first departs from expected physical behaviour?</span><br />
          <span style={{ color: '#f87171', fontWeight: 700 }}>
            First departure at α ≈ {conc.q4_first_departure_alpha ?? 'not reached in test range'} (axial 60 Hz probe).
          </span><br />
          <span style={{ color: '#fde68a' }}>{conc.q4_stage}</span>
        </div>

      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ModalOverlapBandwidthAudit() {
  const [results,    setResults]    = useState(null);
  const [conc,       setConc]       = useState(null);
  const [running,    setRunning]    = useState(false);
  const [ran,        setRan]        = useState(false);
  const [activeRoom, setActiveRoom] = useState(0);

  const run = useCallback(() => {
    setRunning(true);
    setTimeout(() => {
      const res = runAudit();
      setResults(res);
      setConc(buildConclusions(res));
      setRan(true);
      setRunning(false);
    }, 10);
  }, []);

  const tabBtn = (label, active, onClick) => (
    <button key={label} onClick={onClick} style={{
      padding: '2px 10px', fontSize: 9, fontWeight: 700, borderRadius: 4, cursor: 'pointer', ...mono,
      border: '1px solid #7c3aed',
      background: active ? '#7c3aed' : '#fff',
      color: active ? '#fff' : '#7c3aed',
    }}>{label}</button>
  );

  return (
    <details style={{ border: '2px solid #7c3aed', borderRadius: 8, background: '#faf5ff', padding: '8px 10px', marginTop: 8 }}>
      <summary style={{ fontWeight: 700, color: '#6d28d9', fontSize: 11, cursor: 'pointer', ...mono }}>
        🔬 Modal Overlap &amp; Resonance Bandwidth Audit — 6 rooms × 7 α steps
      </summary>

      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 9, color: '#4c1d95', lineHeight: 1.7, marginBottom: 8, borderLeft: '3px solid #c4b5fd', paddingLeft: 8, ...mono }}>
          overlap ratio = bandwidth / nearest-neighbour spacing = (f₀/Q) / min(left_gap, right_gap)<br />
          Red Q@60 = ceiling active (absorptionQ ≥ baseQ=4.0) → BW frozen → overlap frozen → decoupled from α.<br />
          Current production Q = Math.min(baseQ, absorptionQ). Diagnostic only.
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          <button onClick={run} disabled={running} style={{
            height: 28, padding: '0 16px', borderRadius: 5, border: '1px solid #7c3aed',
            background: '#7c3aed', color: '#fff', fontSize: 10, fontWeight: 700,
            cursor: running ? 'not-allowed' : 'pointer', ...mono,
          }}>
            {running ? 'Running…' : ran ? 'Re-run' : 'Run Overlap & Bandwidth Audit'}
          </button>
        </div>

        {results && conc && (
          <>
            <div style={{ fontSize: 8, color: '#6b7280', ...mono, marginBottom: 4 }}>Select room:</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
              {TEST_ROOMS.map((r, i) => tabBtn(r.label, activeRoom === i, () => setActiveRoom(i)))}
            </div>

            <OverlapTrendTable roomResult={results[activeRoom]} />

            <div style={{ fontWeight: 700, fontSize: 9, color: '#1e293b', ...mono, marginBottom: 4, borderBottom: '1px solid #c4b5fd', paddingBottom: 2 }}>
              CROSS-ROOM SUMMARY
            </div>
            <CrossRoomSummary results={results} />

            <DiagnosticConclusions conc={conc} />

            <div style={{ fontSize: 7, color: '#9ca3af', marginTop: 6, ...mono }}>
              Diagnostic only. No production code changed. Current production Q only (Math.min(baseQ, absorptionQ)). Modal-only, no reflections.
            </div>
          </>
        )}
      </div>
    </details>
  );
}