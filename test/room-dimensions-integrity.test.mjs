// test/room-dimensions-integrity.test.mjs
//
// Validates the room dimensions integrity authority that prevents established
// projects with missing/invalid saved dimensions from silently loading
// generic defaults and producing misleading RP22 calculations.

import {
  resolveRoomDimsIntegrity,
  roomDimsIntegrityBlocksCalculation,
  roomDimsIntegrityMessage,
  ROOM_DIMS_INTEGRITY,
} from '../src/components/utils/roomDimensionsIntegrity.js';

const results = [];

function test(name, fn) {
  try {
    fn();
    results.push({ name, pass: true });
  } catch (e) {
    results.push({ name, pass: false, error: e.message });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message || ''} expected ${expected}, got ${actual}`);
}

// ── 1. Genuinely new project (no id) — defaults are valid ──
test('new project without id returns VALID', () => {
  const r = resolveRoomDimsIntegrity({ roomDims: null, room_width: null, room_length: null, room_height: null });
  assertEqual(r.status, ROOM_DIMS_INTEGRITY.VALID, 'new project should be VALID');
  assert(!roomDimsIntegrityBlocksCalculation(r), 'new project should not block');
});

// ── 2. Established project with valid dimensions ──
test('established project with valid dimensions returns VALID', () => {
  const r = resolveRoomDimsIntegrity({
    id: 'proj-1',
    roomDims: JSON.stringify({ widthM: 5.58, lengthM: 4.30, heightM: 3.30 }),
  });
  assertEqual(r.status, ROOM_DIMS_INTEGRITY.VALID);
  assert(!roomDimsIntegrityBlocksCalculation(r), 'valid dims should not block');
  assertEqual(r.missingFields.length, 0);
});

test('established project with valid legacy flat fields returns VALID', () => {
  const r = resolveRoomDimsIntegrity({
    id: 'proj-2',
    room_width: 4.5,
    room_length: 6.0,
    room_height: 2.4,
  });
  assertEqual(r.status, ROOM_DIMS_INTEGRITY.VALID);
  assert(!roomDimsIntegrityBlocksCalculation(r));
});

// ── 3. Established project missing one or more dimensions ──
test('established project missing all dimensions returns MISSING', () => {
  const r = resolveRoomDimsIntegrity({
    id: 'proj-3',
    roomDims: null,
    room_width: null,
    room_length: null,
    room_height: null,
  });
  assertEqual(r.status, ROOM_DIMS_INTEGRITY.MISSING);
  assert(roomDimsIntegrityBlocksCalculation(r), 'missing dims should block');
  assertEqual(r.missingFields.length, 3, 'should have 3 missing fields');
});

test('established project missing height only returns MISSING with height', () => {
  const r = resolveRoomDimsIntegrity({
    id: 'proj-4',
    roomDims: JSON.stringify({ widthM: 5.0, lengthM: 6.0 }),
    room_height: null,
  });
  assertEqual(r.status, ROOM_DIMS_INTEGRITY.MISSING);
  assert(roomDimsIntegrityBlocksCalculation(r));
  assert(r.missingFields.includes('height'), 'should include height');
  assertEqual(r.missingFields.length, 1);
});

// ── 4. Project with zero or invalid room height ──
test('established project with zero height returns MISSING', () => {
  const r = resolveRoomDimsIntegrity({
    id: 'proj-5',
    room_width: 4.5,
    room_length: 6.0,
    room_height: 0,
  });
  assertEqual(r.status, ROOM_DIMS_INTEGRITY.MISSING);
  assert(roomDimsIntegrityBlocksCalculation(r));
  assert(r.missingFields.includes('height'));
});

test('established project with negative height returns INVALID', () => {
  const r = resolveRoomDimsIntegrity({
    id: 'proj-6',
    room_width: 4.5,
    room_length: 6.0,
    room_height: -1,
  });
  assertEqual(r.status, ROOM_DIMS_INTEGRITY.INVALID);
  assert(roomDimsIntegrityBlocksCalculation(r));
  assert(r.missingFields.includes('height'));
});

test('established project with non-numeric height returns MISSING', () => {
  const r = resolveRoomDimsIntegrity({
    id: 'proj-7',
    room_width: 4.5,
    room_length: 6.0,
    room_height: 'abc',
  });
  assertEqual(r.status, ROOM_DIMS_INTEGRITY.MISSING);
  assert(roomDimsIntegrityBlocksCalculation(r));
});

// ── 5. Message helper ──
test('roomDimsIntegrityMessage returns null for valid', () => {
  const r = { status: ROOM_DIMS_INTEGRITY.VALID, missingFields: [] };
  assertEqual(roomDimsIntegrityMessage(r), null);
});

test('roomDimsIntegrityMessage returns message for missing', () => {
  const r = { status: ROOM_DIMS_INTEGRITY.MISSING, missingFields: ['width', 'height'] };
  const msg = roomDimsIntegrityMessage(r);
  assert(msg != null, 'message should not be null');
  assert(msg.includes('Width'), 'should mention Width');
  assert(msg.includes('Height'), 'should mention Height');
});

test('roomDimsIntegrityMessage returns message for invalid', () => {
  const r = { status: ROOM_DIMS_INTEGRITY.INVALID, missingFields: ['height'] };
  const msg = roomDimsIntegrityMessage(r);
  assert(msg != null);
  assert(msg.includes('invalid'), 'should say invalid');
  assert(msg.includes('Height'));
});

// ── 6. Null/undefined input ──
test('null input returns VALID (new project)', () => {
  const r = resolveRoomDimsIntegrity(null);
  assertEqual(r.status, ROOM_DIMS_INTEGRITY.VALID);
  assert(!roomDimsIntegrityBlocksCalculation(r));
});

test('undefined input returns VALID', () => {
  const r = resolveRoomDimsIntegrity(undefined);
  assertEqual(r.status, ROOM_DIMS_INTEGRITY.VALID);
});

// ── 7. roomDimsIntegrityBlocksCalculation edge cases ──
test('blocksCalculation returns false for null/undefined integrity', () => {
  assert(!roomDimsIntegrityBlocksCalculation(null));
  assert(!roomDimsIntegrityBlocksCalculation(undefined));
});

test('blocksCalculation returns false for valid', () => {
  assert(!roomDimsIntegrityBlocksCalculation({ status: 'valid', missingFields: [] }));
});

// ── Report ──
const passed = results.filter(r => r.pass).length;
const failed = results.filter(r => !r.pass).length;
console.log(`\n${passed}/${results.length} tests passed, ${failed} failed`);
for (const r of results) {
  if (!r.pass) {
    console.log(`  FAIL: ${r.name} — ${r.error}`);
  }
}
if (failed > 0) process.exit(1);