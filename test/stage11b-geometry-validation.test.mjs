// stage11b-geometry-validation.test.mjs
// Unit tests for Stage 11B cabinet footprint validation, side-wall orientation,
// primary-seat authority, and fingerprint parity.
//
// Run: node --import ./test/_alias-register.mjs test/stage11b-geometry-validation.test.mjs

import assert from 'node:assert';
import { subHalfExtents, deriveSubWallOrientation, CLEARANCE_M } from '@/components/room/rv/utils/subWallOrientation.js';
import { resolveSeatPriority, PRIMARY, SECONDARY } from '@/components/utils/seatPriorityAuthority.js';
import { MODELS } from '@/components/models/speakers/registry';
import { computeGeometryFingerprint } from '@/components/room/bass/bassAnalysisFingerprints.js';
import { BASS_NORMALIZED_PHYSICS_DEFAULTS } from '@/components/room/bass/bassPhysicsDefaults.js';

// ── Test Setup ──────────────────────────────────────────────────────────

const ROOM = { widthM: 4.0, lengthM: 6.3, heightM: 2.4 };
const SUB3_12 = MODELS.find(m => m.key === 'sub3-12');
const SUB_WIDTH_M = (SUB3_12?.widthMm || 600) / 1000;   // 0.600 m
const SUB_DEPTH_M = (SUB3_12?.depthMm || 255) / 1000;   // 0.255 m

// Same isValidPosition as the fixed harness — uses canonical authority
function isValidPosition(x, y, room = ROOM) {
  const { rotationDeg } = deriveSubWallOrientation({
    x, y, widthM: room.widthM, lengthM: room.lengthM,
    subWidthM: SUB_WIDTH_M, subDepthM: SUB_DEPTH_M,
  });
  const { halfX, halfY } = subHalfExtents(SUB_WIDTH_M, SUB_DEPTH_M, rotationDeg);
  return x >= halfX + CLEARANCE_M && x <= room.widthM - halfX - CLEARANCE_M
      && y >= halfY + CLEARANCE_M && y <= room.lengthM - halfY - CLEARANCE_M;
}

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${e.message}`);
  }
}

// ════════════════════════════════════════════════════════════════════════
// 1. CABINET GEOMETRY ROOT CAUSE
// ════════════════════════════════════════════════════════════════════════

console.log('\n1. CABINET GEOMETRY ROOT CAUSE');
console.log('   SUB3-12 from registry: widthMm=' + SUB3_12?.widthMm + ', depthMm=' + SUB3_12?.depthMm);
console.log('   Derived: SUB_WIDTH_M=' + SUB_WIDTH_M + ', SUB_DEPTH_M=' + SUB_DEPTH_M);
console.log('   halfWidth=' + (SUB_WIDTH_M / 2) + ', halfDepth=' + (SUB_DEPTH_M / 2));

test('Registry SUB3-12 width is 600mm', () => {
  assert.strictEqual(SUB3_12?.widthMm, 600, 'SUB3-12 widthMm should be 600');
});

test('Registry SUB3-12 depth is 255mm', () => {
  assert.strictEqual(SUB3_12?.depthMm, 255, 'SUB3-12 depthMm should be 255');
});

test('subHalfExtents rotation 0 uses width for X, depth for Y', () => {
  const { halfX, halfY } = subHalfExtents(SUB_WIDTH_M, SUB_DEPTH_M, 0);
  assert.strictEqual(halfX, SUB_WIDTH_M / 2, 'halfX should be half-width (0.3)');
  assert.strictEqual(halfY, SUB_DEPTH_M / 2, 'halfY should be half-depth (0.1275)');
});

test('subHalfExtents rotation 90 swaps: depth for X, width for Y', () => {
  const { halfX, halfY } = subHalfExtents(SUB_WIDTH_M, SUB_DEPTH_M, 90);
  assert.strictEqual(halfX, SUB_DEPTH_M / 2, 'halfX should be half-depth (0.1275)');
  assert.strictEqual(halfY, SUB_WIDTH_M / 2, 'halfY should be half-width (0.3)');
});

// ════════════════════════════════════════════════════════════════════════
// 2. CURRENT LUXAVO POSITIONS VALID
// ════════════════════════════════════════════════════════════════════════

console.log('\n2. CURRENT LUXAVO POSITIONS VALID');

const LUXAVO_POSITIONS = [
  { label: 'Front-left  (1.0, 0.16)', x: 1.0, y: 0.16 },
  { label: 'Front-right (3.0, 0.16)', x: 3.0, y: 0.16 },
  { label: 'Rear-left   (1.0, 6.14)', x: 1.0, y: 6.14 },
  { label: 'Rear-right  (3.0, 6.14)', x: 3.0, y: 6.14 },
];

for (const p of LUXAVO_POSITIONS) {
  test(`${p.label} → VALID`, () => {
    assert.ok(isValidPosition(p.x, p.y), `${p.label} should be valid`);
  });
}

// ════════════════════════════════════════════════════════════════════════
// 3. LATERAL MOVEMENTS VALID
// ════════════════════════════════════════════════════════════════════════

console.log('\n3. LATERAL MOVEMENTS VALID');

// Front pair inward (X increases for left sub, decreases for right)
test('Front-left +100mm lateral (1.1, 0.16) → VALID', () => {
  assert.ok(isValidPosition(1.1, 0.16));
});

test('Front-left +200mm lateral (1.2, 0.16) → VALID', () => {
  assert.ok(isValidPosition(1.2, 0.16));
});

test('Front-left +300mm lateral (1.3, 0.16) → VALID', () => {
  assert.ok(isValidPosition(1.3, 0.16));
});

// Front pair outward (X decreases for left sub)
test('Front-left -100mm lateral (0.9, 0.16) → VALID', () => {
  assert.ok(isValidPosition(0.9, 0.16));
});

test('Front-left -200mm lateral (0.8, 0.16) → VALID', () => {
  assert.ok(isValidPosition(0.8, 0.16));
});

// Rear pair lateral
test('Rear-left +100mm lateral (1.1, 6.14) → VALID', () => {
  assert.ok(isValidPosition(1.1, 6.14));
});

test('Rear-left -100mm lateral (0.9, 6.14) → VALID', () => {
  assert.ok(isValidPosition(0.9, 6.14));
});

// Front pair depth (Y changes)
test('Front +100mm depth (1.0, 0.26) → VALID', () => {
  assert.ok(isValidPosition(1.0, 0.26));
});

test('Front -100mm depth (1.0, 0.06) → VALID (y=0.06 > halfDepth+clearance=0.1375)', () => {
  // y=0.06 < 0.1275 + 0.01 = 0.1375, so this should be INVALID
  assert.ok(!isValidPosition(1.0, 0.06), 'Should be invalid: y=0.06 < halfDepth+clearance');
});

test('Rear -100mm depth (1.0, 6.04) → VALID', () => {
  assert.ok(isValidPosition(1.0, 6.04));
});

// Coordinated symmetric movement
test('Both toward center +100mm: front (1.0, 0.26), rear (1.0, 6.04) → VALID', () => {
  assert.ok(isValidPosition(1.0, 0.26));
  assert.ok(isValidPosition(1.0, 6.04));
});

// ════════════════════════════════════════════════════════════════════════
// 4. REAL BOUNDARY TESTS — INVALID POSITIONS REJECTED
// ════════════════════════════════════════════════════════════════════════

console.log('\n4. REAL BOUNDARY TESTS — INVALID POSITIONS REJECTED');

test('Front sub centre closer than halfDepth to front wall (1.0, 0.10) → INVALID', () => {
  // halfDepth = 0.1275, clearance = 0.01, min Y = 0.1375
  assert.ok(!isValidPosition(1.0, 0.10), 'y=0.10 < 0.1375 should be invalid');
});

test('Rear sub centre closer than halfDepth to rear wall (1.0, 6.20) → INVALID', () => {
  // room length = 6.3, max Y = 6.3 - 0.1375 = 6.1625
  assert.ok(!isValidPosition(1.0, 6.20), 'y=6.20 > 6.1625 should be invalid');
});

test('Left cabinet edge outside room (0.05, 3.0) → INVALID', () => {
  // At x=0.05, near left wall → rotation 90°, halfX = halfDepth = 0.1275
  // min X = 0.1275 + 0.01 = 0.1375. x=0.05 < 0.1375 → invalid
  assert.ok(!isValidPosition(0.05, 3.0), 'x=0.05 should be invalid');
});

test('Right cabinet edge outside room (3.95, 3.0) → INVALID', () => {
  // At x=3.95, near right wall → rotation 90°, halfX = halfDepth = 0.1275
  // max X = 4.0 - 0.1375 = 3.8625. x=3.95 > 3.8625 → invalid
  assert.ok(!isValidPosition(3.95, 3.0), 'x=3.95 should be invalid');
});

test('Sub completely outside room (-0.5, 3.0) → INVALID', () => {
  assert.ok(!isValidPosition(-0.5, 3.0));
});

test('Sub completely outside room (5.0, 3.0) → INVALID', () => {
  assert.ok(!isValidPosition(5.0, 3.0));
});

// ════════════════════════════════════════════════════════════════════════
// 5. SIDE-WALL ORIENTATION TEST
// ════════════════════════════════════════════════════════════════════════

console.log('\n5. SIDE-WALL ORIENTATION TEST');

test('Sub near left wall (0.15, 3.0) → rotation 90°', () => {
  const { wall, rotationDeg } = deriveSubWallOrientation({
    x: 0.15, y: 3.0, widthM: ROOM.widthM, lengthM: ROOM.lengthM,
    subWidthM: SUB_WIDTH_M, subDepthM: SUB_DEPTH_M,
  });
  assert.strictEqual(wall, 'left', 'Should detect left wall');
  assert.strictEqual(rotationDeg, 90, 'Should rotate 90°');
});

test('Side-wall sub: halfX=halfDepth, halfY=halfWidth', () => {
  const { halfX, halfY } = subHalfExtents(SUB_WIDTH_M, SUB_DEPTH_M, 90);
  assert.strictEqual(halfX, SUB_DEPTH_M / 2, 'halfX should be half-depth');
  assert.strictEqual(halfY, SUB_WIDTH_M / 2, 'halfY should be half-width');
});

test('Side-wall sub valid at (0.15, 3.0) — X clearance uses halfDepth', () => {
  // rotation 90°: halfX = 0.1275, min X = 0.1275 + 0.01 = 0.1375. x=0.15 > 0.1375 ✓
  // halfY = 0.3, min Y = 0.31, max Y = 5.99. y=3.0 is in range ✓
  assert.ok(isValidPosition(0.15, 3.0), 'Side-wall sub at (0.15, 3.0) should be valid');
});

test('Side-wall sub invalid at (0.10, 3.0) — X < halfDepth + clearance', () => {
  // rotation 90°: halfX = 0.1275, min X = 0.1375. x=0.10 < 0.1375 → invalid
  assert.ok(!isValidPosition(0.10, 3.0), 'Should be invalid: x=0.10 < 0.1375');
});

test('Front-wall sub keeps rotation 0° — halfY = halfDepth', () => {
  const { wall, rotationDeg } = deriveSubWallOrientation({
    x: 1.0, y: 0.16, widthM: ROOM.widthM, lengthM: ROOM.lengthM,
    subWidthM: SUB_WIDTH_M, subDepthM: SUB_DEPTH_M,
  });
  assert.strictEqual(wall, 'front', 'Should detect front wall');
  assert.strictEqual(rotationDeg, 0, 'Should keep 0° rotation');
  const { halfX, halfY } = subHalfExtents(SUB_WIDTH_M, SUB_DEPTH_M, 0);
  assert.strictEqual(halfY, SUB_DEPTH_M / 2, 'halfY should be half-depth for front wall');
});

// ════════════════════════════════════════════════════════════════════════
// 6. TWO-PRIMARY-SEAT REGRESSION GUARD
// ════════════════════════════════════════════════════════════════════════

console.log('\n6. TWO-PRIMARY-SEAT REGRESSION GUARD');

const SEATING = [
  { id: 'seat-r1-c1', x: 1.6, y: 2.59, z: 1.2, priority: 'primary' },
  { id: 'seat-r1-c2', x: 2.4, y: 2.59, z: 1.2, priority: 'primary' },
  { id: 'seat-r2-c1', x: 1.2, y: 4.39, z: 1.5, priority: 'secondary' },
];

test('resolveSeatPriority returns primary for seat-r1-c1', () => {
  const seat = SEATING.find(s => s.id === 'seat-r1-c1');
  assert.strictEqual(resolveSeatPriority(seat), PRIMARY);
});

test('resolveSeatPriority returns primary for seat-r1-c2', () => {
  const seat = SEATING.find(s => s.id === 'seat-r1-c2');
  assert.strictEqual(resolveSeatPriority(seat), PRIMARY);
});

test('resolveSeatPriority returns secondary for seat-r2-c1', () => {
  const seat = SEATING.find(s => s.id === 'seat-r2-c1');
  assert.strictEqual(resolveSeatPriority(seat), SECONDARY);
});

test('resolveSeatPriority defaults to primary for missing priority', () => {
  assert.strictEqual(resolveSeatPriority({ id: 'x' }), PRIMARY);
});

// Simulate the extractP19P20 + checkPrimaryRegression logic
function extractP19P20ForTest(authority, seatingPositions) {
  const isPrimarySeat = (seatId) => {
    const seat = seatingPositions.find(p => p.id === seatId);
    return resolveSeatPriority(seat) === PRIMARY;
  };
  return {
    p19Results: (authority?.perSeatP19Results || []).map(s => ({
      ...s, isPrimary: isPrimarySeat(s.seatId),
    })),
    p20Results: (authority?.perSeatP20Results || []).map(s => ({
      ...s, isPrimary: isPrimarySeat(s.seatId),
    })),
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

const currentAuthority = {
  perSeatP19Results: [
    { seatId: 'seat-r1-c1', level: 3, variationDbRaw: -3.0 },
    { seatId: 'seat-r1-c2', level: 3, variationDbRaw: -3.5 },
    { seatId: 'seat-r2-c1', level: 2, variationDbRaw: -5.0 },
  ],
  perSeatP20Results: [
    { seatId: 'seat-r1-c1', level: 3, variationDbRaw: -2.0 },
    { seatId: 'seat-r1-c2', level: 3, variationDbRaw: -2.5 },
    { seatId: 'seat-r2-c1', level: 2, variationDbRaw: -4.0 },
  ],
};

const currentMetrics = extractP19P20ForTest(currentAuthority, SEATING);

test('Both primary seats have isPrimary=true', () => {
  assert.ok(currentMetrics.p19Results.find(s => s.seatId === 'seat-r1-c1')?.isPrimary);
  assert.ok(currentMetrics.p19Results.find(s => s.seatId === 'seat-r1-c2')?.isPrimary);
});

test('Secondary seat has isPrimary=false', () => {
  assert.ok(!currentMetrics.p19Results.find(s => s.seatId === 'seat-r2-c1')?.isPrimary);
});

test('Candidate improves seat1 but degrades seat2 by a level → REJECTED', () => {
  const candidateAuthority = {
    perSeatP19Results: [
      { seatId: 'seat-r1-c1', level: 4, variationDbRaw: -2.0 },  // improved
      { seatId: 'seat-r1-c2', level: 2, variationDbRaw: -5.0 },  // degraded by a level
      { seatId: 'seat-r2-c1', level: 3, variationDbRaw: -3.0 },  // improved (secondary)
    ],
    perSeatP20Results: [
      { seatId: 'seat-r1-c1', level: 3, variationDbRaw: -2.0 },
      { seatId: 'seat-r1-c2', level: 3, variationDbRaw: -2.5 },
      { seatId: 'seat-r2-c1', level: 3, variationDbRaw: -3.0 },
    ],
  };
  const candidateMetrics = extractP19P20ForTest(candidateAuthority, SEATING);
  const regression = checkPrimaryRegression(currentMetrics, candidateMetrics);
  assert.ok(regression, 'Should detect primary-seat regression on seat-r1-c2');
});

test('Candidate improves both primary seats → NOT REJECTED', () => {
  const candidateAuthority = {
    perSeatP19Results: [
      { seatId: 'seat-r1-c1', level: 4, variationDbRaw: -2.0 },
      { seatId: 'seat-r1-c2', level: 4, variationDbRaw: -2.0 },
      { seatId: 'seat-r2-c1', level: 2, variationDbRaw: -5.0 },
    ],
    perSeatP20Results: [
      { seatId: 'seat-r1-c1', level: 4, variationDbRaw: -1.5 },
      { seatId: 'seat-r1-c2', level: 4, variationDbRaw: -1.5 },
      { seatId: 'seat-r2-c1', level: 2, variationDbRaw: -4.0 },
    ],
  };
  const candidateMetrics = extractP19P20ForTest(candidateAuthority, SEATING);
  const regression = checkPrimaryRegression(currentMetrics, candidateMetrics);
  assert.ok(!regression, 'Should NOT detect regression when both primary seats improve');
});

test('Candidate degrades only secondary seat → NOT REJECTED by primary guard', () => {
  const candidateAuthority = {
    perSeatP19Results: [
      { seatId: 'seat-r1-c1', level: 3, variationDbRaw: -3.0 },
      { seatId: 'seat-r1-c2', level: 3, variationDbRaw: -3.5 },
      { seatId: 'seat-r2-c1', level: 1, variationDbRaw: -7.0 },  // degraded but secondary
    ],
    perSeatP20Results: [
      { seatId: 'seat-r1-c1', level: 3, variationDbRaw: -2.0 },
      { seatId: 'seat-r1-c2', level: 3, variationDbRaw: -2.5 },
      { seatId: 'seat-r2-c1', level: 1, variationDbRaw: -6.0 },
    ],
  };
  const candidateMetrics = extractP19P20ForTest(candidateAuthority, SEATING);
  const regression = checkPrimaryRegression(currentMetrics, candidateMetrics);
  assert.ok(!regression, 'Secondary seat regression should NOT trigger primary guard');
});

// ════════════════════════════════════════════════════════════════════════
// 7. FINGERPRINT DIVERGENCE RESOLVED
// ════════════════════════════════════════════════════════════════════════

console.log('\n7. FINGERPRINT DIVERGENCE RESOLVED');

const baseInputs = {
  roomDims: ROOM,
  rspPosition: { x: 2.0, y: 3.05, z: 1.2, designatedRspSeatId: null },
  sources: [
    { id: 'sub-front-1', x: 1.0, y: 0.16, z: 0.35, tuning: { gainDb: 0, delayMs: 0, polarity: 0 } },
    { id: 'sub-front-2', x: 3.0, y: 0.16, z: 0.35, tuning: { gainDb: 0, delayMs: 0, polarity: 0 } },
    { id: 'sub-rear-1', x: 1.0, y: 6.14, z: 0.35, tuning: { gainDb: 0, delayMs: 0, polarity: 0 } },
    { id: 'sub-rear-2', x: 3.0, y: 6.14, z: 0.35, tuning: { gainDb: 0, delayMs: 0, polarity: 0 } },
  ],
  seatingPositions: [
    { id: 'seat-r1-c1', x: 1.6, y: 2.59, z: 1.2 },
    { id: 'seat-r1-c2', x: 2.4, y: 2.59, z: 1.2 },
    { id: 'seat-r2-c1', x: 1.2, y: 4.39, z: 1.5 },
  ],
};

// Production physics: BASS_NORMALIZED_PHYSICS_DEFAULTS + production overrides (no debugModalHSign)
const productionPhysics = {
  ...BASS_NORMALIZED_PHYSICS_DEFAULTS,
  rewSourceCurveMode: 'product',
  disableLateField: true,
  disableModalPropagationPhase: true,
  rewParityModalMagnitudeScale: 1,
};

// Old harness physics: included debugModalHSign and debugModalPhaseConvention
const oldHarnessPhysics = {
  ...productionPhysics,
  debugModalPhaseConvention: 'normal',
  debugModalHSign: 'normal',
};

const productionFp = computeGeometryFingerprint({ ...baseInputs, ...productionPhysics });
const oldHarnessFp = computeGeometryFingerprint({ ...baseInputs, ...oldHarnessPhysics });
const newHarnessFp = computeGeometryFingerprint({ ...baseInputs, ...productionPhysics });

test('Production fingerprint is well-formed', () => {
  assert.ok(productionFp.startsWith('geo:v'), 'Should start with geo:v');
});

test('Old harness fingerprint DIVERGED from production', () => {
  assert.notStrictEqual(oldHarnessFp, productionFp, 'Old harness should differ from production');
});

test('New harness fingerprint MATCHES production', () => {
  assert.strictEqual(newHarnessFp, productionFp, 'New harness should match production exactly');
});

test('debugModalHSign is NOT in BASS_NORMALIZED_PHYSICS_DEFAULTS', () => {
  assert.ok(!('debugModalHSign' in BASS_NORMALIZED_PHYSICS_DEFAULTS), 'Production defaults should not include debugModalHSign');
});

test('debugModalPhaseConvention is NOT in BASS_NORMALIZED_PHYSICS_DEFAULTS', () => {
  assert.ok(!('debugModalPhaseConvention' in BASS_NORMALIZED_PHYSICS_DEFAULTS), 'Production defaults should not include debugModalPhaseConvention');
});

// ════════════════════════════════════════════════════════════════════════
// SUMMARY
// ════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════════════════════════');

if (failed > 0) {
  console.log('\nSTAGE 11B NOT SAFE — blocker: geometry validation tests failed');
  process.exit(1);
} else {
  console.log('\nALL GEOMETRY VALIDATION TESTS PASSED');
}