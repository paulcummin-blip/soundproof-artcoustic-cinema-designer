// multiModeInteractionAuditEngine.jsx
// Pure computation helpers for the Multi-Mode Interaction Audit.
// STRICT DIAGNOSTIC: read-only. Uses the exact live production engine/options (same as the
// other bass diagnostic panels). No production graph, Q, damping, coupling, weighting, SPL,
// or project data is modified — this only reads engine debug output and does extra maths on it.

import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';
import { LIVE_SOURCE_CURVE, buildLiveEngineOptions } from '@/components/room/bass/LiveModalContributorAudit';

export function fmt(v, d = 3) { return Number.isFinite(v) ? v.toFixed(d) : '—'; }
function mag(re, im) { return Math.sqrt(re * re + im * im); }
function phaseDeg(re, im) { return (Math.atan2(im, re) * 180) / Math.PI; }
function modeKey(c) { return `${c.nx},${c.ny},${c.nz}`; }
function familyOf(c) {
  const active = [c.nx > 0, c.ny > 0, c.nz > 0].filter(Boolean).length;
  return active === 1 ? 'axial' : active === 2 ? 'tangential' : 'oblique';
}

const CHECK_FREQS = [29.5, 30, 32, 35, 40, 40.6, 45, 50, 57, 58];

// ── 1. Sweep: full modal contributor table per frequency ──
export function runContributionSweep(freqStart, freqEnd, step, roomDims, seatPos, subsForSimulation, surfaceAbsorption) {
  const rows = [];
  for (let f = freqStart; f <= freqEnd + 1e-9; f += step) {
    const options = buildLiveEngineOptions(f, surfaceAbsorption);
    let finalRe = 0, finalIm = 0;
    const contribMap = new Map();

    subsForSimulation.forEach((sub) => {
      const engineOut = simulateBassResponseRewCore(roomDims, seatPos, sub, LIVE_SOURCE_CURVE, options);
      const vec = engineOut.perFrequencyVectorDebug?.[0];
      if (vec) { finalRe += vec.finalRe || 0; finalIm += vec.finalIm || 0; }
      const debugRow = engineOut.activeModalContributorDebugSeries?.[0];
      (debugRow?.contributors || []).forEach((c) => {
        const key = modeKey(c);
        const prev = contribMap.get(key) || { ...c, activeReal: 0, activeImag: 0 };
        prev.activeReal += c.activeReal;
        prev.activeImag += c.activeImag;
        prev.modeFrequencyHz = c.modeFrequencyHz;
        prev.qValue = c.qValue;
        prev.nx = c.nx; prev.ny = c.ny; prev.nz = c.nz;
        contribMap.set(key, prev);
      });
    });

    const finalMag = mag(finalRe, finalIm);
    const finalUnitRe = finalMag > 1e-12 ? finalRe / finalMag : 1;
    const finalUnitIm = finalMag > 1e-12 ? finalIm / finalMag : 0;

    const contributors = Array.from(contribMap.values()).map((c) => {
      const m = mag(c.activeReal, c.activeImag);
      const p = phaseDeg(c.activeReal, c.activeImag);
      const projection = (c.activeReal * finalUnitRe) + (c.activeImag * finalUnitIm);
      const pctContribution = finalMag > 1e-12 ? (projection / finalMag) * 100 : 0;
      return {
        key: modeKey(c), nx: c.nx, ny: c.ny, nz: c.nz, family: familyOf(c),
        modeFrequencyHz: c.modeFrequencyHz, qValue: c.qValue,
        re: c.activeReal, im: c.activeImag, magnitude: m, phase: p,
        projection, pctContribution, flag: projection >= 0 ? 'constructive' : 'destructive',
      };
    }).sort((a, b) => b.magnitude - a.magnitude);

    rows.push({ frequencyHz: f, finalRe, finalIm, finalMag, finalDb: 20 * Math.log10(Math.max(finalMag, 1e-10)), contributors });
  }
  return rows;
}

function findRowNear(rows, hz) {
  return rows.reduce((best, r) => (Math.abs(r.frequencyHz - hz) < Math.abs(best.frequencyHz - hz) ? r : best), rows[0]);
}

// ── 2. Cumulative vector build (production order = magnitude-desc as returned) ──
export function buildCumulativeSeries(row) {
  let runRe = 0, runIm = 0;
  const steps = [];
  row.contributors.forEach((c) => {
    const prevDb = 20 * Math.log10(Math.max(mag(runRe, runIm), 1e-10));
    runRe += c.re; runIm += c.im;
    const m = mag(runRe, runIm);
    const db = 20 * Math.log10(Math.max(m, 1e-10));
    steps.push({ modeKey: c.key, family: c.family, runningRe: runRe, runningIm: runIm, runningMagnitude: m, runningPhase: phaseDeg(runRe, runIm), splDb: db, splDeltaFromPrev: db - prevDb });
  });
  return steps;
}

// ── 3. Pairwise cancellation matrix ──
export function buildPairwiseMatrix(row) {
  const cs = row.contributors;
  const pairs = [];
  for (let i = 0; i < cs.length; i++) {
    for (let j = i + 1; j < cs.length; j++) {
      const a = cs[i], b = cs[j];
      let phaseDiff = a.phase - b.phase;
      while (phaseDiff > 180) phaseDiff -= 360;
      while (phaseDiff < -180) phaseDiff += 360;
      const dot = (a.re * b.re) + (a.im * b.im);
      const cosineSimilarity = (a.magnitude > 1e-12 && b.magnitude > 1e-12) ? dot / (a.magnitude * b.magnitude) : 0;
      const destructivePct = cosineSimilarity < 0 ? Math.abs(cosineSimilarity) * 100 : 0;
      const constructivePct = cosineSimilarity > 0 ? cosineSimilarity * 100 : 0;
      const pairCancellationEnergy = -dot; // negative dot = mutual cancellation energy
      pairs.push({ keyA: a.key, keyB: b.key, phaseDiffDeg: phaseDiff, cosineSimilarity, destructivePct, constructivePct, pairCancellationEnergy });
    }
  }
  const strongestDestructive = pairs.reduce((best, p) => (p.pairCancellationEnergy > (best?.pairCancellationEnergy ?? -Infinity) ? p : best), null);
  const strongestConstructive = pairs.reduce((best, p) => (p.pairCancellationEnergy < (best?.pairCancellationEnergy ?? Infinity) ? p : best), null);
  return { pairs, strongestDestructive, strongestConstructive };
}

// ── 4. Removal sensitivity: remove each significant mode, report delta at check frequencies ──
export function buildRemovalSensitivity(rows) {
  const allKeys = new Set();
  rows.forEach((r) => r.contributors.forEach((c) => allKeys.add(c.key)));
  return Array.from(allKeys).map((key) => {
    const deltas = {};
    CHECK_FREQS.forEach((hz) => {
      const row = findRowNear(rows, hz);
      const target = row.contributors.find((c) => c.key === key);
      if (!target) { deltas[hz] = 0; return; }
      const withoutRe = row.finalRe - target.re, withoutIm = row.finalIm - target.im;
      const withoutDb = 20 * Math.log10(Math.max(mag(withoutRe, withoutIm), 1e-10));
      deltas[hz] = withoutDb - row.finalDb;
    });
    return { key, deltas };
  });
}

// ── 5. Addition order audit — final sum must be identical regardless of order ──
export function buildAdditionOrderAudit(row) {
  const orders = {
    'production order': row.contributors,
    'frequency order': [...row.contributors].sort((a, b) => a.modeFrequencyHz - b.modeFrequencyHz),
    'largest magnitude first': [...row.contributors].sort((a, b) => b.magnitude - a.magnitude),
    'smallest magnitude first': [...row.contributors].sort((a, b) => a.magnitude - b.magnitude),
    'axial first': [...row.contributors].sort((a, b) => (a.family === 'axial' ? -1 : 1) - (b.family === 'axial' ? -1 : 1)),
    'tangential first': [...row.contributors].sort((a, b) => (a.family === 'tangential' ? -1 : 1) - (b.family === 'tangential' ? -1 : 1)),
    'oblique first': [...row.contributors].sort((a, b) => (a.family === 'oblique' ? -1 : 1) - (b.family === 'oblique' ? -1 : 1)),
  };
  const results = Object.entries(orders).map(([label, list]) => {
    let re = 0, im = 0;
    list.forEach((c) => { re += c.re; im += c.im; });
    return { label, re, im, magnitude: mag(re, im) };
  });
  const reference = results[0].magnitude;
  const allMatch = results.every((r) => Math.abs(r.magnitude - reference) < 1e-6);
  return { results, allMatch };
}

// ── 6. Modal ownership timeline ──
export function buildOwnershipTimeline(rows) {
  return rows.map((row) => {
    const byMag = [...row.contributors].sort((a, b) => b.magnitude - a.magnitude);
    const byDestructive = [...row.contributors].sort((a, b) => a.projection - b.projection);
    const byConstructive = [...row.contributors].sort((a, b) => b.projection - a.projection);
    const pw = buildPairwiseMatrix(row);
    return {
      frequencyHz: row.frequencyHz,
      dominant: byMag[0]?.key || null,
      second: byMag[1]?.key || null,
      mostDestructive: byDestructive[0]?.key || null,
      mostConstructive: byConstructive[0]?.key || null,
      strongestDestructivePair: pw.strongestDestructive ? `${pw.strongestDestructive.keyA}|${pw.strongestDestructive.keyB}` : null,
      strongestConstructivePair: pw.strongestConstructive ? `${pw.strongestConstructive.keyA}|${pw.strongestConstructive.keyB}` : null,
    };
  });
}

export function findOwnershipChanges(timeline) {
  const changes = [];
  for (let i = 1; i < timeline.length; i++) {
    if (timeline[i].dominant !== timeline[i - 1].dominant) {
      changes.push({ frequencyHz: timeline[i].frequencyHz, field: 'dominant', from: timeline[i - 1].dominant, to: timeline[i].dominant });
    }
  }
  return changes;
}

// ── 7. Recovery acceleration audit ──
export function buildRecoveryAccelerationAudit(rows, ownershipTimeline) {
  let nullIdx = 0;
  rows.forEach((r, i) => { if (r.finalDb < rows[nullIdx].finalDb) nullIdx = i; });
  const nullFreq = rows[nullIdx].frequencyHz;

  const after = rows.slice(nullIdx, Math.min(rows.length, nullIdx + 12));
  const events = [];
  for (let i = 1; i < after.length; i++) {
    const prevRow = after[i - 1], curRow = after[i];
    const prevDom = prevRow.contributors[0], curDom = curRow.contributors[0];
    if (curDom && prevDom && curDom.magnitude > prevDom.magnitude * 1.05 && curDom.key === prevDom.key) {
      events.push({ frequencyHz: curRow.frequencyHz, event: 'dominant mode grows' });
    }
    const prevPw = buildPairwiseMatrix(prevRow), curPw = buildPairwiseMatrix(curRow);
    if (prevPw.strongestDestructive && curPw.strongestDestructive && curPw.strongestDestructive.pairCancellationEnergy < prevPw.strongestDestructive.pairCancellationEnergy * 0.7) {
      events.push({ frequencyHz: curRow.frequencyHz, event: 'destructive pair weakens' });
    }
    if (prevPw.strongestConstructive && curPw.strongestConstructive && curPw.strongestConstructive.pairCancellationEnergy < prevPw.strongestConstructive.pairCancellationEnergy * 1.3) {
      events.push({ frequencyHz: curRow.frequencyHz, event: 'constructive pair strengthens' });
    }
  }
  const firstEvent = events[0] || null;
  return { nullFreq, events, firstEvent };
}

// ── 9. Automatic ranking ──
export function buildRanking(rows, removalSensitivity, ownershipTimeline) {
  const nullRow = findRowNear(rows, 30);
  const recoveryRow = findRowNear(rows, 40);

  const nullDriver = removalSensitivity.reduce((best, r) => {
    const d = Math.abs(r.deltas[30] ?? 0);
    return d > (best?.absDelta ?? -Infinity) ? { key: r.key, absDelta: d } : best;
  }, null);

  const recoveryDriver = removalSensitivity.reduce((best, r) => {
    const d = Math.abs(r.deltas[40] ?? 0) + Math.abs(r.deltas[35] ?? 0);
    return d > (best?.absDelta ?? -Infinity) ? { key: r.key, absDelta: d } : best;
  }, null);

  const pw30 = buildPairwiseMatrix(nullRow);
  const pw40 = buildPairwiseMatrix(recoveryRow);

  const recoveryAudit = buildRecoveryAccelerationAudit(rows, ownershipTimeline);
  const explains = !!(nullDriver && recoveryDriver && (nullDriver.absDelta > 0.5 || recoveryDriver.absDelta > 0.5));

  return {
    nullDriverMode: nullDriver?.key || null,
    recoveryDriverMode: recoveryDriver?.key || null,
    strongestCancellationPair: pw30.strongestDestructive ? `${pw30.strongestDestructive.keyA}|${pw30.strongestDestructive.keyB}` : null,
    strongestRecoveryPair: pw40.strongestConstructive ? `${pw40.strongestConstructive.keyA}|${pw40.strongestConstructive.keyB}` : null,
    firstInteractionChange: recoveryAudit.firstEvent,
    nullFreq: recoveryAudit.nullFreq,
    explains,
  };
}