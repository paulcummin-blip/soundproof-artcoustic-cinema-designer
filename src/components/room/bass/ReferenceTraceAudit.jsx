/**
 * ReferenceTraceAudit — Diagnostic only.
 * Does NOT affect the live graph or production engine.
 *
 * Traces the entire SPL chain backwards from the final graph value at
 * 70, 80, 85 and 90 Hz using live engine data already computed in BassResponse.
 *
 * Data sources:
 *   - graphSeries       → final graph SPL per frequency (post dedup/sort)
 *   - wholeCurveDebugRows → directMagnitude, reflectionMagnitude, preModalMagnitude,
 *                           modalSumMagnitude, postModalMagnitude, curveDb, modalGainScalar
 *   - sub geometry      → distance attenuation
 *   - subs / seat       → raw arithmetic chain
 */

import React, { useMemo } from 'react';

// ── Constants ─────────────────────────────────────────────────────────────────
const TARGET_FREQS  = [70, 80, 85, 90];
const SPEED_OF_SOUND = 343;

const REW_BENCHMARK = {
  70: 86.8, 80: 79.7, 85: 90.8, 90: 84.1,
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const mag2db  = (m) => (Number.isFinite(m) && m > 0 ? 20 * Math.log10(m) : null);
const fmt     = (v, d = 2) => (Number.isFinite(Number(v)) ? Number(v).toFixed(d) : '—');
const fmtΔ    = (v) => (!Number.isFinite(v) ? '—' : (v >= 0 ? '+' : '') + Number(v).toFixed(2));

function errColor(v) {
  if (!Number.isFinite(v)) return '#6b7280';
  const a = Math.abs(v);
  if (a <= 1)  return '#4ade80';
  if (a <= 3)  return '#fbbf24';
  if (a <= 6)  return '#fb923c';
  return '#f87171';
}

function interpSeries(series, hz) {
  if (!series?.length) return null;
  const key = typeof series[0].frequency !== 'undefined' ? 'frequency' : 'frequencyHz';
  const dbKey = typeof series[0].spl !== 'undefined' ? 'spl' : 'splDb';
  if (hz <= series[0][key]) return series[0][dbKey];
  if (hz >= series[series.length - 1][key]) return series[series.length - 1][dbKey];
  for (let i = 0; i < series.length - 1; i++) {
    if (hz >= series[i][key] && hz <= series[i + 1][key]) {
      const t = (hz - series[i][key]) / (series[i + 1][key] - series[i][key]);
      return series[i][dbKey] + t * (series[i + 1][dbKey] - series[i][dbKey]);
    }
  }
  return null;
}

function interpDebugRow(rows, hz) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  let best = null, bestDist = Infinity;
  for (const row of rows) {
    const rowHz = row.frequencyHz ?? row.targetHz;
    if (!Number.isFinite(rowHz)) continue;
    const dist = Math.abs(rowHz - hz);
    if (dist < bestDist) { bestDist = dist; best = row; }
  }
  return best && bestDist <= 5 ? best : null;
}

function getSubDist(sub, seat) {
  const dx = (sub.x ?? 0) - (seat.x ?? 0);
  const dy = (sub.y ?? 0) - (seat.y ?? 0);
  const dz = (sub.z ?? 0.35) - (seat.z ?? 1.2);
  return Math.max(0.01, Math.sqrt(dx * dx + dy * dy + dz * dz));
}

// ── Styles ────────────────────────────────────────────────────────────────────
const MONO = { fontFamily: 'monospace' };
const TH = {
  padding: '3px 8px', fontSize: 9, fontWeight: 700, ...MONO,
  background: '#0c0a09', color: '#d6d3d1', borderBottom: '2px solid #292524',
  whiteSpace: 'nowrap', textAlign: 'right',
};
const TD = {
  padding: '3px 8px', fontSize: 9, ...MONO,
  textAlign: 'right', borderBottom: '1px solid #1c1917',
};

// ── Row definitions ───────────────────────────────────────────────────────────
// Each row describes one step in the chain. extract(data) receives { row, graphSpl, distM, sub, seat }.
const CHAIN_STEPS = [
  {
    label: 'Source reference (curveDb)',
    desc:  'Source curve output at 1 m (flat REW = 94 dB)',
    color: '#d6d3d1',
    extract: ({ row }) => row?.curveDb ?? null,
  },
  {
    label: 'Distance sub→seat (m)',
    desc:  '3D Euclidean distance, no dB conversion',
    color: '#a8a29e',
    unit:  'm',
    extract: ({ distM }) => distM,
  },
  {
    label: 'Distance attenuation (dB)',
    desc:  '−20·log10(d) relative to 1 m',
    color: '#93c5fd',
    extract: ({ distM }) => (Number.isFinite(distM) ? -20 * Math.log10(distM) : null),
  },
  {
    label: 'Expected direct SPL (dB)',
    desc:  'Source ref + distance atten — arithmetic only, no phase',
    color: '#60a5fa',
    extract: ({ row, distM }) => {
      const ref = row?.curveDb;
      if (!Number.isFinite(ref) || !Number.isFinite(distM)) return null;
      return ref - 20 * Math.log10(distM);
    },
  },
  {
    label: 'Engine direct magnitude (dB)',
    desc:  '20·log10(directMagnitude) from wholeCurveDebugRows',
    color: '#38bdf8',
    extract: ({ row }) => mag2db(row?.directMagnitude),
  },
  {
    label: 'Direct gap: engine vs arithmetic (dB)',
    desc:  'Engine direct − expected arithmetic direct. Should be ≈0.',
    color: '#f87171',
    isDelta: true,
    extract: ({ row, distM }) => {
      const eng = mag2db(row?.directMagnitude);
      const ref = row?.curveDb;
      if (!Number.isFinite(eng) || !Number.isFinite(ref) || !Number.isFinite(distM)) return null;
      const arith = ref - 20 * Math.log10(distM);
      return eng - arith;
    },
  },
  {
    label: 'Boundary contribution (dB)',
    desc:  '20·log10(reflectionMagnitude). 0 in REW parity mode.',
    color: '#86efac',
    extract: ({ row }) => {
      const m = row?.reflectionMagnitude;
      return (Number.isFinite(m) && m > 1e-12) ? mag2db(m) : null;
    },
  },
  {
    label: 'Modal source normalisation',
    desc:  'modalSourceReferenceMode + modalGainScalar applied by engine',
    color: '#fbbf24',
    isText: true,
    extract: ({ row }) => {
      const mode   = row?.modalSourceReferenceMode ?? '?';
      const scalar = row?.modalGainScalar;
      return `${mode} ×${Number.isFinite(scalar) ? scalar.toFixed(2) : '1.00'}`;
    },
  },
  {
    label: 'Pre-modal field SPL (dB)',
    desc:  'direct + reflections + late-field, before modal addition',
    color: '#34d399',
    extract: ({ row }) => mag2db(row?.preModalMagnitude),
  },
  {
    label: 'Modal field SPL (dB)',
    desc:  '20·log10(modalSumMagnitude) — isolated modal pressure vector',
    color: '#a78bfa',
    extract: ({ row }) => {
      const m = row?.modalSumMagnitude;
      return (Number.isFinite(m) && m > 1e-12) ? mag2db(m) : null;
    },
  },
  {
    label: 'Post-modal SPL (dB)',
    desc:  'Engine postModalMagnitude — direct+reflections+modal summed',
    color: '#fbbf24',
    extract: ({ row }) => mag2db(row?.postModalMagnitude),
  },
  {
    label: 'Any direct normalisation',
    desc:  'Engine applies no separate direct-field normalisation — N/A',
    color: '#57534e',
    isText: true,
    extract: () => 'none',
  },
  {
    label: 'Any global normalisation',
    desc:  'Engine applies no global SPL normalisation post-summation — N/A',
    color: '#57534e',
    isText: true,
    extract: () => 'none',
  },
  {
    label: 'Any final graph scaling',
    desc:  'Graph reads 20·log10(|complexPressure|) directly — N/A',
    color: '#57534e',
    isText: true,
    extract: () => 'none',
  },
  {
    label: 'Graph SPL (dB)',
    desc:  'Actual value read from live graphSeries (deduped/sorted)',
    color: '#f97316',
    extract: ({ graphSpl }) => graphSpl,
  },
  {
    label: 'Post-modal vs graph gap (dB)',
    desc:  'Graph − post-modal. Should be ≈0 if no further processing.',
    color: '#f87171',
    isDelta: true,
    extract: ({ row, graphSpl }) => {
      const pm = mag2db(row?.postModalMagnitude);
      if (!Number.isFinite(pm) || !Number.isFinite(graphSpl)) return null;
      return graphSpl - pm;
    },
  },
  {
    label: 'Gap vs REW benchmark (dB)',
    desc:  'Graph SPL − REW. Negative = B44 below REW.',
    color: '#f87171',
    isDelta: true,
    extract: ({ graphSpl, hz }) => {
      const ref = REW_BENCHMARK[hz];
      if (!Number.isFinite(graphSpl) || !Number.isFinite(ref)) return null;
      return graphSpl - ref;
    },
  },
  {
    label: 'Expected from pure arithmetic (dB)',
    desc:  'sourceRef − 20·log10(dist) — no phase, no modes, no reflections',
    color: '#86efac',
    extract: ({ row, distM }) => {
      const ref = row?.curveDb;
      if (!Number.isFinite(ref) || !Number.isFinite(distM)) return null;
      return ref - 20 * Math.log10(distM);
    },
  },
  {
    label: 'Arithmetic vs graph gap (dB)',
    desc:  'Graph SPL − arithmetic. Shows total modal+phase contribution.',
    color: '#fb923c',
    isDelta: true,
    extract: ({ row, distM, graphSpl }) => {
      const ref = row?.curveDb;
      if (!Number.isFinite(ref) || !Number.isFinite(distM) || !Number.isFinite(graphSpl)) return null;
      const arith = ref - 20 * Math.log10(distM);
      return graphSpl - arith;
    },
  },
];

// ── Component ─────────────────────────────────────────────────────────────────
export default function ReferenceTraceAudit({
  simulationResults,
  graphSeries,
  subs,
  seat,
}) {
  const wcd    = simulationResults?.wholeCurveDebugRows;
  const hasWcd = Array.isArray(wcd) && wcd.length > 0;

  const currentSub = subs?.[0] ?? null;
  const hasData    = hasWcd && Array.isArray(graphSeries) && graphSeries.length > 0;

  const distM = useMemo(() => {
    if (!currentSub || !seat) return null;
    return getSubDist(currentSub, seat);
  }, [currentSub, seat]);

  // Build one data object per target frequency
  const traceData = useMemo(() => {
    if (!hasData) return null;
    return TARGET_FREQS.map(hz => {
      const row       = interpDebugRow(wcd, hz);
      const graphSpl  = interpSeries(graphSeries, hz);
      return { hz, row, graphSpl, distM };
    });
  }, [wcd, graphSeries, distM, hasData]);

  // Summary: per-stage the worst gap across all 4 freqs
  const stageSummary = useMemo(() => {
    if (!traceData) return null;
    return CHAIN_STEPS.map(step => {
      if (step.isText) return { label: step.label, isDelta: false, values: null };
      const values = traceData.map(d => step.extract({ ...d, graphSpl: d.graphSpl }));
      const deltas = step.isDelta ? values : null;
      const worst  = step.isDelta
        ? values.reduce((m, v) => (Number.isFinite(v) && Math.abs(v) > Math.abs(m ?? 0) ? v : m), null)
        : null;
      return { label: step.label, desc: step.desc, color: step.color, isDelta: step.isDelta, values, worst };
    });
  }, [traceData]);

  return (
    <div style={{ marginTop: 12, border: '1px solid #292524', borderRadius: 8, background: '#0c0a09', padding: '10px 12px' }}>

      {/* ── Header ── */}
      <div style={{ fontWeight: 700, color: '#d6d3d1', fontSize: 11, ...MONO, marginBottom: 3 }}>
        Reference Trace Audit
        <span style={{ fontWeight: 400, color: '#44403c', marginLeft: 10, fontSize: 10 }}>
          diagnostic only · live engine data · no production changes
        </span>
      </div>
      <div style={{ fontSize: 9, color: '#57534e', ...MONO, marginBottom: 8, lineHeight: 1.8 }}>
        Traces the entire SPL chain from source reference → direct path → pre-modal → modal → post-modal → graph at 70, 80, 85, 90 Hz.<br />
        Goal: identify exactly where the missing ~6 dB originates in the calculation chain.<br />
        Data source: live <code>wholeCurveDebugRows</code> + <code>graphSeries</code> — no re-simulation required.
      </div>

      {!hasWcd && (
        <div style={{ fontSize: 10, color: '#fbbf24', ...MONO, marginBottom: 6 }}>
          ⚠ No wholeCurveDebugRows available — ensure a seat and subwoofer are active.
        </div>
      )}
      {hasWcd && (!graphSeries?.length) && (
        <div style={{ fontSize: 10, color: '#fbbf24', ...MONO, marginBottom: 6 }}>
          ⚠ No graphSeries data — ensure simulation has run.
        </div>
      )}
      {hasWcd && !currentSub && (
        <div style={{ fontSize: 10, color: '#fbbf24', ...MONO, marginBottom: 6 }}>
          ⚠ No subwoofer found — cannot compute distance.
        </div>
      )}
      {hasWcd && !seat && (
        <div style={{ fontSize: 10, color: '#fbbf24', ...MONO, marginBottom: 6 }}>
          ⚠ No seat provided — cannot compute distance.
        </div>
      )}

      {hasData && traceData && (
        <>
          {/* ── Context banner ── */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 10, fontSize: 9, ...MONO }}>
            {currentSub && (
              <div style={{ padding: '4px 10px', background: '#1c1917', borderRadius: 5, color: '#93c5fd' }}>
                Sub: <strong>({fmt(currentSub.x, 3)}, {fmt(currentSub.y, 3)}, {fmt(currentSub.z ?? 0.35, 3)}) m</strong>
              </div>
            )}
            {seat && (
              <div style={{ padding: '4px 10px', background: '#1c1917', borderRadius: 5, color: '#86efac' }}>
                MLP: <strong>({fmt(seat.x, 3)}, {fmt(seat.y, 3)}, {fmt(seat.z ?? 1.2, 3)}) m</strong>
              </div>
            )}
            {Number.isFinite(distM) && (
              <div style={{ padding: '4px 10px', background: '#1c1917', borderRadius: 5, color: '#fbbf24' }}>
                Dist: <strong>{fmt(distM, 4)} m</strong>
                &nbsp;|&nbsp; Atten: <strong>{fmt(-20 * Math.log10(distM), 2)} dB</strong>
              </div>
            )}
            <div style={{ padding: '4px 10px', background: '#1c1917', borderRadius: 5, color: '#a8a29e' }}>
              modalRefMode: <strong>{traceData[0]?.row?.modalSourceReferenceMode ?? '?'}</strong>
              &nbsp;·&nbsp; modalGain ×<strong>{fmt(traceData[0]?.row?.modalGainScalar, 2)}</strong>
            </div>
          </div>

          {/* ── Main chain table ── */}
          <div style={{ fontSize: 10, fontWeight: 700, color: '#93c5fd', ...MONO, marginBottom: 6 }}>
            SPL Chain Trace — all values in dBSPL
          </div>
          <div style={{ overflowX: 'auto', marginBottom: 14 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 700 }}>
              <thead>
                <tr>
                  <th style={{ ...TH, textAlign: 'left', minWidth: 240 }}>Stage</th>
                  {TARGET_FREQS.map(hz => (
                    <th key={hz} style={{ ...TH, color: '#fbbf24' }}>{hz} Hz</th>
                  ))}
                  <th style={{ ...TH, color: '#57534e', textAlign: 'left', minWidth: 200 }}>Note</th>
                </tr>
              </thead>
              <tbody>
                {CHAIN_STEPS.map((step) => (
                  <tr key={step.label} style={{ borderBottom: '1px solid #1c1917' }}>
                    <td style={{ ...TD, textAlign: 'left', color: step.color, fontWeight: 600, minWidth: 240 }}>
                      {step.label}
                    </td>
                    {TARGET_FREQS.map((hz, i) => {
                      const d = traceData[i];
                      const val = step.extract({ ...d, hz, graphSpl: d.graphSpl });
                      const numVal = Number.isFinite(Number(val)) ? Number(val) : null;
                      const color = step.isDelta ? errColor(numVal)
                        : step.isText ? '#78716c'
                        : step.color;
                      return (
                        <td key={hz} style={{ ...TD, color }}>
                          {step.isText ? (val ?? '—') : step.isDelta ? fmtΔ(numVal) : fmt(numVal)}
                        </td>
                      );
                    })}
                    <td style={{ ...TD, textAlign: 'left', color: '#44403c', fontSize: 8, maxWidth: 200 }}>
                      {step.desc}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Gap summary ── */}
          <div style={{ fontSize: 10, fontWeight: 700, color: '#fbbf24', ...MONO, marginBottom: 6 }}>
            Gap Summary — key stage-by-stage anomalies
          </div>
          <div style={{ overflowX: 'auto', marginBottom: 14 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 500 }}>
              <thead>
                <tr>
                  <th style={{ ...TH, textAlign: 'left' }}>Stage delta</th>
                  <th style={{ ...TH }}>70 Hz</th>
                  <th style={{ ...TH }}>80 Hz</th>
                  <th style={{ ...TH }}>85 Hz</th>
                  <th style={{ ...TH }}>90 Hz</th>
                  <th style={{ ...TH, color: '#fb923c' }}>Worst</th>
                  <th style={{ ...TH, textAlign: 'left', color: '#57534e' }}>Verdict</th>
                </tr>
              </thead>
              <tbody>
                {CHAIN_STEPS.filter(s => s.isDelta).map(step => {
                  const vals = traceData.map(d => step.extract({ ...d, hz: d.hz, graphSpl: d.graphSpl }));
                  const worst = vals.reduce((m, v) => (Number.isFinite(v) && Math.abs(v) > Math.abs(m ?? 0) ? v : m), null);
                  const allSmall = vals.every(v => !Number.isFinite(v) || Math.abs(v) <= 0.5);
                  const verdict = !Number.isFinite(worst) ? '—'
                    : allSmall ? '✓ consistent'
                    : Math.abs(worst) <= 1 ? '✓ within ±1 dB'
                    : Math.abs(worst) <= 3 ? '~ moderate gap'
                    : '⚠ significant gap';
                  const verdictColor = verdict.startsWith('✓') ? '#4ade80' : verdict.startsWith('~') ? '#fbbf24' : verdict.startsWith('⚠') ? '#f87171' : '#6b7280';
                  return (
                    <tr key={step.label} style={{ borderBottom: '1px solid #1c1917' }}>
                      <td style={{ ...TD, textAlign: 'left', color: step.color, fontWeight: 600 }}>{step.label}</td>
                      {vals.map((v, i) => (
                        <td key={i} style={{ ...TD, color: errColor(v) }}>{fmtΔ(v)}</td>
                      ))}
                      <td style={{ ...TD, color: errColor(worst), fontWeight: 700 }}>{fmtΔ(worst)}</td>
                      <td style={{ ...TD, textAlign: 'left', color: verdictColor, fontWeight: 600 }}>{verdict}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Interpretation ── */}
          <div style={{ fontSize: 10, fontWeight: 700, color: '#a8a29e', ...MONO, marginBottom: 6 }}>
            Interpretation
          </div>
          <div style={{ marginBottom: 10 }}>
            {(() => {
              const lines = [];

              // Direct gap check
              const directGaps = traceData.map(d => {
                const eng   = mag2db(d.row?.directMagnitude);
                const ref   = d.row?.curveDb;
                const dist  = distM;
                if (!Number.isFinite(eng) || !Number.isFinite(ref) || !Number.isFinite(dist)) return null;
                return eng - (ref - 20 * Math.log10(dist));
              }).filter(Number.isFinite);
              const avgDirectGap = directGaps.length > 0 ? directGaps.reduce((a, b) => a + b, 0) / directGaps.length : null;

              if (Number.isFinite(avgDirectGap) && Math.abs(avgDirectGap) > 0.5) {
                lines.push({
                  color: '#f87171',
                  text: `Direct field gap: engine direct SPL averages ${fmtΔ(avgDirectGap)} dB vs arithmetic. ` +
                        `This is the primary suspect for missing energy — the engine applies distance law differently from pure SPL arithmetic.`,
                });
              } else if (Number.isFinite(avgDirectGap)) {
                lines.push({
                  color: '#4ade80',
                  text: `Direct field arithmetic matches engine within ±0.5 dB — direct path calculation is consistent.`,
                });
              }

              // Graph vs post-modal
              const pmGaps = traceData.map(d => {
                const pm = mag2db(d.row?.postModalMagnitude);
                if (!Number.isFinite(pm) || !Number.isFinite(d.graphSpl)) return null;
                return d.graphSpl - pm;
              }).filter(Number.isFinite);
              const avgPmGap = pmGaps.length > 0 ? pmGaps.reduce((a, b) => a + b, 0) / pmGaps.length : null;
              if (Number.isFinite(avgPmGap) && Math.abs(avgPmGap) > 0.3) {
                lines.push({
                  color: '#fb923c',
                  text: `Graph vs post-modal gap: ${fmtΔ(avgPmGap)} dB average. Post-modal magnitude and graph SPL differ — ` +
                        `check if graph path applies a multi-sub sum or additional processing after the single-sub engine output.`,
                });
              } else if (Number.isFinite(avgPmGap)) {
                lines.push({
                  color: '#4ade80',
                  text: `Graph SPL matches engine post-modal within ±0.3 dB — no hidden graph scaling detected.`,
                });
              }

              // REW benchmark gap
              const rewGaps = traceData.map(d => {
                const ref = REW_BENCHMARK[d.hz];
                if (!Number.isFinite(d.graphSpl) || !Number.isFinite(ref)) return null;
                return d.graphSpl - ref;
              }).filter(Number.isFinite);
              const avgRewGap = rewGaps.length > 0 ? rewGaps.reduce((a, b) => a + b, 0) / rewGaps.length : null;
              if (Number.isFinite(avgRewGap)) {
                lines.push({
                  color: avgRewGap < -2 ? '#f87171' : avgRewGap < 0 ? '#fbbf24' : '#4ade80',
                  text: `Average B44 vs REW gap: ${fmtΔ(avgRewGap)} dB across 70/80/85/90 Hz. ` +
                        (avgRewGap < -4 ? 'B44 is significantly below REW — consistent with known ~6 dB parity gap.'
                        : avgRewGap < -1 ? 'B44 is moderately below REW — residual parity gap present.'
                        : 'B44 is within ±1 dB of REW — good parity.'),
                });
              }

              // Arithmetic expectation vs graph
              const arithGaps = traceData.map(d => {
                const ref = d.row?.curveDb;
                const dist = distM;
                if (!Number.isFinite(ref) || !Number.isFinite(dist) || !Number.isFinite(d.graphSpl)) return null;
                const arith = ref - 20 * Math.log10(dist);
                return d.graphSpl - arith;
              }).filter(Number.isFinite);
              const avgArithGap = arithGaps.length > 0 ? arithGaps.reduce((a, b) => a + b, 0) / arithGaps.length : null;
              if (Number.isFinite(avgArithGap)) {
                lines.push({
                  color: '#a78bfa',
                  text: `Graph SPL vs pure arithmetic (no phase/modes): ${fmtΔ(avgArithGap)} dB average. ` +
                        `This represents the combined effect of modal resonances, phase cancellations, and reflections at these frequencies.`,
                });
              }

              if (lines.length === 0) {
                lines.push({ color: '#57534e', text: 'Insufficient data to generate interpretation — ensure seat, sub, and simulation are active.' });
              }

              return lines.map((line, i) => (
                <div key={i} style={{ marginBottom: 5, fontSize: 9, ...MONO, padding: '6px 10px', background: '#1c1917', borderRadius: 4, borderLeft: `3px solid ${line.color}`, color: line.color, lineHeight: 1.8 }}>
                  {line.text}
                </div>
              ));
            })()}
          </div>

          {/* ── Legend ── */}
          <div style={{ fontSize: 8, color: '#44403c', ...MONO, lineHeight: 1.9 }}>
            Δ colours: <span style={{ color: '#4ade80' }}>≤1 dB</span> · <span style={{ color: '#fbbf24' }}>≤3 dB</span> · <span style={{ color: '#fb923c' }}>≤6 dB</span> · <span style={{ color: '#f87171' }}>&gt;6 dB</span><br />
            Data: wholeCurveDebugRows from live engine run — refreshes on every sim change. REW benchmark fixed at production parity reference values.
          </div>
        </>
      )}
    </div>
  );
}