// batch-modal-deep-null.mjs — Deep-null numerical parity.
// Compares production vs batch around the deepest SUMMED-response nulls.
// Run with: node --import ./test/_alias-register.mjs test/batch-modal-deep-null.mjs

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
  rewSourceCurveMode: 'product', disableLateField: true, disableModalPropagationPhase: true,
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

// Sum per-source transfers for a given seat (zero tuning = simple complex sum)
function sumTransfers(transfers, seatId) {
  const seatTransfers = transfers.filter(t => (t.seatId || t.listenerId) === seatId);
  if (!seatTransfers.length) return null;
  const nFreqs = seatTransfers[0].points.length;
  const sumRe = new Float64Array(nFreqs);
  const sumIm = new Float64Array(nFreqs);
  const freqs = new Float64Array(nFreqs);
  for (const t of seatTransfers) {
    for (let fi = 0; fi < nFreqs; fi++) {
      sumRe[fi] += t.points[fi].re ?? 0;
      sumIm[fi] += t.points[fi].im ?? 0;
      freqs[fi] = t.points[fi].frequency;
    }
  }
  return { freqs, sumRe, sumIm, spl: freqs.map((_, fi) => 20 * Math.log10(Math.max(Math.hypot(sumRe[fi], sumIm[fi]), 1e-10))) };
}

// Find deepest nulls in a summed SPL array
function findNulls(spl, freqs, maxCount = 5) {
  const nulls = [];
  for (let fi = 1; fi < spl.length - 1; fi++) {
    // Local minimum: lower than both neighbors
    if (spl[fi] < spl[fi - 1] && spl[fi] < spl[fi + 1]) {
      nulls.push({ freq: freqs[fi], spl: spl[fi], index: fi });
    }
  }
  nulls.sort((a, b) => a.spl - b.spl);
  return nulls.slice(0, maxCount);
}

console.log('=== DEEP-NULL NUMERICAL PARITY (SUMMED RESPONSE) ===\n');

const allNulls = [];

for (let fi = 0; fi < FINALISTS.length; fi++) {
  const finalist = FINALISTS[fi];
  const sources = buildSources(finalist);

  const prodResult = simulateAuthoritativeBassResponse({
    roomDims: ROOM_DIMS, seatingPositions: SEATING_POSITIONS, rspPosition: RSP_POSITION,
    sources, physics: PHYSICS, qStrategyOverride: 'ab_corrected', capturePerSourcePerSeat: true,
  });
  const prodTransfers = prodResult.perSourcePerSeatComplexTransfers || [];

  const ampAuth = getPerSubwooferAmplifierAuthority(sources);
  const sourcesWithCurves = sources.map((src, si) => ({
    ...src, sourceCurve: applyDerating(getSubwooferCurve(src.modelKey), ampAuth.sourceAuthorities[si]?.deratingDb ?? 0),
  }));
  const batchResult = evaluateBatchModalTransfers({
    roomDims: ROOM_DIMS, sources: sourcesWithCurves, listeners: LISTENERS,
    precomputedModes, physics: PHYSICS, qStrategyOverride: 'ab_corrected',
  });

  // Sum transfers for each seat and find nulls
  for (const seat of LISTENERS) {
    const prodSum = sumTransfers(prodTransfers, seat.id);
    const batchSum = sumTransfers(batchResult.perSourcePerListenerTransfers, seat.id);
    if (!prodSum || !batchSum) continue;

    const nulls = findNulls(prodSum.spl, prodSum.freqs, 3);
    for (const nullPoint of nulls) {
      const prodSpl = prodSum.spl[nullPoint.index];
      const batchSpl = batchSum.spl[nullPoint.index];
      const delta = Math.abs(prodSpl - batchSpl);

      // Also check ±2 frequencies around the null
      const windowDeltas = [];
      for (let offset = -2; offset <= 2; offset++) {
        const idx = nullPoint.index + offset;
        if (idx >= 0 && idx < prodSum.spl.length) {
          windowDeltas.push({
            freq: prodSum.freqs[idx],
            prodSpl: prodSum.spl[idx],
            batchSpl: batchSum.spl[idx],
            delta: Math.abs(prodSum.spl[idx] - batchSum.spl[idx]),
          });
        }
      }
      const maxWindowDelta = Math.max(...windowDeltas.map(d => d.delta));

      allNulls.push({
        finalist: finalist.familyId, seatId: seat.id,
        nullFreq: nullPoint.freq, prodSpl, batchSpl, delta,
        maxWindowDelta, windowDeltas,
      });
    }
  }
  console.log(`  Finalist ${fi} (${finalist.familyId}): done`);
}

// Sort by null depth (deepest first)
allNulls.sort((a, b) => a.prodSpl - b.prodSpl);

console.log(`\n=== DEEPEST NULLS IN SUMMED RESPONSE (sorted by SPL) ===`);
for (const n of allNulls.slice(0, 15)) {
  console.log(`  ${n.finalist.padEnd(30)} ${n.seatId.padEnd(12)} nullFreq=${n.nullFreq.toFixed(2).padStart(7)}Hz  prodSPL=${n.prodSpl.toFixed(2).padStart(7)}  batchSPL=${n.batchSpl.toFixed(2).padStart(7)}  delta=${n.delta.toExponential(4)}  maxWindowDelta=${n.maxWindowDelta.toExponential(4)}`);
}

// Report worst window deltas
const allWindowDeltas = allNulls.flatMap(n => n.windowDeltas);
allWindowDeltas.sort((a, b) => b.delta - a.delta);
console.log(`\n=== WORST POINT-BY-POINT DELTAS AROUND NULLS ===`);
for (const d of allWindowDeltas.slice(0, 5)) {
  console.log(`  freq=${d.freq.toFixed(2)}Hz  prod=${d.prodSpl.toFixed(4)}  batch=${d.batchSpl.toFixed(4)}  delta=${d.delta.toExponential(4)}`);
}

const maxNullDelta = allNulls.length > 0 ? Math.max(...allNulls.map(n => n.maxWindowDelta)) : 0;
const maxDirectDelta = allNulls.length > 0 ? Math.max(...allNulls.map(n => n.delta)) : 0;
console.log(`\n  Total nulls found: ${allNulls.length}`);
console.log(`  Max direct null delta: ${maxDirectDelta.toExponential(4)} dB`);
console.log(`  Max ±2 window delta: ${maxNullDelta.toExponential(4)} dB`);
console.log(`  Verdict: ${maxNullDelta < 0.01 ? 'PASS — deep-null parity confirmed' : 'FAIL — null-region divergence'}`);