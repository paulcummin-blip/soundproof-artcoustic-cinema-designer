// batch-modal-quick.mjs — Quick parity + performance test (single finalist).
// Run with: node --import ./test/_alias-register.mjs test/batch-modal-quick.mjs

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
const SELECTED_SUB_MODEL = 'sub4-12';
const SUBWOOFER_BOTTOM_HEIGHT_M = 0.05;
const AMPLIFIER_POWER_PER_SUB_W = DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W;

const FINALISTS = DATA.stage1.four_sub_result.finalists;
const SEATING_POSITIONS = DATA.project.seating_positions.map(seat => ({
  id: seat.id, x: Number(seat.x), y: Number(seat.y), z: Number(seat.z ?? 1.2),
  priority: seat.priority || (seat.isPrimary ? 'primary' : 'secondary'),
}));
const RSP_POSITION = { id: 'rsp', x: 2, y: 3.15, z: 1.2, __isSyntheticRsp: true };
const LISTENERS = [RSP_POSITION, ...SEATING_POSITIONS];

const PHYSICS = {
  ...BASS_NORMALIZED_PHYSICS_DEFAULTS,
  rewSourceCurveMode: 'product',
  disableLateField: true,
  disableModalPropagationPhase: true,
};

const centreZ = deriveCentreZ({ bottomHeightM: SUBWOOFER_BOTTOM_HEIGHT_M, model: normaliseModelKey(SELECTED_SUB_MODEL) });

function buildSourcesForFinalist(finalist) {
  const modelKey = normaliseModelKey(SELECTED_SUB_MODEL);
  return finalist.sources.map((s, i) => ({
    id: `stage2-src-${i + 1}`, modelKey,
    subwooferAmplifierPowerW: AMPLIFIER_POWER_PER_SUB_W,
    x: s.xNorm * ROOM_DIMS.widthM, y: s.yNorm * ROOM_DIMS.lengthM, z: centreZ,
    tuning: { gainDb: 0, delayMs: 0, polarity: 0 },
  }));
}

function applyDeratingToCurve(rawCurve, deratingDb) {
  if (!Number.isFinite(deratingDb) || deratingDb === 0) return rawCurve;
  return rawCurve.map(p => {
    const spl = Number(p?.spl), db = Number(p?.db);
    if (Number.isFinite(spl)) return { ...p, spl: spl + deratingDb };
    if (Number.isFinite(db)) return { ...p, db: db + deratingDb };
    return { ...p };
  });
}

const engineOptionsBase = {
  surfaceAbsorption: PHYSICS.surfaceAbsorption, freqMinHz: 15, freqMaxHz: 200,
  smoothing: 'none', axialQ: PHYSICS.axialQ, qStrategy: 'ab_corrected',
  abApplyModeMultiplicity: true, roomIsSealed: true, abMidbandQScale: 1, enableModes: true,
};
const precomputedModes = prepareModeBank(ROOM_DIMS, engineOptionsBase);
console.log(`Mode count: ${precomputedModes.length}`);

// ── PARITY: Single finalist (4 sources × 6 listeners = 24 transfers) ─────

console.log('\n=== PARITY (Finalist 0: RP22_E) ===');
const finalist = FINALISTS[0];
const sources = buildSourcesForFinalist(finalist);

const refStart = performance.now();
const prodResult = simulateAuthoritativeBassResponse({
  roomDims: ROOM_DIMS, seatingPositions: SEATING_POSITIONS, rspPosition: RSP_POSITION,
  sources, physics: PHYSICS, qStrategyOverride: 'ab_corrected', capturePerSourcePerSeat: true,
});
const refEnd = performance.now();
console.log(`  Production time (1 finalist): ${(refEnd - refStart).toFixed(0)} ms`);

const amplifierAuthority = getPerSubwooferAmplifierAuthority(sources);
const sourcesWithCurves = sources.map((src, si) => {
  const subCurve = getSubwooferCurve(src.modelKey);
  const deratingDb = amplifierAuthority.sourceAuthorities[si]?.deratingDb ?? 0;
  return { ...src, sourceCurve: applyDeratingToCurve(subCurve, deratingDb) };
});

const batchStart = performance.now();
const batchResult = evaluateBatchModalTransfers({
  roomDims: ROOM_DIMS, sources: sourcesWithCurves, listeners: LISTENERS,
  precomputedModes, physics: PHYSICS, qStrategyOverride: 'ab_corrected',
  collectDiagnostics: true,
});
const batchEnd = performance.now();
console.log(`  Batch time (1 finalist): ${(batchEnd - batchStart).toFixed(0)} ms`);

// Compare
let maxReDelta = 0, maxImDelta = 0, maxSplDelta = 0, totalPoints = 0;
let worstRe = {}, worstSpl = {};
const nullRegionSplDeltas = [];

const prodTransfers = prodResult.perSourcePerSeatComplexTransfers || [];
for (const pt of prodTransfers) {
  const bt = batchResult.perSourcePerListenerTransfers.find(
    t => t.sourceIndex === pt.sourceIndex && t.listenerId === pt.seatId
  );
  if (!bt) continue;
  for (let pi = 0; pi < pt.points.length; pi++) {
    const dRe = Math.abs((pt.points[pi].re ?? 0) - (bt.points[pi].re ?? 0));
    const dIm = Math.abs((pt.points[pi].im ?? 0) - (bt.points[pi].im ?? 0));
    const prodMag = Math.hypot(pt.points[pi].re ?? 0, pt.points[pi].im ?? 0);
    const batchMag = Math.hypot(bt.points[pi].re ?? 0, bt.points[pi].im ?? 0);
    const prodSpl = 20 * Math.log10(Math.max(prodMag, 1e-10));
    const batchSpl = 20 * Math.log10(Math.max(batchMag, 1e-10));
    const dSpl = Math.abs(prodSpl - batchSpl);
    totalPoints++;
    if (dRe > maxReDelta) { maxReDelta = dRe; worstRe = { s: pt.sourceIndex, l: pt.seatId, f: pt.points[pi].frequency }; }
    if (dIm > maxImDelta) maxImDelta = dIm;
    if (dSpl > maxSplDelta) { maxSplDelta = dSpl; worstSpl = { s: pt.sourceIndex, l: pt.seatId, f: pt.points[pi].frequency, prod: prodSpl, batch: batchSpl }; }
    if (prodSpl < -20) nullRegionSplDeltas.push({ dSpl, prodSpl, batchSpl, freq: pt.points[pi].frequency, s: pt.sourceIndex, l: pt.seatId });
  }
}
nullRegionSplDeltas.sort((a, b) => b.dSpl - a.dSpl);

console.log(`  Total points: ${totalPoints}`);
console.log(`  Max Re delta: ${maxReDelta.toExponential(4)} at src=${worstRe.s} lis=${worstRe.l} freq=${worstRe.f?.toFixed(2)}`);
console.log(`  Max Im delta: ${maxImDelta.toExponential(4)}`);
console.log(`  Max SPL delta: ${maxSplDelta.toExponential(4)} dB at src=${worstSpl.s} lis=${worstSpl.l} freq=${worstSpl.f?.toFixed(2)} (prod=${worstSpl.prod?.toFixed(2)} batch=${worstSpl.batch?.toFixed(2)})`);
console.log(`  Null-region points (SPL<-20): ${nullRegionSplDeltas.length}`);
if (nullRegionSplDeltas.length > 0) {
  const w = nullRegionSplDeltas[0];
  console.log(`  Worst null-region SPL delta: ${w.dSpl.toExponential(4)} dB at ${w.freq.toFixed(2)} Hz (prod=${w.prodSpl.toFixed(2)} batch=${w.batchSpl.toFixed(2)})`);
}

// ── BATCH DIAGNOSTICS ─────────────────────────────────────────────────────

console.log('\n=== BATCH DIAGNOSTICS ===');
if (batchResult.diagnostics) {
  const d = batchResult.diagnostics;
  console.log(`  Modes: ${d.nModes}, Freqs: ${d.nFreqs}, Sources: ${d.nSources}, Listeners: ${d.nListeners}`);
  console.log(`  Timing:`);
  console.log(`    Mode-freq response: ${d.timing.modeFreqMs.toFixed(1)} ms`);
  console.log(`    Source-mode coupling: ${d.timing.sourceModeMs.toFixed(1)} ms`);
  console.log(`    Listener-mode coupling: ${d.timing.listenerModeMs.toFixed(1)} ms`);
  console.log(`    Mode weights: ${d.timing.modeWeightMs.toFixed(1)} ms`);
  console.log(`    Source-freq amplitude: ${d.timing.sourceFreqMs.toFixed(1)} ms`);
  console.log(`    Transfer matrix: ${d.timing.transferMatrixMs.toFixed(1)} ms`);
  console.log(`    Total: ${d.timing.totalMs.toFixed(1)} ms`);
  const m = d.memory;
  const totalMB = (m.modeFreqRe + m.modeFreqIm + m.sourceModeCoupling + m.listenerModeCoupling + m.modeWeight + m.sourceFreqAmplitude + m.perSourcePerListenerTransfers) / (1024 * 1024);
  console.log(`  Memory: ${totalMB.toFixed(2)} MB total`);
}

// ── SPEEDUP ESTIMATE ──────────────────────────────────────────────────────

console.log('\n=== SPEEDUP ESTIMATE ===');
const singleRefMs = refEnd - refStart;
const singleBatchMs = batchEnd - batchStart;
console.log(`  1-finalist production: ${singleRefMs.toFixed(0)} ms`);
console.log(`  1-finalist batch: ${singleBatchMs.toFixed(0)} ms`);
console.log(`  1-finalist speedup: ${(singleRefMs / singleBatchMs).toFixed(1)}x`);
console.log(`  Estimated 5-finalist production: ${(singleRefMs * 5).toFixed(0)} ms`);
console.log(`  Estimated 5-finalist batch (20 sources): ${(singleBatchMs * 5).toFixed(0)} ms (conservative)`);
console.log(`  Estimated 5-finalist speedup: ${(singleRefMs / singleBatchMs).toFixed(1)}x`);

const parityPass = maxReDelta < 1e-6 && maxImDelta < 1e-6 && maxSplDelta < 0.01;
const performancePass = (singleRefMs / singleBatchMs) > 3;
console.log(`\n  PARITY PASS: ${parityPass ? 'YES' : 'NO'}`);
console.log(`  PERFORMANCE PASS: ${performancePass ? 'YES' : 'NO'} (${(singleRefMs / singleBatchMs).toFixed(1)}x)`);
console.log(`\n${parityPass && performancePass ? 'EXACT BATCH MODAL PROTOTYPE PASSED — SAFE TO INTEGRATE' : parityPass ? 'EXACT BATCH MODAL PROTOTYPE PARITY OK BUT NOT BENEFICIAL — DO NOT INTEGRATE' : 'EXACT BATCH MODAL PROTOTYPE FAILED — DO NOT INTEGRATE'}`);