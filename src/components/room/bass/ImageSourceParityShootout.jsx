import React, { useState, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine";
import {
  REW_ESTIMATE, TRACE_CONFIG,
  fmt1, computeMAE, analyseResponse, computeEstimateMetrics, estimateMatchVerdict,
} from "./shootoutHelpers";
import ModalQDampingSweep from "./ModalQDampingSweep";
import ModalFamilyExcitationAudit from "./ModalFamilyExcitationAudit";
import CanonicalModalDeviationAudit from "./CanonicalModalDeviationAudit";
import CorrectionContributionAudit from "./CorrectionContributionAudit";
import CanonicalGreensFunctionAudit from "./CanonicalGreensFunctionAudit";
import ModalExcitationChainAudit from "./ModalExcitationChainAudit";
import ModalParticipationAudit from "./ModalParticipationAudit";
import RewPipelineDivergenceAudit from "./RewPipelineDivergenceAudit";
import BehaviouralStoryTest from "./BehaviouralStoryTest";
import AbsorptionSensitivityAudit from "./AbsorptionSensitivityAudit";
import ZeroAbsorptionQTest from "./ZeroAbsorptionQTest";
import ContinuousQReplacementAudit from "./ContinuousQReplacementAudit";
import MultiRoomQRegressionTest from "./MultiRoomQRegressionTest";
import AbsorptionTrendTest from "./AbsorptionTrendTest";
import ModalOverlapBandwidthAudit from "./ModalOverlapBandwidthAudit";
import ModalFrequencyOrderingAudit from "./ModalFrequencyOrderingAudit";
import ModalGenerationPipelineAudit from "./ModalGenerationPipelineAudit";
import DegenerateModeGroupingAudit from "./DegenerateModeGroupingAudit";

// --- Engine constants ---
const FLAT_SOURCE_CURVE = [{ hz: 20, db: 94 }, { hz: 50, db: 94 }, { hz: 100, db: 94 }, { hz: 200, db: 94 }];
const RIGID = { front: 0.0, back: 0.0, left: 0.0, right: 0.0, ceiling: 0.0, floor: 0.0 };

const VARIANTS = [
  {
    id: 'modal_only',
    label: 'Current parity — modal-only',
    description: 'enableModes: true · enableReflections: false · disableLateField: true',
    buildOpts: () => ({ enableModes: true, enableReflections: false, disableLateField: true, smoothing: 'none', axialQ: 4.0, pureDeterministicModalSum: true, disableModalPropagationPhase: true, propagationPhaseScale: 0 }),
  },
  {
    id: 'image_only_rigid',
    label: 'Rigid image-source only (order 4)',
    description: 'enableModes: false · enableReflections: true · order 4 · absorption = 0',
    buildOpts: () => ({ enableModes: false, enableReflections: true, disableLateField: true, debugReflectionOrder: 4, surfaceAbsorption: RIGID, smoothing: 'none', axialQ: 4.0 }),
  },
  {
    id: 'hybrid_rigid',
    label: 'Rigid hybrid — modal + image-source (order 4)',
    description: 'enableModes: true · enableReflections: true · order 4 · absorption = 0',
    buildOpts: () => ({ enableModes: true, enableReflections: true, disableLateField: true, debugReflectionOrder: 4, surfaceAbsorption: RIGID, smoothing: 'none', axialQ: 4.0, pureDeterministicModalSum: true, disableModalPropagationPhase: true, propagationPhaseScale: 0 }),
  },
];

// --- Engine runner ---
function runVariant(roomDims, seatPos, subs, opts) {
  let sumRe = null, sumIm = null, freqsHz = null;
  for (const sub of subs) {
    const r = simulateBassResponseRewCore(roomDims, seatPos, sub, FLAT_SOURCE_CURVE, { freqMinHz: 20, freqMaxHz: 200, ...opts });
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

// --- VerdictBadge ---
function VerdictBadge({ text }) {
  if (!text) return <span style={{ color: '#6b7280', fontSize: 10, fontFamily: 'monospace' }}>—</span>;
  const lower = text.toLowerCase();
  const isBaseline = lower.includes('baseline');
  const isCloser   = lower.includes('closer') || lower.includes('match');
  const isWorse    = lower.includes('worse') || lower.includes('poor');
  const bg    = isBaseline ? '#e0f2fe' : isCloser ? '#dcfce7' : isWorse ? '#fee2e2' : '#f3f4f6';
  const color = isBaseline ? '#0369a1' : isCloser ? '#166534' : isWorse ? '#991b1b' : '#374151';
  return (
    <span style={{ display: 'inline-block', padding: '1px 7px', borderRadius: 4, background: bg, color, fontSize: 10, fontWeight: 700, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
      {text}
    </span>
  );
}

// --- ShootoutChart ---
function ShootoutChart({ rows, rewOverlaySeries, visibleTraces }) {
  const chartData = useMemo(() => {
    const freqSet = new Set();
    rows.forEach(r => { if (r._freqsHz) r._freqsHz.forEach(f => freqSet.add(Math.round(f * 100) / 100)); });
    if (rewOverlaySeries?.data) rewOverlaySeries.data.forEach(p => freqSet.add(Math.round(p.frequency * 100) / 100));
    REW_ESTIMATE.forEach(p => freqSet.add(p.frequency));
    const sorted = Array.from(freqSet).sort((a, b) => a - b).filter(f => f >= 20 && f <= 220);

    const interp = (freqsHz, splDb, targetF) => {
      if (!freqsHz || !splDb) return null;
      let best = null, bestDist = Infinity;
      for (let i = 0; i < freqsHz.length; i++) { const d = Math.abs(freqsHz[i] - targetF); if (d < bestDist) { bestDist = d; best = i; } }
      if (best === null || bestDist > 1.5) return null;
      return Number.isFinite(splDb[best]) ? splDb[best] : null;
    };

    const interpRew = (data, targetF) => {
      if (!data || data.length < 2) return null;
      const s = [...data].sort((a, b) => a.frequency - b.frequency);
      for (let j = 0; j < s.length - 1; j++) {
        if (targetF >= s[j].frequency && targetF <= s[j + 1].frequency) {
          const t = (targetF - s[j].frequency) / (s[j + 1].frequency - s[j].frequency);
          const v = s[j].spl + t * (s[j + 1].spl - s[j].spl);
          return Number.isFinite(v) ? v : null;
        }
      }
      return null;
    };

    const rowById = {};
    rows.forEach(r => { rowById[r.id] = r; });

    return sorted.map(f => {
      const point = { frequency: f };
      TRACE_CONFIG.forEach(tc => {
        if (tc.id === 'rew')          point['spl_rew']          = interpRew(rewOverlaySeries?.data, f);
        else if (tc.id === 'rew_estimate') point['spl_rew_estimate'] = interpRew(REW_ESTIMATE, f);
        else { const row = rowById[tc.id]; point[`spl_${tc.id}`] = row ? interp(row._freqsHz, row._splDb, f) : null; }
      });
      return point;
    });
  }, [rows, rewOverlaySeries]);

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: 'white', border: '1px solid #DCDBD6', borderRadius: 6, padding: '6px 10px', fontSize: 10, fontFamily: 'monospace' }}>
        <div style={{ fontWeight: 700, marginBottom: 3 }}>{Number.isFinite(Number(label)) ? `${Number(label).toFixed(1)} Hz` : label}</div>
        {payload.map(p => (
          <div key={p.dataKey} style={{ color: p.stroke }}>
            {TRACE_CONFIG.find(t => `spl_${t.id}` === p.dataKey)?.label ?? p.dataKey}: {Number.isFinite(p.value) ? `${p.value.toFixed(1)} dB` : '—'}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div style={{ width: '100%', height: 380 }}>
      <ResponsiveContainer>
        <LineChart data={chartData} margin={{ top: 20, right: 60, left: 20, bottom: 30 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#DCDBD6" />
          <XAxis dataKey="frequency" type="number" scale="log" domain={[20, 220]}
            ticks={[20, 30, 40, 50, 60, 70, 80, 100, 120, 150, 200, 220]}
            tickFormatter={v => Number.isFinite(v) ? String(Math.round(v)) : ''}
            label={{ value: 'Frequency (Hz)', position: 'insideBottom', offset: -10, fill: '#3E4349', fontSize: 11 }}
            tick={{ fill: '#3E4349', fontSize: 10 }} />
          <YAxis domain={[60, 120]} ticks={[60, 70, 80, 90, 100, 110, 120]}
            tickFormatter={v => String(v)}
            label={{ value: 'SPL (dB)', angle: -90, position: 'insideLeft', fill: '#3E4349', fontSize: 11 }}
            tick={{ fill: '#3E4349', fontSize: 10 }} allowDecimals={false} />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#DCDBD6', strokeWidth: 1 }} />
          {TRACE_CONFIG.map(tc => {
            if (!visibleTraces[tc.id]) return null;
            if (tc.id === 'rew' && !rewOverlaySeries?.data?.length) return null;
            return (
              <Line key={tc.id} type="linear" dataKey={`spl_${tc.id}`}
                stroke={tc.color} strokeWidth={tc.strokeWidth}
                strokeDasharray={tc.dash === '0' ? undefined : tc.dash}
                dot={false} activeDot={{ r: 3, fill: tc.color }}
                connectNulls={false} isAnimationActive={false} />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// --- Main component ---
export default function ImageSourceParityShootout({ roomDims, seatingPositions, subsForSimulation, rewOverlaySeries, liveProductionData }) {
  // ModalQDampingSweep is rendered after the shootout results section (see bottom of JSX)
  const [ran, setRan] = useState(false);
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);
  const [visibleTraces, setVisibleTraces] = useState(() => Object.fromEntries(TRACE_CONFIG.map(t => [t.id, true])));

  const toggleTrace = id => setVisibleTraces(prev => ({ ...prev, [id]: !prev[id] }));

  const activeSeat = useMemo(() => {
    const primary = (seatingPositions || []).find(s => s.isPrimary);
    return primary || seatingPositions?.[0] || null;
  }, [seatingPositions]);

  const seatPos = useMemo(() => {
    if (!activeSeat) return null;
    return { x: Number(activeSeat.x), y: Number(activeSeat.y), z: Number.isFinite(Number(activeSeat.z)) ? Number(activeSeat.z) : 1.2 };
  }, [activeSeat]);

  const canRun = !!(roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM && seatPos && subsForSimulation?.length > 0);
  const rewData = rewOverlaySeries?.data || null;
  const hasRew  = rewData !== null && rewData.length > 1;

  function runShootout() {
    if (!canRun) return;
    setRunning(true);
    setTimeout(() => {
      const rdims = { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM };
      const rows = [];

      for (const variant of VARIANTS) {
        if (variant.id === 'modal_only' && liveProductionData?.length > 1) {
          const freqsHz = liveProductionData.map(p => p.frequency);
          const splDb   = liveProductionData.map(p => p.spl);
          rows.push({ ...variant, ...analyseResponse(freqsHz, splDb), mae: hasRew ? computeMAE(freqsHz, splDb, rewData) : null, estMetrics: computeEstimateMetrics(freqsHz, splDb), verdict: 'baseline', error: null, _freqsHz: freqsHz, _splDb: splDb });
          continue;
        }
        try {
          const res = runVariant(rdims, seatPos, subsForSimulation, variant.buildOpts());
          if (!res) { rows.push({ ...variant, nullFreq: null, nullDb: null, peakFreq: null, peakDb: null, swing: null, mae: null, estMetrics: null, verdict: '—', error: 'engine returned null' }); continue; }
          rows.push({ ...variant, ...analyseResponse(res.freqsHz, res.splDb), mae: hasRew ? computeMAE(res.freqsHz, res.splDb, rewData) : null, estMetrics: computeEstimateMetrics(res.freqsHz, res.splDb), verdict: null, error: null, _freqsHz: res.freqsHz, _splDb: res.splDb });
        } catch (e) {
          rows.push({ ...variant, nullFreq: null, nullDb: null, peakFreq: null, peakDb: null, swing: null, mae: null, estMetrics: null, verdict: '—', error: e.message });
        }
      }

      const baseline = rows[0], baseMae = baseline?.mae;
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.error) { row.verdict = 'error'; continue; }
        if (hasRew && row.mae !== null && baseMae !== null) {
          const diff = row.mae - baseMae;
          row.verdict = diff < -1 ? 'closer to REW' : diff > 1 ? 'worse than baseline' : 'no meaningful change';
        } else {
          const sd = (row.swing != null && baseline?.swing != null) ? Math.abs(row.swing - baseline.swing) : null;
          row.verdict = sd !== null && sd > 2 ? 'shape change (no REW)' : 'no meaningful change';
        }
      }

      // Final verdict vs imported REW
      const imageRow = rows.find(r => r.id === 'image_only_rigid');
      const hybridRow = rows.find(r => r.id === 'hybrid_rigid');
      const modalRow  = rows.find(r => r.id === 'modal_only');
      let finalVerdict;

      if (!hasRew) {
        finalVerdict = '⚠️ No imported REW overlay loaded. Load REW CSV for exact MAE comparison. Estimated REW metrics below are approximate.';
      } else {
        const candidates = [imageRow, hybridRow].filter(r => r?.mae !== null);
        const best = candidates.reduce((b, r) => (!b || r.mae < b.mae) ? r : b, null);
        if (!best || baseMae === null) finalVerdict = '⚠️ Could not compute — ensure subs, seat and REW overlay are all loaded.';
        else if (best.mae < baseMae - 1) finalVerdict = `✅ YES — "${best.label}" (MAE ${fmt1(best.mae)} dB) outperforms modal-only (${fmt1(baseMae)} dB) by >${fmt1(baseMae - best.mae)} dB.`;
        else if (best.mae > baseMae + 1) finalVerdict = `❌ NO — Modal-only (${fmt1(baseMae)} dB) outperforms best image-source candidate (${fmt1(best.mae)} dB).`;
        else finalVerdict = `⚖️ INCONCLUSIVE — Image-source and modal paths within 1 dB MAE.`;
      }

      // Design story verdict vs estimated REW
      const estCandidates = [modalRow, imageRow, hybridRow].filter(r => r?.estMetrics?.maeEst !== null);
      let estimateVerdictStr;
      if (estCandidates.length === 0) {
        estimateVerdictStr = '— (no results to compare)';
      } else {
        const bestEst = estCandidates.reduce((b, r) => (!b || r.estMetrics.maeEst < b.estMetrics.maeEst) ? r : b, null);
        const modalMaeEst = modalRow?.estMetrics?.maeEst;
        const bestMaeEst  = bestEst?.estMetrics?.maeEst;
        const vLabel = bestEst ? estimateMatchVerdict(bestEst.estMetrics) : '—';
        const dipMsg = bestEst ? ` Dips: est ${bestEst.estMetrics.dipsEst} vs sim ${bestEst.estMetrics.dipsSim}.` : '';
        const swingMsg = bestEst?.estMetrics?.swingDiff !== null ? ` Swing diff: ~${fmt1(bestEst.estMetrics.swingDiff)} dB.` : '';
        if (bestEst && bestEst.id !== 'modal_only' && bestMaeEst < modalMaeEst - 2)
          estimateVerdictStr = `✅ "${bestEst.label}" best matches estimated REW story (~MAE ${fmt1(bestMaeEst)} dB vs modal ${fmt1(modalMaeEst)} dB). Verdict: ${vLabel}.${dipMsg}${swingMsg}`;
        else
          estimateVerdictStr = `⚖️ Current modal-only parity (~${fmt1(modalMaeEst)} dB MAE) tells a similar design story. Best: "${bestEst?.label}" (~${fmt1(bestMaeEst)} dB). Verdict: ${vLabel}.${dipMsg}${swingMsg}`;
      }

      setResults({ rows, finalVerdict, estimateVerdictStr, hasRew });
      setRan(true);
      setRunning(false);
    }, 20);
  }

  // --- Table styles ---
  const cell  = { padding: '3px 7px', textAlign: 'right', fontSize: 10, fontFamily: 'monospace', borderBottom: '1px solid #d1fae5', verticalAlign: 'top' };
  const cellL = { ...cell, textAlign: 'left' };
  const th    = { ...cell, fontWeight: 700, color: '#065f46', background: '#ecfdf5', borderBottom: '2px solid #6ee7b7' };
  const thL   = { ...th, textAlign: 'left' };
  const thRed = { ...th, color: '#b91c1c' };
  const thRedL = { ...thRed, borderLeft: '2px solid #fca5a5' };

  return (
    <details style={{ border: '2px solid #0f766e', borderRadius: 8, background: '#f0fdfa', padding: '8px 10px', marginBottom: 8 }}>
      <summary style={{ fontWeight: 700, color: '#0f766e', fontSize: 11, fontFamily: 'monospace', cursor: 'pointer' }}>
        🔬 Image-Source Parity Shootout — REW Basis Audit
      </summary>

      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#134e4a', marginBottom: 8, lineHeight: 1.5 }}>
          Three engine variants — flat 94 dB source, live geometry. Null/peak analysis: 20–80 Hz band.
          Estimated REW curve always visible (hardcoded, approximate).{' '}
          {!hasRew && <strong style={{ color: '#b45309' }}>⚠ No REW overlay loaded — MAE column unavailable.</strong>}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
          <button onClick={runShootout} disabled={!canRun || running}
            style={{ height: 30, padding: '0 14px', borderRadius: 6, border: `1px solid ${canRun && !running ? '#0f766e' : '#d1d5db'}`, background: canRun && !running ? '#0f766e' : '#f3f4f6', color: canRun && !running ? '#fff' : '#9ca3af', fontSize: 11, fontFamily: 'monospace', fontWeight: 700, cursor: canRun && !running ? 'pointer' : 'not-allowed' }}>
            {running ? 'Running…' : ran ? 'Re-run' : 'Run Shootout'}
          </button>
          {!canRun && <span style={{ fontSize: 10, color: '#b45309', fontFamily: 'monospace' }}>Need room dims + seat + at least one sub.</span>}
          {ran && !running && activeSeat && (
            <span style={{ fontSize: 10, color: '#065f46', fontFamily: 'monospace' }}>
              Seat: {activeSeat.id || `(${Number(activeSeat.x).toFixed(2)}, ${Number(activeSeat.y).toFixed(2)})`}
              {' '}· Subs: {subsForSimulation?.length ?? 0}
              {' '}· Room: {roomDims?.widthM?.toFixed(1)}×{roomDims?.lengthM?.toFixed(1)}×{roomDims?.heightM?.toFixed(1)} m
              {hasRew ? ' · REW ✓' : ' · REW ✗'}
            </span>
          )}
        </div>

        {results && (
          <>
            {/* Results table */}
            <div style={{ overflowX: 'auto', marginBottom: 10 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 700 }}>
                <thead>
                  <tr>
                    <th style={{ ...thL, minWidth: 180 }}>Variant</th>
                    <th style={th}>Null Hz</th>
                    <th style={th}>Null dB</th>
                    <th style={th}>Peak Hz</th>
                    <th style={th}>Peak dB</th>
                    <th style={th}>Swing dB</th>
                    <th style={{ ...th, color: results.hasRew ? '#065f46' : '#9ca3af' }}>MAE dB</th>
                    <th style={thRedL} title="vs estimated REW — approximate only">~MAE est.</th>
                    <th style={thRed} title="Major dips: sim / estimated REW">Dips s/e</th>
                    <th style={thRed} title="Swing delta vs estimated REW">~Swing Δ</th>
                    <th style={{ ...thL, minWidth: 120 }}>Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {results.rows.map((row, idx) => {
                    const isBaseline = idx === 0;
                    const rowBg = isBaseline ? '#f0fdf4' : idx % 2 === 0 ? '#fff' : '#f9fafb';
                    const maeBetter = results.hasRew && row.mae !== null && results.rows[0]?.mae !== null && row.mae < results.rows[0].mae - 1;
                    const maeWorse  = results.hasRew && row.mae !== null && results.rows[0]?.mae !== null && row.mae > results.rows[0].mae + 1;
                    return (
                      <tr key={row.id} style={{ background: rowBg }}>
                        <td style={{ ...cellL, minWidth: 180 }}>
                          <div style={{ fontWeight: isBaseline ? 700 : 500, fontSize: 10 }}>{row.label}</div>
                          <div style={{ color: '#6b7280', fontSize: 9, marginTop: 1, lineHeight: 1.4 }}>{row.description}</div>
                          {row.error && <div style={{ color: '#dc2626', fontSize: 9 }}>⚠ {row.error}</div>}
                        </td>
                        <td style={cell}>{fmt1(row.nullFreq)}</td>
                        <td style={{ ...cell, color: row.nullDb !== null && row.nullDb < -20 ? '#b91c1c' : '#374151', fontWeight: row.nullDb !== null && row.nullDb < -20 ? 700 : 400 }}>{fmt1(row.nullDb)}</td>
                        <td style={cell}>{fmt1(row.peakFreq)}</td>
                        <td style={cell}>{fmt1(row.peakDb)}</td>
                        <td style={{ ...cell, fontWeight: 600 }}>{fmt1(row.swing)}</td>
                        <td style={{ ...cell, color: !results.hasRew ? '#9ca3af' : maeBetter ? '#065f46' : maeWorse ? '#991b1b' : '#374151', fontWeight: maeBetter || maeWorse ? 700 : 400 }}>
                          {results.hasRew ? fmt1(row.mae) : '—'}
                        </td>
                        <td style={{ ...cell, color: '#b91c1c', borderLeft: '2px solid #fca5a5' }}>
                          {row.estMetrics?.maeEst !== null ? `~${fmt1(row.estMetrics?.maeEst)}` : '—'}
                        </td>
                        <td style={{ ...cell, color: '#b91c1c' }}>
                          {row.estMetrics ? `${row.estMetrics.dipsSim}/${row.estMetrics.dipsEst}` : '—'}
                        </td>
                        <td style={{ ...cell, color: '#b91c1c' }}>
                          {row.estMetrics?.swingDiff !== null ? `~${fmt1(row.estMetrics?.swingDiff)}` : '—'}
                        </td>
                        <td style={cellL}><VerdictBadge text={row.verdict} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Verdict vs imported REW */}
            <div style={{ border: '2px solid #0f766e', borderRadius: 6, background: '#ccfbf1', padding: '8px 12px', fontSize: 11, fontFamily: 'monospace', lineHeight: 1.7, marginBottom: 6 }}>
              <div style={{ fontWeight: 700, color: '#0f766e', marginBottom: 3 }}>▶ Final Answer (vs imported REW overlay)</div>
              <div>{results.finalVerdict}</div>
            </div>

            {/* Design story verdict vs estimated REW */}
            {results.estimateVerdictStr && (
              <div style={{ border: '2px solid #dc2626', borderRadius: 6, background: '#fff7f7', padding: '8px 12px', fontSize: 11, fontFamily: 'monospace', lineHeight: 1.7, marginBottom: 6 }}>
                <div style={{ fontWeight: 700, color: '#dc2626', marginBottom: 3 }}>▶ Design Story Match — vs Estimated REW Reference</div>
                <div style={{ color: '#6b7280', fontSize: 9, marginBottom: 4 }}>
                  ⚠ Approximate screenshot-derived data. ~MAE is indicative only. Prioritises dominant problem regions and severity class.
                </div>
                <div>{results.estimateVerdictStr}</div>
              </div>
            )}

            <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#6b7280', lineHeight: 1.5 }}>
              Diagnostic only. No production defaults changed. Flat 94 dB source, live sub positions.
            </div>

            {/* Visual comparison chart */}
            <div style={{ marginTop: 12, border: '1px solid #d1fae5', borderRadius: 8, background: '#fff', padding: '10px 12px' }}>
              <div style={{ fontWeight: 700, fontSize: 11, fontFamily: 'monospace', color: '#065f46', marginBottom: 8 }}>
                Visual Comparison — log Hz · 60–120 dB · 20–220 Hz · no smoothing
              </div>

              {/* Legend toggles */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                {TRACE_CONFIG.map(tc => {
                  const isImportedRew = tc.id === 'rew';
                  const isEstimate    = tc.id === 'rew_estimate';
                  const rewLoaded = rewOverlaySeries?.data?.length > 0;
                  const disabled  = isImportedRew && !rewLoaded;
                  const active    = visibleTraces[tc.id] && !disabled;
                  return (
                    <button key={tc.id} onClick={() => !disabled && toggleTrace(tc.id)} disabled={disabled}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 99, border: `2px solid ${active ? tc.color : '#d1d5db'}`, background: active ? `${tc.color}18` : '#f9fafb', color: active ? tc.color : '#9ca3af', fontSize: 10, fontFamily: 'monospace', fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1, transition: 'all 0.1s' }}>
                      <span style={{ display: 'inline-block', width: 18, height: 2, background: active ? tc.color : '#d1d5db', borderRadius: 1, flexShrink: 0 }} />
                      {tc.label}
                      {isImportedRew && !rewLoaded ? ' (not loaded)' : ''}
                      {isEstimate ? ' ⚠ approx.' : ''}
                    </button>
                  );
                })}
              </div>

              <ShootoutChart rows={results.rows} rewOverlaySeries={rewOverlaySeries} visibleTraces={visibleTraces} />
            </div>
          </>
        )}
      </div>

      {/* Modal Q / Damping sweep — always visible below shootout */}
      <ModalQDampingSweep
        roomDims={roomDims}
        seatingPositions={seatingPositions}
        subsForSimulation={subsForSimulation}
        liveProductionData={liveProductionData}
      />

      {/* Modal Family Excitation Audit — collapsed by default */}
      <ModalFamilyExcitationAudit
        roomDims={roomDims}
        seatingPositions={seatingPositions}
        subsForSimulation={subsForSimulation}
      />

      {/* Canonical Modal Deviation Audit — collapsed by default */}
      <CanonicalModalDeviationAudit />

      {/* Correction Contribution Audit — collapsed by default */}
      <CorrectionContributionAudit
        roomDims={roomDims}
        seatingPositions={seatingPositions}
        subsForSimulation={subsForSimulation}
      />

      {/* Canonical Green's Function Audit — collapsed by default */}
      <CanonicalGreensFunctionAudit
        roomDims={roomDims}
        seatingPositions={seatingPositions}
        subsForSimulation={subsForSimulation}
      />

      {/* Modal Excitation Chain Audit — collapsed by default */}
      <ModalExcitationChainAudit
        roomDims={roomDims}
        seatingPositions={seatingPositions}
        subsForSimulation={subsForSimulation}
      />

      {/* Modal Participation Audit — collapsed by default */}
      <ModalParticipationAudit
        roomDims={roomDims}
        seatingPositions={seatingPositions}
        subsForSimulation={subsForSimulation}
      />

      {/* Multi-Room Q Regression Test — collapsed by default */}
      <MultiRoomQRegressionTest />

      {/* Continuous Q Replacement Audit — collapsed by default */}
      <ContinuousQReplacementAudit
        roomDims={roomDims}
        seatingPositions={seatingPositions}
        subsForSimulation={subsForSimulation}
      />

      {/* Zero-Absorption Q Test — collapsed by default */}
      <ZeroAbsorptionQTest
        roomDims={roomDims}
        seatingPositions={seatingPositions}
        subsForSimulation={subsForSimulation}
      />

      {/* Absorption Sensitivity Audit — collapsed by default */}
      <AbsorptionSensitivityAudit
        roomDims={roomDims}
        seatingPositions={seatingPositions}
        subsForSimulation={subsForSimulation}
      />

      {/* Behavioural Story Test — collapsed by default */}
      <BehaviouralStoryTest
        roomDims={roomDims}
        seatingPositions={seatingPositions}
        subsForSimulation={subsForSimulation}
      />

      {/* Final REW Pipeline Divergence Audit — collapsed by default */}
      <RewPipelineDivergenceAudit
        roomDims={roomDims}
        seatingPositions={seatingPositions}
        subsForSimulation={subsForSimulation}
      />

      {/* Absorption Monotonicity / Physical Trend Test */}
      <AbsorptionTrendTest />

      {/* Modal Overlap & Resonance Bandwidth Audit */}
      <ModalOverlapBandwidthAudit />

      {/* Modal Frequency Ordering & Nearest-Neighbour Audit */}
      <ModalFrequencyOrderingAudit />

      {/* Modal Generation Pipeline Audit */}
      <ModalGenerationPipelineAudit />

      {/* Degenerate Mode Grouping Audit */}
      <DegenerateModeGroupingAudit />
    </details>
  );
}