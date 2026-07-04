// LiveModalVectorBuildPanel.jsx
// Temporary diagnostic panel — Bass Response page. Placed below Live Modal Contributor Audit.
// Reuses the exact same live engine options/curve as that panel (imported, not duplicated).
// Reads only the additive debug fields the engine now exposes (perFrequencyVectorDebug,
// contributorsInEngineOrder, muteModeKey) — zero physics/graph changes.
//
// Case 029/030 upgrade: adds per-addition classification (constructive/destructive),
// automatic top-5 constructive/destructive ranking, and a diagnostic one-at-a-time
// mute sensitivity analysis for the top-5 destructive contributors. All additions are
// read-only forensic reporting — no production calculation is altered.

import React, { useState, useCallback } from 'react';
import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';
import { LIVE_SOURCE_CURVE, buildLiveEngineOptions } from './LiveModalContributorAudit';

function buildSeatLabels(seatingPositions) {
  const ordered = [...(seatingPositions || [])].sort((a, b) => {
    const ra = Number(a?.row || a?.rowNumber) || 1;
    const rb = Number(b?.row || b?.rowNumber) || 1;
    if (ra !== rb) return ra - rb;
    return (Number(a?.x) || 0) - (Number(b?.x) || 0);
  });
  return ordered.map((seat) => {
    const sid = seat.id || `${seat.x}-${seat.y}`;
    const rowNum = Number(seat?.row || seat?.rowNumber) || 1;
    const rowSeats = ordered.filter((s) => (Number(s?.row || s?.rowNumber) || 1) === rowNum);
    const posInRow = rowSeats.findIndex((s) => (s.id || `${s.x}-${s.y}`) === sid) + 1;
    return { id: sid, label: `R${rowNum}S${posInRow}`, seat };
  });
}

function vecMagPhase(re, im) {
  const magnitude = Math.sqrt(re * re + im * im);
  const phaseDeg = (Math.atan2(im, re) * 180) / Math.PI;
  return { magnitude, phaseDeg };
}
function fmt(v, d = 3) { return Number.isFinite(v) ? v.toFixed(d) : '—'; }
function toDb(mag) { return 20 * Math.log10(Math.max(mag, 1e-10)); }

// Classification of one modal addition relative to the running vector it was added to.
// ratio = deltaMagnitude / addedModeMagnitude. This reflects how much of the added
// mode's own magnitude actually landed as a net magnitude change on the running sum
// (i.e. how aligned/anti-aligned it was with the pre-existing running vector).
function classifyAddition(deltaMag, addedMagnitude) {
  if (!Number.isFinite(addedMagnitude) || addedMagnitude <= 1e-12) return 'Neutral';
  const ratio = deltaMag / addedMagnitude;
  if (ratio > 0.5) return 'Strongly constructive';
  if (ratio > 0.15) return 'Weakly constructive';
  if (ratio >= -0.15) return 'Neutral';
  if (ratio >= -0.5) return 'Weakly destructive';
  return 'Strongly destructive';
}

const th = { textAlign: 'right', padding: '3px 5px', fontSize: 9, fontWeight: 700, background: '#fdf4ff', borderBottom: '2px solid #d8b4fe', color: '#6b21a8', whiteSpace: 'nowrap' };
const td = { textAlign: 'right', padding: '2px 5px', fontSize: 9, fontFamily: 'monospace' };
const classColor = (label) => {
  if (label === 'Strongly constructive') return '#15803d';
  if (label === 'Weakly constructive') return '#65a30d';
  if (label === 'Neutral') return '#6b7280';
  if (label === 'Weakly destructive') return '#c2410c';
  return '#b91c1c'; // Strongly destructive
};

export default function LiveModalVectorBuildPanel({ roomDims, seatingPositions, subsForSimulation, surfaceAbsorption }) {
  const [frequencyHz, setFrequencyHz] = useState(30.0);
  const [selectedSeatId, setSelectedSeatId] = useState(null);
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [sensitivity, setSensitivity] = useState(null);
  const [sensitivityRunning, setSensitivityRunning] = useState(false);

  const seatLabels = buildSeatLabels(seatingPositions);
  const effectiveSeatId = selectedSeatId || seatLabels[0]?.id || null;
  const canRun = !!(roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM && effectiveSeatId && Array.isArray(subsForSimulation) && subsForSimulation.length > 0);

  const runAudit = useCallback(() => {
    if (!canRun) return;
    setRunning(true);
    setSensitivity(null);

    const seatEntry = seatLabels.find((s) => s.id === effectiveSeatId);
    const seat = seatEntry?.seat;
    const seatZ = Number.isFinite(Number(seat?.z)) ? Number(seat.z) : 1.2;
    const seatPos = { x: Number(seat.x), y: Number(seat.y), z: seatZ };
    const baseOptions = buildLiveEngineOptions(frequencyHz, surfaceAbsorption);

    // ── Normal run (no mode muted) — one call per sub, exact live options ──
    let directRe = 0, directIm = 0, reflectionRe = 0, reflectionIm = 0;
    let modalRe = 0, modalIm = 0, finalRe = 0, finalIm = 0;
    let actualFrequencyHz = frequencyHz;
    const perSub = [];

    subsForSimulation.forEach((sub) => {
      const out = simulateBassResponseRewCore(
        { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM },
        seatPos, sub, LIVE_SOURCE_CURVE, baseOptions
      );
      const vd = out.perFrequencyVectorDebug?.[0];
      if (vd) {
        directRe += vd.directRe; directIm += vd.directIm;
        reflectionRe += vd.reflectionRe; reflectionIm += vd.reflectionIm;
        modalRe += vd.modalSumRe; modalIm += vd.modalSumIm;
        finalRe += vd.finalRe; finalIm += vd.finalIm;
      }
      actualFrequencyHz = out.freqsHz?.[0] ?? actualFrequencyHz;
      perSub.push({
        subId: sub.id,
        contributorsInEngineOrder: out.activeModalContributorDebugSeries?.[0]?.contributorsInEngineOrder || [],
      });
    });

    // ── Merge per-mode rows across subs, preserving sub[0]'s engine order (identical mode set/order for all subs) ──
    const orderKeys = (perSub[0]?.contributorsInEngineOrder || []).map((r) => `${r.nx},${r.ny},${r.nz}`);
    const merged = new Map();
    perSub.forEach(({ contributorsInEngineOrder }) => {
      contributorsInEngineOrder.forEach((row) => {
        const key = `${row.nx},${row.ny},${row.nz}`;
        if (!merged.has(key)) {
          merged.set(key, {
            nx: row.nx, ny: row.ny, nz: row.nz,
            modeFrequencyHz: row.modeFrequencyHz, modeType: row.modeType, qValue: row.qValue,
            sourceCouplingFirst: row.sourceCoupling, receiverCoupling: row.receiverCoupling,
            transferReal: row.transferReal, transferImag: row.transferImag, transferPhaseDeg: row.transferPhaseDeg,
            re: 0, im: 0,
          });
        }
        const m = merged.get(key);
        m.re += row.activeReal;
        m.im += row.activeImag;
      });
    });

    const fullModes = orderKeys.map((key, index) => {
      const m = merged.get(key);
      const transferMag = Math.sqrt(m.transferReal * m.transferReal + m.transferImag * m.transferImag);
      const { magnitude, phaseDeg } = vecMagPhase(m.re, m.im);
      return { index, ...m, transferMagnitude: transferMag, magnitude, phaseDeg };
    });

    // ── Running vector build — engine's real accumulation order, no re-sort ──
    // Each row also carries a forensic classification of this specific addition.
    let runRe = 0, runIm = 0;
    const runningRows = fullModes.map((m) => {
      const before = vecMagPhase(runRe, runIm);
      runRe += m.re;
      runIm += m.im;
      const after = vecMagPhase(runRe, runIm);
      const deltaMag = after.magnitude - before.magnitude;
      let phaseRotation = after.phaseDeg - before.phaseDeg;
      // Normalize phase rotation to [-180, 180] for readability.
      while (phaseRotation > 180) phaseRotation -= 360;
      while (phaseRotation < -180) phaseRotation += 360;
      const classification = classifyAddition(deltaMag, m.magnitude);
      return {
        index: m.index, nx: m.nx, ny: m.ny, nz: m.nz,
        modeFrequencyHz: m.modeFrequencyHz, modeType: m.modeType,
        addedRe: m.re, addedIm: m.im, addedMagnitude: m.magnitude, addedPhaseDeg: m.phaseDeg,
        magnitudeBefore: before.magnitude, phaseBefore: before.phaseDeg,
        runningRe: runRe, runningIm: runIm, runningMagnitude: after.magnitude, runningPhaseDeg: after.phaseDeg,
        deltaMag, phaseRotation, classification,
      };
    });

    // ── Convergence table ──
    const sampleCounts = [0, 5, 10, 20, 40, 80, 120].filter((c) => c < fullModes.length);
    sampleCounts.push(fullModes.length);
    const convergenceRows = sampleCounts.map((count) => {
      const row = count === 0 ? { runningRe: 0, runningIm: 0 } : runningRows[count - 1];
      const totalRe = directRe + reflectionRe + row.runningRe;
      const totalIm = directIm + reflectionIm + row.runningIm;
      return { count, label: count === fullModes.length ? 'Final (all modes)' : `${count} modes`, splDb: toDb(Math.sqrt(totalRe * totalRe + totalIm * totalIm)) };
    });

    const normalFinalSplDb = toDb(Math.sqrt(finalRe * finalRe + finalIm * finalIm));

    // ── Automatic top-5 constructive / top-5 destructive ranking (by delta magnitude) ──
    const sortedByDelta = [...runningRows].sort((a, b) => b.deltaMag - a.deltaMag);
    const top5Constructive = sortedByDelta.slice(0, 5);
    const top5Destructive = [...sortedByDelta].reverse().slice(0, 5);

    const { magnitude: directMag, phaseDeg: directPhase } = vecMagPhase(directRe, directIm);
    const { magnitude: reflMag, phaseDeg: reflPhase } = vecMagPhase(reflectionRe, reflectionIm);
    const { magnitude: modalMag, phaseDeg: modalPhase } = vecMagPhase(modalRe, modalIm);
    const { magnitude: finalMag, phaseDeg: finalPhase } = vecMagPhase(finalRe, finalIm);

    setResult({
      seatId: effectiveSeatId, seatPos,
      subsUsed: subsForSimulation.map((s) => ({ id: s.id, x: s.x, y: s.y, z: s.z })),
      actualFrequencyHz,
      direct: { re: directRe, im: directIm, magnitude: directMag, phaseDeg: directPhase },
      reflection: { re: reflectionRe, im: reflectionIm, magnitude: reflMag, phaseDeg: reflPhase },
      modal: { re: modalRe, im: modalIm, magnitude: modalMag, phaseDeg: modalPhase },
      final: { re: finalRe, im: finalIm, magnitude: finalMag, phaseDeg: finalPhase },
      finalSplDb: normalFinalSplDb,
      fullModes, runningRows, convergenceRows, top5Constructive, top5Destructive,
      directRe, directIm, reflectionRe, reflectionIm,
      frequencyHzUsed: frequencyHz,
    });
    setRunning(false);
  }, [canRun, effectiveSeatId, frequencyHz, roomDims, seatLabels, subsForSimulation, surfaceAbsorption]);

  // ── Diagnostic sensitivity analysis: mute each of the top-5 destructive modes one at a
  // time (never permanently, never together), and measure the resulting change in 30 Hz SPL,
  // resultant vector magnitude, and a local null depth (min SPL over a +/-3 Hz sweep). ──
  const runSensitivity = useCallback(() => {
    if (!result || !canRun) return;
    setSensitivityRunning(true);

    const seatEntry = seatLabels.find((s) => s.id === effectiveSeatId);
    const seat = seatEntry?.seat;
    const seatZ = Number.isFinite(Number(seat?.z)) ? Number(seat.z) : 1.2;
    const seatPos = { x: Number(seat.x), y: Number(seat.y), z: seatZ };
    const targetHz = result.frequencyHzUsed;
    const sweepHz = [-3, -2, -1, 0, 1, 2, 3].map((d) => Math.max(1, targetHz + d));

    function runAt(hz, muteModeKey) {
      const opts = buildLiveEngineOptions(hz, surfaceAbsorption);
      let re = 0, im = 0;
      subsForSimulation.forEach((sub) => {
        const out = simulateBassResponseRewCore(
          { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM },
          seatPos, sub, LIVE_SOURCE_CURVE, muteModeKey ? { ...opts, muteModeKey } : opts
        );
        const vd = out.perFrequencyVectorDebug?.[0];
        if (vd) { re += vd.finalRe; im += vd.finalIm; }
      });
      return { re, im, splDb: toDb(Math.sqrt(re * re + im * im)) };
    }

    // Baseline sweep (no mute) — null depth = minimum SPL across the sweep window.
    const baselineSweep = sweepHz.map((hz) => runAt(hz, null));
    const baselineTarget = baselineSweep[3]; // index 3 == targetHz (offset 0)
    const baselineNullDb = Math.min(...baselineSweep.map((r) => r.splDb));

    const rows = result.top5Destructive.map((mode) => {
      const muteKey = { nx: mode.nx, ny: mode.ny, nz: mode.nz };
      const mutedSweep = sweepHz.map((hz) => runAt(hz, muteKey));
      const mutedTarget = mutedSweep[3];
      const mutedNullDb = Math.min(...mutedSweep.map((r) => r.splDb));

      return {
        nx: mode.nx, ny: mode.ny, nz: mode.nz, modeFrequencyHz: mode.modeFrequencyHz,
        baselineSplDb: baselineTarget.splDb,
        newSplDb: mutedTarget.splDb,
        deltaSplDb: mutedTarget.splDb - baselineTarget.splDb,
        baselineNullDb, newNullDb: mutedNullDb,
        deltaNullDb: mutedNullDb - baselineNullDb,
        baselineVectorMag: Math.sqrt(baselineTarget.re * baselineTarget.re + baselineTarget.im * baselineTarget.im),
        newVectorMag: Math.sqrt(mutedTarget.re * mutedTarget.re + mutedTarget.im * mutedTarget.im),
      };
    });

    // Verdict: does removing ANY single destructive contributor materially change the null?
    // Threshold: 0.5 dB change in local null depth is considered material.
    const materialRows = rows.filter((r) => Math.abs(r.deltaNullDb) >= 0.5);

    setSensitivity({ rows, materialRows, baselineNullDb, threshold: 0.5 });
    setSensitivityRunning(false);
  }, [result, canRun, effectiveSeatId, seatLabels, subsForSimulation, roomDims, surfaceAbsorption]);

  const vecRow = (label, v) => (
    <div key={label}><strong>{label}:</strong> Re {fmt(v.re)} · Im {fmt(v.im)} · Mag {fmt(v.magnitude)} · Phase {fmt(v.phaseDeg, 1)}°</div>
  );

  return (
    <div style={{ border: '2px solid #a855f7', borderRadius: 8, background: '#fdf4ff', padding: '10px 12px', marginTop: 8, marginBottom: 8 }}>
      <div style={{ fontWeight: 700, color: '#6b21a8', fontSize: 12, fontFamily: 'monospace', marginBottom: 4 }}>
        Live Modal Vector Build
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          temporary diagnostic · exact production engine + options · zero physics/graph changes
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'monospace', color: '#6b21a8' }}>
          Frequency (Hz):
          <input type="number" step="0.1" value={frequencyHz}
            onChange={(e) => setFrequencyHz(Math.max(1, parseFloat(e.target.value) || 30.0))}
            style={{ width: 70, height: 24, border: '1px solid #d8b4fe', borderRadius: 4, padding: '0 6px', fontSize: 10, fontFamily: 'monospace' }} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'monospace', color: '#6b21a8' }}>
          Seat:
          <select value={effectiveSeatId || ''} onChange={(e) => setSelectedSeatId(e.target.value)}
            style={{ height: 24, border: '1px solid #d8b4fe', borderRadius: 4, padding: '0 6px', fontSize: 10, fontFamily: 'monospace' }}>
            {seatLabels.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <button onClick={runAudit} disabled={running || !canRun}
          style={{ height: 26, padding: '0 12px', borderRadius: 6, border: '1px solid #6b21a8', background: running ? '#e5e7eb' : '#6b21a8', color: running ? '#6b7280' : '#fff', fontSize: 10, fontFamily: 'monospace', cursor: running || !canRun ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
          {running ? 'Running…' : 'Run Audit'}
        </button>
        {!canRun && <span style={{ fontSize: 9, color: '#b45309', fontFamily: 'monospace' }}>⚠ Need room dims, seat, and at least one sub.</span>}
      </div>

      {result && (
        <>
          {/* Section 1 — Engine Summary */}
          <div style={{ border: '1px solid #d8b4fe', borderRadius: 6, background: '#fff', padding: '6px 8px', fontSize: 9, fontFamily: 'monospace', color: '#4c1d95', marginBottom: 8 }}>
            <div style={{ fontWeight: 700, marginBottom: 3 }}>Section 1 — Engine Summary</div>
            <div><strong>Room W/L/H:</strong> {fmt(roomDims.widthM)} / {fmt(roomDims.lengthM)} / {fmt(roomDims.heightM)} m</div>
            <div><strong>Seat x/y/z:</strong> {fmt(result.seatPos.x)} / {fmt(result.seatPos.y)} / {fmt(result.seatPos.z)}</div>
            {result.subsUsed.map((s, i) => <div key={s.id || i}><strong>Sub[{i}] ({s.id}) x/y/z:</strong> {fmt(s.x)} / {fmt(s.y)} / {fmt(s.z)}</div>)}
            <div><strong>Actual engine frequency:</strong> {fmt(result.actualFrequencyHz, 4)} Hz</div>
            {vecRow('Direct vector', result.direct)}
            {vecRow('Reflection vector', result.reflection)}
            {vecRow('Total modal vector', result.modal)}
            {vecRow('Final summed vector', result.final)}
            <div style={{ fontWeight: 700 }}><strong>Final SPL:</strong> {fmt(result.finalSplDb, 2)} dB</div>
          </div>

          {/* Section 2 — Full Modal Build (no threshold) */}
          <div style={{ marginBottom: 4, fontWeight: 700, color: '#6b21a8', fontSize: 10, fontFamily: 'monospace' }}>Section 2 — Full Modal Build ({result.fullModes.length} modes, unfiltered)</div>
          <div style={{ overflowX: 'auto', maxHeight: 320, overflowY: 'auto', marginBottom: 8 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 980 }}>
              <thead>
                <tr>
                  <th style={th}>#</th><th style={{ ...th, textAlign: 'left' }}>Mode</th><th style={{ ...th, textAlign: 'left' }}>Family</th>
                  <th style={th}>Mode Hz</th><th style={th}>Q</th><th style={th}>Src Cpl</th><th style={th}>Rcv Cpl</th>
                  <th style={th}>H Mag</th><th style={th}>H Phase°</th><th style={th}>Re</th><th style={th}>Im</th><th style={th}>Mag</th><th style={th}>Phase°</th>
                </tr>
              </thead>
              <tbody>
                {result.fullModes.map((m) => (
                  <tr key={`${m.nx},${m.ny},${m.nz}`} style={{ borderBottom: '1px solid #f3e8ff' }}>
                    <td style={td}>{m.index}</td>
                    <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>({m.nx},{m.ny},{m.nz})</td>
                    <td style={{ ...td, textAlign: 'left' }}>{m.modeType}</td>
                    <td style={td}>{fmt(m.modeFrequencyHz, 2)}</td>
                    <td style={td}>{fmt(m.qValue, 2)}</td>
                    <td style={td}>{fmt(m.sourceCouplingFirst, 4)}</td>
                    <td style={td}>{fmt(m.receiverCoupling, 4)}</td>
                    <td style={td}>{fmt(m.transferMagnitude, 4)}</td>
                    <td style={td}>{fmt(m.transferPhaseDeg, 1)}</td>
                    <td style={td}>{fmt(m.re, 3)}</td>
                    <td style={td}>{fmt(m.im, 3)}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{fmt(m.magnitude, 3)}</td>
                    <td style={td}>{fmt(m.phaseDeg, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Section 3 — Running Vector Build with forensic classification */}
          <div style={{ marginBottom: 4, fontWeight: 700, color: '#6b21a8', fontSize: 10, fontFamily: 'monospace' }}>Section 3 — Running Vector Build (engine accumulation order, unsorted)</div>
          <div style={{ overflowX: 'auto', maxHeight: 320, overflowY: 'auto', marginBottom: 8 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 1080 }}>
              <thead>
                <tr>
                  <th style={th}>#</th><th style={{ ...th, textAlign: 'left' }}>Mode</th>
                  <th style={th}>Mag Before</th><th style={th}>Vector Added (Re/Im)</th><th style={th}>Added Mag</th>
                  <th style={th}>Mag After</th><th style={th}>Δ Mag</th>
                  <th style={th}>Phase Before°</th><th style={th}>Phase After°</th><th style={th}>Δ Phase°</th>
                  <th style={{ ...th, textAlign: 'left' }}>Classification</th>
                </tr>
              </thead>
              <tbody>
                {result.runningRows.map((r) => (
                  <tr key={r.index} style={{ borderBottom: '1px solid #f3e8ff' }}>
                    <td style={td}>{r.index}</td>
                    <td style={{ ...td, textAlign: 'left' }}>({r.nx},{r.ny},{r.nz})</td>
                    <td style={td}>{fmt(r.magnitudeBefore, 3)}</td>
                    <td style={td}>{fmt(r.addedRe, 3)} / {fmt(r.addedIm, 3)}</td>
                    <td style={td}>{fmt(r.addedMagnitude, 3)}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{fmt(r.runningMagnitude, 3)}</td>
                    <td style={{ ...td, fontWeight: 700, color: r.deltaMag >= 0 ? '#15803d' : '#b91c1c' }}>{r.deltaMag >= 0 ? '+' : ''}{fmt(r.deltaMag, 3)}</td>
                    <td style={td}>{fmt(r.phaseBefore, 1)}</td>
                    <td style={td}>{fmt(r.runningPhaseDeg, 1)}</td>
                    <td style={td}>{r.phaseRotation >= 0 ? '+' : ''}{fmt(r.phaseRotation, 1)}</td>
                    <td style={{ ...td, textAlign: 'left', fontWeight: 700, color: classColor(r.classification) }}>{r.classification}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Section 4 — Top 5 Constructive / Top 5 Destructive */}
          <div style={{ marginBottom: 4, fontWeight: 700, color: '#6b21a8', fontSize: 10, fontFamily: 'monospace' }}>Section 4 — Top 5 Constructive / Top 5 Destructive Additions</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
            <div style={{ flex: '1 1 420px' }}>
              <div style={{ fontSize: 9, fontFamily: 'monospace', fontWeight: 700, color: '#15803d', marginBottom: 2 }}>Top 5 Constructive</div>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead><tr><th style={{ ...th, textAlign: 'left' }}>Mode</th><th style={th}>Mode Hz</th><th style={th}>Δ Mag</th></tr></thead>
                <tbody>
                  {result.top5Constructive.map((r) => (
                    <tr key={`c-${r.nx},${r.ny},${r.nz}`} style={{ borderBottom: '1px solid #f3e8ff' }}>
                      <td style={{ ...td, textAlign: 'left' }}>({r.nx},{r.ny},{r.nz})</td>
                      <td style={td}>{fmt(r.modeFrequencyHz, 2)}</td>
                      <td style={{ ...td, fontWeight: 700, color: '#15803d' }}>+{fmt(r.deltaMag, 3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ flex: '1 1 420px' }}>
              <div style={{ fontSize: 9, fontFamily: 'monospace', fontWeight: 700, color: '#b91c1c', marginBottom: 2 }}>Top 5 Destructive</div>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead><tr><th style={{ ...th, textAlign: 'left' }}>Mode</th><th style={th}>Mode Hz</th><th style={th}>Δ Mag</th></tr></thead>
                <tbody>
                  {result.top5Destructive.map((r) => (
                    <tr key={`d-${r.nx},${r.ny},${r.nz}`} style={{ borderBottom: '1px solid #f3e8ff' }}>
                      <td style={{ ...td, textAlign: 'left' }}>({r.nx},{r.ny},{r.nz})</td>
                      <td style={td}>{fmt(r.modeFrequencyHz, 2)}</td>
                      <td style={{ ...td, fontWeight: 700, color: '#b91c1c' }}>{fmt(r.deltaMag, 3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 5 — Diagnostic Mute Sensitivity Analysis */}
          <div style={{ marginBottom: 4, fontWeight: 700, color: '#6b21a8', fontSize: 10, fontFamily: 'monospace' }}>Section 5 — Diagnostic Sensitivity Analysis (top-5 destructive, one mode muted at a time)</div>
          <div style={{ marginBottom: 6 }}>
            <button onClick={runSensitivity} disabled={sensitivityRunning || !result}
              style={{ height: 24, padding: '0 12px', borderRadius: 6, border: '1px solid #b91c1c', background: sensitivityRunning ? '#e5e7eb' : '#b91c1c', color: sensitivityRunning ? '#6b7280' : '#fff', fontSize: 10, fontFamily: 'monospace', cursor: sensitivityRunning ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
              {sensitivityRunning ? 'Running…' : 'Run Sensitivity Analysis'}
            </button>
            <span style={{ marginLeft: 8, fontSize: 9, color: '#6b7280', fontFamily: 'monospace' }}>Diagnostic only — no mode is ever permanently disabled.</span>
          </div>

          {sensitivity && (
            <>
              <div style={{ overflowX: 'auto', marginBottom: 8 }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 780 }}>
                  <thead>
                    <tr>
                      <th style={{ ...th, textAlign: 'left' }}>Mode Removed</th><th style={th}>Mode Hz</th>
                      <th style={th}>Baseline SPL</th><th style={th}>New SPL</th><th style={th}>Δ SPL</th>
                      <th style={th}>Baseline Null</th><th style={th}>New Null</th><th style={th}>Δ Null</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sensitivity.rows.map((r) => (
                      <tr key={`s-${r.nx},${r.ny},${r.nz}`} style={{ borderBottom: '1px solid #f3e8ff' }}>
                        <td style={{ ...td, textAlign: 'left' }}>({r.nx},{r.ny},{r.nz})</td>
                        <td style={td}>{fmt(r.modeFrequencyHz, 2)}</td>
                        <td style={td}>{fmt(r.baselineSplDb, 2)}</td>
                        <td style={td}>{fmt(r.newSplDb, 2)}</td>
                        <td style={{ ...td, fontWeight: 700 }}>{r.deltaSplDb >= 0 ? '+' : ''}{fmt(r.deltaSplDb, 2)}</td>
                        <td style={td}>{fmt(r.baselineNullDb, 2)}</td>
                        <td style={td}>{fmt(r.newNullDb, 2)}</td>
                        <td style={{ ...td, fontWeight: 700, color: Math.abs(r.deltaNullDb) >= 0.5 ? '#b91c1c' : '#1c1917' }}>{r.deltaNullDb >= 0 ? '+' : ''}{fmt(r.deltaNullDb, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Final Verdict block */}
              <div style={{ border: '1px solid #d8b4fe', borderRadius: 6, background: '#fff', padding: '8px 10px', fontSize: 10, fontFamily: 'monospace', color: '#1c1917' }}>
                <div style={{ fontWeight: 700, marginBottom: 4, color: '#6b21a8' }}>Final Verdict — Case 029/030</div>
                <div><strong>TEST:</strong> One-at-a-time mute of the 5 largest destructive modal contributors at {fmt(result.frequencyHzUsed, 1)} Hz, seat {result.seatId}.</div>
                <div><strong>EXPECTED:</strong> If a single mode is the dominant cause of null-depth mismatch, removing it should shift local null depth by ≥ 0.5 dB.</div>
                <div><strong>ACTUAL:</strong> {sensitivity.materialRows.length === 0
                  ? 'No individually-muted mode produced a ≥0.5 dB null-depth change.'
                  : `${sensitivity.materialRows.length} mode(s) produced a ≥0.5 dB null-depth change: ${sensitivity.materialRows.map((r) => `(${r.nx},${r.ny},${r.nz})`).join(', ')}.`}</div>
                <div><strong>DELTA:</strong> Largest observed |Δ Null| = {fmt(Math.max(...sensitivity.rows.map((r) => Math.abs(r.deltaNullDb))), 2)} dB.</div>
                <div><strong>SEVERITY:</strong> {sensitivity.materialRows.length === 0 ? 'Low — modal-vector layer not individually responsible.' : 'Medium — isolated mode(s) contribute materially; further isolation warranted.'}</div>
                <div><strong>NEXT TEST:</strong> {sensitivity.materialRows.length === 0
                  ? 'No individual modal vector materially changes the null. The modal-vector hypothesis is retired. Investigation must move above the modal layer — direct/reflection path interaction or boundary-condition modelling at the null frequency.'
                  : 'Isolate the identified mode(s) further — audit their Q, coupling, and phase construction independently before considering any production change.'}</div>
              </div>
            </>
          )}

          {/* Section 6 — Running Convergence */}
          <div style={{ marginTop: 8, marginBottom: 4, fontWeight: 700, color: '#6b21a8', fontSize: 10, fontFamily: 'monospace' }}>Section 6 — Running Convergence</div>
          <table style={{ borderCollapse: 'collapse', minWidth: 240 }}>
            <thead><tr><th style={{ ...th, textAlign: 'left' }}>Modes Added</th><th style={th}>Running SPL</th></tr></thead>
            <tbody>
              {result.convergenceRows.map((r) => (
                <tr key={r.count} style={{ borderBottom: '1px solid #f3e8ff' }}>
                  <td style={{ ...td, textAlign: 'left' }}>{r.label}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{fmt(r.splDb, 2)} dB</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: 6, fontSize: 9, fontFamily: 'monospace', color: '#6b7280' }}>
            All vectors read from the engine's additive debug fields (perFrequencyVectorDebug, contributorsInEngineOrder). Sensitivity re-runs use a new muteModeKey option that is inert unless explicitly passed — production/BassResponse.jsx never passes it, so the plotted graph is unaffected.
          </div>
        </>
      )}
    </div>
  );
}