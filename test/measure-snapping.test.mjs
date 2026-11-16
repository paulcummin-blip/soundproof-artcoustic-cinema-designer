// measure-snapping.test.mjs
// Unit tests for the Plan View Measure tool snapping helpers.
import assert from 'node:assert';
import {
  buildSnapReferences,
  findSnap,
  elementPlanRectM,
  distToSegment,
  SNAP_TOLERANCE_M,
} from '../src/components/room/rv/utils/measureSnapping.js';

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.error('FAIL:', name); } };

// --- distToSegment ---
{
  const r = distToSegment(5, 0, 0, 0, 10, 0);
  ok('distToSegment on-segment', Math.abs(r.dist - 0) < 1e-9 && r.point.x === 5 && r.point.y === 0);
  const r2 = distToSegment(5, 3, 0, 0, 10, 0);
  ok('distToSegment off-segment', Math.abs(r2.dist - 3) < 1e-9);
  const r3 = distToSegment(15, 0, 0, 0, 10, 0);
  ok('distToSegment clamps to endpoint', Math.abs(r3.dist - 5) < 1e-9 && r3.point.x === 10);
}

// --- buildSnapReferences: walls and corners ---
{
  const refs = buildSnapReferences({ widthM: 6, lengthM: 8, speakers: [], seats: [], elementRects: [] });
  ok('4 wall segments', refs.segments.filter(s => s.kind === 'wall').length === 4);
  ok('4 corners', refs.points.filter(p => p.kind === 'corner').length === 4);
  ok('corner (0,0)', refs.points.some(p => p.x === 0 && p.y === 0 && p.kind === 'corner'));
  ok('corner (6,8)', refs.points.some(p => p.x === 6 && p.y === 8 && p.kind === 'corner'));
}

// --- buildSnapReferences: speakers and seats ---
{
  const refs = buildSnapReferences({
    widthM: 6, lengthM: 8,
    speakers: [{ position: { x: 1.5, y: 4 } }, { position: {} }, { position: { x: 3, y: 2 } }],
    seats: [{ x: 2, y: 5 }, { position: { x: 4, y: 6 } }, { x: 'bad', y: 5 }],
    elementRects: [],
  });
  ok('2 valid speakers', refs.points.filter(p => p.kind === 'speaker').length === 2);
  ok('2 valid seats', refs.points.filter(p => p.kind === 'seat').length === 2);
  ok('speaker point', refs.points.some(p => p.x === 1.5 && p.y === 4 && p.kind === 'speaker'));
  ok('seat point alt shape', refs.points.some(p => p.x === 4 && p.y === 6 && p.kind === 'seat'));
}

// --- elementPlanRectM: skylight ---
{
  const r = elementPlanRectM({ type: 'skylight', x_m: 3, y_m: 4, length_m: 2, width_m: 1.5 }, { widthM: 6, lengthM: 8 });
  ok('skylight rect', r.x === 2 && r.y === 3.25 && r.w === 2 && r.h === 1.5);
}

// --- elementPlanRectM: front wall door ---
{
  const r = elementPlanRectM({ type: 'door', wall: 'front', x_position: 0.5, width: 0.9, thickness_m: 0.05 }, { widthM: 6, lengthM: 8 });
  ok('front door rect', r.x === 3 && r.y === 0 && r.w === 0.9 && r.h === 0.05);
}

// --- elementPlanRectM: left wall window ---
{
  const r = elementPlanRectM({ type: 'window', wall: 'left', y_position: 0.5, width: 1.2, thickness_m: 0.04 }, { widthM: 6, lengthM: 8 });
  ok('left window rect', r.x === 0 && r.y === 4 && r.w === 0.04 && r.h === 1.2);
}

// --- elementPlanRectM: projector returns null ---
{
  ok('projector null', elementPlanRectM({ type: 'projector' }, { widthM: 6, lengthM: 8 }) === null);
}

// --- elementRects produce edges + corners ---
{
  const refs = buildSnapReferences({
    widthM: 6, lengthM: 8, speakers: [], seats: [],
    elementRects: [{ x: 1, y: 1, w: 2, h: 1 }],
  });
  ok('4 element corners', refs.points.filter(p => p.kind === 'element').length === 4);
  ok('4 element edges', refs.segments.filter(s => s.kind === 'element').length === 4);
}

// --- findSnap: wall line nearest point ---
{
  const refs = buildSnapReferences({ widthM: 6, lengthM: 8, speakers: [], seats: [], elementRects: [] });
  const snap = findSnap({ x: 3, y: 0.03 }, refs);
  ok('snap to front wall', snap && snap.point.x === 3 && snap.point.y === 0 && snap.kind === 'wall');
}

// --- findSnap: corner exact ---
{
  const refs = buildSnapReferences({ widthM: 6, lengthM: 8, speakers: [], seats: [], elementRects: [] });
  const snap = findSnap({ x: 0.02, y: 0.02 }, refs);
  ok('snap to corner', snap && snap.point.x === 0 && snap.point.y === 0 && snap.kind === 'corner');
}

// --- findSnap: speaker centre ---
{
  const refs = buildSnapReferences({
    widthM: 6, lengthM: 8,
    speakers: [{ position: { x: 2, y: 4 } }],
    seats: [], elementRects: [],
  });
  const snap = findSnap({ x: 2.03, y: 4 }, refs);
  ok('snap to speaker centre', snap && snap.point.x === 2 && snap.point.y === 4 && snap.kind === 'speaker');
}

// --- findSnap: seat head centre ---
{
  const refs = buildSnapReferences({
    widthM: 6, lengthM: 8, speakers: [],
    seats: [{ x: 3, y: 5 }], elementRects: [],
  });
  const snap = findSnap({ x: 3, y: 5.04 }, refs);
  ok('snap to seat centre', snap && snap.point.x === 3 && snap.point.y === 5 && snap.kind === 'seat');
}

// --- findSnap: skylight edge ---
{
  const skylRect = elementPlanRectM({ type: 'skylight', x_m: 3, y_m: 4, length_m: 2, width_m: 1.5 }, { widthM: 6, lengthM: 8 });
  const refs = buildSnapReferences({ widthM: 6, lengthM: 8, speakers: [], seats: [], elementRects: [skylRect] });
  const snap = findSnap({ x: 3, y: 3.27 }, refs);
  ok('snap to skylight edge', snap && snap.kind === 'element' && snap.point.y === skylRect.y);
}

// --- findSnap: door edge (front wall door top edge) ---
{
  const doorRect = elementPlanRectM({ type: 'door', wall: 'front', x_position: 0.5, width: 0.9, thickness_m: 0.05 }, { widthM: 6, lengthM: 8 });
  const refs = buildSnapReferences({ widthM: 6, lengthM: 8, speakers: [], seats: [], elementRects: [doorRect] });
  const snap = findSnap({ x: 3.4, y: 0.03 }, refs);
  ok('snap to door edge', snap && snap.kind === 'element');
}

// --- findSnap: free placement outside tolerance returns null ---
{
  const refs = buildSnapReferences({ widthM: 6, lengthM: 8, speakers: [], seats: [], elementRects: [] });
  ok('free placement null', findSnap({ x: 3, y: 4 }, refs) === null);
}

// --- findSnap: picks nearest when multiple within tolerance ---
{
  const refs = buildSnapReferences({
    widthM: 6, lengthM: 8,
    speakers: [{ position: { x: 3, y: 0.04 } }],
    seats: [], elementRects: [],
  });
  const snap = findSnap({ x: 3, y: 0.02 }, refs);
  ok('nearest wins', snap && snap.kind === 'speaker');
}

// --- findSnap: tolerance is 0.05 m ---
{
  ok('tolerance is 0.05', SNAP_TOLERANCE_M === 0.05);
}

// --- element edge snap: nearest point along line, not just corners ---
{
  const refs = buildSnapReferences({
    widthM: 6, lengthM: 8, speakers: [], seats: [],
    elementRects: [{ x: 1, y: 1, w: 4, h: 1 }],
  });
  const snap = findSnap({ x: 3, y: 0.97 }, refs);
  ok('edge nearest point', snap && snap.point.x === 3 && snap.point.y === 1 && snap.kind === 'element');
}

// --- invalid inputs ---
{
  ok('null point', findSnap(null, { points: [], segments: [] }) === null);
  ok('null refs', findSnap({ x: 1, y: 1 }, null) === null);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);