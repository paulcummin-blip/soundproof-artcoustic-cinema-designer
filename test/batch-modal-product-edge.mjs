// batch-modal-product-edge.mjs — Product/amplifier edge cases.
// Run with: node --import ./test/_alias-register.mjs test/batch-modal-product-edge.mjs

import { simulateAuthoritativeBassResponse } from '@/components/room/bass/authoritativeBassResponseEngine';
import { prepareModeBank } from '@/bass/core/rewBassEngine';
import { evaluateBatchModalTransfers } from '@/bass/core/batchModalEvaluator';
import { getPerSubwooferAmplifierAuthority } from '@/components/utils/subwooferCapability';
import { getSubwooferCurve, normaliseModelKey, MODELS } from '@/components/models/speakers/registry';
import { BASS_NORMALIZED_PHYSICS_DEFAULTS } from '@/components/room/bass/bassPhysicsDefaults';
import { deriveCentreZ } from '@/components/utils/subwooferInstanceMigration';

const ROOM_DIMS = { widthM: 4, lengthM: 6.3, heightM: 2.4 };
const PHYSICS = {
  ...BASS_NORMALIZED_PHYSICS_DEFAULTS,
  rewSourceCurveMode: 'product', disableLateField: true, disableModalPropagationPhase: true,
};
const SEATING_POSITIONS = [
  { id: 'seat-1', x: 2, y: 3, z: 1.2, priority: 'primary' },
  { id: 'seat-2', x: 1.5, y: 4, z: 1.2, priority: 'secondary' },
];
const RSP_POSITION = { id: 'rsp', x: 2, y: 3.15, z: 1.2, __isSyntheticRsp: true };
const LISTENERS = [RSP_POSITION, ...SEATING_POSITIONS];

const engineOptionsBase = {
  surfaceAbsorption: PHYSICS.surfaceAbsorption, freqMinHz: 15, freqMaxHz: 200,
  smoothing: 'none', axialQ: PHYSICS.axialQ, qStrategy: 'ab_corrected',
  abApplyModeMultiplicity: true, roomIsSealed: true, abMidbandQScale: 1, enableModes: true,
};
const precomputedModes = prepareModeBank(ROOM_DIMS, engineOptionsBase);

function applyDerating(curve, deratingDb) {
  if (!Number.isFinite(deratingDb) || deratingDb === 0) return curve;
  return curve.map(p => {
    const spl = Number(p?.spl), db = Number(p?.db);
    if (Number.isFinite(spl)) return { ...p, spl: spl + deratingDb };
    if (Number.isFinite(db)) return { ...p, db: db + deratingDb };
    return { ...p };
  });
}

function compareTransfers(prodTransfers, batchTransfers) {
  let maxRe = 0, maxIm = 0, maxSpl = 0;
  for (const pt of prodTransfers) {
    const bt = batchTransfers.find(t => t.sourceIndex === pt.sourceIndex && t.listenerId === pt.seatId);
    if (!bt) continue;
    for (let pi = 0; pi < pt.points.length; pi++) {
      const dRe = Math.abs((pt.points[pi].re ?? 0) - (bt.points[pi].re ?? 0));
      const dIm = Math.abs((pt.points[pi].im ?? 0) - (bt.points[pi].im ?? 0));
      const prodSpl = 20 * Math.log10(Math.max(Math.hypot(pt.points[pi].re ?? 0, pt.points[pi].im ?? 0), 1e-10));
      const batchSpl = 20 * Math.log10(Math.max(Math.hypot(bt.points[pi].re ?? 0, bt.points[pi].im ?? 0), 1e-10));
      maxRe = Math.max(maxRe, dRe); maxIm = Math.max(maxIm, dIm);
      maxSpl = Math.max(maxSpl, Math.abs(prodSpl - batchSpl));
    }
  }
  return { maxRe, maxIm, maxSpl };
}

function runCase(label, modelKey, ampPowerW, sourcePositions) {
  const centreZ = deriveCentreZ({ bottomHeightM: 0.05, model: normaliseModelKey(modelKey) });
  const sources = sourcePositions.map((pos, i) => ({
    id: `src-${i+1}`, modelKey,
    subwooferAmplifierPowerW: ampPowerW,
    x: pos.x, y: pos.y, z: centreZ,
    tuning: { gainDb: 0, delayMs: 0, polarity: 0 },
  }));

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

  const { maxRe, maxIm, maxSpl } = compareTransfers(
    prodResult.perSourcePerSeatComplexTransfers || [],
    batchResult.perSourcePerListenerTransfers
  );

  // Check derating values
  const deratings = ampAuth.sourceAuthorities.map(a => a?.deratingDb ?? 0);
  const pass = maxRe < 1e-6 && maxIm < 1e-6 && maxSpl < 0.01;
  console.log(`  ${label.padEnd(45)} Re=${maxRe.toExponential(3)} Im=${maxIm.toExponential(3)} SPL=${maxSpl.toExponential(4)} dB  derating=[${deratings.map(d => d.toFixed(2)).join(', ')}]  ${pass ? 'PASS' : 'FAIL'}`);
  return { pass, maxRe, maxIm, maxSpl, deratings };
}

console.log('=== PRODUCT/AMPLIFIER EDGE CASES ===\n');

const sourcePositions4 = [
  { x: 0.6, y: 0 }, { x: 3.4, y: 0 }, { x: 0.6, y: 6.3 }, { x: 3.4, y: 6.3 },
];

// Product models
console.log('--- Product models (default amplifier) ---');
const productMaxPower = {};
for (const m of MODELS) {
  if (m.category === 'SUBWOOFERS') productMaxPower[m.key] = m.max_power;
}
for (const model of ['sub2-12', 'sub3-12', 'sub4-12']) {
  runCase(`${model.toUpperCase()} @ default amp`, model, productMaxPower[model], sourcePositions4);
}

// Amplifier variations for SUB4-12
console.log('\n--- SUB4-12 amplifier variations ---');
const sub4Max = productMaxPower['sub4-12'];
runCase('SUB4-12 amp BELOW max (350W)', 'sub4-12', 350, sourcePositions4);
runCase('SUB4-12 amp AT max (1400W)', 'sub4-12', sub4Max, sourcePositions4);
runCase('SUB4-12 amp ABOVE max (2800W)', 'sub4-12', 2800, sourcePositions4);

// Amplifier variations for SUB2-12
console.log('\n--- SUB2-12 amplifier variations ---');
const sub2Max = productMaxPower['sub2-12'];
runCase('SUB2-12 amp BELOW max (175W)', 'sub2-12', 175, sourcePositions4);
runCase('SUB2-12 amp AT max (350W)', 'sub2-12', sub2Max, sourcePositions4);
runCase('SUB2-12 amp ABOVE max (700W)', 'sub2-12', 700, sourcePositions4);

// Amplifier variations for SUB3-12
console.log('\n--- SUB3-12 amplifier variations ---');
const sub3Max = productMaxPower['sub3-12'];
runCase('SUB3-12 amp BELOW max (350W)', 'sub3-12', 350, sourcePositions4);
runCase('SUB3-12 amp AT max (700W)', 'sub3-12', sub3Max, sourcePositions4);
runCase('SUB3-12 amp ABOVE max (1400W)', 'sub3-12', 1400, sourcePositions4);

console.log('\n=== VERDICT ===');
console.log('  All product/amplifier edge cases must show PASS for integration.');