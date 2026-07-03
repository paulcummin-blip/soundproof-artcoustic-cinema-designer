// NullVectorDecompositionAudit.jsx
// Temporary diagnostic panel — Bass Response page.
// Purpose: decompose the production engine's final vector at each frequency into
// Direct + Dominant Mode + Remaining Modes, to find which component causes the
// 30–50 Hz null to recover faster than REW.
// Read-only: uses the exact same live engine call (simulateBassResponseRewCore +
// LIVE_SOURCE_CURVE/buildLiveEngineOptions) as LiveModalContributorAudit.jsx.
// No engine/Q/damping/phase/smoothing/graph changes.

import React, { useState, useCallback, useMemo } from 'react';
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
function wrappedDiff(a, b) {
  let d = Math.abs(a - b);
  if (d > 180) d = 360 - d;
  return d;
}
function fmt(v, d = 2) { return Number.isFinite(v) ? v.toFixed(d) : '—'; }

function computeRow(frequencyHz, roomDims, seatPos, subsForSimulation, surfaceAbsorption) {
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

  const modes = Array.from(merged.values()).map((m) => ({ ...m, mag: mag(m.re, m.im) }));
  modes.sort((a, b) => b.mag - a.mag);
  const dominant = modes[0] || { nx: null, ny: null, nz: null, modeFrequencyHz: null, modeType: '—', re: 0, im: 0, mag: 0 };
  const remaining = modes.slice(1);
  const remainingRe = remaining.reduce((s, m) => s + m.re, 0);
  const remainingIm = remaining.reduce((s, m) => s + m.im, 0);

  const directMag = mag(directRe, directIm);
  const directPhase = phaseDeg(directRe, directIm);
  const dominantPhase = phaseDeg(dominant.re, dominant.im);
  const remainingMag = mag(remainingRe, remainingIm);
  const remainingPhase = phaseDeg(remainingRe, remainingIm);

  const reconRe = directRe + dominant.re + remainingRe;
  const reconIm = directIm + dominant.im + remainingIm;
  const reconMag = mag(reconRe, reconIm);
  const reconPhase = phaseDeg(reconRe, reconIm);
  const reconSplDb = 20 * Math.log10(Math.max(reconMag, 1e-10));

  const engineFinalMag = mag(engineFinalRe, engineFinalIm);
  const engineFinalSplDb = 20 * Math.log10(Math.max(engineFinalMag, 1e-10));

  const TOL = 1e-6 * Math.max(1, engineFinalMag);
  const pass = Math.abs(reconRe - engineFinalRe) < TOL && Math.abs(reconIm - engineFinalIm) < TOL;

  return {
    frequencyHz,
    finalSplDb: engineFinalSplDb, finalMag: engineFinalMag,
    directRe, directIm, directMag, directPhase,
    dominant, dominantPhase,
    remainingRe, remainingIm, remainingMag, remainingPhase,
    diffDirectDominant: wrappedDiff(directPhase, dominantPhase),
    diffDominantRemaining: wrappedDiff(dominantPhase, remainingPhase),
    diffDirectRemaining: wrappedDiff(directPhase, remainingPhase),
    ratioDirectDominant: dominant.mag > 0 ? directMag / dominant.mag : null,
    ratioRemainingDominant: dominant.mag > 0 ? remainingMag / dominant.mag : null,
    reconRe, reconIm, reconMag, reconPhase, reconSplDb,
    pass,
  };
}

const thS = {
  textAlign: 'right', padding: '3px 5px', fontSize: 9, fontWeight: 700,
  background: '#eef2ff', borderBottom: '2px solid #a5b4fc', color: '#3730a3', whiteSpace: 'nowrap',
};
const tdS = { textAlign: 'right', padding: '2px 5px', fontSize: 9, fontFamily: 'monospace' };

export default function NullVectorDecompositionAudit({ roomDims, seatingPositions, subsForSimulation, surfaceAbsorption }) {
  const seatLabels = buildSeatLabels(seatingPositions);
  const defaultSeatId = seatLabels.find((s) => s.label === 'R1S2')?.id || seatLabels[0]?.id || null;

  const [selectedSeatId, setSelectedSeatId] = useState(defaultSeatId);
  const [freqStart, setFreqStart] = useState(30);
  const [freqEnd, setFreqEnd] = useState(50);
  const [step, setStep] = useState(1);
  const [rows, setRows] = useState(null);
  const [running, setRunning] = useState(false);

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

    const out = [];
    for (let f = Number(freqStart); f <= Number(freqEnd) + 1e-9; f += Number(step)) {
      out.push(computeRow(f, { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM }, seatPos, subsForSimulation, surfaceAbsorption));
    }
    setRows(out);
    setRunning(false);
  }, [canRun, effectiveSeatId, freqStart, freqEnd, step, roomDims, seatLabels, subsForSimulation, surfaceAbsorption]);

  const summary = useMemo(() => {
    if (!rows || rows.length === 0) return null;
    const nullRow = rows.reduce((best, r) => (r.finalSplDb < best.finalSplDb ? r : best), rows[0]);
    const nearest = (hz) => rows.reduce((best, r) => (Math.abs(r.frequencyHz - hz) < Math.abs(best.frequencyHz - hz) ? r : best), rows[0]);
    const row40 = nearest(40);
    const row50 = nearest(50);
    const allPass = rows.every((r) => r.pass);

    const changes = [
      { key: 'direct', label: 'Direct vector', to40: row40.directMag - nullRow.directMag, to50: row50.directMag - nullRow.directMag },
      { key: 'dominant', label: 'Dominant Mode vector', to40: row40.dominant.mag - nullRow.dominant.mag, to50: row50.dominant.mag - nullRow.dominant.mag },
      { key: 'remaining', label: 'Remaining Modes vector', to40: row40.remainingMag - nullRow.remainingMag, to50: row50.remainingMag - nullRow.remainingMag },
    ];
    const phaseChanges = [
      { key: 'directDominant', label: 'Direct ↔ Dominant phase', to40: row40.diffDirectDominant - nullRow.diffDirectDominant, to50: row50.diffDirectDominant - nullRow.diffDirectDominant },
      { key: 'dominantRemaining', label: 'Dominant ↔ Remaining phase', to40: row40.diffDominantRemaining - nullRow.diffDominantRemaining, to50: row50.diffDominantRemaining - nullRow.diffDominantRemaining },
      { key: 'directRemaining', label: 'Direct ↔ Remaining phase', to40: row40.diffDirectRemaining - nullRow.diffDirectRemaining, to50: row50.diffDirectRemaining - nullRow.diffDirectRemaining },
    ];

    const rankedByTo40 = [...changes].sort((a, b) => Math.abs(b.to40) - Math.abs(a.to40));
    const rankedPhaseByTo40 = [...phaseChanges].sort((a, b) => Math.abs(b.to40) - Math.abs(a.to40));
    const biggestVectorChange = rankedByTo40[0];
    const biggestPhaseChange = rankedPhaseByTo40[0];

    return { nullCentreFreq: nullRow.frequencyHz, splAtNull: nullRow.finalSplDb, changes, phaseChanges, biggestVectorChange, biggestPhaseChange, allPass };
  }, [rows]);

  return (
    <div style={{ border: '2px solid #4338ca', borderRadius: 8, background: '#eef2ff', padding: '10px 12px', marginTop: 8, marginBottom: 8 }}>
      <div style={{ fontWeight: 700, color: '#3730a3', fontSize: 12, fontFamily: 'monospace', marginBottom: 4 }}>
        Null Vector Decomposition Audit
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          temporary diagnostic · read-only from live engine · measurements only, no recommendations
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'monospace', color: '#3730a3' }}>
          Seat:
          <select
            value={effectiveSeatId || ''}
            onChange={(e) => setSelectedSeatId(e.target.value)}
            style={{ height: 24, border: '1px solid #a5b4fc', borderRadius: 4, padding: '0 6px', fontSize: 10, fontFamily: 'monospace' }}
          >
            {seatLabels.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'monospace', color: '#3730a3' }}>
          Start (Hz):
          <input type="number" step="0.5" value={freqStart} onChange={(e) => setFreqStart(parseFloat(e.target.value) || 30)}
            style={{ width: 60, height: 24, border: '1px solid #a5b4fc', borderRadius: 4, padding: '0 6px', fontSize: 10, fontFamily: 'monospace' }} />
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'monospace', color: '#3730a3' }}>
          End (Hz):
          <input type="number" step="0.5" value={freqEnd} onChange={(e) => setFreqEnd(parseFloat(e.target.value) || 50)}
            style={{ width: 60, height: 24, border: '1px solid #a5b4fc', borderRadius: 4, padding: '0 6px', fontSize: 10, fontFamily: 'monospace' }} />
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'monospace', color: '#3730a3' }}>
          Step (Hz):
          <input type="number" step="0.5" min="0.1" value={step} onChange={(e) => setStep(Math.max(0.1, parseFloat(e.target.value) || 1))}
            style={{ width: 50, height: 24, border: '1px solid #a5b4fc', borderRadius: 4, padding: '0 6px', fontSize: 10, fontFamily: 'monospace' }} />
        </label>

        <button
          onClick={runAudit}
          disabled={running || !canRun}
          style={{
            height: 26, padding: '0 12px', borderRadius: 6,
            border: '1px solid #3730a3', background: running ? '#e5e7eb' : '#3730a3',
            color: running ? '#6b7280' : '#fff', fontSize: 10, fontFamily: 'monospace',
            cursor: running || !canRun ? 'not-allowed' : 'pointer', fontWeight: 600,
          }}
        >
          {running ? 'Running…' : 'Run Audit'}
        </button>

        {!canRun && (
          <span style={{ fontSize: 9, color: '#b45309', fontFamily: 'monospace' }}>
            ⚠ Need room dims, seat, ≥1 sub, and end ≥ start.
          </span>
        )}
      </div>

      {rows && summary && (
        <>
          <div style={{ overflowX: 'auto', marginBottom: 10 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 1900 }}>
              <thead>
                <tr>
                  <th style={thS}>Hz</th>
                  <th style={thS}>Final SPL</th>
                  <th style={thS}>Final Mag</th>
                  <th style={thS}>Direct Mag</th>
                  <th style={thS}>Direct °</th>
                  <th style={{ ...thS, textAlign: 'left' }}>Dominant (nx,ny,nz)</th>
                  <th style={thS}>Mode Hz</th>
                  <th style={{ ...thS, textAlign: 'left' }}>Family</th>
                  <th style={thS}>Dom Mag</th>
                  <th style={thS}>Dom °</th>
                  <th style={thS}>Dom Re</th>
                  <th style={thS}>Dom Im</th>
                  <th style={thS}>Remaining Mag</th>
                  <th style={thS}>Remaining °</th>
                  <th style={thS}>Remaining Re</th>
                  <th style={thS}>Remaining Im</th>
                  <th style={thS}>Dir↔Dom Δ°</th>
                  <th style={thS}>Dom↔Rem Δ°</th>
                  <th style={thS}>Dir↔Rem Δ°</th>
                  <th style={thS}>Dir/Dom</th>
                  <th style={thS}>Rem/Dom</th>
                  <th style={thS}>Recon SPL</th>
                  <th style={thS}>Match</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.frequencyHz} style={{ borderBottom: '1px solid #e0e7ff' }}>
                    <td style={{ ...tdS, fontWeight: 700, color: '#3730a3' }}>{fmt(r.frequencyHz, 1)}</td>
                    <td style={{ ...tdS, fontWeight: 700 }}>{fmt(r.finalSplDb, 2)}</td>
                    <td style={tdS}>{fmt(r.finalMag, 4)}</td>
                    <td style={tdS}>{fmt(r.directMag, 4)}</td>
                    <td style={tdS}>{fmt(r.directPhase, 1)}</td>
                    <td style={{ ...tdS, textAlign: 'left' }}>{r.dominant.nx !== null ? `(${r.dominant.nx},${r.dominant.ny},${r.dominant.nz})` : '—'}</td>
                    <td style={tdS}>{fmt(r.dominant.modeFrequencyHz, 1)}</td>
                    <td style={{ ...tdS, textAlign: 'left' }}>{r.dominant.modeType || '—'}</td>
                    <td style={tdS}>{fmt(r.dominant.mag, 4)}</td>
                    <td style={tdS}>{fmt(r.dominantPhase, 1)}</td>
                    <td style={tdS}>{fmt(r.dominant.re, 4)}</td>
                    <td style={tdS}>{fmt(r.dominant.im, 4)}</td>
                    <td style={tdS}>{fmt(r.remainingMag, 4)}</td>
                    <td style={tdS}>{fmt(r.remainingPhase, 1)}</td>
                    <td style={tdS}>{fmt(r.remainingRe, 4)}</td>
                    <td style={tdS}>{fmt(r.remainingIm, 4)}</td>
                    <td style={tdS}>{fmt(r.diffDirectDominant, 1)}</td>
                    <td style={tdS}>{fmt(r.diffDominantRemaining, 1)}</td>
                    <td style={tdS}>{fmt(r.diffDirectRemaining, 1)}</td>
                    <td style={tdS}>{fmt(r.ratioDirectDominant, 3)}</td>
                    <td style={tdS}>{fmt(r.ratioRemainingDominant, 3)}</td>
                    <td style={tdS}>{fmt(r.reconSplDb, 2)}</td>
                    <td style={{ ...tdS, fontWeight: 700, color: r.pass ? '#166534' : '#b91c1c' }}>{r.pass ? 'PASS' : 'FAIL'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ border: '1px solid #a5b4fc', borderRadius: 6, background: '#fff', padding: '8px 10px', fontSize: 10, fontFamily: 'monospace', color: '#3730a3', marginBottom: 8 }}>
            <div style={{ fontWeight: 700, color: '#3730a3', marginBottom: 4 }}>
              Reconstruction Validation: <span style={{ color: summary.allPass ? '#166534' : '#b91c1c' }}>{summary.allPass ? 'PASS — all rows match production engine' : 'FAIL — reconstruction diverges from production engine'}</span>
            </div>
            <div style={{ fontWeight: 700, color: '#991b1b', marginTop: 6, marginBottom: 4 }}>Automatic Trend Analysis</div>
            <div>Null centre: <strong>{fmt(summary.nullCentreFreq, 1)} Hz</strong> (SPL {fmt(summary.splAtNull, 2)} dB)</div>
            <div style={{ marginTop: 4, fontWeight: 700 }}>Vector magnitude change (null centre → 40 Hz / → 50 Hz):</div>
            {summary.changes.map((c) => (
              <div key={c.key} style={{ paddingLeft: 8 }}>{c.label}: Δ→40Hz {fmt(c.to40, 4)}, Δ→50Hz {fmt(c.to50, 4)}</div>
            ))}
            <div style={{ marginTop: 4, fontWeight: 700 }}>Phase relationship rotation (null centre → 40 Hz / → 50 Hz):</div>
            {summary.phaseChanges.map((p) => (
              <div key={p.key} style={{ paddingLeft: 8 }}>{p.label}: Δ→40Hz {fmt(p.to40, 1)}°, Δ→50Hz {fmt(p.to50, 1)}°</div>
            ))}
          </div>

          <div style={{ border: '1px solid #a5b4fc', borderRadius: 6, background: '#fff', padding: '8px 10px', fontSize: 10, fontFamily: 'monospace', color: '#3730a3' }}>
            <div style={{ fontWeight: 700, color: '#3730a3', marginBottom: 4 }}>Diagnosis (measurements only)</div>
            <div>✓ Biggest vector magnitude change to 40 Hz: <strong>{summary.biggestVectorChange.label}</strong> (Δ {fmt(summary.biggestVectorChange.to40, 4)})</div>
            <div>✓ Biggest phase relationship rotation to 40 Hz: <strong>{summary.biggestPhaseChange.label}</strong> (Δ {fmt(summary.biggestPhaseChange.to40, 1)}°)</div>
          </div>
        </>
      )}
    </div>
  );
}