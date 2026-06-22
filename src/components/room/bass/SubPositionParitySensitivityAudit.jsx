/**
 * SubPositionParitySensitivityAudit — Diagnostic only. Does not affect the live graph.
 *
 * Sweeps 9 virtual sub positions and scores each against the REW benchmark.
 * Fixed settings: Direct+Modes, Reflections OFF, Q=0.8×base, Tang=0.8, ModalGain=1.0, Flat REW ref.
 *
 * Shows per position: x/y/z, MAE, worst error, worst Hz, errors at 70/80/85 Hz,
 * and dominant-mode coupling for (2,0,0) (0,3,0) (2,2,0) (0,4,0).
 */

import React, { useState, useMemo } from 'react';
import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';
import { modeShapeValueLocal } from '@/components/room/bass/core/modalCalculations';

// ── REW benchmark ────────────────────────────────────────────────────────────
const REW_BENCHMARK = [
  { hz: 20,  db: 93.1 }, { hz: 25,  db: 96.6 }, { hz: 30,  db: 95.8 },
  { hz: 34,  db: 94.1 }, { hz: 40,  db: 100.3 },{ hz: 45,  db: 98.6 },
  { hz: 50,  db: 97.5 }, { hz: 55,  db: 95.7 }, { hz: 60,  db: 91.2 },
  { hz: 63,  db: 89.8 }, { hz: 68,  db: 85.2 }, { hz: 70,  db: 83.1 },
  { hz: 75,  db: 84.4 }, { hz: 80,  db: 86.2 }, { hz: 85,  db: 88.4 },
  { hz: 90,  db: 89.1 }, { hz: 100, db: 87.3 }, { hz: 120, db: 83.6 },
  { hz: 150, db: 79.2 }, { hz: 200, db: 74.1 },
];

const FLAT_REF = [
  { hz: 20, db: 94 }, { hz: 50, db: 94 }, { hz: 100, db: 94 }, { hz: 200, db: 94 },
];

const AUDIT_MODES = [
  { nx: 2, ny: 0, nz: 0, label: '(2,0,0)' },
  { nx: 0, ny: 3, nz: 0, label: '(0,3,0)' },
  { nx: 2, ny: 2, nz: 0, label: '(2,2,0)' },
  { nx: 0, ny: 4, nz: 0, label: '(0,4,0)' },
];

const TARGET_HZ = [70, 80, 85];

// ── Helpers ──────────────────────────────────────────────────────────────────
function interp(data, hz) {
  if (!data || data.length === 0) return null;
  const sorted = [...data].sort((a, b) => a.hz - b.hz);
  if (hz <= sorted[0].hz) return sorted[0].db;
  if (hz >= sorted[sorted.length - 1].hz) return sorted[sorted.length - 1].db;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (hz >= sorted[i].hz && hz <= sorted[i + 1].hz) {
      const t = (hz - sorted[i].hz) / (sorted[i + 1].hz - sorted[i].hz);
      return sorted[i].db + t * (sorted[i + 1].db - sorted[i].db);
    }
  }
  return null;
}

function scoreAgainstBenchmark(simData) {
  const pts = REW_BENCHMARK;
  let sumErr = 0, count = 0, worstErr = 0, worstHz = 0;
  for (const { hz, db: ref } of pts) {
    const sim = interp(simData, hz);
    if (sim === null) continue;
    const err = Math.abs(sim - ref);
    sumErr += err;
    count++;
    if (err > worstErr) { worstErr = err; worstHz = hz; }
  }
  return { mae: count > 0 ? sumErr / count : null, worstErr, worstHz };
}

function errAtHz(simData, hz) {
  const sim = interp(simData, hz);
  const ref = interp(REW_BENCHMARK.map(p => ({ hz: p.hz, db: p.db })), hz);
  if (sim === null || ref === null) return null;
  return sim - ref; // signed: positive = over
}

function runSim(roomDims, seat, sub, surfaceAbsorption) {
  const seatZ = Number.isFinite(Number(seat.z)) ? Number(seat.z) : 1.2;
  const result = simulateBassResponseRewCore(
    { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM },
    { x: seat.x, y: seat.y, z: seatZ },
    sub,
    FLAT_REF,
    {
      enableReflections: false,
      enableModes: true,
      surfaceAbsorption,
      freqMinHz: 20,
      freqMaxHz: 200,
      smoothing: 'none',
      modalSourceReferenceMode: 'existing',
      modalGainScalar: 1.0,
      axialQ: 4.0 * 0.8,      // Q scale 0.8
      tangentialFamilyScale: 0.8,
      propagationPhaseScale: 0,
      pureDeterministicModalSum: true,
      disableModalPropagationPhase: true,
      disableLateField: true,
    }
  );
  // Build clean sorted series
  const raw = (result.freqsHz || []).map((hz, i) => {
    const re = result.complexPressure[i]?.re ?? 0;
    const im = result.complexPressure[i]?.im ?? 0;
    const mag = Math.sqrt(re * re + im * im);
    const db = 20 * Math.log10(Math.max(mag, 1e-10));
    return { hz, db };
  }).filter(p => Number.isFinite(p.hz) && p.hz > 0);
  raw.sort((a, b) => a.hz - b.hz);
  const deduped = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i + 1] && Math.abs(raw[i].hz - raw[i + 1].hz) < 1e-9) continue;
    deduped.push(raw[i]);
  }
  return deduped;
}

function modeCoupling(mode, subPos, seatPos, roomDims) {
  const psiSrc = modeShapeValueLocal(mode, subPos.x, subPos.y, subPos.z ?? 0.35, roomDims);
  const psiRcv = modeShapeValueLocal(mode, seatPos.x, seatPos.y, seatPos.z ?? 1.2, roomDims);
  return psiSrc * psiRcv;
}

function buildPositions(roomDims, currentSub) {
  const W = roomDims.widthM;
  const L = roomDims.lengthM;
  const Z = 0.35;
  const CORNER_OFFSET = 0.15;
  return [
    { label: 'Current sub pos', x: currentSub?.x ?? W / 2, y: currentSub?.y ?? CORNER_OFFSET, z: currentSub?.z ?? Z, isCurrent: true },
    { label: 'Front-left corner', x: CORNER_OFFSET, y: CORNER_OFFSET, z: Z },
    { label: 'Front-centre',      x: W / 2,          y: CORNER_OFFSET, z: Z },
    { label: 'Front-right corner',x: W - CORNER_OFFSET, y: CORNER_OFFSET, z: Z },
    { label: 'Mid-left wall',     x: CORNER_OFFSET, y: L / 2, z: Z },
    { label: 'Mid-right wall',    x: W - CORNER_OFFSET, y: L / 2, z: Z },
    { label: 'Rear-left corner',  x: CORNER_OFFSET, y: L - CORNER_OFFSET, z: Z },
    { label: 'Rear-centre',       x: W / 2,          y: L - CORNER_OFFSET, z: Z },
    { label: 'Rear-right corner', x: W - CORNER_OFFSET, y: L - CORNER_OFFSET, z: Z },
  ];
}

// ── Styles ───────────────────────────────────────────────────────────────────
const TH = {
  padding: '4px 6px', fontSize: 8, fontWeight: 700, fontFamily: 'monospace',
  background: '#1c1917', color: '#d6d3d1', textAlign: 'right',
  borderBottom: '2px solid #292524', whiteSpace: 'nowrap',
};
const TD = { padding: '3px 6px', fontSize: 8, fontFamily: 'monospace', textAlign: 'right' };
const TDL = { ...TD, textAlign: 'left' };

function errColor(v) {
  if (!Number.isFinite(v)) return '#6b7280';
  const a = Math.abs(v);
  if (a <= 1) return '#4ade80';
  if (a <= 3) return '#fbbf24';
  if (a <= 6) return '#fb923c';
  return '#f87171';
}
function couplingColor(v) {
  if (!Number.isFinite(v)) return '#6b7280';
  const a = Math.abs(v);
  if (a >= 0.5) return '#4ade80';
  if (a >= 0.2) return '#fbbf24';
  if (a >= 0.05) return '#fb923c';
  return '#f87171';
}
function fmt(v, d = 3) { return Number.isFinite(v) ? v.toFixed(d) : '—'; }
function fmtSigned(v, d = 2) {
  if (!Number.isFinite(v)) return '—';
  return (v >= 0 ? '+' : '') + v.toFixed(d);
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SubPositionParitySensitivityAudit({ roomDims, subs, seat, surfaceAbsorption }) {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);

  const hasRoom = !!(roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM);
  const currentSub = subs?.[0] ?? null;
  const mlpSeat = seat ?? null;

  const positions = useMemo(() => {
    if (!hasRoom) return [];
    return buildPositions(roomDims, currentSub);
  }, [hasRoom, roomDims, currentSub]);

  const run = () => {
    if (!hasRoom || !mlpSeat) return;
    setRunning(true);
    setTimeout(() => {
      try {
        const rows = positions.map(pos => {
          const virtualSub = {
            id: 'audit-sub',
            modelKey: currentSub?.modelKey ?? 'SUB2-12',
            x: pos.x, y: pos.y, z: pos.z,
            tuning: { gainDb: 0, delayMs: 0, polarity: 0 },
          };
          const simData = runSim(roomDims, mlpSeat, virtualSub, surfaceAbsorption);
          const { mae, worstErr, worstHz } = scoreAgainstBenchmark(simData);
          const errors = {};
          for (const hz of TARGET_HZ) errors[hz] = errAtHz(simData, hz);
          const couplings = {};
          for (const mode of AUDIT_MODES) {
            couplings[mode.label] = modeCoupling(
              mode, pos,
              { x: mlpSeat.x, y: mlpSeat.y, z: mlpSeat.z ?? 1.2 },
              roomDims
            );
          }
          return { ...pos, mae, worstErr, worstHz, errors, couplings };
        });
        setResults(rows);
      } catch (e) {
        console.error('[SubPositionParitySensitivityAudit]', e);
      } finally {
        setRunning(false);
      }
    }, 0);
  };

  // Find best MAE and lowest |80 Hz error| indices
  const bestMaeIdx = useMemo(() => {
    if (!results) return -1;
    let best = Infinity, idx = -1;
    results.forEach((r, i) => { if (r.mae < best) { best = r.mae; idx = i; } });
    return idx;
  }, [results]);

  const best80Idx = useMemo(() => {
    if (!results) return -1;
    let best = Infinity, idx = -1;
    results.forEach((r, i) => {
      const a = Math.abs(r.errors[80] ?? Infinity);
      if (a < best) { best = a; idx = i; }
    });
    return idx;
  }, [results]);

  return (
    <div style={{
      marginTop: 12, border: '1px solid #292524', borderRadius: 8,
      background: '#0c0a09', padding: '10px 12px',
    }}>
      {/* Header */}
      <div style={{ fontWeight: 700, color: '#d6d3d1', fontSize: 11, fontFamily: 'monospace', marginBottom: 3 }}>
        Sub Position Parity Sensitivity Audit
        <span style={{ fontWeight: 400, color: '#44403c', marginLeft: 10, fontSize: 10 }}>
          diagnostic only · does not affect live graph
        </span>
      </div>
      <div style={{ fontSize: 9, color: '#57534e', fontFamily: 'monospace', marginBottom: 8, lineHeight: 1.7 }}>
        Fixed: Direct+Modes · Reflections OFF · Q×0.8 · Tang×0.8 · ModalGain 1.0 · Flat REW reference.<br/>
        Tests 9 virtual sub positions. Errors are signed (+ = over, − = under vs REW benchmark).
      </div>

      {!hasRoom && (
        <div style={{ fontSize: 10, color: '#fbbf24', fontFamily: 'monospace', marginBottom: 6 }}>⚠ Requires room dimensions.</div>
      )}
      {hasRoom && !mlpSeat && (
        <div style={{ fontSize: 10, color: '#fbbf24', fontFamily: 'monospace', marginBottom: 6 }}>⚠ Requires a seat/MLP position.</div>
      )}

      {/* Config preview */}
      {hasRoom && mlpSeat && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 9, fontFamily: 'monospace',
          color: '#78716c', background: '#1c1917', borderRadius: 4, padding: '5px 10px', marginBottom: 8,
        }}>
          <span>Room: <strong style={{ color: '#d6d3d1' }}>
            {roomDims.widthM.toFixed(2)}W × {roomDims.lengthM.toFixed(2)}L × {roomDims.heightM.toFixed(2)}H m
          </strong></span>
          <span>MLP: <strong style={{ color: '#86efac' }}>
            ({fmt(mlpSeat.x, 3)}, {fmt(mlpSeat.y, 3)}, {fmt(mlpSeat.z ?? 1.2, 3)}) m
          </strong></span>
          {currentSub && (
            <span>Current sub: <strong style={{ color: '#93c5fd' }}>
              ({fmt(currentSub.x, 3)}, {fmt(currentSub.y, 3)}, {fmt(currentSub.z ?? 0.35, 3)}) m
            </strong></span>
          )}
        </div>
      )}

      {/* Run button */}
      {hasRoom && mlpSeat && (
        <button
          onClick={run}
          disabled={running}
          style={{
            padding: '5px 14px', borderRadius: 5, border: '1px solid #57534e',
            background: running ? '#1c1917' : '#292524', color: running ? '#57534e' : '#d6d3d1',
            fontSize: 10, fontFamily: 'monospace', cursor: running ? 'default' : 'pointer',
            marginBottom: 10, fontWeight: 700,
          }}
        >
          {running ? 'Running…' : 'Run Sub Position Sweep (9 positions)'}
        </button>
      )}

      {/* Results table */}
      {results && (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900 }}>
              <thead>
                <tr>
                  <th style={{ ...TH, textAlign: 'left', width: 140 }}>Position</th>
                  <th style={TH}>x</th>
                  <th style={TH}>y</th>
                  <th style={TH}>z</th>
                  <th style={{ ...TH, color: '#fbbf24' }}>MAE</th>
                  <th style={{ ...TH, color: '#fb923c' }}>Worst err</th>
                  <th style={TH}>Worst Hz</th>
                  <th style={{ ...TH, color: '#93c5fd' }}>70 Hz err</th>
                  <th style={{ ...TH, color: '#6ee7b7' }}>80 Hz err</th>
                  <th style={TH}>85 Hz err</th>
                  {AUDIT_MODES.map(m => (
                    <th key={m.label} style={{ ...TH, color: '#c4b5fd' }}>{m.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((row, i) => {
                  const isBestMae = i === bestMaeIdx;
                  const isBest80  = i === best80Idx;
                  const highlight = isBestMae || isBest80;
                  const bg = isBestMae && isBest80 ? '#1a2e1a'
                    : isBestMae ? '#172554'
                    : isBest80  ? '#1c2b1c'
                    : undefined;
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #1c1917', background: bg }}>
                      <td style={{
                        ...TDL,
                        fontWeight: row.isCurrent ? 700 : 400,
                        color: row.isCurrent ? '#fbbf24' : highlight ? '#e7e5e4' : '#a8a29e',
                      }}>
                        {isBestMae && <span style={{ color: '#60a5fa', marginRight: 4 }}>★</span>}
                        {isBest80  && !isBestMae && <span style={{ color: '#4ade80', marginRight: 4 }}>●</span>}
                        {row.label}
                      </td>
                      <td style={{ ...TD, color: '#d6d3d1' }}>{fmt(row.x, 3)}</td>
                      <td style={{ ...TD, color: '#d6d3d1' }}>{fmt(row.y, 3)}</td>
                      <td style={{ ...TD, color: '#6b7280' }}>{fmt(row.z, 3)}</td>
                      <td style={{ ...TD, fontWeight: 700, color: isBestMae ? '#60a5fa' : errColor(row.mae) }}>
                        {fmt(row.mae, 2)}
                      </td>
                      <td style={{ ...TD, color: errColor(row.worstErr) }}>{fmt(row.worstErr, 2)}</td>
                      <td style={{ ...TD, color: '#6b7280' }}>{row.worstHz}</td>
                      {TARGET_HZ.map(hz => (
                        <td key={hz} style={{
                          ...TD,
                          fontWeight: hz === 80 && isBest80 ? 700 : 400,
                          color: hz === 80 && isBest80 ? '#4ade80' : errColor(row.errors[hz]),
                        }}>
                          {fmtSigned(row.errors[hz])}
                        </td>
                      ))}
                      {AUDIT_MODES.map(m => (
                        <td key={m.label} style={{ ...TD, color: couplingColor(row.couplings[m.label]) }}>
                          {fmt(row.couplings[m.label], 4)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div style={{ marginTop: 8, fontSize: 9, fontFamily: 'monospace', color: '#44403c', lineHeight: 1.8, borderTop: '1px solid #1c1917', paddingTop: 6 }}>
            <strong style={{ color: '#78716c' }}>★</strong> best MAE&nbsp;&nbsp;
            <strong style={{ color: '#4ade80' }}>●</strong> lowest |80 Hz error|<br />
            Error colours: <span style={{ color: '#4ade80' }}>≤1 dB</span> · <span style={{ color: '#fbbf24' }}>≤3 dB</span> · <span style={{ color: '#fb923c' }}>≤6 dB</span> · <span style={{ color: '#f87171' }}>&gt;6 dB</span><br />
            Coupling colours: <span style={{ color: '#4ade80' }}>≥0.5 strong</span> · <span style={{ color: '#fbbf24' }}>≥0.2</span> · <span style={{ color: '#fb923c' }}>≥0.05</span> · <span style={{ color: '#f87171' }}>&lt;0.05 near-null</span>
          </div>

          {/* Interpretation */}
          <div style={{ marginTop: 8, fontSize: 9, fontFamily: 'monospace', color: '#57534e', lineHeight: 1.8 }}>
            If the best MAE position differs significantly from the current sub position, the effective acoustic source
            may not match the geometric sub position — REW parity may require a corrected source location or a
            source-coupling offset in the engine.
          </div>
        </>
      )}
    </div>
  );
}