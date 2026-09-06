// batch-modal-ultra-minimal.mjs — Test just the core modal imports.
// Run with: node --import ./test/_alias-register.mjs test/batch-modal-ultra-minimal.mjs

console.log('Starting ultra-minimal test...');
const t0 = performance.now();

console.log('Importing modalCalculations...');
const { modeShapeValueLocal, computeRoomModesLocal } = await import('@/bass/core/modalCalculations');
const t1 = performance.now();
console.log(`  modalCalculations imported: ${(t1-t0).toFixed(0)} ms`);

console.log('Importing rewCorePrimitives...');
const { buildFrequencyAxis, interpolateCurveDb } = await import('@/bass/core/rewCorePrimitives');
const t2 = performance.now();
console.log(`  rewCorePrimitives imported: ${(t2-t1).toFixed(0)} ms`);

console.log('Importing rewBassEngine...');
const { prepareModeBank } = await import('@/bass/core/rewBassEngine');
const t3 = performance.now();
console.log(`  rewBassEngine imported: ${(t3-t2).toFixed(0)} ms`);

console.log('Importing batchModalEvaluator...');
const { evaluateBatchModalTransfers } = await import('@/bass/core/batchModalEvaluator');
const t4 = performance.now();
console.log(`  batchModalEvaluator imported: ${(t4-t3).toFixed(0)} ms`);

console.log('Preparing mode bank...');
const ROOM_DIMS = { widthM: 4, lengthM: 6.3, heightM: 2.4 };
const modes = prepareModeBank(ROOM_DIMS, {
  surfaceAbsorption: { front: 0.3, back: 0.3, left: 0.3, right: 0.3, ceiling: 0.3, floor: 0.3 },
  freqMinHz: 15, freqMaxHz: 200, smoothing: 'none', axialQ: 4,
  qStrategy: 'ab_corrected', abApplyModeMultiplicity: true, roomIsSealed: true,
  abMidbandQScale: 1, enableModes: true,
});
const t5 = performance.now();
console.log(`  Mode count: ${modes.length} (${(t5-t4).toFixed(0)} ms)`);

// Build a simple flat source curve (94 dB flat)
const flatCurve = [{ hz: 15, db: 94 }, { hz: 200, db: 94 }];

// Build 4 sources
const sources = [
  { id: 's1', x: 0, y: 0, z: 0.9, tuning: { gainDb: 0, delayMs: 0, polarity: 0 }, sourceCurve: flatCurve },
  { id: 's2', x: 4, y: 0, z: 0.9, tuning: { gainDb: 0, delayMs: 0, polarity: 0 }, sourceCurve: flatCurve },
  { id: 's3', x: 0, y: 6.3, z: 0.9, tuning: { gainDb: 0, delayMs: 0, polarity: 0 }, sourceCurve: flatCurve },
  { id: 's4', x: 4, y: 6.3, z: 0.9, tuning: { gainDb: 0, delayMs: 0, polarity: 0 }, sourceCurve: flatCurve },
];

// Build 6 listeners
const listeners = [
  { id: 'rsp', x: 2, y: 3.15, z: 1.2 },
  { id: 'seat1', x: 1.6, y: 2.59, z: 1.2 },
  { id: 'seat2', x: 2.4, y: 2.59, z: 1.2 },
  { id: 'seat3', x: 1.2, y: 4.39, z: 1.5 },
  { id: 'seat4', x: 2.0, y: 4.39, z: 1.5 },
  { id: 'seat5', x: 2.8, y: 4.39, z: 1.5 },
];

console.log('Running batch evaluator...');
const t6 = performance.now();
const result = evaluateBatchModalTransfers({
  roomDims: ROOM_DIMS, sources, listeners,
  precomputedModes: modes,
  physics: { rewSourceCurveMode: 'product' },
  qStrategyOverride: 'ab_corrected',
  collectDiagnostics: true,
});
const t7 = performance.now();
console.log(`  Batch time: ${(t7-t6).toFixed(0)} ms`);
console.log(`  Transfers: ${result.perSourcePerListenerTransfers.length}`);
console.log(`  Frequencies: ${result.freqsHz.length}`);

const first = result.perSourcePerListenerTransfers[0];
console.log(`  First transfer (src=0, lis=rsp) sample:`);
for (let i = 0; i < Math.min(3, first.points.length); i++) {
  const p = first.points[i];
  const mag = Math.hypot(p.re, p.im);
  console.log(`    ${p.frequency.toFixed(2)} Hz: re=${p.re.toExponential(4)} im=${p.im.toExponential(4)} spl=${(20*Math.log10(Math.max(mag,1e-10))).toFixed(2)} dB`);
}

if (result.diagnostics) {
  const d = result.diagnostics;
  console.log(`\n  Modes: ${d.nModes}, Freqs: ${d.nFreqs}`);
  console.log(`  Timing: modeFreq=${d.timing.modeFreqMs.toFixed(1)}ms sourceMode=${d.timing.sourceModeMs.toFixed(1)}ms listenerMode=${d.timing.listenerModeMs.toFixed(1)}ms transferMatrix=${d.timing.transferMatrixMs.toFixed(1)}ms total=${d.timing.totalMs.toFixed(1)}ms`);
  const m = d.memory;
  const totalMB = (m.modeFreqRe + m.modeFreqIm + m.sourceModeCoupling + m.listenerModeCoupling + m.modeWeight + m.sourceFreqAmplitude + m.perSourcePerListenerTransfers) / (1024 * 1024);
  console.log(`  Memory: ${totalMB.toFixed(2)} MB`);
}

console.log('\nULTRA-MINIMAL TEST COMPLETE');