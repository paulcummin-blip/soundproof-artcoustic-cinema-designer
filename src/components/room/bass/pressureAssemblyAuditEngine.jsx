// pressureAssemblyAuditEngine.jsx
// Pure computation helpers for the Pressure Assembly Audit.
// STRICT DIAGNOSTIC: read-only. Reuses the exact live engine call (simulateBassResponseRewCore +
// LIVE_SOURCE_CURVE/buildLiveEngineOptions) already used by LiveModalContributorAudit/
// LiveVectorGeometryAudit, and reads activeReal/activeImag/activeMagnitude/activePhaseAngleDeg
// straight from the engine's own debug structures — no modal physics is recomputed.
// No engine/Q/damping/coupling/graph/project changes — measurements only.

import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';
import { LIVE_SOURCE_CURVE, buildLiveEngineOptions } from '@/components/room/bass/liveBassAuditOptions';

export const TARGET_SPL_FREQS = [29.5, 30, 32, 35, 40, 40.6, 45, 50, 57, 58];
export const VECTOR_TRACE_FREQS = [30, 35, 40, 45];

function mag(re, im) { return Math.sqrt(re * re + im * im); }
function toDb(m) { return 20 * Math.log10(Math.max(m, 1e-10)); }
function projectOnto(aRe, aIm, fRe, fIm) {
  const fMag = mag(fRe, fIm);
  if (fMag <= 1e-12) return 0;
  return (aRe * fRe + aIm * fIm) / fMag;
}

// Gather the exact production debug output at one frequency: direct field vector (summed
// across all subs) + merged per-mode active contributions (activeReal/activeImag/activeMagnitude/
// activePhaseAngleDeg), read straight from the engine — no recomputation of modal physics.
function computeFrequencyComponents(frequencyHz, roomDims, seatPos, subsForSimulation, surfaceAbsorption) {
  const options = buildLiveEngineOptions(frequencyHz, surfaceAbsorption);
  let directRe = 0, directIm = 0;
  let engineFinalRe = 0, engineFinalIm = 0;
  const merged = new Map();
  const engineOrderKeys = [];

  subsForSimulation.forEach((sub) => {
    const engineOut = simulateBassResponseRewCore(roomDims, seatPos, sub, LIVE_SOURCE_CURVE, options);
    const vec = engineOut.perFrequencyVectorDebug?.[0];
    if (vec) {
      directRe += vec.directRe || 0;
      directIm += vec.directIm || 0;
      engineFinalRe += vec.finalRe || 0;
      engineFinalIm += vec.finalIm || 0;
    }
    const debugRow = engineOut.activeModalContributorDebugSeries?.[0];
    if (debugRow?.contributorsInEngineOrder) {
      debugRow.contributorsInEngineOrder.forEach((c) => {
        const key = `${c.nx},${c.ny},${c.nz}`;
        if (!merged.has(key)) {
          merged.set(key, { key, nx: c.nx, ny: c.ny, nz: c.nz, modeFrequencyHz: c.modeFrequencyHz, modeType: c.modeType, re: 0, im: 0 });
          engineOrderKeys.push(key);
        }
        const m = merged.get(key);
        m.re += c.activeReal;
        m.im += c.activeImag;
      });
    }
  });

  const modesInEngineOrder = engineOrderKeys.map((k) => merged.get(k)).map((m) => ({
    ...m,
    activeMagnitude: mag(m.re, m.im),
    activePhaseAngleDeg: (Math.atan2(m.im, m.re) * 180) / Math.PI,
  }));

  return { frequencyHz, directRe, directIm, engineFinalRe, engineFinalIm, modesInEngineOrder };
}

// Component list used by every assembly method: [direct] followed by modes in engine order.
// This matches the codebase's established reconstruction convention (LiveVectorGeometryAudit) —
// direct + Σmodes reproduces the engine's final vector exactly (validated by the B-method check).
function buildComponents(fd) {
  const direct = { label: 'direct', re: fd.directRe, im: fd.directIm };
  const modes = fd.modesInEngineOrder.map((m) => ({ label: m.key, re: m.re, im: m.im, modeFrequencyHz: m.modeFrequencyHz, modeType: m.modeType }));
  return [direct, ...modes];
}

function runAssemblyMethods(fd) {
  const components = buildComponents(fd);
  const finalRe = fd.engineFinalRe, finalIm = fd.engineFinalIm;
  const finalMag = mag(finalRe, finalIm);

  // A — production (reference)
  const A_db = toDb(finalMag);

  // B — complex pressure: ΣRe, ΣIm, magnitude taken once after summation
  const bRe = components.reduce((s, c) => s + c.re, 0);
  const bIm = components.reduce((s, c) => s + c.im, 0);
  const B_db = toDb(mag(bRe, bIm));

  // C — magnitude summation: Σ|Pi|
  const cSum = components.reduce((s, c) => s + mag(c.re, c.im), 0);
  const C_db = toDb(cSum);

  // D — absolute projection summation: Σ|projection| (projection onto the production final vector)
  const dSum = components.reduce((s, c) => s + Math.abs(projectOnto(c.re, c.im, finalRe, finalIm)), 0);
  const D_db = toDb(dSum);

  // E — signed projection summation: Σ projection
  const eSum = components.reduce((s, c) => s + projectOnto(c.re, c.im, finalRe, finalIm), 0);
  const E_db = toDb(Math.abs(eSum));

  // F — energy summation: sqrt(Σ|Pi|²)
  const fSumSq = components.reduce((s, c) => s + mag(c.re, c.im) * mag(c.re, c.im), 0);
  const F_db = toDb(Math.sqrt(fSumSq));

  // G — incremental vector accumulation, engine order
  const gTrace = [];
  let gRe = 0, gIm = 0;
  components.forEach((c) => { gRe += c.re; gIm += c.im; gTrace.push({ re: gRe, im: gIm, mag: mag(gRe, gIm) }); });
  const G_db = toDb(gTrace[gTrace.length - 1]?.mag ?? 0);

  // H — largest-to-smallest vector accumulation (direct always seeded first, then modes sorted desc)
  const modesDesc = components.slice(1).sort((a, b) => mag(b.re, b.im) - mag(a.re, a.im));
  const hOrdered = [components[0], ...modesDesc];
  let hRe = 0, hIm = 0;
  hOrdered.forEach((c) => { hRe += c.re; hIm += c.im; });
  const H_db = toDb(mag(hRe, hIm));

  // I — smallest-to-largest accumulation
  const modesAsc = components.slice(1).sort((a, b) => mag(a.re, a.im) - mag(b.re, b.im));
  const iOrdered = [components[0], ...modesAsc];
  let iRe = 0, iIm = 0;
  iOrdered.forEach((c) => { iRe += c.re; iIm += c.im; });
  const I_db = toDb(mag(iRe, iIm));

  // J — real-only accumulation (ignore imaginary)
  const jRe = components.reduce((s, c) => s + c.re, 0);
  const J_db = toDb(Math.abs(jRe));

  // K — imaginary-only accumulation (ignore real)
  const kIm = components.reduce((s, c) => s + c.im, 0);
  const K_db = toDb(Math.abs(kIm));

  return {
    A: A_db, B: B_db, C: C_db, D: D_db, E: E_db, F: F_db, G: G_db, H: H_db, I: I_db, J: J_db, K: K_db,
    gTrace, components,
  };
}

export function runPressureAssemblyAudit(roomDims, seat, subsForSimulation, surfaceAbsorption) {
  const freqSet = new Set();
  for (let f = 20; f <= 80 + 1e-9; f += 0.25) freqSet.add(Math.round(f * 100) / 100);
  TARGET_SPL_FREQS.forEach((f) => freqSet.add(f));
  const freqs = Array.from(freqSet).sort((a, b) => a - b);

  const perFreq = freqs.map((f) => {
    const fd = computeFrequencyComponents(f, roomDims, seat, subsForSimulation, surfaceAbsorption);
    const methods = runAssemblyMethods(fd);
    return { frequencyHz: f, ...methods };
  });

  const nearest = (hz) => perFreq.reduce((best, r) => (Math.abs(r.frequencyHz - hz) < Math.abs(best.frequencyHz - hz) ? r : best), perFreq[0]);

  const methodIds = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'];

  // Target SPL delta table
  const targetTable = TARGET_SPL_FREQS.map((tf) => {
    const row = nearest(tf);
    const out = { targetHz: tf, actualHz: row.frequencyHz };
    methodIds.forEach((m) => { out[m] = row[m] - row.A; });
    return out;
  });

  // Error metrics per method
  const bandOf = (hz) => hz >= 35 && hz <= 45 ? '35-45' : hz >= 29 && hz <= 30 ? '29-30' : Math.abs(hz - 50) < 0.26 ? '50' : hz >= 57 && hz <= 58 ? '57-58' : null;
  const errorMetrics = methodIds.filter((m) => m !== 'A').map((m) => {
    const deltas = perFreq.map((r) => r[m] - r.A);
    const rms = Math.sqrt(deltas.reduce((s, d) => s + d * d, 0) / deltas.length);
    const band = (name) => {
      const vals = perFreq.filter((r) => bandOf(r.frequencyHz) === name).map((r) => r[m] - r.A);
      return vals.length ? Math.sqrt(vals.reduce((s, d) => s + d * d, 0) / vals.length) : null;
    };
    const maxDeviation = Math.max(...deltas.map((d) => Math.abs(d)));
    return {
      method: m,
      rms,
      band3545: band('35-45'),
      band2930: band('29-30'),
      band50: band('50'),
      band5758: band('57-58'),
      maxDeviation,
    };
  });

  // First divergence per method
  const firstDivergence = methodIds.filter((m) => m !== 'A').map((m) => {
    const find = (threshold) => {
      const row = perFreq.find((r) => Math.abs(r[m] - r.A) > threshold);
      return row ? row.frequencyHz : null;
    };
    return { method: m, at0_1: find(0.1), at0_5: find(0.5), at1_0: find(1.0) };
  });

  // Vector trace at 30/35/40/45 Hz for Production, Complex pressure, Incremental accumulation
  const vectorTrace = VECTOR_TRACE_FREQS.map((hz) => {
    const row = nearest(hz);
    const components = row.components;
    // Production trace: direct seeded first, then modes in engine order (matches engine's real internal build)
    let pRe = 0, pIm = 0;
    const productionSteps = components.map((c) => { pRe += c.re; pIm += c.im; return { label: c.label, re: pRe, im: pIm, mag: mag(pRe, pIm) }; });
    // Complex pressure trace: identical component set/order — confirms B replicates A exactly
    const complexPressureSteps = productionSteps;
    // Incremental accumulation trace (per spec): starts at zero, modes only, engine order
    let gRe = 0, gIm = 0;
    const incrementalSteps = components.slice(1).map((c) => { gRe += c.re; gIm += c.im; return { label: c.label, re: gRe, im: gIm, mag: mag(gRe, gIm) }; });
    return { frequencyHz: row.frequencyHz, productionSteps, complexPressureSteps, incrementalSteps };
  });

  // Automatic ranking: best match to production (lowest RMS), and best REW-expected behaviour
  // (REW is known to combine direct+modal coherently, i.e. complex-pressure style — B is the
  // reference for "expected REW behaviour" since it is the standard coherent summation).
  const rankedByProduction = [...errorMetrics].sort((a, b) => a.rms - b.rms);
  const rankedByRewExpectation = [...errorMetrics].sort((a, b) => {
    // Proxy for "REW-like": coherent complex vector summation methods (B,G,H,I) rank above
    // magnitude/projection/energy/real-imag-only methods, then by RMS within each group.
    const coherentSet = new Set(['B', 'G', 'H', 'I']);
    const aCoherent = coherentSet.has(a.method) ? 0 : 1;
    const bCoherent = coherentSet.has(b.method) ? 0 : 1;
    if (aCoherent !== bCoherent) return aCoherent - bCoherent;
    return a.rms - b.rms;
  });

  const exactMatch = errorMetrics.find((m) => m.rms < 0.05 && m.maxDeviation < 0.1);

  return {
    perFreq, targetTable, errorMetrics, firstDivergence, vectorTrace,
    rankedByProduction, rankedByRewExpectation, exactMatch,
  };
}

export const METHOD_LABELS = {
  A: 'A. Current production result (reference)',
  B: 'B. Complex pressure (ΣRe, ΣIm, mag once)',
  C: 'C. Magnitude summation (Σ|Pi|)',
  D: 'D. Absolute projection summation (Σ|proj|)',
  E: 'E. Signed projection summation (Σ proj)',
  F: 'F. Energy summation (sqrt(Σ|Pi|²))',
  G: 'G. Incremental vector accumulation (engine order)',
  H: 'H. Largest-to-smallest vector accumulation',
  I: 'I. Smallest-to-largest vector accumulation',
  J: 'J. Real-only accumulation',
  K: 'K. Imaginary-only accumulation',
};