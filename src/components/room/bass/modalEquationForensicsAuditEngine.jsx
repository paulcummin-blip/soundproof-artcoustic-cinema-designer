// modalEquationForensicsAuditEngine.jsx
// Pure computation helpers for the Modal Equation Forensics Audit.
// STRICT DIAGNOSTIC: read-only. Reuses the exact live production engine/options (same as the
// other bass diagnostic panels). Twelve accepted room-acoustics transfer formulations are
// computed side-by-side purely for comparison — none are fed back into production code, Q,
// coupling, weighting, summation, or the production graph.

import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';
import { resonantTransfer } from '@/bass/core/modalCalculations';
import { LIVE_SOURCE_CURVE, buildLiveEngineOptions } from '@/components/room/bass/LiveModalContributorAudit';

export function fmt(v, d = 4) { return Number.isFinite(v) ? v.toFixed(d) : '—'; }
function mag(re, im) { return Math.sqrt(re * re + im * im); }
function phaseDeg(re, im) { return (Math.atan2(im, re) * 180) / Math.PI; }
function complexDiv(nRe, nIm, dRe, dIm) {
  const denSq = dRe * dRe + dIm * dIm;
  return { re: (nRe * dRe + nIm * dIm) / denSq, im: (nIm * dRe - nRe * dIm) / denSq };
}

const TRACKED_MODE_KEY = { nx: 0, ny: 2, nz: 0 };
const TRACKED_NATIVE_FREQ = 57.17;
const OVERLAP_LOSS = 0.08;
const BROAD_LOSS = 0.15;

export const FORMULATION_DEFS = [
  { key: 'F1', label: '1. Current B44 production equation' },
  { key: 'F2', label: '2. Classical second-order resonator (mechanical form)', note: 'algebraically equivalent to #1 once normalised' },
  { key: 'F3', label: '3. Damped harmonic oscillator impedance form (bandpass numerator)' },
  { key: 'F4', label: '4. Pressure modal Green\'s function form', note: 'algebraically equivalent to #1 once normalised' },
  { key: 'F5', label: '5. Allen & Berkley style modal radiation-weighted form' },
  { key: 'F6', label: '6. Kuttruff-style modal denominator form (δ damping constant)', note: 'algebraically equivalent to #1 once normalised' },
  { key: 'F7', label: '7. Frequency-dependent numerator variant (∝ ratio²)' },
  { key: 'F8', label: '8. Radiation/velocity numerator variant (∝ jω/ω0)' },
  { key: 'F9', label: '9. Energy-normalised modal response (÷ √(Q/4))' },
  { key: 'F10', label: '10. Modal overlap / complex denominator coupling variant' },
  { key: 'F11', label: '11. Minimum-phase reconstructed version (magnitude kept, phase re-derived)' },
  { key: 'F12', label: '12. Broad loss-term denominator version' },
];

function computeFormulations(frequencyHz, f0, qValue) {
  const omega = 2 * Math.PI * frequencyHz;
  const omega0 = 2 * Math.PI * Math.max(f0, 1e-6);
  const ratio = omega / omega0;
  const realDen = 1 - ratio * ratio;
  const imagDen = omega / (Math.max(qValue, 1e-6) * omega0);

  const H1 = resonantTransfer(frequencyHz, f0, qValue); // production

  const mk = (numRe, numIm, denRe, denIm) => {
    const t = complexDiv(numRe, numIm, denRe, denIm);
    return { numRe, numIm, denRe, denIm, tRe: t.re, tIm: t.im };
  };

  const F1 = mk(1, 0, realDen, imagDen);
  const F2 = mk(1, 0, realDen, imagDen); // classical resonator — equivalent
  const F3 = mk(0, ratio / Math.max(qValue, 1e-6), realDen, imagDen); // damped oscillator impedance (bandpass)
  const F4 = mk(1, 0, realDen, imagDen); // pressure modal Green's fn — equivalent (unit convention only)
  const F5 = mk(ratio, 0, realDen, imagDen); // Allen & Berkley radiation-weighted (real freq-proportional)
  const F6 = mk(1, 0, realDen, imagDen); // Kuttruff δ-damping form — equivalent
  const F7 = mk(ratio * ratio, 0, realDen, imagDen); // frequency-dependent numerator (∝ ratio²)
  const F8 = mk(0, ratio, realDen, imagDen); // radiation/velocity numerator (∝ jω/ω0)
  const F9 = (() => { // energy-normalised: scale H1 magnitude by 1/sqrt(Q/4), keep phase
    const scale = 1 / Math.sqrt(Math.max(qValue, 1e-6) / 4);
    return { numRe: 1, numIm: 0, denRe: realDen, denIm: imagDen, tRe: H1.re * scale, tIm: H1.im * scale };
  })();
  const F10 = mk(1, 0, realDen, imagDen + OVERLAP_LOSS); // modal overlap complex coupling
  const F11 = mk(1, 0, realDen, imagDen); // placeholder — phase replaced in a second pass (needs full sweep)
  const F12 = mk(1, 0, realDen, imagDen + BROAD_LOSS); // broad loss-term denominator

  return { F1, F2, F3, F4, F5, F6, F7, F8, F9, F10, F11, F12 };
}

function runOneFrequency(frequencyHz, roomDims, seatPos, subsForSimulation, surfaceAbsorption) {
  const options = buildLiveEngineOptions(frequencyHz, surfaceAbsorption);
  let engineFinalRe = 0, engineFinalIm = 0;
  let trackedRe = 0, trackedIm = 0, trackedQ = null, trackedModeFreq = TRACKED_NATIVE_FREQ;
  let gainMagnitudeSum = 0;

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
      trackedQ = tracked.qValue;
      trackedModeFreq = tracked.modeFrequencyHz;
      const tfMag = mag(tracked.transferReal, tracked.transferImag);
      if (tfMag > 1e-12) gainMagnitudeSum += mag(tracked.activeReal, tracked.activeImag) / tfMag;
    }
  });

  return { frequencyHz, engineFinalRe, engineFinalIm, trackedRe, trackedIm, trackedQ, trackedModeFreq, gainMagnitude: gainMagnitudeSum };
}

export function buildForensicsSweep(freqStart, freqEnd, step, roomDims, seatPos, subsForSimulation, surfaceAbsorption) {
  const raw = [];
  for (let f = freqStart; f <= freqEnd + 1e-9; f += step) {
    raw.push(runOneFrequency(f, roomDims, seatPos, subsForSimulation, surfaceAbsorption));
  }

  const rows = raw.map((r) => {
    const f0 = r.trackedModeFreq || TRACKED_NATIVE_FREQ;
    const q = r.trackedQ ?? 4.0;
    const forms = computeFormulations(r.frequencyHz, f0, q);

    const aPhaseRad = Math.atan2(forms.F1.tIm, forms.F1.tRe);
    const trackedPhaseRad = Math.atan2(r.trackedIm, r.trackedRe);
    const extraRotationRad = trackedPhaseRad - aPhaseRad;
    const cosR = Math.cos(extraRotationRad), sinR = Math.sin(extraRotationRad);

    const formData = {};
    FORMULATION_DEFS.forEach(({ key }) => {
      const f = forms[key];
      const rotRe = (f.tRe * cosR) - (f.tIm * sinR);
      const rotIm = (f.tRe * sinR) + (f.tIm * cosR);
      const predictedContribRe = r.gainMagnitude * rotRe;
      const predictedContribIm = r.gainMagnitude * rotIm;
      const predictedFinalRe = r.engineFinalRe - r.trackedRe + predictedContribRe;
      const predictedFinalIm = r.engineFinalIm - r.trackedIm + predictedContribIm;
      const predictedFinalMag = mag(predictedFinalRe, predictedFinalIm);

      formData[key] = {
        numeratorRe: f.numRe, numeratorIm: f.numIm,
        numeratorMagnitude: mag(f.numRe, f.numIm), numeratorPhase: phaseDeg(f.numRe, f.numIm),
        denominatorRe: f.denRe, denominatorIm: f.denIm,
        denominatorMagnitude: mag(f.denRe, f.denIm), denominatorPhase: phaseDeg(f.denRe, f.denIm),
        transferRe: f.tRe, transferIm: f.tIm,
        transferMagnitude: mag(f.tRe, f.tIm), transferPhase: phaseDeg(f.tRe, f.tIm),
        predictedFinalSplDb: 20 * Math.log10(Math.max(predictedFinalMag, 1e-10)),
        _rotCos: cosR, _rotSin: sinR, _gainMagnitude: r.gainMagnitude,
      };
    });

    return { frequencyHz: r.frequencyHz, f0, q, engineFinalMag: mag(r.engineFinalRe, r.engineFinalIm), engineFinalRe: r.engineFinalRe, engineFinalIm: r.engineFinalIm, trackedRe: r.trackedRe, trackedIm: r.trackedIm, gainMagnitude: r.gainMagnitude, forms: formData };
  });

  // ── F11: minimum-phase reconstruction (needs the full swept |H1| curve) ──
  // Discrete numerical approximation of the Bode/Kramers–Kronig magnitude→phase relation:
  //   phase(f_i) ≈ (2*f_i/π) * Σ_j≠i [ ln|H(f_j)| − ln|H(f_i)| ] / (f_j² − f_i²) * Δf_j
  // Diagnostic-only approximation on the discrete sweep grid — not an exact transform.
  const lnMagArr = rows.map((r) => Math.log(Math.max(r.forms.F1.transferMagnitude, 1e-12)));
  rows.forEach((r, i) => {
    let sum = 0;
    rows.forEach((r2, j) => {
      if (j === i) return;
      const df = j < rows.length - 1 ? rows[j + 1].frequencyHz - rows[j].frequencyHz : rows[j].frequencyHz - rows[j - 1].frequencyHz;
      const denom = (rows[j].frequencyHz * rows[j].frequencyHz) - (r.frequencyHz * r.frequencyHz);
      if (Math.abs(denom) < 1e-6) return;
      sum += (lnMagArr[j] - lnMagArr[i]) / denom * df;
    });
    const reconstructedPhaseRad = (2 * r.frequencyHz / Math.PI) * sum;
    const mag11 = r.forms.F1.transferMagnitude;
    const tRe = mag11 * Math.cos(reconstructedPhaseRad);
    const tIm = mag11 * Math.sin(reconstructedPhaseRad);
    const rotRe = (tRe * r.forms.F11._rotCos) - (tIm * r.forms.F11._rotSin);
    const rotIm = (tRe * r.forms.F11._rotSin) + (tIm * r.forms.F11._rotCos);
    const predictedContribRe = r.forms.F11._gainMagnitude * rotRe;
    const predictedContribIm = r.forms.F11._gainMagnitude * rotIm;
    const predictedFinalRe = r.engineFinalRe - r.trackedRe + predictedContribRe;
    const predictedFinalIm = r.engineFinalIm - r.trackedIm + predictedContribIm;
    r.forms.F11 = {
      ...r.forms.F11,
      transferRe: tRe, transferIm: tIm, transferMagnitude: mag11, transferPhase: (reconstructedPhaseRad * 180) / Math.PI,
      predictedFinalSplDb: 20 * Math.log10(Math.max(mag(predictedFinalRe, predictedFinalIm), 1e-10)),
    };
  });

  // Phase velocity + magnitude derivative (finite differences), per formulation
  FORMULATION_DEFS.forEach(({ key }) => {
    for (let i = 0; i < rows.length; i++) {
      const prev = rows[i - 1], next = rows[i + 1];
      const cur = rows[i].forms[key];
      let phaseVelocity = null, magDeriv = null;
      const calc = (a, b, df) => {
        let dPhase = b.transferPhase - a.transferPhase;
        while (dPhase > 180) dPhase -= 360;
        while (dPhase < -180) dPhase += 360;
        return { pv: dPhase / df, md: (b.transferMagnitude - a.transferMagnitude) / df };
      };
      if (prev && next) {
        const { pv, md } = calc(prev.forms[key], next.forms[key], next.frequencyHz - prev.frequencyHz);
        phaseVelocity = pv; magDeriv = md;
      } else if (next) {
        const { pv, md } = calc(cur, next.forms[key], next.frequencyHz - rows[i].frequencyHz);
        phaseVelocity = pv; magDeriv = md;
      } else if (prev) {
        const { pv, md } = calc(prev.forms[key], cur, rows[i].frequencyHz - prev.frequencyHz);
        phaseVelocity = pv; magDeriv = md;
      }
      cur.phaseVelocityDegPerHz = phaseVelocity;
      cur.magnitudeDerivativePerHz = magDeriv;
    }
  });

  // Effective bandwidth/Q per formulation
  const bandwidthResults = {};
  FORMULATION_DEFS.forEach(({ key }) => {
    const mags = rows.map((r) => r.forms[key].transferMagnitude);
    let peakIdx = 0;
    mags.forEach((m, i) => { if (m > mags[peakIdx]) peakIdx = i; });
    const peakDb = 20 * Math.log10(Math.max(mags[peakIdx], 1e-12));
    const findCrossing = (thresholdDb) => {
      let lowIdx = peakIdx, highIdx = peakIdx;
      while (lowIdx > 0 && (20 * Math.log10(Math.max(mags[lowIdx], 1e-12))) > peakDb - thresholdDb) lowIdx--;
      while (highIdx < mags.length - 1 && (20 * Math.log10(Math.max(mags[highIdx], 1e-12))) > peakDb - thresholdDb) highIdx++;
      return rows[highIdx].frequencyHz - rows[lowIdx].frequencyHz;
    };
    const bw3 = findCrossing(3), bw6 = findCrossing(6);
    const effectiveQ = bw3 > 0 ? rows[0].f0 / bw3 : null;
    bandwidthResults[key] = { bw3dBHz: bw3, bw6dBHz: bw6, effectiveQ };
    rows.forEach((r) => { r.forms[key].effectiveBandwidth3dBHz = bw3; r.forms[key].effectiveBandwidth6dBHz = bw6; r.forms[key].effectiveQ = effectiveQ; });
  });

  return { rows, bandwidthResults };
}

function findRowNear(rows, targetHz) {
  return rows.reduce((best, r) => (Math.abs(r.frequencyHz - targetHz) < Math.abs(best.frequencyHz - targetHz) ? r : best), rows[0]);
}

export function validateProductionParity(rows) {
  return rows.every((r) => Math.abs(r.forms.F1.predictedFinalSplDb - (20 * Math.log10(Math.max(r.engineFinalMag, 1e-10)))) < 1e-6);
}

function shapeMetrics(rows, key) {
  const series = rows.map((r) => ({ hz: r.frequencyHz, db: r.forms[key].predictedFinalSplDb }));
  const trough = series.reduce((best, s) => (s.db < best.db ? s : best), series[0]);
  const at = (hz) => series.reduce((b, s) => (Math.abs(s.hz - hz) < Math.abs(b.hz - hz) ? s : b), series[0]).db;
  return {
    nullCentreHz: trough.hz, nullDepthDb: trough.db,
    slope3040: (at(40) - at(30)) / 10, slope3050: (at(50) - at(30)) / 20,
    peak57: at(57), peak58: at(58),
  };
}

export function rankFormulations(rows) {
  const checkFreqs = [30, 35, 40, 45, 50, 57, 58];
  const baseline = {};
  checkFreqs.forEach((hz) => { baseline[hz] = findRowNear(rows, hz).forms.F1.predictedFinalSplDb; });
  const baselineShape = shapeMetrics(rows, 'F1');

  const results = FORMULATION_DEFS.map(({ key, label, note }) => {
    const deltas = {};
    checkFreqs.forEach((hz) => { deltas[hz] = findRowNear(rows, hz).forms[key].predictedFinalSplDb - baseline[hz]; });
    const shape = shapeMetrics(rows, key);
    const reduction3540 = -((deltas[35] + deltas[40]) / 2);
    const constraint30 = Math.abs(deltas[30]) <= 1.0;
    const constraint3540 = reduction3540 >= 2.0;
    const constraint50 = Math.abs(deltas[50]) <= 2.0;
    const constraint57 = Math.abs(deltas[57]) <= 2.0;
    const constraint58 = Math.abs(deltas[58]) <= 2.0;
    const noNewNotch = shape.nullDepthDb >= baselineShape.nullDepthDb - 3;
    const pass = constraint30 && constraint3540 && constraint50 && constraint57 && constraint58 && noNewNotch;
    return { key, label, note, deltas, shape, reduction3540, pass, constraints: { constraint30, constraint3540, constraint50, constraint57, constraint58, noNewNotch } };
  });

  const eligible = results.filter((r) => r.key !== 'F1' && r.pass);
  eligible.sort((a, b) => b.reduction3540 - a.reduction3540);
  const best = eligible[0] || null;

  return { results, best, checkFreqs };
}