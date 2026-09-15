// symmetric-room-validation.mjs
//
// Validates P19/P20 symmetry for a symmetric room by running the actual
// authoritative bass response engine. Mirrored left/right seats must
// produce identical or near-identical raw curves, which guarantees
// identical post-EQ P19/P20 (same EQ applied to all seats).
//
// Also validates the bass fingerprint changes when geometry changes.
//
// Run with: node --import ./test/_alias-register.mjs test/symmetric-room-validation.mjs

import { simulateAuthoritativeBassResponse } from '@/components/room/bass/authoritativeBassResponseEngine';
import { computeGeometryFingerprint } from '@/components/room/bass/bassAnalysisFingerprints';
import { normaliseModelKey } from '@/components/models/speakers/registry';
import { BASS_NORMALIZED_PHYSICS_DEFAULTS } from '@/components/room/bass/bassPhysicsDefaults';
import { deriveCentreZ } from '@/components/utils/subwooferInstanceMigration';
import {
  computeOfficialPerSeatP19Assessment,
  computeOfficialP20Assessment,
} from '@/components/utils/bassAuthoritativeAssessment';

// ── Symmetric room configuration ──────────────────────────────────────────

const ROOM_DIMS = { widthM: 5.0, lengthM: 7.0, heightM: 2.4 };
const SUB_MODEL = 'sub4-12';
const SUB_BOTTOM_HEIGHT_M = 0.05;
const modelKey = normaliseModelKey(SUB_MODEL);
const centreZ = deriveCentreZ({ bottomHeightM: SUB_BOTTOM_HEIGHT_M, model: modelKey });

// Three seats: left (x=1.5), centre (x=2.5), right (x=3.5) — all at y=4.0
const SEATING_POSITIONS = [
  { id: 'R1S1', x: 1.5, y: 4.0, z: 1.2, priority: 'primary' },
  { id: 'R1S2', x: 2.5, y: 4.0, z: 1.2, priority: 'primary' },
  { id: 'R1S3', x: 3.5, y: 4.0, z: 1.2, priority: 'primary' },
];

// RSP at centre seat
const RSP_POSITION = { id: 'rsp', x: 2.5, y: 4.0, z: 1.2, __isSyntheticRsp: true };

// Two subs: left (x=1.0) and right (x=4.0) — mirrored, both at y=0.5 (front)
const SOURCES = [
  {
    id: 'sub-L',
    modelKey,
    subwooferAmplifierPowerW: 1000,
    x: 1.0,
    y: 0.5,
    z: centreZ,
    tuning: { gainDb: 0, delayMs: 0, polarity: 0 },
    rotationDeg: 0,
  },
  {
    id: 'sub-R',
    modelKey,
    subwooferAmplifierPowerW: 1000,
    x: 4.0,
    y: 0.5,
    z: centreZ,
    tuning: { gainDb: 0, delayMs: 0, polarity: 0 },
    rotationDeg: 0,
  },
];

const PHYSICS = {
  ...BASS_NORMALIZED_PHYSICS_DEFAULTS,
  rewSourceCurveMode: 'product',
  disableLateField: true,
  disableModalPropagationPhase: true,
};

// ── Helper: build fingerprint inputs ──────────────────────────────────────

function buildFingerprintInputs(seats, sources, rsp) {
  return {
    roomDims: ROOM_DIMS,
    seatingPositions: seats,
    rspPosition: rsp,
    sources,
    surfaceAbsorption: PHYSICS.surfaceAbsorption,
    roomDamping: PHYSICS.roomDamping,
    axialQ: PHYSICS.axialQ,
  };
}

// ── Helper: convert { freqsHz, splDb } to [{ frequency, spl }] ───────────

function toPointCurve(resp) {
  if (!resp || !Array.isArray(resp.freqsHz)) return [];
  const splDb = Array.isArray(resp.splDb) ? resp.splDb : Array.from(resp.splDb || []);
  if (!splDb.length) return [];
  return resp.freqsHz.map((f, i) => ({ frequency: f, spl: splDb[i] }));
}

// ── Helper: compare two point curves point-by-point ──────────────────────

function maxCurveDelta(curveA, curveB) {
  if (!Array.isArray(curveA) || !Array.isArray(curveB)) return { maxDelta: Infinity, worstFreq: null };
  const len = Math.min(curveA.length, curveB.length);
  let maxDelta = 0;
  let worstFreq = null;
  for (let i = 0; i < len; i++) {
    const a = Number(curveA[i]?.spl);
    const b = Number(curveB[i]?.spl);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const delta = Math.abs(a - b);
    if (delta > maxDelta) {
      maxDelta = delta;
      worstFreq = curveA[i]?.frequency;
    }
  }
  return { maxDelta, worstFreq };
}

// ── Run the bass engine ───────────────────────────────────────────────────

const bassInputs = {
  roomDims: ROOM_DIMS,
  seatingPositions: SEATING_POSITIONS,
  rspPosition: RSP_POSITION,
  sources: SOURCES,
  physics: PHYSICS,
  qStrategyOverride: 'ab_corrected',
  capturePerSourcePerSeat: false,
};

const result = simulateAuthoritativeBassResponse(bassInputs);

// ── Report seat responses ─────────────────────────────────────────────────

const seatResponses = result?.seatResponses || {};
const seatIds = Object.keys(seatResponses).filter((id) => id !== 'rsp');

console.log('=== SYMMETRIC ROOM BASS VALIDATION ===\n');
console.log('Room:', ROOM_DIMS.widthM, 'x', ROOM_DIMS.lengthM, 'x', ROOM_DIMS.heightM, 'm');
console.log('Subs:', SOURCES.map(s => `${s.id}(${s.x},${s.y})`).join(', '));
console.log('Seats:', SEATING_POSITIONS.map(s => `${s.id}(${s.x},${s.y})`).join(', '));
console.log('RSP:', `(${RSP_POSITION.x},${RSP_POSITION.y})\n`);

console.log('--- Per-seat raw response curves ---');
const pointCurves = {};
for (const seatId of seatIds) {
  pointCurves[seatId] = toPointCurve(seatResponses[seatId]);
  const curve = pointCurves[seatId];
  const len = curve.length;
  const sample = len > 0 ? curve[Math.floor(len / 2)] : null;
  console.log(`  ${seatId}: ${len} points, mid=${sample ? `${sample.frequency.toFixed(1)}Hz=${sample.spl?.toFixed(2)}dB` : 'N/A'}`);
}

// ── Compare mirrored seats: R1S1 (x=1.5) vs R1S3 (x=3.5) ──────────────────

const leftCurve = pointCurves['R1S1'];
const rightCurve = pointCurves['R1S3'];
const centreCurve = pointCurves['R1S2'];

console.log('\n--- Mirrored seat comparison: R1S1 (x=1.5) vs R1S3 (x=3.5) ---');
if (leftCurve && rightCurve) {
  const { maxDelta, worstFreq } = maxCurveDelta(leftCurve, rightCurve);
  console.log(`  Max point-by-point delta: ${maxDelta.toFixed(6)} dB at ${worstFreq}Hz`);
  console.log(`  Symmetry: ${maxDelta < 0.001 ? 'EXACT (symmetric)' : maxDelta < 0.1 ? 'NEAR-IDENTICAL (within FP noise)' : 'ASYMMETRIC'}`);
} else {
  console.log('  ERROR: Missing raw curves for mirrored seats');
}

// ── Compute P19/P20 from raw curves (proxy — no post-EQ) ──────────────────
// P19 = span of each seat's curve; P20 = max deviation from RSP.
// Raw curves don't have post-EQ, but symmetry is preserved.

console.log('\n--- P19/P20 proxy from raw curves ---');
const perSeatPostEqCurves = seatIds.map((seatId) => ({
  seatId,
  responseData: pointCurves[seatId],
}));

const p19Results = computeOfficialPerSeatP19Assessment({
  perSeatPostEqCurves,
  assessmentStartHz: 20,
  assessmentEndHz: 120,
});

const rspCurve = toPointCurve(seatResponses['rsp']);
const p20Result = computeOfficialP20Assessment({
  rspPostEqCurve: rspCurve.length > 0 ? rspCurve : centreCurve,
  perSeatPostEqCurves,
  assessmentStartHz: 20,
  assessmentEndHz: 120,
});

console.log('\nPer-seat P19 (raw proxy):');
for (const r of p19Results) {
  console.log(`  ${r.seatId}: variationDbRaw=${r.variationDbRaw?.toFixed(4)} dB, level=${r.level}`);
}

console.log('\nPer-seat P20 (raw proxy):');
if (p20Result?.perSeatResults) {
  for (const r of p20Result.perSeatResults) {
    console.log(`  ${r.seatId}: variationDbRaw=${r.variationDbRaw?.toFixed(4)} dB, level=${r.level}`);
  }
}

// ── Check P19/P20 symmetry ────────────────────────────────────────────────

const p19Left = p19Results.find((r) => r.seatId === 'R1S1');
const p19Right = p19Results.find((r) => r.seatId === 'R1S3');
const p20Left = p20Result?.perSeatResults?.find((r) => r.seatId === 'R1S1');
const p20Right = p20Result?.perSeatResults?.find((r) => r.seatId === 'R1S3');

console.log('\n--- P19/P20 symmetry check ---');
if (p19Left && p19Right) {
  const delta = Math.abs(p19Left.variationDbRaw - p19Right.variationDbRaw);
  console.log(`  P19: R1S1=${p19Left.variationDbRaw?.toFixed(4)}, R1S3=${p19Right.variationDbRaw?.toFixed(4)}, delta=${delta.toFixed(6)}`);
  console.log(`  P19 grades match: ${p19Left.level === p19Right.level ? 'YES' : 'NO'}`);
}
if (p20Left && p20Right) {
  const delta = Math.abs(p20Left.variationDbRaw - p20Right.variationDbRaw);
  console.log(`  P20: R1S1=${p20Left.variationDbRaw?.toFixed(4)}, R1S3=${p20Right.variationDbRaw?.toFixed(4)}, delta=${delta.toFixed(6)}`);
  console.log(`  P20 grades match: ${p20Left.level === p20Right.level ? 'YES' : 'NO'}`);
}

// ── Fingerprint validation ────────────────────────────────────────────────

console.log('\n--- Fingerprint validation ---');

const fpInputsBase = buildFingerprintInputs(SEATING_POSITIONS, SOURCES, RSP_POSITION);
const fpBase = computeGeometryFingerprint(fpInputsBase);
console.log(`  Base fingerprint: ${fpBase}`);

// Move one seat by 0.1m
const seatsMoved = SEATING_POSITIONS.map((s) =>
  s.id === 'R1S1' ? { ...s, x: s.x + 0.1 } : s
);
const fpSeatMoved = computeGeometryFingerprint(buildFingerprintInputs(seatsMoved, SOURCES, RSP_POSITION));
console.log(`  After moving R1S1 by 0.1m: ${fpSeatMoved}`);
console.log(`  Fingerprint changed: ${fpBase !== fpSeatMoved ? 'YES' : 'NO'}`);

// Rotate one subwoofer by 90°
const sourcesRotated = SOURCES.map((s) =>
  s.id === 'sub-L' ? { ...s, rotationDeg: 90 } : s
);
const fpSubRotated = computeGeometryFingerprint(buildFingerprintInputs(SEATING_POSITIONS, sourcesRotated, RSP_POSITION));
console.log(`  After rotating sub-L by 90°: ${fpSubRotated}`);
console.log(`  Fingerprint changed: ${fpBase !== fpSubRotated ? 'YES' : 'NO'}`);

// ── Summary ───────────────────────────────────────────────────────────────

console.log('\n=== SUMMARY ===');
let allPass = true;

if (leftCurve && rightCurve) {
  const { maxDelta } = maxCurveDelta(leftCurve, rightCurve);
  const symmetric = maxDelta < 0.01;
  console.log(`Mirrored raw curves symmetric: ${symmetric ? 'PASS' : 'FAIL'} (maxDelta=${maxDelta.toFixed(6)} dB)`);
  if (!symmetric) allPass = false;
}

if (p19Left && p19Right) {
  const gradesMatch = p19Left.level === p19Right.level;
  console.log(`P19 grades match for mirrored seats: ${gradesMatch ? 'PASS' : 'FAIL'}`);
  if (!gradesMatch) allPass = false;
}

if (p20Left && p20Right) {
  const gradesMatch = p20Left.level === p20Right.level;
  console.log(`P20 grades match for mirrored seats: ${gradesMatch ? 'PASS' : 'FAIL'}`);
  if (!gradesMatch) allPass = false;
}

console.log(`Fingerprint changes on seat move: ${fpBase !== fpSeatMoved ? 'PASS' : 'FAIL'}`);
if (fpBase === fpSeatMoved) allPass = false;

console.log(`Fingerprint changes on sub rotation: ${fpBase !== fpSubRotated ? 'PASS' : 'FAIL'}`);
if (fpBase === fpSubRotated) allPass = false;

console.log(`\nOVERALL: ${allPass ? 'ALL PASS' : 'FAILURES DETECTED'}`);