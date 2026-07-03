// LiveVectorGeometryAudit.jsx
// Temporary diagnostic panel — Bass Response page.
// Purpose: show the actual vector geometry (Direct, tracked Dominant mode,
// Remaining modes, Final) behind the 30–50 Hz null, with projections onto the
// final vector, cancellation efficiency, an Argand diagram, and trend curves.
// Read-only: uses the exact same live engine call (simulateBassResponseRewCore +
// LIVE_SOURCE_CURVE/buildLiveEngineOptions) as LiveModalContributorAudit.jsx.
// No engine/Q/damping/phase/smoothing/graph changes — measurements only.

import React, { useState, useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';
import { LIVE_SOURCE_CURVE, buildLiveEngineOptions } from '@/components/room/bass/LiveModalContributorAudit';

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

function mag(re, im) { return Math.sqrt(re * re + im * im); }
function phaseDeg(re, im) { return (Math.atan2(im, re) * 180) / Math.PI; }
function fmt(v, d = 2) { return Number.isFinite(v) ? v.toFixed(d) : '—'; }
// signed projection of vector A onto vector F: (A·F)/|F|
function projectOnto(aRe, aIm, fRe, fIm) {
  const fMag = mag(fRe, fIm);
  if (fMag <= 1e-12) return 0;
  return (aRe * fRe + aIm * fIm) / fMag;
}

function computeFrequencyData(frequencyHz, roomDims, seatPos, subsForSimulation, surfaceAbsorption) {
  const options = buildLiveEngineOptions(frequencyHz, surfaceAbsorption);
  let directRe = 0, directIm = 0;
  let engineFinalRe = 0, engineFinalIm = 0;
  const merged = new Map();

  subsForSimulation.forEach((sub) => {
    const engineOut = simulateBassResponseRewCore(roomDims, seatPos, sub, LIVE_SOURCE_CURVE, options);
    const vec = engineOut.perFrequencyVectorDebug?.[0];
    if (vec) {
      directRe += vec.directRe || 0;
      directIm += vec.directIm || 0;
      engineFinalRe += vec.finalRe || 0;
      engineFinalIm += vec.finalIm || 0;
    }
    const debugRow = engineOut.activeModalContributorDebugSeries?.[0];
    if (debugRow?.contributors) {
      debugRow.contributors.forEach((c) => {
        const key = `${c.nx},${c.ny},${c.nz}`;
        if (!merged.has(key)) {
          merged.set(key, { nx: c.nx, ny: c.ny, nz: c.nz, modeFrequencyHz: c.modeFrequencyHz, modeType: c.modeType, re: 0, im: 0 });
        }
        const m = merged.get(key);
        m.re += c.activeReal;
        m.im += c.activeImag;
      });
    }
  });

  return {
    frequencyHz,
    directRe, directIm,
    engineFinalRe, engineFinalIm,
    contributors: Array.from(merged.values()),
  };
}

function deriveRow(fd, trackedKey) {
  const { frequencyHz, directRe, directIm, engineFinalRe, engineFinalIm, contributors } = fd;
  const tracked = contributors.find((c) => `${c.nx},${c.ny},${c.nz}` === trackedKey);
  const dominantRe = tracked ? tracked.re : 0;
  const dominantIm = tracked ? tracked.im : 0;
  const others = contributors.filter((c) => `${c.nx},${c.ny},${c.nz}` !== trackedKey);
  const remainingRe = others.reduce((s, c) => s + c.re, 0);
  const remainingIm = others.reduce((s, c) => s + c.im, 0);

  const directMag = mag(directRe, directIm);
  const directPhase = phaseDeg(directRe, directIm);
  const dominantMag = mag(dominantRe, dominantIm);
  const dominantPhase = phaseDeg(dominantRe, dominantIm);
  const remainingMag = mag(remainingRe, remainingIm);
  const remainingPhase = phaseDeg(remainingRe, remainingIm);

  const reconRe = directRe + dominantRe + remainingRe;
  const reconIm = directIm + dominantIm + remainingIm;
  const reconMag = mag(reconRe, reconIm);
  const reconPhase = phaseDeg(reconRe, reconIm);
  const reconSplDb = 20 * Math.log10(Math.max(reconMag, 1e-10));

  const engineFinalMag = mag(engineFinalRe, engineFinalIm);
  const engineFinalPhase = phaseDeg(engineFinalRe, engineFinalIm);
  const engineFinalSplDb = 20 * Math.log10(Math.max(engineFinalMag, 1e-10));

  const TOL = 1e-6 * Math.max(1, engineFinalMag);
  const pass = Math.abs(reconRe - engineFinalRe) < TOL && Math.abs(reconIm - engineFinalIm) < TOL;

  // Projections onto the FINAL vector (signed — positive reinforces, negative opposes)
  const directProj = projectOnto(directRe, directIm, engineFinalRe, engineFinalIm);
  const dominantProj = projectOnto(dominantRe, dominantIm, engineFinalRe, engineFinalIm);
  const remainingProj = projectOnto(remainingRe, remainingIm, engineFinalRe, engineFinalIm);

  // Cancellation efficiency of the tracked dominant mode against the direct field:
  // component of dominant anti-parallel to direct, as a % of dominant's own magnitude.
  // 0% = fully constructive (aligned with direct), 100% = perfectly opposing.
  const domOnDirect = directMag > 1e-12 ? projectOnto(dominantRe, dominantIm, directRe, directIm) : 0;
  const cancellationEfficiency = dominantMag > 1e-12
    ? Math.max(0, Math.min(100, (-domOnDirect / dominantMag) * 100))
    : 0;

  // Residual cancellation: same measure, but using dominant+remaining (total modal vector) vs direct.
  const modalTotalRe = dominantRe + remainingRe;
  const modalTotalIm = dominantIm + remainingIm;
  const modalTotalMag = mag(modalTotalRe, modalTotalIm);
  const modalOnDirect = directMag > 1e-12 ? projectOnto(modalTotalRe, modalTotalIm, directRe, directIm) : 0;
  const residualCancellation = modalTotalMag > 1e-12
    ? Math.max(0, Math.min(100, (-modalOnDirect / modalTotalMag) * 100))
    : 0;

  return {
    frequencyHz,
    direct: { re: directRe, im: directIm, mag: directMag, phase: directPhase },
    dominant: { re: dominantRe, im: dominantIm, mag: dominantMag, phase: dominantPhase, modeFrequencyHz: tracked?.modeFrequencyHz ?? null, modeType: tracked?.modeType ?? '—' },
    remaining: { re: remainingRe, im: remainingIm, mag: remainingMag, phase: remainingPhase },
    final: { re: engineFinalRe, im: engineFinalIm, mag: engineFinalMag, phase: engineFinalPhase, splDb: engineFinalSplDb },
    directProj, dominantProj, remainingProj,
    cancellationEfficiency, residualCancellation,
    reconSplDb, pass,
  };
}

// ── Argand diagram ──
function ArgandDiagram({ row, scale }) {
  if (!row) return null;
  const size = 240;
  const c = size / 2;
  const toPoint = (re, im) => ({ x: c + re * scale, y: c - im * scale });
  const vectors = [
    { name: 'Direct', re: row.direct.re, im: row.direct.im, color: '#2563eb' },
    { name: 'Dominant', re: row.dominant.re, im: row.dominant.im, color: '#ea580c' },
    { name: 'Remaining', re: row.remaining.re, im: row.remaining.im, color: '#7c3aed' },
    { name: 'Final', re: row.final.re, im: row.final.im, color: '#111827' },
  ];
  return (
    <svg width={size} height={size} style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 6 }}>
      <defs>
        {vectors.map((v) => (
          <marker key={v.name} id={`arrow-${v.name}`} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill={v.color} />
          </marker>
        ))}
      </defs>
      <line x1={0} y1={c} x2={size} y2={c} stroke="#e5e7eb" strokeWidth="1" />
      <line x1={c} y1={0} x2={c} y2={size} stroke="#e5e7eb" strokeWidth="1" />
      {vectors.map((v) => {
        const p = toPoint(v.re, v.im);
        return (
          <line key={v.name} x1={c} y1={c} x2={p.x} y2={p.y} stroke={v.color}
            strokeWidth={v.name === 'Final' ? 2.5 : 1.8} markerEnd={`url(#arrow-${v.name})`} />
        );
      })}
    </svg>
  );
}

const thS = {
  textAlign: 'right', padding: '3px 5px', fontSize: 9, fontWeight: 700,
  background: '#ecfdf5', borderBottom: '2px solid #6ee7b7', color: '#065f46', whiteSpace: 'nowrap',
};
const tdS = { textAlign: 'right', padding: '2px 5px', fontSize: 9, fontFamily: 'monospace' };

export default function LiveVectorGeometryAudit({ roomDims, seatingPositions, subsForSimulation, surfaceAbsorption }) {
  const seatLabels = buildSeatLabels(seatingPositions);
  const defaultSeatId = seatLabels.find((s) => s.label === 'R1S2')?.id || seatLabels[0]?.id || null;

  const [selectedSeatId, setSelectedSeatId] = useState(defaultSeatId);
  const [freqStart, setFreqStart] = useState(30);
  const [freqEnd, setFreqEnd] = useState(50);
  const [step, setStep] = useState(1);
  const [rows, setRows] = useState(null);
  const [running, setRunning] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const effectiveSeatId = selectedSeatId || defaultSeatId;

  const canRun = !!(
    roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM &&
    effectiveSeatId && Array.isArray(subsForSimulation) && subsForSimulation.length > 0 &&
    Number(freqEnd) >= Number(freqStart) && Number(step) > 0
  );

  const runAudit = useCallback(() => {
    if (!canRun) return;
    setRunning(true);
    const seatEntry = seatLabels.find((s) => s.id === effectiveSeatId);
    const seat = seatEntry?.seat;
    const seatZ = Number.isFinite(Number(seat?.z)) ? Number(seat.z) : 1.2;
    const seatPos = { x: Number(seat.x), y: Number(seat.y), z: seatZ };
    const rd = { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM };

    // Pass 1: gather raw per-frequency data
    const raw = [];
    for (let f = Number(freqStart); f <= Number(freqEnd) + 1e-9; f += Number(step)) {
      raw.push(computeFrequencyData(f, rd, seatPos, subsForSimulation, surfaceAbsorption));
    }

    // Identify null centre (lowest |final|) and its dominant mode — tracked for the whole sweep
    let nullIdx = 0, nullMag = Infinity;
    raw.forEach((fd, i) => {
      const m = mag(fd.engineFinalRe, fd.engineFinalIm);
      if (m < nullMag) { nullMag = m; nullIdx = i; }
    });
    const nullContributors = raw[nullIdx].contributors.map((c) => ({ ...c, mag: mag(c.re, c.im) })).sort((a, b) => b.mag - a.mag);
    const trackedKey = nullContributors[0] ? `${nullContributors[0].nx},${nullContributors[0].ny},${nullContributors[0].nz}` : null;

    // Pass 2: derive rows using tracked mode key throughout
    const derived = raw.map((fd) => deriveRow(fd, trackedKey));
    setRows(derived);
    setSelectedIndex(nullIdx);
    setRunning(false);
  }, [canRun, effectiveSeatId, freqStart, freqEnd, step, roomDims, seatLabels, subsForSimulation, surfaceAbsorption]);

  const diagramScale = useMemo(() => {
    if (!rows) return 1;
    let maxMag = 1e-9;
    rows.forEach((r) => {
      maxMag = Math.max(maxMag, r.direct.mag, r.dominant.mag, r.remaining.mag, r.final.mag);
    });
    return 100 / maxMag; // fit largest vector into ~100px radius
  }, [rows]);

  const summary = useMemo(() => {
    if (!rows || rows.length === 0) return null;
    const nullRow = rows.reduce((best, r) => (r.final.mag < best.final.mag ? r : best), rows[0]);
    const nearest = (hz) => rows.reduce((best, r) => (Math.abs(r.frequencyHz - hz) < Math.abs(best.frequencyHz - hz) ? r : best), rows[0]);
    const row40 = nearest(40);
    const row50 = nearest(50);
    const allPass = rows.every((r) => r.pass);

    // Quantities tracked from null centre outward
    const rowsFromNull = rows.filter((r) => r.frequencyHz >= nullRow.frequencyHz).sort((a, b) => a.frequencyHz - b.frequencyHz);

    const relChange = (base, cur) => (Math.abs(base) > 1e-9 ? Math.abs(cur - base) / Math.abs(base) : Math.abs(cur - base));

    // Q1: Direct field (directProj) stability
    const directBase = nullRow.directProj;
    const directFirstCross = rowsFromNull.find((r) => relChange(directBase, r.directProj) > 0.5);

    // Q2: Dominant projection onto final — collapse detection
    const domBase = nullRow.dominantProj;
    const domFirstCross = rowsFromNull.find((r) => relChange(domBase, r.dominantProj) > 0.5);

    // Q3: Remaining projection onto final — rotates constructive (sign flip to positive)
    const remBase = nullRow.remainingProj;
    const remFirstCross = rowsFromNull.find((r) => remBase <= 0 && r.remainingProj > 0);

    // Q4: Cancellation efficiency — falls rapidly
    const effBase = nullRow.cancellationEfficiency;
    const effFirstCross = rowsFromNull.find((r) => effBase - r.cancellationEfficiency > 20);

    const candidates = [
      { key: 'direct', crossFreq: directFirstCross?.frequencyHz ?? null, pass: 'Direct field remains stable.', fail: 'Direct field projection changes rapidly.' },
      { key: 'dominant', crossFreq: domFirstCross?.frequencyHz ?? null, pass: 'Dominant modal cancellation remains stable.', fail: 'Projection of dominant mode onto final vector collapses rapidly.' },
      { key: 'remaining', crossFreq: remFirstCross?.frequencyHz ?? null, pass: 'Remaining modal contribution remains stable.', fail: 'Remaining modal projection rotates constructive.' },
      { key: 'efficiency', crossFreq: effFirstCross?.frequencyHz ?? null, pass: 'Cancellation efficiency remains stable.', fail: 'Cancellation efficiency falls rapidly.' },
    ];

    const triggered = candidates.filter((c) => c.crossFreq !== null).sort((a, b) => a.crossFreq - b.crossFreq);
    const firstTrigger = triggered[0] || null;

    return {
      nullCentreFreq: nullRow.frequencyHz, splAtNull: nullRow.final.splDb,
      splAt40: row40.final.splDb, splAt50: row50.final.splDb,
      allPass, candidates, firstTrigger,
    };
  }, [rows]);

  const currentRow = rows?.[selectedIndex] ?? null;

  return (
    <div style={{ border: '2px solid #059669', borderRadius: 8, background: '#ecfdf5', padding: '10px 12px', marginTop: 8, marginBottom: 8 }}>
      <div style={{ fontWeight: 700, color: '#065f46', fontSize: 12, fontFamily: 'monospace', marginBottom: 4 }}>
        Live Vector Geometry Audit
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          temporary diagnostic · read-only from live engine · measurements only
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'monospace', color: '#065f46' }}>
          Seat:
          <select value={effectiveSeatId || ''} onChange={(e) => setSelectedSeatId(e.target.value)}
            style={{ height: 24, border: '1px solid #6ee7b7', borderRadius: 4, padding: '0 6px', fontSize: 10, fontFamily: 'monospace' }}>
            {seatLabels.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'monospace', color: '#065f46' }}>
          Start (Hz):
          <input type="number" step="0.5" value={freqStart} onChange={(e) => setFreqStart(parseFloat(e.target.value) || 30)}
            style={{ width: 60, height: 24, border: '1px solid #6ee7b7', borderRadius: 4, padding: '0 6px', fontSize: 10, fontFamily: 'monospace' }} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'monospace', color: '#065f46' }}>
          End (Hz):
          <input type="number" step="0.5" value={freqEnd} onChange={(e) => setFreqEnd(parseFloat(e.target.value) || 50)}
            style={{ width: 60, height: 24, border: '1px solid #6ee7b7', borderRadius: 4, padding: '0 6px', fontSize: 10, fontFamily: 'monospace' }} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'monospace', color: '#065f46' }}>
          Step (Hz):
          <input type="number" step="0.5" min="0.1" value={step} onChange={(e) => setStep(Math.max(0.1, parseFloat(e.target.value) || 1))}
            style={{ width: 50, height: 24, border: '1px solid #6ee7b7', borderRadius: 4, padding: '0 6px', fontSize: 10, fontFamily: 'monospace' }} />
        </label>
        <button onClick={runAudit} disabled={running || !canRun}
          style={{ height: 26, padding: '0 12px', borderRadius: 6, border: '1px solid #065f46', background: running ? '#e5e7eb' : '#065f46', color: running ? '#6b7280' : '#fff', fontSize: 10, fontFamily: 'monospace', cursor: running || !canRun ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
          {running ? 'Running…' : 'Run Audit'}
        </button>
        {!canRun && <span style={{ fontSize: 9, color: '#b45309', fontFamily: 'monospace' }}>⚠ Need room dims, seat, ≥1 sub, and end ≥ start.</span>}
      </div>

      {rows && summary && (
        <>
          {/* ── Table ── */}
          <div style={{ overflowX: 'auto', marginBottom: 10 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 1700 }}>
              <thead>
                <tr>
                  <th style={thS}>Hz</th>
                  <th style={thS}>Dir Re</th><th style={thS}>Dir Im</th><th style={thS}>Dir Mag</th><th style={thS}>Dir °</th>
                  <th style={thS}>Dom Re</th><th style={thS}>Dom Im</th><th style={thS}>Dom Mag</th><th style={thS}>Dom °</th>
                  <th style={thS}>Rem Re</th><th style={thS}>Rem Im</th><th style={thS}>Rem Mag</th><th style={thS}>Rem °</th>
                  <th style={thS}>Final Re</th><th style={thS}>Final Im</th><th style={thS}>Final Mag</th><th style={thS}>Final °</th><th style={thS}>Final SPL</th>
                  <th style={thS}>Dir Proj</th><th style={thS}>Dom Proj</th><th style={thS}>Rem Proj</th>
                  <th style={thS}>Cancel %</th><th style={thS}>Residual %</th>
                  <th style={thS}>Match</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.frequencyHz} onClick={() => setSelectedIndex(i)}
                    style={{ borderBottom: '1px solid #d1fae5', cursor: 'pointer', background: i === selectedIndex ? '#d1fae5' : undefined }}>
                    <td style={{ ...tdS, fontWeight: 700, color: '#065f46' }}>{fmt(r.frequencyHz, 1)}</td>
                    <td style={tdS}>{fmt(r.direct.re, 4)}</td><td style={tdS}>{fmt(r.direct.im, 4)}</td><td style={tdS}>{fmt(r.direct.mag, 4)}</td><td style={tdS}>{fmt(r.direct.phase, 1)}</td>
                    <td style={tdS}>{fmt(r.dominant.re, 4)}</td><td style={tdS}>{fmt(r.dominant.im, 4)}</td><td style={tdS}>{fmt(r.dominant.mag, 4)}</td><td style={tdS}>{fmt(r.dominant.phase, 1)}</td>
                    <td style={tdS}>{fmt(r.remaining.re, 4)}</td><td style={tdS}>{fmt(r.remaining.im, 4)}</td><td style={tdS}>{fmt(r.remaining.mag, 4)}</td><td style={tdS}>{fmt(r.remaining.phase, 1)}</td>
                    <td style={tdS}>{fmt(r.final.re, 4)}</td><td style={tdS}>{fmt(r.final.im, 4)}</td><td style={tdS}>{fmt(r.final.mag, 4)}</td><td style={tdS}>{fmt(r.final.phase, 1)}</td><td style={{ ...tdS, fontWeight: 700 }}>{fmt(r.final.splDb, 2)}</td>
                    <td style={tdS}>{fmt(r.directProj, 4)}</td><td style={tdS}>{fmt(r.dominantProj, 4)}</td><td style={tdS}>{fmt(r.remainingProj, 4)}</td>
                    <td style={tdS}>{fmt(r.cancellationEfficiency, 1)}%</td><td style={tdS}>{fmt(r.residualCancellation, 1)}%</td>
                    <td style={{ ...tdS, fontWeight: 700, color: r.pass ? '#166534' : '#b91c1c' }}>{r.pass ? 'PASS' : 'FAIL'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Argand diagram with stepper ── */}
          <div style={{ border: '1px solid #6ee7b7', borderRadius: 6, background: '#fff', padding: '8px 10px', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <button onClick={() => setSelectedIndex((i) => Math.max(0, i - 1))} disabled={selectedIndex <= 0}
                style={{ border: '1px solid #6ee7b7', borderRadius: 4, background: '#fff', padding: 4, cursor: selectedIndex <= 0 ? 'not-allowed' : 'pointer' }}>
                <ChevronLeft size={14} />
              </button>
              <div style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, color: '#065f46' }}>
                {currentRow ? `${fmt(currentRow.frequencyHz, 1)} Hz` : '—'}
              </div>
              <button onClick={() => setSelectedIndex((i) => Math.min(rows.length - 1, i + 1))} disabled={selectedIndex >= rows.length - 1}
                style={{ border: '1px solid #6ee7b7', borderRadius: 4, background: '#fff', padding: 4, cursor: selectedIndex >= rows.length - 1 ? 'not-allowed' : 'pointer' }}>
                <ChevronRight size={14} />
              </button>
              <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#6b7280' }}>
                🔵 Direct &nbsp; 🟠 Dominant (tracked) &nbsp; 🟣 Remaining &nbsp; ⚫ Final
              </div>
            </div>
            <ArgandDiagram row={currentRow} scale={diagramScale} />
          </div>

          {/* ── Trend plot ── */}
          <div style={{ border: '1px solid #6ee7b7', borderRadius: 6, background: '#fff', padding: '8px 10px', marginBottom: 10 }}>
            <div style={{ fontWeight: 700, color: '#065f46', fontSize: 11, fontFamily: 'monospace', marginBottom: 6 }}>
              Frequency vs Projected Contribution &amp; Final SPL
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={rows.map((r) => ({ hz: Number(r.frequencyHz.toFixed(2)), directProj: r.directProj, dominantProj: r.dominantProj, remainingProj: r.remainingProj, finalSplDb: r.final.splDb }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hz" tick={{ fontSize: 9 }} />
                <YAxis yAxisId="proj" tick={{ fontSize: 9 }} label={{ value: 'Projection', angle: -90, position: 'insideLeft', fontSize: 9 }} />
                <YAxis yAxisId="spl" orientation="right" tick={{ fontSize: 9 }} label={{ value: 'SPL (dB)', angle: 90, position: 'insideRight', fontSize: 9 }} />
                <Tooltip wrapperStyle={{ fontSize: 10 }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line yAxisId="proj" type="monotone" dataKey="directProj" name="Direct proj" stroke="#2563eb" dot={false} />
                <Line yAxisId="proj" type="monotone" dataKey="dominantProj" name="Dominant proj" stroke="#ea580c" dot={false} />
                <Line yAxisId="proj" type="monotone" dataKey="remainingProj" name="Remaining proj" stroke="#7c3aed" dot={false} />
                <Line yAxisId="spl" type="monotone" dataKey="finalSplDb" name="Final SPL" stroke="#111827" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* ── Validation + diagnosis ── */}
          <div style={{ border: '1px solid #6ee7b7', borderRadius: 6, background: '#fff', padding: '8px 10px', fontSize: 10, fontFamily: 'monospace', color: '#065f46' }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>
              Reconstruction Validation: <span style={{ color: summary.allPass ? '#166534' : '#b91c1c' }}>{summary.allPass ? 'PASS — all rows match production engine' : 'FAIL — reconstruction diverges from production engine'}</span>
            </div>
            <div>Null centre: <strong>{fmt(summary.nullCentreFreq, 1)} Hz</strong> (SPL {fmt(summary.splAtNull, 2)} dB) &nbsp;|&nbsp; SPL@40Hz: {fmt(summary.splAt40, 2)} dB &nbsp;|&nbsp; SPL@50Hz: {fmt(summary.splAt50, 2)} dB</div>
            <div style={{ fontWeight: 700, marginTop: 6, marginBottom: 4 }}>Automatic Diagnosis (measurements only)</div>
            {summary.candidates.map((c) => (
              <div key={c.key} style={{ marginBottom: 3 }}>
                <span style={{ fontWeight: 700, color: c.crossFreq !== null ? '#b91c1c' : '#166534' }}>{c.crossFreq !== null ? 'FAIL' : 'PASS'}</span>
                {' — '}{c.crossFreq !== null ? c.fail : c.pass}
                {c.crossFreq !== null && <span style={{ color: '#6b7280' }}> (from {fmt(c.crossFreq, 1)} Hz)</span>}
              </div>
            ))}
            {summary.firstTrigger && (
              <div style={{ marginTop: 4, fontWeight: 700, color: '#b91c1c' }}>
                First to change: {summary.firstTrigger.fail} (at {fmt(summary.firstTrigger.crossFreq, 1)} Hz)
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}