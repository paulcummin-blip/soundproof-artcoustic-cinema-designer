/**
 * RemainingSuspectsMatrixAudit — Diagnostic only.
 * No production changes. Does not affect the live graph.
 *
 * Tests four remaining suspects together across a 3×2×2×4 = 48 combination matrix:
 *   Axis A — Q scale:          0.5 / 1.0 / 2.0
 *   Axis B — Modal phase/sign: normal / inverted
 *   Axis C — Modal summation:  coherent / family RSS
 *   Axis D — Direct/modal bal: 1.0+1.0 / 1.5+1.0 / 1.0+1.5 / 1.5+1.5
 *
 * Outputs:
 *   1. Current production row
 *   2. Top 10 by MAE
 *   3. Best per-suspect axis
 *   4. Influence spreads + interpretation
 */

import React, { useState, useCallback } from 'react';
import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';

// ── Constants ──────────────────────────────────────────────────────────────────
const FLAT_CURVE = [{ hz: 20, db: 94 }, { hz: 200, db: 94 }];

const REW_TARGETS = {
  40: 91.8, 57: 88.2, 70: 86.8, 80: 79.7, 85: 90.8, 90: 84.1,
};
const TARGET_HZ = [40, 57, 70, 80, 85, 90];

const AXIS_A_Q = [0.5, 1.0, 2.0];
const AXIS_B_PHASE = ['normal', 'inverted'];
const AXIS_C_SUM = ['coherent', 'family_rss'];
const AXIS_D_BAL = [
  { label: '1.0+1.0', direct: 1.0, modal: 1.0 },
  { label: '1.5+1.0', direct: 1.5, modal: 1.0 },
  { label: '1.0+1.5', direct: 1.0, modal: 1.5 },
  { label: '1.5+1.5', direct: 1.5, modal: 1.5 },
];

// Production defaults (what the live graph uses for flat_rew_reference)
const PRODUCTION = {
  qScale: 1.0,
  phase: 'normal',
  summation: 'coherent',
  balance: AXIS_D_BAL[0], // 1.0+1.0
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt  = (v, d = 2) => Number.isFinite(Number(v)) ? Number(v).toFixed(d) : '—';
const fmtΔ = (v) => !Number.isFinite(v) ? '—' : (v >= 0 ? '+' : '') + v.toFixed(2);
const MONO = { fontFamily: 'monospace' };

function errColor(v) {
  const a = Math.abs(v ?? Infinity);
  if (a <= 0.5) return '#4ade80';
  if (a <= 1.5) return '#86efac';
  if (a <= 3.0) return '#fbbf24';
  if (a <= 6.0) return '#fb923c';
  return '#f87171';
}

function interpSpl(series, hz) {
  if (!series?.length) return null;
  const s = series;
  if (hz <= s[0].frequency) return s[0].spl;
  if (hz >= s[s.length - 1].frequency) return s[s.length - 1].spl;
  for (let i = 0; i < s.length - 1; i++) {
    if (hz >= s[i].frequency && hz <= s[i + 1].frequency) {
      const t = (hz - s[i].frequency) / (s[i + 1].frequency - s[i].frequency);
      return s[i].spl + t * (s[i + 1].spl - s[i].spl);
    }
  }
  return null;
}

function computeMetrics(series) {
  const perHz = {};
  let maeSum = 0, maeCount = 0, worstErr = 0, worstHz = null;
  for (const hz of TARGET_HZ) {
    const spl = interpSpl(series, hz);
    const target = REW_TARGETS[hz];
    const err = Number.isFinite(spl) && Number.isFinite(target) ? spl - target : null;
    perHz[hz] = err;
    if (Number.isFinite(err)) {
      maeSum += Math.abs(err);
      maeCount++;
      if (Math.abs(err) > Math.abs(worstErr)) { worstErr = err; worstHz = hz; }
    }
  }
  const mae = maeCount > 0 ? maeSum / maeCount : null;
  return { mae, worstErr: Number.isFinite(worstErr) ? worstErr : null, worstHz, perHz };
}

/**
 * Run a single combination through the engine.
 * family_rss: run each mode family separately (coherent within family, RSS across families).
 */
function runCombo(roomDims, seat, sub, surfaceAbsorption, baseAxialQ, qScale, phase, summation, balance) {
  const seatZ = Number.isFinite(Number(seat?.z)) ? Number(seat.z) : 1.2;
  const subZ  = Number.isFinite(Number(sub?.z))  ? Number(sub.z)  : 0.35;

  const effectiveAxialQ = baseAxialQ * qScale;
  const invertPhase = phase === 'inverted';
  const directScale = balance.direct;
  const modalScale  = balance.modal;

  const baseOptions = {
    enableReflections:            false,
    enableModes:                  true,
    surfaceAbsorption,
    freqMinHz:                    20,
    freqMaxHz:                    200,
    smoothing:                    'none',
    axialQ:                       effectiveAxialQ,
    modalSourceReferenceMode:     'existing',
    modalGainScalar:              modalScale,
    modalStorageMode:             'none',
    propagationPhaseScale:        0,
    pureDeterministicModalSum:    true,
    disableModalPropagationPhase: true,
    disableLateField:             true,
    modalCoherenceMode:           'coherent',
    highOrderAxialScale:          1.0,
    rewParityModalMagnitudeScale: 1.0,
    debugModalPhaseConvention:    invertPhase ? 'invert' : 'normal',
  };

  const seatPos = { x: Number(seat.x), y: Number(seat.y), z: seatZ };
  const subObj  = { ...sub, z: subZ };

  try {
    if (summation === 'coherent') {
      const res = simulateBassResponseRewCore(
        { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM },
        seatPos, subObj, FLAT_CURVE,
        { ...baseOptions, rewParityModalMagnitudeScale: modalScale }
      );
      if (!res?.freqsHz) return null;

      // Apply direct scale by inflating the direct path:
      // direct_scale > 1.0 → inject additional direct-only run and add linearly
      let series = res.freqsHz.map((hz, i) => ({ frequency: hz, spl: res.splDbRaw[i] }));

      if (directScale !== 1.0 || modalScale !== 1.0) {
        // Run direct-only and modal-only, then combine with requested scales
        const directOnly = simulateBassResponseRewCore(
          { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM },
          seatPos, subObj, FLAT_CURVE,
          { ...baseOptions, enableModes: false, modalGainScalar: 1.0 }
        );
        const modalOnly = simulateBassResponseRewCore(
          { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM },
          seatPos, subObj, FLAT_CURVE,
          { ...baseOptions, enableModes: true, modalGainScalar: modalScale }
        );
        if (!directOnly?.freqsHz || !modalOnly?.freqsHz) return null;

        // Combine: scale direct pressures + modal pressures, then compute dB
        series = directOnly.freqsHz.map((hz, i) => {
          const dRe = directOnly.complexPressure[i].re * directScale;
          const dIm = directOnly.complexPressure[i].im * directScale;
          // modal pressure = total - direct
          const mRe = modalOnly.complexPressure[i].re - directOnly.complexPressure[i].re;
          const mIm = modalOnly.complexPressure[i].im - directOnly.complexPressure[i].im;
          const totRe = dRe + mRe;
          const totIm = dIm + mIm;
          const mag = Math.sqrt(totRe * totRe + totIm * totIm);
          return { frequency: hz, spl: 20 * Math.log10(Math.max(mag, 1e-10)) };
        });
      }
      return series;
    }

    // family_rss: run axial/tangential/oblique each in isolation, RSS-combine
    const families = ['axial', 'tangential', 'oblique'];
    const familyResults = [];
    for (const fam of families) {
      const familyScales = {
        axialFamilyScale:       fam === 'axial'       ? 1.0 : 0.0,
        tangentialFamilyScale:  fam === 'tangential'  ? 1.0 : 0.0,
        obliqueFamilyScale:     fam === 'oblique'     ? 1.0 : 0.0,
      };
      const res = simulateBassResponseRewCore(
        { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM },
        seatPos, subObj, FLAT_CURVE,
        { ...baseOptions, rewParityModalMagnitudeScale: modalScale, ...familyScales }
      );
      if (res?.freqsHz) familyResults.push(res);
    }

    // Also add direct-only (modal zeroed, direct scaled)
    const directRes = simulateBassResponseRewCore(
      { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM },
      seatPos, subObj, FLAT_CURVE,
      { ...baseOptions, enableModes: false, modalGainScalar: 1.0 }
    );
    if (!directRes?.freqsHz || familyResults.length === 0) return null;

    // RSS: P_total = sqrt(P_direct^2 + sum_family(P_family_modal^2))
    const series = directRes.freqsHz.map((hz, i) => {
      const dRe = directRes.complexPressure[i].re * directScale;
      const dIm = directRes.complexPressure[i].im * directScale;
      let rssEnergy = dRe * dRe + dIm * dIm;

      for (const fRes of familyResults) {
        // modal contribution of this family = total - direct (since direct is identical across all runs)
        const mRe = fRes.complexPressure[i].re - directRes.complexPressure[i].re;
        const mIm = fRes.complexPressure[i].im - directRes.complexPressure[i].im;
        rssEnergy += mRe * mRe + mIm * mIm;
      }

      const mag = Math.sqrt(Math.max(rssEnergy, 0));
      return { frequency: hz, spl: 20 * Math.log10(Math.max(mag, 1e-10)) };
    });
    return series;
  } catch {
    return null;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function RemainingSuspectsMatrixAudit({
  roomDims, seat, sub, surfaceAbsorption, activeSettings,
}) {
  const [result, setResult]   = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError]     = useState(null);
  const [showAll, setShowAll] = useState(false);

  const baseAxialQ = activeSettings?.axialQ ?? 4.0;

  const canRun = !!(
    roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM &&
    seat?.x != null && seat?.y != null &&
    sub?.x  != null && sub?.y  != null
  );

  const runAudit = useCallback(async () => {
    if (!canRun) return;
    setRunning(true);
    setError(null);
    setResult(null);
    await new Promise(r => setTimeout(r, 0));

    try {
      const rows = [];
      let batchCount = 0;

      // Production row first
      const prodSeries = runCombo(roomDims, seat, sub, surfaceAbsorption,
        baseAxialQ, PRODUCTION.qScale, PRODUCTION.phase, PRODUCTION.summation, PRODUCTION.balance);
      const prodMetrics = prodSeries ? computeMetrics(prodSeries) : null;

      // All 48 combos
      for (const qScale of AXIS_A_Q) {
        for (const phase of AXIS_B_PHASE) {
          for (const summation of AXIS_C_SUM) {
            for (const balance of AXIS_D_BAL) {
              batchCount++;
              if (batchCount % 8 === 0) await new Promise(r => setTimeout(r, 0));

              const series = runCombo(roomDims, seat, sub, surfaceAbsorption,
                baseAxialQ, qScale, phase, summation, balance);
              const metrics = series ? computeMetrics(series) : null;

              rows.push({
                qScale, phase, summation,
                balanceLabel: balance.label, directScale: balance.direct, modalScale: balance.modal,
                label: `Q×${qScale} | ${phase} | ${summation} | ${balance.label}`,
                mae: metrics?.mae ?? null,
                worstErr: metrics?.worstErr ?? null,
                worstHz: metrics?.worstHz ?? null,
                perHz: metrics?.perHz ?? {},
              });
            }
          }
        }
      }

      // Sort by MAE ascending
      rows.sort((a, b) => (a.mae ?? Infinity) - (b.mae ?? Infinity));

      // Per-axis best
      const bestByQ = AXIS_A_Q.map(q => {
        const group = rows.filter(r => r.qScale === q && Number.isFinite(r.mae));
        const best  = group.sort((a, b) => a.mae - b.mae)[0];
        return { key: `Q×${q}`, mae: best?.mae ?? null };
      });
      const bestByPhase = AXIS_B_PHASE.map(p => {
        const group = rows.filter(r => r.phase === p && Number.isFinite(r.mae));
        const best  = group.sort((a, b) => a.mae - b.mae)[0];
        return { key: p, mae: best?.mae ?? null };
      });
      const bestBySum = AXIS_C_SUM.map(s => {
        const group = rows.filter(r => r.summation === s && Number.isFinite(r.mae));
        const best  = group.sort((a, b) => a.mae - b.mae)[0];
        return { key: s, mae: best?.mae ?? null };
      });
      const bestByBal = AXIS_D_BAL.map(b => {
        const group = rows.filter(r => r.balanceLabel === b.label && Number.isFinite(r.mae));
        const best  = group.sort((a, b) => a.mae - b.mae)[0];
        return { key: b.label, mae: best?.mae ?? null };
      });

      // Influence spread per axis = max(best_MAE) - min(best_MAE) across axis values
      const spread = (arr) => {
        const vals = arr.map(x => x.mae).filter(Number.isFinite);
        return vals.length > 1 ? Math.max(...vals) - Math.min(...vals) : null;
      };
      const spreads = {
        Q:           spread(bestByQ),
        phase:       spread(bestByPhase),
        summation:   spread(bestBySum),
        balance:     spread(bestByBal),
      };
      const validSpreads = Object.entries(spreads).filter(([, v]) => Number.isFinite(v));
      const maxSpread = validSpreads.length > 0 ? Math.max(...validSpreads.map(([, v]) => v)) : 0;
      const primaryAxis = validSpreads.length > 0
        ? validSpreads.reduce((best, cur) => cur[1] > best[1] ? cur : best)[0]
        : null;

      setResult({
        rows, prodMetrics, bestByQ, bestByPhase, bestBySum, bestByBal, spreads, primaryAxis, maxSpread,
      });
    } catch (e) {
      setError(e.message || 'Unknown error');
    }
    setRunning(false);
  }, [roomDims, seat, sub, surfaceAbsorption, baseAxialQ, canRun]);

  // ── Styles ────────────────────────────────────────────────────────────────
  const TH  = { padding: '3px 6px', fontSize: 9, fontWeight: 700, ...MONO, background: '#1c1917', color: '#a8a29e', borderBottom: '2px solid #292524', whiteSpace: 'nowrap', textAlign: 'right' };
  const THL = { ...TH, textAlign: 'left' };
  const TD  = { padding: '2px 6px', fontSize: 9, ...MONO, textAlign: 'right', borderBottom: '1px solid #1c1917' };
  const TDL = { ...TD, textAlign: 'left' };

  const interpretPrimary = (axis, maxSpr) => {
    if (!axis) return null;
    if (maxSpr < 1.0) return '"Remaining gap is likely benchmark/input mismatch rather than tested engine architecture."';
    const msgs = {
      Q:         '"Q / modal bandwidth is primary."',
      phase:     '"Modal phase convention is primary."',
      summation: '"Modal summation architecture is primary."',
      balance:   '"Direct/modal balance is primary."',
    };
    return msgs[axis] ?? null;
  };

  return (
    <div style={{ marginTop: 12, border: '1px solid #292524', borderRadius: 8, background: '#0c0a09', padding: '10px 12px' }}>

      {/* Header */}
      <div style={{ fontWeight: 700, color: '#d6d3d1', fontSize: 11, ...MONO, marginBottom: 3 }}>
        Remaining Suspects Matrix Audit
        <span style={{ fontWeight: 400, color: '#44403c', marginLeft: 10, fontSize: 10 }}>
          diagnostic only · 48 combos · no production changes
        </span>
      </div>
      <div style={{ fontSize: 9, color: '#57534e', ...MONO, marginBottom: 6, lineHeight: 1.8 }}>
        Axis A Q×: {AXIS_A_Q.join(' / ')} &nbsp;·&nbsp;
        Axis B phase: {AXIS_B_PHASE.join(' / ')} &nbsp;·&nbsp;
        Axis C sum: {AXIS_C_SUM.join(' / ')} &nbsp;·&nbsp;
        Axis D balance: {AXIS_D_BAL.map(b => b.label).join(' / ')}
        <br />
        Reflections OFF · Direct + Modes · Flat 94 dB source · Current room/sub/seat · No live graph changes.
      </div>

      {!canRun && (
        <div style={{ fontSize: 10, color: '#fbbf24', ...MONO, marginBottom: 6 }}>
          ⚠ Need room dimensions, a valid seat, and a valid sub to run.
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        <button
          onClick={runAudit}
          disabled={running || !canRun}
          style={{
            height: 28, padding: '0 14px', borderRadius: 6,
            border: '1px solid #57534e', background: running ? '#1c1917' : '#292524',
            color: running ? '#57534e' : '#d6d3d1', fontSize: 11, ...MONO,
            cursor: running || !canRun ? 'not-allowed' : 'pointer', fontWeight: 700,
          }}
        >
          {running ? `Running 48 combos…` : result ? 'Re-run Matrix' : 'Run Suspects Matrix (48 combos)'}
        </button>
        {result && (
          <button
            onClick={() => setShowAll(p => !p)}
            style={{ height: 26, padding: '0 10px', borderRadius: 6, border: '1px solid #292524', background: '#1c1917', color: '#a8a29e', fontSize: 10, ...MONO, cursor: 'pointer' }}
          >
            {showAll ? 'Show top 10 only' : 'Show all 48 rows'}
          </button>
        )}
      </div>

      {error && (
        <div style={{ fontSize: 10, color: '#f87171', ...MONO, marginBottom: 8 }}>⚠ Error: {error}</div>
      )}

      {result && (() => {
        const { rows, prodMetrics, bestByQ, bestByPhase, bestBySum, bestByBal, spreads, primaryAxis, maxSpread } = result;
        const displayRows = showAll ? rows : rows.slice(0, 10);
        const interp = interpretPrimary(primaryAxis, maxSpread);

        return (
          <>
            {/* ── Section 1: Current production row ── */}
            <div style={{ fontSize: 10, fontWeight: 700, color: '#60a5fa', ...MONO, marginBottom: 4 }}>
              Section 1 — Current Production Configuration
            </div>
            <div style={{ padding: '6px 10px', background: '#1c1917', borderRadius: 5, borderLeft: '3px solid #60a5fa', fontSize: 9, ...MONO, color: '#d6d3d1', marginBottom: 10, lineHeight: 1.9 }}>
              Q×{PRODUCTION.qScale} · {PRODUCTION.phase} phase · {PRODUCTION.summation} sum · {PRODUCTION.balance.label} balance
              {' → '}
              MAE: <span style={{ color: errColor(prodMetrics?.mae), fontWeight: 700 }}>{fmt(prodMetrics?.mae)} dB</span>
              &nbsp;·&nbsp;
              Worst: <span style={{ color: errColor(prodMetrics?.worstErr), fontWeight: 700 }}>{fmtΔ(prodMetrics?.worstErr)} dB</span>
              {prodMetrics?.worstHz ? ` @ ${prodMetrics.worstHz} Hz` : ''}
              {TARGET_HZ.map(hz => (
                <span key={hz} style={{ marginLeft: 8 }}>
                  <span style={{ color: '#57534e' }}>{hz}Hz:</span>
                  <span style={{ color: errColor(prodMetrics?.perHz?.[hz]), fontWeight: 600 }}> {fmtΔ(prodMetrics?.perHz?.[hz])}</span>
                </span>
              ))}
            </div>

            {/* ── Section 2: Top 10 (or all) ranked by MAE ── */}
            <div style={{ fontSize: 10, fontWeight: 700, color: '#fbbf24', ...MONO, marginBottom: 4 }}>
              Section 2 — {showAll ? 'All 48' : 'Top 10'} Combinations (ranked by MAE)
            </div>
            <div style={{ overflowX: 'auto', marginBottom: 12 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 800 }}>
                <thead>
                  <tr>
                    <th style={{ ...THL, minWidth: 22 }}>#</th>
                    <th style={{ ...THL, minWidth: 40 }}>Q×</th>
                    <th style={{ ...THL, minWidth: 60 }}>Phase</th>
                    <th style={{ ...THL, minWidth: 80 }}>Sum</th>
                    <th style={{ ...THL, minWidth: 70 }}>Balance</th>
                    <th style={{ ...TH, minWidth: 48 }}>MAE</th>
                    <th style={{ ...TH, minWidth: 48 }}>Worst</th>
                    <th style={{ ...TH, minWidth: 38 }}>Hz</th>
                    {TARGET_HZ.map(hz => <th key={hz} style={{ ...TH, minWidth: 38 }}>{hz}Hz</th>)}
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((row, idx) => {
                    const isProd = row.qScale === PRODUCTION.qScale &&
                      row.phase === PRODUCTION.phase &&
                      row.summation === PRODUCTION.summation &&
                      row.balanceLabel === PRODUCTION.balance.label;
                    const rowBg = idx === 0 ? '#1f1a10' : isProd ? '#111820' : 'transparent';
                    return (
                      <tr key={row.label} style={{ borderBottom: '1px solid #1c1917', background: rowBg }}>
                        <td style={{ ...TDL, color: idx === 0 ? '#fbbf24' : '#57534e', fontWeight: idx === 0 ? 700 : 400 }}>
                          {idx === 0 ? '★' : idx + 1}
                        </td>
                        <td style={{ ...TDL, color: '#d6d3d1' }}>{row.qScale}</td>
                        <td style={{ ...TDL, color: row.phase === 'inverted' ? '#f87171' : '#a8a29e' }}>{row.phase}</td>
                        <td style={{ ...TDL, color: row.summation === 'family_rss' ? '#c084fc' : '#a8a29e' }}>{row.summation}</td>
                        <td style={{ ...TDL, color: '#a8a29e' }}>{row.balanceLabel}</td>
                        <td style={{ ...TD, color: errColor(row.mae), fontWeight: 700 }}>{fmt(row.mae)}</td>
                        <td style={{ ...TD, color: errColor(row.worstErr) }}>{fmtΔ(row.worstErr)}</td>
                        <td style={{ ...TD, color: '#78716c' }}>{row.worstHz ?? '—'}</td>
                        {TARGET_HZ.map(hz => (
                          <td key={hz} style={{ ...TD, color: errColor(row.perHz?.[hz]) }}>
                            {fmtΔ(row.perHz?.[hz])}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── Section 3: Best per suspect ── */}
            <div style={{ fontSize: 10, fontWeight: 700, color: '#a78bfa', ...MONO, marginBottom: 5 }}>
              Section 3 — Best per Suspect Axis
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
              {/* Axis A — Q */}
              <div style={{ padding: '6px 10px', background: '#1c1917', borderRadius: 5, borderLeft: '3px solid #60a5fa' }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#60a5fa', ...MONO, marginBottom: 3 }}>Axis A — Q scale</div>
                {bestByQ.map(b => (
                  <div key={b.key} style={{ fontSize: 9, ...MONO, color: '#d6d3d1', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{b.key}</span>
                    <span style={{ color: errColor(b.mae), fontWeight: 700 }}>{fmt(b.mae)} dB MAE</span>
                  </div>
                ))}
              </div>
              {/* Axis B — Phase */}
              <div style={{ padding: '6px 10px', background: '#1c1917', borderRadius: 5, borderLeft: '3px solid #f87171' }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#f87171', ...MONO, marginBottom: 3 }}>Axis B — Modal phase</div>
                {bestByPhase.map(b => (
                  <div key={b.key} style={{ fontSize: 9, ...MONO, color: '#d6d3d1', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{b.key}</span>
                    <span style={{ color: errColor(b.mae), fontWeight: 700 }}>{fmt(b.mae)} dB MAE</span>
                  </div>
                ))}
              </div>
              {/* Axis C — Summation */}
              <div style={{ padding: '6px 10px', background: '#1c1917', borderRadius: 5, borderLeft: '3px solid #c084fc' }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#c084fc', ...MONO, marginBottom: 3 }}>Axis C — Modal summation</div>
                {bestBySum.map(b => (
                  <div key={b.key} style={{ fontSize: 9, ...MONO, color: '#d6d3d1', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{b.key}</span>
                    <span style={{ color: errColor(b.mae), fontWeight: 700 }}>{fmt(b.mae)} dB MAE</span>
                  </div>
                ))}
              </div>
              {/* Axis D — Balance */}
              <div style={{ padding: '6px 10px', background: '#1c1917', borderRadius: 5, borderLeft: '3px solid #86efac' }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#86efac', ...MONO, marginBottom: 3 }}>Axis D — Direct/modal balance</div>
                {bestByBal.map(b => (
                  <div key={b.key} style={{ fontSize: 9, ...MONO, color: '#d6d3d1', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{b.key}</span>
                    <span style={{ color: errColor(b.mae), fontWeight: 700 }}>{fmt(b.mae)} dB MAE</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Section 4: Influence summary & interpretation ── */}
            <div style={{ fontSize: 10, fontWeight: 700, color: '#4ade80', ...MONO, marginBottom: 5 }}>
              Section 4 — Influence Summary &amp; Interpretation
            </div>
            <div style={{ padding: '8px 12px', background: '#1c1917', borderRadius: 5, marginBottom: 8 }}>
              {[
                { key: 'Q',         label: 'Q scale influence spread',         color: '#60a5fa' },
                { key: 'phase',     label: 'Phase influence spread',           color: '#f87171' },
                { key: 'summation', label: 'Summation influence spread',       color: '#c084fc' },
                { key: 'balance',   label: 'Direct/modal balance spread',      color: '#86efac' },
              ].map(({ key, label, color }) => {
                const s = spreads[key];
                const isMax = key === primaryAxis;
                return (
                  <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 9, ...MONO, color: '#a8a29e' }}>{label}</span>
                    <span style={{ fontSize: 10, ...MONO, color: isMax ? color : '#57534e', fontWeight: isMax ? 800 : 400 }}>
                      {fmt(s, 2)} dB{isMax ? ' ← PRIMARY' : ''}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Verdict */}
            <div style={{
              padding: '10px 14px', background: '#1c1917', borderRadius: 6,
              border: `2px solid ${maxSpread < 1.0 ? '#fbbf24' : '#4ade80'}`,
              fontSize: 10, ...MONO, color: '#d6d3d1', lineHeight: 2.0,
            }}>
              <div style={{ fontWeight: 700, color: maxSpread < 1.0 ? '#fbbf24' : '#4ade80', marginBottom: 4 }}>
                Interpretation
              </div>
              {interp && (
                <div style={{ color: '#e2e8f0', fontStyle: 'italic', marginBottom: 4 }}>{interp}</div>
              )}
              <div style={{ fontSize: 9, color: '#78716c', lineHeight: 1.8 }}>
                Primary axis: <span style={{ color: '#d6d3d1', fontWeight: 700 }}>{primaryAxis ?? '—'}</span>
                &nbsp;·&nbsp;Max spread: <span style={{ color: '#d6d3d1', fontWeight: 700 }}>{fmt(maxSpread)} dB</span>
                &nbsp;·&nbsp;Best MAE: <span style={{ color: errColor(rows[0]?.mae), fontWeight: 700 }}>{fmt(rows[0]?.mae)} dB</span>
                &nbsp;vs production: <span style={{ color: errColor(prodMetrics?.mae), fontWeight: 700 }}>{fmt(prodMetrics?.mae)} dB</span>
                {Number.isFinite(rows[0]?.mae) && Number.isFinite(prodMetrics?.mae)
                  ? <span> (Δ = {fmtΔ(rows[0].mae - prodMetrics.mae)} dB)</span>
                  : null}
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}