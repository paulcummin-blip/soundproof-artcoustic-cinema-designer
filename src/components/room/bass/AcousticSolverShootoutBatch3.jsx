/**
 * AcousticSolverShootoutBatch3.jsx
 * Diagnostic-only: Modal Contribution Chain Audit (20–60 Hz)
 *
 * Purpose: explain WHY the current solver produces the response it does.
 * Does NOT modify the production solver, physics, or calculations.
 *
 * Uses exactly the same primitives as rewBassEngine.js:
 *   - computeRoomModesLocal   → same mode set
 *   - estimateModeQLocal      → same Q calculation
 *   - modeShapeValueLocal     → same shape coupling
 *   - resonantTransfer        → same transfer function
 *
 * All options mirror BassResponse.jsx flat_rew_reference + full_field parity path.
 */

import React, { useState } from 'react';
import {
  computeRoomModesLocal,
  estimateModeQLocal,
  modeShapeValueLocal,
  resonantTransfer,
} from '../../../bass/core/modalCalculations.js';

// ─── Constants ─────────────────────────────────────────────────────────────────
const SPEED_OF_SOUND = 343;
const FREQ_MIN_AUDIT = 20;
const FREQ_MAX_AUDIT = 60;
const FREQ_MAX_MODES = 200; // compute all modes up to 200 Hz — same as production
const REW_NULL_HZ    = 40.6;
const REW_NULL_DB    = -17.0;
const TOP_N          = 10;

// ─── Helpers ───────────────────────────────────────────────────────────────────
function fmt(v, d = 3) { return v == null || !Number.isFinite(v) ? '—' : Number(v).toFixed(d); }
function fmtPct(v)     { return v == null || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(1)}%`; }
function fmtDeg(rad)   { return !Number.isFinite(rad) ? '—' : `${((rad * 180) / Math.PI).toFixed(1)}°`; }
function modeId(m)     { return `(${m.nx},${m.ny},${m.nz})`; }
function axisLabel(m)  {
  if (m.type !== 'axial') return '';
  if (m.nx > 0) return 'width';
  if (m.ny > 0) return 'length';
  return 'height';
}

// ─── Build dense log-spaced axis across audit window ───────────────────────────
function buildAuditFreqs(minHz = FREQ_MIN_AUDIT, maxHz = FREQ_MAX_AUDIT, ppOct = 192) {
  const freqs = [];
  const total = Math.ceil(Math.log2(maxHz / minHz) * ppOct);
  for (let i = 0; i <= total; i++) {
    const hz = minHz * Math.pow(2, i / ppOct);
    if (hz > maxHz) break;
    freqs.push(hz);
  }
  if (freqs[freqs.length - 1] < maxHz) freqs.push(maxHz);
  return freqs;
}

// ─── Q for a mode, matching production defaults ────────────────────────────────
function getModeQ(mode, axialQ, roomDims, surfaceAbsorption) {
  const axes = (mode.nx > 0 ? 1 : 0) + (mode.ny > 0 ? 1 : 0) + (mode.nz > 0 ? 1 : 0);
  const baseQ = axes === 1 ? axialQ : axes === 2 ? 3.9 : 2.5;
  const absQ  = estimateModeQLocal({ roomDims, surfaceAbsorption, f0: mode.freq });
  return Math.max(1, Math.min(baseQ, absQ));
}

// ─── Core audit engine ─────────────────────────────────────────────────────────
// Re-implements the production modal accumulation loop from rewBassEngine for a
// single (freq, sub, seat) point, returning per-mode breakdown.
function auditAtFrequency(hz, roomDims, seatPos, sub, axialQ, surfaceAbsorption) {
  const { widthM, lengthM, heightM } = roomDims;
  const src = { x: Number(sub.x), y: Number(sub.y), z: Number(sub.z ?? 0.35) };
  const lst = { x: Number(seatPos.x), y: Number(seatPos.y), z: Number(seatPos.z ?? 1.2) };

  // Direct field (no reflections — matches flat_rew_reference + full_field)
  const gainDb = sub?.tuning?.gainDb ?? 0;
  const dxd = src.x - lst.x, dyd = src.y - lst.y, dzd = src.z - lst.z;
  const distD = Math.max(0.01, Math.sqrt(dxd * dxd + dyd * dyd + dzd * dzd));
  // distance_normalized source reference: gain = 94 dB @ distance (not 1 m)
  const directAmp = Math.pow(10, (94 - 20 * Math.log10(distD) + gainDb) / 20);

  const allModes = computeRoomModesLocal({ widthM, lengthM, heightM, fMax: FREQ_MAX_MODES, c: SPEED_OF_SOUND });

  let totalRe = directAmp;
  let totalIm = 0;
  const modeContribs = [];

  for (const mode of allModes) {
    const qValue = getModeQ(mode, axialQ, roomDims, surfaceAbsorption);
    const srcCoupling = modeShapeValueLocal(mode, src.x, src.y, src.z, { widthM, lengthM, heightM });
    const lstCoupling = modeShapeValueLocal(mode, lst.x, lst.y, lst.z, { widthM, lengthM, heightM });
    const combined    = srcCoupling * lstCoupling;

    const order       = Math.abs(mode.nx) + Math.abs(mode.ny) + Math.abs(mode.nz);
    const orderWeight = order >= 2 ? 0.50 : 1.0;

    const { re: tRe, im: tIm, transferMag, realDen, imagDen } = resonantTransfer(hz, mode.freq, qValue);
    const transferPhase = Math.atan2(tIm, tRe);

    const gain  = directAmp * combined * orderWeight;
    const cRe   = gain * tRe;
    const cIm   = gain * tIm;
    const cMag  = Math.sqrt(cRe * cRe + cIm * cIm);
    const cPhase = Math.atan2(cIm, cRe);

    totalRe += cRe;
    totalIm += cIm;

    modeContribs.push({
      mode,
      qValue,
      srcCoupling,
      lstCoupling,
      combined,
      orderWeight,
      transferMag,
      transferPhase,
      realDen,
      imagDen,
      cRe,
      cIm,
      cMag,
      cPhase,
    });
  }

  const totalMag   = Math.sqrt(totalRe * totalRe + totalIm * totalIm);
  const totalPhase = Math.atan2(totalIm, totalRe);
  const totalSpl   = 20 * Math.log10(Math.max(totalMag, 1e-10));

  // Assign percentage of total pressure magnitude
  for (const mc of modeContribs) {
    mc.pctOfTotal = totalMag > 1e-10 ? mc.cMag / totalMag : 0;
  }

  return { hz, totalRe, totalIm, totalMag, totalPhase, totalSpl, directAmp, modeContribs, allModes };
}

// ─── Find dominant null in audit window ────────────────────────────────────────
function findDominantNull(freqsHz, splDb) {
  let minDb = Infinity, minIdx = -1;
  for (let i = 0; i < freqsHz.length; i++) {
    if (freqsHz[i] < FREQ_MIN_AUDIT || freqsHz[i] > FREQ_MAX_AUDIT) continue;
    if (splDb[i] < minDb) { minDb = splDb[i]; minIdx = i; }
  }
  if (minIdx === -1) return null;
  // Local depth
  const nullHz = freqsHz[minIdx];
  const loHz = Math.max(20, nullHz / Math.pow(2, 1.5));
  const hiHz = Math.min(200, nullHz * Math.pow(2, 1.5));
  let peakDb = -Infinity;
  for (let i = 0; i < freqsHz.length; i++) {
    if (freqsHz[i] < loHz || freqsHz[i] > hiHz) continue;
    if (splDb[i] > peakDb) peakDb = splDb[i];
  }
  return { nullHz, nullDb: minDb, nullDepthDb: minDb - peakDb };
}

// ─── Build full SPL curve across audit window ──────────────────────────────────
function buildAuditCurve(roomDims, seatPos, sub, axialQ, surfaceAbsorption) {
  const freqsHz = buildAuditFreqs();
  const splDb   = [];
  for (const hz of freqsHz) {
    const { totalSpl } = auditAtFrequency(hz, roomDims, seatPos, sub, axialQ, surfaceAbsorption);
    splDb.push(totalSpl);
  }
  return { freqsHz, splDb };
}

// ─── Diagnosis helpers ─────────────────────────────────────────────────────────
function diagnoseMode(mc, directAmp, nullHz) {
  const reasons = [];
  if (Math.abs(mc.srcCoupling) < 0.05)  reasons.push('weakly excited (src coupling ≈ 0)');
  if (Math.abs(mc.lstCoupling) < 0.05)  reasons.push('weakly coupled (rcv coupling ≈ 0)');
  if (mc.transferMag < 0.1)             reasons.push('transfer-limited (|H| < 0.1)');
  const phaseDeg = Math.abs(mc.cPhase * 180 / Math.PI);
  if (phaseDeg > 135)                   reasons.push('phase-cancelled (contribution phase opposing direct)');
  if (mc.pctOfTotal < 0.01)             reasons.push('overwhelmed by stronger modes');
  if (reasons.length === 0) {
    const distHz = Math.abs(mc.mode.freq - nullHz);
    if (distHz > 5) reasons.push('off-resonance (mode freq > 5 Hz from null)');
    else reasons.push('contributing constructively — not the cancellation source');
  }
  return reasons.join('; ');
}

function buildFinalVerdict(nullHz, modeContribs, directAmp, mode100, mode010) {
  if (!modeContribs || modeContribs.length === 0) return 'Audit failed — no modal data.';

  const top5 = [...modeContribs].sort((a, b) => b.cMag - a.cMag).slice(0, 5);
  const topIds = top5.map(mc => modeId(mc.mode)).join(', ');

  // What is the dominant destructive contributor near the null?
  const destructive = modeContribs
    .filter(mc => {
      const phaseDeg = mc.cPhase * 180 / Math.PI;
      return Math.abs(phaseDeg) > 90 && Math.abs(mc.mode.freq - nullHz) < 15;
    })
    .sort((a, b) => b.cMag - a.cMag);

  const dominant = modeContribs.sort((a, b) => b.cMag - a.cMag)[0];

  let verdict = `Null at ${fmt(nullHz, 1)} Hz. `;
  verdict += `Top contributors: ${topIds}. `;

  if (destructive.length > 0) {
    verdict += `Primary destructive contributor near null: ${modeId(destructive[0].mode)} at ${fmt(destructive[0].mode.freq, 1)} Hz `;
    verdict += `(phase ${fmtDeg(destructive[0].cPhase)}, magnitude ${fmt(destructive[0].cMag, 4)}). `;
    const deg = Math.abs(destructive[0].cPhase * 180 / Math.PI);
    if (deg > 150) verdict += `Stage: PHASE RELATIONSHIP — contribution is near anti-phase with the direct field. `;
    else           verdict += `Stage: COMPLEX SUMMATION — partial cancellation from mode phase mismatch. `;
  }

  if (mode100 && mode010) {
    const ratio = mode100.cMag > 1e-12 ? mode010.cMag / mode100.cMag : null;
    if (ratio != null) {
      if (ratio > 2) verdict += `(0,1,0) dominates over (1,0,0) by factor ${fmt(ratio, 2)}×. `;
      else if (ratio < 0.5) verdict += `(1,0,0) dominates over (0,1,0) by factor ${fmt(1/ratio, 2)}×. `;
      else verdict += `(1,0,0) and (0,1,0) contribute similarly (ratio ${fmt(ratio, 2)}). `;
    }
  }

  return verdict;
}

// ─── Component ─────────────────────────────────────────────────────────────────
export default function AcousticSolverShootoutBatch3({
  roomDims,
  seatPos,
  subsForSimulation,
  surfaceAbsorption,
  axialQ = 4.0,
  liveProductionData = null,
}) {
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);
  const [error,   setError]   = useState(null);

  function runAudit() {
    setRunning(true);
    setError(null);
    setResults(null);

    try {
      if (!Array.isArray(subsForSimulation) || subsForSimulation.length === 0) {
        setError('No active subs in subsForSimulation.'); setRunning(false); return;
      }
      if (!roomDims?.widthM || !roomDims?.lengthM || !roomDims?.heightM) {
        setError('Room dimensions missing.'); setRunning(false); return;
      }

      const sub = subsForSimulation[0]; // audit primary sub

      // ── 1. Build full audit curve to find dominant null ──
      const { freqsHz: curveFreqs, splDb: curveSpl } = buildAuditCurve(
        roomDims, seatPos, sub, axialQ, surfaceAbsorption);
      const nullInfo = findDominantNull(curveFreqs, curveSpl);
      const auditHz  = nullInfo?.nullHz ?? REW_NULL_HZ; // fall back to REW target if no null found

      // ── 2. Full chain audit AT the dominant null frequency ──
      const audit = auditAtFrequency(auditHz, roomDims, seatPos, sub, axialQ, surfaceAbsorption);

      // ── 3. Also audit at REW target (40.6 Hz) for comparison ──
      const auditAtRew = auditAtFrequency(REW_NULL_HZ, roomDims, seatPos, sub, axialQ, surfaceAbsorption);

      // ── 4. Sort contributions by magnitude ──
      const sorted = [...audit.modeContribs].sort((a, b) => b.cMag - a.cMag);
      const sortedAtRew = [...auditAtRew.modeContribs].sort((a, b) => b.cMag - a.cMag);

      // Add rank
      sorted.forEach((mc, i) => { mc.rank = i + 1; });
      sortedAtRew.forEach((mc, i) => { mc.rankAtRew = i + 1; });

      // ── 5. Find (1,0,0) and (0,1,0) specifically ──
      const mode100 = sorted.find(mc => mc.mode.nx === 1 && mc.mode.ny === 0 && mc.mode.nz === 0);
      const mode010 = sorted.find(mc => mc.mode.nx === 0 && mc.mode.ny === 1 && mc.mode.nz === 0);
      const mode100AtRew = sortedAtRew.find(mc => mc.mode.nx === 1 && mc.mode.ny === 0 && mc.mode.nz === 0);
      const mode010AtRew = sortedAtRew.find(mc => mc.mode.nx === 0 && mc.mode.ny === 1 && mc.mode.nz === 0);

      // ── 6. Audit window modes only (20–60 Hz) for display ──
      const auditWindowModes = sorted.filter(mc =>
        mc.mode.freq >= FREQ_MIN_AUDIT && mc.mode.freq <= FREQ_MAX_AUDIT);

      // ── 7. Verdict ──
      const finalVerdict = buildFinalVerdict(auditHz, audit.modeContribs, audit.directAmp, mode100, mode010);

      setResults({
        auditHz, nullInfo, audit, auditAtRew,
        sorted, sortedAtRew, auditWindowModes,
        mode100, mode010, mode100AtRew, mode010AtRew,
        finalVerdict,
        liveNullHz: nullInfo?.nullHz,
        liveNullDepth: nullInfo?.nullDepthDb,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }

  const bv = results;

  return (
    <details className="border border-purple-500 rounded bg-purple-50 mt-4">
      <summary className="px-3 py-2 text-xs font-semibold cursor-pointer select-none text-purple-900">
        🔬 Acoustic Solver Shootout — Batch 3 (Modal Contribution Chain Audit, 20–60 Hz)
      </summary>

      <div className="px-4 pb-5 pt-2 space-y-4 text-xs font-mono">
        <p className="text-purple-800">
          Engineering audit — explains WHY the current modal solver produces the response it does.
          Uses identical production primitives. 20–60 Hz only.
          REW target: <strong>40.6 Hz / −17.0 dB depth</strong>.
        </p>

        <button
          onClick={runAudit}
          disabled={running}
          className="px-3 py-1 text-xs bg-purple-700 text-white rounded hover:bg-purple-800 disabled:opacity-50"
        >
          {running ? 'Auditing…' : 'Run Batch 3 Audit'}
        </button>

        {error && (
          <div className="p-2 border border-red-400 bg-red-50 text-red-800 rounded text-xs">{error}</div>
        )}

        {results && (() => {
          const { auditHz, nullInfo, audit, auditAtRew,
                  sorted, sortedAtRew, auditWindowModes,
                  mode100, mode010, mode100AtRew, mode010AtRew,
                  finalVerdict, liveNullHz, liveNullDepth } = results;

          const top10Ids = new Set(sorted.slice(0, TOP_N).map(mc => modeId(mc.mode)));

          return (
            <div className="space-y-4">

              {/* ── Null summary ── */}
              <div className="p-2 rounded border border-purple-300 bg-white text-purple-900">
                <div className="font-bold mb-1">Dominant null (20–60 Hz)</div>
                {nullInfo ? (
                  <div className="grid grid-cols-3 gap-x-6 gap-y-0.5 text-xs">
                    <div>Null frequency: <strong>{fmt(liveNullHz, 2)} Hz</strong></div>
                    <div>Null absolute SPL: <strong>{fmt(nullInfo.nullDb, 1)} dB</strong></div>
                    <div>Null depth: <strong>{fmt(liveNullDepth, 1)} dB</strong></div>
                    <div>REW target: <strong>{REW_NULL_HZ} Hz</strong></div>
                    <div>Δ vs REW: <strong className={Math.abs(liveNullHz - REW_NULL_HZ) <= 1.5 ? 'text-green-700' : 'text-red-700'}>
                      {fmt(liveNullHz - REW_NULL_HZ, 2)} Hz
                    </strong></div>
                    <div>Audit frequency: <strong>{fmt(auditHz, 2)} Hz</strong></div>
                  </div>
                ) : (
                  <div className="text-gray-500">No null detected in 20–60 Hz window.</div>
                )}
              </div>

              {/* ── Complex pressure at audit frequency ── */}
              <div className="p-2 rounded border border-purple-400 bg-purple-100 text-purple-900">
                <div className="font-bold mb-1">Complex pressure at {fmt(auditHz, 2)} Hz</div>
                <div className="grid grid-cols-2 gap-x-8 gap-y-0.5">
                  <div>Direct amp (Re): <strong>{fmt(audit.directAmp, 6)}</strong></div>
                  <div>Total Σ Re: <strong>{fmt(audit.totalRe, 6)}</strong></div>
                  <div>Total Σ Im: <strong>{fmt(audit.totalIm, 6)}</strong></div>
                  <div>Total magnitude: <strong>{fmt(audit.totalMag, 6)}</strong></div>
                  <div>Total SPL: <strong>{fmt(audit.totalSpl, 2)} dB</strong></div>
                  <div>Total phase: <strong>{fmtDeg(audit.totalPhase)}</strong></div>
                </div>
                <div className="mt-2 font-bold">Top 5 modal contributors to Σ (ranked by |cMag|):</div>
                <table className="border-collapse w-full mt-1">
                  <thead>
                    <tr style={{ fontSize: 9 }} className="text-purple-700">
                      <th className="text-left pr-3">Mode</th>
                      <th className="pr-3">cRe</th>
                      <th className="pr-3">cIm</th>
                      <th className="pr-3">|c|</th>
                      <th className="pr-3">Phase</th>
                      <th className="pr-3">% total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.slice(0, 5).map((mc, i) => (
                      <tr key={i} className={top10Ids.has(modeId(mc.mode)) ? 'bg-yellow-50' : ''}>
                        <td className="pr-3 font-bold text-purple-800">{modeId(mc.mode)}</td>
                        <td className="pr-3">{fmt(mc.cRe, 5)}</td>
                        <td className="pr-3">{fmt(mc.cIm, 5)}</td>
                        <td className="pr-3">{fmt(mc.cMag, 5)}</td>
                        <td className="pr-3">{fmtDeg(mc.cPhase)}</td>
                        <td>{fmtPct(mc.pctOfTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ── Full mode contribution table (20–60 Hz modes, sorted by |cMag|) ── */}
              <div>
                <div className="font-bold text-purple-900 mb-1">
                  Mode contribution chain at {fmt(auditHz, 2)} Hz — all modes with frequency 20–60 Hz, sorted by |contribution|
                </div>
                <div style={{ fontSize: 9 }} className="text-purple-600 mb-1">
                  Highlighted rows = top {TOP_N} contributors overall (including modes outside 20–60 Hz).
                </div>
                <div className="overflow-x-auto">
                  <table className="border-collapse w-full" style={{ fontSize: 9 }}>
                    <thead>
                      <tr className="bg-purple-200 text-purple-900">
                        <th className="text-left px-2 py-1 border border-purple-300">Rank</th>
                        <th className="text-left px-2 py-1 border border-purple-300">Mode</th>
                        <th className="text-left px-2 py-1 border border-purple-300">Family</th>
                        <th className="text-left px-2 py-1 border border-purple-300">Axis</th>
                        <th className="px-2 py-1 border border-purple-300">Freq Hz</th>
                        <th className="px-2 py-1 border border-purple-300">Q</th>
                        <th className="px-2 py-1 border border-purple-300">Src ψ</th>
                        <th className="px-2 py-1 border border-purple-300">Rcv ψ</th>
                        <th className="px-2 py-1 border border-purple-300">Combined</th>
                        <th className="px-2 py-1 border border-purple-300">|H|</th>
                        <th className="px-2 py-1 border border-purple-300">H phase</th>
                        <th className="px-2 py-1 border border-purple-300">cRe</th>
                        <th className="px-2 py-1 border border-purple-300">cIm</th>
                        <th className="px-2 py-1 border border-purple-300">|c|</th>
                        <th className="px-2 py-1 border border-purple-300">c phase</th>
                        <th className="px-2 py-1 border border-purple-300">% total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditWindowModes.map((mc, i) => {
                        const isTop = top10Ids.has(modeId(mc.mode));
                        const isDestructive = Math.abs(mc.cPhase * 180 / Math.PI) > 90;
                        const bg = isTop ? 'bg-yellow-100' : isDestructive ? 'bg-red-50' : '';
                        return (
                          <tr key={i} className={bg}>
                            <td className="px-2 py-0.5 border border-purple-100 text-center font-bold">{mc.rank}</td>
                            <td className="px-2 py-0.5 border border-purple-100 font-bold text-purple-800">{modeId(mc.mode)}</td>
                            <td className="px-2 py-0.5 border border-purple-100">{mc.mode.type}</td>
                            <td className="px-2 py-0.5 border border-purple-100 text-purple-600">{axisLabel(mc.mode)}</td>
                            <td className="px-2 py-0.5 border border-purple-100 text-center">{fmt(mc.mode.freq, 2)}</td>
                            <td className="px-2 py-0.5 border border-purple-100 text-center">{fmt(mc.qValue, 2)}</td>
                            <td className="px-2 py-0.5 border border-purple-100 text-center">{fmt(mc.srcCoupling, 4)}</td>
                            <td className="px-2 py-0.5 border border-purple-100 text-center">{fmt(mc.lstCoupling, 4)}</td>
                            <td className="px-2 py-0.5 border border-purple-100 text-center">{fmt(mc.combined, 4)}</td>
                            <td className="px-2 py-0.5 border border-purple-100 text-center">{fmt(mc.transferMag, 4)}</td>
                            <td className="px-2 py-0.5 border border-purple-100 text-center">{fmtDeg(mc.transferPhase)}</td>
                            <td className="px-2 py-0.5 border border-purple-100 text-center">{fmt(mc.cRe, 5)}</td>
                            <td className="px-2 py-0.5 border border-purple-100 text-center">{fmt(mc.cIm, 5)}</td>
                            <td className={`px-2 py-0.5 border border-purple-100 text-center font-bold ${isTop ? 'text-yellow-700' : ''}`}>{fmt(mc.cMag, 5)}</td>
                            <td className={`px-2 py-0.5 border border-purple-100 text-center ${isDestructive ? 'text-red-700 font-bold' : ''}`}>{fmtDeg(mc.cPhase)}</td>
                            <td className="px-2 py-0.5 border border-purple-100 text-center">{fmtPct(mc.pctOfTotal)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── (1,0,0) investigation ── */}
              <div className="p-3 rounded border border-blue-400 bg-blue-50 text-blue-900 space-y-1">
                <div className="font-bold text-blue-800">Width axial mode (1,0,0) investigation — at {fmt(auditHz, 2)} Hz</div>
                {mode100 ? (
                  <>
                    <div>Mode frequency: <strong>{fmt(mode100.mode.freq, 3)} Hz</strong></div>
                    <div>Contribution rank: <strong>#{mode100.rank}</strong> of {sorted.length} modes</div>
                    <div>|contribution|: <strong>{fmt(mode100.cMag, 6)}</strong></div>
                    <div>% of total pressure: <strong>{fmtPct(mode100.pctOfTotal)}</strong></div>
                    <div>Contribution phase: <strong>{fmtDeg(mode100.cPhase)}</strong></div>
                    <div>Transfer magnitude |H|: <strong>{fmt(mode100.transferMag, 6)}</strong></div>
                    <div>Transfer phase: <strong>{fmtDeg(mode100.transferPhase)}</strong></div>
                    <div>Source coupling: <strong>{fmt(mode100.srcCoupling, 6)}</strong></div>
                    <div>Receiver coupling: <strong>{fmt(mode100.lstCoupling, 6)}</strong></div>
                    <div>Combined coupling: <strong>{fmt(mode100.combined, 6)}</strong></div>
                    <div className="mt-1 text-blue-700">Diagnosis: <em>{diagnoseMode(mode100, audit.directAmp, auditHz)}</em></div>
                  </>
                ) : (
                  <div className="text-gray-500">(1,0,0) not found in mode list.</div>
                )}
              </div>

              {/* ── (0,1,0) investigation ── */}
              <div className="p-3 rounded border border-green-500 bg-green-50 text-green-900 space-y-1">
                <div className="font-bold text-green-800">Length axial mode (0,1,0) investigation — at {fmt(auditHz, 2)} Hz</div>
                {mode010 ? (
                  <>
                    <div>Mode frequency: <strong>{fmt(mode010.mode.freq, 3)} Hz</strong></div>
                    <div>Contribution rank: <strong>#{mode010.rank}</strong> of {sorted.length} modes</div>
                    <div>|contribution|: <strong>{fmt(mode010.cMag, 6)}</strong></div>
                    <div>% of total pressure: <strong>{fmtPct(mode010.pctOfTotal)}</strong></div>
                    <div>Contribution phase: <strong>{fmtDeg(mode010.cPhase)}</strong></div>
                    <div>Transfer magnitude |H|: <strong>{fmt(mode010.transferMag, 6)}</strong></div>
                    <div>Transfer phase: <strong>{fmtDeg(mode010.transferPhase)}</strong></div>
                    <div>Source coupling: <strong>{fmt(mode010.srcCoupling, 6)}</strong></div>
                    <div>Receiver coupling: <strong>{fmt(mode010.lstCoupling, 6)}</strong></div>
                    <div>Combined coupling: <strong>{fmt(mode010.combined, 6)}</strong></div>
                    <div className="mt-1 text-green-700">Diagnosis: <em>{diagnoseMode(mode010, audit.directAmp, auditHz)}</em></div>
                  </>
                ) : (
                  <div className="text-gray-500">(0,1,0) not found in mode list.</div>
                )}
              </div>

              {/* ── (1,0,0) vs (0,1,0) direct comparison ── */}
              {mode100 && mode010 && (
                <div className="p-3 rounded border border-gray-400 bg-gray-50 text-gray-900">
                  <div className="font-bold mb-2">(1,0,0) vs (0,1,0) — direct comparison at {fmt(auditHz, 2)} Hz</div>
                  <table className="border-collapse w-full" style={{ fontSize: 10 }}>
                    <thead>
                      <tr className="bg-gray-200 text-gray-800">
                        <th className="text-left px-2 py-1 border border-gray-300">Metric</th>
                        <th className="px-2 py-1 border border-gray-300">(1,0,0) width</th>
                        <th className="px-2 py-1 border border-gray-300">(0,1,0) length</th>
                        <th className="px-2 py-1 border border-gray-300">Ratio (0,1,0)÷(1,0,0)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ['Mode freq Hz', fmt(mode100.mode.freq,3), fmt(mode010.mode.freq,3), fmt(mode010.mode.freq/Math.max(mode100.mode.freq,1e-9),3)+'×'],
                        ['Q', fmt(mode100.qValue,3), fmt(mode010.qValue,3), fmt(mode010.qValue/Math.max(mode100.qValue,1e-9),3)+'×'],
                        ['Source coupling', fmt(mode100.srcCoupling,5), fmt(mode010.srcCoupling,5), fmt(Math.abs(mode010.srcCoupling)/Math.max(Math.abs(mode100.srcCoupling),1e-9),3)+'×'],
                        ['Receiver coupling', fmt(mode100.lstCoupling,5), fmt(mode010.lstCoupling,5), fmt(Math.abs(mode010.lstCoupling)/Math.max(Math.abs(mode100.lstCoupling),1e-9),3)+'×'],
                        ['Combined coupling', fmt(mode100.combined,5), fmt(mode010.combined,5), fmt(Math.abs(mode010.combined)/Math.max(Math.abs(mode100.combined),1e-9),3)+'×'],
                        ['Transfer |H|', fmt(mode100.transferMag,5), fmt(mode010.transferMag,5), fmt(mode010.transferMag/Math.max(mode100.transferMag,1e-9),3)+'×'],
                        ['Transfer phase', fmtDeg(mode100.transferPhase), fmtDeg(mode010.transferPhase), '—'],
                        ['|contribution|', fmt(mode100.cMag,6), fmt(mode010.cMag,6), fmt(mode010.cMag/Math.max(mode100.cMag,1e-9),3)+'×'],
                        ['Contribution phase', fmtDeg(mode100.cPhase), fmtDeg(mode010.cPhase), '—'],
                        ['% total', fmtPct(mode100.pctOfTotal), fmtPct(mode010.pctOfTotal), fmt(mode010.pctOfTotal/Math.max(mode100.pctOfTotal,1e-9),2)+'×'],
                        ['Rank', `#${mode100.rank}`, `#${mode010.rank}`, '—'],
                      ].map(([label, a, b, ratio], i) => (
                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="px-2 py-0.5 border border-gray-200 font-semibold">{label}</td>
                          <td className="px-2 py-0.5 border border-gray-200 text-center text-blue-800">{a}</td>
                          <td className="px-2 py-0.5 border border-gray-200 text-center text-green-800">{b}</td>
                          <td className="px-2 py-0.5 border border-gray-200 text-center font-bold">{ratio}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-2 text-gray-700">
                    {(() => {
                      const ratio = mode100.cMag > 1e-12 ? mode010.cMag / mode100.cMag : null;
                      if (!ratio) return null;
                      const winner = ratio > 1 ? `(0,1,0) is ${fmt(ratio,2)}× stronger` : `(1,0,0) is ${fmt(1/ratio,2)}× stronger`;
                      const srcRatio = Math.abs(mode100.srcCoupling) > 1e-9 ? Math.abs(mode010.srcCoupling / mode100.srcCoupling) : null;
                      const lstRatio = Math.abs(mode100.lstCoupling) > 1e-9 ? Math.abs(mode010.lstCoupling / mode100.lstCoupling) : null;
                      const tRatio   = mode100.transferMag > 1e-9 ? mode010.transferMag / mode100.transferMag : null;
                      const drivers = [];
                      if (srcRatio && (srcRatio > 1.3 || srcRatio < 0.77)) drivers.push(`source coupling (${fmt(srcRatio,2)}×)`);
                      if (lstRatio && (lstRatio > 1.3 || lstRatio < 0.77)) drivers.push(`receiver coupling (${fmt(lstRatio,2)}×)`);
                      if (tRatio   && (tRatio   > 1.3 || tRatio   < 0.77)) drivers.push(`transfer magnitude (${fmt(tRatio,2)}×)`);
                      return (
                        <>
                          <strong>Summary:</strong> {winner}.{' '}
                          {drivers.length > 0 ? `Primary driver(s): ${drivers.join(', ')}.` : 'Difference is broadly distributed across chain stages.'}
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* ── Diagnostic summary ── */}
              <div className="p-3 rounded border border-purple-500 bg-white text-purple-900 space-y-2">
                <div className="font-bold text-purple-800">Diagnostic Summary</div>

                <div><span className="font-semibold">Largest contributor:</span>{' '}
                  {sorted[0] ? `${modeId(sorted[0].mode)} (${fmt(sorted[0].mode.freq,1)} Hz, |c|=${fmt(sorted[0].cMag,5)}, ${fmtPct(sorted[0].pctOfTotal)})` : '—'}
                </div>

                <div><span className="font-semibold">Most destructive near-null mode:</span>{' '}
                  {(() => {
                    const d = audit.modeContribs
                      .filter(mc => Math.abs(mc.cPhase * 180 / Math.PI) > 90 && Math.abs(mc.mode.freq - auditHz) < 20)
                      .sort((a, b) => b.cMag - a.cMag)[0];
                    return d
                      ? `${modeId(d.mode)} at ${fmt(d.mode.freq,1)} Hz (phase ${fmtDeg(d.cPhase)}, |c|=${fmt(d.cMag,5)})`
                      : 'None found with phase > 90° within 20 Hz of null';
                  })()}
                </div>

                <div><span className="font-semibold">Why is null at {fmt(auditHz,1)} Hz not {REW_NULL_HZ} Hz?</span>{' '}
                  {(() => {
                    const dHz = Math.abs(auditHz - REW_NULL_HZ);
                    if (dHz < 1) return 'Null frequency matches REW target within 1 Hz — parity issue is depth only.';
                    // Find mode closest to actual null
                    const closest = [...audit.modeContribs].sort((a,b) =>
                      Math.abs(a.mode.freq - auditHz) - Math.abs(b.mode.freq - auditHz))[0];
                    return `Null at ${fmt(auditHz,1)} Hz — nearest mode is ${closest ? modeId(closest.mode) + ' at ' + fmt(closest.mode.freq,1) + ' Hz' : '—'}. REW null at 40.6 Hz suggests width axial (1,0,0) should dominate; check (1,0,0) coupling vs other modes.`;
                  })()}
                </div>

                <div><span className="font-semibold">Why doesn't (1,0,0) width axial dominate?</span>{' '}
                  {mode100 ? diagnoseMode(mode100, audit.directAmp, auditHz) : '(1,0,0) not found.'}
                </div>

                <div><span className="font-semibold">Is (0,1,0) length axial overriding?</span>{' '}
                  {mode010
                    ? `Rank #${mode010.rank}, ${fmtPct(mode010.pctOfTotal)} of total. At ${fmt(auditHz,1)} Hz: |H|=${fmt(mode010.transferMag,4)}, combined coupling=${fmt(mode010.combined,4)}.`
                    : '(0,1,0) not found.'}
                </div>

                <div><span className="font-semibold">Top 3 by magnitude:</span>{' '}
                  {sorted.slice(0,3).map(mc => `${modeId(mc.mode)} (${fmt(mc.mode.freq,1)} Hz, ${fmtPct(mc.pctOfTotal)})`).join(' | ')}
                </div>
              </div>

              {/* ── Final verdict ── */}
              <div className="p-3 rounded border-2 border-purple-700 bg-purple-200 text-purple-950">
                <div className="font-bold mb-1">Final Engineering Verdict</div>
                <div className="leading-relaxed">{finalVerdict}</div>
              </div>

            </div>
          );
        })()}
      </div>
    </details>
  );
}