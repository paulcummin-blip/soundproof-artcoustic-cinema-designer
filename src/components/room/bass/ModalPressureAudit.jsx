/**
 * ModalPressureAudit — Diagnostic only.
 *
 * Traces exactly where scaling diverges across:
 *   Coupling → Transfer → Pressure → SPL
 *
 * For the top-10 contributing modes at 70 / 80 / 85 / 90 Hz:
 *   - Coupling (source × receiver, raw)
 *   - Transfer magnitude |H|
 *   - Complex modal pressure before summation
 *   - Magnitude of that modal pressure
 *   - Running complex pressure sum after adding this mode
 *   - Final summed pressure magnitude
 *   - Final SPL from that pressure
 *
 * Every stage shown as: linear value  |  dB equivalent
 *
 * Equations used are printed next to each column header.
 * No normalisation. No RP22 processing. Raw engine values only.
 */
import React, { useState, useCallback } from 'react';
import { runAuditSim, findBin, interpolateSpl, TARGET_FREQUENCIES } from './dominantModeAuditLogic';

// ─── constants ────────────────────────────────────────────────────────────────
const MONO = 'monospace';
const REF  = 1e-5; // Pa — standard acoustic reference for dB re 20 µPa (not used here; we use 20 log10(mag))

// ─── helpers ─────────────────────────────────────────────────────────────────
function toDb(v) {
  if (!Number.isFinite(v) || v <= 0) return null;
  return 20 * Math.log10(v);
}
function fmtLin(v, digits = 6) {
  if (!Number.isFinite(v)) return '—';
  if (Math.abs(v) >= 1000) return v.toExponential(3);
  return v.toFixed(digits);
}
function fmtDb(v) {
  if (!Number.isFinite(v)) return '—';
  return v.toFixed(2) + ' dB';
}
function fmtLinDb(lin, digits = 6) {
  const db = toDb(Math.abs(lin));
  return `${fmtLin(lin, digits)}  (${db != null ? db.toFixed(2) + ' dB' : '—'})`;
}

// ─── styles ───────────────────────────────────────────────────────────────────
const STAGE_COLORS = {
  coupling:  { bg: '#eff6ff', border: '#3b82f6', label: '#1d4ed8' },
  transfer:  { bg: '#fefce8', border: '#eab308', label: '#854d0e' },
  pressure:  { bg: '#fdf4ff', border: '#a855f7', label: '#6b21a8' },
  running:   { bg: '#f0fdf4', border: '#22c55e', label: '#166534' },
  spl:       { bg: '#fff7ed', border: '#f97316', label: '#9a3412' },
};

function stageBox(key, children) {
  const c = STAGE_COLORS[key] || STAGE_COLORS.spl;
  return (
    <div style={{
      border: `1px solid ${c.border}`,
      borderRadius: 5,
      padding: '4px 7px',
      background: c.bg,
      marginBottom: 2,
    }}>
      {children}
    </div>
  );
}

function EquationLine({ children }) {
  return (
    <div style={{
      fontFamily: MONO,
      fontSize: 9,
      color: '#4b5563',
      background: '#f9fafb',
      border: '1px dashed #d1d5db',
      borderRadius: 3,
      padding: '2px 6px',
      marginBottom: 4,
      letterSpacing: 0.2,
    }}>
      {children}
    </div>
  );
}

// ─── per-mode breakdown row ────────────────────────────────────────────────────

function ModeRow({ mode, rank, runRe, runIm, runMag, finalSplDb }) {
  const {
    nx, ny, nz,
    modeHz, family, q,
    sourceCoupling, receiverCoupling, combinedCoupling,
    transferMag,
    pressureRe, pressureIm, pressureMag,
    pressureDb,
  } = mode;

  const runDb  = toDb(runMag);

  const famColor = family === 'axial'
    ? '#1d4ed8' : family === 'tangential'
    ? '#92400e' : '#6b21a8';

  return (
    <div style={{
      border: '1px solid #e5e7eb',
      borderRadius: 6,
      marginBottom: 6,
      overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{
        background: '#1f2937',
        color: '#f9fafb',
        padding: '3px 8px',
        fontFamily: MONO,
        fontSize: 10,
        display: 'flex',
        gap: 16,
        alignItems: 'center',
      }}>
        <span style={{ fontWeight: 700, color: rank <= 3 ? '#fbbf24' : '#9ca3af' }}>#{rank}</span>
        <span style={{ color: '#e5e7eb' }}>({nx},{ny},{nz})</span>
        <span style={{ color: famColor, fontWeight: 600 }}>
          {family ? family.charAt(0).toUpperCase() + family.slice(1) : '?'}
        </span>
        <span>f₀ = {Number.isFinite(modeHz) ? modeHz.toFixed(1) : '?'} Hz</span>
        <span>Q = {Number.isFinite(q) ? q.toFixed(2) : '?'}</span>
      </div>

      <div style={{ padding: '5px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>

        {/* Stage 1 — Coupling */}
        {stageBox('coupling',
          <>
            <EquationLine>
              Ψ_src = cos(nₓπx/W)·cos(nᵧπy/L)·cos(n_z πz/H) &nbsp;|&nbsp;
              Ψ_rcv = same at seat &nbsp;|&nbsp;
              coupling = Ψ_src × Ψ_rcv
            </EquationLine>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td style={{ fontFamily: MONO, fontSize: 9, color: '#1d4ed8', width: '30%' }}>Ψ_src (source coupling)</td>
                  <td style={{ fontFamily: MONO, fontSize: 9 }}>{fmtLin(sourceCoupling)}</td>
                  <td style={{ fontFamily: MONO, fontSize: 9, color: '#6b7280' }}>{fmtDb(toDb(Math.abs(sourceCoupling)))}</td>
                </tr>
                <tr>
                  <td style={{ fontFamily: MONO, fontSize: 9, color: '#1d4ed8' }}>Ψ_rcv (receiver coupling)</td>
                  <td style={{ fontFamily: MONO, fontSize: 9 }}>{fmtLin(receiverCoupling)}</td>
                  <td style={{ fontFamily: MONO, fontSize: 9, color: '#6b7280' }}>{fmtDb(toDb(Math.abs(receiverCoupling)))}</td>
                </tr>
                <tr style={{ borderTop: '1px solid #bfdbfe' }}>
                  <td style={{ fontFamily: MONO, fontSize: 9, color: '#1d4ed8', fontWeight: 700 }}>Combined coupling</td>
                  <td style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700 }}>{fmtLin(combinedCoupling)}</td>
                  <td style={{ fontFamily: MONO, fontSize: 9, color: '#6b7280' }}>{fmtDb(toDb(Math.abs(combinedCoupling)))}</td>
                </tr>
              </tbody>
            </table>
          </>
        )}

        {/* Stage 2 — Transfer magnitude */}
        {stageBox('transfer',
          <>
            <EquationLine>
              β = f/f₀ &nbsp;|&nbsp;
              realDen = 1 − β² &nbsp;|&nbsp;
              imagDen = β/Q &nbsp;|&nbsp;
              |H| = 1 / √(realDen² + imagDen²)
            </EquationLine>
            <div style={{ fontFamily: MONO, fontSize: 9, display: 'flex', gap: 16 }}>
              <span style={{ color: '#854d0e', fontWeight: 700 }}>|H(f)| = {fmtLin(transferMag)}</span>
              <span style={{ color: '#6b7280' }}>{fmtDb(toDb(transferMag))}</span>
            </div>
          </>
        )}

        {/* Stage 3 — Complex modal pressure before summation */}
        {stageBox('pressure',
          <>
            <EquationLine>
              P_n = A · coupling · orderWeight · H(f) &nbsp;|&nbsp;
              A = modalSourceAmplitude (= 10^(curveDb/20)) &nbsp;|&nbsp;
              orderWeight = (order≥2 ? 0.50 : 1.0)
            </EquationLine>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td style={{ fontFamily: MONO, fontSize: 9, color: '#6b21a8', width: '30%' }}>P_n  Re</td>
                  <td style={{ fontFamily: MONO, fontSize: 9 }}>{fmtLin(pressureRe)}</td>
                  <td style={{ fontFamily: MONO, fontSize: 9, color: '#6b7280' }}>{fmtDb(toDb(Math.abs(pressureRe)))}</td>
                </tr>
                <tr>
                  <td style={{ fontFamily: MONO, fontSize: 9, color: '#6b21a8' }}>P_n  Im</td>
                  <td style={{ fontFamily: MONO, fontSize: 9 }}>{fmtLin(pressureIm)}</td>
                  <td style={{ fontFamily: MONO, fontSize: 9, color: '#6b7280' }}>{fmtDb(toDb(Math.abs(pressureIm)))}</td>
                </tr>
                <tr style={{ borderTop: '1px solid #e9d5ff' }}>
                  <td style={{ fontFamily: MONO, fontSize: 9, color: '#6b21a8', fontWeight: 700 }}>|P_n| = √(Re²+Im²)</td>
                  <td style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700 }}>{fmtLin(pressureMag)}</td>
                  <td style={{ fontFamily: MONO, fontSize: 9, color: '#6b7280', fontWeight: 700 }}>{fmtDb(pressureDb)}</td>
                </tr>
              </tbody>
            </table>
          </>
        )}

        {/* Stage 4 — Running complex pressure sum */}
        {stageBox('running',
          <>
            <EquationLine>
              ΣP_running(Re) += P_n Re &nbsp;|&nbsp;
              ΣP_running(Im) += P_n Im &nbsp;|&nbsp;
              |ΣP_running| = √(ΣRe² + ΣIm²)
            </EquationLine>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td style={{ fontFamily: MONO, fontSize: 9, color: '#166534', width: '30%' }}>ΣP Re (running)</td>
                  <td style={{ fontFamily: MONO, fontSize: 9 }}>{fmtLin(runRe)}</td>
                  <td style={{ fontFamily: MONO, fontSize: 9, color: '#6b7280' }}>{fmtDb(toDb(Math.abs(runRe)))}</td>
                </tr>
                <tr>
                  <td style={{ fontFamily: MONO, fontSize: 9, color: '#166534' }}>ΣP Im (running)</td>
                  <td style={{ fontFamily: MONO, fontSize: 9 }}>{fmtLin(runIm)}</td>
                  <td style={{ fontFamily: MONO, fontSize: 9, color: '#6b7280' }}>{fmtDb(toDb(Math.abs(runIm)))}</td>
                </tr>
                <tr style={{ borderTop: '1px solid #bbf7d0' }}>
                  <td style={{ fontFamily: MONO, fontSize: 9, color: '#166534', fontWeight: 700 }}>|ΣP_running|</td>
                  <td style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700 }}>{fmtLin(runMag)}</td>
                  <td style={{ fontFamily: MONO, fontSize: 9, color: '#6b7280', fontWeight: 700 }}>{fmtDb(runDb)}</td>
                </tr>
              </tbody>
            </table>
          </>
        )}

        {/* Stage 5 — Final SPL contribution (after all modes summed) */}
        {rank === 10 && stageBox('spl',
          <>
            <EquationLine>
              SPL = 20 · log₁₀( |ΣP_final| )   [no reference normalisation — raw engine amplitude units]
            </EquationLine>
            <div style={{ fontFamily: MONO, fontSize: 9, display: 'flex', gap: 16 }}>
              <span style={{ color: '#9a3412' }}>|ΣP_final| = {fmtLin(runMag)}</span>
              <span style={{ color: '#9a3412', fontWeight: 700 }}>SPL = {Number.isFinite(finalSplDb) ? finalSplDb.toFixed(2) + ' dB' : '—'}</span>
            </div>
          </>
        )}

      </div>
    </div>
  );
}

// ─── per-frequency panel ──────────────────────────────────────────────────────

function FreqPanel({ targetHz, modes, finalSplDb, simSpl }) {
  if (!modes || modes.length === 0) {
    return (
      <div style={{ fontFamily: MONO, fontSize: 10, color: '#9ca3af', marginBottom: 8 }}>
        {targetHz} Hz — no engine data
      </div>
    );
  }

  // Build running sums incrementally in magnitude-rank order
  let runRe = 0;
  let runIm = 0;
  const rows = modes.map((m, i) => {
    runRe += m.pressureRe;
    runIm += m.pressureIm;
    const runMag = Math.sqrt(runRe * runRe + runIm * runIm);
    return { ...m, rank: i + 1, runRe, runIm, runMag };
  });

  const finalRunMag = rows[rows.length - 1]?.runMag ?? 0;
  const computedSpl = toDb(finalRunMag);

  return (
    <details style={{ marginBottom: 10 }} open={false}>
      <summary style={{
        cursor: 'pointer',
        fontFamily: MONO,
        fontWeight: 700,
        fontSize: 11,
        color: '#6b21a8',
        padding: '4px 6px',
        background: '#fdf4ff',
        borderRadius: 5,
        border: '1px solid #d8b4fe',
        userSelect: 'none',
        marginBottom: 4,
        display: 'flex',
        gap: 16,
        alignItems: 'center',
      }}>
        <span>{targetHz} Hz</span>
        <span style={{ fontWeight: 400, color: '#9ca3af', fontSize: 9 }}>
          Top-{modes.length} modes · Final |ΣP| = {fmtLin(finalRunMag, 4)} · SPL = {computedSpl != null ? computedSpl.toFixed(2) : '—'} dB
          {simSpl != null ? ` · sim = ${simSpl.toFixed(2)} dB` : ''}
        </span>
      </summary>
      <div style={{ paddingTop: 6 }}>
        {rows.map((m, i) => (
          <ModeRow
            key={i}
            mode={m}
            rank={m.rank}
            runRe={m.runRe}
            runIm={m.runIm}
            runMag={m.runMag}
            finalSplDb={finalSplDb}
          />
        ))}
      </div>
    </details>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function ModalPressureAudit({ roomDims, seat, sub, surfaceAbsorption, activeSettings }) {
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
      const result = runAuditSim(roomDims, seat, sub, surfaceAbsorption, activeSettings);
      const { activeModalContributorDebugSeries, freqsHz, splDbRaw } = result;

      const freqData = TARGET_FREQUENCIES.map(targetHz => {
        const bin    = findBin(activeModalContributorDebugSeries, targetHz);
        const simSpl = interpolateSpl(freqsHz, splDbRaw, targetHz);

        if (!bin || !Array.isArray(bin.contributors) || bin.contributors.length === 0) {
          return { targetHz, modes: [], simSpl, finalSplDb: null };
        }

        // Sort top 10 by activeMagnitude — this is the engine's own ranking
        const top10 = [...bin.contributors]
          .sort((a, b) => (b.activeMagnitude ?? 0) - (a.activeMagnitude ?? 0))
          .slice(0, 10);

        const modes = top10.map(c => ({
          nx:               c.nx,
          ny:               c.ny,
          nz:               c.nz,
          family:           c.modeType,
          modeHz:           c.modeFrequencyHz,
          q:                c.qValue,
          sourceCoupling:   c.sourceCoupling ?? 0,
          receiverCoupling: c.receiverCoupling ?? 0,
          combinedCoupling: c.combinedCoupling ?? 0,
          transferMag:      c.activeTransferMagnitudeAtNull ?? 0,
          // activeReal/activeImag are the stored post-tuning, post-storage-factor modal pressure
          // contributions as they enter the accumulator — raw engine values.
          pressureRe:       c.activeReal ?? 0,
          pressureIm:       c.activeImag ?? 0,
          pressureMag:      c.activeMagnitude ?? 0,
          pressureDb:       toDb(c.activeMagnitude ?? 0),
        }));

        // Final SPL: from the full modal sum at this bin (all modes, not just top 10)
        const totalRe  = bin.modalSumRe ?? 0;
        const totalIm  = bin.modalSumIm ?? 0;
        const totalMag = Math.sqrt(totalRe * totalRe + totalIm * totalIm);
        const finalSplDb = toDb(totalMag);

        return { targetHz, modes, simSpl, finalSplDb };
      });

      setResults({ freqData });
    } catch (e) {
      setError(e?.message ?? String(e));
    } finally {
      setRunning(false);
    }
  }, [roomDims, seat, sub, surfaceAbsorption, activeSettings, canRun]);

  return (
    <div style={{
      marginTop: 12,
      border: '1px solid #d8b4fe',
      borderRadius: 8,
      background: '#fdf4ff',
      padding: '10px 12px',
    }}>
      <div style={{ fontWeight: 700, color: '#6b21a8', fontSize: 11, fontFamily: MONO, marginBottom: 3 }}>
        Modal Pressure Audit
        <span style={{ fontWeight: 400, color: '#a78bfa', marginLeft: 8, fontSize: 10 }}>
          diagnostic only · does not affect live graph
        </span>
      </div>
      <div style={{ fontSize: 9, color: '#4b5563', fontFamily: MONO, marginBottom: 6, lineHeight: 1.5 }}>
        Traces Coupling → |H| → Complex pressure → Running sum → SPL at each mode.
        All values raw engine output. No normalisation. Equations shown at every stage.
        Each frequency collapsed — click to expand.
      </div>

      {!canRun && (
        <div style={{ fontSize: 10, color: '#b45309', fontFamily: MONO, marginBottom: 6 }}>
          ⚠ Requires room dimensions, seat position, and sub position.
        </div>
      )}

      <button
        onClick={run}
        disabled={running || !canRun}
        style={{
          height: 28,
          padding: '0 14px',
          borderRadius: 6,
          border: '1px solid #7c3aed',
          background: (running || !canRun) ? '#e5e7eb' : '#7c3aed',
          color:      (running || !canRun) ? '#6b7280' : '#fff',
          fontSize: 11,
          fontFamily: MONO,
          fontWeight: 600,
          cursor: (running || !canRun) ? 'not-allowed' : 'pointer',
          marginBottom: 10,
        }}
      >
        {running ? 'Running…' : results ? 'Re-run pressure audit' : 'Run pressure audit'}
      </button>

      {error && (
        <div style={{ fontSize: 10, color: '#dc2626', fontFamily: MONO, marginBottom: 6 }}>
          Error: {error}
        </div>
      )}

      {results && results.freqData.map(({ targetHz, modes, simSpl, finalSplDb }) => (
        <FreqPanel
          key={targetHz}
          targetHz={targetHz}
          modes={modes}
          simSpl={simSpl}
          finalSplDb={finalSplDb}
        />
      ))}
    </div>
  );
}