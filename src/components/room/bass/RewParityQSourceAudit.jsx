// RewParityQSourceAudit.jsx
// Diagnostic only. Audits Q source values for top contributing modes at benchmark frequencies.
// Does NOT modify the engine, production Q calculation, or any active simulation results.

import React, { useMemo, useState } from 'react';

const C = 343;
const BASE_Q = { axial: 8.0, tangential: 6.0, oblique: 4.5 };

// These are the Family-Q sweep winning scales (from RewParityFamilyQSweep best result).
// Represents "what the sweep consistently prefers" — used to derive parity preferred Q.
const PARITY_PREFERRED_SCALES = { axial: 0.50, tangential: 0.65, oblique: 0.75 };

const AUDIT_FREQS = [57, 60, 80, 120, 180, 200];

// ── Pure helpers (self-contained, no engine import) ──────────────────────────

function modeTypeOf(nx, ny, nz) {
  const axes = (nx > 0 ? 1 : 0) + (ny > 0 ? 1 : 0) + (nz > 0 ? 1 : 0);
  return axes === 1 ? 'axial' : axes === 2 ? 'tangential' : 'oblique';
}

function buildModes(W, L, H, fMax) {
  const modes = [];
  const nMax = Math.ceil((fMax / C) * 2 * Math.max(W, L, H)) + 5;
  for (let nx = 0; nx <= nMax; nx++) {
    for (let ny = 0; ny <= nMax; ny++) {
      for (let nz = 0; nz <= nMax; nz++) {
        if (nx === 0 && ny === 0 && nz === 0) continue;
        const freq = (C / 2) * Math.sqrt((nx / W) ** 2 + (ny / L) ** 2 + (nz / H) ** 2);
        if (!Number.isFinite(freq) || freq <= 0 || freq > fMax) continue;
        modes.push({ nx, ny, nz, freq, type: modeTypeOf(nx, ny, nz) });
      }
    }
  }
  return modes.sort((a, b) => a.freq - b.freq);
}

function sabineQ(f0, W, L, H, sa) {
  const V = W * L * H;
  const A =
    (L * W) * ((sa?.floor    ?? 0.3) + (sa?.ceiling ?? 0.3)) +
    (W * H) * ((sa?.front    ?? 0.3) + (sa?.back    ?? 0.3)) +
    (L * H) * ((sa?.left     ?? 0.3) + (sa?.right   ?? 0.3));
  const rt60 = 0.161 * V / Math.max(A, 1e-6);
  return Math.max(1, Math.min(80, (2 * Math.PI * f0 * rt60) / 13.815));
}

function absorptionQ(f0, W, L, H, sa) {
  // The absorption coefficient averaged across all surfaces drives RT60.
  // Return RT60 and derived Q separately for display.
  const V = W * L * H;
  const A =
    (L * W) * ((sa?.floor    ?? 0.3) + (sa?.ceiling ?? 0.3)) +
    (W * H) * ((sa?.front    ?? 0.3) + (sa?.back    ?? 0.3)) +
    (L * H) * ((sa?.left     ?? 0.3) + (sa?.right   ?? 0.3));
  const rt60 = 0.161 * V / Math.max(A, 1e-6);
  const q    = (2 * Math.PI * f0 * rt60) / 13.815;
  return { rt60, q };
}

function cosShape(n, pos, dim) {
  return n > 0 ? Math.cos(n * Math.PI * pos / Math.max(dim, 1e-6)) : 1;
}

// Returns relative coupling magnitude for mode at a given seat+sub position.
function modeCoupling(mode, sx, sy, sz, rx, ry, rz, W, L, H) {
  const src = cosShape(mode.nx, sx, W) * cosShape(mode.ny, sy, L) * cosShape(mode.nz, sz, H);
  const rcv = cosShape(mode.nx, rx, W) * cosShape(mode.ny, ry, L) * cosShape(mode.nz, rz, H);
  return Math.abs(src * rcv);
}

function fmt(v, d = 2) { return Number.isFinite(v) ? v.toFixed(d) : '—'; }
function fmtPct(v) { return Number.isFinite(v) ? (v >= 0 ? '+' : '') + v.toFixed(1) + '%' : '—'; }

// ── Styles ────────────────────────────────────────────────────────────────────

const TH = {
  textAlign: 'right', padding: '3px 5px', fontSize: 8, fontWeight: 700,
  background: '#faf5ff', borderBottom: '2px solid #d8b4fe', color: '#581c87',
  whiteSpace: 'nowrap',
};
const TD = { textAlign: 'right', padding: '2px 5px', fontSize: 8, fontFamily: 'monospace' };

// ── Component ─────────────────────────────────────────────────────────────────

export default function RewParityQSourceAudit({ roomDims, seat, sub, surfaceAbsorption, activeSettings }) {
  const [selectedFreq, setSelectedFreq] = useState(57);

  const canRun = !!(
    roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM &&
    seat?.x != null && seat?.y != null &&
    sub?.x != null && sub?.y != null
  );

  // ── Derived audit data ────────────────────────────────────────────────────
  const audit = useMemo(() => {
    if (!canRun) return null;

    const W  = Number(roomDims.widthM);
    const L  = Number(roomDims.lengthM);
    const H  = Number(roomDims.heightM);
    const sx = Number(sub.x);
    const sy = Number(sub.y);
    const sz = Number.isFinite(Number(sub.z)) ? Number(sub.z) : 0.35;
    const rx = Number(seat.x);
    const ry = Number(seat.y);
    const rz = Number.isFinite(Number(seat.z)) ? Number(seat.z) : 1.2;
    const sa = surfaceAbsorption ?? {};
    const axialQOverride = activeSettings?.axialQ ?? BASE_Q.axial;

    const allModes = buildModes(W, L, H, 210);

    // For each audit frequency, find top-10 contributing modes (by coupling magnitude)
    const byFreq = {};
    for (const targetHz of AUDIT_FREQS) {
      // Score each mode by transfer-function magnitude × coupling at this frequency
      const scored = allModes.map(m => {
        const engineBaseQ  = m.type === 'axial' ? axialQOverride : BASE_Q[m.type] ?? 4.5;
        const sQ           = sabineQ(m.freq, W, L, H, sa);
        const finalQ       = Math.max(1, Math.min(engineBaseQ, sQ));
        const coupling     = modeCoupling(m, sx, sy, sz, rx, ry, rz, W, L, H);

        // Transfer function magnitude at targetHz
        const ratio        = targetHz / Math.max(m.freq, 1e-6);
        const rr           = 1 - ratio * ratio;
        const ri           = targetHz / (finalQ * Math.max(m.freq, 1e-6));
        const denom        = rr * rr + ri * ri;
        const tfMag        = 1 / Math.sqrt(Math.max(denom, 1e-20));

        const contribution = coupling * tfMag;

        const { rt60, q: absQRaw } = absorptionQ(m.freq, W, L, H, sa);
        const absQ = Math.max(1, Math.min(80, absQRaw));

        const parityPreferredQ = Math.max(0.5, finalQ * (PARITY_PREFERRED_SCALES[m.type] ?? 1.0));
        const zeta             = 1 / (2 * Math.max(finalQ, 1e-6));
        const bw               = m.freq / Math.max(finalQ, 1e-6);
        const parityBw         = m.freq / Math.max(parityPreferredQ, 1e-6);
        const modeOrder        = m.nx + m.ny + m.nz;

        return {
          ...m,
          engineBaseQ,
          sabineQ: sQ,
          absQ,
          finalQ,
          parityPreferredQ,
          zeta,
          bw,
          parityBw,
          coupling,
          tfMag,
          contribution,
          rt60,
          modeOrder,
        };
      });

      scored.sort((a, b) => b.contribution - a.contribution);
      const top10 = scored.slice(0, 10);

      // Summary metrics across top-10
      const avg = (arr) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
      const avgEngineQ   = avg(top10.map(m => m.engineBaseQ));
      const avgSabineQ   = avg(top10.map(m => m.sabineQ));
      const avgFinalQ    = avg(top10.map(m => m.finalQ));
      const avgBw        = avg(top10.map(m => m.bw));
      const avgParityQ   = avg(top10.map(m => m.parityPreferredQ));
      const avgParityBw  = avg(top10.map(m => m.parityBw));

      byFreq[targetHz] = { top10, avgEngineQ, avgSabineQ, avgFinalQ, avgBw, avgParityQ, avgParityBw };
    }

    return byFreq;
  }, [canRun, roomDims, seat, sub, surfaceAbsorption, activeSettings]);

  const freqData = audit?.[selectedFreq] ?? null;

  // ── Q source root-cause analysis (across all audit freqs) ─────────────────
  const rootCauseAnalysis = useMemo(() => {
    if (!audit) return null;
    const items = AUDIT_FREQS.map(hz => {
      const d = audit[hz];
      if (!d || !d.top10.length) return null;
      const representative = d.top10[0];
      const sabineLimitingCount = d.top10.filter(m => m.sabineQ < m.engineBaseQ).length;
      const engineLimitingCount = d.top10.length - sabineLimitingCount;
      return {
        hz,
        avgFinalQ: d.avgFinalQ,
        avgSabineQ: d.avgSabineQ,
        avgEngineQ: d.avgEngineQ,
        avgParityQ: d.avgParityQ,
        sabineIsLimiting: sabineLimitingCount > engineLimitingCount,
        sabineLimitingCount,
        engineLimitingCount,
        rt60: representative.rt60,
        scaleFactor: d.avgParityQ / Math.max(d.avgFinalQ, 1e-6),
        diffPct: ((d.avgParityQ - d.avgFinalQ) / Math.max(d.avgFinalQ, 1e-6)) * 100,
      };
    }).filter(Boolean);

    return items;
  }, [audit]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ marginTop: 14, borderTop: '1px solid #d8b4fe', paddingTop: 10 }}>
      <div style={{ fontWeight: 700, color: '#581c87', fontSize: 11, fontFamily: 'monospace', marginBottom: 4 }}>
        REW Parity Q Source Audit
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          diagnostic only · no engine changes
        </span>
      </div>
      <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#6b7280', marginBottom: 8 }}>
        Audits engine Q vs Sabine Q vs absorption Q for top-10 contributing modes at benchmark frequencies.
        Identifies whether parity sweep preference stems from Sabine estimate, absorption clamp, Q logic, RT60, or bandwidth definition.
      </div>

      {!canRun && (
        <div style={{ fontSize: 10, color: '#b45309', fontFamily: 'monospace', marginBottom: 6 }}>
          ⚠ Need room dims, valid seat, and valid sub to display.
        </div>
      )}

      {canRun && audit && (
        <>
          {/* ── Frequency selector ── */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            {AUDIT_FREQS.map(hz => (
              <button
                key={hz}
                onClick={() => setSelectedFreq(hz)}
                style={{
                  height: 24, padding: '0 10px', borderRadius: 5,
                  border: `1px solid ${selectedFreq === hz ? '#7c3aed' : '#d8b4fe'}`,
                  background: selectedFreq === hz ? '#7c3aed' : '#faf5ff',
                  color: selectedFreq === hz ? '#fff' : '#581c87',
                  fontSize: 10, fontFamily: 'monospace', cursor: 'pointer', fontWeight: 600,
                }}
              >
                {hz} Hz
              </button>
            ))}
          </div>

          {/* ── Top-10 mode table ── */}
          {freqData && (
            <>
              <div style={{ fontWeight: 700, color: '#581c87', fontSize: 10, fontFamily: 'monospace', marginBottom: 4 }}>
                Top 10 contributing modes at {selectedFreq} Hz
              </div>
              <div style={{ overflowX: 'auto', marginBottom: 10 }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 880 }}>
                  <thead>
                    <tr>
                      <th style={{ ...TH, textAlign: 'left' }}>Mode (nx,ny,nz)</th>
                      <th style={{ ...TH, textAlign: 'left' }}>Family</th>
                      <th style={TH}>f₀ Hz</th>
                      <th style={TH}>Engine Q</th>
                      <th style={TH}>Sabine Q</th>
                      <th style={TH}>Absorption Q</th>
                      <th style={TH}>Final Q</th>
                      <th style={TH}>Parity Q</th>
                      <th style={TH}>ζ (zeta)</th>
                      <th style={TH}>Δf (BW)</th>
                      <th style={TH}>Coupling</th>
                      <th style={{ ...TH, textAlign: 'left' }}>Limiting factor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {freqData.top10.map((m, i) => {
                      const sabineIsLimiting = m.sabineQ < m.engineBaseQ;
                      const limitLabel = sabineIsLimiting ? 'Sabine' : 'Engine base Q';
                      const limitColor = sabineIsLimiting ? '#7c3aed' : '#0369a1';
                      const isBest     = i === 0;
                      return (
                        <tr key={i} style={{
                          borderBottom: '1px solid #f3e8ff',
                          background: isBest ? '#faf5ff' : undefined,
                        }}>
                          <td style={{ ...TD, textAlign: 'left', fontWeight: isBest ? 700 : 400, color: '#374151' }}>
                            ({m.nx},{m.ny},{m.nz})
                          </td>
                          <td style={{ ...TD, textAlign: 'left', color: m.type === 'axial' ? '#b45309' : m.type === 'tangential' ? '#0369a1' : '#374151', fontWeight: 600 }}>
                            {m.type}
                          </td>
                          <td style={{ ...TD, fontWeight: 600, color: '#374151' }}>{fmt(m.freq, 1)}</td>
                          <td style={{ ...TD, color: '#0369a1' }}>{fmt(m.engineBaseQ, 1)}</td>
                          <td style={{ ...TD, color: '#7c3aed' }}>{fmt(m.sabineQ, 2)}</td>
                          <td style={{ ...TD, color: '#581c87' }}>{fmt(m.absQ, 2)}</td>
                          <td style={{ ...TD, fontWeight: 700, color: '#14532d' }}>{fmt(m.finalQ, 2)}</td>
                          <td style={{ ...TD, color: '#dc2626' }}>{fmt(m.parityPreferredQ, 2)}</td>
                          <td style={{ ...TD, color: '#374151' }}>{fmt(m.zeta, 4)}</td>
                          <td style={{ ...TD, color: '#374151' }}>{fmt(m.bw, 2)} Hz</td>
                          <td style={{ ...TD, color: '#6b7280' }}>{fmt(m.coupling, 3)}</td>
                          <td style={{ ...TD, textAlign: 'left', color: limitColor, fontWeight: 600 }}>
                            {limitLabel}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* ── Summary cards ── */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 10 }}>
                {[
                  { label: 'Avg Engine Q',        value: fmt(freqData.avgEngineQ, 2),   note: 'BASE_Q before Sabine clamp' },
                  { label: 'Avg Sabine Q',         value: fmt(freqData.avgSabineQ, 2),   note: 'from RT60 estimate' },
                  { label: 'Avg Final Q',          value: fmt(freqData.avgFinalQ, 2),    note: 'min(engine, sabine)' },
                  { label: 'Avg Δf (bandwidth)',   value: fmt(freqData.avgBw, 2) + ' Hz', note: 'f₀ / Final Q' },
                  { label: 'Avg Parity Q',         value: fmt(freqData.avgParityQ, 2),   note: 'sweep preferred target' },
                  { label: 'Avg Parity Δf',        value: fmt(freqData.avgParityBw, 2) + ' Hz', note: 'f₀ / Parity Q' },
                  { label: 'Q difference',
                    value: fmtPct(((freqData.avgParityQ - freqData.avgFinalQ) / Math.max(freqData.avgFinalQ, 1e-6)) * 100),
                    note: 'parity Q vs final Q' },
                  { label: 'Required scale',
                    value: fmt(freqData.avgParityQ / Math.max(freqData.avgFinalQ, 1e-6), 3) + '×',
                    note: 'to reach parity preferred Q' },
                ].map(({ label, value, note }) => (
                  <div key={label} style={{ background: '#fff', border: '1px solid #e9d5ff', borderRadius: 6, padding: '6px 10px' }}>
                    <div style={{ fontSize: 8, color: '#6b7280', fontFamily: 'monospace' }}>{label}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#581c87', fontFamily: 'monospace', wordBreak: 'break-word' }}>{value}</div>
                    {note && <div style={{ fontSize: 8, color: '#9ca3af', fontFamily: 'monospace', marginTop: 2 }}>{note}</div>}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── Root cause analysis across all freqs ── */}
          {rootCauseAnalysis && (
            <div style={{ marginTop: 12, borderTop: '1px dashed #d8b4fe', paddingTop: 8 }}>
              <div style={{ fontWeight: 700, color: '#581c87', fontSize: 10, fontFamily: 'monospace', marginBottom: 6 }}>
                Q Source Root Cause — All Benchmark Frequencies
              </div>
              <div style={{ overflowX: 'auto', marginBottom: 10 }}>
                <table style={{ borderCollapse: 'collapse', minWidth: 720 }}>
                  <thead>
                    <tr>
                      {[
                        ['right', 'Hz'],
                        ['right', 'RT60 (s)'],
                        ['right', 'Avg Sabine Q'],
                        ['right', 'Avg Engine Q'],
                        ['right', 'Avg Final Q'],
                        ['right', 'Avg Parity Q'],
                        ['right', 'Diff %'],
                        ['right', 'Scale ×'],
                        ['left',  'Sabine limiting?'],
                      ].map(([a, l]) => (
                        <th key={l} style={{ ...TH, textAlign: a }}>{l}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rootCauseAnalysis.map((row, i) => {
                      const scaleTooHigh = row.scaleFactor < 0.75;
                      return (
                        <tr key={row.hz} style={{
                          borderBottom: '1px solid #f3e8ff',
                          background: row.hz === selectedFreq ? '#faf5ff' : undefined,
                        }}>
                          <td style={{ ...TD, fontWeight: 700, color: '#581c87' }}>{row.hz}</td>
                          <td style={{ ...TD, color: '#374151' }}>{fmt(row.rt60, 3)}</td>
                          <td style={{ ...TD, color: '#7c3aed' }}>{fmt(row.avgSabineQ, 2)}</td>
                          <td style={{ ...TD, color: '#0369a1' }}>{fmt(row.avgEngineQ, 2)}</td>
                          <td style={{ ...TD, fontWeight: 700, color: '#14532d' }}>{fmt(row.avgFinalQ, 2)}</td>
                          <td style={{ ...TD, color: '#dc2626', fontWeight: 700 }}>{fmt(row.avgParityQ, 2)}</td>
                          <td style={{ ...TD, fontWeight: 700, color: scaleTooHigh ? '#dc2626' : '#15803d' }}>
                            {fmtPct(row.diffPct)}
                          </td>
                          <td style={{ ...TD, fontWeight: 700, color: scaleTooHigh ? '#dc2626' : '#374151' }}>
                            {fmt(row.scaleFactor, 3)}
                          </td>
                          <td style={{ ...TD, textAlign: 'left', color: row.sabineIsLimiting ? '#7c3aed' : '#0369a1', fontWeight: 600 }}>
                            {row.sabineIsLimiting
                              ? `✓ Sabine (${row.sabineLimitingCount}/${row.engineLimitingCount + row.sabineLimitingCount} modes)`
                              : `Engine base Q (${row.engineLimitingCount}/${row.sabineLimitingCount + row.engineLimitingCount} modes)`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* ── Diagnostic conclusion ── */}
              {(() => {
                const sabineDominates = rootCauseAnalysis.filter(r => r.sabineIsLimiting).length > rootCauseAnalysis.length / 2;
                const avgScale = rootCauseAnalysis.reduce((s, r) => s + r.scaleFactor, 0) / rootCauseAnalysis.length;
                const avgDiff  = rootCauseAnalysis.reduce((s, r) => s + r.diffPct, 0) / rootCauseAnalysis.length;
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {[
                      {
                        label: '1. Sabine estimate',
                        conclusion: sabineDominates
                          ? 'Sabine Q is the limiting factor for majority of top modes — RT60 estimate is driving Q above parity.'
                          : 'Engine base Q is the limiting factor — Sabine estimate is not the primary driver.',
                        flag: sabineDominates,
                      },
                      {
                        label: '2. Absorption clamp',
                        conclusion: `Final Q = min(engine, sabine). Sabine ${sabineDominates ? 'is' : 'is not'} the active clamp. If absorption coefficients are too low, RT60 is inflated → Sabine Q too high → clamp does not bite → Q stays high.`,
                        flag: sabineDominates,
                      },
                      {
                        label: '3. Q selection logic',
                        conclusion: `min(engineBaseQ, sabineQ) correctly limits Q. However, parity sweep prefers ≈${fmt(avgScale * 100, 0)}% of final Q. Required scale = ${fmt(avgScale, 3)}×.`,
                        flag: avgScale < 0.75,
                      },
                      {
                        label: '4. RT60 conversion',
                        conclusion: `Q = 2π × f × RT60 / 13.815. RT60 values shown above. If RT60 is overestimated (absorption too low), all Sabine Q values inflate consistently — matching the ~${fmt(Math.abs(avgDiff), 0)}% parity gap.`,
                        flag: sabineDominates && avgScale < 0.75,
                      },
                      {
                        label: '5. Modal bandwidth definition',
                        conclusion: `Δf = f₀ / Q. Parity preferred Δf is wider (lower Q). This suggests modes need to be damped more broadly — consistent with under-estimated surface absorption or RT60 too long.`,
                        flag: avgScale < 0.75,
                      },
                    ].map(({ label, conclusion, flag }) => (
                      <div key={label} style={{
                        padding: '6px 10px', borderRadius: 5,
                        background: flag ? '#fef3c7' : '#f0fdf4',
                        border: `1px solid ${flag ? '#fbbf24' : '#86efac'}`,
                        fontSize: 9, fontFamily: 'monospace',
                        color: flag ? '#92400e' : '#166534',
                      }}>
                        <span style={{ fontWeight: 700 }}>{label}:</span> {conclusion}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}
        </>
      )}
    </div>
  );
}