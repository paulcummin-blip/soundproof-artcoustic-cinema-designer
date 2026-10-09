// ---------------------------------------------------------------------------
// TEST   Dual-centre (Dual Mono Centre) in the Side Elevations
// WHAT   The two physical centre cabinets FCL / FCR — one logical centre channel
//        — must be projected in the side elevations from the SAME geometry the
//        Plan View places them by: the installed (orientation-aware) cabinet
//        footprint, the stored acoustic-centre height, the front-wall lock and
//        each cabinet's own live aim angle. Where the two projections coincide
//        they are drawn ONCE, labelled "FCL / FCR".
// WHY    Acceptance items under test:
//          DUAL MONO CENTRE SELECTED — FCL/FCR REPRESENTED
//          VERTICAL C-1 ORIENTATION — CORRECT PROJECTED CABINET DIMENSIONS
//          LEFT / RIGHT SIDE ELEVATION — CORRECT FCL/FCR PROJECTION
//          IDENTICAL HEIGHT AND DEPTH — PROJECTED CABINETS OVERLAP
//          DIFFERENT VALID PROJECTED POSITIONS — DISTINCT OUTLINES
//          AIM AT RSP — CORRECT PROJECTION OF THE ROTATED CABINETS
//          FRONT ELEVATION / PLAN VIEW / CONVENTIONAL SINGLE CENTRE — UNCHANGED
//          SAVE AND REOPEN — THE SAME GEOMETRY RESTORED
//
// Drawing-consistency test only. Nothing here touches centre-channel acoustics,
// SPL, RP22 scoring or the positioning authority: the projection is derived from
// what is already stored, and no stored value is written.
// ---------------------------------------------------------------------------

import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  COINCIDENT_PROJECTION_TOLERANCE_M,
  groupCoincidentSideProjections,
  resolveCentreCabinetSideProjections,
} from '@/components/utils/dualCentreSideProjection';
import { resolveCentreCabinetFootprintM } from '@/components/utils/frontStageModeAuthority';
import { yHalfExtentM_physical } from '@/components/room/rv/RenderPrimitives';
import { FRONT_WALL_GAP_M } from '@/components/room/placement/initialSpeakerPlacement';
import { getSpeakerModelMeta } from '@/components/models/speakers/registry';

// ── Fixtures ───────────────────────────────────────────────────────────────
// The catalogue's own C-1: 400 × 120 × 81 mm (fixed width, height, depth).
const CABINET_MODEL = 'c-1';
const ROOM_W = 4.5;
const RSP = { x: ROOM_W / 2, y: 3.4, z: 1.2 };
const OFF_CENTRE_RSP = { x: 1.8, y: 3.4, z: 1.2 };
const CABINET_Z_M = 0.62;                 // stored acoustic-centre height

const catalogueDims = getSpeakerModelMeta(CABINET_MODEL);

/** A cabinet exactly as the app stores it: the wall anchor Y and a saved height. */
const cabinet = (role, x, extra = {}) => ({
  id: `${role}-1`,
  role,
  model: CABINET_MODEL,
  orientation: 'vertical',
  position: { x, y: FRONT_WALL_GAP_M + catalogueDims.depthM / 2, z: CABINET_Z_M },
  ...extra,
});

const PAIR = [cabinet('FCL', ROOM_W / 2 - 0.7), cabinet('FCR', ROOM_W / 2 + 0.7)];

const project = (placedSpeakers, mlpPoint = RSP) => resolveCentreCabinetSideProjections({
  placedSpeakers,
  mlpPoint,
  tvPresetKey: null,
  appState: {},
});

const groups = (placedSpeakers, mlpPoint = RSP) => groupCoincidentSideProjections(
  project(placedSpeakers, mlpPoint),
);

const roleOf = (list, role) => list.find((p) => p.role === role);

/** The app's own azimuth convention (yawFromToPlan), recomputed independently. */
const expectedYawDeg = (from, to) => -Math.atan2(to.x - from.x, to.y - from.y) * (180 / Math.PI);

const read = (rel) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');
const sideElevationSource = read('src/components/room/SideElevation.jsx');

// ── 1. The pair is represented ─────────────────────────────────────────────

test('TEST 1  Dual Mono Centre selected — FCL/FCR represented', () => {
  const projections = project(PAIR);

  assert.deepEqual(projections.map((p) => p.role), ['FCL', 'FCR']);
  // Two physical cabinets, ONE centre channel: no third speaker is invented.
  assert.equal(projections.length, 2);

  for (const projection of projections) {
    assert.equal(projection.model, CABINET_MODEL);
    assert.equal(projection.orientation, 'vertical');
    assert.equal(projection.zM, CABINET_Z_M);
    assert.ok(projection.depthM > 0 && projection.heightM > 0);
  }
});

test('TEST 1b A projection never alters the stored installation', () => {
  const before = JSON.parse(JSON.stringify(PAIR));
  project(PAIR);
  assert.deepEqual(PAIR, before, 'positions, model, orientation and aim are read only');
});

// ── 2. Installed dimensions ────────────────────────────────────────────────

test('TEST 2  Vertical C-1 orientation — correct projected cabinet dimensions', () => {
  const footprint = resolveCentreCabinetFootprintM(CABINET_MODEL, 'vertical', null);

  // The catalogue's published C-1: 400 mm wide, 120 mm high, 81 mm deep.
  assert.equal(catalogueDims.widthM, 0.40);
  assert.equal(catalogueDims.heightM, 0.12);
  assert.equal(catalogueDims.depthM, 0.081);

  // Vertical is the same cabinet rotated a quarter turn: width and height swap,
  // the depth is unchanged.
  assert.equal(footprint.widthM, catalogueDims.heightM);
  assert.equal(footprint.heightM, catalogueDims.widthM);
  assert.equal(footprint.depthM, catalogueDims.depthM);

  const projection = roleOf(project(PAIR), 'FCL');
  // Straight ahead, the side profile is the real installed depth × height.
  assert.ok(Math.abs(projection.depthM - 0.081) < 1e-9);
  assert.ok(Math.abs(projection.heightM - 0.40) < 1e-9);
  assert.ok(projection.heightM > projection.widthM, 'a vertical cabinet stands taller than its installed width');
});

test('TEST 2b A horizontal C-1 projects the product’s own form', () => {
  const horizontal = [cabinet('FCL', 1.55, { orientation: 'horizontal' })];
  const projection = project(horizontal)[0];

  assert.equal(projection.orientation, 'horizontal');
  assert.ok(Math.abs(projection.heightM - 0.12) < 1e-9, 'horizontal keeps the product’s 120 mm height');
  assert.ok(Math.abs(projection.depthM - 0.081) < 1e-9, 'depth is unchanged by orientation');
});

// ── 3. Both wall elevations consume the one projection ─────────────────────

test('TEST 3  Left and Right Side Elevation — the same FCL/FCR projection', () => {
  // The projection is wall-independent: it reads the physical installation, so
  // both elevations resolve identical geometry and neither can show its own
  // arrangement.
  const left = groups(PAIR);
  const right = groups(PAIR);

  assert.deepEqual(left, right);
  assert.equal(left.length, 1);
  assert.equal(left[0].label, 'FCL / FCR');

  const authority = read('src/components/utils/dualCentreSideProjection.js');
  assert.ok(!/['"]left['"]|['"]right['"]/.test(authority), 'the projection takes no wall side');
  assert.ok(sideElevationSource.includes('<SideViewCentreCabinets'), 'the elevation renders the shared projection');
  assert.ok(
    sideElevationSource.includes('groups={dualCentreGroups}'),
    'both elevations render the one shared projection, not a per-wall arrangement',
  );
});

// ── 4. Coincident projections are drawn once ───────────────────────────────

test('TEST 4  Identical height and depth — the projections overlap', () => {
  const grouped = groups(PAIR);

  assert.equal(grouped.length, 1, 'one shared outline');
  assert.deepEqual(grouped[0].roles, ['FCL', 'FCR']);
  assert.equal(grouped[0].label, 'FCL / FCR');
  assert.equal(grouped[0].projections.length, 2);
});

test('TEST 4b Aiming the pair keeps the shared outline', () => {
  const aimed = PAIR.map((s) => ({ ...s, aimAtRsp: true }));
  const grouped = groups(aimed);

  // Symmetrically placed cabinets aimed at a centred RSP take equal and opposite
  // angles, so their projected footprints are identical.
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].label, 'FCL / FCR');
});

// ── 5. Genuinely different projections stay distinct ───────────────────────

test('TEST 5  Different valid projected positions — distinct outlines', () => {
  // (a) A different stored acoustic-centre height is a different projection.
  const offsetHeights = [
    cabinet('FCL', ROOM_W / 2 - 0.7),
    cabinet('FCR', ROOM_W / 2 + 0.7, { position: { ...cabinet('FCR', 0).position, z: 0.95 } }),
  ];
  const byHeight = groups(offsetHeights);
  assert.equal(byHeight.length, 2);
  assert.deepEqual(byHeight.map((g) => g.label), ['FCL', 'FCR']);

  // (b) An off-centre RSP gives the two cabinets different aim angles, so their
  // rotated footprints differ and neither is offset to hide it.
  const aimed = PAIR.map((s) => ({ ...s, aimAtRsp: true }));
  const byAim = groups(aimed, OFF_CENTRE_RSP);
  assert.equal(byAim.length, 2);

  const fcl = roleOf(project(aimed, OFF_CENTRE_RSP), 'FCL');
  const fcr = roleOf(project(aimed, OFF_CENTRE_RSP), 'FCR');
  assert.ok(Math.abs(fcl.depthM - fcr.depthM) > COINCIDENT_PROJECTION_TOLERANCE_M);
});

test('TEST 5b The coincidence tolerance stays below one drawn pixel', () => {
  assert.ok(COINCIDENT_PROJECTION_TOLERANCE_M <= 0.005);
});

// ── 6. Aiming: the rotated footprint ───────────────────────────────────────

test('TEST 6  Aim at RSP — the rotated cabinet is projected correctly', () => {
  const aimed = PAIR.map((s) => ({ ...s, aimAtRsp: true }));
  const flat = project(PAIR);

  for (const projection of project(aimed)) {
    const source = aimed.find((s) => s.role === projection.role);

    // Each cabinet is aimed from its OWN acoustic centre, live.
    const yaw = expectedYawDeg(source.position, RSP);
    assert.ok(Math.abs(projection.yawDeg - yaw) < 1e-9);

    // The depth seen from the side is the yaw-projected footprint — the shared
    // physical half-extent helper, doubled: the SAME figure the Plan View draws.
    const footprint = resolveCentreCabinetFootprintM(source.model, source.orientation, null);
    const expectedDepth = 2 * yHalfExtentM_physical(footprint.depthM, footprint.widthM, yaw);
    assert.ok(Math.abs(projection.depthM - expectedDepth) < 1e-12);

    // Rotation deepens the footprint: it never translates the cabinet.
    assert.ok(projection.depthM > roleOf(flat, projection.role).depthM);
    assert.equal(projection.yM, FRONT_WALL_GAP_M);
    assert.equal(projection.zM, CABINET_Z_M);
  }
});

test('TEST 6b Wall mounting — the rear face stays in the front-wall gap at every angle', () => {
  for (const x of [1.0, 1.55, 2.25, 2.95, 3.5]) {
    for (const aimed of [false, true]) {
      const projection = project([cabinet('FCL', x, { aimAtRsp: aimed })], { x: 4.3, y: 3.4, z: 1.2 })[0];
      assert.equal(projection.yM, FRONT_WALL_GAP_M, 'locked to the front wall');
      assert.ok(projection.yM >= 0, 'never inside the wall');
      assert.ok(projection.depthM >= 0.081 - 1e-12, 'the projected depth is never smaller than the cabinet’s own depth');
    }
  }
});

test('TEST 6c Straight ahead is exactly the cabinet’s own depth', () => {
  for (const projection of project(PAIR)) {
    assert.equal(projection.yawDeg, 0);
    assert.ok(Math.abs(projection.depthM - 0.081) < 1e-9);
  }
});

// ── 7. Save and reopen ─────────────────────────────────────────────────────

test('TEST 7  Save and reopen — the same geometry restored', () => {
  const aimed = PAIR.map((s) => ({ ...s, aimAtRsp: true }));
  const before = groups(aimed);

  // Nothing about the projection is stored: it is derived from the saved
  // position, model and orientation, so a reload restores it exactly.
  const reopened = JSON.parse(JSON.stringify(aimed));
  assert.deepEqual(groups(reopened), before);

  const authority = read('src/components/utils/dualCentreSideProjection.js');
  assert.ok(!/localStorage|sessionStorage|\.create\(|\.update\(/.test(authority), 'the projection stores nothing');
});

// ── 8. The other views are untouched ───────────────────────────────────────

test('TEST 8  Front Elevation unchanged', () => {
  const front = read('src/components/room/FrontElevation.jsx');
  assert.ok(front.includes('resolveCentreCabinetFootprintM'), 'the front elevation still resolves the installed footprint');
  assert.ok(!front.includes('dualCentreSideProjection'), 'the front elevation does not consume the side projection');

  // The front elevation draws installed width × height, which is exactly what
  // the pair’s tooltip reports from this projection — one cabinet, one size.
  const projection = roleOf(project(PAIR), 'FCL');
  const footprint = resolveCentreCabinetFootprintM(CABINET_MODEL, 'vertical', null);
  assert.equal(projection.widthM, footprint.widthM);
  assert.equal(projection.heightM, footprint.heightM);
});

test('TEST 9  Plan View unchanged', () => {
  const plan = read('src/components/room/rv/render/RvSpeakerLayer.jsx');
  assert.ok(plan.includes('FRONT_WALL_GAP_M + projectedHalfExtentY'), 'the plan keeps its own front-wall rule');
  assert.ok(plan.includes('resolveCentreCabinetFootprintM'), 'and its own installed-footprint authority');
  assert.ok(!plan.includes('dualCentreSideProjection'), 'the plan does not consume the side projection');
  assert.ok(!sideElevationSource.includes('linkedCentreCabinetPositions'), 'the side elevation moves nothing');
});

test('TEST 10 Conventional single centre unchanged', () => {
  // No installed cabinets → no projection, so nothing is drawn and the
  // conventional FC path is untouched.
  const conventional = [
    { id: 'FL-1', role: 'FL', model: 'q4-3', position: { x: 1.2, y: 0.06, z: 1.2 } },
    { id: 'FC-1', role: 'FC', model: 'c-1', position: { x: 2.25, y: 0.06, z: 1.2 } },
    { id: 'FR-1', role: 'FR', model: 'q4-3', position: { x: 3.3, y: 0.06, z: 1.2 } },
  ];
  assert.deepEqual(project(conventional), []);
  assert.deepEqual(groups(conventional), []);

  // The conventional centre is only suppressed while cabinets are installed.
  assert.ok(sideElevationSource.includes("if (hasFC && !hasDualCentreCabinets) visibleRoles.add('FC');"));

  // A cabinet model with no stored height cannot be projected, and no height is
  // ever invented from its partner.
  const incomplete = [cabinet('FCL', 1.55, { position: { x: 1.55, y: 0.05 } })];
  assert.deepEqual(project(incomplete), []);
});

test('TEST 11 One installed cabinet is one outline — no second centre invented', () => {
  const grouped = groups([cabinet('FCL', 1.55)]);

  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].label, 'FCL');
  assert.deepEqual(grouped[0].roles, ['FCL']);
});

test('TEST 12 The elevation draws the pair, never a substitute arrangement', () => {
  // The cabinets are drawn by their own component, from the shared authority —
  // and are excluded from the generic marker layer that used to draw one of them
  // per wall.
  assert.ok(sideElevationSource.includes('isCentreCabinetRole(role)) return false;'));
  assert.ok(sideElevationSource.includes('dualCentreGroups'));
  assert.ok(!/['"](FCL|FCR)['"]/.test(sideElevationSource), 'the elevation names no cabinet role of its own');

  const component = read('src/components/room/dualCentre/SideViewCentreCabinets.jsx');
  assert.ok(component.includes('group.label'), 'the outline is labelled from the projection');
  assert.ok(!/offset|spread|nudge/i.test(component), 'no artificial offset is applied');
});