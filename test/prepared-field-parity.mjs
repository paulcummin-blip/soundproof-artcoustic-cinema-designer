// prepared-field-parity.mjs
// Low-level parity test: OLD (evaluateBatchModalTransfers) vs NEW
// (prepareSourceRoomField + evaluateReceiversFromPreparedField).
//
// Verifies:
//   1. max absolute complex-transfer delta
//   2. max dB delta
//   3. source count parity
//   4. receiver count parity
//   5. frequency-bin count parity
//   6. source/seat identity parity
//   7. prepared-field invariance between -400 mm and +400 mm receiver layouts
//   8. receiver outputs differ appropriately when listeners move
//
// Run: node --import ./test/_alias-register.mjs test/prepared-field-parity.mjs

import {
  evaluateBatchModalTransfers,
  prepareSourceRoomField,
  evaluateReceiversFromPreparedField,
} from '@/bass/core/batchModalEvaluator';
import { prepareModeBank } from '@/bass/core/rewBassEngine';
import { getSubwooferCurve, normaliseModelKey } from '@/components/models/speakers/registry';
import { BASS_NORMALIZED_PHYSICS_DEFAULTS } from '@/components/room/bass/bassPhysicsDefaults';
import { deriveCentreZ } from '@/components/utils/subwooferInstanceMigration';
import { getPerSubwooferAmplifierAuthority, DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W } from '@/components/utils/subwooferCapability';

// ── Test data (same room as batch-modal-parity.mjs) ──────────────────────

const ROOM_DIMS = { widthM: 4, lengthM: 6.3, heightM: 2.4 };
const SELECTED_SUB_MODEL = 'sub4-12';
const SUBWOOFER_BOTTOM_HEIGHT_M = 0.05;
const AMPLIFIER_POWER_PER_SUB_W = DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W;

// 4-sub finalist: front-left, front-right, rear-left, rear-right (normalised)
const FINALIST_SOURCES = [
  { xNorm: 0.20, yNorm: 0.15 },
  { xNorm: 0.80, yNorm: 0.15 },
  { xNorm: 0.20, yNorm: 0.85 },
  { xNorm: 0.80, yNorm: 0.85 },
];

const RSP_BASE = {
  id: 'rsp',
  x: ROOM_DIMS.widthM / 2,
  y: ROOM_DIMS.lengthM / 2,
  z: 1.2,
  __isSyntheticRsp: true,
};

// 5 seats around the RSP
const SEATING_POSITIONS_BASE = [
  { id: 'seat-1', x: 2.0, y: 3.15, z: 1.2 },
  { id: 'seat-2', x: 1.4, y: 3.65, z: 1.2 },
  { id: 'seat-3', x: 2.6, y: 3.65, z: 1.2 },
  { id: 'seat-4', x: 1.4, y: 2.65, z: 1.2 },
  { id: 'seat-5', x: 2.6, y: 2.65, z: 1.2 },
];

const PHYSICS = {
  ...BASS_NORMALIZED_PHYSICS_DEFAULTS,
  rewSourceCurveMode: 'product',
  disableLateField: true,
  disableModalPropagationPhase: true,
};

// ── Build sources (matching production Stage 2) ──────────────────────────

function buildSources() {
  const modelKey = normaliseModelKey(SELECTED_SUB_MODEL);
  const centreZ = deriveCentreZ({ bottomHeightM: SUBWOOFER_BOTTOM_HEIGHT_M, model: modelKey });
  const rawSources = FINALIST_SOURCES.map((s, i) => ({
    id: `stage2-src-${i + 1}`,
    modelKey,
    subwooferAmplifierPowerW: AMPLIFIER_POWER_PER_SUB_W,
    x: s.xNorm * ROOM_DIMS.widthM,
    y: s.yNorm * ROOM_DIMS.lengthM,
    z: centreZ,
    yNorm: s.yNorm,
    xNorm: s.xNorm,
    tuning: { gainDb: 0, delayMs: 0, polarity: 0 },
    autoAlignDelayMs: 0,
  }));

  const amplifierAuthority = getPerSubwooferAmplifierAuthority(rawSources);
  return rawSources.map((src, si) => {
    const subCurve = getSubwooferCurve(src.modelKey);
    const deratingDb = amplifierAuthority.sourceAuthorities[si]?.deratingDb ?? 0;
    const deratedCurve = (Number.isFinite(deratingDb) && deratingDb !== 0)
      ? subCurve.map((p) => ({ ...p, spl: Number(p.spl) + deratingDb }))
      : subCurve;
    return { ...src, sourceCurve: deratedCurve };
  });
}

// ── Build mode bank (shared) ─────────────────────────────────────────────

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

// ── Helpers ──────────────────────────────────────────────────────────────

function shiftListeners(listeners, offsetM) {
  return listeners.map((l) => ({ ...l, y: l.y + offsetM }));
}

function complexMagDb(re, im) {
  const mag = Math.sqrt(re * re + im * im);
  return 20 * Math.log10(Math.max(mag, 1e-12));
}

function compareTransfers(oldTransfers, newTransfers, label) {
  let maxReDelta = 0;
  let maxImDelta = 0;
  let maxAbsDelta = 0;
  let maxDbDelta = 0;
  let worstPoint = null;
  let compared = 0;

  for (let i = 0; i < oldTransfers.length; i++) {
    const oldT = oldTransfers[i];
    const newT = newTransfers[i];
    if (oldT.sourceIndex !== newT.sourceIndex) {
      throw new Error(`${label}: sourceIndex mismatch at ${i}: ${oldT.sourceIndex} vs ${newT.sourceIndex}`);
    }
    if (oldT.listenerId !== newT.listenerId) {
      throw new Error(`${label}: listenerId mismatch at ${i}: ${oldT.listenerId} vs ${newT.listenerId}`);
    }
    if (oldT.points.length !== newT.points.length) {
      throw new Error(`${label}: point count mismatch at ${i}: ${oldT.points.length} vs ${newT.points.length}`);
    }
    for (let fi = 0; fi < oldT.points.length; fi++) {
      const reDelta = Math.abs(oldT.points[fi].re - newT.points[fi].re);
      const imDelta = Math.abs(oldT.points[fi].im - newT.points[fi].im);
      const absDelta = Math.sqrt(reDelta * reDelta + imDelta * imDelta);
      const oldDb = complexMagDb(oldT.points[fi].re, oldT.points[fi].im);
      const newDb = complexMagDb(newT.points[fi].re, newT.points[fi].im);
      const dbDelta = Math.abs(oldDb - newDb);
      if (absDelta > maxAbsDelta) {
        maxAbsDelta = absDelta;
        maxReDelta = reDelta;
        maxImDelta = imDelta;
        worstPoint = { source: oldT.sourceIndex, listener: oldT.listenerId, freq: oldT.points[fi].frequency, reDelta, imDelta };
      }
      if (dbDelta > maxDbDelta) maxDbDelta = dbDelta;
      compared++;
    }
  }
  return { maxReDelta, maxImDelta, maxAbsDelta, maxDbDelta, worstPoint, compared };
}

// ── TEST ─────────────────────────────────────────────────────────────────

const sources = buildSources();
const listeners0 = [RSP_BASE, ...SEATING_POSITIONS_BASE];

console.log('═'.repeat(72));
console.log('  PREPARED-FIELD LOW-LEVEL PARITY TEST');
console.log('  OLD: evaluateBatchModalTransfers(...)');
console.log('  NEW: prepareSourceRoomField(...) + evaluateReceiversFromPreparedField(...)');
console.log('═'.repeat(72));
console.log('');

// ── 1. Run OLD path (single call, all listeners) ─────────────────────────

const oldResult = evaluateBatchModalTransfers({
  roomDims: ROOM_DIMS,
  sources,
  listeners: listeners0,
  precomputedModes,
  physics: PHYSICS,
  qStrategyOverride: 'ab_corrected',
  freqMinHz: 15,
  freqMaxHz: 200,
});

// ── 2. Run NEW path (prepare once, evaluate receivers) ───────────────────

const preparedField = prepareSourceRoomField({
  roomDims: ROOM_DIMS,
  sources,
  precomputedModes,
  physics: PHYSICS,
  qStrategyOverride: 'ab_corrected',
  freqMinHz: 15,
  freqMaxHz: 200,
});

const newResult = evaluateReceiversFromPreparedField(preparedField, listeners0);

// ── 3. Compare ───────────────────────────────────────────────────────────

console.log('── 1. Max absolute complex-transfer delta ────────────────────────────');
const cmp = compareTransfers(
  oldResult.perSourcePerListenerTransfers,
  newResult.perSourcePerListenerTransfers,
  'OLD-vs-NEW',
);
console.log(`  max |Δre|     = ${cmp.maxReDelta.toExponential(3)}`);
console.log(`  max |Δim|     = ${cmp.maxImDelta.toExponential(3)}`);
console.log(`  max |Δcomplex| = ${cmp.maxAbsDelta.toExponential(3)}`);
console.log(`  points compared = ${cmp.compared}`);
if (cmp.worstPoint) {
  console.log(`  worst: src=${cmp.worstPoint.source} seat=${cmp.worstPoint.listener} freq=${cmp.worstPoint.freq.toFixed(1)}Hz`);
}
console.log('');

console.log('── 2. Max dB delta ────────────────────────────────────────────────────');
console.log(`  max |ΔdB|     = ${cmp.maxDbDelta.toExponential(3)}`);
console.log('');

console.log('── 3. Source count parity ─────────────────────────────────────────────');
const oldSrcCount = new Set(oldResult.perSourcePerListenerTransfers.map((t) => t.sourceIndex)).size;
const newSrcCount = new Set(newResult.perSourcePerListenerTransfers.map((t) => t.sourceIndex)).size;
console.log(`  OLD unique sources = ${oldSrcCount}`);
console.log(`  NEW unique sources = ${newSrcCount}`);
console.log(`  parity: ${oldSrcCount === newSrcCount ? 'PASS' : 'FAIL'}`);
console.log('');

console.log('── 4. Receiver count parity ──────────────────────────────────────────');
const oldRcvCount = new Set(oldResult.perSourcePerListenerTransfers.map((t) => t.listenerId)).size;
const newRcvCount = new Set(newResult.perSourcePerListenerTransfers.map((t) => t.listenerId)).size;
console.log(`  OLD unique receivers = ${oldRcvCount}`);
console.log(`  NEW unique receivers = ${newRcvCount}`);
console.log(`  parity: ${oldRcvCount === newRcvCount ? 'PASS' : 'FAIL'}`);
console.log('');

console.log('── 5. Frequency-bin count parity ─────────────────────────────────────');
const oldFreqCount = oldResult.freqsHz.length;
const newFreqCount = newResult.freqsHz.length;
console.log(`  OLD freq bins = ${oldFreqCount}`);
console.log(`  NEW freq bins = ${newFreqCount}`);
console.log(`  parity: ${oldFreqCount === newFreqCount ? 'PASS' : 'FAIL'}`);
console.log('');

console.log('── 6. Source/seat identity parity ────────────────────────────────────');
const oldIds = oldResult.perSourcePerListenerTransfers.map((t) => `${t.sourceIndex}:${t.listenerId}`).sort().join(',');
const newIds = newResult.perSourcePerListenerTransfers.map((t) => `${t.sourceIndex}:${t.listenerId}`).sort().join(',');
console.log(`  OLD identities: ${oldIds.slice(0, 80)}...`);
console.log(`  NEW identities: ${newIds.slice(0, 80)}...`);
console.log(`  parity: ${oldIds === newIds ? 'PASS' : 'FAIL'}`);
console.log('');

// ── 7. Prepared-field invariance between -400 mm and +400 mm ─────────────

console.log('── 7. Prepared-field invariance (-400mm vs +400mm receiver layouts) ───');
const listenersMinus = shiftListeners(listeners0, -0.4);
const listenersPlus = shiftListeners(listeners0, +0.4);

const preparedMinus = prepareSourceRoomField({
  roomDims: ROOM_DIMS,
  sources,
  precomputedModes,
  physics: PHYSICS,
  qStrategyOverride: 'ab_corrected',
  freqMinHz: 15,
  freqMaxHz: 200,
});
const preparedPlus = prepareSourceRoomField({
  roomDims: ROOM_DIMS,
  sources,
  precomputedModes,
  physics: PHYSICS,
  qStrategyOverride: 'ab_corrected',
  freqMinHz: 15,
  freqMaxHz: 200,
});

let fieldMaxDelta = 0;
let fieldCompared = 0;
for (let mi = 0; mi < preparedMinus.modeFreq.re.length; mi++) {
  const d = Math.abs(preparedMinus.modeFreq.re[mi] - preparedPlus.modeFreq.re[mi]);
  if (d > fieldMaxDelta) fieldMaxDelta = d;
  fieldCompared++;
}
for (let mi = 0; mi < preparedMinus.modeFreq.im.length; mi++) {
  const d = Math.abs(preparedMinus.modeFreq.im[mi] - preparedPlus.modeFreq.im[mi]);
  if (d > fieldMaxDelta) fieldMaxDelta = d;
}
// sourceModeCoupling
for (let si = 0; si < preparedMinus.sourceModeCoupling.length; si++) {
  const d = Math.abs(preparedMinus.sourceModeCoupling[si] - preparedPlus.sourceModeCoupling[si]);
  if (d > fieldMaxDelta) fieldMaxDelta = d;
  fieldCompared++;
}
// modeWeight
for (let mi = 0; mi < preparedMinus.modeWeight.length; mi++) {
  const d = Math.abs(preparedMinus.modeWeight[mi] - preparedPlus.modeWeight[mi]);
  if (d > fieldMaxDelta) fieldMaxDelta = d;
  fieldCompared++;
}
// sourceFreqAmplitude
for (let si = 0; si < preparedMinus.sourceFreqAmplitude.length; si++) {
  for (let fi = 0; fi < preparedMinus.sourceFreqAmplitude[si].length; fi++) {
    const d = Math.abs(preparedMinus.sourceFreqAmplitude[si][fi] - preparedPlus.sourceFreqAmplitude[si][fi]);
    if (d > fieldMaxDelta) fieldMaxDelta = d;
    fieldCompared++;
  }
}
// sourceTuningCos/Sin
for (let si = 0; si < preparedMinus.sourceTuningCos.length; si++) {
  for (let fi = 0; fi < preparedMinus.sourceTuningCos[si].length; fi++) {
    const dCos = Math.abs(preparedMinus.sourceTuningCos[si][fi] - preparedPlus.sourceTuningCos[si][fi]);
    const dSin = Math.abs(preparedMinus.sourceTuningSin[si][fi] - preparedPlus.sourceTuningSin[si][fi]);
    if (dCos > fieldMaxDelta) fieldMaxDelta = dCos;
    if (dSin > fieldMaxDelta) fieldMaxDelta = dSin;
    fieldCompared += 2;
  }
}
console.log(`  field terms compared = ${fieldCompared}`);
console.log(`  max |Δfield|  = ${fieldMaxDelta.toExponential(3)}`);
console.log(`  invariance: ${fieldMaxDelta < 1e-15 ? 'PASS (exact)' : 'FAIL'}`);
console.log('');

// ── 8. Receiver outputs differ appropriately ──────────────────────────────

console.log('── 8. Receiver outputs differ appropriately (-400mm vs +400mm) ─────────');
const recvMinus = evaluateReceiversFromPreparedField(preparedMinus, listenersMinus);
const recvPlus = evaluateReceiversFromPreparedField(preparedPlus, listenersPlus);

let recvMaxDelta = 0;
let recvMinDelta = Infinity;
let recvCompared = 0;
let identicalCount = 0;
for (let i = 0; i < recvMinus.perSourcePerListenerTransfers.length; i++) {
  const tm = recvMinus.perSourcePerListenerTransfers[i];
  const tp = recvPlus.perSourcePerListenerTransfers[i];
  for (let fi = 0; fi < tm.points.length; fi++) {
    const d = Math.sqrt(
      (tm.points[fi].re - tp.points[fi].re) ** 2 +
      (tm.points[fi].im - tp.points[fi].im) ** 2
    );
    if (d > recvMaxDelta) recvMaxDelta = d;
    if (d < recvMinDelta) recvMinDelta = d;
    if (d < 1e-15) identicalCount++;
    recvCompared++;
  }
}
console.log(`  receiver points compared = ${recvCompared}`);
console.log(`  max |Δcomplex| = ${recvMaxDelta.toExponential(3)}`);
console.log(`  min |Δcomplex| = ${recvMinDelta.toExponential(3)}`);
console.log(`  identical points (< 1e-15) = ${identicalCount} / ${recvCompared}`);
console.log(`  differ appropriately: ${recvMaxDelta > 1e-6 && identicalCount < recvCompared ? 'PASS' : 'FAIL'}`);
console.log('');

// ── VERDICT ───────────────────────────────────────────────────────────────

console.log('═'.repeat(72));
const parityPass = cmp.maxAbsDelta < 1e-12 && cmp.maxDbDelta < 1e-10;
const countsPass = oldSrcCount === newSrcCount && oldRcvCount === newRcvCount && oldFreqCount === newFreqCount;
const identityPass = oldIds === newIds;
const invariancePass = fieldMaxDelta < 1e-15;
const differPass = recvMaxDelta > 1e-6 && identicalCount < recvCompared;

if (parityPass && countsPass && identityPass && invariancePass && differPass) {
  console.log('  PREPARED-FIELD LOW-LEVEL PARITY PASSED — SAFE TO ADD SEATING BATCH');
} else {
  console.log('  PREPARED-FIELD PARITY FAILED — blocker:');
  if (!parityPass) console.log(`    - complex transfer delta too large: ${cmp.maxAbsDelta.toExponential(3)}`);
  if (!countsPass) console.log('    - source/receiver/freq count mismatch');
  if (!identityPass) console.log('    - source/seat identity mismatch');
  if (!invariancePass) console.log(`    - prepared field not invariant: ${fieldMaxDelta.toExponential(3)}`);
  if (!differPass) console.log('    - receiver outputs do not differ appropriately');
}
console.log('═'.repeat(72));

process.exitCode = (parityPass && countsPass && identityPass && invariancePass && differPass) ? 0 : 1;