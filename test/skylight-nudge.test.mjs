// skylight-nudge.test.mjs
// ---------------------------------------------------------------------------
// Pure-logic tests for the skylight collision geometry and the overhead
// no-go nudge. These do NOT import the base44 client (no browser needed).
//
// Covers:
//   1. skylightRectM centring + default fallback sizing
//   2. rectsIntersect true/false boundaries
//   3. isOverheadRole / isInCeilingSpeaker classification
//   4. skylightClashingSpeakers reports an in-ceiling overlap, ignores LCR
//   5. nudgeOverheadsOutOfSkylights pushes an overlapping overhead out (changed=true)
//   6. Non-overlapping overhead is left in place (changed=false)
//   7. positionSource='user' overhead is respected (never moved)
//   8. LCR speaker overlapping a skylight is never moved
//   9. Nudge clamps to the room interior (skylight near a wall)
// ---------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  skylightRectM,
  rectsIntersect,
  isOverheadRole,
  isInCeilingSpeaker,
  skylightClashingSpeakers,
  nudgeOverheadsOutOfSkylights,
  SKYLIGHT_DEFAULT_LENGTH_M,
  SKYLIGHT_DEFAULT_WIDTH_M,
} from '../src/components/room/rv/utils/skylightGeometry.js';

const DIMS = (w = 0.2, d = 0.2) => ({ widthM: w, depthM: d });
const getModelDimsM = (model) => DIMS();

test('skylightRectM centring + default fallback', () => {
  const el = { type: 'skylight', x_m: 3, y_m: 4, length_m: 2, width_m: 1 };
  const r = skylightRectM(el, { widthM: 6, lengthM: 8 });
  assert.equal(r.x, 2);
  assert.equal(r.y, 3.5);
  assert.equal(r.w, 2);
  assert.equal(r.h, 1);

  // Fallback to room centre + default opening size when fields absent.
  const r2 = skylightRectM({}, { widthM: 6, lengthM: 8 });
  assert.equal(r2.x + r2.w / 2, 3);
  assert.equal(r2.y + r2.h / 2, 4);
  assert.equal(r2.w, SKYLIGHT_DEFAULT_LENGTH_M);
  assert.equal(r2.h, SKYLIGHT_DEFAULT_WIDTH_M);
});

test('rectsIntersect boundaries', () => {
  const a = { x: 0, y: 0, w: 2, h: 2 };
  assert.ok(rectsIntersect(a, { x: 1, y: 1, w: 2, h: 2 }), 'overlapping rects intersect');
  assert.ok(!rectsIntersect(a, { x: 2, y: 0, w: 2, h: 2 }), 'touching edges do not overlap');
  assert.ok(!rectsIntersect(a, { x: 3, y: 3, w: 1, h: 1 }), 'disjoint rects do not intersect');
});

test('isOverheadRole / isInCeilingSpeaker classification', () => {
  assert.ok(isOverheadRole('TFL'));
  assert.ok(isOverheadRole('tmr'));
  assert.ok(!isOverheadRole('L'));
  assert.ok(isInCeilingSpeaker({ role: 'TFL' }, { heightM: 2.4 }));
  assert.ok(!isInCeilingSpeaker({ role: 'L', position: { z: 1.2 } }, { heightM: 2.4 }));
  // High wall-mounted bed channels are excluded; custom ceiling units still use Z.
  assert.ok(!isInCeilingSpeaker({ role: 'L', position: { z: 2.3 } }, { heightM: 2.4 }));
  assert.ok(isInCeilingSpeaker({ role: 'CUSTOM', position: { z: 2.3 } }, { heightM: 2.4 }));
});

test('skylightClashingSpeakers reports in-ceiling overlap, ignores LCR', () => {
  const skylRect = { x: 2, y: 2, w: 2, h: 2 };
  const speakers = [
    { role: 'TFL', model: 'OH', position: { x: 3, y: 3 } },     // inside
    { role: 'L', model: 'LCR', position: { x: 3, y: 3 } },      // inside but not in-ceiling
    { role: 'TFR', model: 'OH', position: { x: 0.5, y: 0.5 } },  // outside
  ];
  const clashes = skylightClashingSpeakers(speakers, skylRect, { heightM: 2.4, getModelDimsM });
  assert.equal(clashes.length, 1);
  assert.equal(clashes[0].speaker.role, 'TFL');
});

test('nudge pushes an overlapping overhead out (changed=true)', () => {
  const skylights = [{ type: 'skylight', x_m: 3, y_m: 3, length_m: 2, width_m: 2 }]; // rect 2..4 x 2..4
  const speakers = [{ id: 'TFL', role: 'TFL', model: 'OH', position: { x: 3, y: 3, z: 2.2 } }];
  const { changed, speakers: next } = nudgeOverheadsOutOfSkylights(speakers, skylights, {
    widthM: 6, lengthM: 6, heightM: 2.4, getModelDimsM,
  });
  assert.ok(changed, 'an overlap should report changed=true');
  const moved = next[0];
  // Speaker half-extent is 0.1; it should be pushed fully outside the opening.
  const skylRect = skylightRectM(skylights[0], { widthM: 6, lengthM: 6 });
  const aabb = { x: moved.position.x - 0.1, y: moved.position.y - 0.1, w: 0.2, h: 0.2 };
  assert.ok(!rectsIntersect(skylRect, aabb), 'nudged speaker AABB no longer overlaps the skylight');
  assert.ok(moved.position.x >= 0 && moved.position.x <= 6, 'stays inside room width');
  assert.ok(moved.position.y >= 0 && moved.position.y <= 6, 'stays inside room length');
});

test('non-overlapping overhead is left in place (changed=false)', () => {
  const skylights = [{ type: 'skylight', x_m: 3, y_m: 3, length_m: 2, width_m: 2 }];
  const speakers = [{ id: 'TFL', role: 'TFL', model: 'OH', position: { x: 0.5, y: 0.5, z: 2.2 } }];
  const { changed, speakers: next } = nudgeOverheadsOutOfSkylights(speakers, skylights, {
    widthM: 6, lengthM: 6, heightM: 2.4, getModelDimsM,
  });
  assert.ok(!changed, 'no overlap should report changed=false');
  assert.equal(next[0].position.x, 0.5);
  assert.equal(next[0].position.y, 0.5);
});

test('positionSource=user overhead is respected (never moved)', () => {
  const skylights = [{ type: 'skylight', x_m: 3, y_m: 3, length_m: 2, width_m: 2 }];
  const speakers = [{ id: 'TFL', role: 'TFL', model: 'OH', positionSource: 'user', position: { x: 3, y: 3, z: 2.2 } }];
  const { changed, speakers: next } = nudgeOverheadsOutOfSkylights(speakers, skylights, {
    widthM: 6, lengthM: 6, heightM: 2.4, getModelDimsM,
  });
  assert.ok(!changed, 'user-locked overhead is not nudged');
  assert.equal(next[0].position.x, 3);
  assert.equal(next[0].position.y, 3);
});

test('LCR speaker overlapping a skylight is never moved', () => {
  const skylights = [{ type: 'skylight', x_m: 3, y_m: 3, length_m: 2, width_m: 2 }];
  const speakers = [{ id: 'L', role: 'L', model: 'LCR', position: { x: 3, y: 3, z: 1.2 } }];
  const { changed, speakers: next } = nudgeOverheadsOutOfSkylights(speakers, skylights, {
    widthM: 6, lengthM: 6, heightM: 2.4, getModelDimsM,
  });
  assert.ok(!changed, 'non-in-ceiling speaker is not nudged');
  assert.equal(next[0].position.x, 3);
  assert.equal(next[0].position.y, 3);
});

test('nudge clamps to room interior when skylight is near a wall', () => {
  // Skylight centred at the back wall edge so the only escape is +Y (downward).
  const skylights = [{ type: 'skylight', x_m: 3, y_m: 0.1, length_m: 2, width_m: 2 }]; // rect x2..4, y -0.9..1.1
  const speakers = [{ id: 'TFL', role: 'TFL', model: 'OH', position: { x: 3, y: 0.1, z: 2.2 } }];
  const { changed, speakers: next } = nudgeOverheadsOutOfSkylights(speakers, skylights, {
    widthM: 6, lengthM: 6, heightM: 2.4, getModelDimsM,
  });
  assert.ok(changed);
  const moved = next[0];
  // Clamped so the cabinet stays inside the room (y >= half-depth 0.1).
  assert.ok(moved.position.y >= 0.1 - 1e-9, 'y clamped to room interior floor');
  assert.ok(moved.position.y <= 6, 'y within room length');
});