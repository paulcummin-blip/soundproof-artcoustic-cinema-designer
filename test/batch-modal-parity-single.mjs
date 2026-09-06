// batch-modal-parity-single.mjs — Parity test for single finalist.
// Run with: node --import ./test/_alias-register.mjs test/batch-modal-parity-single.mjs

import { simulateAuthoritativeBassResponse } from '@/components/room/bass/authoritativeBassResponseEngine';
import { prepareModeBank } from '@/bass/core/rewBassEngine';
import { evaluateBatchModalTransfers } from '@/bass/core/batchModalEvaluator';
import { getPerSubwooferAmplifierAuthority, DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W } from '@/components/utils/subwooferCapability';
import { getSubwooferCurve, normaliseModelKey } from '@/components/models/speakers/registry';
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

const SEATING_POSITIONS = DATA.project.seating_positions.map(seat => ({
  id: seat.id, x: Number(seat.x), y: Number(seat.y), z: Number(seat.z ?? 1.2),
  priority: seat.priority || (seat.isPrimary ? 'primary' : 'secondary'),
}));
const RSP_POSITION = { id: 'rsp', x: 2, y: 3.15, z: 1.2, __isSyntheticRsp: true };
const LISTENERS = [RSP_POSITION, ...SEATING_POSITIONS];

const finalist = DATA.stage1.four_sub_result.finalists[0];
const sources = finalist.sources.map((s, i) => ({
  id: `stage2-src-${i + 1}`, modelKey: 'sub4-12',
  subwooferAmplifierPowerW: DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W,
  x: s.xNorm * ROOM_DIMS.widthM, y: s.yNorm * ROOM_DIMS.lengthM, z: centreZ,
  tuning: { gainDb: 0, delayMs: 0, polarity: 0 },
}));

const engineOptionsBase = {
  surfaceAbsorption: PHYSICS.surfaceAbsorption, freqMinHz: 15, freqMaxHz: 200,
  smoothing: 'none', axialQ: PHYSICS.axialQ, qStrategy: 'ab_corrected',
  abApplyModeMultiplicity: true, roomIsSealed: true, abMidbandQScale: 1, enableModes: true,
};
const precomputedModes = prepareModeBank(ROOM_DIMS, engineOptionsBase);
console.log(`Modes: ${precomputedModes.length}`);

// Production reference
console.log('Running production solver...');
const refStart = performance.now();
const prodResult = simulateAuthoritativeBassResponse({
  roomDims: ROOM_DIMS, seatingPositions: SEATING_POSITIONS, rspPosition: RSP_POSITION,
  sources, physics: PHYSICS, qStrategyOverride: 'ab_corrected', capturePerSourcePerSeat: true,
});
const refEnd = performance.now();
console.log(`  Production: ${(refEnd - refStart).toFixed(0)} ms`);

// Batch evaluator
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
const batchStart = performance.now();
const batchResult = evaluateBatchModalTransfers({
  roomDims: ROOM_DIMS, sources: sourcesWithCurves, listeners: LISTENERS,
  precomputedModes, physics: PHYSICS, qStrategyOverride: 'ab_corrected',
  collectDiagnostics: true,
});
const batchEnd = performance.now();
console.log(`  Batch: ${(batchEnd - batchStart).toFixed(0)} ms`);

// Compare
let maxReDelta = 0, maxImDelta = 0, maxSplDelta = 0, totalPoints = 0;
let worstRe = {}, worstSpl = {};
const nullRegionSplDeltas = [];

const prodTransfers = prodResult.perSourcePerSeatComplexTransfers || [];
for (const pt of prodTransfers) {
  const bt = batchResult.perSourcePerListenerTransfers.find(
    t => t.sourceIndex === pt.sourceIndex && t.listenerId === pt.seatId
  );
  if (!bt) { console.log(`  MISSING: src=${pt.sourceIndex} lis=${pt.seatId}`); continue; }
  for (let pi = 0; pi < pt.points.length; pi++) {
    const dRe = Math.abs((pt.points[pi].re ?? 0) - (bt.points[pi].re ?? 0));
    const dIm = Math.abs((pt.points[pi].im ?? 0) - (bt.points[pi].im ?? 0));
    const prodMag = Math.hypot(pt.points[pi].re ?? 0, pt.points[pi].im ?? 0);
    const batchMag = Math.hypot(bt.points[pi].re ?? 0, bt.points[pi].im ?? 0);
    const prodSpl = 20 * Math.log10(Math.max(prodMag, 1e-10));
    const batchSpl = 20 * Math.log10(Math.max(batchMag, 1e-10));
    const dSpl = Math.abs(prodSpl - batchSpl);
    totalPoints++;
    if (dRe > maxReDelta) { maxReDelta = dRe; worstRe = { s: pt.sourceIndex, l: pt.seatId, f: pt.points[pi].frequency, prod: pt.points[pi].re, batch: bt.points[pi].re }; }
    if (dIm > maxImDelta) maxImDelta = dIm;
    if (dSpl > maxSplDelta) { maxSplDelta = dSpl; worstSpl = { s: pt.sourceIndex, l: pt.seatId, f: pt.points[pi].frequency, prod: prodSpl, batch: batchSpl }; }
    if (prodSpl < -20) nullRegionSplDeltas.push({ dSpl, prodSpl, batchSpl, freq: pt.points[pi].frequency, s: pt.sourceIndex, l: pt.seatId });
  }
}
nullRegionSplDeltas.sort((a, b) => b.dSpl - a.dSpl);

console.log(`\n=== PARITY RESULTS ===`);
console.log(`  Points: ${totalPoints}`);
console.log(`  Max Re delta: ${maxReDelta.toExponential(4)}`);
console.log(`  Max Im delta: ${maxImDelta.toExponential(4)}`);
console.log(`  Max SPL delta: ${maxSplDelta.toExponential(4)} dB`);
console.log(`  Worst Re: src=${worstRe.s} lis=${worstRe.l} freq=${worstRe.f?.toFixed(2)} prod=${worstRe.prod?.toExponential(3)} batch=${worstRe.batch?.toExponential(3)}`);
console.log(`  Worst SPL: src=${worstSpl.s} lis=${worstSpl.l} freq=${worstSpl.f?.toFixed(2)} prod=${worstSpl.prod?.toFixed(2)} batch=${worstSpl.batch?.toFixed(2)}`);
console.log(`  Null-region points (SPL<-20): ${nullRegionSplDeltas.length}`);
if (nullRegionSplDeltas.length > 0) {
  const w = nullRegionSplDeltas[0];
  console.log(`  Worst null-region SPL delta: ${w.dSpl.toExponential(4)} dB at ${w.freq.toFixed(2)} Hz (prod=${w.prodSpl.toFixed(2)} batch=${w.batchSpl.toFixed(2)})`);
  for (const d of nullRegionSplDeltas.slice(0, 3)) {
    console.log(`    ${d.dSpl.toExponential(4)} dB at ${d.freq.toFixed(2)} Hz (prod=${d.prodSpl.toFixed(2)} batch=${d.batchSpl.toFixed(2)} src=${d.s} lis=${d.l})`);
  }
}

console.log(`\n=== PERFORMANCE ===`);
console.log(`  Production (1 finalist): ${(refEnd - refStart).toFixed(0)} ms`);
console.log(`  Batch (1 finalist): ${(batchEnd - batchStart).toFixed(0)} ms`);
console.log(`  Speedup: ${((refEnd - refStart) / (batchEnd - batchStart)).toFixed(1)}x`);
console.log(`  Est. 5-finalist production: ${((refEnd - refStart) * 5).toFixed(0)} ms`);
console.log(`  Est. 5-finalist batch: ${(batchEnd - batchStart).toFixed(0)} ms (shared basis)`);
console.log(`  Est. 5-finalist speedup: ${((refEnd - refStart) * 5 / (batchEnd - batchStart)).toFixed(1)}x`);

if (batchResult.diagnostics) {
  const m = batchResult.diagnostics.memory;
  const totalMB = (m.modeFreqRe + m.modeFreqIm + m.sourceModeCoupling + m.listenerModeCoupling + m.modeWeight + m.sourceFreqAmplitude + m.perSourcePerListenerTransfers) / (1024 * 1024);
  console.log(`\n=== MEMORY ===`);
  console.log(`  Total: ${totalMB.toFixed(2)} MB`);
}

const parityPass = maxReDelta < 1e-6 && maxImDelta < 1e-6 && maxSplDelta < 0.01;
const perfPass = ((refEnd - refStart) / (batchEnd - batchStart)) > 3;
console.log(`\n=== VERDICT ===`);
console.log(`  PARITY: ${parityPass ? 'PASS' : 'FAIL'} (Re<1e-6: ${maxReDelta < 1e-6}, Im<1e-6: ${maxImDelta < 1e-6}, SPL<0.01dB: ${maxSplDelta < 0.01})`);
console.log(`  PERFORMANCE: ${perfPass ? 'PASS' : 'FAIL'} (${((refEnd - refStart) / (batchEnd - batchStart)).toFixed(1)}x)`);
console.log(`\n${parityPass && perfPass ? 'EXACT BATCH MODAL PROTOTYPE PASSED — SAFE TO INTEGRATE' : parityPass ? 'PARITY OK BUT NOT BENEFICIAL — DO NOT INTEGRATE' : 'EXACT BATCH MODAL PROTOTYPE FAILED — DO NOT INTEGRATE'}`);