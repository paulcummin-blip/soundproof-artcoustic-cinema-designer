// batch-modal-run.mjs — Batch evaluator test with static imports.
// Run with: node --import ./test/_alias-register.mjs test/batch-modal-run.mjs

import { prepareModeBank } from '@/bass/core/rewBassEngine';
import { evaluateBatchModalTransfers } from '@/bass/core/batchModalEvaluator';
import { modeShapeValueLocal, computeRoomModesLocal } from '@/bass/core/modalCalculations';
import { buildFrequencyAxis, interpolateCurveDb } from '@/bass/core/rewCorePrimitives';

console.log('Imports loaded.');

const ROOM_DIMS = { widthM: 4, lengthM: 6.3, heightM: 2.4 };

const t0 = performance.now();
const modes = prepareModeBank(ROOM_DIMS, {
  surfaceAbsorption: { front: 0.3, back: 0.3, left: 0.3, right: 0.3, ceiling: 0.3, floor: 0.3 },
  freqMinHz: 15, freqMaxHz: 200, smoothing: 'none', axialQ: 4,
  qStrategy: 'ab_corrected', abApplyModeMultiplicity: true, roomIsSealed: true,
  abMidbandQScale: 1, enableModes: true,
});
const t1 = performance.now();
console.log(`Mode bank: ${modes.length} modes in ${(t1-t0).toFixed(0)} ms`);

const flatCurve = [{ hz: 15, db: 94 }, { hz: 200, db: 94 }];
const sources = [
  { id: 's1', x: 0, y: 0, z: 0.9, tuning: { gainDb: 0, delayMs: 0, polarity: 0 }, sourceCurve: flatCurve },
  { id: 's2', x: 4, y: 0, z: 0.9, tuning: { gainDb: 0, delayMs: 0, polarity: 0 }, sourceCurve: flatCurve },
  { id: 's3', x: 0, y: 6.3, z: 0.9, tuning: { gainDb: 0, delayMs: 0, polarity: 0 }, sourceCurve: flatCurve },
  { id: 's4', x: 4, y: 6.3, z: 0.9, tuning: { gainDb: 0, delayMs: 0, polarity: 0 }, sourceCurve: flatCurve },
];
const listeners = [
  { id: 'rsp', x: 2, y: 3.15, z: 1.2 },
  { id: 'seat1', x: 1.6, y: 2.59, z: 1.2 },
  { id: 'seat2', x: 2.4, y: 2.59, z: 1.2 },
  { id: 'seat3', x: 1.2, y: 4.39, z: 1.5 },
  { id: 'seat4', x: 2.0, y: 4.39, z: 1.5 },
  { id: 'seat5', x: 2.8, y: 4.39, z: 1.5 },
];

const t2 = performance.now();
const result = evaluateBatchModalTransfers({
  roomDims: ROOM_DIMS, sources, listeners, precomputedModes: modes,
  physics: { rewSourceCurveMode: 'product' }, qStrategyOverride: 'ab_corrected',
  collectDiagnostics: true,
});
const t3 = performance.now();
console.log(`Batch: ${(t3-t2).toFixed(0)} ms, ${result.perSourcePerListenerTransfers.length} transfers, ${result.freqsHz.length} freqs`);

const first = result.perSourcePerListenerTransfers[0];
console.log(`First transfer (src=0, lis=${first.listenerId}):`);
for (let i = 0; i < Math.min(5, first.points.length); i++) {
  const p = first.points[i];
  const mag = Math.hypot(p.re, p.im);
  console.log(`  ${p.frequency.toFixed(2)} Hz: re=${p.re.toExponential(4)} im=${p.im.toExponential(4)} spl=${(20*Math.log10(Math.max(mag,1e-10))).toFixed(2)} dB`);
}

if (result.diagnostics) {
  const d = result.diagnostics;
  console.log(`\nDiagnostics:`);
  console.log(`  Modes: ${d.nModes}, Freqs: ${d.nFreqs}, Sources: ${d.nSources}, Listeners: ${d.nListeners}`);
  console.log(`  Timing: modeFreq=${d.timing.modeFreqMs.toFixed(1)}ms srcMode=${d.timing.sourceModeMs.toFixed(1)}ms lisMode=${d.timing.listenerModeMs.toFixed(1)}ms xfer=${d.timing.transferMatrixMs.toFixed(1)}ms total=${d.timing.totalMs.toFixed(1)}ms`);
  const m = d.memory;
  const totalMB = (m.modeFreqRe + m.modeFreqIm + m.sourceModeCoupling + m.listenerModeCoupling + m.modeWeight + m.sourceFreqAmplitude + m.perSourcePerListenerTransfers) / (1024 * 1024);
  console.log(`  Memory: ${totalMB.toFixed(2)} MB`);
}

console.log('\nDONE');