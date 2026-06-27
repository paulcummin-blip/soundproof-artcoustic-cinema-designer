import React, { useState, useMemo } from "react";
import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine";
import { getSubwooferCurve } from "@/components/models/speakers/registry";

// Flat 94 dB reference — matches REW Room Simulator flat source
const FLAT_SOURCE_CURVE = [
  { hz: 20,  db: 94 },
  { hz: 50,  db: 94 },
  { hz: 100, db: 94 },
  { hz: 200, db: 94 },
];

// Rigid boundaries (near-zero absorption on all surfaces)
const RIGID_BOUNDARIES = {
  front: 0.01, back: 0.01, left: 0.01, right: 0.01, ceiling: 0.01, floor: 0.01,
};

function analyseResponse(freqsHz, splDb) {
  const band = freqsHz
    .map((f, i) => ({ f, db: splDb[i] })  )
    .filter(p => p.f >= 20 && p.f <= 80 && Number.isFinite(p.db));

  if (band.length < 3) return { nullFreq: null, nullDb: null, peakFreq: null, peakDb: null, swing: null };

  let nullPt = band[0];
  let peakPt = band[0];

  for (const pt of band) {
    if (pt.db < nullPt.db) nullPt = pt;
    if (pt.db > peakPt.db) peakPt = pt;
  }

  const swing = peakPt.db - nullPt.db;
  return {
    nullFreq: nullPt.f,
    nullDb: nullPt.db,
    peakFreq: peakPt.f,
    peakDb: peakPt.db,
    swing,
  };
}

function computeMAE(freqsHz, splDb, rewData) {
  if (!rewData || rewData.length < 2) return null;
  let errSum = 0;
  let count = 0;
  for (let i = 0; i < freqsHz.length; i++) {
    const f = freqsHz[i];
    if (f < 20 || f > 200) continue;
    // Interpolate REW value at this frequency
    const sorted = [...rewData].sort((a, b) => a.frequency - b.frequency);
    let rewDb = null;
    for (let j = 0; j < sorted.length - 1; j++) {
      if (f >= sorted[j].frequency && f <= sorted[j + 1].frequency) {
        const t = (f - sorted[j].frequency) / (sorted[j + 1].frequency - sorted[j].frequency);
        rewDb = sorted[j].spl + t * (sorted[j + 1].spl - sorted[j].spl);
        break;
      }
    }
    if (rewDb !== null && Number.isFinite(splDb[i])) {
      errSum += Math.abs(splDb[i] - rewDb);
      count++;
    }
  }
  return count > 0 ? errSum / count : null;
}

function runVariant(roomDims, seatPos, subsForSimulation, options) {
  let sumRe = null;
  let sumIm = null;
  let freqsHz = null;

  for (const sub of subsForSimulation) {
    const result = simulateBassResponseRewCore(
      roomDims, seatPos, sub, FLAT_SOURCE_CURVE, options
    );
    if (!freqsHz) {
      freqsHz = result.freqsHz;
      sumRe = result.complexPressure.map(cp => cp.re);
      sumIm = result.complexPressure.map(cp => cp.im);
    } else {
      result.complexPressure.forEach((cp, i) => {
        if (Number.isFinite(cp.re)) sumRe[i] += cp.re;
        if (Number.isFinite(cp.im)) sumIm[i] += cp.im;
      });
    }
  }

  if (!freqsHz) return null;

  const splDb = sumRe.map((re, i) => {
    const im = sumIm[i];
    const mag = Math.sqrt(re * re + im * im);
    return 20 * Math.log10(Math.max(mag, 1e-10));
  });

  return { freqsHz, splDb };
}

const VARIANTS = [
  {
    id: 'v1_live_production',
    label: 'V1 — Live production (current)',
    description: 'Exact active solver state: modes ON, reflections from UI, live absorption',
  },
  {
    id: 'v2_modal_only',
    label: 'V2 — Modal-only',
    description: 'enableModes: true, enableReflections: false, disableLateField: true, flat source',
    options: {
      enableModes: true,
      enableReflections: false,
      disableLateField: true,
      smoothing: 'none',
      axialQ: 4.0,
      pureDeterministicModalSum: true,
      disableModalPropagationPhase: true,
      propagationPhaseScale: 0,
    },
  },
  {
    id: 'v3_image_order1_current_abs',
    label: 'V3 — Image-source, order 1, current absorption',
    description: 'enableModes: false, enableReflections: true, order 1, live surface absorption',
    options: (absorption) => ({
      enableModes: false,
      enableReflections: true,
      disableLateField: true,
      debugReflectionOrder: 1,
      surfaceAbsorption: absorption,
      smoothing: 'none',
      axialQ: 4.0,
    }),
  },
  {
    id: 'v4_image_order2_rigid',
    label: 'V4 — Image-source, order 2, rigid walls',
    description: 'enableModes: false, enableReflections: true, order 2, absorption ≈ 0',
    options: {
      enableModes: false,
      enableReflections: true,
      disableLateField: true,
      debugReflectionOrder: 2,
      surfaceAbsorption: RIGID_BOUNDARIES,
      smoothing: 'none',
      axialQ: 4.0,
    },
  },
  {
    id: 'v5_image_order3_rigid',
    label: 'V5 — Image-source, order 3, rigid walls',
    description: 'enableModes: false, enableReflections: true, order 3, absorption ≈ 0',
    options: {
      enableModes: false,
      enableReflections: true,
      disableLateField: true,
      debugReflectionOrder: 3,
      surfaceAbsorption: RIGID_BOUNDARIES,
      smoothing: 'none',
      axialQ: 4.0,
    },
  },
  {
    id: 'v6_image_order4_rigid',
    label: 'V6 — Image-source, order 4, rigid walls',
    description: 'enableModes: false, enableReflections: true, order 4, absorption ≈ 0',
    options: {
      enableModes: false,
      enableReflections: true,
      disableLateField: true,
      debugReflectionOrder: 4,
      surfaceAbsorption: RIGID_BOUNDARIES,
      smoothing: 'none',
      axialQ: 4.0,
    },
  },
  {
    id: 'v7_hybrid_order4_rigid',
    label: 'V7 — Hybrid modal + image-source, order 4, rigid walls',
    description: 'enableModes: true, enableReflections: true, order 4, absorption ≈ 0',
    options: {
      enableModes: true,
      enableReflections: true,
      disableLateField: true,
      debugReflectionOrder: 4,
      surfaceAbsorption: RIGID_BOUNDARIES,
      smoothing: 'none',
      axialQ: 4.0,
      pureDeterministicModalSum: true,
      disableModalPropagationPhase: true,
      propagationPhaseScale: 0,
    },
  },
];

function fmt1(v) {
  return v !== null && Number.isFinite(v) ? v.toFixed(1) : '—';
}

function VerdictBadge({ text }) {
  const isCloser = text?.toLowerCase().includes('closer');
  const isWorse  = text?.toLowerCase().includes('worse');
  const bg = isCloser ? '#dcfce7' : isWorse ? '#fee2e2' : '#f3f4f6';
  const color = isCloser ? '#166534' : isWorse ? '#991b1b' : '#374151';
  return (
    <span style={{ display: 'inline-block', padding: '1px 7px', borderRadius: 4, background: bg, color, fontSize: 10, fontWeight: 700, fontFamily: 'monospace' }}>
      {text || '—'}
    </span>
  );
}

export default function ImageSourceParityShootout({
  roomDims,
  seatingPositions,
  subsForSimulation,
  surfaceAbsorption,
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

  const canRun = roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM &&
    seatPos && subsForSimulation?.length > 0;

  const rewReferenceData = rewOverlaySeries?.data || null;

  function runShootout() {
    if (!canRun) return;
    setRunning(true);

    setTimeout(() => {
      const out = [];

      for (const variant of VARIANTS) {
        if (variant.id === 'v1_live_production') {
          // Use live data passed in directly
          const analysis = liveProductionData
            ? analyseResponse(
                liveProductionData.map(p => p.frequency),
                liveProductionData.map(p => p.spl)
              )
            : { nullFreq: null, nullDb: null, peakFreq: null, peakDb: null, swing: null };

          const mae = rewReferenceData && liveProductionData
            ? computeMAE(
                liveProductionData.map(p => p.frequency),
                liveProductionData.map(p => p.spl),
                rewReferenceData
              )
            : null;

          out.push({ id: variant.id, label: variant.label, description: variant.description, ...analysis, mae, error: null });
          continue;
        }

        try {
          const opts = typeof variant.options === 'function'
            ? variant.options(surfaceAbsorption)
            : { ...variant.options, surfaceAbsorption: variant.options?.surfaceAbsorption ?? surfaceAbsorption };

          const res = runVariant(
            { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM },
            seatPos,
            subsForSimulation,
            { ...opts, freqMinHz: 20, freqMaxHz: 200 }
          );

          if (!res) {
            out.push({ id: variant.id, label: variant.label, description: variant.description, nullFreq: null, nullDb: null, peakFreq: null, peakDb: null, swing: null, mae: null, error: 'No result' });
            continue;
          }

          const analysis = analyseResponse(res.freqsHz, res.splDb);
          const mae = rewReferenceData
            ? computeMAE(res.freqsHz, res.splDb, rewReferenceData)
            : null;

          out.push({ id: variant.id, label: variant.label, description: variant.description, ...analysis, mae, error: null, _freqsHz: res.freqsHz, _splDb: res.splDb });
        } catch (e) {
          out.push({ id: variant.id, label: variant.label, description: variant.description, nullFreq: null, nullDb: null, peakFreq: null, peakDb: null, swing: null, mae: null, error: e.message });
        }
      }

      // Compute verdicts relative to V1 production
      const v1 = out[0];
      const v1Swing = v1?.swing;
      const v1Mae = v1?.mae;

      // Determine if REW reference is available for MAE comparison
      const hasRew = rewReferenceData !== null;

      // For each non-V1 variant, determine verdict
      for (let i = 1; i < out.length; i++) {
        const row = out[i];
        const swingDiff = (row.swing != null && v1Swing != null) ? row.swing - v1Swing : null;
        const maeDiff = (hasRew && row.mae != null && v1Mae != null) ? row.mae - v1Mae : null;

        let verdict = 'no meaningful change';
        if (hasRew && maeDiff !== null) {
          if (maeDiff < -1.0) verdict = 'closer to REW';
          else if (maeDiff > 1.0) verdict = 'worse than current';
          else verdict = 'no meaningful change';
        } else if (swingDiff !== null) {
          // Without REW data, compare swing as a proxy for shape accuracy
          if (Math.abs(swingDiff) < 1.0) verdict = 'no meaningful change';
          else verdict = 'shape change only (no REW ref)';
        }
        row.verdict = verdict;
      }
      v1.verdict = 'baseline (current production)';

      // Determine final answer
      const imageCandidates = out.filter(r => r.id.startsWith('v4') || r.id.startsWith('v5') || r.id.startsWith('v6'));
      let finalVerdict = '';
      if (hasRew) {
        const bestImage = imageCandidates.reduce((best, r) => (r.mae != null && (best == null || r.mae < best.mae)) ? r : best, null);
        if (bestImage && v1Mae != null) {
          if (bestImage.mae < v1Mae - 1.0) {
            finalVerdict = `✅ YES — Image-source-only rigid boundaries (${bestImage.label}) gives lower MAE (${fmt1(bestImage.mae)} dB) vs production (${fmt1(v1Mae)} dB). Recommend switching REW-parity mode to image-source.`;
          } else if (bestImage.mae > v1Mae + 1.0) {
            finalVerdict = `❌ NO — Modal/hybrid path (${fmt1(v1Mae)} dB MAE) outperforms best rigid image-source (${bestImage.label}: ${fmt1(bestImage.mae)} dB MAE). Continue with modal basis.`;
          } else {
            finalVerdict = `⚖️ INCONCLUSIVE — Image-source and modal paths perform similarly (within 1 dB MAE). Need to compare curve shapes directly.`;
          }
        } else {
          finalVerdict = 'Could not determine — ensure REW overlay is loaded and subs/seats are configured.';
        }
      } else {
        finalVerdict = '⚠️ No REW reference imported — paste REW export CSV in "Geometry & REW Import" → "REW Reference Overlay" to enable MAE comparison. Null/peak metrics shown instead.';
      }

      setResults({ rows: out, finalVerdict, hasRew });
      setRan(true);
      setRunning(false);
    }, 30);
  }

  const cellStyle = { padding: '3px 6px', textAlign: 'right', fontSize: 10, fontFamily: 'monospace', borderBottom: '1px solid #e5e7eb' };
  const cellLeft = { ...cellStyle, textAlign: 'left', maxWidth: 180 };
  const thStyle = { ...cellStyle, fontWeight: 700, color: '#374151', background: '#f9fafb', borderBottom: '2px solid #d1d5db' };
  const thLeft = { ...thStyle, textAlign: 'left' };

  return (
    <details style={{ border: '2px solid #0f766e', borderRadius: 8, background: '#f0fdfa', padding: '8px 10px', marginBottom: 8 }}>
      <summary style={{ fontWeight: 700, color: '#0f766e', fontSize: 11, fontFamily: 'monospace', cursor: 'pointer' }}>
        🔬 Image-Source Parity Shootout — REW Basis Audit
      </summary>
      <div style={{ marginTop: 8 }}>

        <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#134e4a', marginBottom: 8, lineHeight: 1.5 }}>
          Compares 7 engine variants using the flat 94 dB reference source, live room geometry, and selected seat.
          Rigid boundaries = all absorption ≈ 0.01. Goal: determine if image-source-only matches REW better than modal/hybrid.
          {!rewReferenceData && (
            <span style={{ color: '#b45309', fontWeight: 700, marginLeft: 4 }}>
              ⚠ No REW overlay loaded — MAE column will show "—". Load REW CSV for full comparison.
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <button
            onClick={runShootout}
            disabled={!canRun || running}
            style={{
              height: 30, padding: '0 14px', borderRadius: 6,
              border: '1px solid #0f766e', background: canRun && !running ? '#0f766e' : '#d1d5db',
              color: canRun && !running ? '#fff' : '#9ca3af',
              fontSize: 11, fontFamily: 'monospace', fontWeight: 700, cursor: canRun && !running ? 'pointer' : 'not-allowed',
            }}
          >
            {running ? 'Running…' : ran ? 'Re-run Shootout' : 'Run Shootout'}
          </button>
          {!canRun && (
            <span style={{ fontSize: 10, color: '#b45309', fontFamily: 'monospace' }}>
              Need room dims + seat + subs to run.
            </span>
          )}
          {ran && !running && (
            <span style={{ fontSize: 10, color: '#065f46', fontFamily: 'monospace' }}>
              Seat: {activeSeat ? (activeSeat.id || `${activeSeat.x?.toFixed(2)},${activeSeat.y?.toFixed(2)}`) : '—'} &nbsp;|&nbsp;
              Subs: {subsForSimulation?.length ?? 0} &nbsp;|&nbsp;
              Room: {roomDims?.widthM?.toFixed(1)}×{roomDims?.lengthM?.toFixed(1)}×{roomDims?.heightM?.toFixed(1)} m
            </span>
          )}
        </div>

        {results && (
          <>
            <div style={{ overflowX: 'auto', marginBottom: 10 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 660 }}>
                <thead>
                  <tr>
                    <th style={thLeft}>Variant</th>
                    <th style={thStyle}>Null Hz</th>
                    <th style={thStyle}>Null dB</th>
                    <th style={thStyle}>Peak Hz</th>
                    <th style={thStyle}>Peak dB</th>
                    <th style={thStyle}>Swing dB</th>
                    <th style={thStyle}>MAE dB</th>
                    <th style={{ ...thLeft, minWidth: 130 }}>Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {results.rows.map((row, idx) => (
                    <tr key={row.id} style={{ background: idx === 0 ? '#f0fdf4' : undefined }}>
                      <td style={{ ...cellLeft, maxWidth: 200 }}>
                        <div style={{ fontWeight: idx === 0 ? 700 : 400, color: '#0f172a', fontSize: 10 }}>{row.label}</div>
                        <div style={{ color: '#6b7280', fontSize: 9, marginTop: 1 }}>{row.description}</div>
                        {row.error && <div style={{ color: '#dc2626', fontSize: 9 }}>Error: {row.error}</div>}
                      </td>
                      <td style={cellStyle}>{fmt1(row.nullFreq)}</td>
                      <td style={{ ...cellStyle, color: row.nullDb !== null && row.nullDb < -30 ? '#b91c1c' : undefined, fontWeight: row.nullDb !== null && row.nullDb < -30 ? 700 : undefined }}>{fmt1(row.nullDb)}</td>
                      <td style={cellStyle}>{fmt1(row.peakFreq)}</td>
                      <td style={cellStyle}>{fmt1(row.peakDb)}</td>
                      <td style={{ ...cellStyle, fontWeight: 600 }}>{fmt1(row.swing)}</td>
                      <td style={{ ...cellStyle, color: results.hasRew ? (row.mae !== null && row.mae < (results.rows[0]?.mae ?? 999) - 1 ? '#065f46' : row.mae !== null && row.mae > (results.rows[0]?.mae ?? 0) + 1 ? '#991b1b' : undefined) : '#9ca3af' }}>
                        {results.hasRew ? fmt1(row.mae) : '—'}
                      </td>
                      <td style={{ ...cellLeft }}>
                        <VerdictBadge text={row.verdict} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Final Verdict */}
            <div style={{ border: '2px solid #0f766e', borderRadius: 6, background: '#ccfbf1', padding: '8px 12px', fontSize: 11, fontFamily: 'monospace', color: '#0f172a', lineHeight: 1.6 }}>
              <div style={{ fontWeight: 700, color: '#0f766e', marginBottom: 4, fontSize: 12 }}>Final Verdict</div>
              <div>{results.finalVerdict}</div>
            </div>

            {/* Architecture Decision Note */}
            <div style={{ marginTop: 8, fontSize: 9, fontFamily: 'monospace', color: '#6b7280', lineHeight: 1.5 }}>
              If image-source-only wins: switch REW-parity mode to <code>enableModes: false, enableReflections: true, debugReflectionOrder: N, surfaceAbsorption → 0</code>.<br/>
              If modal wins: continue investigating Green's function calibration (Q, coupling, source amplitude).<br/>
              This panel is diagnostic only — no production defaults were changed.
            </div>
          </>
        )}
      </div>
    </details>
  );
}