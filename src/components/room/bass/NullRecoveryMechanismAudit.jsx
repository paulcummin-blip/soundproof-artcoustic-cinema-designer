// NullRecoveryMechanismAudit.jsx
// Temporary diagnostic panel — Bass Response page.
// Purpose: find why the 30–50 Hz null recovers too fast compared with REW.
// No physics/Q/smoothing/graph changes. Uses the exact same live engine call
// (simulateBassResponseRewCore + LIVE_SOURCE_CURVE/buildLiveEngineOptions) as
// LiveModalContributorAudit.jsx, which mirrors BassResponse.jsx's live options.

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

function computeRow(frequencyHz, roomDims, seatPos, subsForSimulation, surfaceAbsorption) {
  const options = buildLiveEngineOptions(frequencyHz, surfaceAbsorption);
  let totalDirectRe = 0, totalDirectIm = 0;
  let totalModalRe = 0, totalModalIm = 0;
  let totalFinalRe = 0, totalFinalIm = 0;
  const merged = new Map();

  subsForSimulation.forEach((sub) => {
    const engineOut = simulateBassResponseRewCore(roomDims, seatPos, sub, LIVE_SOURCE_CURVE, options);
    const vec = engineOut.perFrequencyVectorDebug?.[0];
    if (vec) {
      totalDirectRe += vec.directRe || 0;
      totalDirectIm += vec.directIm || 0;
      totalModalRe += vec.modalSumRe || 0;
      totalModalIm += vec.modalSumIm || 0;
      totalFinalRe += vec.finalRe || 0;
      totalFinalIm += vec.finalIm || 0;
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

  const directMag = Math.sqrt(totalDirectRe * totalDirectRe + totalDirectIm * totalDirectIm);
  const directPhase = (Math.atan2(totalDirectIm, totalDirectRe) * 180) / Math.PI;
  const modalMag = Math.sqrt(totalModalRe * totalModalRe + totalModalIm * totalModalIm);
  const modalPhase = (Math.atan2(totalModalIm, totalModalRe) * 180) / Math.PI;
  const finalMag = Math.sqrt(totalFinalRe * totalFinalRe + totalFinalIm * totalFinalIm);
  const finalSplDb = 20 * Math.log10(Math.max(finalMag, 1e-10));
  const ratio = directMag > 0 ? modalMag / directMag : null;
  let phaseDiff = Math.abs(modalPhase - directPhase);
  if (phaseDiff > 180) phaseDiff = 360 - phaseDiff;

  const contributorsArr = Array.from(merged.values())
    .map((m) => {
      const mag = Math.sqrt(m.re * m.re + m.im * m.im);
      const phase = (Math.atan2(m.im, m.re) * 180) / Math.PI;
      return { ...m, mag, phase };
    })
    .sort((a, b) => b.mag - a.mag);

  const topMode = contributorsArr[0] || null;
  const sumAbove80 = contributorsArr.filter((c) => c.modeFrequencyHz > 80).reduce((s, c) => s + c.mag, 0);
  const sumAbove120 = contributorsArr.filter((c) => c.modeFrequencyHz > 120).reduce((s, c) => s + c.mag, 0);
  const pctAbove80 = modalMag > 0 ? (sumAbove80 / modalMag) * 100 : 0;
  const pctAbove120 = modalMag > 0 ? (sumAbove120 / modalMag) * 100 : 0;

  return {
    frequencyHz, finalSplDb, directMag, directPhase, modalMag, modalPhase,
    ratio, phaseDiff, destructiveScore: phaseDiff, topMode,
    sumAbove80, sumAbove120, pctAbove80, pctAbove120, contributorsArr,
  };
}

const thS = {
  textAlign: 'right', padding: '3px 5px', fontSize: 9, fontWeight: 700,
  background: '#fef2f2', borderBottom: '2px solid #fca5a5', color: '#991b1b', whiteSpace: 'nowrap',
};
const tdS = { textAlign: 'right', padding: '2px 5px', fontSize: 9, fontFamily: 'monospace' };
function fmt(v, d = 2) { return Number.isFinite(v) ? v.toFixed(d) : '—'; }
function modeLabel(m) { return m ? `(${m.nx},${m.ny},${m.nz}) ${m.modeType} @ ${fmt(m.modeFrequencyHz, 1)}Hz` : '—'; }

export default function NullRecoveryMechanismAudit({ roomDims, seatingPositions, subsForSimulation, surfaceAbsorption }) {
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

  // ── Summary metrics ──
  const summary = useMemo(() => {
    if (!rows || rows.length === 0) return null;

    const nullRow = rows.reduce((best, r) => (r.finalSplDb < best.finalSplDb ? r : best), rows[0]);
    const nearest = (targetHz) => rows.reduce((best, r) => (Math.abs(r.frequencyHz - targetHz) < Math.abs(best.frequencyHz - targetHz) ? r : best), rows[0]);
    const row40 = nearest(40);
    const row50 = nearest(50);

    const firstBelow150 = rows.find((r) => r.phaseDiff < 150);
    const firstBelow120 = rows.find((r) => r.phaseDiff < 120);

    const avgRatio = rows.reduce((s, r) => s + (Number.isFinite(r.ratio) ? r.ratio : 0), 0) / rows.length;
    const avgPct80 = rows.reduce((s, r) => s + r.pctAbove80, 0) / rows.length;
    const avgPct120 = rows.reduce((s, r) => s + r.pctAbove120, 0) / rows.length;

    // Diagnosis D: dominant null-mode contribution drop from null centre → 40 Hz
    let dominantDropPct = null;
    if (nullRow.topMode) {
      const key = `${nullRow.topMode.nx},${nullRow.topMode.ny},${nullRow.topMode.nz}`;
      const magAtNull = nullRow.topMode.mag;
      const entryAt40 = row40.contributorsArr.find((c) => `${c.nx},${c.ny},${c.nz}` === key);
      const magAt40 = entryAt40 ? entryAt40.mag : 0;
      dominantDropPct = magAtNull > 0 ? ((magAtNull - magAt40) / magAtNull) * 100 : null;
    }

    const diagnoses = [
      {
        key: 'A', label: 'Phase rotation too fast',
        trigger: !!firstBelow150 && firstBelow150.frequencyHz < 40,
        detail: firstBelow150 ? `Phase diff first < 150° at ${fmt(firstBelow150.frequencyHz, 1)} Hz` : 'Phase diff never drops below 150° in range',
      },
      {
        key: 'B', label: 'Direct field overpowering modal cancellation',
        trigger: (() => {
          const firstBelowRatio1 = rows.find((r) => Number.isFinite(r.ratio) && r.ratio < 1.0);
          return !!firstBelowRatio1 && firstBelowRatio1.frequencyHz < 40;
        })(),
        detail: (() => {
          const firstBelowRatio1 = rows.find((r) => Number.isFinite(r.ratio) && r.ratio < 1.0);
          return firstBelowRatio1 ? `Modal/direct ratio first < 1.0 at ${fmt(firstBelowRatio1.frequencyHz, 1)} Hz` : 'Ratio stays ≥ 1.0 throughout range';
        })(),
      },
      {
        key: 'C', label: 'High-frequency modal tails too dominant',
        trigger: avgPct80 > 50,
        detail: `Average % modal magnitude from modes > 80 Hz: ${fmt(avgPct80, 1)}%`,
      },
      {
        key: 'D', label: 'Low null-mode influence decays too fast',
        trigger: dominantDropPct !== null && dominantDropPct > 50,
        detail: dominantDropPct !== null ? `Dominant null mode contribution drops ${fmt(dominantDropPct, 1)}% from null centre to 40 Hz` : 'Could not evaluate — no dominant mode at null centre',
      },
    ];

    return {
      nullCentreFreq: nullRow.frequencyHz,
      splAtNull: nullRow.finalSplDb,
      splAt40: row40.finalSplDb,
      splAt50: row50.finalSplDb,
      recoveryTo40: row40.finalSplDb - nullRow.finalSplDb,
      recoveryTo50: row50.finalSplDb - nullRow.finalSplDb,
      freqBelow150: firstBelow150?.frequencyHz ?? null,
      freqBelow120: firstBelow120?.frequencyHz ?? null,
      avgRatio, avgPct80, avgPct120,
      diagnoses,
    };
  }, [rows]);

  return (
    <div style={{ border: '2px solid #b91c1c', borderRadius: 8, background: '#fef2f2', padding: '10px 12px', marginTop: 8, marginBottom: 8 }}>
      <div style={{ fontWeight: 700, color: '#991b1b', fontSize: 12, fontFamily: 'monospace', marginBottom: 4 }}>
        Null Recovery Mechanism Audit
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          temporary diagnostic · exact live engine inputs · no physics/graph changes
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'monospace', color: '#7f1d1d' }}>
          Seat:
          <select
            value={effectiveSeatId || ''}
            onChange={(e) => setSelectedSeatId(e.target.value)}
            style={{ height: 24, border: '1px solid #fca5a5', borderRadius: 4, padding: '0 6px', fontSize: 10, fontFamily: 'monospace' }}
          >
            {seatLabels.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'monospace', color: '#7f1d1d' }}>
          Start (Hz):
          <input type="number" step="0.5" value={freqStart} onChange={(e) => setFreqStart(parseFloat(e.target.value) || 30)}
            style={{ width: 60, height: 24, border: '1px solid #fca5a5', borderRadius: 4, padding: '0 6px', fontSize: 10, fontFamily: 'monospace' }} />
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'monospace', color: '#7f1d1d' }}>
          End (Hz):
          <input type="number" step="0.5" value={freqEnd} onChange={(e) => setFreqEnd(parseFloat(e.target.value) || 50)}
            style={{ width: 60, height: 24, border: '1px solid #fca5a5', borderRadius: 4, padding: '0 6px', fontSize: 10, fontFamily: 'monospace' }} />
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'monospace', color: '#7f1d1d' }}>
          Step (Hz):
          <input type="number" step="0.5" min="0.1" value={step} onChange={(e) => setStep(Math.max(0.1, parseFloat(e.target.value) || 1))}
            style={{ width: 50, height: 24, border: '1px solid #fca5a5', borderRadius: 4, padding: '0 6px', fontSize: 10, fontFamily: 'monospace' }} />
        </label>

        <button
          onClick={runAudit}
          disabled={running || !canRun}
          style={{
            height: 26, padding: '0 12px', borderRadius: 6,
            border: '1px solid #991b1b', background: running ? '#e5e7eb' : '#991b1b',
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
          {/* ── Per-frequency table ── */}
          <div style={{ overflowX: 'auto', marginBottom: 10 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 1400 }}>
              <thead>
                <tr>
                  <th style={thS}>Hz</th>
                  <th style={thS}>Final SPL</th>
                  <th style={thS}>Direct Mag</th>
                  <th style={thS}>Direct °</th>
                  <th style={thS}>Modal Mag</th>
                  <th style={thS}>Modal °</th>
                  <th style={thS}>Modal/Direct</th>
                  <th style={thS}>Phase Δ (0–180°)</th>
                  <th style={thS}>Destructive Score</th>
                  <th style={{ ...thS, textAlign: 'left' }}>Top Mode</th>
                  <th style={thS}>Top Mode Hz</th>
                  <th style={{ ...thS, textAlign: 'left' }}>Top Mode Family</th>
                  <th style={thS}>Top Mode °</th>
                  <th style={thS}>Top Mode Mag</th>
                  <th style={thS}>Σ Modal &gt;80Hz</th>
                  <th style={thS}>Σ Modal &gt;120Hz</th>
                  <th style={thS}>% &gt;80Hz</th>
                  <th style={thS}>% &gt;120Hz</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.frequencyHz} style={{ borderBottom: '1px solid #fecaca' }}>
                    <td style={{ ...tdS, fontWeight: 700, color: '#7f1d1d' }}>{fmt(r.frequencyHz, 1)}</td>
                    <td style={{ ...tdS, fontWeight: 700 }}>{fmt(r.finalSplDb, 2)}</td>
                    <td style={tdS}>{fmt(r.directMag, 4)}</td>
                    <td style={tdS}>{fmt(r.directPhase, 1)}</td>
                    <td style={tdS}>{fmt(r.modalMag, 4)}</td>
                    <td style={tdS}>{fmt(r.modalPhase, 1)}</td>
                    <td style={tdS}>{fmt(r.ratio, 3)}</td>
                    <td style={tdS}>{fmt(r.phaseDiff, 1)}</td>
                    <td style={{ ...tdS, fontWeight: r.destructiveScore > 150 ? 700 : 400, color: r.destructiveScore > 150 ? '#b91c1c' : undefined }}>{fmt(r.destructiveScore, 1)}</td>
                    <td style={{ ...tdS, textAlign: 'left' }}>{r.topMode ? `(${r.topMode.nx},${r.topMode.ny},${r.topMode.nz})` : '—'}</td>
                    <td style={tdS}>{fmt(r.topMode?.modeFrequencyHz, 1)}</td>
                    <td style={{ ...tdS, textAlign: 'left' }}>{r.topMode?.modeType || '—'}</td>
                    <td style={tdS}>{fmt(r.topMode?.phase, 1)}</td>
                    <td style={tdS}>{fmt(r.topMode?.mag, 4)}</td>
                    <td style={tdS}>{fmt(r.sumAbove80, 4)}</td>
                    <td style={tdS}>{fmt(r.sumAbove120, 4)}</td>
                    <td style={tdS}>{fmt(r.pctAbove80, 1)}%</td>
                    <td style={tdS}>{fmt(r.pctAbove120, 1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Summary metrics ── */}
          <div style={{ border: '1px solid #fca5a5', borderRadius: 6, background: '#fff', padding: '8px 10px', fontSize: 10, fontFamily: 'monospace', color: '#7f1d1d', marginBottom: 8 }}>
            <div style={{ fontWeight: 700, color: '#991b1b', marginBottom: 4 }}>Summary Metrics</div>
            <div>1. Null centre frequency: <strong>{fmt(summary.nullCentreFreq, 1)} Hz</strong></div>
            <div>2. SPL at null: <strong>{fmt(summary.splAtNull, 2)} dB</strong></div>
            <div>3. SPL at 40 Hz: <strong>{fmt(summary.splAt40, 2)} dB</strong></div>
            <div>4. SPL at 50 Hz: <strong>{fmt(summary.splAt50, 2)} dB</strong></div>
            <div>5. Recovery null → 40 Hz: <strong>{fmt(summary.recoveryTo40, 2)} dB</strong></div>
            <div>6. Recovery null → 50 Hz: <strong>{fmt(summary.recoveryTo50, 2)} dB</strong></div>
            <div>7. Freq where phase Δ first &lt; 150°: <strong>{summary.freqBelow150 !== null ? `${fmt(summary.freqBelow150, 1)} Hz` : 'never'}</strong></div>
            <div>8. Freq where phase Δ first &lt; 120°: <strong>{summary.freqBelow120 !== null ? `${fmt(summary.freqBelow120, 1)} Hz` : 'never'}</strong></div>
            <div>9. Average modal/direct ratio: <strong>{fmt(summary.avgRatio, 3)}</strong></div>
            <div>10. Average % modal magnitude &gt; 80 Hz: <strong>{fmt(summary.avgPct80, 1)}%</strong></div>
            <div>11. Average % modal magnitude &gt; 120 Hz: <strong>{fmt(summary.avgPct120, 1)}%</strong></div>
          </div>

          {/* ── Automatic diagnosis ── */}
          <div style={{ border: '1px solid #fca5a5', borderRadius: 6, background: '#fff', padding: '8px 10px', fontSize: 10, fontFamily: 'monospace', color: '#7f1d1d' }}>
            <div style={{ fontWeight: 700, color: '#991b1b', marginBottom: 4 }}>Automatic Diagnosis</div>
            {summary.diagnoses.map((d) => (
              <div key={d.key} style={{ marginBottom: 4, paddingBottom: 4, borderBottom: '1px solid #fee2e2' }}>
                <span style={{ fontWeight: 700, color: d.trigger ? '#b91c1c' : '#166534' }}>
                  {d.trigger ? 'FAIL' : 'PASS'}
                </span>
                {' — '}
                <strong>{d.key}) {d.label}</strong>
                <div style={{ color: '#6b7280', fontSize: 9, marginTop: 2 }}>{d.detail}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}