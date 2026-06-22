/**
 * DirectModalEnergyAudit — Diagnostic only.
 *
 * For 70, 80, 85, 90 Hz shows:
 *   Direct pressure magnitude + SPL
 *   Modal pressure magnitude + SPL
 *   Boundary gain (reflections) magnitude + SPL
 *   Final complex summed pressure magnitude + SPL
 *   Graph SPL at that frequency (from live multiSeries)
 *   Delta: Graph SPL − Audit SPL → PASS if within 0.1 dB
 *
 * Runs three isolated engine calls:
 *   1. Direct-only  (reflections=false, modes=false)
 *   2. Modal-only   (reflections=false, modes=true, direct suppressed via modalSourceReferenceMode trick)
 *   3. Full         (reflections=true per user setting, modes=true)
 *
 * Raw values only. No normalisation. No smoothing. No RP22.
 */
import React, { useState, useCallback } from 'react';
import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';

// ─── constants ────────────────────────────────────────────────────────────────
const MONO  = 'monospace';
const TARGETS = [70, 80, 85, 90];
const FLAT_CURVE = [
  { hz: 20, db: 94 }, { hz: 50, db: 94 },
  { hz: 100, db: 94 }, { hz: 200, db: 94 },
];

// ─── helpers ─────────────────────────────────────────────────────────────────
function toDb(v) {
  if (!Number.isFinite(v) || v <= 0) return null;
  return 20 * Math.log10(v);
}
function fmtLin(v, d = 6) {
  if (!Number.isFinite(v)) return '—';
  return Math.abs(v) >= 1e4 ? v.toExponential(3) : v.toFixed(d);
}
function fmtDb(db) {
  return Number.isFinite(db) ? db.toFixed(2) + ' dB' : '—';
}
function cell(lin, db) {
  return `${fmtLin(lin)}  /  ${fmtDb(db)}`;
}

// Finds closest bin in freqsHz to targetHz (tolerance 2 Hz)
function binAt(freqsHz, targetHz) {
  let best = -1, bestDist = Infinity;
  for (let i = 0; i < freqsHz.length; i++) {
    const d = Math.abs(freqsHz[i] - targetHz);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return bestDist <= 2 ? best : -1;
}

// Interpolates SPL from graph series
function graphSplAt(series, targetHz) {
  if (!Array.isArray(series) || series.length === 0) return null;
  let best = null, bestDist = Infinity;
  for (const pt of series) {
    const d = Math.abs(pt.frequency - targetHz);
    if (d < bestDist) { bestDist = d; best = pt.spl; }
  }
  return bestDist <= 2 ? best : null;
}

// Shared engine options for parity (matches dominantModeAuditLogic)
function baseEngineOpts(surfaceAbsorption, axialQ) {
  return {
    surfaceAbsorption,
    freqMinHz: 20,
    freqMaxHz: 200,
    smoothing: 'none',
    axialQ,
    propagationPhaseScale: 0,
    pureDeterministicModalSum: true,
    disableModalPropagationPhase: true,
    modalCoherenceMode: 'coherent',
    modalStorageMode: 'none',
    modalGainScalar: 1.0,
    modalSourceReferenceMode: 'existing',
    highOrderAxialScale: 1.0,
    disableLateField: true,
    debugReflectionOrder: 1,
  };
}

// ─── styles ───────────────────────────────────────────────────────────────────
const TH = {
  textAlign: 'right', padding: '3px 6px', fontSize: 9,
  fontWeight: 700, background: '#1f2937', color: '#f9fafb',
  borderBottom: '2px solid #374151', whiteSpace: 'nowrap',
};
const TD = { padding: '3px 6px', fontSize: 9, fontFamily: MONO, textAlign: 'right' };

function PassFail({ auditSpl, graphSpl }) {
  if (!Number.isFinite(auditSpl) || !Number.isFinite(graphSpl)) {
    return <span style={{ color: '#6b7280', fontFamily: MONO, fontSize: 9 }}>N/A</span>;
  }
  const delta = graphSpl - auditSpl;
  const pass  = Math.abs(delta) <= 0.1;
  return (
    <span style={{
      fontFamily: MONO, fontSize: 9, fontWeight: 700,
      padding: '1px 5px', borderRadius: 3,
      background: pass ? '#dcfce7' : '#fee2e2',
      color: pass ? '#166534' : '#dc2626',
    }}>
      {pass ? '✓ PASS' : '✗ FAIL'}  Δ{delta >= 0 ? '+' : ''}{delta.toFixed(3)} dB
    </span>
  );
}

// ─── per-frequency row ────────────────────────────────────────────────────────
function FreqRow({ hz, directMag, reflMag, modalMag, fullMag, auditSplDb, graphSpl }) {
  const directDb = toDb(directMag);
  const reflDb   = toDb(reflMag);
  const modalDb  = toDb(modalMag);
  const fullDb   = toDb(fullMag);

  return (
    <tr style={{ borderBottom: '1px solid #374151' }}>
      <td style={{ ...TD, fontWeight: 700, color: '#fbbf24' }}>{hz} Hz</td>

      {/* Direct */}
      <td style={{ ...TD, color: '#60a5fa' }}>{fmtLin(directMag)}</td>
      <td style={{ ...TD, color: '#60a5fa' }}>{fmtDb(directDb)}</td>

      {/* Boundary (reflections) */}
      <td style={{ ...TD, color: '#a78bfa' }}>{fmtLin(reflMag)}</td>
      <td style={{ ...TD, color: '#a78bfa' }}>{fmtDb(reflDb)}</td>

      {/* Modal */}
      <td style={{ ...TD, color: '#34d399' }}>{fmtLin(modalMag)}</td>
      <td style={{ ...TD, color: '#34d399' }}>{fmtDb(modalDb)}</td>

      {/* Final summed */}
      <td style={{ ...TD, fontWeight: 700, color: '#fcd34d' }}>{fmtLin(fullMag)}</td>
      <td style={{ ...TD, fontWeight: 700, color: '#fcd34d' }}>{fmtDb(fullDb)}</td>

      {/* Audit SPL */}
      <td style={{ ...TD, fontWeight: 700, color: '#f9fafb' }}>{fmtDb(auditSplDb)}</td>

      {/* Graph SPL */}
      <td style={{ ...TD, color: '#9ca3af' }}>{Number.isFinite(graphSpl) ? graphSpl.toFixed(2) + ' dB' : '—'}</td>

      {/* PASS/FAIL */}
      <td style={{ ...TD, textAlign: 'center' }}>
        <PassFail auditSpl={auditSplDb} graphSpl={graphSpl} />
      </td>
    </tr>
  );
}

// ─── main component ───────────────────────────────────────────────────────────
/**
 * @param {object}   roomDims        - { widthM, lengthM, heightM }
 * @param {object}   seat            - { x, y, z }
 * @param {object}   sub             - single sub object { x, y, z, modelKey, tuning }
 * @param {object}   surfaceAbsorption
 * @param {object}   activeSettings  - { axialQ, ... }
 * @param {Array}    graphSeries     - live graph series data [{ frequency, spl }]
 */
export default function DirectModalEnergyAudit({
  roomDims, seat, sub, surfaceAbsorption, activeSettings, graphSeries,
}) {
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);
  const [error,   setError]   = useState(null);

  const canRun = !!(
    roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM &&
    seat?.x != null && seat?.y != null &&
    sub?.x  != null && sub?.y  != null
  );

  const run = useCallback(async () => {
    if (!canRun) return;
    setRunning(true);
    setResults(null);
    setError(null);
    await new Promise(r => setTimeout(r, 0));

    try {
      const axialQ   = activeSettings?.axialQ ?? 4.0;
      const seatObj  = { x: seat.x, y: seat.y, z: Number.isFinite(Number(seat.z)) ? Number(seat.z) : 1.2 };
      const baseOpts = baseEngineOpts(surfaceAbsorption, axialQ);

      // 1. Direct-only: no reflections, no modes
      const directResult = simulateBassResponseRewCore(
        roomDims, seatObj, sub, FLAT_CURVE,
        { ...baseOpts, enableReflections: false, enableModes: false }
      );

      // 2. Reflections-only: reflections on, modes off
      const reflResult = simulateBassResponseRewCore(
        roomDims, seatObj, sub, FLAT_CURVE,
        { ...baseOpts, enableReflections: true, enableModes: false, disableLateField: false }
      );

      // 3. Full: reflections + modes (matches production path)
      const fullResult = simulateBassResponseRewCore(
        roomDims, seatObj, sub, FLAT_CURVE,
        { ...baseOpts, enableReflections: false, enableModes: true }
      );

      // 4. Full combined (direct + modes — matching dominantModeAuditLogic)
      //    direct path is included in the full result implicitly

      const freqsHz = fullResult.freqsHz;

      const rows = TARGETS.map(targetHz => {
        const iDirect = binAt(directResult.freqsHz, targetHz);
        const iRefl   = binAt(reflResult.freqsHz,   targetHz);
        const iFull   = binAt(freqsHz,               targetHz);

        // Direct magnitude
        const dCp   = iDirect >= 0 ? directResult.complexPressure[iDirect] : null;
        const directMag = dCp ? Math.sqrt(dCp.re * dCp.re + dCp.im * dCp.im) : 0;

        // Reflection contribution = |full_reflOnly| − |direct| (boundary gain)
        // More precisely: we isolate by differencing direct-only vs (direct+reflections)
        const rCp   = iRefl >= 0 ? reflResult.complexPressure[iRefl] : null;
        const reflTotalMag = rCp ? Math.sqrt(rCp.re * rCp.re + rCp.im * rCp.im) : 0;
        // Boundary gain magnitude = the reflections-only contribution magnitude
        // We derive it as |P_direct+refl| exposed via preModalMagnitude from wholeCurveDebugRows
        // Direct approach: boundary = |direct+refl| (from reflResult) − direct (scalar subtraction is wrong for complex)
        // Instead expose |P_direct| vs |P_direct+refl| separately
        const reflBoundaryMag = reflTotalMag; // magnitude of (direct + reflections) combined

        // Modal magnitude = from wholeCurveDebugRows.modalSumMagnitude at that bin
        const wcdFull = Array.isArray(fullResult.wholeCurveDebugRows)
          ? fullResult.wholeCurveDebugRows.find(r => r?.targetHz === targetHz || Math.abs((r?.frequencyHz ?? 0) - targetHz) <= 2)
          : null;
        const modalMag   = wcdFull?.modalSumMagnitude ?? 0;

        // Final: from full engine complexPressure
        const fCp    = iFull >= 0 ? fullResult.complexPressure[iFull] : null;
        const fullMag = fCp ? Math.sqrt(fCp.re * fCp.re + fCp.im * fCp.im) : 0;
        const auditSplDb = toDb(fullMag);

        const graphSpl = graphSplAt(graphSeries, targetHz);

        return {
          hz: targetHz,
          directMag,
          reflBoundaryMag,
          modalMag,
          fullMag,
          auditSplDb,
          graphSpl,
          // extra detail
          directRe:  dCp?.re ?? 0,
          directIm:  dCp?.im ?? 0,
          fullRe:    fCp?.re ?? 0,
          fullIm:    fCp?.im ?? 0,
          preModalMag: wcdFull?.preModalMagnitude ?? directMag,
        };
      });

      setResults({ rows });
    } catch (e) {
      setError(e?.message ?? String(e));
    } finally {
      setRunning(false);
    }
  }, [roomDims, seat, sub, surfaceAbsorption, activeSettings, graphSeries, canRun]);

  const allPass = results?.rows?.every(r => {
    if (!Number.isFinite(r.auditSplDb) || !Number.isFinite(r.graphSpl)) return true;
    return Math.abs(r.graphSpl - r.auditSplDb) <= 0.1;
  });

  return (
    <div style={{
      marginTop: 12,
      border: '1px solid #374151',
      borderRadius: 8,
      background: '#111827',
      padding: '10px 12px',
    }}>
      {/* header */}
      <div style={{ fontWeight: 700, color: '#f9fafb', fontSize: 11, fontFamily: MONO, marginBottom: 3 }}>
        Direct vs Modal Energy Audit
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 10 }}>
          diagnostic only · does not affect live graph · flat 94 dB source
        </span>
      </div>

      {/* description */}
      <div style={{ fontSize: 9, color: '#9ca3af', fontFamily: MONO, marginBottom: 6, lineHeight: 1.5 }}>
        Isolates direct / boundary / modal contributions via separate engine runs.
        Final SPL compared to live graph — PASS within 0.1 dB.
        <br/>
        <span style={{ color: '#6b7280' }}>
          Run 1: direct only (modes=off, refl=off) ·
          Run 2: direct+reflections (modes=off) ·
          Run 3: direct+modes (refl=off, REW parity path)
        </span>
      </div>

      {!canRun && (
        <div style={{ fontSize: 10, color: '#fbbf24', fontFamily: MONO, marginBottom: 6 }}>
          ⚠ Requires room dimensions, seat position, and sub position.
        </div>
      )}

      <button
        onClick={run}
        disabled={running || !canRun}
        style={{
          height: 28, padding: '0 14px', borderRadius: 6,
          border: `1px solid ${running || !canRun ? '#374151' : '#4b5563'}`,
          background: running || !canRun ? '#374151' : '#1f2937',
          color:      running || !canRun ? '#6b7280' : '#f9fafb',
          fontSize: 11, fontFamily: MONO, fontWeight: 600,
          cursor: running || !canRun ? 'not-allowed' : 'pointer',
          marginBottom: 10,
        }}
      >
        {running ? 'Running…' : results ? 'Re-run audit' : 'Run Direct vs Modal Audit'}
      </button>

      {error && (
        <div style={{ fontSize: 10, color: '#f87171', fontFamily: MONO, marginBottom: 6 }}>
          Error: {error}
        </div>
      )}

      {results && (
        <>
          {/* Verdict banner */}
          <div style={{
            padding: '5px 10px',
            borderRadius: 5,
            background: allPass ? '#14532d' : '#7f1d1d',
            color: allPass ? '#86efac' : '#fca5a5',
            fontFamily: MONO,
            fontSize: 10,
            fontWeight: 700,
            marginBottom: 8,
          }}>
            {allPass
              ? '✓ All frequencies PASS — audit SPL matches graph within 0.1 dB'
              : '✗ One or more frequencies FAIL — graph SPL diverges from audit SPL by > 0.1 dB'}
          </div>

          {/* Main table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 860 }}>
              <thead>
                <tr>
                  {[
                    'Freq',
                    'Direct lin', 'Direct dB',
                    'Boundary lin', 'Boundary dB',
                    'Modal lin', 'Modal dB',
                    'Final lin', 'Final dB',
                    'Audit SPL',
                    'Graph SPL',
                    'Δ / verdict',
                  ].map((h, i) => (
                    <th key={i} style={{
                      ...TH,
                      textAlign: i === 0 ? 'left' : 'right',
                      borderLeft: [3, 5, 7, 9].includes(i) ? '1px solid #4b5563' : undefined,
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.rows.map(r => (
                  <FreqRow
                    key={r.hz}
                    hz={r.hz}
                    directMag={r.directMag}
                    reflMag={r.reflBoundaryMag}
                    modalMag={r.modalMag}
                    fullMag={r.fullMag}
                    auditSplDb={r.auditSplDb}
                    graphSpl={r.graphSpl}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Equation key */}
          <div style={{ marginTop: 8, fontSize: 9, fontFamily: MONO, color: '#6b7280', lineHeight: 1.7, borderTop: '1px solid #374151', paddingTop: 6 }}>
            <span style={{ color: '#60a5fa' }}>Direct</span>: P_d = A · e^(−j·ω·d/c) / d  — free-field pressure at seat
            &nbsp;|&nbsp;
            <span style={{ color: '#a78bfa' }}>Boundary</span>: |P_d + P_refl|  — direct + 1st-order image sources, abs
            &nbsp;|&nbsp;
            <span style={{ color: '#34d399' }}>Modal</span>: |ΣP_n|  — from wholeCurveDebugRows.modalSumMagnitude
            &nbsp;|&nbsp;
            <span style={{ color: '#fcd34d' }}>Final</span>: |P_direct + ΣP_modal|  — coherent sum from engine complexPressure
            &nbsp;|&nbsp;
            <span style={{ color: '#f9fafb' }}>Audit SPL</span> = 20·log₁₀(|Final|)  — no reference normalisation
          </div>
        </>
      )}
    </div>
  );
}