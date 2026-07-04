// modalDistanceScalingABAuditEngine.jsx
// Pure computation for the Modal Distance Scaling A/B Audit.
// Read-only: calls the real production engine (simulateBassResponseRewCore) with a fixed
// parity test case across 4 option variants to test whether
// modalSourceReferenceMode="distance_normalized" (current live setting) is applying
// listener-distance attenuation to the modal field and causing the remaining null.
// Does not alter production code, options, or the live graph.

import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';

export function fmt(v, d = 3) { return Number.isFinite(v) ? v.toFixed(d) : '—'; }
function mag(re, im) { return Math.sqrt(re * re + im * im); }
function toDb(m) { return 20 * Math.log10(Math.max(m, 1e-10)); }

// Fixed parity case
const ROOM_DIMS = { widthM: 5.0, lengthM: 4.5, heightM: 3.0 };
const SUB = { id: 'sub_centre_front', x: 2.5, y: 0.3, z: 0.35, tuning: { gainDb: 0, delayMs: 0, polarity: 0 } };
const SEAT_POS = { x: 2.5, y: 4.0, z: 1.2 };
const SURFACE_ABSORPTION = { front: 0.3, back: 0.3, left: 0.3, right: 0.3, floor: 0.3, ceiling: 0.3 };
const FREQS_HZ = [28, 29, 30, 31, 32, 33, 34, 35];
const SOURCE_CURVE = [
  { hz: 20, db: 94 },
  { hz: 50, db: 94 },
  { hz: 100, db: 94 },
  { hz: 200, db: 94 },
];

// Base options identical to buildLiveEngineOptions (live production graph settings),
// varied per-variant below only in modalSourceReferenceMode / rewParityFieldMode.
function baseOptions(frequencyHz) {
  return {
    enableReflections: false,
    enableModes: true,
    surfaceAbsorption: SURFACE_ABSORPTION,
    freqMinHz: frequencyHz,
    freqMaxHz: frequencyHz + 0.01,
    modeGenerationFMaxHz: 200,
    smoothing: 'none',
    modalGainScalar: 1.0,
    axialQ: 4.0,
    modalStorageMode: 'none',
    propagationPhaseScale: 0,
    pureDeterministicModalSum: true,
    disableReflectionPhaseJitter: false,
    disableReflectionCoherenceWeight: false,
    disableLateField: true,
    disableModalPropagationPhase: true,
    debugModalPhaseConvention: 'normal',
    mute68HzAxialMode: false,
    debugMode200Multiplier: 1.0,
    debugReflectionOrder: 1,
    reflectionGainScale: 1.0,
    debugModalHSign: 'normal',
    rewParityModalMagnitudeScale: 1.0,
    modalCoherenceMode: 'coherent',
    highOrderAxialScale: 1.0,
    qStrategy: 'production',
  };
}

const VARIANTS = [
  {
    key: 'A',
    label: 'A. Current production',
    description: 'Live settings exactly — modalSourceReferenceMode="distance_normalized", full field (direct + reflections[off live] + modal).',
    buildOptions: (f) => ({ ...baseOptions(f), modalSourceReferenceMode: 'distance_normalized' }),
  },
  {
    key: 'B',
    label: 'B. Modal excitation decoupled from listener distance',
    description: 'modalSourceReferenceMode="existing" (no listener-distance attenuation on modal amplitude). Direct/reflection paths unchanged.',
    buildOptions: (f) => ({ ...baseOptions(f), modalSourceReferenceMode: 'existing' }),
  },
  {
    key: 'C',
    label: 'C. Modal excitation distance-normalized only',
    description: 'Modes-only field (no direct, no reflections, no late field), modalSourceReferenceMode="distance_normalized".',
    buildOptions: (f) => ({ ...baseOptions(f), modalSourceReferenceMode: 'distance_normalized', rewParityFieldMode: 'modes_only' }),
  },
  {
    key: 'D',
    label: 'D. Modal excitation decoupled only',
    description: 'Modes-only field (no direct, no reflections, no late field), modalSourceReferenceMode="existing".',
    buildOptions: (f) => ({ ...baseOptions(f), modalSourceReferenceMode: 'existing', rewParityFieldMode: 'modes_only' }),
  },
];

function runVariantAtFrequency(variant, frequencyHz) {
  const options = variant.buildOptions(frequencyHz);
  const engineOut = simulateBassResponseRewCore(ROOM_DIMS, SEAT_POS, SUB, SOURCE_CURVE, options);

  const vec = engineOut.perFrequencyVectorDebug?.[0] || {
    directRe: 0, directIm: 0, reflectionRe: 0, reflectionIm: 0, modalSumRe: 0, modalSumIm: 0, finalRe: 0, finalIm: 0,
  };
  const cp = engineOut.complexPressure?.[0] || { re: vec.finalRe, im: vec.finalIm };

  const directMag = mag(vec.directRe, vec.directIm);
  const reflectionMag = mag(vec.reflectionRe, vec.reflectionIm);
  const modalMag = mag(vec.modalSumRe, vec.modalSumIm);
  const finalMag = mag(cp.re, cp.im);

  return {
    frequencyHz,
    totalSplDb: toDb(finalMag),
    directSplDb: toDb(directMag),
    reflectionSplDb: reflectionMag > 1e-10 ? toDb(reflectionMag) : null,
    modalSplDb: toDb(modalMag),
    finalRe: cp.re,
    finalIm: cp.im,
    finalPhaseDeg: (Math.atan2(cp.im, cp.re) * 180) / Math.PI,
    modalDirectRatioDb: directMag > 1e-10 ? toDb(modalMag) - toDb(directMag) : null,
  };
}

function computeNullDepthDb(rows) {
  // Null depth = peak SPL across the full sweep minus the minimum SPL within 29-31 Hz.
  const peak = Math.max(...rows.map((r) => r.totalSplDb));
  const nullRows = rows.filter((r) => r.frequencyHz >= 29 && r.frequencyHz <= 31);
  const nullMin = nullRows.length ? Math.min(...nullRows.map((r) => r.totalSplDb)) : peak;
  return peak - nullMin;
}

function maxAbsDifference(rowsX, rowsY) {
  let maxDiff = 0;
  rowsX.forEach((rx, i) => {
    const ry = rowsY[i];
    if (ry) maxDiff = Math.max(maxDiff, Math.abs(rx.totalSplDb - ry.totalSplDb));
  });
  return maxDiff;
}

function newArtifactCheck(rowsA, rowsB) {
  // Detects whether B introduces a new local minimum >3dB deeper than A anywhere in 28-35 Hz
  // outside the 29-31 Hz null region (i.e. a side-effect artifact from the change).
  let newArtifact = false;
  let artifactFreq = null;
  rowsB.forEach((rb, i) => {
    if (rb.frequencyHz >= 29 && rb.frequencyHz <= 31) return; // exclude the target null region
    const ra = rowsA[i];
    if (ra && (ra.totalSplDb - rb.totalSplDb) > 3) {
      newArtifact = true;
      artifactFreq = rb.frequencyHz;
    }
  });
  return { newArtifact, artifactFreq };
}

export function runModalDistanceScalingABAudit() {
  const results = {};
  VARIANTS.forEach((variant) => {
    results[variant.key] = {
      key: variant.key,
      label: variant.label,
      description: variant.description,
      rows: FREQS_HZ.map((f) => runVariantAtFrequency(variant, f)),
    };
  });

  const nullDepthA = computeNullDepthDb(results.A.rows);
  const nullDepthB = computeNullDepthDb(results.B.rows);
  const nullDepthReductionDb = nullDepthA - nullDepthB;
  const { newArtifact, artifactFreq } = newArtifactCheck(results.A.rows, results.B.rows);

  const cdMaxDiffDb = maxAbsDifference(results.C.rows, results.D.rows);

  // Pass/fail logic per spec.
  const bMateriallyReducesNull = nullDepthReductionDb > 3 && !newArtifact;
  const cdMaterialDifference = cdMaxDiffDb > 3;
  const bNullUnchanged = Math.abs(nullDepthReductionDb) < 1 || nullDepthReductionDb <= 0;

  let verdict;
  if (bNullUnchanged && !bMateriallyReducesNull) {
    verdict = 'RETIRED';
  } else if (bMateriallyReducesNull || cdMaterialDifference) {
    verdict = 'CONFIRMED';
  } else {
    verdict = 'INCONCLUSIVE';
  }

  const finalReport = {
    test: 'Modal Distance Scaling A/B Audit — does modalSourceReferenceMode="distance_normalized" apply incorrect listener-distance attenuation to the modal field, causing the 30 Hz null?',
    expected: 'If distance-decoupling the modal source (variant B) removes/materially reduces the 29-31 Hz null without creating a new dip elsewhere in 28-35 Hz, OR if C and D differ by >3 dB anywhere in 28-35 Hz, modal distance scaling is a material contributor.',
    actual: `Null depth A (current production) = ${fmt(nullDepthA, 2)} dB. Null depth B (decoupled) = ${fmt(nullDepthB, 2)} dB. Reduction = ${fmt(nullDepthReductionDb, 2)} dB. New artifact introduced by B outside 29-31 Hz: ${newArtifact ? `YES at ${artifactFreq} Hz` : 'NO'}. Max |C-D| difference across 28-35 Hz = ${fmt(cdMaxDiffDb, 2)} dB.`,
    delta: `ΔNullDepth(A→B) = ${fmt(nullDepthReductionDb, 2)} dB; Δ(C,D) max = ${fmt(cdMaxDiffDb, 2)} dB`,
    severity: verdict === 'CONFIRMED' ? 'HIGH — modal listener-distance scaling materially affects the null; likely contributor to REW parity failure.'
      : verdict === 'RETIRED' ? 'LOW — hypothesis retired, no material effect on the 30 Hz null.'
      : 'MEDIUM — mixed signal, evidence inconclusive; further isolation required.',
    nextTest: verdict === 'CONFIRMED'
      ? 'Promote variant B (existing/decoupled modalSourceReferenceMode) to a full-curve REW parity sweep and confirm no regression elsewhere in the response.'
      : verdict === 'RETIRED'
        ? 'Return to the reflection/modal field-summation architecture hypothesis (complete modal field + complete reflection field below Schroeder).'
        : 'Re-run with a wider frequency window and additional seats to confirm the mixed signal before drawing a conclusion.',
    conclusionLine: verdict === 'CONFIRMED' ? 'MODAL DISTANCE SCALING CONFIRMED' : verdict === 'RETIRED' ? 'MODAL DISTANCE SCALING RETIRED' : 'MODAL DISTANCE SCALING INCONCLUSIVE',
  };

  return {
    results,
    freqsHz: FREQS_HZ,
    nullDepthA, nullDepthB, nullDepthReductionDb,
    newArtifact, artifactFreq,
    cdMaxDiffDb,
    verdict,
    finalReport,
  };
}