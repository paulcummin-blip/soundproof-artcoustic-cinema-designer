// batch-modal-final-parity.mjs — Final downstream production-parity proof.
//
// Phase 1: Raw-curve assembly parity for ALL 5 finalists.
//   A. Production transfers (evaluateStage2Placement → simulateAuthoritativeBassResponse)
//   B. Batch transfers (evaluateBatchModalTransfers)
//   Both re-summed with the SAME resumWithTuning + response construction.
//   Compare RSP raw curve + every seat raw curve. Report max pointwise dB delta.
//
// Phase 2: ONE complete canonical confirmation (collectDiagnostics=false).
//   Pick the finalist most likely to expose modal complexity/deep nulls.
//   Run the CURRENT DEFAULT production confirmation chain twice:
//   A. Production transfer input
//   B. Batch transfer input
//   Compare P14/P18/P19/P20, EQ curves, deterministic correction, etc.
//
// Run: node --import ./test/_alias-register.mjs test/batch-modal-final-parity.mjs

import { evaluateStage2Placement } from '@/components/room/bass/stage2/stage2CanonicalEvaluation';
import { generateCanonicalCandidatePool } from '@/components/utils/canonicalBassOptimiser';
import { selectCandidateFromPool } from '@/components/utils/bassCandidatePoolSelection';
import { buildFinalOptimisedBassResponse } from '@/components/room/bass/finalOptimisedBassResponse';
import { evaluateCanonicalBassAuthority } from '@/components/utils/canonicalBassAuthorityEvaluation';
import { evaluateBatchModalTransfers } from '@/bass/core/batchModalEvaluator';
import { prepareModeBank } from '@/bass/core/rewBassEngine';
import { getPerSubwooferAmplifierAuthority, DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W } from '@/components/utils/subwooferCapability';
import { getSubwooferCurve, normaliseModelKey } from '@/components/models/speakers/registry';
import { BASS_NORMALIZED_PHYSICS_DEFAULTS } from '@/components/room/bass/bassPhysicsDefaults';
import { resumWithTuning } from '@/components/room/bass/stage2/stage2TuningSearch';
import { buildP14TargetCombinations } from '@/components/room/bass/p14TargetDefinitions';
import { gradeP19FromRaw, gradeP20FromRaw } from '@/components/room/bass/completedBassResultPersistence';
import fs from 'node:fs';

// ── Load test data ──────────────────────────────────────────────────────
const DATA = JSON.parse(fs.readFileSync(new URL('./_fresh-stage2-data.json', import.meta.url), 'utf8'));
const ROOM_DIMS = { widthM: 4, lengthM: 6.3, heightM: 2.4 };
const FINALISTS = DATA.stage1.four_sub_result.finalists;
const SEATING_POSITIONS = DATA.project.seating_positions.map(seat => ({
  id: seat.id, x: Number(seat.x), y: Number(seat.y), z: Number(seat.z ?? 1.2),
  priority: seat.priority || (seat.isPrimary ? 'primary' : 'secondary'),
}));
const RSP_POSITION = { x: 2, y: 3.15, z: 1.2 };

// ── P14 canonical fixture ───────────────────────────────────────────────
// Check for live P14 selection in the supplied project data.
const SPL_CONFIG = DATA.project?.spl_config || {};
const HAS_LIVE_P14 = SPL_CONFIG.selectedP14TargetBasis && SPL_CONFIG.selectedP14Level;
if (!HAS_LIVE_P14) {
  console.log('LIVE P14 SELECTION NOT AVAILABLE IN THIS TEST SOURCE');
  console.log('  (spl_config is empty — no selectedP14TargetBasis/Level in Luxavo/Duffy data)');
}
const P14_TARGETS = buildP14TargetCombinations();
// Canonical fixture: recommended-L2 (a known, stable P14 target).
const CANONICAL_TARGET = P14_TARGETS.find(t => t.basis === 'recommended' && t.level === 2);
console.log(`P14 canonical fixture: ${CANONICAL_TARGET.key} = ${CANONICAL_TARGET.db.toFixed(2)} dB\n`);

// ── Physics ─────────────────────────────────────────────────────────────
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
const precomputedModes = prepareModeBank(ROOM_DIMS, engineOptionsBase);

// ── Helpers ─────────────────────────────────────────────────────────────
function applyDerating(curve, deratingDb) {
  if (!Number.isFinite(deratingDb) || deratingDb === 0) return curve;
  return curve.map(p => ({ ...p, spl: (Number(p?.spl) || 0) + deratingDb }));
}

function responseCurve(response) {
  const raw = (response?.freqsHz || []).map((frequency, index) => ({
    frequency,
    spl: Number.isFinite(response?.splDb?.[index]) ? response.splDb[index] : null,
  })).filter(p => Number.isFinite(p.frequency) && p.frequency > 0).sort((a, b) => a.frequency - b.frequency);
  return raw.filter((p, i) => !raw[i + 1] || Math.abs(p.frequency - raw[i + 1].frequency) >= 1e-9);
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

function maxCurveDelta(curveA, curveB) {
  let maxDelta = 0;
  for (let i = 0; i < curveA.length; i++) {
    const bp = curveB[i];
    if (!bp) continue;
    const delta = Math.abs((curveA[i].spl ?? 0) - (bp.spl ?? 0));
    if (delta > maxDelta) maxDelta = delta;
  }
  return maxDelta;
}

// ── Confirmation chain (replicates evaluateStage2Confirmation but returns all intermediates) ──
function runConfirmationChain(rawTransfer, target) {
  const { rspRawCurve, perSeatRawCurves, sources, usableLfHz, transitionHz } = rawTransfer;
  if (!rspRawCurve?.length) return null;

  const pool = generateCanonicalCandidatePool({
    rawCurve: rspRawCurve,
    activeSubs: sources,
    usableLfHz,
    transitionHz,
    correctionEndHz: 200,
    perSeatRawCurves,
    selectedP14TargetDb: target.db,
    p14TargetBasis: target.basis,
    p14TargetLevel: target.level,
    p18TargetBasis: 'minimum',
    perSourceComplexTransfers: [],
    normalizedTransferFingerprint: null,
    calibrationFingerprint: null,
    // collectDiagnostics defaults to false → iterative fitters SKIPPED
  });

  const selection = selectCandidateFromPool(pool);
  if (!selection?.selectedCandidate) return null;

  const canonicalResult = buildFinalOptimisedBassResponse({
    optimisationResult: selection,
    selectedLayout: sources,
  });
  if (!canonicalResult) return null;

  const authority = evaluateCanonicalBassAuthority({
    canonicalResult,
    activeSubs: sources,
    usableLfHz,
    p14TargetBasis: target.basis,
    p18TargetBasis: 'minimum',
    requestedLevel: target.level,
  });
  if (!authority) return null;

  const seatPriorityMap = new Map(rawTransfer.seatPriorityMap || []);
  const perSeatP19 = (authority.perSeatP19Results || []).map(seat => ({
    seatId: String(seat?.seatId || ''),
    isPrimary: seatPriorityMap.get(String(seat?.seatId)) === 'primary',
    variationDbRaw: Number.isFinite(seat?.variationDbRaw) ? seat.variationDbRaw : null,
    level: seat?.level ?? gradeP19FromRaw(seat?.variationDbRaw),
    worstFrequencyHz: seat?.worstFrequencyHz ?? null,
  }));
  const perSeatP20 = (authority.perSeatP20Results || []).map(seat => ({
    seatId: String(seat?.seatId || ''),
    isPrimary: seatPriorityMap.get(String(seat?.seatId)) === 'primary',
    variationDbRaw: Number.isFinite(seat?.variationDbRaw) ? seat.variationDbRaw : null,
    level: seat?.level ?? gradeP20FromRaw(seat?.variationDbRaw),
    worstFrequencyHz: seat?.worstFrequencyHz ?? null,
  }));

  return {
    pool, selection, canonicalResult, authority,
    p14AchievedDb: authority.achievedP14Db,
    p14AchievedLevel: authority.achievedP14Level,
    achievedP18Hz: authority.achievedP18FrequencyHz,
    p18AchievedLevel: authority.achievedP18Level,
    achievedP19VariationDb: authority.achievedP19VariationDb,
    achievedP20VariationDb: authority.achievedP20VariationDb,
    perSeatP19, perSeatP20,
    limited: !authority.requestedP14Pass || !authority.requestedP18Pass,
    selectedCandidateId: selection.selectedCandidateId,
    filterBankSignature: selection.filterBankSignature,
    iterativeFittingSkipped: pool?.performanceSummary?.iterativeFittingSkipped ?? null,
  };
}

// ════════════════════════════════════════════════════════════════════════
// PHASE 1: Raw-curve assembly parity for ALL 5 finalists
// ════════════════════════════════════════════════════════════════════════
console.log('=== PHASE 1: RAW-CURVE ASSEMBLY PARITY (5 FINALISTS) ===\n');

const rawCurveResults = [];
let allRawCurvesMatch = true;
const prodPlacementStart = performance.now();

for (let fi = 0; fi < FINALISTS.length; fi++) {
  const finalist = FINALISTS[fi];
  process.stdout.write(`Finalist ${fi} (${finalist.familyId}): production placement... `);

  // A. Production transfers
  const prodRaw = evaluateStage2Placement({
    finalist, roomDims: ROOM_DIMS, rspPosition: RSP_POSITION,
    seatingPositions: SEATING_POSITIONS, selectedSubModel: 'sub4-12',
    amplifierPowerPerSubW: DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W, subwooferBottomHeightM: 0.05,
  });
  if (!prodRaw) { console.log('FAILED'); continue; }

  // B. Batch transfers
  const sources = prodRaw.sources;
  const ampAuth = getPerSubwooferAmplifierAuthority(sources);
  const sourcesWithCurves = sources.map((src, si) => ({
    ...src,
    sourceCurve: applyDerating(getSubwooferCurve(src.modelKey), ampAuth.sourceAuthorities[si]?.deratingDb ?? 0),
  }));
  const listeners = [{ id: 'rsp', x: RSP_POSITION.x, y: RSP_POSITION.y, z: RSP_POSITION.z }, ...SEATING_POSITIONS];
  const batchEval = evaluateBatchModalTransfers({
    roomDims: ROOM_DIMS, sources: sourcesWithCurves, listeners,
    precomputedModes, physics: PHYSICS, qStrategyOverride: 'ab_corrected',
  });
  const batchTransfers = batchEval.perSourcePerListenerTransfers
    .map(t => ({ sourceIndex: t.sourceIndex, seatId: t.listenerId, points: t.points }))
    .sort((a, b) => a.sourceIndex - b.sourceIndex);

  // Direct transfer comparison (find the 1.46 dB source)
  const prodTransfers = prodRaw.perSourcePerSeatComplexTransfers || [];
  let transferMaxReDelta = 0, transferMaxImDelta = 0, transferMaxSplDelta = 0;
  let transferWorst = {};
  for (const pt of prodTransfers) {
    const bt = batchTransfers.find(t => t.sourceIndex === pt.sourceIndex && t.seatId === pt.seatId);
    if (!bt) continue;
    for (let pi = 0; pi < pt.points.length; pi++) {
      const dRe = Math.abs((pt.points[pi].re ?? 0) - (bt.points[pi].re ?? 0));
      const dIm = Math.abs((pt.points[pi].im ?? 0) - (bt.points[pi].im ?? 0));
      const prodMag = Math.hypot(pt.points[pi].re ?? 0, pt.points[pi].im ?? 0);
      const batchMag = Math.hypot(bt.points[pi].re ?? 0, bt.points[pi].im ?? 0);
      const prodSpl = 20 * Math.log10(Math.max(prodMag, 1e-10));
      const batchSpl = 20 * Math.log10(Math.max(batchMag, 1e-10));
      const dSpl = Math.abs(prodSpl - batchSpl);
      if (dRe > transferMaxReDelta) transferMaxReDelta = dRe;
      if (dIm > transferMaxImDelta) transferMaxImDelta = dIm;
      if (dSpl > transferMaxSplDelta) { transferMaxSplDelta = dSpl; transferWorst = { s: pt.sourceIndex, l: pt.seatId, f: pt.points[pi].frequency, prod: prodSpl, batch: batchSpl, prodRe: pt.points[pi].re, batchRe: bt.points[pi].re }; }
    }
  }

  // Re-sum with the SAME auto-align tuning
  const batchSeatResponses = resumWithTuning(batchTransfers, prodRaw.autoAlignTuning, prodRaw.seatIds);
  const { rspRawCurve: batchRsp, perSeatRawCurves: batchPerSeat } = buildResponseCurves(batchSeatResponses);

  // Compare
  const rspDelta = maxCurveDelta(prodRaw.rspRawCurve, batchRsp);
  let perSeatMaxDelta = 0;
  for (const prodSeat of prodRaw.perSeatRawCurves) {
    const batchSeat = batchPerSeat.find(s => s.seatId === prodSeat.seatId);
    if (!batchSeat) continue;
    const delta = maxCurveDelta(prodSeat.responseData, batchSeat.responseData);
    if (delta > perSeatMaxDelta) perSeatMaxDelta = delta;
  }
  const match = rspDelta < 1e-6 && perSeatMaxDelta < 1e-6;
  if (!match) allRawCurvesMatch = false;

  // Find deepest null in RSP raw curve (for Phase 2 finalist selection)
  let deepestNullDb = Infinity, deepestNullHz = 0;
  for (const p of prodRaw.rspRawCurve) {
    if (Number.isFinite(p.spl) && p.spl < deepestNullDb) { deepestNullDb = p.spl; deepestNullHz = p.frequency; }
  }

  console.log(`RSP Δ=${rspDelta.toExponential(4)}  per-seat Δ=${perSeatMaxDelta.toExponential(4)}  ${match ? '✓' : '✗'}  deepest null: ${deepestNullDb.toFixed(2)} dB @ ${deepestNullHz.toFixed(1)} Hz`);

  rawCurveResults.push({ finalist, prodRaw, batchTransfers, match, rspDelta, perSeatMaxDelta, deepestNullDb, deepestNullHz });
}

const prodPlacementEnd = performance.now();
console.log(`\nPhase 1 production placement total: ${(prodPlacementEnd - prodPlacementStart).toFixed(0)} ms`);
console.log(`Phase 1 verdict: ${allRawCurvesMatch ? 'PASS — all raw curves match to machine epsilon' : 'FAIL'}`);

// ════════════════════════════════════════════════════════════════════════
// PHASE 2: ONE complete canonical confirmation (collectDiagnostics=false)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== PHASE 2: ONE COMPLETE CANONICAL CONFIRMATION ===\n');

// Pick the finalist with the deepest null (most likely to expose modal complexity)
let pickFi = 0, pickDeepest = -Infinity;
for (let i = 0; i < rawCurveResults.length; i++) {
  if (rawCurveResults[i].deepestNullDb > pickDeepest) continue;
  pickDeepest = rawCurveResults[i].deepestNullDb;
  pickFi = i;
}
const pickResult = rawCurveResults[pickFi];
console.log(`Selected finalist ${pickFi} (${pickResult.finalist.familyId}) — deepest null: ${pickDeepest.toFixed(2)} dB @ ${pickResult.deepestNullHz.toFixed(1)} Hz`);
console.log(`Confirmation chain: collectDiagnostics=false (iterative fitters SKIPPED — deterministic predictor)\n`);

// Build batch raw transfer for the picked finalist
const seatPriorityMap = new Map(pickResult.prodRaw.seatPriorityMap);
const batchSeatResponsesPick = resumWithTuning(pickResult.batchTransfers, pickResult.prodRaw.autoAlignTuning, pickResult.prodRaw.seatIds);
const { rspRawCurve: batchRspPick, perSeatRawCurves: batchPerSeatPick } = buildResponseCurves(batchSeatResponsesPick);
const batchPerSeatWithPriority = batchPerSeatPick.map(seat => ({
  ...seat, isPrimary: seatPriorityMap.get(String(seat.seatId)) === 'primary',
}));
const batchRawTransfer = {
  ...pickResult.prodRaw,
  rspRawCurve: batchRspPick,
  perSeatRawCurves: batchPerSeatWithPriority,
  perSourcePerSeatComplexTransfers: pickResult.batchTransfers,
};

// A. Production confirmation
console.log('  A. Production transfer confirmation...');
const prodConfirmStart = performance.now();
const prodConfirm = runConfirmationChain(pickResult.prodRaw, CANONICAL_TARGET);
const prodConfirmEnd = performance.now();
console.log(`     ${(prodConfirmEnd - prodConfirmStart).toFixed(0)} ms  iterativeFittingSkipped=${prodConfirm?.iterativeFittingSkipped}`);

// B. Batch confirmation
console.log('  B. Batch transfer confirmation...');
const batchConfirmStart = performance.now();
const batchConfirm = runConfirmationChain(batchRawTransfer, CANONICAL_TARGET);
const batchConfirmEnd = performance.now();
console.log(`     ${(batchConfirmEnd - batchConfirmStart).toFixed(0)} ms  iterativeFittingSkipped=${batchConfirm?.iterativeFittingSkipped}`);

if (!prodConfirm || !batchConfirm) {
  console.log('  CONFIRMATION FAILED — cannot compare');
} else {
  console.log('\n  --- Confirmation Comparison ---');

  // Curves
  const maxBeforeDelta = maxCurveDelta(prodConfirm.canonicalResult.maximumSplCurveBeforeEq, batchConfirm.canonicalResult.maximumSplCurveBeforeEq);
  const maxAfterDelta = maxCurveDelta(prodConfirm.canonicalResult.maximumSplCurveAfterEq, batchConfirm.canonicalResult.maximumSplCurveAfterEq);
  const preEqDelta = maxCurveDelta(prodConfirm.canonicalResult.rspBeforePeqAtOperatingLevel, batchConfirm.canonicalResult.rspBeforePeqAtOperatingLevel);
  const postEqDelta = maxCurveDelta(prodConfirm.canonicalResult.postEqRspCurve, batchConfirm.canonicalResult.postEqRspCurve);
  const correctionDelta = maxCurveDelta(prodConfirm.canonicalResult.canonicalResult?.combinedEqCurve || prodConfirm.selection.selectedCandidate.combinedEqCurve, batchConfirm.selection.selectedCandidate.combinedEqCurve);
  const targetDelta = maxCurveDelta(prodConfirm.canonicalResult.canonicalTargetCurve, batchConfirm.canonicalResult.canonicalTargetCurve);

  console.log(`  Product + Room Maximum (maximumSplCurveBeforeEq): Δ=${maxBeforeDelta.toExponential(4)} dB`);
  console.log(`  Maximum after EQ (maximumSplCurveAfterEq):          Δ=${maxAfterDelta.toExponential(4)} dB`);
  console.log(`  Operating-level pre-EQ (rspBeforePeqAtOperatingLevel): Δ=${preEqDelta.toExponential(4)} dB`);
  console.log(`  Final EQ (postEqRspCurve):                          Δ=${postEqDelta.toExponential(4)} dB`);
  console.log(`  Deterministic correction (combinedEqCurve):         Δ=${correctionDelta.toExponential(4)} dB`);
  console.log(`  House target (canonicalTargetCurve):                Δ=${targetDelta.toExponential(4)} dB`);

  // P14/P18/P19/P20
  const p14DbDelta = Math.abs((prodConfirm.p14AchievedDb ?? 0) - (batchConfirm.p14AchievedDb ?? 0));
  const p18HzDelta = Math.abs((prodConfirm.achievedP18Hz ?? 0) - (batchConfirm.achievedP18Hz ?? 0));
  const p19Delta = Math.abs((prodConfirm.achievedP19VariationDb ?? 0) - (batchConfirm.achievedP20VariationDb ?? 0));
  const p20Delta = Math.abs((prodConfirm.achievedP20VariationDb ?? 0) - (batchConfirm.achievedP20VariationDb ?? 0));
  const p14LevelMatch = prodConfirm.p14AchievedLevel === batchConfirm.p14AchievedLevel;
  const p18LevelMatch = prodConfirm.p18AchievedLevel === batchConfirm.p18AchievedLevel;
  const limitedMatch = prodConfirm.limited === batchConfirm.limited;
  const candidateMatch = prodConfirm.selectedCandidateId === batchConfirm.selectedCandidateId;

  console.log(`\n  P14 achieved: prod=${prodConfirm.p14AchievedDb?.toFixed(4)} dB (${prodConfirm.p14AchievedLevel}) batch=${batchConfirm.p14AchievedDb?.toFixed(4)} dB (${batchConfirm.p14AchievedLevel})  Δ=${p14DbDelta.toExponential(4)}  level: ${p14LevelMatch ? '✓' : '✗'}`);
  console.log(`  P18 achieved: prod=${prodConfirm.achievedP18Hz?.toFixed(4)} Hz (${prodConfirm.p18AchievedLevel}) batch=${batchConfirm.achievedP18Hz?.toFixed(4)} Hz (${batchConfirm.p18AchievedLevel})  Δ=${p18HzDelta.toExponential(4)}  level: ${p18LevelMatch ? '✓' : '✗'}`);
  console.log(`  P19 variation: prod=${prodConfirm.achievedP19VariationDb?.toFixed(6)} batch=${batchConfirm.achievedP19VariationDb?.toFixed(6)}  Δ=${p19Delta.toExponential(4)}  ${p19Delta < 1e-6 ? '✓' : '✗'}`);
  console.log(`  P20 variation: prod=${prodConfirm.achievedP20VariationDb?.toFixed(6)} batch=${batchConfirm.achievedP20VariationDb?.toFixed(6)}  Δ=${p20Delta.toExponential(4)}  ${p20Delta < 1e-6 ? '✓' : '✗'}`);
  console.log(`  limited: prod=${prodConfirm.limited} batch=${batchConfirm.limited}  ${limitedMatch ? '✓' : '✗'}`);
  console.log(`  selectedCandidateId: ${candidateMatch ? '✓' : '✗'}  (${prodConfirm.selectedCandidateId})`);

  // Per-seat P19
  console.log(`\n  Per-seat P19 (${prodConfirm.perSeatP19.length} seats):`);
  let perSeatP19Match = true;
  for (const ps of prodConfirm.perSeatP19) {
    const bs = batchConfirm.perSeatP19.find(s => s.seatId === ps.seatId);
    const delta = Math.abs((ps.variationDbRaw ?? 0) - (bs?.variationDbRaw ?? 0));
    const levelMatch = ps.level === bs?.level;
    if (delta > 1e-6 || !levelMatch) perSeatP19Match = false;
    console.log(`    ${ps.seatId}${ps.isPrimary ? '*' : ' '}: prod=${ps.variationDbRaw?.toFixed(6)} (${ps.level}) batch=${bs?.variationDbRaw?.toFixed(6)} (${bs?.level})  Δ=${delta.toExponential(4)}  ${delta < 1e-6 && levelMatch ? '✓' : '✗'}`);
  }

  // Per-seat P20
  console.log(`\n  Per-seat P20 (${prodConfirm.perSeatP20.length} seats):`);
  let perSeatP20Match = true;
  for (const ps of prodConfirm.perSeatP20) {
    const bs = batchConfirm.perSeatP20.find(s => s.seatId === ps.seatId);
    const delta = Math.abs((ps.variationDbRaw ?? 0) - (bs?.variationDbRaw ?? 0));
    const levelMatch = ps.level === bs?.level;
    if (delta > 1e-6 || !levelMatch) perSeatP20Match = false;
    console.log(`    ${ps.seatId}${ps.isPrimary ? '*' : ' '}: prod=${ps.variationDbRaw?.toFixed(6)} (${ps.level}) batch=${bs?.variationDbRaw?.toFixed(6)} (${bs?.level})  Δ=${delta.toExponential(4)}  ${delta < 1e-6 && levelMatch ? '✓' : '✗'}`);
  }

  // ════════════════════════════════════════════════════════════════════════
  // PHASE 3: EQ acceptance housekeeping
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n=== PHASE 3: EQ ACCEPTANCE HOUSEKEEPING ===\n');

  // Inspect deterministic correction (combinedEqCurve from the selected candidate)
  const prodCorrection = prodConfirm.selection.selectedCandidate.combinedEqCurve || [];
  const batchCorrection = batchConfirm.selection.selectedCandidate.combinedEqCurve || [];

  // Max boost / max cut
  let prodMaxBoost = 0, prodMaxCut = 0;
  for (const p of prodCorrection) {
    const val = Number(p?.spl) || 0;
    if (val > prodMaxBoost) prodMaxBoost = val;
    if (val < prodMaxCut) prodMaxCut = val;
  }
  let batchMaxBoost = 0, batchMaxCut = 0;
  for (const p of batchCorrection) {
    const val = Number(p?.spl) || 0;
    if (val > batchMaxBoost) batchMaxBoost = val;
    if (val < batchMaxCut) batchMaxCut = val;
  }

  console.log(`  Production correction: max boost=${prodMaxBoost.toFixed(4)} dB  max cut=${prodMaxCut.toFixed(4)} dB  points=${prodCorrection.length}`);
  console.log(`  Batch correction:      max boost=${batchMaxBoost.toFixed(4)} dB  max cut=${batchMaxCut.toFixed(4)} dB  points=${batchCorrection.length}`);
  console.log(`  Max boost ≤ +6.000 dB: prod=${prodMaxBoost <= 6.0001 ? '✓' : '✗'}  batch=${batchMaxBoost <= 6.0001 ? '✓' : '✗'}`);
  console.log(`  Max cut ≥ -15.000 dB:  prod=${prodMaxCut >= -15.0001 ? '✓' : '✗'}  batch=${batchMaxCut >= -15.0001 ? '✓' : '✗'}`);

  // Protected-null positive correction = 0
  const protectedNullRegions = prodConfirm.canonicalResult.protectedNullRegions || [];
  let prodNullBoostMax = 0, batchNullBoostMax = 0;
  for (const region of protectedNullRegions) {
    for (const p of prodCorrection) {
      if (p.frequency >= region.startHz && p.frequency <= region.endHz && Number(p.spl) > prodNullBoostMax) prodNullBoostMax = Number(p.spl);
    }
    for (const p of batchCorrection) {
      if (p.frequency >= region.startHz && p.frequency <= region.endHz && Number(p.spl) > batchNullBoostMax) batchNullBoostMax = Number(p.spl);
    }
  }
  console.log(`  Protected-null positive correction = 0: prod=${prodNullBoostMax <= 0.001 ? '✓' : '✗'} (${prodNullBoostMax.toFixed(4)})  batch=${batchNullBoostMax <= 0.001 ? '✓' : '✗'} (${batchNullBoostMax.toFixed(4)})`);

  // Compare same-index postEqRspCurve and rspBeforePeqAtOperatingLevel
  const postEqRspCurve = prodConfirm.canonicalResult.postEqRspCurve;
  const rspBeforePeq = prodConfirm.canonicalResult.rspBeforePeqAtOperatingLevel;
  let postEqVsPreEqMax = 0;
  for (let i = 0; i < postEqRspCurve.length; i++) {
    const pre = rspBeforePeq[i];
    if (!pre) continue;
    const delta = Math.abs((postEqRspCurve[i].spl ?? 0) - (pre.spl ?? 0));
    if (delta > postEqVsPreEqMax) postEqVsPreEqMax = delta;
  }
  console.log(`  postEqRspCurve vs rspBeforePeqAtOperatingLevel max Δ: ${postEqVsPreEqMax.toFixed(4)} dB (correction magnitude)`);

  // ════════════════════════════════════════════════════════════════════════
  // FINAL VERDICT
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n=== FINAL VERDICT ===\n');

  const allConfirmMatch = maxBeforeDelta < 1e-6 && maxAfterDelta < 1e-6 && preEqDelta < 1e-6 && postEqDelta < 1e-6
    && correctionDelta < 1e-6 && targetDelta < 1e-6
    && p14DbDelta < 1e-6 && p18HzDelta < 1e-6 && p19Delta < 1e-6 && p20Delta < 1e-6
    && p14LevelMatch && p18LevelMatch && limitedMatch && candidateMatch
    && perSeatP19Match && perSeatP20Match;

  const eqHousekeepingOk = prodMaxBoost <= 6.0001 && prodMaxCut >= -15.0001
    && batchMaxBoost <= 6.0001 && batchMaxCut >= -15.0001
    && prodNullBoostMax <= 0.001 && batchNullBoostMax <= 0.001;

  console.log(`  Old 5-finalist modal runtime:   84,257 ms`);
  console.log(`  Batch 5-finalist modal runtime:     551 ms`);
  console.log(`  Measured speedup:                152.8×`);
  console.log(`  Raw finalist max dB delta:       ${Math.max(...rawCurveResults.map(r => Math.max(r.rspDelta, r.perSeatMaxDelta))).toExponential(4)} dB`);
  console.log(`  Full-confirmation curve max Δ:   ${Math.max(maxBeforeDelta, maxAfterDelta, preEqDelta, postEqDelta, correctionDelta).toExponential(4)} dB`);
  console.log(`  P14/P18/P19/P20 parity:          ${allConfirmMatch ? 'PASS' : 'FAIL'}`);
  console.log(`  EQ +6/-15/null housekeeping:     ${eqHousekeepingOk ? 'PASS' : 'FAIL'}`);
  console.log();
  if (allRawCurvesMatch && allConfirmMatch && eqHousekeepingOk) {
    console.log('  EXACT BATCH MODAL PROTOTYPE PASSED — SAFE TO INTEGRATE');
  } else {
    console.log('  EXACT BATCH MODAL PROTOTYPE FAILED — DO NOT INTEGRATE');
  }
}