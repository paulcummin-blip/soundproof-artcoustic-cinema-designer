// dominantModeConstructionAuditEngine.jsx
// Pure computation helpers for the Dominant Mode Construction Audit.
// Read-only: reuses the exact live production engine + options already used by
// LiveVectorGeometryAudit / LiveModalContributorAudit. Reconstruction duplicates
// the exact formulas from rewBassEngine.js / modalCalculations.js purely for
// independent verification — it does not alter, call, or feed back into production code.

import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';
import { resonantTransfer } from '@/bass/core/modalCalculations';
import { LIVE_SOURCE_CURVE, buildLiveEngineOptions } from '@/components/room/bass/LiveModalContributorAudit';

const SPEED_OF_SOUND_MPS = 343;

export function fmt(v, d = 4) { return Number.isFinite(v) ? v.toFixed(d) : '—'; }
export function mag(re, im) { return Math.sqrt(re * re + im * im); }
export function phaseDeg(re, im) { return (Math.atan2(im, re) * 180) / Math.PI; }
function shortestAngleDiff(a, b) { let d = b - a; while (d > 180) d -= 360; while (d <= -180) d += 360; return d; }

// interpolateCurveDb — mirrors rewBassEngine.js exactly, needed only to independently
// recompute modalSourceAmplitude for reconstruction (LIVE_SOURCE_CURVE is flat 94dB).
function interpolateCurveDb(curvePoints, hz) {
  const points = curvePoints.map((p) => ({ hz: p.hz, db: p.db })).sort((a, b) => a.hz - b.hz);
  if (hz <= points[0].hz) return points[0].db;
  if (hz >= points[points.length - 1].hz) return points[points.length - 1].db;
  for (let i = 0; i < points.length - 1; i++) {
    if (hz >= points[i].hz && hz <= points[i + 1].hz) {
      const ratio = (hz - points[i].hz) / (points[i + 1].hz - points[i].hz);
      return points[i].db + (points[i + 1].db - points[i].db) * ratio;
    }
  }
  return points[0].db;
}

function runOneFrequency(frequencyHz, roomDims, seatPos, subsForSimulation, surfaceAbsorption) {
  const options = buildLiveEngineOptions(frequencyHz, surfaceAbsorption);
  let engineFinalRe = 0, engineFinalIm = 0;
  const merged = new Map();

  subsForSimulation.forEach((sub) => {
    const engineOut = simulateBassResponseRewCore(roomDims, seatPos, sub, LIVE_SOURCE_CURVE, options);
    const vec = engineOut.perFrequencyVectorDebug?.[0];
    if (vec) { engineFinalRe += vec.finalRe || 0; engineFinalIm += vec.finalIm || 0; }
    const debugRow = engineOut.activeModalContributorDebugSeries?.[0];
    if (debugRow?.contributors) {
      debugRow.contributors.forEach((c) => {
        const key = `${c.nx},${c.ny},${c.nz}`;
        if (!merged.has(key)) {
          merged.set(key, {
            key, nx: c.nx, ny: c.ny, nz: c.nz,
            modeFrequencyHz: c.modeFrequencyHz, modeType: c.modeType, qValue: c.qValue,
            re: 0, im: 0, transferReal: 0, transferImag: 0,
            sourceCouplingSum: 0, receiverCoupling: c.receiverCoupling, subCount: 0,
          });
        }
        const m = merged.get(key);
        m.re += c.activeReal;
        m.im += c.activeImag;
        m.transferReal += c.transferReal;
        m.transferImag += c.transferImag;
        m.sourceCouplingSum += c.sourceCoupling;
        m.subCount += 1;
      });
    }
  });

  return { frequencyHz, engineFinalRe, engineFinalIm, contributors: Array.from(merged.values()), options };
}

// Reconstructs every construction stage for the tracked mode at one frequency, using
// the exact same formulas/constants as rewBassEngine.js's modalPressureContributionLocal
// + legacyModalTransferLocal, given the fixed live-engine options and the mode's own
// engine-reported qValue/couplings. subsForSimulation supplies real per-sub tuning/position.
function reconstructStage(frequencyHz, trackedContrib, roomDims, seatPos, subsForSimulation, options) {
  const modeFreq = trackedContrib.modeFrequencyHz;
  const qValue = trackedContrib.qValue;
  const modeOrder = Math.abs(trackedContrib.nx) + Math.abs(trackedContrib.ny) + Math.abs(trackedContrib.nz);
  const modeType = trackedContrib.modeType;

  // Stage 2 — raw transfer function (canonical resonantTransfer, numerator = 1 + 0j)
  const tf = resonantTransfer(frequencyHz, modeFreq, qValue);
  const numeratorRe = 1, numeratorIm = 0;
  const denominatorRe = tf.realDen, denominatorIm = tf.imagDen;

  // Stage 3/4/5 — accumulate per active sub, mirroring legacyModalTransferLocal + modalPressureContributionLocal exactly
  let sumRe = 0, sumIm = 0;
  let firstSub = null;

  subsForSimulation.forEach((sub) => {
    const curveDb = interpolateCurveDb(LIVE_SOURCE_CURVE, frequencyHz);
    const gainDb = Number.isFinite(Number(sub?.tuning?.gainDb)) ? Number(sub.tuning.gainDb) : 0;
    const delayMs = Number.isFinite(Number(sub?.tuning?.delayMs)) ? Number(sub.tuning.delayMs) : 0;
    const polarity = Number(sub?.tuning?.polarity) === 180 ? 180 : 0;

    const modalGainScalar = options.modalGainScalar;
    const modalSourceAmplitudeBase = Math.pow(10, (curveDb + gainDb) / 20) * modalGainScalar;

    // Distance term — options.modalSourceReferenceMode === 'distance_normalized' (live default)
    const dx = sub.x - seatPos.x, dy = sub.y - seatPos.y, dz = (sub.z ?? 0.35) - seatPos.z;
    const distanceM = Math.max(0.01, Math.sqrt(dx * dx + dy * dy + dz * dz));
    const distanceLossDb = -20 * Math.log10(distanceM / 1);
    const roomVolumeM3 = roomDims.widthM * roomDims.lengthM * roomDims.heightM;
    let modalSourceAmplitude;
    let distanceTermUsed;
    if (options.modalSourceReferenceMode === 'distance_normalized') {
      modalSourceAmplitude = modalSourceAmplitudeBase * Math.pow(10, distanceLossDb / 20);
      distanceTermUsed = true;
    } else if (options.modalSourceReferenceMode === 'room_volume' || options.modalSourceReferenceMode === 'room_normalized') {
      modalSourceAmplitude = modalSourceAmplitudeBase / Math.sqrt(Math.max(roomVolumeM3, 1e-6));
      distanceTermUsed = false;
    } else {
      modalSourceAmplitude = modalSourceAmplitudeBase;
      distanceTermUsed = false;
    }

    // Source→mode / mode→listener coupling — taken from the engine's own reported values
    // (identical formula: cos product mode shape function), not recomputed independently,
    // since the engine already exposes these per-mode per-frequency.
    const combinedCoupling = trackedContrib.subCount > 0
      ? (trackedContrib.sourceCouplingSum / trackedContrib.subCount) * trackedContrib.receiverCoupling
      : 0;

    const orderWeight = 1.0; // production: global order attenuation removed, always 1.0
    const modalGain = modalSourceAmplitude * combinedCoupling * orderWeight;

    // Propagation phase — live options force propagationPhaseScale=0 & disableModalPropagationPhase=true
    const cosP = options.disableModalPropagationPhase ? 1 : Math.cos(0);
    const sinP = options.disableModalPropagationPhase ? 0 : Math.sin(0);
    const alignedReal = (tf.re * cosP) - (tf.im * sinP);
    const alignedImag = (tf.re * sinP) + (tf.im * cosP);

    // Tuning phase (delay + polarity) — real per-sub values
    const tuningPhase = (-2 * Math.PI * frequencyHz * (delayMs / 1000)) + (polarity === 180 ? Math.PI : 0);
    const tuningCos = Math.cos(tuningPhase), tuningSin = Math.sin(tuningPhase);
    const tunedReal = (modalGain * alignedReal * tuningCos) - (modalGain * alignedImag * tuningSin);
    const tunedImag = (modalGain * alignedReal * tuningSin) + (modalGain * alignedImag * tuningCos);

    // Storage factor — live options.modalStorageMode === 'none' => 1.0 (no effect)
    const storageFactor = options.modalStorageMode === 'none' ? 1.0 : 1.0;
    const storedReal = tunedReal * storageFactor;
    const storedImag = tunedImag * storageFactor;

    // pureDeterministicModalSum === true (live) => no phase-perturbation stage applied
    const activeReal = storedReal;
    const activeImag = storedImag;

    // High-order axial correction — only applies to axial modes with order >= 2
    const highOrderAxialScale = Number.isFinite(Number(options.highOrderAxialScale)) ? Number(options.highOrderAxialScale) : 1.0;
    const highOrderScaleApplied = (modeType === 'axial' && modeOrder >= 2) ? highOrderAxialScale : 1.0;

    // Per-family scale — not present in live options => defaults to 1.0 (no-op)
    const familyScale = 1.0;

    const finalReal = activeReal * highOrderScaleApplied * familyScale;
    const finalImag = activeImag * highOrderScaleApplied * familyScale;

    sumRe += finalReal;
    sumIm += finalImag;

    if (!firstSub) {
      firstSub = {
        distanceM, distanceLossDb, distanceTermUsed, roomVolumeM3,
        modalSourceAmplitudeBase, modalSourceAmplitude, combinedCoupling,
        orderWeight, modalGain, tuningPhase, storageFactor,
        highOrderScaleApplied, familyScale, gainDb, delayMs, polarity,
        modalGainScalar,
      };
    }
  });

  const reconMag = mag(sumRe, sumIm);
  const reconPhase = phaseDeg(sumRe, sumIm);
  const engineMag = mag(trackedContrib.re, trackedContrib.im);
  const engineTolerance = 1e-6 * Math.max(1, engineMag);
  const pass = Math.abs(reconMag - engineMag) < engineTolerance || Math.abs(reconMag - engineMag) / Math.max(engineMag, 1e-12) < 1e-3;
  const numericalError = engineMag > 1e-12 ? Math.abs(reconMag - engineMag) / engineMag : Math.abs(reconMag - engineMag);

  return {
    frequencyHz,
    modeId: `(${trackedContrib.nx},${trackedContrib.ny},${trackedContrib.nz})`,
    family: modeType,
    nativeFrequencyHz: modeFreq,
    modeOrder,
    transfer: {
      numeratorRe, numeratorIm,
      denominatorRe, denominatorIm,
      magnitude: tf.transferMag, phase: phaseDeg(tf.re, tf.im), real: tf.re, imag: tf.im,
    },
    distance: firstSub,
    physics: {
      qValue,
      bandwidthHz: qValue > 0 ? modeFreq / qValue : null,
      dampingRatio: qValue > 0 ? 1 / (2 * qValue) : null,
      lossFactor: qValue > 0 ? 1 / qValue : null,
      decayConstant: qValue > 0 ? (qValue / (Math.PI * modeFreq)) : null, // tau = Q/(pi*f0)
      storedEnergyTerm: 'Not used (modalStorageMode: none)',
      frequencyDependentCorrection: (modeType === 'axial' && modeOrder >= 2)
        ? `Applied — highOrderAxialScale = ${fmt(firstSub?.highOrderScaleApplied, 3)}`
        : 'Not used (mode is not high-order axial)',
      modalWeighting: 'Not used (family scale = 1.0, no-op at live settings)',
      interpolation: 'Not used (no interpolation in modal transfer path)',
      everyMultiplicativeScalar: {
        modalGainScalar: firstSub?.modalGainScalar ?? 1.0,
        orderWeight: 1.0,
        storageFactor: firstSub?.storageFactor ?? 1.0,
        highOrderAxialScale: firstSub?.highOrderScaleApplied ?? 1.0,
        familyScale: 1.0,
      },
    },
    timeline: [
      { label: 'Raw transfer', re: tf.re, im: tf.im, mag: tf.transferMag, phase: phaseDeg(tf.re, tf.im) },
      { label: 'After source+listener coupling', re: tf.re * (firstSub?.combinedCoupling ?? 0), im: tf.im * (firstSub?.combinedCoupling ?? 0), mag: tf.transferMag * Math.abs(firstSub?.combinedCoupling ?? 0), phase: phaseDeg(tf.re, tf.im) },
      { label: 'After modal source amplitude', re: (tf.re * (firstSub?.combinedCoupling ?? 0)) * (firstSub?.modalSourceAmplitude ?? 0), im: (tf.im * (firstSub?.combinedCoupling ?? 0)) * (firstSub?.modalSourceAmplitude ?? 0), mag: null, phase: null },
      { label: 'After distance/room-normalisation term', re: null, im: null, mag: firstSub?.modalSourceAmplitude ?? null, phase: null },
      { label: 'After tuning phase (delay+polarity)', re: sumRe, im: sumIm, mag: reconMag, phase: reconPhase },
      { label: 'After storage factor (no-op)', re: sumRe, im: sumIm, mag: reconMag, phase: reconPhase },
      { label: 'After high-order axial / family scaling', re: sumRe, im: sumIm, mag: reconMag, phase: reconPhase },
      { label: 'Final dominant mode vector', re: sumRe, im: sumIm, mag: reconMag, phase: reconPhase },
    ],
    reconstructedRe: sumRe, reconstructedIm: sumIm, reconstructedMag: reconMag, reconstructedPhase: reconPhase,
    engineRe: trackedContrib.re, engineIm: trackedContrib.im, engineMag, enginePhase: phaseDeg(trackedContrib.re, trackedContrib.im),
    pass, numericalError,
  };
}

export function buildDominantModeConstructionSweep(freqStart, freqEnd, step, roomDims, seatPos, subsForSimulation, surfaceAbsorption) {
  const raw = [];
  for (let f = freqStart; f <= freqEnd + 1e-9; f += step) {
    raw.push(runOneFrequency(f, roomDims, seatPos, subsForSimulation, surfaceAbsorption));
  }
  // Identify the tracked dominant mode exactly as prior audits do: strongest contributor
  // at the frequency where the final summed vector is smallest (the null).
  let nullIdx = 0, nullMag = Infinity;
  raw.forEach((r, i) => {
    const m = mag(r.engineFinalRe, r.engineFinalIm);
    if (m < nullMag) { nullMag = m; nullIdx = i; }
  });
  const nullContribs = raw[nullIdx].contributors.map((c) => ({ ...c, mag: mag(c.re, c.im) })).sort((a, b) => b.mag - a.mag);
  const trackedKey = nullContribs[0]?.key ?? null;

  const rows = raw.map((r) => {
    const tracked = r.contributors.find((c) => c.key === trackedKey);
    if (!tracked) return null;
    return reconstructStage(r.frequencyHz, tracked, roomDims, seatPos, subsForSimulation, r.options);
  }).filter(Boolean);

  // Delta / derivative analysis across every exposed scalar quantity
  const scalarGetters = {
    reconstructedMag: (r) => r.reconstructedMag,
    reconstructedPhase: (r) => r.reconstructedPhase,
    reconstructedRe: (r) => r.reconstructedRe,
    reconstructedIm: (r) => r.reconstructedIm,
    transferMag: (r) => r.transfer.magnitude,
    transferPhase: (r) => r.transfer.phase,
    transferReal: (r) => r.transfer.real,
    transferImag: (r) => r.transfer.imag,
    denominatorRe: (r) => r.transfer.denominatorRe,
    denominatorIm: (r) => r.transfer.denominatorIm,
    qValue: (r) => r.physics.qValue,
    dampingRatio: (r) => r.physics.dampingRatio,
    combinedCoupling: (r) => r.distance?.combinedCoupling ?? 0,
    distanceLossDb: (r) => r.distance?.distanceLossDb ?? 0,
    modalSourceAmplitude: (r) => r.distance?.modalSourceAmplitude ?? 0,
  };

  const isPhaseKey = (k) => k === 'reconstructedPhase' || k === 'transferPhase';

  rows.forEach((row, i) => {
    row.deltas = {};
    row.derivative1 = {};
    row.derivative2 = {};
    Object.entries(scalarGetters).forEach(([key, getVal]) => {
      const prev = rows[i - 1], next = rows[i + 1];
      const cur = getVal(row);
      let dPrev = null, dNext = null;
      if (prev) {
        const dHz = row.nativeFrequencyHz && rows[i].frequencyHzOf ? 1 : 1; // step is constant; use index spacing
        dPrev = isPhaseKey(key) ? shortestAngleDiff(getVal(prev), cur) : cur - getVal(prev);
      }
      if (next) dNext = isPhaseKey(key) ? shortestAngleDiff(cur, getVal(next)) : getVal(next) - cur;
      row.deltas[key] = dPrev !== null ? dPrev : dNext;
      row.derivative1[key] = (dPrev !== null && dNext !== null) ? (dPrev + dNext) / 2 : (dPrev ?? dNext);
    });
  });
  for (let i = 1; i < rows.length - 1; i++) {
    Object.keys(scalarGetters).forEach((key) => {
      row2ndDeriv(rows, i, key);
    });
  }
  function row2ndDeriv(rows, i, key) {
    const d1 = rows[i + 1].derivative1[key] - rows[i - 1].derivative1[key];
    rows[i].derivative2[key] = d1 / 2;
  }

  // Percentage / normalised change + z-score, per scalar, relative to sweep start
  Object.keys(scalarGetters).forEach((key) => {
    const values = rows.map((r) => scalarGetters[key](r));
    const base = values[0];
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
    const std = Math.sqrt(variance) || 1e-9;
    rows.forEach((r, i) => {
      r.pctChange = r.pctChange || {};
      r.zScore = r.zScore || {};
      r.pctChange[key] = base !== 0 ? ((values[i] - base) / Math.abs(base)) * 100 : null;
      r.zScore[key] = (values[i] - mean) / std;
    });
  });

  return { rows, nullIdx, trackedKey, scalarGetters };
}

// Correlation of each stage quantity against final reconstructed dominant-mode magnitude (Pearson r)
export function computeCorrelationRanking(rows, scalarGetters) {
  const target = rows.map((r) => r.reconstructedMag);
  const targetMean = target.reduce((a, b) => a + b, 0) / target.length;

  const results = Object.entries(scalarGetters)
    .filter(([key]) => key !== 'reconstructedMag')
    .map(([key, getVal]) => {
      const values = rows.map((r) => getVal(r));
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      let num = 0, denA = 0, denB = 0;
      values.forEach((v, i) => {
        num += (v - mean) * (target[i] - targetMean);
        denA += (v - mean) ** 2;
        denB += (target[i] - targetMean) ** 2;
      });
      const r = (denA > 0 && denB > 0) ? num / Math.sqrt(denA * denB) : 0;
      return { name: key, correlation: Number.isFinite(r) ? r : 0 };
    })
    .sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));

  return results;
}

// Ranked "first physical quantity to deviate" — same threshold-crossing technique as prior audits.
export function computeRootCauseRanking(rows, nullIdx, scalarGetters) {
  const fromNull = rows.slice(nullIdx);
  if (fromNull.length < 2) return [];

  const labels = {
    combinedCoupling: 'Source/listener coupling', qValue: 'Q variation', dampingRatio: 'Damping ratio',
    transferMag: 'Raw transfer magnitude', transferPhase: 'Raw transfer phase',
    distanceLossDb: 'Distance attenuation', modalSourceAmplitude: 'Modal source amplitude / room normalisation',
    denominatorRe: 'Transfer denominator (real)', denominatorIm: 'Transfer denominator (imag)',
    reconstructedMag: 'Dominant mode magnitude', reconstructedPhase: 'Dominant mode phase',
  };

  const candidates = Object.entries(scalarGetters)
    .filter(([key]) => labels[key])
    .map(([key, getVal]) => {
      const base = getVal(fromNull[0]);
      const baseAbs = Math.abs(base) || 1e-9;
      const idxCross = fromNull.findIndex((r, i) => {
        if (i === 0) return false;
        return Math.abs(getVal(r) - base) / baseAbs > 0.5;
      });
      const startFreq = idxCross >= 0 ? fromNull[idxCross].frequencyHz : null;
      const deltas = [];
      for (let i = 1; i < fromNull.length; i++) deltas.push(Math.abs(getVal(fromNull[i]) - getVal(fromNull[i - 1])));
      const rateOfChange = deltas.length ? Math.max(...deltas) : 0;
      const maxRelChange = Math.max(...fromNull.map((r) => Math.abs(getVal(r) - base) / baseAbs));
      const confidence = Math.max(0, Math.min(99, Math.round(maxRelChange * 100)));
      return {
        name: labels[key], key,
        startFreq,
        rateOfChange, confidence,
      };
    });

  candidates.sort((a, b) => {
    if (a.startFreq === null && b.startFreq === null) return b.confidence - a.confidence;
    if (a.startFreq === null) return 1;
    if (b.startFreq === null) return -1;
    return a.startFreq - b.startFreq;
  });
  return candidates;
}