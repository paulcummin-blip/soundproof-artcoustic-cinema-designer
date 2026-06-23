/**
 * DirectModalEnergyRatioAudit — Diagnostic only.
 * No production changes. Does not affect the live graph.
 *
 * Measures whether the engine injects too much modal energy relative
 * to the direct field, and diagnoses the root cause of parity gaps.
 */

import React, { useState, useCallback } from 'react';
import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';

// ── Constants ──────────────────────────────────────────────────────────────────
const FLAT_CURVE  = [{ hz: 20, db: 94 }, { hz: 200, db: 94 }];
const TARGET_HZ   = [40, 57, 70, 80, 85, 90, 100];
const REW_TARGETS = { 40: 91.8, 57: 88.2, 70: 86.8, 80: 79.7, 85: 90.8, 90: 84.1, 100: null };

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt    = (v, d = 1) => Number.isFinite(Number(v)) ? Number(v).toFixed(d) : '—';
const fmtΔ   = (v) => !Number.isFinite(v) ? '—' : (v >= 0 ? '+' : '') + v.toFixed(1);
const MONO   = { fontFamily: 'monospace' };

function magToDb(v) {
  if (!Number.isFinite(v) || v <= 0) return null;
  return 20 * Math.log10(v);
}

function errColor(v) {
  const a = Math.abs(v ?? Infinity);
  if (a <= 0.5) return '#4ade80';
  if (a <= 1.5) return '#86efac';
  if (a <= 3.0) return '#fbbf24';
  if (a <= 6.0) return '#fb923c';
  return '#f87171';
}

function ratioColor(ratio) {
  // ratio = modal pressure / direct pressure
  if (ratio < 0.5)  return '#4ade80';   // direct strongly dominant
  if (ratio < 1.0)  return '#86efac';   // direct dominant
  if (ratio < 1.5)  return '#fbbf24';   // roughly balanced → slight modal lean
  if (ratio < 2.5)  return '#fb923c';   // modal dominant
  return '#f87171';                     // modal heavily dominant
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

function interpPressure(series, hz) {
  const spl = interpSpl(series, hz);
  if (!Number.isFinite(spl)) return null;
  return Math.pow(10, spl / 20);
}

/** Base engine options shared by all variants */
function baseOpts(surfaceAbsorption, axialQ) {
  return {
    enableReflections:            false,
    surfaceAbsorption,
    freqMinHz:                    20,
    freqMaxHz:                    200,
    smoothing:                    'none',
    axialQ,
    modalSourceReferenceMode:     'existing',
    modalGainScalar:              1.0,
    modalStorageMode:             'none',
    propagationPhaseScale:        0,
    pureDeterministicModalSum:    true,
    disableModalPropagationPhase: true,
    disableLateField:             true,
    modalCoherenceMode:           'coherent',
    highOrderAxialScale:          1.0,
    rewParityModalMagnitudeScale: 1.0,
    debugModalPhaseConvention:    'normal',
  };
}

/** Run engine and return series [{frequency, spl}] */
function runSeries(roomDims, seat, sub, surfaceAbsorption, extraOpts) {
  const seatZ = Number.isFinite(Number(seat?.z)) ? Number(seat.z) : 1.2;
  const subZ  = Number.isFinite(Number(sub?.z))  ? Number(sub.z)  : 0.35;
  try {
    const res = simulateBassResponseRewCore(
      { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM },
      { x: Number(seat.x), y: Number(seat.y), z: seatZ },
      { ...sub, z: subZ },
      FLAT_CURVE,
      extraOpts
    );
    if (!res?.freqsHz) return null;
    return res.freqsHz.map((hz, i) => ({ frequency: hz, spl: res.splDbRaw[i] }));
  } catch { return null; }
}

/**
 * For a given config, run:
 *   1. direct-only
 *   2. modal-only
 *   3. combined
 * Returns per-frequency breakdown for TARGET_HZ.
 */
function computeVariant(roomDims, seat, sub, surfaceAbsorption, axialQ, directScale, modalScale) {
  const opts = baseOpts(surfaceAbsorption, axialQ);

  const directSeries = runSeries(roomDims, seat, sub, surfaceAbsorption, {
    ...opts, enableModes: false,
  });
  const modalSeries = runSeries(roomDims, seat, sub, surfaceAbsorption, {
    ...opts, enableModes: true, modalGainScalar: modalScale,
    // zero direct contribution: run total - direct to isolate modal
  });
  const combinedSeries = runSeries(roomDims, seat, sub, surfaceAbsorption, {
    ...opts, enableModes: true, modalGainScalar: modalScale,
  });

  if (!directSeries || !modalSeries || !combinedSeries) return null;

  // Isolate modal pressure = combined complex pressure - direct complex pressure
  // We re-run direct-only and combined, then modal ≈ combined - direct in pressure domain.
  // Since we only have SPL series, convert to pressure magnitudes for energy ratio.
  // This is an energy approximation (not exact complex subtraction).

  const rows = TARGET_HZ.map(hz => {
    const pDirect   = interpPressure(directSeries,   hz);
    const pCombined = interpPressure(combinedSeries, hz);

    // Approximate modal pressure magnitude: p_modal ≈ sqrt(p_combined^2 - p_direct^2)
    // This holds exactly when direct and modal are uncorrelated (RSS); for correlated
    // contributions it is an approximation — clearly labelled as such in the UI.
    const pModalApprox = (pDirect != null && pCombined != null && pCombined >= pDirect)
      ? Math.sqrt(Math.max(0, pCombined * pCombined - pDirect * pDirect * directScale * directScale))
      : null;

    const scaledDirectP = pDirect != null ? pDirect * directScale : null;
    const directSpl   = magToDb(scaledDirectP);
    const modalSpl    = magToDb(pModalApprox);
    const combinedSpl = interpSpl(combinedSeries, hz);

    const modalMinusDirect = (directSpl != null && modalSpl != null)
      ? modalSpl - directSpl
      : null;
    const pressureRatio = (scaledDirectP != null && scaledDirectP > 0 && pModalApprox != null)
      ? pModalApprox / scaledDirectP
      : null;

    const totalEnergy = (scaledDirectP != null && pModalApprox != null)
      ? (scaledDirectP * scaledDirectP + pModalApprox * pModalApprox)
      : null;
    const directPct = (totalEnergy != null && totalEnergy > 0 && scaledDirectP != null)
      ? (scaledDirectP * scaledDirectP / totalEnergy) * 100
      : null;
    const modalPct = directPct != null ? 100 - directPct : null;

    const rewTarget = REW_TARGETS[hz];
    const errVsRew  = (Number.isFinite(combinedSpl) && Number.isFinite(rewTarget))
      ? combinedSpl - rewTarget
      : null;

    return {
      hz, directSpl, modalSpl, combinedSpl,
      modalMinusDirect, pressureRatio,
      directPct, modalPct, errVsRew,
    };
  });

  // Summary: modal dominance score = fraction of freqs where modal > direct
  const validRows   = rows.filter(r => r.pressureRatio != null);
  const dominantCnt = validRows.filter(r => r.pressureRatio > 1.0).length;
  const dominancePct = validRows.length > 0 ? (dominantCnt / validRows.length) * 100 : 0;
  const avgRatio     = validRows.length > 0
    ? validRows.reduce((s, r) => s + r.pressureRatio, 0) / validRows.length
    : null;

  return { rows, dominancePct, avgRatio };
}

// ── Component ─────────────────────────────────────────────────────────────────
const VARIANTS = [
  { key: 'prod',   label: 'A) Production',      axialQScale: 1.0, directScale: 1.0 },
  { key: 'qhalf',  label: 'B) Q ×0.5',          axialQScale: 0.5, directScale: 1.0 },
  { key: 'dir15',  label: 'C) Direct ×1.5',      axialQScale: 1.0, directScale: 1.5 },
  { key: 'both',   label: 'D) Direct ×1.5 + Q ×0.5', axialQScale: 0.5, directScale: 1.5 },
];

export default function DirectModalEnergyRatioAudit({ roomDims, seat, sub, surfaceAbsorption, activeSettings }) {
  const [result, setResult]   = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError]     = useState(null);
  const [activeTab, setActiveTab] = useState('prod');

  const baseAxialQ = activeSettings?.axialQ ?? 4.0;

  const canRun = !!(
    roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM &&
    seat?.x != null && seat?.y != null && sub?.x != null && sub?.y != null
  );

  const runAudit = useCallback(async () => {
    if (!canRun) return;
    setRunning(true);
    setError(null);
    setResult(null);
    await new Promise(r => setTimeout(r, 0));

    try {
      const results = {};
      for (const v of VARIANTS) {
        await new Promise(r => setTimeout(r, 0));
        results[v.key] = computeVariant(
          roomDims, seat, sub, surfaceAbsorption,
          baseAxialQ * v.axialQScale, v.directScale, 1.0
        );
      }

      // Rank variants by lowest avgRatio (least modal dominance)
      const ranked = VARIANTS
        .map(v => ({ ...v, avgRatio: results[v.key]?.avgRatio ?? Infinity, dominancePct: results[v.key]?.dominancePct ?? 100 }))
        .sort((a, b) => a.avgRatio - b.avgRatio);

      setResult({ byVariant: results, ranked });
    } catch (e) {
      setError(e.message || 'Unknown error');
    }
    setRunning(false);
  }, [roomDims, seat, sub, surfaceAbsorption, baseAxialQ, canRun]);

  // ── Styles ────────────────────────────────────────────────────────────────
  const TH   = { padding: '3px 6px', fontSize: 9, fontWeight: 700, ...MONO, background: '#1c1917', color: '#a8a29e', borderBottom: '2px solid #292524', whiteSpace: 'nowrap', textAlign: 'right' };
  const THL  = { ...TH, textAlign: 'left' };
  const TD   = { padding: '2px 6px', fontSize: 9, ...MONO, textAlign: 'right', borderBottom: '1px solid #1c1917' };
  const TDL  = { ...TD, textAlign: 'left' };

  const activeVariant = VARIANTS.find(v => v.key === activeTab);
  const activeData    = result?.byVariant?.[activeTab];

  // Interpretation
  const interpret = (byVariant) => {
    const prod     = byVariant?.prod;
    const dir15    = byVariant?.dir15;
    if (!prod) return null;

    const messages = [];
    if (prod.dominancePct >= 60) {
      messages.push('"Modal field is over-contributing."');
    } else if (prod.dominancePct < 40) {
      messages.push('"Problem lies in modal shape, phase, or transfer function."');
    }

    if (dir15 && prod) {
      const ratioImprovement = (prod.avgRatio ?? 0) - (dir15.avgRatio ?? 0);
      if (ratioImprovement > 0.2) {
        messages.push('"Root cause is likely direct-field calibration rather than modal physics."');
      }
    }

    return messages;
  };

  return (
    <div style={{ marginTop: 12, border: '1px solid #292524', borderRadius: 8, background: '#0c0a09', padding: '10px 12px' }}>

      {/* Header */}
      <div style={{ fontWeight: 700, color: '#d6d3d1', fontSize: 11, ...MONO, marginBottom: 3 }}>
        Direct vs Modal Energy Ratio Audit
        <span style={{ fontWeight: 400, color: '#44403c', marginLeft: 10, fontSize: 10 }}>
          diagnostic only · no production changes
        </span>
      </div>
      <div style={{ fontSize: 9, color: '#57534e', ...MONO, marginBottom: 8, lineHeight: 1.8 }}>
        Measures direct-field vs modal-field energy at 40–100 Hz. Four variants: production, Q×0.5, Direct×1.5, combined.
        Modal pressure is approximated as √(P_combined² − P_direct²) — valid for uncorrelated paths; labelled approximate.
      </div>

      {!canRun && (
        <div style={{ fontSize: 10, color: '#fbbf24', ...MONO, marginBottom: 6 }}>⚠ Need room, seat, and sub to run.</div>
      )}

      <button
        onClick={runAudit}
        disabled={running || !canRun}
        style={{
          height: 28, padding: '0 14px', borderRadius: 6,
          border: '1px solid #57534e', background: running ? '#1c1917' : '#292524',
          color: running ? '#57534e' : '#d6d3d1', fontSize: 11, ...MONO,
          cursor: running || !canRun ? 'not-allowed' : 'pointer', fontWeight: 700, marginBottom: 10,
        }}
      >
        {running ? 'Running…' : result ? 'Re-run Audit' : 'Run Direct vs Modal Energy Audit'}
      </button>

      {error && <div style={{ fontSize: 10, color: '#f87171', ...MONO, marginBottom: 8 }}>⚠ {error}</div>}

      {result && (() => {
        const messages = interpret(result.byVariant);
        return (
          <>
            {/* ── Variant tabs ── */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
              {VARIANTS.map(v => {
                const data = result.byVariant[v.key];
                const isActive = activeTab === v.key;
                return (
                  <button
                    key={v.key}
                    onClick={() => setActiveTab(v.key)}
                    style={{
                      padding: '3px 10px', borderRadius: 4, fontSize: 9, ...MONO, cursor: 'pointer',
                      border: isActive ? '1px solid #60a5fa' : '1px solid #292524',
                      background: isActive ? '#1e3a5f' : '#1c1917',
                      color: isActive ? '#93c5fd' : '#78716c', fontWeight: isActive ? 700 : 400,
                    }}
                  >
                    {v.label}
                    {data && (
                      <span style={{ marginLeft: 5, color: ratioColor(data.avgRatio) }}>
                        avg×{fmt(data.avgRatio, 2)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* ── Per-variant detail table ── */}
            {activeData && (
              <>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#60a5fa', ...MONO, marginBottom: 4 }}>
                  {activeVariant?.label} — Axial Q ×{activeVariant?.axialQScale} · Direct ×{activeVariant?.directScale}
                  <span style={{ fontWeight: 400, marginLeft: 10, color: '#57534e' }}>
                    Modal dominant at {fmt(activeData.dominancePct, 0)}% of frequencies · avg ratio {fmt(activeData.avgRatio, 2)}
                  </span>
                </div>
                <div style={{ overflowX: 'auto', marginBottom: 12 }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 700 }}>
                    <thead>
                      <tr>
                        <th style={{ ...THL, minWidth: 38 }}>Hz</th>
                        <th style={{ ...TH, minWidth: 56 }}>Direct dB</th>
                        <th style={{ ...TH, minWidth: 56 }}>Modal dB~</th>
                        <th style={{ ...TH, minWidth: 60 }}>Combined dB</th>
                        <th style={{ ...TH, minWidth: 56 }}>Δ M−D</th>
                        <th style={{ ...TH, minWidth: 60 }}>P_modal/P_direct</th>
                        <th style={{ ...TH, minWidth: 52 }}>Direct %</th>
                        <th style={{ ...TH, minWidth: 52 }}>Modal %</th>
                        <th style={{ ...TH, minWidth: 52 }}>vs REW</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeData.rows.map(row => (
                        <tr key={row.hz} style={{ borderBottom: '1px solid #1c1917' }}>
                          <td style={{ ...TDL, color: '#fbbf24', fontWeight: 700 }}>{row.hz} Hz</td>
                          <td style={{ ...TD, color: '#60a5fa' }}>{fmt(row.directSpl)}</td>
                          <td style={{ ...TD, color: '#c084fc' }}>{fmt(row.modalSpl)} <span style={{ fontSize: 8, color: '#44403c' }}>~</span></td>
                          <td style={{ ...TD, color: '#d6d3d1', fontWeight: 700 }}>{fmt(row.combinedSpl)}</td>
                          <td style={{ ...TD, color: row.modalMinusDirect > 0 ? '#fb923c' : '#86efac', fontWeight: 600 }}>
                            {fmtΔ(row.modalMinusDirect)}
                          </td>
                          <td style={{ ...TD, color: ratioColor(row.pressureRatio), fontWeight: 700 }}>
                            {Number.isFinite(row.pressureRatio) ? row.pressureRatio.toFixed(2) : '—'}
                          </td>
                          <td style={{ ...TD, color: '#60a5fa' }}>{fmt(row.directPct, 0)}%</td>
                          <td style={{ ...TD, color: ratioColor(row.pressureRatio) }}>{fmt(row.modalPct, 0)}%</td>
                          <td style={{ ...TD, color: errColor(row.errVsRew), fontWeight: 600 }}>
                            {fmtΔ(row.errVsRew)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ fontSize: 8, color: '#44403c', ...MONO, marginTop: 3 }}>
                    ~ Modal SPL is approximate: √(P_combined² − P_direct²). Accurate for uncorrelated paths; may underestimate for constructive interference.
                  </div>
                </div>
              </>
            )}

            {/* ── Ranked comparison table ── */}
            <div style={{ fontSize: 10, fontWeight: 700, color: '#fbbf24', ...MONO, marginBottom: 4 }}>
              Ranked: Which change most reduces modal dominance?
            </div>
            <div style={{ overflowX: 'auto', marginBottom: 12 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 400 }}>
                <thead>
                  <tr>
                    <th style={{ ...THL, minWidth: 22 }}>#</th>
                    <th style={{ ...THL, minWidth: 200 }}>Variant</th>
                    <th style={{ ...TH, minWidth: 80 }}>Avg P_m/P_d</th>
                    <th style={{ ...TH, minWidth: 100 }}>Modal dominant %</th>
                    <th style={{ ...THL, minWidth: 120 }}>Assessment</th>
                  </tr>
                </thead>
                <tbody>
                  {result.ranked.map((v, idx) => {
                    const data = result.byVariant[v.key];
                    const isProd = v.key === 'prod';
                    const isWinner = idx === 0;
                    return (
                      <tr key={v.key} style={{ borderBottom: '1px solid #1c1917', background: isWinner ? '#1a1a0d' : isProd ? '#111820' : 'transparent' }}>
                        <td style={{ ...TDL, color: isWinner ? '#fbbf24' : '#57534e', fontWeight: isWinner ? 700 : 400 }}>
                          {isWinner ? '★' : idx + 1}
                        </td>
                        <td style={{ ...TDL, color: '#d6d3d1' }}>{v.label}</td>
                        <td style={{ ...TD, color: ratioColor(v.avgRatio), fontWeight: 700 }}>
                          {fmt(v.avgRatio, 2)}
                        </td>
                        <td style={{ ...TD, color: v.dominancePct > 60 ? '#f87171' : v.dominancePct > 40 ? '#fbbf24' : '#4ade80' }}>
                          {fmt(v.dominancePct, 0)}%
                        </td>
                        <td style={{ ...TDL, color: '#78716c', fontSize: 8 }}>
                          {data?.dominancePct >= 60 ? 'Modal over-contributing'
                            : data?.dominancePct >= 40 ? 'Balanced region'
                            : 'Direct dominant'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── Interpretation ── */}
            <div style={{ fontSize: 10, fontWeight: 700, color: '#4ade80', ...MONO, marginBottom: 4 }}>
              Interpretation
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {messages && messages.map((m, i) => (
                <div key={i} style={{
                  padding: '7px 12px', background: '#1c1917', borderRadius: 5,
                  borderLeft: '3px solid #4ade80',
                  fontSize: 10, ...MONO, color: '#86efac', fontStyle: 'italic',
                }}>
                  {m}
                </div>
              ))}
              <div style={{
                padding: '7px 10px', background: '#1c1917', borderRadius: 5,
                borderLeft: '3px solid #57534e',
                fontSize: 9, ...MONO, color: '#78716c', lineHeight: 1.9,
              }}>
                Production avg ratio: <span style={{ color: ratioColor(result.byVariant.prod?.avgRatio), fontWeight: 700 }}>{fmt(result.byVariant.prod?.avgRatio, 2)}</span>
                &nbsp;·&nbsp;
                Best: <span style={{ color: '#fbbf24', fontWeight: 700 }}>{result.ranked[0]?.label}</span>
                {' '}(avg ratio {fmt(result.ranked[0]?.avgRatio, 2)})
                &nbsp;·&nbsp;
                Ratio colour: &lt;1.0 direct dominant · 1.0–1.5 balanced · &gt;1.5 modal dominant · &gt;2.5 heavily modal
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}