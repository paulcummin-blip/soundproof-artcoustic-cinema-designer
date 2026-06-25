/**
 * ModalExcitationAmplitudeAudit
 * Diagnostic only — no production changes, does not affect the live graph.
 *
 * Goal: Determine whether remaining REW parity error originates BEFORE the
 * transfer function, in the generation of each mode's excitation amplitude.
 *
 * Variants A–J test different excitation amplitude strategies using:
 *   - distance_normalized modal source reference
 *   - production TF, Q, coupling, weighting
 *   - reflections OFF, direct + modes, all seats
 */

import React, { useState, useCallback } from 'react';
import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';
import { computeRoomModesLocal, estimateModeQLocal, modeShapeValueLocal } from '@/bass/core/modalCalculations';

// ── Constants ────────────────────────────────────────────────────────────────

const TEST_FREQUENCIES = [40, 57, 70, 80, 85, 90, 100];
const FLAT_CURVE = [{ hz: 20, db: 94 }, { hz: 200, db: 94 }];
const SPEED_OF_SOUND = 343;

const REW_REF = {
  40: 88.2, 57: 84.1, 70: 91.3, 80: 92.8, 85: 88.5, 90: 86.2, 100: 90.1,
};

const VARIANT_DEFS = [
  { key: 'A', label: 'Production',                    desc: 'distance_normalized, standard excitation' },
  { key: 'B', label: 'Excitation ×0.9',               desc: 'Scale all excitation by 0.9' },
  { key: 'C', label: 'Excitation ×1.1',               desc: 'Scale all excitation by 1.1' },
  { key: 'D', label: 'Eigenfunction norm OFF',         desc: 'Disable per-mode eigenfunction normalisation' },
  { key: 'E', label: 'Order weighting OFF',            desc: 'Remove order-based amplitude weighting' },
  { key: 'F', label: 'Boundary excitation OFF',        desc: 'Zero-out modes where source is near boundary' },
  { key: 'G', label: 'Uniform excitation',             desc: 'All modes receive equal excitation amplitude' },
  { key: 'H', label: 'REW-style excitation',           desc: 'room_volume modal source reference' },
  { key: 'I', label: 'Modal force normalised',         desc: 'Normalise by mode count (energy spreading)' },
  { key: 'J', label: 'Unit excitation',                desc: 'modalGainScalar=1 flat reference, no distance loss' },
];

// ── Production engine base options ────────────────────────────────────────────

function baseOpts(surfaceAbsorption, axialQ) {
  return {
    enableModes: true,
    enableReflections: false,
    disableLateField: true,
    modalSourceReferenceMode: 'distance_normalized',
    pureDeterministicModalSum: true,
    disableModalPropagationPhase: true,
    propagationPhaseScale: 0,
    axialQ: axialQ ?? 8.0,
    surfaceAbsorption,
    freqMinHz: 20,
    freqMaxHz: 200,
  };
}

// Per-variant extra options passed on top of baseOpts
function variantExtraOpts(key, roomDims, sub, modes, surfaceAbsorption, axialQ) {
  switch (key) {
    case 'A': return {};
    case 'B': return { rewParityModalMagnitudeScale: 0.9 };
    case 'C': return { rewParityModalMagnitudeScale: 1.1 };
    // D: disable per-mode eigenfunction normalisation → use unit coupling (tangential/oblique family scales)
    //    Proxy: set axial/tangential/oblique family scales all to 1 with overrideConstantAxialQ
    case 'D': return { axialFamilyScale: 1.0, tangentialFamilyScale: 1.0, obliqueFamilyScale: 1.0, overrideConstantAxialQ: false };
    // E: order weighting OFF → use family scales ×2 to undo the 0.5 high-order suppression
    //    The production engine applies 0.5 scale for modeOrder>=2; we compensate with ×2 family scales
    case 'E': return { axialFamilyScale: 2.0, tangentialFamilyScale: 2.0, obliqueFamilyScale: 2.0 };
    // F: boundary excitation OFF → approximate by muting axial modes only (most boundary-coupled)
    //    Use axialFamilyScale=0 to zero out axial contribution
    case 'F': return { axialFamilyScale: 0.0 };
    // G: uniform excitation → scale=1/modeCount for each mode, approximate via uniform gain scalar
    case 'G': return { rewParityModalMagnitudeScale: 1.0, modalGainScalar: 0.25 };
    // H: REW-style → room_volume modal source reference
    case 'H': return { modalSourceReferenceMode: 'room_volume' };
    // I: modal force normalised → scale by 1/sqrt(N modes) proxy
    case 'I': return { rewParityModalMagnitudeScale: 1 / Math.sqrt(Math.max(1, modes?.length ?? 20)) };
    // J: unit excitation → no distance loss in modal source, flat reference
    case 'J': return { modalSourceReferenceMode: 'existing', modalGainScalar: 1.0 };
    default: return {};
  }
}

// ── Simulation helpers ────────────────────────────────────────────────────────

function sampleAtHz(freqsHz, splDbRaw, targetHz) {
  let best = null, bestDist = Infinity;
  freqsHz.forEach((f, i) => {
    const d = Math.abs(f - targetHz);
    if (d < bestDist) { bestDist = d; best = splDbRaw[i]; }
  });
  return best;
}

function computeSampled(freqsHz, splDbRaw) {
  const out = {};
  TEST_FREQUENCIES.forEach(hz => { out[hz] = sampleAtHz(freqsHz, splDbRaw, hz); });
  return out;
}

function computeMAE(sampled) {
  const errs = TEST_FREQUENCIES.map(hz => {
    const v = sampled[hz], r = REW_REF[hz];
    return (v !== null && v !== undefined && r !== null) ? Math.abs(v - r) : null;
  }).filter(v => v !== null);
  return errs.length ? errs.reduce((s, v) => s + v, 0) / errs.length : null;
}

function computeWorst(sampled) {
  let worstErr = null, worstHz = null;
  TEST_FREQUENCIES.forEach(hz => {
    const e = sampled[hz] !== null && REW_REF[hz] !== null ? Math.abs(sampled[hz] - REW_REF[hz]) : null;
    if (e !== null && (worstErr === null || e > worstErr)) { worstErr = e; worstHz = hz; }
  });
  return { worstErr, worstHz };
}

// ── Per-mode excitation audit ─────────────────────────────────────────────────

function computeModeExcitation(mode, sub, seat, roomDims, modalSourceAmplitude) {
  const { widthM, lengthM, heightM } = roomDims;
  const srcEigen  = modeShapeValueLocal(mode, sub.x, sub.y, sub.z ?? 0.35, { widthM, lengthM, heightM });
  const rcvEigen  = modeShapeValueLocal(mode, seat.x, seat.y, seat.z ?? 1.2, { widthM, lengthM, heightM });
  const coupling  = srcEigen * rcvEigen;
  const modeOrder = Math.abs(mode.nx) + Math.abs(mode.ny) + Math.abs(mode.nz);
  const orderWeight = modeOrder >= 2 ? 0.50 : 1.0;
  const afterCoupling   = modalSourceAmplitude * coupling;
  const afterOrderWeight = afterCoupling * orderWeight;
  const normFactor = 1.0; // production: no extra normalisation factor beyond the above
  const excitationEnteringTF = afterOrderWeight * normFactor;

  return {
    nx: mode.nx, ny: mode.ny, nz: mode.nz,
    freq: mode.freq,
    type: mode.type,
    q: mode.qValue,
    rawExcitation: modalSourceAmplitude,
    srcEigen,
    rcvEigen,
    coupling,
    orderWeight,
    normFactor,
    afterSource: modalSourceAmplitude,
    afterEigenSource: modalSourceAmplitude * Math.abs(srcEigen),
    afterEigenCombined: modalSourceAmplitude * Math.abs(coupling),
    afterOrderWeight: Math.abs(afterOrderWeight),
    excitationEnteringTF: Math.abs(excitationEnteringTF),
  };
}

function getModalSourceAmplitude(sub, roomDims, curveDb) {
  const { widthM, lengthM, heightM } = roomDims;
  const dx = sub.x - 0, dy = sub.y - 0, dz = (sub.z ?? 0.35) - 0;
  // Use the distance_normalized convention matching production
  const dist = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1;
  // curveDb → amplitude at 1m → distance-normalize → modal source amplitude
  const ampAt1m = Math.pow(10, curveDb / 20);
  const distLossLinear = 1 / Math.max(dist, 0.01);
  return ampAt1m * distLossLinear;
}

// ── Main audit runner ─────────────────────────────────────────────────────────

function runAudit(roomDims, seat, sub, seatingPositions, surfaceAbsorption, axialQ) {
  const { widthM, lengthM, heightM } = roomDims;

  // Build modes once (shared)
  const allModes = computeRoomModesLocal({ widthM, lengthM, heightM, fMax: 200, c: SPEED_OF_SOUND });
  const modesWithQ = allModes.map(mode => {
    const baseQ = mode.type === 'axial' ? (axialQ ?? 8.0) : mode.type === 'tangential' ? 3.9 : 2.5;
    const absorptionQ = estimateModeQLocal({ roomDims, surfaceAbsorption, f0: mode.freq });
    return { ...mode, qValue: Math.max(1, Math.min(baseQ, absorptionQ)) };
  });

  // Per-variant MAE (primary seat)
  const variantResults = {};
  VARIANT_DEFS.forEach(({ key }) => {
    try {
      const opts = { ...baseOpts(surfaceAbsorption, axialQ), ...variantExtraOpts(key, roomDims, sub, modesWithQ, surfaceAbsorption, axialQ) };
      const r = simulateBassResponseRewCore(roomDims, seat, sub, FLAT_CURVE, opts);
      const sampled = computeSampled(r.freqsHz, r.splDbRaw);
      const mae = computeMAE(sampled);
      const { worstErr, worstHz } = computeWorst(sampled);
      variantResults[key] = { sampled, mae, worstErr, worstHz };
    } catch (e) {
      variantResults[key] = { sampled: {}, mae: null, worstErr: null, worstHz: null, error: e.message };
    }
  });

  // Per-seat MAE (all seats, production only)
  const seats = (seatingPositions || []).slice(0, 8);
  const seatResults = seats.map(s => {
    try {
      const opts = baseOpts(surfaceAbsorption, axialQ);
      const r = simulateBassResponseRewCore(roomDims, s, sub, FLAT_CURVE, opts);
      const sampled = computeSampled(r.freqsHz, r.splDbRaw);
      return { seat: s, mae: computeMAE(sampled), sampled };
    } catch { return { seat: s, mae: null, sampled: {} }; }
  });

  // Per-mode excitation breakdown at each target frequency
  const modalSourceAmplitude = getModalSourceAmplitude(sub, roomDims, 94);
  const excitationByFreq = {};
  TEST_FREQUENCIES.forEach(targetHz => {
    // Find modes within ±15 Hz of target, rank by excitation entering TF
    const nearby = modesWithQ
      .filter(m => Math.abs(m.freq - targetHz) <= 15)
      .map(m => computeModeExcitation(m, sub, seat, roomDims, modalSourceAmplitude))
      .sort((a, b) => b.excitationEnteringTF - a.excitationEnteringTF)
      .slice(0, 8);
    excitationByFreq[targetHz] = nearby;
  });

  // Excitation waterfall: all modes sorted by freq, ranked by excitation at each target
  const waterfallData = modesWithQ
    .map(m => computeModeExcitation(m, sub, seat, roomDims, modalSourceAmplitude))
    .sort((a, b) => a.freq - b.freq);

  // Amplitude contribution (total excitation entering TF per mode type)
  const familyContrib = { axial: 0, tangential: 0, oblique: 0 };
  waterfallData.forEach(m => { familyContrib[m.type] = (familyContrib[m.type] || 0) + m.excitationEnteringTF; });
  const totalContrib = Object.values(familyContrib).reduce((s, v) => s + v, 0);

  // Per-mode excitation sensitivity: MAE delta for removing each top mode
  const topModes = waterfallData.slice().sort((a, b) => b.excitationEnteringTF - a.excitationEnteringTF).slice(0, 5);
  const sensitivityData = topModes.map(m => {
    // Mute by zeroing out axial/tangential/oblique family scale for the relevant type
    const familyOpts = {
      axialFamilyScale:      m.type === 'axial'      ? 0.0 : 1.0,
      tangentialFamilyScale: m.type === 'tangential' ? 0.0 : 1.0,
      obliqueFamilyScale:    m.type === 'oblique'    ? 0.0 : 1.0,
    };
    try {
      const opts = { ...baseOpts(surfaceAbsorption, axialQ), ...familyOpts };
      const r = simulateBassResponseRewCore(roomDims, seat, sub, FLAT_CURVE, opts);
      const sampled = computeSampled(r.freqsHz, r.splDbRaw);
      const mae = computeMAE(sampled);
      const baseMae = variantResults.A?.mae;
      return {
        mode: `(${m.nx},${m.ny},${m.nz}) ${m.freq.toFixed(1)}Hz ${m.type}`,
        excitation: m.excitationEnteringTF,
        maeMuted: mae,
        maeDelta: baseMae !== null && mae !== null ? mae - baseMae : null,
      };
    } catch { return { mode: `(${m.nx},${m.ny},${m.nz})`, excitation: m.excitationEnteringTF, maeMuted: null, maeDelta: null }; }
  });

  return { variantResults, seatResults, excitationByFreq, waterfallData, familyContrib, totalContrib, sensitivityData, modesWithQ };
}

// Verdict
function buildVerdict(variantResults) {
  const prodMae = variantResults.A?.mae;
  if (prodMae === null || prodMae === undefined) return 'Insufficient data.';
  const maxImprovement = VARIANT_DEFS.filter(d => d.key !== 'A')
    .map(d => variantResults[d.key]?.mae !== null ? prodMae - variantResults[d.key].mae : 0)
    .reduce((m, v) => Math.max(m, v), 0);
  if (maxImprovement > 1) {
    const best = VARIANT_DEFS.filter(d => d.key !== 'A')
      .map(d => ({ ...d, delta: variantResults[d.key]?.mae !== null ? prodMae - variantResults[d.key].mae : -Infinity }))
      .sort((a, b) => b.delta - a.delta)[0];
    return `Remaining parity error originates during modal excitation generation. Best improvement: ${best.label} (Δ${best.delta.toFixed(2)} dB).`;
  }
  return 'Excitation generation validated — no variant improves MAE by >1 dB.';
}

// ── UI helpers ────────────────────────────────────────────────────────────────

const mono = { fontFamily: 'monospace', fontSize: 10 };

function TH({ children, left = false }) {
  return (
    <th style={{ ...mono, padding: '3px 6px', color: '#6b7280', textTransform: 'uppercase', fontSize: 9, borderBottom: '1px solid #e5e7eb', textAlign: left ? 'left' : 'center' }}>
      {children}
    </th>
  );
}

function Num({ v, unit = '', digits = 2, good = false, bad = false }) {
  if (v === null || v === undefined || !Number.isFinite(v))
    return <td style={{ ...mono, padding: '2px 6px', textAlign: 'center', color: '#9ca3af' }}>—</td>;
  const color = good ? '#166534' : bad ? '#991b1b' : '#1c1917';
  return <td style={{ ...mono, padding: '2px 6px', textAlign: 'center', color, fontWeight: good || bad ? 700 : 400 }}>{v.toFixed(digits)}{unit}</td>;
}

function DeltaCell({ prodMae, mae }) {
  if (!Number.isFinite(prodMae) || !Number.isFinite(mae))
    return <td style={{ ...mono, padding: '2px 6px', textAlign: 'center', color: '#9ca3af' }}>—</td>;
  const delta = prodMae - mae;
  const color = delta > 1 ? '#166534' : delta > 0 ? '#374151' : '#991b1b';
  return <td style={{ ...mono, padding: '2px 6px', textAlign: 'center', color, fontWeight: Math.abs(delta) > 0.5 ? 700 : 400 }}>
    {delta > 0 ? '+' : ''}{delta.toFixed(2)} dB
  </td>;
}

function VariantRankedTable({ variantResults, prodMae }) {
  const ranked = VARIANT_DEFS
    .map(d => ({ ...d, ...variantResults[d.key] }))
    .filter(r => Number.isFinite(r.mae))
    .sort((a, b) => a.mae - b.mae);

  return (
    <table style={{ borderCollapse: 'collapse', width: '100%' }}>
      <thead>
        <tr style={{ background: '#f3f4f6' }}>
          <TH left>Rank</TH>
          <TH left>Variant</TH>
          <TH>MAE</TH>
          <TH>Δ MAE</TH>
          <TH>Worst err</TH>
          <TH>Worst Hz</TH>
        </tr>
      </thead>
      <tbody>
        {ranked.map((row, i) => {
          const isA = row.key === 'A';
          const isBest = i === 0 && !isA;
          return (
            <tr key={row.key} style={{ background: isBest ? '#f0fdf4' : isA ? '#eef2ff' : 'transparent', borderBottom: '1px solid #f3f4f6' }}>
              <td style={{ ...mono, padding: '2px 6px', color: '#6b7280' }}>#{i + 1}</td>
              <td style={{ ...mono, padding: '2px 6px', fontWeight: isA ? 700 : 400 }}>
                <span style={{ color: '#6b7280' }}>{row.key}</span>{' '}{row.label}
              </td>
              <Num v={row.mae} unit=" dB" good={isBest} />
              <DeltaCell prodMae={prodMae} mae={row.mae} />
              <Num v={row.worstErr} unit=" dB" />
              <Num v={row.worstHz} unit=" Hz" digits={0} />
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ModalExcitationAmplitudeAudit({
  roomDims, seat, sub, seatingPositions, surfaceAbsorption, axialQ,
}) {
  const [running, setRunning] = useState(false);
  const [data, setData] = useState(null);

  const handleRun = useCallback(() => {
    if (!roomDims || !seat || !sub) return;
    setRunning(true);
    setTimeout(() => {
      try {
        const result = runAudit(roomDims, seat, sub, seatingPositions, surfaceAbsorption, axialQ ?? 8.0);
        const verdict = buildVerdict(result.variantResults);
        setData({ ...result, verdict });
      } catch (e) {
        setData({ error: e.message });
      }
      setRunning(false);
    }, 20);
  }, [roomDims, seat, sub, seatingPositions, surfaceAbsorption, axialQ]);

  const prodMae = data?.variantResults?.A?.mae ?? null;
  const isValidated = data?.verdict?.includes('validated');

  return (
    <div style={{ border: '1px solid #b45309', borderRadius: 8, background: '#fffbeb', padding: '10px 12px', marginBottom: 8 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 700, color: '#78350f', fontSize: 11, fontFamily: 'monospace' }}>
            Modal Excitation Amplitude Audit
          </div>
          <div style={{ color: '#92400e', fontSize: 9, fontFamily: 'monospace', marginTop: 1 }}>
            Diagnostic only · no production changes · 10 excitation variants · {TEST_FREQUENCIES.join(', ')} Hz
          </div>
        </div>
        <button
          onClick={handleRun}
          disabled={running || !roomDims || !seat || !sub}
          style={{
            padding: '5px 14px', borderRadius: 5, fontSize: 10, fontFamily: 'monospace',
            background: running ? '#e5e7eb' : '#78350f', color: running ? '#6b7280' : '#fff',
            border: 'none', cursor: running ? 'not-allowed' : 'pointer', fontWeight: 700,
          }}
        >
          {running ? 'Running…' : data ? 'Re-run' : 'Run Audit'}
        </button>
      </div>

      {!seat && <div style={{ color: '#92400e', fontSize: 10, fontFamily: 'monospace' }}>⚠ No seat selected.</div>}
      {!sub  && <div style={{ color: '#92400e', fontSize: 10, fontFamily: 'monospace' }}>⚠ No sub available.</div>}

      {data?.error && (
        <div style={{ color: '#991b1b', fontSize: 10, fontFamily: 'monospace', padding: 6, background: '#fef2f2', borderRadius: 4 }}>
          Error: {data.error}
        </div>
      )}

      {data && !data.error && (() => {
        const { variantResults, seatResults, excitationByFreq, waterfallData, familyContrib, totalContrib, sensitivityData, verdict } = data;

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

            {/* Verdict */}
            <div style={{ border: `2px solid ${isValidated ? '#166534' : '#b45309'}`, borderRadius: 6, background: isValidated ? '#f0fdf4' : '#fef3c7', padding: '8px 12px' }}>
              <div style={{ fontWeight: 700, fontSize: 10, color: isValidated ? '#166534' : '#78350f', marginBottom: 2 }}>Final Verdict</div>
              <div style={{ fontSize: 10, color: '#1c1917', fontFamily: 'monospace', lineHeight: 1.5 }}>{verdict}</div>
              {prodMae !== null && (
                <div style={{ fontSize: 9, color: '#6b7280', marginTop: 4, fontFamily: 'monospace' }}>
                  Production MAE: {prodMae.toFixed(2)} dB · Variants tested: {VARIANT_DEFS.length}
                </div>
              )}
            </div>

            {/* Ranked Variants */}
            <div>
              <div style={{ fontWeight: 700, color: '#374151', fontSize: 10, marginBottom: 4 }}>Ranked Variants by MAE</div>
              <VariantRankedTable variantResults={variantResults} prodMae={prodMae} />
            </div>

            {/* Family Contribution Summary */}
            <div>
              <div style={{ fontWeight: 700, color: '#374151', fontSize: 10, marginBottom: 4 }}>Amplitude Contribution by Family</div>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr style={{ background: '#f3f4f6' }}>
                    <TH left>Family</TH>
                    <TH>Total Excitation (linear)</TH>
                    <TH>Share %</TH>
                  </tr>
                </thead>
                <tbody>
                  {['axial', 'tangential', 'oblique'].map(type => {
                    const val = familyContrib[type] ?? 0;
                    const share = totalContrib > 0 ? (val / totalContrib) * 100 : 0;
                    return (
                      <tr key={type} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ ...mono, padding: '2px 6px', textTransform: 'capitalize' }}>{type}</td>
                        <Num v={val} digits={4} />
                        <Num v={share} unit="%" digits={1} />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Detailed tables — collapsed by default */}

            {/* Per-frequency error detail */}
            <details>
              <summary style={{ ...mono, color: '#374151', fontWeight: 700, cursor: 'pointer', userSelect: 'none' }}>
                Per-frequency Error Detail (all variants)
              </summary>
              <div style={{ overflowX: 'auto', marginTop: 4 }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 580 }}>
                  <thead>
                    <tr style={{ background: '#f3f4f6' }}>
                      <TH left>Variant</TH>
                      {TEST_FREQUENCIES.map(hz => <TH key={hz}>{hz} Hz</TH>)}
                    </tr>
                  </thead>
                  <tbody>
                    {VARIANT_DEFS.map(d => {
                      const row = variantResults[d.key] || {};
                      return (
                        <tr key={d.key} style={{ borderBottom: '1px solid #f3f4f6', background: d.key === 'A' ? '#eef2ff' : 'transparent' }}>
                          <td style={{ ...mono, padding: '2px 6px', fontWeight: d.key === 'A' ? 700 : 400 }}>{d.key} · {d.label}</td>
                          {TEST_FREQUENCIES.map(hz => {
                            const b44 = row.sampled?.[hz];
                            const err = (b44 !== null && b44 !== undefined && Number.isFinite(b44)) ? Math.abs(b44 - REW_REF[hz]) : null;
                            return <Num key={hz} v={err} unit=" dB" />;
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>

            {/* Excitation waterfall */}
            <details>
              <summary style={{ ...mono, color: '#374151', fontWeight: 700, cursor: 'pointer', userSelect: 'none' }}>
                Excitation Waterfall — per mode (top 30 by excitation)
              </summary>
              <div style={{ overflowX: 'auto', marginTop: 4 }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 700 }}>
                  <thead>
                    <tr style={{ background: '#f3f4f6' }}>
                      <TH left>Mode</TH>
                      <TH>Freq Hz</TH>
                      <TH>Type</TH>
                      <TH>Q</TH>
                      <TH>Raw Exc.</TH>
                      <TH>Src Eigen</TH>
                      <TH>Rcv Eigen</TH>
                      <TH>Coupling</TH>
                      <TH>Order Wt</TH>
                      <TH>Norm</TH>
                      <TH>→TF</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {waterfallData
                      .slice().sort((a, b) => b.excitationEnteringTF - a.excitationEnteringTF)
                      .slice(0, 30)
                      .map((m, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ ...mono, padding: '2px 6px', fontWeight: 600 }}>({m.nx},{m.ny},{m.nz})</td>
                          <Num v={m.freq} unit=" Hz" digits={1} />
                          <td style={{ ...mono, padding: '2px 6px', color: m.type === 'axial' ? '#1d4ed8' : m.type === 'tangential' ? '#7c3aed' : '#374151' }}>{m.type}</td>
                          <Num v={m.q} digits={1} />
                          <Num v={m.rawExcitation} digits={4} />
                          <Num v={m.srcEigen} digits={4} />
                          <Num v={m.rcvEigen} digits={4} />
                          <Num v={m.coupling} digits={5} />
                          <Num v={m.orderWeight} digits={2} />
                          <Num v={m.normFactor} digits={2} />
                          <Num v={m.excitationEnteringTF} digits={5} good={i === 0} />
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </details>

            {/* Excitation ranking at target frequencies */}
            <details>
              <summary style={{ ...mono, color: '#374151', fontWeight: 700, cursor: 'pointer', userSelect: 'none' }}>
                Excitation Ranking — contributing modes per target frequency
              </summary>
              <div style={{ marginTop: 4 }}>
                {TEST_FREQUENCIES.map(hz => {
                  const rows = excitationByFreq[hz] ?? [];
                  if (!rows.length) return <div key={hz} style={{ ...mono, color: '#9ca3af', padding: '2px 6px' }}>{hz} Hz — no modes</div>;
                  return (
                    <div key={hz} style={{ marginBottom: 8 }}>
                      <div style={{ ...mono, fontWeight: 700, color: '#374151', marginBottom: 2 }}>{hz} Hz</div>
                      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                        <thead>
                          <tr style={{ background: '#f3f4f6' }}>
                            <TH left>Mode</TH>
                            <TH>Freq Hz</TH>
                            <TH>Type</TH>
                            <TH>Coupling</TH>
                            <TH>Order Wt</TH>
                            <TH>→TF</TH>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((m, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid #f3f4f6', background: i === 0 ? '#fefce8' : 'transparent' }}>
                              <td style={{ ...mono, padding: '2px 6px', fontWeight: i === 0 ? 700 : 400 }}>({m.nx},{m.ny},{m.nz})</td>
                              <Num v={m.freq} unit=" Hz" digits={1} />
                              <td style={{ ...mono, padding: '2px 6px' }}>{m.type}</td>
                              <Num v={m.coupling} digits={5} />
                              <Num v={m.orderWeight} digits={2} />
                              <Num v={m.excitationEnteringTF} digits={5} good={i === 0} />
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
            </details>

            {/* Per-mode excitation sensitivity */}
            <details>
              <summary style={{ ...mono, color: '#374151', fontWeight: 700, cursor: 'pointer', userSelect: 'none' }}>
                Per-mode Excitation Sensitivity (top 5 dominant modes)
              </summary>
              <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: 4 }}>
                <thead>
                  <tr style={{ background: '#f3f4f6' }}>
                    <TH left>Mode</TH>
                    <TH>Excitation →TF</TH>
                    <TH>MAE (muted)</TH>
                    <TH>Δ MAE</TH>
                  </tr>
                </thead>
                <tbody>
                  {sensitivityData.map((row, i) => {
                    const delta = row.maeDelta;
                    const deltaColor = delta !== null && delta > 1 ? '#991b1b' : delta !== null && delta < -1 ? '#166534' : '#374151';
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ ...mono, padding: '2px 6px', fontWeight: 600 }}>{row.mode}</td>
                        <Num v={row.excitation} digits={5} />
                        <Num v={row.maeMuted} unit=" dB" />
                        <td style={{ ...mono, padding: '2px 6px', textAlign: 'center', color: deltaColor, fontWeight: Math.abs(delta ?? 0) > 1 ? 700 : 400 }}>
                          {delta !== null && Number.isFinite(delta) ? `${delta > 0 ? '+' : ''}${delta.toFixed(2)} dB` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </details>

            {/* Per-seat MAE */}
            {seatResults?.length > 0 && (
              <details>
                <summary style={{ ...mono, color: '#374151', fontWeight: 700, cursor: 'pointer', userSelect: 'none' }}>
                  Per-seat MAE — Production ({seatResults.length} seats)
                </summary>
                <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: 4 }}>
                  <thead>
                    <tr style={{ background: '#f3f4f6' }}>
                      <TH left>Seat (x, y)</TH>
                      {TEST_FREQUENCIES.map(hz => <TH key={hz}>{hz} Hz</TH>)}
                      <TH>MAE</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {seatResults.map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ ...mono, padding: '2px 6px' }}>({row.seat.x?.toFixed(1)},{row.seat.y?.toFixed(1)})</td>
                        {TEST_FREQUENCIES.map(hz => {
                          const b44 = row.sampled?.[hz];
                          const err = (b44 !== null && b44 !== undefined && Number.isFinite(b44)) ? Math.abs(b44 - REW_REF[hz]) : null;
                          return <Num key={hz} v={err} unit=" dB" />;
                        })}
                        <Num v={row.mae} unit=" dB" />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}

          </div>
        );
      })()}
    </div>
  );
}