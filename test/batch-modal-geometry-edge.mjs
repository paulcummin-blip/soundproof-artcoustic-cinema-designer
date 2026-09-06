// batch-modal-geometry-edge.mjs — Geometry edge cases.
// Run with: node --import ./test/_alias-register.mjs test/batch-modal-geometry-edge.mjs

import { simulateAuthoritativeBassResponse } from '@/components/room/bass/authoritativeBassResponseEngine';
import { prepareModeBank } from '@/bass/core/rewBassEngine';
import { evaluateBatchModalTransfers } from '@/bass/core/batchModalEvaluator';
import { getPerSubwooferAmplifierAuthority, DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W } from '@/components/utils/subwooferCapability';
import { getSubwooferCurve, normaliseModelKey } from '@/components/models/speakers/registry';
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
const centreZ = deriveCentreZ({ bottomHeightM: 0.05, model: normaliseModelKey('sub4-12') });

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
  let maxRe = 0, maxIm = 0, maxSpl = 0, count = 0;
  for (const pt of prodTransfers) {
    const bt = batchTransfers.find(t => t.sourceIndex === pt.sourceIndex && t.listenerId === pt.seatId);
    if (!bt) continue;
    for (let pi = 0; pi < pt.points.length; pi++) {
      const dRe = Math.abs((pt.points[pi].re ?? 0) - (bt.points[pi].re ?? 0));
      const dIm = Math.abs((pt.points[pi].im ?? 0) - (bt.points[pi].im ?? 0));
      const prodSpl = 20 * Math.log10(Math.max(Math.hypot(pt.points[pi].re ?? 0, pt.points[pi].im ?? 0), 1e-10));
      const batchSpl = 20 * Math.log10(Math.max(Math.hypot(bt.points[pi].re ?? 0, bt.points[pi].im ?? 0), 1e-10));
      maxRe = Math.max(maxRe, dRe); maxIm = Math.max(maxIm, dIm);
      maxSpl = Math.max(maxSpl, Math.abs(prodSpl - batchSpl)); count++;
    }
  }
  return { maxRe, maxIm, maxSpl, count };
}

function runCase(label, sourcePositions, listenerPositions, sourceZ = centreZ) {
  const sources = sourcePositions.map((pos, i) => ({
    id: `src-${i+1}`, modelKey: 'sub4-12',
    subwooferAmplifierPowerW: DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W,
    x: pos.x, y: pos.y, z: pos.z ?? sourceZ,
    tuning: { gainDb: 0, delayMs: 0, polarity: 0 },
  }));

  const seats = listenerPositions.filter(l => l.id !== 'rsp');
  const rsp = listenerPositions.find(l => l.id === 'rsp') || RSP_POSITION;
  const listeners = [{ id: 'rsp', x: rsp.x, y: rsp.y, z: rsp.z, __isSyntheticRsp: true }, ...seats];

  const prodResult = simulateAuthoritativeBassResponse({
    roomDims: ROOM_DIMS, seatingPositions: seats, rspPosition: { ...rsp, __isSyntheticRsp: true },
    sources, physics: PHYSICS, qStrategyOverride: 'ab_corrected', capturePerSourcePerSeat: true,
  });

  const ampAuth = getPerSubwooferAmplifierAuthority(sources);
  const sourcesWithCurves = sources.map((src, si) => ({
    ...src, sourceCurve: applyDerating(getSubwooferCurve(src.modelKey), ampAuth.sourceAuthorities[si]?.deratingDb ?? 0),
  }));

  const batchResult = evaluateBatchModalTransfers({
    roomDims: ROOM_DIMS, sources: sourcesWithCurves, listeners,
    precomputedModes, physics: PHYSICS, qStrategyOverride: 'ab_corrected',
  });

  const { maxRe, maxIm, maxSpl, count } = compareTransfers(
    prodResult.perSourcePerSeatComplexTransfers || [],
    batchResult.perSourcePerListenerTransfers
  );
  const pass = maxRe < 1e-6 && maxIm < 1e-6 && maxSpl < 0.01;
  console.log(`  ${label.padEnd(50)} pts=${count} Re=${maxRe.toExponential(3)} Im=${maxIm.toExponential(3)} SPL=${maxSpl.toExponential(4)} dB  ${pass ? 'PASS' : 'FAIL'}`);
  return { pass, maxRe, maxIm, maxSpl };
}

console.log('=== GEOMETRY EDGE CASES ===\n');

// Source count
console.log('--- Source count ---');
runCase('1 source (center front)', [{ x: 2, y: 0 }], LISTENERS);
runCase('2 sources (front L/R)', [{ x: 1, y: 0 }, { x: 3, y: 0 }], LISTENERS);
runCase('4 sources (corners)', [{ x: 0.6, y: 0 }, { x: 3.4, y: 0 }, { x: 0.6, y: 6.3 }, { x: 3.4, y: 6.3 }], LISTENERS);

// Source on/near modal node
console.log('\n--- Source on/near modal node ---');
// Room 4×6.3×2.4: axial modes at f = c/2 × n/L
// Width modes: x=0 (node), x=2 (antinode), x=4 (node)
// Length modes: y=0 (node), y=3.15 (antinode), y=6.3 (node)
runCase('Source ON width node (x=0, y=3.15)', [{ x: 0, y: 3.15 }], LISTENERS);
runCase('Source ON length node (x=2, y=0)', [{ x: 2, y: 0 }], LISTENERS);
runCase('Source ON corner node (x=0, y=0)', [{ x: 0, y: 0 }], LISTENERS);
runCase('Source NEAR node (x=0.01, y=0.01)', [{ x: 0.01, y: 0.01 }], LISTENERS);
runCase('Source at antinode (x=2, y=3.15)', [{ x: 2, y: 3.15 }], LISTENERS);

// Listener on/near modal node
console.log('\n--- Listener on/near modal node ---');
runCase('Listener ON width node', [{ x: 2, y: 0 }], [
  { id: 'rsp', x: 0, y: 3.15, z: 1.2 },
  { id: 'seat-1', x: 0, y: 3, z: 1.2, priority: 'primary' },
  { id: 'seat-2', x: 2, y: 4, z: 1.2, priority: 'secondary' },
]);
runCase('Listener ON length node', [{ x: 2, y: 0 }], [
  { id: 'rsp', x: 2, y: 0, z: 1.2 },
  { id: 'seat-1', x: 2, y: 3, z: 1.2, priority: 'primary' },
  { id: 'seat-2', x: 1.5, y: 4, z: 1.2, priority: 'secondary' },
]);
runCase('Listener ON corner', [{ x: 2, y: 0 }], [
  { id: 'rsp', x: 0, y: 0, z: 1.2 },
  { id: 'seat-1', x: 0, y: 3, z: 1.2, priority: 'primary' },
  { id: 'seat-2', x: 2, y: 4, z: 1.2, priority: 'secondary' },
]);

// Symmetric source/listener
console.log('\n--- Symmetric configurations ---');
runCase('Symmetric 4-sub + center listener', [
  { x: 1, y: 0 }, { x: 3, y: 0 }, { x: 1, y: 6.3 }, { x: 3, y: 6.3 },
], [
  { id: 'rsp', x: 2, y: 3.15, z: 1.2 },
  { id: 'seat-1', x: 2, y: 2.5, z: 1.2, priority: 'primary' },
  { id: 'seat-2', x: 2, y: 4, z: 1.2, priority: 'secondary' },
]);
runCase('Symmetric 2-sub + center listener', [
  { x: 1, y: 3.15 }, { x: 3, y: 3.15 },
], [
  { id: 'rsp', x: 2, y: 3.15, z: 1.2 },
  { id: 'seat-1', x: 2, y: 2.5, z: 1.2, priority: 'primary' },
]);

// Non-zero source height
console.log('\n--- Non-zero source height ---');
const elevatedZ = deriveCentreZ({ bottomHeightM: 0.5, model: normaliseModelKey('sub4-12') });
runCase('Source at z=0.5m bottom (elevated)', [
  { x: 1, y: 0, z: elevatedZ }, { x: 3, y: 0, z: elevatedZ },
  { x: 1, y: 6.3, z: elevatedZ }, { x: 3, y: 6.3, z: elevatedZ },
], LISTENERS);
const ceilingZ = deriveCentreZ({ bottomHeightM: 1.5, model: normaliseModelKey('sub4-12') });
runCase('Source near ceiling (z=1.5m bottom)', [
  { x: 1, y: 0, z: ceilingZ }, { x: 3, y: 0, z: ceilingZ },
], LISTENERS);

console.log('\n=== VERDICT ===');
console.log('  All geometry edge cases must show PASS for integration.');