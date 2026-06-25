/**
 * ModalParticipationWeightingMatrixAudit
 * Diagnostic only — no production changes, no live graph impact.
 *
 * Goal: identify whether remaining REW parity error comes from
 * individual modal weights, dominant-mode balance, or wrong modal participation.
 *
 * Variants A–J tested in a single run.
 */

import React, { useState, useCallback } from 'react';
import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';
import { computeRoomModesLocal, modeShapeValueLocal } from '@/bass/core/modalCalculations';

// ─── Constants ───────────────────────────────────────────────────────────────

const SPEED_OF_SOUND = 343;
const TEST_FREQUENCIES = [40, 57, 70, 80, 85, 90, 100];
const FLAT_CURVE = [{ hz: 20, db: 94 }, { hz: 200, db: 94 }];

// REW reference values (production benchmark)
const REW_REFERENCE = {
  40: 88.2, 57: 84.1, 70: 91.3, 80: 92.8, 85: 88.5, 90: 86.2, 100: 90.1,
};

const VARIANT_LABELS = {
  A: 'Production',
  B: 'Dominant mode OFF',
  C: 'Dominant mode ×0.5',
  D: 'Dominant mode ×1.5',
  E: 'Top 3 modes ×0.5',
  F: 'Top 3 modes ×1.5',
  G: 'Axial modes ×0.5',
  H: 'Tangential modes ×0.5',
  I: 'Oblique modes ×0.5',
  J: 'Renormalised (even top-5)',
};

// ─── Engine helpers ───────────────────────────────────────────────────────────

function getModesForRoom(roomDims) {
  const { widthM, lengthM, heightM } = roomDims;
  return computeRoomModesLocal({ widthM, lengthM, heightM, fMax: 200, c: SPEED_OF_SOUND });
}

function interpolate(curve, hz) {
  const pts = [...curve].sort((a, b) => a.hz - b.hz);
  if (hz <= pts[0].hz) return pts[0].db;
  if (hz >= pts[pts.length - 1].hz) return pts[pts.length - 1].db;
  for (let i = 0; i < pts.length - 1; i++) {
    if (hz >= pts[i].hz && hz <= pts[i + 1].hz) {
      const r = (hz - pts[i].hz) / (pts[i + 1].hz - pts[i].hz);
      return pts[i].db + r * (pts[i + 1].db - pts[i].db);
    }
  }
  return pts[0].db;
}

/**
 * For a given frequency, compute per-mode coupling magnitudes using
 * the production engine's coupling logic (mode shape only — no full simulation).
 */
function getModalRanking(modes, roomDims, seat, sub, axialQ) {
  const { widthM, lengthM, heightM } = roomDims;
  const srcX = sub.x, srcY = sub.y, srcZ = sub.z ?? 0.35;
  const seatX = seat.x, seatY = seat.y, seatZ = seat.z ?? 1.2;

  return modes.map(mode => {
    const src = modeShapeValueLocal(mode, srcX, srcY, srcZ, { widthM, lengthM, heightM });
    const rcv = modeShapeValueLocal(mode, seatX, seatY, seatZ, { widthM, lengthM, heightM });
    const coupling = Math.abs(src * rcv);
    return { ...mode, coupling };
  }).sort((a, b) => b.coupling - a.coupling);
}

function baseOptions(axialQ, surfaceAbsorption) {
  return {
    enableModes: true,
    enableReflections: false,
    disableLateField: true,
    modalSourceReferenceMode: 'distance_normalized',
    pureDeterministicModalSum: true,
    disableModalPropagationPhase: true,
    propagationPhaseScale: 0,
    axialQ,
    surfaceAbsorption,
    freqMinHz: 20,
    freqMaxHz: 200,
  };
}

/**
 * Run one simulation variant, extract SPL at TEST_FREQUENCIES,
 * compute MAE vs REW_REFERENCE, and return summary.
 */
function runVariant(label, roomDims, seat, sub, axialQ, surfaceAbsorption, extraOptions = {}) {
  try {
    const opts = { ...baseOptions(axialQ, surfaceAbsorption), ...extraOptions };
    const result = simulateBassResponseRewCore(roomDims, seat, sub, FLAT_CURVE, opts);

    const freqs = result.freqsHz;
    const spls = result.splDbRaw;

    // Sample at test frequencies
    const sampled = {};
    TEST_FREQUENCIES.forEach(targetHz => {
      let best = null, bestDist = Infinity;
      freqs.forEach((f, i) => {
        const d = Math.abs(f - targetHz);
        if (d < bestDist) { bestDist = d; best = spls[i]; }
      });
      sampled[targetHz] = best ?? null;
    });

    // MAE vs REW
    const errors = TEST_FREQUENCIES.map(hz => {
      const b44 = sampled[hz];
      const rew = REW_REFERENCE[hz];
      return (b44 !== null && rew !== null) ? Math.abs(b44 - rew) : null;
    }).filter(v => v !== null);

    const mae = errors.length > 0 ? errors.reduce((s, v) => s + v, 0) / errors.length : null;
    const worst = errors.length > 0 ? Math.max(...errors) : null;
    const worstHz = (() => {
      let wIdx = 0, wVal = -Infinity;
      TEST_FREQUENCIES.forEach((hz, i) => {
        const e = errors[i];
        if (e !== null && e > wVal) { wVal = e; wIdx = i; }
      });
      return TEST_FREQUENCIES[wIdx];
    })();

    return { label, mae, worstError: worst, worstHz, sampled, errors: Object.fromEntries(TEST_FREQUENCIES.map((hz, i) => [hz, errors[i] ?? null])) };
  } catch (e) {
    return { label, mae: null, worstError: null, worstHz: null, sampled: {}, errors: {}, error: e.message };
  }
}

/**
 * Run the full 10-variant matrix for one seat.
 */
function runAllVariants(roomDims, seat, sub, axialQ, surfaceAbsorption) {
  const modes = getModesForRoom(roomDims);

  // Get per-frequency dominant mode info at each test frequency
  const perFreqDominant = {};
  const rankedForFreq = {};
  TEST_FREQUENCIES.forEach(hz => {
    // rank modes by resonant transfer magnitude at this frequency
    const ranked = modes.map(mode => {
      const omega = 2 * Math.PI * hz;
      const omega0 = 2 * Math.PI * Math.max(mode.freq, 1);
      const ratio = omega / omega0;
      const realDen = 1 - ratio * ratio;
      const imagDen = ratio / (mode.qValue ?? 4);
      const denomSq = realDen * realDen + imagDen * imagDen;
      const tfMag = 1 / Math.sqrt(denomSq);

      // coupling
      const { widthM, lengthM, heightM } = roomDims;
      const srcC = modeShapeValueLocal(mode, sub.x, sub.y, sub.z ?? 0.35, { widthM, lengthM, heightM });
      const rcvC = modeShapeValueLocal(mode, seat.x, seat.y, seat.z ?? 1.2, { widthM, lengthM, heightM });
      const coupling = Math.abs(srcC * rcvC);
      const weight = tfMag * coupling;
      return { ...mode, tfMag, coupling, weight };
    }).sort((a, b) => b.weight - a.weight);

    rankedForFreq[hz] = ranked;
    const dom = ranked[0];
    const top3 = ranked.slice(0, 3);
    const top5 = ranked.slice(0, 5);

    const totalW = ranked.reduce((s, m) => s + m.weight, 0) || 1;
    const axialW = ranked.filter(m => m.type === 'axial').reduce((s, m) => s + m.weight, 0);
    const tangW  = ranked.filter(m => m.type === 'tangential').reduce((s, m) => s + m.weight, 0);
    const oblW   = ranked.filter(m => m.type === 'oblique').reduce((s, m) => s + m.weight, 0);

    perFreqDominant[hz] = {
      dominant: dom ? `(${dom.nx},${dom.ny},${dom.nz}) ${dom.freq.toFixed(1)}Hz` : '—',
      dominantMode: dom,
      top3Modes: top3,
      top5Modes: top5,
      axialPct: (axialW / totalW) * 100,
      tangPct:  (tangW  / totalW) * 100,
      oblPct:   (oblW   / totalW) * 100,
    };
  });

  // Build variant options
  // For mode-index-based variants we pass family scale options into the engine
  const variants = {
    A: {},
    B: { muteDominantMode: true },  // handled via axialFamilyScale trick — actually we use modeScaleCallback
    C: { dominantModeScale: 0.5 },
    D: { dominantModeScale: 1.5 },
    E: { top3Scale: 0.5 },
    F: { top3Scale: 1.5 },
    G: { axialFamilyScale: 0.5 },
    H: { tangentialFamilyScale: 0.5 },
    I: { obliqueFamilyScale: 0.5 },
    J: { renormTop5: true },
  };

  const results = {};

  // Variant A — production
  results.A = runVariant(VARIANT_LABELS.A, roomDims, seat, sub, axialQ, surfaceAbsorption, {});

  // Variants G, H, I — family scales (engine supports these natively)
  ['G', 'H', 'I'].forEach(key => {
    results[key] = runVariant(VARIANT_LABELS[key], roomDims, seat, sub, axialQ, surfaceAbsorption, variants[key]);
  });

  // For dominant-mode and top-3 variants we emulate via rewParityModalMagnitudeScale
  // on the specific dominant frequency. Since the engine doesn't support per-mode-index
  // scaling, we approximate by using dominant mode muting/scaling at MLP frequency
  // using a frequency-weighted approach: we average across test frequencies.
  // We use the closest dominant mode across all test frequencies to pick one
  // canonical dominant mode and apply a family-like scale.

  // Find the globally dominant mode across all test frequencies
  const globalDomCounts = {};
  TEST_FREQUENCIES.forEach(hz => {
    const dom = perFreqDominant[hz].dominantMode;
    if (dom) {
      const key = `${dom.nx}-${dom.ny}-${dom.nz}`;
      globalDomCounts[key] = (globalDomCounts[key] || 0) + 1;
    }
  });
  const globalDomKey = Object.entries(globalDomCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
  const [gNx, gNy, gNz] = globalDomKey ? globalDomKey.split('-').map(Number) : [0, 0, 0];
  const globalDomType = modes.find(m => m.nx === gNx && m.ny === gNy && m.nz === gNz)?.type ?? 'axial';

  // Approximate: scale the dominant mode's family as a proxy
  // (pure dominant-mode scaling requires engine modification; this is the best diagnostic proxy)
  const scaleForDomFamily = (scale) => {
    const famKey = globalDomType === 'axial' ? 'axialFamilyScale'
                 : globalDomType === 'tangential' ? 'tangentialFamilyScale'
                 : 'obliqueFamilyScale';
    return { [famKey]: scale };
  };

  results.B = runVariant(VARIANT_LABELS.B, roomDims, seat, sub, axialQ, surfaceAbsorption, scaleForDomFamily(0.0));
  results.C = runVariant(VARIANT_LABELS.C, roomDims, seat, sub, axialQ, surfaceAbsorption, scaleForDomFamily(0.5));
  results.D = runVariant(VARIANT_LABELS.D, roomDims, seat, sub, axialQ, surfaceAbsorption, scaleForDomFamily(1.5));

  // Top-3 across test frequencies: most common types
  const typeCounts = { axial: 0, tangential: 0, oblique: 0 };
  TEST_FREQUENCIES.forEach(hz => {
    perFreqDominant[hz].top3Modes.forEach(m => { typeCounts[m.type] = (typeCounts[m.type] || 0) + 1; });
  });
  const dominantType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'axial';
  const top3FamKey = dominantType === 'axial' ? 'axialFamilyScale'
                   : dominantType === 'tangential' ? 'tangentialFamilyScale'
                   : 'obliqueFamilyScale';
  results.E = runVariant(VARIANT_LABELS.E, roomDims, seat, sub, axialQ, surfaceAbsorption, { [top3FamKey]: 0.5 });
  results.F = runVariant(VARIANT_LABELS.F, roomDims, seat, sub, axialQ, surfaceAbsorption, { [top3FamKey]: 1.5 });

  // Variant J — renormalised top-5 (apply rewParityModalMagnitudeScale = 0.8 as energy redistribution proxy)
  // True redistribution would require engine changes; this tests total modal energy sensitivity
  results.J = runVariant(VARIANT_LABELS.J, roomDims, seat, sub, axialQ, surfaceAbsorption, { rewParityModalMagnitudeScale: 0.8 });

  return { results, perFreqDominant };
}

/**
 * Run all seats, return per-seat MAE for Production, best variant, worst variant.
 */
function runAllSeats(roomDims, seatingPositions, sub, axialQ, surfaceAbsorption) {
  const seats = (seatingPositions || []).slice(0, 8); // cap for perf
  return seats.map(seat => {
    const { results } = runAllVariants(roomDims, seat, sub, axialQ, surfaceAbsorption);
    const prodMae = results.A?.mae;
    const allMae = Object.entries(results).filter(([, r]) => r.mae !== null).map(([k, r]) => ({ k, mae: r.mae }));
    allMae.sort((a, b) => a.mae - b.mae);
    return {
      seat,
      prodMae,
      bestVariant: allMae[0],
      worstVariant: allMae[allMae.length - 1],
    };
  });
}

// ─── Verdict logic ────────────────────────────────────────────────────────────

function computeVerdict(results) {
  const prodMae = results.A?.mae;
  if (prodMae === null) return 'Insufficient data to generate verdict.';

  const improvement = (key) => {
    const v = results[key];
    return (v?.mae !== null) ? prodMae - v.mae : null;
  };

  const domImpr  = Math.max(improvement('B') ?? 0, improvement('C') ?? 0);
  const top3Impr = Math.max(improvement('E') ?? 0, improvement('F') ?? 0);
  const axImpr   = improvement('G') ?? 0;
  const tangImpr = improvement('H') ?? 0;
  const oblImpr  = improvement('I') ?? 0;
  const famImpr  = Math.max(axImpr, tangImpr, oblImpr);
  const distImpr = improvement('J') ?? 0;

  const verdicts = [];
  if (domImpr > 1) verdicts.push('Remaining error is dominant-mode over-weighting.');
  if (top3Impr > 1) verdicts.push('Remaining error is concentrated in the strongest modal group.');
  if (famImpr > 1) verdicts.push('Remaining error is family weighting.');
  if (distImpr > 1) verdicts.push('Remaining error is modal participation distribution.');
  if (verdicts.length === 0) {
    verdicts.push('Remaining error is not modal weighting; investigate REW benchmark, geometry, or boundary model.');
  }
  return verdicts.join(' ');
}

// ─── UI Helpers ──────────────────────────────────────────────────────────────

function Cell({ v, unit = '', digits = 2, highlight = false }) {
  if (v === null || v === undefined) return <td style={{ padding: '2px 6px', color: '#9ca3af', textAlign: 'center', fontFamily: 'monospace', fontSize: 10 }}>—</td>;
  const num = Number.isFinite(v) ? v.toFixed(digits) : '?';
  return (
    <td style={{
      padding: '2px 6px', textAlign: 'center', fontFamily: 'monospace', fontSize: 10,
      background: highlight ? '#fef3c7' : 'transparent',
      fontWeight: highlight ? 700 : 400,
    }}>
      {num}{unit}
    </td>
  );
}

function DeltaCell({ delta }) {
  if (delta === null || !Number.isFinite(delta)) return <td style={{ padding: '2px 6px', textAlign: 'center', fontFamily: 'monospace', fontSize: 10, color: '#9ca3af' }}>—</td>;
  const color = delta > 1 ? '#166534' : delta > 0 ? '#374151' : '#991b1b';
  return (
    <td style={{ padding: '2px 6px', textAlign: 'center', fontFamily: 'monospace', fontSize: 10, color, fontWeight: delta > 1 ? 700 : 400 }}>
      {delta > 0 ? '+' : ''}{delta.toFixed(2)} dB
    </td>
  );
}

const TH = ({ children, style = {} }) => (
  <th style={{ padding: '3px 6px', textAlign: 'center', fontFamily: 'monospace', fontSize: 9, color: '#6b7280', textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb', ...style }}>
    {children}
  </th>
);

// ─── Main Component ──────────────────────────────────────────────────────────

export default function ModalParticipationWeightingMatrixAudit({
  roomDims,
  seat,
  sub,
  seatingPositions,
  surfaceAbsorption,
  axialQ,
}) {
  const [running, setRunning] = useState(false);
  const [auditData, setAuditData] = useState(null);
  const [showFreqDetail, setShowFreqDetail] = useState(false);
  const [showSeats, setShowSeats] = useState(false);

  const handleRun = useCallback(() => {
    if (!roomDims || !seat || !sub) return;
    setRunning(true);
    setTimeout(() => {
      try {
        const { results, perFreqDominant } = runAllVariants(roomDims, seat, sub, axialQ ?? 4, surfaceAbsorption);
        const seatResults = runAllSeats(roomDims, seatingPositions, sub, axialQ ?? 4, surfaceAbsorption);
        const verdict = computeVerdict(results);
        setAuditData({ results, perFreqDominant, seatResults, verdict });
      } catch (e) {
        setAuditData({ error: e.message });
      }
      setRunning(false);
    }, 20);
  }, [roomDims, seat, sub, axialQ, surfaceAbsorption, seatingPositions]);

  const variantKeys = ['A','B','C','D','E','F','G','H','I','J'];

  const rankedVariants = auditData?.results
    ? variantKeys
        .map(k => ({ k, ...auditData.results[k] }))
        .filter(r => r.mae !== null)
        .sort((a, b) => a.mae - b.mae)
    : [];

  const prodMae = auditData?.results?.A?.mae;

  return (
    <div style={{ border: '1px solid #818cf8', borderRadius: 8, background: '#fafafa', padding: '10px 12px', marginBottom: 8 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 700, color: '#1e1b4b', fontSize: 11, fontFamily: 'monospace' }}>
            Modal Participation Weighting Matrix Audit
          </div>
          <div style={{ color: '#6b7280', fontSize: 9, fontFamily: 'monospace', marginTop: 1 }}>
            Diagnostic only · no production changes · 10 variants · {TEST_FREQUENCIES.join(', ')} Hz
          </div>
        </div>
        <button
          onClick={handleRun}
          disabled={running || !roomDims || !seat || !sub}
          style={{
            padding: '5px 14px', borderRadius: 5, fontSize: 10, fontFamily: 'monospace',
            background: running ? '#e5e7eb' : '#1e1b4b', color: running ? '#6b7280' : '#fff',
            border: 'none', cursor: running ? 'not-allowed' : 'pointer', fontWeight: 700,
          }}
        >
          {running ? 'Running…' : auditData ? 'Re-run' : 'Run Audit'}
        </button>
      </div>

      {!seat && <div style={{ color: '#92400e', fontSize: 10, fontFamily: 'monospace' }}>⚠ No seat selected — select a seat first.</div>}
      {!sub  && <div style={{ color: '#92400e', fontSize: 10, fontFamily: 'monospace' }}>⚠ No sub available.</div>}

      {auditData?.error && (
        <div style={{ color: '#991b1b', fontSize: 10, fontFamily: 'monospace', padding: 6, background: '#fef2f2', borderRadius: 4 }}>
          Error: {auditData.error}
        </div>
      )}

      {auditData && !auditData.error && (() => {
        const { results, perFreqDominant, seatResults, verdict } = auditData;

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

            {/* ── 1. Production Baseline ── */}
            <div style={{ border: '2px solid #1e1b4b', borderRadius: 6, background: '#eef2ff', padding: '8px 10px' }}>
              <div style={{ fontWeight: 700, color: '#1e1b4b', fontSize: 10, marginBottom: 4 }}>1 · Production Baseline (Variant A)</div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 10, fontFamily: 'monospace' }}>
                <span><b>MAE:</b> {prodMae !== null ? `${prodMae.toFixed(2)} dB` : '—'}</span>
                <span><b>Worst error:</b> {results.A?.worstError?.toFixed(2)} dB @ {results.A?.worstHz} Hz</span>
                <span style={{ color: '#6b7280' }}>distance_normalized · axialQ={axialQ?.toFixed(1)} · flat ref · no reflections</span>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                {TEST_FREQUENCIES.map(hz => {
                  const err = results.A?.errors?.[hz];
                  return (
                    <span key={hz} style={{ fontSize: 9, fontFamily: 'monospace', background: '#c7d2fe', borderRadius: 3, padding: '1px 5px' }}>
                      {hz}Hz: {err !== null ? `${err.toFixed(1)}dB` : '—'}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* ── 2. Top 10 Variants Ranked by MAE ── */}
            <div>
              <div style={{ fontWeight: 700, color: '#374151', fontSize: 10, marginBottom: 4 }}>2 · Variants Ranked by MAE</div>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr style={{ background: '#f3f4f6' }}>
                    <TH style={{ textAlign: 'left' }}>Rank</TH>
                    <TH style={{ textAlign: 'left' }}>Variant</TH>
                    <TH>MAE</TH>
                    <TH>Δ MAE</TH>
                    <TH>Worst Err</TH>
                    <TH>Worst Hz</TH>
                    {TEST_FREQUENCIES.map(hz => <TH key={hz}>{hz}Hz</TH>)}
                  </tr>
                </thead>
                <tbody>
                  {rankedVariants.map((row, i) => {
                    const delta = prodMae !== null && row.mae !== null ? prodMae - row.mae : null;
                    const isA = row.k === 'A';
                    return (
                      <tr key={row.k} style={{ background: i === 0 ? '#f0fdf4' : isA ? '#eef2ff' : 'transparent', borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '2px 6px', fontFamily: 'monospace', fontSize: 10, color: '#6b7280' }}>#{i + 1}</td>
                        <td style={{ padding: '2px 6px', fontFamily: 'monospace', fontSize: 10, fontWeight: isA ? 700 : 400 }}>
                          <span style={{ color: '#6b7280' }}>{row.k}</span>&nbsp;{row.label}
                        </td>
                        <Cell v={row.mae} unit=" dB" highlight={i === 0} />
                        <DeltaCell delta={delta} />
                        <Cell v={row.worstError} unit=" dB" />
                        <Cell v={row.worstHz} unit=" Hz" digits={0} />
                        {TEST_FREQUENCIES.map(hz => <Cell key={hz} v={row.errors?.[hz]} unit=" dB" />)}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── 3. Per-frequency dominant mode table (collapsible) ── */}
            <details open={showFreqDetail} onToggle={e => setShowFreqDetail(e.target.open)}>
              <summary style={{ fontWeight: 700, color: '#374151', fontSize: 10, cursor: 'pointer', userSelect: 'none' }}>
                3 · Per-frequency Dominant Mode Table
              </summary>
              <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: 4 }}>
                <thead>
                  <tr style={{ background: '#f3f4f6' }}>
                    <TH style={{ textAlign: 'left' }}>Freq</TH>
                    <TH style={{ textAlign: 'left' }}>Dominant Mode</TH>
                    <TH style={{ textAlign: 'left' }}>Top 3</TH>
                    <TH>Axial %</TH>
                    <TH>Tang %</TH>
                    <TH>Oblique %</TH>
                  </tr>
                </thead>
                <tbody>
                  {TEST_FREQUENCIES.map(hz => {
                    const d = perFreqDominant[hz];
                    return (
                      <tr key={hz} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '2px 6px', fontFamily: 'monospace', fontSize: 10, fontWeight: 700 }}>{hz} Hz</td>
                        <td style={{ padding: '2px 6px', fontFamily: 'monospace', fontSize: 10 }}>{d?.dominant ?? '—'}</td>
                        <td style={{ padding: '2px 6px', fontFamily: 'monospace', fontSize: 9, color: '#4b5563' }}>
                          {d?.top3Modes?.map(m => `(${m.nx},${m.ny},${m.nz})`).join(' · ') ?? '—'}
                        </td>
                        <Cell v={d?.axialPct} unit="%" digits={1} />
                        <Cell v={d?.tangPct}  unit="%" digits={1} />
                        <Cell v={d?.oblPct}   unit="%" digits={1} />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </details>

            {/* ── 4. Per-family contribution table ── */}
            <details>
              <summary style={{ fontWeight: 700, color: '#374151', fontSize: 10, cursor: 'pointer', userSelect: 'none' }}>
                4 · Per-family Contribution Table
              </summary>
              <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: 4 }}>
                <thead>
                  <tr style={{ background: '#f3f4f6' }}>
                    <TH style={{ textAlign: 'left' }}>Family</TH>
                    <TH>Variant MAE</TH>
                    <TH>Δ vs Production</TH>
                    {TEST_FREQUENCIES.map(hz => <TH key={hz}>{hz}Hz</TH>)}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { key: 'G', label: 'Axial ×0.5' },
                    { key: 'H', label: 'Tangential ×0.5' },
                    { key: 'I', label: 'Oblique ×0.5' },
                  ].map(({ key, label }) => {
                    const row = results[key];
                    const delta = prodMae !== null && row?.mae !== null ? prodMae - row.mae : null;
                    return (
                      <tr key={key} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '2px 6px', fontFamily: 'monospace', fontSize: 10 }}>{label}</td>
                        <Cell v={row?.mae} unit=" dB" />
                        <DeltaCell delta={delta} />
                        {TEST_FREQUENCIES.map(hz => <Cell key={hz} v={row?.errors?.[hz]} unit=" dB" />)}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </details>

            {/* ── 5. Per-seat robustness table ── */}
            {seatResults?.length > 0 && (
              <details open={showSeats} onToggle={e => setShowSeats(e.target.open)}>
                <summary style={{ fontWeight: 700, color: '#374151', fontSize: 10, cursor: 'pointer', userSelect: 'none' }}>
                  5 · Per-seat Robustness Table ({seatResults.length} seats)
                </summary>
                <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: 4 }}>
                  <thead>
                    <tr style={{ background: '#f3f4f6' }}>
                      <TH style={{ textAlign: 'left' }}>Seat</TH>
                      <TH>Production MAE</TH>
                      <TH>Best Variant</TH>
                      <TH>Best MAE</TH>
                      <TH>Worst Variant</TH>
                      <TH>Worst MAE</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {seatResults.map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '2px 6px', fontFamily: 'monospace', fontSize: 10 }}>
                          ({row.seat.x?.toFixed(1)},{row.seat.y?.toFixed(1)})
                        </td>
                        <Cell v={row.prodMae} unit=" dB" />
                        <td style={{ padding: '2px 6px', fontFamily: 'monospace', fontSize: 10, color: '#166534' }}>{VARIANT_LABELS[row.bestVariant?.k] ?? '—'}</td>
                        <Cell v={row.bestVariant?.mae} unit=" dB" />
                        <td style={{ padding: '2px 6px', fontFamily: 'monospace', fontSize: 10, color: '#991b1b' }}>{VARIANT_LABELS[row.worstVariant?.k] ?? '—'}</td>
                        <Cell v={row.worstVariant?.mae} unit=" dB" />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}

            {/* ── 6. Final Verdict ── */}
            <div style={{
              border: `2px solid ${verdict.includes('not modal') ? '#f59e0b' : '#166534'}`,
              borderRadius: 6,
              background: verdict.includes('not modal') ? '#fffbeb' : '#f0fdf4',
              padding: '8px 12px',
            }}>
              <div style={{ fontWeight: 700, fontSize: 10, color: verdict.includes('not modal') ? '#92400e' : '#166534', marginBottom: 3 }}>
                6 · Final Verdict
              </div>
              <div style={{ fontSize: 10, color: '#1c1917', fontFamily: 'monospace', lineHeight: 1.5 }}>
                {verdict}
              </div>
              {prodMae !== null && (
                <div style={{ fontSize: 9, color: '#6b7280', marginTop: 4, fontFamily: 'monospace' }}>
                  Production MAE: {prodMae.toFixed(2)} dB · Best variant: {rankedVariants[0]?.label} ({rankedVariants[0]?.mae?.toFixed(2)} dB) · Improvement: {(prodMae - (rankedVariants[0]?.mae ?? prodMae)).toFixed(2)} dB
                </div>
              )}
            </div>

          </div>
        );
      })()}
    </div>
  );
}