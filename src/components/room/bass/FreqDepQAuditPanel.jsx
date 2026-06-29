// FreqDepQAuditPanel.jsx
// Audit comparison: Production Q vs Frequency-Dependent Cap (Variant F).
// Runs both strategies on the same room/sub/seat/frequency grid and reports
// global MAE, banded MAE, shape-only MAE, null/peak/swing metrics, and a visual verdict.

import React, { useState, useMemo } from 'react';
import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';
import { getSubwooferCurve } from '@/components/models/speakers/registry';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';

const FLAT_REW_CURVE = [
  { hz: 20, db: 94 }, { hz: 50, db: 94 }, { hz: 100, db: 94 }, { hz: 200, db: 94 },
];

const BANDS = [
  { label: '20–50 Hz',   lo: 20,  hi: 50  },
  { label: '50–85 Hz',   lo: 50,  hi: 85  },
  { label: '85–160 Hz',  lo: 85,  hi: 160 },
  { label: '160–220 Hz', lo: 160, hi: 220 },
  { label: '85–220 Hz',  lo: 85,  hi: 220 },
];

// ── REW reference estimate (hard-coded from parity sessions) ──────────────────
// Replace with rewOverlaySeries when passed as a prop.
function interpolateLinear(pts, hz) {
  if (!pts || pts.length === 0) return null;
  const s = [...pts].sort((a, b) => a.frequency - b.frequency);
  if (hz <= s[0].frequency) return s[0].spl;
  if (hz >= s[s.length - 1].frequency) return s[s.length - 1].spl;
  for (let i = 0; i < s.length - 1; i++) {
    if (hz >= s[i].frequency && hz <= s[i + 1].frequency) {
      const t = (hz - s[i].frequency) / (s[i + 1].frequency - s[i].frequency);
      return s[i].spl + t * (s[i + 1].spl - s[i].spl);
    }
  }
  return null;
}

function runVariant(roomDims, seat, sub, qStrategy, surfaceAbsorption) {
  const curve = getSubwooferCurve(sub.modelKey) || FLAT_REW_CURVE;
  const result = simulateBassResponseRewCore(
    { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM },
    { x: seat.x, y: seat.y, z: Number.isFinite(Number(seat.z)) ? Number(seat.z) : 1.2 },
    sub,
    FLAT_REW_CURVE,
    {
      enableReflections: false,
      enableModes: true,
      surfaceAbsorption,
      freqMinHz: 20,
      freqMaxHz: 220,
      smoothing: 'none',
      modalSourceReferenceMode: 'distance_normalized',
      modalGainScalar: 1.0,
      axialQ: 4.0,
      propagationPhaseScale: 0,
      pureDeterministicModalSum: true,
      disableModalPropagationPhase: true,
      disableLateField: true,
      qStrategy,
    }
  );

  const pts = result.freqsHz.map((hz, i) => ({ frequency: hz, spl: result.splDbRaw[i] }));
  return pts;
}

function computeMetrics(pts, rewPts) {
  const band = pts.filter(p => p.frequency >= 20 && p.frequency <= 120 && Number.isFinite(p.spl));
  const spls = band.map(p => p.spl);
  if (spls.length === 0) return null;

  const minSpl = Math.min(...spls);
  const maxSpl = Math.max(...spls);
  const swing = maxSpl - minSpl;
  const nullPt = band.find(p => p.spl === minSpl);
  const peakPt = band.find(p => p.spl === maxSpl);

  const localWindow = pts.filter(p =>
    nullPt && p.frequency >= nullPt.frequency / Math.pow(2, 1.5) &&
    p.frequency <= nullPt.frequency * Math.pow(2, 1.5)
  );
  const localPeak = localWindow.length > 0 ? Math.max(...localWindow.map(p => p.spl)) : maxSpl;
  const nullDepth = minSpl - localPeak;

  const deepDips = band.filter(p => {
    const window2 = pts.filter(q =>
      q.frequency >= p.frequency / Math.pow(2, 1.5) &&
      q.frequency <= p.frequency * Math.pow(2, 1.5)
    );
    const windowPeak = window2.length > 0 ? Math.max(...window2.map(q => q.spl)) : p.spl;
    return p.spl - windowPeak < -8;
  }).length;

  const highPeaks = pts.filter(p => p.frequency >= 20 && p.frequency <= 220 && p.spl > 100).length;

  // Global MAE vs REW
  let globalMAE = null;
  if (rewPts && rewPts.length > 0) {
    const errors = pts
      .filter(p => p.frequency >= 20 && p.frequency <= 220)
      .map(p => {
        const ref = interpolateLinear(rewPts, p.frequency);
        return ref !== null ? Math.abs(p.spl - ref) : null;
      })
      .filter(e => e !== null);
    globalMAE = errors.length > 0 ? errors.reduce((s, e) => s + e, 0) / errors.length : null;
  }

  // Banded MAE
  const bandedMAE = BANDS.map(({ label, lo, hi }) => {
    if (!rewPts || rewPts.length === 0) return { label, mae: null, shapeMAE: null };
    const bandPts = pts.filter(p => p.frequency >= lo && p.frequency <= hi);
    const errors = bandPts.map(p => {
      const ref = interpolateLinear(rewPts, p.frequency);
      return ref !== null ? p.spl - ref : null;
    }).filter(e => e !== null);
    if (errors.length === 0) return { label, mae: null, shapeMAE: null };
    const mae = errors.reduce((s, e) => s + Math.abs(e), 0) / errors.length;
    const meanOffset = errors.reduce((s, e) => s + e, 0) / errors.length;
    const shapeMAE = errors.reduce((s, e) => s + Math.abs(e - meanOffset), 0) / errors.length;
    return { label, mae, shapeMAE };
  });

  return { nullHz: nullPt?.frequency, nullDb: minSpl, nullDepth, peakHz: peakPt?.frequency, peakDb: maxSpl, swing, deepDips, highPeaks, globalMAE, bandedMAE };
}

function fmt1(v) { return v !== null && Number.isFinite(v) ? v.toFixed(1) : '—'; }
function fmt2(v) { return v !== null && Number.isFinite(v) ? v.toFixed(2) : '—'; }

const VARIANT_COLORS = { production: '#213428', freq_dep: '#2563eb', smooth_soft: '#059669' };

// Label map for Q strategies
const STRATEGY_LABELS = {
  production:         '✓ Production static ceiling',
  freq_dependent_cap: '⚡ Freq-Dependent Cap (Variant F)',
  smooth_soft_cap:    '🔬 Smooth Soft Cap — candidate',
};

export default function FreqDepQAuditPanel({ roomDims, seatingPositions, subsForSimulation, surfaceAbsorption, rewOverlaySeries, qStrategy }) {
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);

  const seat = useMemo(() => {
    if (!Array.isArray(seatingPositions) || seatingPositions.length === 0) return null;
    return seatingPositions.find(s => s.isPrimary) || seatingPositions[0];
  }, [seatingPositions]);

  const sub = useMemo(() => {
    if (!Array.isArray(subsForSimulation) || subsForSimulation.length === 0) return null;
    return subsForSimulation[0];
  }, [subsForSimulation]);

  const canRun = seat && sub && roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM;
  const rewPts = rewOverlaySeries?.data ?? null;

  function runAudit() {
    if (!canRun) return;
    setRunning(true);
    setTimeout(() => {
      try {
        const sa = surfaceAbsorption || { front: 0.3, back: 0.3, left: 0.3, right: 0.3, ceiling: 0.3, floor: 0.3 };
        const prodPts = runVariant(roomDims, seat, sub, 'production', sa);
        const fdPts   = runVariant(roomDims, seat, sub, 'freq_dependent_cap', sa);
        const ssPts   = runVariant(roomDims, seat, sub, 'smooth_soft_cap', sa);
        const prodMetrics = computeMetrics(prodPts, rewPts);
        const fdMetrics   = computeMetrics(fdPts,   rewPts);
        const ssMetrics   = computeMetrics(ssPts,   rewPts);

        // Build chart data — union of freq points across all three variants
        const allFreqs = [...new Set([...prodPts.map(p => p.frequency), ...fdPts.map(p => p.frequency), ...ssPts.map(p => p.frequency)])].sort((a, b) => a - b);
        const chartData = allFreqs.map(hz => {
          const prod = prodPts.find(p => Math.abs(p.frequency - hz) < 0.01);
          const fd   = fdPts.find(p => Math.abs(p.frequency - hz) < 0.01);
          const ss   = ssPts.find(p => Math.abs(p.frequency - hz) < 0.01);
          const rew  = rewPts ? { spl: interpolateLinear(rewPts, hz) } : null;
          return {
            frequency: hz,
            production: prod?.spl ?? null,
            freq_dep:   fd?.spl   ?? null,
            smooth_soft: ss?.spl  ?? null,
            rew: rew?.spl ?? null,
          };
        });

        setResults({ prodPts, fdPts, ssPts, prodMetrics, fdMetrics, ssMetrics, chartData });
      } finally {
        setRunning(false);
      }
    }, 20);
  }

  // Determine visual verdict — evaluates Smooth Soft Cap vs Production (primary candidate)
  function renderVerdict(prod, ss) {
    if (!prod || !ss) return null;
    const bandImprovements = BANDS.filter((_, i) => {
      const pm = prod.bandedMAE[i];
      const sm = ss.bandedMAE[i];
      return pm?.mae !== null && sm?.mae !== null && sm.mae < pm.mae;
    }).length;
    const globalImproved = prod.globalMAE !== null && ss.globalMAE !== null && ss.globalMAE < prod.globalMAE;
    const lf_preserved = (() => {
      const p20 = prod.bandedMAE.find(b => b.label === '20–50 Hz');
      const s20 = ss.bandedMAE.find(b => b.label === '20–50 Hz');
      if (!p20?.shapeMAE || !s20?.shapeMAE) return null;
      return s20.shapeMAE <= p20.shapeMAE * 1.1;
    })();
    const hf_improved = (() => {
      const p85 = prod.bandedMAE.find(b => b.label === '85–220 Hz');
      const s85 = ss.bandedMAE.find(b => b.label === '85–220 Hz');
      if (!p85?.mae || !s85?.mae) return null;
      return s85.mae < p85.mae;
    })();
    const lessViolent = ss.swing < prod.swing + 5 && ss.deepDips <= prod.deepDips + 30 && ss.highPeaks < 5;
    const peakSafe = Number.isFinite(ss.peakDb) && Number.isFinite(prod.peakDb) && (ss.peakDb - prod.peakDb) < 4;
    return { bandImprovements, globalImproved, lf_preserved, hf_improved, lessViolent, peakSafe };
  }

  const verdict = results ? renderVerdict(results.prodMetrics, results.ssMetrics) : null;

  return (
    <div style={{ border: '2px solid #2563eb', borderRadius: 10, background: '#eff6ff', padding: '12px 14px', marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 700, color: '#1e40af', fontSize: 13 }}>
            Freq-Dep Q Audit — Production vs Variant F vs Smooth Soft Cap
          </div>
          <div style={{ fontSize: 11, color: '#3730a3', fontFamily: 'monospace', marginTop: 2 }}>
            Active Q strategy: <strong>{STRATEGY_LABELS[qStrategy] ?? qStrategy}</strong>
          </div>
        </div>
        <button
          onClick={runAudit}
          disabled={!canRun || running}
          style={{
            height: 32, padding: '0 14px', borderRadius: 6,
            border: '1px solid #2563eb', background: running ? '#93c5fd' : '#2563eb',
            color: '#fff', fontSize: 11, fontFamily: 'monospace', cursor: canRun ? 'pointer' : 'not-allowed',
            fontWeight: 700,
          }}
        >
          {running ? 'Running…' : 'Run Audit'}
        </button>
      </div>

      {!canRun && (
        <div style={{ fontSize: 11, color: '#6b7280', fontFamily: 'monospace' }}>
          Requires at least one seat and one subwoofer.
        </div>
      )}

      {results && (
        <>
          {/* Comparison chart */}
          <div style={{ marginBottom: 12 }}>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={results.chartData} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#bfdbfe" />
                <XAxis
                  dataKey="frequency"
                  scale="log"
                  domain={[20, 220]}
                  type="number"
                  tickCount={10}
                  tickFormatter={v => `${v}`}
                  tick={{ fontSize: 9, fontFamily: 'monospace' }}
                />
                <YAxis domain={['auto', 'auto']} tick={{ fontSize: 9, fontFamily: 'monospace' }} width={36} />
                <Tooltip
                  formatter={(v, name) => [v?.toFixed(1) ?? '—', name]}
                  labelFormatter={v => `${Number(v).toFixed(1)} Hz`}
                  contentStyle={{ fontSize: 10, fontFamily: 'monospace' }}
                />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 10, fontFamily: 'monospace' }} />
                <Line type="monotone" dataKey="production"  stroke={VARIANT_COLORS.production}  dot={false} strokeWidth={1.5} name="Production Q" />
                <Line type="monotone" dataKey="freq_dep"    stroke={VARIANT_COLORS.freq_dep}    dot={false} strokeWidth={1.5} strokeDasharray="4 2" name="Variant F" />
                <Line type="monotone" dataKey="smooth_soft" stroke={VARIANT_COLORS.smooth_soft} dot={false} strokeWidth={1.5} strokeDasharray="6 2" name="Smooth Soft Cap" />
                {results.chartData.some(p => p.rew !== null) && (
                  <Line type="monotone" dataKey="rew" stroke="#f97316" dot={false} strokeWidth={1.5} strokeDasharray="2 2" name="REW overlay" />
                )}
                <ReferenceLine x={85} stroke="#9ca3af" strokeDasharray="3 3" strokeWidth={1} label={{ value: '85Hz', fontSize: 8, fill: '#9ca3af' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Metric comparison table */}
          <div style={{ overflowX: 'auto', marginBottom: 10 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11, fontFamily: 'monospace' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #bfdbfe', color: '#1e3a8a', fontSize: 10 }}>
                  <th style={{ textAlign: 'left', padding: '3px 8px' }}>Metric</th>
                  <th style={{ textAlign: 'right', padding: '3px 8px' }}>Production</th>
                  <th style={{ textAlign: 'right', padding: '3px 8px', color: '#2563eb' }}>Variant F</th>
                  <th style={{ textAlign: 'right', padding: '3px 8px', color: '#059669' }}>Smooth Soft</th>
                  <th style={{ textAlign: 'left', padding: '3px 8px' }}>Δ (SS vs Prod)</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: 'Null Hz',    p: results.prodMetrics?.nullHz,    f: results.fdMetrics?.nullHz,    s: results.ssMetrics?.nullHz,    unit: 'Hz', lowerBetter: false },
                  { label: 'Null dB',    p: results.prodMetrics?.nullDb,    f: results.fdMetrics?.nullDb,    s: results.ssMetrics?.nullDb,    unit: 'dB', lowerBetter: false },
                  { label: 'Null depth', p: results.prodMetrics?.nullDepth, f: results.fdMetrics?.nullDepth, s: results.ssMetrics?.nullDepth, unit: 'dB', lowerBetter: false },
                  { label: 'Peak Hz',    p: results.prodMetrics?.peakHz,    f: results.fdMetrics?.peakHz,    s: results.ssMetrics?.peakHz,    unit: 'Hz', lowerBetter: false },
                  { label: 'Peak dB',    p: results.prodMetrics?.peakDb,    f: results.fdMetrics?.peakDb,    s: results.ssMetrics?.peakDb,    unit: 'dB', lowerBetter: true },
                  { label: 'Swing dB',   p: results.prodMetrics?.swing,     f: results.fdMetrics?.swing,     s: results.ssMetrics?.swing,     unit: 'dB', lowerBetter: true },
                  { label: 'Deep dips',  p: results.prodMetrics?.deepDips,  f: results.fdMetrics?.deepDips,  s: results.ssMetrics?.deepDips,  unit: '',   lowerBetter: true },
                  { label: 'High peaks', p: results.prodMetrics?.highPeaks, f: results.fdMetrics?.highPeaks, s: results.ssMetrics?.highPeaks, unit: '',   lowerBetter: true },
                  { label: 'Global MAE', p: results.prodMetrics?.globalMAE, f: results.fdMetrics?.globalMAE, s: results.ssMetrics?.globalMAE, unit: 'dB', lowerBetter: true },
                ].map(({ label, p, f, s, unit, lowerBetter }) => {
                  const deltaF  = (Number.isFinite(p) && Number.isFinite(f)) ? (f - p) : null;
                  const deltaS  = (Number.isFinite(p) && Number.isFinite(s)) ? (s - p) : null;
                  const ssGood  = deltaS !== null && (lowerBetter ? deltaS < -0.2 : false);
                  const ssBad   = deltaS !== null && (lowerBetter ? deltaS > 0.2  : false);
                  const fGood   = deltaF !== null && (lowerBetter ? deltaF < -0.2 : false);
                  const fBad    = deltaF !== null && (lowerBetter ? deltaF > 0.2  : false);
                  return (
                    <tr key={label} style={{ borderBottom: '1px solid #dbeafe' }}>
                      <td style={{ padding: '2px 8px', color: '#1e3a8a', fontWeight: 600 }}>{label}</td>
                      <td style={{ padding: '2px 8px', textAlign: 'right' }}>{fmt1(p)} {unit}</td>
                      <td style={{ padding: '2px 8px', textAlign: 'right', color: fGood ? '#15803d' : fBad ? '#b91c1c' : '#2563eb', fontWeight: fGood || fBad ? 700 : undefined }}>{fmt1(f)} {unit}</td>
                      <td style={{ padding: '2px 8px', textAlign: 'right', color: ssGood ? '#15803d' : ssBad ? '#b91c1c' : '#059669', fontWeight: ssGood || ssBad ? 700 : undefined }}>{fmt1(s)} {unit}</td>
                      <td style={{ padding: '2px 8px', color: ssGood ? '#15803d' : ssBad ? '#b91c1c' : '#6b7280', fontWeight: ssGood || ssBad ? 700 : undefined }}>
                        {deltaS !== null ? (deltaS > 0 ? `+${fmt1(deltaS)}` : fmt1(deltaS)) : '—'}
                        {ssGood ? ' ✓' : ssBad ? ' ✗' : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Banded MAE */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontWeight: 700, color: '#1e40af', fontSize: 11, marginBottom: 4 }}>Banded MAE vs REW {!rewPts && <span style={{ color: '#6b7280', fontWeight: 400 }}>(no REW overlay — banded MAE unavailable)</span>}</div>
            {rewPts && (
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 10, fontFamily: 'monospace' }}>
                <thead>
                  <tr style={{ color: '#1e3a8a', fontSize: 9, borderBottom: '1px solid #bfdbfe' }}>
                    <th style={{ textAlign: 'left', padding: '2px 6px' }}>Band</th>
                    <th style={{ textAlign: 'right', padding: '2px 6px' }}>Prod MAE</th>
                    <th style={{ textAlign: 'right', padding: '2px 6px', color: '#2563eb' }}>F MAE</th>
                    <th style={{ textAlign: 'right', padding: '2px 6px', color: '#059669' }}>SS MAE</th>
                    <th style={{ textAlign: 'right', padding: '2px 6px' }}>Prod Shape</th>
                    <th style={{ textAlign: 'right', padding: '2px 6px', color: '#059669' }}>SS Shape</th>
                    <th style={{ textAlign: 'left', padding: '2px 6px' }}>SS Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {BANDS.map(({ label }, i) => {
                    const pm = results.prodMetrics?.bandedMAE[i];
                    const fm = results.fdMetrics?.bandedMAE[i];
                    const sm = results.ssMetrics?.bandedMAE[i];
                    const ssImproved    = pm?.mae !== null && sm?.mae !== null && sm.mae < pm.mae - 0.1;
                    const ssShapeImproved = pm?.shapeMAE !== null && sm?.shapeMAE !== null && sm.shapeMAE < pm.shapeMAE - 0.1;
                    return (
                      <tr key={label} style={{ borderBottom: '1px solid #dbeafe' }}>
                        <td style={{ padding: '2px 6px', fontWeight: 600, color: '#1e3a8a' }}>{label}</td>
                        <td style={{ padding: '2px 6px', textAlign: 'right' }}>{fmt2(pm?.mae)}</td>
                        <td style={{ padding: '2px 6px', textAlign: 'right', color: '#2563eb' }}>{fmt2(fm?.mae)}</td>
                        <td style={{ padding: '2px 6px', textAlign: 'right', color: ssImproved ? '#15803d' : '#059669', fontWeight: ssImproved ? 700 : undefined }}>{fmt2(sm?.mae)}</td>
                        <td style={{ padding: '2px 6px', textAlign: 'right' }}>{fmt2(pm?.shapeMAE)}</td>
                        <td style={{ padding: '2px 6px', textAlign: 'right', color: ssShapeImproved ? '#15803d' : undefined, fontWeight: ssShapeImproved ? 700 : undefined }}>{fmt2(sm?.shapeMAE)}</td>
                        <td style={{ padding: '2px 6px', color: ssImproved ? '#15803d' : '#9ca3af' }}>{ssImproved ? '✓ improved' : ssShapeImproved ? '~ shape ✓' : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Verdict panel — evaluates Smooth Soft Cap vs Production */}
          {verdict && (
            <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 6, padding: '8px 10px', fontSize: 11, fontFamily: 'monospace' }}>
              <div style={{ fontWeight: 700, color: '#166534', marginBottom: 4 }}>🔬 Smooth Soft Cap Verdict (vs Production)</div>
              <div style={{ color: verdict.peakSafe ? '#15803d' : '#b91c1c' }}>
                {verdict.peakSafe ? '✓' : '✗'} Peak increase &lt;4 dB vs production
              </div>
              <div style={{ color: verdict.lessViolent ? '#15803d' : '#b91c1c' }}>
                {verdict.lessViolent ? '✓' : '✗'} Swing / dips / peaks within safe thresholds
              </div>
              <div style={{ color: verdict.lf_preserved === true ? '#15803d' : verdict.lf_preserved === false ? '#b91c1c' : '#6b7280' }}>
                {verdict.lf_preserved === true ? '✓' : verdict.lf_preserved === false ? '✗' : '—'} 20–50 Hz story preserved
              </div>
              <div style={{ color: verdict.hf_improved === true ? '#15803d' : verdict.hf_improved === false ? '#b91c1c' : '#6b7280' }}>
                {verdict.hf_improved === true ? '✓' : verdict.hf_improved === false ? '✗' : '—'} 85–220 Hz shape improved vs production
              </div>
              <div style={{ color: verdict.globalImproved ? '#15803d' : '#b91c1c' }}>
                {verdict.globalImproved ? '✓' : '✗'} Global MAE improved vs REW
              </div>
              <div style={{ color: verdict.bandImprovements >= 3 ? '#15803d' : verdict.bandImprovements >= 1 ? '#b45309' : '#b91c1c', marginTop: 4, fontWeight: 700 }}>
                {verdict.bandImprovements}/5 bands improved — {
                  verdict.bandImprovements >= 4 && verdict.peakSafe && verdict.lessViolent
                    ? 'Smooth Soft Cap: Strong candidate ✓'
                    : verdict.bandImprovements >= 2
                      ? 'Partial improvement — tighten cap or adjust exponent'
                      : 'No improvement — raise A or lower n in power law'
                }
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}