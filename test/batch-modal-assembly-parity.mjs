// batch-modal-assembly-parity.mjs — Full finalist assembly parity.
// Feeds batch transfers through the unchanged production confirmation chain.
// Run with: node --import ./test/_alias-register.mjs test/batch-modal-assembly-parity.mjs

import { evaluateStage2Placement, evaluateStage2Confirmation } from '@/components/room/bass/stage2/stage2CanonicalEvaluation';
import { evaluateBatchModalTransfers } from '@/bass/core/batchModalEvaluator';
import { prepareModeBank } from '@/bass/core/rewBassEngine';
import { getPerSubwooferAmplifierAuthority, DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W } from '@/components/utils/subwooferCapability';
import { getSubwooferCurve, normaliseModelKey } from '@/components/models/speakers/registry';
import { BASS_NORMALIZED_PHYSICS_DEFAULTS } from '@/components/room/bass/bassPhysicsDefaults';
import { deriveCentreZ } from '@/components/utils/subwooferInstanceMigration';
import { resumWithTuning } from '@/components/room/bass/stage2/stage2TuningSearch';
import { buildP14TargetCombinations } from '@/components/room/bass/p14TargetDefinitions';
import fs from 'node:fs';

const DATA = JSON.parse(fs.readFileSync(new URL('./_fresh-stage2-data.json', import.meta.url), 'utf8'));
const ROOM_DIMS = { widthM: 4, lengthM: 6.3, heightM: 2.4 };

const PHYSICS = {
  ...BASS_NORMALIZED_PHYSICS_DEFAULTS,
  rewSourceCurveMode: 'product', disableLateField: true, disableModalPropagationPhase: true,
};

const FINALISTS = DATA.stage1.four_sub_result.finalists;
const SEATING_POSITIONS = DATA.project.seating_positions.map(seat => ({
  id: seat.id, x: Number(seat.x), y: Number(seat.y), z: Number(seat.z ?? 1.2),
  priority: seat.priority || (seat.isPrimary ? 'primary' : 'secondary'),
}));
const RSP_POSITION = { x: 2, y: 3.15, z: 1.2 };

// P14 target — Luxavo/Duffy test data has NO stored P14 selection.
// Use canonical fixture: recommended-L2 (a common design target).
const P14_TARGETS = buildP14TargetCombinations();
const CANONICAL_TARGET = P14_TARGETS.find(t => t.basis === 'recommended' && t.level === 2);
console.log(`P14 canonical fixture: ${CANONICAL_TARGET.key} = ${CANONICAL_TARGET.db.toFixed(2)} dB`);
console.log(`  (Luxavo/Duffy test data has no stored P14 selection — using canonical fixture)\n`);

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

function responseCurve(response) {
  const raw = (response?.freqsHz || []).map((frequency, index) => ({
    frequency,
    spl: Number.isFinite(response?.splDb?.[index]) ? response.splDb[index] : null,
  })).filter(p => Number.isFinite(p.frequency) && p.frequency > 0).sort((a, b) => a.frequency - b.frequency);
  return raw.filter((p, index) => !raw[index + 1] || Math.abs(p.frequency - raw[index + 1].frequency) >= 1e-9);
}

function buildResponseCurves(seatResponses) {
  return {
    rspRawCurve: responseCurve(seatResponses?.rsp),
    perSeatRawCurves: Object.entries(seatResponses || {})
      .filter(([seatId]) => seatId !== 'rsp')
      .map(([seatId, response]) => ({ seatId, responseData: responseCurve(response).filter(p => Number.isFinite(p.spl)) }))
      .filter(seat => seat.responseData.length > 0),
  };
}

console.log('=== FULL FINALIST ASSEMBLY PARITY ===\n');

const prodResults = [];
const batchResults = [];
const prodPlaceStart = performance.now();

for (let fi = 0; fi < FINALISTS.length; fi++) {
  const finalist = FINALISTS[fi];
  console.log(`Finalist ${fi}: ${finalist.familyId}...`);

  // ── Production path: evaluateStage2Placement ──
  const prodRaw = evaluateStage2Placement({
    finalist, roomDims: ROOM_DIMS, rspPosition: RSP_POSITION,
    seatingPositions: SEATING_POSITIONS, selectedSubModel: 'sub4-12',
    amplifierPowerPerSubW: DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W, subwooferBottomHeightM: 0.05,
  });
  if (!prodRaw) { console.log(`  PROD: FAILED`); continue; }

  const prodConfirm = evaluateStage2Confirmation(prodRaw, {
    p14TargetBasis: CANONICAL_TARGET.basis, p14TargetLevel: CANONICAL_TARGET.level,
    p14TargetDb: CANONICAL_TARGET.db, p18TargetBasis: 'minimum',
  });
  prodResults.push({ finalist, prodRaw, prodConfirm });

  // ── Batch path: replace transfers with batch evaluator output ──
  const sources = prodRaw.sources;
  const ampAuth = getPerSubwooferAmplifierAuthority(sources);
  const sourcesWithCurves = sources.map((src, si) => ({
    ...src, sourceCurve: applyDerating(getSubwooferCurve(src.modelKey), ampAuth.sourceAuthorities[si]?.deratingDb ?? 0),
  }));

  const listeners = [{ id: 'rsp', x: RSP_POSITION.x, y: RSP_POSITION.y, z: RSP_POSITION.z }, ...SEATING_POSITIONS];
  const batchEval = evaluateBatchModalTransfers({
    roomDims: ROOM_DIMS, sources: sourcesWithCurves, listeners,
    precomputedModes, physics: PHYSICS, qStrategyOverride: 'ab_corrected',
  });

  // Convert batch transfers to production format
  const batchTransfers = batchEval.perSourcePerListenerTransfers.map(t => ({
    sourceIndex: t.sourceIndex, seatId: t.listenerId, points: t.points,
  }));

  // Re-sum with auto-align tuning (same as evaluateStage2Placement)
  const batchSeatResponses = resumWithTuning(batchTransfers, prodRaw.autoAlignTuning, prodRaw.seatIds);
  const { rspRawCurve, perSeatRawCurves } = buildResponseCurves(batchSeatResponses);

  const seatPriorityMap = new Map(prodRaw.seatPriorityMap);
  const perSeatWithPriority = perSeatRawCurves.map(seat => ({
    ...seat, isPrimary: seatPriorityMap.get(String(seat.seatId)) === 'primary',
  }));

  const batchRaw = {
    ...prodRaw, rspRawCurve, perSeatRawCurves: perSeatWithPriority,
    perSourcePerSeatComplexTransfers: batchTransfers,
  };

  const batchConfirm = evaluateStage2Confirmation(batchRaw, {
    p14TargetBasis: CANONICAL_TARGET.basis, p14TargetLevel: CANONICAL_TARGET.level,
    p14TargetDb: CANONICAL_TARGET.db, p18TargetBasis: 'minimum',
  });
  batchResults.push({ finalist, batchConfirm });
}

const prodPlaceEnd = performance.now();
console.log(`\nTotal placement+confirmation time: ${(prodPlaceEnd - prodPlaceStart).toFixed(0)} ms\n`);

// ── Compare ──
console.log('=== ASSEMBLY COMPARISON ===\n');
let allMatch = true;

for (let fi = 0; fi < FINALISTS.length; fi++) {
  const prod = prodResults[fi]?.prodConfirm;
  const batch = batchResults[fi]?.batchConfirm;
  if (!prod || !batch) { console.log(`Finalist ${fi}: MISSING`); allMatch = false; continue; }

  const p14Match = prod.p14AchievedDb === batch.p14AchievedDb
    || Math.abs((prod.p14AchievedDb ?? 0) - (batch.p14AchievedDb ?? 0)) < 1e-6;
  const p18Match = prod.achievedP18Hz === batch.achievedP18Hz
    || Math.abs((prod.achievedP18Hz ?? 0) - (batch.achievedP18Hz ?? 0)) < 1e-6;
  const p19Match = Math.abs((prod.achievedP19VariationDb ?? 0) - (batch.achievedP19VariationDb ?? 0)) < 1e-6;
  const p20Match = Math.abs((prod.achievedP20VariationDb ?? 0) - (batch.achievedP20VariationDb ?? 0)) < 1e-6;
  const p14LevelMatch = prod.p14AchievedLevel === batch.p14AchievedLevel;
  const p18LevelMatch = prod.p18AchievedLevel === batch.p18AchievedLevel;
  const limitedMatch = prod.limited === batch.limited;

  // Per-seat P19/P20
  let perSeatP19Match = true, perSeatP20Match = true;
  for (let si = 0; si < (prod.perSeatP19?.length || 0); si++) {
    const ps = prod.perSeatP19[si], bs = batch.perSeatP19?.[si];
    if (!bs || Math.abs((ps.variationDbRaw ?? 0) - (bs.variationDbRaw ?? 0)) > 1e-6 || ps.level !== bs.level) {
      perSeatP19Match = false;
    }
  }
  for (let si = 0; si < (prod.perSeatP20?.length || 0); si++) {
    const ps = prod.perSeatP20[si], bs = batch.perSeatP20?.[si];
    if (!bs || Math.abs((ps.variationDbRaw ?? 0) - (bs.variationDbRaw ?? 0)) > 1e-6 || ps.level !== bs.level) {
      perSeatP20Match = false;
    }
  }

  const match = p14Match && p18Match && p19Match && p20Match && p14LevelMatch && p18LevelMatch && limitedMatch && perSeatP19Match && perSeatP20Match;
  if (!match) allMatch = false;

  console.log(`Finalist ${fi} (${FINALISTS[fi].familyId}): ${match ? 'MATCH' : 'MISMATCH'}`);
  console.log(`  P14: prod=${prod.p14AchievedDb?.toFixed(4)} batch=${batch.p14AchievedDb?.toFixed(4)} ${p14Match ? '✓' : '✗'} (level: ${prod.p14AchievedLevel} vs ${batch.p14AchievedLevel} ${p14LevelMatch ? '✓' : '✗'})`);
  console.log(`  P18: prod=${prod.achievedP18Hz?.toFixed(4)} batch=${batch.achievedP18Hz?.toFixed(4)} ${p18Match ? '✓' : '✗'} (level: ${prod.p18AchievedLevel} vs ${batch.p18AchievedLevel} ${p18LevelMatch ? '✓' : '✗'})`);
  console.log(`  P19: prod=${prod.achievedP19VariationDb?.toFixed(6)} batch=${batch.achievedP19VariationDb?.toFixed(6)} ${p19Match ? '✓' : '✗'}`);
  console.log(`  P20: prod=${prod.achievedP20VariationDb?.toFixed(6)} batch=${batch.achievedP20VariationDb?.toFixed(6)} ${p20Match ? '✓' : '✗'}`);
  console.log(`  limited: prod=${prod.limited} batch=${batch.limited} ${limitedMatch ? '✓' : '✗'}`);
  console.log(`  per-seat P19: ${perSeatP19Match ? '✓' : '✗'}  per-seat P20: ${perSeatP20Match ? '✓' : '✗'}`);

  if (!perSeatP19Match && prod.perSeatP19) {
    for (let si = 0; si < prod.perSeatP19.length; si++) {
      const ps = prod.perSeatP19[si], bs = batch.perSeatP19?.[si];
      if (!bs || Math.abs((ps.variationDbRaw ?? 0) - (bs.variationDbRaw ?? 0)) > 1e-6) {
        console.log(`    P19 seat ${ps.seatId}: prod=${ps.variationDbRaw?.toFixed(6)} (${ps.level}) batch=${bs?.variationDbRaw?.toFixed(6)} (${bs?.level})`);
      }
    }
  }
  if (!perSeatP20Match && prod.perSeatP20) {
    for (let si = 0; si < prod.perSeatP20.length; si++) {
      const ps = prod.perSeatP20[si], bs = batch.perSeatP20?.[si];
      if (!bs || Math.abs((ps.variationDbRaw ?? 0) - (bs.variationDbRaw ?? 0)) > 1e-6) {
        console.log(`    P20 seat ${ps.seatId}: prod=${ps.variationDbRaw?.toFixed(6)} (${ps.level}) batch=${bs?.variationDbRaw?.toFixed(6)} (${bs?.level})`);
      }
    }
  }
}

// ── Finalist ordering ──
console.log('\n=== FINALIST ORDERING ===');
const prodOrder = [...prodResults].sort((a, b) => (a.prodConfirm?.achievedP19VariationDb ?? Infinity) - (b.prodConfirm?.achievedP19VariationDb ?? Infinity));
const batchOrder = [...batchResults].sort((a, b) => (a.batchConfirm?.achievedP19VariationDb ?? Infinity) - (b.batchConfirm?.achievedP19VariationDb ?? Infinity));
const orderMatch = prodOrder.every((p, i) => p.finalist.id === batchOrder[i]?.finalist.id);
console.log(`  Production order: ${prodOrder.map(r => r.finalist.familyId).join(' → ')}`);
console.log(`  Batch order:      ${batchOrder.map(r => r.finalist.familyId).join(' → ')}`);
console.log(`  Ordering match: ${orderMatch ? 'YES' : 'NO'}`);

console.log(`\n=== VERDICT ===`);
console.log(`  ${allMatch && orderMatch ? 'ASSEMBLY PARITY: PASS — all finalists match' : 'ASSEMBLY PARITY: FAIL'}`);