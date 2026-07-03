// projectionMathAuditEngine.jsx
// Pure computation helpers for the Projection Mathematics Audit.
// Read-only: calls the exact same live production engine as LiveVectorGeometryAudit —
// no physics, Q, damping, weighting, phase, smoothing, or summation logic is modified here.

import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';
import { LIVE_SOURCE_CURVE, buildLiveEngineOptions } from '@/components/room/bass/LiveModalContributorAudit';

export function mag(re, im) { return Math.sqrt(re * re + im * im); }
export function phaseDeg(re, im) { return (Math.atan2(im, re) * 180) / Math.PI; }
export function fmt(v, d = 2) { return Number.isFinite(v) ? v.toFixed(d) : '—'; }
export function shortestAngleDiff(a, b) {
  let d = b - a;
  while (d > 180) d -= 360;
  while (d <= -180) d += 360;
  return d;
}

function computeFrequencyRaw(frequencyHz, roomDims, seatPos, subsForSimulation, surfaceAbsorption) {
  const options = buildLiveEngineOptions(frequencyHz, surfaceAbsorption);
  let engineFinalRe = 0, engineFinalIm = 0;
  const merged = new Map();

  subsForSimulation.forEach((sub) => {
    const engineOut = simulateBassResponseRewCore(roomDims, seatPos, sub, LIVE_SOURCE_CURVE, options);
    const vec = engineOut.perFrequencyVectorDebug?.[0];
    if (vec) {
      engineFinalRe += vec.finalRe || 0;
      engineFinalIm += vec.finalIm || 0;
    }
    const debugRow = engineOut.activeModalContributorDebugSeries?.[0];
    if (debugRow?.contributors) {
      debugRow.contributors.forEach((c) => {
        const key = `${c.nx},${c.ny},${c.nz}`;
        if (!merged.has(key)) merged.set(key, { key, re: 0, im: 0 });
        const m = merged.get(key);
        m.re += c.activeReal;
        m.im += c.activeImag;
      });
    }
  });

  return { frequencyHz, engineFinalRe, engineFinalIm, contributors: Array.from(merged.values()) };
}

function deriveProjectionRow(raw, trackedKey) {
  const { frequencyHz, engineFinalRe, engineFinalIm, contributors } = raw;
  const tracked = contributors.find((c) => c.key === trackedKey);
  const domRe = tracked ? tracked.re : 0;
  const domIm = tracked ? tracked.im : 0;

  const domMag = mag(domRe, domIm);
  const domPhase = phaseDeg(domRe, domIm);
  const finMag = mag(engineFinalRe, engineFinalIm);
  const finPhase = phaseDeg(engineFinalRe, engineFinalIm);

  // 3. Projection mathematics — every divisor shown explicitly
  const dotProduct = domRe * engineFinalRe + domIm * engineFinalIm;
  const combinedMag = domMag * finMag;
  const normalisedDotProduct = combinedMag > 1e-12 ? dotProduct / combinedMag : null;
  const projectionLength = finMag > 1e-12 ? dotProduct / finMag : null;
  const projectionRatio = domMag > 1e-12 && projectionLength !== null ? projectionLength / domMag : null;
  const cosTheta = normalisedDotProduct; // identical formula, displayed again explicitly per spec
  const angleDifferenceDeg = cosTheta !== null ? (Math.acos(Math.max(-1, Math.min(1, cosTheta))) * 180) / Math.PI : null;

  // 8. Reconstruction verification — recompute projectionLength independently from raw vectors only
  const reconDot = domRe * engineFinalRe + domIm * engineFinalIm;
  const reconProjectionLength = finMag > 1e-12 ? reconDot / finMag : null;
  const reconProjectionRatio = domMag > 1e-12 && reconProjectionLength !== null ? reconProjectionLength / domMag : null;
  const TOL = 1e-9 * Math.max(1, Math.abs(projectionLength || 0));
  const pass = projectionLength === null
    ? reconProjectionLength === null
    : Math.abs(reconProjectionLength - projectionLength) < TOL &&
      Math.abs((reconProjectionRatio ?? 0) - (projectionRatio ?? 0)) < 1e-9 * Math.max(1, Math.abs(projectionRatio || 0));

  return {
    frequencyHz,
    dominant: { re: domRe, im: domIm, mag: domMag, phase: domPhase },
    final: { re: engineFinalRe, im: engineFinalIm, mag: finMag, phase: finPhase },
    dotProduct, normalisedDotProduct, projectionLength, projectionRatio, cosTheta, angleDifferenceDeg,
    divisors: { dominantMag: domMag, finalMag: finMag, combinedMag },
    // 7. Frequency weighting audit — this stage applies no extra scaling; displayed explicitly as None
    frequencyWeighting: 'None',
    pass,
  };
}

export function buildProjectionSweep(freqStart, freqEnd, step, roomDims, seatPos, subsForSimulation, surfaceAbsorption) {
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

  const rows = raw.map((r) => deriveProjectionRow(r, trackedKey));

  // 4/5. Frequency-to-frequency evolution (finite differences, forward/backward at edges, centred elsewhere)
  for (let i = 0; i < rows.length; i++) {
    const prev = rows[i - 1], next = rows[i + 1];
    const dHzPrev = prev ? rows[i].frequencyHz - prev.frequencyHz : null;
    const dHzNext = next ? next.frequencyHz - rows[i].frequencyHz : null;

    const delta = (getVal, isPhase) => {
      let vPrev = null, vNext = null;
      if (prev && dHzPrev) vPrev = isPhase ? shortestAngleDiff(getVal(prev), getVal(rows[i])) : getVal(rows[i]) - getVal(prev);
      if (next && dHzNext) vNext = isPhase ? shortestAngleDiff(getVal(rows[i]), getVal(next)) : getVal(next) - getVal(rows[i]);
      if (vPrev !== null && vNext !== null) return (vPrev + vNext) / 2;
      return vPrev !== null ? vPrev : vNext;
    };

    rows[i].deltaDominant = {
      re: delta((r) => r.dominant.re, false), im: delta((r) => r.dominant.im, false),
      mag: delta((r) => r.dominant.mag, false), phase: delta((r) => r.dominant.phase, true),
    };
    rows[i].deltaFinal = {
      re: delta((r) => r.final.re, false), im: delta((r) => r.final.im, false),
      mag: delta((r) => r.final.mag, false), phase: delta((r) => r.final.phase, true),
    };
    rows[i].deltaProjectionLength = delta((r) => r.projectionLength ?? 0, false);
    rows[i].deltaProjectionRatio = delta((r) => r.projectionRatio ?? 0, false);
    rows[i].deltaDotProduct = delta((r) => r.dotProduct, false);
    rows[i].deltaCosTheta = delta((r) => r.cosTheta ?? 0, false);
  }

  return { rows, nullIdx, trackedKey };
}

// Ranked "first to change" analysis across the 9 candidate quantities requested.
export function computeFirstDeviationRanking(rows, nullIdx) {
  const fromNull = rows.slice(nullIdx);
  if (fromNull.length < 2) return [];

  const candidateDef = (name, getVal, relThreshold = 0.5) => {
    const base = getVal(fromNull[0]);
    const baseAbs = Math.abs(base) || 1e-9;
    let startFreq = null, rateOfChange = 0;
    for (let i = 1; i < fromNull.length; i++) {
      const v = getVal(fromNull[i]);
      const relChange = Math.abs(v - base) / baseAbs;
      if (relChange > relThreshold && startFreq === null) {
        startFreq = fromNull[i].frequencyHz;
      }
    }
    // rate of change = max abs delta per Hz across the tracked series
    const deltas = [];
    for (let i = 1; i < fromNull.length; i++) {
      const dHz = fromNull[i].frequencyHz - fromNull[i - 1].frequencyHz;
      if (dHz > 0) deltas.push(Math.abs(getVal(fromNull[i]) - getVal(fromNull[i - 1])) / dHz);
    }
    rateOfChange = deltas.length ? Math.max(...deltas) : 0;
    const maxRelChange = Math.max(...fromNull.map((r) => Math.abs(getVal(r) - base) / baseAbs));
    const confidence = Math.max(0, Math.min(99, Math.round(maxRelChange * 100)));
    return { name, startFreq, rateOfChange, confidence };
  };

  const candidates = [
    candidateDef('Projection mathematics changes first', (r) => r.projectionLength ?? 0),
    candidateDef('Projection ratio changes first', (r) => r.projectionRatio ?? 0),
    candidateDef('Cos(theta) changes first', (r) => r.cosTheta ?? 0),
    candidateDef('Dot product changes first', (r) => r.dotProduct),
    candidateDef('Normalisation changes first', (r) => r.divisors.combinedMag),
    candidateDef('Frequency weighting changes first', () => 0, 999), // stage applies none — never crosses threshold
    candidateDef('Scaling changes first', () => 0, 999), // no additional scaling exists at this stage
    candidateDef('Dominant vector changes first', (r) => r.dominant.mag),
    candidateDef('Final vector changes first', (r) => r.final.mag),
  ];

  candidates.sort((a, b) => {
    if (a.startFreq === null && b.startFreq === null) return b.confidence - a.confidence;
    if (a.startFreq === null) return 1;
    if (b.startFreq === null) return -1;
    return a.startFreq - b.startFreq;
  });
  return candidates;
}