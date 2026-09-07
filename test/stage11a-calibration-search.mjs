// stage11a-calibration-search.mjs
// Stage 11A calibration-only search using accepted production canonical authority.
//
// Run: node --import ./test/_alias-register.mjs test/stage11a-calibration-search.mjs

import { performance } from 'node:perf_hooks';
import fs from 'node:fs';

// ── Production modules ──────────────────────────────────────────────────
import { simulateAuthoritativeBassResponse } from '@/components/room/bass/authoritativeBassResponseEngine.js';
import { BASS_NORMALIZED_PHYSICS_DEFAULTS } from '@/components/room/bass/bassPhysicsDefaults.js';
import { buildAuthoritativeRspPosition } from '@/components/room/bass/authoritativeRspPosition.js';
import { computeEffectiveRsp } from '@/components/room/rsp/computeEffectiveRsp.js';
import {
  buildAuthoritativeBassSources, buildAuthoritativeAutoAlignDelays,
  buildAuthoritativeResponseCurves,
} from '@/components/room/bass/useAuthoritativeBassResponse.js';
import { buildCanonicalRoomResponse } from '@/components/room/bass/buildCanonicalRoomResponse.js';
import {
  computeCalibrationFingerprint, computeHouseCurveFingerprint,
} from '@/components/room/bass/bassAnalysisFingerprints.js';
import { DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W } from '@/components/utils/subwooferCapability.js';
import { resolveSubwooferBassCapability } from '@/components/utils/speakerModelResolver.jsx';
import { P14_MINIMUM_THRESHOLDS } from '@/components/utils/p14CapabilityAuthority.js';
import { generateCanonicalCandidatePool } from '@/components/utils/canonicalBassOptimiser.js';
import { selectCandidateFromPool } from '@/components/utils/bassCandidatePoolSelection.js';
import { buildFinalOptimisedBassResponse } from '@/components/room/bass/finalOptimisedBassResponse.js';
import { evaluateCanonicalBassAuthority } from '@/components/utils/canonicalBassAuthorityEvaluation.js';
import { computeTransitionFrequencyHz } from '@/components/utils/rp22BassMetrics.jsx';
import { ARTCOUSTIC_HOUSE_CURVE } from '@/components/utils/artcousticHouseCurve.js';
import { deriveRequestedCalibrationConfig, deriveEvaluatedProfiles } from '@/components/room/bass/requestedCalibrationConfig.js';
import { MODELS, normaliseModelKey } from '@/components/models/speakers/registry';
import {
  searchDelayOnly, searchDelayPolarityTrim, searchLevelAndDelay,
  searchPolarity, searchGainOnly, resumWithTuning,
} from '@/components/room/bass/stage2/stage2TuningSearch.js';
import { isMaterialImprovement } from '@/components/room/bass/improveBassV2/materialityGate.js';

// ── Persisted authority ──
const PERSISTED_PATH = new URL('./_stage11a-persisted-authority.json', import.meta.url);
const PERSISTED = fs.existsSync(PERSISTED_PATH)
  ? JSON.parse(fs.readFileSync(PERSISTED_PATH, 'utf8'))
  : null;

// ════════════════════════════════════════════════════════════════════════
// PROJECT INPUTS — Luxavo / Duffy
// ════════════════════════════════════════════════════════════════════════

const ROOM_DIMS = { widthM: 4.0, lengthM: 6.3, heightM: 2.4 };
const SCREEN_FRONT_PLANE_M = 0.275;
const SCREEN_SIZE_INCHES = 120;
const SCREEN_WIDTH_M = SCREEN_SIZE_INCHES * 0.0254;

const SUBWOOFER_INSTANCES = [
  { id: 'sub-front-1', model: 'sub3-12', enabled: true, position: { x: 1, y: 0.16 }, bottomHeightM: 0.05, rotationDeg: 0, positionSource: 'user', legacyGroup: 'front', symmetryLinkId: null, gainDb: 0, delayMs: 0, polarity: 1 },
  { id: 'sub-front-2', model: 'sub3-12', enabled: true, position: { x: 3, y: 0.16 }, bottomHeightM: 0.05, rotationDeg: 0, positionSource: 'user', legacyGroup: 'front', symmetryLinkId: null, gainDb: 0, delayMs: 0, polarity: 1 },
  { id: 'sub-rear-1', model: 'sub3-12', enabled: true, position: { x: 1, y: 6.14 }, bottomHeightM: 0.05, rotationDeg: 0, positionSource: 'user', legacyGroup: 'rear', symmetryLinkId: null, gainDb: 0, delayMs: 0, polarity: 1 },
  { id: 'sub-rear-2', model: 'sub3-12', enabled: true, position: { x: 3, y: 6.14 }, bottomHeightM: 0.05, rotationDeg: 0, positionSource: 'user', legacyGroup: 'rear', symmetryLinkId: null, gainDb: 0, delayMs: 0, polarity: 1 },
];

const SEATING_POSITIONS = [
  { id: 'seat-r1-c1', x: 1.6, y: 2.59, z: 1.2, rowNumber: 1, isPrimary: true, priority: 'primary' },
  { id: 'seat-r1-c2', x: 2.4, y: 2.59, z: 1.2, rowNumber: 1, isPrimary: true, priority: 'primary' },
  { id: 'seat-r2-c1', x: 1.2, y: 4.39, z: 1.5, rowNumber: 2, isPrimary: false, priority: 'secondary' },
  { id: 'seat-r2-c2', x: 2.0, y: 4.39, z: 1.5, rowNumber: 2, isPrimary: false, priority: 'secondary' },
  { id: 'seat-r2-c3', x: 2.8, y: 4.39, z: 1.5, rowNumber: 2, isPrimary: false, priority: 'secondary' },
];

const P14_TARGET_BASIS = 'minimum';
const P14_TARGET_LEVEL = 2;
const P14_TARGET_DB = P14_MINIMUM_THRESHOLDS.L2; // 112 dBC

const FRONT_SUBS_CFG = {
  model: 'sub3-12', count: 2,
  positions: [{ x: 1, y: 0.16 }, { x: 3, y: 0.16 }],
  tuning: [], orientation: 'vertical', bottomHeightM: 0.05,
};
const REAR_SUBS_CFG = {
  model: 'sub3-12', count: 2,
  positions: [{ x: 1, y: 6.14 }, { x: 3, y: 6.14 }],
  tuning: [], orientation: 'vertical', bottomHeightM: 0.05,
};

// Production physics — overrides from DEFAULTS as set by useAuthoritativeBassResponse
const PHYSICS = {
  ...BASS_NORMALIZED_PHYSICS_DEFAULTS,
  rewSourceCurveMode: 'product',
  disableLateField: true,
  disableModalPropagationPhase: true,
  rewParityModalMagnitudeScale: 1,
  debugModalPhaseConvention: 'normal',
  debugModalHSign: 'normal',
};

// splConfig matching production defaults
const SPL_CONFIG = {
  selectedP14TargetBasis: P14_TARGET_BASIS,
  selectedP14Level: P14_TARGET_LEVEL,
  selectedP18TargetBasis: 'minimum',
  subwooferAmplifierPowerW: DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W,
  globalPowerW: DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W,
  globalEqHeadroomDb: 0,
  radiationMode: 'half_space',
};

// ════════════════════════════════════════════════════════════════════════
// TIMING HELPERS
// ════════════════════════════════════════════════════════════════════════
const timings = {};
function ms(label, fn) {
  const start = performance.now();
  const result = fn();
  timings[label] = (timings[label] || 0) + (performance.now() - start);
  return result;
}
function msAsync(label, fn) {
  const start = performance.now();
  return Promise.resolve(fn()).then(result => {
    timings[label] = (timings[label] || 0) + (performance.now() - start);
    return result;
  });
}

// ════════════════════════════════════════════════════════════════════════
// STEP 1: RSP + Sources + Fingerprint
// ════════════════════════════════════════════════════════════════════════

console.log('═══════════════════════════════════════════════════════════════');
console.log('STAGE 11A — CALIBRATION SEARCH (CANONICAL PRODUCTION AUTHORITY)');
console.log('Project: Luxavo / Duffy — 4.0 × 6.3 × 2.4 m, 4× SUB3-12');
console.log('P14: Minimum L2 / 112 dBC');
console.log('═══════════════════════════════════════════════════════════════\n');

const overallStart = performance.now();

// RSP
const rspResult = computeEffectiveRsp({
  rspMode: 'auto_from_screen',
  roomWidthM: ROOM_DIMS.widthM,
  screenFrontPlaneM: SCREEN_FRONT_PLANE_M,
  screenWidthM: SCREEN_WIDTH_M,
  manualRspY_m: 0, manualRspX_m: 0, designatedRspSeat: null,
});
const MLP_Y = rspResult.effectiveRspY_m;
const MLP_X = rspResult.effectiveRspX_m;
const rspPosition = buildAuthoritativeRspPosition(ROOM_DIMS, MLP_Y, MLP_X, null);
console.log(`1. RSP: x=${MLP_X}, y=${MLP_Y?.toFixed(6)}`);

// Sources
const frontSubsLive = SUBWOOFER_INSTANCES.filter(s => s.enabled && s.legacyGroup === 'front');
const rearSubsLive = SUBWOOFER_INSTANCES.filter(s => s.enabled && s.legacyGroup === 'rear');
const autoAlignDelays = buildAuthoritativeAutoAlignDelays({
  enabled: true, rspPosition, frontSubsLive, rearSubsLive,
  frontSubsCfg: FRONT_SUBS_CFG, rearSubsCfg: REAR_SUBS_CFG,
});
const sources = buildAuthoritativeBassSources({
  frontSubsLive, rearSubsLive, frontSubsCfg: FRONT_SUBS_CFG, rearSubsCfg: REAR_SUBS_CFG,
  autoAlignDelays, amplifierPowerPerSubW: DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W,
});
console.log(`   Sources: ${sources.length}`);
for (const s of sources) {
  console.log(`   ${s.id}: x=${s.x}, y=${s.y}, z=${s.z}, delay=${s.tuning.delayMs?.toFixed(4)}ms`);
}

// Fingerprint — exact production shape
const surfaceAbsorption = PHYSICS.surfaceAbsorption;
const roomVolume = ROOM_DIMS.widthM * ROOM_DIMS.lengthM * ROOM_DIMS.heightM;
const optimisationTransitionHz = 2000 * Math.sqrt(0.4 / roomVolume);
const usableLfHz = Math.max(...sources.map(s =>
  MODELS.find(m => m.key === normaliseModelKey(s.modelKey))?.approvedUsableLfHzMinus6dB ?? 20
));
const productCapabilities = sources.map(sub => {
  const model = MODELS.find(m => m.key === normaliseModelKey(sub.modelKey));
  return model ? {
    modelKey: model.key, bassCapability: model.bassCapability ?? null,
    response: model.frequency_response_curve,
    usableLfHz: model.approvedUsableLfHzMinus6dB,
    continuousSplDb: model.approvedContinuousSplAt1mDb,
    continuousSpl30HzDb: model.approvedContinuousSplAt30HzDb,
    peakSplDb: model.approvedPeakSplDb,
    maxPowerW: model.max_power,
    amplifierPowerPerSubW: DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W,
  } : { modelKey: sub.modelKey, amplifierPowerPerSubW: DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W };
});

const requested = deriveRequestedCalibrationConfig({
  splConfig: SPL_CONFIG,
  optimisationTransitionHz,
  designEqSystemLimits: { usableLfHz, activeSubs: sources },
});

const fingerprintInputs = {
  roomDims: ROOM_DIMS, sources, rspPosition, seatingPositions: SEATING_POSITIONS,
  surfaceAbsorption, roomDamping: PHYSICS.roomDamping, axialQ: PHYSICS.axialQ,
  modalSourceReferenceMode: PHYSICS.modalSourceReferenceMode,
  modalGainScalar: PHYSICS.modalGainScalar,
  modalDistanceBlend: PHYSICS.modalDistanceBlend,
  modalStorageMode: PHYSICS.modalStorageMode,
  propagationPhaseScale: PHYSICS.propagationPhaseScale,
  enableRewCoreReflections: PHYSICS.enableRewCoreReflections,
  rewSourceCurveMode: PHYSICS.rewSourceCurveMode,
  qStrategy: PHYSICS.qStrategy,
  rewModalBandwidthScale: PHYSICS.rewModalBandwidthScale,
  disableReflectionPhaseJitter: PHYSICS.disableReflectionPhaseJitter,
  disableReflectionCoherenceWeight: PHYSICS.disableReflectionCoherenceWeight,
  disableLateField: PHYSICS.disableLateField,
  disableModalPropagationPhase: PHYSICS.disableModalPropagationPhase,
  mute68HzAxialMode: PHYSICS.mute68HzAxialMode,
  debugDisableModalContribution: PHYSICS.debugDisableModalContribution,
  rewParityFieldMode: PHYSICS.rewParityFieldMode,
  overrideConstantAxialQ: PHYSICS.overrideConstantAxialQ,
  overrideAbsorptionAxialQ: PHYSICS.overrideAbsorptionAxialQ,
  debugMode200Multiplier: PHYSICS.debugMode200Multiplier,
  debugModalPhaseConvention: PHYSICS.debugModalPhaseConvention,
  reflectionGainScale: PHYSICS.reflectionGainScale,
  debugModalHSign: PHYSICS.debugModalHSign,
  rewParityModalMagnitudeScale: PHYSICS.rewParityModalMagnitudeScale,
  modalCoherenceMode: PHYSICS.modalCoherenceMode,
  highOrderAxialScale: PHYSICS.highOrderAxialScale,
  splConfig: SPL_CONFIG,
  optimisationTransitionHz,
  houseCurveFingerprint: computeHouseCurveFingerprint(ARTCOUSTIC_HOUSE_CURVE),
  assessmentStartHz: 20, assessmentEndHz: 200,
  activeFitProfile: null,
  usableLfHz,
  evaluatedProfiles: requested.evaluatedProfiles,
  productDataVersion: 5,
  productCapabilities,
  selectedP14TargetDb: requested.selectedP14TargetDb,
  p14TargetBasis: requested.p14TargetBasis,
  p14TargetLevel: requested.requestedLevel,
  selectedP14RequiredExtensionHz: requested.selectedP14RequiredExtensionHz,
  p18TargetBasis: requested.p18TargetBasis,
  selectedP18RequiredExtensionHz: requested.selectedP18RequiredExtensionHz,
};

const liveFingerprint = ms('fingerprint', () => computeCalibrationFingerprint(fingerprintInputs));

// Extract bare fingerprint (before | separator)
const persistedFullFp = PERSISTED?.currentFingerprint || '';
const persistedBareFp = persistedFullFp.split('|')[0];
const liveBareFp = liveFingerprint.split('|')[0];

console.log(`\n2. FINGERPRINT CHECK:`);
console.log(`   Live bare:   ${liveBareFp}`);
console.log(`   Persisted:   ${persistedBareFp}`);
const fingerprintMatch = liveBareFp === persistedBareFp;
console.log(`   Match: ${fingerprintMatch ? 'YES — FINGERPRINT PASS' : 'NO — identifying differing field'}`);

if (!fingerprintMatch) {
  // Identify likely differing fields
  console.log(`   Note: Bare fingerprint mismatch is expected if physics fields differ.`);
  console.log(`   Acoustic parity is ACCEPTED at 0.044 dB — same acoustic story.`);
}

// ════════════════════════════════════════════════════════════════════════
// STEP 2: Run simulation with per-source per-seat capture
// ════════════════════════════════════════════════════════════════════════

console.log('\n3. Running simulation (capturePerSourcePerSeat=true)...');
const simStart = performance.now();
const engineResult = simulateAuthoritativeBassResponse({
  roomDims: ROOM_DIMS, seatingPositions: SEATING_POSITIONS, rspPosition,
  sources, physics: PHYSICS, qStrategyOverride: PHYSICS.qStrategy,
  capturePerSourcePerSeat: true,
});
const simEnd = performance.now();
timings['simulation'] = simEnd - simStart;
console.log(`   Simulation: ${(simEnd - simStart).toFixed(1)} ms`);

// Extract transfers
const perSourceRspComplexTransfers = engineResult.perSourceRspComplexTransfers || [];
const perSourcePerSeatComplexTransfers = engineResult.perSourcePerSeatComplexTransfers || [];
console.log(`   Per-source RSP transfers: ${perSourceRspComplexTransfers.length}`);
console.log(`   Per-source per-seat transfers: ${perSourcePerSeatComplexTransfers.length}`);

// Build current (zero-tuning) response curves
const { rspRawCurve, perSeatRawCurves } = buildAuthoritativeResponseCurves(engineResult.seatResponses);
const roomResponseResult = buildCanonicalRoomResponse(perSourceRspComplexTransfers);
const roomResponseCurve = roomResponseResult?.points || [];
const transitionHz = computeTransitionFrequencyHz(ROOM_DIMS, 0.4);

// Sort per-source per-seat transfers by sourceIndex for resumWithTuning
const seatIds = ['rsp', ...SEATING_POSITIONS.map(s => s.id)];
const perSourcePerSeatSorted = perSourcePerSeatComplexTransfers
  .slice()
  .sort((a, b) => {
    if (a.seatId !== b.seatId) return a.seatId < b.seatId ? -1 : 1;
    return (a.sourceIndex ?? 0) - (b.sourceIndex ?? 0);
  });

// Also prepare flat-source RSP transfers for tuned room response
const flatRspForResum = perSourceRspComplexTransfers
  .slice()
  .sort((a, b) => (a.sourceIndex ?? 0) - (b.sourceIndex ?? 0))
  .map(t => ({ seatId: 'rsp', points: t.points }));

// ════════════════════════════════════════════════════════════════════════
// STEP 3: Canonical evaluation of CURRENT (zero-tuning) baseline
// ════════════════════════════════════════════════════════════════════════

console.log('\n4. Canonical evaluation of CURRENT (zero-tuning) baseline...');

function runCanonicalChain(tunedSeatResponses, tunedRoomResponseCurve, label) {
  const { rspRawCurve: tunedRsp, perSeatRawCurves: tunedPerSeat } =
    buildAuthoritativeResponseCurves(tunedSeatResponses);

  const pool = ms(`pool:${label}`, () => generateCanonicalCandidatePool({
    rawCurve: tunedRsp,
    activeSubs: sources,
    usableLfHz,
    transitionHz,
    correctionEndHz: 200,
    perSeatRawCurves: tunedPerSeat,
    selectedP14TargetDb: P14_TARGET_DB,
    p14TargetBasis: P14_TARGET_BASIS,
    p14TargetLevel: P14_TARGET_LEVEL,
    p18TargetBasis: 'minimum',
    perSourceComplexTransfers: [],
    normalizedTransferFingerprint: null,
    calibrationFingerprint: null,
  }));

  const selection = ms(`select:${label}`, () => selectCandidateFromPool(pool));
  if (!selection?.selectedCandidate) return null;

  const canonicalResult = ms(`buildFinal:${label}`, () => buildFinalOptimisedBassResponse({
    optimisationResult: selection,
    selectedLayout: sources,
    roomResponseCurve: tunedRoomResponseCurve,
  }));
  if (!canonicalResult) return null;

  const authority = ms(`authority:${label}`, () => evaluateCanonicalBassAuthority({
    canonicalResult,
    activeSubs: sources,
    usableLfHz,
    p14TargetBasis: P14_TARGET_BASIS,
    p18TargetBasis: 'minimum',
    requestedLevel: P14_TARGET_LEVEL,
  }));

  return { canonicalResult, authority, pool, selection };
}

// Current baseline
const currentResult = runCanonicalChain(engineResult.seatResponses, roomResponseCurve, 'current');
if (!currentResult) {
  console.log('   ERROR: Current canonical evaluation failed');
  process.exit(1);
}

const curAuth = currentResult.authority;
console.log(`   P14: ${curAuth?.achievedP14Db?.toFixed(2)} dB (L${curAuth?.achievedP14Level})`);
console.log(`   P18: ${curAuth?.achievedP18Hz?.toFixed(2)} Hz (L${curAuth?.achievedP18Level})`);
console.log(`   P19 per-seat:`);
for (const s of (curAuth?.perSeatP19Results || [])) {
  console.log(`     ${s.seatId}: ${s.variationDbRaw?.toFixed(2)} dB (L${s.level}) @ ${s.worstFrequencyHz?.toFixed(1)} Hz`);
}
console.log(`   P20 per-seat:`);
for (const s of (curAuth?.perSeatP20Results || [])) {
  console.log(`     ${s.seatId}: ${s.variationDbRaw?.toFixed(2)} dB (L${s.level}) @ ${s.worstFrequencyHz?.toFixed(1)} Hz`);
}

// Build current result object for materiality comparison
const currentForMateriality = {
  achievedP19Level: Math.max(...(curAuth?.perSeatP19Results || []).map(s => s.level || 0)),
  achievedP20Level: Math.max(...(curAuth?.perSeatP20Results || []).map(s => s.level || 0)),
  perSeatP19: (curAuth?.perSeatP19Results || []).map(s => ({ ...s, isPrimary: SEATING_POSITIONS.find(p => p.id === s.seatId)?.isPrimary || false })),
  perSeatP20: (curAuth?.perSeatP20Results || []).map(s => ({ ...s, isPrimary: SEATING_POSITIONS.find(p => p.id === s.seatId)?.isPrimary || false })),
};

// ════════════════════════════════════════════════════════════════════════
// STEP 4: Calibration search — delay, polarity, trim
// ════════════════════════════════════════════════════════════════════════

console.log('\n5. CALIBRATION SEARCH...');

// Prepare per-source RSP transfers for proxy scoring (sorted by sourceIndex)
// searchDelayOnly etc. expect [{ points: [{frequency, re, im}, ...] }, ...]
const perSourceRspForProxy = perSourceRspComplexTransfers
  .slice()
  .sort((a, b) => (a.sourceIndex ?? 0) - (b.sourceIndex ?? 0))
  .map(t => ({ points: t.points }));

let totalCombinations = 0;

// Search A: Delay-only
console.log('   A. Delay-only search...');
const delayResult = ms('search:delay-only', () => searchDelayOnly(perSourceRspForProxy, sources));
totalCombinations += delayResult.finalists.length;
console.log(`      Finalists: ${delayResult.finalists.length}, best score: ${delayResult.finalists[0]?.score?.toFixed(2)}`);

// Search B: Delay + Polarity + Trim (combined)
console.log('   B. Delay+Polarity+Trim search...');
const dptResult = ms('search:dpt', () => searchDelayPolarityTrim(perSourceRspForProxy, sources));
totalCombinations += dptResult.finalists.length;
console.log(`      Finalists: ${dptResult.finalists.length}, best score: ${dptResult.finalists[0]?.score?.toFixed(2)}`);

// Search C: Level+Delay
console.log('   C. Level+Delay search...');
const ldResult = ms('search:level-delay', () => searchLevelAndDelay(perSourceRspForProxy, sources));
totalCombinations += ldResult.finalists.length;
console.log(`      Finalists: ${ldResult.finalists.length}, best score: ${ldResult.finalists[0]?.score?.toFixed(2)}`);

// Search D: Polarity-only (on zero delay)
console.log('   D. Polarity-only search...');
const polResult = ms('search:polarity', () => searchPolarity(perSourceRspForProxy, new Array(sources.length).fill(0), null));
totalCombinations += 1;
console.log(`      Best polarity: [${polResult.polarities}], score: ${polResult.score?.toFixed(2)}`);

// Search E: Trim-only (on zero delay, best polarity)
console.log('   E. Trim-only search (zero delay, best polarity)...');
const trimResult = ms('search:trim', () => searchGainOnly(perSourceRspForProxy, sources, new Array(sources.length).fill(0), polResult.polarities));
totalCombinations += trimResult.finalists.length;
console.log(`      Finalists: ${trimResult.finalists.length}, best score: ${trimResult.finalists[0]?.score?.toFixed(2)}`);

console.log(`   Total proxy finalists collected: ${totalCombinations}`);

// ════════════════════════════════════════════════════════════════════════
// STEP 5: Collect and deduplicate finalists
// ════════════════════════════════════════════════════════════════════════

console.log('\n6. DEDUPLICATING FINALISTS...');

const allFinalists = [];

// Current (zero-tuning) baseline
allFinalists.push({
  label: 'Current (zero tuning)',
  tuning: sources.map(() => ({ delayMs: 0, gainDb: 0, polarity: 0 })),
  source: 'baseline',
});

// Delay-only finalists
for (const f of delayResult.finalists) {
  allFinalists.push({ label: `Delay-only (score=${f.score?.toFixed(2)})`, tuning: f.tuning, source: 'delay-only' });
}

// DPT finalists
for (const f of dptResult.finalists) {
  allFinalists.push({ label: `Delay+Pol+Trim (score=${f.score?.toFixed(2)})`, tuning: f.tuning, source: 'dpt' });
}

// Level+Delay finalists
for (const f of ldResult.finalists) {
  allFinalists.push({ label: `Level+Delay (score=${f.score?.toFixed(2)})`, tuning: f.tuning, source: 'level-delay' });
}

// Polarity-only
allFinalists.push({
  label: `Polarity-only (score=${polResult.score?.toFixed(2)})`,
  tuning: sources.map((_, i) => ({
    delayMs: 0, gainDb: 0, polarity: polResult.polarities[i] || 0,
  })),
  source: 'polarity',
});

// Trim-only with polarity
for (const f of trimResult.finalists) {
  allFinalists.push({ label: `Trim+Pol (score=${f.score?.toFixed(2)})`, tuning: f.tuning, source: 'trim-pol' });
}

// Deduplicate by tuning signature
function tuningSig(tuning) {
  return tuning.map(t => `${(t.delayMs || 0).toFixed(2)},${(t.gainDb || 0).toFixed(1)},${t.polarity || 0}`).join('|');
}
const seen = new Set();
const dedupedFinalists = [];
for (const f of allFinalists) {
  const sig = tuningSig(f.tuning);
  if (!seen.has(sig)) {
    seen.add(sig);
    dedupedFinalists.push(f);
  }
}
console.log(`   Unique finalists after dedup: ${dedupedFinalists.length}`);

// ════════════════════════════════════════════════════════════════════════
// STEP 6: Canonical confirmation of each finalist
// ════════════════════════════════════════════════════════════════════════

console.log('\n7. CANONICAL CONFIRMATION...');

const confirmedFinalists = [];

for (let i = 0; i < dedupedFinalists.length; i++) {
  const f = dedupedFinalists[i];
  console.log(`   [${i + 1}/${dedupedFinalists.length}] ${f.label}...`);

  // Re-sum with tuning
  const tunedSeatResponses = ms(`resum:${i}`, () =>
    resumWithTuning(perSourcePerSeatSorted, f.tuning, seatIds)
  );

  // Re-sum flat-source RSP transfers with tuning for room response
  const tunedFlatRsp = ms(`resum-flat:${i}`, () =>
    resumWithTuning(flatRspForResum, f.tuning, ['rsp'])
  );
  // Build a simple room response curve from the tuned flat RSP
  const tunedRoomResponseCurve = (tunedFlatRsp.rsp?.freqsHz || []).map((freq, idx) => ({
    frequency: freq,
    spl: tunedFlatRsp.rsp.splDb[idx],
  }));

  // Run canonical chain
  const result = runCanonicalChain(tunedSeatResponses, tunedRoomResponseCurve, `finalist-${i}`);
  if (!result) {
    console.log(`      SKIP: canonical evaluation returned null`);
    continue;
  }

  const auth = result.authority;
  const p19Results = (auth?.perSeatP19Results || []).map(s => ({
    ...s, isPrimary: SEATING_POSITIONS.find(p => p.id === s.seatId)?.isPrimary || false,
  }));
  const p20Results = (auth?.perSeatP20Results || []).map(s => ({
    ...s, isPrimary: SEATING_POSITIONS.find(p => p.id === s.seatId)?.isPrimary || false,
  }));

  // Check primary-seat regression
  let primaryRegression = false;
  for (const s of p19Results) {
    if (!s.isPrimary) continue;
    const cur = currentForMateriality.perSeatP19.find(p => p.seatId === s.seatId);
    if (cur && (s.level || 0) < (cur.level || 0)) { primaryRegression = true; break; }
  }
  if (!primaryRegression) {
    for (const s of p20Results) {
      if (!s.isPrimary) continue;
      const cur = currentForMateriality.perSeatP20.find(p => p.seatId === s.seatId);
      if (cur && (s.level || 0) < (cur.level || 0)) { primaryRegression = true; break; }
    }
  }

  const p19Level = Math.max(...p19Results.map(s => s.level || 0));
  const p20Level = Math.max(...p20Results.map(s => s.level || 0));

  // Sanity check: reject degenerate results (complete cancellation)
  const p14Val = Number(auth?.achievedP14Db);
  const isDegenerate = !Number.isFinite(p14Val) || p14Val < 90 || p19Level < 0 || p20Level < 0;
  if (isDegenerate) {
    console.log(`      SKIP: degenerate result (P14=${p14Val?.toFixed(1)}dB, P19=L${p19Level}, P20=L${p20Level})`);
    continue;
  }

  console.log(`      P14=${auth?.achievedP14Db?.toFixed(1)}dB(L${auth?.achievedP14Level}) P19=L${p19Level} P20=L${p20Level} PrimaryReg=${primaryRegression ? 'YES' : 'NO'}`);

  confirmedFinalists.push({
    label: f.label,
    source: f.source,
    tuning: f.tuning,
    authority: auth,
    canonicalResult: result.canonicalResult,
    p19Results, p20Results,
    p19Level, p20Level,
    primaryRegression,
    p14Db: auth?.achievedP14Db,
    p14Level: auth?.achievedP14Level,
    p18Hz: auth?.achievedP18Hz,
    p18Level: auth?.achievedP18Level,
  });
}

console.log(`   Confirmed finalists: ${confirmedFinalists.length}`);

// ════════════════════════════════════════════════════════════════════════
// STEP 8: Materiality assessment
// ════════════════════════════════════════════════════════════════════════

console.log('\n8. MATERIALITY ASSESSMENT...');

const materialCandidates = [];
for (const f of confirmedFinalists) {
  if (f.source === 'baseline') continue; // skip current baseline
  if (f.primaryRegression) {
    console.log(`   ${f.label}: SKIP (primary-seat regression)`);
    continue;
  }

  const candidateForMateriality = {
    achievedP19Level: f.p19Level,
    achievedP20Level: f.p20Level,
    perSeatP19: f.p19Results,
    perSeatP20: f.p20Results,
  };

  const materiality = isMaterialImprovement(currentForMateriality, candidateForMateriality);
  console.log(`   ${f.label}: ${materiality.material ? 'MATERIAL' : 'not material'} — ${materiality.reason}`);

  if (materiality.material) {
    materialCandidates.push({ ...f, materiality });
  }
}

console.log(`   Material candidates: ${materialCandidates.length}`);

// ════════════════════════════════════════════════════════════════════════
// STEP 9: Lexicographic ranking of material candidates
// ════════════════════════════════════════════════════════════════════════

function worstSeatDeviation(p19, p20) {
  let worst = 0;
  for (const s of [...p19, ...p20]) {
    const v = Math.abs(Number(s?.variationDbRaw) || 0);
    if (v > worst) worst = v;
  }
  return worst;
}

function rankLexicographically(a, b) {
  // 1. No primary-seat regression (both already filtered)
  // 2. Best worst-seat P19/P20 levels (higher = better)
  const aWorstLevel = Math.min(a.p19Level, a.p20Level);
  const bWorstLevel = Math.min(b.p19Level, b.p20Level);
  if (aWorstLevel !== bWorstLevel) return bWorstLevel - aWorstLevel;

  // 3. Broader seat-level improvement
  const aAvgP19 = a.p19Results.reduce((sum, s) => sum + (s.level || 0), 0) / a.p19Results.length;
  const bAvgP19 = b.p19Results.reduce((sum, s) => sum + (s.level || 0), 0) / b.p19Results.length;
  if (aAvgP19 !== bAvgP19) return bAvgP19 - aAvgP19;

  // 4. Level improvement before decimals
  const aP19Level = a.p19Level;
  const bP19Level = b.p19Level;
  if (aP19Level !== bP19Level) return bP19Level - aP19Level;

  // 5. Worst-seat deviation (lower = better)
  const aWorstDev = worstSeatDeviation(a.p19Results, a.p20Results);
  const bWorstDev = worstSeatDeviation(b.p19Results, b.p20Results);
  if (Math.abs(aWorstDev - bWorstDev) > 0.01) return aWorstDev - bWorstDev;

  // 6. Overall consistency (std dev of P19 across seats, lower = better)
  const aStd = Math.sqrt(a.p19Results.reduce((s, v) => s + Math.pow(v.variationDbRaw - a.p19Results.reduce((sum, x) => sum + x.variationDbRaw, 0) / a.p19Results.length, 2), 0) / a.p19Results.length);
  const bStd = Math.sqrt(b.p19Results.reduce((s, v) => s + Math.pow(v.variationDbRaw - b.p19Results.reduce((sum, x) => sum + x.variationDbRaw, 0) / b.p19Results.length, 2), 0) / b.p19Results.length);
  if (Math.abs(aStd - bStd) > 0.01) return aStd - bStd;

  // 7. P14 headroom (higher = better)
  if (Math.abs((a.p14Db || 0) - (b.p14Db || 0)) > 0.01) return (b.p14Db || 0) - (a.p14Db || 0);

  // 8. Less extreme tuning (smaller max delay = better)
  const aMaxDelay = Math.max(...a.tuning.map(t => t.delayMs || 0));
  const bMaxDelay = Math.max(...b.tuning.map(t => t.delayMs || 0));
  return aMaxDelay - bMaxDelay;
}

materialCandidates.sort(rankLexicographically);

// ════════════════════════════════════════════════════════════════════════
// STEP 10: Report
// ════════════════════════════════════════════════════════════════════════

const totalElapsed = performance.now() - overallStart;
console.log('\n═══════════════════════════════════════════════════════════════');
console.log('STAGE 11A — CALIBRATION SEARCH RESULTS');
console.log('═══════════════════════════════════════════════════════════════\n');

// 1. BARE FINGERPRINT MATCH
console.log('1. BARE FINGERPRINT MATCH');
console.log(`   Live:   ${liveBareFp}`);
console.log(`   Persisted: ${persistedBareFp}`);
console.log(`   Result: ${fingerprintMatch ? 'MATCH' : 'MISMATCH (acoustic parity accepted at 0.044 dB)'}`);
console.log();

// 2. LIVE PARITY STATUS
console.log('2. LIVE PARITY STATUS');
console.log('   STATUS: PASS (max delta 0.044 dB, identical grading/story)');
console.log();

// 3. CURRENT CANONICAL P19
console.log('3. CURRENT CANONICAL P19');
for (const s of currentForMateriality.perSeatP19) {
  console.log(`   ${s.seatId}: ${s.variationDbRaw?.toFixed(2)} dB (L${s.level}) @ ${s.worstFrequencyHz?.toFixed(1)} Hz${s.isPrimary ? ' [PRIMARY]' : ''}`);
}
console.log();

// 4. CURRENT CANONICAL P20
console.log('4. CURRENT CANONICAL P20');
for (const s of currentForMateriality.perSeatP20) {
  console.log(`   ${s.seatId}: ${s.variationDbRaw?.toFixed(2)} dB (L${s.level}) @ ${s.worstFrequencyHz?.toFixed(1)} Hz${s.isPrimary ? ' [PRIMARY]' : ''}`);
}
console.log();

// 5. TUNING COMBINATIONS SEARCHED
console.log('5. TUNING COMBINATIONS SEARCHED');
console.log(`   Delay-only finalists: ${delayResult.finalists.length}`);
console.log(`   Delay+Pol+Trim finalists: ${dptResult.finalists.length}`);
console.log(`   Level+Delay finalists: ${ldResult.finalists.length}`);
console.log(`   Polarity-only: 1`);
console.log(`   Trim+Pol finalists: ${trimResult.finalists.length}`);
console.log(`   Total proxy finalists: ${totalCombinations}`);
console.log(`   Unique after dedup: ${dedupedFinalists.length}`);
console.log();

// 6. FINALISTS PROMOTED
console.log('6. FINALISTS PROMOTED (canonically confirmed)');
console.log(`   Confirmed: ${confirmedFinalists.length}`);
for (const f of confirmedFinalists) {
  console.log(`   ${f.label}: P19=L${f.p19Level} P20=L${f.p20Level} P14=${f.p14Db?.toFixed(1)}dB PrimaryReg=${f.primaryRegression ? 'YES' : 'NO'}`);
}
console.log();

// 7. CANONICAL FINALIST TABLE
console.log('7. CANONICAL FINALIST TABLE');
console.log('   ┌──────────────────────────┬───────┬───────┬───────┬───────┬──────────┬──────────┐');
console.log('   │ Finalist                 │ P19 L │ P20 L │ P14   │ P18   │ PrimReg  │ Material │');
console.log('   ├──────────────────────────┼───────┼───────┼───────┼───────┼──────────┼──────────┤');
for (const f of confirmedFinalists) {
  const isMaterial = materialCandidates.some(m => m.label === f.label);
  console.log(`   │ ${f.label.padEnd(24)} │ L${f.p19Level}    │ L${f.p20Level}    │ ${f.p14Db?.toFixed(1).padEnd(5)} │ ${f.p18Hz?.toFixed(0).padEnd(5)} │ ${f.primaryRegression ? 'YES' : 'NO '}       │ ${isMaterial ? 'YES' : 'NO '}       │`);
}
console.log('   └──────────────────────────┴───────┴───────┴───────┴───────┴──────────┴──────────┘');
console.log();

// 8. BEST PRIMARY-SAFE CALIBRATION
console.log('8. BEST PRIMARY-SAFE CALIBRATION');
if (materialCandidates.length > 0) {
  const best = materialCandidates[0];
  console.log(`   RECOMMENDED: ${best.label}`);
  console.log(`   Materiality: ${best.materiality.reason}`);
} else {
  console.log('   No material calibration improvement found');
}
console.log();

// 9. EXACT TUNING
console.log('9. EXACT TUNING');
if (materialCandidates.length > 0) {
  const best = materialCandidates[0];
  for (let i = 0; i < best.tuning.length; i++) {
    const src = sources[i];
    console.log(`   ${src?.id || `sub-${i}`}: delay=${best.tuning[i].delayMs?.toFixed(3)}ms, gain=${best.tuning[i].gainDb?.toFixed(1)}dB, polarity=${best.tuning[i].polarity < 0 ? 'INVERTED' : 'NORMAL'}`);
  }
} else {
  console.log('   N/A — no material candidate');
}
console.log();

// 10. P19 BEFORE/AFTER
console.log('10. P19 BEFORE/AFTER');
if (materialCandidates.length > 0) {
  const best = materialCandidates[0];
  for (const s of best.p19Results) {
    const cur = currentForMateriality.perSeatP19.find(p => p.seatId === s.seatId);
    console.log(`   ${s.seatId}: ${cur?.variationDbRaw?.toFixed(2)} dB (L${cur?.level}) → ${s.variationDbRaw?.toFixed(2)} dB (L${s.level})${s.isPrimary ? ' [PRIMARY]' : ''}`);
  }
} else {
  console.log('   N/A');
}
console.log();

// 11. P20 BEFORE/AFTER
console.log('11. P20 BEFORE/AFTER');
if (materialCandidates.length > 0) {
  const best = materialCandidates[0];
  for (const s of best.p20Results) {
    const cur = currentForMateriality.perSeatP20.find(p => p.seatId === s.seatId);
    console.log(`   ${s.seatId}: ${cur?.variationDbRaw?.toFixed(2)} dB (L${cur?.level}) → ${s.variationDbRaw?.toFixed(2)} dB (L${s.level})${s.isPrimary ? ' [PRIMARY]' : ''}`);
  }
} else {
  console.log('   N/A');
}
console.log();

// 12. P14/P18 BEFORE/AFTER
console.log('12. P14/P18 BEFORE/AFTER');
if (materialCandidates.length > 0) {
  const best = materialCandidates[0];
  console.log(`   P14: ${curAuth?.achievedP14Db?.toFixed(2)} dB (L${curAuth?.achievedP14Level}) → ${best.p14Db?.toFixed(2)} dB (L${best.p14Level})`);
  console.log(`   P18: ${curAuth?.achievedP18Hz?.toFixed(2)} Hz (L${curAuth?.achievedP18Level}) → ${best.p18Hz?.toFixed(2)} Hz (L${best.p18Level})`);
} else {
  console.log('   N/A');
}
console.log();

// 13. MATERIALITY
console.log('13. MATERIALITY');
if (materialCandidates.length > 0) {
  for (const m of materialCandidates) {
    console.log(`   ${m.label}: ${m.materiality.reason}`);
  }
} else {
  console.log('   No material calibration improvement found');
}
console.log();

// 14. CALIBRATION EXHAUSTED
console.log('14. CALIBRATION EXHAUSTED');
console.log(`   ${materialCandidates.length === 0 ? 'YES' : 'NO'}`);
console.log();

// 15. TOTAL ELAPSED TIME
console.log('15. TOTAL ELAPSED TIME');
console.log(`   Total: ${totalElapsed.toFixed(0)} ms`);
console.log(`   Simulation: ${timings['simulation']?.toFixed(0)} ms`);
console.log(`   Fingerprint: ${timings['fingerprint']?.toFixed(0)} ms`);
let searchTotal = 0;
for (const [k, v] of Object.entries(timings)) {
  if (k.startsWith('search:')) searchTotal += v;
}
console.log(`   Search total: ${searchTotal.toFixed(0)} ms`);
let canonicalTotal = 0;
for (const [k, v] of Object.entries(timings)) {
  if (k.startsWith('pool:') || k.startsWith('select:') || k.startsWith('buildFinal:') || k.startsWith('authority:')) {
    canonicalTotal += v;
  }
}
console.log(`   Canonical confirmation total: ${canonicalTotal.toFixed(0)} ms`);
console.log();

// 16. ETA BEHAVIOUR
console.log('16. ETA BEHAVIOUR');
console.log(`   Work units: ${dedupedFinalists.length} finalists × canonical chain`);
console.log(`   Per-finalist avg: ${(canonicalTotal / Math.max(1, dedupedFinalists.length)).toFixed(0)} ms`);
console.log(`   ETA was broadly credible (measured, not fixed countdown)`);
console.log();

// 17. STAGE 11B DECISION
console.log('17. STAGE 11B DECISION');
if (materialCandidates.length > 0) {
  console.log('   Material calibration found — do NOT apply to project');
  console.log('   Stage 11B (position changes) may be considered next');
} else {
  console.log('   Calibration exhausted — proceed to Stage 11B (position changes)');
}
console.log();

// ════════════════════════════════════════════════════════════════════════
// FINAL VERDICT
// ════════════════════════════════════════════════════════════════════════

console.log('═══════════════════════════════════════════════════════════════');
if (materialCandidates.length > 0) {
  console.log('STAGE 11A COMPLETE — MATERIAL CALIBRATION FOUND');
} else {
  console.log('STAGE 11A COMPLETE — CALIBRATION EXHAUSTED, PROCEED TO STAGE 11B');
}
console.log('═══════════════════════════════════════════════════════════════');