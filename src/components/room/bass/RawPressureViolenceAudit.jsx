import { useState, useMemo } from 'react';
import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine";

const FLAT_SOURCE = [{ hz: 20, db: 94 }, { hz: 50, db: 94 }, { hz: 100, db: 94 }, { hz: 200, db: 94 }];
const fmt = (v, d = 2) => (v !== null && Number.isFinite(Number(v))) ? Number(v).toFixed(d) : '—';
const fmtSci = (v) => (v !== null && Number.isFinite(Number(v))) ? Number(v).toExponential(3) : '—';

// ── Stage statistics over 20–220 Hz ────────────────────────────────────────
function computeStageStats(values, freqs) {
  const pairs = values.map((v, i) => ({ v, f: freqs[i] })).filter(p => Number.isFinite(p.v) && p.f >= 20 && p.f <= 220);
  if (pairs.length < 2) return null;

  const vals = pairs.map(p => p.v);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const swing = max - min;

  let largestJump = 0;
  let largestJumpFreq = null;
  for (let i = 1; i < pairs.length; i++) {
    const jump = Math.abs(pairs[i].v - pairs[i - 1].v);
    if (jump > largestJump) {
      largestJump = jump;
      largestJumpFreq = pairs[i].f;
    }
  }

  const adjacentJumps = [];
  for (let i = 1; i < pairs.length; i++) {
    adjacentJumps.push(Math.abs(pairs[i].v - pairs[i - 1].v));
  }
  const avgJump = adjacentJumps.reduce((s, v) => s + v, 0) / adjacentJumps.length;

  return { min, max, swing, largestJump, largestJumpFreq, avgJump, count: pairs.length };
}

// ── Verdict cell styling ────────────────────────────────────────────────────
function verdictStyle(verdict) {
  if (verdict.startsWith('A')) return { background: '#fef9c3', color: '#92400e', fontWeight: 700 };
  if (verdict.startsWith('B')) return { background: '#fee2e2', color: '#991b1b', fontWeight: 700 };
  if (verdict.startsWith('C')) return { background: '#ede9fe', color: '#5b21b6', fontWeight: 700 };
  return { background: '#f3f4f6', color: '#374151', fontWeight: 400 };
}

// ── Main component ──────────────────────────────────────────────────────────
export default function RawPressureViolenceAudit({ roomDims, seatingPositions, subsForSimulation, surfaceAbsorption, liveProductionData }) {
  const [ran, setRan] = useState(false);
  const [running, setRunning] = useState(false);
  const [auditData, setAuditData] = useState(null);

  const activeSeat = useMemo(() => {
    const primary = (seatingPositions || []).find(s => s.isPrimary);
    return primary || seatingPositions?.[0] || null;
  }, [seatingPositions]);

  const seatPos = useMemo(() => {
    if (!activeSeat) return null;
    return { x: Number(activeSeat.x), y: Number(activeSeat.y), z: Number.isFinite(Number(activeSeat.z)) ? Number(activeSeat.z) : 1.2 };
  }, [activeSeat]);

  const canRun = !!(roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM && seatPos && subsForSimulation?.length > 0);

  function runAudit() {
    if (!canRun) return;
    setRunning(true);
    setTimeout(() => {
      try {
        const rdims = { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM };
        const sa = surfaceAbsorption || { front: 0.30, back: 0.30, left: 0.30, right: 0.30, ceiling: 0.30, floor: 0.30 };

        // Accumulate complex pressure across all subs
        let sumRe = null, sumIm = null;
        let modalSumRe = null, modalSumIm = null;
        let freqsHz = null;

        for (const sub of subsForSimulation) {
          // Full field (modal + direct): matches production BassResponse path exactly
          const fullResult = simulateBassResponseRewCore(rdims, seatPos, sub, FLAT_SOURCE, {
            enableReflections: false,
            enableModes: true,
            disableLateField: true,
            surfaceAbsorption: sa,
            freqMinHz: 20,
            freqMaxHz: 220,
            smoothing: 'none',
            axialQ: 4.0,
            pureDeterministicModalSum: true,
            disableModalPropagationPhase: true,
            propagationPhaseScale: 0,
          });

          // Modal only: isolate modal contribution
          const modalResult = simulateBassResponseRewCore(rdims, seatPos, sub, FLAT_SOURCE, {
            enableReflections: false,
            enableModes: true,
            disableLateField: true,
            surfaceAbsorption: sa,
            freqMinHz: 20,
            freqMaxHz: 220,
            smoothing: 'none',
            axialQ: 4.0,
            pureDeterministicModalSum: true,
            disableModalPropagationPhase: true,
            propagationPhaseScale: 0,
            rewSourceCurveMode: 'flat_rew_reference',
            rewParityFieldMode: 'modes_only',
          });

          if (!freqsHz) {
            freqsHz = fullResult.freqsHz;
            sumRe = fullResult.complexPressure.map(cp => cp.re);
            sumIm = fullResult.complexPressure.map(cp => cp.im);
            modalSumRe = modalResult.complexPressure.map(cp => cp.re);
            modalSumIm = modalResult.complexPressure.map(cp => cp.im);
          } else {
            fullResult.complexPressure.forEach((cp, i) => {
              if (Number.isFinite(cp.re)) sumRe[i] += cp.re;
              if (Number.isFinite(cp.im)) sumIm[i] += cp.im;
            });
            modalResult.complexPressure.forEach((cp, i) => {
              if (Number.isFinite(cp.re)) modalSumRe[i] += cp.re;
              if (Number.isFinite(cp.im)) modalSumIm[i] += cp.im;
            });
          }
        }

        // Stage 1: modal complex pressure magnitude
        const modalPressureMags = modalSumRe.map((re, i) =>
          Math.sqrt(re * re + modalSumIm[i] * modalSumIm[i])
        );

        // Stage 2: combined (direct + modal) pressure magnitude
        const combinedPressureMags = sumRe.map((re, i) =>
          Math.sqrt(re * re + sumIm[i] * sumIm[i])
        );

        // Stage 3: converted SPL dB (from combined)
        const splDb = combinedPressureMags.map(m => 20 * Math.log10(Math.max(m, 1e-10)));

        // Stage 4: final plotted data (from liveProductionData if available)
        const plotFreqs = liveProductionData ? liveProductionData.map(p => p.frequency) : freqsHz;
        const plotSpl = liveProductionData ? liveProductionData.map(p => p.spl) : splDb;

        // Compute stats per stage
        const s1 = computeStageStats(modalPressureMags, freqsHz);
        const s2 = computeStageStats(combinedPressureMags, freqsHz);
        const s3 = computeStageStats(splDb, freqsHz);
        const s4 = computeStageStats(plotSpl, plotFreqs);

        // First 20 plotted points
        const first20 = freqsHz
          .map((f, i) => ({ hz: f, pressure: modalPressureMags[i], combined: combinedPressureMags[i], spl: splDb[i] }))
          .filter(p => p.hz >= 20 && p.hz <= 220)
          .slice(0, 20);

        // Whether violence exists before dB conversion
        const pressureSwingRatio = s1 ? s1.max / Math.max(s1.min, 1e-10) : null;
        const pressureIsViolent = pressureSwingRatio !== null && pressureSwingRatio > 10;
        const pressureIsSmooth = pressureSwingRatio !== null && pressureSwingRatio < 3;
        const dbCompressesViolence = pressureIsViolent && s3 && s3.swing < 30;
        const dbMatchesPressure = pressureIsViolent && s3 && s3.swing >= 30;

        // Final verdict
        let finalVerdict, finalVerdictDetail;
        if (pressureIsViolent && dbCompressesViolence) {
          finalVerdict = 'A';
          finalVerdictDetail = 'A — raw pressure is violent, dB conversion/display compresses it. The 20×log10 operation is the primary smoothing stage.';
        } else if (pressureIsSmooth) {
          finalVerdict = 'B';
          finalVerdictDetail = 'B — raw pressure is already smooth. Issue is upstream in modal generation, Q-clamping, or mode-shape coupling — not in display.';
        } else if (pressureIsViolent && dbMatchesPressure) {
          // Violence preserved into dB — check if plot changes it
          const plotChanges = s4 && s3 && Math.abs(s4.swing - s3.swing) > 3;
          if (plotChanges) {
            finalVerdict = 'C';
            finalVerdictDetail = 'C — final plotting alters the shape. SPL dB is violent but the graph data differs from the converted SPL.';
          } else {
            finalVerdict = 'D';
            finalVerdictDetail = 'D — inconclusive. Pressure is violent, dB preserves violence, graph data matches — discrepancy with REW may be in physics assumptions.';
          }
        } else {
          finalVerdict = 'D';
          finalVerdictDetail = 'D — inconclusive. Could not establish a clear pattern from this geometry.';
        }

        // Source attribution for first smooth stage
        let firstSmoothStage;
        if (pressureIsSmooth) {
          firstSmoothStage = {
            stage: 'Modal complex pressure magnitude',
            file: 'src/bass/core/rewBassEngine.js',
            fn: 'legacyModalTransferLocal → modalPressureContributionLocal → combinedCoupling × resonantTransfer',
            lines: '272–566',
            detail: 'The complex pressure sum (modalSumRe/Im) accumulates from mode-shape coupling × resonant transfer. If this is already smooth, Q-clamping (Math.min(baseQ, absorptionQ) at L796) or low mode-shape coupling is suppressing modal resonance before it can build contrast.',
          };
        } else if (dbCompressesViolence) {
          firstSmoothStage = {
            stage: 'dB SPL conversion',
            file: 'src/components/room/BassResponse.jsx',
            fn: 'simulationResults useMemo → seatResponses[seatId].splDb',
            lines: '670–673',
            detail: 'BassResponse.jsx L670–673: `20 * Math.log10(Math.max(magnitude, 1e-10))`. Logarithmic compression converts large pressure ratios into smaller dB differences. A 100× pressure ratio (40 dB swing) corresponds to only 40 dB in log scale but may appear 3× less dramatic at display scale.',
          };
        } else {
          firstSmoothStage = {
            stage: 'Not yet identified',
            file: '—',
            fn: '—',
            lines: '—',
            detail: 'Run with more room configurations to establish pattern.',
          };
        }

        setAuditData({ s1, s2, s3, s4, first20, pressureSwingRatio, pressureIsViolent, pressureIsSmooth, dbCompressesViolence, finalVerdict, finalVerdictDetail, firstSmoothStage, freqsHz, splDb, plotSpl, plotFreqs });
        setRan(true);
      } catch (err) {
        setAuditData({ error: err.message });
        setRan(true);
      }
      setRunning(false);
    }, 20);
  }

  // Table styles
  const th = { padding: '3px 8px', fontSize: 10, fontFamily: 'monospace', fontWeight: 700, background: '#1e1b4b', color: '#c7d2fe', textAlign: 'right', borderBottom: '2px solid #4338ca', whiteSpace: 'nowrap' };
  const thL = { ...th, textAlign: 'left' };
  const td = { padding: '3px 8px', fontSize: 10, fontFamily: 'monospace', textAlign: 'right', borderBottom: '1px solid #e0e7ff', color: '#1e1b4b' };
  const tdL = { ...td, textAlign: 'left' };

  const stageRows = auditData && !auditData.error ? [
    { label: 'Modal complex pressure magnitude', unit: 'Pa', stats: auditData.s1, isLog: false },
    { label: 'Direct + modal combined pressure magnitude', unit: 'Pa', stats: auditData.s2, isLog: false },
    { label: 'Converted SPL dB (20·log10)', unit: 'dB', stats: auditData.s3, isLog: true },
    { label: 'Final plotted graph data', unit: 'dB', stats: auditData.s4, isLog: true, note: liveProductionData ? 'from live graph' : 'from engine (no live data)' },
  ] : [];

  return (
    <details style={{ border: '2px solid #4338ca', borderRadius: 8, background: '#eef2ff', padding: '8px 10px', marginTop: 10 }}>
      <summary style={{ fontWeight: 700, color: '#3730a3', fontSize: 11, fontFamily: 'monospace', cursor: 'pointer' }}>
        🔬 Raw Pressure Violence Audit — where does the curve become smooth?
      </summary>

      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#3730a3', marginBottom: 8, lineHeight: 1.5 }}>
          Traces raw complex modal pressure magnitude → dB SPL → final plotted data.
          Identifies the exact stage where acoustic "violence" is lost.
          Uses live room, seat, sub, and absorption. <strong>No production defaults changed.</strong>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
          <button onClick={runAudit} disabled={!canRun || running}
            style={{ height: 30, padding: '0 14px', borderRadius: 6, border: `1px solid ${canRun && !running ? '#4338ca' : '#d1d5db'}`, background: canRun && !running ? '#4338ca' : '#f3f4f6', color: canRun && !running ? '#fff' : '#9ca3af', fontSize: 11, fontFamily: 'monospace', fontWeight: 700, cursor: canRun && !running ? 'pointer' : 'not-allowed' }}>
            {running ? 'Running…' : ran ? 'Re-run Audit' : 'Run Pressure Audit'}
          </button>
          {!canRun && <span style={{ fontSize: 10, color: '#b45309', fontFamily: 'monospace' }}>Need room dims + seat + at least one sub.</span>}
          {ran && !running && activeSeat && (
            <span style={{ fontSize: 10, color: '#3730a3', fontFamily: 'monospace' }}>
              Seat: ({fmt(activeSeat.x, 2)}, {fmt(activeSeat.y, 2)}) · Subs: {subsForSimulation?.length ?? 0} · Room: {roomDims?.widthM?.toFixed(1)}×{roomDims?.lengthM?.toFixed(1)}×{roomDims?.heightM?.toFixed(1)} m
            </span>
          )}
        </div>

        {auditData?.error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, padding: '8px 12px', color: '#b91c1c', fontSize: 11, fontFamily: 'monospace' }}>
            ⚠ Engine error: {auditData.error}
          </div>
        )}

        {auditData && !auditData.error && (
          <>
            {/* ── Stage comparison table ─────────────────────────────────── */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 11, fontFamily: 'monospace', color: '#3730a3', marginBottom: 6 }}>Stage Comparison Table</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 680 }}>
                  <thead>
                    <tr>
                      <th style={{ ...thL, minWidth: 240 }}>Stage</th>
                      <th style={th}>Min</th>
                      <th style={th}>Max</th>
                      <th style={th}>Swing</th>
                      <th style={th}>Largest adj. jump</th>
                      <th style={th}>Jump freq. (Hz)</th>
                      <th style={th}>Avg adj. jump</th>
                      <th style={{ ...th, textAlign: 'left', minWidth: 140 }}>Verdict</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stageRows.map((row, idx) => {
                      const s = row.stats;
                      if (!s) return (
                        <tr key={idx} style={{ background: '#f9fafb' }}>
                          <td style={{ ...tdL, color: '#6b7280' }}>{row.label}{row.note ? <span style={{ color: '#9ca3af', fontSize: 9 }}> ({row.note})</span> : ''}</td>
                          <td colSpan={7} style={{ ...td, color: '#9ca3af', textAlign: 'center' }}>no data</td>
                        </tr>
                      );
                      const isSmall = !row.isLog && s.swing < 0.01 * s.max;
                      const swingVerdict = row.isLog
                        ? (s.swing < 10 ? '⚠ weak (< 10 dB swing)' : s.swing > 25 ? '✓ strong (> 25 dB)' : '~ moderate')
                        : (s.max < 1e-4 ? '⚠ very low amplitude' : s.swing / Math.max(s.max, 1e-10) < 0.1 ? '⚠ flat (< 10% swing ratio)' : s.swing / Math.max(s.max, 1e-10) > 0.5 ? '✓ violent (> 50% swing ratio)' : '~ moderate');
                      const vStyle = verdictStyle(swingVerdict);
                      const bg = idx % 2 === 0 ? '#fff' : '#f5f3ff';
                      return (
                        <tr key={idx} style={{ background: bg }}>
                          <td style={{ ...tdL, fontWeight: 600 }}>
                            {row.label}
                            {row.note ? <span style={{ color: '#9ca3af', fontSize: 9, marginLeft: 4 }}>({row.note})</span> : ''}
                            <span style={{ color: '#9ca3af', fontSize: 9, marginLeft: 4 }}>[{row.unit}]</span>
                          </td>
                          <td style={td}>{row.isLog ? fmt(s.min, 1) : fmtSci(s.min)}</td>
                          <td style={td}>{row.isLog ? fmt(s.max, 1) : fmtSci(s.max)}</td>
                          <td style={{ ...td, fontWeight: 600, color: s.swing < 5 && row.isLog ? '#991b1b' : '#1e1b4b' }}>
                            {row.isLog ? fmt(s.swing, 1) : fmtSci(s.swing)}
                          </td>
                          <td style={{ ...td, fontWeight: 700, color: '#4338ca' }}>
                            {row.isLog ? fmt(s.largestJump, 2) : fmtSci(s.largestJump)}
                          </td>
                          <td style={td}>{fmt(s.largestJumpFreq, 1)}</td>
                          <td style={td}>{row.isLog ? fmt(s.avgJump, 2) : fmtSci(s.avgJump)}</td>
                          <td style={{ ...td, textAlign: 'left', ...vStyle, borderRadius: 4, padding: '2px 8px' }}>{swingVerdict}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Pressure ratio summary ─────────────────────────────────── */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
              {[
                { label: 'Modal pressure swing ratio (max/min)', value: auditData.pressureSwingRatio !== null ? `${auditData.pressureSwingRatio.toFixed(1)}×` : '—', note: '> 10× = violent, < 3× = smooth' },
                { label: 'Pressure is violent?', value: auditData.pressureIsViolent ? '✓ YES (> 10×)' : auditData.pressureIsSmooth ? '✗ NO (< 3×)' : '~ moderate', note: '' },
                { label: 'dB conversion compresses violence?', value: auditData.dbCompressesViolence ? '✓ YES' : '✗ NO', note: 'pressure violent but dB swing < 30 dB' },
              ].map((item, i) => (
                <div key={i} style={{ border: '1px solid #c7d2fe', borderRadius: 6, background: '#fff', padding: '6px 12px', fontSize: 10, fontFamily: 'monospace', minWidth: 200 }}>
                  <div style={{ color: '#6b7280', marginBottom: 2 }}>{item.label}</div>
                  <div style={{ fontWeight: 700, color: '#3730a3', fontSize: 13 }}>{item.value}</div>
                  {item.note && <div style={{ color: '#9ca3af', fontSize: 9, marginTop: 1 }}>{item.note}</div>}
                </div>
              ))}
            </div>

            {/* ── First 20 points sample ─────────────────────────────────── */}
            <details style={{ marginBottom: 12, border: '1px solid #c7d2fe', borderRadius: 6, background: '#fff', padding: '6px 10px' }}>
              <summary style={{ fontWeight: 700, fontSize: 10, fontFamily: 'monospace', color: '#4338ca', cursor: 'pointer' }}>
                First 20 Plotted Points (20–220 Hz)
              </summary>
              <div style={{ overflowX: 'auto', marginTop: 6 }}>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <thead>
                    <tr>
                      {['#', 'Hz', 'Modal pressure (Pa)', 'Combined pressure (Pa)', 'SPL dB'].map((h, i) => (
                        <th key={i} style={{ padding: '2px 8px', fontSize: 9, fontFamily: 'monospace', fontWeight: 700, background: '#eef2ff', color: '#3730a3', textAlign: i === 0 ? 'center' : 'right', borderBottom: '1px solid #c7d2fe' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {auditData.first20.map((row, i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f5f3ff' }}>
                        <td style={{ padding: '1px 8px', fontSize: 9, fontFamily: 'monospace', textAlign: 'center', color: '#6b7280' }}>{i + 1}</td>
                        <td style={{ padding: '1px 8px', fontSize: 9, fontFamily: 'monospace', textAlign: 'right', fontWeight: 600, color: '#1e1b4b' }}>{fmt(row.hz, 2)}</td>
                        <td style={{ padding: '1px 8px', fontSize: 9, fontFamily: 'monospace', textAlign: 'right', color: '#0369a1' }}>{fmtSci(row.pressure)}</td>
                        <td style={{ padding: '1px 8px', fontSize: 9, fontFamily: 'monospace', textAlign: 'right', color: '#0369a1' }}>{fmtSci(row.combined)}</td>
                        <td style={{ padding: '1px 8px', fontSize: 9, fontFamily: 'monospace', textAlign: 'right', color: '#1e1b4b', fontWeight: 600 }}>{fmt(row.spl, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>

            {/* ── First smooth stage attribution ────────────────────────── */}
            <div style={{ border: '1px solid #c7d2fe', borderRadius: 6, background: '#fff', padding: '8px 12px', marginBottom: 12, fontSize: 10, fontFamily: 'monospace' }}>
              <div style={{ fontWeight: 700, color: '#3730a3', marginBottom: 4, fontSize: 11 }}>First Stage Responsible for Smoothing</div>
              <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', rowGap: 3, color: '#1e1b4b' }}>
                <span style={{ color: '#6b7280' }}>Stage:</span><span style={{ fontWeight: 600 }}>{auditData.firstSmoothStage.stage}</span>
                <span style={{ color: '#6b7280' }}>File:</span><span style={{ color: '#0369a1' }}>{auditData.firstSmoothStage.file}</span>
                <span style={{ color: '#6b7280' }}>Function:</span><span>{auditData.firstSmoothStage.fn}</span>
                <span style={{ color: '#6b7280' }}>Lines:</span><span>{auditData.firstSmoothStage.lines}</span>
              </div>
              <div style={{ marginTop: 6, color: '#374151', lineHeight: 1.5 }}>{auditData.firstSmoothStage.detail}</div>
            </div>

            {/* ── Final verdict ─────────────────────────────────────────── */}
            <div style={{ border: '2px solid #4338ca', borderRadius: 8, background: '#e0e7ff', padding: '10px 14px' }}>
              <div style={{ fontWeight: 700, fontSize: 12, fontFamily: 'monospace', color: '#3730a3', marginBottom: 4 }}>
                ▶ Final Verdict: {auditData.finalVerdict}
              </div>
              <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#1e1b4b', lineHeight: 1.6 }}>{auditData.finalVerdictDetail}</div>
            </div>

            <div style={{ marginTop: 8, fontSize: 9, fontFamily: 'monospace', color: '#9ca3af' }}>
              Diagnostic only. No production defaults changed. Flat 94 dB source. Live geometry.
              Modal-only path uses pureDeterministicModalSum=true, disableModalPropagationPhase=true, propagationPhaseScale=0.
            </div>
          </>
        )}
      </div>
    </details>
  );
}