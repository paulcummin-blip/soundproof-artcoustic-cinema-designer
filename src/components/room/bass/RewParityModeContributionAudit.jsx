// RewParityModeContributionAudit.jsx
// Diagnostic-only: audits the top-10 contributing room modes at each REW benchmark frequency.
// Does NOT modify the active simulation, defaults, or engine behaviour.

import React, { useState, useCallback, useMemo } from 'react';
import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';

const REW_BENCHMARK = [
  { hz: 20,  db: 92.4 },
  { hz: 25,  db: 93.6 },
  { hz: 30,  db: 89.2 },
  { hz: 40,  db: 86.0 },
  { hz: 50,  db: 91.8 },
  { hz: 57,  db: 104.1 },
  { hz: 60,  db: 98.1 },
  { hz: 70,  db: 86.8 },
  { hz: 80,  db: 79.7 },
  { hz: 85,  db: 90.8 },
  { hz: 100, db: 98.3 },
  { hz: 120, db: 92.1 },
  { hz: 150, db: 94.3 },
  { hz: 180, db: 99.3 },
  { hz: 200, db: 99.5 },
];

// Frequencies with the largest known parity errors — highlighted in the UI
const PRIORITY_FREQS = new Set([20, 80, 120, 180, 200]);

const FLAT_SOURCE_CURVE = [
  { hz: 20, db: 94 }, { hz: 50, db: 94 }, { hz: 100, db: 94 }, { hz: 200, db: 94 },
];

const FAMILY_COLORS = {
  axial:       { bg: '#dbeafe', border: '#93c5fd', text: '#1e3a8a' },
  tangential:  { bg: '#dcfce7', border: '#86efac', text: '#166534' },
  oblique:     { bg: '#fef3c7', border: '#fbbf24', text: '#92400e' },
};

function fmt(v, d = 2) {
  return Number.isFinite(v) ? v.toFixed(d) : '—';
}

// ── Pure maths helpers (no engine calls) ──────────────────────────────────────

function modeType(nx, ny, nz) {
  const axes = (nx > 0 ? 1 : 0) + (ny > 0 ? 1 : 0) + (nz > 0 ? 1 : 0);
  if (axes === 1) return 'axial';
  if (axes === 2) return 'tangential';
  return 'oblique';
}

// Build all room modes up to fMax
function buildRoomModes(widthM, lengthM, heightM, fMax, c = 343) {
  const modes = [];
  const nMax = Math.ceil((fMax / c) * 2 * Math.max(widthM, lengthM, heightM)) + 5;
  for (let nx = 0; nx <= nMax; nx++) {
    for (let ny = 0; ny <= nMax; ny++) {
      for (let nz = 0; nz <= nMax; nz++) {
        if (nx === 0 && ny === 0 && nz === 0) continue;
        const freq = (c / 2) * Math.sqrt(
          (nx / widthM) ** 2 + (ny / lengthM) ** 2 + (nz / heightM) ** 2
        );
        if (!Number.isFinite(freq) || freq <= 0 || freq > fMax) continue;
        modes.push({ nx, ny, nz, freq, type: modeType(nx, ny, nz) });
      }
    }
  }
  return modes.sort((a, b) => a.freq - b.freq);
}

// Sabine Q
function modeQ(f0, widthM, lengthM, heightM, sa) {
  const V = widthM * lengthM * heightM;
  const areaFloor  = lengthM * widthM,  areaCeil = lengthM * widthM;
  const areaFront  = widthM * heightM,  areaBack = widthM * heightM;
  const areaLeft   = lengthM * heightM, areaRight = lengthM * heightM;
  const A =
    areaFloor  * (sa?.floor   ?? 0.3) +
    areaCeil   * (sa?.ceiling ?? 0.3) +
    areaFront  * (sa?.front   ?? 0.3) +
    areaBack   * (sa?.back    ?? 0.3) +
    areaLeft   * (sa?.left    ?? 0.3) +
    areaRight  * (sa?.right   ?? 0.3);
  const rt60 = 0.161 * V / Math.max(A, 1e-6);
  const qSabine = 2 * Math.PI * f0 * rt60 / 13.815;
  return Math.max(1, Math.min(80, qSabine));
}

function axialQByType(type, axialQOverride) {
  if (type === 'axial') return Number.isFinite(axialQOverride) ? axialQOverride : 8.0;
  if (type === 'tangential') return 6.0;
  return 4.5;
}

// cos mode shape
function modeShape(n, pos, dim) {
  return n > 0 ? Math.cos(n * Math.PI * pos / Math.max(dim, 1e-6)) : 1;
}

// Second-order resonant transfer magnitude at frequencyHz
function transferMag(frequencyHz, f0, Q) {
  const r = frequencyHz / Math.max(f0, 1e-6);
  const rr = 1 - r * r;
  const ri = frequencyHz / (Q * Math.max(f0, 1e-6));
  return 1 / Math.sqrt(rr * rr + ri * ri);
}

// Compute per-mode contributions at a target frequency
function computeModeContributionsAtHz(
  targetHz, modes,
  sourceX, sourceY, sourceZ,
  seatX, seatY, seatZ,
  widthM, lengthM, heightM,
  modalSourceAmplitude,
  axialQOverride,
  sa,
) {
  const contribs = [];

  for (const mode of modes) {
    const baseQ = axialQByType(mode.type, axialQOverride);
    const absQ  = modeQ(mode.freq, widthM, lengthM, heightM, sa);
    const modeOrder = Math.abs(mode.nx) + Math.abs(mode.ny) + Math.abs(mode.nz);
    const q = Math.max(1, Math.min(baseQ, absQ));

    const srcX = modeShape(mode.nx, sourceX, widthM);
    const srcY = modeShape(mode.ny, sourceY, lengthM);
    const srcZ = modeShape(mode.nz, sourceZ, heightM);
    const rcvX = modeShape(mode.nx, seatX, widthM);
    const rcvY = modeShape(mode.ny, seatY, lengthM);
    const rcvZ = modeShape(mode.nz, seatZ, heightM);

    const coupling = srcX * srcY * srcZ * rcvX * rcvY * rcvZ;
    const orderWeight = modeOrder >= 2 ? 0.50 : 1.0;
    const hoScale     = (mode.type === 'axial' && modeOrder >= 2) ? 0.50 : 1.0;

    const H = transferMag(targetHz, mode.freq, q);
    const magnitude = Math.abs(modalSourceAmplitude * coupling * orderWeight * hoScale * H);

    // Phase angle of the resonant transfer at targetHz (atan2 of Im/Re)
    const rr = targetHz / Math.max(mode.freq, 1e-6);
    const realDen = 1 - rr * rr;
    const imagDen = targetHz / (q * Math.max(mode.freq, 1e-6));
    const phaseDeg = Math.atan2(-imagDen, realDen) * 180 / Math.PI;

    contribs.push({
      nx: mode.nx, ny: mode.ny, nz: mode.nz,
      modeHz: mode.freq,
      type: mode.type,
      magnitude,
      phaseDeg,
      coupling,
      q,
    });
  }

  // Sort by magnitude descending
  contribs.sort((a, b) => b.magnitude - a.magnitude);

  // Total modal energy for percentage calculation
  const totalEnergy = contribs.reduce((s, c) => s + c.magnitude * c.magnitude, 0);

  return contribs.map(c => ({
    ...c,
    pctEnergy: totalEnergy > 0 ? (c.magnitude * c.magnitude / totalEnergy) * 100 : 0,
  }));
}

// ── Styles ────────────────────────────────────────────────────────────────────
const thStyle = {
  textAlign: 'right', padding: '2px 5px', fontSize: 9, fontWeight: 700,
  background: '#f5f3ff', borderBottom: '2px solid #c4b5fd', color: '#4c1d95',
  whiteSpace: 'nowrap',
};
const tdStyle = { textAlign: 'right', padding: '2px 5px', fontSize: 9, fontFamily: 'monospace' };

// ── Sub-component: one benchmark frequency block ──────────────────────────────
function FreqBlock({ benchEntry, contribs, isPriority }) {
  const [expanded, setExpanded] = useState(isPriority); // priority freqs open by default

  const top10 = contribs.slice(0, 10);
  const totalByFamily = { axial: 0, tangential: 0, oblique: 0 };
  const pctByFamily   = { axial: 0, tangential: 0, oblique: 0 };
  for (const c of contribs) {
    totalByFamily[c.type] = (totalByFamily[c.type] || 0) + c.magnitude;
    pctByFamily[c.type]   = (pctByFamily[c.type]   || 0) + c.pctEnergy;
  }
  const dominantFamily = Object.entries(pctByFamily).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'axial';
  const fc = FAMILY_COLORS[dominantFamily] ?? FAMILY_COLORS.axial;

  return (
    <div style={{
      marginBottom: 8,
      border: isPriority ? '2px solid #a78bfa' : '1px solid #ddd6fe',
      borderRadius: 6,
      background: isPriority ? '#faf5ff' : '#fff',
    }}>
      {/* Header row */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          width: '100%', textAlign: 'left', background: 'none', border: 'none',
          cursor: 'pointer', padding: '5px 8px', display: 'flex', alignItems: 'center', gap: 8,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: isPriority ? '#6d28d9' : '#374151' }}>
          {isPriority ? '⚠ ' : ''}{benchEntry.hz} Hz
        </span>
        <span style={{ fontSize: 9, color: '#6b7280', fontFamily: 'monospace' }}>
          REW target: {benchEntry.db} dB
        </span>
        <span style={{
          fontSize: 9, fontFamily: 'monospace', fontWeight: 700, padding: '1px 6px', borderRadius: 3,
          background: fc.bg, border: `1px solid ${fc.border}`, color: fc.text, marginLeft: 4,
        }}>
          dominant: {dominantFamily}
        </span>
        {/* Family totals */}
        {['axial', 'tangential', 'oblique'].map(f => (
          <span key={f} style={{
            fontSize: 9, fontFamily: 'monospace', padding: '1px 5px', borderRadius: 3,
            background: FAMILY_COLORS[f].bg, border: `1px solid ${FAMILY_COLORS[f].border}`,
            color: FAMILY_COLORS[f].text,
          }}>
            {f[0].toUpperCase()}: {fmt(pctByFamily[f], 1)}%
          </span>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#9ca3af' }}>
          {expanded ? '▲' : '▼'}
        </span>
      </button>

      {/* Expanded: top-10 table */}
      {expanded && (
        <div style={{ overflowX: 'auto', padding: '0 6px 6px' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560 }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, textAlign: 'center' }}>#</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>Mode (nx,ny,nz)</th>
                <th style={thStyle}>Modal freq (Hz)</th>
                <th style={thStyle}>Contrib mag</th>
                <th style={thStyle}>Phase (°)</th>
                <th style={thStyle}>% modal energy</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>Family</th>
                <th style={thStyle}>Q</th>
                <th style={thStyle}>Coupling</th>
              </tr>
            </thead>
            <tbody>
              {top10.map((c, i) => {
                const fc2 = FAMILY_COLORS[c.type] ?? FAMILY_COLORS.oblique;
                const isTop = i === 0;
                return (
                  <tr key={`${c.nx}-${c.ny}-${c.nz}`} style={{
                    borderBottom: '1px solid #ede9fe',
                    background: isTop ? '#ede9fe' : i < 3 ? '#f5f3ff' : undefined,
                  }}>
                    <td style={{ ...tdStyle, textAlign: 'center', fontWeight: isTop ? 700 : 400, color: isTop ? '#6d28d9' : '#6b7280' }}>
                      {isTop ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'left', fontWeight: isTop ? 700 : 400, color: '#1c1917', fontFamily: 'monospace' }}>
                      ({c.nx},{c.ny},{c.nz})
                    </td>
                    <td style={{ ...tdStyle, color: '#374151' }}>{fmt(c.modeHz, 1)}</td>
                    <td style={{ ...tdStyle, fontWeight: isTop ? 700 : 400, color: isTop ? '#6d28d9' : '#374151' }}>
                      {c.magnitude >= 0.001 ? c.magnitude.toExponential(3) : fmt(c.magnitude, 5)}
                    </td>
                    <td style={{ ...tdStyle, color: c.phaseDeg < -90 || c.phaseDeg > 90 ? '#dc2626' : '#374151' }}>
                      {fmt(c.phaseDeg, 1)}°
                    </td>
                    <td style={{ ...tdStyle, fontWeight: isTop ? 700 : 400, color: isTop ? '#6d28d9' : '#374151' }}>
                      {fmt(c.pctEnergy, 2)}%
                    </td>
                    <td style={{ textAlign: 'left', padding: '2px 5px', fontSize: 9 }}>
                      <span style={{
                        background: fc2.bg, border: `1px solid ${fc2.border}`,
                        color: fc2.text, padding: '0 4px', borderRadius: 3, fontFamily: 'monospace',
                      }}>
                        {c.type}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, color: '#6b7280' }}>{fmt(c.q, 1)}</td>
                    <td style={{ ...tdStyle, color: Math.abs(c.coupling) < 0.01 ? '#d1d5db' : '#374151' }}>
                      {fmt(c.coupling, 4)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Family energy breakdown bar */}
          <div style={{ marginTop: 6, fontSize: 9, fontFamily: 'monospace', color: '#6b7280' }}>
            Energy by family &nbsp;·&nbsp;
            {['axial', 'tangential', 'oblique'].map((f, fi) => (
              <span key={f}>
                {fi > 0 && ' | '}
                <span style={{ color: FAMILY_COLORS[f].text, fontWeight: f === dominantFamily ? 700 : 400 }}>
                  {f}: {fmt(pctByFamily[f], 1)}% ({fmt(totalByFamily[f], 3)} mag)
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function RewParityModeContributionAudit({ roomDims, seat, sub, surfaceAbsorption, activeSettings }) {
  const [auditData, setAuditData] = useState(null); // Map: hz → contrib[]
  const [running, setRunning]     = useState(false);
  const [filterFamily, setFilterFamily] = useState('all');

  const canRun = !!(
    roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM &&
    seat?.x != null && seat?.y != null &&
    sub?.x != null && sub?.y != null
  );

  const runAudit = useCallback(async () => {
    if (!canRun) return;
    setRunning(true);
    setAuditData(null);

    const widthM  = Number(roomDims.widthM);
    const lengthM = Number(roomDims.lengthM);
    const heightM = Number(roomDims.heightM);
    const seatZ   = Number.isFinite(Number(seat?.z)) ? Number(seat.z) : 1.2;
    const subZ    = Number.isFinite(Number(sub?.z))  ? Number(sub.z)  : 0.35;
    const axialQOverride = activeSettings?.axialQ ?? 8;

    // Source amplitude at flat 94 dB reference
    const modalSourceAmplitude = Math.pow(10, 94 / 20);

    // Build modes once
    await new Promise(r => setTimeout(r, 0));
    const modes = buildRoomModes(widthM, lengthM, heightM, 210);

    const result = {};
    for (const bench of REW_BENCHMARK) {
      await new Promise(r => setTimeout(r, 0));
      result[bench.hz] = computeModeContributionsAtHz(
        bench.hz, modes,
        Number(sub.x), Number(sub.y), subZ,
        Number(seat.x), Number(seat.y), seatZ,
        widthM, lengthM, heightM,
        modalSourceAmplitude,
        axialQOverride,
        surfaceAbsorption,
      );
    }

    setAuditData(result);
    setRunning(false);
  }, [roomDims, seat, sub, surfaceAbsorption, activeSettings, canRun]);

  // Overall dominant family across all benchmark freqs
  const globalFamilySummary = useMemo(() => {
    if (!auditData) return null;
    const totals = { axial: 0, tangential: 0, oblique: 0 };
    for (const hz of Object.keys(auditData)) {
      const contribs = auditData[hz];
      for (const c of contribs) {
        totals[c.type] = (totals[c.type] || 0) + c.pctEnergy;
      }
    }
    const total = Object.values(totals).reduce((s, v) => s + v, 0) || 1;
    return Object.entries(totals)
      .map(([type, sum]) => ({ type, avgPct: sum / Object.keys(auditData).length }))
      .sort((a, b) => b.avgPct - a.avgPct);
  }, [auditData]);

  return (
    <div style={{ marginTop: 14, borderTop: '1px solid #c4b5fd', paddingTop: 10 }}>
      <div style={{ fontWeight: 700, color: '#4c1d95', fontSize: 11, fontFamily: 'monospace', marginBottom: 4 }}>
        REW Parity Mode Contribution Audit
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          top-10 contributing modes per benchmark frequency · diagnostic only · does not modify simulation
        </span>
      </div>
      <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#6b7280', marginBottom: 6 }}>
        Uses current room dims, sub/seat positions, axialQ and absorption. Flat 94 dB source reference.
        Mode shape: cos(nπx/L). Transfer: standard 2nd-order resonant H(f). ⚠ = high parity error target.
      </div>

      {!canRun && (
        <div style={{ fontSize: 10, color: '#b45309', fontFamily: 'monospace', marginBottom: 6 }}>
          ⚠ Need room dims, valid seat, and valid sub to run audit.
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <button
          onClick={runAudit}
          disabled={running || !canRun}
          style={{
            height: 28, padding: '0 14px', borderRadius: 6,
            border: '1px solid #7c3aed', background: running ? '#e5e7eb' : '#7c3aed',
            color: running ? '#6b7280' : '#fff', fontSize: 11, fontFamily: 'monospace',
            cursor: running || !canRun ? 'not-allowed' : 'pointer', fontWeight: 600,
          }}
        >
          {running ? 'Running audit…' : (auditData ? 'Re-run audit' : 'Run mode contribution audit')}
        </button>

        {auditData && (
          <div style={{ display: 'flex', gap: 4 }}>
            {['all', 'axial', 'tangential', 'oblique'].map(f => (
              <button
                key={f}
                onClick={() => setFilterFamily(f)}
                style={{
                  height: 22, padding: '0 8px', borderRadius: 4, fontSize: 9, fontFamily: 'monospace',
                  border: `1px solid ${f === filterFamily ? '#7c3aed' : '#d1d5db'}`,
                  background: f === filterFamily ? '#ede9fe' : '#fff',
                  color: f === filterFamily ? '#4c1d95' : '#6b7280',
                  cursor: 'pointer', fontWeight: f === filterFamily ? 700 : 400,
                }}
              >
                {f}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Global family summary ── */}
      {globalFamilySummary && (
        <div style={{
          display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap',
        }}>
          {globalFamilySummary.map((f, i) => {
            const fc = FAMILY_COLORS[f.type];
            return (
              <div key={f.type} style={{
                padding: '4px 10px', borderRadius: 6,
                background: fc.bg, border: `2px solid ${fc.border}`,
                fontSize: 10, fontFamily: 'monospace', color: fc.text,
              }}>
                {i === 0 && '★ '}<strong>{f.type}</strong>: avg {fmt(f.avgPct, 1)}% energy/freq
                {i === 0 && ' (dominant)'}
              </div>
            );
          })}
          <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#6b7280', display: 'flex', alignItems: 'center' }}>
            Average % of total modal energy contributed by each family across all benchmark frequencies.
          </div>
        </div>
      )}

      {/* ── Per-frequency blocks ── */}
      {auditData && REW_BENCHMARK.map(bench => {
        const contribs = auditData[bench.hz] ?? [];
        const filtered = filterFamily === 'all' ? contribs : contribs.filter(c => c.type === filterFamily);
        return (
          <FreqBlock
            key={bench.hz}
            benchEntry={bench}
            contribs={filtered}
            isPriority={PRIORITY_FREQS.has(bench.hz)}
          />
        );
      })}

      {auditData && (
        <div style={{ marginTop: 6, fontSize: 9, fontFamily: 'monospace', color: '#6b7280' }}>
          Sort: magnitude ↓ · % energy = (mag²/Σmag²)×100 · Phase: resonant H(f) convention (0° = on-resonance)
          · ⚠ marked freqs are highest parity error targets (80, 120, 180, 200, 20 Hz)
        </div>
      )}
    </div>
  );
}