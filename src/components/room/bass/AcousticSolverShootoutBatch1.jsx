/**
 * AcousticSolverShootoutBatch1.jsx
 * Diagnostic-only: Batch 1 Acoustic Solver Shootout
 *
 * V1 is a true production baseline — options mirror BassResponse.jsx simulationResults useMemo exactly.
 * Null metric is local depth (null dB minus the local peak within ±2 octaves), NOT absolute SPL.
 *
 * REW reference targets:
 *   Null frequency : 40.6 Hz
 *   Null depth     : -17.0 dB (depth below local peak)
 *
 * Known production null (for baseline validation):
 *   Null frequency : ~41.5 Hz
 *   Null depth     : ~-53.7 dB (depth below local peak)
 */

import React, { useState } from 'react';
import { simulateBassResponseRewCore } from '../../../bass/core/rewBassEngine.js';
import {
  computeRoomModesLocal,
  estimateModeQLocal,
  modeShapeValueLocal,
  resonantTransfer,
} from '../../../bass/core/modalCalculations.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const REW_NULL_HZ    = 40.6;
const REW_NULL_DB    = -17.0; // depth below local peak
const FREQ_MIN       = 20;
const FREQ_MAX       = 200;
const SPEED_OF_SOUND = 343;

// Baseline validation tolerances
const BASELINE_HZ_TOL    = 0.5;
const BASELINE_DEPTH_TOL = 1.0;

// ─── Null detection: local depth relative to surrounding peak ─────────────────
// Finds the global minimum in 20–80 Hz, then finds the highest point within
// ±1.5 octaves of the null (capped to 20–200 Hz) as the local reference peak.
// Returns { nullHz, nullDepthDb } where nullDepthDb = nullAbsDb - localPeakDb (negative).
function detectNullDepth(freqsHz, splDb) {
  // Step 1: find absolute minimum in 20–80 Hz
  let minDb = Infinity;
  let minIdx = -1;
  for (let i = 0; i < freqsHz.length; i++) {
    const hz = freqsHz[i];
    if (hz < 20 || hz > 80) continue;
    if (splDb[i] < minDb) { minDb = splDb[i]; minIdx = i; }
  }
  if (minIdx === -1) return { nullHz: null, nullDepthDb: null };

  const nullHz = freqsHz[minIdx];

  // Step 2: find local peak within ±1.5 octaves of the null, bounded to [20, 200] Hz
  const loHz = Math.max(20, nullHz / Math.pow(2, 1.5));
  const hiHz = Math.min(200, nullHz * Math.pow(2, 1.5));
  let peakDb = -Infinity;
  for (let i = 0; i < freqsHz.length; i++) {
    const hz = freqsHz[i];
    if (hz < loHz || hz > hiHz) continue;
    if (splDb[i] > peakDb) peakDb = splDb[i];
  }

  const nullDepthDb = minDb - peakDb; // always negative
  return { nullHz, nullDepthDb };
}

// ─── MAE helper (unchanged) ───────────────────────────────────────────────────
function calcMAE(freqsHz, splDb, refSplDb) {
  if (!refSplDb || refSplDb.length !== splDb.length) return null;
  let sum = 0, count = 0;
  for (let i = 0; i < freqsHz.length; i++) {
    if (freqsHz[i] < 20 || freqsHz[i] > 120) continue;
    sum += Math.abs(splDb[i] - refSplDb[i]);
    count++;
  }
  return count > 0 ? sum / count : null;
}

function calcWorstError(freqsHz, splDb, refSplDb) {
  if (!refSplDb || refSplDb.length !== splDb.length) return null;
  let worst = 0;
  for (let i = 0; i < freqsHz.length; i++) {
    if (freqsHz[i] < 20 || freqsHz[i] > 120) continue;
    const e = Math.abs(splDb[i] - refSplDb[i]);
    if (e > worst) worst = e;
  }
  return worst;
}

// ─── Log axis (unchanged) ─────────────────────────────────────────────────────
function buildLogAxis(minHz = FREQ_MIN, maxHz = FREQ_MAX, ppOct = 96) {
  const freqs = [];
  const total = Math.ceil(Math.log2(maxHz / minHz) * ppOct);
  for (let i = 0; i <= total; i++) {
    const hz = minHz * Math.pow(2, i / ppOct);
    if (hz > maxHz) break;
    freqs.push(hz);
  }
  if (freqs[freqs.length - 1] !== maxHz) freqs.push(maxHz);
  return freqs;
}

// ─── V1: Production baseline ──────────────────────────────────────────────────
// Options mirror BassResponse.jsx simulationResults useMemo exactly for
// rewSourceCurveMode = 'flat_rew_reference':
//
//   _isParityFullField = true  (flat_rew_reference + full_field)
//   → enableReflections: false    (_isParityFullField suppresses reflections)
//   → disableLateField:  true     (_fieldLateField forced true)
//   → disableModalPropagationPhase: true  (line 611: forced true when flat_rew_reference)
//   → pureDeterministicModalSum:  true    (line 607: forced true when flat_rew_reference)
//   → propagationPhaseScale: REW_PARITY_PRESET.propagationPhaseScale = 0
//   → debugReflectionOrder: 1     (line 619: forced 1 when flat_rew_reference)
//   → modalSourceReferenceMode: 'distance_normalized' (REW_PARITY_PRESET default)
//   → axialQ: 4.0 (REW_PARITY_PRESET default)
//
//   Multi-sub: iterates all subs and coherently sums complex pressure Re/Im,
//   matching the seatingPositions.forEach → subsForSimulation.forEach loop in BassResponse.
function runProductionBaseline(roomDims, seatPos, subsForSimulation, surfaceAbsorption, axialQ) {
  // Source curve: flat_rew_reference — matches REW_SOURCE_CURVES.flat_rew_reference in BassResponse
  const flatRewCurve = [
    { hz: 20,  db: 94 },
    { hz: 50,  db: 94 },
    { hz: 100, db: 94 },
    { hz: 200, db: 94 },
  ];

  // Production engine options for flat_rew_reference + full_field (BassResponse lines 503–625)
  const prodOptions = {
    // _isParityFullField = true → reflections suppressed, late field suppressed
    enableModes:                  true,
    enableReflections:            false,  // BassResponse line 508: _isParityFullField → false
    disableLateField:             true,   // BassResponse line 516: _isParityFullField → disableLateField=true

    // Phase — flat_rew_reference forces these on line 611
    rewParityModalPhase:          false,
    propagationPhaseScale:        0,      // REW_PARITY_PRESET.propagationPhaseScale = 0
    disableModalPropagationPhase: true,   // BassResponse line 611: forced true for flat_rew_reference

    // Modal options
    pureDeterministicModalSum:    true,   // BassResponse line 607: forced true for flat_rew_reference
    modalSourceReferenceMode:     'distance_normalized',
    modalGainScalar:              1.0,
    axialQ,
    modalStorageMode:             'none',

    // Diagnostic overrides — match production defaults
    highOrderAxialScale:          1.0,
    rewParityModalMagnitudeScale: 1.0,
    debugModalPhaseConvention:    'normal',
    debugModalHSign:              'normal',
    modalCoherenceMode:           'coherent',
    debugMode200Multiplier:       1.0,
    debugReflectionOrder:         1,      // BassResponse line 619: forced 1 for flat_rew_reference
    overrideConstantAxialQ:       false,
    overrideAbsorptionAxialQ:     false,
    debugDisableModalContribution: false,

    // Freq range
    freqMinHz: FREQ_MIN,
    freqMaxHz: FREQ_MAX,
    smoothing: 'none',

    // Absorption
    surfaceAbsorption,
  };

  // Coherent complex pressure sum over all subs — mirrors BassResponse lines 646–657
  let freqsHz = null;
  let sumRe = null;
  let sumIm = null;

  for (const sub of subsForSimulation) {
    const result = simulateBassResponseRewCore(roomDims, seatPos, sub, flatRewCurve, prodOptions);
    if (!freqsHz) {
      freqsHz = result.freqsHz;
      sumRe = result.complexPressure.map(cp => cp.re);
      sumIm = result.complexPressure.map(cp => cp.im);
    } else {
      result.complexPressure.forEach((cp, i) => {
        if (Number.isFinite(cp.re) && Number.isFinite(cp.im)) {
          sumRe[i] += cp.re;
          sumIm[i] += cp.im;
        }
      });
    }
  }

  // Convert combined complex pressure to SPL dB — mirrors BassResponse lines 660–669
  const splDbRaw = sumRe.map((re, i) => {
    const im = sumIm[i];
    const mag = Math.sqrt(re * re + im * im);
    return 20 * Math.log10(Math.max(mag, 1e-10));
  });

  return { freqsHz, splDbRaw };
}

// ─── V2: Incoherent energy sum ────────────────────────────────────────────────
function runEnergySum(roomDims, seatPos, sub, subProductCurve, surfaceAbsorption, axialQ) {
  const { widthM, lengthM, heightM } = roomDims;
  const freqsHz = buildLogAxis();
  const modes = computeRoomModesLocal({ widthM, lengthM, heightM, fMax: FREQ_MAX, c: SPEED_OF_SOUND })
    .map((mode) => {
      const activeAxes = (mode.nx > 0 ? 1 : 0) + (mode.ny > 0 ? 1 : 0) + (mode.nz > 0 ? 1 : 0);
      const baseQ = activeAxes === 1 ? axialQ : activeAxes === 2 ? 3.9 : 2.5;
      const absorptionQ = estimateModeQLocal({ roomDims, surfaceAbsorption, f0: mode.freq });
      return { ...mode, qValue: Math.max(1, Math.min(baseQ, absorptionQ)) };
    });
  const source = { x: Number(sub.x), y: Number(sub.y), z: Number(sub.z) };
  const seat   = { x: Number(seatPos.x), y: Number(seatPos.y), z: Number(seatPos.z) };
  const gainDb = sub?.tuning?.gainDb ?? 0;

  const splDb = freqsHz.map((hz) => {
    const dx = source.x - seat.x, dy = source.y - seat.y, dz = source.z - seat.z;
    const dist = Math.max(0.01, Math.sqrt(dx*dx + dy*dy + dz*dz));
    const directAmp = Math.pow(10, (94 - 20 * Math.log10(dist) + gainDb) / 20);
    let energySum = directAmp * directAmp;
    modes.forEach((mode) => {
      const combined = modeShapeValueLocal(mode, source.x, source.y, source.z, roomDims)
                     * modeShapeValueLocal(mode, seat.x, seat.y, seat.z, roomDims);
      const orderWeight = (Math.abs(mode.nx) + Math.abs(mode.ny) + Math.abs(mode.nz)) >= 2 ? 0.50 : 1.0;
      const { re, im } = resonantTransfer(hz, mode.freq, mode.qValue);
      const contribMag = directAmp * combined * orderWeight * Math.sqrt(re * re + im * im);
      energySum += contribMag * contribMag;
    });
    return 20 * Math.log10(Math.max(Math.sqrt(energySum), 1e-10));
  });
  return { freqsHz, splDb };
}

// ─── V3: RMS pressure sum ─────────────────────────────────────────────────────
function runRmsSum(roomDims, seatPos, sub, subProductCurve, surfaceAbsorption, axialQ) {
  const { widthM, lengthM, heightM } = roomDims;
  const freqsHz = buildLogAxis();
  const modes = computeRoomModesLocal({ widthM, lengthM, heightM, fMax: FREQ_MAX, c: SPEED_OF_SOUND })
    .map((mode) => {
      const activeAxes = (mode.nx > 0 ? 1 : 0) + (mode.ny > 0 ? 1 : 0) + (mode.nz > 0 ? 1 : 0);
      const baseQ = activeAxes === 1 ? axialQ : activeAxes === 2 ? 3.9 : 2.5;
      const absorptionQ = estimateModeQLocal({ roomDims, surfaceAbsorption, f0: mode.freq });
      return { ...mode, qValue: Math.max(1, Math.min(baseQ, absorptionQ)) };
    });
  const source = { x: Number(sub.x), y: Number(sub.y), z: Number(sub.z) };
  const seat   = { x: Number(seatPos.x), y: Number(seatPos.y), z: Number(seatPos.z) };
  const gainDb = sub?.tuning?.gainDb ?? 0;

  const splDb = freqsHz.map((hz) => {
    const dx = source.x - seat.x, dy = source.y - seat.y, dz = source.z - seat.z;
    const dist = Math.max(0.01, Math.sqrt(dx*dx + dy*dy + dz*dz));
    const directAmp = Math.pow(10, (94 - 20 * Math.log10(dist) + gainDb) / 20);
    const mags = [directAmp];
    modes.forEach((mode) => {
      const combined = modeShapeValueLocal(mode, source.x, source.y, source.z, roomDims)
                     * modeShapeValueLocal(mode, seat.x, seat.y, seat.z, roomDims);
      const orderWeight = (Math.abs(mode.nx) + Math.abs(mode.ny) + Math.abs(mode.nz)) >= 2 ? 0.50 : 1.0;
      const { re, im } = resonantTransfer(hz, mode.freq, mode.qValue);
      mags.push(Math.abs(directAmp * combined * orderWeight * Math.sqrt(re * re + im * im)));
    });
    const rms = Math.sqrt(mags.reduce((s, m) => s + m * m, 0) / mags.length);
    return 20 * Math.log10(Math.max(rms, 1e-10));
  });
  return { freqsHz, splDb };
}

// ─── V5: Fixed Q ──────────────────────────────────────────────────────────────
function runFixedQ(roomDims, seatPos, sub, subProductCurve, surfaceAbsorption, fixedQValue) {
  const { widthM, lengthM, heightM } = roomDims;
  const freqsHz = buildLogAxis();
  const modes = computeRoomModesLocal({ widthM, lengthM, heightM, fMax: FREQ_MAX, c: SPEED_OF_SOUND })
    .map((mode) => ({ ...mode, qValue: fixedQValue }));
  const source = { x: Number(sub.x), y: Number(sub.y), z: Number(sub.z) };
  const seat   = { x: Number(seatPos.x), y: Number(seatPos.y), z: Number(seatPos.z) };
  const gainDb = sub?.tuning?.gainDb ?? 0;

  const splDb = freqsHz.map((hz) => {
    const dx = source.x - seat.x, dy = source.y - seat.y, dz = source.z - seat.z;
    const dist = Math.max(0.01, Math.sqrt(dx*dx + dy*dy + dz*dz));
    const directAmp = Math.pow(10, (94 - 20 * Math.log10(dist) + gainDb) / 20);
    let sumRe = directAmp, sumIm = 0;
    modes.forEach((mode) => {
      const combined = modeShapeValueLocal(mode, source.x, source.y, source.z, { widthM, lengthM, heightM })
                     * modeShapeValueLocal(mode, seat.x, seat.y, seat.z, { widthM, lengthM, heightM });
      const orderWeight = (Math.abs(mode.nx) + Math.abs(mode.ny) + Math.abs(mode.nz)) >= 2 ? 0.50 : 1.0;
      const { re, im } = resonantTransfer(hz, mode.freq, fixedQValue);
      const gain = directAmp * combined * orderWeight;
      sumRe += gain * re;
      sumIm += gain * im;
    });
    return 20 * Math.log10(Math.max(Math.sqrt(sumRe*sumRe + sumIm*sumIm), 1e-10));
  });
  return { freqsHz, splDb };
}

// ─── V6: Freq-dependent Sabine Q ─────────────────────────────────────────────
function runFreqDepSabineQ(roomDims, seatPos, sub, subProductCurve, surfaceAbsorption) {
  const flatRewCurve = [
    { hz: 20, db: 94 }, { hz: 50, db: 94 }, { hz: 100, db: 94 }, { hz: 200, db: 94 },
  ];
  return simulateBassResponseRewCore(roomDims, seatPos, sub, flatRewCurve, {
    enableModes: true,
    enableReflections: false,
    disableLateField: true,
    freqMinHz: FREQ_MIN,
    freqMaxHz: FREQ_MAX,
    rewParityModalPhase: false,
    propagationPhaseScale: 0,
    disableModalPropagationPhase: true,
    pureDeterministicModalSum: true,
    overrideAbsorptionAxialQ: true,
    surfaceAbsorption,
    modalSourceReferenceMode: 'distance_normalized',
    modalGainScalar: 1.0,
    smoothing: 'none',
  });
}

// ─── Verdict vs REW ──────────────────────────────────────────────────────────
function shortVerdict(nullHz, nullDepthDb) {
  const freqOk  = nullHz != null && Math.abs(nullHz - REW_NULL_HZ) < 2;
  const depthOk = nullDepthDb != null && Math.abs(nullDepthDb - REW_NULL_DB) < 10;
  if (depthOk && freqOk) return '✅ Close to REW';
  if (depthOk)           return '⚠️ Depth ok, freq off';
  if (freqOk)            return '⚠️ Freq ok, depth shallow';
  return '❌ Both off';
}

// ─── Extract null from live production data ({ frequency, spl }[]) ────────────
function detectNullDepthFromSeries(data) {
  if (!Array.isArray(data) || data.length === 0) return { nullHz: null, nullDepthDb: null };
  const freqsHz = data.map(p => p.frequency);
  const splDb   = data.map(p => p.spl);
  return detectNullDepth(freqsHz, splDb);
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function AcousticSolverShootoutBatch1({
  roomDims,
  seatPos,
  subsForSimulation,  // all active subs — replaces single `sub` prop
  subProductCurve,
  surfaceAbsorption,
  axialQ = 4.0,
  liveProductionData = null, // live graph series data: { frequency, spl }[]
}) {
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError]   = useState(null);

  function runBatch() {
    setRunning(true);
    setError(null);
    try {
      // ── V1: Production baseline — multi-sub coherent complex sum ──
      const activeSubs = Array.isArray(subsForSimulation) && subsForSimulation.length > 0
        ? subsForSimulation
        : [];
      if (activeSubs.length === 0) {
        setError('No active subs passed to Batch 1 — subsForSimulation is empty.');
        return;
      }
      const v1 = runProductionBaseline(roomDims, seatPos, activeSubs, surfaceAbsorption, axialQ);
      const v1Spl = v1.splDbRaw;
      const { nullHz: v1NHz, nullDepthDb: v1NDepth } = detectNullDepth(v1.freqsHz, v1Spl);

      // ── Baseline validation against live production response ──
      if (!liveProductionData || liveProductionData.length === 0) {
        setResults({
          baselineValidation: { unavailable: true },
          rows: [],
          diagnosis: null,
        });
        return;
      }

      const { nullHz: prodNullHz, nullDepthDb: prodNullDepth } =
        detectNullDepthFromSeries(liveProductionData);

      const dHz    = (v1NHz    != null && prodNullHz    != null) ? Math.abs(v1NHz    - prodNullHz)    : Infinity;
      const dDepth = (v1NDepth != null && prodNullDepth != null) ? Math.abs(v1NDepth - prodNullDepth) : Infinity;
      const baselinePass = dHz <= BASELINE_HZ_TOL && dDepth <= BASELINE_DEPTH_TOL;

      const baselineValidation = {
        prodNullHz,
        v1NullHz:    v1NHz,
        dHz:         (v1NHz != null && prodNullHz != null) ? (v1NHz - prodNullHz) : null,
        prodNullDepth,
        v1NullDepth: v1NDepth,
        dDepth:      (v1NDepth != null && prodNullDepth != null) ? (v1NDepth - prodNullDepth) : null,
        pass:        baselinePass,
      };

      if (!baselinePass) {
        setResults({ baselineValidation, rows: [], diagnosis: null });
        return;
      }

      // ── Variants (only run if baseline passes) ──
      const rows = [];

      rows.push({
        name: 'V1 — Coherent complex (production)',
        nullHz: v1NHz, nullDepthDb: v1NDepth,
        dHz: v1NHz != null ? (v1NHz - REW_NULL_HZ) : null,
        dDb: v1NDepth != null ? (v1NDepth - REW_NULL_DB) : null,
        mae: null, worst: null,
        verdict: shortVerdict(v1NHz, v1NDepth),
        isBaseline: true,
      });

      const sub = activeSubs[0]; // variants V2–V6 operate on single-sub for isolation testing
      const v2 = runEnergySum(roomDims, seatPos, sub, subProductCurve, surfaceAbsorption, axialQ);
      const { nullHz: v2NHz, nullDepthDb: v2NDepth } = detectNullDepth(v2.freqsHz, v2.splDb);
      rows.push({
        name: 'V2 — Incoherent energy sum',
        nullHz: v2NHz, nullDepthDb: v2NDepth,
        dHz: v2NHz != null ? (v2NHz - REW_NULL_HZ) : null,
        dDb: v2NDepth != null ? (v2NDepth - REW_NULL_DB) : null,
        mae:   calcMAE(v2.freqsHz, v2.splDb, v1Spl),
        worst: calcWorstError(v2.freqsHz, v2.splDb, v1Spl),
        verdict: shortVerdict(v2NHz, v2NDepth),
      });

      const v3 = runRmsSum(roomDims, seatPos, sub, subProductCurve, surfaceAbsorption, axialQ);
      const { nullHz: v3NHz, nullDepthDb: v3NDepth } = detectNullDepth(v3.freqsHz, v3.splDb);
      rows.push({
        name: 'V3 — RMS pressure sum',
        nullHz: v3NHz, nullDepthDb: v3NDepth,
        dHz: v3NHz != null ? (v3NHz - REW_NULL_HZ) : null,
        dDb: v3NDepth != null ? (v3NDepth - REW_NULL_DB) : null,
        mae:   calcMAE(v3.freqsHz, v3.splDb, v1Spl),
        worst: calcWorstError(v3.freqsHz, v3.splDb, v1Spl),
        verdict: shortVerdict(v3NHz, v3NDepth),
      });

      // V4 = copy of V1 (damping baseline label)
      rows.push({
        name: 'V4 — Baseline Q (same as V1)',
        nullHz: v1NHz, nullDepthDb: v1NDepth,
        dHz: v1NHz != null ? (v1NHz - REW_NULL_HZ) : null,
        dDb: v1NDepth != null ? (v1NDepth - REW_NULL_DB) : null,
        mae: null, worst: null,
        verdict: '= V1 (damping baseline)',
        isBaseline: true,
      });

      const v5 = runFixedQ(roomDims, seatPos, sub, subProductCurve, surfaceAbsorption, 1.0);
      const { nullHz: v5NHz, nullDepthDb: v5NDepth } = detectNullDepth(v5.freqsHz, v5.splDb);
      rows.push({
        name: 'V5 — Fixed Q = 1.0 (max damping)',
        nullHz: v5NHz, nullDepthDb: v5NDepth,
        dHz: v5NHz != null ? (v5NHz - REW_NULL_HZ) : null,
        dDb: v5NDepth != null ? (v5NDepth - REW_NULL_DB) : null,
        mae:   calcMAE(v5.freqsHz, v5.splDb, v1Spl),
        worst: calcWorstError(v5.freqsHz, v5.splDb, v1Spl),
        verdict: shortVerdict(v5NHz, v5NDepth),
      });

      const v6 = runFreqDepSabineQ(roomDims, seatPos, sub, subProductCurve, surfaceAbsorption);
      const { nullHz: v6NHz, nullDepthDb: v6NDepth } = detectNullDepth(v6.freqsHz, v6.splDbRaw);
      rows.push({
        name: 'V6 — Freq-dependent Sabine Q',
        nullHz: v6NHz, nullDepthDb: v6NDepth,
        dHz: v6NHz != null ? (v6NHz - REW_NULL_HZ) : null,
        dDb: v6NDepth != null ? (v6NDepth - REW_NULL_DB) : null,
        mae:   calcMAE(v6.freqsHz, v6.splDbRaw, v1Spl),
        worst: calcWorstError(v6.freqsHz, v6.splDbRaw, v1Spl),
        verdict: shortVerdict(v6NHz, v6NDepth),
      });

      // Diagnosis
      const candidates = rows.filter(r => r.nullHz != null && r.nullDepthDb != null &&
        Math.abs(r.dDb) < 10 && Math.abs(r.dHz) < 2);
      const summationCandidates = candidates.filter(r => r.name.startsWith('V2') || r.name.startsWith('V3'));
      const dampingCandidates   = candidates.filter(r => r.name.startsWith('V5') || r.name.startsWith('V6'));
      let diagnosis = '';
      if (summationCandidates.length > 0 && dampingCandidates.length === 0)
        diagnosis = 'Likely presentation averaging — summation method hides the null.';
      else if (dampingCandidates.length > 0 && summationCandidates.length === 0)
        diagnosis = 'Likely modal damping mismatch — Q adjustment moves null depth toward REW.';
      else if (summationCandidates.length > 0 && dampingCandidates.length > 0)
        diagnosis = 'Both summation method and damping produce candidates — inspect further.';
      else
        diagnosis = 'No Batch 1 variant matches REW. Solver family is structurally different.';

      setResults({ baselineValidation, rows, diagnosis });
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }

  const fmt  = (v, dec = 1) => v == null ? '—' : Number(v).toFixed(dec);
  const fmtD = (v) => { if (v == null) return '—'; return `${v > 0 ? '+' : ''}${Number(v).toFixed(1)}`; };
  const bv = results?.baselineValidation;

  return (
    <details className="border border-yellow-400 rounded bg-yellow-50 mt-4">
      <summary className="px-3 py-2 text-xs font-semibold cursor-pointer select-none text-yellow-800">
        🔬 Acoustic Solver Shootout — Batch 1 (Summation &amp; Damping)
      </summary>

      <div className="px-4 pb-4 pt-2 space-y-3">
        <p className="text-xs text-yellow-700">
          Diagnostic only. REW target: <strong>40.6 Hz / −17.0 dB depth</strong>.
          Baseline validation compares V1 against the <strong>live production graph</strong> (selected seat).
          Null depth = null dB minus local peak within ±1.5 octaves.
        </p>

        <button
          onClick={runBatch}
          disabled={running}
          className="px-3 py-1 text-xs bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-50"
        >
          {running ? 'Running…' : 'Run Batch 1'}
        </button>

        {error && <p className="text-xs text-red-600 font-mono">Error: {error}</p>}

        {results && (
          <div className="space-y-3">

            {/* ── Baseline validation ── */}
            {bv?.unavailable ? (
              <div className="p-2 rounded border bg-gray-50 border-gray-300 text-xs font-mono text-gray-600">
                Baseline validation unavailable — production response array not provided.
              </div>
            ) : (
              <div className={`p-2 rounded border text-xs font-mono ${bv?.pass ? 'bg-green-50 border-green-400 text-green-900' : 'bg-red-50 border-red-400 text-red-900'}`}>
                <div className="font-bold mb-1">Baseline Validation — V1 vs Live Production Graph</div>
                <table className="border-collapse w-full">
                  <thead>
                    <tr className="text-left" style={{ fontSize: 9 }}>
                      <th className="pr-3">Metric</th>
                      <th className="pr-3">Live Production</th>
                      <th className="pr-3">V1 Diagnostic</th>
                      <th className="pr-3">Δ</th>
                      <th>Tolerance</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="pr-3">Null Hz</td>
                      <td className="pr-3">{fmt(bv?.prodNullHz)} Hz</td>
                      <td className="pr-3">{fmt(bv?.v1NullHz)} Hz</td>
                      <td className={`pr-3 font-bold ${Math.abs(bv?.dHz ?? Infinity) <= BASELINE_HZ_TOL ? 'text-green-700' : 'text-red-700'}`}>
                        {fmtD(bv?.dHz)} Hz
                      </td>
                      <td>≤ {BASELINE_HZ_TOL} Hz</td>
                    </tr>
                    <tr>
                      <td className="pr-3">Null depth</td>
                      <td className="pr-3">{fmt(bv?.prodNullDepth)} dB</td>
                      <td className="pr-3">{fmt(bv?.v1NullDepth)} dB</td>
                      <td className={`pr-3 font-bold ${Math.abs(bv?.dDepth ?? Infinity) <= BASELINE_DEPTH_TOL ? 'text-green-700' : 'text-red-700'}`}>
                        {fmtD(bv?.dDepth)} dB
                      </td>
                      <td>≤ {BASELINE_DEPTH_TOL} dB</td>
                    </tr>
                  </tbody>
                </table>
                <div className={`mt-1 font-bold ${bv?.pass ? 'text-green-800' : 'text-red-800'}`}>
                  {bv?.pass ? '✅ PASS — baseline confirmed, variants valid.' : '❌ FAIL — V1 does not match live production graph.'}
                </div>
              </div>
            )}

            {/* ── Variant table — only shown if baseline passes (and not unavailable) ── */}
            {!bv?.unavailable && !bv?.pass ? (
              <div className="p-2 bg-red-50 border border-red-300 rounded text-xs text-red-800 font-mono">
                Batch 1 invalid — V1 does not match the live graph. Fix V1 options before interpreting variants.
              </div>
            ) : bv?.pass ? (
              <>
                <div className="overflow-x-auto">
                  <table className="text-xs w-full border-collapse">
                    <thead>
                      <tr className="bg-yellow-200 text-yellow-900">
                        <th className="text-left px-2 py-1 border border-yellow-300">Variant</th>
                        <th className="px-2 py-1 border border-yellow-300">Null Hz</th>
                        <th className="px-2 py-1 border border-yellow-300">Depth dB</th>
                        <th className="px-2 py-1 border border-yellow-300">Δ Hz vs REW</th>
                        <th className="px-2 py-1 border border-yellow-300">Δ dB vs REW</th>
                        <th className="px-2 py-1 border border-yellow-300">MAE</th>
                        <th className="px-2 py-1 border border-yellow-300">Worst</th>
                        <th className="text-left px-2 py-1 border border-yellow-300">Verdict</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="bg-green-100 text-green-900 font-semibold">
                        <td className="px-2 py-1 border border-yellow-300">REW Reference</td>
                        <td className="text-center px-2 py-1 border border-yellow-300">{REW_NULL_HZ}</td>
                        <td className="text-center px-2 py-1 border border-yellow-300">{REW_NULL_DB} dB</td>
                        <td className="text-center px-2 py-1 border border-yellow-300">—</td>
                        <td className="text-center px-2 py-1 border border-yellow-300">—</td>
                        <td className="text-center px-2 py-1 border border-yellow-300">—</td>
                        <td className="text-center px-2 py-1 border border-yellow-300">—</td>
                        <td className="px-2 py-1 border border-yellow-300">Target</td>
                      </tr>
                      {results.rows.map((row, i) => {
                        const freqOk  = row.dHz    != null && Math.abs(row.dHz)    < 2;
                        const depthOk = row.dDb     != null && Math.abs(row.dDb)    < 10;
                        return (
                          <tr key={i} className={depthOk && freqOk ? 'bg-green-50' : row.isBaseline ? 'bg-yellow-50' : ''}>
                            <td className="px-2 py-1 border border-yellow-200 font-medium">{row.name}</td>
                            <td className="text-center px-2 py-1 border border-yellow-200">{fmt(row.nullHz)}</td>
                            <td className="text-center px-2 py-1 border border-yellow-200">{fmt(row.nullDepthDb)}</td>
                            <td className={`text-center px-2 py-1 border border-yellow-200 ${freqOk ? 'text-green-700 font-bold' : 'text-red-700'}`}>{fmtD(row.dHz)}</td>
                            <td className={`text-center px-2 py-1 border border-yellow-200 ${depthOk ? 'text-green-700 font-bold' : 'text-red-700'}`}>{fmtD(row.dDb)}</td>
                            <td className="text-center px-2 py-1 border border-yellow-200">{row.mae != null ? fmt(row.mae) + ' dB' : '—'}</td>
                            <td className="text-center px-2 py-1 border border-yellow-200">{row.worst != null ? fmt(row.worst) + ' dB' : '—'}</td>
                            <td className="px-2 py-1 border border-yellow-200">{row.verdict}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="p-3 bg-yellow-100 border border-yellow-400 rounded text-xs">
                  <span className="font-semibold text-yellow-900">Batch 1 Diagnosis: </span>
                  <span className="text-yellow-800">{results.diagnosis}</span>
                </div>
              </>
            ) : null}
          </div>
        )}
      </div>
    </details>
  );
}