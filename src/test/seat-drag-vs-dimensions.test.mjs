// seat-drag-vs-dimensions.test.mjs
// ---------------------------------------------------------------------------
// Dragging the seating block is a drag: it never activates the HUD and never
// activates the Dimensions overlay, in either mode. Information appears only
// after a completed single click on a seat, and it is the active mode's
// information. Classification is by distance travelled, never by time.
//
//   TEST 1  Drag the block in HUD mode          → seats move, nothing opens
//   TEST 2  Drag the block in Dimensions mode   → seats move, no new dimensions
//   TEST 3  Click a seat in HUD mode            → the HUD opens
//   TEST 4  Click a seat in Dimensions mode     → that seat's dimensions
//   TEST 5  Hold a seat stationary              → nothing activated by holding
//   TEST 6  Release after dragging              → no accidental click action
//   TEST 7  No measurement overlay is drawn by a drag
//   TEST 8  The block still moves as one; panning and other objects untouched
// ---------------------------------------------------------------------------
import { test, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import { useSeatGesture, SEAT_DRAG_THRESHOLD_PX } from '../components/room/rv/hooks/useSeatGesture.jsx';

const GESTURE_SRC = fs.readFileSync('src/components/room/rv/hooks/useSeatGesture.jsx', 'utf8');
const RV_SRC = fs.readFileSync('src/components/room/RoomVisualisation.jsx', 'utf8');
const CANVAS_SRC = fs.readFileSync('src/components/room/rv/render/RvPlanCanvas.jsx', 'utf8');
const SEAT_DRAG_SRC = fs.readFileSync('src/components/room/rv/hooks/useSeatDragHandler.jsx', 'utf8');

// The gesture registers plain window pointer listeners, so the interaction model
// is driven end to end here with a listener registry instead of a DOM.
function mountGesture(mode) {
  const listeners = { pointermove: [], pointerup: [], pointercancel: [] };
  globalThis.window = {
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
    removeEventListener: (type, fn) => {
      listeners[type] = (listeners[type] || []).filter((registered) => registered !== fn);
    },
  };

  const calls = { opened: [], dragged: [] };
  let gesture = null;

  function Harness() {
    gesture = useSeatGesture({
      handleMouseDown: (_event, seatId, kind) => calls.dragged.push({ seatId, kind }),
      handleSeatClick: (seat) => calls.opened.push(seat.id),
      mode,
    });
    return null;
  }

  let renderer;
  act(() => { renderer = TestRenderer.create(React.createElement(Harness)); });

  const fire = (type, event = {}) => listeners[type].slice().forEach((fn) => fn(event));
  const press = (seat) => act(() => gesture.seatGesture.onSeatPointerDown({
    pointerType: 'mouse',
    button: 0,
    clientX: 100,
    clientY: 100,
    pointerId: 1,
    preventDefault() {},
    stopPropagation() {},
  }, seat));
  const move = (dx) => act(() => fire('pointermove', { clientX: 100 + dx, clientY: 100 }));
  const release = () => act(() => fire('pointerup'));

  return {
    gesture: () => gesture,
    calls,
    press,
    move,
    release,
    unmount: () => act(() => renderer.unmount()),
  };
}

afterEach(() => {
  delete globalThis.window;
});

test('TEST 1 — dragging the block in HUD mode moves the seats and opens nothing', () => {
  const h = mountGesture('hud');

  h.press({ id: 'seat-a' });
  h.move(SEAT_DRAG_THRESHOLD_PX + 12);

  assert.deepEqual(
    h.calls.dragged,
    [{ seatId: 'seat-a', kind: 'seat' }],
    'movement past the threshold hands the gesture to the seating-block drag'
  );

  h.release();

  assert.deepEqual(h.calls.opened, [], 'a drag never opens the HUD');
  assert.equal(h.gesture().dimensionSeatId, null, 'a drag never activates dimensions');
  h.unmount();
});

test('TEST 2 — dragging the block in Dimensions mode activates no new dimensions', () => {
  const h = mountGesture('dimensions');

  h.press({ id: 'seat-a' });
  h.move(SEAT_DRAG_THRESHOLD_PX + 20);

  assert.equal(h.gesture().dimensionSeatId, null, 'nothing is dimensioned by a drag');

  h.release();

  assert.equal(h.gesture().dimensionSeatId, null, 'and nothing after the release either');
  assert.deepEqual(h.calls.opened, [], 'no HUD in dimensions mode either');
  h.unmount();
});

test('TEST 3 — a completed click in HUD mode opens that seat HUD', () => {
  const h = mountGesture('hud');

  h.press({ id: 'seat-a' });
  h.release();

  assert.deepEqual(h.calls.opened, ['seat-a'], 'the completed click opened the HUD');
  assert.equal(h.gesture().dimensionSeatId, null, 'and no dimensions in HUD mode');
  h.unmount();
});

test('TEST 4 — a completed click in Dimensions mode shows that seat dimensions', () => {
  const h = mountGesture('dimensions');

  h.press({ id: 'seat-a' });
  h.release();

  assert.equal(String(h.gesture().dimensionSeatId), 'seat-a', 'the completed click showed that seat');
  assert.deepEqual(h.calls.opened, [], 'and never the HUD in dimensions mode');
  h.unmount();
});

test('TEST 5 — holding a seat stationary activates nothing; the release is the click', () => {
  const h = mountGesture('dimensions');

  h.press({ id: 'seat-a' });
  // A stationary hold: the pointer never travels past the threshold.
  h.move(0);
  h.move(1);
  h.move(0);

  assert.equal(h.gesture().dimensionSeatId, null, 'holding activates no dimensions');
  assert.deepEqual(h.calls.dragged, [], 'holding is not a drag');
  assert.deepEqual(h.calls.opened, [], 'and it is not a click until the release');

  h.release();

  assert.equal(String(h.gesture().dimensionSeatId), 'seat-a', 'the completed click is what activates it');

  assert.doesNotMatch(GESTURE_SRC, /1500/, 'no 1.5 s dimension timer remains');
  assert.doesNotMatch(GESTURE_SRC, /LONG_PRESS|holdTimer|pressTimer|dimensionTimer/, 'no pointer-hold handler remains');
  assert.match(GESTURE_SRC, /SEAT_DRAG_THRESHOLD_PX/, 'classification is by distance, not by time');
  h.unmount();
});

test('TEST 6 — a release that follows a drag performs no click action', () => {
  const h = mountGesture('hud');

  h.press({ id: 'seat-a' });
  h.move(SEAT_DRAG_THRESHOLD_PX + 30);
  h.release();

  h.press({ id: 'seat-b' });
  h.move(-(SEAT_DRAG_THRESHOLD_PX + 30));
  h.release();

  assert.deepEqual(h.calls.opened, [], 'no part of a drag opened the HUD');
  assert.equal(h.gesture().dimensionSeatId, null, 'and no part of a drag activated dimensions');
  assert.match(GESTURE_SRC, /if \(active\.dragStarted\) return;/, 'the drag suppresses the click on release');
  h.unmount();
});

test('TEST 7 — no measurement overlay is drawn while the block is dragged', () => {
  assert.doesNotMatch(CANVAS_SRC, /seatDragInfo/, 'the seat drag guide is gone from the canvas');
  assert.doesNotMatch(RV_SRC, /seatDragInfo|setSeatDragInfo/, 'its state and effect are gone too');
  assert.doesNotMatch(
    CANVAS_SRC,
    /dragType === 'seat'[\s\S]{0,120}RvMlpDragDims/,
    'a seat drag renders no dimension guide at all'
  );

  // The Dimensions overlay remains a click result: Dimensions mode, no drag live.
  assert.match(CANVAS_SRC, /\{dragType !== 'seat' && seatDimensions\?\.visible && \(/, 'dimensions are hidden while a drag is live');
  assert.match(RV_SRC, /seatInfoMode !== 'dimensions' \|\| !dimensionSeatId/, 'seat dimensions come only from a click in Dimensions mode');
});

test('TEST 8 — the block still moves as one, and panning and other objects are untouched', () => {
  assert.match(SEAT_DRAG_SRC, /baselineYById/, 'the drag keeps its frozen baseline');
  assert.match(SEAT_DRAG_SRC, /draftSeatsRef\.current = draftSeatsRef\.current\.map/, 'and moves every seat in the block');
  assert.match(RV_SRC, /mode: seatInfoMode/, 'the HUD / Dimensions toggle still drives the gesture');

  assert.match(RV_SRC, /useRvPlanPan\(/, 'canvas panning is untouched');
  assert.match(RV_SRC, /if \(consumePanClick\(\)\) return;/, 'and a pan still never clears the inspection');
  assert.match(CANVAS_SRC, /onPanPointerDown=\{onPanPointerDown\}/, 'the pan surface is still wired to the canvas');
});