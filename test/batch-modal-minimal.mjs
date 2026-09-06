// batch-modal-minimal.mjs — Minimal batch evaluator smoke test (no production comparison).
// Run with: node --import ./test/_alias-register.mjs test/batch-modal-minimal.mjs

import { prepareModeBank } from '@/bass/core/rewBassEngine';
import { evaluateBatchModalTransfers } from '@/bass/core/batchModalEvaluator';
import { getSubwooferCurve, normaliseModelKey } from '@/components/models/speakers/registry';
import { getPerSubwooferAmplifierAuthority, DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W } from '@/components/utils/subwooferCapability';
import { BASS_NORMALIZED_PHYSICS_DEFAULTS } from '@/components/room/bass/bassPhysicsDefaults';
import { deriveCentreZ } from '@/components/utils/subwooferInstanceMigration';
import fs from 'node:fs';

const DATA = JSON.parse(fs.readFileSync(new URL('./_fresh-stage2-data.json', import.meta.url), 'utf8'));
const ROOM_DIMS = { widthM: 4, lengthM: 6.3, heightM: 2.4 };
const centreZ = deriveCentreZ({ bottomHeightM: 0.05, model: normaliseModelKey('sub4-12') });

const PHYSICS = {
  ...BASS_NORMALIZED_PHYSICS_DEFAULTS,
  rewSourceCurveMode: 'product',
  disableLateField: true,
  disableModalPropagationPhase: true,
};

const engineOptionsBase = {
  surfaceAbsorption: PHYSICS.surfaceAbsorption, freqMinHz: 15, freqMaxHz: 200,
  smoothing: 'none', axialQ: PHYSICS.axialQ, qStrategy: 'ab_corrected',
  abApplyModeMultiplicity: true, roomIsSealed: true, abMidbandQScale: 1, enableModes: true,
};

console.log('Preparing mode bank...');
const t0 = performance.now();
const precomputedModes = prepareModeBank(ROOM_DIMS, engineOptionsBase);
const t1 = performance.now();
console.log(`  Mode count: ${precomputedModes.length} (${(t1-t0).toFixed(0)} ms)`);

// Build 4 sources (one finalist)
const finalist = DATA.stage1.four_sub_result.finalists[0];
const sources = finalist.sources.map((s, i) => ({
  id: `src-${i+1}`, modelKey: 'sub4-12',
  subwooferAmplifierPowerW: DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W,
  x: s.xNorm * ROOM_DIMS.widthM, y: s.yNorm * ROOM_DIMS.lengthM, z: centreZ,
  tuning: { gainDb: 0, delayMs: 0, polarity: 0 },
}));

// Build 6 listeners
const seats = DATA.project.seating_positions.map(seat => ({
  id: seat.id, x: Number(seat.x), y: Number(seat.y), z: Number(seat.z ?? 1.2),
}));
const listeners = [{ id: 'rsp', x: 2, y: 3.15, z: 1.2 }, ...seats];

// Apply derating to source curves
const amplifierAuthority = getPerSubwooferAmplifierAuthority(sources);
const sourcesWithCurves = sources.map((src, si) => {
  const subCurve = getSubwooferCurve(src.modelKey);
  const deratingDb = amplifierAuthority.sourceAuthorities[si]?.deratingDb ?? 0;
  const deratedCurve = Number.isFinite(deratingDb) && deratingDb !== 0
    ? subCurve.map(p => {
        const spl = Number(p?.spl), db = Number(p?.db);
        if (Number.isFinite(spl)) return { ...p, spl: spl + deratingDb };
        if (Number.isFinite(db)) return { ...p, db: db + deratingDb };
        return { ...p };
      })
    : subCurve;
  return { ...src, sourceCurve: deratedCurve };
});

console.log('Running batch evaluator...');
const t2 = performance.now();
const result = evaluateBatchModalTransfers({
  roomDims: ROOM_DIMS, sources: sourcesWithCurves, listeners,
  precomputedModes, physics: PHYSICS, qStrategyOverride: 'ab_corrected',
  collectDiagnostics: true,
});
const t3 = performance.now();
console.log(`  Batch time: ${(t3-t2).toFixed(0)} ms`);
console.log(`  Transfers: ${result.perSourcePerListenerTransfers.length}`);
console.log(`  Frequencies: ${result.freqsHz.length}`);

// Print sample output
const firstTransfer = result.perSourcePerListenerTransfers[0];
console.log(`  First transfer: source=${firstTransfer.sourceIndex} listener=${firstTransfer.listenerId}`);
console.log(`  Sample points:`);
for (let i = 0; i < Math.min(5, firstTransfer.points.length); i++) {
  const p = firstTransfer.points[i];
  const mag = Math.hypot(p.re, p.im);
  const spl = 20 * Math.log10(Math.max(mag, 1e-10));
  console.log(`    ${p.frequency.toFixed(2)} Hz: re=${p.re.toExponential(4)} im=${p.im.toExponential(4)} mag=${mag.toExponential(4)} spl=${spl.toFixed(2)} dB`);
}

if (result.diagnostics) {
  const d = result.diagnostics;
  console.log('\nDiagnostics:');
  console.log(`  Modes: ${d.nModes}, Freqs: ${d.nFreqs}, Sources: ${d.nSources}, Listeners: ${d.nListeners}`);
  console.log(`  Timing:`);
  console.log(`    Mode-freq: ${d.timing.modeFreqMs.toFixed(1)} ms`);
  console.log(`    Source-mode: ${d.timing.sourceModeMs.toFixed(1)} ms`);
  console.log(`    Listener-mode: ${d.timing.listenerModeMs.toFixed(1)} ms`);
  console.log(`    Mode weights: ${d.timing.modeWeightMs.toFixed(1)} ms`);
  console.log(`    Source-freq: ${d.timing.sourceFreqMs.toFixed(1)} ms`);
  console.log(`    Transfer matrix: ${d.timing.transferMatrixMs.toFixed(1)} ms`);
  console.log(`    Total: ${d.timing.totalMs.toFixed(1)} ms`);
  const m = d.memory;
  const totalMB = (m.modeFreqRe + m.modeFreqIm + m.sourceModeCoupling + m.listenerModeCoupling + m.modeWeight + m.sourceFreqAmplitude + m.perSourcePerListenerTransfers) / (1024 * 1024);
  console.log(`  Memory: ${totalMB.toFixed(2)} MB`);
}

console.log('\nBATCH EVALUATOR SMOKE TEST COMPLETE');