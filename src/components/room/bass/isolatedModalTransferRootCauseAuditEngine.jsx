// isolatedModalTransferRootCauseAuditEngine.jsx
// Pure computation helpers for the Isolated Modal Transfer Root Cause Audit.
// STRICT DIAGNOSTIC: read-only. Reuses canonical primitives from modalCalculations.js
// (computeRoomModesLocal-equivalent frequency formula, estimateModeQLocal, modeShapeValueLocal,
// resonantTransfer) — no production Q/coupling/summation/scaling changes, no project changes.
// This engine reimplements a simplified, self-contained pressure-summation model purely to
// A/B test transfer-function *shape* against the production transfer in isolation.

import { estimateModeQLocal, modeShapeValueLocal, resonantTransfer } from '@/bass/core/modalCalculations';

const SPEED_OF_SOUND_MPS = 343;
const PROPAGATION_PHASE_SCALE = 0.5;

export const TRACKED_MODES = [
  { nx: 0, ny: 1, nz: 0 },
  { nx: 0, ny: 2, nz: 0 },
  { nx: 0, ny: 3, nz: 0 },
  { nx: 0, ny: 4, nz: 0 },
  { nx: 2, ny: 0, nz: 0 },
  { nx: 2, ny: 2, nz: 0 },
];

export const TARGET_SPL_FREQS = [29.5, 30, 32, 35, 40, 40.6, 45, 50, 57, 58];
export const OFFSETS = [10, 20, 30];

export const FORMULA_LABELS = {
  A_b44: 'A. Current B44 transfer',
  B_displacement: 'B. Standard 2nd-order displacement',
  C_velocity: 'C. Standard velocity response',
  D_acceleration: 'D. Standard acceleration response',
  E_lorentzian: 'E. Symmetric Lorentzian',
  F_rew_narrow: 'F. REW-like narrow lower skirt',
};
export const FORMULA_KEYS = Object.keys(FORMULA_LABELS);

function keyOf(nx, ny, nz) { return `${nx},${ny},${nz}`; }

function familyOf(nx, ny, nz) {
  const active = [nx > 0, ny > 0, nz > 0].filter(Boolean).length;
  return active === 1 ? 'axial' : active === 2 ? 'tangential' : 'oblique';
}

function modeNativeFreq(nx, ny, nz, roomDims, c = SPEED_OF_SOUND_MPS) {
  const widthM = Number(roomDims?.widthM) || 1;
  const lengthM = Number(roomDims?.lengthM) || 1;
  const heightM = Number(roomDims?.heightM) || 1;
  return (c / 2) * Math.sqrt(
    Math.pow(nx / widthM, 2) + Math.pow(ny / lengthM, 2) + Math.pow(nz / heightM, 2)
  );
}

export function buildModes(roomDims, surfaceAbsorption, axialQ = 4.0) {
  return TRACKED_MODES.map(({ nx, ny, nz }) => {
    const freq = modeNativeFreq(nx, ny, nz, roomDims);
    const type = familyOf(nx, ny, nz);
    const absorptionQ = estimateModeQLocal({ roomDims, surfaceAbsorption, f0: freq, mode: { nx, ny, nz } });
    const baseQ = type === 'axial' ? axialQ : type === 'tangential' ? 3.9 : 2.5;
    const qValue = Math.max(1, Math.min(baseQ, absorptionQ));
    return { nx, ny, nz, key: keyOf(nx, ny, nz), family: type, modeFrequencyHz: freq, qValue };
  });
}

function interpCurveDb(curve, hz) {
  if (!Array.isArray(curve) || curve.length === 0) return 90;
  const pts = curve
    .map((p) => ({ hz: Number(p?.hz ?? p?.frequency ?? p?.[0]), db: Number(p?.db ?? p?.spl ?? p?.[1]) }))
    .filter((p) => Number.isFinite(p.hz) && Number.isFinite(p.db))
    .sort((a, b) => a.hz - b.hz);
  if (pts.length === 0) return 90;
  if (hz <= pts[0].hz) return pts[0].db;
  if (hz >= pts[pts.length - 1].hz) return pts[pts.length - 1].db;
  for (let i = 0; i < pts.length - 1; i++) {
    if (hz >= pts[i].hz && hz <= pts[i + 1].hz) {
      const r = (hz - pts[i].hz) / (pts[i + 1].hz - pts[i].hz);
      return pts[i].db + (pts[i + 1].db - pts[i].db) * r;
    }
  }
  return pts[0].db;
}

// ── Closed-form transfer formulations (A–F) ──
// All share the same {re, im} pressure-domain convention as resonantTransfer() for direct comparability.
export function transferFor(formulaKey, f, f0, q) {
  const hd = resonantTransfer(f, f0, q); // A & B are numerically identical — B is the canonical named form of A.
  const r = f / Math.max(f0, 1e-6);

  switch (formulaKey) {
    case 'A_b44':
    case 'B_displacement':
      return { re: hd.re, im: hd.im, mag: hd.transferMag };
    case 'C_velocity': {
      // H_v = (j*r) * H_d
      const re = -r * hd.im;
      const im = r * hd.re;
      return { re, im, mag: Math.sqrt(re * re + im * im) };
    }
    case 'D_acceleration': {
      // H_a = (j*r)^2 * H_d = -r^2 * H_d
      const re = -r * r * hd.re;
      const im = -r * r * hd.im;
      return { re, im, mag: Math.sqrt(re * re + im * im) };
    }
    case 'E_lorentzian': {
      // Symmetric (in linear Hz) Lorentzian, scaled so peak magnitude matches H_d's peak (Q).
      const magL = q / Math.sqrt(1 + Math.pow(2 * q * (f - f0) / Math.max(f0, 1e-6), 2));
      const angle = Math.atan2(hd.im, hd.re);
      return { re: magL * Math.cos(angle), im: magL * Math.sin(angle), mag: magL };
    }
    case 'F_rew_narrow': {
      // Diagnostic-only ad-hoc steeper low-side rolloff. Constant k controls slope; k=0 => identical to A.
      const K = 3.0;
      const belowResonance = f < f0;
      const rollOff = belowResonance ? Math.exp(-K * ((f0 - f) / Math.max(f0, 1e-6))) : 1.0;
      return { re: hd.re * rollOff, im: hd.im * rollOff, mag: hd.transferMag * rollOff };
    }
    default:
      return { re: hd.re, im: hd.im, mag: hd.transferMag };
  }
}

function computeCoupling(mode, source, seat, roomDims) {
  const sc = modeShapeValueLocal(mode, source.x, source.y, source.z, roomDims);
  const rc = modeShapeValueLocal(mode, seat.x, seat.y, seat.z, roomDims);
  return sc * rc;
}

function directFieldAt(freqHz, curveDb, source, seat) {
  const dx = source.x - seat.x, dy = source.y - seat.y, dz = (source.z ?? 0.35) - (seat.z ?? 1.2);
  const distanceM = Math.max(0.01, Math.sqrt(dx * dx + dy * dy + dz * dz));
  const distanceLossDb = -20 * Math.log10(distanceM);
  const gainDb = source?.tuning?.gainDb ?? 0;
  const amplitude = Math.pow(10, (curveDb + distanceLossDb + gainDb) / 20);
  const delayMs = source?.tuning?.delayMs ?? 0;
  const polarity = source?.tuning?.polarity ?? 0;
  const totalPhase =
    (-2 * Math.PI * freqHz * (distanceM / SPEED_OF_SOUND_MPS)) +
    (-2 * Math.PI * freqHz * (delayMs / 1000)) +
    (polarity === 180 ? Math.PI : 0);
  return { re: amplitude * Math.cos(totalPhase), im: amplitude * Math.sin(totalPhase), distanceM };
}

function modalContribution(mode, formulaKey, freqHz, curveDb, source, seat, roomDims) {
  const coupling = computeCoupling(mode, source, seat, roomDims);
  const gainDb = source?.tuning?.gainDb ?? 0;
  const modalSourceAmplitude1m = Math.pow(10, (curveDb + gainDb) / 20);
  const gain = modalSourceAmplitude1m * coupling;
  const H = transferFor(formulaKey, freqHz, mode.modeFrequencyHz, mode.qValue);

  const dx = source.x - seat.x, dy = source.y - seat.y, dz = (source.z ?? 0.35) - (seat.z ?? 1.2);
  const distanceM = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const propagationPhase = -2 * Math.PI * freqHz * (distanceM / SPEED_OF_SOUND_MPS) * PROPAGATION_PHASE_SCALE;
  const delayMs = source?.tuning?.delayMs ?? 0;
  const polarity = source?.tuning?.polarity ?? 0;
  const tuningPhase = (-2 * Math.PI * freqHz * (delayMs / 1000)) + (polarity === 180 ? Math.PI : 0);
  const totalPhase = propagationPhase + tuningPhase;
  const cosP = Math.cos(totalPhase), sinP = Math.sin(totalPhase);

  const rotRe = (H.re * cosP) - (H.im * sinP);
  const rotIm = (H.re * sinP) + (H.im * cosP);
  return { re: gain * rotRe, im: gain * rotIm };
}

function toDb(re, im) { return 20 * Math.log10(Math.max(Math.sqrt(re * re + im * im), 1e-10)); }

// ── Test 1 & 2: raw production transfer + isolated single-mode responses ──
export function buildRawAndIsolated(modes, roomDims, seat, source, curve, freqStart, freqEnd, step) {
  const rows = [];
  for (let f = freqStart; f <= freqEnd + 1e-9; f += step) {
    const curveDb = interpCurveDb(curve, f);
    const direct = directFieldAt(f, curveDb, source, seat);
    let sumRe = direct.re, sumIm = direct.im;
    const perMode = {};
    modes.forEach((m) => {
      const c = modalContribution(m, 'A_b44', f, curveDb, source, seat, roomDims);
      perMode[m.key] = c;
      sumRe += c.re; sumIm += c.im;
    });
    const fullDb = toDb(sumRe, sumIm);
    const row = { frequencyHz: f, fullProductionDb: fullDb, isolated: {} };
    modes.forEach((m) => {
      const isoRe = direct.re + perMode[m.key].re;
      const isoIm = direct.im + perMode[m.key].im;
      const isoDb = toDb(isoRe, isoIm);
      row.isolated[m.key] = { db: isoDb, deltaVsFullDb: isoDb - fullDb };
    });
    rows.push(row);
  }
  return rows;
}

// ── Test 3: closed-form reference comparison ──
function findHalfPowerBandwidth(mode, formulaKey, fraction) {
  const peakMag = transferFor(formulaKey, mode.modeFrequencyHz, mode.modeFrequencyHz, mode.qValue).mag;
  let lowBw = null, highBw = null;
  for (let df = 0.1; df <= 100; df += 0.1) {
    const f = mode.modeFrequencyHz - df;
    if (f <= 0) break;
    if (transferFor(formulaKey, f, mode.modeFrequencyHz, mode.qValue).mag <= peakMag * fraction) { lowBw = df; break; }
  }
  for (let df = 0.1; df <= 100; df += 0.1) {
    const f = mode.modeFrequencyHz + df;
    if (transferFor(formulaKey, f, mode.modeFrequencyHz, mode.qValue).mag <= peakMag * fraction) { highBw = df; break; }
  }
  return { lowBw, highBw };
}

export function buildClosedFormMetrics(modes, source, seat, roomDims, curve) {
  return modes.map((mode) => {
    const curveDb = interpCurveDb(curve, mode.modeFrequencyHz);
    const perFormula = {};
    FORMULA_KEYS.forEach((fk) => {
      const bw3 = findHalfPowerBandwidth(mode, fk, 1 / Math.SQRT2);
      const bw6 = findHalfPowerBandwidth(mode, fk, 0.5);
      const peakMag = transferFor(fk, mode.modeFrequencyHz, mode.modeFrequencyHz, mode.qValue).mag;
      const norm = (f) => transferFor(fk, f, mode.modeFrequencyHz, mode.qValue).mag / Math.max(peakMag, 1e-10);
      const low = {}, high = {};
      OFFSETS.forEach((o) => {
        low[o] = mode.modeFrequencyHz - o > 0 ? norm(mode.modeFrequencyHz - o) : null;
        high[o] = norm(mode.modeFrequencyHz + o);
      });
      const asymmetryRatio = (bw3.lowBw && bw3.highBw) ? bw3.lowBw / bw3.highBw : null;
      const splAtTargets = {};
      TARGET_SPL_FREQS.forEach((tf) => {
        const c = modalContribution(mode, fk, tf, curveDb, source, seat, roomDims);
        splAtTargets[tf] = toDb(c.re, c.im);
      });
      perFormula[fk] = {
        peakFreqHz: mode.modeFrequencyHz,
        bw3LowHz: bw3.lowBw, bw3HighHz: bw3.highBw, bw3TotalHz: (bw3.lowBw ?? 0) + (bw3.highBw ?? 0),
        bw6LowHz: bw6.lowBw, bw6HighHz: bw6.highBw, bw6TotalHz: (bw6.lowBw ?? 0) + (bw6.highBw ?? 0),
        low, high, asymmetryRatio, splAtTargets,
      };
    });
    return { key: mode.key, family: mode.family, modeFrequencyHz: mode.modeFrequencyHz, qValue: mode.qValue, perFormula };
  });
}

// ── Test 4: normalised collapse test ──
export function buildCollapseSeries(modes, freqStart, freqEnd, step) {
  const rows = [];
  for (let f = freqStart; f <= freqEnd + 1e-9; f += step) {
    const point = { frequencyHz: f };
    modes.forEach((m) => {
      const peakMag = transferFor('A_b44', m.modeFrequencyHz, m.modeFrequencyHz, m.qValue).mag;
      const mag = transferFor('A_b44', f, m.modeFrequencyHz, m.qValue).mag / Math.max(peakMag, 1e-10);
      const deltaF = f - m.modeFrequencyHz;
      const bwHz = m.modeFrequencyHz / Math.max(m.qValue, 1e-6);
      point[`${m.key}__abs`] = mag;
      point[`${m.key}__deltaF`] = deltaF;
      point[`${m.key}__fractional`] = deltaF / m.modeFrequencyHz;
      point[`${m.key}__bwNorm`] = deltaF / bwHz;
      point[`${m.key}__mag`] = mag;
    });
    rows.push(point);
  }
  return rows;
}

// ── Test 5: tail excess score ──
export function buildTailExcessScores(closedFormMetrics) {
  const m010 = closedFormMetrics.find((m) => m.key === '0,1,0');
  return closedFormMetrics.map((m) => {
    const lowA = m.perFormula.A_b44.low;
    const lowB = m010 ? m010.perFormula.A_b44.low : null;
    const lowE = m.perFormula.E_lorentzian.low;
    const excessVs010 = lowB ? OFFSETS.map((o) => (lowA[o] ?? 0) - (lowB[o] ?? 0)) : [null, null, null];
    const excessVsSecondOrder = OFFSETS.map((o) => (lowA[o] ?? 0) - (m.perFormula.B_displacement.low[o] ?? 0));
    const excessVsLorentzian = OFFSETS.map((o) => (lowA[o] ?? 0) - (lowE[o] ?? 0));
    // 30–50 Hz excess: average normalised magnitude of A within band minus (0,1,0)'s at same absolute freq offsets
    const bandExcess = m.key !== '0,1,0' && m010
      ? OFFSETS.map((o) => (lowA[o] ?? 0) - (lowB[o] ?? 0)).filter((v) => Number.isFinite(v))
      : [];
    const bandExcessAvg = bandExcess.length ? bandExcess.reduce((a, b) => a + b, 0) / bandExcess.length : null;
    return {
      key: m.key, family: m.family,
      excessVs010Max: excessVs010.every((v) => v === null) ? null : Math.max(...excessVs010.filter((v) => v !== null)),
      excessVsSecondOrderMax: Math.max(...excessVsSecondOrder),
      excessVsLorentzianMax: Math.max(...excessVsLorentzian),
      bandExcess30to50: bandExcessAvg,
    };
  });
}

// ── Test 6 & 7: substitution tests ──
function fieldWithSubstitution(freqHz, modes, curveDb, source, seat, roomDims, substitutedKeys, substituteFormula) {
  const direct = directFieldAt(freqHz, curveDb, source, seat);
  let re = direct.re, im = direct.im;
  modes.forEach((m) => {
    const formulaKey = substitutedKeys.has(m.key) ? substituteFormula : 'A_b44';
    const c = modalContribution(m, formulaKey, freqHz, curveDb, source, seat, roomDims);
    re += c.re; im += c.im;
  });
  return toDb(re, im);
}

export function buildSubstitutionScopes(modes) {
  const lengthAxial = modes.filter((m) => m.ny > 0 && m.nx === 0 && m.nz === 0).map((m) => m.key);
  const axialAboveFirst = modes.filter((m) => m.family === 'axial' && (m.nx + m.ny + m.nz) >= 2).map((m) => m.key);
  const above50Hz = modes.filter((m) => m.modeFrequencyHz > 50).map((m) => m.key);
  return [
    { scope: 'only (0,2,0)', keys: ['0,2,0'] },
    { scope: 'all length axial (0,n,0)', keys: lengthAxial },
    { scope: 'all axial modes above first order', keys: axialAboveFirst },
    { scope: 'all modes above 50 Hz', keys: above50Hz },
  ];
}

function checkPassConditions(deltasAtTargets) {
  const d35 = deltasAtTargets[35] ?? deltasAtTargets[40] ?? 0;
  const d40 = deltasAtTargets[40] ?? 0;
  const d45 = deltasAtTargets[45] ?? 0;
  const recoveryReduction = Math.max(Math.abs(d35), Math.abs(d40), Math.abs(d45));
  const d295 = deltasAtTargets[29.5] ?? 0;
  const d30 = deltasAtTargets[30] ?? 0;
  const d57 = deltasAtTargets[57] ?? 0;
  const d58 = deltasAtTargets[58] ?? 0;
  const d50 = deltasAtTargets[50] ?? 0;
  const preservesLowEnd = Math.abs(d295) <= 1.5 && Math.abs(d30) <= 1.5;
  const preservesHighEnd = Math.abs(d57) <= 2 && Math.abs(d58) <= 2;
  const noNewNotchAt50 = Math.abs(d50) <= 3; // heuristic guard against an artificial new notch
  const reducesRecoveryBy2dB = recoveryReduction >= 2;
  return {
    pass: reducesRecoveryBy2dB && preservesLowEnd && preservesHighEnd && noNewNotchAt50,
    reducesRecoveryBy2dB, preservesLowEnd, preservesHighEnd, noNewNotchAt50, recoveryReduction,
  };
}

export function runSubstitutionTest(scopeKeys, modes, roomDims, seat, source, curve) {
  const substitutedKeys = new Set(scopeKeys);
  const results = {};
  FORMULA_KEYS.filter((k) => k !== 'A_b44').forEach((formulaKey) => {
    const deltas = {};
    TARGET_SPL_FREQS.forEach((tf) => {
      const curveDb = interpCurveDb(curve, tf);
      const baselineDb = fieldWithSubstitution(tf, modes, curveDb, source, seat, roomDims, new Set(), 'A_b44');
      const substitutedDb = fieldWithSubstitution(tf, modes, curveDb, source, seat, roomDims, substitutedKeys, formulaKey);
      deltas[tf] = substitutedDb - baselineDb;
    });
    results[formulaKey] = { deltas, ...checkPassConditions(deltas) };
  });
  return results;
}

// ── Test 8: automatic conclusion ──
export function buildConclusion(rawAndIsolatedRows, closedFormMetrics, collapseSeries, tailExcessScores, multiModeSubResults) {
  // Does isolating a single mode (no other-mode summation) still show a comparable recovery bump?
  // If isolated single-mode delta near 40 Hz is small, summation/scaling is implicated over the transfer eq itself.
  const midRow = rawAndIsolatedRows.reduce((best, row) => {
    if (!best) return row;
    return Math.abs(row.frequencyHz - 40) < Math.abs(best.frequencyHz - 40) ? row : best;
  }, null);
  const isolated020Delta = midRow ? Math.abs(midRow.isolated['0,2,0']?.deltaVsFullDb ?? 0) : 0;

  // Collapse check across bandwidth-normalised offset — sample a few points, compare spread.
  let maxSpread = 0;
  const sampleIdxs = [Math.floor(collapseSeries.length * 0.3), Math.floor(collapseSeries.length * 0.5), Math.floor(collapseSeries.length * 0.7)];
  sampleIdxs.forEach((idx) => {
    const point = collapseSeries[idx];
    if (!point) return;
    const vals = TRACKED_MODES.map((m) => point[`${m.nx},${m.ny},${m.nz}__mag`]).filter((v) => Number.isFinite(v));
    if (vals.length < 2) return;
    const spread = Math.max(...vals) - Math.min(...vals);
    if (spread > maxSpread) maxSpread = spread;
  });
  const collapsesCleanly = maxSpread < 0.05;

  // Find best passing substitution candidate across all scopes/formulas.
  let bestCandidate = null;
  Object.entries(multiModeSubResults).forEach(([scope, formulaResults]) => {
    Object.entries(formulaResults).forEach(([formulaKey, res]) => {
      if (res.pass && (!bestCandidate || res.recoveryReduction > bestCandidate.recoveryReduction)) {
        bestCandidate = { scope, formulaKey, ...res };
      }
    });
  });

  let faultLocation = 'not proven';
  if (!collapsesCleanly) {
    faultLocation = 'frequency normalisation error';
  } else if (isolated020Delta < 0.5) {
    faultLocation = 'summation/scaling after transfer';
  } else if (bestCandidate) {
    faultLocation = 'transfer equation itself';
  }

  if (bestCandidate) {
    return {
      hasCandidate: true,
      faultLocation,
      bestCandidateFormulation: FORMULA_LABELS[bestCandidate.formulaKey],
      bestCandidateScope: bestCandidate.scope,
      deltasAtKeyFreqs: {
        30: bestCandidate.deltas[30], 35: bestCandidate.deltas[35], 40: bestCandidate.deltas[40],
        45: bestCandidate.deltas[45], 50: bestCandidate.deltas[50], 57: bestCandidate.deltas[57], 58: bestCandidate.deltas[58],
      },
      confidence: collapsesCleanly ? 'Medium — transfer-shape substitution found a candidate meeting all pass conditions' : 'Low — collapse test suggests scaling issue may co-exist',
      collapsesCleanly,
      isolated020Delta,
    };
  }

  return {
    hasCandidate: false,
    faultLocation,
    remainingLikelyCause: collapsesCleanly
      ? (isolated020Delta < 0.5
        ? 'Modal summation/coherent-sum scaling after the transfer stage (isolated single-mode delta is small)'
        : 'Transfer equation shape itself, but no closed-form substitution met all pass conditions')
      : 'Frequency-scaling/normalisation error in how Δf or Q is applied relative to mode frequency',
    nextAuditTarget: collapsesCleanly
      ? (isolated020Delta < 0.5 ? 'Modal coherent summation / storage factor audit' : 'Custom asymmetric transfer shape search beyond A–F')
      : 'Mode frequency / Q normalisation audit (bandwidth-normalised collapse failed)',
    collapsesCleanly,
    isolated020Delta,
  };
}