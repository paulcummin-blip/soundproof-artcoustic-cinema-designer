// ---------------------------------------------------------------------------
// TEST   Dual-centre aiming — FCL / FCR aim at the RSP, each independently
// WHAT   The two physical cabinets of the "TV with dual centre speakers" front
//        stage carry ONE centre channel. Their aiming preference is part of that
//        configuration (stored on the cabinets themselves, exactly like their
//        orientation) and each cabinet is aimed from its OWN acoustic centre, so
//        a mirrored pair converges on the RSP with equal and opposite angles
//        instead of rotating as a single rigid group.
// WHY    Acceptance items under test:
//          STRAIGHT AHEAD — BOTH CABINETS FACE INTO THE ROOM
//          AIM AT RSP — BOTH POINT TOWARDS THE RSP
//          CENTRED RSP — EQUAL AND OPPOSITE AIMING ANGLES
//          MOVE FCL/FCR — BOTH AIMING ANGLES UPDATE
//          MOVE RSP — BOTH AIMING ANGLES UPDATE
//          WALL MOUNTING — NEITHER CABINET PENETRATES THE WALL
//          FRONT ELEVATION — CABINET ORIENTATION AND HEIGHTS UNCHANGED
//          SAVE/REOPEN — AIMING PREFERENCE RESTORED
//          OTHER SPEAKERS — EXISTING AIMING UNCHANGED
//          SPL/RP22 — NO CALCULATION CHANGES
//
// The angle is always resolved live by resolveSpeakerYaw — the ONE aim authority
// the Plan View, the CAD export and the RP22 path all call. Nothing here asserts
// or changes RP22/RP23 grading, thresholds, SPL or any engineering maths.
// ---------------------------------------------------------------------------

import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { resolveSpeakerYaw } from '@/components/utils/speakerAimResolver';
import {
  CENTRE_CABINET_AIM_OPTIONS,
  centreCabinetAimAtRsp,
  withCentreCabinetAim,
} from '@/components/utils/dualCentrePairAuthority';
import { getCanonicalRole } from '@/components/utils/surroundRoleMap';

// ── Fixtures ───────────────────────────────────────────────────────────────
// Room 4.5 × 6.0 m. The pair flanks the room centreline symmetrically, with the
// stored position being the FRONT-WALL anchor (the rear face's contact point),
// exactly as the plan render and the drag solver treat it.
const ROOM_W = 4.5;
const WALL_Y = 0.065;
const CENTRE_X = ROOM_W / 2;
const CENTRE_RSP = { x: CENTRE_X, y: 3.4 };
const OFF_CENTRE_RSP = { x: CENTRE_X - 0.45, y: 3.4 };

const cabinet = (role, x, extra = {}) => ({
  id: `${role}-1`,
  role,
  model: 'q4-3',
  orientation: 'vertical',
  position: { x, y: WALL_Y, z: 0.62 },
  ...extra,
});

const PAIR = [cabinet('FCL', CENTRE_X - 0.7), cabinet('FCR', CENTRE_X + 0.7)];

// The other bed speakers. Their aiming must be completely unaffected.
const FL = { id: 'FL-1', role: 'FL', model: 'q4-3', position: { x: 1.2, y: WALL_Y, z: 1.2 } };
const SL = { id: 'SL-1', role: 'SL', model: 'q4-3', position: { x: 0.07, y: 3.0, z: 1.2 } };
const SR = { id: 'SR-1', role: 'SR', model: 'q4-3', position: { x: ROOM_W - 0.07, y: 3.0, z: 1.2 } };
const SBL = { id: 'SBL-1', role: 'SBL', model: 'q4-3', position: { x: 1.5, y: 5.93, z: 1.2 } };

const yawOf = (speaker, rsp = CENTRE_RSP, appState = {}) =>
  resolveSpeakerYaw({ speaker, mlpPos: rsp, appState: appState || {} });

/** The app's own azimuth convention (rp22HfOffAxis.yawFromToPlan). */
const azimuthTo = (pos, target) =>
  -Math.atan2(target.x - pos.x, target.y - pos.y) * (180 / Math.PI);

const cabinetAt = (speakers, role) => speakers.find((s) => getCanonicalRole(s?.role) === role);

// The plan render rule for a front-wall speaker: the drawn centre sits in the
// room by the yaw-projected half extent, so the rear face stays on the wall for
// any aiming angle. Mirrors RvSpeakerLayer (unchanged by this feature).
const FRONT_WALL_GAP_M = 0.01;
const projectedHalfExtentM = (yawDeg, widthM, depthM) => {
  const t = Math.abs(yawDeg) * (Math.PI / 180);
  return (depthM / 2) * Math.abs(Math.cos(t)) + (widthM / 2) * Math.abs(Math.sin(t));
};

const read = (rel) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');

// ── 1. Default: straight ahead ─────────────────────────────────────────────

test('TEST 1  Straight ahead — both cabinets face into the room', () => {
  assert.equal(centreCabinetAimAtRsp(PAIR), false, 'an unset pair reads as straight ahead');

  for (const role of ['FCL', 'FCR']) {
    assert.equal(yawOf(cabinetAt(PAIR, role)), 0, `${role} must face into the room`);
  }

  // The RSP position is irrelevant while straight ahead is selected.
  assert.equal(yawOf(cabinetAt(PAIR, 'FCL'), OFF_CENTRE_RSP), 0);
  assert.equal(yawOf(cabinetAt(PAIR, 'FCR'), OFF_CENTRE_RSP), 0);
});

test('TEST 1b Straight ahead is the first offered option and the control default', () => {
  assert.deepEqual(
    CENTRE_CABINET_AIM_OPTIONS.map((o) => o.label),
    ['Straight ahead', 'Aim at RSP'],
  );
  assert.equal(CENTRE_CABINET_AIM_OPTIONS[0].atRsp, false);
  assert.equal(CENTRE_CABINET_AIM_OPTIONS[1].atRsp, true);
});

// ── 2. Aim at RSP ──────────────────────────────────────────────────────────

test('TEST 2  Aim at RSP — both cabinets point towards the RSP', () => {
  const aimed = withCentreCabinetAim(PAIR, true);
  assert.equal(centreCabinetAimAtRsp(aimed), true);

  const fcl = cabinetAt(aimed, 'FCL');
  const fcr = cabinetAt(aimed, 'FCR');
  const fclYaw = yawOf(fcl);
  const fcrYaw = yawOf(fcr);

  // Each cabinet's aim is the true azimuth from ITS OWN acoustic centre to the
  // RSP, in the app's own convention (the same one the drawing rotates by).
  assert.ok(Math.abs(fclYaw - azimuthTo(fcl.position, CENTRE_RSP)) < 1e-9);
  assert.ok(Math.abs(fcrYaw - azimuthTo(fcr.position, CENTRE_RSP)) < 1e-9);

  // Aiming actually happens: a cabinet must be visibly toe'd in, not rounded to 0.
  assert.ok(Math.abs(fclYaw) > 1, `FCL must visibly aim (got ${fclYaw})`);
  assert.ok(Math.abs(fcrYaw) > 1, `FCR must visibly aim (got ${fcrYaw})`);
});

test('TEST 2b Centred RSP — equal and opposite aiming angles', () => {
  const aimed = withCentreCabinetAim(PAIR, true);
  const fclYaw = yawOf(cabinetAt(aimed, 'FCL'));
  const fcrYaw = yawOf(cabinetAt(aimed, 'FCR'));

  assert.ok(Math.abs(Math.abs(fclYaw) - Math.abs(fcrYaw)) < 1e-9, 'angles must be equal in magnitude');
  assert.ok(fclYaw * fcrYaw < 0, 'angles must be opposite in sign');
});

test('TEST 2c Each cabinet aims from its own coordinates — never a rigid group', () => {
  // A cabinet deliberately offset from its symmetric position takes a different
  // angle from its partner: the pair resolves per cabinet, not as one rotation.
  const lopsided = withCentreCabinetAim(
    [cabinet('FCL', CENTRE_X - 1.0), cabinet('FCR', CENTRE_X + 0.7)],
    true,
  );
  const fclYaw = yawOf(cabinetAt(lopsided, 'FCL'));
  const fcrYaw = yawOf(cabinetAt(lopsided, 'FCR'));

  assert.ok(Math.abs(Math.abs(fclYaw) - Math.abs(fcrYaw)) > 0.5, 'independent coordinates must not be forced symmetric');
  assert.ok(Math.abs(fclYaw - azimuthTo({ x: CENTRE_X - 1.0, y: WALL_Y }, CENTRE_RSP)) < 1e-9);
});

test('TEST 2d An off-centre RSP still converges both cabinets on it', () => {
  const aimed = withCentreCabinetAim(PAIR, true);
  const fcl = cabinetAt(aimed, 'FCL');
  const fcr = cabinetAt(aimed, 'FCR');
  const fclYaw = yawOf(fcl, OFF_CENTRE_RSP);
  const fcrYaw = yawOf(fcr, OFF_CENTRE_RSP);

  assert.ok(Math.abs(fclYaw - azimuthTo(fcl.position, OFF_CENTRE_RSP)) < 1e-9);
  assert.ok(Math.abs(fcrYaw - azimuthTo(fcr.position, OFF_CENTRE_RSP)) < 1e-9);
  // Both may now point the same way — each is still aimed at the same RSP.
  assert.notEqual(Math.sign(fclYaw), Math.sign(fcrYaw));
});

// ── 3. Live updates ────────────────────────────────────────────────────────

test('TEST 3  Move FCL / FCR — both aiming angles update', () => {
  const aimed = withCentreCabinetAim(PAIR, true);
  const before = aimed.map((c) => yawOf(c));

  // A designer move keeps the pair symmetric (the linked-pair positioning rule
  // mirrors the partner), so BOTH angles change.
  const moved = withCentreCabinetAim(
    [cabinet('FCL', CENTRE_X - 1.1), cabinet('FCR', CENTRE_X + 1.1)],
    true,
  );
  const after = moved.map((c) => yawOf(c));

  assert.notEqual(after[0], before[0]);
  assert.notEqual(after[1], before[1]);
  assert.ok(Math.abs(after[0]) > Math.abs(before[0]), 'further from the centreline aims the cabinet more sharply');
  assert.ok(Math.abs(Math.abs(after[0]) - Math.abs(after[1])) < 1e-9, 'a symmetric pair stays symmetric');
});

test('TEST 3b Move one cabinet — only that cabinet’s own angle changes', () => {
  const aimed = withCentreCabinetAim(PAIR, true);
  const fcrBefore = yawOf(cabinetAt(aimed, 'FCR'));

  const shifted = aimed.map((c) => (
    c.role === 'FCL' ? { ...c, position: { ...c.position, x: c.position.x - 0.25 } } : c
  ));

  assert.notEqual(yawOf(cabinetAt(shifted, 'FCL')), yawOf(cabinetAt(aimed, 'FCL')));
  assert.equal(yawOf(cabinetAt(shifted, 'FCR')), fcrBefore, 'the partner cabinet is aimed from its own centre');
});

test('TEST 4  Move RSP — both aiming angles update', () => {
  const aimed = withCentreCabinetAim(PAIR, true);
  const atCentre = aimed.map((c) => yawOf(c, CENTRE_RSP));
  const atOffCentre = aimed.map((c) => yawOf(c, OFF_CENTRE_RSP));

  assert.notEqual(atOffCentre[0], atCentre[0]);
  assert.notEqual(atOffCentre[1], atCentre[1]);
  assert.equal(Math.sign(atCentre[0]) * Math.sign(atCentre[1]), -1);
  assert.equal(Math.sign(atOffCentre[0]) * Math.sign(atOffCentre[1]), -1);
});

// ── 4. Wall mounting and untouched geometry ────────────────────────────────

test('TEST 5  Wall mounting — the stored position is the anchor and never moves', () => {
  const aimed = withCentreCabinetAim(PAIR, true);

  for (const original of PAIR) {
    const updated = cabinetAt(aimed, getCanonicalRole(original.role));
    assert.equal(updated.position, original.position, 'aiming must not translate the cabinet');
    assert.equal(updated.position.y, original.position.y);
  }
});

test('TEST 5b A rotated cabinet is drawn in front of the wall, never inside it', () => {
  const aimed = withCentreCabinetAim(PAIR, true);
  // q4-3 installed vertically: plan footprint 0.21 m across the room × 0.11 m deep.
  const widthM = 0.21;
  const depthM = 0.11;

  const straight = projectedHalfExtentM(0, widthM, depthM);
  const aimedExtent = projectedHalfExtentM(Math.abs(yawOf(cabinetAt(aimed, 'FCL'))), widthM, depthM);
  assert.ok(aimedExtent > straight, 'a rotated cabinet is drawn further into the room');

  for (const yawDeg of [-60, -30, -12, 0, 12, 30, 60]) {
    const extent = projectedHalfExtentM(yawDeg, widthM, depthM);
    const renderY = FRONT_WALL_GAP_M + extent;      // wall-anchored render rule
    const rearFaceY = renderY - extent;             // the rearmost point of the footprint
    assert.ok(rearFaceY >= FRONT_WALL_GAP_M - 1e-12, `yaw ${yawDeg}° must not eat into the wall`);
  }
});

test('TEST 6  Front Elevation — orientation and acoustic-centre height unchanged', () => {
  const aimed = withCentreCabinetAim(PAIR, true);

  for (const original of PAIR) {
    const updated = cabinetAt(aimed, getCanonicalRole(original.role));
    assert.equal(updated.orientation, original.orientation, 'the selected cabinet orientation is unchanged');
    assert.equal(updated.position.z, original.position.z, 'the acoustic-centre height is unchanged');
    assert.equal(updated.model, original.model);
  }
});

test('TEST 6b Only the aiming preference changes on a cabinet', () => {
  const aimed = withCentreCabinetAim(PAIR, true);
  const changedKeys = (before, after) => Object.keys(after).filter((key) => after[key] !== before[key]);

  for (const original of PAIR) {
    const updated = cabinetAt(aimed, getCanonicalRole(original.role));
    assert.deepEqual(changedKeys(original, updated), ['aimAtRsp']);
  }
});

// ── 5. Save and restore ────────────────────────────────────────────────────

test('TEST 7  Save / reopen — the preference round-trips with the project', () => {
  const aimed = withCentreCabinetAim(PAIR, true);
  const reloaded = JSON.parse(JSON.stringify(aimed));

  assert.equal(centreCabinetAimAtRsp(reloaded), true, 'the preference survives a save and reopen');
  assert.equal(cabinetAt(reloaded, 'FCL').position.y, WALL_Y);

  const straightAgain = JSON.parse(JSON.stringify(withCentreCabinetAim(reloaded, false)));
  assert.equal(centreCabinetAimAtRsp(straightAgain), false);
});

test('TEST 7b No second aiming authority — the preference stores no angle', () => {
  const source = read('src/components/utils/dualCentrePairAuthority.js');
  assert.ok(source.includes('aimAtRsp'), 'the preference lives on the cabinets');
  assert.ok(!/atan2|Math\.sin|Math\.cos/.test(source), 'the pair authority computes no angle of its own');

  const stored = withCentreCabinetAim(PAIR, true);
  for (const s of stored) {
    assert.equal(Number.isFinite(s.yaw), false, 'no yaw is stamped — the angle is always resolved live');
  }
});

// ── 6. Nothing else moves ──────────────────────────────────────────────────

test('TEST 8  Other speakers — existing aiming unchanged', () => {
  const aiming = withCentreCabinetAim([...PAIR, FL, SL, SR, SBL], true);

  assert.equal(yawOf(cabinetAt(aiming, 'SL')), -90);
  assert.equal(yawOf(cabinetAt(aiming, 'SR')), 90);
  assert.equal(yawOf(cabinetAt(aiming, 'SBL')), 180);
  assert.equal(yawOf(cabinetAt(aiming, 'FL')), 0);

  // The other speakers are returned untouched, by identity.
  assert.equal(cabinetAt(aiming, 'FL'), FL);
  assert.equal(cabinetAt(aiming, 'SL'), SL);
  assert.equal(cabinetAt(aiming, 'SBL'), SBL);

  // And their aiming is unaffected by whether the cabinets are aimed.
  for (const role of ['FL', 'SL', 'SR', 'SBL']) {
    assert.equal(yawOf(cabinetAt(aiming, role)), yawOf(cabinetAt(withCentreCabinetAim([...PAIR, FL, SL, SR, SBL], false), role)));
  }
});

test('TEST 9  SPL / RP22 — the cabinets are outside every calculation', () => {
  const rp22 = read('src/components/utils/rp22HfOffAxis.jsx');
  assert.ok(
    rp22.includes('const EXCLUDE_LCR = new Set(["FL","FC","FR","FCL","FCR"]);'),
    'P17 must still exclude the centre cabinets',
  );

  // P16 resolves LCR aim from lcrAimMode and never reads a speaker yaw, so the
  // cabinets' new aim cannot reach it.
  const p16 = rp22.slice(
    rp22.indexOf('function computeLcrLossAtPoint'),
    rp22.indexOf('export function computeP16ForSeat'),
  );
  assert.ok(p16.length > 0);
  assert.ok(!/spk\.yaw/.test(p16.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')),
    'P16 must not read a stored speaker yaw');
});

test('TEST 10 Plan View draws the cabinets through the ONE aim resolver', () => {
  const rvAiming = read('src/components/room/rv/utils/rvAiming.jsx');
  assert.ok(rvAiming.includes('resolveSpeakerYaw'), 'the plan view delegates aim to the shared resolver');
  assert.ok(!/FCL|FCR/.test(rvAiming), 'the cabinets are not special-cased — they resolve through the resolver');

  const resolver = read('src/components/utils/speakerAimResolver.jsx');
  assert.ok(/isCentreCabinetRole\(canon\)/.test(resolver), 'the cabinet branch lives in the ONE resolver');
});