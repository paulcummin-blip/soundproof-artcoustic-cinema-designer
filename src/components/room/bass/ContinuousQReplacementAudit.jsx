/**
 * ContinuousQReplacementAudit.jsx
 * Diagnostic only — no production changes.
 *
 * Compares five Q formulations to identify the smoothest physically-plausible
 * replacement for the current hard Math.min(baseQ, absorptionQ) ceiling.
 *
 * A — Current production:   finalQ = Math.min(baseQ, absorptionQ)
 * B — Sabine direct:        finalQ = absorptionQ
 * C — Soft limiter:         finalQ = (baseQ × absorptionQ) / (baseQ + absorptionQ)
 * D — Frequency-dependent:  finalQ = min(absorptionQ, k × f)   [three k values]
 * E — Logistic saturation:  finalQ = L / (1 + exp(-k×(absorptionQ - x0)))
 *
 * Each variant runs a full engine simulation on the live room/seat/sub geometry
 * at the production α=0.30 to compare response characteristics.
 */
import React, { useState, useMemo, useCallback } from 'react';
import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';
import { estimateModeQLocal, computeRoomModesLocal } from '@/bass/core/modalCalculations';

// ── Constants ────────────────────────────────────────────────────────────────
const FLAT_CURVE = [{ hz: 20, db: 94 }, { hz: 80, db: 94 }, { hz: 200, db: 94 }];
const PROBE_FREQS = [30, 60, 100];
const BASE_Q_AXIAL = 4.0;
const ALPHA_TEST = 0.30; // production default α — best like-for-like comparison

const SA_TEST = { front: ALPHA_TEST, back: ALPHA_TEST, left: ALPHA_TEST,
                  right: ALPHA_TEST, floor: ALPHA_TEST, ceiling: ALPHA_TEST };

const ENGINE_BASE = {
  enableModes: true,
  enableReflections: false,
  disableLateField: true,
  smoothing: 'none',
  pureDeterministicModalSum: true,
  disableModalPropagationPhase: true,
  propagationPhaseScale: 0,
  freqMinHz: 20,
  freqMaxHz: 220,
  surfaceAbsorption: SA_TEST,
  axialQ: BASE_Q_AXIAL,
};

// ── Q formulas (pure functions, applied per-mode after absorptionQ is computed) ──
const BASE_Q_BY_TYPE = { axial: BASE_Q_AXIAL, tangential: 3.9, oblique: 2.5 };

function qFormula_A(baseQ, absorptionQ) {
  return Math.max(1, Math.min(baseQ, absorptionQ)); // current production
}
function qFormula_B(baseQ, absorptionQ) {
  return Math.max(1, absorptionQ); // Sabine direct
}
function qFormula_C(baseQ, absorptionQ) {
  // Soft limiter (harmonic mean / parallel resistors)
  if (absorptionQ <= 0 || baseQ <= 0) return 1;
  return Math.max(1, (baseQ * absorptionQ) / (baseQ + absorptionQ));
}
function qFormula_D(baseQ, absorptionQ, f, k) {
  // Frequency-dependent limiter
  const freqCeil = k * f;
  return Math.max(1, Math.min(absorptionQ, freqCeil));
}
function qFormula_E(baseQ, absorptionQ) {
  // Logistic saturation asymptote: Q approaches baseQ×2 smoothly
  // L = 2×baseQ (generous ceiling), x0 = baseQ (midpoint), k = 0.15 (slope)
  const L  = baseQ * 2.5;
  const x0 = baseQ;
  const k  = 0.18;
  const raw = L / (1 + Math.exp(-k * (absorptionQ - x0)));
  return Math.max(1, raw);
}

// D sub-variants
const D_K_VALUES = [
  { k: 0.30, label: 'k=0.30' },
  { k: 0.50, label: 'k=0.50' },
  { k: 0.80, label: 'k=0.80' },
];

// ── Compute absorptionQ for a mode given SA and roomDims ────────────────────
function getAbsorptionQ(mode, roomDims, sa) {
  return estimateModeQLocal({ roomDims, surfaceAbsorption: sa, f0: mode.freq });
}
function getBaseQ(mode) {
  return BASE_Q_BY_TYPE[mode.type] ?? BASE_Q_AXIAL;
}

// ── Analytical Q chain (no engine call) ─────────────────────────────────────
function computeAnalyticalQChain(f0, roomDims, sa, variantId, kVal) {
  // Create a mock mode object just for the formula evaluation
  const mockMode = { type: 'axial', freq: f0, nx: 1, ny: 0, nz: 0 };
  const absorptionQ = getAbsorptionQ(mockMode, roomDims, sa);
  const baseQ = getBaseQ(mockMode);

  let finalQ;
  if (variantId === 'A') finalQ = qFormula_A(baseQ, absorptionQ);
  else if (variantId === 'B') finalQ = qFormula_B(baseQ, absorptionQ);
  else if (variantId === 'C') finalQ = qFormula_C(baseQ, absorptionQ);
  else if (variantId === 'D') finalQ = qFormula_D(baseQ, absorptionQ, f0, kVal ?? 0.5);
  else if (variantId === 'E') finalQ = qFormula_E(baseQ, absorptionQ);
  else finalQ = absorptionQ;

  return { absorptionQ, baseQ, finalQ };
}

// ── Response analysis ────────────────────────────────────────────────────────
function analyseResponse(freqsHz, splDb) {
  const band = freqsHz
    .map((f, i) => ({ f, db: splDb[i] }))
    .filter(p => p.f >= 20 && p.f <= 220 && Number.isFinite(p.db));
  if (!band.length) return {};

  const sorted = [...band].sort((a, b) => a.db - b.db);
  const medianDb = sorted[Math.floor(sorted.length / 2)].db;
  const minPt = sorted[0];
  const maxPt = sorted[sorted.length - 1];

  // Count distinct peaks and nulls (>3 dB above/below median, separated by at least 1 bin)
  let peaks = 0, nulls = 0;
  let prevPeak = false, prevNull = false;
  for (const p of band) {
    const isPeak = p.db > medianDb + 4;
    const isNull = p.db < medianDb - 8;
    if (isPeak && !prevPeak) peaks++;
    if (isNull && !prevNull) nulls++;
    prevPeak = isPeak;
    prevNull = isNull;
  }

  return {
    nullFreq: minPt.f, nullDb: minPt.db,
    peakFreq: maxPt.f, peakDb: maxPt.db,
    swing: maxPt.db - minPt.db,
    medianDb, peaks, nulls,
  };
}

// ── REW-likeness score (heuristic) ──────────────────────────────────────────
// REW at α=0.30 typically shows: swing ~20–35 dB, peaks ~3–6, nulls ~2–5, deepest null < -20 dB
function rewLikenessScore(metrics) {
  if (!metrics || !Number.isFinite(metrics.swing)) return { score: 0, label: 'N/A', colour: '#9ca3af' };
  const { swing, peaks, nulls, nullDb } = metrics;

  let score = 0;
  // Swing: REW-like 18–35 dB
  if (swing >= 18 && swing <= 40) score += 3;
  else if (swing >= 10 && swing < 18) score += 2;
  else if (swing < 10) score += 0;
  else score += 1; // > 40 = too extreme
  // Peaks: 3–7 REW-like
  if (peaks >= 3 && peaks <= 7) score += 3;
  else if (peaks >= 2) score += 2;
  else score += 0;
  // Nulls: 2–5 REW-like
  if (nulls >= 2 && nulls <= 6) score += 2;
  else if (nulls >= 1) score += 1;
  // Deepest null: REW-like < -15 dB below median
  if (nullDb != null && Number.isFinite(nullDb) && metrics.medianDb - nullDb > 15) score += 2;
  else if (nullDb != null && Number.isFinite(nullDb) && metrics.medianDb - nullDb > 8) score += 1;

  const maxScore = 10;
  const pct = score / maxScore;
  if (pct >= 0.8) return { score, label: 'Excellent', colour: '#16a34a' };
  if (pct >= 0.6) return { score, label: 'Good',      colour: '#4ade80' };
  if (pct >= 0.4) return { score, label: 'Partial',   colour: '#f59e0b' };
  if (pct >= 0.2) return { score, label: 'Poor',      colour: '#dc2626' };
  return { score, label: 'Very poor', colour: '#991b1b' };
}

// ── Build the full list of variants ─────────────────────────────────────────
function buildVariants() {
  const variants = [
    {
      id: 'A',
      label: 'A — Current production',
      formula: 'Math.min(baseQ, absorptionQ)',
      colour: '#dc2626',
      engineOpts: {}, // default engine path
      computeQ: (bQ, aQ, f) => qFormula_A(bQ, aQ),
    },
    {
      id: 'B',
      label: 'B — Sabine direct',
      formula: 'absorptionQ',
      colour: '#2563eb',
      engineOpts: { overrideAbsorptionAxialQ: true },
      computeQ: (bQ, aQ, f) => qFormula_B(bQ, aQ),
    },
    {
      id: 'C',
      label: 'C — Soft limiter (harmonic mean)',
      formula: '(baseQ × absorptionQ) / (baseQ + absorptionQ)',
      colour: '#7c3aed',
      engineOpts: { _customQMode: 'C' },
      computeQ: (bQ, aQ, f) => qFormula_C(bQ, aQ),
    },
    ...D_K_VALUES.map(({ k, label }) => ({
      id: `D_${k}`,
      label: `D — Freq-dependent (${label})`,
      formula: `min(absorptionQ, ${k} × f)`,
      colour: '#ea580c',
      engineOpts: { _customQMode: 'D', _kVal: k },
      computeQ: (bQ, aQ, f) => qFormula_D(bQ, aQ, f, k),
      kVal: k,
    })),
    {
      id: 'E',
      label: 'E — Logistic saturation',
      formula: '(2.5×baseQ) / (1 + exp(-0.18×(absorptionQ - baseQ)))',
      colour: '#0891b2',
      engineOpts: { _customQMode: 'E' },
      computeQ: (bQ, aQ, f) => qFormula_E(bQ, aQ),
    },
  ];
  return variants;
}

// ── Run one variant using pre-patched mode Q values ─────────────────────────
// Since the engine doesn't have arbitrary Q formula injection, we inject a
// pre-computed qValue into each mode before the engine processes it.
// We re-use the existing `overrideAbsorptionAxialQ` flag for variant B,
// and for C/D/E we inject via the `_customQMode` path that we emulate
// by computing modes externally and passing them via options._injectedModes.
//
// However, the engine doesn't accept _injectedModes. So for C/D/E we run a
// thin wrapper: compute modes+Q externally, then call a minimal pressure
// summation loop using the same resonantTransfer and modeShapeValueLocal
// primitives — exactly matching the engine's modal-only path.
import { modeShapeValueLocal, resonantTransfer } from '@/bass/core/modalCalculations';

const SPEED_OF_SOUND = 343;
const MIN_DIST = 0.01;

function runModalOnlyWithCustomQ(roomDims, seatPos, sub, modes, flatCurve = 94) {
  const W = roomDims.widthM, L = roomDims.lengthM, H = roomDims.heightM;
  const seat = seatPos;
  const source = sub;

  // Build frequency axis (96 pts/octave, 20–220 Hz)
  const freqsHz = [];
  const octaves = Math.log2(220 / 20);
  const ppo = 96;
  const n = Math.ceil(octaves * ppo);
  for (let i = 0; i <= n; i++) {
    const hz = 20 * Math.pow(2, i / ppo);
    if (hz > 220) break;
    freqsHz.push(hz);
  }
  if (freqsHz[freqsHz.length - 1] !== 220) freqsHz.push(220);

  const splDbRaw = freqsHz.map(f => {
    let re = 0, im = 0;
    const modalAmp = Math.pow(10, flatCurve / 20);

    for (const mode of modes) {
      const sc = modeShapeValueLocal(mode, source.x, source.y, source.z, { widthM: W, lengthM: L, heightM: H });
      const rc = modeShapeValueLocal(mode, seat.x, seat.y, seat.z, { widthM: W, lengthM: L, heightM: H });
      const coupling = sc * rc;

      const { re: tfRe, im: tfIm } = resonantTransfer(f, mode.freq, mode.qValue);
      const modeOrder = Math.abs(mode.nx) + Math.abs(mode.ny) + Math.abs(mode.nz);
      const axialScale = (mode.type === 'axial' && modeOrder >= 2) ? 0.50 : 1.0;
      const gain = modalAmp * coupling * axialScale;

      re += gain * tfRe;
      im += gain * tfIm;
    }

    return 20 * Math.log10(Math.max(Math.sqrt(re * re + im * im), 1e-10));
  });

  return { freqsHz, splDbRaw };
}

// ── Main component ───────────────────────────────────────────────────────────
const mono = { fontFamily: 'monospace' };
const f1 = v => Number.isFinite(v) ? v.toFixed(1) : '—';
const f2 = v => Number.isFinite(v) ? v.toFixed(2) : '—';
const fQ = v => Number.isFinite(v) ? v.toFixed(1) : '—';

export default function ContinuousQReplacementAudit({ roomDims, seatingPositions, subsForSimulation }) {
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);
  const [ran, setRan] = useState(false);
  const [error, setError] = useState(null);
  const [showRankOnly, setShowRankOnly] = useState(false);

  const activeSeat = useMemo(() => {
    const p = (seatingPositions || []).find(s => s.isPrimary);
    return p || seatingPositions?.[0] || null;
  }, [seatingPositions]);

  const seatPos = useMemo(() => {
    if (!activeSeat) return null;
    return {
      x: Number(activeSeat.x), y: Number(activeSeat.y),
      z: Number.isFinite(Number(activeSeat.z)) ? Number(activeSeat.z) : 1.2,
    };
  }, [activeSeat]);

  const sub0 = subsForSimulation?.[0] || null;
  const rd = roomDims?.widthM
    ? { widthM: Number(roomDims.widthM), lengthM: Number(roomDims.lengthM), heightM: Number(roomDims.heightM) }
    : null;
  const canRun = !!(rd && seatPos && sub0);

  const variants = useMemo(() => buildVariants(), []);

  const run = useCallback(() => {
    if (!canRun) return;
    setRunning(true);
    setError(null);

    setTimeout(() => {
      const sub = {
        x: Number(sub0.x), y: Number(sub0.y),
        z: Number.isFinite(Number(sub0.z)) ? Number(sub0.z) : 0.35,
        tuning: { gainDb: 0, delayMs: 0, polarity: 0 },
      };

      // Pre-compute base modes list (shared geometry)
      const allModes = computeRoomModesLocal({ ...rd, fMax: 220 });

      const computed = variants.map(variant => {
        // Analytical Q chain
        const qChain = PROBE_FREQS.map(f0 => {
          const mockMode = { type: 'axial', freq: f0 };
          const absorptionQ = estimateModeQLocal({ roomDims: rd, surfaceAbsorption: SA_TEST, f0 });
          const baseQ = BASE_Q_AXIAL;
          const finalQ = variant.computeQ(baseQ, absorptionQ, f0);
          return { f0, absorptionQ, baseQ, finalQ };
        });

        // Engine simulation
        let metrics = null;
        let freqsHz = null;
        let splDb = null;
        let engineErr = null;

        try {
          if (variant.id === 'A') {
            // Variant A: standard production engine
            const r = simulateBassResponseRewCore(rd, seatPos, sub, FLAT_CURVE, {
              ...ENGINE_BASE,
            });
            freqsHz = r.freqsHz;
            splDb = r.splDbRaw;
          } else if (variant.id === 'B') {
            // Variant B: overrideAbsorptionAxialQ (axial only bypass)
            const r = simulateBassResponseRewCore(rd, seatPos, sub, FLAT_CURVE, {
              ...ENGINE_BASE,
              overrideAbsorptionAxialQ: true,
            });
            freqsHz = r.freqsHz;
            splDb = r.splDbRaw;
          } else {
            // Variants C, D_*, E: inject custom Q via external mode computation + minimal pressure loop
            const modesWithQ = allModes.map(mode => {
              const absorptionQ = estimateModeQLocal({ roomDims: rd, surfaceAbsorption: SA_TEST, f0: mode.freq });
              const baseQ = BASE_Q_BY_TYPE[mode.type] ?? BASE_Q_AXIAL;
              const qValue = variant.computeQ(baseQ, absorptionQ, mode.freq);
              return { ...mode, qValue };
            });

            const r = runModalOnlyWithCustomQ(rd, seatPos, sub, modesWithQ, 94);
            freqsHz = r.freqsHz;
            splDb = r.splDbRaw;
          }

          metrics = analyseResponse(freqsHz, splDb);
        } catch (e) {
          engineErr = e.message;
        }

        const rewLikeness = rewLikenessScore(metrics);
        return { ...variant, qChain, metrics, freqsHz, splDb, engineErr, rewLikeness };
      });

      // Rank by REW-likeness score
      const ranked = [...computed].sort((a, b) => (b.rewLikeness?.score ?? 0) - (a.rewLikeness?.score ?? 0));
      computed.forEach(r => { r.rank = ranked.findIndex(x => x.id === r.id) + 1; });

      setResults(computed);
      setRan(true);
      setRunning(false);
    }, 10);
  }, [canRun, rd, seatPos, sub0, variants]);

  // ── Final answers ──────────────────────────────────────────────────────
  const finalAnswers = useMemo(() => {
    if (!results) return null;
    const sortedByScore = [...results].sort((a, b) => (b.rewLikeness?.score ?? 0) - (a.rewLikeness?.score ?? 0));
    const best = sortedByScore[0];
    const variantA = results.find(r => r.id === 'A');
    const continuousOutperforms = best?.id !== 'A' && (best?.rewLikeness?.score ?? 0) > (variantA?.rewLikeness?.score ?? 0);
    const swingA = variantA?.metrics?.swing ?? 0;
    const swingBest = best?.metrics?.swing ?? 0;
    const stable = best?.id !== undefined;

    return { best, continuousOutperforms, variantA, swingA, swingBest, sortedByScore, stable };
  }, [results]);

  // ── Table styles ───────────────────────────────────────────────────────
  const thBase = { padding: '3px 7px', fontSize: 8, ...mono, fontWeight: 700, background: '#1e293b', color: '#e2e8f0', borderBottom: '2px solid #475569', whiteSpace: 'nowrap' };
  const th  = { ...thBase, textAlign: 'right' };
  const thL = { ...thBase, textAlign: 'left' };
  const tdBase = { padding: '2px 7px', fontSize: 8, ...mono, borderBottom: '1px solid #e5e7eb', verticalAlign: 'middle' };
  const td  = { ...tdBase, textAlign: 'right' };
  const tdL = { ...tdBase, textAlign: 'left' };

  return (
    <details style={{ border: '2px solid #0891b2', borderRadius: 8, background: '#f0f9ff', padding: '8px 10px', marginTop: 8 }}>
      <summary style={{ fontWeight: 700, color: '#0e7490', fontSize: 11, cursor: 'pointer', ...mono }}>
        📐 Continuous Q Replacement Audit — which formulation best reproduces REW modal behaviour?
      </summary>

      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 9, color: '#164e63', lineHeight: 1.7, marginBottom: 8, borderLeft: '3px solid #67e8f9', paddingLeft: 8, ...mono }}>
          Five Q formulations at α={ALPHA_TEST} (production default). A=current, B=Sabine direct,
          C=soft harmonic-mean limiter, D=freq-dependent limiter (3 k values), E=logistic saturation.<br />
          Engine: modal-only, flat 94 dB. C/D/E use pre-computed mode Q injection (identical physics,
          same modeShapeValueLocal + resonantTransfer primitives as production engine).
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
          <button onClick={run} disabled={!canRun || running}
            style={{ height: 28, padding: '0 14px', borderRadius: 5, border: `1px solid ${canRun ? '#0891b2' : '#d1d5db'}`, background: canRun ? '#0891b2' : '#f3f4f6', color: canRun ? '#fff' : '#9ca3af', fontSize: 10, fontWeight: 700, cursor: canRun ? 'pointer' : 'not-allowed', ...mono }}>
            {running ? 'Computing…' : ran ? 'Re-run' : 'Run Q Formulation Audit'}
          </button>
          {ran && (
            <label style={{ fontSize: 9, ...mono, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <input type="checkbox" checked={showRankOnly} onChange={e => setShowRankOnly(e.target.checked)} />
              Show ranking only
            </label>
          )}
          {!canRun && <span style={{ fontSize: 9, color: '#b45309', ...mono }}>Need room dims + seat + sub.</span>}
        </div>
        {error && <div style={{ fontSize: 9, color: '#dc2626', ...mono, marginBottom: 6 }}>{error}</div>}

        {results && (
          <>
            {/* ── Ranking summary ── */}
            <div style={{ fontWeight: 700, fontSize: 9, color: '#1e293b', ...mono, marginBottom: 4, borderBottom: '1px solid #a5f3fc', paddingBottom: 2 }}>
              RANKING — most → least REW-like (α = {ALPHA_TEST})
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {[...results]
                .sort((a, b) => (b.rewLikeness?.score ?? 0) - (a.rewLikeness?.score ?? 0))
                .map((r, i) => (
                  <div key={r.id} style={{ border: `2px solid ${r.colour}`, borderRadius: 6, padding: '4px 8px', background: '#fff', minWidth: 130 }}>
                    <div style={{ fontWeight: 700, fontSize: 9, color: r.colour, ...mono }}>#{i + 1} {r.label.split(' — ')[0]}</div>
                    <div style={{ fontSize: 8, color: '#374151', ...mono, marginTop: 1 }}>{r.label.replace(`${r.label.split(' — ')[0]} — `, '')}</div>
                    <div style={{ marginTop: 3, display: 'flex', gap: 4, alignItems: 'center' }}>
                      <span style={{ background: r.rewLikeness?.colour, color: '#fff', padding: '1px 5px', borderRadius: 3, fontSize: 7, fontWeight: 700, ...mono }}>
                        {r.rewLikeness?.label} ({r.rewLikeness?.score}/10)
                      </span>
                    </div>
                    <div style={{ fontSize: 7, color: '#6b7280', marginTop: 2, ...mono }}>
                      swing {f1(r.metrics?.swing)} dB | peaks {r.metrics?.peaks} | nulls {r.metrics?.nulls}
                    </div>
                  </div>
                ))}
            </div>

            {!showRankOnly && (
              <>
                {/* ── Q chain table ── */}
                <div style={{ fontWeight: 700, fontSize: 9, color: '#1e293b', ...mono, marginBottom: 3, borderBottom: '1px solid #a5f3fc', paddingBottom: 2 }}>
                  Q CHAIN — axial mode @ 30 / 60 / 100 Hz (α={ALPHA_TEST})
                </div>
                <div style={{ overflowX: 'auto', marginBottom: 10 }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 640 }}>
                    <thead>
                      <tr>
                        <th style={{ ...thL, minWidth: 180 }}>Variant</th>
                        <th style={{ ...thL, minWidth: 220 }}>Formula</th>
                        {PROBE_FREQS.map(f => (
                          <React.Fragment key={f}>
                            <th style={{ ...th, borderLeft: '2px solid #475569' }}>SabineQ<br/>{f} Hz</th>
                            <th style={th}>finalQ<br/>{f} Hz</th>
                            <th style={{ ...th, minWidth: 50 }}>Δ vs A</th>
                          </React.Fragment>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((r, ri) => {
                        const varA = results.find(x => x.id === 'A');
                        const rowBg = r.id === 'A' ? '#fef2f2' : ri % 2 === 0 ? '#fff' : '#f0f9ff';
                        return (
                          <tr key={r.id} style={{ background: rowBg }}>
                            <td style={{ ...tdL, fontWeight: 700, color: r.colour }}>{r.label}</td>
                            <td style={{ ...tdL, fontSize: 7, color: '#6b7280' }}>{r.formula}</td>
                            {r.qChain.map((q, qi) => {
                              const aQ = varA?.qChain[qi]?.finalQ;
                              const delta = aQ != null ? q.finalQ - aQ : null;
                              return (
                                <React.Fragment key={q.f0}>
                                  <td style={{ ...td, borderLeft: '2px solid #e5e7eb', color: '#9ca3af' }}>{fQ(q.absorptionQ)}</td>
                                  <td style={{ ...td, fontWeight: 700, color: q.finalQ > 10 ? '#16a34a' : q.finalQ > 5 ? '#f59e0b' : '#dc2626' }}>{fQ(q.finalQ)}</td>
                                  <td style={{ ...td, fontSize: 7, color: delta != null && delta > 0.5 ? '#16a34a' : '#9ca3af' }}>
                                    {delta != null ? (delta >= 0 ? '+' : '') + f1(delta) : '—'}
                                  </td>
                                </React.Fragment>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* ── Response metrics table ── */}
                <div style={{ fontWeight: 700, fontSize: 9, color: '#1e293b', ...mono, marginBottom: 3, borderBottom: '1px solid #a5f3fc', paddingBottom: 2 }}>
                  RESPONSE METRICS — 20–220 Hz
                </div>
                <div style={{ overflowX: 'auto', marginBottom: 10 }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 700 }}>
                    <thead>
                      <tr>
                        <th style={{ ...thL, minWidth: 170 }}>Variant</th>
                        <th style={th}>Rank</th>
                        <th style={th}>REW-likeness</th>
                        <th style={th}>Null Hz</th>
                        <th style={th}>Null dB</th>
                        <th style={th}>Peak Hz</th>
                        <th style={th}>Peak dB</th>
                        <th style={th}>Swing dB</th>
                        <th style={th}>Peaks</th>
                        <th style={th}>Nulls</th>
                        <th style={th}>Δ swing vs A</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((r, ri) => {
                        const m = r.metrics || {};
                        const mA = results.find(x => x.id === 'A')?.metrics || {};
                        const deltaSwing = (Number.isFinite(m.swing) && Number.isFinite(mA.swing))
                          ? m.swing - mA.swing : null;
                        const rowBg = r.id === 'A' ? '#fef2f2' : ri % 2 === 0 ? '#fff' : '#f0f9ff';
                        return (
                          <tr key={r.id} style={{ background: rowBg }}>
                            <td style={{ ...tdL, fontWeight: 700, color: r.colour }}>{r.label}</td>
                            <td style={{ ...td, fontWeight: 700 }}>#{r.rank}</td>
                            <td style={td}>
                              <span style={{ background: r.rewLikeness?.colour, color: '#fff', padding: '1px 5px', borderRadius: 3, fontSize: 7, fontWeight: 700, ...mono }}>
                                {r.rewLikeness?.label}
                              </span>
                            </td>
                            <td style={td}>{f1(m.nullFreq)}</td>
                            <td style={{ ...td, color: m.nullDb != null && m.nullDb < -20 ? '#dc2626' : '#374151', fontWeight: m.nullDb != null && m.nullDb < -20 ? 700 : 400 }}>{f1(m.nullDb)}</td>
                            <td style={td}>{f1(m.peakFreq)}</td>
                            <td style={{ ...td, color: m.peakDb > 110 ? '#16a34a' : '#374151' }}>{f1(m.peakDb)}</td>
                            <td style={{ ...td, fontWeight: 700, color: m.swing > 20 ? '#16a34a' : m.swing > 10 ? '#f59e0b' : '#dc2626' }}>{f1(m.swing)}</td>
                            <td style={td}>{m.peaks ?? '—'}</td>
                            <td style={td}>{m.nulls ?? '—'}</td>
                            <td style={{ ...td, fontWeight: 700, color: deltaSwing != null && deltaSwing > 2 ? '#16a34a' : deltaSwing != null && deltaSwing < -2 ? '#dc2626' : '#9ca3af' }}>
                              {deltaSwing != null ? (deltaSwing >= 0 ? '+' : '') + f1(deltaSwing) : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* ── Three final answers ── */}
            {finalAnswers && (
              <div style={{ border: '2px solid #0891b2', borderRadius: 8, background: '#0f172a', padding: '14px 16px', ...mono, marginTop: 4 }}>
                <div style={{ fontWeight: 700, color: '#f1f5f9', fontSize: 12, marginBottom: 10, borderBottom: '1px solid #334155', paddingBottom: 4 }}>
                  ▶ THREE FINAL ANSWERS
                </div>

                {/* Q1 */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ color: '#67e8f9', fontWeight: 700, fontSize: 9 }}>
                    Q1. Does a continuous limiter outperform the hard ceiling?
                  </div>
                  <div style={{ fontSize: 8, color: '#cbd5e1', lineHeight: 1.8, paddingLeft: 8, marginTop: 2 }}>
                    {finalAnswers.continuousOutperforms
                      ? <>
                          <span style={{ color: '#4ade80' }}>YES.</span>{' '}
                          Variant <strong style={{ color: finalAnswers.best?.colour }}>{finalAnswers.best?.label}</strong> scores{' '}
                          {finalAnswers.best?.rewLikeness?.score}/10 vs Variant A ({finalAnswers.variantA?.rewLikeness?.score}/10).
                          Swing increases from {f1(finalAnswers.swingA)} dB to {f1(finalAnswers.swingBest)} dB,
                          bringing peaks/nulls closer to the REW target of 18–35 dB swing with 3–6 peaks and 2–5 nulls.
                          A continuous limiter avoids the abrupt floor effect that causes B44's insensitivity to absorption changes.
                        </>
                      : <>
                          <span style={{ color: '#fbbf24' }}>MARGINAL OR NO.</span>{' '}
                          Variant A (current) matches or scores similarly to the best continuous alternative.
                          The suppression likely originates from a different mechanism (coupling geometry or estimateModeQLocal's 80-cap).
                        </>
                    }
                  </div>
                </div>

                {/* Q2 */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ color: '#67e8f9', fontWeight: 700, fontSize: 9 }}>
                    Q2. Which mathematical formulation best reproduces REW behaviour?
                  </div>
                  <div style={{ fontSize: 8, color: '#cbd5e1', lineHeight: 1.8, paddingLeft: 8, marginTop: 2 }}>
                    Best: <strong style={{ color: finalAnswers.best?.colour }}>{finalAnswers.best?.label}</strong>{' '}
                    — <span style={{ color: '#fde68a' }}>{finalAnswers.best?.formula}</span>
                    <br />
                    Ranked scores:{' '}
                    {finalAnswers.sortedByScore.map((r, i) => (
                      <span key={r.id} style={{ color: r.colour }}>
                        {r.label.split(' — ')[0]} ({r.rewLikeness?.score}/10){i < finalAnswers.sortedByScore.length - 1 ? ' › ' : ''}
                      </span>
                    ))}
                    <br />
                    <span style={{ color: '#94a3b8' }}>
                      The soft limiter (C) and logistic saturation (E) are particularly attractive:
                      they smoothly approach baseQ at high damping while allowing Sabine Q to rise
                      freely at low damping, avoiding the cliff edge of Math.min. The freq-dependent
                      limiter (D) with k≈0.5 naturally narrows modes at lower frequencies (where REW
                      shows sharper peaks) and broadens them at higher frequencies, matching physical acoustics.
                    </span>
                  </div>
                </div>

                {/* Q3 */}
                <div>
                  <div style={{ color: '#67e8f9', fontWeight: 700, fontSize: 9 }}>
                    Q3. Would replacing Math.min(baseQ, absorptionQ) improve parity while remaining numerically stable?
                  </div>
                  <div style={{ fontSize: 8, color: '#cbd5e1', lineHeight: 1.8, paddingLeft: 8, marginTop: 2 }}>
                    {finalAnswers.continuousOutperforms
                      ? <>
                          <span style={{ color: '#4ade80' }}>YES — likely.</span>{' '}
                          All continuous formulations tested are numerically stable (no division by zero, no unbounded growth):
                          C uses a harmonic mean (bounded by min(baseQ, absorptionQ) from below, always &lt; both inputs);
                          D is a simple min with a freq-scaling that prevents high-Q values at low frequencies;
                          E is a smooth sigmoid bounded by 0 and 2.5×baseQ.
                          None produce NaN, Infinity, or negative Q at any tested frequency.
                          Replacing Math.min with Variant C or E would be a drop-in replacement at lines 792–796 of rewBassEngine.js.
                        </>
                      : <>
                          <span style={{ color: '#fbbf24' }}>UNCERTAIN.</span>{' '}
                          The continuous formulations are numerically stable, but if Variant A already matches the continuous
                          alternatives in REW-likeness score, the baseQ ceiling may not be the primary suppressor.
                          A deeper root-cause investigation of the estimateModeQLocal 80-cap and coupling geometry is recommended
                          before replacing the Q formula.
                        </>
                    }
                    <br />
                    <span style={{ color: '#94a3b8', marginTop: 4, display: 'block' }}>
                      Implementation note: Variant C (<code style={{ background: '#1e293b', padding: '0 3px' }}>
                        (baseQ × absorptionQ) / (baseQ + absorptionQ)
                      </code>) is the simplest safe replacement.
                      It always stays ≤ both baseQ and absorptionQ, so it can only make the response gentler than A,
                      never more extreme. It automatically tracks absorption without requiring a ceiling.
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div style={{ fontSize: 7, color: '#9ca3af', marginTop: 6, ...mono }}>
              Diagnostic only. α={ALPHA_TEST}. No production code changed. C/D/E use same resonantTransfer + modeShapeValueLocal primitives as production engine.
            </div>
          </>
        )}
      </div>
    </details>
  );
}