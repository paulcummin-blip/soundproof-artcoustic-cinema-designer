// rewTransferParityAuditEngine.jsx
// Pure computation helpers for the REW Transfer Function Parity Audit.
// Read-only: reuses the exact live production engine/options already used by the
// other bass diagnostic panels. Alternate transfer-function formulations are computed
// side-by-side purely for comparison — none of them are fed back into production code,
// Q, coupling, weighting, summation, or the production graph.

import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';
import { resonantTransfer } from '@/bass/core/modalCalculations';
import { LIVE_SOURCE_CURVE, buildLiveEngineOptions } from '@/components/room/bass/LiveModalContributorAudit';

export function fmt(v, d = 4) { return Number.isFinite(v) ? v.toFixed(d) : '—'; }
export function mag(re, im) { return Math.sqrt(re * re + im * im); }
export function phaseDeg(re, im) { return (Math.atan2(im, re) * 180) / Math.PI; }

const TRACKED_MODE_KEY = { nx: 0, ny: 2, nz: 0 };
const TRACKED_NATIVE_FREQ = 57.17;

// Broadened-denominator diagnostic loss term (constant, independent of Q). Diagnostic only.
const BROADENING_LOSS = 0.05;
const PHASE_SLOW_FACTOR = 0.5;
const MAGNITUDE_SOFTEN_EXPONENT = 0.7;

export const VARIANT_DEFS = [
  { key: 'A', label: 'A. Current B44 transfer (production resonantTransfer)' },
  { key: 'B', label: 'B. Magnitude-squared variant (single |D| normalisation)' },
  { key: 'C', label: 'C. Damped oscillator impedance form (bandpass numerator)' },
  { key: 'D', label: 'D. Broadened denominator variant (+small loss term)' },
  { key: 'E', label: 'E. Phase-slowed variant (same |H|, slower phase rotation)' },
  { key: 'F', label: 'F. Magnitude-only softened variant (same phase, softened |H|)' },
];

// Computes all six transfer-function variants for one (frequencyHz, f0, Q) triple.
// Variant A is the exact production formula (resonantTransfer) — used for validation parity.
function computeVariants(frequencyHz, f0, qValue) {
  const omega = 2 * Math.PI * frequencyHz;
  const omega0 = 2 * Math.PI * Math.max(f0, 1e-6);
  const ratio = omega / omega0;
  const realDen = 1 - ratio * ratio;
  const imagDen = omega / (Math.max(qValue, 1e-6) * omega0);
  const denominatorSq = realDen * realDen + imagDen * imagDen;
  const denominatorMag = Math.sqrt(denominatorSq);

  // A — exact production formula
  const A = resonantTransfer(frequencyHz, f0, qValue);

  // B — magnitude-squared variant: normalise by |D| instead of |D|^2 (single power, not squared)
  const bDen = Math.max(denominatorMag, 1e-9);
  const B = { re: realDen / bDen, im: -imagDen / bDen, denRe: realDen, denIm: imagDen, denMag: denominatorMag };

  // C — damped oscillator impedance (bandpass) form: numerator = j*(ratio/Q) instead of 1
  const numRe_C = 0, numIm_C = ratio / Math.max(qValue, 1e-6);
  const cDenSq = denominatorSq;
  const cRe = (numRe_C * realDen + numIm_C * imagDen) / cDenSq;
  const cIm = (numIm_C * realDen - numRe_C * imagDen) / cDenSq;
  const C = { re: cRe, im: cIm, denRe: realDen, denIm: imagDen, denMag: denominatorMag };

  // D — broadened denominator: add a fixed diagnostic loss term to imagDen
  const dImagDen = imagDen + BROADENING_LOSS;
  const dDenSq = realDen * realDen + dImagDen * dImagDen;
  const D = { re: realDen / dDenSq, im: -dImagDen / dDenSq, denRe: realDen, denIm: dImagDen, denMag: Math.sqrt(dDenSq) };

  // E — phase-slowed: same magnitude as A, phase scaled by PHASE_SLOW_FACTOR
  const aMag = Math.sqrt(A.re * A.re + A.im * A.im);
  const aPhase = Math.atan2(A.im, A.re);
  const ePhase = aPhase * PHASE_SLOW_FACTOR;
  const E = { re: aMag * Math.cos(ePhase), im: aMag * Math.sin(ePhase), denRe: realDen, denIm: imagDen, denMag: denominatorMag };

  // F — magnitude-only softened: same phase as A, magnitude compressed by a soft exponent
  const softMag = Math.pow(aMag, MAGNITUDE_SOFTEN_EXPONENT);
  const F = { re: softMag * Math.cos(aPhase), im: softMag * Math.sin(aPhase), denRe: realDen, denIm: imagDen, denMag: denominatorMag };

  return {
    A: { re: A.re, im: A.im, denRe: realDen, denIm: imagDen, denMag: denominatorMag },
    B, C, D, E, F,
  };
}

// Runs the production engine once per frequency to obtain: the tracked mode's real gain
// chain (everything except the transfer function itself), and the true production final vector.
function runOneFrequency(frequencyHz, roomDims, seatPos, subsForSimulation, surfaceAbsorption) {
  const options = buildLiveEngineOptions(frequencyHz, surfaceAbsorption);
  let engineFinalRe = 0, engineFinalIm = 0;
  let trackedRe = 0, trackedIm = 0, trackedQ = null, trackedModeFreq = TRACKED_NATIVE_FREQ;
  let trackedTransferRe = 0, trackedTransferIm = 0;
  let gainMagnitudeSum = 0; // sum of |modalGain| across subs (real scalar chain excluding transfer fn)

  subsForSimulation.forEach((sub) => {
    const engineOut = simulateBassResponseRewCore(roomDims, seatPos, sub, LIVE_SOURCE_CURVE, options);
    const vec = engineOut.perFrequencyVectorDebug?.[0];
    if (vec) { engineFinalRe += vec.finalRe || 0; engineFinalIm += vec.finalIm || 0; }
    const debugRow = engineOut.activeModalContributorDebugSeries?.[0];
    const tracked = debugRow?.contributors?.find(
      (c) => c.nx === TRACKED_MODE_KEY.nx && c.ny === TRACKED_MODE_KEY.ny && c.nz === TRACKED_MODE_KEY.nz
    );
    if (tracked) {
      trackedRe += tracked.activeReal;
      trackedIm += tracked.activeImag;
      trackedTransferRe += tracked.transferReal;
      trackedTransferIm += tracked.transferImag;
      trackedQ = tracked.qValue;
      trackedModeFreq = tracked.modeFrequencyHz;
      // Recover the real scalar gain chain (everything the engine applied except the transfer
      // function itself) by dividing the engine's own active contribution by its own transfer value.
      const tfMag = mag(tracked.transferReal, tracked.transferImag);
      if (tfMag > 1e-12) {
        gainMagnitudeSum += mag(tracked.activeReal, tracked.activeImag) / tfMag;
      }
    }
  });

  return {
    frequencyHz, engineFinalRe, engineFinalIm,
    trackedRe, trackedIm, trackedQ, trackedModeFreq,
    trackedTransferRe, trackedTransferIm,
    gainMagnitude: gainMagnitudeSum,
  };
}

export function buildTransferParitySweep(freqStart, freqEnd, step, roomDims, seatPos, subsForSimulation, surfaceAbsorption) {
  const raw = [];
  for (let f = freqStart; f <= freqEnd + 1e-9; f += step) {
    raw.push(runOneFrequency(f, roomDims, seatPos, subsForSimulation, surfaceAbsorption));
  }

  const rows = raw.map((r) => {
    const f0 = r.trackedModeFreq || TRACKED_NATIVE_FREQ;
    const q = r.trackedQ ?? 4.0;
    const variants = computeVariants(r.frequencyHz, f0, q);

    // Production dominant-mode phase relative to raw transfer A (accounts for tuning phase,
    // storage factor, high-order scale already baked into r.trackedRe/Im by the engine).
    // Derived rotation = angle(tracked) - angle(variant A transfer).
    const aPhaseRad = Math.atan2(variants.A.im, variants.A.re);
    const trackedPhaseRad = Math.atan2(r.trackedIm, r.trackedRe);
    const extraRotationRad = trackedPhaseRad - aPhaseRad;
    const cosR = Math.cos(extraRotationRad), sinR = Math.sin(extraRotationRad);

    const variantData = {};
    Object.entries(variants).forEach(([key, v]) => {
      // Predicted dominant-mode contribution: same real gain chain + same extra rotation as
      // production applies, but using this variant's transfer function instead of A's.
      const rotatedRe = (v.re * cosR) - (v.im * sinR);
      const rotatedIm = (v.re * sinR) + (v.im * cosR);
      const predictedContribRe = r.gainMagnitude * rotatedRe;
      const predictedContribIm = r.gainMagnitude * rotatedIm;

      // Predicted final vector: swap out production's tracked contribution for this variant's.
      const predictedFinalRe = r.engineFinalRe - r.trackedRe + predictedContribRe;
      const predictedFinalIm = r.engineFinalIm - r.trackedIm + predictedContribIm;
      const predictedFinalMag = mag(predictedFinalRe, predictedFinalIm);
      const predictedFinalSplDb = 20 * Math.log10(Math.max(predictedFinalMag, 1e-10));

      variantData[key] = {
        transferRe: v.re, transferIm: v.im,
        transferMagnitude: mag(v.re, v.im), transferPhase: phaseDeg(v.re, v.im),
        denominatorRe: v.denRe, denominatorIm: v.denIm, denominatorMagnitude: v.denMag,
        predictedDominantMagnitude: mag(predictedContribRe, predictedContribIm),
        predictedFinalSplDb,
      };
    });

    return { frequencyHz: r.frequencyHz, f0, q, engineFinalMag: mag(r.engineFinalRe, r.engineFinalIm), variants: variantData };
  });

  // Phase velocity (deg/Hz) and magnitude growth (per Hz) via finite differences, per variant
  VARIANT_DEFS.forEach(({ key }) => {
    for (let i = 0; i < rows.length; i++) {
      const prev = rows[i - 1], next = rows[i + 1];
      const cur = rows[i].variants[key];
      let phaseVelocity = null, magGrowth = null;
      if (prev && next) {
        let dPhase = next.variants[key].transferPhase - prev.variants[key].transferPhase;
        while (dPhase > 180) dPhase -= 360;
        while (dPhase < -180) dPhase += 360;
        phaseVelocity = dPhase / (next.frequencyHz - prev.frequencyHz);
        magGrowth = (next.variants[key].transferMagnitude - prev.variants[key].transferMagnitude) / (next.frequencyHz - prev.frequencyHz);
      } else if (next) {
        phaseVelocity = (next.variants[key].transferPhase - cur.transferPhase) / (next.frequencyHz - rows[i].frequencyHz);
        magGrowth = (next.variants[key].transferMagnitude - cur.transferMagnitude) / (next.frequencyHz - rows[i].frequencyHz);
      } else if (prev) {
        phaseVelocity = (cur.transferPhase - prev.variants[key].transferPhase) / (rows[i].frequencyHz - prev.frequencyHz);
        magGrowth = (cur.transferMagnitude - prev.variants[key].transferMagnitude) / (rows[i].frequencyHz - prev.frequencyHz);
      }
      cur.phaseVelocityDegPerHz = phaseVelocity;
      cur.magnitudeGrowthPerHz = magGrowth;
    }
  });

  // Effective -3dB / -6dB bandwidth + effective Q, per variant, based on the swept magnitude curve
  const bandwidthResults = {};
  VARIANT_DEFS.forEach(({ key }) => {
    const mags = rows.map((r) => r.variants[key].transferMagnitude);
    let peakIdx = 0;
    mags.forEach((m, i) => { if (m > mags[peakIdx]) peakIdx = i; });
    const peakMag = mags[peakIdx];
    const peakDb = 20 * Math.log10(Math.max(peakMag, 1e-12));

    const findCrossing = (thresholdDb) => {
      let lowIdx = peakIdx, highIdx = peakIdx;
      while (lowIdx > 0 && (20 * Math.log10(Math.max(mags[lowIdx], 1e-12))) > peakDb - thresholdDb) lowIdx--;
      while (highIdx < mags.length - 1 && (20 * Math.log10(Math.max(mags[highIdx], 1e-12))) > peakDb - thresholdDb) highIdx++;
      return { lowHz: rows[lowIdx].frequencyHz, highHz: rows[highIdx].frequencyHz, bandwidthHz: rows[highIdx].frequencyHz - rows[lowIdx].frequencyHz };
    };

    const bw3 = findCrossing(3);
    const bw6 = findCrossing(6);
    const f0 = rows[0].f0;
    const effectiveQ = bw3.bandwidthHz > 0 ? f0 / bw3.bandwidthHz : null;

    bandwidthResults[key] = { bw3dBHz: bw3.bandwidthHz, bw6dBHz: bw6.bandwidthHz, effectiveQ };
    rows.forEach((r) => {
      r.variants[key].effectiveBandwidth3dBHz = bw3.bandwidthHz;
      r.variants[key].effectiveBandwidth6dBHz = bw6.bandwidthHz;
      r.variants[key].effectiveQ = effectiveQ;
    });
  });

  return { rows, bandwidthResults };
}

function findRowNear(rows, targetHz) {
  return rows.reduce((best, r) => (Math.abs(r.frequencyHz - targetHz) < Math.abs(best.frequencyHz - targetHz) ? r : best), rows[0]);
}

export function validateProductionParity(rows) {
  // Variant A's predicted final SPL must equal the true production engine final SPL exactly
  // (it uses the real tracked contribution with zero substitution — same vector in, same vector out).
  return rows.every((r) => {
    const diff = Math.abs(r.variants.A.predictedFinalSplDb - (20 * Math.log10(Math.max(r.engineFinalMag, 1e-10))));
    return diff < 1e-6;
  });
}

export function rankVariants(rows) {
  const checkFreqs = [30, 35, 40, 45, 50, 57, 58];
  const baseline = {};
  checkFreqs.forEach((hz) => { baseline[hz] = findRowNear(rows, hz).variants.A.predictedFinalSplDb; });

  const results = VARIANT_DEFS.map(({ key, label }) => {
    const deltas = {};
    checkFreqs.forEach((hz) => {
      const row = findRowNear(rows, hz);
      deltas[hz] = row.variants[key].predictedFinalSplDb - baseline[hz];
    });

    const constraint30 = Math.abs(deltas[30]) <= 1.0;
    const constraint50 = Math.abs(deltas[50]) <= 2.0;
    const constraint57 = Math.abs(deltas[57]) <= 2.0;
    const constraint58 = Math.abs(deltas[58]) <= 2.0;
    const constraintsPass = constraint30 && constraint50 && constraint57 && constraint58;

    // Widening score: average increase in level at 35/40 Hz (shallower null = higher dB there)
    const wideningScore = (deltas[35] + deltas[40]) / 2;

    return { key, label, deltas, constraintsPass, wideningScore };
  });

  const eligible = results.filter((r) => r.constraintsPass && r.key !== 'A');
  eligible.sort((a, b) => b.wideningScore - a.wideningScore);
  const best = eligible[0] || null;

  return { results, best, checkFreqs };
}