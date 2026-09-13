// p20-grid-parity-fix.mjs — P20 grid parity fix acceptance test.
//
// Verifies that feeding the exact canonical 360-point frequency array to
// prepareSourceRoomField eliminates the grid-sample drift between the batch
// evaluator and the per-source solver, achieving P19/P20 parity.
//
// Run with: node --import ./test/_alias-register.mjs test/p20-grid-parity-fix.mjs

import { simulateBassResponseRewCore, prepareModeBank } from '@/bass/core/rewBassEngine';
import { evaluateBatchModalTransfers, prepareSourceRoomField } from '@/bass/core/batchModalEvaluator';
import { buildFrequencyAxis } from '@/bass/core/rewCorePrimitives';
import { getPerSubwooferAmplifierAuthority, DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W } from '@/components/utils/subwooferCapability';
import { getSubwooferCurve, normaliseModelKey } from '@/components/models/speakers/registry';
import { REW_SOURCE_CURVES } from '@/components/room/bass/rewSourceCurves';
import { BASS_NORMALIZED_PHYSICS_DEFAULTS } from '@/components/room/bass/bassPhysicsDefaults';
import { deriveCentreZ } from '@/components/utils/subwooferInstanceMigration';
import {
  computeOfficialPerSeatP19Assessment,
  computeOfficialP20Assessment,
} from '@/components/utils/bassAuthoritativeAssessment';
import fs from 'node:fs';

// ── Test data ────────────────────────────────────────────────────────────

const DATA = JSON.parse(fs.readFileSync(new URL('./_fresh-stage2-data.json', import.meta.url), 'utf8'));

const ROOM_DIMS = { widthM: 4, lengthM: 6.3, heightM: 2.4 };
const SELECTED_SUB_MODEL = 'sub4-12';
const SUBWOOFER_BOTTOM_HEIGHT_M = 0.05;
const AMPLIFIER_POWER_PER_SUB_W = DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W;

const FINALISTS = DATA.stage1.four_sub_result.finalists;

const SEATING_POSITIONS = DATA.project.seating_positions.map(seat => ({
  id: seat.id,
  x: Number(seat.x),
  y: Number(seat.y),
  z: seat.z ?? 1.2,
}));

const RSP_POSITION = {
  id: 'rsp',
  x: ROOM_DIMS.widthM / 2,
  y: ROOM_DIMS.lengthM / 2,
  z: 1.2,
};

const LISTENERS = [RSP_POSITION, ...SEATING_POSITIONS];

const PHYSICS = {
  ...BASS_NORMALIZED_PHYSICS_DEFAULTS,
  rewSourceCurveMode: 'product',
  disableLateField: true,
  disableModalPropagationPhase: true,
};

// ── Canonical 360-point frequency array ──────────────────────────────────

const CANONICAL_FREQS_HZ = buildFrequencyAxis(15, 200, undefined);

// ── Mode bank (shared) ────────────────────────────────────────────────────

const engineOptionsBase = {
  surfaceAbsorption: PHYSICS.surfaceAbsorption,
  freqMinHz: 15,
  freqMaxHz: 200,
  smoothing: 'none',
  axialQ: PHYSICS.axialQ,
  qStrategy: 'ab_corrected',
  abApplyModeMultiplicity: true,
  roomIsSealed: true,
  abMidbandQScale: 1,
  enableModes: true,
};
const precomputedModes = prepareModeBank(ROOM_DIMS, engineOptionsBase);

// ── Helpers ───────────────────────────────────────────────────────────────

function buildSourcesForFinalist(finalist) {
  const modelKey = normaliseModelKey(SELECTED_SUB_MODEL);
  const centreZ = deriveCentreZ({ bottomHeightM: SUBWOOFER_BOTTOM_HEIGHT_M, model: modelKey });
  return finalist.sources.map((s, i) => ({
    id: `stage2-src-${i + 1}`,
    modelKey,
    subwooferAmplifierPowerW: AMPLIFIER_POWER_PER_SUB_W,
    x: s.xNorm * ROOM_DIMS.widthM,
    y: s.yNorm * ROOM_DIMS.lengthM,
    z: centreZ,
    tuning: { gainDb: 0, delayMs: 0, polarity: 0 },
  }));
}

function buildDeratedCurve(sub, sourceIndex, sources) {
  const subCurve = getSubwooferCurve(sub.modelKey);
  const amplifierAuthority = getPerSubwooferAmplifierAuthority(sources);
  const deratingDb = amplifierAuthority.sourceAuthorities[sourceIndex]?.deratingDb ?? 0;
  if (!Number.isFinite(deratingDb) || deratingDb === 0) return subCurve;
  return subCurve.map((point) => {
    const spl = Number(point?.spl);
    const db = Number(point?.db);
    if (Number.isFinite(spl)) return { ...point, spl: spl + deratingDb };
    if (Number.isFinite(db)) return { ...point, db: db + deratingDb };
    return { ...point };
  });
}

// ── Batch path (with canonical frequency array) ──────────────────────────

function runBatchPath(sources, listeners) {
  const sourcesWithCurves = sources.map((src, si) => ({
    ...src,
    sourceCurve: buildDeratedCurve(src, si, sources),
  }));

  const prepared = prepareSourceRoomField({
    roomDims: ROOM_DIMS,
    sources: sourcesWithCurves,
    precomputedModes,
    physics: PHYSICS,
    qStrategyOverride: 'ab_corrected',
    freqMinHz: 15,
    freqMaxHz: 200,
    precomputedFreqsHz: CANONICAL_FREQS_HZ,
  });

  const result = evaluateBatchModalTransfers({
    roomDims: ROOM_DIMS,
    sources: sourcesWithCurves,
    listeners,
    precomputedModes,
    physics: PHYSICS,
    qStrategyOverride: 'ab_corrected',
    precomputedFreqsHz: CANONICAL_FREQS_HZ,
  });

  // Sum per-source transfers per listener → SPL curves
  const splCurves = {};
  const byListener = {};
  for (const transfer of result.perSourcePerListenerTransfers) {
    if (!byListener[transfer.listenerId]) byListener[transfer.listenerId] = [];
    byListener[transfer.listenerId].push(transfer);
  }

  for (const [seatId, transfers] of Object.entries(byListener)) {
    const freqsHz = result.freqsHz;
    const sumRe = new Float64Array(freqsHz.length);
    const sumIm = new Float64Array(freqsHz.length);
    for (const transfer of transfers) {
      for (let fi = 0; fi < transfer.points.length; fi++) {
        sumRe[fi] += transfer.points[fi].re;
        sumIm[fi] += transfer.points[fi].im;
      }
    }
    splCurves[seatId] = freqsHz.map((f, i) => ({
      frequency: f,
      spl: 20 * Math.log10(Math.max(Math.hypot(sumRe[i], sumIm[i]), 1e-10)),
    }));
  }

  return { splCurves, freqsHz: result.freqsHz, preparedFreqsHz: prepared.freqsHz };
}

// ── Per-source solver path (fallback) ─────────────────────────────────────

function runPerSourcePath(sources, listeners) {
  const splCurves = {};
  let firstFreqsHz = null;

  for (const listener of listeners) {
    const seatId = listener.id;
    let freqsHz = null;
    let sumRe = null;
    let sumIm = null;

    sources.forEach((sub, sourceIndex) => {
      const sourceCurve = buildDeratedCurve(sub, sourceIndex, sources);
      const seatZ = Number.isFinite(Number(listener.z)) ? Number(listener.z) : 1.2;

      const result = simulateBassResponseRewCore(
        ROOM_DIMS,
        { x: listener.x, y: listener.y, z: seatZ },
        sub,
        sourceCurve,
        {
          enableReflections: false,
          enableModes: true,
          surfaceAbsorption: PHYSICS.surfaceAbsorption,
          freqMinHz: 15,
          freqMaxHz: 200,
          smoothing: 'none',
          disableLateField: true,
          disableModalPropagationPhase: true,
          rewSourceCurveMode: 'product',
          rewParityFieldMode: 'modes_only',
          abApplyModeMultiplicity: true,
          roomIsSealed: true,
          abMidbandQScale: 1,
          debugReflectionOrder: 1,
          rewParityModalMagnitudeScale: 1,
          qStrategy: 'ab_corrected',
          precomputedModes,
        },
      );

      if (!freqsHz) {
        freqsHz = result.freqsHz;
        sumRe = result.complexPressure.map((v) => v.re);
        sumIm = result.complexPressure.map((v) => v.im);
      } else {
        result.complexPressure.forEach((v, i) => {
          if (Number.isFinite(v.re) && Number.isFinite(v.im)) {
            sumRe[i] += v.re;
            sumIm[i] += v.im;
          }
        });
      }
    });

    if (freqsHz && sumRe && sumIm) {
      if (!firstFreqsHz) firstFreqsHz = freqsHz;
      splCurves[seatId] = freqsHz.map((f, i) => ({
        frequency: f,
        spl: 20 * Math.log10(Math.max(Math.hypot(sumRe[i], sumIm[i]), 1e-10)),
      }));
    }
  }

  return { splCurves, freqsHz: firstFreqsHz };
}

// ── Run parity ───────────────────────────────────────────────────────────

const sources = buildSourcesForFinalist(FINALISTS[0]);

const batch = runBatchPath(sources, LISTENERS);
const perSource = runPerSourcePath(sources, LISTENERS);

// 1. CANONICAL GRID REUSED EXACTLY (reference equality)
const canonicalGridReused = batch.freqsHz === CANONICAL_FREQS_HZ && batch.preparedFreqsHz === CANONICAL_FREQS_HZ;

// 2. LIMITER FREQUENCY PARITY (element-wise exact match)
const batchFreqs = batch.freqsHz;
const perSourceFreqs = perSource.freqsHz;
let freqParity = true;
let maxFreqDelta = 0;
if (!perSourceFreqs || batchFreqs.length !== perSourceFreqs.length) {
  freqParity = false;
} else {
  for (let i = 0; i < batchFreqs.length; i++) {
    const delta = Math.abs(batchFreqs[i] - perSourceFreqs[i]);
    if (delta > maxFreqDelta) maxFreqDelta = delta;
    if (batchFreqs[i] !== perSourceFreqs[i]) {
      freqParity = false;
    }
  }
}

// 3. RSP P20 ≈ 0 (max point-by-point SPL delta between batch and per-source RSP)
let rspMaxDelta = 0;
const batchRsp = batch.splCurves['rsp'];
const perSourceRsp = perSource.splCurves['rsp'];
if (batchRsp && perSourceRsp) {
  for (let i = 0; i < batchRsp.length; i++) {
    const delta = Math.abs(batchRsp[i].spl - perSourceRsp[i].spl);
    if (delta > rspMaxDelta) rspMaxDelta = delta;
  }
}

// 4. P19/P20 parity (using existing assessment functions, raw SPL as post-EQ)
const ASSESS_START_HZ = 20;
const ASSESS_END_HZ = 120;

const batchPerSeatCurves = SEATING_POSITIONS.map((seat) => ({
  seatId: seat.id,
  responseData: batch.splCurves[seat.id] || [],
}));

const perSourcePerSeatCurves = SEATING_POSITIONS.map((seat) => ({
  seatId: seat.id,
  responseData: perSource.splCurves[seat.id] || [],
}));

const batchP19 = computeOfficialPerSeatP19Assessment({
  perSeatPostEqCurves: batchPerSeatCurves,
  canonicalTargetCurve: null,
  assessmentStartHz: ASSESS_START_HZ,
  assessmentEndHz: ASSESS_END_HZ,
});

const perSourceP19 = computeOfficialPerSeatP19Assessment({
  perSeatPostEqCurves: perSourcePerSeatCurves,
  canonicalTargetCurve: null,
  assessmentStartHz: ASSESS_START_HZ,
  assessmentEndHz: ASSESS_END_HZ,
});

let maxP19Delta = 0;
for (const bp of batchP19) {
  const pp = perSourceP19.find((r) => r.seatId === bp.seatId);
  if (pp) {
    const delta = Math.abs(bp.variationDbRaw - pp.variationDbRaw);
    if (delta > maxP19Delta) maxP19Delta = delta;
  }
}

const batchP20 = computeOfficialP20Assessment({
  rspPostEqCurve: batch.splCurves['rsp'] || [],
  perSeatPostEqCurves: batchPerSeatCurves,
  assessmentStartHz: ASSESS_START_HZ,
  assessmentEndHz: ASSESS_END_HZ,
});

const perSourceP20 = computeOfficialP20Assessment({
  rspPostEqCurve: perSource.splCurves['rsp'] || [],
  perSeatPostEqCurves: perSourcePerSeatCurves,
  assessmentStartHz: ASSESS_START_HZ,
  assessmentEndHz: ASSESS_END_HZ,
});

let maxP20Delta = 0;
for (const bp of batchP20.perSeatResults || []) {
  const pp = (perSourceP20.perSeatResults || []).find((r) => r.seatId === bp.seatId);
  if (pp) {
    const delta = Math.abs(bp.variationDbRaw - pp.variationDbRaw);
    if (delta > maxP20Delta) maxP20Delta = delta;
  }
}

// ── Report ───────────────────────────────────────────────────────────────

console.log('=== P20 GRID PARITY FIX ACCEPTANCE ===');
console.log(`Frequency points: ${batchFreqs.length} (batch) vs ${perSourceFreqs?.length || 0} (per-source)`);
console.log(`Max frequency delta: ${maxFreqDelta.toExponential(4)} Hz`);
console.log('');
console.log(`CANONICAL GRID REUSED EXACTLY: ${canonicalGridReused ? 'PASS' : 'FAIL'}`);
console.log(`RSP P20 ≈ 0: ${rspMaxDelta < 0.001 ? 'PASS' : 'FAIL'} (max delta = ${rspMaxDelta.toExponential(4)} dB)`);
console.log(`MAX P19 SEAT DELTA: ${maxP19Delta.toExponential(4)} dB`);
console.log(`MAX P20 SEAT DELTA: ${maxP20Delta.toExponential(4)} dB`);
console.log(`LIMITER FREQUENCY PARITY: ${freqParity ? 'PASS' : 'FAIL'}`);
console.log('');

const allPass = canonicalGridReused && rspMaxDelta < 0.001 && freqParity;
if (allPass) {
  console.log('PARITY FIX ACCEPTED — safe to proceed to 20×20 / 30×30 / 40×40 benchmark.');
} else {
  console.log('PARITY FIX FAILED — do NOT benchmark yet.');
}