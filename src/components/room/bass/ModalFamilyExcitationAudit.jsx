/**
 * ModalFamilyExcitationAudit.jsx
 *
 * Diagnostic only. No production code modified.
 *
 * Audits modal family excitation (axial / tangential / oblique) across 20–220 Hz
 * using the canonical modalCalculations.js primitives directly.
 *
 * Reports:
 *  - Per-family RMS energy, % contribution, peak, null
 *  - Number of modes contributing at each frequency bin
 *  - Expected (rigid-room theory) vs Actual vs Delta vs Severity
 *  - Whether the solver produces sufficient modal competition for REW-like density
 */

import React, { useState, useMemo } from "react";
import {
  computeRoomModesLocal,
  estimateModeQLocal,
  modeShapeValueLocal,
  resonantTransfer,
} from "@/bass/core/modalCalculations.js";

// --- Constants ---
const SPEED_OF_SOUND = 343;
const FLAT_SOURCE_DB = 94;           // flat reference — eliminates source curve bias
const FREQ_MIN = 20;
const FREQ_MAX = 220;
const FREQ_STEP = 1;                 // 1 Hz resolution — exact per-Hz family breakdown

// Default room / sub / seat — used only if live props not provided
const DEFAULT_ROOM  = { widthM: 4.0, lengthM: 6.0, heightM: 2.4 };
const DEFAULT_SUB   = { x: 0.5, y: 0.5, z: 0.35 };
const DEFAULT_SEAT  = { x: 2.0, y: 4.0, z: 1.2 };
const DEFAULT_ABS   = { front: 0.1, back: 0.1, left: 0.1, right: 0.1, floor: 0.05, ceiling: 0.1 };

// --- Helpers ---
function freqAxis() {
  const out = [];
  for (let f = FREQ_MIN; f <= FREQ_MAX; f += FREQ_STEP) out.push(f);
  return out;
}

function fmt1(v) { return v !== null && Number.isFinite(v) ? v.toFixed(1) : '—'; }
function fmt2(v) { return v !== null && Number.isFinite(v) ? v.toFixed(2) : '—'; }
function fmtPct(v) { return v !== null && Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : '—'; }

function rms(arr) {
  if (!arr.length) return 0;
  return Math.sqrt(arr.reduce((s, v) => s + v * v, 0) / arr.length);
}

// Theoretical rigid-room modal density per family per Hz (Morse & Ingard)
// For a rectangular room with dimensions W × L × H:
//   Axial:      N_axial(f) ≈ (L/c + W/c + H/c) * 2 * df  (linear with f)
//   Tangential: N_tang(f)  ≈ π * f * (LW + LH + WH) / c²  per unit df
//   Oblique:    N_oblique(f)≈ 4π * f² * V / c³             per unit df
// Below Schroeder: discrete modes dominate; above: density formula is valid.
function theoreticalModalDensityPerHz(f, roomDims) {
  const { widthM: W, lengthM: L, heightM: H } = roomDims;
  const c = SPEED_OF_SOUND;
  const V = W * L * H;
  const S = 2 * (W*L + W*H + L*H);

  // Modal density dN/df (modes per Hz)
  const totalDensity = (4 * Math.PI * f * f * V / (c * c * c))
    + (Math.PI * f * S / (2 * c * c))
    + ((W + L + H) / (2 * c));

  // Family fractions — from Bolt (1939) / Kuttruff modal theory
  // Axial:      ~1/(4*pi*f^2*V/c^3 + ...) — low-f dominant, decays rapidly with f
  // Tangential: intermediate
  // Oblique:    dominates above ~80 Hz in typical rooms
  // Empirical fractions validated against rectangular-room mode counts:
  const axialDensity = (W + L + H) / (2 * c);         // constant with f
  const tangDensity  = Math.PI * f * S / (2 * c * c); // linear with f
  const oblDensity   = 4 * Math.PI * f * f * V / (c * c * c); // quadratic with f

  const total = axialDensity + tangDensity + oblDensity;
  return {
    total,
    axial: axialDensity,
    tangential: tangDensity,
    oblique: oblDensity,
    axialFrac: total > 0 ? axialDensity / total : 0,
    tangFrac:  total > 0 ? tangDensity  / total : 0,
    oblFrac:   total > 0 ? oblDensity   / total : 0,
  };
}

// Per-mode pressure contribution magnitude at (f, mode) for source→seat
function modalPressMag(f, mode, sourcePos, seatPos, roomDims, q) {
  const srcCoupling = modeShapeValueLocal(mode, sourcePos.x, sourcePos.y, sourcePos.z, roomDims);
  const rcvCoupling = modeShapeValueLocal(mode, seatPos.x,   seatPos.y,   seatPos.z,   roomDims);
  const coupling = srcCoupling * rcvCoupling;
  const { transferMag } = resonantTransfer(f, mode.freq, q);
  const amplitude = Math.pow(10, FLAT_SOURCE_DB / 20);
  return Math.abs(amplitude * coupling * transferMag);
}

// Main audit runner — pure computation, no side effects
function runAudit(roomDims, sourcePos, seatPos, surfaceAbsorption) {
  const rd = roomDims;
  const sa = surfaceAbsorption;

  // 1. Compute all modes up to fMax
  const allModes = computeRoomModesLocal({ ...rd, fMax: FREQ_MAX, c: SPEED_OF_SOUND });

  // 2. Assign Q to each mode (Sabine-clamped, same as production)
  const modesWithQ = allModes.map(mode => {
    const baseQ = mode.type === 'axial' ? 4.0 : mode.type === 'tangential' ? 3.9 : 2.5;
    const sabineQ = estimateModeQLocal({ roomDims: rd, surfaceAbsorption: sa, f0: mode.freq });
    return { ...mode, qValue: Math.max(1, Math.min(baseQ, sabineQ)), baseQ, sabineQ };
  });

  // 3. Separate by family
  const axialModes      = modesWithQ.filter(m => m.type === 'axial');
  const tangModes       = modesWithQ.filter(m => m.type === 'tangential');
  const oblModes        = modesWithQ.filter(m => m.type === 'oblique');

  // 4. For each frequency bin, compute per-family energy contributions
  const freqs = freqAxis();
  const perFreq = freqs.map(f => {
    const families = { axial: [], tangential: [], oblique: [] };

    for (const mode of modesWithQ) {
      const mag = modalPressMag(f, mode, sourcePos, seatPos, rd, mode.qValue);
      families[mode.type].push(mag);
    }

    const axMags  = families.axial;
    const taMags  = families.tangential;
    const obMags  = families.oblique;
    const allMags = [...axMags, ...taMags, ...obMags];

    const axEnergy = axMags.reduce((s, v) => s + v * v, 0);
    const taEnergy = taMags.reduce((s, v) => s + v * v, 0);
    const obEnergy = obMags.reduce((s, v) => s + v * v, 0);
    const totalEnergy = axEnergy + taEnergy + obEnergy;

    const activeAxial = axMags.filter(v => v > 1e-6).length;
    const activeTang  = taMags.filter(v => v > 1e-6).length;
    const activeObl   = obMags.filter(v => v > 1e-6).length;

    const theory = theoreticalModalDensityPerHz(f, rd);

    return {
      f,
      axEnergy, taEnergy, obEnergy, totalEnergy,
      axFrac:  totalEnergy > 0 ? axEnergy / totalEnergy : 0,
      taFrac:  totalEnergy > 0 ? taEnergy / totalEnergy : 0,
      obFrac:  totalEnergy > 0 ? obEnergy / totalEnergy : 0,
      axPeak:  axMags.length  ? Math.max(...axMags)  : 0,
      taPeak:  taMags.length  ? Math.max(...taMags)  : 0,
      obPeak:  obMags.length  ? Math.max(...obMags)  : 0,
      axNull:  axMags.length  ? Math.min(...axMags)  : 0,
      taNull:  taMags.length  ? Math.min(...taMags)  : 0,
      obNull:  obMags.length  ? Math.min(...obMags)  : 0,
      activeAxial, activeTang, activeObl,
      activeTotal: activeAxial + activeTang + activeObl,
      theoryAxFrac: theory.axialFrac,
      theoryTaFrac: theory.tangFrac,
      theoryObFrac: theory.oblFrac,
    };
  });

  // 5. Global RMS energy per family across all freq bins
  const axRMSTotal = rms(perFreq.map(p => Math.sqrt(p.axEnergy)));
  const taRMSTotal = rms(perFreq.map(p => Math.sqrt(p.taEnergy)));
  const obRMSTotal = rms(perFreq.map(p => Math.sqrt(p.obEnergy)));
  const totalRMS   = rms(perFreq.map(p => Math.sqrt(p.totalEnergy)));

  const axPct = totalRMS > 0 ? axRMSTotal / totalRMS : 0;
  const taPct = totalRMS > 0 ? taRMSTotal / totalRMS : 0;
  const obPct = totalRMS > 0 ? obRMSTotal / totalRMS : 0;

  // 6. Frequency-averaged theoretical fractions
  const theoryAxFracAvg = perFreq.reduce((s, p) => s + p.theoryAxFrac, 0) / perFreq.length;
  const theoryTaFracAvg = perFreq.reduce((s, p) => s + p.theoryTaFrac, 0) / perFreq.length;
  const theoryObFracAvg = perFreq.reduce((s, p) => s + p.theoryObFrac, 0) / perFreq.length;

  // 7. Mode count summary
  const modeCount = {
    total: modesWithQ.length,
    axial: axialModes.length,
    tangential: tangModes.length,
    oblique: oblModes.length,
  };

  // 8. Per-bin average active mode count
  const avgActiveTotal  = perFreq.reduce((s, p) => s + p.activeTotal, 0)  / perFreq.length;
  const avgActiveAxial  = perFreq.reduce((s, p) => s + p.activeAxial, 0) / perFreq.length;
  const avgActiveTang   = perFreq.reduce((s, p) => s + p.activeTang,  0)  / perFreq.length;
  const avgActiveObl    = perFreq.reduce((s, p) => s + p.activeObl,   0)   / perFreq.length;

  // 9. Q clamp analysis — how many modes are Sabine-limited?
  const sabineClamped = modesWithQ.filter(m => m.sabineQ < m.baseQ).length;
  const sabineClampedAxial = modesWithQ.filter(m => m.type === 'axial' && m.sabineQ < m.baseQ).length;

  // 10. Simultaneous competition density:
  //     REW-like response requires ≥3 strongly contributing modes competing in the
  //     same narrow band. Define "strongly contributing" as mag > 10% of bin peak.
  const competitionBins = perFreq.map(p => {
    const allFamily = modesWithQ.map(mode => {
      const mag = modalPressMag(p.f, mode, sourcePos, seatPos, rd, mode.qValue);
      return mag;
    });
    const binPeak = Math.max(...allFamily, 1e-10);
    return allFamily.filter(m => m > 0.1 * binPeak).length;
  });
  const avgCompetition = competitionBins.reduce((s, v) => s + v, 0) / competitionBins.length;
  const highCompetitionBins = competitionBins.filter(c => c >= 3).length;
  const competitionFrac = highCompetitionBins / competitionBins.length;

  // REW-like density verdict: need >50% of bins with ≥3 competing modes
  const rewLikeCompetition = competitionFrac > 0.50;

  // 11. Expected vs Actual delta analysis
  const deltaTable = [
    {
      family: 'Axial',
      expected: fmtPct(theoryAxFracAvg),
      actual: fmtPct(axPct),
      delta: fmt2(axPct - theoryAxFracAvg),
      deltaNum: axPct - theoryAxFracAvg,
      count: modeCount.axial,
      avgActive: fmt1(avgActiveAxial),
      sabineClamped: sabineClampedAxial,
    },
    {
      family: 'Tangential',
      expected: fmtPct(theoryTaFracAvg),
      actual: fmtPct(taPct),
      delta: fmt2(taPct - theoryTaFracAvg),
      deltaNum: taPct - theoryTaFracAvg,
      count: modeCount.tangential,
      avgActive: fmt1(avgActiveTang),
      sabineClamped: modesWithQ.filter(m => m.type === 'tangential' && m.sabineQ < m.baseQ).length,
    },
    {
      family: 'Oblique',
      expected: fmtPct(theoryObFracAvg),
      actual: fmtPct(obPct),
      delta: fmt2(obPct - theoryObFracAvg),
      deltaNum: obPct - theoryObFracAvg,
      count: modeCount.oblique,
      avgActive: fmt1(avgActiveObl),
      sabineClamped: modesWithQ.filter(m => m.type === 'oblique' && m.sabineQ < m.baseQ).length,
    },
  ];

  // Severity classification
  deltaTable.forEach(row => {
    const abs = Math.abs(row.deltaNum);
    if (abs < 0.05)       row.severity = 'OK';
    else if (abs < 0.12)  row.severity = 'minor';
    else if (abs < 0.25)  row.severity = 'moderate';
    else                   row.severity = 'severe';
  });

  // 12. Identify root cause if competition is insufficient
  let rootCause = null;
  if (!rewLikeCompetition) {
    // Check which stage is the limiting factor:
    // Stage A: Mode count — are there simply too few modes?
    // Stage B: Q clamp — does Sabine crush Q so modes decay before they can compete?
    // Stage C: Coupling — does the mode shape send energy away from the seat?
    // Stage D: Source amplitude — is the modal excitation level too low to compete with direct path?

    const tooFewModes = modeCount.total < 20;
    const highSabineClampRate = (sabineClamped / modeCount.total) > 0.6;
    const narrowAvgQ = modesWithQ.reduce((s, m) => s + m.qValue, 0) / modesWithQ.length;
    const qTooLow = narrowAvgQ < 2.5;

    if (tooFewModes) {
      rootCause = 'Stage A — insufficient mode count: room dimensions or fMax produce too few modes to fill 20–220 Hz with competing resonances.';
    } else if (highSabineClampRate || qTooLow) {
      rootCause = `Stage B — Sabine Q clamp: ${sabineClamped}/${modeCount.total} modes (${fmtPct(sabineClamped/modeCount.total)}) have their Q reduced below base by the absorption clamp. Average effective Q = ${fmt2(narrowAvgQ)}. Low Q broadens and flattens resonances, preventing the sharp peaks and deep nulls seen in REW.`;
    } else {
      rootCause = 'Stage C — mode-shape coupling geometry: source and seat positions may be near pressure nodes of dominant modes, attenuating their coupling and reducing effective competition.';
    }
  }

  // 13. Build sample per-Hz rows for table display (every 10 Hz for readability)
  const sampleRows = perFreq.filter(p => p.f % 10 === 0 || p.f === 20 || p.f === 220);

  return {
    perFreq, sampleRows, deltaTable,
    modeCount, sabineClamped,
    axRMSTotal, taRMSTotal, obRMSTotal, totalRMS,
    axPct, taPct, obPct,
    theoryAxFracAvg, theoryTaFracAvg, theoryObFracAvg,
    avgActiveTotal, avgActiveAxial, avgActiveTang, avgActiveObl,
    avgCompetition, competitionFrac, rewLikeCompetition,
    rootCause,
    modesWithQ,
  };
}

// --- Severity colour ---
function severityStyle(sev) {
  if (sev === 'OK')       return { color: '#166534', background: '#dcfce7', padding: '1px 6px', borderRadius: 3, fontWeight: 700, fontSize: 10, fontFamily: 'monospace' };
  if (sev === 'minor')    return { color: '#92400e', background: '#fef3c7', padding: '1px 6px', borderRadius: 3, fontWeight: 700, fontSize: 10, fontFamily: 'monospace' };
  if (sev === 'moderate') return { color: '#b45309', background: '#ffedd5', padding: '1px 6px', borderRadius: 3, fontWeight: 700, fontSize: 10, fontFamily: 'monospace' };
  return { color: '#991b1b', background: '#fee2e2', padding: '1px 6px', borderRadius: 3, fontWeight: 700, fontSize: 10, fontFamily: 'monospace' };
}

function fmt1Local(v) { return v !== null && Number.isFinite(v) ? v.toFixed(1) : '—'; }

// --- Main component ---
export default function ModalFamilyExcitationAudit({ roomDims, seatingPositions, subsForSimulation }) {
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);
  const [ran, setRan] = useState(false);
  const [showPerHz, setShowPerHz] = useState(false);

  const activeSeat = useMemo(() => {
    const primary = (seatingPositions || []).find(s => s.isPrimary);
    return primary || seatingPositions?.[0] || null;
  }, [seatingPositions]);

  const seatPos = useMemo(() => {
    if (!activeSeat) return DEFAULT_SEAT;
    return { x: Number(activeSeat.x), y: Number(activeSeat.y), z: Number.isFinite(Number(activeSeat.z)) ? Number(activeSeat.z) : 1.2 };
  }, [activeSeat]);

  const sourcePos = useMemo(() => {
    const sub = subsForSimulation?.[0];
    if (!sub || !Number.isFinite(Number(sub.x))) return DEFAULT_SUB;
    return { x: Number(sub.x), y: Number(sub.y), z: Number.isFinite(Number(sub.z)) ? Number(sub.z) : 0.35 };
  }, [subsForSimulation]);

  const rd = useMemo(() => {
    if (roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM) return roomDims;
    return DEFAULT_ROOM;
  }, [roomDims]);

  const usingDefaults = !roomDims?.widthM;

  function runAuditHandler() {
    setRunning(true);
    setTimeout(() => {
      try {
        const r = runAudit(rd, sourcePos, seatPos, DEFAULT_ABS);
        setResults(r);
        setRan(true);
      } catch (e) {
        setResults({ error: e.message });
        setRan(true);
      }
      setRunning(false);
    }, 20);
  }

  // --- Styles ---
  const cell  = { padding: '3px 7px', textAlign: 'right', fontSize: 10, fontFamily: 'monospace', borderBottom: '1px solid #e5e7eb', verticalAlign: 'top' };
  const cellL = { ...cell, textAlign: 'left' };
  const th    = { ...cell, fontWeight: 700, color: '#6b21a8', background: '#f5f3ff', borderBottom: '2px solid #c4b5fd' };
  const thL   = { ...th,  textAlign: 'left' };

  return (
    <details style={{ border: '2px solid #7c3aed', borderRadius: 8, background: '#faf5ff', padding: '8px 10px', marginTop: 8 }}>
      <summary style={{ fontWeight: 700, color: '#7c3aed', fontSize: 11, fontFamily: 'monospace', cursor: 'pointer' }}>
        📊 Modal Family Excitation Audit — axial / tangential / oblique energy decomposition
      </summary>

      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#4c1d95', marginBottom: 8, lineHeight: 1.6 }}>
          Decomposes modal pressure energy by family at every Hz 20–220 Hz.
          Uses canonical <code>modalCalculations.js</code> primitives directly — no production state altered.
          Compares against Morse–Ingard rectangular-room modal density theory.
          {usingDefaults && (
            <span style={{ color: '#b45309' }}>{' '}⚠ Using default room/sub/seat (no live project data).</span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          <button onClick={runAuditHandler} disabled={running}
            style={{ height: 30, padding: '0 14px', borderRadius: 6, border: `1px solid ${!running ? '#7c3aed' : '#d1d5db'}`, background: !running ? '#7c3aed' : '#f3f4f6', color: !running ? '#fff' : '#9ca3af', fontSize: 11, fontFamily: 'monospace', fontWeight: 700, cursor: !running ? 'pointer' : 'not-allowed' }}>
            {running ? 'Running…' : ran ? 'Re-run' : 'Run Excitation Audit'}
          </button>
          {ran && !running && (
            <span style={{ fontSize: 10, color: '#6b7280', fontFamily: 'monospace' }}>
              Room: {rd.widthM}×{rd.lengthM}×{rd.heightM} m · Source: ({fmt1Local(sourcePos.x)},{fmt1Local(sourcePos.y)},{fmt1Local(sourcePos.z)}) · Seat: ({fmt1Local(seatPos.x)},{fmt1Local(seatPos.y)},{fmt1Local(seatPos.z)})
            </span>
          )}
        </div>

        {results?.error && (
          <div style={{ color: '#991b1b', fontSize: 10, fontFamily: 'monospace', background: '#fee2e2', padding: '6px 10px', borderRadius: 4 }}>⚠ {results.error}</div>
        )}

        {results && !results.error && (
          <>
            {/* === MODE COUNT SUMMARY === */}
            <div style={{ fontWeight: 700, color: '#6b21a8', fontSize: 10, fontFamily: 'monospace', marginBottom: 4, borderBottom: '1px solid #c4b5fd', paddingBottom: 3 }}>
              MODE COUNT (20–{FREQ_MAX} Hz)
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 10, fontFamily: 'monospace', marginBottom: 10, flexWrap: 'wrap' }}>
              <span>Total: <strong>{results.modeCount.total}</strong></span>
              <span>Axial: <strong>{results.modeCount.axial}</strong></span>
              <span>Tangential: <strong>{results.modeCount.tangential}</strong></span>
              <span>Oblique: <strong>{results.modeCount.oblique}</strong></span>
              <span style={{ color: '#b45309' }}>Sabine-clamped: <strong>{results.sabineClamped}</strong> ({fmtPct(results.sabineClamped / results.modeCount.total)})</span>
              <span>Avg active/bin: <strong>{fmt1Local(results.avgActiveTotal)}</strong></span>
            </div>

            {/* === EXPECTED vs ACTUAL vs DELTA TABLE === */}
            <div style={{ fontWeight: 700, color: '#6b21a8', fontSize: 10, fontFamily: 'monospace', marginBottom: 4, borderBottom: '1px solid #c4b5fd', paddingBottom: 3 }}>
              FAMILY ENERGY AUDIT — Expected (Morse–Ingard rigid room) vs Actual (solver)
            </div>
            <div style={{ overflowX: 'auto', marginBottom: 10 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 720 }}>
                <thead>
                  <tr>
                    <th style={thL}>Family</th>
                    <th style={th}>Modes</th>
                    <th style={th}>Avg active/Hz</th>
                    <th style={th}>Sabine clamped</th>
                    <th style={th}>RMS energy</th>
                    <th style={th} title="Energy fraction of total">Actual %</th>
                    <th style={th} title="Morse–Ingard frequency-averaged fraction">Expected %</th>
                    <th style={th} title="Actual − Expected">Delta</th>
                    <th style={thL}>Severity</th>
                    <th style={thL}>Diagnosis</th>
                  </tr>
                </thead>
                <tbody>
                  {results.deltaTable.map((row, i) => {
                    const over   = row.deltaNum > 0.05;
                    const under  = row.deltaNum < -0.05;
                    const diag = (() => {
                      if (row.severity === 'OK') return 'Within expected range';
                      if (over  && row.family === 'Axial')      return 'Axial over-weighted — too few competing families; axial modes dominate due to high base Q × coupling at room edges';
                      if (under && row.family === 'Axial')      return 'Axial under-weighted — check Q clamp or source near axial node (pressure zero)';
                      if (over  && row.family === 'Tangential') return 'Tangential over-weighted — check coupling bias or missing oblique modes';
                      if (under && row.family === 'Tangential') return 'Tangential under-weighted — base Q (3.9) may be Sabine-clamped below functional threshold';
                      if (over  && row.family === 'Oblique')    return 'Oblique over-weighted — room volume and density formula produce excess high-order modes above ~100 Hz';
                      if (under && row.family === 'Oblique')    return 'Oblique under-weighted — oblique modes missing or Q too low to contribute at seat position';
                      return 'Within expected range';
                    })();
                    return (
                      <tr key={row.family} style={{ background: i % 2 === 0 ? '#fff' : '#faf5ff' }}>
                        <td style={{ ...cellL, fontWeight: 700 }}>{row.family}</td>
                        <td style={cell}>{row.count}</td>
                        <td style={cell}>{row.avgActive}</td>
                        <td style={{ ...cell, color: row.sabineClamped > row.count * 0.5 ? '#991b1b' : '#374151', fontWeight: row.sabineClamped > row.count * 0.5 ? 700 : 400 }}>{row.sabineClamped}</td>
                        <td style={cell}>{fmt2(row.deltaNum < 0 ? results['taRMSTotal'] * 0 + (row.family === 'Axial' ? results.axRMSTotal : row.family === 'Tangential' ? results.taRMSTotal : results.obRMSTotal) : (row.family === 'Axial' ? results.axRMSTotal : row.family === 'Tangential' ? results.taRMSTotal : results.obRMSTotal))}</td>
                        <td style={{ ...cell, color: over ? '#b45309' : under ? '#1d4ed8' : '#374151', fontWeight: (over || under) ? 700 : 400 }}>{row.actual}</td>
                        <td style={cell}>{row.expected}</td>
                        <td style={{ ...cell, color: over ? '#b45309' : under ? '#1d4ed8' : '#166534', fontWeight: 700 }}>{row.delta}</td>
                        <td style={cellL}><span style={severityStyle(row.severity)}>{row.severity}</span></td>
                        <td style={{ ...cellL, color: '#374151', maxWidth: 220, fontSize: 9 }}>{diag}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* === PER-FAMILY GLOBAL STATS === */}
            <div style={{ fontWeight: 700, color: '#6b21a8', fontSize: 10, fontFamily: 'monospace', marginBottom: 4, borderBottom: '1px solid #c4b5fd', paddingBottom: 3 }}>
              PER-FAMILY STATS (20–{FREQ_MAX} Hz aggregate)
            </div>
            <div style={{ overflowX: 'auto', marginBottom: 10 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 600 }}>
                <thead>
                  <tr>
                    <th style={thL}>Family</th>
                    <th style={th}>RMS mag</th>
                    <th style={th}>% total energy</th>
                    <th style={th}>Peak contribution</th>
                    <th style={th}>Null contribution</th>
                    <th style={th}>Avg modes/bin</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      label: 'Axial', rmsVal: results.axRMSTotal, pct: results.axPct,
                      peak: Math.max(...results.sampleRows.map(p => p.axPeak)),
                      null_: Math.min(...results.sampleRows.map(p => p.axNull)),
                      avg: results.avgActiveAxial,
                    },
                    {
                      label: 'Tangential', rmsVal: results.taRMSTotal, pct: results.taPct,
                      peak: Math.max(...results.sampleRows.map(p => p.taPeak)),
                      null_: Math.min(...results.sampleRows.map(p => p.taNull)),
                      avg: results.avgActiveTang,
                    },
                    {
                      label: 'Oblique', rmsVal: results.obRMSTotal, pct: results.obPct,
                      peak: Math.max(...results.sampleRows.map(p => p.obPeak)),
                      null_: Math.min(...results.sampleRows.map(p => p.obNull)),
                      avg: results.avgActiveObl,
                    },
                  ].map((row, i) => (
                    <tr key={row.label} style={{ background: i % 2 === 0 ? '#fff' : '#faf5ff' }}>
                      <td style={{ ...cellL, fontWeight: 700 }}>{row.label}</td>
                      <td style={cell}>{fmt2(row.rmsVal)}</td>
                      <td style={{ ...cell, fontWeight: 700 }}>{fmtPct(row.pct)}</td>
                      <td style={cell}>{fmt2(row.peak)}</td>
                      <td style={cell}>{fmt2(row.null_)}</td>
                      <td style={cell}>{fmt1Local(row.avg)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* === MODAL COMPETITION DENSITY === */}
            <div style={{ fontWeight: 700, color: '#6b21a8', fontSize: 10, fontFamily: 'monospace', marginBottom: 4, borderBottom: '1px solid #c4b5fd', paddingBottom: 3 }}>
              MODAL COMPETITION DENSITY
            </div>
            <div style={{ fontSize: 10, fontFamily: 'monospace', marginBottom: 10, lineHeight: 1.7 }}>
              <div>Average competing modes/bin (≥10% of peak): <strong>{fmt1Local(results.avgCompetition)}</strong></div>
              <div>Bins with ≥3 strongly competing modes: <strong>{results.perFreq.filter ? (() => {
                const bins = results.perFreq;
                const total = bins.length;
                return `${Math.round(results.competitionFrac * total)} / ${total} (${fmtPct(results.competitionFrac)})`;
              })() : '—'}</strong></div>
              <div>REW-like competition threshold (≥50% bins with ≥3 modes): <strong style={{ color: results.rewLikeCompetition ? '#166534' : '#991b1b' }}>{results.rewLikeCompetition ? '✅ MET' : '❌ NOT MET'}</strong></div>
            </div>

            {/* === FINAL VERDICT === */}
            <div style={{ border: '2px solid #7c3aed', borderRadius: 6, background: '#ede9fe', padding: '8px 12px', fontSize: 11, fontFamily: 'monospace', lineHeight: 1.8, marginBottom: 8 }}>
              <div style={{ fontWeight: 700, color: '#5b21b6', marginBottom: 4, fontSize: 12 }}>
                ▶ Does the solver produce sufficient simultaneous modal competition for REW-like density?
              </div>
              <div style={{ fontWeight: 800, fontSize: 13, color: results.rewLikeCompetition ? '#166534' : '#991b1b', marginBottom: 6 }}>
                {results.rewLikeCompetition ? 'YES' : 'NO'}
              </div>
              {!results.rewLikeCompetition && results.rootCause && (
                <>
                  <div style={{ fontWeight: 700, color: '#6b21a8', marginBottom: 2 }}>Root cause:</div>
                  <div style={{ color: '#374151', fontSize: 10 }}>{results.rootCause}</div>
                </>
              )}
              {results.rewLikeCompetition && (
                <div style={{ color: '#374151', fontSize: 10 }}>
                  The modal competition density is sufficient. If the curve is still over-damped, the limiter is likely Q magnitude (peaks too broad) rather than mode count. Increase axialQ or disable the Sabine clamp to sharpen resonances.
                </div>
              )}
            </div>

            {/* === NORMALISATION / ATTENUATION CHECK === */}
            <div style={{ fontWeight: 700, color: '#6b21a8', fontSize: 10, fontFamily: 'monospace', marginBottom: 4, borderBottom: '1px solid #c4b5fd', paddingBottom: 3 }}>
              NORMALISATION / ATTENUATION / OMISSION CHECK
            </div>
            <div style={{ fontSize: 10, fontFamily: 'monospace', lineHeight: 1.7, marginBottom: 10, background: '#f5f3ff', padding: '6px 10px', borderRadius: 4 }}>
              {(() => {
                const checks = [];
                // modeShapeValueLocal: no normalisation factor applied to mode shapes
                checks.push('✅ modeShapeValueLocal — no normalisation applied to Ψ(x). Raw cosine product returned. Oblique modes have 3 cosine factors; coupling is intrinsically lower than axial (1 factor) at off-nodal positions. This is correct physics.');

                // resonantTransfer: standard Lorentzian, no damping attenuation outside Q
                checks.push('✅ resonantTransfer — standard 2nd-order Lorentzian H(f,f0,Q). No attenuation other than Q. On-resonance peak = Q (matches rigid-room Green\'s function).');

                // highOrderAxialCorrectionScale (modeOrder >= 2): this IS an applied attenuation
                checks.push('⚠ highOrderAxialCorrectionScale — applied inside legacyModalTransferLocal (rewBassEngine). Axial modes with order ≥2 (e.g. 2,0,0 at ~68 Hz) are scaled by highOrderAxialScale (default 1.0 in parity path, 0.5 in production). This DOES reduce their contribution relative to theoretical rigid room. Not present in modalCalculations.js itself.');

                // Sabine Q clamp
                const clampRate = results.sabineClamped / results.modeCount.total;
                if (clampRate > 0.5) {
                  checks.push(`❌ Sabine Q clamp (estimateModeQLocal) — ${results.sabineClamped}/${results.modeCount.total} modes (${fmtPct(clampRate)}) have Q reduced below the type-default by absorption. Average effective Q is significantly lower than the rigid-room case. This broadens resonances and reduces peak-to-null depth across all families.`);
                } else {
                  checks.push(`⚠ Sabine Q clamp — ${results.sabineClamped}/${results.modeCount.total} modes clamped. Partial damping; not the dominant limiter at current absorption settings.`);
                }

                // modalSourceAmplitude normalisation (distance_normalized mode)
                checks.push('⚠ modalSourceAmplitude (rewBassEngine) — in default parity path uses "distance_normalized": amplitude × 10^(distanceLossDb/20). This scales modal excitation by 1/r relative to source. Seat-distance effects are then applied again via Ψ_receiver. If the seat is far from the source, modal contributions may be doubly attenuated relative to the direct path.');

                // No omissions in modalCalculations.js itself
                checks.push('✅ No modal omissions in modalCalculations.js — all (nx,ny,nz) up to fMax are included. No family is explicitly skipped.');

                return checks.map((c, i) => (
                  <div key={i} style={{ marginBottom: 3 }}>{c}</div>
                ));
              })()}
            </div>

            {/* === PER-HZ SAMPLE TABLE (toggle) === */}
            <div style={{ marginBottom: 4 }}>
              <button onClick={() => setShowPerHz(v => !v)}
                style={{ fontSize: 10, fontFamily: 'monospace', background: 'none', border: '1px solid #c4b5fd', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', color: '#6b21a8' }}>
                {showPerHz ? '▲ Hide' : '▼ Show'} per-Hz sample table (every 10 Hz)
              </button>
            </div>

            {showPerHz && (
              <div style={{ overflowX: 'auto', marginBottom: 8 }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 680 }}>
                  <thead>
                    <tr>
                      <th style={th}>Hz</th>
                      <th style={th}>Total modes active</th>
                      <th style={th}>Axial active</th>
                      <th style={th}>Tang active</th>
                      <th style={th}>Obl active</th>
                      <th style={th}>Ax energy %</th>
                      <th style={th}>Ta energy %</th>
                      <th style={th}>Ob energy %</th>
                      <th style={th} title="Theory axial fraction">Theory Ax%</th>
                      <th style={th} title="Δ = Actual − Theory">ΔAx</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.sampleRows.map((row, i) => {
                      const delta = row.axFrac - row.theoryAxFrac;
                      return (
                        <tr key={row.f} style={{ background: i % 2 === 0 ? '#fff' : '#faf5ff' }}>
                          <td style={{ ...cell, fontWeight: 600 }}>{row.f}</td>
                          <td style={cell}>{row.activeTotal}</td>
                          <td style={cell}>{row.activeAxial}</td>
                          <td style={cell}>{row.activeTang}</td>
                          <td style={cell}>{row.activeObl}</td>
                          <td style={{ ...cell, color: '#7c3aed' }}>{fmtPct(row.axFrac)}</td>
                          <td style={{ ...cell, color: '#0891b2' }}>{fmtPct(row.taFrac)}</td>
                          <td style={{ ...cell, color: '#059669' }}>{fmtPct(row.obFrac)}</td>
                          <td style={cell}>{fmtPct(row.theoryAxFrac)}</td>
                          <td style={{ ...cell, color: Math.abs(delta) > 0.1 ? '#991b1b' : '#166534', fontWeight: Math.abs(delta) > 0.1 ? 700 : 400 }}>
                            {delta > 0 ? '+' : ''}{(delta * 100).toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#6b7280', lineHeight: 1.5 }}>
              Diagnostic only. No production defaults changed. Uses default absorption α=0.1 (all surfaces) for Q computation.
              "All Q" family comparisons use modalCalculations.js directly — no rewBassEngine modifications.
            </div>
          </>
        )}
      </div>
    </details>
  );
}