// phaseEvolutionAuditEngine.jsx
// Pure computation helpers for the Phase Evolution & Modal Transfer Investigation audit.
// Read-only: calls the exact same live production engine as LiveVectorGeometryAudit —
// no physics, Q, damping, weighting, or interpolation logic is modified here.

import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';
import { LIVE_SOURCE_CURVE, buildLiveEngineOptions } from '@/components/room/bass/LiveModalContributorAudit';

export function mag(re, im) { return Math.sqrt(re * re + im * im); }
export function phaseDeg(re, im) { return (Math.atan2(im, re) * 180) / Math.PI; }
export function fmt(v, d = 2) { return Number.isFinite(v) ? v.toFixed(d) : '—'; }
export function projectOnto(aRe, aIm, fRe, fIm) {
  const fMag = mag(fRe, fIm);
  if (fMag <= 1e-12) return 0;
  return (aRe * fRe + aIm * fIm) / fMag;
}
// shortest signed angular difference b - a, wrapped to (-180, 180]
export function shortestAngleDiff(a, b) {
  let d = b - a;
  while (d > 180) d -= 360;
  while (d <= -180) d += 360;
  return d;
}

export function computeFrequencyRaw(frequencyHz, roomDims, seatPos, subsForSimulation, surfaceAbsorption) {
  const options = buildLiveEngineOptions(frequencyHz, surfaceAbsorption);
  let directRe = 0, directIm = 0;
  let engineFinalRe = 0, engineFinalIm = 0;
  let actualFrequencyHz = frequencyHz;
  const merged = new Map();

  subsForSimulation.forEach((sub) => {
    const engineOut = simulateBassResponseRewCore(roomDims, seatPos, sub, LIVE_SOURCE_CURVE, options);
    const vec = engineOut.perFrequencyVectorDebug?.[0];
    if (vec) {
      directRe += vec.directRe || 0;
      directIm += vec.directIm || 0;
      engineFinalRe += vec.finalRe || 0;
      engineFinalIm += vec.finalIm || 0;
      if (Number.isFinite(vec.frequencyHz)) actualFrequencyHz = vec.frequencyHz;
    }
    const debugRow = engineOut.activeModalContributorDebugSeries?.[0];
    if (debugRow?.contributors) {
      debugRow.contributors.forEach((c) => {
        const key = `${c.nx},${c.ny},${c.nz}`;
        if (!merged.has(key)) {
          merged.set(key, { key, nx: c.nx, ny: c.ny, nz: c.nz, modeFrequencyHz: c.modeFrequencyHz, modeType: c.modeType, re: 0, im: 0 });
        }
        const m = merged.get(key);
        m.re += c.activeReal;
        m.im += c.activeImag;
      });
    }
  });

  return {
    requestedFrequencyHz: frequencyHz,
    actualFrequencyHz,
    directRe, directIm,
    engineFinalRe, engineFinalIm,
    contributors: Array.from(merged.values()),
  };
}

export function deriveRow(raw, trackedKey) {
  const { requestedFrequencyHz, actualFrequencyHz, directRe, directIm, engineFinalRe, engineFinalIm, contributors } = raw;
  const tracked = contributors.find((c) => c.key === trackedKey);
  const dominantRe = tracked ? tracked.re : 0;
  const dominantIm = tracked ? tracked.im : 0;
  const others = contributors.filter((c) => c.key !== trackedKey);
  const remainingRe = others.reduce((s, c) => s + c.re, 0);
  const remainingIm = others.reduce((s, c) => s + c.im, 0);

  const direct = { re: directRe, im: directIm, mag: mag(directRe, directIm), phase: phaseDeg(directRe, directIm) };
  const dominant = { re: dominantRe, im: dominantIm, mag: mag(dominantRe, dominantIm), phase: phaseDeg(dominantRe, dominantIm), modeFrequencyHz: tracked?.modeFrequencyHz ?? null, modeType: tracked?.modeType ?? '—' };
  const remaining = { re: remainingRe, im: remainingIm, mag: mag(remainingRe, remainingIm), phase: phaseDeg(remainingRe, remainingIm) };
  const final = { re: engineFinalRe, im: engineFinalIm, mag: mag(engineFinalRe, engineFinalIm), phase: phaseDeg(engineFinalRe, engineFinalIm) };
  final.splDb = 20 * Math.log10(Math.max(final.mag, 1e-10));

  const directProj = projectOnto(direct.re, direct.im, final.re, final.im);
  const dominantProj = projectOnto(dominant.re, dominant.im, final.re, final.im);
  const remainingProj = projectOnto(remaining.re, remaining.im, final.re, final.im);

  const domOnDirect = direct.mag > 1e-12 ? projectOnto(dominant.re, dominant.im, direct.re, direct.im) : 0;
  const cancellationEfficiency = dominant.mag > 1e-12
    ? Math.max(0, Math.min(100, (-domOnDirect / dominant.mag) * 100)) : 0;
  const modalTotalRe = dominant.re + remaining.re, modalTotalIm = dominant.im + remaining.im;
  const modalTotalMag = mag(modalTotalRe, modalTotalIm);
  const modalOnDirect = direct.mag > 1e-12 ? projectOnto(modalTotalRe, modalTotalIm, direct.re, direct.im) : 0;
  const residualCancellation = modalTotalMag > 1e-12
    ? Math.max(0, Math.min(100, (-modalOnDirect / modalTotalMag) * 100)) : 0;

  // F. Cancellation Efficiency (new definition) = final mag / sum of individual magnitudes
  const sumIndividualMag = direct.mag + dominant.mag + remaining.mag;
  const cancellationEfficiencyRatio = sumIndividualMag > 1e-12 ? final.mag / sumIndividualMag : null;

  // I. Top 5 contributors (by magnitude), including direct field as its own row for context
  const allWithMag = contributors.map((c) => ({ ...c, mag: mag(c.re, c.im), phase: phaseDeg(c.re, c.im) })).sort((a, b) => b.mag - a.mag);
  const totalContribMag = allWithMag.reduce((s, c) => s + c.mag, 0) || 1;
  const top5 = allWithMag.slice(0, 5).map((c) => ({
    key: c.key, modeFrequencyHz: c.modeFrequencyHz, modeType: c.modeType,
    mag: c.mag, phase: c.phase, contributionPct: (c.mag / totalContribMag) * 100,
    projection: projectOnto(c.re, c.im, final.re, final.im),
  }));

  // K. Dominance ratio = top mode / second mode
  const dominanceRatio = allWithMag.length >= 2 && allWithMag[1].mag > 1e-9 ? allWithMag[0].mag / allWithMag[1].mag : null;

  // H. Interpolation error
  const interpolationErrorHz = Math.abs(actualFrequencyHz - requestedFrequencyHz);

  const reconRe = direct.re + dominant.re + remaining.re;
  const reconIm = direct.im + dominant.im + remaining.im;
  const TOL = 1e-6 * Math.max(1, final.mag);
  const pass = Math.abs(reconRe - final.re) < TOL && Math.abs(reconIm - final.im) < TOL;

  return {
    frequencyHz: requestedFrequencyHz, actualFrequencyHz, interpolationErrorHz,
    direct, dominant, remaining, final,
    directProj, dominantProj, remainingProj,
    cancellationEfficiency, residualCancellation, cancellationEfficiencyRatio,
    top5, dominanceRatio, pass,
  };
}

// Build the full sweep: pass 1 finds the null centre + tracked dominant mode,
// pass 2 derives rows using that fixed tracked mode throughout,
// pass 3 computes finite-difference derivatives (velocity/acceleration/curvature).
export function buildSweep(freqStart, freqEnd, step, roomDims, seatPos, subsForSimulation, surfaceAbsorption) {
  const raw = [];
  for (let f = freqStart; f <= freqEnd + 1e-9; f += step) {
    raw.push(computeFrequencyRaw(f, roomDims, seatPos, subsForSimulation, surfaceAbsorption));
  }
  let nullIdx = 0, nullMag = Infinity;
  raw.forEach((r, i) => {
    const m = mag(r.engineFinalRe, r.engineFinalIm);
    if (m < nullMag) { nullMag = m; nullIdx = i; }
  });
  const nullContribs = raw[nullIdx].contributors.map((c) => ({ ...c, mag: mag(c.re, c.im) })).sort((a, b) => b.mag - a.mag);
  const trackedKey = nullContribs[0]?.key ?? null;

  const rows = raw.map((r) => deriveRow(r, trackedKey));

  // Derivatives via finite differences (centered where possible, forward/backward at edges)
  for (let i = 0; i < rows.length; i++) {
    const prev = rows[i - 1], next = rows[i + 1];
    const dHzPrev = prev ? rows[i].frequencyHz - prev.frequencyHz : null;
    const dHzNext = next ? next.frequencyHz - rows[i].frequencyHz : null;

    const velocity = (getPhase, getVal) => {
      let vPrev = null, vNext = null;
      if (prev && dHzPrev) vPrev = getPhase
        ? shortestAngleDiff(getVal(prev), getVal(rows[i])) / dHzPrev
        : (getVal(rows[i]) - getVal(prev)) / dHzPrev;
      if (next && dHzNext) vNext = getPhase
        ? shortestAngleDiff(getVal(rows[i]), getVal(next)) / dHzNext
        : (getVal(next) - getVal(rows[i])) / dHzNext;
      if (vPrev !== null && vNext !== null) return (vPrev + vNext) / 2;
      return vPrev !== null ? vPrev : vNext;
    };

    rows[i].phaseVelocity = {
      direct: velocity(true, (r) => r.direct.phase),
      dominant: velocity(true, (r) => r.dominant.phase),
      remaining: velocity(true, (r) => r.remaining.phase),
      final: velocity(true, (r) => r.final.phase),
    };
    rows[i].projectionVelocity = {
      direct: velocity(false, (r) => r.directProj),
      dominant: velocity(false, (r) => r.dominantProj),
      remaining: velocity(false, (r) => r.remainingProj),
    };
    rows[i].magnitudeGrowthRate = {
      direct: velocity(false, (r) => r.direct.mag),
      dominant: velocity(false, (r) => r.dominant.mag),
      remaining: velocity(false, (r) => r.remaining.mag),
    };
    rows[i].complexRotationRate = {
      direct: Math.abs(rows[i].phaseVelocity.direct ?? 0),
      dominant: Math.abs(rows[i].phaseVelocity.dominant ?? 0),
      remaining: Math.abs(rows[i].phaseVelocity.remaining ?? 0),
      final: Math.abs(rows[i].phaseVelocity.final ?? 0),
    };
    // L. Phase separation
    rows[i].phaseSeparation = {
      directMinusDominant: shortestAngleDiff(rows[i].dominant.phase, rows[i].direct.phase),
      directMinusRemaining: shortestAngleDiff(rows[i].remaining.phase, rows[i].direct.phase),
      directMinusFinal: shortestAngleDiff(rows[i].final.phase, rows[i].direct.phase),
      dominantMinusFinal: shortestAngleDiff(rows[i].final.phase, rows[i].dominant.phase),
    };
  }
  // Second-order: angular acceleration, projection acceleration, transfer curvature (dominant mag/phase 2nd deriv)
  for (let i = 0; i < rows.length; i++) {
    const prev = rows[i - 1], next = rows[i + 1];
    const dHzPrev = prev ? rows[i].frequencyHz - prev.frequencyHz : null;
    const dHzNext = next ? next.frequencyHz - rows[i].frequencyHz : null;
    const accel = (getVal) => {
      let aPrev = null, aNext = null;
      if (prev && dHzPrev) aPrev = (getVal(rows[i]) - getVal(prev)) / dHzPrev;
      if (next && dHzNext) aNext = (getVal(next) - getVal(rows[i])) / dHzNext;
      if (aPrev !== null && aNext !== null) return (aPrev + aNext) / 2;
      return aPrev !== null ? aPrev : aNext;
    };
    rows[i].angularAcceleration = {
      direct: accel((r) => r.phaseVelocity.direct ?? 0),
      dominant: accel((r) => r.phaseVelocity.dominant ?? 0),
      remaining: accel((r) => r.phaseVelocity.remaining ?? 0),
      final: accel((r) => r.phaseVelocity.final ?? 0),
    };
    rows[i].projectionAcceleration = {
      direct: accel((r) => r.projectionVelocity.direct ?? 0),
      dominant: accel((r) => r.projectionVelocity.dominant ?? 0),
      remaining: accel((r) => r.projectionVelocity.remaining ?? 0),
    };
    // G. Transfer function curvature for the dominant tracked mode
    rows[i].transferCurvature = {
      magnitude: accel((r) => r.dominant.mag),
      phase: accel((r) => r.phaseVelocity.dominant ?? 0),
    };
  }

  // J. Modal bandwidth of tracked dominant mode, from its magnitude curve across the sweep
  const domMags = rows.map((r) => r.dominant.mag);
  const peakIdx = domMags.reduce((best, v, i) => (v > domMags[best] ? i : best), 0);
  const peakMag = domMags[peakIdx];
  const peakDb = 20 * Math.log10(Math.max(peakMag, 1e-12));
  const findCrossing = (dropDb) => {
    const targetDb = peakDb - dropDb;
    let lo = null, hi = null;
    for (let i = peakIdx; i >= 0; i--) {
      const db = 20 * Math.log10(Math.max(domMags[i], 1e-12));
      if (db <= targetDb) { lo = rows[i].frequencyHz; break; }
    }
    for (let i = peakIdx; i < rows.length; i++) {
      const db = 20 * Math.log10(Math.max(domMags[i], 1e-12));
      if (db <= targetDb) { hi = rows[i].frequencyHz; break; }
    }
    return (lo !== null && hi !== null) ? { lo, hi, bw: hi - lo } : null;
  };
  const bw3 = findCrossing(3);
  const bw6 = findCrossing(6);
  const peakFreq = rows[peakIdx]?.frequencyHz ?? null;
  const measuredEffectiveQ = bw3 && bw3.bw > 0 ? peakFreq / bw3.bw : null;
  const modalBandwidth = {
    peakFreq, peakMagDb: peakDb,
    bw3Db: bw3, bw6Db: bw6,
    measuredEffectiveQ,
    trackedModeFrequencyHz: rows[peakIdx]?.dominant?.modeFrequencyHz ?? null,
  };

  return { rows, nullIdx, trackedKey, modalBandwidth };
}

// Threshold-based root-cause candidate scan, tracked from the null centre outward.
export function computeRootCauseRanking(rows, nullIdx) {
  const fromNull = rows.slice(nullIdx);
  const base = fromNull[0];
  const findCross = (predicate) => fromNull.find((r, i) => i > 0 && predicate(r, base));

  const candidates = [];

  // Projection collapse (dominant projection relative change)
  {
    const domBase = Math.abs(base.dominantProj) || 1e-9;
    const cross = findCross((r) => Math.abs(Math.abs(r.dominantProj) - domBase) / domBase > 0.5);
    const maxDrop = Math.max(...fromNull.map((r) => Math.abs(Math.abs(r.dominantProj) - domBase) / domBase)) * 100;
    candidates.push({ name: 'Projection collapse', crossFreq: cross?.frequencyHz ?? null, confidence: Math.min(99, Math.round(maxDrop)) });
  }
  // Phase velocity spike (dominant)
  {
    const velVals = fromNull.map((r) => Math.abs(r.phaseVelocity?.dominant ?? 0));
    const baseline = velVals.slice(0, Math.max(1, Math.min(3, velVals.length))).reduce((s, v) => s + v, 0) / Math.max(1, Math.min(3, velVals.length)) || 1e-6;
    const cross = fromNull.find((r, i) => i > 0 && Math.abs(r.phaseVelocity?.dominant ?? 0) > baseline * 3);
    const maxMultiple = Math.max(...velVals) / baseline;
    candidates.push({ name: 'Phase velocity spike', crossFreq: cross?.frequencyHz ?? null, confidence: Math.min(99, Math.round(Math.min(maxMultiple, 10) * 10)) });
  }
  // Mode handover (dominance ratio collapse)
  {
    const cross = fromNull.find((r) => r.dominanceRatio !== null && r.dominanceRatio < 1.5);
    const minRatio = Math.min(...fromNull.map((r) => (r.dominanceRatio ?? 99)));
    const confidence = minRatio < 1.5 ? Math.min(99, Math.round((1.5 - minRatio) / 1.5 * 200)) : Math.round(Math.max(0, 40 - minRatio * 10));
    candidates.push({ name: 'Mode handover', crossFreq: cross?.frequencyHz ?? null, confidence: Math.max(0, Math.min(99, confidence)) });
  }
  // Transfer curvature anomaly (dominant magnitude 2nd derivative)
  {
    const curveVals = fromNull.map((r) => Math.abs(r.transferCurvature?.magnitude ?? 0));
    const maxCurve = Math.max(...curveVals, 1e-9);
    const norm = curveVals.map((v) => v / maxCurve);
    const crossIdx = norm.findIndex((v, i) => i > 0 && v > 0.6);
    candidates.push({ name: 'Transfer curvature anomaly', crossFreq: crossIdx >= 0 ? fromNull[crossIdx].frequencyHz : null, confidence: Math.round(Math.min(1, maxCurve > 1e-9 ? 0.62 : 0) * 100) });
  }
  // Frequency interpolation
  {
    const maxErr = Math.max(...rows.map((r) => r.interpolationErrorHz));
    candidates.push({ name: 'Frequency interpolation', crossFreq: null, confidence: Math.min(99, Math.round(maxErr * 100)) });
  }
  // Magnitude growth anomaly (dominant + remaining)
  {
    const growthVals = fromNull.map((r) => Math.abs(r.magnitudeGrowthRate?.dominant ?? 0) + Math.abs(r.magnitudeGrowthRate?.remaining ?? 0));
    const base0 = growthVals[0] || 1e-9;
    const cross = fromNull.find((r, i) => i > 0 && growthVals[i] > base0 * 4 + 1e-6);
    const maxG = Math.max(...growthVals);
    candidates.push({ name: 'Magnitude growth anomaly', crossFreq: cross?.frequencyHz ?? null, confidence: Math.min(99, Math.round((maxG / (base0 * 4 + 1e-6)) * 15)) });
  }
  // Direct field instability
  {
    const directVals = fromNull.map((r) => r.direct.mag);
    const base0 = directVals[0] || 1e-9;
    const maxRelChange = Math.max(...directVals.map((v) => Math.abs(v - base0) / base0));
    const cross = fromNull.find((r, i) => i > 0 && Math.abs(r.direct.mag - base0) / base0 > 0.3);
    candidates.push({ name: 'Direct field instability', crossFreq: cross?.frequencyHz ?? null, confidence: Math.min(99, Math.round(maxRelChange * 100)) });
  }

  candidates.forEach((c) => { c.status = c.crossFreq !== null ? 'evidence' : (c.confidence < 10 ? 'rejected' : 'no evidence'); });
  candidates.sort((a, b) => b.confidence - a.confidence);
  return candidates;
}

export function buildTimeline(rows, nullIdx, candidates) {
  const events = [{ frequencyHz: rows[0].frequencyHz, label: 'System stable' }];
  events.push({ frequencyHz: rows[nullIdx].frequencyHz, label: 'Null centre' });
  candidates.forEach((c) => {
    if (c.crossFreq !== null) events.push({ frequencyHz: c.crossFreq, label: `${c.name} begins` });
  });
  // Recovery complete: first freq after null where final SPL returns within 3dB of the sweep-start SPL
  const startSplDb = rows[0].final.splDb;
  const recovery = rows.slice(nullIdx).find((r) => r.final.splDb >= startSplDb - 3);
  if (recovery) events.push({ frequencyHz: recovery.frequencyHz, label: 'Recovery complete (within 3dB of start)' });
  events.sort((a, b) => a.frequencyHz - b.frequencyHz);
  // de-dupe same-frequency entries, keep unique labels
  const seen = new Set();
  return events.filter((e) => {
    const k = `${e.frequencyHz.toFixed(1)}|${e.label}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}