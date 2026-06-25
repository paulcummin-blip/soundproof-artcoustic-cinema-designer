/**
 * DestructiveNullStoryAudit
 * Diagnostic only — no production changes, does not affect the live graph.
 *
 * Goal: Determine why B44 is not telling the same engineering story as REW
 * around the 30–40 Hz destructive null.
 * Focus range: 20–60 Hz.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';
import { computeRoomModesLocal, estimateModeQLocal, modeShapeValueLocal } from '@/bass/core/modalCalculations';

// ── Constants ──────────────────────────────────────────────────────────────────

const FLAT_CURVE  = [{ hz: 10, db: 94 }, { hz: 200, db: 94 }];
const SPEED_OF_SOUND = 343;
const NULL_RANGE  = { min: 20, max: 60 };
const REW_NULL_HZ = 40.6;   // known REW null centre
const REW_NULL_DB = -17.0;  // known REW null depth vs local trend

// ── Shared engine options ──────────────────────────────────────────────────────

function baseOpts(surfaceAbsorption, axialQ, extra = {}) {
  return {
    enableModes: true,
    enableReflections: false,
    disableLateField: true,
    modalSourceReferenceMode: 'distance_normalized',
    pureDeterministicModalSum: true,
    disableModalPropagationPhase: true,
    propagationPhaseScale: 0,
    axialQ: axialQ ?? 4.0,
    surfaceAbsorption,
    freqMinHz: 10,
    freqMaxHz: 120,
    ...extra,
  };
}

// ── High-resolution frequency axis ────────────────────────────────────────────

function buildHiResAxis(minHz = 10, maxHz = 120, stepHz = 0.25) {
  const out = [];
  for (let f = minHz; f <= maxHz + 1e-9; f += stepHz) out.push(Math.round(f * 100) / 100);
  return out;
}

// ── Run simulation with a custom frequency axis ────────────────────────────────

function simulateAtFreqs(freqsHz, roomDims, seat, sub, opts) {
  // We call the engine normally and then interpolate at our custom freqs
  const r = simulateBassResponseRewCore(roomDims, seat, sub, FLAT_CURVE, opts);
  // Interpolate engine result onto our requested axis
  const engineFreqs = r.freqsHz;
  const engineSpl   = r.splDbRaw;
  return freqsHz.map(f => {
    let best = null, bestD = Infinity;
    engineFreqs.forEach((ef, i) => { const d = Math.abs(ef - f); if (d < bestD) { bestD = d; best = engineSpl[i]; } });
    return best;
  });
}

// ── Null detection helpers ────────────────────────────────────────────────────

function detectNulls(freqsHz, splDb, minHz = NULL_RANGE.min, maxHz = NULL_RANGE.max) {
  const band = freqsHz
    .map((f, i) => ({ f, s: splDb[i] }))
    .filter(p => p.f >= minHz && p.f <= maxHz && Number.isFinite(p.s));
  if (band.length < 3) return [];

  // Local median as baseline
  const vals = band.map(p => p.s).sort((a, b) => a - b);
  const localMedian = vals[Math.floor(vals.length / 2)];

  // Find local minima
  const nulls = [];
  for (let i = 1; i < band.length - 1; i++) {
    if (band[i].s < band[i - 1].s && band[i].s < band[i + 1].s) {
      const depth = band[i].s - localMedian;
      if (depth < -3) nulls.push({ hz: band[i].f, spl: band[i].s, depth, localMedian });
    }
  }
  return nulls.sort((a, b) => a.depth - b.depth);
}

function nullWidth(freqsHz, splDb, nullHz, thresholdDb) {
  // thresholdDb is the SPL threshold (absolute)
  const sorted = freqsHz.map((f, i) => ({ f, s: splDb[i] })).filter(p => Number.isFinite(p.s)).sort((a, b) => a.f - b.f);
  // Find null index
  let nullIdx = 0, minDist = Infinity;
  sorted.forEach((p, i) => { const d = Math.abs(p.f - nullHz); if (d < minDist) { minDist = d; nullIdx = i; } });

  let left = null, right = null;
  for (let i = nullIdx; i >= 1; i--) {
    if (sorted[i].s <= thresholdDb && sorted[i - 1].s > thresholdDb) {
      const t = (thresholdDb - sorted[i - 1].s) / (sorted[i].s - sorted[i - 1].s);
      left = sorted[i - 1].f + t * (sorted[i].f - sorted[i - 1].f);
      break;
    }
  }
  for (let i = nullIdx; i < sorted.length - 1; i++) {
    if (sorted[i].s <= thresholdDb && sorted[i + 1].s > thresholdDb) {
      const t = (thresholdDb - sorted[i].s) / (sorted[i + 1].s - sorted[i].s);
      right = sorted[i].f + t * (sorted[i + 1].f - sorted[i].f);
      break;
    }
  }
  return left !== null && right !== null ? right - left : null;
}

// ── Complex cancellation at a frequency ───────────────────────────────────────

function complexVectorsAtHz(targetHz, roomDims, seat, sub, modes, surfaceAbsorption, axialQ) {
  const { widthM, lengthM, heightM } = roomDims;
  const dx = sub.x - seat.x, dy = sub.y - seat.y, dz = (sub.z ?? 0.35) - (seat.z ?? 1.2);
  const distM = Math.max(0.01, Math.sqrt(dx * dx + dy * dy + dz * dz));
  const srcAmp = Math.pow(10, 94 / 20) / distM; // flat 94 dB distance_normalized

  // Direct
  const tofPhase = -2 * Math.PI * targetHz * (distM / SPEED_OF_SOUND);
  const dirRe = srcAmp * Math.cos(tofPhase);
  const dirIm = srcAmp * Math.sin(tofPhase);

  // Modal sum
  const modalSrcAmp = srcAmp; // same distance_normalized
  let modRe = 0, modIm = 0;
  modes.forEach(m => {
    const psiSrc = modeShapeValueLocal(m, sub.x, sub.y, sub.z ?? 0.35, { widthM, lengthM, heightM });
    const psiRcv = modeShapeValueLocal(m, seat.x, seat.y, seat.z ?? 1.2, { widthM, lengthM, heightM });
    const coupling = psiSrc * psiRcv;
    const modeOrder = Math.abs(m.nx) + Math.abs(m.ny) + Math.abs(m.nz);
    const orderWt = modeOrder >= 2 ? 0.5 : 1.0;
    const ratio = targetHz / m.freq;
    const realDen = 1 - ratio * ratio;
    const imagDen = ratio / m.qValue;
    const dSq = realDen * realDen + imagDen * imagDen;
    const tfRe = realDen / dSq, tfIm = -imagDen / dSq;
    const axialHO = (m.type === 'axial' && modeOrder >= 2) ? 0.5 : 1.0;
    const gain = modalSrcAmp * coupling * orderWt * axialHO;
    modRe += gain * tfRe;
    modIm += gain * tfIm;
  });

  const dirMag   = Math.sqrt(dirRe * dirRe + dirIm * dirIm);
  const modMag   = Math.sqrt(modRe * modRe + modIm * modIm);
  const totRe    = dirRe + modRe;
  const totIm    = dirIm + modIm;
  const totMag   = Math.sqrt(totRe * totRe + totIm * totIm);
  const dirPhase = (Math.atan2(dirIm, dirRe) * 180) / Math.PI;
  const modPhase = (Math.atan2(modIm, modRe) * 180) / Math.PI;
  let phaseDiff  = modPhase - dirPhase;
  while (phaseDiff > 180) phaseDiff -= 360;
  while (phaseDiff < -180) phaseDiff += 360;

  const cancellationDb = 20 * Math.log10(Math.max(totMag, 1e-10)) - 20 * Math.log10(Math.max(dirMag, 1e-10));
  const verdict = Math.abs(phaseDiff) > 135 ? 'Cancelling' : Math.abs(phaseDiff) < 45 ? 'Reinforcing' : 'Near-orthogonal';

  return { targetHz, dirMag, modMag, totMag, dirPhase, modPhase, phaseDiff, cancellationDb, verdict };
}

// ── Build modes ────────────────────────────────────────────────────────────────

function buildModes(roomDims, surfaceAbsorption, axialQ) {
  const { widthM, lengthM, heightM } = roomDims;
  return computeRoomModesLocal({ widthM, lengthM, heightM, fMax: 120, c: SPEED_OF_SOUND }).map(m => {
    const baseQ = m.type === 'axial' ? (axialQ ?? 4.0) : m.type === 'tangential' ? 3.9 : 2.5;
    const absQ  = estimateModeQLocal({ roomDims, surfaceAbsorption, f0: m.freq });
    return { ...m, qValue: Math.max(1, Math.min(baseQ, absQ)) };
  });
}

// ── Main audit runner ──────────────────────────────────────────────────────────

function runAudit(roomDims, seat, sub, seatingPositions, surfaceAbsorption, axialQ) {
  const opts = baseOpts(surfaceAbsorption, axialQ);

  // ── Test 1A: High-resolution unsmoothed ──────────────────────────────────────
  const hiResFreqs = buildHiResAxis(10, 120, 0.25);
  const hiResSpl   = simulateAtFreqs(hiResFreqs, roomDims, seat, sub, opts);
  const hiResNulls = detectNulls(hiResFreqs, hiResSpl);
  const hiResDeepest = hiResNulls[0] ?? null;

  // ── Test 1B: Current graph resolution ───────────────────────────────────────
  const graphResult  = simulateBassResponseRewCore(roomDims, seat, sub, FLAT_CURVE, opts);
  const graphNulls   = detectNulls(graphResult.freqsHz, graphResult.splDbRaw);
  const graphDeepest = graphNulls[0] ?? null;

  // Null width measurements on hi-res
  let hiResWidth3dB = null, hiResWidth6dB = null;
  if (hiResDeepest) {
    const thr3 = hiResDeepest.spl + 3;
    const thr6 = hiResDeepest.spl + 6;
    hiResWidth3dB = nullWidth(hiResFreqs, hiResSpl, hiResDeepest.hz, thr3);
    hiResWidth6dB = nullWidth(hiResFreqs, hiResSpl, hiResDeepest.hz, thr6);
  }

  // ── Test 2: Frequency alignment ─────────────────────────────────────────────
  const alignmentResults = [];
  if (hiResDeepest) {
    const centre = hiResDeepest.hz;
    const offsets = [0, -0.25, +0.25, -0.5, +0.5, -1, +1, -2, +2];
    offsets.forEach(off => {
      const f = centre + off;
      if (f < 15 || f > 80) return;
      const idx = hiResFreqs.reduce((bi, hf, i) => Math.abs(hf - f) < Math.abs(hiResFreqs[bi] - f) ? i : bi, 0);
      alignmentResults.push({ offset: off, hz: hiResFreqs[idx], spl: hiResSpl[idx] });
    });
  }
  const deepestAlignmentSpl = alignmentResults.length ? Math.min(...alignmentResults.map(r => r.spl)) : null;
  const graphPlottedSplAtNull = graphDeepest?.spl ?? null;
  const hiddenNullDepthDiff = (deepestAlignmentSpl !== null && graphPlottedSplAtNull !== null)
    ? graphPlottedSplAtNull - deepestAlignmentSpl : null;

  // ── Test 3: Complex cancellation at null candidates ──────────────────────────
  const modes = buildModes(roomDims, surfaceAbsorption, axialQ);
  const nullCandidates = hiResNulls.slice(0, 4);
  const complexRows = nullCandidates.map(n =>
    complexVectorsAtHz(n.hz, roomDims, seat, sub, modes, surfaceAbsorption, axialQ)
  );
  // Also add REW null target
  complexRows.push(complexVectorsAtHz(REW_NULL_HZ, roomDims, seat, sub, modes, surfaceAbsorption, axialQ));

  // ── Test 4: Modal fill-in ────────────────────────────────────────────────────
  const fillInHz = hiResDeepest?.hz ?? REW_NULL_HZ;
  const fillInResults = [];
  const { widthM, lengthM, heightM } = roomDims;
  const distToSeat = (() => {
    const dx = sub.x - seat.x, dy = sub.y - seat.y, dz = (sub.z ?? 0.35) - (seat.z ?? 1.2);
    return Math.max(0.01, Math.sqrt(dx * dx + dy * dy + dz * dz));
  })();
  const baseSrcAmp = Math.pow(10, 94 / 20) / distToSeat;
  const tofPhase   = -2 * Math.PI * fillInHz * (distToSeat / SPEED_OF_SOUND);
  const dirRe0 = baseSrcAmp * Math.cos(tofPhase);
  const dirIm0 = baseSrcAmp * Math.sin(tofPhase);
  const dirDb = 20 * Math.log10(Math.max(Math.sqrt(dirRe0 * dirRe0 + dirIm0 * dirIm0), 1e-10));

  // Sort modes by contribution magnitude at fillInHz
  const modeContribs = modes.map(m => {
    const psiSrc = modeShapeValueLocal(m, sub.x, sub.y, sub.z ?? 0.35, { widthM, lengthM, heightM });
    const psiRcv = modeShapeValueLocal(m, seat.x, seat.y, seat.z ?? 1.2, { widthM, lengthM, heightM });
    const coupling = psiSrc * psiRcv;
    const modeOrder = Math.abs(m.nx) + Math.abs(m.ny) + Math.abs(m.nz);
    const orderWt = modeOrder >= 2 ? 0.5 : 1.0;
    const ratio = fillInHz / m.freq;
    const realDen = 1 - ratio * ratio, imagDen = ratio / m.qValue;
    const dSq = realDen * realDen + imagDen * imagDen;
    const tfRe = realDen / dSq, tfIm = -imagDen / dSq;
    const axialHO = (m.type === 'axial' && modeOrder >= 2) ? 0.5 : 1.0;
    const gain = baseSrcAmp * coupling * orderWt * axialHO;
    const mag = Math.abs(gain) * Math.sqrt(tfRe * tfRe + tfIm * tfIm);
    return { mode: m, gain, tfRe, tfIm, mag, re: gain * tfRe, im: gain * tfIm };
  }).sort((a, b) => b.mag - a.mag);

  const computeSum = (topN) => {
    let re = dirRe0, im = dirIm0;
    modeContribs.slice(0, topN).forEach(c => { re += c.re; im += c.im; });
    return 20 * Math.log10(Math.max(Math.sqrt(re * re + im * im), 1e-10));
  };

  // Modal only
  let mRe = 0, mIm = 0;
  modeContribs.forEach(c => { mRe += c.re; mIm += c.im; });
  const modalOnlyDb = 20 * Math.log10(Math.max(Math.sqrt(mRe * mRe + mIm * mIm), 1e-10));

  fillInResults.push({ label: 'A: Direct only',              spl: dirDb });
  fillInResults.push({ label: 'B: Modal only',               spl: modalOnlyDb });
  fillInResults.push({ label: 'C: Direct + strongest mode',  spl: computeSum(1) });
  fillInResults.push({ label: 'D: Direct + top 3 modes',     spl: computeSum(3) });
  fillInResults.push({ label: 'E: Direct + all modes',       spl: computeSum(modeContribs.length) });

  // ── Test 5: Movement sensitivity ────────────────────────────────────────────
  const OFFSETS = [
    { type: 'sub',  axis: 'x', delta: +0.25 },
    { type: 'sub',  axis: 'x', delta: -0.25 },
    { type: 'sub',  axis: 'y', delta: +0.25 },
    { type: 'sub',  axis: 'y', delta: -0.25 },
    { type: 'sub',  axis: 'x', delta: +0.50 },
    { type: 'sub',  axis: 'x', delta: -0.50 },
    { type: 'sub',  axis: 'y', delta: +0.50 },
    { type: 'sub',  axis: 'y', delta: -0.50 },
    { type: 'seat', axis: 'x', delta: +0.25 },
    { type: 'seat', axis: 'x', delta: -0.25 },
    { type: 'seat', axis: 'y', delta: +0.25 },
    { type: 'seat', axis: 'y', delta: -0.25 },
    { type: 'seat', axis: 'x', delta: +0.50 },
    { type: 'seat', axis: 'x', delta: -0.50 },
    { type: 'seat', axis: 'y', delta: +0.50 },
    { type: 'seat', axis: 'y', delta: -0.50 },
  ];

  const baseline20_60 = (() => {
    const n = detectNulls(hiResFreqs, hiResSpl, 20, 60);
    return n[0] ?? null;
  })();

  const movementRows = OFFSETS.map(off => {
    try {
      const movedSub  = off.type === 'sub'  ? { ...sub,  [off.axis]: (sub[off.axis] ?? 0) + off.delta } : sub;
      const movedSeat = off.type === 'seat' ? { ...seat, [off.axis]: (seat[off.axis] ?? 0) + off.delta } : seat;
      const r = simulateBassResponseRewCore(roomDims, movedSeat, movedSub, FLAT_CURVE, opts);
      const spl = r.splDbRaw;
      const frq = r.freqsHz;
      const nulls = detectNulls(frq, spl, 20, 60);
      const deepest = nulls[0] ?? null;
      const freqShift = (deepest && baseline20_60) ? deepest.hz - baseline20_60.hz : null;
      const depthChange = (deepest && baseline20_60) ? deepest.depth - baseline20_60.depth : null;
      return {
        label: `${off.type} ${off.axis}${off.delta > 0 ? '+' : ''}${off.delta}m`,
        nullHz: deepest?.hz ?? null,
        nullSpl: deepest?.spl ?? null,
        nullDepth: deepest?.depth ?? null,
        freqShift,
        depthChange,
        verdict: depthChange !== null ? (depthChange < -3 ? '↑ worse' : depthChange > 3 ? '↓ better' : '~ similar') : '—',
      };
    } catch { return { label: `${off.type} ${off.axis}${off.delta > 0 ? '+' : ''}${off.delta}m`, nullHz: null, nullSpl: null, nullDepth: null, freqShift: null, depthChange: null, verdict: 'err' }; }
  });

  const maxMovementChange = movementRows.map(r => Math.abs(r.depthChange ?? 0)).reduce((m, v) => Math.max(m, v), 0);

  // ── Engineering verdict ──────────────────────────────────────────────────────
  const findings = [];
  const hiResDeepestDepth = hiResDeepest?.depth ?? 0;

  if (hiResDeepestDepth < -10 && hiResDeepest?.hz >= 28 && hiResDeepest?.hz <= 45) {
    findings.push({ key: 'detected', text: 'B44 detects the destructive null — graph display is too forgiving.', color: '#92400e', bg: '#fffbeb' });
  } else if (hiResDeepestDepth > -8) {
    findings.push({ key: 'missing', text: 'B44 model is missing the destructive null behaviour (REW shows −17 dB at 40.6 Hz).', color: '#991b1b', bg: '#fee2e2' });
  }

  if (maxMovementChange > 6) {
    findings.push({ key: 'placement', text: 'Placement-critical — small position changes shift null by >6 dB. Flag as layout issue, not EQ issue.', color: '#7c3aed', bg: '#f5f3ff' });
  }

  if (hiddenNullDepthDiff !== null && hiddenNullDepthDiff < -3) {
    findings.push({ key: 'smoothing', text: `Display smoothing / sampling is hiding a critical null by ~${Math.abs(hiddenNullDepthDiff).toFixed(1)} dB.`, color: '#0369a1', bg: '#eff6ff' });
  }

  const nullType = (hiResWidth6dB !== null && hiResWidth6dB < 5) ? 'Placement-critical destructive cancellation'
    : (hiResWidth6dB !== null && hiResWidth6dB > 10) ? 'EQ-safe broad depression'
    : 'Narrow-band null — character unclear';

  if (findings.length === 0) {
    findings.push({ key: 'unclear', text: 'B44 does not currently reproduce the REW null story — further investigation needed.', color: '#374151', bg: '#f3f4f6' });
  }

  return {
    hiRes: { freqs: hiResFreqs, spl: hiResSpl, deepest: hiResDeepest, width3dB: hiResWidth3dB, width6dB: hiResWidth6dB },
    graph: { deepest: graphDeepest },
    alignmentResults,
    hiddenNullDepthDiff,
    complexRows,
    fillInResults,
    movementRows,
    maxMovementChange,
    baseline20_60,
    findings,
    nullType,
  };
}

// ── UI helpers ─────────────────────────────────────────────────────────────────

const mono = { fontFamily: 'monospace', fontSize: 10 };
const fmt = (v, d = 2, unit = '') => (v !== null && v !== undefined && Number.isFinite(Number(v))) ? `${Number(v).toFixed(d)}${unit}` : '—';

function TH({ ch, left }) {
  return <th style={{ ...mono, padding: '3px 6px', fontSize: 9, fontWeight: 700, color: '#6b7280', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', textAlign: left ? 'left' : 'right' }}>{ch}</th>;
}

function TD({ v, unit = '', digits = 2, color }) {
  const n = Number(v);
  return <td style={{ ...mono, padding: '2px 6px', textAlign: 'right', color: color ?? (Number.isFinite(n) ? '#1c1917' : '#9ca3af') }}>{Number.isFinite(n) ? `${n.toFixed(digits)}${unit}` : '—'}</td>;
}

function SectionTitle({ label, color = '#334155', bg = '#f8fafc', border = '#CBD5E1' }) {
  return <div style={{ fontWeight: 700, fontSize: 10, color, background: bg, border: `1px solid ${border}`, borderRadius: 4, padding: '3px 8px', marginBottom: 6, marginTop: 8 }}>{label}</div>;
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function DestructiveNullStoryAudit({ roomDims, seat, sub, seatingPositions, surfaceAbsorption, axialQ }) {
  const [running, setRunning] = useState(false);
  const [data, setData]       = useState(null);

  const handleRun = useCallback(() => {
    if (!roomDims || !seat || !sub) return;
    setRunning(true);
    setTimeout(() => {
      try {
        const result = runAudit(roomDims, seat, sub, seatingPositions, surfaceAbsorption, axialQ ?? 4.0);
        setData(result);
      } catch (e) {
        setData({ error: e.message });
      }
      setRunning(false);
    }, 20);
  }, [roomDims, seat, sub, seatingPositions, surfaceAbsorption, axialQ]);

  return (
    <div style={{ border: '1px solid #dc2626', borderRadius: 8, background: '#fff5f5', padding: '10px 12px', marginBottom: 8 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 700, color: '#991b1b', fontSize: 11, fontFamily: 'monospace' }}>
            Destructive Null Story Audit — 20–60 Hz
          </div>
          <div style={{ color: '#b91c1c', fontSize: 9, fontFamily: 'monospace', marginTop: 1 }}>
            Diagnostic only · no production changes · REW null: {REW_NULL_HZ} Hz / {REW_NULL_DB} dB
          </div>
        </div>
        <button
          onClick={handleRun}
          disabled={running || !roomDims || !seat || !sub}
          style={{ padding: '5px 14px', borderRadius: 5, fontSize: 10, fontFamily: 'monospace', fontWeight: 700,
            background: running ? '#e5e7eb' : '#991b1b', color: running ? '#6b7280' : '#fff',
            border: 'none', cursor: running ? 'not-allowed' : 'pointer' }}
        >
          {running ? 'Running…' : data ? 'Re-run' : 'Run Audit'}
        </button>
      </div>

      {(!seat || !sub) && <div style={{ color: '#991b1b', fontSize: 10, fontFamily: 'monospace' }}>⚠ Need seat and sub to run.</div>}
      {data?.error && <div style={{ color: '#991b1b', fontSize: 10, fontFamily: 'monospace', padding: 6, background: '#fee2e2', borderRadius: 4 }}>Error: {data.error}</div>}

      {data && !data.error && (() => {
        const { hiRes, graph, alignmentResults, hiddenNullDepthDiff, complexRows, fillInResults, movementRows, findings, nullType } = data;

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

            {/* ── VERDICT ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {findings.map(f => (
                <div key={f.key} style={{ padding: '7px 10px', borderRadius: 6, background: f.bg, border: `1px solid ${f.color}33`, fontFamily: 'monospace', fontSize: 10, color: f.color, fontWeight: 700 }}>
                  {f.text}
                </div>
              ))}
              <div style={{ padding: '4px 8px', borderRadius: 4, background: '#f3f4f6', fontSize: 9, fontFamily: 'monospace', color: '#374151' }}>
                Null character: <strong>{nullType}</strong>
              </div>
            </div>

            {/* ── NULL SUMMARY TABLE ── */}
            <SectionTitle label="Null Summary — 20–60 Hz" color="#991b1b" bg="#fef2f2" border="#fca5a5" />
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <TH ch="Source" left />
                  <TH ch="Null Hz" />
                  <TH ch="Null dB" />
                  <TH ch="Depth vs trend" />
                  <TH ch="Width @−3dB" />
                  <TH ch="Width @−6dB" />
                  <TH ch="Character" />
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid #fee2e2', background: '#fff' }}>
                  <td style={{ ...mono, padding: '2px 6px', fontWeight: 700, color: '#991b1b' }}>Hi-res 0.25 Hz (A)</td>
                  <TD v={hiRes.deepest?.hz} digits={2} unit=" Hz" />
                  <TD v={hiRes.deepest?.spl} digits={1} unit=" dB" color={hiRes.deepest?.depth < -10 ? '#991b1b' : '#374151'} />
                  <TD v={hiRes.deepest?.depth} digits={1} unit=" dB" color={hiRes.deepest?.depth < -10 ? '#991b1b' : '#374151'} />
                  <TD v={hiRes.width3dB} digits={1} unit=" Hz" />
                  <TD v={hiRes.width6dB} digits={1} unit=" Hz" />
                  <td style={{ ...mono, padding: '2px 6px', color: '#374151', fontSize: 9 }}>
                    {hiRes.width6dB !== null ? (hiRes.width6dB < 5 ? 'Narrow / placement-critical' : hiRes.width6dB > 10 ? 'Broad / EQ-safe' : 'Moderate') : '—'}
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid #fee2e2', background: '#fafafa' }}>
                  <td style={{ ...mono, padding: '2px 6px', fontWeight: 700, color: '#374151' }}>Graph resolution (B)</td>
                  <TD v={graph.deepest?.hz} digits={2} unit=" Hz" />
                  <TD v={graph.deepest?.spl} digits={1} unit=" dB" />
                  <TD v={graph.deepest?.depth} digits={1} unit=" dB" />
                  <td colSpan={2} style={{ ...mono, padding: '2px 6px', color: '#9ca3af', fontSize: 9 }}>not measured</td>
                  <td style={{ ...mono, padding: '2px 6px' }}>—</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #fee2e2', background: '#fff' }}>
                  <td style={{ ...mono, padding: '2px 6px', fontWeight: 700, color: '#92400e' }}>REW target</td>
                  <td style={{ ...mono, padding: '2px 6px', textAlign: 'right', color: '#92400e' }}>{REW_NULL_HZ.toFixed(1)} Hz</td>
                  <td colSpan={2} style={{ ...mono, padding: '2px 6px', textAlign: 'right', color: '#92400e' }}>{REW_NULL_DB.toFixed(1)} dB</td>
                  <td colSpan={3} style={{ ...mono, padding: '2px 6px', color: '#9ca3af', fontSize: 9 }}>broad ~10 Hz wide</td>
                </tr>
              </tbody>
            </table>

            {/* ── MOVEMENT SENSITIVITY ── */}
            <SectionTitle label="Sub / Seat Movement Sensitivity" color="#7c3aed" bg="#f5f3ff" border="#c4b5fd" />
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <TH ch="Movement" left />
                  <TH ch="Null Hz" />
                  <TH ch="Null dB" />
                  <TH ch="Depth dB" />
                  <TH ch="Freq shift" />
                  <TH ch="Depth Δ" />
                  <TH ch="" left />
                </tr>
              </thead>
              <tbody>
                {movementRows.map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #ede9fe' }}>
                    <td style={{ ...mono, padding: '2px 6px', fontWeight: 500 }}>{row.label}</td>
                    <TD v={row.nullHz} digits={1} unit=" Hz" />
                    <TD v={row.nullSpl} digits={1} unit=" dB" />
                    <TD v={row.nullDepth} digits={1} unit=" dB" color={row.nullDepth < -10 ? '#991b1b' : undefined} />
                    <TD v={row.freqShift} digits={1} unit=" Hz" />
                    <TD v={row.depthChange} digits={1} unit=" dB" color={row.depthChange !== null && row.depthChange < -3 ? '#991b1b' : row.depthChange > 3 ? '#166534' : undefined} />
                    <td style={{ ...mono, padding: '2px 6px', fontSize: 9, color: row.verdict.includes('worse') ? '#991b1b' : row.verdict.includes('better') ? '#166534' : '#6b7280' }}>{row.verdict}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* ── TEST 4: Modal fill-in ── */}
            <SectionTitle label="Modal Fill-In at Null Frequency" color="#065f46" bg="#ecfdf5" border="#6ee7b7" />
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <TH ch="Configuration" left />
                  <TH ch="SPL at null Hz" />
                  <TH ch="vs Direct only" />
                </tr>
              </thead>
              <tbody>
                {fillInResults.map((row, i) => {
                  const delta = i > 0 ? row.spl - fillInResults[0].spl : null;
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #d1fae5', background: i === 4 ? '#f0fdf4' : 'transparent' }}>
                      <td style={{ ...mono, padding: '2px 6px', fontWeight: i === 4 ? 700 : 400 }}>{row.label}</td>
                      <TD v={row.spl} digits={1} unit=" dB" />
                      <td style={{ ...mono, padding: '2px 6px', textAlign: 'right', color: delta !== null ? (delta > 3 ? '#991b1b' : delta < -3 ? '#166534' : '#374151') : '#9ca3af' }}>
                        {delta !== null ? `${delta > 0 ? '+' : ''}${delta.toFixed(1)} dB` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* ── COLLAPSED DETAIL SECTIONS ── */}

            {/* Frequency alignment */}
            <details>
              <summary style={{ ...mono, fontWeight: 700, color: '#374151', cursor: 'pointer', userSelect: 'none', fontSize: 10 }}>
                Test 2 — Frequency Alignment (offset sampling at null centre)
              </summary>
              <div style={{ marginTop: 6 }}>
                {hiddenNullDepthDiff !== null && (
                  <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#0369a1', marginBottom: 4 }}>
                    Hidden null depth vs graph: {hiddenNullDepthDiff > 0 ? '+' : ''}{hiddenNullDepthDiff.toFixed(1)} dB
                    {Math.abs(hiddenNullDepthDiff) > 3 ? ' ⚠ sampling is hiding null depth' : ' ✓ sampling is adequate'}
                  </div>
                )}
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <thead>
                    <tr><TH ch="Offset" left /><TH ch="Hz" /><TH ch="SPL dB" /></tr>
                  </thead>
                  <tbody>
                    {alignmentResults.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f3f4f6', background: r.offset === 0 ? '#fefce8' : 'transparent' }}>
                        <td style={{ ...mono, padding: '2px 6px', fontWeight: r.offset === 0 ? 700 : 400 }}>{r.offset === 0 ? 'baseline' : `${r.offset > 0 ? '+' : ''}${r.offset} Hz`}</td>
                        <TD v={r.hz} digits={2} unit=" Hz" />
                        <TD v={r.spl} digits={1} unit=" dB" color={r.spl === Math.min(...alignmentResults.map(x => x.spl)) ? '#991b1b' : undefined} />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>

            {/* Complex cancellation vectors */}
            <details>
              <summary style={{ ...mono, fontWeight: 700, color: '#374151', cursor: 'pointer', userSelect: 'none', fontSize: 10 }}>
                Test 3 — Complex Cancellation Vectors at Null Candidates
              </summary>
              <div style={{ overflowX: 'auto', marginTop: 6 }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 640 }}>
                  <thead>
                    <tr>
                      <TH ch="Hz" left />
                      <TH ch="Direct dB" />
                      <TH ch="Modal dB" />
                      <TH ch="Combined dB" />
                      <TH ch="Direct °" />
                      <TH ch="Modal °" />
                      <TH ch="Δ phase °" />
                      <TH ch="Cancel dB" />
                      <TH ch="Verdict" left />
                    </tr>
                  </thead>
                  <tbody>
                    {complexRows.map((row, i) => {
                      const isREW = Math.abs(row.targetHz - REW_NULL_HZ) < 0.5;
                      const dirDb = 20 * Math.log10(Math.max(row.dirMag, 1e-10));
                      const modDb = 20 * Math.log10(Math.max(row.modMag, 1e-10));
                      const totDb = 20 * Math.log10(Math.max(row.totMag, 1e-10));
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid #f3f4f6', background: isREW ? '#fef3c7' : 'transparent' }}>
                          <td style={{ ...mono, padding: '2px 6px', fontWeight: isREW ? 700 : 400, color: isREW ? '#92400e' : undefined }}>
                            {row.targetHz.toFixed(1)}{isREW ? ' ★REW' : ''}
                          </td>
                          <TD v={dirDb} digits={1} unit=" dB" />
                          <TD v={modDb} digits={1} unit=" dB" />
                          <TD v={totDb} digits={1} unit=" dB" color={row.cancellationDb < -10 ? '#991b1b' : undefined} />
                          <TD v={row.dirPhase} digits={0} unit="°" />
                          <TD v={row.modPhase} digits={0} unit="°" />
                          <TD v={row.phaseDiff} digits={0} unit="°" color={Math.abs(row.phaseDiff) > 135 ? '#991b1b' : '#374151'} />
                          <TD v={row.cancellationDb} digits={1} unit=" dB" color={row.cancellationDb < -10 ? '#991b1b' : '#374151'} />
                          <td style={{ ...mono, padding: '2px 6px', fontSize: 9, color: row.verdict === 'Cancelling' ? '#991b1b' : row.verdict === 'Reinforcing' ? '#166534' : '#374151' }}>{row.verdict}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>

          </div>
        );
      })()}
    </div>
  );
}