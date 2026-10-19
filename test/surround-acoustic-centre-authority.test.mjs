// ---------------------------------------------------------------------------
// TEST   Surround & front-wide acoustic centre — one definition, one source
// WHAT   A wall speaker's height is its stored acoustic centre (position.z),
//        measured from the finished floor. This suite pins the DEFAULT rule
//        (1.20 m above the floor of the row each group serves, so the usual
//        0.4 m risers give 1.20 / 1.60 / 2.00 m), the project's own risers
//        being followed, the room bounds a value may take, what a group reads
//        from its installed speakers, and the single write that records the
//        designer's override.
// WHY    The control panel and the elevation drawing previously reported
//        different heights for the same speaker, because the panel showed an
//        automatic value while the drawing showed the stored coordinate.
//
// These tests exercise the production module directly.
// ---------------------------------------------------------------------------

import { test } from 'vitest';
import assert from 'node:assert/strict';

import {
  SURROUND_ACOUSTIC_CENTRE_BASE_M,
  resolveRowPlatformHeights,
  resolveSurroundAcousticCentreDefaults,
  groupForSurroundRole,
  clampAcousticCentreHeight,
  resolveAcousticCentreBounds,
  readAcousticCentreGroups,
  applyAcousticCentreForGroup,
} from '@/components/room/surrounds/surroundAcousticCentreAuthority';

const ROOM_H = 2.8;
const MODEL = 'evolve-2-1';

/** One seating row, with its own riser stated as an absolute platform height. */
const row = (rowNumber, { earM, platformM }) => ({
  id: `seat-r${rowNumber}`,
  rowNumber,
  rowEarHeight: earM,
  platformHeightM: platformM,
  x: 2.25,
  y: 3.0 + rowNumber * 0.4,
  z: earM,
});

const ONE_ROW = [row(1, { earM: 1.2, platformM: 0 })];
const TWO_ROWS = [row(1, { earM: 1.2, platformM: 0 }), row(2, { earM: 1.6, platformM: 0.4 })];
const THREE_ROWS = [...TWO_ROWS, row(3, { earM: 2.0, platformM: 0.8 })];

const speaker = (role, z) => ({ id: role, role, model: MODEL, position: { x: 0.05, y: 3.0, z } });

// ── 1. The default table ───────────────────────────────────────────────────

test('one seating row puts every wall group at 1.20 m', () => {
  assert.deepEqual(resolveSurroundAcousticCentreDefaults(ONE_ROW, ROOM_H), {
    rows: 1,
    wideM: 1.20,
    sideM: 1.20,
    rearM: 1.20,
  });
});

test('two seating rows raise the side and rear surrounds one riser', () => {
  assert.deepEqual(resolveSurroundAcousticCentreDefaults(TWO_ROWS, ROOM_H), {
    rows: 2,
    wideM: 1.20,
    sideM: 1.60,
    rearM: 1.60,
  });
});

test('three seating rows lift the rear surrounds to the last row', () => {
  assert.deepEqual(resolveSurroundAcousticCentreDefaults(THREE_ROWS, ROOM_H), {
    rows: 3,
    wideM: 1.20,
    sideM: 1.60,
    rearM: 2.00,
  });
});

test('a project with its own risers gets its own heights, never an assumed 0.4 m', () => {
  const shallow = [
    row(1, { earM: 1.2, platformM: 0 }),
    row(2, { earM: 1.45, platformM: 0.25 }),
    row(3, { earM: 1.7, platformM: 0.5 }),
  ];
  const defaults = resolveSurroundAcousticCentreDefaults(shallow, ROOM_H);
  assert.equal(defaults.sideM, 1.45, 'side surrounds sit one 0.25 m riser up');
  assert.equal(defaults.rearM, 1.70, 'rear surrounds sit on the last row');
  assert.equal(defaults.wideM, 1.20, 'front wides stay at the first row');
});

test('a row that states no platform falls back to its own ear-height rise', () => {
  const platforms = resolveRowPlatformHeights([
    { rowNumber: 1, rowEarHeight: 1.2 },
    { rowNumber: 2, rowEarHeight: 1.6 },
  ]);
  assert.deepEqual(platforms, [0, 0.4]);
});

test('the base acoustic centre is 1.20 m and no seating still resolves', () => {
  assert.equal(SURROUND_ACOUSTIC_CENTRE_BASE_M, 1.20);
  assert.equal(resolveSurroundAcousticCentreDefaults([], ROOM_H).rearM, 1.20);
});

test('a low room clamps the default inside its own bounds', () => {
  const defaults = resolveSurroundAcousticCentreDefaults(THREE_ROWS, 1.8);
  assert.ok(defaults.rearM <= 1.7, `rear default ${defaults.rearM} stays inside a 1.8 m room`);
});

// ── 2. Grouping and bounds ─────────────────────────────────────────────────

test('every surround and front-wide role maps to its own group', () => {
  assert.equal(groupForSurroundRole('SL'), 'side');
  assert.equal(groupForSurroundRole('SR2'), 'side');
  assert.equal(groupForSurroundRole('SBL'), 'rear');
  assert.equal(groupForSurroundRole('SBR1'), 'rear');
  assert.equal(groupForSurroundRole('LW'), 'wide');
  assert.equal(groupForSurroundRole('FWR'), 'wide', 'an alias resolves through the canonical role');
  assert.equal(groupForSurroundRole('FL'), null, 'LCR is out of scope');
  assert.equal(groupForSurroundRole('TFL'), null, 'overheads are out of scope');
});

test('the bounds keep the whole cabinet inside the room', () => {
  const bounds = resolveAcousticCentreBounds({ cabinetHeightM: 0.50, roomHeightM: 2.8 });
  assert.deepEqual(bounds, { minM: 0.25, maxM: 2.55 });
  assert.equal(clampAcousticCentreHeight(0.10, bounds), 0.25, 'below the floor is clamped up');
  assert.equal(clampAcousticCentreHeight(3.00, bounds), 2.55, 'through the ceiling is clamped down');
  assert.equal(clampAcousticCentreHeight(1.60, bounds), 1.60, 'a fair value passes through');
  assert.equal(clampAcousticCentreHeight('abc', bounds), null, 'an unusable value resolves to null');
});

// ── 3. What a group reads ──────────────────────────────────────────────────

test('a group reads the acoustic centre its installed speakers hold', () => {
  const groups = readAcousticCentreGroups([speaker('SL', 1.6), speaker('SR', 1.6)], ROOM_H);
  assert.equal(groups.side.count, 2);
  assert.equal(groups.side.valueM, 1.60);
  assert.equal(groups.side.mixed, false);
  assert.equal(groups.rear.valueM, null, 'no rear surrounds installed');
});

test('a group whose speakers disagree is reported as mixed', () => {
  const groups = readAcousticCentreGroups([speaker('SL', 1.6), speaker('SR', 1.75)], ROOM_H);
  assert.equal(groups.side.mixed, true);
  assert.equal(groups.side.valueM, 1.60, 'the first installed speaker states the group');
});

test('an uninstalled or positionless role is never counted', () => {
  const groups = readAcousticCentreGroups(
    [
      { id: 'LW', role: 'LW', model: 'off', position: { x: 0.05, y: 3, z: 1.2 } },
      { id: 'RW', role: 'RW', model: MODEL, position: { x: 4.4, y: 3 } },
      speaker('SBL', 1.6),
    ],
    ROOM_H,
  );
  assert.equal(groups.wide.count, 0);
  assert.equal(groups.wide.valueM, null);
  assert.equal(groups.rear.count, 1);
});

// ── 4. The single write ────────────────────────────────────────────────────

test('setting a group moves only that group, and records the designer override', () => {
  const list = [speaker('SL', 1.2), speaker('SR', 1.2), speaker('SBL', 1.2), speaker('LW', 1.2)];
  const next = applyAcousticCentreForGroup(list, 'side', 1.6, ROOM_H);

  const byRole = new Map(next.map((s) => [s.role, s]));
  assert.equal(byRole.get('SL').position.z, 1.6);
  assert.equal(byRole.get('SR').position.z, 1.6);
  assert.equal(byRole.get('SBL').position.z, 1.2, 'the rear group is untouched');
  assert.equal(byRole.get('LW').position.z, 1.2, 'the front wides are untouched');
  assert.equal(byRole.get('SL').positionSource, 'user', 'the value is the designer own');
  assert.equal(list[0].position.z, 1.2, 'the input list is never mutated');
});

test('a stated value is clamped inside the group own cabinet bounds', () => {
  const next = applyAcousticCentreForGroup([speaker('SL', 1.2)], 'side', 5, ROOM_H);
  const groups = readAcousticCentreGroups(next, ROOM_H);
  assert.equal(next[0].position.z, groups.side.maxM);
});

test('an unusable value or an unknown group changes nothing', () => {
  const list = [speaker('SL', 1.2)];
  assert.equal(applyAcousticCentreForGroup(list, 'side', 'x', ROOM_H), list);
  assert.equal(applyAcousticCentreForGroup(list, null, 1.6, ROOM_H), list);
});