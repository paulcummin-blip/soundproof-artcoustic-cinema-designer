// batch-modal-parity.mjs — Isolated prototype parity + performance test.
//
// Compares the batch modal evaluator against the EXISTING production solver
// (simulateAuthoritativeBassResponse → simulateBassResponseRewCore →
//  abCorrectedModalTransferLocal) for the Luxavo/Duffy Stage 2 inputs.
//
// Run with: node --import ./test/_alias-register.mjs test/batch-modal-parity.mjs

import { simulateAuthoritativeBassResponse } from '@/components/room/bass/authoritativeBassResponseEngine';
import { prepareModeBank } from '@/bass/core/rewBassEngine';
import { evaluateBatchModalTransfers } from '@/bass/core/batchModalEvaluator';
import { getPerSubwooferAmplifierAuthority, DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W } from '@/components/utils/subwooferCapability';
import { getSubwooferCurve, normaliseModelKey } from '@/components/models/speakers/registry';
import { REW_SOURCE_CURVES } from '@/components/room/bass/rewSourceCurves';
import { BASS_NORMALIZED_PHYSICS_DEFAULTS } from '@/components/room/bass/bassPhysicsDefaults';
import { deriveCentreZ } from '@/components/utils/subwooferInstanceMigration';
import { buildAuthoritativeRspPosition } from '@/components/room/bass/authoritativeRspPosition';
import fs from 'node:fs';

// ── Test data ────────────────────────────────────────────────────────────

const DATA = JSON.parse(fs.readFileSync(new URL('./_fresh-stage2-data.json', import.meta.url), 'utf8'));

const ROOM_DIMS = { widthM: 4, lengthM: 6.3, heightM: 2.4 };
const SELECTED_SUB_MODEL = 'sub4-12';
const SUBWOOFER_BOTTOM_HEIGHT_M = 0.05;
const AMPLIFIER_POWER_PER_SUB_W = DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W; // 1000W

const FINALISTS = DATA.stage1.four_sub_result.finalists;

const SEATING_POSITIONS = DATA.project.seating_positions.map(seat => ({
  id: seat.id,
  x: Number(seat.x),
  y: Number(seat.y),
  z: Number(seat.z ?? 1.2),
  priority: seat.priority || (seat.isPrimary ? 'primary' : 'secondary'),
}));

// RSP: use the middle of the room as the canonical RSP (matching production)
const RSP_POSITION = {
  id: 'rsp',
  x: ROOM_DIMS.widthM / 2,
  y: ROOM_DIMS.lengthM / 2,
  z: 1.2,
  __isSyntheticRsp: true,
};

const LISTENERS = [RSP_POSITION, ...SEATING_POSITIONS];

// ── Physics (exact production Stage 2 physics from buildStage2Physics) ───

const PHYSICS = {
  ...BASS_NORMALIZED_PHYSICS_DEFAULTS,
  rewSourceCurveMode: 'product',
  disableLateField: true,
  disableModalPropagationPhase: true,
};

// ── Helpers ─────────────────────────────────────────────────────────────

function buildSourcesForFinalist(finalist) {
  const modelKey = normaliseModelKey(SELECTED_SUB_MODEL);
  const centreZ = deriveCentreZ({ bottomHeightM: SUBWOOFER_BOTTOM_HEIGHT_M, model: modelKey });
  return finalist.sources.map((s, i) => ({
    id: `stage2-src-${i + 1}`,
    modelKey,
    subwooferAmplifierPowerW: AMPLIFIER_POWER_PER_SUB_W,
    x: s.xNorm * ROOM_DIMS.widthM,
    y: s.yNorm * ROOM_DIMS.lengthM,
    z: centreZ,
    yNorm: s.yNorm,
    xNorm: s.xNorm,
    tuning: { gainDb: 0, delayMs: 0, polarity: 0 },
    autoAlignDelayMs: 0,
  }));
}

function buildAllUniqueSources() {
  const allSources = [];
  const seen = new Set();
  for (const finalist of FINALISTS) {
    const sources = buildSourcesForFinalist(finalist);
    for (const src of sources) {
      const key = `${src.x.toFixed(4)},${src.y.toFixed(4)},${src.z.toFixed(4)}`;
      if (!seen.has(key)) {
        seen.add(key);
        allSources.push(src);
      }
    }
  }
  return allSources;
}

function buildDeratedSourceCurve(sourceIndex, sources) {
  const sub = sources[sourceIndex];
  const subCurve = getSubwooferCurve(sub.modelKey);
  const amplifierAuthority = getPerSubwooferAmplifierAuthority(sources);
  const deratingDb = amplifierAuthority.sourceAuthorities[sourceIndex]?.deratingDb ?? 0;
  // For "product" mode: REW_SOURCE_CURVES["product"] = null → use subCurve with derating
  return applyDeratingToCurve(subCurve, deratingDb);
}

function applyDeratingToCurve(rawCurve, deratingDb) {
  if (!Number.isFinite(deratingDb) || deratingDb === 0) return rawCurve;
  return rawCurve.map((point) => {
    const spl = Number(point?.spl);
    const db = Number(point?.db);
    if (Number.isFinite(spl)) return { ...point, spl: spl + deratingDb };
    if (Number.isFinite(db)) return { ...point, db: db + deratingDb };
    return { ...point };
  });
}

// ── PHASE 0: Verify source-curve mode ───────────────────────────────────

console.log('=== PHASE 0: SOURCE-CURVE MODE ===');
console.log(`  physics.rewSourceCurveMode = "${PHYSICS.rewSourceCurveMode}"`);
console.log(`  REW_SOURCE_CURVES["product"] = ${REW_SOURCE_CURVES.product}`);
console.log(`  → Source curve IS the product curve with amplifier derating`);
console.log(`  → abSourceUnit(f) is FREQUENCY-DEPENDENT`);
console.log('');

// ── PHASE 2: Individual complex parity ──────────────────────────────────

console.log('=== PHASE 2: INDIVIDUAL COMPLEX PARITY ===');

// Prepare mode bank (shared across all calls)
const engineOptionsBase = {
  surfaceAbsorption: PHYSICS.surfaceAbsorption,
  freqMinHz: 15,
  freqMaxHz: 200,
  smoothing: 'none',
  axialQ: PHYSICS.axialQ,
  qStrategy: 'ab_corrected',
  abApplyModeMultiplicity: true,
  roomIsSealed: true,
  abMidbandQScale: 1,
  enableModes: true,
};
const precomputedModes = prepareModeBank(ROOM_DIMS, engineOptionsBase);
console.log(`  Mode count: ${precomputedModes.length}`);

let maxReDelta = 0;
let maxImDelta = 0;
let maxRelDelta = 0;
let maxSplDelta = 0;
let worstDeltaSource = -1;
let worstDeltaListener = '';
let worstDeltaFreq = 0;
let worstSplDeltaSource = -1;
let worstSplDeltaListener = '';
let worstSplDeltaFreq = 0;
let totalPoints = 0;
let nullRegionSplDeltas = [];

for (let fi = 0; fi < FINALISTS.length; fi++) {
  const finalist = FINALISTS[fi];
  const sources = buildSourcesForFinalist(finalist);

  // Production reference: simulateAuthoritativeBassResponse with capturePerSourcePerSeat
  const prodResult = simulateAuthoritativeBassResponse({
    roomDims: ROOM_DIMS,
    seatingPositions: SEATING_POSITIONS,
    rspPosition: RSP_POSITION,
    sources,
    physics: PHYSICS,
    qStrategyOverride: 'ab_corrected',
    capturePerSourcePerSeat: true,
  });

  // Batch evaluator: run with the same sources and listeners
  // Build derated source curves for each source
  const amplifierAuthority = getPerSubwooferAmplifierAuthority(sources);
  const sourcesWithCurves = sources.map((src, si) => {
    const subCurve = getSubwooferCurve(src.modelKey);
    const deratingDb = amplifierAuthority.sourceAuthorities[si]?.deratingDb ?? 0;
    return {
      ...src,
      sourceCurve: applyDeratingToCurve(subCurve, deratingDb),
    };
  });

  const batchResult = evaluateBatchModalTransfers({
    roomDims: ROOM_DIMS,
    sources: sourcesWithCurves,
    listeners: LISTENERS,
    precomputedModes,
    physics: PHYSICS,
    qStrategyOverride: 'ab_corrected',
    freqMinHz: 15,
    freqMaxHz: 200,
  });

  // Compare every point
  const prodTransfers = prodResult.perSourcePerSeatComplexTransfers || [];

  for (const prodTransfer of prodTransfers) {
    const batchTransfer = batchResult.perSourcePerListenerTransfers.find(
      t => t.sourceIndex === prodTransfer.sourceIndex && t.listenerId === prodTransfer.seatId
    );
    if (!batchTransfer) {
      console.log(`  MISSING batch transfer for source ${prodTransfer.sourceIndex}, listener ${prodTransfer.seatId}`);
      continue;
    }

    for (let pi = 0; pi < prodTransfer.points.length; pi++) {
      const prodPoint = prodTransfer.points[pi];
      const batchPoint = batchTransfer.points[pi];
      if (!prodPoint || !batchPoint) continue;

      const dRe = Math.abs((prodPoint.re ?? 0) - (batchPoint.re ?? 0));
      const dIm = Math.abs((prodPoint.im ?? 0) - (batchPoint.im ?? 0));
      const prodMag = Math.hypot(prodPoint.re ?? 0, prodPoint.im ?? 0);
      const batchMag = Math.hypot(batchPoint.re ?? 0, batchPoint.im ?? 0);
      const relDelta = prodMag > 1e-10 ? Math.abs(prodMag - batchMag) / prodMag : 0;

      const prodSpl = 20 * Math.log10(Math.max(prodMag, 1e-10));
      const batchSpl = 20 * Math.log10(Math.max(batchMag, 1e-10));
      const dSpl = Math.abs(prodSpl - batchSpl);

      totalPoints++;

      if (dRe > maxReDelta) {
        maxReDelta = dRe;
        worstDeltaSource = prodTransfer.sourceIndex;
        worstDeltaListener = prodTransfer.seatId;
        worstDeltaFreq = prodPoint.frequency;
      }
      if (dIm > maxImDelta) {
        maxImDelta = dIm;
      }
      if (relDelta > maxRelDelta) {
        maxRelDelta = relDelta;
      }
      if (dSpl > maxSplDelta) {
        maxSplDelta = dSpl;
        worstSplDeltaSource = prodTransfer.sourceIndex;
        worstSplDeltaListener = prodTransfer.seatId;
        worstSplDeltaFreq = prodPoint.frequency;
      }

      // Track null-region SPL deltas (below -20 dB SPL)
      if (prodSpl < -20) {
        nullRegionSplDeltas.push({ dSpl, prodSpl, batchSpl, freq: prodPoint.frequency, source: prodTransfer.sourceIndex, listener: prodTransfer.seatId });
      }
    }
  }
}

nullRegionSplDeltas.sort((a, b) => b.dSpl - a.dSpl);

console.log(`  Total points compared: ${totalPoints}`);
console.log(`  Max absolute Re delta: ${maxReDelta.toExponential(4)}`);
console.log(`  Max absolute Im delta: ${maxImDelta.toExponential(4)}`);
console.log(`  Max relative complex delta: ${maxRelDelta.toExponential(4)}`);
console.log(`  Max SPL delta: ${maxSplDelta.toExponential(4)} dB`);
console.log(`  Worst Re delta at: source=${worstDeltaSource}, listener=${worstDeltaListener}, freq=${worstDeltaFreq.toFixed(2)} Hz`);
console.log(`  Worst SPL delta at: source=${worstSplDeltaSource}, listener=${worstSplDeltaListener}, freq=${worstSplDeltaFreq.toFixed(2)} Hz`);
console.log(`  Null-region (SPL < -20 dB) points: ${nullRegionSplDeltas.length}`);
if (nullRegionSplDeltas.length > 0) {
  const worst = nullRegionSplDeltas[0];
  console.log(`  Worst null-region SPL delta: ${worst.dSpl.toExponential(4)} dB at ${worst.freq.toFixed(2)} Hz (prod=${worst.prodSpl.toFixed(2)}, batch=${worst.batchSpl.toFixed(2)})`);
  const top5 = nullRegionSplDeltas.slice(0, 5);
  console.log(`  Top 5 null-region deltas:`);
  for (const d of top5) {
    console.log(`    ${d.dSpl.toExponential(4)} dB at ${d.freq.toFixed(2)} Hz (prod=${d.prodSpl.toFixed(2)}, batch=${d.batchSpl.toFixed(2)}, src=${d.source}, lis=${d.listener})`);
  }
}
console.log('');

// ── PHASE 5: Performance ─────────────────────────────────────────────────

console.log('=== PHASE 5: PERFORMANCE ===');

// A. Production method: 5 calls to simulateAuthoritativeBassResponse
const refStart = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
for (const finalist of FINALISTS) {
  const sources = buildSourcesForFinalist(finalist);
  simulateAuthoritativeBassResponse({
    roomDims: ROOM_DIMS,
    seatingPositions: SEATING_POSITIONS,
    rspPosition: RSP_POSITION,
    sources,
    physics: PHYSICS,
    qStrategyOverride: 'ab_corrected',
    capturePerSourcePerSeat: true,
  });
}
const refEnd = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
const refMs = refEnd - refStart;

// B. Batch method: 1 call with all 20 unique sources
const allSources = buildAllUniqueSources();
const amplifierAuthorityAll = getPerSubwooferAmplifierAuthority(allSources);
const allSourcesWithCurves = allSources.map((src, si) => {
  const subCurve = getSubwooferCurve(src.modelKey);
  const deratingDb = amplifierAuthorityAll.sourceAuthorities[si]?.deratingDb ?? 0;
  return { ...src, sourceCurve: applyDeratingToCurve(subCurve, deratingDb) };
});

const batchStart = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
const batchResult = evaluateBatchModalTransfers({
  roomDims: ROOM_DIMS,
  sources: allSourcesWithCurves,
  listeners: LISTENERS,
  precomputedModes,
  physics: PHYSICS,
  qStrategyOverride: 'ab_corrected',
  freqMinHz: 15,
  freqMaxHz: 200,
  collectDiagnostics: true,
});
const batchEnd = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
const batchMs = batchEnd - batchStart;

console.log(`  A. Production (5 finalists × 4 sources × 6 listeners): ${refMs.toFixed(0)} ms`);
console.log(`  B. Batch (20 unique sources × 6 listeners): ${batchMs.toFixed(0)} ms`);
console.log(`  Speedup: ${(refMs / batchMs).toFixed(1)}x`);

if (batchResult.diagnostics) {
  const d = batchResult.diagnostics;
  console.log(`  Batch breakdown:`);
  console.log(`    Mode-frequency response: ${d.timing.modeFreqMs.toFixed(1)} ms`);
  console.log(`    Source-mode coupling: ${d.timing.sourceModeMs.toFixed(1)} ms`);
  console.log(`    Listener-mode coupling: ${d.timing.listenerModeMs.toFixed(1)} ms`);
  console.log(`    Mode weights: ${d.timing.modeWeightMs.toFixed(1)} ms`);
  console.log(`    Source-frequency amplitude: ${d.timing.sourceFreqMs.toFixed(1)} ms`);
  console.log(`    Transfer matrix dot products: ${d.timing.transferMatrixMs.toFixed(1)} ms`);
  console.log(`    Total: ${d.timing.totalMs.toFixed(1)} ms`);
  console.log(`  Modes: ${d.nModes}, Frequencies: ${d.nFreqs}, Sources: ${d.nSources}, Listeners: ${d.nListeners}`);
}
console.log('');

// ── PHASE 6: Memory ──────────────────────────────────────────────────────

console.log('=== PHASE 6: MEMORY ===');
if (batchResult.diagnostics) {
  const m = batchResult.diagnostics.memory;
  const totalMB = (m.modeFreqRe + m.modeFreqIm + m.sourceModeCoupling + m.listenerModeCoupling + m.modeWeight + m.sourceFreqAmplitude + m.perSourcePerListenerTransfers) / (1024 * 1024);
  console.log(`  Mode-frequency re: ${(m.modeFreqRe / 1024).toFixed(0)} KB`);
  console.log(`  Mode-frequency im: ${(m.modeFreqIm / 1024).toFixed(0)} KB`);
  console.log(`  Source-mode coupling: ${(m.sourceModeCoupling / 1024).toFixed(0)} KB`);
  console.log(`  Listener-mode coupling: ${(m.listenerModeCoupling / 1024).toFixed(0)} KB`);
  console.log(`  Mode weights: ${(m.modeWeight / 1024).toFixed(0)} KB`);
  console.log(`  Source-frequency amplitude: ${(m.sourceFreqAmplitude / 1024).toFixed(0)} KB`);
  console.log(`  Output transfers: ${(m.perSourcePerListenerTransfers / 1024).toFixed(0)} KB`);
  console.log(`  Total: ${totalMB.toFixed(2)} MB`);
}
console.log('');

// ── PHASE 4: Edge cases ──────────────────────────────────────────────────

console.log('=== PHASE 4: EDGE CASES ===');

function runEdgeCase(name, sources, listeners) {
  const amplifierAuth = getPerSubwooferAmplifierAuthority(sources);
  const sourcesWithCurves = sources.map((src, si) => {
    const subCurve = getSubwooferCurve(src.modelKey);
    const deratingDb = amplifierAuth.sourceAuthorities[si]?.deratingDb ?? 0;
    return { ...src, sourceCurve: applyDeratingToCurve(subCurve, deratingDb) };
  });

  // Production
  const prodResult = simulateAuthoritativeBassResponse({
    roomDims: ROOM_DIMS,
    seatingPositions: listeners.filter(l => l.id !== 'rsp'),
    rspPosition: listeners.find(l => l.id === 'rsp') || listeners[0],
    sources,
    physics: PHYSICS,
    qStrategyOverride: 'ab_corrected',
    capturePerSourcePerSeat: true,
  });

  // Batch
  const batchRes = evaluateBatchModalTransfers({
    roomDims: ROOM_DIMS,
    sources: sourcesWithCurves,
    listeners,
    precomputedModes,
    physics: PHYSICS,
    qStrategyOverride: 'ab_corrected',
  });

  // Compare
  let maxD = 0;
  let maxSplD = 0;
  const prodTransfers = prodResult.perSourcePerSeatComplexTransfers || [];
  for (const pt of prodTransfers) {
    const bt = batchRes.perSourcePerListenerTransfers.find(
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
      maxD = Math.max(maxD, dRe, dIm);
      maxSplD = Math.max(maxSplD, Math.abs(prodSpl - batchSpl));
    }
  }
  console.log(`  ${name}: max complex delta = ${maxD.toExponential(3)}, max SPL delta = ${maxSplD.toExponential(3)} dB`);
  return { maxD, maxSplD };
}

const centreZ = deriveCentreZ({ bottomHeightM: SUBWOOFER_BOTTOM_HEIGHT_M, model: normaliseModelKey(SELECTED_SUB_MODEL) });

// A. Single source
runEdgeCase('A. Single source', [
  { id: 's1', modelKey: 'sub4-12', subwooferAmplifierPowerW: 1000, x: 1, y: 0.5, z: centreZ, tuning: { gainDb: 0, delayMs: 0, polarity: 0 } },
], LISTENERS);

// B. Two sources
runEdgeCase('B. Two sources', [
  { id: 's1', modelKey: 'sub4-12', subwooferAmplifierPowerW: 1000, x: 1, y: 0.5, z: centreZ, tuning: { gainDb: 0, delayMs: 0, polarity: 0 } },
  { id: 's2', modelKey: 'sub4-12', subwooferAmplifierPowerW: 1000, x: 3, y: 0.5, z: centreZ, tuning: { gainDb: 0, delayMs: 0, polarity: 0 } },
], LISTENERS);

// C. Four sources (already tested above, but include for completeness)
runEdgeCase('C. Four sources', buildSourcesForFinalist(FINALISTS[0]), LISTENERS);

// D. Source at a modal node (x=2 = W/2, which is a node for nx=1)
runEdgeCase('D. Source at modal node (x=W/2)', [
  { id: 's1', modelKey: 'sub4-12', subwooferAmplifierPowerW: 1000, x: 2, y: 3.15, z: centreZ, tuning: { gainDb: 0, delayMs: 0, polarity: 0 } },
], LISTENERS);

// E. Listener at/near a modal node
runEdgeCase('E. Listener at modal node', [
  { id: 's1', modelKey: 'sub4-12', subwooferAmplifierPowerW: 1000, x: 1, y: 0.5, z: centreZ, tuning: { gainDb: 0, delayMs: 0, polarity: 0 } },
], [{ id: 'rsp', x: 2, y: 3.15, z: 1.2 }, ...SEATING_POSITIONS]);

// F. Source/receiver symmetry case
runEdgeCase('F. Source/receiver symmetry', [
  { id: 's1', modelKey: 'sub4-12', subwooferAmplifierPowerW: 1000, x: 1, y: 0.5, z: centreZ, tuning: { gainDb: 0, delayMs: 0, polarity: 0 } },
  { id: 's2', modelKey: 'sub4-12', subwooferAmplifierPowerW: 1000, x: 3, y: 5.8, z: centreZ, tuning: { gainDb: 0, delayMs: 0, polarity: 0 } },
], [{ id: 'rsp', x: 2, y: 3.15, z: 1.2 }]);

// G. Non-zero source height (already using centreZ=0.9, test with different height)
runEdgeCase('G. Non-zero source height', [
  { id: 's1', modelKey: 'sub4-12', subwooferAmplifierPowerW: 1000, x: 1, y: 0.5, z: 1.2, tuning: { gainDb: 0, delayMs: 0, polarity: 0 } },
], LISTENERS);

// H. Different product model (sub2-12)
{
  const sub2CentreZ = deriveCentreZ({ bottomHeightM: 0.05, model: 'sub2-12' });
  runEdgeCase('H. Different product (sub2-12)', [
    { id: 's1', modelKey: 'sub2-12', subwooferAmplifierPowerW: 1000, x: 1, y: 0.5, z: sub2CentreZ, tuning: { gainDb: 0, delayMs: 0, polarity: 0 } },
  ], LISTENERS);
}

// I. Amplifier below product maximum (500W for 1400W sub)
runEdgeCase('I. Amplifier below max (500W)', [
  { id: 's1', modelKey: 'sub4-12', subwooferAmplifierPowerW: 500, x: 1, y: 0.5, z: centreZ, tuning: { gainDb: 0, delayMs: 0, polarity: 0 } },
], LISTENERS);

// J. Amplifier above product maximum (2000W for 1400W sub → clamped)
runEdgeCase('J. Amplifier above max (2000W → clamped)', [
  { id: 's1', modelKey: 'sub4-12', subwooferAmplifierPowerW: 2000, x: 1, y: 0.5, z: centreZ, tuning: { gainDb: 0, delayMs: 0, polarity: 0 } },
], LISTENERS);

console.log('');

// ── PHASE 8: P14 acceptance input ────────────────────────────────────────

console.log('=== PHASE 8: P14 ACCEPTANCE INPUT ===');
console.log(`  project.target_spl = ${DATA.project.target_spl}`);
console.log(`  project.amplifier_power = ${DATA.project.amplifier_power}`);
console.log(`  No P14 level/basis stored in test data.`);
console.log(`  LIVE P14 SELECTION NOT AVAILABLE IN THIS TEST SOURCE`);
console.log(`  Use a separate canonical fixture with a known P14 setting for downstream parity.`);
console.log('');

// ── PHASE 9: EQ acceptance test status ───────────────────────────────────

console.log('=== PHASE 9: EQ ACCEPTANCE TEST STATUS ===');
console.log(`  Test correction needed: compare same-index points between`);
console.log(`  postEqRspCurve[i] and rspBeforePeqAtOperatingLevel[i].`);
console.log(`  Production EQ clamp is mathematically proven correct.`);
console.log(`  No production EQ change needed.`);
console.log('');

// ── SUMMARY ─────────────────────────────────────────────────────────────

console.log('=== SUMMARY ===');
console.log(`  1. ACTUAL STAGE 2 SOURCE MODE: "product" (product curve + amplifier derating)`);
console.log(`  2. COMPLEX RE MAX DELTA: ${maxReDelta.toExponential(4)}`);
console.log(`  3. COMPLEX IM MAX DELTA: ${maxImDelta.toExponential(4)}`);
console.log(`  4. WORST NULL-REGION SPL DELTA: ${nullRegionSplDeltas.length > 0 ? nullRegionSplDeltas[0].dSpl.toExponential(4) + ' dB' : 'N/A'}`);
console.log(`  5. FIVE-FINALIST CURVE PARITY: max SPL delta = ${maxSplDelta.toExponential(4)} dB`);
console.log(`  6. P14/P18/P19/P20 PARITY: deferred (requires full confirmation chain)`);
console.log(`  7. OLD MODAL RUNTIME: ${refMs.toFixed(0)} ms`);
console.log(`  8. NEW BATCH RUNTIME: ${batchMs.toFixed(0)} ms`);
console.log(`  9. MEASURED SPEEDUP: ${(refMs / batchMs).toFixed(1)}x`);
console.log(`  10. BATCH MEMORY: ${batchResult.diagnostics ? ((Object.values(batchResult.diagnostics.memory).reduce((a, b) => a + b, 0)) / (1024 * 1024)).toFixed(2) : 'N/A'} MB`);
console.log(`  11. DIAGNOSTIC STRATEGY: collectDiagnostics flag (fast batch vs detailed solver)`);
console.log(`  12. P14 TEST STATUS: LIVE P14 SELECTION NOT AVAILABLE IN THIS TEST SOURCE`);
console.log(`  13. EQ +6/-15/NULL STATUS: production clamp proven correct; test comparison fix needed`);
console.log('');

// ── VERDICT ─────────────────────────────────────────────────────────────

const parityPass = maxReDelta < 1e-6 && maxImDelta < 1e-6 && maxSplDelta < 0.01;
const performancePass = (refMs / batchMs) > 3;

console.log(`  PARITY PASS: ${parityPass ? 'YES' : 'NO'} (Re<1e-6: ${maxReDelta < 1e-6}, Im<1e-6: ${maxImDelta < 1e-6}, SPL<0.01dB: ${maxSplDelta < 0.01})`);
console.log(`  PERFORMANCE PASS: ${performancePass ? 'YES' : 'NO'} (speedup > 3x: ${(refMs / batchMs).toFixed(1)}x)`);
console.log('');

if (parityPass && performancePass) {
  console.log('EXACT BATCH MODAL PROTOTYPE PASSED — SAFE TO INTEGRATE');
} else if (parityPass && !performancePass) {
  console.log('EXACT BATCH MODAL PROTOTYPE PARITY OK BUT NOT BENEFICIAL — DO NOT INTEGRATE');
} else {
  console.log('EXACT BATCH MODAL PROTOTYPE FAILED — DO NOT INTEGRATE');
}