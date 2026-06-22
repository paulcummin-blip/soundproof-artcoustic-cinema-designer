/**
 * FamilyEnergyBreakdownAudit — Diagnostic only. Does not affect the live graph.
 *
 * For 70, 80, 85, 90 Hz shows per-family (axial/tangential/oblique) coherent SPL and RSS SPL,
 * then three combination strategies: all coherent, family-coherent+RSS, all-RSS.
 * Reports SPL, delta from REW benchmark, and delta from current production (coherent) result.
 */

import React, { useState } from 'react';
import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';
import {
  computeRoomModesLocal,
  modeShapeValueLocal,
  resonantTransfer,
  estimateModeQLocal,
} from '@/components/room/bass/core/modalCalculations';

const SPEED_OF_SOUND = 343;
const FLAT_REF = [
  { hz: 20, db: 94 }, { hz: 50, db: 94 }, { hz: 100, db: 94 }, { hz: 200, db: 94 },
];
const REW_AT_HZ = { 70: 83.1, 80: 86.2, 85: 88.4, 90: 89.1 };
const TARGET_FREQS = [70, 80, 85, 90];

// ── Pure helpers ──────────────────────────────────────────────────────────────
function interpCurve(curve, hz) {
  const pts = [...curve].sort((a, b) => a.hz - b.hz);
  if (hz <= pts[0].hz) return pts[0].db;
  if (hz >= pts[pts.length - 1].hz) return pts[pts.length - 1].db;
  for (let i = 0; i < pts.length - 1; i++) {
    if (hz >= pts[i].hz && hz <= pts[i + 1].hz) {
      const t = (hz - pts[i].hz) / (pts[i + 1].hz - pts[i].hz);
      return pts[i].db + t * (pts[i + 1].db - pts[i].db);
    }
  }
  return pts[0].db;
}

function buildModes(roomDims, surfaceAbsorption) {
  const rawModes = computeRoomModesLocal({
    widthM: roomDims.widthM,
    lengthM: roomDims.lengthM,
    heightM: roomDims.heightM,
    fMax: 200,
    c: SPEED_OF_SOUND,
  });
  return rawModes.map(mode => {
    const activeAxes = (mode.nx > 0 ? 1 : 0) + (mode.ny > 0 ? 1 : 0) + (mode.nz > 0 ? 1 : 0);
    const baseQ = activeAxes === 1 ? 4.0 : activeAxes === 2 ? 3.9 : 2.5;
    const absorptionQ = estimateModeQLocal({
      roomDims,
      surfaceAbsorption: surfaceAbsorption ?? {},
      f0: mode.freq,
    });
    return { ...mode, qValue: Math.max(1, Math.min(baseQ, absorptionQ)) };
  });
}

function getDirectAt(subPos, seatPos, hz, gainDb = 0) {
  const dx = subPos.x - seatPos.x;
  const dy = subPos.y - seatPos.y;
  const dz = (subPos.z ?? 0.35) - (seatPos.z ?? 1.2);
  const dist = Math.max(0.01, Math.sqrt(dx*dx + dy*dy + dz*dz));
  const curveDb = interpCurve(FLAT_REF, hz);
  const distLossDb = -20 * Math.log10(dist);
  const amp = Math.pow(10, (curveDb + distLossDb + gainDb) / 20);
  const phase = -2 * Math.PI * hz * (dist / SPEED_OF_SOUND);
  return { re: amp * Math.cos(phase), im: amp * Math.sin(phase) };
}

function modalContribAt(mode, subPos, seatPos, roomDims, hz, curveDb, gainDb = 0) {
  const amp = Math.pow(10, (curveDb + gainDb) / 20);
  const srcPsi = modeShapeValueLocal(mode, subPos.x, subPos.y, subPos.z ?? 0.35, roomDims);
  const rcvPsi = modeShapeValueLocal(mode, seatPos.x, seatPos.y, seatPos.z ?? 1.2, roomDims);
  const coupling = srcPsi * rcvPsi;
  const modeOrder = Math.abs(mode.nx) + Math.abs(mode.ny) + Math.abs(mode.nz);
  const orderWeight = modeOrder >= 2 ? 0.50 : 1.0;
  const axialScale = (mode.type === 'axial' && modeOrder >= 2) ? 0.50 : 1.0;
  const gain = amp * coupling * orderWeight * axialScale;
  const { re: tr, im: ti } = resonantTransfer(hz, mode.freq, mode.qValue);
  return { re: gain * tr, im: gain * ti };
}

function mag2db(mag) { return 20 * Math.log10(Math.max(mag, 1e-10)); }
function complexMag(re, im) { return Math.sqrt(re*re + im*im); }

// Compute all breakdown data for a single frequency
function computeAtHz(hz, modes, subPos, seatPos, roomDims, gainDb) {
  const curveDb = interpCurve(FLAT_REF, hz);
  const direct = getDirectAt(subPos, seatPos, hz, gainDb);

  // Accumulate per-family complex sums and RSS energy
  const families = { axial: { re: 0, im: 0, rssEnergy: 0 }, tangential: { re: 0, im: 0, rssEnergy: 0 }, oblique: { re: 0, im: 0, rssEnergy: 0 } };

  for (const mode of modes) {
    const { re, im } = modalContribAt(mode, subPos, seatPos, roomDims, hz, curveDb, gainDb);
    const fam = families[mode.type] ?? families.oblique;
    fam.re += re;
    fam.im += im;
    fam.rssEnergy += re*re + im*im;
  }

  // Per-family SPLs
  const familyData = {};
  for (const [name, f] of Object.entries(families)) {
    familyData[name] = {
      coherentDb: mag2db(complexMag(f.re, f.im)),
      rssDb: mag2db(Math.sqrt(f.rssEnergy)),
    };
  }

  // Combination strategies — direct is always coherently summed first
  // 1. All coherent: direct + sum of all modal contributions coherently
  const allCoherentRe = direct.re + families.axial.re + families.tangential.re + families.oblique.re;
  const allCoherentIm = direct.im + families.axial.im + families.tangential.im + families.oblique.im;
  const allCoherentDb = mag2db(complexMag(allCoherentRe, allCoherentIm));

  // 2. Family coherent + family RSS: each family sums coherently, families combine with direct via RSS
  const directMagSq = direct.re*direct.re + direct.im*direct.im;
  const axMagSq = families.axial.re*families.axial.re + families.axial.im*families.axial.im;
  const tgMagSq = families.tangential.re*families.tangential.re + families.tangential.im*families.tangential.im;
  const obMagSq = families.oblique.re*families.oblique.re + families.oblique.im*families.oblique.im;
  const familyRssDb = mag2db(Math.sqrt(directMagSq + axMagSq + tgMagSq + obMagSq));

  // 3. All RSS: direct energy + all modal energies RSS combined
  const allRssEnergy = families.axial.rssEnergy + families.tangential.rssEnergy + families.oblique.rssEnergy;
  const allRssDb = mag2db(Math.sqrt(directMagSq + allRssEnergy));

  return { hz, familyData, allCoherentDb, familyRssDb, allRssDb };
}

// ── Styles ────────────────────────────────────────────────────────────────────
const MONO = { fontFamily: 'monospace' };
const TH_S = { padding: '3px 7px', fontSize: 8, fontWeight: 700, ...MONO, background: '#1c1917', color: '#d6d3d1', textAlign: 'right', borderBottom: '2px solid #292524', whiteSpace: 'nowrap' };
const TD_S = { padding: '3px 7px', fontSize: 8, ...MONO, textAlign: 'right' };
const TDL_S = { ...TD_S, textAlign: 'left' };

function deltaColor(v) {
  if (!Number.isFinite(v)) return '#6b7280';
  const a = Math.abs(v);
  if (a <= 1) return '#4ade80';
  if (a <= 3) return '#fbbf24';
  if (a <= 6) return '#fb923c';
  return '#f87171';
}
function fmt(v, d = 1) { return Number.isFinite(v) ? v.toFixed(d) : '—'; }
function fmtΔ(v, d = 1) { if (!Number.isFinite(v)) return '—'; return (v >= 0 ? '+' : '') + v.toFixed(d); }

const FAMILY_COLORS = { axial: '#93c5fd', tangential: '#c4b5fd', oblique: '#fcd34d' };
const COMBO_LABELS = [
  { key: 'allCoherentDb', label: 'All coherent' },
  { key: 'familyRssDb',  label: 'Family coh + families RSS' },
  { key: 'allRssDb',     label: 'All RSS' },
];

// ── Main component ────────────────────────────────────────────────────────────
export default function FamilyEnergyBreakdownAudit({ roomDims, subs, seat, surfaceAbsorption }) {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null); // array of { hz, familyData, allCoherentDb, familyRssDb, allRssDb }

  const hasRoom = !!(roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM);
  const currentSub = subs?.[0] ?? null;
  const mlpSeat = seat ?? null;

  const run = () => {
    if (!hasRoom || !mlpSeat || !currentSub) return;
    setRunning(true);
    setTimeout(() => {
      try {
        const subPos = { x: currentSub.x, y: currentSub.y, z: currentSub.z ?? 0.35 };
        const seatPos = { x: mlpSeat.x, y: mlpSeat.y, z: mlpSeat.z ?? 1.2 };
        const gainDb = currentSub?.tuning?.gainDb ?? 0;
        const modes = buildModes(roomDims, surfaceAbsorption);

        const rows = TARGET_FREQS.map(hz =>
          computeAtHz(hz, modes, subPos, seatPos, roomDims, gainDb)
        );
        setResults(rows);
      } catch (e) {
        console.error('[FamilyEnergyBreakdownAudit]', e);
      } finally {
        setRunning(false);
      }
    }, 0);
  };

  return (
    <div style={{ marginTop: 12, border: '1px solid #292524', borderRadius: 8, background: '#0c0a09', padding: '10px 12px' }}>
      {/* Header */}
      <div style={{ fontWeight: 700, color: '#d6d3d1', fontSize: 11, ...MONO, marginBottom: 3 }}>
        Family Energy Breakdown Audit
        <span style={{ fontWeight: 400, color: '#44403c', marginLeft: 10, fontSize: 10 }}>diagnostic only · does not affect live graph</span>
      </div>
      <div style={{ fontSize: 9, color: '#57534e', ...MONO, marginBottom: 8, lineHeight: 1.7 }}>
        Direct+Modes · Reflections OFF · Current parity settings. Per-family coherent and RSS SPL at 70/80/85/90 Hz,
        plus three summation strategies. Δ vs REW and Δ vs current production (all coherent).
      </div>

      {!hasRoom && <div style={{ fontSize: 10, color: '#fbbf24', ...MONO, marginBottom: 6 }}>⚠ Requires room dimensions.</div>}
      {hasRoom && !mlpSeat && <div style={{ fontSize: 10, color: '#fbbf24', ...MONO, marginBottom: 6 }}>⚠ Requires a seat/MLP position.</div>}
      {hasRoom && !currentSub && <div style={{ fontSize: 10, color: '#fbbf24', ...MONO, marginBottom: 6 }}>⚠ Requires a subwoofer.</div>}

      {hasRoom && mlpSeat && currentSub && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 9, ...MONO, color: '#78716c', background: '#1c1917', borderRadius: 4, padding: '5px 10px', marginBottom: 8 }}>
          <span>Room: <strong style={{ color: '#d6d3d1' }}>{roomDims.widthM.toFixed(2)}W × {roomDims.lengthM.toFixed(2)}L × {roomDims.heightM.toFixed(2)}H m</strong></span>
          <span>MLP: <strong style={{ color: '#86efac' }}>({mlpSeat.x?.toFixed(3)}, {mlpSeat.y?.toFixed(3)}, {(mlpSeat.z ?? 1.2).toFixed(3)}) m</strong></span>
          <span>Sub: <strong style={{ color: '#93c5fd' }}>({currentSub.x?.toFixed(3)}, {currentSub.y?.toFixed(3)}, {(currentSub.z ?? 0.35).toFixed(3)}) m</strong></span>
        </div>
      )}

      {hasRoom && mlpSeat && currentSub && (
        <button
          onClick={run}
          disabled={running}
          style={{ padding: '5px 14px', borderRadius: 5, border: '1px solid #57534e', background: running ? '#1c1917' : '#292524', color: running ? '#57534e' : '#d6d3d1', fontSize: 10, ...MONO, cursor: running ? 'default' : 'pointer', marginBottom: 10, fontWeight: 700 }}
        >
          {running ? 'Running…' : 'Run Family Energy Breakdown'}
        </button>
      )}

      {results && (
        <>
          {/* ── Per-family tables ── */}
          {['axial', 'tangential', 'oblique'].map(fam => (
            <div key={fam} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 9, fontWeight: 700, ...MONO, color: FAMILY_COLORS[fam], marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {fam} modes
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ ...TH_S, textAlign: 'left' }}>Freq</th>
                      <th style={{ ...TH_S, color: FAMILY_COLORS[fam] }}>Coherent SPL</th>
                      <th style={TH_S}>Δ REW</th>
                      <th style={{ ...TH_S, color: '#6ee7b7' }}>RSS SPL</th>
                      <th style={TH_S}>Δ REW (RSS)</th>
                      <th style={{ ...TH_S, color: '#78716c' }}>Coh vs RSS Δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map(row => {
                      const fd = row.familyData[fam];
                      const rew = REW_AT_HZ[row.hz];
                      const cohDelta = fd.coherentDb - rew;
                      const rssDelta = fd.rssDb - rew;
                      const cohVsRss = fd.coherentDb - fd.rssDb;
                      return (
                        <tr key={row.hz} style={{ borderBottom: '1px solid #1c1917' }}>
                          <td style={{ ...TDL_S, color: '#d6d3d1', fontWeight: 700 }}>{row.hz} Hz</td>
                          <td style={{ ...TD_S, color: FAMILY_COLORS[fam] }}>{fmt(fd.coherentDb)}</td>
                          <td style={{ ...TD_S, color: deltaColor(cohDelta) }}>{fmtΔ(cohDelta)}</td>
                          <td style={{ ...TD_S, color: '#6ee7b7' }}>{fmt(fd.rssDb)}</td>
                          <td style={{ ...TD_S, color: deltaColor(rssDelta) }}>{fmtΔ(rssDelta)}</td>
                          <td style={{ ...TD_S, color: Math.abs(cohVsRss) > 1 ? '#fb923c' : '#57534e' }}>{fmtΔ(cohVsRss)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {/* ── Combination strategies ── */}
          <div style={{ marginBottom: 4, marginTop: 6 }}>
            <div style={{ fontSize: 9, fontWeight: 700, ...MONO, color: '#e7e5e4', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Combination strategies
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ ...TH_S, textAlign: 'left', width: 180 }}>Strategy</th>
                    {results.map(r => (
                      <React.Fragment key={r.hz}>
                        <th style={{ ...TH_S, color: '#d6d3d1' }}>{r.hz} Hz SPL</th>
                        <th style={{ ...TH_S, color: '#f87171', fontSize: 7 }}>Δ REW</th>
                        <th style={{ ...TH_S, color: '#6b7280', fontSize: 7 }}>Δ prod</th>
                      </React.Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {COMBO_LABELS.map(({ key, label }) => (
                    <tr key={key} style={{ borderBottom: '1px solid #1c1917', background: key === 'allCoherentDb' ? '#1a1a1a' : undefined }}>
                      <td style={{ ...TDL_S, color: key === 'allCoherentDb' ? '#fbbf24' : '#a8a29e', fontWeight: key === 'allCoherentDb' ? 700 : 400 }}>
                        {key === 'allCoherentDb' && '★ '}
                        {label}
                      </td>
                      {results.map(row => {
                        const spl = row[key];
                        const rew = REW_AT_HZ[row.hz];
                        const prod = row.allCoherentDb;
                        return (
                          <React.Fragment key={row.hz}>
                            <td style={{ ...TD_S, color: '#d6d3d1' }}>{fmt(spl)}</td>
                            <td style={{ ...TD_S, color: deltaColor(spl - rew), fontSize: 7 }}>{fmtΔ(spl - rew)}</td>
                            <td style={{ ...TD_S, color: deltaColor(Math.abs(spl - prod)), fontSize: 7 }}>
                              {key === 'allCoherentDb' ? '—' : fmtΔ(spl - prod)}
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Legend */}
          <div style={{ marginTop: 8, fontSize: 9, ...MONO, color: '#44403c', lineHeight: 1.8, borderTop: '1px solid #1c1917', paddingTop: 6 }}>
            <span style={{ color: '#93c5fd' }}>Axial</span> · <span style={{ color: '#c4b5fd' }}>Tangential</span> · <span style={{ color: '#fcd34d' }}>Oblique</span>&nbsp;&nbsp;
            ★ = current production path (all coherent)&nbsp;&nbsp;
            Δ colours: <span style={{ color: '#4ade80' }}>≤1 dB</span> · <span style={{ color: '#fbbf24' }}>≤3 dB</span> · <span style={{ color: '#fb923c' }}>≤6 dB</span> · <span style={{ color: '#f87171' }}>&gt;6 dB</span><br />
            "Coh vs RSS Δ" = how much coherent interference inflates/deflates vs incoherent RSS within that family.
            If this is large and positive for one family, that family's internal phase structure is creating excess energy.
          </div>
        </>
      )}
    </div>
  );
}