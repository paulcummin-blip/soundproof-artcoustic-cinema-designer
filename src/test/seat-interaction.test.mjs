// seat-interaction.test.mjs
// ---------------------------------------------------------------------------
// The seat is the interactive object in Plan View and the RSP is status only.
//
//   TEST 1  A single click opens that seat's HUD — no select step, no second click
//   TEST 2  Clicking another seat opens that seat's HUD directly
//   TEST 3  A drag moves the seat and never opens the HUD on release
//   TEST 4  A hold holds the guides and still opens the HUD on release
//   TEST 5  The seat click never reaches the plan background that dismisses the HUD
//   TEST 6  No second-click timer survives, and the HUD pin never toggles off
//   TEST 7  The RSP on a seat is out of the pointer path — the seat keeps the click
//   TEST 8  A floating RSP keeps its own placement gesture
// ---------------------------------------------------------------------------
import { test, afterEach, vi } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  useSeatGesture,
  SEAT_DRAG_THRESHOLD_PX,
  SEAT_LONG_PRESS_MS,
} from '../components/room/rv/hooks/useSeatGesture.jsx';
import RvSeatLayer from '../components/room/rv/render/RvSeatLayer.jsx';
import RvMlpMarker from '../components/room/rv/render/RvMlpMarker.jsx';

const GESTURE_SRC = fs.readFileSync('src/components/room/rv/hooks/useSeatGesture.jsx', 'utf8');
const HOVER_SRC = fs.readFileSync('src/components/room/rv/hooks/useSeatHoverLogic.jsx', 'utf8');
const SEAT_LAYER_SRC = fs.readFileSync('src/components/room/rv/render/RvSeatLayer.jsx', 'utf8');

// The gesture hook registers plain window pointer listeners, so the interaction
// model is driven end to end here with a listener registry instead of a DOM.
function mountGesture() {
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
    });
    return null;
  }
  renderToStaticMarkup(React.createElement(Harness));

  const fire = (type, event = {}) => listeners[type].slice().forEach((fn) => fn(event));
  const down = (seat, clientX = 100, clientY = 100) => gesture.seatGesture.onSeatPointerDown({
    pointerType: 'mouse',
    button: 0,
    clientX,
    clientY,
    pointerId: 1,
    preventDefault() {},
    stopPropagation() {},
  }, seat);

  return { gesture, calls, fire, down };
}

afterEach(() => {
  delete globalThis.window;
  vi.useRealTimers();
});

test('TEST 1 — a single click opens that seat HUD, with no select step and no second click', () => {
  const { calls, fire, down } = mountGesture();

  down({ id: 'seat-a', x: 1, y: 1 });
  fire('pointerup');

  assert.deepEqual(calls.opened, ['seat-a'], 'the release itself opened the seat HUD');
  assert.deepEqual(calls.dragged, [], 'a click without movement is not a drag');
});

test('TEST 2 — clicking another seat opens that seat HUD directly', () => {
  const { calls, fire, down } = mountGesture();

  down({ id: 'seat-a' });
  fire('pointerup');
  down({ id: 'seat-b' });
  fire('pointerup');

  assert.deepEqual(calls.opened, ['seat-a', 'seat-b'], 'the HUD switched straight to the second seat');
});

test('TEST 3 — a drag moves the seat and never opens the HUD on release', () => {
  const { calls, fire, down } = mountGesture();

  down({ id: 'seat-a' }, 100, 100);
  fire('pointermove', { clientX: 100 + SEAT_DRAG_THRESHOLD_PX + 10, clientY: 100 });

  assert.deepEqual(calls.dragged, [{ seatId: 'seat-a', kind: 'seat' }], 'movement past the threshold dragged the seat');

  fire('pointerup');

  assert.deepEqual(calls.opened, [], 'releasing after a drag did not also open the HUD');
});

test('TEST 4 — a hold holds the guides and still opens the HUD on release', () => {
  vi.useFakeTimers();
  const { calls, fire, down } = mountGesture();

  down({ id: 'seat-a' });
  vi.advanceTimersByTime(SEAT_LONG_PRESS_MS + 10);
  fire('pointerup');

  assert.deepEqual(calls.opened, ['seat-a'], 'a hold never withholds the seat HUD');
});

test('TEST 5 — the seat click never reaches the plan background that dismisses the HUD', () => {
  assert.match(
    SEAT_LAYER_SRC,
    /onPointerDown: \(e\) => seatGesture\.onSeatPointerDown\(e, seat\),[\s\S]{0,240}?onClick: \(e\) => e\.stopPropagation\(\)/,
    'the seat hit target must start the gesture and keep its own click off the plan background'
  );
});

test('TEST 6 — no second-click timer survives, and the HUD pin never toggles off', () => {
  assert.doesNotMatch(GESTURE_SRC, /DOUBLE_CLICK_MS/, 'no second-click window is timed');
  assert.doesNotMatch(GESTURE_SRC, /lastClickRef/, 'no click history is kept');
  assert.match(
    GESTURE_SRC,
    /if \(active\.dragStarted\) return;[\s\S]{0,260}?handleSeatClick\(active\.seat\)/,
    'every release that did not drag opens the seat HUD'
  );

  assert.doesNotMatch(HOVER_SRC, /isAlreadyPinned/, 'the seat click no longer toggles the HUD closed');
  assert.match(HOVER_SRC, /setHudPinnedSeatId\(seat\.id\)/, 'the seat click opens that seat HUD');
});

const toPx = (x, y) => [x * 100, y * 100];

function renderSeatLayer(rsp) {
  return renderToStaticMarkup(React.createElement(RvSeatLayer, {
    seatingPositions: [{ id: 'seat-a', x: 1, y: 1 }],
    toPx,
    scale: 100,
    exportMode: 'clean',
    speakerPositionsView: 'plan',
    rowFrontWallLabelSeatIds: new Set(),
    rowDistanceLabelSeatIds: new Set(),
    _overlays: {},
    hudPinnedSeatId: null,
    handleMouseDown: () => {},
    handleSeatClick: () => {},
    seatGesture: { onSeatPointerDown: () => {} },
    selectedSeatId: null,
    dimensionSeatId: null,
    MLPMarker: React.createElement(RvMlpMarker, {
      toPx,
      mlpDotX_m: rsp.x,
      mlpDotY_m: rsp.y,
      _overlays: {},
      exportMode: 'clean',
      rspMode: 'auto_from_screen',
      grabbed: false,
    }),
  }));
}

// The marker group and its oversized grab target, read out of the rendered plan.
function markerMarkup(markup) {
  const rest = markup.slice(markup.indexOf('data-testid="mlp-marker"'));
  const hitStart = rest.indexOf('r="14"');
  return {
    group: rest.slice(0, rest.indexOf('>')),
    hit: rest.slice(hitStart, rest.indexOf('/>', hitStart)),
  };
}

test('TEST 7 — the RSP on a seat is out of the pointer path: the seat keeps the click', () => {
  const { group, hit } = markerMarkup(renderSeatLayer({ x: 1, y: 1 }));

  assert.match(group, /pointer-events:none/, 'the marker is status only while it sits on a seat');
  assert.match(hit, /pointer-events="none"/, 'the grab target cannot intercept the seat click or drag');
});

test('TEST 8 — a floating RSP keeps its own placement gesture', () => {
  const { group, hit } = markerMarkup(renderSeatLayer({ x: 1, y: 3 }));

  assert.doesNotMatch(group, /pointer-events:none/, 'the marker stays reachable when it floats clear of the seats');
  assert.match(hit, /pointer-events="all"/);
});