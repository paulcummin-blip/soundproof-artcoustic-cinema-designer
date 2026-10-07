// plan-canvas-panning.test.mjs
// ---------------------------------------------------------------------------
// Plan View canvas panning: dragging empty space repositions the whole drawing,
// dragging an object still moves that object, and clicking a seat still opens
// its information. Panning is viewport-only.
//
//   TEST 1  Drag empty canvas space            → the whole drawing pans
//   TEST 2  Drag a seat / speaker / sub        → object gesture keeps priority
//   TEST 3  Click a seat                       → HUD / Dimensions gesture intact
//   TEST 4  Click without movement             → not a drag, no viewport change
//   TEST 5  Pan at any zoom level              → one screen-space offset
//   TEST 6  Pan repeatedly                     → no jump, no reset, no dismissal
//   TEST 7  Save and reopen                    → panning is never persisted
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { useRvPlanPan } from '../components/room/rv/hooks/useRvPlanPan.jsx';
import { PAN_CLICK_SLOP_PX } from '../components/room/rv/hooks/usePanZoomHandlers.jsx';
import { rvZoomTransform } from '../components/room/rv/utils/rvPointerToRoom.js';
import { setMlpGrab } from '../components/state/mlpGrabStore.js';

const RV_SRC = fs.readFileSync('src/components/room/RoomVisualisation.jsx', 'utf8');
const PAN_SRC = fs.readFileSync('src/components/room/rv/hooks/useRvPlanPan.jsx', 'utf8');
const PAN_HOOK_SRC = fs.readFileSync('src/components/room/rv/hooks/usePanZoomHandlers.jsx', 'utf8');
const ZOOM_GROUP_SRC = fs.readFileSync('src/components/room/rv/render/RvZoomGroup.jsx', 'utf8');
const SEAT_LAYER_SRC = fs.readFileSync('src/components/room/rv/render/RvSeatLayer.jsx', 'utf8');
const GRID_SRC = fs.readFileSync('src/components/room/rv/render/RvGridLayer.jsx', 'utf8');
const BASE_LAYERS_SRC = fs.readFileSync('src/components/room/rv/render/RvRoomBaseLayers.jsx', 'utf8');
const SERIALISE_SRC = fs.readFileSync('src/components/utils/serializeProject.jsx', 'utf8');

// Drives the pan gesture exactly as the plan canvas does, without a browser.
// The hook is rendered once so its callbacks exist, then the gesture is replayed
// against them and every viewport write is recorded.
function panHarness({ offset = { x: 0, y: 0 }, dragging = false, speakerDrag = false } = {}) {
  const isDraggingSpeakerRef = { current: speakerDrag };
  const written = [];
  let api = null;

  function Harness() {
    api = useRvPlanPan({
      viewOffsetPx: offset,
      setViewOffsetPx: (next) => written.push(next),
      isDraggingSpeakerRef,
      dragging,
    });
    return null;
  }

  renderToStaticMarkup(React.createElement(Harness));
  return { api, written };
}

// A press on the pan surface: the event's target IS the surface (the guard that
// keeps object gestures out of panning passes exactly here).
const pointerDown = (x, y) => {
  const surface = {};
  return {
    clientX: x,
    clientY: y,
    button: 0,
    pointerId: 1,
    currentTarget: surface,
    target: surface,
  };
};

// A press on an interactive object: the event target is a child of the surface.
const objectPointerDown = (x, y) => ({ ...pointerDown(x, y), target: {} });

test('TEST 1 — dragging empty canvas space pans the whole drawing', () => {
  const { api, written } = panHarness();

  api.onPanPointerDown(pointerDown(200, 150));
  api.onPanPointerMove(pointerDown(260, 190));

  assert.deepEqual(written, [{ x: 60, y: 40 }], 'the drawing follows the pointer 1:1');
  assert.doesNotMatch(PAN_SRC, /zoom <= 1/, 'panning is not gated on the zoom level');
  assert.doesNotMatch(PAN_HOOK_SRC, /zoom > 1/, 'the pan hook has no zoom gate');
  assert.match(RV_SRC, /useRvPlanPan\(/, 'the plan uses the one pan authority');
});

test('TEST 2 — an object drag keeps priority over panning', () => {
  // The pan surface is the first child of the zoom group, so it is only ever the
  // hit element where no object sits above it.
  const surface = ZOOM_GROUP_SRC.indexOf('Background hit area for pan');
  const children = ZOOM_GROUP_SRC.indexOf('{children}');
  assert.ok(surface > 0 && children > surface, 'the pan surface stays behind every layer');

  const speakerDrag = panHarness({ speakerDrag: true });
  speakerDrag.api.onPanPointerDown(pointerDown(10, 10));
  speakerDrag.api.onPanPointerMove(pointerDown(90, 90));
  assert.deepEqual(speakerDrag.written, [], 'a live speaker/sub drag is never a pan');

  const seatDrag = panHarness({ dragging: true });
  seatDrag.api.onPanPointerDown(pointerDown(10, 10));
  seatDrag.api.onPanPointerMove(pointerDown(90, 90));
  assert.deepEqual(seatDrag.written, [], 'a live plan gesture is never a pan');
});

test('TEST 3 — a seat click keeps its HUD / Dimensions gesture', () => {
  assert.match(RV_SRC, /seatGesture=\{seatGesture\}/, 'the seat gesture layer is still wired');
  assert.match(SEAT_LAYER_SRC, /onSeatPointerDown/, 'the seat still owns its pointerdown');

  // A pan can only begin on the pan surface itself, so a press on a seat, a
  // speaker or the RSP marker never starts one.
  assert.match(PAN_SRC, /if \(e\.currentTarget !== e\.target\) return;/);
  const onObject = panHarness();
  onObject.api.onPanPointerDown(objectPointerDown(120, 120));
  onObject.api.onPanPointerMove(pointerDown(200, 200));
  assert.deepEqual(onObject.written, [], 'a press on an object is not a pan');
});

test('TEST 4 — a click without meaningful movement is not a drag', () => {
  const { api, written } = panHarness();

  api.onPanPointerDown(pointerDown(300, 300));
  api.onPanPointerUp(pointerDown(300, 300));

  assert.deepEqual(written, [], 'no movement, no viewport change');
  assert.equal(api.consumePanClick(), false, 'a click stays a click, so the plan may clear the pin');
});

test('TEST 5 — panning works at any zoom level and combines with zoom', () => {
  const { api, written } = panHarness({ offset: { x: 40, y: -12 } });

  api.onPanPointerDown(pointerDown(10, 10));
  api.onPanPointerMove(pointerDown(40, 30));

  assert.deepEqual(written, [{ x: 70, y: 8 }], 'a pan is a screen-space offset, identical at 1x and 4x');

  assert.equal(
    rvZoomTransform({ panX: 15, panY: -5, viewOffsetPx: { x: 70, y: 8 }, zoom: 4 }),
    'translate(85, 3) scale(4)',
    'the pan offsets the one zoom transform on top of the zoom pan'
  );
  assert.equal(
    rvZoomTransform({ panX: 0, panY: 0, viewOffsetPx: { x: 70, y: 8 }, zoom: 1 }),
    'translate(70, 8) scale(1)',
    'and at the fitted view the pan is the whole offset'
  );
});

test('TEST 6 — repeated pans never jump, reset or drop the inspection', () => {
  const first = panHarness({ offset: { x: 30, y: 20 } });
  first.api.onPanPointerDown(pointerDown(100, 100));
  first.api.onPanPointerMove(pointerDown(120, 140));
  assert.deepEqual(first.written, [{ x: 50, y: 60 }]);
  assert.equal(first.api.consumePanClick(), true, 'a pan is consumed as a pan, not a click');

  first.api.onPanPointerUp(pointerDown(120, 140));
  first.api.onPanPointerMove(pointerDown(400, 400));
  assert.equal(first.written.length, 1, 'releasing the pointer stops the pan');

  // After the view is reset elsewhere, the next pan starts from the offset on
  // screen, so it cannot jump back to the previous gesture's total.
  const afterReset = panHarness({ offset: { x: 0, y: 0 } });
  afterReset.api.onPanPointerDown(pointerDown(500, 400));
  afterReset.api.onPanPointerMove(pointerDown(508, 400));
  assert.deepEqual(afterReset.written, [{ x: 8, y: 0 }], 'a small pan moves a small amount');

  // And the pan must not be read as a background click, which would clear the
  // pinned HUD and the active seat.
  assert.match(RV_SRC, /if \(consumePanClick\(\)\) return;/, 'a pan never dismisses the inspection');
  assert.ok(PAN_CLICK_SLOP_PX >= 2 && PAN_CLICK_SLOP_PX <= 6, 'a click slop is used to tell a pan from a click');
});

test('RSP placement mode owns the plan while it is active', () => {
  setMlpGrab(true);
  try {
    const grabbed = panHarness();
    grabbed.api.onPanPointerDown(pointerDown(10, 10));
    grabbed.api.onPanPointerMove(pointerDown(80, 80));
    assert.deepEqual(grabbed.written, [], 'placing the RSP is never a pan');
  } finally {
    setMlpGrab(false);
  }
});

test('cursor — grab over the pan surface, grabbing while it moves', () => {
  assert.match(ZOOM_GROUP_SRC, /pointerEvents="auto"/, 'the pan surface is always interactive');
  assert.match(ZOOM_GROUP_SRC, /cursor: isPanning \? "grabbing" : "grab"/);
  assert.match(RV_SRC, /isPanning=\{isPanning\}/, 'the cursor follows the live pan gesture');
});

test('empty space stays pannable across the plan chrome', () => {
  assert.match(GRID_SRC, /data-layer="grid" pointerEvents="none"/, 'grid lines never block a pan');
  assert.match(BASE_LAYERS_SRC, /data-layer="room-dimensions" pointerEvents="none"/, 'dimension lines never block a pan');
  assert.match(BASE_LAYERS_SRC, /strokeWidth=\{2\}\s+pointerEvents="none"/, 'the wall outline never blocks a pan');
});

test('TEST 7 — panning changes the viewport only, never the project', () => {
  assert.match(PAN_HOOK_SRC, /setViewOffsetPx\(/, 'the pan writes the viewport offset');
  assert.doesNotMatch(PAN_HOOK_SRC, /roomRect|widthM|entities\.|setDragState|onSetSpeakers/, 'no geometry or project write');
  assert.doesNotMatch(PAN_SRC, /roomRect|widthM|entities\.|onSetSpeakers/, 'the pan gesture never touches the design');
  assert.doesNotMatch(SERIALISE_SRC, /viewOffsetPx/, 'the viewport offset is never saved with the design');
});