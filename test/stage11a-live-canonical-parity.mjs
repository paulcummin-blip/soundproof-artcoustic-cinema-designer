// stage11a-live-canonical-parity.mjs
// Live canonical parity harness — imports ACTUAL production modules.
// No duplicated equations, no hand-built simulation, no legacy P19.
//
// Run: node --import ./test/_alias-register.mjs test/stage11a-live-canonical-parity.mjs

import { performance } from 'node:perf_hooks';
import assert from 'node:assert';

// ── Production modules (same as Calculate) ──────────────────────────────
import { simulateAuthoritativeBassResponse } from '@/components/room/bass/authoritativeBassResponseEngine.js';
import { BASS_NORMALIZED_PHYSICS_DEFAULTS } from '@/components/room/bass/bassPhysicsDefaults.js';
import { buildAuthoritativeRspPosition } from '@/components/room/bass/authoritativeRspPosition.js';
import { computeEffectiveRsp } from '@/components/room/rsp/computeEffectiveRsp.js';
import { buildAuthoritativeBassSources, buildAuthoritativeAutoAlignDelays, buildAuthoritativeResponseCurves } from '@/components/room/bass/useAuthoritativeBassResponse.js';
import { buildCanonicalRoomResponse } from '@/components/room/bass/buildCanonicalRoomResponse.js';
import { computeCalibrationFingerprint } from '@/components/room/bass/bassAnalysisFingerprints.js';
import { getPerSubwooferAmplifierAuthority, DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W } from '@/components/utils/subwooferCapability.js';
import { normaliseModelKey } from '@/components/utils/modelKeyNormaliser.js';
import { resolveSubwooferBassCapability } from '@/components/utils/speakerModelResolver.jsx';
import { getRp22BassOperatingDefinitions } from '@/components/utils/rp22BassOperatingDefinitions.js';
import { P14_MINIMUM_THRESHOLDS } from '@/components/utils/p14CapabilityAuthority.js';
import { generateCanonicalCandidatePool } from '@/components/utils/canonicalBassOptimiser.js';
import { selectCandidateFromPool } from '@/components/utils/bassCandidatePoolSelection.js';
import { buildFinalOptimisedBassResponse } from '@/components/room/bass/finalOptimisedBassResponse.js';
import { evaluateCanonicalBassAuthority } from '@/components/utils/canonicalBassAuthorityEvaluation.js';
import { buildP14TargetCombinations } from '@/components/room/bass/p14TargetDefinitions.js';
import { gradeP19FromRaw, gradeP20FromRaw } from '@/components/room/bass/completedBassResultPersistence.js';
import { resumWithTuning } from '@/components/room/bass/stage2/stage2TuningSearch.js';
import { computeTransitionFrequencyHz } from '@/components/utils/rp22BassMetrics.jsx';

// ── Persisted authority (read from database via exec_tool, passed as JSON) ──
import fs from 'node:fs';
const PERSISTED_PATH = new URL('./_stage11a-persisted-authority.json', import.meta.url);
const PERSISTED = fs.existsSync(PERSISTED_PATH)
  ? JSON.parse(fs.readFileSync(PERSISTED_PATH, 'utf8'))
  : null;

// ════════════════════════════════════════════════════════════════════════
// PROJECT INPUTS — actual Luxavo/Duffy from database
// ════════════════════════════════════════════════════════════════════════

const ROOM_DIMS = { widthM: 4.0, lengthM: 6.3, heightM: 2.4 };
const SCREEN_FRONT_PLANE_M = 0.275;
const SCREEN_SIZE_INCHES = 120; // screen_size = viewable width in inches
const SCREEN_WIDTH_M = SCREEN_SIZE_INCHES * 0.0254; // 3.048 m

const SUBWOOFER_INSTANCES = [
  { id: 'sub-front-1', model: 'sub3-12', enabled: true, position: { x: 1, y: 0.16 }, bottomHeightM: 0.05, rotationDeg: 0, positionSource: 'user', legacyGroup: 'front', symmetryLinkId: null, gainDb: 0, delayMs: 0, polarity: 1 },
  { id: 'sub-front-2', model: 'sub3-12', enabled: true, position: { x: 3, y: 0.16 }, bottomHeightM: 0.05, rotationDeg: 0, positionSource: 'user', legacyGroup: 'front', symmetryLinkId: null, gainDb: 0, delayMs: 0, polarity: 1 },
  { id: 'sub-rear-1',  model: 'sub3-12', enabled: true, position: { x: 1, y: 6.14 }, bottomHeightM: 0.05, rotationDeg: 0, positionSource: 'user', legacyGroup: 'rear',  symmetryLinkId: null, gainDb: 0, delayMs: 0, polarity: 1 },
  { id: 'sub-rear-2',  model: 'sub3-12', enabled: true, position: { x: 3, y: 6.14 }, bottomHeightM: 0.05, rotationDeg: 0, positionSource: 'user', legacyGroup: 'rear',  symmetryLinkId: null, gainDb: 0, delayMs: 0, polarity: 1 },
];

const SEATING_POSITIONS = [
  { id: 'seat-r1-c1', x: 1.6, y: 2.59, z: 1.2, rowNumber: 1, isPrimary: true,  priority: 'primary' },
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

// Production physics — same overrides as useAuthoritativeBassResponse
const PHYSICS = {
  ...BASS_NORMALIZED_PHYSICS_DEFAULTS,
  rewSourceCurveMode: 'product',
  disableLateField: true,
  disableModalPropagationPhase: true,
  rewParityModalMagnitudeScale: 1,
  debugModalPhaseConvention: 'normal',
  debugModalHSign: 'normal',
};

// ════════════════════════════════════════════════════════════════════════
// STEP 1: Compute RSP position (same as production)
// ════════════════════════════════════════════════════════════════════════

console.log('═══════════════════════════════════════════════════════════════');
console.log('STAGE 11A — LIVE CANONICAL PARITY HARNESS');
console.log('Project: Luxavo / Duffy — 4.0 × 6.3 × 2.4 m, 4× SUB3-12');
console.log('P14: Minimum L2 / 112 dBC');
console.log('═══════════════════════════════════════════════════════════════\n');

const rspResult = computeEffectiveRsp({
  rspMode: 'auto_from_screen',
  roomWidthM: ROOM_DIMS.widthM,
  screenFrontPlaneM: SCREEN_FRONT_PLANE_M,
  screenWidthM: SCREEN_WIDTH_M,
  manualRspY_m: 0,
  manualRspX_m: 0,
  designatedRspSeat: null,
});
const MLP_Y = rspResult.effectiveRspY_m;
const MLP_X = rspResult.effectiveRspX_m;
console.log(`1. RSP: x=${MLP_X}, y=${MLP_Y?.toFixed(6)}, source=${rspResult.rspSourceLabel}`);

const rspPosition = buildAuthoritativeRspPosition(ROOM_DIMS, MLP_Y, MLP_X, null);
console.log(`   rspPosition: ${JSON.stringify(rspPosition)}`);

// ════════════════════════════════════════════════════════════════════════
// STEP 2: Build sources (same as production)
// ════════════════════════════════════════════════════════════════════════

const frontSubsLive = SUBWOOFER_INSTANCES.filter(s => s.enabled && s.legacyGroup === 'front');
const rearSubsLive = SUBWOOFER_INSTANCES.filter(s => s.enabled && s.legacyGroup === 'rear');

const autoAlignDelays = buildAuthoritativeAutoAlignDelays({
  enabled: true, rspPosition, frontSubsLive, rearSubsLive,
  frontSubsCfg: FRONT_SUBS_CFG, rearSubsCfg: REAR_SUBS_CFG,
});

const sources = buildAuthoritativeBassSources({
  frontSubsLive, rearSubsLive,
  frontSubsCfg: FRONT_SUBS_CFG, rearSubsCfg: REAR_SUBS_CFG,
  autoAlignDelays,
  amplifierPowerPerSubW: DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W,
});

console.log(`\n2. Sources built: ${sources.length}`);
for (const s of sources) {
  console.log(`   ${s.id}: model=${s.modelKey}, x=${s.x}, y=${s.y}, z=${s.z}, ` +
    `tuning={delay=${s.tuning.delayMs?.toFixed(4)}ms, gain=${s.tuning.gainDb}dB, pol=${s.tuning.polarity}°}`);
}

// ════════════════════════════════════════════════════════════════════════
// STEP 3: Compute calibration fingerprint (freshness check)
// ════════════════════════════════════════════════════════════════════════

const liveFingerprint = computeCalibrationFingerprint({
  roomDims: ROOM_DIMS,
  seatingPositions: SEATING_POSITIONS,
  rspPosition,
  sources,
  // Physics fields must be at top level (computeGeometryFingerprint reads i.surfaceAbsorption, etc.)
  ...PHYSICS,
  qStrategy: PHYSICS.qStrategy,
  qStrategyOverride: PHYSICS.qStrategy,
  p14TargetBasis: P14_TARGET_BASIS,
  p14TargetLevel: P14_TARGET_LEVEL,
  selectedP14TargetDb: P14_TARGET_DB,
  selectedSubModel: 'sub3-12',
  splConfig: { globalPowerW: DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W },
});

console.log(`\n3. Live fingerprint: ${liveFingerprint}`);
if (PERSISTED) {
  console.log(`   Persisted fingerprint: ${PERSISTED.currentFingerprint}`);
  console.log(`   Match: ${liveFingerprint === PERSISTED.currentFingerprint ? 'YES — fresh' : 'NO — STALE'}`);
}

// ════════════════════════════════════════════════════════════════════════
// STEP 4: Run authoritative bass simulation (ACTUAL production engine)
// ════════════════════════════════════════════════════════════════════════

console.log('\n4. Running simulateAuthoritativeBassResponse...');
const simStart = performance.now();
const engineResult = simulateAuthoritativeBassResponse({
  roomDims: ROOM_DIMS,
  seatingPositions: SEATING_POSITIONS,
  rspPosition,
  sources,
  physics: PHYSICS,
  qStrategyOverride: PHYSICS.qStrategy,
  capturePerSourcePerSeat: true,
});
const simEnd = performance.now();
console.log(`   Simulation: ${(simEnd - simStart).toFixed(1)} ms`);
console.log(`   Seat responses: ${Object.keys(engineResult.seatResponses).join(', ')}`);

// Build response curves
const { rspRawCurve, perSeatRawCurves } = buildAuthoritativeResponseCurves(engineResult.seatResponses);
console.log(`   RSP raw curve: ${rspRawCurve.length} points`);
console.log(`   Per-seat curves: ${perSeatRawCurves.length} seats`);

// Build canonical room response curve (flat-source, from per-source RSP transfers)
const roomResponseResult = buildCanonicalRoomResponse(engineResult.perSourceRspComplexTransfers);
const roomResponseCurve = roomResponseResult?.points || [];
console.log(`   Room response curve: ${roomResponseCurve.length} points`);

// ════════════════════════════════════════════════════════════════════════
// STEP 5: Generate candidate pool → select → build final → evaluate authority
// ════════════════════════════════════════════════════════════════════════

console.log('\n5. Running canonical confirmation chain...');

// Get usable LF and transition
const ampAuth = getPerSubwooferAmplifierAuthority(sources);
const usableLfHz = sources[0]?.bassCapability?.usableLF_neg6dB ?? 20;
const transitionHz = computeTransitionFrequencyHz(ROOM_DIMS, 0.4);
console.log(`   Usable LF: ${usableLfHz} Hz, Transition: ${transitionHz?.toFixed(2)} Hz`);

const poolStart = performance.now();
const pool = generateCanonicalCandidatePool({
  rawCurve: rspRawCurve,
  activeSubs: sources,
  usableLfHz,
  transitionHz,
  correctionEndHz: 200,
  perSeatRawCurves,
  selectedP14TargetDb: P14_TARGET_DB,
  p14TargetBasis: P14_TARGET_BASIS,
  p14TargetLevel: P14_TARGET_LEVEL,
  p18TargetBasis: 'minimum',
  perSourceComplexTransfers: [],
  normalizedTransferFingerprint: null,
  calibrationFingerprint: null,
});
const poolEnd = performance.now();
console.log(`   Candidate pool: ${(poolEnd - poolStart).toFixed(1)} ms`);

const selection = selectCandidateFromPool(pool);
if (!selection?.selectedCandidate) {
  console.log('   ERROR: No candidate selected');
  process.exit(1);
}
console.log(`   Selected candidate: ${selection.selectedCandidateId}`);

const canonicalResult = buildFinalOptimisedBassResponse({
  optimisationResult: selection,
  selectedLayout: sources,
  roomResponseCurve,
});
if (!canonicalResult) {
  console.log('   ERROR: buildFinalOptimisedBassResponse returned null');
  process.exit(1);
}

const authorityStart = performance.now();
const authority = evaluateCanonicalBassAuthority({
  canonicalResult,
  activeSubs: sources,
  usableLfHz,
  p14TargetBasis: P14_TARGET_BASIS,
  p18TargetBasis: 'minimum',
  requestedLevel: P14_TARGET_LEVEL,
});
const authorityEnd = performance.now();
console.log(`   Authority evaluation: ${(authorityEnd - authorityStart).toFixed(1)} ms`);

// ════════════════════════════════════════════════════════════════════════
// STEP 6: Extract direct results
// ════════════════════════════════════════════════════════════════════════

const directP14 = authority?.achievedP14Db;
const directP14Level = authority?.achievedP14Level;
const directP18Hz = authority?.achievedP18FrequencyHz;
const directP18Level = authority?.achievedP18Level;
const directPerSeatP19 = authority?.perSeatP19Results || [];
const directPerSeatP20 = authority?.perSeatP20Results || [];
const directAssessmentStart = authority?.assessmentStartHz;
const directAssessmentEnd = authority?.assessmentEndHz;

console.log('\n6. DIRECT PRODUCTION RESULTS:');
console.log(`   P14: ${directP14?.toFixed(4)} dB (L${directP14Level})`);
console.log(`   P18: ${directP18Hz?.toFixed(4)} Hz (L${directP18Level})`);
console.log(`   Assessment band: [${directAssessmentStart?.toFixed(2)}, ${directAssessmentEnd?.toFixed(2)}] Hz`);
console.log(`   P19 per-seat:`);
for (const s of directPerSeatP19) {
  console.log(`     ${s.seatId}: ${s.variationDbRaw?.toFixed(6)} dB (L${s.level}) @ ${s.worstFrequencyHz?.toFixed(2)} Hz`);
}
console.log(`   P20 per-seat:`);
for (const s of directPerSeatP20) {
  console.log(`     ${s.seatId}: ${s.variationDbRaw?.toFixed(6)} dB (L${s.level}) @ ${s.worstFrequencyHz?.toFixed(2)} Hz`);
}

// Curve samples
const postEqRspCurve = canonicalResult.canonicalPostEqRsp || [];
const keyFreqs = [20, 30, 40, 50, 55, 60, 70, 80, 90, 100, 110, 114, 120, 130, 150, 162, 200];
function findInCurve(curve, freq) {
  if (!Array.isArray(curve)) return null;
  let closest = null, minDist = Infinity;
  for (const p of curve) {
    const f = Number(p.frequency ?? p.freq ?? p.hz);
    const s = Number(p.spl ?? p.db);
    if (!Number.isFinite(f) || !Number.isFinite(s)) continue;
    const d = Math.abs(f - freq);
    if (d < minDist) { minDist = d; closest = { f, s }; }
  }
  return closest;
}
const directRspSamples = keyFreqs.map(f => {
  const p = findInCurve(postEqRspCurve, f);
  return { f, spl: p?.s };
});

// ════════════════════════════════════════════════════════════════════════
// STEP 7: Compare with persisted authority
// ════════════════════════════════════════════════════════════════════════

console.log('\n7. PARITY COMPARISON:');

const results = [];
function record(test, expected, actual, pass) {
  results.push({ test, expected, actual, pass });
}

if (!PERSISTED) {
  console.log('   NO PERSISTED AUTHORITY FILE — skip comparison');
  console.log('   Writing direct results for future comparison...');
  fs.writeFileSync(PERSISTED_PATH, JSON.stringify({
    currentFingerprint: liveFingerprint,
    achievedP14Db: directP14,
    achievedP14Level: directP14Level,
    achievedP18Hz: directP18Hz,
    achievedP18Level: directP18Level,
    perSeatP19: directPerSeatP19,
    perSeatP20: directPerSeatP20,
    rspSamples: directRspSamples,
    assessmentStartHz: directAssessmentStart,
    assessmentEndHz: directAssessmentEnd,
  }, null, 2));
  console.log('   Written. Re-run to compare.');
  process.exit(0);
}

// Fingerprint check
const fingerprintMatch = liveFingerprint === PERSISTED.currentFingerprint;
record('Fingerprint match', PERSISTED.currentFingerprint, liveFingerprint, fingerprintMatch);
console.log(`   Fingerprint: ${fingerprintMatch ? 'MATCH' : 'MISMATCH'}`);

// P14/P18
const p14Delta = Math.abs((directP14 ?? 0) - (PERSISTED.achievedP14Db ?? 0));
const p18Delta = Math.abs((directP18Hz ?? 0) - (PERSISTED.achievedP18Hz ?? 0));
record('P14 dB', PERSISTED.achievedP14Db, directP14, p14Delta < 0.01);
record('P18 Hz', PERSISTED.achievedP18Hz, directP18Hz, p18Delta < 0.01);
console.log(`   P14: persisted=${PERSISTED.achievedP14Db?.toFixed(4)} direct=${directP14?.toFixed(4)} Δ=${p14Delta.toFixed(6)}`);
console.log(`   P18: persisted=${PERSISTED.achievedP18Hz?.toFixed(4)} direct=${directP18Hz?.toFixed(4)} Δ=${p18Delta.toFixed(6)}`);

// Per-seat P19/P20
let maxP19Delta = 0, maxP20Delta = 0;
console.log(`   Per-seat P19:`);
for (const ds of directPerSeatP19) {
  const ps = PERSISTED.perSeatP19?.find(s => s.seatId === ds.seatId);
  const delta = Math.abs((ds.variationDbRaw ?? 0) - (ps?.variationDbRaw ?? 0));
  if (delta > maxP19Delta) maxP19Delta = delta;
  record(`P19 ${ds.seatId}`, ps?.variationDbRaw, ds.variationDbRaw, delta < 0.01);
  console.log(`     ${ds.seatId}: persisted=${ps?.variationDbRaw?.toFixed(6)} direct=${ds.variationDbRaw?.toFixed(6)} Δ=${delta.toFixed(6)}`);
}
console.log(`   Per-seat P20:`);
for (const ds of directPerSeatP20) {
  const ps = PERSISTED.perSeatP20?.find(s => s.seatId === ds.seatId);
  const delta = Math.abs((ds.variationDbRaw ?? 0) - (ps?.variationDbRaw ?? 0));
  if (delta > maxP20Delta) maxP20Delta = delta;
  record(`P20 ${ds.seatId}`, ps?.variationDbRaw, ds.variationDbRaw, delta < 0.01);
  console.log(`     ${ds.seatId}: persisted=${ps?.variationDbRaw?.toFixed(6)} direct=${ds.variationDbRaw?.toFixed(6)} Δ=${delta.toFixed(6)}`);
}

// Curve parity
let maxCurveDelta = 0;
console.log(`   RSP curve parity:`);
for (let i = 0; i < keyFreqs.length; i++) {
  const f = keyFreqs[i];
  const ps = PERSISTED.rspSamples?.find(s => Math.abs(s.f - f) < 1);
  const ds = directRspSamples[i];
  if (ps && ds && ps.spl != null && ds.spl != null) {
    const delta = Math.abs(ds.spl - ps.spl);
    if (delta > maxCurveDelta) maxCurveDelta = delta;
    if (delta > 0.01) {
      console.log(`     ${f} Hz: persisted=${ps.spl?.toFixed(4)} direct=${ds.spl?.toFixed(4)} Δ=${delta.toFixed(6)}`);
    }
  }
}
console.log(`   Max curve delta: ${maxCurveDelta.toFixed(6)} dB`);

const maxDelta = Math.max(maxP19Delta, maxP20Delta, p14Delta, p18Delta, maxCurveDelta);
const parityPass = maxDelta < 0.01;
console.log(`\n   MAX PARITY DELTA: ${maxDelta.toFixed(8)}`);
console.log(`   PARITY: ${parityPass ? 'PASS' : 'FAIL'}`);

// ════════════════════════════════════════════════════════════════════════
// STEP 8: Legacy P19 exclusion proof
// ════════════════════════════════════════════════════════════════════════

console.log('\n8. LEGACY P19 EXCLUSION:');
console.log('   computeParam19Deviation is NOT imported by this harness.');
console.log('   P19 comes ONLY from computeOfficialP19Assessment via evaluateCanonicalBassAuthority.');
console.log('   LEGACY P19 INVOCATION = NO');

// ════════════════════════════════════════════════════════════════════════
// SUMMARY
// ════════════════════════════════════════════════════════════════════════

const passed = results.filter(r => r.pass).length;
const failed = results.filter(r => !r.pass).length;
console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`TESTS: ${passed} passed, ${failed} failed`);
console.log(`MAX PARITY DELTA: ${maxDelta.toFixed(8)}`);
console.log(`LEGACY P19 INVOKED: NO`);
console.log(`TOTAL SIMULATION TIME: ${(simEnd - simStart).toFixed(1)} ms`);
console.log(`TOTAL CANONICAL CHAIN TIME: ${(poolEnd - poolStart + authorityEnd - authorityStart).toFixed(1)} ms`);
console.log(`TOTAL ELAPSED: ${(authorityEnd - simStart).toFixed(1)} ms`);

if (parityPass) {
  console.log('\n  STAGE 11A LIVE CANONICAL PARITY PASSED — PROCEED TO STAGE 11B');
} else {
  console.log('\n  STAGE 11A LIVE CANONICAL PARITY FAILED — DO NOT PROCEED');
  // Find first divergence
  for (const r of results) {
    if (!r.pass) {
      console.log(`  FIRST DIVERGENCE: ${r.test} (expected=${r.expected}, actual=${r.actual})`);
      break;
    }
  }
}
console.log('═══════════════════════════════════════════════════════════════');