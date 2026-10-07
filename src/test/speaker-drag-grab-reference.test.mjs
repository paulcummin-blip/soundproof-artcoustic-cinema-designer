// speaker-drag-grab-reference.test.mjs
// ---------------------------------------------------------------------------
// Plan View speaker dragging: the grab offset is taken from the speaker's DRAWN
// centre, so the icon stays under the pointer from the first frame and holds the
// designer's grab point throughout the drag. Wall-mounted roles draw at a
// derived position, so the drawn centre — not the stored anchor — is the
// reference for both rendering and the drag start.
//
//   TEST 1  Drawn centre is the drag reference      → no jump at grab
//   TEST 2  Grab offset preserved off-centre        → identity under the pointer
//   TEST 3  Old reference would jump                → the defect is real
//   TEST 4  Overheads / subwoofers                  → draw at the stored position
//   TEST 5  Coordinate conversion untouched         → pan and zoom applied once
//   TEST 6  Constraints preserved                   → wall helpers still authoritative
//   TEST 7  Pointer capture                         → pointer events, capture guarded
//   TEST 8  Canvas panning untouched                → one pan authority
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { sideWallX, rearWallY, xHalfExtentM } from '../components/room/rv/utils/rvGeometry.jsx';
import {
  captureDragOffsetRoom,
  computeDragTargetRoom,
  rvZoomTransform,
} from '../components/room/rv/utils/rvPointerToRoom.js';

const src = (p) => fs.readFileSync(p, 'utf8');

const SPEAKER_LAYER_SRC = src('src/components/room/rv/render/RvSpeakerLayer.jsx');
const SPEAKER_ICON_SRC = src('src/components/room/rv/RenderPrimitives.jsx');
const MOUSE_DOWN_SRC = src('src/components/room/rv/hooks/useMouseDownHandler.jsx');
const MOUSE_MOVE_SRC = src('src/components/room/rv/hooks/useRoomCanvasMouseMove.jsx');
const MOUSE_UP_SRC = src('src/components/room/rv/hooks/useMouseUpHandler.jsx');
const OVERHEAD_ICONS_SRC = src('src/components/room/rv/hooks/useOverheadIconElements.jsx');
const SUBS_SRC = src('src/components/room/rv/render/RvRenderSubwoofers.jsx');
const PLAN_SRC = src('src/components/room/rv/render/RvPlanCanvas.jsx');
const PAN_SRC = src('src/components/room/rv/hooks/useRvPlanPan.jsx');
const PAN_HOOK_SRC = src('src/components/room/rv/hooks/usePanZoomHandlers.jsx');
const ROOM_VIS_SRC = src('src/components/room/RoomVisualisation.jsx');

const DIMS = { depthM: 0.082, widthM: 0.27 };
const W = 4.5;
const L = 6.0;

// TEST 1 — The renderer hands its own drawn centre to the drag start, so the
// reference cannot disagree with what is on screen.
test('the drag reference is the drawn centre', () => {
  assert.ok(
    /bedLayerSpeakerMouseDownHandler\(e, speaker\.id, \{ x: renderX, y: renderY \}\)/.test(SPEAKER_LAYER_SRC),
    'RvSpeakerLayer must pass the rendered centre to the drag start',
  );
  assert.ok(
    /const grabReference = \(displayCentre[\s\S]*?\)\s*\n\s*\? displayCentre\s*\n\s*: target\.position;/.test(MOUSE_DOWN_SRC),
    'the drag start must take its offset from the drawn centre it was given',
  );
  assert.ok(
    /bedLayerSpeakerMouseDownHandler\(e, id, displayCentre\)/.test(ROOM_VIS_SRC),
    'the plan must forward the drawn centre through the shared speaker handler',
  );
});

// TEST 2 — The relative grab point is preserved exactly, including an off-centre
// grab: the drawn centre lands under the pointer plus the captured offset.
test('grab offset is preserved, including an off-centre grab', () => {
  const drawn = { x: sideWallX(W, DIMS, 'L', 90), y: 3.6 };

  // Grabbed 6 cm off the icon centre, in both axes.
  const pointerAtGrab = { x: drawn.x + 0.06, y: drawn.y - 0.06 };

  const offset = captureDragOffsetRoom({ pointerRoom: pointerAtGrab, objectRoom: drawn });
  assert.ok(Math.abs(offset.x + 0.06) < 1e-9);
  assert.ok(Math.abs(offset.y - 0.06) < 1e-9);

  // The first drag frame: the pointer has not moved, so the target centre must
  // still be the drawn centre — no jump.
  const firstFrame = computeDragTargetRoom({ pointerRoom: pointerAtGrab, dragOffsetRoom: offset });
  assert.ok(Math.abs(firstFrame.x - drawn.x) < 1e-9);
  assert.ok(Math.abs(firstFrame.y - drawn.y) < 1e-9);

  // And after moving the pointer, the object follows by exactly that movement.
  const moved = { x: pointerAtGrab.x + 0.25, y: pointerAtGrab.y + 0.40 };
  const target = computeDragTargetRoom({ pointerRoom: moved, dragOffsetRoom: offset });
  assert.ok(Math.abs((target.x - drawn.x) - 0.25) < 1e-9);
  assert.ok(Math.abs((target.y - drawn.y) - 0.40) < 1e-9);
});

// TEST 3 — The defect is real: taking the offset from the stored anchor instead
// of the drawn centre displaces the icon at the moment of the grab.
test('anchoring the offset on the stored position would jump', () => {
  const drawn = { x: sideWallX(W, DIMS, 'L', 90), y: 3.6 };
  const storedAnchor = { x: 0.30, y: 3.6 }; // the stored anchor, not the drawn centre
  const pointerAtGrab = { x: drawn.x + 0.06, y: drawn.y - 0.06 };

  const wrongOffset = captureDragOffsetRoom({ pointerRoom: pointerAtGrab, objectRoom: storedAnchor });
  const firstFrame = computeDragTargetRoom({ pointerRoom: pointerAtGrab, dragOffsetRoom: wrongOffset });

  const jumpM = Math.abs(firstFrame.x - drawn.x);
  assert.ok(jumpM > 0.2, `the stored-anchor reference jumps by ${jumpM.toFixed(3)} m`);
  assert.ok(Math.abs(firstFrame.y - drawn.y) < 1e-9, 'the free axis is unaffected');
});

// TEST 4 — Overheads and subwoofers are drawn at their stored position, so the
// fallback is already the drawn centre for them. Their implementations are
// otherwise unchanged.
test('overheads and subwoofers draw at the stored position', () => {
  assert.ok(
    /const \[xPx, yPx\] = toPx\(spk\.position\.x, spk\.position\.y\);/.test(OVERHEAD_ICONS_SRC),
    'an overhead icon is drawn at its stored position',
  );
  assert.ok(
    !/bedLayerSpeakerMouseDownHandler\(e, [^,]+, \{/.test(OVERHEAD_ICONS_SRC),
    'overheads must not be given a derived centre they do not have',
  );
  assert.ok(
    /const \[cx, cy\] = toPx\(sub\.position\.x, sub\.position\.y\);/.test(SUBS_SRC),
    'a subwoofer is drawn at its stored position',
  );
  assert.ok(
    /handleMouseDown\(e, subId, 'sub'\)/.test(SUBS_SRC),
    'the subwoofer drag start is unchanged',
  );
  // Rear-wall alignment for a sub remains the solver's job, not the drag start.
  assert.ok(
    /_yIsPinned \? 0 : \(clickedDraftSub\.position\.y - cursorRoom\.y\)/.test(MOUSE_DOWN_SRC),
    'subwoofer pinned-wall offset rules are unchanged',
  );
});

// TEST 5 — The conversion is untouched: the offset is applied exactly once, and
// the pan/zoom transform is expressed once.
test('coordinate conversion is unchanged', () => {
  assert.ok(
    /const targetRoomPos = computeDragTargetRoom\(\{/.test(MOUSE_MOVE_SRC),
    'the offset must be applied in one place',
  );
  assert.equal(
    (MOUSE_MOVE_SRC.match(/computeDragTargetRoom\(/g) || []).length,
    1,
    'the offset must not be applied twice on the move path',
  );
  assert.ok(
    /handleSubDrag\(draggedItemId, targetRoomPos\)/.test(MOUSE_MOVE_SRC),
    'subwoofers keep taking room metres with the offset already applied',
  );
  assert.equal(
    rvZoomTransform({ panX: 10, panY: 20, viewOffsetPx: { x: 5, y: -5 }, zoom: 2 }),
    'translate(15, 15) scale(2)',
  );
});

// TEST 6 — Constraints stay authoritative: the wall helpers still drive the
// rendering, and the drag solver is untouched.
test('placement constraints are preserved', () => {
  const left = sideWallX(W, DIMS, 'L', 90);
  const right = sideWallX(W, DIMS, 'R', 90);
  assert.ok(Math.abs(left - (xHalfExtentM(DIMS.depthM, DIMS.widthM, 90) + 0.01)) < 1e-9);
  assert.ok(Math.abs(right - (W - left)) < 1e-9);
  assert.ok(rearWallY(L, DIMS, 180) < L);

  assert.ok(/renderX = sideWallX\(/.test(SPEAKER_LAYER_SRC), 'side-wall placement still authoritative');
  assert.ok(/renderY = rearWallY\(/.test(SPEAKER_LAYER_SRC), 'rear-wall placement still authoritative');
  assert.ok(/FRONT_WALL_GAP_M/.test(SPEAKER_LAYER_SRC), 'front-wall placement still authoritative');
  assert.ok(
    /solveSpeakerDragConstraints/.test(src('src/components/room/rv/hooks/useSpeakerDragUpdate.jsx')),
    'the drag constraint solver is unchanged',
  );
  assert.ok(/overheadZones\?\.status === 'ok'/.test(MOUSE_UP_SRC), 'overhead release constraints unchanged');
  assert.ok(/canonicalRole === 'LW' \|\| canonicalRole === 'RW'/.test(MOUSE_UP_SRC), 'front-wide release constraint unchanged');
});

// TEST 7 — The icon is a pointer-down target so pointerId exists, and the
// capture call is guarded on it.
test('pointer capture is effective and guarded', () => {
  assert.equal(
    (SPEAKER_ICON_SRC.match(/onPointerDown=\{handleMouseDown\}/g) || []).length,
    2,
    'both speaker icon shapes must take the pointer down',
  );
  assert.ok(
    !/onMouseDown=\{handleMouseDown\}/.test(SPEAKER_ICON_SRC),
    'no mouse-down-only path may remain on the speaker icon',
  );
  assert.ok(
    /e\.pointerId != null/.test(MOUSE_DOWN_SRC),
    'the capture must be guarded on a real pointer id',
  );
  assert.ok(
    /setPointerCapture\(e\.pointerId\)/.test(MOUSE_DOWN_SRC),
    'the icon keeps the pointer for the whole gesture',
  );
  // The plan canvas owns move and release, and the icon is inside it, so the
  // captured compatibility events still reach it by bubbling.
  assert.ok(/onMouseMove=\{handleMouseMove\}/.test(PLAN_SRC));
  assert.ok(/onMouseUp=\{handleMouseUp\}/.test(PLAN_SRC));
});

// TEST 8 — The working canvas panning is untouched.
test('canvas panning is untouched', () => {
  assert.ok(/onPanPointerDown/.test(PAN_SRC) && /isDraggingSpeakerRef\.current\) return/.test(PAN_SRC));
  assert.ok(/panMovedRef/.test(PAN_SRC), 'pan click suppression unchanged');
  assert.ok(/PAN_CLICK_SLOP_PX/.test(PAN_HOOK_SRC), 'one pan authority');
  assert.ok(
    /onPointerDown=\{onPanPointerDown\}/.test(src('src/components/room/rv/render/RvZoomGroup.jsx')),
    'the pan surface is unchanged',
  );
});