// ---------------------------------------------------------------------------
// HARNESS  Speaker initial-placement invariant checks
// WHAT     Executes the production placement modules directly and reports every
//          invariant as a named pass/fail. It is the executable form of
//          test/project-speaker-initial-placement.test.mjs, used because the
//          workspace's focused-suite runner needs a JS runtime the tooling
//          cannot start here.
// HOW      Bundle this file (esbuild/rollup with the `@` -> src alias) and call
//          run(). It renders nothing and asserts only public module behaviour.
// ---------------------------------------------------------------------------

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

const ROOM = { widthM: 4.5, lengthM: 6.0, heightM: 2.8 };
const RSP = { x: 2.25, y: 3.4 };
const SEATS = [{ id: 's1', x: 2.25, y: 3.4, z: 1.1, rowEarHeight: 1.1 }];
const AIM_OFF = { aimFrontWidesAtMLP: false, aimSideSurroundsAtMLP: false, aimRearSurroundsAtMLP: false };
const AIM_ON = { aimFrontWidesAtMLP: true, aimSideSurroundsAtMLP: true, aimRearSurroundsAtMLP: true };
const DIMS = { widthM: 0.20, depthM: 0.09, heightM: 0.20 };
const dimsFn = () => ({ ...DIMS });
const MODEL = 'evolve-2-1';

const FL = { role: 'FL', model: MODEL, position: { x: 1.30, y: 0.055, z: 1.2 } };
const FR = { role: 'FR', model: MODEL, position: { x: 3.20, y: 0.055, z: 1.2 } };
const SL = { role: 'SL', model: MODEL, position: { x: 0.055, y: 3.20, z: 1.15 } };
const SR = { role: 'SR', model: MODEL, position: { x: 4.445, y: 3.20, z: 1.15 } };
const ANCHORS = [FL, FR, SL, SR];
const KINDS = { SL: ['side'], SR: ['side'], SBL: ['rear'], SBR: ['rear'], LW: ['wide'], RW: ['wide'] };

const SIDE_Y = (() => {
  const span = resolveSideSurroundVisualSpan({
    mlpY_m: RSP.y, seatingPositions: SEATS, placedSpeakers: ANCHORS,
    getModelDimsM: dimsFn, lengthM: ROOM.lengthM, getCanonicalRole,
  });
  return span.maxY > span.minY ? (span.minY + span.maxY) / 2 : ROOM.lengthM / 2;
})();

export function run() {
  const checks = [];
  const failures = [];
  const ok = (name, cond, detail) => {
    if (cond) checks.push(name);
    else failures.push(name + (detail ? ' :: ' + detail : ''));
  };

  // 1) Fixed point: the installed position already equals the wall-hug target.
  for (const role of ['SL', 'SR', 'SBL', 'SBR', 'LW', 'RW']) {
    for (const [tag, aim] of [['off', AIM_OFF], ['on', AIM_ON]]) {
      const pos = resolveInitialWallPosition({
        role, model: MODEL, roomDims: ROOM, rsp: RSP, aimState: aim,
        seatingPositions: SEATS, enableFrontWides: true, placedSpeakers: ANCHORS,
        existingPosition: null, getModelDimsM: dimsFn,
      });
      const t = resolveWallHugTarget({
        role, model: MODEL, roomDims: ROOM, mlp: RSP, aimState: aim,
        sideSurroundDefaultY: SIDE_Y, position: pos, getModelDimsM: dimsFn, kinds: KINDS[role],
      });
      const dx = Math.abs(t.x - pos.x);
      const dy = Math.abs(t.y - pos.y);
      ok('fixedpoint ' + role + ' aim=' + tag, dx <= 0.001 && dy <= 0.001,
        'dx=' + dx.toFixed(6) + ' dy=' + dy.toFixed(6) + ' pos=' + JSON.stringify(pos) + ' tgt=' + JSON.stringify(t));
    }
  }

  // 2) Exact wall geometry for the installed model.
  const wall = (role) => resolveInitialWallPosition({
    role, model: MODEL, roomDims: ROOM, rsp: RSP, aimState: AIM_OFF, seatingPositions: SEATS,
    enableFrontWides: true, placedSpeakers: ANCHORS, existingPosition: null, getModelDimsM: dimsFn,
  });
  ok('SL wall x = depth/2 + 1cm', Math.abs(wall('SL').x - 0.055) < 1e-9, 'x=' + wall('SL').x);
  ok('SL y = plan-view centre line', Math.abs(wall('SL').y - SIDE_Y) < 1e-9, 'y=' + wall('SL').y + ' sideY=' + SIDE_Y);
  ok('SBL y = L - (depth/2 + 1cm)', Math.abs(wall('SBL').y - (ROOM.lengthM - 0.055)) < 1e-9, 'y=' + wall('SBL').y);

  // 3) LCR final position = zone centre + wall clearance.
  const zones = computeLcrZones({ mlpX: RSP.x, mlpY: RSP.y, zoneDepthM: clampLcrZoneDepth(0.25) });
  const midFL = (zones.left.xMin + zones.left.xMax) / 2;
  const lcr = (role, mode) => resolveInitialLcrPosition({
    role, model: MODEL, roomDims: ROOM, rsp: RSP, screenFrontPlaneM: 0.25,
    lcrHeightM: 1.2, lcrAimMode: mode, getModelDimsM: dimsFn,
  });
  const flFlat = lcr('FL', 'flat');
  ok('FL x = LCR zone midpoint', Math.abs(flFlat.x - midFL) < 1e-9, 'x=' + flFlat.x + ' mid=' + midFL);
  ok('FL y = wall clearance', Math.abs(flFlat.y - 0.055) < 1e-9, 'y=' + flFlat.y);
  ok('FL z = lcrHeightM', flFlat.z === 1.2, 'z=' + flFlat.z);
  ok('FC x = room centre line', lcr('FC', 'flat').x === 2.25, 'x=' + lcr('FC', 'flat').x);
  const flAngled = lcr('FL', 'angled');
  const rad = Math.abs(Math.atan2(RSP.x - flAngled.x, RSP.y - flAngled.y));
  const expectY = 0.01 + (DIMS.depthM / 2) * Math.abs(Math.cos(rad)) + (DIMS.widthM / 2) * Math.abs(Math.sin(rad));
  // 0.1 mm tolerance: the check recomputes the yaw from the returned position,
  // so it carries the float rounding of the round trip.
  ok('angled FL y = clearance at aimed yaw', Math.abs(flAngled.y - expectY) < 1e-4, 'y=' + flAngled.y + ' expect=' + expectY);

  // 4) Front wide Y comes from the RP22 zone authority (single writer).
  const wz = computeFrontWideZonesStrict({
    mlpPoint: RSP, dimensions: { width: ROOM.widthM, length: ROOM.lengthM },
    placedSpeakers: ANCHORS, getModelDimsM: dimsFn,
  });
  ok('front-wide zones constructible', wz.status === 'ok', 'status=' + wz.status);
  const hw = DIMS.widthM / 2;
  const expectLW = Math.max(wz.left.yMin + hw * 0.5, Math.min(wz.left.yMax - hw * 0.5, wz.left.medianY));
  const wideY = (list) => resolveFrontWideY({
    role: 'LW', model: MODEL, placedSpeakers: list, roomDims: ROOM, rsp: RSP,
    enableFrontWides: true, getModelDimsM: dimsFn,
  });
  ok('LW y = zone authority value', wideY(ANCHORS) === expectLW, 'y=' + wideY(ANCHORS) + ' expect=' + expectLW);
  const movedAnchors = [FL, FR,
    { ...SL, position: { x: 0.055, y: 4.10, z: 1.15 } },
    { ...SR, position: { x: 4.445, y: 4.10, z: 1.15 } }];
  ok('LW y follows side surround geometry', wideY(movedAnchors) !== wideY(ANCHORS),
    'a=' + wideY(ANCHORS) + ' b=' + wideY(movedAnchors));
  ok('installed LW y = zone authority value', wall('LW').y === wideY(ANCHORS), 'y=' + wall('LW').y + ' zone=' + wideY(ANCHORS));

  // 5) Model assignment preserves an existing installation position.
  const runFS = (prev, baseModel, dims) => {
    let out = null;
    buildFrontStageSeed({
      baseModelLabel: baseModel, frontStageMode: 'standard', dimensions: ROOM,
      screen: { heightFromFloorM: 0.5, visibleWidthInches: 120, aspectRatio: '16:9' },
      splConfig: { lcrHeightM: 1.2 },
      setSpeakers: (u) => { out = typeof u === 'function' ? u(prev) : u; },
      rsp: RSP, screenFrontPlaneM: 0.25, lcrAimMode: 'flat', getModelDimsM: dims,
    });
    return out;
  };
  const userFl = { role: 'FL', id: 'FL', model: 'evolve-2-1', position: { x: 1.1, y: 0.12, z: 1.2 }, positionSource: 'user' };
  const changed = runFS([userFl, FR, SL, SR], 'evolve-3-1');
  const flAfter = changed.find((s) => s.role === 'FL');
  ok('model change installs the new model', flAfter.model === 'evolve-3-1', 'model=' + flAfter.model);
  ok('model change preserves x', flAfter.position.x === 1.1, 'x=' + flAfter.position.x);
  ok('model change preserves y', flAfter.position.y === 0.12, 'y=' + flAfter.position.y);

  // 6) A first install goes to the final zone position, not the format seed.
  const stub = (role, x) => ({ role, id: role, position: { x, y: 0.051, z: 1.1 } });
  const firstInstall = runFS([stub('FL', 1.485), stub('FC', 2.25), stub('FR', 3.015), SL, SR], 'evolve-2-1');
  const flFirst = firstInstall.find((s) => s.role === 'FL');
  ok('first install uses the zone midpoint', Math.abs(flFirst.position.x - midFL) < 1e-9,
    'x=' + flFirst.position.x + ' seed=1.485 mid=' + midFL);

  // 7) A deeper model pushes a preserved LCR clear of the front wall.
  const deep = runFS([userFl, FR, SL, SR], 'evolve-3-1', () => ({ widthM: 0.30, depthM: 0.40, heightM: 0.30 }));
  const flDeep = deep.find((s) => s.role === 'FL');
  ok('deeper model keeps x', flDeep.position.x === 1.1, 'x=' + flDeep.position.x);
  ok('deeper model pushes y clear', flDeep.position.y >= 0.01 + 0.40 / 2 - 1e-9, 'y=' + flDeep.position.y);

  // 8) Surround height + canonical RSP.
  // Parity with the previous inline expression (ear height + 5 cm), bit for bit.
  ok('auto surround height = plan-view rule', resolveAutoSurroundHeight(SEATS, ROOM.heightM) === (1.1 + 0.05),
    'h=' + resolveAutoSurroundHeight(SEATS, ROOM.heightM));
  ok('canonical RSP prefers published green dot',
    JSON.stringify(resolveCanonicalRsp({ roomDims: ROOM, mlpX_m: 2.1, mlpY_m: 3.9 })) === JSON.stringify({ x: 2.1, y: 3.9 }));

  return { passed: checks.length, failed: failures.length, failures, checks };
}