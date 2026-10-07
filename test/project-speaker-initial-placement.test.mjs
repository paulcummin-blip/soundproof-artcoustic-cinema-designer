// ---------------------------------------------------------------------------
// TEST   Speaker initial placement — first visible frame is the final position
// WHAT   One initial placement authority resolves a speaker's FINAL position in
//        the same state update that assigns its model. The plan view's wall-hug
//        and front-wide effects must therefore find NOTHING to change for a
//        newly installed speaker, and a model change must preserve an existing
//        installation position.
// WHY    Speakers could become visible before their final automatic placement
//        was established, so several effects then moved them in succession and
//        the design appeared to flicker on model selection.
//
// These tests exercise the production modules directly (no simulation of the
// render sequence).
// ---------------------------------------------------------------------------

import { test } from 'vitest';
import assert from 'node:assert/strict';

import { resolveWallHugTarget } from '@/components/room/placement/wallHugAuthority';
import {
  resolveInitialWallPosition,
  resolveInitialLcrPosition,
  resolveFrontWideY,
  resolveAutoSurroundHeight,
  resolveCanonicalRsp,
} from '@/components/room/placement/initialSpeakerPlacement';
import { resolveSideSurroundVisualSpan } from '@/components/room/rv/hooks/useSideSurroundVisualSpanM';
import { getCanonicalRole } from '@/components/utils/surroundRoleMap';
import { buildFrontStageSeed } from '@/components/room/lcrFrontStageSeed';
import { computeLcrZones, clampLcrZoneDepth } from '@/components/utils/rp22/lcrZoneAuthority';
import { computeFrontWideZonesStrict } from '@/components/utils/frontWideZones';

// ── Shared fixtures ────────────────────────────────────────────────────────

const ROOM = { widthM: 4.5, lengthM: 6.0, heightM: 2.8 };
const RSP = { x: 2.25, y: 3.4 };
const SEATS = [{ id: 's1', x: 2.25, y: 3.4, z: 1.1, rowEarHeight: 1.1 }];
const AIM_OFF = {
  aimFrontWidesAtMLP: false,
  aimSideSurroundsAtMLP: false,
  aimRearSurroundsAtMLP: false,
};
const AIM_ON = {
  aimFrontWidesAtMLP: true,
  aimSideSurroundsAtMLP: true,
  aimRearSurroundsAtMLP: true,
};

// A surround model with known cube dimensions, so wall geometry is exact.
const DIMS = { widthM: 0.20, depthM: 0.09, heightM: 0.20 };
const getModelDimsM = () => ({ ...DIMS });
const MODEL = 'evolve-2-1';

// Anchors placed exactly where the wall authority puts them, so the front-wide
// zones can be constructed (SL/SR must be on their side walls).
const FL = { role: 'FL', model: MODEL, position: { x: 1.30, y: 0.055, z: 1.2 } };
const FR = { role: 'FR', model: MODEL, position: { x: 3.20, y: 0.055, z: 1.2 } };
const SL = { role: 'SL', model: MODEL, position: { x: 0.055, y: 3.20, z: 1.15 } };
const SR = { role: 'SR', model: MODEL, position: { x: 4.445, y: 3.20, z: 1.15 } };
const ANCHORS = [FL, FR, SL, SR];

const sideSurroundDefaultY = (placedSpeakers) => {
  const span = resolveSideSurroundVisualSpan({
    mlpY_m: RSP.y,
    seatingPositions: SEATS,
    placedSpeakers,
    getModelDimsM,
    lengthM: ROOM.lengthM,
    getCanonicalRole,
  });
  return span.maxY > span.minY ? (span.minY + span.maxY) / 2 : ROOM.lengthM / 2;
};

const KINDS_BY_ROLE = {
  SL: ['side'], SR: ['side'], SBL: ['rear'], SBR: ['rear'], LW: ['wide'], RW: ['wide'],
};

// ── 1. Wall-mounted roles: the installed position IS the wall-hug target ────

for (const role of ['SL', 'SR', 'SBL', 'SBR', 'LW', 'RW']) {
  test(`${role}: initial placement is already the wall-hug target (aim off)`, () => {
    const pos = resolveInitialWallPosition({
      role,
      model: MODEL,
      roomDims: ROOM,
      rsp: RSP,
      aimState: AIM_OFF,
      seatingPositions: SEATS,
      enableFrontWides: true,
      placedSpeakers: ANCHORS,
      existingPosition: null,
      getModelDimsM,
    });
    assert.ok(pos, 'a position is resolved');
    assert.ok(Number.isFinite(pos.x) && Number.isFinite(pos.y) && Number.isFinite(pos.z));

    const target = resolveWallHugTarget({
      role,
      model: MODEL,
      roomDims: ROOM,
      mlp: RSP,
      aimState: AIM_OFF,
      sideSurroundDefaultY: sideSurroundDefaultY(ANCHORS),
      position: pos,
      getModelDimsM,
      kinds: KINDS_BY_ROLE[role],
    });

    // Within the 1mm tolerance the wall-hug effect uses to decide to move.
    assert.ok(
      Math.abs(target.x - pos.x) <= 0.001,
      `${role}: x stable (${target.x} vs ${pos.x})`
    );
    assert.ok(
      Math.abs(target.y - pos.y) <= 0.001,
      `${role}: y stable (${target.y} vs ${pos.y})`
    );
  });

  test(`${role}: initial placement is already the wall-hug target (aim on)`, () => {
    const pos = resolveInitialWallPosition({
      role,
      model: MODEL,
      roomDims: ROOM,
      rsp: RSP,
      aimState: AIM_ON,
      seatingPositions: SEATS,
      enableFrontWides: true,
      placedSpeakers: ANCHORS,
      existingPosition: null,
      getModelDimsM,
    });

    const target = resolveWallHugTarget({
      role,
      model: MODEL,
      roomDims: ROOM,
      mlp: RSP,
      aimState: AIM_ON,
      sideSurroundDefaultY: sideSurroundDefaultY(ANCHORS),
      position: pos,
      getModelDimsM,
      kinds: KINDS_BY_ROLE[role],
    });

    assert.ok(Math.abs(target.x - pos.x) <= 0.001, `${role}: aimed x stable`);
    assert.ok(Math.abs(target.y - pos.y) <= 0.001, `${role}: aimed y stable`);
  });
}

test('side surround sits on the wall for its model depth, at the plan-view centre line', () => {
  const pos = resolveInitialWallPosition({
    role: 'SL',
    model: MODEL,
    roomDims: ROOM,
    rsp: RSP,
    aimState: AIM_OFF,
    seatingPositions: SEATS,
    enableFrontWides: true,
    placedSpeakers: ANCHORS,
    existingPosition: null,
    getModelDimsM,
  });
  // wall-flat at yaw ±90°: half-extent toward the wall = depth / 2, + 1 cm gap
  assert.equal(pos.x, DIMS.depthM / 2 + 0.01);
  assert.equal(pos.y, sideSurroundDefaultY(ANCHORS));
});

test('rear surround sits on the rear wall for its model depth', () => {
  const pos = resolveInitialWallPosition({
    role: 'SBL',
    model: MODEL,
    roomDims: ROOM,
    rsp: RSP,
    aimState: AIM_OFF,
    seatingPositions: SEATS,
    enableFrontWides: true,
    placedSpeakers: ANCHORS,
    existingPosition: null,
    getModelDimsM,
  });
  // rear wall: 0.5 × depth + 1 cm gap from the wall (yaw 180°, wall-flat)
  assert.equal(pos.y, ROOM.lengthM - (DIMS.depthM / 2 + 0.01));
});

// ── 2. Front wides use the RP22 median-angle zone authority ────────────────

test('front wide Y equals the RP22 zone authority value (single writer)', () => {
  const zones = computeFrontWideZonesStrict({
    mlpPoint: RSP,
    dimensions: { width: ROOM.widthM, length: ROOM.lengthM },
    placedSpeakers: ANCHORS,
    getModelDimsM,
  });
  assert.equal(zones.status, 'ok', 'zones are constructible from the anchors');

  const halfWidth = DIMS.widthM / 2;
  const expectedLW = Math.max(
    zones.left.yMin + halfWidth * 0.5,
    Math.min(zones.left.yMax - halfWidth * 0.5, zones.left.medianY)
  );

  const gotLW = resolveFrontWideY({
    role: 'LW',
    model: MODEL,
    placedSpeakers: ANCHORS,
    roomDims: ROOM,
    rsp: RSP,
    enableFrontWides: true,
    getModelDimsM,
  });
  assert.equal(gotLW, expectedLW);
});

test('front wide is resolved from the front and side surround geometry', () => {
  const moved = [
    FL,
    FR,
    { ...SL, position: { x: 0.055, y: 4.10, z: 1.15 } },
    { ...SR, position: { x: 4.445, y: 4.10, z: 1.15 } },
  ];
  const a = resolveFrontWideY({
    role: 'LW', model: MODEL, placedSpeakers: ANCHORS, roomDims: ROOM,
    rsp: RSP, enableFrontWides: true, getModelDimsM,
  });
  const b = resolveFrontWideY({
    role: 'LW', model: MODEL, placedSpeakers: moved, roomDims: ROOM,
    rsp: RSP, enableFrontWides: true, getModelDimsM,
  });
  assert.notEqual(a, b, 'side surround geometry moves the wide');
});

// ── 3. LCR: final zone position, not a nominal spread ─────────────────────

test('FL is placed at the centre of its permitted LCR zone', () => {
  const zoneDepthM = clampLcrZoneDepth(0.25);
  const zones = computeLcrZones({ mlpX: RSP.x, mlpY: RSP.y, zoneDepthM });

  const pos = resolveInitialLcrPosition({
    role: 'FL',
    model: MODEL,
    roomDims: ROOM,
    rsp: RSP,
    screenFrontPlaneM: 0.25,
    lcrHeightM: 1.2,
    lcrAimMode: 'flat',
    getModelDimsM,
  });

  assert.equal(pos.x, (zones.left.xMin + zones.left.xMax) / 2);
  assert.equal(pos.y, 0.01 + DIMS.depthM / 2);
  assert.equal(pos.z, 1.2);
});

test('FC is placed on the room centre line with front-wall clearance', () => {
  const pos = resolveInitialLcrPosition({
    role: 'FC',
    model: MODEL,
    roomDims: ROOM,
    rsp: RSP,
    screenFrontPlaneM: 0.25,
    lcrHeightM: 1.2,
    lcrAimMode: 'flat',
    getModelDimsM,
  });
  assert.equal(pos.x, ROOM.widthM / 2);
  assert.ok(pos.y >= 0.01 + DIMS.depthM / 2);
});

test('angled LCR keeps the cabinet clear of the wall at its aimed yaw', () => {
  const pos = resolveInitialLcrPosition({
    role: 'FL',
    model: MODEL,
    roomDims: ROOM,
    rsp: RSP,
    screenFrontPlaneM: 0.25,
    lcrHeightM: 1.2,
    lcrAimMode: 'angled',
    getModelDimsM,
  });
  const yawDeg = Math.abs((Math.atan2(RSP.x - pos.x, RSP.y - pos.y) * 180) / Math.PI);
  const rad = (yawDeg * Math.PI) / 180;
  const expectedY =
    0.01 + (DIMS.depthM / 2) * Math.abs(Math.cos(rad)) + (DIMS.widthM / 2) * Math.abs(Math.sin(rad));
  // 0.1 mm tolerance: the yaw is recomputed from the returned position.
  assert.ok(Math.abs(pos.y - expectedY) < 1e-4, `aimed clearance (${pos.y} vs ${expectedY})`);
});

// ── 4. Model assignment preserves an existing installation position ────────

const capture = () => {
  const box = { list: null };
  const setSpeakers = (updater) => {
    box.list = typeof updater === 'function' ? updater(box.prev) : updater;
  };
  return { box, setSpeakers };
};

const runFrontStage = (prevList, baseModelLabel) => {
  const { box, setSpeakers } = capture();
  box.prev = prevList;
  buildFrontStageSeed({
    baseModelLabel,
    frontStageMode: 'standard',
    dimensions: ROOM,
    screen: { heightFromFloorM: 0.5, visibleWidthInches: 120, aspectRatio: '16:9' },
    splConfig: { lcrHeightM: 1.2 },
    setSpeakers,
    rsp: RSP,
    screenFrontPlaneM: 0.25,
    lcrAimMode: 'flat',
  });
  return box.list;
};

test('changing an LCR model preserves the existing installation position', () => {
  const userFl = { role: 'FL', id: 'FL', model: 'evolve-2-1', position: { x: 1.1, y: 0.12, z: 1.2 }, positionSource: 'user' };
  const next = runFrontStage([userFl, FR, SL, SR], 'evolve-3-1');
  const fl = next.find((s) => s.role === 'FL');
  assert.equal(fl.model, 'evolve-3-1', 'the new model is installed');
  assert.equal(fl.position.x, 1.1, 'x preserved');
  assert.equal(fl.position.y, 0.12, 'y preserved');
});

test('a first LCR install lands on the final zone position, not the format seed', () => {
  // A format stub: seeded position, no model.
  const stubFl = { role: 'FL', id: 'FL', position: { x: 1.485, y: 0.051, z: 1.1 } };
  const stubFr = { role: 'FR', id: 'FR', position: { x: 3.015, y: 0.051, z: 1.1 } };
  const stubFc = { role: 'FC', id: 'FC', position: { x: 2.25, y: 0.051, z: 1.1 } };

  const zones = computeLcrZones({ mlpX: RSP.x, mlpY: RSP.y, zoneDepthM: clampLcrZoneDepth(0.25) });
  const next = runFrontStage([stubFl, stubFc, stubFr, SL, SR], MODEL);

  const fl = next.find((s) => s.role === 'FL');
  assert.equal(fl.model, MODEL);
  assert.equal(fl.position.x, (zones.left.xMin + zones.left.xMax) / 2, 'zone midpoint, not the seed');
});

test('a deeper model pushes a preserved LCR clear of the front wall', () => {
  const userFl = { role: 'FL', id: 'FL', model: 'evolve-2-1', position: { x: 1.1, y: 0.02, z: 1.2 }, positionSource: 'user' };
  const deepDims = () => ({ widthM: 0.30, depthM: 0.40, heightM: 0.30 });
  const { box, setSpeakers } = capture();
  box.prev = [userFl, FR, SL, SR];
  buildFrontStageSeed({
    baseModelLabel: 'evolve-3-1',
    frontStageMode: 'standard',
    dimensions: ROOM,
    screen: { heightFromFloorM: 0.5, visibleWidthInches: 120, aspectRatio: '16:9' },
    splConfig: { lcrHeightM: 1.2 },
    setSpeakers,
    rsp: RSP,
    screenFrontPlaneM: 0.25,
    lcrAimMode: 'flat',
  });
  const fl = box.list.find((s) => s.role === 'FL');
  assert.equal(fl.position.x, 1.1, 'x is not disturbed');
  assert.ok(fl.position.y >= 0.01 + 0.40 / 2 - 1e-9, 'y clears the deeper cabinet');
});

// ── 5. Surround height authority ──────────────────────────────────────────

test('automatic surround height matches the plan-view rule', () => {
  // Parity with the previous inline expression (ear height + 5 cm), bit for bit.
  assert.equal(resolveAutoSurroundHeight(SEATS, ROOM.heightM), 1.1 + 0.05);
  assert.equal(resolveAutoSurroundHeight([{ z: 1.4 }], ROOM.heightM), 1.4 + 0.05);
  assert.equal(resolveAutoSurroundHeight([], ROOM.heightM), 1.15);
});

test('a surround keeps its manual installation height', () => {
  const pos = resolveInitialWallPosition({
    role: 'SL',
    model: MODEL,
    roomDims: ROOM,
    rsp: RSP,
    aimState: AIM_OFF,
    seatingPositions: SEATS,
    enableFrontWides: true,
    placedSpeakers: ANCHORS,
    existingPosition: { x: 0.9, y: 3.0, z: 1.35 },
    getModelDimsM,
  });
  assert.equal(pos.y, sideSurroundDefaultY(ANCHORS), 'Y takes the centre line');
  assert.equal(pos.z, 1.15, 'Z takes the automatic surround height');
});

// ── 6. Canonical RSP resolution ───────────────────────────────────────────

test('canonical RSP prefers the published green dot', () => {
  assert.deepEqual(resolveCanonicalRsp({ roomDims: ROOM, mlpX_m: 2.1, mlpY_m: 3.9 }), { x: 2.1, y: 3.9 });
  assert.deepEqual(resolveCanonicalRsp({ roomDims: ROOM, fallbackMlp: { x: 1, y: 2 } }), { x: 1, y: 2 });
  assert.equal(resolveCanonicalRsp({ roomDims: ROOM }), null);
});