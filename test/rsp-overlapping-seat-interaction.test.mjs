import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { transform } from 'esbuild';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const require = createRequire(import.meta.url);
async function loadComponent(path) {
  let source = await readFile(new URL('../' + path, import.meta.url), 'utf8');
  source = source.replace(/from ["']react["']/g, 'from ' + JSON.stringify(pathToFileURL(require.resolve('react')).href));
  source = source.replace(/import RvSeatRowLabels[^;]+;/, 'const RvSeatRowLabels = () => null;');
  const { code } = await transform(source, { loader: 'jsx', format: 'esm', jsx: 'transform' });
  return (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).default;
}
const Marker = await loadComponent('src/components/room/rv/render/RvMlpMarker.jsx');
const SeatLayer = await loadComponent('src/components/room/rv/render/RvSeatLayer.jsx');

function pointer(x, y) {
  return { clientX: 40 + x, clientY: 80 + y, preventDefault() {}, stopPropagation() {} };
}

// A seat at (2.25, 5.5) and the RSP dot either on it or well clear of it.
function renderLayer(rsp, scale = 100) {
  let renderer;
  act(() => {
    renderer = TestRenderer.create(React.createElement(SeatLayer, {
      seatingPositions: [{ id: 'r2s2', x: 2.25, y: 5.5 }],
      scale,
      toPx: (x, y) => [x * scale, y * scale],
      handleMouseDown() {},
      handleSeatClick() {},
      seatGesture: { onSeatPointerDown() {} },
      MLPMarker: React.createElement(Marker, {
        toPx: (x, y) => [x * scale, y * scale],
        mlpDotX_m: rsp.x, mlpDotY_m: rsp.y, grabbed: false,
      }),
    }));
  });
  return renderer;
}

const marker = (renderer) => renderer.root.findByProps({ 'data-testid': 'mlp-marker' });
const hitTarget = (renderer) => renderer.root.findAllByType('circle')[0];
const seatTarget = (renderer) => renderer.root.findAllByType('ellipse')[0];

test('the RSP on a seat is out of the pointer path at every scale — the seat keeps the click', () => {
  for (const scale of [77, 36, 140]) {
    const renderer = renderLayer({ x: 2.25, y: 5.5 }, scale);
    assert.equal(marker(renderer).props.style.pointerEvents, 'none', `marker group at scale ${scale}`);
    assert.equal(hitTarget(renderer).props.pointerEvents, 'none', `marker grab target at scale ${scale}`);
    assert.equal(typeof seatTarget(renderer).props.onPointerDown, 'function', `seat gesture at scale ${scale}`);
    act(() => renderer.unmount());
  }
});

test('a floating RSP keeps its own placement gesture', () => {
  const renderer = renderLayer({ x: 2.25, y: 1.2 });
  assert.notEqual(marker(renderer).props.style.pointerEvents, 'none', 'marker stays reachable off the seats');
  assert.equal(hitTarget(renderer).props.pointerEvents, 'all');
  act(() => renderer.unmount());
});

test('the seat click is consumed by the seat, and the marker offers no seat-selection path', () => {
  const renderer = renderLayer({ x: 2.25, y: 5.5 });

  const seat = seatTarget(renderer).props;
  assert.equal(typeof seat.onPointerDown, 'function', 'the seat starts the gesture');
  assert.equal(typeof seat.onClick, 'function', 'the seat keeps its click off the plan background');
  let stopped = 0;
  seat.onClick({ stopPropagation() { stopped += 1; } });
  assert.equal(stopped, 1, 'the seat click does not reach the background dismiss handler');

  const hit = hitTarget(renderer).props;
  assert.equal(hit.onDoubleClick, undefined, 'no double-click routing through the RSP remains');
  assert.equal(hit.onClick, undefined, 'the RSP has no click action of its own over a seat');

  act(() => renderer.unmount());
});

test('short click never moves the RSP; a 3 s hold activates; placement never opens a seat', () => {
  const originalSet = globalThis.setTimeout;
  const originalClear = globalThis.clearTimeout;
  const timers = new Map();
  let timerId = 0;
  globalThis.setTimeout = (fn, delay) => { const id = ++timerId; timers.set(id, { fn, delay }); return id; };
  globalThis.clearTimeout = id => timers.delete(id);
  let renderer;
  try {
    const activations = [], placements = [];
    const props = {
      toPx: (x, y) => [x, y], mlpDotX_m: 2.25, mlpDotY_m: 5.5, grabbed: false,
      onLongPressActivate: (...xy) => activations.push(xy),
      onPlaceClick: e => placements.push(e),
    };
    act(() => { renderer = TestRenderer.create(React.createElement(Marker, props)); });
    const hit = () => hitTarget(renderer).props;
    const e = pointer(2.25, 5.5);

    act(() => hit().onPointerDown(e));
    assert.equal([...timers.values()][0].delay, 3000, 'the RSP hold is unchanged at 3 s');
    act(() => hit().onPointerUp(e));
    assert.equal(timers.size, 0, 'a short click cancels the hold');
    assert.equal(activations.length, 0);
    assert.equal(placements.length, 0);

    act(() => hit().onPointerDown(e));
    const hold = [...timers.values()][0];
    timers.clear();
    act(() => hold.fn());
    assert.deepEqual(activations, [[2.25, 5.5]], 'the hold activates the free-move state');

    act(() => renderer.update(React.createElement(Marker, { ...props, grabbed: true })));
    act(() => hit().onPointerDown(e));
    assert.equal(placements.length, 1, 'a click while grabbed places the RSP');

    act(() => renderer.update(React.createElement(Marker, props)));
    act(() => hit().onPointerDown(e));
    act(() => hit().onPointerCancel(e));
    assert.equal(timers.size, 0);
    act(() => hit().onPointerDown(e));
    act(() => hit().onPointerLeave(e));
    assert.equal(timers.size, 0);
  } finally {
    if (renderer) act(() => renderer.unmount());
    globalThis.setTimeout = originalSet;
    globalThis.clearTimeout = originalClear;
  }
});