// RewCandidateComparisonPanel.jsx
// Temporary diagnostic panel — side-by-side comparison of:
//   Current REW Parity (axialQ = 8)   vs   REW Parity Candidate (axialQ = 4)
//
// Uses IDENTICAL engine path (simulateBassResponseRewCore), room, seat, sub,
// source curve, modal source mode, propagationPhaseScale, and modal mag scale.
// ONLY axialQ differs between the two columns.
//
// DO NOT promote to production. Remove after axialQ audit is concluded.

import React, { useMemo } from 'react';
import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';

// ─── Shared benchmark table ────────────────────────────────────────────────
// These are the exact REW targets used in the full benchmark audits.
const BENCHMARK_POINTS = [
  { hz: 20,  rewDb: 92.4  },
  { hz: 25,  rewDb: 93.6  },
  { hz: 30,  rewDb: 89.2  },
  { hz: 40,  rewDb: 86.0  },
  { hz: 50,  rewDb: 91.8  },
  { hz: 57,  rewDb: 104.1 },
  { hz: 60,  rewDb: 98.1  },
  { hz: 70,  rewDb: 86.8  },
  { hz: 80,  rewDb: 79.7  },
  { hz: 85,  rewDb: 90.8  },
  { hz: 100, rewDb: 98.3  },
  { hz: 120, rewDb: 92.1  },
  { hz: 150, rewDb: 94.3  },
  { hz: 180, rewDb: 99.3  },
  { hz: 200, rewDb: 99.5  },
];

// Interpolate SPL at a given frequency from a flat {frequency, spl}[] array
function interpolateSpl(series, targetHz) {
  if (!Array.isArray(series) || series.length === 0) return null;
  const sorted = [...series].sort((a, b) => a.frequency - b.frequency);
  if (targetHz <= sorted[0].frequency) return sorted[0].spl;
  if (targetHz >= sorted[sorted.length - 1].frequency) return sorted[sorted.length - 1].spl;
  for (let i = 0; i < sorted.length - 1; i++) {
    const p1 = sorted[i], p2 = sorted[i + 1];
    if (!Number.isFinite(p1.spl) || !Number.isFinite(p2.spl)) continue;
    if (targetHz >= p1.frequency && targetHz <= p2.frequency) {
      const t = (targetHz - p1.frequency) / (p2.frequency - p1.frequency);
      return p1.spl + (p2.spl - p1.spl) * t;
    }
  }
  return null;
}

// Run one simulation and return {frequency, spl}[]
function runSim(roomDims, seat, sub, sourceCurve, options) {
  try {
    const result = simulateBassResponseRewCore(
      { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM },
      { x: seat.x, y: seat.y, z: Number.isFinite(Number(seat.z)) ? Number(seat.z) : 1.2 },
      sub,
      sourceCurve,
      options
    );
    if (!result?.freqsHz || !result?.complexPressure) return null;
    const raw = result.freqsHz.map((hz, i) => {
      const cp = result.complexPressure[i];
      const mag = Math.sqrt(cp.re * cp.re + cp.im * cp.im);
      return { frequency: hz, spl: 20 * Math.log10(Math.max(mag, 1e-10)) };
    });
    return raw.filter(p => Number.isFinite(p.frequency) && Number.isFinite(p.spl));
  } catch (e) {
    return null;
  }
}

// Build metrics from a series against the benchmark table
function buildMetrics(series) {
  const rows = BENCHMARK_POINTS.map(({ hz, rewDb }) => {
    const b44 = interpolateSpl(series, hz);
    const error = Number.isFinite(b44) ? b44 - rewDb : null;
    return { hz, rewDb, b44, error };
  });
  const errors = rows.map(r => r.error).filter(Number.isFinite);
  const mae = errors.length > 0 ? errors.reduce((s, e) => s + Math.abs(e), 0) / errors.length : null;
  const worstAbs = errors.length > 0 ? Math.max(...errors.map(Math.abs)) : null;
  return { rows, mae, worstAbs };
}

// ─── Formatting helpers ────────────────────────────────────────────────────
const fmtDb = (v) => (Number.isFinite(v) ? (v >= 0 ? '+' : '') + v.toFixed(2) + ' dB' : '—');
const fmtAbsDb = (v) => (Number.isFinite(v) ? v.toFixed(2) + ' dB' : '—');
const fmtB44 = (v) => (Number.isFinite(v) ? v.toFixed(2) + ' dB' : '—');
const errColor = (e) => {
  if (!Number.isFinite(e)) return '#6b7280';
  const abs = Math.abs(e);
  if (abs <= 1.5) return '#065f46';
  if (abs <= 3.5) return '#92400e';
  return '#dc2626';
};

// ─── Main component ────────────────────────────────────────────────────────
export default function RewCandidateComparisonPanel({
  roomDims,
  seat,                 // first selected seat object
  sub,                  // first sub from subsForSimulation
  sourceCurve,          // REW_SOURCE_CURVES[rewSourceCurveMode]
  // shared engine options (passed through unchanged for both runs)
  modalSourceReferenceMode,
  modalGainScalar,
  propagationPhaseScale,
  surfaceAbsorption,
  enableRewCoreReflections,
  rewParityModalMagnitudeScale,
  debugModalPhaseConvention,
  debugModalHSign,
}) {
  const canRun =
    roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM &&
    seat && sub && Array.isArray(sourceCurve) && sourceCurve.length > 0;

  // Build the shared engine options that are IDENTICAL across both runs.
  // These mirror the production path in BassResponse.jsx for flat_rew_reference.
  const sharedOptions = useMemo(() => ({
    enableReflections: false,           // REW parity: flat_rew_reference + full_field → no reflections
    enableModes: true,
    surfaceAbsorption: surfaceAbsorption ?? { front: 0.3, back: 0.3, left: 0.3, right: 0.3, ceiling: 0.3, floor: 0.3 },
    freqMinHz: 20,
    freqMaxHz: 200,
    smoothing: 'none',
    modalSourceReferenceMode: modalSourceReferenceMode ?? 'room_volume',
    modalGainScalar: Number.isFinite(modalGainScalar) ? modalGainScalar : 1.0,
    propagationPhaseScale: Number.isFinite(propagationPhaseScale) ? propagationPhaseScale : 0,
    pureDeterministicModalSum: true,    // forced true for flat_rew_reference
    disableModalPropagationPhase: true, // forced true for flat_rew_reference
    debugInvertModalVector: false,      // matches current BassResponse REW parity path (debugInvertModalVector set to false)
    debugModalPhaseConvention: debugModalPhaseConvention ?? 'normal',
    debugModalHSign: debugModalHSign ?? 'normal',
    disableReflectionPhaseJitter: false,
    disableReflectionCoherenceWeight: false,
    disableLateField: true,             // matches flat_rew_reference + full_field path
    rewParityModalMagnitudeScale: Number.isFinite(rewParityModalMagnitudeScale) ? rewParityModalMagnitudeScale : 1.0,
    debugReflectionOrder: 1,
    mute68HzAxialMode: false,
    overrideConstantAxialQ: false,
    overrideAbsorptionAxialQ: false,
    debugMode200Multiplier: 1.0,
  }), [
    JSON.stringify(surfaceAbsorption), modalSourceReferenceMode, modalGainScalar,
    propagationPhaseScale, debugModalPhaseConvention, debugModalHSign, rewParityModalMagnitudeScale,
  ]);

  // Run Current (axialQ = 8)
  const currentMetrics = useMemo(() => {
    if (!canRun) return null;
    const series = runSim(roomDims, seat, sub, sourceCurve, { ...sharedOptions, axialQ: 8.0 });
    if (!series) return null;
    return buildMetrics(series);
  }, [canRun, roomDims, seat?.x, seat?.y, seat?.z, sub?.x, sub?.y, sub?.z, JSON.stringify(sourceCurve), JSON.stringify(sharedOptions)]);

  // Run Candidate (axialQ = 4)
  const candidateMetrics = useMemo(() => {
    if (!canRun) return null;
    const series = runSim(roomDims, seat, sub, sourceCurve, { ...sharedOptions, axialQ: 4.0 });
    if (!series) return null;
    return buildMetrics(series);
  }, [canRun, roomDims, seat?.x, seat?.y, seat?.z, sub?.x, sub?.y, sub?.z, JSON.stringify(sourceCurve), JSON.stringify(sharedOptions)]);

  const thStyle = {
    padding: '3px 7px', fontSize: 10, fontWeight: 700, fontFamily: 'monospace',
    textAlign: 'right', background: '#f1f5f9', borderBottom: '2px solid #cbd5e1',
  };
  const thLeftStyle = { ...thStyle, textAlign: 'left' };
  const tdStyle = { padding: '2px 7px', fontSize: 10, fontFamily: 'monospace', textAlign: 'right', borderBottom: '1px solid #e2e8f0' };
  const tdLeftStyle = { ...tdStyle, textAlign: 'left', fontWeight: 700, color: '#334155' };

  if (!canRun) {
    return (
      <div style={{ fontSize: 10, color: '#6b7280', fontFamily: 'monospace', padding: 8 }}>
        Candidate comparison unavailable — requires room, seat, and sub data.
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'monospace', width: '100%' }}>
      <div style={{ fontWeight: 700, fontSize: 11, color: '#1e293b', marginBottom: 6 }}>
        Side-by-Side: Current REW Parity (Q=8) vs Candidate (Q=4)
      </div>
      <div style={{ fontSize: 9, color: '#64748b', marginBottom: 8, fontStyle: 'italic' }}>
        Both runs: same engine path, same room, seat, sub, source curve, modal source, propagation phase.
        Only <strong>axialQ</strong> differs. Reflections suppressed (REW parity flat_rew_reference mode).
      </div>

      {/* Summary row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
        {[
          { label: 'Current REW Parity', axialQ: 8, metrics: currentMetrics, bg: '#f8fafc', border: '#94a3b8' },
          { label: 'REW Parity Candidate', axialQ: 4, metrics: candidateMetrics, bg: '#f0fdf4', border: '#86efac' },
        ].map(({ label, axialQ, metrics, bg, border }) => (
          <div key={axialQ} style={{ border: `1px solid ${border}`, borderRadius: 6, background: bg, padding: '8px 10px' }}>
            <div style={{ fontWeight: 700, fontSize: 11, color: '#1e293b', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 10, color: '#475569', marginBottom: 2 }}>Axial Q: <strong>{axialQ}.0</strong></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#0f172a' }}>
                MAE: {Number.isFinite(metrics?.mae) ? metrics.mae.toFixed(2) + ' dB' : '—'}
              </div>
              <div style={{ fontSize: 10, color: '#64748b' }}>
                Worst: {fmtAbsDb(metrics?.worstAbs)}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* MAE delta callout */}
      {Number.isFinite(currentMetrics?.mae) && Number.isFinite(candidateMetrics?.mae) && (() => {
        const delta = currentMetrics.mae - candidateMetrics.mae;
        const improved = delta > 0;
        return (
          <div style={{
            padding: '6px 10px', borderRadius: 6, marginBottom: 10,
            background: improved ? '#dcfce7' : '#fef9c3',
            border: `1px solid ${improved ? '#86efac' : '#fde68a'}`,
            fontSize: 11, fontWeight: 700,
            color: improved ? '#166534' : '#92400e',
          }}>
            {improved
              ? `✓ Candidate Q=4 reduces MAE by ${delta.toFixed(2)} dB (${currentMetrics.mae.toFixed(2)} → ${candidateMetrics.mae.toFixed(2)})`
              : `⚠ Candidate Q=4 increases MAE by ${Math.abs(delta).toFixed(2)} dB`}
          </div>
        );
      })()}

      {/* Full benchmark table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 580 }}>
          <thead>
            <tr>
              <th style={thLeftStyle}>Hz</th>
              <th style={thStyle}>REW target</th>
              <th style={{ ...thStyle, background: '#f1f5f9', borderLeft: '2px solid #94a3b8' }}>B44 (Q=8)</th>
              <th style={{ ...thStyle, background: '#f1f5f9' }}>Δ (Q=8)</th>
              <th style={{ ...thStyle, background: '#f0fdf4', borderLeft: '2px solid #86efac' }}>B44 (Q=4)</th>
              <th style={{ ...thStyle, background: '#f0fdf4' }}>Δ (Q=4)</th>
              <th style={{ ...thStyle, background: '#fff', borderLeft: '1px solid #e2e8f0' }}>Better</th>
            </tr>
          </thead>
          <tbody>
            {BENCHMARK_POINTS.map(({ hz, rewDb }) => {
              const row8 = currentMetrics?.rows.find(r => r.hz === hz);
              const row4 = candidateMetrics?.rows.find(r => r.hz === hz);
              const err8 = row8?.error ?? null;
              const err4 = row4?.error ?? null;
              const better = Number.isFinite(err8) && Number.isFinite(err4)
                ? (Math.abs(err4) < Math.abs(err8) ? 'Q=4' : Math.abs(err8) < Math.abs(err4) ? 'Q=8' : '—')
                : '—';
              const betterColor = better === 'Q=4' ? '#166534' : better === 'Q=8' ? '#1e40af' : '#6b7280';

              // Highlight focal frequencies
              const isFocal = hz === 57 || hz === 60;
              const rowBg = isFocal ? '#fefce8' : undefined;

              return (
                <tr key={hz} style={{ background: rowBg, borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ ...tdLeftStyle, background: rowBg, fontWeight: isFocal ? 900 : 700 }}>
                    {hz} Hz{isFocal ? ' ⬅' : ''}
                  </td>
                  <td style={{ ...tdStyle, background: rowBg, color: '#6b7280' }}>{rewDb.toFixed(1)}</td>

                  {/* Q=8 column */}
                  <td style={{ ...tdStyle, background: rowBg, borderLeft: '2px solid #cbd5e1' }}>
                    {fmtB44(row8?.b44)}
                  </td>
                  <td style={{ ...tdStyle, background: rowBg, color: errColor(err8), fontWeight: isFocal ? 700 : 400 }}>
                    {fmtDb(err8)}
                  </td>

                  {/* Q=4 column */}
                  <td style={{ ...tdStyle, background: rowBg, borderLeft: '2px solid #86efac' }}>
                    {fmtB44(row4?.b44)}
                  </td>
                  <td style={{ ...tdStyle, background: rowBg, color: errColor(err4), fontWeight: isFocal ? 700 : 400 }}>
                    {fmtDb(err4)}
                  </td>

                  {/* Winner */}
                  <td style={{ ...tdStyle, background: rowBg, color: betterColor, fontWeight: 700, borderLeft: '1px solid #e2e8f0', textAlign: 'center' }}>
                    {better}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid #cbd5e1', background: '#f8fafc' }}>
              <td style={{ ...tdLeftStyle, fontWeight: 900 }}>MAE</td>
              <td style={tdStyle}>—</td>
              <td style={{ ...tdStyle, borderLeft: '2px solid #cbd5e1', fontWeight: 900, color: '#0f172a' }}>
                {Number.isFinite(currentMetrics?.mae) ? currentMetrics.mae.toFixed(2) + ' dB' : '—'}
              </td>
              <td style={tdStyle} />
              <td style={{ ...tdStyle, borderLeft: '2px solid #86efac', fontWeight: 900, color: '#0f172a' }}>
                {Number.isFinite(candidateMetrics?.mae) ? candidateMetrics.mae.toFixed(2) + ' dB' : '—'}
              </td>
              <td style={tdStyle} />
              <td style={{ ...tdStyle, borderLeft: '1px solid #e2e8f0', fontWeight: 900, textAlign: 'center',
                color: Number.isFinite(currentMetrics?.mae) && Number.isFinite(candidateMetrics?.mae)
                  ? (candidateMetrics.mae < currentMetrics.mae ? '#166534' : '#1e40af')
                  : '#6b7280'
              }}>
                {Number.isFinite(currentMetrics?.mae) && Number.isFinite(candidateMetrics?.mae)
                  ? (candidateMetrics.mae < currentMetrics.mae ? 'Q=4' : 'Q=8')
                  : '—'}
              </td>
            </tr>
            <tr style={{ background: '#f8fafc' }}>
              <td style={{ ...tdLeftStyle }}>Worst |Δ|</td>
              <td style={tdStyle}>—</td>
              <td style={{ ...tdStyle, borderLeft: '2px solid #cbd5e1', fontWeight: 700 }}>
                {fmtAbsDb(currentMetrics?.worstAbs)}
              </td>
              <td style={tdStyle} />
              <td style={{ ...tdStyle, borderLeft: '2px solid #86efac', fontWeight: 700 }}>
                {fmtAbsDb(candidateMetrics?.worstAbs)}
              </td>
              <td style={tdStyle} />
              <td style={{ ...tdStyle, borderLeft: '1px solid #e2e8f0', fontWeight: 700, textAlign: 'center',
                color: Number.isFinite(currentMetrics?.worstAbs) && Number.isFinite(candidateMetrics?.worstAbs)
                  ? (candidateMetrics.worstAbs < currentMetrics.worstAbs ? '#166534' : '#1e40af')
                  : '#6b7280'
              }}>
                {Number.isFinite(currentMetrics?.worstAbs) && Number.isFinite(candidateMetrics?.worstAbs)
                  ? (candidateMetrics.worstAbs < currentMetrics.worstAbs ? 'Q=4' : 'Q=8')
                  : '—'}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div style={{ marginTop: 6, fontSize: 9, color: '#94a3b8', fontStyle: 'italic' }}>
        ⬅ Focal frequencies (57 Hz, 60 Hz) highlighted in yellow.
        Engine: simulateBassResponseRewCore · source: flat_rew_reference · reflections: OFF · modes: ON
      </div>
    </div>
  );
}