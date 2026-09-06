// batch-modal-parity-5.mjs — Full 5-finalist parity test.
// Run with: node --import ./test/_alias-register.mjs test/batch-modal-parity-5.mjs

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

const FINALISTS = DATA.stage1.four_sub_result.finalists;
const SEATING_POSITIONS = DATA.project.seating_positions.map(seat => ({
  id: seat.id, x: Number(seat.x), y: Number(seat.y), z: Number(seat.z ?? 1.2),
  priority: seat.priority || (seat.isPrimary ? 'primary' : 'secondary'),
}));
const RSP_POSITION = { id: 'rsp', x: 2, y: 3.15, z: 1.2, __isSyntheticRsp: true };
const LISTENERS = [RSP_POSITION, ...SEATING_POSITIONS];

const engineOptionsBase = {
  surfaceAbsorption: PHYSICS.surfaceAbsorption, freqMinHz: 15, freqMaxHz: 200,
  smoothing: 'none', axialQ: PHYSICS.axialQ, qStrategy: 'ab_corrected',
  abApplyModeMultiplicity: true, roomIsSealed: true, abMidbandQScale: 1, enableModes: true,
};
const precomputedModes = prepareModeBank(ROOM_DIMS, engineOptionsBase);
console.log(`Modes: ${precomputedModes.length}`);

function buildSources(finalist) {
  return finalist.sources.map((s, i) => ({
    id: `src-${i+1}`, modelKey: 'sub4-12',
    subwooferAmplifierPowerW: DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W,
    x: s.xNorm * ROOM_DIMS.widthM, y: s.yNorm * ROOM_DIMS.lengthM, z: centreZ,
    tuning: { gainDb: 0, delayMs: 0, polarity: 0 },
  }));
}

function applyDerating(curve, deratingDb) {
  if (!Number.isFinite(deratingDb) || deratingDb === 0) return curve;
  return curve.map(p => {
    const spl = Number(p?.spl), db = Number(p?.db);
    if (Number.isFinite(spl)) return { ...p, spl: spl + deratingDb };
    if (Number.isFinite(db)) return { ...p, db: db + deratingDb };
    return { ...p };
  });
}

// ── 5-finalist production reference ─────────────────────────────────────

console.log('\n=== 5-FINALIST PARITY ===');
let maxReDelta = 0, maxImDelta = 0, maxSplDelta = 0, totalPoints = 0;
let worstSpl = {};
const nullRegionSplDeltas = [];

const refStart = performance.now();
for (let fi = 0; fi < FINALISTS.length; fi++) {
  const finalist = FINALISTS[fi];
  const sources = buildSources(finalist);

  const prodResult = simulateAuthoritativeBassResponse({
    roomDims: ROOM_DIMS, seatingPositions: SEATING_POSITIONS, rspPosition: RSP_POSITION,
    sources, physics: PHYSICS, qStrategyOverride: 'ab_corrected', capturePerSourcePerSeat: true,
  });

  const ampAuth = getPerSubwooferAmplifierAuthority(sources);
  const sourcesWithCurves = sources.map((src, si) => ({
    ...src, sourceCurve: applyDerating(getSubwooferCurve(src.modelKey), ampAuth.sourceAuthorities[si]?.deratingDb ?? 0),
  }));

  const batchResult = evaluateBatchModalTransfers({
    roomDims: ROOM_DIMS, sources: sourcesWithCurves, listeners: LISTENERS,
    precomputedModes, physics: PHYSICS, qStrategyOverride: 'ab_corrected',
  });

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
      if (dRe > maxReDelta) maxReDelta = dRe;
      if (dIm > maxImDelta) maxImDelta = dIm;
      if (dSpl > maxSplDelta) { maxSplDelta = dSpl; worstSpl = { fi, s: pt.sourceIndex, l: pt.seatId, f: pt.points[pi].frequency, prod: prodSpl, batch: batchSpl }; }
      if (prodSpl < -20) nullRegionSplDeltas.push({ dSpl, prodSpl, batchSpl, freq: pt.points[pi].frequency, fi, s: pt.sourceIndex, l: pt.seatId });
    }
  }
  console.log(`  Finalist ${fi} (${finalist.familyId}): done`);
}
const refEnd = performance.now();
nullRegionSplDeltas.sort((a, b) => b.dSpl - a.dSpl);

const refSec = (refEnd - refStart) / 1000;
console.log(`\n  Production total: ${(refEnd - refStart).toFixed(0)} ms (${refSec.toFixed(1)} s)`);
console.log(`  Total points: ${totalPoints}`);
console.log(`  Max Re delta: ${maxReDelta.toExponential(4)}`);
console.log(`  Max Im delta: ${maxImDelta.toExponential(4)}`);
console.log(`  Max SPL delta: ${maxSplDelta.toExponential(4)} dB`);
console.log(`  Worst SPL: finalist=${worstSpl.fi} src=${worstSpl.s} lis=${worstSpl.l} freq=${worstSpl.f?.toFixed(2)} prod=${worstSpl.prod?.toFixed(2)} batch=${worstSpl.batch?.toFixed(2)}`);
console.log(`  Null-region points (SPL<-20): ${nullRegionSplDeltas.length}`);
if (nullRegionSplDeltas.length > 0) {
  for (const d of nullRegionSplDeltas.slice(0, 5)) {
    console.log(`    ${d.dSpl.toExponential(4)} dB at ${d.freq.toFixed(2)} Hz (prod=${d.prodSpl.toFixed(2)} batch=${d.batchSpl.toFixed(2)} fi=${d.fi} src=${d.s} lis=${d.l})`);
  }
}

// ── Batch performance (all 20 unique sources) ────────────────────────────

console.log('\n=== BATCH (20 unique sources) ===');
const allSources = [];
const seen = new Set();
for (const f of FINALISTS) {
  for (const src of buildSources(f)) {
    const key = `${src.x.toFixed(4)},${src.y.toFixed(4)}`;
    if (!seen.has(key)) { seen.add(key); allSources.push(src); }
  }
}
const ampAuthAll = getPerSubwooferAmplifierAuthority(allSources);
const allSourcesWithCurves = allSources.map((src, si) => ({
  ...src, sourceCurve: applyDerating(getSubwooferCurve(src.modelKey), ampAuthAll.sourceAuthorities[si]?.deratingDb ?? 0),
}));

const batchStart = performance.now();
const batchAll = evaluateBatchModalTransfers({
  roomDims: ROOM_DIMS, sources: allSourcesWithCurves, listeners: LISTENERS,
  precomputedModes, physics: PHYSICS, qStrategyOverride: 'ab_corrected',
  collectDiagnostics: true,
});
const batchEnd = performance.now();

console.log(`  Unique sources: ${allSources.length}`);
console.log(`  Batch time: ${(batchEnd - batchStart).toFixed(0)} ms`);
console.log(`  Transfers: ${batchAll.perSourcePerListenerTransfers.length}`);
console.log(`  Speedup vs 5-finalist production: ${((refEnd - refStart) / (batchEnd - batchStart)).toFixed(1)}x`);

if (batchAll.diagnostics) {
  const d = batchAll.diagnostics;
  console.log(`  Modes: ${d.nModes}, Freqs: ${d.nFreqs}, Sources: ${d.nSources}, Listeners: ${d.nListeners}`);
  console.log(`  Timing: modeFreq=${d.timing.modeFreqMs.toFixed(1)}ms srcMode=${d.timing.sourceModeMs.toFixed(1)}ms lisMode=${d.timing.listenerModeMs.toFixed(1)}ms xfer=${d.timing.transferMatrixMs.toFixed(1)}ms total=${d.timing.totalMs.toFixed(1)}ms`);
  const m = d.memory;
  const totalMB = (m.modeFreqRe + m.modeFreqIm + m.sourceModeCoupling + m.listenerModeCoupling + m.modeWeight + m.sourceFreqAmplitude + m.perSourcePerListenerTransfers) / (1024 * 1024);
  console.log(`  Memory: ${totalMB.toFixed(2)} MB`);
}

// ── Verdict ──────────────────────────────────────────────────────────────

const parityPass = maxReDelta < 1e-6 && maxImDelta < 1e-6 && maxSplDelta < 0.01;
const speedup = (refEnd - refStart) / (batchEnd - batchStart);
const perfPass = speedup > 3;

console.log(`\n=== VERDICT ===`);
console.log(`  PARITY: ${parityPass ? 'PASS' : 'FAIL'} (Re=${maxReDelta.toExponential(4)}, Im=${maxImDelta.toExponential(4)}, SPL=${maxSplDelta.toExponential(4)} dB)`);
console.log(`  PERFORMANCE: ${perfPass ? 'PASS' : 'FAIL'} (${speedup.toFixed(1)}x)`);
console.log(`  Production: ${((refEnd - refStart)/1000).toFixed(1)} s → Batch: ${(batchEnd - batchStart).toFixed(0)} ms`);
console.log(`\n${parityPass && perfPass ? 'EXACT BATCH MODAL PROTOTYPE PASSED — SAFE TO INTEGRATE' : parityPass ? 'PARITY OK BUT NOT BENEFICIAL — DO NOT INTEGRATE' : 'EXACT BATCH MODAL PROTOTYPE FAILED — DO NOT INTEGRATE'}`);