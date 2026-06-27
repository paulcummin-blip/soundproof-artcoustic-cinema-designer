import React, { useState, useMemo } from "react";
import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine";

// Flat 94 dB reference — matches REW Room Simulator
const FLAT_SOURCE_CURVE = [
  { hz: 20,  db: 94 },
  { hz: 50,  db: 94 },
  { hz: 100, db: 94 },
  { hz: 200, db: 94 },
];

// Rigid boundaries — absorption ≈ 0 on all surfaces
const RIGID = { front: 0.0, back: 0.0, left: 0.0, right: 0.0, ceiling: 0.0, floor: 0.0 };

// --- Variants ---
// Exactly the three asked for. surfaceAbsorption resolved at run-time for V1.
const VARIANTS = [
  {
    id: 'modal_only',
    label: 'Current parity — modal-only',
    description: 'enableModes: true · enableReflections: false · disableLateField: true',
    buildOpts: () => ({
      enableModes: true,
      enableReflections: false,
      disableLateField: true,
      smoothing: 'none',
      axialQ: 4.0,
      pureDeterministicModalSum: true,
      disableModalPropagationPhase: true,
      propagationPhaseScale: 0,
    }),
  },
  {
    id: 'image_only_rigid',
    label: 'Rigid image-source only (order 4)',
    description: 'enableModes: false · enableReflections: true · order 4 · absorption = 0',
    buildOpts: () => ({
      enableModes: false,
      enableReflections: true,
      disableLateField: true,
      debugReflectionOrder: 4,
      surfaceAbsorption: RIGID,
      smoothing: 'none',
      axialQ: 4.0,
    }),
  },
  {
    id: 'hybrid_rigid',
    label: 'Rigid hybrid — modal + image-source (order 4)',
    description: 'enableModes: true · enableReflections: true · order 4 · absorption = 0',
    buildOpts: () => ({
      enableModes: true,
      enableReflections: true,
      disableLateField: true,
      debugReflectionOrder: 4,
      surfaceAbsorption: RIGID,
      smoothing: 'none',
      axialQ: 4.0,
      pureDeterministicModalSum: true,
      disableModalPropagationPhase: true,
      propagationPhaseScale: 0,
    }),
  },
];

// --- Helpers ---

function runVariant(roomDims, seatPos, subs, opts) {
  let sumRe = null;
  let sumIm = null;
  let freqsHz = null;

  for (const sub of subs) {
    const r = simulateBassResponseRewCore(
      roomDims, seatPos, sub, FLAT_SOURCE_CURVE,
      { freqMinHz: 20, freqMaxHz: 200, ...opts }
    );
    if (!freqsHz) {
      freqsHz = r.freqsHz;
      sumRe = r.complexPressure.map(cp => cp.re);
      sumIm = r.complexPressure.map(cp => cp.im);
    } else {
      r.complexPressure.forEach((cp, i) => {
        if (Number.isFinite(cp.re)) sumRe[i] += cp.re;
        if (Number.isFinite(cp.im)) sumIm[i] += cp.im;
      });
    }
  }

  if (!freqsHz) return null;

  const splDb = sumRe.map((re, i) => {
    const im = sumIm[i];
    return 20 * Math.log10(Math.max(Math.sqrt(re * re + im * im), 1e-10));
  });

  return { freqsHz, splDb };
}

function analyseResponse(freqsHz, splDb) {
  const band = freqsHz
    .map((f, i) => ({ f, db: splDb[i] }))
    .filter(p => p.f >= 20 && p.f <= 80 && Number.isFinite(p.db));

  if (band.length < 3) return { nullFreq: null, nullDb: null, peakFreq: null, peakDb: null, swing: null };

  let nullPt = band[0], peakPt = band[0];
  for (const pt of band) {
    if (pt.db < nullPt.db) nullPt = pt;
    if (pt.db > peakPt.db) peakPt = pt;
  }

  return {
    nullFreq: nullPt.f,
    nullDb: nullPt.db,
    peakFreq: peakPt.f,
    peakDb: peakPt.db,
    swing: peakPt.db - nullPt.db,
  };
}

function computeMAE(freqsHz, splDb, rewData) {
  if (!rewData || rewData.length < 2) return null;
  const sorted = [...rewData].sort((a, b) => a.frequency - b.frequency);
  let sum = 0, count = 0;
  for (let i = 0; i < freqsHz.length; i++) {
    const f = freqsHz[i];
    if (f < 20 || f > 200) continue;
    // Linear interpolation into REW data
    let rewDb = null;
    for (let j = 0; j < sorted.length - 1; j++) {
      if (f >= sorted[j].frequency && f <= sorted[j + 1].frequency) {
        const t = (f - sorted[j].frequency) / (sorted[j + 1].frequency - sorted[j].frequency);
        rewDb = sorted[j].spl + t * (sorted[j + 1].spl - sorted[j].spl);
        break;
      }
    }
    if (rewDb !== null && Number.isFinite(splDb[i])) {
      sum += Math.abs(splDb[i] - rewDb);
      count++;
    }
  }
  return count > 0 ? sum / count : null;
}

function fmt1(v) {
  return v !== null && Number.isFinite(v) ? v.toFixed(1) : '—';
}

function VerdictBadge({ text }) {
  if (!text) return <span style={{ color: '#6b7280', fontSize: 10, fontFamily: 'monospace' }}>—</span>;
  const lower = text.toLowerCase();
  const isBaseline = lower.includes('baseline');
  const isCloser  = lower.includes('closer');
  const isWorse   = lower.includes('worse');
  const bg    = isBaseline ? '#e0f2fe' : isCloser ? '#dcfce7' : isWorse ? '#fee2e2' : '#f3f4f6';
  const color = isBaseline ? '#0369a1' : isCloser ? '#166534' : isWorse ? '#991b1b' : '#374151';
  return (
    <span style={{ display: 'inline-block', padding: '1px 7px', borderRadius: 4, background: bg, color, fontSize: 10, fontWeight: 700, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
      {text}
    </span>
  );
}

// --- Component ---

export default function ImageSourceParityShootout({
  roomDims,
  seatingPositions,
  subsForSimulation,
  rewOverlaySeries,
  liveProductionData,
}) {
  const [ran, setRan] = useState(false);
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);

  const activeSeat = useMemo(() => {
    const primary = (seatingPositions || []).find(s => s.isPrimary);
    return primary || seatingPositions?.[0] || null;
  }, [seatingPositions]);

  const seatPos = useMemo(() => {
    if (!activeSeat) return null;
    return {
      x: Number(activeSeat.x),
      y: Number(activeSeat.y),
      z: Number.isFinite(Number(activeSeat.z)) ? Number(activeSeat.z) : 1.2,
    };
  }, [activeSeat]);

  const canRun = !!(roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM &&
    seatPos && subsForSimulation?.length > 0);

  const rewData = rewOverlaySeries?.data || null;
  const hasRew  = rewData !== null && rewData.length > 1;

  function runShootout() {
    if (!canRun) return;
    setRunning(true);

    setTimeout(() => {
      const rdims = { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM };
      const rows = [];

      for (const variant of VARIANTS) {
        // V1 modal_only — use the live production series directly so we're comparing apples-to-apples
        if (variant.id === 'modal_only' && liveProductionData?.length > 1) {
          const freqsHz = liveProductionData.map(p => p.frequency);
          const splDb   = liveProductionData.map(p => p.spl);
          const analysis = analyseResponse(freqsHz, splDb);
          const mae = hasRew ? computeMAE(freqsHz, splDb, rewData) : null;
          rows.push({ ...variant, ...analysis, mae, verdict: 'baseline', error: null });
          continue;
        }

        try {
          const opts = variant.buildOpts();
          const res = runVariant(rdims, seatPos, subsForSimulation, opts);
          if (!res) {
            rows.push({ ...variant, nullFreq: null, nullDb: null, peakFreq: null, peakDb: null, swing: null, mae: null, verdict: '—', error: 'engine returned null' });
            continue;
          }
          const analysis = analyseResponse(res.freqsHz, res.splDb);
          const mae = hasRew ? computeMAE(res.freqsHz, res.splDb, rewData) : null;
          rows.push({ ...variant, ...analysis, mae, verdict: null, error: null });
        } catch (e) {
          rows.push({ ...variant, nullFreq: null, nullDb: null, peakFreq: null, peakDb: null, swing: null, mae: null, verdict: '—', error: e.message });
        }
      }

      // Assign verdicts relative to baseline (row 0)
      const baseline = rows[0];
      const baseMae  = baseline?.mae;

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.error) { row.verdict = 'error'; continue; }

        if (hasRew && row.mae !== null && baseMae !== null) {
          const diff = row.mae - baseMae;
          if (diff < -1.0)      row.verdict = 'closer to REW';
          else if (diff > 1.0)  row.verdict = 'worse than baseline';
          else                   row.verdict = 'no meaningful change';
        } else {
          // No REW ref — compare swing shape
          const swingDiff = (row.swing != null && baseline?.swing != null) ? Math.abs(row.swing - baseline.swing) : null;
          row.verdict = swingDiff !== null && swingDiff > 2 ? 'shape change (no REW)' : 'no meaningful change';
        }
      }

      // Final verdict
      const imageRow  = rows.find(r => r.id === 'image_only_rigid');
      const hybridRow = rows.find(r => r.id === 'hybrid_rigid');
      let finalVerdict;

      if (!hasRew) {
        finalVerdict = '⚠️ No REW reference loaded. Paste REW CSV in "REW Reference Overlay" to enable MAE comparison. Null/peak metrics still shown.';
      } else {
        const candidates = [imageRow, hybridRow].filter(r => r && r.mae !== null);
        const best = candidates.reduce((b, r) => (!b || r.mae < b.mae) ? r : b, null);
        if (!best || baseMae === null) {
          finalVerdict = '⚠️ Could not compute — ensure subs, seat and REW overlay are all loaded.';
        } else if (best.mae < baseMae - 1.0) {
          finalVerdict = `✅ YES — "${best.label}" (MAE ${fmt1(best.mae)} dB) outperforms current modal-only (MAE ${fmt1(baseMae)} dB) by >${fmt1(baseMae - best.mae)} dB. Recommend switching REW-parity basis.`;
        } else if (best.mae > baseMae + 1.0) {
          finalVerdict = `❌ NO — Current modal-only (MAE ${fmt1(baseMae)} dB) outperforms best image-source candidate (MAE ${fmt1(best.mae)} dB). Continue with modal basis; investigate Green's function calibration.`;
        } else {
          finalVerdict = `⚖️ INCONCLUSIVE — Image-source and modal paths within 1 dB MAE of each other. Compare null centre frequency across rows to determine which better captures REW's modal pattern.`;
        }
      }

      setResults({ rows, finalVerdict, hasRew });
      setRan(true);
      setRunning(false);
    }, 20);
  }

  // --- Styles ---
  const cell = { padding: '3px 7px', textAlign: 'right', fontSize: 10, fontFamily: 'monospace', borderBottom: '1px solid #d1fae5', verticalAlign: 'top' };
  const cellL = { ...cell, textAlign: 'left' };
  const th   = { ...cell, fontWeight: 700, color: '#065f46', background: '#ecfdf5', borderBottom: '2px solid #6ee7b7' };
  const thL  = { ...th, textAlign: 'left' };

  return (
    <details style={{ border: '2px solid #0f766e', borderRadius: 8, background: '#f0fdfa', padding: '8px 10px', marginBottom: 8 }}>
      <summary style={{ fontWeight: 700, color: '#0f766e', fontSize: 11, fontFamily: 'monospace', cursor: 'pointer' }}>
        🔬 Image-Source Parity Shootout — REW Basis Audit
      </summary>

      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#134e4a', marginBottom: 8, lineHeight: 1.5 }}>
          Three engine variants — flat 94 dB source, live geometry.
          Compares current modal-only parity path against rigid image-source (order 4) and rigid hybrid (order 4).
          Null/peak analysis: 20–80 Hz band.{' '}
          {!hasRew && (
            <strong style={{ color: '#b45309' }}>
              ⚠ No REW overlay loaded — MAE column unavailable. Load REW CSV in "Geometry &amp; REW Import → REW Reference Overlay" for full comparison.
            </strong>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
          <button
            onClick={runShootout}
            disabled={!canRun || running}
            style={{
              height: 30, padding: '0 14px', borderRadius: 6,
              border: `1px solid ${canRun && !running ? '#0f766e' : '#d1d5db'}`,
              background: canRun && !running ? '#0f766e' : '#f3f4f6',
              color: canRun && !running ? '#fff' : '#9ca3af',
              fontSize: 11, fontFamily: 'monospace', fontWeight: 700,
              cursor: canRun && !running ? 'pointer' : 'not-allowed',
            }}
          >
            {running ? 'Running…' : ran ? 'Re-run' : 'Run Shootout'}
          </button>

          {!canRun && (
            <span style={{ fontSize: 10, color: '#b45309', fontFamily: 'monospace' }}>
              Need room dims + seat + at least one sub.
            </span>
          )}

          {ran && !running && activeSeat && (
            <span style={{ fontSize: 10, color: '#065f46', fontFamily: 'monospace' }}>
              Seat: {activeSeat.id || `(${Number(activeSeat.x).toFixed(2)}, ${Number(activeSeat.y).toFixed(2)})`}
              {' '}· Subs: {subsForSimulation?.length ?? 0}
              {' '}· Room: {roomDims?.widthM?.toFixed(1)}×{roomDims?.lengthM?.toFixed(1)}×{roomDims?.heightM?.toFixed(1)} m
              {hasRew ? ' · REW overlay ✓' : ' · REW overlay ✗'}
            </span>
          )}
        </div>

        {results && (
          <>
            <div style={{ overflowX: 'auto', marginBottom: 10 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 620 }}>
                <thead>
                  <tr>
                    <th style={{ ...thL, minWidth: 180 }}>Variant</th>
                    <th style={th}>Null Hz</th>
                    <th style={th}>Null dB</th>
                    <th style={th}>Peak Hz</th>
                    <th style={th}>Peak dB</th>
                    <th style={th}>Swing dB</th>
                    <th style={{ ...th, color: results.hasRew ? '#065f46' : '#9ca3af' }}>MAE dB</th>
                    <th style={{ ...thL, minWidth: 120 }}>Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {results.rows.map((row, idx) => {
                    const isBaseline = idx === 0;
                    const rowBg = isBaseline ? '#f0fdf4' : idx % 2 === 0 ? '#fff' : '#f9fafb';
                    const maeBetter = results.hasRew && row.mae !== null && results.rows[0]?.mae !== null && row.mae < results.rows[0].mae - 1;
                    const maeWorse  = results.hasRew && row.mae !== null && results.rows[0]?.mae !== null && row.mae > results.rows[0].mae + 1;
                    return (
                      <tr key={row.id} style={{ background: rowBg }}>
                        <td style={{ ...cellL, minWidth: 180 }}>
                          <div style={{ fontWeight: isBaseline ? 700 : 500, color: '#0f172a', fontSize: 10 }}>{row.label}</div>
                          <div style={{ color: '#6b7280', fontSize: 9, marginTop: 1, lineHeight: 1.4 }}>{row.description}</div>
                          {row.error && <div style={{ color: '#dc2626', fontSize: 9, marginTop: 2 }}>⚠ {row.error}</div>}
                        </td>
                        <td style={{ ...cell, color: '#374151' }}>{fmt1(row.nullFreq)}</td>
                        <td style={{ ...cell, color: row.nullDb !== null && row.nullDb < -20 ? '#b91c1c' : '#374151', fontWeight: row.nullDb !== null && row.nullDb < -20 ? 700 : 400 }}>{fmt1(row.nullDb)}</td>
                        <td style={cell}>{fmt1(row.peakFreq)}</td>
                        <td style={cell}>{fmt1(row.peakDb)}</td>
                        <td style={{ ...cell, fontWeight: 600 }}>{fmt1(row.swing)}</td>
                        <td style={{ ...cell, color: !results.hasRew ? '#9ca3af' : maeBetter ? '#065f46' : maeWorse ? '#991b1b' : '#374151', fontWeight: maeBetter || maeWorse ? 700 : 400 }}>
                          {results.hasRew ? fmt1(row.mae) : '—'}
                        </td>
                        <td style={cellL}>
                          <VerdictBadge text={row.verdict} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ border: '2px solid #0f766e', borderRadius: 6, background: '#ccfbf1', padding: '8px 12px', fontSize: 11, fontFamily: 'monospace', color: '#0f172a', lineHeight: 1.7 }}>
              <div style={{ fontWeight: 700, color: '#0f766e', marginBottom: 3, fontSize: 11 }}>▶ Final Answer</div>
              <div>{results.finalVerdict}</div>
            </div>

            <div style={{ marginTop: 6, fontSize: 9, fontFamily: 'monospace', color: '#6b7280', lineHeight: 1.5 }}>
              Diagnostic only. No production defaults changed. All three variants use flat 94 dB source and live sub positions.
            </div>
          </>
        )}
      </div>
    </details>
  );
}