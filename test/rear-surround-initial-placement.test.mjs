// ---------------------------------------------------------------------------
// TEST   Rear-left surround initial placement
// WHAT   SBL must be classified as a REAR-LEFT speaker and SBR as REAR-RIGHT,
//        so initial placement generates two distinct, mirrored rear-wall
//        positions. An automatic rear pair that overlaps (or is on the wrong
//        side) is reported invalid so the placement pass cannot be skipped, and
//        a hand-positioned pair is never reported invalid.
// WHY    resolveInitialWallPosition classified left speakers with a literal
//        list (`canon === "LW" || canon.startsWith("SL")`), which does not
//        recognise SBL. SBL therefore took the RIGHT-hand seed X — the same
//        coordinate as SBR — and the two speakers installed exactly on top of
//        one another. The rear branch of the wall authority keeps the seed X,
//        so the seed itself carried the defect into the stored design.
// ---------------------------------------------------------------------------

import { test } from 'vitest';
import assert from 'node:assert/strict';

import {
  resolveInitialWallPosition,
  hasInvalidAutomaticRearPair,
} from '@/components/room/placement/initialSpeakerPlacement';
import { resolveWallHugTarget } from '@/components/room/placement/wallHugAuthority';
import { getCanonicalRole, canonicalSide, isLeftRole } from '@/components/utils/surroundRoleMap';

const ROOM = { widthM: 4.5, lengthM: 6.0, heightM: 2.8 };
const RSP = { x: 2.25, y: 3.4 };
const SEATS = [{ id: 's1', x: 2.25, y: 3.4, z: 1.1, rowEarHeight: 1.1 }];
const AIM_OFF = {
  aimFrontWidesAtMLP: false,
  aimSideSurroundsAtMLP: false,
  aimRearSurroundsAtMLP: false,
};
const DIMS = { widthM: 0.20, depthM: 0.09, heightM: 0.20 };
const getModelDimsM = () => ({ ...DIMS });
const MODEL = 'evolve-2-1';

const place = (role, existingPosition = null) => resolveInitialWallPosition({
  role,
  model: MODEL,
  roomDims: ROOM,
  rsp: RSP,
  aimState: AIM_OFF,
  seatingPositions: SEATS,
  enableFrontWides: true,
  placedSpeakers: [],
  existingPosition,
  getModelDimsM,
});

// ── 1. The canonical side authority recognises every rear role ──────────────

test('the canonical side authority classifies rear roles from their canonical form', () => {
  assert.equal(canonicalSide('SBL'), 'L');
  assert.equal(canonicalSide('SBR'), 'R');
  // Aliases resolve through the canonical role, not a second list of names.
  assert.equal(canonicalSide('RL'), 'L');
  assert.equal(canonicalSide('RSL'), 'L');
  assert.equal(canonicalSide('RR'), 'R');
  assert.equal(canonicalSide('sl'), 'L');
  assert.equal(canonicalSide('sr'), 'R');
  assert.equal(canonicalSide('FC'), null, 'centre roles have no side');
  assert.equal(isLeftRole('SBL'), true);
  assert.equal(isLeftRole('SBR'), false);
  assert.equal(getCanonicalRole('RL'), 'SBL', 'the alias maps to the canonical role');
});

// ── 2. Initial placement generates a distinct, mirrored rear pair ───────────

test('SBL is seeded on the rear-left, not at SBR\'s coordinate', () => {
  const sbl = place('SBL');
  const sbr = place('SBR');

  assert.ok(Number.isFinite(sbl.x) && Number.isFinite(sbr.x));
  assert.ok(sbl.x < ROOM.widthM / 2, `SBL on the left half (x=${sbl.x})`);
  assert.ok(sbr.x > ROOM.widthM / 2, `SBR on the right half (x=${sbr.x})`);

  // The defect: both speakers received the same coordinate.
  assert.notEqual(sbl.x, sbr.x, 'the pair is not overlapping');

  // Mirrored about the room centre line.
  assert.ok(
    Math.abs((sbl.x + sbr.x) - ROOM.widthM) < 1e-9,
    `mirrored about the centreline (${sbl.x} + ${sbr.x})`,
  );
});

test('both rear speakers sit on the rear wall at the same distance', () => {
  const sbl = place('SBL');
  const sbr = place('SBR');
  const expectedY = ROOM.lengthM - (DIMS.depthM / 2 + 0.01);

  assert.ok(Math.abs(sbl.y - expectedY) < 1e-9, `SBL rear-wall y (${sbl.y})`);
  assert.ok(Math.abs(sbr.y - expectedY) < 1e-9, `SBR rear-wall y (${sbr.y})`);
});

test('the placed rear pair is already the wall-hug target, so nothing moves it', () => {
  for (const role of ['SBL', 'SBR']) {
    const pos = place(role);
    const target = resolveWallHugTarget({
      role,
      model: MODEL,
      roomDims: ROOM,
      mlp: RSP,
      aimState: AIM_OFF,
      sideSurroundDefaultY: ROOM.lengthM / 2,
      position: pos,
      getModelDimsM,
      kinds: ['rear'],
    });
    assert.ok(Math.abs(target.x - pos.x) <= 0.001, `${role}: x stable`);
    assert.ok(Math.abs(target.y - pos.y) <= 0.001, `${role}: y stable`);
  }
});

// ── 3. The invalidity test that lets the guard correct a bad automatic pair ─

const speaker = (role, x, extra = {}) => ({
  role,
  model: MODEL,
  position: { x, y: ROOM.lengthM - 0.10, z: 1.15 },
  ...extra,
});

test('an overlapping automatic rear pair is reported invalid', () => {
  // Exactly the reported defect: SBL and SBR on one coordinate.
  const pair = [speaker('SBL', 3.375), speaker('SBR', 3.375)];
  assert.equal(hasInvalidAutomaticRearPair(pair, ROOM), true);
});

test('a correctly placed automatic rear pair is not reported invalid', () => {
  const pair = [speaker('SBL', 1.125), speaker('SBR', 3.375)];
  assert.equal(hasInvalidAutomaticRearPair(pair, ROOM), false);
});

test('an automatic pair on the wrong side is reported invalid', () => {
  const pair = [speaker('SBL', 0.9), speaker('SBR', 1.5)];
  assert.equal(hasInvalidAutomaticRearPair(pair, ROOM), true);
});

test('a manually positioned pair is never reported invalid', () => {
  const pair = [
    speaker('SBL', 3.30, { positionSource: 'user' }),
    speaker('SBR', 3.40, { positionSource: 'user' }),
  ];
  assert.equal(hasInvalidAutomaticRearPair(pair, ROOM), false, 'deliberate adjustments are protected');
});

test('an uninstalled or incomplete pair is never reported invalid', () => {
  assert.equal(hasInvalidAutomaticRearPair([], ROOM), false);
  assert.equal(hasInvalidAutomaticRearPair([speaker('SBL', 3.375)], ROOM), false, 'no SBR yet');
  const unassigned = [
    { role: 'SBL', model: '', position: { x: 3.375, y: 5.9, z: 1.15 } },
    { role: 'SBR', model: '', position: { x: 3.375, y: 5.9, z: 1.15 } },
  ];
  assert.equal(hasInvalidAutomaticRearPair(unassigned, ROOM), false, 'no model installed');
});

// ── 4. Correcting a rejected pair lands on valid geometry ───────────────────

test('a rejected automatic position is regenerated onto the correct rear wall', () => {
  // The placement pass drops a position its validator rejected before seeding
  // the authority. Regenerating SBL from no seed yields the LEFT rear position.
  const regenerated = place('SBL', null);
  assert.ok(regenerated.x < ROOM.widthM / 2, 'corrected onto the rear-left');

  // And the rejected coordinate it would have been seeded with is not the result.
  assert.notEqual(regenerated.x, 3.375);
});