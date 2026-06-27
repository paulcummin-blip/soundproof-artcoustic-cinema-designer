import React, { useState, useMemo } from "react";
import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine";
import { REW_ESTIMATE, fmt1, computeMAE, computeEstimateMetrics } from "./shootoutHelpers";

// --- Flat source curve ---
const FLAT_SOURCE = [{ hz: 20, db: 94 }, { hz: 50, db: 94 }, { hz: 100, db: 94 }, { hz: 200, db: 94 }];

// --- Modal Q sweep variants ---
// All run modal-only parity path (no reflections, no late field, pureDeterministicModalSum=true)
// "All Q" variants are approximated via family amplitude scales since the engine
// resolves Q internally. Axial-only variants use axialQ directly.
// Variant 6: overrideConstantAxialQ bypasses Sabine clamp for axial modes.
// Variant 7: very high axialQ cap simulates rigid-boundary (lossless) modes.
const BASE_MODAL_OPTS = {
  enableModes: true,
  enableReflections: false,
  disableLateField: true,
  smoothing: 'none',
  pureDeterministicModalSum: true,
  disableModalPropagationPhase: true,
  propagationPhaseScale: 0,
};

const Q_VARIANTS = [
  {
    id: 'baseline',
    label: '1. Baseline (axialQ=4)',
    desc: 'Current modal-only parity default',
    opts: () => ({ ...BASE_MODAL_OPTS, axialQ: 4.0 }),
  },
  {
    id: 'axial_q8',
    label: '2. Axial Q × 2 (axialQ=8)',
    desc: 'Double axial Q; tangential/oblique unchanged',
    opts: () => ({ ...BASE_MODAL_OPTS, axialQ: 8.0 }),
  },
  {
    id: 'axial_q12',
    label: '3. Axial Q × 3 (axialQ=12)',
    desc: 'Triple axial Q; tangential/oblique unchanged',
    opts: () => ({ ...BASE_MODAL_OPTS, axialQ: 12.0 }),
  },
  {
    id: 'all_q_x2',
    label: '4. All modal Q × 2 (approx. via amplitude)',
    desc: 'axialQ=8 + axial/tang/oblique family scale ×1.4 (energy-equivalent ~Q×2)',
    opts: () => ({ ...BASE_MODAL_OPTS, axialQ: 8.0, axialFamilyScale: 1.4, tangentialFamilyScale: 1.4, obliqueFamilyScale: 1.4 }),
  },
  {
    id: 'all_q_x3',
    label: '5. All modal Q × 3 (approx. via amplitude)',
    desc: 'axialQ=12 + axial/tang/oblique family scale ×1.73 (energy-equivalent ~Q×3)',
    opts: () => ({ ...BASE_MODAL_OPTS, axialQ: 12.0, axialFamilyScale: 1.73, tangentialFamilyScale: 1.73, obliqueFamilyScale: 1.73 }),
  },
  {
    id: 'no_sabine_clamp',
    label: '6. Disable Sabine absorption Q clamp (axial)',
    desc: 'overrideConstantAxialQ=true — axial modes use baseQ directly, bypassing Sabine absorptionQ',
    opts: () => ({ ...BASE_MODAL_OPTS, axialQ: 4.0, overrideConstantAxialQ: true }),
  },
  {
    id: 'rigid_high_q',
    label: '7. Rigid boundary — very high Q (axialQ=40)',
    desc: 'Simulates near-lossless room; Sabine clamp still applies to tang/oblique',
    opts: () => ({ ...BASE_MODAL_OPTS, axialQ: 40.0, overrideConstantAxialQ: true }),
  },
];

// Count major dips (local min >6 dB below surrounding trend) in 20–220 Hz
function countDips(freqsHz, splDb) {
  const pts = freqsHz.map((f, i) => ({ f, db: splDb[i] }))
    .filter(p => p.f >= 20 && p.f <= 220 && Number.isFinite(p.db));
  if (pts.length < 5) return 0;
  let dips = 0;
  for (let i = 2; i < pts.length - 2; i++) {
    const local = (pts[i-2].db + pts[i-1].db + pts[i+1].db + pts[i+2].db) / 4;
    if (local - pts[i].db > 6) dips++;
  }
  return dips;
}

function swing(freqsHz, splDb) {
  const pts = freqsHz.map((f, i) => ({ f, db: splDb[i] }))
    .filter(p => p.f >= 20 && p.f <= 220 && Number.isFinite(p.db));
  if (pts.length < 2) return null;
  return Math.max(...pts.map(p => p.db)) - Math.min(...pts.map(p => p.db));
}

function runVariant(roomDims, seatPos, subs, opts) {
  let sumRe = null, sumIm = null, freqsHz = null;
  for (const sub of subs) {
    const r = simulateBassResponseRewCore(roomDims, seatPos, sub, FLAT_SOURCE, { freqMinHz: 20, freqMaxHz: 220, ...opts });
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
  const splDb = sumRe.map((re, i) => 20 * Math.log10(Math.max(Math.sqrt(re * re + sumIm[i] * sumIm[i]), 1e-10)));
  return { freqsHz, splDb };
}

function qVerdict(row, baseline) {
  if (!row || !baseline) return '—';
  const maeDelta = (row.maeEst !== null && baseline.maeEst !== null) ? row.maeEst - baseline.maeEst : null;
  const swingDelta = (row.swing !== null && baseline.swing !== null) ? row.swing - baseline.swing : null;
  const moreREWLike = (row.dips >= baseline.dips) && (swingDelta !== null && swingDelta > 1);
  const unstable = row.dips > baseline.dips + 3;
  if (unstable) return 'more dips (unstable)';
  if (moreREWLike && maeDelta !== null && maeDelta < -1) return 'more REW-like ✓';
  if (moreREWLike) return 'more ripple (check MAE)';
  if (maeDelta !== null && maeDelta < -1) return 'MAE better';
  if (maeDelta !== null && maeDelta > 1) return 'MAE worse';
  return 'no meaningful change';
}

function VerdictBadge({ text }) {
  if (!text || text === '—') return <span style={{ color: '#9ca3af', fontSize: 10, fontFamily: 'monospace' }}>—</span>;
  const lower = text.toLowerCase();
  const good = lower.includes('rew-like') || lower.includes('mae better');
  const bad  = lower.includes('worse') || lower.includes('unstable');
  const bg    = good ? '#dcfce7' : bad ? '#fee2e2' : '#f3f4f6';
  const color = good ? '#166534' : bad ? '#991b1b' : '#374151';
  return <span style={{ display: 'inline-block', padding: '1px 7px', borderRadius: 4, background: bg, color, fontSize: 10, fontWeight: 700, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{text}</span>;
}

export default function ModalQDampingSweep({ roomDims, seatingPositions, subsForSimulation, liveProductionData }) {
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);
  const [ran, setRan] = useState(false);

  const activeSeat = useMemo(() => {
    const primary = (seatingPositions || []).find(s => s.isPrimary);
    return primary || seatingPositions?.[0] || null;
  }, [seatingPositions]);

  const seatPos = useMemo(() => {
    if (!activeSeat) return null;
    return { x: Number(activeSeat.x), y: Number(activeSeat.y), z: Number.isFinite(Number(activeSeat.z)) ? Number(activeSeat.z) : 1.2 };
  }, [activeSeat]);

  const canRun = !!(roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM && seatPos && subsForSimulation?.length > 0);

  function runSweep() {
    if (!canRun) return;
    setRunning(true);
    setTimeout(() => {
      const rdims = { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM };
      const rows = [];

      for (const v of Q_VARIANTS) {
        // Use live production data for baseline so the comparison is apples-to-apples
        if (v.id === 'baseline' && liveProductionData?.length > 1) {
          const freqsHz = liveProductionData.map(p => p.frequency);
          const splDb   = liveProductionData.map(p => p.spl);
          const maeEst  = computeMAE(freqsHz, splDb, REW_ESTIMATE);
          const swingVal = swing(freqsHz, splDb);
          const dips    = countDips(freqsHz, splDb);
          rows.push({ ...v, maeEst, swing: swingVal, dips, verdict: 'baseline', error: null });
          continue;
        }
        try {
          const res = runVariant(rdims, seatPos, subsForSimulation, v.opts());
          if (!res) { rows.push({ ...v, maeEst: null, swing: null, dips: null, verdict: '—', error: 'engine null' }); continue; }
          const maeEst  = computeMAE(res.freqsHz, res.splDb, REW_ESTIMATE);
          const swingVal = swing(res.freqsHz, res.splDb);
          const dips    = countDips(res.freqsHz, res.splDb);
          rows.push({ ...v, maeEst, swing: swingVal, dips, verdict: null, error: null });
        } catch (e) {
          rows.push({ ...v, maeEst: null, swing: null, dips: null, verdict: '—', error: e.message });
        }
      }

      // Assign verdicts vs baseline
      const baseline = rows[0];
      for (let i = 1; i < rows.length; i++) {
        if (!rows[i].error) rows[i].verdict = qVerdict(rows[i], baseline);
      }

      // Final conclusion
      const improved = rows.slice(1).filter(r => r.verdict?.includes('REW-like') || r.verdict?.includes('MAE better'));
      const unstable = rows.slice(1).filter(r => r.verdict?.includes('unstable'));
      const bestRow  = rows.slice(1).filter(r => r.maeEst !== null).sort((a, b) => a.maeEst - b.maeEst)[0];

      let conclusion;
      if (improved.length > 0 && unstable.length === 0) {
        conclusion = `A — Increasing Q improves design-story parity. Best: "${bestRow?.label}" (~MAE ${fmt1(bestRow?.maeEst)} dB vs baseline ~${fmt1(baseline?.maeEst)} dB). Swing delta: ${fmt1((bestRow?.swing ?? 0) - (baseline?.swing ?? 0))} dB, dips: ${bestRow?.dips ?? '?'} vs ${baseline?.dips ?? '?'}.`;
      } else if (improved.length > 0 && unstable.length > 0) {
        conclusion = `C — Q helps but stability limit reached. "${improved[0]?.label}" improves MAE to ~${fmt1(improved[0]?.maeEst)} dB but higher Q introduces instability (${unstable.length} variant(s) over-damped or spiking). A moderate Q increase may be the best trade-off.`;
      } else {
        conclusion = `B — Increasing Q does not improve parity. Best MAE variant: "${bestRow?.label}" (~${fmt1(bestRow?.maeEst)} dB) is not better than baseline (~${fmt1(baseline?.maeEst)} dB) by >1 dB. Q is not the primary limiter — investigate source coupling or modal source amplitude calibration.`;
      }

      setResults({ rows, conclusion });
      setRan(true);
      setRunning(false);
    }, 20);
  }

  // Styles
  const cell  = { padding: '3px 7px', textAlign: 'right', fontSize: 10, fontFamily: 'monospace', borderBottom: '1px solid #e5e7eb', verticalAlign: 'top' };
  const cellL = { ...cell, textAlign: 'left' };
  const th    = { ...cell, fontWeight: 700, color: '#4338ca', background: '#eef2ff', borderBottom: '2px solid #a5b4fc' };
  const thL   = { ...th, textAlign: 'left' };

  const REW_EST_SWING = useMemo(() => {
    const pts = REW_ESTIMATE.filter(p => Number.isFinite(p.spl));
    if (!pts.length) return null;
    return Math.max(...pts.map(p => p.spl)) - Math.min(...pts.map(p => p.spl));
  }, []);
  const REW_EST_DIPS = useMemo(() => countDips(REW_ESTIMATE.map(p => p.frequency), REW_ESTIMATE.map(p => p.spl)), []);

  return (
    <details style={{ border: '2px solid #4338ca', borderRadius: 8, background: '#f5f3ff', padding: '8px 10px', marginTop: 8 }}>
      <summary style={{ fontWeight: 700, color: '#4338ca', fontSize: 11, fontFamily: 'monospace', cursor: 'pointer' }}>
        🎚 Modal Q / Damping Decision Test — over-damped curve diagnosis
      </summary>

      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#312e81', marginBottom: 8, lineHeight: 1.6 }}>
          Tests whether increasing modal Q sharpens peaks/deepens nulls toward estimated REW character.
          All variants: modal-only, flat 94 dB, pureDeterministicModalSum, no reflections, no late field.{' '}
          <span style={{ color: '#b45309' }}>~MAE vs estimated REW is approximate (hardcoded screenshot data).</span>
          <br />
          <span style={{ color: '#6b7280' }}>Estimated REW reference: swing ~{fmt1(REW_EST_SWING)} dB · dips {REW_EST_DIPS}</span>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          <button onClick={runSweep} disabled={!canRun || running}
            style={{ height: 30, padding: '0 14px', borderRadius: 6, border: `1px solid ${canRun && !running ? '#4338ca' : '#d1d5db'}`, background: canRun && !running ? '#4338ca' : '#f3f4f6', color: canRun && !running ? '#fff' : '#9ca3af', fontSize: 11, fontFamily: 'monospace', fontWeight: 700, cursor: canRun && !running ? 'pointer' : 'not-allowed' }}>
            {running ? 'Running…' : ran ? 'Re-run' : 'Run Q Sweep'}
          </button>
          {!canRun && <span style={{ fontSize: 10, color: '#b45309', fontFamily: 'monospace' }}>Need room dims + seat + at least one sub.</span>}
        </div>

        {results && (
          <>
            <div style={{ overflowX: 'auto', marginBottom: 10 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 600 }}>
                <thead>
                  <tr>
                    <th style={{ ...thL, minWidth: 200 }}>Variant</th>
                    <th style={th} title="~MAE vs hardcoded estimated REW">~MAE est.</th>
                    <th style={th} title="Δ MAE vs baseline">ΔMAE</th>
                    <th style={th} title="Peak-to-null swing 20–220 Hz">Swing dB</th>
                    <th style={th} title="Δ swing vs baseline">ΔSwing</th>
                    <th style={th} title="Major dips >6 dB, 20–220 Hz">Dips</th>
                    <th style={{ ...thL, minWidth: 160 }}>Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {results.rows.map((row, idx) => {
                    const isBaseline = idx === 0;
                    const baseline = results.rows[0];
                    const maeDelta  = (!isBaseline && row.maeEst !== null && baseline.maeEst !== null) ? row.maeEst - baseline.maeEst : null;
                    const swingDelta = (!isBaseline && row.swing !== null && baseline.swing !== null) ? row.swing - baseline.swing : null;
                    const rowBg = isBaseline ? '#ede9fe' : idx % 2 === 0 ? '#fff' : '#f9fafb';
                    const maeBetter = maeDelta !== null && maeDelta < -1;
                    const maeWorse  = maeDelta !== null && maeDelta > 1;
                    return (
                      <tr key={row.id} style={{ background: rowBg }}>
                        <td style={{ ...cellL, minWidth: 200 }}>
                          <div style={{ fontWeight: isBaseline ? 700 : 500, fontSize: 10, color: '#1e1b4b' }}>{row.label}</div>
                          <div style={{ color: '#6b7280', fontSize: 9, marginTop: 1, lineHeight: 1.4 }}>{row.desc}</div>
                          {row.error && <div style={{ color: '#dc2626', fontSize: 9 }}>⚠ {row.error}</div>}
                        </td>
                        <td style={{ ...cell, color: '#b91c1c' }}>
                          {row.maeEst !== null ? `~${fmt1(row.maeEst)}` : '—'}
                        </td>
                        <td style={{ ...cell, color: maeBetter ? '#166534' : maeWorse ? '#991b1b' : '#374151', fontWeight: (maeBetter || maeWorse) ? 700 : 400 }}>
                          {maeDelta !== null ? (maeDelta > 0 ? `+${fmt1(maeDelta)}` : fmt1(maeDelta)) : '—'}
                        </td>
                        <td style={cell}>{row.swing !== null ? fmt1(row.swing) : '—'}</td>
                        <td style={{ ...cell, color: swingDelta !== null && swingDelta > 1 ? '#166534' : '#374151', fontWeight: swingDelta !== null && swingDelta > 1 ? 700 : 400 }}>
                          {swingDelta !== null ? (swingDelta > 0 ? `+${fmt1(swingDelta)}` : fmt1(swingDelta)) : '—'}
                        </td>
                        <td style={cell}>{row.dips ?? '—'}</td>
                        <td style={cellL}><VerdictBadge text={row.verdict} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Reference row */}
            <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#4338ca', marginBottom: 6, lineHeight: 1.5 }}>
              Estimated REW target: swing ~{fmt1(REW_EST_SWING)} dB · dips {REW_EST_DIPS} · (hardcoded approximation only)
            </div>

            {/* Final conclusion box */}
            <div style={{ border: '2px solid #4338ca', borderRadius: 6, background: '#e0e7ff', padding: '8px 12px', fontSize: 11, fontFamily: 'monospace', lineHeight: 1.7 }}>
              <div style={{ fontWeight: 700, color: '#312e81', marginBottom: 3 }}>▶ Modal Q Damping Decision</div>
              <div style={{ color: '#6b7280', fontSize: 9, marginBottom: 4 }}>
                A = Q improves parity · B = Q does not improve parity · C = Q helps but another limiter remains
              </div>
              <div>{results.conclusion}</div>
            </div>

            <div style={{ marginTop: 6, fontSize: 9, fontFamily: 'monospace', color: '#6b7280' }}>
              Diagnostic only. No production defaults changed. "All Q" variants approximate via family amplitude scale (not true Q rescaling).
            </div>
          </>
        )}
      </div>
    </details>
  );
}