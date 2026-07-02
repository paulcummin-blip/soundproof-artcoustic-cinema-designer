// LiveModalContributorAudit.jsx
// Temporary diagnostic panel — Bass Response page.
// Calls the REAL production engine (simulateBassResponseRewCore) with the EXACT
// options BassResponse.jsx uses for the live graph (flat_rew_reference source +
// full_field parity mode — the current default/live state, since the dev panel
// that could change these is hidden). No physics/Q/graph changes. Read-only.

import React, { useState, useCallback } from 'react';
import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';

// Identical to REW_SOURCE_CURVES.flat_rew_reference in BassResponse.jsx — the
// source curve actually used by the live graph (flat 94 dB reference).
// Exported so other diagnostic panels reuse the exact same values instead of duplicating them.
export const LIVE_SOURCE_CURVE = [
  { hz: 20, db: 94 },
  { hz: 50, db: 94 },
  { hz: 100, db: 94 },
  { hz: 200, db: 94 },
];

// Identical option set BassResponse.jsx passes to simulateBassResponseRewCore
// when rewSourceCurveMode === 'flat_rew_reference' && rewParityFieldMode === 'full_field'
// (the current default/live state — dev panel that could change these is hidden).
// Exported so other diagnostic panels reuse the exact same options instead of duplicating them.
export function buildLiveEngineOptions(frequencyHz, surfaceAbsorption) {
  return {
    enableReflections: false,
    enableModes: true,
    surfaceAbsorption,
    freqMinHz: frequencyHz,
    freqMaxHz: frequencyHz + 0.01,
    // Mode generation must use the same fMax as the production bass graph (20-200 Hz) so
    // higher-frequency modes can still contribute their resonant tails at the evaluated
    // frequency — matching the production modal set exactly. The evaluated frequency itself
    // stays pinned to frequencyHz via freqMinHz/freqMaxHz above.
    modeGenerationFMaxHz: 200,
    smoothing: 'none',
    modalSourceReferenceMode: 'distance_normalized',
    modalGainScalar: 1.0,
    axialQ: 4.0,
    modalStorageMode: 'none',
    propagationPhaseScale: 0,
    pureDeterministicModalSum: true,
    disableReflectionPhaseJitter: false,
    disableReflectionCoherenceWeight: false,
    disableLateField: true,
    disableModalPropagationPhase: true,
    debugInvertModalVector: false,
    debugModalPhaseConvention: 'normal',
    mute68HzAxialMode: false,
    debugDisableModalContribution: false,
    overrideConstantAxialQ: false,
    overrideAbsorptionAxialQ: false,
    debugMode200Multiplier: 1.0,
    debugReflectionOrder: 1,
    reflectionGainScale: 1.0,
    debugModalHSign: 'normal',
    rewParityModalMagnitudeScale: 1.0,
    modalCoherenceMode: 'coherent',
    highOrderAxialScale: 1.0,
    qStrategy: 'production',
  };
}

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

const thS = {
  textAlign: 'right', padding: '3px 5px', fontSize: 9, fontWeight: 700,
  background: '#ecfeff', borderBottom: '2px solid #67e8f9', color: '#155e75', whiteSpace: 'nowrap',
};
const tdS = { textAlign: 'right', padding: '2px 5px', fontSize: 9, fontFamily: 'monospace' };
function fmt(v, d = 3) { return Number.isFinite(v) ? v.toFixed(d) : '—'; }

export default function LiveModalContributorAudit({ roomDims, seatingPositions, subsForSimulation, surfaceAbsorption }) {
  const [frequencyHz, setFrequencyHz] = useState(40.6);
  const [selectedSeatId, setSelectedSeatId] = useState(null);
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);

  const seatLabels = buildSeatLabels(seatingPositions);
  const effectiveSeatId = selectedSeatId || seatLabels[0]?.id || null;

  const canRun = !!(
    roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM &&
    effectiveSeatId && Array.isArray(subsForSimulation) && subsForSimulation.length > 0
  );

  const runAudit = useCallback(() => {
    if (!canRun) return;
    setRunning(true);

    const seatEntry = seatLabels.find((s) => s.id === effectiveSeatId);
    const seat = seatEntry?.seat;
    const seatZ = Number.isFinite(Number(seat?.z)) ? Number(seat.z) : 1.2;
    const seatPos = { x: Number(seat.x), y: Number(seat.y), z: seatZ };
    const options = buildLiveEngineOptions(frequencyHz, surfaceAbsorption);

    let totalRe = 0;
    let totalIm = 0;
    let totalModalSumRe = 0;
    let totalModalSumIm = 0;
    const perSubResults = [];

    subsForSimulation.forEach((sub) => {
      const engineOut = simulateBassResponseRewCore(
        { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM },
        seatPos,
        sub,
        LIVE_SOURCE_CURVE,
        options
      );

      const cp = engineOut.complexPressure?.[0];
      if (cp) { totalRe += cp.re; totalIm += cp.im; }

      const debugRow = engineOut.activeModalContributorDebugSeries?.[0] || null;
      if (debugRow) {
        totalModalSumRe += debugRow.modalSumRe || 0;
        totalModalSumIm += debugRow.modalSumIm || 0;
      }

      perSubResults.push({
        subId: sub.id,
        subX: sub.x, subY: sub.y, subZ: sub.z,
        contributors: debugRow?.contributors || [],
        actualFrequencyHz: engineOut.freqsHz?.[0] ?? null,
      });
    });

    // Merge per-mode vectors (coherent complex sum) across all active subs.
    const merged = new Map();
    perSubResults.forEach(({ subId, subX, subY, subZ, contributors }) => {
      contributors.forEach((row) => {
        const key = `${row.nx},${row.ny},${row.nz}`;
        if (!merged.has(key)) {
          merged.set(key, {
            nx: row.nx, ny: row.ny, nz: row.nz,
            modeFrequencyHz: row.modeFrequencyHz,
            modeType: row.modeType,
            qValue: row.qValue,
            re: 0, im: 0,
            sourceCouplings: [],
            receiverCoupling: row.receiverCoupling,
          });
        }
        const m = merged.get(key);
        m.re += row.activeReal;
        m.im += row.activeImag;
        m.sourceCouplings.push({ subId, subX, subY, subZ, value: row.sourceCoupling });
      });
    });

    const totalModalMagnitude = Math.sqrt(totalModalSumRe * totalModalSumRe + totalModalSumIm * totalModalSumIm);
    const thresholdMag = totalModalMagnitude * 0.01;

    const rows = Array.from(merged.values())
      .map((m) => {
        const magnitude = Math.sqrt(m.re * m.re + m.im * m.im);
        const phaseDeg = (Math.atan2(m.im, m.re) * 180) / Math.PI;
        const pctOfTotal = totalModalMagnitude > 0 ? (magnitude / totalModalMagnitude) * 100 : 0;
        return { ...m, magnitude, phaseDeg, pctOfTotal };
      })
      .filter((r) => r.magnitude > thresholdMag)
      .sort((a, b) => b.magnitude - a.magnitude);

    const finalMagnitude = Math.sqrt(totalRe * totalRe + totalIm * totalIm);
    const finalSplDb = 20 * Math.log10(Math.max(finalMagnitude, 1e-10));

    setResult({
      seatId: effectiveSeatId,
      seatPos,
      subsUsed: subsForSimulation.map((s) => ({ id: s.id, x: s.x, y: s.y, z: s.z })),
      actualFrequencyHz: perSubResults[0]?.actualFrequencyHz ?? frequencyHz,
      totalModalMagnitude,
      thresholdMag,
      rows,
      finalSplDb,
      finalRe: totalRe,
      finalIm: totalIm,
    });
    setRunning(false);
  }, [canRun, effectiveSeatId, frequencyHz, roomDims, seatLabels, subsForSimulation, surfaceAbsorption]);

  return (
    <div style={{ border: '2px solid #0891b2', borderRadius: 8, background: '#ecfeff', padding: '10px 12px', marginTop: 8, marginBottom: 8 }}>
      <div style={{ fontWeight: 700, color: '#0e7490', fontSize: 12, fontFamily: 'monospace', marginBottom: 4 }}>
        Live Modal Contributor Audit
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          temporary diagnostic · reads real per-mode engine output · no physics/graph changes
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'monospace', color: '#155e75' }}>
          Frequency (Hz):
          <input
            type="number"
            step="0.1"
            value={frequencyHz}
            onChange={(e) => setFrequencyHz(Math.max(1, parseFloat(e.target.value) || 40.6))}
            style={{ width: 70, height: 24, border: '1px solid #67e8f9', borderRadius: 4, padding: '0 6px', fontSize: 10, fontFamily: 'monospace' }}
          />
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'monospace', color: '#155e75' }}>
          Seat:
          <select
            value={effectiveSeatId || ''}
            onChange={(e) => setSelectedSeatId(e.target.value)}
            style={{ height: 24, border: '1px solid #67e8f9', borderRadius: 4, padding: '0 6px', fontSize: 10, fontFamily: 'monospace' }}
          >
            {seatLabels.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </label>

        <button
          onClick={runAudit}
          disabled={running || !canRun}
          style={{
            height: 26, padding: '0 12px', borderRadius: 6,
            border: '1px solid #0e7490', background: running ? '#e5e7eb' : '#0e7490',
            color: running ? '#6b7280' : '#fff', fontSize: 10, fontFamily: 'monospace',
            cursor: running || !canRun ? 'not-allowed' : 'pointer', fontWeight: 600,
          }}
        >
          {running ? 'Running…' : 'Run Audit'}
        </button>

        {!canRun && (
          <span style={{ fontSize: 9, color: '#b45309', fontFamily: 'monospace' }}>
            ⚠ Need room dims, seat, and at least one sub.
          </span>
        )}
      </div>

      {result && (
        <>
          {/* ── Live engine inputs readout ── */}
          <div style={{ border: '1px solid #a5f3fc', borderRadius: 6, background: '#fff', padding: '6px 8px', fontSize: 9, fontFamily: 'monospace', color: '#164e63', marginBottom: 8 }}>
            <div><strong>Room W/L/H passed to engine:</strong> {fmt(roomDims.widthM, 3)} / {fmt(roomDims.lengthM, 3)} / {fmt(roomDims.heightM, 3)} m</div>
            <div><strong>Selected seat x/y/z passed to engine:</strong> {fmt(result.seatPos.x)} / {fmt(result.seatPos.y)} / {fmt(result.seatPos.z)}</div>
            {result.subsUsed.map((s, i) => (
              <div key={s.id || i}><strong>Sub[{i}] ({s.id}) x/y/z:</strong> {fmt(s.x)} / {fmt(s.y)} / {fmt(s.z)}</div>
            ))}
            <div><strong>Actual engine frequency bin used:</strong> {fmt(result.actualFrequencyHz, 4)} Hz (requested {fmt(frequencyHz, 2)} Hz)</div>
            <div><strong>Final SPL at this frequency (all subs summed):</strong> {fmt(result.finalSplDb, 2)} dB</div>
            <div><strong>Total modal magnitude (vector sum, all subs):</strong> {fmt(result.totalModalMagnitude, 4)} — 1% threshold: {fmt(result.thresholdMag, 4)}</div>
          </div>

          {/* ── Raw per-mode contributor table ── */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900 }}>
              <thead>
                <tr>
                  <th style={{ ...thS, textAlign: 'left' }}>Mode (nx,ny,nz)</th>
                  <th style={thS}>Mode Freq (Hz)</th>
                  <th style={{ ...thS, textAlign: 'left' }}>Family</th>
                  <th style={thS}>Q</th>
                  <th style={thS}>Src Cpl</th>
                  <th style={thS}>Rcv Cpl</th>
                  <th style={thS}>Real</th>
                  <th style={thS}>Imag</th>
                  <th style={thS}>Magnitude</th>
                  <th style={thS}>Phase (°)</th>
                  <th style={thS}>% of Total</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.length === 0 && (
                  <tr><td colSpan={11} style={{ ...tdS, textAlign: 'left', color: '#6b7280' }}>No modes exceed 1% of total modal magnitude at this frequency/seat.</td></tr>
                )}
                {result.rows.map((r) => {
                  const srcCplLabel = r.sourceCouplings.length === 1
                    ? fmt(r.sourceCouplings[0].value, 4)
                    : r.sourceCouplings.map((sc) => `${sc.subId}:${fmt(sc.value, 4)}`).join(' | ');
                  return (
                    <tr key={`${r.nx},${r.ny},${r.nz}`} style={{ borderBottom: '1px solid #cffafe' }}>
                      <td style={{ ...tdS, textAlign: 'left', fontWeight: 700, color: '#0c4a6e' }}>({r.nx},{r.ny},{r.nz})</td>
                      <td style={tdS}>{fmt(r.modeFrequencyHz, 2)}</td>
                      <td style={{ ...tdS, textAlign: 'left' }}>{r.modeType}</td>
                      <td style={tdS}>{fmt(r.qValue, 2)}</td>
                      <td style={tdS}>{srcCplLabel}</td>
                      <td style={tdS}>{fmt(r.receiverCoupling, 4)}</td>
                      <td style={tdS}>{fmt(r.re, 3)}</td>
                      <td style={tdS}>{fmt(r.im, 3)}</td>
                      <td style={{ ...tdS, fontWeight: 700 }}>{fmt(r.magnitude, 3)}</td>
                      <td style={tdS}>{fmt(r.phaseDeg, 1)}</td>
                      <td style={{ ...tdS, fontWeight: 700, color: '#0e7490' }}>{fmt(r.pctOfTotal, 2)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 6, fontSize: 9, fontFamily: 'monospace', color: '#6b7280' }}>
            Real/Imag/Magnitude/Phase are the coherent complex sum of this mode's active stored contribution across all active subwoofers (identical vectors the engine adds into modalSumRe/modalSumIm). Source coupling is listed per-sub when more than one sub is active; receiver coupling depends only on seat + mode, so it is shared.
          </div>
        </>
      )}
    </div>
  );
}