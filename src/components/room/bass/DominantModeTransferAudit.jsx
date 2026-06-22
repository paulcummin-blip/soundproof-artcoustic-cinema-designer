/**
 * DominantModeTransferAudit
 *
 * Diagnostic only. Does not affect live graph or production engine.
 * Settings: Q×0.8, Tang×0.8, Axial=1.0, Oblique=1.0
 * Targets: 70, 80, 85, 90 Hz
 *
 * Focus: transfer normalisation — expected vs actual contribution per mode.
 */
import React, { useState, useCallback } from 'react';
import {
  TARGET_FREQUENCIES,
  runAuditSim,
  findBin,
  interpolateSpl,
  analyseTransfer,
  transferSummary,
} from './dominantModeAuditLogic';

// ─── style tokens ─────────────────────────────────────────────────────────────
const MONO = 'monospace';
const TH_BASE = {
  textAlign: 'right', padding: '3px 5px', fontSize: 9, fontWeight: 700,
  background: '#fef3c7', borderBottom: '2px solid #f59e0b', color: '#92400e',
  whiteSpace: 'nowrap',
};
const TD_BASE = { textAlign: 'right', padding: '2px 5px', fontSize: 9, fontFamily: MONO };

function f4(v)  { return Number.isFinite(v) ? v.toFixed(4) : '—'; }
function f2(v)  { return Number.isFinite(v) ? v.toFixed(2) : '—'; }
function f1(v)  { return Number.isFinite(v) ? v.toFixed(1) : '—'; }
function pct(v) { return Number.isFinite(v) ? (v > 0 ? '+' : '') + v.toFixed(1) + '%' : '—'; }

function famClr(f) {
  return f === 'axial' ? '#166534' : f === 'tangential' ? '#0369a1' : f === 'oblique' ? '#7e22ce' : '#374151';
}
function famLabel(f) { return f ? f.charAt(0).toUpperCase() + f.slice(1) : '—'; }
function excessClr(v) {
  if (!Number.isFinite(v)) return '#6b7280';
  if (v > 50)  return '#dc2626';
  if (v > 10)  return '#b45309';
  if (v < -10) return '#0369a1';
  return '#166534';
}

// ─── per-frequency transfer table ────────────────────────────────────────────

function TransferTable({ rows }) {
  return (
    <div style={{ overflowX: 'auto', marginBottom: 8 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 780 }}>
        <thead>
          <tr>
            {['#', 'Indices', 'Family', 'Mode Hz', 'Q',
              'Src Ψ', 'Rcv Ψ', 'Coupling', 'Transfer', 'Contrib (actual)',
              'Expected (T=1)', 'Excess %'].map(h => (
              <th key={h} style={{ ...TH_BASE, textAlign: h === 'Family' ? 'left' : 'right' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(m => (
            <tr key={m.rank} style={{ borderBottom: '1px solid #fde68a', background: m.rank === 1 ? '#fef9ee' : undefined }}>
              <td style={{ ...TD_BASE, fontWeight: m.rank <= 3 ? 700 : 400, color: '#92400e' }}>{m.rank}</td>
              <td style={{ ...TD_BASE, textAlign: 'center', color: '#0c4a6e' }}>({m.nx},{m.ny},{m.nz})</td>
              <td style={{ ...TD_BASE, textAlign: 'left', color: famClr(m.family) }}>{famLabel(m.family)}</td>
              <td style={TD_BASE}>{f1(m.modeHz)}</td>
              <td style={TD_BASE}>{f2(m.q)}</td>
              <td style={TD_BASE}>{f4(m.sourceCoupling)}</td>
              <td style={TD_BASE}>{f4(m.receiverCoupling)}</td>
              <td style={{ ...TD_BASE, color: '#0369a1' }}>{f4(m.combinedCoupling)}</td>
              <td style={{ ...TD_BASE, color: '#b45309' }}>{f4(m.transferMag)}</td>
              <td style={{ ...TD_BASE, fontWeight: m.rank <= 3 ? 700 : 400 }}>{f4(m.actualContrib)}</td>
              <td style={{ ...TD_BASE, color: '#6b7280' }}>{f4(m.expectedContrib)}</td>
              <td style={{ ...TD_BASE, fontWeight: 700, color: excessClr(m.excessPct) }}>{pct(m.excessPct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── summary band ────────────────────────────────────────────────────────────

function SummaryBand({ top10, top20, top50, allRows }) {
  const s10  = transferSummary(top10);
  const s20  = transferSummary(top20);
  const s50  = transferSummary(top50);

  const inflatedMsg = (s) => {
    if (s.avgExcessPct == null) return '—';
    return `avg ${pct(s.avgExcessPct)} (${s.inflatedCount}↑ ${s.deflatedCount}↓ of ${s.count})`;
  };

  const isInflated  = Number.isFinite(s10.avgExcessPct) && s10.avgExcessPct > 10;
  const isSuppressed = Number.isFinite(s10.avgExcessPct) && s10.avgExcessPct < -10;

  return (
    <div style={{ background: '#fffbeb', border: '1px solid #f59e0b', borderRadius: 6, padding: '6px 10px', marginBottom: 8 }}>
      <div style={{ fontWeight: 700, color: '#92400e', fontSize: 10, fontFamily: MONO, marginBottom: 4 }}>
        Transfer Normalisation Summary
      </div>
      <div style={{ display: 'flex', gap: '14px 24px', flexWrap: 'wrap', fontSize: 9, fontFamily: MONO }}>
        <span>Top 10: <b style={{ color: excessClr(s10.avgExcessPct) }}>{inflatedMsg(s10)}</b></span>
        <span>Top 20: <b style={{ color: excessClr(s20.avgExcessPct) }}>{inflatedMsg(s20)}</b></span>
        <span>Top 50: <b style={{ color: excessClr(s50.avgExcessPct) }}>{inflatedMsg(s50)}</b></span>
      </div>
      <div style={{ marginTop: 5, fontSize: 9, fontFamily: MONO, color: isInflated ? '#dc2626' : isSuppressed ? '#0369a1' : '#166534', fontWeight: 700 }}>
        {isInflated
          ? `⚠ Transfer magnitudes consistently inflated above coupling predictions (top-10 avg ${pct(s10.avgExcessPct)})`
          : isSuppressed
          ? `↓ Transfer magnitudes suppressed below coupling baseline (top-10 avg ${pct(s10.avgExcessPct)})`
          : `✓ Transfer magnitudes within ±10% of coupling-only prediction (top-10 avg ${pct(s10.avgExcessPct)})`
        }
      </div>
    </div>
  );
}

// ─── per-frequency panel ──────────────────────────────────────────────────────

function FreqPanel({ targetHz, bin, freqsHz, splDbRaw }) {
  if (!bin || !Array.isArray(bin.contributors) || bin.contributors.length === 0) {
    return (
      <div style={{ padding: '4px 0', fontSize: 9, fontFamily: MONO, color: '#9ca3af' }}>
        {targetHz} Hz — no engine data
      </div>
    );
  }

  const simSpl = interpolateSpl(freqsHz, splDbRaw, targetHz);
  const top10  = analyseTransfer(bin.contributors, 10);
  const top20  = analyseTransfer(bin.contributors, 20);
  const top50  = analyseTransfer(bin.contributors, 50);

  return (
    <div style={{ border: '1px solid #f59e0b', borderRadius: 6, padding: '8px 10px', marginBottom: 10, background: '#fffdf5' }}>
      {/* header */}
      <div style={{ display: 'flex', gap: '8px 18px', flexWrap: 'wrap', alignItems: 'baseline', borderBottom: '1px solid #fde68a', paddingBottom: 5, marginBottom: 6 }}>
        <span style={{ fontWeight: 700, color: '#b45309', fontSize: 13, fontFamily: MONO }}>{targetHz} Hz</span>
        <span style={{ fontSize: 10, fontFamily: MONO }}>Simulated: <b>{f1(simSpl)} dB</b></span>
        <span style={{ fontSize: 9, color: '#6b7280', fontFamily: MONO }}>
          Contributors available: {bin.contributors.length}
        </span>
      </div>
      <TransferTable rows={top10} />
      <SummaryBand top10={top10} top20={top20} top50={top50} allRows={bin.contributors} />
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function DominantModeTransferAudit({ roomDims, seat, sub, surfaceAbsorption, activeSettings }) {
  const [results, setResults]   = useState(null);
  const [running, setRunning]   = useState(false);
  const [error,   setError]     = useState(null);

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
      setResults({
        series:   result.activeModalContributorDebugSeries,
        freqsHz:  result.freqsHz,
        splDbRaw: result.splDbRaw,
      });
    } catch (e) {
      setError(e?.message ?? String(e));
    } finally {
      setRunning(false);
    }
  }, [roomDims, seat, sub, surfaceAbsorption, activeSettings, canRun]);

  return (
    <div style={{ marginTop: 12, border: '1px solid #f59e0b', borderRadius: 8, background: '#fffbeb', padding: '10px 12px' }}>
      <div style={{ fontWeight: 700, color: '#92400e', fontSize: 11, fontFamily: MONO, marginBottom: 4 }}>
        Dominant Mode Transfer Audit
        <span style={{ fontWeight: 400, color: '#d97706', marginLeft: 8, fontSize: 10 }}>
          Q×0.8 · Tang×0.8 · Axial=1.0 · Oblique=1.0 · diagnostic only
        </span>
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
          border: '1px solid #b45309',
          background: (running || !canRun) ? '#e5e7eb' : '#b45309',
          color:      (running || !canRun) ? '#6b7280' : '#fff',
          fontSize: 11, fontFamily: MONO, fontWeight: 600,
          cursor: (running || !canRun) ? 'not-allowed' : 'pointer',
          marginBottom: 10,
        }}
      >
        {running ? 'Running…' : results ? 'Re-run transfer audit' : 'Run transfer audit'}
      </button>

      {error && (
        <div style={{ fontSize: 10, color: '#dc2626', fontFamily: MONO, marginBottom: 6 }}>Error: {error}</div>
      )}

      {results && TARGET_FREQUENCIES.map(hz => {
        const bin = findBin(results.series, hz);
        return (
          <FreqPanel
            key={hz}
            targetHz={hz}
            bin={bin}
            freqsHz={results.freqsHz}
            splDbRaw={results.splDbRaw}
          />
        );
      })}
    </div>
  );
}