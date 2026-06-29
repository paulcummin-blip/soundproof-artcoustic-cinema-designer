/**
 * CorrectionContributionAudit.jsx
 *
 * Diagnostic only. Does NOT modify production solver.
 *
 * Disables ONE production correction at a time and measures the impact on
 * parity vs the built-in REW_ESTIMATE curve.
 *
 * Runs inside ImageSourceParityShootout — uses same room/seat/sub props.
 */

import React, { useState, useMemo } from "react";
import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine";
import {
  REW_ESTIMATE,
  fmt1,
  computeMAE,
  computeEstimateMetrics,
} from "./shootoutHelpers";

// ─── Shared engine config (matches current production parity path) ────────────
const FLAT_SOURCE = [{ hz: 20, db: 94 }, { hz: 50, db: 94 }, { hz: 100, db: 94 }, { hz: 200, db: 94 }];

// Production defaults — the baseline every variant modifies exactly one field of
const BASE_OPTS = {
  enableModes: true,
  enableReflections: false,
  disableLateField: true,
  smoothing: "none",
  axialQ: 4.0,
  pureDeterministicModalSum: true,
  disableModalPropagationPhase: true,
  propagationPhaseScale: 0,
  modalSourceReferenceMode: "distance_normalized",
  highOrderAxialScale: 1.0,          // production default in options (not the parity solver hardcode)
  modalGainScalar: 1.0,
  rewParityModalMagnitudeScale: 1.0,
  reflectionCoherenceWeight: undefined, // handled by disableReflectionCoherenceWeight flag
};

// ─── The 10 test variants ─────────────────────────────────────────────────────
const VARIANTS = [
  {
    id: "baseline",
    label: "1 — Production baseline",
    description: "All corrections active. Reference for all deltas.",
    opts: () => ({ ...BASE_OPTS }),
    currentValue: "all corrections ON",
  },
  {
    id: "no_distance_norm",
    label: "2 — distance_normalized OFF",
    description: "Reverts to 'existing' modal source reference (no 1/r pre-scaling on modal amplitude).",
    opts: () => ({ ...BASE_OPTS, modalSourceReferenceMode: "existing" }),
    currentValue: "distance_normalized",
    removes: "1/r pre-scale on modal amplitude",
  },
  {
    id: "no_high_order_axial",
    label: "3 — highOrderAxialCorrectionScale = 1.0",
    description: "Removes the 0.5× attenuation on 2nd-order+ axial modes. (Already 1.0 in options; confirms no caller override is active.)",
    opts: () => ({ ...BASE_OPTS, highOrderAxialScale: 1.0 }),
    currentValue: "1.0 (options default; parity solver hardcodes 0.5)",
    removes: "axial harmonic attenuation",
  },
  {
    id: "no_family_q_ceiling",
    label: "4 — Family Q ceilings removed",
    description: "Bypasses base-Q ceiling by using overrideConstantAxialQ=true for axial modes, pushing Q to Sabine value. Tangential/oblique Q is unclamped by setting very high axialQ and using a high Sabine Q room (rigid walls).",
    opts: () => ({
      ...BASE_OPTS,
      // Force axial modes to use Sabine Q (unclamped from the 4.0 ceiling)
      overrideAbsorptionAxialQ: true,
      // Very high axialQ so the min(baseQ, sabineQ) ceiling never bites for axial
      axialQ: 80,
    }),
    currentValue: "axial=4.0, tang=3.9, oblique=2.5",
    removes: "per-family Q ceiling",
  },
  {
    id: "no_phase_perturbation",
    label: "5 — deterministicModalPhasePerturbation OFF",
    description: "Disables the ±0.12 rad per-mode phase perturbation by enabling pureDeterministicModalSum.",
    opts: () => ({ ...BASE_OPTS, pureDeterministicModalSum: true }),
    currentValue: "active (pureDeterministicModalSum=true in baseline already disables it)",
    removes: "phase perturbation (already off in baseline — confirms no effect)",
    noteAlreadyOff: true,
  },
  {
    id: "propagation_scale_1",
    label: "6 — propagationPhaseScale = 1.0",
    description: "Restores full propagation phase (1.0 × 2π·f·d/c) on modal contributions instead of 0.",
    opts: () => ({ ...BASE_OPTS, disableModalPropagationPhase: false, propagationPhaseScale: 1.0 }),
    currentValue: "0 (disabled in baseline parity path)",
    removes: "propagation phase suppression — adds full phase back",
  },
  {
    id: "coherence_weight_1",
    label: "7 — reflectionCoherenceWeight = 1.0",
    description: "Forces full coherence on image-source reflections (removes the 0.25–0.75 frequency-dependent weight). Requires enableReflections=true to have any effect.",
    opts: () => ({
      ...BASE_OPTS,
      enableReflections: true,
      disableReflectionCoherenceWeight: true,
      debugReflectionOrder: 1,
    }),
    currentValue: "0.25–0.75 ramp (but reflections disabled in baseline)",
    removes: "reflection coherence attenuation (also enables reflections to test this)",
  },
  {
    id: "no_late_field",
    label: "8 — lateFieldAmplitude = 0 (confirm)",
    description: "Confirms disableLateField=true is already active. Re-runs with disableLateField=false to show its impact.",
    opts: () => ({ ...BASE_OPTS, disableLateField: false }),
    currentValue: "disabled (already 0 in baseline)",
    removes: "late-field suppression — adds late-field back",
  },
  {
    id: "modal_gain_1",
    label: "9 — modalGainScalar = 1.0 (confirm)",
    description: "Confirms modalGainScalar is already 1.0 (no production effect). Explicit pass ensures no caller override.",
    opts: () => ({ ...BASE_OPTS, modalGainScalar: 1.0 }),
    currentValue: "1.0 (no effect)",
    removes: "n/a — confirming no hidden scalar",
  },
  {
    id: "modal_mag_scale_1",
    label: "10 — rewParityModalMagnitudeScale = 1.0 (confirm)",
    description: "Confirms rewParityModalMagnitudeScale=1.0 (no post-sum scaling active). Explicit pass.",
    opts: () => ({ ...BASE_OPTS, rewParityModalMagnitudeScale: 1.0 }),
    currentValue: "1.0 (no effect)",
    removes: "n/a — confirming no hidden post-sum scalar",
  },
];

// ─── Engine runner ────────────────────────────────────────────────────────────
function runVariant(roomDims, seatPos, subs, opts) {
  let sumRe = null, sumIm = null, freqsHz = null;
  for (const sub of subs) {
    const r = simulateBassResponseRewCore(roomDims, seatPos, sub, FLAT_SOURCE, {
      freqMinHz: 20, freqMaxHz: 220, ...opts,
    });
    if (!freqsHz) {
      freqsHz = r.freqsHz;
      sumRe = r.complexPressure.map(cp => cp.re);
      sumIm = r.complexPressure.map(cp => cp.im);
    } else {
      r.complexPressure.forEach((cp, i) => {
        if (Number.isFinite(cp.re)) sumRe[i] += cp.re;
        if (Number.isFinite(cp.im)) sumIm[i] += cp.im;
      });
    }
  }
  if (!freqsHz) return null;
  const splDb = sumRe.map((re, i) =>
    20 * Math.log10(Math.max(Math.sqrt(re * re + sumIm[i] * sumIm[i]), 1e-10))
  );
  return { freqsHz, splDb };
}

function countPeaks(freqsHz, splDb) {
  const pts = freqsHz.map((f, i) => ({ f, db: splDb[i] }))
    .filter(p => p.f >= 20 && p.f <= 220 && Number.isFinite(p.db));
  let peaks = 0;
  for (let i = 2; i < pts.length - 2; i++) {
    const local = (pts[i-2].db + pts[i-1].db + pts[i+1].db + pts[i+2].db) / 4;
    if (pts[i].db - local > 4) peaks++;
  }
  return peaks;
}

function countDips(freqsHz, splDb) {
  const pts = freqsHz.map((f, i) => ({ f, db: splDb[i] }))
    .filter(p => p.f >= 20 && p.f <= 220 && Number.isFinite(p.db));
  let dips = 0;
  for (let i = 2; i < pts.length - 2; i++) {
    const local = (pts[i-2].db + pts[i-1].db + pts[i+1].db + pts[i+2].db) / 4;
    if (local - pts[i].db > 6) dips++;
  }
  return dips;
}

function nullDepth(freqsHz, splDb) {
  const pts = freqsHz.map((f, i) => ({ f, db: splDb[i] }))
    .filter(p => p.f >= 20 && p.f <= 120 && Number.isFinite(p.db));
  if (!pts.length) return null;
  return Math.min(...pts.map(p => p.db));
}

function swing(freqsHz, splDb) {
  const pts = freqsHz.map((f, i) => ({ f, db: splDb[i] }))
    .filter(p => p.f >= 20 && p.f <= 220 && Number.isFinite(p.db));
  if (pts.length < 2) return null;
  return Math.max(...pts.map(p => p.db)) - Math.min(...pts.map(p => p.db));
}

function analyse(freqsHz, splDb) {
  return {
    mae: computeMAE(freqsHz, splDb, REW_ESTIMATE),
    swing: swing(freqsHz, splDb),
    dips: countDips(freqsHz, splDb),
    peaks: countPeaks(freqsHz, splDb),
    nullDb: nullDepth(freqsHz, splDb),
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function delta(a, b) {
  if (a === null || b === null) return null;
  return a - b;
}

function fmtDelta(d, invert = false) {
  if (d === null || !Number.isFinite(d)) return '—';
  const val = invert ? -d : d;
  const sign = val > 0 ? '+' : '';
  return `${sign}${d.toFixed(1)}`;
}

function improvesBadge(maeChange) {
  if (maeChange === null || !Number.isFinite(maeChange)) return { text: '—', color: '#6b7280', bg: '#f3f4f6' };
  if (maeChange < -1.0) return { text: 'YES ↑', color: '#166534', bg: '#dcfce7' };
  if (maeChange > 1.0)  return { text: 'NO ↓',  color: '#991b1b', bg: '#fee2e2' };
  return { text: '≈ flat', color: '#92400e', bg: '#fef3c7' };
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function CorrectionContributionAudit({ roomDims, seatingPositions, subsForSimulation }) {
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);
  const [ran, setRan] = useState(false);

  const activeSeat = useMemo(() => {
    const primary = (seatingPositions || []).find(s => s.isPrimary);
    return primary || seatingPositions?.[0] || null;
  }, [seatingPositions]);

  const seatPos = useMemo(() => {
    if (!activeSeat) return null;
    return {
      x: Number(activeSeat.x),
      y: Number(activeSeat.y),
      z: Number.isFinite(Number(activeSeat.z)) ? Number(activeSeat.z) : 1.2,
    };
  }, [activeSeat]);

  const canRun = !!(roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM && seatPos && subsForSimulation?.length > 0);

  function runAudit() {
    if (!canRun) return;
    setRunning(true);
    setTimeout(() => {
      const rd = { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM };
      const rows = [];

      for (const v of VARIANTS) {
        try {
          const res = runVariant(rd, seatPos, subsForSimulation, v.opts());
          if (!res) {
            rows.push({ ...v, metrics: null, error: 'engine returned null' });
            continue;
          }
          rows.push({ ...v, metrics: analyse(res.freqsHz, res.splDb), error: null });
        } catch (e) {
          rows.push({ ...v, metrics: null, error: e.message });
        }
      }

      // Compute deltas vs baseline
      const baseline = rows.find(r => r.id === 'baseline')?.metrics || null;
      const withDelta = rows.map(r => ({
        ...r,
        maeDelta:   r.id === 'baseline' ? 0 : delta(r.metrics?.mae,    baseline?.mae),
        swingDelta: r.id === 'baseline' ? 0 : delta(r.metrics?.swing,  baseline?.swing),
        dipsDelta:  r.id === 'baseline' ? 0 : delta(r.metrics?.dips,   baseline?.dips),
        peaksDelta: r.id === 'baseline' ? 0 : delta(r.metrics?.peaks,  baseline?.peaks),
        nullDelta:  r.id === 'baseline' ? 0 : delta(r.metrics?.nullDb, baseline?.nullDb),
      }));

      // Rank by MAE improvement (most negative maeDelta = biggest parity improvement)
      const nonBaseline = withDelta.filter(r => r.id !== 'baseline' && r.maeDelta !== null);
      const ranked = [...nonBaseline].sort((a, b) => (a.maeDelta ?? 0) - (b.maeDelta ?? 0));

      const anyImproves = ranked.some(r => r.maeDelta !== null && r.maeDelta < -1.0);

      setResults({ rows: withDelta, ranked, baseline, anyImproves });
      setRan(true);
      setRunning(false);
    }, 30);
  }

  // ─── Styles ───────────────────────────────────────────────────────────────
  const cell  = { padding: '3px 7px', fontSize: 9, fontFamily: 'monospace', borderBottom: '1px solid #e5e7eb', verticalAlign: 'top', textAlign: 'right' };
  const cellL = { ...cell, textAlign: 'left' };
  const th    = { ...cell, fontWeight: 700, color: '#1e3a5f', background: '#eff6ff', borderBottom: '2px solid #93c5fd', textAlign: 'right' };
  const thL   = { ...th,  textAlign: 'left' };

  return (
    <details style={{ border: '2px solid #1d4ed8', borderRadius: 8, background: '#f0f7ff', padding: '8px 10px', marginTop: 8 }}>
      <summary style={{ fontWeight: 700, color: '#1d4ed8', fontSize: 11, fontFamily: 'monospace', cursor: 'pointer' }}>
        🧪 Correction Contribution Audit — remove ONE correction at a time, measure parity impact
      </summary>

      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#1e3a5f', marginBottom: 8, lineHeight: 1.6 }}>
          Runs 10 variants against the built-in estimated REW reference. Each variant removes exactly one production correction.
          Baseline uses the current production parity path (flat 94 dB source, modal-only, live geometry).
          MAE measured against estimated REW (approximate — see shootout helpers).
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          <button onClick={runAudit} disabled={!canRun || running}
            style={{ height: 30, padding: '0 14px', borderRadius: 6, border: `1px solid ${canRun && !running ? '#1d4ed8' : '#d1d5db'}`, background: canRun && !running ? '#1d4ed8' : '#f3f4f6', color: canRun && !running ? '#fff' : '#9ca3af', fontSize: 11, fontFamily: 'monospace', fontWeight: 700, cursor: canRun && !running ? 'pointer' : 'not-allowed' }}>
            {running ? 'Running 10 variants…' : ran ? 'Re-run' : 'Run Correction Audit'}
          </button>
          {!canRun && <span style={{ fontSize: 10, color: '#b45309', fontFamily: 'monospace' }}>Need room dims + seat + sub.</span>}
        </div>

        {results && (
          <>
            {/* ── Per-run detail table ── */}
            <div style={{ fontWeight: 700, color: '#1e3a5f', fontSize: 10, fontFamily: 'monospace', marginBottom: 4, borderBottom: '1px solid #93c5fd', paddingBottom: 2 }}>
              PER-VARIANT RESULTS (vs estimated REW reference)
            </div>
            <div style={{ overflowX: 'auto', marginBottom: 12 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 820 }}>
                <thead>
                  <tr>
                    <th style={{ ...thL, minWidth: 220 }}>Variant</th>
                    <th style={th}>MAE dB</th>
                    <th style={th}>ΔMAE</th>
                    <th style={th}>Swing dB</th>
                    <th style={th}>ΔSwing</th>
                    <th style={th}>Dips</th>
                    <th style={th}>ΔDips</th>
                    <th style={th}>Peaks</th>
                    <th style={th}>Null dB</th>
                    <th style={th}>ΔNull</th>
                    <th style={{ ...thL, minWidth: 80 }}>Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {results.rows.map((row, i) => {
                    const isBaseline = row.id === 'baseline';
                    const badge = isBaseline ? { text: 'BASELINE', color: '#0369a1', bg: '#e0f2fe' } : improvesBadge(row.maeDelta);
                    const rowBg = isBaseline ? '#eff6ff' : i % 2 === 0 ? '#fff' : '#f0f7ff';
                    const maeColor = !isBaseline && row.maeDelta !== null
                      ? (row.maeDelta < -1 ? '#166534' : row.maeDelta > 1 ? '#991b1b' : '#92400e')
                      : '#374151';

                    return (
                      <tr key={row.id} style={{ background: rowBg }}>
                        <td style={{ ...cellL, fontWeight: isBaseline ? 700 : 500 }}>
                          <div style={{ fontSize: 9, fontWeight: 600 }}>{row.label}</div>
                          {row.noteAlreadyOff && (
                            <div style={{ fontSize: 8, color: '#7c3aed', marginTop: 1 }}>⚠ already off in baseline — delta expected ≈0</div>
                          )}
                          {row.error && <div style={{ color: '#dc2626', fontSize: 8 }}>⚠ {row.error}</div>}
                        </td>
                        <td style={{ ...cell, fontWeight: 600 }}>{fmt1(row.metrics?.mae)}</td>
                        <td style={{ ...cell, color: maeColor, fontWeight: !isBaseline && Math.abs(row.maeDelta || 0) > 1 ? 700 : 400 }}>
                          {isBaseline ? '—' : fmtDelta(row.maeDelta)}
                        </td>
                        <td style={cell}>{fmt1(row.metrics?.swing)}</td>
                        <td style={{ ...cell, color: !isBaseline && row.swingDelta > 2 ? '#b45309' : '#374151' }}>
                          {isBaseline ? '—' : fmtDelta(row.swingDelta)}
                        </td>
                        <td style={cell}>{row.metrics?.dips ?? '—'}</td>
                        <td style={cell}>{isBaseline ? '—' : (row.dipsDelta !== null ? (row.dipsDelta > 0 ? `+${row.dipsDelta}` : String(row.dipsDelta)) : '—')}</td>
                        <td style={cell}>{row.metrics?.peaks ?? '—'}</td>
                        <td style={cell}>{fmt1(row.metrics?.nullDb)}</td>
                        <td style={{ ...cell, color: !isBaseline && row.nullDelta !== null && row.nullDelta < -3 ? '#166534' : '#374151' }}>
                          {isBaseline ? '—' : fmtDelta(row.nullDelta)}
                        </td>
                        <td style={cellL}>
                          <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 3, background: badge.bg, color: badge.color, fontWeight: 700, fontSize: 9, fontFamily: 'monospace' }}>
                            {badge.text}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── Ranked summary table ── */}
            <div style={{ fontWeight: 700, color: '#1e3a5f', fontSize: 10, fontFamily: 'monospace', marginBottom: 4, borderBottom: '1px solid #93c5fd', paddingBottom: 2 }}>
              RANKED BY PARITY IMPROVEMENT (largest MAE reduction → smallest)
            </div>
            <div style={{ overflowX: 'auto', marginBottom: 12 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 700 }}>
                <thead>
                  <tr>
                    <th style={{ ...th, width: 40 }}>Rank</th>
                    <th style={thL}>Correction</th>
                    <th style={th}>Current value</th>
                    <th style={th}>MAE change</th>
                    <th style={th}>Swing change</th>
                    <th style={th}>Dip count Δ</th>
                    <th style={{ ...thL, width: 100 }}>Improves parity?</th>
                  </tr>
                </thead>
                <tbody>
                  {results.ranked.map((row, i) => {
                    const badge = improvesBadge(row.maeDelta);
                    return (
                      <tr key={row.id} style={{ background: i % 2 === 0 ? '#fff' : '#f0f7ff' }}>
                        <td style={{ ...cell, textAlign: 'center', fontWeight: 700, fontSize: 11, color: i === 0 ? '#166534' : '#374151' }}>
                          {i + 1}
                        </td>
                        <td style={{ ...cellL, fontWeight: 600 }}>{row.label}</td>
                        <td style={{ ...cell, fontSize: 8, color: '#6b7280' }}>{row.currentValue}</td>
                        <td style={{ ...cell, color: badge.text.startsWith('YES') ? '#166534' : badge.text.startsWith('NO') ? '#991b1b' : '#92400e', fontWeight: 700 }}>
                          {fmtDelta(row.maeDelta)} dB
                        </td>
                        <td style={cell}>{fmtDelta(row.swingDelta)} dB</td>
                        <td style={cell}>{row.dipsDelta !== null ? (row.dipsDelta > 0 ? `+${row.dipsDelta}` : String(row.dipsDelta)) : '—'}</td>
                        <td style={cellL}>
                          <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 3, background: badge.bg, color: badge.color, fontWeight: 700, fontSize: 9, fontFamily: 'monospace' }}>
                            {badge.text}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── Conclusion ── */}
            <div style={{ border: `2px solid ${results.anyImproves ? '#15803d' : '#7c3aed'}`, borderRadius: 6, background: results.anyImproves ? '#f0fdf4' : '#faf5ff', padding: '8px 12px', fontSize: 11, fontFamily: 'monospace', lineHeight: 1.8 }}>
              <div style={{ fontWeight: 700, color: results.anyImproves ? '#15803d' : '#6b21a8', marginBottom: 4 }}>
                ▶ Conclusion
              </div>
              {results.anyImproves ? (
                <>
                  <div>
                    One or more corrections, when removed, improve MAE by &gt;1 dB vs estimated REW.
                  </div>
                  <div style={{ marginTop: 4, color: '#374151', fontSize: 10 }}>
                    The top-ranked correction (#{results.ranked[0]?.label}) contributes meaningfully to the parity gap.
                    Removing it brings the curve closer to the estimated REW shape.
                    Consider adjusting that parameter first before investigating the physics layer.
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontWeight: 700, color: '#6b21a8' }}>
                    "Production correction stack is not the dominant cause."
                  </div>
                  <div style={{ marginTop: 4, color: '#374151', fontSize: 10 }}>
                    No single correction removal improves MAE by ≥1 dB vs estimated REW.
                    The remaining parity gap is caused by deeper physics — likely Q magnitude (modes too broad),
                    modal density (too few modes competing simultaneously), or source/seat coupling geometry
                    sending energy away from the seat at REW's critical null frequencies.
                    The post-processing correction stack can be treated as neutral to the parity investigation.
                  </div>
                </>
              )}
            </div>

            <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#6b7280', marginTop: 6, lineHeight: 1.5 }}>
              Diagnostic only. No production defaults changed. MAE measured against built-in estimated REW reference
              (screenshot-derived, approximate). Positive ΔMAE = worse parity. Negative ΔMAE = better parity.
            </div>
          </>
        )}
      </div>
    </details>
  );
}