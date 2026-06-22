/**
 * TransferMagnitudeSanityAudit
 *
 * Diagnostic only. Does not affect live graph or production engine.
 *
 * Goal: determine whether transfer/coupling excess is a diagnostic
 * calculation bug or a genuine resonator gain explosion.
 *
 * For each target frequency (70, 80, 85, 90 Hz), top 10 modes:
 *   - Raw numerator & denominator from resonator equation
 *   - Engine-reported transfer magnitude
 *   - Independently computed expected transfer magnitude
 *   - PASS/FAIL within 1%
 *   - Transfer/Coupling ratio (raw)
 */
import React, { useState, useCallback } from 'react';
import { runAuditSim, findBin, interpolateSpl, TARGET_FREQUENCIES } from './dominantModeAuditLogic';

const MONO = 'monospace';

// ─── resonator re-computation ─────────────────────────────────────────────────
// H(f) = 1 / (realDen + j·imagDen)
// realDen = 1 - (f/f0)²
// imagDen = f / (f0 · Q)
// |H| = 1 / sqrt(realDen² + imagDen²)
function computeExpectedTransfer(frequencyHz, modeHz, q) {
  if (!Number.isFinite(modeHz) || modeHz <= 0 || !Number.isFinite(q) || q <= 0) return null;
  const ratio   = frequencyHz / modeHz;
  const realDen = 1 - ratio * ratio;
  const imagDen = ratio / q;          // = (f/f0) / Q  ≡  f / (f0·Q)
  const denomSq = realDen * realDen + imagDen * imagDen;
  return {
    numeratorMag: 1,                  // numerator of H is always 1 (scalar)
    realDen,
    imagDen,
    denomSq,
    denomMag: Math.sqrt(denomSq),
    transferMag: denomSq > 0 ? 1 / Math.sqrt(denomSq) : null,
  };
}

// ─── style helpers ────────────────────────────────────────────────────────────
const TH = {
  textAlign: 'right', padding: '3px 5px', fontSize: 9, fontWeight: 700,
  background: '#f0fdf4', borderBottom: '2px solid #4ade80', color: '#166534',
  whiteSpace: 'nowrap',
};
const TD = { textAlign: 'right', padding: '2px 5px', fontSize: 9, fontFamily: MONO };

function f6(v) { return Number.isFinite(v) ? v.toFixed(6) : '—'; }
function f4(v) { return Number.isFinite(v) ? v.toFixed(4) : '—'; }
function f2(v) { return Number.isFinite(v) ? v.toFixed(2) : '—'; }
function f1(v) { return Number.isFinite(v) ? v.toFixed(1) : '—'; }

function famClr(f) {
  return f === 'axial' ? '#166534' : f === 'tangential' ? '#0369a1' : f === 'oblique' ? '#7e22ce' : '#374151';
}

function PassFail({ engineMag, expectedMag }) {
  if (!Number.isFinite(engineMag) || !Number.isFinite(expectedMag) || expectedMag === 0) {
    return <span style={{ color: '#6b7280', fontWeight: 700 }}>N/A</span>;
  }
  const diffPct = Math.abs((engineMag - expectedMag) / expectedMag) * 100;
  const pass = diffPct <= 1.0;
  return (
    <span style={{
      color: pass ? '#166534' : '#dc2626',
      fontWeight: 700,
      fontSize: 9,
      padding: '1px 4px',
      borderRadius: 3,
      background: pass ? '#dcfce7' : '#fee2e2',
    }}>
      {pass ? 'PASS' : 'FAIL'} ({diffPct.toFixed(2)}%)
    </span>
  );
}

// ─── per-frequency table ──────────────────────────────────────────────────────

function FreqTable({ targetHz, rows }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontWeight: 700, color: '#166534', fontSize: 12, fontFamily: MONO, marginBottom: 4 }}>
        {targetHz} Hz
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 920 }}>
          <thead>
            <tr>
              {[
                '#', 'Indices', 'Fam', 'Mode Hz', 'Q',
                'Src Ψ', 'Rcv Ψ', 'Coupling',
                'Numerator', 'Real Den', 'Imag Den', 'Denom²',
                'Engine |H|', 'Expected |H|',
                'PASS?',
                'T/C ratio',
                'Final contrib',
              ].map(h => (
                <th key={h} style={{ ...TH, textAlign: h === 'Fam' ? 'left' : 'right' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((m, i) => {
              const expected = computeExpectedTransfer(targetHz, m.modeHz, m.q);
              const coupling = Math.abs(m.combinedCoupling ?? 0);
              const tcRatio  = coupling > 1e-12 ? m.transferMag / coupling : null;
              return (
                <tr key={i} style={{ borderBottom: '1px solid #bbf7d0', background: i === 0 ? '#f0fdf4' : undefined }}>
                  <td style={{ ...TD, fontWeight: i < 3 ? 700 : 400, color: '#166534' }}>{m.rank}</td>
                  <td style={{ ...TD, textAlign: 'center', color: '#0c4a6e' }}>({m.nx},{m.ny},{m.nz})</td>
                  <td style={{ ...TD, textAlign: 'left', color: famClr(m.family), fontWeight: 600 }}>
                    {m.family ? m.family.charAt(0).toUpperCase() : '?'}
                  </td>
                  <td style={TD}>{f1(m.modeHz)}</td>
                  <td style={TD}>{f2(m.q)}</td>
                  <td style={TD}>{f6(m.sourceCoupling)}</td>
                  <td style={TD}>{f6(m.receiverCoupling)}</td>
                  <td style={{ ...TD, color: '#0369a1' }}>{f6(m.combinedCoupling)}</td>
                  {/* Resonator numerator — always 1.0 for standard H(f) */}
                  <td style={{ ...TD, color: '#6b7280' }}>1.000000</td>
                  <td style={{ ...TD, color: '#b45309' }}>{expected ? f6(expected.realDen) : '—'}</td>
                  <td style={{ ...TD, color: '#b45309' }}>{expected ? f6(expected.imagDen) : '—'}</td>
                  <td style={{ ...TD, color: '#92400e' }}>{expected ? f6(expected.denomSq) : '—'}</td>
                  {/* Engine-reported transfer magnitude */}
                  <td style={{ ...TD, fontWeight: 700 }}>{f6(m.transferMag)}</td>
                  {/* Expected from resonator equation */}
                  <td style={{ ...TD, color: '#4b5563' }}>{expected?.transferMag != null ? f6(expected.transferMag) : '—'}</td>
                  <td style={{ ...TD, textAlign: 'center' }}>
                    <PassFail engineMag={m.transferMag} expectedMag={expected?.transferMag ?? null} />
                  </td>
                  {/* Transfer/Coupling ratio */}
                  <td style={{
                    ...TD, fontWeight: 700,
                    color: tcRatio != null && tcRatio > 10 ? '#dc2626' : tcRatio != null && tcRatio > 2 ? '#b45309' : '#166534',
                  }}>
                    {tcRatio != null ? tcRatio.toFixed(2) : '—'}×
                  </td>
                  <td style={{ ...TD, fontWeight: 700 }}>{f6(m.actualContrib)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── verdict section ──────────────────────────────────────────────────────────

function Verdict({ allRows }) {
  if (!allRows || allRows.length === 0) return null;

  const passCount  = allRows.filter(r => {
    const exp = computeExpectedTransfer(r.targetHz, r.modeHz, r.q);
    if (!exp?.transferMag || !r.transferMag) return false;
    return Math.abs((r.transferMag - exp.transferMag) / exp.transferMag) * 100 <= 1.0;
  }).length;
  const failCount  = allRows.length - passCount;
  const allPass    = failCount === 0;

  const maxTcRatio = Math.max(...allRows.map(r => {
    const c = Math.abs(r.combinedCoupling ?? 0);
    return c > 1e-12 ? r.transferMag / c : 0;
  }));

  const avgTcRatio = allRows.reduce((s, r) => {
    const c = Math.abs(r.combinedCoupling ?? 0);
    return s + (c > 1e-12 ? r.transferMag / c : 0);
  }, 0) / allRows.length;

  const isResonatorExplosion = maxTcRatio > 100;
  const isDiagBug            = !allPass && maxTcRatio < 10;

  return (
    <div style={{ border: '2px solid #166534', borderRadius: 8, padding: '10px 14px', background: '#f0fdf4', marginTop: 8 }}>
      <div style={{ fontWeight: 700, color: '#166534', fontSize: 11, fontFamily: MONO, marginBottom: 6 }}>
        Sanity Verdict
      </div>
      <div style={{ display: 'flex', gap: '10px 24px', flexWrap: 'wrap', fontSize: 10, fontFamily: MONO, marginBottom: 6 }}>
        <span>Modes checked: <b>{allRows.length}</b></span>
        <span style={{ color: '#166534', fontWeight: 700 }}>PASS: {passCount}</span>
        <span style={{ color: failCount > 0 ? '#dc2626' : '#166534', fontWeight: 700 }}>FAIL: {failCount}</span>
        <span>Max T/C ratio: <b style={{ color: maxTcRatio > 100 ? '#dc2626' : maxTcRatio > 10 ? '#b45309' : '#166534' }}>{maxTcRatio.toFixed(1)}×</b></span>
        <span>Avg T/C ratio: <b>{avgTcRatio.toFixed(2)}×</b></span>
      </div>
      <div style={{ fontSize: 10, fontFamily: MONO, lineHeight: 1.6, borderTop: '1px solid #bbf7d0', paddingTop: 6 }}>
        {allPass && !isResonatorExplosion && (
          <span style={{ color: '#166534', fontWeight: 700 }}>
            ✓ All engine transfer magnitudes match the resonator equation within 1%.
            Transfer excess in the contribution audit is a diagnostic calculation artefact —
            the formula "actual = coupling × transfer" does not hold when coupling &lt; transfer
            due to independent amplitude paths in the engine.
          </span>
        )}
        {allPass && isResonatorExplosion && (
          <span style={{ color: '#dc2626', fontWeight: 700 }}>
            ⚠ Engine transfer magnitudes match resonator equation (PASS), but T/C ratios reach {maxTcRatio.toFixed(0)}×.
            This is genuine resonator gain — modes are at or near resonance at these frequencies.
            The transfer function output is correct; the "excess" is real physics, not a bug.
          </span>
        )}
        {!allPass && isDiagBug && (
          <span style={{ color: '#dc2626', fontWeight: 700 }}>
            ✗ {failCount} mode(s) FAIL the resonator sanity check.
            Engine-reported transfer magnitudes differ from the expected resonator formula by &gt;1%.
            This indicates a diagnostic calculation discrepancy — check which frequency bin
            the active contributor series captured vs. the target Hz.
          </span>
        )}
        {!allPass && !isDiagBug && (
          <span style={{ color: '#b45309', fontWeight: 700 }}>
            ⚠ Mixed results: {passCount} PASS, {failCount} FAIL.
            Investigate failing modes individually — may indicate bin-matching tolerance or
            frequency axis resolution affecting the contributor lookup.
          </span>
        )}
      </div>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function TransferMagnitudeSanityAudit({ roomDims, seat, sub, surfaceAbsorption, activeSettings }) {
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
        const bin = findBin(activeModalContributorDebugSeries, targetHz);
        if (!bin || !Array.isArray(bin.contributors) || bin.contributors.length === 0) {
          return { targetHz, rows: [], simSpl: null };
        }
        const simSpl = interpolateSpl(freqsHz, splDbRaw, targetHz);
        const top10 = [...bin.contributors]
          .sort((a, b) => (b.activeMagnitude ?? 0) - (a.activeMagnitude ?? 0))
          .slice(0, 10)
          .map((c, i) => ({
            rank:             i + 1,
            targetHz,
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
            actualContrib:    c.activeMagnitude ?? 0,
          }));
        return { targetHz, rows: top10, simSpl };
      });

      const allRows = freqData.flatMap(f => f.rows);
      setResults({ freqData, allRows });
    } catch (e) {
      setError(e?.message ?? String(e));
    } finally {
      setRunning(false);
    }
  }, [roomDims, seat, sub, surfaceAbsorption, activeSettings, canRun]);

  return (
    <div style={{ marginTop: 12, border: '1px solid #4ade80', borderRadius: 8, background: '#f0fdf4', padding: '10px 12px' }}>
      <div style={{ fontWeight: 700, color: '#166534', fontSize: 11, fontFamily: MONO, marginBottom: 4 }}>
        Transfer Magnitude Sanity Audit
        <span style={{ fontWeight: 400, color: '#86efac', marginLeft: 8, fontSize: 10 }}>
          Q×0.8 · Tang×0.8 · diagnostic only · does not affect live graph
        </span>
      </div>
      <div style={{ fontSize: 9, color: '#4b5563', fontFamily: MONO, marginBottom: 6 }}>
        Recomputes |H(f)| = 1 / √(realDen² + imagDen²) from raw resonator terms and compares to engine value.
        PASS = within 1%. Identifies whether transfer excess is a bug or genuine resonator gain.
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
          height: 28, padding: '0 14px', borderRadius: 6,
          border: '1px solid #166534',
          background: (running || !canRun) ? '#e5e7eb' : '#166534',
          color:      (running || !canRun) ? '#6b7280' : '#fff',
          fontSize: 11, fontFamily: MONO, fontWeight: 600,
          cursor: (running || !canRun) ? 'not-allowed' : 'pointer',
          marginBottom: 10,
        }}
      >
        {running ? 'Running…' : results ? 'Re-run sanity audit' : 'Run sanity audit'}
      </button>

      {error && (
        <div style={{ fontSize: 10, color: '#dc2626', fontFamily: MONO, marginBottom: 6 }}>
          Error: {error}
        </div>
      )}

      {results && (
        <>
          {results.freqData.map(({ targetHz, rows, simSpl }) =>
            rows.length > 0
              ? <FreqTable key={targetHz} targetHz={targetHz} rows={rows} simSpl={simSpl} />
              : <div key={targetHz} style={{ fontSize: 9, color: '#9ca3af', fontFamily: MONO, marginBottom: 6 }}>
                  {targetHz} Hz — no engine data
                </div>
          )}
          <Verdict allRows={results.allRows} />
        </>
      )}
    </div>
  );
}