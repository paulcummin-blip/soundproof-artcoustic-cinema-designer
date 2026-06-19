// RewParityArchitectureSweep.jsx
// Diagnostic-only: tests distinct modal injection architectures against REW_BENCHMARK.
// Does NOT modify the active simulation, defaults, or engine.

import React, { useState, useCallback } from 'react';
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

const FLAT_SOURCE_CURVE = [
  { hz: 20, db: 94 }, { hz: 50, db: 94 }, { hz: 100, db: 94 }, { hz: 200, db: 94 },
];

const BANDS = [
  { label: '20–40',   lo: 20,  hi: 40  },
  { label: '40–80',   lo: 40,  hi: 80  },
  { label: '80–120',  lo: 80,  hi: 120 },
  { label: '120–200', lo: 120, hi: 200 },
];

// ── Architecture definitions ──────────────────────────────────────────────────
// Each entry maps to a concrete set of engine options that represents a
// distinct modal injection model. All other parity settings are locked.
const ARCHITECTURES = [
  {
    id: 'distance_blend',
    label: 'Distance Blend',
    description: 'modal gain scalar derived from sub↔seat distance blend (production default)',
    engineOverrides: {
      modalSourceReferenceMode: 'distance_blend',
      modalDistanceBlend: 0.50,
      modalCoherenceMode: 'coherent',
    },
  },
  {
    id: 'distance_normalized',
    label: 'Distance Normalised',
    description: 'modal amplitude normalised by full 1/r loss from sub to seat',
    engineOverrides: {
      modalSourceReferenceMode: 'distance_normalized',
      modalCoherenceMode: 'coherent',
    },
  },
  {
    id: 'room_volume',
    label: 'Room Volume Normalised',
    description: 'modal amplitude / √(room volume) — REW parity reference mode',
    engineOverrides: {
      modalSourceReferenceMode: 'room_volume',
      modalCoherenceMode: 'coherent',
    },
  },
  {
    id: 'existing_coherent',
    label: 'Existing (Coherent)',
    description: 'raw modalSourceAmplitudeBase with no distance scaling — coherent sum',
    engineOverrides: {
      modalSourceReferenceMode: 'existing',
      modalCoherenceMode: 'coherent',
    },
  },
  {
    id: 'existing_distributed',
    label: 'Existing (Distributed)',
    description: 'raw amplitude — distributed phase coherence diagnostic sum',
    engineOverrides: {
      modalSourceReferenceMode: 'existing',
      modalCoherenceMode: 'distributed',
    },
  },
  {
    id: 'existing_split',
    label: 'Existing (Split)',
    description: 'raw amplitude — 70% coherent + 30% energetic per-mode split',
    engineOverrides: {
      modalSourceReferenceMode: 'existing',
      modalCoherenceMode: 'split',
    },
  },
  {
    id: 'distance_blend_distributed',
    label: 'Distance Blend + Distributed',
    description: 'distance-blend gain with distributed phase coherence sum',
    engineOverrides: {
      modalSourceReferenceMode: 'distance_blend',
      modalDistanceBlend: 0.50,
      modalCoherenceMode: 'distributed',
    },
  },
  {
    id: 'room_volume_distributed',
    label: 'Room Volume + Distributed',
    description: 'volume-normalised amplitude with distributed phase coherence sum',
    engineOverrides: {
      modalSourceReferenceMode: 'room_volume',
      modalCoherenceMode: 'distributed',
    },
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function interpolateSpl(series, targetHz) {
  if (!Array.isArray(series) || series.length === 0) return null;
  const sorted = [...series].sort((a, b) => a.frequency - b.frequency);
  if (targetHz <= sorted[0].frequency) return sorted[0].spl;
  if (targetHz >= sorted[sorted.length - 1].frequency) return sorted[sorted.length - 1].spl;
  for (let i = 0; i < sorted.length - 1; i++) {
    const p1 = sorted[i], p2 = sorted[i + 1];
    if (targetHz >= p1.frequency && targetHz <= p2.frequency) {
      const t = (targetHz - p1.frequency) / (p2.frequency - p1.frequency);
      return p1.spl + (p2.spl - p1.spl) * t;
    }
  }
  return null;
}

function computeAllMetrics(series) {
  let sumAbsErr = 0, worstErr = 0, count = 0;
  for (const { hz, db } of REW_BENCHMARK) {
    const b44 = interpolateSpl(series, hz);
    if (!Number.isFinite(b44)) continue;
    const absErr = Math.abs(b44 - db);
    sumAbsErr += absErr;
    if (absErr > worstErr) worstErr = absErr;
    count++;
  }
  if (count === 0) return { mae: null, worst: null, bands: BANDS.map(() => null) };
  const bands = BANDS.map(({ lo, hi }) => {
    const pts = REW_BENCHMARK.filter(p => p.hz >= lo && p.hz <= hi);
    if (pts.length === 0) return null;
    let s = 0, c = 0;
    for (const { hz, db } of pts) {
      const v = interpolateSpl(series, hz);
      if (!Number.isFinite(v)) continue;
      s += Math.abs(v - db); c++;
    }
    return c > 0 ? s / c : null;
  });
  return { mae: sumAbsErr / count, worst: worstErr, bands };
}

function resolveEngineModalParams(seat, sub, modalDistanceBlend, modalGainScalar) {
  const seatZ = Number.isFinite(Number(seat?.z)) ? Number(seat.z) : 1.2;
  const blend = Math.max(0, Math.min(1, modalDistanceBlend ?? 0.5));
  if (blend <= 0.0) return { engineModalRefMode: 'existing', engineModalGainScalar: modalGainScalar ?? 1.0, seatZ };
  if (blend >= 1.0) return { engineModalRefMode: 'distance_normalized', engineModalGainScalar: modalGainScalar ?? 1.0, seatZ };
  const dx = sub.x - seat.x, dy = sub.y - seat.y;
  const dz = (Number.isFinite(sub.z) ? sub.z : 0.35) - seatZ;
  const distM = Math.max(0.01, Math.sqrt(dx*dx + dy*dy + dz*dz));
  const fullLossDb = -20 * Math.log10(distM / 1);
  return {
    engineModalRefMode: 'existing',
    engineModalGainScalar: (modalGainScalar ?? 1.0) * Math.pow(10, (fullLossDb * blend) / 20),
    seatZ,
  };
}

function runArchSim(roomDims, seat, sub, activeSettings, archOverrides, surfaceAbsorption) {
  // Determine modal source reference mode — handle distance_blend specially
  const rawRefMode = archOverrides.modalSourceReferenceMode;
  let engineModalRefMode = rawRefMode;
  let engineModalGainScalar = 1.0;
  let seatZ = Number.isFinite(Number(seat?.z)) ? Number(seat.z) : 1.2;

  if (rawRefMode === 'distance_blend') {
    const resolved = resolveEngineModalParams(seat, sub, archOverrides.modalDistanceBlend, 1.0);
    engineModalRefMode   = resolved.engineModalRefMode;
    engineModalGainScalar = resolved.engineModalGainScalar;
    seatZ = resolved.seatZ;
  }

  let result;
  try {
    result = simulateBassResponseRewCore(
      { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM },
      { x: seat.x, y: seat.y, z: seatZ },
      sub,
      FLAT_SOURCE_CURVE,
      {
        // Locked parity settings from activeSettings
        enableReflections:            false,
        disableLateField:             true,
        propagationPhaseScale:        0,
        pureDeterministicModalSum:    true,
        disableModalPropagationPhase: true,
        axialQ:                       activeSettings?.axialQ ?? 8,
        highOrderAxialScale:          activeSettings?.highOrderAxialScale ?? 1.0,
        rewParityModalMagnitudeScale: activeSettings?.rewParityModalMagnitudeScale ?? 1.0,
        surfaceAbsorption,
        enableModes:                  true,
        freqMinHz:                    20,
        freqMaxHz:                    200,
        smoothing:                    'none',
        debugReflectionOrder:         1,
        modalStorageMode:             'none',
        // Architecture-specific overrides
        modalSourceReferenceMode:     engineModalRefMode,
        modalGainScalar:              engineModalGainScalar,
        modalCoherenceMode:           archOverrides.modalCoherenceMode ?? 'coherent',
      }
    );
  } catch { return null; }

  if (!result?.freqsHz || !result?.splDbRaw) return null;
  return result.freqsHz.map((hz, i) => ({ frequency: hz, spl: result.splDbRaw[i] }));
}

function fmt(v, d = 2) {
  return Number.isFinite(v) ? v.toFixed(d) : '—';
}

const thStyle = {
  textAlign: 'right', padding: '3px 6px', fontSize: 10, fontWeight: 700,
  background: '#eff6ff', borderBottom: '2px solid #93c5fd', color: '#1e3a8a',
  whiteSpace: 'nowrap',
};
const tdStyle = { textAlign: 'right', padding: '2px 6px', fontSize: 10, fontFamily: 'monospace' };

// ── Component ─────────────────────────────────────────────────────────────────
export default function RewParityArchitectureSweep({ roomDims, seat, sub, surfaceAbsorption, activeSettings }) {
  const [archResults, setArchResults] = useState(null);  // sorted rows
  const [currentRow, setCurrentRow]   = useState(null);  // ★ CURRENT
  const [running, setRunning]         = useState(false);

  const canRun = !!(
    roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM &&
    seat?.x != null && seat?.y != null &&
    sub?.x != null && sub?.y != null &&
    activeSettings
  );

  const runSweep = useCallback(async () => {
    if (!canRun) return;
    setRunning(true);
    setArchResults(null);
    setCurrentRow(null);

    // ── Step 1: current active settings ──
    let curRow = null;
    {
      const series = runArchSim(roomDims, seat, sub, activeSettings, {
        modalSourceReferenceMode: activeSettings?.modalSourceReferenceMode ?? 'distance_blend',
        modalDistanceBlend:       activeSettings?.modalDistanceBlend ?? 0.50,
        modalCoherenceMode:       activeSettings?.modalCoherenceMode ?? 'coherent',
      }, surfaceAbsorption);
      if (series) {
        const m = computeAllMetrics(series);
        curRow = {
          id: 'current',
          label: '★ CURRENT',
          description: `${activeSettings?.modalSourceReferenceMode ?? 'distance_blend'} / ${activeSettings?.modalCoherenceMode ?? 'coherent'}`,
          mae: m.mae, worst: m.worst, bands: m.bands,
        };
      }
    }
    setCurrentRow(curRow);

    // ── Step 2: architecture sweep ──
    const rows = [];
    for (const arch of ARCHITECTURES) {
      await new Promise(r => setTimeout(r, 0)); // yield to UI
      const series = runArchSim(roomDims, seat, sub, activeSettings, arch.engineOverrides, surfaceAbsorption);
      if (!series) continue;
      const m = computeAllMetrics(series);
      if (m.mae === null) continue;
      rows.push({ ...arch, mae: m.mae, worst: m.worst, bands: m.bands });
    }

    rows.sort((a, b) => a.mae - b.mae);
    setArchResults(rows);
    setRunning(false);
  }, [roomDims, seat, sub, surfaceAbsorption, activeSettings, canRun]);

  // Best row for comparison
  const best = archResults?.[0] ?? null;
  const maeDelta  = (currentRow?.mae != null && best?.mae != null) ? currentRow.mae - best.mae : null;
  const worstDelta = (currentRow?.worst != null && best?.worst != null) ? currentRow.worst - best.worst : null;

  return (
    <div style={{ marginTop: 14, borderTop: '1px solid #93c5fd', paddingTop: 10 }}>
      <div style={{ fontWeight: 700, color: '#1e3a8a', fontSize: 11, fontFamily: 'monospace', marginBottom: 4 }}>
        REW Parity Modal Architecture Sweep
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          {ARCHITECTURES.length} modal injection architectures · diagnostic only · does not modify active simulation
        </span>
      </div>
      <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#6b7280', marginBottom: 8 }}>
        All tuning params (axialQ, hoScale, magScale, absorption) fixed to current active settings.
        Only modal source reference mode and coherence mode vary.
      </div>

      {!canRun && (
        <div style={{ fontSize: 10, color: '#b45309', fontFamily: 'monospace', marginBottom: 6 }}>
          ⚠ Need room dims, valid seat, valid sub, and activeSettings.
        </div>
      )}

      <button
        onClick={runSweep}
        disabled={running || !canRun}
        style={{
          height: 28, padding: '0 14px', borderRadius: 6,
          border: '1px solid #1d4ed8', background: running ? '#e5e7eb' : '#1d4ed8',
          color: running ? '#6b7280' : '#fff', fontSize: 11, fontFamily: 'monospace',
          cursor: running || !canRun ? 'not-allowed' : 'pointer', fontWeight: 600,
          marginBottom: 8,
        }}
      >
        {running ? 'Running…' : (archResults ? 'Re-run architecture sweep' : 'Run architecture sweep')}
      </button>

      {/* ── Results table ── */}
      {(currentRow || archResults) && (
        <div style={{ overflowX: 'auto', marginTop: 4 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 820 }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, textAlign: 'left' }}>Rank</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>Architecture</th>
                <th style={thStyle}>Overall MAE</th>
                <th style={thStyle}>Worst Err</th>
                {BANDS.map(b => <th key={b.label} style={thStyle}>{b.label} MAE</th>)}
              </tr>
            </thead>
            <tbody>
              {/* ★ CURRENT row */}
              {currentRow && (
                <tr style={{ borderBottom: '2px solid #93c5fd', background: '#fff7ed' }}>
                  <td style={{ ...tdStyle, textAlign: 'left', fontWeight: 700, color: '#b45309', fontSize: 9 }}>★ CURRENT</td>
                  <td style={{ ...tdStyle, textAlign: 'left', color: '#78350f', fontSize: 9 }}>{currentRow.description}</td>
                  <td style={{ ...tdStyle, fontWeight: 700, color: '#b45309' }}>{fmt(currentRow.mae, 3)}</td>
                  <td style={{ ...tdStyle, color: (currentRow.worst ?? 0) > 5 ? '#dc2626' : '#b45309', fontWeight: 600 }}>
                    {fmt(currentRow.worst, 3)}
                  </td>
                  {currentRow.bands.map((v, bi) => (
                    <td key={bi} style={{ ...tdStyle, color: (v ?? 0) > 5 ? '#dc2626' : (v ?? 0) > 3 ? '#b45309' : '#374151', fontWeight: 600 }}>
                      {fmt(v, 2)}
                    </td>
                  ))}
                </tr>
              )}
              {/* Architecture rows */}
              {archResults && archResults.map((row, i) => {
                const isBest = i === 0;
                return (
                  <tr key={row.id} style={{
                    borderBottom: '1px solid #bfdbfe',
                    background: isBest ? '#dbeafe' : i < 3 ? '#eff6ff' : undefined,
                  }}>
                    <td style={{ ...tdStyle, textAlign: 'left', fontWeight: isBest ? 700 : 400, color: isBest ? '#1e3a8a' : '#374151' }}>
                      {isBest ? '🥇 1' : i === 1 ? '🥈 2' : i === 2 ? '🥉 3' : `#${i + 1}`}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'left', fontSize: 9 }}>
                      <span style={{ fontWeight: 700, color: isBest ? '#1e3a8a' : '#374151' }}>{row.label}</span>
                      <span style={{ color: '#6b7280', marginLeft: 6 }}>{row.description}</span>
                    </td>
                    <td style={{ ...tdStyle, fontWeight: isBest ? 700 : 400, color: isBest ? '#1e3a8a' : '#374151' }}>
                      {fmt(row.mae, 3)}
                    </td>
                    <td style={{ ...tdStyle, color: (row.worst ?? 0) > 5 ? '#dc2626' : (row.worst ?? 0) > 3 ? '#b45309' : '#374151' }}>
                      {fmt(row.worst, 3)}
                    </td>
                    {row.bands.map((v, bi) => {
                      const curBand = currentRow?.bands[bi];
                      const improved = v !== null && curBand !== null && v < curBand - 0.01;
                      const worse    = v !== null && curBand !== null && v > curBand + 0.01;
                      return (
                        <td key={bi} style={{
                          ...tdStyle,
                          fontWeight: isBest ? 700 : 400,
                          color: improved ? '#15803d' : worse ? '#dc2626' : (v ?? 0) > 5 ? '#dc2626' : (v ?? 0) > 3 ? '#b45309' : '#374151',
                        }}>
                          {fmt(v, 2)}{improved ? ' ▼' : worse ? ' ▲' : ''}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Architecture Sensitivity Summary ── */}
      {archResults && best && (
        <div style={{ marginTop: 12, borderTop: '1px dashed #93c5fd', paddingTop: 8 }}>
          <div style={{ fontWeight: 700, color: '#1e3a8a', fontSize: 11, fontFamily: 'monospace', marginBottom: 6 }}>
            Modal Architecture Sensitivity Report
            <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>diagnostic summary</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
            {[
              { label: 'Current Architecture', value: currentRow?.description ?? '—', note: '' },
              { label: 'Best Architecture',    value: best.label,                     note: best.description },
              { label: 'Current MAE',          value: fmt(currentRow?.mae, 3) + ' dB', note: 'baseline' },
              { label: 'Best MAE',             value: fmt(best.mae, 3) + ' dB',        note: '🥇 winner' },
              { label: 'MAE Improvement',
                value: maeDelta !== null ? (maeDelta >= 0 ? '▼ ' : '▲ ') + fmt(Math.abs(maeDelta), 3) + ' dB' : '—',
                note: maeDelta != null && maeDelta > 1.0 ? 'architecture matters significantly'
                    : maeDelta != null && maeDelta > 0.3 ? 'moderate architecture sensitivity'
                    : 'low architecture sensitivity — tuning dominates' },
              { label: 'Worst Error Improvement',
                value: worstDelta !== null ? (worstDelta >= 0 ? '▼ ' : '▲ ') + fmt(Math.abs(worstDelta), 3) + ' dB' : '—',
                note: '' },
            ].map(({ label, value, note }) => (
              <div key={label} style={{ background: '#fff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '6px 10px' }}>
                <div style={{ fontSize: 9, color: '#6b7280', fontFamily: 'monospace' }}>{label}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#1e3a8a', fontFamily: 'monospace', wordBreak: 'break-word' }}>{value}</div>
                {note && <div style={{ fontSize: 9, color: '#6b7280', fontFamily: 'monospace', marginTop: 2 }}>{note}</div>}
              </div>
            ))}
          </div>

          {/* Diagnostic conclusion */}
          <div style={{
            padding: '8px 12px', borderRadius: 6,
            background: (maeDelta ?? 0) > 1.0 ? '#fef3c7' : '#dbeafe',
            border: `1px solid ${(maeDelta ?? 0) > 1.0 ? '#fbbf24' : '#93c5fd'}`,
            fontSize: 10, fontFamily: 'monospace',
            color: (maeDelta ?? 0) > 1.0 ? '#92400e' : '#1e3a8a',
          }}>
            {(maeDelta ?? 0) > 1.0 ? (
              <>
                <strong>⚠ Modal architecture is a primary error driver.</strong> Switching from current to "{best.label}"
                reduces MAE by {fmt(maeDelta, 2)} dB. The parity gap is at least partly caused by the
                <strong> modal injection model</strong>, not just tuning parameters.
              </>
            ) : (maeDelta ?? 0) > 0.3 ? (
              <>
                <strong>Moderate architecture sensitivity ({fmt(maeDelta, 2)} dB improvement possible).</strong> Architecture
                is a secondary contributor. Tuning parameters and spectral balance likely dominate the remaining gap.
              </>
            ) : (
              <>
                <strong>✓ Low architecture sensitivity.</strong> Best architecture improves MAE by only {fmt(maeDelta ?? 0, 2)} dB.
                The remaining parity error is driven by <strong>tuning parameters or spectral balance</strong>, not the modal injection model.
              </>
            )}
          </div>

          {/* Ranked summary list */}
          <div style={{ marginTop: 8, fontSize: 9, fontFamily: 'monospace', color: '#6b7280' }}>
            Ranked: {archResults.map((r, i) => (
              <span key={r.id} style={{ color: i === 0 ? '#1e3a8a' : '#6b7280', fontWeight: i === 0 ? 700 : 400 }}>
                {i > 0 && ' · '}{r.label} ({fmt(r.mae, 2)})
              </span>
            ))}
          </div>
          <div style={{ marginTop: 4, fontSize: 9, fontFamily: 'monospace', color: '#6b7280' }}>
            ▼ = improved vs current · ▲ = worse · all other settings held constant
          </div>
        </div>
      )}
    </div>
  );
}