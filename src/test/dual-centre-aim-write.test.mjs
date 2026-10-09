// ---------------------------------------------------------------------------
// TEST   Dual Mono Centre — "Aim at RSP" reaches the cabinets and rotates them
// WHAT   The aiming mode only changes the cabinets' aim preference; it changes
//        no id, role, model or position. The speakers-equality guards that
//        filter redundant writes therefore judged the change "the same
//        speakers" and DISCARDED it — so the selection never reached FCL/FCR,
//        the Plan View resolved 0° for both cabinets and neither icon rotated,
//        even though the angle calculation itself was correct.
// WHY    This test asserts the write actually lands and that the ONE aim
//        resolver then produces the rotation the Plan View draws from. It
//        deliberately tests the WRITE PATH, not just the arithmetic.
//        Acceptance items under test:
//          SELECT AIM AT RSP — BOTH CABINETS VISIBLY ROTATE (the write lands)
//          SELECT STRAIGHT AHEAD — BOTH RETURN TO ZERO TOE-IN
//          CENTRED RSP — EQUAL AND OPPOSITE ANGLES
//          MOVE RSP / MOVE FCL-FCR — BOTH ANGLES UPDATE
//          SAVE AND REOPEN — AIMING MODE AND GEOMETRY RESTORED
//          OTHER SPEAKERS / OTHER VIEWS — NO REGRESSION
//
// Drawing-consistency and data-plumbing test only: the single logical centre
// channel, the +4 dB allowance, the acoustic midpoint, SPL and RP22 are not
// touched anywhere in this fix.
// ---------------------------------------------------------------------------

import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { __b44SameSpeakers } from '@/components/utils/speakerEqualityUtils';
import {
  CENTRE_CABINET_AIM_OPTIONS,
  centreCabinetAimAtRsp,
  centreCabinetAimSignature,
  sameCentreCabinetAim,
  withCentreCabinetAim,
} from '@/components/utils/dualCentrePairAuthority';
import { resolveSpeakerYaw } from '@/components/utils/speakerAimResolver';

// ── Fixtures ───────────────────────────────────────────────────────────────
const ROOM_W = 4.5;
const RSP = { x: ROOM_W / 2, y: 3.4, z: 1.2 };
const LEFT_RSP = { x: 1.7, y: 3.4, z: 1.2 };

const cabinet = (role, x) => ({
  id: `${role}-1`,
  role,
  model: 'c-1',
  orientation: 'vertical',
  position: { x, y: 0.0505, z: 0.62 },
  rotation: { x: 0, y: 0, z: 0 },
  aimAtRsp: false,
});

const STRAIGHT = [cabinet('FCL', ROOM_W / 2 - 0.7), cabinet('FCR', ROOM_W / 2 + 0.7)];
const AIMED = withCentreCabinetAim(STRAIGHT, true);

/** SpeakerPlacement's write filter, reproduced exactly: a "same" update is dropped. */
const applyWriteFilter = (current, updater) => {
  const next = updater(current);
  const nextArr = Array.isArray(next) ? next : [];
  if (__b44SameSpeakers(nextArr, current)) return current;
  return nextArr;
};

const yawOf = (speakers, role, rsp = RSP) => resolveSpeakerYaw({
  speaker: speakers.find((s) => s.role === role),
  mlpPos: rsp,
  appState: {},
});

const read = (rel) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');
const pairAuthority = read('src/components/utils/dualCentrePairAuthority.js');
const appStateProvider = read('src/components/AppStateProvider.jsx');
const equalityUtils = read('src/components/utils/speakerEqualityUtils.jsx');

// ── 1. The fault: an aiming change is a speaker change ─────────────────────

test('TEST 1  An aiming-mode change is NOT the same speakers', () => {
  // This is the exact comparison the write filter made. Before the fix it
  // returned true, so the aiming update was thrown away.
  assert.equal(__b44SameSpeakers(AIMED, STRAIGHT), false);
  assert.equal(__b44SameSpeakers(STRAIGHT, AIMED), false);
  assert.equal(sameCentreCabinetAim(AIMED, STRAIGHT), false);
});

test('TEST 2  Select Aim at RSP — the write lands on both cabinets', () => {
  const stored = applyWriteFilter(STRAIGHT, (prev) => withCentreCabinetAim(prev, true));

  assert.equal(centreCabinetAimAtRsp(stored), true, 'the selection reached FCL/FCR');
  assert.deepEqual(stored.map((s) => [s.role, s.aimAtRsp]), [['FCL', true], ['FCR', true]]);

  // Aiming is a physical installation choice: it must not move the cabinets.
  stored.forEach((s, i) => assert.deepEqual(s.position, STRAIGHT[i].position));
});

test('TEST 3  Select Straight ahead — the second change lands as well', () => {
  const back = applyWriteFilter(AIMED, (prev) => withCentreCabinetAim(prev, false));

  assert.equal(centreCabinetAimAtRsp(back), false);
  assert.equal(centreCabinetAimSignature(back), centreCabinetAimSignature(STRAIGHT));
});

test('TEST 4  Re-selecting the same mode is a no-op (no extra writes, no loop)', () => {
  const again = applyWriteFilter(AIMED, (prev) => withCentreCabinetAim(prev, true));
  assert.equal(again, AIMED, 'an unchanged mode keeps the existing list by identity');

  assert.equal(__b44SameSpeakers(AIMED, AIMED.map((s) => ({ ...s }))), true);
});

// ── 2. No regression in the guard ─────────────────────────────────────────

test('TEST 5  The guard still catches real speaker changes', () => {
  const moved = AIMED.map((s) => (s.role === 'FCL'
    ? { ...s, position: { ...s.position, x: s.position.x - 0.2 } }
    : s));
  const remodelled = AIMED.map((s) => (s.role === 'FCR' ? { ...s, model: 'q4-3' } : s));

  assert.equal(__b44SameSpeakers(moved, AIMED), false, 'a moved cabinet is a change');
  assert.equal(__b44SameSpeakers(remodelled, AIMED), false, 'a changed model is a change');
  assert.equal(__b44SameSpeakers(AIMED.slice(1), AIMED), false, 'a removed cabinet is a change');
});

test('TEST 6  Designs with no centre cabinet are unaffected', () => {
  const standard = [
    { id: 'FL-1', role: 'FL', model: 'q4-3', position: { x: 1.2, y: 0.06, z: 1.2 } },
    { id: 'FC-1', role: 'FC', model: 'c-1', position: { x: 2.25, y: 0.06, z: 1.2 } },
    { id: 'SL-1', role: 'SL', model: 'q4-3', position: { x: 0.07, y: 3.0, z: 1.2 } },
  ];
  const sameCopy = standard.map((s) => ({ ...s }));

  assert.equal(centreCabinetAimSignature(standard), '', 'no cabinets — no aim signature');
  assert.equal(__b44SameSpeakers(sameCopy, standard), true);
  assert.equal(__b44SameSpeakers(
    standard.map((s) => (s.role === 'SL' ? { ...s, position: { ...s.position, y: 3.4 } } : s)),
    standard,
  ), false, 'the existing position comparison is unchanged');
  assert.equal(__b44SameSpeakers([], []), true);
});

// ── 3. The aim resolver then rotates both cabinets ────────────────────────

test('TEST 7  After the write lands, both cabinets aim at the RSP', () => {
  const stored = applyWriteFilter(STRAIGHT, (prev) => withCentreCabinetAim(prev, true));

  const fcl = yawOf(stored, 'FCL');
  const fcr = yawOf(stored, 'FCR');

  // Not zero: the icons the Plan View draws are rotated by this figure.
  assert.ok(Math.abs(fcl) > 1 && Math.abs(fcr) > 1, `both must aim (got ${fcl}, ${fcr})`);
  // Centred RSP — equal and opposite angles.
  assert.ok(Math.abs(Math.abs(fcl) - Math.abs(fcr)) < 1e-9);
  assert.ok(fcl * fcr < 0);
});

test('TEST 7b Each cabinet aims from its own coordinates', () => {
  const stored = applyWriteFilter(STRAIGHT, (prev) => withCentreCabinetAim(prev, true));
  const expected = (s) => -Math.atan2(RSP.x - s.position.x, RSP.y - s.position.y) * (180 / Math.PI);

  stored.forEach((s) => {
    assert.ok(Math.abs(yawOf(stored, s.role) - expected(s)) < 1e-9);
  });
});

test('TEST 7c Move the RSP — both angles update', () => {
  const stored = applyWriteFilter(STRAIGHT, (prev) => withCentreCabinetAim(prev, true));
  const centred = [yawOf(stored, 'FCL'), yawOf(stored, 'FCR')];
  const moved = [yawOf(stored, 'FCL', LEFT_RSP), yawOf(stored, 'FCR', LEFT_RSP)];

  assert.notEqual(moved[0], centred[0]);
  assert.notEqual(moved[1], centred[1]);
});

test('TEST 7d Move FCL/FCR — the rotation follows the new positions', () => {
  const stored = applyWriteFilter(STRAIGHT, (prev) => withCentreCabinetAim(prev, true));
  const before = [yawOf(stored, 'FCL'), yawOf(stored, 'FCR')];
  const moved = applyWriteFilter(stored, (prev) => prev.map((s) => (
    s.role === 'FCL' ? { ...s, position: { ...s.position, x: s.position.x - 0.3 } } : s
  )));

  assert.equal(centreCabinetAimAtRsp(moved), true, 'the mode survives a cabinet move');
  assert.notEqual(yawOf(moved, 'FCL'), before[0]);
  assert.equal(yawOf(moved, 'FCR'), before[1], 'the partner is resolved from its own centre');
});

test('TEST 7e Straight ahead is exactly zero toe-in', () => {
  const stored = applyWriteFilter(AIMED, (prev) => withCentreCabinetAim(prev, false));
  assert.equal(yawOf(stored, 'FCL'), 0);
  assert.equal(yawOf(stored, 'FCR'), 0);
  assert.deepEqual(CENTRE_CABINET_AIM_OPTIONS.map((o) => o.atRsp), [false, true]);
});

// ── 4. Both write gates consult the one authority ─────────────────────────

test('TEST 8  Both speakers-equality gates ask the pair authority', () => {
  // Gate 1 — the write filter in SpeakerPlacement (this is the one that dropped
  // the click; it uses __b44SameSpeakers).
  assert.ok(equalityUtils.includes('sameCentreCabinetAim(a, b)'), 'the write filter compares the aiming mode');
  // Gate 2 — the store provider's idempotence check.
  assert.ok(appStateProvider.includes('sameCentreCabinetAim(a, b)'), 'the store compares the aiming mode too');
  // One definition, in the pair's own authority.
  assert.ok(pairAuthority.includes('export function sameCentreCabinetAim'));
  assert.ok(pairAuthority.includes('export function centreCabinetAimSignature'));
});

test('TEST 8b No second aiming system was added', () => {
  // The rotation the drawings use is still resolved in ONE place.
  const resolver = read('src/components/utils/speakerAimResolver.jsx');
  assert.ok(resolver.includes('if (isCentreCabinetRole(canon))'), 'the cabinets resolve in the shared aim resolver');

  const rvAiming = read('src/components/room/rv/utils/rvAiming.jsx');
  assert.ok(!/FCL|FCR/.test(rvAiming), 'the plan view computes no cabinet angle of its own');

  const icon = read('src/components/room/rv/RenderPrimitives.jsx');
  assert.ok(icon.includes('rotate(${yawDeg || 0})'), 'the icon is drawn from the resolved yaw');
});

// ── 5. Save and reopen ────────────────────────────────────────────────────

test('TEST 9  Save and reopen — the aiming mode and geometry are restored', () => {
  const stored = applyWriteFilter(STRAIGHT, (prev) => withCentreCabinetAim(prev, true));

  // The flag is plain record data, carried by the existing spread-based
  // serialisation and hydration — nothing about it is derived at load time.
  const reloaded = JSON.parse(JSON.stringify(stored));
  assert.equal(centreCabinetAimAtRsp(reloaded), true);
  assert.deepEqual(reloaded.map((s) => [s.role, s.position, s.aimAtRsp]), stored.map((s) => [s.role, s.position, s.aimAtRsp]));
  assert.ok(Math.abs(yawOf(reloaded, 'FCL') - yawOf(stored, 'FCL')) < 1e-12);

  const serialize = read('src/components/utils/serializeProject.jsx');
  assert.ok(/selected_speakers: asArray\(placedSpeakers\)\.map\(\(spk\) => \{\s*[\s\S]*?\.\.\.spk/.test(serialize),
    'serialisation carries every speaker field');
  const hydrate = read('src/components/utils/hydrateProjectIntoAppState.jsx');
  assert.ok(hydrate.includes('...(spk.position || {})'), 'hydration rebuilds positions without picking fields');
});

test('TEST 10 Aiming changes nothing else about the cabinets', () => {
  const stored = applyWriteFilter(STRAIGHT, (prev) => withCentreCabinetAim(prev, true));

  stored.forEach((s, i) => {
    const before = STRAIGHT[i];
    const differing = Object.keys(s).filter((k) => s[k] !== before[k]);
    assert.deepEqual(differing, ['aimAtRsp'], 'only the aiming preference changes');
  });
});