//
// Room Designer seat HUD — a drag's release is not a click-away.
//
// The defect: clicking a seat pinned its HUD, but dragging that selected seat
// and releasing it closed the HUD. The browser dispatches a click after every
// release, and the plan's background click handler — the one thing that dismisses
// the HUD and clears the active seat — read that click as a click-away on empty
// plan. It was worst when the seat was released outside its original seating
// block, because the release then landed away from the seat's own element.
//
// The authority under test: the seat gesture records whether its own pointer
// gesture became a drag, and the plan consumes that one release before it
// dismisses anything. A drag moves seats; it never changes selection.
//
// Covered here:
//   1. a plain click is not a drag — the release still reaches the plan;
//   2. a drag's release is consumed exactly once, so the HUD survives the drag
//      and a later genuine background click still closes it;
//   3. a drag never also activates seat inspection;
//   4. a fresh seat gesture starts clean, so a suppression can never linger;
//   5. the plan consumes the release before it dismisses the HUD or clears the
//      active seat, and holds the authority in its dependency array.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useSeatGesture, SEAT_DRAG_THRESHOLD_PX } from '../components/room/rv/hooks/useSeatGesture.jsx';

// ── Window stub: the gesture hook listens on window for the gesture's life ────
const listeners = new Map();
const fire = (type, event) => {
  [...(listeners.get(type) || [])].forEach((fn) => fn(event));
};

globalThis.window = {
  addEventListener(type, fn) {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(fn);
  },
  removeEventListener(type, fn) {
    const list = listeners.get(type) || [];
    const index = list.indexOf(fn);
    if (index >= 0) list.splice(index, 1);
  },
};

const SEAT = { id: 'row1-seat3', x: 1.4, y: 2.6 };

const event = (overrides = {}) => ({
  isPrimary: true,
  button: 0,
  buttons: 1,
  pointerId: 7,
  pointerType: 'mouse',
  clientX: 100,
  clientY: 100,
  preventDefault() {},
  stopPropagation() {},
  currentTarget: {},
  ...overrides,
});

function harness() {
  const calls = { mouseDown: [], mouseMove: 0, mouseUp: 0, seatClick: [] };
  let api = null;

  function Harness() {
    api = useSeatGesture({
      handleMouseDown: (e, id, type) => calls.mouseDown.push({ id, type }),
      handleMouseMove: () => { calls.mouseMove += 1; },
      handleMouseUp: () => { calls.mouseUp += 1; },
      handleSeatClick: (seat) => calls.seatClick.push(seat?.id),
    });
    return null;
  }

  renderToStaticMarkup(React.createElement(Harness));
  assert.ok(api, 'the seat gesture hook must expose its authority');
  return { api, calls };
}

// The release moves the pointer well past the drag threshold, in the direction
// the seats are dragged. Distance — never elapsed time — decides drag vs click.
const DRAGGED = { clientX: 100 + SEAT_DRAG_THRESHOLD_PX + 40 };

test('a plain seat click is not a drag, so its release still reaches the plan', () => {
  const { api, calls } = harness();

  api.seatGesture.onSeatPointerDown(event(), SEAT);
  fire('pointerup', event());

  assert.equal(
    api.seatGesture.consumeDragClick(),
    false,
    'a gesture that never moved a seat must not suppress the plan click'
  );
  assert.deepEqual(calls.seatClick, [SEAT.id], 'a click opens or switches that seat');
  assert.equal(calls.mouseUp, 0, 'a click is not a seat move');
});

test('a dragged seat consumes its release once, so the HUD survives and a later click still closes it', () => {
  const { api, calls } = harness();

  api.seatGesture.onSeatPointerDown(event(), SEAT);
  fire('pointermove', event(DRAGGED));
  fire('pointerup', event(DRAGGED));

  assert.equal(calls.mouseUp, 1, 'the release completes the seat move');
  assert.equal(api.seatGesture.consumeDragClick(), true, 'the plan must treat this release as a drag, not a click-away');
  assert.equal(api.seatGesture.consumeDragClick(), false, 'and only once — a later genuine background click closes the HUD');
});

test('dragging a seat never also activates seat inspection', () => {
  const { api, calls } = harness();

  api.seatGesture.onSeatPointerDown(event(), SEAT);
  fire('pointermove', event(DRAGGED));
  fire('pointerup', event(DRAGGED));

  assert.deepEqual(calls.seatClick, [], 'a drag must not open or move the HUD as if it were a click');
  assert.deepEqual(calls.mouseDown, [{ id: SEAT.id, type: 'seat' }], 'the drag moves the seat through the shared pointer path');
});

test('a fresh seat gesture starts clean, so a suppression can never linger', () => {
  const { api } = harness();

  api.seatGesture.onSeatPointerDown(event(), SEAT);
  fire('pointermove', event(DRAGGED));
  fire('pointerup', event(DRAGGED));
  // The release's click never reached the plan handler, so the flag is still set.

  api.seatGesture.onSeatPointerDown(event(), SEAT);
  assert.equal(api.seatGesture.consumeDragClick(), false, 'the next seat gesture must not inherit the previous drag');
});

test('the plan consumes a seat drag release before it dismisses the HUD or clears the active seat', () => {
  const source = readFileSync(new URL('../components/room/RoomVisualisation.jsx', import.meta.url), 'utf8');
  const handlerStart = source.indexOf('const handlePlanClickWithSelection = useCallback');
  assert.ok(handlerStart >= 0, 'the plan click handler must exist');

  const body = source.slice(handlerStart, source.indexOf('}, [dismissSeatHud', handlerStart));
  const consumeIndex = body.indexOf('if (seatGesture.consumeDragClick()) return;');
  const dismissIndex = body.indexOf('dismissSeatHud();');
  const clearIndex = body.indexOf('clearSeatSelection();');

  assert.ok(consumeIndex >= 0, 'the plan must consume a seat drag release');
  assert.ok(dismissIndex > consumeIndex, 'the release must be consumed before the HUD is dismissed');
  assert.ok(clearIndex > consumeIndex, 'the release must be consumed before the active seat is cleared');

  assert.match(
    source.slice(handlerStart),
    /\}, \[dismissSeatHud, clearSeatSelection, seatGesture\]\);/,
    'the gesture authority must be held in the handler dependency array'
  );
});

test('the plan reads the drag answer from the gesture object it already receives', () => {
  const { api } = harness();
  assert.equal(
    typeof api.seatGesture.consumeDragClick,
    'function',
    'the seat gesture must carry its own drag answer, so the plan needs no second hook result'
  );
});