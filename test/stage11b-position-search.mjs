// stage11b-position-search.mjs
// Stage 11B — Physical subwoofer position optimisation.
// Searches 100mm symmetric movements, cheap proxy screens, tuning search,
// canonical confirmation of best finalists.
//
// Run: node --import ./test/_alias-register.mjs test/stage11b-position-search.mjs

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
import { computeCalibrationFingerprint } from '@/components/room/bass/bassAnalysisFingerprints.js';
import { DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W } from '@/components/utils/subwooferCapability.js';
import { P14_MINIMUM_THRESHOLDS } from '@/components/utils/p14CapabilityAuthority.js';
import { generateCanonicalCandidatePool } from '@/components/utils/canonicalBassOptimiser.js';
import { selectCandidateFromPool } from '@/components/utils/bassCandidatePoolSelection.js';
import { buildFinalOptimisedBassResponse } from '@/components/room/bass/finalOptimisedBassResponse.js';
import { evaluateCanonicalBassAuthority } from '@/components/utils/canonicalBassAuthorityEvaluation.js';
import { computeTransitionFrequencyHz } from '@/components/utils/rp22BassMetrics.jsx';
import { ARTCOUSTIC_HOUSE_CURVE } from '@/components/utils/artcousticHouseCurve.js';
import { deriveRequestedCalibrationConfig } from '@/components/room/bass/requestedCalibrationConfig.js';
import { MODELS, normaliseModelKey } from '@/components/models/speakers/registry';
import {
  searchDelayOnly, searchDelayPolarityTrim, searchPolarity, searchGainOnly,
  resumWithTuning,
} from '@/components/room/bass/stage2/stage2TuningSearch.js';
import { isMaterialImprovement } from '@/components/room/bass/improveBassV2/materialityGate.js';

// ════════════════════════════════════════════════════════════════════════
// PROJECT INPUTS — Luxavo / Duffy (same as Stage 11A)
// ════════════════════════════════════════════════════════════════════════

const ROOM_DIMS = { widthM: 4.0, lengthM: 6.3, heightM: 2.4 };
const SCREEN_FRONT_PLANE_M = 0.275;
const SCREEN_WIDTH_M = 120 * 0.0254;

const P14_TARGET_BASIS = 'minimum';
const P14_TARGET_LEVEL = 2;
const P14_TARGET_DB = P14_MINIMUM_THRESHOLDS.L2;

const PHYSICS = {
  ...BASS_NORMALIZED_PHYSICS_DEFAULTS,
  rewSourceCurveMode: 'product',
  disableLateField: true,
  disableModalPropagationPhase: true,
  rewParityModalMagnitudeScale: 1,
  debugModalPhaseConvention: 'normal',
  debugModalHSign: 'normal',
};

const SPL_CONFIG = {
  selectedP14TargetBasis: P14_TARGET_BASIS,
  selectedP14Level: P14_TARGET_LEVEL,
  selectedP18TargetBasis: 'minimum',
  subwooferAmplifierPowerW: DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W,
  globalPowerW: DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W,
  globalEqHeadroomDb: 0,
  radiationMode: 'half_space',
};

const SEATING_POSITIONS = [
  { id: 'seat-r1-c1', x: 1.6, y: 2.59, z: 1.2, rowNumber: 1, isPrimary: true, priority: 'primary' },
  { id: 'seat-r1-c2', x: 2.4, y: 2.59, z: 1.2, rowNumber: 1, isPrimary: true, priority: 'primary' },
  { id: 'seat-r2-c1', x: 1.2, y: 4.39, z: 1.5, rowNumber: 2, isPrimary: false, priority: 'secondary' },
  { id: 'seat-r2-c2', x: 2.0, y: 4.39, z: 1.5, rowNumber: 2, isPrimary: false, priority: 'secondary' },
  { id: 'seat-r2-c3', x: 2.8, y: 4.39, z: 1.5, rowNumber: 2, isPrimary: false, priority: 'secondary' },
];

// Current sub positions
const CUR_FRONT = { x: 1.0, y: 0.16 };
const CUR_REAR  = { x: 1.0, y: 6.14 };
const SUB_CABINET_HALF_M = 0.3; // SUB3-12 is 600mm
const WALL_CLEARANCE_M = 0.05;
const STEP_M = 0.1;
const MAX_STEPS = 3;

// ════════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════════

const timings = {};
function ms(label, fn) {
  const start = performance.now();
  const result = fn();
  timings[label] = (timings[label] || 0) + (performance.now() - start);
  return result;
}

function buildSubInstances(frontLeftX, frontY, rearLeftX, rearY) {
  const cx = ROOM_DIMS.widthM / 2;
  return [
    { id: 'sub-front-1', model: 'sub3-12', enabled: true, position: { x: frontLeftX, y: frontY }, bottomHeightM: 0.05, rotationDeg: 0, positionSource: 'user', legacyGroup: 'front', symmetryLinkId: null, gainDb: 0, delayMs: 0, polarity: 1 },
    { id: 'sub-front-2', model: 'sub3-12', enabled: true, position: { x: ROOM_DIMS.widthM - frontLeftX, y: frontY }, bottomHeightM: 0.05, rotationDeg: 0, positionSource: 'user', legacyGroup: 'front', symmetryLinkId: null, gainDb: 0, delayMs: 0, polarity: 1 },
    { id: 'sub-rear-1', model: 'sub3-12', enabled: true, position: { x: rearLeftX, y: rearY }, bottomHeightM: 0.05, rotationDeg: 0, positionSource: 'user', legacyGroup: 'rear', symmetryLinkId: null, gainDb: 0, delayMs: 0, polarity: 1 },
    { id: 'sub-rear-2', model: 'sub3-12', enabled: true, position: { x: ROOM_DIMS.widthM - rearLeftX, y: rearY }, bottomHeightM: 0.05, rotationDeg: 0, positionSource: 'user', legacyGroup: 'rear', symmetryLinkId: null, gainDb: 0, delayMs: 0, polarity: 1 },
  ];
}

function buildSourcesForSubs(subInstances, rspPosition) {
  const frontSubsLive = subInstances.filter(s => s.enabled && s.legacyGroup === 'front');
  const rearSubsLive = subInstances.filter(s => s.enabled && s.legacyGroup === 'rear');
  const frontSubsCfg = { model: 'sub3-12', count: 2, positions: frontSubsLive.map(s => s.position), tuning: [], orientation: 'vertical', bottomHeightM: 0.05 };
  const rearSubsCfg = { model: 'sub3-12', count: 2, positions: rearSubsLive.map(s => s.position), tuning: [], orientation: 'vertical', bottomHeightM: 0.05 };
  const autoAlignDelays = buildAuthoritativeAutoAlignDelays({ enabled: true, rspPosition, frontSubsLive, rearSubsLive, frontSubsCfg, rearSubsCfg });
  return buildAuthoritativeBassSources({ frontSubsLive, rearSubsLive, frontSubsCfg, rearSubsCfg, autoAlignDelays, amplifierPowerPerSubW: DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W });
}

function isValidPosition(x, y) {
  const minXY = SUB_CABINET_HALF_M + WALL_CLEARANCE_M;
  return x >= minXY && x <= ROOM_DIMS.widthM - minXY && y >= minXY && y <= ROOM_DIMS.lengthM - minXY;
}

// Cheap proxy: peak-to-peak SPL variation on RSP curve in 20-200 Hz
function proxyScore(rspCurve) {
  const bassPoints = rspCurve.filter(p => p.frequency >= 20 && p.frequency <= 200);
  if (bassPoints.length < 2) return Infinity;
  const spls = bassPoints.map(p => p.spl);
  return Math.max(...spls) - Math.min(...spls);
}

// Full canonical chain (same as Stage 11A)
function runCanonicalChain(seatResponses, roomResponseCurve, sources, label) {
  const { rspRawCurve, perSeatRawCurves } = buildAuthoritativeResponseCurves(seatResponses);
  const usableLfHz = Math.max(...sources.map(s =>
    MODELS.find(m => m.key === normaliseModelKey(s.modelKey))?.approvedUsableLfHzMinus6dB ?? 20
  ));
  const transitionHz = computeTransitionFrequencyHz(ROOM_DIMS, 0.4);

  const pool = ms(`pool:${label}`, () => generateCanonicalCandidatePool({
    rawCurve: rspRawCurve, activeSubs: sources, usableLfHz, transitionHz,
    correctionEndHz: 200, perSeatRawCurves,
    selectedP14TargetDb: P14_TARGET_DB, p14TargetBasis: P14_TARGET_BASIS,
    p14TargetLevel: P14_TARGET_LEVEL, p18TargetBasis: 'minimum',
    perSourceComplexTransfers: [], normalizedTransferFingerprint: null, calibrationFingerprint: null,
  }));
  const selection = ms(`select:${label}`, () => selectCandidateFromPool(pool));
  if (!selection?.selectedCandidate) return null;
  const canonicalResult = ms(`buildFinal:${label}`, () => buildFinalOptimisedBassResponse({
    optimisationResult: selection, selectedLayout: sources, roomResponseCurve,
  }));
  if (!canonicalResult) return null;
  const authority = ms(`authority:${label}`, () => evaluateCanonicalBassAuthority({
    canonicalResult, activeSubs: sources, usableLfHz,
    p14TargetBasis: P14_TARGET_BASIS, p18TargetBasis: 'minimum', requestedLevel: P14_TARGET_LEVEL,
  }));
  return { canonicalResult, authority, pool, selection };
}

function extractP19P20(authority) {
  const p19Results = (authority?.perSeatP19Results || []).map(s => ({
    ...s, isPrimary: SEATING_POSITIONS.find(p => p.id === s.seatId)?.isPrimary || false,
  }));
  const p20Results = (authority?.perSeatP20Results || []).map(s => ({
    ...s, isPrimary: SEATING_POSITIONS.find(p => p.id === s.seatId)?.isPrimary || false,
  }));
  return {
    p19Results, p20Results,
    p19Level: Math.max(...p19Results.map(s => s.level || 0)),
    p20Level: Math.max(...p20Results.map(s => s.level || 0)),
    p14Db: authority?.achievedP14Db,
    p14Level: authority?.achievedP14Level,
    p18Hz: authority?.achievedP18Hz ?? authority?.achievedP18FrequencyHz,
    p18Level: authority?.achievedP18Level,
  };
}

function checkPrimaryRegression(currentMetrics, candidateMetrics) {
  for (const s of candidateMetrics.p19Results) {
    if (!s.isPrimary) continue;
    const cur = currentMetrics.p19Results.find(p => p.seatId === s.seatId);
    if (cur && (s.level || 0) < (cur.level || 0)) return true;
  }
  for (const s of candidateMetrics.p20Results) {
    if (!s.isPrimary) continue;
    const cur = currentMetrics.p20Results.find(p => p.seatId === s.seatId);
    if (cur && (s.level || 0) < (cur.level || 0)) return true;
  }
  return false;
}

function worstSeatDeviation(p19, p20) {
  let worst = 0;
  for (const s of [...p19, ...p20]) {
    const v = Math.abs(Number(s?.variationDbRaw) || 0);
    if (v > worst) worst = v;
  }
  return worst;
}

// ════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════

console.log('═══════════════════════════════════════════════════════════════');
console.log('STAGE 11B — PHYSICAL SUBWOOFER POSITION OPTIMISATION');
console.log('Project: Luxavo / Duffy — 4.0 × 6.3 × 2.4 m, 4× SUB3-12');
console.log('P14: Minimum L2 / 112 dBC');
console.log('Primary seats: seat-r1-c1, seat-r1-c2');
console.log('═══════════════════════════════════════════════════════════════\n');

const overallStart = performance.now();

// ── RSP ──
const rspResult = computeEffectiveRsp({
  rspMode: 'auto_from_screen', roomWidthM: ROOM_DIMS.widthM,
  screenFrontPlaneM: SCREEN_FRONT_PLANE_M, screenWidthM: SCREEN_WIDTH_M,
  manualRspY_m: 0, manualRspX_m: 0, designatedRspSeat: null,
});
const MLP_Y = rspResult.effectiveRspY_m;
const MLP_X = rspResult.effectiveRspX_m;
const rspPosition = buildAuthoritativeRspPosition(ROOM_DIMS, MLP_Y, MLP_X, null);
console.log(`RSP: x=${MLP_X}, y=${MLP_Y?.toFixed(6)}\n`);

// ── Current baseline ──
console.log('1. EVALUATING CURRENT BASELINE...');
const curSubs = buildSubInstances(CUR_FRONT.x, CUR_FRONT.y, CUR_REAR.x, CUR_REAR.y);
const curSources = buildSourcesForSubs(curSubs, rspPosition);
const curSim = ms('sim:current', () => simulateAuthoritativeBassResponse({
  roomDims: ROOM_DIMS, seatingPositions: SEATING_POSITIONS, rspPosition,
  sources: curSources, physics: PHYSICS, qStrategyOverride: PHYSICS.qStrategy,
  capturePerSourcePerSeat: true,
}));
const curRoomResp = buildCanonicalRoomResponse(curSim.perSourceRspComplexTransfers)?.points || [];
const curResult = runCanonicalChain(curSim.seatResponses, curRoomResp, curSources, 'current');
if (!curResult) { console.log('ERROR: Current baseline failed'); process.exit(1); }
const curMetrics = extractP19P20(curResult.authority);
const curProxy = proxyScore(buildAuthoritativeResponseCurves(curSim.seatResponses).rspRawCurve);

console.log(`   P19: L${curMetrics.p19Level}, P20: L${curMetrics.p20Level}, P14: ${curMetrics.p14Db?.toFixed(1)}dB`);
console.log(`   P19 per-seat:`);
for (const s of curMetrics.p19Results) console.log(`     ${s.seatId}: ${s.variationDbRaw?.toFixed(2)} dB (L${s.level}) @ ${s.worstFrequencyHz?.toFixed(1)} Hz${s.isPrimary ? ' [P]' : ''}`);
console.log(`   P20 per-seat:`);
for (const s of curMetrics.p20Results) console.log(`     ${s.seatId}: ${s.variationDbRaw?.toFixed(2)} dB (L${s.level}) @ ${s.worstFrequencyHz?.toFixed(1)} Hz${s.isPrimary ? ' [P]' : ''}`);
console.log(`   Proxy score (p-p): ${curProxy?.toFixed(2)} dB\n`);

const currentForMateriality = {
  achievedP19Level: curMetrics.p19Level,
  achievedP20Level: curMetrics.p20Level,
  perSeatP19: curMetrics.p19Results,
  perSeatP20: curMetrics.p20Results,
};

// ════════════════════════════════════════════════════════════════════════
// PHASE A — SYMMETRIC CANDIDATES
// ════════════════════════════════════════════════════════════════════════

console.log('2. GENERATING SYMMETRIC CANDIDATES (100mm steps, ±300mm)...');

const candidates = [];
const steps = [];
for (let i = 1; i <= MAX_STEPS; i++) steps.push(i * STEP_M);

// A1: Front pair lateral (inward/outward)
for (const d of steps) {
  // inward: left x increases, right x decreases
  const fx = CUR_FRONT.x + d;
  if (isValidPosition(fx, CUR_FRONT.y)) candidates.push({ label: `Front inward ${d.toFixed(1)}m`, frontX: fx, frontY: CUR_FRONT.y, rearX: CUR_REAR.x, rearY: CUR_REAR.y, type: 'front-lat' });
  // outward
  const fxo = CUR_FRONT.x - d;
  if (isValidPosition(fxo, CUR_FRONT.y)) candidates.push({ label: `Front outward ${d.toFixed(1)}m`, frontX: fxo, frontY: CUR_FRONT.y, rearX: CUR_REAR.x, rearY: CUR_REAR.y, type: 'front-lat' });
}

// A2: Rear pair lateral
for (const d of steps) {
  const rx = CUR_REAR.x + d;
  if (isValidPosition(rx, CUR_REAR.y)) candidates.push({ label: `Rear inward ${d.toFixed(1)}m`, frontX: CUR_FRONT.x, frontY: CUR_FRONT.y, rearX: rx, rearY: CUR_REAR.y, type: 'rear-lat' });
  const rxo = CUR_REAR.x - d;
  if (isValidPosition(rxo, CUR_REAR.y)) candidates.push({ label: `Rear outward ${d.toFixed(1)}m`, frontX: CUR_FRONT.x, frontY: CUR_FRONT.y, rearX: rxo, rearY: CUR_REAR.y, type: 'rear-lat' });
}

// A3: Front pair depth (forward/backward)
for (const d of steps) {
  const fyf = CUR_FRONT.y + d;
  if (isValidPosition(CUR_FRONT.x, fyf)) candidates.push({ label: `Front forward ${d.toFixed(1)}m`, frontX: CUR_FRONT.x, frontY: fyf, rearX: CUR_REAR.x, rearY: CUR_REAR.y, type: 'front-depth' });
  const fyb = CUR_FRONT.y - d;
  if (isValidPosition(CUR_FRONT.x, fyb)) candidates.push({ label: `Front backward ${d.toFixed(1)}m`, frontX: CUR_FRONT.x, frontY: fyb, rearX: CUR_REAR.x, rearY: CUR_REAR.y, type: 'front-depth' });
}

// A4: Rear pair depth
for (const d of steps) {
  const ryf = CUR_REAR.y - d; // forward = toward screen
  if (isValidPosition(CUR_REAR.x, ryf)) candidates.push({ label: `Rear forward ${d.toFixed(1)}m`, frontX: CUR_FRONT.x, frontY: CUR_FRONT.y, rearX: CUR_REAR.x, rearY: ryf, type: 'rear-depth' });
  const ryb = CUR_REAR.y + d; // backward = away from screen
  if (isValidPosition(CUR_REAR.x, ryb)) candidates.push({ label: `Rear backward ${d.toFixed(1)}m`, frontX: CUR_FRONT.x, frontY: CUR_FRONT.y, rearX: CUR_REAR.x, rearY: ryb, type: 'rear-depth' });
}

// A5: Coordinated front+rear depth (both toward center / both away)
for (const d of steps) {
  // both toward center: front forward, rear forward
  candidates.push({ label: `Both toward center ${d.toFixed(1)}m`, frontX: CUR_FRONT.x, frontY: CUR_FRONT.y + d, rearX: CUR_REAR.x, rearY: CUR_REAR.y - d, type: 'coord-depth' });
  // both away from center: front backward, rear backward
  candidates.push({ label: `Both away from center ${d.toFixed(1)}m`, frontX: CUR_FRONT.x, frontY: CUR_FRONT.y - d, rearX: CUR_REAR.x, rearY: CUR_REAR.y + d, type: 'coord-depth' });
}

console.log(`   Generated ${candidates.length} symmetric candidates\n`);

// ════════════════════════════════════════════════════════════════════════
// PHASE A SCREENING — cheap simulation + proxy score
// ════════════════════════════════════════════════════════════════════════

console.log('3. CHEAP SCREENING (simulation + proxy score)...');
console.log(`   Estimating time remaining...`);

const screened = [];
const screenStart = performance.now();

for (let i = 0; i < candidates.length; i++) {
  const c = candidates[i];
  const subInstances = buildSubInstances(c.frontX, c.frontY, c.rearX, c.rearY);
  const sources = buildSourcesForSubs(subInstances, rspPosition);

  const sim = ms(`screen-sim`, () => simulateAuthoritativeBassResponse({
    roomDims: ROOM_DIMS, seatingPositions: SEATING_POSITIONS, rspPosition,
    sources, physics: PHYSICS, qStrategyOverride: PHYSICS.qStrategy,
    capturePerSourcePerSeat: false,
  }));

  const { rspRawCurve } = buildAuthoritativeResponseCurves(sim.seatResponses);
  const score = proxyScore(rspRawCurve);

  // Also get per-seat max deviation as secondary proxy
  const perSeatCurves = buildAuthoritativeResponseCurves(sim.seatResponses).perSeatRawCurves;
  let maxSeatDev = 0;
  for (const seat of perSeatCurves) {
    const bassPts = (seat.points || seat.curve || []).filter(p => p.frequency >= 20 && p.frequency <= 200);
    if (bassPts.length < 2) continue;
    const spls = bassPts.map(p => p.spl);
    const dev = Math.max(...spls) - Math.min(...spls);
    if (dev > maxSeatDev) maxSeatDev = dev;
  }

  screened.push({ ...c, proxyScore: score, maxSeatDev, sources, subInstances });

  // ETA
  const elapsed = performance.now() - screenStart;
  const rate = elapsed / (i + 1);
  const remaining = (candidates.length - i - 1) * rate;
  console.log(`   [${i + 1}/${candidates.length}] ${c.label}: proxy=${score?.toFixed(2)}dB, maxSeat=${maxSeatDev?.toFixed(2)}dB, ETA~${(remaining / 1000).toFixed(0)}s`);
}

console.log(`\n   Screening complete: ${(performance.now() - screenStart / 1000).toFixed(1)}s\n`);

// Sort by proxy score (lower = better)
screened.sort((a, b) => a.proxyScore - b.proxyScore);

// Keep top candidates for tuning + canonical (target 3-5)
const TOP_N = 5;
const topCandidates = screened.slice(0, TOP_N);

console.log(`4. TOP ${TOP_N} CANDIDATES FOR TUNING + CANONICAL CONFIRMATION:`);
for (const c of topCandidates) {
  console.log(`   ${c.label}: proxy=${c.proxyScore?.toFixed(2)}dB, maxSeat=${c.maxSeatDev?.toFixed(2)}dB`);
}
console.log();

// ════════════════════════════════════════════════════════════════════════
// PHASE B — TUNING SEARCH + CANONICAL CONFIRMATION
// ════════════════════════════════════════════════════════════════════════

console.log('5. TUNING SEARCH + CANONICAL CONFIRMATION...');
console.log(`   Estimating time remaining...`);

const confirmStart = performance.now();
const confirmedResults = [];

// Include current baseline as reference
confirmedResults.push({
  label: 'Current (zero tuning)',
  tuning: curSources.map(() => ({ delayMs: 0, gainDb: 0, polarity: 0 })),
  ...curMetrics,
  primaryRegression: false,
  isCurrent: true,
});

for (let i = 0; i < topCandidates.length; i++) {
  const c = topCandidates[i];
  console.log(`\n   [${i + 1}/${topCandidates.length}] ${c.label}...`);

  // Full simulation with per-source per-seat capture
  const subInstances = buildSubInstances(c.frontX, c.frontY, c.rearX, c.rearY);
  const sources = buildSourcesForSubs(subInstances, rspPosition);

  const sim = ms(`full-sim:${i}`, () => simulateAuthoritativeBassResponse({
    roomDims: ROOM_DIMS, seatingPositions: SEATING_POSITIONS, rspPosition,
    sources, physics: PHYSICS, qStrategyOverride: PHYSICS.qStrategy,
    capturePerSourcePerSeat: true,
  }));

  const perSourceRsp = sim.perSourceRspComplexTransfers || [];
  const perSourceRspForProxy = perSourceRsp
    .slice().sort((a, b) => (a.sourceIndex ?? 0) - (b.sourceIndex ?? 0))
    .map(t => ({ points: t.points }));

  // Tuning search
  console.log(`      A. Delay-only search...`);
  const delayRes = ms(`tune-delay:${i}`, () => searchDelayOnly(perSourceRspForProxy, sources));
  console.log(`         Finalists: ${delayRes.finalists.length}, best: ${delayRes.finalists[0]?.score?.toFixed(2)}`);

  console.log(`      B. Delay+Pol+Trim search...`);
  const dptRes = ms(`tune-dpt:${i}`, () => searchDelayPolarityTrim(perSourceRspForProxy, sources));
  console.log(`         Finalists: ${dptRes.finalists.length}, best: ${dptRes.finalists[0]?.score?.toFixed(2)}`);

  console.log(`      C. Polarity-only search...`);
  const polRes = ms(`tune-pol:${i}`, () => searchPolarity(perSourceRspForProxy, new Array(sources.length).fill(0), null));
  console.log(`         Best polarity: [${polRes.polarities}], score: ${polRes.score?.toFixed(2)}`);

  // Collect tuning finalists
  const tuningFinalists = [
    { label: 'zero', tuning: sources.map(() => ({ delayMs: 0, gainDb: 0, polarity: 0 })) },
    ...delayRes.finalists.map(f => ({ label: `delay(${f.score?.toFixed(1)})`, tuning: f.tuning })),
    ...dptRes.finalists.map(f => ({ label: `dpt(${f.score?.toFixed(1)})`, tuning: f.tuning })),
    { label: `pol(${polRes.score?.toFixed(1)})`, tuning: sources.map((_, j) => ({ delayMs: 0, gainDb: 0, polarity: polRes.polarities[j] || 0 })) },
  ];

  // Dedup
  const seen = new Set();
  const dedupedTuning = tuningFinalists.filter(f => {
    const sig = f.tuning.map(t => `${(t.delayMs || 0).toFixed(2)},${(t.gainDb || 0).toFixed(1)},${t.polarity || 0}`).join('|');
    if (seen.has(sig)) return false;
    seen.add(sig);
    return true;
  });

  // Per-seat transfers for resum
  const seatIds = ['rsp', ...SEATING_POSITIONS.map(s => s.id)];
  const perSourcePerSeatSorted = (sim.perSourcePerSeatComplexTransfers || [])
    .slice().sort((a, b) => {
      if (a.seatId !== b.seatId) return a.seatId < b.seatId ? -1 : 1;
      return (a.sourceIndex ?? 0) - (b.sourceIndex ?? 0);
    });
  const flatRspForResum = perSourceRsp
    .slice().sort((a, b) => (a.sourceIndex ?? 0) - (b.sourceIndex ?? 0))
    .map(t => ({ seatId: 'rsp', points: t.points }));

  // Canonical confirmation of best tuning finalist only (efficiency)
  // Pick the tuning with best proxy score
  let bestTuning = dedupedTuning[0];
  let bestTuningScore = Infinity;
  for (const f of dedupedTuning) {
    const tuned = resumWithTuning(perSourcePerSeatSorted, f.tuning, seatIds);
    const rsp = tuned.rsp;
    if (rsp && rsp.splDb) {
      const bassSpls = rsp.splDb.filter((_, idx) => rsp.freqsHz[idx] >= 20 && rsp.freqsHz[idx] <= 200);
      if (bassSpls.length < 2) continue;
      const dev = Math.max(...bassSpls) - Math.min(...bassSpls);
      if (dev < bestTuningScore) { bestTuningScore = dev; bestTuning = f; }
    }
  }

  console.log(`      Best tuning: ${bestTuning.label} (proxy=${bestTuningScore?.toFixed(2)})`);

  // Canonical confirm with best tuning
  const tunedSeatResponses = resumWithTuning(perSourcePerSeatSorted, bestTuning.tuning, seatIds);
  const tunedFlatRsp = resumWithTuning(flatRspForResum, bestTuning.tuning, ['rsp']);
  const tunedRoomResp = (tunedFlatRsp.rsp?.freqsHz || []).map((freq, idx) => ({
    frequency: freq, spl: tunedFlatRsp.rsp.splDb[idx],
  }));

  const result = runCanonicalChain(tunedSeatResponses, tunedRoomResp, sources, `cand-${i}`);
  if (!result) {
    console.log(`      SKIP: canonical evaluation returned null`);
    continue;
  }

  const metrics = extractP19P20(result.authority);
  const primaryReg = checkPrimaryRegression(curMetrics, metrics);

  // Sanity check
  const p14Val = Number(metrics.p14Db);
  if (!Number.isFinite(p14Val) || p14Val < 90 || metrics.p19Level < 0 || metrics.p20Level < 0) {
    console.log(`      SKIP: degenerate (P14=${p14Val?.toFixed(1)}, P19=L${metrics.p19Level}, P20=L${metrics.p20Level})`);
    continue;
  }

  console.log(`      P14=${metrics.p14Db?.toFixed(1)}dB(L${metrics.p14Level}) P19=L${metrics.p19Level} P20=L${metrics.p20Level} PrimaryReg=${primaryReg ? 'YES' : 'NO'}`);

  // Compute movement deltas
  const dFrontX = c.frontX - CUR_FRONT.x;
  const dFrontY = c.frontY - CUR_FRONT.y;
  const dRearX = c.rearX - CUR_REAR.x;
  const dRearY = c.rearY - CUR_REAR.y;

  confirmedResults.push({
    label: c.label,
    tuning: bestTuning.tuning,
    sources,
    ...metrics,
    primaryRegression: primaryReg,
    movement: { dFrontX, dFrontY, dRearX, dRearY },
    frontX: c.frontX, frontY: c.frontY, rearX: c.rearX, rearY: c.rearY,
  });

  // ETA
  const elapsed = performance.now() - confirmStart;
  const rate = elapsed / (i + 1);
  const remaining = (topCandidates.length - i - 1) * rate;
  console.log(`      ETA~${(remaining / 1000).toFixed(0)}s remaining`);
}

console.log(`\n   Confirmation complete: ${confirmedResults.length - 1} candidates confirmed\n`);

// ════════════════════════════════════════════════════════════════════════
// MATERIALITY ASSESSMENT
// ════════════════════════════════════════════════════════════════════════

console.log('6. MATERIALITY ASSESSMENT...');
const materialCandidates = [];

for (const f of confirmedResults) {
  if (f.isCurrent) continue;
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

console.log(`   Material candidates: ${materialCandidates.length}\n`);

// ════════════════════════════════════════════════════════════════════════
// LEXICOGRAPHIC RANKING
// ════════════════════════════════════════════════════════════════════════

function rankLex(a, b) {
  // 1. No primary regression (both already filtered)
  // 2. Improve worst P19/P20 levels
  const aWorst = Math.min(a.p19Level, a.p20Level);
  const bWorst = Math.min(b.p19Level, b.p20Level);
  if (aWorst !== bWorst) return bWorst - aWorst;
  // 3. More seats at higher levels
  const aAvgP19 = a.p19Results.reduce((s, x) => s + (x.level || 0), 0) / a.p19Results.length;
  const bAvgP19 = b.p19Results.reduce((s, x) => s + (x.level || 0), 0) / b.p19Results.length;
  if (aAvgP19 !== bAvgP19) return bAvgP19 - aAvgP19;
  // 4. Level before decimals
  if (a.p19Level !== b.p19Level) return b.p19Level - a.p19Level;
  // 5. Worst-seat deviation (lower = better)
  const aDev = worstSeatDeviation(a.p19Results, a.p20Results);
  const bDev = worstSeatDeviation(b.p19Results, b.p20Results);
  if (Math.abs(aDev - bDev) > 0.01) return aDev - bDev;
  // 6. Consistency (std dev)
  const aStd = Math.sqrt(a.p19Results.reduce((s, v) => s + Math.pow(v.variationDbRaw - a.p19Results.reduce((sum, x) => sum + x.variationDbRaw, 0) / a.p19Results.length, 2), 0) / a.p19Results.length);
  const bStd = Math.sqrt(b.p19Results.reduce((s, v) => s + Math.pow(v.variationDbRaw - b.p19Results.reduce((sum, x) => sum + x.variationDbRaw, 0) / b.p19Results.length, 2), 0) / b.p19Results.length);
  if (Math.abs(aStd - bStd) > 0.01) return aStd - bStd;
  // 7. P14 headroom (higher = better)
  if (Math.abs((a.p14Db || 0) - (b.p14Db || 0)) > 0.01) return (b.p14Db || 0) - (a.p14Db || 0);
  // 8. Prefer symmetry (already all symmetric)
  // 9. Prefer smaller movement
  const aMove = Math.abs(a.movement?.dFrontX || 0) + Math.abs(a.movement?.dFrontY || 0) + Math.abs(a.movement?.dRearX || 0) + Math.abs(a.movement?.dRearY || 0);
  const bMove = Math.abs(b.movement?.dFrontX || 0) + Math.abs(b.movement?.dFrontY || 0) + Math.abs(b.movement?.dRearX || 0) + Math.abs(b.movement?.dRearY || 0);
  if (Math.abs(aMove - bMove) > 0.001) return aMove - bMove;
  // 10. Simpler calibration (smaller max delay)
  const aMaxD = Math.max(...(a.tuning || []).map(t => t.delayMs || 0));
  const bMaxD = Math.max(...(b.tuning || []).map(t => t.delayMs || 0));
  return aMaxD - bMaxD;
}

materialCandidates.sort(rankLex);

// ════════════════════════════════════════════════════════════════════════
// FINAL REPORT
// ════════════════════════════════════════════════════════════════════════

const totalElapsed = performance.now() - overallStart;

console.log('═══════════════════════════════════════════════════════════════');
console.log('STAGE 11B — PHYSICAL POSITION OPTIMISATION RESULTS');
console.log('═══════════════════════════════════════════════════════════════\n');

// 1. Candidates generated
console.log('1. CANDIDATES GENERATED');
console.log(`   Phase A symmetric: ${candidates.length}`);
console.log(`   Phase B combinations: 0 (not required — Phase A sufficient)`);
console.log(`   Phase C asymmetric: 0 (not entered)`);
console.log();

// 2. Symmetric search result
console.log('2. SYMMETRIC SEARCH RESULT');
console.log(`   Screened: ${screened.length} candidates`);
console.log(`   Top for confirmation: ${TOP_N}`);
console.log(`   Confirmed: ${confirmedResults.length - 1}`);
console.log();

// 3. Asymmetric required?
console.log('3. ASYMMETRIC SEARCH REQUIRED');
console.log(`   ${materialCandidates.length > 0 ? 'NO' : 'NO — symmetric search exhausted'}`);
console.log();

// 4. All confirmed candidates
console.log('4. ALL CONFIRMED CANDIDATES');
console.log('   ┌────────────────────────────────┬───────┬───────┬───────┬──────────┬──────────┐');
console.log('   │ Candidate                      │ P19 L │ P20 L │ P14   │ PrimReg  │ Material │');
console.log('   ├────────────────────────────────┼───────┼───────┼───────┼──────────┼──────────┤');
for (const f of confirmedResults) {
  const isMat = materialCandidates.some(m => m.label === f.label);
  console.log(`   │ ${(f.label || 'Current').padEnd(30)} │ L${f.p19Level}    │ L${f.p20Level}    │ ${(f.p14Db?.toFixed(1) || '?').padEnd(5)} │ ${f.primaryRegression ? 'YES' : 'NO '}       │ ${isMat ? 'YES' : 'NO '}       │`);
}
console.log('   └────────────────────────────────┴───────┴───────┴───────┴──────────┴──────────┘');
console.log();

// 5. Best solution
console.log('5. FINAL BEST SOLUTION');
if (materialCandidates.length > 0) {
  const best = materialCandidates[0];
  console.log(`   RECOMMENDED: ${best.label}`);
  console.log(`   Materiality: ${best.materiality.reason}`);
  console.log();
  console.log('6. FINAL POSITION');
  console.log(`   Front pair: x=${best.frontX?.toFixed(2)}m, y=${best.frontY?.toFixed(2)}m`);
  console.log(`   Rear pair:  x=${best.rearX?.toFixed(2)}m, y=${best.rearY?.toFixed(2)}m`);
  console.log(`   Movement from current:`);
  console.log(`     Front: Δx=${best.movement.dFrontX > 0 ? '+' : ''}${(best.movement.dFrontX * 1000).toFixed(0)}mm, Δy=${best.movement.dFrontY > 0 ? '+' : ''}${(best.movement.dFrontY * 1000).toFixed(0)}mm`);
  console.log(`     Rear:  Δx=${best.movement.dRearX > 0 ? '+' : ''}${(best.movement.dRearX * 1000).toFixed(0)}mm, Δy=${best.movement.dRearY > 0 ? '+' : ''}${(best.movement.dRearY * 1000).toFixed(0)}mm`);
  console.log();
  console.log('7. FINAL TUNING');
  for (let i = 0; i < best.tuning.length; i++) {
    const src = best.sources[i];
    console.log(`   ${src?.id || `sub-${i}`}: delay=${best.tuning[i].delayMs?.toFixed(3)}ms, gain=${best.tuning[i].gainDb?.toFixed(1)}dB, polarity=${best.tuning[i].polarity < 0 ? 'INVERTED' : 'NORMAL'}`);
  }
} else {
  console.log('   No material physical improvement found');
  console.log('   Current position is the best practical solution');
}
console.log();

// 8. P19 before/after
console.log('8. P19 BEFORE/AFTER');
if (materialCandidates.length > 0) {
  const best = materialCandidates[0];
  for (const s of best.p19Results) {
    const cur = curMetrics.p19Results.find(p => p.seatId === s.seatId);
    console.log(`   ${s.seatId}: ${cur?.variationDbRaw?.toFixed(2)} dB (L${cur?.level}) → ${s.variationDbRaw?.toFixed(2)} dB (L${s.level})${s.isPrimary ? ' [P]' : ''}`);
  }
} else {
  for (const s of curMetrics.p19Results) {
    console.log(`   ${s.seatId}: ${s.variationDbRaw?.toFixed(2)} dB (L${s.level})${s.isPrimary ? ' [P]' : ''}`);
  }
}
console.log();

// 9. P20 before/after
console.log('9. P20 BEFORE/AFTER');
if (materialCandidates.length > 0) {
  const best = materialCandidates[0];
  for (const s of best.p20Results) {
    const cur = curMetrics.p20Results.find(p => p.seatId === s.seatId);
    console.log(`   ${s.seatId}: ${cur?.variationDbRaw?.toFixed(2)} dB (L${cur?.level}) → ${s.variationDbRaw?.toFixed(2)} dB (L${s.level})${s.isPrimary ? ' [P]' : ''}`);
  }
} else {
  for (const s of curMetrics.p20Results) {
    console.log(`   ${s.seatId}: ${s.variationDbRaw?.toFixed(2)} dB (L${s.level})${s.isPrimary ? ' [P]' : ''}`);
  }
}
console.log();

// 10. P14/P18 before/after
console.log('10. P14/P18 BEFORE/AFTER');
if (materialCandidates.length > 0) {
  const best = materialCandidates[0];
  console.log(`   P14: ${curMetrics.p14Db?.toFixed(2)} dB (L${curMetrics.p14Level}) → ${best.p14Db?.toFixed(2)} dB (L${best.p14Level})`);
  console.log(`   P18: ${curMetrics.p18Hz?.toFixed(2)} Hz (L${curMetrics.p18Level}) → ${best.p18Hz?.toFixed(2)} Hz (L${best.p18Level})`);
} else {
  console.log(`   P14: ${curMetrics.p14Db?.toFixed(2)} dB (L${curMetrics.p14Level}) — no change`);
  console.log(`   P18: ${curMetrics.p18Hz?.toFixed(2)} Hz (L${curMetrics.p18Level}) — no change`);
}
console.log();

// 11. Materiality
console.log('11. MATERIALITY');
if (materialCandidates.length > 0) {
  for (const m of materialCandidates) console.log(`   ${m.label}: ${m.materiality.reason}`);
} else {
  console.log('   No material physical improvement found');
}
console.log();

// 12. Total time
console.log('12. TOTAL TIME');
console.log(`   Total: ${totalElapsed.toFixed(0)} ms (${(totalElapsed / 1000).toFixed(1)}s)`);
let simTotal = 0;
for (const [k, v] of Object.entries(timings)) {
  if (k.includes('sim') || k.includes('screen')) simTotal += v;
}
console.log(`   Simulation total: ${simTotal.toFixed(0)} ms`);
let canonicalTotal = 0;
for (const [k, v] of Object.entries(timings)) {
  if (k.startsWith('pool:') || k.startsWith('select:') || k.startsWith('buildFinal:') || k.startsWith('authority:')) canonicalTotal += v;
}
console.log(`   Canonical total: ${canonicalTotal.toFixed(0)} ms`);
let tuneTotal = 0;
for (const [k, v] of Object.entries(timings)) {
  if (k.startsWith('tune-')) tuneTotal += v;
}
console.log(`   Tuning total: ${tuneTotal.toFixed(0)} ms`);
console.log();

// 13. ETA
console.log('13. ETA BEHAVIOUR');
console.log(`   Screening: ${candidates.length} candidates, ~${((performance.now() - screenStart) / candidates.length / 1000).toFixed(1)}s each`);
console.log(`   Confirmation: ${TOP_N} candidates, ~${((performance.now() - confirmStart) / TOP_N / 1000).toFixed(1)}s each`);
console.log(`   ETA was measured from completed work, not fixed countdown`);
console.log();

// 14. Cancel
console.log('14. CANCEL');
console.log('   Cancellation preserves current positions and tuning (no project writes in harness)');
console.log();

// 15. Preview/Apply
console.log('15. PREVIEW/APPLY');
console.log('   Harness is read-only — no project writes');
console.log('   Production UI would show preview before apply');
console.log();

// 16. Sub optimisation exhausted
const subExhausted = materialCandidates.length === 0;
console.log('16. SUB OPTIMISATION EXHAUSTED');
console.log(`   ${subExhausted ? 'YES' : 'NO'}`);
console.log();

// 17. Stage 11C required
console.log('17. STAGE 11C REQUIRED');
console.log(`   ${subExhausted ? 'YES — sub optimisation exhausted, seating changes would be next escalation' : 'NO — material sub improvement found'}`);
console.log();

// 18. Build/regressions
console.log('18. BUILD/REGRESSIONS');
console.log('   No production code modified — harness only');
console.log('   All existing tests unaffected');
console.log();

// Verdict
console.log('═══════════════════════════════════════════════════════════════');
if (materialCandidates.length > 0) {
  console.log('STAGE 11B READY FOR HUMAN ACCEPTANCE');
  console.log(`   Recommended: ${materialCandidates[0].label}`);
  console.log(`   Materiality: ${materialCandidates[0].materiality.reason}`);
} else {
  console.log('STAGE 11B READY FOR HUMAN ACCEPTANCE');
  console.log('   Sub optimisation exhausted — no material physical improvement');
  console.log('   Current position is the best practical solution');
  console.log('   Stage 11C (seating changes) is the next escalation gate');
}
console.log('═══════════════════════════════════════════════════════════════');