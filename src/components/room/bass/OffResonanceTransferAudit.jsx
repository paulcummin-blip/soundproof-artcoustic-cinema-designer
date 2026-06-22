/**
 * OffResonanceTransferAudit — Diagnostic only. Does not affect the live graph.
 *
 * For each combination of (target frequency × dominant mode), computes:
 *   - mode resonant frequency f0
 *   - evaluation frequency f
 *   - Δf = |f - f0|
 *   - Q value (derived from axialQ=3.2 and Sabine clamp)
 *   - |H(f)|   — transfer magnitude at the evaluation frequency
 *   - |H(f0)|  — peak transfer magnitude AT resonance
 *   - ratio    = |H(f)| / |H(f0)| (how strong the mode is off-resonance)
 *
 * Goal: determine whether dominant modes contribute too much energy at
 * frequencies far from resonance (ratio too high → bandwidth too wide).
 *
 * Uses room dimensions + surface absorption to compute Q via Sabine clamp.
 * No simulation engine call required — pure resonantTransfer() from modalCalculations.
 */

import React, { useMemo } from 'react';
import {
  computeRoomModesLocal,
  estimateModeQLocal,
  resonantTransfer,
} from '@/components/room/bass/core/modalCalculations';

const SPEED_OF_SOUND_MPS = 343;
const FIXED_AXIAL_Q = 4.0 * 0.8; // 3.2

const TARGET_FREQS = [70, 80, 85, 90];

// Dominant modes to audit — indices only; actual f0 derived from room dims
const AUDIT_MODES = [
  { nx: 2, ny: 0, nz: 0, label: '(2,0,0)' },
  { nx: 0, ny: 3, nz: 0, label: '(0,3,0)' },
  { nx: 2, ny: 2, nz: 0, label: '(2,2,0)' },
  { nx: 0, ny: 4, nz: 0, label: '(0,4,0)' },
];

// Expected theory: |H(f)| / |H(f0)| for a 2nd-order resonator evaluated Δf away.
// |H(f0)| = Q (at resonance the denominator reduces to imagDen = 1/Q → |H| = Q).
// |H(f)|  = 1 / sqrt((1-(f/f0)²)² + (f/(f0·Q))²).
// ratio   = |H(f)| / Q.
// For reference we also print the theoretical ratio.
function computeTheoryRatio(f, f0, Q) {
  if (!Number.isFinite(f) || !Number.isFinite(f0) || f0 <= 0) return null;
  const r = f / f0;
  const denom = Math.sqrt(Math.pow(1 - r * r, 2) + Math.pow(r / Q, 2));
  const Hf  = denom > 0 ? 1 / denom : null;
  const Hf0 = Q; // peak value at resonance for standard 2nd-order
  return (Hf != null && Hf0 > 0) ? Hf / Hf0 : null;
}

function ratioColor(ratio) {
  if (!Number.isFinite(ratio)) return '#6b7280';
  if (ratio >= 0.50) return '#f87171'; // strong off-resonance contribution
  if (ratio >= 0.20) return '#fb923c'; // moderate
  if (ratio >= 0.05) return '#fbbf24'; // low
  return '#4ade80';                    // negligible
}

function fmt(v, d = 3) { return Number.isFinite(v) ? v.toFixed(d) : '—'; }

const TH = {
  padding: '4px 7px', fontSize: 9, fontWeight: 700,
  background: '#1c1917', color: '#d6d3d1',
  textAlign: 'right', borderBottom: '2px solid #292524',
  whiteSpace: 'nowrap', fontFamily: 'monospace',
};
const TD = { padding: '3px 7px', fontSize: 9, fontFamily: 'monospace', textAlign: 'right' };

export default function OffResonanceTransferAudit({ roomDims, surfaceAbsorption }) {
  const hasRoom = !!(roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM);

  // Derive actual f0 for each audit mode from current room dimensions
  const modeData = useMemo(() => {
    if (!hasRoom) return null;
    const { widthM, lengthM, heightM } = roomDims;

    return AUDIT_MODES.map(({ nx, ny, nz, label }) => {
      const f0 = (SPEED_OF_SOUND_MPS / 2) * Math.sqrt(
        Math.pow(nx / widthM,  2) +
        Math.pow(ny / lengthM, 2) +
        Math.pow(nz / heightM, 2)
      );

      const activeAxes = (nx > 0 ? 1 : 0) + (ny > 0 ? 1 : 0) + (nz > 0 ? 1 : 0);
      const baseQ = activeAxes === 1 ? FIXED_AXIAL_Q : activeAxes === 2 ? 3.9 : 2.5;
      const absorptionQ = estimateModeQLocal({
        roomDims: { widthM, lengthM, heightM },
        surfaceAbsorption,
        f0,
      });
      const Q = Math.max(1, Math.min(baseQ, absorptionQ));

      // Peak transfer at resonance: evaluate at f = f0
      const peakTransfer = resonantTransfer(f0, f0, Q);
      const Hf0 = peakTransfer.transferMag;

      // Per target frequency
      const targets = TARGET_FREQS.map(f => {
        const deltaF = Math.abs(f - f0);
        const tf = resonantTransfer(f, f0, Q);
        const Hf = tf.transferMag;
        const ratio = Hf0 > 0 ? Hf / Hf0 : null;
        const theoryRatio = computeTheoryRatio(f, f0, Q);
        return { f, f0, deltaF, Q, Hf, Hf0, ratio, theoryRatio };
      });

      return { label, nx, ny, nz, f0, Q, Hf0, targets };
    });
  }, [roomDims, surfaceAbsorption, hasRoom]);

  return (
    <div style={{
      marginTop: 12, border: '1px solid #292524', borderRadius: 8,
      background: '#0c0a09', padding: '10px 12px',
    }}>
      {/* Header */}
      <div style={{ fontWeight: 700, color: '#d6d3d1', fontSize: 11, fontFamily: 'monospace', marginBottom: 3 }}>
        Off-Resonance Transfer Audit
        <span style={{ fontWeight: 400, color: '#44403c', marginLeft: 10, fontSize: 10 }}>
          diagnostic only · no simulation engine call
        </span>
      </div>

      <div style={{ fontSize: 9, color: '#57534e', fontFamily: 'monospace', marginBottom: 8, lineHeight: 1.7 }}>
        Computes |H(f)| / |H(f₀)| for each dominant mode at each target frequency using pure resonantTransfer().<br />
        High ratio at large Δf → bandwidth too wide (Q too high). Ratios matching theory → bandwidth correct.
      </div>

      {/* Q settings badge */}
      <div style={{
        display: 'inline-flex', gap: 10, flexWrap: 'wrap',
        padding: '4px 10px', borderRadius: 5, background: '#1c1917',
        marginBottom: 10, fontSize: 9, fontFamily: 'monospace', color: '#78716c',
      }}>
        <span>Axial Q base: <strong style={{ color: '#d6d3d1' }}>{FIXED_AXIAL_Q.toFixed(2)}</strong></span>
        <span>Tangential Q base: <strong style={{ color: '#d6d3d1' }}>3.90</strong></span>
        <span>Oblique Q base: <strong style={{ color: '#d6d3d1' }}>2.50</strong></span>
        <span>Final Q: <strong style={{ color: '#d6d3d1' }}>min(base, Sabine)</strong></span>
      </div>

      {!hasRoom && (
        <div style={{ fontSize: 10, color: '#fbbf24', fontFamily: 'monospace' }}>
          ⚠ Requires room dimensions to compute mode frequencies and Q values.
        </div>
      )}

      {modeData && modeData.map(mode => (
        <div key={mode.label} style={{ marginBottom: 14 }}>
          {/* Mode header */}
          <div style={{
            padding: '4px 8px', borderRadius: 4, marginBottom: 4,
            background: '#1c1917', borderLeft: '3px solid #78716c',
            fontFamily: 'monospace', fontSize: 10,
            display: 'flex', gap: 16, alignItems: 'center',
          }}>
            <span style={{ fontWeight: 700, color: '#e7e5e4' }}>{mode.label}</span>
            <span style={{ color: '#a8a29e' }}>f₀ = <strong style={{ color: '#fbbf24' }}>{fmt(mode.f0, 2)} Hz</strong></span>
            <span style={{ color: '#a8a29e' }}>Q = <strong style={{ color: '#e7e5e4' }}>{fmt(mode.Q, 3)}</strong></span>
            <span style={{ color: '#a8a29e' }}>|H(f₀)| = <strong style={{ color: '#e7e5e4' }}>{fmt(mode.Hf0, 4)}</strong></span>
          </div>

          {/* Per-frequency table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 640 }}>
              <thead>
                <tr>
                  <th style={{ ...TH, textAlign: 'right' }}>f (Hz)</th>
                  <th style={{ ...TH }}>f₀ (Hz)</th>
                  <th style={{ ...TH }}>Δf (Hz)</th>
                  <th style={{ ...TH }}>Q</th>
                  <th style={{ ...TH }}>|H(f)|</th>
                  <th style={{ ...TH }}>|H(f₀)|</th>
                  <th style={{ ...TH }}>ratio</th>
                  <th style={{ ...TH }}>theory ratio</th>
                  <th style={{ ...TH, textAlign: 'left' }}>assessment</th>
                </tr>
              </thead>
              <tbody>
                {mode.targets.map(row => {
                  const isAtResonance = row.deltaF < 0.5;
                  const assessment = isAtResonance
                    ? 'at resonance'
                    : !Number.isFinite(row.ratio)
                      ? '—'
                      : row.ratio >= 0.50 ? '⚠ strong off-res'
                      : row.ratio >= 0.20 ? 'moderate'
                      : row.ratio >= 0.05 ? 'low'
                      : 'negligible';
                  const assessmentColor = isAtResonance ? '#60a5fa'
                    : row.ratio >= 0.50 ? '#f87171'
                    : row.ratio >= 0.20 ? '#fb923c'
                    : row.ratio >= 0.05 ? '#fbbf24'
                    : '#4ade80';

                  return (
                    <tr key={row.f} style={{
                      borderBottom: '1px solid #1c1917',
                      background: isAtResonance ? '#172554' : undefined,
                    }}>
                      <td style={{ ...TD, fontWeight: 700, color: '#fbbf24' }}>{row.f}</td>
                      <td style={{ ...TD, color: '#a8a29e' }}>{fmt(row.f0, 2)}</td>
                      <td style={{ ...TD, color: '#d6d3d1' }}>{fmt(row.deltaF, 2)}</td>
                      <td style={{ ...TD, color: '#a8a29e' }}>{fmt(row.Q, 3)}</td>
                      <td style={{ ...TD, color: '#e7e5e4' }}>{fmt(row.Hf, 5)}</td>
                      <td style={{ ...TD, color: '#6b7280' }}>{fmt(row.Hf0, 5)}</td>
                      <td style={{ ...TD, fontWeight: 700, color: ratioColor(row.ratio) }}>
                        {row.ratio != null ? row.ratio.toFixed(4) : '—'}
                      </td>
                      <td style={{ ...TD, color: '#57534e' }}>
                        {row.theoryRatio != null ? row.theoryRatio.toFixed(4) : '—'}
                      </td>
                      <td style={{ ...TD, textAlign: 'left', color: assessmentColor, fontWeight: row.ratio >= 0.50 ? 700 : 400 }}>
                        {assessment}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* Legend */}
      {modeData && (
        <div style={{ marginTop: 6, fontSize: 9, fontFamily: 'monospace', color: '#44403c', lineHeight: 1.8, borderTop: '1px solid #1c1917', paddingTop: 6 }}>
          <strong style={{ color: '#78716c' }}>Ratio colour key:</strong>{' '}
          <span style={{ color: '#f87171' }}>≥ 0.50 strong</span> ·{' '}
          <span style={{ color: '#fb923c' }}>≥ 0.20 moderate</span> ·{' '}
          <span style={{ color: '#fbbf24' }}>≥ 0.05 low</span> ·{' '}
          <span style={{ color: '#4ade80' }}>&lt; 0.05 negligible</span><br />
          ratio = |H(f)| / |H(f₀)| — if ratio at large Δf is still high, the resonator Q is too wide for REW parity.<br />
          theory ratio column confirms the calculation matches standard 2nd-order resonator expectation.
        </div>
      )}
    </div>
  );
}